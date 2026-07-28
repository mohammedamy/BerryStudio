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
     { type:"loadRoute", route:"file"|"hf", payload }
       route "file": payload = { name, mimeType, bytes: ArrayBuffer }
       route "hf":   payload = { modelId }
     { type:"complete", req: {system, messages, images, schema} }
       — only valid after a "ready" message; runs one inference call and
         returns a NormalizedResult-shaped message (see
         js/ai-providers.js's own NormalizedResult contract), so the rest
         of the app can treat a loaded local model like any other adapter.

   Message protocol (worker -> main thread):
     { type:"progress", pct }
     { type:"ready" }
     { type:"result", ok, providerId, text, json, raw, usage }
     { type:"error", message }

   Honesty notes (deliberately not glossed over):
   - Route B (file picker -> local .onnx/.gguf) is NOT fully wired up in
     this build. GGUF weights aren't supported by transformers.js/
     onnxruntime-web at all (they expect ONNX-exported weights) — a .gguf
     pick gets an explicit "use a local server instead" error. A .onnx
     pick gets an honest "not wired up yet" error rather than a silent
     failure or a fake success — the IndexedDB/OPFS storage and
     onnxruntime-web InferenceSession wiring this needs is a documented
     next step, not something quietly skipped.
   - A generic "text-generation" pipeline has no structured-output
     enforcement the way the hosted providers' json_schema/tool-use modes
     do — small local models frequently won't produce valid JSON matching
     schema/pattern-spec.v1.json. looseJsonParse() below is the same
     best-effort extraction js/ai-providers.js uses elsewhere; when it
     can't find valid JSON, `json` comes back null and the WP-3 pipeline's
     existing validate-and-retry/fallback logic takes over exactly as it
     would for any other adapter that failed to return structured output.
   ============================================================ */

const TRANSFORMERS_CDN_URL = 'https://esm.sh/@huggingface/transformers@3.0.0';

let pipelineInstance = null;

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

async function loadRouteFile(payload) {
  const name = (payload && payload.name) || '';
  if (/\.gguf$/i.test(name)) {
    post({ type: 'error', message: `GGUF files aren't supported for in-browser inference — use a local server (Ollama/LM Studio/llama.cpp) instead of the file picker for "${name}".` });
    return;
  }
  if (/\.onnx$/i.test(name)) {
    post({ type: 'error', message: `Loading a raw .onnx file directly isn't wired up yet — use the Hugging Face model ID route, or a local server, instead of "${name}".` });
    return;
  }
  post({ type: 'error', message: `Unrecognized model file type for "${name}" — only .onnx is planned for the file picker route.` });
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'loadRoute') {
      if (msg.route === 'hf') await loadRouteHF(msg.payload && msg.payload.modelId);
      else if (msg.route === 'file') await loadRouteFile(msg.payload);
      else post({ type: 'error', message: `unknown route "${msg.route}"` });
    } else if (msg.type === 'complete') {
      if (!pipelineInstance) { post({ type: 'error', message: 'no model loaded — send loadRoute first' }); return; }
      const prompt = [msg.req && msg.req.system, ...(((msg.req && msg.req.messages) || []).map((m) => m.content))].filter(Boolean).join('\n\n');
      const t0 = Date.now();
      const out = await pipelineInstance(prompt, { max_new_tokens: 512 });
      const text = Array.isArray(out) ? (out[0] && (out[0].generated_text ?? out[0].text)) : (out && out.generated_text);
      const json = msg.req && msg.req.schema ? looseJsonParse(text) : null;
      post({ type: 'result', ok: true, providerId: 'browser-local', text: text || null, json, raw: out, usage: { latencyMs: Date.now() - t0 } });
    } else {
      post({ type: 'error', message: `unknown message type "${msg.type}"` });
    }
  } catch (err) {
    post({ type: 'error', message: (err && err.message) || String(err) });
  }
};
