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

**Full documentation** (bilingual, quick start / tool reference / keyboard
shortcuts / AI provider setup with exact CORS commands / 3D troubleshooting /
FAQ) lives at [`docs/`](docs/index.html) — also reachable from the book icon
in the app's own header.

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
| **Create Marker** — nest pattern pieces onto a virtual fabric roll (width/length/rotation/min-spacing), with a layout preview and real computed yardage. "Fast preview" (instant bounding-box packing) and "Full nest" (true polygon nesting — pieces interlock into each other's concave notches, run in a Web Worker with a real Stop/cancel) | ✅ Both modes working |
| **Size & Grading engine** XXS→6XL, Intl/Egyptian/Saudi, Kids, Custom | ✅ Proportion-perfect, live |
| Category switcher (Women/Men/Girls/Boys) with matching avatar | ✅ Working |
| Real multi-piece patterns w/ bilingual names + explanations | ✅ 6 patterns (dress, shirt, abaya, thobe, girls' dress, boys' trousers) |
| **3D preview** — 4 distinct anatomical avatars (women/men/girl/boy), studio lighting + soft shadow, OrbitControls (orbit/zoom/pan, touch), auto-spin, walk cycle, live fabric material/colour/transparency, per-piece show/hide, size grading, loading state | ✅ Working (stylised character; drop-in GLB path for photoreal) |
| **Project menu**: New · Import (.json) · Export SVG/DXF · Save PDF · Save Project · Print | ✅ Working (real SVG, DXF, PDF & print) |
| Print & Export: A0–A4/Letter/Plotter, PDF/DXF/SVG/AI/PNG/JPEG/HPGL | ✅ All native — real AAMA/ASTM D6673-layered DXF, genuine HPGL plotter cut-lines, selectable-DPI PNG/JPEG rasterization, tiled home-printing PDF (registration marks + assembly map), AI as PDF + `%AI` header |
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
| **Industrial grading — Grade Rules** (Size pane) — per-piece, per-outline-point dx/dy-per-size-step overrides on top of the uniform formula grade, JSON import/export, and a **Grade Nest preview** overlaying S/M/L/XL of one piece at a shared alignment point | ✅ Working — a point with no authored rule keeps grading through the normal formula, unchanged |
| **Drafting engine upgrades** — per-edge seam allowance + real corner join styles (miter/round/bevel) in the offset engine; real bezier `piece.curves` metadata (princess-seam designs) feeding DXF's curve layer; dart **Pivot** / **Slash & Spread** (Layers pane → piece properties → Edit Darts); **Walk the Seam** (Export pane) — drag one slider to check two pieces' shared seam matches at every arc-length position, not just the ends; pleats on Quick Draft skirts (real added-width math, not a label) | ✅ Working — dart **Transfer** (rotate around an external pivot) and gathers/tucks are implemented as pure, tested functions (`js/darts.js`, `js/pleats.js`) without a dedicated UI yet |
| **Local automation API** (`window.BerryStudio`, see below) — `generate`/`grade`/`nest`/`export`/`validate`, callable from the browser console or any injected script against the currently loaded pattern | ✅ Working |
| **Docs site** (`docs/`, book icon in the header) — bilingual quick start, tool reference, keyboard shortcuts, an AI setup guide with one page per provider (exact CORS commands included), 3D troubleshooting, and FAQ | ✅ Working — a build-free static site, no dependency beyond the app's own theme CSS |
| **Accessibility & UX** — real keyboard operation of the canvas (`[`/`]` cycle, arrow-key nudge, Delete, scoped to whole pieces), `role=dialog`/focus-trap/return-focus on every modal, `aria-label`/`aria-pressed` on icon and toggle buttons, a real `:focus-visible` ring app-wide, `prefers-reduced-motion` honoured by both CSS transitions and 3D Preview's auto-rotate, and all 6 theme × light/dark variants verified at WCAG AA (4.5:1) for body and secondary text | ✅ Working — construction points/lines and text annotations stay mouse-only for now (see Honest notes) |

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
- **Create Marker** — as of WP-11, "Full nest" runs a real polygon-overlap
  bottom-left-fill + simulated-annealing search in a Web Worker (`js/nesting-core.js`),
  so pieces genuinely slide and interlock into each other's concave notches rather
  than only stacking rectangular bounding boxes. "Fast preview" keeps the original
  instant shelf/bounding-box heuristic available side-by-side for a quick estimate
  before committing to a full nest. See the WP-11 note further below for the one
  documented scope call (first-party search vs. a textbook NFP/Minkowski-difference
  implementation).
- **Snapshot** is a single frozen ghost, not a multi-version history — freezing again
  replaces the previous ghost. It's meant for "compare my current edit against the
  version I started from," not an undo tree (Undo/Redo already covers step-by-step
  history within a session).
