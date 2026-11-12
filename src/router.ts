// Finds a right-angle route around boxes when the simple route would cut through one.
import type { Pt, Box } from './scene.ts';

// Liang–Barsky: does segment AB cross the inside of the box?
export function segHits(A: Pt, B: Pt, r: Box): boolean {
  let t0 = 0, t1 = 1;
  const dx = B.x - A.x, dy = B.y - A.y;
  const edges: [number, number][] = [[-dx, A.x - r.x], [dx, r.x + r.w - A.x], [-dy, A.y - r.y], [dy, r.y + r.h - A.y]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q <= 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-6;
}

const grow = (b: Box, n: number): Box => ({ x: b.x - n, y: b.y - n, w: b.w + 2 * n, h: b.h + 2 * n });
const inside = (b: Box, p: Pt) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;

export function crosses(pts: Pt[], obstacles: Box[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) for (const o of obstacles) if (segHits(pts[i], pts[i + 1], grow(o, -1))) return true;
  return false;
}

// Drop points that sit on a straight run, and repeats.
export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const a = out[out.length - 2], b = out[out.length - 1];
    if (b && b.x === p.x && b.y === p.y) continue;
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

const CLEAR = 12; // distance kept from boxes
const STUB = 20;  // straight run out of a box before the first turn, long enough for an arrowhead
const BEND = 30;  // cost of a turn, in px of extra length
const SHARE = 160; // cost of running along a stretch another connector already uses
const LANES = [CLEAR, CLEAR + 12, CLEAR + 24]; // tracks offered around each box

// d0/d1 point away from the shape at each end; null for a free end.
// taken: segments of connectors routed before this one, which this route prefers not to share.
export function routeAround(P0: Pt, d0: Pt | null, P1: Pt, d1: Pt | null, obstacles: Box[], taken: [Pt, Pt][] = []): Pt[] | null {
  const S = d0 ? { x: P0.x + d0.x * STUB, y: P0.y + d0.y * STUB } : P0;
  const E = d1 ? { x: P1.x + d1.x * STUB, y: P1.y + d1.y * STUB } : P1;
  const uniq = (v: number[]) => [...new Set(v.map((n) => Math.round(n)))].sort((a, b) => a - b);
  const xs = uniq([S.x, E.x, ...obstacles.flatMap((o) => LANES.flatMap((l) => [o.x - l, o.x + o.w + l]))]);
  const ys = uniq([S.y, E.y, ...obstacles.flatMap((o) => LANES.flatMap((l) => [o.y - l, o.y + o.h + l]))]);
  const W = xs.length, H = ys.length;
  if (W * H > 60000) return null;
  const shared = (A: Pt, B: Pt) => taken.some(([C, D]) =>
    (A.y === B.y && C.y === D.y && A.y === C.y && Math.min(Math.max(A.x, B.x), Math.max(C.x, D.x)) - Math.max(Math.min(A.x, B.x), Math.min(C.x, D.x)) > 0) ||
    (A.x === B.x && C.x === D.x && A.x === C.x && Math.min(Math.max(A.y, B.y), Math.max(C.y, D.y)) - Math.max(Math.min(A.y, B.y), Math.min(C.y, D.y)) > 0));
  const si = xs.indexOf(Math.round(S.x)) + ys.indexOf(Math.round(S.y)) * W;
  const ei = xs.indexOf(Math.round(E.x)) + ys.indexOf(Math.round(E.y)) * W;
  const pt = (i: number): Pt => ({ x: xs[i % W], y: ys[Math.floor(i / W)] });
  const wide = obstacles.map((o) => grow(o, CLEAR - 1)), tight = obstacles.map((o) => grow(o, 2));
  const free = (i: number) => i === si || i === ei || !wide.some((o) => inside(o, pt(i)));
  const open = (a: number, b: number) => { const A = pt(a), B = pt(b); return !tight.some((o) => segHits(A, B, o)); };

  // Dijkstra over (grid point, direction of the last move): 0 = horizontal, 1 = vertical
  const N = W * H * 2;
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const heap: number[] = [];
  const push = (s: number) => { heap.push(s); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (dist[heap[p]] <= dist[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l;
        if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  const startDirs = d0 ? [d0.x !== 0 ? 0 : 1] : [0, 1];
  for (const d of startDirs) { dist[si * 2 + d] = 0; push(si * 2 + d); }
  const endDir = d1 ? (d1.x !== 0 ? 0 : 1) : -1;
  let goal = -1;
  while (heap.length) {
    const s = pop(), i = s >> 1, dir = s & 1;
    if (i === ei) { goal = s; break; }
    const x = i % W, y = Math.floor(i / W);
    const steps: [number, number][] = [];
    if (x > 0) steps.push([i - 1, 0]); if (x < W - 1) steps.push([i + 1, 0]);
    if (y > 0) steps.push([i - W, 1]); if (y < H - 1) steps.push([i + W, 1]);
    for (const [j, nd] of steps) {
      if (!free(j) || !open(i, j)) continue;
      const A = pt(i), B = pt(j);
      let cost = dist[s] + Math.abs(A.x - B.x) + Math.abs(A.y - B.y) + (nd !== dir ? BEND : 0) + (taken.length && shared(A, B) ? SHARE : 0);
      if (j === ei && endDir >= 0 && nd !== endDir) cost += BEND;
      const t = j * 2 + nd;
      if (cost < dist[t]) { dist[t] = cost; prev[t] = s; push(t); }
    }
  }
  if (goal < 0) return null;
  const path: Pt[] = [];
  for (let s = goal; s >= 0; s = prev[s]) path.push(pt(s >> 1));
  path.reverse();
  return simplify([P0, ...path, P1]);
}
