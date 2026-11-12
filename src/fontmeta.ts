// Reads the family name, weight and italic flag out of a TTF or OTF file, so the editor can
// register a look's own fonts and the command line can tell which families it has.
export type FontMeta = { family: string; weight: number; italic: boolean };

export function fontMeta(b: Uint8Array): FontMeta | null {
  try {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const tag = dv.getUint32(0);
    if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null; // TrueType, 'OTTO', 'true'
    const tables = new Map<string, number>();
    for (let i = 0, n = dv.getUint16(4); i < n; i++) {
      const o = 12 + i * 16;
      tables.set(String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]), dv.getUint32(o + 8));
    }
    const name = tables.get('name');
    if (name === undefined) return null;
    const count = dv.getUint16(name + 2), store = name + dv.getUint16(name + 4);
    const found = new Map<number, string>();
    for (let i = 0; i < count; i++) {
      const r = name + 6 + i * 12;
      const platform = dv.getUint16(r), id = dv.getUint16(r + 6), len = dv.getUint16(r + 8), off = store + dv.getUint16(r + 10);
      if ((id !== 1 && id !== 16) || (platform !== 3 && platform !== 0 && platform !== 1)) continue;
      let s = '';
      if (platform === 1) for (let k = 0; k < len; k++) s += String.fromCharCode(b[off + k]);
      else for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(dv.getUint16(off + k));
      const key = id * 10 + (platform === 1 ? 1 : 0); // prefer the Unicode records
      if (s && !found.has(key)) found.set(key, s);
    }
    const family = found.get(160) ?? found.get(161) ?? found.get(10) ?? found.get(11);
    if (!family) return null;
    const os2 = tables.get('OS/2');
    const weight = os2 !== undefined ? dv.getUint16(os2 + 4) : 400;
    const italic = os2 !== undefined ? (dv.getUint16(os2 + 62) & 1) === 1 : false;
    return { family, weight: weight >= 1 && weight <= 1000 ? weight : 400, italic };
  } catch { return null; }
}
