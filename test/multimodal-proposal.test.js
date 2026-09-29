import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateDesignBrief } from '../js/design-brief.js';
import { appendStudioConcept, emptyImageStudio, selectStudioConcept, setStudioSource } from '../js/image-studio.js';
import { prepareMultimodalProposal, validateMultimodalProposal } from '../js/multimodal-proposal.js';
import { Canvas } from '../js/canvas.js';
import { executePatternProgram, createWovenALineSkirtProgram } from '../js/pattern-program.js';
import { migrateProject } from '../js/project-revisions.js';

const image = suffix => `data:image/png;base64,${'a'.repeat(80)}${suffix}`;
const measurements = { waist: 72, hips: 98, chest: 88 };
const brief = () => updateDesignBrief(null, 'regular-length woven skirt, waist 72 cm, hips 98 cm');

test('P7-09 preserves selected image provenance without treating pixels as construction or measurements', () => {
  let studio = setStudioSource(emptyImageStudio(), image('a'), true);
  studio = appendStudioConcept(studio, { prompt: 'blue skirt with a dramatic back bow', providerId: 'proxy', image: image('b'), mode: 'image-to-image' });
  studio = selectStudioConcept(studio, studio.concepts[0].id);
  const proposal = prepareMultimodalProposal({ brief: brief(), measurements, studio, category: 'women' });
  assert.equal(proposal.decision, 'propose');
  assert.deepEqual(proposal.reference, {
    id: studio.concepts[0].id, kind: 'selected-concept', mode: 'image-to-image',
    prompt: 'blue skirt with a dramatic back bow', source: 'user-selected-image', rights: 'confirmed-by-user',
  });
  assert.equal(proposal.fields.waist.source, 'user');
  assert.equal(proposal.fields.category.value, 'women');
  assert.deepEqual(proposal.issues.map(issue => issue.code), [
    'referenceAppearanceOnly', 'referenceConstructionUnresolved', 'referenceScaleUnresolved', 'referenceBackViewUnresolved',
  ]);
});

test('P7-09 sends image-only input to clarification and rejects malformed stored references', () => {
  const imageOnly = prepareMultimodalProposal({ measurements, studio: emptyImageStudio() });
  assert.equal(imageOnly.decision, 'clarify');
  assert.equal(imageOnly.issues[0].code, 'briefRequiredForImage');
  const invalid = prepareMultimodalProposal({ brief: brief(), measurements, studio: { version: 1, concepts: [{}], selectedId: null } });
  assert.equal(invalid.decision, 'abstain');
  assert.equal(invalid.issues[0].code, 'invalidReference');
});

test('P7-09 proposal provenance persists only when a designer accepts a controlled draft', () => {
  const proposal = prepareMultimodalProposal({ brief: brief(), measurements, category: 'women' });
  const pieces = executePatternProgram(createWovenALineSkirtProgram('regular'), measurements).pieces;
  Canvas.loadPieces([], [], [], [], {}); Canvas.setHistory({ undo: [], redo: [] });
  Canvas.setPattern(pieces, ['#112233'], { multimodalProposal: proposal });
  assert.deepEqual(Canvas.snapshotState().multimodalProposal, proposal);
  Canvas.doUndo();
  assert.equal(Canvas.snapshotState().multimodalProposal, undefined);
});

test('P7-09 rejects malformed provenance on project import before it can persist', () => {
  const proposal = prepareMultimodalProposal({ brief: brief(), measurements, category: 'women' });
  assert.equal(validateMultimodalProposal(proposal), true);
  const invalid = structuredClone(proposal); invalid.fields.waist.source = 'image';
  assert.throws(() => validateMultimodalProposal(invalid), /multimodalProposalInvalid/);
  assert.throws(() => migrateProject({ pieces: [], multimodalProposal: invalid }), /projectInvalid/);
});
