/* ============================================================
   AI provider adapters — BerryStudio-Upgrade-Plan WP-1.

   One adapter interface, many backends. Every adapter is a plain,
   stateless object:
     {
       id, label, needsKey, defaultBaseUrl, fields,
       models(cfg, opts) -> Promise<{text:[...], vision:[...]}>,
       test(cfg, opts)   -> Promise<{ok, message, latencyMs?}>,
       complete(cfg, req, opts) -> Promise<NormalizedResult>,
     }
   `cfg` is always `{baseUrl, apiKey, model}` — resolved by the settings UI
   (js/app.js) from js/ai-keystore.js + state, and passed in as a plain
   argument. Adapters hold no state of their own, which is what makes them
   testable with an injected `opts.fetchImpl` (a fetch-shaped mock) instead
   of a live network call — see test/ai-providers.test.js.

   `req` is `{system, messages, images, schema, model, kind}`:
     - system: string, the system/instructions prompt
     - messages: [{role:"user"|"assistant", content:string}]
     - images: string[] of data URLs, attached to the LAST user message
     - schema: a JSON Schema object (draft-07) to request structured output for
     - kind: "text" | "vision" — which model slot to use if the caller
       didn't pin an explicit cfg.model

   NormalizedResult:
     { ok:true,  text, json, raw, usage:{inputTokens?,outputTokens?,latencyMs}, providerId }
     { ok:false, error, providerId }
   `error` is real, provider-specific text — this is what "Test connection"
   shows verbatim (WP-1: "green/red with the actual error text, not a
   generic failure").

   Security note: no adapter ever logs/toasts cfg.apiKey directly — see
   js/ai-keystore.js's redact(). Adapters only ever put the key in a
   request header/URL, never in a string that could reach a log or export.
   ============================================================ */

function getFetch(opts) { return (opts && opts.fetchImpl) || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null); }

function parseDataUrl(dataURL) {
  const m = /^data:([^;,]+)(?:;charset=[^;,]+)?(;base64)?,(.*)$/s.exec(dataURL || '');
  if (!m) return null;
  return { mediaType: m[1] || 'application/octet-stream', base64: m[2] ? m[3] : btoa(unescape(encodeURIComponent(m[3]))) };
}

async function timedFetch(fetchImpl, url, options, timeoutMs) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetchImpl(url, { ...options, signal: ctrl.signal });
    return { res, latencyMs: Date.now() - t0 };
  } finally { clearTimeout(to); }
}

// Best-effort JSON extraction for providers that don't guarantee clean
// structured output (fenced code block, or stray leading/trailing prose).
function looseJsonParse(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) {} }
  const first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first !== -1 && last > first) { try { return JSON.parse(text.slice(first, last + 1)); } catch (e) {} }
  return null;
}

function ok(providerId, { text = null, json = null, raw = null, usage = {} }) {
  return { ok: true, providerId, text, json, raw, usage };
}
function fail(providerId, error) {
  return { ok: false, providerId, error: String(error && error.message || error || 'unknown error') };
}

async function readErrorText(res) {
  try {
    const body = await res.text();
    try {
      const j = JSON.parse(body);
      return (j.error && (j.error.message || j.error)) || j.message || body.slice(0, 300);
    } catch (e) { return body.slice(0, 300) || `HTTP ${res.status}`; }
  } catch (e) { return `HTTP ${res.status}`; }
}

// Strip keywords Gemini's OpenAPI-3-subset responseSchema dialect doesn't
// recognize from a draft-07 schema. Light transform, not a full converter.
function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === '$schema' || k === '$id' || k === 'additionalProperties') continue;
    out[k] = (v && typeof v === 'object') ? toGeminiSchema(v) : v;
  }
  return out;
}

function lastUserIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return i;
  return -1;
}

