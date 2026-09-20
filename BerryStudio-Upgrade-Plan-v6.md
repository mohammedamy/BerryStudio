# BerryStudio v6 — AI fashion design to verified patterns

Decision baseline: 9 September 2026. Execution started: 14 September 2026. V6-01, V6-02, V6-03, V6-05 and V6-06's engineering foundation are deployed through PRs #56–60. V6-04's maker review and V6-06's maker acceptance, calibrated real references and multi-view/provider evaluation remain open. V6-07's local saved-brief foundation is in development; full conversational-copilot acceptance is not claimed. See [execution progress](docs/plan-v6-progress.md). Subscription and monetization are the final phase, by owner instruction. This document consolidates the original upgrade plan, v3, v3.2, Plan 4, and **Plan 5**; historical documents remain evidence rather than competing execution queues.

## 1. Product direction

Build a bilingual fashion design workspace where a designer can describe a garment, develop it through conversation and reference images, turn the approved design into editable measured pattern pieces, and carry those pieces through construction review, fit, and export.

The differentiator should be continuity and trust: every generated piece remains connected to the design brief, measurements, construction choices, and revision history. A beautiful image is a concept; a parametric draft is editable geometry; a validated pattern has documented checks; a sample-approved pattern has actual making and fit evidence. Never display those states as interchangeable.

“Best in fashion design” is an ambition, not a claim the current site can substantiate. Demonstrate it first for a focused set of garment families and real designers, then expand the catalog.

### Intended users and core journeys

| User | Job | Successful result |
|---|---|---|
| Independent designer | Develop a collection from a brief and references | Consistent looks, controlled variations, retained design intent |
| Pattern maker / atelier | Convert an approved concept to construction | Editable pieces, explicit joins, measurements, allowances, and unresolved decisions |
| Fashion student | Learn why a design changes a pattern | Bilingual explanations tied to visible geometry, undo, and understandable checks |
| Small fashion team | Review a design before sampling | Versioned approvals, reproducible exports, and a usable handoff |

First supported production families: a simple woven skirt, basic bodice/dress, and simple trousers. Choose stretchwear and structured underwear only after fabric behavior, negative ease, support, and specialist review have acceptance coverage. Keep other library designs available with honest readiness states.

## 2. Audit findings and current execution baseline

The detailed evidence and limits are in [the site audit](docs/audits/2026-09-09-site-audit.md).

- Public app, BodyForm, documentation, AI and Cloth Lab entry points were inspected. Signed-in and paid provider workflows were not exercised.
- Live BodyForm failed to resolve React because its import map was blocked by CSP. A narrow hash authorization now renders the local avatar with CSP enforced.
- The root drafting toolbar had 25 unnamed icon buttons; labels now follow the selected language. The Fit view control also has a translated accessible name.
- Mobile at 390 × 844 had document width 791 pixels. The header and fixed inspector need a deliberate responsive layout.
- Eight documentation links pointed to a README URL that returned 404. Documentation also overstated offline/no-account access.
- Text-only OpenAI image requests used the edits endpoint; ComfyUI accepted reference images that its supplied workflow ignored. The local repair routes text-only requests to generations and rejects unsupported ComfyUI reference input.
- The current AI UI is a guided generator and import flow, not a persistent design conversation or an image editing studio.
- The current pattern sweep covers 308 patterns / 2,171 pieces. It reports zero hard failures at the tested defaults, but missing metadata and heuristic matches remain substantial. This is not evidence that all 308 garments are sewable or correctly simulated.

### Measured library baseline and target interpretation — refreshed 14 September

