/* P7-03: versioned, bounded configuration for the first made-to-measure family.
   This is deliberately a contract, not a prompt parser: only known selections
   can reach the deterministic drafting program. */
import { createWovenALineSkirtProgram } from './pattern-program.js';

export const WOVEN_A_LINE_SKIRT_CONFIG_VERSION = 1;
export const WOVEN_A_LINE_SKIRT_OPTIONS = Object.freeze({
  silhouette: Object.freeze(['a-line']),
  length: Object.freeze(['short', 'regular', 'long']),
  waistband: Object.freeze(['standard']),
  closure: Object.freeze(['none']),
  fabric: Object.freeze(['woven']),
  seamAllowanceCm: Object.freeze([1]),
});

const fail = code => { throw new Error(code); };
const has = (key, value) => WOVEN_A_LINE_SKIRT_OPTIONS[key].includes(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80;
const copy = value => JSON.parse(JSON.stringify(value));

export function createWovenALineSkirtConfiguration(input = {}) {
  const result = {
    version: WOVEN_A_LINE_SKIRT_CONFIG_VERSION,
    family: 'woven-a-line-skirt',
    silhouette: input.silhouette ?? 'a-line',
    length: input.length ?? 'regular',
    waistband: input.waistband ?? 'standard',
    closure: input.closure ?? 'none',
    fabric: input.fabric ?? 'woven',
    seamAllowanceCm: input.seamAllowanceCm ?? 1,
    measurementProfileId: input.measurementProfileId ?? null,
  };
  validateWovenALineSkirtConfiguration(result);
  return Object.freeze(result);
}

export function validateWovenALineSkirtConfiguration(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('skirtConfigurationInvalid');
  const keys = ['version', 'family', 'silhouette', 'length', 'waistband', 'closure', 'fabric', 'seamAllowanceCm', 'measurementProfileId'];
  if (Object.keys(config).some(key => !keys.includes(key)) || config.version !== WOVEN_A_LINE_SKIRT_CONFIG_VERSION || config.family !== 'woven-a-line-skirt') fail('skirtConfigurationInvalid');
  for (const key of ['silhouette', 'length', 'waistband', 'closure', 'fabric', 'seamAllowanceCm']) if (!has(key, config[key])) fail('skirtConfigurationInvalid');
  if (config.measurementProfileId !== null && !text(config.measurementProfileId)) fail('skirtConfigurationInvalid');
  return true;
}

export function configurationToWovenALineSkirtProgram(config) {
  validateWovenALineSkirtConfiguration(config);
  return createWovenALineSkirtProgram(config.length);
}

export function summarizeWovenALineSkirtConfiguration(config, language = 'en') {
  validateWovenALineSkirtConfiguration(config);
  const labels = language === 'ar'
    ? { 'a-line': 'قصة A', short: 'قصير', regular: 'متوسط', long: 'طويل', standard: 'قياسي', none: 'بدون إغلاق', woven: 'منسوج' }
    : { 'a-line': 'A-line', short: 'short', regular: 'regular', long: 'long', standard: 'standard waistband', none: 'no closure', woven: 'woven' };
  return language === 'ar'
    ? `${labels[config.silhouette]}، ${labels[config.length]}، ${labels[config.waistband]}، ${labels[config.fabric]}، سماحية ${config.seamAllowanceCm} سم`
    : `${labels[config.length]} ${labels[config.silhouette]} skirt, ${labels[config.waistband]}, ${labels[config.fabric]}, ${config.seamAllowanceCm} cm seam allowance`;
}

// A review record is deliberately data, not UI text, so the same controlled
// selection can be rendered in either language and stored beside a revision.
export function diffWovenALineSkirtConfiguration(before, after) {
  validateWovenALineSkirtConfiguration(before); validateWovenALineSkirtConfiguration(after);
  return ['silhouette', 'length', 'waistband', 'closure', 'fabric', 'seamAllowanceCm']
    .filter(field => before[field] !== after[field])
    .map(field => ({ field, before: before[field], after: after[field] }));
}

export function serializeWovenALineSkirtConfiguration(config) {
  validateWovenALineSkirtConfiguration(config);
  return copy(config);
}
