import {useMemo,useState} from 'react';
import type {ComponentType} from 'react';
import {Activity,AlertTriangle,ArrowDownUp,ArrowLeft,ArrowLeftRight,ChartSpline,Check,CircleDot,Eye,GitBranch,Hand,MousePointer2,Orbit,PanelLeftClose,PanelLeftOpen,RotateCw,TrendingUp} from 'lucide-react';
import {SpatialCanvas} from './spatial-canvas';
import type {SpatialSelection} from './spatial-canvas';
import {useSpatialAnalysis} from './spatial-analysis-hook';
import type {SpatialResult,SpatialSample} from './spatial-analysis';
import type {SpatialModel,Vec3} from './spatial-model';
import {SpatialAnalysisInspector} from './spatial-results-inspector';
import {SpatialLoadOverlay,SpatialReactionOverlay,SpatialStationAxes,addScaled,magnitude} from './spatial-loads-view';
import type {Project3D} from './spatial-loads-view';
import {useUnits} from './unit-context';
import {quantity,settingNumber} from './units';
import type {UnitSettings,Quantity} from './units';
import './spatial.css';
import './spatial-analysis-ui.css';

export {SpatialAnalysisInspector,SpatialLoadOverlay};

type Mode='reactions'|'displacement'|'axial'|'shear'|'bending'|'torsion';
type Component='N'|'Vy'|'Vz'|'T'|'My'|'Mz';
type Field=Component|'u';
const modes:{id:Mode;name:string;icon:ComponentType<{size?:number}>}[]=[
  {id:'reactions',name:'Reactions',icon:ArrowDownUp},{id:'displacement',name:'Deflection',icon:ChartSpline},
  {id:'axial',name:'Axial force',icon:ArrowLeftRight},{id:'shear',name:'Shear force',icon:TrendingUp},
  {id:'bending',name:'Bending',icon:Activity},{id:'torsion',name:'Torsion',icon:RotateCw}
];
const symbols:Record<Field,string>={N:'N',Vy:'Vᵧ',Vz:'Vz',T:'T',My:'Mᵧ',Mz:'Mz',u:'|u|'};
const axes=['x','y','z'] as const;
function kind(field:Field):Quantity{return field==='u'?'deflection':field==='T'||field==='My'||field==='Mz'?'moment':'force';}
function fmt(value:number,type:Quantity,units:UnitSettings){
  const q=quantity(units,type);
  return settingNumber(value/q.factor,units,false)+' '+q.unit;
}
function reading(sample:SpatialSample,field:Field){return field==='u'?magnitude(sample.displacement):sample[field];}

type Peak={member:string;sample:SpatialSample;value:number};
function extrema(result:SpatialResult,field:Field){
  let min:Peak|undefined,max:Peak|undefined;
  for(const member of result.members)for(const sample of member.samples){
    const value=reading(sample,field),item={member:member.id,sample,value};
    if(!min||value<min.value)min=item;
    if(!max||value>max.value)max=item;
  }
  const peak=min&&max&&Math.abs(min.value)>Math.abs(max.value)?min:max;
  return {min,max,peak};
}
function modelExtent(model:SpatialModel) {
  let max=0;
  for(const axis of axes){
    const coords=model.nodes.map(node=>node[axis]);
    max=Math.max(max,Math.max(...coords)-Math.min(...coords));
  }
  return max;
}
function legendColor(negative:boolean){return negative?'#3f6ea7':'#368464';}

