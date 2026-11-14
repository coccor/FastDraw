// Draws a resolved scene as SVG. The same output feeds PNG export.
import { color, fontFamily } from './look.ts';
import type { Look, Props } from './look.ts';
import { textWidth, ICON_CAPTION_GAP } from './scene.ts';
import type { Scene, Shape, Conn, Pt, TextEl } from './scene.ts';
import { drawChart } from './chart.ts';
import { isIconUri } from './iconfiles.ts';
import { SOLID_BOX, SOLID_ICONS } from './solidIcons.ts';
import { DUOTONE_ICONS } from './duotoneIcons.ts';
import { ICONS } from './icons.ts';
import { canSketch, sketchSvg, rectD, ellipseD } from './sketch.ts';

// Per render: how rough the look draws (canvas sketch=, 0 for clean lines) and the fill patterns it needs.
let R = { amt: 0, defs: new Map<string, string>() };
const roughOf = (p: Props) => (p.sketch === '0' ? 0 : R.amt);

// hatch=colour fills a shape with diagonal pencil lines; hatch.gap and hatch.sw space and weigh them.
function hatchFill(look: Look, p: Props): string | null {
  if (!p.hatch || p.hatch === 'none') return null;
  const c = col(look, p.hatch), gap = num(p['hatch.gap'], 6), sw = num(p['hatch.sw'], 1), key = `${c}|${gap}|${sw}`;
  let id = R.defs.get(key);
  if (!id) {
    id = `fd-hatch-${R.defs.size}`;
    R.defs.set(key, id);
  }
  return `url(#${id})`;
}
function hatchDefs(): string {
  return [...R.defs].map(([key, id]) => {
    const [c, gap, sw] = key.split('|');
    return `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(-41)"><line x1="0" y1="0" x2="0" y2="${gap}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/></pattern>`;
  }).join('');
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const num = (v: string | undefined, d: number) => (v === undefined || v === '' || isNaN(+v) ? d : +v);
export const r2 = (n: number) => Math.round(n * 100) / 100;
// Everything interpolated into an attribute goes through esc: diagram files are untrusted input
// and the editor injects this markup into the page.
export const col = (look: Look, v: string | undefined) => esc(color(look, v));
const fam = (look: Look, v: string | undefined) => esc(fontFamily(look, v));

export function textAttrs(look: Look, p: Props, pre: string, d: { font: string; size: number; weight: number; color: string }) {
  const g = (k: string) => p[pre + k];
  const size = num(g('size'), d.size);
  const spacing = num(g('spacing'), 0);
  let a = `font-family="${fam(look, g('font') ?? d.font)}" font-size="${size}" fill="${col(look, g('color') ?? d.color)}"`;
  const weight = num(g('weight'), d.weight);
  if (weight !== 400) a += ` font-weight="${weight}"`;
  if (g('italic') === '1') a += ' font-style="italic"';
  if (spacing) a += ` letter-spacing="${r2(spacing * size)}"`;
  return { a, size, spacing, font: g('font') ?? d.font, weight };
}

function strokeAttrs(look: Look, p: Props): string {
  let a = `fill="${col(look, p.fill)}" stroke="${col(look, p.stroke)}"`;
  if (p.stroke && p.stroke !== 'none') a += ` stroke-width="${num(p.sw, 1)}"`;
  if (p.dash && p.dash !== 'none') a += ` stroke-dasharray="${esc(p.dash)}"`;
  if (p.cap === 'round') a += ' stroke-linecap="round"';
  return a;
}

// The outline as path data, so it can be drawn by hand. Arcs keep their clean outline.
function shapeD(s: Shape): string | null {
  const { x, y, w, h } = s;
  if (s.shape === 'ellipse') return ellipseD(x, y, w, h);
  if (s.shape === 'diamond') return `M ${x + w / 2},${y} L ${x + w},${y + h / 2} L ${x + w / 2},${y + h} L ${x},${y + h / 2} Z`;
  if (s.shape === 'polygon') return s.poly ? polyD(s) : null;
  if (s.shape === 'path') return s.p.path ? scaledPath(s) : null;
  if (s.shape === 'arc') return null;
  return rectD(x, y, w, h, Math.min(num(s.p.radius, 0), w / 2, h / 2));
}

// path is written in a 0..1 box and scaled to the element (M, L, C, Q, Z only)
function scaledPath(s: Shape): string {
  let isX = true;
  return s.p.path.replace(/-?\d*\.?\d+/g, (n) => { const v = isX ? s.x + +n * s.w : s.y + +n * s.h; isX = !isX; return String(r2(v)); });
}

function polyD(s: Shape): string {
  const P = s.poly!, open = s.p.open === '1';
  if (s.p.smooth === '1' && P.length > 2) {
    // a smooth line through every corner
    const at = (i: number) => (open ? P[Math.min(Math.max(i, 0), P.length - 1)] : P[(i + P.length) % P.length]);
    let d = `M ${P[0].x},${P[0].y}`;
    for (let i = 0; i < (open ? P.length - 1 : P.length); i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      d += ` C ${r2(p1.x + (p2.x - p0.x) / 6)},${r2(p1.y + (p2.y - p0.y) / 6)} ${r2(p2.x - (p3.x - p1.x) / 6)},${r2(p2.y - (p3.y - p1.y) / 6)} ${p2.x},${p2.y}`;
    }
    return d + (open ? '' : ' Z');
  }
  return `M ${P.map((q) => `${q.x},${q.y}`).join(' L ')}${open ? '' : ' Z'}`;
}

// under: a fill painted between the shape's own fill and its stroke (a hatch)
function outline(s: Shape, attrs: string, under?: string): string {
  const amt = roughOf(s.p);
  if (amt) {
    const d = shapeD(s);
    if (d && canSketch(d)) {
      const a = s.shape === 'polygon' && s.p.open === '1' ? attrs.replace(/fill="[^"]*"/, 'fill="none"') : attrs;
      return sketchSvg(d, a, amt, under ? `<path d="{d}" fill="${under}" stroke="none"/>` : '');
    }
  }
  if (!under) return outlinePlain(s, attrs);
  return [outlinePlain(s, attrs.replace(/stroke="[^"]*"/, 'stroke="none"')), outlinePlain(s, `fill="${under}" stroke="none"`), outlinePlain(s, attrs.replace(/fill="[^"]*"/, 'fill="none"'))].join('\n');
}

function outlinePlain(s: Shape, attrs: string): string {
  const { x, y, w, h } = s;
  if (s.shape === 'ellipse') return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`;
  if (s.shape === 'diamond') return `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${attrs}/>`;
  if (s.shape === 'path' && s.p.path) {
    // path is written in a 0..1 box and scaled to the element (M, L, C, Q, Z only)
    let isX = true;
    const d = s.p.path.replace(/-?\d*\.?\d+/g, (n) => { const v = isX ? x + +n * w : y + +n * h; isX = !isX; return String(r2(v)); });
    return `<path d="${esc(d)}" ${attrs}/>`;
  }
  if (s.shape === 'polygon' && s.poly) {
    const P = s.poly, open = s.p.open === '1';
    const a = open ? attrs.replace(/fill="[^"]*"/, 'fill="none"') : attrs;
    if (s.p.smooth === '1' && P.length > 2) {
      // a smooth line through every corner
      const at = (i: number) => (open ? P[Math.min(Math.max(i, 0), P.length - 1)] : P[(i + P.length) % P.length]);
      let d = `M ${P[0].x},${P[0].y}`;
      for (let i = 0; i < (open ? P.length - 1 : P.length); i++) {
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        d += ` C ${r2(p1.x + (p2.x - p0.x) / 6)},${r2(p1.y + (p2.y - p0.y) / 6)} ${r2(p2.x - (p3.x - p1.x) / 6)},${r2(p2.y - (p3.y - p1.y) / 6)} ${p2.x},${p2.y}`;
      }
      return `<path d="${d}${open ? '' : ' Z'}" stroke-linejoin="round" ${a}/>`;
    }
    return `<${open ? 'polyline' : 'polygon'} points="${P.map((q) => `${q.x},${q.y}`).join(' ')}" stroke-linejoin="round" ${a}/>`;
  }
  if (s.shape === 'arc') {
    // a slice of the ellipse that fills the box: from= and to= in degrees clockwise from the top
    const a0 = num(s.p.from, 0), a1 = num(s.p.to, 360), inner = Math.min(Math.max(num(s.p.inner, 0), 0), 0.98), open = s.p.open === '1';
    const cx0 = x + w / 2, cy0 = y + h / 2;
    const pt = (deg: number, k: number) => `${r2(cx0 + (w / 2) * k * Math.sin((deg * Math.PI) / 180))},${r2(cy0 - (h / 2) * k * Math.cos((deg * Math.PI) / 180))}`;
    const sweep = (k: number, f: number, t: number) => {
      // an arc cannot draw a full turn in one go, so it is drawn in two halves
      const mid = (f + t) / 2, dir = t > f ? 1 : 0, r = `${r2((w / 2) * k)} ${r2((h / 2) * k)}`;
      return `A ${r} 0 0 ${dir} ${pt(mid, k)} A ${r} 0 0 ${dir} ${pt(t, k)}`;
    };
    const full = Math.abs(a1 - a0) >= 360;
    let d = `M ${pt(a0, 1)} ${sweep(1, a0, a1)}`;
    if (open) return `<path d="${d}" ${attrs.replace(/fill="[^"]*"/, 'fill="none"')} stroke-linecap="round"/>`;
    if (inner > 0) d += full ? ` Z M ${pt(a1, inner)} ${sweep(inner, a1, a0)} Z` : ` L ${pt(a1, inner)} ${sweep(inner, a1, a0)} Z`;
    else d += full ? ' Z' : ` L ${r2(cx0)},${r2(cy0)} Z`;
    return `<path d="${d}" fill-rule="evenodd" stroke-linejoin="round" ${attrs}/>`;
  }
  const rx = Math.min(num(s.p.radius, 0), w / 2, h / 2);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ''} ${attrs}/>`;
}

function drawLegend(look: Look, s: Shape): string {
  const p = s.p, out: string[] = [];
  out.push(`<line x1="${s.x}" y1="${s.y}" x2="${s.x + s.w}" y2="${s.y}" stroke="${col(look, p.rule ?? 'ink/0.12')}" stroke-width="0.8"/>`);
  if ((p.title ?? 'none') !== 'none') {
    const t = textAttrs(look, p, 'title.', { font: 'mono', size: 8, weight: 400, color: 'muted' });
    out.push(`<text x="${s.x}" y="${s.y + 16}" ${t.a}>${esc(p['title.caps'] === '0' ? p.title : p.title.toUpperCase())}</text>`);
  }
  const it = textAttrs(look, p, 'item.', { font: 'sans', size: 8.5, weight: 400, color: 'muted' });
  for (const e of s.legend ?? []) {
    const sp = e.props ?? look.styles.get(e.style)?.props ?? {};
    const y = e.baseline;
    if (e.kind === 'line') {
      const sw = Math.min(num(sp.sw, 1.2), 1.6), stroke = col(look, sp.stroke ?? 'muted');
      const mk = sp.head === 'none' || sp.route === 'straight' ? 'none' : sp.head ?? 'arrow', head = mk !== 'none';
      const hm = marker(mk, { x: e.x + 28, y: y - 3 }, { x: e.x, y: y - 3 }, sw, stroke, col(look, look.canvas.paper ?? 'paper'));
      const dash = sp.dash && sp.dash !== 'none' ? ` stroke-dasharray="${esc(sp.dash)}"` : '';
      out.push(R.amt ? sketchSvg(`M ${e.x},${y - 3} L ${r2(e.x + 28 - hm.trim)},${y - 3}`, `fill="none" stroke="${stroke}" stroke-width="${sw}"${dash}`, R.amt * 0.6)
        : `<line x1="${e.x}" y1="${y - 3}" x2="${r2(e.x + 28 - hm.trim)}" y2="${y - 3}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`);
      if (head) out.push(hm.svg);
    } else if (e.kind === 'text') {
      const t = textAttrs(look, { ...sp, size: String(Math.min(num(sp.size, 12), 11)) }, '', { font: 'sans', size: 11, weight: 400, color: 'ink' });
      out.push(`<text x="${e.x}" y="${y}" ${t.a}>Aa</text>`);
    } else {
      const a = strokeAttrs(look, { ...sp, sw: String(Math.min(num(sp.sw, 1), 1.2)) });
      const m = /^(\d+(?:\.\d+)?)x/.exec(sp.size ?? '');
      if (sp.shape === 'dot') out.push(`<circle cx="${e.x + 7}" cy="${y - 3}" r="4.5" ${a}/>`);
      else if (sp.shape === 'diamond') out.push(`<polygon points="${e.x + 11},${y - 9} ${e.x + 22},${y - 3} ${e.x + 11},${y + 3} ${e.x},${y - 3}" ${a}/>`);
      else if (m && +m[1] <= 12) out.push(`<rect x="${e.x + 5}" y="${y - 11}" width="4" height="14" ${a}/>`);
      else out.push(`<rect x="${e.x}" y="${y - 8}" width="14" height="10" rx="${num(sp.radius, 0) >= 12 ? 5 : 2}" ${a}/>`);
    }
    out.push(`<text x="${e.x + e.sample + 6}" y="${y}" ${it.a}>${esc(e.label)}</text>`);
  }
  return out.join('\n');
}