// ---------- anthropic ----------
const ANTHROPIC_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'];
const anthropic = {
  id: 'anthropic', label: 'Anthropic (Claude)', needsKey: true,
  defaultBaseUrl: 'https://api.anthropic.com',
  fields: [{ key: 'apiKey', type: 'key', required: true }],
  async models() { return { text: ANTHROPIC_MODELS.slice(), vision: ANTHROPIC_MODELS.slice() }; },
  async test(cfg, opts) {
    const r = await this.complete(cfg, { system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'ping' }] }, opts);
    return r.ok ? { ok: true, message: 'Connected', latencyMs: r.usage.latencyMs } : { ok: false, message: r.error };
  },
  async complete(cfg, req, opts = {}) {
    const fetchImpl = getFetch(opts);
    if (!fetchImpl) return fail('anthropic', 'fetch is not available in this environment');
    const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
    const model = cfg.model || req.model || ANTHROPIC_MODELS[1];
    const messages = (req.messages || []).map((m, i) => {
      if (i === lastUserIndex(req.messages) && req.images && req.images.length) {
        const blocks = req.images.map((d) => {
          const p = parseDataUrl(d);
          return p ? { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } } : null;
        }).filter(Boolean);
        return { role: m.role, content: [...blocks, { type: 'text', text: m.content }] };
      }
      return { role: m.role, content: m.content };
    });
    const body = { model, max_tokens: req.maxTokens || 4096, system: req.system, messages };
    if (req.schema) {
      body.tools = [{ name: 'emit_pattern_spec', description: 'Emit the result matching the required JSON Schema.', input_schema: req.schema }];
      body.tool_choice = { type: 'tool', name: 'emit_pattern_spec' };
    }
    try {
      const { res, latencyMs } = await timedFetch(fetchImpl, `${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01', // verify against current docs before relying on this long-term
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      }, 60000);
      if (!res.ok) return fail('anthropic', await readErrorText(res));
      const data = await res.json();
      const toolBlock = (data.content || []).find((b) => b.type === 'tool_use' && b.name === 'emit_pattern_spec');
      const textBlock = (data.content || []).find((b) => b.type === 'text');
      const json = toolBlock ? toolBlock.input : looseJsonParse(textBlock && textBlock.text);
      return ok('anthropic', {
        text: textBlock ? textBlock.text : null, json, raw: data,
        usage: { inputTokens: data.usage && data.usage.input_tokens, outputTokens: data.usage && data.usage.output_tokens, latencyMs },
      });
    } catch (e) { return fail('anthropic', e); }
  },
};

// ---------- openai ----------
function buildOpenAIMessages(req) {
  const lastUser = lastUserIndex(req.messages);
  const out = req.system ? [{ role: 'system', content: req.system }] : [];
  (req.messages || []).forEach((m, i) => {
    if (i === lastUser && req.images && req.images.length) {
      out.push({ role: m.role, content: [{ type: 'text', text: m.content }, ...req.images.map((d) => ({ type: 'image_url', image_url: { url: d } }))] });
    } else out.push({ role: m.role, content: m.content });
  });
  return out;
}

function makeOpenAICompatAdapter({ id, label, needsKey, defaultBaseUrl, fields, strictJsonSchema }) {
  return {
    id, label, needsKey, defaultBaseUrl,
    fields: fields || [{ key: 'apiKey', type: 'key', required: !!needsKey }, { key: 'baseUrl', type: 'url', required: !defaultBaseUrl }],
    async models(cfg, opts = {}) {
      const fetchImpl = getFetch(opts);
      const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
      if (!fetchImpl || !baseUrl) return { text: [], vision: [] };
      try {
        const headers = cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
        const { res } = await timedFetch(fetchImpl, `${baseUrl}/models`, { headers }, 10000);
        if (!res.ok) return { text: [], vision: [] };
        const data = await res.json();
        const names = (data.data || []).map((m) => m.id).filter(Boolean);
        return { text: names, vision: names };
      } catch (e) { return { text: [], vision: [] }; }
    },
    async test(cfg, opts) {
      const r = await this.complete(cfg, { system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'ping' }] }, opts);
      return r.ok ? { ok: true, message: 'Connected', latencyMs: r.usage.latencyMs } : { ok: false, message: r.error };
    },
    async complete(cfg, req, opts = {}) {
      const fetchImpl = getFetch(opts);
      if (!fetchImpl) return fail(id, 'fetch is not available in this environment');
      const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
      if (!baseUrl) return fail(id, 'no base URL configured');
      const model = cfg.model || req.model;
      const headers = { 'content-type': 'application/json' };
      if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
      const messages = buildOpenAIMessages(req);
      const attempt = async (responseFormat) => {
        const body = { model, messages };
        if (responseFormat) body.response_format = responseFormat;
        return timedFetch(fetchImpl, `${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) }, 60000);
      };
      try {
        let responseFormat = req.schema
          ? (strictJsonSchema
            ? { type: 'json_schema', json_schema: { name: 'pattern_spec', schema: req.schema, strict: true } }
            : { type: 'json_object' })
          : undefined;
        let { res, latencyMs } = await attempt(responseFormat);
        if (!res.ok && req.schema && strictJsonSchema) {
          // some OpenAI-compatible backends don't support json_schema — retry once with json_object
          const errText = await readErrorText(res);
          if (res.status >= 400 && res.status < 500) {
            ({ res, latencyMs } = await attempt({ type: 'json_object' }));
          } else return fail(id, errText);
        }
        if (!res.ok) return fail(id, await readErrorText(res));
        const data = await res.json();
        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        const json = req.schema ? looseJsonParse(content) : null;
        return ok(id, {
          text: content || null, json, raw: data,
          usage: { inputTokens: data.usage && data.usage.prompt_tokens, outputTokens: data.usage && data.usage.completion_tokens, latencyMs },
        });
      } catch (e) { return fail(id, e); }
    },
  };
}

