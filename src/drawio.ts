// A diagram as a draw.io file (.drawio), for places that take draw.io and not FastDraw, such as a Confluence
// page with the draw.io app. Everything keeps its place and look, and stays editable in draw.io:
//   - a box is a draw.io shape with its own fill, outline and rounding; an outline draw.io has no shape for
//     (a cylinder, a polygon, a slice) goes as a stencil drawn from the same path FastDraw draws
//   - what a look adds to a box (soft shadow aside: icon, tag pill, side strip, inner rule, corner marks,
//     caption plate) is a picture attached to it, drawn by FastDraw's renderer, so it moves with the box
//   - every text, in boxes too, is a draw.io text, placed where FastDraw puts it
//   - a line is a draw.io connector fastened to the boxes at the same points, with the same bends,
//     arrowheads and label
//   - a legend, a table and a chart are FastDraw's drawing as a picture, with their texts editable on top
// The diagram's own text rides on the page, so it can be brought back to FastDraw later.
import type { Scene, Shape, Conn } from './scene.ts';
import type { Look } from './look.ts';
import { color, fontFamily } from './look.ts';
import { legible, pageMarks, drawShape as drawShapeRaw, drawText as drawTextRaw, drawPiece, outlinePlain, num } from './render.ts';
import type { TextEl } from './scene.ts';
import { turnOf } from './scene.ts';

// ---- small helpers -----------------------------------------------------------------------------------------

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
const htmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unEsc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const r = (n: number) => Math.round(n * 100) / 100;
// a style value: draw.io splits styles on ";" and "=", so neither may appear in one
const sv = (v: string | number) => String(v).replace(/[;=]/g, ' ');
const style = (kv: Record<string, string | number | undefined>) =>
  Object.entries(kv).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => (v === null ? k : `${k}=${sv(v!)}`)).join(';') + ';';

const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const utf8 = (s: string) => new TextEncoder().encode(s);

// A raw deflate stream of stored (uncompressed) blocks: what draw.io's decompress (pako.inflateRaw) reads,
// written without a compression library so it works the same on the command line and in the editor.
function storedDeflate(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i === 0 || i < data.length; i += 0xffff) {
    const chunk = data.subarray(i, Math.min(i + 0xffff, data.length)), last = i + 0xffff >= data.length;
    out.push(last ? 1 : 0, chunk.length & 0xff, chunk.length >> 8, ~chunk.length & 0xff, (~chunk.length >> 8) & 0xff, ...chunk);
    if (last) break;
  }
  return new Uint8Array(out);
}
// draw.io's own packing for a stencil: URI-encoded, deflated, base64
const pack = (xml: string) => b64(storedDeflate(utf8(encodeURIComponent(xml))));

type Rgba = { hex: string; a: number };
// a colour from the look as #rrggbb and an opacity; null for none
function rgba(look: Look, v: string | undefined, over?: string): Rgba | null {
  if (!v || v === 'none') return null;
  const c = color(look, v, over).trim();
  const h = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c) ?? /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (h && h[0].length >= 7) return { hex: '#' + h[1].toLowerCase(), a: h[2] ? parseInt(h[2], 16) / 255 : 1 };
  if (h) return { hex: '#' + [h[1], h[2], h[3]].map((x) => x + x).join('').toLowerCase(), a: 1 };
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(c);
  if (m) return { hex: '#' + [m[1], m[2], m[3]].map((x) => Math.round(+x).toString(16).padStart(2, '0')).join(''), a: m[4] === undefined ? 1 : +m[4] };
  return null;
}
// a see-through colour laid over another, as one solid colour (what the eye sees on the page)
function over(c: Rgba, under: Rgba): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(p(c.hex, i) * c.a + p(under.hex, i) * (1 - c.a)).toString(16).padStart(2, '0')).join('');
}

