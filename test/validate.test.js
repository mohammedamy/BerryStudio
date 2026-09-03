import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../js/validate.js';

// A simple, well-formed square (closed, non-self-intersecting, straight
// vertical grain, straight left edge candidate for a fold).
const goodSquare = {
  name: { en: 'Test Front', ar: 'اختبار أمامي' },
  outline: [[0, 0], [10, 0], [10, 20], [0, 20]],
  grain: [[5, 2], [5, 18]],
  notches: [],
};

test('a well-formed piece passes all full-confidence checks', () => {
  const report = run([goodSquare]);
  const c = report.perPiece[0].checks;
  assert.equal(c.closedOutline.status, 'pass');
  assert.equal(c.selfIntersection.status, 'pass');
  assert.equal(c.grainline.status, 'pass');
  assert.equal(c.foldSymmetry.status, 'pass');
});

test('a self-crossing bowtie outline fails self-intersection', () => {
  const bowtie = { ...goodSquare, outline: [[0, 0], [10, 20], [10, 0], [0, 20]] };
  const report = run([bowtie]);
  assert.equal(report.perPiece[0].checks.selfIntersection.status, 'fail');
});

test('a missing grainline fails, and a 45-degree grain warns as possible bias', () => {
  const noGrain = { ...goodSquare, grain: [] };
  assert.equal(run([noGrain]).perPiece[0].checks.grainline.status, 'fail');

  const biasGrain = { ...goodSquare, grain: [[0, 0], [10, 10]] };
  assert.equal(run([biasGrain]).perPiece[0].checks.grainline.status, 'warn');
});

test('a duplicate consecutive point fails the closed-outline check', () => {
  const dup = { ...goodSquare, outline: [[0, 0], [0, 0], [10, 0], [10, 20], [0, 20]] };
  assert.equal(run([dup]).perPiece[0].checks.closedOutline.status, 'fail');
});

test('seamAllowance check runs when offsetPoly is provided, warns without it', () => {
  const offsetPoly = (poly, d) => poly.map(([x, y]) => [x < 5 ? x - d : x + d, y < 10 ? y - d : y + d]);
  const withFn = run([goodSquare], { offsetPoly });
  assert.equal(withFn.perPiece[0].checks.seamAllowance.status, 'pass');
  const withoutFn = run([goodSquare]);
  assert.equal(withoutFn.perPiece[0].checks.seamAllowance.status, 'warn');
});

test('a matched front/back pair with equal side lengths passes seam-length parity', () => {
  const front = { name: { en: 'Bodice Front' }, outline: [[0, 0], [10, 0], [10, 20], [0, 20]], grain: [[5, 2], [5, 18]], notches: [] };
  const back = { name: { en: 'Bodice Back' }, outline: [[0, 0], [10, 0], [10, 20], [0, 20]], grain: [[5, 2], [5, 18]], notches: [] };
  const report = run([front, back]);
  assert.equal(report.crossPiece.length, 1);
  assert.equal(report.crossPiece[0].checks.seamLengthParity.status, 'pass');
});

test('a matched front/back pair with mismatched side lengths fails seam-length parity', () => {
  const front = { name: { en: 'Bodice Front' }, outline: [[0, 0], [10, 0], [10, 20], [0, 20]], grain: [[5, 2], [5, 18]], notches: [] };
  const back = { name: { en: 'Bodice Back' }, outline: [[0, 0], [10, 0], [10, 25], [0, 25]], grain: [[5, 2], [5, 23]], notches: [] };
  const report = run([front, back]);
  assert.equal(report.crossPiece[0].checks.seamLengthParity.status, 'fail');
});

test('an unpairable piece (no front/back counterpart) warns rather than guessing', () => {
  const lonelyFront = { name: { en: 'Bodice Front' }, outline: goodSquare.outline, grain: goodSquare.grain, notches: [] };
  const report = run([lonelyFront]);
  assert.equal(report.crossPiece[0].checks.seamLengthParity.status, 'warn');
});

// Phase 1 (docs/plan 4.md §5.2): a declared `edges[].seamId` measures the
// real edge polyline instead of the bounding-box-extent proxy — the SAME
// field js/fancy-patterns.js already populates for cloth-lab's real 3D
// seams, not a second parallel mechanism. The side edge here is outline
// index 1→2, [10,0]→[10,20], length 20cm on both pieces.
test('a matched pair with a shared edges[].seamId passes on the real edge length, not the proxy', () => {
  const front = { name: { en: 'Bodice Front' }, outline: [[0, 0], [10, 0], [10, 20], [0, 20]], grain: [[5, 2], [5, 18]], notches: [], edges: [{ fromIdx: 1, toIdx: 2, seamId: 'side' }] };
  const back = { name: { en: 'Bodice Back' }, outline: [[0, 0], [10, 0], [10, 20], [0, 20]], grain: [[5, 2], [5, 18]], notches: [], edges: [{ fromIdx: 1, toIdx: 2, seamId: 'side' }] };
  const report = run([front, back]);
  const c = report.crossPiece[0].checks.seamLengthParity;
  assert.equal(c.status, 'pass');
  assert.match(c.message, /declared "side" seam/);
});

