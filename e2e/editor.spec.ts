import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serveDiagrams } from '../src/serve.ts';
import { openRoot } from '../src/node.ts';
import { openFolder, diskText, writeDisk, paste, source, lineOf, saved, at, corner, drag, doubleClick, noPageErrors, repoText, repoBase64, zoom, fresh, pickHex, kept } from './helpers.ts';

// open the right sidebar on a tab, from the rail or from its own tabs
async function sidebar(page: import('@playwright/test').Page, name: 'Components' | 'Look') {
  const rail = page.locator('.siderail').getByRole('button', { name });
  if (await rail.count()) await rail.click(); else await page.getByRole('tab', { name }).click();
}
// start with the sidebar kept open, as when placing many components, so the diagram is fitted beside it
const pinSidebar = (page: import('@playwright/test').Page) =>
  page.addInitScript(() => localStorage.setItem('fastdraw.sidebar', JSON.stringify({ tab: 'components', pinned: true })));

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

test('an arrow label just dragged is edited by a double-click', async ({ page }) => {
  await paste(page, SMALL);
  const label = page.locator('rect[data-label="r"]');
  let at = (await label.boundingBox())!;
  await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2); // the arrow is selected
  await page.waitForTimeout(500);
  await drag(page, { x: at.x + at.width / 2, y: at.y + at.height / 2 }, 30, 60);
  expect(lineOf(await source(page), 'r')).toMatch(/lpos=/);
  await page.waitForTimeout(500);
  at = (await label.boundingBox())!;
  await doubleClick(page, { x: at.x + at.width / 2, y: at.y + at.height / 2 });
  await expect(page.locator('.textedit')).toHaveValue('writes');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('stores');
  await page.keyboard.press('Enter');
  expect(lineOf(await source(page), 'r')).toMatch(/"stores" .*lpos=/);
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

test('the field sits over the label, not over a corner tag that is one of its words', async ({ page }) => {
  await paste(page, 'mdx: store "MDX Bundle" sub="src/content" tag="MDX" at 200,120 160x64\n');
  const label = page.locator('svg.canvas text', { hasText: /^MDX Bundle$/ });
  const before = (await label.boundingBox())!;
  const type = (t: Element) => { const cs = getComputedStyle(t); return cs.fontFamily + '|' + cs.fontWeight; };
  const drawn = await label.evaluate(type);
  await doubleClick(page, { x: before.x + before.width / 2, y: before.y + before.height / 2 });
  const field = page.locator('.textedit.inplace');
  await expect(field).toHaveValue('MDX Bundle');
  await expect(label).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('svg.canvas text', { hasText: /^MDX$/ })).toHaveCSS('visibility', 'visible');
  expect(await field.evaluate(type)).toBe(drawn);
  const box = (await field.boundingBox())!;
  expect(Math.abs(box.y + box.height / 2 - (before.y + before.height / 2))).toBeLessThan(3);
  expect(Math.abs(box.x + box.width / 2 - (before.x + before.width / 2))).toBeLessThan(3);
});

