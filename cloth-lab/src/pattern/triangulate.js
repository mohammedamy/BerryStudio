import Delaunator from 'delaunator'

// Walks a piece's raw outline from edge.from to edge.to (wrapping if needed)
// and returns that sub-polyline as points.
function edgeRawPoints(piece, edgeName) {
  const { from, to } = piece.seamEdges[edgeName]
  const n = piece.outline.length
  const pts = []
  let i = from
  while (true) {
    pts.push(piece.outline[i])
    if (i === to) break
    i = (i + 1) % n
  }
  return pts
}

function polylineLength(pts) {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return len
}

// Resample a polyline into exactly `subdiv` segments (subdiv+1 points,
// including both original endpoints), evenly spaced by arc length. The
// original interior points only influence the *shape* of the curve — the
// output point count is always exactly subdiv+1, which is what lets two
// differently-shaped edges (an armhole curve vs. a sleeve cap curve) still
// weld 1:1 as long as they're assigned the same subdiv count.
function resamplePolyline(pts, subdiv) {
  const total = polylineLength(pts)
  if (total < 1e-9) return Array.from({ length: subdiv + 1 }, () => pts[0].slice())
  const out = []
  for (let s = 0; s <= subdiv; s++) {
    const target = (s / subdiv) * total
    let acc = 0
    for (let i = 1; i < pts.length; i++) {
      const segLen = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      if (acc + segLen >= target - 1e-9 || i === pts.length - 1) {
        const t = segLen < 1e-9 ? 0 : Math.max(0, Math.min(1, (target - acc) / segLen))
        out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t])
        break
      }
      acc += segLen
    }
  }
  return out
}

// For every seam pairing, both sides must resample to the *same* point
// count so welding is a clean 1:1 index correspondence — computed from the
// average of the two (real) edge lengths, not either side alone, so a
// sleeve cap slightly longer than its armhole (real-world "easing") still
// gets one shared, sensible subdivision count instead of two different ones.
export function computeSubdivisions(pieces, seams, targetSpacingCm) {
  const byId = Object.fromEntries(pieces.map((p) => [p.id, p]))
  const subdiv = {} // { pieceId: { edgeName: count } }
  for (const p of pieces) subdiv[p.id] = {}
  const paired = new Set() // `${piece}.${edge}` already assigned via a seam

  for (const seam of seams) {
    const lenA = polylineLength(edgeRawPoints(byId[seam.a.piece], seam.a.edge))
    const lenB = polylineLength(edgeRawPoints(byId[seam.b.piece], seam.b.edge))
    const count = Math.max(2, Math.round((lenA + lenB) / 2 / targetSpacingCm))
    subdiv[seam.a.piece][seam.a.edge] = count
    subdiv[seam.b.piece][seam.b.edge] = count
    paired.add(`${seam.a.piece}.${seam.a.edge}`)
    paired.add(`${seam.b.piece}.${seam.b.edge}`)
  }
  // Free (unpaired) edges — e.g. neckline/hem/cuff — get their own count.
  for (const p of pieces) {
    for (const edgeName of p.edgeOrder) {
      if (paired.has(`${p.id}.${edgeName}`)) continue
      const len = polylineLength(edgeRawPoints(p, edgeName))
      subdiv[p.id][edgeName] = Math.max(2, Math.round(len / targetSpacingCm))
    }
  }
  return subdiv
}

function pointInPolygon(pt, poly) {
  // Standard ray-casting test.
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const intersects = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function distanceToPolyline(pt, poly) {
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[j]
    const [x2, y2] = poly[i]
    const dx = x2 - x1, dy = y2 - y1
    const lenSq = dx * dx + dy * dy
    const t = lenSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((pt[0] - x1) * dx + (pt[1] - y1) * dy) / lenSq))
    const px = x1 + dx * t, py = y1 + dy * t
    best = Math.min(best, Math.hypot(pt[0] - px, pt[1] - py))
  }
  return best
}

// Triangulate one piece: resample its boundary (per-edge, using the shared
// subdivision map) into a dense ring, fill the interior with a grid, run
// unconstrained Delaunay over ring+interior, then cull any triangle whose
// centroid falls outside the polygon — handles the mild concavity of a
// curve like an armhole without needing true constrained-edge recovery.
export function triangulatePiece(piece, subdivForPiece, targetSpacingCm) {
  const boundary = []
  const edgeStart = {} // edgeName -> index of its first *newly pushed* point
  // Every edge's resampled last point is, by the perimeter-chain invariant
  // (finalizePiece), identical to the next edge's first point — including
  // the wrap from the last edge back to the first. So each edge contributes
  // only its own points *minus the last* to a shared, non-duplicated ring;
  // an edge's true endpoint is recovered as "the next edge's start point"
  // when boundaryChains is assembled below.
  for (const edgeName of piece.edgeOrder) {
    const raw = edgeRawPoints(piece, edgeName)
    const resampled = resamplePolyline(raw, subdivForPiece[edgeName])
    edgeStart[edgeName] = boundary.length
    for (let i = 0; i < resampled.length - 1; i++) boundary.push(resampled[i])
  }
  const boundaryChains = {}
  piece.edgeOrder.forEach((edgeName, i) => {
    const nextName = piece.edgeOrder[(i + 1) % piece.edgeOrder.length]
    const start = edgeStart[edgeName]
    const count = edgeStart[nextName] === 0 ? boundary.length - start : edgeStart[nextName] - start
    const chain = Array.from({ length: count }, (_, k) => start + k)
    chain.push(edgeStart[nextName]) // this edge's true endpoint == next edge's start
    boundaryChains[edgeName] = chain
  })

  const xs = boundary.map((p) => p[0]), ys = boundary.map((p) => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const interior = []
  const clearance = 0.6 * targetSpacingCm
  for (let x = minX; x <= maxX; x += targetSpacingCm) {
    for (let y = minY; y <= maxY; y += targetSpacingCm) {
      const pt = [x, y]
      if (!pointInPolygon(pt, boundary)) continue
      if (distanceToPolyline(pt, boundary) < clearance) continue
      interior.push(pt)
    }
  }

  const allPts = boundary.concat(interior)
  const coords = new Float64Array(allPts.length * 2)
  allPts.forEach((p, i) => { coords[i * 2] = p[0]; coords[i * 2 + 1] = p[1] })
  const del = new Delaunator(coords)

  const triangles = []
  for (let t = 0; t < del.triangles.length; t += 3) {
    const ia = del.triangles[t], ib = del.triangles[t + 1], ic = del.triangles[t + 2]
    const cx = (allPts[ia][0] + allPts[ib][0] + allPts[ic][0]) / 3
    const cy = (allPts[ia][1] + allPts[ib][1] + allPts[ic][1]) / 3
    if (pointInPolygon([cx, cy], boundary)) triangles.push(ia, ib, ic)
  }

  return {
    pieceId: piece.id,
    role: piece.role,
    positions2D: allPts,
    triangles: new Uint32Array(triangles),
    boundaryChains,
  }
}

export function triangulateAll(pieces, seams, targetSpacingCm = 2) {
  const subdivMap = computeSubdivisions(pieces, seams, targetSpacingCm)
  return pieces.map((p) => triangulatePiece(p, subdivMap[p.id], targetSpacingCm))
}
