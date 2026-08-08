# BerryStudio × Tailornova — Feature Study & Work Order

**Scope:** a direct study of `tailornova.com`'s public marketing site (home, Explore/features,
Price, FAQ, Technology, Education, 3D Configurators, About — no app-interior access; Tailornova's
own design canvas sits behind a paid account) compared against BerryStudio's actual shipped
feature set (`README.md`, `js/*.js`, verified live in this session). WP numbering continues the
project's existing ledger (`BerryStudio-Upgrade-Plan-v3.md` closed at WP-36).

---

## 1. What Tailornova actually is

A subscription SaaS ($29–$79/mo + Enterprise) for hobbyist sewers, indie designers, and small
apparel brands. Its core loop, visible on its own homepage screenshot: pick a **smart template**,
click through **style options** (neckline/sleeve/collar/silhouette icons — not freehand drafting),
and three panels update together — a 2D flat sketch, a 3D FitModel™ preview, and the sewing
pattern. Named/marketed features, pulled verbatim from the site:

- Smart intermixable templates ("40B+ design possibilities")
- True-to-life 3D FitModel™ from ~15 measurements (body-shape recognition + predictive
  measurement, trained on body scans)
- Lengthen Patterns with One Click — "up to 10 different lengths"
- Automated Pattern Measurements (spec sheet per piece)
- Ease Adjustment — fabric type + stretch factor + fit preference redrafts the pattern
- Vector 2D flat sketches (AI/CorelDraw export)
- PDF (home/plotter), DXF & DXF-AAMA export
- Seam allowance presets or none
- **Sewing Instructions**, auto-generated per design
- Real-time measurement editing, standard or custom
- Instant 3D garment simulation (marked "coming soon" on their own site)
- Fabric swatch upload + fabric libraries
- Tech Packs with all size runs; Standard/Custom Fit Charts
- Single-size Marker layout; Automated Standard Size Grading
- StyleCustomizer™ / 3D Configurator — embeddable e-commerce widget, mobile body scanning,
  order-processing dashboard, revenue reports (Enterprise tier)
- Student/education licensing, design contest, affiliate program (business-model features)

## 2. Where BerryStudio already matches or exceeds it

This was the real surprise of the sweep: BerryStudio's README and live app already cover most of
the above, several items more honestly or more deeply than Tailornova's own marketing claims:

