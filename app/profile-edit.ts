import {geometryError,sectionProperties,applySection} from './sections.ts';
import type {SectionSpec,SectionGeometry} from './sections.ts';
import type {Model} from './model';
import {materialForBeam} from './materials.ts';
export type ProfileDimension=Exclude<keyof SectionGeometry,'shape'>;
export function resizedSection(base:SectionSpec,key:ProfileDimension,value:number):SectionSpec{
 if(!base.geometry)throw Error('This section has no editable geometry.');
 const geometry={...base.geometry,[key]:value};if(geometry.shape==='chs')geometry.b=geometry.h;
 const error=geometryError(geometry);if(error)throw Error(error);
 return {...structuredClone(base),id:base.category==='Custom'?base.id:'custom-'+crypto.randomUUID().slice(0,8),name:base.category==='Custom'?base.name:'Custom '+base.name,category:'Custom',geometry,...sectionProperties(geometry),source:undefined,method:'Calculated from editable nominal geometry'};
}
export function resizeMemberSection(model:Model,ids:string[],section:SectionSpec,wholeBeam=false){
 const next=applySection(model,ids,{...section,material:undefined},wholeBeam),families=new Set(model.beams.filter(b=>ids.includes(b.id)).map(b=>b.family));
 for(const b of next.beams)if(wholeBeam?families.has(b.family):ids.includes(b.id)){const old=model.beams.find(x=>x.id===b.id)!;b.material=structuredClone(materialForBeam(old));b.section!.material=structuredClone(b.material);b.section!.E=b.E;}
 return next;
}
