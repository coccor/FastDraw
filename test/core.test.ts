import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStatements } from '../src/parse.ts';
import { parseLook } from '../src/look.ts';
import { buildScene } from '../src/scene.ts';
import { check } from '../src/check.ts';
import { renderSvg } from '../src/render.ts';
import { patchSource, setAt, setSize, setText, setProp, setKind, setEnd, fmtStmt, appendStatements, moveStatement, freshId } from '../src/edit.ts';
import { loadScene } from '../src/node.ts';

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
