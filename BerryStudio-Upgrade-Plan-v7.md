# BerryStudio — Upgrade Plan 7

## From visual idea to a transparent, made-to-measure pattern

**Status:** proposed execution roadmap  
**Date:** 21 September 2026  
**Supersedes for future planning:** the unfinished work in Plans v3, v3.2, v4, v5, and v6. Those documents remain the historical record of their releases and investigations.

## 1. Product decision

BerryStudio will become an Arabic/English workspace where a designer can turn a written brief and permitted reference images into an editable, made-to-measure pattern project. The designer must be able to inspect and change the brief, body measurements, design choices, pattern geometry, construction joins, validation results, 3D preview, and exports.

Sewist is the useful benchmark for the core flow: parametric garments, personalized measurements, visual review, and downloadable pattern files. Its public product description includes 2D/3D CAD, templates, PDF/SVG/DXF export, yardage estimation, and technical flats. BerryStudio will not copy its catalogue or interface. It will differentiate through bilingual AI assistance, source-aware decisions, editable geometry, revision history, construction evidence, and explicit limits on what 3D or AI can prove.

## 2. Truthful status and carry-forward inventory

This table is the authoritative planning interpretation of older work. A checkmark means the mechanism exists or was released; it does **not** mean physical fit or production readiness unless the last column says so.

| Earlier item | Current interpretation | Carry-forward action |
| --- | --- | --- |
| v3.2 WP-30 USDZ Quick Look | Still an external-device acceptance gap | Test a real exported garment on iPhone/iPad and record device, OS, scale, orientation and materials. |
| v3.2 WP-35b high-quality self-collision | Implementation exists; advertised device stability is not established | Profile dense garments and collisions on the supported-device matrix; retain a safe fallback. |
| v3.2 WP-42C billing | Deferred by design | Do not build checkout or pricing until Plan 7’s final phase. |
| v3.2 WP-43 accessory joins | Partially addressed in selected garments | Author and verify collars, bands, lapels, waistbands, bras, hoods, capes and other accessories by named seam edge. |
| v3.2 WP-44 / WP-67 library quality gates | Incomplete authoring-scale work | Raise reviewed coverage of notches, valid ease evidence, seam pairing and construction metadata; ratchet regression floors only after reviewed denominators exist. |
| v3.2 WP-45 verification sweep | Partial | Complete browser, export, project round-trip, performance, simulation and device evidence. |
| v3.2 WP-69 darts | Partial support | Extend only after fixtures cover straight, curved, internal and interacting darts. |
| v6-01 to v6-03 reliability, mobile, persistence | Released foundations | Preserve CSP, responsive, RTL, storage, access and offline regression coverage while adding new flows. |
| v6-04 reviewed starter-block inventory | Engineering evidence exists; maker approval remains open | Promote only reviewed skirt, bodice/dress and trouser blocks after identified blockers are resolved. |
| v6-05 revisions and typed commands | Foundation exists | Make every AI and configurator change use preview, accept/reject, locks and undo. |
| v6-06 evaluation corpus and maker rubric | Foundation exists; maker outcomes remain open | Expand the corpus for parametric and multimodal drafting; collect real maker review. |
| v6-07 conversational brief | Existing engineering direction | Complete a production-quality bilingual brief-to-proposal workflow with provenance and locks. |
| v6-08 image studio | Existing engineering direction | Make text/image generation capability-aware and retain original assets, variants and permitted-use records. |
| v6-09 typed pattern program | Existing vertical-slice direction | Turn it into a bounded parametric drafting engine, starting with one reviewed family. |
| v6-10 construction / fit acceptance | Still essential | Make validation, maker review and sample evidence prerequisites for readiness claims. |
| Mannequin modernization and rigged avatars | Assets and grounding repair have been worked on; real garment fit is unproven | Maintain compatible rigged GLB assets, run placement/grounding checks, and validate each advertised avatar with garment and Cloth Lab fixtures. |

## 3. Non-negotiable product rules

