/* ============================================================
   Local model worker — BerryStudio-Upgrade-Plan WP-2, Routes B & C.

   Instantiated ONLY when the user opts into a browser-local model route
   (see js/ai-providers.js's `browser-local` adapter facade — the only
   thing that constructs this worker, and only in response to a user
   action, never at app load). Runs entirely off the main thread so a
   multi-hundred-MB model download or a WebGPU inference call never
   freezes the UI.

   The heavy ML runtime (@huggingface/transformers) is loaded via a
   PINNED-VERSION dynamic import from a CDN — never a static import,
   never a top-level dependency of the app shell (BerryStudio-Upgrade-Plan
   rule #3: "no dependency creep in the root app... heavy libraries go in
   a Web Worker loaded on demand"). The import only executes once a real
   "loadRoute" message arrives, so a user who never touches Routes B/C
   never causes a single byte of it to be fetched, and it never appears in
   sw.js's precache list.

   Message protocol (main thread -> worker):
     { type:"loadRoute", route:"file"|"file-restore"|"hf", payload }
       route "file":         payload = { name, mimeType, bytes: ArrayBuffer }
       route "file-restore": payload = {} — reload whatever's in
         js/workers/model-file-cache.js's cache, no bytes sent (there
         are none to send — the worker reads the cache itself)
       route "hf":           payload = { modelId }
     { type:"complete", req: {system, messages, images, schema} }
       — only valid after a "ready" message from route "hf"; runs one
         inference call and returns a NormalizedResult-shaped message (see
         js/ai-providers.js's own NormalizedResult contract), so the rest
         of the app can treat a loaded local model like any other adapter.
     { type:"runOnnxInference" }
       — only valid after a "ready" message from route "file"/
         "file-restore". Route B's ONNX runtime is generic (any .onnx
         graph, unknown architecture) — there's no schema-aware completion
         call the way route "hf"'s text-generation pipeline has, so this
         runs a real forward pass with a synthetic all-zero input tensor
         shaped to the model's own declared input metadata (a capability
         probe — "does this model actually run in this browser" — not a
         meaningful classification of anything, since there's no real
         input to give it yet; see the honesty note below).

   Message protocol (worker -> main thread):
     { type:"progress", pct }
     { type:"ready", route, name?, inputNames?, outputNames? }
     { type:"result", ok, providerId, text, json, raw, usage }
     { type:"onnxInferenceResult", ok, modelName, inputs, outputs, latencyMs }
     { type:"error", message }

   Honesty notes (deliberately not glossed over):
   - GGUF weights aren't supported by transformers.js/onnxruntime-web at
     all (they expect ONNX-exported weights) — a .gguf pick still gets an
     explicit "use a local server instead" error, unchanged from before.
   - Route B's `runOnnxInference` feeds an all-zero synthetic tensor, not
     a real photo — it proves the picked .onnx graph actually loads and
     executes on this device/runtime (WebGPU or WASM), which is real,
     useful signal on its own, but the output values are meaningless
     (garbage-in). Real per-model image preprocessing (resize, channel
     order, mean/std normalization — all of which vary by model and
     can't be guessed generically) is exactly what WP-39's segmentation
     feature builds concretely for one specific, known model pipeline,
     rather than attempting it generically here for an arbitrary
     user-supplied .onnx file.
   - Shape metadata for `runOnnxInference`'s synthetic input comes from
     PARSING THE .onnx FILE'S OWN BYTES (js/workers/onnx-shape-reader.js),
     not from onnxruntime-web's JS API — confirmed empirically that
     `InferenceSession`/its internal handler expose no shape metadata at
     all in the version pinned above (only name lists). The file's
     declared shape is real, static data; when a dimension is genuinely
     dynamic (batch/symbolic, or the whole input has no shape at all —
     both real, valid ONNX encodings), a documented fallback guess is
     substituted instead of silently failing, and `inputs[].shapeSource`
     in the result says which happened, honestly, per input. An input
     whose declared element type isn't one this reader can synthesize
     (e.g. float16/string/complex) is reported, not guessed at with a
     wrong byte layout.
   - A generic "text-generation" pipeline (route "hf") has no structured-
     output enforcement the way the hosted providers' json_schema/tool-use
     modes do — small local models frequently won't produce valid JSON
     matching schema/pattern-spec.v1.json. looseJsonParse() below is the
     same best-effort extraction js/ai-providers.js uses elsewhere; when
     it can't find valid JSON, `json` comes back null and the WP-3
     pipeline's existing validate-and-retry/fallback logic takes over
     exactly as it would for any other adapter that failed to return
     structured output.
   ============================================================ */
import { saveModelFile, loadModelFile } from './model-file-cache.js';
import { readOnnxGraphIO, ONNX_ELEM_TYPES } from './onnx-shape-reader.js';

