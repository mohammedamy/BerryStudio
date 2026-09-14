# BerryStudio site audit — 9 September 2026

Reviewed live site: https://berrystudio.org/. Source baseline: `d8a41f202608c58067b9f7c3fabf3d8774810914` (main after PR #55). The repairs listed here are in the local working tree; this audit does not claim they have been deployed. The earlier folded-neckline fix was deployed and its live source/bundle matched the checkout.

## Scope and method

Inspected the public root workspace, size/measurement UI, toolbar, 3D preview, settings, AI entry, embedded/standalone Cloth Lab access, BodyForm, and documentation using the browser. Examined desktop and 390 × 844 mobile layout, English/Arabic controls, DOM/accessibility names, and console output. Read implementation and existing tests for AI providers, pattern generation/fusion, validation, pattern import, guided construction, exports and deployment. Reviewed original PDF, v3, v3.2, Plan 4 and v5 against current source.

A same-origin link scan extracted href/src references from the local root/public/documentation HTML and issued HEAD requests against their production URLs: 48 unique URLs, 47 HTTP 200, one HTTP 404. This is a route/asset reference scan, not a recursive crawl of every dynamically created URL. Raw baseline: [live-links.json](2026-09-09-live-links.json). A 200 status does not prove that a page's JavaScript works.

No authenticated account, payment flow, paid AI call, physical iOS device, or Firefox/Safari runtime was used. Signed-out gates prevented end-to-end AI and Cloth Lab editing. Existing tests and source inspection are distinguished from live interaction below. No claim is made that every pattern has been fitted or physically sewn.

## Findings and disposition

| ID / severity | Evidence | Disposition |
|---|---|---|
| A01 — High, BodyForm blank | Live console: `Failed to resolve module specifier "react"`; avatar preview did not mount. Inline import maps lacked CSP authorization in root and BodyForm. | Fixed locally: exact SHA-256 hash in each script-src policy; no broad unsafe-inline allowance. Local BodyForm visually renders avatar with real policy. New hash-drift tests and CSP-active browser regression pass. |
| A02 — Medium, mobile layout | At 390 × 844, root document width was 791px; header controls extended offscreen and fixed inspector consumed most canvas width. | Planned V6-02. Requires responsive inspector/header design and interaction testing, not an isolated CSS guess. |
| A03 — Medium, inaccessible tool names | 25 drafting toolbar icon buttons had no accessible names. Fit view also needed a translated accessible label. | Fixed locally in `js/app.js` and `index.html`; labels verified in English and Arabic browser accessibility output. Broader keyboard/contrast audit remains open. |
| A04 — Medium, text-only image request | OpenAI adapter sent requests without references to `/images/edits`. | Fixed locally: JSON `/images/generations` without references; multipart edits with references. Contract regression tests pass; no billed provider request made. |
| A05 — Medium, ignored reference images | ComfyUI adapter's text-to-image graph ignored `images`, even when supplied. | Fixed locally: unsupported references return a clear error before network submission. Actual img2img graph support is Phase 3. |
| A06 — Low, unstructured invalid input error | Invalid data URL could throw before the OpenAI adapter's try/catch. | Fixed locally: malformed reference produces structured error without a request; regression test passes. |
| A07 — Low, broken documentation links | `/README.md` returned 404 and appeared in eight links across four doc pages. | Fixed locally: link to public repository README. Baseline JSON intentionally preserves the original failure. |
| A08 — Medium, misleading access documentation | Quickstart/FAQ promised everything offline without sign-in; live AI/Cloth gates require account/trial access. | Corrected EN/AR copy to describe feature-specific access and cached-asset limitations. Access policy and signed-in/offline matrix remain Phase 0 decisions/tests. |
| A09 — Low, stale settings and AI claims | Engine explanation called Iframe the default and Embedded experimental; Billboard claimed measured pattern creation and proxy-only setup. | Corrected EN/AR explanations to match default and describe image output as illustration needing calibration/review. |
| A10 — Medium, stale validation explanation | FAQ said library had no explicit seam pairing; current sweep reports 313 verified pairs. | Corrected EN/AR to distinguish explicit roles, heuristic fallback and unverified checks; removed stale claim of current known Fancy failures. |
| A11 — Medium, test blind spot | General Playwright config sets `bypassCSP: true`, so it could miss A01. | Added dedicated `e2e/csp.spec.js` with `bypassCSP: false`; wider suite still bypasses policy, tracked under V6-03. |
| A12 — Low, Three.js warnings | Root logged multiple Three.js imports plus deprecated RGBELoader/shadow APIs. Local repaired BodyForm logged deprecated Clock/shadow APIs. | Dependency/consolidation cleanup planned in Phase 0/5; tested preview rendered. Not relabeled as fatal errors. |
| A13 — Medium, retry weakness | `js/body-page.js` records the payload before mount; failure resets the load promise but not the payload dedupe key. An unchanged Generate action may not retry. | Follow-up Phase 0 loading/retry work; add visible error/retry state with a controlled failure test. |
| A14 — Medium, incomplete RTL product experience | Arabic outer BodyForm controls coexist with English controls in embedded viewer. | Extend EN/AR acceptance beyond root translations in Phase 0/6. |

