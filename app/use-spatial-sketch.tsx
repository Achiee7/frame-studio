import {useState} from 'react';
import {Trash2} from 'lucide-react';
import {useUnits} from './unit-context';
import {inputNumber,lengthUnits,parseNumber,settingNumber} from './units';
import {actionLabel,availableActions,samePick,spatialCommandSelection,toggleGeometry} from './sketch-actions';
import type {ActionMode,GeometryPick,SketchAction} from './sketch-actions';
import {createSpatialRule,editSpatialRule,isSpatialDimension,removeSpatialRule,spatialMeasurement,
  spatialRuleTouchesMember,spatialRuleValue,suppressSpatialRule} from './spatial-sketch';
import type {SpatialRule} from './spatial-sketch';
import type {SpatialModel} from './spatial-model';
import {SketchActionMenu,SketchPopover} from './sketch-popover';
import type {CursorPosition} from './sketch-popover';

type Picking={model:SpatialModel;at:CursorPosition;picks:GeometryPick[];mode:ActionMode;requested?:SketchAction;error?:string};
type Editing={model:SpatialModel;at:CursorPosition;picks:GeometryPick[];action:SketchAction;requested?:SketchAction;rule?:SpatialRule};
const pickName=(p:GeometryPick)=>p.id==='@origin'?'Origin':p.id;
function valueText(rule:SpatialRule,model:SpatialModel,units:ReturnType<typeof useUnits>) {
  const angle=rule.kind==='angle';
  return settingNumber(spatialRuleValue(model,rule)/(angle?1:lengthUnits[units.length]),units,false)+(angle?'°':' '+units.length);
}
function RuleEditor({edit,model,onChange,onClose}:{edit:Editing;model:SpatialModel;onChange:(m:SpatialModel,feedback?:string)=>void;onClose:()=>void}) {
  const units=useUnits(),{action,rule,picks}=edit;
  const dim=isSpatialDimension(action),angle=action==='angle',factor=angle?1:lengthUnits[units.length];
  const measure=dim?(rule?spatialRuleValue(model,rule):spatialMeasurement(model,action,picks)):0;
  const [value,setValue]=useState(()=>inputNumber((rule&&!rule.driven?rule.value??measure:measure)/factor));
  const [reference,setReference]=useState(!!rule?.driven),[error,setError]=useState('');
  function commit(editModel:()=>SpatialModel,requestedDriving=false){
    try{
      const next=editModel();
      const revised=rule?next.rules?.find(r=>r.id===rule.id):next.rules?.at(-1);
      onChange(next,requestedDriving&&revised?.driven?'Other driving relations already determine this measurement. Saved as a reference.':undefined);
    }catch(err){setError((err as Error).message);}
  }
  return <SketchPopover at={edit.at} title={dim?'Edit dimension':'Edit constraint'}
    caption={[rule?.id,actionLabel(action,'3D',picks.length===1),picks.map(pickName).join(' + ')].filter(Boolean).join(' · ')} onClose={onClose}>
    {dim && <form className="sketch-value-form" onSubmit={e=>{
      e.preventDefault();
      const n=reference?measure:parseNumber(value)*factor;
      if(!Number.isFinite(n)){setError('Enter a finite dimension.');return;}
      commit(()=>rule?editSpatialRule(model,rule.id,n,reference):createSpatialRule(model,action,picks,n,reference),!reference);
    }}>
      <label><span>{angle?'Angle':'Distance'} ({angle?'°':units.length})</span>
        <input autoFocus type="text" inputMode="decimal" aria-label="Dimension value" value={reference?inputNumber(measure/factor):value}
          readOnly={reference} onFocus={e=>e.target.select()} onChange={e=>setValue(e.target.value)}/></label>
      <label className="sketch-check"><input type="checkbox" checked={reference} onChange={e=>setReference(e.target.checked)}/>Reference dimension</label>
      <button type="submit">{rule?.suppressed?'Apply and enable':'Apply dimension'}</button>
    </form>}
    {rule && <div className="sketch-edit-actions">
      {!rule.driven&&<button onClick={()=>commit(()=>suppressSpatialRule(model,rule.id,!rule.suppressed))}>{rule.suppressed?'Re-enable':'Suppress'}</button>}
      <button className="remove" onClick={()=>commit(()=>removeSpatialRule(model,rule.id))}><Trash2 size={13}/>Remove</button>
    </div>}
    {error&&<p className="sketch-pick-error" role="alert">{error}</p>}
  </SketchPopover>;
}

