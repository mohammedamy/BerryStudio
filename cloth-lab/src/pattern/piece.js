// Shared by every piece source (hand-authored like tshirt.js, or interactively
// authored via seamAuthoring.js for imported patterns): asserts a piece's
// declared edges chain into exactly one closed cycle covering the whole
// perimeter with no gaps and no overlaps (edge[i].to must equal edge[i+1].from,
// all the way around) — the triangulator resamples the boundary one declared
// edge at a time, in walk order, so a gap or overlap here would silently
// corrupt the outline. Also derives `edgeOrder` (edges in polygon-walk order).
export function finalizePiece(id, role, outline, seamEdges) {
  const n = outline.length
  const edgeOrder = Object.keys(seamEdges).sort((a, b) => seamEdges[a].from - seamEdges[b].from)
  let totalSteps = 0
  for (let i = 0; i < edgeOrder.length; i++) {
    const cur = seamEdges[edgeOrder[i]]
    const next = seamEdges[edgeOrder[(i + 1) % edgeOrder.length]]
    if (cur.to !== next.from) {
      throw new Error(`${id}: edge "${edgeOrder[i]}" ends at point ${cur.to} but the next edge "${edgeOrder[(i + 1) % edgeOrder.length]}" starts at ${next.from} — the perimeter must chain into one closed loop with no gaps/overlaps`)
    }
    totalSteps += (cur.to - cur.from + n) % n || n
  }
  if (totalSteps !== n) {
    throw new Error(`${id}: declared edges cover ${totalSteps} steps but the outline has ${n} points — perimeter isn't fully (and only once) tiled`)
  }
  return { id, role, outline, seamEdges, edgeOrder }
}
