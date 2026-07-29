import { defineConfig } from '@playwright/test';

// One light smoke suite (see BerryStudio-Upgrade-Plan WP-0.2) — not a broad
// E2E suite. Spins up the same `python3 -m http.server` flow the README
// documents for local dev, so the test runs against exactly what a
// developer/CI would actually serve, not a special test-only server.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // In CI, also emit GitHub Actions annotations (one per failing test, with
  // the actual assertion error) — the job's own raw log requires repo admin
  // rights to fetch via the API, but check-run annotations are public, so
  // this is how a failure actually gets diagnosed without shell access to
  // the runner. `list` stays first for a normal human-readable console log.
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  webServer: {
    command: 'python3 -m http.server 8793',
    url: 'http://localhost:8793/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://localhost:8793',
    // BerryStudio-Upgrade-Plan WP-1 added a real, strict CSP (no
    // 'unsafe-inline' in script-src — see index.html). Playwright's own
    // browser automation injects its test-harness instrumentation as an
    // inline script, which that CSP correctly blocks like any other inline
    // script — a real site visitor never triggers this, only the test
    // driver does. `bypassCSP` is Playwright's documented mechanism for
    // exactly this situation: it only affects this isolated test browser
    // context, never the CSP real users get.
    bypassCSP: true,
  },
});