export function useSpatialSketch(model:SpatialModel,onChange:(m:SpatialModel)=>void) {
  const units=useUnits();
  const [pending,setPending]=useState<Picking|null>(null),[editing,setEditing]=useState<Editing|null>(null);
  const [feedback,setFeedback]=useState('');
  const current=pending?.model===model?pending:null,edit=editing?.model===model?editing:null;
  const reset=()=>{setPending(null);setEditing(null);setFeedback('');};
  function inspect(rule:SpatialRule,at:CursorPosition){
    setPending(null);setFeedback('');
    setEditing({model,at,picks:rule.refs,action:rule.kind,rule});
  }
  function commit(m:SpatialModel,message?:string,requested=edit?.requested,at=edit?.at){
    onChange(m);setEditing(null);setFeedback(message??'');
    setPending(requested&&at?{model:m,at,picks:[],requested,mode:isSpatialDimension(requested)?'dimension':'constraint'}:null);
  }
  function applyAction(selection:Picking,action:SketchAction){
    if(isSpatialDimension(action)){
      setEditing({model,at:selection.at,picks:selection.picks,action,requested:selection.requested});setPending(null);
      return;
    }
    try{commit(createSpatialRule(model,action,selection.picks),undefined,selection.requested,selection.at);}
    catch(err){const message=(err as Error).message;setFeedback(message);setPending({...selection,error:message});}
  }
  function runCommand(requested:SketchAction,picks:GeometryPick[],at:CursorPosition){
    const mode=isSpatialDimension(requested)?'dimension':'constraint';
    const resolved=spatialCommandSelection(requested,mode,picks,model.members);
    const selection={model,requested,at,mode,picks:resolved.picks} satisfies Picking;
    if(resolved.complete)applyAction(selection,resolved.action);
    else{setPending(selection);setFeedback(resolved.error);}
  }
  function startAction(action:SketchAction,base:GeometryPick|null,at:CursorPosition){
    setEditing(null);setFeedback('');
    const picks=current?.picks.length?current.picks:base?[base]:[];
    runCommand(action,picks,at);
  }
  function select(picked:GeometryPick|null,at:CursorPosition,mode:ActionMode,base:GeometryPick|null,shortcut:boolean){
    setEditing(null);setFeedback('');
    const requested=shortcut?undefined:current?.requested;
    if(!picked){
      setPending(requested?{model,at,picks:[],mode,requested}:null);
      return;
    }
    const initial=current?.picks??(base&&!samePick(base,picked)?[base]:[]);
    const picks=toggleGeometry(initial,picked);
    if(requested)runCommand(requested,picks,at);
    else setPending(picks.length?{picks,at,mode,model}:null);
  }
  const actions=current?availableActions('3D',current.mode,current.picks,model.members).filter(id=>
    current.mode==='dimension'||!model.rules?.some(r=>r.kind===id && !r.suppressed &&
      r.refs.length===current.picks.length && r.refs.every(ref=>!ref.segments?.length && current.picks.some(p=>samePick(ref,p))))):[];
  const menu=edit?<RuleEditor key={[edit.action,edit.rule?.id,edit.picks.map(pickName).join('/')].join('-')} edit={edit} model={model} onChange={commit} onClose={reset}/>:
    current&&!current.requested&&(current.picks.length===2||current.picks[0]?.type==='member')?<SketchActionMenu at={current.at} space="3D" mode={current.mode}
      picks={current.picks} describe={pickName} actions={actions} error={current.error} onAction={action=>applyAction(current,action)} onClose={reset}/>:null;
  function moveLabel(rule:SpatialRule,offset:CursorPosition){
    commit({...model,rules:model.rules?.map(r=>r.id===rule.id?{...r,labelOffset:offset}:r)});
  }
  function related(pick:GeometryPick){
    const rules=(model.rules??[]).filter(r=>pick.type==='member'?spatialRuleTouchesMember(model,r,pick.id):r.points.includes(pick.id));
    if(!rules.length)return null;
    return <details className="sp-related" open><summary>Sketch relations ({rules.length})</summary>
      {rules.map(rule=><button className="sp-row" key={rule.id} onClick={e=>{
        const box=e.currentTarget.getBoundingClientRect();inspect(rule,{x:e.clientX||box.right,y:e.clientY||box.top});
      }}><b>{rule.id}</b> {actionLabel(rule.kind,'3D',rule.refs.length===1)}<span>{isSpatialDimension(rule.kind)?valueText(rule,model,units):''}{rule.driven?' (ref.)':rule.suppressed?' (off)':''}</span></button>)}
    </details>;
  }
  return {select,startAction,activeAction:edit?.requested??current?.requested,inspect,moveLabel,related,reset,menu,feedback,picks:current?.picks??[]};
}
