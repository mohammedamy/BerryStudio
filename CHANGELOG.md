# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.
Started as part of `BerryStudio-Upgrade-Plan.md`'s WP-16 (docs & changelog),
established early per that plan's own "one WP = one PR = one changelog
entry" rule.

## Phase 4 — Product surface (WP-16 – WP-18)

Fifth and final increment of `BerryStudio-Upgrade-Plan.md` — a docs site,
accessibility/UX pass, and optional cloud sync. Sequenced WP-16 → WP-17 →
WP-18: the docs site is fully self-contained and lowest-risk so it shipped
first; WP-17 touches shared canvas/modal/theme code and needed its own
verification pass before WP-18 (a genuinely new feature) built on top of it.

### Added
- **Docs site** (WP-16) — a build-free, bilingual static site at `docs/`
  (reached from a new book-icon button in the header): a quick start,
  full tool reference, keyboard shortcuts, an AI provider setup guide with
  one page per provider (exact CORS commands included), 3D troubleshooting,
  and FAQ. Shares the root app's own theme CSS variables rather than adding
  a design-system dependency.
- **Accessibility & UX** (WP-17):
  - Real keyboard operation of the pattern canvas — `[`/`]` cycles the
    selected piece, arrow keys (Shift for 0.1cm fine adjustment) nudge it,
    Delete/Backspace removes it. `[`/`]` rather than Tab/Shift+Tab
    deliberately, so Tab keeps doing its normal job of moving DOM focus
    between toolbar and panel controls.
  - Every modal (theme/settings/command palette/generic/onboarding) now
    gets `role="dialog"`/`aria-modal`, moves focus in on open, traps Tab
    inside it, and returns focus to whatever opened it on close — one
    shared mechanism (a `MutationObserver` over each overlay's own `show`
    class) rather than touching every different open/close call site.
  - `aria-label`/`aria-pressed` on icon and toggle buttons (translated,
    updates on language switch); a real `:focus-visible` ring app-wide,
    replacing several blanket `outline: none` rules that removed keyboard
    focus indication entirely.
  - `prefers-reduced-motion` is now honoured for real: CSS transition
    durations and 3D Preview's auto-rotate both respond, and a first-ever
    visit seeds the setting from the OS media query.
  - All 6 theme × light/dark variants verified against WCAG AA (4.5:1) for
    body and secondary text; the Egyptian light theme's secondary text
    colour was found under threshold and darkened.
- **Optional cloud sync** (WP-18) — `js/cloud-sync.js`, wired into the
  previously-dormant "Cloud Sync" Settings toggle: a self-hosted endpoint
  (a plain PUT/GET of the project JSON, with an optional bearer token) plus
  Google Drive (`drive.file` scope) and Microsoft OneDrive
  (`Files.ReadWrite.AppFolder` permission) targets, both bring-your-own-
  OAuth-client-ID like WP-1's AI provider keys. Local-first stays the
  default forever — nothing runs unless the toggle is on and a target is
  configured, and "Save/Load to cloud" are explicit Project-menu actions,
  never automatic background sync.

### Fixed
- Two stale README "Honest notes" bullets from before WP-11/WP-12 shipped
  still claimed Create Marker "does not slide and interlock" and that
  PNG/JPEG/AI/HPGL exports "fall back to the vector output" — both were
  fixed by those two WPs but the notes were never updated, directly
  contradicting the status table just above them. Corrected during this
  phase's own README pass.
- **CI deploy workflow was silently 404ing `body.html` (WP-10) and
  `3d-test.html` (WP-9) in production** since the phase each was
  introduced — found while verifying this phase's own `docs/` deployed
  correctly. `.github/workflows/deploy-pages.yml`'s "Assemble combined
  site" step copies an explicit allow-list of files/directories rather
  than the whole repo, and that list was never updated for either page.
  Both were genuinely built, tested, and linked from the live app the
  whole time — `npm test`/Playwright serve the repo directly and never
  exercise the deploy step, so nothing had caught it. Fixed by adding
  `body.html`, `3d-test.html`, and `docs/` to the copy list.

### Honest notes
- Keyboard canvas operation covers whole pattern pieces only — construction
  points/lines/arcs/circles and text annotations stay mouse-only.
