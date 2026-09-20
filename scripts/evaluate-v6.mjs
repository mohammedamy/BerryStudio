import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { AIGen } from '../js/ai.js';
import { computeMeasurements } from '../js/data.js';
import { run } from '../js/validate.js';
import { offsetPoly } from '../js/geometry.js';
import { validateCorpus, scoreOutcome, summarize } from './evaluation-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bytes = path => readFileSync(resolve(root,path));
const sha = data => createHash('sha256').update(data).digest('hex');
const corpusPath = 'evaluation/v6-06/corpus.json';
const corpus = JSON.parse(bytes(corpusPath));
validateCorpus(corpus);
const args = process.argv.slice(2);
if (args.some(arg=>arg !== '--include-holdout')) throw new Error('Usage: node scripts/evaluate-v6.mjs [--include-holdout]');
const includeHoldout = args.includes('--include-holdout');
const selected = corpus.tasks.filter(task=>includeHoldout || task.split === 'development');
const rows = selected.map(task => {
  const row = {id:task.id,family:task.family,language:task.language,inputType:task.inputType,split:task.split,expectedDecision:task.expected.decision,makerReview:null};
  if (task.inputType !== 'text') return {...row,status:'not-run',reason:'Image analysis requires a separate browser/provider adapter; text-only substitution is forbidden.',failures:[]};
  try {
    const measurements = {...computeMeasurements(task.measurements),...task.measurements.overrides};
    for (const key of task.measurements.missing) delete measurements[key];
    const style = AIGen.deriveStyle({metrics:null,prompt:task.prompt,category:task.measurements.category,imageDataURL:null});
    const {pieces} = AIGen.build(style, measurements);
    const report = run(pieces,{bodyChestCm:measurements.chest,seamAllowanceCm:1,offsetPoly});
    const output = {decision:'draft',garmentType:style.type,lengthFactor:style.lengthF,pieces,report};
    return {...row,...scoreOutcome(task,output),actualDecision:output.decision,actualFamily:style.type,lengthFactor:style.lengthF,pieceCount:pieces.length,geometrySha256:sha(JSON.stringify(pieces)),validator:report};
  } catch (error) { return {...row,...scoreOutcome(task,{error:error.message})}; }
});
const sources = [corpusPath,'js/ai.js','js/data.js','js/pleats.js','js/validate.js','js/geometry.js','scripts/evaluation-core.mjs','scripts/evaluate-v6.mjs',...corpus.references.map(r=>r.path)];
const strata = {};
for (const field of ['family','language','inputType','split']) {
  strata[field] = Object.fromEntries([...new Set(selected.map(t=>t[field]))].map(value=>[value,summarize(rows.filter(r=>r[field]===value))]));
}
console.log(JSON.stringify({schemaVersion:1,corpus:corpus.id,adapter:'local deriveStyle + build; not end-to-end UI or remote model evaluation',scope:'Automated family, length intent, decision and validator checks only. A pass is not maker approval or fit accuracy.',includeHoldout,heldOutNotExecuted:includeHoldout?0:corpus.tasks.length-selected.length,sourceHashes:Object.fromEntries(sources.map(path=>[path,sha(bytes(path))])),summary:summarize(rows),strata,unmeasured:['Image analysis','Maker acceptance','Sewn fit','Full measurement adherence','Missing/wrong pieces and join correctness','Locked-field preservation','Latency and cost per accepted result','Device-specific behavior'],rows},null,2));
