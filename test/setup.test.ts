import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setup, detect, skillNotes, installedSkills, packageVersion, compareVersions } from '../src/setup.ts';
import { newerVersion, cacheFile } from '../src/update.ts';
import { siteFiles } from '../tools/siteFiles.ts';

const root = resolve(import.meta.dirname, '..');

test('setup writes the Claude Code skill and an AGENTS.md section, and running it again updates in place', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fdsetup-'));
  writeFileSync(join(dir, 'AGENTS.md'), '# Rules\n\nBe nice.\n');
  assert.deepEqual(detect(dir), ['agents']);
  setup(root, dir, ['claude', 'agents']);
  setup(root, dir, ['agents']);
  assert.ok(existsSync(join(dir, '.claude/skills/fastdraw/SKILL.md')));
  const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(agents.startsWith('# Rules\n\nBe nice.\n\n<!-- fastdraw:start -->'));
  assert.equal(agents.split('fastdraw:start').length, 2, 'one section, not two');
  assert.ok(agents.includes('npx fastdraw'));
});

test('setup with nothing to go on picks Claude Code and AGENTS.md; Copilot is found by its file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fdsetup-'));
  assert.deepEqual(detect(dir), ['claude', 'agents']);
  mkdirSync(join(dir, '.github'));
  writeFileSync(join(dir, '.github/copilot-instructions.md'), 'x');
  assert.deepEqual(detect(dir), ['copilot']);
});

test('setup refuses to write through a link that leads out of the repository', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fdsetup-')), outside = mkdtempSync(join(tmpdir(), 'fdout-'));
  symlinkSync(join(outside, 'victim'), join(dir, 'AGENTS.md')); // dangling: would be created
  assert.throws(() => setup(root, dir, ['agents']), /not writing/);
  assert.ok(!existsSync(join(outside, 'victim')));
  const dir2 = mkdtempSync(join(tmpdir(), 'fdsetup-'));
  symlinkSync(outside, join(dir2, '.claude'));
  assert.throws(() => setup(root, dir2, ['claude']), /not writing/);
  assert.ok(!existsSync(join(outside, 'skills')), 'nothing is created through the link either');
});

test('llms.txt carries the guide, every kind and the built-in look', () => {
  const f = siteFiles(root);
  const llms = f.get('llms.txt')!;
  assert.ok(llms.includes('## How to work'));
  assert.ok(llms.includes('(https://fastdraw.dev/guide/flowchart.md)'));
  assert.ok(llms.includes('focal'));
  assert.ok(f.has('guide/flowchart.md'));
});

test('setup stamps its files with the version, and the guide notes say when a repo\'s copy is older or newer', () => {
  const version = packageVersion(root), home = mkdtempSync(join(tmpdir(), 'fdhome-'));
  const dir = mkdtempSync(join(tmpdir(), 'fdsetup-'));
  mkdirSync(join(dir, '.git'));
  setup(root, dir, ['claude', 'agents']);
  const skill = readFileSync(join(dir, '.claude/skills/fastdraw/SKILL.md'), 'utf8');
  assert.ok(skill.startsWith('---\nname: fastdraw\n'), 'the front matter stays first');
  assert.ok(skill.includes(`\n---\n<!-- fastdraw-version: ${version} -->\n`));
  assert.ok(readFileSync(join(dir, 'AGENTS.md'), 'utf8').startsWith(`<!-- fastdraw:start -->\n<!-- fastdraw-version: ${version} -->\n`));
  // freshly written: nothing to say, from the repo's top or from a folder inside it
  assert.deepEqual(skillNotes(root, dir, home), []);
  mkdirSync(join(dir, 'src'));
  assert.deepEqual(installedSkills(join(dir, 'src'), home).map((f) => f.target), ['claude', 'agents']);
  // files from before the stamp, as 0.2.0 wrote them, are older
  writeFileSync(join(dir, '.claude/skills/fastdraw/SKILL.md'), skill.replace(/<!-- fastdraw-version: .* -->\n/, ''));
  const [note] = skillNotes(root, join(dir, 'src'), home);
  assert.match(note, /instructions \(\.\.\/\.claude\/skills\/fastdraw\/SKILL\.md\) are from version 0\.2\.0 or earlier/);
  assert.match(note, /npx fastdraw@latest setup claude$/);
  // running setup again clears it
  setup(root, dir, ['claude']);
  assert.deepEqual(skillNotes(root, dir, home), []);
  // instructions newer than this fastdraw: the fastdraw on the PATH is the old one
  writeFileSync(join(dir, 'AGENTS.md'), readFileSync(join(dir, 'AGENTS.md'), 'utf8').replace(/fastdraw-version: [\d.]+/, 'fastdraw-version: 99.0.0'));
  assert.match(skillNotes(root, dir, home).join('\n'), /older than the FastDraw instructions here \(99\.0\.0\).*npm install -g fastdraw@latest/);
  // the global skill is found too, with its own command
  const g = mkdtempSync(join(tmpdir(), 'fdhome-'));
  mkdirSync(join(g, '.claude/skills/fastdraw'), { recursive: true });
  writeFileSync(join(g, '.claude/skills/fastdraw/SKILL.md'), '---\nname: fastdraw\n---\n<!-- fastdraw-version: 0.0.1 -->\n');
  assert.match(skillNotes(root, mkdtempSync(join(tmpdir(), 'fdempty-')), g).join('\n'), /from version 0\.0\.1.*setup claude --global/);
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0 && compareVersions('1.0', '1.0.0') === 0);
});

test('the newer-version check asks npm at most once a day and stays quiet when told to', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'fdcache-')), 'fastdraw', 'latest.json');
  let asked = 0;
  const fetchLatest = async () => { asked++; return '9.0.0'; };
  const env = {};
  assert.equal(await newerVersion('0.2.0', { file, env, now: 0, fetchLatest }), '9.0.0');
  assert.equal(await newerVersion('0.2.0', { file, env, now: 1000, fetchLatest }), '9.0.0');
  assert.equal(asked, 1, 'the second answer came from the cache');
  assert.equal(await newerVersion('9.0.0', { file, env, now: 2000, fetchLatest }), null, 'the newest already');
  await newerVersion('0.2.0', { file, env, now: 25 * 3600 * 1000, fetchLatest });
  assert.equal(asked, 2, 'asked again after a day');
  // offline: no answer, and that is remembered for a day too
  const off = join(mkdtempSync(join(tmpdir(), 'fdcache-')), 'latest.json');
  const fail = async () => { asked++; throw new Error('offline'); };
  assert.equal(await newerVersion('0.2.0', { file: off, env, now: 0, fetchLatest: fail }), null);
  await newerVersion('0.2.0', { file: off, env, now: 1000, fetchLatest: fail });
  assert.equal(asked, 3);
  for (const quiet of [{ CI: 'true' }, { FASTDRAW_NO_UPDATE_CHECK: '1' }]) {
    assert.equal(await newerVersion('0.2.0', { file: join(tmpdir(), 'fd-never.json'), env: quiet, now: 0, fetchLatest }), null);
  }
  assert.equal(asked, 3);
  assert.equal(cacheFile({ LOCALAPPDATA: 'C:/Users/a/AppData/Local' }, 'C:/Users/a', 'win32'), join('C:/Users/a/AppData/Local', 'fastdraw', 'latest.json'));
});
