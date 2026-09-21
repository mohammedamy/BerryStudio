import { describe, expect, test } from 'vitest'
import { PATTERNS, computeMeasurements } from '../../../js/data.js'
import '../../../js/fancy-patterns.js'
import { convertAppPattern } from './importFromApp'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring'
import { triangulateAll } from './triangulate'
import { assembleCloth } from '../cloth/assemble'
import { computeBodyDims } from '../body/computeBodyDims'

describe.each(['XS', 'M', 'XXXL'])('mf11 denim jacket at %s', size => {
  test('keeps the opening fronts separate and welds both sides and the full collar band', () => {
    const m = computeMeasurements({ category: 'men', size, standard: 'intl' })
    const source = PATTERNS.mf11.pieces(m)
    const result = convertAppPattern({
      pieces: source.map(p => ({ ...p, id: p.key, label: p.name })),
      measurements: m,
      category: 'men',
    })

    expect(result.rawPieces.filter(p => /^front_[rl]$/.test(p.id)).map(p => p.id).sort()).toEqual(['front_l', 'front_r'])
    expect(result.rawPieces.some(p => p.id === 'front')).toBe(false)
    const construction = result.seamInstructions.filter(s => /mf11(?:Neck|Side)/.test(s.id))
    expect(construction).toHaveLength(6)
    expect(construction.filter(s => [s.a.piece, s.b.piece].includes('collarBand'))).toHaveLength(4)
    expect(construction.filter(s => [s.a.piece, s.b.piece].includes('back') && ![s.a.piece, s.b.piece].includes('collarBand'))).toHaveLength(2)

    const drafts = result.rawPieces.map(p => createDraftPiece(p, result.roles[p.id]))
    const byId = Object.fromEntries(drafts.map(p => [p.id, p]))
    for (const e of result.edgeInstructions) addEdge(byId[e.pieceId], e.edgeName, e.fromIdx, e.toIdx)
    const pieces = drafts.map(d => finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges } }))
    const pieceById = Object.fromEntries(pieces.map(p => [p.id, p]))
    const edgeLength = (pieceId, edgeName) => {
      const piece = pieceById[pieceId], edge = piece.seamEdges[edgeName]
      let length = 0
      for (let i = edge.from; i !== edge.to; i = (i + 1) % piece.outline.length) {
        const a = piece.outline[i], b = piece.outline[(i + 1) % piece.outline.length]
        length += Math.hypot(b[0] - a[0], b[1] - a[1])
      }
      return length
    }
    for (const seam of construction) {
      const aLength = edgeLength(seam.a.piece, seam.a.edge)
      const bLength = edgeLength(seam.b.piece, seam.b.edge)
      if (/mf11Neck/.test(seam.id)) expect(aLength).toBeCloseTo(bLength, 5)
      else expect(Math.abs(aLength - bLength) / aLength).toBeLessThan(0.0001)
    }

    const meshes = triangulateAll(pieces, result.seamInstructions)
    const cloth = assembleCloth(meshes, computeBodyDims(m, 'men'), result.seamInstructions)
    const meshById = Object.fromEntries(meshes.map(p => [p.pieceId, p]))
    const offsets = {}
    let offset = 0
    for (const mesh of meshes) { offsets[mesh.pieceId] = offset; offset += mesh.positions2D.length }
    for (const seam of construction) {
      const a = meshById[seam.a.piece], b = meshById[seam.b.piece]
      const ac = a.boundaryChains[seam.a.edge]
      const bc = seam.reverse ? b.boundaryChains[seam.b.edge].slice().reverse() : b.boundaryChains[seam.b.edge]
      expect(ac).toHaveLength(bc.length)
      const particles = ac.map((vertex, i) => {
        const particle = cloth.renderVertexToSimParticle[offsets[a.pieceId] + vertex]
        expect(particle).toBe(cloth.renderVertexToSimParticle[offsets[b.pieceId] + bc[i]])
        return particle
      })
      expect(new Set(particles).size).toBe(ac.length)
    }
  })
})
