# Plan v6 execution progress

Started: 14 September 2026. Updated: 15 September 2026.
Canonical roadmap: [Plan v6](../BerryStudio-Upgrade-Plan-v6.md).

## V6-01 — Audit repair release: deployed

[PR #56](https://github.com/mohammedamy/BerryStudio/pull/56) merged as `63a726dc11ee9e4f04cbf1df4e18c34677578701`.
[GitHub Pages run](https://github.com/mohammedamy/BerryStudio/actions/runs/34896178519) completed successfully: tests, build and publication.

- Fixed root/BodyForm import-map CSP authorization, image-provider input behavior, translated drafting control labels, documentation links and misleading descriptions.
- Added CSP-active browser tests and improved startup diagnostics/local test serving.
- Verified production bytes for index, BodyForm, image providers, app controller and service worker against the release commit.
- Verified the live BodyForm avatar canvas is visible with no observed console errors.
- Pre-release verification: 329 root tests, 893 Cloth Lab tests and 21 browser tests passed; both lints passed with existing warnings.

## V6-02 — Mobile and RTL workspace

State: deployed. [PR #57](https://github.com/mohammedamy/BerryStudio/pull/57) merged as `487020aa930d4f3b2cb3f56df4bb4599e0f3b035`.
[Pages run 34919996840](https://github.com/mohammedamy/BerryStudio/actions/runs/34919996840) passed tests, build and publication. Live index, CSS, app controller, responsive controller and service worker match release commit `fac1bfd` byte-for-byte.
Branch: `codex/v6-02-mobile-workspace`, isolated checkout `/tmp/berry-pr52-conflicts-20260914`.
Base: V6-01 release. Separate unfinished local mf11 collar work remains untouched.

### Implemented

- At 1100px and below, use a compact header with persistent categories and 2D/3D/Cloth view switches.
- Start with the inspector closed to preserve canvas space. Add translated Panels and More controls buttons, a panel close button, Escape handling, outside-click dismissal and focus restoration.
- Keep settings, account, help, docs and appearance controls reachable through More controls. Hidden disclosures leave the tab order; desktop controls return when the viewport widens.
- Use logical CSS placement for Arabic/RTL; translate the stage action labels and allow panel tab labels to wrap.
- Keep stage actions in their own horizontal scroll area rather than overflowing the page, with 44px primary touch targets.
- Correct the app's three-row layout (header, project strip, workspace), use dynamic viewport height, and size section-heading icons explicitly.
- Observe canvas layout changes so the pixel buffer and pointer coordinates stay aligned when project tabs or toolbars change size without a window resize.
- Include the new controller in service-worker precaching and advance the cache version to v29.

### Acceptance evidence

- Initial five responsive tests passed at 320/390/768/1024px, including English/Arabic grading, disclosure behavior, keyboard focus and transitions to desktop.
- Visual inspection at 390px confirmed the full canvas is usable with panels closed and Arabic panel controls align correctly. At 1101px, no document overflow was observed.
- Selection and Add Point tests initially exposed the canvas layout-size defect. Both passed after adding resize observation; a dedicated layout-only resize regression was added.
- Final suite: **329 root tests and 27 browser tests passed**. The six responsive tests also passed after the last Arabic-label update. Root lint passes with 91 existing warnings and no errors. No temporary test bypasses or conflict markers found.
- Review patch in the primary workspace: `docs/v6-02-review.patch`. The isolated branch above contains the exact implementation.
- Physical iPhone/Safari and touch-device testing are not claimed; verification uses Chromium viewport tests and the in-app browser.

## Current library baseline

[14 September baseline](audits/2026-09-14-library-baseline.json): 308 patterns, 2,171 pieces, 775 pieces with notches (35.7%), 359 with chest hints (16.5%), 337/499 verified cross-piece reports (67.5%). Zero geometry failures at tested defaults does not establish physical fit.

## V6-03 — Access and persistence verification

State: deployed through [PR #58](https://github.com/mohammedamy/BerryStudio/pull/58), merged as `2ec736e4bc9b8ee58e787c002a4dd58ce96d9855`. [Pages run 34974619211](https://github.com/mohammedamy/BerryStudio/actions/runs/34974619211) passed tests, build and publication. Live index, app controller, canvas, translations, responsive controller and service worker returned HTTP 200 and matched release commit `7ccead5` byte-for-byte.

### Fixed

- Restore the active saved project before enabling startup writes. Previously boot loaded the default pattern and could overwrite the active project's snapshot. Resume tab ID allocation after existing IDs.
- Save direct pointer/keyboard canvas edits and capture snapshots on page exit/backgrounding. Catch malformed stored JSON and storage write errors; explain how to keep a JSON backup in English/Arabic.
- Clone restored canvas snapshots and advance annotation/construction ID counters. JSON now includes sketch strokes and restores the full variable map at once, including forward references; invalid outline coordinates are rejected before replacing pieces.
- Scope retained entitlement to the same account and discard out-of-order profile responses. Recheck cached trial expiration at gate use. Clear gated panes immediately on account changes and handle unavailable auth SDK startup without an unhandled rejection.
- Fix a mobile-to-desktop focus race found during verification: CSS could blur the hidden mobile button before the media-query callback read the focus origin.
- Advance service-worker cache to v30.

### Test runtime

The headless host stopped creating hardware WebGL contexts during verification. The error is now included in 3D readiness diagnostics. Two fixed-delay smoke checks now wait for actual readiness. `PLAYWRIGHT_SOFTWARE_GL=1` explicitly enables software WebGL for tests only; use `--workers=1` on this host to avoid parallel software-rendering contention. Production graphics settings are unchanged.

### Acceptance matrix and limitations

- CSP-enforced Chromium tests use a mocked remote Supabase SDK boundary to exercise the real auth wrapper, app and access decisions for signed-out, fresh-trial, expired-trial, active-account and missing-profile states. Library, AI and Quick Draft panes are checked. Same-account fetch failure, account replacement, late response after sign-out and cached trial expiration are regression cases.
- Real JSON file downloads/uploads verify design content survives import, reload and switching independent tabs. Only documented import defaults and transient annotation screen hitboxes are normalized for comparison.
- A real service-worker test warms the installation online, disables networking, reloads and confirms the edited project and signed-out access state survive. First-ever offline installation and offline cloud/AI features are not claimed.
- These tests do not establish successful live OAuth/email login or production database/RLS configuration; no real account credentials or production profile changes were used.
- Account access policy remains separate from billing. Subscription and monetization remain in Phase 7.

### Final verification

- Deployment verification: GitHub's complete test job passed, followed by successful build and production deployment. The historical local test details below explain the issues fixed before release.

- `npm test`: **332 passed, 0 failed**.
- `npm run lint`: **91 existing warnings, 0 errors, no new warnings** compared with V6-02.
- `PLAYWRIGHT_SOFTWARE_GL=1 PLAYWRIGHT_BROWSERS_PATH=/tmp/berry-playwright-browsers npx playwright test --workers=1`: **36 passed, 1 failed**; the failure exposed the mobile-to-desktop focus race described above.
- After fixing that race, the entire responsive suite passed: **6 passed, 0 failed**, using the same environment and `npx playwright test e2e/responsive.spec.js --workers=1`. All 37 browser cases are therefore covered by the full run plus the focused post-fix rerun; a single all-green full rerun is not claimed.
- No temporary entitlement bypasses or conflict markers in application/test sources; `git diff --check` passes.
- Review patch: `docs/v6-03-review.patch` in the primary workspace. Separate original checkout changes remain untouched.

## V6-04 — Starter-block inventory

State: engineering inventory implemented and verified; not deployed. The original temporary checkout is no longer available; its implementation is retained in the primary workspace's `docs/v6-04-review.patch`, guide and audit JSON. Full maker-reviewed acceptance remains open.

- Nominated `w07` woven skirt, `w01` bodice/dress and `m01` trousers. Captured explicit authored/proposed joins, all boundary segments, garment-specific checklists, unsupported cases and construction blockers.
- Nine size cases (XS/M/XL), geometry and manifest hashes, detailed validator evidence and 305 reasoned exclusions. Historic WP-44 metrics remain separate; a fresh sweep exactly matches the baseline.
- Candidate applicability: eight of nine pieces contain notches; two of two eligible torso pieces contain chest hints. Metadata presence does not establish correctness or fit.
- A proposed trouser inseam mismatch of about 67.42 mm at M, incomplete dress assembly and a missing skirt vent keep these candidates out of production approval.
- Verification: 337 root tests pass, 91 existing lint warnings with no new warnings, deterministic report output and clean diff checks. UI and Cloth Lab were not changed.
- Review artifacts remain in the primary workspace: `docs/starter-block-inventory.md` and `docs/audits/v6-04-starter-inventory.json`. They belong to the separate V6-04 branch. All maker/sample approvals remain null; a named maker must review the concrete revisions and resolve blockers before promotion.

## V6-05 — Project revision and typed command contract

State: deployed through [PR #59](https://github.com/mohammedamy/BerryStudio/pull/59), release commit `87762f1`, merge `f2e5427da60e9623736837f37926e5b27448d62c`. [Pages run 35037743902](https://github.com/mohammedamy/BerryStudio/actions/runs/35037743902) completed successfully. On 19 September, live `js/app.js`, `js/project-revisions.js`, `js/project-review.js` and `sw.js` matched the merged files byte-for-byte. Primary checkout changes remain untouched.

- Version-2 JSON migration with stable project/piece IDs; preserve project-domain context and canvas data through file import/export, tabs, autosave and undo.
- Project → Review change… supports bounded move, rename and color commands in English/Arabic. Preview is non-mutating; accept is atomic and one undo step; reject/close changes nothing. Locks and stale project/tab checks prevent unreviewed replacement.
- AI generation and attribute regeneration require review and acceptance into a separate draft project. Existing designs and locks remain intact. New tabs have independent undo histories.
- Undo/redo now preserve variables and project metadata. Pattern regeneration retains project context. Layer names render as text; preview uses safe DOM creation. Service-worker cache v31 includes the new modules.
- Contract and scope boundaries: [project-revision-contract.md](project-revision-contract.md). This package does not claim maker approval, field-specific regeneration constraints, branching history or model-authored edit commands; those remain later integrations. Monetization stays in Phase 7.

### Verification

- `npm test`: **338 passed, 0 failed**.
- `npm run lint`: **91 existing warnings, 0 errors, no new warnings**.
- Complete browser suite: **40 passed** with software WebGL and one worker, including CSP, offline, responsive, drafting/export and Cloth Lab gating coverage.
- After the final context-retention, name-normalization and preview refinements, the full unit/lint checks above were rerun, and **12 focused browser tests passed** (`e2e/project-revisions.spec.js` plus `e2e/access-persistence.spec.js`). These include AI reject/accept/undo/redo and preservation of the source project. A second complete 40-case run is not claimed.
- Manual in-app browser inspection of the Arabic review form and dashed/current versus solid/proposed preview; compact form and styled acceptance controls verified.
- No temporary entitlement bypasses in application code; no conflict markers; `git diff --check` passes.
- Review patch in the primary workspace: `docs/v6-05-review.patch`; apply only against the V6-03 base or resolve changes on the implementation branch.

## V6-06 — Evaluation corpus and maker rubric

State: engineering foundation verified on `codex/v6-06-evaluation`; deployment authorized on 20 September and proceeding through the release pipeline. Maker acceptance remains open. Durable worktree: `/Users/mohammedamy/Developer/BerryStudio/.worktrees/v6-06-evaluation`. The initial temporary V6-06 draft was lost with `/tmp`; its corpus was reconstructed and completed here before evaluation.

- 60 original briefs: 20 per family (skirt, dress, trousers), balanced 30 Arabic/30 English. Translation groups stay together: 36 development tasks, 24 process-held-out tasks. Holdouts have not been executed.
- Six original front/back schematic reference assets with explicit provenance and permitted use. No external photography or personal body data. These are uncalibrated synthetic references, not maker-approved ground truth.
- Deterministic local text-core adapter, source/reference hashes, per-case validator evidence and family/language/input/split breakdowns. The runner does not change production behavior or pretend to exercise browser image analysis.
- Baseline: 36 development tasks requested; 30 text cases executed; **7 automated passes, 23 failures, 6 image cases not run**. Maker acceptance remains unknown. Detailed protocol: [evaluation README](../evaluation/v6-06/README.md).
- Proposed maker rubric, failure taxonomy and unsigned review template. Remaining acceptance: named maker review of expectations/translations/construction, permitted calibrated examples, multi-reference/provider evaluation and human correction/time/fit evidence. Full V6-06 acceptance is not claimed.
- Verification: **343 unit tests passed**; root lint **91 existing warnings, 0 errors**; explicit lint of new scripts/tests has **0 warnings/errors**. Repeated baseline output is deterministic. No production runtime/UI change, so browser/Cloth Lab suites were not repeated for this tooling-only package. V6-05's production pipeline already passed them.
- Review patch retained in the primary workspace at `docs/v6-06-review.patch`. Monetization remains Phase 7.

### Browser/image evaluation continuation

- Added an isolated Chromium harness that executes actual `AIGen.generate`, reference fetching/decoding and local silhouette analysis, without remote provider calls or changes to production account gates. Its local Node server replaced a Python server that stalled before readiness on this host.
- Executed all **36 development cases: 7 automated passes, 29 failures, 0 not run**. All **24 holdouts remain unexecuted**; the browser harness refuses them. The earlier 7/23 text-only baseline remains preserved separately.
- All six image references decoded successfully but produced `usedImage: false`; generation fell back to text instead of clarifying the missing back view and scale. A separate high-contrast positive control succeeded through the real image analyzer.
- Saved `baseline-browser.json` and the actual generated geometry in `browser-outputs.json`, linked with per-case geometry hashes and a whole-bundle hash. Source hashes and browser version are recorded. Maker approval remains null.
- Added concrete development follow-ups for clarification/refusal, four hyphenated length-interpretation failures, eight validator cases needing construction review, and honest handling of unusable image evidence.
- Verification: **345 unit tests passed**, **one browser benchmark test passed covering all 36 cases plus error/holdout guards and the positive control**; root lint remains **91 existing warnings, 0 errors**, new scripts/harness/tests lint with **0 warnings/errors**. Production runtime and corpus/holdout definitions are unchanged; the product smoke suite was not repeated for this isolated tooling change.

### 20 September — length-intent correction

- Corrected the development-confirmed parser defect: spaced and hyphenated
  regular/medium/knee length phrases now select the standard garment length.
  Whole-word matching avoids treating “irregular-length” as regular length.
  Arabic equivalents, explicit prompt precedence over images and sleeve masking
  are covered by two regression tests across the three garment families.
- Preserved all original baselines. New text report: **10 passes, 20 failures,
  6 image cases not run**. New browser report: **10 passes, 26 failures, none
  skipped**. Four length-intent failures are eliminated; one corrected dress
  retains its validator failure. Eight validator failures remain in total.
- Reports use `development-length-fix-*.json`, including actual output geometry
  bound by hashes. Current source and geometry hashes verified. All **24
  holdouts remain unexecuted**, and maker acceptance remains unknown.
- **347 unit tests pass**, root lint has **91 existing warnings / 0 errors**,
  the 36-case browser evaluation passes its harness checks, and Cloth Lab's
  embed builds successfully. All **40 product browser tests pass** with software
  WebGL and one worker; no temporary test bypasses are present.
- Local implementation only; V6-06 has not been deployed. Subscription and
  monetization remain in the final phase.

### 20 September — unreadable-reference clarification

- Local `AIGen.generate` returns `clarify` / `unreadable-image` with no geometry
  when an attached reference yields no usable silhouette. The app displays
  English/Arabic recovery instructions while preserving the current project,
  prompt and image. Users can replace the reference or explicitly remove it
  before retrying text-only generation.
- Browser development evaluation: **16 passes, 20 failures, 0 skipped**.
  All six image cases now satisfy the coarse clarification/no-draft check.
  Reports and raw decision/geometry evidence are saved in
  `development-image-clarification-browser.json` and
  `development-image-clarification-outputs.json`. Source/bundle hashes verified;
  historical reports and all 24 unexecuted holdouts remain unchanged.
- Scope is local image readability only. Readable-image view/scale checks,
  provider reconciliation, conflicting/invalid measurements and the eight
  construction-validator failures remain open. Maker approval is still unknown.
- Unit suite: **347 passed**; root lint **91 existing warnings, 0 errors**.
  The browser benchmark passed all harness checks. No temporary bypasses.
- All **40 existing browser tests passed**. The two new English/Arabic recovery
  tests passed on a focused rerun after correcting ambiguous upload/preview
  selectors. They verify no project mutation, prompt retention, button recovery
  and an explicit text-only retry reaching draft review. Local only; not deployed.

### Release verification — 20 September

- User authorized deployment. Cache advanced to v32; final **347 unit tests and
  6 offline/project/AI browser checks passed**. Lint has 91 existing warnings,
  no errors; no temporary bypasses. Release outcome is tracked in GitHub Pages.
