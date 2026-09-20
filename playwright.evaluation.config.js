import { defineConfig } from '@playwright/test';

// Separate from product smoke tests: this exercises the real local generation
// pipeline with original reference bytes, without a provider or account UI.
export default defineConfig({
  testDir: './evaluation/browser',
  outputDir: './test-results/evaluation',
  workers: 1,
  retries: 0,
  timeout: 120000,
  reporter: 'list',
  webServer: {
    command: 'node scripts/serve-evaluation.mjs',
    url: 'http://127.0.0.1:8794/evaluation/browser/harness.html',
    reuseExistingServer: false,
    timeout: 15000,
  },
  use: {baseURL:'http://127.0.0.1:8794',bypassCSP:false,serviceWorkers:'block'},
});
