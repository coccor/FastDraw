// Mock signature treatments FastDraw's renderer can't draw yet, by rewriting its SVG output.
// node post.mjs <repo> <in.svg> <out.png> <concept: source|bolt|stack>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const [repo, inp, out, concept] = process.argv.slice(2);
const require = createRequire(join(repo, 'package.json'));
const { Resvg } = require('@resvg/resvg-js');
let svg = readFileSync(inp, 'utf8');
const ground = /<rect width="[\d.]+" height="[\d.]+" fill="([^"]+)"\/>/.exec(svg)[1];
const G = ground.replace(/[()]/g, '\\$&');

// a "mask" is the ground-filled copy FastDraw draws under every shape; the shape follows it
const maskRe = new RegExp(`(<(rect|path|ellipse|polygon)\\b[^>]*fill="${G}"[^>]*/>)(\\n?)(?=<(?!text)(rect|path|ellipse|polygon))`, 'g');

function shadow(dx, dy, color) {
  svg = svg.replace(maskRe, (m, el, _t, nl) => el.replace(/fill="[^"]*"/, `fill="${color}"`).replace(/\/>$/, ` transform="translate(${dx} ${dy})"/>`) + '\n' + el + nl);
}
function chamfer(c) {
  const rectRe = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"(?: rx="[\d.]+")?([^>]*)\/>/g;
  // only boxes: a mask rect followed by a rect with the same corner
  svg = svg.replace(new RegExp(`(<rect x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"(?: rx="[\\d.]+")? fill="${G}"/>\\n?)(<rect x="\\2" y="\\3"[^>]*/>)`, 'g'), (m, a, x, y, w, h, b) => {
    if (+w < 40 || +h < 28) return m;
    return (a + b).replace(rectRe, (_m, X, Y, W, H, rest) => {
      X = +X; Y = +Y; W = +W; H = +H; const k = Math.min(c, H / 3);
      return `<polygon points="${X},${Y} ${X + W - k},${Y} ${X + W},${Y + k} ${X + W},${Y + H} ${X},${Y + H}"${rest} stroke-linejoin="miter"/>`;
    });
  });
}
function chips({ fill, stroke, pad, rx, h, recolor }) {
  svg = svg.replace(new RegExp(`<rect x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)" rx="[\\d.]+" fill="${G}"/>(\\n?<text[^>]*)`, 'g'), (m, x, y, w, hh, t) => {
    const cy = +y + +hh / 2;
    if (recolor) t = t.replace(/fill="([^"]+)"/, (_f, c) => `fill="${recolor(c)}"`);
    return `<rect x="${+x - pad}" y="${cy - h / 2}" width="${+w + 2 * pad}" height="${h}" rx="${rx}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="1.25"` : ''}/>${t}`;
  });
}
function ports() {
  // lines only (arrowheads are stroked paths with round caps); dots go on top of everything
  const dots = [];
  for (const m of svg.matchAll(/<path d="M ([\d.-]+),([\d.-]+)[^"]*" fill="none" stroke="([^"]+)" stroke-width="([\d.]+)"([^>]*)\/>/g)) {
    if (/linecap/.test(m[5])) continue;
    dots.push(`<circle cx="${m[1]}" cy="${m[2]}" r="3.4" fill="${ground}" stroke="${m[3]}" stroke-width="1.6"/>`);
  }
  svg = svg.replace('</svg>', dots.join('\n') + '\n</svg>');
}
function brackets(zoneFill, color, len) {
  svg = svg.replace(new RegExp(`<rect x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"(?: rx="[\\d.]+")? fill="${zoneFill}"[^>]*/>`, 'g'), (m, x, y, w, h) => {
    x = +x; y = +y; w = +w; h = +h; const L = len;
    const d = `M${x},${y + L} V${y} H${x + L} M${x + w - L},${y} H${x + w} V${y + L} M${x + w},${y + h - L} V${y + h} H${x + w - L} M${x + L},${y + h} H${x} V${y + h - L}`;
    return `${m}\n<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
  });
}

if (concept === 'source') { ports(); brackets('#f6f7f9', '#16181d', 14); chips({ fill: ground, pad: 3, rx: 0, h: 14 }); }
if (concept === 'bolt') { chamfer(14); chips({ fill: '#111214', pad: 6, rx: 0, h: 18, recolor: (c) => (c === '#ffd400' ? c : '#ffffff') }); }
if (concept === 'stack') { shadow(5, 5, '#4f46e5'); chips({ fill: '#ffffff', stroke: '#15163a', pad: 7, rx: 9, h: 18 }); }

if (concept === 'echo') {
  // a second outline offset behind each rectangular card, like a stacked sheet
  svg = svg.replace(new RegExp(`(<rect\\b[^>]*fill="${G}"[^>]*/>)(\\n?)(?=<rect)`, 'g'), (m, el, nl) => el.replace(/ stroke(-width|-dasharray)?="[^"]*"/g, '').replace(/fill="[^"]*"/, 'fill="#ffffff" stroke="#16191d" stroke-width="1.5"').replace(/\/>$/, ' transform="translate(5 5)"/>') + '\n' + el + nl);
}
if (concept === 'studio') {
  // soft two-layer shadow under every box (applied to its ground-coloured underlay)
  svg = svg.replace(/(<svg[^>]*>)/, `$1\n<defs><filter id="fd-lift" x="-20%" y="-20%" width="140%" height="170%"><feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#0f1729" flood-opacity="0.08"/><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#0f1729" flood-opacity="0.07"/></filter></defs>`);
  svg = svg.replace(maskRe, (m, el, _t, nl) => el.replace(/\/>$/, ' filter="url(#fd-lift)"/>') + nl);
  // zone titles sit on the zone's own wash: drop their canvas-coloured knockout
  svg = svg.replace(new RegExp(`<rect [^>]*height="12" rx="2" fill="${G}"/>\\n?(?=<text)`, 'g'), '');
  chips({ fill: ground, pad: 4, rx: 4, h: 16 });
}

const fontFiles = [];
for (const d of [join(repo, 'fonts'), join(repo, 'looks/candidates/fonts')]) for (const f of readdirSync(d)) if (/\.(ttf|otf)$/.test(f)) fontFiles.push(join(d, f));
writeFileSync(out.replace(/\.png$/, '.svg'), svg);
writeFileSync(out, new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Geist' }, fitTo: { mode: 'zoom', value: 2 } }).render().asPng());
console.log('wrote', out);
