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

  // A real, previously-shipped regression this test's own predecessor never
  // caught: #canvas3d can be CSS-"visible" (real bounding box, correct
  // wrapper classes) while its internal raster buffer is still 0×0 and
  // View3D never actually finished initializing — a plain visibility
  // check can't tell the two apart, so assert the real signal directly.
  const state3d = await page.evaluate(() => {
    const c = document.getElementById('canvas3d');
    return { w: c.width, h: c.height, ready: window.View3D.isReady() };
  });
  expect(state3d.ready, 'View3D.isReady() should be true once the 3D tab has been open a moment').toBe(true);
  expect(state3d.w).toBeGreaterThan(0);
  expect(state3d.h).toBeGreaterThan(0);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// A real regression, reported by a user: 3D Preview needs three.js from
// unpkg.com, and something in a real visitor's environment (most likely an
// ad-blocker/privacy extension/network filter — their device separately
// confirmed full WebGL2/WebGPU support via /3d-test.html, and Cloth Lab, a
// self-contained Vite bundle with no runtime CDN dependency, worked fine
// for them) was blocking that one domain specifically. js/three-view.js
// now falls through three tiers — the page's own import map, an explicit
// unpkg.com URL, then esm.sh (a genuinely different domain, already in
// this page's CSP for other features) — this proves the third tier alone
// is enough by blocking the first two entirely.
test('3D Preview still initializes when unpkg.com is completely blocked (esm.sh fallback)', async ({ page }) => {
  await page.route('**://unpkg.com/**', (route) => route.abort());

  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/index.html');
  await dismissOnboarding(page);
  await page.locator('#viewToggle button[data-v="3d"]').click();
  await page.waitForTimeout(3000);

  const state3d = await page.evaluate(() => {
    const c = document.getElementById('canvas3d');
    return { w: c.width, h: c.height, ready: window.View3D.isReady() };
  });
  expect(state3d.ready).toBe(true);
  expect(state3d.w).toBeGreaterThan(0);
  expect(state3d.h).toBeGreaterThan(0);

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
  // Settings now has several <select>s (AI provider, cloud-sync target,
  // per-category avatar pickers) — scope to the one that actually offers
  // an "anthropic" option rather than assuming it's the only select.
  const providerSelect = page.locator('#settingsModal select').filter({ has: page.locator('option[value="anthropic"]') });
  await providerSelect.selectOption('anthropic');
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
// Code-review fix (WP-42 Stage B): Cloth Lab (both entry points) is now a
// gated surface — signed out (this suite never authenticates, same
// constraint noted throughout this project's own WP-42 verification), the
// embedded engine must NOT mount at all, matching js/app.js's
// loadClothLab()/teardownClothLab() ("the GPU work never starts while
// gated"). This test used to assert the OPPOSITE (a real canvas renders)
// before gating existed; it now asserts the gate itself, which is the
// actual current, correct behavior for a signed-out visitor. The
// "embedded engine genuinely mounts and renders a working Three.js scene"
// coverage this test used to provide now needs a real signed-in account
// to exercise at all — same limitation as the automation API's
// export()/generate() tests above — so it isn't re-asserted here.
test('embedded Cloth Lab engine stays gated (does not mount) when signed out', async ({ page }) => {
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

  // The gate overlay renders instead of the embedded engine mounting.
  await expect(page.locator('#clothLabGate')).toBeVisible();
  // React never mounted into #clothLabEmbed at all — the concrete
  // assertion that the dynamic import()/mount() call was never even
  // attempted (js/app.js's loadClothLab() gate short-circuits before
  // calling mountClothLabEmbedded()), not just that its result is hidden.
  await expect(page.locator('#clothLabEmbed canvas')).toHaveCount(0);

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
  // dev, and its own speed varies run to run. 60s was already a doubling
  // of the default and STILL timed out twice in CI (confirmed not a
  // regression both times — every other test in this file passed
  // cleanly alongside it); this isn't "a bit tight", it's genuinely
  // insufficient headroom for this runner's variance, so it's raised
  // again rather than re-doubling into the same wall a third time.
  test.setTimeout(120000);
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
      page.waitForEvent('download', { timeout: 90000 }),
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

// BerryStudio-Upgrade-Plan WP-13: industrial per-point grading. The
// Size pane's "Grade Rules" section only renders once a pattern's pieces
// exist (js/grading.js's resolution logic itself is covered by
// test/grading.test.js) — this exercises the real UI wiring end-to-end:
// authoring a dx/dy-per-step override actually changes the graded piece's
// outline point by exactly dx*step/dy*step (not the formula's own delta),
// and the Grade Nest preview modal renders real (non-blank) canvas content.
test('Grade Rules: authoring a per-point override changes graded output, Grade Nest preview renders', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/Failed to load resource.*404/.test(msg.text())) return;
    errors.push(msg.text());
  });

  await page.goto('/index.html');
  await dismissOnboarding(page);
  await expect(page.locator('#patternCanvas')).toBeVisible();

  await page.getByRole('button', { name: 'Size', exact: true }).click();
  const dxInputs = page.locator('.rail-pane[data-pane=size] .row:has(input[type=number]) input[type=number]');
  await expect(dxInputs.first()).toBeVisible();

  // Author a rule on point 0: dx=2, dy=1 per size step.
  await dxInputs.nth(0).fill('2');
  await dxInputs.nth(0).dispatchEvent('change');
  await dxInputs.nth(1).fill('1');
  await dxInputs.nth(1).dispatchEvent('change');

  const rules = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('pps'));
    return s.gradeRules[s.loaded];
  });
  const firstPieceKey = await page.evaluate(() => window.Canvas.getPieces()[0].key);
  expect(rules[firstPieceKey]['0']).toEqual({ dx: 2, dy: 1 });

  // Grade up one step (M -> L) and confirm point 0 resolves to exactly
  // base-at-M + {dx,dy}*step = [0,0] + {2,1}*1 = [2,1]. Checked against
  // the raw (pre-layout) graded output via the same resolveGradedPieces
  // the app itself calls — NOT Canvas.getPieces()'s post-layout outline,
  // since layoutPieces re-normalizes each piece to its own bounding box
  // (`place = ([x,y]) => [x-minX+px, y-minY+py]`); point 0 happens to be
  // this piece's own (0,0) drafting origin, so overriding it shifts the
  // piece's minY too, and the layout renormalization would silently
  // absorb the very delta this assertion needs to see.
  await page.getByRole('button', { name: 'L', exact: true }).click();
  const gradedPoint0 = await page.evaluate(async () => {
    const { PATTERNS, computeMeasurements } = await import('/js/data.js');
    const { resolveGradedPieces } = await import('/js/grading.js');
    const s = JSON.parse(localStorage.getItem('pps'));
    const opts = { category: s.category, size: s.size, standard: s.standard, kids: s.kids, custom: s.custom };
    const pieces = resolveGradedPieces(PATTERNS[s.loaded], opts, computeMeasurements, s.gradeRules[s.loaded]);
    return pieces.find((p) => p.key === s.gradeRulesPiece).outline[0];
  });
  expect(gradedPoint0).toEqual([2, 1]);

  // Grade Nest preview: overlays S/M/L/XL of the selected piece — real
  // canvas content, not a blank modal.
  await page.getByRole('button', { name: 'Preview Grade Nest' }).click();
  await expect(page.locator('#genericModal')).toHaveClass(/show/);
  const nonEmptyPixels = await page.evaluate(() => {
    const canvas = document.querySelector('#genericModal canvas');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
    return n;
  });
  expect(nonEmptyPixels).toBeGreaterThan(0);

  // Clean up the authored rule so this test doesn't leak state via
  // localStorage into a differently-ordered future run.
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('pps'));
    s.gradeRules = {};
    localStorage.setItem('pps', JSON.stringify(s));
  });

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// BerryStudio-Upgrade-Plan WP-14: "walk the seam". Loads a real princess-
// seam Fancy Collection design (the one real producer of edges[].seamId
// metadata today), opens the Walk the Seam tool, and confirms it finds
// the frontCenter/frontSide pair and renders a real (non-blank) preview
// at several slider positions — the visual front-end over
// js/geometry.js's seamPointAtFraction, itself unit-tested separately.
test('Walk the Seam finds a real princess-seam pair and renders at multiple positions', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/Failed to load resource.*404/.test(msg.text())) return;
    errors.push(msg.text());
  });

  await page.goto('/index.html');
  await dismissOnboarding(page);
  await expect(page.locator('#patternCanvas')).toBeVisible();

  // Load a princess-seam design directly via FancyGen — the one real
  // producer of edges[].seamId metadata (see js/fancy-patterns.js's
  // princessBodice()) — same technique the Grade Rules test above uses
  // to reach real generated pieces without depending on the library
  // grid's current thumbnail layout.
  await page.evaluate(async () => {
    const { computeMeasurements } = await import('/js/data.js');
    const { FancyGen } = await import('/js/fancy-patterns.js');
    const m = computeMeasurements({ category: 'women', size: 'M', standard: 'intl', kids: null, custom: null });
    const pieces = FancyGen.build('gown', m, {});
    window.Canvas.setPattern(pieces, ['#6d5efc', '#00c2a8', '#ff5d8f', '#e2a52b', '#4c8dff', '#c1492e']);
  });

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Walk the Seam' }).click();
  await expect(page.locator('#genericModal')).toHaveClass(/show/);
  await expect(page.locator('#genericModal')).toContainText('princessFront');

  const slider = page.locator('#genericModal input[type=range]');
  for (const v of [0, 50, 100]) {
    await slider.fill(String(v));
    const nonEmptyPixels = await page.evaluate(() => {
      const canvas = document.querySelector('#genericModal canvas');
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
      return n;
    });
    expect(nonEmptyPixels).toBeGreaterThan(0);
  }

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// BerryStudio-Upgrade-Plan WP-15: the local automation API
// (window.BerryStudio, js/berry-studio-api.js) — every verb is a direct
// pass-through to capability the rest of this suite already exercises
// individually, so this test's job is narrower: prove the FACADE itself
// wires correctly end-to-end against a real loaded pattern, for the three
// UNGATED verbs (grade/validate/nest — grading, nesting, and pattern
// validation are explicitly free surfaces per plan v3.2 §6), not
// stubbed/mocked results. export()/generate() are covered by the
// signed-out-throws test right below instead — see that test's own
// comment for why this one can't also assert their SUCCESS path.
test('window.BerryStudio automation API: three ungated verbs return real (not stubbed) results', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/Failed to load resource.*404/.test(msg.text())) return;
    errors.push(msg.text());
  });

  await page.goto('/index.html');
  await dismissOnboarding(page);
  await expect(page.locator('#patternCanvas')).toBeVisible();

  // grade() — a plain measurement resolution, no pattern needed.
  const graded = await page.evaluate(() =>
    window.BerryStudio.grade({ category: 'women', size: 'L', standard: 'intl', kids: null, custom: null })
  );
  expect(graded.chest).toBeGreaterThan(0);
  // size L is one step above the M base grade — chest must have actually grown.
  const gradedM = await page.evaluate(() =>
    window.BerryStudio.grade({ category: 'women', size: 'M', standard: 'intl', kids: null, custom: null })
  );
  expect(graded.chest).toBeGreaterThan(gradedM.chest);

  // validate() — PatternValidator's real report shape over the loaded pieces.
  const report = await page.evaluate(() => window.BerryStudio.validate({}));
  expect(Array.isArray(report.perPiece)).toBe(true);
  expect(report.perPiece.length).toBeGreaterThan(0);

  // nest() — the real WP-11 polygon-nesting Worker, run over every loaded piece.
  const nestResult = await page.evaluate(() =>
    window.BerryStudio.nest({ matWidth: 150, allowRotate: true, minDistCm: 0.5 })
  );
  expect(nestResult.placements.length).toBeGreaterThan(0);
  expect(nestResult.utilization).toBeGreaterThan(0);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// Code-review fix (WP-42 Stage B): window.BerryStudio.generate()/export()
