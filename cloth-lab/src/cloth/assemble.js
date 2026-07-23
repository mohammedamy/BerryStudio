import { placePiece } from '../pattern/placement.js'

// Union-find (disjoint set) — plain array-based, path-compressed.
function makeUnionFind(n) {
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  function find(i) {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }
    return i
  }
  function union(a, b) {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  return { find, union }
}

// Seam-based mesh assembly: places every triangulated piece in 3D, then
// welds matching seam-edge vertices into shared simulation-particle indices
// (not a soft positional constraint — see cloth-lab plan notes: the GPU sim
// addresses state by texel = particle index, so sharing an index is what
// makes two rendered vertices sample the identical texel every frame at
// zero extra cost, with no risk of a visible seam gap under stress).
export function assembleCloth(triangulatedPieces, dims, seams) {
  const byId = Object.fromEntries(triangulatedPieces.map((tp) => [tp.pieceId, tp]))

  const pieceOffset = {}
  let renderVertexCount = 0
  for (const tp of triangulatedPieces) {
    pieceOffset[tp.pieceId] = renderVertexCount
    renderVertexCount += tp.positions2D.length
  }
  const globalIndex = (pieceId, localIdx) => pieceOffset[pieceId] + localIdx

  const uf = makeUnionFind(renderVertexCount)
  for (const seam of seams) {
    const pieceA = byId[seam.a.piece], pieceB = byId[seam.b.piece]
    const chainA = pieceA.boundaryChains[seam.a.edge]
    const chainB = pieceB.boundaryChains[seam.b.edge]
    if (!chainA || !chainB) throw new Error(`assembleCloth: seam "${seam.id}" references a missing edge`)
    if (chainA.length !== chainB.length) {
      throw new Error(`assembleCloth: seam "${seam.id}" has mismatched subdivision (${chainA.length} vs ${chainB.length}) — both sides of a seam must share a subdivision count`)
    }
    const walkB = seam.reverse ? chainB.slice().reverse() : chainB
    for (let k = 0; k < chainA.length; k++) {
      uf.union(globalIndex(seam.a.piece, chainA[k]), globalIndex(seam.b.piece, walkB[k]))
    }
  }

  // Flatten union-find roots to dense 0..N-1 sim-particle ids.
  const rootToSim = new Map()
  const renderVertexToSimParticle = new Uint32Array(renderVertexCount)
  for (let i = 0; i < renderVertexCount; i++) {
    const root = uf.find(i)
    if (!rootToSim.has(root)) rootToSim.set(root, rootToSim.size)
    renderVertexToSimParticle[i] = rootToSim.get(root)
  }
  const simParticleCount = rootToSim.size

  // Place pieces in 3D, then average every render vertex mapped to a given
  // sim particle into that particle's rest position (more forgiving of tiny
  // placement-seam gaps than "just take one side").
  const simRestPositions = new Float32Array(simParticleCount * 3)
  const contributionCount = new Float32Array(simParticleCount)
  const renderUV = new Float32Array(renderVertexCount * 2)
  const renderTriangles = new Uint32Array(triangulatedPieces.reduce((n, tp) => n + tp.triangles.length, 0))
  // Rest-state area share (m²) per sim particle — 1/3 of every incident
  // triangle's flat 2D pattern-space area (not the placed 3D area: mass is a
  // property of the physical fabric piece, and shouldn't depend on the
  // placement heuristic's incidental stretch/compression).
  const simAreaShare = new Float32Array(simParticleCount)
  let triWriteOffset = 0

  for (const tp of triangulatedPieces) {
    const offset = pieceOffset[tp.pieceId]
    const positions3D = placePiece(tp, dims)
    const xs = tp.positions2D.map((p) => p[0]), ys = tp.positions2D.map((p) => p[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)

    positions3D.forEach(([x, y, z], localIdx) => {
      const g = offset + localIdx
      const sp = renderVertexToSimParticle[g]
      simRestPositions[sp * 3] += x
      simRestPositions[sp * 3 + 1] += y
      simRestPositions[sp * 3 + 2] += z
      contributionCount[sp]++
      renderUV[g * 2] = (tp.positions2D[localIdx][0] - minX) / (maxX - minX || 1)
      renderUV[g * 2 + 1] = (tp.positions2D[localIdx][1] - minY) / (maxY - minY || 1)
    })
    for (let i = 0; i < tp.triangles.length; i++) renderTriangles[triWriteOffset + i] = tp.triangles[i] + offset
    triWriteOffset += tp.triangles.length

    for (let t = 0; t < tp.triangles.length; t += 3) {
      const ia = tp.triangles[t], ib = tp.triangles[t + 1], ic = tp.triangles[t + 2]
      const [xa, ya] = tp.positions2D[ia], [xb, yb] = tp.positions2D[ib], [xc, yc] = tp.positions2D[ic]
      const areaM2 = Math.abs((xb - xa) * (yc - ya) - (xc - xa) * (yb - ya)) / 2 * 1e-4 // cm² -> m²
      const share = areaM2 / 3
      simAreaShare[renderVertexToSimParticle[offset + ia]] += share
      simAreaShare[renderVertexToSimParticle[offset + ib]] += share
      simAreaShare[renderVertexToSimParticle[offset + ic]] += share
    }
  }
  for (let i = 0; i < simParticleCount; i++) {
    const c = contributionCount[i] || 1
    simRestPositions[i * 3] /= c
    simRestPositions[i * 3 + 1] /= c
    simRestPositions[i * 3 + 2] /= c
  }

  // Weld degree per render vertex (debug view: 1=interior, 2=seam, 3+=corner).
  const simDegree = new Uint16Array(simParticleCount)
  for (let i = 0; i < renderVertexCount; i++) simDegree[renderVertexToSimParticle[i]]++
  const weldDegree = new Uint8Array(renderVertexCount)
  for (let i = 0; i < renderVertexCount; i++) weldDegree[i] = Math.min(255, simDegree[renderVertexToSimParticle[i]])

  return {
    simParticleCount, simRestPositions, simAreaShare,
    renderVertexCount, renderVertexToSimParticle, renderUV, renderTriangles,
    weldDegree, pieceOffset,
  }
}

// Structural + bend neighbors, derived directly from the (already
// triangulated) mesh — NOT the classic grid-cloth structural/shear/bend
// split. A Delaunay triangulation's own edges already resist shear the way
// a quad-grid's diagonals would (a triangle can't shear without stretching
// one of its 3 edges), so "structural" here is simply every unique
// triangle edge; "bend" connects the two off-edge vertices of each pair of
// triangles sharing an edge (the standard fold/hinge constraint).
export function deriveNeighbors(cloth, maxNeighbors = 8) {
  const { renderTriangles, renderVertexToSimParticle, simParticleCount, simRestPositions } = cloth

  const structuralSets = Array.from({ length: simParticleCount }, () => new Set())
  const edgeOpposite = new Map() // "a_b" (a<b) -> [opposite vertex, ...]

  for (let t = 0; t < renderTriangles.length; t += 3) {
    const tri = [
      renderVertexToSimParticle[renderTriangles[t]],
      renderVertexToSimParticle[renderTriangles[t + 1]],
      renderVertexToSimParticle[renderTriangles[t + 2]],
    ]
    for (let e = 0; e < 3; e++) {
      const v0 = tri[e], v1 = tri[(e + 1) % 3], opp = tri[(e + 2) % 3]
      if (v0 === v1) continue // degenerate after welding — shouldn't occur, skip defensively
      structuralSets[v0].add(v1)
      structuralSets[v1].add(v0)
      const key = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`
      if (!edgeOpposite.has(key)) edgeOpposite.set(key, [])
      edgeOpposite.get(key).push(opp)
    }
  }

  const bendSets = Array.from({ length: simParticleCount }, () => new Set())
  for (const opps of edgeOpposite.values()) {
    if (opps.length < 2) continue // boundary edge — only one triangle, no fold to resist
    const [c, d] = opps
    if (c === d) continue
    bendSets[c].add(d)
    bendSets[d].add(c)
  }

  const dist = (a, b) => Math.hypot(
    simRestPositions[a * 3] - simRestPositions[b * 3],
    simRestPositions[a * 3 + 1] - simRestPositions[b * 3 + 1],
    simRestPositions[a * 3 + 2] - simRestPositions[b * 3 + 2],
  )
  // Overflow rule: keep the `maxNeighbors` shortest-rest-length neighbors,
  // drop the rest — most particles (interior grid, 2-piece seams) never hit
  // this; only rare 3+-piece corners can exceed a Delaunay mesh's typical
  // ~6 neighbors.
  function packNeighbors(sets) {
    const idx = new Int32Array(simParticleCount * maxNeighbors).fill(-1)
    const rest = new Float32Array(simParticleCount * maxNeighbors)
    for (let p = 0; p < simParticleCount; p++) {
      const neighbors = [...sets[p]].map((n) => [n, dist(p, n)]).sort((a, b) => a[1] - b[1]).slice(0, maxNeighbors)
      neighbors.forEach(([n, d], k) => { idx[p * maxNeighbors + k] = n; rest[p * maxNeighbors + k] = d })
    }
    return { idx, rest }
  }

  return { structural: packNeighbors(structuralSets), bend: packNeighbors(bendSets), maxNeighbors }
}
