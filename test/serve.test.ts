import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, symlinkSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveDiagrams } from '../src/serve.ts';
import { request, createServer } from 'node:http';
import { openRoot } from '../src/node.ts';

const EDITOR = 'https://fastdraw.dev';

// a.fdraw names a.look, whose icons are in icons/; b.fdraw, notes.txt and .git/ are other files in the folder
function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'fdserve-'));
  writeFileSync(join(dir, 'a.fdraw'), 'look "./a.look"\ncanvas 100x100\n');
  writeFileSync(join(dir, 'a.look'), 'icondir "./icons"\ncolor ink #000\n');
  writeFileSync(join(dir, 'b.fdraw'), 'canvas 100x100\n');
  mkdirSync(join(dir, 'icons'));
  writeFileSync(join(dir, 'icons', 'x y.svg'), '<svg/>');
  writeFileSync(join(dir, 'notes.txt'), 'hello');
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.git', 'config'), 'secret');
  return dir;
}

test('open link points the editor at a token on 127.0.0.1 and names the diagram, after the # only', async () => {
  const s = await serveDiagrams(folder(), { editor: EDITOR, open: 'a.fdraw' });
  try {
    const u = new URL(s.url);
    assert.equal(u.origin, EDITOR);
    // the browser sends the path and query to the editor's host, never the part after the #
    assert.equal(u.search, '');
    assert.doesNotMatch(u.pathname, /127\.0\.0\.1|a\.fdraw/);
    const h = new URLSearchParams(u.hash.slice(1));
    assert.match(h.get('serve')!, /^http:\/\/127\.0\.0\.1:\d+\/[\w-]{20,}$/);
    assert.equal(h.get('open'), 'a.fdraw');
  } finally { await s.close(); }
});

test('lists and reads the opened diagram and the files it needs, for the editor origin', async () => {
  const s = await serveDiagrams(folder(), { editor: EDITOR, open: 'a.fdraw' });
  try {
    const h = { Origin: EDITOR };
    const l = await fetch(s.base + '/list', { headers: h });
    assert.equal(l.headers.get('access-control-allow-origin'), EDITOR);
    const paths = ((await l.json()) as { files: { path: string }[] }).files.map((f) => f.path).sort();
    assert.deepEqual(paths, ['a.fdraw', 'a.look', 'icons/x y.svg']);
    const r = await fetch(s.base + '/f/icons/x%20y.svg', { headers: h });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '<svg/>');
    assert.ok(Number(r.headers.get('x-mtime')) > 0);
  } finally { await s.close(); }
});

test('shares nothing else in the folder: other diagrams, other files, and nothing at all before a diagram is opened', async () => {
  const dir = folder();
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'c.fdraw'), '');
  const s = await serveDiagrams(dir, { editor: EDITOR });
  try {
    const h = { Origin: EDITOR };
    const list = async () => ((await (await fetch(s.base + '/list', { headers: h })).json()) as { files: { path: string }[] }).files.map((f) => f.path).sort();
    assert.deepEqual(await list(), []);
    assert.equal((await fetch(s.base + '/f/a.fdraw', { headers: h })).status, 403);
    s.add('b.fdraw');
    assert.deepEqual(await list(), ['b.fdraw']);
    for (const p of ['a.fdraw', 'a.look', 'icons/x%20y.svg', 'notes.txt', 'docs/c.fdraw']) assert.equal((await fetch(s.base + '/f/' + p, { headers: h })).status, 403, p);
    assert.equal((await fetch(s.base + '/f/b.fdraw', { headers: h })).status, 200);
    // only a diagram is opened by name; a look or other file is shared only because a diagram needs it
    s.add('notes.txt');
    s.add('a.look');
    assert.deepEqual(await list(), ['b.fdraw']);
  } finally { await s.close(); }
});

test('shares the look, its dark look and font folder as they were when opened; a save cannot widen that', async () => {
  const dir = folder();
  mkdirSync(join(dir, 'fonts'));
  writeFileSync(join(dir, 'fonts', 'f.ttf'), 'x');
  writeFileSync(join(dir, 'night.look'), 'fontdir "./fonts"\n');
  writeFileSync(join(dir, 'other.look'), 'color ink #111\n');
  writeFileSync(join(dir, 'a.look'), 'icondir "./icons"\ndark "./night.look"\n');
  const s = await serveDiagrams(dir, { editor: EDITOR, open: 'a.fdraw' });
  try {
    const h = { Origin: EDITOR };
    const list = async () => ((await (await fetch(s.base + '/list', { headers: h })).json()) as { files: { path: string }[] }).files.map((f) => f.path).sort();
    const shared = ['a.fdraw', 'a.look', 'fonts/f.ttf', 'icons/x y.svg', 'night.look'];
    assert.deepEqual(await list(), shared);
    // the editor saves the diagram pointing at another look file: it is still not shared
    const put = await fetch(s.base + '/f/a.fdraw', { method: 'PUT', body: 'look "./other.look"\ncanvas 100x100\n', headers: h });
    assert.equal(put.status, 200);
    assert.deepEqual(await list(), shared);
    assert.equal((await fetch(s.base + '/f/other.look', { headers: h })).status, 403);
  } finally { await s.close(); }
});

