// Draws a resolved scene as SVG. The same output feeds PNG export.
import { color, fontFamily } from './look.ts';
import type { Look, Props } from './look.ts';
import { textWidth } from './scene.ts';
import type { Scene, Shape, Conn, Pt, TextEl } from './scene.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v: string | undefined, d: number) => (v === undefined || v === '' || isNaN(+v) ? d : +v);
const r2 = (n: number) => Math.round(n * 100) / 100;
// Everything interpolated into an attribute goes through esc: diagram files are untrusted input
// and the editor injects this markup into the page.
const col = (look: Look, v: string | undefined) => esc(color(look, v));
const fam = (look: Look, v: string | undefined) => esc(fontFamily(look, v));

function textAttrs(look: Look, p: Props, pre: string, d: { font: string; size: number; weight: number; color: string }) {
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
  return a;
}

function outline(s: Shape, attrs: string): string {
  const { x, y, w, h } = s;
  if (s.shape === 'ellipse') return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`;
  if (s.shape === 'diamond') return `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${attrs}/>`;
  if (s.shape === 'path' && s.p.path) {
    // path is written in a 0..1 box and scaled to the element (M, L, C, Q, Z only)
    let isX = true;
    const d = s.p.path.replace(/-?\d*\.?\d+/g, (n) => { const v = isX ? x + +n * w : y + +n * h; isX = !isX; return String(r2(v)); });
    return `<path d="${esc(d)}" ${attrs}/>`;
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
    const sp = look.styles.get(e.style)?.props ?? {};
    const y = e.baseline;
    if (e.kind === 'line') {
      const sw = Math.min(num(sp.sw, 1.2), 1.6), stroke = col(look, sp.stroke ?? 'muted');
      const head = !(sp.head === 'none' || sp.route === 'straight');
      const dash = sp.dash && sp.dash !== 'none' ? ` stroke-dasharray="${esc(sp.dash)}"` : '';
      out.push(`<line x1="${e.x}" y1="${y - 3}" x2="${e.x + (head ? 21 : 28)}" y2="${y - 3}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`);
      if (head) out.push(arrowHead({ x: e.x + 28, y: y - 3 }, { x: e.x, y: y - 3 }, sw, stroke));
    } else if (e.kind === 'text') {
      const t = textAttrs(look, { ...sp, size: String(Math.min(num(sp.size, 12), 11)) }, '', { font: 'sans', size: 11, weight: 400, color: 'ink' });
      out.push(`<text x="${e.x}" y="${y}" ${t.a}>Aa</text>`);
    } else {
      const a = strokeAttrs(look, { ...sp, sw: String(Math.min(num(sp.sw, 1), 1.2)) });
      const m = /^(\d+(?:\.\d+)?)x/.exec(sp.size ?? '');
      if (sp.shape === 'diamond') out.push(`<polygon points="${e.x + 11},${y - 9} ${e.x + 22},${y - 3} ${e.x + 11},${y + 3} ${e.x},${y - 3}" ${a}/>`);
      else if (m && +m[1] <= 12) out.push(`<rect x="${e.x + 5}" y="${y - 11}" width="4" height="14" ${a}/>`);
      else out.push(`<rect x="${e.x}" y="${y - 8}" width="14" height="10" rx="${num(sp.radius, 0) >= 12 ? 5 : 2}" ${a}/>`);
    }
    out.push(`<text x="${e.x + e.sample + 6}" y="${y}" ${it.a}>${esc(e.label)}</text>`);
  }
  return out.join('\n');
}

