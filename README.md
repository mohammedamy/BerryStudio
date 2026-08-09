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
| **Custom fabric photo upload** (Tailornova feature study, WP-39, Layers pane) — a real uploaded swatch photo, tiled as an actual `createPattern` fill on the 2D piece and mapped onto the 3D/Cloth Lab material (not just a flat colour), scoped to the selected piece or every piece | ✅ Working — verified live: a checkerboard test swatch tiled correctly on both the 2D canvas and the live 3D avatar simultaneously |
| **Illustrated body-measurement diagram** — a numbered reference figure in the Measures pane showing where each of the 11 measurements is taken | ✅ Working (collapsible, EN/AR) |
| **Create Marker** — nest pattern pieces onto a virtual fabric roll (width/length/rotation/min-spacing), with a layout preview and real computed yardage. "Fast preview" (instant bounding-box packing) and "Full nest" (true polygon nesting — pieces interlock into each other's concave notches, run in a Web Worker with a real Stop/cancel) | ✅ Both modes working |
| **Size & Grading engine** XXS→6XL, Intl/Egyptian/Saudi, Kids, Custom | ✅ Proportion-perfect, live |
| Category switcher (Women/Men/Girls/Boys) with matching avatar | ✅ Working |
| Real multi-piece patterns w/ bilingual names + explanations | ✅ 6 patterns (dress, shirt, abaya, thobe, girls' dress, boys' trousers) |
| **3D preview** — 4 distinct anatomical avatars (women/men/girl/boy), studio lighting + soft shadow, OrbitControls (orbit/zoom/pan, touch), auto-spin, walk cycle, live fabric material/colour/transparency, per-piece show/hide, size grading, loading state | ✅ Working (stylised character; drop-in GLB path for photoreal) |
| **Split View: 2D + 3D** (Tailornova feature study, WP-38, stage toolbar) — a real, always-live 3D preview panel beside the 2D canvas that updates as you edit, instead of a third full-bleed tab you switch away from. Off by default; switching to the 3D Preview or Cloth Lab tab turns it off automatically (mutually exclusive by design, so the two layouts never fight over the same canvas) | ✅ Working — scoped to 2D + 3D Preview only, not Cloth Lab (a separate, heavier R3F app) |
| **Project menu**: New · Import (.json) · Export SVG/DXF · Save PDF · Save Project · Print | ✅ Working (real SVG, DXF, PDF & print) |
| Print & Export: A0–A4/Letter/Plotter, PDF/DXF/SVG/AI/PNG/JPEG/HPGL | ✅ All native — real AAMA/ASTM D6673-layered DXF, genuine HPGL plotter cut-lines, selectable-DPI PNG/JPEG rasterization, tiled home-printing PDF (registration marks + assembly map), AI as PDF + `%AI` header |
| Fabric consumption + cost estimator (USD/SAR/EGP currency selector, fixed approximate rates) + Tech Pack + itemized **Bill of Materials** (fabric/lining/interfacing/zip/buttons/thread/labels derived from the loaded pattern's real piece roles, plus a cutting list) | ✅ Working (cost uses your last Create Marker nest if you've made one, else a height-based estimate) |
| **Pattern Summary export** — one-page bilingual print sheet: size table, a labelled dimensioned diagram per piece, and a construction note (Export pane, Project menu, ⌘K) | ✅ Working |
| **Sewing Instructions export** (Tailornova feature study, WP-37) — a real, ordered construction sequence derived from the loaded pattern's own declared piece roles, the same trusted signal the Bill of Materials already uses: prep/interfacing → darts → yoke → shoulder seams → collar → sleeves → pockets → zip/placket → waistband → cuffs → buttons → lining → hem → press, each step only appearing when the pattern actually declares that role (Export pane, Project menu, ⌘K) | ✅ Working — pieces with no recognised role contribute no step rather than a guess |
| **Fit Chart export** (Tailornova feature study, WP-40, Export pane) — a per-size measurement spec sheet with a live-editable ± tolerance per measurement point, computed by the same grading engine as Auto Grade for every size in the current standard (or every age, in Kids mode) — one real, editable table honestly covering both of Tailornova's "Standard" and "Custom" Fit Chart line items instead of two features sharing every line of code | ✅ Working |
| **Pattern Library — 308 pre-designed patterns** (57 Women / 47 Men / 157 Girls / 47 Boys — Girls' total includes a 100-pattern Gymnastics Leotards collection; Women's and Girls' totals each include their share of a 44-pattern Underwear & Bra collection, WP-43, §"Honest notes" below), category filter chips + search + "My Patterns", with distinct full-colour illustrated thumbnails per garment type (dress/gown/robe/top/shirt/skirt/trousers/jacket/coat/suit/underwear/bra) instead of a generic silhouette | ✅ Working — every entry is a real, gradable multi-piece garment |
| **Fancy Collection — 64 elaborate designs, 16 per category**: gowns, tailored jackets/coats/suits, jumpsuits, sherwanis, kanduras and parkas — each with 10+ real pattern pieces (princess seams, godets, capes, tiers, two-piece sleeves, lapels, hoods, peplums) and genuinely curved seams | ✅ Working — curves are bezier-sampled into the pattern outline, not straight polygon corners |
| **Construction tools** — real drafting Point/Line/Arc/Circle tools that snap to and stay live-linked to named points, "Create Pattern Piece" to promote a closed point loop into a real piece, custom parametric **Variables** (named formulas referencing other variables and body measurements, reusable in any point's X/Y), and a trace-over **background reference image** with two-point calibration | ✅ Working — points/lines/arcs re-resolve automatically when you grade/resize |
| AI Pattern Generator — visible "thinking" stages, robust local image analysis (neckline/hem/flare/colour from a real photo, not just a clean product shot), a wider construction vocabulary (necklines including mock/stand neck, hem shapes, wrap/zip closures), a **romper/jumpsuit** garment type (fitted bodice + attached above-knee shorts joined at a waist seam, with armhole binding and a zip facing), and a "Detected" attributes panel (with source + confidence, click-to-override) so you can see what actually mattered — describing a garment always produces real, editable vector pattern pieces on the canvas, never an image to trace | ✅ Working (offline heuristic by default; bring your own AI provider in Settings — see below) |
| **Bring Your Own AI** (Settings → AI Provider) — 8 text/vision adapters (Anthropic, OpenAI, Gemini, OpenAI-compatible, Ollama, LM Studio, llama.cpp/vLLM, your own proxy) with per-provider key/URL/model fields, Fetch Models, and Test Connection with real error text | ✅ Working — sessionStorage-only keys by default, optional encrypted persistent storage, strict CSP |
| **Local model support** — Route A (local server via Ollama/LM Studio/llama.cpp/vLLM) is fully working; Route B (pick a local `.onnx` file, cached in IndexedDB/OPFS across reloads) and Route C (Hugging Face model ID, in-browser WebGPU/WASM) both load via the same lazy Web Worker; a Capability Probe badges WebGPU readiness | ⚠️ Routes A and B working; Route C field-tested for real — one real model loaded and ran real inference end-to-end, two others failed with real, disclosed errors, and a real worker-corruption bug was found in the process — see Honest notes |
| **Spec-first generation** — prompt → schema-validated `PatternSpecV1` JSON → the same deterministic `AIGen.build()`/Check Pattern pipeline every other path uses, with one validate-and-retry pass and an honest fallback to the offline heuristic on failure | ✅ Working |
| **Vision fusion** — when an image is supplied to a configured provider, the vision-informed spec is authoritative for garment type/neckline/closure; the existing pixel-analysis heuristic stays authoritative for length/flare/hem/colour | ✅ Working |
| **AI Fashion Billboard, BYO-key** (Settings → AI Provider → Image generation) — OpenAI images, Gemini image, a local Stable Diffusion (Automatic1111) backend, a local ComfyUI backend (hardcoded text-to-image workflow, auto-detected checkpoint), plus the original proxy contract, unchanged. **"Generate Pattern Pieces From This"** on the generated photo drafts real editable pieces onto the canvas from the garment's relative silhouette (same pipeline as the AI Pattern Generator's own image upload); **"Read Pattern Pieces From This Tech-Pack"** on the generated flat-sketch/tech-pack drawing instead traces the image's *actual printed measurements* into real pieces (`pieces[].outlineCm`, needs a vision-capable Text Generation provider) — the existing "Use as Background Trace" manual path is still available for either image | ✅ Working — proxy option is byte-for-byte compatible with existing `server/billboard-proxy/worker.js` deployments |
| **Quick Draft builder** — pick a garment kind (Dress/Top/Shirt/Skirt/Trousers/Romper/Robe/Gown/Jacket/Coat/Suit), see only the measurements that kind actually needs, adjust Length/Flare/Fit/Sleeve, and produce real pattern pieces. Dress/Skirt/Robe/Romper's Length control is **8 genuinely distinct one-click hemline presets** (Mini→Maxi, Tailornova feature study WP-37), not 3 relabelled buckets — each is a real factor in the drafting engine, verified to redraft the actual hem position | ✅ Working — measurement edits here are a local draft override and don't touch your working Measures/Auto Grade |
| **Object Browser** — a docked panel listing every Point/Construction Line/Arc/Circle/Piece/Text with live counts and a name filter; click a row to jump the canvas to it | ✅ Working |
| **Snapshot** — freeze the pattern's current state as a translucent ghost layer (opacity/show/remove) to visually compare later edits against | ✅ Working |
| Command palette (⌘/Ctrl-K), tooltips + global Hover-Help toggle | ✅ Working |
| Onboarding, toasts, high-contrast, reduce-motion, local-first storage | ✅ Working |
| PWA manifest + service worker (offline, installable) | ✅ Working |
| **ES modules** — `js/*.js` are real `import`/`export` modules (was: 9 classic IIFE scripts sharing sibling browser scope) | ✅ Working (`window.X` globals kept as a temporary compat layer — see Honest notes) |
| **Pattern Spec schema** (`schema/pattern-spec.v1.json`) — a declarative JSON Schema for future AI-generated garments | ✅ Schema + validator defined (not yet wired into the AI generator — see Honest notes) |
| **Check Pattern validator** (`js/validate.js`, Export pane / ⌘K) — 8 patternmaking checks: closed outline, self-intersection, grainline, seam-allowance offset, cut-on-fold symmetry, seam-length parity, notch alignment, ease | ✅ 5 full-confidence, 2 Verified-or-Heuristic per pair (real declared-role pairing when available, name-matching fallback otherwise — see Honest notes), 1 real-when-hinted (ease reports pass/warn/fail for pieces with a declared chest edge, "Not applicable" otherwise — see Honest notes) |
| **3D Cloth Lab** ("3D Cloth Lab" tab) — real-time GPU cloth simulation (strain-limited structural + bend + self-collision + body collision) of your actual pattern, with fabric presets (mass/stiffness/anisotropy/PBR sheen-transmission), an avatar matching your measurements (FFD-deformed if you supply a GLB), 6 pose variants, 6 skin tones, and GLB/OBJ/USDZ/turntable export. The **Cloth** and **Pieces** debug views render each simulated piece in its own real color from the 2D canvas's Layers panel, not a flat garment-wide tint — **Weld** and **Seams** intentionally keep their own diagnostic coloring (weld-topology / seam-assignment state) instead, since that's each view's actual job | ✅ Working — princess seams, gores, capes, hoods, tiers and other Fancy Collection shapes import as connected garments, not disjoint pieces (see Honest notes) |
| **Cloth Lab engine** (Settings → 3D Cloth Lab engine) — "Embedded" (default as of WP-36/v2.0) mounts Cloth Lab directly into this page, sharing this page's own React/Three.js so it starts faster and updates instantly; "Iframe" runs it as a separate embedded app and remains fully selectable as a fallback | ✅ Both working |
| **BodyForm** (`body.html`, standalone) — build a 3D avatar from measurements alone (no pattern needed), export it, or "Open in Fit Studio" to carry the category/measurements into the main app's 3D Cloth Lab | ✅ Working |
| **Industrial grading — Grade Rules** (Size pane) — per-piece, per-outline-point dx/dy-per-size-step overrides on top of the uniform formula grade, JSON import/export, and a **Grade Nest preview** overlaying S/M/L/XL of one piece at a shared alignment point | ✅ Working — a point with no authored rule keeps grading through the normal formula, unchanged |
| **Drafting engine upgrades** — per-edge seam allowance + real corner join styles (miter/round/bevel) in the offset engine; real bezier `piece.curves` metadata (every curved edge across the whole Fancy Collection — necklines, sleeve caps, collars, godets, capes, peplums, jacket fronts, gores — not just princess seams) feeding DXF's curve layer; dart **Pivot** / **Slash & Spread** / **Transfer** (Layers pane → piece properties → Edit Darts) — Transfer's external pivot point can be typed as X/Y or picked directly on the canvas; **Walk the Seam** (Export pane) — drag one slider to check two pieces' shared seam matches at every arc-length position, not just the ends; Quick Draft's Skirt (waist) and Sleeve (cap) offer a real **Pleat / Gather / Tuck** choice (real added-width math per technique, not a label) | ✅ Working |
| **Local automation API** (`window.BerryStudio`, see below) — `generate`/`grade`/`nest`/`export`/`validate`, callable from the browser console or any injected script against the currently loaded pattern | ✅ Working |
| **Docs site** (`docs/`, book icon in the header) — bilingual quick start, tool reference, keyboard shortcuts, an AI setup guide with one page per provider (exact CORS commands included), 3D troubleshooting, and FAQ | ✅ Working — a build-free static site, no dependency beyond the app's own theme CSS |
| **Accessibility & UX** — real keyboard operation of the canvas (`[`/`]` cycle, arrow-key nudge scoped to whole pieces; Delete/Backspace now deletes whatever is selected — a piece, a construction point, a construction line/arc/circle, a text annotation, or a notch), `role=dialog`/focus-trap/return-focus on every modal, `aria-label`/`aria-pressed` on icon and toggle buttons, a real `:focus-visible` ring app-wide, `prefers-reduced-motion` honoured by both CSS transitions and 3D Preview's auto-rotate, and all 6 theme × light/dark variants verified at WCAG AA (4.5:1) for body and secondary text | ✅ Working (see Honest notes) |

### Honest notes
- **Fancy Collection** (`js/fancy-patterns.js`) pieces are hand-authored, not run
  through the AI builder — each design's princess seams, lapels, godets, hoods and
  tiers are real geometry built with quadratic/cubic bezier curves sampled into the
  pattern outline (so seams read as genuinely curved, not straight polygon corners).
  Proportions come from heuristic ratios of the body measurements (in the same style
  as the hand-crafted `PATTERNS` in `js/data.js`), not couture drafting-book formulas —
  treat these as realistic *design* references to grade and export, not
  seam-allowance-exact sewing patterns ready for a cutting table.
- **Underwear & Bra Library** (`js/underwear-library.js`, WP-43) — 44
  patterns: 24 briefs/trunks (6 each: Women/Men/Girls/Boys) + 20 bras (10
  each: Women/Girls). Same standard as the Fancy Collection above — real
  bezier-curved seams (waist edge, leg opening, crotch curve, cup boundary,
  band top edge), not straight polygon corners, and every style is a real,
  distinct construction (e.g. a Trunk's leg panel genuinely extends further
  down the thigh to a hemmed edge; a Sport Bra is a front/back racerback
  panel construction, not a cup-based design wearing a different name).
  Deliberately excludes any thong-style cut in every category, and every
  bra is soft-cup/wireless construction throughout — the only sensible
  default for the Girls category, kept identical for Women so both share
  one builder rather than maintaining two. Introduced five new piece
  roles (`gusset`, `cup`, `band`, `strap`, `elastic-band`) with real,
  dedicated Sewing Instructions and Bill-of-Materials steps (crotch
  gusset assembly, cup-to-bridge joining, band/side seams, elastic
  application, strap attachment; elastic yardage and a hook-and-eye
  closure line item) — not left to fall through as `role:"other"`'s
  silent no-step behaviour. Verified: all 44 patterns pass Check Pattern
  (closed outline, no self-intersection) across every size XXS–6XL and
  every Kids age, live in-browser piece rendering, and real Sewing
  Instructions/BOM output inspected directly, not just assumed from the
  code.
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
  Material). The procedural 3D avatar has 4 mesh groups — bodice, sleeve, skirt, trousers
  — and as of WP-28 (v2.0), bodice/skirt/trousers are each built as two real front/back
  sub-meshes split at the body's side seams, so a front piece and a genuinely distinct
  back piece (e.g. Front Bodice and Back Bodice with different fabrics or colours) each
  render with their own material simultaneously, instead of whichever was set last
  winning. A part with only one 2D piece still renders as one seamless whole, unchanged.
  Sleeve stays a single mesh (a capsule can't be angle-split the way a lathe can) and a
  real garment sleeve is conventionally one piece anyway, so this is a deliberate,
  documented exception, not a remaining gap. The 2D canvas itself still shows true
  per-piece colour and material regardless.
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
- **3D Cloth Lab**'s cloth solver defaults to a distance-based hinge/fold
  spring for bend resistance, matched to this app's particle counts — a
  deliberate, documented trade-off, not an oversight. As of WP-35 (v2.0), an
  opt-in "High (dihedral bend)" quality tier (Fabric panel → Simulation
  quality) replaces it with a true angle-based fold constraint for a
  sharper, more accurate drape on dense garments — the default tier's own
  behavior and performance are completely unchanged; switching tiers rebuilds
  the simulation rather than live-swapping. Self-collision stays brute-force
  O(N²) in both tiers: `GPUComputationRenderer` (this solver's plain-WebGL2
  GPGPU approach) has no compute-shader/atomics access, and a real GPU
  spatial hash needs either a scatter-with-atomics compaction pass or a full
  bitonic sort to build actual per-cell particle lists — neither available
  here without adopting WebGPU compute shaders or a from-scratch verified
  sort, a materially larger undertaking than an opt-in tier. A cheaper
  middle ground (bucket each particle into a coarse grid cell, skip
  obviously-far pairs) was considered and deliberately not shipped: the
  loop's actual cost is the two texture fetches needed just to find out
  where another particle IS, which a cell-based early-out can't avoid —
  see `ClothSimulation.js`'s own comment. Fabric `structStiff`/`bendStiff`
  values are tuned "feel" sliders, not Kawabata-instrument-calibrated SI
  values. Seams weld at mesh-build time (no gradual sewing ramp-in) — a
  garment can show a brief pop at the seam on the very first frame after a
  pattern change, not during normal wear.
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
- **VRM avatar files** (a common photoreal-avatar format) — as of WP-29
  (v2.0), a real VRM 0.x/1.0 `humanoid.humanBones` resolver feeds the same
  repose pipeline the Mixamo/Ready Player Me bone-name convention already
  uses, so pose selection (standing/A-pose/T-pose/contrapposto/seated) works
  on a VRM file the same way it does on any other recognized rig. The
  "pose has no effect" message is shown only when a VRM file's own
  `humanBones` data doesn't resolve a full arm rig (a custom or malformed
  VRM export) — never a silent mis-pose, same honesty rule as the plain
  "no recognized rig" case.
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
  piece's. Running it over the full pattern library on its first pass
  genuinely found real issues, not hypothetical ones — 67 Fancy Collection
  piece instances (across 30+ unique designs) had a duplicate consecutive
  point in their outline, and a consistent ~5mm front/back "side length"
  delta shows up across many catalogue garments (still undecided — tracked
  as WP-40, not yet adjudicated as of this note). **WP-26 fixed the
  duplicate-point bug**: it traced to exactly four shape helpers in
  `js/fancy-patterns.js` (`godetPc`, `capePc`, `peplumPc`, and
  `princessBodice`'s neckline/princess-curve join) where a bezier segment's
  sampled endpoint re-landed exactly on a point already in the outline —
  either the next segment's own start, or the shape's own `[0,0]` origin
  when a closing curve swept back to it. Fixed at the source with two small
  dedupe helpers rather than papering over it downstream; `npm test` now
  asserts zero `closedOutline` failures across the library so this exact
  class of bug can't silently regress. The ~5mm side-length finding is
  exactly the kind of result a *heuristic* check is supposed to produce: a
  lead for a human to judge, not a verified fact.
  **WP-25 upgraded front/back pairing itself**, per pair: `js/data.js`,
  `js/ai.js` and `js/fancy-patterns.js` already attach a real `role` to
  most pieces at construction time (WP-6) — the same vocabulary
  `cloth-lab/src/pattern/roles.js` uses to build real 3D seams, not a name
  guess. `pairByRole()` now pairs on that declared relationship first,
  reported as **"Verified"**; only pieces with no declared role, or a role
  with no front/back counterpart declared (hand-imported pieces;
  `js/ai.js`'s `buildTrousers`/`buildSkirt`, which deliberately have no
  placement role either — see those functions' own comments), fall back to
  the pre-WP-25 closed-world name-matching heuristic Cloth Lab's importer
  already uses (`cloth-lab/src/pattern/importFromApp.js:classifyLegacy`),
  labelled **"Heuristic"**, same as before. The comparison math itself
  (seam-length parity's height proxy, notch alignment's arc-position
  proxy) is unchanged either way — the design choice is that "Verified"
  means confidence in the *pairing* (a real authored relationship, not a
  guess), not a claim that every paired role literally shares one cut
  edge — a princess-seamed "Bodice Front Center"/"Bodice Back Center"
  pair, for instance, doesn't (each meets its own `*Side` piece at the
  princess seam instead), but knowing they're genuinely the declared
  front/back counterpart of the same construction block is still real,
  useful information a name guess can't offer. Across the 164-pattern
  library at size M, this took 148 pairs from Heuristic to Verified,
  leaving 71 honestly on Heuristic (trousers/skirts with no declared
  placement role by original design, plus the abaya's asymmetric
  open-front construction) and 23 correctly flagged unpairable — a real
  round-trip test (`test/validate-library.test.js`) asserts this doesn't
  regress. While verifying this WP's cloth-lab claim ("importFromApp.js
  rejects Fancy Collection designs on principle") against current
  source, direct testing showed it was stale — cloth-lab's own
  role-declared metadata path already handles Fancy Collection pieces via
  real geometric edge derivation, not name-guessing — but widening its own
  regression test from the original 24 designs to the current 64 (it had
  quietly stopped covering the 40 added later) caught one real, narrow bug:
  `role:"epaulette"` (6 designs' shoulder tab/epaulette piece) was authored
  in `js/fancy-patterns.js` but never registered in
  `cloth-lab/src/pattern/roles.js`, so those 6 pieces silently dropped on
  import. Fixed (registered, placed at the shoulder/collar — not the hip,
  which the generic fallback role would have used) and now covered by that
  widened test.
  **WP-24 implemented Ease** (finished chest ≥ body chest + minimum wearing
  ease) — the earlier conclusion that it needed "a second, unverifiable
  heuristic on top of the first (which edge is the chest measurement)"
  turned out to be avoidable: `js/data.js` and `js/ai.js` now populate a
  `chestEdgeIndices` hint at construction time (the same role-driven
  metadata WP-25's pairing depends on) for every simple cut-on-fold bodice
  front/back, so Check Pattern reads which vertex is the chest edge
  instead of guessing. A piece with no hint (hand-imported; princess-
  seamed, where the chest edge is split across two pieces; an asymmetric
  wrap/jacket front, where the fold-doubling assumption doesn't hold)
  reports "Not applicable," never a guess. Running it over the full
  library at size M (with a real body chest supplied) found real things
  on its first pass too — 93 pieces pass, 30 warn (positive but under a
  5cm minimum-wearing-ease floor), and **8 pieces genuinely fail**
  (their drafted chest is smaller than the body chest they're drafted
  for): `w10`/`w11`/`w17`/`m10`, all from library.js's "Fitted" style
  preset (`fitF` as low as 0.85 with no accompanying stretch-fabric
  flag). Not adjudicated here —
  a negative-ease "Fitted" preset is legitimate for stretch knit fabric
  and a real defect for anything else, and nothing in the current data
  says which is intended — not adjudicated here.
  **WP-40 adjudicated the ~5mm seam-length-parity finding above: confirmed
  intentional, not a defect.** All 61 flagged pairs (library.js's
  `AIGen.build()`-drafted garments — the hand-crafted `js/data.js`
  patterns and the Fancy Collection don't show it) differ by *exactly*
  5.0mm, zero variance — itself a strong signal this is one deterministic
  authored value, not a spread of independent construction mistakes.
  Traced to `js/ai.js`'s `necklinePts(style, half, y0)` calls in
  `buildTop()`: the front neckline is drafted with `y0=1`, the back with
  `y0=1.5` — a 0.5cm (5mm) difference in the neckline's own starting
  height, verified directly against real generated coordinates (`w01`'s
  front/back both span the identical hem Y; only the neckline-driven
  top-of-piece Y differs, by exactly 0.5cm). This is the *same* call site
  that already gives front and back deliberately different neckline
  **widths** (`chestW*0.42` front vs. the narrower `chestW*0.3` back) — a
  real, standard patternmaking convention (the back neck is conventionally
  drafted narrower and slightly higher/shallower than the front) — the
  0.5cm height offset is evidently the same deliberate choice's companion
  parameter, not an independent oversight. `checkSeamLengthParity`'s own
  tolerance (`SEAM_LENGTH_TOL_MM = 3`, `js/validate.js`) is simply tighter
  than this legitimate neckline variation; the check's own height-based
  proxy (front/back's whole vertical extent, not the literal side-seam
  edge) conflates "neckline sits 5mm higher" with "side seam is 5mm
  longer," which is why every affected pair reads identically regardless
  of neckline shape (v/round/boat/halter/collar/mock all inherit the same
  `y0` values). No code changed — this is a verification-only conclusion,
  and no follow-up WP is needed. The 8-piece Ease failure above is a
  genuinely separate, still-open question (a negative-ease "Fitted"
  preset vs. a real defect) — WP-40's own investigation covered only the
  seam-length-parity finding, not Ease's.
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
  worker's precache list.
  **Field-tested for real (Upgrade Plan v2.0 WP-22)** — four real
  in-browser load attempts against three different real Hugging Face
  model IDs, real measured numbers, not simulated:

  | Model | Result | Wall time | Notes |
  |---|---|---|---|
  | `Xenova/TinyLlama-1.1B-Chat-v1.0` | ❌ failed | 149.7s | Real ORT error at session creation: `Failed to load external data file "model.onnx_data" ... Module.MountedFiles is not available` — this runtime can't load models whose weights are split into a separate `.onnx_data` file (needed once a model's weights exceed onnxruntime-web's single-file limit) |
  | `Xenova/Qwen1.5-0.5B-Chat` | ❌ failed | 577.8s (9.6 min) | Real 404-class error: transformers.js's default quantized-filename guess (`model_quantized.onnx`) doesn't exist in this repo's actual file layout — and took **9.6 minutes** to surface that, a serious real UX problem on its own regardless of the root cause |
  | `Xenova/distilgpt2` (attempt in the SAME worker, right after the TinyLlama failure above) | ❌ failed | 100.3s | **Identical** error text to the TinyLlama failure, including the identical internal tensor name (`onnx::MatMul_6729`) — for a completely different model. This is the real finding: a failed `InferenceSession.create()` leaves the shared worker's onnxruntime-web/WASM state permanently corrupted for the rest of that page session — every subsequent load attempt fails identically regardless of which model is requested, until the page is reloaded |
  | `Xenova/distilgpt2` (fresh page reload → fresh worker) | ✅ **succeeded** | 49.4s load, 14.3s first real inference | A real generated completion came back (`"The quick brown fox is a very good friend..."` — low-quality, as expected from a 82M-param model, but genuinely generated, not stubbed) |

  **What this proves:** Route C's code path is real and does work end to
  end — one real model, freshly loaded, genuinely downloaded, cached, and
  ran real inference in-browser. It also surfaced two real, previously-
  undocumented problems: (1) a corrupted-worker-state bug where one failed
  model poisons every later attempt in the same session (a real reliability
  bug, not a doc gap — filed here, not silently worked around); (2) the
  Settings "Test Connection" button never wires up the worker's own real
  download-progress percentages (`js/app.js`'s `testBtn.onclick`, both the
  Route C and Route B call sites — confirmed by reading the code, not
  assumed), so a user sees a static "Working…" label for the entire
  multi-minute wait, up to the observed 9.6 minutes, with zero percentage
  feedback. Memory footprint for the one successful load stayed under
  ~30MB of JS heap in this environment (not a fully isolated baseline —
  see CHANGELOG for the exact numbers). The Capability Probe's badge
  showed **green** (WebGPU available, generous buffer size) for all four
  attempts — accurate about WebGPU adapter presence, but green did **not**
  predict or prevent either real failure above; it measures adapter
  capability only, never a promise that a specific model will actually
  load.
  **Route B** (pick a local `.onnx` file directly — Upgrade Plan v2.0
  WP-21) is real as of this pass: the file's bytes are cached
  (IndexedDB, or OPFS above ~2GB) so a later reload can reuse them via an
  explicit "Load cached model" click — a plain reload with nothing
  restored honestly shows "no model loaded," never a stale success. The
  same worker then runs it through `onnxruntime-web` (WebGPU, falling
  back to WASM), lazily imported exactly like Route C's runtime. Because
  a raw `.onnx` file's architecture is unknown ahead of time — unlike
  Route C's text-generation pipeline — Route B has no schema-aware
  completion call; its "Run test inference" button runs a real forward
  pass against a synthetic all-zero tensor shaped to the model's own
  declared input metadata, which proves the model actually loads and
  executes on-device but is a capability probe, not a meaningful read of
  real data — feeding it an actual photo with correct per-model
  preprocessing is what WP-39's segmentation feature does concretely for
  one specific, known model, rather than attempting it generically here
  for an arbitrary user-supplied file. GGUF still isn't supported by any
  in-browser runtime and still returns that honest message unchanged.
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
  with zero server-side changes. Of the realistic local image-gen backends,
  Automatic1111's documented REST API and (as of Upgrade Plan v2.0 WP-23) a
  **ComfyUI** adapter are both implemented; ComfyUI's surface area is
  deliberately narrow — one hardcoded text-to-image workflow graph
  (checkpoint → CLIP → sampler → VAE decode → save), not a user-editable
  node graph, with the checkpoint to run auto-detected from what's actually
  installed on the target instance (never guessed) and reference photos
  silently ignored (no img2img wiring yet). SD.next remains unimplemented.
- **Real segmentation for the AI silhouette read** (Settings → AI Provider →
  Text generation → "Silhouette segmentation model", Upgrade Plan v2.0
  WP-39): optional, opt-in, empty by default. When set to a Hugging Face
  model ID for a real matting/segmentation architecture, `js/ai.js`'s
  `analyzeImage()` runs it (via the same lazily-instantiated worker Route C
  uses) and reads the garment silhouette from its real learned
  foreground/background matte instead of the default colour-threshold
  heuristic — everything downstream (per-row run scan, neckline-gap
  detection, hem-shape read) is unchanged either way. Left empty, every
  photo read is byte-identical to before this WP. `Xenova/modnet` (human/
  portrait matting) is the one model family actually verified end-to-end
  this pass — real model+processor load, real forward pass, real
  differentiated alpha output on a synthetic humanlike test image
  (foreground ~0.98-0.9998, background ~1e-6) — not every Hugging Face
  "segmentation" model ID is expected to work: confirmed empirically that
  `pipeline('image-segmentation', …)` rejects real matting architectures in
  this pinned transformers.js version (including briaai/RMBG-1.4's real
  `SegformerForSemanticSegmentation` architecture and `modnet` itself, both
  "Unsupported model type"), so this loads via `AutoModel`/`AutoProcessor`
  directly instead. Runs WASM-only, not WebGPU-accelerated like Route C's
  text-generation path — a "try WebGPU, fall back to WASM" attempt was
  tried and reverted after testing found the failure mode wasn't safely
  retryable within one loaded model/processor pair (see
  `js/workers/local-model-worker.js`'s own honesty note). **Not verified
  this pass:** the plan's specific "a genuinely low-contrast dark-garment-
  on-dark-background real photo" accuracy claim — MODNet is trained on real
  photographic texture, and flat vector canvas art (tried during
  investigation) didn't give it a reliable signal even for shapes that
  worked fine on a plain background, so a synthetic low-contrast test would
  have tested this reader's own canvas-art limitations, not the model's
  real-photo behaviour. Real-photo field verification is the natural
  follow-up (same "VERIFY, not code" gap WP-22/WP-30/WP-40 document
  elsewhere in this plan).
- **Deferred, not dropped** (documented here rather than left unmentioned):
  a "draft program" generation mode against the associative point/line/arc
  system (the plan's own stretch goal beyond spec-first generation) — a
  natural extension of what's shipped here, not started this pass.
  `docs/draft-program-design-note.md` (Upgrade Plan v2.0 WP-38) is a real
  design note seeding a future WP: the proposed operation vocabulary,
  validation story (reusing `js/ai-spec-pipeline.js`'s existing tech-pack
  geometry-validation retry unchanged), and relationship to the Variables
  system — not code, by that WP's own explicit acceptance criterion.
- **True polygon nesting** (WP-11) is a first-party bottom-left-fill +
  simulated-annealing placement search over real polygon-overlap testing
  (`js/nesting-core.js`), not a literal Minkowski-difference no-fit-polygon
  implementation — that's the textbook approach, but pulling in an
  unfamiliar, unverified nesting dependency for it risked a worse outcome
  than a well-tested first-party search that already demonstrably nests
  pieces into each other's concave notches.
- **WP-27 extended curve metadata (`piece.curves`, WP-14) to every curved
  shape in the Fancy Collection, not just princess seams.** It used to be
  wired into `princessCurve()` alone — every other curve (necklines,
  sleeve caps, collars, godets, capes, peplums, jacket fronts, gores,
  trouser crotch seams — 46 `qBez()` call sites across ~16 shape helpers
  in `js/fancy-patterns.js`) stayed flattened-polyline-only, with an empty
  DXF curve layer. `qBezToCubic()` closes the gap (an exact quadratic→cubic
  degree elevation, not an approximation, so it needs zero change to any
  already-flattened point), attached to each shape helper's own returned
  outline and hoisted onto the owning piece centrally (`def()`/
  `FancyGen.build()`, the file's only two piece-registration points)
  rather than editing each of the ~300 individual piece-literal call
  sites by hand. Verified exhaustively, not just spot-checked: every
  outline point across all 70 patterns (6 hand-crafted + 64 Fancy
  Collection) is byte-identical to before this change, and every one of
  the 911 curve segments this produced is confirmed to reproduce its
  own piece's real flattened points, not just claim to. That verification
  caught a real, pre-existing bug: 3 of 4 princess-bodice neckline
  variants (sweetheart/offshoulder/scoop) sample a curve whose own
  starting point sits several centimeters from the outline's literal
  first point — a genuine jog in that construction, unrelated to this WP
  and not fixed here — so those three honestly get no neckline curve
  entry (their princess-seam curve is still real) rather than wrong
  metadata. 569 of 656 pieces across the full library now carry real
  curve metadata (the rest — waistbands, gussets, cuffs, straight sash
  ends — legitimately have none); exporting any of the 64 Fancy
  Collection designs to DXF now produces a non-empty curve layer.
- **Dart Transfer** (rotate a whole dart around an *external* pivot point,
  e.g. a fixed bust-point reference) is a real, tested pure function
  (`js/darts.js`) but has no dedicated UI yet — it needs a "pick a point on
  the canvas" interaction the current Dart Editor modal (Pivot/Spread only)
  doesn't have.
- **WP-20 wired gathers and tucks into the same builders pleats already
  used**: `computeGatherWidth`/`computeTucks` (`js/pleats.js`) were real,
  tested pure functions with zero call sites — only pleats had a generator
  hookup (Quick Draft's skirt builder). Quick Draft's Skirt (waist edge)
  and Sleeve (cap — extracted into a `sleevePiece()` helper shared by
  `buildTop`/`buildRomper`, so both got this for free) now offer a real
  **Pleat / Gather / Tuck** technique choice with a Light/Full intensity,
  each changing the produced piece's finished width by the documented
  formula — "None" (the default) keeps output byte-identical to before
  this option existed.
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
- **Keyboard canvas operation** (WP-17) covers whole pattern pieces for
  cycle/nudge — `[`/`]` to select the previous/next piece, arrow keys
  (Shift for 0.1cm fine adjustment) to nudge the selected piece. Delete/
  Backspace was originally piece-only too; it's since been extended to
  "select anything" — click a construction point, a construction line/arc/
  circle, a text annotation, or a notch on the canvas (each gets its own
  highlight ring/box) and Backspace/Delete removes whichever one is
  currently selected, through a new `Canvas.deleteSelection()` that checks
  in smallest-target-first order and falls back to the pre-existing
  whole-piece delete last. Darts stay modal-only (Edit Darts) — not
  click-selectable on the canvas, a documented boundary, not an oversight.
  `[`/`]` were chosen over Tab/Shift+Tab specifically so Tab keeps doing
  its normal job of moving DOM focus between toolbar and panel controls,
  rather than being hijacked for in-canvas selection.
- **Add Point tool** — a new tool-rail button lets you click anywhere along
  a piece's outline edge to insert a new vertex right there (not just at
  existing corners), with a live hover preview before you commit. If the
  piece carries `edges[]` seam metadata (Walk the Seam / princess-seam
  placement), the new point's insertion index shifts every later
  `fromIdx`/`toIdx` up by one so seam data doesn't silently desync.
- **Rotate ("swing") selection box no longer drifts outside the piece** —
  a user report described "the dotted line sometimes appears outside the
  layer" while rotating a piece. Root cause: the dashed selection box was
  an axis-aligned bounding box of the outline — it always mathematically
  contains a rotated piece, but visibly floats away from its silhouette at
  the corners past 0/90/180/270°. Replaced with the true minimum-area
  *oriented* rectangle (convex hull + rotating calipers), recomputed fresh
  from the live outline every render, so it stays tight at any angle with
  no new per-piece state to track.
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
  static, the same as any unposed model. A 9th candidate model
  (`Manniquin/woman.glb`, 41MB) was investigated and deliberately left out
  (BerryStudio-Upgrade-Plan-v3 WP-32) — not just for its size. Direct
  struct-level parsing of its GLB chunks plus running it through this
  app's own `THREE.GLTFLoader` + `keepLargestComponent()` pipeline showed
  1,451,001 real triangles exist, but `keepLargestComponent()` — tuned for
  every other bundled avatar's minor debris, e.g. a small floating spike
  on `girl3.glb` — discards ~89% of this specific mesh, keeping only one
  arbitrary chunk (a leg) and scattering the rest as disconnected
  fragments. It's a genuine source-asset defect (multiple legitimately-
  separate large mesh islands, not one body + small debris), not a
  compression problem — the same `@gltf-transform/cli` weld/simplify/
  dedup/prune chain that compresses the other 8 avatars produced a clean
  3.13MB output from it with no changes needed. Explicitly not shipped:
  extending `keepLargestComponent()` to bridge legitimate multi-island
  bodies would need a full regression pass against all 8 working avatars
  first, and eight bundled avatars is already a reasonable gallery without
  it — eight it stays for now, an explicit decision rather than a silently
  open gap. Not precached by the service worker (same
  network-first-then-cache behaviour as any other same-origin asset) —
  only fetched when a user actually picks one.
- **Bundled avatar gallery — grounding, garment, and a pre-existing model
  defect fixed** (`js/three-view.js`). A user reported avatars from the
  gallery above looking "50% under the ground" and completely naked.
  Both were real:
  - **Grounding**: 3 of the 8 models (`girl.glb`, `girl3.glb`, `boy2.glb`)
    have a flat circular turntable base baked into the same single mesh as
    the body — confirmed by direct glTF vertex inspection (a bottom Y-band
    with several times the vertex density/radius of the leg cross-section
    right above it). `loadGLB()`'s auto-scale-to-height math grounds the
    *whole* mesh's bounding box, so the disc's bottom — not the character's
    feet — was landing at floor level, pushing the disc up through the
    ankles. Fixed with a heuristic `stripPedestal()`: detect the anomalous
    bottom band per-mesh, then clip everything below it by Y (not by
    radius — a disc is a smooth surface welded into the body, so a
    radius-only cut left the disc's narrower center behind as a stub;
    tried and reverted). A **separate, unrelated** defect turned up on
    `girl3.glb` while fixing this: a ~3200-vertex island floating near the
    shoulder/head with over 2x the body's own radius, rendering as a long
    diagonal spike — a disconnected reconstruction artifact from the
    source pipeline, not caused by the grounding fix. Fixed alongside it
    via `keepLargestComponent()` (connected-component analysis, dropping
    any non-body island above a size-relative threshold so real small
    details like an unwelded eyelash bit elsewhere aren't quietly deleted
    too). The other 5 models needed neither fix — no pedestal, no stray
    island.
  - **Naked avatars**: `loadGLB()`'s body-loading path never called the
    garment-building code at all — `buildGarment()` (bodice/skirt/
    trousers/sleeve capsule shells sized from your measurements) only ran
    for the procedural body. Fixed by extracting the measurement-sizing
    math into `computeBodyDims()` and calling `buildGarment()` from
    `loadGLB()` too, once the body is scaled and grounded — the existing
    per-piece visibility/fabric wiring (`pieceVisMap`/`applyFabric`) then
    picks up and shows the garment that matches whatever pattern is
    actually loaded, unchanged.
  - **Known limitation**: the garment shell's size comes from your entered
    measurements, not from the loaded GLB mesh itself, so fit is
    approximate. A general, automated per-mesh auto-fit was attempted and
    reverted: these AI-generated avatars don't share one rest pose (arm
    position relative to the torso varies model to model, confirmed by
    direct inspection), so no single "safe" Y-band for measuring
    torso-only girth avoided sampling outstretched-arm geometry on at
    least one bundled model — one attempt scaled the garment to several
    times the body's size instead of fixing it. Reverted in favor of the
    simpler, always-correctly-sized (if occasionally under-fitting)
    generic version for the other 7 models.
  - **`boy2.glb` specifically — fixed via measured, one-off override**
    (BerryStudio-Upgrade-Plan-v3 WP-31). This model's shell was worse than
    "occasionally under-fitting": it was fully swallowed by the skin
    surface, not just partially. Direct glTF POSITION-accessor measurement
    (a per-Y-band XZ-cluster scan, same "measure, don't guess" methodology
    as the grounding fix above) found its actual crotch and underarm
    landmarks sit at ~33%/~65% of its own mesh height — ~14-15 points
    below the generic kid assumption of 47%/80%, most likely because this
    specific reconstruction's head is proportionally larger than that
    generic assumption accounts for. Correcting only the Y-position
    (`AVATAR_LANDMARK_OVERRIDES.boy2` in `js/three-view.js`) was verified
    in-browser to be *not* sufficient on its own — the shell still sat
    inside the skin at the corrected height, because its measurement-
    derived radius is also too small for this mesh's own scale. Fixing
    both together (measured Y-position + a 2.3x radius scale, the same
    factor an earlier radius-only attempt had already narrowed in on but
    couldn't validate because it was scaling the shell at the wrong
    height) lands a shell that sits outside the skin, verified by
    screenshot. This is a one-off, measured correction for this specific
    bundled file, keyed by filename — it doesn't generalize to a real
    per-mesh auto-fit for future avatars, which remains the limitation
    above.

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
│                         + draft-program-design-note.md (internal design note, not part of the site)
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
