import assert from 'node:assert/strict';
import {spatialSketchMobility} from '../app/spatial-mobility.ts';
import {createSpatialRule,SPATIAL_ORIGIN} from '../app/spatial-sketch.ts';

const pick=id=>({type:'node',id}),beam=id=>({type:'member',id});
const joint=(id,x,y,z)=>({id,x,y,z,joint:'rigid',support:'free'});
const model={nodes:[joint('A',1,2,3),joint('B',5,2,3)],members:[{id:'AB',kind:'beam',a:'A',b:'B'}]};
function check(m,dof,a,b,ab){
  const snapshot=JSON.stringify(m),state=spatialSketchMobility(m);
  assert.equal(state.dof,dof);
  assert.deepEqual([...state.nodes.values()],[a,b]);
  assert.equal(state.members.get('AB'),ab);
  assert.equal(JSON.stringify(m),snapshot);
}
check(model,6,'free','free','free');
check({...model,nodes:model.nodes.map(n=>({...n,support:'fixed'}))},6,'free','free','free');
const along=createSpatialRule(model,'alongX',[beam('AB')]);
check(along,4,'free','free','free');
const rigid=createSpatialRule(along,'length',[beam('AB')]);
check(rigid,3,'free','free','free'); // oriented, dimensioned member can still translate
const lockA=m=>({...m,nodes:m.nodes.map(n=>n.id==='A'?{...n,positionLocked:true}:n)});
check(lockA(model),3,'fixed','free','free');
check(lockA(along),1,'fixed','free','free');
check(lockA(rigid),0,'fixed','fixed','fixed');
const reference=createSpatialRule(along,'length',[beam('AB')],4,true);
check(lockA(reference),1,'fixed','free','free');
const suppressed={...rigid,rules:rigid.rules.map(r=>r.kind==='alongX'?{...r,suppressed:true}:r)};
check(lockA(suppressed),2,'fixed','free','free');
const conflicting={...model,rules:rigid.rules.map(r=>r.kind==='length'?{...r,value:9}:r)};
check(conflicting,3,'conflict','conflict','conflict');
const partial=createSpatialRule(model,'dz',[pick(SPATIAL_ORIGIN),pick('A')],3);
check(partial,5,'free','free','free');
const atOrigin=createSpatialRule(model,'connect',[pick('A'),pick(SPATIAL_ORIGIN)]);
check(atOrigin,3,'fixed','free','free');

// At an arbitrary orientation parallelism has rank two, including the
// geometrically identical zero-angle dimension. Its three cross-product
// components cannot consume the third direction of translation or spin.
const oblique={nodes:[joint('A',0,0,0),joint('B',1,2,3),joint('C',5,-1,4),joint('D',7,3,10)],
  members:[...model.members,{id:'CD',kind:'beam',a:'C',b:'D'}]};
for(const kind of ['parallel','angle']){
  const constrained=createSpatialRule(oblique,kind,[beam('AB'),beam('CD')],kind==='angle'?0:undefined);
  assert.equal(spatialSketchMobility(constrained).dof,10,kind);
}
assert.equal(spatialSketchMobility({nodes:[],members:[]}).dof,0);
console.log('3D sketch colours and DOF passed for floating, partially constrained, locked, driven, suppressed and conflicting geometry.');
