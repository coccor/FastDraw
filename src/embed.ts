// Exported images carry the diagram and its look, so an image taken from a wiki page can be
// opened and edited again without the repo.
// icons: the icon files the diagram uses (name -> data URI), so they survive without the look's folder
export type Payload = { v: 1; diagram: string; look: string | null; icons?: Record<string, string> };

const b64 = (s: string) => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
const parse = (s: string): Payload | null => { try { const p = JSON.parse(unb64(s)); return p && p.v === 1 && typeof p.diagram === 'string' ? p : null; } catch { return null; } };

export function embedSvg(svg: string, p: Payload): string {
  return svg.replace(/(<svg[^>]*>)/, `$1\n<metadata id="fastdraw-source">${b64(JSON.stringify(p))}</metadata>`);
}
export function extractSvg(svg: string): Payload | null {
  const m = /<metadata id="fastdraw-source">([A-Za-z0-9+/=]+)<\/metadata>/.exec(svg);
  return m ? parse(m[1]) : null;
}

const KEY = 'fastdraw-source';
let table: Uint32Array | undefined;
function crc32(buf: Uint8Array): number {
  if (!table) { table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

// Adds a tEXt chunk just before IEND.
export function embedPng(png: Uint8Array, p: Payload): Uint8Array {
  if (!isPng(png)) return png;
  const text = new TextEncoder().encode(`${KEY}\0${b64(JSON.stringify(p))}`);
  const chunk = new Uint8Array(12 + text.length), dv = new DataView(chunk.buffer);
  dv.setUint32(0, text.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // "tEXt"
  chunk.set(text, 8);
  dv.setUint32(8 + text.length, crc32(chunk.subarray(4, 8 + text.length)));
  const iend = png.length - 12;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, iend), 0); out.set(chunk, iend); out.set(png.subarray(iend), iend + chunk.length);
  return out;
}
export function extractPng(png: Uint8Array): Payload | null {
  if (!isPng(png)) return null;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let o = 8; o + 12 <= png.length;) {
    const len = dv.getUint32(o), type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    if (type === 'tEXt') {
      const body = new TextDecoder('latin1').decode(png.subarray(o + 8, o + 8 + len));
      if (body.startsWith(KEY + '\0')) return parse(body.slice(KEY.length + 1));
    }
    if (type === 'IEND') break;
    o += 12 + len;
  }
  return null;
}
