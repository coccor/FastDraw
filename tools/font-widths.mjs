// Writes src/fontWidths.ts: the advance width of each common character in the fonts in fonts/, read
// from their cmap and hmtx tables, so text can be measured the way it is drawn. Run after adding a font:
//   node tools/font-widths.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '·–—…→←↑↓•×’‘“”';
const FILES = {
  'geist': { 400: 'Geist-Regular', 500: 'Geist-Medium', 600: 'Geist-SemiBold' },
  'libre franklin': { 400: 'LibreFranklin-Regular', 500: 'LibreFranklin-Medium', 600: 'LibreFranklin-SemiBold', 700: 'LibreFranklin-Bold' },
  'newsreader': { 400: 'Newsreader-Regular', 500: 'Newsreader-Medium', 600: 'Newsreader-SemiBold' },
  'instrument serif': { 400: 'InstrumentSerif-Regular' },
  'sketch hand': { 400: 'SketchHand-Regular' },
};

// Widths in hundredths of an em, -1 where the font has no glyph for the character.
function widths(file) {
  const b = readFileSync(file), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const t = {};
  for (let i = 0; i < dv.getUint16(4); i++) { const o = 12 + i * 16; t[b.toString('latin1', o, o + 4)] = dv.getUint32(o + 8); }
  const upem = dv.getUint16(t.head + 18), nh = dv.getUint16(t.hhea + 34);
  const adv = (g) => dv.getUint16(t.hmtx + 4 * Math.min(g, nh - 1));
  let sub = -1;
  for (let i = 0; i < dv.getUint16(t.cmap + 2); i++) {
    const r = t.cmap + 4 + i * 8, pid = dv.getUint16(r), eid = dv.getUint16(r + 2), at = t.cmap + dv.getUint32(r + 4), fmt = dv.getUint16(at);
    if (pid === 3 && (eid === 1 || eid === 10) && (fmt === 4 || fmt === 12)) sub = at;
  }
  const glyph = (c) => {
    if (dv.getUint16(sub) === 12) {
      for (let i = 0; i < dv.getUint32(sub + 12); i++) {
        const o = sub + 16 + i * 12, s = dv.getUint32(o), e = dv.getUint32(o + 4);
        if (c >= s && c <= e) return dv.getUint32(o + 8) + c - s;
      }
      return 0;
    }
    const segX2 = dv.getUint16(sub + 6), ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let i = 0; i < segX2 / 2; i++) {
      const e = dv.getUint16(ends + i * 2), s = dv.getUint16(starts + i * 2);
      if (c > e) continue;
      if (c < s) return 0;
      const d = dv.getInt16(deltas + i * 2), r = dv.getUint16(ranges + i * 2);
      if (!r) return (c + d) & 0xffff;
      const g = dv.getUint16(ranges + i * 2 + r + (c - s) * 2);
      return g ? (g + d) & 0xffff : 0;
    }
    return 0;
  };
  return [...CHARS].map((ch) => { const g = glyph(ch.codePointAt(0)); return g ? Math.round((adv(g) / upem) * 100) : -1; });
}

export function generate() {
  let s = `// How wide each character is in the fonts FastDraw ships, in hundredths of an em (-1: not in the font), so text
// can be measured the way it is drawn. Written by tools/font-widths.mjs from fonts/*.ttf; do not edit by hand.
export const WIDTH_CHARS = ${JSON.stringify(CHARS)};
export const FONT_WIDTHS: Record<string, Record<number, number[]>> = {\n`;
  for (const [fam, ws] of Object.entries(FILES)) {
    s += `  '${fam}': {\n`;
    for (const [w, f] of Object.entries(ws)) s += `    ${w}: [${widths(fileURLToPath(new URL(`fonts/${f}.ttf`, root))).join(',')}],\n`;
    s += '  },\n';
  }
  return s + '};\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeFileSync(new URL('src/fontWidths.ts', root), generate());
