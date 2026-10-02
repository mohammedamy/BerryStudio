const clone = value => JSON.parse(JSON.stringify(value));

const ROLES = new Set(['designer', 'maker', 'designer-maker']);
const LANGUAGES = new Set(['en', 'ar']);
const STATUSES = new Set(['not-run', 'abandoned', 'completed']);
const SEQUENCES = new Set(['baseline-first', 'berry-first']);
const MAKER_VERDICTS = new Set(['pending', 'major-rework', 'minor-rework', 'accepted-draft']);
const SAMPLE_STATUSES = new Set(['not-made', 'in-progress', 'made-unreviewed', 'maker-reviewed', 'fit-reviewed']);
const DEFECT_SEVERITIES = new Set(['minor', 'major', 'critical']);
const DEFECT_TYPES = new Set([
  'data-loss', 'lock-violation', 'invalid-geometry', 'invalid-join',
  'export-scale', 'translation-mismatch', 'fit-failure', 'other',
]);

const requireValue = (condition, message) => {
  if (!condition) throw new Error(message);
};
const isNullableFinitePositive = value => value === null || (Number.isFinite(value) && value > 0);
const isIsoInstant = value => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
const isIsoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function validatePilotSession(input) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input), 'Pilot session must be an object');
  requireValue(input.schema === 'berrystudio.pilot-session.v1', 'Unsupported pilot-session schema');
  requireValue(typeof input.sessionId === 'string' && /^[a-z0-9][a-z0-9_-]{2,63}$/i.test(input.sessionId), 'Invalid sessionId');
  requireValue(typeof input.participantId === 'string' && /^[a-z0-9][a-z0-9_-]{2,63}$/i.test(input.participantId), 'Invalid pseudonymous participantId');
  requireValue(ROLES.has(input.role), 'Invalid pilot role');
  requireValue(LANGUAGES.has(input.language), 'Invalid pilot language');
  const comparison = input.comparison;
  requireValue(comparison && typeof comparison === 'object' && !Array.isArray(comparison), 'Missing task comparison');
  requireValue(typeof comparison.protocolId === 'string' && /^[a-z0-9][a-z0-9._-]{2,79}$/i.test(comparison.protocolId), 'Invalid protocolId');
  requireValue(typeof comparison.baselineTaskId === 'string' && /^[a-z0-9][a-z0-9._-]{2,79}$/i.test(comparison.baselineTaskId), 'Invalid baselineTaskId');
  requireValue(typeof comparison.berryTaskId === 'string' && /^[a-z0-9][a-z0-9._-]{2,79}$/i.test(comparison.berryTaskId), 'Invalid berryTaskId');
  requireValue(comparison.baselineTaskId !== comparison.berryTaskId, 'Baseline and BerryStudio tasks must differ');
  requireValue(SEQUENCES.has(comparison.sequence), 'Invalid comparison sequence');
  requireValue(STATUSES.has(input.status), 'Invalid pilot status');
  requireValue(input.startedAt === null || isIsoInstant(input.startedAt), 'Invalid startedAt');
  requireValue(input.completedAt === null || isIsoInstant(input.completedAt), 'Invalid completedAt');
  if (input.startedAt && input.completedAt) requireValue(Date.parse(input.completedAt) >= Date.parse(input.startedAt), 'completedAt precedes startedAt');

  const outcome = input.outcome;
  requireValue(outcome && typeof outcome === 'object' && !Array.isArray(outcome), 'Missing pilot outcome');
  requireValue(outcome.reviewedExport === null || typeof outcome.reviewedExport === 'boolean', 'Invalid reviewedExport');
  requireValue(outcome.unaided === null || typeof outcome.unaided === 'boolean', 'Invalid unaided value');
  requireValue(isNullableFinitePositive(outcome.baselineMinutes), 'Invalid baselineMinutes');
  requireValue(isNullableFinitePositive(outcome.completionMinutes), 'Invalid completionMinutes');
  requireValue(Number.isSafeInteger(outcome.assistanceEvents) && outcome.assistanceEvents >= 0, 'Invalid assistanceEvents');

  if (input.status === 'not-run') {
    requireValue(input.startedAt === null && input.completedAt === null, 'Not-run sessions cannot have timestamps');
    requireValue(outcome.reviewedExport === null && outcome.unaided === null, 'Not-run sessions cannot claim an outcome');
    requireValue(outcome.baselineMinutes === null && outcome.completionMinutes === null, 'Not-run sessions cannot claim timing');
    requireValue(outcome.assistanceEvents === 0, 'Not-run sessions cannot record assistance');
  } else {
    requireValue(isIsoInstant(input.startedAt), 'Executed sessions require startedAt');
  }
  if (input.status === 'completed') {
    requireValue(isIsoInstant(input.completedAt), 'Completed sessions require completedAt');
    requireValue(typeof outcome.reviewedExport === 'boolean', 'Completed sessions require reviewedExport');
  }
  if (outcome.reviewedExport === true) {
    requireValue(input.status === 'completed', 'Reviewed export requires a completed session');
    requireValue(typeof outcome.unaided === 'boolean', 'Reviewed export requires an unaided decision');
    requireValue(Number.isFinite(outcome.baselineMinutes) && Number.isFinite(outcome.completionMinutes), 'Reviewed export requires paired timing');
  } else {
    requireValue(outcome.unaided === null, 'Unaided is only defined for a reviewed export');
    requireValue(outcome.completionMinutes === null, 'Completion time is only defined for a reviewed export');
  }
  requireValue(!(outcome.unaided === true && outcome.assistanceEvents > 0), 'An assisted session cannot be marked unaided');

  requireValue(Array.isArray(input.activityDates) && input.activityDates.every(isIsoDate), 'Invalid activityDates');
  requireValue(new Set(input.activityDates).size === input.activityDates.length, 'Duplicate activity date');
  if (input.status === 'not-run') requireValue(input.activityDates.length === 0, 'Not-run sessions cannot record activity');

  requireValue(Array.isArray(input.defects), 'Defects must be an array');
  const defectIds = new Set();
  for (const defect of input.defects) {
    requireValue(defect && typeof defect === 'object', 'Invalid defect');
    requireValue(typeof defect.id === 'string' && defect.id.trim(), 'Defect requires an id');
    requireValue(!defectIds.has(defect.id), 'Duplicate defect id'); defectIds.add(defect.id);
    requireValue(DEFECT_SEVERITIES.has(defect.severity), 'Invalid defect severity');
    requireValue(DEFECT_TYPES.has(defect.type), 'Invalid defect type');
    requireValue(typeof defect.summary === 'string' && defect.summary.trim(), 'Defect requires a summary');
    requireValue(Array.isArray(defect.evidence) && defect.evidence.length > 0 && defect.evidence.every(item => typeof item === 'string' && item.trim()), 'Defect requires evidence');
  }
  if (input.status === 'not-run') requireValue(input.defects.length === 0, 'Not-run sessions cannot record defects');

  const maker = input.makerReview;
  requireValue(maker && MAKER_VERDICTS.has(maker.verdict), 'Invalid maker verdict');
  requireValue(maker.reviewerId === null || (typeof maker.reviewerId === 'string' && /^[a-z0-9][a-z0-9_-]{2,63}$/i.test(maker.reviewerId)), 'Invalid maker reviewerId');
  requireValue(maker.reviewedAt === null || isIsoInstant(maker.reviewedAt), 'Invalid maker reviewedAt');
  requireValue(Array.isArray(maker.evidence) && maker.evidence.every(item => typeof item === 'string' && item.trim()), 'Invalid maker evidence');
  if (maker.verdict === 'pending') {
    requireValue(maker.reviewerId === null && maker.reviewedAt === null && maker.evidence.length === 0, 'Pending maker review cannot claim evidence');
  } else {
    requireValue(maker.reviewerId && maker.reviewedAt && maker.evidence.length > 0, 'Maker verdict requires a named reviewer, timestamp and evidence');
  }
  requireValue(SAMPLE_STATUSES.has(input.sampleStatus), 'Invalid sample status');
  if (input.status === 'not-run') requireValue(maker.verdict === 'pending' && input.sampleStatus === 'not-made', 'Not-run sessions cannot claim maker or sample evidence');

  return clone(input);
}

