import {useEffect, useId, useMemo, useState} from 'react';
import type {FormEvent} from 'react';
import {Box, Check, ChevronRight, CircleDot, Eye, GitBranch, Hand, ListTree, MousePointer2, MoveUpRight, Orbit, PanelLeftClose, PanelLeftOpen, Trash2, X} from 'lucide-react';
import {useUnits} from './unit-context';
import {inputNumber, lengthUnits, parseNumber, settingNumber} from './units';
import NumberInput from './number-input';
import {supportTypes} from './support-symbol';
import {SpatialCanvas} from './spatial-canvas';
import type {SpatialPlane, SpatialSelection, SpatialTool} from './spatial-canvas';
import {addSpatialMember, ensureSpatialNode, insertSpatialJoint, placeSpatialJoint, removeSpatialMember, removeSpatialNode, updateSpatialMember, updateSpatialNode} from './spatial-model';
import type {SpatialModel, SpatialNode, Vec3} from './spatial-model';
import type {Joint, Support} from './model';
import './spatial.css';

const axes = ['x', 'y', 'z'] as const;
const normal = {XY:'z', XZ:'y', YZ:'x'} as const;
const origin = {x:0, y:0, z:0};
const jointNames:Record<Joint,string> = {rigid:'Rigid', pin:'Pin', hinge:'Internal hinge'};
const tools = [
  {id:'select', name:'Select', icon:MousePointer2, key:'V'},
  {id:'beam', name:'Beam', icon:MoveUpRight, key:'B'},
  {id:'strut', name:'Strut', icon:GitBranch, key:'T'},
  {id:'joint', name:'Joint', icon:CircleDot, key:'J'},
  {id:'orbit', name:'Orbit', icon:Orbit, key:'O'},
  {id:'pan', name:'Pan', icon:Hand, key:'H'},
] as const;

function Coordinates({initial, action, onApply}:{
  initial:Vec3; action:string; onApply:(point:Vec3)=>void;
}) {
  const units = useUnits();
  const factor = lengthUnits[units.length];
  const [values, setValues] = useState(() => axes.map(axis => inputNumber(initial[axis] / factor)));
  const [attempted, setAttempted] = useState(false);
  const numbers = values.map(value => parseNumber(value) * factor);
  function submit(event:FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (numbers.every(Number.isFinite)) onApply({x:numbers[0], y:numbers[1], z:numbers[2]});
  }
  return <form className="sp-coordinates" onSubmit={submit}>
    <div className="sp-xyz">{axes.map((axis, index) => <label key={axis}>
      <span className={'sp-axis-' + axis}>{axis.toUpperCase()}</span>
      <input type="text" inputMode="decimal" autoComplete="off" aria-label={axis.toUpperCase() + ' coordinate in ' + units.length}
        value={values[index]} aria-invalid={attempted && !Number.isFinite(numbers[index])}
        onChange={e => setValues(values.map((old, i) => i === index ? e.target.value : old))}/>
    </label>)}</div>
    {attempted && numbers.some(n => !Number.isFinite(n)) && <small role="alert">Enter a number for each coordinate.</small>}
    <button className="sp-action" type="submit"><Check size={14}/>{action}</button>
  </form>;
}

