import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStatements } from '../src/parse.ts';
import { parseLook } from '../src/look.ts';
import { buildScene } from '../src/scene.ts';
import { check } from '../src/check.ts';
import { renderSvg } from '../src/render.ts';
import { patchSource, setAt, setSize, setText, setProp, setKind, setEnd, fmtStmt, appendStatements, moveStatement, freshId, setRows } from '../src/edit.ts';
import { loadScene, readSources, loadLook } from '../src/node.ts';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { embedSvg, extractSvg, embedPng, extractPng } from '../src/embed.ts';
import { defaultLook } from '../src/look.ts';
import { fontMeta } from '../src/fontmeta.ts';
import { lookFonts } from '../src/node.ts';
import { ICONS } from '../src/icons.ts';
import { ICON_WEIGHTS, DUOTONE_TINT } from '../src/iconSet.ts';
const SOLID_ICONS = ICON_WEIGHTS.fill;

const look = parseLook(readFileSync(new URL('../looks/reference.look', import.meta.url), 'utf8'));
const scene = (body: string) => buildScene(`look "x.look"\n${body}`, look);
const warns = (body: string) => check(scene(body)).filter((i) => i.level !== 'hint').map((i) => i.msg);

test('sketch look: hand-drawn strokes, steady from one render to the next, off unless the look asks', () => {
  const body = 'canvas 800x400\na: node "A" at 40,40\nb: decision "B?" at 300,40\nc: ellipse "C" at 40,200 120x60 hatch=ink/0.4\na -> b\n';
  const sk = parseLook(readFileSync(new URL('../looks/sketch.look', import.meta.url), 'utf8'), 'sketch.look');
  assert.deepEqual(sk.issues, []);
  const svg = renderSvg(buildScene(body, sk));
  assert.doesNotMatch(svg, /<rect x="40" y="40"/); // the box is a drawn path, not a crisp rectangle
  assert.match(svg, /<pattern id="fd-hatch-0"/);
  assert.equal(svg, renderSvg(buildScene(body, sk))); // the wobble is seeded, so a re-render is identical
  const plain = renderSvg(buildScene(body, look));
  assert.match(plain, /<rect x="40" y="40"/);
  assert.match(plain, /fd-hatch-0/); // hatch works without sketch too
  assert.match(renderSvg(buildScene(body.replace('"A" at', '"A" sketch=0 at'), sk)), /<rect x="40" y="40"/); // sketch=0 opts one element out
});

test('tokenizer: strings, props, comments, continuation lines', () => {
  const st = parseStatements('a: node "Hi \\"x\\"\\nthere" at 4,8 sub="p q" // note\n   tag=API\n# whole-line comment\nb: node fill=#fff');
  assert.equal(st.length, 2);
  assert.deepEqual(st[0].toks.map((t) => t.v), ['a:', 'node', 'Hi "x"\nthere', 'at', '4,8', 'p q', 'API']);
  assert.equal(st[0].end, 2);
  assert.equal(st[1].toks[2].v, '#fff');
});

test('format round trip keeps a canonical statement unchanged', () => {
  for (const line of ['a: node "Orders API" at 200,120 160x64 sub="REST · :8080" tag=API', 'a.right@0.25 -> b.top "writes" style=primary', 'text "Line one\\nLine two" at 40,40 style=note']) {
    assert.equal(fmtStmt(parseStatements(line)[0].toks), line);
  }
});

test('a patch changes only the lines of the statement it targets', () => {
  const src = 'look "x.look"\n\n// keep me\na: node "A" at 40,40   // trailing\nb:   node   "B"   at 240,40\na -> b "go"\n';
  const out = patchSource(src, new Map([[4, (t) => setAt(t, 100, 60)]]));
  const before = src.split('\n'), after = out.split('\n');
  assert.equal(after.length, before.length);
  after.forEach((l, i) => { if (i !== 3) assert.equal(l, before[i]); });
  assert.equal(after[3], 'a: node "A" at 100,60 // trailing');
});

test('token edits: position, size, text, props, style, connector ends', () => {
  const toks = () => parseStatements('a: node "A" at 40,40')[0].toks;
  assert.equal(fmtStmt(setSize(toks(), 160, 64)), 'a: node "A" at 40,40 160x64');
  assert.equal(fmtStmt(setText(toks(), 'New name')), 'a: node "New name" at 40,40');
  assert.equal(fmtStmt(setProp(toks(), 'fill', '#fff')), 'a: node "A" at 40,40 fill=#fff');
  assert.equal(fmtStmt(setProp(setProp(toks(), 'fill', '#fff'), 'fill', null)), 'a: node "A" at 40,40');
  assert.equal(fmtStmt(setKind(toks(), 'store')), 'a: store "A" at 40,40');
  assert.equal(fmtStmt(setAt(parseStatements('rect 14x10')[0].toks, 8, 12)), 'rect at 8,12 14x10');
  const c = parseStatements('a -> b')[0].toks;
  assert.equal(fmtStmt(setText(setEnd(c, 'b', 'c.top'), 'calls')), 'a -> c.top "calls"');
});

test('delete, append, reorder, fresh ids', () => {
  const src = 'look "x.look"\ncanvas 100x100\na: node at 0,0\nb: node at 0,80\n';
  assert.equal(patchSource(src, new Map([[3, () => null]])), 'look "x.look"\ncanvas 100x100\nb: node at 0,80\n');
  assert.equal(appendStatements(src, ['c: node at 0,160']).endsWith('b: node at 0,80\nc: node at 0,160\n'), true);
  assert.equal(moveStatement(src, 3, 'front').trim().split('\n').pop(), 'a: node at 0,0');
  assert.equal(moveStatement(src, 4, 'back').split('\n')[2], 'b: node at 0,80');
  assert.equal(freshId(src, 'a'), 'a2');
  assert.equal(freshId(src, 'node'), 'node');
  const rects = 'rect: rect at 0,0\nrect2: rect at 0,40\nrect3: rect at 0,80\n';
  assert.equal(freshId(rects, 'rect3'), 'rect4');
  assert.equal(freshId(rects, 'rect2'), 'rect4');
  assert.equal(freshId('s3: node at 0,0\n', 's3'), 's4');
  assert.equal(freshId('a: node at 0,0\nv2: node at 0,40\n', 'v2'), 'v3');
  assert.equal(freshId(rects, 'v2'), 'v2');
});

test('aligned boxes get a straight arrow; unaligned ones get one elbow', () => {
  const sc = scene('a: node at 40,40\nb: node at 240,40\nc: node at 480,200\na -> b\nb -> c');
  assert.deepEqual(sc.conns[0].pts, [{ x: 184, y: 72 }, { x: 240, y: 72 }]);
  assert.equal(sc.conns[1].pts.length, 3);
  assert.deepEqual(sc.conns[1].pts[1], { x: 552, y: 72 });
});

test('an arrow ending on a free point arrives along its main direction, not with a turn at the head', () => {
  const sc = scene('a: node at 40,40 144x64\n100,360 -> 400,372\na -> 500,120\n300,200 -> 310,400');
  const last = (i: number) => sc.conns[i].pts.slice(-2);
  assert.deepEqual(sc.conns[0].pts, [{ x: 100, y: 360 }, { x: 250, y: 360 }, { x: 250, y: 372 }, { x: 400, y: 372 }]);
  for (const i of [0, 1]) assert.equal(last(i)[0].y, last(i)[1].y, `line ${i} ends level`);
  assert.equal(last(2)[0].x, last(2)[1].x, 'a mostly-downward line ends going down');
});

test('a request and its response between two boxes are spread apart and stay straight', () => {
  const sc = scene('a: node at 40,40 144x64\nb: node at 240,40 144x96\na -> b\nb -> a style=return');
  for (const c of sc.conns) assert.equal(c.pts.length, 2);
  assert.notEqual(sc.conns[0].pts[0].y, sc.conns[1].pts[0].y);
});

test('a line hanging off a box and a message attached to it follow the box', () => {
  const body = (x: number) => `a: node at ${x},40 144x56\nb: node at 400,40 144x56\nal: a.bottom -- +0,200 style=lifeline\nbl: b.bottom -- +0,200 style=lifeline\nal@160 -> bl@160 "hi"`;
  const one = scene(body(40)), two = scene(body(100));
  assert.deepEqual(one.conns[2].pts, [{ x: 112, y: 160 }, { x: 472, y: 160 }]);
  assert.deepEqual(two.conns[2].pts, [{ x: 172, y: 160 }, { x: 472, y: 160 }]);
  assert.deepEqual(two.conns[0].pts, [{ x: 172, y: 96 }, { x: 172, y: 296 }]);
});

test('errors name the problem and the line', () => {
  const sc = scene('a: nodee at 0,0\nb: node at 40,40\nb -> zz\nb: node at 40,200');
  const errs = sc.issues.filter((i) => i.level === 'error');
  assert.match(errs[0].msg, /unknown style "nodee"/); assert.equal(errs[0].line, 2);
  assert.match(errs.map((e) => e.msg).join('|'), /"zz", which does not exist/);
  assert.match(errs.map((e) => e.msg).join('|'), /id "b" is already used/);
});

