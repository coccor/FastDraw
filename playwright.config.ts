import { defineConfig } from '@playwright/test';

// Browser tests for the editor. `npm run test:e2e` starts the dev server if it is not running.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', viewport: { width: 1500, height: 900 }, acceptDownloads: true },
  webServer: { command: 'npx vite', url: 'http://localhost:5199', reuseExistingServer: true, timeout: 60_000 },
});
