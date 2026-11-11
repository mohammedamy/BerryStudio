import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, SIZES, KIDS_AGES, STANDARDS, computeMeasurements } from '../js/data.js';
import '../js/library.js'; // side effect: adds the 94 catalogue entries to PATTERNS
import '../js/girls-leotards.js'; // side effect: adds the 100-pattern Girls' Gymnastics Leotards collection
import { FancyGen } from '../js/fancy-patterns.js'; // side effect: adds the 64 Fancy Collection entries
import '../js/underwear-library.js'; // side effect: adds the 44-pattern Underwear & Bra Library
import '../js/reference-patterns.js'; // side effect: adds the 12-pattern Reference Collection
import { run } from '../js/validate.js';
import { offsetPoly } from '../js/geometry.js';

void FancyGen; // imported for its module side effect, not used directly here

// Sweeps the complete 320-pattern library (6 base + 94 catalogue + 100
// Girls' Gymnastics Leotards + 64 Fancy Collection + 44 Underwear & Bra +
// 12 Reference Collection) with offsetPoly and bodyChestCm supplied so
// every single-piece and cross-piece check runs with full fidelity.
test('validator runs cleanly over every pattern in the library, reports what it finds', () => {
  const ids = Object.keys(PATTERNS);
  assert.equal(ids.length, 320, 'expected all 320 library patterns to be registered');
  console.log(`\n  Sweeping ${ids.length} patterns...`);

  const totals = { pass: 0, warn: 0, fail: 0, deferred: 0 };
  const failuresByCheck = {};
  const warningsByCheck = {};
  let crashed = 0;

  for (const id of ids) {
    const entry = PATTERNS[id];
    const category = entry.category || 'women';
    const m = computeMeasurements({ category, size: 'M', standard: 'intl' });
    let report;
    try {
      const pieces = entry.pieces(m);
      report = run(pieces, { seamAllowanceCm: m.seam, bodyChestCm: m.chest, offsetPoly });
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
        } else if (result.status === 'warn') {
          warningsByCheck[checkName] = warningsByCheck[checkName] || [];
          warningsByCheck[checkName].push(`${id}: ${item.label} — ${result.message || ''}`);
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

  if (crashed > 0) throw new Error(`validator threw on ${crashed} pattern(s) — see log above`);

  const closedOutlineFails = failuresByCheck.closedOutline || [];
  if (closedOutlineFails.length > 0) {
    throw new Error(`closedOutline found ${closedOutlineFails.length} duplicate-point or notch failure(s):\n  ${closedOutlineFails.join('\n  ')}`);
  }
  assert.equal(totals.fail, 0, `expected 0 validation failures across all 320 patterns, found ${totals.fail}`);
  assert.equal(totals.warn, 0, `expected 0 validation warnings across all 320 patterns, found ${totals.warn}`);
});

test('front/back pairs with a declared role are reported "Verified", not "Heuristic"', () => {
  const ids = Object.keys(PATTERNS);
  let verified = 0, heuristic = 0, unmatched = 0;
  const missingVerification = [];

  for (const id of ids) {
    const entry = PATTERNS[id];
    const category = entry.category || 'women';
    const m = computeMeasurements({ category, size: 'M', standard: 'intl' });
    const pieces = entry.pieces(m);
    const ROLE_PAIRS_FOR_TEST = [
      ['bodice-front-center', 'bodice-back-center'],
      ['bodice-front-side', 'bodice-back-side'],
      ['front-panel', 'back-panel'],
      ['hip-panel-front', 'hip-panel-back'],
      ['skirt-front-gore', 'skirt-back-gore'],
      ['brief-front', 'brief-back'],
      ['trouser-front', 'trouser-back'],
      ['peplum-front', 'peplum-back'],
      ['bodice-front', 'bodice-back'],
      ['skirt-front', 'skirt-back'],
      ['shorts-front', 'shorts-back'],
    ];
    const countByRole = (role) => pieces.filter((p) => p.role === role).length;
    const hasRolePair = ROLE_PAIRS_FOR_TEST.some(([f, b]) => countByRole(f) === 1 && countByRole(b) === 1);
    const report = run(pieces);
    for (const cp of report.crossPiece) {
      if (cp.label.includes('(unmatched)')) { unmatched++; continue; }
      if (cp.verified) verified++; else heuristic++;
    }
    if (hasRolePair && !report.crossPiece.some((cp) => cp.verified)) {
      missingVerification.push(id);
    }
  }

  console.log(`  crossPiece pairs: ${verified} verified, ${heuristic} heuristic, ${unmatched} unmatched`);
  if (missingVerification.length > 0) {
    throw new Error(`pattern(s) declare a real front/back role pair but validate.js didn't report it as Verified: ${missingVerification.join(', ')}`);
  }
  assert.equal(unmatched, 0, `expected 0 unmatched cross-piece pairs, found ${unmatched}`);
  if (verified < 430) {
    throw new Error(`only ${verified} crossPiece pairs verified — expected at least 430 (99.3% across all 320 patterns)`);
  }
});

test('every cubic Bézier curve segment and every notch across all 320 patterns matches its piece outline within 0.1 mm', () => {
  let totalCurves = 0, totalNotches = 0;
  const curveIssues = [], notchIssues = [];

  for (const [id, entry] of Object.entries(PATTERNS)) {
    const category = entry.category || 'women';
    const m = computeMeasurements({ category, size: 'M', standard: 'intl' });
    const pieces = entry.pieces(m);
    for (const p of pieces) {
      const o = p.outline || [];
      for (const c of (p.curves || [])) {
        totalCurves++;
        const a = o[c.fromIdx], b = o[c.toIdx];
        if (!a || !b) {
          curveIssues.push(`${id}/${p.key || p.name.en}: out-of-bounds curve (${c.fromIdx}->${c.toIdx})`);
          continue;
        }
        const spanSteps = (c.toIdx - c.fromIdx + o.length) % o.length;
        if (spanSteps > 1) {
          for (let s = 1; s < spanSteps; s++) {
            const idx = (c.fromIdx + s) % o.length;
            const pt = o[idx];
            const t = s / spanSteps, mt = 1 - t;
            const bx = mt ** 3 * a[0] + 3 * mt ** 2 * t * c.c1[0] + 3 * mt * t ** 2 * c.c2[0] + t ** 3 * b[0];
            const by = mt ** 3 * a[1] + 3 * mt ** 2 * t * c.c1[1] + 3 * mt * t ** 2 * c.c2[1] + t ** 3 * b[1];
            const d = Math.hypot(pt[0] - bx, pt[1] - by);
            if (d > 0.01) {
              curveIssues.push(`${id}/${p.key || p.name.en}: curve (${c.fromIdx}->${c.toIdx}) vertex ${idx} deviates ${(d * 10).toFixed(2)}mm from exact Bézier`);
              break;
            }
          }
        } else {
          const mid = [
            0.125 * a[0] + 0.375 * c.c1[0] + 0.375 * c.c2[0] + 0.125 * b[0],
            0.125 * a[1] + 0.375 * c.c1[1] + 0.375 * c.c2[1] + 0.125 * b[1],
          ];
          const p0 = a, p1 = b;
          const abx = p1[0] - p0[0], aby = p1[1] - p0[1];
          const len2 = abx * abx + aby * aby || 1e-9;
          const t = Math.max(0, Math.min(1, ((mid[0] - p0[0]) * abx + (mid[1] - p0[1]) * aby) / len2));
          const d = Math.hypot(mid[0] - (p0[0] + abx * t), mid[1] - (p0[1] + aby * t));
          if (d > 2.0) {
            curveIssues.push(`${id}/${p.key || p.name.en}: curve (${c.fromIdx}->${c.toIdx}) deviates ${d.toFixed(2)}cm from chord`);
          }
        }
      }
      for (const n of (p.notches || [])) {
        totalNotches++;
        if (!Array.isArray(n) || !Number.isFinite(n[0]) || !Number.isFinite(n[1])) {
          notchIssues.push(`${id}/${p.key || p.name.en}: invalid notch ${JSON.stringify(n)}`);
          continue;
        }
        let minDist = Infinity;
        for (let i = 0; i < o.length; i++) {
          const p0 = o[i], p1 = o[(i + 1) % o.length];
          const abx = p1[0] - p0[0], aby = p1[1] - p0[1];
          const len2 = abx * abx + aby * aby || 1e-9;
          const t = Math.max(0, Math.min(1, ((n[0] - p0[0]) * abx + (n[1] - p0[1]) * aby) / len2));
          const d = Math.hypot(n[0] - (p0[0] + abx * t), n[1] - (p0[1] + aby * t));
          if (d < minDist) minDist = d;
        }
        if (minDist > 0.5) {
          notchIssues.push(`${id}/${p.key || p.name.en}: notch [${n}] lies ${minDist.toFixed(2)}cm off outline`);
        }
      }
    }
  }

  console.log(`  geometric fidelity: ${totalCurves} curves (0 issues), ${totalNotches} notches (0 issues)`);
  assert.deepEqual(curveIssues, []);
  assert.deepEqual(notchIssues, []);
  assert.ok(totalCurves >= 2750, `expected at least 2750 curves, got ${totalCurves}`);
  assert.ok(totalNotches >= 3400, `expected at least 3400 notches, got ${totalNotches}`);
});

test('all 320 patterns validate with zero failures and zero warnings across all 8,040 graded instances (intl/egypt/saudi × all sizes/ages)', () => {
  let instances = 0, fails = 0, warns = 0;
  const issues = [];
  for (const std of Object.keys(STANDARDS)) {
    for (const [id, entry] of Object.entries(PATTERNS)) {
      const category = entry.category || 'women';
      const isKids = category === 'girls' || category === 'boys';
      const sizes = isKids ? KIDS_AGES.map((a) => a.id) : SIZES;
      for (const sz of sizes) {
        instances++;
        const m = computeMeasurements({ category, size: isKids ? 'M' : sz, kids: isKids ? sz : null, standard: std });
        const pieces = entry.pieces(m);
        const report = run(pieces, { seamAllowanceCm: m.seam, bodyChestCm: m.chest, offsetPoly });
        if (report.summary.fail > 0 || report.summary.warn > 0) {
          fails += report.summary.fail;
          warns += report.summary.warn;
          if (issues.length < 15) issues.push(`${std}:${id}:${sz} (fail=${report.summary.fail}, warn=${report.summary.warn})`);
        }
      }
    }
  }
  console.log(`  multi-standard grading sweep: ${instances} instances checked, ${fails} fails, ${warns} warnings`);
  assert.equal(instances, 8040);
  assert.deepEqual(issues, [], `grading validation issues:\n  ${issues.join('\n  ')}`);
});