test('checker: overlap, arrow through a box, label on a zone border, clean diagram', () => {
  assert.match(warns('a: node at 40,40\nb: node at 100,60').join('|'), /b overlaps a/);
  assert.match(warns('a: node at 40,40\nm: node at 240,40\nb: node at 440,40\na -> b via=200,72').join('|'), /passes through m/);
  assert.match(warns('z: zone "Z" at 300,20 200x300\na: node at 40,100\nb: node at 328,200\na -> b "reads data"').join('|'), /border of z/);
  assert.deepEqual(warns('a: node "A" at 40,40\nb: node "B" at 240,40\na -> b "go"'), []);
});

test('checker: a box under a chart and text on its bars are reported; a label in clear plot space is not', () => {
  const chart = 'c: chart at 80,60 300x200 x="A,B,C" y=0..100\n  | bars "Revenue" 42 61 75\n';
  const w = warns(`a: node "Orders API" at 100,100\n${chart}t: text "Hello there" at 120,220`).join('|');
  assert.match(w, /c overlaps a/);
  assert.match(w, /text t sits on the bars or dots of chart c/);
  assert.deepEqual(warns(`${chart}t: text "peak" at 300,70 size=10`), []);
  assert.deepEqual(warns(`a: node "Orders API" at 100,100 overlap=ok\n${chart}t: text "Hello there" at 120,220 overlap=ok`), []);
});

test('missing look file is an error, not a crash', () => {
  const sc = buildScene('look "nope.look"\na: rect at 0,0 40x40', null);
  assert.match(sc.issues[0].msg, /look file not found/);
  assert.match(renderSvg(sc), /<svg/);
});

test('a connector whose route is a single point draws nothing instead of throwing', () => {
  const sc = scene('ic: icon "Caption" at 100,100 icon=database\n112,137 -> 112,137');
  assert.doesNotThrow(() => renderSvg(sc));
  assert.match(renderSvg(sc), /<svg/);
});

test('the three agent-written test diagrams still check clean', () => {
  for (const name of ['architecture', 'flowchart', 'sequence']) {
    const sc = loadScene(new URL(`../examples/test/${name}.fdraw`, import.meta.url).pathname);
    assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), [], name);
  }
});