function drawShape(look: Look, s: Shape): string {
  if (s.shape === 'legend') return drawLegend(look, s);
  const p = s.p, out: string[] = [];
  const paper = col(look, look.canvas.paper ?? 'paper');
  if (!s.back && p.mask !== '0' && p.fill && p.fill !== 'none') out.push(outline(s, `fill="${paper}"`));
  out.push(outline(s, strokeAttrs(look, p)));
  const cxm = s.x + s.w / 2, cym = s.y + s.h / 2;
  if (p.ghost) {
    const t = textAttrs(look, p, 'ghost.', { font: 'mono', size: 32, weight: 600, color: 'ink/0.06' });
    out.push(`<text x="${s.x + s.w - 8}" y="${s.y + s.h - 4}" text-anchor="end" ${t.a}>${esc(p.ghost)}</text>`);
  }
  if (p.tag) {
    const t = textAttrs(look, p, 'tag.', { font: 'mono', size: 7, weight: 400, color: 'muted' });
    const tw = Math.ceil((textWidth(p.tag, t.size, t.font, 400, t.spacing) + 12) / 4) * 4;
    out.push(`<rect x="${s.x + 8}" y="${s.y + 8}" width="${tw}" height="12" rx="2" fill="none" stroke="${col(look, p['tag.border'] ?? 'muted/0.4')}" stroke-width="0.8"/>`);
    out.push(`<text x="${s.x + 8 + tw / 2}" y="${s.y + 17}" text-anchor="middle" ${t.a}>${esc(p.tag)}</text>`);
  }
  const title = textAttrs(look, p, 'title.', { font: 'sans', size: 12, weight: 600, color: 'ink' });
  if (s.text && p['title.pos'] === 'top') {
    const txt = p['title.caps'] === '1' ? s.text.toUpperCase() : s.text;
    const tw = Math.ceil((textWidth(txt, title.size, title.font, title.weight, title.spacing) + 12) / 4) * 4;
    out.push(`<rect x="${cxm - tw / 2}" y="${s.y + 4}" width="${tw}" height="12" rx="2" fill="${paper}"/>`);
    out.push(`<text x="${cxm}" y="${s.y + 13}" text-anchor="middle" ${title.a}>${esc(txt)}</text>`);
  } else if (s.text || p.sub) {
    const lines = s.text ? (p['title.caps'] === '1' ? s.text.toUpperCase() : s.text).split('\n') : [];
    const lh = Math.round(title.size * 1.17);
    const sub = textAttrs(look, p, 'sub.', { font: 'mono', size: 9, weight: 400, color: 'muted' });
    const block = lines.length * lh + (p.sub ? sub.size + 7 : 0);
    const top = cym - block / 2 + (p.tag ? 8 : 0);
    lines.forEach((l, i) => out.push(`<text x="${cxm}" y="${r2(top + title.size * 0.86 + i * lh)}" text-anchor="middle" ${title.a}>${esc(l)}</text>`));
    if (p.sub) out.push(`<text x="${cxm}" y="${r2(top + lines.length * lh + sub.size + 3)}" text-anchor="middle" ${sub.a}>${esc(p.sub)}</text>`);
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

function arrowHead(tip: Pt, from: Pt, sw: number, fill: string): string {
  const dx = tip.x - from.x, dy = tip.y - from.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, L = 8 * Math.max(sw, 1), W = 3 * Math.max(sw, 1);
  const bx = tip.x - ux * L, by = tip.y - uy * L;
  return `<polygon points="${r2(tip.x)},${r2(tip.y)} ${r2(bx - uy * W)},${r2(by + ux * W)} ${r2(bx + uy * W)},${r2(by - ux * W)}" fill="${fill}"/>`;
}

function drawConn(look: Look, c: Conn): string {
  const p = c.p, sw = num(p.sw, 1.2), stroke = col(look, p.stroke ?? 'muted');
  const n = c.pts.length;
  const trim = 6 * Math.max(sw, 1);
  let s = `<path d="${pathD(c.pts, c.ortho ? num(p.radius, 8) : 0, c.head ? trim : 0, c.tail ? trim : 0)}" fill="none" stroke="${stroke}" stroke-width="${sw}"${p.dash && p.dash !== 'none' ? ` stroke-dasharray="${esc(p.dash)}"` : ''}/>`;
  if (c.head) s += '\n' + arrowHead(c.pts[n - 1], c.pts[n - 2], sw, stroke);
  if (c.tail) s += '\n' + arrowHead(c.pts[0], c.pts[1], sw, stroke);
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
  return t.text.split('\n').map((l, i) => `<text x="${t.ax}" y="${r2(t.ay + i * a.size * 1.3)}"${anchor} ${a.a}>${esc(l)}</text>`).join('\n');
}

export function renderBody(sc: Scene): string {
  const look = sc.look, cv = look.canvas;
  const out: string[] = [];
  out.push(`<rect width="${sc.w}" height="${sc.h}" fill="${col(look, cv.paper ?? 'paper')}"/>`);
  if (cv.dots) {
    const gap = num(cv.dotgap, 22);
    out.push(`<defs><pattern id="fd-dots" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.9" fill="${col(look, cv.dots)}"/></pattern></defs>`);
    out.push(`<rect width="${sc.w}" height="${sc.h}" fill="url(#fd-dots)"/>`);
  }
  for (const s of sc.shapes) if (s.back) out.push(drawShape(look, s));
  for (const c of sc.conns) out.push(drawConn(look, c));
  for (const c of sc.conns) if (c.label) out.push(drawLabel(look, c));
  for (const s of sc.shapes) if (!s.back) out.push(drawShape(look, s));
  for (const t of sc.texts) out.push(drawText(look, t));
  return out.join('\n');
}

// css: optional stylesheet text (e.g. embedded @font-face rules) placed inside the SVG.
export function renderSvg(sc: Scene, css?: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sc.w} ${sc.h}" width="${sc.w}" height="${sc.h}">\n` +
    (css ? `<style>${css.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</style>\n` : '') + renderBody(sc) + '\n</svg>';
}
