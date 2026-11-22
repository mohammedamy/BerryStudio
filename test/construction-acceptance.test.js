import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessDeclaredSeamConstruction,
  assessWovenBodiceConstruction,
  assessWovenDressConstruction,
  assessWovenSkirtConstruction,
  assessWovenTrouserConstruction,
  deriveReadinessStage,
} from '../js/construction-acceptance.js';
import { createWovenBasicBodiceProgram, createWovenBasicDressProgram, createWovenBasicTrousersProgram, executePatternProgram } from '../js/pattern-program.js';
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

test('a non-skirt declared pair is measured without inferring construction approval',()=>{
  const pieces=[
    {role:'trouser-front',outline:[[0,0],[8,0],[8,24],[0,24]],edges:[{seamId:'outseam',fromIdx:1,toIdx:2}]},
    {role:'trouser-back',outline:[[0,0],[8,0],[8,24],[0,24]],edges:[{seamId:'outseam',fromIdx:1,toIdx:2}]},
  ];
  const result=assessDeclaredSeamConstruction(pieces);
  assert.equal(result.family,'declared-seams');
  assert.equal(result.decision,'declared-seams-checked');
  assert.deepEqual(result.checks,[{seamId:'outseam',lengthsCm:[24,24],differenceMm:0}]);
  assert.equal(result.productionEligible,false);
});


test('woven bodice construction acceptance checks bodice-side and rejects missing role or mismatched seam', () => {
  const result = executePatternProgram(createWovenBasicBodiceProgram(), { chest: 92, waist: 74 });
  const ok = assessWovenBodiceConstruction(result.pieces);
  assert.equal(ok.family, 'woven-basic-bodice');
  assert.equal(ok.decision, 'bodice-seams-checked');
  assert.deepEqual(ok.blockers, []);
  assert.equal(ok.checks.length, 1);
  assert.equal(ok.checks[0].seamId, 'bodice-side');
  assert.equal(ok.productionEligible, false);

  const missingRole = assessWovenBodiceConstruction([result.pieces[0]]);
  assert.equal(missingRole.decision, 'needs-construction-evidence');
  assert.ok(missingRole.blockers.includes('constructionPieces'));

  const mismatched = structuredClone(result.pieces);
  mismatched[1].outline[4][1] += 2;
  const mismatchReport = assessWovenBodiceConstruction(mismatched);
  assert.equal(mismatchReport.decision, 'needs-construction-evidence');
  assert.ok(mismatchReport.blockers.includes('constructionMismatch'));
});

test('woven dress construction acceptance requires all 4 pieces and both declared seams', () => {
  const result = executePatternProgram(createWovenBasicDressProgram('regular'), { chest: 92, waist: 74, hips: 100 });
  const ok = assessWovenDressConstruction(result.pieces);
  assert.equal(ok.family, 'woven-basic-dress');
  assert.equal(ok.decision, 'dress-seams-checked');
  assert.deepEqual(ok.blockers, []);
  assert.deepEqual(ok.checks.map(c => c.seamId), ['dress-bodice-side', 'dress-skirt-side']);
  assert.equal(ok.productionEligible, false);

  const missingSkirt = assessWovenDressConstruction(result.pieces.slice(0, 2));
  assert.equal(missingSkirt.decision, 'needs-construction-evidence');
  assert.ok(missingSkirt.blockers.includes('constructionPieces'));
  assert.ok(missingSkirt.blockers.includes('constructionSeam'));

  const noSeam = structuredClone(result.pieces);
  delete noSeam[3].edges;
  const missingSeamReport = assessWovenDressConstruction(noSeam);
  assert.ok(missingSeamReport.blockers.includes('constructionSeam'));

  const mismatched = structuredClone(result.pieces);
  mismatched[3].outline[3][1] += 2.5;
  assert.ok(assessWovenDressConstruction(mismatched).blockers.includes('constructionMismatch'));
});

test('deriveReadinessStage separates geometry-checked, draft, maker, sample, and unsupported states', () => {
  const bodice = executePatternProgram(createWovenBasicBodiceProgram(), { chest: 92, waist: 74 }).pieces;
  const dress = executePatternProgram(createWovenBasicDressProgram('long'), { chest: 92, waist: 74, hips: 100 }).pieces;
  const trousers = executePatternProgram(createWovenBasicTrousersProgram('regular'), { waist: 74, hips: 98, inseam: 76 }).pieces;

  assert.equal(deriveReadinessStage(assessWovenBodiceConstruction(bodice)), 'geometry-checked');
  assert.equal(deriveReadinessStage(assessWovenDressConstruction(dress)), 'geometry-checked');
  assert.equal(deriveReadinessStage(assessWovenTrouserConstruction(trousers)), 'geometry-checked');
  assert.equal(deriveReadinessStage(assessWovenBodiceConstruction([])), 'draft');
  assert.equal(deriveReadinessStage({ decision: 'not-applicable' }), 'unsupported');
  assert.equal(deriveReadinessStage({ decision: 'bodice-seams-checked', makerApproval: { id: 'm1' } }), 'maker-reviewed');
  assert.equal(deriveReadinessStage({ decision: 'dress-seams-checked', makerApproval: { id: 'm1' }, sampleApproval: { id: 's1' } }), 'sample-approved');
});
