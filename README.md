# BerryStudio · بيري ستوديو

A bilingual (Arabic + English), installable **Progressive Web App** for fashion
pattern **drafting, grading, 3D preview, and print/export**. No build step, no
framework runtime — pure HTML/CSS/JS so it opens and runs anywhere.

![theme: Egyptian / Saudi / International](https://img.shields.io/badge/themes-3%20%C3%97%20light%2Fdark-6d5efc)

---

## Run it

Because it registers a service worker, serve it over `http://` (not `file://`):

```bash
# from the repository root
python3 -m http.server 8791
# open http://localhost:8791
```

Then use the browser's **Install app** action (or the ⬇ button in the header) to
install it. After the first load it works **fully offline**.

---

## What's implemented

| Area | Status |
|------|--------|
| Bilingual EN/AR with one-click switch + **complete RTL** | ✅ Fully working |
| 3 themes (Egyptian · Saudi · International) × Light/Dark | ✅ Fully working |
| Pattern canvas: zoom/pan, grid, rulers (cm/inch), snap | ✅ Fully working |
| Seam allowance, notches, grainlines, darts, bilingual piece labels | ✅ Fully working |
| Vector tools: Select, Pen, Line, **Arc (curved, 3-click)**, Freehand, **Filled Shape (closed polygon)**, Move, Measure | ✅ Working (draw & edit) |
| Transform tools: Rotate, Scale, Knife (split), Symmetry (mirror), Notch, Grainline | ✅ Fully working on real geometry |
| **Undo / Redo buttons** on the stage toolbar (above the canvas), synced with Layers & 3D | ✅ Working |
| Selection **control points + handles** (drag anchors, corner scale, rotate knob) | ✅ Fully working, with snap-to-point |
| Layers: **add / delete / rename (EN+AR)**, per-layer **properties** (colour, own fill opacity), **lock/unlock**, show/hide | ✅ Working (locked pieces are non-interactive) |
| **Text tool** — place formatted labels (size, bold, italic, colour), drag to move, double-click to edit; included in SVG export & project files | ✅ Working |
| **Help** — ? button with quick start, all tools explained, keyboard shortcuts (bilingual) | ✅ Working |
| **Fabric & material**: 8 material presets, per-piece colour, **per-part 3D material** (bodice/sleeve/skirt/trousers) + adjustable fill transparency | ✅ Working |
| **Illustrated body-measurement diagram** — a numbered reference figure in the Measures pane showing where each of the 11 measurements is taken | ✅ Working (collapsible, EN/AR) |
| **Create Marker** — client-side bounding-box nesting of pattern pieces onto a virtual fabric roll (width/length/rotation/min-spacing), with a layout preview and real computed yardage | ✅ Working (simplified box-packing, not true polygon nesting — see Honest notes) |
| **Size & Grading engine** XXS→6XL, Intl/Egyptian/Saudi, Kids, Custom | ✅ Proportion-perfect, live |
| Category switcher (Women/Men/Girls/Boys) with matching avatar | ✅ Working |
| Real multi-piece patterns w/ bilingual names + explanations | ✅ 6 patterns (dress, shirt, abaya, thobe, girls' dress, boys' trousers) |
| **3D preview** — 4 distinct anatomical avatars (women/men/girl/boy), studio lighting + soft shadow, OrbitControls (orbit/zoom/pan, touch), auto-spin, walk cycle, live fabric material/colour/transparency, per-piece show/hide, size grading, loading state | ✅ Working (stylised character; drop-in GLB path for photoreal) |
| **Project menu**: New · Import (.json) · Export SVG/DXF · Save PDF · Save Project · Print | ✅ Working (real SVG, DXF, PDF & print) |
| Print & Export: A0–A4/Letter/Plotter, PDF/DXF/SVG/AI/PNG/JPEG/HPGL | ✅ SVG, DXF, PDF are native; PNG/JPEG/AI/HPGL fall back to vector |
| Fabric consumption + cost estimator + Tech Pack + BOM | ✅ Working (uses your last Create Marker nest if you've made one, else a height-based estimate) |
| **Pattern Summary export** — one-page bilingual print sheet: size table, a labelled dimensioned diagram per piece, and a construction note (Export pane, Project menu, ⌘K) | ✅ Working |
| **Pattern Library — 124 pre-designed patterns, 31 per category** (Women/Men/Girls/Boys), category filter chips + search + "My Patterns" | ✅ Working — every entry is a real, gradable multi-piece garment |
| **Fancy Collection — 24 elaborate designs, 6 per category**: gowns, tailored jackets/coats, a three-piece suit, sherwanis and parkas — each with 8–10 real pattern pieces (princess seams, godets, capes, tiers, two-piece sleeves, lapels, hoods) and genuinely curved seams | ✅ Working — curves are bezier-sampled into the pattern outline, not straight polygon corners |
| **Construction tools** — real drafting Point/Line/Arc/Circle tools that snap to and stay live-linked to named points, "Create Pattern Piece" to promote a closed point loop into a real piece, custom parametric **Variables** (named formulas referencing other variables and body measurements, reusable in any point's X/Y), and a trace-over **background reference image** with two-point calibration | ✅ Working — points/lines/arcs re-resolve automatically when you grade/resize |
| AI Pattern Generator — visible "thinking" stages, robust local image analysis (neckline/hem/flare/colour from a real photo, not just a clean product shot), a wider construction vocabulary (necklines, hem shapes, wrap closures), and a "Detected" attributes panel (with source + confidence, click-to-override) so you can see what actually mattered | ✅ Working (offline heuristic by default; bring your own AI provider in Settings — see below) |
| **Bring Your Own AI** (Settings → AI Provider) — 8 text/vision adapters (Anthropic, OpenAI, Gemini, OpenAI-compatible, Ollama, LM Studio, llama.cpp/vLLM, your own proxy) with per-provider key/URL/model fields, Fetch Models, and Test Connection with real error text | ✅ Working — sessionStorage-only keys by default, optional encrypted persistent storage, strict CSP |
| **Local model support** — Route A (local server via Ollama/LM Studio/llama.cpp/vLLM) is fully working; Route C (Hugging Face model ID, in-browser WebGPU/WASM) loads via a lazy Web Worker; a Capability Probe badges WebGPU readiness | ⚠️ Route A working; Route C structurally implemented, not live-tested with a real multi-hundred-MB model download this pass; Route B (local file picker) not wired up yet — see Honest notes |
| **Spec-first generation** — prompt → schema-validated `PatternSpecV1` JSON → the same deterministic `AIGen.build()`/Check Pattern pipeline every other path uses, with one validate-and-retry pass and an honest fallback to the offline heuristic on failure | ✅ Working |
| **Vision fusion** — when an image is supplied to a configured provider, the vision-informed spec is authoritative for garment type/neckline/closure; the existing pixel-analysis heuristic stays authoritative for length/flare/hem/colour | ✅ Working |
| **AI Fashion Billboard, BYO-key** (Settings → AI Provider → Image generation) — OpenAI images, Gemini image, a local Stable Diffusion (Automatic1111) backend, plus the original proxy contract, unchanged | ✅ Working — proxy option is byte-for-byte compatible with existing `server/billboard-proxy/worker.js` deployments |
| **Quick Draft builder** — pick a garment kind (Dress/Top/Shirt/Skirt/Trousers/Robe/Gown/Jacket/Coat/Suit), see only the measurements that kind actually needs, adjust Length/Flare/Fit/Sleeve, and produce real pattern pieces | ✅ Working — measurement edits here are a local draft override and don't touch your working Measures/Auto Grade |
| **Object Browser** — a docked panel listing every Point/Construction Line/Arc/Circle/Piece/Text with live counts and a name filter; click a row to jump the canvas to it | ✅ Working |
| **Snapshot** — freeze the pattern's current state as a translucent ghost layer (opacity/show/remove) to visually compare later edits against | ✅ Working |
| Command palette (⌘/Ctrl-K), tooltips + global Hover-Help toggle | ✅ Working |
| Onboarding, toasts, high-contrast, reduce-motion, local-first storage | ✅ Working |
| PWA manifest + service worker (offline, installable) | ✅ Working |
| **ES modules** — `js/*.js` are real `import`/`export` modules (was: 9 classic IIFE scripts sharing sibling browser scope) | ✅ Working (`window.X` globals kept as a temporary compat layer — see Honest notes) |
| **Pattern Spec schema** (`schema/pattern-spec.v1.json`) — a declarative JSON Schema for future AI-generated garments | ✅ Schema + validator defined (not yet wired into the AI generator — see Honest notes) |
| **Check Pattern validator** (`js/validate.js`, Export pane / ⌘K) — 8 patternmaking checks: closed outline, self-intersection, grainline, seam-allowance offset, cut-on-fold symmetry, seam-length parity, notch alignment, ease | ✅ 5 full-confidence, 2 heuristic, 1 deferred (see Honest notes) |
| **3D Cloth Lab** ("3D Cloth Lab" tab) — real-time GPU cloth simulation (strain-limited structural + bend + self-collision + body collision) of your actual pattern, with fabric presets (mass/stiffness/anisotropy/PBR sheen-transmission), an avatar matching your measurements (FFD-deformed if you supply a GLB), 6 pose variants, 6 skin tones, and GLB/OBJ/USDZ/turntable export | ✅ Working — princess seams, gores, capes, hoods, tiers and other Fancy Collection shapes import as connected garments, not disjoint pieces (see Honest notes) |
| **Cloth Lab engine** (Settings → 3D Cloth Lab engine) — "Iframe" (default) runs Cloth Lab as a separate embedded app; "Embedded" mounts it directly into this page instead, sharing this page's own React/Three.js so it starts faster and updates instantly | ⚠️ Both working; "Embedded" is newer and still being rolled out as the default |
| **BodyForm** (`body.html`, standalone) — build a 3D avatar from measurements alone (no pattern needed), export it, or "Open in Fit Studio" to carry the category/measurements into the main app's 3D Cloth Lab | ✅ Working |

### Honest notes
- **Fancy Collection** (`js/fancy-patterns.js`) pieces are hand-authored, not run
  through the AI builder — each design's princess seams, lapels, godets, hoods and
  tiers are real geometry built with quadratic/cubic bezier curves sampled into the
  pattern outline (so seams read as genuinely curved, not straight polygon corners).
  Proportions come from heuristic ratios of the body measurements (in the same style
  as the hand-crafted `PATTERNS` in `js/data.js`), not couture drafting-book formulas —
  treat these as realistic *design* references to grade and export, not
  seam-allowance-exact sewing patterns ready for a cutting table.
- **AI generator** (`js/ai.js`) segments the uploaded photo with a
  border-adaptive threshold + largest-contiguous-run-per-row scan (robust to
  background clutter, not just clean product shots on white), then reads
  neckline shape from an actual **neckline-gap detection** (a V/scoop neck
  shows as a break of skin/background between two shoulder lobes in a worn
  photo — a pointed silhouette edge doesn't, and treating it as one was the
  earlier bug), hem shape from the bottom profile, and colour from small
  patches at the torso/hem centroids rather than a global average. Construction
  vocabulary now includes neckline (V/round/boat/off-shoulder/halter/collar),
  hem shape (straight/curved/high-low/asymmetric) and wrap closures — so two
  different photos produce genuinely different pattern pieces, not just
  resized copies of the same template. Attributes left unspecified by both the
  prompt and the image are chosen by a deterministic hash of the input (same
  input → same result, but different prompts/images land on different
  choices) instead of always defaulting the same way. Generation runs through
  a visible multi-stage sequence (analysing → silhouette/hem → drafting) and
  ends with a "Detected" chip panel — Type, Length, Flare, Sleeve, Neckline,
  Hem, Colour — so you can see exactly what was read from your input. It's
  still a heuristic, not real computer vision, and will misread low-contrast
  or very busy photos on its own; configure a real AI provider in Settings →
  AI Provider (see "Bring Your Own AI" below) to fuse this with actual vision
  understanding instead.
- **Construction tools** are real associative CAD drafting: lines/arcs/circles
  reference points by ID, not frozen coordinates, so dragging a point (or
  changing it to a formula that references a Variable or a body measurement)
  updates everything built on it — including after Auto Grade. **"Create
  Pattern Piece" is a one-time snapshot**, not a live link: once you promote a
  closed point loop into a piece, it becomes an independent, editable shape —
  moving the original construction points afterwards no longer reshapes it
  (the same way cutting fabric from a paper draft freezes the shape at that
  moment). Points, lines, arcs, circles, Variables and the background trace
  image are drafting scaffolding: they render on the 2D canvas and round-trip
  through Undo/Redo, but are intentionally excluded from SVG/DXF/PDF export
  and from the 3D preview — only promoted pattern pieces (and text labels)
  export, matching how a real patternmaker's construction lines never leave
  the drafting table.
- **Per-part 3D material** assigns a material to a 2D piece (Layers → piece properties →
  Material), but the procedural 3D avatar only has 4 mesh groups — bodice, sleeve, skirt,
  trousers — so two 2D pieces that map to the same part (e.g. Front Bodice and Back
  Bodice) share one 3D material (whichever visible piece for that part was set last
  wins). The 2D canvas itself still shows true per-piece colour and material.
- **Create Marker** packs each piece's rectangular bounding box onto shelves (a
  shelf/first-fit-decreasing-height heuristic), rotating by 0°/90° when "Any" rotation
  is allowed — it does **not** slide and interlock the true cut outlines the way
  professional nesting software does, so the yardage is a good real estimate, not a
  millimetre-exact cutting layout. The preview is explicitly labelled as a simplified
  box approximation for this reason.
- **Snapshot** is a single frozen ghost, not a multi-version history — freezing again
  replaces the previous ghost. It's meant for "compare my current edit against the
  version I started from," not an undo tree (Undo/Redo already covers step-by-step
  history within a session).
- **Object Browser** is a read-only inspection + jump-to-focus panel in this release —
  it doesn't rename/delete objects itself (use the existing point editor, Layers pane,
  or text editor for that).
