// Shared source identity used by the host and both Cloth Lab engines.
export function shapeKey(piece) {
  const outline = Array.isArray(piece.outline) ? piece.outline : []
  const origin = Array.isArray(outline[0]) ? outline[0] : [0, 0]
  const local = points => Array.isArray(points) ? points.map(p => Array.isArray(p) ? p.map((v, i) => Number.isFinite(v) ? Math.round((v - origin[i]) * 1e5) / 1e5 : v) : p) : points
  return JSON.stringify([local(outline), (Array.isArray(piece.darts) ? piece.darts : []).map(local), piece.role, piece.cutOnFold, piece.bilateral, piece.bodyZone, piece.edges])
}
export function designKey(payload) {
  return JSON.stringify([payload?.designId, (payload?.pieces || []).map(p => [p.id, shapeKey(p), p.visible]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))])
}

export function ensureClothPieceIds(pieces) {
  const seen = new Set()
  for (const piece of pieces) {
    if (typeof piece.clothLabId !== 'string' || !piece.clothLabId || seen.has(piece.clothLabId)) piece.clothLabId = `piece_${crypto.randomUUID()}`
    seen.add(piece.clothLabId)
  }
  return pieces
}
