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

async function bootInMeasuresPane(page, testInfo) {
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
  await expect(page.locator('.project-tab')).toHaveCount(1);
  await page.locator('#railTabs button[data-pane="measure"]').click();
}

test('3D interactive measurement teaching studio renders live mannequin, auto-focuses shoulder/back, steps lessons, expands modal & switches to AR RTL', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.setViewportSize({ width: 1280, height: 860 });
  await bootInMeasuresPane(page, testInfo);

  // Open the interactive 3D Measurement Teaching Studio
  await page.getByRole('button', { name: 'Where these measurements are taken' }).click();
  const diag = page.locator('.meas-diagram');
  await expect(diag).toHaveClass(/show/);

  // 3D canvas & 11 numbered callout pins must mount cleanly
  const canvas = diag.locator('.mg3d-canvas');
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThan(180);
  await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThan(200);
  await expect(diag.locator('.mg3d-pin')).toHaveCount(11);

  // Overview prompt is shown before picking a measurement
  await expect(diag.locator('.mg3d-card')).toContainText('Interactive 3D Measuring Guide');

  // Pin measurement 4 (Shoulder Width) -> card updates with anatomical landmarks, 3 steps, tension rule & avoid warning
  await diag.locator('.mg3d-pin[data-meas="shoulder"]').click();
  await expect(diag).toHaveAttribute('data-active', 'shoulder');
  await expect(diag.locator('.mg3d-card')).toContainText('Shoulder Width');
  await expect(diag.locator('.mg3d-card .mg3d-steps-list li')).toHaveCount(3);
  await expect(diag.locator('.mg3d-card .mg3d-tip-box.is-ease')).toContainText('C7');
  await expect(diag.locator('.mg3d-card .mg3d-tip-box.is-avoid')).toContainText('acromion');
  await expect(diag.locator('.mg3d-landmark-tag')).toHaveCount(3);

  // Next -> Back Waist Length (5), Prev -> Shoulder Width (4)
  await diag.locator('[data-guide-act="next"]').click();
  await expect(diag).toHaveAttribute('data-active', 'backLen');
  await expect(diag.locator('.mg3d-card')).toContainText('Back Waist Length');
  await diag.locator('[data-guide-act="prev"]').click();
  await expect(diag).toHaveAttribute('data-active', 'shoulder');

  // 2D fallback toggle shows SVG cleanly and switching back restores 3D studio
  await diag.locator('[data-mode="2d"]').click();
  await expect(diag.locator('.mg2d-stage')).toBeVisible();
  await expect(diag.locator('.mg3d-stage')).toBeHidden();
  await diag.locator('[data-mode="3d"]').click();
  await expect(diag.locator('.mg3d-stage')).toBeVisible();

  // Expand to full-screen 3D Studio Modal
  await diag.locator('[data-expand="1"]').click();
  const modal = page.locator('.mg3d-modal-backdrop');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.mg3d-canvas')).toBeVisible({ timeout: 20_000 });
  await modal.locator('.mg3d-pick-btn[data-meas="inseam"]').click();
  await expect(modal.locator('.mg3d-card')).toContainText('Inseam');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  // Switch UI to Arabic RTL -> Arabic teaching cards & labels appear cleanly
  await page.locator('#langBtn').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const arDiag = page.locator('.meas-diagram');
  await expect(arDiag.locator('.mg3d-canvas')).toBeVisible({ timeout: 20_000 });
  await arDiag.locator('.meas-legend-item[data-meas="chest"]').click();
  await expect(arDiag.locator('.mg3d-card')).toContainText('محيط الصدر');
  await expect(arDiag.locator('.mg3d-card .mg3d-steps-list li')).toHaveCount(3);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join('\n')}`).toEqual([]);
});
