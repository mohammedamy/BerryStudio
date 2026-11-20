import { describe, test, expect } from 'vitest'
import '../../../js/library.js'
import '../../../js/girls-leotards.js'
import '../../../js/fancy-patterns.js'
import '../../../js/underwear-library.js'
import '../../../js/reference-patterns.js'
import { PATTERNS, computeMeasurements } from '../../../js/data.js'
import { convertAppPattern } from './importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring.js'
import { triangulateAll, adaptiveSpacingCm } from './triangulate.js'
import { assembleCloth } from '../cloth/assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'
import { placePiece } from './placement.js'
import { deriveGarmentPinMask } from '../body/collisionRig.js'
import { FABRIC_IDS } from '../cloth/fabricPresets.js'

const measCache = new Map()
const dimsCache = new Map()

function makeMeasurements(category) {
  if (!measCache.has(category)) {
    const isKids = category === 'girls' || category === 'boys'
    measCache.set(
      category,
      computeMeasurements({ category, size: 'M', standard: 'intl', kids: isKids ? '8-9' : undefined })
    )
  }
  return measCache.get(category)
}

function getCategoryDims(category) {
  if (!dimsCache.has(category)) {
    dimsCache.set(category, computeBodyDims(makeMeasurements(category), category))
  }
  return dimsCache.get(category)
}

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
    princessSeamId: p.princessSeamId,
    necklineEndIdx: p.necklineEndIdx,
    sideEndIdx: p.sideEndIdx,
    autoTorsoSeams: p.autoTorsoSeams,
    bodyZone: p.bodyZone,
    color: p.color,
  }
}

function chainLen(positions, chain) {
  let sum = 0
  for (let i = 0; i < chain.length - 1; i++) {
    const a = positions[chain[i]], b = positions[chain[i + 1]]
    if (a && b) sum += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return sum
}

const ALL_IDS = Object.keys(PATTERNS)

test('library contains all 320 patterns and convertAppPattern accepts all 13 fabrics including velvet & lace', () => {
  expect(ALL_IDS).toHaveLength(320)
  expect(FABRIC_IDS).toContain('velvet')
  expect(FABRIC_IDS).toContain('lace')
  const m = makeMeasurements('women')
  const basePieces = PATTERNS.womens_dress.pieces(m).map(toPayloadPiece)
  for (const fab of FABRIC_IDS) {
    const res = convertAppPattern({ pieces: basePieces, measurements: m, category: 'women', fabricId: fab })
    expect(res.fabricId, `fabricId=${fab} should not be dropped`).toBe(fab)
  }
})

describe('all 320 patterns assemble cleanly without crashes, skips, NaNs, unpinned islands, or misplaced roles', () => {
  test('sweeps every pattern across all categories', () => {
    const crashes = []
    const skips = []
    const nanPatterns = []
    const unpinnedPatterns = []
    const misplacedRoles = []

    for (const id of ALL_IDS) {
      const entry = PATTERNS[id]
      const category = entry.category || 'women'
      const m = makeMeasurements(category)
      const dims = getCategoryDims(category)
      const pieces = entry.pieces(m)
      const payload = {
        designId: id,
        pieces: pieces.map(toPayloadPiece),
        measurements: m,
        category,
        fabricId: null,
        avatarGLB: {},
      }

      try {
        const res = convertAppPattern(payload)
        if (res.skipped.length > 0) skips.push({ id, skipped: res.skipped })

        const drafts = res.rawPieces.map((rp) => createDraftPiece(rp, res.roles[rp.id], res.placementHints?.[rp.id]))
        const byId = Object.fromEntries(drafts.map((d) => [d.id, d]))
        for (const { pieceId, edgeName, fromIdx, toIdx } of res.edgeInstructions) {
          if (byId[pieceId]) addEdge(byId[pieceId], edgeName, fromIdx, toIdx)
        }
        const finalPieces = drafts.map((d) => finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges }, placementHint: d.placementHint }))
        const triangulated = triangulateAll(finalPieces, res.seamInstructions, 2)
        const cloth = assembleCloth(triangulated, dims, res.seamInstructions, 'standing')
        const pinMask = deriveGarmentPinMask(cloth, triangulated, dims)

        for (let i = 0; i < cloth.simRestPositions.length; i++) {
          if (!Number.isFinite(cloth.simRestPositions[i])) {
            nanPatterns.push(id)
            break
          }
        }

        // Verify placement role hygiene for accessories that previously fell to attachBody
        for (const p of payload.pieces) {
          const placedRole = res.roles[p.id] || res.roles[p.id + '_r']
          if (!placedRole) continue
          if (['gusset', 'cuff', 'rib-cuff', 'hem-band'].includes(p.role) && placedRole === 'attachBody') {
            misplacedRoles.push({ id, piece: p.id, schemaRole: p.role, placedRole })
          }
          if (p.role === 'elastic-band' && /waist|خصر|كمر/i.test(`${p.label?.en || ''} ${p.id}`) && placedRole === 'attachBody') {
            misplacedRoles.push({ id, piece: p.id, schemaRole: p.role, placedRole })
          }
        }

        const parent = new Int32Array(cloth.simParticleCount)
        for (let i = 0; i < parent.length; i++) parent[i] = i
        const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
        const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
        for (let t = 0; t < cloth.renderTriangles.length; t += 3) {
          union(
            cloth.renderVertexToSimParticle[cloth.renderTriangles[t]],
            cloth.renderVertexToSimParticle[cloth.renderTriangles[t + 1]]
          )
          union(
            cloth.renderVertexToSimParticle[cloth.renderTriangles[t + 1]],
            cloth.renderVertexToSimParticle[cloth.renderTriangles[t + 2]]
          )
        }
        const compPins = new Map()
        for (let i = 0; i < cloth.simParticleCount; i++) {
          const r = find(i)
          compPins.set(r, (compPins.get(r) || 0) + (pinMask[i] ? 1 : 0))
        }
        for (const [, count] of compPins) {
          if (count === 0) {
            unpinnedPatterns.push(id)
            break
          }
        }
      } catch (err) {
        crashes.push({ id, error: err.message })
      }
    }

    expect(crashes, `Crashes: ${JSON.stringify(crashes)}`).toEqual([])
    expect(skips, `Skipped: ${JSON.stringify(skips)}`).toEqual([])
    expect(nanPatterns, `NaN vertices: ${JSON.stringify(nanPatterns)}`).toEqual([])
    expect(unpinnedPatterns, `Unpinned components: ${JSON.stringify(unpinnedPatterns)}`).toEqual([])
    expect(misplacedRoles, `Misplaced roles: ${JSON.stringify(misplacedRoles)}`).toEqual([])
  }, 30000)
})

