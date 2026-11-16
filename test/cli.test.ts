import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseLook, defaultLook, bundledLook } from '../src/look.ts';
import { withLook, buildScene } from '../src/scene.ts';
import { darkLookOf, lookArg, lookRefText } from '../src/node.ts';
import { extractPng } from '../src/embed.ts';

const CLI = new URL('../src/cli.ts', import.meta.url).pathname;
const fastdraw = (...a: string[]) => {
  // no asking npm for a newer version from the tests
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...a], { encoding: 'utf8', env: { ...process.env, FASTDRAW_NO_UPDATE_CHECK: '1' } });
  return { out: r.stdout, code: r.status };
};

test('a look names its dark version with a dark line', () => {
  assert.equal(parseLook('dark night').dark, 'night');
  assert.equal(parseLook('dark "./team-night.look"').dark, './team-night.look');
  for (const bad of ['dark', 'dark nope', 'dark "./x.txt"', 'dark night sketch']) {
    const l = parseLook(bad);
    assert.equal(l.dark, undefined, bad);
    assert.match(l.issues[0].msg, /dark needs one look/, bad);
  }
  assert.equal(defaultLook().dark, 'night', 'the built-in look draws its dark image with Night');
  assert.equal(bundledLook('night')!.dark, 'night', 'Night is already dark');
  assert.equal(bundledLook('sketch')!.dark, undefined);
});

test('withLook swaps the look line in place, or adds one at the end, keeping line numbers', () => {
  assert.equal(withLook('look sketch\na: node "A" at 0,0', 'night'), 'look night\na: node "A" at 0,0');
  assert.equal(withLook('a: node "A" at 0,0\n', 'night'), 'a: node "A" at 0,0\nlook night\n');
  assert.equal(withLook('// c\nlook "./a.look"\nb: node "B" at 0,0', './x/b.look'), '// c\nlook "./x/b.look"\nb: node "B" at 0,0');
  const sc = buildScene(withLook('a: node "A" at 0,0\nb: nope "B" at 0,80', 'night'), null);
  assert.equal(sc.look, bundledLook('night'));
  assert.equal(sc.issues.find((i) => i.level === 'error')?.line, 2);
});

test('darkLookOf follows the dark line, from the look file\'s folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fd-dark-'));
  mkdirSync(join(dir, 'looks'));
  writeFileSync(join(dir, 'looks', 'team.look'), 'dark "./team-night.look"\ncolor ink #000000');
  writeFileSync(join(dir, 'looks', 'team-night.look'), 'color ink #ffffff');
  writeFileSync(join(dir, 'looks', 'bare.look'), 'color ink #000000');
  assert.deepEqual(darkLookOf(undefined), { name: 'night' });
  assert.deepEqual(darkLookOf({ name: 'night' }), { name: 'night' });
  assert.match(darkLookOf({ name: 'sketch' }) as string, /sketch look has no dark version/);
  const d = darkLookOf({ file: join(dir, 'looks', 'team.look') });
  assert.deepEqual(d, { file: join(dir, 'looks', 'team-night.look') });
  assert.equal(lookRefText(d as { file: string }, join(dir, 'a.fdraw')), './looks/team-night.look');
  assert.match(darkLookOf({ file: join(dir, 'looks', 'bare.look') }) as string, /bare\.look has no dark version: add a line .*dark night/);
  assert.match(lookArg('nope') as string, /no look named nope/);
  assert.deepEqual(lookArg('night'), { name: 'night' });
});

test('fastdraw guide list says what each kind shows', () => {
  const r = fastdraw('guide', 'list');
  assert.equal(r.code, 0);
  assert.match(r.out, /^flowchart +Shows a decision process/m);
  assert.match(r.out, /^swimlane +Shows a process that passes between/m);
  assert.ok(r.out.trim().split('\n').every((l) => /^[a-z-]+ +\S/.test(l)), 'every kind has a description');
});