// Families Google Fonts serves: draw.io loads them from there by name. The rest fall back to draw.io's own.
const GOOGLE = new Set(['geist', 'geist mono', 'newsreader', 'libre franklin', 'instrument serif', 'libre caslon display', 'roboto', 'roboto mono', 'inter', 'ibm plex sans', 'ibm plex mono', 'jetbrains mono', 'source serif 4', 'source sans 3', 'fira code', 'space grotesk', 'space mono', 'dm sans', 'dm mono', 'manrope', 'work sans', 'open sans', 'lato', 'nunito', 'poppins', 'caveat', 'kalam', 'patrick hand']);
const firstFamily = (f: string) => unEsc(f).split(',')[0]!.trim().replace(/^['"]|['"]$/g, '');
// A family draw.io cannot load stands in for one that is close: Sketch Hand is FastDraw's Virgil, whose nearest
// on Google Fonts is Caveat.
const STAND_IN: Record<string, string> = { 'sketch hand': 'Caveat', virgil: 'Caveat' };
// what the browser falls back to when the family does not load: the same kind of type
const fallback = (family: string) => /mono|code|courier/i.test(family) ? 'monospace' : /serif|caslon|newsreader|garamond|times|georgia/i.test(family) && !/sans/i.test(family) ? 'serif' : /hand|caveat|virgil|kalam|marker|comic/i.test(family) ? 'cursive' : 'Helvetica,Arial,sans-serif';
const fontKeys = (family: string) => {
  const f = STAND_IN[family.toLowerCase()] ?? family;
  return {
    // draw.io hands this to the browser as the CSS font family, so a list falls back in order
    fontFamily: `${f},${fallback(f)}`,
    fontSource: GOOGLE.has(f.toLowerCase()) ? encodeURIComponent(`https://fonts.googleapis.com/css?family=${f.replace(/ /g, '+')}`) : undefined,
  };
};

// ---- reading the renderer's SVG ----------------------------------------------------------------------------

type SvgText = { x: number; y: number; anchor: string; family: string; size: number; weight: number; italic: boolean; fill: string; text: string };
const attrsOf = (s: string) => Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
function textsIn(svg: string): SvgText[] {
  return [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => {
    const a = attrsOf(m[1]!);
    return {
      x: +a.x!, y: +a.y!, anchor: a['text-anchor'] ?? 'start', family: firstFamily(a['font-family'] ?? 'Geist'), size: +(a['font-size'] ?? 12),
      weight: +(a['font-weight'] ?? 400), italic: a['font-style'] === 'italic', fill: unEsc(a.fill ?? '#000'), text: unEsc(m[2]!),
    };
  }).filter((t) => t.text.trim() !== '' && isFinite(t.x) && isFinite(t.y));
}
const withoutTexts = (svg: string) => svg.replace(/<text\b[^>]*>[^<]*<\/text>/g, '');
// an element with neither fill nor outline draws nothing
const invisible = (el: string) => /fill="none"/.test(el) && (/stroke="none"/.test(el) || !/stroke="/.test(el));
const drawsSomething = (svg: string) => [...svg.matchAll(/<(rect|path|circle|ellipse|line|polyline|polygon|image|use)\b[^>]*>/g)].some((m) => m[1] === 'image' || m[1] === 'use' || m[1] === 'line' ? true : !invisible(m[0]));
// a picture of an SVG fragment drawn in the diagram's coordinates, cut to a box
const picture = (svg: string, x: number, y: number, w: number, h: number) =>
  'data:image/svg+xml,' + b64(utf8(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${r(x)} ${r(y)} ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}">${svg}</svg>`));

// The renderer's drawing of one element, with the look's roughness and fill patterns
const drawShape = (look: Look, s: Shape) => drawPiece(look, () => drawShapeRaw(look, s));
const drawText = (look: Look, t: TextEl) => drawPiece(look, () => drawTextRaw(look, t));

// ---- path data as a draw.io stencil ------------------------------------------------------------------------

// The outline FastDraw draws for a shape, as SVG path data in the diagram's coordinates.
function outlineD(s: Shape): string | null {
  const svg = outlinePlain(s, 'fill="#000"');
  const d = /\bd="([^"]*)"/.exec(svg);
  if (d) return unEsc(d[1]!);
  const pts = /\bpoints="([^"]*)"/.exec(svg);
  if (pts) return 'M ' + pts[1]!.trim().split(/\s+/).join(' L ') + (svg.startsWith('<polygon') ? ' Z' : '');
  return null;
}

