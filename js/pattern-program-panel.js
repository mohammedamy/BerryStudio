import { prepareBriefDraft } from './design-brief.js';
import { prepareMultimodalProposal } from './multimodal-proposal.js';
import { executePatternProgram } from './pattern-program.js';
import { createWovenALineSkirtConfiguration, configurationToWovenALineSkirtProgram, diffWovenALineSkirtConfiguration, summarizeWovenALineSkirtConfiguration } from './skirt-configurator.js';
import { createWovenBasicBodiceConfiguration, configurationToWovenBasicBodiceProgram, summarizeWovenBasicBodiceConfiguration } from './bodice-configurator.js';
import { createWovenBasicDressConfiguration, configurationToWovenBasicDressProgram, summarizeWovenBasicDressConfiguration } from './dress-configurator.js';
import { createWovenBasicTrousersConfiguration, configurationToWovenBasicTrousersProgram, diffWovenBasicTrousersConfiguration, summarizeWovenBasicTrousersConfiguration } from './trouser-configurator.js';

const node=(tag,text)=>{const element=document.createElement(tag);if(text!=null) element.textContent=text;return element;};

export function mountPatternProgram(container,{t,getBrief,getStudio,category,measurements,measurementProfileId,language,validate,review}) {
  const section=node('section'); section.className='pattern-program'; section.style.cssText='display:grid;gap:10px;margin-top:24px';
  section.append(node('h3',t('programTitle')),node('p',t('programScope')));
  const status=node('p'); status.setAttribute('aria-live','polite');
  const form=node('div'); form.className='pattern-configuration'; form.style.cssText='display:grid;gap:6px';
  const label=node('label'); const labelText=node('span',t('programLength')); const length=node('select'); length.name='pattern-length';
  // Keep the established neutral configuration as the initial selection;
  // alternate lengths require an intentional change before review.
  for(const value of ['regular','short','long']) { const option=node('option',t(`programLength_${value}`)); option.value=value; length.append(option); }
  label.append(labelText,length); form.append(label);
  const specification=node('p'); specification.className='help-note';
  const pieces=node('p'); pieces.className='help-note'; pieces.textContent=t('programPieces'); form.append(specification,pieces);
  const button=node('button',t('programDraft')); button.className='big-btn'; button.type='button';
  const prepared=()=>{ if(container.querySelector('#briefMessage')?.value.trim()) throw new Error('unsaved'); return prepareBriefDraft(getBrief(),measurements()); };
  container.addEventListener('input', paint);
  function paint(){
    status.textContent=''; button.disabled=true;
    const family=getBrief()?.fields?.family?.value, isBodice=family==='bodice', isDress=family==='dress', isTrousers=family==='trousers';
    label.hidden=isBodice;
    labelText.textContent=isTrousers?t('programTrouserLength'):t('programLength');
    for(const option of length.options) option.textContent=t(`${isTrousers?'programTrouserLength':'programLength'}_${option.value}`);
    pieces.textContent=isTrousers?t('programPiecesTrousers'):t('programPieces');
    button.textContent=isBodice?t('programDraftBodice'):isDress?t('programDraftDress'):isTrousers?t('programDraftTrousers'):t('programDraft');
    try {
      const profileId=measurementProfileId?.()||null, lang=language?.()||'en';
      specification.textContent=isBodice
        ? summarizeWovenBasicBodiceConfiguration(createWovenBasicBodiceConfiguration({measurementProfileId:profileId}),lang)
        : isDress
          ? summarizeWovenBasicDressConfiguration(createWovenBasicDressConfiguration({length:length.value,measurementProfileId:profileId}),lang)
          : isTrousers
            ? summarizeWovenBasicTrousersConfiguration(createWovenBasicTrousersConfiguration({length:length.value,measurementProfileId:profileId}),lang)
            : summarizeWovenALineSkirtConfiguration(createWovenALineSkirtConfiguration({length:length.value,measurementProfileId:profileId}),lang);
    } catch { specification.textContent=''; }
    try {
      const next=prepared();
      if(next.decision!=='propose') { status.textContent=t('programNeedBrief'); return; }
      if(!next.prompt.endsWith('woven skirt')&&!next.prompt.endsWith('woven bodice')&&!next.prompt.endsWith('woven dress')&&!next.prompt.endsWith('woven trousers')) { status.textContent=t('programNeedSkirt'); return; }
      button.disabled=false; status.textContent=isBodice?t('programReadyBodice'):isDress?t('programReadyDress'):isTrousers?t('programReadyTrousers'):t('programReady');
    } catch { status.textContent=t('programNeedBrief'); }
  }
  button.onclick=()=>{
    try {
      const next=prepared();
      const isBodice=next.prompt.endsWith('woven bodice'), isDress=next.prompt.endsWith('woven dress'), isTrousers=next.prompt.endsWith('woven trousers');
      if(next.decision!=='propose' || (!next.prompt.endsWith('woven skirt')&&!isBodice&&!isDress&&!isTrousers)) { paint(); return; }
      const profileId=measurementProfileId?.()||null, lang=language?.()||'en';
      const configuration=isBodice
        ? createWovenBasicBodiceConfiguration({measurementProfileId:profileId})
        : isDress
          ? createWovenBasicDressConfiguration({length:length.value,measurementProfileId:profileId})
          : isTrousers
            ? createWovenBasicTrousersConfiguration({length:length.value,measurementProfileId:profileId})
            : createWovenALineSkirtConfiguration({length:length.value,measurementProfileId:profileId});
      const baseline=isBodice
        ? configuration
        : isDress
          ? createWovenBasicDressConfiguration({measurementProfileId:profileId})
          : isTrousers
            ? createWovenBasicTrousersConfiguration({measurementProfileId:profileId})
            : createWovenALineSkirtConfiguration({measurementProfileId:profileId});
      const program=isBodice
        ? configurationToWovenBasicBodiceProgram(configuration)
        : isDress
          ? configurationToWovenBasicDressProgram(configuration)
          : isTrousers
            ? configurationToWovenBasicTrousersProgram(configuration)
            : configurationToWovenALineSkirtProgram(configuration);
      const output=executePatternProgram(program,next.measurements), report=validate(output.pieces,next.measurements);
      if(report.summary.fail) { status.textContent=t('programRejected'); return; }
      const multimodalProposal=prepareMultimodalProposal({brief:getBrief(),measurements:next.measurements,studio:getStudio?.()||null,category:category?.()||null});
      if(multimodalProposal.decision!=='propose') { status.textContent=t('programRejected'); return; }
      const changes=isBodice
        ? []
        : isDress
          ? (baseline.length===configuration.length?[]:[{field:'length',before:baseline.length,after:configuration.length}])
          : isTrousers
            ? diffWovenBasicTrousersConfiguration(baseline,configuration)
            : diffWovenALineSkirtConfiguration(baseline,configuration);
      const summaryLead=isBodice?t('programReviewBodice'):isDress?t('programReviewDress'):isTrousers?t('programReviewTrousers'):t('programReview');
      const summaryDetail=isBodice
        ? summarizeWovenBasicBodiceConfiguration(configuration,lang)
        : isDress
          ? summarizeWovenBasicDressConfiguration(configuration,lang)
          : isTrousers
            ? summarizeWovenBasicTrousersConfiguration(configuration,lang)
            : summarizeWovenALineSkirtConfiguration(configuration,lang);
      review({pieces:output.pieces,colors:['#6d5efc','#00c2a8','#e2a52b'],summary:`${summaryLead} ${summaryDetail}`,brief:structuredClone(getBrief()),multimodalProposal,patternConfiguration:configuration,configurationDiff:changes,patternProgram:{version:1,family:program.family,operations:program.operations,measurements:next.measurements,provenance:next.provenance,validation:report}});
    } catch { status.textContent=t('programRejected'); }
  };
  length.addEventListener('change',paint);
  section.append(form,status,button); container.append(section); paint(); return paint;
}
