import { test, expect, type Page } from '@playwright/test';

// Where a point of the diagram (in its own coordinates) is on the screen.
const onScreen = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => {
  const svg = document.querySelector<SVGSVGElement>('.wb-canvas svg')!;
  const q = new DOMPoint(px, py).matrixTransform(svg.getScreenCTM()!);
  return { x: q.x, y: q.y };
}, [x, y]);

test('the landing page says what FastDraw is and sets up an agent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Diagrams your agent writes as text.');
  // the one command sits beside the headline
  await expect(page.locator('.hero .command code')).toHaveText('npx skills add coccor/fastdraw');
  // the setup tabs switch the command
  await expect(page.locator('#setup-panel .command code').first()).toHaveText('/plugin install fastdraw --marketplace coccor/fastdraw');
  await page.getByRole('tab', { name: 'GitHub Copilot' }).click();
  await expect(page.locator('#setup-panel .command code').first()).toHaveText('npx fastdraw setup copilot');
  expect(errors).toEqual([]);
});

test('dragging a box in the small editor changes that box\'s line and no other', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const status = page.locator('.wb-status'), lines = page.locator('.wb-ln');
  await expect(status).toHaveText('Nothing has changed yet. Drag a box on the canvas.');
  await expect(lines).toHaveCount(16);
  await expect(page.locator('.wb-ln.hit')).toHaveCount(0);
  // measure the canvas only once web fonts have loaded and it is on screen, so the page cannot reflow mid-drag
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.wb-canvas svg').scrollIntoViewIfNeeded();
  // Payments is at 984,112 and 144x64: take it by its middle and pull it 144px down
  const from = await onScreen(page, 984 + 72, 112 + 32), to = await onScreen(page, 984 + 72, 256 + 32);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect(status).toHaveText('Line 10 changed. The other 15 lines are as they were.');
  const hit = page.locator('.wb-ln.hit');
  await expect(hit).toHaveCount(1);
  await expect(hit.locator('del')).toHaveText('984,112');
  await expect(hit.locator('ins')).toHaveText('984,256');
  // the arrow keys move the selected box too, and Reset puts the file back
  await page.locator('.wb-canvas svg').press('ArrowRight');
  await expect(hit.locator('ins')).toHaveText('992,256');
  await page.getByRole('button', { name: 'Add a box' }).click();
  await expect(lines).toHaveCount(17);
  await expect(lines.last()).toContainText('box: node "New box" at 40,384');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(lines).toHaveCount(16);
  await expect(page.locator('.wb-ln.hit')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a look writes one line into the file, a kind loads its example, and the full editor takes over the diagram', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.wb-canvas svg'), first = page.locator('.wb-ln').first();
  const before = await canvas.innerHTML();
  await expect(page.getByRole('radio')).toHaveCount(5);
  await expect(page.getByRole('radio', { name: 'Built-in' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'Shade' }).click();
  await expect(first).toHaveText('1look shade');
  expect(await canvas.innerHTML()).not.toBe(before);
  await expect(page.locator('.lookabout')).toContainText('Shade.');
  // every kind is in the index; choosing one puts its example in the editor
  await expect(page.locator('.kinds button')).toHaveCount(44);
  await page.getByRole('button', { name: 'Swimlane diagram' }).click();
  await expect(page.locator('.wb-file')).toHaveText('swimlane.fdraw');
  await expect(canvas).toContainText('Hiring a new engineer');
  await expect(page.locator('.wb-status')).toHaveText('Nothing has changed yet. Drag a box on the canvas.');
  // with a look chosen, the full editor opens on the same text
  await page.getByRole('radio', { name: 'Sketch' }).click();
  await page.getByRole('link', { name: 'Open in the full editor' }).click();
  await expect(page).toHaveURL(/\/edit\/$/);
  await expect(page.locator('svg.canvas')).toContainText('Hiring a new engineer');
});

test('the page does not scroll sideways on a phone, and the small editor still works there', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Move a box' }).click();
  await expect(page.locator('.wb-status')).toHaveText('Line 10 changed. The other 15 lines are as they were.');
});

test('the guide is served for agents: llms.txt and each kind', async ({ request }) => {
  const llms = await (await request.get('/llms.txt')).text();
  expect(llms).toContain('npx fastdraw');
  expect(llms).toContain('https://fastdraw.dev/guide/swimlane.md');
  expect(llms).toContain('shape styles');
  const kind = await request.get('/guide/swimlane.md');
  expect(kind.ok()).toBe(true);
  expect(await kind.text()).toMatch(/^# /);
});

test('the site follows a dark system setting, and the toggle switches and remembers the theme', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  // a dark page, and the diagram is drawn in the Night look without the file saying so
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(11, 18, 38)');
  await expect(page.locator('.wb-canvas svg rect.fd-page').first()).toHaveAttribute('fill', '#0b1226');
  await expect(page.locator('.wb-ln').first()).not.toContainText('look');
  await page.getByRole('button', { name: 'Light theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  // the choice outlives the system setting, on this page and in the editor
  await page.goto('/edit/');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await ctx.close();
});
