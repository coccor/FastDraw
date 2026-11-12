// Tokenizer shared by diagram files and look files.
// A statement is one line plus any following indented lines.
// Comments: a line starting with "# " (or a bare "#"), or anything after "//".

export type Tok = { t: 'str' | 'word' | 'prop'; v: string; k?: string };
export type Stmt = { line: number; end: number; toks: Tok[] };

export function stripComment(s: string): string {
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && inQ) { i++; continue; }
    if (c === '"') inQ = !inQ;
    else if (!inQ && c === '/' && s[i + 1] === '/') return s.slice(0, i);
  }
  return s;
}

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && /\s/.test(s[i])) i++;
    if (i >= n) break;
    const startsQuoted = s[i] === '"';
    let buf = '';
    let inQ = false;
    while (i < n && (inQ || !/\s/.test(s[i]))) {
      const c = s[i];
      if (c === '"') inQ = !inQ;
      else if (c === '\\' && inQ && i + 1 < n) { i++; buf += s[i] === 'n' ? '\n' : s[i]; }
      else buf += c;
      i++;
    }
    if (startsQuoted) { out.push({ t: 'str', v: buf }); continue; }
    const m = /^([A-Za-z][\w./-]*)=([\s\S]*)$/.exec(buf); // "/" so a legend key can carry a tint: swatch.muted/0.2=
    if (m) out.push({ t: 'prop', k: m[1], v: m[2] });
    else out.push({ t: 'word', v: buf });
  }
  return out;
}

export function parseStatements(src: string): Stmt[] {
  const stmts: Stmt[] = [];
  const lines = src.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed === '#' || trimmed.startsWith('# ')) return;
    const text = stripComment(raw);
    if (!text.trim()) return;
    const toks = tokenize(text);
    if (/^\s/.test(raw) && stmts.length) { const last = stmts[stmts.length - 1]; last.toks.push(...toks); last.end = idx + 1; }
    else stmts.push({ line: idx + 1, end: idx + 1, toks });
  });
  return stmts;
}