const TRANSFORMERS_CDN_URL = 'https://esm.sh/@huggingface/transformers@3.0.0';
// Pinned like TRANSFORMERS_CDN_URL above — verify against the current
// onnxruntime-web release before bumping; a version bump here is a
// deliberate upgrade, not something to silently float on "latest".
const ONNX_CDN_URL = 'https://esm.sh/onnxruntime-web@1.20.1';
// Used only when the .onnx file itself declares a fully dynamic/absent
// shape for an input (see the honesty note above) — a common mobile
// vision-classifier input shape, not a guess about THIS model
// specifically.
const FALLBACK_INPUT_SHAPE = [1, 3, 224, 224];

let pipelineInstance = null;
let ortModule = null;
let onnxSession = null;
let onnxModelName = null;
let onnxInputSpecs = null; // [{name, elemType, shape}] parsed from the .onnx file itself — see onnx-shape-reader.js

function post(msg) { self.postMessage(msg); }

function looseJsonParse(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) {} }
  const first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first !== -1 && last > first) { try { return JSON.parse(text.slice(first, last + 1)); } catch (e) {} }
  return null;
}

async function loadTransformers() {
  return import(/* @vite-ignore */ TRANSFORMERS_CDN_URL);
}

async function loadOnnxRuntime() {
  if (!ortModule) ortModule = await import(/* @vite-ignore */ ONNX_CDN_URL);
  return ortModule;
}

async function loadRouteHF(modelId) {
  post({ type: 'progress', pct: 5 });
  const { pipeline } = await loadTransformers();
  post({ type: 'progress', pct: 20 });
  const progressCb = (p) => { if (p && typeof p.progress === 'number') post({ type: 'progress', pct: 20 + Math.round(p.progress * 0.75) }); };
  try {
    pipelineInstance = await pipeline('text-generation', modelId, { device: 'webgpu', progress_callback: progressCb });
  } catch (e) {
    // WebGPU init can fail even when navigator.gpu exists (driver/adapter
    // issues) — fall back to WASM rather than failing the whole route.
    pipelineInstance = await pipeline('text-generation', modelId, { device: 'wasm', progress_callback: progressCb });
  }
  post({ type: 'ready' });
}

async function loadOnnxFromBytes({ name, mimeType, bytes }) {
  post({ type: 'progress', pct: 25 });
  // Real, static shape/dtype data straight from the file — see
  // js/workers/onnx-shape-reader.js's own header for why this reads the
  // bytes itself instead of asking the runtime.
  try {
    onnxInputSpecs = readOnnxGraphIO(bytes).inputs;
  } catch (e) {
    onnxInputSpecs = []; // a malformed/unusual file — runOnnxInference() falls back per-input, honestly, same as an input this reader just didn't find
  }
  post({ type: 'progress', pct: 40 });
  const ort = await loadOnnxRuntime();
  post({ type: 'progress', pct: 65 });
  try {
    // WebGPU first, matching route "hf"'s own preference — falls back to
    // WASM on any failure (missing navigator.gpu, driver/adapter issues,
    // or this particular graph having an op WebGPU's EP doesn't cover).
    onnxSession = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'] });
  } catch (e) {
    onnxSession = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  }
  onnxModelName = name;
  post({ type: 'progress', pct: 95 });
  post({ type: 'ready', route: 'file', name, inputNames: onnxSession.inputNames, outputNames: onnxSession.outputNames });
}

async function loadRouteFile(payload) {
  const name = (payload && payload.name) || '';
  if (/\.gguf$/i.test(name)) {
    post({ type: 'error', message: `GGUF files aren't supported for in-browser inference — use a local server (Ollama/LM Studio/llama.cpp) instead of the file picker for "${name}".` });
    return;
  }
  if (!/\.onnx$/i.test(name)) {
    post({ type: 'error', message: `Unrecognized model file type for "${name}" — only .onnx is supported by the file picker route.` });
    return;
  }
  post({ type: 'progress', pct: 5 });
  try {
    await saveModelFile({ name, mimeType: payload.mimeType, bytes: payload.bytes });
  } catch (e) {
    // Persistence is best-effort (e.g. storage quota) — inference can
    // still proceed from the bytes already in memory this session even
    // if the browser won't let this device cache them for next time.
  }
  await loadOnnxFromBytes(payload);
}

async function loadRouteFileFromCache() {
  const cached = await loadModelFile();
  if (!cached) {
    post({ type: 'error', message: 'no cached local .onnx model to restore — pick a file first' });
    return;
  }
  await loadOnnxFromBytes(cached);
}

