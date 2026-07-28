/* ============================================================
   Spec-first generation pipeline — BerryStudio-Upgrade-Plan WP-3.

   Replaces js/ai.js's `remote()` as the "ask an AI provider" path inside
   generate() — but remote() itself is NOT deleted, it survives as the
   `proxy` adapter's transport (js/ai-providers.js). This module is what
   actually changes: instead of trusting a provider to hand back
   ready-to-use pieces or a style object, it asks for a PatternSpecV1 JSON
   object (schema/pattern-spec.v1.json), validates it, and only then feeds
   it through the SAME deterministic engine (AIGen.build()) and validator
   (PatternValidator.run()) every other generation path already uses:

     prompt (+ measurements, category, locale)
       -> adapter.complete({system, messages, schema: PatternSpecV1})
       -> PatternSpecValidator.validate(json)      <- reject & retry once
       -> clamp *F factors into AIGen's own safe ranges
       -> AIGen.build(spec, measurements)          <- existing drafter, untouched
       -> PatternValidator.run(pieces, {})         <- WP-0.4, untouched
       -> attributes() with a provenance chip per field

   If validation fails twice, or the provider fails outright, or a
   configured provider is a bare no-op (e.g. the `proxy` adapter with no
   endpoint set), this returns { fellBack:true, fallbackReason } instead of
   ever handing back partially-validated data — the caller (js/app.js's
   runAI()) is responsible for then running today's local heuristic path
   and surfacing that fallback honestly in the UI. This is what "never
   silently show a broken pattern" means in practice.

   The `proxy` adapter is a special case: it doesn't understand this
   schema-first protocol at all (there's no reference implementation for a
   text-generation proxy in this repo, only for the image-generation
   billboard proxy) — its complete() returns today's exact {pieces}/{style}
   shape, tagged with a `legacy` marker (see js/ai-providers.js). This
   pipeline detects that marker and routes straight to the same handling
   js/ai.js's old remote() used to do, WITHOUT ever attempting schema
   validation against output the proxy was never asked to produce — this
   is the concrete mechanism that keeps existing proxy deployments working
   unchanged (BerryStudio-Upgrade-Plan acceptance criterion: byte-for-byte
   compatible with server/billboard-proxy-style deployments).

   Honesty note: schema/pattern-spec.v1.json has no colour/fabric field —
   Phase 0's schema simply doesn't carry that information yet. Spec-driven
   generation therefore always falls back to AIGen.build()'s own default
   palette; a real colour comes only from the local pixel-analysis path
   (js/ai-fusion.js, WP-4) or a future schema version. Not faked here.
   ============================================================ */
import { AIGen } from './ai.js';
import { PatternSpecValidator } from './schema-validate.js';
import { PatternValidator } from './validate.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (typeof v === 'number' && !Number.isNaN(v)) ? v : d;

// schema/pattern-spec.v1.json's "off-shoulder" (hyphenated) vs. AIGen's own
// internal "offshoulder" (no hyphen, see js/ai.js necklinePts()) — the only
// vocabulary mismatch between the two; every other enum lines up exactly.
const NECKLINE_MAP = { 'off-shoulder': 'offshoulder' };
function mapNeckline(n) { return n ? (NECKLINE_MAP[n] || n) : null; }

// schema/pattern-spec.v1.json's provenance.source enum (user | llm-inferred
// | default) vs. the UI-facing vocabulary js/ai.js's attributes()/the
// "Detected" panel already use elsewhere (spec | user-override | heuristic
// | pixel | vision | prompt) — this is the one place that translates
// between them.
const PROVENANCE_SOURCE_MAP = { 'llm-inferred': 'spec', user: 'user-override', default: 'heuristic' };

