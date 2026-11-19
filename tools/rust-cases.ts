// Prints, as one JSON object on stdout, the TypeScript's answers for the geometry helpers, so the Rust port
// (crates/fastdraw-render/tests/geometry.rs) can be checked against them. One key per function family; later
// tasks add keys. Run with `npm run rust:cases`; the output is deterministic, so `git diff` stays empty.
//   sketch  canSketch, roughPath, sketchSvg, rectD, ellipseD
//   router  segHits, crosses, simplify, routeAround
//   scene   textWidth, measureText, parseEnd, captionBox, extent and scene.ts's private helpers (sides, routes, curves, labels, tables)
//   sort    number lists with NaN, in the renderer's order (byNumber: NaN after every number)
//   chart   niceStep
//   render  renderSvg(buildScene(src)) for hand-written diagrams that reach what the examples do not
// JSON has no NaN or Infinity: they are written as the strings "NaN", "Infinity" and "-Infinity".
import { byNumber } from '../src/order.ts';
import { canSketch, roughPath, sketchSvg, rectD, ellipseD } from '../src/sketch.ts';
import { segHits, crosses, simplify, routeAround } from '../src/router.ts';
import { textWidth, measureText, parseEnd, captionBox, extent, autoSides, sidePoint, route, curvePts, pointAlong, makeLabel, layoutTable } from '../src/scene.ts';
import type { Pt, Box, Conn, End, Row, Shape } from '../src/scene.ts';
import { emptyLook } from '../src/look.ts';
import { FONT_WIDTHS } from '../src/fontWidths.ts';
import { niceStep } from '../src/chart.ts';
import { renderSvg } from '../src/render.ts';
import { buildScene } from '../src/scene.ts';

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
    { name: 'NaN both ends, same point, no boxes', p0: { x: NaN, y: NaN }, d0: null, p1: { x: NaN, y: NaN }, d1: null, obstacles: [], taken: [] },
    { name: 'NaN both ends, same point, one box', p0: { x: NaN, y: NaN }, d0: null, p1: { x: NaN, y: NaN }, d1: null, obstacles: [wall], taken: [] },
    { name: 'NaN x, same row, one box', p0: NaNx(0), d0: null, p1: NaNx(0), d1: null, obstacles: [wall], taken: [] },
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
  return lists.map((v) => ({ v, out: [...v].sort(byNumber) }));
}

