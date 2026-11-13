// Hand-drawn strokes for looks that set `canvas sketch=1`. A path is redrawn as two loose passes:
// straight segments bow a little, every point wanders a pixel or two, so a box reads as if drawn
// with a marker. The wobble comes from a generator seeded by the path itself, so the same diagram
// always draws the same way.
import { r2 } from './render.ts';

type P = { x: number; y: number };

function seeded(text: string, pass: number): () => number {
  let h = 2166136261 ^ pass;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Path data with absolute M, L, C, Q and Z only, which is all FastDraw itself writes.
export function canSketch(d: string): boolean {
  return /^[MLCQZ0-9eE\s,.+-]*$/.test(d);
}

// One rough pass over a path. amount 1 is a steady hand; 2 is a quick scribble.
export function roughPath(d: string, amount: number, pass: number): string {
  const rnd = seeded(d, pass), off = (k: number) => (rnd() - 0.5) * 2 * k;
  const jit = (p: P, k: number): P => ({ x: p.x + off(k), y: p.y + off(k) });
  const out: string[] = [];
  let cur: P = { x: 0, y: 0 }, start: P = cur, pen: P = cur;
  const line = (to: P) => {
    const dx = to.x - cur.x, dy = to.y - cur.y, len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    // a long stroke bows more than a short one, but never by more than a few pixels
    const bow = off(Math.min(len * 0.02, 3.2) * amount), nx = -dy / len, ny = dx / len;
    const k = Math.min(1.8, 0.35 + len * 0.012) * amount;
    const end = jit(to, k);
    const c1 = { x: pen.x + dx / 3 + nx * bow, y: pen.y + dy / 3 + ny * bow };
    const c2 = { x: pen.x + (dx * 2) / 3 + nx * bow, y: pen.y + (dy * 2) / 3 + ny * bow };
    out.push(`C ${r2(c1.x)},${r2(c1.y)} ${r2(c2.x)},${r2(c2.y)} ${r2(end.x)},${r2(end.y)}`);
    cur = to; pen = end;
  };
  const toks = d.match(/[MLCQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0;
  const pt = (): P => ({ x: +toks[i++], y: +toks[i++] });
  while (i < toks.length) {
    const c = toks[i++];
    if (c === 'M') { cur = start = pt(); pen = jit(cur, 0.6 * amount); out.push(`M ${r2(pen.x)},${r2(pen.y)}`); }
    else if (c === 'L') { while (i < toks.length && !/[A-Z]/i.test(toks[i])) line(pt()); }
    else if (c === 'C') {
      while (i < toks.length && !/[A-Z]/i.test(toks[i])) {
        const a = jit(pt(), 0.9 * amount), b = jit(pt(), 0.9 * amount); cur = pt(); pen = jit(cur, 0.6 * amount);
        out.push(`C ${r2(a.x)},${r2(a.y)} ${r2(b.x)},${r2(b.y)} ${r2(pen.x)},${r2(pen.y)}`);
      }
    } else if (c === 'Q') {
      while (i < toks.length && !/[A-Z]/i.test(toks[i])) {
        const a = jit(pt(), 0.6 * amount); cur = pt(); pen = jit(cur, 0.5 * amount);
        out.push(`Q ${r2(a.x)},${r2(a.y)} ${r2(pen.x)},${r2(pen.y)}`);
      }
    } else if (c === 'Z') line(start);
    else i++;
  }
  return out.join(' ');
}

// A shape or line drawn by hand: the fill follows the first pass, then two strokes on top.
// attrs is the usual fill/stroke attribute string; under, if given, is painted between fill and strokes.
export function sketchSvg(d: string, attrs: string, amount: number, under = ''): string {
  const fill = /fill="([^"]*)"/.exec(attrs)?.[1] ?? 'none';
  const strokeAttrs = attrs.replace(/fill="[^"]*"/, 'fill="none"');
  const hasStroke = !/stroke="none"/.test(attrs) && /stroke="/.test(attrs);
  const dashed = /stroke-dasharray/.test(attrs);
  const out: string[] = [];
  if (fill !== 'none') out.push(`<path d="${roughPath(d, amount * 0.5, 0)}" fill="${fill}" stroke="none"/>`);
  if (under) out.push(under.replace('{d}', roughPath(d, amount * 0.5, 0)));
  if (hasStroke) {
    const cap = ' stroke-linecap="round" stroke-linejoin="round"';
    out.push(`<path d="${roughPath(d, amount, 1)}" ${strokeAttrs}${cap}/>`);
    // a dashed line drawn twice turns to mush, so it gets one pass
    if (!dashed) out.push(`<path d="${roughPath(d, amount, 2)}" ${strokeAttrs.replace(/stroke-width="([\d.]+)"/, (_, w) => `stroke-width="${r2(+w * 0.85)}"`)}${cap}/>`);
  }
  return out.join('\n');
}

// The same outlines the plain renderer draws, as path data, so they can be roughened.
export function rectD(x: number, y: number, w: number, h: number, r: number): string {
  if (!r) return `M ${x},${y} L ${x + w},${y} L ${x + w},${y + h} L ${x},${y + h} Z`;
  return `M ${x + r},${y} L ${x + w - r},${y} Q ${x + w},${y} ${x + w},${y + r} L ${x + w},${y + h - r} Q ${x + w},${y + h} ${x + w - r},${y + h} ` +
    `L ${x + r},${y + h} Q ${x},${y + h} ${x},${y + h - r} L ${x},${y + r} Q ${x},${y} ${x + r},${y} Z`;
}

export function ellipseD(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, k = 0.5523;
  return `M ${r2(cx + rx)},${r2(cy)} C ${r2(cx + rx)},${r2(cy + ry * k)} ${r2(cx + rx * k)},${r2(cy + ry)} ${r2(cx)},${r2(cy + ry)} ` +
    `C ${r2(cx - rx * k)},${r2(cy + ry)} ${r2(cx - rx)},${r2(cy + ry * k)} ${r2(cx - rx)},${r2(cy)} ` +
    `C ${r2(cx - rx)},${r2(cy - ry * k)} ${r2(cx - rx * k)},${r2(cy - ry)} ${r2(cx)},${r2(cy - ry)} ` +
    // a hand-drawn ellipse rarely closes exactly: the last quarter runs a little past the start
    `C ${r2(cx + rx * k)},${r2(cy - ry)} ${r2(cx + rx)},${r2(cy - ry * k)} ${r2(cx + rx)},${r2(cy + ry * 0.08)}`;
}
