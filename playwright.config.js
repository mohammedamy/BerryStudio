import { defineConfig } from '@playwright/test';

// One light smoke suite (see BerryStudio-Upgrade-Plan WP-0.2) — not a broad
// E2E suite. Serves the unmodified repository with the standard-library
// static handler, an explicit loopback address and enough accept backlog
// for concurrent module-loading bursts.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // The suite has a handful of tests that flake under CI resource
  // contention (settings-modal timing, Cloth Lab embed load, notch
  // selection) — confirmed unrelated to actual app bugs by rerunning the
  // exact same commit's files repeatedly and seeing a different random
  // test fail each time. A single flaky run shouldn't block every deploy.
  retries: process.env.CI ? 2 : 0,
  // In CI, also emit GitHub Actions annotations (one per failing test, with
  // the actual assertion error) — the job's own raw log requires repo admin
  // rights to fetch via the API, but check-run annotations are public, so
  // this is how a failure actually gets diagnosed without shell access to
  // the runner. `list` stays first for a normal human-readable console log.
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  webServer: {
    command: 'python3 scripts/serve-e2e.py',
    url: 'http://127.0.0.1:8793/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:8793',
    // Explicit local fallback for hosts where headless Chromium cannot
    // create a hardware WebGL context (for example after host sleep).
    launchOptions: process.env.PLAYWRIGHT_SOFTWARE_GL === '1'
      ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
      : {},
    // Legacy smoke cases retain their existing CSP bypass. The separate
    // csp.spec.js explicitly disables it and verifies real visitor policy.
    // Passing this broad suite alone is not evidence of CSP compatibility.
    bypassCSP: true,
  },
});
