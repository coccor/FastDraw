import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScene, loadLook, readSources, bundledFonts, lookFonts, lookFileOf, withoutLigatureFonts, lookArg, lookOfDiagram, lookRefText, darkLookOf, type LookRef } from './node.ts';
import { buildScene, withLook, type Scene } from './scene.ts';
import { defaultLook } from './look.ts';
import { iconMatches, ICONS } from './icons.ts';
import { isBuiltIn } from './iconStyle.ts';
import { loadExtendedIcons } from './extendedIcons.ts';
import { DEFAULT_LOOK } from './defaultLook.ts';
import { embedSvg, embedPng } from './embed.ts';
import { renderSvg } from './render.ts';
import { check } from './check.ts';
import { serveFolder, DEFAULT_EDITOR } from './serve.ts';
import { spawn } from 'node:child_process';
import { sizesReport } from './sizes.ts';
import { about } from './guideKinds.ts';
import { setup, detect, skillNotes, packageVersion, TARGETS, type Target } from './setup.ts';
import { newerVersion } from './update.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Linux under WSL: the browser is on the Windows side, which xdg-open usually cannot reach.
function isWsl(): boolean {
  if (process.platform !== 'linux') return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try { return /microsoft/i.test(readFileSync('/proc/sys/kernel/osrelease', 'utf8')); } catch { return false; }
}

// Open a link in the person's browser, trying each launcher in turn until one starts.
function openBrowser(url: string) {
  const fileProtocol = ['url.dll,FileProtocolHandler', url];
  const tries: [string, string[]][] = process.platform === 'darwin' ? [['open', [url]]]
    : process.platform === 'win32' ? [['rundll32', fileProtocol]]
    : isWsl() ? [['wslview', [url]], ['rundll32.exe', fileProtocol], ['/mnt/c/Windows/System32/rundll32.exe', fileProtocol]]
    : [['xdg-open', [url]]];
  const next = (i: number) => {
    if (i >= tries.length) { console.log('could not start a browser; open the link above'); return; }
    spawn(tries[i][0], tries[i][1], { stdio: 'ignore', detached: true }).on('error', () => next(i + 1)).unref();
  };
  next(0);
}
const [cmd, ...args] = process.argv.slice(2);
// every Phosphor icon, not only the first ~130 built-in ones, for check, render, icons and the rest
const NAMED_ICONS = new Set(Object.keys(ICONS));
await loadExtendedIcons();

function usage(): never {
  console.log(`fastdraw <command>

  check  <file.fdraw | folder> ...        report problems, with line numbers. A folder means every
                                          .fdraw file under it
  render <file.fdraw | folder> ... [-o out.png|.svg] [--scale 2] [--transparent] [--no-embed]
         [--look name|file.look] [--dark]
                                          draw the diagram (PNG by default) next to it. With several
                                          files or a folder, checks them all first and draws nothing
                                          if any has an error. --look draws with another look instead
                                          of the file's own. --dark also writes x-dark.png with the
                                          look's dark version (the look's dark line; Night for the
                                          built-in look)
  sizes  [file.fdraw | file.look]         list the look's styles and their sizes
                                          (the built-in look when no file is given)
  init-look [path]                        write the built-in look to a file to make your own
  preview-look [file.look] [-o out.png]   draw every style of a look on one sheet
  icons  [file.look] [word]               list the icons a look offers, or search them
  open   <file.fdraw> [--editor URL] [--no-browser]
                                          open the diagram in the web editor (${DEFAULT_EDITOR}) with its
                                          look, fonts and icons; edits there save back to the file.
                                          Keeps running while you edit; Ctrl-C stops it
  guide  [topic]                          print the language guide, or the guide for one kind of diagram
  guide  list                             list the kinds of diagram that have a guide
  setup  [claude|agents|copilot ...] [--global]
                                          tell this repo's coding agents about FastDraw: a Claude Code
                                          skill, a section in AGENTS.md, or in Copilot's instructions.
                                          With no name, sets up the agents the repo already uses.
                                          --global puts the Claude Code skill in ~/.claude for every repo.
                                          Most people install the skill instead: npx skills add coccor/fastdraw,
                                          or /plugin install fastdraw --marketplace coccor/fastdraw in Claude Code`);
  process.exit(2);
}

