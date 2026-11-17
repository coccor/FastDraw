// Icon and font files a look names by their https:// address, so the look works wherever it is opened without
// the files travelling with it: `icondir "https://.../{name}.svg"`, `icon vm "https://.../vm.svg"` and
// `font sans "Inter" "https://.../latin-{weight}-{style}.ttf"`. FastDraw stores none of it; the browser (or the
// command line) fetches each file from the address the look gives. Icon files go through the same checks as
// files read from a folder and are drawn as images; fonts are fetched only for faces the text uses.
// Browser-safe: fetch only.
import { isWebUrl } from './look.ts';
import type { Look } from './look.ts';
import { svgDataUri, MAX_ICON_BYTES } from './iconfiles.ts';
import { isBuiltIn } from './iconStyle.ts';

export const MAX_FONT_BYTES = 5_000_000;
// no more icons than this are fetched for one diagram
export const MAX_WEB_ICONS = 300;

/** Does the look name any icon by an https:// address? */
export const hasWebIcons = (look: Look): boolean => look.iconUrls.size > 0 || look.iconDirs.some(isWebUrl);
/** The look's icon folders that are folders, not addresses. */
export const localIconDirs = (look: Look): string[] => look.iconDirs.filter((d) => !isWebUrl(d));

/** Where the icon called `name` may be, in the order they are tried: its own `icon` line, then each icondir address. */
export function iconAddresses(look: Look, name: string): string[] {
  const out: string[] = [];
  const own = look.iconUrls.get(name);
  if (own) out.push(own);
  for (const d of look.iconDirs) {
    if (!isWebUrl(d)) continue;
    out.push(d.includes('{name}') ? d.replaceAll('{name}', name) : `${d.replace(/\/+$/, '')}/${name}.svg`);
  }
  return out;
}

/** Fetches one file: its bytes, null when the server says there is no such file, or throws when it cannot be reached. */
export type Fetch = (url: string, maxBytes: number) => Promise<Uint8Array | null>;

// Addresses that point into the machine or the local network are never fetched: a look is untrusted input and
// must not be able to make the command line (or a browser) ask a router, a metadata service or a dev server for
// anything. Only literal hosts are caught; names are trusted to be public.
export function isPrivateHost(host: string): boolean {
  // "localhost." and "LOCALHOST" are localhost too
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224;
  }
  // IPv6: unspecified, loopback, unique local, link-local, and the forms that carry an IPv4 address (mapped,
  // compatible, NAT64), which may point anywhere
  return h.includes(':') && (h === '::' || h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:') || /^::[0-9a-f.:]*$/.test(h) || h.startsWith('64:ff9b:'));
}

/** An https address whose host is not on the machine or the local network. */
export function isPublicWebUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && !isPrivateHost(u.hostname); } catch { return false; }
}

