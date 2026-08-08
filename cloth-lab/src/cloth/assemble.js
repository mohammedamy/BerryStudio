import { placePiece } from '../pattern/placement.js'
import { dihedralAngle } from './dihedralBend.js'

// Fixed cm-per-repeat divisor for fabric-texture UVs (see renderUV below) —
// a real-world scale, not each piece's own bounding box, so a weave tiles at
// a consistent physical size whether it's on a small sleeve or a large front
// panel. 20cm read as large ridges/pleats rather than a fine weave; 8cm
// looked visually identical to 20cm in testing (both were confounded by
// flatShading's per-triangle faceting competing for visual attention — see
// ClothMesh.jsx's deriveNormalRing-based smooth normals, which fixed that
// separately). Re-verified against 3cm across sheer/glossy/heavy fabrics
// (chiffon/silk/denim) after the smooth-normal fix landed — reads as a
// believable fine weave on all three, so this is the settled value.
export const UV_REPEAT_CM = 3

// Same neutral blue-gray ClothMesh.jsx's material used to hardcode as its
// whole-garment base color — now only the FALLBACK for a piece that arrives
// with no `color` (e.g. an old cached bridge payload, or the rare piece the
// 2D canvas never assigned one to), so a garment missing color data still
// renders sensibly instead of black/white.
const DEFAULT_PIECE_COLOR = '#c9cedb'

