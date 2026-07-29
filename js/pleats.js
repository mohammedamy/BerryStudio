/* ============================================================
   WP-14: pleats/gathers/tucks — pure ratio math + piece metadata.
   Each technique adds a computed amount of extra fabric width along an
   edge (a real patternmaking quantity, not a cosmetic label) plus
   optional per-instance metadata (`piece.pleats`) describing where each
   pleat/tuck sits along that edge, for future export/rendering.
   ============================================================ */

// A knife/box pleat folds `depthCm` of fabric under itself twice (once
// each side of the fold), so each pleat consumes 2*depthCm of extra
// width beyond the piece's finished (flat) width. `count` pleats spread
// evenly along the edge, each at a `positionOnEdge` fraction (0-1).
export function computePleats(baseWidthCm, count, depthCm) {
  if (!count || !depthCm) return { addedWidthCm: 0, pleats: [] };
  const addedWidthCm = count * depthCm * 2;
  const pleats = [];
  for (let i = 0; i < count; i++) {
    // evenly spaced, inset from both edges by half a pleat-spacing so no
    // pleat sits exactly on the piece's own side seam.
    const positionOnEdge = (i + 0.5) / count;
    pleats.push({ positionOnEdge, depthCm, direction: i % 2 === 0 ? "left" : "right" });
  }
  return { addedWidthCm, pleats };
}

// A gather (shirring) doesn't fold discretely — it's a continuous ratio
// of raw edge length to finished length (e.g. a 1.5x gather ratio means
// 15cm of raw fabric is eased into 10cm of finished edge). Returns the
// RAW width needed to gather down to `finishedWidthCm` at `ratio`.
export function computeGatherWidth(finishedWidthCm, ratio) {
  if (!ratio || ratio <= 1) return finishedWidthCm;
  return finishedWidthCm * ratio;
}

// A tuck is a stitched-down (not just pressed) fold — structurally the
// same added-width math as a pleat, but conventionally shallower and
// meant to stay sewn shut rather than hang open. Kept as a distinct,
// explicit entry point (rather than an alias) so a future generator/UI
// can offer it as its own labeled option without implying it behaves
// identically in every respect (e.g. rendering a tuck stitched-shut vs.
// a pleat's open fold is a real, future visual difference this keeps
// room for, even though the underlying width math is shared today).
export function computeTucks(baseWidthCm, count, depthCm) {
  return computePleats(baseWidthCm, count, depthCm);
}
