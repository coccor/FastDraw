// Prints, as one JSON object on stdout, the TypeScript's answers for the geometry helpers, so the Rust port
// (crates/fastdraw-render/tests/geometry.rs) can be checked against them. One key per function family; later
// tasks add keys. Run with `npm run rust:cases`; the output is deterministic, so `git diff` stays empty.
//   sketch  canSketch, roughPath, sketchSvg, rectD, ellipseD
//   router  segHits, crosses, simplify, routeAround
//   sort    `(a, b) => a - b` on number lists with NaN (V8's TimSort; the Rust port reproduces it)
// JSON has no NaN or Infinity: they are written as the strings "NaN", "Infinity" and "-Infinity".
import { canSketch, roughPath, sketchSvg, rectD, ellipseD } from '../src/sketch.ts';
import { segHits, crosses, simplify, routeAround } from '../src/router.ts';
import type { Pt, Box } from '../src/scene.ts';

// A small fixed generator, so the generated inputs never change between runs.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function sketch() {
  const paths = [
    rectD(10, 20, 100, 40, 0),
    rectD(10, 20, 100, 40, 8),
    ellipseD(0, 0, 80, 50),
    'M 0,0 L 50,0 C 60,10 70,10 80,0 Q 90,20 100,0 Z',
    // repeated L, an exponent number (which ends the run), a zero-length stroke, a second subpath
    'M 1e1,2 L 35,40.5 -7e-1,3 L 0 0 L 12 30 Z M 100,100 L 100,100 L 100.2,100.2 L 160,120',
    // lower-case letters, a missing coordinate, characters outside ASCII
    'm 0 0 l 5 5 M 3 L 4',
    'M 0,0 L 10,10 \u00e9 L 20 5 \u{1F600}',
  ];
  const attrs = [
    'fill="#fff" stroke="#000" stroke-width="2"',
    'fill="none" stroke="#123" stroke-width="1.5" stroke-dasharray="4 2"',
    'fill="red" stroke="none"',
    'stroke="blue" stroke-width="3"',
    'fill="#abc" stroke="#000" stroke-width="x"',
    'stroke-width="2"',
  ];
  const unders = ['', '<path d="{d}" fill="url(#g)"/>'];
  const rough = [];
  for (const d of paths) for (const amount of [0, 1, 2]) for (const pass of [0, 1, 2]) rough.push({ d, amount, pass, out: roughPath(d, amount, pass) });
  const svg = [];
  for (const d of paths.slice(0, 5)) for (const a of attrs) for (const under of unders) for (const amount of [1, 2]) svg.push({ d, attrs: a, amount, under, out: sketchSvg(d, a, amount, under) });
  const can = ['M 0 0 L 1 1 Z', 'M0,0L1e3,-2.5Z', '', 'M 0 0 A 5 5 0 0 1 10 10', 'm 0 0', 'M 0 0\n L 1 1', 'M 0 0 L\u00a01 1', 'M 0 0 H 4', 'M 0 \u0661'].map((d) => ({ d, out: canSketch(d) }));
  const rects = [], ellipses = [];
  for (const [x, y, w, h, r] of [[0, 0, 10, 10, 0], [1.5, 2.25, 100, 40, 8], [10, 20, 30.7, 40.1, 3.3], [-5, -5, 20, 20, 0.5], [0, 0, 1e21, 5, 0], [0, 0, 5, 1e-7, 2]]) rects.push({ args: [x, y, w, h, r], out: rectD(x, y, w, h, r) });
  for (const [x, y, w, h] of [[0, 0, 80, 50], [10.5, 20.25, 33.3, 44.4], [-10, -10, 1, 1], [0, 0, 0, 0], [0.001, 0.004, 3.14159, 2.71828]]) ellipses.push({ args: [x, y, w, h], out: ellipseD(x, y, w, h) });
  return { rough, svg, can, rects, ellipses };
}

