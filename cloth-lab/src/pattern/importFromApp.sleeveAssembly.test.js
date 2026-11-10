import { describe, test, expect } from 'vitest'
import { PATTERNS } from '../../../js/data.js'
import '../../../js/library.js'
import '../../../js/fancy-patterns.js'
import { convertAppPattern } from './importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring.js'
import { triangulateAll } from './triangulate.js'
import { assembleCloth } from '../cloth/assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'
import { placeSleeve } from './placement.js'
import { autoPlan } from '../workflow/autoSetup.js'

const SAMPLE_M = {
  women: { chest: 92, waist: 74, hips: 100, shoulder: 40, backLen: 40, sleeve: 58, neck: 36, bicep: 28, inseam: 76, thigh: 56, height: 165 },
  men: { chest: 102, waist: 88, hips: 100, shoulder: 46, backLen: 44, sleeve: 63, neck: 40, bicep: 32, inseam: 82, thigh: 60, height: 178 },
  girls: { chest: 66, waist: 58, hips: 70, shoulder: 30, backLen: 30, sleeve: 44, neck: 28, bicep: 20, inseam: 55, thigh: 40, height: 130 },
}

function toPayloadPiece(p, i) {
  return {
    id: (p.key || 'piece') + '_' + i,
    label: p.name,
    outline: p.outline,
    darts: p.darts,
    notches: p.notches,
    grain: p.grain,
    role: p.role,
    cutOnFold: p.cutOnFold,
    foldEdgeIndex: p.foldEdgeIndex,
    bilateral: p.bilateral,
    edges: p.edges,
    grainline: p.grainline,
    princessSeamId: p.princessSeamId,
    necklineEndIdx: p.necklineEndIdx,
    sideEndIdx: p.sideEndIdx,
    color: p.color,
  }
}

function buildFinalPieces(result) {
  const drafts = result.rawPieces.map((rp) => createDraftPiece(rp, result.roles[rp.id]))
  const byId = Object.fromEntries(drafts.map((d) => [d.id, d]))
  for (const { pieceId, edgeName, fromIdx, toIdx } of result.edgeInstructions) {
    const d = byId[pieceId]
    if (d) addEdge(d, edgeName, fromIdx, toIdx)
  }
  const finalPieces = drafts.map((d) =>
    finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges } }),
  )
  return { drafts, byId, finalPieces }
}

function edgeStartEnd(draft, edgeName) {
  const e = draft.edges[edgeName]
  return [draft.outline[e.from], draft.outline[e.to]]
}

function assertSleeveAnatomy(result, byId) {
  const sleeveIds = Object.entries(result.roles)
    .filter(([, role]) => role === 'sleeve')
    .map(([id]) => id)
  expect(sleeveIds.length).toBeGreaterThanOrEqual(2)

  for (const sid of sleeveIds) {
    const d = byId[sid]
    expect(Object.keys(d.edges).sort()).toEqual(['backSeam', 'capBack', 'capFront', 'frontSeam'])

    // Verify bottom cuff stretch is completely free/unclaimed on BOTH R and L sleeves
    const n = d.outline.length
    const covered = new Set()
    for (const e of Object.values(d.edges)) {
      for (let step = 0; step < n; step++) {
        const idx = (e.from + step) % n
        if (idx === e.to) break
        covered.add(idx)
      }
    }
    const freeSegments = []
    for (let i = 0; i < n; i++) {
      if (!covered.has(i)) freeSegments.push(i)
    }
    expect(freeSegments.length, `${sid} must leave bottom cuff edge open`).toBeGreaterThanOrEqual(1)
    const ys = d.outline.map((p) => p[1])
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    for (const segStart of freeSegments) {
      const pA = d.outline[segStart]
      const pB = d.outline[(segStart + 1) % n]
      expect(pA[1]).toBeGreaterThan(minY + (maxY - minY) * 0.7)
      expect(pB[1]).toBeGreaterThan(minY + (maxY - minY) * 0.7)
    }

    // Verify self-tube seam (frontSeam <-> backSeam, reverse: true, pairing top-with-top and cuff-with-cuff)
    const tube = result.seamInstructions.find(
      (s) => s.a.piece === sid && s.b.piece === sid,
    )
    expect(tube, `${sid} should close its long side seams into a tube`).toBeTruthy()
    expect([tube.a.edge, tube.b.edge].sort()).toEqual(['backSeam', 'frontSeam'])
    expect(tube.reverse).toBe(true)
    const [a0, a1] = edgeStartEnd(d, tube.a.edge)
    const [b0, b1] = edgeStartEnd(d, tube.b.edge)
    const pairedB0 = tube.reverse ? b1 : b0
    const pairedB1 = tube.reverse ? b0 : b1
    // Paired endpoints must sit at matching vertical levels (underarm meets underarm, cuff meets cuff)
    expect(Math.abs(a0[1] - pairedB0[1])).toBeLessThan((maxY - minY) * 0.15)
    expect(Math.abs(a1[1] - pairedB1[1])).toBeLessThan((maxY - minY) * 0.15)

    // Verify capFront sews to front armhole and capBack sews to back armhole without vertical inversion
    for (const [capEdge, expectedBodiceRole] of [['capFront', 'frontPanel'], ['capBack', 'backPanel']]) {
      const seam = result.seamInstructions.find(
        (s) =>
          (s.a.piece === sid && s.a.edge === capEdge) ||
          (s.b.piece === sid && s.b.edge === capEdge),
      )
      expect(seam, `${sid}:${capEdge} should sew to ${expectedBodiceRole} armhole`).toBeTruthy()
      const partner = seam.a.piece === sid ? seam.b : seam.a
      expect(result.roles[partner.piece]).toBe(expectedBodiceRole)
      expect(partner.edge).toMatch(/armhole/i)

      // Check orientation: shoulder end of armhole never welds to underarm end of sleeve cap
      const [sa0, sa1] = edgeStartEnd(byId[seam.a.piece], seam.a.edge)
      const [sb0, sb1] = edgeStartEnd(byId[seam.b.piece], seam.b.edge)
      const [pb0, pb1] = seam.reverse ? [sb1, sb0] : [sb0, sb1]
      expect((sa1[1] - sa0[1]) * (pb1[1] - pb0[1])).toBeGreaterThanOrEqual(-1e-6)
    }
  }
}

