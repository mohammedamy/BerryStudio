// Shared helpers ported verbatim from the production app's js/ai.js (AIGen)
// — kept as their own module since every AIGen-style garment builder
// (skirt, trousers, top) needs them, and this is the first of what's meant
// to be several imports from that generator, not a one-off.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// Circumference -> a flat pattern's quarter-width (half the front OR back
// half-panel, doubled at a centre fold) — a drafting convention, not a true
// circle radius (contrast computeBodyDims.js's radiusFromCirc, which IS a
// real radius for the 3D lathe body).
export const q = (v) => v / 4

// Hem edge between a panel's two outer bottom corners. `xL`/`xR` are already
// resolved x-coordinates (not raw widths) so callers can skew them for wrap
// closures; `side` only matters for the asymmetric "highlow" shape.
export function hemPts(style, xL, xR, y, gh, side) {
  const dip = gh * 0.05
  switch (style.hemShape) {
    case 'curved': return [[xR, y - dip], [(xL + xR) / 2, y + dip * 0.6], [xL, y - dip]]
    case 'highlow': return side === 'front' ? [[xR, y - gh * 0.10], [xL, y - gh * 0.10]] : [[xR, y + gh * 0.06], [xL, y + gh * 0.06]]
    case 'asymmetric': return [[xR, y - gh * 0.09], [xL, y + gh * 0.03]]
    default: return [[xR, y], [xL, y]]
  }
}