test('markup in a diagram file cannot break out of the SVG', () => {
  const sc = scene('a: node "<script>x</script>" at 40,40 fill="red\\" onload=\\"alert(1)" dash="1\\"><script>" sub="</text><script>"\ntext "t" at 10,10 anchor="x\\" onclick=\\"y" font="f\\" onfocus=\\"z"');
  const svg = renderSvg(sc);
  assert.equal(/<script/.test(svg), false);
  // an injected attribute would need a literal quote after the =; escaped ones stay inside the value
  assert.equal(/ on(load|click|focus)=["']/.test(svg), false);
  assert.match(svg, /onload=&quot;/);
});

test('a diagram with no look statement is drawn with the built-in look', () => {
  const sc = buildScene('a: focal "A" at 40,40\nb: store "B" at 240,40\na -> b style=primary', null);
  assert.deepEqual(sc.issues.filter((i) => i.level === 'error'), []);
  assert.equal(sc.look, defaultLook());
  assert.deepEqual(defaultLook().issues, []);
  assert.match(renderSvg(sc), /<path d="M/); // the store is a drawn cylinder, not a rectangle
});

test('legend: one statement lays out entries, wraps rows and stays inside its width', () => {
  const sc = scene('lg: legend at 40,300 focal="The subject" store="Holds data" primary="Main path" return="Reply" decision="Question" nosuch="x" fill=#fff\nwide: node at 40,40 720x40');
  const lg = sc.shapes[0];
  assert.deepEqual(lg.legend!.map((i) => i.style), ['focal', 'store', 'primary', 'return', 'decision']);
  assert.equal(lg.w, 720); // as wide as the rest of the drawing, written after it or not
  assert.equal(scene('lg: legend at 40,300 focal="The subject"').shapes[0].w, 920); // nothing else drawn
  for (const i of lg.legend!) assert.ok(i.x >= 40 && i.x < 760);
  assert.equal(new Set(lg.legend!.map((i) => i.baseline)).size, 1);
  const narrow = scene('lg: legend at 40,300 200x10 focal="The subject of it all" store="Holds data" primary="Main path"').shapes[0];
  assert.ok(new Set(narrow.legend!.map((i) => i.baseline)).size > 1);
  assert.ok(narrow.h > lg.h);
  const svg = renderSvg(sc);
  assert.match(svg, />LEGEND</); assert.match(svg, />Holds data</);
  assert.match(warns('lg: legend at 40,300').join('|'), /no entries/);
});

test('exports carry their source and give it back', () => {
  const payload = { v: 1 as const, diagram: 'a: node "Ünï ✓" at 0,0\n', look: 'style node shape=rect\n' };
  assert.deepEqual(extractSvg(embedSvg('<svg xmlns="x" viewBox="0 0 1 1">\n<rect/></svg>', payload)), payload);
  assert.equal(extractSvg('<svg></svg>'), null);
  // smallest valid PNG: signature, IHDR, IDAT, IEND
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
  const out = embedPng(png, payload);
  assert.deepEqual(extractPng(out), payload);
  assert.equal(extractPng(png), null);
  assert.deepEqual([...out.subarray(out.length - 12)], [...png.subarray(png.length - 12)]); // IEND still last
  assert.equal(embedPng(new Uint8Array([1, 2, 3]), payload).length, 3);
});

test('a diagram cannot make the tool read or embed a file that is not a look', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fd-'));
  writeFileSync(join(dir, 'secret.env'), 'TOKEN=hunter2\n');
  writeFileSync(join(dir, 'broken.look'), 'TOKEN=hunter2 not a look\n');
  writeFileSync(join(dir, 'ok.look'), 'color ink #111111\n');
  const mk = (look: string) => { const f = join(dir, look.replace(/\W/g, '') + '.fdraw'); writeFileSync(f, `look "${look}"\na: rect at 0,0 40x40\n`); return f; };
  const env = mk('./secret.env');
  assert.equal(readSources(env).look, null);
  const issues = loadScene(env).issues.map((i) => i.msg).join('|');
  assert.match(issues, /must end in \.look/);
  assert.equal(/hunter2/.test(issues), false);
  assert.equal(readSources(mk('./broken.look')).look, null); // does not parse cleanly: not embedded
  assert.equal(readSources(mk('./ok.look')).look, 'color ink #111111\n');
});

test('font files report their family, weight and italic flag', () => {
  const read = (p: string) => new Uint8Array(readFileSync(new URL(p, import.meta.url)));
  assert.deepEqual(fontMeta(read('../fonts/Geist-SemiBold.ttf')), { family: 'Geist', weight: 600, italic: false });
  assert.deepEqual(fontMeta(read('../fonts/GeistMono-Regular.ttf')), { family: 'Geist Mono', weight: 400, italic: false });
  assert.deepEqual(fontMeta(read('../fonts/InstrumentSerif-Italic.ttf')), { family: 'Instrument Serif', weight: 400, italic: true });
  assert.deepEqual(fontMeta(read('../examples/look-test/fonts/FiraSans-SemiBold.ttf')), { family: 'Fira Sans', weight: 600, italic: false });
  assert.equal(fontMeta(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), null);
  assert.equal(fontMeta(new Uint8Array(0)), null);
});

test('a look brings its own fonts with fontdir, and a named font with no file is reported', () => {
  const lookFile = new URL('../examples/look-test/fira.look', import.meta.url).pathname;
  const withDir = parseLook(readFileSync(lookFile, 'utf8'));
  assert.deepEqual(withDir.fontDirs, ['./fonts']);
  const a = lookFonts(lookFile, withDir);
  assert.equal(a.files.length, 2);
  assert.deepEqual(a.missing, []);
  const without = parseLook('font sans "Fira Sans"\nfont mono "Geist Mono"\n');
  assert.deepEqual(lookFonts(lookFile, without).missing, ['Fira Sans']);
  const sc = loadScene(new URL('../examples/look-test/fira.fdraw', import.meta.url).pathname);
  assert.equal(sc.fontFiles!.length, 2);
  assert.deepEqual(sc.issues, []);
});

test('an arrow routes around a box that is in its way', () => {
  const sc = scene('a: node at 40,40\nm: node at 240,40\nb: node at 440,40\na -> b');
  const c = sc.conns[0];
  assert.ok(c.pts.length >= 4, 'took a detour');
  assert.deepEqual(c.pts[0], { x: 184, y: 72 }); assert.deepEqual(c.pts[c.pts.length - 1], { x: 440, y: 72 });
  for (let i = 0; i < c.pts.length - 1; i++) assert.ok(c.pts[i].x === c.pts[i + 1].x || c.pts[i].y === c.pts[i + 1].y, 'right angles only');
  assert.deepEqual(check(sc).filter((i) => i.level === 'warn'), []);
  // every point of the detour keeps clear of the box in the middle
  for (const p of c.pts.slice(1, -1)) assert.ok(p.y <= 28 || p.y >= 116 || p.x <= 228 || p.x >= 396);
});

test('routing: clear paths are untouched, an L that clips a box is fixed, via points are respected', () => {
  assert.equal(scene('a: node at 40,40\nb: node at 440,40\na -> b').conns[0].pts.length, 2);
  const clip = scene('a: node at 40,40\nb: node at 400,240\nm: node at 380,40\na -> b');
  assert.deepEqual(check(clip).filter((i) => /passes through/.test(i.msg)), []);
  const forced = scene('a: node at 40,40\nm: node at 240,40\nb: node at 440,40\na -> b via=300,72');
  assert.equal(forced.conns[0].pts.length, 3);
  // boxed in on every side: no route exists, so the simple one is kept and the checker reports it
  const stuck = scene('a: node at 200,160\nw1: rect at 150,100 244x40\nw2: rect at 150,244 244x40\nw3: rect at 150,100 40x184\nw4: rect at 354,100 40x184\nb: node at 600,160\na -> b');
  assert.match(check(stuck).map((i) => i.msg).join('|'), /passes through/);
});

test('a label that lands on its own line is reported', () => {
  assert.match(warns('a: node at 40,40\nb: node at 400,240\na -> b "reads" lpos=472,180').join('|'), /sits on its own line/);
});

test('a damaged or hostile font file is rejected quickly, not parsed at length', () => {
  const real = new Uint8Array(readFileSync(new URL('../fonts/Geist-Regular.ttf', import.meta.url)));
  assert.equal(fontMeta(real.subarray(0, 300)), null); // truncated: tables point past the end
  const liar = new Uint8Array(real); // claims 65535 name records
  const dv = new DataView(liar.buffer);
  let nameOff = 0;
  for (let i = 0; i < dv.getUint16(4); i++) { const o = 12 + i * 16; if (String.fromCharCode(...liar.subarray(o, o + 4)) === 'name') nameOff = dv.getUint32(o + 8); }
  dv.setUint16(nameOff + 2, 0xffff);
  const t = performance.now();
  fontMeta(liar);
  assert.ok(performance.now() - t < 50);
  assert.match(renderSvg(scene('a: node at 0,0'), "x{}</style><script>alert(1)</script>"), /&lt;\/style>&lt;script>/);
});

test('a label that would land on a box moves to the other side of its line, unless a side was asked for', () => {
  const src = (extra: string) => `canvas 880x420\na: node "Client" at 40,160\nm: node "In the way" at 280,160\nb: focal "Target" at 560,160\nr1: a -> b "detour"${extra}\n`;
  const auto = scene(src(''));
  assert.deepEqual(check(auto).filter((i) => i.level !== 'hint'), []);
  const m = auto.shapes.find((s) => s.id === 'm')!, l = auto.conns[0].label!;
  assert.ok(l.y >= m.y + m.h || l.y + l.h <= m.y);
  // an explicit side is the author's call, even when it collides
  assert.ok(check(scene(src(' lside=above'))).some((i) => i.msg.includes('collides with m')));
});

const TABLES = `users: table "users" at 40,100
  | id "id" "uuid" "PK"
  | email "email" "text"
  | ---
  | "created_at" "timestamptz"
orders: table "orders" at 400,100 240x0
  | id "id" "uuid"
  | user_id "user_id" "uuid" "FK"
fk: orders.user_id -- users.id tail=many head=only-one style=arrow
`;

test('a table sizes itself from its rows, and an arrow can end on a row', () => {
  const sc = scene(TABLES);
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  const users = sc.shapes.find((s) => s.id === 'users')!, orders = sc.shapes.find((s) => s.id === 'orders')!;
  assert.equal(users.h, 32 + 3 * 24); // header and three rows; the divider takes no room
  assert.equal(orders.w, 240);
  assert.equal(users.rows!.map((r) => r.kind).join(), 'row,row,rule,row');
  const fk = sc.conns[0], row = (s: typeof users, id: string) => s.rows!.find((r) => r.id === id)!;
  assert.deepEqual(fk.pts[0], { x: orders.x, y: row(orders, 'user_id').y + 12 });
  assert.deepEqual(fk.pts[fk.pts.length - 1], { x: users.x + users.w, y: row(users, 'id').y + 12 });
  assert.equal(fk.headM, 'only-one');
  assert.equal(fk.tailM, 'many');
  const svg = renderSvg(sc);
  assert.ok(svg.includes('>timestamptz<') && svg.includes('>users<'));
});

test('tables and markers report mistakes in words an agent can act on', () => {
  const msgs = (body: string) => check(scene(body)).map((i) => i.msg).join('\n');
  assert.match(msgs(TABLES + 'x: node "X" at 40,300\nx -> users.nope\n'), /"users" has no row called "nope"; its rows: id, email/);
  assert.match(msgs('x: node "X" at 40,40\n  | "a"\n'), /only work on a table style/);
  assert.match(msgs('a: node "A" at 40,40\nb: node "B" at 300,40\na -> b head=fork\n'), /"fork" is not an end marker; use one of: none, arrow/);
  assert.match(msgs('x: node "X" at 40,300\nx -> x.middle\n'), /only a table has rows/);
});

test('markers: the newer heads parse and draw, and scale with head.size', () => {
  const two = 'a: node "A" at 40,40\nb: node "B" at 300,40\n';
  const svg = (m: string, extra = '') => renderSvg(scene(two + `a -> b head=${m} tail=${m}${extra}\n`));
  const polys = (s: string) => (s.match(/<polygon/g) ?? []).length;
  for (const m of ['stealth', 'double', 'half', 'square', 'square-solid', 'bar', 'cross']) {
    const c = scene(two + `a -> b head=${m} tail=${m}\n`).conns[0];
    assert.deepEqual([c.headM, c.tailM], [m, m]);
    assert.notEqual(svg(m), svg('none'), m);
  }
  assert.equal(polys(svg('double')) - polys(svg('none')), 4); // two heads at each end
  assert.notEqual(svg('cross'), svg('cross', ' head.size=2'));
});

test('a see-through line and its heads are drawn solid and faded as one layer, so their overlaps are not darker', () => {
  const two = 'a: node "A" at 40,40\nb: node "B" at 300,40\n';
  const svg = renderSvg(scene(two + 'a -> b head=double tail=cross stroke=#ff0000/0.5 blend=multiply casing=#ffd400\n'));
  const g = /<g opacity="0.5" style="mix-blend-mode:multiply">([\s\S]*?)<\/g>/.exec(svg);
  assert.ok(g, 'one faded group, blending as the line would');
  assert.ok(!g[1].includes('rgba('), 'nothing inside it is see-through on its own');
  assert.ok(g[1].includes('stroke="rgb(255,0,0)"') && g[1].includes('fill="rgb(255,0,0)"'));
  assert.ok(svg.indexOf('stroke="#ffd400"') < svg.indexOf('<g opacity="0.5"'), 'the casing stays underneath, at full strength');
  // a solid line is drawn as before, without a group
  assert.ok(!renderSvg(scene(two + 'a -> b stroke=#ff0000\n')).includes('<g opacity'));
});

test('markers: -> keeps the style head, head= and tail= override, <-> mirrors', () => {
  const c = (line: string) => scene(`a: node "A" at 40,40\nb: node "B" at 300,40\n${line}\n`).conns[0];
  assert.deepEqual([c('a -> b').tailM, c('a -> b').headM], ['none', 'arrow']);
  assert.deepEqual([c('a -- b').tailM, c('a -- b').headM], ['none', 'none']);
  assert.deepEqual([c('a <-> b head=open').tailM, c('a <-> b head=open').headM], ['open', 'open']);
  assert.deepEqual([c('a -> b head=triangle tail=diamond-solid').tailM, c('a -> b head=triangle tail=diamond-solid').headM], ['diamond-solid', 'triangle']);
  assert.ok(renderSvg(scene('a: node "A" at 40,40\nb: node "B" at 300,40\na -- b tail=zero-many\n')).includes('<circle'));
});

test('editing a table keeps one row per line and leaves its cells alone', () => {
  const src = `look "x.look"\ncanvas 800x400\n${TABLES}`;
  const moved = patchSource(src, new Map([[3, (t) => setProp(setText(setAt(t, 80, 120), 'people'), 'fill', 'accent/0.08')]]));
  assert.equal(moved.split('\n').slice(2, 7).join('\n'), 'users: table "people" at 80,120 fill=accent/0.08\n  | id "id" "uuid" "PK"\n  | email "email" "text"\n  | ---\n  | "created_at" "timestamptz"');
  assert.equal(moved.split('\n').slice(7).join('\n'), src.split('\n').slice(7).join('\n'));
  const fewer = patchSource(src, new Map([[3, (t) => setRows(t, [{ kind: 'head', cells: ['a', 'b'] }, { id: 'r1', kind: 'row', cells: ['x', ''] }])]]));
  assert.equal(fewer.split('\n').slice(2, 5).join('\n'), 'users: table "users" at 40,100\n  |= "a" "b"\n  | r1 "x" ""');
});

test('route=curve draws a smooth line: bend bows it, via points are passed through, labels stay off it', () => {
  const two = 'a: node "A" at 40,100\nb: node "B" at 400,100\n';
  const c = (line: string) => scene(two + line + '\n').conns[0];
  const plain = c('a -> b route=curve');
  assert.ok(plain.curve && !plain.ortho && plain.pts.length > 20);
  assert.ok(plain.pts.every((p) => p.y === plain.pts[0].y)); // two facing sides in line: the curve is flat
  const up = c('a -> b route=curve bend=40'), mid = up.pts[Math.floor(up.pts.length / 2)];
  assert.ok(Math.abs(mid.y - (up.pts[0].y - 40)) < 1.5);
  const down = c('a -> b route=curve bend=-40');
  assert.ok(down.pts[12].y > down.pts[0].y);
  const through = c('a.bottom -> b.bottom route=curve via=292,260');
  assert.ok(through.pts.some((p) => p.x === 292 && p.y === 260));
  // through via points the curve arrives along the side it ends on: the head points straight up into b,
  // and the line stops at the head's base instead of showing through a hollow one
  const back = scene(two + 'a.bottom -> b.bottom head=triangle route=curve via=100,260;460,260\n');
  const tri = /<polygon points="([^"]+)"/.exec(renderSvg(back))![1].split(' ').map((s) => s.split(',').map(Number));
  const base = [(tri[1][0] + tri[2][0]) / 2, (tri[1][1] + tri[2][1]) / 2], len = Math.hypot(tri[0][0] - base[0], tri[0][1] - base[1]);
  assert.ok(Math.abs(tri[0][0] - base[0]) / len < 0.1 && (base[1] - tri[0][1]) / len > 0.99, `head ${tri.join(' ')}`);
  assert.ok(back.conns[0].pts.every((p) => p.x >= 80 && p.x <= 480)); // no swinging wide of the via points
  const drawn = /<path d="M [^"]* L ([\d.]+),([\d.]+)" fill="none"/.exec(renderSvg(back))!.slice(1).map(Number);
  assert.ok(drawn[1] - tri[0][1] >= 10, `line ends at ${drawn}`);
  // a bold line and a thin one carry the same arrowhead, in every look
  for (const name of ['headline', 'reference', 'whiteboard']) {
    const lk = loadLook(name === 'headline' ? `test/fixtures/looks/${name}.look` : `looks/${name}.look`);
    const svg = renderSvg(buildScene(`look "${name}.look"\na: node "A" at 40,40\nb: node "B" at 400,40\nc: node "C" at 40,200\nd: node "D" at 400,200\na -> b\nc -> d style=primary\n`, lk));
    const heads = [...svg.matchAll(/<polygon points="([^"]+)" fill=/g)].map((m) => m[1].split(' ').map((p) => p.split(',').map(Number)))
      .map(([t, p, q]) => Math.hypot(t[0] - (p[0] + q[0]) / 2, t[1] - (p[1] + q[1]) / 2).toFixed(1) + 'x' + Math.hypot(p[0] - q[0], p[1] - q[1]).toFixed(1));
    assert.equal(heads.length, 2, name);
    assert.equal(heads[0], heads[1], `${name}: ${heads.join(' vs ')}`);
  }
  const sc = scene(two + 'a -> b "carries" route=curve bend=40\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  assert.match(check(scene(two + 'a -> b route=wavy\n')).map((i) => i.msg).join(), /route=wavy is not a route; use ortho, straight or curve/);
});

