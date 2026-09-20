import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateCorpus, scoreOutcome, summarize } from '../scripts/evaluation-core.mjs';
const root = new URL('../',import.meta.url);
const corpus = JSON.parse(readFileSync(new URL('evaluation/v6-06/corpus.json',root)));

test('evaluation corpus has balanced translation pairs, 24 isolated holdouts and permitted references',()=>{
  assert.equal(validateCorpus(corpus),true);
  assert.equal(corpus.tasks.filter(t=>t.split==='holdout').length,24);
  assert.equal(corpus.references.length,6);
  for (const ref of corpus.references) {
    assert.ok(ref.path.startsWith('evaluation/v6-06/references/'));
    assert.ok(existsSync(new URL(ref.path,root)));
    assert.equal(ref.makerApproval,null);
  }
  const bad=structuredClone(corpus); bad.tasks[0].split='holdout';
  assert.throws(()=>validateCorpus(bad),/Translation group/);
  const unlicensed=structuredClone(corpus); delete unlicensed.references[0].rights.permittedUse;
  assert.throws(()=>validateCorpus(unlicensed),/permission/);
});

test('scoring never rewards a draft when clarification or abstention was required',()=>{
  const pieces=[{outline:[[0,0],[1,0],[0,1]]}];
  for (const decision of ['clarify','abstain']) {
    const task={expected:{decision}};
    assert.equal(scoreOutcome(task,{decision:'draft',pieces}).status,'fail');
    assert.equal(scoreOutcome(task,{decision,pieces}).status,'fail');
    assert.equal(scoreOutcome(task,{decision}).status,'pass');
    assert.equal(scoreOutcome(task,{error:'crashed'}).status,'fail');
  }
});

test('draft scoring requires finite geometry, intended family/length and validator evidence',()=>{
  const task={expected:{decision:'draft',garmentType:'skirt'},tags:['regular']};
  const good={decision:'draft',garmentType:'skirt',lengthFactor:1,pieces:[{outline:[[0,0],[1,0],[0,1]]}],report:{summary:{fail:0}}};
  assert.equal(scoreOutcome(task,good).status,'pass');
  for (const override of [{pieces:[]},{pieces:[{outline:[[NaN,0],[1,0],[0,1]]}]},{garmentType:'dress'},{lengthFactor:1.35},{report:null},{report:{summary:{}}},{report:{summary:{fail:1}}}]) assert.equal(scoreOutcome(task,{...good,...override}).status,'fail');
});

test('unexecuted cases remain in denominators and maker acceptance stays unknown',()=>{
  const summary=summarize([{status:'pass'},{status:'fail',failures:['missing-clarification']},{status:'not-run'}]);
  assert.equal(summary.executionCoverage,2/3);
  assert.equal(summary.automatedPassRateAmongExecuted,1/2);
  assert.equal(summary.passesPerRequestedTask,1/3);
  assert.equal(summary.makerAcceptanceRate,null);
  assert.equal(summarize([]).automatedPassRateAmongExecuted,null);
});

test('default baseline is reproducible, excludes holdouts and does not substitute text for images',()=>{
  const actual=execFileSync(process.execPath,['scripts/evaluate-v6.mjs'],{cwd:root,encoding:'utf8'});
  const stored=readFileSync(new URL('evaluation/v6-06/baseline-local.json',root),'utf8');
  const repeated=execFileSync(process.execPath,['scripts/evaluate-v6.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(actual,repeated);
  const report=JSON.parse(actual);
  // The historical baseline must not be rewritten merely to make future
  // generator changes pass. Compare bytes only when its source set matches.
  if (JSON.stringify(report.sourceHashes)===JSON.stringify(JSON.parse(stored).sourceHashes)) assert.equal(actual,stored);
  assert.equal(report.heldOutNotExecuted,24);
  assert.equal(report.rows.length,36);
  assert.ok(report.rows.every(r=>r.split==='development'));
  assert.equal(report.rows.filter(r=>r.inputType==='text+image' && r.status==='not-run').length,6);
  for (const [path,hash] of Object.entries(report.sourceHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(path,root))).digest('hex'),hash);
});
