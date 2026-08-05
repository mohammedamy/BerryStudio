import { describe, test, expect } from 'vitest'
import '../../../js/fancy-patterns.js' // side effect: registers all 64 designs into PATTERNS/LIBRARY
import { PATTERNS } from '../../../js/data.js'
import { convertAppPattern } from './importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring.js'
import { triangulateAll } from './triangulate.js'
import { assembleCloth } from '../cloth/assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'

// BerryStudio-Upgrade-Plan WP-6 acceptance criterion, automated: "all
// Fancy Collection designs import into Cloth Lab and simulate without
// manual seam authoring." Exercises the exact same pipeline the real app
// does once a user clicks "Simulate This Garment" — convert -> seed the
// seam editor's draft pieces -> finalize -> triangulate -> assemble — so a
// pass here is a genuine end-to-end guarantee, not just "didn't throw in
// convertAppPattern."
//
// WP-25: this originally only covered ids 01-06 per category (the
// Collection's first 24 designs) — by the time it was written to cover
// "all 24," 40 more designs (07-16 per category) had already shipped
// without this test's regex ever being widened to match, so they were
// never actually exercised. Widening it to `f\d+` (all 64) caught a real
// bug: 6 designs' "Shoulder Epaulette"/"Shoulder Tab" piece has
// `role:"epaulette"`, a role fancy-patterns.js authors but
// pattern/roles.js never registered — resolveSchemaRole returned null,
// so convertAppPattern fell back to classifyLegacy, which can't tell
// front from back from that name and skips the piece. Fixed in
// pattern/roles.js (registered `epaulette` -> attachNeck placement); this
// widened regex is what makes sure it can't quietly narrow back to 24.
const FANCY_IDS = Object.keys(PATTERNS).filter((id) => /^[wmgb]f\d+$/.test(id))

const SAMPLE_MEASUREMENTS = {
  women: { chest: 92, waist: 74, hips: 100, shoulder: 40, backLen: 40, sleeve: 58, neck: 36, bicep: 28, inseam: 76, thigh: 56, height: 165 },
  men: { chest: 102, waist: 88, hips: 100, shoulder: 46, backLen: 44, sleeve: 63, neck: 40, bicep: 32, inseam: 82, thigh: 60, height: 178 },
  girls: { chest: 66, waist: 58, hips: 70, shoulder: 30, backLen: 30, sleeve: 44, neck: 28, bicep: 20, inseam: 55, thigh: 40, height: 130 },
  boys: { chest: 68, waist: 60, hips: 70, shoulder: 31, backLen: 31, sleeve: 46, neck: 29, bicep: 21, inseam: 58, thigh: 42, height: 132 },
}

// Mirrors js/app.js's buildClothLabPayload() field selection exactly.
function toPayloadPiece(p, i) {
  return {
    id: (p.key || 'piece') + '_' + i,
    label: p.name,
    outline: p.outline,
    darts: p.darts, notches: p.notches, grain: p.grain,
    role: p.role, cutOnFold: p.cutOnFold, foldEdgeIndex: p.foldEdgeIndex,
    bilateral: p.bilateral, edges: p.edges, grainline: p.grainline,
    color: p.color,
  }
}

test('every Fancy Collection design id is discovered (sanity check on the id pattern)', () => {
  expect(FANCY_IDS.length).toBe(64)
})

describe.each(FANCY_IDS)('%s', (id) => {
  test('imports with zero skipped pieces and simulates with zero exceptions', () => {
    const entry = PATTERNS[id]
    const category = entry.category
    const m = SAMPLE_MEASUREMENTS[category]
    const rawPieces = entry.pieces(m)
    const payload = { pieces: rawPieces.map(toPayloadPiece), measurements: m, category, fabricId: null, avatarGLB: {} }

    const result = convertAppPattern(payload)
    expect(result.skipped, `skipped: ${JSON.stringify(result.skipped)}`).toEqual([])
    expect(result.rawPieces.length).toBeGreaterThan(0)

    // Seed the seam editor exactly the way App.jsx's useSeamEditor does.
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
