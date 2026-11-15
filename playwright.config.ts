import { defineConfig } from '@playwright/test';

// E2E_PORT runs the dev server on another port, so a worktree does not reuse a server started from elsewhere.
const port = Number(process.env.E2E_PORT) || 5199;

// Browser tests for the editor. `npm run test:e2e` starts the dev server if it is not running.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, viewport: { width: 1500, height: 900 }, acceptDownloads: true },
  webServer: { command: `npx vite --port ${port}`, url: `http://localhost:${port}`, reuseExistingServer: true, timeout: 60_000 },
});
