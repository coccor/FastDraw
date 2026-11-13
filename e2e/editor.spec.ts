import { test, expect } from '@playwright/test';
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serveFolder } from '../src/serve.ts';
import { openFolder, diskText, writeDisk, paste, source, lineOf, saved, at, corner, drag, doubleClick, noPageErrors, repoText, repoBase64, zoom, fresh } from './helpers.ts';

const SEQ = 'examples/test/sequence.fdraw';
const folder = () => ({ [SEQ]: repoText(SEQ), 'looks/reference.look': repoText('looks/reference.look') });
const SMALL = 'canvas 900x420\nuser: external "Shopper" at 40,160\napi: focal "Orders API" sub="REST" at 280,160\ndb: store "Orders DB" at 560,156\nuser -> api "HTTPS" style=link\nr: api -> db "writes" style=primary\n';

test('dragging a participant saves two lines, and its lifeline, bar and messages follow', async ({ page }) => {
  const errors = noPageErrors(page);
  await openFolder(page, folder());
  const before = await diskText(page, SEQ);
  const k = await zoom(page);
  await drag(page, await corner(page, 'origin'), 60 * k, 0);
  await saved(page);
  const after = await diskText(page, SEQ);
  const changed = after.split('\n').filter((l, i) => l !== before.split('\n')[i]);
  expect(changed.map((l) => l.split(':')[0]).sort()).toEqual(['origin', 'origin_bar']);
  expect(lineOf(after, 'origin')).toContain('at 600,96');
  expect(lineOf(after, 'origin_bar')).toContain('at 668,268');
  await expect(page.locator('.problems')).toHaveText('No problems');
  expect(errors).toEqual([]);
});

test('double-click edits the text of a box and of an arrow label', async ({ page }) => {
  await openFolder(page, folder());
  await doubleClick(page, await corner(page, 'reader'));
  await page.keyboard.type('Visitor');
  await page.keyboard.press('Enter');
  await saved(page);
  expect(lineOf(await diskText(page, SEQ), 'reader')).toContain('"Visitor"');
  const label = (await page.locator('rect[data-label]').first().boundingBox())!;
  await doubleClick(page, { x: label.x + label.width / 2, y: label.y + label.height / 2 });
  await page.keyboard.type('fetch page');
  await page.keyboard.press('Enter');
  await saved(page);
  expect(await diskText(page, SEQ)).toContain('"fetch page"');
});

test('text is edited in place: the field takes the label\'s type and position, and the drawn label hides', async ({ page }) => {
  await paste(page, SMALL);
  const label = page.locator('svg.canvas text', { hasText: 'Orders API' }).first();
  const drawn = await label.evaluate((t) => { const cs = getComputedStyle(t); return { weight: cs.fontWeight, colour: cs.fill }; });
  const before = (await label.boundingBox())!;
  await doubleClick(page, { x: before.x + before.width / 2, y: before.y + before.height / 2 });
  const field = page.locator('.textedit.inplace');
  await expect(field).toBeVisible();
  const look = await field.evaluate((t) => { const cs = getComputedStyle(t); return { weight: cs.fontWeight, colour: cs.color, bg: cs.backgroundColor, border: cs.borderTopWidth }; });
  expect(look).toEqual({ weight: drawn.weight, colour: drawn.colour, bg: 'rgba(0, 0, 0, 0)', border: '0px' });
  await expect(label).toHaveCSS('visibility', 'hidden');
  const box = (await field.boundingBox())!;
  expect(Math.abs(box.y + box.height / 2 - (before.y + before.height / 2))).toBeLessThan(4);
  await page.keyboard.press('Escape');
  await expect(label).toHaveCSS('visibility', 'visible');
});

test('a line label grows around its text while typing, and Escape puts the old one back', async ({ page }) => {
  await paste(page, SMALL);
  const hit = page.locator('rect[data-label]').last();
  const before = (await hit.boundingBox())!;
  await doubleClick(page, { x: before.x + before.width / 2, y: before.y + before.height / 2 });
  await page.keyboard.press('End');
  await page.keyboard.type(' every order to the database');
  const grown = (await hit.boundingBox())!;
  expect(grown.width).toBeGreaterThan(before.width * 2);
  const field = (await page.locator('.textedit.inplace').boundingBox())!;
  expect(field.x).toBeGreaterThanOrEqual(grown.x - 1);
  expect(field.x + field.width).toBeLessThanOrEqual(grown.x + grown.width + 4);
  await page.keyboard.press('Escape');
  expect((await hit.boundingBox())!.width).toBeCloseTo(before.width, 0);
});

test('an outside change to the file appears on the canvas, and undo brings the old text back', async ({ page }) => {
  await openFolder(page, folder());
  const text = await diskText(page, SEQ);
  await writeDisk(page, SEQ, text + 'agentbox: node "Added by agent" at 780,560\n');
  await expect(page.locator('rect[data-id="agentbox"]')).toHaveCount(1, { timeout: 4000 });
  await expect(page.locator('.status')).toHaveText('updated from disk');
  await page.keyboard.press('Control+z');
  await expect(page.locator('rect[data-id="agentbox"]')).toHaveCount(0);
});

test('draw a rectangle, connect to it, then undo both', async ({ page }) => {
  await paste(page, SMALL);
  await page.keyboard.press('r');
  await drag(page, await at(page, 300, 300), 140, 80);
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^rect: rect at 300,300 \d+x\d+$/);
  await page.keyboard.press('a');
  const from = await corner(page, 'user'), to = await at(page, 330, 320);
  await drag(page, from, to.x - from.x, to.y - from.y);
  expect((await source(page)).trim().split('\n').pop()).toBe('arrow: user -> rect');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await source(page)).toBe(SMALL);
  await page.keyboard.press('Control+Shift+z');
  expect(await source(page)).toContain('rect: rect at 300,300');
});

test('while dragging a new shape, the real shape is drawn, and dropping it places what was shown', async ({ page }) => {
  await paste(page, SMALL);
  const body = page.locator('svg.canvas > g > g').first();
  for (const [key, style, mark] of [['o', 'ellipse', 'ellipse'], ['d', 'diamond', 'polygon, path']] as const) {
    const before = await source(page);
    const marks = await body.locator(mark).count();
    await page.keyboard.press(key);
    const from = await at(page, 300, 300), to = await at(page, 440, 380);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await expect(page.locator(`svg.canvas rect[data-id="${style}"]`)).toHaveCount(1); // the preview is in the drawn scene
    expect(await body.locator(mark).count()).toBeGreaterThan(marks);
    expect(await source(page)).toBe(before); // nothing is saved until the drop
    await page.mouse.up();
    expect((await source(page)).trim().split('\n').pop()).toBe(`${style}: ${style} at 300,300 140x80`);
    await page.keyboard.press('Control+z');
  }
  expect(await source(page)).toBe(SMALL);
});

