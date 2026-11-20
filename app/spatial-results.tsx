import {useMemo,useRef,useState} from 'react';
import type {ComponentType} from 'react';
import {Activity,AlertTriangle,ArrowDownUp,ArrowLeft,ArrowLeftRight,ChartSpline,Check,CircleDot,Eye,GitBranch,Hand,Link2,ListTree,MousePointer2,Orbit,RotateCw,Settings2,TrendingUp} from 'lucide-react';
import {SpatialCanvas} from './spatial-canvas';
import type {SpatialSelection} from './spatial-canvas';
import {useSpatialAnalysis} from './spatial-analysis-hook';
import type {SpatialResult,SpatialSample} from './spatial-analysis';
import type {SpatialInstability} from './spatial-instability';
import {InstabilityEvidence,InstabilityOverlay,InstabilityPicks} from './spatial-instability-view';
import type {SpatialModel,Vec3} from './spatial-model';
import {SpatialAnalysisInspector} from './spatial-results-inspector';
import type {SpatialLoadRequest} from './spatial-results-inspector';
import type {SpatialLoad} from './spatial-analysis-input';
import SpatialComponentTree from './spatial-component-tree';
import {CadRibbon,RibbonGroup,RibbonTool} from './cad-ribbon';
import {useSpatialLayers} from './spatial-model-ribbon';
import {useSpatialSections} from './spatial-section-editor';
import {useSpatialSketch} from './use-spatial-sketch';
import {SpatialRuleLayer} from './spatial-rule-view';
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
  {id:'reactions',name:'Reactions',icon:ArrowDownUp},
  {id:'axial',name:'Axial force',icon:ArrowLeftRight},{id:'shear',name:'Shear force',icon:TrendingUp},
  {id:'bending',name:'Bending moment',icon:Activity},{id:'displacement',name:'Deflection',icon:ChartSpline},{id:'torsion',name:'Torsion',icon:RotateCw}
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

type ResultsProps={model:SpatialModel;onBack:()=>void;onReviewConnections:(diagnostic?:SpatialInstability)=>void;
  onInspectInstability:(pick:NonNullable<SpatialSelection>)=>void;onChange?:(model:SpatialModel)=>void};
