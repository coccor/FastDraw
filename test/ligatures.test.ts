import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Resvg } from '@resvg/resvg-js';
import { buildScene, textWidth } from '../src/scene.ts';
import { renderSvg } from '../src/render.ts';
import { withoutLigatures } from '../src/fontmeta.ts';
import { bundledFonts, withoutLigatureFonts } from '../src/node.ts';

// the GSUB feature tags of a font file
function features(b: Uint8Array): string[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), n = dv.getUint16(4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (String.fromCharCode(...b.subarray(o, o + 4)) !== 'GSUB') continue;
    const g = dv.getUint32(o + 8), list = g + dv.getUint16(g + 6);
    return Array.from({ length: dv.getUint16(list) }, (_, k) => String.fromCharCode(...b.subarray(list + 2 + k * 6, list + 6 + k * 6)));
  }
  return [];
}
const font = (name: string) => new Uint8Array(readFileSync(bundledFonts().find((f) => f.endsWith(name))!));

test('the font copies for the PNG renderer have no ligature features', () => {
  for (const name of ['GeistMono-Regular.ttf', 'Geist-Regular.ttf']) {
    const before = features(font(name)), after = features(withoutLigatures(font(name))!);
    assert.ok(before.includes('liga'));
    assert.deepEqual(after.filter((t) => ['liga', 'clig', 'dlig', 'hlig', 'calt'].includes(t)), []);
    assert.equal(after.length, before.length); // every other feature is kept
  }
  assert.equal(withoutLigatures(font('SketchHand-Regular.ttf')), null); // nothing to turn off
  assert.equal(withoutLigatures(new Uint8Array([1, 2, 3])), null);
});

test('the SVG turns ligatures off for all its text', () => {
  const svg = renderSvg(buildScene('a: node "pz run --log-format json" at 0,0\n', null));
  assert.match(svg, /<g style="font-variant-ligatures:none;text-rendering:geometricPrecision">[\s\S]*pz run --log-format json[\s\S]*<\/g>\n<\/svg>$/);
});

// Width of the ink of one line of Geist Mono, drawn by resvg with the fonts the command line uses.
const inkWidth = (text: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="40"><text x="10" y="30" font-family="Geist Mono" font-size="20">${text}</text></svg>`;
  return new Resvg(svg, { font: { fontFiles: withoutLigatureFonts(bundledFonts()), loadSystemFonts: false, defaultFontFamily: 'Geist' } }).getBBox()!.width;
};

test('code in the PNG is drawn character for character, as wide as it is measured', () => {
  // `->`, `>=`, `...` and `--` are ligatures in Geist Mono; drawn as one glyph they take one cell, not two or three
  const code = '|-&gt;&gt;=...--|', plain = '|aaaaaaaaa|';
  assert.ok(Math.abs(inkWidth(code) - inkWidth(plain)) < 0.5, `${inkWidth(code)} vs ${inkWidth(plain)}`);
  assert.equal(textWidth('|->>=...--|', 20, 'mono', 400, 0), textWidth(plain, 20, 'mono', 400, 0));
});

test('the font copies are made once per process and removed when it exits', () => {
  const first = withoutLigatureFonts(bundledFonts()), again = withoutLigatureFonts(bundledFonts());
  assert.deepEqual(again, first); // patched once, reused for every image
  const copies = first.filter((f) => !bundledFonts().includes(f));
  assert.ok(copies.length > 0);
  for (const f of copies) assert.ok(existsSync(f));
  // a process that patches the fonts leaves no copies behind once it has exited
  const node = new URL('../src/node.ts', import.meta.url).href;
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e',
    `import { bundledFonts, withoutLigatureFonts } from ${JSON.stringify(node)}; console.log(JSON.stringify(withoutLigatureFonts(bundledFonts()).filter((f) => !bundledFonts().includes(f))));`], { encoding: 'utf8' });
  const made: string[] = JSON.parse(r.stdout);
  assert.ok(made.length > 0, r.stderr);
  for (const f of made) assert.ok(!existsSync(f), f);
});