function MemberDiagrams({project,result,field,peak,scale,labels,selected}:{
  project:Project3D;result:SpatialResult;field:Component;peak:Peak|undefined;scale:number;labels:boolean;selected:SpatialSelection;
}){
  const units=useUnits(),den=Math.abs(peak?.value??0);
  if(!den)return null;
  return <g className="sr-diagrams" aria-label={symbols[field]+' station diagrams'} pointerEvents="none">{result.members.map(member=>{
    const samples=member.samples;
    if(!samples.length)return null;
    const a=project(samples[0].position),b=project(samples[samples.length-1].position);
    const dx=b.x-a.x,dy=b.y-a.y,span=Math.hypot(dx,dy);
    const nx=span>1e-6?-dy/span:0,ny=span>1e-6?dx/span:-1;
    const peakMember=member.id===peak?.member,highlighted=selected?.type==='member'&&selected.id===member.id;
    const marked=highlighted||peakMember;
    const coords=samples.map(s=>{
      const base=project(s.position),v=s[field],offset=scale*v/den;
      return {base,x:base.x+nx*offset,y:base.y+ny*offset,v};
    });
    const localPeak=coords.reduce((a,b)=>Math.abs(a.v)>=Math.abs(b.v)?a:b);
    const areas=['',''],outlines=['',''];
    function addStrip(p:typeof coords[number],q:typeof coords[number]){
      const side=(p.v||q.v)<0?0:1;
      areas[side]+=`M${p.base.x} ${p.base.y}L${p.x} ${p.y}L${q.x} ${q.y}L${q.base.x} ${q.base.y}Z`;
      outlines[side]+=`M${p.x} ${p.y}L${q.x} ${q.y}`;
    }
    for(let i=1;i<coords.length;i++){
      const p=coords[i-1],q=coords[i];
      if(p.v===0&&q.v===0)continue;
      if(p.v*q.v<0){
        const t=p.v/(p.v-q.v),x=p.base.x+t*(q.base.x-p.base.x),y=p.base.y+t*(q.base.y-p.base.y);
        const crossing={base:{x,y},x,y,v:0};
        addStrip(p,crossing);addStrip(crossing,q);
      }else addStrip(p,q);
    }
    return <g key={member.id}>
      {areas.map((area,i)=>area&&<g key={i}><path d={area} opacity={marked ? .27 : .15} fill={legendColor(i===0)}/>
        <path d={outlines[i]} fill="none" stroke={legendColor(i===0)} strokeWidth={marked?2:1.35}/></g>)}
      {labels&&marked&&<text className="sr-svg-value" x={localPeak.x+(nx<-.25?-6:6)} y={localPeak.y-5} textAnchor={nx<-.25?'end':'start'}>{symbols[field]} {fmt(localPeak.v,kind(field),units)}</text>}
    </g>;
  })}</g>;
}

function DeflectedFrame({project,result,factor,labels,peak}:{
  project:Project3D;result:SpatialResult;factor:number;labels:boolean;peak?:Peak;
}){
  const units=useUnits();
  return <g className="sr-deflection" aria-label="Displaced 3D frame" pointerEvents="none">
    {result.members.map(member=>{
      const pts=member.samples.map(s=>project(addScaled(s.position,s.displacement,factor)));
      return <g key={member.id}>{pts.slice(1).map((p,i)=>{
        const ratio=result.maxDisplacement>0?Math.min(1,(magnitude(member.samples[i].displacement)+magnitude(member.samples[i+1].displacement))/(2*result.maxDisplacement)):0;
        return <line key={i} x1={pts[i].x} y1={pts[i].y} x2={p.x} y2={p.y} stroke={`hsl(${190+74*ratio} 60% ${46+4*ratio}%)`} strokeWidth="3" strokeLinecap="round"/>;
      })}</g>;
    })}
    {labels&&peak&&(()=>{
      const p=project(addScaled(peak.sample.position,peak.sample.displacement,factor));
      return <g><circle cx={p.x} cy={p.y} r="3" fill="#7451ac"/><text className="sr-svg-value" style={{fill:'#69429d'}} x={p.x+7} y={p.y-6}>{fmt(peak.value,'deflection',units)}</text></g>;
    })()}
  </g>;
}

