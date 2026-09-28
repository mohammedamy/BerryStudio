import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendStudioConcept, emptyImageStudio, setStudioSource } from '../js/image-studio.js';

const corpus = JSON.parse(readFileSync(new URL('../evaluation/p7-08/corpus.json', import.meta.url)));
const image = value => `data:image/png;base64,${btoa(value)}`;

test('P7-08 local image-studio benchmark preserves declared concept and reference boundaries', () => {
  assert.equal(corpus.id, 'p7-08-local-image-studio-foundation.v1');
  assert.equal(corpus.cases.length, 3);
  const text = appendStudioConcept(emptyImageStudio(), { prompt: 'woven skirt concept', providerId: 'local-image', image: image('text'), mode: 'text-to-image' });
  assert.deepEqual(text.concepts[0].referenceIds, []);
  const source = setStudioSource(emptyImageStudio(), image('source'), true);
  const variation = appendStudioConcept(source, { prompt: 'keep the silhouette', providerId: 'proxy', image: image('variation'), mode: 'image-to-image' });
  assert.deepEqual(variation.concepts[0].referenceIds, [source.source.id]);
  const before = structuredClone(variation);
  assert.throws(() => appendStudioConcept(variation, { prompt: 'retry', providerId: 'proxy', image: 'invalid', mode: 'image-to-image' }), /imageStudioInvalid/);
  assert.deepEqual(variation, before);
});
