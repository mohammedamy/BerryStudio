---
name: close-out-wp
description: Close out a finished BerryStudio work package (WP) the way every WP in this repo's history has been closed - revert any temp local-test bypass, run the full test suites and lint, write a CHANGELOG.md entry in the established format, and ship it on its own branch/PR. Use when a change to BerryStudio (root app or cloth-lab) is code-complete and ready to land, or when the user says "close this out", "ship it", "wrap up this WP", or similar.
---

# Close out a BerryStudio work package

BerryStudio-Upgrade-Plan-v5.md WP-71. Every WP shipped in this repo's
`CHANGELOG.md` — going back to `BerryStudio-Upgrade-Plan.md`'s own WP-16 —
follows the same closing sequence, re-derived from memory each time by
whichever session happens to be finishing the work. That repetition is
exactly what a skill exists to make reliable: a step skipped from memory
(most concretely, forgetting to revert a temp bypass before committing —
this project has had to state that rule explicitly, more than once) is a
real, avoidable failure mode, not a hypothetical one.

**Do not auto-ship.** This skill runs the checklist and stops with a
clear summary before the commit/PR/merge step, exactly like every prior
WP in this repo has — the user (or the calling session) gives the final
go-ahead. Never invent a WP number, a title, or a "why" for the
CHANGELOG entry; ask if it isn't already obvious from the conversation.

## 1. Confirm what actually changed

Run `git status --short` and `git diff --stat` (against `main`, or the
current branch's own merge-base if already on a feature branch). Read the
diff, don't guess from memory of what you *intended* to change — this
step is what makes step 4's CHANGELOG entry accurate rather than
aspirational.

## 2. Revert any temp local-test bypass

Search for the established marker across the repo:

```bash
grep -rn "TEMP-LOCAL-TEST-BYPASS" cloth-lab/src js 2>/dev/null
```

The known location is `cloth-lab/src/EntitlementGate.jsx`'s
`if (true || isAllowed(result.entitlement))` — but grep the whole tree
rather than assuming only that one file, in case a different local-test
shortcut was added elsewhere during this session. Revert every match
found (restore the real condition, remove the `// TEMP-LOCAL-TEST-BYPASS`
comment) before continuing. If none are found, say so plainly rather than
silently skipping the step — a clean grep is itself the confirmation.

## 3. Run the full verification suite

Run whichever of these apply to what actually changed (step 1 tells you
which):

```bash
# Root app
node --test "test/**/*.test.js"
npm run lint

# cloth-lab
cd cloth-lab && npx vitest run
cd cloth-lab && npm run lint

# Only if e2e-relevant surfaces changed (UI flows, export formats, gating)
npx playwright test
```

A pre-existing lint warning in a file you didn't touch is not a blocker —
this repo's own CI step (WP-68) doesn't fail on warnings, only errors.
Compare against `git stash`-and-relint if you need to confirm a warning
is genuinely pre-existing rather than assume it. A NEW warning in a file
you *did* touch should be fixed before shipping, not carried forward.

Do not proceed to step 4 with a failing test or a new lint error. If a
failure can't be resolved, stop and report it — don't ship around it.

## 4. Write the CHANGELOG entry

Read `CHANGELOG.md`'s current top few entries first, to match the live
format exactly (it has drifted in small ways over the project's history —
copy the *current* convention, not a remembered one). Insert the new
entry **at the very top of the file**, immediately after the header
block (never appended at the bottom, never inserted mid-file).

Structure, matching the established idiom:

```markdown
## <WP number or short title>: <one-line summary of what actually shipped>

<1-3 sentence context: what problem this solves, referencing the real
plan/WP that scoped it if one exists (e.g. BerryStudio-Upgrade-Plan-v5.md
WP-N), and *why* now — a user report, a finding from a prior WP, etc.>

### Changed / Fixed / Added
<One bullet per real, distinct change. Name the actual file/function.
State root causes for bugs, not just symptoms. If something was found
and fixed WITHIN this same pass (not shipped broken), say so explicitly
— this repo's own convention treats that as worth documenting, not
hiding.>

### Verification
<Real, run commands and their real output numbers — test counts, lint
warning counts, specific things checked live in a browser. Never write
"tests pass" without the actual number. If something couldn't be
verified (a gating wall, a missing tool, a physical-device requirement),
say so honestly rather than omitting the item — this repo's own
convention is "a documented deferral is acceptable, a silent guess is
not.">
```

Full, honest technical detail is the house style here — see any existing
entry for the actual bar (they run long; that's normal for this repo, not
padding to trim).

## 5. Ship it

```bash
git checkout -b <short-descriptive-branch-name>
git add <only the files from step 1's diff — never a blind `git add -A`>
git commit -m "<detailed message, same content as the CHANGELOG entry,
ending with the Co-Authored-By trailer>"
git push -u origin <branch-name>
gh pr create --title "..." --body "..."
gh pr merge <number> --merge --delete-branch
```

Confirm the merge succeeded (`git log --oneline -1` on `main`, or
`gh pr view <number>`) before reporting done. Optionally, watch the real
CI run to completion (`gh run list --branch main --limit 1`, then
`gh run watch <id> --exit-status`) rather than only trusting local
verification — this repo's CI has caught real issues local runs missed.
