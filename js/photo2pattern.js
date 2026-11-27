/* ============================================================
   Photo-to-Pattern ONNX Bridge — BerryStudio Colab GPU Pipeline.

   Pure, DOM-free helpers (directly testable via `node --test`) for:
     1) Converting a 224x224 RGBA ImageData buffer into an ImageNet-
        normalized CHW Float32Array tensor [1, 3, 224, 224] matching
        `berrystudio_photo2pattern_v1.onnx` (`garment_image` input).
     2) Mapping the model's 12-D sigmoid output (`pattern_params_12d`)
        into a valid `AIGen.build()` style object + provenance map.
   ============================================================ */

export const PHOTO2PATTERN_INPUT_SIZE = 224;

const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Resizes an arbitrary { width, height, data: Uint8ClampedArray } RGBA buffer
 * into an ImageNet-normalized [1, 3, 224, 224] CHW Float32Array.
 * Works in both main thread and Worker without needing OffscreenCanvas.
 */
export function rgbaToOnnxCHW224(pixels, srcW, srcH) {
  const dst = PHOTO2PATTERN_INPUT_SIZE;
  const hw = dst * dst;
  const out = new Float32Array(3 * hw);
  if (!pixels || !srcW || !srcH) return out;

  for (let y = 0; y < dst; y++) {
    const sy = Math.min(srcH - 1, Math.floor(((y + 0.5) * srcH) / dst));
    for (let x = 0; x < dst; x++) {
      const sx = Math.min(srcW - 1, Math.floor(((x + 0.5) * srcW) / dst));
      const srcIdx = (sy * srcW + sx) * 4;
      const dstIdx = y * dst + x;

      const r = pixels[srcIdx] / 255;
      const g = pixels[srcIdx + 1] / 255;
      const b = pixels[srcIdx + 2] / 255;

      out[dstIdx] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
      out[hw + dstIdx] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
      out[2 * hw + dstIdx] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
    }
  }
  return out;
}

/**
 * Maps `pattern_params_12d` [0..1] output from `berrystudio_photo2pattern_v1.onnx`
 * onto BerryStudio's `AIGen.build(style, measurements)` contract.
 *
 * 12-D index layout (see berrystudio_ai_manifest.json):
 *   0: panel_complexity
 *   1: lengthF
 *   2: flareF
 *   3: fitF
 *   4: has_sleeve
 *   5: sleeveLenF
 *   6: sleeveWideF
 *   7: has_skirt
 *   8: has_trouser_legs
 *   9: has_collar_or_yoke
 *  10: curvature_density
 *  11: seam_complexity
 */
export function mapOnnx12dToStyle(vec12, baseStyle = {}) {
  if (!vec12 || vec12.length < 12) return { style: { ...baseStyle }, provenance: {} };

  const [
    panelComplexity, rawLength, rawFlare, rawFit,
    hasSleeve, rawSleeveLen, rawSleeveWide,
    hasSkirt, hasPants, hasCollar,
    curvatureDensity, seamComplexity,
  ] = vec12;

  let type = baseStyle.type || 'dress';
  if (hasPants > 0.52) {
    type = panelComplexity > 0.32 ? 'romper' : 'trousers';
  } else if (hasSkirt > 0.50) {
    type = rawLength > 0.52 || panelComplexity > 0.38 ? 'dress' : 'skirt';
  } else {
    type = hasCollar > 0.55 ? 'shirt' : 'top';
  }

  // Map normalized [0..1] predictions into AIGen.build()'s exact safe factor ranges
  const lengthF = +clamp(0.55 + rawLength * 1.05, 0.55, 1.60).toFixed(3);
  const flareF = +clamp(0.82 + rawFlare * 1.08, 0.82, 1.90).toFixed(3);
  const fitF = +clamp(0.80 + rawFit * 0.45, 0.80, 1.25).toFixed(3);

  const sleeveActive = hasSleeve > 0.45;
  const sleeveLenF = sleeveActive ? +clamp(0.25 + rawSleeveLen * 1.15, 0.25, 1.50).toFixed(3) : 0;
  const sleeveWideF = sleeveActive ? +clamp(0.85 + rawSleeveWide * 0.85, 0.80, 1.80).toFixed(3) : 1.0;

  let neckline = baseStyle.neckline || 'round';
  if (hasCollar > 0.55) neckline = 'collar';
  else if (curvatureDensity > 0.55) neckline = 'v';
  else if (seamComplexity > 0.45) neckline = 'boat';

  const hemShape = rawFlare > 0.55 ? 'curved' : (baseStyle.hemShape || 'straight');
  const wrap = seamComplexity > 0.65 ? true : !!baseStyle.wrap;

  const style = {
    ...baseStyle,
    type,
    lengthF,
    flareF,
    fitF,
    sleeveLenF,
    sleeveWideF,
    neckline,
    hemShape,
    wrap,
  };

  const provenance = {
    type: { source: 'vision', confidence: +Math.max(hasPants, hasSkirt, 1 - hasSkirt * 0.5).toFixed(2) },
    length: { source: 'vision', confidence: null },
    flare: { source: 'vision', confidence: null },
    sleeve: { source: 'vision', confidence: +Math.abs(hasSleeve - 0.5).toFixed(2) },
    neckline: { source: 'vision', confidence: null },
    hem: { source: 'vision', confidence: null },
  };

  return { style, provenance };
}
