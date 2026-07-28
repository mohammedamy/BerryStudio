import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PatternSpecValidator } from '../js/schema-validate.js';

const schema = JSON.parse(readFileSync(new URL('../schema/pattern-spec.v1.json', import.meta.url)));
const validSpec = JSON.parse(readFileSync(new URL('../schema/examples/valid.pattern-spec.json', import.meta.url)));
const invalidSpec = JSON.parse(readFileSync(new URL('../schema/examples/invalid.pattern-spec.json', import.meta.url)));

PatternSpecValidator.init(schema);

test('the valid fixture passes schema validation', () => {
  const result = PatternSpecValidator.validate(validSpec);
  assert.equal(result.valid, true, `unexpected errors: ${JSON.stringify(result.errors)}`);
  assert.equal(result.errors.length, 0);
});

test('the invalid fixture is rejected with errors', () => {
  const result = PatternSpecValidator.validate(invalidSpec);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('a spec missing required top-level fields is rejected', () => {
  const result = PatternSpecValidator.validate({ specVersion: '1' });
  assert.equal(result.valid, false);
});

test('an unrecognized piece role is rejected (closed enum, not a free slug)', () => {
  const spec = JSON.parse(JSON.stringify(validSpec));
  spec.pieces[0].role = 'made-up-role';
  const result = PatternSpecValidator.validate(spec);
  assert.equal(result.valid, false);
});

test('a stray unknown property is rejected (additionalProperties: false)', () => {
  const spec = JSON.parse(JSON.stringify(validSpec));
  spec.notARealField = true;
  const result = PatternSpecValidator.validate(spec);
  assert.equal(result.valid, false);
});
