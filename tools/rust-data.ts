// Writes crates/fastdraw-render/data/* from the TypeScript sources, so the Rust crate's data is never
// copied by hand. Run with `npm run rust:data`; the output is deterministic, so `git diff` stays empty.
//
// Layout. Strings are `u32 LE length + UTF-8 bytes`; every list is preceded by its `u32 LE count`.
//   looks.txt            text: records `name\0source\0`; the default look comes first under the empty name,
//                        then BUNDLED_LOOKS in its order.
//   widths.bin           u32 n + n * u16 (WIDTH_CHARS as UTF-16 units); u32 families; per family: string name,
//                        u32 weights; per weight (ascending): u32 weight, u32 n, n * i16 LE widths.
//   icons-core.bin.deflate, icons-extended.bin.deflate
//                        raw deflate (level 9) of: list of names (regular weight's keys, in order); then for
//                        each weight thin, light, regular, bold, fill: u32 count + (string name, list of
//                        string paths); then the duotone tint the same way; then the words: u32 count +
//                        (string name, string words). Core: ICON_WEIGHTS, DUOTONE_TINT, ICON_WORDS as
//                        loaded; extended: iconSetAll.ts EXTRA_WEIGHTS, EXTRA_TINT, EXTRA_WORDS. The two
//                        sets share no icon names and every weight has the same names in the same order.
//   fonts.bin.deflate    raw deflate (level 9) of: u32 count + (string file name, u32 length + bytes) for
//                        each fonts/*.ttf in file-name order, with ligature features turned off
//                        (withoutLigatures; the original bytes when there is nothing to turn off).
//   font-families.txt    text: the lowercased fontMeta family of each fonts/*.ttf, one per line, same order.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { BUNDLED_LOOKS } from '../src/bundledLooks.ts';
import { DEFAULT_LOOK } from '../src/defaultLook.ts';
import { WIDTH_CHARS, FONT_WIDTHS } from '../src/fontWidths.ts';
import { ICON_WEIGHTS, DUOTONE_TINT } from '../src/iconSet.ts';
import { ICON_WORDS } from '../src/icons.ts';
import { EXTRA_WEIGHTS, EXTRA_TINT, EXTRA_WORDS } from '../src/iconSetAll.ts';
import { fontMeta, withoutLigatures } from '../src/fontmeta.ts';

const root = join(import.meta.dirname, '..');
const out = join(root, 'crates', 'fastdraw-render', 'data');
mkdirSync(out, { recursive: true });

class Writer {
  parts: Buffer[] = [];
  u32(n: number) { const b = Buffer.alloc(4); b.writeUInt32LE(n); this.parts.push(b); }
  u16(n: number) { const b = Buffer.alloc(2); b.writeUInt16LE(n); this.parts.push(b); }
  i16(n: number) { const b = Buffer.alloc(2); b.writeInt16LE(n); this.parts.push(b); }
  bytes(b: Uint8Array) { this.u32(b.length); this.parts.push(Buffer.from(b.buffer, b.byteOffset, b.byteLength)); }
  str(s: string) { this.bytes(Buffer.from(s, 'utf8')); }
  strs(l: string[]) { this.u32(l.length); for (const s of l) this.str(s); }
  done() { return Buffer.concat(this.parts); }
}
const deflate = (b: Buffer) => deflateRawSync(b, { level: 9 });
const write = (name: string, data: string | Buffer) => writeFileSync(join(out, name), data);

// looks.txt
let looks = `\0${DEFAULT_LOOK}\0`;
for (const [name, src] of Object.entries(BUNDLED_LOOKS)) looks += `${name}\0${src}\0`;
write('looks.txt', looks);

// widths.bin
{
  const w = new Writer();
  w.u32(WIDTH_CHARS.length);
  for (let i = 0; i < WIDTH_CHARS.length; i++) w.u16(WIDTH_CHARS.charCodeAt(i));
  const families = Object.entries(FONT_WIDTHS);
  w.u32(families.length);
  for (const [family, weights] of families) {
    w.str(family);
    const list = Object.entries(weights); // integer keys: ascending
    w.u32(list.length);
    for (const [weight, widths] of list) {
      w.u32(Number(weight));
      w.u32(widths.length);
      for (const v of widths) w.i16(v);
    }
  }
  write('widths.bin', w.done());
}

// icons
const WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill'] as const;
function icons(weights: Record<string, Record<string, string[]>>, tint: Record<string, string[]>, words: Record<string, string>) {
  const w = new Writer();
  const names = Object.keys(weights.regular);
  for (const k of WEIGHTS) if (Object.keys(weights[k]).join('\0') !== names.join('\0')) throw new Error(`weight ${k} has different icons`);
  w.strs(names);
  for (const k of WEIGHTS) {
    w.u32(names.length);
    for (const n of names) { w.str(n); w.strs(weights[k][n]); }
  }
  const t = Object.entries(tint);
  w.u32(t.length);
  for (const [n, p] of t) { w.str(n); w.strs(p); }
  const wd = Object.entries(words);
  w.u32(wd.length);
  for (const [n, s] of wd) { w.str(n); w.str(s); }
  return deflate(w.done());
}
write('icons-core.bin.deflate', icons(ICON_WEIGHTS, DUOTONE_TINT, ICON_WORDS));
write('icons-extended.bin.deflate', icons(EXTRA_WEIGHTS, EXTRA_TINT, EXTRA_WORDS));

// fonts
{
  const dir = join(root, 'fonts');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ttf')).sort();
  const w = new Writer();
  w.u32(files.length);
  const families: string[] = [];
  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(join(dir, f)));
    const meta = fontMeta(bytes);
    if (!meta) throw new Error(`${f}: no font metadata`);
    families.push(meta.family.toLowerCase());
    w.str(f);
    w.bytes(withoutLigatures(bytes) ?? bytes);
  }
  write('fonts.bin.deflate', deflate(w.done()));
  write('font-families.txt', families.map((f) => `${f}\n`).join(''));
}
