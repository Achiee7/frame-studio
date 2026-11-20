import {useUnits} from './unit-context';
import {quantity,settingNumber} from './units';
import type {SpatialModel,Vec3} from './spatial-model';
import type {SpatialResult} from './spatial-analysis';
import type {ScreenPoint} from './spatial-projection';

export type Project3D=(point:Vec3)=>ScreenPoint;
const axes=['x','y','z'] as const;
const origin={x:0,y:0,z:0};
const unitAxes={x:{x:1,y:0,z:0},y:{x:0,y:1,z:0},z:{x:0,y:0,z:1}};
const arrowBlue='#345fa1',loadOrange='#ba5f22';
export const magnitude=(v:Vec3)=>Math.hypot(v.x,v.y,v.z);
export const addScaled=(a:Vec3,b:Vec3,k:number)=>({x:a.x+b.x*k,y:a.y+b.y*k,z:a.z+b.z*k});
function cross(a:Vec3,b:Vec3){return {x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x};}
const unit=(a:Vec3)=>addScaled(origin,a,1/(magnitude(a)||1));
function lerp(a:Vec3,b:Vec3,t:number){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};}
function arrowHead(tip:ScreenPoint,direction:ScreenPoint,color:string) {
  const scale=1/(Math.hypot(direction.x,direction.y)||1),ux=direction.x*scale,uy=direction.y*scale;
  const bx=tip.x-7*ux,by=tip.y-7*uy;
  return <polygon fill={color} stroke="none" points={`${tip.x},${tip.y} ${bx-3*uy},${by+3*ux} ${bx+3*uy},${by-3*ux}`}/>;
}
type ArrowProps={project:Project3D;position:Vec3;vector:Vec3;text?:string;color:string;reaction?:boolean;pixels?:number;labelShift?:number};

/** Orthographic world-to-screen scale stays the same for all three axes. */
function projectionScale(project:Project3D){
  const o=project(origin);
  const scales=axes.map(axis=>{const p=project(unitAxes[axis]);return (p.x-o.x)**2+(p.y-o.y)**2;});
  return Math.sqrt((scales[0]+scales[1]+scales[2])/2)||1;
}
function facesViewer(project:Project3D,vector:Vec3){
  const o=project(origin),p=axes.map(axis=>project(unitAxes[axis]));
  const tangent={x:p[0].x-o.x,y:p[1].x-o.x,z:p[2].x-o.x};
  const up={x:o.y-p[0].y,y:o.y-p[1].y,z:o.y-p[2].y};
  const toward=cross(tangent,up);
  return toward.x*vector.x+toward.y*vector.y+toward.z*vector.z>0;
}
function arrowEnds({project,position,vector,reaction,pixels=40}:ArrowProps){
  const o=project(position),end=project(addScaled(position,unit(vector),pixels/projectionScale(project)));
  const direction={x:end.x-o.x,y:end.y-o.y};
  const tail=reaction?o:{x:o.x-direction.x,y:o.y-direction.y};
  const tip=reaction?end:o;
  return {o,direction,tip,tail};
}
export function ForceArrow(props:ArrowProps){
  const {color,text,reaction,labelShift=0}=props;
  const {o,direction,tip,tail}=arrowEnds(props);
  if(magnitude(props.vector)===0)return null;
  const edge=reaction?tip:tail,side=direction.x*(reaction?1:-1)<0?-1:1;
  return <g pointerEvents="none">
    {Math.hypot(direction.x,direction.y)<3?
      <g><circle cx={o.x} cy={o.y} r="4.7" fill="white" stroke={color} strokeWidth="1.5"/>
        {facesViewer(props.project,props.vector)?<circle cx={o.x} cy={o.y} r="1.7" fill={color}/>:
          <path d={`M${o.x-2.6} ${o.y-2.6}l5.2 5.2m0 -5.2l-5.2 5.2`} stroke={color} strokeWidth="1.2"/>}</g>:
      <><path d={`M${tail.x} ${tail.y} L${tip.x} ${tip.y}`} fill="none" stroke={color} strokeWidth="1.8"/>{arrowHead(tip,direction,color)}</>}
    {text&&<text className="sr-svg-value" style={{fill:color}} x={edge.x+side*5} y={edge.y-4+labelShift} textAnchor={side<0?'end':'start'}>{text}</text>}
  </g>;
}
export function MomentArrow({project,position,vector,text,color,labelShift=0,pixels=20}:ArrowProps){
  if(magnitude(vector)===0)return null;
  const n=unit(vector),u=unit(cross(Math.abs(n.z)<.85?unitAxes.z:unitAxes.x,n)),v=cross(n,u);
  const scale=pixels/projectionScale(project);
  const points=Array.from({length:25},(_,i)=>{
    const angle=-Math.PI*.42+i/24*Math.PI*1.63;
    return project(addScaled(addScaled(position,u,scale*Math.cos(angle)),v,scale*Math.sin(angle)));
  });
  const tip=points[24],before=points[22];
  const label=points.reduce((a,b)=>a.y<b.y?a:b);
  return <g pointerEvents="none"><polyline points={points.map(p=>p.x+','+p.y).join(' ')} stroke={color} strokeWidth="1.7" fill="none"/>
    {arrowHead(tip,{x:tip.x-before.x,y:tip.y-before.y},color)}
    {text&&<text className="sr-svg-value" style={{fill:color}} x={label.x+5} y={label.y-5+labelShift}>{text}</text>}
  </g>;
}

