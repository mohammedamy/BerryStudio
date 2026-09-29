import { createWovenBasicBodiceProgram } from './pattern-program.js';

export const WOVEN_BASIC_BODICE_CONFIG_VERSION=1;
export const WOVEN_BASIC_BODICE_OPTIONS=Object.freeze({silhouette:Object.freeze(['basic']),easeCm:Object.freeze([4]),neckline:Object.freeze(['round']),sleeve:Object.freeze(['sleeveless']),closure:Object.freeze(['none']),fabric:Object.freeze(['woven']),seamAllowanceCm:Object.freeze([1])});
const fail=code=>{throw new Error(code);};
const has=(key,value)=>WOVEN_BASIC_BODICE_OPTIONS[key].includes(value);
const text=value=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=80;
const copy=value=>JSON.parse(JSON.stringify(value));

export function createWovenBasicBodiceConfiguration(input={}) {
  const result={version:WOVEN_BASIC_BODICE_CONFIG_VERSION,family:'woven-basic-bodice',silhouette:input.silhouette??'basic',easeCm:input.easeCm??4,neckline:input.neckline??'round',sleeve:input.sleeve??'sleeveless',closure:input.closure??'none',fabric:input.fabric??'woven',seamAllowanceCm:input.seamAllowanceCm??1,measurementProfileId:input.measurementProfileId??null};
  validateWovenBasicBodiceConfiguration(result); return Object.freeze(result);
}
export function validateWovenBasicBodiceConfiguration(config) {
  const keys=['version','family','silhouette','easeCm','neckline','sleeve','closure','fabric','seamAllowanceCm','measurementProfileId'];
  if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(key=>!keys.includes(key))||config.version!==WOVEN_BASIC_BODICE_CONFIG_VERSION||config.family!=='woven-basic-bodice') fail('bodiceConfigurationInvalid');
  for(const key of ['silhouette','easeCm','neckline','sleeve','closure','fabric','seamAllowanceCm']) if(!has(key,config[key])) fail('bodiceConfigurationInvalid');
  if(config.measurementProfileId!==null&&!text(config.measurementProfileId)) fail('bodiceConfigurationInvalid'); return true;
}
export function configurationToWovenBasicBodiceProgram(config) { validateWovenBasicBodiceConfiguration(config); return createWovenBasicBodiceProgram(); }
export function summarizeWovenBasicBodiceConfiguration(config,language='en') { validateWovenBasicBodiceConfiguration(config); return language==='ar'?`صدّار منسوج أساسي، بدون أكمام، رقبة مستديرة، سماحية ${config.seamAllowanceCm} سم`:`basic woven bodice, sleeveless, round neckline, ${config.seamAllowanceCm} cm seam allowance`; }
export function serializeWovenBasicBodiceConfiguration(config) { validateWovenBasicBodiceConfiguration(config); return copy(config); }
