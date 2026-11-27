import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFoldEdgeIndex,
  resolvePieceSeamAllowances,
  offsetPieceOutline,
  edgeNormalAtPoint,
  findVisualLabelAnchor,
  inferPieceCutInstruction,
  analyzeSeamBalance,
} from '../js/geometry.js';
import {
  stepForSize,
  gradePieceAnatomically,
  gradePiecesAnatomically,
  buildNestedSizeLayers,
  NESTED_SIZE_STYLES,
} from '../js/grading.js';
import { computeMeasurements, PATTERNS } from '../js/data.js';
import { buildPDF, buildSVG } from '../js/pattern-export.js';

const BODICE_FRONT = {
  key: 'front',
  role: 'bodice-front',
  name: { en: 'Front Bodice', ar: 'الأمام' },
  cutOnFold: true,
  outline: [
    [0, 8],     // 0: CF neck
    [8, 0],     // 1: HPS (neck curve chord)
    [20, 3],    // 2: Shoulder tip
    [24, 21],   // 3: Underarm / armhole
    [22, 42],   // 4: Waist/hem outer corner
    [0, 42],    // 5: CF hem (edge 5 -> 0 is vertical at x=0 => FOLD edge!)
  ],
  darts: [[[11, 20], [9.5, 42], [12.5, 42]]],
  notches: [[24, 21], [14, 1.5]],
  grain: [[6, 12], [6, 38]],
};

const BODICE_BACK = {
  key: 'back',
  role: 'bodice-back',
  name: { en: 'Back Bodice', ar: 'الخلف' },
  cutOnFold: true,
  outline: [
    [0, 3],
    [8, 0],
    [20, 3],
    [24, 21],
    [22, 42],
    [0, 42],
  ],
  notches: [[24, 21]],
  grain: [[6, 10], [6, 38]],
};

const SLEEVE = {
  key: 'sleeve',
  role: 'sleeve',
  name: { en: 'Set-In Sleeve', ar: 'كم مركب' },
  bilateral: true,
  outline: [
    [0, 14],
    [8, 4],
    [16, 0],
    [24, 4],
    [32, 14],
    [28, 56],
    [4, 56],
  ],
  grain: [[16, 6], [16, 50]],
};

const COLLAR = {
  key: 'collar',
  role: 'collar',
  name: { en: 'Shirt Collar', ar: 'ياقة القميص' },
  cutOnFold: true,
  outline: [
    [0, 0],
    [20, 0],
    [21, 7],
    [0, 7],
  ],
  grain: [[4, 3.5], [16, 3.5]],
};

test('detectFoldEdgeIndex finds the Cut-on-Fold edge along minX and ignores non-fold pieces', () => {
  assert.equal(detectFoldEdgeIndex(BODICE_FRONT), 5);
  assert.equal(detectFoldEdgeIndex(SLEEVE), -1);
  assert.equal(detectFoldEdgeIndex({ ...BODICE_FRONT, foldEdgeIndex: 2 }), 2);
});

test('resolvePieceSeamAllowances assigns 0cm on fold edge, 3cm on hem, and default on side seams', () => {
  const sa = resolvePieceSeamAllowances(BODICE_FRONT, 1.5, { variable: true });
  assert.equal(sa[5], 0, 'fold edge must stay 0cm');
  assert.equal(sa[4], 3, 'bottom hem edge should expand to 3cm');
  assert.equal(sa[2], 1.5, 'armhole/straight seam stays 1.5cm when uncurved');
  const collarSa = resolvePieceSeamAllowances(COLLAR, 1.5, { variable: true });
  assert.equal(collarSa[3], 0, 'collar fold edge stays 0cm');
  assert.equal(collarSa[0], 1, 'collar outer seam caps at 1cm for crisp turning');
});

test('offsetPieceOutline keeps Cut-on-Fold edge at exact x=0 while expanding outer seams and 3cm hem', () => {
  const out = offsetPieceOutline(BODICE_FRONT, 1.5, { variable: true });
  assert.equal(out.length, BODICE_FRONT.outline.length);
  // Vertices 0 and 5 lie on the fold edge x=0 -> must remain strictly on x=0!
  assert.ok(Math.abs(out[0][0]) < 1e-6, `expected out[0].x ≈ 0, got ${out[0][0]}`);
  assert.ok(Math.abs(out[5][0]) < 1e-6, `expected out[5].x ≈ 0, got ${out[5][0]}`);
  // Hem edge expanded by 3cm downward (42 + 3 = 45)
  assert.ok(Math.abs(out[5][1] - 45) < 1e-5, `expected hem Y = 45, got ${out[5][1]}`);
  // Outer chest edge expanded by ~1.5cm outward (>24)
  assert.ok(out[3][0] >= 25.3, `expected right underarm expanded >=25.3, got ${out[3][0]}`);
});