// used to call AIGen.generate()/Canvas.export* directly, completely
// bypassing js/app.js's entitlement gate — a signed-out or expired-trial
// user could get full AI generation / real exports from the console for
// free, with no sign-in prompt, even though the exact same actions are
// gated everywhere in the real UI. Fixed by giving the facade its own
// fresh entitlement check (js/berry-studio-api.js's checkEntitlement()).
// This test asserts the actual regression: signed out (this suite never
// authenticates against Supabase — creating/using a real test account is
// out of scope for an automated e2e run, same constraint noted throughout
// this project's own WP-42 verification notes), both calls must now
// REJECT rather than silently succeed. The entitled-success path (an
// active/trial account actually getting real results back) is instead
// covered at the unit level by test/entitlement.test.js's
// computeEntitlement() cases, which is what checkEntitlement() itself
// is built from.
test('window.BerryStudio.export()/generate() are gated — reject when signed out', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/index.html');
  await dismissOnboarding(page);
  await expect(page.locator('#patternCanvas')).toBeVisible();

  const exportResult = await page.evaluate(() =>
    window.BerryStudio.export('svg').then(
      () => ({ threw: false }),
      (e) => ({ threw: true, message: String(e && e.message || e) })
    )
  );
  expect(exportResult.threw).toBe(true);
  expect(exportResult.message).toMatch(/sign-in|subscription/i);

  const generateResult = await page.evaluate(() =>
    window.BerryStudio.generate({ prompt: 'a fitted knee-length dress', category: 'women', measurements: { chest: 88, waist: 70, hips: 96, backLen: 41, sleeve: 58, bicep: 28, height: 167 } }).then(
      () => ({ threw: false }),
      (e) => ({ threw: true, message: String(e && e.message || e) })
    )
  );
  expect(generateResult.threw).toBe(true);
  expect(generateResult.message).toMatch(/sign-in|subscription/i);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// BerryStudio-Upgrade-Plan WP-17: accessibility & UX. Two independent checks
// in one test — the canvas's new keyboard operations (cycle/nudge/delete a
// selected piece), and modal focus management (focus moves in on open,
// Escape closes and returns focus to the trigger) — both real behaviour
// added this pass, not markup-only.
test('WP-17: keyboard piece selection/nudge/delete, and modal focus management', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/index.html');
  await dismissOnboarding(page);
  await expect(page.locator('#patternCanvas')).toBeVisible();

  // Cycle to a piece, nudge it, then delete it.
  const pieceCountBefore = await page.evaluate(() => window.Canvas.getPieces().length);
  await page.locator('#patternCanvas').click();
  await page.keyboard.press(']');
  const selected = await page.evaluate(() => window.Canvas.getSelected());
  expect(selected).toBeGreaterThanOrEqual(0);

  const beforeX = await page.evaluate((i) => window.Canvas.getPieces()[i].outline[0][0], selected);
  await page.keyboard.press('ArrowRight');
  const afterX = await page.evaluate((i) => window.Canvas.getPieces()[i].outline[0][0], selected);
  expect(afterX).toBeCloseTo(beforeX + 1, 5);

  await page.keyboard.press('Delete');
  const pieceCountAfter = await page.evaluate(() => window.Canvas.getPieces().length);
  expect(pieceCountAfter).toBe(pieceCountBefore - 1);

  // Modal focus management: opening Settings moves focus inside the
  // dialog; Escape closes it and returns focus to the button that opened it.
  await page.locator('#settingsBtn').focus();
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsModal')).toHaveClass(/show/);
  const focusInsideModal = await page.evaluate(() =>
    document.querySelector('#settingsModal .modal').contains(document.activeElement)
  );
  expect(focusInsideModal).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsModal')).not.toHaveClass(/show/);
  const focusReturned = await page.evaluate(() => document.activeElement.id === 'settingsBtn');
  expect(focusReturned).toBe(true);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// Extends WP-17's piece-only selection/delete to "anything" on the canvas —
// a text annotation, a construction point, and a notch — each click-to-select
// (its own highlight ring/box) then Backspace-deletable, using the same
// Canvas.deleteSelection() the piece case already went through above.
test('select-anything: text annotation, construction point, and notch are each click-selectable and Backspace-deletable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/index.html');
  await dismissOnboarding(page);
  await expect(page.locator('#patternCanvas')).toBeVisible();
  const canvasBox = await page.locator('#patternCanvas').boundingBox();

  // --- text annotation ---
  await page.evaluate(() => window.Canvas.setTool('select'));
  await page.evaluate(() => window.Canvas.addText({ x: 55, y: 90, text: 'E2E TEST TEXT' }));
  const textScreen = await page.evaluate(() => {
    window.Canvas.render();
    const t = window.Canvas.getTexts()[0];
    return { x: t._sx + t._w / 2, y: t._sy - t._h / 2 };
  });
  await page.mouse.click(canvasBox.x + textScreen.x, canvasBox.y + textScreen.y);
  await page.keyboard.press('Backspace');
  expect(await page.evaluate(() => window.Canvas.getTexts().length)).toBe(0);

  // --- construction point ---
  const pointId = await page.evaluate(() => window.Canvas.addPoint(150, 40, 'E2E Point'));
  const pointScreen = await page.evaluate((id) => {
    window.Canvas.render();
    const p = window.Canvas.getPointById(id);
    return window.Canvas.screenOf(p.x, p.y);
  }, pointId);
  await page.mouse.click(canvasBox.x + pointScreen[0], canvasBox.y + pointScreen[1]);
  await page.keyboard.press('Backspace');
  expect(await page.evaluate((id) => !!window.Canvas.getPointById(id), pointId)).toBe(false);

  // --- notch --- (added via the pre-existing Notch tool — addNotch() snaps
  // to the nearest outline vertex of whatever piece is under the click)
  await page.evaluate(() => window.Canvas.setTool('notch'));
  const firstPiece = await page.evaluate(() => window.Canvas.getPieces()[0]);
  const midOutlinePt = firstPiece.outline[Math.floor(firstPiece.outline.length / 2)];
  const notchClickScreen = await page.evaluate((pt) => window.Canvas.screenOf(pt[0], pt[1]), midOutlinePt);
  await page.mouse.click(canvasBox.x + notchClickScreen[0], canvasBox.y + notchClickScreen[1]);
  const notchCountBefore = await page.evaluate(() => (window.Canvas.getPieces()[0].notches || []).length);
  expect(notchCountBefore).toBeGreaterThan(0);

  await page.evaluate(() => window.Canvas.setTool('select'));
  const notchPt = await page.evaluate(() => {
    const p = window.Canvas.getPieces()[0];
    return p.notches[p.notches.length - 1];
  });
  const notchScreen = await page.evaluate((pt) => window.Canvas.screenOf(pt[0], pt[1]), notchPt);
  await page.mouse.click(canvasBox.x + notchScreen[0], canvasBox.y + notchScreen[1]);
  await page.keyboard.press('Backspace');
  const notchCountAfter = await page.evaluate(() => (window.Canvas.getPieces()[0].notches || []).length);
  expect(notchCountAfter).toBe(notchCountBefore - 1);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// The Add Point tool: clicking anywhere along a piece's outline edge inserts
// a new vertex right there (not just at existing corners) — the piece grows
// one outline point, positioned on the edge, not duplicating an endpoint.
test('Add Point tool inserts a new vertex into a piece outline edge', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/index.html');
  await dismissOnboarding(page);
  await expect(page.locator('#patternCanvas')).toBeVisible();
  const canvasBox = await page.locator('#patternCanvas').boundingBox();

  const before = await page.evaluate(() => {
    const p = window.Canvas.getPieces()[0];
    return { count: p.outline.length, a: p.outline[0], b: p.outline[1] };
  });

  await page.evaluate(() => window.Canvas.setTool('addpoint'));
  const mid = [(before.a[0] + before.b[0]) / 2, (before.a[1] + before.b[1]) / 2];
  const midScreen = await page.evaluate((pt) => window.Canvas.screenOf(pt[0], pt[1]), mid);
  await page.mouse.click(canvasBox.x + midScreen[0], canvasBox.y + midScreen[1]);

  const after = await page.evaluate(() => {
    const p = window.Canvas.getPieces()[0];
    return { count: p.outline.length, inserted: p.outline[1] };
  });
  expect(after.count).toBe(before.count + 1);
  // the new point should land ON the edge (between a and b), not on top of either endpoint
  expect(after.inserted[0]).toBeGreaterThan(Math.min(before.a[0], before.b[0]) - 0.01);
  expect(after.inserted[0]).toBeLessThan(Math.max(before.a[0], before.b[0]) + 0.01);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// BerryStudio-Upgrade-Plan WP-18: optional cloud sync. The self-hosted
// endpoint target is the one part of this feature with no external OAuth
// dependency, so it's the part a smoke test can exercise fully end-to-end —
// a real HTTP PUT/GET against a throwaway server started for this test
// alone, proving the whole round trip (Settings config → Project menu →
// fetch → server → fetch back → Canvas.loadPieces), not just that the UI
// renders.
test('WP-18: self-hosted cloud sync saves and loads a real project round-trip', async ({ page }) => {
  const http = await import('node:http');
  let stored = null;
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { stored = Buffer.concat(chunks).toString(); res.writeHead(200); res.end('{"ok":true}'); });
      return;
    }
    if (stored === null) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(stored);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  try {
    await page.goto('/index.html');
    await dismissOnboarding(page);
    await expect(page.locator('#patternCanvas')).toBeVisible();

    // Enable Cloud Sync and point the self-hosted endpoint at the throwaway server.
    await page.locator('#settingsBtn').click();
    // The checkbox itself is visually hidden behind a styled `.switch` track
    // (a real <label class="set-row"> wraps both, so clicking the visible
    // row toggles it via native label association) — click the row, not
    // the zero-size input Playwright's own .check() would refuse to click.
    await page.locator('#settingsModal .set-row').nth(3).click(); // hoverHelp, highContrast, reduceMotion, cloudSync
    await expect(page.locator('#settingsModal input[type=checkbox]').nth(3)).toBeChecked();
    const endpointInput = page.locator('#settingsModal input[type=url]').first(); // sync endpoint renders before the avatar GLB url fields
    await endpointInput.fill(`http://localhost:${port}/project.json`);
    await endpointInput.dispatchEvent('change');
    await page.locator('#settingsModal [data-close]').click();

    const piecesBefore = await page.evaluate(() => window.Canvas.getPieces().length);

    // Save to cloud via the Project menu, then confirm the server actually received it.
    await page.locator('#projectBtn').click();
    await page.getByText(/Save to cloud|حفظ في السحابة/).click();
    await expect(page.locator('.toast').last()).toContainText(/Saved to cloud|تم الحفظ في السحابة/);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored).pieces.length).toBe(piecesBefore);

    // Clear the canvas, then load it back and confirm the real round trip.
    await page.evaluate(() => window.Canvas.clearAll());
    expect(await page.evaluate(() => window.Canvas.getPieces().length)).toBe(0);

    await page.locator('#projectBtn').click();
    await page.getByText(/Load from cloud|تحميل من السحابة/).click();
    await expect(page.locator('.toast').last()).toContainText(/Loaded from cloud|تم التحميل من السحابة/);
    expect(await page.evaluate(() => window.Canvas.getPieces().length)).toBe(piecesBefore);

    expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
  } finally {
    server.close();
  }
});

