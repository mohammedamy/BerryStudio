# V6-06 evaluation corpus — engineering baseline

Status: engineering corpus plus text and browser/image development baselines
ready; maker review, calibrated real references and remote/multi-view evaluation
remain open. A local parser fix now recognizes hyphenated standard-length cues;
historical baselines are preserved separately from post-fix evidence.

## Corpus and split

`corpus.json` contains 60 briefs: 20 each for woven skirt, basic woven dress,
and simple woven trousers; 30 Arabic and 30 English. Each scenario has a
translation pair with a stable group ID. The paired variants stay in the same
split to avoid translation leakage: 36 development tasks and 24 holdouts.
The holdouts include short length, 5XL, missing measurements and paired views.
Development includes regular/long length, XXS, conflicting measurements,
invalid measurements and a missing back view. This is a deliberately small
stratified challenge set, not a representative estimate of customer traffic.

Do not tune prompts or generator rules against holdouts. The tasks are public
repository fixtures, so this is a process-enforced holdout, not a secret or
independently administered benchmark. Freeze task IDs, groups and expected
decisions before tuning; version any later corpus change and retain its old
baseline. A maker must review the briefs, translations and construction
expectations before treating this as an acceptance benchmark.

Measurements are synthetic standard-size fixtures with explicit cm units;
there are no real customer body measurements. Negative/conflicting/missing
values deliberately test refusal or clarification. The initial family scope
does not imply that V6-04's nominated blocks have maker approval.

## References and rights

Six repository-authored SVG schematic diagrams form three front/back pairs.
The manifest records provenance, permitted evaluation/reproduction use and
limitations for each asset. No downloaded fashion photography or external
dataset is included. These diagrams have no calibrated scale and are not
validated construction references. Image tasks therefore expect clarification
about unavailable information, not guessed seam topology or fit.

Real garment photos, calibrated views and maker-approved expected construction
remain a later addition. For each, record creator, exact source, permission or
license, permitted transformations, attribution and relevant consent before
admission. Do not infer rights from public availability.

## Running the baseline

From the repository root:

```sh
node scripts/evaluate-v6.mjs > /tmp/v6-06-current.json
node --test test/evaluation.test.js
```

Default execution excludes holdouts entirely. `--include-holdout` is an
explicit release-evaluation option; record the evaluated commit and do not
use that run for tuning. It has **not** been run for this initial baseline.

`baseline-local.json` records the initial development result and SHA-256 hashes
of the corpus, reference files, generator, geometry/validator dependencies and
evaluation code. Preserve this baseline when improving the product; write new
results separately. Output is deterministic and deliberately has no wall-clock
timestamp. Hashes establish what was evaluated, not a claim of human review.

The adapter calls the shipped `AIGen.deriveStyle` and `AIGen.build` with real
`computeMeasurements` inputs and the real validator/offset function. It omits
the orchestrator's artificial waiting stages and does not invoke a provider,
account flow, image decoder or browser UI. It is therefore a local text-core
baseline, not an end-to-end product or model comparison. Exceptions count as
failures; they never count as safe abstention.

## Initial result

| Development denominator | Result |
|---|---:|
| Requested | 36 |
| Executed text tasks | 30 |
| Automated passes | 7 |
| Automated failures | 23 |
| Image tasks not run | 6 |
| Holdouts not executed | 24 |
| Maker-reviewed tasks | 0 |

Execution coverage is 30/36 (83.3%). Automated pass rate among executed tasks
is 7/30 (23.3%); passes per requested development task are 7/36 (19.4%). These
denominators must travel with any presentation of the result. Neither number
is garment accuracy, fit accuracy or maker acceptance. Maker acceptance is
unknown, not zero. Family, language, input and split breakdowns are in the JSON.

The observed failure tags overlap: 4 wrong-length interpretations, 8 tasks
with validator failures, 6 missing clarifications, 6 missing abstentions and
12 drafts produced before resolving invalid/ambiguous inputs. Do not sum tags
as independent failed tasks. Expected clarification/abstention is scored
against the local core's actual draft output, exposing its missing policy
layer rather than silently adding that layer inside the evaluator.

An automated draft pass requires the expected family, requested length factor,
finite outlines with at least three points and zero validator failures. It
does not establish full measurement adherence, correct piece inventory or
construction topology. Validator warnings/deferred checks remain visible.
No image case is quietly converted into a text-only case. Latency, device
behavior, lock preservation, provider cost, time to accepted draft and sewn
fit are unmeasured in this runner and are listed as such in the report.

## Browser/image development result

