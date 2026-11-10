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

describe('novice-first editing (autoPlace)',()=>{
  async function mountAuto(seedEdges=[],seedSeams=[]){node=document.createElement('div');root=createRoot(node);function Test(){editor=useSeamEditor(raw,roles,seedEdges,seedSeams,{},null,{autoPlace:true});return null}await act(async()=>root.render(<Test/>))}
  it('places pieces the importer could not sew instead of blocking simulation',async()=>{
    await mountAuto()
    expect(editor.unjoined).toHaveLength(0);expect(editor.separate).toEqual(raw.map(p=>p.id));expect(editor.autoPlaced).toHaveLength(4)
    let garment;await run(()=>{garment=editor.finalize()});expect(garment.pieces).toHaveLength(4)
  })
  it('offers each side of an un-named piece as a one-click target and sews two of them',async()=>{
    await mountAuto()
    expect(editor.gapsByPiece[0]).toHaveLength(4)
    await run(()=>editor.chooseSpan(0,1,2));await run(()=>editor.chooseSpan(1,3,0))
    expect(editor.pendingEdges).toHaveLength(2)
    await run(()=>editor.sewSelected())
    expect(editor.seams).toHaveLength(1);expect(editor.separate).toEqual(['p2','p3'])
    // right side (going down) meets left side (going up): pair top with top
    expect(editor.seams[0].reverse).toBe(true)
    expect(editor.seamMarks[`p0:${editor.seams[0].a.edge}`].n).toBe(1)
    expect(editor.gapsByPiece[0]).toEqual([{from:2,to:1}])
  })
  it('flip inverts the automatic direction',async()=>{
    await mountAuto();await run(()=>editor.chooseSpan(0,1,2));await run(()=>editor.chooseSpan(1,1,2));await run(()=>editor.sewSelected(true))
    expect(editor.seams[0].reverse).toBe(true)
  })
  it('removing a piece’s last seam returns it to placed instead of blocking',async()=>{
    await mountAuto();await run(()=>editor.chooseSpan(0,1,2));await run(()=>editor.chooseSpan(1,3,0));await run(()=>editor.sewSelected())
    await run(()=>editor.removeSeam(editor.seams[0].id))
    expect(editor.unjoined).toHaveLength(0);expect(editor.separate.sort()).toEqual(['p0','p1','p2','p3'])
  })
  it('try-on can proceed past an unfinished selection',async()=>{
    await mountAuto();await run(()=>editor.chooseSpan(0,1,2))
    let garment;await run(()=>{garment=editor.finalize({ignorePending:true})});expect(garment.pieces).toHaveLength(4)
  })
  it('splits a selected 2-point straight edge into two clickable halves with one click and sews each half separately',async()=>{
    await mountAuto()
    // Select top edge 0 -> 1 on p0 (a 4-point rectangle) and split it in half
    await run(()=>editor.chooseSpan(0,0,1))
    expect(editor.pendingEdges).toHaveLength(1)
    await run(()=>editor.splitSelectedEdge())
    // Outline gained a midpoint at [10, 0], first half 0->1 is selected, second half 1->2 is also named
    expect(editor.drafts[0].outline).toHaveLength(5)
    expect(editor.drafts[0].outline[1]).toEqual([10,0])
    expect(Object.keys(editor.drafts[0].edges)).toEqual(['edge_0_1','edge_1_2'])
    expect(editor.pendingEdges).toHaveLength(1)
    expect(editor.pendingEdges[0].edgeName).toBe('edge_0_1')
    // Sew first half to p1 top edge, and second half to p2 top edge!
    await run(()=>editor.chooseSpan(1,0,1))
    await run(()=>editor.sewSelected())
    await run(()=>editor.chooseEdge(0,'edge_1_2'))
    await run(()=>editor.chooseSpan(2,0,1))
    await run(()=>editor.sewSelected())
    expect(editor.seams).toHaveLength(2)
    let garment;await run(()=>{garment=editor.finalize()})
    expect(garment.pieces[0].outline).toHaveLength(5)
    // Reset restores original unsplit 4-point geometry and seed seams
    await run(()=>editor.resetToAutoSeams())
    expect(editor.drafts[0].outline).toHaveLength(4)
    expect(editor.seams).toHaveLength(0)
  })
  it('splits a multi-vertex curved edge at its 50% arc-length vertex',async()=>{
    const curved=[{id:'sleeve',sourceId:'sleeve',outline:[[0,10],[5,3],[15,0],[25,3],[30,10],[26,50],[4,50]],label:'Sleeve'}]
    node=document.createElement('div');root=createRoot(node)
    function CurvedTest(){editor=useSeamEditor(curved,{sleeve:'sleeve'},[{pieceId:'sleeve',edgeName:'cap',fromIdx:0,toIdx:4}],[],{},null,{autoPlace:true});return null}
    await act(async()=>root.render(<CurvedTest/>))
    await run(()=>editor.chooseEdge(0,'cap'))
    await run(()=>editor.splitSelectedEdge())
    expect(editor.drafts[0].edges.cap).toBeUndefined()
    expect(editor.drafts[0].edges.edge_0_2).toEqual({from:0,to:2})
    expect(editor.drafts[0].edges.edge_2_4).toEqual({from:2,to:4})
  })
})
