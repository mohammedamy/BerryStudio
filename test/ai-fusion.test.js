import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuseStyle, mergeProvenance } from '../js/ai-fusion.js';

const promptStyle = { type: 'top', lengthF: 1.1, flareF: 1.3, fitF: 1.0, sleeveLenF: 1.0, sleeveWideF: 1.0, neckline: 'round', hemShape: 'curved', wrap: false, color: 'rgb(10,20,30)', twoTone: false, colorHem: null };

test('with no spec style, fusion is a pure passthrough of the prompt/pixel style', () => {
  const { style, sourceMap } = fuseStyle({ specStyle: null, promptStyle });
  assert.deepEqual(style, promptStyle);
  assert.deepEqual(sourceMap, {});
});

test('vision-authoritative fields (type, neckline, wrap) are taken from the spec style', () => {
  const specStyle = { type: 'dress', neckline: 'v', wrap: true, sleeveLenF: 1 };
  const { style, sourceMap } = fuseStyle({ specStyle, promptStyle });
  assert.equal(style.type, 'dress');
  assert.equal(style.neckline, 'v');
  assert.equal(style.wrap, true);
  assert.equal(sourceMap.type.source, 'vision');
  assert.equal(sourceMap.neckline.source, 'vision');
  assert.equal(sourceMap.closure.source, 'vision');
});

test('pixel-authoritative fields (length/flare/hem/color) are NEVER overridden by the spec', () => {
  const specStyle = { type: 'dress', lengthF: 0.1, flareF: 3.0 };
  const { style, sourceMap } = fuseStyle({ specStyle, promptStyle });
  assert.equal(style.lengthF, promptStyle.lengthF, 'lengthF must stay the pixel/prompt-derived value, not the spec\'s guess');
  assert.equal(style.flareF, promptStyle.flareF);
  assert.equal(sourceMap.length.source, 'pixel');
  assert.equal(sourceMap.length.confidence, null, 'pixel analysis has no real confidence score — must not be fabricated');
});

test('sleeve presence: spec saying "sleeveless" overrides a non-zero pixel/prompt read', () => {
  const specStyle = { type: 'top', sleeveLenF: 0 };
  const { style, sourceMap } = fuseStyle({ specStyle, promptStyle: { ...promptStyle, sleeveLenF: 1.2 } });
  assert.equal(style.sleeveLenF, 0);
  assert.equal(sourceMap.sleeve.source, 'vision');
});

test('sleeve presence: spec agreeing there IS a sleeve leaves the pixel/prompt magnitude untouched', () => {
  const specStyle = { type: 'top', sleeveLenF: 1 };
  const { style, sourceMap } = fuseStyle({ specStyle, promptStyle: { ...promptStyle, sleeveLenF: 1.2 } });
  assert.equal(style.sleeveLenF, 1.2);
  assert.equal(sourceMap.sleeve, undefined);
});

test('mergeProvenance: fusion-level tags win over the spec\'s own dotted-path provenance for the same chip', () => {
  const merged = mergeProvenance({ type: { source: 'vision' } }, { type: { source: 'spec', confidence: 0.4 }, hem: { source: 'spec' } });
  assert.equal(merged.type.source, 'vision');
  assert.equal(merged.hem.source, 'spec', 'fields the fusion step did not touch keep the spec\'s own provenance');
});
