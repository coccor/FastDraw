// Geometry and reference checks. Messages are written for an agent to act on.
import type { Issue } from './look.ts';
import { textWidth } from './scene.ts';
import { segHits } from './router.ts';
import type { Scene, Box, Pt, Conn, Shape } from './scene.ts';

const num = (v: string | undefined, d: number) => (v === undefined || v === '' || isNaN(+v) ? d : +v);
const inter = (a: Box, b: Box, pad = 0) =>
  a.x + pad < b.x + b.w && b.x + pad < a.x + a.w && a.y + pad < b.y + b.h && b.y + pad < a.y + a.h;
const contains = (o: Box, i: Box) => i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h;
const hasPt = (b: Box, p: Pt) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

const inset = (b: Box, n: number): Box => ({ x: b.x + n, y: b.y + n, w: b.w - 2 * n, h: b.h - 2 * n });
const name = (c: Conn) => (c.id.startsWith('_') ? `${c.a.raw} ${c.head ? '->' : '--'} ${c.b.raw}` : c.id);
const tiny = (s: Box) => Math.min(s.w, s.h) <= 12;

export function check(sc: Scene): Issue[] {
  const out: Issue[] = [...sc.issues];
  const warn = (line: number, msg: string) => out.push({ line, level: 'warn', msg });
  const hint = (line: number, msg: string) => out.push({ line, level: 'hint', msg });
  const front = sc.shapes.filter((s) => !s.back);

  for (let i = 0; i < front.length; i++) for (let j = i + 1; j < front.length; j++) {
    const a = front[i], b = front[j];
    if (!inter(a, b, 0.5) || contains(a, b) || contains(b, a) || a.p.overlap === 'ok' || b.p.overlap === 'ok') continue;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    warn(b.line, `${b.id} overlaps ${a.id} by ${Math.round(Math.min(ox, oy))}px; move one of them`);
  }

  for (const s of front) {
    if (tiny(s)) continue;
    const off = s.shape !== 'polygon' && [s.x, s.y, s.w, s.h].some((v) => v % 4 !== 0);
    if (off) hint(s.line, `${s.id} is off the 4px grid (${s.x},${s.y} ${s.w}x${s.h}); use multiples of 4`);
    const p = s.p;
    if (s.text && p['title.pos'] !== 'top') {
      const size = num(p['title.size'], 12), room = (s.shape === 'diamond' || s.shape === 'ellipse' ? s.w * 0.72 : s.w - 16);
      for (const l of s.text.split('\n')) {
        const tw = textWidth(l, size, p['title.font'] ?? 'sans', num(p['title.weight'], 600), num(p['title.spacing'], 0));
        if (tw > room) warn(s.line, `text "${l}" (~${Math.round(tw)}px) does not fit in ${s.id} (${Math.round(room)}px of room); widen it or break the line with \\n`);
      }
    }
    if (p.sub) {
      const tw = textWidth(p.sub, num(p['sub.size'], 9), p['sub.font'] ?? 'mono', 400, 0);
      if (tw > s.w - 12) warn(s.line, `sub text "${p.sub}" (~${Math.round(tw)}px) does not fit in ${s.id} (${s.w - 12}px of room)`);
    }
  }

  const seen = new Set<string>();
  for (let i = 0; i < front.length; i++) for (let j = i + 1; j < front.length; j++) {
    const a = front[i], b = front[j];
    if (tiny(a) || tiny(b) || contains(a, b) || contains(b, a)) continue;
    const pairs: [string, number, number][] = [
      ['top edges', a.y, b.y], ['vertical centres', a.y + a.h / 2, b.y + b.h / 2],
      ['left edges', a.x, b.x], ['horizontal centres', a.x + a.w / 2, b.x + b.w / 2],
    ];
    for (const [what, va, vb] of pairs) {
      const d = Math.abs(va - vb);
      if (d > 0 && d <= 3 && !seen.has(a.id + b.id)) {
        seen.add(a.id + b.id);
        hint(b.line, `${b.id} and ${a.id} have ${what} ${d}px apart; line them up?`);
      }
    }
  }

  for (const c of sc.conns) {
    const hit = new Set<string>();
    for (let i = 0; i < c.pts.length - 1; i++) {
      const A = c.pts[i], B = c.pts[i + 1];
      if (c.ortho && A.x !== B.x && A.y !== B.y) warn(c.line, `${name(c)} has a diagonal segment (${A.x},${A.y} to ${B.x},${B.y}); fix the via points so each step is horizontal or vertical`);
      for (const s of front) {
        if (c.p.layer === 'back') break; // a grid line or guide meant to run behind the boxes
        if (s.id === c.a.id || s.id === c.b.id || tiny(s) || hit.has(s.id)) continue;
        if (hasPt(s, c.pts[0]) || hasPt(s, c.pts[c.pts.length - 1])) continue;
        if (segHits(A, B, inset(s, 1))) { hit.add(s.id); warn(c.line, `${name(c)} passes through ${s.id}; route around it with from=/to= sides or via=x,y`); }
      }
    }
    const first = c.pts[0], last = c.pts[c.pts.length - 1];
    for (const p of [first, last]) if (p.x < 0 || p.y < 0 || p.x > sc.w || p.y > sc.h) { warn(c.line, `${name(c)} ends outside the canvas (${sc.w}x${sc.h})`); break; }
    const l = c.label;
    if (!l) continue;
    for (const s of front) if (!tiny(s) && inter(l, s, 1)) warn(c.line, `label "${l.text}" of ${name(c)} collides with ${s.id}; shorten it, move things apart, or place it with lpos=x,y or lside=below|left`);
    for (const z of sc.shapes) {
      if (!z.back || !inter(l, z, 0) || contains(z, l)) continue;
      warn(c.line, `label "${l.text}" of ${name(c)} sits on the border of ${z.id}; place it on a clear stretch of the line with lpos=x,y`);
    }
    for (let i = 0; i < c.pts.length - 1; i++) {
      if (segHits(c.pts[i], c.pts[i + 1], inset(l, 1))) { warn(c.line, `label "${l.text}" of ${name(c)} sits on its own line; move it with lpos=x,y or lside=`); break; }
    }
    for (const o of sc.conns) {
      if (o === c) continue;
      if (o.label && o.line > c.line && inter(l, o.label, 0)) warn(o.line, `labels "${o.label.text}" and "${l.text}" overlap; move one with lpos=x,y or lside=`);
      for (let i = 0; i < o.pts.length - 1; i++) {
        if (segHits(o.pts[i], o.pts[i + 1], inset(l, 1))) { warn(c.line, `label "${l.text}" of ${name(c)} sits on the line ${name(o)}; move it with lpos=x,y or lside=`); break; }
      }
    }
    const segLen = Math.max(...c.pts.slice(1).map((p, i) => Math.abs(p.x - c.pts[i].x) + Math.abs(p.y - c.pts[i].y)));
    const A = c.pts[0];
    if (!c.p.lpos && c.pts.every((p) => p.y === A.y) && l.w > segLen - 8) warn(c.line, `label "${l.text}" (${l.w}px) is wider than its line (${Math.round(segLen)}px); shorten the label or give the line more room`);
  }

  for (let i = 0; i < sc.conns.length; i++) for (let j = i + 1; j < sc.conns.length; j++) {
    const a = sc.conns[i], b = sc.conns[j];
    // lines that leave from, or arrive at, the very same point share a trunk on purpose (a tree, a fan-in)
    const same = (p: Pt, q: Pt) => p.x === q.x && p.y === q.y;
    if (same(a.pts[0], b.pts[0]) || same(a.pts[a.pts.length - 1], b.pts[b.pts.length - 1])) continue;
    let done = false;
    for (let m = 0; m < a.pts.length - 1 && !done; m++) for (let n = 0; n < b.pts.length - 1 && !done; n++) {
      const [A, B, C, D] = [a.pts[m], a.pts[m + 1], b.pts[n], b.pts[n + 1]];
      const ah = A.y === B.y, av = A.x === B.x, bh = C.y === D.y, bv = C.x === D.x;
      let ov = 0, gap = Infinity;
      if (ah && bh && !(av || bv)) { ov = Math.min(Math.max(A.x, B.x), Math.max(C.x, D.x)) - Math.max(Math.min(A.x, B.x), Math.min(C.x, D.x)); gap = Math.abs(A.y - C.y); }
      else if (av && bv && !(ah || bh)) { ov = Math.min(Math.max(A.y, B.y), Math.max(C.y, D.y)) - Math.max(Math.min(A.y, B.y), Math.min(C.y, D.y)); gap = Math.abs(A.x - C.x); }
      if (ov > 4 && gap < 1) { warn(b.line, `${name(b)} runs on top of ${name(a)} for ${Math.round(ov)}px; give them separate attach points (from=side@pos) or routes`); done = true; }
      else if (ov > 12 && gap < 8) { hint(b.line, `${name(b)} runs ${gap}px from ${name(a)}; keep parallel lines at least 12px apart`); done = true; }
    }
  }

  for (const t of sc.texts) {
    if (t.x < 0 || t.y < 0 || t.x + t.w > sc.w || t.y + t.h > sc.h) warn(t.line, `text ${t.id} runs outside the canvas (${sc.w}x${sc.h})`);
    for (const s of front) if (!tiny(s) && s.p.overlap !== 'ok' && t.p.overlap !== 'ok' && inter(t, s, 1) && !contains(s, t)) warn(t.line, `text ${t.id} overlaps ${s.id}`);
    for (const o of sc.texts) if (o.line > t.line && inter(t, o, 1) && t.p.overlap !== 'ok' && o.p.overlap !== 'ok') warn(o.line, `text ${o.id} overlaps text ${t.id}`);
  }
  for (const s of sc.shapes) if (s.x < 0 || s.y < 0 || s.x + s.w > sc.w || s.y + s.h > sc.h) warn(s.line, `${s.id} is outside the canvas (${sc.w}x${sc.h})`);

  const rank = { error: 0, warn: 1, hint: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || a.line - b.line);
}
