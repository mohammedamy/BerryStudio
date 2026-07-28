import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { I18N } from '../js/i18n.js';

// Scans for literal T("key") call sites (skips dynamic T("prefix_"+expr)
// concatenations, a small number of which pre-date this check and are
// covered by the app's existing per-feature dictionaries) and asserts every
// key it finds exists in both language dictionaries — a grep-based
// regression guard, not a full static analyzer, per BerryStudio-Upgrade-Plan
// Phase 1's "new strings exist in EN and AR" acceptance criterion.
const FILES = ['js/app.js'];

function literalTKeys(src) {
  const keys = new Set();
  const re = /\bT\(\s*"([A-Za-z0-9_]+)"\s*\)/g;
  let m;
  while ((m = re.exec(src))) keys.add(m[1]);
  return keys;
}

test('every literal T("key") call site in js/app.js exists in both I18N.en and I18N.ar', () => {
  const missing = [];
  for (const file of FILES) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const key of literalTKeys(src)) {
      if (!(key in I18N.en)) missing.push(`${file}: "${key}" missing from I18N.en`);
      if (!(key in I18N.ar)) missing.push(`${file}: "${key}" missing from I18N.ar`);
    }
  }
  assert.equal(missing.length, 0, `Missing i18n keys:\n${missing.join('\n')}`);
});

test('I18N.en and I18N.ar declare exactly the same set of keys (no one-sided translations)', () => {
  const enKeys = new Set(Object.keys(I18N.en));
  const arKeys = new Set(Object.keys(I18N.ar));
  const enOnly = [...enKeys].filter((k) => !arKeys.has(k));
  const arOnly = [...arKeys].filter((k) => !enKeys.has(k));
  assert.deepEqual(enOnly, [], `keys present in EN but missing from AR: ${enOnly.join(', ')}`);
  assert.deepEqual(arOnly, [], `keys present in AR but missing from EN: ${arOnly.join(', ')}`);
});
