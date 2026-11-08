import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

test.setTimeout(60_000);

const THREE_ROOT = path.resolve(process.cwd(), 'cloth-lab/node_modules/three');

async function attachLocalThreeFallback(page) {
  if (!fs.existsSync(THREE_ROOT)) return;
  await page.route('https://unpkg.com/three@*/**', async (route) => {
    const url = new URL(route.request().url());
    const rel = url.pathname.replace(/^\/three@[^/]+\//, '');
    const filePath = path.resolve(THREE_ROOT, rel);
    if (filePath.startsWith(THREE_ROOT) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
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

async function bootApp(page) {
  await attachLocalThreeFallback(page);
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

async function open3DReady(page) {
  await page.locator('#viewToggle button[data-v="3d"]').click();
  await expect.poll(() => page.evaluate(() => window.View3D?.isReady?.() ?? false), { timeout: 15000 }).toBe(true);
}

test('3D Studio UI: non-clipping toolbar at 1280px in EN/AR, camera presets, and live status pill', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.setViewportSize({ width: 1280, height: 800 });
  await bootApp(page);
  await open3DReady(page);

  await expect(page.locator('#v3dStatusPill')).toBeVisible();
  await expect(page.locator('#v3dStatusPattern')).toContainText('Fit & Flare Midi Dress');
  await expect(page.locator('#v3dStatusSize')).toContainText('Women · M');
  await expect(page.locator('#v3dStatusMeas')).toContainText('cm');

  // Verify toolbar fits completely inside 1280px desktop viewport with zero horizontal clipping
  const overflowEn = await page.locator('.v3d-toolbar').evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(overflowEn.scrollWidth).toBeLessThanOrEqual(overflowEn.clientWidth + 2);

  // Switch to Arabic and verify RTL toolbar also has zero horizontal clipping and translated HUD
  await page.locator('#langBtn').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  const overflowAr = await page.locator('.v3d-toolbar').evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(overflowAr.scrollWidth).toBeLessThanOrEqual(overflowAr.clientWidth + 2);

  // Switch back to English
  await page.locator('#langBtn').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // Camera preset bar pauses 360 spin and updates active angle button
  const spinToggle = page.locator('#spinToggle');
  await expect(spinToggle).toBeChecked();
  const sideBtn = page.locator('#v3dCamBar [data-cam-preset="side"]');
  await sideBtn.click();
  await expect(sideBtn).toHaveClass(/active/);
  await expect(spinToggle).not.toBeChecked();

  const faceBtn = page.locator('#v3dCamBar [data-cam-preset="face"]');
  await faceBtn.click();
  await expect(faceBtn).toHaveClass(/active/);

  expect(errors).toEqual([]);
});

test('3D Responsiveness: unified color, fabric persistence, XS-to-XXXXL grading, and units toggle', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.setViewportSize({ width: 1440, height: 900 });
  await bootApp(page);
  await open3DReady(page);

  // 1. Unified color & fabric preset apply across all garment parts and persist to localStorage
  await page.locator('#v3dColorPicker').evaluate((inp) => {
    inp.value = '#b91c1c';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#v3dFabricSelect').selectOption('satin');

  const matStateBefore = await page.evaluate(() => ({
    bodiceColor: window.View3D.getGarmentColor('bodice'),
    sleeveColor: window.View3D.getGarmentColor('sleeve'),
    skirtColor: window.View3D.getGarmentColor('skirt'),
    fabric: window.View3D.getFabricPreset(),
    savedFabric: JSON.parse(localStorage.getItem('pps') || '{}').fabric3d,
  }));
  expect(matStateBefore.bodiceColor).toBe('#b91c1c');
  expect(matStateBefore.sleeveColor).toBe('#b91c1c');
  expect(matStateBefore.skirtColor).toBe('#b91c1c');
  expect(matStateBefore.fabric).toBe('satin');
  expect(matStateBefore.savedFabric).toBe('satin');

  // 2. Grade from M -> XS -> XXXXL while in 3D view: measurements update AND color/fabric stay intact
  const measM = await page.locator('#v3dStatusMeas').textContent();
  await page.getByRole('button', { name: 'XS', exact: true }).click();
  await expect(page.locator('#v3dStatusSize')).toContainText('XS');
  const measXS = await page.locator('#v3dStatusMeas').textContent();
  expect(measXS).not.toBe(measM);

  await page.getByRole('button', { name: 'XXXXL', exact: true }).click();
  await expect(page.locator('#v3dStatusSize')).toContainText('XXXXL');
  const meas4XL = await page.locator('#v3dStatusMeas').textContent();
  expect(meas4XL).not.toBe(measXS);

  const matStateAfterGrade = await page.evaluate(() => ({
    bodiceColor: window.View3D.getGarmentColor('bodice'),
    skirtColor: window.View3D.getGarmentColor('skirt'),
    fabric: window.View3D.getFabricPreset(),
  }));
  expect(matStateAfterGrade.bodiceColor).toBe('#b91c1c');
  expect(matStateAfterGrade.skirtColor).toBe('#b91c1c');
  expect(matStateAfterGrade.fabric).toBe('satin');

  // 3. Units toggle updates 3D status pill live between cm and in
  await page.locator('#unitsPill').click();
  await expect(page.locator('#v3dStatusMeas')).toContainText('in');
  await page.locator('#unitsPill').click();
  await expect(page.locator('#v3dStatusMeas')).toContainText('cm');

  expect(errors).toEqual([]);
});

test('3D Category & Split View Sync: header categories update mannequin and Split View opens side-by-side', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.setViewportSize({ width: 1440, height: 900 });
  await bootApp(page);
  await open3DReady(page);

  for (const [cat, label] of [['men', 'Men'], ['girls', 'Girls'], ['boys', 'Boys']]) {
    await page.locator(`#catSeg button[data-cat="${cat}"]`).click();
    await expect(page.locator('#v3dModelSelect')).toHaveValue(cat);
    await expect(page.locator('#v3dStatusSize')).toContainText(label);
  }

  await page.locator('#splitViewBtn').click();
  await expect(page.locator('.canvas-wrap')).toHaveClass(/split/);
  await expect(page.locator('#view3d')).toHaveClass(/show/);

  expect(errors).toEqual([]);
});

test('3D Boot & Retry Resilience: booting with view="3d" while Three.js is still loading never triggers false fatal error or poisons #canvas3d', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  // Simulate realistic 350ms CDN latency (>200ms boot setView timer) on initial three.module.js load
  await page.route('https://unpkg.com/three@*/**', async (route) => {
    const url = new URL(route.request().url());
    const rel = url.pathname.replace(/^\/three@[^/]+\//, '');
    const filePath = path.resolve(THREE_ROOT, rel);
    if (rel.endsWith('three.module.js')) {
      await new Promise((r) => setTimeout(r, 350));
    }
    if (filePath.startsWith(THREE_ROOT) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: fs.readFileSync(filePath),
      });
      return;
    }
    await route.continue();
  });

  await page.addInitScript(() => {
    localStorage.setItem('pps', JSON.stringify({ onboarded: true, view: '3d' }));
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html');

  // Wait for 3D view to become ready after the delayed CDN load
  await expect.poll(() => page.evaluate(() => window.View3D?.isReady?.() ?? false), { timeout: 15000 }).toBe(true);

  // Fatal error overlay must NOT be shown, and #canvas3d must have a valid WebGL context and non-zero raster size
  await expect(page.locator('#v3dError')).not.toHaveClass(/show/);
  const canvasState = await page.evaluate(() => {
    const c = document.getElementById('canvas3d');
    return { w: c.width, h: c.height, ready: window.View3D.isReady() };
  });
  expect(canvasState.ready).toBe(true);
  expect(canvasState.w).toBeGreaterThan(0);
  expect(canvasState.h).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