test('reads no look outside the folder, and lists nothing the server would refuse', async () => {
  const dir = folder();
  const outside = mkdtempSync(join(tmpdir(), 'fdlookout-'));
  writeFileSync(join(outside, 'x.look'), 'color ink #000\n');
  writeFileSync(join(dir, 'out.fdraw'), `look "${join(outside, 'x.look')}"\ncanvas 100x100\n`);
  mkdirSync(join(dir, 'hid'));
  writeFileSync(join(dir, 'hid', 'h.look'), 'icondir "./.icons"\n');
  mkdirSync(join(dir, 'hid', '.icons'));
  writeFileSync(join(dir, 'hid', '.icons', 'i.svg'), '<svg/>');
  writeFileSync(join(dir, 'hidden.fdraw'), 'look "./hid/h.look"\n');
  const s = await serveDiagrams(dir, { editor: EDITOR, open: 'out.fdraw' });
  try {
    s.add('hidden.fdraw');
    const l = await fetch(s.base + '/list', { headers: { Origin: EDITOR } });
    const paths = ((await l.json()) as { files: { path: string }[] }).files.map((f) => f.path).sort();
    assert.deepEqual(paths, ['hid/h.look', 'hidden.fdraw', 'out.fdraw']);
  } finally { await s.close(); }
});

test('does not write through a link swapped in for a shared file', async () => {
  const dir = folder();
  const s = await serveDiagrams(dir, { editor: EDITOR, open: 'a.fdraw' });
  try {
    const outside = mkdtempSync(join(tmpdir(), 'fdswap-'));
    writeFileSync(join(outside, 't.look'), 'keep');
    rmSync(join(dir, 'a.look'));
    symlinkSync(join(outside, 't.look'), join(dir, 'a.look'));
    const r = await fetch(s.base + '/f/a.look', { method: 'PUT', body: 'x', headers: { Origin: EDITOR } });
    assert.equal(r.status, 403);
    assert.equal(readFileSync(join(outside, 't.look'), 'utf8'), 'keep');
    assert.equal((await fetch(s.base + '/f/a.look', { headers: { Origin: EDITOR } })).status, 403);
  } finally { await s.close(); }
});

