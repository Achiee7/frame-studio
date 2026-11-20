import assert from 'node:assert/strict';
import {solveSpatial} from '../app/spatial-analysis.ts';

const v=(x=0,y=0,z=0)=>({x,y,z});
const section={name:'Test section',E:200e6,G:78e6,A:.008,Iy:3.2e-5,Iz:1.7e-5,J:2.1e-5,roll:0};
const node=(id,point,support='free')=>({id,...point,support,joint:'rigid'});
const member=(id,a,b,kind='beam')=>({id,a,b,kind,section});
const load=(id,vector,kind='force')=>({id:'L1',target:'node',targetId:id,t:0,kind,vector});
const norm=p=>Math.hypot(p.x,p.y,p.z);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<=tol,`${a} differs from ${b}`);
function expectMode(model,kind){
  let mode;
  assert.throws(()=>solveSpatial(model),err=>{
    mode=err.instability;
    assert.ok(mode,'Expected a physical motion diagnosis. Received '+err.message);
    assert.equal(mode.kind,kind);
    return true;
  });
  assert.ok(mode.motions.some(m=>m.node===mode.primaryNode));
  near(Math.max(...mode.motions.map(m=>norm(m.vector))),1);
  // The worker transmits ordinary data, and the original model stays editable.
  assert.deepEqual(structuredClone(mode),mode);
  return mode;
}

// Two fully restrained translations at distinct anchors leave one rigid-body
// rotation about their joining line. Off-axis joints at radii 1 and 3 move
// in the same direction with a known 1:3 ratio, independently of stiffness.
const frame={
  nodes:[node('A',v(-2),'pinned'),node('B',v(2),'pinned'),node('C',v(0,1)),node('D',v(1,3))],
  members:[member('AC','A','C'),member('BC','B','C'),member('CD','C','D')],
  loads:[load('D',v(0,0,-.001))]
};
function checkAnchorMode(model,normal){
  const mode=expectMode(model,'translation');
  assert.deepEqual(new Set(mode.supportAxis),new Set(['A','B']));
  assert.equal(mode.primaryNode,'D');
  const motions=new Map(mode.motions.map(m=>[m.node,m.vector]));
  for(const id of ['A','B'])near(norm(motions.get(id)??v()),0);
  const c=motions.get('C'),d=motions.get('D');
  near(Math.abs(dot(d,normal)),1);
  near(dot(c,d),1/3);
  assert.ok(mode.members.includes('CD'));
}
checkAnchorMode(frame,v(0,0,1));
const axialMoment=expectMode(frame,'translation');
near(axialMoment.axisMoment,-.003);
near(expectMode({...frame,loads:[]},'translation').axisMoment,0);

// Rotate to an oblique 3D plane, translate the coordinate origin, reverse the
// member order and change one stiffness. The same rigid mode must be identified.
const axisScale=Math.SQRT1_2;
const rotate=p=>v((p.x-p.y)*axisScale,(p.x+p.y)*.5-p.z*axisScale,(p.x+p.y)*.5+p.z*axisScale);
const rotated={
  nodes:frame.nodes.map(n=>{
    const p=rotate(n);
    return {...n,x:p.x+50,y:p.y-13,z:p.z+4};
  }).reverse(),
  members:frame.members.map(m=>m.id==='CD'?{...m,section:{...section,E:section.E/5}}:m).reverse(),
  loads:[load('D',rotate(v(0,0,-.001)))]
};
checkAnchorMode(rotated,rotate(v(0,0,1)));

// A vertical roller at D removes this mode and takes the vertical load at D.
const corrected={...frame,nodes:frame.nodes.map(n=>n.id==='D'?{...n,support:'roller'}:n)};
const stable=solveSpatial(corrected);
near(stable.reactions.find(r=>r.id==='D').force.z,.001,1e-10);
near(stable.maxDisplacement,0,1e-12);

// The sound fixed cantilever and the free branch below share no nodes.
// Only the free branch can appear in a zero-stiffness mode.
const disconnected={nodes:[node('K',v(),'fixed'),node('J',v(1)),node('U',v(0,4)),node('V',v(1,4))],
  members:[member('KJ','K','J'),member('UV','U','V')],loads:[load('J',v(0,0,-.001))]};
const free=expectMode(disconnected,'translation');
assert.ok(free.motions.every(m=>['U','V'].includes(m.node)));
assert.deepEqual(free.members,['UV']);
assert.equal(free.supportAxis,undefined);

// A single axial strut can carry no transverse motion at its free joint.
const strut={nodes:[node('P',v(),'pinned'),node('Q',v(1,1,1))],members:[member('S','P','Q','strut')],loads:[load('Q',v(0,0,-.001))]};
const local=expectMode(strut,'translation');
assert.equal(local.primaryNode,'Q');
assert.deepEqual(local.members,['S']);
near(dot(local.motions.find(m=>m.node==='Q').vector,v(1,1,1)),0);

// A pin-ended beam may spin freely about its own axis. A transverse load has
// resolved reactions; a torque along the axis excites the rotational mode.
const beam={nodes:[node('P',v(),'pinned'),node('Q',v(2),'pinned')],members:[member('B','P','Q')],
  loads:[{id:'point',target:'member',targetId:'B',t:.5,kind:'force',vector:v(0,0,-.001)}]};
const transverse=solveSpatial(beam);
near(transverse.reactions[0].force.z,.0005,1e-10);
assert.ok(transverse.warnings.some(w=>w.includes('free spin')));
const spin=expectMode({...beam,loads:[load('Q',v(.001),'moment')]},'rotation');
assert.ok(spin.members.includes('B'));
for(const m of spin.motions)near(Math.abs(m.vector.x),norm(m.vector));

// A crossing pin gives each beam its own rotational group. A twisting moment
// applied specifically to one beam end cannot excite the perpendicular branch.
const pinGroups={
  nodes:[{...node('H',v(),'pinned'),joint:'pin'},node('E',v(2),'pinned'),node('N',v(0,2),'pinned')],
  members:[member('HE','H','E'),member('HN','H','N')],
  loads:[{id:'torque',target:'member',targetId:'HE',t:0,kind:'moment',vector:v(.001)}]
};
const released=expectMode(pinGroups,'rotation');
assert.deepEqual(released.members,['HE']);
assert.ok(released.motions.every(m=>m.node==='H'||m.node==='E'));

console.log('Passed 3D instability localization, rotation about two anchors, projected mode amplitudes, rotation and translation invariance, axial strut and loaded rotational modes, and stable restraint controls.');
