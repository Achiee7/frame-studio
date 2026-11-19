import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createSpatialRule,editSpatialRule,suppressSpatialRule,removeSpatialRule,spatialRuleValue,spatialMeasurement,
  spatialRuleTouchesMember,validSpatialRules,moveConstrainedSpatialNode,SPATIAL_ORIGIN} from '../app/spatial-sketch.ts';
import {placeSpatialJoint,removeSpatialMember,removeSpatialNode,updateSpatialNode,validSpatialModel} from '../app/spatial-model.ts';

const ref=(type,id)=>({type,id}), n=id=>ref('node',id), m=id=>ref('member',id);
const pt=(x,y,z)=>({x,y,z});
const node=(id,x,y,z)=>({id,x,y,z,joint:'rigid',support:'free'});
const beam=(id,a,b)=>({id,a,b,kind:'beam'});
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const origin=n(SPATIAL_ORIGIN);
const specimen=()=>({nodes:[node('a',1,2,3),node('b',3,5,7),node('c',-2,5,4),node('d',2,6,5)],members:[beam('u','a','b'),beam('v','c','d')]});
const point=(model,id)=>model.nodes.find(x=>x.id===id);
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);

for(const axis of ['X','Y','Z']){
  const base=specimen(), result=createSpatialRule(base,'along'+axis,[m('u')]);
  const a=point(result,'a'),b=point(result,'b');
  near(distance(a,b),Math.sqrt(29));
  for(const ax of ['x','y','z'])if(ax!==axis.toLowerCase())near(a[ax],b[ax]);
  const moved=moveConstrainedSpatialNode(result,'b',pt(b.x+1,b.y-2,b.z+3));
  assert.deepEqual([point(moved,'b').x,point(moved,'b').y,point(moved,'b').z],[b.x+1,b.y-2,b.z+3]);
  for(const ax of ['x','y','z'])if(ax!==axis.toLowerCase())near(point(moved,'a')[ax],point(moved,'b')[ax]);
  assert.deepEqual(base,specimen());
  const pointsOnly=createSpatialRule(base,'along'+axis,[n('a'),n('d')]);
  assert.equal(pointsOnly.rules.length,1);
}
const a=specimen();
assert.equal(spatialMeasurement(a,'dz',[n('c'),n('b')]),3);
const z=createSpatialRule(a,'dz',[n('b'),n('c')],8);
near(point(z,'c').z,-1);
const resized=editSpatialRule(z,z.rules[0].id,6);
near(point(resized,'c').z,1);
const duplicate=createSpatialRule(z,'dz',[n('c'),n('b')],20);
assert.equal(duplicate.rules.at(-1).driven,true);near(spatialRuleValue(duplicate,duplicate.rules.at(-1)),8);
assert.deepEqual(duplicate.nodes,z.nodes);

const axes=createSpatialRule(createSpatialRule(a,'dx',[m('u')],3),'dy',[m('u')],4);
const inclined=createSpatialRule(axes,'length',[m('u')],13);
near(spatialRuleValue(inclined,inclined.rules.at(-1)),13);
near(Math.abs(point(inclined,'b').z-point(inclined,'a').z),12);
const impossible=createSpatialRule(axes,'length',[m('u')],2);
assert.equal(impossible.rules.at(-1).driven,true);assert.deepEqual(impossible.nodes,axes.nodes);

let lock=createSpatialRule(a,'connect',[n('a'),origin]);
for(const axis of ['x','y','z'])near(point(lock,'a')[axis],0);
assert.throws(()=>moveConstrainedSpatialNode(lock,'a',pt(1,2,3)),/conflicts/);
lock=suppressSpatialRule(lock,lock.rules[0].id,true);
lock=moveConstrainedSpatialNode(lock,'a',pt(2,3,4));near(point(lock,'a').x,2);
lock=suppressSpatialRule(lock,lock.rules[0].id,false);near(point(lock,'a').x,0);
const bare=removeSpatialRule(lock,lock.rules[0].id);assert.equal(bare.rules.length,0);
const anchored=createSpatialRule(a,'dz',[n('c'),origin],9);near(point(anchored,'c').z,9);

for(const pair of [[m('u'),n('c')],[n('c'),m('u')]]){
  const mid=createSpatialRule(a,'midpoint',pair);
  const u=point(mid,'a'),v=point(mid,'b'),c=point(mid,'c');
  for(const ax of ['x','y','z'])near(c[ax],(u[ax]+v[ax])/2);
  assert.deepEqual(pair[0].type==='member'?u:c,point(a,pair[0].type==='member'?'a':'c'));
  const off=createSpatialRule(a,'offset',pair,1.5);
  near(spatialMeasurement(off,'offset',pair),1.5);
}
const on=createSpatialRule(a,'pointOnMember',[m('u'),n('c')]);
near(spatialMeasurement(on,'offset',[m('u'),n('c')]),0);
const perp=createSpatialRule(a,'perpendicular',[m('u'),m('v')]);
near(spatialMeasurement(perp,'angle',[m('u'),m('v')]),90);
const col=createSpatialRule(a,'collinear',[m('u'),m('v')]);
near(spatialMeasurement(col,'offset',[m('u'),n('d')]),0);
const angle=createSpatialRule(a,'angle',[m('u'),m('v')],57);
near(spatialRuleValue(angle,angle.rules[0]),57);
const eq=createSpatialRule(a,'equal',[m('u'),m('v')]);
near(spatialMeasurement(eq,'length',[m('u')]),spatialMeasurement(eq,'length',[m('v')]));

