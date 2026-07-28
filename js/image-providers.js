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
     contract of the realistic options) — ComfyUI/SD.next are NOT
     implemented here (ComfyUI's node-graph API in particular is
     substantially more complex); documented as future work, not silently
     claimed done.
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

export const ImageProviders = { proxy, 'openai-images': openaiImages, 'gemini-image': geminiImage, 'local-image': localImage };
export const IMAGE_PROVIDER_IDS = Object.keys(ImageProviders);
export function getImageProvider(id) { return ImageProviders[id] || null; }
