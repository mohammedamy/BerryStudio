/* Plan 7 P7-03: versioned, bounded configuration for the woven trousers family.
   Mirrors skirt/bodice/dress configurators so only reviewed, validated selections
   can invoke createWovenBasicTrousersProgram(). */
import { createWovenBasicTrousersProgram } from './pattern-program.js';

export const WOVEN_BASIC_TROUSERS_CONFIG_VERSION = 1;
export const WOVEN_BASIC_TROUSERS_OPTIONS = Object.freeze({
  silhouette: Object.freeze(['straight']),
  length: Object.freeze(['short', 'regular', 'long']),
  waistband: Object.freeze(['standard']),
  closure: Object.freeze(['none']),
  fabric: Object.freeze(['woven']),
  seamAllowanceCm: Object.freeze([1]),
});

const fail = code => { throw new Error(code); };
const has = (key, value) => WOVEN_BASIC_TROUSERS_OPTIONS[key].includes(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80;
const copy = value => JSON.parse(JSON.stringify(value));

export function createWovenBasicTrousersConfiguration(input = {}) {
  const result = {
    version: WOVEN_BASIC_TROUSERS_CONFIG_VERSION,
    family: 'woven-basic-trousers',
    silhouette: input.silhouette ?? 'straight',
    length: input.length ?? 'regular',
    waistband: input.waistband ?? 'standard',
    closure: input.closure ?? 'none',
    fabric: input.fabric ?? 'woven',
    seamAllowanceCm: input.seamAllowanceCm ?? 1,
    measurementProfileId: input.measurementProfileId ?? null,
  };
  validateWovenBasicTrousersConfiguration(result);
  return Object.freeze(result);
}

export function validateWovenBasicTrousersConfiguration(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('trouserConfigurationInvalid');
  const keys = ['version', 'family', 'silhouette', 'length', 'waistband', 'closure', 'fabric', 'seamAllowanceCm', 'measurementProfileId'];
  if (Object.keys(config).some(key => !keys.includes(key)) || config.version !== WOVEN_BASIC_TROUSERS_CONFIG_VERSION || config.family !== 'woven-basic-trousers') fail('trouserConfigurationInvalid');
  for (const key of ['silhouette', 'length', 'waistband', 'closure', 'fabric', 'seamAllowanceCm']) if (!has(key, config[key])) fail('trouserConfigurationInvalid');
  if (config.measurementProfileId !== null && !text(config.measurementProfileId)) fail('trouserConfigurationInvalid');
  return true;
}

export function configurationToWovenBasicTrousersProgram(config) {
  validateWovenBasicTrousersConfiguration(config);
  return createWovenBasicTrousersProgram(config.length);
}

export function summarizeWovenBasicTrousersConfiguration(config, language = 'en') {
  validateWovenBasicTrousersConfiguration(config);
  const labels = language === 'ar'
    ? { straight: 'قصة مستقيمة', short: 'قصير', regular: 'عادي', long: 'طويل', standard: 'حزام قياسي', none: 'بدون إغلاق', woven: 'منسوج' }
    : { straight: 'straight', short: 'short', regular: 'regular', long: 'long', standard: 'standard waistband', none: 'no closure', woven: 'woven' };
  return language === 'ar'
    ? `بنطلون ${labels[config.fabric]} ${labels[config.silhouette]}، ${labels[config.length]}، ${labels[config.waistband]}، سماحية ${config.seamAllowanceCm} سم`
    : `${labels[config.length]} ${labels[config.silhouette]} ${labels[config.fabric]} trousers, ${labels[config.waistband]}, ${config.seamAllowanceCm} cm seam allowance`;
}

export function diffWovenBasicTrousersConfiguration(before, after) {
  validateWovenBasicTrousersConfiguration(before);
  validateWovenBasicTrousersConfiguration(after);
  return ['silhouette', 'length', 'waistband', 'closure', 'fabric', 'seamAllowanceCm']
    .filter(field => before[field] !== after[field])
    .map(field => ({ field, before: before[field], after: after[field] }));
}

export function serializeWovenBasicTrousersConfiguration(config) {
  validateWovenBasicTrousersConfiguration(config);
  return copy(config);
}
