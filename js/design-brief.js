// Bounded local brief capture. This is not an LLM or construction/fit approval.
const copy = value => JSON.parse(JSON.stringify(value));
const tokens = {
  family: { skirt: /\bskirt\b|تنورة|جيبة/u, dress: /\bdress\b|فستان/u, trousers: /\b(?:trousers|pants)\b|بنطلون|سروال/u },
  length: { short: /\b(?:short|mini)\b|قصير/u, regular: /\b(?:regular|medium|knee)[ -]length\b|طول عادي|طول متوسط/u, long: /\b(?:long|maxi)\b|طويل/u },
  fabric: { woven: /\bwoven\b|منسوج/u, stretch: /\b(?:stretch|knit|jersey)\b|مطاط|تريكو/u },
};
const measurementNames = /\b(?:waist|hips|chest)\b|خصر[ي]?|أرداف|ارداف|صدر[ي]?/gu;
const measurementKey = word => /waist|خصر/u.test(word) ? 'waist' : /hips|أرداف|ارداف/u.test(word) ? 'hips' : 'chest';
const normalize = text => text.toLowerCase().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/٫/g,'.');

function validateSession(session) {
  const record=value=>value && typeof value==='object' && !Array.isArray(value);
  const issuesValid=issues=>Array.isArray(issues) && issues.length<=20 && issues.every(i=>record(i) && typeof i.field==='string' && typeof i.code==='string');
  const fieldsValid=fields=>record(fields) && Object.entries(fields).every(([key,field])=>record(field) && field.source==='user' && typeof field.turnId==='string' &&
    (Object.hasOwn(tokens,key) ? Object.hasOwn(tokens[key],field.value) : ['waist','hips','chest'].includes(key) && field.unit==='cm' && Number.isFinite(field.value) && field.value>0));
  if(!record(session) || session.version!==1 || !record(session.fields) || !Array.isArray(session.turns) || session.turns.length>60 || !Array.isArray(session.issues) || session.issues.length>20) throw new Error('briefVersion');
  for(const turn of session.turns) if(!record(turn) || !['user','assistant'].includes(turn.role) || (turn.role==='user' ? typeof turn.text!=='string' || turn.text.length>2000 : !fieldsValid(turn.fields) || !issuesValid(turn.issues))) throw new Error('briefVersion');
  if(!fieldsValid(session.fields)) throw new Error('briefVersion');
  for(const issue of session.issues) if(!record(issue) || typeof issue.field!=='string' || typeof issue.code!=='string') throw new Error('briefVersion');
}

export function updateDesignBrief(previous, text, language = 'en') {
  if(typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('briefInputInvalid');
  if(previous) validateSession(previous);
  const session = previous ? copy(previous) : {version:1,turns:[],fields:{},issues:[]};
  if(session.turns.filter(t=>t.role==='user').length >= 30) throw new Error('briefHistoryFull');
  const turnId = crypto.randomUUID();
  session.turns.push({id:turnId,role:'user',language:language==='ar'?'ar':'en',text:text.trim()});
  const input = normalize(text);
  const set = (field, values, unit) => {
    session.issues = session.issues.filter(issue=>issue.field!==field);
    const unique = [...new Set(values)];
    if(unique.length!==1) { session.issues.push({field,code:'conflict',values:unique}); return; }
    const value=unique[0];
    if(unit && (!Number.isFinite(value) || value<=0)) { session.issues.push({field,code:'invalid',values:unique}); return; }
    session.fields[field] = {value,source:'user',turnId,...(unit?{unit}:{})};
  };
  for(const [field,choices] of Object.entries(tokens)) {
    const source = field==='length' ? input.replace(/\b(?:long|short)[ -]sleeves?\b/g,'').replace(/(?:كم|أكمام)\s*(?:طويل[ةه]?|قصير[ةه]?)/gu,'') : input;
    const values=Object.entries(choices).filter(([,pattern])=>pattern.test(source)).map(([value])=>value);
    if(values.length) set(field,values);
  }
  const mentions=[...input.matchAll(measurementNames)];
  const candidates={};
  const unclear=new Set();
  mentions.forEach((match,index)=>{
    const field=measurementKey(match[0]);
    const fragment=input.slice(match.index+match[0].length,mentions[index+1]?.index).split(/[;؛\n]/)[0];
    const values=[...fragment.matchAll(/(-?\d+(?:\.\d+)?)\s*(cm\b|centimet(?:er|re)s?\b|سم|سنتيمتر(?:ات)?|inches\b|inch\b|in\b|بوصة|بوصات)/gu)].map(m=>Number(m[1])*(/inch|^in$|بوص/u.test(m[2])?2.54:1));
    if(!values.length || [...fragment.matchAll(/-?\d+(?:\.\d+)?/g)].length!==values.length) unclear.add(field);
    (candidates[field] ||= []).push(...values);
  });
  for(const [field,values] of Object.entries(candidates)) {
    if(values.length && !unclear.has(field)) set(field,values,'cm');
    else { session.issues=session.issues.filter(i=>i.field!==field); session.issues.push({field,code:'measurementUnclear',values:[]}); }
  }
  session.language=language==='ar'?'ar':'en';
  session.turns.push({id:crypto.randomUUID(),role:'assistant',language:session.language,fields:copy(session.fields),issues:copy(session.issues)});
  return session;
}

export function prepareBriefDraft(session, defaults) {
  validateSession(session);
  const issues=copy(session.issues);
  for(const [field,choices] of Object.entries(tokens)) if(session.fields[field] && !Object.hasOwn(choices,session.fields[field].value)) issues.push({field,code:'unsupported'});
  for(const field of ['family','length','fabric']) if(!session.fields[field]) issues.push({field,code:'missing'});
  if(session.fields.fabric?.value==='stretch') issues.push({field:'fabric',code:'unsupported'});
  const measurements={...defaults};
  const provenance={};
  for(const field of ['waist','hips','chest']) {
    const supplied=session.fields[field];
    if(supplied) measurements[field]=supplied.value;
    provenance[field]=supplied ? copy(supplied) : {value:measurements[field],unit:'cm',source:'current-size'};
  }
  const required=session.fields.family?.value==='dress'?['waist','hips','chest']:['waist','hips'];
  for(const field of required) if(!Number.isFinite(measurements[field]) || measurements[field]<=0) issues.push({field,code:'invalid'});
  if(issues.length) return {decision:issues.some(i=>i.code==='invalid'||i.code==='unsupported')?'abstain':'clarify',issues};
  const {family,length,fabric}=session.fields;
  const prompt=`${length.value==='regular'?'regular-length':length.value} ${fabric.value} ${family.value}`;
  return {decision:'propose',prompt,measurements,provenance,issues:[]};
}

export function briefMatchesStyle(session, style) {
  return !!style && style.type===session.fields.family?.value &&
    style.lengthF===({short:0.7,regular:1,long:1.35}[session.fields.length?.value]);
}
