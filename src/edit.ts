// Text edits. The diagram file is the source of truth; every visual edit is a patch to the
// statement of the element that changed, so untouched lines stay byte-identical.
import { parseStatements, stripComment } from './parse.ts';
import type { Tok } from './parse.ts';

const OPS = ['->', '--', '<->'];
const SIZE = /^\d+(\.\d+)?x\d+(\.\d+)?$/;
const n = (v: number) => String(Math.round(v));

function quote(v: string): string {
  return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}

export function fmtTok(t: Tok): string {
  if (t.t === 'str') return quote(t.v);
  if (t.t === 'prop') return `${t.k}=${t.q || t.v === '' || /[\s"]/.test(t.v) ? quote(t.v) : t.v}`;
  return t.v;
}
// A table row ("|" or "|=") starts its own indented line, so tables stay readable after an edit.
const isRowStart = (t: Tok) => t.t === 'word' && (t.v === '|' || t.v === '|=');
export const fmtStmt = (toks: Tok[]) => toks.map((t, i) => (i === 0 ? '' : isRowStart(t) ? '\n  ' : ' ') + fmtTok(t)).join('');

export type RowSpec = { id?: string; kind: 'row' | 'head' | 'rule'; cells: string[]; vals?: string[]; p?: Record<string, string> };
// Replace all rows of a table statement.
export function setRows(toks: Tok[], rows: RowSpec[]): Tok[] {
  const i = toks.findIndex(isRowStart);
  const out = i >= 0 ? toks.slice(0, i) : toks;
  for (const r of rows) {
    out.push({ t: 'word', v: r.kind === 'head' ? '|=' : '|' });
    if (r.kind === 'rule') { out.push({ t: 'word', v: '---' }); continue; }
    if (r.id) out.push({ t: 'word', v: r.id });
    for (const c of r.cells) out.push({ t: 'str', v: c });
    for (const v of r.vals ?? []) out.push({ t: 'word', v });
    for (const [k, v] of Object.entries(r.p ?? {})) out.push({ t: 'prop', k, v });
  }
  return out;
}

// The cells of a row typed as "a | b | c". One space either side of a "|" belongs to the separator; any
// more is the cell's own, so an indented cell keeps its indentation. Spaces at the end of the row go.
export function splitCells(text: string): string[] {
  const parts = text.replace(/\s+$/, '').split('|');
  return parts.map((c, i) => (i > 0 ? c.replace(/^ /, '') : c).replace(i < parts.length - 1 ? / $/ : /\s+$/, ''));
}

export type Patch = (toks: Tok[]) => Tok[] | null; // null deletes the statement

// Apply patches keyed by the 1-based first line of a statement.
export function patchSource(src: string, patches: Map<number, Patch>): string {
  const lines = src.split('\n');
  const stmts = parseStatements(src).filter((s) => patches.has(s.line)).sort((a, b) => b.line - a.line);
  for (const st of stmts) {
    const next = patches.get(st.line)!(st.toks.map((t) => ({ ...t })));
    if (next === null) { lines.splice(st.line - 1, st.end - st.line + 1); continue; }
    const first = lines[st.line - 1];
    const comment = first.slice(stripComment(first).length);
    lines.splice(st.line - 1, st.end - st.line + 1, fmtStmt(next) + (comment ? ' ' + comment.trim() : ''));
  }
  return lines.join('\n');
}

export function appendStatements(src: string, stmts: string[]): string {
  const body = src.replace(/\s+$/, '');
  return (body ? body + '\n' : '') + stmts.join('\n') + '\n';
}

// Move a statement to the end of the file (drawn last within its group) or to just after the header.
export function moveStatement(src: string, line: number, where: 'front' | 'back'): string {
  const all = parseStatements(src);
  const st = all.find((s) => s.line === line);
  if (!st) return src;
  const lines = src.split('\n');
  const chunk = lines.splice(st.line - 1, st.end - st.line + 1);
  if (where === 'front') {
    const body = lines.join('\n').replace(/\s+$/, '');
    return body + '\n' + chunk.join('\n') + '\n';
  }
  const header = all.filter((s) => s !== st && s.toks[0].t === 'word' && (s.toks[0].v === 'look' || s.toks[0].v === 'canvas'));
  let at = header.length ? Math.max(...header.map((s) => s.end)) : 0;
  if (at >= st.line) at -= chunk.length;
  lines.splice(at, 0, ...chunk);
  return lines.join('\n');
}

