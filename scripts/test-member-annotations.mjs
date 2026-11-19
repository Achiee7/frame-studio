import assert from 'node:assert/strict';
import {beamDefaults, ORIGIN, splitBeam, validModel} from '../app/model.ts';
import {memberAnnotations} from '../app/member-annotations.ts';

const node=(id,x,y)=>({id,x,y,joint:'rigid',support:'free'});
const beam=(id,a,b,family=id)=>({...beamDefaults,id,a,b,family});
const main=beam('main','a','b');
const riser=beam('riser','b','z');
const isolated=beam('isolated','e','f');
const model={
 nodes:[node('a',0,0),node('b',9,0),node('z',9,2),node('p',4.5,0),node('e',0,2),node('f',9,2)],
 beams:[main,riser,isolated],
 sketchConstraints:[
  {id:'level',type:'horizontal',a:'main'},
  {id:'anchor',type:'coincident',a:ORIGIN,b:'a'},
  {id:'midpoint',type:'midpoint',a:'p',b:'main',suppressed:true},
  {id:'unrelated',type:'horizontal',a:'isolated'},
 ],
 constraints:[{id:'corner',type:'rightAngle',reference:'main',target:'riser'}],
 dimensions:[
  {id:'length',kind:'length',a:'a',b:'b',value:9,driving:true},
  {id:'angle',kind:'angle',a:'a',b:'b',c:'b',d:'z',value:90,driving:true},
  {id:'height',kind:'perpendicular',a:'a',b:'b',c:'z',value:2,driving:true},
  {id:'origin-distance',kind:'vertical',a:ORIGIN,b:'z',value:2,driving:true},
 ],
 loads:[
  {id:'own',beam:'main',type:'force',t:.5,fx:0,fy:-1,m:0,case:'Q'},
  {id:'other',beam:'riser',type:'moment',t:0,attachment:'start',fx:0,fy:0,m:2,case:'Q'},
 ]
};
const ids=items=>items.map(item=>item.id);
assert.ok(validModel(model));
const selected=memberAnnotations(model,main);
assert.deepEqual(ids(selected.sketchConstraints),['level','anchor','midpoint']);
assert.deepEqual(ids(selected.continuityConstraints),['corner']);
assert.deepEqual(ids(selected.dimensions),['length','angle','height']);
assert.deepEqual(ids(selected.loads),['own']);
const adjacent=memberAnnotations(model,riser);
assert.deepEqual(ids(adjacent.dimensions),['angle','height','origin-distance']);
assert.deepEqual(ids(adjacent.loads),['other']);
assert.deepEqual(ids(memberAnnotations(model,isolated).dimensions),[]);

model.nodes.push(node('cut-1',3,0),node('cut-2',6,0));
splitBeam(model,main.id,1/3,'cut-1');
const remaining=model.beams.find(member=>member.a==='cut-1');
splitBeam(model,remaining.id,1/2,'cut-2');
assert.ok(validModel(model));
const interior=memberAnnotations(model,remaining);
assert.deepEqual(ids(interior.dimensions),['length','angle','height']);
assert.deepEqual(ids(interior.sketchConstraints),['midpoint']);
assert.deepEqual(ids(interior.loads),['own']);

console.log('Passed: member tree annotations, endpoint and continuity constraints, perpendicular and angular references through splits, suppressed constraints and segment-specific loads.');