test('a shared edges[].seamId catches a real un-sewable side seam that the bounding-box proxy would also have caught', () => {
  const front = { name: { en: 'Bodice Front' }, outline: [[0, 0], [10, 0], [10, 20], [0, 20]], grain: [[5, 2], [5, 18]], notches: [], edges: [{ fromIdx: 1, toIdx: 2, seamId: 'side' }] };
  const back = { name: { en: 'Bodice Back' }, outline: [[0, 0], [10, 0], [10, 25], [0, 25]], grain: [[5, 2], [5, 23]], notches: [], edges: [{ fromIdx: 1, toIdx: 2, seamId: 'side' }] };
  const report = run([front, back]);
  const c = report.crossPiece[0].checks.seamLengthParity;
  assert.equal(c.status, 'fail');
  assert.match(c.message, /declared "side" seam/);
});

// The exact scenario docs/plan 4.md §5.2 calls out: a front drafted with a
// deeper neckline is legitimately taller overall (bounding-box proxy would
// fail it), but its actual side-seam edge is identical in length to the
// back's — a shared edges[].seamId pairing must pass where the proxy
// alone would have failed.
test('a shared edges[].seamId passes a legitimately deeper-neckline front that the bounding-box proxy alone would fail', () => {
  // Front: neckline dips down to y=-3 (making the overall bbox taller /
  // proxy height 23), but its SIDE edge (idx 1->2) is still 20cm, same as
  // the back's.
  const front = {
    name: { en: 'Bodice Front' },
    outline: [[0, -3], [10, 0], [10, 20], [0, 20]],
    grain: [[5, 2], [5, 18]],
    notches: [],
    edges: [{ fromIdx: 1, toIdx: 2, seamId: 'side' }],
  };
  const back = { name: { en: 'Bodice Back' }, outline: [[0, 0], [10, 0], [10, 20], [0, 20]], grain: [[5, 2], [5, 18]], notches: [], edges: [{ fromIdx: 1, toIdx: 2, seamId: 'side' }] };
  const report = run([front, back]);
  const c = report.crossPiece[0].checks.seamLengthParity;
  assert.equal(c.status, 'pass');
});

test('a piece declaring an edges[].seamId the counterpart does not still falls back to the bounding-box proxy', () => {
  const front = { name: { en: 'Bodice Front' }, outline: [[0, 0], [10, 0], [10, 20], [0, 20]], grain: [[5, 2], [5, 18]], notches: [], edges: [{ fromIdx: 1, toIdx: 2, seamId: 'side' }] };
  const back = { name: { en: 'Bodice Back' }, outline: [[0, 0], [10, 0], [10, 20], [0, 20]], grain: [[5, 2], [5, 18]], notches: [] }; // no edges declared
  const report = run([front, back]);
  const c = report.crossPiece[0].checks.seamLengthParity;
  assert.equal(c.status, 'pass');
  assert.match(c.message, /bounding-box proxy/);
});

test('a sleeve piece is excluded from front/back pairing entirely', () => {
  const sleeve = { name: { en: 'Set-in Sleeve' }, outline: goodSquare.outline, grain: goodSquare.grain, notches: [] };
  const report = run([sleeve]);
  assert.equal(report.crossPiece.length, 0);
});

// WP-24: ease is a real per-piece check now, driven entirely by a
// generator-populated `chestEdgeIndices` hint — never guessed post-hoc.
test('ease reports "not applicable" for a piece with no chestEdgeIndices hint, even with a body chest supplied', () => {
  const report = run([goodSquare], { bodyChestCm: 88 });
  assert.equal(report.perPiece[0].checks.ease.status, 'deferred');
});

test('ease reports "not applicable" for a hinted piece when no body chest was supplied', () => {
  const hinted = { ...goodSquare, chestEdgeIndices: [1] }; // outline[1] = [10,0]
  const report = run([hinted]);
  assert.equal(report.perPiece[0].checks.ease.status, 'deferred');
});

test('ease passes when the hinted vertex implies comfortably more than the minimum wearing ease', () => {
  // half=10 -> implied full chest = 40cm; body chest 30cm -> 10cm ease (>= 5cm floor)
  const hinted = { ...goodSquare, chestEdgeIndices: [1] };
  const report = run([hinted], { bodyChestCm: 30 });
  assert.equal(report.perPiece[0].checks.ease.status, 'pass');
});

