// Reads the family name, weight and italic flag out of a TTF or OTF file, so the editor can
// register a look's own fonts and the command line can tell which families it has.
export type FontMeta = { family: string; weight: number; italic: boolean };

export function fontMeta(b: Uint8Array): FontMeta | null {
  try {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const tag = dv.getUint32(0);
    if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null; // TrueType, 'OTTO', 'true'
    const tables = new Map<string, number>();
    const n = dv.getUint16(4);
    if (12 + n * 16 > b.length) return null;
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      tables.set(String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]), dv.getUint32(o + 8));
    }
    const name = tables.get('name');
    if (name === undefined) return null;
    // Font files are untrusted: every offset is checked against the file size, names are
    // capped, and a record is only decoded when it is one we still need.
    if (name + 6 > b.length) return null;
    const count = dv.getUint16(name + 2), store = name + dv.getUint16(name + 4);
    if (name + 6 + count * 12 > b.length) return null;
    const found = new Map<number, string>();
    for (let i = 0; i < count && found.size < 4; i++) {
      const r = name + 6 + i * 12;
      const platform = dv.getUint16(r), id = dv.getUint16(r + 6), len = dv.getUint16(r + 8), off = store + dv.getUint16(r + 10);
      if ((id !== 1 && id !== 16) || (platform !== 3 && platform !== 0 && platform !== 1)) continue;
      if (found.has(id * 10 + (platform === 1 ? 1 : 0)) || len > 256 || off + len > b.length) continue;
      let s = '';
      if (platform === 1) for (let k = 0; k < len; k++) s += String.fromCharCode(b[off + k]);
      else for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(dv.getUint16(off + k));
      const key = id * 10 + (platform === 1 ? 1 : 0); // prefer the Unicode records
      if (s && !found.has(key)) found.set(key, s);
    }
    const family = found.get(160) ?? found.get(161) ?? found.get(10) ?? found.get(11);
    if (!family) return null;
    const os2 = tables.get('OS/2');
    const hasOs2 = os2 !== undefined && os2 + 64 <= b.length;
    const weight = hasOs2 ? dv.getUint16(os2 + 4) : 400;
    const italic = hasOs2 ? (dv.getUint16(os2 + 62) & 1) === 1 : false;
    return { family, weight: weight >= 1 && weight <= 1000 ? weight : 400, italic };
  } catch { return null; }
}

// The ligature features a browser turns off for font-variant-ligatures: none. Diagrams show code,
// command lines and SQL, so `--`, `->`, `>=` and `...` must be drawn as the characters written.
const LIGATURES = new Set(['liga', 'clig', 'dlig', 'hlig', 'calt']);

// A copy of a TTF or OTF file with its ligature features renamed so no shaper applies them, for
// the PNG renderer (resvg), which cannot turn them off from the SVG. Null when the file has none
// to turn off, or cannot be read. Only the four-letter tags in the GSUB feature list change.
export function withoutLigatures(b: Uint8Array): Uint8Array | null {
  try {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const tag = dv.getUint32(0);
    if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null;
    const n = dv.getUint16(4);
    if (12 + n * 16 > b.length) return null;
    let gsub = -1;
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      if (String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]) === 'GSUB') gsub = dv.getUint32(o + 8);
    }
    if (gsub < 0 || gsub + 10 > b.length) return null;
    const list = gsub + dv.getUint16(gsub + 6);
    if (list + 2 > b.length) return null;
    const count = dv.getUint16(list);
    if (list + 2 + count * 6 > b.length) return null;
    let out: Uint8Array | null = null;
    for (let i = 0; i < count; i++) {
      const r = list + 2 + i * 6;
      if (!LIGATURES.has(String.fromCharCode(b[r], b[r + 1], b[r + 2], b[r + 3]))) continue;
      out ??= b.slice();
      out.set([0x7a, 0x7a, 0x7a, 0x7a], r); // 'zzzz': a tag no shaper asks for
    }
    return out;
  } catch { return null; }
}
