// File-system loaders for the command-line tool. The rest of the core is browser-safe.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fontMeta } from './fontmeta.ts';
import { dirname, resolve } from 'node:path';
import { parseLook, emptyLook } from './look.ts';
import type { Look } from './look.ts';
import { buildScene, lookPath } from './scene.ts';
import { withIconImages, usedIconImages, MAX_ICON_BYTES, MAX_ICON_FILES } from './iconfiles.ts';
import { statSync } from 'node:fs';
import type { Scene } from './scene.ts';

// The SVG files in the look's icon folders. Only *.svg files directly inside a folder are read.
function iconFiles(lookFile: string, look: Look): { name: string; bytes: Uint8Array }[] {
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const d of look.iconDirs) {
    const dir = resolve(dirname(lookFile), d);
    if (!existsSync(dir)) { look.issues.push({ line: 0, level: 'warn', msg: `icon folder not found: ${d} (icondir is relative to the look file)` }); continue; }
    for (const f of readdirSync(dir).filter((n) => /\.svg$/i.test(n)).sort()) {
      if (out.length >= MAX_ICON_FILES) break;
      const full = resolve(dir, f);
      try { if (statSync(full).isFile() && statSync(full).size <= MAX_ICON_BYTES) out.push({ name: f, bytes: new Uint8Array(readFileSync(full)) }); } catch { /* unreadable: skipped */ }
    }
  }
  return out;
}
const withIcons = (lookFile: string, look: Look): Look => (look.iconDirs.length ? withIconImages(look, iconFiles(lookFile, look)) : look);

export function loadLook(path: string): Look {
  try { return withIcons(path, parseLook(readFileSync(path, 'utf8'), path)); }
  catch {
    const look = emptyLook();
    look.issues.push({ line: 0, level: 'error', msg: `look file not found: ${path}` });
    return look;
  }
}

const isFont = (f: string) => /\.(ttf|otf)$/i.test(f);
const listFonts = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter(isFont).map((f) => resolve(dir, f)) : []);
export const bundledFontDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
export const bundledFonts = () => listFonts(bundledFontDir);

// The font files a look brings with its `fontdir` lines, and a note for every family the look
// names that neither those folders nor the bundled fonts provide.
export function lookFonts(lookFile: string | undefined, look: Look): { files: string[]; missing: string[] } {
  const files = lookFile ? look.fontDirs.flatMap((d) => listFonts(resolve(dirname(lookFile), d))) : [];
  const have = new Set<string>();
  for (const f of [...bundledFonts(), ...files]) { const m = fontMeta(new Uint8Array(readFileSync(f))); if (m) have.add(m.family.toLowerCase()); }
  const generic = new Set(['sans-serif', 'serif', 'monospace', 'helvetica', 'system-ui']);
  const missing = [...new Set(look.fonts.values())].filter((fam) => !have.has(fam.toLowerCase()) && !generic.has(fam.toLowerCase()));
  return { files, missing };
}

// A diagram file is untrusted input, and its look path is read from disk and embedded in exports.
// Only files named *.look are ever read, so a diagram cannot pull in some other file.
function readLook(file: string, p: string | undefined): { text: string | null; refused: boolean } {
  if (!p) return { text: null, refused: false };
  if (!p.toLowerCase().endsWith('.look')) return { text: null, refused: true };
  try { return { text: readFileSync(resolve(dirname(file), p), 'utf8'), refused: false }; }
  catch { return { text: null, refused: false }; }
}

export function loadScene(file: string): Scene {
  let src = '';
  try { src = readFileSync(file, 'utf8'); }
  catch {
    const sc = buildScene('', null, file);
    sc.issues.unshift({ line: 0, level: 'error', msg: `cannot read ${file}` });
    return sc;
  }
  const p = lookPath(src);
  const r = readLook(file, p);
  const sc = buildScene(src, r.text === null ? null : withIcons(resolve(dirname(file), p!), parseLook(r.text, p)), file);
  const fonts = lookFonts(r.text === null ? undefined : resolve(dirname(file), p!), sc.look);
  sc.fontFiles = fonts.files;
  for (const fam of fonts.missing) {
    sc.issues.push({ line: 1, level: 'warn', msg: `the look names the font "${fam}", but no TTF or OTF file for it was found, so text will be drawn in a fallback font; put its files in a folder next to the look and add  fontdir "./fonts"  to the look` });
  }
  if (r.refused) for (const i of sc.issues) if (i.msg.startsWith('look file not found')) i.msg = `the look path must end in .look; "${p}" was not read`;
  return sc;
}

// The diagram and look texts as they are on disk, for embedding in exports. A look that does
// not parse cleanly is left out.
export function readSources(file: string, sc?: Scene): { diagram: string; look: string | null; icons?: Record<string, string> } {
  const diagram = readFileSync(file, 'utf8');
  const p = lookPath(diagram);
  const { text } = readLook(file, p);
  const clean = text !== null && parseLook(text, p).issues.every((i) => i.level !== 'error');
  const icons = sc ? usedIconImages(sc.look, sc.shapes.map((s) => s.p.icon).filter(Boolean)) : {};
  return { diagram, look: clean ? text : null, ...(Object.keys(icons).length ? { icons } : {}) };
}

// The look file a diagram points to, if it names one that may be read.
export function lookFileOf(diagramFile: string): string | undefined {
  try {
    const p = lookPath(readFileSync(diagramFile, 'utf8'));
    return p && p.toLowerCase().endsWith('.look') ? resolve(dirname(diagramFile), p) : undefined;
  } catch { return undefined; }
}
