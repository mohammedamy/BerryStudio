import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateProject, previewCommands, acceptCommands } from '../js/project-revisions.js';
import { Canvas } from '../js/canvas.js';

const legacy = () => ({version:1, pieces:[{name:{en:'Front',ar:'أمام'},outline:[[0,0],[10,0],[10,10]],darts:[[[1,1],[2,2],[3,1]]],grain:[[4,2],[4,8]],notches:[[0,3]],curves:[{from:0,c1:[2,-1],c2:[8,-1]}],color:'#112233'}],variables:{waist:'72'}});
const command = (p, extra={}) => ({type:'translate',pieceId:p.pieces[0].clothLabId,dx:3,dy:2,...extra});

test('legacy migration is non-mutating, idempotent and preserves piece extensions', () => {
  const input=legacy(), original=structuredClone(input);
  input.pieces[0].customSeams={a:'hem'};
  const result=migrateProject(input);
  assert.equal(input.version,1); assert.equal(input.pieces[0].clothLabId,undefined);
  assert.deepEqual(result,migrateProject(JSON.parse(JSON.stringify(result))));
  assert.deepEqual(result.pieces[0].customSeams,{a:'hem'});
  assert.deepEqual(result.pieces[0].outline,original.pieces[0].outline);
  const duplicate=migrateProject({pieces:[result.pieces[0],result.pieces[0]]});
  assert.notEqual(duplicate.pieces[0].clothLabId,duplicate.pieces[1].clothLabId);
  assert.equal(migrateProject(input.pieces).version,2);
});
test('unsupported versions and malformed geometry fail before mutation', () => {
  assert.throws(()=>migrateProject({...legacy(),version:3}),/projectVersion/);
  for(const value of [NaN,Infinity,null,'1']) {
    const input=legacy(); input.pieces[0].outline[0][0]=value;
    assert.throws(()=>migrateProject(input),/projectInvalid/);
  }
  assert.throws(()=>migrateProject({...legacy(),projectMeta:{id:'x',revision:-1}}),/projectInvalid/);
});
test('preview/reject leave the design unchanged; accept translates all attached geometry', () => {
  const p=migrateProject(legacy()), original=structuredClone(p);
  const proposal=previewCommands(p,[command(p)]);
  assert.deepEqual(p,original);
  const next=acceptCommands(p,proposal);
  assert.deepEqual(next.pieces[0].outline[0],[3,2]);
  assert.deepEqual(next.pieces[0].darts[0][0],[4,3]);
  assert.deepEqual(next.pieces[0].notches[0],[3,5]);
  assert.deepEqual(next.pieces[0].grain[0],[7,4]);
  assert.deepEqual(next.pieces[0].curves[0].c1,[5,1]);
  assert.equal(next.projectMeta.revision,1); assert.equal(next.projectMeta.status,'draft');
  assert.deepEqual(p,original);
});
test('locked pieces, unknown commands and invalid batches cannot partially change a project', () => {
  const p=migrateProject(legacy());
  for(const extra of [{type:'eval',code:'alert(1)'},{dx:Infinity},{dx:1001},{arbitrary:true}]) assert.throws(()=>previewCommands(p,[command(p),command(p,extra)]),/commandInvalid/);
  p.pieces[0].locked=true;
  for(const cmd of [command(p),{type:'rename',pieceId:p.pieces[0].clothLabId,name:'new'},{type:'color',pieceId:p.pieces[0].clothLabId,color:'#445566'}]) assert.throws(()=>previewCommands(p,[cmd]),/commandLocked/);
  assert.deepEqual(p.pieces[0].outline[0],[0,0]);
});
test('manual edits, changed locks and another project invalidate a preview; zoom does not', () => {
  const p=migrateProject(legacy()), proposal=previewCommands(p,[command(p)]);
  for(const mutate of [q=>q.pieces[0].locked=true,q=>q.pieces[0].outline[0][0]++,q=>q.variables.waist='80',q=>q.projectMeta.id='other']) {
    const q=structuredClone(p); mutate(q); assert.throws(()=>acceptCommands(q,proposal),/commandStale/);
  }
  assert.equal(acceptCommands({...p,view:{x:1,y:1,scale:9}},proposal).projectMeta.revision,1);
  proposal.after.pieces=[];
  assert.equal(acceptCommands(p,proposal).pieces.length,1);
});
test('a multi-command accept is one undo step including revision and variables; redo restores it', () => {
  const p=migrateProject({...legacy(),brief:{language:'ar',text:'تنورة'},references:[{id:'ref-1',rights:'owned'}],measurements:{waist:{value:72,unit:'cm',source:'user'}}});
  Canvas.loadPieces(p.pieces,p.texts,p.points,p.cons,p);
  assert.deepEqual(Canvas.snapshotState().brief,p.brief);
  Canvas.restoreState(p); Canvas.setHistory({undo:[],redo:[]});
  const before=migrateProject(Canvas.snapshotState());
  const proposal=previewCommands(before,[command(before),{type:'rename',pieceId:before.pieces[0].clothLabId,name:'Accepted'},{type:'color',pieceId:before.pieces[0].clothLabId,color:'#abcdef'}]);
  Canvas.acceptProposal(proposal);
  assert.equal(Canvas.getHistory().undo.length,1);
  assert.equal(Canvas.getPieces()[0].name.en,'Accepted');
  Canvas.doUndo(); assert.deepEqual(migrateProject(Canvas.snapshotState()),before);
  Canvas.doRedo(); assert.equal(Canvas.snapshotState().projectMeta.revision,1);
  assert.equal(Canvas.getPieces()[0].color,'#abcdef');
  assert.deepEqual(Canvas.snapshotState().references,p.references);
});
