import { test, expect } from '@playwright/test';

test('the landing page says what FastDraw is, sets up an agent, and opens a kind in the editor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your coding agent draws the diagram');
  // the setup tabs switch the command
  await expect(page.locator('#setup-panel .command code').first()).toHaveText('npx fastdraw setup claude');
  await page.getByRole('tab', { name: 'GitHub Copilot' }).click();
  await expect(page.locator('#setup-panel .command code').first()).toHaveText('npx fastdraw setup copilot');
  // a kind opens as a new diagram in the editor
  await page.locator('a.tile[href$="kind=swimlane"]').click();
  await expect(page).toHaveURL(/\/edit\/$/);
  await page.waitForSelector('svg.canvas');
  expect(errors).toEqual([]);
});

test('the showcase redraws the same file in each look, and the page does not scroll sideways on a phone', async ({ page }) => {
  await page.goto('/');
  const svg = page.locator('.showframe svg');
  await expect(svg).toHaveAttribute('aria-label', /Whiteboard look/);
  const before = await svg.innerHTML();
  await page.getByRole('radio', { name: 'Sketch' }).click();
  await expect(svg).toHaveAttribute('aria-label', /Sketch look/);
  expect(await svg.innerHTML()).not.toBe(before);
  await page.locator('.showcase').getByRole('button', { name: /Show the file/ }).click();
  await expect(page.locator('.showsrc')).toContainText('look sketch');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('the feature diagram draws in its own look, with zones, steps and a chart', async ({ page }) => {
  await page.goto('/');
  const svg = page.locator('.artframe svg');
  await svg.scrollIntoViewIfNeeded();
  await expect(svg).toContainText('How an order is placed');
  await expect(svg).toContainText('Private network 10.0.0.0/16');
  await expect(svg).toContainText('Observability');
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
  // a dark page, and the showcase starts on the Night look
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(11, 18, 38)');
  await expect(page.getByRole('radio', { name: 'Night' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Light theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  // the choice outlives the system setting, on this page and in the editor
  await page.goto('/edit/');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await ctx.close();
});
