import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { importMermaid, mermaidBlocks, looksLikeMermaid, MermaidError } from '../src/mermaid.ts';
import { buildScene, type Scene, type Shape } from '../src/scene.ts';
import { check } from '../src/check.ts';
import { bundledLook } from '../src/look.ts';

const FIX = new URL('./fixtures/mermaid/', import.meta.url).pathname;
const CLI = new URL('../src/cli.ts', import.meta.url).pathname;
const fastdraw = (...a: string[]) => {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...a], { encoding: 'utf8', env: { ...process.env, FASTDRAW_NO_UPDATE_CHECK: '1' } });
  return { out: r.stdout, code: r.status };
};
const imp = (src: string) => {
  const r = importMermaid(src);
  return { ...r, sc: buildScene(r.text, null, 'm.fdraw') };
};
const shape = (sc: Scene, id: string) => sc.shapes.find((s) => s.id === id)!;
const line = (text: string, start: string) => text.split('\n').find((l) => l.startsWith(start)) ?? '';
const inside = (a: Shape, b: Shape) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const overlap = (a: Shape, b: Shape) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('every sample imports to a diagram that check finds nothing wrong with', () => {
  for (const f of readdirSync(FIX).filter((f) => f.endsWith('.mmd'))) {
    const { sc } = imp(readFileSync(join(FIX, f), 'utf8'));
    const issues = check(sc).filter((i) => i.level !== 'hint');
    assert.deepEqual(issues.map((i) => `${i.line} ${i.msg}`), [], f);
    // boxes do not sit on one another (a zone holds its boxes, which is not an overlap)
    const boxes = sc.shapes.filter((s) => s.style !== 'zone' && s.p.overlap !== 'ok');
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
      assert.ok(!overlap(boxes[i]!, boxes[j]!), `${f}: ${boxes[i]!.id} overlaps ${boxes[j]!.id}`);
  }
});

test('a flowchart keeps its shapes, labels and kinds of line, in the look\'s styles', () => {
  const { text, sc, title } = imp(readFileSync(join(FIX, 'flow.mmd'), 'utf8'));
  assert.equal(title, 'Checkout');
  assert.match(text, /^title: text "Checkout" at 40,52 style=h1$/m);
  assert.equal(shape(sc, 'B').style, 'decision');
  assert.equal(shape(sc, 'G').style, 'terminal');
  assert.equal(shape(sc, 'A').style, 'step', 'with decisions in it, a box is a flowchart step');
  // the flow runs downwards: each box below the one before it
  assert.ok(shape(sc, 'B').y > shape(sc, 'A').y + shape(sc, 'A').h);
  // a decision's branches leave its tips; the label stays on the line
  assert.match(line(text, 'B.left') + line(text, 'B.right'), /"(Yes|No)"/);
  assert.match(text, /^H\.\w+ -> C\.\w+ style=return$/m, 'a dotted line is dashed, and a loop back goes round the side');
  // every box is wide enough for its text
  for (const s of sc.shapes) if (s.text) assert.ok(s.w >= s.text.split('\n')[0]!.length * 6, s.id);
});

test('subgraphs are zones around their own boxes, with their own direction', () => {
  const { sc, text } = imp(readFileSync(join(FIX, 'syntax.mmd'), 'utf8'));
  const outer = shape(sc, 'outer'), inner = shape(sc, 'inner'), other = shape(sc, 'other');
  for (const z of [outer, inner, other]) assert.equal(z.style, 'zone');
  assert.equal(outer.text, 'Outer group');
  assert.ok(inside(shape(sc, 'a1'), outer) && inside(inner, outer));
  assert.ok(inside(shape(sc, 'a2'), inner) && inside(shape(sc, 'a3'), inner));
  assert.ok(!overlap(outer, other) && !overlap(shape(sc, 'c1'), other), 'what is not in a zone stays out of it');
  // direction LR inside: a2 then a3 to its right, on one line
  assert.equal(shape(sc, 'a2').y, shape(sc, 'a3').y);
  assert.ok(shape(sc, 'a3').x > shape(sc, 'a2').x + shape(sc, 'a2').w);
  assert.match(text, /^a2\.right -> a3\.left$/m);
  // a line to a subgraph's name ends on its zone
  assert.match(text, /^log\.bottom -> outer\.top$/m);
});

