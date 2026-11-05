import { describe, expect, it } from 'vitest'
import '../../../js/fancy-patterns.js'
import '../../../js/girls-leotards.js'
import '../../../js/library.js'
import '../../../js/underwear-library.js'
import { PATTERNS } from '../../../js/data.js'
import { autoPlan, guessPlacement, asUserAnswer } from './autoSetup'
import { shapeKey } from './patternPlan'

const piece = (extra = {}) => ({ id: 'panel', label: { en: 'My panel', ar: 'قطعتي' }, outline: [[0, 0], [20, 0], [20, 30], [0, 30]], ...extra })
const payload = pieces => ({ designId: 'auto-test', pieces })

describe('novice auto setup', () => {
  it('answers every blocking question with a visible, editable default', () => {
    const plan = autoPlan(payload([
      piece({ id: 'a', label: { en: 'Front bodice' } }),
      piece({ id: 'b', label: { en: 'Back skirt' } }),
      piece({ id: 'c', label: { en: 'Short sleeve' } }),
      piece({ id: 'd', label: { en: 'Mystery' }, role: 'unknown' }),
    ]))
    expect(plan.plan.questions).toEqual([])
    expect(plan.plan.ready).toBe(true)
    expect(plan.answers.a).toMatchObject({ role: 'front-panel', copies: 'single', auto: true })
    expect(plan.answers.b.role).toBe('hip-panel-back')
    expect(plan.answers.c).toMatchObject({ role: 'sleeve', copies: 'pair' })
    expect(plan.answers.d.role).toBe('pocket')
    expect(plan.answers.a.autoFields).toEqual(expect.arrayContaining(['role', 'copies']))
  })
  it('keeps the user’s own choices over every default', () => {
    const p = piece({ label: { en: 'Front bodice' } })
    const { answers, plan } = autoPlan(payload([p]), { panel: { shape: shapeKey(p), role: 'back-panel', copies: 'fold' } })
    expect(answers.panel).toMatchObject({ role: 'back-panel', copies: 'fold' })
    expect(answers.panel.auto).toBeUndefined()
    expect(plan.imported.roles.panel).toBe('backPanel')
  })
  it('falls back to dart markings when the geometry cannot be sewn', () => {
    const p = piece({ role: 'front-panel', cutOnFold: false, bilateral: false, darts: [[[10, 10], [8, 20], [12, 20]]] })
    const { answers, plan } = autoPlan(payload([p]))
    expect(plan.ready).toBe(true)
    expect(answers.panel.darts).toBe('mark')
  })
  it('sews boundary darts closed when the geometry supports it', () => {
    const p = piece({ role: 'front-panel', cutOnFold: false, bilateral: false, darts: [[[10, 20], [8, 30], [12, 30]]] })
    const { answers, plan } = autoPlan(payload([p]))
    expect(plan.ready).toBe(true)
    expect(answers.panel.darts).toBe('close')
  })
  it('leaves hidden and broken pieces out instead of blocking', () => {
    const { plan } = autoPlan(payload([piece({ id: 'ok', role: 'front-panel', cutOnFold: false, bilateral: false }), piece({ id: 'hid', visible: false, role: 'back-panel' }), piece({ id: 'bad', outline: [] })]))
    expect(plan.ready).toBe(true)
    expect(plan.inventory.filter(r => r.excluded).map(r => r.piece.id).sort()).toEqual(['bad', 'hid'])
  })
  it('never mistakes accessories for full panels', () => {
    expect(guessPlacement({ label: { en: 'Neckline Binding' } })).toBe('collar')
    expect(guessPlacement({ label: { en: 'Leg Opening Binding' } })).toBe('pocket')
    expect(guessPlacement({ label: { en: 'Front Leg' } })).toBe('trouser-front')
    expect(guessPlacement({ label: { en: 'Front Panel' }, bodyZone: 'lower' })).toBe('hip-panel-front')
    expect(guessPlacement({ label: { en: 'Waistband' } })).toBe('waistband')
  })
  it('strips bookkeeping flags when an answer becomes the user’s own', () => {
    expect(asUserAnswer({ shape: 's', role: 'sleeve', auto: true, autoFields: ['role'] })).toEqual({ shape: 's', role: 'sleeve' })
  })
})

const M = {
  women: { chest: 92, waist: 74, hips: 100, shoulder: 40, backLen: 40, sleeve: 58, neck: 36, bicep: 28, inseam: 76, thigh: 56, height: 165 },
  men: { chest: 102, waist: 88, hips: 100, shoulder: 46, backLen: 44, sleeve: 63, neck: 40, bicep: 32, inseam: 82, thigh: 60, height: 178 },
  girls: { chest: 66, waist: 58, hips: 70, shoulder: 30, backLen: 30, sleeve: 44, neck: 28, bicep: 20, inseam: 55, thigh: 40, height: 130 },
  boys: { chest: 68, waist: 60, hips: 70, shoulder: 31, backLen: 31, sleeve: 46, neck: 29, bicep: 21, inseam: 58, thigh: 42, height: 132 },
}
// The whole point of the novice workflow: every design in the shipped
// library opens ready to try on, with zero questions left for the user.
it('every shipped library design opens ready to try on with no questions', () => {
  const blocked = []
  for (const [id, entry] of Object.entries(PATTERNS)) {
    const pieces = entry.pieces(M[entry.category] || M.women)
    const p = { designId: id, pieces: pieces.map((x, i) => ({ id: `${x.key || 'p'}_${i}`, label: x.name, outline: x.outline, darts: x.darts, role: x.role, cutOnFold: x.cutOnFold, bilateral: x.bilateral, edges: x.edges, princessSeamId: x.princessSeamId, necklineEndIdx: x.necklineEndIdx, sideEndIdx: x.sideEndIdx, foldEdgeIndex: x.foldEdgeIndex, bodyZone: x.bodyZone })) }
    const { plan } = autoPlan(p)
    if (!plan.ready) blocked.push(`${id}: ${plan.questions.length} questions, ${plan.problems.join('; ')}`)
  }
  expect(blocked).toEqual([])
})
