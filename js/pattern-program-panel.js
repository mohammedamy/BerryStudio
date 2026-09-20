import { prepareBriefDraft } from './design-brief.js';
import { createWovenALineSkirtProgram, executePatternProgram } from './pattern-program.js';

const node=(tag,text)=>{const element=document.createElement(tag);if(text!=null) element.textContent=text;return element;};

export function mountPatternProgram(container,{t,getBrief,measurements,validate,review}) {
  const section=node('section'); section.className='pattern-program'; section.style.cssText='display:grid;gap:10px;margin-top:24px';
  section.append(node('h3',t('programTitle')),node('p',t('programScope')));
  const status=node('p'); status.setAttribute('aria-live','polite');
  const button=node('button',t('programDraft')); button.className='big-btn'; button.type='button';
  const prepared=()=>{ if(container.querySelector('#briefMessage')?.value.trim()) throw new Error('unsaved'); return prepareBriefDraft(getBrief(),measurements()); };
  container.addEventListener('input', paint);
  function paint(){
    status.textContent=''; button.disabled=true;
    try {
      const next=prepared();
      if(next.decision!=='propose') { status.textContent=t('programNeedBrief'); return; }
      if(!next.prompt.endsWith('woven skirt')) { status.textContent=t('programNeedSkirt'); return; }
      button.disabled=false; status.textContent=t('programReady');
    } catch { status.textContent=t('programNeedBrief'); }
  }
  button.onclick=()=>{
    try {
      const next=prepared();
      if(next.decision!=='propose' || !next.prompt.endsWith('woven skirt')) { paint(); return; }
      const length=next.prompt.startsWith('short')?'short':next.prompt.startsWith('long')?'long':'regular';
      const program=createWovenALineSkirtProgram(length), output=executePatternProgram(program,next.measurements), report=validate(output.pieces,next.measurements);
      if(report.summary.fail) { status.textContent=t('programRejected'); return; }
      review({pieces:output.pieces,colors:['#6d5efc','#00c2a8','#e2a52b'],summary:t('programReview'),brief:structuredClone(getBrief()),patternProgram:{version:1,family:program.family,operations:program.operations,measurements:next.measurements,provenance:next.provenance,validation:report}});
    } catch { status.textContent=t('programRejected'); }
  };
  section.append(status,button); container.append(section); paint(); return paint;
}
