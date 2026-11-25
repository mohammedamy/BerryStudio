import { describe, expect, test } from 'vitest'
import '../../../js/fancy-patterns.js'
import '../../../js/library.js'
import { PATTERNS, computeMeasurements } from '../../../js/data.js'
import { applyLookbookPieceColors } from '../../../js/pattern-lookbook-styles.js'
import { computeBodyDims } from '../body/computeBodyDims.js'
import { deriveGarmentPinMask } from '../body/collisionRig.js'
import { convertAppPattern } from '../pattern/importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from '../pattern/seamAuthoring.js'
import { triangulateAll, adaptiveSpacingCm } from '../pattern/triangulate.js'
import { assembleCloth, deriveNeighbors, deriveNormalRing } from './assemble.js'

function toPayloadPiece(p, i) {
  return {
    id: (p.key || 'piece') + '_' + i,
    visible: p.visible !== false,
    label: p.name || { en: 'Piece ' + (i + 1), ar: 'قطعة ' + (i + 1) },
    outline: p.outline,
    curves: p.curves || p.outline?.curves || undefined,
    darts: p.darts,
    notches: p.notches,
    grain: p.grain,
    role: p.role,
    cutOnFold: p.cutOnFold,
    foldEdgeIndex: p.foldEdgeIndex,
    bilateral: p.bilateral,
    edges: p.edges,
    grainline: p.grainline,
    color: p.color,
  }
}

function buildPipeline(patternId, { qualityTier = 'high', category = 'women' } = {}) {
  const m = computeMeasurements({ category, size: 'M', standard: 'intl' })
  const dims = computeBodyDims(m, category)
  const pat = PATTERNS[patternId]
  const rawFromApp = pat.pieces(m)
  const coloredPieces = applyLookbookPieceColors(rawFromApp, patternId, pat)

  const conv = convertAppPattern({
    patternId,
    designId: patternId,
    pieces: coloredPieces.map(toPayloadPiece),
    measurements: m,
    category,
  })

  const drafts = conv.rawPieces.map((rp) => createDraftPiece(rp, conv.roles[rp.id], conv.placementHints[rp.id]))
  const byId = Object.fromEntries(drafts.map((d) => [d.id, d]))
  for (const e of conv.edgeInstructions) {
    if (byId[e.pieceId]) addEdge(byId[e.pieceId], e.edgeName, e.fromIdx, e.toIdx)
  }
  const finalPieces = drafts.map((d) => finalizeDraftPiece({
    id: d.id,
    role: d.role,
    outline: d.outline,
    edges: { ...d.edges },
    placementHint: d.placementHint,
    color: d.color,
  }))

  const spacing = adaptiveSpacingCm(finalPieces, { qualityTier })
  const triangulated = triangulateAll(finalPieces, conv.seamInstructions, spacing)
  const cloth = assembleCloth(triangulated, dims, conv.seamInstructions, 'standing')
  const neighbors = deriveNeighbors(cloth, 8)
  return { coloredPieces, conv, finalPieces, triangulated, cloth, neighbors, dims }
}

