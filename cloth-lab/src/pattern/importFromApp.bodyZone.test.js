import { describe, it, expect } from 'vitest'
import { convertAppPattern } from './importFromApp.js'

// WP-49: js/app.js's Layer Props panel lets a user explicitly set a
// piece's bodyZone ('upper'|'lower') — this is the Cloth Lab side of
// making that explicit choice actually count for pieces with NO declared
// role (freehand/custom pieces, or a role this file doesn't recognize),
// where classifyLegacy() only ever had the piece's NAME to go on.

// A plain, definitely-not-a-fold-piece rectangle — big enough that
// isFoldPiece's bbox heuristic can't mistake it for one, small enough to
// keep the fixture readable.
const RECT = [[0, 0], [10, 0], [10, 20], [0, 20]]

function piece(id, labelEn, bodyZone) {
  return { id, label: { en: labelEn, ar: labelEn }, outline: RECT, role: null, bodyZone }
}

describe('convertAppPattern — explicit bodyZone correcting classifyLegacy (WP-49)', () => {
  it('a generically-named "Front Panel" with no bodyZone keeps today\'s default (upper/frontPanel) — no regression', () => {
    const r = convertAppPattern({ pieces: [piece('a', 'Front Panel', undefined)] })
    expect(r.roles.a).toBe('frontPanel')
    expect(r.skipped).toHaveLength(0)
  })

  it('the SAME generic name, explicitly marked lower, is placed as a hip panel instead — the actual bug fix', () => {
    const r = convertAppPattern({ pieces: [piece('a', 'Front Panel', 'lower')] })
    expect(r.roles.a).toBe('hipPanelFront')
    expect(r.skipped).toHaveLength(0)
  })

  it('"Back Panel" explicitly marked lower is placed as hipPanelBack', () => {
    const r = convertAppPattern({ pieces: [piece('a', 'Back Panel', 'lower')] })
    expect(r.roles.a).toBe('hipPanelBack')
  })

  it('a name that WOULD classify as skirt-front, explicitly marked upper, is corrected to frontPanel', () => {
    const r = convertAppPattern({ pieces: [piece('a', 'Skirt Front', 'upper')] })
    expect(r.roles.a).toBe('frontPanel')
  })

  it('bodyZone cannot rescue a name classifyLegacy truly cannot read front/back from — still skipped, never guessed', () => {
    const r = convertAppPattern({ pieces: [piece('a', 'Piece A', 'lower')] })
    expect(r.roles.a).toBeUndefined()
    expect(r.skipped).toHaveLength(1)
    expect(r.skipped[0].reason).toMatch(/front or back/)
  })

  it('bodyZone cannot turn an accessory name into a panel — still ignored', () => {
    const r = convertAppPattern({ pieces: [piece('a', 'Waistband', 'lower')] })
    expect(r.roles.a).toBeUndefined()
    expect(r.skipped).toHaveLength(1)
  })

  it('a piece WITH a declared, recognized role ignores bodyZone entirely (role is authoritative on that path)', () => {
    const r = convertAppPattern({
      pieces: [{ id: 'a', label: { en: 'X' }, outline: RECT, role: 'front-panel', bodyZone: 'lower' }],
    })
    // front-panel's own placement (frontPanel/upper) wins — bodyZone only
    // matters on the classifyLegacy (no-role) path, see importFromApp.js's
    // own comment on applyBodyZoneOverride().
    expect(r.roles.a).toBe('frontPanel')
  })
})
