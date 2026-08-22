# Prompt — Professional Pattern Library Rebuild for BerryStudio

> Paste everything below the line into Claude, with the BerryStudio repository available.
> Written against commit state of `github.com/mohammedamy/BerryStudio` as inspected on 22 August 2026.
> All architectural facts, tolerances and defect counts below were verified by direct code inspection and by executing the repository's own test suite — do not treat them as assumptions.

---

## 1. Role and objective

You are a senior patternmaking engineer and computational geometry specialist working on **BerryStudio**, a build-free, offline-first bilingual (Arabic/English) PWA for fashion pattern design, grading and 3D simulation.

Your objective is to **replace the entire bundled pattern library** with a professionally drafted one that is:

1. **100% compatible** with the existing 2D canvas, 3D Preview and 3D Cloth Lab — no changes to their public contracts;
2. **Individually drafted** — every design a distinct construction, not a shared block driven by a few scalars;
3. **Dimensionally accurate** — every piece measurable, gradeable and defensible against real drafting practice;
4. **Uniquely and realistically thumbnailed** — each card showing that specific garment, derived from its own geometry;
5. **Fully bilingual** — Arabic and English at parity for every name, description and piece label;
6. **Verifiably clean** against the repository's own validator, at the numeric targets in §8.

Work in phases (§9). Do not attempt the whole library in one pass.

---

## 2. Non-negotiable architectural constraints

These are properties of the shipped app. Violating any of them breaks it.

| Constraint | Detail |
| --- | --- |
| **No build step** | `index.html` loads `js/*.js` directly as native ES modules via `<script type="module">`. `package.json` is dev/test tooling only and is never referenced by the browser. Do not introduce bundlers, transpilers, JSX or TypeScript into the shipped path. |
| **No runtime dependencies** | The app must work fully offline after first load. No CDN imports, no new npm runtime packages, no external raster assets. |
| **Load order matters** | Registration modules run as side effects, in the order of the `<script>` tags in `index.html`. `js/data.js` must be evaluated before any module that mutates `PATTERNS` / `LIBRARY`. |
| **Centimetres throughout** | All drafting geometry is in cm, in the piece's own local drafting space. The canvas handles scaling and layout offsets. |
| **Grading is live** | `pieces(m)` is re-invoked on every measurement change. It must be a **pure function** of `m` — no caching, no randomness, no `Date.now()`, no module-level mutable state. Identical `m` must always yield identical geometry. |

---

## 3. The registration contract

`js/data.js` exports the shared registries and the measurement engine:

```js
export const SIZES        // ["XXS".."6XL"], 11 sizes; M is index 3
export const SIZE_STEP    // size -> integer step relative to M
export const KIDS_AGES    // 7 age bands with reference heights
export const BASE         // per-category base body at size M
export const GRADE        // per-size-step increments in cm
export const STANDARDS    // intl | egypt | saudi — body offsets + ease multiplier
export function computeMeasurements({ category, size, standard, kids, custom })
export const q            // v => v / 4   (quarter-measurement helper)
export const PATTERNS     // id -> pattern object
export const LIBRARY      // array of catalogue entries
```

A registration module is an IIFE that imports the registries and mutates them:

```js
import { PATTERNS, LIBRARY } from './data.js';

PATTERNS[id] = {
  id,
  category,                    // 'women' | 'men' | 'girls' | 'boys'
  name: { en, ar },
  desc: { en, ar },
  pieces: (m) => [ /* piece objects */ ],
};

LIBRARY.push({ id, cat: category, tag: { en, ar }, type });
```

`m` is the object returned by `computeMeasurements`, with keys:
`chest, waist, hips, shoulder, backLen, sleeve, neck, bicep, inseam, thigh, height`.

Base bodies at size M:

