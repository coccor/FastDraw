// Geometry and reference checks. Messages are written for an agent to act on.
import type { Issue, Look } from './look.ts';
import { color } from './look.ts';
import { textWidth } from './scene.ts';
import { segHits } from './router.ts';
import { iconBox, tagLayout, textBlock } from './render.ts';
import type { Scene, Box, Pt, Conn, Shape } from './scene.ts';

const num = (v: string | undefined, d: number) => (v === undefined || v === '' || isNaN(+v) ? d : +v);
const inter = (a: Box, b: Box, pad = 0) =>
  a.x + pad < b.x + b.w && b.x + pad < a.x + a.w && a.y + pad < b.y + b.h && b.y + pad < a.y + a.h;
const contains = (o: Box, i: Box) => i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h;
const hasPt = (b: Box, p: Pt) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

const inset = (b: Box, n: number): Box => ({ x: b.x + n, y: b.y + n, w: b.w - 2 * n, h: b.h - 2 * n });
const name = (c: Conn) => (c.id.startsWith('_') ? `${c.a.raw} ${c.head ? '->' : '--'} ${c.b.raw}` : c.id);
const tiny = (s: Box) => Math.min(s.w, s.h) <= 12;
// an open outline (a trend line, a stroke drawn by hand) is a line: its box is empty space that lines and labels may use
const isLine = (s: Shape) => !!s.poly && s.p.open === '1';

