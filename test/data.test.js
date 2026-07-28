import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMeasurements, BASE, SIZE_STEP, GRADE, SIZES } from '../js/data.js';

test('computeMeasurements at size M returns the base body unchanged (before ease/standard rounding)', () => {
  const m = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  // intl standard has ease:1.00 and zero offsets, so M should equal BASE.women almost exactly
  assert.equal(m.height, BASE.women.height);
  assert.equal(m.shoulder, BASE.women.shoulder);
});

test('grading scales chest/waist/hips by GRADE * step across a size range', () => {
  const m = computeMeasurements({ category: 'women', size: 'XXXL', standard: 'intl' });
  const step = SIZE_STEP['XXXL'];
  const expectedChest = +((BASE.women.chest + GRADE.chest * step) * 1.0).toFixed(1);
  assert.equal(m.chest, expectedChest);
  assert.ok(m.chest > BASE.women.chest, 'XXXL chest should be larger than the base M chest');
});

test('kids mode overrides the block by height ratio and resets grading step to 0', () => {
  const m = computeMeasurements({ category: 'girls', size: 'XXL', standard: 'intl', kids: '6-7' });
  // kids height should match the declared age-bracket height, not the base girls height
  assert.equal(m.height, 122);
});

test('custom overrides win over computed values', () => {
  const m = computeMeasurements({ category: 'women', size: 'M', standard: 'intl', custom: { chest: 999 } });
  assert.equal(m.chest, 999);
});

test('SIZES and SIZE_STEP stay consistent (M is always step 0)', () => {
  assert.equal(SIZES[3], 'M');
  assert.equal(SIZE_STEP['M'], 0);
});