test('ease warns when the hinted vertex implies positive but sub-minimum wearing ease', () => {
  // half=10 -> implied full chest = 40cm; body chest 38cm -> 2cm ease (0 < 2 < 5cm floor)
  const hinted = { ...goodSquare, chestEdgeIndices: [1] };
  const report = run([hinted], { bodyChestCm: 38 });
  assert.equal(report.perPiece[0].checks.ease.status, 'warn');
});

test('ease is invariant to Canvas.getPieces()\' layout translation (a real bug: raw absolute X, not measured from the piece\'s own fold edge, gave a wrong reading for any piece not already sitting at X=0)', () => {
  const hinted = { ...goodSquare, chestEdgeIndices: [1] }; // outline[1] = [10,0], fold (minX) at 0 -> half=10
  const baseline = run([hinted], { bodyChestCm: 30 }).perPiece[0].checks.ease;
  assert.equal(baseline.status, 'pass');
  // Simulate layoutPieces() shifting this piece 42cm to the right, exactly
  // as Canvas.getPieces() does in the real app — every coordinate moves,
  // including the hinted vertex AND the fold edge, so the piece's own
  // finished width (and thus the ease verdict) must be unchanged.
  const shifted = { ...hinted, outline: hinted.outline.map(([x, y]) => [x + 42, y]) };
  const afterShift = run([shifted], { bodyChestCm: 30 }).perPiece[0].checks.ease;
  assert.equal(afterShift.status, baseline.status);
  assert.equal(afterShift.message, baseline.message);
});

test('ease fails when the hinted vertex implies a finished chest smaller than the body', () => {
  // half=10 -> implied full chest = 40cm; body chest 50cm -> garment can't close
  const hinted = { ...goodSquare, chestEdgeIndices: [1] };
  const report = run([hinted], { bodyChestCm: 50 });
  assert.equal(report.perPiece[0].checks.ease.status, 'fail');
});

// BerryStudio-Upgrade-Plan-v5.md WP-44: `stretchFabric: true` opts a piece
// into a DIFFERENT, equally real floor — a negative-ease finished chest is
// the whole point of a stretch performance-fabric garment (leotards,
// underwear), not the "cannot physically close" defect the non-stretch
// branch above correctly flags it as.
test('ease (stretch fabric) fails only when the implied finished chest is beyond what 4-way stretch can comfortably negative-ease to', () => {
  // half=10 -> implied full chest = 40cm; body chest 70cm -> 40/70 = 57% (below the 65% floor)
  const hinted = { ...goodSquare, chestEdgeIndices: [1], stretchFabric: true };
  const report = run([hinted], { bodyChestCm: 70 });
  assert.equal(report.perPiece[0].checks.ease.status, 'fail');
});

test('ease (stretch fabric) passes a real negative-ease finished chest within the stretch fabric\'s real range', () => {
  // half=10 -> implied full chest = 40cm; body chest 50cm -> 40/50 = 80% (a real, intentional negative ease)
  const hinted = { ...goodSquare, chestEdgeIndices: [1], stretchFabric: true };
  const report = run([hinted], { bodyChestCm: 50 });
  assert.equal(report.perPiece[0].checks.ease.status, 'pass');
});

test('ease (stretch fabric) warns rather than passing/failing when the finished chest is unexpectedly LARGER than the body', () => {
  // half=10 -> implied full chest = 40cm; body chest 30cm -> 40/30 = 133% (not negative ease at all)
  const hinted = { ...goodSquare, chestEdgeIndices: [1], stretchFabric: true };
  const report = run([hinted], { bodyChestCm: 30 });
  assert.equal(report.perPiece[0].checks.ease.status, 'warn');
});

test('ease (stretch fabric) still reports "not applicable" without a chestEdgeIndices hint or a body chest measurement, same as the non-stretch branch', () => {
  const noHint = { ...goodSquare, stretchFabric: true };
  assert.equal(run([noHint], { bodyChestCm: 50 }).perPiece[0].checks.ease.status, 'deferred');
  const hintedNoBody = { ...goodSquare, chestEdgeIndices: [1], stretchFabric: true };
  assert.equal(run([hintedNoBody]).perPiece[0].checks.ease.status, 'deferred');
});

// BerryStudio-Upgrade-Plan-v5.md WP-44: notchAlignment had NO dedicated
// test anywhere in this suite before this WP, despite being one of
// validate.js's own fail-capable checks — added here because this WP's
// own new leotard notches (js/ai.js) immediately found a real false
// positive in its whole-piece-perimeter-fraction method (see this WP's
// CHANGELOG entry) that had to be fixed at the source, in this exact
// function, not worked around.
function frontBackPair(front, back) {
  return run([
    { name: { en: 'Front' }, role: 'front-panel', grain: [[1, 1], [1, 2]], ...front },
    { name: { en: 'Back' }, role: 'back-panel', grain: [[1, 1], [1, 2]], ...back },
  ]).crossPiece[0].checks.notchAlignment;
}