function normalize3(x, y, z) {
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

describe('Garment Realism, Tailored Fit & Surface Shading', () => {
  test('6-neighbor deriveNormalRing yields < 4 deg angular error on a smooth cylinder', () => {
    // Build a synthetic cylinder mesh (24 radial segments x 12 vertical rings)
    const radialSegs = 24
    const rings = 12
    const radius = 0.22
    const simParticleCount = radialSegs * rings
    const simRestPositions = new Float32Array(simParticleCount * 3)
    const simRestNormal = new Float32Array(simParticleCount * 3)

    for (let r = 0; r < rings; r++) {
      const y = 0.6 + r * 0.04
      for (let s = 0; s < radialSegs; s++) {
        const idx = r * radialSegs + s
        const theta = (s / radialSegs) * Math.PI * 2
        const nx = Math.cos(theta)
        const nz = Math.sin(theta)
        simRestPositions[idx * 3] = nx * radius
        simRestPositions[idx * 3 + 1] = y
        simRestPositions[idx * 3 + 2] = nz * radius
        simRestNormal[idx * 3] = nx
        simRestNormal[idx * 3 + 1] = 0
        simRestNormal[idx * 3 + 2] = nz
      }
    }

    const maxNeighbors = 8
    const idx = new Int32Array(simParticleCount * maxNeighbors).fill(-1)
    const restLen = new Float32Array(simParticleCount * maxNeighbors)
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < radialSegs; s++) {
        const p = r * radialSegs + s
        const sNext = (s + 1) % radialSegs
        const sPrev = (s - 1 + radialSegs) % radialSegs
        const cand = []
        cand.push(r * radialSegs + sNext)
        if (r + 1 < rings) {
          cand.push((r + 1) * radialSegs + sNext)
          cand.push((r + 1) * radialSegs + s)
        }
        cand.push(r * radialSegs + sPrev)
        if (r - 1 >= 0) {
          cand.push((r - 1) * radialSegs + sPrev)
          cand.push((r - 1) * radialSegs + s)
        }
        for (let k = 0; k < cand.length && k < maxNeighbors; k++) {
          const n = cand[k]
          idx[p * maxNeighbors + k] = n
          restLen[p * maxNeighbors + k] = Math.hypot(
            simRestPositions[n * 3] - simRestPositions[p * 3],
            simRestPositions[n * 3 + 1] - simRestPositions[p * 3 + 1],
            simRestPositions[n * 3 + 2] - simRestPositions[p * 3 + 2],
          )
        }
      }
    }

    const ring6 = deriveNormalRing(
      { simParticleCount, simRestPositions, simRestNormal },
      { maxNeighbors, structural: { idx, restLen } },
      6,
    )

    let maxErrDeg = 0
    for (let r = 1; r < rings - 1; r++) {
      for (let s = 0; s < radialSegs; s++) {
        const p = r * radialSegs + s
        const px = simRestPositions[p * 3]
        const py = simRestPositions[p * 3 + 1]
        const pz = simRestPositions[p * 3 + 2]

        // Mirror GLSL 6-neighbor cross-product loop
        let sx = 0, sy = 0, sz = 0
        for (let k = 0; k < 6; k++) {
          const nA = ring6[p * 6 + k]
          const nB = ring6[p * 6 + ((k + 1) % 6)]
          const ax = simRestPositions[nA * 3] - px
          const ay = simRestPositions[nA * 3 + 1] - py
          const az = simRestPositions[nA * 3 + 2] - pz
          const bx = simRestPositions[nB * 3] - px
          const by = simRestPositions[nB * 3 + 1] - py
          const bz = simRestPositions[nB * 3 + 2] - pz
          sx += ay * bz - az * by
          sy += az * bx - ax * bz
          sz += ax * by - ay * bx
        }
        const [nx, ny, nz] = normalize3(sx, sy, sz)
        const tx = simRestNormal[p * 3]
        const ty = simRestNormal[p * 3 + 1]
        const tz = simRestNormal[p * 3 + 2]
        const dot = Math.max(-1, Math.min(1, nx * tx + ny * ty + nz * tz))
        const errDeg = (Math.acos(dot) * 180) / Math.PI
        if (errDeg > maxErrDeg) maxErrDeg = errDeg
      }
    }

    expect(maxErrDeg).toBeLessThan(4.0)
  })

  test('wf01 and wf02 sew princess bodice to skirt waist, match hemFacing color to skirt, and tuck facing/pockets', () => {
    for (const id of ['wf01', 'wf02']) {
      const { coloredPieces, conv, triangulated, cloth, neighbors } = buildPipeline(id)

      // 1. gownWaist_* seams connect all 6 princess bodice panels to skirt gores
      const waistSeams = conv.seamInstructions.filter((s) => String(s.id).startsWith('gownWaist_'))
      expect(waistSeams.length).toBe(6)
      for (const seamId of ['gownWaist_FC', 'gownWaist_BC', 'gownWaist_FS_R', 'gownWaist_BS_R', 'gownWaist_FS_L', 'gownWaist_BS_L']) {
        expect(
          waistSeams.some((s) => s.id === seamId),
          `${id} missing ${seamId}`,
        ).toBe(true)
      }

      // 2. hemFacing uses skirt color (not gold #d4af37)
      const hemPiece = coloredPieces.find((p) => /hemFacing/i.test(p.key || p.id || ''))
      const skirtPiece = coloredPieces.find((p) => /skirtF/i.test(p.key || p.id || ''))
      expect(hemPiece).toBeDefined()
      expect(skirtPiece).toBeDefined()
      expect(hemPiece.color.toLowerCase()).toBe(skirtPiece.color.toLowerCase())
      expect(hemPiece.color.toLowerCase()).not.toBe('#d4af37')

      // 3. hemFacing placed near the floor hem (maxY < 0.30) and pocket tucked inside lateral hip
      const hemIdx = conv.rawPieces.findIndex((p) => /hemFacing/i.test(p.id))
      expect(hemIdx).toBeGreaterThanOrEqual(0)
      const hemStart = cloth.pieceOffset[conv.rawPieces[hemIdx].id]
      const hemEnd = hemStart + triangulated[hemIdx].positions2D.length
      let hemMaxY = -Infinity
      for (let v = hemStart; v < hemEnd; v++) {
        const p = cloth.renderVertexToSimParticle[v]
        const y = cloth.simRestPositions[p * 3 + 1]
        if (y > hemMaxY) hemMaxY = y
      }
      expect(hemMaxY).toBeLessThan(0.30)

      const pocketIdx = conv.rawPieces.findIndex((p) => conv.roles[p.id] === 'pocket')
      if (pocketIdx >= 0) {
        const pocketStart = cloth.pieceOffset[conv.rawPieces[pocketIdx].id]
        const pocketEnd = pocketStart + triangulated[pocketIdx].positions2D.length
        let sumAbsX = 0, sumAbsZ = 0, cnt = 0
        for (let v = pocketStart; v < pocketEnd; v++) {
          const p = cloth.renderVertexToSimParticle[v]
          sumAbsX += Math.abs(cloth.simRestPositions[p * 3])
          sumAbsZ += Math.abs(cloth.simRestPositions[p * 3 + 2])
          cnt++
        }
        expect(cnt).toBeGreaterThan(0)
        // Lateral hip seam: avg |x| > avg |z|
        expect(sumAbsX / cnt).toBeGreaterThan(sumAbsZ / cnt)
      }

      // 4. Outward 3D triangle winding across garment pieces (check aggregate outward dot per piece)
      const tris = cloth.renderTriangles
      const triPieces = cloth.renderTriPieceIdx
      const pieceCount = conv.rawPieces.length
      const dotSums = new Float64Array(pieceCount)
      for (let t = 0; t < tris.length; t += 3) {
        const pi = triPieces[t / 3]
        const pa = cloth.renderVertexToSimParticle[tris[t]]
        const pb = cloth.renderVertexToSimParticle[tris[t + 1]]
        const pc = cloth.renderVertexToSimParticle[tris[t + 2]]
        const ax = cloth.simRestPositions[pa * 3], ay = cloth.simRestPositions[pa * 3 + 1], az = cloth.simRestPositions[pa * 3 + 2]
        const bx = cloth.simRestPositions[pb * 3], by = cloth.simRestPositions[pb * 3 + 1], bz = cloth.simRestPositions[pb * 3 + 2]
        const cx = cloth.simRestPositions[pc * 3], cy = cloth.simRestPositions[pc * 3 + 1], cz = cloth.simRestPositions[pc * 3 + 2]
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
        const nx = e1y * e2z - e1z * e2y
        const nz = e1x * e2y - e1y * e2x
        const mx = (ax + bx + cx) / 3
        const mz = (az + bz + cz) / 3
        dotSums[pi] += nx * mx + nz * mz
      }
      for (let pi = 0; pi < pieceCount; pi++) {
        // Every shell piece except internal inward-facing pocket/facing must face outward radially
        const role = conv.roles[conv.rawPieces[pi].id]
        if (role === 'pocket' || role === 'hem-band') continue
        expect(dotSums[pi], `${id} piece ${conv.rawPieces[pi].id} inward`).toBeGreaterThan(0)
      }

      // 5. Cross-piece edgeHinge n2Sign consistency: verify wing d matches n2Sign relative to edge (p1->p2)
      const { maxNeighbors } = neighbors
      const { idx: sIdx } = neighbors.structural
      const { wingD, meIsP1, n2Sign: ehSign, seamScale, active } = neighbors.edgeHinge
      const triSetByEdge = new Map()
      const triEdgeKey = (u, v) => (u < v ? `${u}:${v}` : `${v}:${u}`)
      for (let t = 0; t < tris.length; t += 3) {
        const ra = cloth.renderVertexToSimParticle[tris[t]]
        const rb = cloth.renderVertexToSimParticle[tris[t + 1]]
        const rc = cloth.renderVertexToSimParticle[tris[t + 2]]
        if (ra === rb || rb === rc || rc === ra) continue
        const edges = [
          [ra, rb, rc],
          [rb, rc, ra],
          [rc, ra, rb],
        ]
        for (const [u, v, opp] of edges) {
          const k = triEdgeKey(u, v)
          let list = triSetByEdge.get(k)
          if (!list) { list = []; triSetByEdge.set(k, list) }
          list.push({ a: u, b: v, c: opp })
        }
      }

      let checkedCross = 0
      let invertedCross = 0
      for (let p1 = 0; p1 < cloth.simParticleCount; p1++) {
        for (let k = 0; k < maxNeighbors; k++) {
          const slot = p1 * maxNeighbors + k
          if (active[slot] !== 1 || meIsP1[slot] !== 1 || seamScale[slot] >= 0.9) continue
          const p2 = sIdx[slot]
          const pd = wingD[slot]
          if (p2 < 0 || pd < 0) continue
          const adj = triSetByEdge.get(triEdgeKey(p1, p2))
          if (!adj) continue
          const matchD = adj.find((t) => t.c === pd)
          if (!matchD) continue
          const expectedSign = (matchD.a === p2 && matchD.b === p1) ? 1 : -1
          checkedCross++
          if (ehSign[slot] !== expectedSign) invertedCross++
        }
      }
      expect(checkedCross).toBeGreaterThan(20)
      expect(invertedCross).toBe(0)
    }
  })

  test('mf01 tuxedo collar hugs neck base and split front panels receive symmetric shoulder + waist-button pins', () => {
    const { triangulated, cloth, dims } = buildPipeline('mf01', { category: 'men' })
    const pins = deriveGarmentPinMask(cloth, triangulated, dims)

    const collarTp = triangulated.find((tp) => /collar/i.test(tp.pieceId))
    expect(collarTp).toBeDefined()
    const cStart = cloth.pieceOffset[collarTp.pieceId]
    const cEnd = cStart + collarTp.positions2D.length
    let collarMaxAbsX = 0
    for (let v = cStart; v < cEnd; v++) {
      const p = cloth.renderVertexToSimParticle[v]
      collarMaxAbsX = Math.max(collarMaxAbsX, Math.abs(cloth.simRestPositions[p * 3]))
    }
    expect(collarMaxAbsX).toBeLessThan(0.14)

    for (const sideId of ['front_0_r', 'front_0_l']) {
      const tp = triangulated.find((t) => t.pieceId === sideId)
      expect(tp).toBeDefined()
      const offset = cloth.pieceOffset[sideId]
      let minY = Infinity, maxY = -Infinity
      for (const [, y] of tp.positions2D) {
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      const H = maxY - minY
      let shoulderPins = 0
      let buttonPins = 0
      for (let i = 0; i < tp.positions2D.length; i++) {
        const y = tp.positions2D[i][1]
        const sp = cloth.renderVertexToSimParticle[offset + i]
        if (!pins[sp]) continue
        if (y <= minY + 6.6) shoulderPins++
        if (y >= minY + H * 0.44 && y <= minY + H * 0.62) buttonPins++
      }
      expect(shoulderPins, `${sideId} shoulder pins`).toBeGreaterThanOrEqual(6)
      expect(buttonPins, `${sideId} waist-button pins`).toBeGreaterThanOrEqual(2)
    }
  })

  test('mf10 sherwani collar, wide facing, and sloped back receive full walk-ready pins and GPU matrix pin transforms exist', async () => {
    const { triangulated, cloth, dims } = buildPipeline('mf10', { category: 'men' })
    const pins = deriveGarmentPinMask(cloth, triangulated, dims)

    const countPins = (pieceId) => {
      const tp = triangulated.find((t) => t.pieceId === pieceId)
      expect(tp, `missing piece ${pieceId}`).toBeDefined()
      const off = cloth.pieceOffset[pieceId]
      let pc = 0
      let minY = Infinity
      let maxY = -Infinity
      for (let i = 0; i < tp.positions2D.length; i++) {
        const sp = cloth.renderVertexToSimParticle[off + i]
        if (pins[sp]) pc++
        const y = cloth.simRestPositions[sp * 3 + 1]
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      return { pc, total: tp.positions2D.length, minY, maxY }
    }

    const col = countPins('collar_5')
    expect(col.pc / col.total).toBeGreaterThanOrEqual(0.85)
    expect(col.minY).toBeGreaterThan(dims.shoulderY - 0.01)
    expect(col.maxY).toBeGreaterThan(dims.shoulderY + 0.018)

    const fac = countPins('facing_8')
    expect(fac.pc / fac.total).toBeGreaterThanOrEqual(0.55)

    const back = countPins('back_2')
    expect(back.pc).toBeGreaterThanOrEqual(14)

    const { readFile } = await import('node:fs/promises')
    const simSrc = await readFile(new URL('./ClothSimulation.js', import.meta.url), 'utf8')
    expect(simSrc).toContain('uChestPinMat')
    expect(simSrc).toContain('uPelvisPinMat')
    expect(simSrc).toContain('pinTransforms')
  })
})
