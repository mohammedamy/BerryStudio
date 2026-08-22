import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, computeMeasurements } from '../js/data.js';
import '../js/library.js';
import '../js/girls-leotards.js';
import { FancyGen } from '../js/fancy-patterns.js';

void FancyGen; // side-effect import only

// docs/plan 4.md §8 gate 11 / Phase 1: "Every piece declares a role from
// the 46-value vocabulary. Zero reliance on classifyLegacy." That gate is
// a Phase 5 target, not a Phase 1 one — Phase 1 explicitly leaves library
// CONTENT unchanged (§9) — so this test does what Phase 1's own
// description asks for: assert the CURRENT numbers as a regression floor,
// and report the gap honestly (same convention test/validate-library.
// test.js already uses for the checks it doesn't assert clean), rather
// than silently loosening the vocabulary or guessing a role for a piece
// that doesn't declare one.
//
// This is the exact 46-value list from cloth-lab/src/pattern/roles.js /
// schema/pattern-spec.v1.json's live-piece equivalent (docs/plan 4.md
// §4.2) — kept as a literal copy, not an import, because cloth-lab is a
// separate build-based package the build-free root app cannot import from
// (same reasoning as js/pattern-flat.js's unfoldPiece). If this list and
// cloth-lab/src/pattern/roles.js's own vocabulary ever diverge, that's a
// real bug this test can't see — cloth-lab/src/pattern/roles.test.js is
// the source of truth on the cloth-lab side.
const ROLE_VOCABULARY = new Set([
  'front-panel', 'back-panel', 'hip-panel-front', 'hip-panel-back', 'sleeve',
  'brief-front', 'brief-back',
  'bodice-front-center', 'bodice-front-side', 'bodice-back-center', 'bodice-back-side',
  'skirt-front-gore', 'skirt-back-gore', 'skirt-side-gore-left', 'skirt-side-gore-right',
  'sleeve-upper', 'sleeve-under', 'cap-sleeve', 'puff-sleeve', 'butterfly-sleeve',
  'collar', 'undercollar', 'collar-stand', 'collar-band', 'lapel-facing', 'placket-facing',
  'hood', 'cape', 'cape-overlay', 'yoke', 'epaulette',
  'peplum-front', 'peplum-back', 'sash', 'wrap-tie', 'belt', 'waistband',
  'godet', 'tier', 'pocket', 'facing', 'lining', 'cuff', 'rib-cuff', 'hem-band', 'other',
]);

// Baseline measured 2026-08-22 (Phase 1): 264 patterns / 1867 pieces —
// 1797 declare a vocabulary role, 68 (34 patterns) declare none at all
// (js/ai.js's buildTrousers/buildSkirt-derived pieces — see js/validate.
// js's own header comment: "deliberately have no placement role either"),
// 2 declare an INVENTED role ('cape-sleeve', js/fancy-patterns.js's
// capeSleeveL/R — also referenced in js/app.js's own sleeveRoles list, so
// it's a real, live gap, not dead code). Both gaps are pre-existing and
// documented here rather than silently fixed at the reporting layer — a
// real fix means either adding a genuinely new role everywhere docs/plan
// 4.md §4.2 requires (roles.js, schema, body-zone.js) or reworking those
// two generators to reuse an existing one, neither of which is "library
// content unchanged" infrastructure work.
const KNOWN_INVALID_ROLE_COUNTS = { 'cape-sleeve': 2 };
const BASELINE = { total: 1867, valid: 1797, none: 68, roleslessPatterns: 34 };

test('every declared piece role is in the 46-value vocabulary, except the two documented pre-existing exceptions', () => {
  const ids = Object.keys(PATTERNS);
  let total = 0, valid = 0, none = 0;
  const rolelessPatterns = new Set();
  const invalidRoles = new Map();
  const unexpectedInvalid = [];

  for (const id of ids) {
    const entry = PATTERNS[id];
    const category = entry.category || 'women';
    const m = computeMeasurements({ category, size: 'M', standard: 'intl' });
    for (const piece of entry.pieces(m)) {
      total++;
      if (!piece.role) { none++; rolelessPatterns.add(id); continue; }
      if (ROLE_VOCABULARY.has(piece.role)) { valid++; continue; }
      invalidRoles.set(piece.role, (invalidRoles.get(piece.role) || 0) + 1);
      if (!(piece.role in KNOWN_INVALID_ROLE_COUNTS)) unexpectedInvalid.push(`${id}: role "${piece.role}"`);
    }
  }

  console.log(`  role coverage: ${valid}/${total} valid, ${none} roleless (${rolelessPatterns.size} patterns), invalid: ${JSON.stringify([...invalidRoles])}`);

  if (unexpectedInvalid.length > 0) {
    throw new Error(`piece(s) declare a role outside the 46-value vocabulary that isn't one of the documented pre-existing exceptions:\n  ${unexpectedInvalid.join('\n  ')}`);
  }
  for (const [role, expectedCount] of Object.entries(KNOWN_INVALID_ROLE_COUNTS)) {
    const actual = invalidRoles.get(role) || 0;
    if (actual > expectedCount) throw new Error(`"${role}" now appears on ${actual} pieces, more than the ${expectedCount} documented — a regression, not the known exception`);
  }

  // Regression floors, not the final §8 gate 11 target — Phase 1 doesn't
  // change library content, so today's numbers are exactly what should
  // hold until a later phase deliberately improves them.
  assert.ok(valid >= BASELINE.valid, `role coverage regressed: ${valid} valid roles, expected at least ${BASELINE.valid}`);
  assert.ok(rolelessPatterns.size <= BASELINE.roleslessPatterns, `more patterns have a roleless piece than baseline: ${rolelessPatterns.size} > ${BASELINE.roleslessPatterns}`);
  assert.equal(total, BASELINE.total, `total piece count changed (${total} vs baseline ${BASELINE.total}) — re-baseline this test deliberately if library content changed on purpose`);
});
