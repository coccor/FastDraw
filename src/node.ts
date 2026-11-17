// File-system loaders for the command-line tool. The rest of the core is browser-safe.
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { fontMeta, withoutLigatures } from './fontmeta.ts';
import { dirname, resolve, join, basename } from 'node:path';
import { parseLook, emptyLook, isBundledLook, bundledLook, defaultLook, BUNDLED_LOOK_NAMES } from './look.ts';
import type { Look } from './look.ts';
import { buildScene, lookPath } from './scene.ts';
import { withIconImages, usedIconImages, MAX_ICON_BYTES, MAX_ICON_FILES } from './iconfiles.ts';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import type { Scene } from './scene.ts';

// A look is untrusted input, and what its folders hold ends up inside exported images. So a folder a look
// names (fontdir, icondir) must be a real folder inside the look's own folder, and only real files directly
// in it are read: no absolute paths, no climbing out with "..", no symbolic links.
function lookFolder(lookFile: string, d: string): string | null {
  if (isAbsolute(d)) return null;
  try {
    const home = realpathSync(dirname(lookFile)), dir = realpathSync(resolve(home, d));
    const rel = relative(home, dir);
    return rel.startsWith('..') || isAbsolute(rel) || !lstatSync(dir).isDirectory() ? null : dir;
  } catch { return null; }
}
function plainFiles(dir: string, ext: RegExp, maxBytes: number, maxFiles: number): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir).filter((n) => ext.test(n)).sort()) {
    if (out.length >= maxFiles) break;
    const full = dir + sep + f;
    try { const st = lstatSync(full); if (st.isFile() && !st.isSymbolicLink() && st.size <= maxBytes) out.push(full); } catch { /* unreadable: skipped */ }
  }
  return out;
}

// The SVG files in the look's icon folders. Only *.svg files directly inside a folder are read.
function iconFiles(lookFile: string, look: Look): { name: string; bytes: Uint8Array }[] {
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const d of look.iconDirs) {
    const dir = lookFolder(lookFile, d);
    if (!dir) { look.issues.push({ line: 0, level: 'warn', msg: `icon folder not used: ${d} (icondir must be a folder inside the folder that holds the look file)` }); continue; }
    for (const full of plainFiles(dir, /\.svg$/i, MAX_ICON_BYTES, MAX_ICON_FILES - out.length)) out.push({ name: full.slice(dir.length + 1), bytes: new Uint8Array(readFileSync(full)) });
  }
  return out;
}
const withIcons = (lookFile: string, look: Look): Look => (look.iconDirs.length ? withIconImages(look, iconFiles(lookFile, look), {}, true) : look);

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

// The given font files as copies that have their ligatures turned off, so the PNG shows `--`, `->` and `>=`
// as typed, as the SVG does with font-variant-ligatures: none. resvg only takes font paths, so the copies go
// to a private temporary folder. Each file is patched once per process and the copy reused for every image
// drawn after it; the folder is removed when the process exits. A file with nothing to turn off is used as is.
const patched = new Map<string, string>();
let patchDir: string | undefined;
export function withoutLigatureFonts(files: string[]): string[] {
  return files.map((f) => {
    const key = resolve(f);
    let out = patched.get(key);
    if (out === undefined) {
      const copy = withoutLigatures(new Uint8Array(readFileSync(f)));
      out = f;
      if (copy) {
        if (!patchDir) {
          const dir = mkdtempSync(join(tmpdir(), 'fastdraw-fonts-'));
          patchDir = dir;
          process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
          // Ctrl-C and kill end the process without 'exit'; turn them into an exit so the folder still goes
          for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => process.exit(sig === 'SIGINT' ? 130 : 143));
        }
        out = join(patchDir, `${patched.size}-${basename(f)}`);
        writeFileSync(out, copy);
      }
      patched.set(key, out);
    }
    return out;
  });
}

// The font files a look brings with its `fontdir` lines, and a note for every family the look
// names that neither those folders nor the bundled fonts provide.
export function lookFonts(lookFile: string | undefined, look: Look): { files: string[]; missing: string[] } {
  const files = lookFile ? look.fontDirs.flatMap((d) => { const dir = lookFolder(lookFile, d); return dir ? plainFiles(dir, /\.(ttf|otf)$/i, 20_000_000, 200) : []; }) : [];
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

// srcIn: the diagram's text when it is not the file's as it is on disk (drawn with another look)
export function loadScene(file: string, srcIn?: string): Scene {
  let src = srcIn ?? '';
  try { if (srcIn === undefined) src = readFileSync(file, 'utf8'); }
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
export function readSources(file: string, sc?: Scene, src?: string): { diagram: string; look: string | null; icons?: Record<string, string> } {
  const diagram = src ?? readFileSync(file, 'utf8');
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

// A look named on the command line, in a diagram or in a look's `dark` line: one that ships with
// FastDraw by its name, or a .look file by its full path. No look at all is the built-in one.
export type LookRef = { name: string } | { file: string };

// --look <name|path>: a bundled look's name, or a path to a .look file from the current folder.
export function lookArg(v: string): LookRef | string {
  if (isBundledLook(v)) return { name: v };
  if (!/\.look$/i.test(v)) return `no look named ${v}; named looks: ${BUNDLED_LOOK_NAMES.join(', ')}, or give a path to a .look file`;
  return existsSync(v) ? { file: resolve(v) } : `look file not found: ${v}`;
}

// The look a diagram's text names, with a path read from the diagram's folder. undefined: the built-in look.
export function lookOfDiagram(file: string, src: string): LookRef | undefined {
  const p = lookPath(src);
  if (p === undefined) return undefined;
  return isBundledLook(p) ? { name: p } : { file: resolve(dirname(file), p) };
}

// How a diagram at `file` names the look: a bare name, or a path from the diagram's folder.
export function lookRefText(ref: LookRef, file: string): string {
  if ('name' in ref) return ref.name;
  const rel = relative(dirname(resolve(file)), ref.file).split(sep).join('/');
  return rel.startsWith('.') || isAbsolute(rel) ? rel : './' + rel;
}

// The look that draws the dark image for a look: what its `dark` line names (relative to the look's
// own file). The built-in look's is Night. A string is the reason there is none.
export function darkLookOf(ref: LookRef | undefined): LookRef | string {
  const how = 'add a line to the look naming its dark version, like  dark night  or  dark "./team-night.look"';
  let look = defaultLook(), name = 'the built-in look', from: string | undefined;
  if (ref && 'name' in ref) { look = bundledLook(ref.name)!; name = `the ${ref.name} look`; }
  else if (ref) {
    if (!/\.look$/i.test(ref.file)) return `the look path must end in .look; ${ref.file} was not read`;
    if (!existsSync(ref.file)) return `look file not found: ${ref.file}`;
    look = parseLook(readFileSync(ref.file, 'utf8'), ref.file); name = basename(ref.file); from = ref.file;
  }
  const d = look.dark;
  if (!d) return ref && 'name' in ref
    ? `${name} has no dark version; draw the dark image with --look and a dark look instead`
    : `${name} has no dark version: ${how}`;
  if (isBundledLook(d)) return { name: d };
  if (!from) return `${name} names a dark look by path (${d}), which only a look file can do`;
  const file = resolve(dirname(from), d);
  return existsSync(file) ? { file } : `the dark look of ${name} was not found: ${d}`;
}
