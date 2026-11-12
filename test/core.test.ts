import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStatements } from '../src/parse.ts';
import { parseLook } from '../src/look.ts';
import { buildScene } from '../src/scene.ts';
import { check } from '../src/check.ts';
import { renderSvg } from '../src/render.ts';
import { patchSource, setAt, setSize, setText, setProp, setKind, setEnd, fmtStmt, appendStatements, moveStatement, freshId } from '../src/edit.ts';
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
  assert.match(warns('a: node at 40,40\nm: node at 240,40\nb: node at 440,40\na -> b').join('|'), /passes through m/);
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