- **SVG, DXF and PDF** exports are native and CAD/print-ready (the PDF is a
  hand-built, valid PDF-1.4 with vector cutting lines). PNG/JPEG/AI/HPGL still
  fall back to the vector output — the natural next integration points.
- **Projects** round-trip losslessly via `Save Project (.json)` → `Import Project`.
- **3D avatars** are high-quality *procedural stylised* characters (not photoreal
  humans — that needs sculpted, rigged GLB models an in-browser script can't
  synthesise). For photorealism, open **Settings → 3D avatar models (GLB)** and
  paste a model URL per category (e.g. a Ready Player Me link ending in `.glb`) —
  no code needed. The loader auto-scales the model to the live measurements and
  falls back to the built-in body if the URL fails. Local files work too: drop
  them in the repo (e.g. `avatars/women.glb`) and paste that relative path.
- Three.js + OrbitControls load from a CDN (via an import map) on first visit,
  then are cached for offline use.
- **3D Cloth Lab**'s cloth solver uses a distance-based hinge/fold spring for
  bend resistance (not a true dihedral-angle constraint) and brute-force
  O(N²) self-collision (not a GPU spatial hash) — both deliberate, documented
  trade-offs matched to this app's particle counts, not oversights. Fabric
  `structStiff`/`bendStiff` values are tuned "feel" sliders, not
  Kawabata-instrument-calibrated SI values. Seams weld at mesh-build time
  (no gradual sewing ramp-in) — a garment can show a brief pop at the seam
  on the very first frame after a pattern change, not during normal wear.
