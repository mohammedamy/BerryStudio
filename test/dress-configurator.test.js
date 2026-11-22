import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWovenBasicDressConfiguration,
  configurationToWovenBasicDressProgram,
  diffWovenBasicDressConfiguration,
  serializeWovenBasicDressConfiguration,
  validateWovenBasicDressConfiguration,
} from '../js/dress-configurator.js';
import { executePatternProgram } from '../js/pattern-program.js';
import { MANNEQUIN_CATALOG } from '../js/mannequin-catalog.js';
import { run as runValidator } from '../js/validate.js';
import { offsetPoly } from '../js/geometry.js';
import { assessWovenDressConstruction } from '../js/construction-acceptance.js';

test('basic woven dress configuration is bounded and generates deterministic joined families',()=>{
  const config=createWovenBasicDressConfiguration({length:'long'});
  assert.equal(validateWovenBasicDressConfiguration(config),true);
  const output=executePatternProgram(configurationToWovenBasicDressProgram(config),{chest:92,waist:74,hips:100});
  assert.deepEqual(output.pieces.map(piece=>piece.role),['bodice-front','bodice-back','skirt-front','skirt-back']);
});

test('unimplemented dress construction choices are rejected',()=>{
  assert.throws(()=>createWovenBasicDressConfiguration({neckline:'v-neck'}),/dressConfigurationInvalid/);
  assert.throws(()=>createWovenBasicDressConfiguration({closure:'zip'}),/dressConfigurationInvalid/);
});


test('dress configuration diff and serialization track changed fields cleanly', () => {
  const base = createWovenBasicDressConfiguration();
  const changed = createWovenBasicDressConfiguration({ length: 'long' });
  assert.deepEqual(diffWovenBasicDressConfiguration(base, changed), [{ field: 'length', before: 'regular', after: 'long' }]);
  assert.deepEqual(diffWovenBasicDressConfiguration(base, base), []);
  assert.equal(serializeWovenBasicDressConfiguration(changed).length, 'long');
});

test('basic woven dress program passes 2D validation and dual-seam parity across all 44 mannequins x 3 lengths (132 blocks)', () => {
  assert.equal(MANNEQUIN_CATALOG.length, 44);
  for (const mq of MANNEQUIN_CATALOG) {
    for (const length of ['short', 'regular', 'long']) {
      const config = createWovenBasicDressConfiguration({ length, measurementProfileId: mq.id });
      const output = executePatternProgram(configurationToWovenBasicDressProgram(config), mq.measurements);
      const report = runValidator(output.pieces, { seamAllowanceCm: 1, offsetPoly });
      assert.equal(report.summary.fail, 0, `${mq.id} (${length}) fail: ${JSON.stringify(report)}`);
      assert.equal(report.summary.warn, 0, `${mq.id} (${length}) warn: ${JSON.stringify(report)}`);
      const acceptance = assessWovenDressConstruction(output.pieces);
      assert.equal(acceptance.decision, 'dress-seams-checked');
      assert.equal(acceptance.checks.length, 2);
      for (const check of acceptance.checks) {
        assert.ok(check.differenceMm <= 1e-6, `${mq.id} (${length}) ${check.seamId}: ${check.differenceMm}`);
      }
    }
  }
});