| Category | chest | waist | hips | shoulder | backLen | sleeve | neck | bicep | inseam | thigh | height |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| women | 88 | 70 | 96 | 39 | 41 | 58 | 37 | 28 | 78 | 56 | 167 |
| men | 100 | 86 | 100 | 46 | 45 | 64 | 40 | 33 | 82 | 60 | 178 |
| girls | 68 | 60 | 72 | 31 | 31 | 44 | 30 | 21 | 58 | 40 | 134 |
| boys | 70 | 63 | 73 | 32 | 33 | 46 | 31 | 22 | 60 | 41 | 138 |

Every dimension you draft must be expressed as a formula in these variables. **Never hard-code a number that should scale with the body.** Constants are acceptable only for genuinely size-independent details (seam allowances, button diameters, placket widths, collar stand heights).

---

## 4. The piece object contract

```js
{
  key:      'front_bodice',            // unique within the pattern, snake_case
  name:     { en: '…', ar: '…' },      // garment-specific, not a generic role name
  desc:     { en: '…', ar: '…' },
  outline:  [[x, y], …],               // cm, consistent winding, no duplicate consecutive points
  darts:    [[[apex],[legA],[legB]], …],
  notches:  [[x, y], …],               // must lie on the outline
  grain:    [[x1, y1], [x2, y2]],
  curves:   [{ fromIdx, toIdx, c1: [x,y], c2: [x,y] }, …],   // cubic bezier on an outline edge
  role:     'bodice-front-center',     // from the 46-value vocabulary — see below
  cutOnFold: true,
  bilateral: false,                    // true => cut as a mirrored pair
  chestEdgeIndices: [1],               // index into outline of this piece's chest-level vertex
}
```

### 4.1 `curves` — how real curvature is represented

`curves` attaches cubic Bezier control points to an outline **edge**, identified by its endpoint indices. This is the mechanism the canvas edit tools, the DXF curve layer and the smooth-seam renderer all consume.

**Curvature must be authored as `curves` entries, not as dense sampled polylines.** Sampling a curve into 40 outline points is what produced the duplicate-point defects already documented in the repository. A princess seam, armhole, neckline, sleeve cap or hip curve should be a small number of outline vertices carrying a `curves` entry — not a point cloud.

`curves` indices are maintained by the canvas when points are spliced; keep `fromIdx`/`toIdx` consistent with the final outline array you emit.

### 4.2 `role` — the binding to 3D and the Cloth Lab

`role` is the single field that binds a 2D piece to its 3D placement. `cloth-lab/src/pattern/roles.js` maps each role to a placement strategy and a body zone. **Do not invent role names.** The vocabulary is exactly these 46 values:

```
front-panel, back-panel, hip-panel-front, hip-panel-back, sleeve,
brief-front, brief-back,
bodice-front-center, bodice-front-side, bodice-back-center, bodice-back-side,
skirt-front-gore, skirt-back-gore, skirt-side-gore-left, skirt-side-gore-right,
sleeve-upper, sleeve-under, cap-sleeve, puff-sleeve, butterfly-sleeve,
collar, undercollar, collar-stand, collar-band, lapel-facing, placket-facing,
hood, cape, cape-overlay, yoke, epaulette,
peplum-front, peplum-back, sash, wrap-tie, belt, waistband,
godet, tier, pocket, facing, lining, cuff, rib-cuff, hem-band, other
```

Notes that matter:

- A piece with **no** `role`, or a role outside this list, falls back to `classifyLegacy`'s **name-based guess** in the Cloth Lab. That fallback has already caused a confirmed real bug (a brief simulated as a torso bodice). Always declare a role.
- Panel-shaped roles carry a `zone` (`upper`/`lower`) used by `js/body-zone.js`. Accessory roles deliberately do not.
- Accessory roles (collar, cuff, pocket, waistband, godet, tier, cape, hood, …) are **placed but not auto-seamed** into the shell. That is expected behaviour, not a defect to work around.
- If you add a genuinely new role, you must update **all** of: `cloth-lab/src/pattern/roles.js`, the `role` enum in `schema/pattern-spec.v1.json`, and — if it is a panel role — `js/body-zone.js`, which is kept in sync by hand. Prefer reusing an existing role.

