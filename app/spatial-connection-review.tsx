import {useEffect,useRef,useState} from 'react';
import {Check,ChevronRight,Link2,X} from 'lucide-react';
import type {Joint} from './model';
import type {SpatialModel} from './spatial-model';
import {connectSpatialCandidate} from './spatial-connections';
import type {auditSpatialConnections,SpatialConnectionCandidate} from './spatial-connections';
import {useUnits} from './unit-context';
import {lengthUnits,settingNumber} from './units';
import './spatial-connection-review.css';

type ReviewProps={
  model:SpatialModel;
  audit:ReturnType<typeof auditSpatialConnections>;
  focusId?:string;
  onChange:(model:SpatialModel)=>void;
  onClose:()=>void;
  onInspect:(pick:{type:'member'|'node';id:string})=>void;
};

const jointName:Record<Joint,string>={rigid:'Rigid joint',pin:'Pin',hinge:'Internal hinge'};
const effect:Record<Joint,string>={
  rigid:'All attached beam ends share rotation.',
  pin:'Each continuous beam keeps its own rotation through the pin.',
  hinge:'Each attached beam end can rotate independently.'
};

function Candidate({issue,onConnect,focused}:{
  issue:SpatialConnectionCandidate;
  onConnect:(issue:SpatialConnectionCandidate,joint:Joint)=>void;
  focused:boolean;
}){
  const units=useUnits(),unit=units.length;
  const [joint,setJoint]=useState<Joint|''>('');
  const measure=(n:number)=>settingNumber(n/lengthUnits[unit],units,false);
  const near=issue.kind==='nearNodes';
  const elements=near?issue.nodes:issue.kind==='crossing'?issue.members:[...issue.nodes,...issue.members];
  const title=elements.join(near?' ↔ ':' · ');
  const label=near?'Nearby joints':issue.kind==='crossing'?'Crossing members':'Joint on member';
  return <article className="sc-candidate" aria-label={title}>
    <div className="sc-description"><strong>{title}</strong><span>{label}{near?' · gap '+measure(issue.gap)+' '+unit:''}</span></div>
    <div className="sc-location">{near&&<b>Merge at {issue.nodes[0]}</b>}{(['x','y','z'] as const).map(axis=><span key={axis}>{axis.toUpperCase()} {measure(issue.point[axis])}</span>)}<span>{unit}</span></div>
    <div className="sc-connect-controls">
      <select data-focus-connection={focused?'true':undefined} aria-label={'Connection type for '+title} value={joint} onChange={e=>setJoint(e.target.value as Joint|'')}>
        <option value="">Choose connection…</option>
        {(['rigid','pin','hinge'] as const).map(type=><option key={type} value={type}>{jointName[type]}</option>)}
      </select>
      <button className="primary" disabled={!joint} onClick={()=>{if(joint)onConnect(issue,joint);}}><Link2 size={14}/>Connect</button>
    </div>
    {joint&&<small>{effect[joint]}</small>}
  </article>;
}

export default function SpatialConnectionReview({model,audit,focusId,onChange,onClose,onInspect}:ReviewProps){
  const dialog=useRef<HTMLDialogElement>(null);
  const [notice,setNotice]=useState(''),[error,setError]=useState('');
  const nodes=new Map(model.nodes.map(n=>[n.id,n]));
  useEffect(()=>{
    const el=dialog.current!;
    el.showModal();
    el.querySelector<HTMLSelectElement>('[data-focus-connection]')?.focus();
    return ()=>el.close();
  },[]);
  function connect(issue:SpatialConnectionCandidate,joint:Joint){
    try{
      const result=connectSpatialCandidate(model,issue,joint);
      onChange(result.model);setError('');
      setNotice('Connected at '+result.node.id+' · '+jointName[joint]);
    }catch(err){setError(err instanceof Error?err.message:'This connection could not be applied.');setNotice('');}
  }
  return <dialog ref={dialog} className="modal sc-review" role="dialog" aria-labelledby="sc-review-heading"
    onCancel={e=>{e.preventDefault();onClose();}}>
    <header className="modal-head"><h2 id="sc-review-heading">3D connections</h2>
      <button type="button" aria-label="Close connections" onClick={onClose}><X size={19}/></button></header>
    <div className="sc-content">
      {notice&&<p className="sc-confirmation" role="status"><Check size={15}/>{notice}</p>}
      {error&&<p className="sc-error" role="alert">{error}</p>}
      {audit.candidates.length>0?<section><h3>Possible connections <small>{audit.candidates.length}</small></h3>
        {audit.candidates.map(issue=><Candidate key={issue.id} issue={issue} onConnect={connect} focused={issue.id===focusId}/>)}
      </section>:<p className="sc-no-candidates"><Check size={15}/>No connection candidates found.</p>}
      {audit.isolated.length>0&&<section><h3>Isolated joints <small>{audit.isolated.length}</small></h3>
        <p>Choose a joint to inspect its position or draw a member to it.</p>
        <div className="sc-joint-picks">{audit.isolated.map(id=><button key={id} onClick={()=>onInspect({type:'node',id})}>{id}<ChevronRight size={14}/></button>)}</div>
      </section>}
      {audit.components.length>1&&<section><h3>Separate frame groups <small>{audit.components.length}</small></h3>
        <p>Members in different groups have no shared joint. Select a member to inspect it.</p>
        {audit.components.map(group=><div key={group.members[0]} className="sc-group">
          <div className="sc-joint-picks">{group.members.map(id=><button key={id} onClick={()=>onInspect({type:'member',id})}>{id}<ChevronRight size={13}/></button>)}</div>
        </div>)}
      </section>}
      {audit.joined.length>0&&<details className="sc-existing"><summary>Connected joints <small>{audit.joined.length}</small></summary>
        {audit.joined.map(item=><button className="sc-existing-joint" key={item.node} onClick={()=>onInspect({type:'node',id:item.node})}>
          <b>{item.node}</b><span>{jointName[nodes.get(item.node)!.joint]} · {item.members.join(', ')}</span><ChevronRight size={15}/></button>)}
      </details>}
    </div>
  </dialog>;
}
