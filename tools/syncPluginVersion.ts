// Run by `npm version`: gives the Claude Code plugin the package's new version, so plugin users get the
// skill that matches the fastdraw release `npx fastdraw` runs, not whatever is on main.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const file = join(root, 'plugins', 'fastdraw', '.claude-plugin', 'plugin.json');
const plugin = JSON.parse(readFileSync(file, 'utf8'));
plugin.version = version;
writeFileSync(file, JSON.stringify(plugin, null, 2) + '\n');
console.log(`plugin.json → ${version}`);
