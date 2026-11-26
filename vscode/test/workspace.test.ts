import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insideWorkspace } from '../src/workspace.ts';

test('a diagram that is a link to a file outside the workspace is not inside it; one inside is', () => {
  const ws = mkdtempSync(join(tmpdir(), 'fdws-')), away = mkdtempSync(join(tmpdir(), 'fdaway-'));
  mkdirSync(join(ws, 'docs'));
  writeFileSync(join(ws, 'docs', 'a.fdraw'), 'canvas 10x10\n');
  writeFileSync(join(away, 'b.fdraw'), 'canvas 10x10\n');
  symlinkSync(join(away, 'b.fdraw'), join(ws, 'docs', 'b.fdraw'));
  symlinkSync(away, join(ws, 'linked'));
  assert.equal(insideWorkspace(join(ws, 'docs', 'a.fdraw'), ws), true);
  assert.equal(insideWorkspace(join(ws, 'docs', 'b.fdraw'), ws), false);
  assert.equal(insideWorkspace(join(ws, 'linked', 'b.fdraw'), ws), false);
  assert.equal(insideWorkspace(join(away, 'b.fdraw'), undefined), true);
  // a workspace reached through a link is judged by where it leads too
  const viaLink = join(mkdtempSync(join(tmpdir(), 'fdwl-')), 'ws');
  symlinkSync(ws, viaLink);
  assert.equal(insideWorkspace(join(viaLink, 'docs', 'a.fdraw'), viaLink), true);
});
