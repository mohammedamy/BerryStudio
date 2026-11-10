import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PATTERNS, computeMeasurements } from '../js/data.js';
import '../js/library.js';
import '../js/girls-leotards.js';
import { FancyGen } from '../js/fancy-patterns.js';
import '../js/underwear-library.js';
import '../js/reference-patterns.js';
import { AIGen } from '../js/ai.js';
import {
  buildSystemPrompt,
  generateFromSpec,
  generateSVGPatternFromImage,
  SVG_PATTERN_PROMPT,
} from '../js/ai-spec-pipeline.js';
import { run as runValidator } from '../js/validate.js';

const SCHEMA = JSON.parse(fs.readFileSync(new URL('../schema/pattern-spec.v1.json', import.meta.url), 'utf8'));

const SLEEVE_CAP_ROLES = new Set([
  'sleeve',
  'sleeve-upper',
  'cap-sleeve',
  'puff-sleeve',
  'butterfly-sleeve',
]);

function cubicAt(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
  ];
}

function isRaglanPiece(piece, patternId = '') {
  const label = [
    patternId,
    piece.key,
    piece.id,
    typeof piece.name === 'string' ? piece.name : `${piece.name?.en || ''} ${piece.name?.ar || ''}`,
  ].join(' ');
  return /raglan|رغلان|راجلان/i.test(label);
}

/**
 * Verifies that a flat-pattern sleeve piece has a true `-cos` S-curve cap
 * (horizontal tangents at both underarms and at the crown peak, concave-up
 * swoop out of the underarm hollow, steepest slope mid-armscye, and smooth
 * rounded crown dome — never an inverted-|x| triangle or steep quadratic arc).
 */
function assertCosineSleeveCap(piece, ctxLabel, cubicTol = 1e-6) {
  const pts = piece.outline;
  assert.ok(Array.isArray(pts) && pts.length >= 14, `${ctxLabel}: expected curved outline (>=14 pts), got ${pts?.length}`);
  assert.ok(Array.isArray(piece.curves) && piece.curves.length >= 2, `${ctxLabel}: expected >=2 cubic Bezier cap curves`);

  const [frontCurve, backCurve] = piece.curves;
  assert.equal(frontCurve.toIdx, backCurve.fromIdx, `${ctxLabel}: front and back cap curves must meet at crownIdx`);

  // 1) Sampled vertices must lie on the declared cubic Bezier segments
  for (const seg of [frontCurve, backCurve]) {
    const p0 = pts[seg.fromIdx];
    const p1 = pts[seg.toIdx];
    const n = seg.toIdx - seg.fromIdx;
    assert.ok(n >= 4, `${ctxLabel}: expected >=4 samples per half-cap, got ${n}`);
    for (let k = 1; k < n; k++) {
      const [ex, ey] = cubicAt(p0, seg.c1, seg.c2, p1, k / n);
      const [ax, ay] = pts[seg.fromIdx + k];
      const err = Math.hypot(ax - ex, ay - ey);
      assert.ok(err <= cubicTol, `${ctxLabel}: sample ${seg.fromIdx + k} deviates from cubic Bezier by ${err}`);
    }
  }

  const pFront = pts[frontCurve.fromIdx];
  const pCrown = pts[frontCurve.toIdx];
  const pBack = pts[backCurve.toIdx];

  // Crown must rise above (smaller y in screen/pattern coords) both underarms
  assert.ok(pCrown[1] < pFront[1] - 2, `${ctxLabel}: crown y (${pCrown[1]}) must rise above front underarm (${pFront[1]})`);
  assert.ok(pCrown[1] < pBack[1] - 2, `${ctxLabel}: crown y (${pCrown[1]}) must rise above back underarm (${pBack[1]})`);
  assert.ok(pCrown[0] > pFront[0] && pBack[0] > pCrown[0], `${ctxLabel}: cap x must progress front -> crown -> back`);

  // 2) Horizontal tangents (dy/dx = 0) at front underarm, crown peak, and back underarm
  assert.ok(Math.abs(frontCurve.c1[1] - pFront[1]) <= 1e-3, `${ctxLabel}: front underarm tangent must be horizontal`);
  assert.ok(Math.abs(frontCurve.c2[1] - pCrown[1]) <= 1e-3, `${ctxLabel}: front crown tangent must be horizontal`);
  assert.ok(Math.abs(backCurve.c1[1] - pCrown[1]) <= 1e-3, `${ctxLabel}: back crown tangent must be horizontal`);
  assert.ok(Math.abs(backCurve.c2[1] - pBack[1]) <= 1e-3, `${ctxLabel}: back underarm tangent must be horizontal`);

  // 3) True -cos S-curve inflection: initial underarm chord slope & crown chord slope
  // must both be noticeably gentler than the mid-armscye inflection slope
  for (const [side, seg] of [['front', frontCurve], ['back', backCurve]]) {
    const n = seg.toIdx - seg.fromIdx;
    const slopes = [];
    for (let i = seg.fromIdx; i < seg.toIdx; i++) {
      const dx = pts[i + 1][0] - pts[i][0];
      const dy = pts[i + 1][1] - pts[i][1];
      assert.ok(dx > 0, `${ctxLabel} (${side}): x must increase monotonically along cap`);
      slopes.push(Math.abs(dy / dx));
    }
    const maxMidSlope = Math.max(...slopes);
    const underarmEdgeSlope = side === 'front' ? slopes[0] : slopes[n - 1];
    const crownEdgeSlope = side === 'front' ? slopes[n - 1] : slopes[0];
    assert.ok(
      underarmEdgeSlope < maxMidSlope * 0.65,
      `${ctxLabel} (${side}): underarm slope (${underarmEdgeSlope.toFixed(3)}) must swoop gently (< 0.65 * mid slope ${maxMidSlope.toFixed(3)}), never like -|x|`,
    );
    assert.ok(
      crownEdgeSlope < maxMidSlope * 0.65,
      `${ctxLabel} (${side}): crown slope (${crownEdgeSlope.toFixed(3)}) must round smoothly (< 0.65 * mid slope ${maxMidSlope.toFixed(3)}), never like -|x|`,
    );
  }
}