- **3D Cloth Lab pose variants** (Standing/A-pose/T-pose/Contrapposto/Seated/
  Walk): all six work on the built-in procedural avatar. On a loaded GLB
  avatar, Seated's knee bend derives "forward" from the character's own hip
  bones, which works for any exporter's bone-axis convention but is
  ambiguous by 180° — an unlucky third-party rig can end up seated facing
  backward. Walk only animates a GLB that ships its own embedded walk/idle
  clip; the procedural avatar has no skeleton to animate and stays standing
  for Walk. Whichever pose is displayed, simulated cloth always collides
  against the standing arms-down body — a seated body's garment drape isn't
  re-simulated for the new pose.
- **VRM avatar files** (a common photoreal-avatar format) are detected and
  shown an honest "not supported yet" message rather than mis-positioned —
  full VRM humanoid-bone retargeting is a separate spec from the Mixamo/
  Ready Player Me bone-name convention this app parses, and wasn't built.
- **USDZ export** (3D Cloth Lab → Export) produces a structurally valid file
  with no runtime errors, but hasn't been confirmed to open correctly in
  Apple Quick Look on real iOS hardware — no device was available to test
  with. GLB/OBJ export, PNG-sequence turntables, and MP4/WebM turntable
  recording are all confirmed working. GIF export isn't offered — every
  JS GIF encoder is a new dependency this project avoids; use the
  MP4/WebM/PNG-sequence export and convert externally if you need a GIF.
