#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePilotSession } from './pilot-evidence.mjs';

const usage = 'Usage: npm run pilot:new-session -- --session-id <id> --participant-id <pseudonymous-id> --participant-number <positive integer> --role designer|maker|designer-maker --language en|ar --output <file>';
const flags = new Set(['--session-id', '--participant-id', '--participant-number', '--role', '--language', '--output']);

export function parseNewPilotSessionArgs(argv) {
  const options = { sessionId: null, participantId: null, participantNumber: null, role: null, language: null, output: null };
  const names = {
    '--session-id': 'sessionId', '--participant-id': 'participantId', '--participant-number': 'participantNumber',
    '--role': 'role', '--language': 'language', '--output': 'output',
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (!flags.has(flag)) throw new Error(`Unknown argument: ${flag}\n${usage}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}\n${usage}`);
    options[names[flag]] = flag === '--participant-number' ? Number(value) : value;
  }
  for (const [key, value] of Object.entries(options)) if (value === null) throw new Error(`Missing required ${key}\n${usage}`);
  if (!Number.isSafeInteger(options.participantNumber) || options.participantNumber < 1) throw new Error('participantNumber must be a positive integer');
  return options;
}

export async function loadPilotTaskSet() {
  return JSON.parse(await readFile(new URL('../evaluation/p7-10/task-set.json', import.meta.url), 'utf8'));
}

export function createPilotSessionRecord(options, taskSet) {
  if (!taskSet || taskSet.schema !== 'berrystudio.pilot-tasks.v1') throw new Error('Unsupported pilot task set');
  const parity = options.participantNumber % 2 ? 'odd' : 'even';
  const assignment = taskSet.assignments.find(item => item.participantNumberParity === parity);
  if (!assignment) throw new Error(`Task set has no ${parity} assignment`);
  return validatePilotSession({
    schema: 'berrystudio.pilot-session.v1',
    sessionId: options.sessionId,
    participantId: options.participantId,
    role: options.role,
    language: options.language,
    comparison: {
      protocolId: taskSet.protocolId,
      baselineTaskId: assignment.baselineTaskId,
      berryTaskId: assignment.berryTaskId,
      sequence: assignment.sequence,
    },
    consentConfirmed: false,
    status: 'not-run',
    startedAt: null,
    completedAt: null,
    outcome: { reviewedExport: null, unaided: null, baselineMinutes: null, completionMinutes: null, assistanceEvents: 0 },
    activityDates: [],
    defects: [],
    makerReview: { verdict: 'pending', reviewerId: null, reviewedAt: null, evidence: [] },
    sampleStatus: 'not-made',
  });
}

export async function runCreatePilotSession(options) {
  const taskSet = await loadPilotTaskSet();
  const record = createPilotSessionRecord(options, taskSet);
  const json = `${JSON.stringify(record, null, 2)}\n`;
  await writeFile(resolve(options.output), json, { encoding: 'utf8', flag: 'wx' });
  return { record, json, output: resolve(options.output) };
}

async function main() {
  const result = await runCreatePilotSession(parseNewPilotSessionArgs(process.argv.slice(2)));
  process.stdout.write(`Created ${result.output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
