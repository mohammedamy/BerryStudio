// Code-review fix (WP-49 follow-up): js/body-zone.js's UPPER_ROLES/
// LOWER_ROLES/LEGACY_ROLE_ALIASES are a hand-kept-in-sync duplicate of
// cloth-lab/src/pattern/roles.js's SCHEMA_ROLE_INFO `zone` field — the
// exact class of drift risk this WP exists to eliminate (two independent
// classifiers silently disagreeing), just one layer up from piece names.
// Both files are plain, dependency-free ESM, so a root node --test can
// import both directly and assert they actually agree, instead of that
// only being a comment's promise. Run this alongside test/body-zone.test.js
// and cloth-lab/src/pattern/roles.test.js — together they cover: each
// module's own logic in isolation, PLUS this file's cross-module agreement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inferBodyZone } from '../js/body-zone.js';
import { SCHEMA_ROLE_INFO, zoneForRole } from '../cloth-lab/src/pattern/roles.js';

test('every role in cloth-lab/src/pattern/roles.js resolves to the SAME zone in js/body-zone.js', () => {
  for (const role of Object.keys(SCHEMA_ROLE_INFO)) {
    const clothLabZone = zoneForRole(role); // 'upper' | 'lower' | null
    const rootAppZone = inferBodyZone({ role }); // same
    assert.equal(rootAppZone, clothLabZone, `role "${role}": cloth-lab says ${clothLabZone}, js/body-zone.js says ${rootAppZone}`);
  }
});

test('every LEGACY_ROLE_ALIASES entry resolves the same way in both modules', () => {
  // roles.js doesn't export its alias table directly, but zoneForRole()
  // already resolves through it — probing the known legacy names (the
  // same ones js/body-zone.js's own LEGACY_ROLE_ALIASES declares) is
  // enough to catch either side's alias table drifting from the other.
  for (const legacyRole of ['bodice-front', 'bodice-back', 'skirt-front', 'skirt-back']) {
    assert.equal(inferBodyZone({ role: legacyRole }), zoneForRole(legacyRole), legacyRole);
  }
});
