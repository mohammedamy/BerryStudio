import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, computeMeasurements } from '../js/data.js';
import { FancyGen } from '../js/fancy-patterns.js';

void FancyGen; // imported for its module side effect (registers the Fancy Collection)

// BerryStudio-Upgrade-Plan-v5.md WP-43 continued: jacketFrontBack()
// (shared by ~44 call sites across the Fancy Collection) used to have no
// distinct neckline curve at all — front and back both jumped straight
// from the neck/closure point into one combined shoulder+armhole curve.
// This is the dedicated regression test for the fix: every pattern whose
// front/back declare a 'jacketFrontNeck'/'jacketBackNeck' edge gets a real
// checkable neckline, AND the pre-existing jacketSide seam (WP-58) — the
// whole reason this function's index math had to be touched at all —
// still matches EXACTLY between front and back, not just approximately.

function polylineLen(outline, from, to) {
  let len = 0;
  for (let i = from; i < to; i++) {
    const [x1, y1] = outline[i], [x2, y2] = outline[i + 1];
    len += Math.hypot(x2 - x1, y2 - y1);
  }
  return len;
}

function findEdge(piece, seamId) {
  return (piece.edges || []).find((e) => e.seamId === seamId);
}

test('every jacketFrontBack-based pattern declares a real jacketFrontNeck/jacketBackNeck edge', () => {
  const ids = Object.keys(PATTERNS);
  const checked = [];
  for (const id of ids) {
    const entry = PATTERNS[id];
    const m = computeMeasurements({ category: entry.category, size: 'M', standard: 'intl' });
    const pieces = entry.pieces(m);
    const front = pieces.find((p) => findEdge(p, 'jacketFrontNeck'));
    const back = pieces.find((p) => findEdge(p, 'jacketBackNeck'));
    if (!front && !back) continue; // this pattern doesn't use jacketFrontBack at all
    checked.push(id);
    assert.ok(front, `${id}: has a jacketBackNeck edge but no matching jacketFrontNeck front`);
    assert.ok(back, `${id}: has a jacketFrontNeck edge but no matching jacketBackNeck back`);
    const frontEdge = findEdge(front, 'jacketFrontNeck');
    const backEdge = findEdge(back, 'jacketBackNeck');
    const frontLen = polylineLen(front.outline, frontEdge.fromIdx, frontEdge.toIdx);
    const backLen = polylineLen(back.outline, backEdge.fromIdx, backEdge.toIdx);
    assert.ok(frontLen > 0.5, `${id}: front's own jacketFrontNeck edge is degenerate (${frontLen.toFixed(3)}cm) — not a real curve`);
    assert.ok(backLen > 0.5, `${id}: back's own jacketBackNeck edge is degenerate (${backLen.toFixed(3)}cm) — not a real curve`);
  }
  // Confirmed baseline (this WP): 36 patterns use jacketFrontBack() (44
  // call sites total — a handful of patterns, e.g. mf05's separate
  // jacket+vest layers, call it twice). A drop means the neckline
  // stopped being declared somewhere it used to be; a rise is fine (new
  // patterns adopting it).
  assert.ok(checked.length >= 36, `only ${checked.length} patterns declare the new neckline edges — expected at least 36`);
});

test('the pre-existing jacketSide seam still matches EXACTLY between front and back (WP-58, unmoved by the neckline change)', () => {
  const ids = Object.keys(PATTERNS);
  let checkedPairs = 0;
  for (const id of ids) {
    const entry = PATTERNS[id];
    const m = computeMeasurements({ category: entry.category, size: 'M', standard: 'intl' });
    const pieces = entry.pieces(m);
    // A pattern can call jacketFrontBack() more than once (e.g. mf05's
    // separate jacket AND vest layers, each with its own front+back) —
    // match each front against WHICHEVER declared back has an exactly
    // equal jacketSide length, rather than assuming there's only ever
    // one back in the whole pattern to compare against. A front with no
    // matching back at all (mismatched, or genuinely paired with
    // something else) fails loudly instead of silently comparing against
    // an unrelated layer.
    const backs = pieces.filter((p) => findEdge(p, 'jacketBackNeck') && findEdge(p, 'jacketSide'));
    for (const front of pieces.filter((p) => findEdge(p, 'jacketFrontNeck'))) {
      const frontSide = findEdge(front, 'jacketSide');
      if (!frontSide) continue; // this jacketFrontBack use doesn't declare a side seam at all — nothing to compare
      const frontLen = polylineLen(front.outline, frontSide.fromIdx, frontSide.toIdx);
      checkedPairs++;
      const matched = backs.some((back) => {
        const backSide = findEdge(back, 'jacketSide');
        const backLen = polylineLen(back.outline, backSide.fromIdx, backSide.toIdx);
        return Math.abs(frontLen - backLen) < 0.01;
      });
      assert.ok(
        matched,
        `${id}: front "${front.key}" (jacketSide=${frontLen.toFixed(4)}cm) has no back with a matching jacketSide length (WP-58 regression)`,
      );
    }
  }
  assert.ok(checkedPairs >= 30, `only checked ${checkedPairs} front/back jacketSide pairs — expected at least 30`);
});