- Google Drive/OneDrive sync is structurally complete and verified as far
  as this environment allows (Google Identity Services correctly loads and
  constructs a real OAuth authorization request for a test client ID,
  confirmed via console output; the actual consent flow needs a real
  registered OAuth app + an unblocked popup context this sandbox doesn't
  have) — the self-hosted endpoint target was verified fully end-to-end
  against a real local server, including the save → clear → load round trip.

## Phase 3 — Production tools (WP-11 – WP-15)

Fourth increment of `BerryStudio-Upgrade-Plan.md` — true polygon nesting,
export fidelity, industrial grading, drafting-engine upgrades, and a local
automation API. Sequenced WP-11 → WP-12 → WP-13 → WP-14 → WP-15, the plan
document's own order (each of the first three is independent of the other
two; WP-15 wraps the finished state of everything before it, so it has to
come last).

### Added
- **True polygon nesting** (WP-11) — a first-party bottom-left-fill +
  simulated-annealing placement search (`js/nesting-core.js`) run in a Web
  Worker (`js/workers/nesting-worker.js`, client: `js/nesting.js`), replacing
  bounding-box packing for pieces that actually interlock into each other's
  concave notches. The existing shelf-packer stays available as a "Fast
  preview" mode alongside the new "Full nest" in Create Marker, with a real
  cancelable Stop button and grainline-locked pieces restricted to 0°/180°.
- **Export fidelity** (WP-12) — real AAMA/ASTM D6673 DXF layers (turn
  points, curve points, grade-reference/notches, dart legs, grainline,
  drill holes) replacing the old `CUT`/`GRAIN`/`DART` layer names; genuine
  HPGL plotter output; PNG/JPEG rasterization at a selectable DPI (150/300/
  600), clamped to the browser's real canvas size limits with an honest
  "reduced" notice rather than a silent null-blob failure; tiled home-
  printing PDF (registration marks, a real calibration square, an assembly-
  map page) alongside the unchanged single-page default; AI as the same PDF
  wrapped in a small `%AI` Illustrator-compatibility header. New
  `js/pattern-export.js` (pure DXF/HPGL/PDF builders, DOM-free and unit
  tested) and `js/geometry.js`.
- **Industrial grading** (WP-13) — `js/grading.js`: additive per-point
  grade-rule overrides (`piece.gradeRules`, `{dx,dy}` per outline index)
  resolving as `base-at-M + dx/dy×step` instead of the uniform formula
  grade, with every un-ruled point unaffected. A new Grade Rules table
  (Size pane) with JSON import/export, and a Grade Nest preview overlaying
  S/M/L/XL of one piece at a shared alignment point.
