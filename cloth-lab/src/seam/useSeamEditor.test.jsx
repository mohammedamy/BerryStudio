// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useSeamEditor } from './useSeamEditor'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root, node, editor
const raw=Array.from({length:4},(_,i)=>({id:`p${i}`,sourceId:`source${i}`,outline:[[0,0],[20,0],[20,30],[0,30]],label:`Piece ${i}`}))
const roles=Object.fromEntries(raw.map(p=>[p.id,'frontPanel']))
async function mount(restored){node=document.createElement('div');root=createRoot(node);function Test(){editor=useSeamEditor(raw,roles,[],[],{},restored);return null}await act(async()=>root.render(<Test/>))}
const run=async fn=>act(async()=>fn())
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=null})
describe('guided seam authoring',()=>{
  it('clearing a temporary edge releases its outline span',async()=>{
    await mount();await run(()=>editor.handleVertexClick(0,0));await run(()=>editor.handleVertexClick(0,1))
    expect(Object.keys(editor.drafts[0].edges)).toHaveLength(1)
    await run(()=>editor.clearPending());expect(editor.drafts[0].edges).toEqual({})
    await run(()=>editor.handleVertexClick(0,0));await run(()=>editor.handleVertexClick(0,2));expect(editor.error).toBeNull()
  })
  it('joins four selected edges and finalizes all four source pieces',async()=>{
    await mount()
    for(let i=0;i<4;i++){await run(()=>editor.handleVertexClick(i,0));await run(()=>editor.handleVertexClick(i,1))}
    expect(editor.pendingEdges).toHaveLength(4)
    await run(()=>editor.commitSeam(true))
    expect(editor.seams).toHaveLength(3);expect(editor.unjoined).toHaveLength(0)
    let garment;await run(()=>{garment=editor.finalize()})
    expect(garment.pieces).toHaveLength(4);expect(garment.sourceIds).toEqual(raw.map(p=>p.sourceId))
  })
  it('refuses unfinished selections and missing attachment decisions',async()=>{
    await mount();let garment;await run(()=>{garment=editor.finalize()});expect(garment).toBeNull()
    for(const p of raw)await run(()=>editor.markSeparate(p.id,true))
    await run(()=>editor.handleVertexClick(0,0));await run(()=>{garment=editor.finalize()});expect(garment).toBeNull()
    await run(()=>editor.clearPending());await run(()=>{garment=editor.finalize()});expect(garment.pieces).toHaveLength(4)
  })
  it('ignores invalid point indices rather than entering a perimeter loop',async()=>{
    await mount();await run(()=>editor.handleVertexClick(0,99));expect(editor.pendingStart).toBeNull()
  })
})

it('deselecting a newly drawn edge releases its reserved span',async()=>{
  await mount();await run(()=>editor.handleVertexClick(0,0));await run(()=>editor.handleVertexClick(0,1))
  await run(()=>editor.chooseEdge(0,'edge_0_1'))
  expect(editor.pendingEdges).toEqual([]);expect(editor.drafts[0].edges).toEqual({})
})
it('restores seam edges by source identity after piece reordering',async()=>{
  const drafts=[...raw].reverse().map(p=>({...p,edges:{saved:{from:0,to:1}}}))
  await mount({drafts,seams:[],separate:raw.map(p=>p.id),reviewed:[]})
  expect(editor.drafts.map(p=>p.id)).toEqual(raw.map(p=>p.id))
  expect(editor.drafts.every(p=>p.edges.saved)).toBe(true)
})
