import assert from 'node:assert/strict';
import {solve} from '../app/solver.ts';
import {beamDefaults,example,crossings,connectCrossing,validModel} from '../app/model.ts';
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol*Math.max(1,Math.abs(b)),`${a} differs from ${b}`);
function simple(supportA='fixed',supportB='free',t=1,type='force') {return {nodes:[{id:'a',x:0,y:0,joint:'rigid',support:supportA},{id:'b',x:4,y:0,joint:'rigid',support:supportB}],beams:[{id:'b1',a:'a',b:'b',family:'b1',...beamDefaults}],loads:[{id:'l',beam:'b1',t,type,fx:0,fy:-10,m:0,case:'Q'}]};}
const EI=beamDefaults.E*beamDefaults.I;
let m=simple(),r=solve(m);near(r.maxDisplacement,10*4**3/(3*EI)*1000);near(r.reactions[0].fy,10);near(r.reactions[0].m,40);near(r.maxMoment,40);
m=simple('pinned','roller',.5);r=solve(m);near(r.maxDisplacement,10*4**3/(48*EI)*1000);near(r.reactions[0].fy,5);near(r.reactions[1].fy,5);near(r.maxMoment,10);
m=simple('pinned','roller',.3);r=solve(m);near(r.reactions[0].fy,7);near(r.reactions[1].fy,3);near(r.maxMoment,8.4);
m=simple('pinned','roller',.5,'distributed');r=solve(m);near(r.reactions[0].fy,20);near(r.reactions[1].fy,20);near(r.maxMoment,20);near(r.maxDisplacement,5*10*4**4/(384*EI)*1000);
m=simple('fixed','free',1,'moment');m.loads[0].fy=0;m.loads[0].m=10;r=solve(m);near(r.maxDisplacement,10*4**2/(2*EI)*1000);near(r.reactions[0].m,-10);
assert.throws(()=>solve(simple('free','free')),/Unstable/);
m=simple('fixed','fixed',.5,'distributed');m.beams[0].releaseA=true;m.beams[0].releaseB=true;r=solve(m);near(r.maxDisplacement,5*10*4**4/(384*EI)*1000);near(r.reactions[0].m,0);near(r.maxMoment,20);
m=simple('fixed','free',1,'moment');m.loads[0].m=10;r=solve(m);near(r.reactions[0].fy,0);near(r.reactions[0].m,-10);
m=simple('pinned','roller');m.loads=[];m.nodes[0].settlement=1;r=solve(m);near(r.reactions[0].fy,0);near(r.maxDisplacement,1);
m=example();assert.ok(validModel(m));r=solve(m);near(r.reactions.reduce((s,r)=>s+r.fy,0),10);assert.ok(r.maxDisplacement>0);
m=example();m.constraints=[];m.nodes=m.nodes.filter(n=>n.id!=='N5');m.beams=[{...m.beams[0],b:'N2'},{...m.beams[2],b:'N4'}];m.loads=[];const cs=crossings(m);assert.equal(cs.length,1);connectCrossing(m,cs[0]);assert.equal(m.beams.length,4);assert.equal(crossings(m).length,0);assert.ok(validModel(m));
m=example('portal');r=solve(m);near(r.reactions.reduce((s,r)=>s+r.fy,0),50);near(r.reactions[0].fy,25);near(r.maxMoment,18.75,.002);
console.log('Passed: cantilever, centred and off-centre point forces, UDL, moment, instability, crossing pin, crossing split, original portal equilibrium.');

