import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../cloth-lab/node_modules/three/build/three.module.js';

import {
  GARMENT_PART_TYPES,
  segmentForegroundMask,
  extractConnectedComponents,
  traceComponentContour,
  fitCubicBeziersToPolygon,
  extractGarmentPartPattern,
  digitizeFlatPatternSheet,
} from '../js/photo-digitizer.js';
import {
  FASHION_POSES,
  createHumanSkinMaterial,
  buildHumanMannequin,
  applyMannequinPose,
  applyNaturalHumanMotion,
} from '../js/human-mannequin.js';
import { isBackPieceName, classifyPiecePart } from '../js/pattern-3d-metrics.js';
import { buildNestedMarkerSVG, buildTechPackHTML } from '../js/pattern-export.js';
import { gradePiecesAnatomically } from '../js/grading.js';
import { PatternValidator } from '../js/validate.js';
import { offsetPoly } from '../js/geometry.js';

function makeSyntheticImage(W, H, drawFn) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const [r, g, b] = drawFn(x, y, W, H);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

test('Phase 2: PhotoDigitizer extracts Collar, Sleeve, Pocket & Bodice parts with 1:1 scale & grading', () => {
  assert.ok(GARMENT_PART_TYPES.includes('collar'));
  assert.ok(GARMENT_PART_TYPES.includes('sleeve'));
  assert.ok(GARMENT_PART_TYPES.includes('pocket'));

  // Synthetic wide shirt-collar silhouette on white background
  const collarImg = makeSyntheticImage(160, 120, (x, y) => {
    const inside = x >= 20 && x <= 140 && y >= 42 && y <= 68;
    return inside ? [34, 62, 112] : [248, 248, 248];
  });
  const seg = segmentForegroundMask(collarImg);
  const comps = extractConnectedComponents(seg.mask, 160, 120);
  assert.equal(comps.length, 1);

  const mM = { chest: 92, waist: 74, hips: 98, neck: 38, bicep: 30, sleeve: 58, backLen: 40, shoulder: 40, inseam: 76 };
  const mXL = { chest: 104, waist: 86, hips: 110, neck: 42, bicep: 34, sleeve: 61, backLen: 42.5, shoulder: 43, inseam: 78 };

  for (const partType of ['collar', 'sleeve', 'pocket', 'bodice', 'trousers', 'cuff', 'hood', 'skirt']) {
    const res = extractGarmentPartPattern({
      imageData: collarImg,
      partType,
      category: 'women',
      measurements: mM,
      seamAllowanceCm: 1.0,
      lang: 'en',
    });
    assert.equal(res.ok, true, `${partType} extraction succeeds`);
    assert.ok(res.pieces.length >= 1, `${partType} yields >= 1 piece`);
    const qa = PatternValidator.run(res.pieces, { bodyChestCm: mM.chest, seamAllowanceCm: 1.0, offsetPoly });
    assert.equal(qa.summary.fail, 0, `${partType} passes PatternValidator cleanly`);

    // Extracted piece must grade smoothly from M -> XL
    const graded = gradePiecesAnatomically(res.pieces, mM, mXL, null, 2);
    assert.equal(graded.length, res.pieces.length);
  }
});

test('Phase 2: digitizeFlatPatternSheet traces multiple sheet pieces with cubic Bezier curves', () => {
  const sheetImg = makeSyntheticImage(180, 140, (x, y) => {
    const inRect1 = x >= 18 && x <= 75 && y >= 22 && y <= 110;
    const inCircle2 = Math.hypot(x - 130, y - 70) <= 32;
    return (inRect1 || inCircle2) ? [28, 32, 42] : [245, 245, 245];
  });

  const contour = traceComponentContour(
    extractConnectedComponents(segmentForegroundMask(sheetImg).mask, 180, 140)[0],
    180,
    140,
  );
  assert.ok(contour.length >= 16);

  const testCurves = fitCubicBeziersToPolygon([[0, 0], [10, 0], [12, 8], [8, 16], [0, 16]]);
  assert.ok(Array.isArray(testCurves) && testCurves.length >= 1);

  const sheetRes = digitizeFlatPatternSheet({
    imageData: sheetImg,
    measurements: { chest: 92, waist: 74, hips: 98 },
    seamAllowanceCm: 1.0,
  });
  assert.equal(sheetRes.ok, true);
  assert.equal(sheetRes.pieces.length, 2);
  assert.ok(sheetRes.pieces.some((p) => (p.curves || []).length > 0), 'Digitized circle piece preserves Bezier curves');
  const qa = PatternValidator.run(sheetRes.pieces, { bodyChestCm: 92, seamAllowanceCm: 1.0, offsetPoly });
  assert.equal(qa.summary.fail, 0);
});

