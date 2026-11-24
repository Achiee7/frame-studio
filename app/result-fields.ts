import type {Model} from './model';
import type {Result} from './solver';
import {materialForBeam} from './materials.ts';
import {sectionForBeam,geometryError} from './sections.ts';
export type StressPoint={beam:string;t:number;stress:number;strain:number;plasticStrain:number;ratio:number;state:'elastic'|'yield-demand'|'plastic'|'failed'|'unknown';failureRatio?:number};
export function elasticStressField(model:Model,result:Result):StressPoint[]{return result.samples.map(s=>{const b=model.beams.find(b=>b.id===s.beam)!,m=materialForBeam(b),g=sectionForBeam(b).geometry,known=b.kind==='strut'||!!g&&!geometryError(g),stress=known?(Math.abs(s.N)/b.A+(b.kind==='strut'?0:Math.abs(s.M)*(g!.h/2000)/b.I))/1000:0,ratio=stress/m.fy;return {beam:b.id,t:s.t,stress,strain:stress*1000/b.E,plasticStrain:0,ratio,state:!known?'unknown':ratio>1?'yield-demand':'elastic'};});}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const low='var(--ok)', middle='light-dark(#aa8100, #ffe066)', high='var(--danger)';
const deflectionLow='light-dark(#267f92, #75cbd9)', deflectionMid='var(--info)', deflectionHigh='var(--gas)';
function mix(a:string,b:string,t:number){return `color-mix(in srgb, ${b} ${clamp(t)*100}%, ${a})`;}
export function utilisationColor(ratio:number|undefined){
 if(ratio===undefined||!Number.isFinite(ratio))return 'var(--muted)';
 if(ratio>=1)return high;
 return ratio<=0.5?mix(low,middle,2*ratio):mix(middle,high,2*ratio-1);
}
export function stressColor(p:StressPoint){return utilisationColor(p.state==='unknown'?undefined:p.state==='failed'?1:p.ratio);}
export function deflectionColor(ratio:number){return ratio<.5?mix(deflectionLow,deflectionMid,ratio*2):mix(deflectionMid,deflectionHigh,(ratio-.5)*2);}
export const stressRamp=`linear-gradient(90deg,${low},${middle} 50%,${high})`;
export const deflectionRamp=`linear-gradient(90deg,${deflectionLow},${deflectionMid},${deflectionHigh})`;
