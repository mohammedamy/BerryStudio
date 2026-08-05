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

// Mirrors AIGen.build()'s own default palette (js/ai.js's DEFAULT_COLORS) —
// the schema has no colour field, measured/traced pieces have no colour
// concept either, and Canvas.setPattern() indexes into this array per piece.
const MEASURED_DEFAULT_COLORS = ['#6d5efc', '#00c2a8', '#ff5d8f', '#e2a52b', '#4c8dff', '#c1492e'];

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
  {
    prompt: 'a mock neck sleeveless zip romper, fitted, above-knee shorts',
    spec: {
      specVersion: '1',
      garment: { type: 'romper', category: 'women', closure: 'zip' },
      silhouette: { lengthF: 1.0, flareF: 1.0, fitF: 0.85 },
      construction: { neckline: 'mock', sleeve: { kind: 'none', lengthF: 0, widthF: 1.0 }, hem: 'straight', seams: ['waist', 'side'] },
      pieces: [
        { id: 'bodice-front', role: 'bodice-front', cutOnFold: true, quantity: 1, grainline: 'straight' },
        { id: 'bodice-back', role: 'bodice-back', cutOnFold: true, quantity: 1, grainline: 'straight' },
        { id: 'shorts-front', role: 'shorts-front', cutOnFold: false, quantity: 2, grainline: 'straight' },
        { id: 'shorts-back', role: 'shorts-back', cutOnFold: false, quantity: 2, grainline: 'straight' },
        { id: 'collar-stand', role: 'collar-stand', cutOnFold: false, quantity: 1, grainline: 'straight' },
        { id: 'zip-facing', role: 'placket-facing', cutOnFold: false, quantity: 2, grainline: 'straight' },
        { id: 'armhole-binding', role: 'other', cutOnFold: false, quantity: 2, grainline: 'bias' },
      ],
      seams: [],
      provenance: [
        { field: 'garment.type', source: 'llm-inferred', confidence: 0.95 },
        { field: 'construction.neckline', source: 'llm-inferred', confidence: 0.9 },
        { field: 'garment.closure', source: 'llm-inferred', confidence: 0.9 },
      ],
    },
  },
  {
    // Deliberately vague — no style words at all. This example exists to
    // demonstrate the "never leave silhouette/construction bland" rule in
    // buildSystemPrompt() below: even here, every factor still gets a real,
    // specific value (not a flat 1.0/omitted), just at LOWER provenance
    // confidence than a prompt that actually said "v-neck" or "a-line". A
    // model that copies this pattern stops producing an identical featureless
    // block dress for every under-specified request.
    prompt: 'something pretty for a summer garden party, nothing too fussy',
    spec: {
      specVersion: '1',
      garment: { type: 'dress', category: 'women', closure: 'none' },
      silhouette: { lengthF: 1.05, flareF: 1.3, fitF: 1.0 },
      construction: { neckline: 'v', sleeve: { kind: 'set-in', lengthF: 0.45, widthF: 1.0 }, hem: 'curved', seams: ['waist', 'side'] },
      pieces: [
        { id: 'bodice-front', role: 'bodice-front', cutOnFold: true, quantity: 1, grainline: 'straight' },
        { id: 'bodice-back', role: 'bodice-back', cutOnFold: true, quantity: 1, grainline: 'straight' },
        { id: 'sleeve', role: 'sleeve', cutOnFold: false, quantity: 2, grainline: 'straight' },
      ],
      seams: [],
      provenance: [
        { field: 'garment.type', source: 'llm-inferred', confidence: 0.6 },
        { field: 'silhouette.flareF', source: 'llm-inferred', confidence: 0.45 },
        { field: 'construction.neckline', source: 'llm-inferred', confidence: 0.4 },
        { field: 'construction.hem', source: 'llm-inferred', confidence: 0.4 },
      ],
    },
  },
  {
    // Lower-body-only garment: construction.neckline/sleeve genuinely don't
    // apply (there's nothing to guess), so they're correctly omitted
    // entirely rather than forced — see the "only for dress/top/shirt/robe/
    // romper" clause in buildSystemPrompt() below. silhouette is still
    // populated, because every garment type has SOME silhouette to state.
    prompt: "a girl's pleated A-line skirt, knee length",
    spec: {
      specVersion: '1',
      garment: { type: 'skirt', category: 'girls', closure: 'none' },
      silhouette: { lengthF: 1.0, flareF: 1.4, fitF: 1.0 },
      pieces: [
        { id: 'skirt-front', role: 'skirt-front', cutOnFold: true, quantity: 1, grainline: 'straight' },
        { id: 'skirt-back', role: 'skirt-back', cutOnFold: true, quantity: 1, grainline: 'straight' },
        { id: 'waistband', role: 'waistband', cutOnFold: false, quantity: 1, grainline: 'straight' },
      ],
      seams: [],
      provenance: [{ field: 'garment.type', source: 'llm-inferred', confidence: 0.95 }],
    },
  },
  {
    prompt: 'read the pattern pieces and measurements directly from this attached tech-pack image (a wrap skirt with a front panel and a waistband, with its own printed body-measurement table)',
    spec: {
      specVersion: '1',
      garment: { type: 'skirt', category: 'women', referenceMeasurementsCm: { chest: 88, waist: 70, hips: 96, backLen: 41, height: 167 } },
      pieces: [
        { id: 'skirt-front', role: 'skirt-front', cutOnFold: true, quantity: 1, grainline: 'straight',
          label: { en: 'Front Panel', ar: 'اللوحة الأمامية' },
          outlineCm: [[0, 0], [35, 0], [38, 60], [0, 60]] },
        { id: 'waistband', role: 'waistband', cutOnFold: false, quantity: 2, grainline: 'straight',
          outlineCm: [[0, 0], [74, 0], [74, 6], [0, 6]] },
      ],
      seams: [],
      provenance: [{ field: 'garment.type', source: 'llm-inferred', confidence: 0.9 }],
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
    '- garment.type: dress | top | shirt | skirt | trousers | robe | romper',
    '- garment.category: women | men | girls | boys',
    '- garment.closure: none | button | zip | wrap | tie',
    '- construction.neckline: v | round | boat | off-shoulder | halter | collar | mock',
    '- construction.sleeve.kind: none | set-in | raglan | two-piece',
    '- construction.hem: straight | curved | highlow | asymmetric',
    '- pieces[].role: bodice-front | bodice-back | skirt-front | skirt-back | shorts-front | shorts-back | sleeve | collar | collar-stand | cuff | facing | placket-facing | waistband | yoke | pocket | lining | other',
    '- pieces[].grainline: straight | cross | bias',
    '',
    '"romper" (also called a jumpsuit/playsuit) is a one-piece garment combining a fitted bodice with attached above-knee shorts, joined at a waist seam — always include shorts-front/shorts-back pieces for the lower half in addition to the bodice pieces. A "mock" neckline is a short, close-fitting standing band (not a fold-over collar) — pair it with a collar-stand piece. A "zip" closure implies a placket-facing piece stabilizing the opening.',
    '',
    'TWO different modes, depending on what the reference image actually is:',
    '1) A PHOTO of a worn garment, or a text-only description with no image: use the relative silhouette/construction factors below — you cannot read exact measurements off a photo, only relative proportions (longer/shorter, fuller/slimmer than the category standard).',
    "2) A TECHNICAL FLAT-SKETCH / tech-pack / spec-sheet image — one that shows individual pattern pieces as line drawings with printed dimension numbers and a body-measurement table (e.g. 'Front Bodice', 'Chest: 85', 'Length: 63') — READ THE ACTUAL NUMBERS off the diagram instead of guessing a style factor. For each piece whose shape and dimensions you can read, set `pieces[].outlineCm` to its traced outline as [x,y] corner coordinates in centimeters (start near a top corner, trace in one direction — clockwise or counterclockwise — using the printed widths/heights/curve depths as the coordinate deltas; a simple rectangle strip is 4 points, a tapered panel is as many corners as it visibly has). Give the piece a proper `label:{en,ar}` (e.g. 'Front Placket', not a generic role name). If the image prints its own body-measurement table (chest/waist/hips/height/etc.), copy those into `garment.referenceMeasurementsCm` so the traced piece gets correctly rescaled to the actual wearer instead of only ever fitting the reference sheet's own size. `silhouette`/`construction` factors are optional and ignored for any piece that has `outlineCm` — do not spend effort guessing them for a piece you already traced exactly.",
    '',
    "Silhouette factors (mode 1 only) are multipliers on the engine's own base measurements, not absolute lengths:",
    "- silhouette.lengthF (0-3): 1.0 = the category's standard garment length; ~0.6-0.85 = short/mini; ~1.1-1.35 = long/maxi.",
    '- silhouette.flareF (0-3): 1.0 = straight; >1.25 = flared/A-line; <0.92 = fitted/slim.',
    '- silhouette.fitF (0-3): 1.0 = regular ease; <0.85 = fitted/tailored; >1.15 = loose/relaxed.',
    '- construction.sleeve.lengthF (0-3): 0 = sleeveless; ~0.45 = short; ~0.8 = three-quarter; ~1.3 = long.',
    '- construction.sleeve.widthF (0-3): 1.0 = regular; >1.4 = wide/puffed.',
    '',
    'construction.neckline and construction.sleeve only apply to upper-body garments (dress, top, shirt, robe, romper) — omit both entirely for skirt/trousers, which have neither. silhouette still applies to every garment type.',
    '',
    // The single most important rule for output QUALITY (not just schema
    // validity): a spec that leaves silhouette/construction empty because
    // the prompt was generic drafts a bland, featureless block shape via
    // AIGen.build()'s own neutral defaults — every under-specified request
    // ends up looking identical. Examples 4 and 5 below both demonstrate
    // this: even a near-content-free prompt still gets a real, specific
    // silhouette/construction, just at lower provenance confidence.
    "CRITICAL — never leave a design undecided: unless every piece already carries `outlineCm` (mode 2), you MUST populate `silhouette.lengthF/flareF/fitF`, and — for upper-body garment types only — `construction.neckline`/`construction.hem`/`construction.sleeve`, with real, specific values reflecting ONE coherent, fashion-plausible garment. This applies even when the prompt gives you nothing to go on: pick a concrete, appropriate combination for the garment type and category standard (see example 4) rather than defaulting everything to a neutral 1.0 or omitting the fields — a bland block shape is a worse answer than a confident guess. Mark any field you had to guess outright with a genuinely LOW confidence (0.3-0.5) in provenance, and any field the prompt actually implied with a higher one — never omit the field just because confidence is low.",
    '',
    'Before emitting JSON, briefly reason (to yourself, not in the output) about ease — how much room this silhouette needs beyond the body measurements — and drape — how the flare/fit factors should interact for the described fabric or style — then output the final spec.',
    'Every piece must declare a role, cutOnFold, quantity, and grainline. Populate `pieces` with at least a front and back bodice/panel appropriate for the garment type, plus any sleeves/collar/waistband the description implies.',
    'Add a `provenance` entry for every field you inferred rather than copied verbatim from the prompt, with source "llm-inferred" and an honest confidence between 0 and 1 — never claim confidence 1.0 for a guess. Use a dotted path for `field` (e.g. "garment.type", "silhouette.flareF", "construction.neckline"), matching the field\'s actual location in the JSON you emit.',
    localeNote,
    '',
    `${FEW_SHOT_EXAMPLES.length} examples:`,
    ...FEW_SHOT_EXAMPLES.flatMap((ex, i) => [`Example ${i + 1} prompt: "${ex.prompt}"`, `Example ${i + 1} JSON: ${JSON.stringify(ex.spec)}`]),
  ].join('\n');
}