test('all 7 4-gore skirts, mf04 wrap coat, wb09/gb07 sport bras, and thobe sleeve armhole produce proper seams', () => {
  for (const id of ['w12', 'w15', 'g06', 'g13', 'g17', 'g21', 'ref_w_skirt']) {
    const entry = PATTERNS[id]
    const m = makeMeasurements(entry.category)
    const res = convertAppPattern({ pieces: entry.pieces(m).map(toPayloadPiece), measurements: m, category: entry.category })
    expect(res.seamInstructions.filter((s) => s.id.startsWith('goreRing_')), `${id} 4-gore ring seams`).toHaveLength(4)
  }

  for (const id of ['mf04', 'wb09', 'gb07']) {
    const entry = PATTERNS[id]
    const m = makeMeasurements(entry.category)
    const res = convertAppPattern({ pieces: entry.pieces(m).map(toPayloadPiece), measurements: m, category: entry.category })
    expect(res.seamInstructions.length, `${id} should have >= 2 seams`).toBeGreaterThanOrEqual(2)
  }

  const tm = makeMeasurements('men')
  const thobePayload = { pieces: PATTERNS.thobe.pieces(tm).map(toPayloadPiece), measurements: tm, category: 'men' }
  const tRes = convertAppPattern(thobePayload)
  const drafts = tRes.rawPieces.map((rp) => createDraftPiece(rp, tRes.roles[rp.id]))
  const byId = Object.fromEntries(drafts.map((d) => [d.id, d]))
  for (const { pieceId, edgeName, fromIdx, toIdx } of tRes.edgeInstructions) {
    if (byId[pieceId]) addEdge(byId[pieceId], edgeName, fromIdx, toIdx)
  }
  const finalPieces = drafts.map((d) => finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges } }))
  const tri = triangulateAll(finalPieces, tRes.seamInstructions)
  const triById = Object.fromEntries(tri.map((tp) => [tp.pieceId, tp]))
  const capSeam = tRes.seamInstructions.find((s) => s.id.endsWith('_capFront'))
  expect(capSeam).toBeTruthy()
  const armLen = chainLen(triById[capSeam.a.piece].positions2D, triById[capSeam.a.piece].boundaryChains[capSeam.a.edge])
  const capLen = chainLen(triById[capSeam.b.piece].positions2D, triById[capSeam.b.piece].boundaryChains[capSeam.b.edge])
  const ratio = Math.max(armLen, capLen) / Math.min(armLen, capLen)
  expect(ratio).toBeLessThanOrEqual(1.8)
}, 15000)

