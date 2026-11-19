// Editor operations: each takes the current source text and scene and returns new source text.
import { parseStatements } from '../../src/parse.ts';
import type { Tok } from '../../src/parse.ts';
import type { Scene, Shape, TextEl, Conn, End, Box, Pt } from '../../src/scene.ts';
import { turnOf, turnPt } from '../../src/scene.ts';
import { patchSource, appendStatements, setAt, setSize, setText, setProp, setKind, setEnd, setOp, fmtStmt, freshId, moveStatement, moveStatementsPast, setRows as editRows } from '../../src/edit.ts';
import type { Patch, RowSpec } from '../../src/edit.ts';

export type El = { kind: 'shape'; el: Shape } | { kind: 'text'; el: TextEl } | { kind: 'conn'; el: Conn };

export function find(sc: Scene, id: string): El | undefined {
  const s = sc.shapes.find((x) => x.id === id); if (s) return { kind: 'shape', el: s };
  const t = sc.texts.find((x) => x.id === id); if (t) return { kind: 'text', el: t };
  const c = sc.conns.find((x) => x.id === id); if (c) return { kind: 'conn', el: c };
}

export function boxOf(e: El): Box {
  if (e.kind !== 'conn') return e.el;
  const xs = e.el.pts.map((p) => p.x), ys = e.el.pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// An element as an upright box and a turn (rotate=, degrees clockwise) about that box's middle: how the editor draws
// its outline and handles. A turned text turns about its "at" point, which is the same as its upright box moved to
// where that turn takes the box's middle, then turned about the middle.
export function frameOf(e: El): { b: Box; t: number } {
  if (e.kind === 'shape') return { b: e.el, t: turnOf(e.el.p) };
  if (e.kind === 'text' && e.el.frame) {
    const f = e.el.frame, t = turnOf(e.el.p), m = turnPt({ x: f.x + f.w / 2, y: f.y + f.h / 2 }, { x: e.el.ax, y: e.el.ay }, t);
    return { b: { x: m.x - f.w / 2, y: m.y - f.h / 2, w: f.w, h: f.h }, t };
  }
  return { b: boxOf(e), t: 0 };
}
// A canvas point as a turned shape sees it: turned back about the shape's middle, so its upright box holds it.
export function toLocal(s: Box & { p: Shape['p'] }, p: Pt): Pt {
  const t = turnOf(s.p);
  return t ? turnPt(p, { x: s.x + s.w / 2, y: s.y + s.h / 2 }, -t) : p;
}
// The SVG transform that turns an upright box by t degrees about its middle.
export const turnAttr = (b: Box, t: number) => (t ? `rotate(${t} ${b.x + b.w / 2} ${b.y + b.h / 2})` : undefined);

// Turn shapes and free texts to `deg` degrees clockwise (rotate=; 0 drops it). Each turns about its own middle: a
// text's "at" point moves so the text stays where it is. Lines are left alone.
export function rotateElements(src: string, sc: Scene, ids: string[], deg: number): string {
  let d = Math.round(deg * 10) / 10 % 360;
  if (d > 180) d -= 360; else if (d <= -180) d += 360;
  const patches = new Map<number, Patch>();
  for (const id of ids) {
    const e = find(sc, id);
    if (!e || e.kind === 'conn') continue;
    const own = sc.look.styles.get(e.el.style)?.props.rotate, v = d === 0 && !own ? null : String(d);
    if (e.kind === 'shape') { patches.set(e.el.line, (t) => setProp(t, 'rotate', v)); continue; }
    const { b, t: t0 } = frameOf(e), mid = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const at = turnPt({ x: e.el.ax, y: e.el.ay }, mid, d - t0);
    patches.set(e.el.line, (t) => setProp(setAt(t, Math.round(at.x), Math.round(at.y)), 'rotate', v));
  }
  return patchSource(src, patches);
}

export function unionBox(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

export function stmtToks(src: string, line: number): Tok[] | undefined {
  return parseStatements(src).find((s) => s.line === line)?.toks;
}

// The text a person typed for this element, exactly as written in the file.
export function rawText(src: string, e: El): string {
  const toks = stmtToks(src, e.el.line) ?? [];
  const rows = toks.findIndex((t) => t.t === 'word' && (t.v === '|' || t.v === '|='));
  return toks.find((t, i) => t.t === 'str' && (rows < 0 || i < rows))?.v ?? '';
}

const fmtEnd = (e: End, v: number) => `${e.id}${e.row ? '.' + e.row : ''}${e.side ? '.' + e.side : ''}@${Math.round(v)}`;
const shiftPts = (v: string, dx: number, dy: number) =>
  v.split(';').map((p) => { const [x, y] = p.split(',').map(Number); return `${Math.round(x + dx)},${Math.round(y + dy)}`; }).join(';');

// Shapes that ride along with a moved shape: narrow things (activation bars) sitting on a line
// that hangs from it.
function riders(sc: Scene, moved: Set<string>): string[] {
  const out: string[] = [];
  for (const c of sc.conns) {
    const owner = c.a.kind === 'shape' && c.b.kind === 'rel' ? c.a.id : c.b.kind === 'shape' && c.a.kind === 'rel' ? c.b.id : undefined;
    if (!owner || !moved.has(owner)) continue;
    const [p, q] = [c.pts[0], c.pts[c.pts.length - 1]];
    for (const s of sc.shapes) {
      if (moved.has(s.id) || Math.min(s.w, s.h) > 12) continue;
      const mx = s.x + s.w / 2, my = s.y + s.h / 2;
      const onV = p.x === q.x && Math.abs(mx - p.x) <= 2 && my >= Math.min(p.y, q.y) && my <= Math.max(p.y, q.y);
      const onH = p.y === q.y && Math.abs(my - p.y) <= 2 && mx >= Math.min(p.x, q.x) && mx <= Math.max(p.x, q.x);
      if (onV || onH) out.push(s.id);
    }
  }
  return out;
}

export function moveElements(src: string, sc: Scene, ids: string[], dx: number, dy: number): string {
  if (!dx && !dy) return src;
  const moved = new Set(ids);
  for (const r of riders(sc, moved)) moved.add(r);
  const patches = new Map<number, Patch>();
  for (const s of sc.shapes) if (moved.has(s.id)) patches.set(s.line, (t) => {
    // a legend with no size spans the canvas less its offset on both sides, so moving it sideways
    // would change its width: write down the width it has now, and it keeps it wherever it goes
    const freeze = s.shape === 'legend' && dx !== 0 && !t.some((k) => k.t === 'word' && /^\d+(\.\d+)?x\d+(\.\d+)?$/.test(k.v));
    const at = setAt(t, s.x + dx, s.y + dy);
    return freeze ? setSize(at, s.w, s.h) : at;
  });
  for (const t of sc.texts) if (moved.has(t.id)) patches.set(t.line, (k) => setAt(k, t.ax + dx, t.ay + dy));
  const connById = new Map(sc.conns.map((c) => [c.id, c]));
  const owner = (e: End): string | undefined => {
    if (e.kind === 'shape') return e.id;
    if (e.kind === 'conn') { const l = connById.get(e.id!); return l ? owner(l.a.kind === 'rel' ? l.b : l.a) : undefined; }
  };
  for (const c of sc.conns) {
    const ends = [c.a, c.b].filter((e) => e.kind !== 'rel');
    const carried = moved.has(c.id) || (ends.length > 0 && ends.every((e) => { const o = owner(e); return o !== undefined && moved.has(o); }));
    const edits: ((t: Tok[]) => Tok[])[] = [];
    (['a', 'b'] as const).forEach((w) => {
      const e = c[w];
      if (e.kind === 'shape' && moved.has(e.id!) && e.v !== undefined && e.v > 1) {
        const d = e.side === 'left' || e.side === 'right' ? dy : dx;
        if (d) edits.push((t) => setEnd(t, w, fmtEnd(e, e.v! + d)));
      } else if (carried && e.kind === 'point') edits.push((t) => setEnd(t, w, `${Math.round(e.pt.x + dx)},${Math.round(e.pt.y + dy)}`));
      else if (carried && e.kind === 'conn' && e.v !== undefined && e.v > 1) {
        const l = connById.get(e.id!);
        if (l) { const vert = l.pts[0].x === l.pts[l.pts.length - 1].x; const d = vert ? dy : dx; if (d) edits.push((t) => setEnd(t, w, `${e.id}@${Math.round(e.v! + d)}`)); }
      }
    });
    if (carried && c.p.via) edits.push((t) => setProp(t, 'via', shiftPts(c.p.via, dx, dy)));
    if (carried && c.p.lpos) edits.push((t) => setProp(t, 'lpos', shiftPts(c.p.lpos, dx, dy)));
    // one end moved and the other did not: a hand-set route or label spot no longer fits, so let
    // the router work it out again
    if (!carried && (c.p.via || c.p.lpos) && ends.some((e) => { const o = owner(e); return o !== undefined && moved.has(o); })) {
      edits.push((t) => setProp(setProp(t, 'via', null), 'lpos', null));
    }
    if (edits.length) patches.set(c.line, (t) => edits.reduce((acc, f) => f(acc), t));
  }
  return patchSource(src, patches);
}

export function resizeShape(src: string, s: Shape, b: Box): string {
  return patchSource(src, new Map([[s.line, (t) => setSize(setAt(t, b.x, b.y), Math.max(4, b.w), Math.max(4, b.h))]]));
}

export function editText(src: string, e: El, text: string): string {
  return patchSource(src, new Map([[e.el.line, (t) => setText(t, text)]]));
}

export function setProps(src: string, sc: Scene, ids: string[], k: string, v: string | null): string {
  return setManyProps(src, sc, ids, { [k]: v });
}

// Several props in one edit (one undo step), e.g. an icon and its style.
export function setManyProps(src: string, sc: Scene, ids: string[], kv: Record<string, string | null>): string {
  const patches = new Map<number, Patch>();
  const apply: Patch = (t) => Object.entries(kv).reduce((acc, [k, v]) => setProp(acc, k, v), t);
  for (const id of ids) { const e = find(sc, id); if (e) patches.set(e.el.line, apply); }
  return patchSource(src, patches);
}

// Switch elements to another style of the same kind, dropping a style= overlay if present.
export function setStyle(src: string, sc: Scene, ids: string[], name: string): string {
  const patches = new Map<number, Patch>();
  for (const id of ids) {
    const e = find(sc, id); if (!e) continue;
    if (e.kind === 'conn') patches.set(e.el.line, (t) => setProp(t, 'style', name));
    else if (e.kind === 'text') patches.set(e.el.line, (t) => setProp(t, 'style', name === 'text' ? null : name));
    else patches.set(e.el.line, (t) => setProp(setKind(t, name), 'style', null));
  }
  return patchSource(src, patches);
}

// Choosing plain / one arrowhead / two arrowheads also forgets any hand-picked end markers.
export function setOperator(src: string, sc: Scene, ids: string[], op: string): string {
  const patches = new Map<number, Patch>();
  for (const id of ids) { const e = find(sc, id); if (e?.kind === 'conn') patches.set(e.el.line, (t) => setProp(setProp(setOp(t, op), 'head', null), 'tail', null)); }
  return patchSource(src, patches);
}

export function deleteElements(src: string, sc: Scene, ids: string[]): string {
  const gone = new Set(ids);
  // connectors attached to a deleted element go with it, and so do connectors attached to those
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of sc.conns) {
      if (gone.has(c.id)) continue;
      if ([c.a, c.b].some((e) => (e.kind === 'shape' || e.kind === 'conn') && gone.has(e.id!))) { gone.add(c.id); grew = true; }
    }
  }
  const patches = new Map<number, Patch>();
  for (const id of gone) { const e = find(sc, id); if (e) patches.set(e.el.line, () => null); }
  return patchSource(src, patches);
}

