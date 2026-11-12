import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStatements } from '../src/parse.ts';
import { parseLook } from '../src/look.ts';
import { buildScene } from '../src/scene.ts';
import { check } from '../src/check.ts';
import { renderSvg } from '../src/render.ts';
import { patchSource, setAt, setSize, setText, setProp, setKind, setEnd, fmtStmt, appendStatements, moveStatement, freshId, setRows } from '../src/edit.ts';
import { loadScene, readSources } from '../src/node.ts';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { embedSvg, extractSvg, embedPng, extractPng } from '../src/embed.ts';
import { defaultLook } from '../src/look.ts';
import { fontMeta } from '../src/fontmeta.ts';
import { lookFonts } from '../src/node.ts';

const look = parseLook(readFileSync(new URL('../looks/reference.look', import.meta.url), 'utf8'));
const scene = (body: string) => buildScene(`look "x.look"\ncanvas 800x400\n${body}`, look);
const warns = (body: string) => check(scene(body)).filter((i) => i.level !== 'hint').map((i) => i.msg);

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
});

test('aligned boxes get a straight arrow; unaligned ones get one elbow', () => {
  const sc = scene('a: node at 40,40\nb: node at 240,40\nc: node at 480,200\na -> b\nb -> c');
  assert.deepEqual(sc.conns[0].pts, [{ x: 184, y: 72 }, { x: 240, y: 72 }]);
  assert.equal(sc.conns[1].pts.length, 3);
  assert.deepEqual(sc.conns[1].pts[1], { x: 552, y: 72 });
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
  assert.match(errs[0].msg, /unknown style "nodee"/); assert.equal(errs[0].line, 3);
  assert.match(errs.map((e) => e.msg).join('|'), /"zz", which does not exist/);
  assert.match(errs.map((e) => e.msg).join('|'), /id "b" is already used/);
});

test('checker: overlap, arrow through a box, label on a zone border, clean diagram', () => {
  assert.match(warns('a: node at 40,40\nb: node at 100,60').join('|'), /b overlaps a/);
  assert.match(warns('a: node at 40,40\nm: node at 240,40\nb: node at 440,40\na -> b via=200,72').join('|'), /passes through m/);
  assert.match(warns('z: zone "Z" at 300,20 200x300\na: node at 40,100\nb: node at 328,200\na -> b "reads data"').join('|'), /border of z/);
  assert.deepEqual(warns('a: node "A" at 40,40\nb: node "B" at 240,40\na -> b "go"'), []);
});

test('missing look file is an error, not a crash', () => {
  const sc = buildScene('look "nope.look"\na: rect at 0,0 40x40', null);
  assert.match(sc.issues[0].msg, /look file not found/);
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
  const sc = scene('lg: legend at 40,300 focal="The subject" store="Holds data" primary="Main path" return="Reply" decision="Question" nosuch="x" fill=#fff');
  const lg = sc.shapes[0];
  assert.deepEqual(lg.legend!.map((i) => i.style), ['focal', 'store', 'primary', 'return', 'decision']);
  assert.equal(lg.w, 720); // canvas 800 minus the left margin twice
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
  assert.ok(svg.includes('y="200" width="62" height="80"'), svg.match(/<rect[^>]*height="80"[^>]*>/)?.[0]);
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
  assert.match(msgs('text "x" at 40,40 rotate=45\n'), /text can be turned by 90/);
});
