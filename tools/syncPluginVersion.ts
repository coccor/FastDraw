// Run by `npm version`: gives the Claude Code plugin the package's new version, so plugin users get the
// skill that matches the fastdraw release `npx fastdraw` runs, not whatever is on main. The Rust crate
// (crates/fastdraw-render) gets it too, in Cargo.toml and Cargo.lock: the crate draws what the npm package of
// the same version draws, and the release workflow publishes both from one tag.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const file = join(root, 'plugins', 'fastdraw', '.claude-plugin', 'plugin.json');
const plugin = JSON.parse(readFileSync(file, 'utf8'));
plugin.version = version;
writeFileSync(file, JSON.stringify(plugin, null, 2) + '\n');
console.log(`plugin.json → ${version}`);

// the first `version = "…"` in Cargo.toml is the [package] one, and the lock file's entry for the crate
const rewrite = (path: string, re: RegExp) => {
  const text = readFileSync(path, 'utf8');
  if (!re.test(text)) throw new Error(`${path}: no version to update`);
  const next = text.replace(re, (_, head: string) => `${head}"${version}"`);
  if (next !== text) writeFileSync(path, next);
};
rewrite(join(root, 'crates', 'fastdraw-render', 'Cargo.toml'), /^(version = )"[^"]*"/m);
rewrite(join(root, 'Cargo.lock'), /^(name = "fastdraw-render"\r?\nversion = )"[^"]*"/m);
console.log(`crates/fastdraw-render/Cargo.toml, Cargo.lock → ${version}`);
