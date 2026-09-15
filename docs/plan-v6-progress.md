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

State: engineering inventory implemented and verified on `codex/v6-04-starter-inventory`; not deployed. Full maker-reviewed acceptance remains open.

- Nominated `w07` woven skirt, `w01` bodice/dress and `m01` trousers. Captured explicit authored/proposed joins, all boundary segments, garment-specific checklists, unsupported cases and construction blockers.
- Nine size cases (XS/M/XL), geometry and manifest hashes, detailed validator evidence and 305 reasoned exclusions. Historic WP-44 metrics remain separate; a fresh sweep exactly matches the baseline.
- Candidate applicability: eight of nine pieces contain notches; two of two eligible torso pieces contain chest hints. Metadata presence does not establish correctness or fit.
- A proposed trouser inseam mismatch of about 67.42 mm at M, incomplete dress assembly and a missing skirt vent keep these candidates out of production approval.
- Verification: 337 root tests pass, 91 existing lint warnings with no new warnings, deterministic report output and clean diff checks. UI and Cloth Lab were not changed.
- Review artifacts remain in the primary workspace: `docs/starter-block-inventory.md` and `docs/audits/v6-04-starter-inventory.json`. They belong to the separate V6-04 branch. All maker/sample approvals remain null; a named maker must review the concrete revisions and resolve blockers before promotion.

## V6-05 — Project revision and typed command contract

State: implemented on `codex/v6-05-project-revisions`, based on deployed V6-03 (`2ec736e`), in `/tmp/berry-v6-05-project-revisions`. Not deployed. V6-04's uncommitted inventory and the primary checkout's unrelated changes are preserved separately.

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