- **BodyForm** (`body.html`) and the 3D Cloth Lab's "Embedded" engine both
  share React/Three.js with the main page via an import map — this needs a
  real browser environment with dynamic `import()` support; some headless
  browser-automation tools have been observed to fail resolving import-map
  entries in a dynamic `import()` call even though the map itself is
  correctly present (confirmed not a bug in this app by reproducing the
  identical check in real Chromium, where it passes) — if you hit "Failed
  to resolve module specifier" only inside an automation tool, it's the
  tool, not this app.
- **ES modules**: every root `js/*.js` file now has real `export`s and the files
  that need them have real `import`s, replacing the previous "9 classic scripts
  sharing one browser lexical scope" pattern. Every exported symbol also still
  gets a `window.X = X` compat alias for one release, per the working rule of
  not breaking anything mid-transition — these are genuinely temporary and
  should be removed once nothing outside the module graph needs them. One
  side effect worth knowing: those symbols (`AIGen`, `PATTERNS`, `Canvas`,
  etc.) are now real `window` properties for the first time — they weren't
  before, since classic-script sibling scope isn't the same as `window`.
  Every module added in Phase 1 (`js/ai-providers.js`, `js/ai-keystore.js`,
  and the rest of the BYO-AI layer) is consumed only via real `import`s and
  deliberately does **not** get a `window.X` alias — that compat layer was
  specifically for the original 9-file conversion, not a standing
  convention for new code.
