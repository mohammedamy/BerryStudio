import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  polygonArea, polygonBounds, translatePoly, rotatePoly, polygonsOverlap, runNesting,
} from '../js/nesting-core.js';

// BerryStudio-Upgrade-Plan WP-11: fixed test shapes covering the three
// cases the acceptance criteria call out — a plain rectangle, an L-shape
// (concave — exercises polygonsOverlap's edge-crossing path, not just
// bbox math), and a circle-approximation polygon (many vertices, tests
// the placement search doesn't choke on vertex count).
const RECT = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
const L_SHAPE = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
function circlePoly(r, n = 24) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [r + r * Math.cos(a), r + r * Math.sin(a)];
  });
}

function assertNoOverlaps(result) {
  const polys = result.placements.map((p) => p.poly);
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      assert.equal(polygonsOverlap(polys[i], polys[j]), false, `piece ${i} overlaps piece ${j}`);
    }
  }
}

test('polygonArea computes a plain rectangle correctly', () => {
  assert.equal(polygonArea(RECT(10, 4)), 40);
});

test('polygonBounds finds the correct bounding box', () => {
  const b = polygonBounds(L_SHAPE);
  assert.equal(b.w, 10);
  assert.equal(b.h, 10);
});

test('translatePoly and rotatePoly are pure and reversible', () => {
  const moved = translatePoly(RECT(5, 5), 3, -2);
  assert.deepEqual(moved[0], [3, -2]);
  const spun = rotatePoly(RECT(4, 0 /* degenerate on purpose */), 90);
  assert.ok(Math.abs(spun[1][1] - 4) < 1e-9); // (4,0) rotated 90° -> (~0,4)
});

test('polygonsOverlap detects a real intersection and a clean separation', () => {
  assert.equal(polygonsOverlap(RECT(10, 10), translatePoly(RECT(10, 10), 5, 5)), true);
  assert.equal(polygonsOverlap(RECT(10, 10), translatePoly(RECT(10, 10), 20, 0)), false);
});

test('polygonsOverlap detects full containment (no crossing edges)', () => {
  assert.equal(polygonsOverlap(RECT(10, 10), translatePoly(RECT(2, 2), 4, 4)), true);
});

// WP-11 acceptance: "feed a small fixed set of test shapes ... through the
// worker/algorithm, assert zero overlaps in the returned placement and a
// reported utilization percentage."
test('runNesting places rectangle + L-shape + circle with zero overlaps and reports utilization', () => {
  const pieces = [
    { id: 'rect', outline: RECT(20, 8) },
    { id: 'lshape', outline: L_SHAPE },
    { id: 'circle', outline: circlePoly(6) },
  ];
  const result = runNesting({ pieces, matWidth: 60, allowRotate: true, minDistCm: 0.5, maxIterations: 60 });
  assert.equal(result.placements.length, 3);
  assertNoOverlaps(result);
  assert.ok(result.utilization > 0 && result.utilization <= 1, `utilization ${result.utilization} out of (0,1]`);
  assert.ok(result.totalHeight > 0);
});

test('runNesting never rotates a grain-locked piece to 90 or 270 degrees', () => {
  const pieces = [
    { id: 'a', outline: RECT(8, 20), grainLocked: true },
    { id: 'b', outline: RECT(8, 20), grainLocked: true },
    { id: 'c', outline: RECT(6, 6) }, // free to rotate, control case
  ];
  const result = runNesting({ pieces, matWidth: 30, allowRotate: true, minDistCm: 0.2, maxIterations: 80 });
  const byId = Object.fromEntries(result.placements.map((p) => [p.id, p.rotationDeg]));
  assert.ok([0, 180].includes(byId.a));
  assert.ok([0, 180].includes(byId.b));
  assertNoOverlaps(result);
});

test('runNesting reports an error rather than mis-fitting a too-wide piece', () => {
  const pieces = [{ id: 'huge', outline: RECT(500, 10) }];
  const result = runNesting({ pieces, matWidth: 60, allowRotate: false, minDistCm: 0 });
  assert.ok(result.error, 'expected an explicit error for a piece wider than the fabric at its only allowed rotation');
  assert.equal(result.placements.length, 0);
});

test('runNesting honors cancellation and still returns the best result found so far', () => {
  const pieces = [{ id: 'a', outline: RECT(10, 10) }, { id: 'b', outline: RECT(8, 12) }];
  let calls = 0;
  const result = runNesting({
    pieces, matWidth: 40, allowRotate: true, maxIterations: 1000,
    isCancelled: () => ++calls > 3,
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.placements.length, 2);
  assertNoOverlaps(result);
});

test('runNesting on many pieces of a real garment-scale piece count stays overlap-free', () => {
  // 8 pieces, mixed rectangle/L-shapes — a rough stand-in for a real
  // garment's piece count (front/back/sleeves/collar/cuffs/pockets).
  const pieces = [
    { id: 'p1', outline: RECT(30, 45) },
    { id: 'p2', outline: RECT(30, 45) },
    { id: 'p3', outline: RECT(18, 55), grainLocked: true },
    { id: 'p4', outline: RECT(18, 55), grainLocked: true },
    { id: 'p5', outline: L_SHAPE.map(([x, y]) => [x * 2, y * 2]) },
    { id: 'p6', outline: L_SHAPE.map(([x, y]) => [x * 2, y * 2]) },
    { id: 'p7', outline: RECT(8, 8) },
    { id: 'p8', outline: circlePoly(5) },
  ];
  const result = runNesting({ pieces, matWidth: 150, allowRotate: true, minDistCm: 0.3, maxIterations: 150 });
  assert.equal(result.placements.length, 8);
  assertNoOverlaps(result);
  assert.ok(result.utilization > 0);
});