test('refuses other origins, a wrong token, and paths that leave the folder', async () => {
  const dir = folder();
  symlinkSync('/etc', join(dir, 'escape'));
  const s = await serveDiagrams(dir, { editor: EDITOR, open: 'a.fdraw' });
  try {
    assert.equal((await fetch(s.base + '/list', { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(s.base.replace(/[^/]+$/, 'wrongtoken') + '/list')).status, 404);
    for (const p of ['../a.fdraw', '%2e%2e/%2e%2e/etc/passwd', '.git/config', 'escape/hostname', 'icons%2f..%2f..%2fx']) {
      const st = (await fetch(s.base + '/f/' + p)).status;
      assert.ok(st === 403 || st === 404, `${p} gave ${st}`);
    }
  } finally { await s.close(); }
});

test('preflight allows the private-network request from the editor', async () => {
  const s = await serveDiagrams(folder(), { editor: EDITOR, open: 'a.fdraw' });
  try {
    const r = await fetch(s.base + '/f/a.fdraw', { method: 'OPTIONS', headers: { Origin: EDITOR, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Private-Network': 'true' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-private-network'), 'true');
    assert.match(r.headers.get('access-control-allow-methods')!, /PUT/);
  } finally { await s.close(); }
});

test('writes only the opened diagram and its look', async () => {
  const dir = folder();
  const s = await serveDiagrams(dir, { editor: EDITOR, open: 'a.fdraw' });
  try {
    const put = (p: string, body: string) => fetch(s.base + '/f/' + p, { method: 'PUT', body, headers: { Origin: EDITOR } });
    const ok = await put('a.fdraw', 'look "./a.look"\ncanvas 200x200\n');
    assert.equal(ok.status, 200);
    assert.equal(readFileSync(join(dir, 'a.fdraw'), 'utf8'), 'look "./a.look"\ncanvas 200x200\n');
    assert.equal((await put('a.look', 'icondir "./icons"\n')).status, 200);
    assert.equal((await put('notes.txt', 'x')).status, 403);
    // another diagram, or a new file, in the same folder
    assert.equal((await put('b.fdraw', 'x')).status, 403);
    assert.equal((await put('new.fdraw', 'x')).status, 403);
    assert.ok(!existsSync(join(dir, 'new.fdraw')));
    assert.equal(readFileSync(join(dir, 'b.fdraw'), 'utf8'), 'canvas 100x100\n');
    assert.equal((await put('icons/x y.svg', 'x')).status, 403);
    assert.equal(readFileSync(join(dir, 'notes.txt'), 'utf8'), 'hello');
    // not through a linked folder that leads outside, nor through a linked file
    const outside = mkdtempSync(join(tmpdir(), 'fdout-'));
    symlinkSync(outside, join(dir, 'away'));
    assert.equal((await put('away/new.look', 'x')).status, 403);
    assert.ok(!existsSync(join(outside, 'new.look')));
    writeFileSync(join(outside, 'target.fdraw'), 'keep');
    symlinkSync(join(outside, 'target.fdraw'), join(dir, 'link.fdraw'));
    assert.equal((await put('link.fdraw', 'x')).status, 403);
    assert.equal(readFileSync(join(outside, 'target.fdraw'), 'utf8'), 'keep');
  } finally { await s.close(); }
});

test('lists no link, and does not make a shared file again after it was deleted', async () => {
  const dir = folder();
  writeFileSync(join(dir, 'real.look'), 'color ink #000\n');
  symlinkSync(join(dir, 'real.look'), join(dir, 'linked.look'));
  writeFileSync(join(dir, 'l.fdraw'), 'look "./linked.look"\n');
  const s = await serveDiagrams(dir, { editor: EDITOR, open: 'l.fdraw' });
  try {
    s.add('a.fdraw');
    const l = await fetch(s.base + '/list', { headers: { Origin: EDITOR } });
    const paths = ((await l.json()) as { files: { path: string }[] }).files.map((f) => f.path).sort();
    assert.deepEqual(paths, ['a.fdraw', 'a.look', 'icons/x y.svg', 'l.fdraw']);
    // nor a file reached through a linked folder, which could lead to a hidden one
    mkdirSync(join(dir, '.secret'));
    writeFileSync(join(dir, '.secret', 's.look'), 'color ink #000\n');
    symlinkSync(join(dir, '.secret'), join(dir, 'alias'));
    writeFileSync(join(dir, 'via.fdraw'), 'look "./alias/s.look"\n');
    s.add('via.fdraw');
    const l2 = await fetch(s.base + '/list', { headers: { Origin: EDITOR } });
    assert.ok(!((await l2.json()) as { files: { path: string }[] }).files.some((f) => f.path.startsWith('alias/')));
    assert.equal((await fetch(s.base + '/f/alias/s.look', { headers: { Origin: EDITOR } })).status, 403);
    rmSync(join(dir, 'a.look'));
    const r = await fetch(s.base + '/f/a.look', { method: 'PUT', body: 'x', headers: { Origin: EDITOR } });
    assert.equal(r.status, 404);
    assert.ok(!existsSync(join(dir, 'a.look')));
  } finally { await s.close(); }
});

test('open lends the folder that holds both the diagram and the look file it names, within the bound', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'fdroot-'));
  mkdirSync(join(repo, 'examples', 'kinds'), { recursive: true });
  mkdirSync(join(repo, 'looks'));
  writeFileSync(join(repo, 'looks', 'team.look'), 'color ink #000\n');
  const file = join(repo, 'examples', 'kinds', 'd.fdraw'), own = { root: join(repo, 'examples', 'kinds'), open: 'd.fdraw' };
  const src = 'look "../../looks/team.look"\nrect at 0,0\n';
  writeFileSync(file, src);
  // the look two folders up: lend the folder above both, and open the diagram by its path in it
  assert.deepEqual(openRoot(file, src, repo), { root: repo, open: 'examples/kinds/d.fdraw' });
  // a look beside it, a bundled one, or none: the diagram's own folder
  for (const s of ['look "./team.look"\n', 'look night\n', 'rect at 0,0\n']) assert.deepEqual(openRoot(file, s, repo), own);
  // never past the bound: a look outside it, or no bound at all, keeps the diagram's folder
  assert.deepEqual(openRoot(file, src, join(repo, 'examples')), own);
  assert.deepEqual(openRoot(file, src), own);
  // a folder inside the bound that is a link to one outside it is judged by where it leads: not widened
  const away = mkdtempSync(join(tmpdir(), 'fdaway-'));
  mkdirSync(join(away, 'looks'));
  mkdirSync(join(away, 'd', 'e'), { recursive: true });
  writeFileSync(join(away, 'looks', 'team.look'), 'color ink #000\n');
  writeFileSync(join(away, 'd', 'e', 'x.fdraw'), src);
  symlinkSync(join(away, 'd'), join(repo, 'linked'));
  assert.deepEqual(openRoot(join(repo, 'linked', 'e', 'x.fdraw'), src, repo), { root: realpathSync(join(away, 'd', 'e')), open: 'x.fdraw' });
  // what the editor then reads through the server: the look, by the path the diagram gives from its folder
  const { root, open } = openRoot(file, src, repo);
  const s = await serveDiagrams(root, { editor: EDITOR, open });
  try {
    assert.equal(new URLSearchParams(new URL(s.url).hash.slice(1)).get('open'), 'examples/kinds/d.fdraw');
    const r = await fetch(`${s.base}/f/looks/team.look`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'color ink #000\n');
  } finally { await s.close(); }
});

