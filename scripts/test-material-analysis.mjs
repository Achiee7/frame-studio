import assert from 'node:assert/strict';
import {solveMaterial,sectionFibers} from '../app/plastic.ts';
import {fiberResponse,defaultMaterial,materials,validMaterial} from '../app/materials.ts';
import {solve} from '../app/solver.ts';
import {sectionProperties} from '../app/sections.ts';
import {equilibrium} from '../app/reversals.ts';
import {validModel} from '../app/model.ts';
const near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<=t*Math.max(1e-7,Math.abs(b)),`${a} differs from ${b}`);
const mat={...defaultMaterial,fu:undefined};
let state={plastic:0,yielded:false},r=fiberResponse(.002,state,mat);const expected=mat.fy*1000+mat.E*mat.hardening*(.002-mat.fy*1000/mat.E);near(r.stress,expected);assert.ok(r.state.yielded);r=fiberResponse(.002-r.stress/mat.E,r.state,mat);near(r.stress,0);assert.ok(r.state.plastic>0);
const geometry={shape:'rectangle',h:100,b:50,tw:0,tf:0,t:0,r:0},props=sectionProperties(geometry),section={id:'rect',name:'Rectangle',category:'Custom',geometry,E:mat.E,...props};
function frame(kind='beam',material=mat){return {nodes:[{id:'a',x:0,y:0,joint:'rigid',support:'fixed'},{id:'b',x:1,y:0,joint:'rigid',support:kind==='strut'?'roller':'free'}],beams:[{id:'beam',a:'a',b:'b',family:'beam',kind,profile:'Rectangle',E:material.E,A:props.A,I:props.I,section,material}],loads:[{id:'load',beam:'beam',t:1,attachment:'end',type:'force',fx:0,fy:-5,m:0,case:'Q'}]};}
assert.ok(materials.length>=20);assert.ok(materials.every(validMaterial));assert.ok(validModel(frame()));
let m=frame(),elastic=solve(m),p=solveMaterial(m,undefined,{steps:12});assert.equal(p.status,'elastic');near(p.loaded.maxDisplacement,elastic.maxDisplacement,.002);assert.equal(p.maxResidual,0);assert.ok(p.equilibriumError<1e-7);
const fibers=sectionFibers(m.beams[0]);near(fibers.reduce((s,f)=>s+f.area,0),props.A);near(fibers.reduce((s,f)=>s+f.area*f.y*f.y,0),props.I);
m=frame('strut');const fyForce=mat.fy*1000*props.A;m.loads[0].fx=fyForce*1.2;m.loads[0].fy=0;p=solveMaterial(m,undefined,{steps:16});const stress=m.loads[0].fx/props.A,eps=mat.fy*1000/mat.E+(stress-mat.fy*1000)/(mat.hardening*mat.E);assert.equal(p.status,'plastic');near(p.loaded.nodeDisplacements[1].ux,eps);near(p.unloaded.nodeDisplacements[1].ux,eps-stress/mat.E);near(p.loaded.reactions[0].fx,-m.loads[0].fx);assert.equal(p.memberStates.beam.failureLimitSet,false);
m=frame('strut');m.loads[0].t=.5;m.loads[0].fx=fyForce*1.2;m.loads[0].fy=0;p=solveMaterial(m,undefined,{steps:16});near(p.loaded.nodeDisplacements[1].ux,eps/2);near(p.unloaded.nodeDisplacements[1].ux,(eps-stress/mat.E)/2);assert.equal(p.unloadingHistory.at(-1).factor,0);assert.ok(p.trace);
// Independent rectangular-section moment–curvature solution: elastic core + yielded outer bands.
m=frame('beam',{...mat,hardening:0});m.loads[0]={...m.loads[0],type:'moment',fy:0,m:25};p=solveMaterial(m,undefined,{steps:16,layers:120});const fy=mat.fy*1000,b=.05,h=.1,Mp=fy*b*h*h/4,c=Math.sqrt(3*(Mp-25)/(fy*b)),kappa=fy/(mat.E*c),residual=(kappa-25/(mat.E*props.I))/2*1000;assert.equal(p.status,'plastic');near(p.maxResidual,residual,.025);near(p.loaded.reactions[0].m,-25);const eq=equilibrium(m,p.loaded);assert.ok(Math.abs(eq.residual.m)<1e-6);
m=frame('strut',{...mat,fu:260});m.loads[0].fx=300*1000*props.A;m.loads[0].fy=0;p=solveMaterial(m,undefined,{steps:16});assert.equal(p.status,'failed');near(p.loadFactor,260/300,.0003);assert.equal(p.unloaded,undefined);assert.equal(p.reachedTarget,false);
m=frame('strut',{...mat,hardening:0});m.loads[0].fx=mat.fy*1000*props.A*1.1;m.loads[0].fy=0;p=solveMaterial(m,undefined,{steps:8});assert.equal(p.status,'failed');near(p.loadFactor,1/1.1,.0003);assert.match(p.message,/mechanism/);
m=frame();delete m.beams[0].section;m.beams[0].profile='A/I only';assert.throws(()=>solveMaterial(m),/cross-section shape/);m=frame();m.nodes[0].support='free';assert.throws(()=>solveMaterial(m),/Unstable/);
console.log('Passed: bilinear return mapping/unloading, exact fibre A/I, elastic frame equivalence, analytical axial permanent set, independent rectangular plastic bending, equilibrium, tensile-limit load factor, ideal plastic mechanism and safe missing-input/instability handling.');
