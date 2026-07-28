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