export const webFetch: Fetch = async (url, maxBytes) => {
  if (!isPublicWebUrl(url)) throw new Error('not a public https address');
  const u = new URL(url);
  // no cookies, no referrer and no redirects: the server learns only that someone opened a diagram with this
  // look, and cannot send the request on somewhere else
  const r = await fetch(u, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (r.status === 404 || r.status === 410) return null;
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`.trim());
  if (Number(r.headers.get('content-length')) > maxBytes) throw new Error('file too large');
  // read as it arrives and stop at the limit, whatever the server said the length would be
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = r.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel(); throw new Error('file too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return bytes;
};

const caches = new WeakMap<Fetch, Map<string, Promise<Uint8Array | null>>>();
// Each address is fetched once per page (or command) by each way of fetching: a failure that could not reach the
// server is forgotten, so the next try asks again.
function cached(get: Fetch, url: string, maxBytes: number): Promise<Uint8Array | null> {
  let cache = caches.get(get);
  if (!cache) caches.set(get, cache = new Map());
  let p = cache.get(url);
  if (!p) {
    p = get(url, maxBytes);
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

// ---- a look named by its web address --------------------------------------------------------------------
// `look "https://raw.githubusercontent.com/coccor/fastdraw-looks/main/engraved.look"`: the look file itself is on
// the web. It is fetched with the same rules as the files a look names (public https, no cookies, no redirects).
export const MAX_LOOK_BYTES = 1_000_000;

/** The look file's text, null when the server says there is none; throws when it cannot be reached or is not a look. */
export async function fetchWebLook(url: string, get: Fetch = webFetch): Promise<string | null> {
  const bytes = await get(url, MAX_LOOK_BYTES);
  if (!bytes) return null;
  const text = new TextDecoder().decode(bytes);
  // a site answering with its own HTML page instead of the file
  if (/^\s*</.test(text)) throw new Error('not a look file (it starts with "<")');
  return text;
}

export const hostOf = (url: string): string => { try { return new URL(url).host; } catch { return 'an address in the look'; } };

// ---- what a set on the web has --------------------------------------------------------------------------
// A web address cannot be listed, but jsDelivr publishes the file list of every package and repository it serves.
// So for an icondir on cdn.jsdelivr.net the icon names come from that list, for the preview, search and the
// editor's icon picker; a set elsewhere lists its names in the look (names="...").

/** Where jsDelivr lists the files of an icondir on cdn.jsdelivr.net, and how a listed file's path gives an icon name. */
export function setListing(dir: string): { url: string; nameOf: (path: string) => string | null } | null {
  const tpl = dir.includes('{name}') ? dir : `${dir.replace(/\/+$/, '')}/{name}.svg`;
  const m = /^https:\/\/cdn\.jsdelivr\.net\/(npm\/(?:@[^/@{}]+\/)?[^/@{}]+|gh\/[^/@{}]+\/[^/@{}]+)@([^/{}]+)(\/.*)$/i.exec(tpl);
  if (!m) return null;
  // matched by hand, not with a regular expression: the path is the template's fixed parts with the same name in
  // every {name}, so the name's length follows from the path's
  const parts = m[3]!.split('{name}'), fixed = parts.join('').length, k = parts.length - 1;
  if (k > 3) return null;
  return {
    url: `https://data.jsdelivr.com/v1/packages/${m[1]}@${m[2]}?structure=flat`,
    nameOf: (path) => {
      const len = (path.length - fixed) / k;
      if (path.length > 1000 || !Number.isInteger(len) || len < 1 || len > 80) return null;
      const name = path.slice(parts[0]!.length, parts[0]!.length + len);
      return /^[a-z0-9-]+$/.test(name) && parts.join(name) === path ? name : null;
    },
  };
}

export const MAX_LISTING_BYTES = 20_000_000;
/** Every icon name the look's web sets are known to have, sorted: from jsDelivr's lists and the look's names=. */
export async function listWebIcons(look: Look, get: Fetch = webFetch): Promise<string[]> {
  const out = new Set<string>();
  for (const d of look.iconDirs) {
    if (!isWebUrl(d)) continue;
    for (const n of look.iconSetNames.get(d) ?? []) out.add(n);
    const l = setListing(d);
    if (!l) continue;
    try {
      const bytes = await cached(get, l.url, MAX_LISTING_BYTES);
      const files = bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as { files?: { name?: unknown }[] }).files : undefined;
      for (const f of Array.isArray(files) ? files : []) { const n = typeof f?.name === 'string' ? l.nameOf(f.name) : null; if (n) out.add(n); }
    } catch { /* not listed: the set still works, by name */ }
  }
  for (const n of look.iconUrls.keys()) out.delete(n);
  return [...out].sort();
}

export type WebIcons = {
  uris: Record<string, string>; // name -> data URI, for withIconImages
  done: boolean; // every address was answered (found or not there), so an icon still missing is a real mistake
  unreachable: string[]; // hosts that could not be reached, for a note
};