// Move statements one past another: each move takes the statement starting at `line` and puts it just
// after (`where: 'after'`) or just before its `anchor` statement. Lines are those of `src`, before any
// move, and the moves apply in order, so moving several statements is one call.
export function moveStatementsPast(src: string, moves: { line: number; anchor: number; where: 'after' | 'before' }[]): string {
  const lines = src.split('\n');
  const stmts = parseStatements(src);
  // the file as segments: one per statement, one per line between statements (comments, blanks)
  const segs: { line: number; text: string[] }[] = [];
  let i = 1;
  for (const st of [...stmts].sort((a, b) => a.line - b.line)) {
    for (; i < st.line; i++) segs.push({ line: -1, text: [lines[i - 1]] });
    segs.push({ line: st.line, text: lines.slice(st.line - 1, st.end) });
    i = st.end + 1;
  }
  for (; i <= lines.length; i++) segs.push({ line: -1, text: [lines[i - 1]] });
  for (const m of moves) {
    const from = segs.findIndex((s) => s.line === m.line);
    if (from < 0 || m.line === m.anchor) continue;
    const [seg] = segs.splice(from, 1);
    const to = segs.findIndex((s) => s.line === m.anchor);
    if (to < 0) { segs.splice(from, 0, seg); continue; }
    segs.splice(m.where === 'after' ? to + 1 : to, 0, seg);
  }
  return segs.flatMap((s) => s.text).join('\n');
}

// ---- token helpers --------------------------------------------------------
const hasId = (toks: Tok[]) => toks[0]?.t === 'word' && toks[0].v.endsWith(':') && toks[0].v.length > 1;
const opIndex = (toks: Tok[]) => toks.findIndex((t) => t.t === 'word' && OPS.includes(t.v));
export const isConnector = (toks: Tok[]) => opIndex(toks) >= 0;
// Index after which positional parts (text, at, size) are inserted for an element statement.
function bodyStart(toks: Tok[]): number { return (hasId(toks) ? 1 : 0) + 1; }

export function setAt(toks: Tok[], x: number, y: number): Tok[] {
  const i = toks.findIndex((t) => t.t === 'word' && t.v === 'at');
  if (i >= 0 && toks[i + 1]) { toks[i + 1] = { t: 'word', v: `${n(x)},${n(y)}` }; return toks; }
  let at = bodyStart(toks);
  if (toks[at]?.t === 'str') at++;
  toks.splice(at, 0, { t: 'word', v: 'at' }, { t: 'word', v: `${n(x)},${n(y)}` });
  return toks;
}

export function setSize(toks: Tok[], w: number, h: number): Tok[] {
  const v = `${n(w)}x${n(h)}`;
  const i = toks.findIndex((t, k) => t.t === 'word' && SIZE.test(t.v) && k >= bodyStart(toks));
  if (i >= 0) { toks[i] = { t: 'word', v }; return toks; }
  const a = toks.findIndex((t) => t.t === 'word' && t.v === 'at');
  let at = a >= 0 ? a + 2 : bodyStart(toks) + (toks[bodyStart(toks)]?.t === 'str' ? 1 : 0);
  toks.splice(at, 0, { t: 'word', v });
  return toks;
}

export function setText(toks: Tok[], text: string): Tok[] {
  const r0 = toks.findIndex(isRowStart), lim = r0 >= 0 ? r0 : toks.length;
  const i = toks.findIndex((t, n) => n < lim && t.t === 'str');
  if (i >= 0) { if (text === '') toks.splice(i, 1); else toks[i] = { t: 'str', v: text }; return toks; }
  if (text === '') return toks;
  const op = opIndex(toks);
  toks.splice(op >= 0 ? op + 2 : bodyStart(toks), 0, { t: 'str', v: text });
  return toks;
}

export function setProp(toks: Tok[], k: string, v: string | null): Tok[] {
  const r0 = toks.findIndex(isRowStart), lim = r0 >= 0 ? r0 : toks.length; // a table's own properties come before its rows
  const i = toks.findIndex((t, n) => n < lim && t.t === 'prop' && t.k === k);
  if (v === null) { if (i >= 0) toks.splice(i, 1); return toks; }
  if (i >= 0) toks[i] = { t: 'prop', k, v, q: toks[i].q }; // written back quoted if it was
  else { const r = toks.findIndex(isRowStart); toks.splice(r >= 0 ? r : toks.length, 0, { t: 'prop', k, v }); }
  return toks;
}

// The style word of an element statement (the word after the id).
export function setKind(toks: Tok[], name: string): Tok[] {
  toks[bodyStart(toks) - 1] = { t: 'word', v: name };
  return toks;
}

export function setEnd(toks: Tok[], which: 'a' | 'b', raw: string): Tok[] {
  const op = opIndex(toks);
  if (op >= 0) toks[which === 'a' ? op - 1 : op + 1] = { t: 'word', v: raw };
  return toks;
}
export function setOp(toks: Tok[], op: string): Tok[] {
  const i = opIndex(toks);
  if (i >= 0) toks[i] = { t: 'word', v: op };
  return toks;
}

// A fresh id that no statement uses yet: base, base2, base3, ...
export function freshId(src: string, base: string): string {
  const used = new Set<string>();
  for (const s of parseStatements(src)) if (hasId(s.toks)) used.add(s.toks[0].v.slice(0, -1));
  const b = base.replace(/[^A-Za-z0-9_]/g, '') || 'el';
  if (!used.has(b)) return b;
  for (let i = 2; ; i++) if (!used.has(`${b}${i}`)) return `${b}${i}`;
}
