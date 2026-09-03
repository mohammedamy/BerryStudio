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

// BerryStudio-Upgrade-Plan-v5.md WP-43 continued (second half): the above
// two tests cover the FIRST half of this WP (jacketFrontBack() gets a real
// neckline curve). This covers the second half — collarStand()/
// shawlCollar()/lapelFacing() redrafted so their own neck-attaching edge
// matches jacketFrontBack()'s frontNeckLen+backNeckLen "by construction,"
// not just declared. Tested against the real functions directly (exposed
// via FancyGen._wp43Internals — qBez/withCurves are closed over
// fancy-patterns.js's own IIFE, so there's no way to reach them otherwise),
// not by re-deriving arc length from a guessed formula.

const { jacketFrontBack, shawlCollar, lapelFacing, collarStand, polylineArcLength } = FancyGen._wp43Internals;

test('shawlCollar()\'s own neck-attaching curve matches jacketFrontBack()\'s real neckline arc EXACTLY, across sizes', () => {
  for (const size of ['XXS', 'M', '6XL']) {
    const m = computeMeasurements({ category: 'men', size, standard: 'intl' });
    const jb = jacketFrontBack(m, 70, { hemFlareF: 1.0 });
    const neckArc = jb.frontNeckLen + jb.backNeckLen;
    const collar = shawlCollar(neckArc, 20);
    // shawlCollar()'s neck edge is always its first curve: [0,0] + the
    // 6-sample qBez (seg1) — index 0 to 6, regardless of call-site depth.
    const collarNeckLen = polylineArcLength(collar.slice(0, 7));
    assert.ok(
      Math.abs(collarNeckLen - neckArc) < 1e-6,
      `size ${size}: shawlCollar's neck edge (${collarNeckLen.toFixed(6)}cm) doesn't match the target neckline arc (${neckArc.toFixed(6)}cm)`,
    );
  }
});

test('lapelFacing()\'s own neck-attaching edge matches jacketFrontBack()\'s real neckline arc EXACTLY, across sizes', () => {
  for (const size of ['XXS', 'M', '6XL']) {
    const m = computeMeasurements({ category: 'women', size, standard: 'intl' });
    const jb = jacketFrontBack(m, 55, { hemFlareF: 1.0 });
    const neckArc = jb.frontNeckLen + jb.backNeckLen;
    const facing = lapelFacing(neckArc, 40);
    // lapelFacing()'s neck edge is the straight [0,0]->[h*0.8,2] lead —
    // index 0 to 1, always.
    const facingNeckLen = polylineArcLength(facing.slice(0, 2));
    assert.ok(
      Math.abs(facingNeckLen - neckArc) < 1e-9,
      `size ${size}: lapelFacing's neck edge (${facingNeckLen.toFixed(9)}cm) doesn't match the target neckline arc (${neckArc.toFixed(9)}cm)`,
    );
  }
});

test('collarStand()\'s "stand" band — the piece that actually seams to the body at every one of this file\'s call sites — matches jacketFrontBack()\'s real neckline arc EXACTLY, across sizes', () => {
  for (const size of ['XXS', 'M', '6XL']) {
    const m = computeMeasurements({ category: 'boys', size, standard: 'intl' });
    const jb = jacketFrontBack(m, 45, { hemFlareF: 1.0 });
    const neckArc = jb.frontNeckLen + jb.backNeckLen;
    const cs = collarStand(neckArc);
    // stand's neck edge is its straight bottom [0,0]->[h+2,0] — index 0 to 1.
    const standNeckLen = polylineArcLength(cs.stand.slice(0, 2));
    assert.ok(
      Math.abs(standNeckLen - neckArc) < 1e-9,
      `size ${size}: collarStand's stand edge (${standNeckLen.toFixed(9)}cm) doesn't match the target neckline arc (${neckArc.toFixed(9)}cm)`,
    );
  }
});

// A handful of call sites deliberately draft a wider/narrower collar or
// facing than the garment's own raw neckline (a real stylistic choice —
// e.g. a placket facing is meant to be narrower than the full neckline,
// a storm collar wider) — every such factor actually used in this file,
// so "matches one candidate times one of these" stays a real, tight check
// rather than "close to something."
const REAL_SCALE_FACTORS = [1, 1.05, 1.08, 1.1, 1.15, 0.5, 0.6, 0.7];

function matchesSomeCandidate(neckLen, candidates) {
  return candidates.some((c) => REAL_SCALE_FACTORS.some((f) => Math.abs(neckLen - c * f) < 1e-6));
}