const openai = makeOpenAICompatAdapter({
  id: 'openai', label: 'OpenAI', needsKey: true, defaultBaseUrl: 'https://api.openai.com/v1', strictJsonSchema: true,
});
const openaiCompatible = makeOpenAICompatAdapter({
  id: 'openai-compatible', label: 'OpenAI-compatible (OpenRouter, Groq, Together, Mistral, DeepSeek, Azure…)',
  needsKey: true, defaultBaseUrl: null, strictJsonSchema: true,
  fields: [{ key: 'baseUrl', type: 'url', required: true }, { key: 'apiKey', type: 'key', required: false }],
});
const lmstudio = makeOpenAICompatAdapter({
  id: 'lmstudio', label: 'LM Studio (local)', needsKey: false, defaultBaseUrl: 'http://localhost:1234/v1', strictJsonSchema: false,
  fields: [{ key: 'baseUrl', type: 'url', required: false }],
});
const llamacpp = makeOpenAICompatAdapter({
  id: 'llamacpp', label: 'llama.cpp server (local)', needsKey: false, defaultBaseUrl: 'http://localhost:8080/v1', strictJsonSchema: false,
  fields: [{ key: 'baseUrl', type: 'url', required: false }, { key: 'apiKey', type: 'key', required: false }],
});
const vllm = makeOpenAICompatAdapter({
  id: 'vllm', label: 'vLLM (local or self-hosted)', needsKey: false, defaultBaseUrl: 'http://localhost:8000/v1', strictJsonSchema: false,
  fields: [{ key: 'baseUrl', type: 'url', required: false }, { key: 'apiKey', type: 'key', required: false }],
});

