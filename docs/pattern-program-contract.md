# Plan 7 — typed pattern-program engine

This release implements bounded, reviewable declarative pattern-program families across four starter blocks:

1. `woven-a-line-skirt` (`skirt-front`, `skirt-back`, `waistband`)
2. `woven-basic-bodice` (`bodice-front`, `bodice-back`)
3. `woven-basic-dress` (`bodice-front`, `bodice-back`, `skirt-front`, `skirt-back`)
4. `woven-basic-trousers` (`trouser-front`, `trouser-back`, `waistband`)

None of these families constitute a general program language, physical fit approval, or construction approval.

The program engine accepts only `defineVariable`, `placePoint`, `lineBetween`, `promotePiece`, `setPieceRole`, and `setPieceConstruction` operations. Its validator rejects unknown fields, duplicate names, unknown or mistyped references, malformed formulas, executable text, invalid loops, and unsupported roles before output. Formulas are limited to numbers, named measurements/variables, arithmetic, and parentheses.

A complete saved Design brief must declare the supported garment family, woven fabric, supported length (where applicable), and required measurements (`waist`/`hips` for skirt; `chest`/`waist` for bodice; `chest`/`waist`/`hips` for dress; `waist`/`hips`/`inseam` for trousers). The engine derives typed pieces, runs `PatternValidator`, opens the normal new-project review, and stores the typed operations, configuration, inputs, provenance, and validation with the accepted project without mutating the source project.

## Explicit boundaries and release honesty

- Short / regular / long skirt & dress lengths map to fixed 45 / 60 / 85 cm skirt spans; trouser short / regular / long lengths scale from `inseam` (`inseam * 0.78`, `inseam`, `inseam + 6`).
- Hip/seat shaping, crotch rise ease, shoulder/waist joins, closures, waistband attachment, and grading fit still require maker review and sewn-sample verification before cutting or production.
- Unsaved brief text disables the program action; the saved brief, configurator selection, and operations travel together into the new project. Acceptance rechecks account access.
- Measurement names cannot be redefined as program variables. Point references must identify points rather than variables or lines; extra top-level fields are rejected. No provider-generated JavaScript or image-to-pattern construction execution is permitted.
