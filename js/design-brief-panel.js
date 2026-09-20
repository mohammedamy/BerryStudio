import { updateDesignBrief, prepareBriefDraft } from './design-brief.js';

const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
export function mountDesignBrief(container,{t,language,getBrief,saveBrief,measurements,generate}) {
  const section=node('section'); section.className='design-brief';
  section.style.cssText='display:grid;gap:10px;margin-top:24px';
  section.append(node('h3',t('briefTitle')),node('p',t('briefScope')));
  const history=node('div'); history.className='brief-history'; history.setAttribute('aria-label',t('briefHistory'));
  history.style.cssText='max-height:180px;overflow:auto;overflow-wrap:anywhere';
  const summary=node('div'); summary.setAttribute('aria-live','polite');
  const label=node('label',t('briefMessage')); label.htmlFor='briefMessage';
  const input=node('textarea'); input.id='briefMessage'; input.className='textarea'; input.maxLength=2000; input.placeholder=t('briefExample');
  const send=node('button',t('briefSave')); send.className='big-btn ghost';
  const draft=node('button',t('briefDraft')); draft.className='big-btn';
  const error=node('p'); error.setAttribute('role','alert');
  function paint(){
    history.replaceChildren(); summary.replaceChildren(); error.textContent='';
    const brief=getBrief(); draft.disabled=!brief;
    if(!brief) return;
    let prepared;
    try {prepared=prepareBriefDraft(brief,measurements());}
    catch(e){draft.disabled=true;error.textContent=t(e.message);return;}
    for(const turn of brief.turns || []) {
      const text=turn.role==='user'?turn.text:Object.entries(turn.fields || {}).map(([key,f])=>`${t('brief_'+key)}: ${f.unit?`${f.value} ${f.unit}`:t('brief_'+f.value)}`).join(' · ');
      const p=node('p',`${t(turn.role==='user'?'briefYou':'briefAssistant')}: ${text}`);p.dir='auto';history.append(p);
      for(const issue of turn.issues || []) history.append(node('p',`${t('brief_'+issue.field)}: ${t('brief_'+issue.code)}`));
    }
    for(const [key,field] of Object.entries(brief.fields || {})) summary.append(node('p',`${t('brief_'+key)}: ${field.unit?`${field.value} ${field.unit}`:t('brief_'+field.value)}`));
    for(const issue of prepared.issues) summary.append(node('p',`${t('brief_'+issue.field)}: ${t('brief_'+issue.code)}`));
    if(prepared.decision==='propose') {
      summary.append(node('p',t('briefSizeNote')));
      for(const [key,field] of Object.entries(prepared.provenance)) summary.append(node('p',`${t('brief_'+key)}: ${field.value} cm (${t(field.source==='user'?'briefUser':'briefCurrentSize')})`));
    }
    draft.disabled=prepared.decision!=='propose' || !!input.value.trim();
  }
  input.oninput=paint;
  send.onclick=()=>{
    error.textContent='';
    try { saveBrief(updateDesignBrief(getBrief(),input.value,language)); input.value=''; paint(); }
    catch(e){error.textContent=t(e.message);}
  };
  draft.onclick=async()=>{
    error.textContent='';
    try {
      const brief=getBrief(), prepared=prepareBriefDraft(brief,measurements());
      if(prepared.decision!=='propose'){paint();return;}
      await generate(prepared,brief,draft);
    }catch(e){error.textContent=t(e.message);}
  };
  section.append(history,summary,label,input,send,error,draft);
  container.append(section); paint(); return paint;
}