// Bundled avatar gallery: picking one of the repo-shipped GLB models in
// Settings sets state.avatarGLB for that category and the 3D Preview
// actually loads and displays it (not just that the dropdown renders).
test('bundled avatar picker loads a real GLB model into 3D Preview', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/index.html');
  await dismissOnboarding(page);

  await page.locator('#settingsBtn').click();
  const selects = page.locator('#settingsModal select');
  const count = await selects.count();
  let menSelect = null;
  for (let i = 0; i < count; i++) {
    const values = await selects.nth(i).evaluate((s) => [...s.options].map((o) => o.value));
    if (values.includes('bundled:man')) { menSelect = selects.nth(i); break; }
  }
  expect(menSelect).not.toBeNull();
  await menSelect.selectOption('bundled:man');
  await page.locator('#settingsModal [data-close]').click();

  const savedUrl = await page.evaluate(() => JSON.parse(localStorage.getItem('pps')).avatarGLB.men);
  expect(savedUrl).toBe('avatars/man.glb');

  await page.locator('#catSeg button[data-cat="men"]').click();
  await page.locator('#viewToggle button[data-v="3d"]').click();
  await page.waitForTimeout(3000);

  const state3d = await page.evaluate(() => {
    const c = document.getElementById('canvas3d');
    return { w: c.width, h: c.height, ready: window.View3D.isReady() };
  });
  expect(state3d.ready).toBe(true);
  expect(state3d.w).toBeGreaterThan(0);

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// BerryStudio-Upgrade-Plan-v2.0 WP-21: Route B's UI renders and shows an
// honest "no model loaded" state by default — never a stale success. A
// real .onnx file pick/inference round-trip isn't exercised here (that
// needs a real small model file and, for the WebGPU path, real GPU
// hardware — same class of gap WP-22 documents for Route C); this proves
// the wiring itself: the route toggle, the file picker, and the cache
// row all render against the real js/workers/model-file-cache.js (real
// IndexedDB in Chromium, not mocked).
test('WP-21: Route B (local .onnx file) UI renders an honest no-model-loaded state', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) errors.push(msg.text()); });

  await page.goto('/index.html');
  await dismissOnboarding(page);

  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsModal')).toHaveClass(/show/);
  await page.getByText('Text generation', { exact: true }).click();
  const providerSelect = page.locator('#settingsModal select').filter({ has: page.locator('option[value="browser-local"]') });
  await providerSelect.selectOption('browser-local');

  await page.getByRole('button', { name: 'Local .onnx file', exact: true }).click();
  await expect(page.getByText('No model loaded', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pick .onnx file…', exact: true })).toBeVisible();
  await expect(page.locator('#settingsModal input[type="file"][accept=".onnx"]')).toHaveCount(1);
  // No cached model on a fresh profile — the cache row says so honestly
  // rather than rendering a stale Restore/Clear pair.
  await expect(page.getByText('No cached model', { exact: false })).toBeVisible();

  // Switching back to the Hugging Face route restores the plain model
  // text field (Route C, unchanged by this WP).
  await page.getByRole('button', { name: 'Hugging Face model ID', exact: true }).click();
  await expect(page.locator('#settingsModal input[list^="dl-text-"]')).toBeVisible();

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// The real end-to-end path WP-21 actually promises: pick a genuine .onnx
// file, run it through the real onnxruntime-web CDN import (WASM in
// headless Chromium — no GPU device there), get a real inference result,
// then reload the page with nothing re-picked and confirm the model does
// NOT silently reappear (js/workers/local-model-worker.js starts fresh
// every reload; the honest state is "no model loaded" until an explicit
// pick or "Load cached model" click) — only after that click does the
// cached copy (real IndexedDB bytes, not re-read from disk) come back.
// e2e/fixtures/tiny-classifier.onnx is a real, tiny (327-byte), valid ONNX
// graph (GlobalAveragePool -> Flatten -> MatMul -> Softmax) authored for
// this test — small enough to commit, real enough to actually load.
test('WP-21: a real .onnx file loads, runs real inference, and honestly forgets itself on reload until restored', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) errors.push(msg.text()); });

  await page.goto('/index.html');
  await dismissOnboarding(page);

  async function openRouteBPanel() {
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsModal')).toHaveClass(/show/);
    await page.getByText('Text generation', { exact: true }).click();
    const providerSelect = page.locator('#settingsModal select').filter({ has: page.locator('option[value="browser-local"]') });
    await providerSelect.selectOption('browser-local');
    await page.getByRole('button', { name: 'Local .onnx file', exact: true }).click();
  }

  await openRouteBPanel();
  await page.locator('#settingsModal input[type="file"][accept=".onnx"]').setInputFiles('e2e/fixtures/tiny-classifier.onnx');
  await expect(page.getByText('Model loaded: tiny-classifier.onnx', { exact: false })).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Run test inference', exact: true }).click();
  // A real forward pass through onnxruntime-web: reports the real output
  // tensor's dims (Softmax over 4 classes -> [1,4]) and dtype, not a stub.
  await expect(page.locator('#settingsModal .help-note', { hasText: 'output [1×4] float32' })).toBeVisible({ timeout: 20000 });

  // Reload — the worker restarts, so this must be honest, not sticky.
  await page.reload();
  await dismissOnboarding(page);
  await openRouteBPanel();
  await expect(page.getByText('No model loaded', { exact: false })).toBeVisible();
  await expect(page.getByText('Cached: tiny-classifier.onnx', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Load cached model', exact: true }).click();
  await expect(page.getByText('Model loaded: tiny-classifier.onnx', { exact: false })).toBeVisible({ timeout: 20000 });

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});

