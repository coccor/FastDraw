import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subsetFont } from '../src/subset.ts';
import { fontMeta } from '../src/fontmeta.ts';

const font = (f: string) => new Uint8Array(readFileSync(new URL(`../fonts/${f}`, import.meta.url)));

// a minimal reader for checking the result: tables, glyph count, each glyph's bytes, char -> glyph (format 4)
function read(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const t = new Map<string, { off: number; len: number; sum: number }>();
  for (let i = 0; i < v.getUint16(4); i++) {
    const r = 12 + i * 16;
    t.set(String.fromCharCode(...b.subarray(r, r + 4)), { sum: v.getUint32(r + 4), off: v.getUint32(r + 8), len: v.getUint32(r + 12) });
  }
  const long = v.getInt16(t.get('head')!.off + 50) === 1, loca = t.get('loca')!.off, glyf = t.get('glyf')!.off;
  const at = (g: number) => (long ? v.getUint32(loca + g * 4) : v.getUint16(loca + g * 2) * 2);
  const glyph = (g: number) => b.subarray(glyf + at(g), glyf + at(g + 1));
  const cmap = t.get('cmap')!.off;
  let f4 = 0;
  for (let i = 0; i < v.getUint16(cmap + 2); i++) {
    const r = cmap + 4 + i * 8, sub = cmap + v.getUint32(r + 4);
    if (v.getUint16(r) === 3 && v.getUint16(r + 2) === 1 && v.getUint16(sub) === 4) f4 = sub;
  }
  const segs = v.getUint16(f4 + 6) / 2, ends = f4 + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
  const gid = (c: number) => {
    for (let i = 0; i < segs; i++) {
      if (c > v.getUint16(ends + i * 2)) continue;
      const s = v.getUint16(starts + i * 2); if (c < s) return 0;
      const d = v.getUint16(deltas + i * 2), ro = v.getUint16(ranges + i * 2);
      if (!ro) return (c + d) & 0xffff;
      const g = v.getUint16(ranges + i * 2 + ro + (c - s) * 2);
      return g ? (g + d) & 0xffff : 0;
    }
    return 0;
  };
  return { t, glyphs: v.getUint16(t.get('maxp')!.off + 4), glyph, gid };
}

test('a font cut to some text keeps those glyphs as they were and empties the rest', () => {
  const whole = font('Geist-Regular.ttf');
  const cut = subsetFont(whole, 'Hello, world')!;
  assert.ok(cut.length < whole.length / 2, `${cut.length} of ${whole.length}`);
  const a = read(whole), b = read(cut);
  assert.equal(b.glyphs, a.glyphs, 'glyph numbers do not move');
  for (const ch of 'Helo,wrd ') assert.deepEqual(b.glyph(b.gid(ch.codePointAt(0)!)), a.glyph(a.gid(ch.codePointAt(0)!)), ch);
  assert.ok(a.glyph(a.gid(90)).length > 0 && b.glyph(b.gid(90)).length === 0, 'Z is not used, so it has no outline');
  assert.ok(b.glyph(0).length > 0, '.notdef stays');
  assert.deepEqual(fontMeta(cut), fontMeta(whole));
  assert.ok(!b.t.has('GSUB') && b.t.has('GPOS'), 'ligatures go, kerning stays');
  assert.equal(new DataView(cut.buffer).getUint32(b.t.get('post')!.off), 0x00030000, 'no glyph names');
});

test('the parts of a composite glyph are kept', () => {
  for (const f of ['Geist-Regular.ttf', 'Newsreader-Regular.ttf', 'LibreFranklin-Regular.ttf']) {
    const text = 'éüñÅçœ';
    const b = read(subsetFont(font(f), text)!);
    let composites = 0;
    for (const ch of text) {
      const g = b.glyph(b.gid(ch.codePointAt(0)!));
      assert.ok(g.length > 0, `${f} ${ch}`);
      if (new DataView(g.buffer, g.byteOffset).getInt16(0) >= 0) continue;
      composites++;
      let o = 10;
      for (;;) {
        const dv = new DataView(g.buffer, g.byteOffset, g.byteLength);
        const flags = dv.getUint16(o), part = dv.getUint16(o + 2);
        assert.ok(b.glyph(part).length > 0, `${f} ${ch}: part ${part}`);
        o += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
        if (!(flags & 0x20)) break;
      }
    }
    if (f.startsWith('Geist')) assert.ok(composites > 0, 'Geist builds accented letters from parts');
  }
});

test('the file is well formed: aligned tables, checksums, whole-file adjustment', () => {
  const cut = subsetFont(font('Newsreader-Italic.ttf'), 'Kerning AVATAR')!;
  const v = new DataView(cut.buffer);
  const { t } = read(cut);
  const sum = (s: number, e: number) => { let x = 0; for (let i = s; i < e; i += 4) x = (x + v.getUint32(i)) >>> 0; return x; };
  assert.deepEqual([...t.keys()], [...t.keys()].sort());
  for (const [tag, { off, len, sum: want }] of t) {
    assert.equal(off % 4, 0, tag);
    if (tag !== 'head') assert.equal(sum(off, off + ((len + 3) & ~3)), want, tag);
  }
  assert.equal(cut.length % 4, 0);
  assert.equal(sum(0, cut.length), 0xb1b0afba);
});

test('kerning: false drops GPOS for a smaller file', () => {
  const k = subsetFont(font('Newsreader-Regular.ttf'), 'AVATAR')!, n = subsetFont(font('Newsreader-Regular.ttf'), 'AVATAR', { kerning: false })!;
  assert.ok(n.length < k.length / 3);
  assert.ok(!read(n).t.has('GPOS'));
});

test('fonts it cannot cut, and broken files, give null', () => {
  assert.equal(subsetFont(font('SketchHand-Regular.ttf'), 'abc'), null, 'CFF');
  const whole = font('Geist-Regular.ttf');
  assert.equal(subsetFont(whole.subarray(0, 4000), 'abc'), null, 'cut short');
  assert.equal(subsetFont(new Uint8Array(64), 'abc'), null);
  const bad = whole.slice(); new DataView(bad.buffer).setUint32(12 + 8, 0xfffffff0);
  assert.equal(subsetFont(bad, 'abc'), null, 'a table outside the file');
  assert.ok(subsetFont(whole, '😀 𝔸 \u0000'), 'characters the font lacks are skipped');
});
