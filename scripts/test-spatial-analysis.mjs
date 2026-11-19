import {insertSpatialJoint,removeSpatialMember,removeSpatialNode,updateSpatialNode,validSpatialModel} from '../app/spatial-model.ts';
import {createSpatialRule} from '../app/spatial-sketch.ts';
import assert from 'node:assert/strict';
import {solveSpatial} from '../app/spatial-analysis.ts';
import {sectionForSpatialMember,spatialSectionFromCatalog,splitSpatialLoads,validSpatialAnalysisInput} from '../app/spatial-analysis-input.ts';
import {sections} from '../app/sections.ts';

const v=(x=0,y=0,z=0)=>({x,y,z});
const norm=a=>Math.hypot(a.x,a.y,a.z);
const scale=(a,k)=>v(a.x*k,a.y*k,a.z*k);
const add=(a,b)=>v(a.x+b.x,a.y+b.y,a.z+b.z);
const cross=(a,b)=>v(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<=eps*Math.max(1e-7,Math.abs(a),Math.abs(b))+1e-13,`${a} differs from ${b}`);
function nearVec(a,b){for(const key of ['x','y','z'])near(a[key],b[key]);}
const section={name:'Benchmark',E:200e6,G:78e6,A:.008,Iy:3.2e-5,Iz:1.7e-5,J:2.1e-5,roll:0};
const {E,G,A,Iy,Iz,J}=section,L=2,P=1.25;
const node=(id,point,support='free',joint='rigid')=>({...point,id,support,joint});
const member=(id,a,b,kind='beam')=>({id,a,b,kind,section});
const load=(target,targetId,kind,vector,t=0)=>({id:'L1',target,targetId,kind,vector,t});
const single=()=>({nodes:[node('A',v(),'fixed'),node('B',v(L))],members:[member('B1','A','B')],loads:[]});
function solve(loadCase,edit=()=>{}){
  const model=single();model.loads=[loadCase];edit(model);
  const result=solveSpatial(model);
  nearVec(result.equilibrium.force,v());nearVec(result.equilibrium.moment,v());
  return result;
}
const tip=(kind,vec,edit)=>solve(load('node','B',kind,vec),edit);
const component=(coord,magnitude)=>v(...['x','y','z'].map(c=>c===coord?magnitude:0));
for(const coord of ['x','y','z']){
  const f=component(coord,P),r=tip('force',f),expected=coord==='x'?P*L/(E*A):P*L**3/(3*E*(coord==='y'?Iz:Iy));
  nearVec(r.nodes[1].displacement,component(coord,expected));near(r.maxDisplacement,expected);
  nearVec(r.reactions[0].force,scale(f,-1));nearVec(r.reactions[0].moment,scale(cross(v(L),f),-1));
  const moment=tip('moment',f);
  const rot=coord==='x'?P*L/(G*J):P*L/(E*(coord==='y'?Iy:Iz));
  nearVec(moment.nodes[1].rotation,component(coord,rot));nearVec(moment.reactions[0].moment,scale(f,-1));
}
const torsion=tip('moment',v(P));
for(const s of torsion.members[0].samples)near(s.T,P);
const rolled=tip('force',v(0,0,-P),m=>{m.members[0].section={...section,roll:90};});
near(rolled.nodes[1].displacement.z,-P*L**3/(3*E*Iz));
nearVec(rolled.members[0].localY,v(0,0,1));
const direction=scale(v(2,3,6),1/7);
const inclined=tip('force',scale(direction,P),m=>{m.nodes[1]={...m.nodes[1],...scale(direction,L)};});
nearVec(inclined.nodes[1].displacement,scale(direction,P*L/(E*A)));
near(inclined.members[0].samples[0].N,P);

