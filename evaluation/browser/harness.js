import { AIGen } from '../../js/ai.js';
import { computeMeasurements } from '../../js/data.js';
import { run } from '../../js/validate.js';
import { offsetPoly } from '../../js/geometry.js';

async function loadReference(reference) {
  if (!reference?.path?.startsWith('evaluation/v6-06/references/') || reference.path.includes('..')) throw new Error('Reference outside corpus');
  if (!reference.rights?.permittedUse || reference.rights.externalRightsRequired !== false) throw new Error('Reference permission missing');
  const response = await fetch('/'+reference.path);
  if (!response.ok) throw new Error(`Reference fetch failed: ${response.status}`);
  const blob = await response.blob();
  const dataURL = await new Promise((resolve,reject)=>{
    const reader = new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(new Error('Reference read failed')); reader.readAsDataURL(blob);
  });
  const image = new Image(); image.src=dataURL;
  await image.decode();
  return {dataURL,id:reference.id,width:image.naturalWidth,height:image.naturalHeight,bytes:blob.size};
}

window.runEvaluationTask = async (task,references) => {
  // This harness deliberately cannot evaluate a held-out task, even if an
  // accidental caller passes it through. Release holdout work needs a new run.
  if (task.split !== 'development') throw new Error('Holdout execution is disabled in this harness');
  if (task.references.length > 1) throw new Error('Multi-reference generation is unsupported; do not silently select one view');
  const started = performance.now();
  const imageInputs = [];
  try {
    for (const id of task.references) imageInputs.push(await loadReference(references.find(r=>r.id===id)));
    if (task.inputType === 'text+image' && imageInputs.length !== 1) throw new Error('Image input missing');
    const measurements = {...computeMeasurements(task.measurements),...task.measurements.overrides};
    for (const key of task.measurements.missing) delete measurements[key];
    const stages = [];
    const result = await AIGen.generate({prompt:task.prompt,imageDataURL:imageInputs[0]?.dataURL || null,category:task.measurements.category,measurements,endpoint:'',lang:task.language,onStage:stage=>stages.push(stage)});
    return {
      decision:result.decision || 'draft',reason:result.reason || null,garmentType:result.style?.type,lengthFactor:result.style?.lengthF,
      pieces:result.pieces,report:result.decision ? null : run(result.pieces,{bodyChestCm:measurements.chest,seamAllowanceCm:1,offsetPoly}),
      source:result.source,imageSupplied:result.imageSupplied,usedImage:result.usedImage,
      decodedReferences:imageInputs.map(({id,width,height,bytes})=>({id,width,height,bytes})),
      stages,elapsedMs:Math.round(performance.now()-started),
    };
  } catch (error) {
    return {error:error.message,decodedReferences:imageInputs.map(({id,width,height,bytes})=>({id,width,height,bytes})),elapsedMs:Math.round(performance.now()-started)};
  }
};