// SVG path data (absolute or relative M L H V C Q A Z) as stencil steps, moved so the box's corner is 0,0.
function stencilPath(d: string, ox: number, oy: number): string {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0;
  const out: string[] = [];
  const n = () => +toks[i++]!;
  const P = (x: number, y: number) => `x="${r(x - ox)}" y="${r(y - oy)}"`;
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i]!)) cmd = toks[i++]!;
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ax = (v: number) => (rel ? cx + v : v), ay = (v: number) => (rel ? cy + v : v);
    if (C === 'Z') { out.push('<close/>'); cx = sx; cy = sy; continue; }
    if (C === 'M') { cx = ax(n()); cy = ay(n()); sx = cx; sy = cy; out.push(`<move ${P(cx, cy)}/>`); cmd = rel ? 'l' : 'L'; continue; }
    if (C === 'L') { cx = ax(n()); cy = ay(n()); out.push(`<line ${P(cx, cy)}/>`); continue; }
    if (C === 'H') { cx = rel ? cx + n() : n(); out.push(`<line ${P(cx, cy)}/>`); continue; }
    if (C === 'V') { cy = rel ? cy + n() : n(); out.push(`<line ${P(cx, cy)}/>`); continue; }
    if (C === 'C') {
      const x1 = ax(n()), y1 = ay(n()), x2 = ax(n()), y2 = ay(n()); cx = ax(n()); cy = ay(n());
      out.push(`<curve x1="${r(x1 - ox)}" y1="${r(y1 - oy)}" x2="${r(x2 - ox)}" y2="${r(y2 - oy)}" x3="${r(cx - ox)}" y3="${r(cy - oy)}"/>`);
      continue;
    }
    if (C === 'Q') {
      const x1 = ax(n()), y1 = ay(n()); cx = ax(n()); cy = ay(n());
      out.push(`<quad x1="${r(x1 - ox)}" y1="${r(y1 - oy)}" x2="${r(cx - ox)}" y2="${r(cy - oy)}"/>`);
      continue;
    }
    if (C === 'A') {
      const rx = n(), ry = n(), rot = n(), large = n(), sweep = n(); cx = ax(n()); cy = ay(n());
      out.push(`<arc rx="${r(rx)}" ry="${r(ry)}" x-axis-rotation="${rot}" large-arc-flag="${large}" sweep-flag="${sweep}" ${P(cx, cy)}/>`);
      continue;
    }
    i++; // anything else: skip a number
  }
  return out.join('');
}

function stencil(d: string, s: Shape, open: boolean): string {
  const xml = `<shape name="fastdraw" w="${r(s.w)}" h="${r(s.h)}" aspect="variable" strokewidth="inherit"><connections/>` +
    `<background><path>${stencilPath(d, s.x, s.y)}</path></background><foreground>${open ? '<stroke/>' : '<fillstroke/>'}</foreground></shape>`;
  return `stencil(${pack(xml)})`;
}

// ---- cells -------------------------------------------------------------------------------------------------

type Ctx = { look: Look; paper: Rgba; ox: number; oy: number; sketch: boolean; cells: string[]; boxes: Map<string, Shape> };
// the cell an element sits in, and that cell's corner on the page
type In = { id: string; x: number; y: number };

const vertex = (id: string, value: string, st: string, x: number, y: number, w: number, h: number, parent = '1') =>
  `<mxCell id="${xmlEsc(id)}" value="${xmlEsc(value)}" style="${xmlEsc(st)}" vertex="1" parent="${xmlEsc(parent)}"><mxGeometry x="${r(x)}" y="${r(y)}" width="${r(Math.max(w, 1))}" height="${r(Math.max(h, 1))}" as="geometry"/></mxCell>`;