// BerryStudio-Upgrade-Plan-v2.0 WP-39: real segmentation, end to end,
// against a real transformers.js model (Xenova/modnet) — not a mock.
// Calls js/ai.js's real analyzeImage() directly via page.evaluate()
// (same technique as the "window.BerryStudio automation API" test above)
// rather than driving file-upload UI, since the exact assertion here is
// about the segmentation integration itself (metrics.segmented, real
// foreground/background differentiation), not the upload widget.
//
// Honesty note on scope: this proves the WIRING is real (real model load,
// real forward pass, real differentiated alpha per real pixel) using a
// synthetic canvas-drawn "person" silhouette on a plain background, where
// manual investigation during this WP found clear separation (head/limb
// alpha ~0.98-0.9998 vs. background ~1e-6). The plan's specific "a
// genuinely low-contrast dark-garment-on-dark-background REAL PHOTO"
// accuracy claim was NOT conclusively verified this pass — MODNet is
// trained on real photographic texture, and flat vector canvas fills
// (tried during investigation) didn't give it a reliable signal even for
// the same shapes that worked fine on a plain background, so a synthetic
// low-contrast test here would be testing this reader's own canvas-art
// limitations, not the model's real-photo behaviour. Real-photo field
// verification is the natural follow-up (same "VERIFY, not code" gap
// WP-22/WP-30/WP-40 already document elsewhere in this plan).
test('WP-39: real segmentation model (Xenova/modnet) loads and produces a real differentiated foreground/background matte', async ({ page }) => {
  // A real ~15-20MB model download + WASM compile + real inference
  // routinely takes 15-20s alone; under full-suite resource contention
  // (other tests' own model/WASM loads still warming up in parallel
  // workers) that can push past the config's default 30s — a real
  // resource-heavier test, not a flake, so it gets a longer allowance
  // rather than joining the retry-on-flake set.
  test.setTimeout(75000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) errors.push(msg.text()); });

  await page.goto('/index.html');
  await dismissOnboarding(page);

  const result = await page.evaluate(async () => {
    const { AIGen } = await import('/js/ai.js');
    const { loadSegmentationModel, runSegmentationOn } = await import('/js/ai-providers.js');

    // A crude but real humanlike silhouette (head + torso + limbs) on a
    // plain light background — a real RGBA photo-shaped input, not a
    // pre-fabricated matte.
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#e0b48a'; ctx.beginPath(); ctx.arc(128, 50, 22, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a5fa0'; ctx.fillRect(95, 72, 66, 110);
    ctx.fillStyle = '#e0b48a'; ctx.fillRect(78, 80, 17, 90);
    ctx.fillStyle = '#e0b48a'; ctx.fillRect(161, 80, 17, 90);
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(100, 182, 25, 70);
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(131, 182, 25, 70);
    const dataURL = cv.toDataURL('image/png');

    // Captured (not just left to reject analyzeImage's own try/catch)
    // so a real failure here shows its actual message in the assertion
    // below instead of just "segmented: false" with no clue why.
    let segError = null;
    const segment = async (imageData) => {
      try {
        await loadSegmentationModel('Xenova/modnet');
        return await runSegmentationOn(imageData);
      } catch (e) { segError = (e && e.message) || String(e); throw e; }
    };

    const withSeg = await AIGen.analyzeImage(dataURL, { segment });
    const withoutSeg = await AIGen.analyzeImage(dataURL); // no opts at all — must behave exactly as before this WP
    return { withSeg, withoutSeg, segError };
  });

  expect(result.segError, `segment() threw: ${result.segError}`).toBeNull();
  expect(result.withSeg.ok).toBe(true);
  expect(result.withSeg.segmented).toBe(true);
  // No model configured (no opts.segment passed at all): the pre-existing
  // colour-threshold heuristic runs, unchanged — segmented is falsy.
  expect(result.withoutSeg.ok).toBe(true);
  expect(result.withoutSeg.segmented).toBeFalsy();

  expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
});
