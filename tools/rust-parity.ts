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
//   gen/                 cases this script writes rather than commits (a look file over 1 MB); in the manifest like any.
//
// Cases: every .fdraw under examples/, assets/, crates/fastdraw-render/tests/coverage/ and gen/.
//   --coverage      also list what the TypeScript reads that no case uses (coverageReport); fails if any is not
//                   explained in tests/coverage/UNCOVERED.md
//   --check-links   only decode target/parity/rust-links.json (written by cargo test --test parity) and compare
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
import { buildScene, lookPath, withLook, CANVAS_KEYS, MARKERS, SERIES, type Scene } from '../src/scene.ts';
import { loadScene, loadLook, lookFonts, lookRefText } from '../src/node.ts';
import { parseLook, emptyLook, color, isBundledLook, bundledLook, defaultLook, BUNDLED_LOOK_NAMES, type Look, type Issue } from '../src/look.ts';
import { renderSvg } from '../src/render.ts';
import { DEFAULT_LOOK } from '../src/defaultLook.ts';
import { BUNDLED_LOOKS } from '../src/bundledLooks.ts';
import { darkCounterpart } from '../editor/src/embed/theme.ts';
import { encodeShared, decodeShared, editorLink, sharedInHash, type Shared } from '../editor/src/embed/share.ts';

const started = performance.now();
const root = resolve(import.meta.dirname, '..');
const out = join(root, 'target', 'parity');
const CASE_DIRS = ['examples', 'assets', 'crates/fastdraw-render/tests/coverage'];
// Cases made by this script, too big to commit: a diagram whose look file is over 1 MB (written by bigLookCase).
const GEN_DIR = 'target/parity/gen';
const MAX_LOOK_BYTES = 1_000_000; // spec §4.1: a look file over 1 MB is treated as unreadable

// `--check-links`: decode every link the Rust test wrote to target/parity/rust-links.json with decodeShared and
// compare with the inputs (as decodeShared normalises them: an empty name is 'diagram.fdraw', a name is cut at 200).
if (process.argv.includes('--check-links')) {
  const file = join(out, 'rust-links.json');
  if (!existsSync(file)) { console.error(`${file} is missing: run npm run rust:parity, then cargo test --test parity`); process.exit(1); }
  const rows = JSON.parse(readFileSync(file, 'utf8')) as { name: string; text: string; look: Shared['look'] | null; link: string }[];
  if (!rows.length) { console.error(`${file} has no links: run npm run rust:parity, then cargo test --test parity`); process.exit(1); }
  // the rows must be exactly the share fixtures plus every diagram input of the manifest (with its look file as read),
  // so this check does not depend on what the Rust test chose to write
  const key = (name: string, text: string, look: Shared['look'] | null) => JSON.stringify([name, text, look ? [look.path, look.text] : null]);
  const want = new Set<string>();
  for (const s of JSON.parse(readFileSync(join(out, 'share.json'), 'utf8')) as { name: string; text: string; look: Shared['look'] | null }[]) want.add(key(s.name, s.text, s.look));
  for (const c of JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) as { file: string; input: string; noFile: boolean }[]) {
    const p = lookPath(c.input), text = c.noFile ? null : readLookText(join(root, c.file), p);
    want.add(key(basename(c.file), c.input, text === null ? null : { path: p!, text }));
  }
  const got = new Set(rows.map((r) => key(r.name, r.text, r.look)));
  const missing = [...want].filter((k) => !got.has(k)), extra = [...got].filter((k) => !want.has(k));
  if (missing.length || extra.length || got.size !== rows.length) {
    console.error(`the links are not one per input: ${missing.length} inputs have none, ${extra.length} links are for no input, ${rows.length - got.size} repeat one${missing.length ? `; the first missing: ${missing[0].slice(0, 200)}` : ''}${extra.length ? `; the first extra: ${extra[0].slice(0, 200)}` : ''}`);
    process.exit(1);
  }
  const fail = (i: number, why: string): never => { console.error(`link ${i} (${JSON.stringify(rows[i].name)}): ${why}`); process.exit(1); };
  for (const [i, r] of rows.entries()) {
    if (!r.link.startsWith('https://fastdraw.dev/edit/#fdraw=')) fail(i, `unexpected link start: ${r.link.slice(0, 60)}`);
    const data = sharedInHash(new URL(r.link).hash);
    if (data === null) fail(i, 'no fdraw= in the link');
    if (r.link !== (await editorLink('https://fastdraw.dev/edit/', { name: r.name, text: r.text, ...(r.look ? { look: r.look } : {}) })).replace(/#.*/, '#fdraw=' + data)) fail(i, 'href differs from editorLink');
    const got = await decodeShared(data!);
    const want: Shared = { name: r.name ? r.name.slice(0, 200) : 'diagram.fdraw', text: r.text, ...(r.look ? { look: r.look } : {}) };
    if (JSON.stringify(got) !== JSON.stringify(want)) fail(i, `decoded ${JSON.stringify(got)?.slice(0, 200)} but expected ${JSON.stringify(want).slice(0, 200)}`);
  }
  console.log(`links ok (${rows.length})`);
  process.exit(0);
}

// as the command-line tool does before drawing anything (spec §4.2)
await loadExtendedIcons();

const repoRel = (abs: string) => relative(root, abs).split(sep).join('/');
const caseKey = (id: string) => id.replaceAll('/', '~');
const write = (path: string, data: unknown) => writeFileSync(join(out, path), JSON.stringify(data));

// Every file under the case folders with the extension, repo-relative, sorted. A missing folder has none.
function filesUnder(ext: string, dirs = CASE_DIRS): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(ext)) found.push(repoRel(full));
    }
  };
  for (const d of dirs) if (existsSync(join(root, d))) walk(join(root, d));
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

