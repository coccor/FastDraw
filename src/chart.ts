// Draws a chart element: axes, ticks and grid lines, and the series given as rows.
// The element's box is the plot area; tick labels and titles are drawn just outside it.
import type { Look } from './look.ts';
import type { Shape } from './scene.ts';
import { textWidth } from './scene.ts';
import { col, esc, num, r2, textAttrs } from './render.ts';

const PALETTE = ['accent', 'link', 'ink/0.55', 'soft', 'accent/0.5', 'link/0.5'];

// A step of 1, 2, 2.5 or 5 times a power of ten that gives at most `max` steps across the span.
export function niceStep(span: number, max = 6): number {
  if (!(span > 0)) return 1;
  const raw = span / max, pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}
// A tick step from the file is only used if it is a real positive number that gives a sane number of ticks;
// diagram files are untrusted, and step=0 would otherwise never finish.
const safeStep = (v: string | undefined, span: number): number => {
  const s = Number(v);
  return v !== undefined && Number.isFinite(s) && s > 0 && span / s <= 200 ? s : niceStep(span);
};
const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
const range = (v: string | undefined): [number, number] | null => {
  const m = /^(-?[\d.]+)\.\.(-?[\d.]+)$/.exec(v ?? '');
  return m && Number.isFinite(+m[1]) && Number.isFinite(+m[2]) && +m[2] > +m[1] ? [+m[1], +m[2]] : null; // must run upwards
};