test('resize, nudge, duplicate and delete', async ({ page }) => {
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'user')) as [number, number]);
  const k = await zoom(page);
  const h = (await page.locator('[data-handle="se"]').boundingBox())!;
  await drag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, 40 * k, 20 * k);
  expect(lineOf(await source(page), 'user')).toContain('at 40,160 184x84');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  expect(lineOf(await source(page), 'user')).toContain('at 36,156');
  await page.keyboard.press('Control+d');
  expect((await source(page)).trim().split('\n').pop()).toContain('user2: external "Shopper" at 60,180 184x84');
  await page.keyboard.press('Delete');
  expect(await source(page)).not.toContain('user2');
  // deleting a box takes the arrows attached to it
  await page.mouse.click(...Object.values(await corner(page, 'api')) as [number, number]);
  await page.keyboard.press('Delete');
  const text = await source(page);
  expect(text).not.toContain('api');
  expect(text).toContain('db: store');
});

test('resize from an edge, and Shift keeps the proportions', async ({ page }) => {
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'user')) as [number, number]);
  const k = await zoom(page);
  const mid = async (c: string) => { const b = (await page.locator(`[data-handle="${c}"]:not([data-strip])`).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // the east handle only widens the box
  await drag(page, await mid('e'), 40 * k, 20 * k);
  expect(lineOf(await source(page), 'user')).toContain('at 40,160 184x64');
  // anywhere along the bottom edge, not only its middle handle, makes it taller
  const strip = (await page.locator('[data-handle="s"][data-strip]').boundingBox())!;
  await drag(page, { x: strip.x + strip.width * 0.2, y: strip.y + strip.height / 2 }, 0, 28 * k);
  expect(lineOf(await source(page), 'user')).toContain('at 40,160 184x92');
  // Shift on a corner scales both sides by the same factor (184x92 -> 200x100), anchored at the top-left
  await page.keyboard.down('Shift');
  await drag(page, await mid('se'), 16 * k, 0);
  await page.keyboard.up('Shift');
  expect(lineOf(await source(page), 'user')).toContain('at 40,160 200x100');
  // Shift on an edge scales the other side to match, keeping the box centred across it
  await page.keyboard.down('Shift');
  await drag(page, await mid('s'), 0, 20 * k);
  await page.keyboard.up('Shift');
  expect(lineOf(await source(page), 'user')).toContain('at 20,160 240x120');
});

test('panel: restyle, switch style, and the components gallery places shapes and lines', async ({ page }) => {
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'user')) as [number, number]);
  await page.locator('.panel .swatch[title="accent/0.08"]').click();
  await page.locator('.panel button[title="Dotted"]').click();
  expect(lineOf(await source(page), 'user')).toMatch(/fill=accent\/0\.08 dash=1,4$/);
  await page.locator('.panel select').first().selectOption('cloud');
  expect(lineOf(await source(page), 'user')).toMatch(/^user: cloud /);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Components' }).click();
  await expect(page.locator('.thumbcard').first()).toBeVisible();
  await page.locator('.thumbcard', { hasText: 'optional' }).first().click();
  await expect(page.locator('.hintbar')).toContainText('Click or drag');
  const spot = await at(page, 700, 340);
  await page.mouse.click(spot.x, spot.y);
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^optional: optional at \d+,\d+$/);
  await page.locator('.toolbar .wide.lookstyles').click();
  await page.locator('.thumbcard', { hasText: 'return' }).first().click();
  const from = await corner(page, 'optional'), to = await corner(page, 'db');
  await drag(page, from, to.x - from.x, to.y - from.y);
  expect((await source(page)).trim().split('\n').pop()).toBe('arrow: optional -> db style=return');
});

test('tool lock keeps the tool, hand tool pans, right-click menu acts on the element', async ({ page }) => {
  await paste(page, SMALL);
  await page.getByRole('button', { name: 'Keep tool active' }).click();
  await page.keyboard.press('o');
  await drag(page, await at(page, 60, 300), 80, 50);
  await drag(page, await at(page, 200, 300), 80, 50);
  expect((await source(page)).match(/ellipse/g)!.length).toBe(4); // two statements, id and style each
  await page.getByRole('button', { name: 'Keep tool active' }).click();
  await page.keyboard.press('h');
  const before = await at(page, 0, 0);
  await drag(page, { x: 900, y: 600 }, 50, 30);
  const after = await at(page, 0, 0);
  expect(Math.round(after.x - before.x)).toBe(50);
  await page.keyboard.press('v');
  const c = await corner(page, 'db');
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await page.getByRole('menuitem', { name: /Duplicate/ }).click();
  expect(await source(page)).toContain('db2: store "Orders DB"');
});

test('legend from the menu, editable entries, grouping selects together', async ({ page }) => {
  await paste(page, SMALL);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Add a legend' }).click();
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^legend: legend at 40,\d+ external=.* focal=.* store=.* link=.* primary=/);
  const field = page.locator('.panel .field', { hasText: 'focal' }).locator('input');
  await field.fill('The service this is about');
  await field.press('Enter');
  expect(await source(page)).toContain('focal="The service this is about"');
  await field.fill('');
  await field.press('Enter');
  expect(lineOf(await source(page), 'legend')).not.toContain('focal=');
  await page.keyboard.press('Escape');
  await page.mouse.click(...Object.values(await corner(page, 'user')) as [number, number]);
  await page.keyboard.down('Shift');
  await page.mouse.click(...Object.values(await corner(page, 'api')) as [number, number]);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+g');
  expect((await source(page)).match(/group=g1/g)!.length).toBe(2);
  await page.keyboard.press('Escape');
  await page.mouse.click(...Object.values(await corner(page, 'user')) as [number, number]);
  await expect(page.locator('svg.canvas g[stroke="var(--accent)"] > rect')).toHaveCount(2);
  await page.keyboard.press('Control+Shift+g');
  expect(await source(page)).not.toContain('group=');
});

test('an exported PNG reopens as the same diagram; a foreign image is refused with a reason', async ({ page }) => {
  await paste(page, SMALL);
  await page.getByRole('button', { name: 'Menu' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Export image/ }).click().then(() => page.getByRole('button', { name: 'Download' }).click())]);
  expect(dl.suggestedFilename()).toBe('pasted-diagram.png');
  const bytes = (await import('node:fs')).readFileSync(await dl.path()).toString('base64');
  const drop = (name: string, b64: string) => page.evaluate(({ name, b64 }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name, b64 });
  await fresh(page);
  await drop('from-wiki.png', bytes);
  await page.waitForSelector('svg.canvas');
  expect(await source(page)).toBe(SMALL);
  await expect(page.locator('.filechip b')).toHaveText('from-wiki.fdraw');
  await drop('photo.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
  await expect(page.locator('.status')).toContainText('was not exported from FastDraw');
});