function report(file: string): { errors: number; warns: number } {
  const sc = loadScene(file);
  const issues = check(sc);
  for (const i of issues) console.log(`${basename(file)}:${i.line}  ${i.level.padEnd(5)}  ${i.msg}`);
  const errors = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warn').length;
  const hints = issues.length - errors - warns;
  console.log(issues.length ? `\n${errors} error(s), ${warns} warning(s), ${hints} hint(s)` : 'ok: no problems found');
  return { errors, warns };
}

// The files named on the command line: a folder means every .fdraw file under it, sorted. many: more
// than one file, or a folder, which turns on the batch behaviour of check and render.
function diagramFiles(paths: string[]): { files: string[]; many: boolean } {
  const files: string[] = [];
  let folder = false;
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.isFile() && e.name.endsWith('.fdraw') ? [join(dir, e.name)] : []));
  for (const p of paths) {
    if (existsSync(p) && statSync(p).isDirectory()) {
      folder = true;
      const found = walk(p).sort();
      if (!found.length) { console.log(`no .fdraw files in ${p}`); process.exit(1); }
      files.push(...found);
    } else files.push(p);
  }
  return { files, many: folder || files.length > 1 };
}
// the arguments that are not flags or a flag's value
const VALUE_FLAGS = ['-o', '--scale', '--look', '--editor'];
const positional = (a: string[]) => a.filter((x, i) => !x.startsWith('-') && !VALUE_FLAGS.includes(a[i - 1]));