| Metric | Current baseline | Required next step |
|---|---:|---|
| Pieces with notches | 775 / 2,171 = 35.7% | Preserve Plan 4/5's ≥80% legacy goal; also audit which pieces actually require notches |
| Pieces with chest-edge hints | 359 / 2,171 = 16.5% | Keep historical series; distinguish missing applicable metadata from legitimately non-chest pieces |
| Legacy chest-hint absence | 83.5% | Plan 4/5 calls for ≤20% deferred; correct denominator before using this as a fit-quality gate |
| Verified cross-piece pairs | 337 / 499 = 67.5% | Reach ≥95% explicit verified pairing for the relevant authored population |
| Heuristic / unmatched pairs | 81 / 81 | Replace guessing with authored intent; intentional free edges must be declared |
| Validator result counts | 9,513 pass / 2,340 warn / 0 fail / 2,171 deferred | Results count checks, not garments; ease is deferred here because no body measurements are passed to the validator |

The sweep calls `run(pieces)` without body measurements; its 2,171 deferred checks are not the same metric as chest-hint absence. See the reproducible audit for scope.

The refreshed [14 September baseline](docs/audits/2026-09-14-library-baseline.json) includes PR #52. The original 9 September audit is retained as a historical snapshot.

Do not meet targets by adding meaningless notches, invented chest hints, or changing the denominator without review. Record both legacy counts and the new applicability-based counts. Freeze a reviewed eligibility manifest and show exclusions with reasons.

## 3. Plan 5 reconciliation — no open item lost

Plan 5 is [BerryStudio-Upgrade-Plan-v5.md](BerryStudio-Upgrade-Plan-v5.md). Its early status table and later updates disagree on some items. The classifications below use current source and tests, not that table alone. Original WP numbers are retained with their subject because older histories reuse some numbers.

| Plan 5 item | Current assessment | v6 disposition / evidence |
|---|---|---|
| WP-30 — Apple Quick Look | Physical iOS acceptance still unverified | Phase 5 device gate; test exported USDZ on actual hardware, record device/OS, scale/orientation/materials |
| WP-35b — GPU spatial hash | Implemented, including bitonic sorting and high-quality opt-in path | Preserve `cloth-lab/src/cloth/ClothSimulation.js`; Phase 5 profiles dense collisions, bucket limits, and device stability rather than rebuilding it |
| WP-42C — billing | Accounts/trial stages A+B exist; real billing remains deferred | **Phase 7 only**; provider choice is a later decision, not a prerequisite to AI development |
| WP-43 — accessory seams | Partly complete; recent mf05 band and wf09 collar/stand fixes shipped | Phase 1 authors construction metadata; Phase 5 verifies collars, stands, lapels, waistbands, bra components, and other accessories. mf11 remains open; do not label a whole category done from one example |
| WP-44 — notch/ease/pairing | Open; PR #52 improved notch/chest-hint/pairing coverage; refreshed baseline above | Phase 1 starts reviewed blocks and authoring inventory; Phase 5 closes broader coverage gates |
| WP-45 — verification sweep | Partial; library importer/assembly and API/export tests exist | Phase 0 establishes real-CSP/browser coverage; Phase 5 adds authenticated end-to-end, project JSON round-trip, actual GPU drape and device results. Import tests do not prove drape quality |
| WP-66 — underwear sweep | Done | Keep all 44 underwear patterns in `test/validate-library.test.js` and CI |
| WP-67 — numeric gates | Open for final target percentages | Ratchet current achieved floors now where useful; activate final coverage assertions after WP-44 meets them, with a deliberate regression test |
| WP-68 — CI lint | Done | Preserve `.github/workflows/deploy-pages.yml` checks; reduce existing warnings when touching affected code |
| WP-69 — sewn darts | Partial, not “never implemented” | `cloth-lab/src/workflow/patternPlan.js` handles supported boundary darts on a straight edge. Phase 5 extends internal, curved-edge and endpoint cases; unsupported geometry must remain explicit |
| WP-70 — male torso asymmetry | Done | Preserve geometry/collision tests; later fit work must calibrate measurements rather than repeat cosmetic sculpting |
| WP-71 — close-out workflow | Skill exists | Use the repository close-out process for completed WPs; this is process, not a customer feature |
| Default avatar GLB assets | Deferred pending replacement assets | Keep procedural fallback; assess new assets separately when provided, with measurement/collision validation |

