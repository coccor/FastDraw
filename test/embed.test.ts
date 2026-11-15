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

test("dark counterpart: what the parsed look's dark line names; built-in to night; otherwise none", async () => {
  const { parseLook, bundledLook, defaultLook } = await import('../src/look.ts');
  assert.equal(darkCounterpart(undefined, defaultLook()), 'night');
  assert.equal(darkCounterpart(undefined, null), 'night');
  assert.equal(darkCounterpart('sketch', bundledLook('sketch')!), null);
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