- **Pattern Spec schema** (`schema/pattern-spec.v1.json`) defines a declarative
  garment description (silhouette, construction, pieces, seam pairing,
  provenance), validated by `js/schema-validate.js` — `npm test` includes a
  round-trip check against one valid and one intentionally invalid fixture.
  The validator itself (`js/vendor/pattern-spec-validate.generated.js`) is
  ajv's precompiled "standalone code" output rather than a runtime ajv build:
  an early version vendored ajv v6's UMD runtime and called `ajv.compile()`
  directly, but that generates each validator with `new Function(...)` at
  call time, which is blocked by this app's CSP (no `'unsafe-eval'` in
  `script-src` — see the CSP note below). Precompiling offline (see
  `js/vendor/README.md`, regenerate with `scripts/generate-schema-validator.mjs`)
  produces a plain function with zero runtime code generation, which works
  under the strict CSP with no compromise.
- **Check Pattern** (`js/validate.js`) runs 8 patternmaking checks, but only 5
  of them (closed outline, self-intersection, grainline angle, seam-allowance
  offset validity, cut-on-fold symmetry) can be verified from a single piece's
  own geometry with full confidence. **Seam-length parity** and **notch
  alignment** need to know which piece's edges correspond to which other
  piece's — data that doesn't exist anywhere in the current pattern library
  (confirmed via a repo-wide search for any seam-pairing structure) — so those
  two reuse the same closed-world front/back name-matching heuristic Cloth
  Lab's importer already uses (`cloth-lab/src/pattern/importFromApp.js`), and
  are labelled "Heuristic" in the report: a piece with no plausible front/back
  counterpart is flagged as unpairable, never guessed at. Running it over the
  full pattern library on its first pass genuinely found real issues, not
  hypothetical ones — 30 Fancy Collection pieces have a duplicate consecutive
  point in their outline (a likely bezier-sampling boundary bug in
  `js/fancy-patterns.js`, not yet fixed here) and a consistent ~5mm
  front/back "side length" delta across many catalogue garments that most
  likely reflects an intentionally deeper front neckline rather than a real
  defect — exactly the kind of result a *heuristic* check is supposed to
  produce: a lead for a human to judge, not a verified fact. **Ease**
  (finished chest vs. body chest + minimum ease) is not implemented at all —
  it would need a second, unverifiable heuristic on top of the first (which
  edge is the chest measurement) — this is left as a documented gap rather
  than faked.
