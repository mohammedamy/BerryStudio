import { describe, expect, test } from 'vitest'
import { PATTERNS, computeMeasurements } from '../../../js/data.js'
import '../../../js/fancy-patterns.js'
import { convertAppPattern } from './importFromApp'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring'
import { triangulateAll } from './triangulate'
import { assembleCloth } from '../cloth/assemble'
import { computeBodyDims } from '../body/computeBodyDims'

describe.each(['XS', 'M', 'XXXL'])('wf09 collar at %s', size => {
  test('joins the full neckline to the stand and stand to collar without twisting endpoints', () => {
    const m = computeMeasurements({ category: 'women', size, standard: 'intl' })
    const source = PATTERNS.wf09.pieces(m)
    const result = convertAppPattern({ pieces: source.map(p => ({ ...p, id: p.key, label: p.name })), measurements: m, category: 'women' })
    const standId = 'collarStandPc', collarId = 'collar'
    const joins = result.seamInstructions.filter(s => [s.a.piece, s.b.piece].includes(standId))
    expect(joins).toHaveLength(6)
    for (const id of ['bodiceFC', 'bodiceBC', collarId]) {
      expect(joins.filter(s => [s.a.piece, s.b.piece].includes(id))).toHaveLength(2)
    }
    const drafts = result.rawPieces.map(p => createDraftPiece(p, result.roles[p.id]))
    const byId = Object.fromEntries(drafts.map(p => [p.id, p]))
    for (const e of result.edgeInstructions) addEdge(byId[e.pieceId], e.edgeName, e.fromIdx, e.toIdx)
    const pieces = drafts.map(d => finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges } }))
    const meshes = triangulateAll(pieces, result.seamInstructions)
    const pieceById = Object.fromEntries(pieces.map(p => [p.id, p]))
    const authoredLength = (id, edgeName) => {
      const p = pieceById[id], edge = p.seamEdges[edgeName]
      let length = 0
      for (let i = edge.from; i !== edge.to; i = (i + 1) % p.outline.length) {
        const a = p.outline[i], b = p.outline[(i + 1) % p.outline.length]
        length += Math.hypot(b[0] - a[0], b[1] - a[1])
      }
      return length
    }
    const cloth = assembleCloth(meshes, computeBodyDims(m, 'women'), result.seamInstructions)
    const meshById = Object.fromEntries(meshes.map(p => [p.pieceId, p]))
    let offset = 0
    const offsets = {}
    for (const p of meshes) { offsets[p.pieceId] = offset; offset += p.positions2D.length }
    const arc = (mesh, chain) => chain.slice(1).reduce((sum, v, i) => {
      const a = mesh.positions2D[chain[i]], b = mesh.positions2D[v]
      return sum + Math.hypot(b[0] - a[0], b[1] - a[1])
    }, 0)
    const stand = meshById[standId]
    const halfWidth = Math.max(...stand.positions2D.map(p => Math.abs(p[0])))
    for (const seam of joins) {
      const otherId = seam.a.piece === standId ? seam.b.piece : seam.a.piece
      const other = meshById[otherId]
      const standEdge = seam.a.piece === standId ? seam.a.edge : seam.b.edge
      const otherEdge = seam.a.piece === standId ? seam.b.edge : seam.a.edge
      const sc = stand.boundaryChains[standEdge], oc = other.boundaryChains[otherEdge]
      expect(authoredLength(standId, standEdge)).toBeCloseTo(authoredLength(otherId, otherEdge), 5)
      // Resampling a curved polyline can shortcut its original corners;
      // exact authored parity above is the drafting requirement.
      expect(Math.abs(arc(stand, sc) - arc(other, oc)) / arc(stand, sc)).toBeLessThan(0.01)
      const walk = seam.reverse ? oc.slice().reverse() : oc
      const particles = sc.map((v, i) => {
        const sp = cloth.renderVertexToSimParticle[offsets[standId] + v]
        expect(sp).toBe(cloth.renderVertexToSimParticle[offsets[otherId] + walk[i]])
        return sp
      })
      expect(new Set(particles).size).toBe(sc.length)
      for (const i of [0, sc.length - 1]) {
        const sx = Math.abs(stand.positions2D[sc[i]][0])
        const ox = Math.abs(other.positions2D[walk[i]][0])
        if (otherId === collarId) expect(sx).toBeCloseTo(ox, 5)
        else if (ox < 1e-6) expect(sx).toBeCloseTo(otherId === 'bodiceBC' ? 0 : halfWidth, 5)
      }
    }
    // Keep the four existing princess joins while adding the collar assembly.
    expect(result.seamInstructions.filter(s => /princess(?:Front|Back)_[RL]$/.test(s.id))).toHaveLength(4)
  })
})