// A table box: a header band with the title, then rows of cells. Geometry comes from the scene.
function drawTable(look: Look, s: Shape): string {
  const p = s.p, out: string[] = [], rows = s.rows ?? [], cols = s.cols ?? [], headH = s.headH ?? 0;
  const paper = col(look, look.canvas.paper ?? 'paper'), stroke = col(look, p.stroke), sw = num(p.sw, 1);
  const r = Math.min(num(p.radius, 0), s.w / 2, s.h / 2), x2 = s.x + s.w;
  out.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"${r ? ` rx="${r}"` : ''} fill="${paper}"/>`);
  out.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"${r ? ` rx="${r}"` : ''} fill="${col(look, p.fill)}"/>`);
  if (headH) {
    const hy = s.y + headH;
    out.push(`<path d="M ${s.x},${hy} L ${s.x},${s.y + r} Q ${s.x},${s.y} ${s.x + r},${s.y} L ${x2 - r},${s.y} Q ${x2},${s.y} ${x2},${s.y + r} L ${x2},${hy} Z" fill="${col(look, p['head.fill'] ?? 'ink/0.06')}"/>`);
    const t = textAttrs(look, p, 'title.', { font: 'sans', size: 12, weight: 600, color: 'ink' });
    const txt = p['title.caps'] === '1' ? s.text!.toUpperCase() : s.text!;
    const tl = txt.split('\n'), tlh = Math.round(t.size * 1.25), left = p['title.align'] === 'left';
    tl.forEach((l, i) => out.push(`<text x="${left ? s.x + num(p['cell.pad'], 12) : s.x + s.w / 2}" y="${r2(hy - headH / 2 + t.size * 0.36 + (i - (tl.length - 1) / 2) * tlh)}" text-anchor="${left ? 'start' : 'middle'}" ${t.a}>${esc(l)}</text>`));
    if (rows.length) out.push(`<line x1="${s.x}" y1="${hy}" x2="${x2}" y2="${hy}" stroke="${stroke}" stroke-width="${sw}"/>`);
  }
  const first = textAttrs(look, p, 'cell.', { font: 'mono', size: 10, weight: 400, color: 'ink' });
  const rest = textAttrs(look, { ...p, 'cell.color': p['detail.color'] ?? 'muted' }, 'cell.', { font: 'mono', size: 10, weight: 400, color: 'muted' });
  const strong = textAttrs(look, { ...p, 'cell.weight': '600' }, 'cell.', { font: 'mono', size: 10, weight: 600, color: 'ink' });
  const center = p.align === 'center', rule = col(look, p.rule ?? 'ink/0.1');
  rows.forEach((row, i) => {
    if (row.kind === 'rule') { out.push(`<line x1="${s.x}" y1="${row.y}" x2="${x2}" y2="${row.y}" stroke="${stroke}" stroke-width="${sw}"/>`); return; }
    const fill = row.p.fill ?? (row.kind === 'head' ? p['head.fill'] ?? 'ink/0.06' : undefined);
    if (fill && fill !== 'none') out.push(`<rect x="${s.x + sw / 2}" y="${row.y}" width="${s.w - sw}" height="${row.h - (i === rows.length - 1 ? sw / 2 : 0)}" fill="${col(look, fill)}"/>`);
    const prev = rows[i - 1];
    if (prev && prev.kind !== 'rule' && p.rules !== '0') out.push(`<line x1="${s.x}" y1="${row.y}" x2="${x2}" y2="${row.y}" stroke="${rule}" stroke-width="0.8"/>`);
    row.cells.forEach((cell, j) => {
      const c = cols[j]; if (!c) return;
      // one cell can have its own tint and text colour: fill.2=accent/0.2 color.2=accent (columns count from 1)
      const cf = row.p[`fill.${j + 1}`], cc = row.p[`color.${j + 1}`], g = num(p['cell.gap'], 16);
      if (cf && cf !== 'none') {
        const x0 = j === 0 ? s.x + sw / 2 : s.x + c.x - g / 2, x1 = j === cols.length - 1 ? x2 - sw / 2 : s.x + cols[j + 1].x - g / 2;
        out.push(`<rect x="${r2(x0)}" y="${row.y}" width="${r2(x1 - x0)}" height="${row.h}" fill="${col(look, cf)}"/>`);
      }
      if (cell === '') return;
      const base = row.kind === 'head' ? strong : j === 0 ? first : rest;
      // a replacer function, never a replacement string: "$'" and "$`" in a colour from the file must stay plain text
      const a = cc ? { ...base, a: base.a.replace(/fill="[^"]*"/, () => `fill="${col(look, cc)}"`) } : base;
      const mid = center && j > 0;
      out.push(`<text x="${r2(s.x + c.x + (mid ? c.w / 2 : 0))}" y="${r2(row.y + row.h / 2 + a.size * 0.36)}"${mid ? ' text-anchor="middle"' : ''} ${a.a}>${esc(cell)}</text>`);
    });
  });
  if (p.grid === '1' && rows.length) for (const c of cols.slice(1)) {
    const gx = r2(s.x + c.x - num(p['cell.gap'], 16) / 2);
    out.push(`<line x1="${gx}" y1="${s.y + headH}" x2="${gx}" y2="${s.y + s.h}" stroke="${rule}" stroke-width="0.8"/>`);
  }
  let border = `fill="none" stroke="${stroke}"`;
  if (p.stroke && p.stroke !== 'none') border += ` stroke-width="${sw}"`;
  if (p.dash && p.dash !== 'none') border += ` stroke-dasharray="${esc(p.dash)}"`;
  out.push(roughOf(p) ? sketchSvg(rectD(s.x, s.y, s.w, s.h, r), border, roughOf(p)) : `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"${r ? ` rx="${r}"` : ''} ${border}/>`);
  return out.join('\n');
}

// Where a shape's icon goes and how far it pushes the text. Shared with the checker.
export function iconBox(s: Shape): { x: number; y: number; size: number; dx: number; dy: number } | null {
  const p = s.p;
  if (!p.icon || p.icon === 'none') return null;
  const hasText = !!(s.text || p.sub) && p['title.pos'] !== 'top';
  const size = num(p['icon.size'], hasText ? 20 : Math.max(8, Math.min(s.w, s.h, 96) - (s.style === 'icon' ? 0 : 16)));
  if (!hasText) return { x: s.x + (s.w - size) / 2, y: s.y + (s.h - size) / 2, size, dx: 0, dy: 0 };
  if (p['icon.pos'] === 'top') return { x: s.x + (s.w - size) / 2, y: 0, size, dx: 0, dy: (size + 6) / 2 }; // y set by the caller from the text block
  if (p['title.align'] === 'left' || p['title.align'] === 'right') return { x: s.x + 12, y: s.y + (s.h - size) / 2, size, dx: (size + 8) / 2, dy: 0 };
  // centred text: the icon sits right beside it, and the pair is centred in the box
  const widths = [
    ...(s.text ? s.text.split('\n') : []).map((l) => textWidth(p['title.caps'] === '1' ? l.toUpperCase() : l, num(p['title.size'], 12), p['title.font'] ?? 'sans', num(p['title.weight'], 600), num(p['title.spacing'], 0))),
    ...(p.sub ? p.sub.split('\n') : []).map((l) => textWidth(l, num(p['sub.size'], 9), p['sub.font'] ?? 'mono', 400, 0)),
  ];
  const tw = Math.max(0, ...widths), x = Math.max(s.x + 8, s.x + (s.w - (size + 8 + tw)) / 2);
  return { x, y: s.y + (s.h - size) / 2, size, dx: (size + 8) / 2, dy: 0 };
}

// An outline icon is drawn with icon.color as its line, icon.fill inside its closed parts (none by default),
// and icon.width as the line's thickness in pixels at the size it is drawn. A duotone icon is the outline
// over a tint of its main enclosed parts: icon.fill when the look or the box sets one, else icon.color, light.
function drawIcon(look: Look, p: Props, x: number, y: number, size: number): string {
  const name = p.icon, img = look.images.get(name);
  // an icon file is shown as an image, in its own colours; it is never inlined
  if (img) return isIconUri(img) ? `<image x="${r2(x)}" y="${r2(y)}" width="${r2(size)}" height="${r2(size)}" href="${esc(img)}"/>` : '';
  const solid = p['icon.style'] === 'solid' ? SOLID_ICONS[name] : undefined;
  if (solid) {
    // a solid icon is one filled shape in icon.color; icon.fill and icon.width have nothing to act on
    const ks = size / SOLID_BOX, ink = col(look, p['icon.color'] ?? p['title.color'] ?? 'ink');
    return `<g transform="translate(${r2(x)} ${r2(y)}) scale(${+ks.toFixed(5)})" fill="${ink}">${solid.map((d) => `<path d="${esc(d)}"/>`).join('')}</g>`;
  }
  const k = r2(size / 24);
  const stroke = col(look, p['icon.color'] ?? p['title.color'] ?? 'ink'), fill = col(look, p['icon.fill'] ?? 'none');
  const px = num(p['icon.width'], 0), sw = px > 0 ? Math.min(px, 8) / k : Math.max(1.5, 1.2 / k);
  const outline = look.icons.get(name) ?? [], paths = outline.map((d) => `<path d="${esc(d)}"/>`).join('');
  // the tint belongs to the built-in outline; a look that redraws the icon gets its outline alone
  const tint = p['icon.style'] === 'duotone' && outline === ICONS[name] ? DUOTONE_ICONS[name] : undefined;
  if (p['icon.style'] === 'duotone') {
    const own = p['icon.fill'] && p['icon.fill'] !== 'none';
    const under = tint ? `<path d="${tint}" fill="${own ? fill : stroke}"${own ? '' : ' fill-opacity="0.2"'} stroke="none"/>` : '';
    return `<g transform="translate(${r2(x)} ${r2(y)}) scale(${k})">${under}<g fill="none" stroke="${stroke}" stroke-width="${r2(sw)}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></g>`;
  }
  return `<g transform="translate(${r2(x)} ${r2(y)}) scale(${k})" fill="${fill}" stroke="${stroke}" stroke-width="${r2(sw)}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
}

// An icon that is the shape itself, with no box around it: fill=, stroke= and sw= style the icon,
// and its text is a caption centred underneath (captionBox in scene.ts measures it the same way).
function drawIconShape(look: Look, s: Shape): string {
  const p = s.p, size = Math.min(s.w, s.h), out: string[] = [];
  const ip: Props = { ...p, 'icon.fill': p.fill ?? p['icon.fill'] ?? 'none', 'icon.color': p.stroke ?? p['icon.color'] ?? 'ink', 'icon.width': p.sw ?? p['icon.width'] ?? '' };
  if (p.icon && p.icon !== 'none') out.push(drawIcon(look, ip, s.x + (s.w - size) / 2, s.y + (s.h - size) / 2, size));
  const cx = s.x + s.w / 2;
  let y = s.y + s.h + ICON_CAPTION_GAP;
  if (s.text) {
    const t = textAttrs(look, p, 'title.', { font: 'sans', size: 11, weight: 600, color: 'ink' }), lh = Math.round(t.size * 1.17);
    (p['title.caps'] === '1' ? s.text.toUpperCase() : s.text).split('\n').forEach((l) => { out.push(`<text x="${cx}" y="${r2(y + t.size * 0.86)}" text-anchor="middle" ${t.a}>${esc(l)}</text>`); y += lh; });
  }
  if (p.sub) {
    const t = textAttrs(look, p, 'sub.', { font: 'mono', size: 9, weight: 400, color: 'muted' }), lh = Math.round(t.size * 1.3);
    y += 2;
    p.sub.split('\n').forEach((l) => { out.push(`<text x="${cx}" y="${r2(y + t.size * 0.86)}" text-anchor="middle" ${t.a}>${esc(l)}</text>`); y += lh; });
  }
  return out.join('\n');
}

function drawShape(look: Look, s: Shape): string {
  if (s.shape === 'legend') return drawLegend(look, s);
  if (s.shape === 'table') return drawTable(look, s);
  if (s.shape === 'chart') return drawChart(look, s);
  if (s.shape === 'icon') return drawIconShape(look, s);
  const p = s.p, out: string[] = [];
  const paper = col(look, look.canvas.paper ?? 'paper');
  if (!s.back && p.mask !== '0' && p.fill && p.fill !== 'none') out.push(outline(s, `fill="${paper}"`));
  out.push(outline(s, strokeAttrs(look, p), hatchFill(look, p) ?? undefined));
  let cxm = s.x + s.w / 2, cym = s.y + s.h / 2;
  if (s.shape === 'polygon' && s.poly && s.p.open !== '1') {
    // text sits at the centre of the outline's area, so it lands in the wide part of a triangle
    let A = 0, gx = 0, gy = 0;
    s.poly.forEach((q, i) => { const n = s.poly![(i + 1) % s.poly!.length], k = q.x * n.y - n.x * q.y; A += k; gx += (q.x + n.x) * k; gy += (q.y + n.y) * k; });
    if (Math.abs(A) > 1) { cxm = r2(gx / (3 * A)); cym = r2(gy / (3 * A)); }
  }
  if (s.shape === 'arc' && Math.abs(num(p.to, 360) - num(p.from, 0)) < 360) {
    // text sits in the middle of the slice, not the middle of the whole circle
    const mid = ((num(p.from, 0) + num(p.to, 360)) / 2) * (Math.PI / 180), inner = num(p.inner, 0), k = inner > 0 ? (1 + inner) / 2 : 0.62;
    cxm = r2(cxm + (s.w / 2) * k * Math.sin(mid)); cym = r2(cym - (s.h / 2) * k * Math.cos(mid));
  }
  if (p.ghost) {
    const t = textAttrs(look, p, 'ghost.', { font: 'mono', size: 32, weight: 600, color: 'ink/0.06' });
    out.push(`<text x="${s.x + s.w - 8}" y="${s.y + s.h - 4}" text-anchor="end" ${t.a}>${esc(p.ghost)}</text>`);
  }
  const title = textAttrs(look, p, 'title.', { font: 'sans', size: 12, weight: 600, color: 'ink' });
  const tb = p.tag ? tagLayout(s, look, textBlock(s, title.size), title.size, cym + (iconBox(s)?.dy ?? 0)) : null;
  if (tb) {
    const t = textAttrs(look, p, 'tag.', { font: 'mono', size: 7, weight: 400, color: 'muted' });
    const tw = tagWidth(look, p);
    out.push(`<rect x="${s.x + tb.x}" y="${s.y + tb.y}" width="${tw}" height="${tb.h}" rx="2" fill="none" stroke="${col(look, p['tag.border'] ?? 'muted/0.4')}" stroke-width="0.8"/>`);
    out.push(`<text x="${s.x + tb.x + tw / 2}" y="${r2(s.y + tb.y + tb.h / 2 + t.size * 0.36)}" text-anchor="middle" ${t.a}>${esc(p.tag)}</text>`);
  }
  const ib = iconBox(s);
  if (ib) { cxm += ib.dx; cym += ib.dy; }
  if (ib && !(ib.dy > 0)) out.push(drawIcon(look, p, ib.x, ib.y, ib.size));
  if (s.text && p['title.pos'] === 'top') {
    const txt = p['title.caps'] === '1' ? s.text.toUpperCase() : s.text;
    const tw = Math.ceil((textWidth(txt, title.size, title.font, title.weight, title.spacing) + 12) / 4) * 4;
    // a caption on the top edge: centred, or at the left or right corner with title.align
    const al = p['title.align'], mid = al === 'left' ? s.x + 12 + tw / 2 : al === 'right' ? s.x + s.w - 12 - tw / 2 : cxm;
    out.push(`<rect x="${mid - tw / 2}" y="${s.y + 4}" width="${tw}" height="12" rx="2" fill="${paper}"/>`);
    out.push(`<text x="${mid}" y="${s.y + 13}" text-anchor="middle" ${title.a}>${esc(txt)}</text>`);
  } else if (s.text || p.sub) {
    const lines = s.text ? (p['title.caps'] === '1' ? s.text.toUpperCase() : s.text).split('\n') : [];
    const lh = Math.round(title.size * 1.17);
    const sub = textAttrs(look, p, 'sub.', { font: 'mono', size: 9, weight: 400, color: 'muted' });
    const subs = p.sub ? p.sub.split('\n') : [], slh = Math.round(sub.size * 1.3);
    const block = lines.length * lh + (subs.length ? sub.size + 7 + (subs.length - 1) * slh : 0);
    // centred a little low under a corner tag, and never closer than 3px below it
    const top = tb ? tb.top : cym - block / 2;
    if (ib && ib.dy > 0) out.push(drawIcon(look, p, ib.x, top - ib.size - 6, ib.size));
    const al = p['title.align'], tx = al === 'left' ? s.x + 12 + (ib && ib.dx ? ib.size + 8 : 0) : al === 'right' ? s.x + s.w - 12 : cxm, anchor = al === 'left' ? 'start' : al === 'right' ? 'end' : 'middle';
    lines.forEach((l, i) => out.push(`<text x="${tx}" y="${r2(top + title.size * 0.86 + i * lh)}" text-anchor="${anchor}" ${title.a}>${esc(l)}</text>`));
    subs.forEach((l, i) => out.push(`<text x="${tx}" y="${r2(top + lines.length * lh + sub.size + 3 + i * slh)}" text-anchor="${anchor}" ${sub.a}>${esc(l)}</text>`));
  }
  return out.join('\n');
}

function pathD(pts: Pt[], radius: number, trimEnd: number, trimStart: number): string {
  const P = pts.map((p) => ({ ...p }));
  const trim = (i: number, j: number, by: number) => {
    const dx = P[j].x - P[i].x, dy = P[j].y - P[i].y, len = Math.hypot(dx, dy);
    if (len > by + 1) { P[i].x += (dx / len) * by; P[i].y += (dy / len) * by; }
  };
  if (trimEnd) trim(P.length - 1, P.length - 2, trimEnd);
  if (trimStart) trim(0, 1, trimStart);
  let d = `M ${r2(P[0].x)},${r2(P[0].y)}`;
  for (let i = 1; i < P.length; i++) {
    const cur = P[i], prev = P[i - 1], next = P[i + 1];
    if (!next || !radius) { d += ` L ${r2(cur.x)},${r2(cur.y)}`; continue; }
    const l1 = Math.hypot(cur.x - prev.x, cur.y - prev.y), l2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const a = { x: cur.x - ((cur.x - prev.x) / l1) * r, y: cur.y - ((cur.y - prev.y) / l1) * r };
    const b = { x: cur.x + ((next.x - cur.x) / l2) * r, y: cur.y + ((next.y - cur.y) / l2) * r };
    d += ` L ${r2(a.x)},${r2(a.y)} Q ${cur.x},${cur.y} ${r2(b.x)},${r2(b.y)}`;
  }
  return d;
}

// How tall a shape's title and sub lines are together.
export function textBlock(s: Shape, titleSize: number): number {
  const p = s.p, subSize = num(p['sub.size'], 9), subs = p.sub ? p.sub.split('\n').length : 0;
  const lines = s.text ? s.text.split('\n').length : 0;
  return lines * Math.round(titleSize * 1.17) + (subs ? subSize + 7 + (subs - 1) * Math.round(subSize * 1.3) : 0);
}

// Where a corner tag and the text under it sit on a shape. The tag keeps clear of the outline (further
// from a hand-drawn one, whose wobble would touch it) and is as tall as its text needs; the text block
// sits a little below centre, moved down to start 3px under the tag. A box short of room first gives up
// some margin (the tag 2px higher, the text 2px nearer the bottom); fits says whether that was enough.
export function tagLayout(s: Shape, look: Look, block: number, titleSize: number, cym: number) {
  const p = s.p, rough = p.sketch === '0' ? 0 : Math.max(0, Math.min(num(look.canvas.sketch, 0), 4));
  const x = 8 + (rough ? 2 : 0), h = Math.max(12, Math.ceil(num(p['tag.size'], 7) + 4)), glyph = titleSize * 0.14;
  // on a shape that is not a box (a cylinder's cap, an ellipse, a diamond) the tag moves down off the outline
  const below = outlineClear(s, x, tagWidth(look, p), h, 6, 3 + rough);
  const at = (y: number, pad: number) => {
    const clear = s.y + y + h + 3 - glyph, floor = s.y + s.h - pad - block;
    return { y, top: Math.min(Math.max(cym - block / 2 + 8, clear), Math.max(floor, cym - block / 2)), fits: clear <= floor + 0.5 };
  };
  const roomy = at(Math.max(8, below), 4), tight = roomy.fits ? roomy : at(Math.max(6, below), 2);
  if (!roomy.fits && !tight.fits) {
    // the centred lines level with the tag start right of it: the two never touch, so the text keeps its place
    const y = Math.max(8, below), top = Math.min(cym - block / 2 + 8, Math.max(s.y + s.h - 4 - block, cym - block / 2));
    if (besideTag(s, look, x + tagWidth(look, p), s.y + y - 2, s.y + y + h + 2, top)) return { x, h, y, top, fits: true };
  }
  return { x, h, ...(tight.fits ? tight : roomy) };
}

// Whether every line of a shape's centred text that is level with y0..y1 starts at least 2px right of
// `right` (measured from the shape's left), with the text block starting at `top`.
function besideTag(s: Shape, look: Look, right: number, y0: number, y1: number, top: number): boolean {
  const p = s.p;
  if (p['title.align'] || p.icon) return false;
  const title = textAttrs(look, p, 'title.', { font: 'sans', size: 12, weight: 600, color: 'ink' });
  const sub = textAttrs(look, p, 'sub.', { font: 'mono', size: 9, weight: 400, color: 'muted' });
  const lines = s.text ? (p['title.caps'] === '1' ? s.text.toUpperCase() : s.text).split('\n') : [];
  const lh = Math.round(title.size * 1.17), slh = Math.round(sub.size * 1.3), subs = p.sub ? p.sub.split('\n') : [];
  // each line's ink, from its cap top to just under its baseline
  const rows = [
    ...lines.map((l, i) => ({ w: textWidth(l, title.size, title.font, title.weight, title.spacing), a: top + i * lh + title.size * 0.14, b: top + i * lh + title.size * 1.05 })),
    ...subs.map((l, i) => { const base = top + lines.length * lh + sub.size + 3 + i * slh; return { w: textWidth(l, sub.size, sub.font, 400, sub.spacing), a: base - sub.size * 0.75, b: base + sub.size * 0.2 }; }),
  ];
  return rows.every((r) => r.b < y0 || r.a > y1 || s.w / 2 - r.w / 2 >= right + 2);
}

// How wide a shape's corner tag is.
export function tagWidth(look: Look, p: Props): number {
  const t = textAttrs(look, p, 'tag.', { font: 'mono', size: 7, weight: 400, color: 'muted' });
  return Math.ceil((textWidth(p.tag ?? '', t.size, t.font, 400, t.spacing) + 12) / 4) * 4;
}

// Points along a shape's outline, relative to its top-left corner; null for a plain box.
function outlinePts(s: Shape): Pt[] | null {
  const { w, h } = s, out: Pt[] = [];
  const line = (a: Pt, b: Pt) => { const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2)); for (let i = 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }); };
  if (s.shape === 'ellipse') { for (let i = 0; i < 180; i++) { const t = (i / 180) * 2 * Math.PI; out.push({ x: w / 2 + (w / 2) * Math.cos(t), y: h / 2 + (h / 2) * Math.sin(t) }); } return out; }
  if (s.shape === 'diamond') { const c = [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }]; c.forEach((a, i) => line(a, c[(i + 1) % 4])); return out; }
  if (s.shape === 'polygon' && s.poly) { const c = s.poly.map((q) => ({ x: q.x - s.x, y: q.y - s.y })); c.forEach((a, i) => line(a, c[(i + 1) % c.length])); return out; }
  if (s.shape === 'path' && s.p.path) {
    // path data in 0..1 of the box, absolute M L C Z, as looks write it
    const tok = s.p.path.match(/[MLCZ]|-?\d*\.?\d+/gi) ?? [];
    let cmd = 'M', cur: Pt = { x: 0, y: 0 }, start = cur, i = 0;
    const pt = () => ({ x: +tok[i++] * w, y: +tok[i++] * h });
    while (i < tok.length) {
      if (/[a-z]/i.test(tok[i])) { cmd = tok[i++].toUpperCase(); if (cmd === 'Z') { line(cur, start); cur = start; } continue; }
      if (cmd === 'M') { cur = start = pt(); cmd = 'L'; }
      else if (cmd === 'L') { const b = pt(); line(cur, b); cur = b; }
      else if (cmd === 'C') {
        const c1 = pt(), c2 = pt(), b = pt();
        for (let k = 1; k <= 24; k++) { const t = k / 24, m = 1 - t; const q = { x: m * m * m * cur.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * b.x, y: m * m * m * cur.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * b.y }; line(out.length ? out[out.length - 1] : cur, q); }
        cur = b;
      } else i++;
    }
    return out;
  }
  return null;
}

// The smallest top offset, from `from`, at which a tag of w x h at left offset x keeps `gap` clear of
// the shape's outline (0 for a plain box, which has nothing inside to avoid).
function outlineClear(s: Shape, x: number, w: number, h: number, from: number, gap: number): number {
  const pts = outlinePts(s);
  if (!pts) return 0;
  for (let y = from; y < s.h / 2; y++) {
    if (!pts.some((q) => q.x > x - gap && q.x < x + w + gap && q.y > y - gap && q.y < y + h + gap)) return y;
  }
  return 0;
}

// An end marker drawn at tip, pointing away from `from`. trim is how much of the line to cut back so it
// does not show through the marker.
function marker(kind: string, tip: Pt, from: Pt, sw: number, stroke: string, paper: string): { svg: string; trim: number } {
  const dx = tip.x - from.x, dy = tip.y - from.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // heads are one size whatever the line's weight, so a bold line and a thin one in the same diagram
  // carry the same arrow
  // a point `back` along the line from the tip and `side` across it
  const at = (back: number, side: number) => `${r2(tip.x - ux * back - uy * side)},${r2(tip.y - uy * back + ux * side)}`;
  const line = `fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  const hollow = `fill="${paper}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"`;
  const bar = (b: number) => `<path d="M ${at(b, 6)} L ${at(b, -6)}" ${line}/>`;
  const ring = (b: number, r: number, a: string) => `<circle cx="${r2(tip.x - ux * b)}" cy="${r2(tip.y - uy * b)}" r="${r}" ${a}/>`;
  const crow = `<path d="M ${at(0, 6)} L ${at(12, 0)} L ${at(0, -6)}" ${line}/>`;
  if (R.amt && (kind === 'arrow' || kind === 'open')) {
    // drawn by hand an arrowhead is two quick strokes, a little larger than the clean one
    const b = 13, w = 6;
    return { svg: sketchSvg(`M ${at(b, w)} L ${at(0, 0)} L ${at(b, -w)}`, `fill="none" stroke="${stroke}" stroke-width="${sw}"`, R.amt * 0.6), trim: 0 };
  }
  switch (kind) {
    case 'none': return { svg: '', trim: 0 };
    case 'open': return { svg: `<path d="M ${at(10, 5)} L ${at(0, 0)} L ${at(10, -5)}" ${line}/>`, trim: 0 };
    case 'triangle': return { svg: `<polygon points="${at(0, 0)} ${at(11, 6)} ${at(11, -6)}" ${hollow}/>`, trim: 11 };
    case 'diamond': return { svg: `<polygon points="${at(0, 0)} ${at(8, 4.5)} ${at(16, 0)} ${at(8, -4.5)}" ${hollow}/>`, trim: 16 };
    case 'diamond-solid': return { svg: `<polygon points="${at(0, 0)} ${at(8, 4.5)} ${at(16, 0)} ${at(8, -4.5)}" fill="${stroke}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`, trim: 16 };
    case 'dot': return { svg: ring(3.5, 3.5, `fill="${stroke}"`), trim: 3.5 };
    case 'circle': return { svg: ring(4, 4, hollow), trim: 8 };
    case 'one': return { svg: bar(8), trim: 0 };
    case 'only-one': return { svg: bar(7) + bar(12), trim: 0 };
    case 'many': return { svg: crow, trim: 0 };
    case 'one-many': return { svg: crow + bar(16), trim: 0 };
    case 'zero-one': return { svg: bar(8) + ring(16, 4, hollow), trim: 0 };
    case 'zero-many': return { svg: crow + ring(17, 4, hollow), trim: 0 };
    default: return { svg: `<polygon points="${at(0, 0)} ${at(10, 4)} ${at(10, -4)}" fill="${stroke}"/>`, trim: 7 };
  }
}

// The point `dist` back along a polyline from its last point (or the first one, if it is the farthest).
function backAlong(pts: Pt[], dist: number): Pt {
  let left = dist;
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i], b = pts[i - 1], l = Math.hypot(a.x - b.x, a.y - b.y);
    if (l >= left) return { x: a.x + ((b.x - a.x) / l) * left, y: a.y + ((b.y - a.y) / l) * left };
    left -= l;
  }
  return pts[0];
}