### 4.3 `ROLE_PAIR` — verified front/back pairing

`js/validate.js` pairs pieces by declared role first ("Verified"), falling back to name matching ("Heuristic"). The current map is small:

```
bodice-front-center ↔ bodice-back-center
bodice-front-side   ↔ bodice-back-side
front-panel         ↔ back-panel
hip-panel-front     ↔ hip-panel-back
skirt-front-gore    ↔ skirt-back-gore
```

Pairing only fires when there is **exactly one** piece of each role in the set. Two pieces sharing a role (e.g. a wrap front) is deliberately left unpaired rather than guessed.

---

## 5. Verified baseline — what is actually wrong today

Measured by running the repository's own sweep (`node --test test/validate-library.test.js`) plus a per-check breakdown, over **264 registered patterns / 1,867 pieces**. Reproduce these numbers before you change anything, so you can prove your improvement.

**Aggregate:** `pass 7902 · warn 2093 · fail 258 · deferred 1867`

**Per check (with body chest supplied):**

| Check | Result |
| --- | --- |
| closedOutline | 1867 pass |
| selfIntersection | 1867 pass |
| grainline | 1867 pass |
| seamAllowance | 1867 warn *(harness artifact — see below)* |
| foldSymmetry | 1851 pass · **16 fail** |
| ease | 93 pass · 30 warn · 8 fail · **1736 deferred** |
| seamLengthParity | 135 pass · 82 warn · **242 fail** |
| notchAlignment | 315 pass · 144 warn |

**Cross-piece pairing:** 287 verified · 90 heuristic · 82 unmatched

### 5.1 The five real defects

**A. Ease is unmeasurable on 93% of pieces.** Only **131 of 1,867** pieces declare `chestEdgeIndices`, so `checkEase` returns "not applicable" for 1,736. The entire Fancy Collection (671 pieces) declares none.

**B. Construction detail is essentially absent.** Across the whole library: **14 pieces** carry darts (0.7%), **244** carry notches (13%). A library where fewer than one piece in a hundred has a dart is not a professional patternmaking library.

**C. The 100-pattern catalogue is five scalars per garment.** Every entry in `js/library.js` is `{ lengthF, flareF, fitF, sleeveLenF, sleeveWideF }` fed to one shared `AIGen.build`. This is the direct, mechanical cause of the "generic designs" problem: `w01` (A-Line Midi Dress) and `w19` (Straight Midi Dress) differ only by two decimals. There are no yokes, plackets, collars, cuffs, pockets, waistbands or princess seams anywhere in it.

**D. All 308 patterns share 13 thumbnails.** `LIB_ICONS` in `js/app.js` (≈line 358) is a 13-entry map of generic garment glyphs keyed by `type`; `renderLibraryPane` selects with `LIB_ICONS[x.type] || fallback`. All 100 gymnastics leotards render the same pink icon.

**E. 16 fold edges are not straight.** Bezier-sampled fold edges in the Fancy Collection deviate up to 0.23cm in X. A fold must be perfectly straight.

### 5.2 Two findings you must interpret correctly — do not "fix" them naively

**The 242 seam-parity failures are largely a proxy artifact, not 242 drafting bugs.**
`checkSeamLengthParity` measures each piece's **bounding-box vertical extent** (`max(y) − min(y)`) as a stand-in for side-seam length, because — as the FAQ states — the library carries no explicit seam-pairing data. Front necklines are correctly drafted ~0.5cm deeper than back necklines, which makes the front piece 0.5cm taller, which the proxy reports as a constant `5.0mm` failure. That is **correct patternmaking being penalised by a bounding-box heuristic.**

The honest fix is **not** to flatten front necklines to match the back. It is to give the library the seam data it lacks. `schema/pattern-spec.v1.json` already defines the structure, and the library has never used it:

```json
"seams": [{ "id": "side-left", "a": "front_bodice/edge-3", "b": "back_bodice/edge-3" }]
```