// A text the renderer drew, as a draw.io text placed the same way: its middle on the line the renderer
// centres on (the baseline less about a third of the size), at its left, middle or right end.
function textCell(ctx: Ctx, id: string, t: SvgText, parent: string, px: number, py: number, rotation = 0): string {
  const fill = rgba(ctx.look, t.fill) ?? { hex: t.fill, a: 1 };
  const w = Math.max(8, t.text.length * t.size * 0.62 + 8), h = Math.ceil(t.size * 1.3);
  const x = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  const y = t.y - t.size * 0.36 - h / 2;
  const st = style({
    text: null as unknown as string, html: 1, whiteSpace: 'nowrap', spacing: 0, spacingTop: 0, spacingBottom: 0, spacingLeft: 0, spacingRight: 0,
    align: t.anchor === 'middle' ? 'center' : t.anchor === 'end' ? 'right' : 'left', verticalAlign: 'middle', overflow: 'visible',
    fontSize: r(t.size), fontColor: fill.hex, textOpacity: fill.a < 1 ? Math.round(fill.a * 100) : undefined,
    fontStyle: (t.weight >= 600 ? 1 : 0) | (t.italic ? 2 : 0), ...fontKeys(t.family), rotation: rotation || undefined,
    resizable: 0, autosize: 1,
  });
  const html = t.weight !== 400 && t.weight < 600 ? `<span style="font-weight:${t.weight}">${htmlEsc(t.text)}</span>` : htmlEsc(t.text);
  return vertex(id, html, st, x - px, y - py, w, h, parent);
}

// fill, outline and the rest of a shape's own look, as draw.io style keys
function boxStyle(ctx: Ctx, s: Shape): Record<string, string | number | undefined> {
  const p = s.p, look = ctx.look;
  let fill = rgba(look, p.fill);
  // a box that is not a zone stands on a patch of paper (mask): what shows is its colour over the paper
  if (fill && fill.a < 1 && !s.back && p.mask !== '0') fill = { hex: over(fill, ctx.paper), a: 1 };
  const stroke = rgba(look, p.stroke), sw = stroke ? num(p.sw, 1) : 0;
  const dash = p.dash && p.dash !== 'none' ? p.dash.split(/[\s,]+/).map((v) => r(+v / Math.max(sw, 0.5))).join(' ') : undefined;
  return {
    fillColor: fill ? fill.hex : 'none', fillOpacity: fill && fill.a < 1 ? Math.round(fill.a * 100) : undefined,
    strokeColor: stroke ? stroke.hex : 'none', strokeOpacity: stroke && stroke.a < 1 ? Math.round(stroke.a * 100) : undefined,
    strokeWidth: sw || undefined, dashed: dash ? 1 : undefined, dashPattern: dash,
    opacity: p.opacity !== undefined && num(p.opacity, 1) < 1 ? Math.round(num(p.opacity, 1) * 100) : undefined,
    rotation: turnOf(p) || undefined,
    ...(ctx.sketch && p.sketch !== '0' ? { sketch: 1, curveFitting: 1, jiggle: 2, fillStyle: 'solid' } : {}),
    ...(p.shadow && p.shadow !== 'none' ? (() => {
      const c = rgba(look, p.shadow);
      return { shadow: 1, shadowColor: c?.hex, shadowOpacity: c ? Math.round(Math.min(1, c.a * 2.5) * 100) : undefined, shadowBlur: num(p['shadow.size'], 12) / 2, shadowOffsetX: num(p['shadow.dx'], 0), shadowOffsetY: num(p['shadow.dy'], 4) };
    })() : {}),
  };
}

function outlineStyle(s: Shape): Record<string, string | number | undefined> | null {
  const radius = Math.min(num(s.p.radius, 0), s.w / 2, s.h / 2);
  if (s.shape === 'rect') return radius ? { rounded: 1, absoluteArcSize: 1, arcSize: r(radius * 2) } : { rounded: 0 };
  if (s.shape === 'ellipse') return { ellipse: null as unknown as string, perimeter: 'ellipsePerimeter' };
  if (s.shape === 'diamond') return { rhombus: null as unknown as string, perimeter: 'rhombusPerimeter' };
  const d = outlineD(s);
  return d ? { shape: stencil(d, s, s.p.open === '1') } : null;
}

