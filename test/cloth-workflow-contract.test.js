import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureClothPieceIds, designKey, shapeKey } from '../js/cloth-workflow-contract.js';
test('piece links survive renames, order changes and serialization; duplicates receive new identities',()=>{
  const pieces=[{name:'A',outline:[[0,0],[1,0],[0,1]]},{name:'B',outline:[[2,0],[3,0],[2,1]]}];
  ensureClothPieceIds(pieces); const [a,b]=pieces.map(p=>p.clothLabId);
  pieces.reverse(); pieces[0].name='renamed'; ensureClothPieceIds(pieces);
  assert.deepEqual(pieces.map(p=>p.clothLabId),[b,a]);
  const restored=JSON.parse(JSON.stringify(pieces)); restored.push({...restored[0]});ensureClothPieceIds(restored);
  assert.equal(restored[0].clothLabId,b);assert.notEqual(restored[2].clothLabId,b);
});
test('source shape ignores 2D layout translation but invalidates actual geometry and design changes',()=>{
  const p={id:'a',outline:[[0,0],[1,0],[0,1]]};
  assert.equal(shapeKey(p),shapeKey({...p,outline:p.outline.map(([x,y])=>[x+8,y+4])}));
  assert.notEqual(designKey({designId:'A',pieces:[p]}),designKey({designId:'B',pieces:[p]}));
  const q={...p,id:'b'};assert.equal(designKey({pieces:[p,q]}),designKey({pieces:[q,p]}));
  assert.doesNotThrow(()=>shapeKey({outline:[null]}));
});