test('entire 320-pattern library drafts every set-in/puff/cap/two-piece sleeve with a true -cos S-curve cap', () => {
  const ids = Object.keys(PATTERNS);
  assert.ok(ids.length >= 320, `expected all >=320 patterns loaded, got ${ids.length}`);

  let checkedSleeves = 0;
  let skippedRaglan = 0;

  for (const id of ids) {
    const pat = PATTERNS[id];
    const isKids = pat.category === 'girls' || pat.category === 'boys';
    const meas = computeMeasurements({
      category: pat.category,
      size: 'M',
      standard: 'intl',
      kids: isKids ? '8-9' : null,
    });
    const pieces = typeof pat.pieces === 'function' ? pat.pieces(meas) : pat.pieces;

    for (const piece of pieces) {
      if (!SLEEVE_CAP_ROLES.has(piece.role)) continue;
      if (isRaglanPiece(piece, id)) {
        skippedRaglan++;
        continue;
      }
      assertCosineSleeveCap(piece, `${id}/${piece.key || piece.name?.en || piece.role}`);
      checkedSleeves++;
    }
  }

  // Over 180 sleeved patterns across data.js, library.js, fancy-patterns.js, girls-leotards.js, and reference-patterns.js
  assert.ok(checkedSleeves >= 150, `expected >=150 sleeve pieces verified across library, got ${checkedSleeves}`);
  assert.ok(skippedRaglan >= 1 && skippedRaglan <= 10, `expected only genuine raglan sleeves skipped, got ${skippedRaglan}`);
});

test('FancyGen generic builders and AIGen.build draft true -cos S-curve sleeves across all sleeved garment types', () => {
  const meas = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });

  for (const kind of ['gown', 'jacket', 'coat', 'suit']) {
    const pieces = FancyGen.build(kind, meas, { sleeveless: false, sleeveLong: true });
    const sleeves = pieces.filter((p) => SLEEVE_CAP_ROLES.has(p.role));
    assert.ok(sleeves.length >= 1, `FancyGen ${kind} should include a sleeve`);
    for (const s of sleeves) assertCosineSleeveCap(s, `FancyGen:${kind}/${s.key}`);
  }

  for (const type of ['top', 'shirt', 'dress', 'robe', 'romper', 'leotard']) {
    const style = { ...AIGen.deriveStyle({ prompt: `long sleeve ${type}`, category: 'women' }), type, sleeveLenF: 0.9 };
    const built = AIGen.build(style, meas);
    const sleeve = built.pieces.find((p) => SLEEVE_CAP_ROLES.has(p.role));
    assert.ok(sleeve, `AIGen.build(${type}) should emit a sleeve`);
    assertCosineSleeveCap(sleeve, `AIGen:${type}`);
    const val = runValidator([sleeve], {});
    assert.equal(val.summary.fail, 0, `AIGen:${type} sleeve must pass PatternValidator with 0 failures`);
  }
});

