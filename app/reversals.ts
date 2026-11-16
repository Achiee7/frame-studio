import type {Model} from './model';
import type {Result} from './solver';
export type ReversalCase={id:string;label?:string;loadSigns?:Record<string,number>;multipliers:{fx:number;fy:number;m:number};applied:{fx:number;fy:number;m:number};residual:{fx:number;fy:number;m:number};result:Result};
export function loadReversals(model:Model,solver:(m:Model,f?:Record<string,number>)=>Result,factors:Record<string,number>,reversible:string[]=model.loads.filter(l=>l.canReverse).map(l=>l.id)){
 const active=model.loads.filter(l=>(factors[l.case]??0)!==0&&(l.type==='moment'?Math.abs(l.m)>1e-10:Math.hypot(l.fx,l.fy)>1e-10));
 const choices=active.filter(l=>reversible.includes(l.id));
 if(choices.length>8)throw Error('Choose at most eight independently reversible loads for one report (256 cases).');
 const cases:ReversalCase[]=[];
 for(let mask=0;mask<2**choices.length;mask++){
  const loadSigns=Object.fromEntries(model.loads.map(l=>[l.id,choices.some(c=>c.id===l.id)&&(mask&(1<<choices.findIndex(c=>c.id===l.id)))?-1:1]));
  const m=structuredClone(model);m.loads.forEach(l=>{l.fx*=loadSigns[l.id];l.fy*=loadSigns[l.id];l.m*=loadSigns[l.id];});
  const result=solver(m,factors),reversed=active.filter(l=>loadSigns[l.id]<0).map(l=>`L${model.loads.indexOf(l)+1}`);
  cases.push({id:`R${mask+1}`,label:reversed.length?`${reversed.join(', ')} reversed`:'All loads as drawn',loadSigns,multipliers:{fx:1,fy:1,m:1},...equilibrium(m,result,factors),result});
 }
 return reversalEnvelopes(model,cases,factors);
}
export function equilibrium(model:Model,result:Result,factors:Record<string,number>={G:1,Q:1,W:1}){
 let fx=0,fy=0,m=0;
 for(const l of model.loads){const b=model.beams.find(b=>b.id===l.beam)!,a=model.nodes.find(n=>n.id===b.a)!,z=model.nodes.find(n=>n.id===b.b)!,f=factors[l.case]??0,t=l.type==='distributed'?.5:l.t,L=l.type==='distributed'?Math.hypot(z.x-a.x,z.y-a.y):1,x=a.x+t*(z.x-a.x),y=a.y+t*(z.y-a.y);if(l.type==='moment')m+=l.m*f;else{const X=l.fx*f*L,Y=l.fy*f*L;fx+=X;fy+=Y;m+=x*Y-y*X;}}
 const applied={fx,fy,m};for(const r of result.reactions){const n=model.nodes.find(n=>n.id===r.node)!;fx+=r.fx;fy+=r.fy;m+=r.m+n.x*r.fy-n.y*r.fx;}return {applied,residual:{fx,fy,m}};
}
export function reversals(model:Model,solver:(m:Model,f?:Record<string,number>)=>Result,factors:Record<string,number>={G:1,Q:1,W:1}){
 const cases:{id:string;multipliers:{fx:number;fy:number;m:number};applied:{fx:number;fy:number;m:number};residual:{fx:number;fy:number;m:number};result:Result}[]=[];for(const x of [1,-1])for(const y of [1,-1])for(const z of [1,-1]){const m=structuredClone(model);m.loads.forEach(l=>{l.fx*=x;l.fy*=y;l.m*=z;});const result=solver(m,factors);cases.push({id:`R${cases.length+1}`,multipliers:{fx:x,fy:y,m:z},...equilibrium(m,result,factors),result});}
 return reversalEnvelopes(model,cases,factors);
}
export function reversalEnvelopes(model:Model,cases:ReversalCase[],factors:Record<string,number>){
 if(!cases.length)throw Error('Include at least one physically possible reversal.');
 const extreme=(rows:{value:number;case:string;station?:number}[])=>({min:rows.reduce((a,b)=>a.value<=b.value?a:b),max:rows.reduce((a,b)=>a.value>=b.value?a:b),absolute:rows.reduce((a,b)=>Math.abs(a.value)>=Math.abs(b.value)?a:b)});
 const supports=model.nodes.filter(n=>n.support!=='free').map(n=>({node:n.id,...Object.fromEntries(['fx','fy','m','resultant'].map(k=>[k,extreme(cases.map(c=>{const r=c.result.reactions.find(r=>r.node===n.id)!;return {case:c.id,value:k==='resultant'?Math.hypot(r.fx,r.fy):(r as any)[k]};}))]))}));
 const members=model.beams.map(b=>({beam:b.id,...Object.fromEntries(['N','V','M','resultant'].map(k=>[k,extreme(cases.flatMap(c=>c.result.samples.filter(s=>s.beam===b.id).map(s=>({case:c.id,station:s.t,value:k==='resultant'?Math.hypot(s.N,s.V):(s as any)[k]}))))]))}));
 return {convention:'Each loadSigns entry reverses that complete force vector or moment: +1 as drawn, -1 reversed. Legacy multipliers apply globally by component when loadSigns is absent. Resultants use components from the same case and station. Member extrema include recovered stations; deflection is sampled.',factors,cases,supports,members};
}