Introduce explicit seam-edge pairing in the new library, and extend `checkSeamLengthParity` to measure the **actual paired edge polyline lengths** when that data is present, falling back to the existing bounding-box proxy when it is not. Then a real parity failure means a real un-sewable seam.

**The 1,867 `seamAllowance` warnings are a Node harness artifact.** `checkSeamAllowance` warns when no `offsetPoly` function is supplied; the Node test does not pass `Canvas.offsetPoly`. In the browser this check runs for real. Wire `Canvas.offsetPoly` into your verification harness so you are testing the real check, and treat any genuine self-intersecting or winding-inverted offset as a hard failure.

---

## 6. The validator — exact pass criteria

`js/validate.js`, `run(pieces, ctx)` where `ctx = { seamAllowanceCm = 1, offsetPoly, bodyChestCm }`.

| Check | Passes when |
| --- | --- |
| `closedOutline` | ≥3 points; all coordinates finite; **no duplicate consecutive points, including the wraparound pair** (last→first). |
| `selfIntersection` | No non-adjacent edge pair intersects. |
| `grainline` | Present, ≥2 points, non-degenerate; within **0.5°** of a cardinal direction, or intentionally in the **30–60°** bias band. |
| `seamAllowance` | `offsetPoly(outline, seamCm)` neither self-intersects nor inverts polygon winding. |
| `foldSymmetry` | Any run of points within 2% of the piece's own min-X, spanning ≥30% of its height, must be collinear within `max(0.05cm, 0.5% × width)`. |
| `ease` | Requires `chestEdgeIndices`. Computes `half = |outline[idx].x − minX|`, `implied = half × 4`. **fail** if `implied < bodyChest`; **warn** if ease `< 5cm`; else pass. |
| `seamLengthParity` | Paired front/back vertical extents within **3mm**. |
| `notchAlignment` | Equal notch counts, positions matching within **5% of perimeter**. |

Design to these tolerances deliberately. In particular: the ease check assumes a cut-on-fold half-piece whose counterpart contributes about the same width, so `chestEdgeIndices` is only meaningful on a piece where that holds. On a princess-seamed or asymmetric front, leave it undeclared — "not applicable" is the honest result, and guessing produces a false pass.

---

## 7. What to build

### 7.1 Drafting standard

Each garment is drafted **individually** from a real block, not emitted from a shared silhouette function. Concretely, per design:

- A **named drafting basis** in the file comment — the block and the ease scheme it derives from, with the ease budget stated in cm at chest, waist and hip.
- **Real construction pieces** where the design calls for them: yokes, plackets, collar stands and undercollars, two-piece sleeves, cuffs, waistbands, facings, pockets, godets, gussets, peplums, tiers.
- **Shaping that matches the silhouette**: darts (bust, waist, shoulder, back-neck), or princess seams that absorb the equivalent suppression. A fitted garment with no suppression anywhere is a failure of the brief.
- **Notches** at every seam that needs registration: sleeve cap front (single) and back (double), side seams, waist joins, princess seams, centre-front/centre-back.
- **`curves` entries** on every armhole, neckline, sleeve cap, crotch curve, princess seam and hip curve. Straight-line armholes are not acceptable.
- **Grainlines** that reflect the intended cut — cardinal for standard pieces, and genuinely in the 30–60° band for pieces that are actually cut on the bias (circle-skirt gores, bias facings, some drapes).
- **Seam pairing** declared per §5.2 for every seam intended to be sewn.

**Differentiation requirement.** Any two designs in the same category and garment type must differ in at least **two of**: piece count, seam architecture, suppression method, sleeve construction, neckline construction, closure type. Differing only in length/flare/fit scalars is explicitly insufficient — that is the current defect.

### 7.2 Bilingual requirement

- Pattern `name`, `desc`, `tag`, and every piece `name`/`desc` carry both `en` and `ar`.
- Arabic must be **correct patternmaking Arabic**, not machine translation of the English label. Use the terminology already established in `js/i18n.js` and the existing Arabic piece names (`قصة أمامية`, `كم مركّب`, `بنسة`, `خط اتجاه القماش`, …). Where a term is genuinely absent, follow the register already in the file.
- Do not embed directional control characters in the data. RTL is a rendering concern, already handled.
- `test/i18n-coverage.test.js` must stay green.

