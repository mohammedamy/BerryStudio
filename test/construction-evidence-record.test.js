import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConstructionEvidenceRecord } from '../js/construction-evidence-record.js';
import { createWovenBasicBodiceProgram, createWovenBasicDressProgram, executePatternProgram } from '../js/pattern-program.js';

test('construction evidence records declared checks without asserting approval',()=>{
  const record=createConstructionEvidenceRecord({projectMeta:{id:'project-1',revision:4},pieces:[
    {role:'skirt-front',outline:[[0,0],[10,0],[10,20],[0,20]],edges:[{seamId:'side',fromIdx:1,toIdx:2}]},
    {role:'skirt-back',outline:[[0,0],[10,0],[10,20],[0,20]],edges:[{seamId:'side',fromIdx:1,toIdx:2}]},
  ]},{evaluatedAt:'2026-09-20T00:00:00.000Z'});
  assert.equal(record.schema,'berrystudio.construction-evidence.v1');
  assert.equal(record.assessment.decision,'side-seam-checked');
  assert.equal(record.approvals.productionEligible,false);
  assert.equal(record.assessment.makerApproval,null);
  assert.equal(record.evaluatedAt,'2026-09-20T00:00:00.000Z');
});

test('unsupported drafts are recorded as not applicable rather than treated as passing',()=>{
  const record=createConstructionEvidenceRecord({projectMeta:{id:'project-2',revision:0},pieces:[{role:'bodice-front',outline:[[0,0],[1,0],[0,1]]}]});
  assert.equal(record.assessment.decision,'not-applicable');
  assert.deepEqual(record.assessment.blockers,['constructionFamilyUnsupported']);
  assert.equal(record.approvals.productionEligible,false);
});

test('a declared non-skirt seam is recorded as geometry evidence, never an approval',()=>{
  const record=createConstructionEvidenceRecord({pieces:[
    {role:'trouser-front',outline:[[0,0],[8,0],[8,24],[0,24]],edges:[{seamId:'outseam',fromIdx:1,toIdx:2}]},
    {role:'trouser-back',outline:[[0,0],[8,0],[8,24],[0,24]],edges:[{seamId:'outseam',fromIdx:1,toIdx:2}]},
  ]});
  assert.equal(record.assessment.family,'declared-seams');
  assert.equal(record.assessment.decision,'declared-seams-checked');
  assert.equal(record.assessment.productionEligible,false);
});


test('bodice and dress drafts record family assessments, supported packets, and geometry-checked readinessStage without approval', () => {
  const bodicePieces = executePatternProgram(createWovenBasicBodiceProgram(), { chest: 92, waist: 74 }).pieces;
  const bodiceRecord = createConstructionEvidenceRecord({
    projectMeta: { id: 'bod-1', revision: 1 },
    patternConfiguration: { family: 'woven-basic-bodice', seamAllowanceCm: 1 },
    pieces: bodicePieces,
  });
  assert.equal(bodiceRecord.readinessStage, 'geometry-checked');
  assert.equal(bodiceRecord.assessment.family, 'woven-basic-bodice');
  assert.equal(bodiceRecord.assessment.decision, 'bodice-seams-checked');
  assert.equal(bodiceRecord.packet.family, 'woven-basic-bodice');
  assert.equal(bodiceRecord.packet.supported, true);
  assert.equal(bodiceRecord.approvals.productionEligible, false);

  const dressPieces = executePatternProgram(createWovenBasicDressProgram('regular'), { chest: 92, waist: 74, hips: 100 }).pieces;
  const dressRecord = createConstructionEvidenceRecord({
    projectMeta: { id: 'dr-1', revision: 3 },
    patternConfiguration: { family: 'woven-basic-dress', seamAllowanceCm: 1 },
    pieces: dressPieces,
  });
  assert.equal(dressRecord.readinessStage, 'geometry-checked');
  assert.equal(dressRecord.assessment.family, 'woven-basic-dress');
  assert.equal(dressRecord.assessment.decision, 'dress-seams-checked');
  assert.equal(dressRecord.packet.family, 'woven-basic-dress');
  assert.equal(dressRecord.packet.cutList.length, 4);
  assert.equal(dressRecord.approvals.productionEligible, false);

  const unsupportedRecord = createConstructionEvidenceRecord({
    projectMeta: { id: 'unsup-1', revision: 0 },
    pieces: [{ role: 'bodice-front', outline: [[0, 0], [1, 0], [0, 1]] }],
  });
  assert.equal(unsupportedRecord.readinessStage, 'unsupported');
});
