# V6-11 — construction-evidence record

The construction-evidence download is a portable JSON snapshot of the current
project's declared geometry checks. It contains a schema name, evaluation time,
project ID/revision, piece roles, whether a saved brief or pattern program is
present, the applicable seam assessment, and explicit null maker/sample
approval fields.

The typed woven-skirt slice keeps its specific side-seam assessment. Any other
project with an explicitly declared two-sided `edges[].seamId` pair receives a
generic `declared-seams` assessment, which measures only those supplied edge
lengths. The record never infers joins from silhouettes, roles or proximity.
Projects with no declared seam evidence produce `not-applicable` with
`constructionFamilyUnsupported`. Every record sets `productionEligible` to
`false`.

The record is a local download and is not sent to a provider or cloud service.
It is not a tech pack, fit report, construction instruction, material test,
grade validation, maker review, sewn-sample approval, or permission to cut or
produce. Those decisions remain outside this release.

## V6-12 in-app review

The Export pane can render the same current-project evidence before it is
downloaded. It shows declared seam lengths and their millimetre difference when
they exist, or the explicit blockers when they do not. It always shows maker
approval, sewn-sample approval and production eligibility as absent/not eligible.
The panel does not persist an approval, change geometry or upload data.