test('fastdraw render --look and --dark', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fd-cli-'));
  const f = join(dir, 'd.fdraw'), body = 'look sketch\na: node "A" at 40,40\n';
  writeFileSync(f, body);
  let r = fastdraw('render', f, '--look', 'night', '--scale', '1');
  assert.equal(r.code, 0);
  assert.match(r.out, /wrote .*d\.png \(\d+x\d+, at 1x, look night\)/);
  const embedded = extractPng(new Uint8Array(readFileSync(join(dir, 'd.png'))))!;
  assert.match(embedded.diagram, /^look night$/m, 'the image carries the diagram as drawn');
  assert.equal(readFileSync(f, 'utf8'), body, 'the file itself is not changed');

  r = fastdraw('render', f, '--dark');
  assert.equal(r.code, 1);
  assert.match(r.out, /the sketch look has no dark version/);

  writeFileSync(f, 'a: node "A" at 40,40\n');
  r = fastdraw('render', f, '--dark', '--scale', '1', '-o', join(dir, 'out.svg'));
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(dir, 'out.svg')) && existsSync(join(dir, 'out-dark.svg')));
  assert.match(readFileSync(join(dir, 'out-dark.svg'), 'utf8'), /#0b1226/, 'drawn on Night\'s page');

  // a look file's dark line, read from the look's own folder
  mkdirSync(join(dir, 'looks'));
  copyFileSync(new URL('../looks/night.look', import.meta.url), join(dir, 'looks', 'my-night.look'));
  writeFileSync(join(dir, 'looks', 'team.look'), 'dark "./my-night.look"\ncolor paper #ffffff\nstyle node shape=rect');
  writeFileSync(f, 'look "./looks/team.look"\na: node "A" at 40,40\n');
  r = fastdraw('render', f, '--dark', '--scale', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /d-dark\.png .*look \.\/looks\/my-night\.look/);
  assert.match(extractPng(new Uint8Array(readFileSync(join(dir, 'd-dark.png'))))!.look!, /#0b1226/, 'the dark image carries the dark look');
});

test('fastdraw check and render take several files and folders', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fd-many-'));
  mkdirSync(join(dir, 'b'));
  writeFileSync(join(dir, 'a.fdraw'), 'a: node "A" at 40,40\n');
  writeFileSync(join(dir, 'b', 'c.fdraw'), 'c: node "C" at 40,40\n');
  writeFileSync(join(dir, 'b', 'notes.txt'), 'not a diagram');

  let r = fastdraw('check', dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /ok: no problems found in 2 files/);

  r = fastdraw('render', dir, '-o', join(dir, 'x.png'));
  assert.equal(r.code, 1);
  assert.match(r.out, /-o names one output file/);

  r = fastdraw('render', dir, '--dark', '--scale', '1');
  assert.equal(r.code, 0, r.out);
  const wrote = [...r.out.matchAll(/wrote (\S+)/g)].map((m) => m[1]);
  assert.deepEqual(wrote, ['a.png', 'a-dark.png', join('b', 'c.png'), join('b', 'c-dark.png')].map((p) => join(dir, p)), 'sorted, light then dark');

  // one bad file stops the whole batch before anything is drawn
  writeFileSync(join(dir, 'b', 'bad.fdraw'), 'z: nosuchstyle "Z" at 40,40\n');
  r = fastdraw('render', join(dir, 'a.fdraw'), join(dir, 'b'), '--scale', '1', '--look', 'night');
  assert.equal(r.code, 1);
  assert.match(r.out, /b[\\/]bad\.fdraw:1 {2}error/);
  assert.match(r.out, /not rendered: fix the errors first/);
  assert.doesNotMatch(r.out, /wrote/);
  r = fastdraw('check', join(dir, 'a.fdraw'), join(dir, 'b'));
  assert.equal(r.code, 1);
  assert.match(r.out, /3 files: 1 error/);
});