test('export options: scale, see-through background, leaving the diagram out, SVG, and they are remembered', async ({ page }) => {
  const fs = await import('node:fs');
  await paste(page, SMALL);
  await page.keyboard.press('Control+Shift+E');
  const dlg = page.getByRole('dialog', { name: 'Export image' });
  await expect(dlg.locator('.exportsize')).toHaveText('pasted-diagram.png · 1488 × 296 px');
  await dlg.getByRole('button', { name: '3×' }).click();
  await dlg.getByLabel(/Page colour and dots/).uncheck();
  await dlg.getByLabel(/Carry the diagram/).uncheck();
  await expect(dlg.locator('.exportsize')).toHaveText('pasted-diagram.png · 2232 × 444 px');
  await expect(dlg.locator('.exportpreview')).toHaveClass(/checker/);
  const [png] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Download' }).click()]);
  const b = fs.readFileSync(await png.path());
  expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([2232, 444]);
  expect(b.includes('fastdraw-source')).toBe(false);
  // the corner of the page is see-through, not the paper colour
  const alpha = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0); return g.getImageData(2, 2, 1, 1).data[3];
  }, b.toString('base64'));
  expect(alpha).toBe(0);
  await expect(page.locator('.status')).toContainText('exported pasted-diagram.png');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /Export image/ }).click();
  await expect(dlg.getByRole('button', { name: '3×' })).toHaveAttribute('aria-pressed', 'true'); // the last choices come back
  await dlg.getByLabel(/Carry the diagram/).check();
  await dlg.getByRole('button', { name: 'SVG' }).click();
  await expect(dlg.getByRole('button', { name: '3×' })).toBeDisabled();
  const [svg] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Download' }).click()]);
  expect(svg.suggestedFilename()).toBe('pasted-diagram.svg');
  const text = fs.readFileSync(await svg.path(), 'utf8');
  expect(text).toContain('<metadata id="fastdraw-source">');
  expect(text).not.toContain('fd-page');
  await expect(dlg).toHaveCount(0);
});

test('routing by hand: drag a run, slide an end, drag the label, reset, and stale routes are dropped', async ({ page }) => {
  await paste(page, 'canvas 880x420\na: node "Client" at 40,160\nm: node "In the way" at 280,160\nb: focal "Target" at 560,160\nr1: a -> b "detour" style=primary\n');
  await expect(page.locator('.problems')).toHaveText('No problems'); // the arrow went around the box by itself
  const pts = (await page.locator('polyline[data-id="r1"]').getAttribute('points'))!.split(' ').map((p) => p.split(',').map(Number));
  expect(pts.length).toBeGreaterThan(3);
  // the detour's long run, and the direction that takes it further from the box in the way
  const runs = pts.slice(0, -1).map((p, i) => ({ y: p[1], len: Math.abs(pts[i + 1][0] - p[0]), flat: p[1] === pts[i + 1][1] })).filter((r) => r.flat);
  const runY = runs.sort((p, q) => q.len - p.len)[0].y, away = runY > 192 ? 1 : -1;
  const k = await zoom(page);
  const onRun = await at(page, 400, runY);
  await page.mouse.click(onRun.x, onRun.y);
  const handles = () => page.locator('[data-seg]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { i: +e.getAttribute('data-seg')!, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, horiz: r.width > r.height }; }));
  // the handle on the longest flat run of the line (handles are all one size, so it is found from the points)
  const longest = async () => {
    const ps = (await page.locator('polyline[data-id="r1"]').getAttribute('points'))!.split(' ').map((p) => p.split(',').map(Number));
    let best = -1, len = -1;
    ps.slice(0, -1).forEach((p, i) => { const l = Math.abs(ps[i + 1][0] - p[0]); if (p[1] === ps[i + 1][1] && l > len) { len = l; best = i; } });
    return (await handles()).find((h) => h.i === best)!;
  };
  await drag(page, await longest(), 0, away * 32 * k);
  expect(lineOf(await source(page), 'r1')).toMatch(new RegExp(`via=.*,${runY + away * 32};.*,${runY + away * 32}`));
  const first = (await handles()).find((h) => h.i === 0)!;
  await drag(page, first, 0, 20 * k);
  expect(lineOf(await source(page), 'r1')).toMatch(/^r1: a\.right@\d+ -> b/);
  const lab = (await page.locator('[data-label="r1"]').boundingBox())!;
  await drag(page, { x: lab.x + lab.width / 2, y: lab.y + lab.height / 2 }, 60, -10);
  expect(lineOf(await source(page), 'r1')).toMatch(/lpos=\d+,\d+/);
  await page.getByRole('button', { name: 'Route automatically' }).click();
  expect(lineOf(await source(page), 'r1')).not.toMatch(/via=|lpos=/);
  await drag(page, await longest(), 0, away * 24 * k);
  expect(lineOf(await source(page), 'r1')).toContain('via=');
  await page.keyboard.press('Escape');
  await drag(page, await corner(page, 'b'), 20 * k, 100 * k);
  expect(lineOf(await source(page), 'r1')).not.toContain('via=');
});

test("a look's own fonts load in folder mode; loose files get a notice instead", async ({ page }) => {
  const dir = 'examples/look-test/';
  await openFolder(page, {
    'docs/fira.fdraw': repoText(dir + 'fira.fdraw'), 'docs/fira.look': repoText(dir + 'fira.look'),
    'docs/fonts/FiraSans-Regular.ttf': { base64: repoBase64(dir + 'fonts/FiraSans-Regular.ttf') },
    'docs/fonts/FiraSans-SemiBold.ttf': { base64: repoBase64(dir + 'fonts/FiraSans-SemiBold.ttf') },
  });
  await expect.poll(() => page.evaluate(() => document.fonts.check('600 12px "Fira Sans"'))).toBe(true);
  await expect(page.locator('.banner')).toHaveCount(0);
  await fresh(page);
  for (const n of ['fira.fdraw', 'fira.look']) {
    await page.evaluate(({ n, text }) => {
      const dt = new DataTransfer(); dt.items.add(new File([text], n));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, { n, text: repoText(dir + n) });
    await page.waitForSelector('svg.canvas');
  }
  await expect(page.locator('.banner')).toContainText('This look uses Fira Sans');
});

test('markup in pasted text is drawn as text, and problems are listed and select their element', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, 'canvas 600x300\na: node "<img src=x onerror=alert(1)>" at 40,40 fill="red\\" onload=\\"alert(1)"\nb: node "B" at 100,60\n<script>alert(1)</script>\n');
  await expect(page.locator('svg.canvas script, svg.canvas img')).toHaveCount(0);
  await expect(page.locator('.problems')).toContainText('problem');
  await page.locator('.problems').click();
  await page.locator('.issuelist li', { hasText: 'overlaps' }).click();
  await expect(page.locator('[data-handle]:not([data-strip])')).toHaveCount(8);
  expect(errors).toEqual([]);
});