export default function SpatialResults({model,onBack,onReviewConnections,onInspectInstability,onChange}:ResultsProps){
  const units=useUnits(),[mode,setMode]=useState<Mode>('reactions'),[direction,setDirection]=useState<'y'|'z'>('y');
  const [selection,setSelection]=useState<SpatialSelection>(null),[panel,setPanel]=useState(true);
  const [station,setStation]=useState(0),[localAxes,setLocalAxes]=useState(true);
  const [nav,setNav]=useState<'select'|'orbit'|'pan'>('select'),[scale,setScale]=useState(1);
  const [trueScale,setTrueScale]=useState(false),layers=useSpatialLayers();
  const [request,setRequest]=useState<SpatialLoadRequest|null>(null);
  const scope=useRef<HTMLDetailsElement>(null);
  const sections=useSpatialSections(model,selection,onChange);
  const sketch=useSpatialSketch(model,onChange??(()=>{}));
  const [dimensions,setDimensions]=useState(true),[constraints,setConstraints]=useState(false);
  const [grid,setGrid]=useState(true),[names,setNames]=useState(true),[loads,setLoads]=useState(true),[values,setValues]=useState(true);
  const preparation=!model.members.length?'Draw at least one beam or strut in 3D-model to analyse a frame.'
    :!model.loads?.some(l=>magnitude(l.vector)>0)?'Select a joint or member in 3D-model and choose Add load.':'';
  const {result,error,instability,pending}=useSpatialAnalysis(model,!preparation);
  const [showMotion,setShowMotion]=useState(true);
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
  function select(item:SpatialSelection){
    if(sections.bulk){if(item?.type==='member')sections.pick(item.id);return;}
    setSelection(item);setRequest(null);setStation(0);if(item)setPanel(true);
  }
  function editLoad(load:SpatialLoad){
    if(sections.bulk)return;
    select({type:load.target,id:load.targetId});setRequest({target:load.target,targetId:load.targetId,kind:load.kind,editId:load.id});
  }
  function inspectPeak(peak:Peak){
    select({type:'member',id:peak.member});
    const member=result?.members.find(m=>m.id===peak.member);
    if(member)setStation(member.samples.indexOf(peak.sample));
  }
  return <section className="sp-workspace sr-workspace" aria-label="3D structural results">
    <CadRibbon label="3D results tools">
      <RibbonGroup label="View" compact>
        <RibbonTool small label="Select" icon={MousePointer2} description="Inspect a joint or member." active={nav==='select'} onClick={()=>setNav('select')}/>
        <RibbonTool small label="Pan" icon={Hand} description="Pan across the drawing." active={nav==='pan'} onClick={()=>setNav('pan')}/>
        <RibbonTool label="Model tree" icon={ListTree} small description="Show or hide components, forces and result details." active={panel} onClick={()=>setPanel(!panel)}/>
        <RibbonTool label="Visibility options" icon={Eye} small description="Set visibility of result labels, grid, geometry names and applied forces." active={layers.open} onClick={layers.toggle}/>
        <RibbonTool small label="Orbit" icon={Orbit} description="Rotate the view around the model." active={nav==='orbit'} onClick={()=>setNav('orbit')}/>
      </RibbonGroup>
      <RibbonGroup label="Results">{modes.map(item=><RibbonTool key={item.id} label={item.name} icon={item.icon} active={mode===item.id}
        description={({reactions:'Show support forces and moments in global XYZ.',displacement:'Inspect the displaced shape and magnitude.',
          axial:'View axial force along each member.',shear:'Switch between the two local shear components.',bending:'Switch between the two local bending moments.',torsion:'Inspect torque about the member axis.'})[item.id]}
        onClick={()=>{setMode(item.id);setPanel(true);}}/>)}</RibbonGroup>
      {mode!=='reactions'&&<RibbonGroup label="Diagram"><div className="sr-ribbon-settings">
        {(mode==='shear'||mode==='bending')&&<label>Component<select aria-label="Local component" value={direction} onChange={e=>setDirection(e.target.value as 'y'|'z')}>
          {(['y','z'] as const).map(d=><option key={d} value={d}>{mode==='shear'?'V':'M'}{d} · local {d}</option>)}</select></label>}
        <label>{mode==='displacement'?'Magnification':'Diagram height'}<input aria-label="3D diagram scale" type="range" min=".25" max="2.5" step=".05"
          value={scale} disabled={mode==='displacement'&&trueScale} onChange={e=>setScale(+e.target.value)}/></label>
        {mode==='displacement'&&<label><input type="checkbox" checked={trueScale} onChange={e=>setTrueScale(e.target.checked)}/>Show true displacement (1×)</label>}
      </div></RibbonGroup>}
      <RibbonGroup label="Review"><RibbonTool label="Analysis details" icon={Settings2} description="Inspect the 3D elastic model assumptions and equilibrium."
        onClick={()=>{setPanel(true);requestAnimationFrame(()=>{if(scope.current){scope.current.open=true;scope.current.scrollIntoView({block:'nearest'});}});}}/></RibbonGroup>
    </CadRibbon>
    {sections.selectionBar}
    <div className="sp-body">
      {panel&&<aside className="sp-inspector sr-inspector sp-explorer" aria-label="3D result options">
        <SpatialComponentTree model={model} selected={selection} selectedLoad={request?.editId} highlightedMembers={sections.chosen} onPick={p=>select(p)} onLoad={editLoad}/>
        <section className="sp-section sp-properties"><div className="sp-heading"><h2><Activity/>{modes.find(item=>item.id===mode)?.name}</h2></div>
          {result&&<div className="sr-peak">
            <span>{mode==='reactions'?'Largest reaction force':mode==='displacement'?'Peak displacement':'Peak |'+symbols[field]+'|'}</span>
            <b>{mode==='reactions'?fmt(reactionPeak?magnitude(reactionPeak.force):0,'force',units):fmt(Math.abs(peak?.value??0),kind(field),units)}</b>
            {mode==='reactions'?reactionPeak&&<button onClick={()=>select({type:'node',id:reactionPeak.id})}>{reactionPeak.id}<ArrowLeftRight size={11}/></button>:
              peak&&<button onClick={()=>inspectPeak(peak)}>{peak.member} · {settingNumber(100*peak.sample.t,units,false)}% from A<ArrowLeftRight size={11}/></button>}
          </div>}
          {mode==='reactions'&&momentPeak&&magnitude(momentPeak.moment)>0&&<div className="sr-moment-peak">
            <span>Largest reaction moment</span><button onClick={()=>select({type:'node',id:momentPeak.id})}>{fmt(magnitude(momentPeak.moment),'moment',units)} · {momentPeak.id}</button>
          </div>}
          {selectedMember&&<StationInspector member={selectedMember} station={station} setStation={setStation} units={units}/>}
          {selectedNode&&<section className="sr-detail">
            <h3><CircleDot size={14}/>Joint {selectedNode.id}</h3>
            {reaction&&<><h4>Support reactions</h4><VectorValues value={reaction.force} prefix="R" type="force" units={units}/><VectorValues value={reaction.moment} prefix="M" type="moment" units={units}/></>}
            <h4>Displacement</h4><VectorValues value={selectedNode.displacement} prefix="u" type="deflection" units={units}/>
            {selectedNode.rotation&&<details><summary>Rotation</summary><VectorValues value={selectedNode.rotation} prefix="θ" type="rad" units={units}/></details>}
          </section>}
          {onChange&&selection&&<details className="sr-adjust" open={request?true:undefined}><summary>Adjust model inputs</summary>
            <SpatialAnalysisInspector model={model} selection={selection} sections={sections} request={request} allowCreate={false} onDone={()=>setRequest(null)} onChange={onChange}/></details>}
          {result&&<details className="sr-equilibrium"><summary><Check size={14}/>Equilibrium residuals</summary>
            <VectorValues value={result.equilibrium.force} prefix="ΣF" type="force" units={units}/>
            <VectorValues value={result.equilibrium.moment} prefix="ΣM" type="moment" units={units}/><small>Global forces and moments about the sketch origin.</small>
          </details>}
          <details ref={scope} className="sr-equilibrium"><summary>Calculation scope</summary>
            <small>The 3D solver uses linear elastic, small-displacement beam and strut theory. Yielding, permanent set, buckling and connection capacity require separate checks.</small>
          </details>
        </section>
      </aside>}
      <div className="sp-viewport">
        <SpatialCanvas nodes={model.nodes} members={model.members} tool={sections.bulk?'select':nav} plane="XY" offset={0} snap={0} selection={selection}
          highlights={sections.chosen.map(id=>({type:'member',id}))} showGrid={grid} showNames={names} onPoint={()=>{}} onSelect={select}
          renderOverlay={project=><>{loads&&<SpatialLoadOverlay model={model} project={project} labels={values}/>}
            {result&&(mode==='reactions'?<SpatialReactionOverlay model={model} result={result} project={project} labels={values}/>:field==='u'?
              <DeflectedFrame project={project} result={result} factor={factor} labels={values} peak={peak}/>:
              <MemberDiagrams project={project} result={result} field={field} peak={peak} scale={scale*48} selected={selection} labels={values}/>)}
            {selectedMember&&selectedSample&&<SpatialStationAxes project={project} member={selectedMember} showAxes={localAxes}
              position={mode==='displacement'?addScaled(selectedSample.position,selectedSample.displacement,factor):selectedSample.position}/>}
            {!sections.bulk&&<SpatialRuleLayer model={model} project={project} dimensions={dimensions} constraints={constraints}
              onOpen={sketch.inspect} onMove={sketch.moveLabel}/>}
            {instability&&showMotion&&<InstabilityOverlay diagnostic={instability} model={model} project={project} selected={selection}/>}</>}/>
        {!instability&&(preparation||error)&&<aside className={'sr-alert '+(preparation?'sr-empty':'')} role={preparation?'status':'alert'}>
          <AlertTriangle size={19}/><div><strong>{preparation?'Prepare the 3D model':'3D analysis needs attention'}</strong><p>{preparation||error}</p>
            <div className="sr-alert-actions">{error&&/unstable|equilibrium|attached member|end joints/i.test(error)&&<button onClick={()=>onReviewConnections()}><Link2 size={14}/>Review connections</button>}
              <button onClick={onBack}><ArrowLeft size={14}/>Back to 3D-model</button></div></div></aside>}
        {pending&&<div className="sr-legend" role="status">Calculating 3D results…</div>}
        {result&&<div className="sr-legend" aria-label="3D result legend">
          {mode==='reactions'?<><span><i style={{background:'#345fa1'}}/>Support reactions</span>{loads&&<span><i style={{background:'#ba5f22'}}/>Applied loads</span>}</>:
            mode==='displacement'?<><span><i className="sr-gradient"/>Displacement</span><small>Shape × {settingNumber(factor,units,false)}</small></>:
              <><span><i style={{background:legendColor(true)}}/>−</span><span><i style={{background:legendColor(false)}}/>+</span><b>{symbols[field]} · {quantity(units,kind(field)).unit}</b></>}
        </div>}
      </div>
    </div>
        {instability&&<aside className="sr-alert sr-instability" aria-label="3D stability diagnosis">
          <AlertTriangle size={19}/><div>
            <div role="alert"><InstabilityEvidence diagnostic={instability}/></div>
            <div className="sr-mode-controls"><label className="sr-mode-toggle"><input type="checkbox" checked={showMotion} onChange={e=>setShowMotion(e.target.checked)}/>
              Show possible motion <small>(illustrative scale)</small></label>
            <div className="sr-alert-actions">
              <button onClick={()=>onInspectInstability({type:'node',id:instability.primaryNode})}><CircleDot size={14}/>Inspect {instability.primaryNode}</button>
              <button onClick={()=>onReviewConnections(instability)}><Link2 size={14}/>Review connections</button>
            </div>
            <InstabilityPicks diagnostic={instability} onInspect={onInspectInstability}/></div>
          </div></aside>}
    {result&&result.warnings.length>0&&<div className="sr-warnings" role="status">{result.warnings.join(' ')}</div>}
    {layers.menu([{name:'Grid',checked:grid,change:setGrid},{name:'Dimensions',checked:dimensions,change:setDimensions},{name:'Constraints',checked:constraints,change:setConstraints},{name:'Joint and member names',checked:names,change:setNames},
      {name:'Applied loads',checked:loads,change:setLoads},{name:'Result values',checked:values,change:setValues},{name:'Selected member axes',checked:localAxes,change:setLocalAxes}])}
    {sections.dialog}
    {onChange&&sketch.menu}
    <footer className="sp-status"><span>{model.nodes.length} joints · {model.members.length} members · {model.loads?.length??0} loads</span><span>3D linear elastic · small displacements</span></footer>
  </section>;
}
