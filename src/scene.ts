// Turns a diagram file into a resolved scene: shapes, texts and routed connectors.
import { parseStatements } from './parse.ts';
import type { Stmt } from './parse.ts';
import { emptyLook, defaultLook } from './look.ts';
import type { Kind } from './look.ts';
import type { Look, Props, Issue } from './look.ts';
import { crosses, routeAround } from './router.ts';

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Side = 'top' | 'bottom' | 'left' | 'right';
// style is the key written in the legend statement: a style name, or swatch.colour / dot.colour / line.colour
export type LegendItem = { style: string; kind: Kind; label: string; x: number; baseline: number; sample: number; props?: Props };
// One row of a table box. y and h are filled in by the layout; a 'rule' row is a dividing line with no height.
// On a chart a row is one series: id is its kind (bars, line, area, dots), cells[0] its name, vals its numbers.
export type Row = { id?: string; kind: 'row' | 'head' | 'rule'; cells: string[]; vals: string[]; p: Props; y: number; h: number };
export type Col = { x: number; w: number };
export type Shape = Box & {
  id: string; line: number; style: string; p: Props; shape: string; text?: string; back: boolean; legend?: LegendItem[];
  rows?: Row[]; cols?: Col[]; headH?: number;
  poly?: Pt[]; // shape=polygon: its corners on the canvas
};
export type TextEl = Box & { id: string; line: number; style: string; p: Props; text: string; ax: number; ay: number };
export type End = {
  raw: string; kind: 'point' | 'rel' | 'shape' | 'conn';
  id?: string; row?: string; side?: Side; v?: number; rel?: Pt;
  pt: Pt; dir: Pt | null; fanned?: boolean;
};
export type Label = Box & { text: string; cx: number; baseline: number; size: number; spacing: number; font: string };
export type Conn = {
  id: string; line: number; style: string; p: Props;
  a: End; b: End; pts: Pt[]; head: boolean; tail: boolean; headM: string; tailM: string; ortho: boolean; ushape: boolean;
  curve: boolean; // route=curve: pts holds the smooth line as many short steps
  text?: string; label?: Label;
};
export type Scene = {
  file: string; w: number; h: number; look: Look; canvasLine?: number;
  fontFiles?: string[]; // extra font files the look brings (command line only)
  shapes: Shape[]; texts: TextEl[]; conns: Conn[]; issues: Issue[];
};

// What can sit on the end of a line. The last six are the entity-relationship cardinalities.
export const SERIES = ['bars', 'line', 'area', 'dots'];
export const MARKERS = ['none', 'arrow', 'open', 'triangle', 'diamond', 'diamond-solid', 'dot', 'circle', 'one', 'only-one', 'many', 'one-many', 'zero-one', 'zero-many'];

const DIRS: Record<Side, Pt> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const num = (v: string | undefined, d: number) => (v === undefined || v === '' || isNaN(+v) ? d : +v);

export function textWidth(text: string, size: number, font: string, weight: number, spacing: number): number {
  const f = font === 'mono' ? 0.6 : font === 'serif' ? 0.46 : weight >= 600 ? 0.58 : 0.56;
  return text.length * size * (f + spacing);
}

const cx = (b: Box) => b.x + b.w / 2;
const cy = (b: Box) => b.y + b.h / 2;
const within = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

function autoSides(A: Box, B: Box): [Side, Side] {
  if (within(cx(A), B.x, B.x + B.w) || within(cx(B), A.x, A.x + A.w)) return cy(A) <= cy(B) ? ['bottom', 'top'] : ['top', 'bottom'];
  if (within(cy(A), B.y, B.y + B.h) || within(cy(B), A.y, A.y + A.h)) return cx(A) <= cx(B) ? ['right', 'left'] : ['left', 'right'];
  return [cx(B) > cx(A) ? 'right' : 'left', cy(A) < cy(B) ? 'top' : 'bottom'];
}

// Point on a shape's side. v: undefined = use fraction f; <= 1 = fraction; > 1 = absolute coordinate.
function sidePoint(s: Box & { shape?: string }, side: Side, v: number | undefined, f: number): Pt {
  const horiz = side === 'top' || side === 'bottom';
  const frac = v !== undefined && v <= 1 ? v : f;
  let along = v !== undefined && v > 1 ? v : horiz ? s.x + frac * s.w : s.y + frac * s.h;
  along = Math.round(Math.min(Math.max(along, horiz ? s.x : s.y), horiz ? s.x + s.w : s.y + s.h));
  let inset = 0;
  const t = horiz ? Math.abs(along - cx(s)) / (s.w / 2 || 1) : Math.abs(along - cy(s)) / (s.h / 2 || 1);
  const half = horiz ? s.h / 2 : s.w / 2;
  if (s.shape === 'diamond') inset = half * t;
  else if (s.shape === 'ellipse') inset = half * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
  inset = Math.round(inset);
  if (side === 'top') return { x: along, y: s.y + inset };
  if (side === 'bottom') return { x: along, y: s.y + s.h - inset };
  if (side === 'left') return { x: s.x + inset, y: along };
  return { x: s.x + s.w - inset, y: along };
}

function corner(A: Pt, B: Pt, horizFirst: boolean): Pt {
  return horizFirst ? { x: B.x, y: A.y } : { x: A.x, y: B.y };
}

