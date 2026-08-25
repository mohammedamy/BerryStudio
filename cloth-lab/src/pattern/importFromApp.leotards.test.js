import { describe, test, expect } from 'vitest'
import '../../../js/girls-leotards.js' // side effect: registers the 100 leotard designs into PATTERNS
import { PATTERNS } from '../../../js/data.js'
import { convertAppPattern } from './importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring.js'
import { triangulateAll } from './triangulate.js'
import { assembleCloth } from '../cloth/assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'

// Same acceptance criterion as importFromApp.fancyCollection.test.js
// (WP-6), applied to js/girls-leotards.js's 100 patterns — this file's
// own end-to-end pipeline had NO cloth-lab test coverage at all before
// WP-61 (the same kind of gap WP-60 closed for js/library.js).
const LEOTARD_IDS = Object.keys(PATTERNS).filter((id) => /^gy\d+$/.test(id))

const SAMPLE_MEASUREMENTS = { girls: { chest: 66, waist: 58, hips: 70, shoulder: 30, backLen: 30, sleeve: 44, neck: 28, bicep: 20, inseam: 55, thigh: 40, height: 130 } }

// Mirrors js/app.js's buildClothLabPayload() field selection exactly.
function toPayloadPiece(p, i) {
  return {
    id: (p.key || p.name?.en || 'piece') + '_' + i,
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

test('every js/girls-leotards.js design id is discovered (sanity check on the id pattern)', () => {
  expect(LEOTARD_IDS.length).toBe(100)
})

describe.each(LEOTARD_IDS)('%s', (id) => {
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

// WP-61: locks in the actual outcome of the neckline-binding fix — a
// "Neckline Binding" piece (present whenever style.neckline !== "mock")
// gets a real seam to BOTH the front body's neckline AND the back
// body's neckline, not placed-but-floating like every other accessory
// role still is.
const NECKBAND_IDS = LEOTARD_IDS.filter((id) => {
  const m = SAMPLE_MEASUREMENTS[PATTERNS[id].category]
  return PATTERNS[id].pieces(m).some((p) => p.name?.en === 'Neckline Binding')
})

test('at least one leotard pattern has a Neckline Binding piece (sanity check)', () => {
  expect(NECKBAND_IDS.length).toBeGreaterThan(0)
})

describe.each(NECKBAND_IDS)('%s neckline binding', (id) => {
  test('binding gets a real seam to every neckline curve that actually has one to offer', () => {
    const entry = PATTERNS[id]
    const category = entry.category
    const m = SAMPLE_MEASUREMENTS[category]
    const pieces = entry.pieces(m)
    const payload = { pieces: pieces.map(toPayloadPiece), measurements: m, category, fabricId: null, avatarGLB: {} }
    const result = convertAppPattern(payload)

    const binding = result.recognized.find((r) => r.label === 'Neckline Binding')
    expect(binding, 'Neckline Binding piece should be recognized, not skipped').toBeTruthy()
    const bindingId = binding.id
    const involves = (pid) => result.seamInstructions.filter((s) => s.a.piece === pid || s.b.piece === pid)
    // A handful of backStyle/neckline combinations really do reduce to a
    // 2-point (degenerate) neckline curve on one side (leotardNeckEdge()'s
    // own guard in js/ai.js — no real curve there to seam to, honestly,
    // not a bug) — expect at least 1 real seam always, and exactly 2 only
    // when both the front's and back's own edges declared a real one.
    const hasSeamId = (id) => pieces.some((p) => p.name?.en !== 'Neckline Binding' && (p.edges || []).some((e) => e.seamId === id))
    const expected = (hasSeamId('leotardNeckFront') ? 1 : 0) + (hasSeamId('leotardNeckBack') ? 1 : 0)
    expect(involves(bindingId).length, `${bindingId} should have ${expected} real seam(s)`).toBe(expected)
  })
})

// WP-61 (continued): every leotard has a real leg opening (unlike the
// neckline, whose exact curve varies by style) — "Leg Opening Binding"
// should ALWAYS get a real seam to both the front's and the back's own
// hip-to-gusset curve, on BOTH its bilateral R and L copies (the two leg
// openings), no degenerate-curve exception needed here.
describe.each(LEOTARD_IDS)('%s leg opening binding', (id) => {
  test('both R and L copies get a real seam to both the front AND back leg-opening curve', () => {
    const entry = PATTERNS[id]
    const category = entry.category
    const m = SAMPLE_MEASUREMENTS[category]
    const payload = { pieces: entry.pieces(m).map(toPayloadPiece), measurements: m, category, fabricId: null, avatarGLB: {} }
    const result = convertAppPattern(payload)

    const bindingIds = result.recognized.filter((r) => r.label.startsWith('Leg Opening Binding')).map((r) => r.id)
    expect(bindingIds.length, 'Leg Opening Binding should have 2 recognized copies (R and L)').toBe(2)
    const involves = (pid) => result.seamInstructions.filter((s) => s.a.piece === pid || s.b.piece === pid)
    for (const pid of bindingIds) {
      expect(involves(pid).length, `${pid} should have exactly 2 real seams (front + back leg opening)`).toBe(2)
    }
  })
})