// node.ts:loadScene's warning for a family the look names that no font file provides (checkBigLookBranch compares).
const missingFontMsg = (fam: string) => `the look names the font "${fam}", but no TTF or OTF file for it was found, so text will be drawn in a fallback font; put its files in a folder next to the look and add  fontdir "./fonts"  to the look`;

// Light: loadScene, or buildScene with no file.
function lightScene(file: string, input: string, noFile: boolean): Scene {
  if (noFile) return buildScene(input, null, '');
  const p = lookPath(input);
  if (p && p.toLowerCase().endsWith('.look') && tooBig(resolve(dirname(file), p))) {
    // Only the generated case (bigLookCase) has a look this big. loadScene would read it; the contract treats it as
    // missing, which is loadScene's path for a look file it cannot read: buildScene says "look file not found", then
    // the fonts. A copy of node.ts:loadScene (its font message word for word); checkBigLookBranch holds it to that.
    const sc = buildScene(input, null, file);
    const fonts = lookFonts(undefined, sc.look);
    sc.fontFiles = fonts.files;
    for (const fam of fonts.missing) sc.issues.push({ line: 1, level: 'warn', msg: missingFontMsg(fam) });
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

// The generated case: a diagram whose look file is just over 1 MB, so it is drawn as if the file could not be read.
// Not committed (1 MB of fixture); tests/parity.rs reads the same files through the manifest's paths.
function bigLookCase(): void {
  const dir = join(root, GEN_DIR, 'big-look');
  mkdirSync(dir, { recursive: true });
  const head = 'color ink #b4441b\nstyle node shape=rect fill=ink/0.1 size=120x48\n', pad = '// padding\n';
  writeFileSync(join(dir, 'big.look'), head + pad.repeat(Math.ceil((MAX_LOOK_BYTES + 1 - head.length) / pad.length)));
  writeFileSync(join(dir, 'big.fdraw'), 'look "./big.look"\na: node "too big a look" at 40,40\nb: rect "plain" at 240,40\na -> b\n');
}

// lightScene's over-1 MB branch copies node.ts:loadScene. Hold it to loadScene: for the generated case it must give
// what loadScene gives when the same look path cannot be read at all (the diagram moved to a folder with no look),
// and loadScene's warning for a missing font must still read as missingFontMsg.
function checkBigLookBranch(): void {
  const fail = (why: string): never => { console.error(`the over-1 MB branch no longer matches node.ts:loadScene: ${why}`); process.exit(1); };
  const big = join(root, GEN_DIR, 'big-look', 'big.fdraw'), input = readFileSync(big, 'utf8');
  const elsewhere = join(root, GEN_DIR, 'no-look');
  mkdirSync(elsewhere, { recursive: true });
  const a = lightScene(big, input, false), b = loadScene(join(elsewhere, 'big.fdraw'), input);
  const sig = (sc: Scene) => JSON.stringify([sceneOut(sc), sc.fontFiles ?? []]);
  if (sig(a) !== sig(b)) fail(`${sig(a).slice(0, 300)}\n  loadScene: ${sig(b).slice(0, 300)}`);
  writeFileSync(join(elsewhere, 'font.look'), 'font sans "No Such Family"\n');
  const msgs = loadScene(join(elsewhere, 'font.fdraw'), 'look "./font.look"\na: rect at 0,0\n').issues.map((i) => i.msg);
  if (!msgs.includes(missingFontMsg('No Such Family'))) fail(`loadScene's font warning is now ${JSON.stringify(msgs)}`);
  rmSync(elsewhere, { recursive: true, force: true });
}
bigLookCase();
checkBigLookBranch();

// what the cases use, for --coverage
const seen = { props: new Set<string>(), canvas: new Set<string>(), heads: new Set<string>(), shapes: new Set<string>(), markers: new Set<string>(), series: new Set<string>(), msgs: new Set<string>() };
const seeLook = (look: Look) => {
  for (const st of look.styles.values()) for (const k of Object.keys(st.props)) seen.props.add(k);
  for (const k of Object.keys(look.canvas)) seen.canvas.add(k);
  for (const i of look.issues) seen.msgs.add(i.msg);
};
const seeLookSource = (text: string) => {
  for (const st of parseStatements(text)) {
    const [head, ...rest] = st.toks;
    if (head.t !== 'word') continue;
    seen.heads.add(head.v);
    if (head.v === 'dark' && rest[0]) seen.heads.add(isBundledLook(rest[0].v) ? 'dark by name' : 'dark by path');
    if (head.v === 'style') for (const t of rest.slice(1)) if (t.t === 'word' && ['extends', 'line', 'text', 'shape'].includes(t.v)) seen.heads.add(`style ${t.v}`);
  }
};
const seeCase = (input: string, sc: Scene) => {
  for (const st of parseStatements(input)) {
    const canvas = st.toks[0]?.t === 'word' && st.toks[0].v === 'canvas';
    for (const t of st.toks) if (t.t === 'prop') (canvas ? seen.canvas : seen.props).add(t.k!);
  }
  for (const s of sc.shapes) {
    seen.shapes.add(s.shape);
    for (const e of s.legend ?? []) { const sh = (e.props ?? sc.look.styles.get(e.style)?.props)?.shape; if (sh) seen.shapes.add(sh); }
    if (s.shape === 'chart') for (const r of s.rows ?? []) if (r.id) seen.series.add(r.id);
  }
  for (const c of sc.conns) { seen.markers.add(c.head ? c.headM : 'none'); seen.markers.add(c.tail ? c.tailM : 'none'); }
  for (const i of sc.issues) { seen.msgs.add(i.msg); seen.msgs.add(i.msg.replace(/ \(in look, line \d+\)$/, '')); }
};
seeLookSource(DEFAULT_LOOK);
for (const text of Object.values(BUNDLED_LOOKS)) seeLookSource(text);

// looks
const lookIndex: { name: string; file: string | null; path: string }[] = [];
const putLook = (name: string, file: string | null, path: string, look: Look) => { lookIndex.push({ name, file, path }); write(`looks/${name}.json`, lookOut(look)); };
putLook('default', null, 'default look', defaultLook());
for (const name of BUNDLED_LOOK_NAMES) putLook(name, null, `${name} look`, bundledLook(name)!);
for (const f of filesUnder('.look')) { const abs = join(root, f); putLook(caseKey(f), f, abs, loadLook(abs)); seeLookSource(readFileSync(abs, 'utf8')); }
for (const name of ['default', ...BUNDLED_LOOK_NAMES]) seeLook(name === 'default' ? defaultLook() : bundledLook(name)!);
for (const f of filesUnder('.look')) seeLook(loadLook(join(root, f)));
write('looks/index.json', lookIndex);

// cases
type Case = { id: string; file: string; input: string; dark: boolean; noFile: boolean; lookPath: string | null };
const manifest: Case[] = [];
const share: { name: string; text: string; look: Shared['look'] | null; decoded: Shared | null }[] = [];
for (const file of [...filesUnder('.fdraw'), ...filesUnder('.fdraw', [GEN_DIR])]) {
  const abs = join(root, file);
  const text = readFileSync(abs, 'utf8');
  const variants: [string, string][] = [['own', text], ...BUNDLED_LOOK_NAMES.map((n): [string, string] => [n, withLook(text, n)]), ['builtin', withoutLook(text)]];
  const cases: Case[] = [];
  for (const [look, input] of variants) for (const dark of [false, true]) cases.push({ id: `${file}@${look}${dark ? '-dark' : ''}`, file, input, dark, noFile: false, lookPath: lookPath(input) ?? null });
  cases.push({ id: `${file}@own-nofile`, file, input: text, dark: false, noFile: true, lookPath: lookPath(text) ?? null });
  for (const c of cases) {
    const sc = drawnScene(abs, c.input, c.dark, c.noFile);
    seeCase(c.input, sc);
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
if (process.argv.includes('--coverage') && coverageReport()) process.exit(1);

// ---- --coverage: what the TypeScript reads that no case uses (spec §8.3) -----------------------------------------
// Lists (a) every property key scene.ts, render.ts and chart.ts read (and the canvas keys look.ts reads), (b) every look
// statement, (c) every shape kind, line marker and chart series, (d) every message buildScene, parseLook and loadScene
// can report; then prints the entries no case uses or triggers. An entry explained in tests/coverage/UNCOVERED.md
// (written there in backticks) is listed as such; any other makes the run fail.
function coverageReport(): number {
  const src = (f: string) => readFileSync(join(root, 'src', f), 'utf8');
  const [sceneSrc, renderSrc, chartSrc, lookSrc, nodeSrc] = ['scene.ts', 'render.ts', 'chart.ts', 'look.ts', 'node.ts'].map(src);
  const entries: { id: string; used: boolean }[] = [];
  const add = (id: string, used: boolean) => { if (!entries.some((e) => e.id === id)) entries.push({ id, used }); };

  // (a) property keys. Read as p.key, p['key'], x.p.key, props.key, sp.key, over.key, row.p[`fill.${…}`] (fill.N), as
  // textAttrs(look, p, 'prefix.') (prefix + size, spacing, font, color, weight, italic), and from literal key lists.
  const keys = new Set<string>(), canvasKeys = new Set<string>();
  const NOT_KEYS = new Set(['idx', 'length']); // fields of points and arrays that the patterns also catch
  for (const s of [sceneSrc, renderSrc, chartSrc]) {
    for (const m of s.matchAll(/\b(?:p|props|sp|over|\w+\.p|style\.props)(?:\?\.|\.)([a-zA-Z_]\w*)\b(?!\()/g)) if (!NOT_KEYS.has(m[1])) keys.add(m[1]);
    for (const m of s.matchAll(/\b(?:p|\w+\.p|sp|over)\[\s*'([^']+)'\s*\]/g)) keys.add(m[1]);
    for (const m of s.matchAll(/\b(?:p|\w+\.p)\[\s*`([\w.]+)\$\{[^}]*\}`\s*\]/g)) keys.add(m[1] + 'N');
    // the prefix is textAttrs' first literal argument (the props given may be an object literal with keys of its own)
    for (const m of s.matchAll(/\btextAttrs\(/g)) {
      const pre = topLiterals(s, m.index + m[0].length, false)[0];
      if (pre) for (const k of ['size', 'spacing', 'font', 'color', 'weight', 'italic']) keys.add(pre.slice(1, -1) + k);
    }
    for (const m of s.matchAll(/for \(const k of \[([^\]]*)\]\)/g)) for (const q of m[1].matchAll(/'([^']+)'/g)) keys.add(q[1]);
    for (const m of s.matchAll(/\b(?:cv|look\.canvas)(?:\?\.|\.)([a-zA-Z_]\w*)/g)) canvasKeys.add(m[1]);
  }
  for (const m of lookSrc.matchAll(/\blook\.canvas\.([a-zA-Z_]\w*)/g)) canvasKeys.add(m[1]);
  for (const k of CANVAS_KEYS) canvasKeys.add(k);
  // legend entries for things that are not styles: swatch.colour=, dot.colour=, line.colour=
  for (const m of sceneSrc.matchAll(/\/\^\(((?:\w+\|)+\w+)\)\\\.\(\.\+\)\$\//g)) for (const k of m[1].split('|')) keys.add(`${k}.*`);
  const usedKey = (k: string) => {
    if (/\.N$/.test(k)) return [...seen.props].some((u) => u.startsWith(k.slice(0, -1)) && /^\d+$/.test(u.slice(k.length - 1)));
    if (k.endsWith('.*')) return [...seen.props].some((u) => u.startsWith(k.slice(0, -1)));
    return seen.props.has(k);
  };
  for (const k of [...keys].sort()) add(`prop ${k}`, usedKey(k));
  for (const k of [...canvasKeys].sort()) add(`canvas ${k}`, seen.canvas.has(k));

  // (b) look statements: every head parseLook knows, dark by name and by path, and style's extends and kinds
  const from = lookSrc.indexOf('export function parseLook'), parseLookSrc = lookSrc.slice(from, lookSrc.indexOf('\n}\n', from));
  for (const m of parseLookSrc.matchAll(/head\.v === '(\w+)'/g)) add(`statement ${m[1]}`, seen.heads.has(m[1]));
  for (const k of ['dark by name', 'dark by path', 'style extends', 'style line', 'style text', 'style shape']) add(`statement ${k}`, seen.heads.has(k));

  // (c) shape kinds (from the code and the built-in styles), markers, series
  const kinds = new Set<string>();
  for (const s of [sceneSrc, renderSrc, chartSrc]) for (const m of s.matchAll(/\bshape === '([\w-]+)'/g)) kinds.add(m[1]);
  for (const st of emptyLook().styles.values()) if (st.props.shape) kinds.add(st.props.shape);
  for (const k of [...kinds].sort()) add(`shape ${k}`, seen.shapes.has(k));
  for (const k of MARKERS) add(`marker ${k}`, seen.markers.has(k));
  for (const k of SERIES) add(`series ${k}`, seen.series.has(k));

  // (d) messages: each string or template literal given to err(…)/warn(…) in scene.ts and parseLook, and set as a
  // message in node.ts; matched against every issue the cases report (a look's own issues, too)
  const templates: string[] = [];
  const calls: [string, RegExp][] = [[sceneSrc, /\b(?:err|warn)\(/g], [parseLookSrc, /\berr\(/g], [nodeSrc, /\bmsg(?::|\s*=)\s*(?=[`'])/g]];
  for (const [s, call] of calls) for (const m of s.matchAll(call)) templates.push(...topLiterals(s, m.index + m[0].length, m[0].startsWith('msg')));
  // a message counts for the template it matches with the most fixed text, so the loose "cannot read …" is not
  // credited with "cannot read the connector end …"
  const tpl = templates.map((t) => ({ id: `message ${templateText(t)}`, re: new RegExp(`^${templateRegex(t)}$`), fixed: templateParts(t).join('').length }));
  const hit = new Set<string>();
  for (const m of seen.msgs) {
    const best = tpl.filter((t) => t.re.test(m)).sort((a, b) => b.fixed - a.fixed)[0];
    if (best) hit.add(best.id);
  }
  for (const t of tpl) add(t.id, hit.has(t.id));

  // report
  const explainedFile = join(root, 'crates/fastdraw-render/tests/coverage/UNCOVERED.md');
  const explained = existsSync(explainedFile) ? readFileSync(explainedFile, 'utf8') : '';
  const unused = entries.filter((e) => !e.used);
  const open = unused.filter((e) => !explained.includes('`' + e.id + '`')), told = unused.filter((e) => !open.includes(e));
  console.log(`coverage: ${entries.length} entries, ${entries.length - unused.length} used, ${told.length} explained in UNCOVERED.md, ${open.length} not used`);
  for (const e of open) console.log(`  not used: ${e.id}`);
  for (const e of entries) if (e.used && explained.includes('`' + e.id + '`')) console.log(`  used now, so drop it from UNCOVERED.md: ${e.id}`);
  return open.length;
}

// The string and template literals at the top level of a call's arguments, from `i` (just after the open paren) to its
// close; with `one`, only the literal at `i`.
function topLiterals(s: string, i: number, one: boolean): string[] {
  const out: string[] = [];
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\'' || c === '"' || c === '`') {
      const end = skipLiteral(s, i);
      if (depth === 0) out.push(s.slice(i, end));
      if (one) return out;
      i = end;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) return out; depth--; }
    i++;
  }
  return out;
}
// The index just past the string or template literal that starts at s[i].
function skipLiteral(s: string, i: number): number {
  const q = s[i];
  for (i++; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === q) return i + 1;
    if (q === '`' && s[i] === '$' && s[i + 1] === '{') i = skipExpr(s, i + 2) - 1;
  }
  return i;
}
// The index just past the `}` that closes a template's ${…} whose body starts at s[i].
function skipExpr(s: string, i: number): number {
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\'' || c === '"' || c === '`') { i = skipLiteral(s, i); continue; }
    if (c === '{') depth++;
    else if (c === '}') { if (depth === 0) return i + 1; depth--; }
    i++;
  }
  return i;
}
// A literal's text pieces and holes, in order (a hole as null).
function templateParts(lit: string): (string | null)[] {
  const parts: (string | null)[] = [];
  let text = '';
  for (let i = 1; i < lit.length - 1; i++) {
    if (lit[i] === '\\') { text += lit[++i] === 'n' ? '\n' : lit[i]; continue; }
    if (lit[0] === '`' && lit[i] === '$' && lit[i + 1] === '{') { parts.push(text, null); text = ''; i = skipExpr(lit, i + 2) - 1; continue; }
    text += lit[i];
  }
  parts.push(text);
  return parts;
}
function templateRegex(lit: string): string { return templateParts(lit).map((p) => (p === null ? '[\\s\\S]*?' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join(''); }
function templateText(lit: string): string { return templateParts(lit).map((p) => (p === null ? '…' : p)).join(''); }
