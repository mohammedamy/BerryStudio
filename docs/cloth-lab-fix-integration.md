# Cloth Lab fix integration — 2026-09-07

## Scope and source

Integrated `BerryStudio-ClothLab-Fix.zip` on local branch
`codex/cloth-lab-fix-integration`, starting at
`be22e23300f0665db766ece2d671332836b0c7a3` (main).
There were no tracked working-tree changes at the start. Existing untracked
plans, artwork, settings/skills, and the ZIP were preserved and not staged.
No `AGENTS.md` was found in the repository or its parent directories.
The package README and full patch were read before applying anything.
`git apply --check` passed; the patch was applied once. `modified-files/`
was not copied over the repository.

No authentication configuration, subscription data, entitlement policy,
branding, physics solver, avatar geometry, or deployment workflow was changed.
No temporary entitlement bypass was introduced; the marker scan is clean.
No generated bundles or dependencies are included in the commit.

## Changes

- Standalone Vite assets use a relative base for custom-domain and project-path hosting.
- Initial imported patterns open Seams. Cloth, Pieces and Weld cannot select a
  demo garment while an imported pattern awaits finalization.
- The initial pattern signature excludes language, preserving finalized garments
  and in-progress seam selections on language-only updates.
- Engine switching tears down the old engine. Generation checks reject stale
  dynamic imports and readiness callbacks. Readiness synchronizes current host data.
- GLB, OBJ and USDZ export invoke live-position preparation before serialization,
  recomputing normals and bounds. GPU readback remains on demand.
- Drag cleanup clears simulation drag and the orbit-control lock.

Additional review fixes within this integration:

- Sign-out tears down Cloth Lab even when another view is visible.
- Settings changes tear down a previous engine even while Cloth Lab is hidden.
- Iframe readiness requires the active loaded frame, matching origin and entitlement.
- Lost pointer capture ends a drag; unmount releases any remaining pointer capture.
- Invalid export snapshots are rejected before partially overwriting geometry.
- Added regressions for these lifecycle cases, partial export mutation, preview
  guards, language-only seam selection preservation and drag listener cleanup.

## Exact automated results

Environment: macOS, Node **v26.7.0**, npm **11.19.0**. Node satisfies the
requested 22.12+ minimum; this run did not use Node 24.

| Command/check | Result |
| --- | --- |
| `npm ci` (root) | Passed; 66 packages installed |
| `npm ci` (cloth-lab) | Passed; 117 packages installed |
| `npm test` | 308 passed, 0 failed |
| `npm run lint` | Exit 0; 92 warnings, no errors |
| `npm --prefix cloth-lab test` | 849 passed, 0 failed; 27 files |
| `npm --prefix cloth-lab run lint` | Exit 0; 9 warnings, no errors |
| `npm --prefix cloth-lab run build` | Passed, including the requested repeated invocation and final rebuild |
| `npm --prefix cloth-lab run build:embed` | Passed, including final rebuild |
| `git diff --check` | Passed |

Lint warnings are the existing baseline counts. Standalone build retains its
large-chunk warning. npm reported unapproved optional `fsevents` install scripts;
installation and all subsequent commands above completed successfully.

### Playwright

Used the repository's `playwright.config.js`, Python static server and installed
Chromium. The initial sandbox attempt could not bind localhost; rerunning with
local-server/browser execution permission actually ran the suite.

- Initial `npm run test:e2e`: **14 passed, 5 failed**. Failures concerned Settings
  initialization, an uninitialized Canvas/API, and a cloud-sync Settings row.
- Final `CI=1 npm run test:e2e`: **exit 0; 13 passed on first attempt, 6 flaky
  tests passed on configured retries; no remaining failures** (19 total, 3.3m).
- Comparison using an untouched `git archive` of the base commit, separately
  built embedded output, and port 8794 instead of 8793:
  **exit 0; 16 first-attempt passes, 3 retry passes** (19 total, 2.4m).

The final integration's retries affected: signed-out embedded gate, Walk the
Seam, automation API, Add Point, cloud-sync roundtrip and local ONNX inference.
The baseline also exhibited timing failures, but this comparison does not prove
that every intermittent failure has the same cause. No production initialization
system or existing smoke test was rewritten to hide failures.

The existing Cloth Lab smoke test verifies the signed-out gate, **not** an
entitled running simulation. React workflow tests mock the Canvas and scene;
drag tests stub GPU readback and exercise real listener code with CPU geometry.
These are not evidence of real GPU drape or export fidelity.

## Asset and browser checks

The built standalone output was served locally under both `/cloth-lab/` and
`/BerryStudio/cloth-lab/`. All built JS/CSS chunks, HDR environment and three
fabric textures returned HTTP 200 under both paths. Both paths return 404 for
`favicon.svg`, an existing missing asset (no favicon exists in the base public
folder). That nonfunctional branding issue was left unchanged.

Read-only public checks, without publishing:

- `https://berrystudio.org/cloth-lab/`: HTML 200, but the currently deployed HTML
  still requests `/BerryStudio/cloth-lab/assets/index-Bemv6E98.js`; that URL returns
  **404** on the custom domain. The in-app browser displayed a blank page.
- `https://mohammedamy.github.io/BerryStudio/cloth-lab/`: redirects to the custom
  domain and returns HTML 200. The corresponding GitHub asset URL redirects to
  `/cloth-lab/assets/index-Bemv6E98.js` on the custom domain and returns 200.
  This does not fix the incorrect absolute URL inside the deployed HTML.
- Local corrected standalone page rendered its **Sign in** entitlement screen.
  Access was not bypassed. The existing Chrome session could not be accessed
  because macOS Accessibility/Screen Recording permissions remained pending.

The corrected files have not been deployed, so successful local path checks are
not claimed as a successful public-site rollout.

## Outstanding acceptance before merge

No accessible legitimate authenticated session was available for the patched
local build. The following user-requested acceptance checks remain **unverified**:

- Imported dress and trousers in both embedded and iframe modes.
- Seams → Simulate → Cloth, Pieces/Weld rendering, language switching after real
  seam edits, changing designs and engine switching in the authenticated UI.
- Rapid navigation during loading and sign-out during pending load in a real
  browser (covered only by unit-level lifecycle checks where stated above).
- Exporting visibly GPU-deformed cloth as GLB/OBJ/USDZ, reopening files and
  comparing their coordinates to the displayed drape.
- Real pointer cancellation restoring camera controls (CPU listener regressions
  pass); complete mobile Cloth Lab layout and Apple Quick Look on a real device.

Physics stability, moving-avatar collisions and export-material compatibility
remain outside this targeted patch's claimed coverage.

The reviewed branch is committed locally. Main is deliberately not merged until
these required acceptance checks are completed or their deferral is explicitly
agreed. Nothing was pushed, no PR was opened, and no deployment was triggered.
