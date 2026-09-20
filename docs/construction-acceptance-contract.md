# V6-10 — declared seam audit

This release audits explicitly declared seam spans in the generated-skirt
review. It measures every declared pair's forward outline span, including
wraparound. Zero spans, invalid coordinates/indices, ambiguous groups, missing
counterparts and differences greater than 3 mm are reported as blockers.

Matching side-seam lengths mean only that this measured evidence matches.
Waistband assembly, closure, notch direction, material behavior, graded fit,
maker approval and sewn-sample approval remain unverified. `productionEligible`
is always false. Draft acceptance remains available because this audit is
informational; it is not an export permission or a production-readiness gate.

The local generator declares the known side seam only for straight/curved,
non-wrap skirt panels. Existing cloth placement roles are preserved. The
experimental V6-09 program is included in the audit and correctly reports
missing seam declarations. Broad family/accessory/dart acceptance is still open.
