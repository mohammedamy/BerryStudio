import { describe, test, expect } from 'vitest'
// No side-effect import needed for these 6 — they're registered directly
// inside data.js itself (womens_dress, mens_shirt, abaya, thobe,
// girls_dress, boys_trousers), unlike every other collection in this
// file's own family, which each live in a separate registration module.
import { PATTERNS } from '../../../js/data.js'
import { convertAppPattern } from './importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring.js'
import { triangulateAll } from './triangulate.js'
import { assembleCloth } from '../cloth/assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'

// BerryStudio-Upgrade-Plan-v5.md WP-45: js/data.js registers 6 patterns
// directly (womens_dress, mens_shirt, abaya, thobe, girls_dress,
// boys_trousers) — snake_case ids, not the w/m/g/b+digits convention
// js/library.js's 94 family-builder patterns use, so they fall outside
// importFromApp.library.test.js's own LIBRARY_IDS regex and had NO
// cloth-lab test coverage at all before this, the same gap
// importFromApp.underwear.test.js just closed for js/underwear-
// library.js's 44. `womens_dress` specifically was live-verified
// extensively by hand this session (real dart panels, real drape, no
// clipping) — this is what makes that kind of check permanent and
// automatic instead of something that only happened because a session
// happened to test it manually.
const DATA_PATTERN_IDS = ['womens_dress', 'mens_shirt', 'abaya', 'thobe', 'girls_dress', 'boys_trousers']

const SAMPLE_MEASUREMENTS = {
  women: { chest: 92, waist: 74, hips: 100, shoulder: 40, backLen: 40, sleeve: 58, neck: 36, bicep: 28, inseam: 76, thigh: 56, height: 165 },
  men: { chest: 102, waist: 88, hips: 100, shoulder: 46, backLen: 44, sleeve: 63, neck: 40, bicep: 32, inseam: 82, thigh: 60, height: 178 },
  girls: { chest: 66, waist: 58, hips: 70, shoulder: 30, backLen: 30, sleeve: 44, neck: 28, bicep: 20, inseam: 55, thigh: 40, height: 130 },
  boys: { chest: 68, waist: 60, hips: 70, shoulder: 31, backLen: 31, sleeve: 46, neck: 29, bicep: 21, inseam: 58, thigh: 42, height: 132 },
}

// Mirrors js/app.js's buildClothLabPayload() field selection exactly —
// same self-contained local copy every sibling *.test.js in this family
// already keeps (deliberately not shared, so a change meant for one
// collection's own fixture can't silently drift the others).
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

test('all 6 of js/data.js\'s own directly-registered patterns are discovered (sanity check)', () => {
  for (const id of DATA_PATTERN_IDS) expect(PATTERNS[id], `${id} not registered`).toBeTruthy()
})

// boys_trousers predates WP-6 role metadata (no declared `role` on its
// leg pieces), so it falls through to classifyLegacy — which explicitly,
// deliberately ignores trouser/leg pieces ("aren't supported in 3D yet"),
// its own documented scope limit, not a bug this sweep should paper over.
// Declaring real roles on boys_trousers so its legs import too (the same
// fix trouserFamily()/trouserPanel() already got elsewhere in this
// library, WP-59/WP-64) is a genuine, separate improvement — out of
// scope for a sweep-coverage pass, not attempted here. Pinned to this
// EXACT known pair so a different, new skip on this pattern still fails
// loudly instead of being silently swallowed by a loose "some skips are
// fine" assertion.
const KNOWN_SKIPS = {
  boys_trousers: [
    { label: 'Front Leg', reason: 'trousers/leg pieces aren’t supported in 3D yet' },
    { label: 'Back Leg', reason: 'trousers/leg pieces aren’t supported in 3D yet' },
  ],
}

describe.each(DATA_PATTERN_IDS)('%s', (id) => {
  test('imports with zero (or only already-known) skipped pieces, and simulates with zero exceptions', () => {
    const entry = PATTERNS[id]
    const category = entry.category
    const m = SAMPLE_MEASUREMENTS[category]
    const rawPieces = entry.pieces(m)
    const payload = { pieces: rawPieces.map(toPayloadPiece), measurements: m, category, fabricId: null, avatarGLB: {} }

    const result = convertAppPattern(payload)
    expect(result.skipped, `skipped: ${JSON.stringify(result.skipped)}`).toEqual(KNOWN_SKIPS[id] || [])
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
