import { test, expect } from '@playwright/test';

// Onboarding shows after a deliberate 400ms delay (js/app.js's init(),
// `setTimeout(startOnboarding, 400)`) — not synchronously on load. A plain
// `isVisible()` check taken immediately after page.goto() can race ahead
// of that timer: it correctly sees nothing yet, skips the click, and the
// modal then appears moments later and silently intercepts every
// subsequent click for the rest of the test (confirmed in CI — this exact
// race, not a real app bug, caused 3 of 5 smoke tests to fail with
// "<div id=\"onbModal\">... subtree intercepts pointer events"). Waiting
// explicitly for the button (up to a few seconds) handles both outcomes:
// the delayed appearance, and never appearing at all.
async function dismissOnboarding(page) {
  const skip = page.getByRole('button', { name: 'Skip' });
  await skip.waitFor({ state: 'visible', timeout: 3000 }).catch(() => null);
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

// A plain `toBeVisible()` timeout gives no clue WHY a canvas never
// appeared — if the underlying mount threw, that's a console error this
// test's own listener already captured into `errors`, but Playwright's
// failure message doesn't include it. Surface it explicitly so a CI-only
// failure is diagnosable from the check-run annotation alone (no shell
// access to the runner's job log — see the CI-diagnostics commit this
// pass added the `github` reporter for).
async function expectVisibleOrDumpErrors(locator, errors, timeout) {
  try {
    await expect(locator).toBeVisible({ timeout });
  } catch (e) {
    throw new Error(`${e.message}\n\nConsole errors captured during this test so far:\n${errors.join('\n') || '(none)'}`);
  }
}

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
  await dismissOnboarding(page);

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
  await dismissOnboarding(page);

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
  await dismissOnboarding(page);

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
  await expectVisibleOrDumpErrors(embedContainer.locator('canvas'), errors, 15000);

  // The iframe path must be genuinely inactive, not just visually hidden —
  // .engine-embedded's CSS rule (css/styles.css) is what proves the flag
  // actually took effect end-to-end, not merely that a canvas rendered.
  await expect(page.locator('#viewClothLab')).toHaveClass(/engine-embedded/);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// BerryStudio-Upgrade-Plan WP-10: the standalone BodyForm page renders an
// avatar from measurements (bodyOnly mode — no garment/cloth UI), exports
// GLB/OBJ, and its "Open in Fit Studio" handoff (sessionStorage + a URL
// flag, see js/body-handoff.js) lands the main app directly on the 3D
// Cloth Lab with the same category and measurements.
test('BodyForm generates an avatar, exports GLB/OBJ, and hands off to Fit Studio', async ({ page }) => {
  // GLB/OBJ export walks the full scene graph through three.js's
  // GLTFExporter/OBJExporter — real CPU work, not instant, and a shared
  // CI runner (no real GPU, cold caches) is measurably slower than local
  // dev. The default 30s test timeout was cutting this close in CI (a
  // prior run timed out mid-export with no thrown error captured —
  // ExportPanel.jsx catches export failures into React state, not
  // console.error, so this test's own error listener can't see them
  // either way); doubled here rather than guessing at a specific slow
  // step to shave down.
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/Failed to load resource.*404/.test(msg.text())) return;
    errors.push(msg.text());
  });

  await page.goto('/body.html');
  await expectVisibleOrDumpErrors(page.locator('#clothLabEmbed canvas'), errors, 15000);

  await page.getByRole('button', { name: 'Men', exact: true }).click();
  const chestInput = page.locator('input[data-k="chest"]');
  await chestInput.fill('123');
  await chestInput.dispatchEvent('change');
  await page.getByRole('button', { name: 'Generate Avatar' }).click();
  await page.waitForTimeout(1000);

  let glbDownload;
  try {
    [glbDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 45000 }),
      page.getByRole('button', { name: 'Export GLB' }).click(),
    ]);
  } catch (e) {
    // ExportPanel.jsx (cloth-lab) catches export failures into React
    // state, not console.error — this test's own `errors` listener can't
    // see them from there either way. Dump everything available: captured
    // console/page errors, the panel's own error text, the export button's
    // current text (still "Working…" = hung; reverted with no download =
    // silently swallowed somewhere), and a body-text snapshot in case the
    // whole page crashed/blanked rather than just this one panel.
    const panelError = await page.locator('text=/Export.+failed:/').textContent().catch(() => null);
    const btnText = await page.getByRole('button', { name: /Export GLB|Working…/ }).first().textContent().catch(() => null);
    const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 800)).catch(() => null);
    throw new Error(
      `${e.message}\n\n` +
      `Console/page errors captured so far:\n${errors.join('\n') || '(none)'}\n\n` +
      `ExportPanel error text: ${panelError || '(none)'}\n` +
      `Export button text: ${btnText || '(not found)'}\n\n` +
      `document.body.innerText (first 800 chars): ${bodySnippet || '(could not read)'}`
    );
  }
  expect(glbDownload.suggestedFilename()).toMatch(/\.glb$/);
  const [objDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export OBJ' }).click(),
  ]);
  expect(objDownload.suggestedFilename()).toMatch(/\.obj$/);

  await page.getByRole('button', { name: 'Open in Fit Studio' }).click();
  await expect(page).toHaveURL(/index\.html\?fromBodyForm=1/);

  // Lands directly on the Cloth Lab view, not the usual 2D-pattern boot screen.
  await expect(page.locator('#viewToggle button.active')).toHaveText('3D Cloth Lab');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pps')));
  expect(state.category).toBe('men');
  expect(Number(state.custom.chest)).toBe(123);
  // The handoff URL flag is consumed exactly once (history.replaceState).
  await expect(page).toHaveURL(/index\.html$/);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});