// A parsed `shape` (from onnx-shape-reader.js: [{value,param}, ...]) into
// a concrete positive-integer shape onnxruntime-web's Tensor constructor
// can actually use, plus an honest note of where every dimension came
// from — the model's real declared size, or a substituted 1 because that
// dimension is symbolic/dynamic (a real, common ONNX encoding — batch
// size is almost always exported this way), or the fallback guess
// because the file declared no shape for this input at all.
function resolveOnnxInputShape(rawShape) {
  if (!Array.isArray(rawShape) || !rawShape.length) {
    return { shape: FALLBACK_INPUT_SHAPE.slice(), shapeSource: "fallback guess (model's .onnx file declares no shape for this input)" };
  }
  let sawDynamic = false;
  const shape = rawShape.map((d) => {
    if (Number.isInteger(d.value) && d.value > 0) return d.value;
    sawDynamic = true;
    return 1; // symbolic (dim_param, e.g. "batch") or empty — substitute the smallest valid size
  });
  return { shape, shapeSource: sawDynamic ? "model metadata, with dynamic dim(s) substituted as 1" : 'model metadata (all dims static)' };
}

async function runOnnxInference() {
  if (!onnxSession) {
    post({ type: 'error', message: 'no ONNX model loaded — pick or restore a .onnx file first' });
    return;
  }
  const ort = await loadOnnxRuntime();
  const feeds = {};
  const inputs = [];
  for (const name of onnxSession.inputNames) {
    const spec = (onnxInputSpecs || []).find((s) => s.name === name);
    const elemInfo = spec ? ONNX_ELEM_TYPES[spec.elemType] : undefined;
    if (spec && !elemInfo) {
      // A real ONNX element type this reader deliberately doesn't
      // synthesize (float16/string/complex/...) — say so, don't guess a
      // byte layout that would just be wrong.
      post({ type: 'error', message: `input "${name}" has an element type this test can't synthesize (ONNX elem_type ${spec.elemType}) — pick a model whose inputs are a common numeric type, or supply real preprocessed input (not yet supported by this button).` });
      return;
    }
    const { ortType, TypedArray } = elemInfo || ONNX_ELEM_TYPES[1]; // no spec at all (reader found nothing for this name) — assume float32, the overwhelmingly common case, and say so via shapeSource below
    const { shape, shapeSource } = resolveOnnxInputShape(spec && spec.shape);
    const size = shape.reduce((a, b) => a * b, 1);
    const isBig = TypedArray === BigInt64Array || TypedArray === BigUint64Array;
    const data = isBig ? new TypedArray(size).fill(0n) : new TypedArray(size);
    feeds[name] = new ort.Tensor(ortType, data, shape);
    inputs.push({ name, shape, shapeSource: spec ? shapeSource : `${shapeSource} (no metadata found for this input name — assumed float32)`, elemType: ortType });
  }
  const t0 = Date.now();
  const results = await onnxSession.run(feeds);
  const outputs = Object.entries(results).map(([name, tensor]) => ({
    name, dims: tensor.dims, type: tensor.type,
    // A small sample, not the full tensor — output tensors can be large,
    // and the point here is proof-of-real-execution, not a full dump.
    sample: Array.from(tensor.data.slice(0, 8)),
  }));
  post({ type: 'onnxInferenceResult', ok: true, modelName: onnxModelName, inputs, outputs, latencyMs: Date.now() - t0 });
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'loadRoute') {
      if (msg.route === 'hf') await loadRouteHF(msg.payload && msg.payload.modelId);
      else if (msg.route === 'file') await loadRouteFile(msg.payload);
      else if (msg.route === 'file-restore') await loadRouteFileFromCache();
      else post({ type: 'error', message: `unknown route "${msg.route}"` });
    } else if (msg.type === 'complete') {
      if (!pipelineInstance) { post({ type: 'error', message: 'no model loaded — send loadRoute first' }); return; }
      const prompt = [msg.req && msg.req.system, ...(((msg.req && msg.req.messages) || []).map((m) => m.content))].filter(Boolean).join('\n\n');
      const t0 = Date.now();
      const out = await pipelineInstance(prompt, { max_new_tokens: 512 });
      const text = Array.isArray(out) ? (out[0] && (out[0].generated_text ?? out[0].text)) : (out && out.generated_text);
      const json = msg.req && msg.req.schema ? looseJsonParse(text) : null;
      post({ type: 'result', ok: true, providerId: 'browser-local', text: text || null, json, raw: out, usage: { latencyMs: Date.now() - t0 } });
    } else if (msg.type === 'runOnnxInference') {
      await runOnnxInference();
    } else {
      post({ type: 'error', message: `unknown message type "${msg.type}"` });
    }
  } catch (err) {
    post({ type: 'error', message: (err && err.message) || String(err) });
  }
};