export function duplicateElements(src: string, sc: Scene, ids: string[], dx = 24, dy = 24): { src: string; ids: string[] } {
  const stmts: string[] = [], newIds: string[] = [];
  let cur = src;
  const rename = new Map<string, string>();
  const els = ids.map((id) => find(sc, id)).filter((e): e is El => !!e);
  for (const e of els.filter((x) => x.kind !== 'conn')) {
    const toks = stmtToks(src, e.el.line)!.map((t) => ({ ...t }));
    const id = freshId(cur, e.el.id.startsWith('_') ? e.el.style.replace(/-/g, '_') : e.el.id);
    rename.set(e.el.id, id);
    if (toks[0].v.endsWith(':')) toks[0] = { t: 'word', v: id + ':' }; else toks.unshift({ t: 'word', v: id + ':' });
    const pos = e.kind === 'shape' ? { x: e.el.x, y: e.el.y } : { x: e.el.ax, y: e.el.ay };
    const line = fmtStmt(setAt(toks, pos.x + dx, pos.y + dy));
    stmts.push(line); newIds.push(id); cur = appendStatements(cur, [line]);
  }
  for (const e of els.filter((x) => x.kind === 'conn')) {
    const c = e.el as Conn;
    if (![c.a, c.b].every((end) => end.kind === 'point' || end.kind === 'rel' || rename.has(end.id!))) continue;
    const toks = stmtToks(src, c.line)!.map((t) => ({ ...t }));
    const id = freshId(cur, c.id.startsWith('_') ? 'c' : c.id);
    if (toks[0].v.endsWith(':')) toks[0] = { t: 'word', v: id + ':' }; else toks.unshift({ t: 'word', v: id + ':' });
    (['a', 'b'] as const).forEach((w) => {
      const end = c[w];
      if (end.kind === 'point') setEnd(toks, w, `${Math.round(end.pt.x + dx)},${Math.round(end.pt.y + dy)}`);
      else if (end.kind !== 'rel') setEnd(toks, w, end.raw.replace(end.id!, rename.get(end.id!)!));
    });
    const line = fmtStmt(toks);
    newIds.push(id); cur = appendStatements(cur, [line]);
  }
  return { src: cur, ids: newIds };
}

