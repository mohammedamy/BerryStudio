/* ============================================================
   Billboard — AI fashion billboard + pattern-drawing generator.

   Ported from a ComfyUI workflow (api_openai_fashion_billboard_generator.json)
   built around OpenAI's multi-image gpt-image editing endpoint:
     1) dress a model in 1-2 real clothing photos → editorial "billboard" photo
     2) feed that photo back in → an AI-drawn pattern with cm measurements

   BerryStudio-Upgrade-Plan WP-4 folded this into the same provider-adapter
   layer js/ai-spec-pipeline.js uses for text — generateBillboard()/
   generatePattern() no longer talk HTTP themselves, they just build the
   right prompt and hand it to whichever image-generation adapter the
   caller resolved (js/image-providers.js: the original user-deployed-proxy
   contract stays available, plus direct-with-your-own-key OpenAI/Gemini,
   plus a local Stable Diffusion option), keeping this module's job scoped
   to "what prompt do we send," not "how do we send it."
   ============================================================ */
export const Billboard = (() => {
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

  // Step 1 (node 3 + 26 → 24 → 2): dress a model in 1-2 source clothing
  // photos. `adapter`/`cfg` come from js/image-providers.js, resolved by
  // the caller (js/app.js) from state.aiImageProvider — same pattern as
  // the text/vision provider layer.
  async function generateBillboard({ adapter, cfg, images, model }) {
    if (!adapter) throw new Error("no image provider configured");
    const imgs = (images || []).filter(Boolean);
    if (!imgs.length) throw new Error("no source images");
    const r = await adapter.generate(cfg, { prompt: DRESS_PROMPT, images: imgs, model });
    if (!r.ok) throw new Error(r.error || "generation failed");
    return r.image;
  }

  // Step 2 (node 24 output → 25 → 16): derive a measured pattern drawing
  // from the billboard photo generated in step 1.
  async function generatePattern({ adapter, cfg, image, sizeLabel, model }) {
    if (!adapter) throw new Error("no image provider configured");
    if (!image) throw new Error("no billboard image");
    const r = await adapter.generate(cfg, { prompt: patternPrompt(sizeLabel), images: [image], model });
    if (!r.ok) throw new Error(r.error || "generation failed");
    return r.image;
  }

  return { DEFAULT_MODEL, DRESS_PROMPT, patternPrompt, generateBillboard, generatePattern };
})();
// TEMP compat alias for one release — see BerryStudio-Upgrade-Plan WP-0.1.
if (typeof window !== 'undefined') window.Billboard = Billboard;
