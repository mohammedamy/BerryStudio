// Development tooling only: no production behavior or model prompts are changed.
export function validateCorpus(corpus) {
  const require = (ok, message) => { if (!ok) throw new Error(message); };
  require(corpus.schemaVersion === 1 && corpus.tasks.length === 60, 'Expected schema v1 and 60 tasks');
  const ids = new Set(), groups = new Map(), references = new Map(corpus.references.map(r => [r.id, r]));
  require(references.size === corpus.references.length, 'Duplicate reference ID');
  for (const task of corpus.tasks) {
    require(!ids.has(task.id), 'Duplicate task ID'); ids.add(task.id);
    require(['development','holdout'].includes(task.split), 'Invalid split');
    require(['en','ar'].includes(task.language) && task.prompt.trim(), 'Invalid language/prompt');
    require(['skirt','dress','trousers'].includes(task.family), 'Invalid family');
    require(['draft','clarify','abstain'].includes(task.expected.decision), 'Invalid expected decision');
    require(task.expected.makerApproval === null, 'Engineering corpus cannot invent maker approval');
    require(task.measurements.units === 'cm', 'Measurements must declare cm');
    const group = groups.get(task.groupId) || [];
    group.push(task); groups.set(task.groupId, group);
    require(['text','text+image'].includes(task.inputType), 'Invalid input type');
    require(task.inputType === 'text' ? task.references.length === 0 : task.references.length > 0, 'Reference/input mismatch');
    for (const id of task.references) {
      const ref = references.get(id);
      require(ref?.rights?.permittedUse && ref.rights.externalRightsRequired === false, 'Reference permission missing');
    }
  }
  for (const group of groups.values()) require(group.length === 2 && new Set(group.map(t=>t.language)).size === 2 && new Set(group.map(t=>t.split)).size === 1 && new Set(group.map(t=>t.family)).size === 1, 'Translation group leaked across splits or is incomplete');
  for (const family of ['skirt','dress','trousers']) {
    for (const language of ['en','ar']) require(corpus.tasks.filter(t=>t.family===family && t.language===language).length===10, 'Family/language imbalance');
  }
  require(corpus.tasks.filter(t=>t.split==='holdout').length >= 20, 'At least 20 held-out tasks required');
  return true;
}

export function scoreOutcome(task, output) {
  const failures = [];
  if (output.error) return {status:'fail',failures:['execution-error'],detail:output.error};
  if (output.decision !== task.expected.decision) failures.push(task.expected.decision === 'clarify' ? 'missing-clarification' : task.expected.decision === 'abstain' ? 'missing-abstention' : 'unexpected-abstention');
  if (task.expected.decision !== 'draft' && output.pieces?.length) failures.push('draft-before-resolution');
  if (task.expected.decision === 'draft') {
    if (output.garmentType !== task.expected.garmentType) failures.push('wrong-family');
    const valid = Array.isArray(output.pieces) && output.pieces.length > 0 && output.pieces.every(p=>Array.isArray(p.outline) && p.outline.length>=3 && p.outline.every(point=>Array.isArray(point) && point.length===2 && point.every(Number.isFinite)));
    if (!valid) failures.push('invalid-geometry');
    if (output.report?.summary?.fail !== 0) failures.push('validator-failure');
    const length = task.tags.includes('short') ? 0.7 : task.tags.includes('long') ? 1.35 : 1;
    if (output.lengthFactor !== length) failures.push('wrong-length-intent');
  }
  return {status:failures.length?'fail':'pass',failures};
}

export function summarize(rows) {
  const result = {requested:rows.length,executed:0,pass:0,fail:0,notRun:0,makerReviewed:0,failures:{}};
  for (const row of rows) {
    if (row.status === 'not-run') result.notRun++;
    else { result.executed++; result[row.status]++; }
    for (const failure of row.failures || []) result.failures[failure]=(result.failures[failure]||0)+1;
  }
  result.executionCoverage = result.requested ? result.executed/result.requested : null;
  result.automatedPassRateAmongExecuted = result.executed ? result.pass/result.executed : null;
  result.passesPerRequestedTask = result.requested ? result.pass/result.requested : null;
  result.makerAcceptanceRate = null;
  return result;
}
