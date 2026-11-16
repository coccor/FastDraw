// Screenshots of the prototypes for the design doc.   usage: node docs/design/yap/shoot.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
mkdirSync(dir + 'img', { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
for (const n of process.argv.slice(2).length ? process.argv.slice(2) : ['a', 'b', 'c']) {
  await p.goto(`file://${dir}${n}.html`);
  await p.waitForLoadState('networkidle');
  await p.evaluate(() => document.fonts.ready);
  await p.addStyleTag({ content: '.swatch{display:none!important}' });
  await p.screenshot({ path: `${dir}img/${n}.png`, fullPage: true });
  await p.screenshot({ path: `${dir}img/${n}-top.png` });
}
await b.close();
