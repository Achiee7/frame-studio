import assert from 'node:assert/strict';
import {sections,validSection,applySection,sectionProperties} from '../app/sections.ts';
import {planarSectionTargets,spatialSectionTargets,assignSpatialSections,usedSections} from '../app/section-assignment.ts';
import {sectionForSpatialMember,spatialSectionFromCatalog,validSpatialSection} from '../app/spatial-analysis-input.ts';
import {resizedSection} from '../app/profile-edit.ts';
import {example,validModel} from '../app/model.ts';

const approx=(a,b,relative=1e-8)=>assert.ok(Math.abs(a-b)<=Math.abs(b)*relative,`${a} ≠ ${b}`);
const find=id=>{const result=sections.find(s=>s.id===id);assert.ok(result,id);return result;};
assert.equal(new Set(sections.map(s=>s.id)).size,sections.length);
for(const s of sections){assert.ok(validSection(s));assert.ok(validSpatialSection(spatialSectionFromCatalog(s)),s.name);}
const scaffold3=find('Scaffold-48.3-48.3-3.2'),scaffold4=find('Scaffold-48.3-48.3-4');
// Published JASCO nominal mass using the (uncoated) section area and 7850 kg/m³.
approx(scaffold3.A*7850,3.56,.001);approx(scaffold4.A*7850,4.37,.001);
approx(spatialSectionFromCatalog(scaffold4).J,2*scaffold4.I);
assert.match(scaffold3.name,/EN 39 type 3/);assert.match(scaffold4.name,/EN 39 type 4/);
const box=find('RHS-40-20-2-CF');
assert.equal(box.geometry.r,4);assert.equal(box.geometry.ri,2);
assert.equal(find('RHS-100-50-4').geometry.r,6);
assert.equal(find('RHS-100-50-4-CF').geometry.r,8);
approx(find('SHS-40-40-3.2').A*7850,3.61,.002);

const m=example(),assigned=applySection(m,['B1','B3'],scaffold4);
assert.deepEqual(usedSections(planarSectionTargets(assigned)).map(s=>s.members),[['B1','B3'],['B2','B4']]);
assert.deepEqual(usedSections(planarSectionTargets(m)).map(s=>s.members),[['B1','B2','B3','B4']]);
const changed=structuredClone(assigned);
changed.beams[2].section={...scaffold4,name:scaffold4.name};changed.beams[2].A*=1.2;
assert.equal(usedSections(planarSectionTargets(changed)).length,3,'an assigned snapshot with different stiffness stays selectable');

const spatial={
  nodes:[0,1,2,3].map(i=>({id:'N'+i,x:i,y:i,z:2*i,joint:'rigid',support:'free'})),
  members:[0,1,2].map(i=>({id:'B'+(i+1),a:'N'+i,b:'N'+(i+1),kind:'beam',family:'span'}))
};
spatial.members[1].section={...sectionForSpatialMember(spatial.members[1]),roll:35};
const grouped=assignSpatialSections(spatial,['B1','B2'],box);
assert.deepEqual(grouped.members.map(b=>b.section?.name),[box.name,box.name,undefined]);
assert.equal(grouped.members[1].section.roll,35);
assert.deepEqual(usedSections(spatialSectionTargets(grouped)).map(x=>x.members),[['B1','B2'],['B3']]);
assert.equal(spatial.members[0].section,undefined);
assert.equal(grouped.members[2],spatial.members[2]);
assert.throws(()=>assignSpatialSections(grouped,['B1','B7'],scaffold3),/existing member/);

const custom=resizedSection(box,'b',27);
const edited=assignSpatialSections(grouped,['B1'],custom),snapshot=JSON.parse(JSON.stringify(edited));
assert.ok(validModel({...m,spatial:snapshot}));
assert.equal(spatialSectionTargets(snapshot)[0].section.geometry.b,27);
assert.equal(spatialSectionTargets(snapshot)[1].section.geometry.b,20);
const catalogH=find('HEA-120'),userI={...catalogH,id:'my-i',category:'Custom',name:'Edited HEA'};
approx(spatialSectionFromCatalog(userI).J,6.04e-8,.001);
const rect={shape:'rectangle',h:100,b:100,t:0,tw:0,tf:0,r:0},square={...custom,geometry:rect,...sectionProperties(rect)};
approx(spatialSectionFromCatalog(square).J,0.141*0.1**4,.005);

const numeric={name:'My measured section',E:72e6,G:27e6,A:.004,Iy:9e-5,Iz:4e-5,J:1.234e-6,roll:70};
snapshot.members[0].section=numeric;
const measured=spatialSectionTargets(snapshot)[0].section;
assert.equal(measured.geometry,undefined);
const copied=assignSpatialSections(snapshot,['B2'],measured).members[1].section;
for(const key of ['name','E','G','A','Iy','Iz','J'])assert.equal(copied[key],numeric[key]);
assert.equal(copied.roll,35);
const changedJ={...spatialSectionFromCatalog(box),J:1.7863e-6};
snapshot.members[0].section=changedJ;
const adjusted=spatialSectionTargets(snapshot)[0].section;
assert.equal(adjusted.geometry.b,20);assert.equal(adjusted.J,changedJ.J);
approx(spatialSectionFromCatalog(adjusted).J,changedJ.J);
assert.equal(resizedSection(adjusted,'b',26).J,undefined);
snapshot.members[0].section={...changedJ,Iy:changedJ.Iy*2};
assert.equal(spatialSectionTargets(snapshot)[0].section.geometry,undefined,'manual A/I must not acquire a different catalogue geometry');
assert.throws(()=>assignSpatialSections(snapshot,['B1'],{...measured,J:undefined}),/torsion constant/);
assert.equal(validSpatialSection({...copied,profile:{...box,massProperties:{mass:-3}}}),false);
console.log('Passed section catalogues, scaffold geometry, custom torsion, used-section variants, bulk assignment, member roll, numeric stiffness and saved profile drawings.');
