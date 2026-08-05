# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.
Started as part of `BerryStudio-Upgrade-Plan.md`'s WP-16 (docs & changelog),
established early per that plan's own "one WP = one PR = one changelog
entry" rule.

## WP-35: True dihedral bend constraint (opt-in "High" quality tier)

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase C. v1.0's honest notes were
explicit that the cloth solver's distance-based hinge/fold spring (not true
dihedral-angle) and brute-force O(N²) self-collision (not a GPU spatial
hash) were deliberate, documented trade-offs, not oversights. This WP
upgrades the bend constraint to a real opt-in "high quality" tier without
touching the existing default path at all, and investigates (but does not
ship) a GPU spatial hash — see "Not shipped" below for why.

### Added
- `cloth-lab/src/cloth/dihedralBend.js` — a plain-JS (no WebGL) reference
  implementation of a true dihedral-angle bend constraint, written and
  verified FIRST, before any GLSL: `dihedralAngle()` computes the actual
  signed angle between two triangles sharing an edge (atan2-based, stable
  through 0 and +-PI, not acos which blows up at both); `dihedralBendCorrection()`
  rotates only the two "wing" vertices around the fixed hinge line
  (Rodrigues' rotation) toward the hinge's rest angle — a deliberately
  simpler alternative to reproducing a textbook PBD closed-form gradient
  formula from memory, which carries real risk of a subtle, hard-to-verify
  sign or normalization bug (a well-documented hazard in PBD bend
  implementations). 13 property-based Vitest tests, including 40 random
  fold/rest combinations all converging to <10% of their starting error
  within 25 iterations, and an explicit "never moves off the hinge line"
  invariant check. One real bug caught and fixed by this harness before it
  ever reached GLSL: an inverted rotation sign that made corrections grow
  the angular error instead of shrinking it — caught by the very first
  convergence test run, not discovered later inside a GPU shader.
- `cloth-lab/src/cloth/assemble.js`'s `deriveNeighbors()` now also returns
  `bendHinge` — for each of the existing `bend` neighbor pairs, the shared
  edge's two endpoints and the rest dihedral angle, computed once at mesh-
  build time and packed at the SAME per-particle slot index `bend` itself
  uses (so the GLSL port can read a neighbor's index from `bend`'s own
  texture and its hinge data from this one at the same slot, no separate
  index texture needed). One real slot-alignment bug caught and fixed
  before shipping: an early version only advanced its output slot on a
  successful (non-degenerate) hinge, which would silently shift every
  later hinge down by one slot relative to `bend`'s own indices — caught
  by a regression test built from a closed hexagonal fan mesh (every
  outer vertex genuinely has 2 bend neighbors, unlike the single-hinge
  quad fixtures, which can't distinguish "aligned" from "trivially
  aligned because there's only one slot to get right").
- `cloth-lab/src/cloth/ClothSimulation.js`: a `qualityTier` constructor
  option (`'default'` | `'high'`, exported as `QUALITY_TIER_DEFAULT` /
  `QUALITY_TIER_HIGH`). `'high'` compiles a shader variant carrying a
  direct, mechanical GLSL translation of `dihedralBend.js` (same variable
  names and structure, so a discrepancy between the two is easy to spot)
  that REPLACES the default distance-based bend correction — a "second
  bend mode," not an additional pass stacked on top of it, since running
  both at once would fight each other. Verified stable directly against
  the running GPU state (not just visually): stepped a real garment
  simulation 1320 substeps (~22s simulated) on the high-quality tier via
  `gl.readRenderTargetPixels()` on the solver's own position texture —
  zero NaN/Infinity at every checkpoint, bounds converged and stayed flat
  rather than drifting, and the resulting shape differs measurably from
  the default tier's (proving the new constraint is genuinely engaging,
  not silently falling through to a no-op).
- `cloth-lab/src/ui/FabricPanel.jsx`: a "Simulation quality" toggle
  (Default / High) next to the existing fabric picker, threaded through
  `App.jsx` → `Scene.jsx` → `ClothMesh.jsx`. Unlike fabric switching
  (a live uniform swap), changing quality tier rebuilds the simulation —
  it changes the compiled shader and uploaded textures, not just a
  float value.

### Changed
- `README.md`'s honest-notes entry for the cloth solver's bend/self-
  collision trade-offs updated to describe the new opt-in tier and why
  self-collision specifically doesn't get an equivalent upgrade (below).

### Not shipped: GPU spatial hash for self-collision
`GPUComputationRenderer` (this solver's plain-WebGL2 GPGPU approach, no
compute shaders) has no atomics or scatter-write access, so a real
uniform-grid spatial hash — the kind you can actually iterate per-cell —
needs either a scatter-with-atomics compaction pass or a full bitonic sort
to build the per-cell particle index lists, neither available here. A
cheaper middle ground (bucket each particle into a coarse grid cell,
skip far-apart pairs before the expensive math) was implemented as a
prototype and deliberately not kept: profiling the existing brute-force
loop showed its dominant cost is the two texture2D fetches per inner
iteration needed just to find out where the other particle IS — a
cell-based early-out can only skip the cheap sqrt/branch AFTER that fetch
already happened, so it doesn't touch the actual bottleneck. Shipping code
that adds real complexity and risk for a not-actually-measurable win would
be worse than shipping nothing; self-collision stays exactly the
brute-force O(N²) scan it already was, in both quality tiers. Closing this
for real would mean adopting WebGPU compute shaders or a from-scratch,
independently verified bitonic sort — a materially larger undertaking than
an opt-in tier, flagged here as a real follow-up rather than silently
dropped a second time.

## WP-23: ComfyUI local image-gen adapter

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase B. `js/image-providers.js`
explicitly deferred ComfyUI as future work in WP-4: its node-graph API is
substantially more complex than Automatic1111's simple REST contract, and
pulling in an unfamiliar workflow format risked a worse outcome than
shipping Automatic1111 alone. That reasoning was sound for v1.0; it's a
real gap now that Automatic1111 has proven the local-image-gen adapter
pattern out.

### Added
- `js/image-providers.js`: a `comfyui` adapter matching every other image
  adapter's interface exactly — `test()`/`generate()`, no key needed, one
  optional base-URL field. `test()` hits ComfyUI's real `/system_stats`
  endpoint and reports its version + VRAM. `generate()` ships one
  hardcoded text-to-image workflow graph (CheckpointLoaderSimple →
  CLIPTextEncode ×2 → EmptyLatentImage → KSampler → VAEDecode →
  SaveImage) — not a user-editable node graph, deliberately out of scope
  — submits it to `/prompt`, polls `/history/{prompt_id}` until it
  renders, then fetches the output via `/view` and normalizes it to a
  data URL like every other adapter. The checkpoint to run is
  auto-detected from `/object_info/CheckpointLoaderSimple` (whatever's
  actually installed on the target instance) rather than guessed — a
  fresh ComfyUI install with no checkpoint model fails with an honest
  "install a checkpoint" message instead of a confusing 400. Reference
  photos (`images`) are silently ignored (no img2img/LoadImage wiring
  yet), the same way every adapter here treats input it doesn't support.
- `js/app.js`: the Settings → AI Provider → Image generation pane's
  "Test Connection" button — previously text-provider-only, since no
  image adapter had a `test()` method before this — now renders for any
  image adapter that defines one (`comfyui` is the first). "Fetch
  models" stays text-only; ComfyUI has no comparable models-list API
  (`generate()` auto-detects its checkpoint instead of exposing a model
  slot to pick from).
- `browserLocalHint`/CORS help-note wiring: a `comfyuiHint` string
  (EN+AR) explaining the hardcoded-workflow/no-img2img scope, plus the
  existing `localServerCorsHint` (ComfyUI also rejects cross-origin
  requests by default without `--enable-cors-header`).
- `test/image-providers.test.js`: 5 new tests — real `/system_stats`
  parsing, a clean failure when unreachable, a full
  detect-checkpoint → submit → poll → fetch round trip against a mocked
  ComfyUI instance, an honest failure with no checkpoint installed
  (never guesses one), and an honest timeout if rendering never
  finishes. `generate()`'s poll interval/timeout are now
  opts-overridable so the round-trip and timeout tests don't burn real
  wall-clock time — production callers never pass either override.

### Changed
- README: capability table + honest notes updated — ComfyUI is no longer
  listed as deferred; SD.next remains the one unimplemented local
  image-gen backend.

## WP-39: real segmentation model for the AI silhouette read

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase B. `js/ai.js`'s
`analyzeImage()` was a border-adaptive colour-threshold heuristic only,
documented as misreading busy or low-contrast photos (a dark garment
against a dark background in particular, since the whole approach is a
colour-distance-from-border test) — v1.0 named RMBG-1.4/U²-Net/SAM-tiny
as deferred replacements pending Route B/C worker infrastructure, which
WP-21/WP-22 now provide.

### Added
- `js/ai.js`: `analyzeImage(dataURL, opts)` accepts an optional
  `opts.segment(imageData) -> Promise<{width,height,data}>` callback — a
  real learned foreground/background matte, used in place of the colour-
  threshold test when supplied. Everything downstream (per-row largest-
  run scan, neckline-gap detection, hem-shape read) is byte-identical
  either way; only which pixels count as "foreground" changes. No
  `opts`/a callback that fails falls back to the exact pre-existing
  heuristic. New `sampleMatte()` — nearest-neighbour lookup from the
  180px-wide working canvas into a (different-resolution) matte's own
  grid — is the one piece of genuinely new, independently-testable logic
  here.
- `js/workers/local-model-worker.js`: new `loadRoute` route
  `"segmentation"` and `runSegmentation` message, loading a Hugging Face
  matting/segmentation model via transformers.js's `AutoModel`/
  `AutoProcessor` directly — confirmed empirically that the generic
  `pipeline('image-segmentation', …)` helper rejects every real
  background-removal architecture tried against this pinned transformers.js
  version (briaai/RMBG-1.4's real `SegformerForSemanticSegmentation`
  architecture and `modnet` itself both raise "Unsupported model type").
  `Xenova/modnet` is the one model family actually verified end-to-end —
  real load, real forward pass, real [1,1,H,W] alpha-matte output, clearly
  differentiated on a synthetic humanlike test image (foreground
  ~0.98-0.9998, background ~1e-6). Runs WASM-only: a "try WebGPU, fall
  back to WASM" attempt (matching route "hf"'s own pattern) was tried and
  reverted after real testing found `AutoModel.from_pretrained
  ({device:'webgpu'})` reports success even with no GPU adapter present,
  with the real failure only surfacing on first forward pass and NOT
  reliably catchable/retryable within the same loaded model+processor pair
  — a genuinely device-less environment (this repo's own headless e2e
  suite included) reproduced a stuck WebGPU error that persisted even
  after explicitly retrying with `{device:'wasm'}` in the same worker. A
  real synthetic warm-up forward pass at load time still fails fast and
  honestly if a model can't run at all.
- `js/ai-providers.js`: `loadSegmentationModel()`, `runSegmentationOn()` —
  UI-driven entry points, not part of the `AIProviders` adapter map (same
  reasoning as Route B's own functions: this request shape doesn't fit
  the shared adapter contract).
- `js/app.js`: Settings → AI Provider → Text generation gets a new
  "Silhouette segmentation model (optional)" field, orthogonal to
  whichever provider is selected above — empty by default, a Hugging
  Face model ID when set. Wired into both places `analyzeImage()`/
  `AIGen.generate()` already run (the vision-fusion pixel-read path and
  the local-generation fallback path). New `segModelLabel`/`segModelHint`
  i18n strings, EN+AR.
- `test/ai.test.js`: 3 new `sampleMatte()` tests (pure, DOM-independent).
- `e2e/smoke.spec.js`: one new Playwright test against the real
  `Xenova/modnet` model (not mocked) — real load, real forward pass on a
  synthetic humanlike photo, confirms `metrics.segmented` is `true` with
  a model configured and falsy with none, proving the byte-identical
  fallback claim for real rather than by inspection.

### Honesty note — scope actually verified this pass
The plan's specific acceptance wording — "a genuinely low-contrast
dark-garment-on-dark-background **real photo** that the threshold scan
misreads produces a correct silhouette" — was **not** conclusively
verified. MODNet is trained on real photographic texture; flat vector
canvas art (tried repeatedly during this WP's investigation) didn't give
it a reliable foreground signal even for shapes that worked fine on a
plain background, so a synthetic low-contrast test would have measured
this reader's own canvas-art limitations, not the model's real-photo
accuracy. What IS verified: the full pipeline is real (real model, real
inference, real differentiated matte, real fallback behavior). Real-photo
field verification of the specific low-contrast claim is the natural
follow-up — the same class of gap WP-22/WP-30/WP-40 already document
elsewhere in this plan for things that need real hardware/data, not more
code.

## WP-22: field-test Route C end-to-end — verification only, no code change

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase B. Route C (a Hugging Face
model ID, run in-browser via `js/workers/local-model-worker.js`) was real,
working code but had never been exercised with a genuine multi-hundred-
megabyte model download end-to-end — v1.0's own honest notes said
"structurally verified, not fully field-tested." This WP is that field
test, run for real against the live app in a real browser, four separate
load attempts across three different real Hugging Face model IDs.

### Investigated (real numbers, real errors, not estimated)
- `Xenova/TinyLlama-1.1B-Chat-v1.0`: 149.7s wall time, then a real
  onnxruntime-web session-creation failure — `Failed to load external
  data file "model.onnx_data" ... Module.MountedFiles is not available`.
  This runtime can't load a model whose weights are split across a
  separate `.onnx_data` file (needed once a model exceeds onnxruntime-
  web's single-file size limit).
- `Xenova/Qwen1.5-0.5B-Chat`: 577.8s (9.6 minutes) wall time, then a real
  404-class failure — transformers.js's default quantized-filename guess
  doesn't match this repo's actual file layout. The 9.6-minute wait
  before that error surfaced is itself a real finding, independent of
  the root cause.
- `Xenova/distilgpt2`, attempted immediately after the TinyLlama failure
  in the SAME cached worker instance (`js/ai-providers.js`'s
  `getLocalWorker()` singleton): failed with the **identical** error text
  and the identical internal ONNX tensor name (`onnx::MatMul_6729`) as
  the TinyLlama failure — for a completely different model. Confirmed by
  reloading the page (a fresh worker) and retrying the exact same
  `Xenova/distilgpt2` request: it succeeded cleanly (49.4s load, real
  81.9MB text-generation model). **Real bug found:** a failed
  `InferenceSession.create()` leaves the shared worker's onnxruntime-web/
  WASM state permanently corrupted for the rest of that page session —
  every later load attempt fails identically regardless of which model
  is requested, until the page is reloaded. Not fixed as part of this
  WP (verification-only, per its own acceptance criterion) — flagged as
  a real, well-scoped follow-up.
- A real successful end-to-end run: `Xenova/distilgpt2` on a fresh
  worker — real download+cache+load (49.4s) and a real generated
  completion from `browserLocal.complete()` (14.3s first inference,
  genuine if low-quality text from an 82M-param model, not stubbed).
- `js/app.js`'s Test Connection button (`testBtn.onclick`, both the
  Route C and Route B call sites) never passes an `onProgress` callback
  to `adapter.test()`/`runOnnxTestInference()` — confirmed by reading the
  code, not assumed. The worker's own real progress percentages
  (`{type:"progress", pct}`) exist and are used by the load-with-toast
  flow, but Test Connection shows a static "Working…" label for the
  entire wait, up to the observed 9.6 minutes, with zero percentage
  feedback. A real, disclosed UX gap.
- Capability Probe badge: green (WebGPU available, generous buffer size)
  throughout all four attempts in this environment. Accurate about
  WebGPU adapter presence; did not predict or prevent either real
  failure above — it measures adapter capability only.
- Memory: the one successful load kept JS heap usage under ~30MB in this
  environment (not a fully isolated baseline — other page activity
  preceded the measurement).

### Conclusion
Route C's code path is real and does work end-to-end — confirmed with a
real model, real download, real cache, real in-browser inference. It is
NOT yet reliable across a full session: the worker-corruption bug above
means one bad model pick can silently break every subsequent attempt
until a reload, with no error message hinting at why. README.md's honest
note updated from "structurally verified, not fully field-tested" to the
real table above.

## WP-38: draft-program generation mode — design note (verify/design only, no code)

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase B. v1.0's own honest notes
named a "draft program" generation mode (an AI provider emitting a
sequence of construction operations against the real associative Point/
Line/Arc/Circle system, instead of one final `PatternSpecV1` object) as a
deferred stretch goal — explicitly scoped by this plan as "a short design
note (not code)... the seed for a real future WP," not an implementation.

### Added
- `docs/draft-program-design-note.md` (new): proposes a closed, schema-
  enumerable operation vocabulary (`defineVariable`/`placePoint`/
  `lineBetween`/`arcThrough`/`circleAt`/`offsetParallel`/
  `intersectionPoint`/`promotePiece`/`setPieceRole`), each mapped
  explicitly onto a real, already-shipped `js/canvas.js` function (line-
  referenced and verified against current source, not guessed) rather
  than proposing new geometry infrastructure. Documents that the
  validation story needs no new design at all —
  `js/ai-spec-pipeline.js`'s existing one-time geometry-validation retry
  for traced tech-pack pieces is the exact mechanism a draft program's
  output plugs into unchanged — and that the operation vocabulary's
  formulas ARE the existing Variables system's expression language
  (`evalExpr`), not a new one. Flags two real, disclosed gaps a future
  implementing WP would need to close (`offsetParallel`/
  `intersectionPoint` need small amounts of genuinely new geometry math;
  everything else is mechanical wiring), and notes the plan's own cited
  prerequisite (WP-25's real seam-pairing data) has already shipped, so a
  future WP isn't blocked on anything else in this document.

### Changed
- README: honest notes updated with a pointer to the design note;
  directory tree updated.

## WP-21: Local model Route B — a real .onnx file picker

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase B. Route B (pick a local
model file directly, no server) was honestly documented as not wired up:
GGUF genuinely isn't supported by any in-browser runtime, but `.onnx`
picks were also rejected — the IndexedDB/OPFS storage and
`onnxruntime-web` `InferenceSession` wiring it needs simply didn't exist
yet. That's the real gap this WP closes; GGUF stays exactly as
unsupported as before, correctly.

### Added
- `js/workers/model-file-cache.js` (new): a small IndexedDB/OPFS byte
  cache for one user-picked local model file at a time, shared unmodified
  between the main thread and the worker. Files up to ~2GB are cached
  directly in IndexedDB; a raw `.onnx` export above that goes to OPFS
  instead. `getModelFileMeta()` reads metadata (name/size/storage) without
  ever touching the bytes, so the Settings panel can cheaply show
  "cached: foo.onnx" on every render.
- `js/workers/onnx-shape-reader.js` (new): a small hand-rolled protobuf
  reader for exactly the fields `runOnnxInference` needs — a `.onnx`
  file's own declared per-input shape and element type
  (`ModelProto.graph.input[]`), not a pulled-in protobuf library. This
  exists because of a real finding from testing this WP end-to-end
  against a real model, not a guess: `onnxruntime-web@1.20.1`'s actual
  `InferenceSession` (and its internal handler) expose NO shape metadata
  at all on their JS API — confirmed by introspecting a live session's
  prototype (`inputNames`/`outputNames` only). The first version of this
  WP assumed a `session.inputMetadata` API that turned out not to exist,
  and a real `.onnx` file picked in a real browser failed with ORT's own
  "Got invalid dimensions" error as a result — caught by the real
  end-to-end e2e test below, not left for a user to discover.
- `js/workers/local-model-worker.js`: `.onnx` picks now run for real —
  bytes get cached (best-effort; persistence failure doesn't block using
  the model this session), then loaded through `onnxruntime-web` (pinned
  CDN import, WebGPU with a WASM fallback, exactly like Route C's own
  runtime preference), lazily and only on first use. New `file-restore`
  route reloads whatever's cached without the file-picker dialog
  reappearing. New `runOnnxInference` message: since an arbitrary `.onnx`
  file's architecture is unknown ahead of time (unlike Route C's
  text-generation pipeline), this runs a real forward pass against a
  synthetic zero-filled tensor per input, shaped and typed from
  `onnx-shape-reader.js`'s real read of the file (falling back to a
  documented guess — a common mobile vision-classifier shape — only when
  a dimension is genuinely dynamic/absent in the file itself, and saying
  so honestly per-input in the result; an input whose element type isn't
  one this reader synthesizes, e.g. float16/string, is reported rather
  than guessed at with a wrong byte layout) — proof the model actually
  executes on-device, not a meaningful read of real data.
- `js/ai-providers.js`: `loadLocalModelFromFile()`, `restoreLocalModelFromCache()`,
  `runOnnxTestInference()` — Route B's UI-driven entry points. Not part of
  the `AIProviders` adapter map (its request shape doesn't fit the
  `{system,messages,schema}`→`NormalizedResult` contract every other
  provider shares).
- `js/app.js`: Settings → AI Provider → Text generation → "browser-local"
  gets a Hugging Face model ID / Local .onnx file toggle. The file route
  gets its own panel — pick a file, see a real loaded/not-loaded status
  that is deliberately **never** persisted to `state`/localStorage (only
  in-memory, so a plain reload honestly reads "no model loaded" even
  though the bytes are still cached), a cache row with Load/Clear, and a
  "Run test inference" button reporting real output tensor shapes +
  latency. New `routeBToggleHF`/`routeBToggleFile`/`onnxHint`/
  `onnxPickFile`/`onnxLoadCached`/`onnxClearCached`/`onnxNoModelLoaded`/
  `onnxNoCached`/`onnxCachedLabel`/`onnxModelLoaded`/`onnxRunTest`/
  `onnxTestHint`/`onnxLoading` i18n strings, EN+AR.
- `test/model-file-cache.test.js` (new): 5 tests against a minimal
  in-memory IndexedDB shim (same no-new-dependency approach
  `test/ai-keystore.test.js` already used for `sessionStorage`) — the
  OPFS (>~2GB) storage branch isn't unit-tested, honestly noted inline,
  since exercising it needs an actual 2GB+ buffer.
- `test/onnx-shape-reader.test.js` (new): 4 tests against a real (327-byte)
  `.onnx` fixture, not a hand-crafted byte string that could accidentally
  match this reader's own bugs.
- `e2e/fixtures/tiny-classifier.onnx` (new): a real, tiny, valid ONNX graph
  (`GlobalAveragePool` → `Flatten` → `MatMul` → `Softmax`, static
  `[1,3,8,8]` float32 input) authored for this WP's e2e coverage — small
  enough to commit, real enough to actually load and run.
- `e2e/smoke.spec.js`: two new Playwright tests. One confirms Route B's UI
  renders the honest no-model/no-cache state against real Chromium
  IndexedDB. The other is the real end-to-end path this WP actually
  promises: pick `tiny-classifier.onnx` for real, run it through the real
  `onnxruntime-web` CDN import (WASM — no GPU device in headless
  Chromium), get a real `output [1×4] float32` inference result, reload
  the page and confirm the model does NOT silently reappear (the worker
  restarts fresh every reload), then confirm "Load cached model" brings
  back the same real cached bytes. This test is what caught the
  `onnx-shape-reader.js`-motivating bug above — the first version of this
  WP passed the lighter "UI renders" test while being silently broken end
  to end, which is exactly why this heavier test exists too.

## WP-40: adjudicate the ~5mm front/back parity finding — verification only, no code change

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase A. Check Pattern's
`seamLengthParity` check has flagged a consistent ~5mm front/back "side
length" delta across many catalogue garments since it first shipped,
undecided ever since: intentional (a deeper front neckline commonly does
shift things by a small margin) or a real defect.

### Investigated
- Every one of the 61 flagged pairs across the 164-pattern library (size
  M) differs by *exactly* 5.0mm — zero variance. A real, independent
  construction defect across dozens of unrelated garments would not land
  on the identical value every time; one deterministic authored source
  would.
- Traced to `js/ai.js`'s `buildTop()`: `necklinePts(style, chestW*0.42, 1)`
  for the front vs. `necklinePts({...}, chestW*0.3, 1.5)` for the back —
  the back neckline is drafted both narrower (`chestW*0.3` vs `0.42`,
  already a clearly intentional asymmetry) AND 0.5cm (5mm) higher/shallower
  (`y0=1.5` vs `1`) than the front — verified directly against real
  generated coordinates: `w01`'s front and back outlines share an
  identical hem Y; only the neckline-driven top-of-piece Y differs, by
  exactly 0.5cm.
- Only `AIGen.build()`-drafted garments (library.js's 94 entries, Quick
  Draft, AI-generated pieces) show this — `js/data.js`'s 6 hand-crafted
  patterns and the Fancy Collection (different construction entirely)
  don't.

### Conclusion: confirmed intentional, not a defect
The 0.5cm neckline-height offset is the back-neckline-narrowing choice's
companion parameter, not an independent oversight — narrower AND
slightly higher/shallower at the back neck is standard patternmaking
practice. `checkSeamLengthParity`'s own `SEAM_LENGTH_TOL_MM = 3` is
simply tighter than this legitimate variation, and its height-based proxy
(whole vertical extent, not the literal side-seam edge) conflates "the
neckline sits 5mm higher" with "the side seam is 5mm longer." No code
changed; no follow-up WP assigned. README's Honest notes updated with
this conclusion and its reasoning.

## WP-20: gathers & tucks wired into Quick Draft (skirt waist + sleeve cap)

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase A. `computeGatherWidth()`
and `computeTucks()` (`js/pleats.js`) were real, tested pure functions with
zero call sites anywhere in the codebase (confirmed by a repo-wide grep) —
only pleats had a generator hookup, in Quick Draft's skirt builder.

### Added
- `js/ai.js`: `buildSkirt()`'s waist-edge width now supports Gather
  (`computeGatherWidth`) and Tuck (`computeTucks`) alongside its existing
  Pleat option, picked via a priority chain (gather → pleat → tuck, never
  silently combined) so Quick Draft's UI only ever needs to set one.
- Extracted a shared `sleevePiece(style, m)` helper (`buildTop` and
  `buildRomper` drafted byte-identical sleeve geometry inline — a real
  duplication, now a single source) and gave it the same three-technique
  treatment for the sleeve cap's finished width
  (`sleeveGatherRatio`/`sleevePleatCount`/`sleeveTuckCount`) — a real
  gathered/pleated/tucked puff-sleeve cap, not sleeveWideF alone. `capW`
  stays byte-identical to before this option existed when none are set.
- Quick Draft (`js/app.js`): the old "Pleats: None/Light/Full" row is now
  "Waist Fullness: None/Pleat/Gather/Tuck" (skirt) with an Intensity
  (Light/Full) row that only appears once a real technique is picked; a
  parallel "Sleeve Cap Fullness" row appears for every AIGen-built kind
  with a real sleeve (dress/top/shirt/robe/romper — not `gown`, which has
  a sleeve length picker too but is drafted by `FancyGen.build()`, which
  never reads these fields). New `builderWaistTech`/`builderSleeveTech`/
  `builderIntensity`/`opt_pleat`/`opt_gather`/`opt_tuck` i18n strings, EN+AR.
- 17 new unit tests (`test/ai.test.js`) verifying the exact added-width
  formula per technique, the no-technique byte-identical baseline, and the
  buildTop/buildRomper shared-helper parity.

### Verified
Manually exercised both new controls end-to-end in the live app: Quick
Draft → Skirt → Waist Fullness → Gather → Full visibly widens the front/
back skirt panel's waist edge well beyond the waistband below it (a real
gathered waist, not a cosmetic label); Quick Draft → Top → Sleeve Cap
Fullness → Gather → Full visibly widens the sleeve piece's base while
keeping its cap peak centered.