test('every registered pattern\'s own collar/undercollar and lapel-facing/placket-facing pieces (the real shawlCollar()/lapelFacing() output, identified by their fixed point count) arc-match their pattern\'s own jacketFrontBack neckline (times an intentional, real per-design factor where used), not a guessed m.neck value', () => {
  const ids = Object.keys(PATTERNS);
  let checkedCollars = 0, checkedFacings = 0;
  for (const id of ids) {
    const entry = PATTERNS[id];
    const m = computeMeasurements({ category: entry.category, size: 'M', standard: 'intl' });
    const pieces = entry.pieces(m);
    const fronts = pieces.filter((p) => findEdge(p, 'jacketFrontNeck'));
    const backs = pieces.filter((p) => findEdge(p, 'jacketBackNeck'));
    if (!fronts.length || !backs.length) continue; // doesn't use jacketFrontBack() at all — out of this WP's scope
    // A pattern can have more than one jacketFrontBack layer (jacket+vest,
    // kandura+vest); collect every layer's own real neckline arc as a
    // candidate — a genuinely-matched collar/facing must equal ONE of
    // them exactly (not "some" length in general), never merely be close
    // to all of them.
    const candidates = [];
    for (const front of fronts) {
      const fe = findEdge(front, 'jacketFrontNeck');
      const flen = polylineLen(front.outline, fe.fromIdx, fe.toIdx);
      for (const back of backs) {
        const be = findEdge(back, 'jacketBackNeck');
        const blen = polylineLen(back.outline, be.fromIdx, be.toIdx);
        candidates.push(flen + blen);
      }
    }
    for (const p of pieces) {
      // Only the real shawlCollar() output has this exact 17-point shape
      // (seg1 + seg2 + 2 closing points) — collarStand()'s own curved
      // `.collar` sub-piece (9 points, role "collar" at mf08/bf09/gf13)
      // shares its `h` with `.stand` but isn't independently arc-matched
      // this pass (a real, documented scope limit — see this WP's own
      // CHANGELOG entry), so it's deliberately not asserted here.
      if ((p.role === 'collar' || p.role === 'undercollar') && p.outline.length === 17) {
        checkedCollars++;
        const neckLen = polylineLen(p.outline, 0, 6);
        const matched = matchesSomeCandidate(neckLen, candidates);
        assert.ok(
          matched,
          `${id}: "${p.key}" (role ${p.role}) neck edge is ${neckLen.toFixed(6)}cm — doesn't match any of this pattern's own jacketFrontBack neckline arcs (${candidates.map((c) => c.toFixed(6))})`,
        );
      }
      if ((p.role === 'collar-stand' || p.role === 'collar-band') && p.outline.length === 4) {
        checkedCollars++;
        const neckLen = polylineLen(p.outline, 0, 1);
        const matched = matchesSomeCandidate(neckLen, candidates);
        assert.ok(
          matched,
          `${id}: "${p.key}" (role ${p.role}) neck edge is ${neckLen.toFixed(6)}cm — doesn't match any of this pattern's own jacketFrontBack neckline arcs (${candidates.map((c) => c.toFixed(6))})`,
        );
      }
      // Only the real lapelFacing() output has this exact 17-point shape
      // (2 lead points + qBez(seg1,7) + qBez(seg2,7) + 1 hem point) —
      // every inline-literal neckline facing this file also authors
      // (wf04/wf07/gf07/gf11/gf13's own qBez-from-scratch facings, never
      // touched by this WP) has a different point count and is correctly
      // skipped rather than misidentified.
      if ((p.role === 'lapel-facing' || p.role === 'placket-facing') && p.outline.length === 17) {
        checkedFacings++;
        const neckLen = polylineLen(p.outline, 0, 1);
        const matched = matchesSomeCandidate(neckLen, candidates);
        assert.ok(
          matched,
          `${id}: "${p.key}" (role ${p.role}) neck edge is ${neckLen.toFixed(6)}cm — doesn't match any of this pattern's own jacketFrontBack neckline arcs (${candidates.map((c) => c.toFixed(6))}) — every real lapelFacing() call site should pass the exact arc, only scaled by an intentional, documented per-design factor`,
        );
      }
    }
  }
  assert.ok(checkedCollars >= 25, `only checked ${checkedCollars} collar/collar-stand pieces — expected at least 25`);
  assert.ok(checkedFacings >= 15, `only checked ${checkedFacings} lapel-facing/placket-facing pieces — expected at least 15`);
});
