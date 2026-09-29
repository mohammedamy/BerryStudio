import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWovenBasicBodiceConfiguration,
  validateWovenBasicBodiceConfiguration,
  configurationToWovenBasicBodiceProgram,
  summarizeWovenBasicBodiceConfiguration,
} from '../js/bodice-configurator.js';
import { executePatternProgram } from '../js/pattern-program.js';

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
