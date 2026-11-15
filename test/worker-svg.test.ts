import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle, fontCss, type Deps } from '../worker/svg.ts';
import { encodeShared, decodeShared, sharedInHash } from '../editor/src/embed/share.ts';

const example = readFileSync(new URL('../assets/example.fdraw', import.meta.url), 'utf8');
const RAW = 'https://raw.githubusercontent.com/acme/app/main/';

// a repository on raw.githubusercontent.com as a map of addresses, and the fonts from fonts/
function deps(files: Record<string, string>, seen: string[] = []): Deps {
  return {
    editor: 'https://fastdraw.dev/edit/',
    async fetchText(url) { seen.push(url); return files[url] ?? null; },
    async font(f) { try { return new Uint8Array(readFileSync(new URL(`../fonts/${f}`, import.meta.url))); } catch { return null; } },
  };
}
const get = (path: string, d: Deps) => handle(new Request('https://fastdraw.dev' + path), d);
const text = async (r: Response | null) => { assert.ok(r); return r.text(); };

test('other paths are left to the static site', async () => {
  assert.equal(await get('/edit/', deps({})), null);
  assert.equal(await get('/ghost', deps({})), null);
});

test('a .fdraw file in a public repository comes back as an SVG with its fonts inside', async () => {
  const seen: string[] = [];
  const r = await get('/gh/acme/app/main/docs/arch.fdraw', deps({ [RAW + 'docs/arch.fdraw']: example }, seen));
  assert.ok(r);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type')!, /^image\/svg\+xml/);
  assert.match(r.headers.get('Cache-Control')!, /max-age=300/);
  assert.deepEqual(seen, [RAW + 'docs/arch.fdraw']);
  const svg = await r.text();
  assert.match(svg, /^<svg /);
  assert.match(svg, /@font-face\{font-family:'Geist';font-weight:\d+;font-style:normal;src:url\(data:font\/ttf;base64,/);
  assert.doesNotMatch(svg, /could not draw/);
});

test('?theme=dark and ?dark draw the dark version of the look', async () => {
  const d = deps({ [RAW + 'a.fdraw']: example });
  const light = await text(await get('/gh/acme/app/main/a.fdraw', d));
  const dark = await text(await get('/gh/acme/app/main/a.fdraw?theme=dark', d));
  assert.notEqual(light, dark);
  assert.equal(await text(await get('/gh/acme/app/main/a.fdraw?dark', d)), dark);
});

test('a look file next to the diagram is read from the same repository', async () => {
  const seen: string[] = [];
  const look = 'color ink #123456\nstyle node fill=#fafafa stroke=ink';
  const svg = await text(await get('/gh/acme/app/main/docs/a.fdraw', deps({
    [RAW + 'docs/a.fdraw']: 'look "../team.look"\na: node "A"', [RAW + 'team.look']: look,
  }, seen)));
  assert.deepEqual(seen, [RAW + 'docs/a.fdraw', RAW + 'team.look']);
  assert.match(svg, /#123456/);
});

test('a look outside the repository, or not a .look file, is not read', async () => {
  for (const ref of ['../../../other/repo/main/x.look', 'https://evil.example/x.look', '../secrets.txt']) {
    const seen: string[] = [];
    const svg = await text(await get('/gh/acme/app/main/a.fdraw', deps({ [RAW + 'a.fdraw']: `look "${ref}"\na: node "A"` }, seen)));
    assert.match(svg, /could not draw/, ref);
    assert.deepEqual(seen, [RAW + 'a.fdraw'], ref);
  }
});

test('bad addresses, missing files and diagram errors answer with an image that says so', async () => {
  const d = deps({ [RAW + 'bad.fdraw']: 'a: node "A"\na -> nowhere' });
  for (const [path, says] of [
    ['/gh/acme/app', '/gh/&lt;owner&gt;'],
    ['/gh/acme/app/main/a//x.fdraw', 'has an empty'],
    ['/gh/acme/app/main/readme.md', 'must end in .fdraw'],
    ['/gh/acme/app/main/gone.fdraw', 'gone.fdraw was not found'],
    ['/gh/acme/app/main/bad.fdraw', 'bad.fdraw has errors'],
    ['/s/not-a-diagram', 'does not hold a diagram'],
  ]) {
    const r = await get(path, d);
    assert.ok(r, path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('Cache-Control')!, /max-age=30$/, path);
    assert.ok((await r.text()).includes(says), `${path} says ${says}`);
  }
});

test('GitHub not answering is shown in the image', async () => {
  const d = { ...deps({}), fetchText: async () => { throw new Error('rate limited'); } };
  assert.match(await text(await get('/gh/acme/app/main/a.fdraw', d)), /could not be read: rate limited/);
});

test('a diagram carried in the address is drawn, for private repositories', async () => {
  const data = await encodeShared({ name: 'x.fdraw', text: example });
  const svg = await text(await get(`/s/${data}`, deps({})));
  assert.doesNotMatch(svg, /could not draw/);
  assert.equal(await text(await get(`/s/${data}.svg`, deps({}))), svg);
});

test('?edit redirects to the editor with the diagram and its look', async () => {
  const look = 'color ink #123456';
  const r = await get('/gh/acme/app/main/a.fdraw?edit', deps({ [RAW + 'a.fdraw']: 'look "./t.look"\na: node "A"', [RAW + 't.look']: look }));
  assert.ok(r);
  assert.equal(r.status, 302);
  const to = new URL(r.headers.get('Location')!);
  assert.equal(to.origin + to.pathname, 'https://fastdraw.dev/edit/');
  const s = await decodeShared(sharedInHash(to.hash)!);
  assert.deepEqual(s, { name: 'a.fdraw', text: 'look "./t.look"\na: node "A"', look: { path: './t.look', text: look } });
});

test('only the faces the text uses are embedded', async () => {
  const css = await fontCss(`<svg><text font-family="'Geist', sans-serif" font-weight="600">a</text><text font-family="'Newsreader', serif" font-style="italic">b</text></svg>`, deps({}));
  const faces = [...css.matchAll(/font-family:'([^']+)';font-weight:(\d+);font-style:(\w+)/g)].map((m) => m.slice(1).join(' '));
  assert.deepEqual(faces, ['Geist 600 normal', 'Newsreader 400 italic']);
});

test('other methods are refused', async () => {
  const r = await handle(new Request('https://fastdraw.dev/gh/acme/app/main/a.fdraw', { method: 'POST' }), deps({}));
  assert.equal(r?.status, 405);
});
