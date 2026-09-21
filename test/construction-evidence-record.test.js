import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConstructionEvidenceRecord } from '../js/construction-evidence-record.js';

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
