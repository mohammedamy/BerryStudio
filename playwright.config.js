import { defineConfig } from '@playwright/test';

// One light smoke suite (see BerryStudio-Upgrade-Plan WP-0.2) — not a broad
// E2E suite. Spins up the same `python3 -m http.server` flow the README
// documents for local dev, so the test runs against exactly what a
// developer/CI would actually serve, not a special test-only server.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  webServer: {
    command: 'python3 -m http.server 8793',
    url: 'http://localhost:8793/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://localhost:8793',
  },
});
