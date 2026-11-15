// Cuts a TrueType font down to the characters a diagram uses, for SVGs that carry their fonts inside.
//
// Glyph numbers stay as they are: every glyph the text does not need keeps its slot but loses its outline
// (a zero-length entry in loca), so cmap, hmtx and the rest still point at the right places and need no
// rewriting. Composite glyphs keep the glyphs they are built from. GSUB goes (the SVG turns ligatures off,
// and a substitution could reach a glyph that was emptied), and so do the glyph names in post. GPOS
// (kerning) stays, so the text draws exactly as with the whole font; `kerning: false` drops it too, for a
// much smaller file (Newsreader's kerning is most of the file) with visibly looser pairs like "YA".
//
// Only fonts with a glyf table are cut; for any other (CFF), or a file that does not read cleanly, the
// answer is null and the caller uses the whole file. Font files are untrusted: every read is bounds-checked.

const DROP = new Set(['GSUB', 'DSIG', 'hdmx', 'LTSH', 'VDMX', 'kern']);

type Table = { tag: string; off: number; len: number };

export function subsetFont(font: Uint8Array, text: string, opts: { kerning?: boolean } = {}): Uint8Array | null {
  try { return cut(font, text, opts.kerning ?? true); } catch { return null; }
}

function cut(b: Uint8Array, text: string, kerning: boolean): Uint8Array | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (o: number) => { if (o + 2 > b.length) throw 0; return dv.getUint16(o); };
  const i16 = (o: number) => { if (o + 2 > b.length) throw 0; return dv.getInt16(o); };
  const u32 = (o: number) => { if (o + 4 > b.length) throw 0; return dv.getUint32(o); };
  if (u32(0) !== 0x00010000 && u32(0) !== 0x74727565) return null;
  const n = u16(4);
  const tables = new Map<string, Table>();
  for (let i = 0; i < n; i++) {
    const r = 12 + i * 16;
    const t = { tag: String.fromCharCode(b[r], b[r + 1], b[r + 2], b[r + 3]), off: u32(r + 8), len: u32(r + 12) };
    if (t.off + t.len > b.length) throw 0;
    tables.set(t.tag, t);
  }
  const head = tables.get('head'), maxp = tables.get('maxp'), loca = tables.get('loca'), glyf = tables.get('glyf'), cmap = tables.get('cmap');
  if (!head || !maxp || !loca || !glyf || !cmap) return null;
  const glyphs = u16(maxp.off + 4);
  const longLoca = i16(head.off + 50) === 1;
  const at = (g: number) => (longLoca ? u32(loca.off + g * 4) : u16(loca.off + g * 2) * 2);
  if (loca.len < (glyphs + 1) * (longLoca ? 4 : 2)) throw 0;

  // the glyphs to keep: .notdef, the ones the characters map to, and what composites are built from
  const keep = new Set<number>([0]);
  const map = charMap(cmap.off, u16, u32);
  for (const ch of new Set([...text, ' '])) { const g = map(ch.codePointAt(0)!); if (g > 0 && g < glyphs) keep.add(g); }
  const todo = [...keep];
  while (todo.length) {
    const g = todo.pop()!;
    const s = glyf.off + at(g), e = glyf.off + at(g + 1);
    if (e <= s || i16(s) >= 0) continue; // empty, or a simple glyph
    let o = s + 10;
    for (;;) {
      const flags = u16(o), c = u16(o + 2);
      if (c < glyphs && !keep.has(c)) { keep.add(c); todo.push(c); }
      o += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
      if (!(flags & 0x20)) break;
    }
  }

  // the new glyf and (long) loca
  const parts: Uint8Array[] = [];
  const newLoca = new Uint8Array((glyphs + 1) * 4);
  const lv = new DataView(newLoca.buffer);
  let size = 0;
  for (let g = 0; g < glyphs; g++) {
    lv.setUint32(g * 4, size);
    if (!keep.has(g)) continue;
    const s = at(g), e = at(g + 1);
    if (e <= s) continue;
    if (glyf.off + e > b.length) throw 0;
    const len = (e - s + 3) & ~3; // 4-byte aligned
    const part = new Uint8Array(len);
    part.set(b.subarray(glyf.off + s, glyf.off + e));
    parts.push(part);
    size += len;
  }
  lv.setUint32(glyphs * 4, size);
  const newGlyf = new Uint8Array(size);
  let p = 0;
  for (const part of parts) { newGlyf.set(part, p); p += part.length; }

  const newHead = b.slice(head.off, head.off + head.len);
  new DataView(newHead.buffer).setInt16(50, 1); // indexToLocFormat: long
  new DataView(newHead.buffer).setUint32(8, 0); // checkSumAdjustment, set below
  const post = tables.get('post');
  let newPost: Uint8Array | null = null;
  if (post) { newPost = b.slice(post.off, post.off + 32); new DataView(newPost.buffer).setUint32(0, 0x00030000); } // version 3: no glyph names

  const out = new Map<string, Uint8Array>();
  for (const t of tables.values()) {
    if (DROP.has(t.tag) || (!kerning && (t.tag === 'GPOS' || t.tag === 'GDEF'))) continue;
    out.set(t.tag, t.tag === 'glyf' ? newGlyf : t.tag === 'loca' ? newLoca : t.tag === 'head' ? newHead : t.tag === 'post' && newPost ? newPost : b.subarray(t.off, t.off + t.len));
  }
  return assemble(out);
}