/** The icon files for `names` from the look's web addresses. A name found nowhere is left out. */
export async function fetchWebIcons(look: Look, names: Iterable<string>, get: Fetch = webFetch): Promise<WebIcons> {
  // an icon the look drew itself with path data stays its own; a built-in one may be replaced by a file of the same name
  const want = [...new Set(names)].filter((n) => /^[a-z0-9-]{1,80}$/.test(n) && !look.images.has(n) && !(look.icons.has(n) && !isBuiltIn(look, n)));
  const uris: Record<string, string> = {};
  const unreachable = new Set<string>();
  await Promise.all(want.slice(0, MAX_WEB_ICONS).map(async (name) => {
    for (const url of iconAddresses(look, name)) {
      try {
        const bytes = await cached(get, url, MAX_ICON_BYTES);
        const uri = bytes && svgDataUri(bytes);
        if (uri) { uris[name] = uri; return; }
      } catch { unreachable.add(hostOf(url)); return; }
    }
  }));
  return { uris, done: unreachable.size === 0, unreachable: [...unreachable] };
}
/** One face of a font the look names by address. */
export type WebFace = { family: string; weight: number; style: 'normal' | 'italic'; url: string };

const WEIGHTS = [400, 500, 600, 700];
/**
 * The faces of every font the look names by address. An address with {weight} gives 400 to 700, one with {style}
 * an italic too; an address with neither is one file drawn at every weight. Family names are plain words only,
 * as they are written into CSS.
 */
export function webFaces(look: Look): WebFace[] {
  const out: WebFace[] = [];
  for (const [family, tpl] of look.fontUrls) {
    if (!/^[\w .-]{1,64}$/.test(family)) continue;
    const fill = (w: number, s: string) => tpl.replaceAll('{weight}', String(w)).replaceAll('{style}', s);
    // the browser loads these itself (@font-face, FontFace), so each address, as filled in, gets the check webFetch makes
    const add = (weight: number, style: 'normal' | 'italic') => { const url = fill(weight || 400, style); if (isPublicWebUrl(url)) out.push({ family, weight, style, url }); };
    if (!tpl.includes('{weight}')) { add(0, 'normal'); continue; }
    for (const w of WEIGHTS) add(w, 'normal');
    if (tpl.includes('{style}')) add(400, 'italic');
  }
  return out;
}

const faceFormat = (url: string) => (/\.woff2(\?|$)/i.test(url) ? 'woff2' : /\.woff(\?|$)/i.test(url) ? 'woff' : /\.otf(\?|$)/i.test(url) ? 'opentype' : 'truetype');
/** An @font-face rule for a face, loading from `src` (its address, or a data URL). Weight 0 is every weight. */
export function faceRule(f: WebFace, src = f.url): string {
  return `@font-face{font-family:'${f.family}';font-weight:${f.weight || '100 900'};font-style:${f.style};src:url("${src}") format('${faceFormat(f.url)}');}`;
}

/** The weights an SVG draws text at (400 when none is given). */
export function weightsDrawn(svg: string): Set<number> {
  const out = new Set([400]);
  for (const [, w] of svg.matchAll(/font-weight="(\d+)"/g)) out.add(Number(w));
  return out;
}

/** The faces an SVG needs, fetched and inlined as data URLs so an exported file stands alone. Faces that cannot be fetched are left out. */
export async function inlineWebFaces(look: Look, families: Set<string>, svg: string, get: Fetch = webFetch): Promise<string> {
  const weights = weightsDrawn(svg), italic = /font-style="italic"/.test(svg);
  const faces = webFaces(look).filter((f) => families.has(f.family) && (f.weight === 0 || weights.has(f.weight)) && (f.style === 'normal' || italic));
  const rules = await Promise.all(faces.map(async (f) => {
    try {
      const bytes = await cached(get, f.url, MAX_FONT_BYTES);
      if (!bytes) return '';
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const mime = faceFormat(f.url) === 'woff2' ? 'font/woff2' : faceFormat(f.url) === 'woff' ? 'font/woff' : 'font/ttf';
      return faceRule(f, `data:${mime};base64,${btoa(bin)}`);
    } catch { return ''; }
  }));
  return rules.join('');
}
