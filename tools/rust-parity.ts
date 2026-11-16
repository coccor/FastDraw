// Writes the TypeScript renderer's answers to target/parity/, for crates/fastdraw-render/tests/parity.rs to compare
// the Rust port against (spec §8.1). Run with `npm run rust:parity`; outputs are not committed (target/ is ignored).
//
//   manifest.json        [{ id, file, input, dark, noFile, lookPath }] — one entry per case. `file` is repo-relative
//                        with '/' separators; `input` the text passed to render (already through withLook for the
//                        look variants); `lookPath` is lookPath(input) or null. id: `<file>@<look|own|builtin>[-dark][-nofile]`.
//   looks/index.json     [{ name, file, path }] — every look below: `file` its source (repo-relative) or null for a
//                        bundled or the default look, `path` the path argument parseLook was given.
//   looks/<name>.json    every Look field in the Look's own key order, Maps as arrays of pairs, except styles (the
//                        Style objects), icons and images (names only); `dark` is null when the look has none.
//                        Names: each bundled look by its name, `default`, and every .look file by caseKey(file).
//   scenes/<key>.json    { x, y, w, h, issues, shapes: [{id, shape, x, y, w, h}], texts: [{id, x, y, w, h}],
//                        conns: [{pts, label: {x, y, w, h} | null}] } of the scene drawn (issues: every level).
//   drawings/<key>.json  { svg, issues: [{line, level, msg}] (hints dropped), paper, bounds, fontFiles (repo-relative),
//                        look: {path, text} | null } — what `render` returns.
//   colors.json          [{ look, v, over, out }]: `color(look, v, over)` for the default look and night, sketch, engraved.
//   share.json           [{ name, text, look, decoded }]: share-link fixtures and decodeShared(encodeShared(…)).
//
// <key> is the case id with every '/' replaced by '~' (caseKey). Paths inside issue messages are left absolute; the
// Rust test makes both sides repo-relative (`<root>`, '/' separators) before comparing.
//
// The reference composition is spec §4.1, as FastDraw's command-line tool and the embed do it:
//   light   loadScene(abs, input); noFile: buildScene(input, null, '')
//   dark    darkCounterpart(lookPath(input), own) with own the default look (no look line), the bundled look, the
//           parsed look file (read relative to the diagram) or null. A bundled name draws withLook(input, name); a
//           path is relative to the look file's folder and draws withLook(input, rel) (rel from the diagram, as
//           lookRefText writes it) when that file can be read; otherwise, and always for noFile, it draws as light.
// A look file over 1 MB counts as unreadable (spec §4.1's addition to the TypeScript).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep, basename } from 'node:path';
import { loadExtendedIcons } from '../src/extendedIcons.ts';
import { parseStatements } from '../src/parse.ts';
import { buildScene, lookPath, withLook, type Scene } from '../src/scene.ts';
import { loadScene, loadLook, lookFonts, lookRefText } from '../src/node.ts';
import { parseLook, color, isBundledLook, bundledLook, defaultLook, BUNDLED_LOOK_NAMES, type Look, type Issue } from '../src/look.ts';
import { renderSvg } from '../src/render.ts';
import { darkCounterpart } from '../editor/src/embed/theme.ts';
import { encodeShared, decodeShared, type Shared } from '../editor/src/embed/share.ts';

const started = performance.now();
const root = resolve(import.meta.dirname, '..');
const out = join(root, 'target', 'parity');
const CASE_DIRS = ['examples', 'assets', 'crates/fastdraw-render/tests/coverage'];
const MAX_LOOK_BYTES = 1_000_000; // spec §4.1: a look file over 1 MB is treated as unreadable

// as the command-line tool does before drawing anything (spec §4.2)
await loadExtendedIcons();

const repoRel = (abs: string) => relative(root, abs).split(sep).join('/');
const caseKey = (id: string) => id.replaceAll('/', '~');
const write = (path: string, data: unknown) => writeFileSync(join(out, path), JSON.stringify(data));

// Every file under the case folders with the extension, repo-relative, sorted. A missing folder has none.
function filesUnder(ext: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(ext)) found.push(repoRel(full));
    }
  };
  for (const d of CASE_DIRS) if (existsSync(join(root, d))) walk(join(root, d));
  return found.sort();
}

const isLookStmt = (s: { toks: { t: string; v: string }[] }) => s.toks[0]?.t === 'word' && s.toks[0].v === 'look';

// The diagram in the built-in look: its look statements blanked line by line, as withLook rewrites them (so every
// other line keeps its number, and CRLF becomes LF as withLook makes it), with no look line added. A diagram with no
// look statement is left exactly as written.
function withoutLook(src: string): string {
  const sts = parseStatements(src).filter(isLookStmt);
  if (!sts.length) return src;
  const lines = src.split(/\r?\n/);
  for (const s of sts) for (let l = s.line; l <= s.end; l++) lines[l - 1] = '';
  return lines.join('\n');
}

