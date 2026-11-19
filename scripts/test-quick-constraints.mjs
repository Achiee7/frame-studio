import assert from 'node:assert/strict';
import {beamDefaults, validModel} from '../app/model.ts';
import {planarActions, quickPlanarConstraint} from '../app/planar-quick.ts';
import {availableActions, toggleGeometry} from '../app/sketch-actions.ts';

const node=id=>({type:'node',id}), member=id=>({type:'member',id});
const [a,b,c,d]=['A','B','C','D'].map(node);
const [one,two]=['B1','B2'].map(member);
const joints=[['A',0,0],['B',3,1],['C',1,2],['D',4,4]];
const model={
  nodes:joints.map(([id,x,y])=>({id,x,y,joint:'rigid',support:'free'})),
  beams:[{id:'B1',a:'A',b:'B',family:'B1',...beamDefaults},{id:'B2',a:'C',b:'D',family:'B2',...beamDefaults}],
  loads:[]
};
const original=structuredClone(model);
assert.deepEqual(toggleGeometry([a],c),[a,c]);
assert.deepEqual(toggleGeometry([a,c],a),[c]);
assert.deepEqual(toggleGeometry([a,c],one),[one]);
assert.deepEqual(planarActions(model,[a,c]),['connect','alongX','alongY']);
assert.deepEqual(planarActions(model,[a,b]),['alongX','alongY']);
assert.deepEqual(planarActions(model,[a,one]),[]);
for(const pair of [[c,one],[one,c]]){
  assert.deepEqual(planarActions(model,pair),['pointOnMember','midpoint']);
  const next=quickPlanarConstraint(model,'midpoint',pair);
  assert.ok(validModel(next));
  const [p,q,r]=next.nodes;
  assert.ok(Math.hypot((p.x+q.x)/2-r.x,(p.y+q.y)/2-r.y)<1e-6);
  assert.ok(!planarActions(next,pair).includes('midpoint'));
}
const horizontal=quickPlanarConstraint(model,'alongX',[a,c]);
assert.ok(Math.abs(horizontal.nodes[0].y-horizontal.nodes[2].y)<1e-6);
assert.ok(!planarActions(horizontal,[c,a]).includes('alongX'));
const perpendicular=quickPlanarConstraint(model,'perpendicular',[two,one]);
assert.ok(validModel(perpendicular));
assert.ok(!planarActions(perpendicular,[one,two]).includes('perpendicular'));
const merged=quickPlanarConstraint(model,'connect',[b,c]);
assert.ok(validModel(merged));
assert.equal(merged.nodes.length,3);
assert.equal(merged.beams[0].b,merged.beams[1].a);
assert.deepEqual(model,original);
assert.deepEqual(availableActions('3D','constraint',[a,d],model.beams),['connect','alongX','alongY','alongZ']);
assert.deepEqual(availableActions('3D','dimension',[a,d],model.beams),['length','dx','dy','dz']);
assert.deepEqual(availableActions('3D','dimension',[c,one],model.beams),['offset']);
assert.deepEqual(availableActions('3D','dimension',[two,one],model.beams),['angle']);
console.log('Passed contextual constraint choices, selection order, topology and sketch updates.');
