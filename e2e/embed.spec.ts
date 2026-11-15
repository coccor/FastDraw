import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

// <fastdraw-diagram> on a docs page. The page (http://docs.test, e2e/embed/) and the site that serves embed.js
// and the editor (http://site.test, the built dist-editor/) are on different origins, as they are in use, so
// the CORS headers the site sends matter. Both are answered from disk by the browser context; no server runs.
const root = resolve(import.meta.dirname, '..');
const site = resolve(root, 'dist-editor'), docs = resolve(root, 'e2e/embed');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.txt': 'text/plain' };

test.beforeAll(() => {
  // the test runs against the built site; build it when it is missing
  if (!existsSync(resolve(site, 'embed.js'))) execSync('npm run build:editor', { cwd: root, stdio: 'inherit' });
});

async function serve(context: BrowserContext) {
  const answer = (dir: string, cors: boolean, spa: boolean) => async (route: Parameters<Parameters<BrowserContext['route']>[1]>[0]) => {
    let path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path.endsWith('/')) path += 'index.html';
    let file = resolve(dir, '.' + path);
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      if (path.endsWith('.png') && existsSync(resolve(root, 'assets/example.png'))) file = resolve(root, 'assets/example.png');
      else if (spa) file = resolve(dir, 'index.html'); // as Cloudflare does with single-page-application
      else return route.fulfill({ status: 404, body: 'not found' });
    }
    const headers: Record<string, string> = { 'Content-Type': TYPES[extname(file)] ?? 'text/plain' };
    if (cors) headers['Access-Control-Allow-Origin'] = '*';
    return route.fulfill({ status: 200, headers, body: readFileSync(file) });
  };
  // the site sends the CORS header only where _headers says it does
  const headersFile = readFileSync(resolve(site, '_headers'), 'utf8');
  const allowed = [...headersFile.matchAll(/^(\/\S*)\n\s+Access-Control-Allow-Origin: \*/gm)].map((m) => m[1]);
  const corsFor = (p: string) => allowed.some((a) => (a.endsWith('*') ? p.startsWith(a.slice(0, -1)) : p === a));
  await context.route('http://site.test/**', (route) => answer(site, corsFor(new URL(route.request().url()).pathname), true)(route));
  await context.route('http://docs.test/**', answer(docs, false, false));
}

const ready = async (page: Page, id: string) => { await expect(page.locator(`#${id}`)).toHaveAttribute('data-ready', ''); };
const zoom = (page: Page, id: string) => page.locator(`#${id}`).evaluate((el) => (el as unknown as { zoom: number }).zoom);
const viewBox = (page: Page, id: string) => page.locator(`#${id} .view svg`).getAttribute('viewBox');
const paper = (page: Page, id: string) => page.locator(`#${id} rect.fd-page`).first().getAttribute('fill');

test.beforeEach(async ({ context }) => { await serve(context); });

test('draws the diagram as an SVG in place of its image', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://docs.test/');
  await ready(page, 'good');
  const svg = page.locator('#good .view svg');
  await expect(svg).toBeVisible();
  await expect(svg.locator('text', { hasText: 'Orders API' })).toHaveCount(1);
  await expect(page.locator('#good img')).toBeHidden();
  // the element is as wide as the column, its height from the diagram's proportions
  const box = (await page.locator('#good').boundingBox())!;
  const [, , w, h] = (await viewBox(page, 'good'))!.split(' ').map(Number);
  expect(Math.abs(box.width / box.height - w / h)).toBeLessThan(0.02);
  // a look file next to the diagram is found relative to the .fdraw file; max-height caps the element
  await ready(page, 'teamed');
  expect(await page.locator('#teamed .view svg').innerHTML()).toContain('#0d9488');
  expect((await page.locator('#teamed').boundingBox())!.height).toBeLessThanOrEqual(181);
  // the fonts came from the site, across origins
  expect(await page.evaluate(() => document.fonts.check("13px 'Geist'"))).toBe(true);
  expect(errors).toEqual([]);
});