const MARK = '#010203'; // a colour no look uses, to find the box's own fill in the renderer's drawing

// A plain box: a draw.io shape with no label of its own, the look's extras as a picture over it, and its texts.
function boxCells(ctx: Ctx, s: Shape, id: string, at: In, holds: boolean) {
  const look = ctx.look, p = s.p;
  const shape = outlineStyle(s) ?? { rounded: 0 };
  ctx.cells.push(vertex(id, '', style({ ...shape, ...boxStyle(ctx, s), whiteSpace: 'wrap', html: 1, container: holds && s.back ? 1 : 0, collapsible: 0, noLabel: 1 }), s.x - at.x, s.y - at.y, s.w, s.h, at.id));
  // the extras: everything the renderer draws for this box but its outline, fill, shadow and texts
  const fill = rgba(look, p.fill);
  const bare: Shape = { ...s, p: { ...p, fill: fill ? MARK : 'none', stroke: 'none', shadow: 'none', mask: '0', opacity: '1', rotate: '0' } };
  let extras = withoutTexts(drawShape(look, bare));
  if (fill) {
    extras = extras.replace(/<(rect|path|ellipse|polygon|polyline)\b[^>]*fill="#010203"[^>]*\/>/, '');
    extras = extras.replaceAll(`fill="${MARK}"`, `fill="${fill.a < 1 ? over(fill, ctx.paper) : fill.hex}"`);
  }
  if (drawsSomething(extras)) {
    const m = 48 + num(p['icon.bg.size'], 0);
    ctx.cells.push(vertex(`${id}:extras`, '', style({ shape: 'image', image: picture(extras, s.x - m, s.y - m, s.w + 2 * m, s.h + 2 * m), imageAspect: 0, editable: 0, movable: 0, resizable: 0, rotatable: 0, deletable: 0, connectable: 0, noLabel: 1, pointerEvents: 0, locked: 1 }), -m, -m, s.w + 2 * m, s.h + 2 * m, id));
  }
  textsIn(drawShape(look, { ...s, p: { ...p, rotate: '0' } })).forEach((t, i) => ctx.cells.push(textCell(ctx, `${id}:t${i}`, t, id, s.x, s.y)));
}

// A legend, a table, a chart or an icon on its own: FastDraw's drawing as a picture, and its texts on top.
// The cell is the element's own box, drawn as nothing, so lines fasten to it as in FastDraw.
function pictureCells(ctx: Ctx, s: Shape, id: string, at: In) {
  const svg = drawShape(ctx.look, { ...s, p: { ...s.p, rotate: '0' } }), m = 24;
  const below = s.shape === 'icon' ? 48 : 0; // an icon's caption sits under it
  ctx.cells.push(vertex(id, '', style({ rounded: 0, fillColor: 'none', strokeColor: 'none', noLabel: 1, connectable: s.shape === 'legend' ? 0 : 1, rotation: turnOf(s.p) || undefined }), s.x - at.x, s.y - at.y, s.w, s.h, at.id));
  const graphics = withoutTexts(svg);
  if (drawsSomething(graphics)) {
    const w = s.w + 2 * m, h = s.h + 2 * m + below;
    ctx.cells.push(vertex(`${id}:picture`, '', style({ shape: 'image', image: picture(graphics, s.x - m, s.y - m, w, h), imageAspect: 0, editable: 0, movable: 0, resizable: 0, rotatable: 0, deletable: 0, connectable: 0, noLabel: 1, pointerEvents: 0, locked: 1 }), -m, -m, w, h, id));
  }
  textsIn(svg).forEach((t, i) => ctx.cells.push(textCell(ctx, `${id}:t${i}`, t, id, s.x, s.y)));
}

