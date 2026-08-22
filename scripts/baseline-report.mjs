// Dev-only diagnostic. Phase 0 of docs/plan 4.md (Professional Pattern
// Library Rebuild): reproduces the plan's §5 baseline numbers against the
// library exactly as it ships today, with NO behaviour change to the
// library or to js/validate.js itself.
//
// Unlike test/validate-library.test.js (which calls `run(pieces)` with no
// ctx — bodyChestCm undefined, offsetPoly undefined — so `ease` mostly
// reports "not applicable" and `seamAllowance` always warns as a harness
// artifact), this script wires in the two pieces of real context the
// checks need to run for real:
//   - bodyChestCm: the same category's own BASE chest at size M, so `ease`
//     can actually compare a piece's implied chest against the body.
//   - offsetPoly: js/geometry.js's real polygon-offset (the same function
//     Canvas.offsetPoly wraps — see js/canvas.js's import), so
//     `seamAllowance` checks a real 1cm offset instead of warning "no
//     offsetPoly supplied" on every one of 1,867 pieces.
//
// Run with: node scripts/baseline-report.mjs
// Compare the output against docs/plan 4.md §5 before changing anything.
import { PATTERNS, BASE, computeMeasurements } from '../js/data.js';
import '../js/library.js';
import '../js/girls-leotards.js';
import { FancyGen } from '../js/fancy-patterns.js';
import { run } from '../js/validate.js';
import { offsetPoly } from '../js/geometry.js';

void FancyGen; // side-effect import only

const ids = Object.keys(PATTERNS);
const totals = { pass: 0, warn: 0, fail: 0, deferred: 0 };
const perCheck = {}; // checkName -> { pass, warn, fail, deferred }
const bump = (checkName, status) => {
  perCheck[checkName] = perCheck[checkName] || { pass: 0, warn: 0, fail: 0, deferred: 0 };
  perCheck[checkName][status] = (perCheck[checkName][status] || 0) + 1;
};

let pieceCount = 0;
let crashed = 0;
const pairing = { verified: 0, heuristic: 0, unmatched: 0 };

for (const id of ids) {
  const entry = PATTERNS[id];
  const category = entry.category || 'women';
  const m = computeMeasurements({ category, size: 'M', standard: 'intl' });
  const bodyChestCm = BASE[category] ? BASE[category].chest : undefined;

  let pieces;
  try {
    pieces = entry.pieces(m);
  } catch (e) {
    crashed++;
    console.log(`  ✖ ${id} threw: ${e.message}`);
    continue;
  }
  pieceCount += pieces.length;

  const report = run(pieces, { seamAllowanceCm: 1, offsetPoly, bodyChestCm });

  for (const k in totals) totals[k] += report.summary[k] || 0;

  const collect = (items) => items.forEach((item) => {
    Object.entries(item.checks).forEach(([checkName, result]) => bump(checkName, result.status));
  });
  collect(report.perPiece);
  collect(report.crossPiece);

  for (const cp of report.crossPiece) {
    if (cp.label.includes('(unmatched)')) pairing.unmatched++;
    else if (cp.verified) pairing.verified++;
    else pairing.heuristic++;
  }
}

console.log(`Baseline report — ${ids.length} patterns / ${pieceCount} pieces (Phase 0 of docs/plan 4.md)\n`);
console.log('Aggregate:', totals);
console.log('\nPer check:');
const order = ['closedOutline', 'selfIntersection', 'grainline', 'seamAllowance', 'foldSymmetry', 'ease', 'seamLengthParity', 'notchAlignment'];
for (const check of order) {
  const c = perCheck[check] || { pass: 0, warn: 0, fail: 0, deferred: 0 };
  console.log(`  ${check.padEnd(18)} pass ${c.pass}  warn ${c.warn}  fail ${c.fail}  deferred ${c.deferred}`);
}
console.log(`\nCross-piece pairing: ${pairing.verified} verified · ${pairing.heuristic} heuristic · ${pairing.unmatched} unmatched`);
if (crashed > 0) console.log(`\n${crashed} pattern(s) threw during pieces(m) or run() — see above`);
