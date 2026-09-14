# Plan v6 execution progress

Started: 14 September 2026. Canonical roadmap: [Plan v6](../BerryStudio-Upgrade-Plan-v6.md).

## V6-01 — Audit repair release

State: implementation and verification complete; deployment approved by the owner. The release will be published through the V6-01 pull request and GitHub Pages checks.

Base: deployed main `7cc9d0b81a27446c575c7225b8d18b79e7d1c012` (PR #52).
Branch: `codex/v6-01-audit-fixes` in `/tmp/berry-pr52-conflicts-20260914`.
The original workspace contains separate unfinished mf11 collar work and overlapping changelog edits; those have not been included or modified.

### Changes

- Authorize the exact inline import maps in root and BodyForm CSP; arbitrary inline scripts remain disallowed.
- Add translated accessible names to all 25 drafting toolbar controls and Fit view.
- Send text-only OpenAI image requests to generations and reference requests to edits; report malformed reference input consistently.
- Reject reference photos for the supplied ComfyUI text-to-image workflow rather than silently ignoring them.
- Repair eight README links and correct English/Arabic access, validator, engine and image-output descriptions.
- Refresh the service-worker cache version for the release.
- Add hash-drift guards and browser checks with CSP active, including language switching.
- Make smoke tests wait for actual app/default-pattern readiness, report startup errors, and replace the CDN fallback test's fixed delay with a readiness assertion.
- Configure the local static test server with explicit loopback binding and a larger accept backlog after observed `ERR_SOCKET_NOT_CONNECTED` / `ERR_CONNECTION_RESET` failures on module requests.
- Preserve the original audit and refresh current v6 library metrics after PR #52.

### Evidence

- Root unit tests: 329 passed.
- Cloth Lab tests: 893 passed across 34 files; Cloth source unchanged in this package.
- Root lint: 91 existing warnings, no errors; Cloth lint: 7 existing warnings, no errors.
- Browser: local BodyForm avatar visually rendered with CSP active and no observed console errors. Arabic control-label regression passed.
- Full browser verification: **21 passed in 2.0 minutes**, with the normal two-worker configuration and no retries. Earlier attempts exposed local socket resets; the final run followed the test-server and readiness fixes.
- No `TEMP-LOCAL-TEST-BYPASS` markers found in the release source.

### Current library baseline

[Reproducible output](audits/2026-09-14-library-baseline.json): 308 patterns, 2,171 pieces, 775 pieces with notches (35.7%), 359 with chest hints (16.5%), 337/499 verified cross-piece reports (67.5%). Geometry sweep: zero failures at tested defaults. This does not establish physical fit or universal construction readiness.

Release review patch in the primary workspace: `docs/v6-01-review.patch`. The isolated checkout above holds the exact tested files.

## Next: V6-02 — Mobile and RTL workspace

Implement a responsive header and collapsible inspector, preserving usable canvas space at 390px. Verify English/Arabic layout, keyboard access and essential actions without document overflow. Retain desktop interaction behavior. This package has not started.

Subscription and monetization remain in Phase 7, after product-quality and pilot gates.
