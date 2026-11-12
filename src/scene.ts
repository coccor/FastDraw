// Turns a diagram file into a resolved scene: shapes, texts and routed connectors.
import { parseStatements } from './parse.ts';
import type { Stmt } from './parse.ts';
import { emptyLook } from './look.ts';
import type { Look, Props, Issue } from './look.ts';

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Shape = Box & { id: string; line: number; style: string; p: Props; shape: string; text?: string; back: boolean };
export type TextEl = Box & { id: string; line: number; style: string; p: Props; text: string; ax: number; ay: number };
export type End = {
  raw: string; kind: 'point' | 'rel' | 'shape' | 'conn';
  id?: string; side?: Side; v?: number; rel?: Pt;
  pt: Pt; dir: Pt | null; fanned?: boolean;
};
export type Label = Box & { text: string; cx: number; baseline: number; size: number; spacing: number; font: string };
export type Conn = {
  id: string; line: number; style: string; p: Props;
  a: End; b: End; pts: Pt[]; head: boolean; tail: boolean; ortho: boolean; ushape: boolean;
  text?: string; label?: Label;
};
export type Scene = {
  file: string; w: number; h: number; look: Look; canvasLine?: number;
  shapes: Shape[]; texts: TextEl[]; conns: Conn[]; issues: Issue[];
};

const DIRS: Record<Side, Pt> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const num = (v: string | undefined, d: number) => (v === undefined || v === '' || isNaN(+v) ? d : +v);