// readLook (node.ts) plus the 1 MB limit: the text of the look file `p` names, read from the diagram's folder.
function readLookText(file: string, p: string | undefined): string | null {
  if (!p || !p.toLowerCase().endsWith('.look')) return null;
  const full = resolve(dirname(file), p);
  try { return statSync(full).size > MAX_LOOK_BYTES ? null : readFileSync(full, 'utf8'); }
  catch { return null; }
}
const tooBig = (full: string) => { try { return statSync(full).size > MAX_LOOK_BYTES; } catch { return false; } };

// Light: loadScene, or buildScene with no file.
function lightScene(file: string, input: string, noFile: boolean): Scene {
  if (noFile) return buildScene(input, null, '');
  const p = lookPath(input);
  if (p && p.toLowerCase().endsWith('.look') && tooBig(resolve(dirname(file), p))) {
    // No example has a look this big. loadScene would read it; the contract treats it as missing, which is
    // loadScene's path for a look file it cannot read: buildScene says "look file not found", then the fonts.
    const sc = buildScene(input, null, file);
    const fonts = lookFonts(undefined, sc.look);
    sc.fontFiles = fonts.files;
    for (const fam of fonts.missing) sc.issues.push({ line: 1, level: 'warn', msg: `the look names the font "${fam}", but no TTF or OTF file for it was found, so text will be drawn in a fallback font; put its files in a folder next to the look and add  fontdir "./fonts"  to the look` });
    return sc;
  }
  return loadScene(file, input);
}

// The scene `render` draws (spec §4.1).
function drawnScene(file: string, input: string, dark: boolean, noFile: boolean): Scene {
  if (!dark) return lightScene(file, input, noFile);
  const ref = lookPath(input);
  const own: Look | null = !ref ? defaultLook() : isBundledLook(ref) ? bundledLook(ref) : noFile ? null : (() => {
    const text = readLookText(file, ref);
    return text === null ? null : parseLook(text);
  })();
  const d = darkCounterpart(ref, own);
  if (d && isBundledLook(d)) return lightScene(file, withLook(input, d), noFile);
  if (d && !noFile) {
    // relative to the look file's folder; with no look file of its own (cannot happen with a bundled or the built-in
    // look, whose dark lines are names) the embed resolves it against the diagram, so this does too
    const base = ref && !isBundledLook(ref) ? dirname(resolve(dirname(file), ref)) : dirname(file);
    const darkFile = resolve(base, d);
    const rel = lookRefText({ file: darkFile }, file);
    // only a .look file can be read by loadScene, so any other dark path cannot be read: drawn as light
    if (readLookText(file, rel) !== null) return lightScene(file, withLook(input, rel), false);
  }
  return lightScene(file, input, noFile);
}

const issueOut = (i: Issue) => ({ line: i.line, level: i.level, msg: i.msg });
const box = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x, y: b.y, w: b.w, h: b.h });

function sceneOut(sc: Scene) {
  return {
    x: sc.x, y: sc.y, w: sc.w, h: sc.h,
    issues: sc.issues.map(issueOut),
    shapes: sc.shapes.map((s) => ({ id: s.id, shape: s.shape, ...box(s) })),
    texts: sc.texts.map((t) => ({ id: t.id, ...box(t) })),
    conns: sc.conns.map((c) => ({ pts: c.pts.map((p) => ({ x: p.x, y: p.y })), label: c.label ? box(c.label) : null })),
  };
}

function lookOut(look: Look) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(look)) {
    if (k === 'styles') o[k] = [...(v as Look['styles']).values()].map((s) => ({ name: s.name, kind: s.kind, props: s.props }));
    else if (k === 'icons' || k === 'images') o[k] = [...(v as Map<string, unknown>).keys()];
    else if (v instanceof Map) o[k] = [...v];
    else o[k] = v;
  }
  o.dark ??= null;
  return o;
}

rmSync(out, { recursive: true, force: true });
for (const d of ['looks', 'scenes', 'drawings']) mkdirSync(join(out, d), { recursive: true });

// looks
const lookIndex: { name: string; file: string | null; path: string }[] = [];
const putLook = (name: string, file: string | null, path: string, look: Look) => { lookIndex.push({ name, file, path }); write(`looks/${name}.json`, lookOut(look)); };
putLook('default', null, 'default look', defaultLook());
for (const name of BUNDLED_LOOK_NAMES) putLook(name, null, `${name} look`, bundledLook(name)!);
for (const f of filesUnder('.look')) { const abs = join(root, f); putLook(caseKey(f), f, abs, loadLook(abs)); }
write('looks/index.json', lookIndex);

