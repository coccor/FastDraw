// `fastdraw setup`: tell the coding agents in a repo about FastDraw, by writing the same thin
// instruction files kept in agents/. Running it again updates them in place.
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

export type Target = 'claude' | 'agents' | 'copilot';
export const TARGETS: Target[] = ['claude', 'agents', 'copilot'];

const START = '<!-- fastdraw:start -->', END = '<!-- fastdraw:end -->';
// Written into every file setup makes, so `fastdraw guide` can tell when a repo's copy is older than the CLI.
const STAMP = /<!-- fastdraw-version: ([\d.]+) -->/;
const stamp = (version: string) => `<!-- fastdraw-version: ${version} -->`;
export const packageVersion = (root: string): string => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

// The section for AGENTS.md and Copilot's instructions, without the "paste this into" note at its top.
function snippet(root: string): string {
  return readFileSync(join(root, 'agents', 'AGENTS-snippet.md'), 'utf8').replace(/^<!--.*?-->\s*/s, '').trim();
}

// Make the file's folder and check the file stays inside `base`: a repository could carry a link
// (AGENTS.md -> ~/.bashrc) that would otherwise send the write somewhere else.
// Every part below `base` is checked before anything is created, then made one folder at a time.
function prepare(base: string, file: string): void {
  const refuse = () => { throw new Error(`not writing ${file}: it is a link, or leads outside ${base}`); };
  const top = realpathSync(base);
  const parts = relative(base, file).split(sep);
  if (!parts.length || parts.includes('..')) refuse();
  let at = base;
  for (let i = 0; i < parts.length; i++) {
    at = join(at, parts[i]);
    let st;
    try { st = lstatSync(at); } catch { st = null; }
    if (st?.isSymbolicLink()) refuse();
    if (st && i < parts.length - 1) {
      const real = realpathSync(at);
      if (!st.isDirectory() || (real !== top && !real.startsWith(top + sep))) refuse();
    }
    if (!st && i < parts.length - 1) mkdirSync(at);
  }
}

// Put the section into a markdown file: replace the one written before, or add it at the end.
function upsert(base: string, file: string, body: string, version: string): 'created' | 'updated' | 'added to' {
  const block = `${START}\n${stamp(version)}\n${body}\n${END}`;
  prepare(base, file);
  if (!existsSync(file)) { writeFileSync(file, block + '\n'); return 'created'; }
  const text = readFileSync(file, 'utf8');
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a >= 0 && b > a) { writeFileSync(file, text.slice(0, a) + block + text.slice(b + END.length)); return 'updated'; }
  writeFileSync(file, text.replace(/\s*$/, '') + '\n\n' + block + '\n');
  return 'added to';
}

// Which agents a repo already uses, judged by their files; Claude Code and AGENTS.md when there are none.
export function detect(dir: string): Target[] {
  const found: Target[] = [];
  if (existsSync(join(dir, '.claude')) || existsSync(join(dir, 'CLAUDE.md'))) found.push('claude');
  if (existsSync(join(dir, 'AGENTS.md'))) found.push('agents');
  if (existsSync(join(dir, '.github', 'copilot-instructions.md'))) found.push('copilot');
  return found.length ? found : ['claude', 'agents'];
}

