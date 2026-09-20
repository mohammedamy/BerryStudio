# Proposed maker rubric — review required

This is an evaluation protocol, not a declaration that the current generated
patterns are production-ready. Name the reviewer and bind every result to the
task ID, generator/source hash, geometry SHA-256 and, when saved as a project,
project ID and exact revision. Review original
inputs, not just the generator's summary. Record English/Arabic discrepancies.

## Decision gate

Before grading geometry, decide whether the inputs warrant a draft, a specific
clarification or abstention. Missing scale/back view, contradictory measurements
or invalid measurements must be resolved explicitly. An exception, empty output
or silent fallback does not count as a reasoned abstention. Record requested
information and whether a corrected input would make the task supported.

## Draft review

Score each dimension 0–4: 0 absent/unsafe, 1 major reconstruction, 2 substantial
correction, 3 minor correction, 4 acceptable without correction. Use null for
not assessed and give a reason; never silently exclude that dimension from an
aggregate. Keep scores separate until makers approve weighting and thresholds.

| Dimension | Evidence to inspect |
|---|---|
| Brief fidelity | Garment family, silhouette, length, fabric intent and preserved choices match inputs; no unstated substitutions |
| Measurements and units | Named body measurements, source and units; intended ease; waist/hip/chest where applicable; reference scale and correction history |
| Pieces and construction | Complete required inventory, cut count/fold instructions, mating edges, direction and seam compatibility; no guessed joins presented as verified |
| Geometry and markings | Closed usable outlines, no unintended intersections, grain, darts, notches, seam/hem allowances and matching marks |
| Edit/recovery behavior | Locked choices unchanged, preview corresponds to accepted revision, rejected work leaves the project intact, undo and save/reopen preserve it |
| Handoff | Readable labels and construction instructions; exported scale checked with a physical calibration square or independently measured vector units |

Family-specific checks (proposed, not already validated):

- Skirt: waist/hip intent, side seams, waistband/closure choice, hem and any
  vent/slit actually represented in geometry and instructions.
- Dress: bodice/skirt relationship, shoulder/side seams, neckline/armhole finish,
  sleeve joins if present, darts, closure and construction order.
- Trousers: front/back rise, inseam/outseam correspondence, crotch construction,
  waist/closure and intended leg width/length.

Mark critical failures separately: impossible measurement/unit interpretation,
missing required pieces, unusable topology/joins, lock violation, data loss or
an export scale error. A high average cannot override a critical failure.

## Verdict and evidence

Allowed review verdicts: `pending`, `needs-clarification`, `abstain-appropriate`,
`major-rework`, `minor-rework`, `accepted-draft`. Separately record sample/fit
evidence; **accepted-draft is not sample-approved**. Only a named maker can
complete the maker review; only documented making/fit evidence can advance
sample status. Approval must be reconsidered after a relevant revision change.

Record correction count, active review minutes, time to accepted draft, device,
output filenames, reviewer comments and any unresolved questions. Remote runs
also record model/version, provider, latency, retries, token/image usage and
actual cost when available; use null for unknown, never a guessed zero.

Report maker acceptance with the number reviewed and total requested; also
publish clarification, abstention, failed, unreviewed and not-run counts by
family, language and input type. Report fit outcomes separately with sample
size and the measurement protocol. No automated report may fill these fields
on behalf of a maker.

## Failure taxonomy

Automated tags: `execution-error`, `wrong-family`, `wrong-length-intent`,
`invalid-geometry`, `validator-failure`, `missing-clarification`,
`missing-abstention`, `unexpected-abstention`, `draft-before-resolution`.

Maker tags: `measurement-mismatch`, `missing-piece`, `wrong-piece`,
`invalid-join`, `notch-mismatch`, `grain-error`, `allowance-error`,
`lock-violation`, `data-loss`, `export-scale`, `reference-ambiguity`,
`translation-mismatch`, `fit-failure`, `unsupported-construction`.

Multiple tags can describe one failed task. Retain severity, supporting evidence,
revision and remediation for each; count task verdicts separately from tags.
