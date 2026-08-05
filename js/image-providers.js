/* ============================================================
   Image-generation provider adapters — BerryStudio-Upgrade-Plan WP-4.

   Folds js/billboard.js's single hardcoded "AI Image endpoint" proxy into
   the same kind of adapter layer js/ai-providers.js already gives
   text/vision providers, so the Fashion Billboard generator gets BYO-key
   support too (OpenAI images, Gemini image, a local Stable Diffusion
   backend) instead of requiring a Cloudflare Worker for everyone.

   Kept in a SEPARATE file from js/ai-providers.js deliberately — an image
   adapter's request/response shape (prompt + reference photos -> one
   generated image) is unrelated to a text/vision adapter's shape
   ({system,messages,schema} -> structured JSON), and forcing them into one
   union interface would just make both harder to read.

   Interface:
     { id, label, needsKey, defaultBaseUrl, fields,
       generate(cfg, {prompt, images, model}, opts) -> Promise<{ok, providerId, image?, error?}> }
   `image` is always normalized to a data URL (see asDataURL()/extractImage()
   below) regardless of what shape the provider's own API returned it in.

   The `proxy` adapter here is BYTE-FOR-BYTE today's js/billboard.js
   behaviour — {prompt, images, model} POSTed as JSON, {image}/{error}
   expected back — because real users have already deployed
   server/billboard-proxy/worker.js against exactly this contract, and it
   must keep working with zero server-side changes.

   Honesty notes:
   - openai-images targets OpenAI's /v1/images/edits (edit-with-reference-
     photos) endpoint directly from the browser with a user-supplied key.
     Unlike the anthropic text adapter (which has a documented browser-
     access opt-in header), OpenAI's own CORS policy for the images API
     specifically has not been independently re-verified here — if a
     request is blocked by CORS, it surfaces as a generic network error,
     which is reported honestly (not swallowed) rather than mis-labelled.
   - gemini-image's exact current image-generation request shape
     (responseModalities, model name) has real spec churn — flagged
     inline, verify against current docs before relying on it.
   - local-image targets Automatic1111 stable-diffusion-webui's documented
     txt2img/img2img REST API (the simplest well-documented local HTTP
     contract of the realistic options).
   - comfyui (BerryStudio-Upgrade-Plan v2.0 WP-23) targets ComfyUI's
     node-graph API — real, but far more complex than Automatic1111's
     simple REST contract, so the surface area shipped here is
     deliberately narrow: one hardcoded "text-to-image" workflow graph
     (CheckpointLoaderSimple -> CLIPTextEncode x2 -> EmptyLatentImage ->
     KSampler -> VAEDecode -> SaveImage), not a user-editable node graph —
     that stays out of scope. Reference photos (`images`) are silently
     ignored by this adapter (no LoadImage/img2img wiring) rather than
     erroring, exactly like every other adapter here treats an unsupported
     input; the checkpoint to run is auto-detected from whatever's
     actually installed on the user's ComfyUI instance (object_info),
     never guessed, so a fresh install with no checkpoint fails with an
     honest "install a checkpoint" message instead of a confusing 400.
   ============================================================ */
import { getFetch, timedFetch, readErrorText, parseDataUrl, fail } from './ai-providers.js';

const DEFAULT_MODEL = 'gpt-image-2';

function extractImage(data) {
  if (!data) return null;
  if (typeof data === 'string') return asDataURL(data);
  if (data.image) return asDataURL(data.image);
  if (data.b64_json) return asDataURL(data.b64_json);
  if (Array.isArray(data.data) && data.data[0]) {
    if (data.data[0].b64_json) return asDataURL(data.data[0].b64_json);
    if (data.data[0].url) return data.data[0].url;
  }
  return null;
}
function asDataURL(s) {
  if (/^(data:|https?:)/.test(s)) return s;
  return 'data:image/png;base64,' + s;
}
function dataURLToBlob(dataUrl) {
  const p = parseDataUrl(dataUrl);
  if (!p) throw new Error('not a data URL');
  const bin = atob(p.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: p.mediaType });
}

// ---------- proxy (today's js/billboard.js behaviour, unchanged) ----------
const proxy = {
  id: 'proxy', label: 'Your own proxy (safest — key stays server-side)', needsKey: false,
  defaultBaseUrl: '',
  fields: [{ key: 'baseUrl', type: 'url', required: true }],
  async generate(cfg, { prompt, images, model }, opts = {}) {
    const fetchImpl = getFetch(opts);
    if (!fetchImpl) return fail('proxy', 'fetch is not available in this environment');
    if (!cfg.baseUrl) return fail('proxy', 'no endpoint configured');
    try {
      const { res } = await timedFetch(fetchImpl, cfg.baseUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, images, model: model || DEFAULT_MODEL }),
      }, 90000);
      if (!res.ok) return fail('proxy', `bad status ${res.status}`);
      const image = extractImage(await res.json());
      if (!image) return fail('proxy', 'no image in response');
      return { ok: true, providerId: 'proxy', image };
    } catch (e) { return fail('proxy', e); }
  },
};