// ---------- gemini ----------
const GEMINI_MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'];
const gemini = {
  id: 'gemini', label: 'Google Gemini', needsKey: true,
  defaultBaseUrl: 'https://generativelanguage.googleapis.com',
  fields: [{ key: 'apiKey', type: 'key', required: true }],
  async models() { return { text: GEMINI_MODELS.slice(), vision: GEMINI_MODELS.slice() }; },
  async test(cfg, opts) {
    const r = await this.complete(cfg, { system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'ping' }] }, opts);
    return r.ok ? { ok: true, message: 'Connected', latencyMs: r.usage.latencyMs } : { ok: false, message: r.error };
  },
  async complete(cfg, req, opts = {}) {
    const fetchImpl = getFetch(opts);
    if (!fetchImpl) return fail('gemini', 'fetch is not available in this environment');
    const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
    const model = cfg.model || req.model || GEMINI_MODELS[1];
    const lastUser = lastUserIndex(req.messages);
    const contents = (req.messages || []).map((m, i) => {
      const parts = [{ text: m.content }];
      if (i === lastUser && req.images && req.images.length) {
        req.images.forEach((d) => {
          const p = parseDataUrl(d);
          if (p) parts.unshift({ inline_data: { mime_type: p.mediaType, data: p.base64 } });
        });
      }
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });
    const generationConfig = req.schema
      ? { responseMimeType: 'application/json', responseSchema: toGeminiSchema(req.schema) }
      : undefined;
    const body = { contents, generationConfig };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    try {
      const { res, latencyMs } = await timedFetch(fetchImpl,
        `${baseUrl}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, 60000);
      if (!res.ok) return fail('gemini', await readErrorText(res));
      const data = await res.json();
      const cand = data.candidates && data.candidates[0];
      const text = cand && cand.content && cand.content.parts && cand.content.parts.map((p) => p.text || '').join('');
      const json = req.schema ? looseJsonParse(text) : null;
      return ok('gemini', {
        text: text || null, json, raw: data,
        usage: { inputTokens: data.usageMetadata && data.usageMetadata.promptTokenCount, outputTokens: data.usageMetadata && data.usageMetadata.candidatesTokenCount, latencyMs },
      });
    } catch (e) { return fail('gemini', e); }
  },
};

// ---------- ollama ----------
const OLLAMA_VISION_NAMES = ['llava', 'vision', 'qwen2-vl', 'qwen2.5-vl', 'llama3.2-vision', 'moondream', 'bakllava'];
const ollama = {
  id: 'ollama', label: 'Ollama (local)', needsKey: false,
  defaultBaseUrl: 'http://localhost:11434',
  fields: [{ key: 'baseUrl', type: 'url', required: false }],
  async models(cfg, opts = {}) {
    const fetchImpl = getFetch(opts);
    const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
    if (!fetchImpl) return { text: [], vision: [] };
    try {
      const { res } = await timedFetch(fetchImpl, `${baseUrl}/api/tags`, {}, 10000);
      if (!res.ok) return { text: [], vision: [] };
      const data = await res.json();
      const names = (data.models || []).map((m) => m.name).filter(Boolean);
      const vision = names.filter((n) => OLLAMA_VISION_NAMES.some((v) => n.toLowerCase().includes(v)));
      return { text: names, vision };
    } catch (e) { return { text: [], vision: [] }; }
  },
  async test(cfg, opts = {}) {
    const fetchImpl = getFetch(opts);
    const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
    if (!fetchImpl) return { ok: false, message: 'fetch is not available in this environment' };
    try {
      const { res, latencyMs } = await timedFetch(fetchImpl, `${baseUrl}/api/tags`, {}, 10000);
      if (!res.ok) return { ok: false, message: await readErrorText(res) };
      return { ok: true, message: 'Connected', latencyMs };
    } catch (e) {
      return { ok: false, message: `${e.message || e} — is Ollama running with OLLAMA_ORIGINS set for this origin?` };
    }
  },
  async complete(cfg, req, opts = {}) {
    const fetchImpl = getFetch(opts);
    if (!fetchImpl) return fail('ollama', 'fetch is not available in this environment');
    const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
    const model = cfg.model || req.model;
    const lastUser = lastUserIndex(req.messages);
    const messages = (req.messages || []).map((m, i) => {
      const out = { role: m.role, content: m.content };
      if (i === lastUser && req.images && req.images.length) {
        out.images = req.images.map((d) => { const p = parseDataUrl(d); return p ? p.base64 : d; });
      }
      return out;
    });
    if (req.system) messages.unshift({ role: 'system', content: req.system });
    try {
      const { res, latencyMs } = await timedFetch(fetchImpl, `${baseUrl}/api/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages, format: req.schema ? 'json' : undefined, stream: false }),
      }, 120000);
      if (!res.ok) return fail('ollama', await readErrorText(res));
      const data = await res.json();
      const content = data.message && data.message.content;
      const json = req.schema ? looseJsonParse(content) : null;
      return ok('ollama', { text: content || null, json, raw: data, usage: { latencyMs } });
    } catch (e) { return fail('ollama', e); }
  },
};

