import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScene, loadLook, readSources } from './node.ts';
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
    const fontDir = join(root, 'fonts');
    const fontFiles = existsSync(fontDir) ? readdirSync(fontDir).filter((f) => /\.(ttf|otf)$/.test(f)).map((f) => join(fontDir, f)) : [];
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
      if (kind === 'shape') bits.push(`shape=${p.shape ?? 'rect'}`, p.size ? `default size ${p.size}` : 'no default size: always give WxH', p.layer === 'back' ? 'drawn behind everything' : '');
      if (kind === 'line') bits.push(`route=${p.route ?? 'ortho'}`, p.dash ? `dash=${p.dash}` : 'solid', `stroke=${p.stroke ?? 'muted'}`);
      if (kind === 'text') bits.push(`font=${p.font ?? 'sans'}`, `size=${p.size ?? 12}`, p.caps === '1' ? 'caps' : '');
      if (p.use) bits.push(`use: ${p.use}`);
      console.log(`  ${s.name.padEnd(12)} ${bits.filter(Boolean).join(' · ')}`);
    }
  }
  if (look.guidance.length) { console.log('\nguidance from this look'); for (const g of look.guidance) console.log(`  - ${g}`); }
} else if (cmd === 'init-look') {
  const out = args[0] ?? 'team.look';
  if (existsSync(out)) { console.log(`${out} already exists; choose another path or remove it first`); process.exit(1); }
  writeFileSync(out, DEFAULT_LOOK);
  console.log(`wrote ${out}. Point a diagram at it with:  look "./${basename(out)}"`);
} else if (cmd === 'guide') {
  const topic = args[0];
  const file = join(root, 'guide', topic ? `${topic}.md` : 'guide.md');
  if (!existsSync(file)) { console.log(`no guide called "${topic}". Topics: architecture, flowchart, sequence, look`); process.exit(1); }
  console.log(readFileSync(file, 'utf8'));
} else usage();
