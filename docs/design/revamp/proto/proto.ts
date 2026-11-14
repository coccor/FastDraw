// Design-doc prototypes, not product code. Each function below draws the same resolved diagram
// (FastDraw's own layout: boxes, zones, routed lines) in a different drawing language, to compare
// styles before any of them is built into the renderer.
//   node docs/design/revamp/proto/proto.ts <diagram.fdraw> <out-prefix>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { buildScene, type Scene, type Shape, type Conn, type Pt, type TextEl } from '../../../../src/scene.ts';
import { Resvg } from '@resvg/resvg-js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONTS = new URL('../../../../fonts/', import.meta.url).pathname;

type Txt = { font: string; size: number; weight?: number; fill: string; italic?: boolean; spacing?: number; anchor?: string };
const text = (x: number, y: number, s: string, t: Txt) =>
  `<text x="${x}" y="${y}" font-family="${t.font}" font-size="${t.size}" font-weight="${t.weight ?? 400}" fill="${t.fill}"${t.italic ? ' font-style="italic"' : ''}${t.spacing ? ` letter-spacing="${t.spacing}"` : ''} text-anchor="${t.anchor ?? 'middle'}">${esc(s)}</text>`;

// a routed line as a path with rounded corners, optionally stopping short of its end (for a head)
function route(pts: Pt[], r: number, trim = 0): string {
  const p = pts.map((q) => ({ ...q }));
  if (trim && p.length > 1) {
    const a = p[p.length - 2], b = p[p.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    b.x -= ((b.x - a.x) / L) * Math.min(trim, L - 1); b.y -= ((b.y - a.y) / L) * Math.min(trim, L - 1);
  }
  let d = `M${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length; i++) {
    const cur = p[i], prev = p[i - 1], next = p[i + 1];
    if (!next || !r) { d += ` L${cur.x} ${cur.y}`; continue; }
    const l1 = Math.hypot(cur.x - prev.x, cur.y - prev.y), l2 = Math.hypot(next.x - cur.x, next.y - cur.y), k = Math.min(r, l1 / 2, l2 / 2);
    const ax = cur.x - ((cur.x - prev.x) / l1) * k, ay = cur.y - ((cur.y - prev.y) / l1) * k;
    const bx = cur.x + ((next.x - cur.x) / l2) * k, by = cur.y + ((next.y - cur.y) / l2) * k;
    d += ` L${ax} ${ay} Q${cur.x} ${cur.y} ${bx} ${by}`;
  }
  return d;
}
// a triangular head at the end of a line: len long, half wide to each side
function head(pts: Pt[], len: number, half: number, fill: string, extra = ''): string {
  const a = pts[pts.length - 2], b = pts[pts.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, bx = b.x - ux * len, by = b.y - uy * len;
  return `<path d="M${b.x} ${b.y} L${bx - uy * half} ${by + ux * half} L${bx + uy * half} ${by - ux * half} Z" fill="${fill}" ${extra}/>`;
}
function icon(sc: Scene, name: string | undefined, x: number, y: number, size: number, stroke: string, sw = 1.6): string {
  const paths = name ? sc.look.icons.get(name) : undefined;
  if (!paths) return '';
  return `<g transform="translate(${x},${y}) scale(${size / 24})" fill="none" stroke="${stroke}" stroke-width="${sw / (size / 24)}" stroke-linecap="round" stroke-linejoin="round">${paths.map((d) => `<path d="${d}"/>`).join('')}</g>`;
}
// name, second line and icon of a box, centred as a group
function label(sc: Scene, s: Shape, o: { title: Txt; sub: Txt; iconColor: string; iconSize?: number; lead?: number; dy?: number; caps?: boolean }): string {
  const lines = (s.text ?? '').split('\n').map((l) => (o.caps ? l.toUpperCase() : l)), sub = s.p.sub, isz = o.iconSize ?? 20;
  const widest = Math.max(...lines.map((l) => l.length * o.title.size * 0.58), sub ? sub.length * o.sub.size * 0.52 : 0);
  const hasIcon = !!(s.p.icon && sc.look.icons.get(s.p.icon));
  const group = widest + (hasIcon ? isz + 10 : 0);
  const tx = s.x + s.w / 2 + (hasIcon ? (isz + 10) / 2 : 0), lead = o.lead ?? o.title.size * 1.25;
  const block = lines.length * lead + (sub ? o.sub.size + 5 : 0);
  let y = s.y + s.h / 2 - block / 2 + o.title.size * 0.82 + (o.dy ?? 0);
  let out = hasIcon ? icon(sc, s.p.icon, s.x + s.w / 2 - group / 2, s.y + s.h / 2 - isz / 2 + (o.dy ?? 0), isz, o.iconColor) : '';
  for (const l of lines) { out += text(tx, y, l, o.title); y += lead; }
  if (sub) out += text(tx, y - lead + o.sub.size + 6, sub, o.sub);
  return out;
}
const kind = (s: Shape) => (s.style.startsWith('sticky') ? 'sticky' : s.back || s.style === 'zone' ? 'zone' : s.shape === 'legend' ? 'legend' : ['focal', 'terminal-focal'].includes(s.style) ? 'focal' : s.style === 'store' ? 'store' : s.style === 'external' || s.style === 'optional' ? 'external' : s.style === 'cloud' ? 'cloud' : 'node');
const lineKind = (c: Conn) => (c.style === 'primary' ? 'primary' : c.style === 'link' ? 'link' : c.style === 'return' ? 'return' : c.head ? 'arrow' : 'rule');
const freeText = (t: TextEl) => ({ size: +(t.p.size ?? 12) || 12, role: t.style === 'h1' ? 'h1' : t.style === 'dek' ? 'dek' : t.p.caps === '1' ? 'caps' : 'text', anchor: t.p.anchor === 'middle' ? 'middle' : t.p.anchor === 'end' ? 'end' : 'start' });
const frame = (sc: Scene, h: number, bg: string, defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sc.x} ${sc.y} ${sc.w} ${h}" width="${sc.w}" height="${h}"><defs>${defs}</defs><rect x="${sc.x}" y="${sc.y}" width="${sc.w}" height="${h}" fill="${bg}"/>${body}</svg>`;

// ---------------------------------------------------------------------------------------------
// 1. Keys: every box is a solid key you could press. A coloured side shows its depth.
function keys(sc: Scene, h: number): string {
  const ink = '#1c1a2e', D = 7, sans = 'Geist';
  const faces: Record<string, [string, string, string]> = { // face, side, text
    node: ['#ffffff', '#c3c8d8', ink], focal: ['#6d4aff', '#4326c9', '#ffffff'], store: ['#bff0df', '#6fcab0', ink], cloud: ['#cfe3ff', '#8db5ee', ink], sticky: ['#ffe27a', '#e0b93a', ink],
  };
  let o = '';
  for (const s of sc.shapes) {
    const k = kind(s);
    if (k === 'zone') {
      o += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="18" fill="#dfe2ec"/><rect x="${s.x}" y="${s.y + 4}" width="${s.w}" height="${s.h - 4}" rx="18" fill="#e9ebf3"/>`;
      o += text(s.x + 18, s.y + 24, s.text ?? '', { font: sans, size: 12, weight: 600, fill: '#6b6f86', anchor: 'start' });
    }
  }
  for (const c of sc.conns) {
    const k = lineKind(c), col = k === 'primary' ? '#6d4aff' : k === 'link' ? '#2f7de1' : ink, w = k === 'primary' ? 5 : k === 'rule' ? 1.5 : 3;
    o += `<path d="${route(c.pts, 10, c.head ? 9 : 0)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${k === 'return' ? ' stroke-dasharray="1 8"' : ''}${k === 'rule' ? ' opacity=".25"' : ''}/>`;
    if (c.head) o += head(c.pts, 13, 7.5, col, `stroke="${col}" stroke-width="2" stroke-linejoin="round"`);
    if (c.label) {
      const lw = c.label.text.length * 6.3 + 18;
      o += `<rect x="${c.label.cx - lw / 2}" y="${c.label.baseline - 13}" width="${lw}" height="19" rx="9.5" fill="#fff" stroke="${col}" stroke-width="1.5"/>` + text(c.label.cx, c.label.baseline + 0.5, c.label.text, { font: sans, size: 10.5, weight: 600, fill: col });
    }
  }
  for (const s of sc.shapes) {
    const k = kind(s);
    if (k === 'zone' || k === 'legend') continue;
    if (k === 'external') {
      o += `<rect x="${s.x}" y="${s.y + D / 2}" width="${s.w}" height="${s.h}" rx="12" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>`;
      o += label(sc, s, { title: { font: sans, size: 13, weight: 600, fill: ink }, sub: { font: sans, size: 10.5, fill: '#6b6f86' }, iconColor: ink, dy: D / 2 });
      continue;
    }
    const [face, side, tc] = faces[k] ?? faces.node, r = k === 'store' ? 30 : 12, rot = k === 'sticky' ? ` transform="rotate(-2 ${s.x + s.w / 2} ${s.y + s.h / 2})"` : '';
    o += `<g${rot}><rect x="${s.x}" y="${s.y + D}" width="${s.w}" height="${s.h}" rx="${r}" fill="${side}" stroke="${ink}" stroke-width="2"/><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${r}" fill="${face}" stroke="${ink}" stroke-width="2"/>`;
    o += label(sc, s, { title: { font: sans, size: 13, weight: 600, fill: tc }, sub: { font: sans, size: 10.5, fill: tc === '#ffffff' ? 'rgba(255,255,255,.85)' : '#6b6f86' }, iconColor: tc }) + '</g>';
  }
  for (const t of sc.texts) {
    const f = freeText(t);
    o += text(t.ax, t.ay, f.role === 'caps' ? t.text.toUpperCase() : t.text, f.role === 'h1' ? { font: sans, size: 30, weight: 600, fill: ink, anchor: 'start', spacing: -0.8 } : { font: sans, size: f.size, weight: f.role === 'caps' ? 600 : 400, fill: '#6b6f86', anchor: f.anchor, spacing: f.role === 'caps' ? 1 : 0 });
  }
  return frame(sc, h, '#f4f5fa', '', o);
}

// ---------------------------------------------------------------------------------------------
// 2. Offset: two spot inks printed slightly out of register, tints made of halftone dots. No black.
function offset(sc: Scene, h: number): string {
  const blue = '#2a3fd0', red = '#ff5a4f', yel = '#ffcf33', sans = 'Libre Franklin', M = 5;
  const defs = `<pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.05" fill="${blue}"/><circle cx="4.5" cy="4.5" r="1.05" fill="${blue}"/></pattern>
    <pattern id="rdots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.25" cy="1.25" r="1" fill="${red}"/><circle cx="3.75" cy="3.75" r="1" fill="${red}"/></pattern>
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .25  0 0 0 0 .22  0 0 0 0 .2  0 0 0 .5 -.2"/></filter>`;
  let o = '';
  for (const s of sc.shapes) if (kind(s) === 'zone') {
    o += `<rect x="${s.x + M}" y="${s.y + M}" width="${s.w}" height="${s.h}" fill="url(#dots)" opacity=".32"/>`;
    o += text(s.x + M + 12, s.y + M + 22, (s.text ?? '').toUpperCase(), { font: sans, size: 11, weight: 700, fill: blue, anchor: 'start', spacing: 1.6 });
  }
  for (const c of sc.conns) {
    const k = lineKind(c), col = k === 'primary' ? red : blue, w = k === 'primary' ? 4.5 : k === 'rule' ? 1 : 1.8;
    o += `<path d="${route(c.pts, 0, c.head ? 8 : 0)}" fill="none" stroke="${col}" stroke-width="${w}"${k === 'return' ? ' stroke-dasharray="5 4"' : ''} style="mix-blend-mode:multiply"/>`;
    if (c.head) o += head(c.pts, k === 'primary' ? 14 : 11, k === 'primary' ? 8 : 5.5, col, 'style="mix-blend-mode:multiply"');
    if (c.label) o += text(c.label.cx, c.label.baseline, c.label.text.toUpperCase(), { font: sans, size: 9, weight: 700, fill: col, spacing: 1 });
  }
  for (const s of sc.shapes) {
    const k = kind(s);
    if (k === 'zone' || k === 'legend') continue;
    const fill = k === 'focal' ? red : k === 'store' ? yel : k === 'sticky' ? 'url(#rdots)' : k === 'cloud' ? 'url(#dots)' : k === 'external' ? 'none' : '#ffffff';
    const rx = k === 'store' ? s.h / 2 : 0;
    if (fill !== 'none') o += `<rect x="${s.x + M}" y="${s.y + M}" width="${s.w}" height="${s.h}" rx="${rx}" fill="${fill}"${k === 'cloud' ? ' opacity=".45"' : k === 'sticky' ? ' opacity=".55"' : ''} style="mix-blend-mode:multiply"/>`;
    o += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${rx}" fill="none" stroke="${blue}" stroke-width="2"${k === 'external' ? ' stroke-dasharray="7 5"' : ''}/>`;
    const tc = k === 'focal' ? '#f6f2e9' : blue;
    o += label(sc, s, { title: { font: sans, size: 13, weight: 700, fill: tc }, sub: { font: sans, size: 10, weight: 600, fill: tc }, iconColor: tc, dy: M / 2 });
  }
  for (const t of sc.texts) {
    const f = freeText(t);
    if (f.role === 'h1') o += text(t.ax + 3, t.ay + 3, t.text, { font: sans, size: 34, weight: 700, fill: red, anchor: 'start', spacing: -1 }) + `<g style="mix-blend-mode:multiply">${text(t.ax, t.ay, t.text, { font: sans, size: 34, weight: 700, fill: blue, anchor: 'start', spacing: -1 })}</g>`;
    else o += text(t.ax, t.ay + (f.role === 'dek' ? 6 : 0), f.role === 'caps' ? t.text.toUpperCase() : t.text, { font: sans, size: f.size, weight: 600, fill: blue, anchor: f.anchor, spacing: f.role === 'caps' ? 1.2 : 0 });
  }
  o += `<rect x="${sc.x}" y="${sc.y}" width="${sc.w}" height="${h}" filter="url(#grain)" opacity=".5"/>`;
  return frame(sc, h, '#f6f2e9', defs, o);
}

// ---------------------------------------------------------------------------------------------
// 3. Engraved: the plate of an old technical book. Double rules, shading cut in fine lines.
function engraved(sc: Scene, h: number): string {
  const ink = '#1c1814', red = '#b3261a', serif = 'Instrument Serif', body = 'Newsreader';
  const defs = `<pattern id="h1" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" stroke="${ink}" stroke-width=".7"/></pattern>
    <pattern id="h2" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2.2" stroke="${ink}" stroke-width=".9"/></pattern>
    <pattern id="h3" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="${ink}" stroke-width=".45"/></pattern>
    <pattern id="vh" width="2.6" height="4" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="4" stroke="${ink}" stroke-width=".7"/></pattern>`;
  let o = '';
  for (const s of sc.shapes) if (kind(s) === 'zone') {
    const tw = (s.text ?? '').length * 8.2 + 22, cx = s.x + s.w / 2;
    o += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="url(#h3)" opacity=".45"/>`;
    o += `<path d="M${cx - tw / 2} ${s.y} H${s.x} V${s.y + s.h} H${s.x + s.w} V${s.y} H${cx + tw / 2}" fill="none" stroke="${ink}" stroke-width=".8"/>`;
    for (const [x, y] of [[s.x, s.y], [s.x + s.w, s.y], [s.x, s.y + s.h], [s.x + s.w, s.y + s.h]]) o += `<rect x="${x - 2.5}" y="${y - 2.5}" width="5" height="5" fill="${ink}"/>`;
    o += text(cx, s.y + 4.5, (s.text ?? '').toUpperCase(), { font: body, size: 11, weight: 500, fill: ink, spacing: 2.2 });
  }
  for (const c of sc.conns) {
    const k = lineKind(c);
    if (k === 'primary') {
      o += `<path d="${route(c.pts, 0, 9)}" fill="none" stroke="${red}" stroke-width="4.2"/><path d="${route(c.pts, 0, 9)}" fill="none" stroke="#f3eee2" stroke-width="1.8"/>` + head(c.pts, 13, 6, red);
    } else {
      o += `<path d="${route(c.pts, 0, c.head ? 7 : 0)}" fill="none" stroke="${ink}" stroke-width="${k === 'rule' ? 0.6 : 0.95}"${k === 'return' ? ' stroke-dasharray="1.2 3.2"' : ''}/>`;
      if (c.head) o += head(c.pts, 12, 3.6, ink);
    }
    if (c.label) o += `<rect x="${c.label.cx - c.label.text.length * 3.4 - 4}" y="${c.label.baseline - 11}" width="${c.label.text.length * 6.8 + 8}" height="15" fill="#f3eee2"/>` + text(c.label.cx, c.label.baseline, c.label.text, { font: serif, size: 15, fill: k === 'primary' ? red : ink, italic: true });
  }
  for (const s of sc.shapes) {
    const k = kind(s), S = 5;
    if (k === 'zone' || k === 'legend') continue;
    if (k === 'external') {
      o += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="#f3eee2" stroke="${ink}" stroke-width=".9" stroke-dasharray="1.2 3"/>`;
    } else if (k === 'store') {
      const e = 9, band = s.w * 0.16;
      o += `<path d="M${s.x} ${s.y + e} V${s.y + s.h - e} A${s.w / 2} ${e} 0 0 0 ${s.x + s.w} ${s.y + s.h - e} V${s.y + e} Z" fill="#f3eee2" stroke="${ink}" stroke-width="1.1"/>`;
      o += `<path d="M${s.x} ${s.y + e} V${s.y + s.h - e} A${s.w / 2} ${e} 0 0 0 ${s.x + band} ${s.y + s.h - e * 0.3} V${s.y + e * 1.6} Z" fill="url(#h2)"/><path d="M${s.x + s.w} ${s.y + e} V${s.y + s.h - e} A${s.w / 2} ${e} 0 0 1 ${s.x + s.w - band * 1.6} ${s.y + s.h - e * 0.1} V${s.y + e * 1.9} Z" fill="url(#h1)"/>`;
      o += `<ellipse cx="${s.x + s.w / 2}" cy="${s.y + e}" rx="${s.w / 2}" ry="${e}" fill="#f3eee2" stroke="${ink}" stroke-width="1.1"/>`;
    } else {
      // the shadow: two bands of hatching along the right and bottom edges
      o += `<path d="M${s.x + s.w} ${s.y + S} h${S} v${s.h} h${-s.w} v${-S} h${s.w - S} Z" fill="url(#${k === 'focal' ? 'h2' : 'h1'})"/>`;
      o += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${k === 'focal' ? ink : k === 'sticky' ? '#ead9a0' : '#fbf8f0'}" stroke="${ink}" stroke-width="1.2"/>`;
      o += `<rect x="${s.x + 3.5}" y="${s.y + 3.5}" width="${s.w - 7}" height="${s.h - 7}" fill="none" stroke="${k === 'focal' ? '#f3eee2' : ink}" stroke-width=".5"/>`;
    }
    const tc = k === 'focal' ? '#f3eee2' : ink;
    o += label(sc, s, { title: { font: body, size: 13.5, weight: 600, fill: tc }, sub: { font: serif, size: 14, fill: tc, italic: true }, iconColor: tc, iconSize: 19, dy: k === 'store' ? 5 : 0, lead: 16 });
  }
  for (const t of sc.texts) {
    const f = freeText(t);
    if (f.role === 'h1') o += text(t.ax, t.ay + 4, t.text, { font: serif, size: 46, fill: ink, anchor: 'start', spacing: -0.5 });
    else if (f.role === 'dek') o += text(t.ax, t.ay + 12, t.text, { font: serif, size: 19, fill: ink, anchor: 'start', italic: true }) + `<path d="M${t.ax} ${t.ay + 26} h560" stroke="${ink}" stroke-width="2.2"/><path d="M${t.ax} ${t.ay + 30} h560" stroke="${ink}" stroke-width=".6"/>`;
    else o += text(t.ax, t.ay, f.role === 'caps' ? t.text.toUpperCase() : t.text, { font: body, size: f.size + 1, weight: 500, fill: ink, anchor: f.anchor, spacing: f.role === 'caps' ? 1.8 : 0 });
  }
  return frame(sc, h, '#f3eee2', defs, o);
}

// ---------------------------------------------------------------------------------------------
// 4. Transit: the lines are the picture. Thick coloured routes with sweeping bends; boxes are stations.
function transit(sc: Scene, h: number): string {
  const ink = '#14213d', sans = 'Geist', cols: Record<string, string> = { primary: '#e4002b', link: '#0072ce', arrow: '#14213d', return: '#8a94a6', rule: '#c9ced8' };
  let o = '';
  for (const s of sc.shapes) if (kind(s) === 'zone') {
    o += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="26" fill="#eef2f7"/>`;
    o += text(s.x + 20, s.y + s.h - 16, (s.text ?? '').toUpperCase(), { font: sans, size: 22, weight: 600, fill: '#cdd5e1', anchor: 'start', spacing: 1 });
  }
  const order = ['rule', 'return', 'arrow', 'link', 'primary'];
  for (const c of [...sc.conns].sort((a, b) => order.indexOf(lineKind(a)) - order.indexOf(lineKind(b)))) {
    const k = lineKind(c), w = k === 'primary' ? 9 : k === 'rule' ? 1.5 : 6;
    o += `<path d="${route(c.pts, 22)}" fill="none" stroke="#ffffff" stroke-width="${w + 5}" stroke-linecap="round"/>`;
    o += `<path d="${route(c.pts, 22)}" fill="none" stroke="${cols[k]}" stroke-width="${w}" stroke-linecap="round"${k === 'return' ? ' stroke-dasharray="1 11"' : ''}/>`;
  }
  for (const c of sc.conns) {
    const k = lineKind(c);
    if (k === 'rule') continue;
    for (const p of [c.pts[0], c.pts[c.pts.length - 1]]) o += `<circle cx="${p.x}" cy="${p.y}" r="6.5" fill="#fff" stroke="${ink}" stroke-width="3"/>`;
    if (c.head) { // direction: a white chevron on the line, just before the stop
      const a = c.pts[c.pts.length - 2], b = c.pts[c.pts.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, x = b.x - ux * 20, y = b.y - uy * 20;
      o += `<path d="M${x - ux * 4 - uy * 3.2} ${y - uy * 4 + ux * 3.2} L${x + ux * 1.5} ${y + uy * 1.5} L${x - ux * 4 + uy * 3.2} ${y - uy * 4 - ux * 3.2}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (c.label) {
      const lw = c.label.text.length * 6.6 + 16;
      o += `<rect x="${c.label.cx - lw / 2}" y="${c.label.baseline - 16}" width="${lw}" height="17" rx="3" fill="${cols[k]}"/>` + text(c.label.cx, c.label.baseline - 4, c.label.text.toUpperCase(), { font: sans, size: 9.5, weight: 600, fill: '#fff', spacing: 0.8 });
    }
  }
  for (const s of sc.shapes) {
    const k = kind(s);
    if (k === 'zone' || k === 'legend') continue;
    const r = k === 'sticky' ? 4 : Math.min(s.h / 2, 32), fill = k === 'focal' ? ink : k === 'sticky' ? '#ffe9a8' : '#ffffff', tc = k === 'focal' ? '#ffffff' : ink;
    o += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${r}" fill="${fill}" stroke="${k === 'sticky' ? 'none' : ink}" stroke-width="${k === 'external' ? 2 : 3.5}"${k === 'external' ? ' stroke-dasharray="6 5"' : ''}/>`;
    if (k === 'store') o += `<rect x="${s.x + 5.5}" y="${s.y + 5.5}" width="${s.w - 11}" height="${s.h - 11}" rx="${r - 5.5}" fill="none" stroke="${ink}" stroke-width="1.2"/>`;
    o += label(sc, s, { title: { font: sans, size: 13.5, weight: 600, fill: tc }, sub: { font: sans, size: 10.5, fill: k === 'focal' ? 'rgba(255,255,255,.8)' : '#5c677d' }, iconColor: tc });
  }
  for (const t of sc.texts) {
    const f = freeText(t);
    if (f.role === 'h1') o += `<rect x="${t.ax}" y="${t.ay - 30}" width="9" height="38" fill="#e4002b"/>` + text(t.ax + 22, t.ay, t.text, { font: sans, size: 32, weight: 600, fill: ink, anchor: 'start', spacing: -0.9 });
    else o += text(t.ax + (f.role === 'dek' ? 22 : 0), t.ay, f.role === 'caps' ? t.text.toUpperCase() : t.text, { font: sans, size: f.size, weight: f.role === 'caps' ? 600 : 400, fill: '#5c677d', anchor: f.anchor, spacing: f.role === 'caps' ? 1 : 0 });
  }
  return frame(sc, h, '#ffffff', '', o);
}

// ---------------------------------------------------------------------------------------------
// 5. Listing: the diagram as a line printer would put it on green-bar paper. The file is text; so is the picture.
function listing(sc: Scene, h: number): string {
  const ink = '#1d2b24', mono = 'Geist Mono', G = 8;
  const snap = (v: number) => Math.round(v / G) * G;
  let o = '';
  for (let y = Math.floor(sc.y / 32) * 32; y < sc.y + h; y += 64) o += `<rect x="${sc.x}" y="${y}" width="${sc.w}" height="32" fill="#e3f1e4"/>`;
  for (let y = sc.y + 14; y < sc.y + h; y += 24) o += `<circle cx="${sc.x + 13}" cy="${y}" r="4.2" fill="#fff" stroke="#b9cdbb" stroke-width="1"/><circle cx="${sc.x + sc.w - 13}" cy="${y}" r="4.2" fill="#fff" stroke="#b9cdbb" stroke-width="1"/>`;
  o += `<path d="M${sc.x + 26} ${sc.y} v${h} M${sc.x + sc.w - 26} ${sc.y} v${h}" stroke="#b9cdbb" stroke-width="1" stroke-dasharray="2 3"/>`;
  const chars = (x: number, y: number, n: number, ch: string, fill = ink) => text(x, y, ch.repeat(Math.max(1, Math.round(n))), { font: mono, size: 10, fill, anchor: 'start' });
  for (const s of sc.shapes) if (kind(s) === 'zone') {
    const x = snap(s.x), y = snap(s.y), w = snap(s.w), hh = snap(s.h);
    for (let yy = y + 10; yy < y + hh; yy += 12) o += chars(x, yy, w / 6, '░', '#9fc2a4');
    o += `<rect x="${x + 10}" y="${y - 7}" width="${(s.text ?? '').length * 7.4 + 30}" height="15" fill="${ink}"/>` + text(x + 16, y + 4, `[ ${(s.text ?? '').toUpperCase()} ]`, { font: mono, size: 11, weight: 500, fill: '#f6fbf6', anchor: 'start' });
  }
  for (const c of sc.conns) {
    const k = lineKind(c), pts = c.pts.map((p) => ({ x: snap(p.x), y: snap(p.y) }));
    o += `<path d="${route(pts, 0, c.head ? 7 : 0)}" fill="none" stroke="${ink}" stroke-width="${k === 'primary' ? 3.2 : 1.4}" stroke-linecap="square"${k === 'return' ? ' stroke-dasharray="6 5"' : k === 'rule' ? ' stroke-dasharray="1 4"' : ''}/>`;
    if (k === 'primary') o += `<path d="${route(pts, 0, 7)}" fill="none" stroke="#f6fbf6" stroke-width="1"/>`;
    if (c.head) o += head(pts, 10, 5.5, ink);
    for (let i = 1; i < pts.length - 1; i++) o += `<rect x="${pts[i].x - 2.6}" y="${pts[i].y - 2.6}" width="5.2" height="5.2" fill="${ink}"/>`;
    if (c.label) { const lw = c.label.text.length * 6.1 + 8; o += `<rect x="${c.label.cx - lw / 2}" y="${c.label.baseline - 10}" width="${lw}" height="14" fill="#f6fbf6"/>` + text(c.label.cx, c.label.baseline, c.label.text.toUpperCase(), { font: mono, size: 9.5, fill: ink }); }
  }
  for (const s of sc.shapes) {
    const k = kind(s);
    if (k === 'zone' || k === 'legend') continue;
    const x = snap(s.x), y = snap(s.y), w = snap(s.w), hh = snap(s.h), inv = k === 'focal';
    o += `<rect x="${x + 6}" y="${y + 6}" width="${w}" height="${hh}" fill="${ink}" opacity="${k === 'external' ? 0 : 0.22}"/>`;
    o += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${inv ? ink : k === 'sticky' ? '#fff6c9' : '#f6fbf6'}" stroke="${ink}" stroke-width="1.4"${k === 'external' ? ' stroke-dasharray="6 5"' : ''}/>`;
    if (k === 'store' || inv) o += `<rect x="${x + 3.5}" y="${y + 3.5}" width="${w - 7}" height="${hh - 7}" fill="none" stroke="${inv ? '#f6fbf6' : ink}" stroke-width="1.4"/>`;
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + hh], [x + w, y + hh]]) o += text(cx, cy + 3.6, '+', { font: mono, size: 11, weight: 500, fill: ink });
    const tc = inv ? '#f6fbf6' : ink, sub = s.p.sub, lines = (s.text ?? '').split('\n'), top = y + hh / 2 - ((lines.length - 1) * 13 + (sub ? 13 : 0)) / 2 + 4;
    lines.forEach((l, i) => { o += text(x + w / 2, top + i * 13, k === 'sticky' ? l : l.toUpperCase(), { font: mono, size: 11.5, weight: 500, fill: tc }); });
    if (sub) o += text(x + w / 2, top + lines.length * 13, sub, { font: mono, size: 9.5, fill: tc });
  }
  for (const t of sc.texts) {
    const f = freeText(t);
    if (f.role === 'h1') o += text(t.ax, t.ay - 2, t.text.toUpperCase(), { font: mono, size: 22, weight: 500, fill: ink, anchor: 'start', spacing: 1 }) + chars(t.ax, t.ay + 11, t.text.length * 2.45, '=');
    else o += text(t.ax, t.ay + (f.role === 'dek' ? 8 : 0), f.role === 'caps' ? t.text.toUpperCase() : t.text, { font: mono, size: Math.min(f.size, 11), fill: ink, anchor: f.anchor });
  }
  return frame(sc, h, '#f6fbf6', '', o);
}

const [file, prefix] = process.argv.slice(2);
const sc = buildScene(readFileSync(file, 'utf8').replace(/^legend .*$/m, ''), null);
const legend = sc.shapes.find((s) => s.shape === 'legend');
const h = sc.h;
const fontFiles = readdirSync(FONTS).filter((f) => /\.ttf$/.test(f)).map((f) => FONTS + f);
for (const [name, draw] of Object.entries({ keys, offset, engraved, transit, listing })) {
  const svg = draw(sc, h);
  writeFileSync(`${prefix}${name}.svg`, svg);
  writeFileSync(`${prefix}${name}.png`, new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Geist' }, fitTo: { mode: 'zoom', value: 1.5 } }).render().asPng());
  console.log('wrote', `${prefix}${name}.png`, legend ? '' : '');
}
