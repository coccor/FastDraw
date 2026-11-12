import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseLook } from '../../src/look.ts';
import { buildScene, lookPath } from '../../src/scene.ts';
import type { Scene, Pt, Box, Conn } from '../../src/scene.ts';
import { check } from '../../src/check.ts';
import { renderBody, renderSvg } from '../../src/render.ts';
import * as ops from './ops.ts';
import * as files from './files.ts';
import { Panel, TextField } from './Panel.tsx';
import { Gallery } from './Gallery.tsx';
import {
  BringToFront, Check, Circle, ClipboardPaste, Copy, Diamond, Download, FileCode, FileText, FolderOpen, Hand, ImageDown, Lock, LockOpen,
  Menu, Minus, MousePointer2, MoveUpRight, Pencil, Plus, Redo2, SendToBack, Shapes, Square, Trash2, TriangleAlert, Type, Undo2,
} from 'lucide-react';
import demoArch from '../../examples/test/architecture.fdraw?raw';
import demoFlow from '../../examples/test/flowchart.fdraw?raw';
import demoSeq from '../../examples/test/sequence.fdraw?raw';
import demoLook from '../../looks/reference.look?raw';
import { fontCss } from './fonts.ts';

type Drag =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { type: 'move'; start: Pt; ids: string[]; base: string; scene: Scene; moved: boolean }
  | { type: 'resize'; id: string; corner: string; base: string; scene: Scene }
  | { type: 'marquee'; start: Pt; add: boolean }
  | { type: 'draw'; style: string; start: Pt }
  | { type: 'conn'; op: string; from: string; start: Pt; style?: string }
  | { type: 'end'; id: string; which: 'a' | 'b'; base: string; scene: Scene };
type Ghost = { kind: 'box'; box: Box; dashed?: boolean } | { kind: 'line'; a: Pt; b: Pt } | null;
type Editing = { id: string; value: string; box: Box } | null;
type Io = { file?: files.Handle; look?: files.Handle; fileMod: number; lookMod: number; written: string; folder?: files.Folder; path?: string };

const snap = (v: number) => Math.round(v / 4) * 4;
const DEMOS: [string, string][] = [['Architecture', demoArch], ['Flowchart', demoFlow], ['Sequence', demoSeq]];
const ICONS: Record<string, React.ReactNode> = {
  hand: <Hand size={17} />, select: <MousePointer2 size={17} />, rect: <Square size={17} />, ellipse: <Circle size={17} />, diamond: <Diamond size={17} />,
  arrow: <MoveUpRight size={17} />, line: <Minus size={17} />, text: <Type size={17} />,
};
const TOOLS: [string, string, string][] = [
  ['hand', 'Hand (pan)', 'H'], ['select', 'Select', 'V'], ['rect', 'Rectangle', 'R'], ['ellipse', 'Ellipse', 'O'], ['diamond', 'Diamond', 'D'],
  ['arrow', 'Arrow', 'A'], ['line', 'Line', 'L'], ['text', 'Text', 'T'],
];

