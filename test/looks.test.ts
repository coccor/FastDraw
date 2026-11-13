import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUNDLED_LOOK_NAMES, bundledLook, bundledLookSource, defaultLook } from '../src/look.ts';
import { DEFAULT_LOOK } from '../src/defaultLook.ts';
import { parseStatements } from '../src/parse.ts';
import { buildScene } from '../src/scene.ts';
import { renderSvg } from '../src/render.ts';
// @ts-expect-error a plain JS tool
import { generate } from '../tools/bundle-looks.mjs';

const looks = () => [['built-in', defaultLook()] as const, ...BUNDLED_LOOK_NAMES.map((n) => [n, bundledLook(n)!] as const)];

test('the bundled looks match looks/*.look (run node tools/bundle-looks.mjs after editing one)', () => {
  assert.equal(readFileSync(new URL('../src/bundledLooks.ts', import.meta.url), 'utf8'), generate());
});

test('every look parses cleanly', () => {
  for (const [name, l] of looks()) assert.deepEqual(l.issues, [], name);
});

test('every look defines the same styles, so switching looks never drops one to a plain style', () => {
  // the styles a look writes out itself, not the plain ones every look falls back on
  const declared = (src: string) => new Set(parseStatements(src).filter((s) => s.toks[0]?.v === 'style').map((s) => s.toks[1]!.v));
  const sets = [['built-in', declared(DEFAULT_LOOK)] as const, ...BUNDLED_LOOK_NAMES.map((n) => [n, declared(bundledLookSource(n)!)] as const)];
  const all = new Set(sets.flatMap(([, d]) => [...d]));
  for (const [name, d] of sets) {
    const missing = [...all].filter((s) => !d.has(s));
    assert.deepEqual(missing, [], `${name} look lacks ${missing.join(', ')}`);
  }
  // and a style keeps its kind across looks, so a box stays a box
  for (const s of all) assert.equal(new Set(looks().map(([, l]) => l.styles.get(s)!.kind)).size, 1, s);
});

test('look <name> uses a bundled look; an unknown name or missing file is an error naming the choices', () => {
  const body = 'a: sticky "Idea" at 40,40\nb: node "B" at 240,40\na -> b';
  for (const n of BUNDLED_LOOK_NAMES) {
    const sc = buildScene(`look ${n}\n${body}`, null);
    assert.equal(sc.issues.filter((i) => i.level === 'error').length, 0, n);
    assert.equal(sc.look, bundledLook(n));
    assert.ok(renderSvg(sc).length > 0);
  }
  assert.match(buildScene(`look nope\n${body}`, null).issues[0]!.msg, /no look named nope; named looks: headline, night, reference, sketch, whiteboard/);
  assert.match(buildScene(`look "./x.look"\n${body}`, null).issues[0]!.msg, /look file not found/);
  // a bare name wins over whatever look a caller passed in
  assert.equal(buildScene(`look sketch\n${body}`, defaultLook()).look, bundledLook('sketch'));
});