// A polyline cut back by `dist` at its end, across as many steps as that takes.
function cutEnd(pts: Pt[], dist: number): Pt[] {
  if (!dist) return pts;
  let left = dist;
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i], b = pts[i - 1], l = Math.hypot(a.x - b.x, a.y - b.y);
    if (l > left) return [...pts.slice(0, i), { x: a.x + ((b.x - a.x) / l) * left, y: a.y + ((b.y - a.y) / l) * left }];
    left -= l;
  }
  return pts.slice(0, 2);
}

function drawConn(look: Look, c: Conn): string {
  const p = c.p, sw = num(p.sw, 1.2), stroke = col(look, p.stroke ?? 'muted');
  const n = c.pts.length, paper = col(look, look.canvas.paper ?? 'paper');
  // a curve is many short steps: aim its ends along the last stretch of it, not the last step alone
  const hFrom = c.curve ? backAlong(c.pts, 10) : c.pts[n - 2], tFrom = c.curve ? backAlong([...c.pts].reverse(), 10) : c.pts[1];
  const head = marker(c.headM, c.pts[n - 1], hFrom, sw, stroke, paper), tail = marker(c.tailM, c.pts[0], tFrom, sw, stroke, paper);
  const d = c.curve
    ? pathD(cutEnd(cutEnd(c.pts, head.trim).reverse(), tail.trim).reverse(), 0, 0, 0)
    : pathD(c.pts, c.ortho ? num(p.radius, 8) : 0, head.trim, tail.trim);
  const a = `fill="none" stroke="${stroke}" stroke-width="${sw}"${p.dash && p.dash !== 'none' ? ` stroke-dasharray="${esc(p.dash)}"` : ''}`;
  let s = roughOf(p) ? sketchSvg(d, a, roughOf(p)) : `<path d="${d}" ${a}/>`;
  if (head.svg) s += '\n' + head.svg;
  if (tail.svg) s += '\n' + tail.svg;
  return s;
}