function route(c: Conn, via: Pt[]): Pt[] {
  const P0 = c.a.pt, P1 = c.b.pt, d0 = c.a.dir, d1 = c.b.dir;
  if (!c.ortho) return [P0, ...via, P1];
  if (via.length === 0) {
    const aligned = P0.x === P1.x || P0.y === P1.y;
    if (d0 && d1) {
      const h0 = d0.x !== 0, h1 = d1.x !== 0;
      if (h0 !== h1) return [P0, corner(P0, P1, h0), P1];
      const same = d0.x === d1.x && d0.y === d1.y;
      if (same) {
        c.ushape = true;
        const off = num(c.p.loop, 36);
        if (h0) { const ox = d0.x > 0 ? Math.max(P0.x, P1.x) + off : Math.min(P0.x, P1.x) - off; return [P0, { x: ox, y: P0.y }, { x: ox, y: P1.y }, P1]; }
        const oy = d0.y > 0 ? Math.max(P0.y, P1.y) + off : Math.min(P0.y, P1.y) - off;
        return [P0, { x: P0.x, y: oy }, { x: P1.x, y: oy }, P1];
      }
      if (h0 ? P0.y === P1.y : P0.x === P1.x) return [P0, P1];
      if (h0) { const mx = Math.round((P0.x + P1.x) / 2); return [P0, { x: mx, y: P0.y }, { x: mx, y: P1.y }, P1]; }
      const my = Math.round((P0.y + P1.y) / 2);
      return [P0, { x: P0.x, y: my }, { x: P1.x, y: my }, P1];
    }
    if (aligned) return [P0, P1];
    if (d0) return [P0, corner(P0, P1, d0.x !== 0), P1];
    if (d1) return [P0, corner(P0, P1, d1.x === 0), P1];
    return [P0, corner(P0, P1, true), P1];
  }
  const pts = [P0, ...via, P1];
  const out: Pt[] = [P0];
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    if (A.x !== B.x && A.y !== B.y) {
      let hf: boolean;
      if (i === pts.length - 2 && d1) hf = d1.x === 0;
      else if (i === 0 && d0) hf = d0.x !== 0;
      else { const prev = out[out.length - 2]; hf = prev ? prev.y !== A.y : true; }
      out.push(corner(A, B, hf));
    }
    out.push(B);
  }
  return out;
}

// A smooth line from P0 to P1, returned as short straight steps so everything else can treat it as a polyline.
// With via points it passes through each of them. With bend it bows that many px to the left of its direction
// of travel (negative: to the right). Otherwise it leaves and arrives along the sides it is attached to.
function curvePts(P0: Pt, d0: Pt | null, P1: Pt, d1: Pt | null, via: Pt[], bend: number): Pt[] {
  const segs: [Pt, Pt, Pt, Pt][] = [];
  const dx = P1.x - P0.x, dy = P1.y - P0.y, dist = Math.hypot(dx, dy) || 1;
  if (via.length) {
    const P = [P0, ...via, P1];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] ?? P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] ?? P[i + 1];
      segs.push([p1, { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, p2]);
    }
  } else if (!isNaN(bend)) {
    const ox = (dy / dist) * bend * (4 / 3), oy = (-dx / dist) * bend * (4 / 3);
    segs.push([P0, { x: P0.x + dx / 3 + ox, y: P0.y + dy / 3 + oy }, { x: P0.x + (2 * dx) / 3 + ox, y: P0.y + (2 * dy) / 3 + oy }, P1]);
  } else {
    const k = Math.min(Math.max(dist * 0.4, 24), 160);
    const flat = Math.abs(dx) >= Math.abs(dy);
    const u0 = d0 ?? (flat ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 });
    const u1 = d1 ?? (flat ? { x: -(Math.sign(dx) || 1), y: 0 } : { x: 0, y: -(Math.sign(dy) || 1) });
    segs.push([P0, { x: P0.x + u0.x * k, y: P0.y + u0.y * k }, { x: P1.x + u1.x * k, y: P1.y + u1.y * k }, P1]);
  }
  const out: Pt[] = [P0];
  const N = 24;
  for (const [a, b, c, d] of segs) for (let i = 1; i <= N; i++) {
    const t = i / N, m = 1 - t;
    const f = (p: 'x' | 'y') => m * m * m * a[p] + 3 * m * m * t * b[p] + 3 * m * t * t * c[p] + t * t * t * d[p];
    out.push(i === N ? d : { x: Math.round(f('x') * 10) / 10, y: Math.round(f('y') * 10) / 10 });
  }
  return out;
}

function pointAlong(c: Conn, v: number): Pt {
  const first = c.pts[0], last = c.pts[c.pts.length - 1];
  if (v > 1) {
    if (first.x === last.x) return { x: first.x, y: v };
    if (first.y === last.y) return { x: v, y: first.y };
  }
  const f = Math.min(Math.max(v, 0), 1);
  return { x: Math.round(first.x + (last.x - first.x) * f), y: Math.round(first.y + (last.y - first.y) * f) };
}