// The established convention (schema/examples/*.pattern-spec.json,
// BerryStudio-Upgrade-Plan WP-0.3) is a dotted path into the spec object,
// e.g. "silhouette.flareF" — but js/ai.js's attributes() chips key off
// short UI names ("flare", "neckline", "sleeve"...). This maps the former
// to the latter; a field with no UI chip (e.g. "silhouette.fitF", which
// has no dedicated chip today) simply produces no provenance tag, rather
// than a guessed one.
const PROVENANCE_FIELD_MAP = {
  'garment.type': 'type', 'garment.closure': 'closure',
  'silhouette.lengthF': 'length', 'silhouette.flareF': 'flare',
  'construction.neckline': 'neckline', 'construction.hem': 'hem',
  'construction.sleeve.lengthF': 'sleeve', 'construction.sleeve.widthF': 'sleeve',
};

// ---------- system prompt ("drafting brief") ----------
// Reused verbatim as few-shot examples — kept in sync with this file
// rather than fetched from schema/examples/*.json at generation time, so
// the prompt never depends on a network round-trip beyond the actual
// provider call itself.
const FEW_SHOT_EXAMPLES = [
  {
    prompt: 'a fitted red v-neck dress with short sleeves, knee length',
    spec: {
      specVersion: '1',
      garment: { type: 'dress', category: 'women', closure: 'none' },
      silhouette: { lengthF: 0.85, flareF: 0.95, fitF: 0.85 },
      construction: { neckline: 'v', necklineDepthF: 0.3, sleeve: { kind: 'set-in', lengthF: 0.45, widthF: 1.0 }, hem: 'straight', seams: ['shoulder', 'side'] },
      pieces: [
        { id: 'bodice-front', role: 'bodice-front', cutOnFold: true, quantity: 1, grainline: 'straight', edges: [{ id: 'e-shoulder', seamId: 's-shoulder' }] },
        { id: 'bodice-back', role: 'bodice-back', cutOnFold: true, quantity: 1, grainline: 'straight', edges: [{ id: 'e-shoulder', seamId: 's-shoulder' }] },
        { id: 'sleeve', role: 'sleeve', cutOnFold: false, quantity: 2, grainline: 'straight' },
      ],
      seams: [{ id: 's-shoulder', a: 'bodice-front/e-shoulder', b: 'bodice-back/e-shoulder' }],
      provenance: [
        { field: 'garment.type', source: 'llm-inferred', confidence: 0.95 },
        { field: 'construction.neckline', source: 'llm-inferred', confidence: 0.9 },
        { field: 'silhouette.lengthF', source: 'llm-inferred', confidence: 0.75 },
      ],
    },
  },
  {
    prompt: 'a loose linen shirt with long sleeves and a collar, for men',
    spec: {
      specVersion: '1',
      garment: { type: 'shirt', category: 'men', closure: 'button' },
      silhouette: { lengthF: 1.0, flareF: 1.1, fitF: 1.15 },
      construction: { neckline: 'collar', sleeve: { kind: 'set-in', lengthF: 1.3, widthF: 1.1 }, hem: 'straight', seams: ['shoulder', 'side'] },
      pieces: [
        { id: 'bodice-front', role: 'bodice-front', cutOnFold: false, quantity: 1, grainline: 'straight' },
        { id: 'bodice-back', role: 'bodice-back', cutOnFold: true, quantity: 1, grainline: 'straight' },
        { id: 'sleeve', role: 'sleeve', cutOnFold: false, quantity: 2, grainline: 'straight' },
        { id: 'collar', role: 'collar', cutOnFold: false, quantity: 1, grainline: 'straight' },
      ],
      seams: [],
      provenance: [
        { field: 'garment.type', source: 'llm-inferred', confidence: 0.97 },
        { field: 'silhouette.fitF', source: 'llm-inferred', confidence: 0.8 },
      ],
    },
  },
];

