import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConstructionPacket } from '../js/construction-packet.js';

const project = { patternConfiguration:{family:'woven-a-line-skirt'}, pieces:[
  {key:'front',name:{en:'Front',ar:'أمام'},role:'skirt-front',quantity:1,cutOnFold:true,grain:[[0,0],[0,40]],notches:[[10,20]],outline:[[0,0],[20,0],[24,40],[0,40]],edges:[{seamId:'skirt-side',fromIdx:1,toIdx:2}]},
  {key:'back',name:{en:'Back',ar:'خلف'},role:'skirt-back',quantity:1,cutOnFold:true,grain:[[0,50],[0,90]],notches:[[10,70]],outline:[[0,50],[20,50],[24,90],[0,90]],edges:[{seamId:'skirt-side',fromIdx:1,toIdx:2}]},
  {key:'waistband',name:{en:'Waistband',ar:'حزام الخصر'},role:'waistband',quantity:2,cutOnFold:false,grain:[[0,0],[20,0]],notches:[],outline:[[0,0],[20,0],[20,4],[0,4]]},
]};

test('supported skirt packet gives a cut list, declared seam, ordered instructions and honest readiness', () => {
  const packet = createConstructionPacket(project);
  assert.equal(packet.supported, true);
  assert.equal(packet.cutList.length, 3);
  assert.deepEqual(packet.cutList.map(piece => piece.notchCount), [1, 1, 0]);
  assert.deepEqual(packet.declaredSeams[0].participants.map(item => item.lengthCm), [40.2, 40.2]);
  assert.equal(packet.instructions.length, 5);
  assert.equal(packet.readiness.waistbandAttachment, 'not-verified');
  assert.equal(packet.readiness.productionEligible, false);
});

test('unsupported projects produce no instructions or false readiness', () => {
  const packet = createConstructionPacket({pieces:[{role:'bodice-front',outline:[[0,0],[1,0],[0,1]]}]});
  assert.equal(packet.supported, false);
  assert.deepEqual(packet.instructions, []);
  assert.equal(packet.readiness.productionEligible, false);
});
