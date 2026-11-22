import { describe, test, expect } from 'vitest'
import '../../../js/abaya-collection.js'
import { PATTERNS, computeMeasurements } from '../../../js/data.js'
import { convertAppPattern } from './importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring.js'
import { triangulateAll, adaptiveSpacingCm } from './triangulate.js'
import { assembleCloth, deriveNeighbors } from '../cloth/assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'

const OPEN_ABAYA_IDS = new Set(['wa01', 'wa02', 'wa05', 'wa08', 'wa10', 'wa12', 'wa14', 'wa17', 'wa18', 'wa20'])

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

describe('embroidered modest abaya collection (wa01–wa20)', () => {
  const m = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' })
  const dims = computeBodyDims(m, 'women')

  test('all 20 embroidered abayas convert, triangulate, assemble within GPU particle budget, and build valid bend hinges', () => {
    for (let i = 1; i <= 20; i++) {
      const id = 'wa' + String(i).padStart(2, '0')
      const entry = PATTERNS[id]
      expect(entry, `${id} registered in PATTERNS`).toBeTruthy()
      const conv = convertAppPattern({
        designId: id,
        designName: entry.name.en,
        pieces: entry.pieces(m).map(toPayloadPiece),
        measurements: m,
        category: 'women',
      })
      expect(conv.skipped, `${id} skipped pieces`).toEqual([])
      expect(conv.seamInstructions.length, `${id} seams`).toBeGreaterThanOrEqual(10)

      const hasFrontR = conv.rawPieces.some((rp) => conv.roles[rp.id] === 'frontPanel' && rp.id.endsWith('_r'))
      const hasFrontL = conv.rawPieces.some((rp) => conv.roles[rp.id] === 'frontPanel' && rp.id.endsWith('_l'))
      const hasCenterFrontSeam = conv.seamInstructions.some((s) => s.id === 'openFront_centerFront')
      if (OPEN_ABAYA_IDS.has(id)) {
        expect(hasFrontR && hasFrontL, `${id} splits open front into right & left panels`).toBe(true)
        expect(hasCenterFrontSeam, `${id} closes modestly with concealed-snap front seam`).toBe(true)
      }
      if (id === 'wa13') {
        const tierIds = conv.rawPieces.filter((rp) => rp.id.startsWith('tier')).map((rp) => rp.id)
        expect(tierIds.length).toBe(2)
        for (const tid of tierIds) {
          expect(conv.placementHints[tid]?.isSkirtTier, `${tid} marked as skirt tier`).toBe(true)
        }
      }

      const drafts = conv.rawPieces.map((rp) => createDraftPiece(rp, conv.roles[rp.id], conv.placementHints[rp.id]))
      const byId = Object.fromEntries(drafts.map((d) => [d.id, d]))
      for (const e of conv.edgeInstructions) if (byId[e.pieceId]) addEdge(byId[e.pieceId], e.edgeName, e.fromIdx, e.toIdx)
      const finalPieces = drafts.map((d) => finalizeDraftPiece({
        id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges }, placementHint: d.placementHint,
      }))
      const spacing = adaptiveSpacingCm(finalPieces, { qualityTier: 'high' })
      const tri = triangulateAll(finalPieces, conv.seamInstructions, spacing)
      const cloth = assembleCloth(tri, dims, conv.seamInstructions, 'standing')
      expect(cloth.simParticleCount, `${id} particle budget`).toBeLessThanOrEqual(3800)
      for (let k = 0; k < cloth.simRestPositions.length; k++) {
        expect(Number.isFinite(cloth.simRestPositions[k]), `${id} finite coord`).toBe(true)
      }
      const neighbors = deriveNeighbors(cloth, 8)
      let activeHinges = 0
      for (let h = 0; h < neighbors.edgeHinge.active.length; h++) {
        if (neighbors.edgeHinge.active[h] > 0) {
          activeHinges++
          expect(neighbors.edgeHinge.n2Sign[h], `${id} positive n2Sign`).toBeGreaterThanOrEqual(0)
        }
      }
      expect(activeHinges, `${id} dihedral hinges`).toBeGreaterThan(1000)
    }
  }, 15000)
})