// Replace the rows of a table. Arrows that ended on a row that is gone now end on the table itself.
export function setRows(src: string, sc: Scene, s: Shape, rows: RowSpec[]): string {
  const keep = new Set(rows.map((r) => r.id).filter(Boolean));
  const patches = new Map<number, Patch>([[s.line, (t) => editRows(t, rows)]]);
  for (const c of sc.conns) {
    const lost = (['a', 'b'] as const).filter((w) => c[w].id === s.id && c[w].row && !keep.has(c[w].row));
    if (lost.length) patches.set(c.line, (t) => lost.reduce((acc, w) => setEnd(acc, w, s.id), t));
  }
  return patchSource(src, patches);
}

export function addShape(src: string, style: string, b: Box, sized: boolean, table = false, chart = false, icon?: { name: string; style: 'outline' | 'solid' | 'duotone' }): { src: string; id: string } {
  const id = freshId(src, style.replace(/-/g, '_'));
  if (chart) {
    const w = sized ? Math.round(b.w) : 320, h = sized ? Math.round(b.h) : 180;
    return { src: appendStatements(src, [`${id}: ${style} "Title" at ${Math.round(b.x)},${Math.round(b.y)} ${w}x${h} x="A,B,C,D"\n  | bars "Series" 30 50 40 70`]), id };
  }
  if (table) {
    const head = `${id}: ${style} "Name" at ${Math.round(b.x)},${Math.round(b.y)}${sized ? ` ${Math.round(b.w)}x${Math.round(b.h)}` : ''}`;
    return { src: appendStatements(src, [head + '\n  | r1 "first" "value"\n  | r2 "second" "value"']), id };
  }
  const line = `${id}: ${style} at ${Math.round(b.x)},${Math.round(b.y)}${sized ? ` ${Math.round(b.w)}x${Math.round(b.h)}` : ''}${style === 'icon' ? ` icon=${icon?.name ?? 'server'}${icon && icon.style !== 'outline' ? ` icon.style=${icon.style}` : ''}` : ''}`;
  return { src: appendStatements(src, [line]), id };
}

