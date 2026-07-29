import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepForSize, applyGradeRules, applyGradeRulesToPieces, resolveGradedPieces } from '../js/grading.js';

test('stepForSize matches SIZE_STEP for adult sizes, ignores kids', () => {
  assert.equal(stepForSize('M', null), 0);
  assert.equal(stepForSize('L', null), 1);
  assert.equal(stepForSize('S', null), -1);
  assert.equal(stepForSize('XXL', null), 3);
  // kids always forces step 0 regardless of the size string passed in
  assert.equal(stepForSize('L', '6-7'), 0);
});

const BASE_PIECE = { key: 'front', outline: [[0, 0], [10, 0], [10, 20], [0, 20]] };
// The "formula" piece at some target size — same shape, shifted by the
// uniform formula grade (as if GRADE had been applied to every point).
const FORMULA_PIECE = { key: 'front', outline: [[0, 0], [14, 0], [14, 26], [0, 26]] };

test('applyGradeRules leaves points without a rule on the formula path', () => {
  const rules = { 1: { dx: 3, dy: 0 } }; // only point index 1 gets a hand-authored rule
  const step = 2;
  const graded = applyGradeRules(BASE_PIECE, FORMULA_PIECE, rules, step);
  // point 1: base [10,0] + rule*step -> [10+3*2, 0+0*2] = [16,0]
  assert.deepEqual(graded.outline[1], [16, 0]);
  // every other point falls through to the formula's own value, untouched
  assert.deepEqual(graded.outline[0], FORMULA_PIECE.outline[0]);
  assert.deepEqual(graded.outline[2], FORMULA_PIECE.outline[2]);
  assert.deepEqual(graded.outline[3], FORMULA_PIECE.outline[3]);
});

test('applyGradeRules is a no-op with no rules or step 0', () => {
  assert.equal(applyGradeRules(BASE_PIECE, FORMULA_PIECE, null, 2), FORMULA_PIECE);
  assert.equal(applyGradeRules(BASE_PIECE, FORMULA_PIECE, { 0: { dx: 1, dy: 1 } }, 0), FORMULA_PIECE);
});

test('applyGradeRulesToPieces matches pieces by key and leaves unmatched pieces untouched', () => {
  const other = { key: 'back', outline: [[0, 0], [5, 0]] };
  const basePieces = [BASE_PIECE, other];
  const formulaPieces = [FORMULA_PIECE, { key: 'back', outline: [[0, 0], [7, 0]] }];
  const rulesByKey = { front: { 1: { dx: 5, dy: 0 } } }; // no rules authored for "back"
  const out = applyGradeRulesToPieces(basePieces, formulaPieces, rulesByKey, 2);
  assert.deepEqual(out[0].outline[1], [10 + 5 * 2, 0]); // front, point 1, graded
  assert.deepEqual(out[1], formulaPieces[1]); // back piece passed through unchanged
});

test('resolveGradedPieces falls back to the plain formula when no rules are authored', () => {
  const pattern = { pieces: (m) => [{ key: 'front', outline: [[0, 0], [m.chest, 0]] }] };
  const computeMeasurements = ({ size }) => ({ chest: size === 'M' ? 88 : 96 });
  const out = resolveGradedPieces(pattern, { category: 'women', size: 'L', standard: 'intl', kids: null, custom: null }, computeMeasurements, null);
  assert.deepEqual(out[0].outline[1], [96, 0]);
});

test('resolveGradedPieces overrides a ruled point with base + dx/dy*step, keeps unruled points on the formula', () => {
  const pattern = {
    pieces: (m) => [{ key: 'front', outline: [[0, 0], [m.chest, 0], [m.chest, m.waist]] }],
  };
  // size M -> chest 88/waist 70; size L (step 1) -> chest 92/waist 74 (made up deltas for the test)
  const computeMeasurements = ({ size }) => (size === 'M' ? { chest: 88, waist: 70 } : { chest: 92, waist: 74 });
  const gradeRulesByKey = { front: { 1: { dx: 10, dy: 0 } } }; // point 1 (the chest corner) hand-graded
  const out = resolveGradedPieces(pattern, { category: 'women', size: 'L', standard: 'intl', kids: null, custom: null }, computeMeasurements, gradeRulesByKey);
  // point 1: base [88,0] + rule(10,0)*step(1) = [98,0], NOT the formula's [92,0]
  assert.deepEqual(out[0].outline[1], [98, 0]);
  // point 2 has no rule -> stays on the formula's own value [92,74]
  assert.deepEqual(out[0].outline[2], [92, 74]);
  // point 0 has no rule either -> stays [0,0]
  assert.deepEqual(out[0].outline[0], [0, 0]);
});

test('resolveGradedPieces ignores authored rules entirely at size M (step 0) and in kids mode', () => {
  const pattern = { pieces: (m) => [{ key: 'front', outline: [[0, 0], [m.chest, 0]] }] };
  const computeMeasurements = ({ size, kids }) => (kids || size === 'M' ? { chest: 88 } : { chest: 96 });
  const gradeRulesByKey = { front: { 1: { dx: 999, dy: 999 } } };
  const atM = resolveGradedPieces(pattern, { category: 'women', size: 'M', standard: 'intl', kids: null, custom: null }, computeMeasurements, gradeRulesByKey);
  assert.deepEqual(atM[0].outline[1], [88, 0]); // no runaway 999 delta at the base size
  const kidsMode = resolveGradedPieces(pattern, { category: 'women', size: 'L', standard: 'intl', kids: '6-7', custom: null }, computeMeasurements, gradeRulesByKey);
  assert.deepEqual(kidsMode[0].outline[1], [88, 0]); // kids forces step 0 regardless of `size`
});
