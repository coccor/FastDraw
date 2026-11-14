// The top of the home page: a cut-down editor with one diagram in it. The text is on the left and the
// canvas on the right; dragging a box rewrites that box's line and nothing else, which is the thing to show.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildScene, type Shape } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';
import { patchSource, setAt, appendStatements, freshId } from '../../../src/edit.ts';
import { color } from '../../../src/look.ts';
import { useTheme } from '../theme.ts';
import { inTheme } from './inTheme.ts';

export type Doc = { name: string; kind: string | null; look: string; body: string; orig: string };
export const docText = (d: Doc) => (d.look ? `look ${d.look}\n` : '') + d.body;
export const HANDOFF = 'fastdraw-from-site';

const GRID = 4;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// ids in the accent, quoted text in green: enough colour to read the file by
const tint = (s: string, first: boolean) => {
  let h = esc(s).replace(/"[^"]*"?/g, (m) => `<q>${m}</q>`);
  if (first) h = h.replace(/^(\s*)([\w.-]+:)(?=\s)/, '$1<i>$2</i>');
  return h;
};

type Line = { n: number; html: string; changed: boolean };
// The file as lines, with what differs from the original marked. A moved box changes one value on one line,
// so that value is shown struck through beside the new one.
function sourceLines(doc: Doc): Line[] {
  const now = doc.body.replace(/\n$/, '').split('\n'), was = doc.orig.replace(/\n$/, '').split('\n');
  const same = now.length === was.length, old = new Set(was);
  const out: Line[] = [];
  if (doc.look) out.push({ n: 1, html: `<ins>look ${esc(doc.look)}</ins>`, changed: true });
  now.forEach((l, k) => {
    const n = out.length + 1;
    if (same ? l === was[k] : old.has(l)) { out.push({ n, html: tint(l, true), changed: false }); return; }
    if (!same || k >= was.length) { out.push({ n, html: `<ins>${esc(l)}</ins>`, changed: true }); return; }
    const a = was[k].split(' '), b = l.split(' ');
    let p = 0, s = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    const mid = (x: string[]) => x.slice(p, x.length - s).join(' ');
    const head = b.slice(0, p).join(' '), tail = b.slice(b.length - s).join(' ');
    out.push({ n, changed: true, html: `${tint(head, true)}${head ? ' ' : ''}${mid(a) ? `<del>${esc(mid(a))}</del>` : ''}<ins>${esc(mid(b))}</ins>${tail ? ' ' : ''}${tint(tail, false)}` });
  });
  return out;
}