function summarizeErrors(errors) {
  return (errors || []).slice(0, 6).map((e) => `${e.path}: ${e.message}`).join('; ');
}

// Fallback option sets for a factor the provider left unset even after
// buildSystemPrompt()'s explicit "never leave this bland" instruction and
// generateFromSpec()'s bare-spec retry (below) — a real safety net for
// providers that don't reliably follow structured-output instructions
// (small local models via Ollama/LM Studio in particular), not the primary
// mechanism. AIGen.pick()/hashStr() give the SAME seed the SAME choice
// every time (same prompt -> same pattern) while still varying across
// different input — exactly js/ai.js's deriveStyle() philosophy, reused
// rather than reimplemented.
const FALLBACK_LEN = [0.85, 1.0, 1.1, 1.25];
const FALLBACK_FLARE = [0.9, 1.0, 1.25, 1.5];
const FALLBACK_FIT = [0.88, 1.0, 1.12];
const FALLBACK_HEM = ['straight', 'straight', 'curved', 'highlow'];

export function specToStyle(spec, seed) {
  const g = spec.garment || {}, sil = spec.silhouette || {}, con = spec.construction || {}, sleeve = con.sleeve || {};
  const type = g.type || 'dress';
  const sd = seed != null ? String(seed) : `${type}|${(spec.pieces || []).length}`;
  const has = (v) => v != null;
  return {
    type,
    // lengthF/flareF/fitF/hem are safe to default here — js/ai-fusion.js's
    // fuseStyle() never reads these off `specStyle` at all (length/flare/
    // fit/hem/colour there are always authoritative from the pixel/prompt
    // read, regardless of what the spec said), so a seeded guess here can
    // never masquerade as a "vision" read on the fused (image+prompt) path.
    lengthF: clamp(has(sil.lengthF) ? num(sil.lengthF, 1) : AIGen.pick(`${sd}|len`, FALLBACK_LEN), 0.55, 1.6),
    flareF: clamp(has(sil.flareF) ? num(sil.flareF, 1) : AIGen.pick(`${sd}|flare`, FALLBACK_FLARE), 0.82, 1.9),
    fitF: clamp(has(sil.fitF) ? num(sil.fitF, 1) : AIGen.pick(`${sd}|fit`, FALLBACK_FIT), 0.72, 1.28),
    // sleeveLenF/sleeveWideF stay flat-defaulted (unlike the three factors
    // above): js/ai-fusion.js's fuseStyle() DOES read `specStyle.sleeveLenF`
    // (specifically whether it's exactly 0, meaning "vision saw no
    // sleeves") — a seeded guess could land on 0 by chance and get read as
    // a false "the photo shows a sleeveless garment", which real pixel/
    // prompt evidence never said. Not worth that risk for this one field.
    sleeveLenF: clamp(num(sleeve.lengthF, 1), 0, 1.5),
    sleeveWideF: clamp(num(sleeve.widthF, 1), 0.8, 2),
    // neckline ALSO stays nullable here on purpose, for the same reason —
    // js/app.js's generatePatternFrom() reads `specStyle.neckline != null`
    // (via fuseStyle) as "the vision-informed spec actually said something"
    // and deliberately falls back to the prompt/pixel read otherwise; a
    // seeded guess here would make every fused generation's neckline look
    // vision-sourced even when the provider said nothing. The direct
    // (non-fused) path fills a seeded default itself — see
    // generateFromSpec() below, which is the one place that knows this
    // result will NOT be fused.
    neckline: mapNeckline(con.neckline),
    hemShape: con.hem || AIGen.pick(`${sd}|hem`, FALLBACK_HEM),
    wrap: g.closure === 'wrap',
    zip: g.closure === 'zip',
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

// A schema-VALID spec that still leaves silhouette/construction completely
// empty is the concrete shape of "the model didn't engage with the design
// at all" — buildSystemPrompt() now explicitly forbids this, but nothing
// stops a provider from ignoring that instruction while still emitting
// perfectly valid JSON (garment + a bare pieces array validates fine).
// Traced pieces (outlineCm) are a legitimate reason for both to be empty —
// see the schema's own honesty note — so those are never flagged. Skirts/
// trousers legitimately have no construction.neckline/sleeve either (see
// buildSystemPrompt()'s "only for upper-body garments" clause), so only
// silhouette is required for those; upper-body types need both.
const UPPER_BODY_TYPES = new Set(['dress', 'top', 'shirt', 'robe', 'romper']);
function isBareSpec(spec) {
  const hasMeasuredPieces = (spec.pieces || []).some((p) => Array.isArray(p.outlineCm) && p.outlineCm.length >= 3);
  if (hasMeasuredPieces) return false;
  const sil = spec.silhouette;
  const hasSilhouette = !!(sil && (sil.lengthF != null || sil.flareF != null || sil.fitF != null));
  if (!hasSilhouette) return true;
  const type = spec.garment && spec.garment.type;
  if (!UPPER_BODY_TYPES.has(type)) return false;
  const con = spec.construction || {};
  const hasConstruction = !!(con.neckline || con.hem || (con.sleeve && (con.sleeve.kind || con.sleeve.lengthF != null)));
  return !hasConstruction;
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
  // Mirrors js/ai.js's deriveStyle() seed convention — same prompt/category/
  // image reproduces the same "provider left this unset" fallback choice.
  const seed = `${prompt || ''}|${category || ''}|${images && images.length || 0}`;

  let res;
  try { res = await adapter.complete(cfg, { system, messages, images, schema, kind: 'text' }); }
  catch (e) { return { fellBack: true, fallbackReason: String((e && e.message) || e) }; }

  if (!res.ok) return { fellBack: true, fallbackReason: res.error };
  if (res.json && res.json.legacy) return fromLegacyResult(res.json, measurements, lang);
  if (!res.json) return { fellBack: true, fallbackReason: 'the provider did not return structured JSON output' };

  let spec = res.json;
  let convo = messages;
  let { valid, errors } = PatternSpecValidator.validate(spec);
  if (!valid) {
    convo = [
      ...messages,
      { role: 'assistant', content: JSON.stringify(spec) },
      { role: 'user', content: `That JSON failed schema validation: ${summarizeErrors(errors)}. Return corrected JSON only, matching the schema exactly.` },
    ];
    let res2;
    try { res2 = await adapter.complete(cfg, { system, messages: convo, images, schema, kind: 'text' }); }
    catch (e) { return { fellBack: true, fallbackReason: String((e && e.message) || e) }; }
    if (!res2.ok || !res2.json) return { fellBack: true, fallbackReason: (res2 && res2.error) || 'retry did not return structured JSON output' };
    const retryValidation = PatternSpecValidator.validate(res2.json);
    if (!retryValidation.valid) return { fellBack: true, fallbackReason: `validation failed twice: ${summarizeErrors(retryValidation.errors)}` };
    spec = res2.json;
    convo = [...convo, { role: 'assistant', content: JSON.stringify(spec) }];
  }

  // Schema-valid but substantively empty (see isBareSpec()'s own comment) —
  // give the provider one more chance with the actual complaint spelled
  // out, mirroring the schema-invalid retry above but for "technically
  // valid, nobody home" instead of "invalid JSON". A retry failure here
  // just keeps the original bare-but-valid spec rather than failing the
  // whole generation over what's ultimately a nice-to-have improvement —
  // specToStyle()'s own seeded fallback (above) still keeps the result from
  // being a flat, identical-every-time block shape either way.
  if (isBareSpec(spec)) {
    const retryMessages = [
      ...convo,
      { role: 'assistant', content: JSON.stringify(spec) },
      { role: 'user', content: 'That JSON is schema-valid but left silhouette (and, for an upper-body garment, construction) completely empty, which drafts a generic, featureless block shape instead of a real garment. Make an actual design decision: fill in silhouette.lengthF/flareF/fitF, and — if this is a dress/top/shirt/robe/romper — construction.neckline/hem/sleeve, with values reflecting one specific, coherent garment appropriate to the description (or the category standard, if the description is vague). Mark any field you had to guess with a low confidence (0.3-0.5) in provenance rather than leaving it out. Return corrected JSON only.' },
    ];
    let res2;
    try { res2 = await adapter.complete(cfg, { system, messages: retryMessages, images, schema, kind: 'text' }); }
    catch (e) { res2 = null; }
    if (res2 && res2.ok && res2.json && !res2.json.legacy) {
      const retryValidation = PatternSpecValidator.validate(res2.json);
      if (retryValidation.valid) spec = res2.json;
    }
  }

  const hasMeasuredPieces = (spec.pieces || []).some((p) => Array.isArray(p.outlineCm) && p.outlineCm.length >= 3);
  if (hasMeasuredPieces) {
    return finishMeasuredPieces({ adapter, cfg, system, convo, images, schema, spec, measurements, lang });
  }

  const style = specToStyle(spec, seed);
  const built = AIGen.build(style, measurements);
  const provenance = provenanceMapFromSpec(spec);
  const attrs = AIGen.attributes(style, lang, provenance);
  const validation = PatternValidator.run(built.pieces, {});

  return { ...built, summary: AIGen.summary(style, lang), style, attributes: attrs, source: 'spec', spec, validation };
}

// A tech-pack image's traced pieces (spec.pieces[].outlineCm) build real
// geometry directly instead of via style factors — see AIGen.buildFromMeasuredPieces().
// Literal LLM-traced coordinates are more failure-prone than the vetted
// style-factor path (a mistraced corner can self-intersect), so this gets
// its own one-time geometry-validation retry, feeding PatternValidator's
// actual failure messages back to the model — mirroring the schema-
// validation retry in generateFromSpec() but checking real geometry
// (self-intersection, closed outline, etc.) instead of JSON Schema shape.
async function finishMeasuredPieces({ adapter, cfg, system, convo, images, schema, spec, measurements, lang }) {
  let pieces = AIGen.buildFromMeasuredPieces(spec, measurements);
  let validation = PatternValidator.run(pieces, {});
  if (validation.summary.fail > 0) {
    const failMsgs = [];
    validation.perPiece.forEach((p) => Object.entries(p.checks).forEach(([k, r]) => { if (r.status === 'fail') failMsgs.push(`${p.label} ${k}: ${r.message}`); }));
    const retryReason = `traced piece geometry failed validation twice: ${failMsgs.slice(0, 3).join('; ')}`;
    const retryMessages = [
      ...convo,
      { role: 'user', content: `The traced piece outlines produced invalid geometry: ${failMsgs.slice(0, 6).join('; ')}. Return corrected JSON with fixed outlineCm coordinates (same schema), tracing the reference image's piece shapes more carefully.` },
    ];
    let res2;
    try { res2 = await adapter.complete(cfg, { system, messages: retryMessages, images, schema, kind: 'text' }); }
    catch (e) { return { fellBack: true, fallbackReason: String((e && e.message) || e) }; }
    if (!res2.ok || !res2.json || res2.json.legacy) return { fellBack: true, fallbackReason: retryReason };
    const retryValidation = PatternSpecValidator.validate(res2.json);
    if (!retryValidation.valid) return { fellBack: true, fallbackReason: retryReason };
    const pieces2 = AIGen.buildFromMeasuredPieces(res2.json, measurements);
    const validation2 = PatternValidator.run(pieces2, {});
    if (validation2.summary.fail > 0) return { fellBack: true, fallbackReason: retryReason };
    spec = res2.json; pieces = pieces2; validation = validation2;
  }
  const style = specToStyle(spec);
  const provenance = provenanceMapFromSpec(spec);
  const attrs = AIGen.attributes(style, lang, provenance);
  return {
    pieces, colors: MEASURED_DEFAULT_COLORS.slice(), colorInt: null,
    summary: AIGen.summary(style, lang), style, attributes: attrs,
    source: 'spec-measured', spec, validation,
  };
}