## WP-19: Dart Transfer — pick the pivot on canvas

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase A. `transferDart()`
(`js/darts.js`) and its Dart Editor modal already worked — this closed a
missing *interaction*, not a missing feature: the pivot was two raw number
inputs defaulting to the dart's own apex, so transferring around an
external pivot (e.g. a bust point) meant already knowing that point's
coordinates, which defeats the point of transferring around a point you
can usually just see on the canvas.

### Added
- `js/canvas.js`: `Canvas.armPick(cb)`/`Canvas.cancelPick()` — a one-shot
  "pick a point on canvas" mode independent of the active drafting tool.
  The very next `pointerdown` (regardless of `tool`) is intercepted, run
  through the same snap affordance the Point construction tool already
  uses (magnet to an existing construction point, else grid-snap), and
  handed to the callback instead of doing whatever that tool normally
  does; then it disarms itself.
- Dart Editor's Transfer row gets a new "Pick on canvas" button. Clicking
  it closes the modal (so the real canvas underneath is clickable), arms
  a pick, and reopens the same modal with that dart's Pivot X/Y (and the
  angle you'd already typed) pre-filled from the click — construction
  point, dart apex, or empty canvas space all work, and the numeric
  inputs stay directly editable afterward. New `dartPivotPick`/
  `dartPivotPickHint` i18n strings, EN+AR.
