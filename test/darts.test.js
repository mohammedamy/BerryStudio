import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dartIntakeAngle, pivotDart, transferDart, slashAndSpread } from '../js/darts.js';

// [apex, legA, legC] — matches the real convention in js/data.js/js/ai.js
// (apex at index 0), not the wrong apex-at-1 assumption an earlier
// WP-12 test fixture made.
const DART = [[10, 5], [8, 10], [12, 10]];

test('dartIntakeAngle measures the real angle at the apex between the two legs', () => {
  // apex->legA = (-2,5), apex->legC = (2,5); acos((25-4)/29) ≈ 43.6°.
  const angle = dartIntakeAngle(DART);
  const expected = Math.acos(21 / 29);
  assert.ok(Math.abs(angle - expected) < 1e-9, `expected ~${(expected * 180 / Math.PI).toFixed(2)}°, got ${(angle * 180 / Math.PI).toFixed(2)}°`);
});

test('pivotDart rotates both legs around the apex, preserving leg lengths and intake', () => {
  const before = dartIntakeAngle(DART);
  const legLenBefore = Math.hypot(DART[1][0] - DART[0][0], DART[1][1] - DART[0][1]);
  const rotated = pivotDart(DART, Math.PI / 4);
  assert.deepEqual(rotated[0], DART[0], 'apex must not move');
  const legLenAfter = Math.hypot(rotated[1][0] - rotated[0][0], rotated[1][1] - rotated[0][1]);
  assert.ok(Math.abs(legLenAfter - legLenBefore) < 1e-9, 'leg length must be preserved');
  assert.ok(Math.abs(dartIntakeAngle(rotated) - before) < 1e-9, 'intake angle must be preserved');
  // and it must have actually moved (not a no-op)
  assert.ok(Math.hypot(rotated[1][0] - DART[1][0], rotated[1][1] - DART[1][1]) > 0.1);
});

test('transferDart rotates the whole dart (apex included) around an external pivot, preserving shape', () => {
  const pivot = [10, 30]; // e.g. a fixed bust-point reference elsewhere on the piece
  const before = dartIntakeAngle(DART);
  const legLenBefore = Math.hypot(DART[2][0] - DART[0][0], DART[2][1] - DART[0][1]);
  const moved = transferDart(DART, pivot, Math.PI / 6);
  // apex DOES move this time — it's rotated around the external pivot too
  assert.ok(Math.hypot(moved[0][0] - DART[0][0], moved[0][1] - DART[0][1]) > 0.1);
  const legLenAfter = Math.hypot(moved[2][0] - moved[0][0], moved[2][1] - moved[0][1]);
  assert.ok(Math.abs(legLenAfter - legLenBefore) < 1e-9, 'leg length must be preserved after transfer');
  assert.ok(Math.abs(dartIntakeAngle(moved) - before) < 1e-9, 'intake angle must be preserved after transfer');
});

test('transferDart with angleRad=0 is a pure translation matching the pivot-to-apex offset', () => {
  // A zero-rotation "transfer" is really just moving the dart to a new
  // apex location without changing its orientation — a degenerate but
  // valid case worth locking down.
  const moved = transferDart(DART, DART[0], 0);
  assert.deepEqual(moved, DART);
});

test('slashAndSpread widens the leg-to-leg distance by exactly spreadCm, keeps the apex fixed', () => {
  const before = Math.hypot(DART[2][0] - DART[1][0], DART[2][1] - DART[1][1]);
  const spread = slashAndSpread(DART, 4);
  assert.deepEqual(spread[0], DART[0], 'apex must stay fixed');
  const after = Math.hypot(spread[2][0] - spread[1][0], spread[2][1] - spread[1][1]);
  assert.ok(Math.abs(after - before - 4) < 1e-9, `expected the base to widen by exactly 4cm, got ${(after - before).toFixed(3)}`);
});

test('slashAndSpread increases intake (unlike pivot/transfer, which preserve it)', () => {
  const before = dartIntakeAngle(DART);
  const spread = slashAndSpread(DART, 6);
  assert.ok(dartIntakeAngle(spread) > before, 'spreading the dart base should open up the apex angle');
});

test('slashAndSpread(dart, 0) is a no-op', () => {
  assert.deepEqual(slashAndSpread(DART, 0), DART);
});