function drawLabel(look: Look, c: Conn): string {
  const l = c.label!;
  const paper = col(look, look.canvas.paper ?? 'paper');
  const fill = col(look, c.p['label.color'] ?? c.p.stroke ?? 'muted');
  return `<rect x="${r2(l.x)}" y="${r2(l.y)}" width="${l.w}" height="${l.h}" rx="2" fill="${paper}"/>\n` +
    `<text x="${r2(l.cx)}" y="${r2(l.baseline)}" text-anchor="middle" font-family="${fam(look, l.font)}" font-size="${l.size}" fill="${fill}"${l.spacing ? ` letter-spacing="${r2(l.spacing * l.size)}"` : ''}>${esc(l.text)}</text>`;
}

function drawText(look: Look, t: TextEl): string {
  const a = textAttrs(look, t.p, '', { font: 'sans', size: 12, weight: 400, color: 'ink' });
  const anchor = t.p.anchor && t.p.anchor !== 'start' ? ` text-anchor="${esc(t.p.anchor)}"` : '';
  const rot = num(t.p.rotate, 0);
  const body = t.text.split('\n').map((l, i) => `<text x="${t.ax}" y="${r2(t.ay + i * a.size * 1.3)}"${anchor} ${a.a}>${esc(l)}</text>`).join('\n');
  return rot === 90 || rot === -90 ? `<g transform="rotate(${rot} ${t.ax} ${t.ay})">${body}</g>` : body;
}