- Escape now also cancels a still-armed pick (alongside its existing
  close-every-overlay behavior), so backing out mid-pick doesn't leave a
  stray click armed against whatever you click next.

## WP-24: implement the Ease check via a real construction-time hint

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase A. Check Pattern's Ease
check was documented as "not implemented at all" — the earlier author's
reasoning was that it needed a second, unverifiable heuristic (which edge
*is* the chest measurement) stacked on the seam-pairing heuristic. This
document disagreed: the data to answer that deterministically already
exists at the point each piece is drafted.

### Added
- `chestEdgeIndices` piece metadata (`js/data.js`, `js/ai.js`) — a
  one-element index into `outline`, populated at construction time for
  every simple cut-on-fold bodice front/back where the chest vertex is
  unambiguous: `womens_dress`/`mens_shirt`/`thobe`/`girls_dress` (5 of
  data.js's 6 hand-crafted patterns — `abaya`'s open, un-folded front is
  deliberately unhinted; its cut-on-fold back is), and `buildTop`/
  `buildRomper` (covering the bulk of `library.js`'s 94 entries). Wrap
  fronts (`buildTop`, `style.wrap`) and princess-seamed/asymmetric-front
  Fancy Collection designs are deliberately left unhinted — the
  fold-doubling assumption the check relies on doesn't hold for either.
- `js/validate.js`: `checkEase(piece, bodyChestCm)` is now a real
  per-piece check (was a single always-deferred stub) — a hinted piece's
  vertex X is its half-contribution to one side of the finished garment
  at fold-doubled width; assuming its usual counterpart contributes
  about the same (true for every generator that populates the hint)
  gives a real, checkable finished-chest estimate. `MIN_WEARING_EASE_CM`
  (5cm) is an absolute floor — a commonly-cited minimum for a woven
  bodice to allow movement at all, not a fitted-vs-relaxed style target
  (that needs garment-intent context this check doesn't have, which is
  why the zone between 0 and the floor is "warn," not "pass" or "fail").
  A piece with no hint, or no body chest supplied, reports "Not
  applicable" — never guessed at.
- `run(pieces, ctx.bodyChestCm)` — threaded through `js/app.js`'s Check
  Pattern (`currentMeas().chest`) and `js/berry-studio-api.js`'s
  `BerryStudio.validate({bodyChestCm})` automation API.
- The "Not yet checked" status label is now "Not applicable" (`cp_deferred`,
  EN+AR) — it was written for a whole-report always-deferred stub; a
  per-piece "not applicable to this piece" reading needed the more
  accurate wording. The hardcoded Ease banner in Check Pattern's modal is
  gone — Ease now renders as a normal per-piece chip like every other check.

### Fixed (caught while verifying in the live app, not in the unit tests)
- `checkEase`'s first implementation read a hinted vertex's raw absolute
  X as its half-chest width — correct for a piece straight out of a
  generator, but `Canvas.getPieces()` (Check Pattern's real caller)
  returns every piece already shifted by an arbitrary per-piece layout
  offset (`layoutPieces()` positions pieces left-to-right on the 2D
  canvas — the exact same issue cloth-lab's `importFromApp.js:relocalize`
  exists to work around). Manual verification in the live app surfaced
  it directly: the same "Fitted Dress" that a Node-level library sweep
  reported as Ease-warn showed "Pass" in the actual Check Pattern modal.
  Fixed by measuring from the piece's own fold edge (leftmost X extent —
  the same convention `checkFoldSymmetry` already establishes) instead of
  raw absolute X; added a translation-invariance regression test.

### Found (real issues, not adjudicated here — see Honest notes)
Running the new check over the full library (size M, real body
measurements) found real things on its first pass: 93 pieces pass, 30
warn, and **8 pieces genuinely fail** (their drafted chest is smaller
than the body they're drafted for) — all from library.js's "Fitted"
preset (`fitF` as low as 0.85, no stretch-fabric flag). Whether that's a
legitimate negative-ease assumption (stretch knit) or a real defect isn't
decided by this WP — tracked alongside WP-40's ~5mm finding as the same
class of open, human-adjudication question.

## WP-25: real, declared-role front/back pairing for Check Pattern

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase A — the sequencing
recommendation's WP-25, the one foundational item Phase A's remaining
quick/mid items build on.

### Changed
- `js/validate.js`'s Check Pattern **seam-length parity** and **notch
  alignment** checks paired every front/back piece by name-guessing alone,
  even for pieces that already carry a real, declared `role` from their
  generator (`js/data.js`, `js/ai.js`, `js/fancy-patterns.js` — WP-6
  metadata, the same vocabulary `cloth-lab/src/pattern/roles.js` already
  uses to build real 3D seams). Added `pairByRole()`: pairs on that
  declared relationship first (reported **"Verified"**) when exactly one
  piece of each role in a `ROLE_PAIR` exists in the set; anything left
  over falls back to the pre-existing name-matching heuristic (reported
  **"Heuristic"**), same as before this change. The comparison math itself
  (seam-length parity's height proxy, notch alignment's arc-position
  proxy) is unchanged — only pairing confidence changes.
- `js/app.js`'s `cpChip()` now takes a `confidence` mode
  (`null`/`'verified'`/`'heuristic'`) instead of a hardcoded `heuristic`
  boolean on every crossPiece chip, and renders a green "Verified" badge
  (new `cp_verified`/`cp_verifiedNote` i18n strings, EN+AR) alongside the
  existing "Heuristic" one.
- Across the 164-pattern library (size M): 148 crossPiece pairs went from
  Heuristic to Verified; 71 honestly remain Heuristic
  (`js/ai.js`'s `buildTrousers`/`buildSkirt`, which deliberately declare
  no placement role — same reason cloth-lab doesn't place trouser legs in
  3D either — plus the abaya's asymmetric open-front construction); 23
  correctly flagged unpairable. `test/validate-library.test.js` adds a
  round-trip regression test asserting this doesn't silently drop.

### Fixed (found while verifying this WP's cloth-lab claim against source — rule 7)
- This WP's premise included "`importFromApp.js` rejects Fancy Collection
  designs on principle." Direct testing (widening
  `cloth-lab/src/pattern/importFromApp.fancyCollection.test.js`'s coverage
  from the original 24 designs to the current 64 — it had quietly stopped
  covering the 40 added later) showed that premise was stale: cloth-lab's
  WP-6 role-declared metadata path already handles Fancy Collection pieces
  via real geometric edge derivation, not name-guessing. It did catch one
  real, narrow bug: `role:"epaulette"` (6 designs' "Shoulder
  Epaulette"/"Shoulder Tab" piece) was authored in `js/fancy-patterns.js`
  but never registered in `cloth-lab/src/pattern/roles.js` — `resolveSchemaRole`
  returned `null`, so `convertAppPattern` fell back to `classifyLegacy`,
  which can't tell front from back from that name and silently dropped
  the piece on import. Fixed: registered `epaulette` → `attachNeck`
  placement (matching its real shoulder/collar position — the generic
  `attachBody` fallback would have placed it at hip height). Added
  `"epaulette"` to `schema/pattern-spec.v1.json`'s role enum too, for
  consistency, and regenerated `js/vendor/pattern-spec-validate.generated.js`.
- `importFromApp.fancyCollection.test.js`'s id regex and sanity-check
  count are now `f\d+`/64 (were `f0[1-6]`/24) so this can't quietly narrow
  back down as more Fancy Collection designs ship.

## WP-26: fix the Fancy Collection duplicate-outline-point bug

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase A (drafting & construction
completeness) — the sequencing recommendation's WP-26, done first per its own
"confirmed bug with zero design risk and no flag needed."

### Fixed
- Check Pattern's `closedOutline` check was failing on 67 Fancy Collection
  piece instances across 30+ unique designs (`js/fancy-patterns.js`) with a
  "duplicate consecutive point" — a real, reproducible bezier-sampling
  boundary bug, not a false positive. Traced to exactly four shape helpers:
  `godetPc`, `capePc`, and `peplumPc` each sample a final curve segment that
  sweeps back and re-lands exactly on the shape's own `[0,0]` origin point;
  `princessBodice()`'s neckline curve (for "sweetheart"/"scoop"/default
  necklines) is defined to end at the exact same coordinate
  (`[shoulderX, topY]`) where the princess seam curve begins. Both cases
  left the literal duplicate coordinate in the outline array — the
  wrap-around edge `checkClosedOutline` treats as implicitly closing the
  shape then found the same point twice in a row.
- Fixed at the source with two small, reusable dedupe helpers rather than
  filtering downstream: `dedupeClose(pts)` drops a polyline's trailing point
  when it coincides with its own first point (godet/cape/peplum); `dedupeJoin(a, b)`
  drops `a`'s trailing point when it coincides with `b`'s leading point
  (the princess-bodice neckline join). Both only fire on genuine coordinate
  equality, so neckline variants that don't share an endpoint (e.g.
  "offshoulder") are untouched, and `princessBodice()`'s WP-14 curve/edge
  index metadata (`frontCurveOffset`/`backCurveOffset`) was updated to track
  the now-possibly-shorter neck arrays — verified the curve segment chain
  and princess-seam edge indices still line up correctly after the fix.

### Added
- `npm test` (`test/validate-library.test.js`) now hard-asserts zero
  `closedOutline` failures across the full pattern library, so this exact
  class of bug can never silently regress.

## WP-27: extend curve metadata to every qBez() call site, not just princess seams

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase A. `piece.curves` (WP-14)
fed DXF's curve layer (layer 3) for princess seams only — `princessCurve()`
was the one function that emitted it, since it builds cubic segments
directly with authored `c1`/`c2`. Every other curved shape in
`js/fancy-patterns.js` samples a QUADRATIC bezier via `qBez()` (46 call
sites across ~16 shape helpers: `sleeve2pc`, `sleeve1pc`, `collarStand`,
`shawlCollar`, `lapelFacing`, `pocketPc`, `godetPc`, `hoodHalf`, `yokePc`,
`peplumPc`, `sashPc`, `tierPc`, `capePc`, `jacketFrontBack`, `gorePanel`,
`wrapPanel`, `trouserPanel`, plus `princessBodice`'s own neckline/side-seam
calls) — necklines, sleeve caps, collars, godets, capes, peplums, jacket
fronts, gores, trouser crotch seams all stayed flattened-polyline-only.

### Added
- `qBezToCubic(p0, c, p1)` — exact quadratic→cubic degree elevation (not
  an approximation): a cubic bezier with these control points traces the
  IDENTICAL curve as the quadratic, so every `qBez()`-built curve can
  carry the same real metadata `princessCurve()` already does, with zero
  change to any already-flattened point.
- `withCurves(outline, curves)` / `hoistCurves(pieces)` — rather than
  changing every shape helper's return type (which would have meant
  editing ~300 individual `outline: someHelper(...)` piece-literal call
  sites across the file), each helper attaches its curve metadata to the
  outline array it already returns unchanged; `hoistCurves()` copies it
  onto the owning piece once, centrally, at this file's only two piece-
  registration points (`def()` for the 64 named designs, `FancyGen.build()`
  for Quick Draft's 4 generic kinds) — never overwriting a `curves` a
  piece already declares explicitly (princessBodice's frontCenter/
  backCenter combine their neckline AND princess-seam curves that way).
- `princessBodice()`'s `frontSide`/`backSide` (the princess side panels)
  get real curve metadata for their own side-seam-to-bust curve for the
  first time — previously only the princess-seam edge itself had any.

### Verified (exhaustively, not spot-checked)
- Every outline point across all 70 patterns (6 hand-crafted + 64 Fancy
  Collection) is confirmed byte-identical to the pre-WP-27 source —
  compared programmatically, not by eye, across 656 pieces.
- Every one of the 911 resulting curve segments is confirmed to actually
  reproduce its own piece's real flattened outline points (re-sampling
  the reported cubic and diffing against `outline`), not just claim to —
  added as a permanent regression test
  (`test/fancy-patterns-curves.test.js`).
