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

test('a sleeve piece is excluded from front/back pairing entirely', () => {
  const sleeve = { name: { en: 'Set-in Sleeve' }, outline: goodSquare.outline, grain: goodSquare.grain, notches: [] };
  const report = run([sleeve]);
  assert.equal(report.crossPiece.length, 0);
});

test('ease is always reported as deferred, never guessed', () => {
  const report = run([goodSquare]);
  assert.equal(report.ease.status, 'deferred');
});

test('summary tallies match the individual check verdicts', () => {
  const report = run([goodSquare]);
  const total = report.summary.pass + report.summary.warn + report.summary.fail + report.summary.deferred;
  const perPieceCount = report.perPiece.reduce((n, p) => n + Object.keys(p.checks).length, 0);
  const crossPieceCount = report.crossPiece.reduce((n, p) => n + Object.keys(p.checks).length, 0);
  assert.equal(total, perPieceCount + crossPieceCount + 1); // +1 for ease
});
