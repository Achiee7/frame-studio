import {useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {ArrowDown,Pencil,Plus,Trash2} from 'lucide-react';
import {useUnits} from './unit-context';
import {inputNumber,lengthUnits,parseNumber,quantity,settingNumber} from './units';
import type {UnitSettings} from './units';
import NumberInput from './number-input';
import {sections} from './sections';
import {SectionDrawing} from './section-view';
import {browserStore} from './local-storage';
import type {SectionSpec} from './sections';
import {sectionForSpatialMember,spatialSectionFromCatalog,validSpatialAnalysisInput} from './spatial-analysis-input';
import type {SpatialLoad,SpatialSection} from './spatial-analysis-input';
import type {SpatialModel,SpatialMember,Vec3} from './spatial-model';
import type {SpatialSelection} from './spatial-canvas';
import './spatial-analysis-ui.css';

const axes=['x','y','z'] as const;
const loadNames={force:'Point force',moment:'Moment',distributed:'Distributed load'} as const;
const zero={x:0,y:0,z:0};
const restraintLabels={
  free:'Free translation and rotation',
  pinned:'Restrained in global X, Y and Z. Rotations are free.',
  fixed:'Restrained in global X, Y and Z. A rigid joint also restrains rotation about each axis.',
  roller:'Restrained in global Z.',
  rollerX:'Restrained in global X.',
  guided:'Restrained in global Z. A rigid joint also restrains rotation about each axis.',
  spring:'Elastic restraint in global Z.'
};
export const loadQuantity=(kind:SpatialLoad['kind'])=>kind==='distributed'?'distributed':kind==='moment'?'moment':'force';

function vectorSummary(vector:Vec3,unit:string,factor:number,units:UnitSettings) {
  return axes.filter(axis=>vector[axis]!==0).map(axis=>axis.toUpperCase()+' '+settingNumber(vector[axis]/factor,units,false)).join(' · ')+' '+unit;
}

function LoadForm({load,length,allowDistributed,onApply,onClose}:{
  load:SpatialLoad;length:number;allowDistributed:boolean;onApply:(load:SpatialLoad)=>void;onClose:()=>void;
}) {
  const units=useUnits(),lengthFactor=lengthUnits[units.length];
  const [kind,setKind]=useState(load.kind);
  const q=quantity(units,loadQuantity(kind));
  const nonzero=axes.filter(axis=>load.vector[axis]!==0);
  const [direction,setDirection]=useState<keyof Vec3|'components'>(nonzero.length===1?nonzero[0]:'components');
  const [vector,setVector]=useState(()=>Object.fromEntries(axes.map(axis=>[axis,inputNumber(load.vector[axis]/q.factor)])) as Record<keyof Vec3,string>);
  const [magnitude,setMagnitude]=useState(()=>inputNumber((nonzero.length===1?load.vector[nonzero[0]]:Math.hypot(load.vector.x,load.vector.y,load.vector.z))/q.factor));
  const [station,setStation]=useState(inputNumber(length*load.t/lengthFactor));
  const [error,setError]=useState('');
  const pointOnMember=load.target==='member'&&kind!=='distributed';
  function changeDirection(next:typeof direction){
    if(next==='components'&&direction!=='components'){
      setVector({x:'0',y:'0',z:'0',[direction]:magnitude});
    }else if(direction==='components'&&next!=='components'){
      const component=parseNumber(vector[next]);
      const length=Math.hypot(...axes.map(axis=>parseNumber(vector[axis])));
      setMagnitude(inputNumber(component||length));
    }
    setDirection(next);
  }
  function submit(e:FormEvent){
    e.preventDefault();
    const result={...zero};
    for(const axis of axes){
      if(direction==='components'||direction===axis){
        result[axis]=parseNumber(direction==='components'?vector[axis]:magnitude)*q.factor;
      }
    }
    if(!axes.every(axis=>Number.isFinite(result[axis]))||!axes.some(axis=>result[axis]!==0)){
      setError('Enter a finite, nonzero load.');return;
    }
    let t=load.t;
    if(pointOnMember){
      const original=inputNumber(length*load.t/lengthFactor);
      t=station===original?load.t:parseNumber(station)*lengthFactor/length;
      if(!Number.isFinite(t)||t < -1e-10||t>1+1e-10){setError('Place the load between the two end joints.');return;}
      t=Math.max(0,Math.min(1,t));
    }
    try { onApply({...load,kind,t,vector:result}); }
    catch(error){setError(error instanceof Error?error.message:'Could not apply this load.');}
  }
  return <form className="sr-load-form" onSubmit={submit}>
    <label className="sp-field">Load type<select value={kind} onChange={e=>setKind(e.target.value as SpatialLoad['kind'])}>
      <option value="force">Point force</option><option value="moment">Moment</option>
      {allowDistributed&&<option value="distributed">Uniform distributed load</option>}
    </select></label>
    <label className="sp-field">Direction<select value={direction} onChange={e=>changeDirection(e.target.value as typeof direction)}>
      {axes.map(axis=><option key={axis} value={axis}>Global {axis.toUpperCase()}</option>)}
      <option value="components">XYZ components</option>
    </select></label>
    {direction==='components'?<fieldset className="sr-vector-fields"><legend>Components ({q.unit})</legend>
      {axes.map(axis=><label key={axis}>{axis.toUpperCase()}<input aria-label={axis.toUpperCase()+' load component'} inputMode="decimal" value={vector[axis]} onChange={e=>setVector({...vector,[axis]:e.target.value})}/></label>)}
    </fieldset>:<label className="sp-field">Signed magnitude ({q.unit})<input aria-label="Signed load magnitude" inputMode="decimal" value={magnitude} onChange={e=>setMagnitude(e.target.value)}/></label>}
    {pointOnMember&&<label className="sp-field">Distance from end A ({units.length})<input aria-label="Load distance from end A" inputMode="decimal" value={station} onChange={e=>setStation(e.target.value)}/></label>}
    {error&&<p role="alert" className="sr-error">{error}</p>}
    <div className="sr-form-actions"><button type="submit" className="primary">Apply load</button><button type="button" onClick={onClose}>Cancel</button></div>
  </form>;
}

type InspectorProps={model:SpatialModel;selection:SpatialSelection;onChange:(next:SpatialModel)=>void};

function MemberStiffness({member,onChange}:{member:SpatialMember;onChange:(section:SpatialSection)=>void}){
  const units=useUnits(),stress=quantity(units,'stress');
  const section=sectionForSpatialMember(member),[error,setError]=useState('');
  const catalog=useMemo(()=>{
    let named:SectionSpec[]=[];
    try {named=browserStore.listPresets().flatMap(p=>p.section?.geometry&&p.section.Iminor?[p.section]:[]);}catch{/* Built-in sections are always available. */}
    return [...sections,...named];
  },[]);
  const current=catalog.find(s=>s.name===section.name);
  const baseUnit=units.length==='in'||units.length==='ft'?'in':'cm',base=lengthUnits[baseUnit];
  const field=(label:string,key:'A'|'Iy'|'Iz'|'J'|'E'|'G'|'roll',unit:string,factor:number)=>
    <label key={key} className="sp-field">{label} ({unit})<NumberInput label={label+' in '+unit} value={section[key]/factor} min={key==='roll'?undefined:Number.MIN_VALUE}
      onCommit={value=>onChange({...section,[key]:value*factor,name:key==='roll'?section.name:'Custom section'})}/></label>;
  return <details className="sr-section-properties"><summary>Section stiffness <span>{section.name}</span></summary>
    <label className="sp-field">Section preset<select aria-label="3D section preset" value={current?.id??''} onChange={e=>{
      const next=catalog.find(item=>item.id===e.target.value);
      if(next)try{onChange(spatialSectionFromCatalog(next,section.roll));setError('');}catch(e){setError((e as Error).message);}
    }}>
      {!current&&<option value="">Custom section</option>}
      {[...new Set(catalog.map(s=>s.category))].map(category=><optgroup label={category} key={category}>{catalog.filter(s=>s.category===category).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
    </select></label>
    {current?.geometry&&<div className="sr-profile"><SectionDrawing section={current}/></div>}
    <div className="sr-field-grid">
      {field('Area A','A',baseUnit+'²',base**2)}
      {field('Elastic modulus E','E',stress.unit,1000*stress.factor)}
      {member.kind==='beam'&&<>
        {field('Area inertia Iᵧ','Iy',baseUnit+'⁴',base**4)}
        {field('Area inertia I𝓏','Iz',baseUnit+'⁴',base**4)}
        {field('Torsion constant J','J',baseUnit+'⁴',base**4)}
        {field('Shear modulus G','G',stress.unit,1000*stress.factor)}
        {field('Section roll','roll','°',1)}
      </>}
    </div>
    <small>{member.kind==='beam'?'Roll rotates the section about A → B. At zero roll, local z follows the projection of global Z, or global X for a vertical member. Preset G assumes Poisson’s ratio 0,3.':'Axial stiffness uses E and A.'}{member.kind==='beam'&&['RHS','SHS'].includes(current?.category??'')?' This hollow section uses a thin-wall estimate of J.':''}</small>
    {error&&<p role="alert" className="sr-error">{error}</p>}
  </details>;
}

function SelectedAnalysisInspector({model,selection,onChange}:InspectorProps&{selection:NonNullable<SpatialSelection>}){
  const units=useUnits(),[draft,setDraft]=useState<SpatialLoad|null>(null),[error,setError]=useState('');
  const member=selection.type==='member'?model.members.find(m=>m.id===selection.id):undefined;
  const node=selection.type==='node'?model.nodes.find(n=>n.id===selection.id):undefined;
  if(!member&&!node)return null;
  const loads=(model.loads??[]).filter(load=>load.target===selection.type&&load.targetId===selection.id);
  const a=member&&model.nodes.find(n=>n.id===member.a),b=member&&model.nodes.find(n=>n.id===member.b);
  const length=a&&b?Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z):0;
  function apply(next:SpatialModel){
    if(!validSpatialAnalysisInput(next)){setError('Check the load and stiffness values. Loads and properties must lie within the model range.');return false;}
    onChange(next);setError('');return true;
  }
  function startLoad(){
    const ids=new Set(model.loads?.map(load=>load.id));let seq=1;
    while(ids.has('L'+seq))seq++;
    setDraft({id:'L'+seq,target:selection.type,targetId:selection.id,kind:'force',t:member?0.5:0,vector:{x:0,y:0,z:-1}});
  }
  function commit(load:SpatialLoad){
    const all=model.loads??[],exists=all.some(item=>item.id===load.id);
    if(apply({...model,loads:exists?all.map(item=>item.id===load.id?load:item):[...all,load]}))setDraft(null);
  }
  const stiffness=quantity(units,'stiffness');
  return <div className="sr-model-inspector">
    <div className="sr-load-heading"><h3>Applied loads</h3><button type="button" onClick={startLoad} aria-label={'Add load to '+selection.id}><Plus size={13}/>Add load</button></div>
    {loads.map(load=>{
      const q=quantity(units,loadQuantity(load.kind));
      return <div key={load.id} className="sr-load-item">
        <button className="sr-load-edit" type="button" title={'Edit '+load.id} onClick={()=>setDraft(load)}><ArrowDown size={14}/>
          <span><strong>{load.id} · {loadNames[load.kind]}</strong><small>{vectorSummary(load.vector,q.unit,q.factor,units)}</small>
          {member&&load.kind!=='distributed'&&<small>{settingNumber(load.t*length/lengthUnits[units.length],units,false)} {units.length} from {member.a}</small>}</span><Pencil size={12}/>
        </button><button aria-label={'Remove load '+load.id} className="sr-icon" onClick={()=>{onChange({...model,loads:model.loads?.filter(item=>item.id!==load.id)});if(draft?.id===load.id)setDraft(null);}}><Trash2 size={13}/></button>
      </div>;
    })}
    {draft&&<LoadForm key={[draft.id,units.force,units.length,units.distributedLength,units.moment].join('/')} load={draft} length={length} allowDistributed={!!member} onApply={commit} onClose={()=>setDraft(null)}/>}
    {node&&node.support!=='free'&&<p className="sr-restraint">{restraintLabels[node.support]}</p>}
    {node?.support==='spring'&&<label className="sp-field">Z spring stiffness ({stiffness.unit})<NumberInput label="Z spring stiffness" min={Number.MIN_VALUE} value={(node.spring??10000)/stiffness.factor}
      onCommit={value=>apply({...model,nodes:model.nodes.map(item=>item.id===node.id?{...item,spring:value*stiffness.factor}:item)})}/></label>}
    {member&&<MemberStiffness member={member} onChange={section=>apply({...model,members:model.members.map(item=>item.id===member.id?{...item,section}:item)})}/>}
    {error&&<p className="sr-error" role="alert">{error}</p>}
  </div>;
}

export function SpatialAnalysisInspector({model,selection,onChange}:InspectorProps) {
  return selection?<SelectedAnalysisInspector key={selection.type+selection.id} model={model} selection={selection} onChange={onChange}/>:null;
}
