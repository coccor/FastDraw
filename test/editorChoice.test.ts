import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { settingsFile, savedChoice, saveChoice } from '../src/editorChoice.ts';

const CLI = new URL('../src/cli.ts', import.meta.url).pathname;

test('the settings file is in each system\'s settings folder, not the cache', () => {
  assert.equal(settingsFile({ XDG_CONFIG_HOME: '/x' }, '/h', 'linux'), '/x/fastdraw/settings.json');
  assert.equal(settingsFile({}, '/h', 'linux'), '/h/.config/fastdraw/settings.json');
  assert.equal(settingsFile({}, '/h', 'darwin'), '/h/Library/Application Support/fastdraw/settings.json');
  assert.equal(settingsFile({ APPDATA: 'C:\\A' }, 'C:\\h', 'win32'), join('C:\\A', 'fastdraw', 'settings.json'));
});

test('a choice is saved and read back, keeping other settings; a broken file is no choice', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'fdset-')), 'fastdraw', 'settings.json');
  assert.equal(savedChoice(f), null);
  saveChoice('local', f);
  assert.equal(savedChoice(f), 'local');
  writeFileSync(f, JSON.stringify({ other: 1, editor: 'local' }));
  saveChoice('hosted', f);
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { other: 1, editor: 'hosted' });
  writeFileSync(f, '{not json');
  assert.equal(savedChoice(f), null);
  writeFileSync(f, JSON.stringify({ editor: 'somewhere' }));
  assert.equal(savedChoice(f), null);
});

test('fastdraw open with no choice and no one to answer: prints the question and stops with 2, saving nothing', () => {
  const cfg = mkdtempSync(join(tmpdir(), 'fdcfg-'));
  const dir = mkdtempSync(join(tmpdir(), 'fdq-'));
  writeFileSync(join(dir, 'a.fdraw'), 'canvas 100x100\n');
  const env = { ...process.env, XDG_CONFIG_HOME: cfg, FASTDRAW_NO_UPDATE_CHECK: '1', FASTDRAW_EDITOR: '' };
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'open', join(dir, 'a.fdraw'), '--no-browser'], { encoding: 'utf8', env, input: '', timeout: 20_000 });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /Which editor should fastdraw open use\?/);
  assert.match(r.stdout, /--editor hosted or --editor local/);
  assert.equal(savedChoice(join(cfg, 'fastdraw', 'settings.json')), null);
});