export function textWidth(text: string, size: number, font: string, weight: number, spacing: number): number {
  const f = font === 'mono' ? 0.6 : font === 'serif' ? 0.46 : weight >= 600 ? 0.57 : 0.53;
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

function pointAlong(c: Conn, v: number): Pt {
  const first = c.pts[0], last = c.pts[c.pts.length - 1];
  if (v > 1) {
    if (first.x === last.x) return { x: first.x, y: v };
    if (first.y === last.y) return { x: v, y: first.y };
  }
  const f = Math.min(Math.max(v, 0), 1);
  return { x: Math.round(first.x + (last.x - first.x) * f), y: Math.round(first.y + (last.y - first.y) * f) };
}

function makeLabel(c: Conn): Label | undefined {
  if (!c.text) return undefined;
  const size = num(c.p['label.size'], 8), spacing = num(c.p['label.spacing'], 0.08), font = c.p['label.font'] ?? 'mono';
  const text = c.p['label.caps'] === '0' ? c.text : c.text.toUpperCase();
  const w = Math.ceil((textWidth(text, size, font, 400, spacing) + 12) / 4) * 4, h = size + 4;
  if (c.p.lpos) {
    const [lx, ly] = c.p.lpos.split(',').map(Number);
    return { text, cx: lx, baseline: ly, x: lx - w / 2, y: ly - h + 2, w, h, size, spacing, font };
  }
  let best = 0;
  if (c.ushape && c.pts.length === 4) best = 1;
  else {
    let len = -1;
    for (let i = 0; i < c.pts.length - 1; i++) {
      const l = Math.abs(c.pts[i + 1].x - c.pts[i].x) + Math.abs(c.pts[i + 1].y - c.pts[i].y);
      if (l > len) { len = l; best = i; }
    }
  }
  const A = c.pts[best], B = c.pts[best + 1];
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const side = c.p.lside;
  if (A.x === B.x && A.y !== B.y) {
    const left = side === 'left';
    const x = left ? A.x - 8 - w : A.x + 8;
    return { text, cx: x + w / 2, baseline: Math.round(my) + 3, x, y: Math.round(my) - h + 5, w, h, size, spacing, font };
  }
  const below = side === 'below';
  const baseline = below ? Math.round(my) + 18 : Math.round(my) - 10;
  return { text, cx: Math.round(mx), baseline, x: Math.round(mx) - w / 2, y: baseline - h + 2, w, h, size, spacing, font };
}

function parseEnd(raw: string): End | null {
  const base = { raw, pt: { x: 0, y: 0 }, dir: null };
  // relative end: starts with "+", or both numbers carry a sign (+0,260  +40,-20  -40,+0)
  let m = /^(\+\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)$/.exec(raw) ?? /^([+-]\d+(?:\.\d+)?),([+-]\d+(?:\.\d+)?)$/.exec(raw);
  if (m) return { ...base, kind: 'rel', rel: { x: +m[1], y: +m[2] } };
  m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(raw);
  if (m) return { ...base, kind: 'point', pt: { x: +m[1], y: +m[2] } };
  m = /^([A-Za-z_][\w-]*)(?:\.(top|bottom|left|right))?(?:@(-?[\d.]+))?$/.exec(raw);
  if (m) return { ...base, kind: 'shape', id: m[1], side: m[2] as Side | undefined, v: m[3] === undefined ? undefined : +m[3] };
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

  const look: Look = lookIn ?? emptyLook();
  const lookStmt = stmts.find((s) => s.toks[0]?.v === 'look' && s.toks[0].t === 'word');
  if (lookStmt) {
    const p = lookStmt.toks[1]?.v;
    if (!p) err(lookStmt.line, 'look needs a path, e.g. look "./team.look"');
    else if (!lookIn) err(lookStmt.line, `look file not found: ${p}`);
    else for (const i of look.issues) issues.push({ ...i, line: lookStmt.line, msg: `${i.msg} (in look, line ${i.line})` });
  } else issues.push({ line: 1, level: 'hint', msg: 'no look statement; drawing with plain built-in styles' });

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
      conns.push({
        id: register('conn', 'c'), line: st.line, style: styleName, p, a, b, pts: [],
        head: op !== '--', tail: op === '<->', ortho: (p.route ?? 'ortho') !== 'straight', ushape: false, text,
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
    for (; i < toks.length; i++) {
      const t = toks[i];
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
      texts.push({ id: register('text', 't'), line: st.line, style: styleName, p, text: t2, ax: at.x, ay: at.y, x, y: at.y - fs, w, h: fs * 1.3 * lines.length });
      continue;
    }
    if (!size && p.size) { const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(p.size); if (m) size = { w: +m[1], h: +m[2] }; }
    size = size ?? { w: 120, h: 48 };
    const sh: Shape = {
      id: register('shape', 's'), line: st.line, style: styleName, p, shape: p.shape ?? 'rect', text,
      back: p.layer === 'back', x: at?.x ?? 0, y: at?.y ?? 0, w: size.w, h: size.h,
    };
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
  const done = new Set<Conn>();
  const bad = new Set<Conn>();

  for (const c of conns) for (const e of [c.a, c.b]) {
    if (e.kind !== 'shape') continue;
    if (shapeById.has(e.id!)) continue;
    if (connById.has(e.id!)) {
      e.kind = 'conn';
      if (e.side) { err(c.line, `${e.raw}: "${e.id}" is a line, so it has no sides; use ${e.id}@position`); bad.add(c); }
      if (e.v === undefined) e.v = 0.5;
    } else { err(c.line, `connector refers to "${e.id}", which does not exist`); bad.add(c); }
  }
  for (const c of conns) if (c.a.kind === 'rel' && c.b.kind === 'rel') { err(c.line, 'only one end of a connector can be relative (+dx,+dy)'); bad.add(c); }

  const resolvePass = (batch: Conn[]) => {
    const boxOf = (e: End): Box | null => {
      if (e.kind === 'shape') return shapeById.get(e.id!)!;
      if (e.kind === 'point') return { x: e.pt.x, y: e.pt.y, w: 0, h: 0 };
      if (e.kind === 'conn') { e.pt = pointAlong(connById.get(e.id!)!, e.v!); return { x: e.pt.x, y: e.pt.y, w: 0, h: 0 }; }
      return null;
    };
    // sides
    for (const c of batch) {
      const ba = boxOf(c.a), bb = boxOf(c.b);
      const relSide = (r: Pt): Side => (Math.abs(r.y) >= Math.abs(r.x) ? (r.y >= 0 ? 'bottom' : 'top') : r.x >= 0 ? 'right' : 'left');
      if (c.a.kind === 'shape' && !c.a.side) { c.a.side = bb ? autoSides(ba!, bb)[0] : relSide(c.b.rel!); c.a.fanned = true; }
      if (c.b.kind === 'shape' && !c.b.side) {
        c.b.side = ba ? autoSides(ba, bb!)[1] : relSide({ x: -c.a.rel!.x, y: -c.a.rel!.y });
        c.b.fanned = true;
      }
    }
    // fan-out of ends that share a side and have no explicit position
    const groups = new Map<string, { c: Conn; e: End; o: End }[]>();
    for (const c of batch) for (const [e, o] of [[c.a, c.b], [c.b, c.a]] as [End, End][]) {
      if (e.kind !== 'shape' || e.v !== undefined) continue;
      const k = `${e.id}|${e.side}`;
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
          const S = shapeById.get(e.id!)!;
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
        const A = shapeById.get(a.id!)!, B = shapeById.get(b.id!)!;
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
            const ga = groups.get(`${a.id}|${a.side}`)!, gb = groups.get(`${b.id}|${b.side}`)!;
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
        const S = shapeById.get(e.id!)!;
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
      c.pts = route(c, via);
      c.label = makeLabel(c);
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
