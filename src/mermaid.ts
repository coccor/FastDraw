// Mermaid → FastDraw. Reads a Mermaid flowchart, sequence, ER, state or class diagram and writes a .fdraw file
// that says the same thing in FastDraw's terms: the look's styles for its boxes and lines, every box sized to its
// text, and everything placed (Mermaid lays diagrams out when drawing them; a FastDraw file says where things are).
// Works in the browser too: no Node modules.
import { buildScene, textWidth, wrapLines } from './scene.ts';
import { check } from './check.ts';
import { defaultLook, type Look } from './look.ts';
import { layered, type Dir, type Box, type LayoutEdge, type LayoutGroup, type LayoutNode } from './layered.ts';

export class MermaidError extends Error {
  line: number;
  constructor(msg: string, line: number) { super(msg); this.line = line; }
}
export interface Imported {
  kind: 'flowchart' | 'sequence' | 'er' | 'state' | 'class';
  title?: string;
  text: string;
  // what was left out or changed on the way (styles, notes, click handlers), one line each
  notes: string[];
}
export interface ImportOptions {
  look?: Look;
  // what to write on the file's look line (a name, a path or an address); none: no look line, the built-in look
  lookLine?: string;
}

const KINDS: Record<string, Imported['kind']> = {
  flowchart: 'flowchart', graph: 'flowchart', 'flowchart-elk': 'flowchart',
  sequenceDiagram: 'sequence', erDiagram: 'er', stateDiagram: 'state', 'stateDiagram-v2': 'state', classDiagram: 'class',
};
const OTHER = ['pie', 'gantt', 'journey', 'gitGraph', 'mindmap', 'timeline', 'quadrantChart', 'requirementDiagram', 'C4Context', 'C4Container',
  'C4Component', 'C4Dynamic', 'C4Deployment', 'sankey-beta', 'xychart-beta', 'block-beta', 'packet-beta', 'kanban', 'architecture-beta', 'radar-beta', 'treemap-beta'];