- **Drafting engine upgrades** (WP-14) — `offsetPoly()` extended with
  per-edge seam-allowance distances and real corner join styles (round
  fillet, bevel chamfer, alongside the existing miter), reflex corners
  always resolving via line intersection regardless of join style; real
  bezier `piece.curves` metadata from `princessCurve()` (shared by 10+ of
  the 24 Fancy Collection designs), consumed by WP-12's DXF curve layer;
  `js/darts.js` (pivot, transfer, slash-and-spread — pivot/transfer
  preserve a dart's intake, slash-and-spread deliberately adds it) with a
  new Dart Editor UI; `js/pleats.js` wired into Quick Draft's skirt
  builder as a real added-width option; Walk the Seam (Export pane) — a
  slider checking two pieces' declared shared seam matches at every
  arc-length position via `js/geometry.js`'s `seamPointAtFraction`.
- **Local automation API** (WP-15) — `window.BerryStudio`
  (`js/berry-studio-api.js`): `generate`/`grade`/`nest`/`export`/`validate`,
  each a direct pass-through to the same code the UI itself calls. See the
  README's "Automation API" section for runnable examples.

### Fixed
- **`offsetPoly()`'s seam-allowance direction was backwards** — every
  pattern piece's dashed "seam allowance" preview, and `PatternValidator`'s
  seamAllowance check, had been expanding inward instead of outward since
  before this phase (confirmed against live data: offsetting a real bodice
  by the app's own default 1cm shrank its area instead of growing it).
  Found and fixed while extracting `offsetPoly` into `js/geometry.js` for
  WP-14's per-edge/join-style work.
- **Cloth Lab's standalone build was missing `#root { height: 100% }`** —
  the CSS height chain (`html`/`body` → `#root` → `.cloth-lab-root`) had a
  gap at `#root`, so the page silently grew taller than the viewport and
  the 3D canvas (and every camera/zoom distance computed against it) sized
  itself to the sidebar's content height instead of the real window —
  reported as "the mannequin doesn't fit the view" and "zoom doesn't work."
- A WP-12 DXF-export helper had assumed this app's dart shape was
  `[legA, apex, legC]` (apex at index 1); every real dart in `js/data.js`
  and `js/ai.js` — and the on-canvas dart renderer itself — actually use
  apex at index 0. Fixed alongside `js/darts.js`.
- Two CI flakes in the BodyForm GLB-export Playwright test (real
  `GLTFExporter` CPU work on a slow shared runner, unrelated to any code
  change in this phase) — timeout raised from the default, to 60s, to
  120s across two occurrences, each confirmed not a regression by every
  other test in the suite passing cleanly alongside it both times.

### Honest notes
See the main README's "Honest notes" section for the specific, documented
scope calls made in this phase: a first-party nesting algorithm instead of
a Minkowski-NFP dependency, curve metadata wired into one shared generator
function rather than every curve call site, dart Transfer/gathers/tucks
implemented as tested pure functions without a dedicated UI yet, and Walk
the Seam as a slider-driven modal rather than a live canvas drag tool.

## Phase 2 — 3D: fix and unify (WP-5 – WP-10)

Third increment of `BerryStudio-Upgrade-Plan.md` — the largest phase: cloth-lab's
solver, avatars, and rendering brought up to the level the pattern editor
already was, plus the architectural work to run it as one page instead of a
sandboxed iframe. Sequenced WP-6 → WP-7 → WP-8 → WP-9 → WP-5 → WP-10 (engine
work first and proven stable, then one clean architectural promotion, then
the new standalone route) rather than the document's own WP-5-first
numbering — see the phase's own planning doc for the full reasoning.

### Added
- **Pattern metadata at the source** (WP-6) — `schema/pattern-spec.v1.json`'s
  `role` enum extended from 13 to ~44 values (princess seams, gores, godets,
  capes, tiers, two-piece sleeves, collars, hoods, yokes, peplums, and more),
  old names kept as aliases. `js/data.js`, `js/ai.js`, and all 24
  `js/fancy-patterns.js` designs now emit `role`/`cutOnFold`/`foldEdgeIndex`/
  `edges`(seam IDs)/`grainline` at construction time. `importFromApp.js`
  is now a thin validator over that metadata, falling back to its old
  geometric classifier (`classifyLegacy`) only for pieces without it — never
  silently dropped. New `seamGraphPlacement.js`: a BFS seam-graph placement
  engine (pieces are nodes, shared seam IDs are edges) with per-role-family
  placement primitives (gores, godets, capes, sleeves, collars, hoods,
  yokes, peplums, pockets, waistbands, cuffs), replacing per-shape geometric
  guessing. All 24 Fancy Collection designs now import and simulate as
  connected garments — automated as an acceptance test.
- **Cloth solver quality** (WP-7) — hard strain-limit clamp in the structural
  constraint shader (per-fabric `maxStrain`); `jersey`/`scuba`/`tulle`
  fabric presets plus warp/weft/bias anisotropy tagged from `grainline`;
  adaptive substepping (`cloth-lab/src/perf/frameBudget.js`, an EMA
  frame-time controller shared with WP-9's adaptive DPR) replacing a fixed
  `SUBSTEPS=8`, with a dev-only Solver HUD (`?hud=1`); waistband pinning
  (mirrors the existing shoulder-pin mask); a headless rest-state pre-relax
  before the first visible frame.
- **Avatars matching measurements** (WP-8) — arm/leg length now reads the
  user's own sleeve/inseam measurements instead of a fixed height fraction;
  a new FFD lattice (`body/ffdLattice.js`) deforms a loaded GLB per-region
  (bust/waist/hip/shoulder/thigh) toward the user's measurements; a new
  mesh-fit collision rig (`body/meshFitCollisionRig.js`) measures a loaded
  GLB's actual cross-sections instead of using the formula-only rig; VRM
  files are now detected and given an honest "not supported yet, showing
  original pose" message instead of silently mis-positioning; a 6-tone skin
  preset picker (`ui/AvatarPanel.jsx`); **a real pose-variant system** —
  Standing/A-pose/T-pose/Contrapposto/Seated/Walk, as static geometry/
  rotation variants on the procedural avatar (Seated is a genuine bent-knee
  two-segment leg, not just a rotation) and world-space bone corrections on
  a recognized GLB rig, with Walk scoped to GLBs that ship their own
  embedded animation clip (played via drei's `useAnimations`).
- **Rendering, performance, and export** (WP-9) — `/3d-test.html`, a
  build-free WebGL2/float-render-target/max-texture-size capability probe;
  PBR `transmission` (chiffon/tulle) and `anisotropy`/`anisotropyRotation`
  (silk/satin) fabric shading; the root app's `three-view.js` gained the
  same local HDRI environment and ACES tone mapping cloth-lab already had;
  adaptive DPR sharing WP-7's `frameBudget.js`; GLB/OBJ/USDZ export, PNG-
  sequence turntables, and MP4/WebM turntable recording
  (`cloth-lab/src/export/`).
- **One shared React/Three.js instance** (WP-5) — an import map
  (`index.html`) resolving `react`/`react-dom`/`@react-three/fiber`/
  `@react-three/drei` via esm.sh's `?external=` dedup and a shared
  `three@0.185.1` (fixing a pre-existing `0.160.0`/`0.185.1` version split),
  plus a new `cloth-lab/src/embed.js` entry point (built by
  `vite.lib.config.js` into `dist-embed/`) that mounts cloth-lab directly
  into the root page instead of a cross-document iframe. A new
  `state.clothLabEngine` Settings toggle (`"iframe"` default, `"embedded"`
  opt-in) switches between them; the iframe path is completely unchanged
  when the flag is left at its default. CI now also builds and publishes
  `dist-embed/`.
- **BodyForm** (WP-10) — a new standalone `body.html`: pick a category and
  starting size, fine-tune measurements (`js/measure-form.js`, extracted
  out of the main app's own Measures pane rather than copy-pasted), and see
  a live avatar via cloth-lab's embedded engine in a new `bodyOnly` mode
  (no garment/cloth/seam UI, just the avatar — reuses the existing debug
  view machinery rather than a new rendering path). "Open in Fit Studio"
  (`js/body-handoff.js`, sessionStorage + a URL flag) carries the category
  and measurements into the main app, landing directly on the 3D Cloth Lab.

### Changed
- `js/app.js`'s `buildClothLabPayload()` forwards the new WP-6 metadata
  fields (plus the already-existing-but-previously-dropped `darts`/
  `notches`/`grain`) to whichever cloth-lab engine is active.
- `cloth-lab/src/index.css` scoped everything under `.cloth-lab-root`
  instead of `:root`/`html`/`body` — a page embedding cloth-lab directly
  (WP-5/WP-10) would otherwise have its own CSS custom properties silently
  overwritten by cloth-lab's.
- `.github/workflows/deploy-pages.yml`'s "Assemble combined site" step now
  also copies `env/` and `schema/` into the deployed site — a pre-existing
  gap (neither was ever copied) that would have silently 404'd the root
  app's HDRI (WP-9.3) and Pattern Validator (WP-0.3) in production; found
  and fixed while already touching this file for WP-5.6.

### Known limitations (see README's Honest notes for full detail)
- **Seam sewing ramp-in was not implemented** — seams still hard-weld at
  mesh-build time via the pre-existing union-find pass; the plan's own text
  explicitly permitted deferring this if the merge-after-ramp approach
  proved too risky, and it was not attempted this pass.
- True dihedral-angle bend constraints and a GPU spatial-hash self-collision
  broadphase are both still the pre-existing distance-based hinge and
  brute-force O(N²) narrowphase — deliberate, already-documented trade-offs,
  not attempted this pass (no garment in this app approaches the particle
  count where either would matter).
- Fabric `structStiff`/`bendStiff` values are tuned "feel" sliders, not
  Kawabata-instrument-calibrated SI values — an intentional, pre-existing
  design choice, not a new gap.
- GLB pose variants: `seated`'s knee bend derives "forward" from the
  character's own hip-bone axis, which is robust to unknown per-exporter
  bone-local-axis conventions but genuinely ambiguous by 180° — an unlucky
  third-party rig can end up seated facing backward. Cloth collision/
  placement for a GLB avatar always assumes the standing arms-down pose
  regardless of which pose is displayed (re-deriving collision per pose is
  a materially larger problem — a seated body needs seated-aware garment
  draping, not just a repositioned collider — and out of scope here).
- USDZ export runs without errors and produces valid zip/usdc bytes, but has
  not been verified in Apple Quick Look on real iOS hardware (none was
  available in the environment this was built in).
- Full VRM humanoid-bone retargeting is not implemented — format detection
  only, with an honest fallback message rather than silent mis-positioning.
- GIF export was not added — every JS GIF encoder is a new dependency,
  against this project's dependency-minimal posture; PNG-sequence and
  MP4/WebM turntable export cover the same need via native browser APIs.

## Phase 1 — Bring Your Own AI (WP-1 – WP-4)

Second increment of `BerryStudio-Upgrade-Plan.md` — the plan's own headline
request. Replaces the single hardcoded "paste a proxy URL" AI path with a
real multi-provider adapter layer, spec-first generation validated against
Phase 0's schema, and vision+pixel fusion.

### Added
- **Provider layer** (`js/ai-providers.js`) — 8 text/vision adapters
  (Anthropic, OpenAI, Gemini, OpenAI-compatible, Ollama, LM Studio,
  llama.cpp/vLLM, and the existing proxy), one stateless `{models, test,
  complete}` interface, injectable-fetch unit tests (no live API calls in
  CI). New "AI Provider" section in Settings (provider dropdown, dynamic
  key/URL/model fields, Fetch Models, Test Connection with real error text,
  separate text/vision model slots).
- **Key storage & security** (`js/ai-keystore.js`) — sessionStorage by
  default; opt-in WebCrypto-encrypted persistent storage (PBKDF2 250k
  iterations → AES-GCM) behind a plain-language warning; a `redact()`
  helper as the only place a key may touch a log/toast; a real CSP
  (`index.html`) with no `'unsafe-eval'`.
- **Local model support** (`js/capability-probe.js`,
  `js/workers/local-model-worker.js`) — Route A (local server) via the
  existing Ollama/LM Studio/llama.cpp/vLLM adapters; Route C (Hugging Face
  model ID) via a lazily-instantiated Web Worker that dynamically imports
  `@huggingface/transformers` from a CDN only on first use; a WebGPU
  capability probe badges readiness. Route B (local file picker) is
  explicitly not wired up — see Honest notes.
- **Spec-first generation** (`js/ai-spec-pipeline.js`) — prompt → a
  configured provider → schema-validated `PatternSpecV1` JSON (one
  validate-and-retry pass) → `AIGen.build()` → `PatternValidator.run()` →
  provenance-tagged attribute chips. Falls back to the offline heuristic,
  with a toast, on any failure — never renders unvalidated output. The
  `schema-validate.js` validator (Phase 0) was switched from a vendored
  ajv-v6 runtime build to ajv's precompiled "standalone code" output
  (`scripts/generate-schema-validator.mjs`, `js/vendor/pattern-spec-validate.generated.js`)
  after discovering the runtime build's `new Function()` codegen is blocked
  by the new CSP — the precompiled version needs no `'unsafe-eval'` at all.
- **Vision fusion** (`js/ai-fusion.js`) — when an image is supplied to a
  configured provider, the vision-informed spec is authoritative for
  garment type/neckline/closure; the existing pixel-analysis heuristic
  stays authoritative for length/flare/hem/colour. Every "Detected" chip
  with a known correction handler is click-to-override.
- **Image-generation provider layer** (`js/image-providers.js`) — folds
  `js/billboard.js`'s single hardcoded proxy into OpenAI images, Gemini
  image, a local Stable Diffusion (Automatic1111) backend, and the
  original proxy contract — preserved byte-for-byte so existing
  `server/billboard-proxy/worker.js` deployments keep working unchanged.
- Tests: `test/ai-providers.test.js`, `test/ai-keystore.test.js`,
  `test/ai-spec-pipeline.test.js`, `test/ai-fusion.test.js`,
  `test/image-providers.test.js`, `test/i18n-coverage.test.js`; a new
  Playwright spec covering the AI settings panel + a mocked provider
  round-trip; `playwright.config.js` gained `bypassCSP: true` (Playwright's
  own test instrumentation is an inline script the new CSP correctly
  blocks — this only affects the isolated test browser context, never real
  users).

### Changed
- `js/billboard.js`'s `generateBillboard`/`generatePattern` now dispatch
  through an injected image-generation adapter instead of talking HTTP
  directly — same public behaviour, `js/image-providers.js` owns the
  transport.
- `js/ai.js`'s `attributes()` gained an optional third `provenance`
  parameter (source/confidence per chip) — fully backward compatible,
  existing callers are unaffected.
- `js/app.js`'s `runAI()` tries a configured provider first (spec-first,
  with vision fusion if an image was supplied) and falls through to
  today's exact local-heuristic path on any failure — no provider
  configured reproduces pre-Phase-1 behaviour exactly.

### Known limitations (see README's Honest notes for full detail)
- Route B (local `.onnx`/`.gguf` file picker) is not wired up — a clear
  "not supported, use a local server instead" message, not a silent
  failure.
- Route C (in-browser Hugging Face models) is real, working code but was
  not verified this pass with an actual multi-hundred-megabyte model
  download and live inference — structurally verified, not fully
  field-tested.
- `openai-compatible`/`llamacpp`/`vllm`'s user-typed base URLs force a
  broader `connect-src` (`https:` + `localhost:*`) than a short named
  allow-list, since a `<meta>` CSP can't grow at runtime — documented
  trade-off, not an oversight.
- Only Automatic1111's REST API is implemented for local image generation;
  ComfyUI and SD.next are future work.
- The "draft program" generation mode (an alternative to spec-first
  generation, against the associative point/line/arc system) and a real
  segmentation-mask upgrade to the pixel-analysis path are both deferred,
  not started this pass.

## Phase 0 — Foundations (WP-0.1 – WP-0.4)

First increment of `BerryStudio-Upgrade-Plan.md`. The full 18-work-package
plan is explicitly staged — this covers just Phase 0, the prerequisite for
everything else.

### Added
- **Pattern Spec schema** (`schema/pattern-spec.v1.json`) — a declarative
  JSON Schema for future AI-generated garments, plus `js/schema-validate.js`
  (an ajv wrapper), vendored `js/vendor/ajv6.min.js`, and example fixtures.
  Not wired into the AI generator yet — schema + validation only.
- **Check Pattern** (`js/validate.js`) — a new "Check Pattern" button in the
  Export pane (and ⌘K palette) runs 8 patternmaking checks against the
  current pattern: closed outline, self-intersection, grainline angle,
  seam-allowance offset validity, cut-on-fold symmetry (full confidence);
  seam-length parity and notch alignment (heuristic, front/back
  name-matched); ease (deferred — see Known limitations below).
- Root `package.json` + `test/` — a `node --test` suite covering
  `data.js`/`ai.js`/the schema round-trip/the validator, including a
  library-wide sweep over all 124 shipped patterns.
- `cloth-lab/` gained `vitest` unit tests for `computeBodyDims.js` and
  `collisionRig.js`'s shoulder-pin math.
- One Playwright smoke spec (`e2e/smoke.spec.js`) covering load → grade →
  export SVG → open 3D preview → no console errors.
- `.github/workflows/deploy-pages.yml` now runs all of the above as a `test`
  job gating `build`/`deploy` — previously there was no test gate at all.

### Changed
- **All 9 root `js/*.js` files converted from classic-script IIFE globals to
  real ES modules** (`import`/`export`), matching `index.html`'s existing
  import-map pattern. Every exported symbol keeps a `window.X = X` compat
  alias for this release. Purely mechanical — no behavioral changes; verified
  end-to-end (drafting, grading, RTL, SVG export, 3D preview, the AI
  generator) with zero console errors before and after.
- `js/canvas.js`'s `offsetPoly` (seam-allowance polygon offset) is now part
  of `Canvas`'s public API, reused by the new validator instead of being
  reimplemented.
- `sw.js`'s offline precache list gained `js/validate.js` and the
  previously-missing `js/billboard.js` (a pre-existing gap, unrelated to this
  pass, fixed while already touching the file); cache version bumped.

### Known limitations (see README's Honest notes for full detail)
- The vendored ajv build works correctly under Node but has not been wired
  to run from a plain browser `<script>` tag yet — not an issue today since
  nothing loads it from the browser, but noted for whoever wires up WP-1/3.
- Check Pattern's two heuristic checks can flag a real front/back pair as
  "different" for legitimate design reasons (e.g. a deeper front neckline) —
  they're a lead for a human to judge, not verified fact, and are labelled
  as such in the UI.
- Ease checking is not implemented — would need a second unverifiable
  heuristic layered on the first with no way to confirm either; left as an
  honest gap rather than guessed at.
- Running the validator over the full library surfaced a real, unfixed bug:
  30 Fancy Collection pieces have a duplicate consecutive outline point
  (likely a bezier-sampling boundary issue in `js/fancy-patterns.js`) —
  tracked separately, not fixed in this pass.
