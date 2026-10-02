import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizePilotSessions, validatePilotSession } from '../scripts/pilot-evidence.mjs';

const session = (id, overrides = {}) => ({
  schema: 'berrystudio.pilot-session.v1',
  sessionId: `session-${id}`,
  participantId: `pilot-${id}`,
  role: 'designer-maker',
  language: id % 2 ? 'ar' : 'en',
  status: 'completed',
  startedAt: '2026-10-01T09:00:00.000Z',
  completedAt: '2026-10-01T10:00:00.000Z',
  outcome: { reviewedExport: true, unaided: true, baselineMinutes: 100, completionMinutes: 60, assistanceEvents: 0 },
  activityDates: ['2026-10-01'],
  defects: [],
  makerReview: { verdict: 'pending', reviewerId: null, reviewedAt: null, evidence: [] },
  sampleStatus: 'not-made',
  ...overrides,
});

test('pilot session validation preserves an honest completed record', () => {
  const input = session(1);
  const validated = validatePilotSession(input);
  assert.deepEqual(validated, input);
  input.outcome.completionMinutes = 1;
  assert.equal(validated.outcome.completionMinutes, 60);
});

test('pilot records reject false unaided, not-run and maker-review claims', () => {
  assert.throws(() => validatePilotSession(session(1, { outcome: { reviewedExport: true, unaided: true, baselineMinutes: 100, completionMinutes: 60, assistanceEvents: 1 } })), /assisted session/);
  assert.throws(() => validatePilotSession(session(2, { status: 'not-run', startedAt: null, completedAt: null })), /Not-run sessions cannot claim an outcome/);
  assert.throws(() => validatePilotSession(session(3, { makerReview: { verdict: 'accepted-draft', reviewerId: null, reviewedAt: null, evidence: [] } })), /named reviewer/);
});

test('not-run sessions remain in the completion denominator', () => {
  const rows = Array.from({ length: 8 }, (_, index) => session(index + 1));
  rows[6].outcome.unaided = false;
  rows[6].outcome.assistanceEvents = 2;
  rows[7] = session(8, {
    status: 'not-run', startedAt: null, completedAt: null,
    outcome: { reviewedExport: null, unaided: null, baselineMinutes: null, completionMinutes: null, assistanceEvents: 0 },
    activityDates: [],
  });
  const summary = summarizePilotSessions(rows, { pilotEndDate: '2026-10-01' });
  assert.equal(summary.requested, 8);
  assert.equal(summary.unaidedReviewedExports, 6);
  assert.equal(summary.unaidedReviewedExportRatePerRequestedSession, 0.75);
  assert.equal(summary.gates.unaidedReviewedExportAtLeast80Percent, 'fail');
  assert.equal(summary.gates.medianTimeReductionAtLeast30Percent, 'insufficient-evidence');
});

test('small synthetic-looking samples never pass the pilot gates', () => {
  const summary = summarizePilotSessions([session(1), session(2)]);
  assert.equal(summary.medianTimeReduction, 0.4);
  assert.equal(summary.gates.unaidedReviewedExportAtLeast80Percent, 'insufficient-evidence');
  assert.equal(summary.gates.medianTimeReductionAtLeast30Percent, 'insufficient-evidence');
  assert.equal(summary.gates.noCriticalDataLossDefect, 'insufficient-evidence');
});

test('scheduled but unexecuted cohorts cannot pass the no-data-loss gate', () => {
  const rows = Array.from({ length: 8 }, (_, index) => session(index + 1, {
    status: 'not-run', startedAt: null, completedAt: null,
    outcome: { reviewedExport: null, unaided: null, baselineMinutes: null, completionMinutes: null, assistanceEvents: 0 },
    activityDates: [],
  }));
  const summary = summarizePilotSessions(rows);
  assert.equal(summary.participantCount, 8);
  assert.equal(summary.executed, 0);
  assert.equal(summary.gates.noCriticalDataLossDefect, 'insufficient-evidence');
});

test('eight complete real records can satisfy declared numeric gates', () => {
  const summary = summarizePilotSessions(Array.from({ length: 8 }, (_, index) => session(index + 1)), { pilotEndDate: '2026-10-01' });
  assert.equal(summary.gates.cohortSize8To12, 'pass');
  assert.equal(summary.gates.unaidedReviewedExportAtLeast80Percent, 'pass');
  assert.equal(summary.gates.medianTimeReductionAtLeast30Percent, 'pass');
  assert.equal(summary.gates.noCriticalDataLossDefect, 'pass');
  assert.deepEqual(summary.byLanguage.en, { requested: 4, executed: 4, completed: 4, reviewedExports: 4, unaidedReviewedExports: 4 });
  assert.deepEqual(summary.weeklyActivity.at(-1), { startDate: '2026-09-25', endDate: '2026-10-01', activeParticipants: 8, activeRate: 1 });
});

test('a critical data-loss defect fails the gate even with otherwise strong results', () => {
  const rows = Array.from({ length: 8 }, (_, index) => session(index + 1));
  rows[3].defects = [{ id: 'loss-1', severity: 'critical', type: 'data-loss', summary: 'Saved revision disappeared', evidence: ['screen-recording-4'] }];
  const summary = summarizePilotSessions(rows);
  assert.equal(summary.criticalDataLossDefectCount, 1);
  assert.equal(summary.gates.noCriticalDataLossDefect, 'fail');
  assert.equal(summary.criticalDataLossDefects[0].sessionId, 'session-4');
});

test('invalid calendar dates and cohorts above the declared 8–12 range are rejected or failed explicitly', () => {
  assert.throws(() => validatePilotSession(session(1, { activityDates: ['2026-02-31'] })), /Invalid activityDates/);
  const summary = summarizePilotSessions(Array.from({ length: 13 }, (_, index) => session(index + 1)));
  assert.equal(summary.gates.cohortSize8To12, 'fail');
});