const ER = 'canvas 880x360\nusers: table "users" at 40,80\n  | id "id" "uuid" "PK"\n  | email "email" "text"\norders: table "orders" at 440,80\n  | id "id" "uuid" "PK"\n  | user_id "user_id" "uuid" "FK"\nfk: orders.user_id -- users.id style=relation tail=many head=only-one\n';

test('tables: edit, add and remove rows in the panel; arrows follow rows; line ends are chosen from a list', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, ER);
  await expect(page.locator('.problems')).toHaveText('No problems');
  await page.mouse.click(...Object.values(await corner(page, 'users')) as [number, number]);
  const row = (n: number) => page.getByLabel(`Row ${n}`, { exact: true });
  await row(2).fill('email | citext | UK');
  await row(2).press('Enter');
  expect(await source(page)).toContain('  | email "email" "citext" "UK"\n');
  await page.getByRole('button', { name: 'Add row' }).click();
  expect(await source(page)).toContain('  | email "email" "citext" "UK"\n  | r1 "name" "value"\norders:');
  // moving the table keeps every row on its own line
  await page.keyboard.press('ArrowDown');
  expect(await source(page)).toContain('users: table "users" at 40,84\n  | id "id" "uuid" "PK"\n');
  // removing the row an arrow ends on re-attaches the arrow to the table
  await row(1).fill('');
  await row(1).press('Enter');
  expect(lineOf(await source(page), 'fk')).toMatch(/^fk: orders\.user_id -- users /);
  await expect(page.locator('.problems')).toHaveText('No problems');
  // drag the arrow's end onto a row that has an id
  const k = await zoom(page);
  await page.keyboard.press('Escape');
  const mid = await page.locator('polyline[data-id="fk"]').boundingBox();
  await page.mouse.click(mid!.x + mid!.width / 2, mid!.y + mid!.height / 2);
  const end = (await page.locator('[data-end="b"]').boundingBox())!;
  const target = await at(page, 120, 84 + 32 + 24 + 12); // second row of users: r1
  await drag(page, { x: end.x + end.width / 2, y: end.y + end.height / 2 }, target.x - end.x - end.width / 2, target.y - end.y - end.height / 2);
  expect(lineOf(await source(page), 'fk')).toMatch(/^fk: orders\.user_id -- users\.r1 /);
  await page.getByLabel('End of the line').selectOption('zero-one');
  expect(lineOf(await source(page), 'fk')).toContain('head=zero-one');
  await page.locator('.panel button[title="Arrowhead at the end"]').click();
  expect(lineOf(await source(page), 'fk')).toBe('fk: orders.user_id -> users.r1 style=relation');
  void k;
  expect(errors).toEqual([]);
});

test('a table can be placed from the components gallery', async ({ page }) => {
  await paste(page, SMALL);
  await page.getByRole('button', { name: 'Components' }).click();
  await page.locator('.thumbcard', { hasText: 'table' }).first().click();
  const spot = await at(page, 700, 320);
  await page.mouse.click(spot.x, spot.y);
  expect(await source(page)).toMatch(/table: table "Name" at \d+,\d+\n  \| r1 "first" "value"\n  \| r2 "second" "value"\n$/);
  await expect(page.getByLabel('Row 1', { exact: true })).toHaveValue('first | value');
});

test('line shape: switch an arrow to curved and bend it by dragging its middle', async ({ page }) => {
  await paste(page, 'canvas 880x420\na: node "Client" at 40,160\nb: focal "Target" at 560,160\nr1: a -> b style=primary\n');
  const line = (await page.locator('polyline[data-id="r1"]').boundingBox())!;
  await page.mouse.click(line.x + line.width / 2, line.y + line.height / 2);
  await page.getByRole('button', { name: 'Curved' }).click();
  expect(lineOf(await source(page), 'r1')).toBe('r1: a -> b style=primary route=curve');
  const k = await zoom(page);
  const h = (await page.locator('[data-seg="-1"]').boundingBox())!;
  await drag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, 0, -60 * k);
  expect(lineOf(await source(page), 'r1')).toBe('r1: a -> b style=primary route=curve bend=60');
  await page.getByRole('button', { name: 'Right angles' }).click();
  expect(lineOf(await source(page), 'r1')).toBe('r1: a -> b style=primary route=ortho');
});

test('draw by hand: the pen leaves a short smooth stroke, stays in hand, and a stroke is picked by its line', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  const before = await source(page), k = await zoom(page);
  const wave = async (x: number, y: number) => {
    const a = await at(page, x, y);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) await page.mouse.move(a.x + i * 4 * k, a.y + Math.sin(i / 6) * 40 * k);
  };
  await page.keyboard.press('p');
  await wave(300, 60);
  await expect(page.locator('svg.canvas polyline.ink')).toHaveCount(1); // the ink follows the pointer
  expect(await source(page)).toBe(before); // nothing is saved until the pen lifts
  await page.mouse.up();
  await expect(page.locator('svg.canvas polyline.ink')).toHaveCount(0);
  const line = lineOf(await source(page), 'stroke');
  expect(line).toMatch(/^stroke: freehand at 300,2\d points=([\d.]+,[\d.]+;){3,}[\d.]+,[\d.]+$/);
  expect(line.split(';').length).toBeLessThan(25); // 40 pointer positions, thinned to the few that carry the shape
  // the pen is still in hand: a second stroke needs no second trip to the toolbar
  await wave(300, 340);
  await page.mouse.up();
  expect(lineOf(await source(page), 'stroke2')).toMatch(/^stroke2: freehand at 300,3\d\d points=/);
  await expect(page.locator('.problems')).toHaveText('No problems');
  // back to the arrow: a press inside the stroke's box but off its line picks nothing, a press on the line picks it
  await page.keyboard.press('Escape');
  const off = await at(page, 340, 30), on = await at(page, 300, 60);
  await page.mouse.click(off.x, off.y);
  await expect(page.locator('[data-handle]')).toHaveCount(0);
  await page.mouse.click(on.x, on.y);
  await expect(page.locator('[data-handle="se"]')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  expect(lineOf(await source(page), 'stroke')).toMatch(/^stroke: freehand at 304,2\d points=/);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await source(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('polygon: drag a corner, move and resize it', async ({ page }) => {
  await paste(page, 'canvas 600x400\ntri: polygon "T" at 100,100 points=60,0;120,80;0,80 fill=accent/0.2\n');
  const k = await zoom(page);
  const c = await at(page, 160, 160);
  await page.mouse.click(c.x, c.y);
  const v = (await page.locator('[data-vertex="0"]').boundingBox())!;
  await drag(page, { x: v.x + v.width / 2, y: v.y + v.height / 2 }, 40 * k, -40 * k);
  expect(lineOf(await source(page), 'tri')).toBe('tri: polygon "T" at 100,60 120x120 points=100,0;120,120;0,120 fill=accent/0.2');
  await page.keyboard.press('ArrowRight');
  expect(lineOf(await source(page), 'tri')).toContain('at 104,60 120x120 points=100,0;120,120;0,120');
  await expect(page.locator('.problems')).toHaveText('No problems');
});

test('chart: place one from the gallery, change its numbers and add a series', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, 'canvas 900x500\nt: h1 "Numbers" at 40,52\n');
  await page.getByRole('button', { name: 'Components' }).click();
  await page.locator('.thumbcard', { hasText: 'chart' }).first().click();
  const spot = await at(page, 400, 260);
  await page.mouse.click(spot.x, spot.y);
  expect(await source(page)).toMatch(/chart: chart "Title" at 240,172 320x180 x="A,B,C,D"\n  \| bars "Series" 30 50 40 70\n$/);
  const row = page.getByLabel('Row 1', { exact: true });
  await expect(row).toHaveValue('Series | 30 | 50 | 40 | 70');
  await row.fill('Sales | 10 | 20 | 30 | 45');
  await row.press('Enter');
  await page.getByRole('button', { name: '+ line' }).click();
  expect(await source(page)).toContain('  | bars "Sales" 10 20 30 45\n  | line "Series" 50 50 50 50\n');
  await expect(page.locator('svg.canvas polyline[stroke-linejoin="round"]')).toHaveCount(1);
  await expect(page.locator('.problems')).toHaveText('No problems');
  expect(errors).toEqual([]);
});

