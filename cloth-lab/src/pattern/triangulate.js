import Delaunator from 'delaunator'

// Walks a piece's raw outline from edge.from to edge.to (wrapping if needed)
// and returns that sub-polyline as points.
function edgeRawPoints(piece, edgeName) {
  const { from, to } = piece.seamEdges[edgeName]
  const n = piece.outline.length
  const pts = []
  // from===to is finalizePiece's sentinel for "one edge covers the whole
  // perimeter" (see piece.js's totalSteps `|| n` fallback) — a piece with
  // zero declared edges gets exactly this from seamAuthoring.js. Walking
  // "push, stop once i===to" like the multi-edge case would stop after a
  // single point instead of going all the way around.
  if (from === to) {
    let i = from
    for (let k = 0; k <= n; k++) {
      pts.push(piece.outline[i])
      i = (i + 1) % n
    }
    return pts
  }
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

  // All edges in a shared junction need ONE subdivision count. Assigning
  // each pair independently overwrote the anchor for 3+ contributors,
  // leaving earlier pairs with different vertex counts and crashing assembly.
  const parents = new Map(), ends = new Map()
  const keyOf = e => JSON.stringify([e.piece, e.edge])
  function find(key) {
    if (!parents.has(key)) parents.set(key, key)
    if (parents.get(key) !== key) parents.set(key, find(parents.get(key)))
    return parents.get(key)
  }
  for (const seam of seams) {
    const a = keyOf(seam.a), b = keyOf(seam.b)
    ends.set(a, seam.a); ends.set(b, seam.b)
    parents.set(find(b), find(a))
  }
  const groups = new Map()
  for (const [key, edge] of ends) {
    const root = find(key)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(edge)
  }
  for (const edges of groups.values()) {
    const length = edges.reduce((sum, e) => sum + polylineLength(edgeRawPoints(byId[e.piece], e.edge)), 0) / edges.length
    const count = Math.max(2, Math.round(length / targetSpacingCm))
    for (const e of edges) {
      subdiv[e.piece][e.edge] = count
      paired.add(`${e.piece}.${e.edge}`)
    }
  }
  // Free (unpaired) edges — e.g. neckline/hem/cuff — get their own count.
  // Narrow sleeves need >= 8 circumferential segments around the arm tube so
  // chordal sagitta does not dip inside the collision arm mesh.
  for (const p of pieces) {
    const minSub = p.role === 'sleeve' ? 8 : 2
    for (const edgeName of p.edgeOrder) {
      if (paired.has(`${p.id}.${edgeName}`)) continue
      const len = polylineLength(edgeRawPoints(p, edgeName))
      subdiv[p.id][edgeName] = Math.max(minSub, Math.round(len / targetSpacingCm))
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
  const wSpan = maxX - minX, hSpan = maxY - minY
  const interior = []
  const clearance = Math.min(0.6 * targetSpacingCm, Math.min(wSpan, hSpan) * 0.30)
  const stepX = piece.role === 'sleeve' && wSpan > 0
    ? Math.min(targetSpacingCm, Math.max(0.9, wSpan / 8))
    : (wSpan > 0 && wSpan < targetSpacingCm * 1.4 && hSpan > targetSpacingCm * 2 ? Math.max(0.5, wSpan * 0.45) : targetSpacingCm)
  const stepY = hSpan > 0 && hSpan < targetSpacingCm * 1.4 && wSpan > targetSpacingCm * 2 ? Math.max(0.5, hSpan * 0.45) : targetSpacingCm
  for (let x = minX; x <= maxX; x += stepX) {
    for (let y = minY; y <= maxY; y += stepY) {
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
  const bLen = boundary.length
  for (let t = 0; t < del.triangles.length; t += 3) {
    const ia = del.triangles[t], ib = del.triangles[t + 1], ic = del.triangles[t + 2]
    const pa = allPts[ia], pb = allPts[ib], pc = allPts[ic]
    const area2 = Math.abs((pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]))
    const maxEdge = Math.max(
      Math.hypot(pb[0] - pa[0], pb[1] - pa[1]),
      Math.hypot(pc[0] - pb[0], pc[1] - pb[1]),
      Math.hypot(pa[0] - pc[0], pa[1] - pc[1]),
    )
    if (maxEdge > 1e-6 && (area2 / maxEdge) < 1e-3) continue
    const cx = (pa[0] + pb[0] + pc[0]) / 3
    const cy = (pa[1] + pb[1] + pc[1]) / 3
    if (!pointInPolygon([cx, cy], boundary)) continue
    if (ia < bLen && ib < bLen && ic < bLen && maxEdge > targetSpacingCm * 2.5) {
      const okMid = (u, v) => {
        const diff = Math.abs(u - v)
        if (diff === 1 || diff === bLen - 1) return true
        const mid = [(allPts[u][0] + allPts[v][0]) * 0.5, (allPts[u][1] + allPts[v][1]) * 0.5]
        return pointInPolygon(mid, boundary) && distanceToPolyline(mid, boundary) > 1e-3
      }
      if (!okMid(ia, ib) || !okMid(ib, ic) || !okMid(ic, ia)) continue
    }
    triangles.push(ia, ib, ic)
  }

  return {
    pieceId: piece.id,
    role: piece.role,
    color: piece.color,
    positions2D: allPts,
    triangles: new Uint32Array(triangles),
    boundaryChains,
    placementHint: piece.placementHint,
  }
}

export function adaptiveSpacingCm(pieces, minSpacingOrOpts = 2, maxParticles = 3000) {
  let minSpacingCm = typeof minSpacingOrOpts === 'number' ? minSpacingOrOpts : 2
  let effMax = maxParticles
  if (minSpacingOrOpts && typeof minSpacingOrOpts === 'object') {
    if (typeof minSpacingOrOpts.minSpacingCm === 'number') minSpacingCm = minSpacingOrOpts.minSpacingCm
    if (minSpacingOrOpts.qualityTier === 'high' && maxParticles === 3000) effMax = 3200
  }
  let totalArea = 0
  let hasIntimate = false
  for (const p of pieces) {
    const h = p?.placementHint
    if (h?.isBrief || h?.sewnCupBra || h?.sewnSportBand || h?.isBriefGusset || h?.isLegOpeningElastic || h?.isFittedIntimate) {
      hasIntimate = true
    }
    const pts = p?.outline
    if (!Array.isArray(pts) || pts.length < 3) continue
    let area2 = 0
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      area2 += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
    }
    totalArea += Math.abs(area2) * 0.5
  }
  const effMin = hasIntimate && totalArea < 4200 ? Math.min(minSpacingCm, 1.45) : minSpacingCm
  return Math.max(effMin, Math.min(4.5, Math.sqrt(Math.max(1, totalArea) / effMax)))
}

export function triangulateAll(pieces, seams, targetSpacingCm = 2) {
  const subdivMap = computeSubdivisions(pieces, seams, targetSpacingCm)
  return pieces.map((p) => triangulatePiece(p, subdivMap[p.id], targetSpacingCm))
}