function router() {
  const rnd = lcg(12345);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const segs = [];
  for (let i = 0; i < 300; i++) {
    const a = { x: int(-5, 25), y: int(-5, 25) }, b = i % 5 === 0 ? { x: a.x, y: int(-5, 25) } : i % 7 === 0 ? { x: int(-5, 25), y: a.y } : { x: int(-5, 25), y: int(-5, 25) };
    const r = { x: int(0, 15), y: int(0, 15), w: int(0, 10), h: int(0, 10) };
    segs.push({ a, b, r, out: segHits(a, b, r) });
  }
  const crossing = [];
  for (let i = 0; i < 100; i++) {
    const pts: Pt[] = Array.from({ length: int(0, 5) }, () => ({ x: int(0, 30), y: int(0, 30) }));
    const obstacles: Box[] = Array.from({ length: int(0, 3) }, () => ({ x: int(0, 25), y: int(0, 25), w: int(0, 12), h: int(0, 12) }));
    crossing.push({ pts, obstacles, out: crosses(pts, obstacles) });
  }
  const simple = [];
  const sp = (...c: number[]) => c.map((n, i) => (i % 2 ? null : { x: n, y: c[i + 1] })).filter((p): p is Pt => !!p);
  const fixed = [sp(), sp(0, 0), sp(0, 0, 0, 0), sp(0, 0, 5, 0, 9, 0, 9, 4, 9, 8), sp(0, 0, 5, 5, 9, 9), sp(0, 0, 0, 5, 0, 9, 3, 9, 3, 9, 3, 2), sp(0, 0, 5, 0, 5, 0, 0, 0)];
  for (let i = 0; i < 60; i++) fixed.push(Array.from({ length: int(0, 8) }, () => ({ x: int(0, 3), y: int(0, 3) })));
  for (const pts of fixed) simple.push({ pts, out: simplify(pts) });

  const P = (x: number, y: number): Pt => ({ x, y });
  const many: Box[] = [];
  for (let i = 0; i < 50; i++) many.push({ x: i * 61, y: (i * 37) % 400, w: 20, h: 20 });
  const layouts: { name: string; p0: Pt; d0: Pt | null; p1: Pt; d1: Pt | null; obstacles: Box[]; taken: [Pt, Pt][] }[] = [
    { name: 'open ground', p0: P(0, 0), d0: null, p1: P(100, 60), d1: null, obstacles: [], taken: [] },
    { name: 'one box between', p0: P(0, 50), d0: P(1, 0), p1: P(200, 50), d1: P(-1, 0), obstacles: [{ x: 80, y: 20, w: 40, h: 60 }], taken: [] },
    { name: 'box between, free ends', p0: P(10.5, 20.25), d0: null, p1: P(190.75, 70), d1: null, obstacles: [{ x: 80, y: 0, w: 40, h: 100 }], taken: [] },
    { name: 'boxes in a row, vertical ends', p0: P(100, 0), d0: P(0, -1), p1: P(100, 300), d1: P(0, 1), obstacles: [{ x: 60, y: 80, w: 80, h: 30 }, { x: 40, y: 150, w: 120, h: 30 }, { x: 70, y: 220, w: 60, h: 30 }], taken: [] },
    { name: 'taken stretches', p0: P(0, 50), d0: P(1, 0), p1: P(200, 50), d1: P(-1, 0), obstacles: [{ x: 80, y: 20, w: 40, h: 60 }], taken: [[P(20, 50), P(80, 50)], [P(60, 50), P(60, 120)], [P(20, 6), P(180, 6)]] },
    { name: 'start enclosed, no route', p0: P(100, 100), d0: null, p1: P(400, 100), d1: null, obstacles: [{ x: 0, y: 0, w: 200, h: 200 }], taken: [] },
    { name: 'too many grid points, no route', p0: P(0, 0), d0: null, p1: P(3000, 500), d1: null, obstacles: many, taken: [] },
    { name: 'same point', p0: P(30, 30), d0: P(0, 1), p1: P(30, 30), d1: null, obstacles: [{ x: 100, y: 100, w: 10, h: 10 }], taken: [] },
    { name: 'end direction against the approach', p0: P(0, 0), d0: P(0, 1), p1: P(150, 80), d1: P(1, 0), obstacles: [{ x: 50, y: 30, w: 60, h: 60 }, { x: 120, y: 60, w: 20, h: 60 }], taken: [[P(0, 20), P(0, 200)]] },
    { name: 'around a box', p0: P(40, 100), d0: P(-1, 0), p1: P(160, 100), d1: P(1, 0), obstacles: [{ x: 70, y: 40, w: 60, h: 120 }], taken: [] },
  ];
  const NaNx = (y: number): Pt => ({ x: NaN, y });
  const wall: Box = { x: 100, y: 60, w: 40, h: 100 };
  layouts.push(
    { name: 'NaN x, free ends, one box', p0: NaNx(125), d0: null, p1: P(300, 125), d1: null, obstacles: [wall], taken: [] },
    { name: 'NaN x, directions, two boxes', p0: NaNx(125), d0: P(1, 0), p1: P(200, 20), d1: null, obstacles: [wall, { x: 160, y: 40, w: 30, h: 30 }], taken: [] },
    { name: 'NaN x at the far end', p0: P(0, 125), d0: null, p1: NaNx(40), d1: null, obstacles: [wall], taken: [] },
    { name: 'NaN y', p0: P(0, NaN), d0: null, p1: P(300, 125), d1: null, obstacles: [wall], taken: [] },
    { name: 'NaN both', p0: { x: NaN, y: NaN }, d0: null, p1: P(300, 125), d1: null, obstacles: [wall], taken: [] },
    { name: 'NaN both ends', p0: NaNx(10), d0: null, p1: NaNx(90), d1: null, obstacles: [wall], taken: [] },
    { name: 'NaN direction', p0: P(0, 125), d0: P(NaN, 0), p1: P(300, 125), d1: null, obstacles: [wall], taken: [] },
    { name: 'Infinity end', p0: P(0, 125), d0: null, p1: P(Infinity, 125), d1: null, obstacles: [wall], taken: [] },
    { name: '-Infinity end, no boxes', p0: P(-Infinity, 0), d0: null, p1: P(50, 50), d1: null, obstacles: [], taken: [] },
    { name: 'NaN box edge (infinite box)', p0: P(0, 125), d0: null, p1: P(300, 125), d1: null, obstacles: [wall, { x: -Infinity, y: 0, w: Infinity, h: 10 }], taken: [] },
    { name: 'NaN box position', p0: P(0, 125), d0: null, p1: P(300, 125), d1: null, obstacles: [wall, { x: NaN, y: 20, w: 10, h: 10 }], taken: [] },
    { name: 'NaN box among many (a long sort)', p0: P(0, 0), d0: null, p1: P(400, 300), d1: null, obstacles: [...Array.from({ length: 14 }, (_, i): Box => ({ x: 20 + i * 27, y: 30 + (i * 53) % 220, w: 12, h: 18 })), { x: NaN, y: 150, w: 10, h: 10 }], taken: [] },
  );
  const routes = layouts.map((l) => ({ ...l, out: routeAround(l.p0, l.d0, l.p1, l.d1, l.obstacles, l.taken) }));
  return { segs, crossing, simple, routes };
}

function sort() {
  const rnd = lcg(777);
  const lists: number[][] = [[], [NaN], [3, NaN, 1], [NaN, 3, 2, 1], [1, 2, 3, NaN, 0, -1]];
  for (let n = 2; n < 300; n += n < 40 ? 1 : 23) {
    for (let k = 0; k < 3; k++) {
      const v = Array.from({ length: n }, () => Math.floor(rnd() * 1000) - 500);
      for (let j = 0; j < (k === 0 ? 0 : k * 2); j++) v[Math.floor(rnd() * n)] = NaN;
      if (k === 2) v.sort((a, b) => a - b), v.reverse(), v[Math.floor(n / 2)] = NaN;
      lists.push(v);
    }
  }
  return lists.map((v) => ({ v, out: [...v].sort((a, b) => a - b) }));
}

const sections: Record<string, () => unknown> = { sketch, router, sort };
const out: Record<string, unknown> = {};
for (const [name, fn] of Object.entries(sections)) out[name] = fn();
const nonFinite = (_: string, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v);
process.stdout.write(JSON.stringify(out, nonFinite) +'\n');
