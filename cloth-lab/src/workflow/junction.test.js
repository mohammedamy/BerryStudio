import { expect, it } from 'vitest'
import { finalizePiece } from '../pattern/piece'
import { computeSubdivisions, triangulateAll } from '../pattern/triangulate'
import { assembleCloth } from '../cloth/assemble'
import { computeBodyDims } from '../body/computeBodyDims'
import { DEFAULT_MEASUREMENTS } from '../state/measurements'
it('a four-piece shared junction keeps equal edge samples and assembles regardless of seam order',()=>{
  const pieces=[10,15,20,25].map((w,i)=>finalizePiece(`p${i}`,'frontPanel',[[0,0],[w,0],[w,20],[0,20]],{join:{from:0,to:1},free:{from:1,to:0}}))
  const seams=[1,2,3].map(i=>({id:`j${i}`,a:{piece:'p0',edge:'join'},b:{piece:`p${i}`,edge:'join'},reverse:true}))
  const counts=computeSubdivisions(pieces,seams,2)
  expect(new Set(pieces.map(p=>counts[p.id].join)).size).toBe(1)
  expect(computeSubdivisions(pieces,[...seams].reverse(),2)).toEqual(counts)
  const tris=triangulateAll(pieces,seams,2)
  expect(()=>assembleCloth(tris,computeBodyDims(DEFAULT_MEASUREMENTS.women,'women'),seams)).not.toThrow()
})