The dedicated Chromium harness runs the actual `AIGen.generate` orchestration,
including image decoding and heuristic silhouette analysis, with the original
reference bytes. It uses a separate loopback Node server, enforces its CSP,
blocks remote requests and refuses held-out tasks. The harness does not modify
account gates or generation behavior. This is a local pipeline evaluation, not a
test of paid providers or the complete production interface.

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/berry-playwright-browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/berry-playwright-browsers npm run evaluate:v6:browser
```

The test writes `report.json` and `outputs.json` into its directory beneath
`test-results/evaluation/`. Reviewed snapshots are retained here as
`baseline-browser.json` and `browser-outputs.json`. The report hashes the
output bundle; each row also hashes its exact generated piece geometry.
Keep historical snapshots when changing the generator. Browser version and
platform are recorded. Elapsed times vary and include the generator's
artificial stage waits; they are not time-to-accepted-design measurements.

**36 development cases executed: 7 automated passes, 29 failures, none skipped.**
The pass rate is 7/36 (19.4%), with 100% execution coverage; all 24 holdouts
remain untouched. All six image inputs decoded as 200×220 images, but the
analyzer returned `usedImage: false` for their low-contrast schematic silhouettes.
Generation fell back to text and produced drafts instead of asking about the
missing back/scale. These six cases correctly fail the decision requirement.
A separate high-contrast rectangular control yields `ok: true` from the real
image analyzer; it is not counted as a corpus case and does not alter fixtures.

Overlapping failure tags now include 12 missing clarifications, 6 missing
abstentions, 18 drafts before resolution, 4 length-intent errors and 8 validator
failures. The initial text-only baseline above is preserved, not overwritten.
None of these results imply maker approval, correct sewn fit or performance
on real garment photos. The harness deliberately rejects multi-reference input
rather than discarding views; that adapter remains future work.

For maker inspection, match the `taskId` in `browser-outputs.json` with the
report row and original corpus brief. The bundle contains actual raw generated
piece coordinates in centimetres, not positioned import projects or approved
patterns. Copy the geometry hash into the maker record; assign project/revision
IDs if the geometry is subsequently saved in the app. See
[development-followups.md](development-followups.md) for observed failures.

## 20 September development correction

The parser now accepts both spaced and hyphenated regular/medium/knee length
cues, retaining Arabic equivalents and sleeve masking. Two regression tests
also prove explicit length overrides image proportions and matches whole words.
Historical baselines above remain unchanged. New evidence:

| Adapter | Pass | Fail | Not run | Report |
| --- | ---: | ---: | ---: | --- |
| Text core | 10 | 20 | 6 | `development-length-fix-local.json` |
| Browser text/image | 10 | 26 | 0 | `development-length-fix-browser.json` |

All four length-intent failures are resolved. The regular dress still fails
validation, so only three cases become passes. Browser geometry is retained in
`development-length-fix-outputs.json`, bound to the report by SHA-256. All 24
holdouts remain unexecuted. Eight validator failures and unresolved input/image
decisions remain; this improvement does not establish maker approval or fit.

## Local unreadable-image clarification

The local generator now stops before drafting when image analysis cannot find a
usable silhouette. It returns `decision: clarify`, `reason: unreadable-image`
and no pieces. The production interface presents recovery instructions in
English/Arabic, retaining the user's prompt, reference and current project.
Removing the reference explicitly allows text-only generation on retry.

`development-image-clarification-browser.json` records **16 passes / 20 failures
/ 0 skipped** across the same 36 development cases. Its geometry/decision bundle
is `development-image-clarification-outputs.json`. All six image cases now pass
the evaluator's coarse decision/no-draft check. This does **not** establish that
all required clarification questions were asked: missing views, known scale,
readable-reference ambiguity and remote-provider reconciliation remain open.
The 24 holdouts and all historical reports remain unchanged. Text conflicts,
invalid measurements and eight construction-validator failures remain open.

## Maker review and next work

Use [maker-rubric.md](maker-rubric.md) and copy `maker-review-template.json`
for each named review. All approvals in the corpus are intentionally null.
Remaining V6-06 acceptance work:

1. A named maker reviews the task expectations and Arabic/English equivalence,
   identifies required pieces/joins and approves or corrects each family rubric.
2. Extend the completed local single-reference adapter to permissioned,
   calibrated garment photos and explicitly supported multi-reference/provider
   workflows; do not infer physical scale from uncalibrated pixels.
3. Record manual correction counts, elapsed time and draft acceptance on actual
   revision IDs. Fit and sample approval require separately recorded evidence.
4. After tuning on development only, execute the frozen holdout once and report
   all tasks, abstentions, failures and not-run cases. Do not retune on it.

Billing/subscription work remains in the final phase.