// scene.ts, part 1: text measuring and the helpers buildScene leans on.
function scene() {
  const rnd = lcg(4242);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = <T>(a: T[]): T => a[int(0, a.length - 1)];
  const P = (x: number, y: number): Pt => ({ x, y });
  const dirs: (Pt | null)[] = [null, P(0, -1), P(0, 1), P(-1, 0), P(1, 0)];

  const texts = ['', 'a', 'Hello World', 'iiiiWWWW mmmm', 'fastdraw: 0123456789 {}[]()', '→ ü 日本 😀', 'é́ – — … · • × ’ “”', 'ǅ ß ﬁ ½  \t'];
  const tw = [];
  for (const text of texts) for (const font of ['mono', 'serif', 'sans', 'Geist', '']) for (const [size, weight, spacing] of [[10, 400, 0], [12, 600, 0.08], [9.5, 700, 0.5], [16, 599, -0.1]]) tw.push({ text, size, font, weight, spacing, out: textWidth(text, size, font, weight, spacing) });

  const mt = [];
  const families = [...Object.keys(FONT_WIDTHS), 'GEIST', 'Libre Franklin', 'Comic Sans', 'JetBrains Mono', 'monospace', 'Mono', 'constructor', 'toString', '__proto__', 'Courier'];
  const mtTexts = ['', 'Hello World', 'iiiiWWWW', '→ ü 日本 😀', 'ᄀ café ñ ß', 'á fi ﬁ 𝒜'];
  for (const fam of families) for (const role of ['sans', 'mono', 'serif']) {
    for (const weight of [400, 700, 450, 550, 120, 9999]) for (const [text, spacing] of [[mtTexts[mt.length % mtTexts.length], 0], [mtTexts[(mt.length + 3) % mtTexts.length], 0.5]] as [string, number][]) {
      const look = emptyLook();
      look.fonts.set(role, fam);
      mt.push({ fonts: { [role]: fam }, text, size: 12, role, weight, spacing, out: measureText(look, text, 12, role, weight, spacing) });
    }
  }
  // the role is the family when the look does not name one
  for (const role of ['geist', 'newsreader', 'Libre Franklin', 'sketch hand', 'constructor', 'mono', 'serif', 'sans']) for (const weight of [400, 600, NaN, Infinity, -Infinity, 500]) {
    const look = emptyLook(); look.fonts.delete(role);
    for (const [text, spacing] of [['Hello → 日本 😀', 0.25], ['', 0]] as [string, number][]) mt.push({ fonts: {}, drop: role, text, size: 11, role, weight, spacing, out: measureText(look, text, 11, role, weight, spacing) });
  }

  // 'in DIRS' takes Object.prototype names as sides: a.constructor, a.toString@0.3, t.valueOf.right
  const ends = ['+0,260', '-40,+0', '-40,-20', 'a.left@0.3', 't.row2.right', 'a.top.left', '1,2,3', 'a', 'a.top', 'a@5', 'a.left@-3', 'a.top@1.2.3', 'a.right.right', 'a.x.y', '+1.5,-2.5', '+1,2', '-1,+2.5', '1.5,2', '-1,-2', '.5,1', 'a@', 'a-b_c.row-1', '1a', '_x.bottom@0.5', 'a.row.left@10', 'a.left.left', 'a.bottom@.', 'a.bottom@-', '+5,+6', '-5,-6.5', '5,-6', '', ' a', 'a ', 'a\n', 'é', 'a.é', '１,２', 'a.row.top', 'x.left.right@2', 'a.constructor', 'a.toString@0.3', 'a.__proto__.left', 't.valueOf.right', 'a.hasOwnProperty.left', 'a.toLocaleString@5', 'a.__proto__', 'a.__defineGetter__@-1', 'a.Constructor', 'a.constructor.constructor'];
  const parseEnds = ends.map((raw) => ({ raw, out: parseEnd(raw) }));

  const box = () => ({ x: int(-20, 200), y: int(-20, 200), w: int(0, 120), h: int(0, 120) });
  const autos = [];
  for (let i = 0; i < 200; i++) { const a = box(), b = box(); autos.push({ a, b, out: autoSides(a, b) }); }
  for (const [a, b] of [[{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 10, h: 10 }], [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }], [{ x: NaN, y: 0, w: 10, h: 10 }, { x: 0, y: 30, w: 10, h: 10 }]]) autos.push({ a, b, out: autoSides(a, b) });

  const sidePts = [];
  for (const shape of ['rect', 'diamond', 'ellipse', 'icon']) for (const side of ['top', 'bottom', 'left', 'right', 'constructor', 'toString', '__proto__'] as const) {
    for (const s of [{ x: 10, y: 20, w: 100, h: 60 }, { x: 5.5, y: 7.25, w: 33, h: 0 }, { x: 0, y: 0, w: 0, h: 40 }]) for (const v of [undefined, 0, 0.25, 1, 1.0001, 12, 50, 130, 5000, -3, NaN]) for (const f of [0.5, 0.2]) sidePts.push({ s, shape, side, v, f, out: sidePoint({ ...s, shape }, side, v, f) });
  }

  const mkEnd = (pt: Pt, dir: Pt | null) => ({ raw: '', kind: 'point', pt, dir } as End);
  const mkConn = (o: { a: Pt; da: Pt | null; b: Pt; db: Pt | null; ortho: boolean; p?: Record<string, string>; pts?: Pt[]; ushape?: boolean; curve?: boolean; text?: string }) =>
    ({ id: 'c', line: 1, style: 'line', p: o.p ?? {}, a: mkEnd(o.a, o.da), b: mkEnd(o.b, o.db), pts: o.pts ?? [], head: true, tail: false, headM: 'arrow', tailM: 'none', ortho: o.ortho, ushape: o.ushape ?? false, curve: o.curve ?? false, text: o.text } as Conn);
  const connIn = (c: Conn) => ({ a: c.a.pt, da: c.a.dir, b: c.b.pt, db: c.b.dir, ortho: c.ortho, p: c.p, pts: c.pts, ushape: c.ushape, curve: c.curve, text: c.text });

  const routes = [];
  for (let i = 0; i < 400; i++) {
    const a = i % 11 === 0 ? P(int(0, 3) * 50, int(0, 3) * 50) : P(int(-50, 250), int(-50, 250));
    const b = i % 13 === 0 ? P(a.x, int(-50, 250)) : i % 17 === 0 ? P(int(-50, 250), a.y) : P(int(-50, 250), int(-50, 250));
    const via = Array.from({ length: pick([0, 0, 0, 1, 2, 3]) }, () => (rnd() < 0.3 ? P(a.x, int(-50, 250)) : P(int(-50, 250), int(-50, 250))));
    const p = pick<Record<string, string>>([{}, {}, { loop: '20' }, { loop: 'x' }, { loop: '' }, { loop: '-5' }]);
    const c = mkConn({ a, da: pick(dirs), b, db: pick(dirs), ortho: i % 9 !== 0, p });
    const input = connIn(c);
    const out = route(c, via);
    routes.push({ ...input, via, out, ushape: c.ushape });
  }

  const curves = [];
  for (let i = 0; i < 200; i++) {
    const a = P(int(-50, 250), int(-50, 250)), b = i % 20 === 0 ? a : P(int(-50, 250), int(-50, 250));
    const via = Array.from({ length: pick([0, 0, 1, 2, 3]) }, () => P(int(-50, 250), int(-50, 250)));
    const bend = pick([NaN, NaN, 0, 30, -45.5, 100]);
    const d0 = pick(dirs), d1 = pick(dirs);
    curves.push({ a, d0, b, d1, via, bend, out: curvePts(a, d0, b, d1, via, bend) });
  }

  const alongs = [];
  for (const pts of [[P(0, 0), P(100, 0)], [P(10, 5), P(10, 95)], [P(0, 0), P(33, 77)], [P(0, 0), P(10, 10), P(30, 10)], [P(5, 5), P(5, 5)]]) for (const v of [-1, 0, 0.3333, 0.5, 1, 1.0001, 40, 500, NaN]) {
    const c = mkConn({ a: pts[0], da: null, b: pts[pts.length - 1], db: null, ortho: true, pts });
    alongs.push({ pts, v, out: pointAlong(c, v) });
  }

  const labels = [];
  const labelProps: Record<string, string>[] = [{}, { 'label.caps': '0' }, { 'label.size': '10', 'label.font': 'sans' }, { 'label.spacing': '0.3' }, { lpos: '120,80' }, { lpos: '120' }, { lpos: ',5' }, { lpos: ' 7 , 9 ' }, { lside: 'below' }, { lside: 'left' }, { lside: 'above' }, { lside: '' }, { 'label.size': 'x', 'label.font': '' }];
  const ltexts = ['go', 'Ünï çode ß', '😀 ok', 'a longer label text'];
  for (let i = 0; i < 300; i++) {
    const a = P(int(0, 200), int(0, 200)), b = P(int(0, 200), int(0, 200));
    const kind = i % 4;
    let pts: Pt[]; let curve = false, ushape = false;
    if (kind === 0) pts = [a, b];
    else if (kind === 1) pts = [a, P(b.x, a.y), b];
    else if (kind === 2) { ushape = true; pts = [a, P(a.x + 36, a.y), P(a.x + 36, b.y), b]; }
    else { curve = true; pts = curvePts(a, null, b, null, [], pick([NaN, 40])); }
    if (i % 7 === 0) { pts = [a, P(a.x, b.y)]; curve = false; ushape = false; }
    if (i % 29 === 0) { pts = [a, a]; curve = false; ushape = false; }
    const avoid = Array.from({ length: pick([0, 0, 1, 3]) }, () => ({ x: int(0, 200), y: int(0, 200), w: int(10, 80), h: int(10, 60) }));
    const c = mkConn({ a, da: null, b, db: null, ortho: true, pts, ushape, curve, p: pick(labelProps), text: i % 31 === 0 ? '' : pick(ltexts) });
    labels.push({ ...connIn(c), avoid, out: makeLabel(c, avoid) ?? null });
  }

  const tableCases: { text?: string; p: Record<string, string>; rows: { id?: string; kind: 'row' | 'head' | 'rule'; cells: string[]; p?: Record<string, string> }[]; minW: number }[] = [
    { text: 'users', p: {}, minW: 0, rows: [{ kind: 'head', cells: ['id', 'name'] }, { kind: 'row', cells: ['1', 'Ada Lovelace'] }, { kind: 'rule', cells: [] }, { kind: 'row', cells: ['2', 'Grace'], id: 'r2' }] },
    { p: {}, minW: 0, rows: [] },
    { text: 'one\ntwo\nthree', p: { 'title.size': '14', 'head.h': '28' }, minW: 0, rows: [{ kind: 'row', cells: ['a'] }] },
    { text: 'wide title that is much longer than the cells', p: {}, minW: 0, rows: [{ kind: 'row', cells: ['a', 'b'] }] },
    { text: 't', p: {}, minW: 300, rows: [{ kind: 'row', cells: ['a', 'b', 'c'] }] },
    { text: 't', p: {}, minW: 40, rows: [{ kind: 'row', cells: ['a very long cell here', 'b', 'c'] }] },
    { p: { align: 'center' }, minW: 0, rows: [{ kind: 'head', cells: ['k', 'value', 'longer header'] }, { kind: 'row', cells: ['x', '1', '22'] }, { kind: 'row', cells: ['spanning row'] }] },
    { p: {}, minW: 0, rows: [{ kind: 'row', cells: ['a', 'b'], id: 'dup' }, { kind: 'row', cells: ['c', 'd'], id: 'dup' }, { kind: 'row', cells: ['e', 'f'], id: 'dup' }] },
    { p: { 'cell.size': '12', 'cell.font': 'sans', 'row.h': '30', 'cell.pad': '8', 'cell.gap': '4' }, minW: 0, rows: [{ kind: 'head', cells: ['Name', 'Qty'] }, { kind: 'row', cells: ['Widget → ü', '日本'], p: { h: '40' } }, { kind: 'row', cells: ['😀'], p: { h: 'x' } }] },
    { text: 'chart', p: { 'title.font': 'serif', 'title.weight': '300', 'title.spacing': '0.2' }, minW: 0, rows: [{ kind: 'row', cells: ['bars', '1', '2'], id: 'bars' }, { kind: 'rule', cells: [] }, { kind: 'rule', cells: ['x'] }] },
    { p: { 'row.h': '10' }, minW: 0, rows: [{ kind: 'rule', cells: [] }] },
    { p: {}, minW: NaN, rows: [{ kind: 'row', cells: ['a', 'b'] }] },
  ];
  const tables = tableCases.map((t) => {
    const sh = { id: 'tbl', line: 1, style: 'table', p: t.p, shape: 'table', back: false, x: 20, y: 30, w: 0, h: 0, text: t.text } as Shape;
    const rows: Row[] = t.rows.map((r) => ({ id: r.id, kind: r.kind, cells: r.cells, vals: [], p: r.p ?? {}, y: 0, h: 0 }));
    const issues: [string, string][] = [];
    layoutTable(sh, rows, t.minW, (m) => issues.push(['error', m]), (m) => issues.push(['warn', m]));
    return { ...t, out: { w: sh.w, h: sh.h, headH: sh.headH, cols: sh.cols, rows: sh.rows!.map((r) => ({ y: r.y, h: r.h })), issues } };
  });

  const captions = [];
  const capP: Record<string, string>[] = [{}, { sub: 'sub line' }, { sub: 'one\ntwo', 'sub.size': '10', 'sub.font': 'sans' }, { 'title.size': '14', 'title.weight': '400', 'title.font': 'serif' }, { 'title.size': '0', 'sub.size': 'x', 'title.weight': 'bold' }, { sub: '' }];
  for (const shape of ['icon', 'rect']) for (const text of [undefined, '', 'Server', 'Line one\nLine two\nThree', 'Ünï →']) for (const p of capP) {
    const s = { id: 'i', line: 1, style: 'icon', p, shape, back: false, x: 50, y: 60, w: 40, h: 40, text } as Shape;
    captions.push({ shape, text: text ?? null, p, out: captionBox(s) });
  }

  const extents = [];
  const withLabel = (pts: Pt[], label?: Box) => {
    const c = mkConn({ a: pts[0], da: null, b: pts[pts.length - 1], db: null, ortho: true, pts });
    if (label) c.label = { ...label, text: '', cx: 0, baseline: 0, size: 8, spacing: 0, font: 'mono' };
    return c;
  };
  const ext = (shapes: Box[], texts: Box[], conns: Conn[]) => extents.push({ shapes, texts, conns: conns.map((c) => ({ pts: c.pts, label: c.label ? { x: c.label.x, y: c.label.y, w: c.label.w, h: c.label.h } : null })), out: extent(shapes, texts, conns) });
  ext([], [], []);
  ext([{ x: 0, y: 0, w: 0, h: 0 }], [], []);
  ext([{ x: 10, y: 20, w: 100, h: 50 }], [{ x: -30.5, y: 5, w: 20, h: 12.25 }], []);
  ext([{ x: 10, y: 20, w: 100, h: 50 }], [], [withLabel([P(0, 0), P(300, 0), P(300, 200)], { x: 280, y: 190, w: 60, h: 12 })]);
  ext([], [{ x: 3, y: 3, w: 1, h: 1 }], [withLabel([P(-100.5, 7)]), withLabel([P(5, 5), P(6, 6)])]);
  ext([{ x: NaN, y: 0, w: 10, h: 10 }], [], []);
  ext([{ x: 0, y: 0, w: 10, h: 10 }], [], [withLabel([P(Infinity, 0)])]);
  ext([{ x: -1e9, y: 0, w: 1e9, h: 7 }], [], []);
  for (let i = 0; i < 40; i++) ext(Array.from({ length: int(0, 3) }, box), Array.from({ length: int(0, 2) }, () => ({ x: int(-60, 60) + 0.5, y: int(-60, 60) * 1.1, w: int(0, 40), h: int(0, 30) / 3 })), Array.from({ length: int(0, 2) }, () => withLabel(Array.from({ length: int(1, 4) }, () => P(int(-100, 300), int(-100, 300) + 0.25)), rnd() < 0.5 ? box() : undefined)));

  return { tw, mt, parseEnds, autos, sidePts, routes, curves, alongs, labels, tables, captions, extents };
}

