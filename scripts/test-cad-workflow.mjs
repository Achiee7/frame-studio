import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {beamDefaults,enforceConstraints,validModel,dimensionValue,ORIGIN,cadPoint,mergePoints,sketchSatisfied,splitBeam} from '../app/model.ts';
import {solve} from '../app/solver.ts';
import {reversals,reversalEnvelopes} from '../app/reversals.ts';
const bundle=await build({entryPoints:['app/cad.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {dimensionCandidate,addSketchConstraint}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const reportBundle=await build({entryPoints:['app/frame-report.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {reportHtml}=await import('data:text/javascript;base64,'+Buffer.from(reportBundle.outputFiles[0].text).toString('base64'));
const n=(id,x,y)=>({id,x,y,joint:'rigid',support:'free'}),b=(id,a,z)=>({id,a,b:z,family:id,...beamDefaults}),near=(x,y,t=1e-6)=>assert.ok(Math.abs(x-y)<t,`${x} != ${y}`);
const base=()=>({nodes:[n('a',0,0),n('b',3,4),n('c',8,1),n('d',11,2)],beams:[b('AB','a','b'),b('CD','c','d')],loads:[]});
const screen=p=>({x:p.x*100,y:-p.y*100});let m=base();
let d=dimensionCandidate(m,{points:['a','b'],members:[]},screen,{x:150,y:60});assert.equal(d.kind,'horizontal');near(d.value,3);
d=dimensionCandidate(m,{points:['a','b'],members:[]},screen,{x:390,y:-150});assert.equal(d.kind,'vertical');near(d.value,4);
d=dimensionCandidate(m,{points:['a','b'],members:[]},screen,{x:390,y:-150},true);assert.equal(d.kind,'aligned');near(d.value,5);
d=dimensionCandidate(m,{points:[],members:['AB']},screen,{x:190,y:-100});assert.equal(d.kind,'length');near(d.value,5);
for(const mouse of [{x:400,y:20},{x:20,y:-400},{x:400,y:-400},{x:20,y:20}]){d=dimensionCandidate(m,{points:[],members:['AB','CD']},screen,mouse);assert.equal(d.kind,'angle');assert.ok(d.value>0&&d.value<180);near(d.value,dimensionValue(m,d));}
for(const type of ['horizontal','vertical','equal','parallel','perpendicular','collinear']){m=base();addSketchConstraint(m,type,'AB',type==='horizontal'||type==='vertical'?undefined:'CD');enforceConstraints(m);assert.ok(validModel(m),type);assert.ok(sketchSatisfied(m),type);m.nodes.find(n=>n.id==='b').x+=1;enforceConstraints(m,'b');assert.ok(validModel(m),type+' survives drag');}
m=base();addSketchConstraint(m,'equal','AB','CD');enforceConstraints(m);m.dimensions=[{id:'len',kind:'length',a:'a',b:'b',value:8,driving:true}];enforceConstraints(m);near(Math.hypot(m.nodes[3].x-m.nodes[2].x,m.nodes[3].y-m.nodes[2].y),8);assert.ok(validModel(m));
m=base();m.dimensions=[{id:'x',kind:'horizontal',a:ORIGIN,b:'c',value:6,driving:true,sense:1},{id:'y',kind:'vertical',a:ORIGIN,b:'c',value:3,driving:true,sense:1}];enforceConstraints(m);near(cadPoint(m,'c').x,6);near(cadPoint(m,'c').y,3);assert.ok(validModel(m));assert.equal(m.nodes.length,4);assert.equal(m.nodes.some(n=>n.id===ORIGIN),false);
m=base();mergePoints(m,'c',ORIGIN);enforceConstraints(m);near(cadPoint(m,'c').x,0);near(cadPoint(m,'c').y,0);assert.equal(cadPoint(m,'c').support,'free');assert.ok(validModel(m));
m=base();assert.throws(()=>mergePoints(m,'a','b'),/collapse/);mergePoints(m,'b','c');enforceConstraints(m);assert.equal(m.nodes.length,3);assert.equal(m.beams[1].a,'b');assert.ok(validModel(m));
m=base();m.loads=[{id:'L',beam:'AB',type:'force',fx:0,fy:-10,m:0,t:.4,case:'Q',position:{from:'start',distance:2}}];m.dimensions=[{id:'length',kind:'length',a:'a',b:'b',value:10,driving:true}];enforceConstraints(m);near(m.loads[0].t,.2);assert.ok(validModel(m));m.loads[0].position.from='end';enforceConstraints(m);near(m.loads[0].t,.8);m.nodes.push(n('mid',m.nodes[0].x+(m.nodes[1].x-m.nodes[0].x)/2,m.nodes[0].y+(m.nodes[1].y-m.nodes[0].y)/2));splitBeam(m,'AB',.5,'mid');enforceConstraints(m);assert.ok(validModel(m));
m={nodes:[{...n('a',0,0),support:'fixed'},n('b',4,0)],beams:[b('AB','a','b')],loads:[{id:'L',beam:'AB',type:'force',fx:3,fy:-8,m:0,t:.6,case:'Q'}]};const original=solve(m);m.dimensions=[{id:'origin',kind:'horizontal',a:ORIGIN,b:'b',value:4,driving:true}];enforceConstraints(m);near(solve(m).maxMoment,original.maxMoment);const all=reversals(m,solve),selected=reversalEnvelopes(m,all.cases.filter(c=>['R2','R5'].includes(c.id)),all.factors);assert.equal(selected.cases.length,2);for(const group of [...selected.members,...selected.supports])for(const k of Object.values(group))if(typeof k==='object')for(const which of ['min','max','absolute'])assert.ok(['R2','R5'].includes(k[which].case));assert.throws(()=>reversalEnvelopes(m,[],all.factors),/at least one/);
const html=reportHtml(m,'Test <frame>',selected,['R1','R3','R4','R6','R7','R8']);assert.ok(html.includes('Test &lt;frame&gt;'));assert.ok(html.includes('Excluded as impossible'));assert.ok(!html.includes('Load reversal R1'));assert.ok(html.includes('Load reversal R2'));assert.ok(html.includes('Print / save as PDF'));
console.log('Passed: direct dimension placement, Shift/aligned and angle sectors; all six persistent sketch constraints; origin anchoring without FE restraints; physical point merge; fixed-distance loads through length edits and splits; filtered governing envelopes; escaped printable report.');