Earlier plans are retained as follows: original foundations, AI adapters, 3D unification, professional drafting/export, accessibility and optional sync remain the backbone. v3/v3.2's seam and avatar work is preserved. Plan 4's authoring gates become measurable quality work, not a redesign of the catalog from scratch. WP-38's [draft-program design note](docs/draft-program-design-note.md) supplies a seed for bounded drafting operations; it is not treated as an already shipped full program engine. The [guided Cloth Lab workspace](docs/cloth-lab-guided-workspace.md) already provides Pieces → Joins → Simulate and should be extended.

## 4. Architecture and design rules

### One project, three connected AI workflows

A project stores a versioned brief, body measurements with units and source, fabric intent, references and usage rights, conversation, concept images, selected pattern revision, construction graph, validation reports and exports. Assets have stable IDs. Autosave and file export are recoverable; migrations must round-trip supported project versions.

Use a shared command layer for human and AI edits. Model output proposes typed changes, validation checks them, and the user sees the affected pieces before accepting. Every accepted change supports undo. Locks preserve dimensions, silhouette, fabric, or seam choices across regeneration. Never silently replace the active pattern with a new generation.

A capability registry distinguishes text reasoning, vision, image generation, image editing, masks and local-only workflows. Unsupported inputs are rejected before a request. Provider credentials stay out of prompts, exports and logs. Configure/test providers clearly, handle cancellation and timeouts, and keep jobs recoverable without duplicate paid calls. Execution budgets are reliability controls from the start; subscription design waits until Phase 7.

### Text-to-text: fashion design copilot

Persistent Arabic/English conversation should develop silhouette, occasion, fit, material, construction, color, and collection intent. The assistant asks only for material missing decisions, summarizes assumptions, and proposes alternatives with tradeoffs. It retrieves reviewed internal pattern and construction knowledge and links its advice to that source. It must distinguish supplied measurements from suggestions.

Example: “Make this jacket more relaxed, keep the shoulder width and collar.” The result is a proposed change set with locked values preserved, visible ease changes, affected pieces, and a reason—not a disconnected paragraph or a complete replacement garment.

### Image-to-image: controlled visual development

Support text-only concept creation, reference-guided variations, multi-view boards, masks for local edits, and adjustable preservation of silhouette/material/color. Keep original assets and a branching revision history. Show which references were used and what each contributes. Remove the current hardcoded female-model/grey-hoodie assumptions before broadening the tool.

A photorealistic image may show details that are absent from the pattern. Compare image and draft side by side; describe the image as illustrative unless the construction is actually represented. User approval selects a concept for pattern drafting.

### Text and images to patterns: constrained construction

Pipeline: inputs → structured garment brief → reference/measurement reconciliation → reviewed block retrieval → bounded parametric operations → geometry + construction graph → validation → previewed revision → accepted project state.

Visible details may be inferred from an image, but absolute scale, hidden seams, back construction, fabric mechanics and fit cannot be assumed known. Ask for a known dimension or measurements, additional views where needed, and show unresolved choices. User-supplied dimensions and explicit locks take priority; ambiguous vision results remain proposals. Record source per field (user, measured, inferred, default) and conflicts.

Generate programs from a typed allowlist, never arbitrary model JavaScript. Extend the existing drafting primitives with reviewed offsets/intersections and deterministic composition, bounded execution and clear failure states. Validate units, ranges, closed outlines, intersections, stitch-line lengths, seam allowance, grainline, notches, cut quantities/fold, darts and grading. Sewing tolerance must be family/fabric specific; eased seams need declared intent rather than forced equality.

Keep three distinct outputs: visual concept, editable draft needing review, and validated/sample-approved revision. Expert approval attaches to a particular revision and is invalidated by relevant changes.

## 5. Delivery phases and exit gates