export function Workbench({ doc, setDoc, onSettle }: { doc: Doc; setDoc: (d: Doc) => void; onSettle: (d: Doc) => void }) {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement>(null), srcRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const drag = useRef<{ id: string; line: number; ox: number; oy: number; px: number; py: number; box: string; moved: boolean } | null>(null);
  const [frozen, setFrozen] = useState<string | null>(null); // the view box held still while a box is dragged
  const touched = useRef(false);

  const shown = inTheme(docText(doc), theme);
  const offset = shown.length - doc.body.length ? shown.slice(0, shown.length - doc.body.length).split('\n').length - 1 : 0;
  const sc = useMemo(() => buildScene(shown, null), [shown]);
  const front = useMemo(() => sc.shapes.filter((s) => !s.back && s.shape !== 'legend' && s.id), [sc]);
  const picked = front.find((s) => s.id === sel);
  const box = frozen ?? `${sc.x} ${sc.y} ${sc.w} ${sc.h}`;
  const body = renderBody(sc) + (picked ? `<rect class="wb-sel" x="${picked.x - 5}" y="${picked.y - 5}" width="${picked.w + 10}" height="${picked.h + 10}" rx="3"/>` : '');
  const lines = useMemo(() => sourceLines(doc), [doc]);
  const changed = lines.filter((l) => l.changed);

  // keep the line that just changed in view, inside the text pane only
  useEffect(() => {
    if (!touched.current) return;
    const pane = srcRef.current, hit = pane?.querySelector<HTMLElement>('.wb-ln.hit');
    if (!pane || !hit) return;
    const top = hit.offsetTop, bottom = top + hit.offsetHeight;
    if (top < pane.scrollTop) pane.scrollTop = top - 24;
    else if (bottom > pane.scrollTop + pane.clientHeight) pane.scrollTop = bottom - pane.clientHeight + 24;
  }, [lines]);

  const at = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!, m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: q.x, y: q.y };
  };
  const hit = (q: { x: number; y: number }): Shape | undefined =>
    [...front].reverse().find((s) => q.x >= s.x && q.x <= s.x + s.w && q.y >= s.y && q.y <= s.y + s.h);
  const moveTo = (line: number, x: number, y: number): Doc => ({ ...doc, body: patchSource(doc.body, new Map([[line - offset, (t) => setAt(t, x, y)]])) });

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    const q = at(e), s = hit(q);
    setSel(s?.id ?? null);
    if (!s) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: s.id, line: s.line, ox: s.x, oy: s.y, px: q.x, py: q.y, box, moved: false };
    setFrozen(box);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current, q = at(e);
    if (!d) { e.currentTarget.style.cursor = hit(q) ? 'grab' : ''; return; }
    const x = snap(d.ox + q.x - d.px), y = snap(d.oy + q.y - d.py);
    if (!d.moved && x === d.ox && y === d.oy) return;
    d.moved = true;
    touched.current = true;
    setDoc(moveTo(d.line, x, y));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    setFrozen(null);
    if (d?.moved) onSettle(doc);
  };
  // without a mouse: arrow keys move the selected box, 8px a press
  const key = (e: React.KeyboardEvent) => {
    const step: Record<string, [number, number]> = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
    const by = step[e.key];
    if (!by || !picked) return;
    e.preventDefault();
    nudge(picked, by[0], by[1]);
  };
  const nudge = (s: Shape, dx: number, dy: number) => {
    touched.current = true;
    const next = moveTo(s.line, snap(s.x + dx), snap(s.y + dy));
    setDoc(next);
    onSettle(next);
  };
  const moveOne = () => {
    const s = picked ?? front[front.length - 1];
    if (!s) return;
    setSel(s.id);
    nudge(s, 0, 48);
  };
  const addBox = () => {
    const id = freshId(doc.body, 'box');
    const x = Math.min(...front.map((s) => s.x), 40), y = snap(Math.max(...sc.shapes.map((s) => s.y + s.h), 40) + 32);
    touched.current = true;
    const next = { ...doc, body: appendStatements(doc.body, [`${id}: node "New box" at ${snap(x)},${y}`]) };
    setDoc(next);
    onSettle(next);
    setSel(id);
  };
  const reset = () => { const next = { ...doc, look: '', body: doc.orig }; setSel(null); setDoc(next); onSettle(next); };
  const dirty = doc.body !== doc.orig || !!doc.look;
  const openFull = () => { try { sessionStorage.setItem(HANDOFF, JSON.stringify({ text: docText(doc), name: doc.name })); } catch { /* the editor opens empty */ } };

  const total = lines.length, rest = total - changed.length;
  const status = !changed.length ? 'Nothing has changed yet. Drag a box on the canvas.'
    : changed.length === 1 ? `Line ${changed[0].n} changed. The other ${rest} ${rest === 1 ? 'line is' : 'lines are'} as they were.`
      : `${changed.length} lines changed (${changed.map((l) => l.n).slice(0, 6).join(', ')}${changed.length > 6 ? ', …' : ''}). The other ${rest} are as they were.`;

  return (
    <section id="try" className="wb" aria-label="Try FastDraw">
      <div className="wb-bar">
        <span className="wb-file">{doc.name}</span>
        <button onClick={addBox}>Add a box</button>
        <button onClick={moveOne}>Move a box</button>
        <button onClick={reset} disabled={!dirty}>Reset</button>
        <a className="wb-open" href="edit/?from=site" onClick={openFull}>Open in the full editor</a>
      </div>
      <div className="wb-split">
        <div className="wb-src" ref={srcRef} tabIndex={0} role="group" aria-label={`The text of ${doc.name}`}>
          {lines.map((l) => <div key={l.n} className={'wb-ln' + (l.changed ? ' hit' : '')}><span>{l.n}</span><code dangerouslySetInnerHTML={{ __html: l.html || ' ' }} /></div>)}
        </div>
        <div className="wb-canvas" style={{ background: color(sc.look, sc.look.canvas.paper ?? 'paper') }}>
          <svg ref={svgRef} viewBox={box} preserveAspectRatio="xMidYMid meet" tabIndex={0} role="application"
            aria-label={`${doc.name} drawn on a canvas. Click a box to select it, then drag it or move it with the arrow keys.`}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
            dangerouslySetInnerHTML={{ __html: body }} />
        </div>
      </div>
      <p className="wb-status" role="status">{status}</p>
    </section>
  );
}
