import { test } from 'node:test';
import { PATTERNS, computeMeasurements } from '../js/data.js';
import '../js/library.js'; // side effect: adds the 94 catalogue entries to PATTERNS
import '../js/girls-leotards.js'; // side effect: adds the 100-pattern Girls' Gymnastics Leotards collection
import { FancyGen } from '../js/fancy-patterns.js'; // side effect: adds the 24 Fancy Collection entries
import { run } from '../js/validate.js';

void FancyGen; // imported for its module side effect, not used directly here

// Delivers BerryStudio-Upgrade-Plan WP-0.4's own promise: "run the
// validator over the whole library ... will find real bugs immediately."
// This is a real Node test (not a browser dev harness) precisely because
// WP-0.1's ES-module conversion made PATTERNS/computeMeasurements
// genuinely importable — no zero-side-effect way to do this existed
// before that. Deliberately does NOT assert every pattern passes every
// check — several checks are explicitly heuristic or deferred (see
// js/validate.js's own module comment) — it asserts the run completes
// without throwing across all 224 patterns (100 from data.js+library.js
// + 100 Girls' Gymnastics Leotards + 24 Fancy Collection) and prints an
// honest summary of what it found. It DID find real things on the first
// run — see README.md's Honest notes for WP-0.4 rather than treating a
// clean run as the bar to hit.
test('validator runs cleanly over every pattern in the library, reports what it finds', () => {
  const ids = Object.keys(PATTERNS);
  console.log(`\n  Sweeping ${ids.length} patterns...`);

  const totals = { pass: 0, warn: 0, fail: 0, deferred: 0 };
  const failuresByCheck = {};
  let crashed = 0;

  for (const id of ids) {
    const entry = PATTERNS[id];
    const category = entry.category || 'women';
    const m = computeMeasurements({ category, size: 'M', standard: 'intl' });
    let report;
    try {
      const pieces = entry.pieces(m);
      report = run(pieces);
    } catch (e) {
      crashed++;
      console.log(`  ✖ ${id} threw: ${e.message}`);
      continue;
    }
    for (const k in totals) totals[k] += report.summary[k] || 0;
    const collect = (items) => items.forEach((item) => {
      Object.entries(item.checks).forEach(([checkName, result]) => {
        if (result.status === 'fail') {
          failuresByCheck[checkName] = failuresByCheck[checkName] || [];
          failuresByCheck[checkName].push(`${id}: ${item.label} — ${result.message || ''}`);
        }
      });
    });
    collect(report.perPiece);
    collect(report.crossPiece);
  }

  console.log(`  Totals across ${ids.length} patterns:`, totals);
  for (const [check, fails] of Object.entries(failuresByCheck)) {
    console.log(`  ${check}: ${fails.length} failure(s)`);
    for (const f of fails.slice(0, 10)) console.log(`    - ${f}`);
    if (fails.length > 10) console.log(`    ...and ${fails.length - 10} more`);
  }

  // The only hard assertion: the validator itself must never crash on any
  // real, currently-shipping pattern. Whether individual checks pass or
  // fail is reported above, not asserted away — that's the actual
  // deliverable here, not a green checkmark.
  if (crashed > 0) throw new Error(`validator threw on ${crashed} pattern(s) — see log above`);

  // WP-26: this sweep's first full pass over the library found a real,
  // reproducible defect — 67 Fancy Collection piece instances (30+ unique
  // designs) with a duplicate consecutive outline point, all traced to a
  // bezier-sampling boundary condition in js/fancy-patterns.js (a curve's
  // sampled endpoint re-landing on a point already in the outline — either
  // the next segment's own start, or the shape's own [0,0] origin when a
  // closing curve sweeps back to it). Fixed at the source (godetPc, capePc,
  // peplumPc, princessBodice's neckline/princess-curve join) via the
  // dedupeJoin/dedupeClose helpers. Asserted here, per WP-26's acceptance
  // criteria, so this exact class of bug can never silently regress.
  const closedOutlineFails = failuresByCheck.closedOutline || [];
  if (closedOutlineFails.length > 0) {
    throw new Error(`closedOutline found ${closedOutlineFails.length} duplicate-point failure(s) — regression of WP-26:\n  ${closedOutlineFails.join('\n  ')}`);
  }
});
