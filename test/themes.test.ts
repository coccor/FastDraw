// Every look that ships comes in a light and a dark version; the editor and an embedded diagram draw the one
// for their theme, and the look menu offers the light names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundledLook, defaultLook, isDarkVersion, lightLookName, lookForTheme, menuLookNames, parseLook } from '../src/look.ts';
import { buildScene } from '../src/scene.ts';
import { inTheme } from '../editor/src/landing/inTheme.ts';

test('every look in the menu has a dark version, and the dark versions are not in the menu', () => {
  assert.deepEqual(menuLookNames(), [null, 'reference', 'shade', 'sketch', 'whiteboard']);
  for (const n of menuLookNames()) {
    const l = n === null ? defaultLook() : bundledLook(n)!;
    assert.ok(l.dark && isDarkVersion(l.dark), `${n ?? 'built-in'} names a dark version`);
    assert.equal(bundledLook(l.dark!)!.dark, l.dark, `${l.dark} is already dark`);
    assert.equal(lightLookName(l.dark!), n, `${l.dark} belongs to ${n ?? 'built-in'}`);
  }
  assert.ok(isDarkVersion('night') && !isDarkVersion('shade') && !isDarkVersion(null));
});

test('the look for a theme: the dark version when dark, the light look when light', () => {
  assert.equal(lookForTheme(null, 'dark'), 'night', 'the built-in look is Night in the dark theme');
  assert.equal(lookForTheme(null, 'light'), null);
  assert.equal(lookForTheme('shade', 'dark'), 'shade-dark');
  assert.equal(lookForTheme('shade', 'light'), 'shade');
  assert.equal(lookForTheme('night', 'light'), null, 'a diagram that names Night is the built-in look in the light theme');
  assert.equal(lookForTheme('night', 'dark'), 'night');
  assert.equal(lookForTheme('shade-dark', 'light'), 'shade');
  // a look file: its own dark line, a path next to it; none keeps the look
  assert.equal(lookForTheme('./team.look', 'dark', parseLook('dark "./team-night.look"')), './team-night.look');
  assert.equal(lookForTheme('./team.look', 'dark', parseLook('color ink #000000')), './team.look');
  assert.equal(lookForTheme('./team.look', 'dark', null), './team.look');
  assert.equal(lookForTheme('./team.look', 'light', parseLook('dark "./team-night.look"')), './team.look');
});

test('a dark version draws a diagram the same size as its light look: same styles, shapes, sizes and fonts', () => {
  const geometry = /^(shape|radius|size|path|sw|route|layer)$|(^|\.)(font|size|weight|spacing|caps)$/;
  for (const n of menuLookNames()) {
    const light = n === null ? defaultLook() : bundledLook(n)!, dark = bundledLook(light.dark!)!, what = `${light.dark} (of ${n ?? 'built-in'})`;
    assert.deepEqual([...dark.styles.keys()], [...light.styles.keys()], `${what} has the same styles`);
    assert.deepEqual([...dark.fonts], [...light.fonts], `${what} has the same fonts`);
    for (const [name, st] of light.styles) {
      const d = dark.styles.get(name)!;
      for (const k of Object.keys(st.props).filter((k) => geometry.test(k))) assert.equal(d.props[k], st.props[k], `${what} ${name} ${k}`);
    }
    const src = 'a: node "Alpha" at 0,0\nb: store "Beta" at 200,0\nt: text "Title" at 0,120 style=h1\na -> b "label"\n';
    const ls = buildScene(src, null, '', light), ds = buildScene(src, null, '', dark);
    assert.deepEqual([ds.x, ds.y, ds.w, ds.h], [ls.x, ls.y, ls.w, ls.h], `${what} draws the same box`);
  }
});

test('the site draws a diagram in its look\'s version for the page', () => {
  const body = 'a: node "A" at 0,0\n';
  assert.equal(inTheme(body, 'light'), body);
  assert.equal(inTheme(body, 'dark'), 'look night\n' + body);
  assert.equal(inTheme('look shade\n' + body, 'dark'), 'look shade-dark\n' + body);
  assert.equal(inTheme('look shade\n' + body, 'light'), 'look shade\n' + body);
  assert.equal(inTheme('look night\n' + body, 'light'), body, 'Night is the built-in look on a light page');
  assert.equal(inTheme('look "./team.look"\n' + body, 'dark'), 'look "./team.look"\n' + body, 'a look file is kept');
});

test('buildScene draws in another look without changing the diagram', () => {
  const src = 'look shade\na: node "A" at 0,0\nb: nope "B" at 0,80\n';
  const sc = buildScene(src, null, '', bundledLook('shade-dark')!);
  assert.equal(sc.look, bundledLook('shade-dark'));
  assert.equal(sc.issues.find((i) => i.level === 'error')?.line, 3, 'line numbers are the diagram\'s');
  assert.equal(buildScene('a: node "A" at 0,0', null, '', bundledLook('night')!).look, bundledLook('night'));
});