// Three.js vertex colors (and Material.color) are consumed in the renderer's
// LINEAR working color space, but a piece's `color` is an sRGB hex string
// (same as any CSS/canvas color, and what js/canvas.js's <input type=color>
// swatch produces) — feeding sRGB values into the `color` attribute directly
// reads visibly washed-out/too-bright next to `material.color` (which THREE.
// Color() DOES convert automatically). This hand-rolls the standard sRGB->
// linear transfer function rather than pulling in three.js here — assemble.js
// is deliberately plain geometry/math with no rendering-library dependency
// (see placement.js's own precedent).
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function hexToLinearRGB(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim())
  const int = m ? parseInt(m[1], 16) : parseInt(DEFAULT_PIECE_COLOR.slice(1), 16)
  return [
    srgbToLinear(((int >> 16) & 255) / 255),
    srgbToLinear(((int >> 8) & 255) / 255),
    srgbToLinear((int & 255) / 255),
  ]
}

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
  // Per-render-vertex color (linear RGB), sourced from each ORIGINAL piece's
  // own `color` — unlike renderVertexToSimParticle (which shares one sim
  // particle across a welded seam), render vertices themselves are never
  // deduplicated across pieces (each triangulated piece keeps its own local
  // copy — see pieceOffset above), so there's no seam-boundary ambiguity to
  // resolve: a render vertex always belongs to exactly one piece.
  const renderColor = new Float32Array(renderVertexCount * 3)
  const renderTriangles = new Uint32Array(triangulatedPieces.reduce((n, tp) => n + tp.triangles.length, 0))
  // Rest-state area share (m²) per sim particle — 1/3 of every incident
  // triangle's flat 2D pattern-space area (not the placed 3D area: mass is a
  // property of the physical fabric piece, and shouldn't depend on the
  // placement heuristic's incidental stretch/compression).
  const simAreaShare = new Float32Array(simParticleCount)
  // Rough rest-pose normal per sim particle (placed 3D positions this time,
  // unlike simAreaShare above) — NOT the live shading normal. Only used as a
  // stable local "up" axis to angularly sort each particle's neighbor ring
  // in deriveNormalRing below, so the live per-frame smooth-normal
  // computation in ClothMesh.jsx's shader has a consistent winding order.
  const simRestNormal = new Float32Array(simParticleCount * 3)
  let triWriteOffset = 0

  for (const tp of triangulatedPieces) {
    const offset = pieceOffset[tp.pieceId]
    const positions3D = placePiece(tp, dims)
    const [cr, cg, cb] = hexToLinearRGB(tp.color)

    positions3D.forEach(([x, y, z], localIdx) => {
      const g = offset + localIdx
      const sp = renderVertexToSimParticle[g]
      simRestPositions[sp * 3] += x
      simRestPositions[sp * 3 + 1] += y
      simRestPositions[sp * 3 + 2] += z
      contributionCount[sp]++
      renderColor[g * 3] = cr
      renderColor[g * 3 + 1] = cg
      renderColor[g * 3 + 2] = cb
      // Fixed real-world divisor (not this piece's own bounding box) so a
      // fabric weave repeats at the same physical size on every piece
      // regardless of its area — see UV_REPEAT_CM above. UVs now legitimately
      // exceed [0,1]; the consuming material must set RepeatWrapping.
      renderUV[g * 2] = tp.positions2D[localIdx][0] / UV_REPEAT_CM
      renderUV[g * 2 + 1] = tp.positions2D[localIdx][1] / UV_REPEAT_CM
    })
    for (let i = 0; i < tp.triangles.length; i++) renderTriangles[triWriteOffset + i] = tp.triangles[i] + offset
    triWriteOffset += tp.triangles.length

    for (let t = 0; t < tp.triangles.length; t += 3) {
      const ia = tp.triangles[t], ib = tp.triangles[t + 1], ic = tp.triangles[t + 2]
      const [xa, ya] = tp.positions2D[ia], [xb, yb] = tp.positions2D[ib], [xc, yc] = tp.positions2D[ic]
      const areaM2 = Math.abs((xb - xa) * (yc - ya) - (xc - xa) * (yb - ya)) / 2 * 1e-4 // cm² -> m²
      const share = areaM2 / 3
      const spa = renderVertexToSimParticle[offset + ia]
      const spb = renderVertexToSimParticle[offset + ib]
      const spc = renderVertexToSimParticle[offset + ic]
      simAreaShare[spa] += share
      simAreaShare[spb] += share
      simAreaShare[spc] += share

      const [xA, yA, zA] = positions3D[ia], [xB, yB, zB] = positions3D[ib], [xC, yC, zC] = positions3D[ic]
      const ux = xB - xA, uy = yB - yA, uz = zB - zA
      const vx = xC - xA, vy = yC - yA, vz = zC - zA
      const fnx = uy * vz - uz * vy, fny = uz * vx - ux * vz, fnz = ux * vy - uy * vx
      simRestNormal[spa * 3] += fnx; simRestNormal[spa * 3 + 1] += fny; simRestNormal[spa * 3 + 2] += fnz
      simRestNormal[spb * 3] += fnx; simRestNormal[spb * 3 + 1] += fny; simRestNormal[spb * 3 + 2] += fnz
      simRestNormal[spc * 3] += fnx; simRestNormal[spc * 3 + 1] += fny; simRestNormal[spc * 3 + 2] += fnz
    }
  }
  for (let i = 0; i < simParticleCount; i++) {
    const c = contributionCount[i] || 1
    simRestPositions[i * 3] /= c
    simRestPositions[i * 3 + 1] /= c
    simRestPositions[i * 3 + 2] /= c

    const nx = simRestNormal[i * 3], ny = simRestNormal[i * 3 + 1], nz = simRestNormal[i * 3 + 2]
    const nlen = Math.hypot(nx, ny, nz) || 1
    simRestNormal[i * 3] = nx / nlen
    simRestNormal[i * 3 + 1] = ny / nlen
    simRestNormal[i * 3 + 2] = nz / nlen
  }

  // Weld degree per render vertex (debug view: 1=interior, 2=seam, 3+=corner).
  const simDegree = new Uint16Array(simParticleCount)
  for (let i = 0; i < renderVertexCount; i++) simDegree[renderVertexToSimParticle[i]]++
  const weldDegree = new Uint8Array(renderVertexCount)
  for (let i = 0; i < renderVertexCount; i++) weldDegree[i] = Math.min(255, simDegree[renderVertexToSimParticle[i]])

  return {
    simParticleCount, simRestPositions, simRestNormal, simAreaShare,
    renderVertexCount, renderVertexToSimParticle, renderUV, renderColor, renderTriangles,
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
  // WP-35: alongside the existing wing-to-wing distance pairs (bendSets,
  // feeding the default distance-based bend spring, unchanged below), also
  // record which SHARED EDGE (v0,v1) produced each pair — the true
  // dihedral-angle bend constraint (dihedralBend.js) needs both edge
  // endpoints, not just the opposite corner, to measure the actual angle
  // between the two triangles. Keyed by the "c" side of each pair so
  // packHinges below can look it up per (particle, neighbor) slot exactly
  // the way packNeighbors already does for idx/rest.
  const hingeEdgeFor = new Map() // "c_d" -> [v0, v1]
  for (const [key, opps] of edgeOpposite.entries()) {
    if (opps.length < 2) continue // boundary edge — only one triangle, no fold to resist
    const [c, d] = opps
    if (c === d) continue
    bendSets[c].add(d)
    bendSets[d].add(c)
    const [v0, v1] = key.split('_').map(Number)
    hingeEdgeFor.set(`${c}_${d}`, [v0, v1])
    hingeEdgeFor.set(`${d}_${c}`, [v0, v1])
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

  // WP-35: same particle/slot layout packNeighbors(bendSets) uses — SAME
  // sort, SAME slice, SAME slot index k per neighbor — so the GLSL shader
  // can read "my k-th bend neighbor"'s index from bend's own nbrA/B texture
  // and its hinge data (edge endpoints + rest angle) from this one at that
  // EXACT same slot, with no separate idx texture of its own needed. This
  // must never skip-and-reindex: an earlier version incremented its output
  // slot only on success, which would silently shift every hinge after the
  // first degenerate one down by one slot relative to bend's own idx —
  // pairing particle N's edge/angle data with particle N+1's neighbor
  // index. A degenerate hinge (dihedralAngle returns null — e.g. a
  // zero-length edge from bad topology) instead writes idx=-1 at its OWN
  // slot k, same "not present" sentinel packNeighbors already uses,
  // leaving every later slot's alignment untouched. The plain `bend` list
  // above is built independently and never filtered this way, so the
  // default distance-based path is completely unaffected by a degeneracy
  // only the new tier cares about.
  function packHinges(sets) {
    const idx = new Int32Array(simParticleCount * maxNeighbors).fill(-1)
    const edgeV0 = new Int32Array(simParticleCount * maxNeighbors).fill(-1)
    const edgeV1 = new Int32Array(simParticleCount * maxNeighbors).fill(-1)
    const restAngle = new Float32Array(simParticleCount * maxNeighbors)
    for (let p = 0; p < simParticleCount; p++) {
      const neighbors = [...sets[p]].map((n) => [n, dist(p, n)]).sort((a, b) => a[1] - b[1]).slice(0, maxNeighbors)
      neighbors.forEach(([n], k) => {
        const slot = p * maxNeighbors + k
        const edge = hingeEdgeFor.get(`${p}_${n}`)
        if (!edge) return // should not happen — bendSets is derived from the same edgeOpposite map
        const [v0, v1] = edge
        const p1 = [simRestPositions[v0 * 3], simRestPositions[v0 * 3 + 1], simRestPositions[v0 * 3 + 2]]
        const p2 = [simRestPositions[v1 * 3], simRestPositions[v1 * 3 + 1], simRestPositions[v1 * 3 + 2]]
        const p3 = [simRestPositions[p * 3], simRestPositions[p * 3 + 1], simRestPositions[p * 3 + 2]]
        const p4 = [simRestPositions[n * 3], simRestPositions[n * 3 + 1], simRestPositions[n * 3 + 2]]
        const angle = dihedralAngle(p1, p2, p3, p4)
        if (angle === null) return // degenerate at rest — leave idx=-1 at THIS slot, don't invent an angle
        idx[slot] = n
        edgeV0[slot] = v0
        edgeV1[slot] = v1
        restAngle[slot] = angle
      })
    }
    return { idx, edgeV0, edgeV1, restAngle }
  }

  return {
    structural: packNeighbors(structuralSets),
    bend: packNeighbors(bendSets),
    bendHinge: packHinges(bendSets),
    maxNeighbors,
  }
}

// Per-sim-particle "neighbor ring" for live smooth-normal shading (see
// ClothMesh.jsx's onBeforeCompile patch): flatShading gave every render
// triangle its own screen-space-derivative normal — correct but visibly
// faceted under any glossy material (Silk's clearcoat made individual
// triangles read as gem facets). The GPU sim only ever writes particle
// *positions*, so there is no vertex-normal attribute that tracks the live
// deformation; this precomputes, once per mesh build, a fixed small ring of
// neighbor particles per particle so the vertex shader can rebuild a proper
// area-swept normal from LIVE positions every frame with a handful of extra
// texture2D samples — no second GPGPU pass, no CPU readback.
//
// The ring must be angularly ordered (not just "closest N") or consecutive
// cross-products in the shader can point opposite directions and partially
// cancel. Ordering needs a stable local "up" axis to project into, so this
// uses the cheap rest-pose face-normal average (cloth.simRestNormal) purely
// as a sort key — never as the shading normal itself, which stays fully
// live/deformed.
export function deriveNormalRing(cloth, neighbors, ringSize = 4) {
  const { simParticleCount, simRestPositions, simRestNormal } = cloth
  const { idx } = neighbors.structural
  const { maxNeighbors } = neighbors
  const ring = new Int32Array(simParticleCount * ringSize)

  for (let p = 0; p < simParticleCount; p++) {
    const cand = []
    for (let k = 0; k < maxNeighbors; k++) {
      const n = idx[p * maxNeighbors + k]
      if (n >= 0) cand.push(n)
    }
    if (cand.length === 0) {
      for (let r = 0; r < ringSize; r++) ring[p * ringSize + r] = p
      continue
    }

    const px = simRestPositions[p * 3], py = simRestPositions[p * 3 + 1], pz = simRestPositions[p * 3 + 2]
    const nx = simRestNormal[p * 3], ny = simRestNormal[p * 3 + 1], nz = simRestNormal[p * 3 + 2]

    // Seed a tangent from the first candidate, projected orthogonal to the
    // rough normal, then bitangent = normal x tangent completes the basis.
    let tx = simRestPositions[cand[0] * 3] - px
    let ty = simRestPositions[cand[0] * 3 + 1] - py
    let tz = simRestPositions[cand[0] * 3 + 2] - pz
    const d = tx * nx + ty * ny + tz * nz
    tx -= d * nx; ty -= d * ny; tz -= d * nz
    const tlen = Math.hypot(tx, ty, tz) || 1
    tx /= tlen; ty /= tlen; tz /= tlen
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx

    const withAngles = cand.map((n) => {
      const dx = simRestPositions[n * 3] - px, dy = simRestPositions[n * 3 + 1] - py, dz = simRestPositions[n * 3 + 2] - pz
      return [n, Math.atan2(dx * bx + dy * by + dz * bz, dx * tx + dy * ty + dz * tz)]
    }).sort((a, b) => a[1] - b[1])

    for (let r = 0; r < ringSize; r++) ring[p * ringSize + r] = withAngles[r % withAngles.length][0]
  }

  return ring
}