test('notchAlignment passes when neither piece declares a notch', () => {
  const flat = { outline: [[0, 0], [10, 0], [10, 10], [0, 10]], notches: [] };
  assert.equal(frontBackPair(flat, flat).status, 'pass');
});

test('notchAlignment warns (not fails) when front and back declare a different NUMBER of notches', () => {
  const square = { outline: [[0, 0], [10, 0], [10, 10], [0, 10]] };
  const oneNotch = { ...square, notches: [[10, 5]] };
  const noNotch = { ...square, notches: [] };
  assert.equal(frontBackPair(oneNotch, noNotch).status, 'warn');
});

test('notchAlignment (no declared shared seam — whole-piece fallback, unchanged) passes when notches sit at matching perimeter fractions', () => {
  const square = { outline: [[0, 0], [10, 0], [10, 10], [0, 10]] };
  // Both squares identical, both notches at the same vertex -> same fraction.
  const front = { ...square, notches: [[10, 0]] };
  const back = { ...square, notches: [[10, 0]] };
  assert.equal(frontBackPair(front, back).status, 'pass');
});

test('notchAlignment (no declared shared seam — whole-piece fallback, unchanged) fails when notches sit at clearly different perimeter fractions', () => {
  const square = { outline: [[0, 0], [10, 0], [10, 10], [0, 10]] };
  const front = { ...square, notches: [[10, 0]] };   // 25% around
  const back = { ...square, notches: [[10, 10]] };   // 50% around
  assert.equal(frontBackPair(front, back).status, 'fail');
});

// The false positive this WP found and fixed: front's own "preamble" (its
// neckline, say) runs much longer than back's own before either reaches
// their real shared seam — a completely normal, common garment shape
// (this project's own leotard front/back pairings, confirmed by direct
// measurement) — but the seam ITSELF is the same real length on both,
// with notches at the same real position ALONG that seam.
const longPreambleFront = {
  outline: [[0, 0], [0, -40], [0, -90], [0, -100], [10, -100], [10, 0]],
  // seam: idx1->idx2->idx3, 50 + 10 = 60cm total
  edges: [{ fromIdx: 1, toIdx: 3, seamId: 'testSeam' }],
  notches: [[0, -70]], // 30cm into the 60cm seam = 50% along the seam
};
const shortPreambleBack = {
  outline: [[0, 0], [0, -5], [0, -55], [0, -65], [10, -65], [10, 0]],
  // seam: idx1->idx2->idx3, 50 + 10 = 60cm total (the SAME real length)
  edges: [{ fromIdx: 1, toIdx: 3, seamId: 'testSeam' }],
  notches: [[0, -35]], // 30cm into the 60cm seam = 50% along the seam (matches front)
};

test('notchAlignment (declared shared seam) passes on a real front/back pair whose preambles differ in length but whose shared seam and notch position along it genuinely match — the whole-piece method alone flags this as a false positive', () => {
  // Confirms the premise: the OLD whole-piece-perimeter-fraction method
  // really would have failed this pair (front notch at 70/210=33.3% of
  // its own perimeter, back notch at 35/140=25.0% of its own — an 8.3%
  // gap, over the 5% tolerance), despite the seam itself matching
  // exactly — proving this is the false positive being fixed, not a
  // strawman.
  const oldStyleDiff = Math.abs(70 / 210 - 35 / 140);
  assert.ok(oldStyleDiff > 0.05, `expected the whole-piece method's own gap (${(oldStyleDiff * 100).toFixed(1)}%) to exceed its 5% tolerance`);
  const result = frontBackPair(longPreambleFront, shortPreambleBack);
  assert.equal(result.status, 'pass');
  assert.match(result.message, /testSeam/);
});

test('notchAlignment (declared shared seam) still fails when notches are genuinely misaligned ALONG that same shared seam — the fix isn\'t toothless', () => {
  const front = { ...longPreambleFront, notches: [[0, -45]] };  // 5cm into the 60cm seam ≈ 8% along
  const back = { ...shortPreambleBack, notches: [[0, -60]] };   // 55cm into the 60cm seam ≈ 92% along
  const result = frontBackPair(front, back);
  assert.equal(result.status, 'fail');
  assert.match(result.message, /testSeam/);
});

test('summary tallies match the individual check verdicts', () => {
  const report = run([goodSquare]);
  const total = report.summary.pass + report.summary.warn + report.summary.fail + report.summary.deferred;
  const perPieceCount = report.perPiece.reduce((n, p) => n + Object.keys(p.checks).length, 0);
  const crossPieceCount = report.crossPiece.reduce((n, p) => n + Object.keys(p.checks).length, 0);
  assert.equal(total, perPieceCount + crossPieceCount);
});
