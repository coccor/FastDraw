import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScene, loadLook, readSources, bundledFonts, lookFonts, lookFileOf } from './node.ts';
import { buildScene } from './scene.ts';
import { defaultLook } from './look.ts';
import { DEFAULT_LOOK } from './defaultLook.ts';
import { embedSvg, embedPng } from './embed.ts';
import { renderSvg } from './render.ts';
import { check } from './check.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...args] = process.argv.slice(2);

function usage(): never {
  console.log(`fastdraw <command>

  check  <file.fdraw>                     report problems, with line numbers
  render <file.fdraw> [-o out.png|.svg] [--scale 2]
                                          draw the diagram (PNG by default)
  sizes  [file.fdraw | file.look]         list the look's styles and their sizes
                                          (the built-in look when no file is given)
  init-look [path]                        write the built-in look to a file to make your own
  preview-look [file.look] [-o out.png]   draw every style of a look on one sheet
  guide  [architecture|flowchart|sequence|look]
                                          print the language guide`);
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

if (cmd === 'check') {
  if (!args[0]) usage();
  process.exit(report(args[0]).errors ? 1 : 0);
} else if (cmd === 'render') {
  const file = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-o' && args[i - 1] !== '--scale');
  if (!file) usage();
  const oi = args.indexOf('-o'), si = args.indexOf('--scale');
  const out = oi >= 0 ? args[oi + 1] : file.replace(/\.fdraw$/, '') + '.png';
  const scale = si >= 0 ? +args[si + 1] : 2;
  const sc = loadScene(file);
  const errors = sc.issues.filter((i) => i.level === 'error');
  if (errors.length) {
    for (const i of errors) console.log(`${basename(file)}:${i.line}  error  ${i.msg}`);
    console.log('\nnot rendered: fix the errors first');
    process.exit(1);
  }
  const svg = renderSvg(sc);
  const payload = { v: 1 as const, ...readSources(file) };
  if (out.endsWith('.svg')) writeFileSync(out, embedSvg(svg, payload));
  else {
    const { Resvg } = await import('@resvg/resvg-js');
    const fontFiles = [...bundledFonts(), ...(sc.fontFiles ?? [])];
    const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Geist' }, fitTo: { mode: 'zoom', value: scale } }).render().asPng();
    writeFileSync(out, embedPng(new Uint8Array(png), payload));
  }
  console.log(`wrote ${out} (${sc.w}x${sc.h}${out.endsWith('.svg') ? '' : ` at ${scale}x`})`);
} else if (cmd === 'sizes') {
  const look = !args[0] ? defaultLook() : args[0].endsWith('.look') ? loadLook(args[0]) : loadScene(args[0]).look;
  for (const i of look.issues) console.log(`look:${i.line}  ${i.level}  ${i.msg}`);
  const rows = [...look.styles.values()];
  for (const kind of ['shape', 'line', 'text'] as const) {
    console.log(`\n${kind} styles`);
    for (const s of rows.filter((r) => r.kind === kind)) {
      const p = s.props;
      const bits: string[] = [];
      if (kind === 'shape') bits.push(`shape=${p.shape ?? 'rect'}`, p.shape === 'table' ? 'sizes itself from its rows' : p.shape === 'polygon' ? 'sized by its points' : p.size ? `default size ${p.size}` : 'no default size: always give WxH', p.layer === 'back' ? 'drawn behind everything' : '');
      if (kind === 'line') bits.push(`route=${p.route ?? 'ortho'}`, p.dash ? `dash=${p.dash}` : 'solid', `stroke=${p.stroke ?? 'muted'}`);
      if (kind === 'text') bits.push(`font=${p.font ?? 'sans'}`, `size=${p.size ?? 12}`, p.caps === '1' ? 'caps' : '');
      if (p.use) bits.push(`use: ${p.use}`);
      console.log(`  ${s.name.padEnd(12)} ${bits.filter(Boolean).join(' · ')}`);
    }
  }
  const lf = lookFonts(!args[0] ? undefined : args[0].endsWith('.look') ? args[0] : lookFileOf(args[0]), look);
  console.log('\nfonts');
  for (const [role, fam] of look.fonts) console.log(`  ${role.padEnd(12)} ${fam}${lf.missing.includes(fam) ? '   (no font file found: will fall back)' : ''}`);
  if (look.guidance.length) { console.log('\nguidance from this look'); for (const g of look.guidance) console.log(`  - ${g}`); }
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
  const skip = new Set(['rect', 'ellipse', 'diamond', 'polygon', 'arc', 'text', 'line', 'legend']);
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
  const sc = buildScene(`canvas ${W + 80}x${y + 110}\n` + L.join('\n'), look);
  const bad = sc.issues.filter((i) => i.level === 'error');
  if (bad.length) { for (const i of bad) console.log(`preview: ${i.msg}`); process.exit(1); }
  const svg = renderSvg(sc);
  if (out.endsWith('.svg')) writeFileSync(out, svg);
  else {
    const { Resvg } = await import('@resvg/resvg-js');
    const lf = lookFonts(file, look);
    for (const fam of lf.missing) console.log(`warning: no font file found for "${fam}"; it will be drawn in a fallback font`);
    const fontFiles = [...bundledFonts(), ...lf.files];
    writeFileSync(out, new Resvg(svg, { font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Geist' }, fitTo: { mode: 'zoom', value: 2 } }).render().asPng());
  }
  console.log(`wrote ${out}: ${all.length} styles`);
} else if (cmd === 'guide') {
  const topic = args[0];
  const file = join(root, 'guide', topic ? `${topic}.md` : 'guide.md');
  if (!existsSync(file)) { console.log(`no guide called "${topic}". Topics: architecture, flowchart, sequence, look`); process.exit(1); }
  console.log(readFileSync(file, 'utf8'));
} else usage();
