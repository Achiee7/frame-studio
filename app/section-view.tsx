import {useId} from 'react';
import {geometryError} from './sections';
import type {SectionSpec} from './sections';
const f=(v:number)=>v.toLocaleString('en-GB',{maximumFractionDigits:2});
export function SectionDrawing({section:s,dimensions=true}:{section:SectionSpec;dimensions?:boolean}){
 const id=useId().replace(/:/g,'');const g=s.geometry;
 if(!g)return <div className="section-no-geometry">A / I section<br/><small>No shape dimensions stored</small></div>;
 if(geometryError(g))return <div className="section-no-geometry">Check section dimensions</div>;
 const k=142/Math.max(g.h,g.b),h=g.h*k,b=g.b*k,tw=g.tw*k,tf=g.tf*k,t=g.t*k,r=g.r*k,x=140-b/2,y=117-h/2;
 const horizontal=(x1:number,x2:number,yy:number,label:string)=><g className="profile-dimension"><path d={`M${x1} ${yy-5}v10 M${x2} ${yy-5}v10 M${x1} ${yy}H${x2}`}/><text x={(x1+x2)/2} y={yy-6} textAnchor="middle">{label}</text></g>;
 return <svg className={'section-drawing '+(dimensions?'dimensioned':'thumbnail')} viewBox="0 0 280 244" role="img" aria-label={`${s.name} cross section${dimensions?' with dimensions in millimetres':''}`}>
 <defs><pattern id={'hatch'+id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#a7c1b5" strokeWidth="1"/></pattern></defs>
 <g fill={`url(#hatch${id})`} stroke="#2d5c4d" strokeWidth="1.7">
 {g.shape==='i'?<path d={`M${x} ${y}h${b}v${tf}H${140+tw/2+r}a${r} ${r} 0 0 0 ${-r} ${r}V${y+h-tf-r}a${r} ${r} 0 0 0 ${r} ${r}H${x+b}v${tf}H${x}v${-tf}H${140-tw/2-r}a${r} ${r} 0 0 0 ${r} ${-r}V${y+tf+r}a${r} ${r} 0 0 0 ${-r} ${-r}H${x}Z`}/>:g.shape==='chs'?<><circle cx="140" cy="117" r={h/2}/><circle cx="140" cy="117" r={h/2-t} fill="#f8fbf9"/></>:<><rect x={x} y={y} width={b} height={h} rx={r}/>{g.shape==='rhs'&&<rect x={x+t} y={y+t} width={b-2*t} height={h-2*t} rx={(g.ri??Math.max(0,g.r-g.t))*k} fill="#f8fbf9"/>}</>}
 </g>
 {dimensions&&<><path d={`M${x-15} 117H${x+b+15} M140 ${y-15}V${y+h+15}`} stroke="#aec6bb" strokeDasharray="4 3" fill="none"/>{horizontal(x,x+b,y+h+25,`${g.shape==='chs'?'Ø':'b = '}${f(g.b)}`)}<g className="profile-dimension"><path d={`M${x-22} ${y}H${x-12} M${x-22} ${y+h}H${x-12} M${x-17} ${y}V${y+h}`}/><text transform={`translate(${x-23} 117) rotate(-90)`} textAnchor="middle">h = {f(g.h)}</text></g>
 {g.shape==='i'?<g className="profile-dimension"><path d={`M${140+tw/2} 117l35 20h24 M${x+b} ${y+tf/2}l17 -17h13 M${140+tw/2+r*.3} ${y+tf+r*.3}l18 -24h35`}/><text x="210" y="150">tw {f(g.tw)}</text><text x={x+b+13} y={y-20}>tf {f(g.tf)}</text><text x={140+tw/2+24} y={y+tf-26}>r {f(g.r)}</text></g>:g.shape!=='rectangle'&&<g className="profile-dimension"><path d={`M${x+b-t/2} 117l18 -22h13`}/><text x={x+b+7} y="87">t {f(g.t)}</text>{g.shape==='rhs'&&<text x="140" y="235" textAnchor="middle">Outside r {f(g.r)} · inside r {f(g.ri??Math.max(0,g.r-g.t))}</text>}</g>}
 <text x="12" y="16" fill="#7b9286" fontSize="9">DIMENSIONS IN mm</text></>}
 </svg>;
}
export function SectionDetails({section:s}:{section:SectionSpec}){return <div className="section-specs"><span>Area A<b>{f(s.A*1e4)} cm²</b></span><span>In-plane I<b>{f(s.I*1e8)} cm⁴</b></span>{s.Iminor!==undefined&&<span>Other axis I<b>{f(s.Iminor*1e8)} cm⁴</b></span>}<span>Elastic modulus<b>{f(s.E/1e6)} GPa</b></span>{s.geometry&&<span>Mass / metre (steel)<b>{f(s.A*(s.massProperties?.density??7850))} kg/m</b></span>}{s.massProperties&&Object.entries(s.massProperties).map(([key,value])=><span key={key}>{key}<b>{String(value)}{key.startsWith('i')?' kg·m²':''}</b></span>)}<p>{s.method??'User-entered section properties'}</p>{s.source&&/^https:\/\//.test(s.source)&&<a href={s.source} target="_blank" rel="noreferrer">Section data reference ↗</a>}</div>;}
export function MemberSectionView({section:s}:{section:SectionSpec}){return <div className="member-section-view" tabIndex={0} aria-label={`${s.name} section preview and details`}><b>{s.name}</b><SectionDrawing section={s}/><small>Hover or focus for section details</small><div className="section-hover"><strong>{s.name}</strong><SectionDetails section={s}/><small>Read only · use Sections to create or choose a profile.</small></div></div>;}
