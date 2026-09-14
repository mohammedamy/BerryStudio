import { describe, expect, it } from 'vitest'
import { planPattern, shapeKey, designKey, cutBoundaryDart } from './patternPlan'
import { createDraftPiece, addEdge, finalizeDraftPiece } from '../pattern/seamAuthoring'
import { triangulateAll } from '../pattern/triangulate'
const piece = (extra = {}) => ({ id: 'panel', label: { en: 'My panel', ar: 'قطعتي' }, outline: [[0,0],[20,0],[20,30],[0,30]], role: 'front-panel', cutOnFold: false, bilateral: false, ...extra })
const payload = pieces => ({ designId: 'my-design', pieces })
const answer = (p, extra) => ({ [p.id]: { shape: shapeKey(p), ...extra } })
function finalize(plan) {
  const ds = plan.imported.rawPieces.map(p => createDraftPiece(p, plan.imported.roles[p.id]))
  for (const e of plan.imported.edgeInstructions) addEdge(ds.find(d => d.id === e.pieceId), e.edgeName, e.fromIdx, e.toIdx)
  return ds.map(finalizeDraftPiece)
}
describe('current-pattern planning', () => {
  it('keeps unknown, hidden, and invalid pieces in the inventory and asks rather than dropping them', () => {
    const p = piece({ role: 'unknown' }), hidden = piece({id:'hidden',visible:false}), invalid = piece({id:'bad',outline:[]})
    const plan = planPattern(payload([p,hidden,invalid]))
    expect(plan.inventory).toHaveLength(3)
    expect(plan.questions.map(q => q.kind)).toEqual(expect.arrayContaining(['placement','hidden','invalid']))
    expect(plan.ready).toBe(false)
  })
  it('uses an explicit lower-body choice instead of a misleading piece name', () => {
    const p=piece({role:'unknown',label:'Bra'})
    const plan=planPattern(payload([p]),answer(p,{role:'hip-panel-front',copies:'single'}))
    expect(plan.ready).toBe(true); expect(plan.imported.roles.panel).toBe('hipPanelFront')
  })
  it('asks how to cut a piece when copy metadata is missing', () => {
    const p=piece({cutOnFold:undefined,bilateral:undefined})
    expect(planPattern(payload([p])).questions.map(q=>q.kind)).toContain('copies')
  })
  it('invalidates old choices on actual geometry changes, but not name or layout translation', () => {
    const p=piece({role:'unknown'}), answers=answer(p,{role:'back-panel',copies:'single'})
    const moved={...p,label:'Renamed',outline:p.outline.map(([x,y])=>[x+10,y+30])}
    expect(planPattern(payload([moved]),answers).ready).toBe(true)
    const resized={...p,outline:[[0,0],[40,0],[40,30],[0,30]]}
    expect(planPattern(payload([resized]),answers).ready).toBe(false)
    expect(designKey(payload([p]))).not.toBe(designKey({...payload([p]),designId:'other'}))
  })
  it('never silently drops darts: requires an explicit shaping or marking decision', () => {
    const p=piece({darts:[[[10,20],[8,30],[12,30]]]})
    expect(planPattern(payload([p])).questions.map(q=>q.kind)).toContain('darts')
    const marked=planPattern(payload([p]),answer(p,{darts:'mark'}))
    expect(marked.imported.rawPieces[0].darts).toHaveLength(1)
    expect(marked.imported.rawPieces[0].outline).toHaveLength(4)
  })
  it('cuts and pairs a supported boundary dart, then produces a valid triangulated garment', () => {
    const p=piece({darts:[[[10,20],[8,30],[12,30]]]})
    const plan=planPattern(payload([p]),answer(p,{darts:'close'}))
    expect(plan.problems).toEqual([])
    expect(plan.imported.rawPieces[0].outline).toHaveLength(7)
    expect(plan.imported.seamInstructions.some(s=>s.id.includes('dart'))).toBe(true)
    expect(() => triangulateAll(finalize(plan),plan.imported.seamInstructions)).not.toThrow()
  })
  it('sews mirrored darts in both unfolded halves without losing source identity', () => {
    const p=piece({cutOnFold:true,darts:[[[10,20],[8,30],[12,30]]]})
    const plan=planPattern(payload([p]),answer(p,{darts:'close'}))
    expect(plan.problems).toEqual([])
    expect(plan.imported.seamInstructions.filter(s=>s.id.includes('dart'))).toHaveLength(2)
    expect(plan.imported.rawPieces[0].sourceId).toBe(p.id)
    expect(() => triangulateAll(finalize(plan),plan.imported.seamInstructions)).not.toThrow()
  })
  it('does not pretend an internal dart has been sewn', () => {
    const p=piece({darts:[[[10,10],[8,20],[12,20]]]})
    const plan=planPattern(payload([p]),answer(p,{darts:'close'}))
    expect(plan.ready).toBe(false); expect(plan.problems[0]).toContain('straight outline edge')
  })
  it('requires explicit exclusion and leaves source objects unchanged', () => {
    const p=piece({role:'unknown'}), before=JSON.stringify(p)
    const plan=planPattern(payload([p]),answer(p,{include:'exclude'}))
    expect(plan.inventory[0].excluded).toBe(true); expect(plan.imported.rawPieces).toEqual([])
    expect(JSON.stringify(p)).toBe(before)
  })
  it('rejects a dart whose apex is outside the piece', () => {
    expect(()=>cutBoundaryDart(piece().outline,[[10,50],[8,30],[12,30]])).toThrow('inside')
  })
})

describe('explicit panel quantities', () => {
 for (const role of ['sleeve','skirt-front-gore']) {
  for (const [copies, count] of [['single', 1], ['pair', 2], ['fold', 1]]) it(`respects ${copies} for ${role}`, () => {
    const p = piece({role})
    const plan = planPattern(payload([p]), answer(p,{copies}))
    expect(plan.ready).toBe(true)
    expect(plan.imported.rawPieces).toHaveLength(count)
    expect(plan.imported.rawPieces.every(r => r.sourceId === p.id)).toBe(true)
    expect(() => triangulateAll(finalize(plan), plan.imported.seamInstructions)).not.toThrow()
  })
 }
})
it('flags attachment review when a boundary dart removes an existing join',()=>{
  const front=piece({cutOnFold:true,darts:[[[10,15],[20,10],[20,20]]]})
  const back=piece({id:'back',role:'back-panel',cutOnFold:true})
  const plan=planPattern(payload([front,back]),answer(front,{darts:'close'}))
  expect(plan.problems).toEqual([])
  expect(plan.imported.rawPieces.find(p=>p.sourceId===front.id).joinReview).toBe(true)
})
