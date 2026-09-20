# V6-07 — saved conversational brief foundation

Release scope on `codex/v6-07-conversational-brief`. This is
the bounded local foundation of V6-07, not completion of the Phase 2 copilot
acceptance gate or evidence of maker-approved fit.

## User flow

The AI pane includes a separate English/Arabic **Design brief** section. Each
submitted update and captured-choice response is saved on the current project.
Follow-ups change recognized fields while keeping unrelated choices. Conflicting
values remain unresolved until a later update supplies one corrected value.
The interface lists captured choices and distinguishes supplied measurements
from current-size defaults before enabling a draft request.

Supported captured fields are garment family (skirt/dress/trousers), garment
length (short/regular/long), fabric (woven; stretch is explicitly unsupported),
and waist/hips/chest. Numeric centimetres and inches, including Arabic digits,
are normalized to centimetres. Missing units, conflicts and nonpositive values
block this workflow. This is bounded keyword/number capture, not general natural
language understanding: other notes remain in history but are not sent as
executable instructions. The interface states that only listed choices affect
the draft. General construction advice, arbitrary garment edits and generated
design alternatives are not implemented here.

This saved-brief workflow is explicitly text-only; attached references belong to
the existing direct-generation controls. Unsaved message text disables the draft
button until updated or cleared.

Each draft request snapshots its measurements and their source. Existing local
or configured-provider generation consumes the canonical captured brief and
that measurement snapshot. Declared family/length must match the brief, and
failure-level pattern validation blocks acceptance.
Passing drafts use the existing review/accept/reject modal and become a new
project only on explicit acceptance. Their brief, measurement snapshot and
validation report are retained. The original project—including locked pieces—
is preserved. Draft geometry and brief acceptance form one undo step.

## Persistence and limits

`project.brief` has version 1, user/assistant turns, fields with source turn IDs,
and unresolved issues. Accepted drafts additionally retain `draftInputs` and
`validation`. It travels through existing project JSON, autosave, reload, tab
switching and undo/redo. Updating a brief advances the project revision and
clears prior approval. Unsupported/malformed imported brief formats remain
stored and display an error rather than being overwritten. There are at most
30 user updates (60 total turns), and 2,000 characters per update; reaching the
limit asks for a new project rather than silently deleting history.

The existing direct-generation controls and Quick Draft builder remain separate.
The new reconciliation/validation gate is scoped to the saved-brief workflow;
it does not establish that legacy paths reconcile all conflicting inputs.

## Open V6-07 acceptance work

- Model-backed bilingual conversation, grounded advice linked to reviewed maker
  sources, design alternatives and explicit unsupported-intent detection.
- Reviewed field-level locks and bounded in-place geometry-edit proposals beyond
  the existing translate/rename/color command contract.
- Broader input reconciliation, missing views, reference scale and permissioned
  real-image evaluation. Numeric-word parsing and arbitrary units are unsupported.
- A versioned task evaluation measuring the complete conversational workflow;
  the Phase 2 success target is unmeasured. V6-06's 24 held-outs stay untouched.
- Maker-reviewed blocks and construction evidence remain prerequisites for
  claiming pattern/fit quality. A validator pass is not sample approval.

Billing and subscriptions remain in the final phase.