// cases
type Case = { id: string; file: string; input: string; dark: boolean; noFile: boolean; lookPath: string | null };
const manifest: Case[] = [];
const share: { name: string; text: string; look: Shared['look'] | null; decoded: Shared | null }[] = [];
for (const file of filesUnder('.fdraw')) {
  const abs = join(root, file);
  const text = readFileSync(abs, 'utf8');
  const variants: [string, string][] = [['own', text], ...BUNDLED_LOOK_NAMES.map((n): [string, string] => [n, withLook(text, n)]), ['builtin', withoutLook(text)]];
  const cases: Case[] = [];
  for (const [look, input] of variants) for (const dark of [false, true]) cases.push({ id: `${file}@${look}${dark ? '-dark' : ''}`, file, input, dark, noFile: false, lookPath: lookPath(input) ?? null });
  cases.push({ id: `${file}@own-nofile`, file, input: text, dark: false, noFile: true, lookPath: lookPath(text) ?? null });
  for (const c of cases) {
    const sc = drawnScene(abs, c.input, c.dark, c.noFile);
    // the diagram's own look file as read: the light text's, never the dark one
    const p = lookPath(c.input);
    const lookText = c.noFile ? null : readLookText(abs, p);
    write(`scenes/${caseKey(c.id)}.json`, sceneOut(sc));
    write(`drawings/${caseKey(c.id)}.json`, {
      svg: renderSvg(sc),
      issues: sc.issues.filter((i) => i.level !== 'hint').map(issueOut),
      paper: color(sc.look, sc.look.canvas.paper ?? 'paper'),
      bounds: [sc.x, sc.y, sc.w, sc.h],
      fontFiles: (sc.fontFiles ?? []).map(repoRel),
      look: lookText === null ? null : { path: p!, text: lookText },
    });
    manifest.push(c);
  }
  const lookText = readLookText(abs, lookPath(text));
  const d: Shared = lookText === null ? { name: basename(file), text } : { name: basename(file), text, look: { path: lookPath(text)!, text: lookText } };
  share.push({ name: d.name, text: d.text, look: d.look ?? null, decoded: await decodeShared(await encodeShared(d)) });
}
// share fixtures beyond the examples: escapes JSON.stringify writes, and text outside ASCII
for (const d of [
  { name: 'escapes.fdraw', text: 'a: node "q\\"uote" \\\\ \t tab\r\n\b\f\u0001\u001f end' },
  { name: 'unicode.fdraw', text: 'a: node "Grüße — 日本語 😀    "' },
  { name: '', text: '' },
  { name: 'with-look.fdraw', text: 'look "./t.look"\na: node', look: { path: './t.look', text: 'color ink #000\n// “quoted” é' } },
] as Shared[]) share.push({ name: d.name, text: d.text, look: d.look ?? null, decoded: await decodeShared(await encodeShared(d)) });

// colours: color(look, v, over) for a fixed list of inputs, in the default look and three bundled ones
const COLOR_LOOKS: [string, Look][] = [['default', defaultLook()], ...['night', 'sketch', 'engraved'].map((n): [string, Look] => [n, bundledLook(n)!])];
const COLOR_INPUTS: (string | undefined)[] = [
  undefined, '', 'none', 'transparent', 'ink', 'muted', 'paper', 'card', 'accent', 'ink/0.2', 'muted/0.5', 'paper/0.3', 'card/1', 'accent/0.25',
  '#fff', '#abc', '#aabbcc', '#AABBCC', '#12345678', '#abc/0.5', '#336699/0.1', '#336699/0.85', '#ff0000/.5', 'red', 'nosuchcolor', 'nosuchcolor/0.5',
  'rgb(1,2,3)', 'rgb(1,2,3)/0.5', 'rgba(1,2,3,0.5)', 'ink/', 'ink/abc', 'ink/0.5/0.5', 'ink/2', 'ink/0', 'none/0.5', '#zzz', '#zzz/0.5', 'hsl(10,20%,30%)', ' ink', 'Ink',
];
const COLOR_OVERS: (string | undefined)[] = [undefined, 'paper', 'card', '#ffeedd', 'ink', 'card/0.5', 'none', 'nosuchcolor'];
const colors: { look: string; v: string | null; over: string | null; out: string }[] = [];
for (const [name, look] of COLOR_LOOKS) for (const v of COLOR_INPUTS) for (const over of COLOR_OVERS) colors.push({ look: name, v: v ?? null, over: over ?? null, out: color(look, v, over) });
write('colors.json', colors);

write('manifest.json', manifest);
write('share.json', share);
console.log(`${manifest.length} cases, ${lookIndex.length} looks, ${share.length} share fixtures in ${((performance.now() - started) / 1000).toFixed(1)} s -> ${repoRel(out)}`);
