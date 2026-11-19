import {useEffect, useMemo, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {Box, Check, ChevronRight, CircleDot, LockKeyhole, LockKeyholeOpen, MoveUpRight, Ruler, Trash2, X} from 'lucide-react';
import {useUnits} from './unit-context';
import {inputNumber, lengthUnits, parseNumber, settingNumber} from './units';
import NumberInput from './number-input';
import {supportTypes} from './support-symbol';
import {SpatialCanvas} from './spatial-canvas';
import {spatialSketchMobility} from './spatial-mobility';
import {moveConstrainedSpatialNode,translateSpatialMember,setSpatialPositionLock,spatialPositionLocked} from './spatial-sketch';
import type {SpatialDrag, SpatialPlane, SpatialSelection, SpatialTool} from './spatial-canvas';
import {addSpatialMember, ensureSpatialNode, insertSpatialJoint, placeSpatialJoint, removeSpatialMember, removeSpatialNode, updateSpatialMember, updateSpatialNode} from './spatial-model';
import type {SpatialModel, Vec3} from './spatial-model';
import type {Joint, Support} from './model';
import {useSpatialSketch} from './use-spatial-sketch';
import {SpatialRuleLayer} from './spatial-rule-view';
import {SpatialLoadOverlay} from './spatial-loads-view';
import {SpatialAnalysisInspector} from './spatial-results-inspector';
import type {SpatialLoadRequest} from './spatial-results-inspector';
import type {SpatialLoad} from './spatial-analysis-input';
import {actionLabel} from './sketch-actions';
import type {SketchAction} from './sketch-actions';
import SpatialComponentTree from './spatial-component-tree';
import {SpatialModelRibbon,commandPosition,drawingTools,useSpatialLayers} from './spatial-model-ribbon';
import type {TargetAction} from './spatial-model-ribbon';
import {useSpatialSections} from './spatial-section-editor';
import type {CursorPosition} from './sketch-popover';
import './spatial-analysis-ui.css';
import './spatial.css';

const axes = ['x', 'y', 'z'] as const;
const normal = {XY:'z', XZ:'y', YZ:'x'} as const;
const origin = {x:0, y:0, z:0};
const jointNames:Record<Joint,string> = {rigid:'Rigid', pin:'Pin', hinge:'Internal hinge'};

function Coordinates({initial, action, onApply, onLock, onUnlock}:{
  initial:Vec3; action:string; onApply:(point:Vec3)=>void;
  onLock?:(point:Vec3)=>void; onUnlock?:()=>void;
}) {
  const units = useUnits();
  const factor = lengthUnits[units.length];
  const [values, setValues] = useState(() => axes.map(axis => inputNumber(initial[axis] / factor)));
  const [attempted, setAttempted] = useState(false);
  const numbers = values.map((value,i) => value===inputNumber(initial[axes[i]]/factor)?initial[axes[i]]:parseNumber(value)*factor);
  function submit(event:FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if(onUnlock||!numbers.every(Number.isFinite))return;
    const submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
    const applyPosition=submitter?.value==='lock'&&onLock?onLock:onApply;
    applyPosition({x:numbers[0], y:numbers[1], z:numbers[2]});
  }
  return <form className="sp-coordinates" onSubmit={submit}>
    <div className="sp-xyz">{axes.map((axis, index) => <label key={axis}>
      <span className={'sp-axis-' + axis}>{axis.toUpperCase()}</span>
      <input type="text" inputMode="decimal" autoComplete="off" aria-label={axis.toUpperCase() + ' coordinate in ' + units.length}
        value={values[index]} readOnly={!!onUnlock} aria-invalid={attempted && !Number.isFinite(numbers[index])}
        onChange={e => setValues(values.map((old, i) => i === index ? e.target.value : old))}/>
    </label>)}</div>
    {attempted && numbers.some(n => !Number.isFinite(n)) && <small role="alert">Enter a number for each coordinate.</small>}
    {onUnlock?<button className="sp-action" type="button" onClick={onUnlock}><LockKeyholeOpen size={14}/>Unlock position</button>:
      <div className="sp-coordinate-actions"><button className="sp-action" type="submit"><Check size={14}/>{action}</button>
        {onLock&&<button className="sp-action sp-lock" type="submit" value="lock" title="Apply the entered coordinates and lock this joint in the sketch"><LockKeyhole size={14}/>Lock position</button>}
      </div>}
  </form>;
}

export default function SpatialWorkspace({model, onChange}:{model:SpatialModel; onChange:(next:SpatialModel)=>void}) {
  const units = useUnits(), factor = lengthUnits[units.length];
  const [tool, setTool] = useState<SpatialTool>(() => model.nodes.length ? 'select' : 'beam');
  const [selection, setSelection] = useState<SpatialSelection>(null);
  const committed=useRef(model);
  committed.current=model;
  const [preview,setPreview]=useState<{base:SpatialModel;next:SpatialModel}|null>(null);
  const visible=preview?.base===model?preview.next:model;
  const mobility=useMemo(()=>spatialSketchMobility(visible),[visible]);
  const [anchor, setAnchor] = useState<{point:Vec3; model:SpatialModel}|null>(null);
  const [rejectedPick,setRejectedPick]=useState<SpatialSelection>(null);
  const start = anchor?.model === model ? anchor.point : null;
  const [plane, setPlane] = useState<SpatialPlane>('XY');
  const [offsets, setOffsets] = useState({XY:0, XZ:0, YZ:0});
  const [snap, setSnap] = useState(true), [spacing, setSpacing] = useState<number|null>(null);
  const [showGrid, setShowGrid] = useState(true), [showNames, setShowNames] = useState(true);
  const [pane, setPane] = useState(true), layers=useSpatialLayers();
  const [relative, setRelative] = useState(false);
  const [error, setError] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  const [target,setTarget]=useState<TargetAction|null>(null),[request,setRequest]=useState<SpatialLoadRequest|null>(null);
  const supportInput=useRef<HTMLSelectElement>(null);
  const sections=useSpatialSections(model,selection,onChange);
  const sketch=useSpatialSketch(model,onChange);
  const sketchTool=tool==='constraint'||tool==='dimension';
  const [showDimensions,setShowDimensions]=useState(true),[showConstraints,setShowConstraints]=useState(true),[showLoads,setShowLoads]=useState(true);
  const nodeById = useMemo(() => new Map(model.nodes.map(node => [node.id, node])), [model.nodes]);
  const node = selection?.type === 'node' ? nodeById.get(selection.id) : undefined;
  const member = selection?.type === 'member' ? model.members.find(item => item.id === selection.id) : undefined;
  const attached = node ? model.members.filter(item => item.a === node.id || item.b === node.id) : [];
  const activePlaneAxis = normal[plane];
  const drawing = tool === 'beam' || tool === 'strut';
  const placing = drawing || tool === 'joint';
  const draftOnPlane = {...origin, [activePlaneAxis]:offsets[plane]};
  const pointInitial = start ? (relative ? origin : {...start}) : draftOnPlane;
  const fmtLength = (v:number) => settingNumber(v / factor, units, false) + ' ' + units.length;

  useEffect(() => {
    if (anchor && anchor.model !== model) setAnchor(null);
    if (selection && !node && !member) {setSelection(null); setConfirmDelete(false);}
  }, [anchor, model, selection, node, member]);

  function pickTool(next:SpatialTool, keepSketch=false) {
    setRejectedPick(null);
    if(!keepSketch)sketch.reset();
    sections.closeBulk();setTarget(null);setRequest(null);layers.close();
    setTool(next); setAnchor(null); setSelection(null); setError(''); setConfirmDelete(false);
    if (next === 'beam' || next === 'strut' || next === 'joint' || next==='dimension' || next==='constraint') setPane(true);
    if(next==='dimension')setShowDimensions(true);
    if(next==='constraint')setShowConstraints(true);
    if(!keepSketch&&selection&&(next==='dimension'||next==='constraint')){
      sketch.select(selection,commandPosition(),next,null,false);
    }
  }
  function startAction(action:SketchAction,dimension:boolean){
    pickTool(dimension?'dimension':'constraint',true);
    sketch.startAction(action,selection,commandPosition());
  }
  function applyTarget(action:TargetAction,next:NonNullable<SpatialSelection>,point?:Vec3){
    if(action==='support'&&next.type!=='node'||action==='distributed'&&next.type!=='member'){
      setError(action==='support'?'Choose a joint for the support.':'Choose a member for a distributed load.');return;
    }
    setSelection(next);setPane(true);setError('');setTarget(null);
    if(action==='support'){
      requestAnimationFrame(()=>{supportInput.current?.focus();supportInput.current?.scrollIntoView({block:'nearest'});});
      return;
    }
    let t:number|undefined;
    const b=point&&next.type==='member'?model.members.find(m=>m.id===next.id):undefined;
    if(b&&point){
      const a=nodeById.get(b.a)!,end=nodeById.get(b.b)!;
      const d={x:end.x-a.x,y:end.y-a.y,z:end.z-a.z};
      t=Math.max(0,Math.min(1,((point.x-a.x)*d.x+(point.y-a.y)*d.y+(point.z-a.z)*d.z)/(d.x*d.x+d.y*d.y+d.z*d.z)));
    }
    setRequest({target:next.type,targetId:next.id,kind:action,t});setShowLoads(true);
  }
  function chooseTarget(action:TargetAction){
    pickTool('select');setTarget(action);setPane(true);
    if(selection&&(action!=='support'||selection.type==='node')&&(action!=='distributed'||selection.type==='member'))applyTarget(action,selection);
  }
  function select(next:SpatialSelection,point?:Vec3) {
    if(sections.bulk){if(next?.type==='member')sections.pick(next.id);return;}
    if(target&&next){applyTarget(target,next,point);return;}
    setRejectedPick(null);sketch.reset();setRequest(null);setSelection(next); setError(''); setConfirmDelete(false);
    if (next) setPane(true);
  }
  const dragGeometry:SpatialDrag=(pick,delta,phase)=>{
    setRejectedPick(null);
    if(committed.current!==model||phase==='cancel'){setPreview(null);setError('');return;}
    const current=nodeById.get(pick.id);
    try {
      const next=pick.type==='member'?translateSpatialMember(model,pick.id,delta):
        moveConstrainedSpatialNode(model,pick.id,{x:current!.x+delta.x,y:current!.y+delta.y,z:current!.z+delta.z});
      setError('');
      if(phase==='preview')setPreview({base:model,next});
      else{
        setPreview(null);select(pick);
        if(next!==model)onChange(next);
      }
    } catch(err){
      setRejectedPick(pick);setError((err as Error).message);
      if(phase==='commit'){setPreview(null);setPane(true);}
    }
  };
  function editLoad(load:SpatialLoad){
    if(sections.bulk)return;
    pickTool('select');setPane(true);setSelection({type:load.target,id:load.targetId});
    setRequest({target:load.target,targetId:load.targetId,kind:load.kind,editId:load.id});
  }
  function openSections(){
    const previous=selection;
    pickTool('select');setSelection(previous);sections.open();
  }
  function pickGeometry(p:SpatialSelection,at:CursorPosition,shortcut:boolean) {
    const mode=shortcut||tool!=='dimension'?'constraint':'dimension';
    sketch.select(p,at,mode,selection,shortcut);
    setError('');setConfirmDelete(false);setAnchor(null);setSelection(null);
    if(shortcut){setTool('select');setShowConstraints(true);}
  }
  function treePick(p:NonNullable<SpatialSelection>,e:React.MouseEvent) {
    if(sections.bulk||target){select(p);return;}
    if(sketchTool||e.ctrlKey||e.metaKey)pickGeometry(p,{x:e.clientX,y:e.clientY},e.ctrlKey||e.metaKey);
    else{pickTool('select');select(p);}
  }
  function apply(edit:()=>SpatialModel) {
    try { const next = edit(); if (next !== model) onChange(next); setError(''); return true; }
    catch (err) { setError(err instanceof Error ? err.message : 'The edit could not be applied.'); return false; }
  }
  function finish() {pickTool('select');}
  function place(point:Vec3, nodeId?:string) {
    const p = (nodeId && nodeById.get(nodeId)) || point;
    if (tool === 'joint') {
      try {
        const result = placeSpatialJoint(model, p);
        if (result.model !== model) onChange(result.model);
        finish(); select({type:'node', id:result.node.id});
      } catch (err) { setError((err as Error).message); }
      return;
    }
    if (!drawing) return;
    try {
      if (!start) {
        const {node:first} = ensureSpatialNode(model, p);
        setAnchor({point:first, model});
      } else {
        const next = addSpatialMember(model, start, p, tool);
        onChange(next.model);
        setAnchor({point:next.model.nodes.find(n => n.id === next.member.b)!, model:next.model});
      }
      setError('');
    } catch (err) {setError((err as Error).message);}
  }
  function placeOnMember(memberId:string, point:Vec3) {
    try {
      const result = insertSpatialJoint(model, memberId, point);
      if (result.model !== model) onChange(result.model);
      finish(); select({type:'node', id:result.node.id});
    } catch (err) { setError((err as Error).message); }
  }
  function remove() {
    if (node && attached.length && !confirmDelete) {setConfirmDelete(true); setPane(true); return;}
    if (!node && !member) return;
    if (apply(() => node ? removeSpatialNode(model, node.id) : removeSpatialMember(model, member!.id))) select(null);
  }
  useEffect(() => {
    const handleKey = (event:KeyboardEvent) => {
      const target = event.target as HTMLElement|null;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('[role="dialog"], .main-menu')) return;
      if (target?.closest('input,select,textarea,[contenteditable=true]')) return;
      if (target?.closest('button,summary') && (event.key === 'Enter' || event.key === ' ')) return;
      if (event.key === 'Escape') {finish(); event.preventDefault(); return;}
      if (event.key === 'Enter' && drawing) {finish(); event.preventDefault(); return;}
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {remove(); event.preventDefault(); return;}
      const shortcut = drawingTools.find(item => item.key === event.key.toUpperCase());
      if (shortcut) {pickTool(shortcut.id); event.preventDefault();}
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });
  const draftKey = [tool, plane, offsets[plane], start?.x, start?.y, start?.z, relative, units.length].join('/');
  const locked=!!node&&spatialPositionLocked(model,node.id);
  const selectionKey = node && [node.id, node.x, node.y, node.z, locked, units.length].join('/');
  const hint = target==='support'?'Choose a joint to set its support.':target==='distributed'?'Choose a member for the uniform load.':
    target?'Choose a joint or click a position on a member.':drawing ? (start ? 'Pick the next joint. Enter finishes the chain.' : 'Pick the first joint or enter its coordinates.')
    : tool === 'joint' ? 'Click a member to split it, or place a joint on the workplane.'
    : tool === 'pan' ? 'Drag to pan.' : tool === 'orbit' ? 'Drag to orbit the frame.'
    : sketch.activeAction?actionLabel(sketch.activeAction,'3D')+' · pick the geometry in the drawing or tree.'
    : tool==='dimension'?'Pick a member for length, two points for distance, two members for an angle, or a point and a member for an offset.'
    : tool==='constraint'?'Pick one member or two objects. Along X, Y or Z aligns the selection to a global axis.'
    : 'Select geometry to edit it. Ctrl-click a pair for constraints.';
  return <section className="sp-workspace" aria-label="3D frame modelling">
    <div data-sketch-surface="ribbon"><SpatialModelRibbon tool={tool} target={target} activeAction={sketch.activeAction}
      onTool={pickTool} onTarget={chooseTarget} onAction={startAction} onSections={openSections}
      pane={pane} onPane={()=>setPane(!pane)} layers={layers.open} onLayers={layers.toggle}/></div>
    {sections.selectionBar}
    <div className="sp-body">
      {pane && <aside className="sp-inspector sp-explorer" aria-label="3D drafting panel">
        <SpatialComponentTree model={model} selected={selection} selectedLoad={request?.editId} highlightedMembers={sections.chosen}
          onPick={treePick} onLoad={editLoad}/>
        <div className="sp-properties">
        {node || member ? <section className="sp-section">
          <div className="sp-heading"><h2>{node ? <CircleDot/> : <MoveUpRight/>}{node ? 'Joint ' + node.id : 'Member ' + member!.id}</h2>
            <button aria-label="Clear selection" onClick={() => select(null)}><X size={15}/></button></div>
          {node && <>
            <h3>Position <small>{units.length}</small></h3>
            <Coordinates key={selectionKey} initial={node} action="Move joint" onApply={p => apply(() => updateSpatialNode(model, node.id, p))}
              onLock={p=>apply(()=>setSpatialPositionLock(updateSpatialNode(model,node.id,p),node.id,true))}
              onUnlock={locked?()=>apply(()=>setSpatialPositionLock(model,node.id,false)):undefined}/>
            <label className="sp-field">Joint type<select value={node.joint} onChange={e => apply(() => updateSpatialNode(model, node.id, {joint:e.target.value as Joint}))}>
              {Object.entries(jointNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
            <label className="sp-field">Support<select ref={supportInput} value={node.support} onChange={e => apply(() => updateSpatialNode(model, node.id, {support:e.target.value as Support}))}>
              {supportTypes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            {attached.length > 0 && <><h3>Connected members</h3>{attached.map(item => <button key={item.id} className="sp-row" onClick={() => select({type:'member', id:item.id})}>
              <MoveUpRight size={13}/><b>{item.id}</b><span>{item.kind}</span><ChevronRight size={13}/></button>)}</>}
          </>}
          {member && <>
            <label className="sp-field">Member type<select value={member.kind} onChange={e => apply(() => updateSpatialMember(model, member.id, {kind:e.target.value as 'beam'|'strut'}))}>
              <option value="beam">Beam</option><option value="strut">Strut</option></select></label>
            <div className="sp-length"><span>Length</span><b>{fmtLength(Math.hypot(...axes.map(axis => nodeById.get(member.a)![axis] - nodeById.get(member.b)![axis])))}</b></div>
            <h3>End joints</h3>{[member.a, member.b].map(id => {
              const end = nodeById.get(id)!;
              return <button key={id} className="sp-row" onClick={() => select({type:'node', id})}>
                <CircleDot size={13}/><b>{id}</b><span>{jointNames[end.joint]}</span><ChevronRight size={13}/></button>;
            })}
          </>}
          {selection && sketch.related(selection)}
          {selection && <SpatialAnalysisInspector model={model} selection={selection} sections={sections} request={request} onDone={()=>setRequest(null)} onChange={onChange}/>}
          {confirmDelete && node && attached.length > 0 && <p role="alert">Removing {node.id} also removes {attached.map(item => item.id).join(', ')}.</p>}
          <div className="sp-delete-row"><button className="sp-remove" onClick={remove}><Trash2 size={13}/>{confirmDelete ? 'Confirm removal' : node ? 'Remove joint' : 'Remove member'}</button>
            {confirmDelete && <button onClick={() => setConfirmDelete(false)}>Cancel</button>}</div>
        </section> : <section className="sp-section">
          <div className="sp-heading"><h2>{sketchTool?<Ruler/>:<Box/>}{target?({force:'Point force',moment:'Moment',distributed:'Distributed load',support:'Support'})[target]:
            sketchTool?(tool==='dimension'?'Dimension':'Constraints'):placing ? (tool === 'joint' ? 'Place joint' : tool === 'beam' ? 'Draw beam' : 'Draw strut') : 'Workplane'}</h2></div>
          <p className="sp-hint">{hint}</p>
          {!sketchTool&&!target&&<><span className="sp-field-label">Drawing plane</span>
          <div className="sp-planes" role="group" aria-label="Drawing plane">
            {(['XY','XZ','YZ'] as const).map(p => <button key={p} aria-pressed={plane === p} onClick={() => setPlane(p)}>{p}</button>)}
          </div>
          <label className="sp-field">Plane offset · {activePlaneAxis.toUpperCase()} ({units.length})
            <NumberInput key={plane} label="Workplane offset" value={offsets[plane] / factor} onCommit={n => setOffsets({...offsets, [plane]:n * factor})}/>
          </label>
          <label className="sp-check"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)}/>Snap to grid</label>
          {snap && <><label className="sp-field">Snap spacing<select value={spacing===null?'auto':'fixed'} onChange={e=>setSpacing(e.target.value==='auto'?null:.25)}>
            <option value="auto">Auto · follows grid</option><option value="fixed">Fixed spacing</option></select></label>
            {spacing!==null&&<label className="sp-field">Grid step ({units.length})<NumberInput label="Grid step" min={1e-6 / factor} value={spacing / factor} onCommit={n=>setSpacing(n*factor)}/></label>}</>}
          </>}
          {placing && <div className="sp-entry">
            <h3>{drawing ? (start ? 'Next joint' : 'First joint') : 'Joint position'} <small>{units.length}</small></h3>
            {start && <label className="sp-check"><input type="checkbox" checked={relative} onChange={e => setRelative(e.target.checked)}/>Relative to previous joint</label>}
            <Coordinates key={draftKey} initial={pointInitial} action={drawing ? (start ? 'Add member' : 'Set first joint') : 'Place joint'}
              onApply={p => place(start && relative ? {x:start.x+p.x, y:start.y+p.y, z:start.z+p.z} : p)}/>
            {start && <button className="sp-finish" onClick={finish}>Finish chain <kbd>Enter</kbd></button>}
          </div>}
        </section>}
        {error && <p className="sp-error" role="alert">{error}</p>}
        </div>
      </aside>}
      <div className="sp-viewport">
        <SpatialCanvas mobility={mobility} rejected={error&&rejectedPick?[rejectedPick]:sketch.rejected} nodes={visible.nodes} members={visible.members} onGeometryDrag={sections.bulk||target?undefined:dragGeometry} tool={sections.bulk?'select':tool} plane={plane} offset={offsets[plane]}
          snap={snap ? spacing??'auto' : 0} start={start} selection={selection} onPoint={place} onSelect={select}
          onMemberPoint={placeOnMember} showGrid={showGrid} showNames={showNames}
          onSketchPick={sections.bulk||target?undefined:pickGeometry} highlights={sections.bulk?sections.chosen.map(id=>({type:'member',id})):sketch.picks} renderOverlay={project=><>
            {showLoads&&<SpatialLoadOverlay model={visible} project={project}/>}
            <SpatialRuleLayer model={visible} project={project} dimensions={showDimensions} constraints={showConstraints} onOpen={sketch.inspect} onMove={sketch.moveLabel}/>
          </>}/>
      </div>
    </div>
    {sketch.menu}
    {layers.menu([{name:'Workplane grid',checked:showGrid,change:setShowGrid},{name:'Dimensions',checked:showDimensions,change:setShowDimensions},
      {name:'Constraints',checked:showConstraints,change:setShowConstraints},{name:'Loads',checked:showLoads,change:setShowLoads},
      {name:'Joint and member names',checked:showNames,change:setShowNames}])}
    {sections.dialog}
    <footer className="sp-status"><span>{model.nodes.length} {model.nodes.length === 1 ? 'joint' : 'joints'} · {model.members.length} {model.members.length === 1 ? 'member' : 'members'}</span><span role="status">{sketch.feedback || (sketch.picks.length===1?'Pick the second point or member':tool==='select'?'Drag a joint or member to move it · Shift-drag to pan · Ctrl-click for constraints':'Ctrl-click geometry for constraints')}</span>
      {model.nodes.length>0&&<b className="sp-freedom" title="Remaining independent sketch motions">{[...mobility.nodes.values()].includes('conflict')?'Constraint conflict':mobility.dof===0?'Fully constrained':mobility.dof+' DOF'}</b>}</footer>
  </section>;
}
