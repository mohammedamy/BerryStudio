import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createPilotSessionRecord, loadPilotTaskSet, parseNewPilotSessionArgs, runCreatePilotSession,
} from '../scripts/create-pilot-session.mjs';

const base = overrides => ({
  sessionId: 'session-01', participantId: 'pilot-01', participantNumber: 1,
  role: 'designer-maker', language: 'en', output: 'unused.json', ...overrides,
});

const withDirectory = async callback => {
  const directory = await mkdtemp(join(tmpdir(), 'berry-pilot-session-'));
  try { return await callback(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
};

test('new-session arguments require every explicit, privacy-bounded field', () => {
  assert.throws(() => parseNewPilotSessionArgs([]), /Missing required sessionId/);
  assert.deepEqual(parseNewPilotSessionArgs([
    '--session-id', 'session-01', '--participant-id', 'pilot-01', '--participant-number', '1',
    '--role', 'designer-maker', '--language', 'ar', '--output', 'record.json',
  ]), { sessionId: 'session-01', participantId: 'pilot-01', participantNumber: 1, role: 'designer-maker', language: 'ar', output: 'record.json' });
  assert.throws(() => parseNewPilotSessionArgs([
    '--session-id', 'session-01', '--participant-id', 'pilot-01', '--participant-number', '0',
    '--role', 'maker', '--language', 'en', '--output', 'record.json',
  ]), /positive integer/);
});

test('odd and even session slots receive the declared counterbalanced assignments', async () => {
  const taskSet = await loadPilotTaskSet();
  const odd = createPilotSessionRecord(base(), taskSet);
  const even = createPilotSessionRecord(base({ participantNumber: 2 }), taskSet);
  assert.deepEqual(odd.comparison, { protocolId: taskSet.protocolId, baselineTaskId: 'skirt-a', berryTaskId: 'skirt-b', sequence: 'baseline-first' });
  assert.deepEqual(even.comparison, { protocolId: taskSet.protocolId, baselineTaskId: 'skirt-b', berryTaskId: 'skirt-a', sequence: 'berry-first' });
  assert.equal(odd.status, 'not-run');
  assert.equal(odd.consentConfirmed, false);
  assert.equal(odd.outcome.reviewedExport, null);
});

test('session initialization is deterministic and refuses to overwrite records', () => withDirectory(async directory => {
  const firstPath = join(directory, 'first.json');
  const secondPath = join(directory, 'second.json');
  const first = await runCreatePilotSession(base({ output: firstPath }));
  const second = await runCreatePilotSession(base({ output: secondPath }));
  assert.equal(first.json, second.json);
  await assert.rejects(() => runCreatePilotSession(base({ output: firstPath })), error => error.code === 'EEXIST');
}));

test('session initialization rejects identifying-looking or unsupported inputs through the canonical validator', async () => {
  const taskSet = await loadPilotTaskSet();
  assert.throws(() => createPilotSessionRecord(base({ participantId: 'person@example.com' }), taskSet), /participantId/);
  assert.throws(() => createPilotSessionRecord(base({ role: 'customer' }), taskSet), /pilot role/);
  assert.throws(() => createPilotSessionRecord(base({ language: 'fr' }), taskSet), /pilot language/);
});