Effort bands below are planning estimates in engineer-weeks, not elapsed-time promises. They assume experienced frontend/geometry work plus a pattern maker available for weekly reviews. They must be re-estimated after a technical spike and pilot interviews. Some Phase 1 and 5 library work can proceed alongside AI work; dependencies, not numbering alone, govern execution.

| Phase | Priority / estimated effort | Scope | Exit evidence |
|---|---|---|---|
| **0 — Reliability and truthful UX** | P0; 1–2 engineer-weeks | Ship verified audit repairs; real-CSP smoke; reproducible audit manifest; mobile header/inspector; clear loading/retry/provider errors; access documentation; EN/AR and keyboard pass | Root and BodyForm boot with CSP active; no blocking console errors on tested routes; 390px has no document overflow; critical controls named/reachable; known access limitations documented |
| **1 — Shared project and trusted blocks** | P0; 3–5 | Project schema/migrations, asset IDs, revisions/undo, measurement provenance, command preview; select reviewed starter blocks; explicit construction graph and WP-44 inventory | Save/reopen preserves all supported project data; accepted/rejected AI proposals are reversible; initial families have maker-reviewed joins/notches/measurements and defined unsupported cases |
| **2 — Conversational design copilot** | P1; 3–5 | Persistent bilingual conversation, brief extraction, design alternatives, grounded construction advice, locks, diff preview and reusable briefs | Benchmark task success ≥90%; no silent changes to locked dimensions; every accepted geometry change passes deterministic checks; uncertainty and unsupported requests handled |
| **3 — Image design studio** | P1; 3–5 | txt→image and image→image, capability-aware adapters, masks where supported, reference controls, comparison/version history, category-aware prompts | Test generation/edit paths per supported provider; cancellation/retry preserves project; ≥80% expert acceptance on a fixed reference-preservation benchmark; unsupported features disabled with explanation |
| **4 — Multimodal pattern drafting** | P0 differentiator; 6–10 | Text + one/multiple images → reviewed blocks/programs; calibrated scale, construction choices, targeted edits, validation/repair proposal and pattern preview | All published benchmark outputs have valid schema/units; ≥95% of supported-family tasks yield geometry passing mandatory checks or a clear abstention; independent makers accept ≥80% without major reconstruction; abstentions and failures reported separately |
| **5 — Production and simulation confidence** | P0 quality; 6–10, with early block work in Phase 1 | WP-43/44/67/69, actual drape, graded fit, material presets/calibration, industrial export/round-trip, nesting, performance, WP-30/35b/45 | Close authoring gates with reviewed denominators; no silently dropped pieces/darts/joins; sampled sewn garments and graded sizes approved by maker; browser/device and export matrix complete for advertised support |
| **6 — Professional pilot and refinement** | P1; 3–5 plus 4–6 weeks of pilot observation | Recruit 8–12 designers/makers; collection workflow, review annotations, handoff, onboarding/docs, accessibility and performance; optional collaboration only when pilot need is clear | ≥80% complete concept→reviewed export unaided; ≥30% median time saving vs their baseline; ≥60% weekly active in last 4 pilot weeks; no unresolved critical data-loss defects; results reported with sample size |
| **7 — Subscription and business model — LAST** | P2 until prior gates; 2–4 after decisions | Evidence-based tiers, metering, billing, account entitlement migration, renewal/cancellation/support, launch economics | Provider approved; measured contribution margin supports pricing; billing lifecycle and entitlement tests pass; transparent usage/refunds/cancellation; owner approves launch offering |

Targets are proposed acceptance thresholds, not measured current performance. Phase 4's 95% does not mean 95% garment fit accuracy. Count requested tasks, valid drafts, abstentions and maker approvals separately so refusing difficult tasks cannot inflate success.

### Phase 5 construction acceptance detail

