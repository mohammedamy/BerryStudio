import { describe, test, expect } from 'vitest'
import '../../../js/reference-patterns.js'
import { PATTERNS, computeMeasurements } from '../../../js/data.js'
import { convertAppPattern } from './importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring.js'
import { triangulateAll } from './triangulate.js'
import { assembleCloth } from '../cloth/assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'
import { deriveGarmentPinMask } from '../body/collisionRig.js'

const REF_IDS = Object.keys(PATTERNS).filter((id) => id.startsWith('ref_'))

function makeMeasurements(category) {
  const isKids = category === 'girls' || category === 'boys'
  return computeMeasurements({ category, size: 'M', standard: 'intl', kids: isKids ? '8-9' : undefined })
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

test('all 12 reference patterns are discovered', () => {
  expect(REF_IDS).toHaveLength(12)
})

describe.each(REF_IDS)('%s reference pattern end-to-end', (id) => {
  test('converts, triangulates, assembles with 0 NaNs, and pins every connected component', () => {
    const entry = PATTERNS[id]
    const category = entry.category
    const m = makeMeasurements(category)
    const pieces = entry.pieces(m)
    const payload = {
      pieces: pieces.map(toPayloadPiece),
      measurements: m,
      category,
      fabricId: null,
      avatarGLB: {},
    }

    const result = convertAppPattern(payload)
    expect(result.skipped, `skipped: ${JSON.stringify(result.skipped)}`).toEqual([])
    expect(result.rawPieces.length).toBeGreaterThanOrEqual(pieces.length)

    const drafts = result.rawPieces.map((rp) => createDraftPiece(rp, result.roles[rp.id]))
    const byId = Object.fromEntries(drafts.map((d) => [d.id, d]))
    for (const { pieceId, edgeName, fromIdx, toIdx } of result.edgeInstructions) {
      if (byId[pieceId]) addEdge(byId[pieceId], edgeName, fromIdx, toIdx)
    }
    const finalPieces = drafts.map((d) => finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges } }))
    const triangulated = triangulateAll(finalPieces, result.seamInstructions)

    expect(triangulated.length).toBe(result.rawPieces.length)
    for (const tp of triangulated) {
      expect(tp.positions2D.length).toBeGreaterThan(2)
      expect(tp.triangles.length).toBeGreaterThan(0)
      for (const [x, y] of tp.positions2D) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
      }
    }

    const dims = computeBodyDims(m, category)
    const cloth = assembleCloth(triangulated, dims, result.seamInstructions)
    for (let i = 0; i < cloth.simRestPositions.length; i++) {
      expect(Number.isFinite(cloth.simRestPositions[i])).toBe(true)
    }

    const pinMask = deriveGarmentPinMask(cloth, triangulated, dims)
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
      expect(count).toBeGreaterThan(0)
    }
  })
})

test('ref_w_skirt connects all 4 gores into a closed 4-seam ring', () => {
  const m = makeMeasurements('women')
  const payload = {
    pieces: PATTERNS.ref_w_skirt.pieces(m).map(toPayloadPiece),
    measurements: m,
    category: 'women',
  }
  const result = convertAppPattern(payload)
  const goreSeams = result.seamInstructions.filter((s) => s.id.startsWith('goreRing_'))
  expect(goreSeams).toHaveLength(4)
})
