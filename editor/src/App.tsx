import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseLook, color, isBundledLook } from '../../src/look.ts';
import { buildScene, lookPath, captionBox, textWidth as measure } from '../../src/scene.ts';
import type { Scene, Pt, Box, Conn, Shape } from '../../src/scene.ts';
import type { RowSpec } from '../../src/edit.ts';
import { check } from '../../src/check.ts';
import { renderBody, col } from '../../src/render.ts';
import * as ops from './ops.ts';
import * as files from './files.ts';
import * as ws from './workspace.ts';
import * as served from './served.ts';
import { Panel, TextField, Swatches } from './Panel.tsx';
import { ColorPicker } from './ColorPicker.tsx';
import { Gallery } from './Gallery.tsx';
import { Sidebar, useSidebar } from './Sidebar.tsx';
import { LookPicker, lookLabel } from './LookPicker.tsx';
import type { LookChoice, FileLook } from './LookPicker.tsx';
import { TemplateDialog } from './Templates.tsx';
import { TEMPLATES } from './templates.ts';
import {
  ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Check, FilePlus, LayoutTemplate, Circle, ClipboardPaste, Copy, Diamond, Download, FileText, FolderOpen, Hand, X, ImageDown, Lock, LockOpen,
  Group, ListTree, Menu, Minus, MousePointer2, MoveUpRight, Pencil, Plus, Redo2, Smile, Square, Trash2, TriangleAlert, Type, Undo2, Ungroup,
} from 'lucide-react';
import { IconDialog, IconGlyph } from './IconPicker.tsx';
import { rememberIcon } from './recentIcons.ts';
import type { IconStyle } from '../../src/iconStyle.ts';
import demoArch from '../../examples/test/architecture.fdraw?raw';
import demoFlow from '../../examples/test/flowchart.fdraw?raw';
import demoSeq from '../../examples/test/sequence.fdraw?raw';
import demoLook from '../../looks/reference.look?raw';
import { setLookFonts, BUNDLED_FAMILIES } from './fonts.ts';
import { extractSvg, extractPng } from '../../src/embed.ts';
import { ExportDialog } from './ExportDialog.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';
import { withIconImages, usedIconImages, MAX_ICON_BYTES, MAX_ICON_FILES } from '../../src/iconfiles.ts';
import { useExtendedIcons } from './useExtendedIcons.ts';
import { ICONS as BUILT_IN_ICONS } from '../../src/icons.ts';
import { decodeShared, sharedInHash } from './embed/share.ts';

type Drag =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { type: 'move'; start: Pt; ids: string[]; base: string; scene: Scene; moved: boolean }
  | { type: 'resize'; id: string; corner: string; base: string; scene: Scene; dx: number; dy: number }
  | { type: 'marquee'; start: Pt; add: boolean }
  | { type: 'draw'; style: string; start: Pt; base: string }
  | { type: 'free'; pts: Pt[] }
  | { type: 'conn'; op: string; from: string; start: Pt; style?: string }
  | { type: 'end'; id: string; which: 'a' | 'b'; base: string; scene: Scene }
  | { type: 'seg'; id: string; index: number; base: string; scene: Scene }
  | { type: 'vertex'; id: string; index: number; base: string; scene: Scene }
  | { type: 'label'; id: string; base: string; scene: Scene; dx: number; dy: number };
type Ghost = { kind: 'box'; box: Box; dashed?: boolean } | { kind: 'line'; a: Pt; b: Pt } | null;
// entry: on a legend, the key of the one entry being edited (a style name, swatch.colour, ...) or 'title'
type Editing = { id: string; value: string; box: Box; entry?: string } | null;
type EdLook = { family: string; size: number; weight: string; style: string; color: string; spacing: string; transform: string; anchor: string; ax: number; top: number; pitch: number; wrap: number };
// pending: handles kept from before a reload, used once the browser lets the page write them again
type Io = { file?: files.Handle; look?: files.Handle; fileMod: number; lookMod: number; written: string; folder?: files.Folder; path?: string; pending?: { file: files.Handle; look?: files.Handle } };
type History = { past: string[]; future: string[] };
// One open diagram. The active one lives in the component's state; the others wait in `docs`.
type Doc = { id: string; name: string; src: string; lookSrc: string | null; carried: Record<string, string>; view: ws.View; io: Io; hist: History; folderFiles: string[] };
const IN_BROWSER = 'saved in this browser';

const snap = (v: number) => Math.round(v / 4) * 4;
// an open outline is a line, not an area: it is picked by its stroke and nothing attaches to its box
const isStroke = (s: Shape) => !!s.poly && s.p.open === '1';
const polyPoints = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

let measurer: CanvasRenderingContext2D | null = null;
const textWidth = (s: string, font: string) => {
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) return s.length * 8;
  measurer.font = font;
  return measurer.measureText(s).width;
};
// Where and how the in-place text field sits: over the drawn label, in its type.
function inplaceStyle(l: EdLook, value: string, view: { x: number; y: number; k: number }): React.CSSProperties {
  const k = view.k, size = l.size * k, font = `${l.style} ${l.weight} ${size}px ${l.family}`;
  const caps = l.transform === 'uppercase';
  const longest = Math.max(...value.split('\n').map((s) => textWidth(caps ? s.toUpperCase() : s, font)));
  const w = l.wrap ? l.wrap * k : longest + 3; // the diagram redraws as you type, so only the caret needs room
  const left = l.anchor === 'middle' ? l.ax * k - w / 2 : l.anchor === 'end' ? l.ax * k - w : l.ax * k;
  return {
    left: view.x + left, top: view.y + l.top * k, width: w,
    font, lineHeight: `${l.pitch * k}px`, color: l.color, letterSpacing: l.spacing, textTransform: l.transform as React.CSSProperties['textTransform'],
    textAlign: l.anchor === 'middle' ? 'center' : l.anchor === 'end' ? 'right' : 'left',
  };
}
const BLANK = '\n';
const DEMOS: [string, string][] = [['Architecture', demoArch], ['Flowchart', demoFlow], ['Sequence', demoSeq]];
const ICONS: Record<string, React.ReactNode> = {
  hand: <Hand size={17} />, select: <MousePointer2 size={17} />, rect: <Square size={17} />, ellipse: <Circle size={17} />, diamond: <Diamond size={17} />,
  arrow: <MoveUpRight size={17} />, line: <Minus size={17} />, freehand: <Pencil size={17} />, text: <Type size={17} />,
};
const TOOLS: [string, string, string][] = [
  ['hand', 'Hand (pan)', 'H'], ['select', 'Select', 'V'], ['rect', 'Rectangle', 'R'], ['ellipse', 'Ellipse', 'O'], ['diamond', 'Diamond', 'D'],
  ['arrow', 'Arrow', 'A'], ['line', 'Line', 'L'], ['freehand', 'Draw', 'P'], ['text', 'Text', 'T'],
];

// Background colours offered besides the look's own: plain white and a few light, cool tints.
const PAPERS = ['#ffffff', '#f4f5f7', '#eef2f7', '#edf6f0', '#f3effa'];