function makeLabel(c: Conn, avoid: Box[] = []): Label | undefined {
  if (!c.text) return undefined;
  const size = num(c.p['label.size'], 8), spacing = num(c.p['label.spacing'], 0.08), font = c.p['label.font'] ?? 'mono';
  const text = c.p['label.caps'] === '0' ? c.text : c.text.toUpperCase();
  const w = Math.ceil((textWidth(text, size, font, 400, spacing) + 12) / 4) * 4, h = size + 4;
  if (c.p.lpos) {
    const [lx, ly] = c.p.lpos.split(',').map(Number);
    return { text, cx: lx, baseline: ly, x: lx - w / 2, y: ly - h + 2, w, h, size, spacing, font };
  }
  let best = 0;
  if (c.curve) best = Math.floor((c.pts.length - 1) / 2); // the middle of the curve
  else if (c.ushape && c.pts.length === 4) best = 1;
  else {
    let len = -1;
    for (let i = 0; i < c.pts.length - 1; i++) {
      const l = Math.abs(c.pts[i + 1].x - c.pts[i].x) + Math.abs(c.pts[i + 1].y - c.pts[i].y);
      if (l > len) { len = l; best = i; }
    }
  }
  const A = c.pts[best], B = c.pts[best + 1];
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  // with no side asked for, a label that would land on a box goes to the other side of its line
  const at = (side: string | undefined): Label => {
    if (c.curve) {
      // beside the middle of the curve, pushed out square to it far enough to clear the line
      const P = c.pts[best], Q = c.pts[Math.min(best + 1, c.pts.length - 1)], O = c.pts[Math.max(best - 1, 0)];
      const tx = Q.x - O.x, ty = Q.y - O.y, tl = Math.hypot(tx, ty) || 1;
      let nx = ty / tl, ny = -tx / tl;
      if (ny > 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; } // up, or right of a vertical stretch
      if (side === 'below' || side === 'left') { nx = -nx; ny = -ny; }
      const off = 6 + (Math.abs(nx) * w + Math.abs(ny) * h) / 2;
      const lx = Math.round(P.x + nx * off), ly = Math.round(P.y + ny * off);
      return { text, cx: lx, baseline: ly + h / 2 - 3, x: lx - w / 2, y: ly - h / 2, w, h, size, spacing, font };
    }
    if (A.x === B.x && A.y !== B.y) {
      const x = side === 'left' ? A.x - 8 - w : A.x + 8;
      return { text, cx: x + w / 2, baseline: Math.round(my) + 3, x, y: Math.round(my) - h + 5, w, h, size, spacing, font };
    }
    const baseline = side === 'below' ? Math.round(my) + 18 : Math.round(my) - 10;
    return { text, cx: Math.round(mx), baseline, x: Math.round(mx) - w / 2, y: baseline - h + 2, w, h, size, spacing, font };
  };
  const hits = (l: Label) => avoid.some((o) => l.x < o.x + o.w && l.x + l.w > o.x && l.y < o.y + o.h && l.y + l.h > o.y);
  const first = at(c.p.lside);
  if (c.p.lside || !hits(first)) return first;
  const other = at(A.x === B.x && A.y !== B.y ? 'left' : 'below');
  return hits(other) ? first : other;
}

// Lays out a table box: a header with the title, then rows of cells in columns. The height always follows the rows.
function layoutTable(sh: Shape, rows: Row[], minW: number, err: (m: string) => void): void {
  const p = sh.p;
  const fs = num(p['cell.size'], 10), font = p['cell.font'] ?? 'mono';
  const rowH = num(p['row.h'], 24), pad = num(p['cell.pad'], 12), gap = num(p['cell.gap'], 16);
  const headH = sh.text ? num(p['head.h'], 32) : 0;
  const n = Math.max(0, ...rows.map((r) => r.cells.length));
  const widths: number[] = [];
  for (let j = 0; j < n; j++) widths.push(Math.max(...rows.map((r) => (r.cells[j] === undefined ? 0 : textWidth(r.cells[j], fs, font, r.kind === 'head' ? 600 : 400, 0)))));
  if (p.align === 'center' && n > 1) { const m = Math.max(...widths.slice(1)); for (let j = 1; j < n; j++) widths[j] = m; }
  const natural = n ? pad * 2 + widths.reduce((a, b) => a + b, 0) + gap * (n - 1) : 0;
  const titleW = sh.text ? textWidth(sh.text, num(p['title.size'], 12), p['title.font'] ?? 'sans', num(p['title.weight'], 600), num(p['title.spacing'], 0)) + pad * 2 : 0;
  const W = Math.ceil(Math.max(minW, natural, titleW, 48) / 4) * 4;
  if (n) widths[0] += W - natural; // spare width goes to the first column, so the others sit against the right edge
  const cols: Col[] = [];
  let x = pad;
  for (const w of widths) { cols.push({ x, w }); x += w + gap; }
  let y = sh.y + headH;
  const seen = new Set<string>();
  for (const r of rows) {
    r.y = y; r.h = r.kind === 'rule' ? 0 : num(r.p.h, rowH); y += r.h;
    if (r.id) { if (seen.has(r.id)) err(`the row id "${r.id}" is used twice in ${sh.id}`); seen.add(r.id); }
  }
  sh.w = W; sh.h = Math.max(y - sh.y, rowH);
  sh.rows = rows; sh.cols = cols; sh.headH = headH;
}

function parseEnd(raw: string): End | null {
  const base = { raw, pt: { x: 0, y: 0 }, dir: null };
  // relative end: starts with "+", or both numbers carry a sign (+0,260  +40,-20  -40,+0)
  let m = /^(\+\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)$/.exec(raw) ?? /^([+-]\d+(?:\.\d+)?),([+-]\d+(?:\.\d+)?)$/.exec(raw);
  if (m) return { ...base, kind: 'rel', rel: { x: +m[1], y: +m[2] } };
  m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(raw);
  if (m) return { ...base, kind: 'point', pt: { x: +m[1], y: +m[2] } };
  // id, id.side, id.side@pos, and for a table row: id.row or id.row.left|right
  m = /^([A-Za-z_][\w-]*)(?:\.([A-Za-z_][\w-]*))?(?:\.(left|right))?(?:@(-?[\d.]+))?$/.exec(raw);
  if (m) {
    const isSide = m[2] !== undefined && m[2] in DIRS;
    if (isSide && m[3]) return null;
    return { ...base, kind: 'shape', id: m[1], row: isSide ? undefined : m[2], side: (isSide ? m[2] : m[3]) as Side | undefined, v: m[4] === undefined ? undefined : +m[4] };
  }
  return null;
}