// ---- drawing by hand ------------------------------------------------------
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

// The pointer's path with the hand's tremor taken out: evenly spaced points along it, each moved to the
// weighted middle of its neighbours. Sharp turns are kept as corners (a tick stays a tick), and the two ends
// stay where the pen went down and came up. k is the zoom, so the result is the same on screen at any zoom.
export function smoothStroke(path: Pt[], k = 1): Pt[] {
  if (path.length < 3) return path;
  const step = 1.5 / k;
  const even: Pt[] = [path[0]];
  let need = step;
  for (let i = 1; i < path.length; i++) {
    let a = path[i - 1];
    const b = path[i];
    let d = dist(a, b);
    while (d >= need) {
      const t = need / d;
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      even.push(a);
      d -= need; need = step;
    }
    need -= d;
  }
  const end = path[path.length - 1];
  if (dist(even[even.length - 1], end) > step / 4) even.push(end); else even[even.length - 1] = end;
  // each point averaged with its neighbours, never reaching past a pinned point (an end or a corner)
  const blur = (pts: Pt[], sigma: number, pins: number[]) => {
    const r = Math.ceil((3 * sigma) / step);
    const w = Array.from({ length: r + 1 }, (_, j) => Math.exp(-((j * step) ** 2) / (2 * sigma * sigma)));
    const room = pts.map(() => r);
    for (const c of pins) for (let j = Math.max(0, c - r); j <= Math.min(pts.length - 1, c + r); j++) room[j] = Math.min(room[j], Math.abs(j - c));
    return pts.map((p, i) => {
      let x = p.x, y = p.y, sum = 1;
      for (let j = 1; j <= room[i]; j++) { x += (pts[i - j].x + pts[i + j].x) * w[j]; y += (pts[i - j].y + pts[i + j].y) * w[j]; sum += 2 * w[j]; }
      return { x: x / sum, y: y / sum };
    });
  };
  const ends = [0, even.length - 1];
  // a corner: where a lightly smoothed copy turns sharply within a few pixels, at the sharpest point of the turn
  const light = blur(even, 2 / k, ends), d = 5, turn = light.map(() => 0);
  for (let i = d; i < light.length - d; i++) {
    const ax = light[i].x - light[i - d].x, ay = light[i].y - light[i - d].y, bx = light[i + d].x - light[i].x, by = light[i + d].y - light[i].y;
    turn[i] = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
  }
  const corners = turn.map((t, i) => i).filter((i) => turn[i] > 1.2 && turn.slice(Math.max(0, i - d), i + d + 1).every((t, j) => t < turn[i] || j + Math.max(0, i - d) === i || (t === turn[i] && j + Math.max(0, i - d) > i)));
  return blur(even, 6 / k, [...ends, ...corners]);
}

// Which points to keep so that straight lines between them stay within eps of the path.
function keepers(pts: Pt[], eps: number): number[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1, max = eps;
    for (let i = a + 1; i < b; i++) { const d = segDist(pts[i], pts[a], pts[b]); if (d > max) { max = d; far = i; } }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return [...keep.keys()].filter((i) => keep[i]);
}