1. **AI proposes; the designer accepts.** AI never replaces the active project, changes a locked field, or executes unbounded geometry code.
2. **Measurements have a source.** Each value is user-entered, imported, defaulted, or inferred. Inferred values require review before made-to-measure output.
3. **Image references are evidence of appearance, not hidden construction.** The system asks for unresolved construction, scale, back-view, fit, and material decisions.
4. **A valid pattern and a fitting garment are different claims.** Geometry checks, 3D simulation, maker review, and sewn-sample fit have distinct readiness labels.
5. **No silent scope expansion.** An unsupported garment or operation returns a clear limitation and offers a supported base block where possible.
6. **Bilingual parity is required.** English and Arabic fields, validation messages, controls, help, and exports stay equivalent and usable in RTL.
7. **Local-first remains meaningful.** Project data and JSON backup stay recoverable. Hosted AI and optional accounts do not become prerequisites for core editing.

## 4. Plan 7 delivery sequence

The phases are ordered by dependency, not calendar date. Each package is small enough to test and review independently. “Complete” requires the stated evidence, not just merged code.

### P7-01 — Release truth, compatibility and test baseline

**Outcome:** a current map of what runs, what is only implemented, and what needs physical evidence.

- Reconcile the v3.2/v6 progress notes with `CHANGELOG.md`, merged commits, deployment records and live assets.
- Establish a release manifest for the app, Cloth Lab, avatar assets, service worker, exports, and AI provider adapters.
- Complete the deferred verification matrix: CSP boot, EN/AR at mobile and desktop widths, JSON import/export, supported browser paths, 3D readiness diagnostics, avatar grounding, and Cloth Lab launch.
- Run the real iOS USDZ Quick Look check when a physical device is available; record the result rather than assuming success.

**Exit evidence:** reproducible manifest, regression suite, documented limitations, and no claim that untested device behavior is supported.

### P7-02 — Measurement profiles and fit context

**Outcome:** one trusted source of body and garment-fit input.

- Add saved, named measurement profiles with units, category, timestamp, source and notes.
- Validate missing, contradictory, and implausible measurements without overwriting user values.
- Capture garment ease, intended fabric stretch, fit preference, and body-shape notes as explicit design inputs.
- Allow project-level selection of a profile while preserving a snapshot in the project revision for reproducibility.
- Provide bilingual measuring guidance and a visible list of values still required for the selected garment.

**Exit evidence:** create/edit/select/import/export profile tests; profile changes preview their effects; no hidden fallback measurement is used for an export.

### P7-03 — Made-to-measure configurator contract

**Outcome:** a dependable alternative to a template catalogue: base garment plus controlled, inspectable options.

- Define versioned configuration schemas for silhouette, ease, length, neckline, sleeve, collar, closure, pockets, skirt shape, fabric and seam allowance.
- Define allowed combinations, missing dependencies, and explicit unsupported combinations per family.
- Begin with **woven A-line skirt**, then **basic woven bodice/dress**, then **trousers only after their known construction blockers are resolved**.
- Show a human-readable bilingual specification, technical-flat preview, and affected pattern pieces before applying the configuration.
- Route all edits through the existing typed command, lock, revision, preview, accept/reject and undo contracts.

**Exit evidence:** deterministic configuration-to-spec tests, no invalid combination can reach draft generation, and each supported option creates a reviewable diff.

### P7-04 — Deterministic parametric drafting engine

**Outcome:** selected configuration and measurements generate editable geometry, not only an image.

- Use typed, reviewed operations over starter blocks: controlled offsets, length changes, darts, flare, seams, facings, waistbands, sleeves and permitted component composition.
- Keep programs declarative, unit-safe, deterministic, bounded in runtime, and serializable in the project revision.
- Generate named pieces, cut quantities, grainlines, curves, notches, darts, seam allowances and construction joins from the same program.
- Validate closed outlines, intersections, seam allowance, grainline, declared stitch-line lengths, notch correspondence, grading and allowed construction topology.
- Abstain with a precise reason when inputs cannot produce safe geometry.

**Exit evidence:** one end-to-end reviewed family passes deterministic geometry tests across a documented size matrix, or returns a clear abstention. No model-generated JavaScript is executed.

### P7-05 — Construction packet and quality-gate closure

**Outcome:** each supported draft can become a practical handoff package with honest evidence.

- Produce cut lists, seam graph, stitch-line pairing, seam allowance, grainline, notches, fabric/notions estimate, technical flat and ordered sewing instructions.
- Close the older WP-43/44/67/69 gaps by expanding named seam coverage, notch/ease evidence and dart support across reviewed families.
- Keep geometry evidence separate from construction approval. Maker and sewn-sample decisions attach to an exact revision and expire when relevant geometry changes.
- Introduce a readiness panel: `draft`, `geometry checked`, `maker reviewed`, `sample approved`, or `unsupported`.

