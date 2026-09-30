import test from 'node:test';
import assert from 'node:assert/strict';
import { createWovenBasicDressConfiguration, configurationToWovenBasicDressProgram, validateWovenBasicDressConfiguration } from '../js/dress-configurator.js';
import { executePatternProgram } from '../js/pattern-program.js';

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
