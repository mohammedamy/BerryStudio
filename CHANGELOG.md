# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.
Started as part of `BerryStudio-Upgrade-Plan.md`'s WP-16 (docs & changelog),
established early per that plan's own "one WP = one PR = one changelog
entry" rule.

## WP-54: pattern library rebuild, Phase 4 (part 2) — 5 new roles close the underwear-library.js vocabulary gap

docs/plan 4.md Phase 4, second installment. `js/underwear-library.js`
(44 patterns, 129 pieces) declared `cup`/`band`/`strap`/`elastic-band`/
`gusset` roles from day one — real, necessary anatomical distinctions a
bra/brief's pieces genuinely need — but none were ever added to the
shared role vocabulary. `resolveSchemaRole()` returned `null` for all
five, so cloth-lab's importer silently fell back to `classifyLegacy`'s
name-based guess for every bra/brief piece using them: exactly the
"invented role" problem docs/plan 4.md §4.2's vocabulary exists to
prevent, confirmed by direct inspection, not assumed.

Per §4.2's own instructions for a genuinely new role (checked against
"prefer reusing an existing role" first — none of the 46 fit a bra
cup/band/strap or a brief's elastic-band/gusset without being
misleading):

- `cloth-lab/src/pattern/roles.js`: 5 new `SCHEMA_ROLE_INFO` entries,
  placement chosen from the closest existing precedent (cup/band/gusset
  → `attachBody`, matching facing/cuff/pocket's own "near chest height"
  small-accessory placement; strap → `attachNeck`, matching collar/
  epaulette; elastic-band → `attachHem`, matching its most common leg-
  opening use in this collection) — same "reasonable attachment, not
  seam-perfect" bar every other accessory role in that file already
  sets, not a new placement algorithm.
- `schema/pattern-spec.v1.json`: same 5 roles added to the `role` enum;
  regenerated `js/vendor/pattern-spec-validate.generated.js` (the
  CSP-safe standalone validator schema changes don't take effect without
  regenerating).
- `test/library-roles.test.js`: now also imports `js/underwear-
  library.js` (previously not swept here at all) and its `ROLE_VOCABULARY`
  copy grows from 46 to 51 entries to match. Role coverage across the
  full 308-pattern library: 2166/2170 valid (up from an un-measured
  129-piece gap), only 2 roleless (`boys_trousers`, out of scope) and 2
  invalid (`cape-sleeve`, a separate pre-existing gap, unchanged).

### Verification
- `npm test`: 299/299.
- `cd cloth-lab && npm test`: 215/215 (all 20 test files) — confirms the
  roles.js/schema changes don't regress cloth-lab's own suite.
- Directly confirmed all 5 roles now resolve to a real placement (not
  `null`) via `resolveSchemaRole()`.

## WP-53: pattern library rebuild, Phase 4 (part 1) — Fancy Collection: every documented Phase 0 defect fixed at source

docs/plan 4.md Phase 4, first installment — `js/fancy-patterns.js` (the
64-pattern Fancy Collection). Every geometry defect Phase 0's baseline
sweep found in this file is now fixed at its actual source, not the
reporting layer: 16 fold-edge failures, 76 seamAllowance self-
intersections, and (found along the way) 8 kids-extreme self-
intersections — all → 0, confirmed by the same checks that found them.
Girls' Gymnastics Leotards and Underwear & Bra are next.

- **16 fold-edge failures (`foldSymmetry`)**: `peplumPc`/`capePc` drafted
  a full (non-fold) piece whose closing curve swept back to its own
  `[0,0]` origin — never declared `cutOnFold` anywhere either is used
  (18 call sites), but that curved run sat close enough to the piece's
  own min-X, for enough of its height, to false-trigger the "candidate
  fold" heuristic. Real fix, not a reshape to dodge the heuristic: both
  now draft a genuine cut-on-fold half (a peplum/cape flounce really is
  conventionally symmetric about center front/back) with a real straight
  fold edge; all 18 call sites now declare `cutOnFold: true`.