test('all 320 patterns have zero twisted structural seams, zero unsewn target panels, and accurate underbust routing', () => {
  const TWIST_ROLES = new Set(['frontPanel', 'backPanel', 'hipPanelFront', 'hipPanelBack', 'legFront', 'legBack', 'goreFront', 'goreBack', 'goreSideLeft', 'goreSideRight', 'sleeve'])
  const STRUCTURAL_ROLES = new Set([...TWIST_ROLES])
  const TARGET_SEWN_IDS = ['abaya', 'girls_dress', 'wf01', 'wf02', 'mf05', 'mf15', 'bf07', 'bf10', 'bf13', 'gf15', 'ref_m_shirt', 'm04']
  const twisted = []
  const unsewn = []

  for (const id of ALL_IDS) {
    const entry = PATTERNS[id]
    const category = entry.category || 'women'
    const m = makeMeasurements(category)
    const dims = getCategoryDims(category)
    const res = convertAppPattern({ designId: id, pieces: entry.pieces(m).map(toPayloadPiece), measurements: m, category })

    if (TARGET_SEWN_IDS.includes(id)) {
      const sewn = new Set()
      for (const s of res.seamInstructions) { sewn.add(s.a.piece); sewn.add(s.b.piece) }
      for (const rp of res.rawPieces) {
        if (STRUCTURAL_ROLES.has(res.roles[rp.id]) && !sewn.has(rp.id)) unsewn.push(`${id}:${rp.id}`)
      }
    }

    if (id === 'wb09' || id === 'gb07') {
      const bandRole = Object.entries(res.roles).find(([k]) => /bandElastic/i.test(k))?.[1]
      expect(bandRole, `${id} bandElastic role`).toBe('attachUnderbust')
    }

    const byId = Object.fromEntries(res.rawPieces.map((rp) => [rp.id, rp]))
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
    for (const s of res.seamInstructions) {
      const ra = res.roles[s.a.piece], rb = res.roles[s.b.piece]
      if (!TWIST_ROLES.has(ra) || !TWIST_ROLES.has(rb)) continue
      const pa = byId[s.a.piece], pb = byId[s.b.piece]
      const ea = res.edgeInstructions.find((e) => e.pieceId === s.a.piece && e.edgeName === s.a.edge)
      const eb = res.edgeInstructions.find((e) => e.pieceId === s.b.piece && e.edgeName === s.b.edge)
      if (!pa || !pb || !ea || !eb) continue
      const p3A = placePiece({ pieceId: s.a.piece, role: ra, positions2D: pa.outline, placementHint: res.placementHints[s.a.piece] }, dims, 'standing')
      const p3B = placePiece({ pieceId: s.b.piece, role: rb, positions2D: pb.outline, placementHint: res.placementHints[s.b.piece] }, dims, 'standing')
      const a0 = p3A[ea.fromIdx], a1 = p3A[ea.toIdx]
      const b0 = s.reverse ? p3B[eb.toIdx] : p3B[eb.fromIdx]
      const b1 = s.reverse ? p3B[eb.fromIdx] : p3B[eb.toIdx]
      const dUsed = dist(a0, b0) + dist(a1, b1)
      const dOpp = dist(a0, b1) + dist(a1, b0)
      if (dUsed > dOpp + 0.12 && dUsed > 0.35) twisted.push(`${id}:${s.id}`)
    }
  }

  expect(unsewn, `Unsewn panels: ${JSON.stringify(unsewn)}`).toEqual([])
  expect(twisted, `Twisted seams: ${JSON.stringify(twisted)}`).toEqual([])

  // adaptiveSpacingCm keeps normal shirts at 2cm while keeping long full-length abaya within safe WebGL particle budget
  const shirtRes = convertAppPattern({ designId: 'mens_shirt', pieces: PATTERNS.mens_shirt.pieces(makeMeasurements('men')).map(toPayloadPiece), measurements: makeMeasurements('men'), category: 'men' })
  const shirtDrafts = shirtRes.rawPieces.map((rp) => createDraftPiece(rp, shirtRes.roles[rp.id], shirtRes.placementHints?.[rp.id]))
  const shirtById = Object.fromEntries(shirtDrafts.map((d) => [d.id, d]))
  for (const { pieceId, edgeName, fromIdx, toIdx } of shirtRes.edgeInstructions) if (shirtById[pieceId]) addEdge(shirtById[pieceId], edgeName, fromIdx, toIdx)
  const shirtFinal = shirtDrafts.map((d) => finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges }, placementHint: d.placementHint }))
  expect(adaptiveSpacingCm(shirtFinal)).toBe(2)

  const abayaMeas = makeMeasurements('women')
  const abayaRes = convertAppPattern({ designId: 'abaya', pieces: PATTERNS.abaya.pieces(abayaMeas).map(toPayloadPiece), measurements: abayaMeas, category: 'women' })
  const abayaDrafts = abayaRes.rawPieces.map((rp) => createDraftPiece(rp, abayaRes.roles[rp.id], abayaRes.placementHints?.[rp.id]))
  const abayaById = Object.fromEntries(abayaDrafts.map((d) => [d.id, d]))
  for (const { pieceId, edgeName, fromIdx, toIdx } of abayaRes.edgeInstructions) if (abayaById[pieceId]) addEdge(abayaById[pieceId], edgeName, fromIdx, toIdx)
  const abayaFinal = abayaDrafts.map((d) => finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges }, placementHint: d.placementHint }))
  const abayaCloth = assembleCloth(triangulateAll(abayaFinal, abayaRes.seamInstructions, adaptiveSpacingCm(abayaFinal)), getCategoryDims('women'), abayaRes.seamInstructions, 'standing')
  expect(abayaCloth.simParticleCount).toBeLessThanOrEqual(3800)
}, 25000)
