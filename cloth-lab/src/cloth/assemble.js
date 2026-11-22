import { placePiece } from '../pattern/placement.js'
import { dihedralAngle } from './dihedralBend.js'
import { classifyPiecePhysics, computePerVertexFlowWeight, PHYS_CLASS } from './piecePhysics.js'

const CLASS_PRIORITY = {
  [PHYS_CLASS.STANDARD]: 0,
  [PHYS_CLASS.LOOSE_FLOW]: 1,
  [PHYS_CLASS.STRUCTURED]: 2,
  [PHYS_CLASS.BIKINI_INTIMATE]: 3,
  [PHYS_CLASS.ELASTIC]: 4,
}

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
export function assembleCloth(triangulatedPieces, dims, seams, pose = 'standing') {
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
  const totalTriIndices = triangulatedPieces.reduce((n, tp) => n + tp.triangles.length, 0)
  const renderTriangles = new Uint32Array(totalTriIndices)
  const renderTriPieceIdx = new Uint16Array(Math.floor(totalTriIndices / 3))
  // Rest-state area share (m²) per sim particle — 1/3 of every incident
  // triangle's flat 2D pattern-space area (not the placed 3D area: mass is a
  // property of the physical fabric piece, and shouldn't depend on the
  // placement heuristic's incidental stretch/compression).
  const simAreaShare = new Float32Array(simParticleCount)
  const simRestNormal = new Float32Array(simParticleCount * 3)
  const simPhysClass = new Float32Array(simParticleCount)
  const simPhysPriority = new Int8Array(simParticleCount).fill(-1)
  const simFlowWeight = new Float32Array(simParticleCount)
  const simSkinOffset = new Float32Array(simParticleCount)
  const simSkinMin = new Float32Array(simParticleCount).fill(Infinity)
  const simRestScale = new Float32Array(simParticleCount).fill(1.0)
  const renderPieceStyle = new Float32Array(renderVertexCount * 4)
  const renderBoundary = new Uint8Array(renderVertexCount)
  let triWriteOffset = 0

  for (let pieceIdx = 0; pieceIdx < triangulatedPieces.length; pieceIdx++) {
    const tp = triangulatedPieces[pieceIdx]
    const offset = pieceOffset[tp.pieceId]
    const positions3D = placePiece(tp, dims, pose)
    const [cr, cg, cb] = hexToLinearRGB(tp.color)
    const physInfo = classifyPiecePhysics(tp, dims)
    const vertFlow = computePerVertexFlowWeight(tp, physInfo)
    const prio = CLASS_PRIORITY[physInfo.physClass] ?? 0

    if (tp.boundaryChains) {
      for (const chain of Object.values(tp.boundaryChains)) {
        for (const localIdx of chain) renderBoundary[offset + localIdx] = 1
      }
    }

    positions3D.forEach(([x, y, z], localIdx) => {
      const g = offset + localIdx
      const sp = renderVertexToSimParticle[g]
      simRestPositions[sp * 3] += x
      simRestPositions[sp * 3 + 1] += y
      simRestPositions[sp * 3 + 2] += z
      contributionCount[sp]++
      if (prio > simPhysPriority[sp]) {
        simPhysPriority[sp] = prio
        simPhysClass[sp] = physInfo.physClass
      }
      const fw = vertFlow[localIdx] || 0
      simFlowWeight[sp] += fw
      const localSkinOff = physInfo.physClass === PHYS_CLASS.LOOSE_FLOW
        ? physInfo.skinOffset * fw
        : physInfo.skinOffset
      simSkinOffset[sp] += localSkinOff
      if (localSkinOff < simSkinMin[sp]) simSkinMin[sp] = localSkinOff
      if (physInfo.restScale < simRestScale[sp]) simRestScale[sp] = physInfo.restScale

      renderColor[g * 3] = cr
      renderColor[g * 3 + 1] = cg
      renderColor[g * 3 + 2] = cb
      renderPieceStyle[g * 4] = physInfo.isElastic ? 1.0 : 0.0
      renderPieceStyle[g * 4 + 2] = physInfo.isIntimateKnit ? 1.0 : 0.0
      // Fixed real-world divisor (not this piece's own bounding box) so a
      // fabric weave repeats at the same physical size on every piece
      // regardless of its area — see UV_REPEAT_CM above. UVs now legitimately
      // exceed [0,1]; the consuming material must set RepeatWrapping.
      renderUV[g * 2] = tp.positions2D[localIdx][0] / UV_REPEAT_CM
      renderUV[g * 2 + 1] = tp.positions2D[localIdx][1] / UV_REPEAT_CM
    })
    for (let i = 0; i < tp.triangles.length; i++) renderTriangles[triWriteOffset + i] = tp.triangles[i] + offset
    const triStart = Math.floor(triWriteOffset / 3)
    const triCount = Math.floor(tp.triangles.length / 3)
    renderTriPieceIdx.fill(pieceIdx, triStart, triStart + triCount)
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
    simFlowWeight[i] /= c
    const rawOff = (simPhysClass[i] === PHYS_CLASS.ELASTIC || simPhysClass[i] === PHYS_CLASS.BIKINI_INTIMATE)
      ? (Number.isFinite(simSkinMin[i]) ? simSkinMin[i] : simSkinOffset[i] / c)
      : (simSkinOffset[i] / c)
    simSkinOffset[i] = Math.max(-0.0038, Math.min(0.0020, rawOff))

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
  for (let i = 0; i < renderVertexCount; i++) {
    const deg = Math.min(255, simDegree[renderVertexToSimParticle[i]])
    weldDegree[i] = deg
    renderPieceStyle[i * 4 + 1] = deg >= 2 ? 1.0 : 0.0
    renderPieceStyle[i * 4 + 3] = (renderBoundary[i] && deg === 1) ? 1.0 : 0.0
  }

  return {
    simParticleCount, simRestPositions, simRestNormal, simAreaShare,
    simPhysClass, simFlowWeight, simSkinOffset, simRestScale,
    renderVertexCount, renderVertexToSimParticle, renderUV, renderColor, renderPieceStyle, renderTriangles,
    renderTriPieceIdx, isGarmentAssembly: true,
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
  const { renderTriangles, renderVertexToSimParticle, simParticleCount, simRestPositions, renderTriPieceIdx, isGarmentAssembly, simRestScale } = cloth

  const structuralSets = Array.from({ length: simParticleCount }, () => new Set())
  const edgeEntries = new Map() // "a_b" (a<b) -> [{ a, b, opp, pieceIdx }, ...]

  for (let t = 0; t < renderTriangles.length; t += 3) {
    const tri = [
      renderVertexToSimParticle[renderTriangles[t]],
      renderVertexToSimParticle[renderTriangles[t + 1]],
      renderVertexToSimParticle[renderTriangles[t + 2]],
    ]
    const pieceIdx = renderTriPieceIdx ? renderTriPieceIdx[Math.floor(t / 3)] : 0
    for (let e = 0; e < 3; e++) {
      const v0 = tri[e], v1 = tri[(e + 1) % 3], opp = tri[(e + 2) % 3]
      if (v0 === v1) continue // degenerate after welding — shouldn't occur, skip defensively
      structuralSets[v0].add(v1)
      structuralSets[v1].add(v0)
      const key = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`
      if (!edgeEntries.has(key)) edgeEntries.set(key, [])
      edgeEntries.get(key).push({ a: v0, b: v1, opp, pieceIdx })
    }
  }

  const bendSets = Array.from({ length: simParticleCount }, () => new Set())
  const posOf = (idx) => [simRestPositions[idx * 3], simRestPositions[idx * 3 + 1], simRestPositions[idx * 3 + 2]]
  const cross3 = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

  const hingeForWingPair = new Map() // "c_d" -> canonical hinge record
  const hingeForEdge = new Map()     // "min_max" -> canonical hinge record
  for (const [key, entries] of edgeEntries.entries()) {
    if (entries.length !== 2) continue // boundary or non-manifold T-junction — no clean fold hinge
    const [e1, e2] = entries
    if (e1.opp === e2.opp) continue
    const c = Math.min(e1.opp, e2.opp)
    const d = Math.max(e1.opp, e2.opp)
    const tC = c === e1.opp ? e1 : e2
    const tD = c === e1.opp ? e2 : e1
    const p1 = tC.a, p2 = tC.b

    const pt1 = posOf(p1), pt2 = posOf(p2), ptC = posOf(c), ptD = posOf(d)
    const edgeVec = sub3(pt2, pt1)
    if (Math.hypot(...edgeVec) < 1e-6) continue
    const n1r = cross3(edgeVec, sub3(ptC, pt1))
    const n2r = cross3(sub3(pt1, pt2), sub3(ptD, pt1))
    if (Math.hypot(...n1r) < 1e-8 || Math.hypot(...n2r) < 1e-8) continue

    const isCrossPiece = Boolean(isGarmentAssembly && renderTriPieceIdx && tC.pieceIdx !== tD.pieceIdx)
    const n2Sign = isCrossPiece
      ? 1
      : ((tD.a === p2 && tD.b === p1) ? 1 : -1)
    const seamScale = isCrossPiece ? 0.20 : 1.0

    let canonRest = 0.0
    if (!isGarmentAssembly) {
      const measured = dihedralAngle(pt1, pt2, ptC, ptD)
      if (measured === null) continue
      canonRest = measured
    }

    bendSets[c].add(d)
    bendSets[d].add(c)
    const rec = { p1, p2, c, d, n2Sign, seamScale, canonRest }
    hingeForWingPair.set(`${c}_${d}`, rec)
    hingeForWingPair.set(`${d}_${c}`, rec)
    hingeForEdge.set(key, rec)
  }

  const dist = (a, b) => Math.hypot(
    simRestPositions[a * 3] - simRestPositions[b * 3],
    simRestPositions[a * 3 + 1] - simRestPositions[b * 3 + 1],
    simRestPositions[a * 3 + 2] - simRestPositions[b * 3 + 2],
  )
  // Overflow rule: keep the `maxNeighbors` shortest-rest-length neighbors,
  // drop the rest — most particles (interior grid, 2-piece seams) never hit
  // this; only rare 3+-piece corners can exceed a Delaunay mesh's typical
  // ~6 neighbors. Apply per-particle elastic/intimate rest-length contraction
  // (`simRestScale`) uniformly across connected structural & bend springs.
  function packNeighbors(sets) {
    const idx = new Int32Array(simParticleCount * maxNeighbors).fill(-1)
    const rest = new Float32Array(simParticleCount * maxNeighbors)
    for (let p = 0; p < simParticleCount; p++) {
      const spScale = simRestScale ? simRestScale[p] : 1.0
      const neighbors = [...sets[p]].map((n) => [n, dist(p, n)]).sort((a, b) => a[1] - b[1]).slice(0, maxNeighbors)
      neighbors.forEach(([n, d], k) => {
        const snScale = simRestScale ? simRestScale[n] : 1.0
        const edgeScale = 0.5 * (spScale + snScale)
        idx[p * maxNeighbors + k] = n
        rest[p * maxNeighbors + k] = d * edgeScale
      })
    }
    return { idx, rest }
  }

  const structural = packNeighbors(structuralSets)
  const bend = packNeighbors(bendSets)

  // Fast 4-way slot completeness check: only activate a 4-vertex momentum-conserving
  // hinge if p1, p2, c, and d all retain their corresponding slot within `maxNeighbors`.
  const structSlotSet = new Set()
  const bendSlotSet = new Set()
  for (let p = 0; p < simParticleCount; p++) {
    for (let k = 0; k < maxNeighbors; k++) {
      const sn = structural.idx[p * maxNeighbors + k]
      if (sn >= 0) structSlotSet.add(`${p}_${sn}`)
      const bn = bend.idx[p * maxNeighbors + k]
      if (bn >= 0) bendSlotSet.add(`${p}_${bn}`)
    }
  }
  const hasAll4Slots = (rec) => (
    bendSlotSet.has(`${rec.c}_${rec.d}`) &&
    bendSlotSet.has(`${rec.d}_${rec.c}`) &&
    structSlotSet.has(`${rec.p1}_${rec.p2}`) &&
    structSlotSet.has(`${rec.p2}_${rec.p1}`)
  )

  function packHinges() {
    const idx = new Int32Array(simParticleCount * maxNeighbors).fill(-1)
    const edgeV0 = new Int32Array(simParticleCount * maxNeighbors).fill(-1)
    const edgeV1 = new Int32Array(simParticleCount * maxNeighbors).fill(-1)
    const restAngle = new Float32Array(simParticleCount * maxNeighbors)
    const n2Sign = new Int8Array(simParticleCount * maxNeighbors).fill(1)
    const seamScale = new Float32Array(simParticleCount * maxNeighbors).fill(1)
    const active = new Uint8Array(simParticleCount * maxNeighbors)

    for (let p = 0; p < simParticleCount; p++) {
      for (let k = 0; k < maxNeighbors; k++) {
        const slot = p * maxNeighbors + k
        const n = bend.idx[slot]
        if (n < 0) continue
        const rec = hingeForWingPair.get(`${p}_${n}`)
        if (!rec) continue
        idx[slot] = n
        edgeV0[slot] = rec.p1
        edgeV1[slot] = rec.p2
        restAngle[slot] = p === rec.c ? rec.canonRest : (isGarmentAssembly ? 0.0 : -rec.canonRest)
        n2Sign[slot] = rec.n2Sign
        seamScale[slot] = rec.seamScale
        active[slot] = hasAll4Slots(rec) ? 1 : 0
      }
    }
    return { idx, edgeV0, edgeV1, restAngle, n2Sign, seamScale, active }
  }

  function packEdgeHinges() {
    const wingC = new Int32Array(simParticleCount * maxNeighbors).fill(-1)
    const wingD = new Int32Array(simParticleCount * maxNeighbors).fill(-1)
    const meIsP1 = new Uint8Array(simParticleCount * maxNeighbors)
    const n2Sign = new Int8Array(simParticleCount * maxNeighbors).fill(1)
    const seamScale = new Float32Array(simParticleCount * maxNeighbors).fill(1)
    const restAngle = new Float32Array(simParticleCount * maxNeighbors)
    const active = new Uint8Array(simParticleCount * maxNeighbors)

    for (let p = 0; p < simParticleCount; p++) {
      for (let k = 0; k < maxNeighbors; k++) {
        const slot = p * maxNeighbors + k
        const n = structural.idx[slot]
        if (n < 0) continue
        const key = p < n ? `${p}_${n}` : `${n}_${p}`
        const rec = hingeForEdge.get(key)
        if (!rec || !hasAll4Slots(rec)) continue
        wingC[slot] = rec.c
        wingD[slot] = rec.d
        meIsP1[slot] = p === rec.p1 ? 1 : 0
        n2Sign[slot] = rec.n2Sign
        seamScale[slot] = rec.seamScale
        restAngle[slot] = rec.canonRest
        active[slot] = 1
      }
    }
    return { wingC, wingD, meIsP1, n2Sign, seamScale, restAngle, active }
  }

  return {
    structural,
    bend,
    bendHinge: packHinges(),
    edgeHinge: packEdgeHinges(),
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