- Exporting all 64 Fancy Collection designs to DXF produces a non-empty
  curve layer — verified both via a Node-level sweep and live in the
  running app (`window.BerryStudio.export('dxf')` on a real loaded
  design).

### Fixed (caught by the geometric verification above, not by eye)
- That same verification found a real, pre-existing bug in 3 of 4
  princess-bodice neckline variants (sweetheart/offshoulder/scoop): the
  `qBez()` call that builds the neckline samples a curve whose own
  starting point (`p0`) sits several centimeters from `frontCenter`'s
  literal first outline point — a genuine jog in that construction that
  predates this WP (outline geometry is unchanged, confirmed above) and
  is not fixed here. Attaching neckline curve metadata for those three
  would have been wrong metadata, not just incomplete, so they correctly
  get no neckline curve entry (their princess-seam curve is still real
  and present) — the same "no hint, no guess" convention this file's
  other checks already use.

### Merged with WP-26 (real integration, not a picked side)
WP-26 (above) and this WP both rewrite `godetPc`, `capePc`, `peplumPc`, and
`princessBodice()` — not just nearby lines, the same lines, for two
different reasons. Combined naively, WP-27's hardcoded curve `toIdx`
values would go stale: WP-26's `dedupeClose()`/`dedupeJoin()` can make an
outline (or `frontNeck`/`backNeck`) one point shorter than WP-27 assumed
when it computed those indices, leaving a `toIdx` that points one past
the array's new end.
- `dedupeCloseWithCurves(pts, curves)` — the combined form of
  `dedupeClose()` for `godetPc`/`capePc`/`peplumPc`: dedupes as before,
  and if a point actually got removed, drops any curve segment whose
  `toIdx` pointed at that now-gone index rather than emitting a
  metadata entry that points nowhere (or, worse, silently mismatches
  once `outlinePathOps`' own bounds check quietly falls back to a
  straight line for it) — the same "no hint, no guess" principle as the
  neckline case above, not a special case invented for this merge.