// FastDraw's line ends as draw.io arrowheads: [name, filled]
const ARROWS: Record<string, [string, boolean]> = {
  arrow: ['block', true], open: ['open', false], stealth: ['classic', true], double: ['doubleBlock', true], half: ['async', true],
  triangle: ['block', false], diamond: ['diamond', false], 'diamond-solid': ['diamond', true], square: ['box', false], 'square-solid': ['box', true],
  dot: ['oval', true], circle: ['oval', false], bar: ['dash', false], cross: ['cross', false], stop: ['circle', false],
  one: ['ERone', false], 'only-one': ['ERmandOne', false], many: ['ERmany', false], 'one-many': ['ERoneToMany', false],
  'zero-one': ['ERzeroToOne', false], 'zero-many': ['ERzeroToMany', false],
};

// where on a box a line meets it, as draw.io's fractions of the box (so it stays there when the box moves)
function port(b: Shape, x: number, y: number) {
  return { x: r(Math.min(1, Math.max(0, (x - b.x) / b.w))), y: r(Math.min(1, Math.max(0, (y - b.y) / b.h))) };
}

const isPlate = (p: Record<string, string>) => (!!p['label.fill'] && p['label.fill'] !== 'none') || (!!p['label.border'] && p['label.border'] !== 'none');
// a label on a plate, as FastDraw draws it: label.fill behind, label.border round it, label.radius and label.pad
function plateHtml(ctx: Ctx, p: Record<string, string>, text: string, size: number, h: number): string {
  const f = rgba(ctx.look, p['label.fill']), b = rgba(ctx.look, p['label.border']);
  const pad = num(p['label.pad'], 3), rx = Math.min(num(p['label.radius'], 2), (h + pad) / 2);
  const css = [f ? `background-color:${f.a < 1 ? over(f, ctx.paper) : f.hex}` : `background-color:${ctx.paper.hex}`, `border-radius:${r(rx)}px`,
    `padding:${r(pad / 2 + (h - size * 1.2) / 2)}px ${r(pad)}px`, b ? `border:${num(p['label.sw'], 1)}px solid ${b.hex}` : '', 'line-height:1.2', 'white-space:nowrap'].filter(Boolean).join(';');
  return `<span style="${css}">${htmlEsc(text)}</span>`;
}