// a stand-in for dist-local/: the edit page, an asset, the icon, and a file that is not the editor's
function editorBuild() {
  const dir = mkdtempSync(join(tmpdir(), 'fdlocal-'));
  mkdirSync(join(dir, 'edit')); mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'edit', 'index.html'), '<!doctype html><title>local</title>');
  writeFileSync(join(dir, 'assets', 'edit-1.js'), 'console.log(1)');
  writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
  writeFileSync(join(dir, 'notes.txt'), 'not served');
  return dir;
}
// a request with a Host header of our choosing (fetch does not let one be set)
const get = (url: string, host: string) => new Promise<number>((ok, fail) => {
  const u = new URL(url);
  request({ hostname: '127.0.0.1', port: u.port, path: u.pathname, headers: { host } }, (r) => { r.resume(); ok(r.statusCode!); }).on('error', fail).end();
});

test('local: serves the editor\'s own files under the token and opens it there, with the diagram after the #', async () => {
  const s = await serveDiagrams(folder(), { open: 'a.fdraw', local: editorBuild() });
  try {
    const u = new URL(s.url);
    assert.equal(u.origin + u.pathname, s.base + '/edit/');
    assert.equal(new URLSearchParams(u.hash.slice(1)).get('serve'), s.base);
    const page = await fetch(s.base + '/edit/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type')!, /text\/html/);
    assert.equal((await fetch(s.base + '/assets/edit-1.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal((await fetch(s.base + '/favicon.svg')).status, 200);
    for (const p of ['notes.txt', 'assets/../notes.txt', 'assets/%2e%2e/notes.txt', 'edit/../../etc/passwd']) assert.notEqual((await fetch(s.base + '/' + p)).status, 200, p);
    // the editor saves from its own address; the site's address is refused
    const own = new URL(s.base).origin;
    assert.equal((await fetch(s.base + '/f/a.fdraw', { method: 'PUT', body: 'look "./a.look"\n', headers: { Origin: own } })).status, 200);
    assert.equal((await fetch(s.base + '/f/a.fdraw', { method: 'PUT', body: 'x', headers: { Origin: 'https://fastdraw.dev' } })).status, 403);
  } finally { await s.close(); }
});

test('answers only when asked for by this computer\'s own name', async () => {
  const s = await serveDiagrams(folder(), { open: 'a.fdraw', local: editorBuild() });
  try {
    assert.equal(await get(s.base + '/edit/', `127.0.0.1:${s.port}`), 200);
    assert.equal(await get(s.base + '/edit/', `localhost:${s.port}`), 200);
    assert.equal(await get(s.base + '/edit/', `evil.example:${s.port}`), 403);
    assert.equal(await get(s.base + '/list', 'evil.example'), 403);
  } finally { await s.close(); }
});

test('tries the given port first, and takes any free one when it is in use', async () => {
  const busy = createServer();
  await new Promise<void>((ok) => busy.listen(0, '127.0.0.1', ok));
  const port = (busy.address() as { port: number }).port;
  try {
    const s = await serveDiagrams(folder(), { open: 'a.fdraw', local: editorBuild(), port });
    try { assert.notEqual(s.port, port); assert.equal((await fetch(s.base + '/edit/')).status, 200); } finally { await s.close(); }
  } finally { busy.close(); }
});
