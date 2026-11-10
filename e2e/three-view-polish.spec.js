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

async function open3DReady(page) {
  await page.locator('#viewToggle button[data-v="3d"]').click();
  await page.waitForFunction(() => window.View3D?.isReady?.() === true, null, { timeout: 20000 });
}

test('3D Studio UI: non-clipping toolbar at 1280px in EN/AR, camera presets, and live status pill', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.setViewportSize({ width: 1280, height: 800 });
  await bootApp(page, testInfo);
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

test('3D Responsiveness: unified color, fabric persistence, XS-to-XXXXL grading, and units toggle', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.setViewportSize({ width: 1440, height: 900 });
  await bootApp(page, testInfo);
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

test('3D Category & Split View Sync: header categories update mannequin and Split View opens side-by-side', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.setViewportSize({ width: 1440, height: 900 });
  await bootApp(page, testInfo);
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

test('3D Boot & Retry Resilience: booting with view="3d" while Three.js is still loading never triggers false fatal error or poisons #canvas3d', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  const threeRoot = resolveThreeRoot(testInfo);
  // Simulate realistic 350ms CDN latency (>200ms boot setView timer) on initial three.module.js load
  await page.route('https://unpkg.com/three@*/**', async (route) => {
    const url = new URL(route.request().url());
    const rel = url.pathname.replace(/^\/three@[^/]+\//, '');
    const filePath = path.resolve(threeRoot, rel);
    if (rel.endsWith('three.module.js')) {
      await new Promise((r) => setTimeout(r, 350));
    }
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

  await page.addInitScript(() => {
    localStorage.setItem('pps', JSON.stringify({ onboarded: true, view: '3d' }));
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html');

  // Wait for 3D view to become ready after the delayed CDN load
  await page.waitForFunction(() => window.View3D?.isReady?.() === true, null, { timeout: 20000 });

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

test('3D Human Motion & Zero-Overlap Guarantee: grounded stride, welded seams, bone-tracked trims, and zero limb poke-through', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.setViewportSize({ width: 1280, height: 800 });
  await bootApp(page, testInfo);
  await open3DReady(page);

  // 1. Women Fit & Flare Midi Dress + Accessories across walking stride phases
  const dressReport = await page.evaluate(() => {
    window.View3D.setSpin(false);
    window.View3D.setWalk(true);
    window.View3D.setAccessories({
      buttons: { enabled: true, style: 'gold', placement: 'front_placket', count: 5 },
      belt: { enabled: true, style: 'leather_gold', width: 'medium' },
    });

    const refs = window.View3D.getSceneDebugRefs();
    const bodyMesh = refs.activeMannequin.bodyMesh;
    const vTmp = bodyMesh.position.clone();
    const vTmpB = bodyMesh.position.clone();

    const samplePosedVerts = (mesh) => {
      const out = [];
      const count = mesh.geometry.attributes.position.count;
      for (let i = 0; i < count; i++) {
        mesh.getVertexPosition(i, vTmp);
        vTmp.applyMatrix4(mesh.matrixWorld);
        out.push([vTmp.x, vTmp.y, vTmp.z]);
      }
      return out;
    };

    let maxSkirtSeamGap = 0;
    let maxLegPokeOverSkirt = 0;
    let minArmClearanceOutsideSkirt = Infinity;
    const minFootYs = [];
    const beltCenters = [];
    const buttonCenters = [];

    for (const tSec of [0.26, 0.53, 1.06, 1.59]) {
      window.View3D.stepMotion(tSec, 1.0);
      refs.root.updateMatrixWorld(true);

      // Track dynamic belt & button world positions across opposite stride phases
      refs.garmentGroup.traverse((o) => {
        if (o.name === 'accessories' && o.visible) {
          o.children.forEach((acc) => {
            if (acc.userData.parentPart === 'waist') {
              (acc.children[1] || acc).getWorldPosition(vTmpB);
              beltCenters.push([vTmpB.x, vTmpB.y, vTmpB.z]);
            } else if (acc.userData.parentPart === 'bodice') {
              acc.getWorldPosition(vTmpB);
              buttonCenters.push([vTmpB.x, vTmpB.y, vTmpB.z]);
            }
          });
        }
      });

      // Collect front/back skirt meshes & verify welded side seams
      let skFront = null;
      let skBack = null;
      refs.garmentGroup.traverse((o) => {
        if (o.isMesh && o.name === 'skirt' && o.visible) {
          if (o.userData.side === 'front') skFront = o;
          if (o.userData.side === 'back') skBack = o;
        }
      });

      const fVerts = samplePosedVerts(skFront);
      const bVerts = samplePosedVerts(skBack);
      const gm = skFront.geometry.userData.gridMeta;
      for (let r = 0; r < gm.rows; r++) {
        // Front k=0 (-PI/2) welds to Back k=cols-1 (+3PI/2); Front k=cols-1 (+PI/2) welds to Back k=0 (+PI/2)
        const fL = fVerts[r * gm.cols + (gm.cols - 1)];
        const bL = bVerts[r * gm.cols + 0];
        const fR = fVerts[r * gm.cols + 0];
        const bR = bVerts[r * gm.cols + (gm.cols - 1)];
        const gapL = Math.hypot(fL[0] - bL[0], fL[1] - bL[1], fL[2] - bL[2]);
        const gapR = Math.hypot(fR[0] - bR[0], fR[1] - bR[1], fR[2] - bR[2]);
        maxSkirtSeamGap = Math.max(maxSkirtSeamGap, gapL, gapR);
      }

      const skirtVerts = fVerts.concat(bVerts);
      let skMinY = Infinity;
      let skMaxY = -Infinity;
      for (const sv of skirtVerts) {
        if (sv[1] < skMinY) skMinY = sv[1];
        if (sv[1] > skMaxY) skMaxY = sv[1];
      }

      // Inspect posed body vertices for plantar grounding, leg containment, and arm clearance
      const bPosCount = bodyMesh.geometry.attributes.position.count;
      const bSkinIdx = bodyMesh.geometry.attributes.skinIndex;
      const bSkinWgt = bodyMesh.geometry.attributes.skinWeight;
      let minY = Infinity;

      for (let i = 0; i < bPosCount; i++) {
        bodyMesh.getVertexPosition(i, vTmp);
        vTmp.applyMatrix4(bodyMesh.matrixWorld);
        if (vTmp.y < minY) minY = vTmp.y;

        // Determine dominant bone index on this vertex
        let domBone = bSkinIdx.getX(i);
        let domW = bSkinWgt.getX(i);
        if (bSkinWgt.getY(i) > domW) { domW = bSkinWgt.getY(i); domBone = bSkinIdx.getY(i); }
        if (bSkinWgt.getZ(i) > domW) { domW = bSkinWgt.getZ(i); domBone = bSkinIdx.getZ(i); }
        if (bSkinWgt.getW(i) > domW) { domW = bSkinWgt.getW(i); domBone = bSkinIdx.getW(i); }

        const isLeg = domBone === 11 || domBone === 12 || domBone === 14 || domBone === 15;
        const isForearmOrHand = domBone === 6 || domBone === 7 || domBone === 9 || domBone === 10;

        if (isLeg && vTmp.y > skMinY + 0.07 && vTmp.y < skMaxY - 0.04) {
          const bR = Math.hypot(vTmp.x, vTmp.z);
          const bAng = Math.atan2(vTmp.x, vTmp.z);
          let maxLocalSkirtR = 0;
          for (let s = 0; s < skirtVerts.length; s++) {
            const sv = skirtVerts[s];
            if (Math.abs(sv[1] - vTmp.y) > 0.045) continue;
            let dAng = Math.abs(Math.atan2(sv[0], sv[2]) - bAng);
            if (dAng > Math.PI) dAng = 2 * Math.PI - dAng;
            if (dAng < 0.28) {
              const sR = Math.hypot(sv[0], sv[2]);
              if (sR > maxLocalSkirtR) maxLocalSkirtR = sR;
            }
          }
          if (maxLocalSkirtR > 0) {
            maxLegPokeOverSkirt = Math.max(maxLegPokeOverSkirt, bR - maxLocalSkirtR);
          }
        }

        if (isForearmOrHand && vTmp.y > skMinY + 0.02 && vTmp.y < skMaxY - 0.02) {
          const armR = Math.hypot(vTmp.x, vTmp.z);
          const armAng = Math.atan2(vTmp.x, vTmp.z);
          let maxLocalSkirtR = 0;
          for (let s = 0; s < skirtVerts.length; s++) {
            const sv = skirtVerts[s];
            if (Math.abs(sv[1] - vTmp.y) > 0.045) continue;
            let dAng = Math.abs(Math.atan2(sv[0], sv[2]) - armAng);
            if (dAng > Math.PI) dAng = 2 * Math.PI - dAng;
            if (dAng < 0.26) {
              const sR = Math.hypot(sv[0], sv[2]);
              if (sR > maxLocalSkirtR) maxLocalSkirtR = sR;
            }
          }
          if (maxLocalSkirtR > 0) {
            minArmClearanceOutsideSkirt = Math.min(minArmClearanceOutsideSkirt, armR - maxLocalSkirtR);
          }
        }
      }
      minFootYs.push(minY);
    }

    // Compute accessory motion range across opposite stride phases (t=0.53 vs t=1.59)
    let beltShift = 0;
    if (beltCenters.length >= 4) {
      const a = beltCenters[1];
      const b = beltCenters[3];
      beltShift = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
    let buttonShift = 0;
    if (buttonCenters.length >= 20) {
      const a = buttonCenters[5];
      const b = buttonCenters[15];
      buttonShift = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }

    return {
      maxSkirtSeamGap,
      maxLegPokeOverSkirt,
      minArmClearanceOutsideSkirt,
      minFootYs,
      beltShift,
      buttonShift,
    };
  });

  expect(dressReport.maxSkirtSeamGap).toBeLessThan(0.002);
  expect(dressReport.maxLegPokeOverSkirt).toBeLessThanOrEqual(0.004);
  expect(dressReport.minArmClearanceOutsideSkirt).toBeGreaterThan(0.004);
  expect(dressReport.beltShift).toBeGreaterThan(0.001);
  expect(dressReport.buttonShift).toBeGreaterThan(0.001);
  for (const fy of dressReport.minFootYs) {
    expect(fy).toBeGreaterThanOrEqual(-0.015);
    expect(fy).toBeLessThanOrEqual(0.018);
  }

  // 2. Men Shirt + Sleeves + Tailored Trousers walking stride containment check
  await page.locator('#catSeg button[data-cat="men"]').click();
  await expect(page.locator('#v3dModelSelect')).toHaveValue('men');

  const menTrouserReport = await page.evaluate(() => {
    window.View3D.setPieceVisibility([
      { part: 'bodice', key: 'shirt_front', visible: true },
      { part: 'sleeve', key: 'shirt_sleeve', visible: true },
      { part: 'trousers', key: 'pant_front', visible: true },
    ]);
    window.View3D.setSpin(false);
    window.View3D.setWalk(true);

    const refs = window.View3D.getSceneDebugRefs();
    const bodyMesh = refs.activeMannequin.bodyMesh;
    const bones = refs.activeMannequin.skeleton.bones;
    const vTmp = bodyMesh.position.clone();
    const vBoneA = bodyMesh.position.clone();
    const vBoneB = bodyMesh.position.clone();

    let maxLegPokeOverTrousers = 0;
    const minFootYs = [];

    for (const tSec of [0.0, 0.53, 1.06, 1.59]) {
      window.View3D.stepMotion(tSec, 1.0);
      refs.root.updateMatrixWorld(true);

      // World-space bone segment endpoints: L thigh (11->12), L calf (12->13), R thigh (14->15), R calf (15->16)
      const getBonePt = (idx) => {
        bones[idx].getWorldPosition(vBoneA);
        return [vBoneA.x, vBoneA.y, vBoneA.z];
      };
      const segs = {
        11: [getBonePt(11), getBonePt(12)],
        12: [getBonePt(12), getBonePt(13)],
        14: [getBonePt(14), getBonePt(15)],
        15: [getBonePt(15), getBonePt(16)],
      };

      const projectOntoSeg = (px, py, pz, seg) => {
        const [a, b] = seg;
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const lenSq = dx * dx + dy * dy + dz * dz || 1;
        const len = Math.sqrt(lenSq);
        const ux = dx / len, uy = dy / len, uz = dz / len;
        const s = (px - a[0]) * ux + (py - a[1]) * uy + (pz - a[2]) * uz;
        const u = s / len;
        // Orthogonal basis (e1 = world X projected orthogonal to u, e2 = u x e1)
        let e1x = 1 - ux * ux, e1y = -ux * uy, e1z = -ux * uz;
        const e1Len = Math.hypot(e1x, e1y, e1z) || 1;
        e1x /= e1Len; e1y /= e1Len; e1z /= e1Len;
        const e2x = uy * e1z - uz * e1y;
        const e2y = uz * e1x - ux * e1z;
        const e2z = ux * e1y - uy * e1x;
        const rx = px - (a[0] + ux * s);
        const ry = py - (a[1] + uy * s);
        const rz = pz - (a[2] + uz * s);
        const c1 = rx * e1x + ry * e1y + rz * e1z;
        const c2 = rx * e2x + ry * e2y + rz * e2z;
        return { u, r: Math.hypot(c1, c2), ang: Math.atan2(c1, c2) };
      };

      const trouserVerts = [];
      refs.garmentGroup.traverse((o) => {
        if (o.isMesh && o.name === 'trousers' && o.visible) {
          const count = o.geometry.attributes.position.count;
          for (let i = 0; i < count; i++) {
            o.getVertexPosition(i, vTmp);
            vTmp.applyMatrix4(o.matrixWorld);
            trouserVerts.push([vTmp.x, vTmp.y, vTmp.z]);
          }
        }
      });

      const bPosCount = bodyMesh.geometry.attributes.position.count;
      const bSkinIdx = bodyMesh.geometry.attributes.skinIndex;
      const bSkinWgt = bodyMesh.geometry.attributes.skinWeight;
      let minY = Infinity;

      for (let i = 0; i < bPosCount; i += 2) {
        bodyMesh.getVertexPosition(i, vTmp);
        vTmp.applyMatrix4(bodyMesh.matrixWorld);
        if (vTmp.y < minY) minY = vTmp.y;

        let domBone = bSkinIdx.getX(i);
        let domW = bSkinWgt.getX(i);
        if (bSkinWgt.getY(i) > domW) { domW = bSkinWgt.getY(i); domBone = bSkinIdx.getY(i); }
        if (bSkinWgt.getZ(i) > domW) { domW = bSkinWgt.getZ(i); domBone = bSkinIdx.getZ(i); }
        if (bSkinWgt.getW(i) > domW) { domW = bSkinWgt.getW(i); domBone = bSkinIdx.getW(i); }

        const seg = segs[domBone];
        if (!seg) continue;
        const bp = projectOntoSeg(vTmp.x, vTmp.y, vTmp.z, seg);
        // Check mid-thigh (0.28..0.85) and calf (0.12..0.82) away from groin saddle & ankle hem
        const uMin = (domBone === 11 || domBone === 14) ? 0.30 : 0.14;
        const uMax = (domBone === 11 || domBone === 14) ? 0.86 : 0.80;
        if (bp.u < uMin || bp.u > uMax) continue;

        const legSide = (domBone === 11 || domBone === 12) ? 1 : -1;
        let maxLocalTrouserR = 0;
        for (let s = 0; s < trouserVerts.length; s++) {
          const tv = trouserVerts[s];
          if (tv[0] * legSide < -0.02) continue;
          const tp = projectOntoSeg(tv[0], tv[1], tv[2], seg);
          if (Math.abs(tp.u - bp.u) > 0.11) continue;
          let dAng = Math.abs(tp.ang - bp.ang);
          if (dAng > Math.PI) dAng = 2 * Math.PI - dAng;
          if (dAng < 0.42 && tp.r > maxLocalTrouserR) {
            maxLocalTrouserR = tp.r;
          }
        }
        if (maxLocalTrouserR > 0) {
          maxLegPokeOverTrousers = Math.max(maxLegPokeOverTrousers, bp.r - maxLocalTrouserR);
        }
      }
      minFootYs.push(minY);
    }

    return { maxLegPokeOverTrousers, minFootYs, vBoneB: vBoneB.y };
  });

  expect(menTrouserReport.maxLegPokeOverTrousers).toBeLessThanOrEqual(0.005);
  for (const fy of menTrouserReport.minFootYs) {
    expect(fy).toBeGreaterThanOrEqual(-0.015);
    expect(fy).toBeLessThanOrEqual(0.018);
  }

  expect(errors).toEqual([]);
});

