import type {Model} from './model';
import type {Result} from './solver';
import {materialForBeam} from './materials.ts';
import {sectionForBeam,geometryError} from './sections.ts';
export type StressPoint={beam:string;t:number;stress:number;strain:number;plasticStrain:number;ratio:number;state:'elastic'|'yield-demand'|'plastic'|'failed'|'unknown';failureRatio?:number};
export function elasticStressField(model:Model,result:Result):StressPoint[]{return result.samples.map(s=>{const b=model.beams.find(b=>b.id===s.beam)!,m=materialForBeam(b),g=sectionForBeam(b).geometry,known=b.kind==='strut'||!!g&&!geometryError(g),stress=known?(Math.abs(s.N)/b.A+(b.kind==='strut'?0:Math.abs(s.M)*(g!.h/2000)/b.I))/1000:0,ratio=stress/m.fy;return {beam:b.id,t:s.t,stress,strain:stress*1000/b.E,plasticStrain:0,ratio,state:!known?'unknown':ratio>1?'yield-demand':'elastic'};});}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
function mix(a:string,b:string,t:number){const A=parseInt(a.slice(1),16),B=parseInt(b.slice(1),16);return '#'+[16,8,0].map(shift=>Math.round(((A>>shift)&255)*(1-clamp(t))+((B>>shift)&255)*clamp(t)).toString(16).padStart(2,'0')).join('');}
export function stressColor(p:StressPoint){if(p.state==='unknown')return '#8b9690';if(p.state==='failed')return '#ce3f4d';if(p.state==='plastic'||p.state==='yield-demand')return mix('#efb75c','#ce741c',Math.max(.15,p.ratio-1,p.plasticStrain/Math.max(1e-12,p.strain)*2));return mix('#b0d9c1','#247a4d',p.ratio);}
export function deflectionColor(ratio:number){return ratio<.5?mix('#69bfd0','#2f75c0',ratio*2):mix('#2f75c0','#7943b7',(ratio-.5)*2);}
const rank={unknown:0,elastic:1,'yield-demand':2,plastic:3,failed:4};
export function governingPoint(points:StressPoint[]){return points.reduce<StressPoint|undefined>((best,p)=>!best||rank[p.state]>rank[best.state]||rank[p.state]===rank[best.state]&&(p.ratio>best.ratio||p.ratio===best.ratio&&p.stress>best.stress)?p:best,undefined);}
export function governingLoadColor(points:StressPoint[],unresolved=false){if(unresolved)return '#8b9690';const p=governingPoint(points);return p?stressColor(p.state==='elastic'?{...p,ratio:Math.max(.35,p.ratio)}:p):'#8b9690';}
