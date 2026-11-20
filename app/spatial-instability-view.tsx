import {useUnits} from './unit-context';
import {quantity,settingNumber} from './units';
import {CircleDot,GitBranch} from 'lucide-react';
import type {SpatialInstability} from './spatial-instability';
import type {SpatialModel} from './spatial-model';
import type {SpatialSelection} from './spatial-canvas';
import {ForceArrow,MomentArrow,magnitude} from './spatial-loads-view';
import type {Project3D} from './spatial-loads-view';

type Pick=NonNullable<SpatialSelection>;
const motionColour='#a63662';
const axisColour='#006b75';

export function InstabilityEvidence({diagnostic}:{diagnostic:SpatialInstability}){
  const units=useUnits(),moment=quantity(units,'moment');
  return <>
    <strong>{diagnostic.title}</strong>
    <p>{diagnostic.detail}</p>
    {diagnostic.axisMoment!==undefined&&diagnostic.supportAxis&&<p>
      Applied moment about {diagnostic.supportAxis.join(' → ')}: <b>{settingNumber(diagnostic.axisMoment/moment.factor,units,false)} {moment.unit}</b>
    </p>}
    <p>{diagnostic.guidance}</p>
  </>;
}

export function InstabilityPicks({diagnostic,onInspect}:{diagnostic:SpatialInstability;onInspect:(pick:Pick)=>void}){
  const groups:{label:string;type:Pick['type'];ids:string[]}[]=[
    {label:'Moving joints',type:'node',ids:[...new Set(diagnostic.motions.map(m=>m.node))]},
    {label:'Members in this motion',type:'member',ids:diagnostic.members}
  ];
  if(diagnostic.supportAxis)groups.unshift({label:'Supports on the rotation axis',type:'node',ids:diagnostic.supportAxis});
  return <details className="sr-mode-picks"><summary>Inspect joints and members</summary>
    {groups.filter(group=>group.ids.length).map(group=><div key={group.label}><strong>{group.label}</strong>
      <div className="sr-mode-ids">{group.ids.map(id=><button key={id} onClick={()=>onInspect({type:group.type,id})}
        aria-label={'Inspect '+(group.type==='member'?'member ':'joint ')+id}>{group.type==='member'?<GitBranch size={12}/>:<CircleDot size={12}/>} {id}</button>)}</div>
    </div>)}
  </details>;
}

export function InstabilityOverlay({model,diagnostic,project,selected}:{model:SpatialModel;diagnostic:SpatialInstability;project:Project3D;selected:SpatialSelection}){
  const nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const involved=new Set(diagnostic.members);
  const supportA=diagnostic.supportAxis&&nodes.get(diagnostic.supportAxis[0]);
  const supportB=diagnostic.supportAxis&&nodes.get(diagnostic.supportAxis[1]);
  const axisA=supportA&&project(supportA),axisB=supportB&&project(supportB);
  return <g aria-label="Possible unrestrained motion" pointerEvents="none">
    {model.members.filter(m=>involved.has(m.id)).map(member=>{
      const start=nodes.get(member.a),end=nodes.get(member.b);if(!start||!end)return null;
      const a=project(start),b=project(end);
      return <line key={member.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={motionColour} strokeWidth="6" opacity=".28"/>;
    })}
    {axisA&&axisB&&<g stroke={axisColour} fill="none" aria-label={'Rotation axis through '+supportA!.id+' and '+supportB!.id}>
      <line x1={axisA.x} y1={axisA.y} x2={axisB.x} y2={axisB.y} strokeDasharray="6 4" strokeWidth="2"/>
      <circle cx={axisA.x} cy={axisA.y} r="6"/><circle cx={axisB.x} cy={axisB.y} r="6"/>
      {Math.hypot(axisA.x-axisB.x,axisA.y-axisB.y)>85&&<text className="sr-svg-value" style={{fill:axisColour}}
        x={(axisA.x+axisB.x)/2} y={(axisA.y+axisB.y)/2-6} textAnchor="middle">Rotation axis</text>}
    </g>}
    {diagnostic.motions.map(({node,vector},index)=>{
      const position=nodes.get(node);if(!position)return null;
      const at=project(position),chosen=selected?.type==='node'&&selected.id===node;
      const primary=node===diagnostic.primaryNode,label=primary||chosen?node:undefined;
      return <g key={node} data-motion-node={node}>
        <circle cx={at.x} cy={at.y} r={primary||chosen?7:4.5} fill="none" stroke={motionColour} strokeWidth={primary||chosen?2.2:1.4}/>
        {(index<8||chosen)&& (diagnostic.kind==='rotation'?
          <MomentArrow project={project} position={position} vector={vector} pixels={20} labelShift={-3} color={motionColour} text={label}/>:
          <ForceArrow project={project} position={position} vector={vector} reaction pixels={Math.max(14,40*magnitude(vector))}
            color={motionColour} text={label}/>)}
      </g>;
    })}
  </g>;
}
