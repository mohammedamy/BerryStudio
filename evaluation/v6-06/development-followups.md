# Development findings for the next implementation packages

Evidence: `baseline-browser.json`, original development briefs, and the exact
generated coordinates in `browser-outputs.json`. No held-out case was run or
used to choose these changes. Historical baseline evidence is retained.

1. **Resolve inputs before generating geometry.** In the original baseline,
   all six text conflict cases, six negative-waist cases and six front-only
   image cases produced a draft. Text conflict/invalid-input cases remain open;
   the later image guard below addresses unreadable references only.
   Add explicit clarification/abstention decisions at the workflow boundary,
   then route resolved input through the reviewed-command/project contract.
   Exceptions and default/clamped measurements must not masquerade as safe
   abstention. Expected implementation belongs with V6-07's brief/proposal flow.

2. **Normalize ordinary length wording — fixed locally, 20 September.** `skirt-regular-en`, `skirt-small-en`,
   `dress-regular-en` and `trousers-regular-en` produce length factor 1.25 instead
   of 1 in the original baseline. The parser now recognizes spaced and
   hyphenated regular/medium/knee length cues with English word boundaries.
   Regression tests cover image precedence, all three families, Arabic
   equivalents and sleeve masking. The post-fix text report is
   `development-length-fix-local.json`: zero length-intent failures and
   10 passes / 20 failures / 6 image cases not run. One corrected dress still
   fails validation; fixing length does not establish correct construction.

3. **Review eight validator failures with a maker.** The two skirt failures
   (`skirt-long-en`, `skirt-small-ar`) report seam-length parity. Six dress
   outputs (regular, long and small, both languages) report parity; four also
   report ease. Pairing and seam checks contain heuristic assumptions, so do
   not “fix” them by adjusting geometry until the actual mating stitch lines,
   units, ease intent and required construction are independently established.
   Preserve failure evidence and distinguish a harness/validator assumption
   from a demonstrated pattern defect.

4. **Handle unusable image evidence explicitly — local readability guard added.** All six low-contrast image
   references decode, but the local analyzer reports `usedImage: false`.
   The local generator now returns `clarify` with reason `unreadable-image`
   and no geometry before drafting. A bilingual app dialog requests a clearer
   image or explicit removal for text-only generation. View/calibration checks
   for readable images and remote-provider reconciliation remain open.
   The successful high-contrast control
   establishes that this was not a broken image-decoding harness. Add reviewed,
   permissioned real-image examples before claims about image-to-pattern quality.

Repeat development evaluation after each fix and retain the original reports.
The 24 held-outs stay untouched until the later release-evaluation gate. No
automated pass is a substitute for the signed maker rubric or a sewn sample.
