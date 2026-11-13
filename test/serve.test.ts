import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveFolder } from '../src/serve.ts';

const EDITOR = 'https://fastdraw.dev';

function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'fdserve-'));
  writeFileSync(join(dir, 'a.fdraw'), 'canvas 100x100\n');
  writeFileSync(join(dir, 'a.look'), 'color ink #000\n');
  mkdirSync(join(dir, 'icons'));
  writeFileSync(join(dir, 'icons', 'x y.svg'), '<svg/>');
  writeFileSync(join(dir, 'notes.txt'), 'hello');
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.git', 'config'), 'secret');
  return dir;
}

test('open link points the editor at a token on 127.0.0.1 and names the diagram', async () => {
  const s = await serveFolder(folder(), { editor: EDITOR, open: 'a.fdraw' });
  try {
    const u = new URL(s.url);
    assert.equal(u.origin, EDITOR);
    assert.match(u.searchParams.get('serve')!, /^http:\/\/127\.0\.0\.1:\d+\/[\w-]{20,}$/);
    assert.equal(u.searchParams.get('open'), 'a.fdraw');
  } finally { await s.close(); }
});

test('lists and reads the folder for the editor origin, skipping hidden folders', async () => {
  const s = await serveFolder(folder(), { editor: EDITOR });
  try {
    const h = { Origin: EDITOR };
    const l = await fetch(s.base + '/list', { headers: h });
    assert.equal(l.headers.get('access-control-allow-origin'), EDITOR);
    const paths = ((await l.json()) as { files: { path: string }[] }).files.map((f) => f.path).sort();
    assert.deepEqual(paths, ['a.fdraw', 'a.look', 'icons/x y.svg', 'notes.txt']);
    const r = await fetch(s.base + '/f/icons/x%20y.svg', { headers: h });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '<svg/>');
    assert.ok(Number(r.headers.get('x-mtime')) > 0);
  } finally { await s.close(); }
});

test('refuses other origins, a wrong token, and paths that leave the folder', async () => {
  const dir = folder();
  symlinkSync('/etc', join(dir, 'escape'));
  const s = await serveFolder(dir, { editor: EDITOR });
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
  const s = await serveFolder(folder(), { editor: EDITOR });
  try {
    const r = await fetch(s.base + '/f/a.fdraw', { method: 'OPTIONS', headers: { Origin: EDITOR, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Private-Network': 'true' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-private-network'), 'true');
    assert.match(r.headers.get('access-control-allow-methods')!, /PUT/);
  } finally { await s.close(); }
});

test('writes only diagrams and looks', async () => {
  const dir = folder();
  const s = await serveFolder(dir, { editor: EDITOR });
  try {
    const put = (p: string, body: string) => fetch(s.base + '/f/' + p, { method: 'PUT', body, headers: { Origin: EDITOR } });
    const ok = await put('a.fdraw', 'canvas 200x200\n');
    assert.equal(ok.status, 200);
    assert.equal(readFileSync(join(dir, 'a.fdraw'), 'utf8'), 'canvas 200x200\n');
    assert.equal((await put('notes.txt', 'x')).status, 403);
    assert.equal((await put('icons/x y.svg', 'x')).status, 403);
    assert.equal(readFileSync(join(dir, 'notes.txt'), 'utf8'), 'hello');
  } finally { await s.close(); }
});
