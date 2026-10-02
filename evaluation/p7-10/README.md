# P7-10 professional pilot evidence

This directory defines the first P7-10 evidence boundary. It does **not** claim
that a pilot has run, that participants have been recruited, or that any exit
gate has passed.

Use `session-template.json` once per requested pilot session. Replace the
placeholder participant and reviewer values with stable pseudonymous IDs; do
not store names, email addresses, recordings, consent forms, or other personal
data in this repository. Evidence fields should contain controlled artifact IDs
or paths, not public links containing participant information.

`scripts/pilot-evidence.mjs` validates completed, abandoned and not-run records
and creates a denominator-preserving summary. Important rules:

- not-run sessions remain in the unaided reviewed-export denominator;
- `unaided: true` is incompatible with recorded assistance;
- reviewed exports require paired baseline and completion times;
- maker verdicts require a pseudonymous reviewer, timestamp and evidence;
- sample status is reported separately and never inferred from geometry;
- cohorts below eight participants produce `insufficient-evidence`, not pass;
- any critical data-loss defect fails that gate immediately.

The summary reports English/Arabic and role counts separately, retains the
number of paired timing comparisons, and exposes four seven-day activity
windows. Real pilot reporting should publish the record count and denominator
beside every rate.

The session schema is `berrystudio.pilot-session.v1`; aggregate output is
`berrystudio.pilot-summary.v1`. Tests use synthetic records solely to verify
math and validation. They are not pilot evidence and must never be copied into
a results report.

## Local reporting workflow

Raw records and generated reports are ignored by Git. Create the local folders,
copy one fresh template per requested session, then summarize them explicitly:

```sh
mkdir -p evaluation/p7-10/private evaluation/p7-10/reports
cp evaluation/p7-10/session-template.json evaluation/p7-10/private/session-01.json
npm run pilot:summary -- --input-dir evaluation/p7-10/private --end-date 2026-10-31
```

To save a report, add `--output evaluation/p7-10/reports/summary.json`. The
command refuses to overwrite an existing report. Aggregates contain no
participant IDs or generation timestamp, so the same inputs produce the same
bytes. Critical-defect evidence identifiers and summaries remain present for
auditability; review them before sharing a report outside the pilot team.
