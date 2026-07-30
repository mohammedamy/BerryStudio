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
// wires correctly end-to-end against a real loaded pattern, for all five
// verbs, not stubbed/mocked results.
test('window.BerryStudio automation API: all five verbs return real (not stubbed) results', async ({ page }) => {
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

  // export() — the default-loaded pattern's real SVG.
  const svg = await page.evaluate(() => window.BerryStudio.export('svg'));
  expect(svg).toContain('<svg');

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

  // generate() — the real local (offline) silhouette+prompt pipeline, no endpoint configured.
  const generated = await page.evaluate(() =>
    window.BerryStudio.generate({ prompt: 'a fitted knee-length dress', category: 'women', measurements: { chest: 88, waist: 70, hips: 96, backLen: 41, sleeve: 58, bicep: 28, height: 167 } })
  );
  expect(generated.pieces.length).toBeGreaterThan(0);
  expect(generated.source).toBe('local');

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
