# Plan v7 verification — 2026-11-22

Supersedes as the latest automated checkpoint (preserving `docs/plan-v7-evidence-2026-09-27.md` as the historical baseline record).

## Resolved automated & browser evidence

| Area | Result | Evidence |
| --- | --- | --- |
| Root static quality (`npm run lint`) | Passed | `oxlint js` exited `0` (pre-existing warnings only, zero errors). |
| Root test suite (`npm test`) | Resolved (`500 / 500` passed) | `node --test`: `500` passed, `0` failed, including 340 library patterns × `8,700` graded instances (`intl`/`egypt`/`saudi`, `0` fails, `0` warnings) and DXF/PDF/SVG/HPGL calibration & round-trip checks (`test/pattern-export.test.js`). |
| 4-family configurator & drafting sweep | Resolved (`440` blocks passed) | Validated all `44` catalog mannequins (`XXS–6XL` across 4 categories) for `woven-a-line-skirt` (`132`), `woven-basic-bodice` (`44`), `woven-basic-dress` (`132`), and `woven-basic-trousers` (`132`) with `0` fails, `0` warnings, and `<= 1e-6 mm` declared seam parity. |
| P7-05 4-family construction packets & readiness | Resolved | `construction-acceptance.js`, `construction-packet.js`, `construction-evidence-record.js`, and in-app Export modal classify all 4 families accurately, render `readinessStage` (`unsupported`, `draft`, `geometry-checked`, `maker-reviewed`, `sample-approved`) and ordered construction handoff steps, and keep `productionEligible: false` and maker/sample approvals `null`. |
| P7-07 bilingual brief & P7-09 reconciliation | Resolved | `evaluation/p7-07/corpus.json` (`13` EN/AR cases across all 4 families plus `inseam` capture and lock protection) and `test/multimodal-proposal.test.js` (`5/5` passed, including `women_xxs` and `men_6xl` reference reconciliation with explicit unresolved back-view/scale flags). |
| Cloth Lab static & simulation suite | Resolved (`45` files, `992 / 992` tests passed) | `cd cloth-lab && npm run lint` exited `0`; `vitest` passed `45/45` files (`992/992` tests), including `src/body/mannequinCatalog24.test.js` (`5/5`), `src/body/zeroPenetration320.test.js` (`1/1`), and `src/pattern/importFromApp.trousersProgram.test.js` (`5/5`). |
| Playwright E2E (root & Cloth Lab) | Resolved (`68 + 5` passed) | Root Playwright Chromium suite passed `68` tests (including `e2e/construction-evidence.spec.js` and `e2e/pattern-program.spec.js` across skirt, bodice, dress, and trousers) and Cloth Lab Playwright suite passed `5` tests. Offline precache updated to `berrystudio-v95`. |

## Pending external evidence & gates (cannot be closed by synthetic tests)

| Area | Status | Required external evidence |
| --- | --- | --- |
| Physical iOS Quick Look / USDZ | Pending | Open a generated USDZ export on a physical iPhone or iPad in Quick Look and record device model, iOS version, scale/orientation, material rendering, and screenshot/video. |
| P7-10 human designer & maker pilot | Pending | Run moderated sessions with `8–12` working designers/makers under `evaluation/p7-10/protocol.md`, measuring completion rate, median time reduction, critical defects, EN/AR parity, and separate maker/sample verdicts (`evaluation/p7-10/private/`). |
| Physical maker & sewn-sample approvals | Pending | Collect independent pattern-maker reviews and sewn-sample fit assessments on real physical fabric for `woven-a-line-skirt`, `woven-basic-bodice`, `woven-basic-dress`, and `woven-basic-trousers`. |
| P7-11 subscription & billing | Deferred by Plan 7 | Remains gated behind P7-01 through P7-10 pilot evidence and owner approval of unit economics, pricing, and webhook backend. |
