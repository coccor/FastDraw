import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeShared, decodeShared, sharedInHash, editorLink } from '../editor/src/embed/share.ts';
import { resolveTheme, darkCounterpart } from '../editor/src/embed/theme.ts';
import { buildScene, withLook } from '../src/scene.ts';

const example = readFileSync(new URL('../assets/example.fdraw', import.meta.url), 'utf8');

test('a diagram survives the trip through an editor link', async () => {
  const d = { name: 'example.fdraw', text: example };
  const data = await encodeShared(d);
  assert.match(data, /^[A-Za-z0-9_-]+$/, 'base64url, safe in a URL with no escaping');
  assert.ok(data.length < Buffer.from(JSON.stringify(d)).toString('base64').length, 'compressed');
  assert.deepEqual(await decodeShared(data), d);
});

test('a look file of its own travels with the diagram, and text outside ASCII is kept', async () => {
  const d = { name: 'café · überblick.fdraw', text: 'look "./team.look"\na: node "Größe → 日本"', look: { path: './team.look', text: 'color ink #111111\nstyle node fill=#fff' } };
  assert.deepEqual(await decodeShared(await encodeShared(d)), d);
});

test('the editor link carries the diagram after the #', async () => {
  const link = await editorLink('http://localhost:5199/edit/', { name: 'a.fdraw', text: example });
  const u = new URL(link);
  assert.equal(u.origin + u.pathname, 'http://localhost:5199/edit/');
  assert.equal(u.search, '');
  const data = sharedInHash(u.hash);
  assert.ok(data);
  assert.equal((await decodeShared(data))?.text, example);
});

test('a damaged or foreign link decodes to nothing', async () => {
  const data = await encodeShared({ name: 'a.fdraw', text: example });
  assert.equal(await decodeShared(data.slice(0, data.length / 2)), null);
  assert.equal(await decodeShared('not base64 at all!'), null);
  assert.equal(await decodeShared(''), null);
  assert.equal(sharedInHash('#other=1'), null);
  assert.equal(sharedInHash(''), null);
});

test('a link that unpacks into something huge is refused', async () => {
  const big = await encodeShared({ name: 'a.fdraw', text: 'x'.repeat(5_000_000) });
  assert.ok(big.length < 20_000);
  assert.equal(await decodeShared(big), null);
});

test('theme: the attribute wins, then the page, then the system', () => {
  assert.equal(resolveTheme('dark', 'light', false), 'dark');
  assert.equal(resolveTheme('light', 'dark', true), 'light');
  assert.equal(resolveTheme('auto', 'dark', false), 'dark');
  assert.equal(resolveTheme(null, 'light', true), 'light');
  assert.equal(resolveTheme(null, null, true), 'dark');
  assert.equal(resolveTheme('auto', undefined, false), 'light');
  assert.equal(resolveTheme('bogus', 'nonsense', true), 'dark');
});

test("dark counterpart: what the parsed look's dark line names; built-in to night; a look without one keeps itself", async () => {
  const { parseLook, bundledLook, defaultLook } = await import('../src/look.ts');
  assert.equal(darkCounterpart(undefined, defaultLook()), 'night');
  assert.equal(darkCounterpart(undefined, null), 'night');
  assert.equal(darkCounterpart('sketch', bundledLook('sketch')!), 'sketch-dark');
  assert.equal(darkCounterpart('./bare.look', parseLook('color ink #111')), null);
  assert.equal(darkCounterpart('./team.look', parseLook('color ink #111\ndark "./team-night.look"')), './team-night.look');
  assert.equal(darkCounterpart('./team.look', null), null);
  // a look that is its own dark counterpart is left as it is
  assert.equal(darkCounterpart('night', bundledLook('night')!), null);
});

test('drawing on a dark page swaps the look line, or adds one', () => {
  // the embed uses the command line's withLook, so error line numbers stay those of the file
  assert.equal(withLook('a: node "A" at 0,0', 'night'), 'a: node "A" at 0,0\nlook night\n');
  assert.equal(withLook('look sketch // hand drawn\na: node', 'night'), 'look night\na: node');
  assert.equal(withLook('look "./a.look"\na: node', './a dark.look'), 'look "./a dark.look"\na: node');
  const sc = buildScene(withLook(example, 'night'), null);
  assert.equal(sc.issues.filter((i) => i.level === 'error').length, 0);
});

const LOOK = { path: './team.look', text: 'icondir "./icons"' };
const uri = (svg: string) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const svgOf = (u: string) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64').toString();