test('edgeNormalAtPoint computes inward normal into piece interior', () => {
  const sq = [[0, 0], [20, 0], [20, 20], [0, 20]];
  const leftN = edgeNormalAtPoint(sq, [0, 10]);
  assert.ok(leftN.inward[0] > 0.9, 'left edge inward normal points +X');
  const rightN = edgeNormalAtPoint(sq, [20, 10]);
  assert.ok(rightN.inward[0] < -0.9, 'right edge inward normal points -X');
  const topN = edgeNormalAtPoint(sq, [10, 0]);
  assert.ok(topN.inward[1] > 0.9, 'top edge inward normal points +Y');
});

test('findVisualLabelAnchor stays inside concave L-shaped piece instead of landing in outer cutout', () => {
  const lCollar = [[0, 0], [24, 0], [24, 4], [4, 4], [4, 16], [0, 16]];
  const anchor = findVisualLabelAnchor(lCollar);
  // Centroid of vertices would land outside the L strip in empty space (>4, >4); interior anchor must lie in a leg!
  const insideLeg = (anchor.x >= 0 && anchor.x <= 24 && anchor.y >= 0 && anchor.y <= 4) ||
    (anchor.x >= 0 && anchor.x <= 4 && anchor.y >= 0 && anchor.y <= 16);
  assert.ok(insideLeg, `anchor (${anchor.x}, ${anchor.y}) must sit inside the L piece`);
});

test('inferPieceCutInstruction formats fold, pair, and interfacing annotations cleanly', () => {
  const foldInfo = inferPieceCutInstruction(BODICE_FRONT);
  assert.equal(foldInfo.onFold, true);
  assert.match(foldInfo.en, /Cut 1 on Fold/);
  assert.match(foldInfo.ar, /على الثنية/);

  const collarInfo = inferPieceCutInstruction(COLLAR);
  assert.equal(collarInfo.interfacing, true);
  assert.match(collarInfo.en, /Interfacing/);

  const sleeveInfo = inferPieceCutInstruction(SLEEVE);
  assert.equal(sleeveInfo.qty, 2);
  assert.match(sleeveInfo.en, /Cut 2/);
});

test('analyzeSeamBalance auto-infers shoulder, side seam, and armhole-sleeve-cap pairs when seamId is absent', () => {
  const balance = analyzeSeamBalance([BODICE_FRONT, BODICE_BACK, SLEEVE]);
  assert.ok(balance.some((p) => p.id === 'shoulder'), 'expected inferred shoulder seam');
  assert.ok(balance.some((p) => p.id === 'side_seam'), 'expected inferred side seam');
  assert.ok(balance.some((p) => p.id === 'armhole_sleeve_cap'), 'expected inferred armhole vs sleeve cap pair');
  const side = balance.find((p) => p.id === 'side_seam');
  assert.equal(side.status, 'ok');
  assert.ok(Math.abs(side.diffCm) < 0.01);
});

test('gradePiecesAnatomically grades AI/custom pieces losslessly with locked fold edge and preserved collar height', () => {
  const measM = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  const measXL = computeMeasurements({ category: 'women', size: 'XL', standard: 'intl' });
  const base = [BODICE_FRONT, COLLAR];

  const xlPieces = gradePiecesAnatomically(base, measM, measXL, null, stepForSize('XL'));
  const xlFront = xlPieces[0];
  const xlCollar = xlPieces[1];

  // Fold edge stays anchored at x=0
  assert.equal(xlFront.outline[0][0], 0);
  assert.equal(xlFront.outline[5][0], 0);
  // Side seam expands by (dChest/4) = +8/4 = +2.0 cm at bust
  assert.ok(xlFront.outline[3][0] > BODICE_FRONT.outline[3][0] + 1.5);
  // Back length increases hem Y
  assert.ok(xlFront.outline[4][1] > BODICE_FRONT.outline[4][1] + 1.0);
  // Collar grows in length along neck (dNeck*0.5) while keeping stand height exactly 7cm
  assert.ok(xlCollar.outline[1][0] > COLLAR.outline[1][0] + 0.5);
  assert.equal(xlCollar.outline[3][1] - xlCollar.outline[0][1], 7);

  // Grading directly from base snapshot back to M restores original coordinates exactly
  const mRestored = gradePiecesAnatomically(base, measM, measM, null, 0);
  assert.deepEqual(mRestored[0].outline, BODICE_FRONT.outline);
  assert.deepEqual(mRestored[1].outline, COLLAR.outline);
});

