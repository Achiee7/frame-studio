import type {Model} from './model';
import type {Result} from './solver';
import {materialForBeam} from './materials.ts';
import {sectionForBeam,geometryError} from './sections.ts';
export type StressPoint={beam:string;t:number;stress:number;strain:number;plasticStrain:number;ratio:number;state:'elastic'|'yield-demand'|'plastic'|'failed'|'unknown';failureRatio?:number};
export function elasticStressField(model:Model,result:Result):StressPoint[]{return result.samples.map(s=>{const b=model.beams.find(b=>b.id===s.beam)!,m=materialForBeam(b),g=sectionForBeam(b).geometry,known=b.kind==='strut'||!!g&&!geometryError(g),stress=known?(Math.abs(s.N)/b.A+(b.kind==='strut'?0:Math.abs(s.M)*(g!.h/2000)/b.I))/1000:0,ratio=stress/m.fy;return {beam:b.id,t:s.t,stress,strain:stress*1000/b.E,plasticStrain:0,ratio,state:!known?'unknown':ratio>1?'yield-demand':'elastic'};});}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const elasticLow='light-dark(#518463, #a5d9b9)', elasticHigh='var(--ok)';
const plasticLow='light-dark(#ab651a, #f2b65a)', plasticHigh='var(--force)';
const deflectionLow='light-dark(#267f92, #75cbd9)', deflectionMid='var(--info)', deflectionHigh='var(--gas)';
function mix(a:string,b:string,t:number){return `color-mix(in srgb, ${b} ${clamp(t)*100}%, ${a})`;}
export function stressColor(p:StressPoint){if(p.state==='unknown')return 'var(--muted)';if(p.state==='failed')return 'var(--danger)';if(p.state==='plastic'||p.state==='yield-demand')return mix(plasticLow,plasticHigh,Math.max(.15,p.ratio-1,p.plasticStrain/Math.max(1e-12,p.strain)*2));return mix(elasticLow,elasticHigh,p.ratio);}
export function deflectionColor(ratio:number){return ratio<.5?mix(deflectionLow,deflectionMid,ratio*2):mix(deflectionMid,deflectionHigh,(ratio-.5)*2);}
export const stressRamp=`linear-gradient(90deg,${elasticLow},${elasticHigh} 53%,${plasticLow} 55%,${plasticHigh} 82%,var(--danger) 84%)`;
export const deflectionRamp=`linear-gradient(90deg,${deflectionLow},${deflectionMid},${deflectionHigh})`;
const rank={unknown:0,elastic:1,'yield-demand':2,plastic:3,failed:4};
export function governingPoint(points:StressPoint[]){return points.reduce<StressPoint|undefined>((best,p)=>!best||rank[p.state]>rank[best.state]||rank[p.state]===rank[best.state]&&(p.ratio>best.ratio||p.ratio===best.ratio&&p.stress>best.stress)?p:best,undefined);}
export function governingLoadColor(points:StressPoint[],unresolved=false){if(unresolved)return 'var(--muted)';const p=governingPoint(points);return p?stressColor(p.state==='elastic'?{...p,ratio:Math.max(.35,p.ratio)}:p):'var(--muted)';}
