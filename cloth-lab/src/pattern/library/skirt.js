import { clamp, q, hemPts } from './aiGenHelpers.js'

// Ported from the production app's js/ai.js buildSkirt() — measurement-driven,
// same philosophy as computeBodyDims.js (a pure function of the same
// measurement keys, not one frozen numeric example) rather than a static
// import of a specific size. Defaults below favor a visibly flared A-line
// (flareF>1) over the library's own w07 "Fitted Pencil Skirt" preset
// (flareF:0.85), which collapses to a plain rectangle with no waist-to-hem
// taper at all — fine as a style choice in the 2D app, but a poor first
// example for proving the importer handles non-trivial (non-rectangular)
// outlines.
export const DEFAULT_SKIRT_STYLE = { fitF: 0.9, flareF: 1.35, lengthF: 0.9, hemShape: 'default' }

// Raw pieces only — plain {id, label, outline:[[x,y],...]} — no seam
// metadata. That's deliberate: the existing 2D pattern system (and every
// generator ported from it) has no concept of seam/edge pairing at all, so
// this is authored separately, interactively, via the seam-authoring UI.
//
// Front/back are each a FULL panel symmetric about x=0 (half-width ==
// quarter-hip, same magnitude tshirt.js's hardcoded front panel uses:
// compare rHem=[23,62]/lHem=[-23,62] there to halfW≈23.4 here) — the same
// convention as tshirt.js's front/back (see its rightSide/leftSide seams),
// each seamed to the other panel on BOTH sides to close the tube. Not a
// "cut on the fold" quarter-panel: a cloth sim needs the real full geometry
// as actual triangles, there's no implicit-mirror fold at sim time.
export function buildSkirtRaw(measurements, style = DEFAULT_SKIRT_STYLE) {
  const m = measurements
  const fit = style.fitF
  const halfW = (q(m.hips) + 2) * fit
  const gh = clamp(m.inseam * 0.6 * style.lengthF, 20, m.inseam)
  const hemHalfW = Math.max(halfW, halfW * style.flareF)

  // outline is an implicitly-closed ring (matches triangulate.js's
  // edgeRawPoints, which wraps index n-1 back to 0) — no explicit closing
  // point, exactly like the original js/ai.js version and every
  // tshirt.js piece. Point order: rWaist -> [hem, right-to-left] -> lWaist.
  const panel = (id, label, side) => {
    const hemLine = hemPts(style, -hemHalfW, hemHalfW, gh, gh, side)
    return { id, label, outline: [[halfW, 0], ...hemLine, [-halfW, 0]] }
  }

  const pieces = [
    panel('frontSkirt', 'Front Skirt', 'front'),
    panel('backSkirt', 'Back Skirt', 'back'),
    { id: 'waistband', label: 'Waistband', outline: [[0, 0], [m.waist * fit + 4, 0], [m.waist * fit + 4, 7], [0, 7]] },
  ]
  return pieces
}
