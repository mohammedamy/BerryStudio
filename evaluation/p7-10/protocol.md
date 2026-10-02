# P7-10 professional pilot protocol v1

## Research plan

**Objective.** Determine whether professional designers and makers can move
from a supplied woven-skirt brief to a reviewed BerryStudio export without
facilitator help, and whether observed active time is lower than a matched task
in their normal workflow. Record defects and maker/sample evidence separately;
do not interpret task completion as fit or production approval.

**Method.** Moderated, counterbalanced comparative usability sessions using the
two bounded briefs in `task-set.json`. Each participant completes one brief in
their normal workflow and the other in BerryStudio. Odd/even participant slots
swap both task and sequence to reduce task-difficulty and learning-order bias.

**Participants.** Recruit 8–12 working designers and/or makers. The cohort must
include at least four people who routinely draft or edit patterns, at least four
who routinely review construction or sew samples, and at least four sessions in
each interface language. Roles may overlap. Recruitment, consent, contact data,
compensation and recordings are managed outside this repository.

**Primary measures.** Requested sessions, unaided reviewed exports per requested
session, paired observed active minutes, critical data-loss defects and maker
verdicts. Secondary measures are assistance events, abandonments, weekly
activity, language/role splits and sample status. Report denominators beside
every rate.

**Exclusions.** This protocol does not test trousers, unbounded construction,
provider image quality, subscription willingness, pricing, physical iOS Quick
Look, or fit claims. Findings do not advance P7-11 automatically.

## Session guide (60 minutes)

### 1. Warm-up — 5 minutes

- Confirm consent was handled in the approved external system.
- Explain that the product, not the participant, is being evaluated.
- Ask permission separately before recording; a refusal does not exclude the
  session.
- Assign only the pseudonymous participant and session IDs to repository data.

### 2. Context — 10 minutes

- What tools do you normally use from measurements to reviewed export?
- Which parts do you personally draft, review, sew or hand off?
- What makes an export ready for another professional to inspect?
- Which language do you prefer for the task?

Do not turn recalled duration into `baselineMinutes`. That field is observed
active time from the comparison task in this session.

### 3. Matched comparison — 30 minutes

Use the assignment in `task-set.json`. Read the selected task verbatim in the
participant's chosen language and provide the measurements as written.

For each task:

1. Start active timing after the task and measurements are understood.
2. Ask the participant to think aloud, without teaching the workflow.
3. Pause timing for interruptions unrelated to the task or facilitator-caused
   technical resets.
4. End timing only when the completion criteria are met or the participant
   abandons the task.

The moderator may repeat the brief or clarify test logistics without recording
assistance. Any hint about where to click, what value to choose, how to recover,
or how to interpret a product warning is one assistance event and makes the
BerryStudio outcome not unaided. Technical recovery caused by the research
setup is noted separately and must not conceal product data loss.

### 4. Reaction and maker review — 10 minutes

- What, if anything, would you correct before another professional used this?
- Which limitations or warnings affected your trust?
- Can you identify the measurement source, selected configuration and accepted
  revision from the exported artifacts?
- If qualified to review construction, inspect the packet and export using the
  existing maker rubric. A non-pending verdict requires reviewer ID, timestamp
  and evidence; task completion alone never fills it.

### 5. Wrap-up — 5 minutes

- What was hardest or unexpectedly easy?
- Where did you need information BerryStudio did not provide?
- Would you use the reviewed export in your next step? Why or why not?
- What important issue did this session miss?

Thank the participant, confirm compensation externally, and record only the
pseudonymous session data in `evaluation/p7-10/private/`.

## Stop and escalation rules

Stop the affected task immediately for consent/privacy concerns, suspected
loss or corruption of participant work, export scale corruption, or a safety
issue. A critical data-loss defect pauses new pilot sessions until triaged and
the owner explicitly resumes them. Do not coach around a product failure to
manufacture completion.

Two consecutive sessions blocked by the same infrastructure problem trigger a
protocol pause and environment review. Product usability difficulty is data,
not an infrastructure exception.

## Analysis and reporting

Run the deterministic local summary only on reviewed session files. Do not
claim a quantitative gate with fewer than eight executed participants. Inspect
English/Arabic, role, task and sequence splits before interpreting the combined
median. Report maker acceptance and sample outcomes independently. Quotes,
recordings and identifiable details require the separate consent-controlled
research system and are not copied into this repository.