### 7.3 Thumbnails — derive them, don't draw them

The requirement is that each thumbnail *represents exactly that pattern*, realistically, uniquely, for 300+ garments — offline, with no raster assets, in a build-free app. Hand-drawing 300 SVGs cannot satisfy that, and would silently drift out of sync the moment a piece is regraded.

**Build a deterministic garment-flat renderer** that composes a technical flat directly from the pattern's own pieces:

1. Call `pieces(m)` at the category's size-M measurements.
2. Select the silhouette-defining pieces by `role` (front panel / bodice front, sleeve, skirt or hip panel, plus collar, yoke, cuff, waistband, peplum, tier when present).
3. Mirror cut-on-fold pieces about their fold edge to reconstruct the full front.
4. Assemble at anatomical anchor points into a front-view flat, honouring the `curves` data so necklines and armholes render as real curves.
5. Overlay construction detail actually present in the geometry: dart legs, princess seam lines, plackets, pocket outlines, closure marks, hem and cuff lines.
6. Emit a compact inline `<svg>` with a `viewBox`, normalised to the card box.

Then:

- Give each design a **per-design colourway** (fill, accent, stitch-line colour) as part of its catalogue entry, so cards are visually distinguishable at a glance as well as structurally accurate.
- **Cache** the rendered string per pattern id at size M. Thumbnails do not need to regrade — the library grid renders many cards at once and must stay responsive.
- Keep `LIB_ICONS` as the **fallback** for any pattern whose flat cannot be composed, and for `state.mine` user-saved patterns. Do not delete it.
- Update `renderLibraryPane` in `js/app.js` (≈line 1029) to prefer the generated flat over `LIB_ICONS[x.type]`.
- Theme-aware: use the existing CSS custom properties for stroke and background so thumbnails work in every theme.

This gives uniqueness, accuracy and realism as *structural consequences* of the geometry rather than as hand-maintained artwork — and any pattern whose flat looks wrong is telling you its geometry is wrong.

---

## 8. Acceptance criteria

Numeric, verifiable, measured by the repository's own suite.

**Hard gates — must all hold:**

1. `npm test` passes in full. `npm run test:e2e` passes.
2. The validator **never throws** on any registered pattern.
3. `closedOutline`, `selfIntersection`, `grainline`: **100% pass**, no regression.
4. `foldSymmetry`: **0 failures** (from 16).
5. `seamAllowance` with real `Canvas.offsetPoly` supplied: **0 failures**.
6. `ease` **deferred ≤ 20%** of pieces (from 93%). Every symmetric cut-on-fold bodice/panel front declares `chestEdgeIndices`. Princess-seamed and asymmetric fronts remain honestly deferred.
7. `ease` **0 failures**; warns only where a close fit is the stated design intent, documented in the piece `desc`.
8. `seamLengthParity`: **0 failures** measured against real declared seam edges. Report the bounding-box proxy number separately for continuity.
9. Cross-piece pairing: **≥95% verified**, **0 unmatched** among pieces that have a genuine counterpart (from 287/90/82).
10. `notchAlignment`: **0 failures**, and ≥80% of pieces carry notches (from 13%).
11. Every piece declares a `role` from the 46-value vocabulary. Zero reliance on `classifyLegacy`.
12. Every pattern and piece has non-empty `en` **and** `ar` name and desc.
13. Every pattern renders a unique generated thumbnail. **No two patterns produce identical thumbnail SVG.** Assert this in a test.
14. Every pattern loads in 2D, 3D Preview and 3D Cloth Lab without console errors, and simulates without exploding.
15. Round-trips losslessly through Save Project → Import, and exports valid SVG, DXF, HPGL, PNG and tiled PDF.
16. `window.BerryStudio.generate/grade/nest/export/validate` continue to work unchanged.