- For collars, stands, lapels, bands, facings, cups and gussets: every relevant edge is either assigned to a named construction join or explicitly free/hemmed; verify stitch-line correspondence and directed endpoints. Use mf11 as a tracked unresolved example, not a template for guessed pairing.
- Darts: analytical fixtures first, then real garment cases for straight boundary, curved boundary, internal and interacting darts. Check actual mesh topology and sewn volume, not just presence in imported JSON.
- Drape: compare stable actual GPU results with fixtures across advertised browsers/hardware; inspect collision, penetration, material response and high-density limits. Distinguish simulation approximation from fit certification.
- Exports: preserve millimeter/centimeter scale, seam allowance, grainline, notches and labels. Re-import supported editable formats; externally inspect PDF calibration square, DXF/HPGL units, SVG dimensions, and USDZ on a physical Apple device. JSON must preserve the whole supported project, not just current pieces.
- Library promotion: validate defaults and a documented size/body-shape matrix. Keep unsupported or unreviewed catalog entries marked as such.

## 6. Benchmark, risks and measurement

Build a versioned evaluation set before choosing “the best model”: initially 60 briefs across the three supported families, balanced Arabic/English, including measurement conflicts, missing back views, extreme-but-valid sizes and invalid requests. Hold out at least 20 from prompt tuning. Add image reference pairs with permission and maker-reviewed expected construction choices. Do not claim research-dataset performance transfers directly to the product.

Track completion, time to accepted draft, number of corrections, lock violations, wrong/missing pieces, invalid joins, abstention, geometry failures, maker acceptance, fit outcomes, latency and provider cost per accepted result. Report by family, language, input type and device. Collect product telemetry only with a clear policy; user designs and body measurements are not default analytics payloads.

| Risk | Response / accountable role |
|---|---|
| Attractive images conceal unmakeable construction | Pattern lead owns readiness labels, maker review and sewn sample gate |
| Photo scale/back/fit are underdetermined | AI + pattern leads require provenance, calibration, unresolved-choice UI and abstention |
| New AI edits destroy user work | Frontend lead owns transactional proposals, locks, undo and project round-trip tests |
| Large library creates false breadth | Product + pattern leads launch reviewed families first and maintain readiness inventory |
| Simulation “looks right” but dimensions are wrong | Geometry lead validates measurements, materials, collision and sample fit independently |
| Provider failures/cost/feature drift | AI lead owns capability contract tests, job IDs, timeouts and cost ceilings |
| Rights/privacy uncertainty in references and datasets | Product lead records permitted use and reviews licensing before adoption |
| Accessibility/RTL/mobile regressions | Frontend/design leads include EN/AR keyboard and viewport checks in release acceptance |

## 7. Competitive direction and research inputs

These are current vendor/research descriptions consulted for positioning, not independent product-quality rankings.

