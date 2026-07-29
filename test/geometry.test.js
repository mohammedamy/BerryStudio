import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offsetPoly, seamPointAtFraction } from '../js/geometry.js';

// Winding order matters for signed-area-based orientation detection —
// this square has positive shoelace area, matching every real pattern
// piece in js/data.js (e.g. front_bodice), so a positive `d` here means
// the same thing it means for a real garment: expand outward.
const SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]];

function isConvex(poly) {
  const n = poly.length;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], c = poly[(i + 2) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

test('offsetPoly(poly, d) with no options reproduces the original single-distance miter behavior', () => {
  const out = offsetPoly(SQUARE, 2);
  assert.equal(out.length, 4); // vertex-preserving, no join expansion
  // a square offset outward by 2 on every side is simply expanded by 2 in each direction
  const xs = out.map(p => p[0]), ys = out.map(p => p[1]);
  assert.ok(Math.min(...xs) < 0 && Math.max(...xs) > 10);
  assert.ok(Math.min(...ys) < 0 && Math.max(...ys) > 10);
});

test('offsetPoly miter join on a convex square stays a valid, non-self-crossing convex quad', () => {
  const out = offsetPoly(SQUARE, 2, { join: 'miter' });
  assert.equal(out.length, 4);
  assert.ok(isConvex(out), 'miter-offset square must stay convex');
});

test('offsetPoly bevel join chamfers each convex corner (more points than input)', () => {
  const out = offsetPoly(SQUARE, 2, { join: 'bevel' });
  // every one of the 4 convex corners becomes 2 points instead of 1
  assert.equal(out.length, 8);
  assert.ok(isConvex(out), 'bevel-offset square must stay convex');
});

test('offsetPoly round join fillets each convex corner with multiple arc points', () => {
  const out = offsetPoly(SQUARE, 2, { join: 'round' });
  assert.ok(out.length > 8, `expected more than 8 points from 4 filleted corners, got ${out.length}`);
  assert.ok(isConvex(out), 'round-offset square must stay convex');
  // every arc point must sit at exactly distance `d` from its own corner —
  // spot-check the first corner's fillet points.
  const cornerDist = Math.hypot(out[0][0] - 0, out[0][1] - 0);
  assert.ok(Math.abs(cornerDist - 2) < 1e-6);
});

test('offsetPoly perEdge gives one edge a larger allowance than the others', () => {
  // Edge 0 = bottom (0,0)->(10,0); give it a much bigger allowance.
  const out = offsetPoly(SQUARE, 1, { perEdge: [5, 1, 1, 1], join: 'bevel' });
  const ys = out.map(p => p[1]);
  // the bottom edge (originally y=0) should now sit at y=-5, far past the
  // uniform-1 offset (-1) the other three edges would produce.
  assert.ok(Math.min(...ys) <= -4.9, `expected the perEdge-boosted bottom to reach ~-5, min y was ${Math.min(...ys)}`);
});

function segmentsIntersect(a, b, c, d) {
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function hasSelfIntersection(poly) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || j === (i + 1) % n || i === (j + 1) % n) continue;
      if (segmentsIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}

test('offsetPoly on a concave (L-shaped) polygon does not self-intersect, round join fillets the 5 convex corners', () => {
  // An L-shape; (5,5) is the single reflex vertex, the other 5 are convex.
  const L_SHAPE = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]];
  const out = offsetPoly(L_SHAPE, 1, { join: 'round' });
  assert.ok(out.length > L_SHAPE.length, 'round join at 5 convex corners should add points beyond the 6 input vertices');
  assert.ok(!hasSelfIntersection(out), 'offset L-shape must not self-intersect at the reflex vertex');
});

// straight edge, 3 points, 5cm per segment -> 10cm total
const STRAIGHT = [[0, 0], [5, 0], [10, 0]];

test('seamPointAtFraction(0) and (1) return the exact endpoints', () => {
  assert.deepEqual(seamPointAtFraction(STRAIGHT, 0, 2, 0), [0, 0]);
  assert.deepEqual(seamPointAtFraction(STRAIGHT, 0, 2, 1), [10, 0]);
});

test('seamPointAtFraction(0.5) lands at the midpoint by arc length', () => {
  assert.deepEqual(seamPointAtFraction(STRAIGHT, 0, 2, 0.5), [5, 0]);
});

test('seamPointAtFraction interpolates within a segment, not just at vertices', () => {
  // 0.25 of 10cm = 2.5cm along the first 5cm segment
  assert.deepEqual(seamPointAtFraction(STRAIGHT, 0, 2, 0.25), [2.5, 0]);
});

test('seamPointAtFraction handles wraparound (toIdx < fromIdx) the same way edges[].seamId ranges do', () => {
  // A 4-point square; walking from index 3 back to index 1 wraps through index 0.
  const SQ = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const pt = seamPointAtFraction(SQ, 3, 1, 0); // fraction 0 -> exactly the start point
  assert.deepEqual(pt, [0, 10]);
});

test('seamPointAtFraction on a two-piece seam pair tracks the same fraction on both sides', () => {
  // Two edges of different length/shape sharing a declared seamId — this
  // is exactly the real "walk the seam" use case: dragging to 0.5 on one
  // edge should give a point 50% along the OTHER edge's own arc length,
  // not the same absolute distance.
  const edgeA = [[0, 0], [4, 0], [8, 0]]; // 8cm straight
  const edgeB = [[0, 0], [3, 4], [6, 8]]; // 10cm straight (3-4-5 triangle x2)
  const midA = seamPointAtFraction(edgeA, 0, 2, 0.5);
  const midB = seamPointAtFraction(edgeB, 0, 2, 0.5);
  assert.deepEqual(midA, [4, 0]);
  assert.deepEqual(midB, [3, 4]);
});