## AI product and construction review

These are source-backed gaps and product findings, not results from paid provider evaluation.

| Area | Current behavior / limitation | Required improvement |
|---|---|---|
| Text-to-text | Guided generation and provider settings exist; no persistent project-bound design conversation | Versioned brief, conversation, source-grounded construction advice, locks, diff proposals and undo |
| Image-to-image | Provider adapters and Billboard exist; no full mask/revision/compare studio; Billboard prompt hardcodes female model and hoodie/fleece details | Category-aware prompts, capability gating, reference preservation, targeted edits and revision history |
| Text/images to pattern | Spec validation and geometry pipeline exist; pixel heuristic fusion supplements interpretation | Explicit provenance and conflict priority; calibration/hidden-construction decisions; reviewed block retrieval and bounded drafting programs |
| Mutation safety | Generation can replace current canvas pieces directly | Preview/accept/reject transaction, stable IDs, undo and project history |
| Pattern illustration vs draft | Generated imagery can imply dimensions/construction it does not establish | Separate concept, editable draft, validated and sample-approved statuses |
| Simulation | Guided Pieces → Joins → Simulate and supported boundary-dart handling exist | Extend unsupported dart/accessory cases, actual GPU/device acceptance and physical fit evidence |
| Library | Many patterns pass geometry checks but lack notch/measurement/pairing metadata | Reviewed authoring inventory, applicable-metric denominators and hard gates after coverage work |

Important source references: `js/image-providers.js`, `js/billboard.js`, `js/ai-spec-pipeline.js`, `js/ai-fusion.js`, `js/app.js`, `js/validate.js`, `cloth-lab/src/workflow/patternPlan.js`, `cloth-lab/src/pattern/importFromApp.js`, and `cloth-lab/src/cloth/ClothSimulation.js`.

## Reproducible library baseline

Run `node scripts/audit-library.mjs`. Recorded output: [library-baseline.json](2026-09-09-library-baseline.json).

- All 308 registered patterns, 2,171 pieces, international size M with each entry's category.
- 326 pieces with notches (15.0%); 112 with chest-edge hints (5.2%). Absence of a chest hint is not automatically a defect in an accessory or lower-body piece.
- 313 verified, 105 heuristic and 81 unmatched cross-piece reports. Verified fraction: 313/499 = 62.7%.
- 9,512 pass, 2,341 warn, zero fail and 2,171 deferred check results. The sweep calls `run(pieces)` without body measurements, matching the existing test; all ease results are therefore deferred in that run. Chest-hint coverage is a separate metadata measure, not an actual fitted-ease pass rate.
- Zero hard failures at these defaults is not zero defects across grading, simulation, fabric behavior or physical fit.

Plan 4/5 targets (80% notch coverage, at most 20% deferred ease, 95% verified pairing) are retained in v6 with an explicit eligibility review. Do not add irrelevant metadata to make legacy ratios green.

## Verification completed

| Check | Result |
|---|---|
| `npm test` after repair batch | **315 passed**, zero failed (baseline 310 plus 5 regressions) |
| `npm run lint` | Passed; 92 existing warnings, no errors |
| `npx playwright test e2e/csp.spec.js` | **1 passed**; real CSP, BodyForm embedded canvas visible |
| Browser visual confirmation | Local BodyForm avatar rendered; no React module-resolution or CSP errors in observed logs |
| Root toolbar localization | EN/AR accessible names confirmed locally |
| Cloth Lab test baseline during audit | **893 passed** across 34 files; no Cloth source changed in this repair batch |
| Earlier production verification | Prior PR #55 deployment checked against local root source and embedded bundle |
| Whitespace validation | `git diff --check` passed |

No new production deployment is claimed for this batch. No new Cloth build is needed for these edits: the CSP and root/docs/provider files are served directly; the embedded bundle is unchanged. Broad authenticated, cross-browser, physical device and real-provider acceptance remains explicit work in the roadmap.

## Resulting plan

[BerryStudio Upgrade Plan v6](../../BerryStudio-Upgrade-Plan-v6.md) includes every v5 WP with current disposition and evidence, phases for reliability, shared project state, conversational AI, image editing, multimodal pattern drafting, production confidence, professional pilot, and **subscription/monetization last**. Its numerical quality, acceptance, retention and margin goals are proposed decision gates, not claims of observed performance.

Technical references consulted: [MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP), [MDN import maps](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap), and [OpenAI Images API](https://developers.openai.com/api/reference/resources/images).