function connCell(ctx: Ctx, c: Conn, id: string) {
  if (c.pts.length < 2) return;
  const look = ctx.look, p = c.p, pts = c.pts, a = pts[0]!, b = pts[pts.length - 1]!;
  const stroke = rgba(look, p.stroke ?? 'muted'), sw = num(p.sw, 1.2);
  const dash = p.dash && p.dash !== 'none' ? p.dash.split(/[\s,]+/).map((v) => r(+v / Math.max(sw, 0.5))).join(' ') : undefined;
  const none: [string, boolean] = ['none', false], block: [string, boolean] = ['block', true];
  const head = c.head ? ARROWS[c.headM] ?? block : none, tail = c.tail ? ARROWS[c.tailM] ?? block : none;
  const src = c.a.kind === 'shape' && c.a.id ? ctx.boxes.get(c.a.id) : undefined, dst = c.b.kind === 'shape' && c.b.id ? ctx.boxes.get(c.b.id) : undefined;
  const ex = src && port(src, a.x, a.y), en = dst && port(dst, b.x, b.y);
  const hk = Math.max(0.5, Math.min(num(p['head.size'], 1), 4));
  const l = c.label, lc = l ? rgba(look, p['label.color'] ?? p.stroke ?? 'muted') : null;
  const st = style({
    edgeStyle: 'none', rounded: c.ortho && num(p.radius, 8) > 0 ? 1 : 0, arcSize: c.ortho ? r(num(p.radius, 8) * 2) : undefined, html: 1,
    strokeColor: stroke ? stroke.hex : 'none', strokeOpacity: stroke && stroke.a < 1 ? Math.round(stroke.a * 100) : undefined, strokeWidth: sw,
    dashed: dash ? 1 : undefined, dashPattern: dash, opacity: p.opacity !== undefined && num(p.opacity, 1) < 1 ? Math.round(num(p.opacity, 1) * 100) : undefined,
    endArrow: head[0], endFill: head[1] ? 1 : 0, startArrow: tail[0], startFill: tail[1] ? 1 : 0,
    endSize: r(6 * hk + sw), startSize: r(6 * hk + sw),
    exitX: ex?.x, exitY: ex?.y, exitPerimeter: ex ? 0 : undefined, entryX: en?.x, entryY: en?.y, entryPerimeter: en ? 0 : undefined,
    ...(ctx.sketch && p.sketch !== '0' ? { sketch: 1, curveFitting: 1, jiggle: 2 } : {}),
    ...(l ? {
      fontSize: l.size, fontColor: lc?.hex, ...fontKeys(firstFamily(fontFamily(look, l.font))),
      fontStyle: num(p['label.weight'], 400) >= 600 ? 1 : 0,
      // a plain label stands on a patch of paper; a plate is drawn in the label itself
      labelBackgroundColor: l && !isPlate(p) ? ctx.paper.hex : undefined,
    } : {}),
  });
  // draw.io puts a label at the middle of the line's length; the offset moves it to where FastDraw put it
  let offset = '';
  if (l) {
    const segs = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i]!.x, q.y - pts[i]!.y)), half = segs.reduce((x, y) => x + y, 0) / 2;
    let acc = 0, mx = a.x, my = a.y;
    for (let i = 0; i < segs.length; i++) {
      if (acc + segs[i]! >= half) { const t = segs[i]! ? (half - acc) / segs[i]! : 0; mx = pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t; my = pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * t; break; }
      acc += segs[i]!;
    }
    offset = `<mxPoint x="${r(l.cx - mx)}" y="${r(l.y + l.h / 2 - my)}" as="offset"/>`;
  }
  const via = pts.slice(1, -1).map((q) => `<mxPoint x="${r(q.x - ctx.ox)}" y="${r(q.y - ctx.oy)}"/>`).join('');
  const value = l ? (isPlate(p) ? plateHtml(ctx, p, l.text, l.size, l.h) : htmlEsc(l.text)) : '';
  ctx.cells.push(`<mxCell id="${xmlEsc(id)}" value="${xmlEsc(value)}" style="${xmlEsc(st)}" edge="1" parent="1"${src ? ` source="fd:${xmlEsc(src.id)}"` : ''}${dst ? ` target="fd:${xmlEsc(dst.id)}"` : ''}>` +
    `<mxGeometry relative="1" as="geometry"><mxPoint x="${r(a.x - ctx.ox)}" y="${r(a.y - ctx.oy)}" as="sourcePoint"/><mxPoint x="${r(b.x - ctx.ox)}" y="${r(b.y - ctx.oy)}" as="targetPoint"/>` +
    `${via ? `<Array as="points">${via}</Array>` : ''}${offset}</mxGeometry></mxCell>`);
}

// ---- the file ------------------------------------------------------------------------------------------------

export type DrawioOptions = {
  name?: string; // the page's name in draw.io
  source?: string; // the diagram's text, kept on the page for bringing it back to FastDraw
  look?: string | null; // the look's text, when it is a file of its own
};