function chart() {
  const spans = [1, 7, 95, 0.03, 1e6, 0, -3, NaN, Infinity, 1e-300, 12.5, 6, 6.000001];
  return spans.flatMap((span) => [6, 4, 10].map((max) => ({ span, max, out: niceStep(span, max) })));
}

// Diagrams that reach the renderer's corners: spaces kept in text, every end marker, tags on outlines that are not
// boxes, chart scales and series of every kind, plates, patterns and sketched lines.
function render() {
  const texts = [
    'text "  indented  code" at 10,10\ntext "a  b" at 10,40 rotate=90\ntext "tab\there " at 10,70\ntext "echo  me" at 60,90 echo=accent anchor=middle\ntext "faint" at 0,120 color=ink/0.2 rotate=-90\ntext "two\\nlines" at 40,140 spacing=0.1 italic=1 weight=600 blend=multiply',
    // text boxes wrap where the drawn words reach the edge, in the look's own font
    'text "Orders are checked before payment" at 10,10 width=200 font=serif size=16\ntext "Sans words wrap here and there again" at 10,80 width=120 align=center\ntext "Mono lines break too" at 10,160 width=90 font=mono align=right caps=1 spacing=0.05',
  ];
  const marks = ['arrow', 'open', 'stealth', 'double', 'half', 'triangle', 'diamond', 'diamond-solid', 'square', 'square-solid', 'dot', 'circle', 'bar', 'cross', 'stop', 'one', 'only-one', 'many', 'one-many', 'zero-one', 'zero-many', 'none', 'bogus'];
  const conns = marks.map((m, i) => `a${i}: rect "A${i}" at 0,${i * 60} 80x40\nb${i}: rect "B${i}" at 240,${i * 60 + 10} 80x40 depth=6\na${i} -> b${i} "${m}" head=${m} tail=${marks[(i + 3) % marks.length]} head.size=1.5 casing=paper double=accent cap=round label.fill=soft label.border=ink label.weight=600 label.italic=1`).join('\n');
  const shapes = [
    'e: ellipse "Ellipse" sub="sub line" tag="TAG" at 0,0 120x60 fill=soft',
    'd: diamond "Diamond" tag="T" at 140,0 100x80 hatch=accent hatch.gap=4',
    'p: rect "Path" tag="PATH" at 260,0 120x80 shape=path path="M 0,0.3 C 0,0 1,0 1,0.3 L 1,1 L 0,1 Z" halftone=ink',
    'z: rect "Zone" tag="Z" at 0,120 200x100 title.pos=top title.fill=accent title.align=left shade=ink depth=4 inner=accent corners=plus',
    'z2: rect "Right" at 220,120 160x100 title.pos=top title.align=right title.dy=6 fill=soft corners=square radius=8',
    'i: rect "Icon top" sub="s" at 0,240 120x80 icon=database icon.pos=top icon.style=duotone',
    'i2: rect "Left" at 140,240 120x80 icon=settings title.align=left icon.width=2 icon.fill=soft',
    'i3: rect at 280,240 60x60 icon=cloud icon.style=solid ghost="7"',
    'a1: arc "Slice" at 0,340 120x120 from=30 to=200 inner=0.5',
    'a2: arc at 140,340 120x120 from=0 to=360 inner=0.4',
    'a3: arc at 280,340 120x120 from=-40 to=90 open=1',
    'g: polygon "Tri" at 0,480 points=0,100;60,0;120,100 smooth=1 offset=3,3 fill=soft',
    'g2: polygon at 140,480 points=0,0;60,40;120,0 open=1 smooth=1',
    'f: rect "Offset" at 280,480 100x60 offset=2,-2 blend=multiply fill=accent/0.3 hatch=ink',
    'tg: rect "A tag\\nthat is tight" tag="LONGER TAG" at 0,600 90x40',
    'ic: icon "Caption" sub="under" at 140,600 icon=database fill=soft stroke=accent sw=1.5 title.caps=1',
  ].join('\n');
  const table = 'tb: table "Ledger\\nTwo lines" at 0,0 grid=1 title.align=left title.caps=1 align=center\n  | h "ID" "Name" "Note" fill=accent/0.1\n  | a "1" "Alpha" "" fill.2=accent/0.2 color.2=accent\n  | ---\n  | b "2" "Beta" "x" fill=none';
  const legend = 'legend at 0,0 title="Key" line.accent="A line" dot.ink="A dot" swatch.soft="A swatch" rect="A style" text="Text style" arrow="Arrow"';
  const charts = [
    'c: chart "Stacked" at 60,60 400x200 x="Q1,Q2,Q3" stack=1 labels=1 ytitle="Units" unit="k" prefix="$"\n  | bars "One" 10 20 _ stroke=ink fill=soft\n  | bars "Two" 5 -8 12 fill.2=accent\n  | line "Trend" 12 18 15 dots=1 dash=4,2',
    'c: chart at 60,60 400x200 x=0..10 xstep=2 y=-5..20 grid=both xunit=s step=0\n  | dots "Pts" 1,2 3,4,8 5,-2 9,19 fill=accent stroke=ink opacity=0.5\n  | area 0,0 4,10 10,5\n  | line "L" 2,3 _ 8,8',
    'c: chart "Floating" at 60,60 400x200 x="a, b ,c,d" labels=1 grid=x key=0 bar.width=0.9 bar.radius=0\n  | bars 0,10 10,25 25,18 18,30\n  | dots 4 8 12 r=3',
    'c: chart at 60,60 400x200 y=1e20..1e21 grid=0 yaxis=0 zero=0\n  | line 5 2 3 _ 4',
    'c: chart at 60,60 400x200 x="only"\n  | bars "_" _ _',
  ];
  // a route that simplifies to one point (the caption box is an obstacle): the line draws nothing
  const onePoint = 'ic: icon "Caption" at 100,100 icon=database\n112,137 -> 112,137';
  // the page patterns a diagram's canvas line can pick, gaps held at their minimum, and the triangle lattice's height
  const pages = 'canvas paper=#ffffff dots=none grid=ink/0.07 gridgap=2 lines=ink/0.08 linegap=17 cross=accent crossgap=3 iso=ink/0.14 isogap=13 bars=ink/0.03\na: node "A" at 40,40';
  const pages2 = 'canvas dots=none diag=ink/0.06 diaggap=7 graph=accent graphgap=3 hex=ink/0.08 hexgap=11\na: node "A" at 40,40';
  const sources = [...texts, conns, shapes, table, legend, ...charts, onePoint, pages, pages2];
  return sources.flatMap((src) => [src, `look sketch\n${src}`].map((s) => ({ src: s, svg: renderSvg(buildScene(s, null, '')) })));
}

const sections: Record<string, () => unknown> = { sketch, router, sort, scene, chart, render };
const out: Record<string, unknown> = {};
for (const [name, fn] of Object.entries(sections)) out[name] = fn();
const nonFinite = (_: string, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v);
process.stdout.write(JSON.stringify(out, nonFinite) + '\n');