// A member force or moment at an interior station exercises condensed load
// interpolation and the exact jump on either side of the load, in both planes.
const fraction=.37,a=fraction*L;
for(const coord of ['x','y','z']){
  const f=component(coord,P),r=solve(load('member','B1','force',f,fraction));
  const expected=coord==='x'?P*a/(E*A):P*a*a*(3*L-a)/(6*E*(coord==='y'?Iz:Iy));
  nearVec(r.nodes[1].displacement,component(coord,expected));
  nearVec(r.reactions[0].force,scale(f,-1));nearVec(r.reactions[0].moment,scale(cross(v(a),f),-1));
  const field={x:'N',y:'Vy',z:'Vz'}[coord],jump=r.members[0].samples.filter(s=>s.t===fraction);
  assert.equal(jump.length,2);near(jump[0][field]-jump[1][field],P);
  nearVec(jump[0].displacement,jump[1].displacement);
  const moment=solve(load('member','B1','moment',f,fraction));
  const rot=coord==='x'?P*a/(G*J):P*a/(E*(coord==='y'?Iy:Iz));
  nearVec(moment.nodes[1].rotation,component(coord,rot));
  const mjump=moment.members[0].samples.filter(s=>s.t===fraction),mf={x:'T',y:'My',z:'Mz'}[coord];
  near(mjump[0][mf]-mjump[1][mf],P);
}
const ff=solve(load('member','B1','distributed',v(0,0,-P)),m=>{m.nodes[1].support='fixed';});
near(ff.maxDisplacement,P*L**4/(384*E*Iy));
nearVec(ff.reactions[0].force,v(0,0,P*L/2));
near(ff.reactions[0].moment.y,-P*L**2/12);
const ss=solve(load('member','B1','distributed',v(0,-P,0)),m=>{m.nodes[0].support='pinned';m.nodes[1].support='pinned';});
near(ss.maxDisplacement,5*P*L**4/(384*E*Iz));near(ss.members[0].samples.at(-1).Mz,0);
assert.ok(ss.warnings.some(message=>message.includes('free spin')));
const spaced=solve(load('member','B1','force',v(0,-P,0),fraction),m=>{m.nodes[0].support='pinned';m.nodes[1].support='pinned';});
const maxX=L-Math.sqrt((L*L-a*a)/3),b=L-maxX;
near(spaced.maxDisplacement,P*a*b*(L*L-a*a-b*b)/(6*L*E*Iz));
assert.throws(()=>solve(load('node','B','moment',v(P)),m=>{m.nodes[0].support='pinned';m.nodes[1].support='pinned';}),/unrestrained rotation/);

// A pin at a split node passes bending in its continuous family. At a free
// internal hinge the two segments instead develop zero moment at the junction.
for(const joint of ['rigid','pin','hinge']){
  const model={nodes:[node('A',v(),'fixed'),node('B',v(L/2),'free',joint),node('C',v(L),'fixed')],members:[
    {...member('B1','A','B'),family:'original'},{...member('B2','B','C'),family:'original'}],loads:[load('node','B','force',v(0,0,-P))]};
  const result=solveSpatial(model);
  near(result.maxDisplacement,joint==='hinge'?P*L**3/(48*E*Iy):P*L**3/(192*E*Iy));
  near(Math.abs(result.members[0].samples.at(-1).My),joint==='hinge'?0:P*L/8);
}
const spring=solve(load('node','B','force',v(0,0,-P)),m=>{m.nodes[1].support='spring';m.nodes[1].spring=120;});
near(spring.nodes[1].displacement.z,-P/(120+3*E*Iy/L**3));
near(spring.reactions[1].force.z,-120*spring.nodes[1].displacement.z);
assert.throws(()=>tip('force',v(),m=>{m.nodes[0].support='free';}),/Unstable 3D frame/);
assert.throws(()=>tip('force',v(0,0,1e8)),/small-displacement/);
assert.throws(()=>solve(load('member','B1','force',v(0,P,0),.5),m=>{m.members[0].kind='strut';}),/Axial strut/);

// Spatial tetrahedral truss with three ground anchors. Stiffness at its apex
// equals the sum of EA/L times each member's unit direction outer product.
const base=[v(1,0),v(-.5,Math.sqrt(3)/2),v(-.5,-Math.sqrt(3)/2)];
const truss={nodes:[...base.map((p,i)=>node('G'+i,p,'pinned')),node('H',v(0,0,1))],members:base.map((_,i)=>member('T'+i,'G'+i,'H','strut')),loads:[load('node','H','force',v(0,0,-P))]};
const triangular=solveSpatial(truss);
near(triangular.nodes.at(-1).displacement.z,-P*2*Math.sqrt(2)/(3*E*A));
for(const m of triangular.members)near(m.samples[0].N,-P*Math.sqrt(2)/3);

const catalog=spatialSectionFromCatalog(sections.find(s=>s.id==='HEA-120'));
near(catalog.J,6.04e-8);near(catalog.G,sectionForSpatialMember({}).G);
const pipe=sections.find(s=>s.category==='CHS');near(spatialSectionFromCatalog(pipe).J,2*pipe.I);
const originalLoad=load('member','M','force',v(P),.8);
const remapped=splitSpatialLoads([originalLoad],'M','M2',.5);
assert.equal(remapped[0].targetId,'M2');near(remapped[0].t,.6);
const uniform=splitSpatialLoads([load('member','M','distributed',v(0,0,-P))],'M','M2',.5);
assert.equal(uniform.length,2);assert.notEqual(uniform[0].id,uniform[1].id);
assert.equal(validSpatialAnalysisInput({...single(),loads:[{...originalLoad,targetId:'missing'}]}),false);