// The page's colour and dot grid. Choices are written to the diagram's canvas line (paper=, dots=),
// so they override the look for this diagram only; picking the look's own colour drops the override.
function BackgroundMenu({ scene, set }: { scene: Scene; set: (bg: Record<string, string | null>) => void }) {
  const base = scene.baseCanvas ?? {}, cv = scene.look.canvas;
  const basePaper = base.paper ?? 'paper', paper = cv.paper ?? 'paper';
  const dotsOn = !!cv.dots && cv.dots !== 'none';
  const overridden = ['paper', 'dots', 'dotgap'].some((k) => cv[k] !== base[k]);
  const hex = color(scene.look, paper);
  return (
    <div className="canvasbg">
      <span>Background</span>
      <div className="row">
        <Swatches sc={scene} values={[basePaper, ...PAPERS.filter((p) => p !== color(scene.look, basePaper))]} current={paper}
          onPick={(v) => set({ paper: v === basePaper ? null : v })} />
        <ColorPicker className="custom" label="Custom background colour" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffffff'} onPick={(v) => set({ paper: v })} />
      </div>
      <label className="check">
        <input type="checkbox" checked={dotsOn} onChange={() => set({ dots: dotsOn ? 'none' : base.dots && base.dots !== 'none' ? null : 'ink/0.1' })} />
        Dot grid
      </label>
      {overridden && <button className="link" onClick={() => set({ paper: null, dots: null, dotgap: null })}>Use the look's background</button>}
    </div>
  );
}

export function App() {
  const [src, setSrcState] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [lookSrc, setLookSrc] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [tool, setTool] = useState('select');
  const [view, setView] = useState({ x: 60, y: 90, k: 1 });
  const [ghost, setGhost] = useState<Ghost>(null);
  const [ink, setInk] = useState<Pt[] | null>(null); // the stroke being drawn by hand
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [editing, setEditing] = useState<Editing>(null);
  const [edLook, setEdLook] = useState<EdLook | null>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const edRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState('');
  const [showIssues, setShowIssues] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // The Icon tool in the top bar: its dialog picks the icon, then each click on the canvas places that icon.
  const [iconToolOpen, setIconToolOpen] = useState(false);
  // the icon the tool places: none until one is picked (then it places `server`); the button shows it once there is one
  const [pickedIcon, setPickedIcon] = useState<{ name: string; style: IconStyle } | null>(null);
  const iconToPlace = useRef<{ name: string; style: IconStyle }>({ name: 'server', style: 'outline' });
  iconToPlace.current = pickedIcon ?? { name: 'server', style: 'outline' };
  const [folderFiles, setFolderFiles] = useState<string[]>([]);
  const [, force] = useState(0);
  const [locked, setLocked] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // the right sidebar (components, looks), and the look being tried on the canvas (undefined: none, null: the built-in look)
  const side = useSidebar();
  const lookOpen = !side.collapsed && side.tab === 'look';
  const sideOpenRef = useRef(side.pinned); sideOpenRef.current = side.pinned;
  const sideRef = useRef(side); sideRef.current = side;
  const pickerFile = useRef<FileLook>(null);
  const [lookPreview, setLookPreview] = useState<LookChoice | undefined>(undefined);
  const lockedRef = useRef(false); lockedRef.current = locked;
  const doneDrawing = () => { if (!lockedRef.current) setTool('select'); };

  const [docId, setDocId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const docs = useRef(new Map<string, Doc>());
  const hist = useRef<History>({ past: [], future: [] });
  const io = useRef<Io>({ fileMod: 0, lookMod: 0, written: '' });
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const srcRef = useRef<string | null>(null);
  const space = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const clip = useRef<string[]>([]);
  const lastClick = useRef<{ id: string; t: number }>({ id: '', t: 0 });
  const pendingEdit = useRef<{ id: string; p: Pt } | null>(null);
  srcRef.current = src;
  // read by the browser tests
  useEffect(() => { (window as unknown as { __fastdraw: unknown }).__fastdraw = { source: () => srcRef.current }; }, []);

  // a look read from a file counts only while the diagram's look line is a path to one; a bundled
  // name (look sketch) or no line at all is drawn without it
  const lookLine = lookPath(src ?? '');
  const fileLookOn = !!lookLine && !isBundledLook(lookLine);
  // The rest of Phosphor's icons are fetched when a diagram uses one (or the icon dialog opens); looks and the
  // scene are built again when they arrive.
  const iconsReady = useExtendedIcons(useMemo(() => [...(src ?? '').matchAll(/\bicon="?([\w-]+)/g)].some((m) => !BUILT_IN_ICONS[m[1]!]), [src]));
  const parsedLook = useMemo(() => (lookSrc != null && fileLookOn ? parseLook(lookSrc) : null), [lookSrc, fileLookOn, iconsReady]);
  // Icon files: read from the look's icon folders when a folder is open, or carried inside an opened image.
  const [iconFiles, setIconFiles] = useState<{ name: string; bytes: Uint8Array }[]>([]);
  const [carriedIcons, setCarriedIcons] = useState<Record<string, string>>({});
  const [iconNote, setIconNote] = useState('');
  // the active diagram as it stands now, kept current on every render
  const live = useRef<Doc | null>(null);
  live.current = docId && src !== null ? { id: docId, name, src: srcRef.current ?? src, lookSrc, carried: carriedIcons, view, io: io.current, hist: hist.current, folderFiles } : null;
  const look = useMemo(() => (parsedLook && (iconFiles.length || Object.keys(carriedIcons).length) ? withIconImages(parsedLook, iconFiles, carriedIcons) : parsedLook), [parsedLook, iconFiles, carriedIcons]);
  useEffect(() => {
    let stale = false;
    (async () => {
      const s = io.current, dirs = parsedLook?.iconDirs ?? [];
      const lp = srcRef.current ? lookPath(srcRef.current) : undefined;
      const base = s.path && lp ? files.dirOf(files.dirOf(s.path) + lp) : '';
      const found = s.folder && lp ? (await Promise.all(dirs.map((d) => files.readFontDir(s.folder!.root, base + d, /\.svg$/i, MAX_ICON_BYTES, MAX_ICON_FILES)))).flat() : [];
      if (stale) return;
      setIconFiles(found);
      setIconNote(!dirs.length || found.length || Object.keys(carriedIcons).length ? '' : s.folder
        ? `No SVG files found in the look's icon folder (${dirs.join(', ')}).`
        : `This look brings its own icons from a folder (${dirs.join(', ')}). Open the folder that holds the diagram so they can be loaded.`);
    })();
    return () => { stale = true; };
  }, [parsedLook, name, carriedIcons, docId]);
  // Load the fonts the look brings (possible when a folder is open), and say so when it can't be done.
  const [fontNote, setFontNote] = useState('');
  useEffect(() => {
    let stale = false;
    (async () => {
      const s = io.current;
      const dirs = look?.fontDirs ?? [];
      const lp = srcRef.current ? lookPath(srcRef.current) : undefined;
      const base = s.path && lp ? files.dirOf(files.dirOf(s.path) + lp) : '';
      const found = s.folder && lp ? (await Promise.all(dirs.map((d) => files.readFontDir(s.folder!.root, base + d)))).flat() : [];
      if (stale) return;
      const have = [...BUNDLED_FAMILIES, ...setLookFonts(found)].map((f) => f.toLowerCase());
      const missing = look ? [...new Set(look.fonts.values())].filter((f) => !have.includes(f.toLowerCase()) && !['helvetica', 'serif', 'monospace', 'sans-serif'].includes(f.toLowerCase())) : [];
      setFontNote(!missing.length ? '' : s.folder
        ? `No font file found for ${missing.join(', ')}; text is drawn in a fallback font.`
        : `This look uses ${missing.join(', ')}. Open the folder that holds the diagram so its fonts can be loaded; for now text is drawn in a fallback font.`);
    })();
    return () => { stale = true; };
  }, [look, name, docId]);
  const cur = draft ?? src ?? '';
  const scene = useMemo(() => buildScene(cur, look), [cur, look, iconsReady]);
  // what the canvas draws: the diagram, or while a look is being tried, the diagram in that look.
  // Editing always works on the real diagram; only the picture changes.
  const shown = useMemo(() => {
    if (lookPreview === undefined) return scene;
    const p = lookPreview;
    const fl = pickerFile.current && p === pickerFile.current.path ? pickerFile.current.look : look;
    return buildScene(ops.setLook(cur, p), p !== null && !isBundledLook(p) ? fl : null);
  }, [scene, lookPreview, cur, look, iconsReady]);
  const issues = useMemo(() => check(scene).filter((i) => i.level !== 'hint'), [scene]);
  // the page layers are left out: the paper and dots fill the whole view instead
  const body = useMemo(() => renderBody(shown).split('\n').filter((l) => !l.startsWith('<rect class="fd-page"')).join('\n'), [shown]);

  // ---- saving and history -------------------------------------------------
  const save = useCallback((text: string) => {
    window.clearTimeout(saveTimer.current);
    if (!io.current.file) { setStatus(io.current.pending ? 'not connected to the file' : IN_BROWSER); return; }
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
    next = ops.dropCanvasSize(next); // an edit also clears the page size older files carry
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

  // ---- open diagrams (tabs) -----------------------------------------------
  const statusOf = (s: Io) => (s.file ? 'saved' : s.pending ? 'not connected to the file' : IN_BROWSER);

  // Put a diagram on the canvas. The one there before must already be stashed in `docs`.
  const show = useCallback((d: Doc) => {
    hist.current = d.hist; io.current = d.io; srcRef.current = d.src;
    setDocId(d.id); setSrcState(d.src); setDraft(null); setLookSrc(d.lookSrc); setName(d.name); setCarriedIcons(d.carried);
    setView(d.view); setFolderFiles(d.folderFiles); setSel([]); setEditing(null); setRenaming(null); setStatus(statusOf(d.io));
  }, []);
  const stash = () => { if (live.current) docs.current.set(live.current.id, { ...live.current }); };

  // Open text in a new tab, or in place of the current one (`replace`, or when that is a blank untouched canvas).
  // The caller sets io.current for the new diagram first.
  const load = useCallback((text: string, lookText: string | null, label: string, opt: { replace?: boolean; carried?: Record<string, string> } = {}) => {
    const cur = live.current;
    const reuse = !!cur && (opt.replace || (text !== BLANK && cur.src === BLANK && !cur.hist.past.length && !cur.io.file && !cur.io.pending));
    const sc = buildScene(text, lookText != null ? parseLook(lookText) : null);
    // fit between the left panel and the right sidebar (or its rail when collapsed)
    const vw = window.innerWidth, vh = window.innerHeight, left = 280, right = sideOpenRef.current ? 336 : 72, room = vw - left - right;
    const k = Math.min(1.5, Math.max(0.2, Math.min(room / sc.w, (vh - 140) / sc.h)));
    const taken = new Set([...docs.current.values()].filter((d) => !(reuse && d.id === cur!.id)).map((d) => d.name));
    let unique = label;
    for (let n = 2; taken.has(unique); n++) unique = `${label} ${n}`;
    if (cur && !reuse) stash();
    const d: Doc = {
      id: reuse ? cur!.id : ws.newId(), name: unique, src: text, lookSrc: lookText, carried: opt.carried ?? {}, io: io.current, hist: { past: [], future: [] },
      view: { x: Math.round(left + (room - sc.w * k) / 2 - sc.x * k), y: Math.round((vh - sc.h * k) / 2 + 16 - sc.y * k), k }, folderFiles: io.current.folder?.files ?? [],
    };
    docs.current.set(d.id, d);
    if (!reuse) setTabs((t) => [...t, d.id]);
    show(d);
  }, [show]);

  const switchTo = (id: string) => {
    const d = docs.current.get(id);
    if (id === live.current?.id || !d) return; // (text being edited is finished by the textarea losing focus)
    stash();
    show(d);
  };

  const closeTab = (id: string) => {
    if (id === docId) stash();
    const d = docs.current.get(id);
    if (!d) return;
    const onlyHere = !d.io.file && !d.io.pending && d.src !== BLANK;
    if (onlyHere && !window.confirm(`Close “${d.name}”? It is kept only in this browser, so closing it deletes it. To keep a copy, download it from the menu first.`)) return;
    docs.current.delete(id);
    ws.removeDoc(id);
    const i = tabs.indexOf(id), rest = tabs.filter((t) => t !== id);
    setTabs(rest);
    if (id !== docId) return;
    const next = rest[Math.min(i, rest.length - 1)];
    if (next) { show(docs.current.get(next)!); return; }
    hist.current = { past: [], future: [] }; io.current = { fileMod: 0, lookMod: 0, written: '' }; srcRef.current = null;
    setSrcState(null); setDocId(null); setStatus('');
  };

  const rename = (id: string, value: string) => {
    setRenaming(null);
    const v = value.trim(), d = docs.current.get(id);
    if (!v || !d || v === d.name) return;
    d.name = v;
    if (id === docId) setName(v);
    else ws.putDoc(toStored(d)).catch(() => {});
  };

  // Keep every change in the browser, so a reload brings it back.
  const toStored = (d: Doc): ws.StoredDoc => ({
    id: d.id, name: d.name, src: d.src, look: d.lookSrc, carried: d.carried, view: d.view, past: d.hist.past, future: d.hist.future,
    file: d.io.file ?? d.io.pending?.file, lookFile: d.io.look ?? d.io.pending?.look, folder: d.io.folder, path: d.io.path, written: d.io.written, updated: 0,
  });
  const persist = useCallback(() => {
    const d = live.current;
    if (!d) return;
    docs.current.set(d.id, { ...d });
    ws.putDoc(toStored(d)).catch((e) => setStatus('could not keep a copy in this browser: ' + (e as Error).message));
  }, []);
  useEffect(() => { if (ready) persist(); }, [ready, docId, src, lookSrc, name, carriedIcons, persist]);
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(persist, 400);
    return () => window.clearTimeout(t);
  }, [ready, view, persist]);
  useEffect(() => { if (ready) ws.putTabs(tabs, docId); }, [ready, tabs, docId]);
  const tabsRef = useRef(tabs); tabsRef.current = tabs;
  useEffect(() => {
    // when the page goes away: the last moment's view, and the tab choice in case its own write has not run yet
    const flush = () => { if (!live.current) return; persist(); ws.putTabs(tabsRef.current, live.current.id); };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [persist]);

  // Bring back the diagrams that were open before the reload.
  useEffect(() => {
    (async () => {
      const { docs: kept, active } = await ws.loadAll();
      for (const k of kept) {
        docs.current.set(k.id, {
          id: k.id, name: k.name, src: k.src, lookSrc: k.look, carried: k.carried ?? {}, view: k.view, hist: { past: k.past ?? [], future: k.future ?? [] },
          io: { fileMod: 0, lookMod: 0, written: k.written ?? '', folder: k.folder, path: k.path, pending: k.file ? { file: k.file, look: k.lookFile } : undefined },
          folderFiles: k.folder?.files ?? [],
        });
      }
      if (kept.length) {
        setTabs(kept.map((k) => k.id));
        show(docs.current.get(active && docs.current.has(active) ? active : kept[kept.length - 1].id)!);
      }
      setReady(true);
    })();
  }, [show]);

  // A diagram kept from before the reload that belongs to a file: write to the file again once allowed.
  // Whichever side changed since the last save wins, and the other stays one undo away.
  const reconnect = useCallback(async (ask: boolean) => {
    const s = io.current, p = s.pending;
    if (!p) return;
    const ok = ask ? await files.askAccess(s.folder?.root ?? p.file) : await files.hasAccess(s.folder?.root ?? p.file);
    if (s !== io.current) return; // another tab was opened meanwhile
    if (!ok) { setStatus('not connected to the file'); return; }
    if (ask && !s.folder && p.look) await files.askAccess(p.look);
    try {
      const { text, modified } = await files.readHandle(p.file);
      if (s !== io.current) return;
      s.pending = undefined; s.file = p.file; s.look = p.look; s.fileMod = modified;
      const mine = srcRef.current ?? '';
      if (text === mine) { s.written = text; setStatus('saved'); }
      else if (text === s.written) save(mine); // only this copy changed: the reload came before the write finished
      else {
        hist.current.past.push(mine); hist.current.future = [];
        s.written = text; srcRef.current = text; setSrcState(text); setDraft(null);
        setStatus('updated from disk');
      }
      if (s.look) { try { const r = await files.readHandle(s.look); s.lookMod = r.modified; setLookSrc(r.text); } catch { s.look = undefined; } }
    } catch {
      if (s !== io.current) return;
      s.pending = undefined;
      setStatus(`${p.file.name} could not be read, so this copy is ${IN_BROWSER}`);
      persist();
    }
  }, [save, persist]);
  useEffect(() => { if (ready && io.current.pending) reconnect(false); }, [ready, docId, reconnect]);

  // ---- opening ------------------------------------------------------------
  const openPath = useCallback(async (folder: files.Folder, path: string, replace = false) => {
    const h = await files.resolveIn(folder.root, path);
    if (!h) return;
    const { text, modified } = await files.readHandle(h);
    const lp = lookPath(text);
    const lh = lp && lp.toLowerCase().endsWith('.look') ? await files.resolveIn(folder.root, files.dirOf(path) + lp) : null;
    const lr = lh ? await files.readHandle(lh) : null;
    io.current = { file: h, look: lh ?? undefined, fileMod: modified, lookMod: lr?.modified ?? 0, written: text, folder, path };
    load(text, lr?.text ?? null, path, { replace });
  }, [load]);

  const openFolder = useCallback(async () => {
    try {
      const opfs = new URLSearchParams(location.search).has('opfs');
      const folder = opfs ? await files.scanFolder(await navigator.storage.getDirectory()) : await files.pickFolder();
      io.current = { fileMod: 0, lookMod: 0, written: '', folder };
      if (folder.files.length) await openPath(folder, folder.files[0]);
      else setStatus('no .fdraw files in that folder');
    } catch { /* picker cancelled */ }
  }, [openPath]);

  // Opened by `fastdraw open` on this computer: the folder it lends, at the diagram it names.
  // The link is taken out of the address bar so a reload does not open a second tab of it.
  const servedOnce = useRef(false);
  useEffect(() => {
    if (!ready || servedOnce.current) return;
    servedOnce.current = true;
    const link = served.servedLink(location.search);
    if (!link) return;
    history.replaceState(null, '', location.pathname + location.hash);
    (async () => {
      try {
        const folder = await files.scanFolder(await served.openServed(link.base));
        const path = folder.files.includes(link.open) ? link.open : folder.files[0];
        if (!path) { setStatus('no .fdraw files in that folder'); return; }
        io.current = { fileMod: 0, lookMod: 0, written: '', folder };
        await openPath(folder, path);
      } catch {
        setStatus('could not reach `fastdraw open` on this computer; run it again');
      }
    })();
  }, [ready, openPath]);

  const openFile = useCallback(async () => {
    try {
      if (!files.hasFileAccess) {
        const picked = await files.pickUpload('.fdraw,.look,.png,.svg', true);
        const d = picked.find((f) => !f.name.endsWith('.look')), l = picked.find((f) => f.name.endsWith('.look'));
        if (d && (await openBlob(d)) && l) setLookSrc(await l.text());
        return;
      }
      const h = await files.pickFile('diagram');
      if (/\.(png|svg)$/i.test(h.name)) { await openBlob(await h.getFile()); return; }
      for (const d of [...docs.current.values()]) if (await files.sameFile(d.io.file ?? d.io.pending?.file, h)) { switchTo(d.id); return; }
      await files.ensureWritable(h);
      const { text, modified } = await files.readHandle(h);
      io.current = { file: h, fileMod: modified, lookMod: 0, written: text };
      load(text, null, h.name);
    } catch { /* picker cancelled */ }
  }, [load]);

  // Open a dropped or uploaded file in memory: a diagram, a look, or an exported image carrying its source.
  const openBlob = useCallback(async (f: File): Promise<boolean> => {
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.look')) { setLookSrc(await f.text()); return true; }
    let diagram: string | null = null, lookText: string | null | undefined, carried: Record<string, string> = {};
    if (lower.endsWith('.png')) { const p = extractPng(new Uint8Array(await f.arrayBuffer())); if (p) { diagram = p.diagram; lookText = p.look; carried = p.icons ?? {}; } }
    else if (lower.endsWith('.svg')) { const p = extractSvg(await f.text()); if (p) { diagram = p.diagram; lookText = p.look; carried = p.icons ?? {}; } }
    else diagram = await f.text();
    if (diagram === null) { setStatus(`${f.name} was not exported from FastDraw, so it has no diagram inside`); return false; }
    io.current = { fileMod: 0, lookMod: 0, written: '' };
    // the carried icons are checked again, name by name, before use
    load(diagram, lookText ?? null, f.name.replace(/\.(png|svg)$/i, '.fdraw'), { carried: carried && typeof carried === 'object' ? carried : {} });
    return true;
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

  // A blank canvas in the built-in look, in a new tab, kept in this browser.
  // A template is a finished example in the built-in look, opened the same way.
  const newDiagram = (text = BLANK, label = 'untitled') => {
    io.current = { fileMod: 0, lookMod: 0, written: '' };
    setTemplatesOpen(false);
    load(text, null, label);
  };
  const templateDialog = templatesOpen && <TemplateDialog onClose={() => setTemplatesOpen(false)} onPick={(t) => newDiagram(t.text, t.kind)} />;

  // `?kind=swimlane`, from the examples on the website: open that kind's template as a new diagram.
  const kindOnce = useRef(false);
  useEffect(() => {
    if (!ready || kindOnce.current) return;
    kindOnce.current = true;
    const q = new URLSearchParams(location.search), kind = q.get('kind');
    // `?from=site`: the diagram that was open in the small editor on the home page, handed over in this tab
    if (q.get('from') === 'site') {
      history.replaceState(null, '', location.pathname + location.hash);
      try {
        const o = JSON.parse(sessionStorage.getItem('fastdraw-from-site') ?? 'null');
        sessionStorage.removeItem('fastdraw-from-site');
        if (o && typeof o.text === 'string') newDiagram(o.text, typeof o.name === 'string' ? o.name.replace(/\.fdraw$/, '') : 'diagram');
      } catch { /* nothing was handed over: the editor opens as usual */ }
      return;
    }
    if (!kind) return;
    history.replaceState(null, '', location.pathname + location.hash);
    const t = TEMPLATES.find((x) => x.kind === kind);
    if (t) newDiagram(t.text, t.kind);
  });

  // `#fdraw=...`, from "Open in FastDraw" on a diagram embedded in another site: that diagram (and its look
  // file, when it has its own) as a new diagram kept in this browser. The hash is cleared so a reload does not
  // open it twice.
  const sharedOnce = useRef(false);
  useEffect(() => {
    if (!ready || sharedOnce.current) return;
    sharedOnce.current = true;
    const data = sharedInHash(location.hash);
    if (data === null) return;
    history.replaceState(null, '', location.pathname + location.search);
    decodeShared(data).then((d) => {
      if (!d) { setStatus('the link to this diagram is incomplete, so it could not be opened'); return; }
      io.current = { fileMod: 0, lookMod: 0, written: '' };
      load(d.text, d.look?.text ?? null, d.name.replace(/\.fdraw$/i, '') || 'diagram');
    });
  }, [ready, load]);

  const openDemo = (text: string, label: string) => {
    io.current = { fileMod: 0, lookMod: 0, written: '' };
    load(text, demoLook, label + ' (example)');
  };

  // dropping a file anywhere on the page opens it
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const drop = (e: DragEvent) => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); openBlob(f); } };
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [openBlob]);

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
    [...sc.shapes].reverse().find((s) => !s.back && !isStroke(s) && p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h);
  // What a connector end dropped at p should attach to: a shape, a point on a straight line, or a free point.
  const attachAt = (sc: Scene, p: Pt, not?: string): string => {
    const s = shapeAt(sc, p);
    if (s) {
      // on a table, a row that has an id takes the arrow; anywhere else the whole table does
      const row = s.rows?.find((r) => r.id && p.y >= r.y && p.y <= r.y + r.h);
      return row ? `${s.id}.${row.id}` : s.id;
    }
    for (const c of sc.conns) {
      if (c.id === not || c.pts.length !== 2 || c.head || c.id.startsWith('_')) continue;
      const [a, b] = c.pts;
      if (a.x === b.x && Math.abs(p.x - a.x) <= 6 && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) return `${c.id}@${snap(p.y)}`;
      if (a.y === b.y && Math.abs(p.y - a.y) <= 6 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)) return `${c.id}@${snap(p.x)}`;
    }
    return `${snap(p.x)},${snap(p.y)}`;
  };

  // the area an edit covers: the element, a line's label (or where a new one would go), a free text
  const editBox = (sc: Scene, id: string, entry?: string): Box | null => {
    const e = ops.find(sc, id);
    if (!e) return null;
    if (entry !== undefined && e.kind === 'shape' && e.el.shape !== 'legend') {
      // a tag sits in the top band; a second line anywhere in the shape, as it moves while the text grows
      const s = e.el;
      return entry === 'tag' ? { x: s.x, y: s.y, w: s.w, h: 24 } : { x: s.x, y: s.y, w: s.w, h: s.h };
    }
    if (entry !== undefined && e.kind === 'shape') {
      const lg = legendParts(e.el).find((x) => x.key === entry);
      return lg ? lg.box : null;
    }
    if (e.kind === 'conn') {
      const l = (e.el as Conn).label;
      const mid = e.el.pts[Math.floor((e.el.pts.length - 1) / 2)], nx = e.el.pts[Math.floor((e.el.pts.length - 1) / 2) + 1];
      return l ? { x: l.x - 20, y: l.y - 6, w: l.w + 40, h: Math.max(24, l.h + 12) } : { x: (mid.x + nx.x) / 2 - 70, y: (mid.y + nx.y) / 2 - 26, w: 140, h: 24 };
    }
    const box = ops.boxOf(e);
    if (e.kind === 'shape' && e.el.shape === 'icon') {
      // an icon's text is its caption, edited where it is drawn
      const c = captionBox(e.el), w = Math.max((c?.w ?? 0) + 40, 140), cx = box.x + box.w / 2;
      return { x: cx - w / 2, y: box.y + box.h + 2, w, h: Math.max(24, (c?.h ?? 0) + 10) };
    }
    return e.kind === 'text' ? { x: box.x - 4, y: box.y - 4, w: Math.max(box.w + 40, 160), h: box.h + 10 } : box;
  };
  // A legend's editable texts: its heading and each entry's label, with the box each is drawn in.
  const legendParts = (s: Shape): { key: string; value: string; box: Box }[] => {
    const p = s.p, size = Number(p['item.size']) || 8.5, font = p['item.font'] ?? 'sans';
    const out = (s.legend ?? []).map((it) => {
      const w = measure(it.label, size, font, 400, 0);
      return { key: it.style, value: it.label, box: { x: it.x + it.sample + 2, y: it.baseline - size - 4, w: Math.max(w + 8, 48), h: size + 9 } };
    });
    if ((p.title ?? 'none') !== 'none') out.unshift({ key: 'title', value: p.title, box: { x: s.x - 4, y: s.y + 4, w: Math.max(measure(p.title, 8, 'mono', 400, 0.18) + 16, 64), h: 16 } });
    return out;
  };
  const startEdit = (id: string, at?: Pt) => {
    const e = ops.find(scene, id);
    if (!e || src === null) return;
    if (e.kind === 'shape' && e.el.shape === 'legend') {
      // one entry at a time: the one under the pointer, or the nearest to it
      const parts = legendParts(e.el);
      if (!parts.length) return;
      const q = at ?? { x: parts[0].box.x, y: parts[0].box.y };
      const dist = (b: Box) => Math.hypot(Math.max(b.x - q.x, 0, q.x - b.x - b.w), Math.max(b.y - q.y, 0, q.y - b.y - b.h));
      const pick = parts.reduce((a, b) => (dist(b.box) < dist(a.box) ? b : a));
      setEditing({ id, entry: pick.key, value: pick.value, box: pick.box });
      return;
    }
    if (e.kind === 'shape' && at) {
      // a corner tag or a second line under the pointer is edited on its own, as the property it is
      const part = shapePartAt(e.el, at);
      if (part) { setEditing({ id, entry: part, value: e.el.p[part], box: editBox(scene, id, part)! }); return; }
    }
    setEditing({ id, value: ops.rawText(src, e), box: editBox(scene, id)! });
  };
  // Which of a shape's extra texts (its corner tag, its second line) is drawn under the point, if any.
  const shapePartAt = (s: Shape, at: Pt): 'tag' | 'sub' | null => {
    const g = bodyRef.current;
    if (!g || s.shape === 'legend') return null;
    const norm = (v: string) => v.replace(/\s+/g, ' ').trim().toLowerCase();
    const tag = s.p.tag ? norm(s.p.tag) : '', subs = s.p.sub ? s.p.sub.split('\n').map(norm).filter(Boolean) : [];
    if (!tag && !subs.length) return null;
    for (const t of Array.from(g.querySelectorAll('text'))) {
      const bb = t.getBBox();
      if (at.x < bb.x - 3 || at.x > bb.x + bb.width + 3 || at.y < bb.y - 3 || at.y > bb.y + bb.height + 3) continue;
      if (bb.x < s.x - 2 || bb.x + bb.width > s.x + s.w + 2 || bb.y < s.y - 2 || bb.y + bb.height > s.y + s.h + 2) continue;
      const v = norm(t.textContent ?? '');
      if (tag && v === tag && bb.y < s.y + 24) return 'tag';
      if (subs.includes(v)) return 'sub';
    }
    return null;
  };
  // the source with the text being edited put in: a legend entry is a property, anything else its text
  const withEdit = (ed: NonNullable<Editing>, value: string, final: boolean): string | null => {
    const e = ops.find(scene, ed.id);
    if (!e || src === null) return null;
    if (ed.entry === undefined) return ops.editText(src, e, value);
    if (ed.entry === 'title') return ops.setProps(src, scene, [ed.id], 'title', value.trim() ? value : 'none');
    return ops.setProps(src, scene, [ed.id], ed.entry, final && !value.trim() ? null : value); // emptied: the entry goes
  };
  // while typing, the diagram is redrawn with the new text, so the element grows around it
  const typeEdit = (value: string) => {
    if (!editing || src === null) return;
    setEditing({ ...editing, value });
    const next = withEdit(editing, value, false);
    if (next !== null) setDraft(next);
  };
  const finishEdit = (ok: boolean) => {
    const ed = editing;
    setEditing(null);
    setDraft(null);
    if (!ed || !ok || src === null) return;
    const e = ops.find(scene, ed.id);
    if (!e) return;
    if (e.kind === 'text' && ed.value.trim() === '') commit(ops.deleteElements(src, scene, [ed.id]), []);
    else { const next = withEdit(ed, ed.value, true); if (next !== null) commit(next); }
  };

  // ---- pointer handling ---------------------------------------------------
  const onDown = (e: React.PointerEvent) => {
    if (src === null) return;
    if (editing) finishEdit(true);
    setMenuOpen(false); setCtx(null);
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
    if (tool === 'freehand') { drag.current = { type: 'free', pts: [p] }; setInk([p]); return; }
    if (tool !== 'select') { drag.current = { type: 'draw', style: tool.replace(/^style:/, ''), start: p, base: src }; return; }
    const handle = t.getAttribute('data-handle'), end = t.getAttribute('data-end');
    if (handle || end || t.hasAttribute('data-seg')) lastClick.current = { id: '', t: 0 }; // a press on a handle never counts towards a double-click
    if (handle && sel.length === 1) {
      // remember where on the handle the press landed, so the corner does not jump to the pointer
      const s0 = ops.find(scene, sel[0]);
      const cx = s0 && s0.kind === 'shape' ? s0.el.x + (handle.includes('w') ? 0 : s0.el.w) : p.x, cy = s0 && s0.kind === 'shape' ? s0.el.y + (handle.includes('n') ? 0 : s0.el.h) : p.y;
      drag.current = { type: 'resize', id: sel[0], corner: handle, base: src, scene, dx: cx - p.x, dy: cy - p.y }; return;
    }
    const vertex = t.getAttribute('data-vertex');
    if (vertex !== null && sel.length === 1) { lastClick.current = { id: '', t: 0 }; drag.current = { type: 'vertex', id: sel[0], index: +vertex, base: src, scene }; return; }
    if (end && sel.length === 1) { drag.current = { type: 'end', id: sel[0], which: end as 'a' | 'b', base: src, scene }; return; }
    const seg = t.getAttribute('data-seg');
    if (seg !== null && sel.length === 1) { drag.current = { type: 'seg', id: sel[0], index: +seg, base: src, scene }; return; }
    const lab = t.getAttribute('data-label');
    const again = (id: string) => lastClick.current.id === id && performance.now() - lastClick.current.t < 450 && !e.shiftKey;
    if (lab && sel.length === 1 && sel[0] === lab && !again(lab)) {
      const c = scene.conns.find((x) => x.id === lab);
      if (c?.label) { drag.current = { type: 'label', id: lab, base: src, scene, dx: c.label.cx - p.x, dy: c.label.baseline - p.y }; return; }
    }
    const id = t.closest('[data-id]')?.getAttribute('data-id');
    if (id) {
      // second press on the same element: edit its text once the button is released
      const now = performance.now();
      if (lastClick.current.id === id && now - lastClick.current.t < 450 && !e.shiftKey) { lastClick.current = { id: '', t: 0 }; pendingEdit.current = { id, p }; setSel([id]); return; }
      lastClick.current = { id, t: now };
      const grp = e.altKey ? [id] : ops.withGroups(scene, [id]);
      let ids = sel;
      if (e.shiftKey) ids = sel.includes(id) ? sel.filter((s) => !grp.includes(s)) : [...new Set([...sel, ...grp])];
      else if (!sel.includes(id)) ids = grp;
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

  // The source with a new shape of `styleName` drawn from `a` to `b`: a drag sets its size, a click uses the style's own.
  // Shared by the live preview and the final drop so what is shown while dragging is what gets placed.
  const placeShape = (base: string, styleName: string, a: Pt, b: Pt) => {
    const style = scene.look.styles.get(styleName);
    if (!style || style.kind === 'text') return null;
    const big = Math.abs(b.x - a.x) > 8 && Math.abs(b.y - a.y) > 8;
    const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(style.props.size ?? '');
    const dw = m ? +m[1] : 120, dh = m ? +m[2] : 64;
    const box = big
      ? { x: snap(Math.min(a.x, b.x)), y: snap(Math.min(a.y, b.y)), w: snap(Math.abs(b.x - a.x)), h: snap(Math.abs(b.y - a.y)) }
      : { x: snap(a.x - dw / 2), y: snap(a.y - dh / 2), w: dw, h: dh };
    const table = style.props.shape === 'table';
    const chart = style.props.shape === 'chart';
    return ops.addShape(base, styleName, (table || chart) && !big ? { ...box, x: snap(a.x - (chart ? 160 : 80)), y: snap(a.y - (chart ? 90 : 40)) } : box, table || chart ? big : big || !m, table, chart, styleName === 'icon' ? iconToPlace.current : undefined);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      const id = tool === 'select' ? (e.target as Element).closest?.('[data-id]')?.getAttribute('data-id') ?? null : null;
      if (id !== hover) setHover(id);
      return;
    }
    const p = world(e);
    if (d.type === 'pan') { setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy })); return; }
    if (d.type === 'free') {
      // every position the pointer reported, not just one per frame, so a fast stroke keeps its shape
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const q of (evs.length ? evs : [e]).map(world)) {
        const last = d.pts[d.pts.length - 1];
        if (Math.hypot(q.x - last.x, q.y - last.y) * view.k >= 1) d.pts.push(q);
      }
      setInk(ops.smoothStroke(d.pts, view.k)); // what is shown while drawing is what will be kept
      return;
    }
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
      const q = e.altKey ? { x: p.x + d.dx, y: p.y + d.dy } : { x: snap(p.x + d.dx), y: snap(p.y + d.dy) };
      // a corner moves both sides, an edge handle only its own side
      const hx = /[we]/.test(d.corner), hy = /[ns]/.test(d.corner);
      if (hx) { if (d.corner.includes('w')) x1 = Math.min(q.x, x2 - 8); else x2 = Math.max(q.x, x1 + 8); }
      if (hy) { if (d.corner.includes('n')) y1 = Math.min(q.y, y2 - 8); else y2 = Math.max(q.y, y1 + 8); }
      if (e.shiftKey && s.w > 0 && s.h > 0) {
        // Shift keeps the shape's proportions: a corner scales from the opposite corner by whichever side
        // moved further, an edge scales the other side to match, keeping the shape centred on that axis
        const ar = s.w / s.h;
        let w = x2 - x1, h = y2 - y1;
        if (hx && hy) { if (w / s.w >= h / s.h) h = w / ar; else w = h * ar; }
        else if (hx) h = w / ar; else w = h * ar;
        if (w < 8) { w = 8; h = w / ar; }
        if (h < 8) { h = 8; w = h * ar; }
        w = Math.round(w); h = Math.round(h);
        if (hx && hy) {
          if (d.corner.includes('w')) x1 = x2 - w; else x2 = x1 + w;
          if (d.corner.includes('n')) y1 = y2 - h; else y2 = y1 + h;
        } else if (hx) { y1 = Math.round(s.y + s.h / 2 - h / 2); y2 = y1 + h; }
        else { x1 = Math.round(s.x + s.w / 2 - w / 2); x2 = x1 + w; }
      }
      setDraft(ops.resizeShape(d.base, s, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }));
      return;
    }
    if (d.type === 'end') {
      const e0 = ops.find(d.scene, d.id);
      if (e0?.kind === 'conn') setDraft(ops.reattach(d.base, e0.el, d.which, attachAt(d.scene, p, d.id)));
      return;
    }
    if (d.type === 'vertex') {
      const e0 = ops.find(d.scene, d.id);
      if (e0?.kind === 'shape') setDraft(ops.movePolyPoint(d.base, e0.el, d.index, e.altKey ? p : { x: snap(p.x), y: snap(p.y) }));
      return;
    }
    if (d.type === 'seg' || d.type === 'label') {
      const e0 = ops.find(d.scene, d.id);
      if (e0?.kind !== 'conn') return;
      setDraft(d.type === 'seg' ? (d.index < 0 ? ops.setBend(d.base, e0.el, p) : ops.dragSegment(d.base, d.scene, e0.el, d.index, p)) : ops.setLabelPos(d.base, e0.el, { x: p.x + d.dx, y: p.y + d.dy }));
      return;
    }
    if (d.type === 'draw') {
      // show the real shape in the look's own drawing while dragging, not just its outline
      const r = placeShape(d.base, d.style, d.start, p);
      if (r) setDraft(r.src);
      else setGhost({ kind: 'box', box: { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) } });
      return;
    }
    if (d.type === 'marquee') {
      const box = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
      setGhost({ kind: 'box', box, dashed: true });
      return;
    }
    if (d.type === 'conn') setGhost({ kind: 'line', a: d.start, b: p });
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGhost(null); setGuides({}); setInk(null);
    if (pendingEdit.current) { const { id, p } = pendingEdit.current; pendingEdit.current = null; startEdit(id, p); return; }
    if (!d || src === null) return;
    const p = world(e);
    if (d.type === 'move' || d.type === 'resize' || d.type === 'end' || d.type === 'seg' || d.type === 'label' || d.type === 'vertex') { if (draft !== null) commit(draft); else setDraft(null); return; }
    if (d.type === 'marquee') {
      const box = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
      if (box.w < 3 && box.h < 3) return;
      const inside = (b: Box) => b.x >= box.x && b.y >= box.y && b.x + b.w <= box.x + box.w && b.y + b.h <= box.y + box.h;
      const hit = [...scene.shapes, ...scene.texts].filter(inside).map((s) => s.id).concat(scene.conns.filter((c) => inside(ops.boxOf({ kind: 'conn', el: c }))).map((c) => c.id));
      setSel(d.add ? [...new Set([...sel, ...hit])] : hit);
      return;
    }
    if (d.type === 'free') {
      // the pen stays in hand, and the stroke is not selected, so the next one can follow straight away
      const r = ops.addFreehand(src, d.pts, view.k);
      if (r) commit(r.src, []);
      return;
    }
    if (d.type === 'draw') {
      const style = scene.look.styles.get(d.style);
      if (!style) return;
      if (style.kind === 'text') {
        const r = ops.addText(src, snap(d.start.x), snap(d.start.y), d.style);
        commit(r.src, [r.id]); doneDrawing();
        window.setTimeout(() => setEditing({ id: r.id, value: 'Text', box: { x: snap(d.start.x) - 4, y: snap(d.start.y) - 18, w: 200, h: 26 } }), 0);
        return;
      }
      const r = placeShape(src, d.style, d.start, p);
      if (!r) { setDraft(null); return; }
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
    setProps: (kv: Record<string, string | null>) => src !== null && commit(ops.setManyProps(src, scene, sel, kv)),
    setStyle: (n: string) => src !== null && commit(ops.setStyle(src, scene, sel, n)),
    setOp: (o: string) => src !== null && commit(ops.setOperator(src, scene, sel, o)),
    reorder: (w: ops.Layering) => src !== null && commit(w === 'front' || w === 'back' ? ops.reorder(src, scene, sel, w) : ops.reorderStep(src, scene, sel, w)),
    align: (m: ops.AlignMode) => src !== null && commit(ops.align(src, scene, sel, m)),
    remove: () => src !== null && sel.length > 0 && commit(ops.deleteElements(src, scene, sel), []),
    duplicate: () => { if (src === null || !sel.length) return; const r = ops.duplicateElements(src, scene, sel); commit(r.src, r.ids); },
    setCanvas: (bg?: Record<string, string | null>) => src !== null && commit(ops.setCanvas(src, scene, bg)),
    group: () => src !== null && sel.length > 1 && commit(ops.groupElements(src, scene, sel)),
    ungroup: () => src !== null && commit(ops.setProps(src, scene, sel, 'group', null)),
    resetRoute: () => src !== null && commit(ops.resetRoute(src, scene, sel)),
    setRoute: (r: string) => src !== null && commit(ops.setRoute(src, scene, sel, r)),
    setRows: (rows: RowSpec[]) => { const e = ops.find(scene, sel[0]); if (src !== null && e?.kind === 'shape') commit(ops.setRows(src, scene, e.el, rows)); },
    legend: () => { if (src === null) return; const r = ops.addLegend(src, scene); if (r) commit(r.src, [r.id]); else setStatus('nothing to list: the diagram uses no components yet'); },
  };
  const actRef = useRef(act); actRef.current = act;
  const stateRef = useRef({ sel, scene, src, editing }); stateRef.current = { sel, scene, src, editing };

  // Edit text in place: find the label as the look drew it, hide it, and lay the text field over
  // it in the same font, size, weight, colour and alignment, so the element keeps its look.
  // It runs again after every redraw while typing, so the field follows the label as it wraps or moves.
  const editKey = editing ? editing.id + '|' + (editing.entry ?? '') + '|' + editing.box.x + ',' + editing.box.y : '';
  const lastEditKey = useRef('');
  useLayoutEffect(() => {
    if (lastEditKey.current !== editKey) setEdLook(null);
    lastEditKey.current = editKey;
    const g = bodyRef.current, ed = stateRef.current.editing;
    if (!g || !ed) return;
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const want = norm(ed.value), b = editBox(stateRef.current.scene, ed.id, ed.entry) ?? ed.box;
    const hits: SVGTextElement[] = [];
    if (want) for (const t of Array.from(g.querySelectorAll('text'))) {
      const s = norm(t.textContent ?? '');
      if (!s || !want.includes(s)) continue;
      const bb = t.getBBox(), cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
      if (cx < b.x - 4 || cx > b.x + b.w + 4 || cy < b.y - 4 || cy > b.y + b.h + 4) continue;
      const cs = getComputedStyle(t), first = hits[0] && getComputedStyle(hits[0]);
      if (first && (cs.fontSize !== first.fontSize || cs.fontWeight !== first.fontWeight || cs.fontFamily !== first.fontFamily)) continue;
      hits.push(t);
    }
    if (!hits.length) return;
    const cs = getComputedStyle(hits[0]), size = parseFloat(cs.fontSize) || 12;
    const boxes = hits.map((t) => t.getBBox());
    const ys = hits.map((t) => parseFloat(t.getAttribute('y') ?? '0'));
    const pitch = hits.length > 1 ? (ys[ys.length - 1] - ys[0]) / (hits.length - 1) : size * 1.3;
    const anchor = (hits[0].getAttribute('text-anchor') ?? cs.textAnchor ?? 'start') as string;
    const ax = parseFloat(hits[0].getAttribute('x') ?? '0');
    const top = boxes[0].y - (pitch - boxes[0].height) / 2;
    const isShape = ed.entry === undefined && ops.find(stateRef.current.scene, ed.id)?.kind === 'shape';
    setEdLook({
      family: cs.fontFamily, size, weight: cs.fontWeight, style: cs.fontStyle, color: cs.fill, spacing: cs.letterSpacing,
      transform: hits.every((t) => { const s = t.textContent ?? ''; return s === s.toUpperCase() && s !== s.toLowerCase(); }) && ed.value !== ed.value.toUpperCase() ? 'uppercase' : cs.textTransform, anchor, ax, top, pitch, wrap: isShape ? b.w - 12 : 0,
    });
    for (const t of hits) t.style.visibility = 'hidden';
    return () => { for (const t of hits) t.style.visibility = ''; };
  }, [editKey, body]);
  // the in-place field grows with its text, a line at a time
  useLayoutEffect(() => {
    const ta = edRef.current;
    if (!ta || !edLook) return;
    ta.style.height = '0px';
    ta.style.height = ta.scrollHeight + 'px';
  }, [editing?.value, edLook, view.k]);

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
      if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); setExportOpen(true); return; }
      if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); if (e.shiftKey) actRef.current.ungroup(); else actRef.current.group(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); actRef.current.duplicate(); return; }
      // Ctrl+] / Ctrl+[ one step forward or backward; with Shift, all the way to the front or back
      if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft') && s.length) {
        e.preventDefault();
        const up = e.code === 'BracketRight';
        actRef.current.reorder(e.shiftKey ? (up ? 'front' : 'back') : (up ? 'forward' : 'backward'));
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel([...sc.shapes, ...sc.texts, ...sc.conns].map((x) => x.id)); return; }
      if (mod && e.key.toLowerCase() === 'c') { clip.current = s; return; }
      if (mod && e.key.toLowerCase() === 'v') { if (clip.current.length) { const r = ops.duplicateElements(text, sc, clip.current.filter((id) => ops.find(sc, id))); commit(r.src, r.ids); } return; }
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actRef.current.remove(); return; }
      if (e.key === 'Escape') { setSel([]); setTool('select'); setMenuOpen(false); setLookPreview(undefined); setCtx(null); sideRef.current.dismiss(); return; }
      if (e.key === 'Enter' && s.length === 1) { e.preventDefault(); startEditRef.current(s[0]); return; }
      if (e.key.startsWith('Arrow') && s.length) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 4;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        commit(ops.moveElements(text, sc, s, dx, dy));
        return;
      }
      if (e.key.toLowerCase() === 'i') { e.preventDefault(); if (sc.look.styles.has('icon')) setIconToolOpen(true); return; }
      const hot = TOOLS.find((t) => t[2].toLowerCase() === e.key.toLowerCase());
      if (hot) setTool(hot[0]);
    };
    const up = (e: KeyboardEvent) => { if (e.key === ' ') { space.current = false; force((n) => n + 1); } };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [commit, undo]);
  const startEditRef = useRef(startEdit); startEditRef.current = startEdit;

  // What an exported image carries so it can be opened and edited again: the diagram, its look, the icons it uses.
  const exportPayload = () => {
    const icons = usedIconImages(scene.look, scene.shapes.map((s) => s.p.icon).filter(Boolean));
    return { v: 1 as const, diagram: cur, look: lookSrc, ...(Object.keys(icons).length ? { icons } : {}) };
  };

  // ---- render -------------------------------------------------------------
  const closePopups = () => { setMenuOpen(false); setLookPreview(undefined); setCtx(null); side.dismiss(); };
  const applyLook = (v: LookChoice) => {
    setLookPreview(undefined);
    if (src === null) return;
    const next = ops.setLook(cur, v);
    if (next !== cur) { commit(next, sel); setStatus(`look: ${lookLabel(v, null)}`); }
  };
  const baseName = (name || 'diagram').replace(/ \(example\)$/, '').replace(/^.*\//, '').replace(/\.fdraw$/, '').replace(/\s+/g, '-');

  if (!ready) return null; // the diagrams kept in the browser are on their way
  if (src === null) {
    return (
      <div className="start">
        <div className="welcome">
          <h1>FastDraw</h1>
          <p className="lede">Open a diagram an agent wrote, change anything on the canvas, and it is saved back to the same file.</p>
          <p className="muted agentnote">FastDraw diagrams usually start with your coding agent. <a href="../#setup">Set up Claude Code, Codex or Copilot</a> with one command, then ask it for a diagram.</p>
          <div className="choices">
            <button className="choice" onClick={() => newDiagram()}><FilePlus size={20} /><span><b>New diagram</b><i>Start from a blank canvas and draw with the toolbar</i></span></button>
            <button className="choice" onClick={() => setTemplatesOpen(true)}><LayoutTemplate size={20} /><span><b>New from a template</b><i>Flowchart, sequence, swimlane, Gantt and 40 more kinds to change</i></span></button>
            {files.hasFileAccess && (
              <button className="choice" onClick={openFolder}><FolderOpen size={20} /><span><b>Open a folder</b><i>Finds the diagrams and their look, saves in place, follows an agent live</i></span></button>
            )}
            <button className="choice" onClick={openFile}><FileText size={20} /><span><b>Open a file</b><i>{files.hasFileAccess ? 'A diagram, or a PNG or SVG exported from FastDraw' : 'A diagram with its look file, or an exported PNG or SVG'}</i></span></button>
            <button className="choice" onClick={() => setPasteOpen(true)}><ClipboardPaste size={20} /><span><b>Paste diagram text</b><i>For text an assistant gave you in a chat</i></span></button>
          </div>
          <p className="muted">Or look at an example: {DEMOS.map(([l, t]) => <button key={l} className="linkbtn" onClick={() => openDemo(t, l)}>{l}</button>)}</p>
          <p className="muted">
            {files.hasFileAccess
              ? 'Files stay on your machine. Nothing is uploaded. Open diagrams are also kept in this browser, so a reload loses nothing.'
              : 'This browser cannot save files in place, so diagrams are kept in this browser and you download the result. Chrome and Edge can save in place. Nothing is uploaded.'}
          </p>
          {status && <p className="muted warn">{status}</p>}
        </div>
        {pasteOpen && <PasteDialog onClose={() => setPasteOpen(false)} onLoad={(t) => { setPasteOpen(false); io.current = { fileMod: 0, lookMod: 0, written: '' }; load(t, null, 'pasted diagram'); }} />}
        {templateDialog}
      </div>
    );
  }

  const missingLook = lookPath(cur) && !isBundledLook(lookPath(cur)) && lookSrc === null;
  const curLook = lookPath(cur) ?? null;
  const fileLook = curLook && !isBundledLook(curLook) && look ? { path: curLook, look } : null;
  // the diagram's own look file stays a choice while the picker is open, even after a click moves off it
  if (!lookOpen) pickerFile.current = null; else if (fileLook && !pickerFile.current) pickerFile.current = fileLook;
  const single = sel.length === 1 ? ops.find(scene, sel[0]) : undefined;
  const hs = 8 / view.k;
  const armed = tool.startsWith('style:') || tool.startsWith('conn:');
  const cursor = space.current || tool === 'hand' ? 'grab' : tool === 'select' ? (hover ? 'move' : 'default') : 'crosshair';
  const hovered = hover && !sel.includes(hover) && tool === 'select' ? ops.find(scene, hover) : undefined;
  const saveState = status.includes('could not') ? 'bad' : status === 'not connected to the file' ? 'mem' : 'ok';
  const tabName = (id: string) => (id === docId ? name : docs.current.get(id)?.name ?? '').replace(/^.*\//, '');

  return (
    <div className="app" onPointerDown={closePopups}>
      <svg ref={svgRef} className="canvas" style={{ cursor, background: col(shown.look, shown.look.canvas.paper ?? 'paper') }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerLeave={() => setHover(null)} onContextMenu={onContext}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {shown.look.canvas.dots && shown.look.canvas.dots !== 'none' && <rect x={-view.x / view.k} y={-view.y / view.k} width={window.innerWidth / view.k} height={window.innerHeight / view.k} fill="url(#fd-dots)" pointerEvents="none" />}
          <g ref={bodyRef} dangerouslySetInnerHTML={{ __html: body }} style={{ pointerEvents: 'none' }} />
          <g fill="transparent" stroke="transparent">
            {scene.shapes.filter((s) => s.back).map((s) => <rect key={s.id} data-id={s.id} x={s.x} y={s.y} width={s.w} height={s.h} fill="none" strokeWidth={10} pointerEvents="stroke" />)}
            {scene.conns.map((c) => <polyline key={c.id} data-id={c.id} points={c.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" strokeWidth={12} pointerEvents="stroke" />)}
            {scene.conns.filter((c) => c.label).map((c) => <rect key={c.id + '-l'} data-id={c.id} data-label={c.id} style={sel.length === 1 && sel[0] === c.id ? { cursor: 'grab' } : undefined} x={c.label!.x} y={c.label!.y} width={c.label!.w} height={c.label!.h} />)}
            {scene.shapes.filter((s) => !s.back).map((s) => isStroke(s)
              ? <polyline key={s.id} data-id={s.id} points={polyPoints(s.poly!)} fill="none" strokeWidth={Math.max(12, +s.p.sw || 0)} strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />
              : <rect key={s.id} data-id={s.id} x={s.x} y={s.y} width={s.w} height={s.h} />)}
            {/* an icon's caption hangs under it and picks the icon */}
            {scene.shapes.map((s) => { const c = captionBox(s); return c && <rect key={s.id + '-cap'} data-id={s.id} x={c.x - 4} y={c.y - 2} width={c.w + 8} height={c.h + 4} />; })}
            {scene.texts.map((t) => <rect key={t.id} data-id={t.id} x={t.x - 2} y={t.y - 2} width={t.w + 4} height={t.h + 4} />)}
          </g>
          <g fill="none" stroke="var(--accent)" strokeWidth={1.5 / view.k} pointerEvents="none">
            {hovered && !editing && (hovered.kind === 'conn'
              ? <polyline points={hovered.el.pts.map((p) => `${p.x},${p.y}`).join(' ')} strokeWidth={4 / view.k} opacity={0.25} />
              : <rect x={ops.boxOf(hovered).x - 2} y={ops.boxOf(hovered).y - 2} width={ops.boxOf(hovered).w + 4} height={ops.boxOf(hovered).h + 4} opacity={0.45} rx={3 / view.k} />)}
            {(editing ? [] : sel).map((id) => {
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
          {ink && (() => {
            const p = scene.look.styles.get('freehand')?.props ?? {};
            return <polyline className="ink" points={polyPoints(ink)} fill="none" stroke={col(scene.look, p.stroke ?? 'ink')} strokeWidth={+p.sw || 2} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />;
          })()}
          {single?.kind === 'shape' && tool === 'select' && !editing && (
            <g fill="#fff" stroke="var(--accent)" strokeWidth={1.5 / view.k}>
              {(() => {
                const { x, y, w, h } = single.el, l = x - 4, r = x + w + 4, t = y - 4, b = y + h + 4, mx = (l + r) / 2, my = (t + b) / 2;
                const cursor = (c: string) => c.length === 2 ? (c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize') : (c === 'n' || c === 's' ? 'ns-resize' : 'ew-resize');
                const tip = 'Drag to resize · Shift keeps proportions · Alt turns off snapping';
                // invisible strips along each side, so a whole edge can be grabbed, not only its middle handle
                const strips = ([['n', l, t, r - l, 0], ['s', l, b, r - l, 0], ['w', l, t, 0, b - t], ['e', r, t, 0, b - t]] as [string, number, number, number, number][])
                  .map(([c, sx, sy, sw, sh]) => <rect key={'strip-' + c} data-handle={c} data-strip="" x={sx - hs / 2} y={sy - hs / 2} width={sw + hs} height={sh + hs} fill="transparent" stroke="none" style={{ cursor: cursor(c) }}><title>{tip}</title></rect>);
                const knobs = ([['nw', l, t], ['n', mx, t], ['ne', r, t], ['e', r, my], ['se', r, b], ['s', mx, b], ['sw', l, b], ['w', l, my]] as [string, number, number][])
                  .map(([c, hx, hy]) => <rect key={c} data-handle={c} x={hx - hs / 2} y={hy - hs / 2} width={hs} height={hs} rx={1.5 / view.k} style={{ cursor: cursor(c) }}><title>{tip}</title></rect>);
                return [...strips, ...knobs];
              })()}
            </g>
          )}
          {single?.kind === 'shape' && single.el.poly && single.el.poly.length <= 12 && tool === 'select' && !editing && (
            <g fill="var(--accent)" stroke="#fff" strokeWidth={1 / view.k}>
              {single.el.poly.map((q, i) => <circle key={i} data-vertex={i} cx={q.x} cy={q.y} r={hs * 0.55} style={{ cursor: 'move' }}><title>Drag to move this corner</title></circle>)}
            </g>
          )}
          {single?.kind === 'conn' && tool === 'select' && !editing && (
            <g fill="#fff" stroke="var(--accent)" strokeWidth={1.5 / view.k}>
              {single.el.ortho && single.el.pts.slice(0, -1).map((a, i) => {
                const b = single.el.pts[i + 1], len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y), h = a.y === b.y;
                if (len < 28 / view.k) return null;
                const w = (h ? 14 : 5) / view.k, ht = (h ? 5 : 14) / view.k;
                return <rect key={'s' + i} data-seg={i} x={(a.x + b.x) / 2 - w / 2} y={(a.y + b.y) / 2 - ht / 2} width={w} height={ht} rx={2.5 / view.k} style={{ cursor: h ? 'ns-resize' : 'ew-resize' }} />;
              })}
              {single.el.curve && !single.el.p.via && (() => { const m = single.el.pts[Math.floor((single.el.pts.length - 1) / 2)]; return <circle data-seg={-1} cx={m.x} cy={m.y} r={hs * 0.6} style={{ cursor: 'move' }}><title>Drag to bend the line</title></circle>; })()}
              {(['a', 'b'] as const).filter((w) => single.el[w].kind !== 'rel').map((w) => { const p = w === 'a' ? single.el.pts[0] : single.el.pts[single.el.pts.length - 1]; return <circle key={w} data-end={w} cx={p.x} cy={p.y} r={hs * 0.65} style={{ cursor: 'crosshair' }} />; })}
            </g>
          )}
        </g>
      </svg>

      {editing && (
        <textarea className={edLook ? 'textedit inplace' : 'textedit'} autoFocus value={editing.value} spellCheck={false} wrap={edLook && !edLook.wrap ? 'off' : 'soft'}
          ref={edRef} style={edLook ? inplaceStyle(edLook, editing.value, view) : { left: view.x + editing.box.x * view.k, top: view.y + editing.box.y * view.k, width: Math.max(120, editing.box.w * view.k), height: Math.max(28, editing.box.h * view.k), fontSize: Math.max(11, 12 * view.k) }}
          onChange={(e) => typeEdit(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => finishEdit(true)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEdit(true); } else if (e.key === 'Escape') finishEdit(false); e.stopPropagation(); }} />
      )}

      <div className="topleft" onPointerDown={(e) => e.stopPropagation()}>
        <button className="iconbtn island" title="Menu" aria-label="Menu" aria-expanded={menuOpen} onClick={() => { setMenuOpen((o) => !o); setCtx(null); }}><Menu size={18} /></button>
        {menuOpen && (
          <div className="dropdown island" role="menu">
            <button role="menuitem" onClick={() => { closePopups(); newDiagram(); }}><FilePlus size={16} />New diagram</button>
            <button role="menuitem" onClick={() => { closePopups(); setTemplatesOpen(true); }}><LayoutTemplate size={16} />New from a template</button>
            {files.hasFileAccess && <button role="menuitem" onClick={() => { closePopups(); openFolder(); }}><FolderOpen size={16} />Open folder</button>}
            <button role="menuitem" onClick={() => { closePopups(); openFile(); }}><FileText size={16} />Open file</button>
            <button role="menuitem" onClick={() => { closePopups(); setPasteOpen(true); }}><ClipboardPaste size={16} />Paste diagram text</button>
            <hr />
            <button role="menuitem" onClick={() => { closePopups(); setExportOpen(true); }}><ImageDown size={16} />Export image…<kbd>Ctrl ⇧ E</kbd></button>
            <button role="menuitem" onClick={() => { closePopups(); files.download(baseName + '.fdraw', src); }}><Download size={16} />Download diagram file</button>
            <hr />
            <button role="menuitem" onClick={() => { closePopups(); act.legend(); }}><ListTree size={16} />Add a legend</button>
            <hr />
            <BackgroundMenu scene={scene} set={(bg) => act.setCanvas(bg)} />
          </div>
        )}
        <Panel sc={scene} src={cur} sel={sel} act={act} />
      </div>

      <div className="topcenter" onPointerDown={(e) => e.stopPropagation()}>
        <div className="toolbar island" role="toolbar" aria-label="Tools">
          <button className={'tool' + (locked ? ' on' : '')} title="Keep the chosen tool active after drawing" aria-label="Keep tool active" aria-pressed={locked} onClick={() => setLocked((l) => !l)}>{locked ? <Lock size={17} /> : <LockOpen size={17} />}</button>
          <span className="sep" />
          {TOOLS.map(([id, label, key]) => (
            <button key={id} className={'tool' + (tool === id ? ' on' : '')} title={`${label} — ${key}`} aria-label={label} aria-pressed={tool === id} onClick={() => setTool(id)}>
              {ICONS[id]}<kbd>{key}</kbd>
            </button>
          ))}
          <button className={'tool' + (tool === 'style:icon' ? ' on' : '')} title={scene.look.styles.has('icon') ? 'Icon — I' : 'This look has no icon style'} aria-label="Icon" aria-pressed={tool === 'style:icon'} aria-haspopup="dialog"
            disabled={!scene.look.styles.has('icon')} onClick={() => setIconToolOpen(true)}>
            {pickedIcon && (scene.look.icons.has(pickedIcon.name) || scene.look.images.has(pickedIcon.name)) ? <IconGlyph look={scene.look} name={pickedIcon.name} iconStyle={pickedIcon.style} size={17} /> : <Smile size={17} />}<kbd>I</kbd>
          </button>
        </div>
        {tool === 'freehand' && <div className="hintbar">Drag on the canvas to draw · Esc when done</div>}
        {armed && <div className="hintbar">{tool.startsWith('conn:') ? 'Drag from one element to another to connect them' : 'Click or drag on the canvas to place it'} · Esc to cancel</div>}
        {fontNote && <div className="banner">{fontNote}</div>}
        {iconNote && <div className="banner">{iconNote}</div>}
        {missingLook && (
          <div className="banner">
            This diagram uses the look “{lookPath(cur)}”, which is not loaded, so it is drawn with plain styles.
            <button onClick={chooseLook}>Choose look file</button>
          </div>
        )}
      </div>

      <div className="topright" onPointerDown={(e) => e.stopPropagation()}>
        <Sidebar side={side}
          components={<Gallery look={scene.look} current={tool} onPick={setTool} />}
          look={<LookPicker src={cur} current={curLook} file={pickerFile.current ?? fileLook} onPreview={setLookPreview} onApply={applyLook} />} />
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
        <div className="island group"><ThemeToggle className="iconbtn" /></div>
      </div>

      <div className="bottomright" onPointerDown={(e) => e.stopPropagation()}>
        {showIssues && issues.length > 0 && (
          <ul className="island issuelist">
            {issues.map((i, n) => (
              <li key={n} className={i.level} onClick={() => { const hit = [...scene.shapes, ...scene.texts, ...scene.conns].find((x) => x.line === i.line); if (hit) setSel([hit.id]); }}>
                {i.msg}
              </li>
            ))}
          </ul>
        )}
        <button className={'island problems' + (issues.length ? ' has' : '')} onClick={() => setShowIssues((s) => !s)} aria-expanded={showIssues}
          title={issues.length ? 'Show what the checker found' : 'The checker found no problems'}>
          {issues.length ? <TriangleAlert size={15} /> : <Check size={15} />}
          {issues.length ? `${issues.length} problem${issues.length > 1 ? 's' : ''}` : 'No problems'}
        </button>
      </div>

      <div className="bottomcenter" onPointerDown={(e) => e.stopPropagation()}>
        <div className="island tabs" role="tablist" aria-label="Open diagrams">
          {folderFiles.length > 1 && (
            <label className="folderpick" title="Open another diagram from this folder">
              <FolderOpen size={14} />
              <select aria-label="Diagram" value={io.current.path} onChange={(e) => io.current.folder && openPath(io.current.folder, e.target.value, true)}>{folderFiles.map((f) => <option key={f}>{f}</option>)}</select>
            </label>
          )}
          {tabs.map((id) => {
            const d = id === docId ? live.current : docs.current.get(id);
            const where = d?.io.file || d?.io.pending ? `Saved to ${d.io.path ?? d.io.file?.name ?? d.io.pending?.file.name}` : 'Kept in this browser';
            return (
              <div key={id} className={'tab' + (id === docId ? ' on' : '')}>
                {renaming === id
                  ? <input className="tabname" autoFocus defaultValue={d?.name} aria-label="Diagram name" onFocus={(e) => e.target.select()}
                      onBlur={(e) => rename(id, e.target.value)}
                      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') rename(id, e.currentTarget.value); else if (e.key === 'Escape') setRenaming(null); }} />
                  : <button role="tab" aria-selected={id === docId} title={`${d?.name} — ${where}${d?.io.file || d?.io.pending ? '' : '. Double-click to rename'}`}
                      onClick={() => switchTo(id)} onDoubleClick={() => d && !d.io.file && !d.io.pending && setRenaming(id)}>{tabName(id)}</button>}
                {/* every tab keeps room for the dot, so switching tabs does not shift them */}
                {id === docId
                  ? <span className="savestate" title={status || undefined}>
                      <span className={'dot ' + saveState} aria-hidden="true" />
                      <span className="status">{status}</span>
                      {io.current.pending && <button className="reconnect" title={`Let the editor write to ${io.current.pending.file.name} again`} onClick={() => reconnect(true)}>Reconnect</button>}
                    </span>
                  : <span className="savestate" aria-hidden="true"><span className="dot off" /></span>}
                <button className="tabx" aria-label={`Close ${tabName(id)}`} title="Close" onClick={() => closeTab(id)}><X size={13} /></button>
              </div>
            );
          })}
          <button className="tabnew" aria-label="New diagram in a new tab" title="New diagram" onClick={() => newDiagram()}><Plus size={15} /></button>
        </div>
      </div>

      {ctx && (
        <div className="island dropdown ctx" style={{ left: ctx.x, top: ctx.y }} role="menu" onPointerDown={(e) => e.stopPropagation()}>
          {sel.length === 1 && <button role="menuitem" onClick={() => { setCtx(null); startEdit(sel[0]); }}><Pencil size={15} />Edit text<kbd>Enter</kbd></button>}
          <button role="menuitem" onClick={() => { setCtx(null); act.duplicate(); }}><Copy size={15} />Duplicate<kbd>Ctrl+D</kbd></button>
          {sel.length > 1 && <button role="menuitem" onClick={() => { setCtx(null); act.group(); }}><Group size={15} />Group<kbd>Ctrl+G</kbd></button>}
          {sel.some((id) => ops.find(scene, id)?.el.p.group) && <button role="menuitem" onClick={() => { setCtx(null); act.ungroup(); }}><Ungroup size={15} />Ungroup<kbd>Ctrl+Shift+G</kbd></button>}
          <hr />
          <button role="menuitem" onClick={() => { setCtx(null); act.reorder('front'); }}><ArrowUpToLine size={15} />Bring to front<kbd>Ctrl ⇧ ]</kbd></button>
          <button role="menuitem" onClick={() => { setCtx(null); act.reorder('forward'); }}><ArrowUp size={15} />Bring forward<kbd>Ctrl ]</kbd></button>
          <button role="menuitem" onClick={() => { setCtx(null); act.reorder('backward'); }}><ArrowDown size={15} />Send backward<kbd>Ctrl [</kbd></button>
          <button role="menuitem" onClick={() => { setCtx(null); act.reorder('back'); }}><ArrowDownToLine size={15} />Send to back<kbd>Ctrl ⇧ [</kbd></button>
          <hr />
          <button role="menuitem" className="danger" onClick={() => { setCtx(null); act.remove(); }}><Trash2 size={15} />Delete<kbd>Del</kbd></button>
        </div>
      )}

      {pasteOpen && <PasteDialog onClose={() => setPasteOpen(false)} onLoad={(t) => { setPasteOpen(false); io.current = { fileMod: 0, lookMod: 0, written: '' }; load(t, lookSrc, 'pasted diagram'); }} />}
      {iconToolOpen && (
        <IconDialog look={scene.look} value={undefined} iconStyle={iconToPlace.current.style} onClose={() => setIconToolOpen(false)}
          onPick={(n, style) => { setIconToolOpen(false); setPickedIcon({ name: n, style }); rememberIcon({ name: n, style }); setSel([]); setTool('style:icon'); }} />
      )}
      {exportOpen && <ExportDialog scene={scene} payload={exportPayload()} base={baseName} onClose={() => setExportOpen(false)} onDone={setStatus} />}
      {templateDialog}
    </div>
  );
}

function PasteDialog({ onClose, onLoad }: { onClose: () => void; onLoad: (text: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card">
        <h3>Paste diagram text</h3>
        <p className="muted">Paste what an assistant wrote. It opens in memory, drawn with the built-in look unless it names its own. Use Download to keep it.</p>
        <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={'a: node "Orders API" at 80,80\nb: store "Orders DB" at 320,80\na -> b "writes"'} />
        <div className="startbtns">
          <button className="primary" disabled={!v.trim()} onClick={() => onLoad(v)}>Open</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
