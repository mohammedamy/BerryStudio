import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessWovenSkirtConstruction } from '../js/construction-acceptance.js';
import { AIGen } from '../js/ai.js';

const measurements={hips:98,waist:72,inseam:76};
test('straight non-wrap generated skirt has declared construction evidence but no claimed approval',()=>{
  const built=AIGen.build({type:'skirt',fitF:1,flareF:1,lengthF:1,wrap:false,hemShape:'straight'},measurements);
  const result=assessWovenSkirtConstruction(built.pieces);
  assert.equal(result.decision,'side-seam-checked');
  assert.equal(result.makerApproval,null); assert.equal(result.sampleApproval,null); assert.equal(result.productionEligible,false);
});
test('a skirt without declared roles or a shared usable seam stays blocked',()=>{
  assert.deepEqual(assessWovenSkirtConstruction([]).blockers,['constructionSeam']);
  const pieces=[{role:'skirt-front',outline:[[0,0],[1,0],[1,2]]},{role:'skirt-back',outline:[[0,0],[1,0],[1,2]]},{role:'waistband',outline:[[0,0],[1,0],[1,1]]}];
  assert.ok(assessWovenSkirtConstruction(pieces).blockers.includes('constructionSeam'));
});

for (const [label,edge,delta,code] of [
  ['zero span',{fromIdx:1,toIdx:1},0,'constructionEdge'],
  ['bad index',{fromIdx:1,toIdx:99},0,'constructionEdge'],
  ['length mismatch',{fromIdx:1,toIdx:2},2,'constructionMismatch'],
]) test(`seam audit refuses ${label}`,()=>{
  const pieces=[0,delta].map(d=>({outline:[[0,0],[10,0],[10,20+d],[0,20]],edges:[{...edge,seamId:'side'}]}));
  const report=assessWovenSkirtConstruction(pieces);
  assert.ok(report.blockers.includes(code)); assert.equal(report.productionEligible,false);
});
