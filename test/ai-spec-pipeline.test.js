import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateFromSpec, specToStyle, buildSystemPrompt } from '../js/ai-spec-pipeline.js';

const schema = JSON.parse(readFileSync(new URL('../schema/pattern-spec.v1.json', import.meta.url)));
const validSpec = JSON.parse(readFileSync(new URL('../schema/examples/valid.pattern-spec.json', import.meta.url)));
const invalidSpec = JSON.parse(readFileSync(new URL('../schema/examples/invalid.pattern-spec.json', import.meta.url)));
const romperSpec = JSON.parse(readFileSync(new URL('../schema/examples/romper.pattern-spec.json', import.meta.url)));
const measurements = { chest: 92, waist: 74, hips: 100, backLen: 40, sleeve: 58, bicep: 28, height: 165, neck: 36, inseam: 76, thigh: 56, shoulder: 40 };

function mockAdapter(responses) {
  let call = 0;
  return { complete: async () => responses[Math.min(call++, responses.length - 1)] };
}

test('buildSystemPrompt embeds the schema vocabulary and all three few-shot examples', () => {
  const p = buildSystemPrompt('women', 'en');
  assert.match(p, /garment\.type: dress \| top \| shirt \| skirt \| trousers \| robe \| romper/);
  assert.match(p, /construction\.neckline: v \| round \| boat \| off-shoulder \| halter \| collar \| mock/);
  assert.match(p, /Example 1 prompt/);
  assert.match(p, /Example 2 prompt/);
  assert.match(p, /Example 3 prompt/);
});

test('specToStyle maps a zip closure', () => {
  const style = specToStyle({ garment: { type: 'romper', closure: 'zip' }, construction: { neckline: 'mock' } });
  assert.equal(style.zip, true);
  assert.equal(style.wrap, false);
  assert.equal(style.neckline, 'mock');
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

test('a valid romper spec (mock neck, zip, attached shorts) produces real vector pieces via AIGen — not an image', async () => {
  const adapter = mockAdapter([{ ok: true, providerId: 'test', json: romperSpec, usage: {} }]);
  const result = await generateFromSpec({ adapter, cfg: {}, prompt: 'mock neck sleeveless zip romper', measurements, category: 'women', lang: 'en', schema });
  assert.equal(result.fellBack, undefined);
  assert.equal(result.source, 'spec');
  assert.equal(result.style.type, 'romper');
  assert.equal(result.style.zip, true);
  assert.equal(result.style.neckline, 'mock');
  // bodice front/back + shorts front/back + armhole binding + collar stand + zip facing
  assert.ok(result.pieces.length >= 7, `expected at least 7 pieces, got ${result.pieces.length}`);
  for (const p of result.pieces) {
    assert.ok(Array.isArray(p.outline) && p.outline.length >= 3);
    for (const pt of p.outline) assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
  }
});

test('the proxy adapter\'s legacy {style} contract also short-circuits and builds via AIGen', async () => {
  const adapter = mockAdapter([{ ok: true, providerId: 'proxy', json: { legacy: 'style', style: { type: 'dress' } }, usage: {} }]);
  const result = await generateFromSpec({ adapter, cfg: {}, prompt: 'a dress', measurements, category: 'women', lang: 'en', schema });
  assert.equal(result.fellBack, undefined);
  assert.equal(result.source, 'remote');
  assert.ok(result.pieces.length > 0);
});