const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const outcomeCounts = sessions => ({
  requested: sessions.length,
  executed: sessions.filter(session => session.status !== 'not-run').length,
  completed: sessions.filter(session => session.status === 'completed').length,
  reviewedExports: sessions.filter(session => session.outcome.reviewedExport === true).length,
  unaidedReviewedExports: sessions.filter(session => session.outcome.reviewedExport === true && session.outcome.unaided === true).length,
});

const assessment = (enoughEvidence, passed) => enoughEvidence ? (passed ? 'pass' : 'fail') : 'insufficient-evidence';

export function summarizePilotSessions(inputSessions, { pilotEndDate = null } = {}) {
  requireValue(Array.isArray(inputSessions), 'Pilot sessions must be an array');
  const sessions = inputSessions.map(validatePilotSession);
  const sessionIds = new Set(), participantIds = new Set();
  for (const session of sessions) {
    requireValue(!sessionIds.has(session.sessionId), 'Duplicate sessionId');
    sessionIds.add(session.sessionId); participantIds.add(session.participantId);
  }

  const counts = outcomeCounts(sessions);
  const timed = sessions.filter(session => session.outcome.reviewedExport === true);
  const reductions = timed.map(session => (session.outcome.baselineMinutes - session.outcome.completionMinutes) / session.outcome.baselineMinutes);
  const criticalDataLoss = sessions.flatMap(session => session.defects.map(defect => ({ sessionId: session.sessionId, ...defect })))
    .filter(defect => defect.severity === 'critical' && defect.type === 'data-loss');
  const cohortReady = participantIds.size >= 8;
  const executionReady = cohortReady && counts.executed >= 8;
  const unaidedRate = counts.requested ? counts.unaidedReviewedExports / counts.requested : null;
  const medianTimeReduction = median(reductions);

  const allActivityDates = sessions.flatMap(session => session.activityDates);
  const endDate = pilotEndDate || (allActivityDates.length ? [...allActivityDates].sort().at(-1) : null);
  if (endDate !== null) requireValue(isIsoDate(endDate), 'Invalid pilotEndDate');
  const weeklyActivity = [];
  if (endDate) {
    const end = Date.parse(`${endDate}T00:00:00.000Z`);
    for (let offset = 3; offset >= 0; offset--) {
      const weekEnd = new Date(end - offset * 7 * 86400000);
      const weekStart = new Date(weekEnd.getTime() - 6 * 86400000);
      const active = new Set(sessions.filter(session => session.activityDates.some(date => {
        const timestamp = Date.parse(`${date}T00:00:00.000Z`);
        return timestamp >= weekStart.getTime() && timestamp <= weekEnd.getTime();
      })).map(session => session.participantId));
      weeklyActivity.push({
        startDate: weekStart.toISOString().slice(0, 10),
        endDate: weekEnd.toISOString().slice(0, 10),
        activeParticipants: active.size,
        activeRate: participantIds.size ? active.size / participantIds.size : null,
      });
    }
  }

  const groupBy = selector => Object.fromEntries([...new Set(sessions.map(selector))].sort().map(value => [value, outcomeCounts(sessions.filter(session => selector(session) === value))]));
  const countValues = selector => Object.fromEntries([...new Set(sessions.map(selector))].sort().map(value => [value, sessions.filter(session => selector(session) === value).length]));
  return {
    schema: 'berrystudio.pilot-summary.v1',
    participantCount: participantIds.size,
    ...counts,
    unaidedReviewedExportRatePerRequestedSession: unaidedRate,
    timedComparisonCount: timed.length,
    medianBaselineMinutes: median(timed.map(session => session.outcome.baselineMinutes)),
    medianCompletionMinutes: median(timed.map(session => session.outcome.completionMinutes)),
    medianTimeReduction,
    criticalDataLossDefectCount: criticalDataLoss.length,
    criticalDataLossDefects: criticalDataLoss,
    makerReviewedSessionCount: sessions.filter(session => session.makerReview.verdict !== 'pending').length,
    sampleStatusCounts: Object.fromEntries([...SAMPLE_STATUSES].map(status => [status, sessions.filter(session => session.sampleStatus === status).length])),
    byLanguage: groupBy(session => session.language),
    byRole: groupBy(session => session.role),
    bySequence: groupBy(session => session.comparison.sequence),
    taskAssignments: {
      baseline: countValues(session => session.comparison.baselineTaskId),
      berryStudio: countValues(session => session.comparison.berryTaskId),
    },
    weeklyActivity,
    gates: {
      cohortSize8To12: participantIds.size < 8 ? 'insufficient-evidence' : participantIds.size <= 12 ? 'pass' : 'fail',
      unaidedReviewedExportAtLeast80Percent: assessment(executionReady, unaidedRate !== null && unaidedRate >= 0.8),
      medianTimeReductionAtLeast30Percent: assessment(cohortReady && timed.length >= 8, medianTimeReduction !== null && medianTimeReduction >= 0.3),
      noCriticalDataLossDefect: criticalDataLoss.length ? 'fail' : assessment(executionReady, true),
    },
    limitations: [
      'This summary reports submitted pilot records; it does not recruit participants or observe sessions.',
      'Not-run sessions remain in the completion denominator.',
      'Maker and sample evidence are reported separately from automated geometry checks.',
      'A gate with too few real participants is insufficient-evidence, never a pass.',
    ],
  };
}