// The few points whose smooth line (drawn the way an open smooth polygon is drawn) stays within tol of the
// whole path. Starts from the fewest that could do and adds one wherever the drawn curve strays.
function fitCurve(D: Pt[], tol: number): Pt[] {
  let idx = keepers(D, tol * 2);
  for (let round = 0; round < 12; round++) {
    const P = idx.map((i) => D[i]), at = (i: number) => P[Math.min(Math.max(i, 0), P.length - 1)];
    const add: number[] = [];
    for (let s = 0; s < idx.length - 1; s++) {
      const lo = idx[s], hi = idx[s + 1];
      if (hi - lo < 2) continue;
      const p0 = at(s - 1), p1 = at(s), p2 = at(s + 1), p3 = at(s + 2);
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      let worst = 0;
      for (let n = 1; n < 8 && worst <= tol; n++) {
        const t = n / 8, u = 1 - t;
        const q = { x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x, y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y };
        let near = Infinity;
        for (let i = lo; i < hi && near > tol; i++) near = Math.min(near, segDist(q, D[i], D[i + 1]));
        worst = Math.max(worst, near);
      }
      if (worst > tol) add.push((lo + hi) >> 1);
    }
    if (!add.length) break;
    idx = [...idx, ...add].sort((a, b) => a - b);
  }
  return idx.map((i) => D[i]);
}

// A stroke drawn by hand: the pointer's path, smoothed, then kept as the few points a smooth open line needs
// to follow it, so the file stays short. Returns null for a press that did not travel.
export function addFreehand(src: string, path: Pt[], k = 1): { src: string; id: string } | null {
  const xs = path.map((q) => q.x), ys = path.map((q) => q.y);
  if (path.length < 2 || (Math.max(...xs) - Math.min(...xs) < 3 && Math.max(...ys) - Math.min(...ys) < 3)) return null;
  const pts = fitCurve(smoothStroke(path, k), 0.5 / k);
  const x0 = Math.floor(Math.min(...pts.map((q) => q.x))), y0 = Math.floor(Math.min(...pts.map((q) => q.y)));
  const r1 = (v: number) => String(Math.round(v * 10) / 10);
  const id = freshId(src, 'stroke');
  const line = `${id}: freehand at ${x0},${y0} points=${pts.map((q) => `${r1(q.x - x0)},${r1(q.y - y0)}`).join(';')}`;
  return { src: appendStatements(src, [line]), id };
}

// width: a text box the text wraps in, when the text tool was dragged across rather than clicked
export function addText(src: string, x: number, y: number, style?: string, width?: number): { src: string; id: string } {
  const id = freshId(src, 'note');
  const line = `${id}: text "Text" at ${Math.round(x)},${Math.round(y)}${width ? ` width=${Math.round(width)}` : ''}${style && style !== 'text' ? ` style=${style}` : ''}`;
  return { src: appendStatements(src, [line]), id };
}

export function addConn(src: string, a: string, b: string, op: string, style?: string): { src: string; id: string } {
  const id = freshId(src, op === '--' ? 'line' : 'arrow');
  const line = `${id}: ${a} ${op} ${b}${style ? ` style=${style}` : ''}`;
  return { src: appendStatements(src, [line]), id };
}

export function reattach(src: string, c: Conn, which: 'a' | 'b', raw: string): string {
  return patchSource(src, new Map([[c.line, (t) => setProp(setProp(setEnd(t, which, raw), 'via', null), 'lpos', null)]]));
}

export function reorder(src: string, sc: Scene, ids: string[], where: 'front' | 'back'): string {
  let cur = src;
  // re-find lines after every move, since moving a statement shifts the others
  for (const id of ids) {
    const st = parseStatements(cur).find((s) => s.toks[0]?.v === id + ':');
    const e = find(sc, id);
    const line = st?.line ?? (id.startsWith('_') ? e?.el.line : undefined);
    if (line !== undefined) cur = moveStatement(cur, line, where);
    if (!st) break; // anonymous element: its line-based identity is gone after one move
  }
  return cur;
}

// The stack an element is drawn in: back shapes, lines under the shapes, shapes, lines over them, text.
// Order only means something inside one stack, so a step forward or back stays inside it.
function stackOf(e: El): string {
  if (e.kind === 'shape') return e.el.back ? 'back' : 'shape';
  if (e.kind === 'conn') return e.el.p.layer === 'front' ? 'over' : 'under';
  return 'text';
}

const overlaps = (a: Box, b: Box) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

// One step forward or backward: past the next element in the same stack that overlaps it (so every
// step changes what is seen), or past the very next one when nothing above or below overlaps.
export function reorderStep(src: string, sc: Scene, ids: string[], dir: 'forward' | 'backward'): string {
  const all: El[] = [
    ...sc.shapes.map((el) => ({ kind: 'shape' as const, el })),
    ...sc.texts.map((el) => ({ kind: 'text' as const, el })),
    ...sc.conns.map((el) => ({ kind: 'conn' as const, el })),
  ];
  const chosen = new Set(ids);
  const picked = all.filter((e) => chosen.has(e.el.id));
  const moves: { line: number; anchor: number; where: 'after' | 'before' }[] = [];
  for (const k of new Set(picked.map(stackOf))) {
    const stack = all.filter((e) => stackOf(e) === k).sort((a, b) => a.el.line - b.el.line);
    const mine = stack.filter((e) => chosen.has(e.el.id));
    // forward: the topmost goes first, so the ones below it keep their order once they follow
    if (dir === 'forward') mine.reverse();
    for (const e of mine) {
      const at = stack.indexOf(e);
      const past = (dir === 'forward' ? stack.slice(at + 1) : stack.slice(0, at).reverse()).filter((o) => !chosen.has(o.el.id) && o.el.line !== e.el.line);
      if (!past.length) continue;
      const box = boxOf(e);
      const anchor = past.find((o) => overlaps(box, boxOf(o))) ?? past[0];
      moves.push({ line: e.el.line, anchor: anchor.el.line, where: dir === 'forward' ? 'after' : 'before' });
    }
  }
  return moves.length ? moveStatementsPast(src, moves) : src;
}

