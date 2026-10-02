import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPilotSessions, parsePilotSummaryArgs, runPilotSummary } from '../scripts/summarize-pilot.mjs';

const record = id => ({
  schema: 'berrystudio.pilot-session.v1', sessionId: `session-${id}`, participantId: `pilot-${id}`,
  role: 'designer-maker', language: id % 2 ? 'ar' : 'en', status: 'completed',
  comparison: {
    protocolId: 'p7-10-woven-skirt-comparison-v1',
    baselineTaskId: id % 2 ? 'skirt-a' : 'skirt-b', berryTaskId: id % 2 ? 'skirt-b' : 'skirt-a',
    sequence: id % 2 ? 'baseline-first' : 'berry-first',
  },
  consentConfirmed: true,
  startedAt: '2026-10-01T09:00:00.000Z', completedAt: '2026-10-01T10:00:00.000Z',
  outcome: { reviewedExport: true, unaided: true, baselineMinutes: 100, completionMinutes: 60, assistanceEvents: 0 },
  activityDates: ['2026-10-01'], defects: [],
  makerReview: { verdict: 'pending', reviewerId: null, reviewedAt: null, evidence: [] }, sampleStatus: 'not-made',
});

const withDirectory = async callback => {
  const directory = await mkdtemp(join(tmpdir(), 'berry-pilot-'));
  try { return await callback(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
};

test('pilot summary arguments require an explicit input directory', () => {
  assert.throws(() => parsePilotSummaryArgs([]), /--input-dir is required/);
  assert.deepEqual(parsePilotSummaryArgs(['--input-dir', 'records', '--end-date', '2026-10-01', '--output', 'report.json']), {
    inputDir: 'records', pilotEndDate: '2026-10-01', output: 'report.json',
  });
  assert.throws(() => parsePilotSummaryArgs(['--surprise', 'yes']), /Unknown argument/);
});

test('local record files are loaded in deterministic filename order', () => withDirectory(async directory => {
  await writeFile(join(directory, 'b.json'), JSON.stringify(record(2)));
  await writeFile(join(directory, 'a.json'), JSON.stringify(record(1)));
  await writeFile(join(directory, 'notes.txt'), 'ignored');
  const sessions = await loadPilotSessions(directory);
  assert.deepEqual(sessions.map(item => item.sessionId), ['session-1', 'session-2']);
}));

test('the CLI aggregate omits participant identifiers and is byte-deterministic', () => withDirectory(async directory => {
  for (let index = 1; index <= 8; index++) await writeFile(join(directory, `${index}.json`), JSON.stringify(record(index)));
  const first = await runPilotSummary({ inputDir: directory, pilotEndDate: '2026-10-01' });
  const second = await runPilotSummary({ inputDir: directory, pilotEndDate: '2026-10-01' });
  assert.equal(first.json, second.json);
  assert.equal(first.summary.gates.unaidedReviewedExportAtLeast80Percent, 'pass');
  assert.doesNotMatch(first.json, /pilot-[1-8]/);
  assert.doesNotMatch(first.json, /generatedAt/);
}));

test('output creation refuses to overwrite an existing report', () => withDirectory(async directory => {
  const records = join(directory, 'records');
  await mkdir(records);
  await writeFile(join(records, 'session.json'), JSON.stringify(record(1)));
  const output = join(directory, 'report.json');
  await runPilotSummary({ inputDir: records, output });
  await assert.rejects(() => runPilotSummary({ inputDir: records, output }), error => error.code === 'EEXIST');
}));

test('empty and malformed record directories fail without printing record contents', async () => {
  await withDirectory(async directory => {
    await assert.rejects(() => loadPilotSessions(directory), /No pilot-session JSON files/);
    await writeFile(join(directory, 'broken.json'), '{secret participant notes');
    await assert.rejects(() => loadPilotSessions(directory), error => /broken\.json/.test(error.message) && !/secret participant notes/.test(error.message));
  });
});
