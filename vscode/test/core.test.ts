import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { draw, problems, fontFaces, loadIcons } from '../src/core.ts';
import { bundledFonts } from '../../src/node.ts';

const dir = mkdtempSync(join(tmpdir(), 'fastdraw-vscode-'));
const file = join(dir, 'd.fdraw');
const SRC = `api: focal "Orders API" at 40,60
db: store "Orders DB" at 300,56

api -> db "writes"
text "note" at 40,200
`;
writeFileSync(file, SRC);

test('draws the unsaved text, with a box to click for each element and its line', () => {
  const d = draw(file, SRC);
  assert.match(d.svg, /^<svg[\s>]/);
  assert.match(d.svg, /Orders API/);
  assert.equal(d.dark, false);
  const lines = d.hits.map((h) => h.line);
  assert.deepEqual(lines, [1, 2, 4, 5]);
  const conn = d.hits.find((h) => h.line === 4)!;
  assert.ok(conn.pts && conn.pts.length >= 2);
  const api = d.hits[0];
  assert.ok(api.w > 0 && api.h > 0);
});

test('a dark theme draws the look\'s dark version and keeps the line numbers', () => {
  const light = draw(file, SRC), dark = draw(file, SRC, { dark: true });
  assert.equal(dark.dark, true);
  assert.notEqual(dark.svg, light.svg);
  assert.deepEqual(dark.hits.map((h) => h.line), light.hits.map((h) => h.line));
});

test('a look with no dark version is drawn light, saying why', () => {
  const look = join(dir, 'plain.look');
  writeFileSync(look, 'color paper #ffffff\ncolor ink #111111\n');
  const src = 'look "./plain.look"\n' + SRC;
  const d = draw(file, src, { dark: true });
  assert.equal(d.dark, false);
  assert.match(d.note ?? '', /no dark version/);
});

test('problems are the checker\'s, with the lines of the text as written', () => {
  const src = SRC + 'clash: focal "Overlaps the API" at 60,70\n';
  const issues = problems(file, src);
  assert.ok(issues.some((i) => i.line === 6 && i.level === 'warn' && /overlaps api/.test(i.msg)), JSON.stringify(issues));
  assert.deepEqual(problems(file, SRC).filter((i) => i.level !== 'hint'), []);
});

test('every Phosphor icon is known once loaded, as on the command line', async () => {
  const src = 'a: node "Home" at 40,40 icon=house\nb: node "Pay" at 240,40 icon=credit-card\n';
  await loadIcons();
  assert.deepEqual(problems(file, src).filter((i) => i.level === 'error'), []);
});

test('font faces are named by what is in the file', () => {
  const css = fontFaces(bundledFonts(), (f) => `u:${f}`);
  assert.match(css, /font-family:'Geist';font-weight:400;font-style:normal;src:url\(u:[^)]*Geist-Regular\.ttf\)/);
  assert.match(css, /font-family:'Newsreader';font-weight:400;font-style:italic/);
  assert.equal(fontFaces([join(dir, 'missing.ttf'), file], () => 'x'), '');
});
