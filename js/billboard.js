/* ============================================================
   Billboard — AI fashion billboard + pattern-drawing generator.

   Ported from a ComfyUI workflow (api_openai_fashion_billboard_generator.json)
   built around OpenAI's multi-image gpt-image editing endpoint:
     1) dress a model in 1-2 real clothing photos → editorial "billboard" photo
     2) feed that photo back in → an AI-drawn pattern with cm measurements

   Real photorealistic image generation can't run in a browser (no local
   model, and OpenAI's API key must never sit in client-side code — anyone
   opening devtools on the deployed site could read it straight out of the
   network tab). So exactly like AIGen's existing Claude-vision "AI endpoint"
   (see js/ai.js), this POSTs to a user-configured proxy URL (Settings → AI
   Image endpoint) that holds the real OpenAI key server-side. A ready-to-
   deploy example proxy lives in server/billboard-proxy/.

   Request sent to the proxy:  { prompt, images:[dataURL,...], model }
   Response expected back:     { image: dataURL }
   (also accepts a bare base64 string, {b64_json}, or a raw passthrough of
   OpenAI's own {data:[{b64_json}]} shape, so a minimal proxy that just
   forwards OpenAI's response works without any reshaping)
   ============================================================ */
const Billboard = (() => {
  const DEFAULT_MODEL = "gpt-image-2";

  // Verbatim from the ComfyUI export's node 24 ("OpenAI GPT Image 2") —
  // tuned fabric-preservation prompt, not something to casually reword.
  const DRESS_PROMPT = `dress a professional female model with the provided clothing items. Crucially, preserve ALL original material properties, textures, and fabric characteristics exactly as shown in the source clothing images.

Model requirements:
- Professional fashion model with natural, confident pose
- Casual yet elegant stance suitable for contemporary streetwear
- Natural facial expression, looking slightly away from camera
- Modern hairstyle, effortless and stylish

Critical fabric and material preservation:
- Maintain EXACT fabric textures from the source images (fleece, denim, cotton, etc.)
- Preserve the fuzzy, fluffy texture of the grey hoodie exactly as shown
- Keep original fabric sheen, matte finish, or glossiness unchanged
- Retain precise color values, saturation, and undertones of all garments
- Preserve fabric weight appearance (heavy fleece vs. light cotton)
- Maintain weave patterns, knit structures, and material densities
- Keep all surface details: pile height, fabric grain, textile characteristics
- Preserve stitching details, seam types, and construction elements

Clothing fit and draping:
- Fit the provided clothing naturally to the model's body while maintaining fabric properties
- Natural fabric behavior based on original material type (stiff denim vs. soft fleece)
- Realistic folds, wrinkles, and creases appropriate to each fabric type
- Proper layering with each garment's original thickness and volume
- Accurate shadows and highlights respecting original material reflectance

Technical requirements:
- Match lighting interaction with each fabric type from source images
- Preserve fabric subsurface scattering (especially for fleece/fuzzy materials)
- Maintain original color temperature and saturation of all garments
- Keep exact contrast levels between different fabric areas
- Professional fashion photography lighting showcasing material details
- Clean neutral background (white or light grey)
- High-resolution, editorial quality with sharp fabric texture detail
- Photorealistic rendering with microscopic attention to textile authenticity

Environment:
- Lighting should reveal fabric textures clearly
- Color-neutral lighting to preserve original garment colors
- Studio-quality illumination showing material properties accurately

Do not alter, enhance, or "improve" the fabric appearances. Transfer the exact material characteristics from the source clothing images to the dressed model. Preserve all design elements, logos, graphics, and details exactly as shown. No watermarks or additional text.`;

  // Adapted from node 25 — same idea, but the size is whatever the app is
  // currently graded to instead of a hardcoded "M".
  function patternPrompt(sizeLabel) {
    return `Draw the pattern to make this piece with all measurements accurate in cm for size ${sizeLabel || "M"}`;
  }

  // Accepts whatever shape the proxy hands back and normalises to a data URL.
  function extractImage(data) {
    if (!data) return null;
    if (typeof data === "string") return asDataURL(data);
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
    return "data:image/png;base64," + s;   // bare base64 → data URL
  }

  async function callProxy(endpoint, { prompt, images, model }) {
    const ctrl = new AbortController();
    // photorealistic multi-image generation is slow — give it real headroom
    const to = setTimeout(() => ctrl.abort(), 90000);
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, images, model: model || DEFAULT_MODEL }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("bad status " + res.status);
      const image = extractImage(await res.json());
      if (!image) throw new Error("no image in response");
      return image;
    } finally { clearTimeout(to); }
  }

  // Step 1 (node 3 + 26 → 24 → 2): dress a model in 1-2 source clothing photos.
  async function generateBillboard({ endpoint, images, model }) {
    if (!endpoint) throw new Error("no endpoint configured");
    const imgs = (images || []).filter(Boolean);
    if (!imgs.length) throw new Error("no source images");
    return callProxy(endpoint, { prompt: DRESS_PROMPT, images: imgs, model });
  }

  // Step 2 (node 24 output → 25 → 16): derive a measured pattern drawing
  // from the billboard photo generated in step 1.
  async function generatePattern({ endpoint, image, sizeLabel, model }) {
    if (!endpoint) throw new Error("no endpoint configured");
    if (!image) throw new Error("no billboard image");
    return callProxy(endpoint, { prompt: patternPrompt(sizeLabel), images: [image], model });
  }

  return { DEFAULT_MODEL, DRESS_PROMPT, patternPrompt, generateBillboard, generatePattern };
})();
