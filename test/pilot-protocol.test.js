import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const taskSet = JSON.parse(await readFile(new URL('../evaluation/p7-10/task-set.json', import.meta.url), 'utf8'));

test('P7-10 task set is bilingual, matched, bounded and counterbalanced', () => {
  assert.equal(taskSet.schema, 'berrystudio.pilot-tasks.v1');
  assert.equal(taskSet.protocolId, 'p7-10-woven-skirt-comparison-v1');
  assert.equal(taskSet.family, 'woven-a-line-skirt');
  assert.equal(taskSet.tasks.length, 2);
  const ids = new Set(taskSet.tasks.map(task => task.id));
  for (const task of taskSet.tasks) {
    assert.ok(task.language.en.trim());
    assert.ok(task.language.ar.trim());
    assert.deepEqual(Object.keys(task.measurementsCm).sort(), [
      'backLen', 'bicep', 'chest', 'height', 'hips', 'inseam',
      'neck', 'shoulder', 'sleeve', 'thigh', 'waist',
    ]);
    assert.ok(Object.values(task.measurementsCm).every(value => Number.isFinite(value) && value > 0));
    assert.ok(['regular', 'long'].includes(task.configuration.length));
  }
  assert.deepEqual(new Set(taskSet.assignments.map(item => item.participantNumberParity)), new Set(['odd', 'even']));
  assert.deepEqual(new Set(taskSet.assignments.map(item => item.sequence)), new Set(['baseline-first', 'berry-first']));
  for (const assignment of taskSet.assignments) {
    assert.ok(ids.has(assignment.baselineTaskId));
    assert.ok(ids.has(assignment.berryTaskId));
    assert.notEqual(assignment.baselineTaskId, assignment.berryTaskId);
  }
  assert.ok(taskSet.completionCriteria.length >= 5);
});
