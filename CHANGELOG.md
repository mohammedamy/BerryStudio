# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.
Started as part of `BerryStudio-Upgrade-Plan.md`'s WP-16 (docs & changelog),
established early per that plan's own "one WP = one PR = one changelog
entry" rule.

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
