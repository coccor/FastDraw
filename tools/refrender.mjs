// Renders diagram-design example pages to PNG, for side-by-side comparison with FastDraw output.
// Pages that style their SVG with CSS variables come out black here; screenshot those in a browser instead.
// Usage: node tools/refrender.mjs <assets dir> <out dir> <example name>...   (name as in example-<name>.html)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
const [assets, out, ...names] = process.argv.slice(2);
const fd = join(dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
const fontFiles = readdirSync(fd).filter((f) => /\.(ttf|otf)$/i.test(f)).map((f) => join(fd, f));
for (const n of names) {
  const html = readFileSync(join(assets, `example-${n}.html`), 'utf8');
  let svg = /<svg[\s\S]*?<\/svg>/.exec(html)?.[0];
  const vb = svg && /viewBox="-?[\d.]+ -?[\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!svg || !vb) { console.log('no svg with a viewBox in', n); continue; }
  svg = svg.replace('<svg ', `<svg width="${vb[1]}" height="${vb[2]}" `);
  writeFileSync(join(out, `${n}-ref.png`), new Resvg(svg, { font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Geist' }, fitTo: { mode: 'zoom', value: 2 } }).render().asPng());
  console.log('wrote', join(out, `${n}-ref.png`), vb[1], vb[2]);
}