test('the ways Mermaid writes a line all come through', () => {
  const { text, sc } = imp(readFileSync(join(FIX, 'syntax.mmd'), 'utf8'));
  // chains and &
  assert.match(text, /^start\.bottom -> in\.top$/m);
  assert.match(text, /^in\.bottom -> check\.top$/m);
  assert.match(text, /check\.\w+ -> proc\.top "yes"/);
  assert.match(text, /check\.\w+ -> log\.top "yes"/);
  // -. text .->, ==>|text|, ---, --x, o--o, <-->
  assert.match(text, /check\.\w+ -> err\.top "no" style=return/);
  assert.match(text, /proc\.bottom -> store\.top "done" style=primary/);
  assert.match(text, /hex\.\w+ -- start\.\w+ style=arrow$/m);
  assert.match(text, /a3\.bottom -- b1\.top style=arrow head=cross/);
  assert.match(text, /b1\.\w+ -- b2\.\w+ style=arrow head=circle tail=circle/);
  assert.match(text, /b2\.\w+ <-> c1\.\w+/);
  // node shapes: [/ /] and {{ }} as polygons drawn like boxes, (( )) a circle, [( )] and @{ shape: cyl } stores
  assert.match(line(text, 'in:'), /^in: polygon "Read input" at \S+ points=24,0;/);
  assert.match(line(text, 'hex:'), /^hex: polygon "Prepare" .* fill=#ffffff/);
  const err = shape(sc, 'err');
  assert.equal(err.shape, 'ellipse');
  assert.equal(err.w, err.h);
  assert.equal(shape(sc, 'store').style, 'store');
  assert.equal(shape(sc, 'api-v2').style, 'store');
  assert.equal(shape(sc, 'api-v2').text, 'Orders v2');
  // labels: <br/> breaks the line, Markdown strings lose their marks, quotes keep what is inside
  assert.equal(shape(sc, 'proc').text, 'Process\nbatch');
  assert.equal(shape(sc, 'md').text, 'Bold and italic');
  assert.equal(shape(sc, 'check').text, 'Valid? (a & b)');
  // ids FastDraw cannot use are renamed
  assert.ok(shape(sc, 'n12') && shape(sc, 'cafe') && shape(sc, 'naive'));
});

test('what has no FastDraw counterpart is left out, and said so', () => {
  const { notes, text } = imp(readFileSync(join(FIX, 'syntax.mmd'), 'utf8'));
  assert.ok(notes.some((n) => /click/.test(n)));
  assert.ok(notes.some((n) => /classDef|style/.test(n)));
  assert.doesNotMatch(text, /#f00|example\.com/);
  assert.equal(new Set(notes).size, notes.length, 'each note once');
});

test('a sequence diagram: lifelines, messages at one height, activation bars, frames', () => {
  const { text, sc } = imp(readFileSync(join(FIX, 'seq.mmd'), 'utf8'));
  for (const p of ['U', 'W', 'A', 'D']) assert.match(text, new RegExp(`^${p}_l: ${p}\\.bottom -- \\+0,\\d+ style=lifeline layer=back$`, 'm'));
  assert.equal(shape(sc, 'U').style, 'external', 'an actor is someone outside');
  assert.equal(shape(sc, 'U').p.icon, 'user');
  // participants in a row, evenly spaced
  const xs = ['U', 'W', 'A', 'D'].map((p) => shape(sc, p).x + shape(sc, p).w / 2);
  assert.equal(new Set(xs.slice(1).map((x, i) => x - xs[i]!)).size, 1);
  // every message has both ends at the same height, and they go down the page in order
  const msgs = sc.conns.filter((c) => c.style !== 'lifeline' && c.style !== 'rule');
  const ys = msgs.map((c) => c.pts[0]!.y);
  for (const c of msgs) if (c.pts[0]!.x !== c.pts[c.pts.length - 1]!.x) assert.equal(c.pts[0]!.y, c.pts[c.pts.length - 1]!.y, c.text ?? '');
  assert.deepEqual([...ys].sort((a, b) => a - b), ys);
  // autonumber
  assert.match(text, /"1\. Place order"/);
  assert.match(text, /"8\. Confirmation" style=return/);
  // + and - make activation bars; messages in a bar's time leave its side
  const bars = sc.shapes.filter((s) => s.style === 'bar');
  assert.equal(bars.length, 2);
  assert.match(text, /A_bar\d*\.left@\d+ -> W_l@\d+ "6\. 201 created" style=return/);
  // alt ... else ... end is a zone with a dashed rule
  const alt = sc.shapes.find((s) => s.style === 'zone')!;
  assert.equal(alt.text, 'alt [payment ok]');
  assert.match(text, /style=rule dash=4,4/);
  assert.match(text, /text "\[payment failed\]"/);
  // a self message loops out to the right
  assert.match(text, /A_bar\d*\.right@(\d+) -> A_bar\d*\.right@\d+ "5\. charge card" loop=36/);
  // the note sits right of the web app's lifeline
  const note = sc.shapes.find((s) => s.text === 'shows receipt')!;
  assert.ok(note.x > xs[1]!);
});

test('an ER diagram: entities as tables with their keys, crow\'s feet at both ends', () => {
  const { text, sc } = imp(readFileSync(join(FIX, 'er.mmd'), 'utf8'));
  assert.equal(shape(sc, 'CUSTOMER').shape, 'table');
  assert.match(text, /\| "# custNumber" "string"/);
  assert.match(text, /\| "→ customer" "string"/);
  assert.match(text, /CUSTOMER\.\w+ -- ORDER\.\w+ "places" style=arrow tail=only-one head=zero-many$/m);
  assert.match(text, /ORDER\.\w+ -- LINE-ITEM\.\w+ "contains" style=arrow tail=only-one head=one-many$/m);
  assert.match(text, /CUSTOMER\S* -- DELIVERY-ADDRESS\S* "uses" style=arrow tail=one-many head=one-many dash=4,3/);
  assert.ok(shape(sc, 'DELIVERY-ADDRESS'), 'an entity named only in a relationship still gets a table');
});

test('a state diagram: start dot, end ring, composite states as zones', () => {
  const { text, sc } = imp(readFileSync(join(FIX, 'state.mmd'), 'utf8'));
  const review = shape(sc, 'Review');
  assert.equal(review.style, 'zone');
  assert.ok(inside(shape(sc, 'Waiting'), review) && inside(shape(sc, 'Checking'), review));
  assert.ok(!inside(shape(sc, 'Draft'), review));
  assert.match(text, /^start_root: ellipse at \S+ 16x16 fill=ink stroke=none$/m);
  assert.match(text, /^end_root: ellipse at \S+ 16x16 fill=none stroke=ink$/m);
  assert.match(text, /^start_Review: ellipse/m, 'a composite state has its own start');
  assert.match(text, /Draft\.bottom -> Review\.top "submit"/);
  assert.match(text, /Review\.right -> Draft\.right "reject"/, 'going back goes round the side');
  assert.equal(shape(sc, 'Draft').p.radius, '8');
});

test('a class diagram: classes as tables, parents above, UML ends', () => {
  const { text, sc } = imp(readFileSync(join(FIX, 'class.mmd'), 'utf8'));
  assert.equal(shape(sc, 'Animal').text, '«abstract»\nAnimal');
  assert.match(text, /\| "\+ name: String"\n {2}\| "\+ age: int"\n {2}\| ---\n {2}\| "\+ makeSound\(\): void"/);
  assert.match(text, /\| "- canEat\(\): bool"/);
  assert.ok(shape(sc, 'Duck').y > shape(sc, 'Animal').y + shape(sc, 'Animal').h, 'the child is below its parent');
  assert.match(text, /Animal\.bottom -- Duck\.top style=arrow tail=triangle/);
  assert.match(text, /Zoo\.bottom -- Animal\.top "houses \(1 to many\)" style=arrow tail=diamond-solid/);
});

test('a look sizes the boxes, and names itself on the look line', () => {
  const src = readFileSync(join(FIX, 'flow.mmd'), 'utf8');
  const plain = importMermaid(src), sketch = importMermaid(src, { look: bundledLook('sketch')!, lookLine: 'sketch' });
  assert.match(sketch.text, /^look "sketch"\n/);
  const w = (t: string) => +/^A: step "Customer opens cart" at \S+ (\d+)x/m.exec(t)![1]!;
  assert.ok(w(sketch.text) >= w(plain.text), 'the sketch look\'s bigger hand-drawn font gets a wider box');
});

test('what cannot be read says where and why', () => {
  const err = (src: string) => { try { importMermaid(src); } catch (e) { return e as MermaidError; } assert.fail('no error'); };
  assert.match(err('pie\n "a": 1').message, /pie diagrams are not imported/);
  assert.match(err('hello world').message, /not a Mermaid diagram type/);
  assert.match(err('').message, /no Mermaid diagram found/);
  const open = err('flowchart TD\nsubgraph x\n a --> b');
  assert.match(open.message, /subgraph x is not closed/);
  const bad = err('flowchart TD\n a --> b\n a --> [');
  assert.equal(bad.line, 3);
  assert.equal(err('sequenceDiagram\n A->>B: hi\n what is this').line, 3);
});

test('Markdown: the mermaid blocks and their lines; telling Mermaid from FastDraw text', () => {
  const md = '# T\n\n```mermaid\nflowchart LR\n  a --> b\n```\n\ntext\n\n~~~mermaid\nsequenceDiagram\n  A->>B: hi\n~~~\n```js\nx\n```\n';
  const b = mermaidBlocks(md);
  assert.deepEqual(b.map((x) => x.line), [4, 11]);
  assert.equal(b[0]!.code, 'flowchart LR\n  a --> b');
  assert.ok(looksLikeMermaid('graph TD\n a-->b'));
  assert.ok(looksLikeMermaid('%% a comment\nsequenceDiagram\n A->>B: hi'));
  assert.ok(!looksLikeMermaid('a: node "A" at 40,40'));
  assert.ok(!looksLikeMermaid('pie\n "a": 1'));
});

test('newer Mermaid syntax: line ids, metadata lines, labels over several lines', () => {
  const { text, sc } = imp('flowchart TD\n  A e1@--> B\n  e1@{ animate: true }\n  B --> C["`Line one\nline two`"]\n  subgraph one [My group]\n    C\n  end\n  one@{ view: collapsed }\n');
  assert.match(text, /^A\.bottom -> B\.top$/m);
  assert.equal(shape(sc, 'C').text, 'Line one\nline two');
  assert.ok(!sc.shapes.some((s) => s.id === 'e1'), 'a line\'s metadata is not a box');
  assert.equal(sc.shapes.filter((s) => s.style === 'zone').length, 1);
});

test('ER: cardinality written either way round or in words, quoted names, subgraphs a line can end on', () => {
  const { text, sc } = imp('erDiagram\n  PERSON o{--|| HOUSE:::bar : has\n  CAR 1 to zero or more DRIVER : allows\n  CAR only one optionally to one or more "Spare part" : keeps\n  subgraph TOP\n    A ||--|| B : links\n  end\n  TOP ||--|| CAR : owns\n');
  assert.match(text, /PERSON\S* -- HOUSE\S* "has" style=arrow tail=zero-many head=only-one/);
  assert.match(text, /CAR\S* -- DRIVER\S* "allows" style=arrow tail=only-one head=zero-many$/m);
  assert.match(text, /CAR\S* -- Spare_part\S* "keeps" style=arrow tail=only-one head=one-many dash=4,3/);
  assert.equal(shape(sc, 'Spare_part').text, 'Spare part');
  const top = sc.shapes.find((s) => s.style === 'zone')!;
  assert.equal(top.text, 'TOP');
  assert.ok(!sc.shapes.some((s) => s.shape === 'table' && s.text === 'TOP'), 'no table for the subgraph\'s name');
  assert.match(text, new RegExp(`^${top.id}\\S* -- CAR\\S* "owns"`, 'm'));
});

test('class: names in backticks, lollipop interfaces, a namespace with a label', () => {
  const { text, sc } = imp('classDiagram\n  `Animal Class!` --> `Car Class`\n  bar ()-- foo\n  namespace Auth["Authentication Service"] {\n    class Login\n  }\n');
  assert.equal(shape(sc, 'Animal_Class').text, 'Animal Class!');
  assert.match(text, /Animal_Class\S* -- Car_Class\S* style=arrow head=open/);
  assert.match(text, /bar\S* -- foo\S* style=arrow tail=circle/);
  assert.equal(sc.shapes.find((s) => s.style === 'zone')!.text, 'Authentication Service');
});

test('a line the checker finds crossing a box is moved to other sides', () => {
  // LR, with a line back from the last column to the first one, past the boxes in between
  const { sc } = imp('flowchart LR\n  a --> b --> c --> d\n  b --> x\n  d --> a\n');
  assert.deepEqual(check(sc).filter((i) => i.level !== 'hint').map((i) => i.msg), []);
});

test('fastdraw import: a .mmd file, the blocks of a Markdown file, -o, --dir, --look, and files kept', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fd-mermaid-'));
  writeFileSync(join(dir, 'flow.mmd'), readFileSync(join(FIX, 'flow.mmd'), 'utf8'));
  let r = fastdraw('import', join(dir, 'flow.mmd'));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /wrote .*flow\.fdraw \(a flowchart\)/);
  assert.match(r.out, /note: colours/);
  assert.match(readFileSync(join(dir, 'flow.fdraw'), 'utf8'), /B: decision "Logged in\?"/);
  r = fastdraw('import', join(dir, 'flow.mmd'));
  assert.equal(r.code, 1);
  assert.match(r.out, /flow\.fdraw exists, not changed \(--force writes over it\)/);
  assert.equal(fastdraw('import', join(dir, 'flow.mmd'), '--force').code, 0);

  writeFileSync(join(dir, 'README.md'), '# x\n\n```mermaid\ngraph LR\n a --> b\n```\n\n```mermaid\nerDiagram\n A ||--o{ B : has\n```\n\n```mermaid\npie\n "a" : 1\n```\n');
  r = fastdraw('import', join(dir, 'README.md'), '--dir', join(dir, 'docs', 'diagrams'));
  assert.equal(r.code, 1, 'the pie chart is not imported');
  assert.match(r.out, /README\.md:14 {2}pie diagrams are not imported/);
  assert.ok(existsSync(join(dir, 'docs', 'diagrams', 'README-1.fdraw')));
  assert.match(r.out, /README-2\.fdraw \(an ER diagram, from line 8 of/);

  r = fastdraw('import', join(dir, 'flow.mmd'), '-o', join(dir, 'looks', 'x.fdraw'), '--look', 'sketch');
  assert.notEqual(r.code, 0, 'no folder to write -o into');
  r = fastdraw('import', join(dir, 'flow.mmd'), '-o', join(dir, 'x.fdraw'), '--look', 'sketch');
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(join(dir, 'x.fdraw'), 'utf8'), /^look "sketch"\n/);
  assert.equal(fastdraw('check', join(dir, 'x.fdraw')).code, 0);
  r = fastdraw('import', join(dir, 'README.md'), '-o', join(dir, 'y.fdraw'));
  assert.match(r.out, /-o names one output file/);
});
