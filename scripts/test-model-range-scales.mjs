import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultMaterial,materials} from '../app/materials.ts';
import {sectionProperties} from '../app/sections.ts';
import {solve} from '../app/solver.ts';
import {solveMaterial} from '../app/plastic.ts';
import {assessResult} from '../app/analysis-validity.ts';
import {DiagramScales,diagramPixels} from '../app/diagram-scale.ts';
const geometry={shape:'rectangle',h:100,b:50,tw:0,tf:0,t:0,r:0},props=sectionProperties(geometry);
function beam(material,force){const section={id:'range-rect',name:'Rectangle 100 x 50',category:'Custom',geometry,E:material.E,...props};return {nodes:[{id:'a',x:0,y:0,joint:'rigid',support:'pinned'},{id:'b',x:5,y:0,joint:'rigid',support:'roller'}],beams:[{id:'beam',a:'a',b:'b',family:'beam',kind:'beam',profile:section.name,E:material.E,...props,section,material}],loads:[{id:'load',beam:'beam',t:.5,type:'force',fx:0,fy:-force,m:0,case:'Q'}]};}
const soft={...defaultMaterial,id:'soft',name:'Soft test material',E:2e6,fy:32,fu:undefined,strainLimit:undefined};
const extreme=beam(soft,10000),raw=solve(extreme);assert.ok(Math.abs(raw.maxDisplacement-3125000)<1);assert.equal(raw.applicability.ok,false);
const stopped=solveMaterial(extreme);assert.equal(stopped.status,'out-of-range');assert.ok(stopped.loadFactor>0&&stopped.loadFactor<1);assert.equal(stopped.reachedTarget,false);assert.equal(stopped.unloaded,undefined);assert.equal(stopped.maxResidual,undefined);assert.equal(stopped.loaded.applicability.ok,true);assert.equal(stopped.rangeStop.assessment.ok,false);assert.ok(stopped.history.every(p=>p.displacement<250));
assert.ok(stopped.loaded.applicability.memberUtilisation.beam > .99 && stopped.loaded.applicability.memberUtilisation.beam <= 1.00000001);
assert.ok(stopped.rangeStop.assessment.memberUtilisation.beam > 1);
assert.ok(raw.applicability.memberUtilisation.beam > stopped.loaded.applicability.memberUtilisation.beam);
const regular=beam(defaultMaterial,1),valid=solve(regular);assert.equal(valid.applicability.ok,true);assert.equal(solveMaterial(regular).status,'elastic');
// An axial post-yield benchmark outside 2% strain must stop, rather than claim permanent set.
const axial=beam({...defaultMaterial,fu:undefined},defaultMaterial.fy*1000*props.A*1.2);axial.nodes[0].support='fixed';axial.nodes[1].support='roller';axial.nodes[1].x=1;axial.beams[0].kind='strut';Object.assign(axial.loads[0],{t:1,fx:-axial.loads[0].fy,fy:0});assert.equal(solveMaterial(axial).status,'out-of-range');
// Translation of the entire model is not a deformation failure criterion.
const translated=structuredClone(valid);translated.samples.forEach(p=>{p.ux+=1000;p.uy+=1000;});translated.nodeDisplacements.forEach(p=>{p.ux+=1000;p.uy+=1000;});translated.maxDisplacement=1e9;assert.equal(assessResult(regular,translated).ok,true);
const nonfinite=structuredClone(valid);nonfinite.samples[0].M=Infinity;assert.equal(assessResult(regular,nonfinite).ok,false);
const scales=new DiagramScales(),ref=scales.get('u',valid,100),pixels=diagramPixels(.001,ref,70,100),larger={...valid,maxDisplacement:valid.maxDisplacement*3};assert.equal(scales.get('u',larger,100),ref);assert.equal(diagramPixels(.001,scales.get('u',larger,100),70,100),pixels);assert.equal(diagramPixels(.001,ref,70,200),pixels*2);assert.equal(scales.fit('u',larger,100).maximum,ref.maximum*3);scales.clear();assert.equal(scales.get('u',raw,100),undefined);assert.equal(scales.get('u',{...valid,maxDisplacement:0},100),undefined);assert.ok(scales.get('u',valid,100));
if(process.env.RANGE_QA_DIR){fs.mkdirSync(process.env.RANGE_QA_DIR,{recursive:true});for(const [name,model] of [['extreme',extreme],['normal',regular],['abs',beam(materials.find(m=>m.id==='abs')??soft,10000)]])fs.writeFileSync(`${process.env.RANGE_QA_DIR}/${name}.json`,JSON.stringify({format:'frame-studio-v1',name:`Range QA - ${name}`,model},null,2));}
console.log('Passed: million-mm extrapolation rejected, adaptive material range stop without invented failure or residual, ordinary elastic response, post-yield range stop, translation-invariant screening, non-finite rejection, fixed diagram reference across edits and zoom, explicit Fit and reset.');