if (cmd === 'check') {
  const { files, many } = diagramFiles(positional(args));
  if (!files.length) usage();
  if (!many) process.exit(report(files[0]).errors ? 1 : 0);
  let errors = 0, warns = 0, hints = 0;
  for (const f of files) {
    for (const i of check(loadScene(f))) {
      console.log(`${f}:${i.line}  ${i.level.padEnd(5)}  ${i.msg}`);
      if (i.level === 'error') errors++; else if (i.level === 'warn') warns++; else hints++;
    }
  }
  console.log(errors + warns + hints ? `\n${files.length} files: ${errors} error(s), ${warns} warning(s), ${hints} hint(s)` : `ok: no problems found in ${files.length} files`);
  process.exit(errors ? 1 : 0);
} else if (cmd === 'render') {
  const { files, many } = diagramFiles(positional(args));
  if (!files.length) usage();
  const oi = args.indexOf('-o'), si = args.indexOf('--scale'), li = args.indexOf('--look');
  if (oi >= 0 && many) { console.log('-o names one output file, so it works with one diagram; leave it out to write each PNG next to its diagram'); process.exit(1); }
  const scale = si >= 0 ? +args[si + 1] : 2;
  if (!(scale > 0)) { console.log('--scale takes a number above 0, like 1, 2 or 3'); process.exit(1); }
  const transparent = args.includes('--transparent'), embed = !args.includes('--no-embed'), dark = args.includes('--dark');
  let lookOver: LookRef | undefined;
  if (li >= 0) {
    const r = args[li + 1] ? lookArg(args[li + 1]) : 'give --look the name of a look that ships with FastDraw, or a path to a .look file';
    if (typeof r === 'string') { console.log(r); process.exit(1); }
    lookOver = r;
  }
  type Job = { file: string; out: string; src?: string; sc: Scene; look?: string };
  // a diagram drawn with its own look, or with `ref` in place of it
  const job = (file: string, out: string, ref?: LookRef): Job => {
    let src: string | undefined, look: string | undefined;
    if (ref) { look = lookRefText(ref, file); try { src = withLook(readFileSync(file, 'utf8'), look); } catch { /* loadScene says it cannot read the file */ } }
    return { file, out, src, sc: loadScene(file, src), look };
  };
  const jobs: Job[] = [], problems: string[] = [];
  let failed = false;
  for (const file of files) {
    const name = many ? file : basename(file);
    const out = oi >= 0 ? args[oi + 1] : file.replace(/\.fdraw$/, '') + '.png';
    const light = job(file, out, lookOver);
    jobs.push(light);
    // one diagram keeps the old rule (only errors that stop drawing); several are checked in full first
    const issues = many ? check(light.sc).filter((i) => i.level !== 'hint') : light.sc.issues.filter((i) => i.level === 'error');
    for (const i of issues) problems.push(`${name}:${i.line}  ${i.level.padEnd(5)}  ${i.msg}`);
    if (issues.some((i) => i.level === 'error')) failed = true;
    if (!dark) continue;
    let base = lookOver;
    if (!base) try { base = lookOfDiagram(file, readFileSync(file, 'utf8')); } catch { continue; }
    const d = darkLookOf(base);
    if (typeof d === 'string') { problems.push(`${name}  error  --dark: ${d}`); failed = true; continue; }
    const dj = job(file, out.replace(/(\.[^./\\]*)?$/, '-dark$1'), d);
    jobs.push(dj);
    const seen = new Set(issues.map((i) => `${i.line} ${i.msg}`));
    const darkIssues = (many ? check(dj.sc).filter((i) => i.level !== 'hint') : dj.sc.issues.filter((i) => i.level === 'error')).filter((i) => !seen.has(`${i.line} ${i.msg}`));
    for (const i of darkIssues) problems.push(`${name}:${i.line}  ${i.level.padEnd(5)}  ${i.msg} (in the dark image, look ${dj.look})`);
    if (darkIssues.some((i) => i.level === 'error')) failed = true;
  }
  for (const p of problems) console.log(p);
  if (failed) { console.log('\nnot rendered: fix the errors first'); process.exit(1); }
  if (problems.length) console.log('');
  const { Resvg } = await import('@resvg/resvg-js');
  for (const { file, out, src, sc, look } of jobs) {
    const svg = renderSvg(sc, undefined, { background: !transparent });
    const payload = { v: 1 as const, ...readSources(file, sc, src) };
    if (out.endsWith('.svg')) writeFileSync(out, embed ? embedSvg(svg, payload) : svg);
    else {
      // the ligature-free copies are made on the first image and reused for the rest of the run
      const fontFiles = withoutLigatureFonts([...bundledFonts(), ...(sc.fontFiles ?? [])]);
      const png = new Uint8Array(new Resvg(svg, { font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Geist' }, fitTo: { mode: 'zoom', value: scale } }).render().asPng());
      writeFileSync(out, embed ? embedPng(png, payload) : png);
    }
    const notes = [out.endsWith('.svg') ? '' : `at ${scale}x`, look ? `look ${look}` : '', transparent ? 'no background' : '', embed ? '' : 'no diagram inside'].filter(Boolean);
    console.log(`wrote ${out} (${sc.w}x${sc.h}${notes.length ? ', ' + notes.join(', ') : ''})`);
  }
} else if (cmd === 'sizes') {
  const look = !args[0] ? defaultLook() : args[0].endsWith('.look') ? loadLook(args[0]) : loadScene(args[0]).look;
  const lf = lookFonts(!args[0] ? undefined : args[0].endsWith('.look') ? args[0] : lookFileOf(args[0]), look);
  console.log(sizesReport(look, lf.missing));
} else if (cmd === 'init-look') {
  const out = args[0] ?? 'team.look';
  if (existsSync(out)) { console.log(`${out} already exists; choose another path or remove it first`); process.exit(1); }
  writeFileSync(out, DEFAULT_LOOK);
  console.log(`wrote ${out}. Point a diagram at it with:  look "./${basename(out)}"`);
} else if (cmd === 'preview-look') {
  const file = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-o');
  const oi = args.indexOf('-o');
  const out = oi >= 0 ? args[oi + 1] : (file ? file.replace(/\.look$/, '') : 'default') + '-preview.png';
  const look = file ? loadLook(file) : defaultLook();
  const errs = look.issues.filter((i) => i.level === 'error');
  if (errs.length) { for (const i of errs) console.log(`${file}:${i.line}  error  ${i.msg}`); process.exit(1); }
  const skip = new Set(['rect', 'ellipse', 'diamond', 'polygon', 'freehand', 'arc', 'icon', 'text', 'line', 'legend']);
  const all = [...look.styles.values()].filter((s) => !skip.has(s.name));
  const L: string[] = [];
  const W = 880;
  let y = 40;
  const heading = (t: string) => { L.push(`text ${JSON.stringify(t)} at 40,${y + 10} size=11 weight=600 color=muted font=sans`); y += 28; };
  heading('Shapes');
  let x = 40, rowH = 0;
  all.filter((s) => s.kind === 'shape').forEach((s, i) => {
    const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(s.props.size ?? '');
    const table = s.props.shape === 'table';
    const w = table ? 160 : m ? +m[1] : 144, h = table ? 104 : m ? +m[2] : 64;
    const cell = Math.max(w, 144) + 40;
    if (x + cell > W + 40) { x = 40; y += rowH + 44; rowH = 0; }
    const narrow = w <= 12, back = s.props.layer === 'back';
    if (s.props.shape === 'chart') {
      if (x + 280 > W + 40) { x = 40; y += rowH + 44; rowH = 0; }
      L.push(`p${i}: ${s.name} ${JSON.stringify(s.name)} at ${x + 32},${y + 28} 200x100 x="A,B,C,D"\n  | bars "one" 30 50 40 70\n  | line "two" 40 45 55 60`);
      x += 280; rowH = Math.max(rowH, 148);
      return;
    }
    if (table) {
      const grid = s.props.align === 'center';
      L.push(`p${i}: ${s.name} ${JSON.stringify(s.name)} at ${x},${y} 160x0\n  ${grid ? '|= "" "A" "B"' : '| "id" "uuid" "PK"'}\n  | "name" ${grid ? '"yes" "no"' : '"text" ""'}\n  | "more" ${grid ? '"no" "yes"' : '"int" ""'}`);
      x += cell; rowH = Math.max(rowH, h);
      return;
    }
    L.push(`p${i}: ${s.name} ${narrow ? '' : JSON.stringify(s.name)} at ${x},${y} ${w}x${h}${narrow || back || s.props.shape === 'diamond' ? '' : ' sub="second line" tag="TAG"' + (i < 2 ? ` ghost="0${i + 1}"` : '')}`);
    if (narrow) L.push(`text ${JSON.stringify(s.name)} at ${x + 20},${y + 14} size=10 color=muted font=sans`);
    x += cell; rowH = Math.max(rowH, h);
  });
  y += rowH + 48;
  heading('Lines and arrows');
  all.filter((s) => s.kind === 'line').forEach((s, i) => {
    const cx = 40 + (i % 4) * 216;
    if (i && i % 4 === 0) y += 44;
    L.push(`${cx},${y + 16} ${s.props.head === 'none' || s.props.route === 'straight' ? '--' : '->'} ${cx + 176},${y + 16} ${JSON.stringify(s.name)} style=${s.name}`);
  });
  y += 60;
  heading('Icons');
  // the named built-in icons and the look's own; the other ~1,400 Phosphor icons would fill pages (fastdraw icons <word> finds them)
  [...look.icons.keys()].filter((n) => NAMED_ICONS.has(n) || !isBuiltIn(look, n)).forEach((n, i) => {
    const cx = 40 + (i % 11) * 80;
    if (i && i % 11 === 0) y += 60;
    L.push(`icon at ${cx + 20},${y} icon=${n}`);
    L.push(`text ${JSON.stringify(n)} at ${cx + 32},${y + 40} size=8 color=muted font=sans anchor=middle`);
  });
  y += 76;
  heading('Text');
  for (const s of all.filter((t) => t.kind === 'text')) {
    const size = +(s.props.size ?? 12);
    y += Math.max(size, 10) + 4;
    L.push(`text ${JSON.stringify(`${s.name}: The quick brown fox`)} at 40,${y} style=${s.name}`);
    y += 12;
  }
  y += 32;
  const entries = all.filter((s) => s.kind !== 'text').slice(0, 8).map((s) => `${s.name}=${JSON.stringify(s.name)}`).join(' ');
  L.push(`legend at 40,${y} ${W}x10 ${entries}`);
  const sc = buildScene(L.join('\n'), look);
  const bad = sc.issues.filter((i) => i.level === 'error');
  if (bad.length) { for (const i of bad) console.log(`preview: ${i.msg}`); process.exit(1); }
  const svg = renderSvg(sc);
  if (out.endsWith('.svg')) writeFileSync(out, svg);
  else {
    const { Resvg } = await import('@resvg/resvg-js');
    const lf = lookFonts(file, look);
    for (const fam of lf.missing) console.log(`warning: no font file found for "${fam}"; it will be drawn in a fallback font`);
    const fontFiles = withoutLigatureFonts([...bundledFonts(), ...lf.files]);
    writeFileSync(out, new Resvg(svg, { font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Geist' }, fitTo: { mode: 'zoom', value: 2 } }).render().asPng());
  }
  console.log(`wrote ${out}: ${all.length} styles`);
} else if (cmd === 'icons') {
  // icons [file.look] [word]: every icon a look offers, optionally only those that answer to the word (by name or meaning)
  const file = args[0]?.endsWith('.look') ? args[0] : undefined, word = (file ? args[1] : args[0])?.toLowerCase();
  const look = file ? loadLook(file) : defaultLook();
  const names = [...new Set([...look.images.keys(), ...look.icons.keys()])].filter((n) => !word || iconMatches(n, word));
  console.log(names.length ? names.join('\n') : `no icon${word ? ` for "${word}"` : ''}`);
} else if (cmd === 'guide') {
  const topic = args[0];
  const file = join(root, 'guide', topic ? `${topic}.md` : 'guide.md');
  const topics = readdirSync(join(root, 'guide')).filter((f) => f.endsWith('.md') && f !== 'guide.md').map((f) => f.slice(0, -3)).sort();
  if (topic === 'list') {
    const width = Math.max(...topics.map((t) => t.length)) + 2;
    for (const t of topics) console.log(t.padEnd(width) + about(readFileSync(join(root, 'guide', `${t}.md`), 'utf8'), t).line);
    process.exit(0);
  }
  if (!existsSync(file) || /[\\/]/.test(topic ?? '')) { console.log(`no guide called "${topic}". Topics: ${topics.join(', ')}`); process.exit(1); }
  // the guide is what an agent reads first, so it carries the notes about versions: the repo's instructions
  // being older than this fastdraw, or a newer fastdraw on npm
  if (!topic) {
    const version = packageVersion(root);
    const notes = skillNotes(root, process.cwd());
    const newer = await newerVersion(version);
    if (newer) notes.push(`Note: fastdraw ${newer} is out; this is ${version}. Run it as npx fastdraw@latest, or update the installed one: npm install -g fastdraw@latest`);
    if (notes.length) console.log(notes.join('\n') + '\n');
  }
  console.log(readFileSync(file, 'utf8'));
} else if (cmd === 'open') {
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--editor');
  if (!file || !file.endsWith('.fdraw') || !existsSync(file)) usage();
  const ei = args.indexOf('--editor');
  const editor = ei >= 0 ? args[ei + 1] : process.env.FASTDRAW_EDITOR ?? DEFAULT_EDITOR;
  const s = await serveFolder(dirname(resolve(file)), { editor, open: basename(file) });
  console.log(`serving ${dirname(resolve(file))} to the editor until this stops (Ctrl-C)\nIf no browser window opens, open this link:\n${s.url}`);
  if (!args.includes('--no-browser')) openBrowser(s.url);
  const stop = () => { s.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} else if (cmd === 'setup') {
  const global = args.includes('--global');
  const named = args.filter((a) => !a.startsWith('--'));
  const wrong = named.filter((a) => !TARGETS.includes(a as Target));
  if (wrong.length) { console.log(`unknown agent: ${wrong.join(', ')}. Choose from: ${TARGETS.join(', ')}`); process.exit(1); }
  const targets = named.length ? (named as Target[]) : global ? ['claude' as Target] : detect(process.cwd());
  try { for (const l of setup(root, process.cwd(), targets, global)) console.log(l); }
  catch (e) { console.log((e as Error).message); process.exit(1); }
  console.log('\nAsk your agent for a diagram, for example: "Draw this repo\'s architecture as docs/diagrams/architecture.fdraw".');
} else usage();