test('the toolbar and the keys zoom; a plain wheel scrolls the page', async ({ page }) => {
  await page.goto('http://docs.test/');
  await ready(page, 'good');
  const frame = page.locator('#good');
  const k0 = await zoom(page, 'good');
  await frame.hover();
  await page.getByRole('button', { name: 'Zoom in' }).first().click();
  await expect.poll(() => zoom(page, 'good')).toBeGreaterThan(k0 * 1.3);
  const k1 = await zoom(page, 'good');
  await page.getByRole('button', { name: 'Zoom out' }).first().click();
  await expect.poll(() => zoom(page, 'good')).toBeLessThan(k1);
  await page.getByRole('button', { name: 'Fit to view' }).first().click();
  await expect.poll(() => zoom(page, 'good')).toBeCloseTo(k0, 3);
  // keys, with the diagram focused
  await page.locator('#good .view').focus();
  await page.keyboard.press('+');
  await expect.poll(() => zoom(page, 'good')).toBeGreaterThan(k0 * 1.3);
  // drag to pan
  const before = await viewBox(page, 'good');
  const b = (await frame.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 80, b.y + b.height / 2 - 30, { steps: 4 });
  await page.mouse.up();
  expect(await viewBox(page, 'good')).not.toBe(before);
  // double-click goes back to the whole diagram
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await expect.poll(() => zoom(page, 'good')).toBeCloseTo(k0, 3);
  await page.keyboard.press('0');
  // a plain wheel scrolls the page and leaves the zoom alone; Ctrl+wheel zooms
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(await zoom(page, 'good')).toBeCloseTo(k0, 3);
  const nb = (await frame.boundingBox())!;
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect.poll(() => zoom(page, 'good')).toBeGreaterThan(k0 * 1.2);
});

test('follows the page into dark mode, drawn in the night look', async ({ page }) => {
  await page.goto('http://docs.test/');
  await ready(page, 'good');
  const light = await paper(page, 'good');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await expect.poll(() => paper(page, 'good')).not.toBe(light);
  // night's page is dark
  const fill = (await paper(page, 'good'))!;
  const [r, g, bl] = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
  expect(r + g + bl).toBeLessThan(150);
  // a look with no dark counterpart stays as it is
  expect(await page.locator('#teamed .view svg').innerHTML()).toContain('#0d9488');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await expect.poll(() => paper(page, 'good')).toBe(light);
  // theme="light" holds whatever the page does
  await page.locator('#good').evaluate((el) => el.setAttribute('theme', 'light'));
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForTimeout(300);
  expect(await paper(page, 'good')).toBe(light);
});

test('a file that is missing or has errors keeps its image, and says why in the console', async ({ page }) => {
  const logged: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
  await page.goto('http://docs.test/');
  await ready(page, 'good');
  await expect.poll(() => logged.join('\n')).toContain('missing.fdraw');
  await expect.poll(() => logged.join('\n')).toContain('broken.fdraw');
  for (const id of ['missing', 'broken']) {
    await expect(page.locator(`#${id} img`)).toBeVisible();
    await expect(page.locator(`#${id} .frame`)).toBeHidden();
    expect((await page.locator(`#${id} img`).boundingBox())!.height).toBeGreaterThan(50);
  }
});

test('"Open in FastDraw" opens the same diagram in the editor', async ({ page, context }) => {
  await page.goto('http://docs.test/');
  await ready(page, 'teamed');
  await page.locator('#teamed').hover();
  const [editor] = await Promise.all([context.waitForEvent('page'), page.locator('#teamed').getByRole('link', { name: 'Open in FastDraw' }).click()]);
  await editor.waitForSelector('svg.canvas');
  const text = await editor.evaluate(() => (window as unknown as { __fastdraw: { source: () => string } }).__fastdraw.source());
  expect(text).toBe(readFileSync(resolve(docs, 'diagrams/teamed.fdraw'), 'utf8'));
  // with the look file it came with, and the hash is gone so a reload does not open it again
  expect(await editor.locator('svg.canvas').innerHTML()).toContain('#0d9488');
  expect(new URL(editor.url()).hash).toBe('');
  await expect(editor.getByText('teamed', { exact: true }).first()).toBeVisible();
});