// A split preserves loads in world space, including one exactly at the split,
// uniform load intensity, independent family rotations at a crossing pin and roll.
const combined=single();
combined.members[0].section={...section,roll:27};
combined.loads=[
  {...load('member','B1','force',v(.25,-P,0),.73),id:'point'},
  {...load('member','B1','moment',v(.23,.37,-.55),.41),id:'couple'},
  {...load('member','B1','distributed',v(.3,-.5,-1.5)),id:'uniform'},
  {...load('node','B','force',v(0,.42,-.26)),id:'tip'},
];
const intact=solveSpatial(combined),cut=insertSpatialJoint(combined,'B1',v(.41*L));
const atPin=updateSpatialNode(cut.model,cut.node.id,{joint:'pin'});
const afterSplit=solveSpatial(atPin);
near(afterSplit.maxDisplacement,intact.maxDisplacement);
nearVec(afterSplit.nodes.find(n=>n.id==='B').displacement,intact.nodes[1].displacement);
nearVec(afterSplit.reactions[0].force,intact.reactions[0].force);
nearVec(afterSplit.reactions[0].moment,intact.reactions[0].moment);
assert.equal(atPin.loads.filter(l=>l.kind==='distributed').length,2);
assert.equal(atPin.members[0].family,atPin.members[1].family);

const crossing={nodes:[node('O',v(),'free','pin'),node('W',v(-1),'fixed'),node('E',v(1),'fixed'),
  node('S',v(0,-1),'fixed'),node('N',v(0,1),'fixed')],
  members:[{...member('WO','W','O'),family:'east-west'},{...member('OE','O','E'),family:'east-west'},
    {...member('SO','S','O'),family:'north-south'},{...member('ON','O','N'),family:'north-south'}],
  loads:[load('member','WO','moment',v(P),1)]};
const crossed=solveSpatial(crossing);
nearVec(crossed.reactions.find(r=>r.id==='S').moment,v());
nearVec(crossed.reactions.find(r=>r.id==='N').force,v());
near(crossed.reactions.find(r=>r.id==='W').moment.x,-P/2);
const welded=solveSpatial({...crossing,nodes:crossing.nodes.map(n=>({...n,joint:'rigid'}))});
assert.ok(Math.abs(welded.reactions.find(r=>r.id==='S').moment.x)>P/100);

const combinedNodes={...single(),nodes:[...single().nodes,node('other tip',v(L,.01))],
  loads:[load('node','other tip','force',v(0,0,-P))]};
const merge=createSpatialRule(combinedNodes,'connect',[{type:'node',id:'B'},{type:'node',id:'other tip'}]);
assert.equal(merge.loads[0].targetId,'B');assert.ok(validSpatialModel(merge));
const restored=solveSpatial(JSON.parse(JSON.stringify(merge)));
nearVec(restored.reactions[0].force,v(0,0,P));
assert.equal(removeSpatialNode(merge,'B').loads.length,0);
const afterRemove=removeSpatialMember(atPin,atPin.members[1].id);
assert.ok(afterRemove.loads.every(l=>l.target==='node'||l.targetId===atPin.members[0].id));
assert.ok(validSpatialModel(afterRemove));

const clamped=single();clamped.nodes[1].support='fixed';
clamped.loads=[load('node','B','force',v(.2,-.7,1.1)),{...load('node','B','moment',v(-.4,.8,1.3)),id:'couple'}];
const fixed=solveSpatial(clamped);near(fixed.maxDisplacement,0);
nearVec(fixed.reactions[1].force,scale(clamped.loads[0].vector,-1));
nearVec(fixed.reactions[1].moment,scale(clamped.loads[1].vector,-1));
nearVec(fixed.equilibrium.force,v());nearVec(fixed.equilibrium.moment,v());
const strutsOnly={...truss,loads:[load('node','H','moment',v(1,0,0))]};
assert.throws(()=>solveSpatial(strutsOnly),/unrestrained rotation/);
const freeSpin=single();
freeSpin.nodes=freeSpin.nodes.map(n=>({...n,support:'pinned'}));
freeSpin.loads=[load('node','A','force',v(9e10)),{...load('node','B','moment',v(.1)),id:'small torque'}];
assert.throws(()=>solveSpatial(freeSpin),/unrestrained rotation/);
freeSpin.loads=[{...load('node','A','moment',v(-P)),id:'left torque'},load('node','B','moment',v(P))];
const torquePair=solveSpatial(freeSpin);
near(torquePair.members[0].samples[12].T,P);nearVec(torquePair.equilibrium.moment,v());
const stiffer=tip('force',v(0,0,P),m=>{m.members[0].section={...section,E:2*E};});
near(stiffer.maxDisplacement,P*L**3/(6*E*Iy));

console.log('Passed 3D space-frame benchmarks, roll, struts, free spins and mechanisms, continuous pins, springs, distributed and interior actions, equilibrium, exact diagram extrema and saved property validation.');