test('Phase 3: Matte human skin material, Runway Fashion Poses & non-walking pose hold', () => {
  for (const cat of ['women', 'men', 'girls', 'boys']) {
    const mat = createHumanSkinMaterial(THREE, cat);
    assert.ok(mat.roughness >= 0.60, `${cat} skin matte roughness (${mat.roughness}) eliminates plastic shine`);
    assert.equal(mat.clearcoat, 0.0, `${cat} skin zero plastic clearcoat`);
    assert.equal(mat.sheen, 0.0, `${cat} skin preserves sheen === 0 contract`);
    assert.equal(mat.transparent, false);
  }

  for (const reqPose of ['editorial', 'showcase', 'contrapposto', 'standing', 'apose', 'tpose', 'seated']) {
    assert.ok(FASHION_POSES.includes(reqPose), `FASHION_POSES includes ${reqPose}`);
  }

  const man = buildHumanMannequin(THREE, 'women', null, { pose: 'editorial', lowPower: true });
  applyMannequinPose(man.limbs, 'editorial', man.dims);
  assert.ok(Math.abs(man.limbs.pelvis.rotation.z) > 0.03, 'Editorial pose tilts hip naturally');
  assert.ok(man.limbs.knee1.rotation.x > 0.15, 'Editorial pose flexes lead knee');

  // Holding pose in applyNaturalHumanMotion(walking: false) preserves editorial hip tilt instead of resetting to 0
  applyNaturalHumanMotion(man.limbs, man.dims, man.landmarks, {
    time: 0.4,
    walking: false,
    pose: 'editorial',
    reduceMotion: true,
    blendAlpha: 1.0,
  });
  assert.ok(man.limbs.pelvis.rotation.z < -0.04, 'applyNaturalHumanMotion preserves editorial pose when paused');
});

test('Phase 4: Zenodo panel naming (lback/rback) resolves back panels cleanly for 3D drape', () => {
  assert.equal(isBackPieceName('lback_0'), true);
  assert.equal(isBackPieceName('rback_1'), true);
  assert.equal(isBackPieceName('lfront_3'), false);

  const zcPiece = { key: 'rback_1', name: { en: 'Panel (Rback)', ar: 'خلف' }, role: 'bodice-back-center', outline: [[0, 0], [20, 0], [20, 40], [0, 40]] };
  assert.equal(classifyPiecePart(zcPiece, [zcPiece], 'women'), 'bodice');
});

test('Phase 5: Nested Marker 1:1 SVG & Upgraded Couture Tech Pack (Graded Matrix + Seam Balance)', () => {
  const pieces = [
    {
      key: 'front',
      name: { en: 'Front Bodice', ar: 'أمام' },
      role: 'bodice-front-center',
      cutOnFold: true,
      outline: [[0, 0], [24, 0], [26, 40], [0, 42]],
      edges: [{ fromIdx: 1, toIdx: 2, seamId: 'side_seam', seamLabel: { en: 'Side Seam', ar: 'الجنب' } }],
    },
    {
      key: 'back',
      name: { en: 'Back Bodice', ar: 'خلف' },
      role: 'bodice-back-center',
      cutOnFold: true,
      outline: [[0, 0], [24, 0], [26, 40], [0, 42]],
      edges: [{ fromIdx: 1, toIdx: 2, seamId: 'side_seam', seamLabel: { en: 'Side Seam', ar: 'الجنب' } }],
    },
    {
      key: 'collar',
      name: { en: 'Shirt Collar', ar: 'ياقة' },
      role: 'collar',
      cutOnFold: true,
      outline: [[0, 0], [20, 0], [18, 6], [0, 5]],
    },
  ];
  const svg = buildNestedMarkerSVG(
    pieces,
    [{ id: 0, x: 2, y: 2, rotation: 0 }, { id: 1, x: 32, y: 2, rotation: 0 }],
    150,
    80,
    { utilization: 0.72, lang: 'en' },
  );
  assert.ok(svg.includes('width="158.0cm"'));
  assert.ok(svg.includes('10×10 cm 1:1'));
  assert.ok(svg.includes('Efficiency: 72%'));

  const html = buildTechPackHTML(pieces, {
    category: 'women',
    size: 'M',
    seamAllowanceCm: 1.0,
    measurements: { chest: 92, waist: 74, hips: 98, shoulder: 40, backLen: 40, sleeve: 58, inseam: 76 },
  });
  assert.ok(html.includes('Interfaced / Fusible'), 'Collar flagged as interfaced');
  assert.ok(html.includes('Graded Size Specification Matrix'), 'Includes XS-XXL matrix');
  assert.ok(html.includes('Seam Balance QA Audit'), 'Includes Seam Balance table');
  assert.ok(html.includes('Fold 0 cm'), 'Notes 0 cm Cut-on-Fold allowance');
});
