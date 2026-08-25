import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS } from '../js/data.js';
import '../js/library.js';
import '../js/girls-leotards.js';
import { FancyGen } from '../js/fancy-patterns.js';
import '../js/underwear-library.js';
import { _renderUncached } from '../js/pattern-flat.js';

void FancyGen; // side-effect import only

// docs/plan 4.md §7.3/§8 gate 13: every pattern renders a generated
// thumbnail flat, and "no two patterns produce identical thumbnail SVG."
// Composition can legitimately decline for a pattern with no recognizable
// front-facing role (js/pattern-flat.js's composePattern returns null,
// and js/app.js's renderLibraryPane falls back to LIB_ICONS — see that
// module's own header comment) — that's an honest "can't compose yet,"
// not a bug, and it's asserted as a floor here, not silently ignored.
//
// This is the FULL 308-pattern catalogue (unlike test/validate-library.
// test.js's 264, which predates js/underwear-library.js's import) because
// a thumbnail either composes or falls back for every registered
// pattern — the check makes sense (and the coverage floor is real) for
// the whole library, not just the subset the validator sweep covers.
test('every pattern in the library renders a distinct thumbnail, or honestly declines', () => {
  const ids = Object.keys(PATTERNS);
  const seenSvg = new Map(); // svg string -> id
  const duplicates = [];
  let composed = 0, declined = 0, crashed = 0;

  for (const id of ids) {
    let svg;
    try {
      svg = _renderUncached(id);
    } catch (e) {
      crashed++;
      console.log(`  ✖ ${id} threw: ${e.message}`);
      continue;
    }
    if (svg == null) { declined++; continue; }
    composed++;
    if (seenSvg.has(svg)) duplicates.push(`${id} duplicates ${seenSvg.get(svg)}`);
    else seenSvg.set(svg, id);
  }

  console.log(`  thumbnails: ${composed} composed, ${declined} declined (LIB_ICONS fallback), ${ids.length} total`);

  if (crashed > 0) throw new Error(`renderPatternFlat threw on ${crashed} pattern(s) — it must always degrade to null, never throw`);
  if (duplicates.length > 0) throw new Error(`identical thumbnail SVG produced for different patterns:\n  ${duplicates.join('\n  ')}`);

  // Baseline measured 2026-08-23 (Phase 2): 288/308 compose a real flat —
  // up from Phase 1's 254 once composePattern() gained a skirt/hip-only
  // core fallback and a last-resort name-based "front" fallback (the same
  // bounded idiom js/validate.js's pairFrontBack and cloth-lab's
  // classifyLegacy already use) for js/ai.js-derived trouser/skirt pieces
  // that declare no role at all. The remaining 20 declines are exactly
  // js/underwear-library.js's bra patterns (wb01-10, gb01-10) — built from
  // cup/band/strap pieces with no torso-panel-shaped role at all, and that
  // collection also declares roles outside the 46-value vocabulary
  // entirely (see js/underwear-library.js) — a genuine gap for a later
  // phase, not something this renderer should paper over by guessing a
  // placement.
  assert.ok(composed >= 288, `thumbnail composition regressed: ${composed} composed, expected at least 288`);
});

// A stricter unit-level check on a single well-formed pattern: rendering
// twice (cache bypassed) is deterministic — pieces(m) must stay a pure
// function of m (docs/plan 4.md §2), and so must composePattern/
// partsToSvg built on top of it.
test('rendering the same pattern twice produces byte-identical SVG (purity)', () => {
  const id = Object.keys(PATTERNS).find((pid) => _renderUncached(pid) != null);
  assert.ok(id, 'expected at least one pattern to compose a thumbnail');
  const a = _renderUncached(id);
  const b = _renderUncached(id);
  assert.equal(a, b);
});

test('a composed thumbnail is a well-formed SVG with a finite viewBox and no NaN coordinates', () => {
  const id = Object.keys(PATTERNS).find((pid) => _renderUncached(pid) != null);
  const svg = _renderUncached(id);
  assert.match(svg, /^<svg viewBox="[-\d.]+ [-\d.]+ [\d.]+ [\d.]+"/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});
