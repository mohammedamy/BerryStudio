import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

test.setTimeout(60_000);

function resolveThreeRoot(testInfo) {
  const candidates = [
    testInfo?.file ? path.resolve(path.dirname(testInfo.file), '../cloth-lab/node_modules/three') : null,
    path.resolve(process.cwd(), 'cloth-lab/node_modules/three'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

async function attachLocalThreeFallback(page, testInfo) {
  const threeRoot = resolveThreeRoot(testInfo);
  if (!threeRoot || !fs.existsSync(threeRoot)) return;
  await page.route('https://unpkg.com/three@*/**', async (route) => {
    const url = new URL(route.request().url());
    const rel = url.pathname.replace(/^\/three@[^/]+\//, '');
    const filePath = path.resolve(threeRoot, rel);
    if (filePath.startsWith(threeRoot) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: fs.readFileSync(filePath),
      });
      return;
    }
    await route.continue();
  });
}

async function bootApp(page, testInfo) {
  await attachLocalThreeFallback(page, testInfo);
  await page.addInitScript(() => {
    try {
      const existing = JSON.parse(localStorage.getItem('pps') || '{}');
      localStorage.setItem('pps', JSON.stringify({ ...existing, onboarded: true }));
    } catch {
      localStorage.setItem('pps', JSON.stringify({ onboarded: true }));
    }
  });
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate(() => window.Canvas?.getPieces?.().length ?? 0), { timeout: 20000 }).toBeGreaterThan(0);
}

test('3D Preview Hair Customization & Women Hijabs / Men Ghutra-Shemagh-Hats + Persistence & RTL', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.setViewportSize({ width: 1280, height: 800 });
  await bootApp(page, testInfo);
  await page.locator('#viewToggle button[data-v="3d"]').click();
  await page.waitForFunction(() => window.View3D?.isReady?.() === true, null, { timeout: 20000 });

  // Open floating mannequin drawer & switch to "Hair & Headwear" tab
  await page.locator('#v3dMannequinCatalogBtn').click();
  await expect(page.locator('#v3dMannequinPanel')).toBeVisible();
  await page.locator('#v3dMannequinModeBar [data-mq-mode="styling"]').click();
  await expect(page.locator('#v3dMannequinStylingView')).toBeVisible();

  // Customize Women's haircut, hair texture, color, and hijab style + hijab color
  await page.locator('#v3dHaircutSelect').selectOption('long_wavy');
  await page.locator('#v3dMannequinStylingView [data-hair-type="curly"]').click();
  await page.locator('#v3dMannequinStylingView [data-hair-color="#b88b4a"]').click();

  // Verify women's hijabs are present and men's headwear is not mixed in
  await expect(page.locator('#v3dMannequinStylingView [data-headwear-id="hijab_turkish"]')).toBeVisible();
  await expect(page.locator('#v3dMannequinStylingView [data-headwear-id="hijab_niqab"]')).toBeVisible();
  await expect(page.locator('#v3dMannequinStylingView [data-headwear-id="ghutra_iqal"]')).toHaveCount(0);

  await page.locator('#v3dMannequinStylingView [data-headwear-id="hijab_turkish"]').click();
  await page.locator('#v3dMannequinStylingView [data-headwear-color="#1f513f"]').click();

  // Switch mannequin category to Men and test Shemagh & Iqal + Fedora
  await page.locator('#v3dModelSelect').selectOption('men');
  await expect(page.locator('#v3dMannequinStylingView [data-headwear-id="ghutra_iqal"]')).toBeVisible();
  await expect(page.locator('#v3dMannequinStylingView [data-headwear-id="shemagh_iqal"]')).toBeVisible();
  await expect(page.locator('#v3dMannequinStylingView [data-headwear-id="shawl_wrap"]')).toBeVisible();
  await expect(page.locator('#v3dMannequinStylingView [data-headwear-id="fedora"]')).toBeVisible();
  await expect(page.locator('#v3dMannequinStylingView [data-headwear-id="hijab_turkish"]')).toHaveCount(0);

  await page.locator('#v3dMannequinStylingView [data-headwear-id="shemagh_iqal"]').click();

  // Verify localStorage saved both categories cleanly
  const savedStyling = await page.evaluate(() => JSON.parse(localStorage.getItem('pps') || '{}').mannequinStyling);
  expect(savedStyling.women.hairStyle).toBe('long_wavy');
  expect(savedStyling.women.hairType).toBe('curly');
  expect(savedStyling.women.hairColor).toBe('#b88b4a');
  expect(savedStyling.women.headwear).toBe('hijab_turkish');
  expect(savedStyling.women.headwearColor).toBe('#1f513f');
  expect(savedStyling.men.headwear).toBe('shemagh_iqal');

  // Switch back to Women and reload page to verify persistence across reload
  await page.locator('#v3dModelSelect').selectOption('women');
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.Canvas?.getPieces?.().length ?? 0), { timeout: 20000 }).toBeGreaterThan(0);
  await page.locator('#viewToggle button[data-v="3d"]').click();
  await page.waitForFunction(() => window.View3D?.isReady?.() === true, null, { timeout: 20000 });
  await page.locator('#v3dMannequinCatalogBtn').click();
  await page.locator('#v3dMannequinModeBar [data-mq-mode="styling"]').click();

  await expect(page.locator('#v3dHaircutSelect')).toHaveValue('long_wavy');
  await expect(page.locator('#v3dMannequinStylingView [data-headwear-id="hijab_turkish"]')).toHaveClass(/active/);

  // Toolbar stays non-overflowing at 1280px in both EN and AR
  const enToolbar = await page.locator('.v3d-toolbar').evaluate((bar) => ({
    sw: bar.scrollWidth,
    cw: bar.clientWidth,
  }));
  expect(enToolbar.sw).toBeLessThanOrEqual(enToolbar.cw + 2);

  await page.locator('#langBtn').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const arToolbar = await page.locator('.v3d-toolbar').evaluate((bar) => ({
    sw: bar.scrollWidth,
    cw: bar.clientWidth,
  }));
  expect(arToolbar.sw).toBeLessThanOrEqual(arToolbar.cw + 2);

  // Reset preset button clears customization for active category
  await page.locator('#v3dStylingResetBtn').click();
  const afterReset = await page.evaluate(() => JSON.parse(localStorage.getItem('pps') || '{}').mannequinStyling);
  expect(afterReset.women).toBeUndefined();

  expect(errors).toEqual([]);
});
