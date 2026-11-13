// `fastdraw setup`: tell the coding agents in a repo about FastDraw, by writing the same thin
// instruction files kept in agents/. Running it again updates them in place.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { homedir } from 'node:os';

export type Target = 'claude' | 'agents' | 'copilot';
export const TARGETS: Target[] = ['claude', 'agents', 'copilot'];

const START = '<!-- fastdraw:start -->', END = '<!-- fastdraw:end -->';

// The section for AGENTS.md and Copilot's instructions, without the "paste this into" note at its top.
function snippet(root: string): string {
  return readFileSync(join(root, 'agents', 'AGENTS-snippet.md'), 'utf8').replace(/^<!--.*?-->\s*/s, '').trim();
}

// Put the section into a markdown file: replace the one written before, or add it at the end.
function upsert(file: string, body: string): 'created' | 'updated' | 'added to' {
  const block = `${START}\n${body}\n${END}`;
  if (!existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, block + '\n'); return 'created'; }
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
  const lines: string[] = [];
  const show = (f: string) => (f.startsWith(dir) ? relative(dir, f) : f.replace(homedir(), '~'));
  for (const t of targets) {
    if (t === 'claude') {
      const file = join(global ? join(homedir(), '.claude') : join(dir, '.claude'), 'skills', 'fastdraw', 'SKILL.md');
      const was = existsSync(file);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, readFileSync(join(root, 'agents', 'claude-skill', 'fastdraw', 'SKILL.md'), 'utf8'));
      lines.push(`${was ? 'updated' : 'wrote'} ${show(file)}  (Claude Code skill)`);
    } else {
      const file = t === 'agents' ? join(dir, 'AGENTS.md') : join(dir, '.github', 'copilot-instructions.md');
      lines.push(`${upsert(file, snippet(root))} ${show(file)}  (${t === 'agents' ? 'Codex, OpenCode and other agents that read AGENTS.md' : 'GitHub Copilot'})`);
    }
  }
  return lines;
}