test('icons: the Solid tab picks the filled twin of an icon, and Outline takes it back', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'db')) as [number, number]);
  await page.getByRole('tab', { name: 'Solid' }).click();
  const solid = page.getByRole('radiogroup', { name: 'Solid icons' });
  await solid.getByRole('radio', { name: 'database', exact: true }).click();
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database icon\.style=solid$/);
  await expect(solid.getByRole('radio', { name: 'database', exact: true })).toBeChecked();
  // drawn filled, from the 256 box, with no outline stroke
  await expect(page.locator('svg.canvas g[transform*="scale(0.0"] path[d^="M128,24"]')).toHaveCount(1);
  // reopening the box shows the Solid tab; the same icon in Outline is not the chosen one
  await page.getByRole('tab', { name: 'Outline' }).click();
  const outline = page.getByRole('radiogroup', { name: 'Icons' });
  await expect(outline.getByRole('radio', { name: 'database', exact: true })).not.toBeChecked();
  await outline.getByRole('radio', { name: 'database', exact: true }).click();
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database$/);
  await page.keyboard.press('Control+z');
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database icon\.style=solid$/);
  await expect(page.locator('.problems')).toHaveText('No problems');
  expect(errors).toEqual([]);
});

test('icons: choose one for a box in the panel, move it above the text, and place an icon on its own', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'db')) as [number, number]);
  // the tall panel scrolls; it never squashes the menu button above it
  expect((await page.getByRole('button', { name: 'Menu' }).boundingBox())!.height).toBe(38);
  const tiles = page.getByRole('radiogroup', { name: 'Icons' });
  await tiles.getByRole('radio', { name: 'database', exact: true }).click();
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database$/);
  await expect(tiles.getByRole('radio', { name: 'database', exact: true })).toBeChecked();
  await expect(page.locator('svg.canvas g[stroke-linecap="round"] path').first()).toBeVisible();
  await page.getByRole('button', { name: 'Above the text' }).click();
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database icon\.pos=top$/);
  // the search narrows the tiles, and Enter takes the first match
  await page.getByLabel('Search icons').fill('lambda');
  await expect(tiles.getByRole('radio', { name: 'function', exact: true })).toBeVisible();
  await page.getByLabel('Search icons').fill('zzqx');
  await expect(tiles.getByRole('radio')).toHaveCount(0);
  await expect(tiles).toContainText('No icon is called anything like');
  await page.getByLabel('Search icons').fill('balanc');
  await expect(tiles.getByRole('radio')).toHaveCount(1);
  await page.getByLabel('Search icons').press('Enter');
  expect(lineOf(await source(page), 'db')).toMatch(/icon=load-balancer icon\.pos=top$/);
  // size and colour
  await page.getByRole('group', { name: 'Icon size' }).getByRole('button', { name: 'L', exact: true }).click();
  expect(lineOf(await source(page), 'db')).toContain('icon.size=32');
  await page.getByRole('group', { name: 'Icon size' }).getByRole('button', { name: 'Auto' }).click();
  expect(lineOf(await source(page), 'db')).not.toContain('icon.size');
  const strokes = page.getByRole('group', { name: 'Icon stroke colours' });
  const ink = await strokes.locator('.swatch').last().getAttribute('aria-label');
  await strokes.locator('.swatch').last().click();
  expect(lineOf(await source(page), 'db')).toContain(`icon.color=${ink}`);
  // any colour, from the system colour picker
  await page.getByLabel('Custom icon colour').fill('#e0457b');
  expect(lineOf(await source(page), 'db')).toContain('icon.color=#e0457b');
  await expect(page.locator('svg.canvas g[stroke="#e0457b"]')).toHaveCount(1);
  await expect(strokes.locator('.custom.on')).toHaveCount(1);
  await page.getByRole('button', { name: 'Text colour' }).click();
  expect(lineOf(await source(page), 'db')).not.toContain('icon.color');
  // a fill inside the icon's closed parts: a tint, any colour, or none
  const fills = page.getByRole('group', { name: 'Icon fill colours' });
  const tint = await fills.locator('.swatch').nth(1).getAttribute('aria-label');
  await fills.locator('.swatch').nth(1).click();
  expect(lineOf(await source(page), 'db')).toContain(`icon.fill=${tint}`);
  await page.getByLabel('Custom icon fill').fill('#ffd400');
  expect(lineOf(await source(page), 'db')).toContain('icon.fill=#ffd400');
  await expect(page.locator('svg.canvas g[fill="#ffd400"]')).toHaveCount(1);
  await fills.getByRole('button', { name: 'none', exact: true }).click();
  expect(lineOf(await source(page), 'db')).not.toContain('icon.fill');
  // the stroke width, in pixels on screen
  await page.getByRole('group', { name: 'Icon stroke width' }).getByRole('button', { name: 'Bold' }).click();
  expect(lineOf(await source(page), 'db')).toContain('icon.width=2');
  await page.getByRole('group', { name: 'Icon stroke width' }).getByRole('button', { name: 'Regular' }).click();
  expect(lineOf(await source(page), 'db')).not.toContain('icon.width');
  await tiles.getByRole('radio', { name: 'load-balancer', exact: true }).click(); // the chosen icon, clicked again, goes
  expect(lineOf(await source(page), 'db')).not.toContain('icon=');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Components' }).click();
  await page.locator('.thumbcard', { hasText: 'an icon on its own' }).first().click();
  const spot = await at(page, 700, 340);
  await page.mouse.click(spot.x, spot.y);
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^icon: icon at \d+,\d+ icon=server$/);
  // an icon on its own is the shape: no box to style, its fill, stroke and stroke width are the icon's
  await page.keyboard.press('Escape');
  await page.mouse.click(...Object.values(await corner(page, 'icon')) as [number, number]);
  await expect(page.locator('.panel h4', { hasText: 'Background' })).toHaveCount(0);
  await expect(page.locator('.panel h4', { hasText: 'Stroke style' })).toHaveCount(0);
  const ifills = page.getByRole('group', { name: 'Icon fill colours' });
  const itint = await ifills.locator('.swatch').nth(1).getAttribute('aria-label');
  await ifills.locator('.swatch').nth(1).click();
  await page.getByLabel('Custom icon colour').fill('#0369a1');
  await page.getByRole('group', { name: 'Icon stroke width' }).getByRole('button', { name: 'Heavy' }).click();
  expect(lineOf(await source(page), 'icon')).toMatch(new RegExp(`icon=server fill=${itint!.replace(/[/.]/g, '\\$&')} stroke=#0369a1 sw=2\\.75$`));
  await expect(page.locator('svg.canvas g[stroke="#0369a1"]')).toHaveCount(1);
  // double-click puts a caption under it
  await page.waitForTimeout(500);
  const c = await corner(page, 'icon');
  await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.type('Web server');
  await page.keyboard.press('Enter');
  expect(lineOf(await source(page), 'icon')).toMatch(/^icon: icon "Web server" at /);
  expect(errors).toEqual([]);
});

