# BerryStudio — Upgrade Plan v5
### Consolidating v3.2's gap ledger and `docs/plan 4.md`'s pattern-library rebuild, re-verified against the live codebase, plus new work this revision adds

**Repository:** `github.com/mohammedamy/BerryStudio` · **Author:** Claude Sonnet 5 · **Version:** 5 · **Date:** 26 August 2026

**Supersedes:** `BerryStudio-Upgrade-Plan-v3-2.md` (8 August 2026, updated 26 August 2026) as the tracking ledger, and folds in the remaining scope of `docs/plan 4.md` (the pattern-library-rebuild brief, 22 August 2026) that v3.2 had already begun absorbing. Neither source document is wrong — this revision exists because both had real open items, some of v3.2's own numbers had gone stale since it was last touched, and two sessions' worth of work (the pattern-library Cloth Lab compatibility pass, and this session's own mannequin/Cloth-Lab work) needed folding into one current picture before planning the next phase.

**Method, so the numbers below can be trusted rather than taken on faith:** every status claim in §3 was re-verified against the live repository in this session — by reading the actual source (`cloth-lab/src/pattern/importFromApp.js`, `test/validate-library.test.js`, `.github/workflows/deploy-pages.yml`) and by *running* the validator sweep fresh (a one-off script mirroring `test/validate-library.test.js`'s own logic, extended to include `js/underwear-library.js` — see §3.1) rather than re-quoting v3.2's or `docs/plan 4.md`'s prose. Where a number confirmed a prior document exactly, that's noted; where it diverged or exposed a gap neither prior document named, that's called out explicitly.

---

## 1. What's shipped since v3.2 / `docs/plan 4.md` — brief, for context only

Full detail lives in `CHANGELOG.md`; not reproduced here. In order:

- **`docs/plan 4.md`'s entire pattern-library rebuild, Phases 0–5** (`CHANGELOG.md` WP-50 through WP-58): baseline harness, seam-edge declaration + parity upgrade, a generated-thumbnail renderer (`js/pattern-flat.js`), 12 reference patterns, the 100-pattern core catalogue redrafted with real construction, the Fancy/Leotards/Underwear collections rebuilt, and every `fail`-capable §5 check (`closedOutline`, `selfIntersection`, `grainline`, `seamAllowance`, `foldSymmetry`, `seamLengthParity`) driven to **0 fails library-wide** — confirmed still true by this revision's own fresh sweep, §3.1.
- **The Cloth Lab 3D seam-compatibility pass** (WP-59–65, v3.2's own §7/WP-43 "what already shipped"): real 3D trouser support, princess-seam auto-seaming fixed (twice — a second, subtler bug found six installments later), Girls' Leotards' full core construction (body/neckline/leg-opening binding/crotch gusset).
- **This session, not part of either prior plan**: a from-scratch procedural-mannequin redesign in both `cloth-lab/src/body/Avatar.jsx` and `js/three-view.js` (real hands/feet, face, hair, bust/deltoid volume, a torso lathe replacing 3-stacked-capsule limbs) — unrelated to v3.2 §2's "wait for new `.glb` files" deferral, since it's the *procedural* avatar, not the bundled mesh files; a follow-up giving the **female torso genuine front/back asymmetry** (a breast bulge and a lower-back curve sculpted into the mesh itself, with a matching collision-margin fix so cloth can't clip through it); and a Cloth Lab importer fix so multiple same-role pattern pieces (e.g. independent darted front-left/front-right panels) are recognized instead of silently dropped after the first.

None of the above needs re-litigating here — it's carried forward as done. What follows is what's actually still open, re-verified.

---

## 2. Deliberately out of scope (unchanged) — avatar/mannequin `.glb` files

v3.2 §2's call stands: `avatars/*.glb` and `Manniquin/woman.glb` are not being fit-tuned or landmark-corrected further until the new bundled files (mentioned as "coming") actually arrive, at which point it's a fresh WP scoped against those specific files, not a resurrection of old boy2.glb/Manniquin write-ups. This session's procedural-avatar redesign (§1) is unrelated — it doesn't touch the `.glb` files at all and doesn't change this deferral's status either way.

---

## 3. Status — every open item, re-verified

| # | Gap | Location | Size | Status this revision |
|---|---|---|---|---|
| WP-30 | USDZ export never confirmed in Apple Quick Look on real hardware | Cloth Lab export | VERIFY | Unchanged — still needs a physical iOS device |
| WP-35b | GPU spatial hash for self-collision | `cloth-lab/src/cloth/ClothSimulation.js` | LARGE | Unchanged — same WebGL2/no-atomics constraint v3.2 documented |
| WP-42C | Real PayPal billing (Stages A+B already shipped) | `js/entitlement.js`, `server/` | LARGE | Unchanged — blocked on the payment-provider decision |
| WP-43 | Cloth Lab seam-compatibility, remaining accessory categories | `js/fancy-patterns.js`, `js/underwear-library.js`, `cloth-lab/src/pattern/importFromApp.js` | MEDIUM | Unchanged in substance from v3.2 §7 — re-stated §5 below |
| WP-44 | Notch/ease/**cross-piece-pairing** authoring-scale gate closure | `js/library.js`, `js/fancy-patterns.js`, `js/girls-leotards.js`, `js/underwear-library.js` | LARGE | **Numbers re-measured fresh this revision (§3.1) — unchanged since WP-58, but v3.2 undercounted this gap: it named 2 gates, there are really 3** |
| WP-45 | Verification sweep: cross-browser, full 308-pattern Cloth Lab pass, export round-trips, `window.BerryStudio` API, library-grid perf | whole app | MEDIUM | Unchanged — none of its 5 items have been run |
| **WP-66** | `js/underwear-library.js` (44 patterns / 219 pieces) isn't in the permanent validator sweep or CI at all | `test/validate-library.test.js` | SMALL | **New this revision — a real, previously-unnoted regression gap** |
| **WP-67** | §8's numeric gates (notch ≥80%, ease-deferred ≤20%, pairing ≥95%) are never hard-asserted anywhere, only reported | `test/validate-library.test.js` | SMALL | **New this revision — `docs/plan 4.md`'s own §8 "add these tests" requirement, only partly done** |
| **WP-68** | No lint step in CI | `.github/workflows/deploy-pages.yml` | SMALL | **New this revision** |
| **WP-69** | Darts are never sewn into the Cloth Lab 3D cloth mesh — every dart-bearing piece drapes flat, undarted | `cloth-lab/src/pattern/importFromApp.js`, cloth topology/triangulation | LARGE | **New this revision — found investigating a real user report, explicitly deferred by the user's own choice at the time (see CHANGELOG's "Cloth Lab: stop silently dropping multiple same-slot pattern pieces")** |
| **WP-70** | Male torso has no analogous front/back distinction (kept symmetric this session, by design/scope) | `cloth-lab/src/body/torsoSculpt.js`, `js/three-view.js` | SMALL | **New this revision — optional cosmetic follow-on, low priority** |
| **WP-71** | No repo-scoped workflow automation for this project's own "close out a WP" checklist | `.claude/` (new) | SMALL | **New this revision — process suggestion, not app code** |

New items are numbered **WP-66 onward** to avoid the two numbering collisions already in this project's history — `CHANGELOG.md` independently used WP-42 through WP-47 for an earlier, unrelated 2D-editor-UX work thread *and* for this pattern-library-rebuild thread (e.g. two different "WP-43"s, two different "WP-45"s exist in `CHANGELOG.md` today, referring to unrelated work). Not something to renumber retroactively — `CHANGELOG.md` is an append-only historical record — but worth naming so a future reader isn't confused searching for "WP-43" and finding two.

---

## 3.1 Fresh baseline, measured this revision

`test/validate-library.test.js` — the one permanently wired into `npm test` and CI — only ever imports `js/library.js`, `js/girls-leotards.js`, and `js/fancy-patterns.js` (264 patterns). `js/underwear-library.js`'s 44 patterns are never registered when that test runs, despite `CHANGELOG.md`'s WP-57/58 both describing "a full 308-pattern / 2,170-piece sweep" — that wider sweep was real, but it was run as a one-off, not committed as a repeatable test (see WP-66 below).

To get a trustworthy *current* number rather than re-quoting WP-58's prose, this revision ran a script mirroring `test/validate-library.test.js`'s own counting logic (`run(pieces)`, the same `crossPiece.verified`/`.label.includes('(unmatched)')` convention its second test already uses) with `js/underwear-library.js` added to the import list:

```
Patterns: 308, Pieces: 2170
Totals: { pass: 9508, warn: 2340, fail: 0, deferred: 2170 }
Notch coverage: 324/2170 (14.9%)
chestEdgeIndices declared: 112/2170 (5.2%)  →  ease deferred: 2058/2170 (94.8%)
Cross-piece: 313 verified, 105 heuristic, 81 unmatched  →  62.7% verified
crashed: 0
```

Every one of these numbers matches `CHANGELOG.md`'s WP-58 exactly (0 fails on every `fail`-capable check; notch 14.9%; ease-deferred 94.8%; pairing 62.7%). **Nothing has drifted since WP-58** — the gap is real and current, not stale reporting. §8's three numeric authoring gates from `docs/plan 4.md`:

| Gate | Target | Current | Gap |
|---|---|---|---|
| Notch coverage | ≥80% | 14.9% | ~65 points |
| Ease deferred | ≤20% | 94.8% | ~75 points |
| Cross-piece pairing verified | ≥95% | 62.7% | ~32 points |

---

## 4. WP-30 — Verify USDZ export in Apple Quick Look

Unchanged from v3.2 §4 — restated in full there, not reproduced here. Still a 5-minute task that needs a physical iPhone/iPad; nothing to implement.

---

## 5. WP-35b — GPU spatial hash for self-collision

Unchanged from v3.2 §5 — the full technical constraint writeup, the recommended CPU-reference-first methodology, and the two real architectural options (from-scratch GLSL bitonic sort vs. moving self-collision to WebGPU) all still apply verbatim. Recommend a dedicated session, not folded into a broader sweep, exactly as v3.2 said.

---

## 6. WP-42 Stage C — PayPal billing

Unchanged from v3.2 §6's update note: Stages A and B are live (real sign-in, server-enforced trial, all five surfaces gated, `README.md` already updated to name the local-first reversal explicitly). Stage C waits on the user's own payment-provider decision.

---

## 7. WP-43 — Cloth Lab seam-compatibility, remaining accessory categories

Unchanged in substance from v3.2 §7. The table of what's still open (collar/lapel-facing, skirt waistband, `trouserPanel()`'s own waistband, underwear bra construction, leotard style-specific extras, sash/belt/hood/cape/epaulette/pocket) and its reasoning all still apply verbatim — none of it was touched by this session's work, which was scoped to the *importer's* piece-recognition cap (now fixed) and the *procedural avatar mesh*, not to any of these accessory role/seam categories.

**One addition worth flagging**: this session's own investigation into Cloth Lab confirmed a related but *distinct* gap — darts are never transmitted into the cloth mesh at all (not a seam-compatibility issue, a completely separate pipeline gap). Split out as its own item, WP-69 below, rather than folded into WP-43, since it's a different kind of fix (topology surgery on the mesh itself, not a role/seamId declaration).

**Collar-to-neckline, re-diagnosed and sharper than v3.2's own estimate (this session, before implementing anything).** A programmatic survey (not grep-guessing) of every pattern with a `collar`/`collar-stand`/`undercollar`/`collar-band`/`lapel-facing` piece confirms 46 patterns total — but only **3 use `princessBodice()`** (the construction WP-65 already exposed a real `necklineEndIdx`/`princessFrontNeck`/`princessBackNeck` edge on), and **33 use `jacketFrontBack()`** instead, which v3.2 already flagged as not having `necklineEndIdx` wired. Investigating *why* turned up something v3.2 didn't know: **`jacketFrontBack()`'s front and back panels have no distinct neckline curve at all** — both start directly at what would be the neck/closure point and immediately run one combined curve straight through the shoulder to the underarm (`frontSeg1`/`backSeg`, the same curve `jacketSide`'s own side-seam pairing already relies on for `back`, and the whole first curve for `front`). There is no shorter, separate segment anywhere in the construction that geometrically *is* "the neckline" for a seamId to point at.

Confirmed by direct measurement, not assumption: sampled `front`'s own first curve against `shawlCollar()`'s and `lapelFacing()`'s own neck-attaching edge across 3 real patterns (`wf06`, `mf01`, `bf01`) — the collar/facing edges measured **1.8×–2.5× longer** than the jacket's own curve. That isn't a seam-allowance-scale mismatch to tune away; it's confirmation that the two were never drafted to relate to each other, because the jacket side has no real neckline curve to relate *from* in the first place.

**What this changes about scoping the fix:** it's not "declare a seamId on an existing curve" (a small, safe, additive change) — it's "draft a genuine, new short neckline curve into `jacketFrontBack()`'s front and back panels, ahead of the existing shoulder+armhole curve, without disturbing the already-declared and tested `jacketSide` seam" (a real construction change to a function ~50 call sites share), **and then** redraft `shawlCollar()`/`lapelFacing()`/`collarStand()` so their own neck edge is derived from (or verified to match) that new curve, the same "same curve wins over close-enough control points" discipline WP-58 already established for `jacketSide`/`trouserOutseam`/`briefSide`. Both halves need the same direct-reproduction rigor WP-59–65 used — this is genuinely closer to WP-58's own scale of work (a real per-construction redesign, verified against the affected `~50` call sites) than a metadata-wiring pass, and deserves its own dedicated continuation rather than being rushed alongside WP-66/68's much smaller scope.

**Update — the first half shipped this session.** `jacketFrontBack()` now drafts a real, distinct, size-scaled neckline curve on both `front` and `back`, ahead of the existing (byte-for-byte unchanged) shoulder+armhole curve — declared as real seamable edges (`jacketFrontNeck`/`jacketBackNeck`), reachable from 2D Walk-the-Seam tooling for the first time. The existing, already-tested `jacketSide` seam (WP-58) is untouched — verified by re-running the exact same curve-resampling test that would have caught an index mistake, plus the full 308-pattern validator sweep (0 fails, matching the pre-change baseline exactly) and the full root + `cloth-lab` suites (299 + 778 tests).

Getting there surfaced one more real defect worth recording: the curve's own bezier samples, starting exactly at the true center-front/back point (X=0), landed in a genuine dead zone of `checkFoldSymmetry`'s own tolerance — close enough to the piece's min-X to be flagged as "should be part of the straight fold" (its 2%-of-width detection window), but not close enough to satisfy the much tighter ~0.5%-of-width straightness requirement within that window. Fixed with a short, real, size-scaled straight lead-in segment before the curve proper begins (a genuine, conventional patternmaking technique, not a check-dodging hack) — and the SAME dead-zone issue turned up completely independently in two long-standing call sites (`mf14`/`bf13`'s Kandura and Vest fronts), where the pre-existing hem-corner points (`closureX*0.3`) had only ever been safe by accident (they used to BE the piece's own min-X; adding a true center point moved min-X to 0 and exposed them) — fixed the same way. **49 `foldSymmetry` failures introduced and then fully resolved within this same pass**, not shipped broken and left for later — see this WP's own CHANGELOG entry for the full account.

**What's still open**: redrafting `shawlCollar()`/`lapelFacing()`/`collarStand()` so their own neck edge matches these new curves by construction (or is verified to, arc-length by arc-length) — the actual collar-to-jacket seam pairing. Not attempted this pass; the neckline curves above are the necessary prerequisite, now in place.

**Acceptance:** unchanged from v3.2 — direct reproduction + a dedicated `cloth-lab` vitest assertion per category resolved, full suite green throughout, never batch-declared without verification. For the collar/jacket piece specifically: the new neckline curve's own length and the redrafted collar/facing edge length must match by construction (a shared curve or a provably-derived one), verified by direct arc-length measurement in a test — not merely "a seamId was added."

---

## 8. WP-44 — Notch, ease, **and cross-piece-pairing** authoring-scale gate closure

**Broadened from v3.2's own scope.** v3.2 §8 named only notch coverage and ease coverage as the open authoring gates. §3.1's fresh measurement confirms a third: **cross-piece pairing sits at 62.7% verified against a ≥95% target** — a real, currently-open §8 gate v3.2 didn't carry forward, even though `CHANGELOG.md`'s own WP-57/58 entries reported it at the time (59.1%→62.7% after WP-58's `pairByRole` fix). All three gaps are the same *kind* of work — declaring more per-piece metadata (`role`, `chestEdgeIndices`, notches) at the shared-builder level, not hand-authoring 2,170 pieces individually — so they're kept as one WP, per v3.2's own recommended approach.

**Recommended approach (unchanged from v3.2):** identify the small number of shared builder functions each role type funnels through (the same leverage WP-58's `jacketFrontBack()`/`trouserPanel()` redesigns already demonstrated — one shared-geometry fix reaching 50+ call sites at once) and add real notch placement, `chestEdgeIndices` hints, and declared `role`s at the builder level, verified against `test/validate-library.test.js`'s sweep after each builder — **once WP-66 below lands, that sweep actually includes all 308 patterns**, so do WP-66 first or this work will be verified against an incomplete library.

**Acceptance (extended):** notch coverage ≥80%, ease-deferred ≤20%, cross-piece pairing ≥95%, `npm test` green, no regression on any check WP-58 already brought to 0 fails, measured against the *full* 308-pattern sweep (WP-66).

---

## 9. WP-45 — Verification sweep

**Update — 4 of 5 items closed this revision, 1 with an honest documented limit.**

1. **Full 308-pattern Cloth Lab simulate pass — closed, and it found a real bug.** `js/library.js`, `js/fancy-patterns.js`, and `js/girls-leotards.js` already had a dedicated cloth-lab vitest sweep each (`importFromApp.library/fancyCollection/leotards.test.js`); `js/underwear-library.js`'s 44 patterns and `js/data.js`'s own 6 hand-authored patterns (`womens_dress`/`mens_shirt`/`abaya`/`thobe`/`girls_dress`/`boys_trousers`) had none. New `importFromApp.underwear.test.js` and `importFromApp.dataPatterns.test.js` close both — and the underwear sweep immediately found a real, previously-invisible defect: `briefPanel()`'s own declared `briefSide` seam (WP-58) overlapped the importer's auto-derived geometric side seam on all 24 brief/trunk patterns, because it never got the `sideEndIdx` narrowing hint that prevents exactly that collision (the same mechanism WP-64/65 built for other pieces, just never wired here). Fixed at the source. All 308 patterns now import and assemble through the real cloth-lab pipeline without throwing, permanently, in CI.
2. **Export round-trips — closed.** SVG/DXF/HPGL/tiled-PDF already had real `node --test` coverage; PNG had none anywhere (the code's own comment explains why: it needs a real DOM/canvas/Blob, same reason this suite is Playwright not Node). New e2e test rasterizes a real pattern and verifies the actual PNG file signature byte-for-byte, not just the Blob's self-reported MIME type. "Save Project → Import" JSON round-trip remains genuinely unverified — `projectPayload()`/`applyProjectPayload()` are private to `js/app.js`'s closure with no reachable test surface, and exercising it means a real Playwright download/re-upload flow — flagged here as a specific, precisely-scoped remaining gap, not attempted this pass.
3. **`window.BerryStudio` API surface — already closed, confirmed by running it.** All 5 documented methods (`generate`/`grade`/`nest`/`export`/`validate`) already have real e2e coverage — the entitlement-gating test for `export`/`generate`, and a separate test proving `grade`/`validate`/`nest` return real (not stubbed) results. No new work needed; verified green.
4. **Thumbnail uniqueness (`docs/plan 4.md` §8 gate #13) — already closed, confirmed by running it.** `test/library-thumbnails.test.js` already sweeps all 308 patterns and asserts no two *composed* thumbnails are byte-identical (a shared placeholder for patterns that honestly decline to compose — 20 of them, all `js/underwear-library.js` bra patterns with no torso-panel-shaped role — is correctly excluded from that comparison, not a violation). Confirmed passing.
5. **Library-grid performance — real number for the measurable half, honest gap on the rest.** Thumbnail *generation* (the one specifically identified as needing caching, `docs/plan 4.md` §7.3) measured directly: **32.5ms cold** to render all 308 SVG thumbnails from scratch, **~0ms warm** (cache hits) — confirms the caching requirement is both implemented and actually effective, not just present. Proposed budget (none existed before): generation should stay under 50ms cold for the full library; met with real margin. **Not measured**: actual DOM-mount/paint cost of the rendered grid — the in-app Library panel is now behind the WP-42 entitlement gate, and this pass didn't have a real account to check it live with. A real limitation, stated rather than glossed over.

**Not measured at all — cross-browser load.** Confirmed clean, zero-console-error loads in Chromium (both the sandboxed dev pane and a real, separate Chrome instance) and the full Playwright e2e suite (17/19 passing; the 2 failures are pre-existing, documented flakiness — `playwright.config.js`'s own comment already names this exact class — confirmed by re-running both in isolation, where they passed). Firefox and Safari are not available in this session's toolset at all — this is a genuine, stated tooling gap, not a result.

---

## 10. WP-66 — Wire `js/underwear-library.js` into the permanent validator sweep

**New this revision.** `test/validate-library.test.js` — the file `npm test` and CI both run on every change — imports `js/library.js`, `js/girls-leotards.js`, and `js/fancy-patterns.js`, but never `js/underwear-library.js`. Its 44 patterns / 219 pieces (44 bra/brief/undergarment designs across all 4 categories) are real, shipped, currently-passing patterns — §3.1 confirms 0 fails on them — but nothing in the committed test suite or CI would catch a regression if a future edit broke one. `CHANGELOG.md`'s WP-57/58 both swept all 308 patterns including underwear, but that was a one-off script run for that session's own reporting, not a change to the committed test file.

**Fix:** add `import '../js/underwear-library.js';` to `test/validate-library.test.js` (both its `test()` blocks, matching the existing import pattern for the other 3 collections), update the file's own header comment (currently says "224 patterns," already stale against the actual 264 it sweeps today — fix both numbers together rather than compounding the drift), and re-baseline the hard-coded `verified < 148` regression floor in the second test to the new, larger true baseline (313, per §3.1) so a future underwear-library.js regression is actually caught rather than silently passing against a floor set for a smaller sweep.

**Acceptance:** `test/validate-library.test.js` sweeps all 308 patterns / 2,170 pieces; its own header comment states the real, current pattern/collection counts; the cross-piece-verified regression floor reflects the true current baseline; `npm test` still green.

---

## 11. WP-67 — Hard-assert §8's numeric gates once they're met

**New this revision.** `docs/plan 4.md` §8's own "Add these tests" list asked for `test/validate-library.test.js` to be "extended to **assert** the §8 thresholds rather than only reporting them." Partially done: the file does hard-assert two things (the validator never crashes, and verified cross-piece pairs never drop below a floor) — but the three coverage-percentage gates (§3.1's table) are only ever printed to the console, never asserted. Right now that's the right call — asserting `notch >= 80%` today would just make the test suite permanently red until WP-44 lands. But once WP-44 closes these gaps, nothing currently locks them in — a future pattern added without notches, or without `chestEdgeIndices`, could quietly erode the percentage with no test noticing.

**Fix (sequence strictly after WP-44):** add three assertions to `test/validate-library.test.js` mirroring the existing `verified < 148` pattern — `notchCoveragePct < 80`, `easeDeferredPct > 20`, `pairingVerifiedPct < 95` each throw with a clear regression message, computed from the same counts the test already gathers.

**Acceptance:** once WP-44 lands, a deliberately-reverted single builder's notch/chestEdgeIndices/role change fails this test locally, proving the assertion is real and not a rubber stamp — same "prove the regression test actually catches the regression" bar this project has applied elsewhere (e.g. WP-26's `closedOutlineFails` assertion).

---

## 12. WP-68 — Add a lint step to CI

**New this revision.** `.github/workflows/deploy-pages.yml` runs the root `node --test` suite and cloth-lab's vitest suite, gating deploy — but has no `oxlint` step at all. Every lint check across this project's entire visible history (every WP in `CHANGELOG.md` that mentions "zero new oxlint warnings") has been a manual command run by hand each session, with no automated backstop if a future change (or a future contributor, or a future session that skips the habit) introduces a real warning.

**Fix:** add an `oxlint` step to the existing `test` job in `.github/workflows/deploy-pages.yml`, run against the same file set this project already lints by convention (`js/`, `cloth-lab/src/`). Given the codebase currently carries a small number of pre-existing warnings (confirmed throughout this session — unused vars, a couple of `no-new-array` style warnings), decide explicitly whether the CI step fails the build on *any* warning (requiring those pre-existing ones to be cleaned up first, as its own small prerequisite fix) or is informational-only (`continue-on-error: true`) until they are — don't silently pick one without stating it in the PR that adds this.

**Acceptance:** CI runs `oxlint` on every push/PR; the decision on warning-strictness is explicit and documented in the PR description and/or a code comment in the workflow file itself.

---

## 13. WP-69 — Sew darts into the Cloth Lab 3D cloth mesh

**New this revision**, found investigating a real user report ("why can't I see 3 or 4 different darts from 4 different pieces together"). Confirmed by direct code tracing: `js/app.js`'s `buildClothLabPayload` already sends each piece's `darts` array across the bridge to Cloth Lab — but `cloth-lab/src/pattern/importFromApp.js` never reads it. Every code path that builds a `rawPiece` only carries `{id, label, outline, color}`. This means **every dart-bearing piece in the entire library drapes flat and undarted in Cloth Lab today** — not a display limit, a complete pipeline gap, present since Cloth Lab's importer was first written.

This session fixed the *adjacent* bug the same user report also surfaced (multiple same-role pieces silently dropped) but explicitly left this one for a future pass, at the user's own direction — real scope, not a quick follow-on:

- A dart needs to be **folded shut** in the piece's own outline (the two dart legs sewn together, apex to mouth) before triangulation — real topology surgery, not a cosmetic vertex nudge like this session's torso sculpt was.
- The triangulator (`cloth-lab/src/pattern/triangulate.js`) and the cloth solver's own particle/spring topology need to treat the folded seam as a real internal weld, not just a visual crease — otherwise the "sewn" dart would either not hold under simulation or would need its own constraint, similar in kind to how existing declared seams are welded (`cloth-lab/src/pattern/piece.js`'s `seamEdges` mechanism is the closest existing precedent, but a dart's two legs meeting at a single interior apex point — not two full piece edges meeting — is a different shape of problem).
- Once folded, the resulting 3D shape needs to visually read as a real dart-shaped fold (a subtle ridge/pucker running from the apex), not just a piece that's slightly narrower where the dart used to be.

**Recommended approach:** same CPU-reference-first discipline WP-35b's dihedral bend and WP-35's own methodology established — work out the fold-and-weld geometry as plain, tested JS functions against a handful of hand-built dart fixtures (a simple single dart, a dart near a curved edge, two darts on the same piece) before touching the triangulator or the live cloth sim, and verify the resulting 3D shape directly (vertex positions, not just "the validator didn't crash") the same way this session's own torso-sculpt collision-margin work was proven with a sampled-grid test rather than assumed correct.

**Acceptance:** a piece with a declared dart, imported into Cloth Lab and simulated, shows a real 3D dart fold in the drape (verifiable by comparing the mesh's own local curvature/silhouette near the dart apex against the flat undarted case); existing dartless pieces are byte-for-byte unaffected; a new `cloth-lab` vitest suite covers the fold-and-weld geometry directly, independent of the full simulation.

---

## 14. WP-70 — Give the male torso an analogous front/back distinction (optional, low priority) — DONE

**Shipped this revision.** The male torso now has its own front/back asymmetry — a single-lobe (not two) chest bump and a subtler lumbar/glute back curve, reusing `torsoSculpt.js`'s `bumpWindow` machinery with smaller amplitudes, wired into `Avatar.jsx`/`collisionRig.js`/`js/three-view.js`. Its own `maleTorsoExtraRadius` collision-safety margin was independently derived and verified with the same sampled-grid test technique the female sculpt used — not assumed to inherit the property. Live-verified in both Cloth Lab (front/back rotation, Men category) and the root app's 3D Preview (real Chrome, zero console errors). Female path byte-for-byte unchanged. See `CHANGELOG.md`'s own WP-70 entry for full detail.

---

## 15. WP-71 — A repo-scoped "close out a WP" workflow (process, not app code) — DONE, with one honest caveat

**Shipped this revision.** `.claude/skills/close-out-wp/SKILL.md` packages the exact checklist every WP in this project's history (including every one landed this session) has followed by hand: grep for and revert any active `TEMP-LOCAL-TEST-BYPASS`, run the full test/lint suites for whatever actually changed, write a `CHANGELOG.md` entry at the top of the file matching the *current* live format (read it fresh each time, don't rely on a remembered template), and ship on its own branch/PR — stopping short of the commit/PR/merge step for a final go-ahead, never auto-shipping. Documented in `README.md`'s Development section, matching how this project documents its other conventions.

**The honest caveat, stated rather than glossed over:** this skill was written mid-session, so it never appeared in *this* session's own skill listing (fixed at session start) — it could be authored and reviewed for content/structure, but not actually *invoked* to verify the end state matches doing it by hand, the acceptance bar this WP's own first draft set. That verification needs a fresh session (where the skill is discoverable) to run it for real on a real, small change. Flagged here explicitly so a future session picks this up rather than assuming it was already confirmed working.

---

## 16. Sequencing recommendation

1. **WP-30** — 5 minutes with a phone, unblocks/blocks nothing else; do whenever convenient.
2. **WP-66** (wire underwear-library into the sweep) — small, unblocks WP-44/67 from being verified against an incomplete library; do first among the new items.
3. **WP-68** (CI lint step) — small, independent, no reason to wait.
4. **WP-43** (remaining Cloth Lab accessory categories) — natural continuation of already-verified mechanisms (`necklineEndIdx`/`sideEndIdx`/`foldMirrorEdge()`); start with collar-to-neckline, the single biggest lever, per v3.2's own recommendation.
5. **WP-45** (verification sweep) — after WP-43, so it measures the real end state.
6. **WP-44** (notch/ease/pairing authoring-scale closure) — its own large, independent effort; start once WP-66 has landed so it's verified against the full 308-pattern library from the start.
7. **WP-67** (hard-assert the §8 gates) — strictly after WP-44 closes them; asserting early just makes the suite permanently red.
8. **WP-69** (sew darts in 3D) — large, deserves its own dedicated session with the CPU-reference-first discipline described above, same as WP-35b; not blocked by anything above, but sequenced after the higher-leverage/smaller items.
9. **WP-35b** (GPU spatial hash) — its own dedicated session, unchanged reasoning from v3.2.
10. **WP-70** (male torso asymmetry) — optional, whenever there's appetite for a small cosmetic follow-on; no dependency on anything else.
11. **WP-71** (close-out workflow skill) — whenever there's a natural pause between WPs to build tooling rather than ship features; genuinely orthogonal to every item above.
12. **WP-42 Stage C** (PayPal) — waits on the user's own payment-provider decision, exactly as v3.2 flagged; the one item where "reorder freely" doesn't apply.

Not a mandate — reorder for whatever's actually blocking real usage, same caveat v3.2 closed with.
