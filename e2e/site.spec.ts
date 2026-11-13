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

test('the illustration draws with its own look and its colour pictures', async ({ page }) => {
  await page.goto('/');
  const svg = page.locator('.artframe svg');
  await expect(svg).toBeVisible();
  expect(await svg.locator('image').count()).toBeGreaterThanOrEqual(10);
  await expect(svg).toContainText('The life of an order');
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
