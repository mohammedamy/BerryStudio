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

State: implemented and verified; owner approved deployment. Publication is tracked by the V6-02 pull request and Pages workflow.
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

## Next: V6-03 — Access and persistence verification

Test signed-in/trial/expired/offline behavior and project JSON save/reopen with production CSP enforced. Keep account access policy distinct from billing work. Subscription and monetization remain in Phase 7.
