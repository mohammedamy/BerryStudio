// V6 project storage and bounded command contract. All operations are pure.
import { ensureClothPieceIds } from './cloth-workflow-contract.js';

const clone = value => JSON.parse(JSON.stringify(value));
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const coordinate = value => Array.isArray(value) && value.length === 2 && value.every(n => Number.isFinite(n) && Math.abs(n) <= 100000);
const fail = code => { throw new Error(code); };

// Preserve project-domain data while the canvas owns only drafting fields.
export function projectContext(source) {
  const canvasFields = ['app', 'version', 'projectMeta', 'pieces', 'texts', 'points', 'cons', 'sketch', 'variables', 'view'];
  return clone(Object.fromEntries(Object.entries(source).filter(([key]) => !canvasFields.includes(key))));
}

export function migrateProject(input) {
  const source = Array.isArray(input) ? { pieces: input } : input;
  if (!record(source) || (source.version != null && ![1, 2].includes(source.version))) fail('projectVersion');
  if (!Array.isArray(source.pieces) || source.pieces.length > 1000) fail('projectInvalid');
  for (const p of source.pieces) {
    if (!record(p) || !Array.isArray(p.outline) || p.outline.length < 3 || !p.outline.every(coordinate)) fail('projectInvalid');
    if (p.name != null && typeof p.name !== 'string' && (!record(p.name) || Object.values(p.name).some(value => typeof value !== 'string'))) fail('projectInvalid');
    for (const key of ['notches', 'grain']) if (p[key] != null && (!Array.isArray(p[key]) || !p[key].every(coordinate))) fail('projectInvalid');
    if (p.darts != null && (!Array.isArray(p.darts) || !p.darts.every(d => Array.isArray(d) && d.every(coordinate)))) fail('projectInvalid');
    if (p.curves != null && (!Array.isArray(p.curves) || !p.curves.every(c => record(c) && coordinate(c.c1) && coordinate(c.c2)))) fail('projectInvalid');
  }
  for (const key of ['texts', 'points', 'cons', 'sketch']) if (source[key] != null && (!Array.isArray(source[key]) || !source[key].every(record))) fail('projectInvalid');
  for (const point of [...(source.texts || []), ...(source.points || [])]) if (!coordinate([point.x, point.y])) fail('projectInvalid');
  for (const text of source.texts || []) if (typeof text.text !== 'string') fail('projectInvalid');
  for (const stroke of source.sketch || []) if (!Array.isArray(stroke.pts) || !stroke.pts.every(coordinate)) fail('projectInvalid');
  if (source.variables != null && !record(source.variables)) fail('projectInvalid');
  if (source.projectMeta != null && (!record(source.projectMeta) || typeof source.projectMeta.id !== 'string' || !source.projectMeta.id || !Number.isSafeInteger(source.projectMeta.revision) || source.projectMeta.revision < 0)) fail('projectInvalid');
  const result = clone(source);
  for (const piece of result.pieces) {
    if (typeof piece.name === 'string') piece.name = {en:piece.name,ar:piece.name};
    piece.name ??= {en:'Pattern piece',ar:'قطعة باترون'};
  }
  ensureClothPieceIds(result.pieces);
  result.app = 'BerryStudio'; result.version = 2;
  result.projectMeta ??= { id: crypto.randomUUID(), revision: 0, status: 'draft' };
  for (const key of ['texts', 'points', 'cons', 'sketch']) result[key] ??= [];
  result.variables ??= {};
  return result;
}

// Ignore camera and transient text hitboxes, but include every persisted design field.
export function projectFingerprint(project) {
  const { view: _view, ...content } = project;
  return JSON.stringify(content, (key, value) => ['_sx', '_sy', '_w', '_h'].includes(key) ? undefined : value);
}

function execute(project, commands) {
  if (!Array.isArray(commands) || !commands.length || commands.length > 100) fail('commandInvalid');
  const next = clone(project);
  for (const command of commands) {
    if (!record(command)) fail('commandInvalid');
    const keys = { translate: ['type', 'pieceId', 'dx', 'dy'], rename: ['type', 'pieceId', 'name'], color: ['type', 'pieceId', 'color'] }[command.type];
    if (!keys || Object.keys(command).some(k => !keys.includes(k))) fail('commandInvalid');
    const p = next.pieces.find(piece => piece.clothLabId === command.pieceId);
    if (!p) fail('commandPieceMissing');
    if (p.locked) fail('commandLocked');
    if (command.type === 'translate') {
      if (![command.dx, command.dy].every(n => Number.isFinite(n) && Math.abs(n) <= 1000)) fail('commandInvalid');
      const move = ([x, y]) => [x + command.dx, y + command.dy];
      for (const key of ['outline', 'notches', 'grain']) if (p[key]) p[key] = p[key].map(move);
      if (p.darts) p.darts = p.darts.map(d => d.map(move));
      if (p.curves) p.curves = p.curves.map(c => ({ ...c, c1: move(c.c1), c2: move(c.c2) }));
    } else if (command.type === 'rename') {
      if (typeof command.name !== 'string' || !command.name.trim() || command.name.length > 120 || /[<>]/.test(command.name) || [...command.name].some(c => c.charCodeAt(0) < 32)) fail('commandInvalid');
      p.name = { en: command.name.trim(), ar: command.name.trim() };
    } else {
      if (typeof command.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(command.color)) fail('commandInvalid');
      p.color = command.color;
    }
  }
  next.projectMeta.revision++;
  next.projectMeta.status = 'draft';
  next.projectMeta.approval = null;
  return migrateProject(next);
}

export function previewCommands(project, commands) {
  const before = migrateProject(project);
  const after = execute(before, commands);
  return { base: projectFingerprint(before), commands: clone(commands), before, after };
}

export function acceptCommands(current, proposal) {
  const project = migrateProject(current);
  if (projectFingerprint(project) !== proposal.base) fail('commandStale');
  // Never trust the preview's mutable after-state as executable input.
  return execute(project, proposal.commands);
}