test("a look's own colour icons load in folder mode, survive an export, and loose files get a notice", async ({ page }) => {
  const errors = noPageErrors(page);
  const dir = 'examples/look-test/';
  const icon = (n: string) => ({ base64: repoBase64(dir + 'icons/' + n) });
  await openFolder(page, {
    'docs/team-icons.fdraw': repoText(dir + 'team-icons.fdraw'), 'docs/team-icons.look': repoText(dir + 'team-icons.look'),
    'docs/icons/10021-icon-service-Sample-Screen.svg': icon('10021-icon-service-Sample-Screen.svg'),
    'docs/icons/Sample Grid.svg': icon('Sample Grid.svg'), 'docs/icons/hostile.svg': icon('hostile.svg'),
  });
  const images = page.locator('svg.canvas image[href^="data:image/svg+xml;base64,"]');
  await expect(images).toHaveCount(4);
  await expect(page.locator('.problems')).toHaveText('No problems');
  await expect(page.locator('.banner')).toHaveCount(0);
  // the picker offers the folder's icons by their file-derived names
  await page.mouse.click(...Object.values(await corner(page, 'st')) as [number, number]);
  await expect(page.getByRole('radiogroup', { name: 'Icons' })).toContainText("From the look's folder");
  await page.getByRole('radiogroup', { name: 'Icons' }).getByRole('radio', { name: 'sample-screen', exact: true }).click();
  await saved(page);
  expect(lineOf(await diskText(page, 'docs/team-icons.fdraw'), 'st')).toContain('icon=sample-screen');
  // an exported image carries the icons it uses, so it still shows them when opened with no folder
  await page.getByRole('button', { name: 'Menu' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Export image/ }).click().then(() => page.getByRole('button', { name: 'Download' }).click())]);
  const bytes = (await import('node:fs')).readFileSync(await dl.path()).toString('base64');
  await fresh(page);
  await page.evaluate((b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'from-wiki.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bytes);
  await page.waitForSelector('svg.canvas');
  await expect(images).toHaveCount(4);
  await expect(page.locator('.banner')).toHaveCount(0);
  // the loose diagram and look, with no folder: the icons cannot be read, and the editor says why
  await fresh(page);
  for (const n of ['team-icons.fdraw', 'team-icons.look']) {
    await page.evaluate(({ n, text }) => {
      const dt = new DataTransfer(); dt.items.add(new File([text], n));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, { n, text: repoText(dir + n) });
    await page.waitForSelector('svg.canvas');
  }
  await expect(page.locator('.banner')).toContainText('This look brings its own icons from a folder');
  expect(errors).toEqual([]);
});

test('a new diagram starts blank in the built-in look, from the start screen and from the menu', async ({ page }) => {
  const errors = noPageErrors(page);
  await page.goto('/edit/');
  await page.getByRole('button', { name: /New diagram/ }).click();
  await page.waitForSelector('svg.canvas');
  expect(await source(page)).toBe('\n');
  await page.keyboard.press('r');
  await drag(page, await at(page, 200, 200), 140, 80);
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^rect: rect at 200,200 \d+x\d+$/);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'New diagram' }).click();
  expect(await source(page)).toBe('\n');
  await expect(page.getByRole('tab')).toHaveText(['untitled', 'untitled 2']); // the first one is still open beside it
  expect(errors).toEqual([]);
});

test('a reload brings back every open diagram, the active one, and its undo history', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  await page.keyboard.press('r');
  await drag(page, await at(page, 300, 300), 140, 80);
  const drawn = await source(page);
  expect(drawn).toMatch(/rect: rect at 300,300/);
  await page.getByRole('button', { name: 'New diagram in a new tab' }).click();
  await expect(page.getByRole('tab')).toHaveText(['pasted diagram', 'untitled']);
  await page.getByRole('tab', { name: 'pasted diagram' }).click();
  expect(await source(page)).toBe(drawn);
  await expect(page.locator('.status')).toHaveText('saved in this browser');

  await page.reload();
  await page.waitForSelector('svg.canvas');
  await expect(page.getByRole('tab')).toHaveText(['pasted diagram', 'untitled']);
  await expect(page.getByRole('tab', { name: 'pasted diagram' })).toHaveAttribute('aria-selected', 'true');
  expect(await source(page)).toBe(drawn);
  await page.keyboard.press('Control+z');
  expect(await source(page)).toBe(SMALL);
  await page.getByRole('tab', { name: 'untitled' }).click();
  expect(await source(page)).toBe('\n');
  expect(errors).toEqual([]);
});