- [CLO AI Studio](https://support.clo3d.com/hc/en-us/articles/49988591822873-AI-Studio) supports the expectation that AI belongs inside a garment workflow. BerryStudio should compete on continuity from approved concept to editable construction, not image generation alone.
- [Browzwear AI in Stylezone](https://help.browzwear.com/en/articles/13065802-ai-in-stylezone-tools-trust-creative-control) emphasizes references and creative control. Preserve intent, versions and targeted edits as baseline expectations.
- [GarmentCode](https://arxiv.org/abs/2306.03642) and [GarmentCodeData](https://arxiv.org/abs/2405.17609) provide research directions for parametric programs and pattern/drape data. Evaluate licensing, category coverage and integration cost before adoption.
- [SewFormer](https://arxiv.org/abs/2311.04218) demonstrates single-image sewing-pattern reconstruction research. Treat it as a benchmark candidate; hidden construction and real-world fit still require product-level validation.

Recommended position: **Arabic/English design-to-pattern continuity, transparent measurement provenance, editable construction and evidence of making.** Validate this position with pilot users rather than assuming it wins against mature 3D suites.

## 8. Final-phase subscription and money model

Do no new checkout, payment-provider integration, pricing experiments, paid-tier expansion or marketing paywalls before Phases 0–6 have produced quality and usage evidence. Existing auth is infrastructure; existing trial restrictions should be reviewed for pilot access in Phase 0 without confusing access repair with billing work.

At Phase 7, evaluate these hypotheses:

| Offering hypothesis | Value to test | Cost control |
|---|---|---|
| Starter / learning | Local drafting, sample projects and limited trial of AI | Finite hosted AI allowance; no promise of unlimited expensive compute |
| Independent designer | Monthly workspace with a measured AI allowance, history and professional outputs | Transparent units, explicit overage/top-up choice, spend cap |
| Studio | Seats, shared libraries, review/approval and team administration | Pooled allowance and seat economics only if team demand is proven |
| Bring your own provider | User-configured provider where feasible | Separate software value from provider charges; clear responsibility and capabilities |

Do not select prices yet. Measure revenue requirements from observed use: net subscription receipts minus AI inference, image storage/transfer, hosted services, support and payment costs. Compare light, median and heavy usage; require sustainable margin under realistic retries and failed generations. A suggested decision target is ≥70% gross margin at the median and non-negative contribution for the defined heavy-use cap, subject to actual data.

Decide billing provider, launch geography/currency, taxes and refund policy only at this phase with the owner. Implement a server-authoritative entitlement model with verified webhooks, idempotency, cancellation, renewal failure, restore and export/access policy tests. Reuse the existing account foundation and migrate trial states deliberately. No payment-card handling in the static client.

## 9. First execution queue

Use `V6-xx` identifiers to avoid historic WP number collisions. Owners below are roles to assign, not people already staffed.

| Order / ID | Deliverable | Owner / size | Dependency and acceptance |
|---|---|---|---|
| 1 — V6-01 | Review and release the audit repair batch | Frontend / S | CSP-active BodyForm, provider regressions, translated labels, links and truthful docs verified |
| 2 — V6-02 | Mobile/RTL workspace layout | Design + frontend / M | Root header and inspector work at 390px; no offscreen essential actions; canvas remains usable |
| 3 — V6-03 | Real-browser access and project persistence matrix | QA + frontend / M | Signed-in/trial/expired/offline states and JSON round-trip tested without disabling CSP |
| 4 — V6-04 | Reviewed starter-block inventory and applicability manifest | Pattern lead / M | WP-44 baseline, explicit joins and garment-specific checklist for three families |
| 5 — V6-05 | Project revision and typed command contract | Frontend + geometry / L | Schema migration, undo, preview/accept/reject, locks; no silent replacement |
| 6 — V6-06 | Evaluation corpus and maker rubric | Product + pattern + AI / M | 60 tasks, held-out cases, permitted references, scored baseline and failure taxonomy |
| 7 — V6-07 | Bilingual conversational brief → proposal | AI + frontend / L | V6-05/06; Phase 2 gates |
| 8 — V6-08 | Capability-aware image studio | AI + design / L | V6-05/06; remove hardcoded garment assumptions; Phase 3 gates |
| 9 — V6-09 | Typed pattern-program vertical slice | Geometry + AI + pattern / L | V6-04/05/06; one family end-to-end before three-family expansion |
| 10 — V6-10 | Construction/fit acceptance expansion | Geometry + pattern + QA / L | Continue WP-43/44/67/69 and physical verification; feeds Phase 5 |

S: roughly 1–3 engineering days; M: roughly 1–2 weeks; L: split into testable work packages before commitment. Pattern review and pilot observation are additional dependencies. Billing stays outside this first queue.

## 10. Definition of complete

A work package includes its behavior change, evidence, supported scope, remaining limitations, regression coverage where meaningful, and updated roadmap status. “Implemented,” “tested locally,” “deployed,” “verified live,” and “sample-approved” are separate claims. Phase advancement requires its exit evidence; it does not require claiming that every future garment type is solved.
