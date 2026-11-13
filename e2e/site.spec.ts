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

test('the guide is served for agents: llms.txt and each kind', async ({ request }) => {
  const llms = await (await request.get('/llms.txt')).text();
  expect(llms).toContain('npx fastdraw');
  expect(llms).toContain('https://fastdraw.dev/guide/swimlane.md');
  expect(llms).toContain('shape styles');
  const kind = await request.get('/guide/swimlane.md');
  expect(kind.ok()).toBe(true);
  expect(await kind.text()).toMatch(/^# /);
});