**Exit evidence:** maker-reviewed construction packets for the initial family set; all claimed joins have directed endpoints and stitch-line evidence; unsupported details are marked rather than guessed.

### P7-06 — 3D, Cloth Lab and avatar confidence

**Outcome:** visual and simulation reviews that are useful without overpromising fit.

- Finish rigged-avatar compatibility fixtures for every selectable bundled mannequin; verify body placement, floor alignment, skeleton cloning, cloth collision setup and model switching.
- Extend garment-import and joining tests for collars, bands, lapels, waistbands, bra components, hoods, capes and validated darts.
- Create material presets with documented approximation limits; test stable drape, collision and penetration behavior under supported loads.
- Complete export evidence: PDF calibration square, SVG/DXF/HPGL scale and reimport, USDZ Quick Look, and high-quality collision performance.

**Exit evidence:** advertised avatar/device/export matrix has real test results. 3D remains labeled as indicative until a maker-reviewed sample provides fit evidence.

### P7-07 — Bilingual design copilot

**Outcome:** text-to-text fashion design becomes a controlled project workflow.

- Convert Arabic or English conversation into a structured brief containing silhouette, occasion, fit, material, construction, color, reference intent and constraints.
- Ask only for decisions needed to proceed; identify contradictions and distinguish assumptions from user decisions.
- Propose alternatives with trade-offs and link construction advice to reviewed internal sources.
- Let the designer lock measurements, silhouette, fabric, seam choices, or other fields before regeneration.
- Create a proposal revision and a field-level change summary; accepting it remains atomic and undoable.

**Exit evidence:** versioned benchmark tasks show locked fields are preserved, bilingual briefs extract correctly, and unsupported requests abstain clearly.

### P7-08 — Capability-aware image design studio

**Outcome:** text-to-image and image-to-image visual development with reliable controls.

- Support prompt-only concepts, reference-guided variants, optional masks, multi-view boards and targeted edits when the active provider supports them.
- Store original references, generated variants, mask provenance, selected concepts and permitted-use notes.
- Replace hardcoded body, garment and styling assumptions with category- and brief-aware prompts.
- Compare visual concept and pattern specification side-by-side, explicitly flagging image details absent from the draft.
- Prevent duplicate paid calls through job IDs, cancellation, timeout/retry handling and visible provider capability/usage status.

**Exit evidence:** supported provider paths are tested; cancellation and recovery preserve work; review benchmarks measure reference preservation and user acceptance.

### P7-09 — Text and images to pattern

**Outcome:** multimodal input produces a constrained proposal into the drafting engine.

Pipeline: **inputs → brief → measurement/reference reconciliation → reviewed block → bounded pattern program → validation → 2D/3D preview → accepted revision**.

- Extract only supported fields from text and images; show uncertain fields, hidden construction questions and scale conflicts for review.
- Keep a per-field source record: user, measured, inferred, default, or computed.
- Use image analysis to propose style lines and components, never to invent body size, back construction, fabric behavior or fit without disclosure.
- Generate a program only for a supported block/family; otherwise offer a concept board or a controlled base-garment route.
- Test text-only, image-only and combined inputs in Arabic and English, including missing back views, conflicting measurements and extreme valid sizes.

**Exit evidence:** all published benchmark outputs either pass mandatory geometry checks or abstain with a concrete reason; maker acceptance is reported separately from validation success.

### P7-10 — Professional pilot and refinement

**Outcome:** confirm that the workflow saves real work for designers and makers.

- Recruit 8–12 designers/makers across the first supported garment families.
- Test concept → configuration → reviewed draft → construction packet → export → sample feedback.
- Add only the collaboration, annotations, collection workflow, onboarding, accessibility and performance improvements shown to be necessary by the pilot.
- Measure completion rate, time to accepted draft, correction count, invalid join rate, maker acceptance, fit outcome, AI cost, latency, and EN/AR differences.

**Exit evidence:** at least 80% unaided concept-to-reviewed-export completion, at least 30% median time reduction against the participant baseline, no unresolved critical data-loss defect, and documented sample size/limitations.

### P7-11 — Subscription and business model — final phase

