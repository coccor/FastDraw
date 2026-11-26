// Bundles the extension and the parts of FastDraw it draws with into dist/extension.js, copies the fonts
// FastDraw ships so the preview draws text as `fastdraw render` does, and builds the local editor into editor/.
import { build, context } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fonts = join(here, '..', 'fonts');

rmSync(join(here, 'fonts'), { recursive: true, force: true });
mkdirSync(join(here, 'fonts'));
for (const f of readdirSync(fonts)) if (/\.(ttf|otf|txt)$/i.test(f)) cpSync(join(fonts, f), join(here, 'fonts', f));
// the package carries the repository's licence and the icon set's
cpSync(join(here, '..', 'LICENSE'), join(here, 'LICENSE'));
cpSync(join(here, '..', 'licenses'), join(here, 'licenses'), { recursive: true });

// the local editor Open in Editor serves when that is the choice: the same build as dist-local/ in the npm package
// (vite.local.config.ts), built with the repository's own tools
// (run through Node itself, not a shell, so a folder path with spaces stays one argument on Windows too)
const vite = join(here, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const built = spawnSync(process.execPath, [vite, 'build', '-c', 'vite.local.config.ts', '--outDir', join(here, 'editor'), '--emptyOutDir', '--logLevel', 'warn'], { cwd: join(here, '..'), stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);

const opts = {
  entryPoints: [join(here, 'src', 'extension.ts')],
  outfile: join(here, 'dist', 'extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  // FastDraw's Node code finds its fonts folder from import.meta.url; in a CommonJS bundle that is this file,
  // so dist/../fonts is the copy made above
  define: { 'import.meta.url': '__fastdrawModuleUrl' },
  banner: { js: "const __fastdrawModuleUrl = require('url').pathToFileURL(__filename).href;" },
  logLevel: 'info',
};

if (process.argv.includes('--watch')) await (await context(opts)).watch();
else await build(opts);
