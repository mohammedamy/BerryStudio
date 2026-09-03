import { describe, test, expect } from 'vitest'
import '../../../js/underwear-library.js' // side effect: registers the 44-pattern Underwear & Bra Library into PATTERNS
import { PATTERNS } from '../../../js/data.js'
import { convertAppPattern } from './importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring.js'
import { triangulateAll } from './triangulate.js'
import { assembleCloth } from '../cloth/assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'

// BerryStudio-Upgrade-Plan-v5.md WP-45: `js/underwear-library.js`'s 44
// patterns had NO cloth-lab test coverage at all before this — unlike
// js/library.js (importFromApp.library.test.js), js/fancy-patterns.js
// (importFromApp.fancyCollection.test.js), and js/girls-leotards.js
// (importFromApp.leotards.test.js), each of which already runs this
// exact same convert -> seed -> finalize -> triangulate -> assemble
// pipeline (the same one "Simulate This Garment" runs in the real app)
// across its own whole collection. Same convention here, same pipeline,
// applied to the one collection that had never actually been run
// through it at all — not just validated on paper (test/validate-
// library.test.js, WP-66) but confirmed to actually import and assemble
// into real cloth-lab geometry without throwing.
const UNDERWEAR_IDS = Object.keys(PATTERNS).filter((id) => /^(wu|mu|gu|bu|wb|gb)\d+$/.test(id))

const SAMPLE_MEASUREMENTS = {
  women: { chest: 92, waist: 74, hips: 100, shoulder: 40, backLen: 40, sleeve: 58, neck: 36, bicep: 28, inseam: 76, thigh: 56, height: 165 },
  men: { chest: 102, waist: 88, hips: 100, shoulder: 46, backLen: 44, sleeve: 63, neck: 40, bicep: 32, inseam: 82, thigh: 60, height: 178 },
  girls: { chest: 66, waist: 58, hips: 70, shoulder: 30, backLen: 30, sleeve: 44, neck: 28, bicep: 20, inseam: 55, thigh: 40, height: 130 },
  boys: { chest: 68, waist: 60, hips: 70, shoulder: 31, backLen: 31, sleeve: 46, neck: 29, bicep: 21, inseam: 58, thigh: 42, height: 132 },
}

// Mirrors js/app.js's buildClothLabPayload() field selection exactly —
// same helper every sibling *.test.js in this file's own family already
// defines locally (not shared, deliberately: each file's own copy stays
// self-contained and can't silently drift out of sync with a change
// meant for just one of them).
function toPayloadPiece(p, i) {
  return {
    id: (p.key || 'piece') + '_' + i,
    label: p.name,
    outline: p.outline,
    darts: p.darts, notches: p.notches, grain: p.grain,
    role: p.role, cutOnFold: p.cutOnFold, foldEdgeIndex: p.foldEdgeIndex,
    bilateral: p.bilateral, edges: p.edges, grainline: p.grainline,
    princessSeamId: p.princessSeamId,
    necklineEndIdx: p.necklineEndIdx,
    sideEndIdx: p.sideEndIdx,
    color: p.color,
  }
}

test('every js/underwear-library.js design id is discovered (sanity check on the id pattern)', () => {
  expect(UNDERWEAR_IDS.length).toBe(44)
})

describe.each(UNDERWEAR_IDS)('%s', (id) => {
  test('imports with zero skipped pieces and simulates with zero exceptions', () => {
    const entry = PATTERNS[id]
    const category = entry.category
    const m = SAMPLE_MEASUREMENTS[category]
    const rawPieces = entry.pieces(m)
    const payload = { pieces: rawPieces.map(toPayloadPiece), measurements: m, category, fabricId: null, avatarGLB: {} }

    const result = convertAppPattern(payload)
    expect(result.skipped, `skipped: ${JSON.stringify(result.skipped)}`).toEqual([])
    expect(result.rawPieces.length).toBeGreaterThan(0)

    const drafts = result.rawPieces.map((rp) => createDraftPiece(rp, result.roles[rp.id]))
    const byId = Object.fromEntries(drafts.map((d) => [d.id, d]))
    for (const { pieceId, edgeName, fromIdx, toIdx } of result.edgeInstructions) {
      const d = byId[pieceId]
      if (d) addEdge(d, edgeName, fromIdx, toIdx)
    }
    const finalPieces = drafts.map((d) => finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges } }))

    const dims = computeBodyDims(m, category)
    expect(() => {
      const triangulated = triangulateAll(finalPieces, result.seamInstructions)
      assembleCloth(triangulated, dims, result.seamInstructions)
    }).not.toThrow()
  })
})
