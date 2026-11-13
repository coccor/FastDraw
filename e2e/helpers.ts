import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
export const repoText = (p: string) => readFileSync(resolve(root, p), 'utf8');
export const repoBase64 = (p: string) => readFileSync(resolve(root, p)).toString('base64');

// The editor's folder mode, driven against the browser's private file store: the code after
// the folder picker is the same, and the picker itself cannot be automated.
export async function openFolder(page: Page, files: Record<string, string | { base64: string }>) {
  await page.goto('/?opfs=1');
  await page.waitForSelector('.welcome');
  await page.evaluate(async (entries) => {
    const rootDir = await navigator.storage.getDirectory();
    // @ts-expect-error entries() is not in the DOM types
    for await (const [n] of rootDir.entries()) await rootDir.removeEntry(n, { recursive: true });
    for (const [path, data] of Object.entries(entries)) {
      const parts = path.split('/');
      let dir = rootDir;
      for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg, { create: true });
      const f = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await f.createWritable();
      await w.write(typeof data === 'string' ? data : Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0)));
      await w.close();
    }
  }, files);
  await page.getByRole('button', { name: /Open a folder/ }).click();
  await page.waitForSelector('svg.canvas');
  await expect(page.locator('.status')).toHaveText('saved');
}

export async function diskText(page: Page, path: string): Promise<string> {
  return page.evaluate(async (p) => {
    const parts = p.split('/');
    let dir = await navigator.storage.getDirectory();
    for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
    return (await (await dir.getFileHandle(parts[parts.length - 1])).getFile()).text();
  }, path);
}

export async function writeDisk(page: Page, path: string, edit: string) {
  await page.evaluate(async ({ p, text }) => {
    const parts = p.split('/');
    let dir = await navigator.storage.getDirectory();
    for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
    const f = await dir.getFileHandle(parts[parts.length - 1]);
    const w = await f.createWritable(); await w.write(text); await w.close();
  }, { p: path, text: edit });
}

// Reload to an empty start screen: forget the diagrams the editor keeps in the browser.
export async function fresh(page: Page) {
  await page.evaluate(() => { indexedDB.deleteDatabase('fastdraw'); }); // finishes once this page's connection closes
  await page.goto('/');
  await page.waitForSelector('.welcome');
}

// Open pasted text in memory (drawn with the built-in look unless it names one).
export async function paste(page: Page, text: string) {
  await page.goto('/');
  await page.waitForSelector('.welcome');
  await page.getByRole('button', { name: /Paste diagram text/ }).click();
  await page.locator('.modal textarea').fill(text);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForSelector('svg.canvas');
}

// The diagram text as the editor currently holds it.
export const source = (page: Page) => page.evaluate(() => (window as unknown as { __fastdraw: { source: () => string } }).__fastdraw.source());
export const lineOf = (text: string, id: string) => text.split('\n').find((l) => l.startsWith(id + ':') || l.startsWith(id + ' ')) ?? '';
// Wait until saving has caught up with the last edit.
export const saved = (page: Page) => expect(page.locator('.status')).toHaveText('saved');

// Diagram coordinates to screen coordinates.
export async function at(page: Page, x: number, y: number) {
  return page.evaluate(({ x, y }) => {
    const m = (document.querySelector('svg.canvas > g') as SVGGElement).getScreenCTM()!;
    return { x: m.a * x + m.e, y: m.d * y + m.f };
  }, { x, y });
}
export async function zoom(page: Page) {
  return page.evaluate(() => (document.querySelector('svg.canvas > g') as SVGGElement).getScreenCTM()!.a);
}
// Corner of an element's hit box, away from any text drawn over its middle.
export async function corner(page: Page, id: string) {
  const b = (await page.locator(`rect[data-id="${id}"]`).first().boundingBox())!;
  return { x: b.x + 8, y: b.y + 8 };
}
export async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 3 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 3 });
  await page.mouse.up();
}
export async function doubleClick(page: Page, p: { x: number; y: number }) {
  await page.mouse.dblclick(p.x, p.y);
  await page.waitForSelector('.textedit');
}
export function noPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}
