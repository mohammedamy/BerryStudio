import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../js/canvas.js';
import { migrateProject } from '../js/project-revisions.js';

test('image-derived imports retain immutable validation provenance in project data', () => {
  Canvas.restoreState(migrateProject({pieces:[]})); Canvas.setHistory({undo:[],redo:[]});
  const source={kind:'ai-svg-image',validation:{pass:2,warn:1,fail:0,deferred:0}};
  Canvas.importPieces([{name:'Imported panel',outline:[[0,0],[8,0],[8,12],[0,12]]}],source);
  const stored=Canvas.snapshotState().pieces[0].sourceProvenance;
  assert.deepEqual(stored,source);
  source.validation.fail=9;
  assert.equal(Canvas.snapshotState().pieces[0].sourceProvenance.validation.fail,0);
});