// ---------- openai-images ----------
const openaiImages = {
  id: 'openai-images', label: 'OpenAI (gpt-image)', needsKey: true,
  defaultBaseUrl: 'https://api.openai.com/v1',
  fields: [{ key: 'apiKey', type: 'key', required: true }],
  async generate(cfg, { prompt, images, model }, opts = {}) {
    const fetchImpl = getFetch(opts);
    if (!fetchImpl) return fail('openai-images', 'fetch is not available in this environment');
    if (!cfg.apiKey) return fail('openai-images', 'no API key configured');
    const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
    const form = new FormData();
    form.append('model', model || cfg.model || DEFAULT_MODEL);
    form.append('prompt', prompt);
    (images || []).forEach((d) => form.append('image[]', dataURLToBlob(d), 'image.png'));
    try {
      const { res } = await timedFetch(fetchImpl, `${baseUrl}/images/edits`, {
        method: 'POST', headers: { authorization: `Bearer ${cfg.apiKey}` }, body: form,
      }, 90000);
      if (!res.ok) return fail('openai-images', await readErrorText(res));
      const image = extractImage(await res.json());
      if (!image) return fail('openai-images', 'no image in response');
      return { ok: true, providerId: 'openai-images', image };
    } catch (e) { return fail('openai-images', e); }
  },
};

// ---------- gemini-image ----------
const geminiImage = {
  id: 'gemini-image', label: 'Google Gemini (image generation)', needsKey: true,
  defaultBaseUrl: 'https://generativelanguage.googleapis.com',
  fields: [{ key: 'apiKey', type: 'key', required: true }],
  async generate(cfg, { prompt, images, model }, opts = {}) {
    const fetchImpl = getFetch(opts);
    if (!fetchImpl) return fail('gemini-image', 'fetch is not available in this environment');
    if (!cfg.apiKey) return fail('gemini-image', 'no API key configured');
    const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
    // "gemini-2.0-flash-exp" / responseModalities is current at time of
    // writing — verify the image-capable model name and generationConfig
    // shape against current Gemini docs before relying on this in production.
    const m = model || cfg.model || 'gemini-2.0-flash-exp';
    const parts = [{ text: prompt }];
    (images || []).forEach((d) => { const p = parseDataUrl(d); if (p) parts.unshift({ inline_data: { mime_type: p.mediaType, data: p.base64 } }); });
    const body = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } };
    try {
      const { res } = await timedFetch(fetchImpl, `${baseUrl}/v1beta/models/${m}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }, 90000);
      if (!res.ok) return fail('gemini-image', await readErrorText(res));
      const data = await res.json();
      const outParts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const imgPart = outParts.find((p) => p.inlineData || p.inline_data);
      const inline = imgPart && (imgPart.inlineData || imgPart.inline_data);
      if (!inline) return fail('gemini-image', 'no image in response');
      return { ok: true, providerId: 'gemini-image', image: `data:${inline.mimeType || inline.mime_type};base64,${inline.data}` };
    } catch (e) { return fail('gemini-image', e); }
  },
};

// ---------- local-image (Automatic1111 stable-diffusion-webui) ----------
const localImage = {
  id: 'local-image', label: 'Local Stable Diffusion (Automatic1111 API)', needsKey: false,
  defaultBaseUrl: 'http://127.0.0.1:7860',
  fields: [{ key: 'baseUrl', type: 'url', required: false }],
  async generate(cfg, { prompt, images }, opts = {}) {
    const fetchImpl = getFetch(opts);
    if (!fetchImpl) return fail('local-image', 'fetch is not available in this environment');
    const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
    const hasRef = images && images.length;
    const path = hasRef ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img';
    const body = { prompt, steps: 20 };
    if (hasRef) body.init_images = images.map((d) => { const p = parseDataUrl(d); return p ? p.base64 : d; });
    try {
      const { res } = await timedFetch(fetchImpl, `${baseUrl}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }, 120000);
      if (!res.ok) return fail('local-image', await readErrorText(res));
      const data = await res.json();
      const img = data.images && data.images[0];
      if (!img) return fail('local-image', 'no image in response');
      return { ok: true, providerId: 'local-image', image: asDataURL(img) };
    } catch (e) { return fail('local-image', e); }
  },
};

