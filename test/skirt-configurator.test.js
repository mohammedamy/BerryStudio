import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWovenALineSkirtConfiguration,
  validateWovenALineSkirtConfiguration,
  configurationToWovenALineSkirtProgram,
  diffWovenALineSkirtConfiguration,
  summarizeWovenALineSkirtConfiguration,
} from '../js/skirt-configurator.js';
import { executePatternProgram } from '../js/pattern-program.js';

test('the first configurator family has deterministic supported defaults and a program', () => {
  const config = createWovenALineSkirtConfiguration({ length: 'long', measurementProfileId: 'mp-client-1' });
  assert.equal(validateWovenALineSkirtConfiguration(config), true);
  assert.match(summarizeWovenALineSkirtConfiguration(config), /long A-line skirt/);
  assert.match(summarizeWovenALineSkirtConfiguration(config, 'ar'), /قصة A/);
  const output = executePatternProgram(configurationToWovenALineSkirtProgram(config), { waist: 72, hips: 98 });
  assert.equal(output.pieces.length, 3);
});

test('configuration diffs are deterministic and include only changed supported fields', () => {
  const base=createWovenALineSkirtConfiguration();
  const changed=createWovenALineSkirtConfiguration({length:'long'});
  assert.deepEqual(diffWovenALineSkirtConfiguration(base,changed),[{field:'length',before:'regular',after:'long'}]);
  assert.deepEqual(diffWovenALineSkirtConfiguration(base,base),[]);
});

test('unsupported garment choices never reach the drafting program', () => {
  assert.throws(() => createWovenALineSkirtConfiguration({ length: 'midi' }), /skirtConfigurationInvalid/);
  assert.throws(() => createWovenALineSkirtConfiguration({ closure: 'zip' }), /skirtConfigurationInvalid/);
  assert.throws(() => validateWovenALineSkirtConfiguration({ version: 1, family: 'woven-a-line-skirt', length: 'regular' }), /skirtConfigurationInvalid/);
});