export function buildSystemPrompt(category, lang) {
  const localeNote = lang === 'ar'
    ? 'اشرح تفكيرك بإيجاز داخليًا إذا لزم الأمر، لكن يجب أن تحتوي الرسالة النهائية على كائن JSON فقط — بدون نص إضافي ولا حدود ```.'
    : 'Reason briefly to yourself if it helps, but the final message must contain ONLY the JSON object — no prose, no markdown fence.';
  return [
    'You are a patternmaking assistant for BerryStudio. Given a natural-language garment description, emit ONE JSON object matching the provided JSON Schema (specVersion "1") — never raw polygon coordinates, never freeform prose.',
    '',
    `Garment category for this request: ${category || 'women'}. All measurements the drafting engine uses are in CENTIMETERS.`,
    '',
    'Schema field vocabulary (use exactly these values — never invent a new enum value):',
    '- garment.type: dress | top | shirt | skirt | trousers | robe',
    '- garment.category: women | men | girls | boys',
    '- garment.closure: none | button | zip | wrap | tie',
    '- construction.neckline: v | round | boat | off-shoulder | halter | collar',
    '- construction.sleeve.kind: none | set-in | raglan | two-piece',
    '- construction.hem: straight | curved | highlow | asymmetric',
    '- pieces[].role: bodice-front | bodice-back | skirt-front | skirt-back | sleeve | collar | cuff | facing | waistband | yoke | pocket | lining | other',
    '- pieces[].grainline: straight | cross | bias',
    '',
    "Silhouette factors are multipliers on the engine's own base measurements, not absolute lengths:",
    "- silhouette.lengthF (0-3): 1.0 = the category's standard garment length; ~0.6-0.85 = short/mini; ~1.1-1.35 = long/maxi.",
    '- silhouette.flareF (0-3): 1.0 = straight; >1.25 = flared/A-line; <0.92 = fitted/slim.',
    '- silhouette.fitF (0-3): 1.0 = regular ease; <0.85 = fitted/tailored; >1.15 = loose/relaxed.',
    '- construction.sleeve.lengthF (0-3): 0 = sleeveless; ~0.45 = short; ~0.8 = three-quarter; ~1.3 = long.',
    '- construction.sleeve.widthF (0-3): 1.0 = regular; >1.4 = wide/puffed.',
    '',
    'Before emitting JSON, briefly reason (to yourself, not in the output) about ease — how much room this silhouette needs beyond the body measurements — and drape — how the flare/fit factors should interact for the described fabric or style — then output the final spec.',
    'Every piece must declare a role, cutOnFold, quantity, and grainline. Populate `pieces` with at least a front and back bodice/panel appropriate for the garment type, plus any sleeves/collar/waistband the description implies.',
    'Add a `provenance` entry for every field you inferred rather than copied verbatim from the prompt, with source "llm-inferred" and an honest confidence between 0 and 1 — never claim confidence 1.0 for a guess. Use a dotted path for `field` (e.g. "garment.type", "silhouette.flareF", "construction.neckline"), matching the field\'s actual location in the JSON you emit.',
    localeNote,
    '',
    'Two examples:',
    ...FEW_SHOT_EXAMPLES.flatMap((ex, i) => [`Example ${i + 1} prompt: "${ex.prompt}"`, `Example ${i + 1} JSON: ${JSON.stringify(ex.spec)}`]),
  ].join('\n');
}

function summarizeErrors(errors) {
  return (errors || []).slice(0, 6).map((e) => `${e.path}: ${e.message}`).join('; ');
}

export function specToStyle(spec) {
  const g = spec.garment || {}, sil = spec.silhouette || {}, con = spec.construction || {}, sleeve = con.sleeve || {};
  return {
    type: g.type || 'dress',
    lengthF: clamp(num(sil.lengthF, 1), 0.55, 1.6),
    flareF: clamp(num(sil.flareF, 1), 0.82, 1.9),
    fitF: clamp(num(sil.fitF, 1), 0.72, 1.28),
    sleeveLenF: clamp(num(sleeve.lengthF, 1), 0, 1.5),
    sleeveWideF: clamp(num(sleeve.widthF, 1), 0.8, 2),
    neckline: mapNeckline(con.neckline),
    hemShape: con.hem || null,
    wrap: g.closure === 'wrap',
    color: null, twoTone: false, colorHem: null,
  };
}

