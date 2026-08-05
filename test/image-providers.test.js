import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImageProviders, getImageProvider } from '../js/image-providers.js';

function mockFetch(handler) { return async (url, options) => handler(url, options); }
function jsonResponse(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }; }
function blobResponse(status, bytes, type) {
  const blob = { type, arrayBuffer: async () => new Uint8Array(bytes).buffer };
  return { ok: status >= 200 && status < 300, status, blob: async () => blob, text: async () => '' };
}

test('getImageProvider returns null for an unknown id', () => {
  assert.equal(getImageProvider('made-up'), null);
});

test('all 5 image adapters implement the interface', () => {
  for (const [id, adapter] of Object.entries(ImageProviders)) {
    assert.equal(adapter.id, id);
    assert.equal(typeof adapter.generate, 'function');
    assert.ok(Array.isArray(adapter.fields));
  }
});

// Regression guard: real users have deployed server/billboard-proxy/worker.js
// against this EXACT request shape — this must never change silently.
test('proxy.generate sends the byte-for-byte {prompt,images,model} contract server/billboard-proxy/worker.js expects', async () => {
  let sentBody = null;
  const fetchImpl = mockFetch((url, options) => {
    sentBody = JSON.parse(options.body);
    return jsonResponse(200, { image: 'data:image/png;base64,QUJD' });
  });
  const r = await ImageProviders.proxy.generate(
    { baseUrl: 'https://example.test/billboard' },
    { prompt: 'dress a model', images: ['data:image/png;base64,eHl6'], model: undefined },
    { fetchImpl },
  );
  assert.equal(r.ok, true);
  assert.equal(r.image, 'data:image/png;base64,QUJD');
  assert.deepEqual(Object.keys(sentBody).sort(), ['images', 'model', 'prompt']);
  assert.equal(sentBody.prompt, 'dress a model');
  assert.deepEqual(sentBody.images, ['data:image/png;base64,eHl6']);
  assert.equal(sentBody.model, 'gpt-image-2');
});

test('proxy.generate accepts a raw OpenAI {data:[{b64_json}]} passthrough response', async () => {
  const fetchImpl = mockFetch(() => jsonResponse(200, { data: [{ b64_json: 'eHl6' }] }));
  const r = await ImageProviders.proxy.generate({ baseUrl: 'https://example.test/billboard' }, { prompt: 'p', images: [] }, { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.image, 'data:image/png;base64,eHl6');
});

test('proxy.generate fails cleanly with no endpoint configured', async () => {
  const r = await ImageProviders.proxy.generate({}, { prompt: 'p', images: [] }, { fetchImpl: mockFetch(() => jsonResponse(200, {})) });
  assert.equal(r.ok, false);
  assert.match(r.error, /no endpoint configured/);
});

test('openai-images.generate posts a multipart form with model/prompt/image[] fields', async () => {
  let capturedForm = null;
  const fetchImpl = mockFetch((url, options) => {
    assert.match(url, /\/images\/edits$/);
    assert.equal(options.headers.authorization, 'Bearer sk-test');
    capturedForm = options.body;
    return jsonResponse(200, { image: 'data:image/png;base64,QUJD' });
  });
  const r = await ImageProviders['openai-images'].generate(
    { apiKey: 'sk-test' },
    { prompt: 'dress a model', images: ['data:image/png;base64,eHl6'] },
    { fetchImpl },
  );
  assert.equal(r.ok, true);
  assert.ok(capturedForm instanceof FormData);
  assert.equal(capturedForm.get('model'), 'gpt-image-2');
  assert.equal(capturedForm.get('prompt'), 'dress a model');
  assert.ok(capturedForm.get('image[]'));
});

test('openai-images.generate fails cleanly with no API key configured', async () => {
  const r = await ImageProviders['openai-images'].generate({}, { prompt: 'p', images: [] }, { fetchImpl: mockFetch(() => jsonResponse(200, {})) });
  assert.equal(r.ok, false);
  assert.match(r.error, /no API key configured/);
});

test('local-image.generate uses img2img when reference images are given, txt2img otherwise', async () => {
  const calls = [];
  const fetchImpl = mockFetch((url, options) => {
    calls.push(url);
    return jsonResponse(200, { images: ['QUJD'] });
  });
  await ImageProviders['local-image'].generate({}, { prompt: 'a dress', images: ['data:image/png;base64,eHl6'] }, { fetchImpl });
  await ImageProviders['local-image'].generate({}, { prompt: 'a dress', images: [] }, { fetchImpl });
  assert.match(calls[0], /\/sdapi\/v1\/img2img$/);
  assert.match(calls[1], /\/sdapi\/v1\/txt2img$/);
});

test('gemini-image.generate extracts an inline_data image from the candidates response', async () => {
  const fetchImpl = mockFetch(() => jsonResponse(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } }] }));
  const r = await ImageProviders['gemini-image'].generate({ apiKey: 'k' }, { prompt: 'p', images: [] }, { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.image, 'data:image/png;base64,QUJD');
});