- **Object Browser** is a read-only inspection + jump-to-focus panel in this release —
  it doesn't rename/delete objects itself (use the existing point editor, Layers pane,
  or text editor for that).
- **SVG, DXF, HPGL, PNG/JPEG and PDF** exports are all native as of WP-12 — DXF
  uses real AAMA/ASTM D6673 layer numbering, HPGL emits genuine `IN;SP1;PU;PD;`
  plotter output, PNG/JPEG rasterize at a selectable DPI (clamped to the
  browser's real canvas limits, with an honest "reduced" notice rather than a
  silent failure), and PDF supports tiled home-printing (registration marks +
  assembly map) alongside the original single-page mode. AI is the same PDF
  wrapped in a small `%AI` compatibility header. None of these fall back to
  the vector SVG payload under a different extension any more.
- **Projects** round-trip losslessly via `Save Project (.json)` → `Import Project`.
- **3D avatars** are high-quality *procedural stylised* characters by default
  (not photoreal humans — that needs sculpted GLB models an in-browser script
  can't synthesise). **Settings → 3D avatar models (GLB)** now offers three
  ways to replace the default body per category: pick one of 8 bundled GLB
  models (`avatars/`, real Man/Boy/Girl/Woman variants — see the Honest note
  below on what they are and aren't), paste a model URL (e.g. a Ready Player
  Me link ending in `.glb`), or upload your own `.glb` file directly from
  disk. The loader auto-scales whichever model is active to the live
  measurements and falls back to the built-in body if it fails to load.
  Uploaded files are session-only (a `blob:` URL, never persisted) — use a
  hosted URL or one of the bundled models if you want the choice to survive
  a reload.
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
- **A real, previously-dismissed-too-quickly bug, fixed in two rounds**: 3D
  Preview reported blank by a real user (across two phases) was originally
  chalked up to "some browser-automation tools fail resolving import-map
  entries in a dynamic `import()`" and left as a tooling note rather than
  fixed. Round 1: reproducing it directly (`import("three")` throws
  "Failed to resolve module specifier" in the affected engine, while
  `import("https://unpkg.com/.../three.module.js")` on the same page
  succeeds immediately after) showed this affects more than one
  automation tool's engine, so `js/three-view.js` was changed to retry a
  failed bare-specifier import against an explicit unpkg.com URL. Round 2:
  the SAME user still saw it fail after that fix, while the same device's
  `/3d-test.html` capability check (no runtime CDN dependency at all)
  confirmed full WebGL2/WebGPU support, and Cloth Lab (a separately
  Vite-bundled app with no runtime CDN dependency) worked fine — pointing
  at something blocking `unpkg.com` specifically (an ad-blocker/privacy
  extension/network filter), which a same-domain retry can never route
  around. `js/three-view.js` now falls through three tiers — the page's
  import map, an explicit unpkg.com URL, then esm.sh (a genuinely
  different domain, already in this page's CSP for other features) —
  verified by literally blocking all `unpkg.com` requests in a Playwright
  test and confirming 3D Preview still initializes via the esm.sh tier
  alone. A related bug found alongside round 1: even in a real
  WebGL-unavailable fallback case, the "3D preview needs WebGL" message
  was being drawn onto a canvas still sized 0×0 from app boot (before the
  3D tab was ever opened) and nothing ever redrew it at the correct size —
  `resize()` now re-attempts the fallback message at the real size on
  every call, not just once at boot.
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
- **True polygon nesting** (WP-11) is a first-party bottom-left-fill +
  simulated-annealing placement search over real polygon-overlap testing
  (`js/nesting-core.js`), not a literal Minkowski-difference no-fit-polygon
  implementation — that's the textbook approach, but pulling in an
  unfamiliar, unverified nesting dependency for it risked a worse outcome
  than a well-tested first-party search that already demonstrably nests
  pieces into each other's concave notches.
- **Curve metadata** (`piece.curves`, WP-14) is wired into `princessCurve()`
  only — the one curve-generating function `js/fancy-patterns.js`'s
  `princessBodice()` shares across 10+ of the 24 Fancy Collection designs —
  not into every individual `qBez()` call site across all 24 designs
  (necklines, sleeve caps, collar curves, etc. stay flattened-polyline-only,
  unchanged). DXF's curve layer (layer 3) is empty for those, exactly as it
  was before this metadata existed anywhere.
- **Dart Transfer** (rotate a whole dart around an *external* pivot point,
  e.g. a fixed bust-point reference) is a real, tested pure function
  (`js/darts.js`) but has no dedicated UI yet — it needs a "pick a point on
  the canvas" interaction the current Dart Editor modal (Pivot/Spread only)
  doesn't have. Gathers (`computeGatherWidth`) and tucks (`computeTucks`,
  `js/pleats.js`) are likewise real and tested but only pleats are wired
  into a generator (Quick Draft's skirt builder) today.
- **Walk the Seam** (WP-14) is a modal with a single drag slider, not a
  live interactive canvas tool that tracks a mouse drag along an edge in
  real time — a deliberate, smaller-blast-radius choice given the existing
  canvas's single large pointerdown/pointermove dispatch chain. It still
  answers the real question (do these two edges match at every arc-length
  position, not just the ends), just via a slider instead of a drag gesture.
- **A real, pre-existing bug found and fixed along the way, not introduced
  by this phase**: `offsetPoly()`'s seam-allowance offset had its sign
  backwards — every pattern piece's dashed "seam allowance" preview (and
  `PatternValidator`'s seamAllowance check) had been expanding *inward*
  instead of outward since before this phase started, confirmed against
  live data (offsetting a real bodice by the app's own default 1cm shrank
  its area instead of growing it). Fixed in `js/geometry.js` when
  `offsetPoly` was extracted there for WP-14's per-edge/join-style work.
- **A second real, pre-existing bug found and fixed**: Cloth Lab's
  standalone build was missing `#root { height: 100% }` in its CSS height
  chain (`html`/`body` had it, `.cloth-lab-root` had it, the div *between*
  them didn't), so the page silently overflowed its own viewport and the
  3D canvas — and every camera/zoom distance computed against it — sized
  itself to the sidebar's content height instead of the real window. This
  is what read as "the mannequin doesn't fit" and "zoom doesn't work."
- **Keyboard canvas operation** (WP-17) covers whole pattern pieces —
  `[`/`]` to select the previous/next piece, arrow keys (Shift for 0.1cm
  fine adjustment) to nudge the selected piece, Delete/Backspace to remove
  it. Construction points/lines/arcs/circles and text annotations are still
  mouse-only; keyboard-only editing of those is a documented gap, not yet
  built. `[`/`]` were chosen over Tab/Shift+Tab specifically so Tab keeps
  doing its normal job of moving DOM focus between toolbar and panel
  controls, rather than being hijacked for in-canvas selection.
- **Reduced motion** (WP-17): `state.reduceMotion` existed before this pass
  but only ever shortened one CSS transition variable (`--med`) — it did
  nothing for the other two (`--fast`/`--slow`) and nothing at all for 3D
  Preview's continuous auto-rotate, so a user with the OS-level "reduce
  motion" preference set (or the in-app toggle on) still saw the avatar
  spinning. Now all three CSS timing tokens respond, `View3D.setReduceMotion`
  forces auto-rotate off regardless of the spin toggle, and a first-ever
  visit seeds the setting from `matchMedia('(prefers-reduced-motion: reduce)')`
  rather than always defaulting to "on." 3D Cloth Lab has no continuous
  ambient motion of its own to reduce — its camera only spins during an
  explicit turntable export, never during normal viewing — so there was
  nothing to wire there.
- **Modal accessibility** (WP-17): every `.overlay` (theme/settings/command
  palette/generic/onboarding) now gets `role="dialog"`/`aria-modal`, moves
  focus to its first control on open, traps Tab inside it while open, and
  returns focus to whatever triggered it on close — implemented once via a
  shared `MutationObserver` over each overlay's own `show` class rather than
  touching every different open/close call site individually.
- **Colour contrast** (WP-17): a computed WCAG audit of all 6 theme × light/
  dark combinations found the Egyptian light theme's secondary text colour
  (`--ink-2: #8a7350`) at 3.95:1 against its background and 4.27:1 against
  panels — both below the 4.5:1 AA threshold for normal text. Darkened to
  `#7a6545` (4.86:1 / 4.58:1); every other theme variant already cleared
  4.5:1 and was left unchanged.
- **Google Drive/OneDrive sync** (WP-18) is a bring-your-own-OAuth-client-ID
  integration — see the note further below — not a BerryStudio-hosted
  service, the same honesty pattern as WP-1's bring-your-own-AI-key design.
- **A third real, pre-existing bug found and fixed, this time in
  deployment rather than app code**: found while verifying WP-16's new
  `docs/` actually reached production — the CI deploy workflow's "Assemble
  combined site" step copies an explicit file/directory list rather than
  the whole repo, and that list was never updated after `body.html` (WP-10)
  and `3d-test.html` (WP-9) were added in earlier phases. Both had been
  returning a live 404 in production since the phase that introduced each
  of them, despite being genuinely built, tested, and linked from the
  running app the whole time — `npm test`/Playwright serve the repo
  directly and never exercised the deploy step's copy list, so nothing
  caught it until this direct production check. Fixed by adding `body.html`,
  `3d-test.html`, and `docs/` to that list; a future top-level HTML file
  will need the same one-line addition (a deliberate allow-list, not
  something to wildcard, since the repo root isn't a build output
  directory — a wildcard would also publish scratch/dev files).
- **Bundled avatar gallery** (`avatars/`, Settings → 3D avatar models) — 8
  real GLB models (2 men, 1 woman, 2 boys, 3 girls), selectable per category
  alongside the existing custom-URL field and a new "upload your own file"
  option. These are static, **unrigged** single-mesh exports (from an
  AI image-to-3D pipeline, not a sculpted/rigged character) — that's a
  perfect fit for 3D Preview (`js/three-view.js` just loads and scales to
  height, no skeleton needed) but means pose variants in 3D Cloth Lab
  (seated/walk/etc.) won't animate them; they'll display correctly, just
  static, the same as any unposed model. A 9th candidate model was
  deliberately left out: at 41MB it was 10x every other file's size,
  bloating both the git repo and the download a visitor would pay just to
  preview it — left for a future, properly-compressed re-export rather
  than shipped as-is. Not precached by the service worker (same
  network-first-then-cache behaviour as any other same-origin asset) —
  only fetched when a user actually picks one.

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
│   ├── nesting-core.js   Pure polygon-nesting algorithm (bottom-left-fill + simulated annealing)
│   ├── workers/nesting-worker.js  Web Worker wrapper around nesting-core.js
│   ├── nesting.js        Main-thread client for the nesting Worker (Promise + progress + cancel)
│   ├── pattern-export.js Pure DXF/HPGL/tiled-PDF builders (DOM-free — unlike raster, which stays in canvas.js)
│   ├── grading.js        Per-point grade-rule resolution (Grade Rules / Grade Nest preview)
│   ├── geometry.js       Polygon offsetting: per-edge seam allowance, miter/round/bevel joins, seam arc-length lookup
│   ├── darts.js          Dart manipulation: pivot, transfer, slash-and-spread
│   ├── pleats.js         Pleat/gather/tuck added-width math
│   ├── berry-studio-api.js  `window.BerryStudio` local automation API (see "Automation API" below)
│   ├── cloud-sync.js     Optional cloud sync: self-hosted endpoint, Google Drive, OneDrive (BYO OAuth client ID)
│   ├── vendor/           Generated/vendored files (pattern-spec-validate.generated.js) — see its own README
│   └── app.js            Application controller (wires everything)
├── schema/               Pattern Spec JSON Schema + example fixtures (see Honest notes)
├── scripts/              Dev-only tooling (schema validator codegen)
├── docs/                 Bilingual docs site (quick start, tools, shortcuts, AI setup, 3D troubleshooting, FAQ)
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

## Automation API

`window.BerryStudio` (`js/berry-studio-api.js`) is a small, permanent,
documented facade over the app's own generate/grade/nest/export/validate
capability — every method is a direct pass-through to the same code the UI
itself calls, so the result is always exactly what you'd get by hand.
Open the app, open the browser console, and try any of these against
whatever pattern is currently loaded:

```js
// Resolve a measurement set for a size/standard — no pattern needed.
const m = BerryStudio.grade({ category: "women", size: "L", standard: "intl", kids: null, custom: null });

// Grading a specific LOADED pattern to that measurement set is a real,
// separate second step — computeMeasurements() only resolves numbers:
const colors = ["#6d5efc", "#00c2a8", "#ff5d8f", "#e2a52b", "#4c8dff", "#c1492e"];
Canvas.setPattern(PATTERNS.womens_dress.pieces(m), colors);

// Export the currently loaded pattern.
const svg = BerryStudio.export("svg");                                   // string
const dxf = BerryStudio.export("dxf");                                   // string (AAMA/ASTM D6673 layers)
const { blob, dpi } = await BerryStudio.export("png", { dpi: 300 });      // Promise<{blob, dpi, clamped}>
const pdf = BerryStudio.export("pdf", { tiled: true, pageSize: "a4" });   // tiled home-printing PDF

// Run the 8 patternmaking checks over every loaded piece.
const report = BerryStudio.validate({ seamAllowanceCm: 1 });

// True polygon nesting (the same Worker "Full nest" uses) over every
// loaded piece, onto a 150cm-wide fabric roll.
const nested = await BerryStudio.nest({ matWidth: 150, allowRotate: true, minDistCm: 0.5 });
console.log(`${Math.round(nested.utilization * 100)}% fabric utilization`);

// Generate a new pattern from a prompt (offline heuristic unless you pass
// `endpoint`, in which case it POSTs there and falls back to local on failure).
const generated = await BerryStudio.generate({
  prompt: "a fitted knee-length dress with a V-neck",
  category: "women",
  measurements: m,
});
Canvas.setPattern(generated.pieces, generated.colors);
```

See `js/berry-studio-api.js` for the exact signature and return shape of
each of the five methods.

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