export function provenanceMapFromSpec(spec) {
  const out = {};
  (spec.provenance || []).forEach((p) => {
    const uiKey = PROVENANCE_FIELD_MAP[p.field];
    if (!uiKey) return; // a real dotted-path field with no corresponding UI chip today — not guessed at
    out[uiKey] = { source: PROVENANCE_SOURCE_MAP[p.source] || 'spec', confidence: p.confidence };
  });
  return out;
}

function fromLegacyResult(json, measurements, lang) {
  if (json.legacy === 'pieces') {
    return { pieces: json.pieces, colors: json.colors || undefined, colorInt: null, summary: json.summary || '', source: 'remote' };
  }
  const style = { ...AIGen.deriveStyle({ metrics: null, prompt: '', category: undefined, imageDataURL: null }), ...json.style };
  const built = AIGen.build(style, measurements);
  return { ...built, summary: json.summary || AIGen.summary(style, lang), style, source: 'remote', attributes: AIGen.attributes(style, lang) };
}

// ---------- main pipeline ----------
// `adapter`/`cfg` come from js/ai-providers.js (resolved by the caller —
// this module never touches KeyStore/DOM/fetch directly, which is what
// makes it testable with a plain mock adapter, see test/ai-spec-pipeline.test.js).
// `schema` is the raw schema/pattern-spec.v1.json object (fetched once by
// the caller) — needed because adapter.complete() passes it to the
// PROVIDER's own structured-output mechanism, not just to the local
// validator.
export async function generateFromSpec({ adapter, cfg, prompt, measurements, category, lang, schema, images }) {
  const system = buildSystemPrompt(category, lang);
  const messages = [{ role: 'user', content: prompt }];

  let res;
  try { res = await adapter.complete(cfg, { system, messages, images, schema, kind: 'text' }); }
  catch (e) { return { fellBack: true, fallbackReason: String((e && e.message) || e) }; }

  if (!res.ok) return { fellBack: true, fallbackReason: res.error };
  if (res.json && res.json.legacy) return fromLegacyResult(res.json, measurements, lang);
  if (!res.json) return { fellBack: true, fallbackReason: 'the provider did not return structured JSON output' };

  let spec = res.json;
  let { valid, errors } = PatternSpecValidator.validate(spec);
  if (!valid) {
    const retryMessages = [
      ...messages,
      { role: 'assistant', content: JSON.stringify(spec) },
      { role: 'user', content: `That JSON failed schema validation: ${summarizeErrors(errors)}. Return corrected JSON only, matching the schema exactly.` },
    ];
    let res2;
    try { res2 = await adapter.complete(cfg, { system, messages: retryMessages, images, schema, kind: 'text' }); }
    catch (e) { return { fellBack: true, fallbackReason: String((e && e.message) || e) }; }
    if (!res2.ok || !res2.json) return { fellBack: true, fallbackReason: (res2 && res2.error) || 'retry did not return structured JSON output' };
    const retryValidation = PatternSpecValidator.validate(res2.json);
    if (!retryValidation.valid) return { fellBack: true, fallbackReason: `validation failed twice: ${summarizeErrors(retryValidation.errors)}` };
    spec = res2.json;
  }

  const style = specToStyle(spec);
  const built = AIGen.build(style, measurements);
  const provenance = provenanceMapFromSpec(spec);
  const attrs = AIGen.attributes(style, lang, provenance);
  const validation = PatternValidator.run(built.pieces, {});

  return { ...built, summary: AIGen.summary(style, lang), style, attributes: attrs, source: 'spec', spec, validation };
}