export type Layering = 'front' | 'forward' | 'backward' | 'back';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export function align(src: string, sc: Scene, ids: string[], mode: AlignMode): string {
  const els = ids.map((id) => find(sc, id)).filter((e): e is El => !!e && e.kind !== 'conn');
  if (els.length < 2) return src;
  const u = unionBox(els.map(boxOf));
  let cur = src, scene = sc;
  for (const e of els) {
    const b = boxOf(e);
    let dx = 0, dy = 0;
    if (mode === 'left') dx = u.x - b.x; else if (mode === 'right') dx = u.x + u.w - (b.x + b.w); else if (mode === 'hcenter') dx = u.x + u.w / 2 - (b.x + b.w / 2);
    else if (mode === 'top') dy = u.y - b.y; else if (mode === 'bottom') dy = u.y + u.h - (b.y + b.h); else dy = u.y + u.h / 2 - (b.y + b.h / 2);
    cur = moveElements(cur, scene, [e.el.id], Math.round(dx), Math.round(dy));
  }
  return cur;
}

// Point the diagram at a look: a bundled name (`look sketch`), a path, or null for the built-in look,
// which removes the line. Only the look line changes; a new one goes at the top.
export function setLook(src: string, look: string | null): string {
  const st = parseStatements(src).find((x) => x.toks[0]?.t === 'word' && x.toks[0].v === 'look');
  const toks: Tok[] | null = look === null ? null : [{ t: 'word', v: 'look' }, { t: /^[a-z][a-z0-9-]*$/i.test(look) ? 'word' : 'str', v: look }];
  if (st) return patchSource(src, new Map([[st.line, () => toks]]));
  return toks ? fmtStmt(toks) + '\n' + src : src;
}

// There is no page size any more: an old `canvas WxH` loses its size, and the line goes if nothing else is on it.
export function dropCanvasSize(src: string): string {
  const st = parseStatements(src).find((x) => x.toks[0]?.t === 'word' && x.toks[0].v === 'canvas' && x.toks.some((t) => /^\d+x\d+$/.test(t.v ?? '')));
  if (!st) return src;
  return patchSource(src, new Map([[st.line, (toks: Tok[]) => {
    const rest = toks.filter((t, i) => i > 0 && !/^\d+x\d+$/.test(t.v ?? ''));
    return rest.length ? [toks[0], ...rest] : null;
  }]]));
}

// Rewrite the diagram's canvas line with background keys (paper=, dots=, dotgap=).
// `bg` maps a key to its new value, or to null to drop it so the look's own value applies;
// keys it does not mention keep what the line had. A line left with nothing on it goes.
export function setCanvas(src: string, sc: Scene, bg: Record<string, string | null> = {}): string {
  const old = sc.canvasLine ? stmtToks(src, sc.canvasLine) ?? [] : [];
  const keep = new Map(old.filter((t) => t.t === 'prop').map((t) => [t.k!, t.v]));
  for (const [k, v] of Object.entries(bg)) if (v === null) keep.delete(k); else keep.set(k, v);
  const toks: Tok[] | null = keep.size ? [{ t: 'word', v: 'canvas' }, ...[...keep].map(([k, v]) => ({ t: 'prop', k, v }) as Tok)] : null;
  if (sc.canvasLine) return patchSource(src, new Map([[sc.canvasLine, () => toks]]));
  if (!toks) return src;
  const lines = src.split('\n');
  const li = lines.findIndex((l) => /^look\b/.test(l));
  lines.splice(li + 1, 0, fmtStmt(toks));
  return lines.join('\n');
}

// Everything that shares a group name with the given elements.
export function withGroups(sc: Scene, ids: string[]): string[] {
  const all = [...sc.shapes, ...sc.texts, ...sc.conns];
  const groups = new Set(ids.map((id) => all.find((x) => x.id === id)?.p.group).filter((g): g is string => !!g));
  if (!groups.size) return ids;
  return [...new Set([...ids, ...all.filter((x) => x.p.group && groups.has(x.p.group)).map((x) => x.id)])];
}