| Tailornova feature | BerryStudio equivalent |
|---|---|
| Smart templates, style options | Pattern Library (264 patterns) + Fancy Collection + Quick Draft builder (`js/app.js`) |
| 3D FitModel™ from measurements | `body.html` BodyForm + 3D Preview's 4 anatomical avatars, graded live |
| Automated pattern measurements | Measures pane, live-grading, Pattern Summary export |
| Vector 2D export | SVG export |
| PDF/DXF/DXF-AAMA | All shipped, plus PLT/HPGL/AI/PNG/JPEG — a wider set than Tailornova claims |
| Seam allowance options | Per-edge seam allowance + miter/round/bevel corners (Tailornova doesn't claim per-edge) |
| Real-time measurement editing | Measures pane + Auto Grade, live |
| Instant 3D garment simulation | **Shipped and real** — 3D Cloth Lab (GPU cloth sim) — Tailornova still lists this as "coming soon" |
| Tech Packs, size runs | Tech Pack + Bill of Materials, industrial Grade Rules (per-point per-size overrides) |
| Marker layout | Create Marker — fast bounding-box AND a real polygon-tight nest (simulated annealing), Tailornova only claims single-size |
| Fabric libraries | 8 material presets, per-piece colour/material |

BerryStudio's honesty conventions (Check Pattern validator, "Verified vs Heuristic" labelling,
`README.md`'s "Honest notes") are also a genuine differentiator Tailornova's marketing doesn't
attempt — worth keeping, not something to trade away chasing feature parity.

## 3. Real gaps — closed this session

**WP-37 — Sewing Instructions + one-click hemline length presets.** Landed in this session,
`js/app.js`/`js/i18n.js`/`css/styles.css`, verified against the automated test suite (200/200
pass) and live in-browser (simple 3-piece dress → 5-step sequence; 10-piece Belted Trench Coat →
10-step sequence with interfacing/yoke/collar/sleeve/pocket/buttons/lining/hem/press, correctly
in order; verified in both EN and AR).

- **Sewing Instructions** (Export pane, ⌘K, project menu): an ordered construction sequence
  derived from the pattern's own declared piece `role`s — the same trusted signal
  `buildBomItems()` already uses, not a generic paragraph. A plain skirt gets a short honest
  sequence; a lined, collared coat gets a real multi-stage one. Pieces with no recognised role
  (`role:"other"`, freehand shapes, `belt`, `epaulette` — roles this generator doesn't have a step
  for) simply contribute no step, which is the honest behaviour, matching the codebase's existing
  "Verified vs Heuristic vs Not applicable" convention rather than guessing.
- **One-click hemline lengths**: Quick Draft's Length control grew from 3 buckets
  (short/medium/long) to 8 (mini/short/above-knee/medium/midi/long/ankle/maxi) for the four kinds
  where "length" genuinely means hemline (dress/skirt/robe/romper) — each one a real distinct
  factor in `LEN_MAP`, not a relabelled duplicate. Verified live: Maxi actually redrafts to a
  floor-length silhouette (~175cm on the ruler), not a cosmetic change. Deliberately **not**
  applied to top/shirt/trousers/gown/jacket/coat/suit — their own length maps
  (`js/fancy-patterns.js`'s `LEN_F`/`JLEN_F`/`CLEN_F`, or a cropped→full trouser/top meaning) are
  real 3-bucket recipes; adding more presets there would silently collapse onto an existing bucket
  instead of producing a genuinely distinct result, which the codebase's own conventions treat as
  a real defect, not a shortcut worth taking.

## 4. Real gaps — also closed (originally backlog, landed in a follow-up session)

All three items below were landed as WP-38/39/40 in a follow-up session, in the order this
document's own §5 recommended, and verified live in-browser (not just unit-tested): a checkerboard
test-swatch photo confirmed tiling correctly on both the 2D canvas and the live 3D avatar at the
same time; Fit Chart's tolerance edits confirmed flowing through into the print sheet; Split View
confirmed staying live (no tab switch) as the 2D pattern was edited. See `CHANGELOG.md`'s
"WP-38/39/40" entry for full file-by-file detail, including a real bug (`THREE.TextureLoader`
called at module-parse time, before `three-view.js`'s own lazy-loaded `THREE` binding exists) that
live verification caught and a plain `node --check` / the unit suite did not.

### WP-38 — Persistent synced 3-panel workspace (flat + 3D + pattern together) — ✅ Landed
Shipped as **Split View**, not a full 3-panel workspace: a real, always-live 3D preview panel
beside the 2D canvas (`css/styles.css`'s `.canvas-wrap.split`, `js/app.js`'s `setSplitView`), off
by default, mutually exclusive with the "3D Preview"/"3D Cloth Lab" tabs by design rather than
trying to make all three coexist. Deliberately scoped to 2D + 3D Preview only — Cloth Lab stays a
separate full-bleed tab, per this section's own original framing of it as "a separate, heavier R3F
app" not worth the added continuous-render cost for this WP. A genuine product-direction question
was resolved in the simplest direction that ships something real: an opt-in toggle, not a forced
layout change for every existing user.

### WP-39 — Custom fabric image upload as a real texture (not just a colour swatch) — ✅ Landed
A real uploaded swatch photo now fills the piece as an actual tiled `ctx.createPattern()` fill in
the 2D canvas (`js/canvas.js`) and as a real `THREE.Texture` map on the 3D/Cloth Lab material
(`js/three-view.js`), scoped to the selected piece or every piece (`js/app.js`'s
`applyFabricTexture`/`removeFabricTexture`, mirroring `applyFabric()`'s own scoping). Stored as a
plain dataURL directly on the piece object (not IndexedDB as originally guessed here) — it already
round-trips through undo/redo, Save Project, and Cloud Sync for free that way, since those all
already serialize the full `pieces` array; no separate storage layer needed.

### WP-40 — Fit Charts (standard + custom spec/tolerance sheet) — ✅ Landed
A per-size tolerance table (Export pane, `js/app.js`'s `buildFitChartRows`/`openFitChartModal`),
computed live by the same `computeMeasurements` grading engine as Auto Grade for every size (or
every Kids age) — one editable table, `FIT_TOLERANCE_DEFAULT` as the "standard" starting point and
a live override as the "custom" one, honestly covering both of Tailornova's line items without two
parallel implementations.

### WP-41 — Skip / deliberately not pursuing
Tailornova's StyleCustomizer™/3D Configurator (e-commerce embed), mobile body-scan integration,
order-processing dashboard, revenue reports, and tiered commercial/reseller licensing are B2B SaaS
business-model features — they assume a hosted multi-tenant backend and paying customers of
BerryStudio's own, which contradicts BerryStudio's actual model (a local-first, no-account,
installable PWA per `README.md`'s own framing). The closest honest equivalent already exists —
`window.BerryStudio`'s local automation API (`generate`/`grade`/`nest`/`export`/`validate`) lets
someone script BerryStudio from the browser console or an injected script today. Recommend
explicitly deciding "not doing this" rather than leaving it silently open — same convention
`BerryStudio-Upgrade-Plan-v3.md` §4 used for WP-32.

## 5. Sequencing recommendation — followed, all three landed

1. **WP-40 (Fit Charts)** — landed. Additive to the Export pane, no drafting-engine or layout risk,
   exactly as predicted.
2. **WP-39 (fabric texture upload)** — landed. Real, scoped, user-value-visible work, verified live
   with a genuine end-to-end test (2D fill + 3D material map from the same upload).
3. **WP-38 (synced workspace)** — landed as an opt-in Split View rather than a forced 3-panel
   layout change, resolving the product-direction question this section originally flagged in the
   direction that ships something real without regressing the existing tab flow for anyone who
   doesn't turn it on.

With all three closed, the only open item from this study is **WP-41 (deliberately skipped)** —
see §4 above for why, and `README.md`/`CHANGELOG.md` for the shipped detail.