test('each tab keeps its own diagram and history; closing one asks first and stays closed after a reload', async ({ page }) => {
  await paste(page, SMALL);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Paste diagram text' }).click();
  await page.locator('.modal textarea').fill('canvas 600x400\nx: node "Second" at 80,80\n');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveText(['pasted diagram', 'pasted diagram 2']);
  await page.keyboard.press('Delete'); // nothing selected: no change
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  expect(await source(page)).toBe('');
  await page.getByRole('tab', { name: 'pasted diagram', exact: true }).click();
  expect(await source(page)).toBe(SMALL);
  await page.keyboard.press('Control+z'); // nothing to undo in this tab
  expect(await source(page)).toBe(SMALL);

  // rename by double-click
  await page.getByRole('tab', { name: 'pasted diagram 2' }).dblclick();
  await page.getByRole('textbox', { name: 'Diagram name' }).fill('second');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab')).toHaveText(['pasted diagram', 'second']);

  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await page.getByRole('button', { name: 'Close second' }).click();
  expect(asked).toContain('kept only in this browser');
  await expect(page.getByRole('tab')).toHaveCount(2);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Close second' }).click();
  await expect(page.getByRole('tab')).toHaveText(['pasted diagram']);
  await page.reload();
  await page.waitForSelector('svg.canvas');
  await expect(page.getByRole('tab')).toHaveText(['pasted diagram']);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Close pasted diagram' }).click();
  await page.waitForSelector('.welcome');
  await page.reload();
  await page.waitForSelector('.welcome');
});

test('after a reload a diagram from a folder reconnects to its file and keeps saving there', async ({ page }) => {
  await openFolder(page, folder());
  await doubleClick(page, await corner(page, 'reader'));
  await page.keyboard.type('Visitor');
  await page.keyboard.press('Enter');
  await saved(page);
  await page.reload();
  await page.waitForSelector('svg.canvas');
  await expect(page.locator('.status')).toHaveText('saved');
  expect(await source(page)).toBe(await diskText(page, SEQ));
  await expect(page.locator('.problems')).toHaveText('No problems'); // the look came back too
  await page.keyboard.press('Control+z');
  await saved(page);
  expect(lineOf(await diskText(page, SEQ), 'reader')).not.toContain('"Visitor"');
  // changed on disk while the page was away: the file wins, and the old text is one undo away
  const before = await source(page);
  await writeDisk(page, SEQ, before + 'agentbox: node "Added by agent" at 780,560\n');
  await page.reload();
  await page.waitForSelector('svg.canvas');
  await expect(page.locator('rect[data-id="agentbox"]')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('rect[data-id="agentbox"]')).toHaveCount(0);
});

test('a new diagram from a template: search the kinds, open one in the built-in look, then pick another from the menu', async ({ page }) => {
  const errors = noPageErrors(page);
  await page.goto('/edit/');
  await page.getByRole('button', { name: /New from a template/ }).click();
  await expect(page.locator('.tpl')).toHaveCount(44);
  await page.getByPlaceholder(/Search/).fill('swimlane');
  await expect(page.locator('.tpl')).toHaveCount(1);
  await page.locator('.tpl').first().click();
  await page.waitForSelector('svg.canvas');
  expect(await source(page)).toBe(repoText('examples/trial/swimlane.fdraw'));
  await expect(page.locator('.problems')).toHaveText('No problems');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'New from a template' }).click();
  await page.getByPlaceholder(/Search/).fill('sequence');
  await page.keyboard.press('Enter');
  const seq = await source(page);
  expect(seq).toBe(repoText('examples/test/sequence.fdraw').replace(/^look .*\n/, ''));
  await expect(page.locator('.problems')).toHaveText('No problems');
  expect(errors).toEqual([]);
});

test('a legend entry is edited in place: double-click its label, type, Enter; emptied, the entry goes', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL + 'key: legend at 40,300 title="Key" external="Shopper" focal="The service" store="Data" link="Request"\n');
  const label = (t: string) => page.locator('svg.canvas text', { hasText: new RegExp(`^${t}$`) }).first();
  const centre = async (t: string) => { const b = (await label(t).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // rename one entry: only that entry's label changes, and the field takes its place
  await doubleClick(page, await centre('The service'));
  await expect(page.locator('.textedit')).toHaveValue('The service');
  await page.locator('.textedit').fill('Orders API, the subject');
  await page.keyboard.press('Enter');
  expect(lineOf(await source(page), 'key')).toBe('key: legend at 40,300 title="Key" external="Shopper" focal="Orders API, the subject" store="Data" link="Request"');
  // an entry emptied is taken out
  await doubleClick(page, await centre('Data'));
  await page.locator('.textedit').fill('');
  await page.keyboard.press('Enter');
  expect(lineOf(await source(page), 'key')).not.toContain('store=');
  // the heading too
  await doubleClick(page, await centre('KEY'));
  await expect(page.locator('.textedit')).toHaveValue('Key');
  await page.locator('.textedit').fill('What it means');
  await page.keyboard.press('Enter');
  expect(lineOf(await source(page), 'key')).toContain('title="What it means"');
  expect(errors).toEqual([]);
});

test('a second line and a corner tag are edited in place, each on its own; emptied, it goes', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL.replace('sub="REST" at 280,160', 'sub="REST" tag="v2" at 280,160 200x80'));
  const label = (t: string) => page.locator('svg.canvas text', { hasText: new RegExp(`^${t}$`, 'i') }).first();
  const centre = async (t: string) => { const b = (await label(t).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  await doubleClick(page, await centre('REST'));
  await expect(page.locator('.textedit')).toHaveValue('REST');
  await expect(page.locator('.textedit')).toHaveClass(/inplace/);
  await page.locator('.textedit').fill('gRPC and REST');
  await page.keyboard.press('Enter');
  expect(lineOf(await source(page), 'api')).toContain('sub="gRPC and REST"');
  expect(lineOf(await source(page), 'api')).toContain('"Orders API"');
  await doubleClick(page, await centre('v2'));
  await expect(page.locator('.textedit')).toHaveValue('v2');
  await expect(page.locator('.textedit')).toHaveClass(/inplace/);
  await page.locator('.textedit').fill('beta');
  await page.keyboard.press('Enter');
  expect(lineOf(await source(page), 'api')).toContain('tag="beta"');
  // the main text is still the main text
  await doubleClick(page, await centre('Orders API'));
  await expect(page.locator('.textedit')).toHaveValue('Orders API');
  await page.keyboard.press('Escape');
  await doubleClick(page, await centre('beta'));
  await page.locator('.textedit').fill('');
  await page.keyboard.press('Enter');
  expect(lineOf(await source(page), 'api')).not.toContain('tag=');
  expect(errors).toEqual([]);
});

test('a legend moved sideways keeps its width', async ({ page }) => {
  await paste(page, SMALL + 'key: legend at 40,300 external="Shopper" focal="The service"\n');
  const width = async () => (await page.locator('rect[data-id="key"]').first().boundingBox())!.width;
  const before = await width();
  const k = await zoom(page);
  const b = (await page.locator('rect[data-id="key"]').first().boundingBox())!;
  await drag(page, { x: b.x + 4, y: b.y + 4 }, 120 * k, 0);
  expect(lineOf(await source(page), 'key')).toMatch(/^key: legend at 160,300 \d+x\d+ /);
  expect(await width()).toBeCloseTo(before, 1);
});

