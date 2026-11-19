import {useUnits} from './unit-context';
import {quantity,settingNumber,inputNumber,parseNumber} from './units';
import {useId,useState} from 'react';
import {geometryError} from './sections';
import type {SectionSpec} from './sections';
import {resizedSection} from './profile-edit';
import type {ProfileDimension} from './profile-edit';
const dimensionNames={h:'height / diameter',b:'width',tw:'web thickness',tf:'flange thickness',t:'wall thickness',r:'root / outside radius',ri:'inside radius'};
type Edit={key:ProfileDimension;text:string;base:SectionSpec;factor:number;unit:string;error:string};
export function SectionDrawing({section:s,dimensions=true,onResize,onCancel,onEditChange}:{section:SectionSpec;dimensions?:boolean;onResize?:(next:SectionSpec,commit:boolean)=>boolean;onCancel?:(base:SectionSpec)=>void;onEditChange?:(active:boolean)=>void}){
 const id=useId().replace(/:/g,''),units=useUnits(),q=quantity(units,'length'),fd=(v:number)=>settingNumber(v*.001/q.factor,units,false),[edit,setEdit]=useState<Edit|null>(null),g=s.geometry;
 if(!g)return <div className="section-no-geometry">A / I section<br/><small>No shape dimensions stored</small></div>;
 if(geometryError(g))return <div className="section-no-geometry">Check section dimensions</div>;
 const editable=!!onResize&&dimensions;
 function begin(key:ProfileDimension){if(edit&&!finish())return;onEditChange?.(true);setEdit({key,text:inputNumber(Number(g![key]??Math.max(0,g!.r-g!.t))*.001/q.factor),base:structuredClone(s),factor:q.factor*1000,unit:q.unit,error:''});}
 function preview(text:string){if(!edit)return;const nextEdit={...edit,text,error:''};try{const value=parseNumber(text);if(!Number.isFinite(value))throw Error('Enter a valid size.');onResize?.(resizedSection(edit.base,edit.key,value*edit.factor),false);}catch(e){nextEdit.error=(e as Error).message;}setEdit(nextEdit);}
 function finish(){
   if(!edit)return true;
   try{
     const value=parseNumber(edit.text);
     if(!Number.isFinite(value))throw Error('Enter a valid size.');
     const g0=edit.base.geometry!,initial=g0[edit.key]??Math.max(0,g0.r-g0.t);
     if(Math.abs(value*edit.factor-initial)<=1e-9*Math.max(1,initial))cancel();
     else{
       if(onResize?.(resizedSection(edit.base,edit.key,value*edit.factor),true)===false)throw Error('Size could not be applied.');
       setEdit(null);onEditChange?.(false);
     }
     return true;
   }catch(e){setEdit({...edit,error:(e as Error).message});return false;}
 }
 function cancel(){if(edit)onCancel?.(edit.base);setEdit(null);onEditChange?.(false);}
 function label(key:ProfileDimension,cx:number,cy:number,title:string,value:number,maxWidth=104){
   const text=title+' '+fd(value),width=Math.min(Math.max(38,18+text.length*7.2),maxWidth);
   const squeeze=text.length*7>width-10;
   return <g transform={'translate('+cx+' '+cy+')'} className={'profile-dim-chip'+(editable?' is-editable':'')}
     role={editable?'button':undefined} tabIndex={editable?0:undefined} aria-label={editable?'Edit '+dimensionNames[key]:undefined}
     onClick={editable?e=>{e.stopPropagation();if(edit?.key!==key)begin(key);}:undefined}
     onKeyDown={editable?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();begin(key);}}:undefined}>
     <title>{dimensionNames[key]+' · '+fd(value)+' '+q.unit}</title>
     <rect x={-width/2} y={-11} width={width} height={22} rx={4}/>
     <text x={0} y={4.3} textAnchor="middle" textLength={squeeze?width-10:undefined} lengthAdjust={squeeze?'spacingAndGlyphs':undefined}>{text}</text>
   </g>;
 }
 const centerX=168,centerY=115,k=(dimensions?126:160)/Math.max(g.h,g.b);
 const h=g.h*k,b=g.b*k,tw=g.tw*k,tf=g.tf*k,t=g.t*k,r=g.r*k,x=centerX-b/2,y=centerY-h/2;
 const edge=x+b,bottom=y+h;
 const drawing=<svg className={'section-drawing '+(dimensions?'dimensioned':'thumbnail')} viewBox={dimensions?'0 0 336 220':'65 15 206 200'}
   role={editable?'group':'img'} aria-label={s.name+' cross section'+(dimensions?' with dimensions in '+q.unit:'')}>
   <defs><pattern id={'hatch'+id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#9bb7aa" strokeWidth="1"/></pattern></defs>
   <g fill={'url(#hatch'+id+')'} stroke="#2d5c4d" strokeWidth="1.7">
     {g.shape==='i'?<path d={`M${x} ${y}h${b}v${tf}H${centerX+tw/2+r}a${r} ${r} 0 0 0 ${-r} ${r}V${bottom-tf-r}a${r} ${r} 0 0 0 ${r} ${r}H${edge}v${tf}H${x}v${-tf}H${centerX-tw/2-r}a${r} ${r} 0 0 0 ${r} ${-r}V${y+tf+r}a${r} ${r} 0 0 0 ${-r} ${-r}H${x}Z`}/>:
       g.shape==='chs'?<><circle cx={centerX} cy={centerY} r={h/2}/><circle cx={centerX} cy={centerY} r={h/2-t} fill="#f8fbf9"/></>:
       <><rect x={x} y={y} width={b} height={h} rx={r}/>{g.shape==='rhs'&&<rect x={x+t} y={y+t} width={b-2*t} height={h-2*t} rx={(g.ri??Math.max(0,g.r-g.t))*k} fill="#f8fbf9"/>}</>}
   </g>
   {dimensions&&<>
     <path d={`M${x-10} ${centerY}H${edge+10} M${centerX} ${y-10}V${bottom+10}`} stroke="#b8cac0" strokeDasharray="4 3" fill="none"/>
     <g className="profile-dimension profile-dimension-lines">
       <path d={`M${x} ${bottom+4}V204 M${edge} ${bottom+4}V204 M${x} 197H${edge}`}/>
       {label(g.shape==='chs'?'h':'b',centerX,197,g.shape==='chs'?'Ø':'b',g.b,136)}
       {g.shape!=='chs'&&<><path d={`M${x-4} ${y}H73 M${x-4} ${bottom}H73 M78 ${y}V${bottom}`}/>{label('h',57,centerY,'h',g.h,100)}</>}
       {g.shape==='i'&&<>
         <path d={`M${edge} ${y+tf/2}L248 45H268 M${centerX+tw/2+.28*r} ${y+tf+.28*r}L240 90H268 M${centerX+tw/2} ${centerY+8}L240 145H268`}/>
         {label('tf',284,45,'tf',g.tf,94)}{label('r',284,90,'r',g.r,94)}{label('tw',284,145,'tw',g.tw,94)}
       </>}
       {(g.shape==='rhs'||g.shape==='chs')&&<>
         <path d={`M${edge-t/2} ${centerY}L250 119H270`}/>{label('t',284,119,'t',g.t,94)}
         {g.shape==='rhs'&&<>
           <path d={`M${edge-.293*r} ${y+.293*r}L245 46H267 M${edge-t-.293*(g.ri??Math.max(0,g.r-g.t))*k} ${bottom-t-.293*(g.ri??Math.max(0,g.r-g.t))*k}L247 167H267`}/>
           {label('r',284,46,'r',g.r,94)}{label('ri',284,167,'ri',g.ri??Math.max(0,g.r-g.t),94)}
         </>}
       </>}
     </g>
     <text x="12" y="18" fill="#647c6d" fontSize="11">{'Dimensions ('+q.unit+')'}</text>
   </>}
 </svg>;
 return editable?<div className="profile-editor">{drawing}{edit&&<form className="profile-size-editor" aria-label="Edit profile dimension" onSubmit={e=>{e.preventDefault();finish();}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cancel();}}}><label>{dimensionNames[edit.key]} <span>{edit.unit}</span><input autoFocus aria-label="Profile dimension value" inputMode="decimal" value={edit.text} aria-invalid={!!edit.error} onChange={e=>preview(e.target.value)} onFocus={e=>e.target.select()}/></label><div><button type="submit" className="primary">Apply size</button><button type="button" onClick={cancel}>Cancel size</button></div>{edit.error?<small role="alert">{edit.error}</small>:<small>Live preview · Enter applies · Esc cancels</small>}</form>}</div>:drawing;
}
export function SectionDetails({section:s}:{section:SectionSpec}){
 const units=useUnits(),stressQ=quantity(units,'stress'),f=(v:number)=>settingNumber(v,units,false);
 return <div className="section-specs">
   <span>Area A<b>{f(s.A*1e4)} cm²</b></span>
   <span>In-plane I (local y)<b>{f(s.I*1e8)} cm⁴</b></span>
   {s.Iminor!==undefined&&<span>Other-axis I (local z)<b>{f(s.Iminor*1e8)} cm⁴</b></span>}
   {s.J!==undefined&&<span>Torsion constant J<b>{f(s.J*1e8)} cm⁴</b></span>}
   <span>Elastic modulus E<b>{f(s.E/1000/stressQ.factor)} {stressQ.unit}</b></span>
   {s.G!==undefined&&<span>Shear modulus G<b>{f(s.G/1000/stressQ.factor)} {stressQ.unit}</b></span>}
   {s.geometry&&<span>{s.massProperties?.density?'Mass per metre':'Mass per metre at 7.850 kg/m³'}<b>{f(s.A*(s.massProperties?.density??7850))} kg/m</b></span>}
   {s.massProperties&&Object.entries(s.massProperties).map(([key,value])=><span key={key}>{key}<b>{typeof value==='number'?f(value):String(value)}{key.startsWith('i')?' kg·m²':''}</b></span>)}
   <p>{s.method??'User-entered section properties'}</p>
   {s.source&&s.source.startsWith('https://')&&<a href={s.source} target="_blank" rel="noreferrer">Section data reference ↗</a>}
 </div>;
}
export function MemberSectionView({section:s,onResize,onCancel}:{section:SectionSpec;onResize?:(next:SectionSpec,commit:boolean)=>boolean;onCancel?:(base:SectionSpec)=>void}){const id=useId();return <div className="member-section-view"><span className="section-name-trigger"><button className="section-name" aria-describedby={id} type="button">{s.name}</button><div id={id} role="tooltip" className="section-hover"><strong>{s.name}</strong><SectionDetails section={s}/><small>Section properties</small></div></span><SectionDrawing section={s} onResize={onResize} onCancel={onCancel}/>{onResize&&s.geometry&&<small>Click a boxed dimension to resize</small>}</div>;}
