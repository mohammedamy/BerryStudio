#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarizePilotSessions } from './pilot-evidence.mjs';
import { renderPilotSummaryMarkdown } from './pilot-report.mjs';

const usage = 'Usage: npm run pilot:summary -- --input-dir <directory> [--end-date YYYY-MM-DD] [--format json|markdown] [--output <file>]';

export function parsePilotSummaryArgs(argv) {
  const options = { inputDir: null, pilotEndDate: null, format: 'json', output: null };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (!['--input-dir', '--end-date', '--format', '--output'].includes(flag)) throw new Error(`Unknown argument: ${flag}\n${usage}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}\n${usage}`);
    if (flag === '--input-dir') options.inputDir = value;
    if (flag === '--end-date') options.pilotEndDate = value;
    if (flag === '--format') options.format = value;
    if (flag === '--output') options.output = value;
  }
  if (!options.inputDir) throw new Error(`--input-dir is required\n${usage}`);
  if (!['json', 'markdown'].includes(options.format)) throw new Error(`--format must be json or markdown\n${usage}`);
  return options;
}

export async function loadPilotSessions(inputDir) {
  const directory = resolve(inputDir);
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name)
    .sort();
  if (!files.length) throw new Error(`No pilot-session JSON files found in ${directory}`);
  const sessions = [];
  for (const filename of files) {
    const path = resolve(directory, filename);
    try {
      const value = JSON.parse(await readFile(path, 'utf8'));
      if (Array.isArray(value)) throw new Error('Expected one pilot-session object per file');
      sessions.push(value);
    } catch (error) {
      throw new Error(`${filename}: ${error.message}`);
    }
  }
  return sessions;
}

export async function runPilotSummary({ inputDir, pilotEndDate = null, format = 'json', output = null }) {
  if (!['json', 'markdown'].includes(format)) throw new Error('--format must be json or markdown');
  const sessions = await loadPilotSessions(inputDir);
  let summary;
  try {
    summary = summarizePilotSessions(sessions, { pilotEndDate });
  } catch (error) {
    // Locate the first independently invalid record so the coordinator can
    // repair a file without exposing its contents in the error message.
    for (const session of sessions) {
      try { summarizePilotSessions([session], { pilotEndDate }); }
      catch (recordError) { throw new Error(`${session?.sessionId || 'unknown-session'}: ${recordError.message}`); }
    }
    throw error;
  }
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  const markdown = renderPilotSummaryMarkdown(summary);
  const rendered = format === 'markdown' ? markdown : json;
  if (output) await writeFile(resolve(output), rendered, { encoding: 'utf8', flag: 'wx' });
  return { summary, json, markdown, rendered };
}

async function main() {
  const options = parsePilotSummaryArgs(process.argv.slice(2));
  const { rendered } = await runPilotSummary(options);
  if (!options.output) process.stdout.write(rendered);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