- `princessBodice()`'s neckline-curve `toIdx` no longer assumes
  `frontNeck.length`/`backNeck.length` unconditionally — a first pass at
  this merge tried exactly that and it was itself wrong, caught by
  re-running `test/fancy-patterns-curves.test.js` against the merged
  code (24 real mismatches, up to 0.51cm off). The actual rule: when
  `dedupeJoin()` removes a point, the curve's true endpoint moved to
  `frontCurve[0]`/`backCurve[0]` (one index further than
  `frontNeck.length`/`backNeck.length`), not to the index the dedupe
  left behind. `neckCurveToIdx()` checks whether the dedupe fired for
  *this* neck/curve pair rather than assuming it always does, and picks
  the index accordingly. Re-verified end to end after the real fix: all
  64 Fancy Collection designs' outlines stay byte-identical to their
  pre-merge geometry, and all 877 curve segments across those 64 designs
  (569 of 633 pieces carry curve metadata) still reproduce their own
  piece's real flattened points (same checks WP-27 ran originally,
  re-run against the merged result).

## Cloth Lab: simulated pieces render in their real 2D-canvas color

### Fixed
- Cloth Lab's **Cloth** view (the live GPU simulation) rendered the entire
  garment in one hardcoded flat material color (`#c9cedb`) regardless of
  what colors were actually assigned to each piece in the 2D canvas's
  Layers panel; the **Pieces** debug view used its own fixed id/role→color
  lookup table, unrelated to the real piece colors either.