test('AI spec pipeline Mode-2 SLEEVE FAST-PATH drafts a -cos sleeve in 1 call when LLM omits sleeve outlineCm', async () => {
  const sys = buildSystemPrompt('women', 'en');
  assert.match(sys, /SLEEVE FAST-PATH/);

  const meas = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  const fastPathSpec = {
    specVersion: '1',
    garment: {
      type: 'shirt',
      category: 'women',
      closure: 'button',
      referenceMeasurementsCm: { chest: 88, waist: 70, hips: 94, backLen: 40, bicep: 29, sleeve: 58 },
    },
    construction: {
      neckline: 'collar',
      hem: 'straight',
      sleeve: { kind: 'set-in', lengthF: 0.95, widthF: 1.05 },
    },
    pieces: [
      {
        id: 'front_bodice',
        label: { en: 'Front Bodice', ar: 'صدرية أمامية' },
        role: 'bodice-front',
        cutOnFold: false,
        quantity: 2,
        grainline: 'straight',
        outlineCm: [[0, 0], [24, 2], [24, 58], [0, 58]],
      },
      {
        id: 'back_bodice',
        label: { en: 'Back Bodice', ar: 'صدرية خلفية' },
        role: 'bodice-back',
        cutOnFold: true,
        quantity: 1,
        grainline: 'straight',
        outlineCm: [[0, 0], [24, 2], [24, 58], [0, 58]],
      },
      {
        // Omitted outlineCm per SLEEVE FAST-PATH!
        id: 'sleeve',
        label: { en: 'Shirt Sleeve', ar: 'كم القميص' },
        role: 'sleeve',
        cutOnFold: false,
        quantity: 2,
        grainline: 'straight',
      },
    ],
    provenance: [{ field: 'garment.type', source: 'user', confidence: 0.95 }],
  };

  let calls = 0;
  const adapter = {
    complete: async () => {
      calls++;
      return { ok: true, json: fastPathSpec };
    },
  };

  const out = await generateFromSpec({
    adapter,
    cfg: {},
    prompt: 'tailored shirt from spec sheet',
    measurements: meas,
    category: 'women',
    lang: 'en',
    schema: SCHEMA,
  });

  assert.equal(calls, 1, 'should complete in 1 LLM call with zero retries');
  assert.equal(out.source, 'spec-measured');
  assert.equal(out.pieces.length, 3);
  const sleeve = out.pieces.find((p) => p.role === 'sleeve');
  assert.ok(sleeve, 'sleeve should be synthesized deterministically even without outlineCm');
  assertCosineSleeveCap(sleeve, 'spec-fast-path/sleeve', 2e-3);
  assert.equal(out.validation.summary.fail, 0);
});

test('AI spec pipeline & SVG import replace comical 5-point triangle or placeholder box sleeves with -cos S-curve sleeves', async () => {
  assert.match(SVG_PATTERN_PROMPT, /Sleeve Fast-Path/);
  const meas = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });

  // 1) Mode-2 spec where LLM ignored fast-path and emitted a comical 5-point -|x| triangle sleeve
  const triangleSleeveSpec = {
    specVersion: '1',
    garment: { type: 'top', category: 'women', closure: 'none' },
    pieces: [
      {
        id: 'front',
        role: 'bodice-front',
        cutOnFold: true,
        quantity: 1,
        grainline: 'straight',
        outlineCm: [[0, 0], [23, 2], [23, 54], [0, 54]],
      },
      {
        id: 'back',
        role: 'bodice-back',
        cutOnFold: true,
        quantity: 1,
        grainline: 'straight',
        outlineCm: [[0, 0], [23, 2], [23, 54], [0, 54]],
      },
      {
        id: 'sleeve',
        role: 'sleeve',
        cutOnFold: false,
        quantity: 2,
        grainline: 'straight',
        outlineCm: [[0, 0], [16, -8], [32, 0], [30, 52], [2, 52]],
      },
    ],
  };

  const measuredPieces = AIGen.buildFromMeasuredPieces(triangleSleeveSpec, meas);
  const replacedSleeve = measuredPieces.find((p) => p.role === 'sleeve');
  assertCosineSleeveCap(replacedSleeve, 'triangle-replaced/sleeve', 2e-3);

  // 2) Direct SVG import where LLM emitted a bounding <rect id="Sleeve" .../> alongside a bodice panel
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120cm" height="80cm">',
    '  <rect id="Front_Bodice" x="5" y="5" width="24" height="55"/>',
    '  <rect id="Sleeve" x="50" y="8" width="34" height="58"/>',
    '</svg>',
  ].join('\n');

  const adapter = { complete: async () => ({ ok: true, text: svg }) };
  const res = await generateSVGPatternFromImage({
    adapter,
    cfg: {},
    imageDataURL: 'data:image/png;base64,AAA',
    measurements: meas,
  });

  assert.equal(res.ok, true);
  assert.equal(res.pieces.length, 2);
  const front = res.pieces.find((p) => p.name === 'Front_Bodice');
  const svgSleeve = res.pieces.find((p) => p.name === 'Sleeve');
  assert.equal(front.outline.length, 4, 'non-sleeve SVG rect stays untouched');
  assertCosineSleeveCap(svgSleeve, 'svg-import/Sleeve', 2e-3);

  // Preserves layout slot [50..84, 8..66] so SVG pieces never collide
  const xs = svgSleeve.outline.map((pt) => pt[0]);
  const ys = svgSleeve.outline.map((pt) => pt[1]);
  assert.ok(Math.abs(Math.min(...xs) - 50) < 0.01);
  assert.ok(Math.abs(Math.max(...xs) - 84) < 0.01);
  assert.ok(Math.abs(Math.min(...ys) - 8) < 0.01);
  assert.ok(Math.abs(Math.max(...ys) - 66) < 0.01);
});
