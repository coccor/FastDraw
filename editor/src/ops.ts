// Editor operations: each takes the current source text and scene and returns new source text.
import { parseStatements } from '../../src/parse.ts';
import type { Tok } from '../../src/parse.ts';
import type { Scene, Shape, TextEl, Conn, End, Box, Pt } from '../../src/scene.ts';
import { patchSource, appendStatements, setAt, setSize, setText, setProp, setKind, setEnd, setOp, fmtStmt, freshId, moveStatement, setRows as editRows } from '../../src/edit.ts';
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
  for (const s of sc.shapes) if (moved.has(s.id)) patches.set(s.line, (t) => setAt(t, s.x + dx, s.y + dy));
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
  const patches = new Map<number, Patch>();
  for (const id of ids) { const e = find(sc, id); if (e) patches.set(e.el.line, (t) => setProp(t, k, v)); }
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

export function addShape(src: string, style: string, b: Box, sized: boolean, table = false): { src: string; id: string } {
  const id = freshId(src, style.replace(/-/g, '_'));
  if (table) {
    const head = `${id}: ${style} "Name" at ${Math.round(b.x)},${Math.round(b.y)}${sized ? ` ${Math.round(b.w)}x${Math.round(b.h)}` : ''}`;
    return { src: appendStatements(src, [head + '\n  | r1 "first" "value"\n  | r2 "second" "value"']), id };
  }
  const line = `${id}: ${style} at ${Math.round(b.x)},${Math.round(b.y)}${sized ? ` ${Math.round(b.w)}x${Math.round(b.h)}` : ''}`;
  return { src: appendStatements(src, [line]), id };
}

export function addText(src: string, x: number, y: number, style?: string): { src: string; id: string } {
  const id = freshId(src, 'note');
  const line = `${id}: text "Text" at ${Math.round(x)},${Math.round(y)}${style && style !== 'text' ? ` style=${style}` : ''}`;
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

export function setCanvas(src: string, sc: Scene, w: number, h: number): string {
  const line = `canvas ${Math.round(w)}x${Math.round(h)}`;
  if (sc.canvasLine) return patchSource(src, new Map([[sc.canvasLine, () => [{ t: 'word', v: 'canvas' }, { t: 'word', v: `${Math.round(w)}x${Math.round(h)}` }] as Tok[]]]));
  const lines = src.split('\n');
  const li = lines.findIndex((l) => /^look\b/.test(l));
  lines.splice(li + 1, 0, line);
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
  const skip = new Set(['rect', 'ellipse', 'diamond', 'text', 'arrow', 'line', 'legend']);
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
  let next = appendStatements(src, [line]);
  if (sc.h < y + 72) next = setCanvas(next, sc, sc.w, y + 72);
  return { src: next, id };
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
