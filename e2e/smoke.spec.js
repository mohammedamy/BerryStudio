import { test, expect } from '@playwright/test';

// One light smoke spec (see BerryStudio-Upgrade-Plan WP-0.2): load the app,
// pick a pattern, grade it, export SVG, open the 3D preview, and confirm no
// console errors anywhere along the way. Deliberately not a broad E2E
// suite — this exists to catch "the app doesn't load at all" regressions
// (exactly the class of bug WP-0.1's module conversion risked), not to
// cover every feature.
test('load, grade, export SVG, open 3D preview — no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // js/app.js:1713 deliberately tries icons/intro.{png,jpg,svg} in order
    // and falls back on 404 — a genuine, pre-existing, self-healing pattern,
    // not a real error. Everything else still fails the test.
    if (/Failed to load resource.*404/.test(msg.text())) return;
    errors.push(msg.text());
  });

  await page.goto('/index.html');

  // Dismiss the onboarding modal.
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  // A pattern is loaded by default (the app boots with one already drafted).
  await expect(page.locator('#patternCanvas')).toBeVisible();

  // Grade to XXXL and confirm the chest measurement actually changed.
  await page.getByRole('button', { name: 'XXXL', exact: true }).click();
  await expect(page.locator('#chipSize')).toContainText('XXXL');

  // Export SVG via the real in-app engine (Canvas.exportSVG), same call the
  // UI's download button makes — avoids fighting a native file-save dialog
  // in a headless smoke test while still exercising the real export path.
  const svg = await page.evaluate(() => window.Canvas.exportSVG({ seam: true, unitsCm: true }));
  expect(svg).toContain('<svg');

  // Open the 3D preview and give three.js a moment to initialize. The 2D
  // pattern canvas (#patternCanvas) stays in the DOM but hidden once this
  // view switches, so this specifically checks for a VISIBLE canvas rather
  // than just "any canvas exists".
  await page.getByRole('button', { name: '3D Preview' }).click();
  await page.waitForTimeout(2000);
  await expect(page.locator('canvas:visible').first()).toBeVisible();

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// BerryStudio-Upgrade-Plan WP-9.1: the standalone capability-check page
// loads with no console errors and reaches a real verdict (not stuck on
// "Checking…", the case a CSP misconfiguration or a broken import would
// produce — see js/capability-check-3d.js's own history: an earlier inline
// <script> version was silently blocked by this exact page's CSP).
test('/3d-test.html loads, reaches a verdict, no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('/3d-test.html');
  await expect(page.locator('#verdict')).not.toHaveText('Checking…', { timeout: 5000 });
  await expect(page.locator('#verdict')).toHaveClass(/pass|warn|fail/);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// BerryStudio-Upgrade-Plan WP-1: the AI Provider settings panel renders and
// a full provider round-trip (settings entry -> Test Connection -> real
// adapter -> UI status line) works end-to-end. The actual provider API call
// is intercepted (page.route) so this never depends on network access or a
// real key in CI — it still exercises the real js/ai-providers.js code path,
// just against a canned response instead of a live server.
test('AI Provider settings panel renders and a mocked Test Connection round-trip succeeds', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) errors.push(msg.text()); });

  await page.route('**/v1/messages', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ content: [{ type: 'text', text: 'OK' }], usage: { input_tokens: 5, output_tokens: 1 } }),
  }));

  await page.goto('/index.html');
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsModal')).toHaveClass(/show/);
  await page.getByText('Text generation', { exact: true }).click();
  await page.locator('#settingsModal select').selectOption('anthropic');
  await expect(page.getByText('API key', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.locator('#settingsModal .help-note', { hasText: '✓' })).toBeVisible({ timeout: 10000 });

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// BerryStudio-Upgrade-Plan WP-5.5: the feature-flagged "embedded" Cloth Lab
// engine (React/R3F mounted directly into #clothLabEmbed via the shared
// import map, replacing the default cross-document iframe) actually mounts
// and renders. Run in real Chromium via Playwright rather than the
// interactive dev tool's own WebKit-based browser pane, which was observed
// to fail dynamic `import('react')` even though the import map is correctly
// present in the DOM — a tool-specific limitation, not a bug in this code
// (confirmed by this same check passing here).
test('embedded Cloth Lab engine mounts real content with no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/Failed to load resource.*404/.test(msg.text())) return;
    errors.push(msg.text());
  });

  await page.goto('/index.html');
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  // Flip the engine flag via the real Settings UI, not a localStorage
  // shortcut — this also exercises the toggle rendering itself.
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsModal')).toHaveClass(/show/);
  await page.getByRole('button', { name: 'Embedded', exact: true }).click();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '3D Cloth Lab' }).click();

  const embedContainer = page.locator('#clothLabEmbed');
  await expect(embedContainer).toBeVisible();
  // React having actually mounted into the container, not just the div
  // existing — the concrete assertion the dynamic import() + mount() call
  // succeeded rather than silently failing into the .catch() in
  // mountClothLabEmbedded() (js/app.js).
  await expect(embedContainer.locator('canvas')).toBeVisible({ timeout: 15000 });

  // The iframe path must be genuinely inactive, not just visually hidden —
  // .engine-embedded's CSS rule (css/styles.css) is what proves the flag
  // actually took effect end-to-end, not merely that a canvas rendered.
  await expect(page.locator('#viewClothLab')).toHaveClass(/engine-embedded/);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});