// The ```mermaid blocks of a Markdown file, with the line each starts on.
export function mermaidBlocks(md: string): { code: string; line: number }[] {
  const out: { code: string; line: number }[] = [];
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(`{3,}|~{3,})\s*mermaid\b/.exec(lines[i]!);
    if (!m) continue;
    const fence = m[2]!, body: string[] = [];
    let j = i + 1;
    for (; j < lines.length && !lines[j]!.trim().startsWith(fence); j++) body.push(lines[j]!.slice(Math.min(m[1]!.length, lines[j]!.length - lines[j]!.trimStart().length)));
    out.push({ code: body.join('\n'), line: i + 2 });
    i = j;
  }
  return out;
}

// Whether a text is a Mermaid diagram this importer reads (for pasting into the editor).
export function looksLikeMermaid(src: string): boolean {
  try { return !!KINDS[header(prepare(src).lines)?.word ?? '']; } catch { return false; }
}

export function importMermaid(src: string, opts: ImportOptions = {}): Imported {
  const pre = prepare(src);
  const head = header(pre.lines);
  if (!head) throw new MermaidError('no Mermaid diagram found: the first line should name its type, like  flowchart TD  or  sequenceDiagram', 1);
  const kind = KINDS[head.word];
  if (!kind) {
    const known = OTHER.includes(head.word);
    throw new MermaidError(known ? `${head.word} diagrams are not imported; flowchart, sequence, ER, state and class diagrams are`
      : `"${head.word}" is not a Mermaid diagram type this reads (flowchart, sequenceDiagram, erDiagram, stateDiagram, classDiagram)`, head.line);
  }
  const ctx = new Ctx(opts.look ?? defaultLook(), pre.title);
  const body = pre.lines.slice(pre.lines.indexOf(head.src) + 1);
  if (kind === 'flowchart') flowchart(ctx, body, head.rest);
  else if (kind === 'sequence') sequence(ctx, body);
  else if (kind === 'er') er(ctx, body);
  else if (kind === 'state') state(ctx, body);
  else classes(ctx, body);
  const top = [opts.lookLine ? `look ${q(opts.lookLine)}` : '', ...ctx.head].filter(Boolean);
  polish(ctx, top);
  return { kind, title: ctx.title, text: [...top, ...ctx.out].join('\n') + '\n', notes: [...new Set(ctx.notes)] };
}

// The layout is worked out by rule; FastDraw's checker then says where a line still crosses a box, runs on top of
// another or has its label on a line. Each line it names gets its other ways of attaching tried (other sides, the
// label on the other side of the line), and keeps the one with the fewest problems. A budget keeps big diagrams quick.
function polish(ctx: Ctx, top: string[]) {
  if (!ctx.edges.length) return;
  const started = Date.now();
  let tries = 0;
  const score = () => {
    tries++;
    const is = check(buildScene([...top, ...ctx.out].join('\n'), ctx.look, 'import.fdraw')).filter((i) => i.level !== 'hint');
    return { n: is.reduce((s, i) => s + (i.level === 'error' ? 100 : 1), 0), lines: new Set(is.map((i) => i.line)), labels: new Set(is.filter((i) => /^label /.test(i.msg)).map((i) => i.line)) };
  };
  let cur = score();
  for (let round = 0; round < 3 && cur.n > 0; round++) {
    let better = false;
    for (const e of ctx.edges) {
      const line = top.length + e.at + 1;
      if (!cur.lines.has(line) || tries > 600 || Date.now() - started > 4000) continue;
      const keep = ctx.out[e.at]!;
      let best = cur, bestText = keep;
      for (const c of e.cands) {
        if (c[2] && !cur.labels.has(line)) continue;
        const t = e.make(c[0], c[1], c[2]);
        if (t === keep) continue;
        ctx.out[e.at] = t;
        const sc = score();
        if (sc.n < best.n) { best = sc; bestText = t; }
        if (!best.lines.has(line) || tries > 600) break;
      }
      ctx.out[e.at] = bestText;
      if (best.n < cur.n) { cur = best; better = true; }
    }
    if (!better) break;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reading: frontmatter, directives, comments

type Line = { text: string; line: number };
function prepare(src: string): { lines: Line[]; title?: string } {
  const raw = src.replace(/^﻿/, '').split(/\r?\n/);
  let title: string | undefined, start = 0;
  if (raw[0]?.trim() === '---') {
    const end = raw.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) {
      for (const l of raw.slice(1, end)) { const m = /^title:\s*(.+)$/.exec(l.trim()); if (m) title = unquote(m[1]!.trim()); }
      start = end + 1;
    }
  }
  const lines: Line[] = [];
  for (let i = start; i < raw.length; i++) {
    let t = raw[i]!.replace(/%%\{.*?\}%%/g, '');
    if (/^\s*%%/.test(t)) continue;
    t = t.replace(/\s%%.*$/, '').trim();
    if (t) lines.push({ text: t, line: i + 1 });
  }
  return { lines, title };
}
function header(lines: Line[]): { word: string; rest: string; line: number; src: Line } | undefined {
  const first = lines[0];
  if (!first) return undefined;
  const m = /^([\w-]+)\s*(.*)$/.exec(first.text);
  return m ? { word: m[1]!, rest: m[2]!, line: first.line, src: first } : undefined;
}

// Mermaid label text → plain text: line breaks, entities, Markdown emphasis and Font Awesome icons dealt with.
function clean(s: string): string {
  let t = s.trim();
  if (/^".*"$/s.test(t)) t = t.slice(1, -1);
  if (/^`.*`$/s.test(t)) t = t.slice(1, -1).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/_(.+?)_/g, '$1');
  t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\bfa[bsr]?:fa-[\w-]+\s*/g, '');
  t = t.replace(/#(\d+);/g, (_, n: string) => String.fromCodePoint(+n)).replace(/#quot;/g, '"').replace(/#(\w+);/g, (m, n: string) => ENT[n] ?? m);
  t = t.replace(/&(\w+);/g, (m, n: string) => ENT[n] ?? m).replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(+n));
  return t.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter((l, i, a) => l || (i && i < a.length - 1)).join('\n');
}
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '39': "'" };
const unquote = (s: string) => (/^".*"$|^'.*'$/.test(s) ? s.slice(1, -1) : s);
// a quoted FastDraw string
const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

// ---------------------------------------------------------------------------------------------------------------
// Writing: ids, sizes, the output

class Ctx {
  out: string[] = [];
  head: string[] = [];
  notes: string[] = [];
  private ids = new Map<string, string>();
  private used = new Set<string>();
  private probes = new Map<string, { w: number; h: number; p: Record<string, string> } | null>();
  look: Look;
  title?: string;
  constructor(look: Look, title?: string) { this.look = look; this.title = title; }
  // a FastDraw id for a Mermaid name: letters, digits, _ and -, starting with a letter; unique
  id(name: string): string {
    const had = this.ids.get(name);
    if (had) return had;
    let base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'n';
    if (!/^[A-Za-z_]/.test(base)) base = 'n' + base;
    let id = base;
    for (let k = 2; this.used.has(id); k++) id = `${base}_${k}`;
    this.used.add(id); this.ids.set(name, id);
    return id;
  }
  fresh(base: string): string { return this.id(`\u0000${base}${this.used.size}`.replace('\u0000', '')); }
  // the look's style, its default size and its text settings; null when the look has no such style
  style(name: string): { w: number; h: number; p: Record<string, string> } | null {
    if (this.probes.has(name)) return this.probes.get(name)!;
    const sc = buildScene(`x: ${name} "M" at 0,0`, this.look, 'probe.fdraw');
    const s = sc.shapes[0];
    // the plain built-in shapes have no size of their own
    const plain = ['rect', 'ellipse', 'diamond', 'polygon'].includes(name);
    const r = !s || sc.issues.some((i) => i.level === 'error' && /unknown style/.test(i.msg)) ? null : { w: plain ? 0 : s.w, h: plain ? 0 : s.h, p: s.p as Record<string, string> };
    this.probes.set(name, r);
    return r;
  }
  // the first of the styles the look has (box, line or text styles; rect, ellipse, diamond, text and line always exist)
  pick(...names: string[]): string {
    return names.find((n) => this.look.styles.has(n) || BUILT_IN.includes(n)) ?? names[names.length - 1]!;
  }
  // a box of a style big enough for its text (wrapped when long), multiples of 8
  fit(style: string, text: string, min?: { w: number; h: number }): { w: number; h: number; text: string } {
    const st = this.style(style), p = st?.p ?? {};
    const size = +(p['title.size'] ?? 12), font = p['title.font'] ?? 'sans', weight = +(p['title.weight'] ?? 600), sp = +(p['title.spacing'] ?? 0);
    const measure = (l: string) => textWidth(l, size, font, weight, sp);
    const lines = text.split('\n').flatMap((l) => (measure(l) > 200 ? wrapLines(l, 200, measure) : [l]));
    const tw = Math.max(0, ...lines.map(measure)), lh = Math.round(size * 1.3);
    const shape = st ? (this.shapeOf(style)) : style;
    const round = shape === 'diamond' || shape === 'ellipse';
    const dw = min?.w ?? (st?.w || (round ? 64 : 144)), dh = min?.h ?? (st?.h || 48);
    const up8 = (v: number) => Math.ceil(v / 8) * 8;
    const w = Math.max(dw, up8(round ? tw / 0.72 + 24 : tw + 40));
    const h = Math.max(dh, up8(round ? lines.length * lh * 1.8 + 24 : lines.length * lh + 28));
    return { w, h, text: lines.join('\n') };
  }
  shapeOf(style: string): string {
    const sc = buildScene(`x: ${style} at 0,0 40x40`, this.look, 'probe.fdraw');
    return sc.shapes[0]?.shape ?? style;
  }
  // a table's own size, as FastDraw works it out from its rows
  tableSize(head: string, rows: string[], minW = 0): { w: number; h: number } {
    const sc = buildScene([`t: table ${q(head)} at 0,0${minW ? ` ${minW}x0` : ''}`, ...rows.map((r) => `  ${r}`)].join('\n'), this.look, 'probe.fdraw');
    const s = sc.shapes[0];
    return { w: Math.ceil((s?.w ?? 160) / 8) * 8, h: s?.h ?? 32 };
  }
  // a label's width on a line (small caps, a little letter-spacing)
  labelW(text: string): number {
    return Math.max(0, ...text.split('\n').map((l) => textWidth(l.toUpperCase(), 9, 'mono', 400, 0.08))) + 16;
  }
  push(...lines: string[]) { this.out.push(...lines); }
  // a line between two boxes, with the sides it may attach to: the preferred pair first, then FastDraw's own pick,
  // then every other pair; a labelled line may also have its label on the other side (see polish)
  edges: { at: number; make: (sa: string, sb: string, extra: string) => string; cands: [string, string, string][] }[] = [];
  edge(make: (sa: string, sb: string, extra: string) => string, pref: [string, string], label: boolean) {
    const pairs: [string, string][] = [pref, ['', ''], ['.right', '.right'], ['.left', '.left'], ['.bottom', '.bottom'], ['.top', '.top'],
      ['.bottom', '.top'], ['.top', '.bottom'], ['.right', '.left'], ['.left', '.right'], ['.bottom', ''], ['.right', ''], ['', '.top'], ['', '.left']];
    const cands: [string, string, string][] = [], seen = new Set<string>();
    for (const extra of label ? ['', ' lside=below', ' lside=left'] : ['']) for (const [a, b] of pairs) {
      const k = `${a} ${b} ${extra}`;
      if (!seen.has(k)) { seen.add(k); cands.push([a, b, extra]); }
    }
    this.edges.push({ at: this.out.length, make, cands });
    this.out.push(make(...cands[0]!));
  }
  // the title above the drawing; returns where the drawing starts
  titleTop(): number {
    if (!this.title) return 40;
    this.head.push(`title: text ${q(this.title)} at 40,52 style=${this.pick('h1', 'text')}`);
    return 112;
  }
}
const BUILT_IN = ['rect', 'ellipse', 'diamond', 'polygon', 'table', 'text', 'line', 'arrow'];
const at = (b: { x: number; y: number; w: number; h: number }) => `at ${b.x},${b.y} ${b.w}x${b.h}`;

// Lines between boxes laid out in a flow: when the far box lies ahead along the flow, the line leaves the side
// facing the flow and enters the opposite one, so it runs straight or with one step.
// A line back against the flow (a loop in a state machine, a retry) goes round the side instead, clear of the
// forward line beside it. A line from a decision that does not go straight on leaves the diamond's tip.
function sides(dir: Dir, a: Box, b: Box, decision = false): [string, string] {
  const cx = (r: Box) => r.x + r.w / 2, cy = (r: Box) => r.y + r.h / 2;
  const vertical = dir === 'TB' || dir === 'BT';
  const ahead = dir === 'TB' ? b.y >= a.y + a.h : dir === 'BT' ? b.y + b.h <= a.y : dir === 'LR' ? b.x >= a.x + a.w : b.x + b.w <= a.x;
  const behind = dir === 'TB' ? b.y + b.h <= a.y : dir === 'BT' ? b.y >= a.y + a.h : dir === 'LR' ? b.x + b.w <= a.x : b.x >= a.x + a.w;
  const [out, inn] = { TB: ['.bottom', '.top'], BT: ['.top', '.bottom'], LR: ['.right', '.left'], RL: ['.left', '.right'] }[dir];
  if (ahead && decision) {
    const off = vertical ? cx(b) - cx(a) : cy(b) - cy(a);
    if (Math.abs(off) > 8) return [vertical ? (off < 0 ? '.left' : '.right') : (off < 0 ? '.top' : '.bottom'), inn!];
  }
  if (ahead) return [out!, inn!];
  if (behind) return vertical ? ['.right', '.right'] : ['.bottom', '.bottom'];
  return ['', ''];
}
const DIR: Record<string, Dir> = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' };

// split a statement line on ; outside quotes and brackets
function statements(lines: Line[]): Line[] {
  const out: Line[] = [];
  // a quoted label may run over several lines ("`Line one
  // line two`"): those lines are read as one
  const joined: Line[] = [];
  let carry: Line | null = null;
  for (const l of lines) {
    const cur: Line = carry ? { text: carry.text + '\n' + l.text, line: carry.line } : l;
    carry = ((cur.text.match(/"/g) ?? []).length % 2) ? cur : null;
    if (!carry) joined.push(cur);
  }
  if (carry) joined.push(carry);
  for (const l of joined) {
    let depth = 0, inQ = false, start = 0;
    for (let i = 0; i < l.text.length; i++) {
      const c = l.text[i];
      if (c === '"') inQ = !inQ;
      else if (!inQ && '([{'.includes(c!)) depth++;
      else if (!inQ && ')]}'.includes(c!)) depth = Math.max(0, depth - 1);
      else if (!inQ && !depth && c === ';') { const t = l.text.slice(start, i).trim(); if (t) out.push({ text: t, line: l.line }); start = i + 1; }
    }
    const t = l.text.slice(start).trim();
    if (t) out.push({ text: t, line: l.line });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Flowcharts

type FNode = { id: string; label: string; shape: string; group: string | null; given: boolean };
type FEdge = { from: string; to: string; label: string; kind: 'solid' | 'thick' | 'dotted' | 'hidden'; head: string; tail: string; minlen: number; line: number };
type FGroup = { id: string; title: string; parent: string | null; dir?: Dir };

const SHAPES: [string, string[], string][] = [
  ['(((', [')))'], 'doublecircle'], ['([', ['])'], 'stadium'], ['[[', [']]'], 'subroutine'], ['[(', [')]'], 'cylinder'],
  ['((', ['))'], 'circle'], ['{{', ['}}'], 'hexagon'], ['[/', ['/]', '\\]'], 'lean'], ['[\\', ['\\]', '/]'], 'lean'],
  ['>', [']'], 'asymmetric'], ['[', [']'], 'rect'], ['(', [')'], 'round'], ['{', ['}'], 'rhombus'],
];
// the newer  id@{ shape: ..., label: "..." }  form names shapes by word
const SHAPE_WORDS: Record<string, string> = {
  rect: 'rect', proc: 'rect', process: 'rect', rectangle: 'rect', rounded: 'round', event: 'round', stadium: 'stadium', pill: 'stadium',
  terminal: 'stadium', diam: 'rhombus', diamond: 'rhombus', decision: 'rhombus', question: 'rhombus', cyl: 'cylinder', cylinder: 'cylinder',
  database: 'cylinder', db: 'cylinder', circle: 'circle', circ: 'circle', 'dbl-circ': 'doublecircle', 'double-circle': 'doublecircle',
  hex: 'hexagon', hexagon: 'hexagon', prepare: 'hexagon', 'lean-r': 'lean', 'lean-l': 'lean', 'in-out': 'lean', trap: 'lean',
  subproc: 'subroutine', subroutine: 'subroutine', 'sm-circ': 'circle', start: 'circle', stop: 'doublecircle', 'fr-circ': 'doublecircle',
};
const NAME = /^[\w$À-￿]+(?:[-.](?=[\w$À-￿])[\w$À-￿]+)*/;

function flowchart(ctx: Ctx, body: Line[], rest: string) {
  const dir = DIR[rest.trim().split(/\s+/)[0]?.toUpperCase() ?? ''] ?? 'TB';
  const nodes = new Map<string, FNode>(), edges: FEdge[] = [], groups = new Map<string, FGroup>(), stack: string[] = [];
  let rootDir = dir;
  const inside = (g: string | null, outer: string | null): boolean => {
    for (let c = g; c; c = groups.get(c)?.parent ?? null) if (c === outer) return true;
    return outer === null;
  };
  const mention = (id: string): FNode => {
    const cur = stack[stack.length - 1] ?? null;
    let n = nodes.get(id);
    if (!n) { n = { id, label: id, shape: 'rect', group: cur, given: false }; nodes.set(id, n); }
    else if (cur && n.group !== cur && inside(cur, n.group)) n.group = cur;
    return n;
  };
  for (const st of statements(body)) {
    const t = st.text;
    let m: RegExpExecArray | null;
    if ((m = /^subgraph\b\s*(.*)$/.exec(t))) {
      const r = m[1]!.trim();
      let id: string, title: string;
      const mi = /^([^\s[\]"]+)\s*\[(.*)\]$/.exec(r);
      if (mi) { id = mi[1]!; title = clean(mi[2]!); }
      else if (/^".*"$/.test(r)) { id = `subgraph ${groups.size + 1}`; title = clean(r); }
      else if (r && !/\s/.test(r)) { id = r; title = r; }
      else { id = r || `subgraph ${groups.size + 1}`; title = clean(r); }
      groups.set(id, { id, title, parent: stack[stack.length - 1] ?? null });
      stack.push(id);
      continue;
    }
    if (t === 'end') { if (!stack.length) throw new MermaidError('end without a subgraph to close', st.line); stack.pop(); continue; }
    if ((m = /^direction\s+(\w+)$/.exec(t))) {
      const d = DIR[m[1]!.toUpperCase()];
      if (d) { const g = stack[stack.length - 1]; if (g) groups.get(g)!.dir = d; else rootDir = d; }
      continue;
    }
    if (/^(classDef|class|style)\s/.test(t)) { ctx.notes.push('colours from classDef, class and style lines are left to the look'); continue; }
    if (/^linkStyle\s/.test(t)) { ctx.notes.push('linkStyle lines are left to the look'); continue; }
    if (/^(click|callback|href)\s/.test(t)) { ctx.notes.push('click lines (links and callbacks) are left out'); continue; }
    if (/^acc(Title|Descr)\b/.test(t)) continue;
    // id@{ ... } that names no shape or label is metadata on a node, line or subgraph (animation, collapsed)
    if ((m = /^[^\s@]+@\{([\s\S]*)\}$/.exec(t)) && !/\b(shape|label)\s*:/.test(m[1]!)) continue;
    flowStatement(ctx, t, st.line, mention, edges);
  }
  if (stack.length) throw new MermaidError(`subgraph ${stack[stack.length - 1]} is not closed with end`, body[body.length - 1]?.line ?? 1);
  // a line to a subgraph's name ends on the subgraph
  for (const [id, n] of nodes) if (groups.has(id) && !n.given) nodes.delete(id);

  const flow = [...nodes.values()].some((n) => n.shape === 'rhombus');
  const styleOf = (n: FNode): string => {
    switch (n.shape) {
      case 'rhombus': return ctx.pick('decision', 'diamond');
      case 'stadium': return ctx.pick('terminal', 'node', 'rect');
      case 'cylinder': return ctx.pick('store', 'node', 'rect');
      case 'circle': case 'doublecircle': return 'ellipse';
      case 'hexagon': case 'lean': return 'polygon';
      default: return flow ? ctx.pick('step', 'node', 'rect') : ctx.pick('node', 'rect');
    }
  };
  const fids = new Map<string, string>();
  const fid = (id: string) => fids.get(id) ?? (fids.set(id, ctx.id(id)), fids.get(id)!);
  const layNodes: LayoutNode[] = [], drawn = new Map<string, { style: string; text: string; extra: string }>();
  for (const n of nodes.values()) {
    const style = styleOf(n);
    let { w, h, text } = ctx.fit(style === 'polygon' ? ctx.pick('node', 'rect') : style, n.label);
    let extra = '';
    if (n.shape === 'circle' || n.shape === 'doublecircle') w = h = Math.max(w, h, 64);
    if (n.shape === 'hexagon') { w += 32; extra = ` points=${16},0;${w - 16},0;${w},${h / 2};${w - 16},${h};16,${h};0,${h / 2}`; }
    if (n.shape === 'lean') { w += 32; extra = ` points=24,0;${w},0;${w - 24},${h};0,${h}`; }
    if (n.shape === 'doublecircle') extra = ' sw=3';
    layNodes.push({ id: n.id, w, h, group: n.group });
    drawn.set(n.id, { style, text, extra });
  }
  const layEdges: LayoutEdge[] = edges.map((e) => ({ from: e.from, to: e.to, minlen: e.minlen, ...(e.label ? { label: { w: ctx.labelW(e.label), h: 20 } } : {}) }));
  const layGroups: LayoutGroup[] = [...groups.values()].map((g) => ({ id: g.id, parent: g.parent, dir: g.dir }));
  const lay = layered({ nodes: layNodes, edges: layEdges, groups: layGroups, dir: rootDir, rankGap: 56, sibGap: 48, pad: { top: 40, side: 24, bottom: 24 } });
  const top = ctx.titleTop();
  const box = (id: string) => { const b = lay.boxes.get(id)!; return { x: b.x + 40, y: b.y + top, w: b.w, h: b.h }; };
  // a subgraph named like one of the boxes gets an id of its own
  const gid = (g: string) => (nodes.has(g) ? fid('\u0001' + g) : fid(g));
  for (const g of groups.values()) ctx.push(`${gid(g.id)}: ${ctx.pick('zone', 'rect')}${g.title ? ' ' + q(g.title) : ''} ${at(box(g.id))}`);
  // a hexagon or a slanted box has no style of its own: it takes the fill and outline of the plain box style
  const plainBox = ctx.style(flow ? ctx.pick('step', 'node') : ctx.pick('node', 'rect'))?.p ?? {};
  const polyLook = ['fill', 'stroke', 'sw'].filter((k) => plainBox[k]).map((k) => ` ${k}=${plainBox[k]}`).join('');
  for (const n of nodes.values()) {
    const d = drawn.get(n.id)!, b = box(n.id);
    ctx.push(d.style === 'polygon' ? `${fid(n.id)}: polygon ${q(d.text)} at ${b.x},${b.y}${d.extra}${polyLook}` : `${fid(n.id)}: ${d.style} ${q(d.text)} ${at(b)}${d.extra}`);
  }
  // a subgraph runs the way its own direction line says, or the way the one around it runs
  const dirOf = (g: string | null): Dir => { for (let c = g; c; c = groups.get(c)?.parent ?? null) { const d = groups.get(c)?.dir; if (d) return d; } return rootDir; };
  // the innermost group holding both ends of a line: the line is laid out there, in that group's direction
  const ancestors = (id: string) => { const out: (string | null)[] = []; for (let c = groups.has(id) ? groups.get(id)!.parent : nodes.get(id)?.group ?? null; c; c = groups.get(c)?.parent ?? null) out.push(c); return [...out, null]; };
  const common = (a: string, b: string) => { const bs = ancestors(b); return ancestors(a).find((g) => bs.includes(g)) ?? null; };
  // a decision's lines leave its tips only for the outermost target on each side; the others leave its bottom
  const tipOK = new Set<FEdge>();
  for (const n of nodes.values()) {
    if (n.shape !== 'rhombus') continue;
    const outs = edges.filter((e) => e.from === n.id && e.to !== n.id && e.kind !== 'hidden'), c = box(n.id), mid = c.x + c.w / 2, midY = c.y + c.h / 2;
    const vertical = (d: Dir) => d === 'TB' || d === 'BT';
    const off = (e: FEdge) => { const b = box(e.to); return vertical(dirOf(common(e.from, e.to))) ? b.x + b.w / 2 - mid : b.y + b.h / 2 - midY; };
    const lo = outs.filter((e) => off(e) < -8).sort((a, b) => off(a) - off(b))[0], hi = outs.filter((e) => off(e) > 8).sort((a, b) => off(b) - off(a))[0];
    if (lo) tipOK.add(lo);
    if (hi) tipOK.add(hi);
  }
  const thick = edges.filter((e) => e.kind === 'thick').length;
  for (const e of edges) {
    if (e.kind === 'hidden') continue;
    const flowDir = dirOf(common(e.from, e.to));
    const [sa, sb] = e.from === e.to ? ['.right@0.3', '.right@0.7'] : sides(flowDir, box(e.from), box(e.to), tipOK.has(e));
    const both = e.head === 'arrow' && e.tail === 'arrow';
    const op = both ? '<->' : e.head === 'arrow' ? '->' : '--';
    const props: string[] = [];
    if (e.kind === 'dotted') props.push('style=return');
    else if (e.kind === 'thick') props.push(thick <= 2 ? 'style=primary' : 'sw=2.4');
    else if (op === '--') props.push('style=arrow');
    if (e.kind === 'thick' && thick <= 2 && op === '--') props.push('head=none');
    if (e.head !== 'arrow' && e.head !== 'none') props.push(`head=${e.head}`);
    if (e.tail !== 'arrow' && e.tail !== 'none') props.push(`tail=${e.tail}`);
    const end = (id: string) => (nodes.has(id) ? fid(id) : gid(id));
    const rest = `${e.label ? ' ' + q(e.label) : ''}${props.length ? ' ' + props.join(' ') : ''}`;
    if (e.from === e.to) ctx.push(`${end(e.from)}${sa} ${op} ${end(e.to)}${sb}${rest} loop=28`);
    else ctx.edge((a, b, x) => `${end(e.from)}${a} ${op} ${end(e.to)}${b}${rest}${x}`, [sa, sb], !!e.label);
  }
}

function flowStatement(ctx: Ctx, t: string, line: number, mention: (id: string) => FNode, edges: FEdge[]) {
  let i = 0;
  const ws = () => { while (i < t.length && /\s/.test(t[i]!)) i++; };
  const fail = (what: string): never => { throw new MermaidError(`could not read ${what} at "${t.slice(i, i + 24)}"`, line); };
  const node = (): string => {
    ws();
    const m = NAME.exec(t.slice(i));
    if (!m) fail('a node');
    const id = m![0];
    i += id.length;
    const n = mention(id);
    if (t.startsWith('@{', i)) {
      const end = t.indexOf('}', i);
      if (end < 0) fail('the node\'s @{ ... }');
      const body = t.slice(i + 2, end);
      const sh = /shape:\s*"?([\w-]+)"?/.exec(body), lb = /label:\s*"((?:[^"\\]|\\.)*)"/.exec(body) ?? /label:\s*([^,}]+)/.exec(body);
      if (sh) n.shape = SHAPE_WORDS[sh[1]!] ?? 'rect';
      if (lb) n.label = clean(lb[1]!);
      n.given = true;
      i = end + 1;
    } else for (const [open, closes, shape] of SHAPES) {
      if (!t.startsWith(open, i)) continue;
      let j = i + open.length, text: string;
      if (t[j] === '"') {
        const e = t.indexOf('"', j + 1);
        if (e < 0) fail('a quoted label');
        text = t.slice(j, e + 1); j = e + 1;
        while (t[j] === ' ') j++;
        const c = closes.find((c) => t.startsWith(c, j));
        if (!c) fail(`the end of ${id}'s shape`);
        j += c!.length;
      } else {
        const ends = closes.map((c) => [t.indexOf(c, j), c.length] as const).filter(([k]) => k >= 0).sort((a, b) => a[0] - b[0]);
        if (!ends.length) fail(`the end of ${id}'s shape`);
        text = t.slice(j, ends[0]![0]); j = ends[0]![0] + ends[0]![1];
      }
      n.label = clean(text); n.shape = shape; n.given = true;
      i = j;
      break;
    }
    const cls = /^:::[\w-]+/.exec(t.slice(i));
    if (cls) { i += cls[0].length; ctx.notes.push('colours from classDef, class and style lines are left to the look'); }
    return id;
  };
  const group = (): string[] => {
    const ids = [node()];
    for (;;) { ws(); if (t[i] !== '&') break; i++; ids.push(node()); }
    return ids;
  };
  const edge = (): Omit<FEdge, 'from' | 'to' | 'line'> | null => {
    ws();
    const named = /^[\w-]+@(?=[-=.~<ox])/.exec(t.slice(i));
    if (named) i += named[0].length;
    const s = t.slice(i);
    // -- text -->, == text ==>, -. text .->
    let m = /^([<ox]?)(--|==|-\.)(?![-=.>ox|])\s*/.exec(s);
    if (m) {
      const close = m[2] === '-.' ? /\s(\.+-(>|o|x)?)(?=\s|$|[\w"])/ : m[2] === '==' ? /\s(={2,}(>|o|x)?)(?=\s|$|[\w"])/ : /\s(-{2,}(>|o|x)?)(?=\s|$|[\w"])/;
      const rest = s.slice(m[0].length), c = close.exec(' ' + rest);
      if (c) {
        const text = rest.slice(0, c.index - 0).trim();
        i += m[0].length + c.index - 1 + 1 + c[1]!.length;
        const body = m[2] === '-.' ? '-.' + c[1]!.replace(/[>ox]$/, '') : m[2]! + c[1]!.replace(/[>ox]$/, '');
        return shapeEdge(m[1]!, body, c[2] ?? '', clean(text));
      }
    }
    m = /^([<ox]?)(-{2,}|={2,}|-\.+-|~{3,})(>|[ox](?=[\s|]|$))?/.exec(s);
    if (!m) return null;
    i += m[0].length;
    ws();
    let label = '';
    const lb = /^\|([^|]*)\|/.exec(t.slice(i));
    if (lb) { label = clean(lb[1]!); i += lb[0].length; }
    return shapeEdge(m[1]!, m[2]!, m[3] ?? '', label);
  };
  let from = group();
  for (;;) {
    ws();
    if (i >= t.length) break;
    const e = edge();
    if (!e) fail('a line');
    const to = group();
    for (const a of from) for (const b of to) edges.push({ ...e!, from: a, to: b, line });
    from = to;
  }
}
function shapeEdge(tail: string, body: string, head: string, label: string): Omit<FEdge, 'from' | 'to' | 'line'> {
  const mark = (c: string) => (c === '>' || c === '<' ? 'arrow' : c === 'o' ? 'circle' : c === 'x' ? 'cross' : 'none');
  const kind = body.startsWith('~') ? 'hidden' : body.includes('=') ? 'thick' : body.includes('.') ? 'dotted' : 'solid';
  const len = kind === 'dotted' ? (body.match(/\./g) ?? []).length : body.length - (head ? 1 : 2);
  return { label, kind, head: mark(head), tail: mark(tail), minlen: Math.max(1, kind === 'dotted' ? len : len) };
}

// ---------------------------------------------------------------------------------------------------------------
// Sequence diagrams: participants in a row, lifelines, messages top to bottom, activation bars, loop/alt frames

type Part = { name: string; label: string; actor: boolean; id: string };
type Ev =
  | { t: 'msg'; from: string; to: string; text: string; arrow: string; act: string; line: number }
  | { t: 'note'; where: string; who: string[]; text: string }
  | { t: 'act'; who: string } | { t: 'deact'; who: string }
  | { t: 'open'; kind: string; text: string } | { t: 'else'; text: string } | { t: 'close' } | { t: 'number' };

const ARROWS = ['<<-->>', '<<->>', '-->>', '->>', '-->', '->', '--x', '-x', '--)', '-)'];

function sequence(ctx: Ctx, body: Line[]) {
  const parts = new Map<string, Part>(), evs: Ev[] = [], boxes: { title: string; who: string[] }[] = [];
  let inBox: { title: string; who: string[] } | null = null;
  const part = (name: string, label?: string, actor = false): Part => {
    let p = parts.get(name);
    if (!p) { p = { name, label: label ?? name, actor, id: ctx.id(name) }; parts.set(name, p); if (inBox) inBox.who.push(name); }
    else if (label) p.label = label;
    return p;
  };
  const arrowRe = new RegExp(`^(.+?)\\s*(${ARROWS.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*([+-]?)\\s*([^:]+?)\\s*:\\s*(.*)$`);
  let m: RegExpExecArray | null;
  const openNotes: Line[] = [];
  for (const st of body) {
    const t = st.text;
    if ((m = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/.exec(t))) { part(m[2]!.replace(/@\{.*\}$/, '').trim(), m[3] ? clean(m[3]) : undefined, m[1] === 'actor'); continue; }
    if ((m = /^create\s+(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/.exec(t))) { part(m[2]!.trim(), m[3] ? clean(m[3]) : undefined, m[1] === 'actor'); continue; }
    if (/^destroy\s/.test(t)) { ctx.notes.push('destroy lines are left out: the lifeline runs to the end'); continue; }
    if ((m = /^title\s*:?\s*(.+)$/.exec(t))) { ctx.title ??= clean(m[1]!); continue; }
    if (/^autonumber\b/.test(t)) { evs.push({ t: 'number' }); continue; }
    if ((m = /^(activate|deactivate)\s+(.+)$/.exec(t))) { part(m[2]!.trim()); evs.push(m[1] === 'activate' ? { t: 'act', who: m[2]!.trim() } : { t: 'deact', who: m[2]!.trim() }); continue; }
    if ((m = /^note\s+(left of|right of|over)\s+([^:]+?)\s*:\s*(.*)$/i.exec(t))) {
      const who = m[2]!.split(',').map((s) => s.trim());
      who.forEach((w) => part(w));
      evs.push({ t: 'note', where: m[1]!.toLowerCase(), who, text: clean(m[3]!) });
      continue;
    }
    if ((m = /^box\b\s*(.*)$/.exec(t))) {
      const title = m[1]!.replace(/^(rgba?\([^)]*\)|#[0-9a-f]{3,8}|transparent|aqua|[a-z]+(?=\s))\s*/i, '');
      inBox = { title: clean(title), who: [] }; boxes.push(inBox);
      continue;
    }
    if ((m = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/.exec(t))) { evs.push({ t: 'open', kind: m[1]!, text: m[1] === 'rect' ? '' : clean(m[2]!) }); continue; }
    if ((m = /^(else|and|option)\b\s*(.*)$/.exec(t))) { evs.push({ t: 'else', text: clean(m[2]!) }); continue; }
    if (t === 'end') {
      if (inBox && !evs.some((e) => e.t === 'open' && !(e as { closed?: boolean }).closed)) { inBox = null; continue; }
      const open = [...evs].reverse().find((e) => e.t === 'open' && !(e as { closed?: boolean }).closed) as { closed?: boolean } | undefined;
      if (!open) { if (inBox) { inBox = null; continue; } throw new MermaidError('end without a block to close', st.line); }
      open.closed = true;
      evs.push({ t: 'close' });
      continue;
    }
    if (/^links?\s/.test(t)) { ctx.notes.push('participant links are left out'); continue; }
    if ((m = arrowRe.exec(t))) {
      const from = part(m[1]!.trim()), to = part(m[4]!.trim());
      evs.push({ t: 'msg', from: from.name, to: to.name, arrow: m[2]!, act: m[3]!, text: clean(m[5]!), line: st.line });
      continue;
    }
    if (/^(accTitle|accDescr)\b/.test(t)) continue;
    openNotes.push(st);
  }
  if (openNotes.length) throw new MermaidError(`could not read "${openNotes[0]!.text}"`, openNotes[0]!.line);
  for (const e of evs) if (e.t === 'open' && !(e as { closed?: boolean }).closed) throw new MermaidError(`a ${e.kind} block is not closed with end`, body[body.length - 1]?.line ?? 1);
  const list = [...parts.values()];
  if (!list.length) throw new MermaidError('the sequence diagram has no participants', body[0]?.line ?? 1);
  const index = new Map(list.map((p, i) => [p.name, i]));

  // across: one gap between lifelines wide enough for every label and box
  const actorStyle = ctx.pick('external', 'node', 'rect'), partStyle = ctx.pick('node', 'rect');
  const sized = list.map((p) => ctx.fit(p.actor ? actorStyle : partStyle, p.label, { w: 144, h: 56 }));
  let gap = 224;
  for (const s of sized) gap = Math.max(gap, s.w + 48);
  let n = 0;
  // a label sits between two neighbouring lifelines (a long message's label in the first gap it crosses)
  for (const e of evs) {
    if (e.t === 'number') n = 1;
    if (e.t !== 'msg') continue;
    const text = n ? `${n++}. ${e.text}` : e.text;
    gap = Math.max(gap, ctx.labelW(text) + (e.from === e.to ? 72 : 48));
  }
  for (const e of evs) if (e.t === 'note' && e.where !== 'over') gap = Math.max(gap, ctx.fit('rect', e.text).w + 40);
  gap = Math.ceil(gap / 8) * 8;
  const widest = Math.max(...sized.map((s) => s.w));
  const lx = (name: string) => 40 + widest / 2 + index.get(name)! * gap;

  let top = ctx.titleTop();
  if (boxes.length) top += 32;
  const boxH = Math.max(...sized.map((s) => s.h));
  list.forEach((p, i) => {
    const s = sized[i]!, x = lx(p.name) - s.w / 2;
    ctx.push(`${p.id}: ${p.actor ? actorStyle : partStyle} ${q(s.text)}${p.actor ? ' icon=user' : ''} at ${x},${top} ${s.w}x${boxH}`);
  });

  // down: walk the events, giving each its y
  let y = top + boxH + 48, last = y - 56;
  const bars: { who: string; depth: number; start: number; end?: number; id: string }[] = [];
  const open = new Map<string, number[]>(); // who → indexes into bars, innermost last
  const barAt = (who: string, yy: number) => {
    const o = (open.get(who) ?? []).map((k) => bars[k]!).filter((b) => b.start < yy);
    return o[o.length - 1];
  };
  const activate = (who: string, yy: number) => {
    const o = open.get(who) ?? open.set(who, []).get(who)!;
    bars.push({ who, depth: o.length, start: yy + 4, id: ctx.fresh(`${parts.get(who)!.id}_bar`) });
    o.push(bars.length - 1);
  };
  const deactivate = (who: string, yy: number) => {
    const o = open.get(who);
    if (o?.length) bars[o.pop()!]!.end = yy + 4;
  };
  type Frame = { kind: string; text: string; top: number; bottom?: number; who: Set<string>; elses: { y: number; text: string }[]; kids: Frame[]; selfRoom: number };
  const frames: Frame[] = [], fstack: Frame[] = [];
  const touch = (...who: string[]) => { for (const f of fstack) for (const w of who) f.who.add(w); };
  const msgs: string[] = [], notes: string[] = [];
  n = 0;
  for (const e of evs) {
    if (e.t === 'number') { n = 1; continue; }
    if (e.t === 'act') { activate(e.who, last); continue; }
    if (e.t === 'deact') { deactivate(e.who, last); continue; }
    if (e.t === 'open') {
      const f: Frame = { kind: e.kind, text: e.text, top: y - 24, who: new Set(), elses: [], kids: [], selfRoom: 0 };
      (fstack.length ? fstack[fstack.length - 1]!.kids : frames).push(f);
      fstack.push(f);
      y += 32;
      continue;
    }
    if (e.t === 'else') {
      const f = fstack[fstack.length - 1];
      if (f) { f.elses.push({ y: y - 24, text: e.text }); y += 32; }
      continue;
    }
    if (e.t === 'close') { const f = fstack.pop()!; f.bottom = y - 32; y += 8; continue; }
    if (e.t === 'note') {
      const s = ctx.fit('rect', e.text, { w: 96, h: 32 });
      const xs = e.who.map(lx);
      let x: number, w = s.w;
      if (e.where === 'left of') x = xs[0]! - 16 - w;
      else if (e.where === 'right of') x = xs[0]! + 16;
      else { const a = Math.min(...xs), b = Math.max(...xs); w = Math.max(w, b - a + 64); x = (a + b) / 2 - w / 2; }
      x = Math.round(x / 4) * 4;
      notes.push(`${ctx.fresh('note')}: ${ctx.pick('sticky', 'rect')} ${q(s.text)} at ${x},${y - 20} ${w}x${s.h} title.size=11 title.weight=400 overlap=ok`);
      touch(...e.who);
      y += s.h + 24;
      last = y - 56;
      continue;
    }
    // a message
    const text = n ? `${n++}. ${e.text}` : e.text;
    const self = e.from === e.to;
    if (e.act === '+') { /* the bar starts after the message arrives */ }
    const end = (who: string, other: number, yy: number) => {
      const b = barAt(who, yy);
      if (b) return `${b.id}.${other < lx(who) ? 'left' : 'right'}@${yy}`;
      return `${parts.get(who)!.id}_l@${yy}`;
    };
    const dotted = e.arrow.startsWith('--') || e.arrow.startsWith('<<--');
    const head = e.arrow.endsWith('x') ? ' head=cross' : e.arrow.endsWith(')') ? ' head=open' : /^-+>$/.test(e.arrow) ? ' head=none' : '';
    const op = e.arrow.startsWith('<<') ? '<->' : '->';
    const style = dotted ? ' style=return' : '';
    const label = text ? ' ' + q(text) : '';
    touch(e.from, e.to);
    if (self) {
      const x = lx(e.from), b = barAt(e.from, y), side = b ? `${b.id}.right` : '';
      if (b) msgs.push(`${side}@${y} ${op} ${side}@${y + 32}${label}${style}${head} loop=36`);
      else msgs.push(`${parts.get(e.from)!.id}_l@${y} ${op} ${parts.get(e.from)!.id}_l@${y + 32}${label}${style}${head} via=${x + 36},${y};${x + 36},${y + 32}${text ? ` lpos=${Math.round(x + 44 + ctx.labelW(text) / 2)},${y + 20}` : ''}`);
      for (const f of fstack) if (e.from === list[list.length - 1]!.name || true) f.selfRoom = Math.max(f.selfRoom, ctx.labelW(text) + 48);
      if (e.act === '-') deactivate(e.from, y + 32);
      if (e.act === '+') activate(e.to, y + 32);
      last = y + 32; y += 32 + 56;
      continue;
    }
    // across more than one gap, the label goes in the first one, clear of the lifelines it passes
    const i0 = index.get(e.from)!, i1 = index.get(e.to)!;
    const lpos = text && Math.abs(i1 - i0) > 1 ? ` lpos=${Math.round((lx(e.from) + lx(list[i0 + Math.sign(i1 - i0)]!.name)) / 2)},${y - 10}` : '';
    msgs.push(`${end(e.from, lx(e.to), y)} ${op} ${end(e.to, lx(e.from), y)}${label}${style}${head}${lpos}`);
    if (e.act === '-') deactivate(e.from, y);
    if (e.act === '+') activate(e.to, y);
    last = y; y += 56;
  }
  const bottom = last + 24 + 16;
  for (const b of bars) if (b.end === undefined) b.end = last + 16;

  // frames, outermost first (zones are drawn behind, in file order), each a little wider than what it holds
  const allX = list.map((p) => lx(p.name));
  const extent = (f: Frame): [number, number] => {
    const xs = f.who.size ? [...f.who].map(lx) : allX;
    let a = Math.min(...xs) - 72, b = Math.max(...xs) + Math.max(72, f.selfRoom);
    for (const k of f.kids) { const [ka, kb] = extent(k); a = Math.min(a, ka - 12); b = Math.max(b, kb + 12); }
    return [a, b];
  };
  const out: string[] = [];
  const draw = (f: Frame) => {
    const [a, b] = extent(f);
    const x = Math.round(a / 4) * 4, w = Math.round((b - a) / 4) * 4;
    const cap = [f.kind, f.text ? `[${f.text}]` : ''].filter(Boolean).join(' ');
    const fid = ctx.fresh(f.kind);
    out.push(`${fid}: ${ctx.pick('zone', 'rect')}${f.kind === 'rect' ? '' : ' ' + q(cap)} at ${x},${f.top} ${w}x${f.bottom! - f.top}`);
    for (const el of f.elses) {
      out.push(`${x},${el.y} -- ${x + w},${el.y} style=${ctx.pick('rule', 'line')} dash=4,4`);
      if (el.text) out.push(`text ${q(`[${el.text}]`)} at ${x + 12},${el.y + 16} style=${ctx.pick('caption', 'text')}`);
    }
    f.kids.forEach(draw);
  };
  frames.forEach(draw);
  for (const bx of boxes) {
    const xs = bx.who.map(lx);
    if (!xs.length) continue;
    const a = Math.min(...xs) - widest / 2 - 16, b = Math.max(...xs) + widest / 2 + 16;
    out.unshift(`${ctx.fresh('box')}: ${ctx.pick('zone', 'rect')}${bx.title ? ' ' + q(bx.title) : ''} at ${a},${top - 32} ${b - a}x${bottom - top + 32 + 8}`);
  }
  ctx.out.unshift(...out);
  // lifelines run behind notes and bars
  for (const p of list) ctx.push(`${p.id}_l: ${p.id}.bottom -- +0,${bottom - top - boxH} style=${ctx.pick('lifeline', 'line')} layer=back`);
  for (const b of bars) ctx.push(`${b.id}: ${ctx.pick('bar', 'rect')} at ${lx(b.who) - 4 + 4 * b.depth},${b.start} 8x${Math.max(8, b.end! - b.start)}${b.depth ? ' overlap=ok' : ''}`);
  ctx.push(...notes, ...msgs);
}

// ---------------------------------------------------------------------------------------------------------------
// ER diagrams: entities as tables, relationships with crow's-foot ends

// crow's-foot ends, written either way round, or in words (CAR 1 to zero or more DRIVER)
const CARD: Record<string, string> = { '|o': 'zero-one', 'o|': 'zero-one', '||': 'only-one', '}o': 'zero-many', 'o{': 'zero-many', '}|': 'one-many', '|{': 'one-many' };
const CARD_WORDS: Record<string, string> = {
  'only one': 'only-one', '1': 'only-one', 'one or zero': 'zero-one', 'zero or one': 'zero-one', 'one or more': 'one-many', 'one or many': 'one-many',
  'many(1)': 'one-many', '1+': 'one-many', 'zero or more': 'zero-many', 'zero or many': 'zero-many', 'many(0)': 'zero-many', '0+': 'zero-many',
};
const WORDS_RE = Object.keys(CARD_WORDS).sort((a, b) => b.length - a.length).map((w) => w.replace(/[()+]/g, '\\$&')).join('|');

function er(ctx: Ctx, body: Line[]) {
  type Ent = { name: string; label: string; rows: { name: string; type: string; keys: string[]; note: string }[] };
  const ents = new Map<string, Ent & { group: string | null }>(), rels: { a: string; b: string; ta: string; tb: string; dashed: boolean; label: string }[] = [];
  const groups = new Map<string, LayoutGroup & { title: string }>(), stack: string[] = [];
  let dir: Dir = 'TB', cur: Ent | null = null;
  const ent = (raw: string): Ent => {
    const r = raw.trim().replace(/:::[\w-]+$/, '');
    const m = /^("[^"]*"|[^[\s]+)(?:\s*\[\s*"?(.*?)"?\s*\])?$/.exec(r);
    const name = unquote(m?.[1] ?? r);
    const g = stack[stack.length - 1] ?? null;
    let e = ents.get(name);
    if (!e) { e = { name, label: clean(name), rows: [], group: g }; ents.set(name, e); }
    else if (g && !e.group) e.group = g;
    if (m?.[2]) e.label = clean(m[2]);
    return e;
  };
  const tok = '(\\|o|o\\||\\|\\||\\}o|o\\{|\\}\\||\\|\\{)';
  const card = new RegExp(`${tok}(--|\\.\\.)${tok}`);
  const words = new RegExp(`^(.+?)\\s+(${WORDS_RE})\\s+(to|optionally to)\\s+(${WORDS_RE})\\s+("[^"]*"|[^\\s:]+(?::::[\\w-]+)?)\\s*:\\s*(.+)$`);
  for (const st of body) {
    let t = st.text, m: RegExpExecArray | null;
    if (cur) {
      if (t.startsWith('}')) { cur = null; continue; }
      const close = t.endsWith('}');
      if (close) t = t.slice(0, -1).trim();
      if ((m = /^([^\s]+)\s+([^\s"]+)((?:\s+(?:PK|FK|UK)\s*,?)*)\s*(?:"(.*)")?$/.exec(t))) {
        cur.rows.push({ type: m[1]!.replace(/~(\w+)~/g, '<$1>'), name: m[2]!, keys: (m[3] ?? '').split(/[\s,]+/).filter(Boolean), note: m[4] ?? '' });
      } else if (t) throw new MermaidError(`could not read the attribute "${t}" of ${cur.name}`, st.line);
      if (close) cur = null;
      continue;
    }
    if ((m = /^direction\s+(\w+)$/.exec(t))) {
      const d = DIR[m[1]!.toUpperCase()], g = stack[stack.length - 1];
      if (d && g) groups.get(g)!.dir = d; else if (d) dir = d;
      continue;
    }
    if (/^(classDef|class|style)\s/.test(t)) { ctx.notes.push('colours from classDef, class and style lines are left to the look'); continue; }
    if ((m = /^subgraph\b\s*(.*)$/.exec(t))) {
      const r = m[1]!.trim(), mi = /^([^\s[\]"]+)\s*\[(.*)\]$/.exec(r);
      const id = mi ? mi[1]! : r || `subgraph ${groups.size + 1}`, title = clean(mi ? mi[2]! : r);
      groups.set(id, { id, parent: stack[stack.length - 1] ?? null, title });
      stack.push(id);
      continue;
    }
    if (t === 'end') { stack.pop(); continue; }
    if ((m = new RegExp(`^(.+?)\\s*${card.source}\\s*("[^"]*"|[^\\s:]+(?::::[\\w-]+)?)\\s*:\\s*(.+)$`).exec(t))) {
      const a = ent(m[1]!), b = ent(m[5]!);
      rels.push({ a: a.name, b: b.name, ta: CARD[m[2]!]!, tb: CARD[m[4]!]!, dashed: m[3] === '..', label: clean(m[6]!) });
      continue;
    }
    if ((m = words.exec(t))) {
      const a = ent(m[1]!), b = ent(m[5]!);
      rels.push({ a: a.name, b: b.name, ta: CARD_WORDS[m[2]!]!, tb: CARD_WORDS[m[4]!]!, dashed: m[3] !== 'to', label: clean(m[6]!) });
      continue;
    }
    if ((m = /^(.+?)\s*\{\s*(.*)$/.exec(t))) {
      cur = ent(m[1]!);
      const rest = m[2]!.trim();
      if (rest) for (const part of rest.replace(/\}\s*$/, '').split(/\s{2,}|;/).filter((s) => s.trim())) {
        const a = /^([^\s]+)\s+([^\s"]+)((?:\s+(?:PK|FK|UK)\s*,?)*)\s*(?:"(.*)")?$/.exec(part.trim());
        if (a) cur.rows.push({ type: a[1]!, name: a[2]!, keys: (a[3] ?? '').split(/[\s,]+/).filter(Boolean), note: a[4] ?? '' });
      }
      if (/\}\s*$/.test(rest)) cur = null;
      continue;
    }
    if (/^[\w-]+(:::[\w-]+)?$|^"[^"]*"$/.test(t)) { ent(t); continue; }
    if (/^(accTitle|accDescr|title)\b/.test(t)) { const tm = /^title\s*:?\s*(.+)$/.exec(t); if (tm) ctx.title ??= clean(tm[1]!); continue; }
    throw new MermaidError(`could not read "${t}"`, st.line);
  }
  // a relationship to a subgraph's name ends on the subgraph
  for (const g of groups.keys()) if (ents.get(g)?.rows.length === 0) ents.delete(g);
  const ids = new Map([...ents.keys()].map((k) => [k, ctx.id(k)]));
  for (const g of groups.keys()) if (!ids.has(g)) ids.set(g, ctx.id('\u0001' + g));
  const rowsOf = (e: Ent) => {
    const notes = e.rows.some((r) => r.note);
    return e.rows.map((r) => {
      const pre = r.keys.includes('PK') ? '# ' : r.keys.includes('FK') ? '→ ' : '';
      const uk = r.keys.includes('UK') ? ' (unique)' : '';
      return `| ${q(pre + r.name + uk)} ${q(r.type)}${notes ? ' ' + q(r.note) : ''}`;
    });
  };
  const sizes = new Map([...ents.values()].map((e) => [e.name, ctx.tableSize(e.label, rowsOf(e), 200)]));
  const lay = layered({
    nodes: [...ents.values()].map((e) => ({ id: e.name, ...sizes.get(e.name)!, group: e.group })),
    edges: rels.map((r) => ({ from: r.a, to: r.b, label: r.label ? { w: ctx.labelW(r.label), h: 20 } : undefined })),
    groups: [...groups.values()], dir, rankGap: 80, sibGap: 104, pad: { top: 40, side: 24, bottom: 24 },
  });
  const top = ctx.titleTop();
  const box = (id: string) => { const b = lay.boxes.get(id)!; return { x: b.x + 40, y: b.y + top, w: b.w, h: b.h }; };
  for (const g of groups.values()) ctx.push(`${ids.get(g.id)}: ${ctx.pick('zone', 'rect')}${g.title ? ' ' + q(g.title) : ''} ${at(box(g.id))}`);
  for (const e of ents.values()) {
    const b = box(e.name);
    ctx.push(`${ids.get(e.name)}: table ${q(e.label)} at ${b.x},${b.y} ${b.w}x0`, ...rowsOf(e).map((r) => `  ${r}`));
  }
  for (const r of rels) {
    const self = r.a === r.b;
    const rest = `${r.label ? ' ' + q(r.label) : ''} style=${ctx.pick('arrow', 'line')} tail=${r.ta} head=${r.tb}${r.dashed ? ' dash=4,3' : ''}`;
    if (self) ctx.push(`${ids.get(r.a)}.right@0.3 -- ${ids.get(r.b)}.right@0.7${rest} loop=28`);
    else ctx.edge((a, b, x) => `${ids.get(r.a)}${a} -- ${ids.get(r.b)}${b}${rest}${x}`, stacked(dir, box(r.a), box(r.b)), !!r.label);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// State diagrams

function state(ctx: Ctx, body: Line[]) {
  type St = { name: string; label: string; desc: string[]; kind: 'state' | 'start' | 'end' | 'choice' | 'fork' | 'join'; group: string | null };
  const states = new Map<string, St>(), groups = new Map<string, LayoutGroup & { title: string }>(), trans: { from: string; to: string; label: string }[] = [];
  const stack: string[] = [];
  let dir: Dir = 'TB';
  const scope = () => stack[stack.length - 1] ?? null;
  const st = (raw: string, role: 'from' | 'to'): string => {
    let name = raw.trim().replace(/:::[\w-]+$/, '');
    if (name === '[*]') {
      const sc = scope() ?? 'root';
      name = `${role === 'from' ? 'start' : 'end'} ${sc}`;
      if (!states.has(name)) states.set(name, { name, label: '', desc: [], kind: role === 'from' ? 'start' : 'end', group: scope() });
      return name;
    }
    if (groups.has(name)) return name;
    if (!states.has(name)) states.set(name, { name, label: name, desc: [], kind: 'state', group: scope() });
    return name;
  };
  let note: Line | null = null;
  for (const l of body) {
    const t = l.text;
    let m: RegExpExecArray | null;
    if (note) { if (/^end\s+note$/i.test(t)) note = null; continue; }
    if (/^note\s/i.test(t)) { ctx.notes.push('notes are left out'); if (!/:/.test(t)) note = l; continue; }
    if ((m = /^direction\s+(\w+)$/.exec(t))) { const d = DIR[m[1]!.toUpperCase()]; if (d) { const g = scope(); if (g) groups.get(g)!.dir = d; else dir = d; } continue; }
    if ((m = /^state\s+"([^"]*)"\s+as\s+([\w-]+)\s*(\{)?$/.exec(t)) || (m = /^state\s+([\w-]+)\s+as\s+"([^"]*)"\s*(\{)?$/.exec(t))) {
      const [label, name] = /^state\s+"/.test(t) ? [m[1]!, m[2]!] : [m[2]!, m[1]!];
      if (m[3]) { groups.set(name, { id: name, parent: scope(), title: clean(label) }); stack.push(name); }
      else { st(name, 'to'); states.get(name)!.label = clean(label); }
      continue;
    }
    if ((m = /^state\s+([\w-]+)\s*<<(choice|fork|join)>>$/.exec(t))) { st(m[1]!, 'to'); states.get(m[1]!)!.kind = m[2] as St['kind']; continue; }
    if ((m = /^state\s+([\w-]+)\s*\{$/.exec(t))) { groups.set(m[1]!, { id: m[1]!, parent: scope(), title: m[1]! }); stack.push(m[1]!); continue; }
    if (t === '}') { stack.pop(); continue; }
    if (t === '--' || t === '||') { ctx.notes.push('concurrent regions (--) are drawn as one'); continue; }
    if ((m = /^(.+?)\s*-->\s*(.+?)(?:\s*:\s*(.*))?$/.exec(t))) {
      trans.push({ from: st(m[1]!, 'from'), to: st(m[2]!, 'to'), label: m[3] ? clean(m[3]) : '' });
      continue;
    }
    if (/^(accTitle|accDescr)\b/.test(t)) continue;
    if ((m = /^([\w-]+)\s*:\s*(.+)$/.exec(t))) { st(m[1]!, 'to'); states.get(m[1]!)?.desc.push(clean(m[2]!)); continue; }
    if (/^(classDef|class|style)\s/.test(t)) { ctx.notes.push('colours from classDef, class and style lines are left to the look'); continue; }
    if (/^(accTitle|accDescr)\b/.test(t)) continue;
    if ((m = /^([\w-]+)$/.exec(t))) { st(m[1]!, 'to'); continue; }
    throw new MermaidError(`could not read "${t}"`, l.line);
  }
  // a composite state that is also named as a plain state is the composite
  for (const g of groups.keys()) states.delete(g);
  const nodeStyle = ctx.pick('node', 'rect');
  const across = (g: string | null) => ((g ? groups.get(g)!.dir : undefined) ?? dir) === 'LR' || ((g ? groups.get(g)!.dir : undefined) ?? dir) === 'RL';
  const drawn = new Map<string, { line: string[]; w: number; h: number }>();
  for (const s of states.values()) {
    const id = ctx.id(s.name);
    if (s.kind === 'start') drawn.set(s.name, { w: 16, h: 16, line: [`${id}: ellipse AT 16x16 fill=ink stroke=none`] });
    else if (s.kind === 'end') drawn.set(s.name, { w: 16, h: 16, line: [`${id}: ellipse AT 16x16 fill=none stroke=ink`, `ellipse AT+3 10x10 fill=ink stroke=none overlap=ok`] });
    else if (s.kind === 'choice') drawn.set(s.name, { w: 32, h: 32, line: [`${id}: diamond AT 32x32`] });
    else if (s.kind === 'fork' || s.kind === 'join') {
      const [w, h] = across(s.group) ? [8, 96] : [96, 8];
      drawn.set(s.name, { w, h, line: [`${id}: rect AT ${w}x${h} fill=ink stroke=none`] });
    } else {
      const f = ctx.fit(nodeStyle, s.label, { w: 160, h: s.desc.length ? 80 : 64 });
      const sub = s.desc.length ? ` sub=${q(s.desc.join('\n'))}` : '';
      const h = Math.max(f.h, s.desc.length ? 56 + 14 * s.desc.length : 0);
      drawn.set(s.name, { w: f.w, h, line: [`${id}: ${nodeStyle} ${q(f.text)}${sub} AT ${f.w}x${h} radius=8`] });
    }
  }
  const lay = layered({
    nodes: [...states.values()].map((s) => ({ id: s.name, w: drawn.get(s.name)!.w, h: drawn.get(s.name)!.h, group: s.group })),
    edges: trans.map((t) => ({ from: t.from, to: t.to, label: t.label ? { w: ctx.labelW(t.label), h: 20 } : undefined })),
    groups: [...groups.values()], dir, rankGap: 56, sibGap: 64, pad: { top: 40, side: 24, bottom: 24 },
  });
  const top = ctx.titleTop();
  const box = (id: string) => { const b = lay.boxes.get(id)!; return { x: b.x + 40, y: b.y + top, w: b.w, h: b.h }; };
  for (const g of groups.values()) ctx.push(`${ctx.id(g.id)}: ${ctx.pick('zone', 'rect')} ${q(g.title)} ${at(box(g.id))}`);
  for (const s of states.values()) {
    const b = box(s.name);
    for (const l of drawn.get(s.name)!.line) ctx.push(l.replace('AT+3', `at ${b.x + 3},${b.y + 3}`).replace('AT', `at ${b.x},${b.y}`));
  }
  for (const t of trans) {
    const self = t.from === t.to;
    const g = states.get(t.from)?.group ?? null;
    const [sa, sb] = self ? ['.top@0.3', '.top@0.7'] : sides((g ? groups.get(g)!.dir : undefined) ?? dir, box(t.from), box(t.to));
    const rest = t.label ? ' ' + q(t.label) : '';
    if (self) ctx.push(`${ctx.id(t.from)}${sa} -> ${ctx.id(t.to)}${sb}${rest} loop=28`);
    else ctx.edge((a, b, x) => `${ctx.id(t.from)}${a} -> ${ctx.id(t.to)}${b}${rest}${x}`, [sa, sb], !!t.label);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Class diagrams: classes as tables (members, a rule, methods), relationships by their UML ends

function classes(ctx: Ctx, body: Line[]) {
  type Cls = { name: string; label: string; stereo: string; attrs: string[]; ops: string[]; group: string | null };
  const cls = new Map<string, Cls>(), rels: { a: string; b: string; ea: string; eb: string; dashed: boolean; label: string; ca: string; cb: string }[] = [];
  const groups = new Map<string, LayoutGroup & { title: string }>();
  const stack: string[] = [];
  let dir: Dir = 'TB', cur: Cls | null = null;
  const generic = (s: string) => s.replace(/~([^~]*)~/g, '<$1>');
  const get = (raw: string): Cls => {
    const m = /^(`[^`]+`|[^`\s[~]+)(~[^~]*~)?(?:\s*\[\s*"?(.*?)"?\s*\])?$/.exec(raw.trim().replace(/:::[\w-]+$/, ''));
    if (m) m[1] = m[1]!.replace(/^`|`$/g, '');
    const name = m?.[1] ?? raw.trim();
    let c = cls.get(name);
    if (!c) { c = { name, label: generic(name + (m?.[2] ?? '')), stereo: '', attrs: [], ops: [], group: stack[stack.length - 1] ?? null }; cls.set(name, c); }
    if (m?.[3]) c.label = m[3];
    return c;
  };
  const member = (c: Cls, raw: string) => {
    let s = generic(raw.trim()).replace(/[$*]$/, '').replace(/\)\s*[$*]/, ')');
    if (/^<<.*>>$/.test(s)) { c.stereo = s.slice(2, -2).trim(); return; }
    const vis = /^[+\-#~]/.test(s) ? s[0] + ' ' : '';
    if (vis) s = s.slice(1).trim();
    if (s.includes('(')) {
      const m = /^(.*?\))\s*(.*)$/.exec(s)!;
      c.ops.push(vis + m[1]!.replace(/[$*]$/, '') + (m[2] ? `: ${m[2].replace(/^:\s*/, '')}` : ''));
    } else {
      const m = /^(\S+)\s+(\S+)$/.exec(s);
      c.attrs.push(vis + (m && !s.includes(':') ? `${m[2]}: ${m[1]}` : s));
    }
  };
  // the ends of a relationship; () is a lollipop, an interface the class offers
  const END_A: Record<string, string> = { '<|': 'triangle', '*': 'diamond-solid', o: 'diamond', '<': 'open', '()': 'circle', '': 'none' };
  const END_B: Record<string, string> = { '|>': 'triangle', '*': 'diamond-solid', o: 'diamond', '>': 'open', '()': 'circle', '': 'none' };
  const relRe = /^(`[^`]+`|\S+?)\s*(?:"([^"]*)"\s*)?(<\||\*|o(?=[-.])|<|\(\))?(--|\.\.)(\|>|\*|o(?=\s)|>|\(\))?\s*(?:"([^"]*)"\s*)?(`[^`]+`|\S+?)\s*(?::\s*(.*))?$/;
  for (const l of body) {
    let t = l.text, m: RegExpExecArray | null;
    if (cur) {
      if (t.startsWith('}')) { cur = null; continue; }
      const close = t.endsWith('}');
      if (close) t = t.slice(0, -1).trim();
      if (t) member(cur, t);
      if (close) cur = null;
      continue;
    }
    if ((m = /^direction\s+(\w+)$/.exec(t))) { dir = DIR[m[1]!.toUpperCase()] ?? dir; continue; }
    if ((m = /^namespace\s+([\w.-]+)\s*(?:\[\s*"?(.*?)"?\s*\])?\s*\{$/.exec(t))) { groups.set(m[1]!, { id: `ns ${m[1]}`, parent: stack[stack.length - 1] ?? null, title: m[2] ? clean(m[2]) : m[1]! }); stack.push(`ns ${m[1]}`); continue; }
    if (t === '}') { stack.pop(); continue; }
    if ((m = /^class\s+(.+?)\s*\{\s*(.*)$/.exec(t))) {
      cur = get(m[1]!.replace(/:::[\w-]+$/, ''));
      const rest = m[2]!.trim();
      if (rest && rest !== '}') { member(cur, rest.replace(/\}$/, '')); }
      if (rest.endsWith('}')) cur = null;
      continue;
    }
    if ((m = /^class\s+(.+)$/.exec(t))) { get(m[1]!.replace(/:::[\w-]+$/, '')); continue; }
    if ((m = /^<<(.+?)>>\s*(\S+)$/.exec(t))) { get(m[2]!).stereo = m[1]!.trim(); continue; }
    if ((m = /^(\S+)\s*:\s*(.+)$/.exec(t)) && !/(--|\.\.)/.test(m[1]!)) { member(get(m[1]!), m[2]!); continue; }
    if (/^note\b/.test(t)) { ctx.notes.push('notes are left out'); continue; }
    if (/^(classDef|cssClass|style|click|callback|link)\s/.test(t)) { ctx.notes.push('styles and click lines are left to the look'); continue; }
    if (/^(accTitle|accDescr)\b/.test(t)) continue;
    if ((m = relRe.exec(t))) {
      const a = get(m[1]!), b = get(m[7]!);
      rels.push({ a: a.name, b: b.name, ea: END_A[m[3] ?? '']!, eb: END_B[m[5] ?? '']!, dashed: m[4] === '..', label: m[8] ? clean(m[8]) : '', ca: m[2] ?? '', cb: m[6] ?? '' });
      continue;
    }
    throw new MermaidError(`could not read "${t}"`, l.line);
  }
  const ids = new Map([...cls.keys()].map((k) => [k, ctx.id(k)]));
  const head = (c: Cls) => (c.stereo ? `«${c.stereo}»\n${c.label}` : c.label);
  const rowsOf = (c: Cls) => [...c.attrs.map((a) => `| ${q(a)}`), ...(c.attrs.length && c.ops.length ? ['| ---'] : []), ...c.ops.map((o) => `| ${q(o)}`)];
  const sizes = new Map([...cls.values()].map((c) => [c.name, ctx.tableSize(head(c), rowsOf(c), 160)]));
  // parents above their children: a line is laid out from the end with the triangle
  const lay = layered({
    nodes: [...cls.values()].map((c) => ({ id: c.name, ...sizes.get(c.name)!, group: c.group })),
    edges: rels.map((r) => (r.ea === 'triangle' || r.ea === 'diamond' || r.ea === 'diamond-solid' || (r.eb !== 'triangle' && r.eb !== 'diamond' && r.eb !== 'diamond-solid'))
      ? { from: r.a, to: r.b } : { from: r.b, to: r.a }).map((e, i) => ({ ...e, label: rels[i]!.label || rels[i]!.ca || rels[i]!.cb ? { w: ctx.labelW(relLabel(rels[i]!)), h: 20 } : undefined })),
    groups: [...groups.values()], dir, rankGap: 72, sibGap: 96, pad: { top: 40, side: 24, bottom: 24 },
  });
  const top = ctx.titleTop();
  const box = (id: string) => { const b = lay.boxes.get(id)!; return { x: b.x + 40, y: b.y + top, w: b.w, h: b.h }; };
  for (const g of groups.values()) ctx.push(`${ctx.id(g.id)}: ${ctx.pick('zone', 'rect')} ${q(g.title)} ${at(box(g.id))}`);
  for (const c of cls.values()) ctx.push(`${ids.get(c.name)}: table ${q(head(c))} ${at({ ...box(c.name), h: 0 })}`, ...rowsOf(c).map((r) => `  ${r}`));
  for (const r of rels) {
    const label = relLabel(r);
    const props = [`style=${r.dashed ? ctx.pick('return', 'arrow') : ctx.pick('arrow', 'line')}`];
    if (r.ea !== 'none') props.push(`tail=${r.ea}`);
    if (r.eb !== 'none') props.push(`head=${r.eb}`);
    if (r.a === r.b) props.push('loop=28');
    const rest = `${label ? ' ' + q(label) : ''} ${props.join(' ')}`;
    if (r.a === r.b) ctx.push(`${ids.get(r.a)}.right@0.3 -- ${ids.get(r.b)}.right@0.7${rest}`);
    else ctx.edge((a, b, x) => `${ids.get(r.a)}${a} -- ${ids.get(r.b)}${b}${rest}${x}`, stacked(dir, box(r.a), box(r.b)), !!label);
  }
}
// Tables one above the other are joined top to bottom (side by side, FastDraw picks the rows' edges itself).
function stacked(dir: Dir, a: Box, b: Box): [string, string] {
  if (dir === 'LR' || dir === 'RL') return ['', ''];
  if (b.y >= a.y + a.h) return ['.bottom', '.top'];
  if (a.y >= b.y + b.h) return ['.top', '.bottom'];
  return ['', ''];
}
const relLabel = (r: { label: string; ca: string; cb: string }) => {
  const card = r.ca || r.cb ? `${r.ca || '·'} to ${r.cb || '·'}` : '';
  return r.label && card ? `${r.label} (${card})` : r.label || card;
};
