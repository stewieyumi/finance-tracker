import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.pw.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 10000 },
  outputDir: join(root, 'test-results'),
  reporter: [['list'], ['html', { outputFolder: join(root, 'playwright-report'), open: 'never' }],
    ['json', { outputFile: join(root, 'test-results/results.json') }]],
  use: {
    baseURL: 'http://127.0.0.1:5188',
    browserName: 'chromium',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 5188 --strictPort',
    cwd: root,
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: false,
    timeout: 60000,
    env: { VITE_GOOGLE_CLIENT_ID: '000000000000-browser-smoke.apps.googleusercontent.com' },
  },
});