// ---------- comfyui (ComfyUI local node-graph server) ----------
function comfyRandomId() {
  return 'bs-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
async function blobToDataURL(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${blob.type || 'image/png'};base64,${btoa(bin)}`;
}
// One hardcoded ComfyUI API-format workflow graph — the same default
// checkpoint -> CLIP -> KSampler -> VAEDecode -> SaveImage chain ComfyUI's
// own examples ship, with `ckpt_name`/the two CLIPTextEncode prompts filled
// in at request time. Node ids are arbitrary strings, only the internal
// [nodeId, outputSlot] links matter.
function buildComfyWorkflow({ ckptName, prompt, seed }) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckptName } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed, steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1,
        model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'berrystudio' } },
  };
}
const comfyui = {
  id: 'comfyui', label: 'ComfyUI (local)', needsKey: false,
  defaultBaseUrl: 'http://127.0.0.1:8188',
  fields: [{ key: 'baseUrl', type: 'url', required: false }],
  async test(cfg, opts = {}) {
    const fetchImpl = getFetch(opts);
    if (!fetchImpl) return { ok: false, message: 'fetch is not available in this environment' };
    const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
    try {
      const { res, latencyMs } = await timedFetch(fetchImpl, `${baseUrl}/system_stats`, {}, 10000);
      if (!res.ok) return { ok: false, message: await readErrorText(res) };
      const stats = await res.json();
      const ver = (stats.system && stats.system.comfyui_version) || 'unknown version';
      const vram = stats.devices && stats.devices[0] && stats.devices[0].vram_total;
      return { ok: true, message: `Connected — ComfyUI ${ver}${vram ? `, ${Math.round(vram / 1e9)}GB VRAM` : ''}`, latencyMs };
    } catch (e) { return { ok: false, message: (e && e.message) || String(e) }; }
  },
  async generate(cfg, { prompt }, opts = {}) {
    const fetchImpl = getFetch(opts);
    if (!fetchImpl) return fail('comfyui', 'fetch is not available in this environment');
    const baseUrl = cfg.baseUrl || this.defaultBaseUrl;
    // Overridable only so tests don't spend real wall-clock time on
    // ComfyUI's poll interval — production callers never pass these.
    const pollIntervalMs = opts.pollIntervalMs || 1500;
    const pollTimeoutMs = opts.pollTimeoutMs || 120000;
    try {
      // Never guess a checkpoint filename — ask the running instance what's
      // actually installed, exactly like `object_info` is meant for.
      const { res: infoRes } = await timedFetch(fetchImpl, `${baseUrl}/object_info/CheckpointLoaderSimple`, {}, 15000);
      if (!infoRes.ok) return fail('comfyui', await readErrorText(infoRes));
      const info = await infoRes.json();
      const ckpts = info && info.CheckpointLoaderSimple && info.CheckpointLoaderSimple.input &&
        info.CheckpointLoaderSimple.input.required && info.CheckpointLoaderSimple.input.required.ckpt_name &&
        info.CheckpointLoaderSimple.input.required.ckpt_name[0];
      if (!Array.isArray(ckpts) || !ckpts.length) {
        return fail('comfyui', 'no checkpoint model installed on this ComfyUI instance — install one first (models/checkpoints)');
      }
      const clientId = comfyRandomId();
      const workflow = buildComfyWorkflow({ ckptName: ckpts[0], prompt, seed: Math.floor(Math.random() * 1e9) });
      const { res: submitRes } = await timedFetch(fetchImpl, `${baseUrl}/prompt`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      }, 15000);
      if (!submitRes.ok) return fail('comfyui', await readErrorText(submitRes));
      const submitted = await submitRes.json();
      const promptId = submitted.prompt_id;
      if (!promptId) return fail('comfyui', (submitted.node_errors && JSON.stringify(submitted.node_errors)) || 'ComfyUI did not return a prompt_id');

      // Poll /history — ComfyUI has no long-poll/webhook option on this
      // endpoint, so a short interval poll is the documented way to wait
      // for a queued prompt to finish rendering.
      const deadline = Date.now() + pollTimeoutMs;
      let output = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        const { res: histRes } = await timedFetch(fetchImpl, `${baseUrl}/history/${promptId}`, {}, 10000);
        if (!histRes.ok) continue;
        const hist = await histRes.json();
        const entry = hist && hist[promptId];
        if (entry && entry.outputs) { output = entry.outputs; break; }
      }
      if (!output) return fail('comfyui', 'timed out waiting for ComfyUI to finish rendering');
      const saveNode = Object.values(output).find((n) => Array.isArray(n.images) && n.images.length);
      const img = saveNode && saveNode.images[0];
      if (!img) return fail('comfyui', 'ComfyUI finished but returned no image');
      const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
      const { res: viewRes } = await timedFetch(fetchImpl, viewUrl, {}, 30000);
      if (!viewRes.ok) return fail('comfyui', await readErrorText(viewRes));
      const image = await blobToDataURL(await viewRes.blob());
      return { ok: true, providerId: 'comfyui', image };
    } catch (e) { return fail('comfyui', e); }
  },
};

export const ImageProviders = { proxy, 'openai-images': openaiImages, 'gemini-image': geminiImage, 'local-image': localImage, comfyui };
export const IMAGE_PROVIDER_IDS = Object.keys(ImageProviders);
export function getImageProvider(id) { return ImageProviders[id] || null; }
