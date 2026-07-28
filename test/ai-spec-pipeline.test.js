import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateFromSpec, specToStyle, buildSystemPrompt } from '../js/ai-spec-pipeline.js';

const schema = JSON.parse(readFileSync(new URL('../schema/pattern-spec.v1.json', import.meta.url)));
const validSpec = JSON.parse(readFileSync(new URL('../schema/examples/valid.pattern-spec.json', import.meta.url)));
const invalidSpec = JSON.parse(readFileSync(new URL('../schema/examples/invalid.pattern-spec.json', import.meta.url)));
const measurements = { chest: 92, waist: 74, hips: 100, backLen: 40, sleeve: 58, bicep: 28, height: 165, neck: 36, inseam: 76, thigh: 56, shoulder: 40 };

function mockAdapter(responses) {
  let call = 0;
  return { complete: async () => responses[Math.min(call++, responses.length - 1)] };
}

test('buildSystemPrompt embeds the schema vocabulary and both few-shot examples', () => {
  const p = buildSystemPrompt('women', 'en');
  assert.match(p, /garment\.type: dress \| top \| shirt \| skirt \| trousers \| robe/);
  assert.match(p, /Example 1 prompt/);
  assert.match(p, /Example 2 prompt/);
});

test('specToStyle maps and clamps every *F factor into AIGen\'s safe ranges', () => {
  const style = specToStyle({ garment: { type: 'dress' }, silhouette: { lengthF: 99, flareF: -5 }, construction: { neckline: 'off-shoulder', sleeve: { lengthF: 99, widthF: -5 } } });
  assert.equal(style.lengthF, 1.6);   // clamped to the max
  assert.equal(style.flareF, 0.82);   // clamped to the min
  assert.equal(style.sleeveLenF, 1.5);
  assert.equal(style.sleeveWideF, 0.8);
  assert.equal(style.neckline, 'offshoulder', 'schema\'s "off-shoulder" must map to AIGen\'s internal "offshoulder"');
});

test('happy path: valid spec on the first try produces pieces + provenance-tagged attributes', async () => {
  const adapter = mockAdapter([{ ok: true, providerId: 'test', json: validSpec, usage: {} }]);
  const result = await generateFromSpec({ adapter, cfg: {}, prompt: 'a dress', measurements, category: 'women', lang: 'en', schema });
  assert.equal(result.fellBack, undefined);
  assert.equal(result.source, 'spec');
  assert.ok(Array.isArray(result.pieces) && result.pieces.length > 0);
  assert.ok(result.validation, 'PatternValidator.run() output should be attached');
  const provenanceTagged = result.attributes.some((a) => a.source);
  assert.ok(provenanceTagged, 'at least one attribute should carry a provenance source from the spec');
});

test('retry-once: an invalid first response is retried and a valid second response succeeds', async () => {
  const adapter = mockAdapter([
    { ok: true, providerId: 'test', json: invalidSpec, usage: {} },
    { ok: true, providerId: 'test', json: validSpec, usage: {} },
  ]);
  const result = await generateFromSpec({ adapter, cfg: {}, prompt: 'a dress', measurements, category: 'women', lang: 'en', schema });
  assert.equal(result.fellBack, undefined);
  assert.equal(result.source, 'spec');
});

test('invalid twice: falls back honestly instead of showing broken output', async () => {
  const adapter = mockAdapter([
    { ok: true, providerId: 'test', json: invalidSpec, usage: {} },
    { ok: true, providerId: 'test', json: invalidSpec, usage: {} },
  ]);
  const result = await generateFromSpec({ adapter, cfg: {}, prompt: 'a dress', measurements, category: 'women', lang: 'en', schema });
  assert.equal(result.fellBack, true);
  assert.match(result.fallbackReason, /validation failed twice/);
});

test('a provider-level failure falls back honestly', async () => {
  const adapter = mockAdapter([{ ok: false, providerId: 'test', error: 'invalid x-api-key' }]);
  const result = await generateFromSpec({ adapter, cfg: {}, prompt: 'a dress', measurements, category: 'women', lang: 'en', schema });
  assert.equal(result.fellBack, true);
  assert.equal(result.fallbackReason, 'invalid x-api-key');
});

test('a provider that returns no structured JSON at all falls back honestly (not a crash)', async () => {
  const adapter = mockAdapter([{ ok: true, providerId: 'test', json: null, text: 'sure, here is a dress...', usage: {} }]);
  const result = await generateFromSpec({ adapter, cfg: {}, prompt: 'a dress', measurements, category: 'women', lang: 'en', schema });
  assert.equal(result.fellBack, true);
});

test('the proxy adapter\'s legacy {pieces} contract short-circuits schema validation entirely', async () => {
  const adapter = mockAdapter([{ ok: true, providerId: 'proxy', json: { legacy: 'pieces', pieces: [{ name: { en: 'Front' }, outline: [[0, 0]] }], summary: 'a dress' }, usage: {} }]);
  const result = await generateFromSpec({ adapter, cfg: {}, prompt: 'a dress', measurements, category: 'women', lang: 'en', schema });
  assert.equal(result.fellBack, undefined);
  assert.equal(result.source, 'remote');
  assert.equal(result.pieces.length, 1);
});

test('the proxy adapter\'s legacy {style} contract also short-circuits and builds via AIGen', async () => {
  const adapter = mockAdapter([{ ok: true, providerId: 'proxy', json: { legacy: 'style', style: { type: 'dress' } }, usage: {} }]);
  const result = await generateFromSpec({ adapter, cfg: {}, prompt: 'a dress', measurements, category: 'women', lang: 'en', schema });
  assert.equal(result.fellBack, undefined);
  assert.equal(result.source, 'remote');
  assert.ok(result.pieces.length > 0);
});
