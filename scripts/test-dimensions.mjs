import assert from 'node:assert/strict';
import {example,beamDefaults,enforceConstraints,seedDimension,dimensionValue,dimensionSense,validModel,dimensionsSatisfied,geometrySatisfied,splitBeam} from '../app/model.ts';
import {solve} from '../app/solver.ts';
const n=(id,x,y)=>({id,x,y,joint:'rigid',support:'free'});
const b=(id,a,z)=>({id,a,b:z,family:id,...beamDefaults});
const near=(x,y,t=1e-6)=>assert.ok(Math.abs(x-y)<t,`${x} != ${y}`);
const base=()=>({nodes:[n('a',0,0),n('b',3,4),n('c',7,4)],beams:[b('AB','a','b'),b('BC','b','c')],loads:[],dimensions:[]});
const d=(kind,a,z,value,extra={})=>({id:kind+a+z,kind,a,b:z,value,driving:true,...extra});
let m=base();m.dimensions=[d('length','a','b',10)];seedDimension(m,m.dimensions[0]);enforceConstraints(m);near(m.nodes[0].x,0);near(m.nodes[1].x,6);near(m.nodes[1].y,8);assert.ok(validModel(m));
m.dimensions.push(d('direction','a','b',30));seedDimension(m,m.dimensions[1]);enforceConstraints(m);near(dimensionValue(m,m.dimensions[0]),10);near(dimensionValue(m,m.dimensions[1]),30);assert.ok(validModel(m));
m.nodes[1].x=8;m.nodes[1].y=8;enforceConstraints(m,'b');near(m.nodes[1].x,8);near(m.nodes[1].y,8);near(m.nodes[0].x,8-10*Math.cos(Math.PI/6));near(m.nodes[0].y,3); // The unanchored dimension network follows the dragged point.assert.ok(validModel(m));
m=base();m.dimensions=[d('horizontal','a','b',6,{sense:1}),d('vertical','a','b',8,{sense:1})];enforceConstraints(m);near(m.nodes[1].x,6);near(m.nodes[1].y,8);assert.ok(validModel(m));
m=base();m.dimensions=[d('aligned','a','b',5),d('aligned','b','c',4),d('aligned','a','c',Math.sqrt(65))];enforceConstraints(m);assert.ok(validModel(m));
m.dimensions[2].value=2;enforceConstraints(m);assert.ok(dimensionsSatisfied(m));assert.ok(validModel(m)); // Triangle closure can move both free points.
m=base();m.dimensions=[d('length','a','b',5),d('length','a','b',6,{id:'conflict'})];assert.throws(()=>enforceConstraints(m),/conflict/);assert.equal(validModel(m),false);
m=base();m.dimensions=[d('angle','a','b',60,{c:'b',d:'c',sense:-1})];seedDimension(m,m.dimensions[0]);enforceConstraints(m);near(dimensionValue(m,m.dimensions[0]),60);assert.ok(validModel(m));
m=base();m.dimensions=[d('direction','a','b',359.9)];seedDimension(m,m.dimensions[0]);enforceConstraints(m);near(dimensionValue(m,m.dimensions[0]),359.9);
m=base();m.dimensions=[d('direction','a','b',180)];enforceConstraints(m);near(dimensionValue(m,m.dimensions[0]),180);
m=base();m.dimensions=[d('aligned','a','b',10,{driving:false})];enforceConstraints(m);near(dimensionValue(m,m.dimensions[0]),5);assert.ok(validModel(m));
m=base();m.dimensions=[d('horizontal','a','b',2,{sense:-1})];enforceConstraints(m);near(m.nodes[1].x,-2);assert.ok(validModel(m));
m=example();m.dimensions=[d('length','N1','N5',6),d('direction','N1','N5',330)];enforceConstraints(m);assert.ok(dimensionsSatisfied(m));assert.ok(geometrySatisfied(m));assert.ok(validModel(m));assert.ok(validModel(JSON.parse(JSON.stringify(m))));
const result=solve(m);const without=structuredClone(m);without.dimensions=[];near(solve(without).maxMoment,result.maxMoment);near(solve(without).maxDisplacement,result.maxDisplacement);
for(const bad of [NaN,Infinity,-2]){m=base();m.dimensions=[d('length','a','b',bad)];assert.equal(validModel(m),false);}
m=base();m.dimensions=[d('length','a','missing',5)];assert.equal(validModel(m),false);
m=base();m.dimensions=[d('angle','a','b',90,{c:'a',d:'missing'})];assert.equal(validModel(m),false);
m=base();m.dimensionAnchor='b';m.dimensions=[d('length','a','b',10)];seedDimension(m,m.dimensions[0]);near(m.nodes[1].x,3);near(m.nodes[1].y,4);enforceConstraints(m);near(dimensionValue(m,m.dimensions[0]),10);assert.ok(validModel(m)); // A legacy edit anchor is not a permanent world restraint.
m=base();m.dimensions=[d('length','a','b',5)];m.nodes.push(n('mid',1.5,2));splitBeam(m,'AB',.5,'mid');enforceConstraints(m);assert.equal(m.dimensions[0].b,'b');assert.equal(m.constraints.length,1);assert.ok(validModel(m));m.dimensions[0].value=7;seedDimension(m,m.dimensions[0]);enforceConstraints(m);near(dimensionValue(m,m.dimensions[0]),7);assert.ok(geometrySatisfied(m));assert.ok(validModel(m));
console.log('Passed: length, direction, horizontal/vertical and point distances, coupled triangles, arbitrary angles, angle wrap, reference dimensions, conflicts, collinear networks, JSON persistence, validation, and no extra structural restraint.');