test('`fastdraw open` lends a folder: the diagram opens with its look and icons, edits save back, outside edits come in', async ({ page, baseURL }) => {
  const dir = mkdtempSync(join(tmpdir(), 'fdopen-'));
  cpSync(resolve(import.meta.dirname, '../examples/look-test'), dir, { recursive: true });
  const file = join(dir, 'team-icons.fdraw');
  const s = await serveFolder(dir, { editor: baseURL!, open: 'team-icons.fdraw' });
  try {
    const errors = noPageErrors(page);
    await page.goto(s.url);
    await page.waitForSelector('svg.canvas');
    await saved(page);
    expect(new URL(page.url()).search).toBe(''); // the link is not kept for a reload
    expect(lineOf(await source(page), 'vm')).toContain('at 40,96');
    // an icon from the look's folder is drawn as an image
    expect(await page.locator('svg.canvas image').count()).toBeGreaterThan(0);
    // an edit in the editor is written to the file on this computer
    const k = await zoom(page);
    await drag(page, await corner(page, 'vm'), 40 * k, 0);
    await saved(page);
    expect(lineOf(readFileSync(file, 'utf8'), 'vm')).toContain('at 80,96');
    // a change made to the file outside the editor shows up
    writeFileSync(file, readFileSync(file, 'utf8').replace('"Web VM"', '"Web VM 2"'));
    await expect(page.locator('.status')).toHaveText('updated from disk');
    expect(lineOf(await source(page), 'vm')).toContain('"Web VM 2"');
    expect(errors).toEqual([]);
  } finally { await s.close(); }
});

test('no page: no border or size fields, a shape goes past 0,0, and an old canvas size goes with the first edit', async ({ page }) => {
  const errors = noPageErrors(page);
  const OLD = 'canvas 600x300\na: node "A" at 40,40\nb: node "B" at 320,200\n';
  await openFolder(page, { 'old.fdraw': OLD });
  expect(await diskText(page, 'old.fdraw')).toBe(OLD); // opening never writes
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByText('Canvas size')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const k = await zoom(page);
  await drag(page, await corner(page, 'a'), -160 * k, -120 * k);
  await saved(page);
  const text = await diskText(page, 'old.fdraw');
  expect(text).not.toMatch(/canvas/);
  expect(lineOf(text, 'a')).toMatch(/at -1[12]\d,-8\d/);
  await expect(page.locator('rect[data-id="a"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the menu changes the background for this diagram and resets to the look', async ({ page }) => {
  await paste(page, SMALL);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('.canvasbg [aria-label="#ffffff"]').click();
  expect(lineOf(await source(page), 'canvas')).toBe('canvas paper=#ffffff'); // the old size went with the edit
  await page.locator('.canvasbg').getByLabel('Dot grid').click();
  expect(lineOf(await source(page), 'canvas')).toBe('canvas paper=#ffffff dots=none');
  await expect(page.locator('svg.canvas rect[fill="url(#fd-dots)"]')).toHaveCount(0);
  await page.getByRole('button', { name: "Use the look's background" }).click();
  expect(lineOf(await source(page), 'canvas')).toBe('');
});

test('the look picker: hover shows the diagram in a look, a click uses it at once, undo goes back', async ({ page }) => {
  const errors = noPageErrors(page);
  const PLAIN = SMALL.replace('canvas 900x420\n', '');
  await paste(page, PLAIN);
  const canvas = page.locator('svg.canvas');
  const title = canvas.locator('text', { hasText: 'Orders API' }).first();
  await page.getByRole('button', { name: 'Look', exact: true }).click();
  const cards = page.locator('.lookcard');
  const card = (name: string) => page.getByRole('button', { name: new RegExp('^' + name) });
  await expect(page.locator('.lookcard > span')).toHaveText(['Built-in · in use', 'Headline', 'Night', 'Reference', 'Sketch', 'Whiteboard']);
  await expect(cards.locator('svg.lookthumb text', { hasText: 'Orders API' })).toHaveCount(6); // every card shows this diagram
  await expect(page.getByRole('button', { name: 'Apply' })).toHaveCount(0);
  // hovering tries a look on the canvas without touching the source
  await card('Sketch').hover();
  await expect(title).toHaveAttribute('font-family', /Sketch Hand/);
  expect(await source(page)).toBe(PLAIN);
  // leaving the strip goes back to the look in use
  await page.mouse.move(5, 880);
  await expect(title).not.toHaveAttribute('font-family', /Sketch Hand/);
  // a click writes the look line straight away, and the picker stays open to try another
  await card('Whiteboard').click();
  expect(await source(page)).toBe('look whiteboard\n' + PLAIN);
  await expect(card('Whiteboard')).toContainText('in use');
  await page.mouse.move(5, 880);
  await expect(canvas).toHaveCSS('background-color', 'rgb(250, 250, 251)');
  await page.keyboard.press('Escape');
  await expect(page.locator('.lookpicker')).toHaveCount(0);
  await page.locator('.problems').click();
  await expect(page.locator('.issuelist')).not.toContainText(/style|look/);
  await page.locator('.problems').click();
  // hovering then Esc leaves the look in use as it was
  await page.getByRole('button', { name: 'Look', exact: true }).click();
  await card('Headline').hover();
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveCSS('background-color', 'rgb(250, 250, 251)');
  expect(await source(page)).toBe('look whiteboard\n' + PLAIN);
  // back to the built-in look removes the line; undo brings it back
  await page.getByRole('button', { name: 'Look', exact: true }).click();
  await card('Built-in').click();
  expect(await source(page)).toBe(PLAIN);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  expect(await source(page)).toBe('look whiteboard\n' + PLAIN);
  expect(errors).toEqual([]);
});

test("the look picker keeps a diagram's own look file as a choice, and a bundled look saves as its name", async ({ page }) => {
  await openFolder(page, folder());
  await page.getByRole('button', { name: 'Look', exact: true }).click();
  const cards = page.locator('.lookcard');
  const card = (name: string) => page.getByRole('button', { name: new RegExp('^' + name) });
  await expect(cards).toHaveCount(7);
  await expect(page.locator('.lookcard > span').last()).toHaveText('This diagram’s look file · in use');
  await card('Sketch').click();
  await saved(page);
  const text = await diskText(page, SEQ);
  expect(text.split('\n')[0]).toBe('look sketch');
  expect(text.split('\n').slice(1)).toEqual(repoText(SEQ).split('\n').slice(1));
  await expect(page.locator('.banner')).toHaveCount(0); // a bundled look needs no file, fonts or folder
  await expect(page.locator('.problems')).toHaveText('No problems');
  // the picker stayed open, and the look file is still there to go back to
  await expect(cards).toHaveCount(7);
  await card('This diagram').click();
  await expect.poll(async () => (await diskText(page, SEQ)).split('\n')[0]).toBe(repoText(SEQ).split('\n')[0]);
});
