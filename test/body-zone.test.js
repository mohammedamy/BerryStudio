import test from 'node:test';
import assert from 'node:assert/strict';
import { inferBodyZone, ZONE_UPPER, ZONE_LOWER } from '../js/body-zone.js';

test('explicit bodyZone always wins, even over a contradicting role', () => {
  assert.equal(inferBodyZone({ bodyZone: 'lower', role: 'front-panel' }), ZONE_LOWER);
  assert.equal(inferBodyZone({ bodyZone: 'upper', role: 'hip-panel-front' }), ZONE_UPPER);
});

test('an invalid/garbage bodyZone value is ignored, falls through to role', () => {
  assert.equal(inferBodyZone({ bodyZone: 'sideways', role: 'sleeve' }), ZONE_UPPER);
});

test('panel-shaped upper roles resolve to upper with no explicit bodyZone', () => {
  for (const role of ['front-panel', 'back-panel', 'bodice-front-center', 'bodice-back-side', 'sleeve', 'cap-sleeve', 'puff-sleeve', 'butterfly-sleeve']) {
    assert.equal(inferBodyZone({ role }), ZONE_UPPER, role);
  }
});

test('panel-shaped lower roles resolve to lower with no explicit bodyZone', () => {
  for (const role of ['hip-panel-front', 'hip-panel-back', 'skirt-front-gore', 'skirt-side-gore-left', 'brief-front', 'brief-back']) {
    assert.equal(inferBodyZone({ role }), ZONE_LOWER, role);
  }
});

test('the confirmed WP-43 bug: a brief piece resolves to lower, not upper', () => {
  assert.equal(inferBodyZone({ role: 'brief-front', name: { en: 'Front Panel' } }), ZONE_LOWER);
  assert.equal(inferBodyZone({ role: 'brief-back', name: { en: 'Back Panel' } }), ZONE_LOWER);
});

test('legacy-aliased roles resolve through the alias table', () => {
  assert.equal(inferBodyZone({ role: 'bodice-front' }), ZONE_UPPER);
  assert.equal(inferBodyZone({ role: 'skirt-back' }), ZONE_LOWER);
});

test('accessory roles (waistband, collar, cuff, pocket, gusset, other) are deliberately unclassified', () => {
  for (const role of ['waistband', 'collar', 'cuff', 'pocket', 'gusset', 'elastic-band', 'cup', 'band', 'strap', 'other']) {
    assert.equal(inferBodyZone({ role }), null, role);
  }
});

test('an unknown role, or no role/bodyZone at all, resolves to null rather than guessing', () => {
  assert.equal(inferBodyZone({ role: 'not-a-real-role' }), null);
  assert.equal(inferBodyZone({}), null);
  assert.equal(inferBodyZone(null), null);
  assert.equal(inferBodyZone(undefined), null);
});