- **Bring Your Own AI** (`js/ai-providers.js`, `js/ai-keystore.js`, Settings →
  AI Provider): API keys default to `sessionStorage` (cleared when the tab
  closes) and never enter `state`/the `localStorage["pps"]` blob at all —
  they're only ever resolved from the keystore at call time. Turning on
  "Remember this key on this device" requires a passphrase and encrypts the
  key with WebCrypto (PBKDF2, 250k iterations, SHA-256 → AES-GCM) before it
  touches `localStorage`; the derived key lives in memory only and a fresh
  page load always re-prompts. This app ships a real CSP (`index.html`'s
  `<meta>` tag — no `'unsafe-eval'`, a `connect-src` allow-list) for the
  first time. One deliberate, documented trade-off: `openai-compatible`/
  `llamacpp`/`vllm` let you type an arbitrary base URL at runtime, and a
  `<meta>` CSP is fixed at parse time — it can't be expanded per-session — so
  `connect-src` is broadened to `https:` + `http(s)://localhost:*` rather
  than a short named list, or those adapters simply couldn't work at all.
  "Test connection" always shows the adapter's real error text (e.g. an
  actual `401 invalid x-api-key`), never a generic failure — confirmed
  against the live Anthropic API during this work.
- **Local model support** (`js/capability-probe.js`,
  `js/workers/local-model-worker.js`): Route A (a local Ollama/LM
  Studio/llama.cpp/vLLM server) is just the corresponding text adapters and
  is fully working, CORS command included verbatim in the UI. Route C
  (a Hugging Face model ID, run in-browser) lazily spins up a Web Worker
  that dynamically `import()`s `@huggingface/transformers` from a CDN only
  the first time it's used — never at app load, never in the service
  worker's precache list. It is real, working code, not a stub, but this
  pass did not download and run a genuine multi-hundred-megabyte model in
  the browser end-to-end (impractical to verify repeatedly in this
  environment) — treat it as structurally verified, not fully
  field-tested. **Route B (pick a local `.onnx`/`.gguf` file) is honestly
  not wired up** — GGUF isn't supported by the in-browser runtime at all,
  and `.onnx` needs an IndexedDB/OPFS + `onnxruntime-web` `InferenceSession`
  path that doesn't exist yet; picking either file type today returns a
  clear "not supported, use a local server instead" message rather than a
  silent failure.
- **Spec-first generation** (`js/ai-spec-pipeline.js`): a configured
  provider is asked for a `PatternSpecV1` object (schema/pattern-spec.v1.json),
  validated once, retried once with the validator's own error text on
  failure, and — if it's still invalid — the UI falls back to the offline
  heuristic and says so in a toast rather than ever rendering unvalidated
  output. The schema has no colour/fabric field today, so a spec-driven
  generation always uses `AIGen.build()`'s default palette; real colour
  still comes from the pixel-analysis path. The `proxy` adapter doesn't
  understand this schema at all (no server anywhere implements it) — its
  legacy `{pieces}`/`{style}` response is detected and routed straight to
  the pre-Phase-1 handling, unchanged, rather than validated against a
  schema it was never asked to produce.
- **Vision fusion** (`js/ai-fusion.js`): not a rewrite of the existing pixel
  heuristic — a thin overlay above it. When an image is supplied to a
  configured provider, the spec's own vision-informed reads for garment
  type/neckline/closure win; length, flare, hem shape and colour stay
  exactly what the existing `analyzeImage()` heuristic already computes,
  because a model's own numeric guess for those fields is not more
  trustworthy than a geometric read. Pixel-sourced attribute chips show
  `confidence: null` honestly (no real confidence score exists for that
  path) rather than a fabricated number. Every "Detected" chip with a known
  correction handler is click-to-override; an override always shows as
  "your edit," never misattributed to the AI.
- **AI Fashion Billboard folding** (`js/image-providers.js`): the original
  proxy contract (`{prompt, images, model}` → `{image}`) is preserved
  byte-for-byte — confirmed by a test asserting the exact request shape —
  so existing `server/billboard-proxy/worker.js` deployments keep working
  with zero server-side changes. Of the three realistic local image-gen
  backends, only Automatic1111's documented REST API is implemented this
  pass (the simplest well-documented contract); ComfyUI's node-graph API in
  particular is substantially more complex and is left as future work, not
  silently claimed done.
