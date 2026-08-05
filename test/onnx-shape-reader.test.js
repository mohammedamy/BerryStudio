import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readOnnxGraphIO, ONNX_ELEM_TYPES } from '../js/workers/onnx-shape-reader.js';

// e2e/fixtures/tiny-classifier.onnx is a real, valid ONNX graph
// (GlobalAveragePool -> Flatten -> MatMul -> Softmax) authored for
// e2e/smoke.spec.js's real end-to-end Route B test — input (1,3,8,8),
// output (1,4), both float32, all dims static. Reused here so this
// reader is tested against a real .onnx file, not a hand-crafted byte
// string that could accidentally match this reader's own bugs.
const FIXTURE = readFileSync(new URL('../e2e/fixtures/tiny-classifier.onnx', import.meta.url));

test('readOnnxGraphIO reads the real declared input shape/dtype from a real .onnx file', () => {
  const { inputs, outputs } = readOnnxGraphIO(FIXTURE);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].name, 'input');
  assert.equal(inputs[0].elemType, 1); // FLOAT
  assert.deepEqual(inputs[0].shape.map((d) => d.value), [1, 3, 8, 8]);
  assert.ok(inputs[0].shape.every((d) => d.param === null));

  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].name, 'output');
  assert.deepEqual(outputs[0].shape.map((d) => d.value), [1, 4]);
});

test('readOnnxGraphIO returns empty arrays for bytes with no graph field, not a throw', () => {
  const result = readOnnxGraphIO(new Uint8Array([0x08, 0x07])); // a single unrelated varint field, no graph
  assert.deepEqual(result, { inputs: [], outputs: [] });
});

test('ONNX_ELEM_TYPES covers FLOAT (1) — the type this fixture and most vision models use', () => {
  assert.equal(ONNX_ELEM_TYPES[1].ortType, 'float32');
  assert.equal(ONNX_ELEM_TYPES[1].TypedArray, Float32Array);
});

test('ONNX_ELEM_TYPES deliberately omits exotic types this reader does not synthesize', () => {
  assert.equal(ONNX_ELEM_TYPES[8], undefined); // STRING
  assert.equal(ONNX_ELEM_TYPES[14], undefined); // COMPLEX64
});
