# Guided Cloth Lab workspace

This change replaces the setup interaction with **Pieces → Joins → Simulate**.
It is an implementation branch, not a claim that every existing physics or GPU
issue is resolved.

## User workflow

1. Open the current pattern in Cloth Lab. Every source piece is listed, including
   hidden, unrecognized and invalid pieces. No demo garment replaces it.
2. Answer multiple-choice questions only for missing configuration: placement,
   cutting quantity, hidden-piece inclusion and dart treatment. A piece can be
   explicitly excluded without deleting it from the pattern.
3. Join edges on flat piece drawings. Select named edges or their start/end
   points; keyboard selection and numeric point selectors are available. Select
   more than two edges to join several complete edges at a shared junction.
   The sidebar shows existing joins and asks about unattached pieces.
4. Simulate after resolving unfinished selections and attachment decisions.
   Fit, zoom, pause/resume and restart controls sit over the preview. Body,
   placement and weld inspection remain available. Body, fabric, appearance
   and export controls are grouped in the sidebar.

## Source and save contract

`clothLabId` is a persistent source-piece UUID, independent of its name or layer
position. Duplicated IDs are repaired before sending the pattern. The host sends
all source pieces and the active project identity to either engine.

Setup is stored locally and sent to the authenticated host for storage with the
project snapshot. The host checks sender, origin, current design identity and
geometry before accepting it. Answers and committed seam topology restore only
against matching source geometry. Changing the shape invalidates stale setup;
translation of a piece on the 2D sheet and language changes do not. In-progress
point selection is retained on language changes but is not persisted across an
engine teardown. Storage failures show a message instead of silently succeeding.

The standalone route needs a pattern handoff from BerryStudio. It does not
create a default T-shirt. Authentication and entitlement gates are unchanged.

## Geometry and interaction limits

- Dart closure currently supports an apex inside the outline and two mouth points
  strictly inside the same straight boundary segment. It cuts that boundary and
  joins the dart legs. Internal, curved-boundary and endpoint-mouth darts require
  preparation in the pattern editor, or the explicit marking-only choice.
- A dart that replaces an auto-join edge triggers attachment review. The source
  2D geometry remains unchanged.
- Multi-piece joins weld **whole selected edges**, with a common subdivision
  count across all participants. This is not a general arbitrary point-junction
  or sewing-order simulation.
- Cut-on-fold retains the existing importer convention: the fold is at the
  local left boundary between the first and last outline points. Placement uses
  the existing role-based body placement. This redesign does not supply a new
  collision solver or repair every difficult drape.
- Setup and joining use SVG and do not mount a WebGL renderer. Actual previews
  still need WebGL. The scene error boundary offers return-to-joins recovery;
  it cannot recover every driver crash or context-loss failure.

## Verification

Local verification: 310 root tests and 880 Cloth Lab tests passed; lint passed
with 92/8 existing warnings and no errors; both production builds passed. The
final Playwright run exited 0 with 16 first-attempt passes and three retry passes.
See the matching CHANGELOG entry for the earlier failures and their fixes.
Component and unit
tests exercise the real review, seam hook, importer, triangulation and assembly.
The App bridge tests mock the WebGL scene; they are not GPU validation.

Static component previews were inspected at desktop width and a 390px mobile
viewport in English and Arabic. This does not substitute for a real mobile
device or an authenticated full Cloth Lab session. Authenticated embedded/iframe
draping, GPU-deformed export/reopen fidelity and iOS Quick Look still need live
acceptance. No entitlement bypass was used.