// ---------- proxy (existing "AI endpoint" behaviour, unchanged) ----------
// This is today's js/ai.js `remote()` verbatim: a bare POST to a
// user-deployed server that's expected to already run its own vision
// model, returning either {pieces} or {style} — never {json Schema} shaped
// like the other adapters, because the server was never asked to speak
// that protocol. The pipeline that calls this (js/ai-spec-pipeline.js)
// must recognize the `legacy` marker in the returned json and route around
// schema validation for it — see that file for why.
const proxy = {
  id: 'proxy', label: 'Your own proxy (safest — key stays server-side)', needsKey: false,
  defaultBaseUrl: '',
  fields: [{ key: 'baseUrl', type: 'url', required: true }],
  async models() { return { text: [], vision: [] }; },
  async test(cfg, opts = {}) {
    if (!cfg.baseUrl) return { ok: false, message: 'no endpoint configured' };
    const r = await this.complete(cfg, { messages: [{ role: 'user', content: 'ping' }] }, opts);
    return r.ok ? { ok: true, message: 'Connected', latencyMs: r.usage.latencyMs } : { ok: false, message: r.error };
  },
  async complete(cfg, req, opts = {}) {
    const fetchImpl = getFetch(opts);
    if (!fetchImpl) return fail('proxy', 'fetch is not available in this environment');
    if (!cfg.baseUrl) return fail('proxy', 'no endpoint configured');
    const prompt = (req.messages || []).map((m) => m.content).join('\n\n');
    try {
      const { res, latencyMs } = await timedFetch(fetchImpl, cfg.baseUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, image: req.images && req.images[0], category: req.category, measurements: req.measurements }),
      }, 30000);
      if (!res.ok) return fail('proxy', `bad status ${res.status}`);
      const r = await res.json();
      if (r && Array.isArray(r.pieces) && r.pieces.length) {
        return ok('proxy', { json: { legacy: 'pieces', pieces: r.pieces, colors: r.colors, summary: r.summary }, raw: r, usage: { latencyMs } });
      }
      if (r && r.style) {
        return ok('proxy', { json: { legacy: 'style', style: r.style, summary: r.summary }, raw: r, usage: { latencyMs } });
      }
      return fail('proxy', 'response did not contain pieces or style');
    } catch (e) { return fail('proxy', e); }
  },
};

// ---------- browser-local (WP-2 Route C — Hugging Face model ID, in-browser;
//            + BerryStudio-Upgrade-Plan-v2.0 WP-21 Route B — local .onnx file) ----------
// Route B (file picker -> local .onnx) is a real, working path as of
// WP-21 — GGUF still isn't (no in-browser GGUF runtime exists to wire up;
// that message stays honest, not a placeholder). Route B has no
// {test,complete} adapter surface of its own — its request shape (pick a
// file, run a generic capability-probe inference) doesn't fit the
// {system,messages,schema}->NormalizedResult contract every other AI
// provider here shares, so it isn't a member of `AIProviders` below; it's
// UI-driven directly by Settings' "Local .onnx file" toggle via the three
// functions exported at the bottom of this section instead.
// This adapter (and Route B's functions) wrap js/workers/local-model-worker.js,
// instantiated lazily (only on first use, never at module load) so a user
// who never touches either route never causes the worker — let alone the
// CDN-loaded ML runtime inside it — to be created at all.
let localWorker = null;
let loadedModelId = null;

function getLocalWorker() {
  if (!localWorker) {
    localWorker = new Worker(new URL('./workers/local-model-worker.js', import.meta.url), { type: 'module' });
  }
  return localWorker;
}

function postToWorker(msg, onProgress) {
  return new Promise((resolve, reject) => {
    const w = getLocalWorker();
    function handler(e) {
      const data = e.data;
      if (data.type === 'progress') { if (onProgress) onProgress(data.pct); return; }
      w.removeEventListener('message', handler);
      if (data.type === 'error') reject(new Error(data.message));
      else resolve(data);
    }
    w.addEventListener('message', handler);
    w.postMessage(msg);
  });
}

async function ensureLocalModelLoaded(modelId, onProgress) {
  if (loadedModelId === modelId) return;
  await postToWorker({ type: 'loadRoute', route: 'hf', payload: { modelId } }, onProgress);
  loadedModelId = modelId;
}

