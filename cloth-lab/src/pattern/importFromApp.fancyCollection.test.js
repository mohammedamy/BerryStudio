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

// Mirrors js/app.js's buildClothLabPayload() field selection exactly —
// WP-59 added `princessSeamId` there (it was silently never forwarded at
// all before that fix, so a princess seam could never form regardless of
// what convertAppPattern did with it) — kept in sync here too, same
// "field selection exactly" promise this comment already made.
function toPayloadPiece(p, i) {
  return {
    id: (p.key || 'piece') + '_' + i,
    label: p.name,
    outline: p.outline,
    darts: p.darts, notches: p.notches, grain: p.grain,
    role: p.role, cutOnFold: p.cutOnFold, foldEdgeIndex: p.foldEdgeIndex,
    bilateral: p.bilateral, edges: p.edges, grainline: p.grainline,
    princessSeamId: p.princessSeamId,
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

// WP-59: "doesn't throw" alone doesn't catch a piece that imported,
// placed, and simulated fine while sitting completely unseamed (exactly
// what role:"other" trouser panels did for every one of these 12
// patterns before this WP — a real defect this whole describe.each above
// would never have caught). Locks in the actual outcome: every trouser
// panel gets BOTH its outseam (to the opposite front/back panel) and its
// inseam (its own bilateral mirror, forming the crotch seam) — 4 real
// seams per trousers, not a placed-but-floating patch.
const TROUSER_IDS = FANCY_IDS.filter((id) => {
  const m = SAMPLE_MEASUREMENTS[PATTERNS[id].category]
  return PATTERNS[id].pieces(m).some((p) => p.role === 'trouser-front')
})

test('every trouser-containing Fancy Collection pattern is discovered (sanity check)', () => {
  expect(TROUSER_IDS.length).toBeGreaterThan(0)
})

describe.each(TROUSER_IDS)('%s trousers', (id) => {
  test('both legs get a real outseam AND a real inseam seam — nothing left for the user to fix by hand', () => {
    const entry = PATTERNS[id]
    const category = entry.category
    const m = SAMPLE_MEASUREMENTS[category]
    const payload = { pieces: entry.pieces(m).map(toPayloadPiece), measurements: m, category, fabricId: null, avatarGLB: {} }
    const result = convertAppPattern(payload)

    const legPieceIds = Object.entries(result.roles)
      .filter(([, role]) => role === 'legFront' || role === 'legBack')
      .map(([id]) => id)
    expect(legPieceIds.length).toBe(4) // front_r, front_l, back_r, back_l

    const involves = (pid) => result.seamInstructions.filter((s) => s.a.piece === pid || s.b.piece === pid)
    for (const pid of legPieceIds) {
      expect(involves(pid).length, `${pid} should have exactly 1 outseam + 1 inseam seam`).toBe(2)
    }
  })
})
