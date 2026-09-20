# V6-09 — typed pattern-program vertical slice

This release implements one bounded, reviewable program family: a woven A-line
skirt. It is not a general program language, a fit approval or a construction
approval.

The program accepts only `defineVariable`, `placePoint`, `lineBetween`,
`promotePiece` and `setPieceRole` operations. Its validator rejects unknown
fields, duplicate names, unknown or mistyped references, malformed formulas, executable
text, invalid loops and unsupported roles before output. Formulas are limited
to numbers, named measurements/variables, arithmetic and parentheses.

A complete saved Design brief must declare skirt, woven fabric, a supported
length and valid waist/hip measurements. The program derives a front, back and
waistband, runs the existing pattern validator, opens the normal new-project
review, and stores the typed operations, inputs, provenance and validation with
the accepted project. The source project is not mutated.

Only the woven A-line skirt family is supported. There are no AI-authored
programs, arcs, intersections, offsets, darts, closures, grade rules,
multi-family claims or maker acceptance evidence in this slice. Those require
the remaining Phase 4 and Phase 5 work.

## Template limitations and release revision

The current UI explicitly selects an experimental A-line template. It does not
interpret arbitrary brief notes as construction commands. Short/regular/long
use fixed 45/60/85 cm lengths, not calibrated wearer-relative lengths. Hip
shaping, closure and waistband construction need maker correction before cutting.
A general validator pass does not verify these missing construction choices.
Unsaved brief text disables the program action; the saved brief and operations
travel together into the new project. Acceptance rechecks account access.

Measurement names cannot be redefined as program variables. Point references
must identify points rather than variables or lines; extra top-level fields
are rejected. No provider-generated program or image-to-pattern execution is
claimed by this slice.
