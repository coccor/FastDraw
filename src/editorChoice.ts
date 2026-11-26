// Which editor `fastdraw open` opens diagrams in: the one at fastdraw.dev, or the local one it serves itself
// (dist-local/, with fewer features). Asked the first time and kept in FastDraw's settings file; `--editor hosted`
// or `--editor local` sets it again (owner, 2026-11-26).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export type EditorChoice = 'hosted' | 'local';

export function settingsFile(env = process.env, home = homedir(), platform = process.platform): string {
  const base = platform === 'win32' ? env.APPDATA ?? join(home, 'AppData', 'Roaming')
    : platform === 'darwin' ? join(home, 'Library', 'Application Support') : env.XDG_CONFIG_HOME ?? join(home, '.config');
  return join(base, 'fastdraw', 'settings.json');
}

export function savedChoice(file = settingsFile()): EditorChoice | null {
  try {
    const v = (JSON.parse(readFileSync(file, 'utf8')) as { editor?: unknown }).editor;
    return v === 'hosted' || v === 'local' ? v : null;
  } catch { return null; }
}

export function saveChoice(c: EditorChoice, file = settingsFile()): void {
  let s: Record<string, unknown> = {};
  try { s = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none yet */ }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...s, editor: c }, null, 2) + '\n');
}

// What the person is asked, by the command in a terminal or by their agent (the skill passes it on).
export const CHOICE_QUESTION = `Which editor should fastdraw open use? It is asked once and remembered.

  hosted  The editor at https://fastdraw.dev/edit/ (recommended). It has the full icon set (about 1,600
          icons), a dark theme, a look picker with every look that ships with FastDraw and looks from
          GitHub, and templates for more than 40 kinds of diagram. It is always the newest version. The
          diagram is read from this computer by the page in your browser; it is not uploaded.
  local   A smaller editor that this command serves from this computer. It works offline and sends
          nothing to fastdraw.dev. Its icon picker has 24 everyday icons in outline only; a diagram draws
          its look's own icons and the 128 built-in icons included by default, but no other built-in
          ones. It has a light theme only, no look picker and no templates: to change the look, ask
          your agent.

Run it again with --editor hosted or --editor local. The same option changes the choice later.`;