export default function SpatialWorkspace({model, onChange}:{model:SpatialModel; onChange:(next:SpatialModel)=>void}) {
  const units = useUnits(), factor = lengthUnits[units.length];
  const [tool, setTool] = useState<SpatialTool>(() => model.nodes.length ? 'select' : 'beam');
  const [selection, setSelection] = useState<SpatialSelection>(null);
  const [anchor, setAnchor] = useState<{point:Vec3; model:SpatialModel}|null>(null);
  const start = anchor?.model === model ? anchor.point : null;
  const [plane, setPlane] = useState<SpatialPlane>('XY');
  const [offsets, setOffsets] = useState({XY:0, XZ:0, YZ:0});
  const [snap, setSnap] = useState(true), [spacing, setSpacing] = useState(.25);
  const [showGrid, setShowGrid] = useState(true), [showNames, setShowNames] = useState(true);
  const [pane, setPane] = useState(true), [visibility, setVisibility] = useState(false);
  const [relative, setRelative] = useState(false);
  const [error, setError] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const panelId = useId(), visibilityId = useId();
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
  const caption = (p:Vec3) => axes.map(axis => settingNumber(p[axis] / factor, units, false)).join(' / ') + ' ' + units.length;

  useEffect(() => {
    if (anchor && anchor.model !== model) setAnchor(null);
    if (selection && !node && !member) {setSelection(null); setConfirmDelete(false);}
  }, [anchor, model, selection, node, member]);

  function pickTool(next:SpatialTool) {
    setTool(next); setAnchor(null); setSelection(null); setError(''); setConfirmDelete(false);
    if (next === 'beam' || next === 'strut' || next === 'joint') setPane(true);
  }
  function select(next:SpatialSelection) {
    setSelection(next); setError(''); setConfirmDelete(false);
    if (next) setPane(true);
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
      if (event.key === 'Escape') {finish(); setVisibility(false); event.preventDefault(); return;}
      if (event.key === 'Enter' && drawing) {finish(); event.preventDefault(); return;}
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {remove(); event.preventDefault(); return;}
      const shortcut = tools.find(item => item.key === event.key.toUpperCase());
      if (shortcut) {pickTool(shortcut.id); event.preventDefault();}
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });
  const draftKey = [tool, plane, offsets[plane], start?.x, start?.y, start?.z, relative, units.length].join('/');
  const selectionKey = node && [node.id, node.x, node.y, node.z, units.length].join('/');
  const hint = drawing ? (start ? 'Pick the next joint. Enter finishes the chain.' : 'Pick the first joint or enter its coordinates.')
    : tool === 'joint' ? 'Click a member to split it, or place a joint on the workplane.'
    : tool === 'pan' ? 'Drag to pan.' : tool === 'orbit' ? 'Drag to orbit the frame.'
    : 'Select a member or joint to edit it.';
  return <section className="sp-workspace" aria-label="3D frame modelling">
    <div className="sp-toolbar" role="toolbar" aria-label="3D drawing tools">
      <button type="button" className="sp-pane-switch" aria-label={pane ? 'Hide drafting panel' : 'Show drafting panel'}
        aria-expanded={pane} aria-controls={panelId} onClick={() => setPane(!pane)}>
        {pane ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}
      </button>
      {tools.map(item => <button key={item.id} type="button" className={'sp-tool sp-tool-' + item.id}
        aria-pressed={tool === item.id} title={item.name + ' (' + item.key + ')'} onClick={() => pickTool(item.id)}>
        <item.icon size={16}/><span>{item.name}</span>
      </button>)}
      <div className="sp-visibility">
        <button type="button" aria-label="3D display options" title="Display options" aria-expanded={visibility}
          aria-controls={visibilityId} onClick={() => setVisibility(!visibility)}><Eye size={16}/></button>
        {visibility && <div id={visibilityId} className="sp-visibility-menu">
          <label><input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)}/>Workplane grid</label>
          <label><input type="checkbox" checked={showNames} onChange={e => setShowNames(e.target.checked)}/>Joint and member names</label>
        </div>}
      </div>
    </div>
    <div className="sp-body">
      {pane && <aside id={panelId} className="sp-inspector" aria-label="3D drafting panel">
        {node || member ? <section className="sp-section">
          <div className="sp-heading"><h2>{node ? <CircleDot/> : <MoveUpRight/>}{node ? 'Joint ' + node.id : 'Member ' + member!.id}</h2>
            <button aria-label="Clear selection" onClick={() => select(null)}><X size={15}/></button></div>
          {node && <>
            <h3>Position <small>{units.length}</small></h3>
            <Coordinates key={selectionKey} initial={node} action="Move joint" onApply={p => apply(() => updateSpatialNode(model, node.id, p))}/>
            <label className="sp-field">Joint type<select value={node.joint} onChange={e => apply(() => updateSpatialNode(model, node.id, {joint:e.target.value as Joint}))}>
              {Object.entries(jointNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
            <label className="sp-field">Support<select value={node.support} onChange={e => apply(() => updateSpatialNode(model, node.id, {support:e.target.value as Support}))}>
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
          {confirmDelete && node && attached.length > 0 && <p role="alert">Removing {node.id} also removes {attached.map(item => item.id).join(', ')}.</p>}
          <div className="sp-delete-row"><button className="sp-remove" onClick={remove}><Trash2 size={13}/>{confirmDelete ? 'Confirm removal' : node ? 'Remove joint' : 'Remove member'}</button>
            {confirmDelete && <button onClick={() => setConfirmDelete(false)}>Cancel</button>}</div>
        </section> : <section className="sp-section">
          <div className="sp-heading"><h2><Box/>{placing ? (tool === 'joint' ? 'Place joint' : tool === 'beam' ? 'Draw beam' : 'Draw strut') : 'Workplane'}</h2></div>
          <p className="sp-hint">{hint}</p>
          <span className="sp-field-label">Drawing plane</span>
          <div className="sp-planes" role="group" aria-label="Drawing plane">
            {(['XY','XZ','YZ'] as const).map(p => <button key={p} aria-pressed={plane === p} onClick={() => setPlane(p)}>{p}</button>)}
          </div>
          <label className="sp-field">Plane offset · {activePlaneAxis.toUpperCase()} ({units.length})
            <NumberInput key={plane} label="Workplane offset" value={offsets[plane] / factor} onCommit={n => setOffsets({...offsets, [plane]:n * factor})}/>
          </label>
          <label className="sp-check"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)}/>Snap to grid</label>
          {snap && <label className="sp-field">Grid step ({units.length})<NumberInput label="Grid step" min={1e-6 / factor} value={spacing / factor} onCommit={n => setSpacing(n * factor)}/></label>}
          {placing && <div className="sp-entry">
            <h3>{drawing ? (start ? 'Next joint' : 'First joint') : 'Joint position'} <small>{units.length}</small></h3>
            {start && <label className="sp-check"><input type="checkbox" checked={relative} onChange={e => setRelative(e.target.checked)}/>Relative to previous joint</label>}
            <Coordinates key={draftKey} initial={pointInitial} action={drawing ? (start ? 'Add member' : 'Set first joint') : 'Place joint'}
              onApply={p => place(start && relative ? {x:start.x+p.x, y:start.y+p.y, z:start.z+p.z} : p)}/>
            {start && <button className="sp-finish" onClick={finish}>Finish chain <kbd>Enter</kbd></button>}
          </div>}
        </section>}
        {error && <p className="sp-error" role="alert">{error}</p>}
        {(model.nodes.length > 0 || model.members.length > 0) && <details className="sp-tree" open={treeOpen} onToggle={e => setTreeOpen(e.currentTarget.open)}>
          <summary><ListTree size={15}/>Model tree</summary>
          <h3>Joints <small>{model.nodes.length}</small></h3>{model.nodes.map((item:SpatialNode) => <button key={item.id} className="sp-row" onClick={() => {pickTool('select'); select({type:'node', id:item.id});}}>
            <CircleDot size={12}/><b>{item.id}</b><span>{caption(item)}</span></button>)}
          <h3>Members <small>{model.members.length}</small></h3>{model.members.map(item => <button key={item.id} className="sp-row" onClick={() => {pickTool('select'); select({type:'member', id:item.id});}}>
            <MoveUpRight size={12}/><b>{item.id}</b><span>{item.a} – {item.b}</span></button>)}
        </details>}
      </aside>}
      <div className="sp-viewport">
        <SpatialCanvas nodes={model.nodes} members={model.members} tool={tool} plane={plane} offset={offsets[plane]}
          snap={snap ? spacing : 0} start={start} selection={selection} onPoint={place} onSelect={select}
          onMemberPoint={placeOnMember} showGrid={showGrid} showNames={showNames}/>
      </div>
    </div>
    <footer className="sp-status"><span>{model.nodes.length} {model.nodes.length === 1 ? 'joint' : 'joints'} · {model.members.length} {model.members.length === 1 ? 'member' : 'members'}</span><span>3D geometry · Results uses the 2D model</span></footer>
  </section>;
}
