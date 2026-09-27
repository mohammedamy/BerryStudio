import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWovenALineSkirtProgram, executePatternProgram, validatePatternProgram } from '../js/pattern-program.js';
import { Canvas } from '../js/canvas.js';
import { assessWovenSkirtConstruction } from '../js/construction-acceptance.js';

const measurements={waist:72,hips:98};
test('woven A-line skirt program executes as three typed, editable pieces',()=>{
  const program=createWovenALineSkirtProgram('regular'); const result=executePatternProgram(program,measurements);
  assert.equal(validatePatternProgram(program),true); assert.equal(result.pieces.length,3);
  assert.deepEqual(result.pieces.map(piece=>piece.role),['skirt-front','skirt-back','waistband']);
  assert.equal(result.pieces[0].cutOnFold,true); assert.equal(result.pieces[2].quantity,2);
  assert.ok(result.lines.some(line=>line.name==='frontSideSeam'));
  assert.deepEqual(result.pieces.slice(0,2).map(piece=>piece.notches.length),[1,1]);
  assert.equal(assessWovenSkirtConstruction(result.pieces).decision,'side-seam-checked');
});
test('the program rejects executable fields, unknown references and bad formula values before output',()=>{
  const program=createWovenALineSkirtProgram('short');
  for(const mutate of [p=>p.operations[0].code='alert(1)',p=>p.operations.find(op=>op.op==='lineBetween').from='unknown',p=>p.operations[0].formula='waist;alert(1)']) {
    const changed=structuredClone(program); mutate(changed); assert.throws(()=>executePatternProgram(changed,measurements),/programInvalid/);
  }
  assert.throws(()=>executePatternProgram(program,{waist:0,hips:98}),/programMeasurements/);
});
test('accepted program provenance stays with the generated project without mutating source geometry',()=>{
  const output=executePatternProgram(createWovenALineSkirtProgram('long'),measurements);
  Canvas.loadPieces([],[],[],[],{}); Canvas.setHistory({undo:[],redo:[]});
  Canvas.setPattern(output.pieces,['#123456'],{patternProgram:{version:1,family:'woven-a-line-skirt',operations:[],measurements,provenance:{waist:{source:'user'}}},patternConfiguration:{version:1,family:'woven-a-line-skirt',silhouette:'a-line',length:'long',waistband:'standard',closure:'none',fabric:'woven',seamAllowanceCm:1,measurementProfileId:null}});
  assert.equal(Canvas.snapshotState().patternProgram.family,'woven-a-line-skirt');
  assert.equal(Canvas.snapshotState().patternConfiguration.length,'long');
  assert.equal(Canvas.getPieces().length,3);
});

test('typed references reject variables used as points and measurement overrides',()=>{
  const p=createWovenALineSkirtProgram('regular');
  const invalid=structuredClone(p); invalid.operations.find(op=>op.op==='lineBetween').from='waistQuarter';
  assert.throws(()=>executePatternProgram(invalid,measurements),/programInvalid/);
  const override=structuredClone(p); override.operations[0].name='waist';
  assert.throws(()=>executePatternProgram(override,measurements),/programInvalid/);
  assert.throws(()=>executePatternProgram({...p,code:'run'},measurements),/programInvalid/);
});