function VectorValues({value,prefix,type,units}:{value:Vec3;prefix:string;type:Quantity|'rad';units:UnitSettings}){
  return <dl className="sr-values">{axes.map(axis=><div key={axis}><dt>{prefix}{axis}</dt><dd>{type==='rad'?settingNumber(value[axis],units,false)+' rad':fmt(value[axis],type,units)}</dd></div>)}</dl>;
}
type MemberResult=SpatialResult['members'][number];
function StationInspector({member,station,setStation,units}:{member:MemberResult;station:number;setStation:(index:number)=>void;units:UnitSettings}){
  const samples=member.samples;
  const index=Math.min(station,samples.length-1),sample=samples[index];
  if(!sample)return null;
  const first=samples[0].position,last=samples[samples.length-1].position,L=Math.hypot(last.x-first.x,last.y-first.y,last.z-first.z);
  const side=samples[index-1]?.t===sample.t?' · after load':samples[index+1]?.t===sample.t?' · before load':'';
  return <section className="sr-detail">
    <h3><GitBranch size={14}/>Member {member.id}</h3>
    <label className="sr-station">Station from A <b>{fmt(sample.t*L,'length',units)}{side}</b>
      <input type="range" aria-label="Result station along member" min={0} max={samples.length-1} step={1} value={index} onChange={e=>setStation(+e.target.value)}/>
    </label>
    <dl className="sr-values">{(['N','Vy','Vz','T','My','Mz','u'] as const).map(key=><div key={key}><dt>{symbols[key]}</dt><dd>{fmt(reading(sample,key),kind(key),units)}</dd></div>)}</dl>
    <small>Member forces and moments use the local axes from A to B.</small>
  </section>;
}

