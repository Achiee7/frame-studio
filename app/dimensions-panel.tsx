import {useEffect,useState} from 'react';
import {Check,Plus,Ruler,Trash2,Pencil,MousePointer2} from 'lucide-react';
import {dimensionValue,dimensionSense,enforceConstraints,seedDimension,uid} from './model';
import type {CadDimension,Model} from './model';
export type DimensionSelection={id?:string;member?:string;points?:[string,string]};
export const dimensionNames:Record<CadDimension['kind'],string>={length:'Member length',aligned:'Point-to-point distance',horizontal:'Horizontal distance',vertical:'Vertical distance',direction:'Member direction',angle:'Angle between members',perpendicular:'Perpendicular distance'};
export function dimensionText(m:Model,d:CadDimension){const angle=['angle','direction'].includes(d.kind),v=dimensionValue(m,d)*(angle?1:m.dimensionUnits==='mm'?1000:1);return `${v.toLocaleString('en-GB',{maximumFractionDigits:angle?2:m.dimensionUnits==='mm'?2:4})}${angle?'°':m.dimensionUnits==='mm'?' mm':' m'}`;}
export default function DimensionsPanel({model:m,selection,onChange,onPick}:{model:Model;selection:DimensionSelection;onChange:(next:Model)=>boolean;onPick:()=>void}){
 const initial=m.dimensions?.find(d=>d.id===selection.id),member=m.beams.find(b=>b.id===selection.member)??m.beams[0];
 const [editing,setEditing]=useState(initial?.id),[kind,setKind]=useState<CadDimension['kind']>(initial?.kind??(selection.points?'aligned':'length')),[firstMember,setFirstMember]=useState(member?.id??''),[secondMember,setSecondMember]=useState(m.beams.find(b=>b.id!==member?.id)?.id??''),[pointA,setPointA]=useState(initial?.a??selection.points?.[0]??m.nodes[0]?.id??''),[pointB,setPointB]=useState(initial?.b??selection.points?.[1]??m.nodes[1]?.id??''),[driving,setDriving]=useState(initial?.driving??true),[value,setValue]=useState(''),[units,setUnits]=useState<'m'|'mm'>(m.dimensionUnits??'m'),[sense,setSense]=useState<1|-1>(initial?.sense??1),[offset,setOffset]=useState(initial?.offset??42),[error,setError]=useState(''),[message,setMessage]=useState('');
 const nodeLabel=(id:string)=>`N${m.nodes.findIndex(n=>n.id===id)+1}`,memberLabel=(id:string)=>`B${m.beams.findIndex(b=>b.id===id)+1}`;
 const angular=kind==='angle'||kind==='direction';
 // Existing dimensions retain their original endpoints through later splits.
 const [editRefs,setEditRefs]=useState<CadDimension|undefined>(initial);
 function refs():CadDimension{
  if(editRefs)return {...editRefs,kind};
  const ref=m.beams.find(b=>b.id===firstMember),other=m.beams.find(b=>b.id===secondMember);
  let a=pointA,b=pointB,c:string|undefined,d:string|undefined;
  if(kind==='length'||kind==='direction'||kind==='angle'){a=ref?.a??'';b=ref?.b??'';}
  if(kind==='angle'){c=other?.a;d=other?.b;const shared=[a,b].find(id=>id===c||id===d);if(shared){b=a===shared?b:a;a=shared;d=c===shared?d:c;c=shared;}}
  return {id:editing??'',kind,a,b,c,d,value:0,driving};
 }
 const draft=refs();let actual=0,canMeasure=false;try{canMeasure=!!draft.a&&!!draft.b&&draft.a!==draft.b&&(kind!=='angle'||!!draft.c&&!!draft.d&&firstMember!==secondMember||!!editRefs);if(canMeasure)actual=dimensionValue(m,draft);}catch{canMeasure=false;}
 useEffect(()=>{if(canMeasure){setValue(String(+(actual*(angular?1:units==='mm'?1000:1)).toFixed(6)));setSense(editRefs?.sense??dimensionSense(m,draft));}},[kind,firstMember,secondMember,pointA,pointB,units,editing]);
 function clearFeedback(){setError('');setMessage('');}
 function changeInputs(fn:()=>void){setEditRefs(undefined);clearFeedback();fn();}
 function apply(){clearFeedback();try{
  const v=Number(value)/(angular?1:units==='mm'?1000:1);if(!canMeasure||!Number.isFinite(v)||!value.trim())throw Error('Select valid points or members and enter a finite value.');
  if(kind==='direction'&&(v<0||v>=360))throw Error('Direction must be from 0° up to, but not including, 360°.');
  if(kind==='angle'&&(v<0||v>180))throw Error('The angle between rays must be between 0° and 180°.');
  if(!angular&&(v<0||driving&&['length','aligned'].includes(kind)&&v<.00001))throw Error('Lengths and distances must be positive; horizontal and vertical distances may be zero.');
  const next=structuredClone(m),d:CadDimension={...draft,id:editing??uid(),value:v,driving,sense,offset};
  next.dimensionUnits=units;next.dimensions=editing?(next.dimensions??[]).map(x=>x.id===editing?d:x):[...(next.dimensions??[]),d];
  if(next.dimensions.length>120)throw Error('A project supports up to 120 dimensions.');
  if(driving){next.dimensionAnchor??=d.a;seedDimension(next,d);}enforceConstraints(next);
  if(onChange(next)){setEditing(d.id);setEditRefs(d);setMessage(`${dimensionNames[kind]} ${editing?'updated':'added'}. ${driving?'Geometry updated; all driving values are satisfied.':'Reference measurement added; geometry is unchanged.'}`);}
  else setError('The dimension could not be applied. Check the values and existing constraints.');
 }catch(e){setError((e as Error).message);}}
 function load(d:CadDimension){clearFeedback();setEditing(d.id);setEditRefs(d);setKind(d.kind);setPointA(d.a);setPointB(d.b);setDriving(d.driving);setSense(d.sense??1);setOffset(d.offset??42);setValue(String(+(dimensionValue(m,d)*(d.kind==='angle'||d.kind==='direction'?1:units==='mm'?1000:1)).toFixed(6)));}
 function newDimension(){clearFeedback();setEditing(undefined);setEditRefs(undefined);setValue(String(+(actual*(angular?1:units==='mm'?1000:1)).toFixed(6)));}
 return <div className="dimension-panel">
 <div className="dimension-intro"><Ruler size={24}/><p>Enter exact dimensions to shape your frame. Click a dimension label on the drawing to edit it, or pick two points with the dimension tool.</p></div>
 <div className="dimension-top-actions"><button onClick={onPick}><MousePointer2 size={14}/>Pick points on canvas</button><button onClick={newDimension}><Plus size={14}/>New dimension</button><label>Length units<select aria-label="Dimension length units" value={units} onChange={e=>{const u=e.target.value as 'm'|'mm';setUnits(u);const next=structuredClone(m);next.dimensionUnits=u;onChange(next);}}><option value="m">Metres (m)</option><option value="mm">Millimetres (mm)</option></select></label></div>
 <section className="dimension-builder"><div className="dimension-builder-head"><h3>{editing?'EDIT DIMENSION':'NEW DIMENSION'}</h3><span>{driving?'Driving':'Reference only'}</span></div>
 <label>Dimension type<select aria-label="Dimension type" value={kind} onChange={e=>changeInputs(()=>setKind(e.target.value as CadDimension['kind']))}>{Object.entries(dimensionNames).filter(([key])=>key!=='perpendicular'||kind==='perpendicular').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 {editRefs?<div className="dimension-endpoints">{nodeLabel(draft.a)} → {nodeLabel(draft.b)}{kind==='angle'?` / ${nodeLabel(draft.c!)} → ${nodeLabel(draft.d!)}`:''}<small>Endpoint references stay attached through member splits.</small></div>:['aligned','horizontal','vertical'].includes(kind)?<div className="dimension-fields"><label>First point<select aria-label="First dimension point" value={pointA} onChange={e=>changeInputs(()=>setPointA(e.target.value))}>{m.nodes.map(n=><option key={n.id} value={n.id}>{nodeLabel(n.id)} · ({n.x.toFixed(2)}, {n.y.toFixed(2)})</option>)}</select></label><label>Second point<select aria-label="Second dimension point" value={pointB} onChange={e=>changeInputs(()=>setPointB(e.target.value))}>{m.nodes.map(n=><option key={n.id} value={n.id}>{nodeLabel(n.id)} · ({n.x.toFixed(2)}, {n.y.toFixed(2)})</option>)}</select></label></div>:<div className="dimension-fields"><label>{kind==='angle'?'Reference member':'Member'}<select aria-label="Dimension member" value={firstMember} onChange={e=>changeInputs(()=>setFirstMember(e.target.value))}>{m.beams.map(b=><option key={b.id} value={b.id}>{memberLabel(b.id)} · {nodeLabel(b.a)} → {nodeLabel(b.b)}</option>)}</select></label>{kind==='angle'&&<label>Other member<select aria-label="Other angle member" value={secondMember} onChange={e=>changeInputs(()=>setSecondMember(e.target.value))}>{m.beams.map(b=><option key={b.id} value={b.id}>{memberLabel(b.id)} · {nodeLabel(b.a)} → {nodeLabel(b.b)}</option>)}</select></label>}</div>}
 <div className="dimension-mode"><label><input type="checkbox" checked={driving} onChange={e=>setDriving(e.target.checked)}/>Drive geometry with this dimension</label><small>{driving?'Editing the value changes node positions.':'Measure only. This value follows the model and never moves points.'}</small></div>
 <div className="dimension-value-row"><label>{angular?'Angle':'Distance'}<span><input aria-label="Dimension value" type="number" step="any" value={driving?value:String(+(actual*(angular?1:units==='mm'?1000:1)).toFixed(6))} disabled={!driving} onChange={e=>setValue(e.target.value)}/><em>{angular?'°':units}</em></span></label><div><small>Currently measured</small><b>{canMeasure?`${(actual*(angular?1:units==='mm'?1000:1)).toFixed(angular?2:3)} ${angular?'°':units}`:'Choose geometry'}</b></div></div>
 {kind==='direction'&&<p className="dimension-note">Counterclockwise from global +X, following the member’s start → end direction (0–360°).</p>}
 {kind==='angle'&&<><label>Rotation from reference ray<select aria-label="Angle rotation side" value={sense} onChange={e=>setSense(+e.target.value as 1|-1)}><option value="1">Counterclockwise</option><option value="-1">Clockwise</option></select></label><p className="dimension-note">At a shared point, the rays point outward from the joint. Otherwise the member start → end directions are used. The displayed angle is 0–180°.</p></>}
 <label>Dimension placement<select aria-label="Dimension placement" value={offset>=0?'1':'-1'} onChange={e=>setOffset(Math.abs(offset||42)*(+e.target.value))}><option value="1">{angular?'Near vertex':'Side 1'}</option><option value="-1">{angular?'Further from vertex':'Side 2'}</option></select></label>
 <button className="primary" onClick={apply} disabled={!canMeasure}><Check size={15}/>{editing?'Update dimension':'Add dimension'}</button>
 {error&&<p className="geometry-error" role="alert">{error}</p>}{message&&<p className="geometry-success" role="status"><Check size={16}/>{message}</p>}
 </section>
 <div className="dimension-anchor"><label>Sketch anchor point<select aria-label="Sketch anchor point" value={m.dimensionAnchor??m.dimensions?.find(d=>d.driving)?.a??m.nodes[0]?.id??''} onChange={e=>{const next=structuredClone(m);next.dimensionAnchor=e.target.value;onChange(next);}}>{m.nodes.map(n=><option key={n.id} value={n.id}>{nodeLabel(n.id)}</option>)}</select></label><p>The anchor stays in place while dimensions are solved. Other unconstrained points may adjust. Edit the anchor’s coordinates to reposition it. Supports and hinges retain their structural behaviour.</p></div>
 <h3>DIMENSIONS <span>{m.dimensions?.length??0}</span></h3>
 {(m.dimensions??[]).length?(m.dimensions??[]).map((d,i)=><div className={`dimension-record ${editing===d.id?'editing':''}`} key={d.id}><span>D{i+1}</span><div><b>{dimensionNames[d.kind]}</b><p>{dimensionText(m,d)} <small>{d.driving?'Driving':'Reference'} · {nodeLabel(d.a)} / {nodeLabel(d.b)}</small></p></div><button title={`Edit dimension D${i+1}`} onClick={()=>load(d)}><Pencil size={14}/></button><button title={`Delete dimension D${i+1}`} onClick={()=>{const next=structuredClone(m);next.dimensions=next.dimensions?.filter(x=>x.id!==d.id);if(onChange(next)){if(editing===d.id)newDimension();setMessage('Dimension removed. The current geometry is kept.');}}}><Trash2 size={14}/></button></div>):<p className="muted">No dimensions yet. Pick a member or two points to get started.</p>}
 </div>;
}