// The path in the diagram's `look "..."` statement, if it has one.
export function lookPath(src: string): string | undefined {
  const st = parseStatements(src).find((s) => s.toks[0]?.t === 'word' && s.toks[0].v === 'look');
  return st?.toks[1]?.v;
}

// lookIn: the already-parsed look the diagram points to, or null if it could not be found.
export function buildScene(src: string, lookIn: Look | null, file = ''): Scene {
  const issues: Issue[] = [];
  const err = (line: number, msg: string) => issues.push({ line, level: 'error', msg });
  const warn = (line: number, msg: string) => issues.push({ line, level: 'warn', msg });
  const stmts: Stmt[] = parseStatements(src);

  const hasLookStmt = stmts.some((s) => s.toks[0]?.t === 'word' && s.toks[0].v === 'look');
  const look: Look = lookIn ?? (hasLookStmt ? emptyLook() : defaultLook());
  const lookStmt = stmts.find((s) => s.toks[0]?.v === 'look' && s.toks[0].t === 'word');
  if (lookStmt) {
    const p = lookStmt.toks[1]?.v;
    if (!p) err(lookStmt.line, 'look needs a path, e.g. look "./team.look"');
    else if (!lookIn) err(lookStmt.line, `look file not found: ${p}`);
    else for (const i of look.issues) issues.push({ ...i, line: lookStmt.line, msg: `${i.msg} (in look, line ${i.line})` });
  }

  const shapes: Shape[] = [], texts: TextEl[] = [], conns: Conn[] = [];
  const ids = new Map<string, 'shape' | 'text' | 'conn'>();
  let canvas: { w: number; h: number } | null = null;
  let canvasLine: number | undefined;
  const unplaced: Shape[] = [];
  const styleNames = () => [...look.styles.values()];

  for (const st of stmts) {
    const toks = st.toks;
    const first = toks[0];
    if (first.t === 'word' && first.v === 'look') continue;
    if (first.t === 'word' && first.v === 'canvas') {
      const m = /^(\d+)x(\d+)$/.exec(toks[1]?.v ?? '');
      if (!m) err(st.line, 'canvas needs a size, e.g. canvas 1000x480');
      else { canvas = { w: +m[1], h: +m[2] }; canvasLine = st.line; }
      continue;
    }
    let i = 0;
    let id: string | undefined;
    if (first.t === 'word' && first.v.endsWith(':') && first.v.length > 1) { id = first.v.slice(0, -1); i = 1; }
    const opIdx = toks.findIndex((t) => t.t === 'word' && (t.v === '->' || t.v === '--' || t.v === '<->'));
    const register = (kind: 'shape' | 'text' | 'conn', auto: string): string => {
      const finalId = id ?? `_${auto}${st.line}`;
      if (ids.has(finalId)) err(st.line, `the id "${finalId}" is already used; ids must be unique`);
      ids.set(finalId, kind);
      return finalId;
    };

    if (opIdx >= 0) {
      const aTok = toks[opIdx - 1], bTok = toks[opIdx + 1];
      if (!aTok || opIdx - 1 < i || !bTok) { err(st.line, 'a connector needs something on both sides, e.g. a -> b'); continue; }
      const a = parseEnd(aTok.v), b = parseEnd(bTok.v);
      if (!a || !b) { err(st.line, `cannot read the connector end "${!a ? aTok.v : bTok.v}"; use an id, id.side, id.side@pos, id@pos or x,y`); continue; }
      const op = toks[opIdx].v;
      const over: Props = {};
      let text: string | undefined;
      for (const t of toks.slice(opIdx + 2)) {
        if (t.t === 'str') text = text ?? t.v;
        else if (t.t === 'prop') over[t.k!] = t.v;
        else err(st.line, `unexpected word "${t.v}" after the connector; properties look like key=value`);
      }
      const styleName = over.style ?? (op === '--' ? 'line' : 'arrow');
      const style = look.styles.get(styleName);
      if (!style || style.kind !== 'line') {
        err(st.line, `"${styleName}" is not a line style in the look; line styles: ${styleNames().filter((s) => s.kind === 'line').map((s) => s.name).join(', ')}`);
        continue;
      }
      const p = { ...style.props, ...over };
      if (p.route && !['ortho', 'straight', 'curve'].includes(p.route)) err(st.line, `route=${p.route} is not a route; use ortho, straight or curve`);
      // -> and <-> put the style's head on the line; head= and tail= on the statement choose any marker for either end
      const styleHead = style.props.head && style.props.head !== 'none' ? style.props.head : 'arrow';
      const headM = over.head ?? (op === '--' ? 'none' : styleHead);
      const tailM = over.tail ?? (op === '<->' ? headM : op === '--' ? 'none' : style.props.tail ?? 'none');
      for (const mk of [headM, tailM]) if (!MARKERS.includes(mk)) err(st.line, `"${mk}" is not an end marker; use one of: ${MARKERS.join(', ')}`);
      const ok = (mk: string) => (MARKERS.includes(mk) ? mk : 'arrow');
      conns.push({
        id: register('conn', 'c'), line: st.line, style: styleName, p, a, b, pts: [],
        head: headM !== 'none', tail: tailM !== 'none', headM: ok(headM), tailM: ok(tailM),
        ortho: (p.route ?? 'ortho') === 'ortho', curve: p.route === 'curve', ushape: false, text,
      });
      continue;
    }

    const kindTok = toks[i++];
    if (!kindTok || kindTok.t !== 'word') { err(st.line, 'expected: id: style "text" at x,y'); continue; }
    let style = look.styles.get(kindTok.v);
    if (!style || style.kind === 'line') {
      err(st.line, `unknown style "${kindTok.v}"; available: ${styleNames().filter((s) => s.kind !== 'line').map((s) => s.name).join(', ')}`);
      continue;
    }
    let text: string | undefined, at: Pt | undefined, size: { w: number; h: number } | undefined;
    const over: Props = {};
    const rows: Row[] = [];
    for (; i < toks.length; i++) {
      const t = toks[i];
      if (t.t === 'word' && (t.v === '|' || t.v === '|=')) { rows.push({ kind: t.v === '|' ? 'row' : 'head', cells: [], vals: [], p: {}, y: 0, h: 0 }); continue; }
      const row = rows[rows.length - 1];
      if (row) {
        // everything after a "|" belongs to that row: an optional id, then one "text" per column
        if (t.t === 'str') row.cells.push(t.v);
        else if (t.t === 'prop') row.p[t.k!] = t.v;
        else if (t.v === '---' && !row.cells.length && !row.id) row.kind = 'rule';
        else if (!row.id && !row.cells.length && /^[A-Za-z_][\w-]*$/.test(t.v) && !(t.v in DIRS)) row.id = t.v;
        else if (/^([+-]?\d*\.?\d+(,[+-]?\d*\.?\d+)?|_)$/.test(t.v)) row.vals.push(t.v); // a number, a pair (3,40), or _ for no value
        else err(st.line, `unexpected word "${t.v}" in a table row; a row is: | id "cell" "cell" (the id is optional, and cannot be top, bottom, left or right)`);
        continue;
      }
      if (t.t === 'str') text = text ?? t.v;
      else if (t.t === 'prop') over[t.k!] = t.v;
      else if (t.v === 'at') {
        const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(toks[++i]?.v ?? '');
        if (!m) err(st.line, 'after "at" write the position as x,y with no space, e.g. at 40,240');
        else at = { x: +m[1], y: +m[2] };
      } else if (/^\d+(\.\d+)?x\d+(\.\d+)?$/.test(t.v)) {
        const [w, h] = t.v.split('x').map(Number); size = { w, h };
      } else err(st.line, `unexpected word "${t.v}"; properties look like key=value and text goes in "quotes"`);
    }
    let base = style.props;
    let styleName = style.name;
    if (over.style) {
      const s2 = look.styles.get(over.style);
      if (!s2 || s2.kind !== style.kind) err(st.line, `style=${over.style} is not a ${style.kind} style in the look`);
      else { base = { ...base, ...s2.props }; styleName = s2.name; }
    }
    const p = { ...base, ...over };
    if (style.kind === 'text') {
      if (!at) { err(st.line, 'text needs a position: at x,y'); continue; }
      const fs = num(p.size, 12);
      const lines = (text ?? '').split('\n');
      const t2 = p.caps === '1' ? (text ?? '').toUpperCase() : text ?? '';
      const w = Math.max(...lines.map((l) => textWidth(l, fs, p.font ?? 'sans', num(p.weight, 400), num(p.spacing, 0))));
      const anchor = p.anchor ?? 'start';
      const x = anchor === 'middle' ? at.x - w / 2 : anchor === 'end' ? at.x - w : at.x;
      const th = fs * 1.3 * lines.length;
      // rotate=-90 reads upwards, rotate=90 downwards; the text turns about its "at" point
      const rot = num(p.rotate, 0);
      if (p.rotate !== undefined && ![0, 90, -90].includes(rot)) err(st.line, `rotate=${p.rotate}: text can be turned by 90 (reading down) or -90 (reading up)`);
      const dx = x - at.x; // where the text starts, measured along its own baseline
      const box = rot === -90 ? { x: at.x - fs, y: at.y - dx - w, w: th, h: w } : rot === 90 ? { x: at.x - th + fs, y: at.y + dx, w: th, h: w } : { x, y: at.y - fs, w, h: th };
      texts.push({ id: register('text', 't'), line: st.line, style: styleName, p, text: t2, ax: at.x, ay: at.y, ...box });
      continue;
    }
    if (!size && p.size) { const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(p.size); if (m) size = { w: +m[1], h: +m[2] }; }
    const size0 = size;
    size = size ?? { w: 120, h: 48 };
    const sh: Shape = {
      id: register('shape', 's'), line: st.line, style: styleName, p, shape: p.shape ?? 'rect', text,
      back: p.layer === 'back', x: at?.x ?? 0, y: at?.y ?? 0, w: size.w, h: size.h,
    };
    if (sh.shape === 'polygon') {
      // points are written relative to the element's position; a given WxH stretches them to fit
      const rel = (p.points ?? '').split(';').filter(Boolean).map((q) => { const [x, y] = q.split(',').map(Number); return { x, y }; });
      if (rel.length < 2 || rel.some((q) => isNaN(q.x) || isNaN(q.y))) err(st.line, 'a polygon needs its corners: points=x,y;x,y;x,y measured from its "at" position, e.g. points=60,0;120,100;0,100');
      else {
        const nw = Math.max(...rel.map((q) => q.x)), nh = Math.max(...rel.map((q) => q.y));
        if (rel.some((q) => q.x < 0 || q.y < 0)) err(st.line, 'polygon points cannot be negative; they are measured from the "at" position, which is the top-left of the shape');
        if (!size0) { sh.w = nw; sh.h = nh; }
        const kx = nw ? sh.w / nw : 1, ky = nh ? sh.h / nh : 1;
        sh.poly = rel.map((q) => ({ x: Math.round((sh.x + q.x * kx) * 100) / 100, y: Math.round((sh.y + q.y * ky) * 100) / 100 }));
      }
    }
    if (sh.shape === 'arc') for (const k of ['from', 'to', 'inner']) if (p[k] !== undefined && isNaN(+p[k])) err(st.line, `${k}=${p[k]} must be a number (from= and to= are degrees clockwise from the top; inner= is 0 to 1)`);
    if (sh.shape === 'table') layoutTable(sh, rows, size0?.w ?? 0, (m) => err(st.line, m));
    else if (sh.shape === 'chart') {
      sh.rows = rows;
      if (!size0) err(st.line, 'a chart needs a size for its plot area: at x,y WxH');
      for (const k of ['step', 'xstep']) if (p[k] !== undefined && !(Number(p[k]) > 0)) err(st.line, `${k}=${p[k]} must be a number above 0`);
      for (const k of ['x', 'y']) { const m = /^(-?[\d.]+)\.\.(-?[\d.]+)$/.exec(p[k] ?? ''); if (m && !(+m[2] > +m[1])) err(st.line, `${k}=${p[k]} must run upwards, e.g. ${k}=0..100`); }
      const n = p.x && !/^-?[\d.]+\.\.-?[\d.]+$/.test(p.x) ? p.x.split(',').length : 0;
      for (const r of rows) {
        if (!r.id || !SERIES.includes(r.id)) err(st.line, `a chart row starts with the kind of series: ${SERIES.join(', ')}; e.g. | bars "Revenue" 42 61 75`);
        else if (!r.vals.length) err(st.line, `the ${r.id} series ${r.cells[0] ? `"${r.cells[0]}" ` : ''}has no numbers; write them after the name: | ${r.id} "Name" 42 61 75`);
        else if (n && r.vals.length !== n && !r.vals[0].includes(',')) warn(st.line, `the ${r.id} series ${r.cells[0] ? `"${r.cells[0]}" ` : ''}has ${r.vals.length} values but x= names ${n} categories`);
      }
    }
    else if (rows.length) err(st.line, `rows (the parts starting with "|") only work on a table style; "${styleName}" is not one`);
    if (sh.shape === 'legend') {
      // one statement lays out a whole legend: every style="label" pair is an entry
      const adhoc = (k: string) => /^(swatch|dot|line)\.(.+)$/.exec(k);
      const entries = Object.entries(over).filter(([k]) => k !== 'style' && (look.styles.has(k) || adhoc(k)));
      const fs = num(p['item.size'], 8.5), font = p['item.font'] ?? 'sans';
      const W = size0 ? sh.w : canvas ? Math.max(200, canvas.w - 2 * sh.x) : 920;
      const titled = (p.title ?? 'none') !== 'none';
      const items: LegendItem[] = entries.map(([k, label]): LegendItem => {
        const m = adhoc(k);
        if (m) {
          // an entry for something that is not a style of the look: a colour swatch, a dot or a line
          const c = m[2];
          if (m[1] === 'line') return { style: k, kind: 'line', label, x: 0, baseline: 0, sample: 28, props: { stroke: c, sw: '1.6', head: 'none' } };
          return { style: k, kind: 'shape', label, x: 0, baseline: 0, sample: 14, props: m[1] === 'dot' ? { shape: 'dot', fill: c, stroke: 'none' } : { shape: 'rect', fill: c, stroke: 'none', radius: '2' } };
        }
        const st = look.styles.get(k)!;
        const sample = st.kind === 'line' ? 28 : st.kind === 'text' ? 16 : st.props.shape === 'diamond' ? 22 : 14;
        return { style: k, kind: st.kind, label, x: 0, baseline: 0, sample };
      });
      const widths = items.map((it) => it.sample + 6 + textWidth(it.label, fs, font, 400, 0));
      const rows: number[][] = [[]];
      let run = 0;
      widths.forEach((w, i) => {
        const row = rows[rows.length - 1];
        if (row.length && run + 20 + w > W) { rows.push([i]); run = w; } else { run += (row.length ? 20 : 0) + w; row.push(i); }
      });
      const first = sh.y + (titled ? 40 : 20);
      rows.forEach((row, r) => {
        const sum = row.reduce((a, i) => a + widths[i], 0);
        const gap = rows.length === 1 && row.length > 1 ? Math.min(64, Math.max(20, (W - sum) / (row.length - 1))) : 24;
        let x = sh.x;
        for (const i of row) { items[i].x = Math.round(x); items[i].baseline = first + r * 20; x += widths[i] + gap; }
      });
      sh.w = W; sh.h = (titled ? 40 : 20) + (rows.length - 1) * 20 + 12;
      sh.legend = items;
      if (!items.length) warn(st.line, 'this legend has no entries; add style="what it means" for each style, e.g. focal="The main service"');
    }
    if (!at) unplaced.push(sh);
    shapes.push(sh);
  }

  // Fallback placement for shapes with no position: a row under everything else.
  if (unplaced.length) {
    const placed = shapes.filter((s) => !unplaced.includes(s));
    let x = 40;
    const y = placed.length ? Math.max(...placed.map((s) => s.y + s.h)) + 40 : 40;
    for (const s of unplaced) {
      s.x = x; s.y = y; x += s.w + 40;
      warn(s.line, `${s.id} has no position ("at x,y"); it was dropped in a row at ${s.x},${s.y}`);
    }
  }

  // ---- connector resolution -------------------------------------------------
  const shapeById = new Map<string, Box & { shape?: string }>();
  for (const s of shapes) shapeById.set(s.id, s);
  for (const t of texts) shapeById.set(t.id, { x: t.x - 4, y: t.y - 2, w: t.w + 8, h: t.h + 4 });
  const connById = new Map(conns.map((c) => [c.id, c]));
  const rowsById = new Map(shapes.filter((s) => s.rows).map((s) => [s.id, s.rows!]));
  // what an end attaches to: the whole shape, or one row of a table
  const tgt = (e: End): Box & { shape?: string } => {
    const S = shapeById.get(e.id!)!;
    const r = e.row ? rowsById.get(e.id!)?.find((q) => q.id === e.row) : undefined;
    return r ? { x: S.x, y: r.y, w: S.w, h: r.h } : S;
  };
  const sideKey = (e: End) => `${e.id}${e.row ? '.' + e.row : ''}|${e.side}`;
  const done = new Set<Conn>();
  const bad = new Set<Conn>();

  for (const c of conns) for (const e of [c.a, c.b]) {
    if (e.kind !== 'shape') continue;
    if (shapeById.has(e.id!)) {
      if (e.row && !rowsById.get(e.id!)?.some((r) => r.id === e.row)) {
        const have = (rowsById.get(e.id!) ?? []).filter((r) => r.id).map((r) => r.id);
        err(c.line, `${e.raw}: "${e.id}" has no row called "${e.row}"${have.length ? `; its rows: ${have.join(', ')}` : ' (only a table has rows; a side is top, bottom, left or right)'}`);
        bad.add(c);
      }
      continue;
    }
    if (connById.has(e.id!)) {
      e.kind = 'conn';
      if (e.side) { err(c.line, `${e.raw}: "${e.id}" is a line, so it has no sides; use ${e.id}@position`); bad.add(c); }
      if (e.v === undefined) e.v = 0.5;
    } else { err(c.line, `connector refers to "${e.id}", which does not exist`); bad.add(c); }
  }
  for (const c of conns) if (c.a.kind === 'rel' && c.b.kind === 'rel') { err(c.line, 'only one end of a connector can be relative (+dx,+dy)'); bad.add(c); }

  const taken: [Pt, Pt][] = []; // segments already routed, so detours can keep off them
  const resolvePass = (batch: Conn[]) => {
    const boxOf = (e: End): Box | null => {
      if (e.kind === 'shape') return tgt(e);
      if (e.kind === 'point') return { x: e.pt.x, y: e.pt.y, w: 0, h: 0 };
      if (e.kind === 'conn') { e.pt = pointAlong(connById.get(e.id!)!, e.v!); return { x: e.pt.x, y: e.pt.y, w: 0, h: 0 }; }
      return null;
    };
    // sides
    for (const c of batch) {
      const ba = boxOf(c.a), bb = boxOf(c.b);
      const relSide = (r: Pt): Side => (Math.abs(r.y) >= Math.abs(r.x) ? (r.y >= 0 ? 'bottom' : 'top') : r.x >= 0 ? 'right' : 'left');
      // a table row is reached from the left or right edge of the table, whichever faces the other end
      const rowSide = (me: Box, other: Box | null, rel: Pt): Side => ((other ? cx(other) >= cx(me) : rel.x >= 0) ? 'right' : 'left');
      if (c.a.kind === 'shape' && !c.a.side) { c.a.side = c.a.row ? rowSide(ba!, bb, c.b.rel ?? { x: 0, y: 0 }) : bb ? autoSides(ba!, bb)[0] : relSide(c.b.rel!); c.a.fanned = true; }
      if (c.b.kind === 'shape' && !c.b.side) {
        const back = c.a.rel ? { x: -c.a.rel.x, y: -c.a.rel.y } : { x: 0, y: 0 };
        c.b.side = c.b.row ? rowSide(bb!, ba, back) : ba ? autoSides(ba, bb!)[1] : relSide(back);
        c.b.fanned = true;
      }
    }
    // fan-out of ends that share a side and have no explicit position
    const groups = new Map<string, { c: Conn; e: End; o: End }[]>();
    for (const c of batch) for (const [e, o] of [[c.a, c.b], [c.b, c.a]] as [End, End][]) {
      if (e.kind !== 'shape' || e.v !== undefined) continue;
      const k = sideKey(e);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push({ c, e, o });
    }
    const frac = new Map<End, number>();
    const single = new Set<End>();
    for (const [k, g] of groups) {
      const horiz = k.endsWith('top') || k.endsWith('bottom');
      const ref = (o: End) => { const b = boxOf(o); return b ? (horiz ? cx(b) : cy(b)) : 0; };
      if (g.length === 1) { frac.set(g[0].e, 0.5); single.add(g[0].e); continue; }
      const order = g.map((m, idx) => ({ m, idx, r: ref(m.o) })).sort((p, q) => p.r - q.r || p.idx - q.idx);
      order.forEach((o, n) => frac.set(o.m.e, (n + 1) / (g.length + 1)));
    }
    for (const c of batch) {
      for (const e of [c.a, c.b]) {
        if (e.kind === 'shape') {
          const S = tgt(e);
          e.pt = sidePoint(S, e.side!, e.v, frac.get(e) ?? 0.5);
          e.dir = DIRS[e.side!];
          if (e.v !== undefined && e.v > 1) {
            const horiz = e.side === 'top' || e.side === 'bottom';
            const lo = horiz ? S.x : S.y, hi = horiz ? S.x + S.w : S.y + S.h;
            if (e.v < lo || e.v > hi) warn(c.line, `${e.raw}: ${e.v} is outside the ${e.side} side of ${e.id}, which runs from ${lo} to ${hi}; the end was moved to the nearest point`);
          }
        }
      }
      // keep a lone connector straight when the two things line up
      const a = c.a, b = c.b;
      const opposing = a.dir && b.dir && a.dir.x === -b.dir.x && a.dir.y === -b.dir.y;
      if (a.kind === 'shape' && b.kind === 'shape' && opposing) {
        const A = tgt(a), B = tgt(b);
        const horiz = a.side === 'top' || a.side === 'bottom';
        const lo = horiz ? Math.max(A.x, B.x) : Math.max(A.y, B.y);
        const hi = horiz ? Math.min(A.x + A.w, B.x + B.w) : Math.min(A.y + A.h, B.y + B.h);
        if (hi > lo) {
          let pos: number | undefined;
          if (single.has(a) && single.has(b)) {
            const ca = horiz ? cx(A) : cy(A), cb = horiz ? cx(B) : cy(B);
            const small = (horiz ? A.w <= B.w : A.h <= B.h) ? ca : cb, other = small === ca ? cb : ca;
            pos = within(small, lo, hi) ? small : within(other, lo, hi) ? other : (lo + hi) / 2;
          } else if (!single.has(a) && !single.has(b) && a.v === undefined && b.v === undefined) {
            const ga = groups.get(sideKey(a))!, gb = groups.get(sideKey(b))!;
            const same = ga.length === gb.length && ga.every((m) => gb.some((n) => n.c === m.c));
            if (same) pos = lo + (hi - lo) * frac.get(a)!;
          } else if (single.has(a) && b.v !== undefined) pos = horiz ? b.pt.x : b.pt.y;
          else if (single.has(b) && a.v !== undefined) pos = horiz ? a.pt.x : a.pt.y;
          if (pos !== undefined && within(pos, lo, hi)) {
            a.pt = sidePoint(A, a.side!, Math.max(pos, 1.0001), 0.5);
            b.pt = sidePoint(B, b.side!, Math.max(pos, 1.0001), 0.5);
          }
        }
      }
      for (const [e, o] of [[a, b], [b, a]] as [End, End][]) {
        if (e.kind !== 'shape' || !single.has(e) || (o.kind !== 'point' && o.kind !== 'conn')) continue;
        const S = tgt(e);
        const horiz = e.side === 'top' || e.side === 'bottom';
        const pos = horiz ? o.pt.x : o.pt.y;
        if (within(pos, (horiz ? S.x : S.y) + 2, (horiz ? S.x + S.w : S.y + S.h) - 2)) e.pt = sidePoint(S, e.side!, Math.max(pos, 1.0001), 0.5);
      }
      if (a.kind === 'rel') a.pt = { x: b.pt.x + a.rel!.x, y: b.pt.y + a.rel!.y };
      if (b.kind === 'rel') b.pt = { x: a.pt.x + b.rel!.x, y: a.pt.y + b.rel!.y };
      let via: Pt[] = [];
      if (c.p.via) {
        via = c.p.via.split(';').map((s) => { const [x, y] = s.split(',').map(Number); return { x, y }; });
        if (via.some((v) => isNaN(v.x) || isNaN(v.y))) { err(c.line, 'via must look like via=x,y or via=x,y;x,y'); via = []; }
      }
      if (a.pt.x === b.pt.x && a.pt.y === b.pt.y) warn(c.line, `${c.a.raw} and ${c.b.raw} meet at the same point (${a.pt.x},${a.pt.y}), so this line has no length and is not drawn; attach it to other sides`);
      c.pts = c.curve ? curvePts(a.pt, a.dir, b.pt, b.dir, via, num(c.p.bend, NaN)) : route(c, via);
      // the simple route cuts through a box: find a way around (hand-set via points are left alone)
      if (c.ortho && !via.length && !c.ushape) {
        const strictlyIn = (o: Box, p: Pt) => p.x > o.x + 1 && p.x < o.x + o.w - 1 && p.y > o.y + 1 && p.y < o.y + o.h - 1;
        const obs = shapes.filter((o) => !o.back && o.shape !== 'legend' && Math.min(o.w, o.h) > 12 && !strictlyIn(o, a.pt) && !strictlyIn(o, b.pt));
        if (crosses(c.pts, obs)) { const alt = routeAround(a.pt, a.dir, b.pt, b.dir, obs, taken); if (alt) c.pts = alt; }
      }
      if (c.ortho) for (let i = 0; i < c.pts.length - 1; i++) taken.push([c.pts[i], c.pts[i + 1]]);
      c.label = makeLabel(c, shapes.filter((o) => !o.back && o.shape !== 'legend'));
      done.add(c);
    }
  };

  const good = conns.filter((c) => !bad.has(c));
  const refsConn = (c: Conn) => c.a.kind === 'conn' || c.b.kind === 'conn';
  resolvePass(good.filter((c) => !refsConn(c)));
  const second = good.filter(refsConn);
  for (const c of second) for (const e of [c.a, c.b]) {
    if (e.kind === 'conn' && !done.has(connById.get(e.id!)!)) {
      err(c.line, `"${e.id}" is itself attached to a line; attach to a line that starts at a shape or a point`);
      bad.add(c);
    }
  }
  resolvePass(second.filter((c) => !bad.has(c)));
  const finalConns = conns.filter((c) => done.has(c));

  let w = canvas?.w, h = canvas?.h;
  if (!canvas) {
    const xs = [...shapes.map((s) => s.x + s.w), ...texts.map((t) => t.x + t.w), ...finalConns.flatMap((c) => c.pts.map((p) => p.x))];
    const ys = [...shapes.map((s) => s.y + s.h), ...texts.map((t) => t.y + t.h), ...finalConns.flatMap((c) => c.pts.map((p) => p.y))];
    w = Math.ceil((Math.max(0, ...xs) + 40) / 4) * 4; h = Math.ceil((Math.max(0, ...ys) + 40) / 4) * 4;
  }
  return { file, w: w!, h: h!, look, canvasLine, shapes, texts, conns: finalConns, issues };
}
