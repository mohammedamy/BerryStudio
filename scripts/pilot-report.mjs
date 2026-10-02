const percent = value => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const minutes = value => value === null ? '—' : Number(value.toFixed(1)).toString();
const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

const gateLabels = {
  cohortSize8To12: 'Cohort size is 8–12 unique participants',
  protocolCoverage: 'Language, role, protocol, task and sequence coverage',
  unaidedReviewedExportAtLeast80Percent: 'Unaided reviewed exports ≥80% of requested sessions',
  medianTimeReductionAtLeast30Percent: 'Median paired time reduction ≥30%',
  noCriticalDataLossDefect: 'No critical data-loss defect',
};

const countTable = groups => {
  const rows = Object.entries(groups).map(([name, counts]) =>
    `| ${cell(name)} | ${counts.requested} | ${counts.executed} | ${counts.reviewedExports} | ${counts.unaidedReviewedExports} |`);
  return ['| Group | Requested | Executed | Reviewed exports | Unaided reviewed exports |', '|---|---:|---:|---:|---:|', ...rows].join('\n');
};

export function renderPilotSummaryMarkdown(summary) {
  if (!summary || summary.schema !== 'berrystudio.pilot-summary.v1') throw new Error('Unsupported pilot summary');
  const gateValues = Object.values(summary.gates);
  const status = gateValues.includes('fail')
    ? 'Exit gates not met'
    : gateValues.every(value => value === 'pass')
      ? 'All computed pilot gates pass'
      : 'Insufficient evidence';
  const gateRows = Object.entries(summary.gates).map(([key, value]) => `| ${cell(gateLabels[key] || key)} | ${value} |`);
  const criticalDefects = summary.criticalDataLossDefects.length
    ? summary.criticalDataLossDefects.map(defect => `- **${cell(defect.sessionId)} / ${cell(defect.id)}:** ${cell(defect.summary)} — evidence: ${defect.evidence.map(cell).join(', ')}`).join('\n')
    : `None recorded across ${summary.executed} executed session${summary.executed === 1 ? '' : 's'}.`;
  const weeklyRows = summary.weeklyActivity.length
    ? summary.weeklyActivity.map(week => `| ${week.startDate}–${week.endDate} | ${week.activeParticipants} | ${percent(week.activeRate)} |`).join('\n')
    : '| — | — | — |';
  const sampleRows = Object.entries(summary.sampleStatusCounts).map(([name, count]) => `| ${cell(name)} | ${count} |`).join('\n');

  return `# P7-10 professional pilot summary

> **Status: ${status}.** This deterministic report summarizes submitted pilot records. It is not maker approval, sample approval, fit evidence, or a recruitment claim.

## Cohort and completion

| Metric | Result |
|---|---:|
| Unique participants | ${summary.participantCount} |
| Requested sessions | ${summary.requested} |
| Executed sessions | ${summary.executed} |
| Completed sessions | ${summary.completed} |
| Reviewed exports | ${summary.reviewedExports} |
| Unaided reviewed exports | ${summary.unaidedReviewedExports} |
| Unaided reviewed exports / requested | ${percent(summary.unaidedReviewedExportRatePerRequestedSession)} (${summary.unaidedReviewedExports}/${summary.requested}) |
| Consent-confirmed executed sessions | ${summary.consentConfirmedSessionCount}/${summary.executed} |

## Exit gates

| Gate | Result |
|---|---|
${gateRows.join('\n')}

## Paired timing

| Metric | Result |
|---|---:|
| Paired comparisons | ${summary.timedComparisonCount} |
| Median normal-workflow baseline | ${minutes(summary.medianBaselineMinutes)} min |
| Median BerryStudio completion | ${minutes(summary.medianCompletionMinutes)} min |
| Median paired reduction | ${percent(summary.medianTimeReduction)} |

## Cohort coverage

| Coverage item | Result |
|---|---:|
| English sessions | ${summary.cohortCoverage.englishSessions} |
| Arabic sessions | ${summary.cohortCoverage.arabicSessions} |
| Designer-capable participants | ${summary.cohortCoverage.designerCapableParticipants} |
| Maker-capable participants | ${summary.cohortCoverage.makerCapableParticipants} |
| One protocol | ${summary.cohortCoverage.oneProtocol} |
| Two matched tasks | ${summary.cohortCoverage.twoMatchedTasks} |
| Sequence balanced | ${summary.cohortCoverage.sequenceBalanced} |
| Baseline tasks balanced | ${summary.cohortCoverage.baselineTasksBalanced} |
| BerryStudio tasks balanced | ${summary.cohortCoverage.berryTasksBalanced} |

### By language

${countTable(summary.byLanguage)}

### By professional role

${countTable(summary.byRole)}

### By sequence

${countTable(summary.bySequence)}

## Maker and sample evidence

Maker-reviewed sessions: **${summary.makerReviewedSessionCount}/${summary.requested} requested**.

| Sample status | Sessions |
|---|---:|
${sampleRows}

## Critical data-loss defects

${criticalDefects}

## Activity in the final four windows

| Window | Active participants | Active rate |
|---|---:|---:|
${weeklyRows}

## Limitations

${summary.limitations.map(item => `- ${cell(item)}`).join('\n')}
`;
}
