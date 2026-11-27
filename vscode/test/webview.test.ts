// The preview page in a real browser, with a stand-in for the VS Code API: a click finds the element's line,
// the cursor line is outlined, and the zoom buttons work.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { draw } from '../src/core.ts';

const media = join(dirname(fileURLToPath(import.meta.url)), '..', 'media');
const dir = mkdtempSync(join(tmpdir(), 'fastdraw-webview-'));
const file = join(dir, 'd.fdraw');
const SRC = `api: focal "Orders API" at 40,60
db: store "Orders DB" at 300,56

api -> db "writes"
`;
writeFileSync(file, SRC);

// the page the extension writes, with its toolbar, minus the policy and the webview addresses
const PAGE = `<!doctype html><html><head><style>${readFileSync(join(media, 'preview.css'), 'utf8')}</style><style id="faces"></style></head><body>
<div class="bar"><button id="out">−</button><button id="zoom">100%</button><button id="in">+</button><button id="fit">Fit</button>
<span id="note" hidden></span><span class="sep"></span><button id="problems" hidden></button><button id="source">Source</button><button id="edit">Open in editor</button></div>
<div id="stage"><div id="canvas"></div></div>
<script>window.posted = []; window.acquireVsCodeApi = () => ({ postMessage: (m) => posted.push(m), getState: () => undefined, setState: () => {} });</script>
<script>${readFileSync(join(media, 'preview.js'), 'utf8')}</script></body></html>`;

let browser: Browser, page: Page;
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  await page.setContent(PAGE);
  const d = draw(file, SRC);
  await page.evaluate((m) => window.postMessage(m, '*'), { type: 'draw', uri: 'file:///d.fdraw', svg: d.svg, hits: d.hits, faces: '', problems: { errors: 0, warns: 1 }, note: '', dark: false });
  await page.waitForSelector('#canvas svg');
});
after(() => browser?.close());

// the page position of a point in the diagram's own units
const at = (x: number, y: number) => page.evaluate(([x, y]) => {
  const s = document.querySelector('#canvas svg') as SVGSVGElement;
  const p = s.createSVGPoint(); p.x = x; p.y = y;
  const q = p.matrixTransform(s.getScreenCTM()!);
  return { x: q.x, y: q.y };
}, [x, y]);

test('posts ready, then a click on a box or a line posts its line', async () => {
  const d = draw(file, SRC);
  const db = d.hits.find((h) => h.line === 2)!, conn = d.hits.find((h) => h.line === 4)!;
  let p = await at(db.x + db.w / 2, db.y + db.h / 2);
  await page.mouse.click(p.x, p.y);
  const [a, b] = conn.pts!;
  p = await at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  await page.mouse.click(p.x, p.y);
  p = await at(d.hits[0].x - 30, d.hits[0].y - 30); // empty canvas
  await page.mouse.click(p.x, p.y);
  const posted = await page.evaluate(() => (window as unknown as { posted: unknown[] }).posted);
  assert.deepEqual(posted, [{ type: 'ready' }, { type: 'reveal', line: 2 }, { type: 'reveal', line: 4 }]);
});

test('the cursor line is outlined, and only it', async () => {
  await page.evaluate(() => window.postMessage({ type: 'cursor', line: 1 }, '*'));
  await page.waitForFunction(() => document.querySelectorAll('.fd-mark').length === 1);
  await page.evaluate(() => window.postMessage({ type: 'cursor', line: 3 }, '*'));
  await page.waitForFunction(() => document.querySelectorAll('.fd-mark').length === 0);
});

test('fit fills the view; zoom buttons and 100% change the scale', async () => {
  const width = () => page.evaluate(() => +document.querySelector('#canvas svg')!.getAttribute('width')!);
  const fitted = await width();
  assert.ok(fitted > 600, `fitted width ${fitted}`);
  await page.click('#zoom');
  assert.equal(await page.textContent('#zoom'), '100%');
  const actual = await width();
  // 100% draws a unit at 1.25pt, 5/3 of a CSS pixel, as the editor does
  const units = await page.evaluate(() => (document.querySelector('#canvas svg') as SVGSVGElement).viewBox.baseVal.width);
  assert.equal(actual, Math.round(units * 5 / 3));
  await page.click('#in');
  assert.equal(await page.textContent('#zoom'), '125%');
  assert.equal(await width(), Math.round(units * 5 / 3 * 1.25));
  await page.click('#fit');
  assert.equal(await width(), fitted);
  assert.equal(await page.textContent('#problems'), '1 warning');
});

test('Source asks for the text', async () => {
  await page.click('#source');
  const posted = await page.evaluate(() => (window as unknown as { posted: { type: string }[] }).posted);
  assert.deepEqual(posted.at(-1), { type: 'source' });
});

test('Fit stops at twice an exported SVG\'s size, so a small diagram is not blown up', async () => {
  const small = join(dir, 'small.fdraw'), text = 'a: node "A" at 40,40\n';
  writeFileSync(small, text);
  const d = draw(small, text);
  await page.evaluate((m) => window.postMessage(m, '*'), { type: 'draw', uri: 'file:///small.fdraw', svg: d.svg, hits: d.hits, faces: '', problems: { errors: 0, warns: 0 }, note: '', dark: false });
  await page.waitForFunction(() => document.querySelector('#canvas svg')?.getAttribute('viewBox')?.endsWith('224 144'));
  await page.click('#fit');
  const [width, units] = await page.evaluate(() => { const s = document.querySelector('#canvas svg') as SVGSVGElement; return [+s.getAttribute('width')!, s.viewBox.baseVal.width]; });
  assert.equal(width, Math.round(units * 2 * 4 / 3)); // two points per unit: 160% on the zoom's scale
  assert.equal(await page.textContent('#zoom'), '160%');
});
