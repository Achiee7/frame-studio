import type {Model} from './model';
import type {Result} from './solver';
import {sectionForBeam,geometryError} from './sections.ts';
// Application applicability screens, not design-code limits or failure criteria.
export const modelRange={rotation:.1,strain:.02,relativeDisplacement:.05} as const;
export type RangeIssue={kind:'rotation'|'strain'|'relative-displacement'|'non-finite';value:number;limit:number;beam?:string};
export type Applicability={ok:boolean;issues:RangeIssue[];maxRotation:number;maxStrain:number;maxRelativeDisplacement:number;utilisation:number};
export function assessResult(model:Model,result:Result,fibreStrain?:number):Applicability{
 let maxRotation=0,maxStrain=fibreStrain??0,maxRelativeDisplacement=0,rotationBeam:string|undefined,strainBeam:string|undefined,displacementBeam:string|undefined;
 const numbers=[result.maxDisplacement,result.maxMoment,...result.samples.flatMap(s=>[s.t,s.x,s.y,s.ux,s.uy,s.N,s.V,s.M]),...result.nodeDisplacements.flatMap(n=>[n.ux,n.uy,...n.rotations.map(r=>r.value)]),...result.reactions.flatMap(r=>[r.fx,r.fy,r.m])];
 if(numbers.some(v=>!Number.isFinite(v)))return {ok:false,issues:[{kind:'non-finite',value:0,limit:0}],maxRotation:0,maxStrain:0,maxRelativeDisplacement:0,utilisation:Infinity};
 for(const n of result.nodeDisplacements)for(const r of n.rotations)maxRotation=Math.max(maxRotation,Math.abs(r.value));
 for(const b of model.beams){const a=model.nodes.find(n=>n.id===b.a)!,z=model.nodes.find(n=>n.id===b.b)!,L=Math.hypot(z.x-a.x,z.y-a.y),c=(z.x-a.x)/L,s=(z.y-a.y)/L,points=result.samples.filter(p=>p.beam===b.id).sort((a,b)=>a.t-b.t),start=points[0],g=sectionForBeam(b).geometry;
  if(!start||!Number.isFinite(L)||L<=0)continue;
  for(let j=0;j<points.length;j++){const p=points[j],relative=Math.hypot(p.ux-start.ux,p.uy-start.uy)/L;if(relative>maxRelativeDisplacement){maxRelativeDisplacement=relative;displacementBeam=b.id;}
   if(fibreStrain===undefined&&(b.kind==='strut'||g&&!geometryError(g))){const strain=(Math.abs(p.N)/b.A+(b.kind==='strut'?0:Math.abs(p.M)*g!.h/2000/b.I))/b.E;if(strain>maxStrain){maxStrain=strain;strainBeam=b.id;}}
   if(j){const prev=points[j-1],length=(p.t-prev.t)*L;if(length>1e-10){const ux=p.ux-prev.ux,uy=p.uy-prev.uy,rotation=Math.abs((-s*ux+c*uy)/length),strain=Math.abs((c*ux+s*uy)/length);if(rotation>maxRotation){maxRotation=rotation;rotationBeam=b.id;}if(strain>maxStrain){maxStrain=strain;strainBeam=b.id;}}}
  }
 }
 const issues:RangeIssue[]=[];if(maxRotation>modelRange.rotation*(1+1e-8))issues.push({kind:'rotation',value:maxRotation,limit:modelRange.rotation,beam:rotationBeam});if(maxStrain>modelRange.strain*(1+1e-8))issues.push({kind:'strain',value:maxStrain,limit:modelRange.strain,beam:strainBeam});if(maxRelativeDisplacement>modelRange.relativeDisplacement*(1+1e-8))issues.push({kind:'relative-displacement',value:maxRelativeDisplacement,limit:modelRange.relativeDisplacement,beam:displacementBeam});
 return {ok:!issues.length,issues,maxRotation,maxStrain,maxRelativeDisplacement,utilisation:Math.max(maxRotation/modelRange.rotation,maxStrain/modelRange.strain,maxRelativeDisplacement/modelRange.relativeDisplacement)};
}
export function rangeMessage(a:Applicability){return a.issues.some(i=>i.kind==='non-finite')?'The solver produced non-finite values. No reliable result is available.':'The small-displacement model range was exceeded. A geometrically nonlinear analysis is required; this result cannot establish deformation or failure.';}