test('buildNestedSizeLayers produces S/M/L/XL overlays for both library patterns and custom snapshots', () => {
  const libLayers = buildNestedSizeLayers(
    { pattern: PATTERNS.womens_dress, activePieces: PATTERNS.womens_dress.pieces(computeMeasurements({ category: 'women', size: 'M', standard: 'intl' })) },
    ['S', 'M', 'L', 'XL'],
    { category: 'women', standard: 'intl', kids: null, custom: {} },
    computeMeasurements,
  );
  assert.equal(libLayers.length, 4);
  assert.equal(libLayers[1].size, 'M');
  assert.deepEqual(libLayers[2].style, NESTED_SIZE_STYLES.L);
  assert.ok(libLayers.every((l) => l.pieces.length > 0));

  const measM = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  const customLayers = buildNestedSizeLayers(
    { basePieces: [BODICE_FRONT], baseMeas: measM, baseSize: 'M', activePieces: [BODICE_FRONT] },
    ['S', 'M', 'L', 'XL'],
    { category: 'women', standard: 'intl', kids: null, custom: {} },
    computeMeasurements,
  );
  assert.equal(customLayers.length, 4);
  const wS = Math.max(...customLayers[0].pieces[0].outline.map((p) => p[0]));
  const wXL = Math.max(...customLayers[3].pieces[0].outline.map((p) => p[0]));
  assert.ok(wXL > wS + 2, `XL width (${wXL}) should exceed S width (${wS})`);
});

test('buildPDF tiled, A0 Copyshop, and Multi-Size Nested exports contain atelier markings & calibration squares', () => {
  const bigBodice = { ...BODICE_FRONT, outline: BODICE_FRONT.outline.map(([x, y]) => [x * 1.6, y * 1.4]) };
  const tiledPdf = buildPDF([bigBodice], {
    tiled: true,
    pageSize: 'a4',
    overlapMm: 10,
    includeGuides: true,
    seamAllowanceCm: 1.5,
    variableSeam: true,
    title: 'Atelier Test Dress',
    size: 'M',
  });
  assert.match(tiledPdf, /10cm x 10cm calibration/);
  assert.match(tiledPdf, /2in x 2in imperial check/);
  assert.match(tiledPdf, /GRAIN/);
  assert.match(tiledPdf, /FOLD \/ 0cm SA/);
  assert.match(tiledPdf, /Front Bodice/);
  assert.match(tiledPdf, /Join R1C2/);
  // Straight piece must NEVER emit cubic bezier 'c' operator (preserving contract)
  assert.doesNotMatch(tiledPdf, /\bc\n/);

  const measM = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  const nestedLayers = buildNestedSizeLayers(
    { basePieces: [BODICE_FRONT], baseMeas: measM, baseSize: 'M', activePieces: [BODICE_FRONT] },
    ['S', 'M', 'L', 'XL'],
    { category: 'women', standard: 'intl', kids: null, custom: {} },
    computeMeasurements,
  );

  const a0NestedPdf = buildPDF([BODICE_FRONT], {
    tiled: false,
    copyshop: true,
    pageSize: 'a0',
    includeGuides: true,
    seamAllowanceCm: 1.5,
    variableSeam: true,
    title: 'Copyshop Nest',
    size: 'M',
    nestedLayers,
  });
  assert.match(a0NestedPdf, /\/MediaBox \[0 0 2383\.94 3370\.40\]/);
  assert.match(a0NestedPdf, /BerryStudio 1:1 Atelier Sheet/);
  assert.match(a0NestedPdf, /Multi-Size Nest Key:/);
  assert.match(a0NestedPdf, /\[7 3\] 0 d/);
});

test('buildSVG emits variable SA, fold symbol, dart center fold & apex punch, V-notches, 2in scale & nested grades', () => {
  const measM = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  const nestedLayers = buildNestedSizeLayers(
    { basePieces: [BODICE_FRONT], baseMeas: measM, baseSize: 'M', activePieces: [BODICE_FRONT] },
    ['S', 'M', 'L'],
    { category: 'women', standard: 'intl', kids: null, custom: {} },
    computeMeasurements,
  );
  const svg = buildSVG([BODICE_FRONT], {
    seamAllowanceCm: 1.5,
    variableSeam: true,
    size: 'M',
    lang: 'en',
    nestedLayers,
  });
  assert.match(svg, /class="seam-allowance"/);
  assert.match(svg, /class="fold-symbol"/);
  assert.match(svg, /class="dart-fold"/);
  assert.match(svg, /class="dart-apex"/);
  assert.match(svg, /class="notch" d="M /);
  assert.match(svg, /class="grade-line" data-size="L"/);
  assert.match(svg, /10 cm \(1:1 Calibration\)/);
  assert.match(svg, />2 in</);
});
