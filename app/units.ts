import type {Model} from './model';
export const lengthUnits={mm:.001,cm:.01,m:1,in:.0254,ft:.3048} as const;
export const forceUnits={N:.001,kN:1,MN:1000,lbf:.0044482216152605,kip:4.4482216152605} as const;
export const stressUnits={Pa:1e-6,kPa:.001,MPa:1,GPa:1000,psi:.006894757293168361,ksi:6.894757293168361} as const;
export const momentUnits={'N·mm':1e-6,'N·m':.001,'kN·m':1,'lbf·in':.0001129848290276167,'lbf·ft':.0013558179483314004,'kip·in':.1129848290276167,'kip·ft':1.3558179483314004} as const;
export type UnitSettings={length:keyof typeof lengthUnits;force:keyof typeof forceUnits;stress:keyof typeof stressUnits;moment:keyof typeof momentUnits;deflection:keyof typeof lengthUnits;distributedLength:keyof typeof lengthUnits};
export type Quantity='length'|'force'|'stress'|'moment'|'deflection'|'distributed'|'stiffness';
export const defaultUnits:UnitSettings={length:'mm',force:'kN',stress:'MPa',moment:'kN·m',deflection:'mm',distributedLength:'m'};
export function getUnits(m:Pick<Model,'units'|'dimensionUnits'>):UnitSettings{return {...defaultUnits,length:m.dimensionUnits??'mm',...m.units};}
export function validUnits(u:any){return u===undefined||u&&typeof u==='object'&&!Array.isArray(u)&&Object.entries(u).every(([k,v])=>{const options=k==='length'||k==='deflection'||k==='distributedLength'?lengthUnits:k==='force'?forceUnits:k==='stress'?stressUnits:k==='moment'?momentUnits:null;return !!options&&typeof v==='string'&&Object.hasOwn(options,v);});}
export function quantity(u:UnitSettings,k:Quantity){if(k==='length'||k==='deflection')return {unit:u[k],factor:lengthUnits[u[k]]};if(k==='force')return {unit:u.force,factor:forceUnits[u.force]};if(k==='stress')return {unit:u.stress,factor:stressUnits[u.stress]};if(k==='moment')return {unit:u.moment,factor:momentUnits[u.moment]};return {unit:`${u.force}/${u.distributedLength}`,factor:forceUnits[u.force]/lengthUnits[u.distributedLength]};}
export function formatNumber(v:number,digits=3){return Number.isFinite(v)?(Math.abs(v)<.5*10**-digits?0:v).toLocaleString('nl-NL',{maximumFractionDigits:digits}):'—';}
export function inputNumber(v:number){return Number.isFinite(v)?formatNumber(v,10):'';}
export function parseNumber(text:string){let s=text.trim().replace(/[\s\u00a0]/g,'');if(!s)return NaN;if(s.includes(',')){if((s.match(/,/g)??[]).length!==1)return NaN;s=s.replace(/\./g,'').replace(',','.');}else if(/^[+-]?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)?Number(s):NaN;}
export function display(m:Pick<Model,'units'|'dimensionUnits'>,v:number,k:Quantity,digits=3){const q=quantity(getUnits(m),k);return `${formatNumber(v/q.factor,digits)} ${q.unit}`;}
