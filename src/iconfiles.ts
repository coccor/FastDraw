// Icons a team keeps as SVG files in a folder next to its look (`icondir "./icons"`): colour icons,
// vendor sets and so on. A file is never parsed or inlined: it is drawn as an image from a data URI,
// which browsers and the PNG renderer load with scripts and outside requests switched off. That is what
// makes it safe to show an icon file that came from somewhere else.
import type { Look } from './look.ts';
import { standInIcon } from './icons.ts';
import { extendedIconsLoaded } from './extendedIcons.ts';

export const MAX_ICON_BYTES = 300_000;
export const MAX_ICON_FILES = 3000;
const URI = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/;
export const isIconUri = (v: unknown): v is string => typeof v === 'string' && v.length < MAX_ICON_BYTES * 1.4 && URI.test(v);

// "10021-icon-service-Virtual-Machine.svg" -> "virtual-machine"; "Load Balancer.svg" -> "load-balancer"
export function iconName(file: string): string {
  return file.replace(/\.svg$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^\d+-icon-service-/, '').replace(/^-+|-+$/g, '');
}

export function svgDataUri(bytes: Uint8Array): string | null {
  if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) return null;
  const head = new TextDecoder().decode(bytes.subarray(0, 2000));
  if (!/<svg[\s>]/i.test(head)) return null;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:image/svg+xml;base64,' + btoa(bin);
}

// A copy of the look with icon images added. `files` are SVG files by file name; `uris` are name -> data URI
// pairs (from an exported image). Names already taken by the look's own outline icons are left alone only if
// the look defined them itself; a file otherwise replaces a bundled icon of the same name. `folderRead` says
// the look's icon folders were read (even if empty), so an icon missing from them is a mistake, not one left behind.
export function withIconImages(look: Look, files: { name: string; bytes: Uint8Array }[], uris: Record<string, unknown> = {}, folderRead = files.length > 0): Look {
  const images = new Map(look.images);
  for (const [k, v] of Object.entries(uris)) if (images.size < MAX_ICON_FILES && /^[a-z0-9-]{1,80}$/.test(k) && isIconUri(v)) images.set(k, v);
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const name = iconName(f.name), uri = name && name.length <= 80 ? svgDataUri(f.bytes) : null;
    if (uri && images.size < MAX_ICON_FILES && !images.has(name)) images.set(name, uri);
  }
  return { ...look, images, iconFolderRead: look.iconFolderRead || folderRead };
}

// The icon images a scene actually uses, for carrying inside an exported image.
export function usedIconImages(look: Look, names: Iterable<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) { const u = look.images.get(n); if (u) out[n] = u; }
  return out;
}

// The built-in icon drawn for `name` when it is an icon file that did not come along: the look has icon
// folders that were not read here (a shared link without that icon, a page that cannot reach the folder).
// Null when the icon is there, or when its absence is a real mistake. Until the rest of the built-in icons
// have loaded the name may still be one of them, so there is no stand-in yet.
export function iconStandIn(look: Look, name: string): string | null {
  if (!name || name === 'none' || look.images.has(name) || look.icons.has(name)) return null;
  return look.iconDirs.length && !look.iconFolderRead && extendedIconsLoaded() ? standInIcon(name) : null;
}
