# V6-05 — Project revisions and reviewed commands

Implementation: `js/project-revisions.js`, `js/project-review.js`, `js/canvas.js`
and the Project menu in `js/app.js`. This is the bounded command foundation
for V6-07 and V6-09, not a garment-generation or maker-approval engine.

## Storage and migration

JSON exports use `app: "BerryStudio"`, `version: 2` and the existing
`pieces`, `texts`, `points`, `cons`, `variables` and `sketch` fields. Geometry
continues to use centimetres, regardless of the display-unit setting.
`projectMeta` stores a stable `id`, a nonnegative integer `revision` and
`status: "draft"` for new work. Existing piece IDs use `clothLabId`, shared
with Cloth Lab; missing or duplicate IDs are assigned on migration or
snapshot capture. Piece extensions remain intact.

Unversioned objects, old version-1 files and raw piece arrays migrate on
import. Unsupported explicit versions and malformed geometry fail before
the current canvas is replaced. Migration is pure and idempotent for a
migrated document. Saved legacy tabs gain IDs and metadata on capture.

Additional JSON project fields, such as `brief`, `measurements`, `fabric`,
`references`, `conversation` and `validation`, survive canvas snapshots,
imports, accepted edits and undo through an opaque project-context map.
This preserves data without claiming that all those domain schemas or
authoring interfaces are implemented. Reference IDs and rights records
remain caller-supplied. Trace-image canvas backgrounds still follow the
existing tab-persistence limitation; this package does not embed them.

## Typed command boundary

Supported command shapes:

```json
[
  {"type":"translate","pieceId":"piece_UUID","dx":3,"dy":-2},
  {"type":"rename","pieceId":"piece_UUID","name":"Front bodice"},
  {"type":"color","pieceId":"piece_UUID","color":"#6655ee"}
]
```

Commands target stable piece IDs. Batches contain 1–100 commands; unknown
commands or fields fail. Translation is bounded to ±1000 cm per axis and
moves outlines, darts, notches, grain and Bézier control points together.
Names are 1–120 characters of plain text; the initial rename operation sets
both language labels. Colors must be six-digit hexadecimal values. Existing
whole-piece locks reject all three command types. There is no arbitrary
JavaScript execution, generated code evaluator or replace-pattern command.

`previewCommands(project, commands)` returns a before/after proposal without
mutating the input. `acceptCommands(current, proposal)` checks the complete
persisted design fingerprint and re-executes the allowlisted commands; it
does not trust the proposed after-state. Camera movement and transient text
hitboxes do not invalidate a proposal. Geometry, notes, variables, context,
locks or project identity changes do. The UI additionally checks the active
tab identity, including separately imported copies of the same project.

Acceptance is atomic and advances the revision, sets draft status and clears
the revision approval slot. `Canvas.acceptProposal` records one undo step
for the complete batch. Undo/redo now also preserve variables and project
metadata/context. Pattern regeneration advances the checkpoint and keeps
the project context; a new project starts a new identity. Ordinary legacy
canvas edits continue through their existing undo APIs and are detected by
the fingerprint, rather than claiming every pointer action is a new numbered
revision. A branching history UI and domain-specific approval lifecycle are
future work.

## User workflow and AI generation

Project → Review change… selects one piece and a move/name/color operation.
Preview shows a dashed current outline and a solid proposed outline plus a
text summary. The diagram is a straight-edge overview, not a sewing or fit
validation view. Accept applies once; Reject or Close leaves the canvas
unchanged. Changed form inputs discard the prior preview. English and Arabic
labels, errors and responsive layout are included.

AI pattern generation and attribute regeneration show a review dialog. Accept
creates a separate project draft; Reject/Close preserves the existing design.
Generation completing after a tab switch cannot overwrite either tab. New
tabs start with empty undo history, so undo cannot leak into another design.
An accepted generated draft can be undone to its empty new tab. Generated
pieces remain unverified drafts; locks on the source project stay intact.

Field-specific preservation constraints (silhouette, fabric, seam choices),
model-produced edit proposals, full curve/annotation preview and branching
revision history are not claimed here. Those depend on the later brief and
typed pattern-program packages. Existing manual import/library/grade actions
keep their explicit behavior. No pricing or subscription model is added.

## Regression coverage

Pure tests cover migration, extension preservation, malformed input, atomic
batches, every attached geometry class, locks, stale content, camera changes,
untrusted after-state and single-step undo/redo. Browser tests enforce the
real CSP and cover preview/reject/accept, stale/locked errors, Arabic,
reload/tab persistence and AI acceptance preserving the source project.
The remote auth SDK is mocked only in tests; production gates are unchanged.