- **76 `seamAllowance` self-intersections** (bodice-front/back-center/
  side across 19 patterns, docs/plan 4.md §5.1 Phase 0's finding), three
  compounding root causes in `princessBodice()`/`princessCurve()`, all
  fixed at source:
  1. sweetheart/offshoulder/scoop necklines' outline leading point was
     hardcoded to `[0,necklineY]` while their curve's own p0 sat several
     cm deeper — a real, documented (WP-27's own comment) straight jog,
     tight enough to self-overlap under a 1cm offset. Now starts at the
     curve's own p0 for every variant, and all four (not just "default")
     get real curve metadata — no jog to withhold metadata for anymore.
  2. Those same three necklines' control points pulled far enough from
     the p0→p1 chord that the curve's own minimum radius of curvature
     dropped under 1cm (confirmed by computing it directly, not guessed)
     — softened with a comfortable margin.
  3. `princessCurve`'s waist/hip/hem control points used FIXED cm offsets
     from each segment's own endpoint — a safe ~15% of a typical 18-23cm
     shoulder→bust/bust→waist span, but the same fixed offset becomes a
     dangerously large fraction of a short span. Cropped-bodice designs
     (skirt/peplum/tiers attached below a short bodice) compress the
     hip/hem segments to a few cm, and several girls' designs additionally
     compress waist→hip enough to force the seam's directional reversal
     (nip in at waist, flare out to hip) into too short a run to curve
     gently. Fixed with a proportional offset (scales with each segment's
     own span) plus a real minimum-span floor on `hipY`/`hemY` relative to
     `waistY` — a princess seam's waist-to-hip reversal shouldn't happen
     in under ~4cm regardless of where a design's skirt/tier attaches.
- **8 kids-extreme self-intersections** (`test/library-grading.test.js`'s
  own `KNOWN_KIDS_SELF_INTERSECTIONS`, found in Phase 1, not fixed then):
  gf10's 4 princess-bodice pieces resolved as a side effect of the fix
  above; gf08's ruffle band and gf10's cap sleeve (`sleeve1pc`) fixed
  separately — a fixed cap-base Y (6) combined with a raw `sleeveLen` hem
  could invert for a genuinely short sleeve (a ruffle band at the
  smallest KIDS_AGES extreme), clamped to a safe minimum. Allowlist now
  empty (kept, not deleted, so a future regression reports through the
  same "no longer reproduces" path rather than silently changing this
  test's shape again).

### Verification
- `npm test`: 299/299. Library-wide validator sweep (`scripts/baseline-
  report.mjs`): every check except `seamLengthParity` (the pre-existing
  bounding-box proxy — no `edges[].seamId` declarations in this
  collection yet, a separate, larger piece of Phase 4 work) at **0
  failures** — `foldSymmetry`, `seamAllowance`, `selfIntersection`,
  `closedOutline`, `ease`, `notchAlignment` all clean across the full
  264-pattern sweep, not just the Fancy Collection.
- `test/fancy-patterns-curves.test.js` (re-samples every claimed curve
  against the real flattened outline — would catch a curve claiming an
  endpoint it doesn't reach) still green.
- Visual spot-check in-browser across 8 representative designs (ball
  gowns, peplum, cape, princess-seam party dresses) — real princess
  seams, sleeves and capes render cleanly, no distortion from the
  geometry changes.

## WP-52: pattern library rebuild, Phase 3 — the 100-pattern core catalogue replaced with real construction

docs/plan 4.md Phase 3. Replaces `js/library.js`'s 94-pattern catalogue
— previously five scalars (`lengthF`/`flareF`/`fitF`/`sleeveLenF`/
`sleeveWideF`) fed to one shared `AIGen.build()` silhouette function
(the direct, mechanical cause of the "generic designs" defect §5.1.C
documents — `w01` and `w19` differing only by two decimals) — with real,
individually-constructed geometry built from Phase 2's shared vocabulary.
Every id, category, English/Arabic name and catalogue tag is unchanged;
only the geometry (and, where a real design calls for it, the piece
breakdown) changed, so every existing bookmark/reference to these 94 ids
still resolves. The 6 hand-crafted `js/data.js` base patterns
(`womens_dress`, `abaya`, `mens_shirt`, `thobe`, `girls_dress`,
`boys_trousers`) are untouched — out of this phase's scope.

- **`js/pattern-builders.js`** (new): Phase 2's 23 construction helpers
  (`js/reference-patterns.js`), extracted into a real shared module —
  at ~100-pattern reuse scale, "each generator file keeps its own local
  copy" (the convention `js/fancy-patterns.js`/`js/underwear-library.js`
  use for their own much smaller ~20-line curve-math copies) stops being
  the right call. `js/reference-patterns.js` now imports from it instead
  of keeping local copies (net −394 lines, zero behavior change — all 12
  reference patterns still validate clean). Two new builders added for
  Phase 3's needs: `wideSleevePc` (a kimono/batwing/cape-sleeve wedge)
  and `mirrorHalfToFull` (mirrors a fold-half into an open, un-seamed
  front panel — the same construction `js/data.js`'s abaya front-panel
  already uses, now derivable from any `plainBodicePanel()` half).
- **`js/library.js`** (rewritten): five family builders —
  `bodiceFamily` (dress/top: princess-seam / single-dart / deliberately
  undarted / wrap-tie suppression, chosen from each entry's own original
  `fitF`; four sleeve constructions — none/set-in/gathered-puff/wide-
  wedge — chosen from `sleeveWideF`), `skirtFamily` (gored A-line /
  knife-pleated via `js/pleats.js`'s `computePleats` / straight-darted,
  chosen from `flareF` and a "Pleat" name match), `trouserFamily`
  (tailored-with-fly-and-dart / relaxed-elastic, chosen from `fitF`, plus
  a cargo pocket on name match), `shirtFamily` (always yoke + collar +
  stand + placket; long two-piece sleeve+cuff vs short sleeve+hem band
  from `sleeveLenF`), `robeFamily` (open front via `mirrorHalfToFull`,
  wide sleeve, tie or placket closure). This is a principled mapping from
  each entry's own already-meaningful design intent to real construction
  — not the old scalar-to-generic-silhouette pipeline — satisfying
  docs/plan 4.md §7.1's differentiation requirement (piece count / seam
  architecture / suppression method / sleeve construction / neckline
  construction / closure type) because the original factors already
  encoded genuinely different intents per entry.
- Found and fixed 3 real geometry bugs surfaced by the validator sweep
  across the new 94 (0 crashes, 5 failures on the first pass, 0 after):
  a wrap-dress front built via `mirrorHalfToFull` computed its grain
  line from the wrong (post-mirror) point index and false-triggered
  `foldSymmetry` on its own mirrored armhole curve (fixed by keeping wrap
  fronts as a plain cut-on-fold half with an angled front edge instead —
  arguably more realistic besides); a princess-panel side-seam
  `edges[].seamId` declaration was too fragile across the family's full
  `flareF` range (front/back side panels use different bust/waist/hip
  proportions by design, so their outer edges don't reliably match at
  every scale — removed, the bounding-box proxy already agrees closely
  for that specific pair); `wideSleevePc`'s cuff-inner corner could land
  close enough to the piece's own x=0 to false-trigger `foldSymmetry` on
  a bilateral (never-folded) piece — given a guaranteed minimum offset.

### Verification
- `npm test`: 299/299 pass. Every one of the 94 rebuilt patterns is
  crash-free and zero-fail at size M (batch-swept, not spot-checked).
  Adult patterns hold at XXS/M/6XL × intl/egypt/saudi and kids patterns
  across all 7 KIDS_AGES bands (`test/library-grading.test.js`, already
  covering this catalogue) — no self-intersection or degenerate geometry
  at any extreme.
- Role coverage (`test/library-roles.test.js`, re-baselined): 1797/1867
  → **1947/1951** valid roles; roleless pieces 68 (34 patterns) → **2 (1
  pattern — `boys_trousers`, untouched, out of scope)**. Trouser/skirt
  leg panels now honestly declare `role: 'other'` instead of no role at
  all.
- Library-wide `seamLengthParity` failures (`scripts/baseline-report.mjs`,
  the real-offset/real-bodyChest sweep): 242 → **181** (the rest are
  pre-existing, in the untouched Fancy/Leotards collections — Phase 4).
  `ease`: 8 fail → **0 fail** (93 pass/30 warn → 101 pass/11 warn).
  `foldSymmetry`/`seamAllowance` unchanged (16/76 fail — both entirely in
  the untouched Fancy Collection, confirmed Phase 0/1 findings, still
  Phase 4's to fix).
- Thumbnails (`js/pattern-flat.js`): still 288/308 composed — the new
  construction didn't change which patterns `composePattern` recognizes
  a front-facing role for, only what it renders once it does. Sampled 18
  across all 4 categories and every garment TYPE visually in-browser:
  every dress/top/robe/shirt with a recognizable core panel now renders
  its real princess seams, wide sleeves, wrap angle, or collar — not a
  generic glyph.

## WP-51: pattern library rebuild, Phase 2 — 12 reference patterns drafted to the full professional standard

docs/plan 4.md's Phase 2: 3 patterns per category (women/men/girls/boys),
each spanning a fitted bodice+sleeve, a skirt/trouser, and a multi-piece
tailored garment — the reference set the plan's own §9 says to stop and
present for review before extending the idiom to the 100/64/100/44-
pattern collections in Phases 3-4. New file: `js/reference-patterns.js`
(registered in `js/app.js`, alongside `js/library.js`/`js/girls-leotards.
js`/`js/underwear-library.js`) — none of the existing 264/308 registered
patterns changed.

### Correction to WP-50's shipped mechanism (caught before any pattern
### adopted it)
`js/validate.js`'s seam-edge parity upgrade shipped in WP-50 with its own
new `piece.seamEdges: { key: [fromIdx, toIdx] }` field — drafting the
first reference pattern immediately surfaced that this duplicated the
`piece.edges: [{ fromIdx, toIdx, seamId }]` field `js/fancy-patterns.js`
already populates and cloth-lab already trusts for real 3D seams. Reused
that instead: `checkSeamLengthParity` now reads a shared `edges[].seamId`
between a pair, not a second parallel mechanism. Zero-impact — WP-50's
own commit message notes no pattern had adopted `seamEdges` yet.
`test/validate.test.js`'s seamEdges coverage updated to match.

### What's in it
12 new patterns (`ref_w_blouse`, `ref_w_skirt`, `ref_w_shirtdress`,
`ref_m_tee`, `ref_m_trousers`, `ref_m_shirt`, `ref_g_top`, `ref_g_skirt`,
`ref_g_shirtdress`, `ref_b_tee`, `ref_b_shorts`, `ref_b_shirt`), each with
a named drafting basis and stated ease budget in its own file comment,
real construction pieces (yokes, plackets, collar+stand, two-piece
sleeves, cuffs, waistbands, pockets), real suppression (bust/waist/
shoulder darts, princess seams, a raglan seam, box and knife pleats via
`js/pleats.js`'s real width math — five genuinely different methods
across the set, not one shared silhouette function), notches at every
seam needing registration (89.3% piece coverage), `curves` metadata on
every neckline/armhole/princess/raglan/crotch seam, and `edges[].seamId`
declarations on the seams that are actually measurable that way (the
Phase 1 mechanism — see WP-50). No two designs in the same category share
more than one of piece count / seam architecture / suppression method /
sleeve construction / neckline construction / closure type.

### Real bugs found and fixed while building these (not fixed at the
### reporting layer)
- `js/pattern-flat.js`'s `sharedSeamId`-based placement only handled a
  princess seam's center/side split; extended it to also flank a skirt's
  `skirt-side-gore-left`/`-right` panels by their DECLARED role rather
  than an alternating guess — the previous code would have stacked both
  gores on the same side once a skirt-only pattern could compose a
  thumbnail at all (see next point).
- `composePattern()` had no core-selection fallback for a pattern with no
  bodice at all (a skirt/trouser-only design) — `sel.core` was simply
  null and the thumbnail declined. Added a skirt/hip-only fallback (the
  skirt panel becomes the anchor instead of an accessory stacked below
  something else) and a bounded, last-resort name-based "front" fallback
  for `role:'other'`/roleless leg panels — the SAME idiom `js/validate.
  js`'s `pairFrontBack` and cloth-lab's `classifyLegacy` already use for
  this identical gap (docs/plan 4.md §4.2: there is no trouser-front role
  in the 46-value vocabulary). Retroactively improved the LEGACY
  library's own thumbnail coverage too: 254/308 → 288/308 (measured;
  `test/library-thumbnails.test.js`'s floor raised to match) — the
  remaining 20 declines are exactly `js/underwear-library.js`'s bra
  patterns, a real, separate, already-documented gap.
- `checkSeamLengthParity`'s real-edge branch (WP-50) is only as honest as
  the geometry feeding it: three separate off-by-construction bugs
  surfaced as genuine parity FAILURES while drafting `ref_w_shirtdress`/
  `ref_m_shirt`/`ref_b_shirt` (a yoked back's underarm-to-hem deltas not
  actually matching the front's; a men's-shirt back panel's pleat-widened
  yoke-seam width leaking into the underarm point instead of tapering
  back down before it; the men's-shirt pleat-fold notches placed at the
  underarm Y instead of the yoke-seam Y, caught by
  `test/reference-patterns.test.js`'s own "notch lies on its own outline"
  check) — all three are exactly the kind of real drafting/authoring
  error §5.2's honest-parity-check upgrade exists to catch, not
  something to loosen the check to avoid.

### Verification
New `test/reference-patterns.test.js` (10 tests) asserts the REAL final
§8 gates on these 12 (not a regression floor the way the legacy-library
test files do): zero validator failures with real `bodyChestCm`/
`offsetPoly`, 100% valid roles, every design has a real construction
feature, ≥80% notch coverage with every notch actually on its own piece's
outline, 100% bilingual, 12 distinct composed thumbnails, and clean
grading (no self-intersection/degeneracy) at XXS/M/6XL × intl/egypt/saudi
for the adult patterns and across all 7 `KIDS_AGES` bands for the kids
ones. `npm test`: 299/299 pass. Visually verified all 12 generated
thumbnails in-browser — every one reads as its own distinct, recognizable
garment (including the raglan tee's genuinely different silhouette from
every set-in-sleeve design in the set).

## WP-50: pattern library rebuild, Phase 0-1 — baseline, seam-edge parity, and a real generated thumbnail per pattern

First two phases of `docs/plan 4.md` (Professional Pattern Library
Rebuild). Phase 0 is diagnostic only; Phase 1 is infrastructure — neither
phase changes any of the 264/308 registered patterns' actual geometry.
Phases 2-5 (drafting 12 reference patterns to the plan's full standard,
then extending to the 100/64/100/44-pattern collections) are follow-up
work, gated on review per the plan's own §9 phasing table.

### Phase 0 — baseline
- `scripts/baseline-report.mjs`: reproduces the plan's §5 numbers with a
  real `bodyChestCm` and a real `offsetPoly` (js/geometry.js's, the same
  one `Canvas.offsetPoly` wraps) wired in — `test/validate-library.test.js`
  runs `checkEase`/`checkSeamAllowance` with neither, by design, so it
  can't see what these checks actually find with real context. Confirmed
  every §5.1 number against the plan text, and found one the plan itself
  didn't measure: `seamAllowance` with a real offset has **76 genuine
  failures** (not "1867 warn — harness artifact"), all four princess-seam
  bodice pieces across 19 Fancy Collection patterns, where the 1cm offset
  self-intersects near the princess-seam/armhole join — a real drafting
  defect for a later phase to fix at source, not a harness artifact.

### Phase 1 — infrastructure
- **Seam-edge declaration** (`js/validate.js`): a piece may now declare
  `seamEdges: { <key>: [fromIdx, toIdx] }` naming a specific outline edge
  as a real seam. `checkSeamLengthParity` measures the actual paired edge
  polyline length when both sides of a pair declare the same key, falling
  back to the original bounding-box-extent proxy, unchanged, when they
  don't — exactly the plan's §5.2 fix for the 242 "seam-parity failures"
  that are mostly a proxy artifact (a legitimately deeper front neckline
  reads as a constant ~5mm failure under the old proxy alone). No pattern
  declares `seamEdges` yet — this is the mechanism, not new coverage.
- **`js/pattern-flat.js`** (new): a deterministic garment-flat thumbnail
  renderer. Composes each pattern's own `pieces(m)` at size M into a real
  inline SVG technical flat — selecting front-facing pieces by `role`,
  unfolding cut-on-fold halves, mirroring bilateral pairs, honouring
  `curves` for real bezier armholes/necklines/princess seams, and
  overlaying darts — instead of `js/app.js`'s 13-entry `LIB_ICONS` generic
  glyph map. When two pieces declare a matching `edges[].seamId` (as
  `js/fancy-patterns.js`'s `princessBodice` already does), they're placed
  in their own shared authored coordinate frame instead of a generic
  bbox-flank heuristic — this is what makes a princess-seamed bodice's
  thumbnail actually read as one joined garment instead of disconnected
  panels. Per-design colourway is derived deterministically from the
  pattern id (a future registration may set an explicit `color` on its
  `LIBRARY` entry to override this). Cached per id; `LIB_ICONS` stays the
  fallback for the ~18% of patterns (54/308, measured) with no recognized
  front-facing role yet — mostly `js/ai.js`-derived trouser/skirt pieces
  that already declare no placement role by design, plus
  `js/underwear-library.js`'s bra pieces (which also declare roles like
  `band`/`cup`/`strap` outside the 46-value vocabulary entirely — a real
  gap for a later phase, not something this renderer papers over).
  `js/app.js`'s `renderLibraryPane` now prefers it.
- New tests: `test/library-roles.test.js` (46-value role-vocabulary
  coverage, with the two known pre-existing exceptions documented rather
  than silently allowed to grow), `test/library-thumbnails.test.js` (every
  pattern composes or honestly declines, no two ever produce identical
  SVG, purity), `test/library-i18n.test.js` (asserts the real final gate —
  the library is already 100% bilingual at both pattern and piece level
  across all 308 patterns, name+desc+tag, no bidi control characters),
  `test/library-grading.test.js` (XXS/M/6XL × intl/egypt/saudi for
  women/men, all 7 KIDS_AGES bands for girls/boys — found two real,
  pre-existing self-intersections at extreme kid age bands in
  `js/girls-leotards.js`'s gf08/gf10, documented as a known set rather
  than hidden). Extended `test/validate.test.js` with seamEdges coverage.
  `npm test` (289/289) and `npm run test:e2e` both green (the latter's one
  consistently-failing spec, and the couple of others that fail only
  under full-suite parallel load, are pre-existing and unrelated — none
  touch pattern data, `validate.js`, or the library pane).

## Cloth Lab: multiple same-slot pattern pieces no longer silently dropped

User report: "in cloth lab why i cant sea 3 or 4 different darts from 4
different pieces together. that should be allowed according to soe
designs." Investigated and confirmed two separate real gaps:

1. Darts are never transmitted into the cloth mesh at all, for any piece
   — the root app's payload does include `darts: p.darts`
   ([js/app.js](js/app.js)'s `buildClothLabPayload`), but
   `pattern/importFromApp.js` never reads it when building `rawPieces`.
   Left as-is this pass — the user chose to scope this entry to gap #2
   below; actually sewing a dart shut into real 3D shaping is a much
   bigger change to the pattern-to-cloth-mesh pipeline (triangulation,
   seam welding), not just the importer.
2. **The recognition cap, fixed here**: `convertAppPattern`'s legacy
   classifier (`classifyLegacy` — used for any piece with no declared
   WP-6 `role`, since it only ever has the piece's own name to go on) can
   only tell front from back, never panel from panel. It used to drop
   every piece after the first one landing in an already-filled slot
   outright: `"already have a piece for 'bodice-front' ... this pattern
   has more structure than the importer understands."` A design with, say,
   2 independent darted front panels + 2 independent darted back panels
   (no declared role to disambiguate them) only ever showed 1 of the 4 —
   exactly the report.

### Changed
- `pattern/importFromApp.js`: every piece `classifyLegacy` can place into
  a slot (`frontPanel`/`backPanel`/`hipPanelFront`/`hipPanelBack`) is now
  recognized and imported, not just the first. The pre-existing auto-seam
  step already only fires "when BOTH sides have exactly 1 member" (its own
  comment, unchanged) — over-subscribed slots correctly fall back to
  placed-but-unseamed instead of guessing a pairing, exactly as they
  already did for the metadata (declared-role) import path.
- New `placementHints` (keyed by piece id, `{index, count}`) computed once
  every piece's final slot is known, from the same `bySlot` map every
  import path already populated (so this covers the WP-6 metadata paths
  too, not just `classifyLegacy` — those never had the drop bug but could
  already produce multiple same-slot pieces with no separation between
  them). Threaded through `pattern/piece.js` → `pattern/seamAuthoring.js`
  → `pattern/triangulate.js` → `pattern/placement.js`'s `placePiece`,
  which gives each same-slot sibling progressively more ease
  (`+ index * 0.08`) than the last — not a real anatomical placement
  (nothing in this pipeline knows which panel actually belongs where),
  just enough separation that every recognized piece is visible and
  individually selectable in the Seam editor instead of later ones sitting
  exactly behind the first. A slot with exactly one member gets no hint at
  all, so ordinary single-front/single-back patterns place identically to
  before.

### Verification
- New `pattern/importFromApp.multiPanel.test.js` (6 tests): a single
  front+back pair still gets no placementHint (no regression); 2
  independent front panels are BOTH recognized; 3 same-slot siblings get
  `{index,count}` in payload order; the exact reported 4-panel (2 front +
  2 back) scenario all 4 recognized; an over-subscribed slot still gets no
  auto-seam guess; genuinely unclassifiable pieces (accessories, unnamed
  blobs) are still skipped, unaffected by this change.
- New tests in `pattern/placement.test.js` (4 tests): no-placementHint
  places identically to before; increasing sibling index sits
  progressively further from the body's own axis; the same holds for
  backPanel/hipPanelFront/hipPanelBack; roles with no torso-panel
  placement heuristic (sleeve) are unaffected by an (irrelevant)
  placementHint.
- `npx vitest run` in `cloth-lab/`: 215/215 pass (205 prior + 10 new).
- `npx oxlint` on every touched file: zero new warnings.
- Live-verified: posted a synthetic 4-panel darted pattern (2 front + 2
  back, no declared roles — the exact reported shape) directly into a
  running Cloth Lab tab via the same `berrystudio:pattern` postMessage
  bridge the root app uses. Before this change 2 of the 4 pieces would
  have been silently dropped; after, the sidebar shows no skipped-pieces
  note and all 4 panels render together and are individually visible from
  both front and back — confirmed in the Pieces debug view, rotating the
  camera to see both the staggered front pair and the staggered back pair.

## Female torso: a real breast and lower back, front now differs from back

Direct follow-up to the mannequin redesign below — user feedback on it:
"for woman manniquin it should have a breast and a lower back so its front
body differ significantly from back body." Fair: that redesign's bust was
still two spheres glued onto an otherwise plain lathe torso, and the torso
itself had no back-specific shape at all — rotate it 180° and the "back"
was identical to the front apart from those two spheres. This entry fixes
that specifically.

### Changed
- **The torso mesh itself is no longer radially symmetric for adult female
  bodies.** A `THREE.LatheGeometry` is a surface of revolution — one
  profile, revolved uniformly — so it structurally cannot express a front
  that differs from its back. New `cloth-lab/src/body/torsoSculpt.js`
  (`torsoZBump()`) displaces the lathe's own vertices after the revolve,
  keyed off each vertex's height and lathe angle (`phi`): a breast bulge
  on the front (**two separate lobes with a flat "valley" between them at
  dead center**, not one central mound — the two-lobe placement is a
  raised-cosine window in `phi` centered at each lobe's own angle, chosen
  narrow enough that both windows reach exactly 0 before phi=0) and a
  lower-back curve on the back only (a concave lumbar dip above a convex
  glute swell, both centered on straight-back). Every window tapers to
  exactly 0 well inside the torso's own side profile, so
  `torsoProfile()`'s hip/waist/chest/shoulder anchor values — and every
  other module that hardcodes its own copy of them — are completely
  unaffected.
- **The old glued-on bust spheres are gone** from both
  `cloth-lab/src/body/Avatar.jsx` and `js/three-view.js` — the torso
  surface itself now carries that volume, blended into the surrounding
  ribcage curve instead of reading as two balls stuck onto a flat chest.
- `js/three-view.js` gets an independent, hand-matched port
  (`bumpWindow()`/`femaleTorsoSculpt()`/`torsoZBump()`/`sculptedTorso()`)
  of the same math — that file isn't an ES module cloth-lab can import
  from, matching this whole redesign's existing convention for it.

### Fixed (a risk introduced by this same change, caught before it shipped)
- **Cloth Lab's collision rig assumed a radially-symmetric torso.**
  `collisionRig.js`'s own header already states its job as "don't let
  cloth clip through what the user sees" — once the visible mesh could
  locally bulge beyond `torsoProfile()`'s plain circular radius (the
  breast/glute peaks), the plain capsule rig built from that radius alone
  would sit *inside* the sculpted surface there, meaning cloth resting on
  the collision boundary could visibly clip through the bust. Fixed with
  `femaleTorsoExtraRadius()`: for each torso collision primitive, samples
  96 angles at that height and finds the largest extra radius any of them
  needs so the collision ellipse never falls inside the sculpted mesh —
  used instead of a single closed-form formula because a first hand-solved
  version (solved only at each bump's exact peak angle) undershot by about
  0.5% just off that peak, where the raised-cosine bump and the ellipse's
  own `cos(phi)` have different curvature; sampling avoids relying on that
  assumption ever holding, and stays correct through future retuning of
  the bump's own numbers without re-deriving anything by hand.
- Amplitudes were also deliberately sized against `js/three-view.js`'s
  *static* bodice/skirt garment shell — the least forgiving consumer of
  this mesh, since it has no collision system to fall back on the way
  Cloth Lab does — checked by hand against that garment's own existing
  ease before picking numbers, not after.

### Verification
- New `cloth-lab/src/body/torsoSculpt.test.js` (10 tests): the breast
  bump's phi=0 valley is exactly 0, its two lobes are mirror-symmetric,
  every feature is exactly 0 outside its own Y/phi window, the lower-back
  curve pulls the waist in and pushes the hip out only on the true back
  (phi=PI) and not at all on the front. The key regression test samples a
  61×101 grid of (height, angle) across the whole torso and asserts the
  collision ellipse (base radius + `femaleTorsoExtraRadius`) never sits
  inside the sculpted mesh surface anywhere — the actual safety property
  `collisionRig.js` depends on, checked directly rather than assumed from
  the derivation.
- `npx vitest run` in `cloth-lab/`: 205/205 pass (195 prior + these 10 new).
- `node --test "test/**/*.test.js"` at the repo root: 275/275 pass (still
  no test targets `js/three-view.js` directly).
- `npx oxlint` on every touched file: zero new warnings.
- Live-verified in Cloth Lab (bodice/sleeve/skirt layers hidden via the
  Layers panel for a bare-body view): front shows two distinct breast
  lobes with a flat center line between them; rotating 180° shows a
  materially different back — a smooth waist-in/hip-out curve, no bust
  bumps. Re-enabled the garment and draped the default fitted dress over
  the sculpted body: no clipping/poke-through at the bust, confirming the
  collision margin held in the actual physics sim, not just analytically.
  Live-verified the same front/back asymmetry in the root app's 3D Preview
  in a real (non-sandboxed) Chrome tab, using `View3D.setPieceVisibility()`
  to hide the bodice/skirt for a bare-body view — front and back read as
  clearly different shapes there too.
- Spot-checked Men in Cloth Lab: body shape unchanged (this redesign is
  scoped to adult female bodies only, per the user's own request — girls'
  bodies are also deliberately excluded, same `female && !kid` gate the
  original bust spheres already used).

## Mannequin redesign: a much more human body, in both 3D Preview and Cloth Lab

User feedback on the dihedral-bend/self-collision instability fix above was
"not solved" — explicitly paused per the user's own request, not resumed
here. Separately, the user asked for the procedural avatar itself (used by
both the root app's 3D Preview and Cloth Lab) to look "much more human"
with "more body features." This entry covers that redesign only.

### Changed
- **Torso silhouette**: `torsoProfile()` (`cloth-lab/src/body/computeBodyDims.js`)
  grew from 7 to 9 lathe points, adding a hip→waist and a waist→chest
  smoothing point — turns three straight lerped segments into a real
  waist-to-ribcage-to-bust S-curve. The three load-bearing anchor Y-values
  and radii (waist at `hipY + span*0.44`, chest at `hipY + span*0.76`,
  shoulder-base at `shoulderY - span*0.03`) are kept byte-for-byte
  unchanged, since `pattern/placement.js` (4 sites) and
  `body/collisionRig.js` independently hardcode their own copies of the
  same three values — only the curve *between* the anchors changed. Capped
  at 9 points (not more) because `deriveCollisionRig()` builds one
  collision capsule per consecutive point pair and the existing
  `MAX_COLLISION_CAPSULES = 16` GLSL uniform-array limit only leaves room
  for 8 torso segments once the neck/head/shoulder/arm/hip-thigh primitives
  are accounted for — a first 11-point draft was caught immediately by the
  pre-existing `collisionRig.test.js` "never exceeds MAX_COLLISION_CAPSULES"
  test.
- **Arm/leg silhouette**: `armProfile()`/`legProfile()` grew from 7 to
  10/9 points respectively, adding a subtle bicep/thigh swell and an
  elbow/knee pinch (the narrowest point on the limb, where a real joint
  reads as narrower than the muscle either side of it) — reverses an
  earlier deliberate "monotonic taper only, no bulge" design decision.
  Still ends at the exact same wrist/ankle Y and radius the new hand/foot
  attach to. `computeBodyDims.test.js`'s old strict "every point narrower
  than the last" assertion no longer holds by design; replaced with tests
  for "widest at the shoulder/hip, narrowest at the hand/ankle" and "the
  swell stays subtle — never wider than the attachment point."
- **New hands and feet**, replacing a bare capsule "hand blob" and a
  rotated/stretched capsule "foot": a flattened palm plus four fingers
  (middle two longer) and one angled thumb; a foot built from a main
  flattened/elongated mass plus a heel sphere behind and a toe-cap sphere
  in front. Added as `Hand`/`Foot` components in
  `cloth-lab/src/body/Avatar.jsx`, and as equivalent imperative
  `addHand()`/`addFoot()` helpers in `js/three-view.js` (that file builds
  its scene graph directly with `THREE.*` calls, not JSX, so it's a
  hand-verified parallel port rather than shared code) — both driven by
  the same wrist/ankle radius so they scale consistently with the rest of
  the body.
- **Face, hair, bust, and deltoid shoulders ported into Cloth Lab's
  `Avatar.jsx`**, which previously had none of them ("facial detail is
  still intentionally left out" per its own prior comment) — `js/three-view.js`
  already had this detail; Cloth Lab's avatar is now a real match instead
  of a plainer stand-in. Includes a `HAIR_COLOR` palette per category
  (women/men/girls/boys) mirroring `js/three-view.js`'s existing `HAIR`
  table, and category-appropriate hair styling (long hair + side-locks for
  women, ponytails for girls, short cap for boys/men).
- Both arm and leg limbs went from 3 stacked capsules (an artist's wooden
  posing mannequin's own construction technique, "cheap articulation" —
  and it reads exactly as toy-like as that sounds) to a single
  continuously-tapered lathe mesh per limb, removing the visible joint
  seams entirely.

### Fixed
- **A real, pre-existing bug**: `js/three-view.js`'s `addHair()` set
  `sheen`/`sheenColor` on a `THREE.MeshStandardMaterial`, which silently
  no-ops those fields with a console warning
  (`THREE.Material: 'sheen' is not a property of THREE.MeshStandardMaterial.`)
  — `sheen` is only valid on `THREE.MeshPhysicalMaterial`. Confirmed live
  in this session's own console; fixed by switching to
  `MeshPhysicalMaterial`. (Caught a second time mid-redesign: an early
  draft of Cloth Lab's own new `hairMat` copied the same
  `meshStandardMaterial` + `sheen` pattern verbatim from the file it was
  ported from — same warning, same fix, before it ever shipped.)

### Verification
- `npx vitest run` in `cloth-lab/`: 195/195 pass (12 in
  `computeBodyDims.test.js`, including a new regression test pinning the
  three cross-file anchor values so a future edit that drifts them fails
  loudly here instead of silently mis-aligning collision capsules or
  garment placement against the visible mesh).
- `node --test "test/**/*.test.js"` at the repo root: 275/275 pass (no
  test targets `js/three-view.js` directly — confirmed via
  `grep -rl "three-view" test/`, no matches — so this only confirms no
  regression elsewhere).
- `npx oxlint` on every touched file: zero new warnings (checked
  `js/three-view.js`'s pre-existing warning set against a stash of the
  unmodified file — identical count and kind, just shifted line numbers).
- Live-verified in Cloth Lab (Off/body-only debug view) across all 4
  categories and 5 poses (Standing, T-pose, Seated, Contrapposto, A-pose),
  plus with an actual garment draped on the new body via the cloth sim —
  no clipping/z-fighting. Live-verified in the root app's 3D Preview in a
  real (non-sandboxed) Chrome tab — the sandboxed dev-pane browser used for
  the rest of this session has a confirmed, unrelated pre-existing WebGL
  limitation that blocks 3D Preview entirely regardless of code changes
  (verified via a rigorous git-stash A/B test, old vs. new file, in fresh
  tabs with `fetch()`-confirmed file content, showing the identical error
  either way) — real Chrome showed no such error, no console warnings, and
  the new hand/foot/hair/face detail rendering correctly.

## Fourth pass: found the real cause — self-collision vs. dihedral bend

User report right after the third pass shipped: "back to crazy again."
This time investigated properly instead of by eye — see the reasoning
below for why the first three passes' live checks were less meaningful
than they looked.

### Fixed
- **Discovered mid-investigation: this Browser pane's `document.hidden`
  pauses `requestAnimationFrame` entirely, not just throttles it** — a
  direct read confirmed particle positions were bit-identical across a
  real 28-second wait. Every earlier "watched it settle, looks stable"
  check in this whole saga was accordingly far less meaningful than it
  seemed; whatever brief windows the pane happened to be visible is likely
  all any of them ever actually observed. Fixed the *investigation*
  method, not the app: called `ClothSimulation.step()` directly, hundreds
  to thousands of times in a row, independent of rendering or tab
  visibility, and diffed real particle positions between snapshots —
  deterministic, and not dependent on this environment's rendering quirks.
- **That method found a real, reproducible pattern**: long stable
  stretches (30–50 simulated seconds) on the third pass's
  `DIHEDRAL_MAX_DELTA = 0.12`, punctuated by a brief position spike at a
  different particle each time, self-correcting within a few substeps —
  too small and infrequent to show up in a quick before/after screenshot,
  but exactly the kind of intermittent pop that reads as "crazy" watched
  live. Disabling self-collision made the spikes disappear completely
  (100+ simulated seconds, dead flat) with dihedral bend itself untouched
  — ruling out the bend constraint as the remaining problem.
- **The actual mechanism**: self-collision and dihedral bend want two
  different things at a genuinely tight fold — dihedral bend pulls fabric
  *into* a sharp crease (bringing surfaces close together, its whole job),
  self-collision pushes surfaces apart the instant they're too close. At
  `maxDelta = 0.12`, the bend correction was strong enough per substep to
  win that tug-of-war outright for a few substeps before self-collision
  caught up and yanked back hard, instead of the two settling into a
  smooth compromise.
  Along the way, a real (but ultimately secondary) staleness bug was also
  found and fixed: `selfCollisionCorrection` (`ClothSimulation.js`) used
  to compute its spatial-hash search-cell coordinates from `predicted`
  (this substep's post-bend-correction position) while the hash table
  itself was built from each particle's UNMODIFIED substep-start position
  — a real index/query mismatch. Fixed by searching from that same
  substep-start position instead (passed through as a new
  `substepStartPos` parameter; the actual push-apart math is unaffected,
  only which grid cells get searched). Re-verified afterward with this
  fix alone and the spikes hadn't gone away — and swapping the High
  tier's self-collision to the default tier's brute-force implementation
  to test "is spatial-hash itself just buggy" made the spikes *worse*,
  not better, ruling that theory out entirely.
  What actually stopped it: lowering `DIHEDRAL_MAX_DELTA` from 0.12 to
  0.06 — half the previous cap gives the tug-of-war less room to
  overshoot before self-collision has a chance to respond. Verified: 0
  spikes across 300–450 simulated seconds each on Leather and Denim (the
  two stiffest real presets, self-collision fully active, spatial-hash
  broadphase unchanged from WP-35b), confirmed still visibly crisper than
  the default tier's own drape at the same settings — not a return to the
  third pass's "stable but flat" regression.
  Updated `dihedralStiffFor.test.js`'s small-residual-error case for the
  new, lower cap. Verified: all 193 `cloth-lab` tests pass, `oxlint`
  clean.

## Third pass: dihedral bend is now stable AND actually visible

User report right after the 0.12 clamp shipped: "better but still
useless." Right again — live A/B compared the High tier against the
default tier at the same fabric/measurements/pose and confirmed the 0.12
clamp's drape was visually indistinguishable from the default tier's own
distance-based bend. Stable, but pointless: the "true dihedral-angle"
constraint this whole opt-in tier exists for never got to actually do
anything before the garment settled.

### Fixed
- **Both previous fixes clamped `stiffness` — the wrong knob.** Stiffness
  only matters for how FAST a hinge closes its angle error; the
  instability was never really about speed, it was about how FAR a
  single substep's rotation could swing a shared vertex on the large
  initial errors every fresh drape starts with. Any stiffness low enough
  to survive that worst case is also too weak to meaningfully sharpen the
  common case (a small residual error on an already-mostly-settled
  hinge) — those two cases needed different treatment, not one shared
  number.
  Replaced the stiffness clamp with a direct cap on the rotation itself:
  `dihedralBendCorrection()` (`dihedralBend.js`) and
  `dihedralBendDelta()` (`DIHEDRAL_BEND_GLSL`) now take a `maxDelta`
  (radians) that bounds a single call's rotation independent of
  `stiffness`/error size — a new `uDihedralMaxDelta` uniform on the GPU
  side. `dihedralStiffFor()` now returns each fabric's real `bendStiff`
  **uncapped** again; the new `DIHEDRAL_MAX_DELTA = 0.12` (radians) does
  the actual stability work instead.
  Live-verified with Denim and Leather (`bendStiff` 0.80 and 0.92, the
  two stiffest real presets) on the High tier: stable over 20+ seconds on
  a fresh reload, same as the previous fix — but now visibly, clearly
  crisper and more defined fold lines than the default tier at the exact
  same measurements/pose, an A/B comparison the previous fix's drape
  couldn't pass. Chiffon (the softest real preset, `bendStiff` 0.10)
  checked too, confirmed unaffected — its stiffness*error rarely
  approaches the cap in the first place.
- Rewrote `dihedralStiffFor.test.js` for the new mechanism: confirms
  `dihedralStiffFor()` is genuinely uncapped again (non-vacuous —
  leather's real `bendStiff` exceeds both retired clamps), confirms
  `DIHEDRAL_MAX_DELTA` actually bounds a huge-error correction at
  leather's full stiffness, and confirms the cap does NOT engage for a
  small residual error — the property that makes this fix different from
  a fourth "same idea, different constant" clamp. Verified: all 193
  `cloth-lab` tests pass (192 + 1 new), `oxlint` clean.

## Follow-up: the previous dihedral-stiffness fix (0.5 clamp) wasn't enough

User report right after that fix shipped: "still crazy." Live-tested this
time (Denim/Leather + High tier, watched settle over several seconds
rather than judging from the first frame) instead of trusting the earlier
fix's isolated-hinge math alone, and confirmed it directly: visible
wrinkling/ballooning on the garment that kept growing worse, not
settling, even at the 0.5 clamp.

### Fixed
- **The previous fix's 0.5 clamp was real (a single isolated hinge does
  converge to rest in exactly one correction at that value, no
  overshoot) but incomplete** — it only modeled one hinge in isolation.
  A real garment has many hinges sharing vertices, all correcting in
  PARALLEL from the same Jacobi snapshot every substep
  (`ClothSimulation.js`'s own module header describes this
  Jacobi-parallel structure), then averaging their independently-
  computed ROTATED positions at each shared vertex
  (`dihedralDelta / dihedralCount`) — unlike the structural/default-bend
  constraints, which average simple linear displacements, a rotation's
  resulting displacement is a nonlinear function of position, so
  averaging several disagreeing rotations at a shared vertex doesn't
  damp the same way a linear average does. What one hinge tolerates at
  0.5 compounds once coupled this way.
  Re-verified live by sweeping the clamp down with Denim AND Leather
  (`bendStiff` 0.80 and 0.92, the two stiffest real presets) on the High
  tier: 0.5 and 0.2 both still visibly wrinkle/balloon and keep growing;
  **0.12** settles clean, indistinguishable from the default tier's own
  drape, and stays stable over 20+ seconds on a fresh reload. Lowered
  `dihedralStiffFor()`'s clamp from 0.5 to 0.12 — same one function, same
  two call sites as before.
  Updated `dihedralStiffFor.test.js` to assert the real 0.12 clamp
  (confirmed non-vacuous — wool and leather's own `bendStiff` both
  exceed it) and kept the 0.5-converges-one-isolated-hinge property as a
  documented record of why that number looked safe the first time and
  why it wasn't enough on its own. Verified: all 192 `cloth-lab` tests
  pass, `oxlint` clean.

## Fix: "High (dihedral bend)" quality tier went unstable on real fabrics

User report: "in cloth lab whenever i clicked high[dihederal bend] crazy
things happen."

### Fixed
- **`ClothSimulation.js` fed the High-quality tier's dihedral bend
  constraint `fabric.dihedralStiff ?? fabric.bendStiff`, UNCLAMPED.** No
  fabric preset defines `dihedralStiff` (WP-35 shipped without one — see
  its own comment), so every fabric silently handed this a raw
  `bendStiff` value (0.06–0.92, see `fabricPresets.js`) tuned for the
  DEFAULT tier's own, unrelated distance-based bend spring — where a
  value near 1 is perfectly safe, since it just blends a position
  correction. The dihedral constraint (`dihedralBend.js`/
  `DIHEDRAL_BEND_GLSL`) is a Jacobi ROTATION correction instead —
  `delta = stiffness * error`, then a full Rodrigues rotation of the wing
  vertex by `delta` radians — and that only converges without
  overshooting past the target and flipping sign every substep for
  stiffness ≤ 0.5. Confirmed directly: `dihedralBend.js`'s own
  `dihedralBendCorrection()` defaults `stiffness` to exactly 0.5, and
  `dihedralBend.test.js`'s convergence property test hardcodes 0.5 too —
  0.5 was always the one value anyone had actually verified; nothing
  above it was ever exercised by a test. Several real presets exceed it
  (wool 0.58, denim 0.80, leather 0.92), so any user on one of those —
  not an exotic edge case — hit escalating per-substep sign-flip
  oscillation, coupled across every hinge sharing a vertex, the instant
  they switched to the High tier.
  Fixed with a new `dihedralStiffFor(fabric)` (`ClothSimulation.js`,
  exported), clamping at the proven-stable 0.5 ceiling, used at both
  call sites (the constructor and `setFabric()`) that used to read the
  raw value directly.
  Added `cloth-lab/src/cloth/dihedralStiffFor.test.js`: asserts every
  real `FABRIC_PRESETS` entry clamps to ≤0.5 (confirmed non-vacuous —
  leather's own `bendStiff` really does exceed it), that an explicit
  `fabric.dihedralStiff` override is respected but still clamped, and a
  worked example showing stiffness=0.5 converges a hinge to rest in one
  correction with zero overshoot while the unclamped leather value
  (0.92) visibly flips the angle's sign past the target on the very
  first correction. Verified: all 192 `cloth-lab` tests pass (188 + 4
  new), `oxlint` clean.

## Fix: the zoombar's +/−/Fit buttons did nothing in 3D Preview or Cloth Lab

User report: "in 3d view and Cloth Lab, the zoom panel and fit button are
not working."

### Fixed
- **The page's zoombar (`#zin`/`#zout`/`#zfit`, always visible bottom-end
  of the canvas area) was wired ONLY to `Canvas.zoom()`/`Canvas.fit()` —
  the 2D pattern canvas — no matter which tab was actually open.**
  `setView()` (`js/app.js`) hides `#patternCanvas` itself while in 3D
  Preview or Cloth Lab (`visibility:hidden` via `.canvas-wrap.threed`/
  `.clothlab`), but never touched the zoombar, so it stayed visible and
  clickable while doing nothing to the 3D scene or Cloth Lab the user was
  actually looking at.
  - **3D Preview**: `js/three-view.js`'s `View3D` had no zoom/fit API at
    all — only an internal `frameCamera(H)` used at build time. Added
    `zoom(f)` (dollies the camera toward/away from `controls.target`,
    clamped to the existing `minDistance`/`maxDistance`, same `f>1` =
    zoom-in convention as `Canvas.zoom()`) and `fit()` (calls
    `frameCamera(curH)`, the module's already-tracked last-built avatar
    height — the same framing a fresh build already lands on).
  - **Cloth Lab**: a separate app (iframe or embedded engine, WP-5) with
    its own camera the root page has no direct handle to. Added a
    `postMessage` bridge, mirroring `syncClothLab()`'s own embedded-vs-
    iframe dispatch exactly: the iframe engine posts to
    `frame.contentWindow`; the embedded engine has no iframe at all, so
    it posts to the root page's own `window` — cloth-lab/src/App.jsx's
    new listener lives in that same `window` either way, so one message
    type pair (`berrystudio:zoom`/`berrystudio:fit`) and one listener
    covers both engines with no per-engine branching on the receiving
    end. On the receiving side, `cloth-lab/src/scene/Scene.jsx`'s
    `<OrbitControls>` now forwards a `controlsRef` up to `App.jsx`,
    which reads/writes it directly (same dolly-by-factor math as
    `View3D.zoom()`; `fit()` restores the exact camera position/target
    the `<Canvas>`/`<Scene>` already start with for the current `dims`).
  - `js/app.js`'s `#zin`/`#zout`/`#zfit` handlers now dispatch on
    `state.view` (`"3d"` → `View3D`, `"clothlab"` → the new postMessage
    helpers, otherwise unchanged `Canvas.zoom()`/`fit()` — including
    during Split View, which `setView()` only ever reaches with
    `state.view` still `"2d"`).
  - Verified: all 188 `cloth-lab` tests + 275 root tests pass, `oxlint`
    clean. Live-verified the 3D Preview and Cloth Lab dispatch paths by
    invoking the actual installed `onclick` handlers directly (this
    session's Browser pane was not visibly composited for true pixel
    clicks/screenshots at the time — confirmed via `document.hidden`) and
    confirmed each one calls the correct target (`View3D.zoom`/`.fit`, or
    the correct `postMessage` payload/origin) with zero errors.

## Cloth Lab follow-up: fixed the ACTUAL crash — a real React render bug

User report right after the previous entry shipped: "when i click two seam
points in seam view it craches." The previous entry's `instancedMesh`
performance fix was real and stays, but it turned out not to be what the
user was hitting — this is the actual crash.

### Fixed
- **`SeamEditorPanel.jsx`'s `pieceLabel()` returned a piece's raw `label`
  field and it was rendered directly as a JSX child** — fine for the
  built-in skirt demo (`pattern/library/skirt.js`, a plain string label),
  but every REAL garment piece imported from the root BerryStudio app
  carries a bilingual `label: {en, ar}` OBJECT — all 8 `rawPieces.push()`
  call sites in `pattern/importFromApp.js` pass `p.label` straight through
  without ever extracting a string, and `pattern/seamAuthoring.js`'s
  `createDraftPiece()` copies it onto `draft.label` unchanged. The instant
  `pendingEdges` gets its first entry — i.e. the moment the SECOND click
  of an edge completes it — the panel tried to render that object directly
  (`{pieceLabel(pe.pieceIdx)}`), and React throws "Objects are not valid
  as a React child" and crashes the whole panel. That's exactly "click two
  seam points → crash": the first click only sets `pendingStart` (routed
  through `t()`'s string interpolation, which just silently stringified it
  to "[object Object]" instead of crashing); the second click is what
  first renders a piece label as a bare JSX child. Missed in the previous
  entry's testing because that testing only ever exercised the string-
  labeled built-in demo, never a real (object-labeled) imported garment.
  Fixed by extracting a proper display string — language-aware
  (`label[lang]`), falling back to `.en` then the piece id — instead of
  handing React the raw object. Added
  `cloth-lab/src/seam/SeamEditorPanel.test.jsx`: renders the panel via
  `react-dom/server`'s `renderToStaticMarkup` with an object-labeled draft
  and a pending edge/pending-start — reproduced the exact crash with the
  fix reverted (verified byte-for-byte against the same "Objects are not
  valid as a React child (found: object with keys {en, ar})" error),
  confirmed clean with the fix restored, plus a case guarding the
  pre-existing plain-string path stays unchanged and one for the Arabic
  `lang` prop.

## Cloth Lab: Seam Authoring flicker/crash fix + pending-point feedback

User-reported bug, not tied to a plan work package: "the seam thing is not
easy to be used or understand for users. and it cause the platform to
fliker always or even crash." Investigated live (real interaction in the
dev server, not just code reading) before changing anything, then fixed
both the usability gap and the underlying performance issue it was
entangled with.

### Fixed
- **`cloth-lab/src/seam/SeamEditorScene.jsx` rendered one individual,
  non-instanced `<mesh>` (its own `sphereGeometry` + `meshBasicMaterial` +
  3 event handlers) PER OUTLINE VERTEX**, to make each point clickable.
  Harmless for the trivial demo pattern (a handful of points), but a real
  imported garment's outlines are bezier-sampled — `js/canvas.js`'s
  `cubicBezierSample()` / `js/pattern-import.js`'s `sampleCubic()` both
  default to n≈6 points per curve span — so a multi-piece garment with a
  few curved edges each routinely reaches a few hundred outline points
  combined. That turned into a few hundred separate WebGL draw calls just
  to show clickable dots, on top of drei's `<Line>` rebuilding its own
  geometry buffer from a brand-new points array every render. That's
  exactly the per-frame cost `AdaptiveDpr.jsx`'s `FrameBudgetController`
  (WP-9.4) watches — heavy enough on modest hardware to push measured
  frame time back and forth across its adaptive-resolution thresholds, so
  the pixel ratio it drives oscillates visibly (the reported "flicker"),
  and in the worst case the draw-call/GC load stalls the tab hard enough
  to read as a crash. Fixed by collapsing each piece's vertices into a
  **single `instancedMesh`** — one draw call per piece regardless of point
  count, with per-instance position/color/scale set imperatively via
  `setMatrixAt`/`setColorAt` (no React reconciliation, no new geometry per
  point) and a single `onClick` resolved through the THREE.js-native
  `event.instanceId`. Verified: all 184 `cloth-lab` tests + 275 root tests
  still pass; live-tested vertex picking, edge creation, and seam
  creation in the browser — same visuals, same click behavior, zero
  console errors.
- **No feedback anywhere in the sidebar for "you just picked a start
  point"** — confirmed live: clicking a vertex to start an edge changed
  only the 3D view (the point turns yellow and grows), with the
  `SeamEditorPanel` showing nothing different until the *second* click
  completed the edge. First-time users had no way to tell, from the
  panel alone, that their first click had registered at all. Fixed by
  adding a highlighted status line to `SeamEditorPanel.jsx` — "Start
  point picked on \<piece\> — click an end point on the SAME piece to
  finish this edge (click the start point again to cancel)." — shown
  the instant `pendingStart` is set, in both `en` and `ar`
  (`cloth-lab/src/i18n.js`'s new `startPointPicked` key).

## WP-49 follow-up: code review found the explicit override didn't fully work

Before merge, ran the same 8-angle multi-agent code review (3 correctness +
3 cleanup + altitude + conventions, each candidate independently
re-verified) against this PR. Two serious, independently-confirmed-by-
three-separate-angles findings, both self-verified by direct code reading
and fixed here — worth calling out plainly: they undermined the PR's own
core claim ("explicit always wins over role," "link firmly to all views").

### Fixed
- **Cloth Lab silently ignored an explicit `bodyZone` override for any
  piece with a declared role** — `convertAppPattern()`'s metadata path
  (`cloth-lab/src/pattern/importFromApp.js`) only ever read `p.bodyZone`
  on the CLASSIFY_LEGACY (no-role) branch; the WP-6 metadata path
  destructured `role/placement/cutOnFold/bilateral/edges/princessSeamId`
  from the resolved role and never looked at `p.bodyZone` at all. Since
  nearly every generator-authored piece already declares a role, this
  made the override a no-op for the vast majority of real pieces — 3D
  Preview honored a correction, Cloth Lab silently kept draping the piece
  by its original role. Fixed with a `ZONE_FLIP` table swapping
  `frontPanel<->hipPanelFront`/`backPanel<->hipPanelBack` when an explicit
  `bodyZone` disagrees with the role's own zone, applied once right after
  resolving the role so every downstream branch (cutOnFold/bilateral/
  plain) sees the corrected placement. Deliberately scoped to panel
  placements only — accessory roles (collar, waistband, ...) have no
  zone-derived placement to flip, so an override on one of those is a
  harmless no-op, matching `js/body-zone.js`'s own accessory-role scoping.
- **`classifyPart()` (3D Preview's material+visibility classifier) checked
  a pure name regex for "sleeve" BEFORE ever consulting the piece's
  explicit/role-derived zone** — directly contradicting its own header
  comment's "FIRST" claim. A piece with an explicit `bodyZone` override
  (or a declared non-sleeve role) whose name happened to contain "sleeve"/
  "كم" — e.g. a renamed/duplicated custom piece — had that override
  silently overridden right back by the name match. Fixed with an
  explicit priority ladder: explicit `bodyZone` wins outright (it can't
  even land in the sleeve bucket, since sleeve isn't one of its two
  values); a declared sleeve ROLE (new `SLEEVE_ROLES` export from
  `js/body-zone.js`) wins next; only with neither signal does the
  original name-only regex chain run, unchanged in its original order.
- **`js/body-zone.js`'s role→zone tables had no automated check against
  `cloth-lab/src/pattern/roles.js`'s own `zone` field** — a real drift
  risk (three review angles flagged this independently): a future role
  added to one table and forgotten in the other would silently reproduce
  the exact "brief simulated as torso" bug class this WP fixes, for
  whatever new role it happened to. Both files are plain, dependency-free
  ESM, so a root `node --test` can import both directly — added
  `test/body-zone-roles-sync.test.js`, asserting every
  `SCHEMA_ROLE_INFO` entry resolves to the same zone in both modules. Not
  a hypothetical fix: while writing it, confirmed the two tables
  currently DO agree — this is regression coverage against future drift,
  not evidence of a live bug today.
- **`cloth-lab/src/pattern/roles.test.js`'s accessory-role test had a
  self-defeating ternary** — `'gusset' in SCHEMA_ROLE_INFO ? 'gusset' :
  'pocket'` always fell back to `'pocket'` (already in the same list,
  since `gusset` was never actually registered — see roles.js's own
  header comment on why), so the test silently exercised 4 distinct
  roles while claiming to cover 5. Replaced with `lining`, a genuinely
  different declared-but-unzoned role.
- Wired up `bodyZoneD`'s help text (defined in `js/i18n.js`, never
  referenced by any `T()` call) into the Layer Props "Body Zone" control
  as a small caption — it existed but was dead/unreachable.

### Verified
- `npm test` (root) — 275/275.
- `cloth-lab`: `npx vitest run` — 184/184.

## WP-49: Explicit per-piece upper/lower-body zone, linked to 3D Preview and Cloth Lab

Closes a real, confirmed bug: neither 3D Preview (`js/three-view.js`) nor
Cloth Lab (`cloth-lab/src/pattern/importFromApp.js`) had any reliable way
to tell whether a piece is upper- or lower-body — both independently
guessed from the piece's English NAME via regex, with an unmatched piece
silently defaulting to "bodice" (upper body). Confirmed against the
Underwear & Bra Library (WP-43): its brief pieces declare
`role: "brief-front"`/`"brief-back"`, generically NAMED "Front Panel"/
"Back Panel" — that role was never registered in Cloth Lab's role table,
so it fell back to the name-only guesser, which defaulted them to
`bodice-front`/`bodice-back`. A brief (underwear bottom) was placed and
simulated as the torso.

### Added
- `cloth-lab/src/pattern/roles.js`: every panel-shaped `SCHEMA_ROLE_INFO`
  entry (front-panel, back-panel, hip-panel-front/back, bodice-*,
  skirt-*-gore, sleeve variants) now carries a `zone: 'upper'|'lower'`.
  New entries for `brief-front`/`brief-back` — placed via
  `hipPanelFront`/`hipPanelBack` (the same body-conforming hip geometry a
  skirt panel gets), `zone: 'lower'` — this alone is the actual bug fix
  for any piece already declaring that role. New `zoneForRole(role)`
  export. Accessory/attach roles (collar, cuff, waistband, pocket, gusset,
  ...) deliberately left unzoned — they're reused across garment types
  with different real zones, so role alone can't say which.
  `cloth-lab/src/pattern/roles.test.js` — 7 tests, including one that
  walks every `SCHEMA_ROLE_INFO` entry asserting its `zone` agrees with
  its `placement` family (catches a role/zone pair drifting out of sync
  by construction, not just for the two roles this WP happened to touch).
- `js/body-zone.js` (new, pure, root app): `inferBodyZone(piece)` — a
  hand-kept-in-sync subset of roles.js's zone table (same "duplicate two
  small files across the two separate projects" convention already used
  for auth-config.js/entitlement.js), plus the genuinely NEW part: a
  `bodyZone` field ('upper'|'lower'|null-meaning-auto) a piece can carry
  that isn't derived from anything — explicit and user-settable, for
  freehand/custom/duplicated pieces with no role at all, or to correct a
  wrong auto-guess by hand. Explicit always wins over role. `js/canvas.js`
  round-trips it through `loadPieces()`, Project save/load, and
  copy/paste, same as every other per-piece field. `test/body-zone.test.js`
  — 8 tests.
- Layers panel → per-piece "…" properties popover (`js/app.js:openLayerProps`):
  a new "Body Zone" Auto/Upper/Lower segmented control, right alongside
  the existing color/material fields — the actual UI that makes "determine
  explicitly" real. Changing it calls `Canvas.setPieceProps(i,{bodyZone})`
  and immediately re-syncs BOTH 3D consumers (`sync3DVisibility()`,
  `syncClothLab(true)`), not just re-rendering the popover — the "link
  firmly to all views" half of the request. `en`/`ar` strings in `js/i18n.js`.
- `cloth-lab/src/pattern/importFromApp.js`: `applyBodyZoneOverride()` —
  on the CLASSIFY_LEGACY path (pieces with no declared/recognized role),
  corrects `classifyLegacy()`'s name-only front/back-vs-bodice/skirt
  guess when the piece's own declared `bodyZone` disagrees. Deliberately
  narrow: never invents a front-vs-back call `classifyLegacy` couldn't
  make from the name at all (still skipped, never guessed — same
  principle as everywhere else in that file), and never turns an
  ignored accessory name into a panel. `js/app.js`'s
  `buildClothLabPayload()` now forwards `bodyZone` per piece.
  `cloth-lab/src/pattern/importFromApp.bodyZone.test.js` — 7 tests.

### Changed
- `js/app.js`: `classifyPart()` (used by both `partsFabric()` for 3D
  material assignment and the new `pieceVisMap()` for 3D visibility) now
  consults `inferBodyZone()` before its own pre-existing name regex —
  single source of truth for "which of 3D Preview's 4 generic garment-part
  mesh groups does this piece belong to," used by both call sites so they
  can never classify the same piece two different ways (they could
  before this WP — two independently-hand-copied regexes).
- `js/three-view.js`'s `applyPieceVisibility()` no longer does ANY text
  classification of its own — it used to independently re-derive
  bodice/sleeve/skirt/trousers from the piece's raw name via its own
  separate copy of the same regex `classifyPart()` had (a second,
  driftable copy, which is exactly how the original bug could exist
  undetected). It now trusts a pre-classified `part` field js/app.js's
  `pieceVisMap()` sends instead.

### Verified
- `npm test` (root) — 261/261 (253 pre-existing + 8 new).
- `cloth-lab`: `npx vitest run` — 172/172 (158 pre-existing + 14 new).
- Live in the browser: loaded the Underwear & Bra Library's "Classic
  Brief" (women), confirmed its pieces are literally named "Front Panel"/
  "Back Panel" with no distinguishing keyword. Hiding both in the Layers
  panel removed the 3D Preview's SKIRT mesh (legs bare, torso/bodice
  fully intact) — the correct result, and the direct visual disproof of
  the bug this WP fixes. Opened the Layer Props popover for an
  accessory piece (Crotch Gusset, an unzoned `gusset`-role piece),
  confirmed the Body Zone control defaults to "Auto," set it to "Lower
  body," closed and reopened the popover, confirmed the choice persisted.
  No new console errors introduced (the CSP inline-script warnings are
  self-inflicted by the automated test tool's own script injection, not
  the app; see "Verified" below for the embedded-engine load failure's
  own resolution).
- **Follow-up, verified separately**: the local dev sandbox's "Cloth Lab
  (embedded engine) failed to load" (`Failed to resolve module specifier
  "react"`) initially looked like it might be a real, unrelated bug worth
  chasing — investigated on request. Reproduced on a clean `main`
  checkout with no changes from this WP at all, so it wasn't caused by
  this work — but then checked against the REAL deployed production site
  (`https://mohammedamy.github.io/BerryStudio/`) in actual Chrome (not
  the local static-file sandbox): the embedded engine loads and renders
  correctly there, no resolution error at all. **Conclusion: the failure
  was specific to this session's sandboxed local test-browser tool's
  import-map handling for dynamically-imported nested modules, not a
  real app bug** — no fix needed, nothing to change. This does mean
  Cloth Lab's actual simulated result for a piece this WP corrects (e.g.
  re-simulating the Classic Brief and confirming it now drapes at the
  hips) is STILL not verified live in this session, since neither this
  WP's nor WP-42's branch is deployed yet to check against production —
  but there's no longer any reason to believe the mechanism itself is
  broken. The placement fix itself is covered by
  `roles.test.js`/`importFromApp.bodyZone.test.js` asserting the exact
  `hipPanelFront`/`hipPanelBack` role Cloth Lab's own, already-tested
  `placeHipPanel()` consumes.

## WP-42 Stage B follow-up: multi-agent code review found and fixed 7 real gate bypasses

Before merging, this PR went through an 8-angle automated code review
(3 correctness + 3 cleanup + altitude + conventions), each candidate
independently re-verified by a second pass. Result: **7 CONFIRMED, 1
PLAUSIBLE** — a genuinely serious set of findings, all fixed before merge.
Documented here in full rather than folded quietly into the original
Stage B entry, since these are real security-relevant gaps a reviewer
should be able to see were caught and closed, not just claimed fixed.

### Fixed
- **`window.BerryStudio` (`js/berry-studio-api.js`) completely bypassed
  entitlement gating** — the most serious finding. `generate()`/`export()`
  called `AIGen.generate`/`Canvas.export*` directly; any signed-out or
  expired-trial user could call `BerryStudio.generate(...)` or
  `BerryStudio.export('pdf')` from devtools and get full AI/Export
  functionality for free, defeating all five gated surfaces through one
  documented, always-loaded API. Fixed with the facade's own fresh
  entitlement check (`checkEntitlement()`, mirroring
  `refreshEntitlement()`'s own isAuthConfigured→getSession→getProfile→
  computeEntitlement chain, since this module has no access to
  `js/app.js`'s private gate state). **Real API contract change**:
  `export()` is now `async` for every format, including the previously-
  synchronous svg/dxf/hpgl/pdf — there is no synchronous way to check
  entitlement — documented in README's Automation API section and covered
  by a new e2e test (`e2e/smoke.spec.js`) asserting both calls reject
  when signed out.
- **Cloth Lab never actually stopped once entitlement was revoked
  mid-session** — `loadClothLab()` only overlaid the gate card when
  `gateAllowed()` failed; it never reset `clothLabReady`/`frame.src` or
  unmounted the embedded engine, and `syncClothLab()` had no gate check
  of its own — so a user who signed out (or whose trial expired) while
  Cloth Lab was open kept a live, updating GPU simulation running behind
  the overlay indefinitely, contradicting the PR's own "GPU work never
  starts while gated" claim. Fixed with a new `teardownClothLab()`
  (resets `clothLabReady`, unmounts the embedded engine, clears the
  iframe) called from `loadClothLab()`'s gated branch, plus a
  `gateAllowed()` guard added directly to `syncClothLab()` as a second
  layer.
- **No backfill for accounts that signed up during Stage A** — the
  `on_auth_user_created` trigger only fires on new `auth.users` inserts;
  real accounts already existed (Stage A shipped first) with no
  `profiles` row, which `computeEntitlement(null)` reads as `expired`
  with 0 trial days — a real, permanent lockout for every pre-existing
  user, granting them none of the 30-day trial every other account gets.
  Fixed with an idempotent backfill `insert ... on conflict do nothing`
  in the migration, called out explicitly in `server/supabase/README.md`.
- **`Auth.getProfile()` swallowed real fetch/RLS errors into the same
  `null` "no row" returns** — `currentEntitlement`'s own header comment
  promises a transient network hiccup won't lock out an actual
  subscriber, via a try/catch in `refreshEntitlement()` built specifically
  for that. But `getProfile()` never threw on a real error, so that catch
  was dead code for the exact scenario it exists to handle — a genuine
  active subscriber hitting any transient Supabase blip got instantly
  (mis)computed as `expired`. Fixed: `getProfile()` now throws on a real
  fetch error, only returning `null` for a genuine 0-row result. While
  touching this, also fixed a real redundant-network-round-trip
  (efficiency finding): `getProfile()` now accepts an optional `userId`
  to skip its own `client.auth.getUser()` call when the caller (both
  `refreshEntitlement()` and the automation API's `checkEntitlement()`)
  already has the session's user id.
- **AI Fashion Billboard's "Generate Pattern Pieces From This"/"Read
  Pattern Pieces From This Tech-Pack" bypassed the AI gate** —
  `runPatternPieces()`/`runTechPackPieces()` call the exact same
  `generatePatternFrom()` pipeline `runAI()` uses, but had no
  `requireEntitlement()` of their own. Fixed by gating both. `runBillboard()`
  itself (the billboard image render) is deliberately left ungated — the
  plan's AI gate is scoped to "pattern generation, image generation —
  js/ai.js's AIGen" specifically; turning a billboard image into real
  pattern pieces is what actually crosses into that territory.
- **Print (Project menu / ⌘K) bypassed the Export gate** — `printPattern()`
  builds and opens the full pattern SVG (directly save-as-PDF-able via the
  browser's print dialog), same underlying data the gated SVG/PDF export
  buttons block, with no gate of its own. Fixed.
- **Category tabs (header Women/Men/Girls/Boys) bypassed the Library
  gate** — `setCategory()` unconditionally called `loadPattern()` (the
  same function `loadLibraryPattern()` gates) to swap in a different one
  of the 264 catalog patterns on every tab click. Fixed narrowly:
  switching category itself stays free (basic navigation, unchanged), but
  auto-loading a brand-new catalog pattern for the new category now
  requires the same entitlement the Library pane does — a gated user
  keeps whatever pattern they already had.
- **`renderClothLabGate()` duplicated `renderGateUpsell()`'s logic** by
  hand instead of calling it, and had silently drifted — missing the
  `accountNotConfigured` diagnostic the other four gated panes show when
  `auth-config.js` is empty. Fixed by having it delegate to
  `renderGateUpsell()` directly, closing both the duplication (a reuse/
  simplification finding, flagged independently by two review angles)
  and the missing message in one change.

### Verified
- `npm test` — 265/265 (unchanged from Stage A's landing count).
- Playwright e2e (`npm run test:e2e`): the two tests touching gated
  behavior — the automation API's export/generate, and the embedded
  Cloth Lab engine — both rewritten to assert the correct GATED behavior
  (rejecting/staying unmounted when signed out) and pass reliably on
  repeat runs. Three unrelated tests flaked once each across repeated
  full-suite runs (a different random test each time — "select-anything"/
  notch selection, cloud-sync's settings-modal timing, keyboard
  selection, Add Point) and passed cleanly every time re-run in
  isolation — confirmed as the exact pre-existing CI-resource-contention
  flakiness `playwright.config.js`'s own comment already documents
  ("settings-modal timing, Cloth Lab embed load, notch selection"), not
  a regression from these fixes.

## WP-42 Stage B: Trial/subscription gating for AI, Library, Quick Draft, Export, Cloth Lab

Per `BerryStudio-Upgrade-Plan-v3-2.md` §6/§7: turns Stage A's sign-in-only
account system into real gating for the five surfaces the plan names, with
no real payment flow yet (Stage C, PayPal, stays deliberately deferred).
Everything not in that five-item list stays free with no account, matching
the plan's explicit acceptance criteria — including the "or with no
account" clause, i.e. an anonymous (never-signed-in) user sees the same
gate as an expired trial, not free access, since no trial has started yet.

### Added
- `js/entitlement.js` — pure `computeEntitlement(profile, now)` /
  `isAllowed()`: derives `trial | active | expired` from a `profiles` row's
  `subscriptionStatus` (`'trial'|'active'`, never `'expired'` — see its own
  header comment for why) and `trialStartedAt`, with `active` always
  winning regardless of trial age. Written and unit-tested first, in
  isolation, before any `js/app.js` call site — same "CPU reference before
  it touches the app" discipline WP-35/WP-35b used for their own math.
  `test/entitlement.test.js` — 12 cases: no-profile, active-wins, exact
  30-day boundary (`>=`, not `>`), 1ms-before-boundary, malformed/
  unparseable `trialStartedAt`, ISO-string vs. epoch-ms input, future
  `trialStartedAt` (clock skew), `isAllowed`'s null/undefined fold.
- `server/supabase/migrations/0001_profiles_entitlement.sql` +
  `server/supabase/README.md` — the `profiles` table (one row per account,
  auto-created at sign-up via an `auth.users` insert trigger so
  `trial_started_at` is a real server timestamp, not client-suppliable),
  Row Level Security (`select`-only for the signed-in user's own row — no
  insert/update/delete policy for anyone but the SQL Editor's service-role
  context, which is what makes "only an admin can grant a subscription" a
  server-enforced rule, not a client-side convention), and the admin-flip
  SQL stopgap standing in for Stage C's PayPal webhook.
- `js/auth.js`: `Auth.getProfile()` — reads the current user's `profiles`
  row; returns `null` (not a throw) for signed-out, not-configured, or a
  fetch/RLS error, so a misconfigured deployment (e.g. the migration
  hasn't been run) degrades to "can't prove entitlement" rather than
  crashing the account UI.
- `js/app.js`: `currentEntitlement` (refreshed on every `Auth.onChange`,
  keeping its previous value on a fetch error rather than snapping to
  gated — a network hiccup shouldn't lock out a real subscriber
  mid-session), `gateAllowed()`/`requireEntitlement()`/`renderGateUpsell()`
  as the shared gate primitives. Library/AI/Quick Draft rail panes gate
  their entire pane (each is wholly one of the five named surfaces);
  Export gates only its four specific actions (`exportAs()` for every
  format except `"JSON"` — Project menu's "Save Project" is local
  persistence, not "Export"; `techPack()`; `exportSummary()`;
  `exportBom()`) since the plan explicitly keeps Fit Chart, Sewing
  Instructions, and (by the same "2D drafting" logic) Check Pattern, Walk
  the Seam, and marker/nesting free, all four of which live in the same
  Export pane. `loadLibraryPattern()` wraps the two call sites that mean
  "picked from the Library surface" (its own cards, the command palette's
  library entries) — every other `loadPattern()` call (default pattern on
  boot, the AI-SVG-import handoff) stays direct and ungated, since those
  aren't the gated "browse the catalog" feature. Cloth Lab: `loadClothLab()`
  gates both engines through their one shared call site — while gated,
  neither the iframe `src` is ever set nor the embedded engine's dynamic
  import ever runs, so the GPU work genuinely never starts, not just
  hidden behind an overlay. Account modal (`openAccount()`) shows
  active/trial-days-remaining/expired status and an Upgrade CTA when
  expired. `openUpgradePrompt()` — an honest "billing isn't wired up yet,
  contact the site owner" placeholder, not a fake button that silently
  does nothing.
- `cloth-lab/src/auth-config.js`, `cloth-lab/src/entitlement.js`,
  `cloth-lab/src/entitlement.test.js` — hand-kept-in-sync duplicates of
  the root app's own config/math (a genuinely separate Vite project, same
  "duplicate two small files rather than couple two build systems"
  reasoning `js/auth.js`'s header comment already uses for its esm.sh URL).
  `cloth-lab/src/EntitlementGate.jsx` wraps `main.jsx`'s standalone entry
  only (not `embed.js` — the embedded engine has no direct URL of its own,
  so `js/app.js`'s own gate already covers it; a second Supabase round
  trip there would be pure latency for no coverage gain) — a real,
  independent Supabase session+profile check so the `/cloth-lab/` subpath
  can't be used to bypass the root app's gate by direct URL/bookmark, per
  the plan's own "ideally the standalone subpath itself refuses to render
  un-entitled too."
- `en`/`ar` strings for all of the above in `js/i18n.js`.

### Fixed
- **A real bug, caught live during this WP's own follow-up browser pass,
  not merely theorized**: `cloth-lab/src/main.jsx` originally wrapped
  `<App/>` with a static `import App from './App.jsx'` at the top of the
  file, gating only the RENDER/mount step (`<EntitlementGate><App/>
  </EntitlementGate>`). Network-request inspection during verification
  showed App.jsx's entire module graph — three.js, `@react-three/fiber`,
  every cloth/body/GPU module, the bulk of a 1.4MB bundle — loading (and,
  in a production build, executing its top-level code) regardless of the
  gate, because ES module top-level evaluation runs at import time, not
  render time. Fixed by moving the `import('./App.jsx')` itself inside
  `EntitlementGate.jsx`, called only after `checkEntitlement()` resolves
  allowed — confirmed via a real before/after network-request diff (the
  gated page load no longer fetches `App.jsx` or any of its dependencies
  at all) and via the production build's own output: one small entry
  chunk (~195KB) plus a separate `App-*.js` chunk (~1.24MB) that only
  loads once entitled, replacing the previous single 1.43MB bundle. This
  is what actually makes "the GPU work never starts while gated" true for
  the standalone subpath too, matching the guarantee `js/app.js`'s
  `loadClothLab()` already gives the root app's two entry points.
- **A second real bug, also caught live**: toggling language while gated
  (on the Cloth Lab tab, or after switching tabs away and back) left the
  Cloth Lab gate card showing its OLD language until the next unrelated
  tab round-trip — `applyLang()`'s existing Cloth Lab re-sync
  (`syncClothLab(true)`) is guarded on `clothLabReady`, which is never
  true while gated (the iframe/embed never loads), so that branch silently
  never ran for a gated user. Fixed by having `applyLang()` also call
  `renderClothLabGate()` directly whenever `!gateAllowed()` — confirmed
  live in both directions (ar→en and en→ar while already on the gated
  Cloth Lab tab, gate card text updates immediately, no stale text).

### Changed
- `js/i18n.js`'s `accountStageANotice` → `accountNotice`, reworded: the old
  copy ("everything stays free with no account") is no longer true as of
  this WP. `tt_account`'s tooltip updated the same way.

### Explicitly not in this WP (see plan v3.2 §6 for the staged reasoning)
- Stage C: real PayPal billing. Granting a subscription today is the
  manual SQL Editor stopgap in `server/supabase/README.md`.
- Automatic trial expiry enforcement in the database — nothing ever
  writes `'expired'` to `subscription_status`; it's derived at read time,
  client-side, from `trial_started_at` (see `js/entitlement.js`'s header
  comment for why that's a deliberate choice, not a gap).
- A live signed-in trial/active/expired visual check — see "Verified"
  below.

### Verified
- `npm test` (root) — 265/265 passing (253 pre-existing + 12 new
  `entitlement.test.js` cases).
- `cloth-lab`: `npx vitest run` — 165/165 passing (158 pre-existing + 7
  new `entitlement.test.js` cases); `vite build` (standalone) and
  `vite build --config vite.lib.config.js` (embedded) both succeed
  unchanged.
- Browser-verified, signed-out state, end to end, across every gated entry
  point named in this WP — not just the pane UI:
  - Library/AI/Quick Draft panes each replaced by the sign-in upsell
    (confirmed via rendered `innerHTML`); the command palette's own
    library entries (`⌘K`, search "dress") confirmed to open the sign-in
    modal too, not silently load a pattern, proving `loadLibraryPattern()`
    covers that second entry point and not just the pane's own cards.
  - Export pane: **Export**, **Generate Tech Pack**, and **Bill of
    Materials** each confirmed, by actually clicking them, to open the
    Account modal instead of doing anything — while **Fit Chart** and
    **Check Pattern** confirmed to open their own real modals, **Sewing
    Instructions** confirmed to call `window.open()` (intercepted and
    counted, not just assumed), and **Walk the Seam**/**Create Marker**
    confirmed NOT to trigger the Account modal — i.e. the pane's per-
    button gating is real, not just the informational note.
  - Cloth Lab: the tab's gate card confirmed with `#clothLabFrame`'s `src`
    still empty (the GPU work never started) and `#viewClothLab`'s
    embedded container untouched; the gate's "Sign in" button confirmed
    to open the real Account modal with the updated notice text; the
    **standalone `/cloth-lab/` subpath**, loaded directly (not through the
    root app), independently confirmed to show its own gate with zero
    console errors — and, after the module-graph fix above, confirmed via
    network-request inspection to never fetch `App.jsx` or any of its
    dependencies while gated.
  - Arabic/RTL: every gated surface above re-checked with the app in `ar`/
    RTL mode — all new strings render correctly (no missing keys, no
    layout breakage); the language-toggle bug above was caught specifically
    because of this pass.
- **Not verified live, honestly**: the actual signed-in trial/active/
  expired UI states (the Account modal's status line, a gated pane
  un-gating, Cloth Lab actually loading) against a real Supabase account.
  Doing that from this session would mean creating a real account and
  authenticating with a password, which is out of scope for an automated
  session to do on its own — this is a real, acknowledged gap in this
  WP's verification, covered instead by `computeEntitlement()`'s unit
  tests and a close reading of the call sites, not a live round trip. A
  manual pass with a real test account (sign up, confirm the trial-days
  countdown, run the admin-flip SQL, confirm `active` unlocks everything,
  let a trial's `trialStartedAt` be set to 31+ days in the past via SQL
  and confirm `expired` re-gates) is worth doing before relying on this
  in production.

## WP-35b: GPU spatial-hash self-collision broadphase (Cloth Lab, "High" tier)

Per `BerryStudio-Upgrade-Plan-v3-2.md` §5's own recommendation: write and
verify the algorithm as a CPU reference first (same discipline WP-35's
dihedral bend used for `dihedralBend.js`), then port it mechanically to
GLSL. Replaces the brute-force O(N²) self-collision scan with a real
spatial hash — but only on the opt-in "High (dihedral bend)" quality tier;
the default tier's compiled shader is untouched.

### Added
- `cloth-lab/src/cloth/spatialHash.js` — CPU reference: a fixed, margined
  grid built from the garment's rest pose; a bitonic sort written as the
  exact GATHER-based compare-exchange network the GPU port uses (not
  `Array.sort`); a binary-search cell-range query; and a full broadphase
  reference matching the GLSL self-collision function's own averaging
  semantics.
- `cloth-lab/src/cloth/spatialHash.test.js` — 21 property-based tests:
  cell-coordinate round-trips and clamping, sort correctness/stability
  across random and adversarial arrays (duplicates, non-power-of-two
  lengths, all-same, already/reverse-sorted), cell-range query exactness,
  and — the property that actually matters — the spatial-hash broadphase
  matching a brute-force reference exactly across many random particle
  clouds, including a dense-cluster scan-cap stress test and a
  cell-boundary-straddling case.
- `cloth-lab/src/cloth/bitonicSortGPU.js` — `GPUBitonicSort`: a manual
  multi-pass ping-pong GPGPU driver (`THREE.WebGLRenderTarget` pairs +
  `three/addons/postprocessing/Pass.js`'s `FullScreenQuad`, not
  `GPUComputationRenderer` — the sort needs ~78-105 sequential passes per
  frame with a different `uK`/`uJ` uniform each time, which
  `GPUComputationRenderer`'s one-shader-per-named-variable API can't
  express). A cell-id seed pass followed by the full bitonic pass
  sequence (`bitonicPassSequence`, unit-tested against the closed-form
  pass count and a hand-worked P=8 case).
- `ClothSimulation.js`: `selfCollisionSpatialHashGlsl` — the GLSL
  self-collision function for the high-quality tier, spliced in under the
  exact same function name (`selfCollisionCorrection`) the brute-force
  version uses, so `main()`'s call site never changes. Buckets "me" into a
  grid cell, binary-searches each of the 27 surrounding cells' index
  ranges in the sorted buffer, and scans forward within each (capped —
  same `DEFAULT_SCAN_CAP` the CPU reference validated).

### Fixed
- **A real, separate bug surfaced while landing this, not caused by it
  alone but not shippable without fixing**: the existing dihedral-bend
  hinge data already used 6 texture samplers; adding one more for the sort
  buffer pushed the High tier's compiled shader to 19 active fragment
  texture units — over `MAX_TEXTURE_IMAGE_UNITS`'s WebGL2 spec-floor
  minimum of 16 (confirmed live: `THREE.WebGLProgram: Shader Error —
  FRAGMENT shader texture image units count exceeds
  MAX_TEXTURE_IMAGE_UNITS(16)`, on a GPU backend actually capped there).
  This means the pre-existing (WP-35) High tier was already one sampler
  away from failing outright on any GPU capped at the spec floor — a real
  class of hardware (older/low-end mobile, some virtualized/software
  renderers), not just this session's own test environment. Fixed by
  halving the hinge-texture footprint: `packHingeTextures` now packs each
  of the three hinge arrays (edge v0, edge v1, rest angle) into ONE
  double-wide texture (the previous two 4-slot-batch textures side by side
  in one, addressed via a left/right-half UV offset) instead of two
  separate textures — identical data, identical values read, 3 samplers
  instead of 6. Brings the High tier to exactly 16, with the default
  tier's shader completely unaffected either way.

### Changed
- `spatialHash.js`'s `buildGrid` margin default (`cellSize*4`, sized for
  that module's own small unit-test point clouds) is NOT what
  `ClothSimulation.js` actually uses — the constructor passes an explicit
  35cm margin, generous for real garment drape/settle motion, at
  effectively zero cost (margin only changes the numeric cell-id range,
  never the sort/query's actual cost, which depends on particle count
  alone).

### Verified
- All 158 `cloth-lab` vitest tests green (134 pre-existing + 24 new), all
  253 root `node --test` tests green (unaffected).
- Live in the browser (not just unit-tested): a readback of the sorted
  GPU buffer confirmed correct (monotonically sorted, exact particle
  count, zero duplicate/dropped indices) across multiple frames; a
  readback of live particle positions confirmed no NaN and values staying
  well inside the grid's margined bounds during settle; the garment
  renders and settles identically in shape to the pre-existing brute-force
  self-collision (same wrinkled/folded look under the dihedral bend
  constraint), stable over multiple seconds with zero WebGL errors in a
  clean browser context. Step-cost (`?hud=1`'s Solver HUD) came back
  comparable between tiers (~0.1-0.4ms either way) on the test GPU — not a
  dramatic win in this specific measurement, reported honestly rather than
  claiming one; the acceptance criterion (an actual reduction in
  particles visited per query, not just cheaper per-visit math) holds by
  construction (27-cell binary search vs. a full O(N) scan), independent
  of this one environment's measured wall-clock noise.

## WP-42 Stage A: Optional account sign-in (Supabase Auth) — no gating yet

Real sign-in only, per `BerryStudio-Upgrade-Plan-v3-2.md` §6/§7's staged
approach — Stage A is deliberately just "a working sign-in button," not
feature gating. Every existing feature keeps working with no account,
unchanged by this WP.

### Added
- `js/auth.js` — thin wrapper around Supabase Auth's JS SDK, loaded on
  demand via a dynamic `import()` of a direct esm.sh URL (not the bare
  `@supabase/supabase-js` specifier the import map also defines — see
  "Fixed" below for why). Email/password sign-up, sign-in, password
  reset, Google OAuth, Facebook OAuth, sign-out, and an `onChange`
  subscription mirroring Supabase's own auth-state events.
- `js/auth-config.js` — the Supabase project's public `SUPABASE_URL`/
  `SUPABASE_ANON_KEY` (not secrets — Supabase's security model is Row
  Level Security, not hiding these, the same trust model as a Firebase
  web config). Empty by default; `Auth.configured`/`isAuthConfigured()`
  gate every code path so an unconfigured deployment shows a plain "not
  set up yet" state instead of throwing.
- Account icon button in the header (`index.html`, next to Settings) and
  its modal (`js/app.js`'s `openAccount()`, following the existing
  `openModal()`-then-populate-the-body pattern): signed-out shows email/
  password fields + "Continue with Google"/"Continue with Facebook" +
  forgot-password; signed-in shows the account email and a sign-out
  button. The icon itself shows the signed-in user's initial in place of
  the person glyph.
- `en`/`ar` strings for all of the above in `js/i18n.js`.

### Fixed
- **A real bug, caught during browser verification, not merely
  theorized**: `js/auth.js`'s dynamic `import('@supabase/supabase-js')`
  (a bare specifier meant to resolve through `index.html`'s import map,
  the same mechanism `three-view.js` already uses successfully) reliably
  failed with "Failed to resolve module specifier" — reproducible even
  after adding `auth.js` its own top-level `<script type=module>` tag
  (matching every other `js/*.js` file), after a 4-second delay, and from
  a real, engine-level trusted click (ruling out missing user-gesture as
  the cause). Substituting the exact same specifier the ALWAYS-working
  `three-view.js` uses ('three') into `auth.js`'s own call site
  reproduced the identical failure — proving the bug follows the calling
  module, not the specifier string. Fixed by importing a direct esm.sh
  URL instead of the bare specifier (kept in sync by hand with the import
  map's entry, which is left in place for tooling/readability only) —
  proven 100% reliable in every test, and valid in any real browser
  without needing an import map at all. Root cause not fully isolated
  beyond that; worth another look if a future WP needs the bare-specifier
  form to work from a new module.
- `getClient()` cached a failed SDK load forever (`_clientPromise` was
  never cleared on rejection) — the very first sign-in attempt after any
  transient failure would silently fail again, permanently, for the rest
  of the tab's lifetime. Fixed to clear and retry on the next call.

### Explicitly not in this WP (see plan v3.2 §6 for the staged reasoning)
- No feature gating — AI, Library, Auto Pattern, Export, and Cloth Lab
  (the five surfaces named for Stage B) all stay fully free and usable
  with no account, exactly as before.
- No PayPal/billing (Stage C).

### Verified
- `npm test` — 253/253 passing, unaffected.
- Browser-verified against a real Supabase project (email/password +
  Google + Facebook providers configured): an invalid-credentials
  sign-in attempt returns a genuine `AuthApiError` (`status: 400,
  code: invalid_credentials`) from Supabase's own API, not a client-side
  failure — proving the SDK loads, the client initializes, and the
  request round-trips for real. "Continue with Google" and "Continue
  with Facebook" both redirect cleanly to their real consent screens
  (`accounts.google.com`, `facebook.com`) with correct `client_id`/
  `redirect_uri` params and no config errors. Also re-verified the
  unconfigured (`auth-config.js` empty) state still shows the plain "not
  set up yet" message with zero console errors, unchanged from before
  these fixes.

## WP-47: Rewrite the in-app Help modal and the docs site's tool/shortcut reference

A correctness pass over both of BerryStudio's "how do I use this" surfaces —
the in-app **Help & Shortcuts** modal (the **?** button / ⌘K) and the
standalone `docs/` site — both of which had drifted well behind the app
after WP-43 through WP-46: several real toolbar tools were entirely
undocumented, one tool's description described a *different* tool, keyboard
shortcut text no longer matched what Shift actually does, and the docs
site's own pattern-library counts were stale by more than 2×.

### Fixed — in-app Help modal (`js/app.js`, `js/i18n.js`)
- `openHelp()`'s tool table was a hand-maintained list of 15 ids that had
  fallen 9 tools behind the real toolbar (`TOOLS`, the same array
  `buildToolRail()` renders from) — missing Lasso, Filled Shape, Point,
  Construction Line, Construction Arc, Circle, Create Pattern Piece, Add
  Point, and Curve Edge entirely. Now derived directly from `TOOLS` itself
  (`TOOLS.filter(t=>t!=="sep").map(t=>t.id)`), so it can't drift out of
  sync again — every real toolbar tool appears, and only real toolbar
  tools appear.
- `sc_freeDrag`'s shortcut description still claimed Shift+Drag
  universally bypasses the grid snap — true for most tools, but WP-45
  changed what Shift means for the Line and Construction Line tools
  specifically (angle-constrain, not grid-bypass). Reworded with an
  explicit carve-out, plus a new `sc_angleSnap` row describing the actual
  behavior for those two tools.
- `sc_delete` didn't mention a single outline vertex (WP-44) as a
  deletable selection — added, plus how to select just one point.
- Added `sc_copyPaste` — Ctrl/⌘+C/X/V for whatever's selected on the
  canvas had no shortcut-table entry at all despite being real, shipped
  functionality.
- `helpQ3` (Quick start step 3) now mentions Check Pattern and the Sewing
  Guide, not just 3D Preview and export.
- All of the above in both English and Arabic.

### Fixed — docs site (`docs/index.html`, `docs/tools.html`, `docs/shortcuts.html`, `docs/faq.html`)
- **Pattern counts**: "124 pre-designed patterns" / "24-design Fancy
  Collection" (both stale) corrected to the real current figures — 308
  patterns (57 Women / 47 Men / 157 Girls / 47 Boys, including a
  100-pattern Gymnastics Leotards collection and a 44-pattern Underwear &
  Bra collection) and a 64-design Fancy Collection — in `index.html` and
  `faq.html`.
- **`tools.html`**: added Lasso, Add Point, and Curve Edge to the tool
  table (previously absent); fixed the **Line** row, which described
  *Construction Line's* behavior (a live-linked line between two points)
  under the wrong tool — Line is actually the freehand sketch-line tool,
  now correctly distinguished from Construction Line with a cross-link
  between the two, and both now mention WP-45's Shift-angle-constrain.
  Added a new "Editing an outline point-by-point" section documenting
  WP-44 (select-and-delete a single outline vertex, easier corner
  grabbing) and WP-46 (the Edit Outline Points & Edges panel — numeric
  coordinates, named/matched points, closing edges) in full, none of
  which had any documentation before this pass. Added Sewing
  Instructions, Fit Chart, and Bill of Materials to the Export &
  validation table — three real, already-shipped export features that
  weren't listed at all.
- **`shortcuts.html`**: brought back into sync with the in-app table above
  (it explicitly claims to mirror it) — same Shift+Drag carve-out,
  angle-snap row, copy/paste row, and outline-vertex mention in Delete.
- All of the above in both English and Arabic.

### Unchanged
`docs/3d-troubleshooting.html` and the rest of `docs/faq.html` were
reviewed and found still accurate — no 3D-system or general-FAQ content
was affected by WP-43 through WP-46.

## WP-46: Closing edges, named/matched outline points, and numeric corner coordinates

A user asked for three related pattern-outline abilities: mark any edge as
a "closing edge" (left open, unsewn, for the garment's zip/button
placket/hook-and-eye), give any outline point a name so that two points
sharing a name — anywhere in the pattern — are recognized as a match to be
seamed together, and set any point's exact X/Y coordinates numerically.
All three are per-piece annotations on the outline itself, editable from
one new modal, and all three feed the Sewing Guide with real, generated
instructions plus a plain-language legend explaining the convention.

### Added
- `js/canvas.js`: `p.closingEdges` (array of edge indices) and
  `p.pointNames` ({idx: name}) — new optional per-piece fields alongside
  the existing `outline`. `toggleClosingEdge(pieceIdx, edgeIdx)` /
  `isClosingEdge(piece, edgeIdx)`, `setOutlinePointName(pieceIdx, idx, name)`
  / `getOutlinePointName(pieceIdx, idx)`, `setOutlinePointXY(pieceIdx, idx, x, y)`,
  and `getMatchedPointGroups()` (all named points across every piece,
  grouped by name, 2+ members only — the exact grouping the Sewing Guide
  reports). `spliceOutline()` now shifts `closingEdges`/`pointNames` past
  an insert/delete exactly like it already did for `edges[]`/`curves[]`/
  `chestEdgeIndices`; splitting a closing edge with Add Point keeps both
  halves marked closing, and deleting a vertex drops the (now-ambiguous)
  flags on its two touching edges along with that vertex's own name rather
  than guessing.
- `drawPiece()`: a closing edge redraws on top of the cutting line as a
  thicker amber dashed segment; a named point gets a small accent-colored
  text tag beside it — both visible directly on the 2D canvas, not just in
  a side panel.
- `js/app.js`: **Edit Outline Points & Edges** modal (Layer Props ▸ new
  button, same shape as the existing Dart editor) — every outline point's
  X/Y and name in one editable row each (with delete, respecting the same
  3-point floor as `removeOutlinePoint`), and every edge's closing-edge
  checkbox with its live length in cm.
- `buildSewingSteps()`: a `"Match point “{name}” ({pieceA} ↔ {pieceB})…"`
  step per matched-point group and a `"…leave the edge(s) marked with an
  amber dashed line UNSEWN…"` step per piece with closing edges — both
  read straight off the live pieces, not a garment role. The printed/
  exported Sewing Guide also gains a legend note (shown only when the
  pattern actually uses one of the two features) spelling out exactly what
  the amber dashed line and the point-name tags mean.
- `loadPieces()` (Import Project / cloud-sync load) now spreads the
  source piece's own fields before applying its normalized defaults,
  so `closingEdges`/`pointNames` — and, as a side effect, other
  already-existing fields (`role`, `cutOnFold`, `edges`, `curves`,
  `bilateral`, …) that were silently dropped on that specific round-trip
  before — now survive Export → Import intact.
- 20 new unit tests in `test/canvas.test.js`: toggle/undo/bounds-checking
  for closing edges, insert/remove index-bookkeeping for both new fields
  (mirroring the existing `edges[]`/`curves[]`/`chestEdgeIndices` tests),
  name set/clear, matched-group grouping, and coordinate set/reject/undo.

## WP-45: Shift-constrain the Line/Construction Line tools to 0/45/90/…°

### Added
- `js/canvas.js`: `snapAngle45(x0, y0, x1, y1)` — given a line's start point
  and its raw (unconstrained) end point, returns the point at the SAME
  distance from the start but at whichever 45°-multiple angle
  (0/45/90/135/180/225/270/315°) is closest to the raw angle — covers
  perfectly vertical, horizontal, and diagonal lines with one rule. Wired
  into the Line and Construction Line tools' pointermove handlers: holding
  Shift while dragging now constrains the angle, matching the same
  convention virtually every other design tool uses for a shift-held line
  drag. For these two tools specifically this *changes* what Shift does —
  previously it bypassed the 1cm grid snap (letting a point land at any
  fractional coordinate); every other drawing tool (Arc, Pen, Polygon,
  Construction Arc, Construction Circle, the Point tool) keeps that old
  meaning unchanged. The global Snap toolbar toggle is still there for
  turning off grid-snap generally, independent of this.
- Exported `snapAngle45` from `Canvas`'s public API (same precedent as the
  existing `screenOf` export — "handy for hit-tests/tests," per that
  function's own comment) and added 6 real unit tests in
  `test/canvas.test.js` against the exact shipped function (not a
  reimplementation): near-horizontal, near-vertical, ~39°→exact 45°, an
  already-exact angle left unchanged, a zero-length no-op, and all four
  quadrants.

### Verified
Driving a real Shift-held drag through this project's browser-automation
tooling turned out to be a genuine dead end two different ways — modifier
keys don't propagate through a simulated drag's intermediate pointermove
events, and a from-scratch synthetic `PointerEvent` fails at
`setPointerCapture()` (browsers require a real OS pointer session, which a
synthetic event doesn't have) before the handler even reaches this code.
Worked around by patching `offsetX`/`offsetY` to compute correctly for
synthetic events and stubbing `setPointerCapture()` as a no-op — both
test-only, neither ships — then firing a real
pointerdown/pointermove(shiftKey:true)/pointerup sequence through the
actual, unmodified event listeners in `js/canvas.js`. Confirmed: a
horizontal-ish drag commits at exactly the same endpoint the isolated
`snapAngle45` unit test predicts; vertical and 45° cases also land exact;
the Construction Line tool constrains the same way; and — the regression
check that matters most — an identical drag *without* Shift still grid-
snaps exactly as before, unchanged.

## WP-44: Select-and-delete a single outline point; corner points reliably grabbable

A user reported two related 2D-canvas editing gaps: no way to select one
point on a piece's edge and delete just that point, and corner points in
particular being hard to grab and move.

### Added
- `js/canvas.js`: `removeOutlinePoint(pieceIdx, idx)` — the missing
  counterpart to the existing `insertOutlinePoint()` (Add Point tool).
  Reuses that same function's `spliceOutline()` index-bookkeeping (curves/
  edges/chestEdgeIndices all shift to keep pointing at the same physical
  vertices), and refuses to drop a piece below 3 points — `js/validate.js`'s
  own `closedOutline` floor, so this can never leave a piece in a state
  Check Pattern would already flag as broken.
- `selVertex` — a new persistent selection slot (mirrors the existing
  `selNotch` exactly: click-to-select via a piece's own outline-point
  handle, Backspace/Delete-able via `deleteSelection()`, cleared at every
  point the other selection types already reset themselves). Clicking a
  vertex handle now selects that specific point — visibly, drawn larger and
  in the "ok" colour — not just an implicit drag target that forgets itself
  the moment the mouse comes up.

### Fixed — corner outline points were effectively unreachable
`handleHit()` checked the piece's 4 resize (scale) corner handles *before*
its outline-vertex anchors, with the two often landing at nearly identical
screen positions — most real pattern pieces are themselves roughly
rectangular, so an actual corner VERTEX usually sits right where the
resize handle also lives. The resize handle always won, so that corner
vertex could never be grabbed on its own to reshape or delete — exactly
the "hard to select a corner point" report. Fixed two ways together:
1. `handleGeo()` now draws/hits the 4 scale-corner handles a fixed 7px
   *outside* the piece's own bounding-rect corner (along each corner's own
   outward diagonal from the rect center) rather than exactly on top of
   it — the same small-margin-outside-the-shape look real design tools
   use for transform handles, not just a hit-test hack.
2. `handleHit()` now picks whichever of a corner handle or a vertex anchor
   the click is actually *closer* to, when both are within tolerance,
   instead of the corner unconditionally winning a first-match order.

### Verified
Live in-browser, via real drag/click/keyboard interaction (not just code
review): a corner vertex can now be grabbed and dragged independently
(only that one point's coordinates change, the other 3 stay exactly put);
the same vertex stays selected after release and Delete/Backspace removes
just it, leaving the piece otherwise intact; attempting to delete a 4th
point off an already-3-point triangle is correctly refused with no change;
the resize/scale handle at its new offset position still performs a real
proportional scale from the piece's center, unaffected. 5 new unit tests
in `test/canvas.test.js` cover `removeOutlinePoint`'s index-bookkeeping
(mirroring the existing `insertOutlinePoint` test), the index-0 boundary
case, the 3-point floor, undo, and the non-existent-piece no-op. Full
suite: 205 tests green.

## WP-43: Underwear & Bra Library — 44 new patterns

44 new patterns: 24 briefs/trunks (6 each — Women, Men, Girls, Boys) + 20
bras (10 each — Women, Girls), taking the library from 264 to 308
patterns. Requested with "precise, nice curves and instructions according
to world-class model."

### Added
- `js/underwear-library.js` — two shared parametric builders
  (`briefPieces()`, `braPieces()`, plus `sportBraPieces()` for the
  structurally distinct Sport Bra/Sport Bralette) driving all 44 catalog
  entries via real style parameters (rise, leg cut, coverage, leg-length
  extension for trunks; cup depth, band width, strap style, triangle/
  plunge/wide shape modifiers for bras), not 44 hand-copied piece lists.
  Every curved seam — waist edge, leg opening, crotch curve, cup boundary,
  band top edge — is a real quadratic bezier sampled into the outline
  (`qBez()`/`withCurves()`, a local copy of `js/fancy-patterns.js`'s own
  convention), including a genuinely curved oval crotch gusset (4 bezier
  segments) in place of the straight-edged diamond `js/ai.js`'s existing
  leotard gusset uses. No thong-style cut in any category; every bra is
  soft-cup/wireless construction (no underwire piece) — the only sensible
  default for the Girls category, kept identical for Women so one builder
  serves both instead of two parallel ones.
- `js/app.js`, `js/i18n.js`: five new piece roles (`gusset`, `cup`, `band`,
  `strap`, `elastic-band`) wired into `buildSewingSteps()` and
  `buildBomItems()` with real, dedicated construction steps and BOM lines
  (gusset/lining assembly, cup-to-bridge joining, brief/band side seams,
  elastic application naming the actual edge count, strap attachment;
  elastic yardage, hook-and-eye closure) — not left to fall through as
  `role:"other"`'s silent no-step behaviour. Deliberately used new
  `brief-front`/`brief-back` roles rather than reusing `front-panel`/
  `back-panel`: those trigger the existing generic "join at the shoulder
  seams" instruction, which is wrong for a brief (it joins at the side
  seams, and the crotch gusset — not a shoulder seam — is what actually
  goes between front and back). Also guarded the existing generic lining
  instruction (`has("lining")`) to skip when the only lining present is a
  gusset lining already covered by the new gusset step, rather than
  emitting a second, inapplicable "attach at the facing/hem edge" step
  for the same piece.
- `js/app.js`: two new `LIB_ICONS` entries (`underwear`, `bra`) so library
  cards get a real thumbnail instead of falling back to the generic
  shirt/dress icon.

### Verified
- All 44 patterns × every size (XXS–6XL) × every Kids age (Girls/Boys) —
  638 combinations — pass `closedOutline` and `selfIntersection` with zero
  failures (checked directly via `js/validate.js`'s `run()`, not assumed).
- Full test suite (200 tests) green; `test/validate-library.test.js`'s
  library-wide sweep (now 308 patterns) and its ≥148-verified-crossPiece-
  pairs regression guard both still pass unmodified.
- Live in-browser: a brief and a bra pattern each loaded onto the 2D
  canvas and visually confirmed — smooth curved panels, a clean oval
  gusset, a genuinely leaf-shaped cup, a distinct Sport Bra front/
  racerback-panel construction, and a Trunk's extended hemmed leg — plus
  real Sewing Instructions and Bill of Materials output captured and read
  back (not just triggered), confirming the new role branches fire the
  intended, non-redundant steps.

## WP-38/39/40: Split View, custom fabric texture, Fit Chart

Closes the three backlog items `BerryStudio-Tailornova-Feature-Study.md` §4
left open after WP-37 — all three now shipped, verified live in-browser
(checkerboard test swatch confirmed tiling correctly on both the 2D canvas
and the live 3D avatar simultaneously; Fit Chart's tolerance edits confirmed
flowing into the print sheet; Split View confirmed updating live with no tab
switch), and the full 200-test suite re-run clean after each.

### Added
- **WP-40, Fit Chart** (`js/app.js`: `buildFitChartRows`/`openFitChartModal`/
  `buildFitChartHTML`/`exportFitChart`) — a per-size measurement spec sheet
  (Export pane, project menu, ⌘K) with a live-editable ± tolerance per
  measurement point (`FIT_TOLERANCE_DEFAULT`, overridable per-key in
  `state.fitTolerances`). Values are computed by the same `computeMeasurements`
  grading engine as Auto Grade, for every size in `SIZES` (or every
  `KIDS_AGES` entry in Kids mode) — never a second, parallel calculation.
  One editable table honestly covers both of Tailornova's "Standard" and
  "Custom" Fit Chart line items instead of two features sharing every line
  of code.
- **WP-39, custom fabric photo upload** — a real uploaded swatch photo,
  tiled as an actual fill, not just a colour:
  - `js/canvas.js`: `getTextureImage()` (a decode-once, cross-render Image
    cache keyed by dataURL) and `drawPiece()` now fills with a real
    `ctx.createPattern()` tiled at `TEXTURE_TILE_CM` (≈10cm/repeat, scaled
    by the current zoom) when `piece.textureDataURL` is set, falling back to
    the existing solid-colour fill while the image decodes. New
    `Canvas.setTexture(i, dataURL)` API.
  - `js/three-view.js`: `fabricMat()` loads a fresh `THREE.TextureLoader`
    texture per call (deliberately NOT cached across calls — this file's own
    `disposeMaterial()` disposes whatever texture sits on the OLD material's
    `.map` on every swap, so a shared cache keyed by dataURL would get
    disposed out from under any other material still referencing it; a
    dataURL decode has no network round trip, so reloading per call is
    cheap). `fabricState[part].textureDataURL` flows through both `build()`
    and `setFabric()`'s existing `opts.parts`/`parts` handling.
  - `js/app.js`: `applyFabricTexture()`/`removeFabricTexture()` mirror
    `applyFabric()`'s selected-piece-vs-all-pieces scoping exactly;
    `state.fabricTexture3d` is the "applied to everything" global
    `partsFabric()` falls back to, mirroring `state.fabric3d`. Upload UI
    (Layers pane, Fabric & Material section) reuses the exact
    FileReader→dataURL pattern `openBgPanel()`'s background-image import
    already established.
  - A real bug caught by live verification, not by review: the first version
    put `new THREE.TextureLoader()` at module scope in `three-view.js`, which
    runs at parse time — before this file's own lazy `let THREE` (populated
    later by a dynamic import) is ever assigned, throwing `Cannot read
    properties of undefined (reading 'TextureLoader')` on every page load.
    Fixed by making the loader instance lazy (`getFabricTexLoader()`),
    matching why every other `THREE.*` construction in this file already
    happens inside a function, never at module scope.
- **WP-38, Split View** (`js/app.js`: `is3DActive`/`setSplitView`/
  `applySplitViewClasses`, `css/styles.css`'s `.canvas-wrap.split` rules,
  a new `#splitViewBtn` stage-toolbar chip) — a real, always-live 3D preview
  panel beside the 2D canvas (58%/42% split, stacks vertically under 900px),
  updating as the pattern is edited with no tab switch. Off by default,
  mutually exclusive with the "3D Preview"/"3D Cloth Lab" tabs by design
  (`setView(v)` turns Split View off for any `v!=="2d"`; `setSplitView(true)`
  switches back to "2D Pattern" first) — so `.threed`/`.clothlab`'s CSS and
  `.split`'s CSS never fight over the same canvas. Scoped to 2D + 3D Preview
  only, not Cloth Lab (a separate, heavier R3F app — running it continuously
  alongside 2D editing is a materially bigger performance commitment than
  this WP is about, and `BerryStudio-Tailornova-Feature-Study.md` explicitly
  flagged that as out of scope). Every call site that previously gated a
  live 3D rebuild on `state.view==="3d"` (fabric sync, visibility sync,
  pattern load/grade/generate, window resize — 12 sites total) now checks
  `is3DActive()` instead, so Split View gets the same live updates the 3D
  Preview tab always has, not a stale snapshot from whenever it was toggled
  on. Split View never auto-restores across a page reload — same as
  `state.view` itself, which also always boots back to "2D Pattern" rather
  than replaying last session's tab.

### Fixed (code review)
- `openFitChartModal()`/`exportFitChart()` had an `if(!Canvas.getPieces().length)`
  "empty2d" guard copy-pasted from the Sewing Instructions/BOM exports next to
  them — but the Fit Chart never reads `Canvas.getPieces()` at all (its columns
  are sizes, its rows are `computeMeasurements()` body measurements, entirely
  independent of any loaded pattern). The guard blocked a legitimate use —
  checking standard body measurements before drafting anything — for no
  functional reason. Removed; verified live that the modal now opens correctly
  on a brand-new, empty project.

## WP-37: Sewing Instructions export + one-click hemline length presets

Part of `BerryStudio-Tailornova-Feature-Study.md` — a feature audit of
`tailornova.com` against BerryStudio's own shipped set. Most of Tailornova's
marketed feature list was already covered (in several cases more deeply);
these two were real, closeable gaps.

### Added
- `js/app.js`: `buildSewingSteps()`/`buildSewingInstructionsHTML()`/
  `exportSewingInstructions()` — a real, ordered sewing-instructions sheet
  derived from the loaded pattern's own declared piece `role`s, the same
  trusted signal `buildBomItems()` already uses. Order: prep/interfacing →
  darts → yoke → shoulder seams → collar → sleeves → pockets →
  zip/placket → waistband → cuffs → buttons → lining → hem → press, each
  step only appears when a piece with that role is actually present —
  pieces with an unrecognised/no role contribute no step, matching the
  codebase's existing "don't guess" convention rather than a generic fixed
  paragraph. Wired into the Export pane, project menu, and ⌘K. Verified
  live: a 3-piece dress produces a 5-step sequence, a 10-piece lined/
  collared/pocketed coat produces a real 10-step sequence in correct
  construction order, in both EN and AR.
- `js/app.js`: Quick Draft's Length control for Dress/Skirt/Robe/Romper
  (the kinds where "length" genuinely means hemline) grew from 3 buckets
  (short/medium/long) to 8 one-click presets (mini/short/above-knee/
  medium/midi/long/ankle/maxi) — each a real distinct factor in `LEN_MAP`
  (a continuous multiplier `AIGen.build()` already honours for any key),
  not a relabelled duplicate. Verified live: selecting Maxi actually
  redrafts the dress to a floor-length hem (~175cm), not a cosmetic
  change. Deliberately not applied to Top/Shirt/Trousers/Gown/Jacket/
  Coat/Suit — those kinds' own length maps
  (`js/fancy-patterns.js`'s `LEN_F`/`JLEN_F`/`CLEN_F`, or a cropped→full
  trouser/top meaning) are real 3-bucket recipes with a silent fallback;
  more presets there would collapse onto an existing bucket instead of a
  genuinely distinct result.
- `js/i18n.js`: full EN+AR strings for both features.
- `css/styles.css`: `.seg` gained `flex-wrap: wrap` so an 8-button preset
  row wraps onto two lines in the sidebar instead of overflowing.

### Not done (see `BerryStudio-Tailornova-Feature-Study.md` §4)
- WP-38: a persistent synced 3-panel workspace (flat sketch + 3D + pattern
  always live side by side, Tailornova's actual signature layout) — a real
  UI architecture change, not a copy-edit; BerryStudio's 3D Preview/Cloth
  Lab remain separate view-mode tabs from 2D Pattern for now.
- WP-39: custom fabric image upload as a real 2D fill + 3D texture map
  (today's Fabric & Material is 8 presets + solid colour only).
- WP-40: exportable Fit Charts (a per-size tolerance table, distinct from
  the grading engine's own live numbers).

## WP-36: Make "Embedded" the default Cloth Lab engine

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase D. WP-5 shipped the
"Embedded" engine (Cloth Lab mounted directly into this page, sharing its
React/Three.js) opt-in behind Settings, defaulting to "Iframe" (the
original cross-document engine) so nothing changed for existing users
until they opted in. Gated on real evidence it's ready, per that WP's own
plan.

### Changed
- `js/app.js`: `DEF.clothLabEngine` flipped from `"iframe"` to
  `"embedded"`. Since state is built as
  `Object.assign({}, DEF, savedRaw)`, this only changes behavior for a
  `savedRaw` with no `clothLabEngine` key — i.e. a genuinely new install.
  Any existing user's browser already has this key baked into its saved
  `"pps"` `localStorage` blob from a prior `save()` call (state always
  serializes every key, not just ones the user explicitly touched), so
  their engine — chosen or not — is unconditionally preserved. "Iframe"
  remains fully selectable and functional as a fallback via Settings.
- `README.md`'s Cloth Lab engine row updated to describe "Embedded" as
  the default and drop the "still being rolled out" caveat.

### Verified
- Established a baseline first: full Playwright e2e suite on `main`
  (pre-change) — 16 passed, 1 pre-existing unrelated flake
  (`select-anything`, already named as flaky in `playwright.config.js`'s
  own comments).
- Same suite after the change: **17/17 passed**, including
  `smoke.spec.js`'s dedicated "embedded Cloth Lab engine mounts real
  content with no console errors" test (explicitly selects Embedded via
  the real Settings UI, asserts a real `<canvas>` mounted into
  `#clothLabEmbed`, `.engine-embedded` is active, and zero console
  errors) — the flaky test passed this run, confirming it, not the engine
  change. No regression in the blank-canvas bug class the Honest notes
  describe fighting twice.
- Manually confirmed a genuinely fresh session (`localStorage.clear()`,
  reload) persists `clothLabEngine: "embedded"` on first save, matching
  the new default.

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

## WP-29: VRM humanoid-bone retargeting

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase C. `detectVRM()`
(cloth-lab, WP-8.4) correctly identified VRM 0.x/1.0 files and showed an
honest `poseWarnVRM` message rather than mis-posing — deliberate scope for
that pass, not an oversight, but the real remaining gap: pose selection
had no effect on any VRM file, which always displayed an arms-down bind
pose regardless of the requested pose.

### Added
- `cloth-lab/src/body/reposeGLB.js`: `resolveVRMBoneNames(gltfResult)` —
  reads a VRM file's own `humanoid.humanBones` data (VRM 1.0:
  `extensions.VRMC_vrm.humanoid.humanBones`, an object keyed by the VRM
  spec's bone-name vocabulary; VRM 0.x: `extensions.VRM.humanoid.humanBones`,
  an array of `{bone, node}`) and resolves each declared bone to the glTF
  node's actual `name` — i.e. exactly the string on the corresponding
  `Object3D`, ready for `scene.getObjectByName()`. Returns `{}` (never
  throws) for a non-VRM file or malformed/missing humanBones data.
- `findBone()` and `applyPoseToGLB()` now take an optional `vrmBoneNames`
  map, tried before the existing Mixamo/Ready Player Me name list for every
  bone lookup (arms and, for the `seated` pose, legs) — a VRM file's real
  bone names never collide with the Mixamo list, so one lookup safely
  serves both rig conventions without the caller needing to know which one
  a given scene uses.

### Changed
- `cloth-lab/src/body/GLBAvatar.jsx`: a VRM file whose `humanBones` data
  resolves a full arm rig now goes through the exact same repose /
  mesh-fit-collision-rig pipeline as any other recognized rig — pose
  selection (standing/A-pose/T-pose/contrapposto/seated) works on it.
  `poseWarnVRM` is shown only when VRM's own bone data does NOT resolve a
  full arm rig (a custom/malformed VRM export) — never a silent mis-pose,
  same honesty rule the plain "no recognized rig" case already followed.
  Behavior for a non-VRM file (recognized rig or none) is unchanged.
- `README.md`'s honest-notes entry for VRM avatars updated to describe the
  new retargeting support and its one remaining honest fallback case.

### Tests
- `cloth-lab/src/body/reposeGLB.test.js`: unit tests for
  `resolveVRMBoneNames()` covering VRM 1.0's object-keyed humanBones, VRM
  0.x's array-of-`{bone,node}` humanBones, and missing/malformed data
  (always `{}`, never a guess or a throw); an integration test building a
  real T-pose THREE.js bone rig named with an arbitrary VRM-studio
  convention (deliberately not overlapping any Mixamo name) and confirming
  `applyPoseToGLB` only reposes it when `vrmBoneNames` is supplied — proving
  the VRM path, not a name coincidence, is what resolves it.

## WP-28: Per-piece 3D material for the procedural avatar

Part of `BerryStudio-Upgrade-Plan-v2.md`'s Phase C. The procedural 3D
avatar's garment shell only has 4 mesh groups (bodice/sleeve/skirt/
trousers), so two 2D pieces mapping to the same part — e.g. Front Bodice
and Back Bodice — collapsed to one shared 3D material: whichever visible
piece for that part was assigned last won, silently dropping the other
piece's colour/fabric.

### Added
- `js/three-view.js`: a `latheHalves()` helper that builds a garment part
  as two independent `LatheGeometry` half-revolutions (front `phiStart:
  -PI/2`, back `phiStart: PI/2`, each `phiLength: PI`) instead of one full
  revolution — front (Z>=0) and back (Z<0) per three.js's own vertex
  formula (`x=r·sin(phi), z=r·cos(phi)`). The two halves share every vertex
  along the phi=±PI/2 side seams with a full-revolution lathe of the same
  profile, so they meet with no gap when materials match, and show a real
  seam only where front/back fabrics genuinely differ. Applied to bodice,
  skirt, and both trousers meshes (seat + legs); sleeve stays a single
  capsule mesh (can't be angle-split, and is conventionally one piece in
  real patternmaking anyway) — a documented exception, not a gap.
- `fabricState`'s per-part slot is now `{front:{color,material},
  back:{color,material}|null, opacity}` instead of a single flat
  `{color,material}` (+ the old vertex-color-hack `colorBack`); `back` is
  null whenever there's no distinct back piece, so the back sub-mesh just
  mirrors front and a single-piece part still renders as one seamless
  whole exactly as before this change.

### Changed
- `js/app.js`'s `partsFabric()` now emits a full `{color,material}`
  descriptor for a part's back pieces (previously just a fallback
  `colorBack` int, dropping the back piece's fabric type entirely), and
  only includes it when the back piece is genuinely distinct from front
  (matching color AND material means nothing to render differently).
- Removed `applyFrontBackColor()` (the old per-vertex color-paint
  workaround) — real per-mesh materials replace it, so front/back can now
  differ by fabric type, roughness, opacity-per-fabric, etc., not just
  base color.
- `README.md`'s honest-notes entry for per-part 3D material updated to
  describe the new front/back sub-mesh split and the sleeve exception.

## WP-31: `boy2.glb` garment shell — fixed via measured landmark override

Part of `BerryStudio-Upgrade-Plan-v3.md` §3. `boy2.glb`'s garment shell was
fully swallowed by the skin surface in 3D Preview — not the generic
"occasionally under-fitting" limitation every bundled avatar has, a
complete visual failure for this one model. `BerryStudio-Upgrade-Plan-v2.md`
and an earlier pass at `-v3.md` had each investigated this and found no fix:
a per-Y-band width scan for a "safe" torso-only measurement failed because
boy2's arm silhouette dominates every height sampled; hand-calibrating the
garment radius alone (1.32x/2.0x/3.0x) jumped from invisible straight to
oversized with no stable middle ground.

### Fixed
- `js/three-view.js`: `computeBodyDims()` now accepts an optional
  `landmarks` override (`{shoulderYFrac, hipYFrac, radiusScale}`), applied
  via a new `AVATAR_LANDMARK_OVERRIDES` table keyed by the bundled avatar's
  filename stem (resolved from its URL in `loadGLB()`) — scoped to one
  specific mesh, not every avatar in its category. `boy2`'s actual
  crotch/underarm landmarks were measured directly from the cleaned mesh
  (a per-Y-band XZ-cluster scan on the real glTF POSITION accessor data,
  after replicating `stripPedestal()`/`keepLargestComponent()`) at ~33%/~65%
  of its own height — ~14-15 points below the generic kid assumption of
  47%/80%, most likely because this reconstruction's head is proportionally
  larger than that assumption accounts for. Y-position alone was verified
  in-browser to be insufficient (the shell still sat inside the skin at the
  corrected height); combining it with a 2.3x radius scale — the same
  factor the earlier radius-only attempt had already narrowed toward, but
  couldn't validate because it was scaling the shell at the wrong height —
  produces a shell that sits outside the skin surface, verified by
  screenshot. The other 7 bundled avatars are unaffected by construction
  (the override only matches `avatarId === "boy2"`); spot-checked `boy.glb`
  directly to confirm its pre-existing (unrelated, unfixed) behavior is
  unchanged.

## WP-32: 9th avatar candidate — investigated, explicitly not shipped

Part of `BerryStudio-Upgrade-Plan-v3.md` §4. The only 41MB candidate found
in the repo (`Manniquin/woman.glb`) has genuinely disconnected mesh islands
at the byte level, confirmed by a raw struct-level GLB parse (buffer/
accessor data fully consistent, no truncation) and by running it through
this app's real loading pipeline: 1,451,001 real triangles exist, but
`keepLargestComponent()` — tuned for every other bundled avatar's minor
debris — discards ~89% of it, keeping one arbitrary chunk. A genuine
source-asset defect, not a compression problem: the same
`@gltf-transform/cli` chain that compresses the other 8 avatars produced a
clean 3.13MB output from it with no changes needed. Not shipped — extending
`keepLargestComponent()` to bridge legitimate multi-island bodies needs a
full regression pass against all 8 working avatars first, and eight bundled
avatars is a reasonable gallery without a 9th. Explicitly decided not to do
this, rather than leaving it silently open.

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
