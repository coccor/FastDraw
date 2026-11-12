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

export function loadScene(file: string): Scene {
  let src = '';
  try { src = readFileSync(file, 'utf8'); }
  catch {
    const sc = buildScene('', null, file);
    sc.issues.unshift({ line: 0, level: 'error', msg: `cannot read ${file}` });
    return sc;
  }
  const p = lookPath(src);
  let look: Look | null = null;
  if (p) { try { look = parseLook(readFileSync(resolve(dirname(file), p), 'utf8'), p); } catch { look = null; } }
  return buildScene(src, look, file);
}

// The diagram and look texts as they are on disk, for embedding in exports.
export function readSources(file: string): { diagram: string; look: string | null } {
  const diagram = readFileSync(file, 'utf8');
  const p = lookPath(diagram);
  let look: string | null = null;
  if (p) { try { look = readFileSync(resolve(dirname(file), p), 'utf8'); } catch { look = null; } }
  return { diagram, look };
}
