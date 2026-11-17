// The rest of Phosphor's icons load on demand. This file is its own test process, so the icons added
// here do not leak into the other tests; the tests below run in order: before loading, then after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, ICON_WORDS, iconMatches } from '../src/icons.ts';
import { ICON_WEIGHTS, DUOTONE_TINT } from '../src/iconSet.ts';
import { loadExtendedIcons, extendedIconsLoaded } from '../src/extendedIcons.ts';
import { buildScene } from '../src/scene.ts';
import { renderSvg } from '../src/render.ts';

const DIAGRAM = 'a: rect "Anchor" at 20,20 120x60 icon=anchor\n';
const errors = (src: string) => buildScene(src, null).issues.filter((i) => i.level === 'error').map((i) => i.msg);

test('before loading only the built-in icons exist, and a rest-of-Phosphor icon is an error', () => {
  assert.equal(extendedIconsLoaded(), false);
  assert.equal(ICONS.anchor, undefined);
  assert.ok(Object.keys(ICONS).length < 200);
  assert.ok(errors(DIAGRAM).some((m) => m.includes('no icon called "anchor"')));
});

test('after loading every Phosphor icon is there, in every style', async () => {
  const builtIn = { ...ICONS };
  await loadExtendedIcons();
  assert.equal(extendedIconsLoaded(), true);
  assert.equal(await loadExtendedIcons(), undefined); // loading again is a no-op
  const names = Object.keys(ICONS);
  assert.ok(names.length > 1500, `${names.length} icons`);
  for (const n of names) {
    for (const w of ['thin', 'light', 'regular', 'bold', 'fill'] as const) assert.ok(ICON_WEIGHTS[w][n]?.length, `${w} ${n}`);
    assert.ok(DUOTONE_TINT[n], `duotone ${n}`);
  }
  // no built-in icon changed
  for (const [n, d] of Object.entries(builtIn)) assert.deepEqual(ICONS[n], d, n);
});

test('a Phosphor name a built-in icon already uses for another drawing comes as ph-<name>', () => {
  assert.notDeepEqual(ICONS['ph-book'], ICONS.book);
  assert.ok(ICONS['ph-list'] && ICONS['ph-check'] && !ICONS['ph-anchor']);
  assert.ok(ICONS.anchor);
});

test('an extended icon draws in each style, and the diagram is clean', () => {
  assert.deepEqual(errors(DIAGRAM), []);
  assert.ok(renderSvg(buildScene(DIAGRAM, null)).includes(`<path d="${ICONS.anchor[0]}"`));
  assert.ok(renderSvg(buildScene(DIAGRAM.replace('icon=anchor', 'icon=anchor icon.style=solid'), null)).includes(`<path d="${ICON_WEIGHTS.fill.anchor[0]}"`));
  const duo = renderSvg(buildScene(DIAGRAM.replace('icon=anchor', 'icon=anchor icon.style=duotone'), null));
  assert.ok(duo.includes(`<path d="${ICONS.anchor[0]}"`) && duo.includes('fill-opacity="0.2"'));
});

test('looks parsed before the load are parsed again, so the built-in look offers the new icons', () => {
  const sc = buildScene('a: icon at 20,20 40x40 icon=acorn\n', null);
  assert.ok(sc.look.icons.has('acorn'));
  assert.deepEqual(sc.issues.filter((i) => i.level === 'error'), []);
});

test('Phosphor search words find icons by meaning', () => {
  assert.ok(iconMatches('acorn', 'savings'));
  assert.ok(iconMatches('ph-book', 'book'));
  assert.ok(!iconMatches('acorn', 'zzqx'));
  for (const n of Object.keys(ICON_WORDS)) assert.ok(ICONS[n], `search words for a missing icon: ${n}`);
});

test('an icon file that did not come along is drawn as the closest built-in icon, with a warning', async () => {
  const { parseLook } = await import('../src/look.ts');
  const { withIconImages } = await import('../src/iconfiles.ts');
  const src = 'a: rect "VM" at 20,20 160x60 icon=virtual-machine\nb: rect "Pic" at 20,120 160x60 icon=pic\n';
  const pic = 'data:image/svg+xml;base64,' + Buffer.from('<svg viewBox="0 0 1 1"/>').toString('base64');
  // a shared link that carries "pic" but not "virtual-machine"
  const carried = withIconImages(parseLook('icondir "./icons"'), [], { pic });
  const sc = buildScene(src, carried);
  assert.deepEqual(sc.issues.filter((i) => i.level === 'error'), []);
  assert.ok(sc.issues.some((i) => i.level === 'warn' && i.msg.includes('icon virtual-machine') && i.msg.includes('built-in icon vm')));
  const svg = renderSvg(sc);
  assert.match(svg, /<image [^>]*href="data:image\/svg\+xml/);
  assert.equal((svg.match(/<image /g) ?? []).length, 1);
  // where the folder itself was read, a missing icon is a mistake and stays an error
  const read = withIconImages(parseLook('icondir "./icons"'), [], { pic }, true);
  assert.ok(buildScene(src, read).issues.some((i) => i.level === 'error' && i.msg.includes('no icon called "virtual-machine"')));
  // and a look with no icon folder gets no stand-ins
  assert.ok(buildScene(src, parseLook('color ink #000000')).issues.some((i) => i.level === 'error'));
});