export function App() {
  const [src, setSrcState] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [lookSrc, setLookSrc] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [tool, setTool] = useState('select');
  const [view, setView] = useState({ x: 60, y: 90, k: 1 });
  const [ghost, setGhost] = useState<Ghost>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [editing, setEditing] = useState<Editing>(null);
  const [status, setStatus] = useState('');
  const [showIssues, setShowIssues] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [folderFiles, setFolderFiles] = useState<string[]>([]);
  const [, force] = useState(0);
  const [locked, setLocked] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const lockedRef = useRef(false); lockedRef.current = locked;
  const doneDrawing = () => { if (!lockedRef.current) setTool('select'); };

  const hist = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const io = useRef<Io>({ fileMod: 0, lookMod: 0, written: '' });
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const srcRef = useRef<string | null>(null);
  const space = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const clip = useRef<string[]>([]);
  const lastClick = useRef<{ id: string; t: number }>({ id: '', t: 0 });
  const pendingEdit = useRef<string | null>(null);
  srcRef.current = src;

  const look = useMemo(() => (lookSrc != null ? parseLook(lookSrc) : null), [lookSrc]);
  const cur = draft ?? src ?? '';
  const scene = useMemo(() => buildScene(cur, look), [cur, look]);
  const issues = useMemo(() => check(scene).filter((i) => i.level !== 'hint'), [scene]);
  const body = useMemo(() => renderBody(scene), [scene]);

  // ---- saving and history -------------------------------------------------
  const save = useCallback((text: string) => {
    window.clearTimeout(saveTimer.current);
    if (!io.current.file) { setStatus('not saved to disk'); return; }
    setStatus('saving…');
    saveTimer.current = window.setTimeout(async () => {
      try {
        io.current.written = text;
        io.current.fileMod = await files.writeHandle(io.current.file!, text);
        setStatus('saved');
      } catch (e) { setStatus('could not save: ' + (e as Error).message); }
    }, 250);
  }, []);

  const commit = useCallback((next: string, keepSel?: string[]) => {
    const prev = srcRef.current;
    setDraft(null);
    if (prev === null || next === prev) return;
    hist.current.past.push(prev);
    if (hist.current.past.length > 200) hist.current.past.shift();
    hist.current.future = [];
    srcRef.current = next;
    setSrcState(next);
    if (keepSel) setSel(keepSel);
    save(next);
  }, [save]);

  const undo = useCallback((redo: boolean) => {
    const h = hist.current, from = redo ? h.future : h.past, to = redo ? h.past : h.future;
    const prev = srcRef.current;
    if (!from.length || prev === null) return;
    to.push(prev);
    const next = from.pop()!;
    srcRef.current = next; setSrcState(next); setDraft(null); save(next);
  }, [save]);

  const load = useCallback((text: string, lookText: string | null, label: string) => {
    hist.current = { past: [], future: [] };
    srcRef.current = text; setSrcState(text); setDraft(null); setLookSrc(lookText); setName(label); setSel([]); setEditing(null);
    setStatus(io.current.file ? 'saved' : 'not saved to disk');
    const sc = buildScene(text, lookText != null ? parseLook(lookText) : null);
    const vw = window.innerWidth, vh = window.innerHeight;
    const k = Math.min(1.5, Math.max(0.2, Math.min((vw - 340) / sc.w, (vh - 140) / sc.h)));
    setView({ x: Math.round((vw - sc.w * k) / 2 + 80), y: Math.round((vh - sc.h * k) / 2 + 16), k });
  }, []);

  // ---- opening ------------------------------------------------------------
  const openPath = useCallback(async (folder: files.Folder, path: string) => {
    const h = await files.resolveIn(folder.root, path);
    if (!h) return;
    const { text, modified } = await files.readHandle(h);
    const lp = lookPath(text);
    const lh = lp ? await files.resolveIn(folder.root, files.dirOf(path) + lp) : null;
    const lr = lh ? await files.readHandle(lh) : null;
    io.current = { file: h, look: lh ?? undefined, fileMod: modified, lookMod: lr?.modified ?? 0, written: text, folder, path };
    load(text, lr?.text ?? null, path);
  }, [load]);

  const openFolder = useCallback(async () => {
    try {
      const opfs = new URLSearchParams(location.search).has('opfs');
      const folder = opfs ? await files.scanFolder(await navigator.storage.getDirectory()) : await files.pickFolder();
      setFolderFiles(folder.files);
      io.current = { fileMod: 0, lookMod: 0, written: '', folder };
      if (folder.files.length) await openPath(folder, folder.files[0]);
      else setStatus('no .fdraw files in that folder');
    } catch { /* picker cancelled */ }
  }, [openPath]);

  const openFile = useCallback(async () => {
    try {
      if (!files.hasFileAccess) {
        const picked = await files.pickUpload('.fdraw,.look', true);
        const d = picked.find((f) => f.name.endsWith('.fdraw')), l = picked.find((f) => f.name.endsWith('.look'));
        if (!d) return;
        io.current = { fileMod: 0, lookMod: 0, written: '' };
        setFolderFiles([]);
        load(await d.text(), l ? await l.text() : null, d.name);
        return;
      }
      const h = await files.pickFile('diagram');
      await files.ensureWritable(h);
      const { text, modified } = await files.readHandle(h);
      io.current = { file: h, fileMod: modified, lookMod: 0, written: text };
      setFolderFiles([]);
      load(text, null, h.name);
    } catch { /* picker cancelled */ }
  }, [load]);

  const chooseLook = useCallback(async () => {
    try {
      if (!files.hasFileAccess) { const [f] = await files.pickUpload('.look', false); if (f) setLookSrc(await f.text()); return; }
      const h = await files.pickFile('look');
      const r = await files.readHandle(h);
      io.current.look = h; io.current.lookMod = r.modified;
      setLookSrc(r.text);
    } catch { /* cancelled */ }
  }, []);

  const openDemo = (text: string, label: string) => {
    io.current = { fileMod: 0, lookMod: 0, written: '' };
    setFolderFiles([]);
    load(text, demoLook, label + ' (example)');
  };

  // notice changes made outside the editor (an agent rewriting the file)
  useEffect(() => {
    const t = window.setInterval(async () => {
      const s = io.current;
      if (drag.current) return;
      try {
        if (s.file) {
          const f = await s.file.getFile();
          if (f.lastModified !== s.fileMod) {
            s.fileMod = f.lastModified;
            const text = await f.text();
            if (text !== srcRef.current && text !== s.written) {
              if (srcRef.current !== null) hist.current.past.push(srcRef.current);
              hist.current.future = [];
              s.written = text; srcRef.current = text; setSrcState(text); setDraft(null); setEditing(null);
              setStatus('updated from disk');
            }
          }
        }
        if (s.look) {
          const f = await s.look.getFile();
          if (f.lastModified !== s.lookMod) { s.lookMod = f.lastModified; setLookSrc(await f.text()); setStatus('look updated from disk'); }
        }
      } catch { /* file moved or permission lost; keep working in memory */ }
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  // drop selection entries that no longer exist
  useEffect(() => {
    const alive = sel.filter((id) => ops.find(scene, id));
    if (alive.length !== sel.length) setSel(alive);
  }, [scene, sel]);

  // ---- geometry helpers ---------------------------------------------------
  const world = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
  };
  const shapeAt = (sc: Scene, p: Pt) =>
    [...sc.shapes].reverse().find((s) => !s.back && p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h);
  // What a connector end dropped at p should attach to: a shape, a point on a straight line, or a free point.
  const attachAt = (sc: Scene, p: Pt, not?: string): string => {
    const s = shapeAt(sc, p);
    if (s) return s.id;
    for (const c of sc.conns) {
      if (c.id === not || c.pts.length !== 2 || c.head || c.id.startsWith('_')) continue;
      const [a, b] = c.pts;
      if (a.x === b.x && Math.abs(p.x - a.x) <= 6 && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) return `${c.id}@${snap(p.y)}`;
      if (a.y === b.y && Math.abs(p.y - a.y) <= 6 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)) return `${c.id}@${snap(p.x)}`;
    }
    return `${snap(p.x)},${snap(p.y)}`;
  };

  const startEdit = (id: string) => {
    const e = ops.find(scene, id);
    if (!e || src === null) return;
    let box: Box = ops.boxOf(e);
    if (e.kind === 'conn') {
      const l = (e.el as Conn).label;
      const mid = e.el.pts[Math.floor((e.el.pts.length - 1) / 2)], nx = e.el.pts[Math.floor((e.el.pts.length - 1) / 2) + 1];
      box = l ? { x: l.x - 20, y: l.y - 6, w: l.w + 40, h: 24 } : { x: (mid.x + nx.x) / 2 - 70, y: (mid.y + nx.y) / 2 - 26, w: 140, h: 24 };
    } else if (e.kind === 'text') box = { x: box.x - 4, y: box.y - 4, w: Math.max(box.w + 40, 160), h: box.h + 10 };
    setEditing({ id, value: ops.rawText(src, e), box });
  };
  const finishEdit = (ok: boolean) => {
    const ed = editing;
    setEditing(null);
    if (!ed || !ok || src === null) return;
    const e = ops.find(scene, ed.id);
    if (!e) return;
    if (e.kind === 'text' && ed.value.trim() === '') commit(ops.deleteElements(src, scene, [ed.id]), []);
    else commit(ops.editText(src, e, ed.value));
  };

  // ---- pointer handling ---------------------------------------------------
  const onDown = (e: React.PointerEvent) => {
    if (src === null) return;
    if (editing) finishEdit(true);
    setMenuOpen(false); setGalleryOpen(false); setCtx(null);
    if (e.button === 2) return;
    const p = world(e);
    const t = e.target as Element;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (e.button === 1 || space.current || (tool === 'hand' && e.button === 0)) { drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; return; }
    if (e.button !== 0) return;
    if (tool === 'arrow' || tool === 'line' || tool.startsWith('conn:')) {
      const style = tool.startsWith('conn:') ? tool.slice(5) : undefined;
      const sp = style ? scene.look.styles.get(style)?.props : undefined;
      const plain = sp ? sp.head === 'none' || sp.route === 'straight' : tool === 'line';
      drag.current = { type: 'conn', op: plain ? '--' : '->', from: attachAt(scene, p), start: p, style };
      return;
    }
    if (tool !== 'select') { drag.current = { type: 'draw', style: tool.replace(/^style:/, ''), start: p }; return; }
    const handle = t.getAttribute('data-handle'), end = t.getAttribute('data-end');
    if (handle && sel.length === 1) { drag.current = { type: 'resize', id: sel[0], corner: handle, base: src, scene }; return; }
    if (end && sel.length === 1) { drag.current = { type: 'end', id: sel[0], which: end as 'a' | 'b', base: src, scene }; return; }
    const id = t.closest('[data-id]')?.getAttribute('data-id');
    if (id) {
      // second press on the same element: edit its text once the button is released
      const now = performance.now();
      if (lastClick.current.id === id && now - lastClick.current.t < 450 && !e.shiftKey) { lastClick.current = { id: '', t: 0 }; pendingEdit.current = id; setSel([id]); return; }
      lastClick.current = { id, t: now };
      let ids = sel;
      if (e.shiftKey) ids = sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id];
      else if (!sel.includes(id)) ids = [id];
      setSel(ids);
      if (ids.includes(id)) drag.current = { type: 'move', start: p, ids, base: src, scene, moved: false };
      return;
    }
    if (!e.shiftKey) setSel([]);
    drag.current = { type: 'marquee', start: p, add: e.shiftKey };
  };

  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    if (src === null) return;
    const id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id');
    if (!id) { setCtx(null); return; }
    if (!sel.includes(id)) setSel([id]);
    setTool('select');
    setCtx({ x: e.clientX, y: e.clientY });
  };

  const zoomBy = (f: number) => setView((v) => {
    const k = Math.min(4, Math.max(0.1, v.k * f)), mx = window.innerWidth / 2, my = window.innerHeight / 2;
    return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
  });

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      const id = tool === 'select' ? (e.target as Element).closest?.('[data-id]')?.getAttribute('data-id') ?? null : null;
      if (id !== hover) setHover(id);
      return;
    }
    const p = world(e);
    if (d.type === 'pan') { setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy })); return; }
    if (d.type === 'move') {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * view.k < 3) return;
      d.moved = true;
      const els = d.ids.map((id) => ops.find(d.scene, id)).filter((x): x is ops.El => !!x);
      const boxes = els.filter((x) => x.kind !== 'conn').map(ops.boxOf);
      const u = ops.unionBox(boxes.length ? boxes : els.map(ops.boxOf));
      const g: { x?: number; y?: number } = {};
      if (!e.altKey) {
        const others = d.scene.shapes.filter((s) => !s.back && !d.ids.includes(s.id) && Math.min(s.w, s.h) > 12);
        const tol = 6 / view.k;
        const near = (mine: number[], theirs: number[]) => {
          let best: { adj: number; at: number } | null = null;
          for (const m of mine) for (const o of theirs) { const a = o - m; if (Math.abs(a) <= tol && (!best || Math.abs(a) < Math.abs(best.adj))) best = { adj: a, at: o }; }
          return best;
        };
        const nx = near([u.x + dx, u.x + u.w / 2 + dx, u.x + u.w + dx], others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w]));
        const ny = near([u.y + dy, u.y + u.h / 2 + dy, u.y + u.h + dy], others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h]));
        if (nx) { dx += nx.adj; g.x = nx.at; } else dx = snap(u.x + dx) - u.x;
        if (ny) { dy += ny.adj; g.y = ny.at; } else dy = snap(u.y + dy) - u.y;
      }
      setGuides(g);
      setDraft(ops.moveElements(d.base, d.scene, d.ids, Math.round(dx), Math.round(dy)));
      return;
    }
    if (d.type === 'resize') {
      const e0 = ops.find(d.scene, d.id);
      if (!e0 || e0.kind !== 'shape') return;
      const s = e0.el;
      let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
      const q = e.altKey ? p : { x: snap(p.x), y: snap(p.y) };
      if (d.corner.includes('w')) x1 = Math.min(q.x, x2 - 8); else x2 = Math.max(q.x, x1 + 8);
      if (d.corner.includes('n')) y1 = Math.min(q.y, y2 - 8); else y2 = Math.max(q.y, y1 + 8);
      setDraft(ops.resizeShape(d.base, s, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }));
      return;
    }
    if (d.type === 'end') {
      const e0 = ops.find(d.scene, d.id);
      if (e0?.kind === 'conn') setDraft(ops.reattach(d.base, e0.el, d.which, attachAt(d.scene, p, d.id)));
      return;
    }
    if (d.type === 'marquee' || d.type === 'draw') {
      const box = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
      setGhost({ kind: 'box', box, dashed: d.type === 'marquee' });
      return;
    }
    if (d.type === 'conn') setGhost({ kind: 'line', a: d.start, b: p });
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGhost(null); setGuides({});
    if (pendingEdit.current) { const id = pendingEdit.current; pendingEdit.current = null; startEdit(id); return; }
    if (!d || src === null) return;
    const p = world(e);
    if (d.type === 'move' || d.type === 'resize' || d.type === 'end') { if (draft !== null) commit(draft); else setDraft(null); return; }
    if (d.type === 'marquee') {
      const box = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
      if (box.w < 3 && box.h < 3) return;
      const inside = (b: Box) => b.x >= box.x && b.y >= box.y && b.x + b.w <= box.x + box.w && b.y + b.h <= box.y + box.h;
      const hit = [...scene.shapes, ...scene.texts].filter(inside).map((s) => s.id).concat(scene.conns.filter((c) => inside(ops.boxOf({ kind: 'conn', el: c }))).map((c) => c.id));
      setSel(d.add ? [...new Set([...sel, ...hit])] : hit);
      return;
    }
    if (d.type === 'draw') {
      const style = scene.look.styles.get(d.style);
      if (!style) return;
      const big = Math.abs(p.x - d.start.x) > 8 && Math.abs(p.y - d.start.y) > 8;
      if (style.kind === 'text') {
        const r = ops.addText(src, snap(d.start.x), snap(d.start.y), d.style);
        commit(r.src, [r.id]); doneDrawing();
        window.setTimeout(() => setEditing({ id: r.id, value: 'Text', box: { x: snap(d.start.x) - 4, y: snap(d.start.y) - 18, w: 200, h: 26 } }), 0);
        return;
      }
      const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(style.props.size ?? '');
      const dw = m ? +m[1] : 120, dh = m ? +m[2] : 64;
      const box = big
        ? { x: snap(Math.min(d.start.x, p.x)), y: snap(Math.min(d.start.y, p.y)), w: snap(Math.abs(p.x - d.start.x)), h: snap(Math.abs(p.y - d.start.y)) }
        : { x: snap(d.start.x - dw / 2), y: snap(d.start.y - dh / 2), w: dw, h: dh };
      const r = ops.addShape(src, d.style, box, big || !m);
      commit(r.src, [r.id]); doneDrawing();
      return;
    }
    if (d.type === 'conn') {
      let to = attachAt(scene, p);
      if (to === d.from || (Math.hypot(p.x - d.start.x, p.y - d.start.y) < 8)) return;
      // two points on parallel lines: keep the connector level
      const ma = /^(.+)@(\d+)$/.exec(d.from), mb = /^(.+)@(\d+)$/.exec(to);
      if (ma && mb && ma[1] !== mb[1]) to = `${mb[1]}@${ma[2]}`;
      const r = ops.addConn(src, d.from, to, d.op, d.style);
      commit(r.src, [r.id]); doneDrawing();
    }
  };

  // wheel: ctrl/cmd zooms around the pointer, otherwise pans
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        if (!(e.ctrlKey || e.metaKey)) return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
        const k = Math.min(4, Math.max(0.1, v.k * Math.exp(-e.deltaY * 0.0025)));
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [src === null]);

  // ---- actions ------------------------------------------------------------
  const act = {
    setProp: (k: string, v: string | null) => src !== null && commit(ops.setProps(src, scene, sel, k, v)),
    setStyle: (n: string) => src !== null && commit(ops.setStyle(src, scene, sel, n)),
    setOp: (o: string) => src !== null && commit(ops.setOperator(src, scene, sel, o)),
    reorder: (w: 'front' | 'back') => src !== null && commit(ops.reorder(src, scene, sel, w)),
    align: (m: ops.AlignMode) => src !== null && commit(ops.align(src, scene, sel, m)),
    remove: () => src !== null && sel.length > 0 && commit(ops.deleteElements(src, scene, sel), []),
    duplicate: () => { if (src === null || !sel.length) return; const r = ops.duplicateElements(src, scene, sel); commit(r.src, r.ids); },
    setCanvas: (w: number, h: number) => src !== null && commit(ops.setCanvas(src, scene, w, h)),
  };
  const actRef = useRef(act); actRef.current = act;
  const stateRef = useRef({ sel, scene, src, editing }); stateRef.current = { sel, scene, src, editing };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const { sel: s, scene: sc, src: text } = stateRef.current;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === ' ') { space.current = true; force((n) => n + 1); e.preventDefault(); return; }
      if (text === null) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); undo(true); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); actRef.current.duplicate(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel([...sc.shapes, ...sc.texts, ...sc.conns].map((x) => x.id)); return; }
      if (mod && e.key.toLowerCase() === 'c') { clip.current = s; return; }
      if (mod && e.key.toLowerCase() === 'v') { if (clip.current.length) { const r = ops.duplicateElements(text, sc, clip.current.filter((id) => ops.find(sc, id))); commit(r.src, r.ids); } return; }
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actRef.current.remove(); return; }
      if (e.key === 'Escape') { setSel([]); setTool('select'); setMenuOpen(false); setGalleryOpen(false); setCtx(null); return; }
      if (e.key === 'Enter' && s.length === 1) { e.preventDefault(); startEditRef.current(s[0]); return; }
      if (e.key.startsWith('Arrow') && s.length) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 4;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        commit(ops.moveElements(text, sc, s, dx, dy));
        return;
      }
      const hot = TOOLS.find((t) => t[2].toLowerCase() === e.key.toLowerCase());
      if (hot) setTool(hot[0]);
    };
    const up = (e: KeyboardEvent) => { if (e.key === ' ') { space.current = false; force((n) => n + 1); } };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [commit, undo]);
  const startEditRef = useRef(startEdit); startEditRef.current = startEdit;

  const exportAs = async (kind: 'png' | 'svg') => {
    const svg = renderSvg(scene, await fontCss());
    const base = (name || 'diagram').replace(/ \(example\)$/, '').replace(/^.*\//, '').replace(/\.fdraw$/, '');
    if (kind === 'svg') { files.download(base + '.svg', svg, 'image/svg+xml'); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = scene.w * 2; c.height = scene.h * 2;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => b && files.download(base + '.png', b));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };

  // ---- render -------------------------------------------------------------
  const closePopups = () => { setMenuOpen(false); setGalleryOpen(false); setCtx(null); };
  const baseName = (name || 'diagram').replace(/ \(example\)$/, '').replace(/^.*\//, '').replace(/\.fdraw$/, '').replace(/\s+/g, '-');

  if (src === null) {
    return (
      <div className="start">
        <div className="welcome">
          <h1>FastDraw</h1>
          <p className="lede">Open a diagram an agent wrote, change anything on the canvas, and it is saved back to the same file.</p>
          <div className="choices">
            {files.hasFileAccess && (
              <button className="choice" onClick={openFolder}><FolderOpen size={20} /><span><b>Open a folder</b><i>Finds the diagrams and their look, saves in place, follows an agent live</i></span></button>
            )}
            <button className="choice" onClick={openFile}><FileText size={20} /><span><b>Open a file</b><i>{files.hasFileAccess ? 'One diagram; you may be asked for its look file' : 'Pick the diagram and its look file together'}</i></span></button>
            <button className="choice" onClick={() => setPasteOpen(true)}><ClipboardPaste size={20} /><span><b>Paste diagram text</b><i>For text an assistant gave you in a chat</i></span></button>
          </div>
          <p className="muted">Or look at an example: {DEMOS.map(([l, t]) => <button key={l} className="linkbtn" onClick={() => openDemo(t, l)}>{l}</button>)}</p>
          <p className="muted">
            {files.hasFileAccess
              ? 'Files stay on your machine. Nothing is uploaded.'
              : 'This browser cannot save files in place, so changes stay in memory and you download the result. Chrome and Edge can save in place. Nothing is uploaded.'}
          </p>
          {status && <p className="muted warn">{status}</p>}
        </div>
        {pasteOpen && <PasteDialog onClose={() => setPasteOpen(false)} onLoad={(t) => { setPasteOpen(false); io.current = { fileMod: 0, lookMod: 0, written: '' }; load(t, demoLook, 'pasted diagram'); }} />}
      </div>
    );
  }

  const missingLook = lookPath(cur) && lookSrc === null;
  const single = sel.length === 1 ? ops.find(scene, sel[0]) : undefined;
  const hs = 8 / view.k;
  const armed = tool.startsWith('style:') || tool.startsWith('conn:');
  const cursor = space.current || tool === 'hand' ? 'grab' : tool === 'select' ? (hover ? 'move' : 'default') : 'crosshair';
  const hovered = hover && !sel.includes(hover) && tool === 'select' ? ops.find(scene, hover) : undefined;
  const saveState = status.startsWith('could not') ? 'bad' : status === 'not saved to disk' ? 'mem' : 'ok';

  return (
    <div className="app" onPointerDown={closePopups}>
      <svg ref={svgRef} className="canvas" style={{ cursor }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerLeave={() => setHover(null)} onContextMenu={onContext}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <rect x={-1} y={-1} width={scene.w + 2} height={scene.h + 2} fill="none" stroke="#cfd2da" strokeWidth={1 / view.k} />
          <g dangerouslySetInnerHTML={{ __html: body }} style={{ pointerEvents: 'none' }} />
          <g fill="transparent" stroke="transparent">
            {scene.shapes.filter((s) => s.back).map((s) => <rect key={s.id} data-id={s.id} x={s.x} y={s.y} width={s.w} height={s.h} fill="none" strokeWidth={10} pointerEvents="stroke" />)}
            {scene.conns.map((c) => <polyline key={c.id} data-id={c.id} points={c.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" strokeWidth={12} pointerEvents="stroke" />)}
            {scene.conns.filter((c) => c.label).map((c) => <rect key={c.id + '-l'} data-id={c.id} x={c.label!.x} y={c.label!.y} width={c.label!.w} height={c.label!.h} />)}
            {scene.shapes.filter((s) => !s.back).map((s) => <rect key={s.id} data-id={s.id} x={s.x} y={s.y} width={s.w} height={s.h} />)}
            {scene.texts.map((t) => <rect key={t.id} data-id={t.id} x={t.x - 2} y={t.y - 2} width={t.w + 4} height={t.h + 4} />)}
          </g>
          <g fill="none" stroke="var(--accent)" strokeWidth={1.5 / view.k} pointerEvents="none">
            {hovered && (hovered.kind === 'conn'
              ? <polyline points={hovered.el.pts.map((p) => `${p.x},${p.y}`).join(' ')} strokeWidth={4 / view.k} opacity={0.25} />
              : <rect x={ops.boxOf(hovered).x - 2} y={ops.boxOf(hovered).y - 2} width={ops.boxOf(hovered).w + 4} height={ops.boxOf(hovered).h + 4} opacity={0.45} rx={3 / view.k} />)}
            {sel.map((id) => {
              const e = ops.find(scene, id);
              if (!e) return null;
              if (e.kind === 'conn') return <polyline key={id} points={e.el.pts.map((p) => `${p.x},${p.y}`).join(' ')} strokeWidth={3.5 / view.k} opacity={0.45} />;
              const b = ops.boxOf(e);
              return <rect key={id} x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} rx={2 / view.k} />;
            })}
            {guides.x !== undefined && <line x1={guides.x} y1={-2000} x2={guides.x} y2={4000} stroke="#e0338a" strokeDasharray={`${4 / view.k}`} />}
            {guides.y !== undefined && <line x1={-2000} y1={guides.y} x2={4000} y2={guides.y} stroke="#e0338a" strokeDasharray={`${4 / view.k}`} />}
            {ghost?.kind === 'box' && <rect x={ghost.box.x} y={ghost.box.y} width={ghost.box.w} height={ghost.box.h} fill={ghost.dashed ? 'rgba(84,72,214,0.07)' : 'none'} strokeDasharray={ghost.dashed ? `${4 / view.k}` : undefined} />}
            {ghost?.kind === 'line' && <line x1={ghost.a.x} y1={ghost.a.y} x2={ghost.b.x} y2={ghost.b.y} />}
          </g>
          {single?.kind === 'shape' && tool === 'select' && (
            <g fill="#fff" stroke="var(--accent)" strokeWidth={1.5 / view.k}>
              {([['nw', single.el.x - 4, single.el.y - 4], ['ne', single.el.x + single.el.w + 4, single.el.y - 4], ['sw', single.el.x - 4, single.el.y + single.el.h + 4], ['se', single.el.x + single.el.w + 4, single.el.y + single.el.h + 4]] as [string, number, number][])
                .map(([c, x, y]) => <rect key={c} data-handle={c} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} rx={1.5 / view.k} style={{ cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize' }} />)}
            </g>
          )}
          {single?.kind === 'conn' && tool === 'select' && (
            <g fill="#fff" stroke="var(--accent)" strokeWidth={1.5 / view.k}>
              {(['a', 'b'] as const).filter((w) => single.el[w].kind !== 'rel').map((w) => { const p = w === 'a' ? single.el.pts[0] : single.el.pts[single.el.pts.length - 1]; return <circle key={w} data-end={w} cx={p.x} cy={p.y} r={hs * 0.65} style={{ cursor: 'crosshair' }} />; })}
            </g>
          )}
        </g>
      </svg>

      {editing && (
        <textarea className="textedit" autoFocus value={editing.value}
          style={{ left: view.x + editing.box.x * view.k, top: view.y + editing.box.y * view.k, width: Math.max(120, editing.box.w * view.k), height: Math.max(28, editing.box.h * view.k), fontSize: Math.max(11, 12 * view.k) }}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onFocus={(e) => e.target.select()}
          onBlur={() => finishEdit(true)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEdit(true); } else if (e.key === 'Escape') finishEdit(false); e.stopPropagation(); }} />
      )}

      <div className="topleft" onPointerDown={(e) => e.stopPropagation()}>
        <button className="iconbtn island" title="Menu" aria-label="Menu" aria-expanded={menuOpen} onClick={() => { setMenuOpen((o) => !o); setGalleryOpen(false); setCtx(null); }}><Menu size={18} /></button>
        {menuOpen && (
          <div className="dropdown island" role="menu">
            {files.hasFileAccess && <button role="menuitem" onClick={() => { closePopups(); openFolder(); }}><FolderOpen size={16} />Open folder</button>}
            <button role="menuitem" onClick={() => { closePopups(); openFile(); }}><FileText size={16} />Open file</button>
            <button role="menuitem" onClick={() => { closePopups(); setPasteOpen(true); }}><ClipboardPaste size={16} />Paste diagram text</button>
            <hr />
            <button role="menuitem" onClick={() => { closePopups(); exportAs('png'); }}><ImageDown size={16} />Export as PNG</button>
            <button role="menuitem" onClick={() => { closePopups(); exportAs('svg'); }}><FileCode size={16} />Export as SVG</button>
            <button role="menuitem" onClick={() => { closePopups(); files.download(baseName + '.fdraw', src); }}><Download size={16} />Download diagram file</button>
            <hr />
            <div className="canvassize">
              <span>Canvas size</span>
              <TextField label="Width" value={String(scene.w)} onCommit={(v) => +v > 0 && act.setCanvas(+v, scene.h)} />
              <TextField label="Height" value={String(scene.h)} onCommit={(v) => +v > 0 && act.setCanvas(scene.w, +v)} />
            </div>
          </div>
        )}
        <Panel sc={scene} src={cur} sel={sel} act={act} />
      </div>

      <div className="topcenter" onPointerDown={(e) => e.stopPropagation()}>
        <div className="toolbar island" role="toolbar" aria-label="Tools">
          <button className={'tool' + (locked ? ' on' : '')} title="Keep the chosen tool active after drawing" aria-label="Keep tool active" aria-pressed={locked} onClick={() => setLocked((l) => !l)}>{locked ? <Lock size={17} /> : <LockOpen size={17} />}</button>
          <span className="sep" />
          {TOOLS.map(([id, label, key]) => (
            <button key={id} className={'tool' + (tool === id ? ' on' : '')} title={`${label} — ${key}`} aria-label={label} aria-pressed={tool === id} onClick={() => { setTool(id); setGalleryOpen(false); }}>
              {ICONS[id]}<kbd>{key}</kbd>
            </button>
          ))}
          <span className="sep" />
          <button className={'tool wide' + (armed || galleryOpen ? ' on' : '')} title="Styles from this diagram's look" aria-expanded={galleryOpen} onClick={() => { setGalleryOpen((o) => !o); setMenuOpen(false); setCtx(null); }}>
            <Shapes size={17} /><span>{armed ? tool.replace(/^(style|conn):/, '') : 'Look styles'}</span>
          </button>
        </div>
        {galleryOpen && <div className="island gallerywrap"><Gallery look={scene.look} current={tool} onPick={(t) => { setTool(t); setGalleryOpen(false); }} /></div>}
        {armed && !galleryOpen && <div className="hintbar">{tool.startsWith('conn:') ? 'Drag from one element to another to connect them' : 'Click or drag on the canvas to place it'} · Esc to cancel</div>}
        {missingLook && (
          <div className="banner">
            This diagram uses the look “{lookPath(cur)}”, which is not loaded, so it is drawn with plain styles.
            <button onClick={chooseLook}>Choose look file</button>
          </div>
        )}
      </div>

      <div className="topright" onPointerDown={(e) => e.stopPropagation()}>
        <div className="island filechip">
          {folderFiles.length > 1
            ? <select aria-label="Diagram" value={io.current.path} onChange={(e) => io.current.folder && openPath(io.current.folder, e.target.value)}>{folderFiles.map((f) => <option key={f}>{f}</option>)}</select>
            : <b title={name}>{name}</b>}
          <span className={'dot ' + saveState} />
          <span className="status">{status}</span>
        </div>
        <button className={'island problems' + (issues.length ? ' has' : '')} onClick={() => setShowIssues((s) => !s)} aria-expanded={showIssues}
          title={issues.length ? 'Show what the checker found' : 'The checker found no problems'}>
          {issues.length ? <TriangleAlert size={15} /> : <Check size={15} />}
          {issues.length ? `${issues.length} problem${issues.length > 1 ? 's' : ''}` : 'No problems'}
        </button>
        {showIssues && issues.length > 0 && (
          <ul className="island issuelist">
            {issues.map((i, n) => (
              <li key={n} className={i.level} onClick={() => { const hit = [...scene.shapes, ...scene.texts, ...scene.conns].find((x) => x.line === i.line); if (hit) setSel([hit.id]); }}>
                {i.msg}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bottomleft" onPointerDown={(e) => e.stopPropagation()}>
        <div className="island group">
          <button className="iconbtn" title="Zoom out" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}><Minus size={16} /></button>
          <button className="pct" title="Reset zoom" onClick={() => zoomBy(1 / view.k)}>{Math.round(view.k * 100)}%</button>
          <button className="iconbtn" title="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(1.2)}><Plus size={16} /></button>
        </div>
        <div className="island group">
          <button className="iconbtn" title="Undo — Ctrl+Z" aria-label="Undo" disabled={!hist.current.past.length} onClick={() => undo(false)}><Undo2 size={16} /></button>
          <button className="iconbtn" title="Redo — Ctrl+Shift+Z" aria-label="Redo" disabled={!hist.current.future.length} onClick={() => undo(true)}><Redo2 size={16} /></button>
        </div>
      </div>

      {ctx && (
        <div className="island dropdown ctx" style={{ left: ctx.x, top: ctx.y }} role="menu" onPointerDown={(e) => e.stopPropagation()}>
          {sel.length === 1 && <button role="menuitem" onClick={() => { setCtx(null); startEdit(sel[0]); }}><Pencil size={15} />Edit text<kbd>Enter</kbd></button>}
          <button role="menuitem" onClick={() => { setCtx(null); act.duplicate(); }}><Copy size={15} />Duplicate<kbd>Ctrl+D</kbd></button>
          <hr />
          <button role="menuitem" onClick={() => { setCtx(null); act.reorder('front'); }}><BringToFront size={15} />Bring to front</button>
          <button role="menuitem" onClick={() => { setCtx(null); act.reorder('back'); }}><SendToBack size={15} />Send to back</button>
          <hr />
          <button role="menuitem" className="danger" onClick={() => { setCtx(null); act.remove(); }}><Trash2 size={15} />Delete<kbd>Del</kbd></button>
        </div>
      )}

      {pasteOpen && <PasteDialog onClose={() => setPasteOpen(false)} onLoad={(t) => { setPasteOpen(false); io.current = { fileMod: 0, lookMod: 0, written: '' }; setFolderFiles([]); load(t, lookSrc ?? demoLook, 'pasted diagram'); }} />}
    </div>
  );
}

function PasteDialog({ onClose, onLoad }: { onClose: () => void; onLoad: (text: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card">
        <h3>Paste diagram text</h3>
        <p className="muted">Paste what an assistant wrote. It opens in memory with the built-in reference look; use Download to keep it.</p>
        <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={'a: node "Orders API" at 80,80\nb: store "Orders DB" at 320,80\na -> b "writes"'} />
        <div className="startbtns">
          <button className="primary" disabled={!v.trim()} onClick={() => onLoad(v)}>Open</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
