import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for renderer-pdf E2E tests.
 *
 * The only thing these tests verify is "did the printed HTML fit on one A4
 * page?" — which jsdom cannot answer because it does not lay out CSS. We
 * launch headless chromium, drive `page.setContent()` + `page.pdf()`, then
 * count the resulting PDF's pages with pdf-parse.
 *
 * No web server, no fixtures, no flakiness budget — these are deterministic
 * given the HTML/CSS input.
 */
export default defineConfig({
  testDir: './tests-e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: 'list',
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