describe('universal automatic sleeve decomposition & bodice armhole assembly', () => {
  test.each([
    ['womens_dress', 'women'],
    ['mens_shirt', 'men'],
    ['thobe', 'men'],
    ['girls_dress', 'girls'],
  ])('%s decomposes sleeves into capFront + capBack + side tube + free cuff and attaches to front/back armholes', (id, category) => {
    const m = SAMPLE_M[category]
    const payload = {
      pieces: PATTERNS[id].pieces(m).map(toPayloadPiece),
      measurements: m,
      category,
    }
    const result = convertAppPattern(payload)
    const { byId, finalPieces } = buildFinalPieces(result)
    assertSleeveAnatomy(result, byId)

    const dims = computeBodyDims(m, category)
    const triangulated = triangulateAll(finalPieces, result.seamInstructions)
    const cloth = assembleCloth(triangulated, dims, result.seamInstructions)
    expect(cloth.simParticleCount).toBeGreaterThan(0)
  })

  test('user-drawn 4-point rectangular/trapezoidal sleeve & bodices auto-split and sew completely once assigned role="sleeve"', () => {
    const customSource = {
      designId: 'custom-user-shirt',
      category: 'women',
      measurements: SAMPLE_M.women,
      pieces: [
        { id: 'u_front', label: 'الجزء الأمامي', outline: [[0, 0], [46, 0], [46, 55], [0, 55]] },
        { id: 'u_back', label: 'الجزء الخلفي', outline: [[0, 0], [46, 0], [46, 55], [0, 55]] },
        { id: 'u_sleeve', label: 'قطعة الكم', outline: [[0, 0], [34, 0], [28, 54], [6, 54]] },
      ],
    }
    const { plan } = autoPlan(customSource)
    expect(plan.ready).toBe(true)
    const result = plan.imported
    const { byId, finalPieces } = buildFinalPieces(result)

    assertSleeveAnatomy(result, byId)

    const dims = computeBodyDims(SAMPLE_M.women, 'women')
    const triangulated = triangulateAll(finalPieces, result.seamInstructions)
    const cloth = assembleCloth(triangulated, dims, result.seamInstructions)
    expect(cloth.simParticleCount).toBeGreaterThan(0)
  })

  test('princess-seamed sleeved garments attach sleeve capFront/capBack to front-side and back-side armholes', () => {
    const princessSleevedEntry = Object.entries(PATTERNS).find(([, entry]) => {
      if (entry.category !== 'women') return false
      const pcs = entry.pieces(SAMPLE_M.women)
      return (
        pcs.some((p) => p.role === 'bodice-front-side') &&
        pcs.some((p) => p.role === 'bodice-back-side') &&
        pcs.some((p) => p.role === 'sleeve')
      )
    })
    expect(princessSleevedEntry).toBeTruthy()
    const [, entry] = princessSleevedEntry
    const payload = {
      pieces: entry.pieces(SAMPLE_M.women).map(toPayloadPiece),
      measurements: SAMPLE_M.women,
      category: 'women',
    }
    const result = convertAppPattern(payload)
    const { byId } = buildFinalPieces(result)
    assertSleeveAnatomy(result, byId)
  })

  test('placeSleeve orients capFront toward +Z (front), capBack toward -Z (back), and capTop on outer shoulder for both arms', () => {
    const dims = computeBodyDims(SAMPLE_M.women, 'women')
    const payload = {
      pieces: PATTERNS.womens_dress.pieces(SAMPLE_M.women).map(toPayloadPiece),
      measurements: SAMPLE_M.women,
      category: 'women',
    }
    const result = convertAppPattern(payload)
    const { byId } = buildFinalPieces(result)
    const sleeveIds = Object.keys(result.roles).filter((id) => result.roles[id] === 'sleeve')
    expect(sleeveIds).toHaveLength(2)

    for (const sid of sleeveIds) {
      const side = sid.endsWith('_l') ? -1 : 1
      const d = byId[sid]
      const capTopIdx = d.edges.capFront.to === d.edges.capBack.from ? d.edges.capFront.to : d.edges.capFront.from
      const [cf0, cf1] = edgeStartEnd(d, 'capFront')
      const [cb0, cb1] = edgeStartEnd(d, 'capBack')
      const capFrontMid2D = [(cf0[0] + cf1[0]) / 2, (cf0[1] + cf1[1]) / 2]
      const capBackMid2D = [(cb0[0] + cb1[0]) / 2, (cb0[1] + cb1[1]) / 2]
      const pos3d = placeSleeve([...d.outline, capFrontMid2D, capBackMid2D], dims, side)
      const capFrontMid3D = pos3d[d.outline.length]
      const capBackMid3D = pos3d[d.outline.length + 1]

      // Cap crown sits on the outer side of the shoulder near Z = 0
      expect(Math.abs(pos3d[capTopIdx][2])).toBeLessThan(0.02)
      // Front sleeve cap faces +Z (toward Front Bodice armhole)
      expect(capFrontMid3D[2]).toBeGreaterThan(0.02)
      // Back sleeve cap faces -Z (toward Back Bodice armhole)
      expect(capBackMid3D[2]).toBeLessThan(-0.02)
    }
  })
})