export function groupElements(src: string, sc: Scene, ids: string[]): string {
  const used = new Set([...sc.shapes, ...sc.texts, ...sc.conns].map((x) => x.p.group).filter(Boolean));
  let n = 1;
  while (used.has(`g${n}`)) n++;
  return setProps(src, sc, ids, 'group', `g${n}`);
}

// A legend listing every look style the diagram uses, placed under the drawing.
export function addLegend(src: string, sc: Scene): { src: string; id: string } | null {
  const skip = new Set(['rect', 'ellipse', 'diamond', 'freehand', 'text', 'arrow', 'line', 'legend']);
  const used: string[] = [];
  const note = (name: string) => { if (!skip.has(name) && sc.look.styles.has(name) && !used.includes(name)) used.push(name); };
  for (const s of sc.shapes) if (!s.back && Math.min(s.w, s.h) > 12) note(s.style);
  for (const c of sc.conns) note(c.style);
  if (sc.conns.some((c) => c.style === 'arrow') && sc.look.styles.has('arrow')) used.push('arrow');
  if (!used.length) return null;
  const label = (n: string) => { const u = sc.look.styles.get(n)?.props.use ?? n; const t = u.split(/[:;,.]/)[0].trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const bottom = Math.max(0, ...sc.shapes.filter((s) => s.shape !== 'legend').map((s) => s.y + s.h), ...sc.texts.map((t) => t.y + t.h), ...sc.conns.flatMap((c) => c.pts.map((p) => p.y)));
  const y = Math.ceil((bottom + 28) / 4) * 4;
  const id = freshId(src, 'legend');
  const line = `${id}: legend at 40,${y} ` + used.map((n) => `${n}=${JSON.stringify(label(n))}`).join(' ');
  return { src: appendStatements(src, [line]), id };
}

// Drag one segment of a right-angle connector sideways. Inner segments move freely; a segment
// that touches an end slides that end along the side (or line, or free point) it is attached to.
export function dragSegment(src: string, sc: Scene, c: Conn, i: number, to: Pt): string {
  const pts = c.pts.map((q) => ({ ...q }));
  const A = pts[i], B = pts[i + 1];
  if (!A || !B || (A.x === B.x && A.y === B.y)) return src;
  const horiz = A.y === B.y;
  let v = Math.round((horiz ? to.y : to.x) / 4) * 4;
  const edits: ((t: Tok[]) => Tok[])[] = [];
  const ends: ['a' | 'b', boolean][] = [['a', i === 0], ['b', i === pts.length - 2]];
  for (const [w, touches] of ends) {
    if (!touches) continue;
    const e = c[w];
    if (e.kind === 'shape') {
      const sideHoriz = e.side === 'left' || e.side === 'right'; // a horizontal segment leaves a left/right side
      if (sideHoriz !== horiz) return src;
      const s = sc.shapes.find((x) => x.id === e.id) ?? sc.texts.find((x) => x.id === e.id);
      if (!s) return src;
      const lo = (horiz ? s.y : s.x) + 4, hi = (horiz ? s.y + s.h : s.x + s.w) - 4;
      v = Math.min(Math.max(v, lo), hi);
      edits.push((t) => setEnd(t, w, `${e.id}.${e.side}@${v}`));
    } else if (e.kind === 'conn') {
      const l = sc.conns.find((x) => x.id === e.id);
      if (!l) return src;
      const vert = l.pts[0].x === l.pts[l.pts.length - 1].x;
      if (vert !== horiz) return src;
      edits.push((t) => setEnd(t, w, `${e.id}@${v}`));
    } else if (e.kind === 'point') {
      const p = w === 'a' ? pts[0] : pts[pts.length - 1];
      edits.push((t) => setEnd(t, w, horiz ? `${Math.round(p.x)},${v}` : `${v},${Math.round(p.y)}`));
    } else return src;
  }
  if (horiz) { A.y = v; B.y = v; } else { A.x = v; B.x = v; }
  const via = pts.slice(1, -1).map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(';');
  edits.push((t) => setProp(t, 'via', via || null));
  return patchSource(src, new Map([[c.line, (t) => edits.reduce((acc, f) => f(acc), t)]]));
}

export function setLabelPos(src: string, c: Conn, p: Pt): string {
  return patchSource(src, new Map([[c.line, (t) => setProp(t, 'lpos', `${Math.round(p.x / 2) * 2},${Math.round(p.y / 2) * 2}`)]]));
}

// Move one corner of a polygon. Corners are stored relative to the top-left of the shape, so the position
// and size are rewritten to fit the new outline.
export function movePolyPoint(src: string, s: Shape, index: number, p: Pt): string {
  if (!s.poly) return src;
  const pts = s.poly.map((q, i) => (i === index ? { x: Math.round(p.x), y: Math.round(p.y) } : { x: Math.round(q.x), y: Math.round(q.y) }));
  const x0 = Math.min(...pts.map((q) => q.x)), y0 = Math.min(...pts.map((q) => q.y));
  const w = Math.max(...pts.map((q) => q.x)) - x0, h = Math.max(...pts.map((q) => q.y)) - y0;
  const points = pts.map((q) => `${q.x - x0},${q.y - y0}`).join(';');
  return patchSource(src, new Map([[s.line, (t) => setProp(setSize(setAt(t, x0, y0), w, h), 'points', points)]]));
}

// Change how lines run (right angles, straight, curved); a hand-set route belongs to the old shape, so it goes.
export function setRoute(src: string, sc: Scene, ids: string[], route: string): string {
  const patches = new Map<number, Patch>();
  for (const id of ids) {
    const e = find(sc, id);
    if (e?.kind === 'conn') patches.set(e.el.line, (t) => ['via', 'lpos', 'bend'].reduce((acc, k) => setProp(acc, k, null), setProp(t, 'route', route)));
  }
  return patchSource(src, patches);
}

// Bow a curved line so that its middle passes under the pointer.
export function setBend(src: string, c: Conn, p: Pt): string {
  const A = c.pts[0], B = c.pts[c.pts.length - 1];
  const dx = B.x - A.x, dy = B.y - A.y, dist = Math.hypot(dx, dy) || 1;
  const bend = Math.round((((p.x - (A.x + B.x) / 2) * dy - (p.y - (A.y + B.y) / 2) * dx) / dist) / 4) * 4;
  return patchSource(src, new Map([[c.line, (t) => setProp(setProp(setProp(t, 'via', null), 'lpos', null), 'bend', bend ? String(bend) : null)]]));
}

// Forget hand-set waypoints and label position so the connector is routed automatically again.
export function resetRoute(src: string, sc: Scene, ids: string[]): string {
  const patches = new Map<number, Patch>();
  for (const id of ids) { const e = find(sc, id); if (e?.kind === 'conn') patches.set(e.el.line, (t) => setProp(setProp(setProp(t, 'via', null), 'lpos', null), 'lside', null)); }
  return patchSource(src, patches);
}

// A free text's box: where its "at" point goes and how wide it is, from the text as it is drawn now. A plain text
// becomes a box just as wide as its words, starting where they start, so it does not move; a turned text measures
// along its own baseline.
function textBox(t: TextEl): { x: number; y: number; w: number } {
  const rot = Number(t.p.rotate ?? 0), len = rot ? t.h : t.w;
  if (t.lines) return { x: t.ax, y: t.ay, w: len };
  const a = t.p.anchor, back = a === 'middle' ? len / 2 : a === 'end' ? len : 0;
  return { x: t.ax - (rot ? 0 : back), y: t.ay + (rot === 90 ? -back : rot === -90 ? back : 0), w: len };
}

// Line up free texts inside their boxes (align=left|center|right). A text without a box gets one as wide as it is,
// so it stays where it is; its lines then line up with each other inside it. Left is left off.
export function setTextAlign(src: string, sc: Scene, ids: string[], align: 'left' | 'center' | 'right'): string {
  const patches = new Map<number, Patch>();
  for (const id of ids) {
    const e = find(sc, id);
    if (e?.kind !== 'text') continue;
    const t = e.el, b = textBox(t), own = sc.look.styles.get(t.style)?.props.align;
    const v = align === (own ?? 'left') ? null : align;
    patches.set(t.line, (k) => {
      const out = setProp(k, 'align', v);
      if (t.lines) return out;
      return setProp(setProp(setAt(out, Math.round(b.x), Math.round(b.y)), 'anchor', null), 'width', String(Math.ceil(b.w)));
    });
  }
  return patchSource(src, patches);
}

// A free text scaled by one of its handles dragged to `q`: the text grows or shrinks with its box, its size= and
// (for a text box) its width= scaled alike, so it wraps the same way. The opposite corner or side
// stays put; a side handle also holds the top (left and right handles) or the left (top and bottom).
export function scaleText(src: string, t: TextEl, handle: string, q: Pt): string {
  const fs = Number(t.p.size) || 12, west = handle.includes('w'), north = handle.includes('n');
  const fx = west ? t.x + t.w : t.x, fy = north ? t.y + t.h : t.y;
  const want = Math.max(/[we]/.test(handle) ? Math.abs(q.x - fx) / (t.w || 1) : 0, /[ns]/.test(handle) ? Math.abs(q.y - fy) / (t.h || 1) : 0);
  const size = Math.max(4, Math.round(fs * want * 2) / 2), k = size / fs; // half-point steps
  const w = t.w * k, h = t.h * k, x1 = west ? fx - w : fx, y1 = north ? fy - h : fy;
  const a = t.p.anchor, ax = t.lines ? x1 : x1 + (a === 'middle' ? w / 2 : a === 'end' ? w : 0);
  return patchSource(src, new Map([[t.line, (tk: Tok[]) => {
    let out = setProp(setAt(tk, Math.round(ax), Math.round(y1 + size)), 'size', String(size));
    if (t.lines) out = setProp(out, 'width', String(Math.round(Number(t.p.width) * k)));
    return out;
  }]]));
}

