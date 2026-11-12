// File-system loaders for the command-line tool. The rest of the core is browser-safe.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseLook, emptyLook } from './look.ts';
import type { Look } from './look.ts';
import { buildScene, lookPath } from './scene.ts';
import type { Scene } from './scene.ts';

export function loadLook(path: string): Look {
  try { return parseLook(readFileSync(path, 'utf8'), path); }
  catch {
    const look = emptyLook();
    look.issues.push({ line: 0, level: 'error', msg: `look file not found: ${path}` });
    return look;
  }
}

// A diagram file is untrusted input, and its look path is read from disk and embedded in exports.
// Only files named *.look are ever read, so a diagram cannot pull in some other file.
function readLook(file: string, p: string | undefined): { text: string | null; refused: boolean } {
  if (!p) return { text: null, refused: false };
  if (!p.toLowerCase().endsWith('.look')) return { text: null, refused: true };
  try { return { text: readFileSync(resolve(dirname(file), p), 'utf8'), refused: false }; }
  catch { return { text: null, refused: false }; }
}

export function loadScene(file: string): Scene {
  let src = '';
  try { src = readFileSync(file, 'utf8'); }
  catch {
    const sc = buildScene('', null, file);
    sc.issues.unshift({ line: 0, level: 'error', msg: `cannot read ${file}` });
    return sc;
  }
  const p = lookPath(src);
  const r = readLook(file, p);
  const sc = buildScene(src, r.text === null ? null : parseLook(r.text, p), file);
  if (r.refused) for (const i of sc.issues) if (i.msg.startsWith('look file not found')) i.msg = `the look path must end in .look; "${p}" was not read`;
  return sc;
}

// The diagram and look texts as they are on disk, for embedding in exports. A look that does
// not parse cleanly is left out.
export function readSources(file: string): { diagram: string; look: string | null } {
  const diagram = readFileSync(file, 'utf8');
  const p = lookPath(diagram);
  const { text } = readLook(file, p);
  const clean = text !== null && parseLook(text, p).issues.every((i) => i.level !== 'error');
  return { diagram, look: clean ? text : null };
}