**Quality gates:**

17. Every design carries ≥1 real construction feature beyond a plain panel (dart, princess seam, yoke, placket, collar, cuff, waistband, pocket, godet, gusset, peplum or tier).
18. No two designs in the same category+type differ only by scale factors (§7.1).
19. Grading verified at XXS, M and 6XL, and across `intl`/`egypt`/`saudi`, with no self-intersection or degenerate geometry at any extreme.
20. Kids patterns verified across all 7 `KIDS_AGES` bands.

**Add these tests:**

- `test/library-roles.test.js` — every piece has a valid role; no legacy-classify fallback.
- `test/library-thumbnails.test.js` — every pattern renders; all SVGs distinct.
- `test/library-i18n.test.js` — bilingual completeness.
- `test/library-grading.test.js` — geometry integrity at size and standard extremes.
- Extend `test/validate-library.test.js` to **assert** the §8 thresholds rather than only reporting them.

---

## 9. Phasing

Do not attempt 300+ patterns in one pass. Each phase must land green before the next begins.

| Phase | Deliverable |
| --- | --- |
| **0 — Baseline** | Reproduce §5 numbers. Commit the diagnostic harness with `Canvas.offsetPoly` wired in. No behaviour change. |
| **1 — Infrastructure** | Seam-edge declaration + parity check upgrade (§5.2); thumbnail renderer (§7.3) with `LIB_ICONS` fallback; new test files asserting current numbers. Library content unchanged. |
| **2 — Reference set** | Draft **12 patterns** to the full §7.1 standard — 3 per category, spanning bodice+sleeve, skirt/trouser, and a multi-piece tailored garment. These establish the drafting idiom, helper vocabulary and file conventions. **Stop and present these for review before continuing.** |
| **3 — Core catalogue** | Extend to the 100-pattern Women/Men/Girls/Boys catalogue, replacing the five-scalar entries. |
| **4 — Collections** | Rebuild Fancy (64), Gymnastics Leotards (100), Underwear & Bra (44) to the same standard. Fix the 16 fold-edge and all duplicate-point defects at source. |
| **5 — Verification** | Full §8 sweep, cross-browser, 3D and Cloth Lab pass, export round-trips, performance check on the library grid. |

---

## 10. Working rules

- **Read before writing.** Start with `js/data.js`, `js/validate.js`, `cloth-lab/src/pattern/roles.js`, `cloth-lab/src/pattern/importFromApp.js`, `schema/pattern-spec.v1.json`, `js/library.js`, and `js/app.js`'s `renderLibraryPane`/`LIB_ICONS`. The repository's `README.md` and `CHANGELOG.md` carry the WP-numbered history and the existing honest-notes convention.
- **Fix at source, never at the reporting layer.** The repository has an established practice of reporting real defects honestly rather than suppressing them (see the FAQ's own admissions). Preserve it. Never loosen a tolerance to turn a failure green.
- **Report honestly.** If a check cannot be satisfied for a legitimate reason, report it as deferred with the reason, exactly as the existing validator does. A documented deferral is acceptable; a silent guess is not.
- **Preserve the comment idiom.** Existing code explains *why* a decision was made, including its limitations, and cross-references related files. Match it.
- **Keep it reviewable.** One phase per pass. Where a piece's geometry embodies a real drafting rule, state the rule in the comment.
- **Ask before diverging.** If achieving a §8 gate would require changing a public contract — a role name, a check's semantics, an export format — stop and raise it rather than changing it unilaterally.

---

## 11. Deliverables

1. Replacement pattern library modules, phased per §9.
2. `js/pattern-flat.js` (or equivalent) — the thumbnail renderer, plus the `js/app.js` integration.
3. Seam-edge declaration support and the upgraded `checkSeamLengthParity`.
4. The five new/extended test files from §8.
5. A verification report: before/after table for every check in §5, the §8 gates with measured values, and an honest list of anything still deferred and why.
6. `CHANGELOG.md` entries in the repository's existing WP-numbered style.
