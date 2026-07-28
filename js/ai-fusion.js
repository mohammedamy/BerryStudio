/* ============================================================
   Vision fusion — BerryStudio-Upgrade-Plan WP-4.

   Does NOT replace or rewrite js/ai.js's deriveStyle() — that function
   already implements a real prompt-regex > pixel-metrics > seeded-
   deterministic cascade for length/flare/fit/hem/colour, and stays exactly
   as it is. This module is a thin overlay ABOVE it: for the specific
   fields a vision model is genuinely better at than a silhouette pixel
   scan (garment type/class, neckline, sleeve presence, wrap closure), it
   takes the WP-3 spec-first pipeline's already-vision-informed answer
   (the image was passed to the provider — see js/ai-spec-pipeline.js);
   for everything the existing pixel analysis is better at (continuous
   length/flare ratios, hem profile, dominant colour), it keeps
   deriveStyle()'s own numbers untouched.

   | Field                                    | Authoritative source        |
   |-------------------------------------------|------------------------------|
   | type, neckline, sleeveless-or-not, wrap    | vision (the spec pipeline)   |
   | lengthF, flareF, fitF, hemShape, colour    | pixel (deriveStyle, as-is)   |
   | anything neither resolves                  | deriveStyle's own fallback   |

   Honesty note: pixel analysis (js/ai.js's analyzeImage()) has no natural
   confidence score — fused fields sourced from it get `confidence: null`
   rather than a fabricated number. Vision-sourced fields get whatever
   confidence the model itself reported in the spec's provenance array, if
   any; a fixed placeholder is not invented here either.
   ============================================================ */

// Fields a vision-informed spec is treated as authoritative for. Everything
// else in `promptStyle` (produced by AIGen.deriveStyle() against the SAME
// prompt + pixel metrics) is left completely untouched.
const VISION_FIELDS = ['type', 'neckline', 'wrap'];

export function fuseStyle({ specStyle, promptStyle }) {
  if (!specStyle) return { style: promptStyle, sourceMap: {} };

  const fused = { ...promptStyle };
  const sourceMap = {};

  VISION_FIELDS.forEach((k) => {
    if (specStyle[k] != null) { fused[k] = specStyle[k]; sourceMap[fieldToChipKey(k)] = { source: 'vision' }; }
  });
  // Sleeve *presence* (sleeveless vs. not) is a structural read a vision
  // model handles well; the actual length/width MAGNITUDE stays whatever
  // the pixel/prompt cascade already computed — a spec's own guessed
  // sleeveLenF number is not more trustworthy than the geometric read.
  if (specStyle.sleeveLenF === 0 && promptStyle.sleeveLenF !== 0) {
    fused.sleeveLenF = 0; sourceMap.sleeve = { source: 'vision' };
  }

  ['length', 'flare', 'hem', 'color'].forEach((k) => { sourceMap[k] = { source: 'pixel', confidence: null }; });

  return { style: fused, sourceMap };
}

function fieldToChipKey(k) { return k === 'type' ? 'type' : k === 'neckline' ? 'neckline' : k === 'wrap' ? 'closure' : k; }

// Merges the fusion-level source tags (authoritative — reflects what this
// module actually decided) with the spec's own dotted-path provenance
// (js/ai-spec-pipeline.js's provenanceMapFromSpec()) for any chip the
// fusion step didn't already tag — so a fused generation's "Detected"
// panel is never missing a source it could honestly show.
export function mergeProvenance(fusionSourceMap, specProvenanceMap) {
  return { ...(specProvenanceMap || {}), ...(fusionSourceMap || {}) };
}
