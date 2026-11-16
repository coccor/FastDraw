// Screenshots of the running site, light and dark.   usage: node docs/design/yap/shoot-site.mjs [url]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5244/';
const out = new URL('img/', import.meta.url).pathname;
const b = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript((t) => localStorage.setItem('fastdraw-theme', t), theme);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url);
  await p.waitForSelector('.wb-canvas svg');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}site-${theme}.png`, fullPage: true });
  await p.screenshot({ path: `${out}site-${theme}-top.png` });
  if (theme === 'light') {
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}site-phone.png`, fullPage: true });
  }
  if (errors.length) console.log(theme, errors);
  await p.close();
}
await b.close();