### Added
- The 2D canvas's own per-piece `color` (Layers panel swatch/picker) now
  threads all the way through the postMessage bridge
  (`js/app.js`'s `buildClothLabPayload()`) into cloth-lab's import/seam-
  authoring/triangulation/assembly pipeline
  (`importFromApp.js` → `seamAuthoring.js`/`piece.js` → `triangulate.js` →
  `assemble.js`) as a real per-render-vertex color attribute, correctly
  converted from sRGB to the renderer's linear working space. **`ClothMesh.jsx`**
  now uses `vertexColors: true` with a white material base instead of a
  fixed color, so each simulated piece's fabric tints to its own real
  color while keeping the shared PBR/fabric-texture properties. **`StaticPiecesDebug.jsx`**
  (Pieces view) now prefers the same real color, falling back to its old
  fixed lookup table only for a piece with no color at all. The default
  T-shirt fixture (`tshirt.js`, no bridge import) was given the same
  colors the old debug-only lookup table used, so its own look is
  unchanged.
- Render vertices are never deduplicated across pieces in this pipeline
  (only their positions are synced via a shared sim particle at a welded
  seam — see `assemble.js`), so there's no seam-boundary color-blending
  ambiguity to resolve: every render vertex belongs to exactly one piece,
  unambiguously.

### Scope decision (not a silent gap)
The **Weld** (weld-topology: interior/seam/multi-piece-corner) and **Seams**
(seam-authoring: pending/assigned/unassigned) debug views keep their own
existing diagnostic coloring rather than switching to real piece colors —
recoloring either would destroy the specific structural/state signal that
is that view's entire purpose, with no other view providing it. Real
per-piece color was added everywhere else: Cloth, Pieces, and (already
working via the existing part-level `partsFabric()`/`fabricState`
mechanism, verified unchanged) the root app's separate 3D Preview tab.

## Tech-pack tracing: read a technical flat-sketch image's actual measured pieces, not a style-factor guess

### Fixed
- The previous "Generate Pattern Pieces From This" pipeline (sourced from
  the billboard's worn-garment **photo**) was the wrong tool for a
  **technical flat-sketch / tech-pack image** — an AI-drawn spec sheet with
  individual piece diagrams and printed dimensions (front bodice, back
  bodice, sleeve, neck facing, front placket, drawstring cord/tunnel, hem
  curve, etc.). A photo of a worn garment only ever yields *relative*
  proportions (longer/shorter, fuller/slimmer); it cannot give exact
  measurements, and running the local silhouette heuristic against one
  produced a generic, unrelated pattern (reported directly: "a completely
  irrelevant useless pattern"). Tech-pack images need their printed numbers
  *read*, not guessed.

### Added
- **`pieces[].outlineCm`, `pieces[].label`, `garment.referenceMeasurementsCm`**
  (`schema/pattern-spec.v1.json`) — an opt-in, schema-validated exception
  for technical flat-sketch images specifically: a vision-capable provider
  can emit a piece's actual traced outline in centimeters (read directly off
  the image's own printed dimensions) instead of a relative style factor,
  plus a proper garment-specific label (e.g. "Front Placket") and, if the
  reference image prints its own body-measurement table, the measurements
  that table was drafted for.
- **`AIGen.buildFromMeasuredPieces(spec, measurements)`** (`js/ai.js`) — turns
  traced `outlineCm` pieces into real pattern pieces: non-uniform 2-axis
  scaling (`scaleFactors()`) rescales the reference sheet's own body to the
  actual wearer's measurements when `referenceMeasurementsCm` is given
  (chest/waist/hips-driven width, backLen/height-driven length), or uses the
  traced coordinates exactly as given otherwise. Runs through the same
  `PatternValidator` every other AIGen-built piece does.
- **`generateFromSpec()` measured-pieces routing** (`js/ai-spec-pipeline.js`)
  — detects `pieces[].outlineCm` in a validated spec and routes to
  `buildFromMeasuredPieces()` instead of `specToStyle()`+`AIGen.build()`,
  with its own one-time geometry-validation retry (distinct from the
  existing JSON-schema-validation retry): if the traced geometry fails
  `PatternValidator` (self-intersection, non-closed outline, etc.), the
  specific failing checks are fed back to the provider for one corrective
  attempt before honestly falling back.
- System prompt now explains **two distinct modes** to the model — relative
  style factors for a photo/text-only prompt, versus literal `outlineCm`
  tracing for a technical flat-sketch/tech-pack image — plus a 4th few-shot
  example demonstrating the tech-pack mode.
- **"Read Pattern Pieces From This Tech-Pack"** — a new button on the
  Fashion Billboard's *drawn pattern* card (`bbPattern`, the AI-drawn
  tech-pack image), sourced from that image rather than the worn-garment
  photo, with a prompt that steers the provider toward literal tracing. The
  existing "Generate Pattern Pieces From This" button (photo card) is
  untouched and still uses relative style factors, now documented honestly
  as such in its own hint text.

### Note
This mode is only as good as the configured **Text Generation** provider's
vision capability — it needs a real, vision-capable model actually reading
the image's printed numbers, not the local pixel-analysis fallback (which
cannot read text/dimensions off an image at all). No provider configured,
or a non-vision model selected, falls back to the existing photo-heuristic
behavior with an honest toast, never a silently wrong pattern.

## Fashion Billboard: generate real pattern pieces from the AI photo, not just a background trace

### Added
- **"Generate Pattern Pieces From This"** (AI Fashion Billboard section) —
  a new button on the generated billboard photo that runs the exact same
  prompt/image → vector-pieces pipeline the AI Pattern Generator's own
  prompt box uses (spec-first via a configured provider, with vision
  fusion when an image is involved; falling back to the local silhouette
  heuristic otherwise), sourced from the billboard photo instead of a
  user-uploaded inspiration image. Reads the garment's neckline/hem/
  flare/colour from the photo and drafts real, editable pieces straight
  onto the canvas — the existing "Use as Background Trace" path (manual
  tracing) is untouched and still available for the separately-generated
  tech-pack-style pattern *drawing*, which is a flat illustration, not a
  worn-garment photo, and isn't what this new pipeline is designed to read.
- Extracted `runAI()`'s core logic into a shared `generatePatternFrom(prompt,
  imageDataURL, btn, doneToastKey)` (`js/app.js`) so both entry points run
  byte-identical generation logic — no duplicated pipeline to drift out of
  sync.

### Fixed (diagnosis, not a code bug)
- Traced a report of "the AI pattern generator always produces the same
  output regardless of prompt or image" to a **configuration** issue, not
  a drafting-engine bug: the account's **Text Generation** provider
  (Settings → AI Provider) was set to **Ollama (local)** — a local server
  that wasn't running — so every generation attempt failed to reach it and
  silently fell back to the offline heuristic; the account's real OpenAI
  key was only ever configured under the separate **Image Generation** tab
  (which is why the Billboard's photo generation worked). Verified the
  underlying engine itself does vary correctly per prompt/image (5
  distinct prompts → 5 distinct garment types and geometries, confirmed via
  both the pushed unit tests and a live run against the actual deployed
  button). No fix needed in `js/ai.js`/`js/ai-spec-pipeline.js` — the
  Provider dropdown was switched to OpenAI for Text Generation as part of
  this diagnosis; the account still needs its own API key pasted into that
  tab (never done by an agent) and a text model selected via "Fetch Models".

## AI Pattern Generator: romper/jumpsuit garment type (real vector pieces, not an image)

### Added
- **`AIGen.buildRomper()`** (`js/ai.js`) — a new garment kind covering a
  one-piece romper/jumpsuit: fitted front/back bodice joined at a waist
  seam to front/back above-knee shorts, an armhole binding strip when
  sleeveless (the common case for this silhouette), a mock/stand
  neckline piece, and a center-front zip facing when a zip closure is
  described or declared. Wired into `deriveStyle()`'s prompt parser
  (`romper|jumpsuit|playsuit|أفرول`, checked before the generic dress/top
  patterns so it isn't misclassified), a new "mock neck" neckline
  detection, and a new zip-closure detection (`s.zip`) — all independent
  of the existing wrap-closure logic.
- **`PatternSpecV1` schema** (`schema/pattern-spec.v1.json`) — added
  `"romper"` to `garment.type`, `"mock"` to `construction.neckline`, and
  `"shorts-front"`/`"shorts-back"` to `pieces[].role` (the schema's
  existing `"zip"` closure and `"placket-facing"`/`"collar-stand"`/`"other"`
  roles already covered the rest). Regenerated the precompiled
  CSP-safe validator (`js/vendor/pattern-spec-validate.generated.js`) via
  `scripts/generate-schema-validator.mjs` — required after any schema
  edit, since the validator isn't compiled at runtime.
- **Spec pipeline** (`js/ai-spec-pipeline.js`) — extended the system
  prompt's vocabulary list and added a third few-shot example (a mock-neck
  zip romper) so a configured text-generation provider (e.g. a real OpenAI
  key under Settings → AI Provider → Text Generation) can emit a valid
  romper spec; `specToStyle()` now maps `garment.closure === 'zip'` through
  to `AIGen.build()`.
- **Quick Draft Builder** (`js/app.js`) — "Romper" is now a pickable kind
  alongside Dress/Top/Shirt/etc., with its own required-measurements list
  (bodice + leg measurements) and Length/Fit/Sleeve controls.

### Fixed
- Clarified, via direct investigation, that a user describing a garment
  in the **AI Pattern Generator** prompt box always gets real vector
  pattern pieces (never an image) — the "I got an image back" experience
  reported can only come from the separate **AI Fashion Billboard**
  section further down the same rail pane (its "Draw Pattern From This"
  step calls an image-generation endpoint by design, producing a raster
  tech-pack illustration meant for the existing "trace as background"
  workflow, not real geometry). No code change was needed for that path;
  the real gap — that "romper" wasn't a recognized garment type at all,
  so this kind of description had nowhere correct to go — is what this
  release actually closes.

### Honest notes
- Romper shorts pieces (`Romper Front/Back Shorts`) declare no
  `role` — cloth-lab's WP-6 placement vocabulary has no "shorts
  front/back" entry (only full-length trouser/skirt panels), so this
  follows `buildTrousers()`'s own established "skip what we don't
  understand" convention rather than forcing an incorrect hip-panel
  placement.
- The Quick Draft Builder's romper option has no zip-closure toggle
  (Quick Draft doesn't expose a closure control for any kind today) —
  zip detection is prompt-only, via the AI Pattern Generator's free-text
  description.

## Shift-drag bypasses the 1cm grid snap

### Added
- **Shift+Drag free positioning** (`js/canvas.js`) — holding Shift while
  dragging now bypasses the 1cm grid snap everywhere the canvas snaps:
  outline-point handles, construction points/lines/arcs/circles, and the
  Line/Arc/Pen/Polygon/Knife/Grainline tools. The shared `snap()`,
  `snapToPoint()`, and `snapConstruction()`/`nearestPointId()` helpers all
  take a `free` flag now, threaded from each call site's `e.shiftKey` —
  with Snap enabled, a normal drag still rounds to the nearest whole
  centimetre, but a Shift-held drag lands on the exact fractional
  coordinate under the cursor. Verified end-to-end via synthetic
  `PointerEvent`s carrying `shiftKey`: identical drags produced `[63, 88]`
  without Shift and `[59.72, 86.17]` with it.
- Documented in the in-app Help modal's Keyboard shortcuts table and in
  `docs/shortcuts.html` (EN + AR), under "Canvas & selection".

## Pattern library expansion, colourful thumbnails, currency selector, real Bill of Materials

### Added
- **40 new Fancy Collection designs** (`js/fancy-patterns.js`) — 10 per
  category (Women: `wf07`-`wf16`, Men: `mf07`-`mf16`, Girls: `gf07`-`gf16`,
  Boys: `bf07`-`bf16`), each with 10+ real pattern pieces built from the
  file's existing bezier component toolkit (`princessBodice`, `sleeve2pc`,
  `collarStand`, `peplumPc`, `godetPc`, `capePc`, etc.) — no new geometry
  helpers invented. The Fancy Collection goes from 24 designs (6/category)
  to 64 (16/category); the full pattern library (base `PATTERNS` + Quick
  Draft's `js/library.js` variants + Fancy Collection) goes from 124 to
  164 entries.
- **Distinct, colourful library thumbnails** (`js/app.js`'s new `LIB_ICONS`)
  — every garment `type` now in use across the library (dress, gown, robe,
  top, shirt, skirt, trousers, jacket, coat, suit) gets its own flat-fill
  illustrated icon (e.g. a navy blazer with lapel + gold buttons for
  jacket, a rust double-breasted coat for coat, a charcoal suit jacket
  with a burgundy tie for suit) instead of the old two-icon fallback that
  left the majority of the library — every gown, jacket, coat and suit —
  rendering as a generic shirt or dress silhouette.
- **Currency selector for the cost estimator** (Export pane) — USD/SAR/EGP
  with a fixed exchange-rate table (`CURRENCIES` in `js/app.js`); SAR uses
  the real long-standing 3.75 peg, EGP is an approximate rate flagged with
  an on-screen note since it floats and this isn't a live FX feed.
- **Real itemized Bill of Materials** (Export pane's "Bill of Materials"
  button, previously a stub that only toasted "✓") — `buildBomItems()`
  derives notions from the *loaded pattern's actual piece roles* rather
  than a fixed guessed list: main fabric + width (reusing the existing
  yardage estimate), lining fabric and fusible interfacing when
  facing/lapel pieces are present, a zipper when a `"Zip Placket Facing"`
  piece is detected, buttons per cuff/waistband piece, an estimated
  front-button count from back-length (~1 per 12cm, labelled as an
  estimate) when a button-front facing is present, plus thread and
  care/size labels on every garment — printed alongside a real cutting
  list (piece names, cut-on-fold, colour) in the same bilingual
  print-ready window style as Pattern Summary/Tech Pack.

### Fixed
- **2 self-intersecting pattern pieces** (`gf10`'s bodice panels, `gf11`
  and `gf13`'s neckline facings) found by the pattern validator sweep —
  `gf10` widened `princessBodice()`'s `hipY`/`hemY` gap to match every
  other design in the file; `gf11`/`gf13` replaced a misused
  `lapelFacing()` call (whose curve proportions assume a longer `len` than
  these short kid-scaled facings produce) with the same short inline
  curved-band shape already used elsewhere in the file.

### Honest notes
- Front-button count in the Bill of Materials is a labelled *estimate*
  (back-length / 12cm), not read from real notch/placket data — no such
  data exists in the pattern format today, so this follows the project's
  existing "defer or estimate honestly, don't fabricate a precise-looking
  number" convention (see `js/validate.js`'s `ease` check for the same
  principle applied elsewhere).
- EGP's exchange rate is a fixed approximation, not a live feed — flagged
  in the UI whenever a non-USD currency is selected.

## 2D canvas: select-anything delete, Add Point tool, oriented selection box

### Added
- **Select-anything + Backspace delete** (`js/canvas.js`, `js/app.js`) —
  WP-17's keyboard delete only ever worked on whole pattern pieces.
  Construction points, construction lines/arcs/circles, text annotations,
  and notches are now each click-to-select (with their own highlight
  ring/box, reusing the existing Object-Browser highlight style for
  points/lines) and Backspace/Delete-able, through a new
  `Canvas.deleteSelection()` that checks whatever is currently selected —
  smallest/most-precise target first, falling back to the pre-existing
  whole-piece behavior last. New hit-tests `hitNotch()`/`hitCons()`
  (point-to-segment / point-to-circle distance in screen space) and a new
  `removeNotch()` back it.
- **Add Point tool** (`js/canvas.js`, new "addpoint" tool in the tool rail)
  — click anywhere along a piece's outline edge to insert a new vertex
  right there, with a live hover preview (a small ring on the nearest edge
  point under the cursor) before you commit. If the piece carries `edges[]`
  seam metadata (Walk the Seam / princess-seam placement), every
  `fromIdx`/`toIdx` referencing a vertex after the insertion point shifts up
  by one so it still points at the same physical vertex — the new point
  doesn't silently desync seam data.

### Fixed
- **Rotate ("swing") selection box drifting outside the piece** — the
  dashed selection box was an axis-aligned bounding box of the piece's
  outline. That always mathematically *contains* a rotated piece, but
  visibly floats away from its actual silhouette at the corners the moment
  it's rotated off 0/90/180/270°, reported as "the dotted line sometimes
  appears outside the layer" while rotating ("swinging") a piece. Replaced
  with the true minimum-area *oriented* rectangle (convex hull + rotating
  calipers), computed fresh from the live outline every render — so it's
  correct whether the piece was just rotated, loaded pre-rotated, mirrored,
  or knife-split, with no new per-piece state to keep in sync. The rotate
  handle now sits on whichever of the box's 4 sides is currently closest to
  the piece's visual top, so it stays usable at any angle instead of
  jumping around relative to an axis-aligned box.

### Honest notes
- Darts stay modal-only (Edit Darts), not click-selectable on the canvas —
  they're edited by index in `openDartEditorModal`, not hit-tested against
  screen position; adding that would mean giving darts their own on-canvas
  geometry-based hit-test, out of scope for this pass.
- Arc hit-testing (`hitCons`) approximates an arc by its end-to-end chord,
  not the actual quadratic curve — good enough at click precision, and
  consistent with this file's existing "referential" arc representation
  (endpoints + control point via `resolveRef`, not a stored sampled curve).

## Bundled avatar gallery — grounding, garment, and a stray-geometry fix

### Fixed
- **Avatars appearing "50% under the ground"** — 3 of the 8 bundled models
  (`girl.glb`, `girl3.glb`, `boy2.glb`) have a flat circular turntable base
  baked into the same single mesh as the body (confirmed via direct glTF
  vertex inspection). `loadGLB()` grounds the whole mesh's bounding box, so
  the disc's bottom — not the feet — was landing at floor level, pushing
  the disc up through the ankles. Fixed with a new heuristic
  `stripPedestal()` in `js/three-view.js`: detect the anomalous bottom
  band per-mesh (vertex density/radius several times the leg cross-section
  right above it), then clip everything below it by Y. The other 5 models
  were unaffected and still render exactly as before.
- **A second, unrelated model defect found while fixing the above** —
  `girl3.glb` has a ~3200-vertex disconnected island near the shoulder/head
  with over 2x the body's own radius, rendering as a long diagonal spike; a
  reconstruction artifact from the source pipeline, not caused by the
  grounding fix. Fixed via a new `keepLargestComponent()` (connected-
  component analysis, size-relative threshold so small legitimate details
  like an unwelded eyelash bit on other models aren't also deleted).
- **Avatars appearing completely naked** — `loadGLB()` never called the
  garment-building code (`buildGarment()`, the bodice/skirt/trousers/sleeve
  shells sized from your measurements); it only ran for the procedural
  body. Extracted the sizing math into `computeBodyDims()` and now call
  `buildGarment()` from `loadGLB()` too, so a custom GLB avatar shows
  whatever pattern is actually loaded, through the same existing
  visibility/fabric wiring used by the procedural body.
- **Sleeve capsules mispositioned on GLB avatars** — a bug introduced (and
  caught before shipping) while wiring `buildGarment()` into `loadGLB()`:
  sleeves are normally parented to procedural arm-pivot groups that don't
  exist on a GLB body, silently falling back to garmentGroup's own
  (0,0,0) origin instead of the shoulder. Fixed by computing the
  equivalent absolute shoulder position directly when no arm pivot exists.

### Honest notes
- **Garment fit on a GLB avatar is approximate, not measured from the
  mesh** — the garment shell is sized from your entered measurements, not
  the loaded model's actual proportions. On a build stockier than that
  generic assumption (`boy2.glb`) the shell can end up mostly *inside* the
  skin and only partially visible. A per-mesh auto-fit (measuring the
  mesh's own torso radius to rescale the shell) was implemented and
  reverted: these AI-generated avatars don't share one rest pose (arm
  position relative to the torso varies model to model, confirmed by
  direct vertex inspection), so no single Y-band was safe from sampling
  outstretched-arm geometry on at least one bundled model — the first
  attempt scaled the garment to several times the body's real size.
  Reverted to the simpler, always-correctly-sized generic version rather
  than ship a fragile fit heuristic.

### Added
- **8 real GLB avatar models** (`avatars/`) selectable per category in
  Settings → 3D avatar models: 2 men (man, heavier-build variant), 1 woman,
  2 boys, 3 girls — alongside the existing custom-URL field and a new
  "upload your own file" option (`<input type=file>` → a session-only
  `blob:` URL, honestly labelled as not persisting across reloads).
  Deployed via `.github/workflows/deploy-pages.yml`'s copy list (added
  `avatars` alongside the `docs`/`body.html`/`3d-test.html` fix from the
  entry above — same class of gap, caught before it shipped broken this
  time).

### Honest notes
- These are static, **unrigged** single-mesh exports from an AI
  image-to-3D pipeline, not sculpted/rigged characters — a perfect fit for
  3D Preview (loads and scales to height, no skeleton needed) but pose
  variants in 3D Cloth Lab won't animate them (no skeleton to rotate);
  they still display correctly, just static.
- A 9th candidate model (a "woman" variant) was deliberately left out at
  the user's direction: 41MB vs. 2-3.6MB for every other file, which would
  have meaningfully bloated both the git repo and the download a visitor
  pays just to preview it. Left for a future, properly-compressed
  re-export.

## Post-Phase-4 fix — 3D Preview blank canvas (real bug, fixed in two rounds)

### Fixed
- **3D Preview reported blank by a real user, across two phases** —
  previously dismissed as "some browser-automation tools fail resolving
  import-map entries in a dynamic `import()`," a tooling note rather than
  an app fix.
  - Round 1: reproduced directly — `import("three")` throws "Failed to
    resolve module specifier" in the affected engine, while
    `import("https://unpkg.com/.../three.module.js")` on the exact same
    page succeeds immediately after. Fixed in `js/three-view.js`: every
    dynamic `import()` of a bare specifier retries against an explicit
    unpkg.com URL on failure.
  - Round 2: the same user still saw it fail. Their device separately
    confirmed full WebGL2/WebGPU support via `/3d-test.html` (no runtime
    CDN dependency), and Cloth Lab (a separately Vite-bundled app, also no
    runtime CDN dependency) worked fine for them — pointing at something
    blocking `unpkg.com` specifically, which a same-domain retry can never
    route around. `js/three-view.js` now falls through three tiers — the
    import map, an explicit unpkg.com URL, then esm.sh (a genuinely
    different domain, already in the page's CSP) — verified by blocking
    all `unpkg.com` requests in a Playwright test and confirming 3D
    Preview still initializes via the esm.sh tier alone.
- A second bug found alongside round 1: even in a genuine WebGL-unavailable
  case, the "3D preview needs WebGL" fallback message was drawn onto a
  canvas still sized 0×0 from app boot (before the 3D tab was ever opened)
  and nothing ever redrew it at the correct size once the tab became
  visible. `resize()` now re-attempts the fallback at the real size on
  every call, not just once at boot.
- Strengthened the existing "open 3D preview" smoke test, which had been
  asserting only CSS visibility (a wrapper can be visible while the
  canvas's own internal raster buffer is still 0×0) — it now asserts
  `View3D.isReady()` and real non-zero canvas dimensions directly. Added a
  new permanent test that blocks all `unpkg.com` requests and confirms the
  esm.sh fallback tier alone is enough for 3D Preview to still work.

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
