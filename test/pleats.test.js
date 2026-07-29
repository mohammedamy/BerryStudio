import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePleats, computeGatherWidth, computeTucks } from '../js/pleats.js';

test('computePleats adds exactly 2x depth per pleat (fold consumes fabric on both sides)', () => {
  const { addedWidthCm, pleats } = computePleats(60, 4, 2.5);
  assert.equal(addedWidthCm, 4 * 2.5 * 2);
  assert.equal(pleats.length, 4);
});

test('computePleats spaces pleats evenly along the edge, inset from both ends', () => {
  const { pleats } = computePleats(60, 3, 2);
  const positions = pleats.map(p => p.positionOnEdge);
  // 3 pleats -> centers at 1/6, 3/6, 5/6
  assert.deepEqual(positions, [1/6, 3/6, 5/6]);
  positions.forEach(p => { assert.ok(p > 0 && p < 1, 'every pleat must sit strictly inside the edge'); });
});

test('computePleats alternates fold direction', () => {
  const { pleats } = computePleats(60, 4, 2);
  assert.deepEqual(pleats.map(p => p.direction), ['left', 'right', 'left', 'right']);
});

test('computePleats(w, 0, d) and computePleats(w, n, 0) are both no-ops', () => {
  assert.deepEqual(computePleats(60, 0, 2), { addedWidthCm: 0, pleats: [] });
  assert.deepEqual(computePleats(60, 3, 0), { addedWidthCm: 0, pleats: [] });
});

test('computeGatherWidth scales up the raw width by the gather ratio', () => {
  assert.equal(computeGatherWidth(10, 1.5), 15);
  assert.equal(computeGatherWidth(20, 2), 40);
});

test('computeGatherWidth with ratio <= 1 returns the finished width unchanged (no gather)', () => {
  assert.equal(computeGatherWidth(10, 1), 10);
  assert.equal(computeGatherWidth(10, 0.8), 10);
});

test('computeTucks shares computePleats\' width math', () => {
  assert.deepEqual(computeTucks(60, 3, 1.5), computePleats(60, 3, 1.5));
});
