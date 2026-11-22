# Construction-evidence record & readiness contract

The construction-evidence download (`berrystudio.construction-evidence.v1`) is a portable JSON snapshot of the current project's declared geometry checks and portable P7-05 construction packet. It contains a schema name, evaluation time, project ID/revision, piece roles, whether a saved brief or pattern program is present, `readinessStage`, the applicable seam assessment, embedded `packet`, and explicit null maker/sample approval fields.

Family routing assesses declared seams explicitly by family:
- `woven-basic-dress`: requires `bodice-front`, `bodice-back`, `skirt-front`, `skirt-back` and matching `dress-bodice-side` & `dress-skirt-side` seams (`dress-seams-checked`).
- `woven-basic-bodice`: requires `bodice-front`, `bodice-back` and matching `bodice-side` seam (`bodice-seams-checked`).
- `woven-a-line-skirt`: requires `skirt-front`/`skirt-back` and matching `skirt-side` seam (`side-seam-checked`).
- `woven-basic-trousers`: requires `trouser-front`, `trouser-back`, `waistband` and matching `trouser-outseam` & `trouser-inseam` seams (`trouser-seams-checked`).
- Other projects with explicitly declared two-sided `edges[].seamId` pairs receive a generic `declared-seams` assessment measuring only supplied edge lengths.
- Projects with no declared seam evidence produce `not-applicable` with `constructionFamilyUnsupported` and `readinessStage: "unsupported"`.

The derived `readinessStage` is `unsupported`, `draft`, `geometry-checked`, `maker-reviewed`, or `sample-approved`. Every automated check remains capped at `geometry-checked` with `productionEligible: false` and never infers joins from silhouettes, roles, or proximity.

The record is a local download and is not sent to a provider or cloud service. It is not a final fit guarantee, material test, grade validation, maker review, sewn-sample approval, or permission to cut or produce.

## In-app review

The Export pane renders the current-project readiness stage, declared seam lengths and millimetre differences (or explicit blockers), ordered construction handoff steps when supported, and explicit null maker, sewn-sample, and production-eligibility statuses. It does not persist an approval, change geometry, or upload data.
