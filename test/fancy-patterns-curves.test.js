import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, computeMeasurements } from '../js/data.js';
import { FancyGen } from '../js/fancy-patterns.js';
import { buildDXF } from '../js/pattern-export.js';

void FancyGen; // imported for its module side effect (registers the 64 Fancy Collection designs)

// BerryStudio-Upgrade-Plan-v2 WP-27: piece.curves (WP-14) was wired into
// princessCurve() only — every other curved shape in fancy-patterns.js
// (necklines, sleeve caps, collars, godets, capes, peplums, jacket fronts,
// gores, etc.) stayed flattened-polyline-only. Every qBez()-built shape
// helper now also emits real cubic-bezier metadata (qBezToCubic() — exact
// quadratic->cubic degree elevation, not an approximation), hoisted onto
// each piece centrally (def()/FancyGen.build()) rather than by editing
// every one of the ~300 individual piece-literal call sites.
//
// This is a genuine, exhaustive geometric verification, not a smoke test:
// for every curved edge in every Fancy Collection design, it re-samples
// the reported cubic bezier and checks it actually reproduces the real
// flattened outline points between fromIdx/toIdx. This is exactly the
// check that caught a real bug during development — 3 of 4 princess-
// bodice neckline variants (sweetheart/offshoulder/scoop) sample a qBez()
// curve whose own p0 does NOT equal the outline's literal index-0 point
// (a pre-existing few-cm jog in that construction), so claiming a curve
// there would have been wrong metadata, not just incomplete — those three
// correctly get no neckline curve entry; their princess-seam curve is
// still real.
function cubicAt(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return [
    u*u*u*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p1[0],
    u*u*u*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p1[1],
  ];
}

const FANCY_IDS = Object.keys(PATTERNS).filter((id) => /^[wmgb]f\d+$/.test(id));

test('WP-27 sanity: all 64 Fancy Collection designs are registered', () => {
  assert.equal(FANCY_IDS.length, 64);
});

test('every piece.curves entry in every Fancy Collection design reproduces the real flattened outline points (no guessed metadata)', () => {
  let totalPieces = 0, piecesWithCurves = 0, totalCurveSegs = 0;
  const badSegs = [];
  for (const id of FANCY_IDS) {
    const entry = PATTERNS[id];
    const m = computeMeasurements({ category: entry.category, size: 'M', standard: 'intl' });
    const pieces = entry.pieces(m);
    for (const p of pieces) {
      totalPieces++;
      if (!p.curves || !p.curves.length) continue;
      piecesWithCurves++;
      for (const c of p.curves) {
        totalCurveSegs++;
        const { fromIdx, toIdx, c1, c2 } = c;
        if (fromIdx == null || toIdx == null || fromIdx < 0 || toIdx >= p.outline.length || fromIdx >= toIdx || !c1 || !c2) {
          badSegs.push(`${id}: ${p.label || p.key} — invalid index range ${JSON.stringify(c)}`);
          continue;
        }
        const p0 = p.outline[fromIdx], p1 = p.outline[toIdx];
        const n = toIdx - fromIdx;
        let maxErr = 0;
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const predicted = cubicAt(p0, c1, c2, p1, t);
          const actual = p.outline[fromIdx + k];
          maxErr = Math.max(maxErr, Math.hypot(predicted[0]-actual[0], predicted[1]-actual[1]));
        }
        if (maxErr > 1e-6) badSegs.push(`${id}: ${p.label || p.key} fromIdx=${fromIdx} toIdx=${toIdx} — max ${maxErr.toFixed(3)}cm off the real flattened points`);
      }
    }
  }
  console.log(`  ${piecesWithCurves}/${totalPieces} pieces carry real curve metadata, ${totalCurveSegs} curve segments total`);
  if (badSegs.length) throw new Error(`${badSegs.length} curve segment(s) don't reproduce their own piece's flattened outline:\n  ${badSegs.join('\n  ')}`);
  // Confirmed baseline (2026-08-05): 569/656 pieces across the full
  // 70-pattern set (6 hand-crafted + 64 Fancy Collection) carry real
  // curve metadata — straight-edged accessories (waistbands, gussets,
  // cuffs, sashes' straight ends, etc.) legitimately have none. A drop
  // here is a real regression in a shape helper or the hoisting wrapper.
  assert.ok(piecesWithCurves >= 500, `expected at least 500 curved pieces, found ${piecesWithCurves}`);
});

test('exporting any Fancy Collection garment to DXF produces a non-empty curve layer (layer 3), not only for princess-seam designs', () => {
  const missing = [];
  for (const id of FANCY_IDS) {
    const entry = PATTERNS[id];
    const m = computeMeasurements({ category: entry.category, size: 'M', standard: 'intl' });
    const dxf = buildDXF(entry.pieces(m));
    // Layer-3 POINT entities are pushed as group-code pairs "8","3" — see
    // buildDXF's own layer-numbering comment — joined with "\n" in the
    // final text.
    if (!/\n8\n3\n/.test(dxf)) missing.push(id);
  }
  assert.deepEqual(missing, [], `these Fancy Collection designs produced an empty DXF curve layer: ${missing.join(', ')}`);
});
