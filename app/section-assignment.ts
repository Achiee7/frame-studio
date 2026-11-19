import type {Model} from './model.ts';
import {sections,sectionForBeam,validSection} from './sections.ts';
import type {SectionSpec} from './sections.ts';
import type {SpatialModel,SpatialMember} from './spatial-model.ts';
import {sectionForSpatialMember,spatialSectionFromCatalog,validSpatialSection} from './spatial-analysis-input.ts';

export type SectionTarget={id:string;label:string;section:SectionSpec;family?:string};

export function planarSectionTargets(model:Model):SectionTarget[]{
  return model.beams.map((beam,i)=>({id:beam.id,label:`B${i+1}`,family:beam.family,section:sectionForBeam(beam)}));
}

const matches=(a:number|undefined,b:number)=>a!==undefined&&Math.abs(a-b)<=1e-8*Math.max(Math.abs(a),Math.abs(b),1e-14);

function assignedSpatialProfile(member:SpatialMember):SectionSpec{
  const current=sectionForSpatialMember(member);
  const stored=current.profile??sections.find(s=>s.name===current.name);
  if(stored&&matches(stored.A,current.A)&&matches(stored.I,current.Iy)&&matches(stored.Iminor,current.Iz)){
    let defaultG:number|undefined,defaultJ:number|undefined;
    try{
      const defaults=spatialSectionFromCatalog(stored,current.roll);
      defaultG=defaults.G;defaultJ=defaults.J;
    }catch{/* Older property-only snapshots can omit J. Use the saved member stiffness. */}
    return {...stored,name:current.name,E:current.E,
      ...(stored.material&&{material:{...stored.material,E:current.E}}),
      ...(!matches(defaultG,current.G)&&{G:current.G}),
      ...(!matches(defaultJ,current.J)&&{J:current.J})};
  }
  // A manually entered member may have no geometric dimensions. Its full
  // stiffness can still be copied to other members, including G and J.
  return {id:'current',name:current.name,category:'Custom',E:current.E,G:current.G,
    A:current.A,I:current.Iy,Iminor:current.Iz,J:current.J,method:'User-entered spatial section properties'};
}

export function spatialSectionTargets(model:SpatialModel):SectionTarget[]{
  return model.members.map(member=>({id:member.id,label:member.id,family:member.family,section:assignedSpatialProfile(member)}));
}

export function assignSpatialSections(model:SpatialModel,ids:string[],section:SectionSpec):SpatialModel{
  if(!section||!validSection(section))throw Error('Choose a valid section.');
  const targets=new Set(ids);
  if(!targets.size||[...targets].some(id=>!model.members.some(member=>member.id===id)))throw Error('Choose an existing member.');
  const members=model.members.map(member=>{
    if(!targets.has(member.id))return member;
    const updated=spatialSectionFromCatalog(section,sectionForSpatialMember(member).roll);
    if(!validSpatialSection(updated))throw Error('Check the section stiffness values.');
    return {...member,section:updated};
  });
  return {...model,members};
}

/** Stored presets and assigned snapshots can have the same id and name but
 * different stiffness after later edits. Keep them independently selectable. */
export function sectionVariant(s:SectionSpec):string{
  const g=s.geometry,p=s.massProperties,m=s.material;
  return JSON.stringify([s.name,s.E,s.A,s.I,s.Iminor,s.G,s.J,
    g&&[g.shape,g.h,g.b,g.tw,g.tf,g.t,g.r,g.ri],
    m&&[m.name,m.E,m.fy,m.hardening,m.fu,m.ultimateStrain],
    p&&Object.keys(p).length?Object.entries(p).sort(([a],[b])=>a.localeCompare(b)):null]);
}

export function usedSections(targets:SectionTarget[]){
  const used=new Map<string,{section:SectionSpec;members:string[]}>();
  for(const {section,label} of targets){
    const key=sectionVariant(section),existing=used.get(key);
    if(existing)existing.members.push(label);
    else used.set(key,{section,members:[label]});
  }
  return Array.from(used.values());
}
