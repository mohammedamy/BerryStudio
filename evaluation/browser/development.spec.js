import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateCorpus, scoreOutcome, summarize } from '../../scripts/evaluation-core.mjs';
const root = new URL('../../',import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('development corpus uses actual text and image generation',async({page,browser,request},testInfo)=>{
  expect((await request.get('/evaluation/browser/..%2f..%2fpackage.json')).status()).toBe(404);
  const corpus = JSON.parse(await readFile(new URL('evaluation/v6-06/corpus.json',root),'utf8'));
  validateCorpus(corpus);
  const errors = [], remoteRequests = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:8794') return route.continue();
    remoteRequests.push(route.request().url()); return route.abort();
  });
  await page.goto('/evaluation/browser/harness.html');
  await page.waitForFunction(()=>typeof window.runEvaluationTask === 'function');
  const rows = [], outputs = [];
  for (const task of corpus.tasks.filter(t=>t.split==='development')) {
    const output = await page.evaluate(({task,references})=>window.runEvaluationTask(task,references),{task,references:corpus.references});
    outputs.push({taskId:task.id,units:'cm',pieces:output.pieces || null,observedDecision:output.decision || null,reason:output.reason || null});
    rows.push({id:task.id,family:task.family,language:task.language,inputType:task.inputType,split:task.split,expectedDecision:task.expected.decision,...scoreOutcome(task,output),actualDecision:output.decision || null,actualFamily:output.garmentType || null,lengthFactor:output.lengthFactor ?? null,pieceCount:output.pieces?.length || 0,geometrySha256:output.pieces?sha(JSON.stringify(output.pieces)):null,validator:output.report || null,source:output.source || null,imageSupplied:output.imageSupplied ?? null,usedImage:output.usedImage ?? null,decodedReferences:output.decodedReferences,stages:output.stages || [],elapsedMs:output.elapsedMs,makerReview:null});
  }
  const sources = ['evaluation/v6-06/corpus.json','evaluation/browser/harness.html','evaluation/browser/harness.js','evaluation/browser/development.spec.js','playwright.evaluation.config.js','scripts/serve-evaluation.mjs','scripts/evaluation-core.mjs','js/ai.js','js/data.js','js/pleats.js','js/validate.js','js/geometry.js',...corpus.references.map(r=>r.path)];
  const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async path=>[path,sha(await readFile(new URL(path,root)))])));
  const strata = {};
  for (const field of ['family','language','inputType']) strata[field]=Object.fromEntries([...new Set(rows.map(r=>r[field]))].map(value=>[value,summarize(rows.filter(r=>r[field]===value))]));
  // A synthetic high-contrast control proves that the real image path can
  // produce metrics. It is not a corpus task and never changes corpus inputs.
  const imageControl = await page.evaluate(async()=>{
    const { AIGen } = await import('/js/ai.js');
    const canvas=document.createElement('canvas'); canvas.width=200; canvas.height=220;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,200,220);
    ctx.fillStyle='#111'; ctx.fillRect(60,25,80,170);
    return AIGen.analyzeImage(canvas.toDataURL('image/png'));
  });
  const outputBundle = {schemaVersion:1,corpus:corpus.id,scope:'Raw generated geometry for maker inspection; not approved patterns or positioned import projects.',sourceHashes,outputs};
  const outputText=JSON.stringify(outputBundle,null,2)+'\n';
  const report = {schemaVersion:1,corpus:corpus.id,adapter:'Chromium: actual AIGen.generate with local image decoding and heuristic silhouette analysis; no remote provider or production UI',runtime:{browser:browser.version(),platform:process.platform},scope:'Automated decision/family/length/validator checks, not maker acceptance or fit accuracy. Elapsed time includes artificial generation stages and image decoding; not time to accepted design.',includeHoldout:false,heldOutNotExecuted:corpus.tasks.filter(t=>t.split==='holdout').length,sourceHashes,outputBundleSha256:sha(outputText),imageControl,summary:summarize(rows),strata,unmeasured:['Maker acceptance','Sewn fit','Full measurement adherence','Join correctness','Lock preservation','Time and cost per accepted result','Remote model performance','Other browsers/devices'],rows};
  await writeFile(testInfo.outputPath('report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(testInfo.outputPath('outputs.json'),outputText);
  expect(errors).toEqual([]); expect(remoteRequests).toEqual([]);
  expect(imageControl.ok).toBe(true);
  expect(rows).toHaveLength(36);
  expect(rows.filter(r=>r.failures.includes('execution-error'))).toEqual([]);
  for (const row of rows) {
    expect(row.source).toBe('local');
    if(row.actualDecision === 'clarify') {
      expect(row.stages).toEqual(['analyzing','clarify']);
      expect(row.pieceCount).toBe(0);
      expect(row.usedImage).toBe(false);
    } else expect(row.stages).toEqual(['analyzing','silhouette','drafting','done']);
    expect(row.imageSupplied).toBe(row.inputType==='text+image');
    if (row.inputType==='text+image') {
      expect(row.decodedReferences).toHaveLength(1);
      expect(row.decodedReferences[0].width).toBeGreaterThan(0);
      expect(row.decodedReferences[0].height).toBeGreaterThan(0);
      expect(typeof row.usedImage).toBe('boolean');
    }
  }
  // Failure to decode is recorded as execution-error, never a text-only pass.
  const fixture=corpus.tasks.find(t=>t.split==='development' && t.inputType==='text+image');
  const missing = await page.evaluate(task=>window.runEvaluationTask(task,[]),fixture);
  expect(missing.error).toBeTruthy();
  const denied = await page.evaluate(async task=>{
    try { await window.runEvaluationTask({...task,split:'holdout'},[]); return false; } catch { return true; }
  },fixture);
  expect(denied).toBe(true);
});
