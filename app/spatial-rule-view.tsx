import {useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import type {SpatialModel,Vec3} from './spatial-model';
import {isSpatialDimension,spatialRuleValue} from './spatial-sketch';
import type {SpatialRule} from './spatial-sketch';
import {actionLabel} from './sketch-actions';
import {useUnits} from './unit-context';
import {lengthUnits,settingNumber} from './units';

type P={x:number;y:number};
type Project=(p:Vec3)=>P;
type RuleLayerProps={
  model:SpatialModel; project:Project; dimensions:boolean; constraints:boolean;
  onOpen:(rule:SpatialRule,at:P)=>void;onMove:(rule:SpatialRule,offset:P)=>void
};
const origin:Vec3={x:0,y:0,z:0};
const axisNames={dx:'x',dy:'y',dz:'z'} as const;
const symbols={alongX:'∥ X',alongY:'∥ Y',alongZ:'∥ Z',connect:'⊙',equal:'=',parallel:'∥',perpendicular:'⊥',collinear:'Collinear',pointOnMember:'⊙',midpoint:'◇'};
const dx=(a:Vec3,b:Vec3):Vec3=>({x:b.x-a.x,y:b.y-a.y,z:b.z-a.z});
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const along=(a:Vec3,v:Vec3,k:number):Vec3=>({x:a.x+k*v.x,y:a.y+k*v.y,z:a.z+k*v.z});
const midway=(a:P,b:P):P=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const shift=(p:P,v:P):P=>({x:p.x+v.x,y:p.y+v.y});
const line=(a:P,b:P)=>`M${a.x} ${a.y}L${b.x} ${b.y}`;
type Layout={a:P;b:P; extra:string; arc?:P[]; anchor:P; normal:P};
function layout(rule:SpatialRule, points:Vec3[], project:Project):Layout {
  const [p,q,r,s]=points;
  let a=project(p),b=project(q),extra='';
  let arc:P[]|undefined,anchor:P|undefined;
  const kind=rule.kind;
  if(kind==='dx'||kind==='dy'||kind==='dz'){
    const axis=axisNames[kind];
    b=project({...p,[axis]:q[axis]});extra=line(b,project(q));
  } else if(kind==='offset'){
    const v=dx(p,q),foot=along(p,v,dot(dx(p,r),v)/Math.max(dot(v,v),1e-24));
    a=project(foot);b=project(r);
    const t=dot(dx(p,r),v)/Math.max(dot(v,v),1e-24);
    if(t<0||t>1)extra=line(project(t<0?p:q),a);
  } else if(kind==='angle'){
    // For skew members, the angle is defined by their directions at a common origin.
    const v=dx(p,q),w=dx(r,s),lv=Math.sqrt(dot(v,v)),lw=Math.sqrt(dot(w,w));
    const u=along(origin,v,1/lv),v2=along(origin,w,1/lw);
    const cosine=Math.max(-1,Math.min(1,dot(u,v2)));
    const n=along(v2,u,-cosine),sine=Math.sqrt(dot(n,n));
    const radius=Math.min(lv,lw)*.28;
    if(sine>1e-8){
      const theta=Math.atan2(sine,cosine);
      arc=Array.from({length:25},(_,i)=>project(along(along(p,u,radius*Math.cos(theta*i/24)),n,radius*Math.sin(theta*i/24)/sine)));
      extra=line(project(p),arc[0])+line(project(p),arc[24]);anchor=arc[12];
    }else anchor=project(along(p,u,radius));
  } else if(kind==='pointOnMember'||kind==='midpoint')anchor=project(r);
  else if(s)anchor=midway(midway(a,b),midway(project(r),project(s)));
  const len=Math.hypot(b.x-a.x,b.y-a.y);
  const normal=len>.1?{x:(b.y-a.y)/len,y:-(b.x-a.x)/len}:{x:0,y:-1};
  if(normal.y>.25){normal.x*=-1;normal.y*=-1;}
  return {a,b,extra,arc,anchor:anchor??midway(a,b),normal};
}

function Annotation({rule,shape,text,lane,onOpen,onMove}:{rule:SpatialRule;shape:Layout;text:string;lane:number}&Pick<RuleLayerProps,'onOpen'|'onMove'>) {
  const drag=useRef<{start:P;initial:P;moved:boolean}|null>(null);
  const [preview,setPreview]=useState<P|null>(null);
  const dimension=isSpatialDimension(rule.kind),linear=dimension&&rule.kind!=='angle';
  const offset=preview??rule.labelOffset??{x:0,y:0};
  const base=linear?{x:shape.normal.x*(24+lane*17),y:shape.normal.y*(24+lane*17)}:{x:12,y:16+lane*19};
  const displacement=shift(base,offset),label=shift(shape.anchor,displacement);
  const from=shift(shape.a,displacement),to=shift(shape.b,displacement);
  const width=Math.max(23,Math.min(215,text.length*6.3+12));
  const color=rule.suppressed?'#8d9792':dimension?'#4c63a0':'#76588b';
  function end(e:ReactPointerEvent<SVGGElement>){
    e.stopPropagation();const d=drag.current;drag.current=null;setPreview(null);
    if(!d)return;
    if(d.moved)onMove(rule,{x:Math.min(10000,Math.max(-10000,d.initial.x+e.clientX-d.start.x)),y:Math.min(10000,Math.max(-10000,d.initial.y+e.clientY-d.start.y))});
    else onOpen(rule,{x:e.clientX,y:e.clientY});
  }
  return <g>
    <g pointerEvents="none" fill="none" stroke={color} strokeWidth=".85" opacity={rule.suppressed ? .45 : .75}>
      {shape.extra&&<path d={shape.extra} strokeDasharray="3 3"/>}
      {linear&&<>
        <path d={line(shape.a,from)+line(shape.b,to)} strokeDasharray="2 3"/>
        <path d={line(from,to)}/>
        {[from,to].map((p,i)=><path key={i} d={`M${p.x-3} ${p.y+4}l6 -8`}/>)}
      </>}
      {shape.arc&&<polyline points={shape.arc.map(p=>p.x+','+p.y).join(' ')}/>}
      {!linear&&<path d={line(shape.anchor,label)} strokeDasharray="2 3"/>}
    </g>
    <g data-spatial-rule={rule.id} className="spatial-rule-label" role="button" tabIndex={0}
      aria-label={rule.id+' '+actionLabel(rule.kind,'3D',rule.refs.length===1)+' '+text}
      onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
        drag.current={start:{x:e.clientX,y:e.clientY},initial:offset,moved:false};}}
      onPointerMove={e=>{const d=drag.current;if(!d)return;e.stopPropagation();const x=e.clientX-d.start.x,y=e.clientY-d.start.y;
        if(Math.hypot(x,y)>3)d.moved=true;if(d.moved)setPreview({x:d.initial.x+x,y:d.initial.y+y});}}
      onPointerUp={end} onPointerCancel={e=>{e.stopPropagation();drag.current=null;setPreview(null);}}
      onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){
        e.preventDefault();e.stopPropagation();const box=e.currentTarget.getBoundingClientRect();onOpen(rule,{x:box.right,y:box.top});}}}>
      <title>{actionLabel(rule.kind,'3D',rule.refs.length===1)} · click to edit, drag to reposition</title>
      <rect x={label.x-width/2} y={label.y-9} width={width} height="18" rx="4" fill={dimension?'#fafbff':'#faf6fd'} stroke={color} strokeOpacity=".45" strokeDasharray={rule.suppressed?'3 2':undefined}/>
      <text x={label.x} y={label.y+3} textAnchor="middle" style={{stroke:'none',fill:color,textDecoration:rule.suppressed?'line-through':undefined}}>{text}</text>
    </g>
  </g>;
}
export function SpatialRuleLayer({model,project,dimensions,constraints,onOpen,onMove}:RuleLayerProps) {
  const units=useUnits(),byId=new Map<string,Vec3>(model.nodes.map(n=>[n.id,n]));
  byId.set('@origin',origin);
  const lanes=new Map<string,number>();
  return <g aria-label="3D sketch annotations">{(model.rules??[]).map(rule=>{
    const dim=isSpatialDimension(rule.kind);
    if(dim?!dimensions:!constraints)return null;
    const shape=layout(rule,rule.points.map(id=>byId.get(id)!),project);
    const key=Math.round(shape.anchor.x/15)+','+Math.round(shape.anchor.y/15);
    const lane=lanes.get(key)??0;lanes.set(key,lane+1);
    const angle=rule.kind==='angle';
    const prefix=rule.kind==='dx'?'ΔX ':rule.kind==='dy'?'ΔY ':rule.kind==='dz'?'ΔZ ':'';
    const value=dim?prefix+settingNumber(spatialRuleValue(model,rule)/(angle?1:lengthUnits[units.length]),units,false)+(angle?'°':' '+units.length):symbols[rule.kind as keyof typeof symbols];
    const text=rule.driven?'('+value+')':value;
    return <Annotation key={rule.id} rule={rule} shape={shape} text={text} lane={lane} onOpen={onOpen} onMove={onMove}/>;
  })}</g>;
}
