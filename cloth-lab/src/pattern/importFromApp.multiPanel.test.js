import { describe, it, expect } from 'vitest'
import { convertAppPattern } from './importFromApp.js'

// User report: "why can't I see 3 or 4 different darts from 4 different
// pieces together — that should be allowed according to some designs."
// Root cause (the recognition half — the OTHER half, darts themselves
// never reaching the cloth mesh at all, is a separate, much bigger gap
// left untouched here): classifyLegacy() only ever distinguishes front vs
// back, never left-vs-right or panel-vs-panel — a design with e.g. two
// independent darted front panels (no declared WP-6 role to disambiguate
// them) used to have the SECOND one dropped outright: "already have a
// piece for 'bodice-front' ... this pattern has more structure than the
// importer understands." Every piece classifyLegacy can place into a slot
// is now recognized; placementHints (tested against placement.js
// separately) is what keeps same-slot siblings from all landing on the
// exact same spot once they're all actually imported.

const RECT = [[0, 0], [10, 0], [10, 20], [0, 20]]

function piece(id, labelEn) {
  return { id, label: { en: labelEn, ar: labelEn }, outline: RECT, role: null }
}

describe('convertAppPattern — multiple pieces in the same classifyLegacy slot', () => {
  it('a single front + single back panel: both recognized, neither gets a placementHint (no regression)', () => {
    const payload = { pieces: [piece('p1', 'Front Panel'), piece('p2', 'Back Panel')] }
    const result = convertAppPattern(payload)
    expect(result.skipped).toEqual([])
    expect(result.recognized.map((r) => r.id).sort()).toEqual(['p1', 'p2'])
    expect(result.placementHints.p1).toBeUndefined()
    expect(result.placementHints.p2).toBeUndefined()
  })

  it('two independent front panels: BOTH are recognized now, not just the first', () => {
    const payload = { pieces: [piece('p1', 'Front Left Panel'), piece('p2', 'Front Right Panel')] }
    const result = convertAppPattern(payload)
    expect(result.skipped).toEqual([])
    expect(result.recognized.map((r) => r.id).sort()).toEqual(['p1', 'p2'])
    expect(result.rawPieces.map((p) => p.id).sort()).toEqual(['p1', 'p2'])
  })

  it('siblings in an over-subscribed slot get {index, count} placementHints, in payload order', () => {
    const payload = { pieces: [piece('p1', 'Front A'), piece('p2', 'Front B'), piece('p3', 'Front C')] }
    const result = convertAppPattern(payload)
    expect(result.placementHints.p1).toEqual({ index: 0, count: 3 })
    expect(result.placementHints.p2).toEqual({ index: 1, count: 3 })
    expect(result.placementHints.p3).toEqual({ index: 2, count: 3 })
  })

  it('4 darted panels (2 front, 2 back) — the exact reported scenario — all 4 are recognized', () => {
    const payload = {
      pieces: [
        piece('fl', 'Front Left Panel'),
        piece('fr', 'Front Right Panel'),
        piece('bl', 'Back Left Panel'),
        piece('br', 'Back Right Panel'),
      ],
    }
    const result = convertAppPattern(payload)
    expect(result.skipped).toEqual([])
    expect(result.recognized.length).toBe(4)
    expect(result.placementHints.fl).toEqual({ index: 0, count: 2 })
    expect(result.placementHints.fr).toEqual({ index: 1, count: 2 })
    expect(result.placementHints.bl).toEqual({ index: 0, count: 2 })
    expect(result.placementHints.br).toEqual({ index: 1, count: 2 })
  })

  it('an over-subscribed front slot still gets no auto-seam guess (existing "never guess" rule, still honored)', () => {
    const payload = { pieces: [piece('p1', 'Front A'), piece('p2', 'Front B'), piece('p3', 'Back Panel')] }
    const result = convertAppPattern(payload)
    // frontKey has 2 members, backKey has 1 — placeTorsoPanel's auto-seam
    // loop only fires when BOTH sides have exactly 1 member (see
    // importFromApp.js's own comment on that loop) — front/back stay
    // placed but unseamed rather than guessing which front pairs with back.
    expect(result.seamInstructions.some((s) => s.id.startsWith('frontPanel_'))).toBe(false)
  })

  it('still genuinely skips what it truly cannot classify at all (accessories, unrecognized names) — unaffected by this change', () => {
    const payload = { pieces: [piece('p1', 'Pocket'), piece('p2', 'Mystery Blob')] }
    const result = convertAppPattern(payload)
    expect(result.recognized).toEqual([])
    expect(result.skipped.length).toBe(2)
  })
})