export function toDrawio(scene: Scene, opts: DrawioOptions = {}): string {
  const sc = legible(scene), look = sc.look, cv = pageMarks(look);
  const paper = rgba(look, cv.paper ?? 'paper') ?? { hex: '#ffffff', a: 1 };
  const ctx: Ctx = { look, paper, ox: sc.x, oy: sc.y, sketch: num(cv.sketch, 0) > 0, cells: [], boxes: new Map() };
  const ids = new Set<string>();
  // FastDraw's name for an element where it has one, so the file maps back; a made-up one otherwise
  const idOf = (pre: string, name: string | undefined, i: number) => {
    let id = name ? `fd:${name}` : `fd:${pre}${i}`;
    while (ids.has(id)) id += '_';
    ids.add(id);
    return id;
  };
  sc.shapes.forEach((s) => { if (s.id) ctx.boxes.set(s.id, s); });
  const picture = (s: Shape) => ['legend', 'table', 'chart', 'icon'].includes(s.shape) || !!s.legend || !!s.rows;

  // What is drawn, in FastDraw's order: zones, the lines under the boxes, the boxes, lines on top, free text.
  type Item = { kind: 'shape'; el: Shape; id: string } | { kind: 'conn'; el: Conn; id: string } | { kind: 'text'; el: TextEl; id: string };
  const items: Item[] = [];
  sc.shapes.forEach((el, i) => { if (el.back) items.push({ kind: 'shape', el, id: idOf('s', el.id, i) }); });
  const under = sc.conns.filter((c) => c.p.layer !== 'front'), front = sc.conns.filter((c) => c.p.layer === 'front');
  under.forEach((el, i) => items.push({ kind: 'conn', el, id: idOf('c', el.id, i) }));
  sc.shapes.forEach((el, i) => { if (!el.back) items.push({ kind: 'shape', el, id: idOf('s', el.id, i) }); });
  front.forEach((el, i) => items.push({ kind: 'conn', el, id: idOf('f', el.id, i) }));
  sc.texts.forEach((el, i) => items.push({ kind: 'text', el, id: idOf('t', el.id, i) }));

  // Each box and text sits in the smallest box drawn before it that holds it whole, so moving a node takes its
  // rows and texts along and moving a zone what is in it. A zone is a draw.io container (a click picks what is
  // in it); any other box is like a draw.io group (a click picks the box, a second click what is in it).
  const can = (s: Shape) => !picture(s) && !(s.shape === 'polygon' && s.p.open === '1') && s.shape !== 'arc' && !turnOf(s.p) && s.w > 0 && s.h > 0;
  const page: In = { id: '1', x: sc.x, y: sc.y };
  const parent = new Map<Item, Item>();
  items.forEach((it, i) => {
    if (it.kind === 'conn') return;
    const b = it.el, area = b.w * b.h;
    let best: Item | undefined;
    for (let j = 0; j < i; j++) {
      const c = items[j]!;
      if (c.kind !== 'shape' || !can(c.el)) continue;
      const o = c.el, oa = o.w * o.h;
      if (oa <= area || b.x < o.x - 0.5 || b.y < o.y - 0.5 || b.x + b.w > o.x + o.w + 0.5 || b.y + b.h > o.y + o.h + 0.5) continue;
      if (!best || oa < (best.el as Shape).w * (best.el as Shape).h) best = c;
    }
    if (best) parent.set(it, best);
  });
  const holders = new Set(parent.values());
  const at = (it: Item): In => { const c = parent.get(it); return c ? { id: c.id, x: (c.el as Shape).x, y: (c.el as Shape).y } : page; };

  for (const it of items) {
    if (it.kind === 'conn') connCell(ctx, it.el, it.id);
    else if (it.kind === 'shape') {
      if (picture(it.el)) pictureCells(ctx, it.el, it.id, at(it));
      else boxCells(ctx, it.el, it.id, at(it), holders.has(it));
    } else {
      const rot = turnOf(it.el.p), where = at(it);
      const lines = textsIn(drawText(look, { ...it.el, p: { ...it.el.p, rotate: '0', echo: 'none' } }));
      lines.forEach((l, k) => ctx.cells.push(textCell(ctx, k ? `${it.id}:${k}` : it.id, l, where.id, where.x, where.y, rot)));
    }
  }

  const keep = [opts.source !== undefined ? ` fastdraw-source="${xmlEsc(opts.source)}"` : '', opts.look ? ` fastdraw-look="${xmlEsc(opts.look)}"` : ''].join('');
  const root = keep ? `<object label="" id="0"${keep}><mxCell/></object>` : '<mxCell id="0"/>';
  return `<mxfile host="fastdraw" type="device"><diagram id="fastdraw" name="${xmlEsc(opts.name ?? 'Diagram')}">` +
    `<mxGraphModel dx="${r(sc.w)}" dy="${r(sc.h)}" grid="0" gridSize="8" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${Math.ceil(sc.w)}" pageHeight="${Math.ceil(sc.h)}" background="${paper.hex}" math="0" shadow="0">` +
    `<root>${root}<mxCell id="1" parent="0"/>${ctx.cells.join('')}</root></mxGraphModel></diagram></mxfile>\n`;
}