- **Deferred, not dropped** (documented here rather than left unmentioned):
  a "draft program" generation mode against the associative point/line/arc
  system (the plan's own stretch goal beyond spec-first generation), and
  replacing the pixel-analysis threshold scan with a real segmentation
  model (RMBG-1.4/U²-Net/SAM-tiny) running on the same Route B/C worker
  infrastructure — both are natural extensions of what's shipped here, not
  started this pass.

---

## Structure

```
BerryStudio/                (repository root)
├── index.html            App shell — loads js/*.js as real ES modules, real CSP
├── manifest.webmanifest  PWA manifest
├── sw.js                 Service worker (offline-first)
├── css/styles.css        Design system: 3 themes × light/dark, full RTL
├── js/
│   ├── i18n.js           EN + Egyptian/Saudi Arabic dictionaries
│   ├── data.js           Measurement standards + grading engine + patterns
│   ├── canvas.js         2D drafting engine (Canvas 2D)
│   ├── three-view.js     3D parametric avatar (Three.js)
│   ├── ai.js             Image/prompt → style params + parametric garment builder
│   ├── billboard.js      AI Fashion Billboard prompt templates (image-gen provider dispatch)
│   ├── library.js        100-pattern catalog (25/category), built on ai.js's builder
│   ├── fancy-patterns.js 24 hand-crafted 8+ piece designs (6/category) with bezier-curved seams
│   ├── validate.js       Check Pattern — 8 patternmaking checks over any piece set
│   ├── schema-validate.js  Validator for schema/pattern-spec.v1.json (precompiled, CSP-safe)
│   ├── ai-keystore.js    BYO-AI key storage: sessionStorage default, opt-in WebCrypto encryption
│   ├── ai-providers.js   Text/vision provider adapters (Anthropic/OpenAI/Gemini/Ollama/…)
│   ├── image-providers.js  Image-generation provider adapters (OpenAI images/Gemini/local SD/proxy)
│   ├── ai-spec-pipeline.js  Spec-first generation: prompt → schema-validated spec → AIGen.build()
│   ├── ai-fusion.js      Vision + pixel-analysis fusion for image-driven generation
│   ├── capability-probe.js  WebGPU readiness probe for in-browser local models
│   ├── workers/local-model-worker.js  Lazy Web Worker running a Hugging Face model in-browser
│   ├── vendor/           Generated/vendored files (pattern-spec-validate.generated.js) — see its own README
│   └── app.js            Application controller (wires everything)
├── schema/               Pattern Spec JSON Schema + example fixtures (see Honest notes)
├── scripts/              Dev-only tooling (schema validator codegen)
├── test/                 node --test unit tests for the root app (`npm test`)
├── e2e/                  Playwright smoke + AI settings specs (`npm run test:e2e`)
└── icons/                App icons (SVG + PNG 192/512)
```

### Development

The shipped app itself is still build-free — `npm`/`package.json` here are
dev/test tooling only, never referenced by `index.html`:

```bash
npm install && npm test        # root unit tests (node --test)
npm run test:e2e               # Playwright smoke + AI settings specs
cd cloth-lab && npm test        # cloth-lab's own vitest unit tests
```

If you ever change `schema/pattern-spec.v1.json`, regenerate its precompiled
validator (`ajv` is a dev-only code-generation tool, never a runtime
dependency of the shipped app — see `js/vendor/README.md`):

```bash
npm install --no-save ajv
node scripts/generate-schema-validator.mjs
```

## Extending

- **Add a hand-crafted pattern:** add a parametric entry to `PATTERNS` in
  `js/data.js` (each piece is a function of the measurement set) and list it
  in `LIBRARY`.
- **Add a library pattern:** add one `entry(id, category, nameEn, nameAr, style)`
  line to the matching catalog array in `js/library.js` — `style` is the same
  `{type, lengthF, flareF, fitF, sleeveLenF, sleeveWideF}` shape the AI
  generator uses, so geometry comes for free from `AIGen.build()`.
- **Add a language:** add a dictionary to `I18N` in `js/i18n.js`.
- **Tune grading:** edit `BASE`, `GRADE`, and `STANDARDS` in `js/data.js`.
