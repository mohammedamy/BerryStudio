import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { summarize } from '../scripts/evaluation-core.mjs';
const root=new URL('../',import.meta.url);
const bytes=path=>readFileSync(new URL(path,root));
const sha=data=>createHash('sha256').update(data).digest('hex');
const corpus=JSON.parse(bytes('evaluation/v6-06/corpus.json'));
const report=JSON.parse(bytes('evaluation/v6-06/baseline-browser.json'));
const outputBytes=bytes('evaluation/v6-06/browser-outputs.json');
const bundle=JSON.parse(outputBytes);

test('browser evidence covers only development tasks and binds actual geometry to its report',()=>{
  const selected=corpus.tasks.filter(t=>t.split==='development');
  assert.deepEqual(report.rows.map(r=>r.id),selected.map(t=>t.id));
  assert.deepEqual(bundle.outputs.map(r=>r.taskId),selected.map(t=>t.id));
  assert.equal(report.includeHoldout,false);
  assert.equal(report.heldOutNotExecuted,24);
  assert.equal(report.outputBundleSha256,sha(outputBytes));
  assert.deepEqual(bundle.sourceHashes,report.sourceHashes);
  assert.equal(report.sourceHashes['evaluation/v6-06/corpus.json'],sha(bytes('evaluation/v6-06/corpus.json')));
  for (const row of report.rows) {
    const output=bundle.outputs.find(o=>o.taskId===row.id);
    assert.equal(row.geometrySha256,sha(JSON.stringify(output.pieces)));
    assert.equal(output.units,'cm');
    assert.equal(row.makerReview,null);
  }
  assert.deepEqual(report.summary,summarize(report.rows));
});

test('image evidence records real decoded references and a successful independent positive control',()=>{
  const images=report.rows.filter(r=>r.inputType==='text+image');
  assert.equal(images.length,6);
  assert.equal(report.imageControl.ok,true);
  assert.equal(report.summary.notRun,0);
  for (const row of images) {
    assert.equal(row.imageSupplied,true);
    assert.equal(typeof row.usedImage,'boolean');
    assert.equal(row.source,'local');
    assert.equal(row.decodedReferences.length,1);
    const decoded=row.decodedReferences[0];
    const reference=corpus.references.find(r=>r.id===decoded.id);
    assert.equal(decoded.bytes,bytes(reference.path).length);
    assert.ok(decoded.width>0 && decoded.height>0);
    assert.equal(report.sourceHashes[reference.path],sha(bytes(reference.path)));
    assert.deepEqual(row.stages,['analyzing','silhouette','drafting','done']);
  }
});
