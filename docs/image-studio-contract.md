# V6-08 — capability-aware image studio

Release scope integrated on `codex/v6-07-10-release`. This is a local, project-owned
concept-image workflow. It is not a claim that generated imagery supplies a
production pattern, grade, fit result, construction instructions, or rights
clearance.

## User flow

The AI pane has a separate **Image studio**. A designer can generate a concept
from a free-text direction, or add one PNG, JPEG or WebP reference and then
generate a reference-guided variation. The prompt deliberately does not impose
a garment, body or styling assumption: the designer describes the silhouette,
material, colour, occasion and constraints.

Saving a reference requires an explicit user confirmation that they have
permission to use it in the project. This records the user's assertion only;
BerryStudio does not determine ownership, licenses or consent. The reference
and prompt are sent to the selected image provider only when the designer asks
to generate. They otherwise remain in the browser's saved project data and
travel with project JSON, autosave and project tabs.

The studio reads each adapter's declared capabilities before making a request.
Text-to-image is available for the configured proxy, OpenAI Images, Gemini
Image, Automatic1111 and the current ComfyUI workflow. Reference-guided
variation is available for the proxy, OpenAI Images, Gemini Image and
Automatic1111. The shipped ComfyUI graph is text-to-image only, so a saved
reference disables generation there with a direct explanation. No adapter in
this release advertises mask editing.

Every valid returned image becomes a saved concept with the prompt, provider ID,
mode and its reference ID when applicable. The designer chooses the active
concept explicitly from the gallery. Adding, selecting, undoing and redoing a
concept update project state without changing pattern geometry. Existing direct
pattern drafting and the Fashion Billboard remain separate workflows.

## Persistence and limits

`project.imageStudio` is version 1 and contains one confirmed reference,
up to six newest concepts and one selected concept ID. Images must be PNG,
JPEG or WebP data URLs of at most 2,800,000 characters; directions are trimmed
and limited to 1,200 characters. Invalid imported records fail closed in the
panel and are preserved rather than silently rewritten. Quota failures roll back the attempted studio mutation and preserve the prior saved state.
Normal studio updates
are validated before they enter Canvas state, advance the project revision and
clear prior approval. They round-trip through local save, tab changes, project
JSON and undo/redo.

**Stop waiting** stops the browser from saving a later response. It cannot
abort a provider request already sent, and that provider may still complete or
bill it. Retrying after a failure keeps the saved reference and concepts.

## Open Phase 3 work

- Provider capability discovery and real-provider compatibility evidence;
  adapter declarations currently describe the supported request paths.
- Mask/region editing where a provider supports it, multiple controlled
  references, side-by-side comparison tools and a durable version lineage.
- A consent, deletion and retention design suitable for server-side projects;
  this release stores reference data locally in browser project state.
- Curated fashion-design evaluation across providers and the Phase 3 expert
  acceptance measure. No such benchmark or acceptance threshold is claimed.
- Typed, reviewable translation from selected imagery to pattern construction;
  that is V6-09 and later work, not an inference made by this studio.

Billing and subscriptions remain in the final phase.

## Combined release review

Requests capture immutable direction and project identity. Cancellation invalidates
only that request; retries cannot re-enable older responses. Results are discarded
if the panel was replaced, the project switched, or its studio state changed.
Generation disables input changes until completion or cancellation. New concepts
are unselected until the designer clicks a gallery item. References can be removed
to return to text-only mode. Reference IDs on older concepts are historical IDs;
replacing a reference does not retain its original image pixels.
