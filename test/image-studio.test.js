import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendStudioConcept, emptyImageStudio, selectStudioConcept, setStudioSource, validateImageStudio } from '../js/image-studio.js';
import { Canvas } from '../js/canvas.js';
import { migrateProject } from '../js/project-revisions.js';

const image = data => `data:image/png;base64,${btoa(data)}`;

test('image studio requires confirmed rights and stores only one bounded reference', () => {
  assert.throws(() => setStudioSource(emptyImageStudio(), image('source'), false), /imageStudioRights/);
  const studio = setStudioSource(emptyImageStudio(), image('source'), true);
  assert.equal(studio.source.rights, 'confirmed-by-user');
  assert.equal(studio.concepts.length, 0);
  assert.throws(() => setStudioSource(studio, 'https://example.test/a.png', true), /imageStudioInvalid/);
});

test('concepts select explicitly, bind a reference only for image-to-image and keep the newest six', () => {
  let studio = setStudioSource(emptyImageStudio(), image('source'), true);
  assert.throws(() => appendStudioConcept(emptyImageStudio(), {prompt:'p',providerId:'proxy',image:image('a'),mode:'image-to-image'}), /imageStudioSourceNeeded/);
  studio = appendStudioConcept(studio, {prompt:'preserve linen texture',providerId:'proxy',image:image('one'),mode:'image-to-image'});
  assert.deepEqual(studio.concepts[0].referenceIds, [studio.source.id]);
  const chosen = studio.concepts[0].id;
  assert.equal(selectStudioConcept(studio, chosen).selectedId, chosen);
  for (let i=0;i<7;i++) studio=appendStudioConcept(studio,{prompt:`idea ${i}`,providerId:'local-image',image:image(String(i)),mode:'text-to-image'});
  assert.equal(studio.concepts.length,6);
  assert.equal(studio.concepts[0].prompt,'idea 1');
  assert.equal(studio.selectedId,null);
});

test('studio data round-trips project state and is reversible without changing pattern geometry', () => {
  const studio = appendStudioConcept(emptyImageStudio(), {prompt:'tailored blue trousers',providerId:'comfyui',image:image('concept'),mode:'text-to-image'});
  const project=migrateProject({pieces:[{name:'Locked',locked:true,outline:[[0,0],[10,0],[10,10]]}]});
  Canvas.restoreState(project); Canvas.setHistory({undo:[],redo:[]});
  const pieces=structuredClone(Canvas.getPieces());
  Canvas.setImageStudio(studio);
  assert.deepEqual(Canvas.getPieces(),pieces);
  assert.deepEqual(migrateProject(JSON.parse(JSON.stringify(Canvas.snapshotState()))).imageStudio,studio);
  Canvas.doUndo(); assert.equal(Canvas.snapshotState().imageStudio,undefined);
  Canvas.doRedo(); assert.deepEqual(Canvas.snapshotState().imageStudio,studio);
  assert.throws(()=>validateImageStudio({...studio,concepts:[{...studio.concepts[0],image:'bad'}]}),/imageStudioInvalid/);
});