// background: false leaves the page out (no paper, no dots), for an image laid over something else
export function renderBody(sc: Scene, background = true): string {
  const look = sc.look, cv = look.canvas;
  const out: string[] = [];
  R = { amt: Math.max(0, Math.min(num(cv.sketch, 0), 4)), defs: new Map() };
  if (background) out.push(`<rect class="fd-page" x="${sc.x}" y="${sc.y}" width="${sc.w}" height="${sc.h}" fill="${col(look, cv.paper ?? 'paper')}"/>`);
  if (background && cv.dots && cv.dots !== 'none') {
    const gap = num(cv.dotgap, 22);
    out.push(`<defs><pattern id="fd-dots" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.9" fill="${col(look, cv.dots)}"/></pattern></defs>`);
    out.push(`<rect class="fd-page" x="${sc.x}" y="${sc.y}" width="${sc.w}" height="${sc.h}" fill="url(#fd-dots)"/>`);
  }
  for (const s of sc.shapes) if (s.back) out.push(drawShape(look, s));
  // lines go under the shapes, except those marked layer=front (an edge drawn on a face)
  const under = sc.conns.filter((c) => c.p.layer !== 'front'), over = sc.conns.filter((c) => c.p.layer === 'front');
  for (const c of under) out.push(drawConn(look, c));
  for (const c of under) if (c.label) out.push(drawLabel(look, c));
  for (const s of sc.shapes) if (!s.back) out.push(drawShape(look, s));
  for (const c of over) out.push(drawConn(look, c));
  for (const c of over) if (c.label) out.push(drawLabel(look, c));
  for (const t of sc.texts) out.push(drawText(look, t));
  if (R.defs.size) out.splice(1, 0, `<defs>${hatchDefs()}</defs>`);
  return out.join('\n');
}

// css: optional stylesheet text (e.g. embedded @font-face rules) placed inside the SVG.
export function renderSvg(sc: Scene, css?: string, opts: { background?: boolean } = {}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sc.x} ${sc.y} ${sc.w} ${sc.h}" width="${sc.w}" height="${sc.h}">\n` +
    (css ? `<style>${css.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</style>\n` : '') + renderBody(sc, opts.background ?? true) + '\n</svg>';
}
