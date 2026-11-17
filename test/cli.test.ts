import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

test('icons and fonts a look names by web address come from the cache folder; --offline never asks the network', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fd-web-')), cache = join(dir, 'cache');
  const icon = 'https://cdn.example.com/set@1.0.0/{name}.svg', font = 'https://cdn.example.com/inter@5.3.0/latin-{weight}-normal.ttf';
  writeFileSync(join(dir, 'web.look'), `icondir "${icon}"\nfont sans "Coverage Sans" "${font}"\n`);
  writeFileSync(join(dir, 'web.fdraw'), 'look "./web.look"\na: rect "Lambda" at 20,20 160x60 icon=lambda\n');
  const env = { ...process.env, FASTDRAW_NO_UPDATE_CHECK: '1', XDG_CACHE_HOME: cache };
  const run = (...a: string[]) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...a], { encoding: 'utf8', env }).stdout;
  // nothing fetched yet: the closest built-in icon stands in and the font falls back, each with a warning
  const cold = run('check', join(dir, 'web.fdraw'), '--offline');
  assert.match(cold, /note: cdn\.example\.com: not fetched \(--offline\)/);
  assert.match(cold, /icon lambda is one of the look's icon files .* so the built-in icon function is drawn in its place/);
  assert.match(cold, /the look names the font "Coverage Sans" at https:\/\/cdn\.example\.com\/inter@5\.3\.0\/latin-\{weight\}-normal\.ttf, but no TTF or OTF file of it was fetched/);
  // a copy in the cache folder, as a fetch leaves it: named by its address
  const web = join(cache, 'fastdraw', 'web');
  mkdirSync(web, { recursive: true });
  const key = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 32);
  writeFileSync(join(web, key(icon.replace('{name}', 'lambda')) + '.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="orange"/></svg>');
  for (const w of [400, 500, 600, 700]) copyFileSync(new URL('../crates/fastdraw-render/tests/coverage/fonts/CoverageSans.ttf', import.meta.url).pathname, join(web, key(font.replace('{weight}', String(w))) + '.ttf'));
  const warm = run('check', join(dir, 'web.fdraw'), '--offline');
  assert.doesNotMatch(warm, /note:|icon lambda|font "Coverage Sans"/, warm);
  assert.match(warm, /ok: no problems found/);
});

test('a look named by web address is read from its copy in the cache folder; --offline never asks the network', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fd-weblook-')), cache = join(dir, 'cache');
  const at = 'https://looks.example.com/team/main/brand.look';
  writeFileSync(join(dir, 'a.fdraw'), `look "${at}"\na: node "A" at 20,20\n`);
  const env = { ...process.env, FASTDRAW_NO_UPDATE_CHECK: '1', XDG_CACHE_HOME: cache };
  const run = (...a: string[]) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...a], { encoding: 'utf8', env }).stdout;
  const cold = run('check', join(dir, 'a.fdraw'), '--offline');
  assert.match(cold, /note: https:\/\/looks\.example\.com\/team\/main\/brand\.look: not fetched \(--offline\) and not fetched before/);
  assert.match(cold, /a\.fdraw:1 {2}error {2}the look at https:\/\/looks\.example\.com\/team\/main\/brand\.look could not be fetched/);
  // the copy a fetch leaves: named by the address, ending in .look
  const web = join(cache, 'fastdraw', 'web');
  mkdirSync(web, { recursive: true });
  writeFileSync(join(web, createHash('sha256').update(at).digest('hex').slice(0, 32) + '.look'), 'color ink #123456\nstyle node shape=rect size=144x64 fill=paper stroke=ink\n');
  assert.match(run('check', join(dir, 'a.fdraw'), '--offline'), /ok: no problems found/);
  const out = join(dir, 'a.svg');
  assert.match(run('render', join(dir, 'a.fdraw'), '--offline', '-o', out), /wrote/);
  assert.match(readFileSync(out, 'utf8'), /#123456/);
  // --look takes an address too, and the note on what was drawn names it
  assert.match(run('render', join(dir, 'a.fdraw'), '--offline', '--look', at, '-o', join(dir, 'b.svg')), /look https:\/\/looks\.example\.com\/team\/main\/brand\.look\)/);
  // sizes, icons and preview-look take the address too, read from the same copy
  assert.doesNotMatch(run('sizes', at, '--offline'), /look file not found|could not be fetched/);
  assert.match(run('sizes', at, '--offline'), /node +shape=rect/);
  assert.match(run('preview-look', at, '--offline', '-o', join(dir, 'sheet.png')), /wrote .*sheet\.png/);
  // a look that used to ship says where it went
  writeFileSync(join(dir, 'old.fdraw'), 'look keys\na: rect "A" at 20,20\n');
  assert.match(run('check', join(dir, 'old.fdraw'), '--offline'), /the keys look no longer ships with FastDraw; it is in coccor\/fastdraw-looks on GitHub: look "https:\/\/raw\.githubusercontent\.com\/coccor\/fastdraw-looks\/main\/keys\.look"/);
});

test('render --look fetches the web fonts of the look it names, not those of the diagram\'s own look', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fd-lookover-')), cache = join(dir, 'cache');
  const font = 'https://cdn.example.com/coverage@1.0.0/latin-{weight}-normal.ttf';
  writeFileSync(join(dir, 'other.look'), `font sans "Coverage Sans" "${font}"\nstyle node shape=rect size=144x64 fill=paper stroke=ink\n`);
  writeFileSync(join(dir, 'a.fdraw'), 'a: node "A" at 20,20\n');
  const env = { ...process.env, FASTDRAW_NO_UPDATE_CHECK: '1', XDG_CACHE_HOME: cache };
  const run = (...a: string[]) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...a], { encoding: 'utf8', env }).stdout;
  const render = () => run('render', join(dir, 'a.fdraw'), '--offline', '--look', join(dir, 'other.look'), '-o', join(dir, 'a.png'));
  // nothing in the cache: the font of the look named by --look is what was looked for
  assert.match(render(), /note: cdn\.example\.com: the font Coverage Sans could not be fetched/);
  const web = join(cache, 'fastdraw', 'web');
  mkdirSync(web, { recursive: true });
  for (const w of [400, 500, 600, 700]) copyFileSync(new URL('../crates/fastdraw-render/tests/coverage/fonts/CoverageSans.ttf', import.meta.url).pathname, join(web, createHash('sha256').update(font.replace('{weight}', String(w))).digest('hex').slice(0, 32) + '.ttf'));
  const warm = render();
  assert.doesNotMatch(warm, /note:/, warm);
  assert.match(warm, /wrote/);
});

test('render fetches the icons a look\'s styles set (a group\'s corner tab), not only those the diagram names', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fd-styleicon-'));
  writeFileSync(join(dir, 'cloud.look'), 'icon tab "https://icons.example.com/tab.svg"\nstyle zone shape=rect fill=none stroke=ink title.pos=top title.align=left layer=back icon=tab icon.pos=corner\n');
  writeFileSync(join(dir, 'a.fdraw'), 'look "./cloud.look"\nz: zone "Cloud" at 20,20 300x200\n');
  const env = { ...process.env, FASTDRAW_NO_UPDATE_CHECK: '1', XDG_CACHE_HOME: join(dir, 'cache') };
  const out = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'render', join(dir, 'a.fdraw'), '--offline', '-o', join(dir, 'a.png')], { encoding: 'utf8', env }).stdout;
  // the diagram never says icon=, yet the tab its zone style draws is the one looked for
  assert.match(out, /note: icons\.example\.com: not fetched \(--offline\)/, out);
});
