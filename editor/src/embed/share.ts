// A diagram carried in a link to the editor: `https://fastdraw.dev/edit/#fdraw=<data>`. The data is the
// file's name, its text and, when it uses a look file of its own, that file's path and text and the icon
// files the diagram uses from the look's icon folder, as JSON, compressed (deflate-raw) and base64url
// encoded. It sits after the # so it never reaches a server: nothing is stored anywhere but in the link.
//
// Icons are data URIs here, as everywhere else in the editor, but travel as SVG text, trimmed of what does
// not change the drawing: base64 would hide the text's repeats from the compression and cost a third more.
import { svgDataUri, MAX_ICON_FILES } from '../../../src/iconfiles.ts';

export type Shared = { name: string; text: string; look?: { path: string; text: string }; icons?: Record<string, string> };

/** Past this many characters a link may be cut short by the chat or mail app it is pasted into. */
export const LONG_LINK = 64_000;

// a link is untrusted: a few compressed bytes must not unpack into something huge
const MAX_BYTES = 4_000_000;

function b64url(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error('too large'); }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// Comments, the XML header, editor metadata and the space between tags, and coordinates kept to two
// decimals: an icon is drawn at most a few hundred pixels across, so nothing of this shows.
// A number cut to two decimals. A point stays when the next number follows straight on (".5.25" is two
// numbers), and so does the leading point of ".125".
function round2(m: string, at: number, all: string): string {
  let r = (+m).toFixed(2);
  if (all[at + m.length] !== '.') r = String(+r);
  return m.startsWith('.') && r.startsWith('0.') ? r.slice(1) : r;
}

export function trimSvg(svg: string): string {
  return svg
    .replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/gi, '')
    .replace(/<metadata[\s\S]*?<\/metadata>|<sodipodi:namedview[\s\S]*?(?:\/>|<\/sodipodi:namedview>)/gi, '')
    .replace(/\s(?:inkscape|sodipodi):[\w-]+="[^"]*"|\sxmlns:(?:inkscape|sodipodi|rdf|cc|dc)="[^"]*"/g, '')
    .replace(/(?<![\d.])\d*\.\d{3,}(?![\deE])/g, round2)
    .replace(/>\s*\n\s*</g, '><')
    .trim();
}

function svgText(uri: string): string | null {
  const m = /^data:image\/svg\+xml;base64,(.*)$/.exec(uri);
  if (!m) return null;
  try { return new TextDecoder().decode(Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0))); } catch { return null; }
}

export async function encodeShared(d: Shared): Promise<string> {
  const o: Record<string, unknown> = { name: d.name, text: d.text };
  if (d.look) o.look = d.look;
  const icons: Record<string, string> = {};
  for (const [k, v] of Object.entries(d.icons ?? {})) { const t = svgText(v); if (t) icons[k] = trimSvg(t); }
  if (Object.keys(icons).length) o.icons = icons;
  return b64url(await through(new TextEncoder().encode(JSON.stringify(o)), new CompressionStream('deflate-raw')));
}

// Icons from a link are checked as an icon file from a folder is: an SVG of a sane size, under a plain name.
function iconsFrom(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, t] of Object.entries(v).slice(0, MAX_ICON_FILES)) {
    const uri = /^[a-z0-9-]{1,80}$/.test(k) && typeof t === 'string' ? svgDataUri(new TextEncoder().encode(t)) : null;
    if (uri) out[k] = uri;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The diagram in `data`, or null when it is not one (cut short, tampered with, or not FastDraw's). */
export async function decodeShared(data: string): Promise<Shared | null> {
  try {
    const o = JSON.parse(new TextDecoder().decode(await through(unb64url(data), new DecompressionStream('deflate-raw'))));
    if (!o || typeof o.text !== 'string') return null;
    const name = typeof o.name === 'string' && o.name ? o.name.slice(0, 200) : 'diagram.fdraw';
    const look = o.look && typeof o.look.path === 'string' && typeof o.look.text === 'string' ? { path: o.look.path, text: o.look.text } : undefined;
    const icons = look ? iconsFrom(o.icons) : undefined; // icon files belong to a look file
    return { name, text: o.text, ...(look ? { look } : {}), ...(icons ? { icons } : {}) };
  } catch {
    return null;
  }
}

/** The `fdraw=` value in a location hash, or null. */
export function sharedInHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, '')).get('fdraw');
}

/** A link that opens the diagram in the editor at `editor` (the editor's address, e.g. https://fastdraw.dev/edit/). */
export async function editorLink(editor: string, d: Shared): Promise<string> {
  const u = new URL(editor);
  u.hash = 'fdraw=' + (await encodeShared(d));
  return u.href;
}