// Writes the files and returns one line per file for the person to read.
export function setup(root: string, dir: string, targets: Target[], global = false): string[] {
  const lines: string[] = [], version = packageVersion(root);
  const show = (f: string) => (f.startsWith(dir) ? relative(dir, f) : f.replace(homedir(), '~'));
  for (const t of targets) {
    if (t === 'claude') {
      const base = global ? join(homedir(), '.claude') : dir;
      const file = join(global ? base : join(dir, '.claude'), 'skills', 'fastdraw', 'SKILL.md');
      const was = existsSync(file);
      if (global) mkdirSync(base, { recursive: true });
      prepare(base, file);
      // the stamp goes right after the front matter, which has to stay first for Claude Code to read the skill
      const skill = readFileSync(join(root, 'plugins', 'fastdraw', 'skills', 'fastdraw', 'SKILL.md'), 'utf8');
      writeFileSync(file, skill.replace(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)/, `$1${stamp(version)}\n`));
      lines.push(`${was ? 'updated' : 'wrote'} ${show(file)}  (Claude Code skill)`);
    } else {
      const file = t === 'agents' ? join(dir, 'AGENTS.md') : join(dir, '.github', 'copilot-instructions.md');
      lines.push(`${upsert(dir, file, snippet(root), version)} ${show(file)}  (${t === 'agents' ? 'Codex, OpenCode and other agents that read AGENTS.md' : 'GitHub Copilot'})`);
    }
  }
  return lines;
}

// Compares two versions such as 0.2.0 and 0.10.1, part by part.
export function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

type Installed = { target: Target; file: string; version: string; global: boolean };

// The instruction files setup wrote for the repository this folder is in (looking up until a folder that has
// them, or the repository's top) and the global Claude Code skill, each with the version that wrote it
// ('' when it has no stamp, as files from 0.2.0 and earlier do).
export function installedSkills(dir: string, home = homedir()): Installed[] {
  const out: Installed[] = [];
  const look = (target: Target, file: string, global = false, section = false) => {
    let text: string;
    try { text = readFileSync(file, 'utf8'); } catch { return; }
    if (section && !text.includes(START)) return;
    out.push({ target, file, version: STAMP.exec(text)?.[1] ?? '', global });
  };
  for (let at = resolve(dir); ; at = dirname(at)) {
    look('claude', join(at, '.claude', 'skills', 'fastdraw', 'SKILL.md'));
    look('agents', join(at, 'AGENTS.md'), false, true);
    look('copilot', join(at, '.github', 'copilot-instructions.md'), false, true);
    if (out.length || existsSync(join(at, '.git')) || dirname(at) === at) break;
  }
  if (resolve(home) !== resolve(dir)) look('claude', join(home, '.claude', 'skills', 'fastdraw', 'SKILL.md'), true);
  return out;
}

// What `fastdraw guide` says ahead of the guide when the instructions an agent was given and this fastdraw
// differ in version. Older instructions are refreshed by running setup again; newer ones mean this fastdraw
// is the old one (an install on the PATH that was never updated).
export function skillNotes(root: string, dir: string, home = homedir()): string[] {
  const version = packageVersion(root), found = installedSkills(dir, home), notes: string[] = [];
  const from = (fs: Installed[]) => [...new Set(fs.map((f) => f.version || '0.2.0 or earlier'))].join(', ');
  const old = found.filter((f) => !f.version || compareVersions(f.version, version) < 0);
  const local = old.filter((f) => !f.global), global = old.filter((f) => f.global);
  if (local.length) {
    const files = local.map((f) => relative(resolve(dir), f.file) || f.file).join(', ');
    notes.push(`Note: this repository's FastDraw instructions (${files}) are from version ${from(local)}; this fastdraw is ${version}. ` +
      `Tell the person, and to update them run in the repository: npx fastdraw@latest setup ${[...new Set(local.map((f) => f.target))].join(' ')}`);
  }
  if (global.length) {
    notes.push(`Note: the FastDraw skill in ${global[0].file.replace(home, '~')} is from version ${from(global)}; this fastdraw is ${version}. ` +
      'Tell the person, and to update it run: npx fastdraw@latest setup claude --global');
  }
  const newer = found.filter((f) => f.version && compareVersions(f.version, version) > 0);
  if (newer.length) {
    notes.push(`Note: this fastdraw is ${version}, older than the FastDraw instructions here (${newer[0].version}). ` +
      'Run it as npx fastdraw@latest instead, or update the installed one: npm install -g fastdraw@latest');
  }
  return notes;
}