export function SpatialStationAxes({project,position,member,showAxes}:{
  project:Project3D;position:Vec3;member:SpatialResult['members'][number];showAxes:boolean;
}){
  const o=project(position),scale=25/projectionScale(project);
  const directions=[{key:'x',axis:member.localX,color:'#a86046'},{key:'y',axis:member.localY,color:'#3a8050'},{key:'z',axis:member.localZ,color:'#4774a6'}];
  return <g pointerEvents="none" aria-label={'Inspection station on '+member.id}>
    {showAxes&&directions.map(({key,axis,color})=>{
      const end=project(addScaled(position,axis,scale)),d={x:end.x-o.x,y:end.y-o.y};
      if(Math.hypot(d.x,d.y)<3)return null;
      return <g key={key}><path d={`M${o.x} ${o.y}L${end.x} ${end.y}`} fill="none" stroke={color} strokeWidth="1.4"/>
        {arrowHead(end,d,color)}<text className="sr-svg-value" x={end.x+(d.x<0?-3:3)} y={end.y-2} textAnchor={d.x<0?'end':'start'} style={{fill:color}}>{key}</text></g>;
    })}
    <circle cx={o.x} cy={o.y} r="4" fill="white" stroke="#466451" strokeWidth="2"/>
  </g>;
}

export function SpatialLoadOverlay({model,project,labels=true}:{model:SpatialModel;project:Project3D;labels?:boolean}){
  const units=useUnits(),nodes=new Map(model.nodes.map(n=>[n.id,n])),members=new Map(model.members.map(m=>[m.id,m]));
  return <g pointerEvents="none" aria-label="Applied 3D loads">{(model.loads??[]).map(load=>{
    const member=load.target==='member'?members.get(load.targetId):undefined;
    const a=nodes.get(member?.a??load.targetId),b=member?nodes.get(member.b):a;
    if(!a||!b||magnitude(load.vector)===0)return null;
    const q=quantity(units,load.kind==='distributed'?'distributed':load.kind==='moment'?'moment':'force');
    const text=labels?load.id+' · '+settingNumber(magnitude(load.vector)/q.factor,units,false)+' '+q.unit:undefined;
    const props={project,position:member?lerp(a,b,load.t):a,vector:load.vector,color:loadOrange,text};
    if(load.kind==='moment')return <MomentArrow key={load.id} {...props}/>;
    if(load.kind==='distributed'){
      const distribution={...props,pixels:30};
      const stations=[0,.167,.333,.5,.667,.833,1];
      const first=arrowEnds({...distribution,position:a}).tail,last=arrowEnds({...distribution,position:b}).tail;
      return <g key={load.id}><title>{load.id} · uniform load on {load.targetId}</title>
        <line x1={first.x} y1={first.y} x2={last.x} y2={last.y} stroke={loadOrange} opacity=".8"/>
        {stations.map(t=><ForceArrow key={t} {...distribution} position={lerp(a,b,t)} text={t===.5?text:undefined}/>)}
      </g>;
    }
    return <ForceArrow key={load.id} {...props}/>;
  })}</g>;
}

export function SpatialReactionOverlay({model,result,project,labels}:{model:SpatialModel;result:SpatialResult;project:Project3D;labels:boolean}){
  const units=useUnits(),nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const f=quantity(units,'force'),m=quantity(units,'moment');
  const maxForce=Math.max(0,...result.reactions.map(r=>magnitude(r.force))),maxMoment=Math.max(0,...result.reactions.map(r=>magnitude(r.moment)));
  return <g pointerEvents="none" aria-label="3D support reactions">{result.reactions.map(r=>{
    const position=nodes.get(r.id);if(!position)return null;
    return <g key={r.id}>{axes.map((axis,index)=>{
      const force=r.force[axis],moment=r.moment[axis];
      return <g key={axis}>
        {Math.abs(force)>maxForce*1e-10&&<ForceArrow project={project} position={position} vector={{...origin,[axis]:force}} color={arrowBlue} reaction
          text={labels?'R'+axis+' '+settingNumber(force/f.factor,units,false)+' '+f.unit:undefined}/>}
        {Math.abs(moment)>maxMoment*1e-10&&<MomentArrow project={project} position={position} vector={{...origin,[axis]:moment}} color={arrowBlue} pixels={15+index*4} labelShift={-index*8}
          text={labels?'M'+axis+' '+settingNumber(moment/m.factor,units,false)+' '+m.unit:undefined}/>}
      </g>;
    })}</g>;
  })}</g>;
}
