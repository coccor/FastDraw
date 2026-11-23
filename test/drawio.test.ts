import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildScene } from '../src/scene.ts';
import { renderSvg } from '../src/render.ts';
import { bundledLook } from '../src/look.ts';
import { toDrawio } from '../src/drawio.ts';

const SRC = `api: focal "Orders API" sub="REST" at 40,60 icon=database tag=API
db: store "Orders DB" at 320,56
note: text "a note" at 40,200

api -> db "writes"
legend at 40,240 focal="The service" store="Holds data"
`;
const xml = toDrawio(buildScene(SRC, null, 'd.fdraw'), { name: 'd', source: SRC });
const cell = (id: string) => new RegExp(`<mxCell id="${id}"[^>]*>`).exec(xml)?.[0] ?? '';
const attr = (el: string, k: string) => new RegExp(` ${k}="([^"]*)"`).exec(el)?.[1];
const unxml = (s: string) => s.replace(/&#10;/g, '\n').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('one draw.io page, with the boxes, the line and the texts under FastDraw names', () => {
  assert.match(xml, /^<mxfile host="fastdraw"[^>]*><diagram id="fastdraw" name="d"><mxGraphModel /);
  assert.match(xml, /<\/root><\/mxGraphModel><\/diagram><\/mxfile>\n$/);
  for (const id of ['fd:api', 'fd:db', 'fd:note']) assert.ok(cell(id), id);
  assert.match(attr(cell('fd:api'), 'style')!, /rounded=1/);
  assert.equal(attr(cell('fd:api'), 'vertex'), '1');
  // ids are unique
  const ids = [...xml.matchAll(/<mxCell id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('a box\'s texts and extras are its children, so they move with it', () => {
  const kids = [...xml.matchAll(/<mxCell id="(fd:api:[^"]+)"[^>]*parent="fd:api"/g)].map((m) => m[1]);
  assert.ok(kids.includes('fd:api:extras'), 'the icon and tag picture');
  const texts = kids.filter((k) => /:t\d+$/.test(k!)).map((k) => unxml(attr(cell(k!), 'value')!));
  assert.deepEqual(texts.sort(), ['API', 'Orders API', 'REST']);
  // the picture is an SVG drawn by FastDraw
  const img = /image=data:image\/svg\+xml,([A-Za-z0-9+/=]+)/.exec(unxml(attr(cell('fd:api:extras'), 'style')!))![1]!;
  assert.match(Buffer.from(img, 'base64').toString(), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
});

test('what sits inside a box is its child: a zone holds its boxes, a box its rows and texts', () => {
  const x = toDrawio(buildScene(`z: zone "Prod" at 0,0 400x240
n: node "App" at 40,40 240x120
r: rect at 56,100 200x24
label: text "row" at 64,116
out: text "outside" at 440,40
`, null, 'd.fdraw'));
  const el = (id: string) => new RegExp(`<mxCell id="${id}"[^>]*>`).exec(x)![0];
  assert.equal(attr(el('fd:n'), 'parent'), 'fd:z');
  assert.equal(attr(el('fd:r'), 'parent'), 'fd:n');
  assert.equal(attr(el('fd:label'), 'parent'), 'fd:r');
  assert.equal(attr(el('fd:out'), 'parent'), '1');
  // a zone is a draw.io container (a click picks what is in it); a box is like a group (a click picks the box)
  assert.match(unxml(attr(el('fd:z'), 'style')!), /container=1/);
  assert.match(unxml(attr(el('fd:n'), 'style')!), /container=0/);
  // places are kept, counted from the holder's corner
  assert.match(x, /<mxCell id="fd:r"[^>]*><mxGeometry x="16" y="60" width="200" height="24"/);
});

test('a cylinder is a stencil of the path FastDraw draws', () => {
  const st = unxml(attr(cell('fd:db'), 'style')!);
  const packed = /shape=stencil\(([^)]+)\)/.exec(st)![1]!;
  const stencil = decodeURIComponent(inflateRawSync(Buffer.from(packed, 'base64')).toString());
  assert.match(stencil, /^<shape name="fastdraw" w="144" h="\d+" aspect="variable"/);
  assert.match(stencil, /<curve /);
  assert.match(stencil, /<fillstroke\/>/);
});

test('the line is fastened to both boxes where FastDraw meets them, with its label', () => {
  const e = /<mxCell id="fd:c0"[^>]*edge="1"[^>]*>/.exec(xml)?.[0] ?? /<mxCell id="[^"]*" value="writes"[^>]*edge="1"[^>]*>/.exec(xml)![0];
  assert.equal(attr(e, 'source'), 'fd:api');
  assert.equal(attr(e, 'target'), 'fd:db');
  const st = unxml(attr(e, 'style')!);
  assert.match(st, /exitX=1;exitY=0\.\d+;exitPerimeter=0;entryX=0;entryY=0\.\d+;entryPerimeter=0/);
  assert.match(st, /endArrow=block;endFill=1/);
  assert.equal(unxml(attr(e, 'value')!), 'writes');
  assert.match(xml, /as="offset"\/>/);
});

test('the diagram\'s text rides on the page; without a source nothing does', () => {
  const kept = /<object label="" id="0" fastdraw-source="([^"]*)"/.exec(xml)![1]!;
  assert.equal(unxml(kept), SRC);
  assert.doesNotMatch(toDrawio(buildScene(SRC, null, 'd.fdraw')), /fastdraw-source/);
});

test('texts that need escaping stay text', () => {
  const x = toDrawio(buildScene('a: node "<b>&amp;\\"x" at 0,0\n', null, 'd.fdraw'));
  const v = unxml(attr(/<mxCell id="fd:a:t0"[^>]*>/.exec(x)![0], 'value')!);
  assert.equal(v, '&lt;b&gt;&amp;amp;"x'); // HTML in the label, escaped: draw.io shows <b>&amp;"x
});

test('exporting leaves later renders as they were (sketch roughness does not leak)', () => {
  const plain = buildScene(SRC, null, 'd.fdraw');
  const before = renderSvg(plain);
  toDrawio(buildScene(SRC, bundledLook('sketch'), 'd.fdraw'));
  assert.equal(renderSvg(plain), before);
});

test('a sketch look is drawn rough in draw.io, with solid fills', () => {
  const x = unxml(toDrawio(buildScene(SRC, bundledLook('sketch'), 'd.fdraw')));
  assert.match(x, /sketch=1;curveFitting=1;jiggle=2;fillStyle=solid/);
  assert.match(x, /fontFamily=Caveat,cursive;fontSource=https%3A%2F%2Ffonts.googleapis.com/);
});

test('fastdraw render -o x.drawio writes the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fd-drawio-'));
  const f = join(dir, 'd.fdraw');
  writeFileSync(f, SRC);
  const out = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', resolve(import.meta.dirname, '../src/cli.ts'), 'render', f, '-o', join(dir, 'd.drawio')], { encoding: 'utf8' });
  assert.match(out, /wrote .*d\.drawio \(\d+x\d+\)/);
  const x = readFileSync(join(dir, 'd.drawio'), 'utf8');
  assert.match(x, /^<mxfile /);
  assert.match(x, /fastdraw-source=/);
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', resolve(import.meta.dirname, '../src/cli.ts'), 'render', f, '-o', join(dir, 'bare.drawio'), '--no-embed']);
  assert.doesNotMatch(readFileSync(join(dir, 'bare.drawio'), 'utf8'), /fastdraw-source/);
});
