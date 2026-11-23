// Starts VS Code with the extension on a scratch folder and runs suite.cjs inside it.
// VSCODE_PATH runs an installed VS Code instead of downloading one; FASTDRAW_PAUSE=<seconds> holds each
// step on screen (for screenshots).
import { runTests } from '@vscode/test-electron';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'fastdraw-vscode-it-'));
const work = join(scratch, 'work');
mkdirSync(work);
mkdirSync(join(scratch, 'user', 'User'), { recursive: true });
writeFileSync(join(scratch, 'user', 'User', 'settings.json'), JSON.stringify({
  'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false, 'editor.minimap.enabled': false,
  'workbench.colorTheme': 'Default Light Modern', 'chat.disableAIFeatures': true, 'workbench.secondarySideBar.defaultVisibility': 'hidden',
}));
writeFileSync(join(work, 'checkout.fdraw'), `text "Checkout" at 40,24 style=h1

shopper: external "Shopper" at 40,60
api:     focal "Orders API" sub="REST" at 296,60
db:      store "Orders DB" at 552,56

shopper -> api "HTTPS" style=link
api -> db "writes" style=primary

legend at 40,172 external="Outside what you own" focal="The service this is about" store="Holds data"
`);

try {
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_PATH,
    extensionDevelopmentPath: join(here, '..', '..'),
    extensionTestsPath: join(here, 'suite.cjs'),
    launchArgs: [work, '--user-data-dir', join(scratch, 'user'), '--extensions-dir', join(scratch, 'ext'), '--disable-workspace-trust'],
    extensionTestsEnv: { FASTDRAW_PAUSE: process.env.FASTDRAW_PAUSE ?? '0', FASTDRAW_WORK: work },
  });
} catch (e) {
  console.error(e);
  process.exit(1);
}