test('icon files the diagram uses travel in the link, trimmed, and come back as data URIs', async () => {
  const drawn = '<?xml version="1.0"?>\n<!-- made by hand -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <path d="M1.23456 7.891011L12 2"/>\n</svg>\n';
  const d = { name: 'a.fdraw', text: 'look "./team.look"\nvm: node "VM" icon=server-rack', look: LOOK, icons: { 'server-rack': uri(drawn) } };
  const back = await decodeShared(await encodeShared(d));
  assert.ok(back?.icons);
  assert.deepEqual(Object.keys(back.icons), ['server-rack']);
  assert.equal(svgOf(back.icons['server-rack']!), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1.23 7.89L12 2"/></svg>');
});

test('icons travel as SVG text, not base64, so the link stays short', async () => {
  const icons: Record<string, string> = {};
  for (let i = 0; i < 8; i++) icons[`i${i}`] = uri(`<svg viewBox="0 0 18 18"><defs><linearGradient id="g${i}"><stop offset="0" stop-color="#0078d4"/><stop offset="1" stop-color="#5ea0ef"/></linearGradient></defs><path fill="url(#g${i})" d="M${i} 1h16v${i + 4}H1z"/></svg>`);
  const withIcons = await encodeShared({ name: 'a.fdraw', text: 'x', look: LOOK, icons });
  const asB64 = Buffer.from(JSON.stringify({ name: 'a.fdraw', text: 'x', look: LOOK, icons })).toString('base64url');
  assert.ok(withIcons.length * 4 < asB64.length, `${withIcons.length} vs ${asB64.length}`);
});

test('a link only gives back icons that are SVG, under a plain name, with a look file', async () => {
  const good = uri('<svg viewBox="0 0 1 1"/>');
  const d = await decodeShared(await encodeShared({ name: 'a.fdraw', text: 'x', look: LOOK, icons: { ok: good, 'Bad Name': good, notsvg: uri('hello') } }));
  assert.deepEqual(Object.keys(d?.icons ?? {}), ['ok']);
  const noLook = await decodeShared(await encodeShared({ name: 'a.fdraw', text: 'x', icons: { ok: good } }));
  assert.equal(noLook?.icons, undefined);
});

test('trimming an icon keeps every number where it was', async () => {
  const { trimSvg } = await import('../editor/src/embed/share.ts');
  assert.equal(trimSvg('M1.23456.78912L.99999 2.5'), 'M1.23.78912L1 2.5'); // the point stays between two numbers
  assert.equal(trimSvg('M1.999.5'), 'M2.00.5');
  assert.equal(trimSvg('x="10.12345" y="-3.14159"'), 'x="10.12" y="-3.14"');
  assert.equal(trimSvg('1.23456e-5'), '1.23456e-5');
  assert.equal(trimSvg('<text>a</text> <text>b</text>'), '<text>a</text> <text>b</text>');
  assert.equal(trimSvg('<svg xmlns:inkscape="x" inkscape:version="1"><metadata><rdf:RDF/></metadata><path/></svg>'), '<svg><path/></svg>');
});

test('a font the look brings but nobody has falls back to the shipped font for its role', async () => {
  const { parseLook, fontFamily } = await import('../src/look.ts');
  const { familiesDrawn } = await import('../editor/src/embed/faces.ts');
  const look = parseLook('font sans "Acme Grotesk"\nfont mono "Acme Code"\nfont serif "Acme Book"');
  assert.equal(fontFamily(look, 'sans'), "'Acme Grotesk', 'Geist', sans-serif");
  assert.equal(fontFamily(look, 'mono'), "'Acme Code', 'Geist Mono', monospace");
  assert.equal(fontFamily(look, 'serif'), "'Acme Book', 'Newsreader', serif");
  // a font that ships with FastDraw needs no stand-in
  assert.equal(fontFamily(parseLook('font sans "Libre Franklin"\nfont mono "Geist Mono"'), 'sans'), "'Libre Franklin', sans-serif");
  // what is drawn is the first family in each list that is there
  const svg = `<text font-family="'Acme Grotesk', 'Geist', sans-serif">a</text><text font-family="'Newsreader', serif">b</text>`;
  assert.deepEqual([...familiesDrawn(svg, (f) => ['Geist', 'Newsreader'].includes(f))], ['Geist', 'Newsreader']);
  assert.deepEqual([...familiesDrawn(svg, (f) => ['Geist', 'Newsreader', 'Acme Grotesk'].includes(f))], ['Acme Grotesk', 'Newsreader']);
});
