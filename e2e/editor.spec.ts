import { test, expect } from '@playwright/test';
import { openFolder, diskText, writeDisk, paste, source, lineOf, saved, at, corner, drag, doubleClick, noPageErrors, repoText, repoBase64, zoom } from './helpers.ts';

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

test('panel: restyle, switch style, and the look styles gallery places shapes and lines', async ({ page }) => {
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'user')) as [number, number]);
  await page.locator('.panel .swatch[title="accent/0.08"]').click();
  await page.locator('.panel button[title="Dotted"]').click();
  expect(lineOf(await source(page), 'user')).toMatch(/fill=accent\/0\.08 dash=1,4$/);
  await page.locator('.panel select').first().selectOption('cloud');
  expect(lineOf(await source(page), 'user')).toMatch(/^user: cloud /);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Look styles' }).click();
  await expect(page.locator('.thumbcard').first()).toBeVisible();
  await page.locator('.thumbcard', { hasText: 'optional' }).first().click();
  await expect(page.locator('.hintbar')).toContainText('Click or drag');
  const spot = await at(page, 700, 340);
  await page.mouse.click(spot.x, spot.y);
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^optional: optional at \d+,\d+$/);
  await page.locator('.toolbar .wide').click();
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
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export as PNG' }).click()]);
  expect(dl.suggestedFilename()).toBe('pasted-diagram.png');
  const bytes = (await import('node:fs')).readFileSync(await dl.path()).toString('base64');
  const drop = (name: string, b64: string) => page.evaluate(({ name, b64 }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name, b64 });
  await page.goto('/');
  await page.waitForSelector('.welcome');
  await drop('from-wiki.png', bytes);
  await page.waitForSelector('svg.canvas');
  expect(await source(page)).toBe(SMALL);
  await expect(page.locator('.filechip b')).toHaveText('from-wiki.fdraw');
  await drop('photo.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
  await expect(page.locator('.status')).toContainText('was not exported from FastDraw');
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
  const longest = async () => (await handles()).filter((h) => h.horiz).sort((p, q) => q.w - p.w)[0];
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
  await page.goto('/');
  await page.waitForSelector('.welcome');
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
  await expect(page.locator('[data-handle]')).toHaveCount(4);
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

test('a table can be placed from the look styles gallery', async ({ page }) => {
  await paste(page, SMALL);
  await page.getByRole('button', { name: 'Look styles' }).click();
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
  await page.getByRole('button', { name: 'Look styles' }).click();
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

test('icons: choose one for a box in the panel, move it above the text, and place an icon on its own', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'db')) as [number, number]);
  await page.getByLabel('Icon', { exact: true }).selectOption('database');
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database$/);
  await expect(page.locator('svg.canvas g[stroke-linecap="round"] path').first()).toBeVisible();
  await page.getByRole('button', { name: 'Above the text' }).click();
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database icon\.pos=top$/);
  await page.getByLabel('Icon', { exact: true }).selectOption('none');
  expect(lineOf(await source(page), 'db')).not.toContain('icon=database');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Look styles' }).click();
  await page.locator('.thumbcard', { hasText: 'an icon on its own' }).first().click();
  const spot = await at(page, 700, 340);
  await page.mouse.click(spot.x, spot.y);
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^icon: icon at \d+,\d+ icon=server$/);
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
  await page.getByLabel('Icon', { exact: true }).selectOption('sample-screen');
  await saved(page);
  expect(lineOf(await diskText(page, 'docs/team-icons.fdraw'), 'st')).toContain('icon=sample-screen');
  // an exported image carries the icons it uses, so it still shows them when opened with no folder
  await page.getByRole('button', { name: 'Menu' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export as PNG' }).click()]);
  const bytes = (await import('node:fs')).readFileSync(await dl.path()).toString('base64');
  await page.goto('/');
  await page.waitForSelector('.welcome');
  await page.evaluate((b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'from-wiki.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bytes);
  await page.waitForSelector('svg.canvas');
  await expect(images).toHaveCount(4);
  await expect(page.locator('.banner')).toHaveCount(0);
  // the loose diagram and look, with no folder: the icons cannot be read, and the editor says why
  await page.goto('/');
  await page.waitForSelector('.welcome');
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