const shared={nodes:[node('a',0,0,0),node('b',3,0,0),node('c',3,2,1)],members:[beam('u','a','b'),beam('v','c','b')]};
const angled=createSpatialRule(shared,'angle',[m('u'),m('v')],120);
assert.deepEqual(angled.rules[0].points,['b','a','b','c']);
near(spatialRuleValue(angled,angled.rules[0]),120);assert.deepEqual(point(angled,'b'),point(shared,'b'));
const lines={nodes:[node('a',0,0,0),node('b',4,0,0),node('c',3,1,1)],members:[beam('u','a','b')]};
const anchoredX=createSpatialRule(lines,'dx',[m('u')]);
const lifted=createSpatialRule(anchoredX,'length',[m('u')],5);
near(spatialMeasurement(lifted,'length',[m('u')]),5);near(point(lifted,'b').x,4);
const stretched=createSpatialRule(lines,'length',[m('u')],8);
const split=placeSpatialJoint(stretched,pt(3,0,0)).model;
const rule=split.rules[0];
near(spatialRuleValue(split,rule),8);
assert.ok(split.members.every(member=>spatialRuleTouchesMember(split,rule,member.id)));
const stretchedAgain=editSpatialRule(split,rule.id,10);
near(spatialRuleValue(stretchedAgain,stretchedAgain.rules[0]),10);
assert.equal(removeSpatialMember(split,split.members[1].id).rules.length,0);
assert.equal(removeSpatialNode(split,'a').rules.length,0);
const oldResult=updateSpatialNode(stretched,'b',pt(9,1,2));near(spatialRuleValue(oldResult,rule),8);
assert.ok(validSpatialModel(stretchedAgain));
assert.ok(validSpatialRules(JSON.parse(JSON.stringify(stretchedAgain))));
assert.equal(validSpatialRules({...stretched,rules:[{...rule,points:['a','missing']}]}),false);
const joined=createSpatialRule({...a,loads:[{id:'load',target:'node',targetId:'c',kind:'force',vector:pt(0,0,-1),t:0}]},'connect',[n('b'),n('c')]);
assert.equal(joined.nodes.length,3);assert.equal(joined.members[1].a,'b');assert.equal(joined.loads[0].targetId,'b');
assert.throws(()=>createSpatialRule(a,'connect',[n('a'),n('b')]),/collapse/);
const distant={...lines,nodes:[...lines.nodes,node('far',8,3,1)]};
const sliding=createSpatialRule(distant,'pointOnMember',[m('u'),n('far')]);
near(spatialMeasurement(sliding,'offset',[m('u'),n('far')]),0);
assert.ok(point(sliding,'far').x>0&&point(sliding,'far').x<4);
const parallel=createSpatialRule(a,'parallel',[m('u'),m('v')]);
near(Math.sin(spatialMeasurement(parallel,'angle',[m('u'),m('v')])*Math.PI/180),0);
const edited=editSpatialRule(angled,angled.rules[0].id,36);
near(spatialRuleValue(edited,edited.rules[0]),36);
const resplit=placeSpatialJoint(split,pt(6,0,0)).model;
assert.ok(resplit.members.every(member=>spatialRuleTouchesMember(resplit,resplit.rules[0],member.id)));
const stretched3=editSpatialRule(resplit,resplit.rules[0].id,12);
near(spatialRuleValue(stretched3,stretched3.rules[0]),12);
assert.ok(validSpatialRules(stretched3));
const broken=structuredClone(stretched3);point(broken,'b').y+=1;
assert.equal(validSpatialRules(broken),false);
const locked=createSpatialRule(createSpatialRule(lines,'alongX',[m('u')]),'length',[m('u')],4);
const impossibleZ=createSpatialRule(locked,'dz',[n('a'),n('b')],.5);
assert.equal(impossibleZ.rules.at(-1).driven,true);assert.deepEqual(impossibleZ.nodes,locked.nodes);
const inconsistentSupports=structuredClone(a);point(inconsistentSupports,'b').support='fixed';point(inconsistentSupports,'c').support='pinned';
assert.throws(()=>createSpatialRule(inconsistentSupports,'connect',[n('b'),n('c')]),/supports/);
// A dimension edit has to move the midpoint and preserve the length of its attached member.
// Exercise the same JSON recovery path as a browser reload after multiple numerical solves.
let coupled=createSpatialRule(specimen(),'midpoint',[m('u'),n('c')]);
coupled=createSpatialRule(coupled,'length',[m('v')]);
coupled=createSpatialRule(coupled,'length',[m('u')]);
const changing=coupled.rules.at(-1).id;
const bundle=await build({entryPoints:['app/local-storage.ts'], bundle:true,platform:'node',format:'esm',write:false});
const {createLocalStore}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const bag=new Map(), medium={getItem:k=>bag.get(k)??null,setItem:(k,v)=>bag.set(k,v)};
for(let i=0;i<18;i++){
  coupled=editSpatialRule(coupled,changing,4+.4*Math.sin(i*.8));
  createLocalStore(medium).writeDraft({name:'Driven frame',projectId:null,dirty:true,model:{nodes:[],beams:[],loads:[],spatial:coupled}});
  const restored=createLocalStore(medium).readDraft().model.spatial;
  assert.deepEqual(restored,coupled);
  near(spatialRuleValue(restored,restored.rules.at(-1)),4+.4*Math.sin(i*.8));
  coupled=restored;
}
console.log('3D driving and reference dimensions, X/Y/Z constraints, original member spans, constrained edits, overload rejection and nodal merge passed.');