test('polygons take exact corners and arcs take angles', () => {
  const sc = scene('tri: polygon "T" at 100,40 points=60,0;120,80;0,80 fill=accent\nwide: polygon at 300,40 240x40 points=60,0;120,80;0,80\npie: arc "42%" at 40,200 200x200 from=0 to=90\nring: arc at 300,200 200x200 inner=0.5\nedge: arc at 560,200 100x100 from=0 to=180 open=1\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  const tri = sc.shapes[0], wide = sc.shapes[1];
  assert.deepEqual([tri.w, tri.h, tri.poly], [120, 80, [{ x: 160, y: 40 }, { x: 220, y: 120 }, { x: 100, y: 120 }]]);
  assert.deepEqual(wide.poly, [{ x: 420, y: 40 }, { x: 540, y: 80 }, { x: 300, y: 80 }]); // stretched to 240x40
  const svg = renderSvg(sc);
  assert.ok(svg.includes('<polygon points="160,40 220,120 100,120"'));
  assert.ok(svg.includes('M 140,200 A 100 100 0 0 1 210.71,229.29 A 100 100 0 0 1 240,300 L 140,300 Z')); // quarter slice from the top
  assert.ok(svg.includes('fill-rule="evenodd"') && svg.includes('stroke-linecap="round"'));
  const msgs = (b: string) => check(scene(b)).map((i) => i.msg).join('\n');
  assert.match(msgs('p: polygon at 0,0\n'), /a polygon needs its corners/);
  assert.match(msgs('a: arc at 0,0 80x80 from=north\n'), /from=north must be a number/);
  // circles that are meant to overlap say so
  assert.match(msgs('a: ellipse at 40,40 160x160\nb: ellipse at 140,40 160x160\n'), /b overlaps a/);
  assert.doesNotMatch(msgs('a: ellipse at 40,40 160x160 overlap=ok\nb: ellipse at 140,40 160x160 overlap=ok\n'), /overlaps/);
});

test('a chart draws axes and its series from the numbers given', async () => {
  const { niceStep } = await import('../src/chart.ts');
  assert.deepEqual([niceStep(93), niceStep(100), niceStep(7), niceStep(0.9), niceStep(1200)], [20, 20, 2, 0.2, 200]);
  const sc = scene('c: chart "Revenue" at 80,80 400x200 x="Q1,Q2,Q3,Q4" unit="k" labels=1\n  | bars "2025" 40 60 _ 100\n  | line "Plan" 50 50 50 50 stroke=link\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  const svg = renderSvg(sc);
  // the scale runs 0..100 over 200px: a bar of 40 is 80px tall and stands on the axis at y=280
  assert.ok(svg.includes('y="200" width="62" height="80"'), svg.match(/<rect[^>]*height="80"[^>]*>/)?.[0] ?? svg);
  assert.equal((svg.match(/rx="2" fill="#/g) ?? []).length >= 3, true);
  assert.ok(svg.includes('>100k<') && svg.includes('>Q3<') && svg.includes('>Plan<') && svg.includes('>Revenue<'));
  assert.ok(svg.includes('points="130,180 230,180 330,180 430,180"')); // the plan line at 50, through the middle of each category
  const msgs = (b: string) => check(scene(b)).map((i) => i.msg).join('\n');
  assert.match(msgs('c: chart at 80,80\n  | bars "A" 1 2\n'), /a chart needs a size for its plot area/);
  assert.match(msgs('c: chart at 80,80 200x100\n  | pie "A" 1 2\n'), /a chart row starts with the kind of series: bars, line, area, dots/);
  assert.match(msgs('c: chart at 80,80 200x100 x="A,B,C"\n  | bars "Sales" 1 2\n'), /"Sales" has 2 values but x= names 3 categories/);
  // numeric x axis with points given as x,y
  const xy = renderSvg(scene('c: chart at 80,80 400x200 x=0..100 y=0..400\n  | dots "p50" 50,200 100,400\n'));
  assert.ok(xy.includes('<circle cx="280" cy="180"') && xy.includes('<circle cx="480" cy="80"'));
});

test('a chart with a hostile step or range still renders, quickly, and says what is wrong', () => {
  for (const bad of ['step=0', 'step=-5', 'step=1e-12', 'step=NaN', 'y=100..0', 'y=5..5', 'x=10..0 xstep=0', 'x=0..1e9 xstep=1e-9', 'y=100000000000000000..100000000000000050 step=1', 'y=0..999999999999999 step=0.5', 'x=99999999999999990..99999999999999999 xstep=1']) {
    const sc = scene(`c: chart at 80,80 400x200 ${bad}\n  | bars "A" 1 2 3 1e300 100000000000000000\n  | dots "B" 1,2 3,4\n`);
    const t = performance.now();
    const svg = renderSvg(sc);
    assert.ok(performance.now() - t < 200, bad);
    assert.ok(svg.length < 60000 && !svg.includes('NaN') && !svg.includes('Infinity'), bad);
  }
  const msgs = (b: string) => check(scene(b)).map((i) => i.msg).join('\n');
  assert.match(msgs('c: chart at 80,80 400x200 step=0\n  | bars "A" 1 2\n'), /step=0 must be a number above 0/);
  assert.match(msgs('c: chart at 80,80 400x200 y=100..0\n  | bars "A" 1 2\n'), /y=100..0 must run upwards/);
});

test('lines that share a start point may share a trunk; text can sit left or right', () => {
  const tree = 'root: node "Root" at 300,40\na: node "A" at 100,200\nb: node "B" at 500,200\nroot.bottom@0.5 -> a.top\nroot.bottom@0.5 -> b.top\n';
  assert.deepEqual(check(scene(tree)).filter((i) => i.level !== 'hint'), []);
  const svg = renderSvg(scene('z: zone "Group" at 40,40 400x200 title.align=left\nn: node "Name" at 80,100 200x64 sub="detail" title.align=right\n'));
  assert.ok(svg.includes('text-anchor="end"') && svg.includes(`x="${80 + 200 - 12}"`));
});

test('legend swatches, turned text, lines behind boxes, text in a triangle, and a line with no length', () => {
  const sc = scene('n: node "N" at 200,100\n40,132 -- 600,132 layer=back\nt: polygon "Top" at 400,200 points=60,0;120,90;0,90\ntext "Revenue" at 30,300 rotate=-90\nwm: text "2025" at 60,60 size=40 overlap=ok\ntext "label" at 70,50\nlegend at 40,340 dot.accent="Shipped" swatch.muted="Planned" line.link="Depends on" focal="Main"\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  const svg = renderSvg(sc);
  assert.ok(svg.includes('transform="rotate(-90 30 300)"'));
  assert.ok(svg.includes('<text x="460" y="') && svg.includes('>Top<')); // centred on the triangle's area: lower than the box middle
  assert.ok(Number(/<text x="460" y="([\d.]+)"/.exec(svg)![1]) > 250);
  assert.equal(sc.shapes.find((s) => s.legend)!.legend!.length, 4);
  assert.ok(svg.includes('>Shipped<') && svg.includes('r="4.5"'));
  const turned = sc.texts.find((t) => t.text === 'Revenue')!;
  assert.ok(turned.h > turned.w && turned.y < 300 && turned.y + turned.h <= 300.01);
  const msgs = (b: string) => check(scene(b)).map((i) => i.msg).join('\n');
  assert.match(msgs('a: node "A" at 40,40 100x40\nb: node "B" at 140,80 100x40\na.right@80 -> b.left@80\n'), /meet at the same point \(140,80\)/);
  assert.match(msgs('text "x" at 40,40 rotate=sideways\n'), /rotate=sideways: an angle in degrees/);
  assert.doesNotMatch(msgs('text "x" at 40,40 rotate=45\n'), /rotate/);
});

test('rotate= turns a shape about its middle and a text about its at point; lines meet the turned sides', () => {
  const sc = scene('a: node "A" at 40,40 120x40\nb: node "B" at 300,40 120x40 rotate=90\nc: node "C" at 300,240 120x40 rotate=45\na -> b\nb -> c route=curve\ntext "Slant" at 40,200 rotate=30\n');
  const svg = renderSvg(sc);
  assert.ok(svg.includes('<g transform="rotate(90 360 60)">'));
  assert.ok(svg.includes('<g transform="rotate(45 360 260)">'));
  assert.ok(svg.includes('transform="rotate(30 40 200)"'));
  // b stands upright now (40 wide, 120 tall): a quarter turn faces its own bottom side left, towards a
  const ab = sc.conns[0];
  assert.equal(ab.b.side, 'bottom');
  assert.deepEqual(ab.pts[ab.pts.length - 1], { x: 340, y: 60 });
  assert.deepEqual(ab.b.dir, { x: -1, y: 0 });
  // a curve arrives along c's turned side: its top side, turned 45 degrees, faces up and to the right
  const bc = sc.conns[1];
  assert.equal(bc.b.side, 'top');
  assert.deepEqual(bc.pts[bc.pts.length - 1], { x: 374, y: 246 });
  assert.ok(Math.abs(bc.b.dir!.x - Math.SQRT1_2) < 1e-9 && Math.abs(bc.b.dir!.y + Math.SQRT1_2) < 1e-9);
  // the picture grows to hold the turned shape: b reaches up to y=0, so the page starts 40px above that
  assert.equal(sc.y, -40);
  const t = sc.texts[0];
  assert.ok(t.frame && t.h > t.frame.h);
  assert.deepEqual(check(scene('a: node "A" at 40,40 120x40 rotate=45\nb: node "B" at 180,40 120x40\n')).filter((i) => i.level === 'warn'), []);
  assert.match(check(scene('a: node "A" at 40,40 120x40 rotate=45\nb: node "B" at 120,40 120x40\n')).map((i) => i.msg).join('\n'), /b overlaps a/);
});

test('sub text can run over several lines, and a tag on a short box is reported', () => {
  const sc = scene('a: node "Checkout" sub="cart to order\\nstorefront" at 40,40 176x72\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  const svg = renderSvg(sc);
  assert.ok(svg.includes('>cart to order<') && svg.includes('>storefront<'));
  const msgs = (b: string) => check(scene(b)).map((i) => i.msg).join('\n');
  assert.match(msgs('r: focal "Row-level permissions" sub="RPT-114" tag="RISK" at 40,40 176x48\n'), /the tag "RISK" sits on the text of r; make it at least 52px tall/);
  assert.doesNotMatch(msgs('r: focal "Orders API" sub="REST" tag="API" at 40,40\n'), /sits on the text/);
  // on a cylinder the tag sits under the top cap, not on its rim
  for (const name of ['headline', 'sketch']) {
    const sc = buildScene(`look "${name}.look"\nm: store "MDX Bundle" sub="src/content/*.mdx" tag="MDX" at 788,136 160x64\n`, loadLook(name === 'headline' ? `test/fixtures/looks/${name}.look` : `looks/${name}.look`));
    const tag = /<rect x="([\d.]+)" y="([\d.]+)" width="[\d.]+" height="([\d.]+)" rx="2" fill="none"/.exec(renderSvg(sc))!.slice(1).map(Number);
    assert.ok(tag[1] - 136 >= 64 * 0.2 + 2, `${name}: tag top ${tag[1] - 136}px into a 64px cylinder`);
    assert.ok(!check(sc).some((i) => /sits on the text/.test(i.msg)), name);
  }
  // in every look a corner tag stays clear of the outline and of the title under it, even on a short box
  for (const name of ['headline', 'reference', 'sketch', 'whiteboard']) {
    const lk = loadLook(name === 'headline' ? `test/fixtures/looks/${name}.look` : `looks/${name}.look`);
    const sc = buildScene(`look "${name}.look"\nd: external "DB Connection" sub="CDC · SQL · API" tag="EXT" at 72,316 160x56\n`, lk);
    assert.ok(!check(sc).some((i) => /sits on the text/.test(i.msg)), name);
    const svg = renderSvg(sc);
    const tag = /<rect x="([\d.]+)" y="([\d.]+)" width="[\d.]+" height="([\d.]+)" rx="2" fill="none"/.exec(svg)!.slice(1).map(Number);
    const size = Number(sc.shapes[0].p['title.size'] ?? 12);
    const titleY = Number(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*>DB Connection<`).exec(svg)![1]);
    assert.ok(tag[0] - 72 >= 8 && tag[1] - 316 >= 6, `${name}: tag inset ${tag[0] - 72},${tag[1] - 316}`);
    assert.ok(titleY - size * 0.72 >= tag[1] + tag[2] + 2, `${name}: title top ${titleY - size * 0.72} vs tag bottom ${tag[1] + tag[2]}`);
    assert.ok(/CDC · SQL · API/.test(svg) && Number(/<text x="[\d.]+" y="([\d.]+)"[^>]*>CDC · SQL · API</.exec(svg)![1]) <= 316 + 56 - 2, name);
  }
});

test('tinted legend swatches, lines in front of shapes, and no alignment hints between free-form shapes', () => {
  const sc = scene('f: polygon at 100,100 points=0,0;120,0;120,81;0,80 fill=#ffffff overlap=ok\ng: polygon at 101,200 points=0,0;120,0;120,80;0,80 overlap=ok\n160,100 -- 160,180 layer=front stroke=ink\nlegend at 40,340 swatch.muted/0.2="Flow"\n');
  assert.deepEqual(check(sc), []);
  const svg = renderSvg(sc);
  assert.ok(svg.indexOf('M 160,100') > svg.indexOf('<polygon points="100,100'));
  assert.ok(svg.includes('>Flow<') && /fill="rgba\([\d,]+,0\.2\)"/.test(svg));
});

test('tables: cell tints, spanning rows, two-line headers, and -- between rows is right-angled', () => {
  const sc = scene('a: table "«interface»\\nPayment" at 40,40\n  | id "id" "uuid" "PK" fill.3=accent/0.2 color.3=accent\n  | "idx_orders_customer_id_created_at"\nb: table "B" at 400,120\n  | fk "a_id" "uuid"\nb.fk -- a.id tail=many head=only-one\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  const a = sc.shapes[0], c = sc.conns[0];
  assert.equal(a.headH, 32 + 16);
  assert.ok(a.cols![0].w > 100); // spare width, not the long single cell, sets column 1... the span row sets the table width
  assert.equal(c.style, 'relation');
  assert.ok(c.ortho && c.pts.every((p, i) => i === 0 || p.x === c.pts[i - 1].x || p.y === c.pts[i - 1].y));
  const svg = renderSvg(sc);
  assert.ok(svg.includes('>«interface»<') && svg.includes('>Payment<') && /<rect[^>]*fill="rgba\([\d,]+,0\.2\)"/.test(svg));
  assert.match(check(scene('r: rect "A" at 40,40 100x40 color=#ffffff\n')).map((i) => i.msg).join(), /color= does nothing on a shape; its text is set with title.color=/);
});

test('a cell colour is plain text even when it looks like a replacement pattern', () => {
  for (const evil of ["$'", '$`', '$&$&', '" onload="alert(1)', "$' onload=alert(1) x=$`"]) {
    const svg = renderSvg(scene(`t: table "T" at 40,40\n  | "a" "b" color.2="${evil.replace(/"/g, '\\"')}" fill.2="${evil.replace(/"/g, '\\"')}"\n`));
    assert.equal((svg.match(/<text /g) ?? []).length, 3, evil);
    assert.ok(!/<text[^>]*font-family="[^"]*"[^>]*font-family=/.test(svg), evil); // nothing spliced in twice
    assert.ok(!/ onload="/.test(svg), evil);
  }
});

test('chart: one bar in its own colour, outlines, signed steps, vertical grid, bubbles on a numeric axis', () => {
  const sc = scene('c: chart at 80,60 300x120 x="A,B,C" labels=1 grid=x\n  | bars "S" 0,100 100,160 fill=soft fill.2=accent stroke=ink\nd: chart at 440,60 300x200 x=0..10 y=-10..10 zero=0\n  | dots "B" 5,0,12 2,5\ntext "note" at 76,100 anchor=middle\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  const svg = renderSvg(sc);
  assert.ok(svg.includes('>+60<') && svg.includes('>100<') && !svg.includes('>+100<'));
  assert.equal((svg.match(/stroke-width="1"\/>/g) ?? []).length >= 2, true);
  assert.ok(svg.includes('<circle cx="590" cy="160" r="12"'));
  assert.equal((svg.match(/y1="160" x2="740" y2="160"/g) ?? []).length, 1); // the grid line at 0, and no axis line on top of it
});

test('icons: on a box, on their own, from the look, and with clear errors', () => {
  const sc = scene('a: node "Orders DB" icon=database at 40,40\nb: node "Top" icon=server icon.pos=top at 240,40 144x96\nc: icon at 440,40 icon=cloud\nd: node icon=lock at 520,40 48x48\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  const svg = renderSvg(sc);
  assert.equal((svg.match(/<g transform="translate\(/g) ?? []).length, 4);
  // built-in icons are Phosphor's filled shapes, scaled from their 256 box (a 20px icon on a box)
  assert.ok(svg.includes(`scale(${+(20 / 256).toFixed(5)})`) && !svg.includes('stroke-linecap="round"'));
  // the icon and the text are centred as a pair: the title no longer sits on the box centre
  const x = Number(/<text x="([\d.]+)"[^>]*>Orders DB</.exec(svg)![1]);
  assert.ok(x > 40 + 72 + 8);
  const msgs = (b: string) => check(scene(b)).map((i) => i.msg).join('\n');
  assert.match(msgs('a: node "A" icon=unicorn at 40,40\n'), /there is no icon called "unicorn"; the look has: /);
  assert.match(msgs('a: node "A" icon=server icon.pos=top at 40,40 144x40\n'), /the icon and text of a need \d+px of height/);
  assert.match(msgs('a: node "A long name here" icon=server at 40,40 120x48\n'), /does not fit in a/);
  const look = parseLook('icon bolt "M13 3 L4 14 H12 L11 21 L20 10 H12 Z"\nicon bad "<script>"\nstyle hot extends rect icon=bolt\n');
  assert.ok(look.icons.has('bolt') && !look.icons.has('bad') && look.icons.has('server'));
  assert.match(look.issues.map((i) => i.msg).join(), /icon bad needs its outline as SVG path data/);
  assert.ok(renderSvg(buildScene('look "x.look"\nh: hot "Fast" at 40,40 120x48\n', look)).includes('M13 3 L4 14'));
});

test('icon.style=solid draws the filled twin of a built-in icon in one colour', () => {
  const sc = scene('a: node "Orders DB" icon=database icon.style=solid icon.color=#ff0000 at 40,40\nb: icon at 300,40 icon=cloud icon.style=solid stroke=#0000ff\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  const svg = renderSvg(sc);
  assert.ok(svg.includes('fill="#ff0000"><path d="M128,24'), 'the box icon is filled in icon.color');
  assert.ok(/scale\(0\.0[0-9]+\)"><g fill="#0000ff">/.test(svg), 'the icon shape is filled in its stroke colour, scaled from the 256 box');
  assert.ok(!/stroke="#ff0000"/.test(svg));
  // every built-in icon has a solid twin
  for (const n of Object.keys(ICONS)) assert.ok(SOLID_ICONS[n]?.length, `solid ${n}`);
  const msgs = (b: string) => check(scene(b)).map((i) => i.msg).join('\n');
  assert.match(msgs('a: node "A" icon=server icon.style=filled at 40,40\n'), /icon.style=filled: an icon is drawn as an outline/);
  const look = parseLook('icon bolt "M13 3 L4 14 H12 L11 21 L20 10 H12 Z"\n');
  assert.match(check(buildScene('look "x.look"\na: rect "A" icon=bolt icon.style=solid at 40,40\n', look)).map((i) => i.msg).join(), /icon bolt is the look's own, with no solid version/);
});

test('icon.style=duotone draws the regular outline over a light tint of the same drawing', () => {
  const sc = scene('a: icon at 40,40 icon=user icon.style=duotone stroke=#ff0000\nb: node "Box" icon=database icon.style=duotone icon.fill=#00ff00/0.3 at 200,40\nc: icon at 400,40 icon=user\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  const svg = renderSvg(sc);
  // the tint, in the icon's colour made light, then the same outline as icon.style=outline
  assert.ok(svg.includes(`<path d="${DUOTONE_TINT.user[0]}" fill="#ff0000" fill-opacity="0.2"/><g fill="#ff0000"><path d="${ICON_WEIGHTS.regular.user[0]}"/>`));
  // icon.fill, when set, is the tint
  assert.ok(svg.includes(`<path d="${DUOTONE_TINT.database[0]}" fill="rgba(0,255,0,0.3)"/>`));
  // a plain outline has no tint
  assert.equal(svg.split(DUOTONE_TINT.user[0]).length - 1, 1);
  const look = parseLook('icon bolt "M13 3 L4 14 H12 L11 21 L20 10 H12 Z"\n');
  assert.match(check(buildScene('look "x.look"\na: rect "A" icon=bolt icon.style=duotone at 40,40\n', look)).map((i) => i.msg).join(), /icon bolt is the look's own, with no duotone version/);
  assert.match(check(scene('a: icon at 40,40 icon=user icon.style=dotted\n')).map((i) => i.msg).join(), /icon\.style=dotted: .*icon\.style=duotone/);
});

test('an icon on its own is the shape: no box, fill/stroke/sw style the icon, its text is a caption underneath', async () => {
  const { captionBox } = await import('../src/scene.ts');
  const sc = scene('db: icon "Orders DB" sub="Postgres" at 40,40 40x40 icon=database fill=#2e8540/0.2 stroke=#2e8540 sw=2\nu: icon at 200,40 icon=user\n');
  const svg = renderSvg(sc);
  assert.ok(!/<rect x="40" y="40" width="40"/.test(svg), 'no box is drawn around the icon');
  // 40px icon from the 256 box: fill= is the tint under it, stroke= its colour, and a 2px line (12.8 in
  // the 256 box) picks the light weight
  assert.ok(svg.includes(`translate(40 40) scale(0.15625)"><path d="${DUOTONE_TINT.database[0]}" fill="rgba(46,133,64,0.2)"/><g fill="#2e8540"><path d="${ICON_WEIGHTS.light.database[0]}"/>`));
  const caption = /<text x="60" y="([\d.]+)" text-anchor="middle"[^>]*>Orders DB</.exec(svg);
  assert.ok(caption && +caption[1] > 80 + 6, 'the caption sits under the icon, centred');
  assert.ok(svg.includes('>Postgres<'));
  assert.match(svg, /translate\(200 40\) scale\(0\.09375\)"><g fill="[^"]+"><path d="/); // no fill: no tint
  // a caption wider than its icon needs no room inside it, and the picture's extent takes it in
  assert.deepEqual(check(sc).filter((i) => i.level === 'warn').map((i) => i.msg), []);
  const cb = captionBox(sc.shapes[0])!;
  assert.ok(cb.w > 40 && cb.y === 86 && sc.y + sc.h >= cb.y + cb.h + 40 && sc.x <= cb.x - 40);
});

test('built-in icons: every one in each style, a search finds them by meaning as well as name', async () => {
  const { ICONS, ICON_WORDS, iconMatches } = await import('../src/icons.ts');
  assert.ok(Object.keys(ICONS).length >= 120);
  for (const name of Object.keys(ICONS)) {
    assert.match(name, /^[a-z][a-z0-9-]*$/);
    for (const w of ['thin', 'light', 'regular', 'bold', 'fill'] as const) assert.ok(ICON_WEIGHTS[w][name]?.length, `${w} ${name}`);
    assert.ok(DUOTONE_TINT[name], `duotone ${name}`);
  }
  assert.deepEqual(Object.keys(ICON_WORDS).filter((n) => !ICONS[n]), []);
  const find = (w: string) => Object.keys(ICONS).filter((n) => iconMatches(n, w));
  assert.ok(find('email').includes('mail') && find('k8s').includes('pod') && find('db').includes('database') && find('lambda').includes('function'));
  assert.ok(find('load balancer').includes('load-balancer') && find('').length === Object.keys(ICONS).length);
  // icon.width is the line's thickness in pixels at the size the icon is drawn, and picks the nearest
  // weight: at 24px, 2.5 is bold and 0.4 thin; with none, regular
  const svg = renderSvg(scene('a: icon at 40,40 icon=database icon.color=#112233 icon.width=2.5\nb: icon at 100,40 icon=database\nc: icon at 160,40 icon=database icon.width=0.4\n'));
  assert.ok(svg.includes(`<g fill="#112233"><path d="${ICON_WEIGHTS.bold.database[0]}"/>`));
  assert.ok(svg.includes(`<path d="${ICON_WEIGHTS.regular.database[0]}"/>`) && svg.includes(`<path d="${ICON_WEIGHTS.thin.database[0]}"/>`));
  assert.match(check(scene('a: icon at 40,40 icon=server icon.width=thick\n')).map((i) => i.msg).join(), /icon\.width=thick: the icon's line thickness in pixels/);
  // a wrong name points at what was probably meant first
  const msg = check(scene('a: node "A" icon=email at 40,40\n')).map((i) => i.msg).join();
  assert.match(msg, /there is no icon called "email"; the look has: mail, /);
});

test('icon files from a look folder: named from the file, drawn as images, carried in exports, never trusted', async () => {
  const { iconName, withIconImages, isIconUri, svgDataUri } = await import('../src/iconfiles.ts');
  assert.deepEqual(['10021-icon-service-Virtual-Machine.svg', 'Load Balancer.SVG', '  App_Service (v2).svg'].map(iconName), ['virtual-machine', 'load-balancer', 'app-service-v2']);
  const file = 'examples/look-test/team-icons.fdraw';
  const sc = loadScene(file);
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  assert.deepEqual([...sc.look.images.keys()], ['sample-screen', 'hostile', 'sample-grid']);
  const svg = renderSvg(sc);
  assert.equal((svg.match(/<image [^>]*href="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+"\/>/g) ?? []).length, 4);
  assert.ok(!svg.includes('<script') && !svg.includes('onload') && !svg.includes('example.invalid')); // the hostile file stays sealed inside its image
  const payload = readSources(file, sc);
  assert.deepEqual(Object.keys(payload.icons ?? {}).sort(), ['hostile', 'sample-grid', 'sample-screen']);
  // an image someone hands you can carry icons: only well-formed SVG data URIs under sane names are taken
  const look = withIconImages(loadLook('looks/reference.look'), [{ name: 'not-svg.svg', bytes: new TextEncoder().encode('hello') }, { name: 'big.svg', bytes: new Uint8Array(400_000) }], {
    ok: svgDataUri(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), js: 'javascript:alert(1)', html: 'data:text/html;base64,PHNjcmlwdD4=',
    'bad name"': 'data:image/svg+xml;base64,AAAA', quote: 'data:image/svg+xml;base64,AAAA" onload="alert(1)', num: 5,
  });
  assert.deepEqual([...look.images.keys()], ['ok']);
  assert.ok(!isIconUri('data:image/svg+xml;base64,AA" x="'));
  const msgs = check(buildScene('look "x.look"\na: rect "A" at 40,40 120x48 icon=sample\n', sc.look)).map((i) => i.msg).join();
  assert.match(msgs, /there is no icon called "sample"; the look has: sample-screen, sample-grid, hostile, /);
});

test('a look cannot reach outside its own folder for icons or fonts, nor through symbolic links', async () => {
  const { mkdirSync, symlinkSync } = await import('node:fs');
  const root = mkdtempSync(tmpdir() + '/fd-'), svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>';
  mkdirSync(root + '/proj/icons', { recursive: true }); mkdirSync(root + '/outside');
  writeFileSync(root + '/outside/secret.svg', svg);
  writeFileSync(root + '/proj/icons/mine.svg', svg);
  symlinkSync(root + '/outside/secret.svg', root + '/proj/icons/linked.svg');
  symlinkSync(root + '/outside', root + '/proj/sneaky');
  const names = (dir: string) => { writeFileSync(root + '/proj/t.look', `icondir "${dir}"\nfontdir "${dir}"\n`); return [...loadLook(root + '/proj/t.look').images.keys()]; };
  assert.deepEqual(names('./icons'), ['mine']); // the symlinked file is skipped
  assert.deepEqual(names('../outside'), []);
  assert.deepEqual(names(root + '/outside'), []);
  assert.deepEqual(names('./sneaky'), []); // a symlinked folder that leads outside
  assert.deepEqual(names('./icons/../../outside'), []);
  assert.match(loadLook(root + '/proj/t.look').issues.map((i) => i.msg).join(), /icondir must be a folder inside the folder that holds the look file/);
});

test('text that cannot be read against its background is reported; plain-line styles never grow heads', () => {
  const dflt = (b: string) => check(buildScene(`canvas 800x400\n${b}`, null)).map((i) => i.msg).join('\n');
  assert.match(dflt('b: focal "Blocked" sub="waiting" at 40,40 dash=4,4 fill=accent/0.05 title.color=#ffffff\n'), /the text of b is almost the same colour as its background/);
  assert.match(dflt('f: focal "Assess" at 40,40 160x80 fill=accent\ntext "case and report" at 60,100 size=9\ntext "ok" at 60,84 size=9 color=accent\n'), /text the unnamed element on line 4 is almost the same colour as f behind it/);
  assert.doesNotMatch(dflt('f: focal "Assess" sub="fine" at 40,40\nn: node "Plain" sub="also fine" at 240,40\ntext "on paper" at 40,200\ntext "2025" at 40,300 size=60 color=ink/0.06\n'), /cannot be read/);
  assert.match(dflt('r: rect at 41,40 100x40\n'), /the unnamed element|r is off the 4px grid/);
  const sc = buildScene('canvas 800x400\n40,100 -> 400,100 style=rule\n40,200 -> 400,200 style=rule head=open\n40,300 -> 400,300\n', null);
  assert.deepEqual(sc.conns.map((c) => c.headM), ['none', 'open', 'arrow']);
});

test('a stroke drawn by hand is one smooth open line that nothing treats as a box', () => {
  const sc = scene('a: rect "A" at 40,100 120x48\nb: rect "B" at 400,100 120x48\nring: freehand at 20,60 points=0,60;40,0;160,0;180,60;160,120;40,120;0,62\nmark: freehand at 240,90 points=0,0;40,60;80,0\na -> b "calls"\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []); // circling a box, or lying across an arrow and its label, is not a problem
  assert.deepEqual(sc.conns[0].pts, [{ x: 160, y: 124 }, { x: 400, y: 124 }]); // the arrow runs straight under the mark, not around it
  assert.match(renderSvg(sc), /<path d="M 20,120 C [^"]+" stroke-linejoin="round" fill="none" stroke="[^"]+" stroke-width="2" stroke-linecap="round"\/>/);
});

test('legend swatches take hex colours; an unfilled badge on a filled box is judged against that box', () => {
  const dflt = (b: string) => buildScene(`canvas 800x400\n${b}`, null);
  const sc = dflt('f: focal "Shared types" at 40,40 160x64 fill=accent title.color=#ffffff\nb: rect "4 in" at 152,44 40x16 fill=none stroke=#ffffff title.color=#ffffff title.size=8 overlap=ok\nlegend at 40,300 swatch.#4a7c59="Stream" dot.#b07a2a/0.5="Table"\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint'), []);
  assert.ok(renderSvg(sc).includes('fill="#4a7c59"'));  // the same white badge with no dark box under it is on paper, and is reported
  assert.match(check(dflt('b: rect "4 in" at 152,44 48x16 fill=none stroke=ink title.color=#ffffff title.size=8\n')).map((i) => i.msg).join(), /the text of b is almost the same colour as its background/);
});

test('an edit keeps the quotes a property was written with, and adds them only where needed', () => {
  const src = 'key: legend at 40,300 title="Key" external="Shopper" focal=Plain\n';
  const out = patchSource(src, new Map([[1, (t) => setProp(t, 'focal', 'The service')]]));
  assert.equal(out, 'key: legend at 40,300 title="Key" external="Shopper" focal="The service"\n');
  const again = patchSource(out, new Map([[1, (t) => setProp(t, 'external', 'Buyer')]]));
  assert.equal(again, 'key: legend at 40,300 title="Key" external="Buyer" focal="The service"\n');
});

test('no page: the picture is what is drawn plus a margin, anywhere, and an old canvas size is only a hint', () => {
  const sc = scene('a: node at -200,-120 120x40\nb: node at 300,200 120x40\n-80,-60 -> a');
  assert.deepEqual([sc.x, sc.y, sc.w, sc.h], [-240, -160, 700, 440]);
  assert.deepEqual(sc.conns[0].pts[0], { x: -80, y: -60 }); // two minus signs are a point, not an offset
  assert.match(renderSvg(sc), /viewBox="-240 -160 700 440"/);
  assert.ok(!check(sc).some((i) => /outside/.test(i.msg)));
  const empty = scene('');
  assert.deepEqual([empty.x, empty.y, empty.w, empty.h], [0, 0, 400, 240]);
  const old = buildScene('canvas 800x400\na: node at 40,40', look);
  assert.equal(old.issues.filter((i) => i.level === 'error').length, 0);
  assert.notEqual(old.w, 800); // the size comes from the content
  assert.match(check(old).map((i) => i.msg).join('|'), /canvas has no size any more/);
});

test('export without a background leaves out the page and its dots, and keeps everything drawn on it', () => {
  const sc = scene('a: node "A" at 40,40\nb: node "B" at 240,40\na -> b\n');
  const full = renderSvg(sc), bare = renderSvg(sc, undefined, { background: false });
  assert.match(full, /<rect class="fd-page" x="0" y="0" width="\d+" height="\d+" fill=/);
  assert.match(full, /fd-dots/);
  assert.doesNotMatch(bare, /fd-page/);
  assert.doesNotMatch(bare, /fd-dots/);
  assert.match(bare, /<rect x="40" y="40"/);
  assert.match(bare, new RegExp(`viewBox="0 0 ${sc.w} ${sc.h}"`));
});

test('fastdraw render: --transparent and --no-embed', async () => {
  const { execFileSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'fd-export-'));
  const f = join(dir, 'd.fdraw'), body = 'a: node "A" at 40,40\n';
  writeFileSync(f, body);
  const cli = (...a: string[]) => execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', new URL('../src/cli.ts', import.meta.url).pathname, 'render', f, ...a], { encoding: 'utf8' });
  assert.match(cli('-o', join(dir, 'a.svg'), '--transparent', '--no-embed'), /no background, no diagram inside/);
  const svg = readFileSync(join(dir, 'a.svg'), 'utf8');
  assert.equal(extractSvg(svg), null);
  assert.doesNotMatch(svg, /fd-page/);
  cli('-o', join(dir, 'b.png'), '--scale', '1', '--transparent');
  const png = new Uint8Array(readFileSync(join(dir, 'b.png')));
  assert.equal(new DataView(png.buffer, png.byteOffset).getUint32(16), buildScene(body, defaultLook()).w); // IHDR width, at 1x: the drawing plus its margin
  assert.equal(png[25], 6); // RGBA: the page is see-through
  assert.equal(extractPng(png)?.diagram, body);
  cli('-o', join(dir, 'c.png'), '--no-embed');
  assert.equal(extractPng(new Uint8Array(readFileSync(join(dir, 'c.png')))), null);
});

test('a diagram\'s canvas line can override the look\'s background, with or without an old size on it', async () => {
  const sc = buildScene('look "x.look"\ncanvas paper=#ffffff dots=none\na: node "A" at 20,20', look);
  assert.equal(sc.issues.length, 0);
  assert.equal(sc.look.canvas.paper, '#ffffff');
  assert.equal(sc.baseCanvas!.paper, 'paper');
  assert.equal(look.canvas.paper, 'paper', 'the shared look is not changed');
  const svg = renderSvg(sc);
  assert.match(svg, /fill="#ffffff"/);
  assert.doesNotMatch(svg, /fd-dots/);
  assert.equal(buildScene('look "x.look"\ncanvas 400x200 paper=#ffffff\na: node "A" at 20,20', look).look.canvas.paper, '#ffffff');
  assert.match(buildScene('look "x.look"\ncanvas fill=#fff', look).issues[0].msg, /canvas only takes paper=/);

  const { setCanvas } = await import('../editor/src/ops.ts');
  const src = 'look "x.look"\ncanvas paper=#eef2f7\na: node "A" at 20,20';
  const dotsOff = setCanvas(src, buildScene(src, look), { dots: 'none' });
  assert.match(dotsOff, /^canvas paper=#eef2f7 dots=none$/m);
  const reset = setCanvas(dotsOff, buildScene(dotsOff, look), { paper: null, dots: null });
  assert.doesNotMatch(reset, /canvas/); // nothing left on the line, so it goes
  const noLine = 'look "x.look"\na: node "A" at 20,20';
  assert.match(setCanvas(noLine, buildScene(noLine, look), { paper: '#ffffff' }), /^look "x.look"\ncanvas paper=#ffffff\n/);
});

test('a step forward or backward moves past the next overlapping element in the same stack', async () => {
  const { reorderStep } = await import('../editor/src/ops.ts');
  const { moveStatementsPast } = await import('../src/edit.ts');
  const body = 'a: node at 0,0\nb: node at 500,0\n// note\nc: node at 40,20\nt: text "hi" at 0,0\nd: node at 60,30\n';
  const src = `look "x.look"\n${body}`;
  const sc = buildScene(src, look);
  const ids = (s: string) => s.split('\n').map((l) => l.split(':')[0]).filter((x) => /^[a-z]$/.test(x));
  // a skips b (not touching) and goes just over c, the first shape it overlaps; the text stays where it is
  assert.deepEqual(ids(reorderStep(src, sc, ['a'], 'forward')), ['b', 'c', 'a', 't', 'd']);
  // d steps back under c, not under the text
  assert.deepEqual(ids(reorderStep(src, sc, ['d'], 'backward')), ['a', 'b', 'd', 'c', 't']);
  // two picked: both pass c together and keep their order
  assert.deepEqual(ids(reorderStep(src, sc, ['a', 'b'], 'forward')), ['c', 'a', 'b', 't', 'd']);
  // already on top of its stack: nothing changes
  assert.equal(reorderStep(src, sc, ['d'], 'forward'), src);
  // comments and blank lines stay put
  assert.equal(moveStatementsPast('a: x\n// c\nb: y\n', [{ line: 1, anchor: 3, where: 'after' }]), '// c\nb: y\na: x\n');
});

test('spaces in a text are drawn as written: indentation and runs of spaces, in texts, cells and second lines', async () => {
  const { splitCells } = await import('../src/edit.ts');
  const { bundledFonts } = await import('../src/node.ts');
  const { Resvg } = await import('@resvg/resvg-js');
  const body = 'canvas 400x300\nt1: text "  orders:" at 40,40 font=mono\nt2: text "a b" at 40,60\nt: table "T" at 40,100\n  | "x    y" | "    z"\nn: node "N" sub="  a   b" at 200,40 160x64\n';
  const sc = scene(body);
  assert.equal(sc.texts.find((t) => t.id === 't1')!.text, '  orders:'); // the parser keeps them
  const svg = renderSvg(sc);
  for (const t of ['  orders:', 'x    y', '    z', '  a   b']) assert.match(svg, new RegExp(`<text xml:space="preserve"[^>]*>${t}</text>`), t);
  assert.match(svg, /<text (?!xml:space)[^>]*>a b<\/text>/); // a plain text is left as it was
  // in the PNG the indented text starts four characters to the right of the same text without the spaces
  const left = (src: string) =>
    new Resvg(renderSvg(scene(src), undefined, { background: false }), { font: { fontFiles: bundledFonts(), loadSystemFonts: false, defaultFontFamily: 'Geist' } }).getBBox()!.x;
  const shift = left('canvas 200x60\nt: text "    abc" at 20,30 font=mono size=10') - left('canvas 200x60\nt: text "abc" at 20,30 font=mono size=10');
  assert.ok(Math.abs(shift - 24) < 1.5, `indent drawn ${shift}px`); // four spaces of a 10px mono font
  // the widths that size a table count the spaces
  const w = (cell: string) => scene(`t: table "T" at 0,0\n  | "${cell}"`).shapes[0].w;
  assert.ok(w('            abc') > w('abc'));
  // the editor's row input: one space either side of "|" is the separator, the rest stays with the cell
  assert.deepEqual(splitCells('  a |   b | c  '), ['  a', '  b', 'c']);
  assert.deepEqual(splitCells('x    y |     z'), ['x    y', '    z']);
  // and the write-back keeps them
  assert.equal(fmtStmt(setText(parseStatements('a: text "x" at 0,0')[0].toks, '    y')), 'a: text "    y" at 0,0');
});

test('opacity= draws a box, a line with its label, or a text see-through, clamped to 0..1', () => {
  const svg = (src: string) => renderSvg(buildScene(src, defaultLook(), ''));
  const out = svg('a: node "A" at 40,40 opacity=0.5\nb: node "B" at 260,40\na -> b "go" opacity=0.25\ntext "Note" at 40,160 opacity=2\n');
  assert.equal(out.match(/<g opacity="0.5">/g)?.length, 1); // the box, as one layer
  assert.equal(out.match(/<g opacity="0.25">/g)?.length, 2); // the line, and its label
  assert.doesNotMatch(out, /<g opacity="(1|2)"/); // over 1 is drawn as usual
  assert.match(svg('a: node "A" at 40,40 opacity=-1\n'), /<g opacity="0">/);
});

test('page patterns that would vanish into the page are drawn in white (or black) at the same strength', () => {
  const svg = (src: string) => renderSvg(buildScene(src, defaultLook(), ''));
  const dark = svg('canvas paper=#0d0f14 dots=ink/0.07 grid=#2a6df4/0.3\na: node "A" at 40,40\n');
  assert.match(dark, /<pattern id="fd-dots"[^>]*><circle [^>]*fill="rgba\(255,255,255,0.07\)"/);
  assert.doesNotMatch(dark, /id="fd-grid"[^>]*><path [^>]*stroke="rgba\(255,255,255/); // a colour that shows is left alone
  assert.doesNotMatch(svg('canvas paper=#ffffff dots=ink/0.07\na: node "A" at 40,40\n'), /rgba\(255,255,255,0.07\)/); // a light page: as before
});

test('a text box wraps its words to its width and lines them up with align=', () => {
  const sc = buildScene('t: text "one two three four five six" at 40,40 width=90 align=right\n', defaultLook(), '');
  const t = sc.texts[0]!;
  assert.deepEqual(sc.issues, []);
  assert.ok(t.lines!.length > 1 && t.lines!.join(' ') === 'one two three four five six');
  assert.deepEqual([t.x, t.y, t.w], [40, 28, 90]); // the box, not the words
  assert.equal(t.h, 12 * 1.3 * t.lines!.length); // as tall as its lines
  const svg = renderSvg(sc), ys = [...svg.matchAll(/<text x="130" y="([\d.]+)" text-anchor="end"/g)].map((m) => +m[1]);
  assert.equal(ys.length, t.lines!.length); // every line at the right edge
});
