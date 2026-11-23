import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScene } from '../src/scene.ts';
import { renderSvg, drawPiece, drawShape } from '../src/render.ts';
import { bundledLook, defaultLook } from '../src/look.ts';

const SRC = 'a: node "A" at 40,40\nb: focal "B" at 240,40 hatch=accent\n';

test('drawPiece draws one element with its look\'s roughness and fill patterns', () => {
  const sketch = buildScene(SRC, bundledLook('sketch'), 'd.fdraw'), plain = buildScene(SRC, defaultLook(), 'd.fdraw');
  const rough = drawPiece(sketch.look, () => drawShape(sketch.look, sketch.shapes[1]!));
  const clean = drawPiece(plain.look, () => drawShape(plain.look, plain.shapes[1]!));
  // a hatched box gets its pattern defined with it, and a sketch look draws it by hand
  assert.match(rough, /^<defs><pattern id="fd-hatch-0"/);
  assert.match(rough, /fill="url\(#fd-hatch-0\)"/);
  assert.match(clean, /^<defs><pattern id="fd-hatch-0"/);
  assert.notEqual(rough.replace(/<defs>.*?<\/defs>/, ''), clean.replace(/<defs>.*?<\/defs>/, ''));
  assert.match(clean, /<rect /);
});

test('drawPiece puts the render state back, so whole renders are unchanged', () => {
  const plain = buildScene(SRC, defaultLook(), 'd.fdraw'), sketch = buildScene(SRC, bundledLook('sketch'), 'd.fdraw');
  const before = renderSvg(plain);
  drawPiece(sketch.look, () => drawShape(sketch.look, sketch.shapes[0]!));
  assert.equal(renderSvg(plain), before);
  // and a piece drawn while nothing else is rendering still throws its own errors
  assert.throws(() => drawPiece(plain.look, () => { throw new Error('boom'); }), /boom/);
  assert.equal(renderSvg(plain), before);
});
