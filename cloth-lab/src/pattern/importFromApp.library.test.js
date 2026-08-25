import { describe, test, expect } from 'vitest'
import '../../../js/library.js' // side effect: registers the 94 family-builder designs into PATTERNS
import { PATTERNS } from '../../../js/data.js'
import { convertAppPattern } from './importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring.js'
import { triangulateAll } from './triangulate.js'
import { assembleCloth } from '../cloth/assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'

// Same acceptance criterion as importFromApp.fancyCollection.test.js
// (WP-6), applied to js/library.js's 94 family-builder patterns (bodice/
// skirt/trouser/shirt/robe families) — this file's own end-to-end
// pipeline had NO cloth-lab test coverage at all before WP-59, so the
// trouserFamily() bug (role:"other" on every trouser/shorts leg panel —
// see that function's own WP-59 comment) went uncaught by anything in
// this package. Same pipeline "Simulate This Garment" runs in the real
// app: convert -> seed the seam editor's draft pieces -> finalize ->
// triangulate -> assemble.
const LIBRARY_IDS = Object.keys(PATTERNS).filter((id) => /^[wmgb]\d+$/.test(id))

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
    princessSeamId: p.princessSeamId,
    necklineEndIdx: p.necklineEndIdx,
    sideEndIdx: p.sideEndIdx,
    color: p.color,
  }
}

test('every js/library.js design id is discovered (sanity check on the id pattern)', () => {
  expect(LIBRARY_IDS.length).toBe(94)
})

describe.each(LIBRARY_IDS)('%s', (id) => {
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

// WP-59: same "doesn't throw != actually seamed" gap the Fancy Collection
// trouser test closes — locks in that trouserFamily()'s leg panels get
// real seams (outseam to the opposite front/back panel, inseam to their
// own bilateral mirror), not placed-but-floating.
// WP-63: plus a THIRD real seam per leg panel now — the waist edge to
// "Waistband" (js/fancy-patterns.js's own trouserPanel() doesn't have
// this yet, which is why importFromApp.fancyCollection.test.js's own
// matching check stays at 2, not 3 — a real, current difference between
// the two trouser constructions, not a typo).
const TROUSER_IDS = LIBRARY_IDS.filter((id) => {
  const m = SAMPLE_MEASUREMENTS[PATTERNS[id].category]
  return PATTERNS[id].pieces(m).some((p) => p.role === 'trouser-front')
})

test('every trouser/shorts js/library.js pattern is discovered (sanity check)', () => {
  expect(TROUSER_IDS.length).toBeGreaterThan(0)
})

describe.each(TROUSER_IDS)('%s trousers', (id) => {
  test('both legs get a real outseam, inseam, AND waist seam — nothing left for the user to fix by hand', () => {
    const entry = PATTERNS[id]
    const category = entry.category
    const m = SAMPLE_MEASUREMENTS[category]
    const payload = { pieces: entry.pieces(m).map(toPayloadPiece), measurements: m, category, fabricId: null, avatarGLB: {} }
    const result = convertAppPattern(payload)

    const legPieceIds = Object.entries(result.roles)
      .filter(([, role]) => role === 'legFront' || role === 'legBack')
      .map(([id]) => id)
    expect(legPieceIds.length).toBe(4)

    const involves = (pid) => result.seamInstructions.filter((s) => s.a.piece === pid || s.b.piece === pid)
    for (const pid of legPieceIds) {
      expect(involves(pid).length, `${pid} should have exactly 3 real seams (outseam + inseam + waist)`).toBe(3)
    }
  })
})

// WP-63: "Waistband" (cutOnFold, one piece) should get all 4 real seams
// — front-right, front-left, back-right, back-left — matching the 4
// leg-panel-side waist edges above.
describe.each(TROUSER_IDS)('%s waistband', (id) => {
  test('waistband gets all 4 real seams — front-R, front-L, back-R, back-L', () => {
    const entry = PATTERNS[id]
    const category = entry.category
    const m = SAMPLE_MEASUREMENTS[category]
    const payload = { pieces: entry.pieces(m).map(toPayloadPiece), measurements: m, category, fabricId: null, avatarGLB: {} }
    const result = convertAppPattern(payload)

    const waistband = result.recognized.find((r) => r.label === 'Waistband')
    expect(waistband, 'Waistband piece should be recognized, not skipped').toBeTruthy()
    const involves = (pid) => result.seamInstructions.filter((s) => s.a.piece === pid || s.b.piece === pid)
    expect(involves(waistband.id).length, `${waistband.id} should have exactly 4 real seams`).toBe(4)
  })
})