test('the text of a turned shape is edited turned with it, and its corner tag is found under the pointer', async ({ page }) => {
  await paste(page, 'look reference\na: node "Orders API" tag="API" at 200,120 160x80 rotate=30\n');
  const label = page.locator('svg.canvas text', { hasText: /^Orders API$/ });
  const before = (await label.boundingBox())!;
  await doubleClick(page, { x: before.x + before.width / 2, y: before.y + before.height / 2 });
  const field = page.locator('.textedit.inplace');
  await expect(field).toHaveValue('Orders API');
  await expect(field).toHaveCSS('transform', /^matrix\(0\.866/); // rotate(30deg)
  const box = (await field.boundingBox())!;
  expect(Math.abs(box.y + box.height / 2 - (before.y + before.height / 2))).toBeLessThan(3);
  expect(Math.abs(box.x + box.width / 2 - (before.x + before.width / 2))).toBeLessThan(3);
  await page.keyboard.press('Escape');
  const tag = (await page.locator('svg.canvas text', { hasText: /^API$/ }).boundingBox())!;
  await doubleClick(page, { x: tag.x + tag.width / 2, y: tag.y + tag.height / 2 });
  await expect(field).toHaveValue('API');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('GRPC');
  await page.keyboard.press('Enter');
  expect(lineOf(await source(page), 'a')).toContain('tag="GRPC"');
});

test('a shape with no text yet is edited where its first letter will be drawn', async ({ page }) => {
  for (const kind of ['rect', 'store']) {
    if (kind !== 'rect') await fresh(page);
    await paste(page, `a: ${kind} at 200,120 160x80\n`);
    const shape = (await page.locator('svg.canvas [data-id="a"]').first().boundingBox())!;
    await doubleClick(page, { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 });
    const field = page.locator('.textedit');
    await expect(field).toHaveClass(/inplace/);
    const empty = (await field.boundingBox())!;
    await page.keyboard.type('Q');
    const letter = (await page.locator('svg.canvas text', { hasText: /^Q$/ }).boundingBox())!;
    const typed = (await field.boundingBox())!;
    expect(Math.abs(typed.y - empty.y)).toBeLessThan(1);
    expect(Math.abs(typed.x - empty.x)).toBeLessThan(1);
    expect(Math.abs(empty.y + empty.height / 2 - (letter.y + letter.height / 2))).toBeLessThan(3);
    expect(Math.abs(empty.x + empty.width / 2 - (letter.x + letter.width / 2))).toBeLessThan(3);
    await page.keyboard.press('Escape');
  }
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

test('panel: a zone\'s title and a box\'s text are typed in the sidebar', async ({ page }) => {
  await pinSidebar(page);
  await paste(page, 'canvas 900x420\nedge: zone "Edge" at 40,40 400x300\napi: node "Orders API" at 120,140\n');
  await page.mouse.click(...Object.values(await corner(page, 'edge')) as [number, number]);
  const title = page.locator('.panel').getByRole('textbox', { name: 'Title', exact: true });
  await expect(title).toHaveValue('Edge');
  // a zone draws no second line, so it offers none
  await expect(page.locator('.panel').getByRole('textbox', { name: 'Second line' })).toHaveCount(0);
  await title.fill('Public edge');
  await title.press('Enter');
  expect(lineOf(await source(page), 'edge')).toContain('"Public edge"');
  await page.mouse.click(...Object.values(await corner(page, 'api')) as [number, number]);
  const text = page.locator('.panel').getByRole('textbox', { name: 'Text', exact: true });
  await expect(text).toHaveValue('Orders API');
  // Shift+Enter starts a second line; Enter alone commits
  await text.fill('Orders');
  await text.press('Shift+Enter');
  await text.pressSequentially('API');
  await text.press('Enter');
  expect(lineOf(await source(page), 'api')).toMatch(/"Orders\\nAPI"/);
});

test('a click inside a zone picks it, the inner zone first; a drag there still selects what it covers', async ({ page }) => {
  const text = 'canvas 900x420\nedge: zone "Edge" at 40,40 500x320\ninner: zone "Inner" at 300,180 200x140\napi: node "Orders API" at 80,80\n';
  await paste(page, text);
  // which element is selected: delete it, read which line went, and put it back
  const picked = async () => {
    await page.keyboard.press('Delete');
    const now = await source(page);
    const gone = text.split('\n').filter((l) => l.includes(':') && !now.includes(l)).map((l) => l.split(':')[0]);
    if (gone.length) await page.keyboard.press('Control+z');
    return gone;
  };
  const click = async (x: number, y: number) => { const p = await at(page, x, y); await page.mouse.click(p.x, p.y); };
  await click(150, 280);
  expect(await picked()).toEqual(['edge']);
  await click(400, 250);
  expect(await picked()).toEqual(['inner']);
  await click(152, 112);
  expect(await picked()).toEqual(['api']);
  // a drag that starts inside the zone draws a selection box instead of moving the zone
  const from = await at(page, 60, 60), to = await at(page, 260, 170);
  await drag(page, from, to.x - from.x, to.y - from.y);
  expect(await picked()).toEqual(['api']);
  expect(await source(page)).toBe(text);
  // a second click there edits the zone's title, as on any other shape
  await doubleClick(page, await at(page, 150, 280));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Public edge');
  await page.keyboard.press('Enter');
  expect(lineOf(await source(page), 'edge')).toContain('"Public edge"');
});

test('panel: restyle, switch style, and the components gallery places shapes and lines', async ({ page }) => {
  await pinSidebar(page);
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'user')) as [number, number]);
  await page.locator('.panel .swatch[title="accent/0.08"]').click();
  await page.locator('.panel button[title="Dotted"]').click();
  expect(lineOf(await source(page), 'user')).toMatch(/fill=accent\/0\.08 dash=1,4$/);
  // each colour choice is one row: a few quick picks, then the current colour, which opens the whole palette
  for (const row of await page.locator('.panel .swatches').all()) {
    expect(await row.locator('button').evaluateAll((bs) => new Set(bs.map((b) => b.getBoundingClientRect().top)).size)).toBe(1);
  }
  await page.getByRole('button', { name: 'Custom stroke colour' }).click();
  await page.getByRole('dialog', { name: 'Custom stroke colour' }).getByRole('button', { name: 'violet', exact: true }).click();
  expect(lineOf(await source(page), 'user')).toContain('stroke=violet');
  await expect(page.getByRole('group', { name: 'Stroke colours' }).locator('.custom.on')).toHaveCount(1);
  // the palette's letter keys and the shades' Shift+digit keys pick too
  const pop = page.getByRole('dialog', { name: 'Custom stroke colour' });
  await page.keyboard.press('q');
  expect(lineOf(await source(page), 'user')).toContain('stroke=ink');
  // a look colour's shades are its tints, so they follow the look; the row always holds five
  await page.keyboard.press('Shift+Digit1');
  expect(lineOf(await source(page), 'user')).toContain('stroke=ink/0.08');
  await expect(pop.getByRole('group', { name: 'Shades' }).locator('button')).toHaveCount(5);
  await expect(pop.getByRole('group', { name: 'Palette' }).getByRole('button', { name: 'ink', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await pop.getByRole('button', { name: 'none', exact: true }).click();
  await expect(pop.getByText('No shades for this colour')).toBeVisible();
  await pop.getByRole('button', { name: 'rose', exact: true }).click();
  await expect(pop.getByRole('group', { name: 'Shades' }).locator('button')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Custom stroke colour' })).toHaveCount(0);
  await page.locator('.panel').getByRole('button', { name: /^Style:/ }).click();
  await page.getByRole('dialog', { name: 'Styles' }).getByRole('radio', { name: 'cloud', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(lineOf(await source(page), 'user')).toMatch(/^user: cloud /);
  await page.keyboard.press('Escape');
  await sidebar(page, 'Components');
  await expect(page.locator('.thumbcard').first()).toBeVisible();
  await page.locator('.thumbcard', { hasText: 'optional' }).first().click();
  await expect(page.locator('.hintbar')).toContainText('Click or drag');
  const spot = await at(page, 700, 340);
  await page.mouse.click(spot.x, spot.y);
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^optional: optional at \d+,\d+$/);
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
  const field = page.locator('.panel').getByRole('textbox', { name: 'focal', exact: true });
  await field.fill('The service this is about');
  await field.press('Enter');
  expect(await source(page)).toContain('focal="The service this is about"');
  await field.fill('');
  await field.press('Enter');
  expect(lineOf(await source(page), 'legend')).not.toContain('focal=');
  // asked again, the menu adds what the legend lacks to the same legend instead of stacking a second one on it
  const before = lineOf(await source(page), 'legend');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Add a legend' }).click();
  expect(await source(page)).not.toContain('legend2');
  const after = lineOf(await source(page), 'legend');
  expect(after.startsWith(`${before} focal="`)).toBe(true);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Add a legend' }).click();
  await expect(page.locator('.status')).toHaveText('the legend already lists every component');
  expect(lineOf(await source(page), 'legend')).toBe(after);
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
  await expect(page.locator('.tab.on > button[role=tab]')).toHaveText('from-wiki.fdraw');
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
  // a header row, like Indexes, is added at the bottom and edited like any row; the x removes a row
  await page.getByRole('button', { name: 'Add header' }).click();
  expect(await source(page)).toContain('  | r1 "name" "value"\n  |= "Header"\norders:');
  await row(4).fill('Indexes');
  await row(4).press('Enter');
  expect(await source(page)).toContain('  | r1 "name" "value"\n  |= "Indexes"\norders:');
  await page.getByRole('button', { name: 'Remove row 4', exact: true }).click();
  expect(await source(page)).toContain('  | email "email" "citext" "UK"\n  | r1 "name" "value"\norders:');
  // removing the row an arrow ends on re-attaches the arrow to the table
  await page.getByRole('button', { name: 'Remove row 1', exact: true }).click();
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
  await page.getByRole('button', { name: /^End of the line/ }).click();
  await page.getByRole('dialog', { name: 'Line ends' }).getByRole('radio', { name: 'Zero or one' }).click();
  expect(lineOf(await source(page), 'fk')).toContain('head=zero-one');
  await page.getByRole('dialog', { name: 'Line ends' }).getByRole('radio', { name: 'Arrow', exact: true }).click();
  expect(lineOf(await source(page), 'fk')).toBe('fk: orders.user_id -- users.r1 style=relation tail=many head=arrow');
  await page.keyboard.press('Escape');
  void k;
  expect(errors).toEqual([]);
});

test('the panel names every line end, its end pickers follow the ends as drawn, and the text size shows the default', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  const sizeOn = page.locator('.panel [role="radiogroup"][aria-label="Text size"] button.on');
  // a box with no size of its own is drawn at 12: M
  await page.mouse.click(...Object.values(await corner(page, 'db')) as [number, number]);
  await expect(sizeOn).toHaveText('M');
  // picking the size it already has writes nothing
  await sizeOn.click();
  expect(lineOf(await source(page), 'db')).toBe('db: store "Orders DB" at 560,156');
  await page.keyboard.press('Escape');
  const mid = (await page.locator('polyline[data-id="r"]').boundingBox())!;
  await page.mouse.click(mid.x + mid.width / 2, mid.y + mid.height / 2);
  // each end is a button that shows it and names it
  const startBtn = page.getByRole('button', { name: /^Start of the line/ }), endBtn = page.getByRole('button', { name: /^End of the line/ });
  await expect(startBtn).toHaveAccessibleName('Start of the line: Nothing');
  await expect(endBtn).toHaveAccessibleName('End of the line: Arrow');
  await endBtn.click();
  const ends = page.getByRole('dialog', { name: 'Line ends' });
  await expect(ends.getByRole('radio', { name: 'Ring (stop)' })).toHaveCount(1);
  await ends.getByRole('radio', { name: 'Nothing' }).click();
  expect(lineOf(await source(page), 'r')).toContain('head=none');
  await expect(endBtn).toHaveAccessibleName('End of the line: Nothing');
  await page.keyboard.press('Escape');
  await startBtn.click();
  await page.getByRole('dialog', { name: 'Line starts' }).getByRole('radio', { name: 'Arrow', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(startBtn).toHaveAccessibleName('Start of the line: Arrow');
  // the old none / one / both row is gone: the Ends row says all of it
  await expect(page.locator('.panel h4', { hasText: 'Arrowheads' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a line\'s ends are one row, start then end as the line runs, each opening every end beside the panel', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  const mid = (await page.locator('polyline[data-id="r"]').boundingBox())!;
  await page.mouse.click(mid.x + mid.width / 2, mid.y + mid.height / 2);
  const startBtn = page.getByRole('button', { name: /^Start of the line/ }), endBtn = page.getByRole('button', { name: /^End of the line/ });
  const [sb, eb] = [(await startBtn.boundingBox())!, (await endBtn.boundingBox())!];
  expect(Math.abs(sb.y - eb.y)).toBeLessThan(2); // one row
  expect(sb.x + sb.width).toBeLessThanOrEqual(eb.x); // the start on the left
  await expect(endBtn.locator('svg path')).not.toHaveCount(0); // drawn as it is
  // every end, in groups, beside the panel
  await endBtn.click();
  const pop = page.getByRole('dialog', { name: 'Line ends' });
  await expect(pop.getByRole('radio')).toHaveCount(22);
  for (const g of ['Arrows', 'Shapes', 'Marks', 'Relationships']) await expect(pop.getByRole('radiogroup', { name: g })).toBeVisible();
  const [panelBox, popBox] = [await page.locator('.panel').boundingBox(), await pop.boundingBox()];
  expect(popBox!.x >= panelBox!.x + panelBox!.width || popBox!.x + popBox!.width <= panelBox!.x).toBe(true);
  // the end under the pointer is named and explained
  await pop.getByRole('radio', { name: 'Swept arrow' }).hover();
  await expect(pop.locator('.patterninfo')).toContainText('swept back to a notch');
  await pop.getByRole('radio', { name: 'Cross' }).click();
  await expect(pop).toBeVisible(); // it stays open while ends are tried
  expect(lineOf(await source(page), 'r')).toContain('head=cross');
  await expect(pop.getByRole('radio', { name: 'Cross' })).toHaveAttribute('aria-checked', 'true');
  await expect(endBtn).toHaveAccessibleName('End of the line: Cross');
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  // the start's popover draws the ends on the left
  await startBtn.click();
  await page.getByRole('dialog', { name: 'Line starts' }).getByRole('radio', { name: 'Swept arrow' }).click();
  expect(lineOf(await source(page), 'r')).toContain('tail=stealth');
  expect(errors).toEqual([]);
});

test('stroke width shows the nearest width for a look\'s own widths, and picking it again keeps the look\'s', async ({ page }) => {
  const errors = noPageErrors(page);
  await page.goto('/edit/');
  await page.waitForSelector('.welcome');
  await page.getByRole('button', { name: 'Architecture', exact: true }).click();
  await page.waitForSelector('svg.canvas');
  const pick = async (id: string) => {
    await page.keyboard.press('Escape');
    const b = (await page.locator(`polyline[data-id="${id}"]`).boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  const widthOn = page.locator('.panel [role="radiogroup"][aria-label="Stroke width"] button.on');
  const line = async () => (await source(page)).split('\n').find((l) => l.startsWith('cf -> astro'))!;
  await pick('_c19'); // cf -> astro style=primary: sw=1.4 in the look
  await expect(widthOn).toHaveAttribute('title', 'Medium');
  await widthOn.click();
  expect(await line()).toBe('cf -> astro "passes on" style=primary');
  await page.locator('.panel button[title="Bold"]').click();
  expect(await line()).toBe('cf -> astro "passes on" style=primary sw=2.4');
  await expect(widthOn).toHaveAttribute('title', 'Bold');
  await page.locator('.panel button[title="Medium"]').click();
  expect(await line()).toBe('cf -> astro "passes on" style=primary');
  await pick('_c17'); // reader -> cf style=link: sw=1.2
  await expect(widthOn).toHaveAttribute('title', 'Thin');
  expect(errors).toEqual([]);
});

test('a stroke width an agent wrote by hand shows as the nearest of the panel\'s widths', async ({ page }) => {
  const errors = noPageErrors(page);
  const widthOn = page.locator('.panel [role="radiogroup"][aria-label="Stroke width"] button.on');
  await paste(page, 'a: node "A" at 40,40 sw=1.8\nb: node "B" at 240,40 sw=3\n');
  await page.mouse.click(...Object.values(await corner(page, 'a')) as [number, number]);
  await expect(widthOn).toHaveAttribute('title', 'Medium');
  await page.keyboard.press('Escape');
  await page.mouse.click(...Object.values(await corner(page, 'b')) as [number, number]);
  await expect(widthOn).toHaveAttribute('title', 'Bold');
  expect(errors).toEqual([]);
});

test('spaces in a text are drawn on the canvas as written, and an indented cell keeps its spaces through the panel', async ({ page }) => {
  await paste(page, 'canvas 600x300\na: text "abc" at 40,40 font=mono\nb: text "    abc" at 40,70 font=mono\nt: table "T" at 40,120\n  | "x" "    y"\n');
  const len = (s: string) => page.locator('svg.canvas text').evaluateAll((ts, s) => (ts.find((t) => t.textContent === s) as SVGTextElement).getComputedTextLength(), s);
  expect(await len('    abc')).toBeGreaterThan(2 * await len('abc')); // four spaces drawn before "abc", not dropped
  await page.mouse.click(...Object.values(await corner(page, 't')) as [number, number]);
  const row = page.getByLabel('Row 1', { exact: true });
  await expect(row).toHaveValue('x |     y');
  await row.fill('x |       y');
  await row.press('Enter');
  expect(await source(page)).toContain('  | "x" "      y"');
});

test('a table can be placed from the components gallery', async ({ page }) => {
  await pinSidebar(page);
  await paste(page, SMALL);
  await sidebar(page, 'Components');
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
  await page.getByRole('radio', { name: 'Curved' }).click();
  expect(lineOf(await source(page), 'r1')).toBe('r1: a -> b style=primary route=curve');
  const k = await zoom(page);
  const h = (await page.locator('[data-seg="-1"]').boundingBox())!;
  await drag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, 0, -60 * k);
  expect(lineOf(await source(page), 'r1')).toBe('r1: a -> b style=primary route=curve bend=60');
  await page.getByRole('radio', { name: 'Right angles' }).click();
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
  await pinSidebar(page);
  const errors = noPageErrors(page);
  await paste(page, 'canvas 900x500\nt: h1 "Numbers" at 40,52\n');
  await sidebar(page, 'Components');
  await page.locator('.thumbcard', { hasText: 'chart' }).first().click();
  const spot = await at(page, 300, 200); // left of the pinned sidebar, whatever the title's width
  await page.mouse.click(spot.x, spot.y);
  expect(await source(page)).toMatch(/chart: chart "Title" at 140,112 320x180 x="A,B,C,D"\n  \| bars "Series" 30 50 40 70\n$/);
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

test('icons: the Duotone tab picks the outline over a tint, and Solid switches it', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'db')) as [number, number]);
  await page.locator('.iconchoose').click();
  await page.getByRole('tab', { name: 'Duotone' }).click();
  const duo = page.getByRole('radiogroup', { name: 'Duotone icons' });
  // the tiles show the tint under the outline
  await expect(duo.getByRole('radio', { name: 'database', exact: true }).locator('path[opacity="0.2"]')).toHaveCount(1);
  await duo.getByRole('radio', { name: 'database', exact: true }).click();
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database icon\.style=duotone$/);
  await page.locator('.iconchoose').click();
  await expect(duo.getByRole('radio', { name: 'database', exact: true })).toBeChecked();
  // drawn as the tint, then the outline over it
  await expect(page.locator('svg.canvas g[transform*="scale(0.0"] > path + g > path[d^="M128,24"]')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Solid' }).click();
  await page.getByRole('radiogroup', { name: 'Solid icons' }).getByRole('radio', { name: 'database', exact: true }).click();
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database icon\.style=solid$/);
  await expect(page.locator('.problems')).toHaveText('No problems');
  expect(errors).toEqual([]);
});

test('icons: the Solid tab picks the filled twin of an icon, and Outline takes it back', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'db')) as [number, number]);
  await page.locator('.iconchoose').click();
  await page.getByRole('tab', { name: 'Solid' }).click();
  const solid = page.getByRole('radiogroup', { name: 'Solid icons' });
  await solid.getByRole('radio', { name: 'database', exact: true }).click();
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database icon\.style=solid$/);
  // picking closes the dialog; reopening it shows the chosen icon on the Solid tab
  await expect(page.getByRole('dialog', { name: 'Choose an icon' })).toHaveCount(0);
  await page.locator('.iconchoose').click();
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

test('icons: the Icon tool in the top bar places any Phosphor icon, and the last five icons come back in the sidebar', async ({ page }) => {
  await pinSidebar(page);
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  // the Components tab no longer lists the icon: it is a tool in the top bar
  await sidebar(page, 'Components');
  await expect(page.locator('.thumbcard', { hasText: 'an icon on its own' })).toHaveCount(0);
  // pick an icon only the full set has, in the solid style, then click the canvas to place it
  await page.getByRole('button', { name: 'Icon', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose an icon' });
  await page.getByRole('tab', { name: 'Solid' }).click();
  await page.getByLabel('Search icons').fill('anchor');
  await dialog.getByRole('radio', { name: 'anchor', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Icon', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const spot = await at(page, 700, 340);
  await page.mouse.click(spot.x, spot.y);
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^icon: icon at \d+,\d+ icon=anchor icon\.style=solid$/);
  await expect(page.locator('.problems')).toHaveText('No problems');
  // the sidebar offers the last five icons used, newest first, and a click applies one
  const pick = async (name: string) => {
    await page.locator('.iconchoose').click();
    await page.getByRole('tab', { name: 'Outline' }).click();
    await page.getByLabel('Search icons').fill(name);
    await dialog.getByRole('radio', { name, exact: true }).click();
  };
  const quick = page.getByRole('group', { name: 'Icons' });
  const names = () => quick.locator('button[aria-pressed]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  // the icon just used comes first, and the starter icons fill the rest
  expect(await names()).toEqual(['Icon anchor', 'Icon server', 'Icon database', 'Icon cloud', 'Icon user']);
  for (const n of ['server', 'database', 'cloud', 'lock', 'key']) await pick(n);
  expect(await names()).toEqual(['Icon key', 'Icon lock', 'Icon cloud', 'Icon database', 'Icon server']);
  await quick.getByRole('button', { name: 'Icon database' }).click();
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^icon: icon at \d+,\d+ icon=database$/);
  expect((await names())[0]).toBe('Icon database');
  // I opens the same dialog, and Escape closes it
  await page.mouse.click(...Object.values(await at(page, 100, 60)) as [number, number]);
  await page.keyboard.press('i');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.problems')).toHaveText('No problems');
  expect(errors).toEqual([]);
});

test('icons: a diagram that uses an icon from the rest of Phosphor draws it once they have loaded', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, 'a: rect "Anchor" at 40,40 120x60 icon=anchor\nb: rect "Book" at 240,40 120x60 icon=ph-book icon.style=duotone\n');
  await expect(page.locator('.problems')).toHaveText('No problems');
  await expect(page.locator('svg.canvas g[transform*="scale(0.0"]')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('icons: the sidebar offers five icons from the start, and a tile that opens a dialog with every icon', async ({ page }) => {
  await pinSidebar(page);
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'db')) as [number, number]);
  // five starter icons, none chosen yet, and one click picks one
  const quick = page.getByRole('group', { name: 'Icons' });
  expect(await quick.locator('button[aria-pressed]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Icon server', 'Icon database', 'Icon cloud', 'Icon user', 'Icon lock']);
  await expect(quick.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await quick.getByRole('button', { name: 'Icon lock' }).click();
  expect(lineOf(await source(page), 'db')).toMatch(/icon=lock$/);
  await expect(quick.getByRole('button', { name: 'Icon lock' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.iconchoose').click();
  const dialog = page.getByRole('dialog', { name: 'Choose an icon' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio').first()).toBeVisible();
  // the dialog is not clipped to the sidebar: it covers the whole editor
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeGreaterThan(400);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.locator('.iconchoose').click();
  await page.getByLabel('Search icons').fill('database');
  await dialog.getByRole('radio', { name: 'database', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database$/);
  // there is no way to take the icon away in the panel
  await expect(page.getByRole('button', { name: 'Remove icon' })).toHaveCount(0);
  await expect(page.locator('.problems')).toHaveText('No problems');
  expect(errors).toEqual([]);
});

test('icons: choose one for a box in the panel, move it above the text, and place an icon on its own', async ({ page }) => {
  await pinSidebar(page);
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'db')) as [number, number]);
  // the tall panel scrolls; it never squashes the menu button above it
  expect((await page.getByRole('button', { name: 'Menu' }).boundingBox())!.height).toBe(38);
  // the sidebar shows the chosen icon; every icon is in the dialog that opens from it
  await page.locator('.iconchoose').click();
  const tiles = page.getByRole('radiogroup', { name: 'Icons' });
  expect(await tiles.getByRole('radio').count()).toBeGreaterThan(50);
  await tiles.getByRole('radio', { name: 'database', exact: true }).click();
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database$/);
  await expect(page.getByRole('button', { name: 'Icon database', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.iconchoose').click();
  await expect(tiles.getByRole('radio', { name: 'database', exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.locator('svg.canvas g[transform*="scale(0.0"] path[d^="M128,24"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Above the text' }).click();
  expect(lineOf(await source(page), 'db')).toMatch(/icon=database icon\.pos=top$/);
  // the search narrows the tiles, and Enter takes the first match
  await page.locator('.iconchoose').click();
  await page.getByLabel('Search icons').fill('lambda');
  await expect(tiles.getByRole('radio', { name: 'function', exact: true })).toBeVisible();
  await page.getByLabel('Search icons').fill('zzqx');
  await expect(tiles.getByRole('radio')).toHaveCount(0);
  await expect(tiles).toContainText('No icon is called anything like');
  await page.getByLabel('Search icons').fill('balanc');
  // a name that has the word comes before an icon that only has it among Phosphor's search words
  await expect(tiles.getByRole('radio').first()).toHaveAttribute('aria-label', 'load-balancer');
  await page.getByLabel('Search icons').press('Enter');
  expect(lineOf(await source(page), 'db')).toMatch(/icon=load-balancer icon\.pos=top$/);
  await expect(page.getByRole('button', { name: 'Icon load-balancer', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // size and colour
  await page.getByRole('group', { name: 'Icon size' }).getByRole('button', { name: 'L', exact: true }).click();
  expect(lineOf(await source(page), 'db')).toContain('icon.size=32');
  await page.getByRole('group', { name: 'Icon size' }).getByRole('button', { name: 'Auto' }).click();
  expect(lineOf(await source(page), 'db')).not.toContain('icon.size');
  // the icon's colour and tint: each a chip showing it, which opens the palette
  await page.getByRole('button', { name: 'Icon colour' }).click();
  await page.getByRole('dialog', { name: 'Icon colour' }).getByRole('button', { name: 'violet', exact: true }).click();
  expect(lineOf(await source(page), 'db')).toContain('icon.color=violet');
  await page.keyboard.press('Escape');
  // any colour, from the hex field
  await pickHex(page, 'Icon colour', '#e0457b');
  expect(lineOf(await source(page), 'db')).toContain('icon.color=#e0457b');
  await expect(page.locator('svg.canvas g[fill="#e0457b"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Icon colour' }).locator('.dot')).toHaveCSS('background-color', 'rgb(224, 69, 123)');
  // a fill inside the icon's closed parts: any colour, or none
  await pickHex(page, 'Icon tint', '#ffd400');
  expect(lineOf(await source(page), 'db')).toContain('icon.fill=#ffd400');
  await expect(page.locator('svg.canvas path[fill="#ffd400"]')).toHaveCount(1); // the tint under the icon
  // the store style tints its icon, so "none" is written out; leaving it off would bring the style's tint back
  await page.getByRole('dialog', { name: 'Icon tint' }).getByRole('button', { name: 'none', exact: true }).click();
  expect(lineOf(await source(page), 'db')).toContain('icon.fill=none');
  await page.keyboard.press('Escape');
  // the weight: a line thickness in pixels on screen, the nearest of the icon's weights
  await page.getByRole('group', { name: 'Icon weight' }).getByRole('button', { name: 'Bold' }).click();
  expect(lineOf(await source(page), 'db')).toContain('icon.width=2');
  await page.getByRole('group', { name: 'Icon weight' }).getByRole('button', { name: 'Regular' }).click();
  expect(lineOf(await source(page), 'db')).not.toContain('icon.width');
  await page.locator('.iconchoose').click();
  await tiles.getByRole('radio', { name: 'load-balancer', exact: true }).click(); // the chosen icon, clicked again, stays
  expect(lineOf(await source(page), 'db')).toContain('icon=load-balancer');
  // an icon on its own comes from the Icon tool in the top bar: pick it in the dialog, then click the canvas
  await page.getByRole('button', { name: 'Icon', exact: true }).click();
  await page.getByRole('dialog', { name: 'Choose an icon' }).getByRole('radio', { name: 'server', exact: true }).click();
  const spot = await at(page, 700, 340);
  await page.mouse.click(spot.x, spot.y);
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^icon: icon at \d+,\d+ icon=server$/);
  // an icon on its own is the shape: no box to style, its fill, stroke and stroke width are the icon's
  await page.keyboard.press('Escape');
  await page.mouse.click(...Object.values(await corner(page, 'icon')) as [number, number]);
  await expect(page.locator('.panel .plabel', { hasText: 'Fill' })).toHaveCount(0);
  await expect(page.locator('.panel [aria-label="Stroke style"]')).toHaveCount(0);
  const ifills = page.getByRole('group', { name: 'Icon fill colours' });
  const itint = await ifills.locator('.swatch').nth(1).getAttribute('aria-label');
  await ifills.locator('.swatch').nth(1).click();
  await pickHex(page, 'Custom icon colour', '#0369a1');
  await page.getByRole('group', { name: 'Icon weight' }).getByRole('button', { name: 'Bold' }).click();
  expect(lineOf(await source(page), 'icon')).toMatch(new RegExp(`icon=server fill=${itint!.replace(/[/.]/g, '\\$&')} stroke=#0369a1 sw=2$`));
  await expect(page.locator('svg.canvas g[fill="#0369a1"]')).toHaveCount(1);
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
  await page.locator('.iconchoose').click();
  await expect(page.getByRole('radiogroup', { name: 'Icons' })).toContainText("The look's icons");
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
  await expect(page.getByRole('tablist', { name: 'Open diagrams' }).getByRole('tab')).toHaveText(['untitled', 'untitled 2']); // the first one is still open beside it
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
  await expect(page.getByRole('tablist', { name: 'Open diagrams' }).getByRole('tab')).toHaveText(['pasted diagram', 'untitled']);
  await page.getByRole('tab', { name: 'pasted diagram' }).click();
  expect(await source(page)).toBe(drawn);
  await expect(page.locator('.status')).toHaveText('saved in this browser');
  await expect.poll(() => kept(page)).toEqual({ tabs: ['pasted diagram', 'untitled'], active: 'pasted diagram' });

  await page.reload();
  await page.waitForSelector('svg.canvas');
  await expect(page.getByRole('tablist', { name: 'Open diagrams' }).getByRole('tab')).toHaveText(['pasted diagram', 'untitled']);
  await expect(page.getByRole('tab', { name: 'pasted diagram' })).toHaveAttribute('aria-selected', 'true');
  expect(await source(page)).toBe(drawn);
  await page.keyboard.press('Control+z');
  expect(await source(page)).toBe(SMALL);
  await page.getByRole('tab', { name: 'untitled' }).click();
  expect(await source(page)).toBe('\n');
  expect(errors).toEqual([]);
});

test('at phone width every tool and the menu button can be reached, and the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await paste(page, SMALL);
  const menu = (await page.getByRole('button', { name: 'Menu' }).boundingBox())!;
  // what is under the middle of the menu button is the menu button
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'), [menu.x + menu.width / 2, menu.y + menu.height / 2])).toBe('Menu');
  for (const b of await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button').all()) {
    const r = (await b.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(390);
    expect(r.x >= menu.x + menu.width || r.y >= menu.y + menu.height).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // the problems badge leaves the zoom, undo and theme buttons beside it uncovered
  const badge = (await page.locator('.problems').boundingBox())!;
  for (const b of await page.locator('.bottomleft button').all()) {
    const r = (await b.boundingBox())!;
    expect(r.x + r.width <= badge.x || r.y + r.height <= badge.y).toBe(true);
  }
  await expect(page.getByRole('button', { name: 'No problems' })).toBeVisible();
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('menuitem', { name: /Export image/ })).toBeVisible();
});

test('Ctrl+= and Ctrl+- zoom the canvas, Ctrl+0 resets it, and the browser does not zoom the page', async ({ page }) => {
  await paste(page, SMALL);
  const pct = page.locator('button.pct');
  // the keys reach the page with the browser's default (page zoom) cancelled
  await page.evaluate(() => window.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key !== 'Control') (window as unknown as { prevented: boolean[] }).prevented = [...((window as unknown as { prevented?: boolean[] }).prevented ?? []), e.defaultPrevented]; }));
  await page.keyboard.press('Control+0');
  await expect(pct).toHaveText('100%');
  await page.keyboard.press('Control+=');
  await expect(pct).toHaveText('120%');
  await page.keyboard.press('Control+-');
  await page.keyboard.press('Control+-');
  await expect(pct).toHaveText('83%');
  await page.keyboard.press('Control+0');
  await expect(pct).toHaveText('100%');
  expect(await page.evaluate(() => (window as unknown as { prevented: boolean[] }).prevented)).toEqual([true, true, true, true, true]);
});

test('Escape closes the export and paste dialogs, from the shortcut and from the menu', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  const exp = page.getByRole('dialog', { name: 'Export image' }), pst = page.getByRole('dialog', { name: 'Paste diagram text' });
  await page.keyboard.press('Control+Shift+E');
  await expect(exp).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(exp).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /Export image/ }).click();
  await expect(exp).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(exp).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Paste diagram text' }).click();
  await expect(pst.locator('textarea')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pst).toBeHidden();
  await expect(page.getByRole('tablist', { name: 'Open diagrams' }).getByRole('tab')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('pasting a Mermaid diagram opens it laid out as FastDraw; one it cannot read says why and stays in the box', async ({ page }) => {
  const errors = noPageErrors(page);
  // as a chat assistant writes it: in a fenced block, with words around
  await paste(page, 'Here is the flow:\n\n```mermaid\nflowchart TD\n  A[Start] --> B{Ready?}\n  B -->|yes| C([Done])\n```\n');
  const text = await source(page);
  expect(lineOf(text, 'B')).toMatch(/^B: decision "Ready\?" at \d+,\d+ \d+x\d+$/);
  expect(text).toMatch(/B\.\w+ -> C\.\w+ "yes"/);
  await expect(page.getByRole('tab', { name: 'pasted Mermaid diagram' })).toBeVisible();
  await expect(page.locator('svg.canvas')).toContainText('Ready?');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Paste diagram text' }).click();
  const box = page.getByRole('dialog', { name: 'Paste diagram text' });
  await box.locator('textarea').fill('flowchart TD\n  subgraph s\n  a --> b\n');
  await box.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(box.getByRole('alert')).toHaveText('Mermaid, line 3: subgraph s is not closed with end');
  await expect(box.locator('textarea')).toHaveValue(/subgraph s/);
  await box.locator('textarea').fill('sequenceDiagram\n  A->>B: hi\n');
  await expect(box.getByRole('alert')).toBeHidden();
  await box.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(box).toBeHidden();
  expect(await source(page)).toMatch(/^A_l: A\.bottom -- \+0,\d+ style=lifeline layer=back$/m);
  expect(errors).toEqual([]);
});

test('each tab keeps its own diagram and history; closing one asks first and stays closed after a reload', async ({ page }) => {
  await paste(page, SMALL);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Paste diagram text' }).click();
  await page.locator('.modal textarea').fill('canvas 600x400\nx: node "Second" at 80,80\n');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'Open diagrams' }).getByRole('tab')).toHaveText(['pasted diagram', 'pasted diagram 2']);
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
  await expect(page.getByRole('tablist', { name: 'Open diagrams' }).getByRole('tab')).toHaveText(['pasted diagram', 'second']);

  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await page.getByRole('button', { name: 'Close second' }).click();
  expect(asked).toContain('kept only in this browser');
  await expect(page.getByRole('tablist', { name: 'Open diagrams' }).getByRole('tab')).toHaveCount(2);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Close second' }).click();
  await expect(page.getByRole('tablist', { name: 'Open diagrams' }).getByRole('tab')).toHaveText(['pasted diagram']);
  await expect.poll(() => kept(page)).toEqual({ tabs: ['pasted diagram'], active: 'pasted diagram' });
  await page.reload();
  await page.waitForSelector('svg.canvas');
  await expect(page.getByRole('tablist', { name: 'Open diagrams' }).getByRole('tab')).toHaveText(['pasted diagram']);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Close pasted diagram' }).click();
  await page.waitForSelector('.welcome');
  await expect.poll(() => kept(page)).toEqual({ tabs: [], active: null });
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

test('legend in the panel: a title, a remove button on each entry, and entries added from a list', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL + 'key: legend at 40,300 external="Shopper" focal="The service"\n');
  await page.locator('[data-id="key"]').first().click();
  const panel = page.locator('.panel');
  const title = panel.getByRole('textbox', { name: 'Legend title' });
  await title.fill('What it shows');
  await title.press('Enter');
  expect(lineOf(await source(page), 'key')).toContain('title="What it shows"');
  await panel.getByRole('button', { name: 'Remove external' }).click();
  expect(lineOf(await source(page), 'key')).not.toContain('external=');
  // the list offers the styles the diagram uses first, then colours
  const add = panel.getByRole('combobox', { name: 'Add a legend entry' });
  await expect(add.locator('optgroup').first()).toHaveAttribute('label', 'In this diagram');
  await add.selectOption('swatch.accent');
  expect(lineOf(await source(page), 'key')).toContain('swatch.accent="What it means"');
  await add.selectOption('store');
  expect(lineOf(await source(page), 'key')).toMatch(/ store="[^"]+"/);
  await title.fill('');
  await title.press('Enter');
  expect(lineOf(await source(page), 'key')).not.toContain('title=');
  await expect(page.locator('.problems')).toHaveText('No problems');
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

test('`fastdraw open` lends the diagram: it opens with its look and icons, edits save back, outside edits come in', async ({ page, baseURL }) => {
  const dir = mkdtempSync(join(tmpdir(), 'fdopen-'));
  cpSync(resolve(import.meta.dirname, '../examples/look-test'), dir, { recursive: true });
  const file = join(dir, 'team-icons.fdraw');
  const s = await serveDiagrams(dir, { editor: baseURL!, open: 'team-icons.fdraw' });
  try {
    const errors = noPageErrors(page);
    await page.goto(s.url);
    await page.waitForSelector('svg.canvas');
    await saved(page);
    expect(new URL(page.url()).search + new URL(page.url()).hash).toBe(''); // the link is not kept for a reload
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

test('`fastdraw open` link naming a diagram it does not share: says so, and opens no other diagram', async ({ page, baseURL }) => {
  const dir = mkdtempSync(join(tmpdir(), 'fdopen-miss-'));
  cpSync(resolve(import.meta.dirname, '../examples/look-test'), dir, { recursive: true });
  const s = await serveDiagrams(dir, { editor: baseURL!, open: 'team-icons.fdraw' });
  try {
    const u = new URL(s.url);
    const h = new URLSearchParams(u.hash.slice(1));
    h.set('open', 'architecture.fdraw');
    u.hash = h.toString();
    await page.goto(u.href);
    await expect(page.getByText(/is not sharing architecture\.fdraw/)).toBeVisible();
    await expect(page.locator('svg.canvas rect[data-id="vm"]')).toHaveCount(0);
  } finally { await s.close(); }
});

test('`fastdraw open` on a diagram whose look is in a folder above it: the look loads and edits save', async ({ page, baseURL }) => {
  const repo = mkdtempSync(join(tmpdir(), 'fdopen-up-'));
  mkdirSync(join(repo, 'examples', 'kinds'), { recursive: true });
  mkdirSync(join(repo, 'looks'));
  cpSync(resolve(import.meta.dirname, '../looks/reference.look'), join(repo, 'looks', 'reference.look'));
  const file = join(repo, 'examples', 'kinds', 'deployment.fdraw');
  cpSync(resolve(import.meta.dirname, '../examples/kinds/deployment.fdraw'), file);
  const src = readFileSync(file, 'utf8');
  expect(src).toMatch(/^look "\.\.\/\.\.\/looks\/reference\.look"/);
  const { root, open } = openRoot(file, src, repo);
  const s = await serveDiagrams(root, { editor: baseURL!, open });
  try {
    const errors = noPageErrors(page);
    await page.goto(s.url);
    await page.waitForSelector('svg.canvas');
    await expect(page.locator('rect[data-id="ingress"]').first()).toBeVisible();
    await expect(page.getByText('which is not loaded')).toHaveCount(0);
    const k = await zoom(page);
    await drag(page, await corner(page, 'ingress'), 40 * k, 0);
    await saved(page);
    expect(lineOf(readFileSync(file, 'utf8'), 'ingress')).toContain('at 96,128');
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
  const patterns = page.locator('.canvasbg [role="radiogroup"]');
  await expect(patterns.getByRole('radio', { name: 'Dots', exact: true })).toHaveAttribute('aria-checked', 'true');
  await patterns.getByRole('radio', { name: 'None' }).click();
  expect(lineOf(await source(page), 'canvas')).toBe('canvas paper=#ffffff dots=none');
  await expect(page.locator('svg.canvas rect[fill="url(#fd-dots)"]')).toHaveCount(0);
  // another pattern, in the popover beside the menu, turns the look's dots off and draws itself over the whole view
  await expect(patterns.getByRole('radio', { name: 'Isometric dots' })).toHaveCount(0);
  await patterns.getByRole('button', { name: 'More patterns' }).click();
  const pop = page.getByRole('dialog', { name: 'Background patterns' });
  const [menuBox, popBox] = [await page.locator('.dropdown').boundingBox(), await pop.boundingBox()];
  expect(popBox!.x).toBeGreaterThanOrEqual(menuBox!.x + menuBox!.width); // to the side, not inside the menu
  await pop.getByRole('radio', { name: 'Isometric dots' }).click();
  await expect(pop).toBeVisible(); // it stays open while patterns are tried
  await expect(pop.getByRole('radio', { name: 'Isometric dots' })).toHaveAttribute('aria-checked', 'true');
  await expect(patterns.getByRole('button', { name: 'More patterns' })).toHaveClass(/\bon\b/);
  expect(lineOf(await source(page), 'canvas')).toBe('canvas paper=#ffffff dots=none iso=ink/0.14');
  await expect(page.locator('svg.canvas rect[fill="url(#fd-iso)"]')).toHaveCount(1);
  // each tile has a key, as the colours do: e is the third, the grid
  await page.keyboard.press('e');
  expect(lineOf(await source(page), 'canvas')).toBe('canvas paper=#ffffff dots=none grid=ink/0.07');
  await page.keyboard.press('a');
  expect(lineOf(await source(page), 'canvas')).toBe('canvas paper=#ffffff dots=none iso=ink/0.14');
  // under the grid, the current pattern's name and what it is for; a hovered tile shows its own
  await expect(pop.locator('.patterninfo')).toContainText('Isometric dotsDots on a triangle lattice');
  await pop.getByRole('radio', { name: 'Hexagons' }).hover();
  await expect(pop.locator('.patterninfo')).toContainText('A honeycomb of hexagons');
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  // back to the look's own dots drops the override
  await patterns.getByRole('radio', { name: 'Dots', exact: true }).click();
  expect(lineOf(await source(page), 'canvas')).toBe('canvas paper=#ffffff');
  await page.getByRole('button', { name: "Use the look's background" }).click();
  expect(lineOf(await source(page), 'canvas')).toBe('');
});

test('a dark look offers dark page colours first, and the light ones in the popover', async ({ page }) => {
  await paste(page, SMALL);
  await page.getByRole('button', { name: 'Dark theme' }).click(); // the built-in look is drawn in Night
  await page.getByRole('button', { name: 'Menu' }).click();
  const quick = page.locator('.canvasbg .swatch');
  await expect(quick).toHaveCount(5);
  await expect(quick.nth(0)).toHaveAttribute('aria-label', 'paper'); // the look's own page
  await expect(quick.nth(1)).toHaveAttribute('aria-label', '#0d0f14');
  await expect(page.locator('.canvasbg [aria-label="#ffffff"]')).toHaveCount(0);
  await quick.nth(2).click();
  expect(lineOf(await source(page), 'canvas')).toBe('canvas paper=#16181d');
  await expect(page.locator('svg.canvas')).toHaveCSS('background-color', 'rgb(22, 24, 29)');
  // white is still there, past the dark ones
  await page.getByRole('button', { name: 'Custom background colour' }).click();
  await expect(page.getByRole('dialog', { name: 'Custom background colour' }).locator('[aria-label="#ffffff"]')).toHaveCount(1);
});

test('a look with a grid rules the whole canvas in squares, not just the diagram', async ({ page }) => {
  const look = 'canvas paper=#1060c0 grid=#ffffff/0.16 gridgap=24\nstyle node shape=rect size=144x64 fill=none stroke=#ffffff title.color=#ffffff\n';
  await openFolder(page, { 'd.fdraw': 'look "./plan.look"\na: node "A" at 40,40\n', 'plan.look': look });
  const canvas = page.locator('svg.canvas');
  const grid = canvas.locator('rect[fill="url(#fd-grid)"]');
  await expect(grid).toHaveCount(1);
  await expect(canvas.locator('#fd-grid')).toHaveCount(1);
  const box = (await grid.boundingBox())!, view = (await canvas.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(view.width - 1);
  expect(box.height).toBeGreaterThanOrEqual(view.height - 1);
  await page.screenshot({ path: 'test-results/grid-canvas.png' });
});

test('a look with listing paper fills the whole canvas with its bars and sprocket feed', async ({ page }) => {
  // Listing lives in coccor/fastdraw-looks now; the copy the renderer tests use stands in for it
  await openFolder(page, { 'd.fdraw': 'look "./listing.look"\na: node "A" at 40,40\nb: node "B" at 240,40\na -> b\n', 'listing.look': repoText('test/fixtures/looks/listing.look') });
  const canvas = page.locator('svg.canvas');
  const bars = canvas.locator('rect[fill="url(#fd-bars)"]');
  await expect(bars).toHaveCount(1);
  await expect(canvas.locator('#fd-bars')).toHaveCount(1);
  // the bars cover the view, not just the diagram's box
  const box = (await bars.boundingBox())!, view = (await canvas.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(view.width - 1);
  expect(box.height).toBeGreaterThanOrEqual(view.height - 1);
  await expect(canvas.locator('rect[fill="url(#fd-feed-l)"]')).toHaveCount(1);
  await expect(canvas.locator('rect[fill="url(#fd-feed-r)"]')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/listing-canvas.png' });
});

// A repository on GitHub with one look in it, served from the test instead of the network: acme/brand has
// looks/teal.look (Shade with a teal card colour, to tell it apart on the canvas) and a broken.look that is not there.
const GH_RAW = 'https://raw.githubusercontent.com/acme/brand/main/';
async function fakeGitHub(page: import('@playwright/test').Page): Promise<string[]> {
  const asked: string[] = [];
  const teal = repoText('looks/shade.look').replace(/^color card .*$/m, 'color card #ccfbf1');
  await page.route('https://api.github.com/**', (r) => {
    const u = r.request().url();
    asked.push(u);
    if (u.endsWith('/repos/acme/brand')) return r.fulfill({ json: { default_branch: 'main' } });
    if (u.includes('/repos/acme/brand/git/trees/main')) return r.fulfill({ json: { tree: [{ path: 'README.md', type: 'blob' }, { path: 'looks/teal.look', type: 'blob' }, { path: 'looks/broken.look', type: 'blob' }] } });
    return r.fulfill({ status: 404, json: {} });
  });
  await page.route(GH_RAW + '**', (r) => r.request().url().endsWith('/teal.look') ? r.fulfill({ body: teal, contentType: 'text/plain' }) : r.fulfill({ status: 404, body: '' }));
  return asked;
}

test('looks from GitHub: a repository lists its looks, and a click names one by its address', async ({ page }) => {
  const errors = noPageErrors(page);
  const RAW = GH_RAW;
  const asked = await fakeGitHub(page);
  const PLAIN = SMALL.replace('canvas 900x420\n', '');
  await paste(page, PLAIN);
  await sidebar(page, 'Look');
  const gh = page.getByRole('region', { name: 'Looks from GitHub' });
  await expect(gh.getByRole('button', { name: /Show FastDraw’s looks/ })).toBeVisible();
  // something that is not a repository says what to type
  await gh.getByRole('textbox').fill('not a repo');
  await gh.getByRole('button', { name: 'Show looks' }).click();
  await expect(gh).toContainText('Type owner/repo');
  await gh.getByRole('textbox').fill('https://github.com/acme/brand');
  await gh.getByRole('button', { name: 'Show looks' }).click();
  const teal = gh.getByRole('button', { name: /^Teal/ });
  await expect(teal).toBeVisible();
  await expect(gh).toContainText('1 of 2 could not be fetched.');
  await expect(teal.locator('svg.lookthumb text', { hasText: 'Orders API' })).toHaveCount(1);
  // hovering tries it on the canvas; the source is untouched
  const box = page.locator('svg.canvas').locator('[fill="#ccfbf1"]');
  await teal.hover();
  await expect(box.first()).toBeVisible();
  expect(await source(page)).toBe(PLAIN);
  // a click names it by its raw address
  await teal.click();
  expect(await source(page)).toBe(`look "${RAW}looks/teal.look"\n` + PLAIN);
  await expect(teal).toContainText('in use');
  await page.mouse.move(5, 880);
  await expect(box.first()).toBeVisible();
  await expect(page.locator('.problems')).toHaveText('No problems');
  // undo goes back to the built-in look; listing again asks GitHub nothing new
  await page.keyboard.press('Control+z');
  expect(await source(page)).toBe(PLAIN);
  const listed = asked.length;
  await gh.getByRole('button', { name: 'Show looks' }).click();
  await expect(teal).toBeVisible();
  expect(asked.length).toBe(listed);
  await teal.click();
  await page.mouse.move(5, 880);
  await page.screenshot({ path: 'test-results/github-looks.png' });
  expect(errors).toEqual([]);
});

test('a diagram that names a look by its address fetches it when opened, and says so when it is not there', async ({ page }) => {
  const errors = noPageErrors(page);
  await fakeGitHub(page);
  const PLAIN = SMALL.replace('canvas 900x420\n', '');
  await paste(page, `look "${GH_RAW}looks/teal.look"\n` + PLAIN);
  await expect(page.locator('svg.canvas').locator('[fill="#ccfbf1"]').first()).toBeVisible();
  await expect(page.locator('.problems')).toHaveText('No problems');
  // the look picker offers it as the diagram's look, under its own name
  await sidebar(page, 'Look');
  await expect(page.locator('.lookcard > span').last()).toHaveText('Teal · acme/brand · in use');
  expect(errors).toEqual([]);
});

test('a diagram whose look address has no file says so', async ({ page }) => {
  await fakeGitHub(page);
  await paste(page, `look "${GH_RAW}looks/gone.look"\n` + SMALL.replace('canvas 900x420\n', ''));
  await expect(page.locator('.banner')).toContainText(`There is no look file at ${GH_RAW}looks/gone.look.`);
});

test('the look picker: hover shows the diagram in a look, a click uses it at once, undo goes back', async ({ page }) => {
  const errors = noPageErrors(page);
  const PLAIN = SMALL.replace('canvas 900x420\n', '');
  await paste(page, PLAIN);
  const canvas = page.locator('svg.canvas');
  const title = canvas.locator('text', { hasText: 'Orders API' }).first();
  await sidebar(page, 'Look');
  const cards = page.locator('.lookcard');
  const card = (name: string) => page.getByRole('button', { name: new RegExp('^' + name) });
  await expect(page.locator('.lookcard > span')).toHaveText(['Built-in · in use', 'Reference', 'Shade', 'Sketch', 'Whiteboard']);
  await expect(cards.locator('svg.lookthumb text', { hasText: 'Orders API' })).toHaveCount(5); // every card shows this diagram
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
  // Esc folds a sidebar that was opened from the rail
  await page.keyboard.press('Escape');
  await expect(page.locator('.lookpicker')).toHaveCount(0);
  await page.locator('.problems').click();
  await expect(page.locator('.issuelist')).not.toContainText(/style|look/);
  await page.locator('.problems').click();
  // hovering then Esc leaves the look in use as it was
  await sidebar(page, 'Look');
  await card('Shade').hover();
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveCSS('background-color', 'rgb(250, 250, 251)');
  expect(await source(page)).toBe('look whiteboard\n' + PLAIN);
  // back to the built-in look removes the line; undo brings it back
  await sidebar(page, 'Look');
  await card('Built-in').click();
  expect(await source(page)).toBe(PLAIN);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  expect(await source(page)).toBe('look whiteboard\n' + PLAIN);
  expect(errors).toEqual([]);
});

test('the theme picks each look\'s version: dark draws the dark one, and the menu offers each look once', async ({ page }) => {
  const errors = noPageErrors(page);
  const PLAIN = SMALL.replace('canvas 900x420\n', '');
  await paste(page, PLAIN);
  const canvas = page.locator('svg.canvas');
  await expect(canvas).toHaveCSS('background-color', 'rgb(243, 243, 245)'); // the built-in look
  // dark: the built-in look is drawn in Night, and the file is not changed
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await expect(canvas).toHaveCSS('background-color', 'rgb(11, 18, 38)');
  expect(await source(page)).toBe(PLAIN);
  // the menu shows each look once, drawn dark: no Night and no shade-dark
  await sidebar(page, 'Look');
  await expect(page.locator('.lookcard > span')).toHaveText(['Built-in · in use', 'Reference', 'Shade', 'Sketch', 'Whiteboard']);
  await expect(page.locator('.lookcard').first().locator('svg.lookthumb rect').first()).toBeAttached();
  // choosing Shade names Shade; the canvas draws its dark version
  await page.getByRole('button', { name: /^Shade/ }).click();
  expect(await source(page)).toBe('look shade\n' + PLAIN);
  await page.mouse.move(5, 880);
  await expect(canvas).toHaveCSS('background-color', 'rgb(22, 23, 28)');
  await page.keyboard.press('Escape');
  // light again: Shade itself
  await page.getByRole('button', { name: 'Light theme' }).click();
  await expect(canvas).toHaveCSS('background-color', 'rgb(245, 245, 245)');
  expect(await source(page)).toBe('look shade\n' + PLAIN);
  expect(errors).toEqual([]);
});

test('a diagram that names Night is the built-in look in the light theme, in use under Built-in', async ({ page }) => {
  const PLAIN = SMALL.replace('canvas 900x420\n', '');
  await paste(page, 'look night\n' + PLAIN);
  await expect(page.locator('svg.canvas')).toHaveCSS('background-color', 'rgb(243, 243, 245)');
  await sidebar(page, 'Look');
  await expect(page.locator('.lookcard > span').first()).toHaveText('Built-in · in use');
  expect(await source(page)).toBe('look night\n' + PLAIN);
});

test('export draws the light or the dark version, starting with the theme\'s', async ({ page }) => {
  await paste(page, SMALL);
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /Export image/ }).click();
  const version = page.getByRole('group', { name: 'Version' });
  await expect(version.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  const img = page.locator('.exportpreview img');
  expect(decodeURIComponent((await img.getAttribute('src'))!)).toContain('#0b1226');
  await version.getByRole('button', { name: 'Light' }).click();
  expect(decodeURIComponent((await img.getAttribute('src'))!)).not.toContain('#0b1226');
});

test('the right sidebar: the rail opens it for a moment, the open button keeps it open and remembers it', async ({ page }) => {
  await paste(page, SMALL);
  const side = page.locator('.sidebar'), canvasAt = async () => { const p = await at(page, 300, 380); await page.mouse.click(p.x, p.y); };
  await expect(side).toHaveCount(0); // starts as the rail
  // from the rail: open for a moment, a canvas click folds it
  await page.locator('.siderail').getByRole('button', { name: 'Look' }).click();
  await expect(page.getByRole('tab', { name: 'Look' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.lookcard').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Components' }).click(); // clicks inside keep it open
  await expect(page.locator('.thumbcard').first()).toBeVisible();
  await canvasAt();
  await expect(side).toHaveCount(0);
  // pinned from a peek: a canvas click leaves it open
  await page.locator('.siderail').getByRole('button', { name: 'Components' }).click();
  await page.getByRole('button', { name: 'Keep sidebar open' }).click();
  await canvasAt();
  await expect(side).toBeVisible();
  // the open-sidebar button pins it too, and a pinned sidebar comes back after a reload
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await canvasAt();
  await page.keyboard.press('Escape');
  await expect(side).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep sidebar open' })).toHaveCount(0);
  await page.reload();
  await expect(side).toBeVisible();
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open sidebar' })).toBeVisible();
});

test("the look picker keeps a diagram's own look file as a choice, and a bundled look saves as its name", async ({ page }) => {
  await openFolder(page, folder());
  await sidebar(page, 'Look');
  const cards = page.locator('.lookcard');
  const card = (name: string) => page.getByRole('button', { name: new RegExp('^' + name) });
  await expect(cards).toHaveCount(6);
  await expect(page.locator('.lookcard > span').last()).toHaveText('This diagram’s look file · in use');
  await card('Sketch').click();
  await saved(page);
  const text = await diskText(page, SEQ);
  expect(text.split('\n')[0]).toBe('look sketch');
  expect(text.split('\n').slice(1)).toEqual(repoText(SEQ).split('\n').slice(1));
  await expect(page.locator('.banner')).toHaveCount(0); // a bundled look needs no file, fonts or folder
  await expect(page.locator('.problems')).toHaveText('No problems');
  // the picker stayed open, and the look file is still there to go back to
  await expect(cards).toHaveCount(6);
  await card('This diagram').click();
  await expect.poll(async () => (await diskText(page, SEQ)).split('\n')[0]).toBe(repoText(SEQ).split('\n')[0]);
});

test('text on the canvas is drawn as written: no ligatures, as wide as it is measured', async ({ page }) => {
  // `->`, `>=`, `...` and `--` are ligatures in Geist Mono; drawn as one glyph they would take one cell, not two or three
  await paste(page, 'text "|->>=...--|" at 40,40 font=mono\ntext "|aaaaaaaaa|" at 40,80 font=mono\n');
  await page.evaluate(() => document.fonts.ready);
  const widths = await page.locator('svg.canvas text').evaluateAll((ts) => ts.map((t) => (t as SVGTextElement).getComputedTextLength()));
  expect(widths).toHaveLength(2);
  expect(Math.abs(widths[0] - widths[1])).toBeLessThan(0.5);
});

test('a shared link whose look names icons and fonts by web address fetches them, and keeps them out of a copied link', async ({ page, context }) => {
  const errors = noPageErrors(page);
  const asked: string[] = [];
  await page.route('https://cdn.example.com/**', (route) => {
    const url = route.request().url();
    asked.push(url);
    if (url.endsWith('/set@1.0.0/lambda.svg')) return route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#ff9900"/></svg>' });
    if (url.includes('/web-sans@1.0.0/')) return route.fulfill({ contentType: 'font/ttf', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(resolve('fonts/Geist-Regular.ttf')) });
    return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
  const { editorLink } = await import('../editor/src/embed/share.ts');
  const look = 'icondir "https://cdn.example.com/set@1.0.0/{name}.svg"\nfont sans "Web Sans" "https://cdn.example.com/web-sans@1.0.0/latin-{weight}-normal.ttf"\nstyle node shape=rect size=160x60 title.font=sans';
  const link = (await editorLink('http://x/edit/', { name: 'web.fdraw', text: 'look "./web.look"\na: node "Lambda" icon=lambda at 40,40\nb: node "Data" icon=database at 260,40\n', look: { path: './web.look', text: look } })).replace('http://x', '');
  await page.goto(link);
  // the icon from the address is drawn as an image; database is a built-in one, also looked for at the address
  await expect(page.locator('svg.canvas image[href^="data:image/svg+xml"]')).toHaveCount(1);
  await expect(page.getByText('No problems')).toBeVisible();
  await expect(page.locator('.banner')).toHaveCount(0);
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Web Sans' && f.status === 'loaded'))).toBe(true);
  expect(asked.some((u) => u.endsWith('/lambda.svg'))).toBe(true);
  // the copied link carries the look, which says where the icon is, but not the icon
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Copy link' }).click();
  await expect(page.getByText(/copied a link to this diagram \(\d+ KB\)/)).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const { decodeShared } = await import('../editor/src/embed/share.ts');
  const d = await decodeShared(copied.split('#fdraw=')[1]!);
  expect(d?.icons ?? {}).toEqual({});
  expect(d?.look?.text).toContain('cdn.example.com');
  expect(errors).toEqual([]);
});

test('a look with icons builtin=hidden offers only its own icons in the picker, and its diagrams still draw built-in ones', async ({ page }) => {
  const errors = noPageErrors(page);
  await page.route('https://cdn.example.com/**', (route) => route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#0078d4"/></svg>' }));
  const { editorLink } = await import('../editor/src/embed/share.ts');
  const look = 'icons builtin=hidden\nicon vault "https://cdn.example.com/set@1.0.0/vault.svg"\nicon queue "M4 6h16" "M4 12h16"\nstyle node shape=rect size=160x60';
  const link = (await editorLink('http://x/edit/', { name: 'hidden.fdraw', text: 'look "./h.look"\na: node "Vault" icon=vault at 40,40\nb: node "DB" icon=database at 260,40\n', look: { path: './h.look', text: look } })).replace('http://x', '');
  await page.goto(link);
  await expect(page.getByText('No problems')).toBeVisible();
  await page.getByRole('button', { name: 'Icon', exact: true }).click();
  const grid = page.getByRole('radiogroup', { name: 'Icons' });
  await expect(grid).toContainText("The look's icons");
  await expect(grid).not.toContainText('Built in');
  await expect(grid.getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('tablist', { name: 'Icon set' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the panel sets a text font; aligning a text makes it a box, which moves like any box', async ({ page }) => {
  await paste(page, 'canvas 900x420\na: node "Box" at 40,40\nn: text "A short note" at 300,200\n');
  await page.mouse.click(...Object.values(await corner(page, 'n')) as [number, number]);
  const panel = page.locator('.panel');
  await panel.getByRole('radio', { name: 'mono' }).click();
  expect(lineOf(await source(page), 'n')).toBe('n: text "A short note" at 300,200 font=mono');
  await expect(panel.getByRole('radio', { name: 'mono' })).toHaveAttribute('aria-checked', 'true');
  // no box yet: no alignment is shown, and there is nothing to place a line in vertically
  await expect(panel.getByRole('radio', { name: 'Align left' })).toHaveAttribute('aria-checked', 'false');
  // centring makes a box just as wide as the words, so nothing moves
  const before = (await page.locator('rect[data-id="n"]').boundingBox())!;
  await panel.getByRole('radio', { name: 'Align centre' }).click();
  expect(lineOf(await source(page), 'n')).toMatch(/^n: text "A short note" at 300,200 font=mono align=center width=\d+$/);
  const after = (await page.locator('rect[data-id="n"]').boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  // a text box made by dragging with the text tool, wider than its words: the line sits in its middle
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await drag(page, await at(page, 300, 300), 240, 120);
  await page.waitForSelector('.textedit');
  await page.keyboard.press('Escape');
  await expect(page.locator('.textedit')).toHaveCount(0);
  await page.keyboard.press('v');
  const made = (await source(page)).trim().split('\n').pop()!.split(':')[0]!;
  await page.mouse.click(...Object.values(await corner(page, made)) as [number, number]);
  await panel.getByRole('radio', { name: 'Align centre' }).click();
  expect(lineOf(await source(page), made)).toMatch(/ width=1\d\d align=center$/);
  const box = (await page.locator(`rect[data-id="${made}"]`).boundingBox())!, word = (await page.locator('svg.canvas text', { hasText: /^Text$/ }).boundingBox())!;
  expect(Math.abs((word.x + word.width / 2) - (box.x + box.width / 2))).toBeLessThan(3);
  // grabbed anywhere in the box, even where there are no words, it moves like a box
  const b2 = (await page.locator(`rect[data-id="${made}"]`).boundingBox())!;
  await page.waitForTimeout(500); // not the second click of a double-click, which edits the text
  await drag(page, { x: b2.x + b2.width - 10, y: b2.y + b2.height / 2 }, 0, 48);
  expect(lineOf(await source(page), made)).toMatch(/ at 300,3[3-9]\d /);
  // a box's title lines up with title.align; centre is the default and is left off
  await page.mouse.click(...Object.values(await corner(page, 'a')) as [number, number]);
  await panel.getByRole('radio', { name: 'Align left' }).click();
  expect(lineOf(await source(page), 'a')).toBe('a: node "Box" at 40,40 title.align=left');
  await panel.getByRole('radio', { name: 'Align centre' }).click();
  expect(lineOf(await source(page), 'a')).toBe('a: node "Box" at 40,40');
  await panel.getByRole('radio', { name: 'serif' }).click();
  expect(lineOf(await source(page), 'a')).toBe('a: node "Box" at 40,40 title.font=serif');
});

test('every handle scales a text: its size grows with the box and the opposite corner or side stays put', async ({ page }) => {
  await paste(page, 'canvas 900x420\na: node "Box" at 40,40\nn: text "Scale me" at 300,200\nb: text "Boxed words that wrap" at 300,300 width=100\n');
  await page.mouse.click(...Object.values(await corner(page, 'n')) as [number, number]);
  const before = (await page.locator('rect[data-id="n"]').boundingBox())!;
  const se = (await page.locator('[data-handle="se"]').boundingBox())!;
  await drag(page, { x: se.x + se.width / 2, y: se.y + se.height / 2 }, before.width - 4, before.height - 4); // about twice as big
  const line = lineOf(await source(page), 'n'), size = +/ size=([\d.]+)/.exec(line)![1]!;
  expect(size).toBeGreaterThan(20);
  expect(size).toBeLessThan(28);
  expect(line).toMatch(/^n: text "Scale me" at 300,\d+ size=[\d.]+$/); // the top-left corner held
  const after = (await page.locator('rect[data-id="n"]').boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);
  // a side scales it too, from the opposite side: the right edge holds the left edge and the top
  const sized = lineOf(await source(page), 'n');
  const e = (await page.locator('[data-handle="e"]:not([data-strip])').boundingBox())!, now = (await page.locator('rect[data-id="n"]').boundingBox())!;
  await drag(page, { x: e.x + e.width / 2, y: e.y + e.height / 2 }, -now.width / 2, 0);
  const smaller = lineOf(await source(page), 'n');
  expect(+/ size=([\d.]+)/.exec(smaller)![1]!).toBeLessThan(+/ size=([\d.]+)/.exec(sized)![1]!);
  expect(smaller).toMatch(/^n: text "Scale me" at 300,/);
  const top = (await page.locator('rect[data-id="n"]').boundingBox())!;
  expect(Math.abs(top.y - before.y)).toBeLessThan(3);
  // and the bottom edge, holding the top
  const s1 = (await page.locator('[data-handle="s"]:not([data-strip])').boundingBox())!;
  await drag(page, { x: s1.x + s1.width / 2, y: s1.y + s1.height / 2 }, 0, top.height);
  expect(+/ size=([\d.]+)/.exec(lineOf(await source(page), 'n'))![1]!).toBeGreaterThan(+/ size=([\d.]+)/.exec(smaller)![1]!);
  // a text box scales its width and height with its text, so it wraps the same way
  await page.mouse.click(...Object.values(await corner(page, 'b')) as [number, number]);
  const nw = (await page.locator('[data-handle="nw"]').boundingBox())!, bb = (await page.locator('rect[data-id="b"]').boundingBox())!;
  await drag(page, { x: nw.x + nw.width / 2, y: nw.y + nw.height / 2 }, -bb.width / 2, -bb.height / 2);
  expect(lineOf(await source(page), 'b')).toMatch(/^b: text "Boxed words that wrap" at \d+,\d+ width=1\d\d size=1[6-9](\.5)?$/); // half as big again: 12 to about 18
});

test('a text box\'s left and right handles set where its lines wrap, keeping its size', async ({ page }) => {
  await paste(page, 'canvas 900x420\na: node "Box" at 40,40\nb: text "Boxed words that wrap" at 300,300 width=60\n');
  const lines = () => page.locator('svg.canvas text').filter({ hasText: /Boxed|words|wrap/ }).count();
  expect(await lines()).toBeGreaterThan(1);
  await page.mouse.click(...Object.values(await corner(page, 'b')) as [number, number]);
  await expect(page.locator('[data-handle="e"]:not([data-strip]) title')).toHaveText('Drag to set where the lines wrap');
  // the right edge, dragged well out: one line, the left end and the size as they were
  const e = (await page.locator('[data-handle="e"]:not([data-strip])').boundingBox())!;
  await drag(page, { x: e.x + e.width / 2, y: e.y + e.height / 2 }, 300, 0);
  expect(lineOf(await source(page), 'b')).toMatch(/^b: text "Boxed words that wrap" at 300,300 width=\d{3}$/);
  await expect.poll(lines).toBe(1);
  // the left edge, dragged in: the right end holds and the words wrap again
  const before = (await page.locator('rect[data-id="b"]').boundingBox())!;
  const w = (await page.locator('[data-handle="w"]:not([data-strip])').boundingBox())!;
  await drag(page, { x: w.x + w.width / 2, y: w.y + w.height / 2 }, before.width - 70, 0);
  expect(lineOf(await source(page), 'b')).toMatch(/^b: text "Boxed words that wrap" at \d+,300 width=\d\d$/);
  await expect.poll(lines).toBeGreaterThan(1);
  const after = (await page.locator('rect[data-id="b"]').boundingBox())!;
  expect(Math.abs(after.x + after.width - (before.x + before.width))).toBeLessThan(3);
});

test('a free text is typed in paragraphs: Enter starts a line, Escape keeps it; a box label still ends on Enter', async ({ page }) => {
  await paste(page, 'canvas 900x420\na: node "Box" at 40,40\nn: text "Note" at 300,200\n');
  await doubleClick(page, await corner(page, 'n'));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('First paragraph');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second one');
  await expect(page.locator('.textedit')).toHaveCount(1); // still typing
  await page.keyboard.press('Escape');
  await expect(page.locator('.textedit')).toHaveCount(0);
  expect(lineOf(await source(page), 'n')).toBe('n: text "First paragraph\\nSecond one" at 300,200');
  // Ctrl+Enter keeps it too
  await doubleClick(page, await corner(page, 'n'));
  await page.keyboard.press('End');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('!');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.textedit')).toHaveCount(0);
  expect(lineOf(await source(page), 'n')).toBe('n: text "First paragraph\\nSecond one!" at 300,200');
  // a box's label: Enter finishes, Escape drops the edit
  await doubleClick(page, await corner(page, 'a'));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Renamed');
  await page.keyboard.press('Enter');
  await expect(page.locator('.textedit')).toHaveCount(0);
  expect(lineOf(await source(page), 'a')).toBe('a: node "Renamed" at 40,40');
});

test('dragging with the text tool draws a text box', async ({ page }) => {
  await paste(page, 'canvas 900x420\na: node "Box" at 40,40\n');
  await page.keyboard.press('t');
  const from = await at(page, 300, 200);
  await drag(page, from, 240, 120);
  await page.keyboard.press('Escape');
  expect((await source(page)).trim().split('\n').pop()).toMatch(/^note\w*: text "Text" at 300,212 width=1\d\d$/);
});

test('the opacity slider fades the selection as it moves and writes one undo step', async ({ page }) => {
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'api')) as [number, number]);
  await page.locator('.panel').getByRole('button', { name: 'Arrange' }).click();
  const slider = page.locator('.panel').getByRole('slider', { name: 'Opacity' });
  await expect(slider).toHaveValue('100');
  // the keyboard steps 5% at a time; each step shows on the canvas, letting go writes it
  await slider.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.panel .opacity .value')).toHaveText('80%');
  await expect(page.locator('svg.canvas g[opacity="0.8"]')).not.toHaveCount(0);
  await expect.poll(async () => lineOf(await source(page), 'api')).toBe('api: focal "Orders API" sub="REST" at 280,160 opacity=0.8');
  await slider.fill('30');
  await slider.blur();
  expect(lineOf(await source(page), 'api')).toBe('api: focal "Orders API" sub="REST" at 280,160 opacity=0.3');
  await page.keyboard.press('Control+z');
  expect(lineOf(await source(page), 'api')).toBe('api: focal "Orders API" sub="REST" at 280,160 opacity=0.8');
  // everything at once, boxes and lines; back to 100% drops it
  await page.keyboard.press('Control+a');
  await slider.fill('50');
  await slider.blur();
  expect((await source(page)).match(/opacity=0.5/g)?.length).toBe(5);
  await slider.fill('100');
  await slider.blur();
  expect(await source(page)).not.toContain('opacity=');
});

test('the turning knob turns a box about its middle in 15 degree steps, and lines meet the turned sides', async ({ page }) => {
  const errors = noPageErrors(page);
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'api')) as [number, number]);
  const box = (await page.locator('rect[data-id="api"]').first().boundingBox())!;
  const knob = (await page.locator('circle[data-rotate]').boundingBox())!;
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 }, k = { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 };
  const r = Math.hypot(k.x - c.x, k.y - c.y), on = (a: number) => [c.x + r * Math.cos((a * Math.PI) / 180), c.y + r * Math.sin((a * Math.PI) / 180)] as const;
  // from straight up (-90) round to -32: 58 degrees, which lands on the 60 degree step
  await page.mouse.move(k.x, k.y);
  await page.mouse.down();
  for (const a of [-80, -70, -60, -50, -40, -32]) await page.mouse.move(...on(a), { steps: 2 });
  await page.mouse.up();
  expect(lineOf(await source(page), 'api')).toBe('api: focal "Orders API" sub="REST" at 280,160 rotate=60');
  await expect(page.locator('svg.canvas g[transform^="rotate(60 "]')).not.toHaveCount(0);
  // the hit area turns with it
  await expect(page.locator('rect[data-id="api"]').first()).toHaveAttribute('transform', /^rotate\(60 /);
  // Alt turns freely, a degree at a time
  const knob2 = (await page.locator('circle[data-rotate]').boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(knob2.x + knob2.width / 2, knob2.y + knob2.height / 2);
  await page.mouse.down();
  await page.mouse.move(...on(-23), { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(lineOf(await source(page), 'api')).toMatch(/ rotate=(6[5-9]|7[0-3])$/);
  await page.keyboard.press('Control+z');
  expect(lineOf(await source(page), 'api')).toBe('api: focal "Orders API" sub="REST" at 280,160 rotate=60');
  expect(errors).toEqual([]);
});

test('the rotation field and quarter-turn buttons turn the selection; 0 drops rotate=', async ({ page }) => {
  await paste(page, SMALL);
  await page.mouse.click(...Object.values(await corner(page, 'api')) as [number, number]);
  if (await page.locator('.panel .ghead[aria-expanded="false"]').count()) await page.locator('.panel').getByRole('button', { name: 'Arrange' }).click();
  const field = page.locator('.panel').getByLabel('Rotation in degrees');
  await expect(field).toHaveValue('0');
  await field.fill('30');
  await field.press('Enter');
  expect(lineOf(await source(page), 'api')).toBe('api: focal "Orders API" sub="REST" at 280,160 rotate=30');
  await page.locator('.panel').getByRole('button', { name: 'Turn a quarter clockwise' }).click();
  expect(lineOf(await source(page), 'api')).toBe('api: focal "Orders API" sub="REST" at 280,160 rotate=120');
  await page.keyboard.press('Control+z');
  expect(lineOf(await source(page), 'api')).toBe('api: focal "Orders API" sub="REST" at 280,160 rotate=30');
  await field.fill('0');
  await field.press('Enter');
  expect(lineOf(await source(page), 'api')).toBe('api: focal "Orders API" sub="REST" at 280,160');
  // a line has nothing to turn
  await page.keyboard.press('Control+a');
  await expect(page.locator('.panel').getByLabel('Rotation in degrees')).toHaveCount(0);
});

test('resizing a turned box moves the dragged side along the turn and keeps the far side still', async ({ page }) => {
  await paste(page, 'canvas 900x420\nn: node "Turned" at 200,100 160x80 rotate=90\n');
  await page.mouse.click(...Object.values(await at(page, 280, 80)) as [number, number]);
  // a quarter turn puts the box's own right side (handle e) at the bottom: dragging it down 40 makes the box 40 longer
  const e = (await page.locator('rect[data-handle="e"]:not([data-strip])').boundingBox())!;
  const z = await zoom(page);
  await drag(page, { x: e.x + e.width / 2, y: e.y + e.height / 2 }, 0, 40 * z);
  expect(lineOf(await source(page), 'n')).toBe('n: node "Turned" at 180,120 200x80 rotate=90');
});

test('turning a free text keeps it where it is', async ({ page }) => {
  await paste(page, 'canvas 900x420\nnote: text "A turned note" at 300,200\n');
  const before = (await page.locator('rect[data-id="note"]').boundingBox())!;
  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
  if (await page.locator('.panel .ghead[aria-expanded="false"]').count()) await page.locator('.panel').getByRole('button', { name: 'Arrange' }).click();
  const field = page.locator('.panel').getByLabel('Rotation in degrees');
  await field.fill('90');
  await field.press('Enter');
  expect(lineOf(await source(page), 'note')).toMatch(/^note: text "A turned note" at \d+,\d+ rotate=90$/);
  const after = (await page.locator('rect[data-id="note"]').boundingBox())!;
  expect(Math.abs(after.x + after.width / 2 - (before.x + before.width / 2))).toBeLessThan(3);
  expect(Math.abs(after.y + after.height / 2 - (before.y + before.height / 2))).toBeLessThan(3);
  expect(after.height).toBeGreaterThan(after.width);
});
