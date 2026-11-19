import type {SpatialMember, SpatialModel, Vec3} from './spatial-model.ts';
import type {SectionSpec} from './sections.ts';
import {validSection} from './sections.ts';
import {validMassProperties} from './model.ts';

/** kN, m, radians internally; roll is entered in degrees about local x (A to B). */
export type SpatialSection = {
  name:string; E:number; G:number; A:number; Iy:number; Iz:number; J:number; roll:number;
  profile?:SectionSpec;
};
export type SpatialLoad = {
  id:string; kind:'force'|'moment'|'distributed'; target:'node'|'member'; targetId:string;
  t:number; vector:Vec3;
};

const defaultSection:SpatialSection = {
  name:'HEA 120', E:210e6, G:210e6/2.6, A:25.3e-4, Iy:606e-8, Iz:231e-8, J:6.04e-8, roll:0,
};

export function sectionForSpatialMember(member:SpatialMember):SpatialSection {
  return {...(member.section ?? defaultSection)};
}

// Saint-Venant torsion constants (cm^4) in the ArcelorMittal Orange Book:
// https://orangebook.arcelormittal.com/node/234 and https://orangebook.arcelormittal.com/index.php/node/6
const rolledJ:Record<string,number> = {
  'HEA-100':5.28,'HEA-120':6.04,'HEA-140':8.10,'HEA-160':12.1,'HEA-180':14.9,'HEA-200':21.0,'HEA-240':42.1,'HEA-300':87.8,
  'HEB-100':9.33,'HEB-120':13.9,'HEB-160':31.3,'HEB-200':59.7,
  'IPE-120':1.69,'IPE-160':3.54,'IPE-200':6.92,'IPE-240':13.0,'IPE-300':19.9,
};

export function spatialSectionFromCatalog(section:SectionSpec,roll=0):SpatialSection {
  const g=section.geometry;
  let J=section.J??rolledJ[section.id]*1e-8;
  if(!J && g?.shape==='chs') J=2*section.I;
  if(!J && g?.shape==='rhs'){
    // Bredt's single-cell thin-wall formula, integrated along the mean perimeter.
    const b=g.b-g.t,h=g.h-g.t,r=Math.max(0,g.r-g.t/2);
    const area=b*h-(4-Math.PI)*r*r;
    const perimeter=2*(b+h)-(8-2*Math.PI)*r;
    J=4*area*area*g.t/perimeter*1e-12;
  }
  if(!J && g?.shape==='rectangle'){
    const a=Math.max(g.b,g.h),b=Math.min(g.b,g.h),ratio=b/a;
    J=a*b**3*(1/3-.21*ratio*(1-ratio**4/12))*1e-12;
  }
  if(!J && g?.shape==='i'){
    // Rolled, doubly symmetric I section with root fillets (SCI P385).
    const {b,h,tw,tf,r}=g,web=tw/tf,root=r/tf;
    const alpha=-.042+.2204*web+.1355*root-.0865*web*root-.0725*web*web;
    const diameter=((tf+r)**2+(tw/2+r)**2-r*r)/(2*r+tf);
    if(alpha>=0)J=((2*b*tf**3+(h-2*tf)*tw**3)/3+2*alpha*diameter**4-.42*tf**4)*1e-12;
  }
  if(!(J>0)||!Number.isFinite(J)||!section.Iminor) throw Error('Enter Iy, Iz and the torsion constant J in the custom section properties.');
  const E=section.material?.E ?? section.E;
  return {name:section.name,E,G:section.G??E/2.6,A:section.A,Iy:section.I,Iz:section.Iminor,J,roll,profile:structuredClone(section)};
}

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<1e12;
export function validSpatialSection(section:SpatialSection):boolean{
  return !!section&&typeof section.name==='string'&&section.name.length>0&&section.name.length<=100
    &&[section.E,section.G,section.A,section.Iy,section.Iz,section.J].every(v=>finite(v)&&v>0)&&finite(section.roll)
    &&validSection(section.profile)&&validMassProperties(section.profile?.massProperties);
}
export function validSpatialAnalysisInput(model:SpatialModel):boolean{
  if(!model.nodes.every(n=>n.spring===undefined||finite(n.spring)&&n.spring>0))return false;
  if(!model.members.every(b=>(b.section===undefined||validSpatialSection(b.section))
    &&(b.family===undefined||typeof b.family==='string'&&b.family.length>0&&b.family.length<=100)))return false;
  if(model.loads===undefined)return true;
  if(!Array.isArray(model.loads)||model.loads.length>2000)return false;
  const nodes=new Set(model.nodes.map(n=>n.id)),members=new Set(model.members.map(b=>b.id)),ids=new Set<string>();
  return model.loads.every(load=>{
    if(!load||typeof load.id!=='string'||!load.id||load.id.length>100||ids.has(load.id))return false;
    ids.add(load.id);
    return ['force','moment','distributed'].includes(load.kind)
      &&(load.target==='node'?nodes.has(load.targetId)&&load.kind!=='distributed':load.target==='member'&&members.has(load.targetId))
      &&finite(load.t)&&load.t>=0&&load.t<=1&&!!load.vector&&[load.vector.x,load.vector.y,load.vector.z].every(finite);
  });
}

/** Preserve load locations and uniform load intensity when a geometric member is split. */
export function splitSpatialLoads(loads:SpatialLoad[]|undefined,oldId:string,newId:string,fraction:number){
  const used=new Set(loads?.map(load=>load.id));
  let number=1;
  return loads?.flatMap(load=>{
    if(load.target!=='member'||load.targetId!==oldId)return [load];
    if(load.kind==='distributed'){
      while(used.has('L'+number))number++;
      return [load,{...load,id:'L'+number++,targetId:newId}];
    }
    if(load.t<=fraction)return [{...load,t:load.t/fraction}];
    return [{...load,targetId:newId,t:(load.t-fraction)/(1-fraction)}];
  });
}