type ResultsProps={model:SpatialModel;onBack:()=>void;onChange?:(model:SpatialModel)=>void};
export default function SpatialResults({model,onBack,onChange}:ResultsProps){
  const units=useUnits(),[mode,setMode]=useState<Mode>('reactions'),[direction,setDirection]=useState<'y'|'z'>('y');
  const [selection,setSelection]=useState<SpatialSelection>(null),[panel,setPanel]=useState(true);
  const [station,setStation]=useState(0),[localAxes,setLocalAxes]=useState(true);
  const [nav,setNav]=useState<'select'|'orbit'|'pan'>('select'),[scale,setScale]=useState(1);
  const [trueScale,setTrueScale]=useState(false),[displayOpen,setDisplayOpen]=useState(false);
  const [grid,setGrid]=useState(true),[names,setNames]=useState(true),[loads,setLoads]=useState(true),[values,setValues]=useState(true);
  const preparation=!model.members.length?'Draw at least one beam or strut in 3D-model to analyse a frame.'
    :!model.loads?.some(l=>magnitude(l.vector)>0)?'Select a joint or member in 3D-model and choose Add load.':'';
  const {result,error,pending}=useSpatialAnalysis(model,!preparation);
  const field:Field=mode==='displacement'?'u':mode==='shear'?(direction==='y'?'Vy':'Vz'):mode==='bending'?(direction==='y'?'My':'Mz'):mode==='torsion'?'T':'N';
  const statistics=useMemo(()=>result?extrema(result,field):undefined,[result,field]);
  const peak=statistics?.peak;
  const factor=trueScale?1:result?.maxDisplacement?scale*.11*modelExtent(model)/result.maxDisplacement:1;
  const selectedMember=result?.members.find(m=>selection?.type==='member'&&m.id===selection.id);
  const selectedSample=selectedMember?.samples[Math.min(station,selectedMember.samples.length-1)];
  const selectedNode=result?.nodes.find(n=>selection?.type==='node'&&n.id===selection.id);
  const reaction=selectedNode&&result?.reactions.find(n=>n.id===selectedNode.id);
  const reactionPeak=result?.reactions.reduce<SpatialResult['reactions'][number]|undefined>((best,r)=>!best||magnitude(r.force)>magnitude(best.force)?r:best,undefined);
  const momentPeak=result?.reactions.reduce<SpatialResult['reactions'][number]|undefined>((best,r)=>!best||magnitude(r.moment)>magnitude(best.moment)?r:best,undefined);
  function select(item:SpatialSelection){setSelection(item);setStation(0);if(item)setPanel(true);}
  function inspectPeak(peak:Peak){
    select({type:'member',id:peak.member});
    const member=result?.members.find(m=>m.id===peak.member);
    if(member)setStation(member.samples.indexOf(peak.sample));
  }
  return <section className="sp-workspace sr-workspace" aria-label="3D structural results">
    <div className="sp-toolbar" role="toolbar" aria-label="3D result view">
      <button className="sp-pane-switch" aria-label={panel?'Hide 3D result options':'Show 3D result options'} aria-expanded={panel} onClick={()=>setPanel(!panel)}>{panel?<PanelLeftClose size={16}/>:<PanelLeftOpen size={16}/>}</button>
      {([{key:'select',title:'Select',icon:MousePointer2},{key:'orbit',title:'Orbit',icon:Orbit},{key:'pan',title:'Pan',icon:Hand}] as const).map(item=><button key={item.key} aria-pressed={nav===item.key} onClick={()=>setNav(item.key)}><item.icon size={16}/>{item.title}</button>)}
      <div className="sp-visibility"><button aria-label="3D result display options" aria-expanded={displayOpen} onClick={()=>setDisplayOpen(!displayOpen)}><Eye size={16}/></button>
        {displayOpen&&<div className="sp-visibility-menu">{[{name:'Grid',value:grid,set:setGrid},{name:'Joint and member names',value:names,set:setNames},{name:'Applied loads',value:loads,set:setLoads},{name:'Result values',value:values,set:setValues},{name:'Selected member axes',value:localAxes,set:setLocalAxes}].map(o=><label key={o.name}><input type="checkbox" checked={o.value} onChange={e=>o.set(e.target.checked)}/>{o.name}</label>)}</div>}
      </div>
    </div>
    <div className="sp-body">
      {panel&&<aside className="sp-inspector sr-inspector" aria-label="3D result options">
        <section className="sp-section"><div className="sp-heading"><h2><Activity/>3D results</h2></div>
          <div className="sr-modes" role="group" aria-label="3D result diagrams">{modes.map(item=><button key={item.id} className={mode===item.id?'active':''} aria-pressed={mode===item.id} onClick={()=>setMode(item.id)}><item.icon size={15}/>{item.name}</button>)}</div>
          {(mode==='shear'||mode==='bending')&&<div className="sr-components" role="group" aria-label="Local component">
            {(['y','z'] as const).map(d=><button key={d} aria-pressed={d===direction} onClick={()=>setDirection(d)}>{mode==='shear'?'V':'M'}{d} · local {d}</button>)}</div>}
          {result&&<div className="sr-peak">
            <span>{mode==='reactions'?'Largest reaction force':mode==='displacement'?'Peak displacement':'Peak |'+symbols[field]+'|'}</span>
            <b>{mode==='reactions'?fmt(reactionPeak?magnitude(reactionPeak.force):0,'force',units):fmt(Math.abs(peak?.value??0),kind(field),units)}</b>
            {mode==='reactions'?reactionPeak&&<button onClick={()=>select({type:'node',id:reactionPeak.id})}>{reactionPeak.id}<ArrowLeftRight size={11}/></button>:
              peak&&<button onClick={()=>inspectPeak(peak)}>{peak.member} · {settingNumber(100*peak.sample.t,units,false)}% from A<ArrowLeftRight size={11}/></button>}
          </div>}
          {mode==='reactions'&&momentPeak&&magnitude(momentPeak.moment)>0&&<div className="sr-moment-peak">
            <span>Largest reaction moment</span><button onClick={()=>select({type:'node',id:momentPeak.id})}>{fmt(magnitude(momentPeak.moment),'moment',units)} · {momentPeak.id}</button>
          </div>}
          {result&&mode!=='reactions'&&<><label className="sr-scale">{mode==='displacement'?'Deflection magnification':'Diagram height'}
            <input aria-label="3D diagram scale" type="range" min=".25" max="2.5" step=".05" value={scale} disabled={mode==='displacement'&&trueScale} onChange={e=>setScale(+e.target.value)}/>
          </label>{mode==='displacement'?<label className="sp-check"><input type="checkbox" checked={trueScale} onChange={e=>setTrueScale(e.target.checked)}/>Show true displacement (1×)</label>:<small>Signed ordinates are drawn across each member in the current view.</small>}</>}
          {selectedMember&&<StationInspector member={selectedMember} station={station} setStation={setStation} units={units}/>}
          {selectedNode&&<section className="sr-detail">
            <h3><CircleDot size={14}/>Joint {selectedNode.id}</h3>
            {reaction&&<><h4>Support reactions</h4><VectorValues value={reaction.force} prefix="R" type="force" units={units}/><VectorValues value={reaction.moment} prefix="M" type="moment" units={units}/></>}
            <h4>Displacement</h4><VectorValues value={selectedNode.displacement} prefix="u" type="deflection" units={units}/>
            {selectedNode.rotation&&<details><summary>Rotation</summary><VectorValues value={selectedNode.rotation} prefix="θ" type="rad" units={units}/></details>}
          </section>}
          {onChange&&selection&&<details className="sr-adjust"><summary>Adjust model inputs</summary><SpatialAnalysisInspector model={model} selection={selection} onChange={onChange}/></details>}
          {result&&<details className="sr-equilibrium"><summary><Check size={14}/>Equilibrium residuals</summary>
            <VectorValues value={result.equilibrium.force} prefix="ΣF" type="force" units={units}/>
            <VectorValues value={result.equilibrium.moment} prefix="ΣM" type="moment" units={units}/><small>Global forces and moments about the sketch origin.</small>
          </details>}
          <details className="sr-equilibrium"><summary>Calculation scope</summary>
            <small>The 3D solver uses linear elastic, small-displacement beam and strut theory. Yielding, permanent set, buckling and connection capacity require separate checks.</small>
          </details>
        </section>
      </aside>}
      <div className="sp-viewport">
        <SpatialCanvas nodes={model.nodes} members={model.members} tool={nav} plane="XY" offset={0} snap={0} selection={selection} showGrid={grid} showNames={names} onPoint={()=>{}} onSelect={select}
          renderOverlay={project=><>{loads&&<SpatialLoadOverlay model={model} project={project} labels={values}/>}
            {result&&(mode==='reactions'?<SpatialReactionOverlay model={model} result={result} project={project} labels={values}/>:field==='u'?
              <DeflectedFrame project={project} result={result} factor={factor} labels={values} peak={peak}/>:
              <MemberDiagrams project={project} result={result} field={field} peak={peak} scale={scale*48} selected={selection} labels={values}/>)}
            {selectedMember&&selectedSample&&<SpatialStationAxes project={project} member={selectedMember} showAxes={localAxes}
              position={mode==='displacement'?addScaled(selectedSample.position,selectedSample.displacement,factor):selectedSample.position}/>}</>}/>
        {(preparation||error)&&<aside className={'sr-alert '+(preparation?'sr-empty':'')} role={preparation?'status':'alert'}>
          <AlertTriangle size={19}/><div><strong>{preparation?'Prepare the 3D model':'3D analysis needs attention'}</strong><p>{preparation||error}</p><button onClick={onBack}><ArrowLeft size={14}/>Back to 3D-model</button></div></aside>}
        {pending&&<div className="sr-legend" role="status">Calculating 3D results…</div>}
        {result&&<div className="sr-legend" aria-label="3D result legend">
          {mode==='reactions'?<><span><i style={{background:'#345fa1'}}/>Support reactions</span>{loads&&<span><i style={{background:'#ba5f22'}}/>Applied loads</span>}</>:
            mode==='displacement'?<><span><i className="sr-gradient"/>Displacement</span><small>Shape × {settingNumber(factor,units,false)}</small></>:
              <><span><i style={{background:legendColor(true)}}/>−</span><span><i style={{background:legendColor(false)}}/>+</span><b>{symbols[field]} · {quantity(units,kind(field)).unit}</b></>}
        </div>}
      </div>
    </div>
    {result&&result.warnings.length>0&&<div className="sr-warnings" role="status">{result.warnings.join(' ')}</div>}
    <footer className="sp-status"><span>{model.nodes.length} joints · {model.members.length} members · {model.loads?.length??0} loads</span><span>3D linear elastic · small displacements</span></footer>
  </section>;
}
