import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setup, detect } from '../src/setup.ts';
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
  assert.ok(!existsSync(join(outside, 'skills/fastdraw/SKILL.md')));
});

test('llms.txt carries the guide, every kind and the built-in look', () => {
  const f = siteFiles(root);
  const llms = f.get('llms.txt')!;
  assert.ok(llms.includes('## How to work'));
  assert.ok(llms.includes('(https://fastdraw.dev/guide/flowchart.md)'));
  assert.ok(llms.includes('focal'));
  assert.ok(f.has('guide/flowchart.md'));
});