// ---- can the text be read against what it sits on? --------------------------
type RGB = [number, number, number];
function rgba(look: Look, v: string | undefined): [number, number, number, number] | null {
  const c = color(look, v);
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (m) { const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]; }
  m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(c);
  return m ? [+m[1], +m[2], +m[3], Math.min(1, +m[4])] : null;
}
const over = (top: [number, number, number, number] | null, under: RGB): RGB => (top ? [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])) as RGB : under);
function contrast(a: RGB, b: RGB): number {
  const lum = (c: RGB) => { const [r, g, bl] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const FAINT = 1.8; // below this, text is close to invisible; ordinary body text is 4.5 and up

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

  const paperRgb = over(rgba(sc.look, sc.look.canvas.paper ?? 'paper'), [255, 255, 255]);
  const fillOf = (s: Shape): RGB | null => (s.p.fill && s.p.fill !== 'none' && rgba(sc.look, s.p.fill) ? over(rgba(sc.look, s.p.fill), paperRgb) : null);
  for (const s of front) {
    if (s.rows || s.shape === 'legend' || s.shape === 'chart' || s.p['title.pos'] === 'top') continue;
    // a box with no fill of its own shows whatever filled shape lies under its middle
    const cxs = s.x + s.w / 2, cys = s.y + s.h / 2, at = sc.shapes.indexOf(s);
    const below = fillOf(s) ? undefined : sc.shapes.slice(0, at).reverse().find((o) => !o.back && !o.rows && fillOf(o) && cxs >= o.x && cxs <= o.x + o.w && cys >= o.y && cys <= o.y + o.h);
    const bg = fillOf(s) ?? (below ? fillOf(below)! : paperRgb);
    for (const [what, has, key, dflt] of [['text', s.text, 'title.color', 'ink'], ['second line', s.p.sub, 'sub.color', 'muted']] as const) {
      const fg = rgba(sc.look, s.p[key] ?? dflt);
      if (has && fg && fg[3] > 0.3 && contrast(over(fg, bg), bg) < FAINT) warn(s.line, `the ${what} of ${s.id} is almost the same colour as its background and cannot be read; set ${key}= to a colour that stands out (on a dark or accent fill, #ffffff)`);
    }
  }
  for (const t of sc.texts) {
    // the last-drawn filled shape under the middle of the text is what the text sits on
    const mx = t.x + t.w / 2, my = t.y + t.h / 2;
    const under = [...sc.shapes].reverse().find((s) => !s.rows && s.shape !== 'legend' && s.shape !== 'chart' && fillOf(s) && mx >= s.x && mx <= s.x + s.w && my >= s.y && my <= s.y + s.h);
    const fg = rgba(sc.look, t.p.color ?? 'ink');
    if (!fg || fg[3] <= 0.3) continue; // a watermark is meant to be faint
    const bg = under ? fillOf(under)! : paperRgb;
    if (contrast(over(fg, bg), bg) < FAINT) warn(t.line, `text ${t.id} is almost the same colour as ${under ? under.id : 'the paper'} behind it and cannot be read; change its color=`);
  }
  for (const s of front) {
    if (tiny(s)) continue;
    const off = s.shape !== 'polygon' && [s.x, s.y, s.w, s.h].some((v) => v % 4 !== 0);
    if (off) hint(s.line, `${s.id} is off the 4px grid (${s.x},${s.y} ${s.w}x${s.h}); use multiples of 4`);
    const p = s.p;
    if (s.text && p['title.pos'] !== 'top') {
      const size = num(p['title.size'], 12), ib = iconBox(s), room = (s.shape === 'diamond' || s.shape === 'ellipse' ? s.w * 0.72 : s.w - 16) - (ib && ib.dx ? ib.size + 8 + 8 : 0);
      for (const l of s.text.split('\n')) {
        const tw = textWidth(l, size, p['title.font'] ?? 'sans', num(p['title.weight'], 600), num(p['title.spacing'], 0));
        if (tw > room) warn(s.line, `text "${l}" (~${Math.round(tw)}px) does not fit in ${s.id} (${Math.round(room)}px of room); widen it or break the line with \\n`);
      }
    }
    const ic = iconBox(s);
    if (ic && ic.dy > 0) {
      const lines = s.text ? s.text.split('\n').length : 0, subs = p.sub ? p.sub.split('\n').length : 0;
      const need = Math.ceil((lines * Math.round(num(p['title.size'], 12) * 1.17) + (subs ? num(p['sub.size'], 9) + 7 + (subs - 1) * Math.round(num(p['sub.size'], 9) * 1.3) : 0) + ic.size + 6 + 16) / 4) * 4;
      if (s.h < need) warn(s.line, `the icon and text of ${s.id} need ${need}px of height; make it taller or use icon.pos=left`);
    } else if (ic && ic.size + 8 > Math.min(s.w, s.h) && s.style !== 'icon') warn(s.line, `the ${ic.size}px icon does not fit in ${s.id}; make the box bigger or set icon.size=`);
    for (const l of p.sub ? p.sub.split('\n') : []) {
      const tw = textWidth(l, num(p['sub.size'], 9), p['sub.font'] ?? 'mono', 400, 0);
      if (tw > s.w - 12) warn(s.line, `sub text "${l}" (~${Math.round(tw)}px) does not fit in ${s.id} (${s.w - 12}px of room)`);
    }
    if (p.tag && (s.text || p.sub) && p['title.pos'] !== 'top' && !s.rows && s.shape !== 'chart') {
      // the same layout the renderer uses; short of room, say how tall the box would need to be
      const size = num(p['title.size'], 12), block = textBlock(s, size);
      const fits = (h: number) => tagLayout({ ...s, h }, sc.look, block, size, s.y + h / 2).fits;
      let need = Math.ceil(s.h / 4) * 4; while (!fits(need) && need < s.h + 400) need += 4;
      if (!fits(s.h)) warn(s.line, `the tag "${p.tag}" sits on the text of ${s.id}; make it at least ${need}px tall or drop the tag`);
    }
  }

  const seen = new Set<string>();
  for (let i = 0; i < front.length; i++) for (let j = i + 1; j < front.length; j++) {
    const a = front[i], b = front[j];
    if (tiny(a) || tiny(b) || contains(a, b) || contains(b, a) || a.p.overlap === 'ok' || b.p.overlap === 'ok') continue; // free-form drawings line up by design, not by edges
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
        if (c.p.layer === 'back' || c.p.layer === 'front') break; // a grid line or guide meant to run behind the boxes
        if (s.id === c.a.id || s.id === c.b.id || tiny(s) || hit.has(s.id) || isLine(s)) continue;
        if (hasPt(s, c.pts[0]) || hasPt(s, c.pts[c.pts.length - 1])) continue;
        if (segHits(A, B, inset(s, 1))) { hit.add(s.id); warn(c.line, `${name(c)} passes through ${s.id}; route around it with from=/to= sides or via=x,y`); }
      }
    }
    const first = c.pts[0], last = c.pts[c.pts.length - 1];
    const l = c.label;
    if (!l) continue;
    for (const s of front) if (!tiny(s) && !isLine(s) && inter(l, s, 1)) warn(c.line, `label "${l.text}" of ${name(c)} collides with ${s.id}; shorten it, move things apart, or place it with lpos=x,y or lside=below|left`);
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
    if (a.p.layer === 'front' || b.p.layer === 'front') continue;
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
    for (const s of front) if (!tiny(s) && s.shape !== 'chart' && s.p.overlap !== 'ok' && t.p.overlap !== 'ok' && inter(t, s, 1) && !contains(s, t)) warn(t.line, `text ${t.id} overlaps ${s.id}`);
    for (const o of sc.texts) if (o.line > t.line && inter(t, o, 1) && t.p.overlap !== 'ok' && o.p.overlap !== 'ok') warn(o.line, `text ${o.id} overlaps text ${t.id}`);
  }

  if (sc.canvasSize && sc.canvasLine) hint(sc.canvasLine, 'the canvas has no size any more: the picture is as big as what is drawn, plus a margin; remove WxH from this line');

  // an element with no id of its own is named by its line, not by the id made up for it
  for (const i of out) i.msg = i.msg.replace(/(^|[\s("])_[stc](\d+)\b/g, '$1the unnamed element on line $2');
  const rank = { error: 0, warn: 1, hint: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || a.line - b.line);
}