/** char code -> glyph, from the cmap's Unicode subtable (format 12 if there is one, else format 4). */
function charMap(cmap: number, u16: (o: number) => number, u32: (o: number) => number): (c: number) => number {
  const count = u16(cmap + 2);
  let f4 = -1, f12 = -1;
  for (let i = 0; i < count; i++) {
    const r = cmap + 4 + i * 8, plat = u16(r), enc = u16(r + 2), sub = cmap + u32(r + 4);
    const fmt = u16(sub);
    if (fmt === 12 && (plat === 0 || (plat === 3 && enc === 10))) f12 = sub;
    if (fmt === 4 && (plat === 0 || (plat === 3 && enc === 1))) f4 = sub;
  }
  if (f12 >= 0) {
    const groups = u32(f12 + 12);
    return (c) => {
      for (let i = 0; i < groups; i++) {
        const g = f12 + 16 + i * 12, start = u32(g), end = u32(g + 4);
        if (c >= start && c <= end) return u32(g + 8) + c - start;
      }
      return 0;
    };
  }
  if (f4 < 0) return () => 0;
  const segs = u16(f4 + 6) / 2;
  const ends = f4 + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
  return (c) => {
    if (c > 0xffff) return 0;
    for (let i = 0; i < segs; i++) {
      if (c > u16(ends + i * 2)) continue;
      const start = u16(starts + i * 2);
      if (c < start) return 0;
      const delta = u16(deltas + i * 2), ro = u16(ranges + i * 2);
      if (ro === 0) return (c + delta) & 0xffff;
      const g = u16(ranges + i * 2 + ro + (c - start) * 2);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };
}

const sum = (d: Uint8Array) => {
  let s = 0;
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  for (let i = 0; i + 4 <= d.length; i += 4) s = (s + v.getUint32(i)) >>> 0;
  const rest = d.length & 3;
  if (rest) { let last = 0; for (let k = 0; k < 4; k++) last = (last << 8) | (k < rest ? d[d.length - rest + k] : 0); s = (s + (last >>> 0)) >>> 0; }
  return s;
};

/** A TrueType file from its tables, sorted by tag, 4-byte aligned, with checksums. */
function assemble(tables: Map<string, Uint8Array>): Uint8Array {
  const tags = [...tables.keys()].sort();
  const n = tags.length;
  let pow = 1, log = 0;
  while (pow * 2 <= n) { pow *= 2; log++; }
  let off = 12 + n * 16;
  const size = off + tags.reduce((a, t) => a + ((tables.get(t)!.length + 3) & ~3), 0);
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x00010000); v.setUint16(4, n); v.setUint16(6, pow * 16); v.setUint16(8, log); v.setUint16(10, n * 16 - pow * 16);
  let headAt = -1;
  tags.forEach((tag, i) => {
    const d = tables.get(tag)!, r = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[r + k] = tag.charCodeAt(k);
    v.setUint32(r + 4, sum(d)); v.setUint32(r + 8, off); v.setUint32(r + 12, d.length);
    out.set(d, off);
    if (tag === 'head') headAt = off;
    off += (d.length + 3) & ~3;
  });
  if (headAt >= 0) v.setUint32(headAt + 8, (0xb1b0afba - sum(out)) >>> 0);
  return out;
}