**Outcome:** commercial terms are based on real value, cost and quality evidence.

- Decide the offering only after P7-01 through P7-10 gates are met: free learning/local drafting, independent designer, studio, and optional bring-your-own-provider are hypotheses to test, not commitments.
- Measure hosted AI/image cost, storage, support, payment fees, retry rates and usage distribution before pricing.
- Select a billing provider, geography/currency, taxes, refunds, usage limits and cancellation/access policy with the owner.
- Implement server-authoritative entitlements, verified webhooks, idempotency, renewal/cancellation/failure flows, restores and support tooling.
- Preserve local projects and export access according to a clear policy; never place payment secrets in the static client.

**Exit evidence:** owner-approved offer, sustainable unit economics, billing lifecycle tests, transparent customer terms, and a support runbook.

## 5. Quality scorecard

The dashboard must report these separately by garment family, language, provider, device and input type:

| Measure | Why it matters |
| --- | --- |
| Valid geometry, abstention and validation failure | Prevents a refusal or an invalid draft being counted as success. |
| Maker-reviewed and sample-approved revisions | Separates real construction/fit evidence from software checks. |
| Locked-field violations and revision reversals | Measures whether AI respects designer control. |
| Missing/wrong pieces, joins, notches and grading issues | Tracks pattern quality directly. |
| Reference-preservation acceptance | Tests image-studio usefulness without equating realism with accuracy. |
| Completion time and correction count | Demonstrates practical value in the pilot. |
| AI cost, retries, latency and provider failures | Makes later pricing and reliability decisions defensible. |

## 6. Dependencies and risks

| Risk | Mitigation / decision owner |
| --- | --- |
| Beautiful concept image cannot be sewn | Pattern lead requires a reviewed block, construction graph, validation and maker/sample gates. |
| Image lacks scale or back view | AI asks for missing data or produces a concept-only result. |
| AI damages active work | Frontend/geometry use previews, locks, atomic acceptance, undo and project round-trip tests. |
| Large library suggests false readiness | Launch only explicitly reviewed families; maintain a readiness inventory. |
| Simulation looks plausible but does not fit | Separate simulation diagnostics from maker and sample acceptance. |
| Avatar assets regress grounding or cloth interaction | Per-asset skeleton, placement, collision and garment fixtures. |
| Provider capabilities/cost change | Capability registry, budgets, cancellable jobs and provider-contract tests. |
| Reference rights or privacy are unclear | Record permitted use; do not make body measurements/design files default telemetry. |
| Billing pressure distorts core product quality | P7-11 remains last and depends on pilot evidence. |

## 7. First execution queue

1. **P7-01** — reconcile release truth and finish the compatibility matrix.
2. **P7-02** — measurement profiles and provenance.
3. **P7-03** — configuration contract for woven A-line skirts.
4. **P7-04** — deterministic skirt pattern program and validation.
5. **P7-05** — skirt construction packet plus named-seam evidence.
6. **P7-07** — bilingual brief-to-configuration proposal, reusing the revision contract.
7. **P7-08** — image studio controls and source history.
8. **P7-09** — combined text/image-to-supported-skirt proposal.
9. Expand to bodice/dress, then trousers only after their readiness blockers close.
10. **P7-06 and P7-10** run alongside family expansion where real device and maker access is available.
11. **P7-11** begins only after the pilot gate.

## 8. Definition of Plan 7 completion

Plan 7 is complete when the first supported garment families can move from bilingual brief and permitted reference image to a measurement-aware, editable, validated pattern revision and construction packet; when real makers have reviewed and sampled those outputs; and when the app’s paid offering is launched only after those outcomes and costs support it. It does not require claiming that every garment, mannequin, input image, device, or fit problem has been solved.

## Sources consulted for the Sewist benchmark

- [Sewist CAD — Online Sewing Pattern Designer](https://mak.sewist.com/site/?lang=ru): public description of parametric design, personal measurements, 2D/3D CAD, standard exports, technical flats and yardage estimation.
- [Sewist pattern example](https://www.sewist.com/patterns/17425?PatternsReviews_sort=external_url.desc): public example of configurable garment construction, made-to-measure input and PDF/SVG delivery.
- [Sewist pattern catalogue](https://dk.sewist.com/patterns?Patterns_page=78&lang=en): public catalogue filters including made-to-measure and PDF/paper formats.
