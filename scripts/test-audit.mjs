import assert from 'node:assert/strict';
import fs from 'node:fs';
import {solve} from '../app/solver.ts';
import {equilibrium,reversals} from '../app/reversals.ts';
import {beamDefaults} from '../app/model.ts';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const model=(xy=[[0,0],[4,0]],supports=['fixed','free'],kind='beam')=>({nodes:xy.map(([x,y],i)=>({id:String(i),x,y,support:supports[i],joint:'rigid'})),beams:[{...beamDefaults,id:'b',family:'b',a:'0',b:'1',kind}],loads:[]});
const load=(type,fx,fy,m=0,t=1)=>({id:'l',beam:'b',type,fx,fy,m,t,case:'Q'});
let m=model();const EA=beamDefaults.E*beamDefaults.A,EI=beamDefaults.E*beamDefaults.I;
m.loads=[load('force',10,0)];let r=solve(m);near(r.nodeDisplacements[1].ux,40/EA);near(r.maxMoment,0);
m=model([[0,0],[0,4]]);m.loads=[load('force',0,10)];r=solve(m);near(r.nodeDisplacements[1].uy,40/EA);near(r.samples[0].N,10);
// Inclined axial-only bar: fixed endpoints, interior axial load. No bending mesh DOFs.
m=model([[0,0],[3,4]],['pinned','pinned'],'strut');m.loads=[load('force',6,8,0,.5)];r=solve(m);near(r.reactions[0].fx,-3);near(r.reactions[1].fy,-4);near(Math.max(...r.samples.map(s=>Math.hypot(s.ux,s.uy))),10*5/(4*EA));near(Math.max(...r.samples.map(s=>s.N)),5);near(Math.min(...r.samples.map(s=>s.N)),-5);
m.loads=[load('force',-8,6,0,.5)];assert.throws(()=>solve(m),/strut cannot carry/);
m.loads=[load('moment',0,0,1,.5)];assert.throws(()=>solve(m),/strut cannot carry/);
// Stable triangular truss: two oblique bars, unloaded rotations omitted.
m=model([[-3,0],[0,4],[3,0]],['pinned','free','pinned'],'strut');m.beams.push({...m.beams[0],id:'c',family:'c',a:'1',b:'2'});m.loads=[load('force',0,-10,0,1)];r=solve(m);near(r.reactions[0].fy,5);near(r.reactions[1].fy,5);near(r.samples.find(s=>s.beam==='b').N,-6.25);near(r.nodeDisplacements[1].uy,-10/(2*EA/5*.8**2));
m=model([[0,0],[4,0]],['pinned','free'],'strut');assert.throws(()=>solve(m),/Unstable/);
// Exact recovery within an element, including axial UDL and quartic bending term.
m=model();m.loads=[load('distributed',2,-3)];r=solve(m);for(const s of r.samples){near(s.N,2*(4-s.x));near(s.V,3*(4-s.x));near(s.M,-3*(4-s.x)**2/2);near(s.ux,2*s.x*(8-s.x)/(2*EA));near(s.uy,-3*s.x**2*(6*16-16*s.x+s.x**2)/(24*EI));}
// Interior force and moment are each applied once; global equilibrium includes lever arms.
m=model();m.loads=[load('force',3,-12,0,.37),{...load('moment',0,0,1,.37),id:'m'}];r=solve(m);near(r.reactions[0].fy,12);near(r.reactions[0].m,12*4*.37-1);for(const v of Object.values(equilibrium(m,r).residual))near(v,0);
// Rigid vs fully released crossing, and strongly asymmetric stiffness.
const original=JSON.parse(fs.readFileSync(new URL('./fixtures/audit-original-frame.json',import.meta.url),'utf8')).model;
const ref=JSON.parse(fs.readFileSync(new URL('./fixtures/audit-reference.json',import.meta.url),'utf8'));
let errors={reaction:0,centreTranslation:0,centreRotation:0,memberForce:0,memberMoment:0,equilibrium:0};
for(const c of ref.cases){m=structuredClone(original);m.loads.forEach(l=>{l.fx=c.Fx/3*l.fx;l.fy=c.Fy/-12*l.fy;l.m=c.M*l.m;});r=solve(m);for(const rr of c.reactions){const p=r.reactions.find(x=>x.node===rr.node);for(const k of ['fx','fy','m'])errors.reaction=Math.max(errors.reaction,Math.abs(p[k]-rr[k]));}const u=r.nodeDisplacements.find(n=>n.node===ref.center);errors.centreTranslation=Math.max(errors.centreTranslation,Math.abs(u.ux-c.U[0]),Math.abs(u.uy-c.U[1]));errors.centreRotation=Math.max(errors.centreRotation,Math.abs(u.rotations[0].value-c.U[2]));for(const b of c.members){const ss=r.samples.filter(s=>s.beam===b.beam);for(const s of ss){errors.memberForce=Math.max(errors.memberForce,Math.abs(s.N-b.N),Math.abs(s.V-b.V));errors.memberMoment=Math.max(errors.memberMoment,Math.abs(s.M-(b.Mstart+(b.Mend-b.Mstart)*s.t)));}}for(const v of Object.values(equilibrium(m,r).residual))errors.equilibrium=Math.max(errors.equilibrium,Math.abs(v));}
Object.values(errors).forEach(v=>assert.ok(v<1e-8));
m=structuredClone(original);const base=solve(m);m.nodes.find(n=>n.id===ref.center).joint='hinge';m.loads.forEach(l=>l.m=0);r=solve(m);near(r.maxMoment,0);assert.ok(base.maxMoment>.3);
m=structuredClone(original);m.beams[0].I*=10;r=solve(m);assert.ok(Math.abs(r.maxMoment-base.maxMoment)>.01);for(const v of Object.values(equilibrium(m,r).residual))near(v,0);
// Translation and rotation of the entire coordinate system preserve local forces.
m=structuredClone(original);m.nodes.forEach(n=>{n.x+=11.25;n.y-=7.1;});r=solve(m);r.reactions.forEach((a,i)=>{near(a.fx,base.reactions[i].fx);near(a.fy,base.reactions[i].fy);});
m=model();m.loads=[load('force',0,-10)];const flat=solve(m),theta=.63,c=Math.cos(theta),s=Math.sin(theta);m.nodes.forEach(n=>{const x=n.x,y=n.y;n.x=c*x-s*y;n.y=s*x+c*y;});m.loads.forEach(l=>{const x=l.fx,y=l.fy;l.fx=c*x-s*y;l.fy=s*x+c*y;});r=solve(m);r.samples.forEach((a,i)=>{near(a.N,flat.samples[i].N);near(a.V,flat.samples[i].V);near(a.M,flat.samples[i].M);});
// Section conversion used by UI: 854.80 mm2 and 435510.7 mm4.
near(8.548/1e4,854.80/1e6,1e-12);near(43.55107/1e8,435510.7/1e12,1e-12);near(210*1e6,210e9/1000);
const all=reversals(original,solve);assert.equal(all.cases.length,8);for(const n of all.supports){near(n.resultant.absolute.value,Math.max(...all.cases.map(c=>{const r=c.result.reactions.find(x=>x.node===n.node);return Math.hypot(r.fx,r.fy);})));}
console.log('Passed: axial X/Y, inclined strut + interior axial load, triangular truss, transverse strut rejection, unloaded mechanism, exact UDL recovery, single interior moment/load, rigid/hinged X, stiffness change, eight independent reference cases, simultaneous resultants.');
console.log(JSON.stringify(errors));
if(process.env.AUDIT_OUTPUT){fs.writeFileSync(process.env.AUDIT_OUTPUT,JSON.stringify({errors,model:original,baseline:base,equilibrium:equilibrium(original,base),...all},null,2));}


