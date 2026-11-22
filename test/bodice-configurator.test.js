import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWovenBasicBodiceConfiguration,
  validateWovenBasicBodiceConfiguration,
  configurationToWovenBasicBodiceProgram,
  summarizeWovenBasicBodiceConfiguration,
  serializeWovenBasicBodiceConfiguration,
} from '../js/bodice-configurator.js';
import { executePatternProgram } from '../js/pattern-program.js';
import { MANNEQUIN_CATALOG } from '../js/mannequin-catalog.js';
import { run as runValidator } from '../js/validate.js';
import { offsetPoly } from '../js/geometry.js';
import { assessWovenBodiceConstruction } from '../js/construction-acceptance.js';

test('basic woven bodice configuration has a bounded, deterministic program', () => {
  const config=createWovenBasicBodiceConfiguration({measurementProfileId:'mp-client-1'});
  assert.equal(validateWovenBasicBodiceConfiguration(config),true);
  assert.match(summarizeWovenBasicBodiceConfiguration(config),/basic woven bodice/);
  assert.match(summarizeWovenBasicBodiceConfiguration(config,'ar'),/صدّار/);
  const output=executePatternProgram(configurationToWovenBasicBodiceProgram(config),{chest:92,waist:74});
  assert.equal(output.pieces.length,2);
  assert.deepEqual(output.pieces.map(piece=>piece.role),['bodice-front','bodice-back']);
});

test('unsupported basic-bodice choices cannot reach drafting', () => {
  assert.throws(()=>createWovenBasicBodiceConfiguration({neckline:'v-neck'}),/bodiceConfigurationInvalid/);
  assert.throws(()=>createWovenBasicBodiceConfiguration({sleeve:'long'}),/bodiceConfigurationInvalid/);
  assert.throws(()=>validateWovenBasicBodiceConfiguration({version:1,family:'woven-basic-bodice'}),/bodiceConfigurationInvalid/);
});


test('basic woven bodice program passes 2D validation and 0.0mm bodice-side parity across all 44 mannequins', () => {
  assert.equal(MANNEQUIN_CATALOG.length, 44);
  for (const mq of MANNEQUIN_CATALOG) {
    const config = createWovenBasicBodiceConfiguration({ measurementProfileId: mq.id });
    const serialized = serializeWovenBasicBodiceConfiguration(config);
    assert.equal(serialized.family, 'woven-basic-bodice');
    const output = executePatternProgram(configurationToWovenBasicBodiceProgram(config), mq.measurements);
    const report = runValidator(output.pieces, { seamAllowanceCm: 1, offsetPoly });
    assert.equal(report.summary.fail, 0, `${mq.id} fail: ${JSON.stringify(report)}`);
    assert.equal(report.summary.warn, 0, `${mq.id} warn: ${JSON.stringify(report)}`);
    const acceptance = assessWovenBodiceConstruction(output.pieces);
    assert.equal(acceptance.decision, 'bodice-seams-checked');
    assert.ok(acceptance.checks[0].differenceMm <= 1e-6);
  }
});
