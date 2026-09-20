import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateDesignBrief,prepareBriefDraft,briefMatchesStyle} from '../js/design-brief.js';
import {Canvas} from '../js/canvas.js';
import {migrateProject} from '../js/project-revisions.js';
const defaults={waist:80,hips:100,chest:92};
const start=()=>updateDesignBrief(null,'regular-length woven skirt, waist 72 cm, hips 98 cm');

test('bilingual briefs normalize Arabic digits and units with explicit user provenance',()=>{
  const en=start();
  const ar=updateDesignBrief(null,'تنورة منسوجة بطول عادي، خصر ٧٢ سم، أرداف ٩٨ سم','ar');
  for(const brief of [en,ar]) {
    const p=prepareBriefDraft(brief,defaults);
    assert.equal(p.decision,'propose'); assert.equal(p.prompt,'regular-length woven skirt');
    assert.equal(p.measurements.waist,72); assert.equal(p.measurements.hips,98);
    assert.equal(p.provenance.waist.source,'user'); assert.equal(p.provenance.chest.source,'current-size');
    assert.equal(brief.turns[1].role,'assistant');
  }
  assert.equal(prepareBriefDraft(updateDesignBrief(en,'waist 30 inches'),defaults).measurements.waist,76.2);
  assert.deepEqual(defaults,{waist:80,hips:100,chest:92});
});
test('conflicting measurements block proposals until an explicit correction without losing previous turns',()=>{
  for(const text of ['My waist is both 70 cm and 90 cm','قياس خصري ٧٠ سم و٩٠ سم']){
    const original=start(), before=structuredClone(original);
    const conflict=updateDesignBrief(original,text);
    assert.equal(prepareBriefDraft(conflict,defaults).decision,'clarify');
    assert.deepEqual(conflict.issues[0].values,[70,90]);
    const fixed=updateDesignBrief(conflict,'waist 74 cm');
    assert.equal(prepareBriefDraft(fixed,defaults).decision,'propose');
    assert.equal(fixed.fields.waist.value,74);assert.equal(fixed.turns.length,6);
    assert.deepEqual(original,before);
  }
});
test('invalid, unitless, missing and unsupported inputs do not silently become drafts',()=>{
  assert.equal(prepareBriefDraft(updateDesignBrief(start(),'waist -10 cm'),defaults).decision,'abstain');
  assert.equal(prepareBriefDraft(updateDesignBrief(start(),'waist 72'),defaults).decision,'clarify');
  assert.equal(prepareBriefDraft(updateDesignBrief(start(),'waist 72 or 90 cm'),defaults).decision,'clarify');
  assert.equal(prepareBriefDraft(updateDesignBrief(start(),'waist 72 cm; waist 90'),defaults).decision,'clarify');
  assert.equal(prepareBriefDraft(updateDesignBrief(null,'woven skirt'),defaults).decision,'clarify');
  assert.equal(prepareBriefDraft(updateDesignBrief(start(),'stretch'),defaults).decision,'abstain');
  const noMeasurement=updateDesignBrief(null,'regular-length woven dress');
  assert.equal(prepareBriefDraft(noMeasurement,{waist:70,hips:90}).decision,'abstain');
  assert.throws(()=>updateDesignBrief({version:2},'skirt'),/briefVersion/);
  assert.throws(()=>updateDesignBrief(null,'x'.repeat(2001)),/briefInputInvalid/);
  for(const mutate of [b=>b.fields.waist.unit='inches',b=>b.turns[1].fields.waist=null,b=>b.issues=null]) {
    const malformed=start();mutate(malformed);
    assert.throws(()=>prepareBriefDraft(malformed,defaults),/briefVersion/);
  }
});
test('follow-ups preserve unrelated choices and sleeve wording does not change garment length',()=>{
  const result=updateDesignBrief(start(),'long sleeves');
  assert.equal(result.fields.length.value,'regular');
  assert.equal(result.fields.waist.value,72);
  const updated=updateDesignBrief(result,'long');
  assert.equal(updated.fields.length.value,'long');
  assert.equal(updated.fields.family.value,'skirt');
});
test('provider results must confirm captured family and length before proposal review',()=>{
  const brief=start();
  assert.equal(briefMatchesStyle(brief,{type:'skirt',lengthF:1}),true);
  for(const style of [null,{},{type:'dress',lengthF:1},{type:'skirt',lengthF:1.35}]) assert.equal(briefMatchesStyle(brief,style),false);
});
test('briefs round-trip, undo and redo without editing locked geometry; accepted draft includes brief in one undo',()=>{
  const p=migrateProject({pieces:[{name:'Locked',locked:true,outline:[[0,0],[10,0],[10,10]]}]});
  Canvas.restoreState(p);Canvas.setHistory({undo:[],redo:[]});
  const brief=start();Canvas.setDesignBrief(brief);
  assert.deepEqual(Canvas.snapshotState().pieces,p.pieces);
  assert.deepEqual(migrateProject(JSON.parse(JSON.stringify(Canvas.snapshotState()))).brief,brief);
  Canvas.doUndo();assert.equal(Canvas.snapshotState().brief,undefined);
  Canvas.doRedo();assert.deepEqual(Canvas.snapshotState().brief,brief);
  Canvas.restoreState(migrateProject({pieces:[]}));Canvas.setHistory({undo:[],redo:[]});
  Canvas.setPattern(p.pieces,['#112233'],{brief});
  assert.equal(Canvas.getHistory().undo.length,1);
  assert.deepEqual(Canvas.snapshotState().brief,brief);
  Canvas.doUndo();assert.equal(Canvas.snapshotState().brief,undefined);assert.equal(Canvas.getPieces().length,0);
  Canvas.doRedo();assert.deepEqual(Canvas.snapshotState().brief,brief);
});