test('comfyui.test reports the real /system_stats response', async () => {
  const fetchImpl = mockFetch((url) => {
    assert.match(url, /\/system_stats$/);
    return jsonResponse(200, { system: { comfyui_version: '0.3.1' }, devices: [{ vram_total: 8_000_000_000 }] });
  });
  const r = await ImageProviders.comfyui.test({}, { fetchImpl });
  assert.equal(r.ok, true);
  assert.match(r.message, /0\.3\.1/);
  assert.match(r.message, /8GB VRAM/);
});

test('comfyui.test fails cleanly when the server is unreachable', async () => {
  const fetchImpl = mockFetch(() => jsonResponse(500, {}));
  const r = await ImageProviders.comfyui.test({}, { fetchImpl });
  assert.equal(r.ok, false);
});

test('comfyui.generate auto-detects the installed checkpoint, submits a workflow, polls history, and fetches the rendered image', async () => {
  let submittedWorkflow = null;
  const fetchImpl = mockFetch((url, options) => {
    if (/\/object_info\/CheckpointLoaderSimple$/.test(url)) {
      return jsonResponse(200, { CheckpointLoaderSimple: { input: { required: { ckpt_name: [['sd_xl_base.safetensors']] } } } });
    }
    if (/\/prompt$/.test(url)) {
      submittedWorkflow = JSON.parse(options.body).prompt;
      return jsonResponse(200, { prompt_id: 'abc123' });
    }
    if (/\/history\/abc123$/.test(url)) {
      return jsonResponse(200, { abc123: { outputs: { '7': { images: [{ filename: 'berrystudio_00001.png', subfolder: '', type: 'output' }] } } } });
    }
    if (/\/view\?/.test(url)) {
      return blobResponse(200, [1, 2, 3], 'image/png');
    }
    throw new Error(`unexpected url ${url}`);
  });
  const r = await ImageProviders.comfyui.generate({}, { prompt: 'a red dress' }, { fetchImpl, pollIntervalMs: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.image, 'data:image/png;base64,AQID');
  assert.equal(submittedWorkflow['1'].inputs.ckpt_name, 'sd_xl_base.safetensors');
  assert.equal(submittedWorkflow['2'].inputs.text, 'a red dress');
});

test('comfyui.generate fails honestly with no checkpoint installed, never guesses one', async () => {
  const fetchImpl = mockFetch((url) => {
    if (/\/object_info\/CheckpointLoaderSimple$/.test(url)) {
      return jsonResponse(200, { CheckpointLoaderSimple: { input: { required: { ckpt_name: [[]] } } } });
    }
    throw new Error(`unexpected url ${url}`);
  });
  const r = await ImageProviders.comfyui.generate({}, { prompt: 'p' }, { fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.error, /no checkpoint/);
});

test('comfyui.generate times out honestly if ComfyUI never finishes rendering', async () => {
  const fetchImpl = mockFetch((url) => {
    if (/\/object_info\/CheckpointLoaderSimple$/.test(url)) {
      return jsonResponse(200, { CheckpointLoaderSimple: { input: { required: { ckpt_name: [['a.safetensors']] } } } });
    }
    if (/\/prompt$/.test(url)) return jsonResponse(200, { prompt_id: 'abc123' });
    if (/\/history\/abc123$/.test(url)) return jsonResponse(200, {});
    throw new Error(`unexpected url ${url}`);
  });
  const r = await ImageProviders.comfyui.generate({}, { prompt: 'p' }, { fetchImpl, pollIntervalMs: 1, pollTimeoutMs: 5 });
  assert.equal(r.ok, false);
  assert.match(r.error, /timed out/);
});
