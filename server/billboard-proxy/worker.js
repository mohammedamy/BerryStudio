/**
 * BerryStudio — AI Fashion Billboard proxy (Cloudflare Worker reference).
 *
 * Holds your OpenAI API key server-side and forwards image-generation
 * requests from js/billboard.js. The browser never sees OPENAI_API_KEY —
 * see README.md in this folder for deploy instructions.
 *
 * Request  (POST JSON, sent by js/billboard.js):
 *   { prompt: string, images: string[] (1-2 data URLs), model?: string }
 * Response:
 *   { image: string (data URL) }   or   { error: string }
 *
 * Honesty note: this targets OpenAI's documented gpt-image-1 /v1/images/edits
 * shape (multipart form, repeated `image[]` fields for multi-image input,
 * size/quality enums). The source ComfyUI workflow this was ported from
 * specifies model "gpt-image-2" — if that's a newer model with a different
 * request shape, adjust buildForm() below to match its actual docs.
 */

const ALLOWED_ORIGINS = [
  "https://mohammedamy.github.io",
  "http://localhost:4173",
  "http://localhost:8791",
];
const DEFAULT_MODEL = "gpt-image-2";
const IMAGE_SIZE = "1024x1024";    // must be one of OpenAI's fixed size enums
const IMAGE_QUALITY = "low";       // low | medium | high | auto

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
    if (request.method !== "POST") return json({ error: "POST only" }, 405, origin);
    if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured on the server" }, 500, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid JSON body" }, 400, origin); }
    const { prompt, images, model } = body || {};
    if (!prompt || !Array.isArray(images) || !images.length) {
      return json({ error: "prompt and at least one image are required" }, 400, origin);
    }
    if (images.length > 2) return json({ error: "at most 2 images" }, 400, origin);

    let openaiRes;
    try {
      openaiRes = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: await buildForm({ prompt, images, model }),
      });
    } catch (e) {
      return json({ error: "could not reach OpenAI: " + e.message }, 502, origin);
    }
    if (!openaiRes.ok) {
      const text = await openaiRes.text().catch(() => "");
      return json({ error: `OpenAI returned ${openaiRes.status}: ${text.slice(0, 500)}` }, 502, origin);
    }
    const data = await openaiRes.json();
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) return json({ error: "OpenAI response had no image" }, 502, origin);
    return json({ image: `data:image/png;base64,${b64}` }, 200, origin);
  },
};

async function buildForm({ prompt, images, model }) {
  const form = new FormData();
  form.append("model", model || DEFAULT_MODEL);
  form.append("prompt", prompt);
  form.append("size", IMAGE_SIZE);
  form.append("quality", IMAGE_QUALITY);
  form.append("n", "1");
  for (let i = 0; i < images.length; i++) {
    form.append("image[]", await dataURLToBlob(images[i]), `image${i}.png`);
  }
  return form;
}

// fetch() natively decodes data: URLs into a Response — the simplest way to
// get a Blob out of one without hand-rolling base64 decoding in a Worker.
async function dataURLToBlob(dataURL) {
  const res = await fetch(dataURL);
  return res.blob();
}

function corsHeaders(origin) {
  // NOTE this only stops *browser* cross-origin calls — anyone with the
  // worker URL can still call it directly (curl, another server) regardless
  // of this check. See README.md "Locking it down further" before relying
  // on this alone.
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}