export function drawChart(look: Look, s: Shape): string {
  const p = s.p, rows = (s.rows ?? []).filter((r) => r.id && r.vals.length), out: string[] = [];
  const { x, y, w, h } = s;
  const pairs = (v: string) => (v === '_' ? [] : v.split(',').map(Number)); // _ leaves a gap
  // ---- scales --------------------------------------------------------------
  const xr = range(p.x), cats = !xr && p.x ? p.x.split(',').map((c) => c.trim()) : [];
  const n = xr ? 0 : Math.max(cats.length, ...rows.map((r) => r.vals.length), 1);
  const finite = (v: number) => Number.isFinite(v);
  const ys = rows.flatMap((r) => r.vals.flatMap((v) => (r.id === 'bars' || (r.id === 'dots' && !xr) ? pairs(v) : pairs(v).slice(-1))));
  const stacked = p.stack === '1';
  if (stacked) for (let i = 0; i < n; i++) ys.push(rows.filter((r) => r.id === 'bars').reduce((a, r) => a + (+r.vals[i] || 0), 0));
  for (let i = ys.length - 1; i >= 0; i--) if (!finite(ys[i])) ys.splice(i, 1);
  const yr = range(p.y);
  let y0 = yr ? yr[0] : Math.min(0, ...ys), y1 = yr ? yr[1] : Math.max(0, ...ys);
  if (!(y1 > y0)) y1 = y0 + 1;
  const step = safeStep(p.step, y1 - y0);
  if (!yr) { y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step; if (y1 === y0) y1 = y0 + step; }
  const Y = (v: number) => r2(y + h - ((v - y0) / (y1 - y0)) * h);
  const bw = n ? w / n : 0;
  const X = (i: number) => r2(x + bw * (i + 0.5)); // middle of category i
  const XV = (v: number) => (xr ? r2(x + ((v - xr[0]) / (xr[1] - xr[0])) * w) : 0);
  const base = Y(Math.min(Math.max(0, y0), y1));
  // ---- grid, axes and tick labels -----------------------------------------
  const tick = textAttrs(look, p, 'tick.', { font: 'mono', size: 9, weight: 400, color: 'muted' });
  const axis = col(look, p.stroke ?? 'ink/0.5'), grid = col(look, p['grid.color'] ?? 'ink/0.08'), sw = num(p.sw, 1);
  const unit = p.unit ?? '', pre = p.prefix ?? '';
  if (p.fill && p.fill !== 'none') out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col(look, p.fill)}"/>`);
  for (let v = Math.ceil(y0 / step - 1e-9) * step; v <= y1 + 1e-9; v += step) {
    const gy = Y(v);
    if (p.grid !== '0' && Math.abs(gy - (y + h)) > 0.5) out.push(`<line x1="${x}" y1="${gy}" x2="${x + w}" y2="${gy}" stroke="${grid}" stroke-width="1"/>`);
    if (p.yaxis !== '0') out.push(`<text x="${x - 8}" y="${r2(gy + tick.size * 0.35)}" text-anchor="end" ${tick.a}>${esc(pre + fmt(v) + unit)}</text>`);
  }
  if (xr) {
    const xs = safeStep(p.xstep, xr[1] - xr[0]);
    for (let v = Math.ceil(xr[0] / xs - 1e-9) * xs; v <= xr[1] + 1e-9; v += xs) {
      if (p.grid === 'both' && v > xr[0]) out.push(`<line x1="${XV(v)}" y1="${y}" x2="${XV(v)}" y2="${y + h}" stroke="${grid}" stroke-width="1"/>`);
      out.push(`<text x="${XV(v)}" y="${y + h + 8 + tick.size}" text-anchor="middle" ${tick.a}>${esc(fmt(v) + (p.xunit ?? ''))}</text>`);
    }
  } else cats.forEach((c, i) => out.push(`<text x="${X(i)}" y="${y + h + 8 + tick.size}" text-anchor="middle" ${tick.a}>${esc(c)}</text>`));
  // ---- series ---------------------------------------------------------------
  const lab = textAttrs(look, p, 'value.', { font: 'mono', size: 9, weight: 400, color: 'ink' });
  const labels = p.labels === '1';
  const value = (cx: number, cy: number, v: number) => labels && out.push(`<text x="${cx}" y="${r2(cy)}" text-anchor="middle" ${lab.a}>${esc(pre + fmt(v) + unit)}</text>`);
  const bars = rows.filter((r) => r.id === 'bars');
  const colour = (r: (typeof rows)[number], k: 'fill' | 'stroke') => r.p[k] ?? r.p.fill ?? r.p.stroke ?? PALETTE[rows.indexOf(r) % PALETTE.length];
  const group = bw * num(p['bar.width'], 0.64), each = stacked || !bars.length ? group : group / bars.length;
  const tops: number[] = [];
  bars.forEach((r, k) => {
    const fill = col(look, colour(r, 'fill')), rad = num(p['bar.radius'], 2);
    r.vals.forEach((raw, i) => {
      const q = pairs(raw);
      if (!q.length) return;
      let lo = q.length === 2 ? q[0] : 0, hi = q.length === 2 ? q[1] : q[0];
      if (stacked && q.length === 1) { lo = tops[i] ?? 0; hi = lo + q[0]; tops[i] = hi; }
      const top = Math.min(Y(lo), Y(hi)), bh = Math.abs(Y(lo) - Y(hi));
      const bx = r2(X(i) - group / 2 + (stacked ? 0 : k * each) + (each > 6 ? 1 : 0)), ww = r2(each - (each > 6 ? 2 : 0));
      out.push(`<rect x="${bx}" y="${top}" width="${ww}" height="${r2(Math.max(bh, 0.5))}"${rad && bh > rad * 2 && !stacked ? ` rx="${rad}"` : ''} fill="${fill}"/>`);
      value(r2(bx + ww / 2), hi >= lo ? top - 4 : top + bh + lab.size + 2, q.length === 2 ? hi - lo : q[0]);
    });
  });
  for (const r of rows) {
    if (r.id === 'bars') continue;
    const stroke = col(look, colour(r, 'stroke')), lw = num(r.p.sw, 2);
    const pts = r.vals.map((raw, i) => ({ raw, i })).filter((e) => e.raw !== '_').map(({ raw, i }) => { const q = pairs(raw); return q.length === 2 && xr ? { x: XV(q[0]), y: Y(q[1]), v: q[1], r: 0 } : { x: X(i), y: Y(q[0]), v: q[0], r: q[1] ?? 0 }; });
    if (!pts.length) continue;
    const d = pts.map((q) => `${q.x},${q.y}`).join(' ');
    if (r.id === 'area') out.push(`<polygon points="${pts[0].x},${base} ${d} ${pts[pts.length - 1].x},${base}" fill="${col(look, r.p.fill ?? colour(r, 'stroke') + (/\/[\d.]+$/.test(colour(r, 'stroke')) ? '' : '/0.15'))}"/>`);
    if (r.id !== 'dots') out.push(`<polyline points="${d}" fill="none" stroke="${stroke}" stroke-width="${lw}" stroke-linejoin="round" stroke-linecap="round"${r.p.dash ? ` stroke-dasharray="${esc(r.p.dash)}"` : ''}/>`);
    if (r.id === 'dots' || r.p.dots === '1') for (const q of pts) out.push(`<circle cx="${q.x}" cy="${q.y}" r="${r.id === 'dots' ? num(r.p.r, q.r || 4) : 3}" fill="${r.id === 'dots' ? stroke : col(look, look.canvas.paper ?? 'paper')}" stroke="${stroke}" stroke-width="${r.id === 'dots' ? 0 : lw}"${r.id === 'dots' && r.p.opacity ? ` fill-opacity="${num(r.p.opacity, 1)}"` : ''}/>`);
    for (const q of pts) value(q.x, q.y - 8, q.v);
  }
  // ---- axis lines, titles and the key ----------------------------------------
  out.push(`<path d="M ${x},${y} L ${x},${y + h} L ${x + w},${y + h}" fill="none" stroke="${axis}" stroke-width="${sw}"/>`);
  if (y0 < 0 && y1 > 0) out.push(`<line x1="${x}" y1="${base}" x2="${x + w}" y2="${base}" stroke="${axis}" stroke-width="${sw}"/>`);
  const ttl = textAttrs(look, p, 'axis.', { font: 'sans', size: 10, weight: 400, color: 'muted' });
  if (p.xtitle) out.push(`<text x="${x + w / 2}" y="${y + h + 36}" text-anchor="middle" ${ttl.a}>${esc(p.xtitle)}</text>`);
  if (p.ytitle) out.push(`<text x="${x}" y="${y - 12}" ${ttl.a}>${esc(p.ytitle)}</text>`);
  const named = rows.filter((r) => r.cells[0]);
  if (named.length > 1 && p.key !== '0') {
    let kx = x + w;
    for (const r of [...named].reverse()) {
      const tw = textWidth(r.cells[0], ttl.size, ttl.font, 400, 0);
      kx -= tw;
      out.push(`<text x="${r2(kx)}" y="${y - 12}" ${ttl.a}>${esc(r.cells[0])}</text>`);
      kx -= 14;
      out.push(`<rect x="${r2(kx)}" y="${y - 20}" width="10" height="10" rx="2" fill="${col(look, colour(r, r.id === 'bars' ? 'fill' : 'stroke'))}"/>`);
      kx -= 16;
    }
  }
  if (s.text) { const t = textAttrs(look, p, 'title.', { font: 'sans', size: 12, weight: 600, color: 'ink' }); out.push(`<text x="${x}" y="${y - (p.ytitle || (named.length > 1 && p.key !== '0') ? 32 : 12)}" ${t.a}>${esc(s.text)}</text>`); }
  return out.join('\n');
}
