import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, computeMeasurements } from '../js/data.js';
import '../js/library.js';
import '../js/girls-leotards.js';
import { FancyGen } from '../js/fancy-patterns.js';
import '../js/underwear-library.js';

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
// This is the exact 51-value list from cloth-lab/src/pattern/roles.js /
// schema/pattern-spec.v1.json's live-piece equivalent (docs/plan 4.md
// §4.2's original 46, plus 5 added in Phase 4/WP-53 — see below) — kept
// as a literal copy, not an import, because cloth-lab is a separate
// build-based package the build-free root app cannot import from (same
// reasoning as js/pattern-flat.js's unfoldPiece). If this list and
// cloth-lab/src/pattern/roles.js's own vocabulary ever diverge, that's a
// real bug this test can't see — cloth-lab/src/pattern/roles.test.js is
// the source of truth on the cloth-lab side.
//
// Phase 4 (WP-53) added cup/band/strap/elastic-band/gusset: js/underwear-
// library.js declared these 5 roles from day one, but none were ever
// added to the vocabulary — a real, confirmed gap (resolveSchemaRole()
// returned null for all 5, so cloth-lab's importer silently fell back to
// classifyLegacy's name-based guess for every bra/brief piece using
// them). §4.2 says "prefer reusing an existing role," but none of the 46
// fit a bra cup/band/strap or a brief's elastic-band/gusset — added
// properly instead (roles.js + schema/pattern-spec.v1.json, per §4.2's
// own instructions for a genuinely new role), not remapped to a
// misleading existing name.
const ROLE_VOCABULARY = new Set([
  'front-panel', 'back-panel', 'hip-panel-front', 'hip-panel-back', 'sleeve',
  'brief-front', 'brief-back',
  'bodice-front-center', 'bodice-front-side', 'bodice-back-center', 'bodice-back-side',
  'skirt-front-gore', 'skirt-back-gore', 'skirt-side-gore-left', 'skirt-side-gore-right',
  'sleeve-upper', 'sleeve-under', 'cap-sleeve', 'puff-sleeve', 'butterfly-sleeve',
  'collar', 'undercollar', 'collar-stand', 'collar-band', 'lapel-facing', 'placket-facing',
  'hood', 'cape', 'cape-overlay', 'yoke', 'epaulette',
  'peplum-front', 'peplum-back', 'sash', 'wrap-tie', 'belt', 'waistband',
  'godet', 'tier', 'pocket', 'facing', 'lining', 'cuff', 'rib-cuff', 'hem-band',
  'cup', 'band', 'strap', 'elastic-band', 'gusset',
  'other',
]);

// Re-baselined 2026-08-23 (Phase 4, docs/plan 4.md, WP-53): this sweep
// now also covers js/underwear-library.js's 44 patterns (previously not
// imported here at all — its cup/band/strap/elastic-band/gusset roles
// weren't even in the vocabulary to check against). Those 5 roles are now
// real vocabulary members (cloth-lab/src/pattern/roles.js + schema/
// pattern-spec.v1.json — see ROLE_VOCABULARY's own comment), so this
// collection's 129 previously-invalid-role pieces are all valid now:
// 308 patterns / 2170 pieces, 2166 valid, only 2 roleless (`boys_trousers`,
// one of the 6 hand-crafted data.js base patterns deliberately out of
// scope — see js/library.js's own header) and 2 invalid ('cape-sleeve',
// js/fancy-patterns.js's capeSleeveL/R — also referenced in js/app.js's
// own sleeveRoles list, so it's a real, live gap, not dead code — still
// pre-existing and undocumented no further this phase; a real fix means
// either adding it as a genuinely new role too or reworking that
// generator to reuse an existing one, neither in scope here).
const KNOWN_INVALID_ROLE_COUNTS = { 'cape-sleeve': 2 };
const BASELINE = { total: 2170, valid: 2166, none: 2, roleslessPatterns: 1 };

test('every declared piece role is in the 51-value vocabulary, except the two documented pre-existing exceptions', () => {
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