const browserLocal = {
  id: 'browser-local', label: 'Hugging Face model ID (in-browser, WebGPU/WASM)', needsKey: false,
  defaultBaseUrl: null,
  // No dedicated fields — the "Text model" slot every provider already gets
  // in the settings UI doubles as the Hugging Face model ID input here
  // (e.g. "Xenova/..."), so there's no separate/duplicate field to add.
  fields: [],
  async models() { return { text: [], vision: [] }; }, // no listing API — the user types a Hub model id directly
  async test(cfg, opts) {
    if (!cfg.model) return { ok: false, message: 'no Hugging Face model ID configured' };
    const t0 = Date.now();
    try {
      await ensureLocalModelLoaded(cfg.model);
      return { ok: true, message: 'Model loaded', latencyMs: Date.now() - t0 };
    } catch (e) { return { ok: false, message: e.message || String(e) }; }
  },
  async complete(cfg, req) {
    if (!cfg.model) return fail('browser-local', 'no Hugging Face model ID configured');
    try {
      await ensureLocalModelLoaded(cfg.model);
      const result = await postToWorker({ type: 'complete', req });
      return result; // already NormalizedResult-shaped by the worker
    } catch (e) { return fail('browser-local', e); }
  },
};

// ---------- Route B — local .onnx file (WP-21) ----------
// UI-driven, not part of the AIProviders adapter map — see the honesty
// note above. `bytes` is a real ArrayBuffer read from the picked File;
// js/workers/model-file-cache.js persists it (IndexedDB/OPFS) so a later
// call to restoreLocalModelFromCache() can reload it without the browser's
// file picker dialog reappearing.
export async function loadLocalModelFromFile(name, mimeType, bytes, onProgress) {
  const result = await postToWorker({ type: 'loadRoute', route: 'file', payload: { name, mimeType, bytes } }, onProgress);
  loadedModelId = null; // invalidate any "HF model already loaded" memo — the worker's active model just changed
  return result; // { type:'ready', route:'file', name, inputNames, outputNames }
}
export async function restoreLocalModelFromCache(onProgress) {
  const result = await postToWorker({ type: 'loadRoute', route: 'file-restore', payload: {} }, onProgress);
  loadedModelId = null;
  return result;
}
// A generic capability-probe forward pass (synthetic input — see the
// worker's own honesty note on why) against whatever .onnx model is
// currently loaded via either function above.
export async function runOnnxTestInference() {
  return postToWorker({ type: 'runOnnxInference' });
}

// ---------- Real segmentation (BerryStudio-Upgrade-Plan-v2.0 WP-39) ----------
// Also UI-driven, not part of the AIProviders adapter map — same reasoning
// as Route B above (js/ai.js's `opts.segment` shape doesn't fit the
// {system,messages,schema}->NormalizedResult contract either). Shares the
// same lazily-instantiated worker as Routes B/C.
let loadedSegModelId = null;
export async function loadSegmentationModel(modelId, onProgress) {
  if (loadedSegModelId === modelId) return { ok: true, cached: true };
  const result = await postToWorker({ type: 'loadRoute', route: 'segmentation', payload: { modelId } }, onProgress);
  loadedSegModelId = modelId;
  return result;
}
// imageData: a real {width, height, data:Uint8ClampedArray} (an ImageData,
// or anything shaped like one) — returns { width, height, data } where
// `data` is the matte's OWN resolution (not necessarily imageData's), a
// flat array of width*height alpha floats in [0,1]. Throws (does not
// silently return null) on failure — js/ai.js's analyzeImage() is what
// turns a throw into a byte-identical-to-before fallback; this function
// itself stays honest about failing.
export async function runSegmentationOn(imageData) {
  if (!loadedSegModelId) throw new Error('no segmentation model loaded — call loadSegmentationModel() first');
  const result = await postToWorker({ type: 'runSegmentation', pixels: imageData.data, width: imageData.width, height: imageData.height });
  return { width: result.width, height: result.height, data: result.data };
}

export const AIProviders = {
  anthropic, openai, gemini, 'openai-compatible': openaiCompatible,
  ollama, lmstudio, llamacpp, vllm, 'browser-local': browserLocal, proxy,
};

export const AI_PROVIDER_IDS = Object.keys(AIProviders);

export function getProvider(id) { return AIProviders[id] || null; }

// Shared, small HTTP/normalization helpers — also used by js/image-providers.js
// (WP-4) so every provider family (text/vision and image-generation) shares
// one fetch-injection/error-handling convention rather than two.
export { getFetch, timedFetch, readErrorText, parseDataUrl, ok, fail };
