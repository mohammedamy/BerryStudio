import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIProviders, getProvider } from '../js/ai-providers.js';

function mockFetch(handler) {
  return async (url, options) => handler(url, options);
}
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test('getProvider returns null for an unknown id', () => {
  assert.equal(getProvider('made-up'), null);
});

test('all 9 adapters implement the full interface', () => {
  for (const [id, adapter] of Object.entries(AIProviders)) {
    assert.equal(adapter.id, id);
    assert.equal(typeof adapter.label, 'string');
    assert.equal(typeof adapter.models, 'function');
    assert.equal(typeof adapter.test, 'function');
    assert.equal(typeof adapter.complete, 'function');
    assert.ok(Array.isArray(adapter.fields));
  }
});

test('anthropic.complete: forced tool-use JSON is read directly from the tool_use block', async () => {
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
  const fetchImpl = mockFetch((url, options) => {
    assert.match(url, /\/v1\/messages$/);
    const body = JSON.parse(options.body);
    assert.equal(body.tool_choice.name, 'emit_pattern_spec');
    assert.equal(options.headers['x-api-key'], 'sk-test');
    return jsonResponse(200, {
      content: [{ type: 'tool_use', name: 'emit_pattern_spec', input: { ok: true } }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  });
  const r = await AIProviders.anthropic.complete(
    { apiKey: 'sk-test' },
    { system: 'sys', messages: [{ role: 'user', content: 'hi' }], schema },
    { fetchImpl },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(r.usage.inputTokens, 10);
});

test('anthropic.complete: surfaces the real error text on failure', async () => {
  const fetchImpl = mockFetch(() => jsonResponse(401, { error: { message: 'invalid x-api-key' } }));
  const r = await AIProviders.anthropic.complete({ apiKey: 'bad' }, { messages: [{ role: 'user', content: 'hi' }] }, { fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.error, /invalid x-api-key/);
});

test('openai.complete: parses response_format json_schema content as JSON', async () => {
  const schema = { type: 'object' };
  const fetchImpl = mockFetch((url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.response_format.type, 'json_schema');
    return jsonResponse(200, { choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
  });
  const r = await AIProviders.openai.complete({ apiKey: 'k', model: 'gpt-test' }, { system: 'sys', messages: [{ role: 'user', content: 'hi' }], schema }, { fetchImpl });
  assert.equal(r.ok, true);
  assert.deepEqual(r.json, { a: 1 });
});

test('openai-compatible: falls back from json_schema to json_object on a 4xx', async () => {
  let calls = 0;
  const fetchImpl = mockFetch((url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    if (calls === 1) { assert.equal(body.response_format.type, 'json_schema'); return jsonResponse(400, { error: 'unsupported param' }); }
    assert.equal(body.response_format.type, 'json_object');
    return jsonResponse(200, { choices: [{ message: { content: '{"b":2}' } }] });
  });
  const r = await AIProviders['openai-compatible'].complete(
    { baseUrl: 'https://example.test/v1', apiKey: 'k' },
    { messages: [{ role: 'user', content: 'hi' }], schema: { type: 'object' } },
    { fetchImpl },
  );
  assert.equal(calls, 2);
  assert.equal(r.ok, true);
  assert.deepEqual(r.json, { b: 2 });
});

test('gemini.complete: strips $schema/$id/additionalProperties before sending responseSchema', async () => {
  const schema = { $schema: 'draft-07', $id: 'x', type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } };
  const fetchImpl = mockFetch((url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseSchema.$schema, undefined);
    assert.equal(body.generationConfig.responseSchema.additionalProperties, undefined);
    return jsonResponse(200, { candidates: [{ content: { parts: [{ text: '{"a":"x"}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } });
  });
  const r = await AIProviders.gemini.complete({ apiKey: 'k' }, { messages: [{ role: 'user', content: 'hi' }], schema }, { fetchImpl });
  assert.equal(r.ok, true);
  assert.deepEqual(r.json, { a: 'x' });
});

test('ollama.models: classifies vision-capable models by name, honestly (no synthesized entries)', async () => {
  const fetchImpl = mockFetch(() => jsonResponse(200, { models: [{ name: 'llama3.1:8b' }, { name: 'llava:13b' }] }));
  const r = await AIProviders.ollama.models({}, { fetchImpl });
  assert.deepEqual(r.text, ['llama3.1:8b', 'llava:13b']);
  assert.deepEqual(r.vision, ['llava:13b']);
});

test('ollama.complete: sends raw base64 (no data-URL prefix) on the images field', async () => {
  const fetchImpl = mockFetch((url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.messages[body.messages.length - 1].images[0], 'QUJD');
    return jsonResponse(200, { message: { content: '{}' } });
  });
  const r = await AIProviders.ollama.complete({}, { messages: [{ role: 'user', content: 'hi' }], images: ['data:image/png;base64,QUJD'], schema: {} }, { fetchImpl });
  assert.equal(r.ok, true);
});

test('proxy.complete: preserves the legacy {pieces} contract and marks it for the pipeline to skip schema validation', async () => {
  const fetchImpl = mockFetch(() => jsonResponse(200, { pieces: [{ name: { en: 'Front' } }], summary: 'a dress' }));
  const r = await AIProviders.proxy.complete({ baseUrl: 'https://example.test/generate' }, { messages: [{ role: 'user', content: 'a dress' }] }, { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.json.legacy, 'pieces');
  assert.equal(r.json.pieces.length, 1);
});

test('proxy.complete: fails cleanly with no endpoint configured', async () => {
  const r = await AIProviders.proxy.complete({}, { messages: [] }, { fetchImpl: mockFetch(() => jsonResponse(200, {})) });
  assert.equal(r.ok, false);
  assert.match(r.error, /no endpoint configured/);
});
