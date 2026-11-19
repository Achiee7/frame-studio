import {validMaterial} from './materials.ts';
import type {MaterialSpec} from './materials.ts';
import {validUnits} from './units.ts';
import type {UnitSettings} from './units.ts';
import {validSection} from './sections.ts';
import type {SectionSpec} from './sections.ts';
import {validSpatialModel} from './spatial-model.ts';
import type {SpatialModel} from './spatial-model.ts';
export type Joint = 'rigid'|'pin'|'hinge';
export type Support = 'free'|'pinned'|'roller'|'rollerX'|'fixed'|'guided'|'spring';
export type Node = {id:string;x:number;y:number;joint:Joint;support:Support;spring?:number;settlement?:number};
export type MassProperties = {material?:string;reference?:string;mass?:number;density?:number;specimenLength?:number;ixx?:number;iyy?:number;izz?:number;ixy?:number;ixz?:number;iyz?:number};
export type Beam = {material?:MaterialSpec;section?:SectionSpec;massProperties?:MassProperties;id:string;a:string;b:string;family:string;kind:'beam'|'strut';profile:string;E:number;A:number;I:number;releaseA?:boolean;releaseB?:boolean};
export type Load = {normal?:1|-1;canReverse?:boolean;attachment?:'start'|'end';position?:{from:'start'|'end';distance:number;fixed?:boolean};id:string;beam:string;t:number;type:'force'|'moment'|'distributed';fx:number;fy:number;m:number;case:string};
export type GeometryConstraint = {suppressed?:boolean;id:string;type:'collinear'|'rightAngle';reference:string;target:string};
export type CadDimension = {id:string;kind:'length'|'aligned'|'horizontal'|'vertical'|'direction'|'angle'|'perpendicular';a:string;b:string;c?:string;d?:string;value:number;driving:boolean;sense?:1|-1;offset?:number};
export type SketchConstraint={suppressed?:boolean;scope?:'points'|'members';id:string;type:'horizontal'|'vertical'|'equal'|'parallel'|'perpendicular'|'collinear'|'coincident'|'pointOnMember'|'midpoint';a:string;b?:string;spanEnd?:string};
export const ORIGIN='@origin';
export function cadPoint(m:Model,id:string){return id===ORIGIN?{id:ORIGIN,x:0,y:0}:m.nodes.find(n=>n.id===id)!;}
export type Model = {spatial?:SpatialModel;units?:Partial<UnitSettings>;sketchConstraints?:SketchConstraint[];nodes:Node[];beams:Beam[];loads:Load[];constraints?:GeometryConstraint[];dimensions?:CadDimension[];dimensionAnchor?:string;dimensionUnits?:'m'|'mm'};
export const uid=()=>crypto.randomUUID().slice(0,8);
export const profiles=[{name:'HEA 120',A:25.3,I:606},{name:'HEA 160',A:38.8,I:1670},{name:'HEA 200',A:53.8,I:3692},{name:'IPE 200',A:28.5,I:1943},{name:'IPE 300',A:53.8,I:8356}]; // cm², cm⁴
export const beamDefaults={kind:'beam' as const,profile:'HEA 120',E:210000000,A:0.00253,I:0.00000606}; // kN, m
export function example(name='cross'):Model {
 if(name==='elevator')return elevatorDrawing();
 if(name==='empty')return {nodes:[],beams:[],loads:[]};
 if(name==='portal')return {nodes:[{id:'N1',x:0,y:0,joint:'rigid',support:'pinned'},{id:'N2',x:0,y:5,joint:'rigid',support:'free'},{id:'N3',x:5,y:5,joint:'rigid',support:'free'},{id:'N4',x:5,y:0,joint:'rigid',support:'pinned'}],beams:[{id:'B1',a:'N1',b:'N2',family:'B1',...beamDefaults},{id:'B2',a:'N2',b:'N3',family:'B2',...beamDefaults},{id:'B3',a:'N3',b:'N4',family:'B3',...beamDefaults}],loads:[{id:'L1',beam:'B2',t:.5,type:'distributed',fx:0,fy:-10,m:0,case:'G'}]};
 return {constraints:[{id:'C1',type:'collinear',reference:'B1',target:'B2'},{id:'C2',type:'collinear',reference:'B3',target:'B4'}],nodes:[{id:'N1',x:0,y:4,joint:'rigid',support:'pinned'},{id:'N2',x:8,y:0,joint:'rigid',support:'pinned'},{id:'N3',x:0,y:0,joint:'rigid',support:'pinned'},{id:'N4',x:8,y:4,joint:'rigid',support:'pinned'},{id:'N5',x:4,y:2,joint:'pin',support:'free'}],beams:[{id:'B1',a:'N1',b:'N5',family:'diagonalA',...beamDefaults},{id:'B2',a:'N5',b:'N2',family:'diagonalA',...beamDefaults},{id:'B3',a:'N3',b:'N5',family:'diagonalB',...beamDefaults},{id:'B4',a:'N5',b:'N4',family:'diagonalB',...beamDefaults}],loads:[{id:'L1',beam:'B4',t:.45,type:'force',fx:0,fy:-10,m:0,case:'Q'}]};
}
export function validModel(v:any):v is Model {
 const finite=(x:any)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<1e12;
 if(!v||!validUnits(v.units)||!Array.isArray(v.nodes)||!Array.isArray(v.beams)||!Array.isArray(v.loads)||v.nodes.length>150||v.beams.length>150||v.loads.length>300)return false;
 if(v.spatial!==undefined&&!validSpatialModel(v.spatial))return false;
 const ids=new Set(v.nodes.map((n:any)=>n.id));if(ids.size!==v.nodes.length)return false;
 const bids=new Set(v.beams.map((b:any)=>b.id));if(bids.size!==v.beams.length)return false;
 if(v.constraints!==undefined){if(!Array.isArray(v.constraints)||v.constraints.length>150)return false;try{constraintOrder(v);}catch{return false;}}
 if(!validSketchConstraints(v)||!validDimensions(v))return false;
 return v.nodes.every((n:any)=>typeof n.id==='string'&&n.id!==ORIGIN&&finite(n.x)&&finite(n.y)&&['rigid','pin','hinge'].includes(n.joint)&&['free','pinned','roller','rollerX','fixed','guided','spring'].includes(n.support)&&(!n.spring||finite(n.spring))&&(!n.settlement||finite(n.settlement)))&&v.beams.every((b:any)=>validMaterial(b.material)&&validSection(b.section)&&validMassProperties(b.section?.massProperties)&&validMassProperties(b.massProperties)&&typeof b.id==='string'&&typeof b.family==='string'&&typeof b.profile==='string'&&ids.has(b.a)&&ids.has(b.b)&&b.a!==b.b&&['beam','strut'].includes(b.kind)&&[b.E,b.A,b.I].every(x=>finite(x)&&x>0)&&Math.hypot(v.nodes.find((n:any)=>n.id===b.a).x-v.nodes.find((n:any)=>n.id===b.b).x,v.nodes.find((n:any)=>n.id===b.a).y-v.nodes.find((n:any)=>n.id===b.b).y)>1e-6)&&v.loads.every((l:any)=>typeof l.id==='string'&&(l.normal===undefined||l.normal===1||l.normal===-1)&&(l.canReverse===undefined||typeof l.canReverse==='boolean')&&bids.has(l.beam)&&finite(l.t)&&l.t>=0&&l.t<=1&&['force','moment','distributed'].includes(l.type)&&[l.fx,l.fy,l.m].every(finite)&&['G','Q','W'].includes(l.case)&&validLoadPosition(v,l))&&geometrySatisfied(v)&&sketchSatisfied(v);
}
export function project(p:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number}){const dx=b.x-a.x,dy=b.y-a.y;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return {x:a.x+t*dx,y:a.y+t*dy,t,d:Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)};}
export function crossings(m:Model){const out:{a:string;b:string;x:number;y:number;ta:number;tb:number}[]=[];for(let i=0;i<m.beams.length;i++)for(let j=i+1;j<m.beams.length;j++){const a=m.beams[i],b=m.beams[j];if([a.a,a.b].some(x=>[b.a,b.b].includes(x)))continue;const p=m.nodes.find(n=>n.id===a.a)!,q=m.nodes.find(n=>n.id===a.b)!,r=m.nodes.find(n=>n.id===b.a)!,s=m.nodes.find(n=>n.id===b.b)!;const dx=q.x-p.x,dy=q.y-p.y,ex=s.x-r.x,ey=s.y-r.y,den=dx*ey-dy*ex;if(Math.abs(den)<1e-9)continue;const ta=((r.x-p.x)*ey-(r.y-p.y)*ex)/den,tb=((r.x-p.x)*dy-(r.y-p.y)*dx)/den;if(ta>=-1e-7&&ta<=1+1e-7&&tb>=-1e-7&&tb<=1+1e-7)out.push({a:a.id,b:b.id,x:p.x+ta*dx,y:p.y+ta*dy,ta,tb});}return out;}
export function splitBeam(m:Model,id:string,t:number,nodeId:string){const b=m.beams.find(b=>b.id===id)!;if(t<1e-7||t>1-1e-7){const old=t<.5?b.a:b.b;if(old!==nodeId){m.beams.forEach(b=>{if(b.a===old)b.a=nodeId;if(b.b===old)b.b=nodeId;});m.nodes=m.nodes.filter(n=>n.id!==old);for(const d of m.dimensions??[]){if(d.a===old)d.a=nodeId;if(d.b===old)d.b=nodeId;if(d.c===old)d.c=nodeId;if(d.d===old)d.d=nodeId;}for(const c of m.sketchConstraints??[])remapSketchPoint(c,old,nodeId);m.sketchConstraints=m.sketchConstraints?.filter(c=>hasSketchReferences(m,c));if(m.dimensionAnchor===old)m.dimensionAnchor=nodeId;}return;}
 const right={...b,id:uid(),a:nodeId,releaseA:false}; const oldB=b.b; b.b=nodeId;right.b=oldB;b.releaseB=false;m.beams.push(right);
 if((m.sketchConstraints??[]).some(c=>c.a===id||c.b===id)||(m.constraints??[]).some(c=>c.reference===id||c.target===id)||(m.dimensions??[]).some(d=>[[d.a,d.b],[d.c,d.d]].some(([a,z])=>a===b.a&&z===oldB||a===oldB&&z===b.a)))m.constraints=[...(m.constraints??[]),{id:uid(),type:'collinear',reference:id,target:right.id}];
 // The original sketch span keeps its definition when an analysis member is split.
 for(const c of m.sketchConstraints??[])if(isMemberPointConstraint(c)&&c.b===id)c.spanEnd??=oldB;
 for(const l of [...m.loads])if(l.beam===id){if(l.type==='distributed')m.loads.push({...l,id:uid(),beam:right.id});else if(l.t>t){l.beam=right.id;l.t=(l.t-t)/(1-t);}else l.t/=t;}
 for(const l of m.loads)if(l.position){const member=m.beams.find(b=>b.id===l.beam)!,a=cadPoint(m,member.a),z=cadPoint(m,member.b),L=Math.hypot(z.x-a.x,z.y-a.y);l.position.distance=(l.position.from==='start'?l.t:1-l.t)*L;}
}
export function connectCrossing(m:Model,c:ReturnType<typeof crossings>[number]){const n={id:uid(),x:c.x,y:c.y,joint:'pin' as Joint,support:'free' as Support};m.nodes.push(n);splitBeam(m,c.a,c.ta,n.id);splitBeam(m,c.b,c.tb,n.id);return n.id;}

// Geometry constraints operate on the undeformed drawing only. The FE solver
// deliberately does not use them as kinematic restraints.
export function constraintOrder(m:Model):GeometryConstraint[]{
 const constraints=m.constraints??[],ids=new Set<string>(),targets=new Map<string,GeometryConstraint>();
 for(const c of constraints){
  if(!c||typeof c.id!=='string'||ids.has(c.id)||c.suppressed!==undefined&&typeof c.suppressed!=='boolean'||!['collinear','rightAngle'].includes(c.type)||c.reference===c.target||!m.beams.some(b=>b.id===c.reference)||!m.beams.some(b=>b.id===c.target))throw Error('A geometry constraint refers to invalid members.');
  ids.add(c.id);if(c.suppressed)continue;
  if(targets.has(c.target))throw Error('This member already follows a geometry constraint. Remove it before adding another.');
  targets.set(c.target,c);
 }
 const result:GeometryConstraint[]=[],visited=new Set<string>(),visiting=new Set<string>();
 function visit(c:GeometryConstraint){if(visited.has(c.id))return;if(visiting.has(c.id))throw Error('These references form a constraint cycle. Choose a reference that does not follow this member.');visiting.add(c.id);const parent=targets.get(c.reference);if(parent)visit(parent);visiting.delete(c.id);visited.add(c.id);result.push(c);}
 constraints.filter(c=>!c.suppressed).forEach(visit);return result;
}
function endpoints(m:Model,id:string){const b=m.beams.find(b=>b.id===id);if(!b)throw Error('Member no longer exists.');return [m.nodes.find(n=>n.id===b.a)!,m.nodes.find(n=>n.id===b.b)!] as const;}
export function geometryError(m:Model,c:GeometryConstraint){
 const [a,b]=endpoints(m,c.reference),[p,q]=endpoints(m,c.target),dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy),T=Math.hypot(q.x-p.x,q.y-p.y);
 if(L<1e-6||T<1e-6)return Infinity;
 return c.type==='collinear'?Math.max(Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x)),Math.abs(dx*(q.y-a.y)-dy*(q.x-a.x)))/L:Math.abs(dx*(q.x-p.x)+dy*(q.y-p.y))/(L*T);
}
export function geometrySatisfied(m:Model){return (m.constraints??[]).filter(c=>!c.suppressed).every(c=>geometryError(m,c)<1e-6);}
function enforceRelationships(m:Model,editedNode?:string){
 const ordered=constraintOrder(m);if(!ordered.length)return;
 for(let pass=0;pass<40;pass++){
  for(const c of ordered){
   const [a,b]=endpoints(m,c.reference),[p,q]=endpoints(m,c.target),rx=b.x-a.x,ry=b.y-a.y,R=Math.hypot(rx,ry),T=Math.hypot(q.x-p.x,q.y-p.y);
   if(R<1e-6||T<1e-6)throw Error('A constrained member cannot have zero length.');
   const shared=[p,q].find(n=>n.id===a.id||n.id===b.id);
   let anchor=shared??(editedNode===q.id?q:p),moving=anchor===p?q:p;
   let ux=c.type==='collinear'?rx/R:-ry/R,uy=c.type==='collinear'?ry/R:rx/R;
   const sign=(moving.x-anchor.x)*ux+(moving.y-anchor.y)*uy>=0?1:-1;ux*=sign;uy*=sign;
   if(!shared&&c.type==='collinear'){const s=((anchor.x-a.x)*rx+(anchor.y-a.y)*ry)/(R*R);anchor.x=a.x+s*rx;anchor.y=a.y+s*ry;}
   // Dragging the follower endpoint slides it along the allowed direction.
   // Reference edits rotate the follower about its shared/anchored endpoint.
   const length=editedNode===moving.id?Math.max(1e-4,Math.abs((moving.x-anchor.x)*ux+(moving.y-anchor.y)*uy)):T;
   moving.x=anchor.x+ux*length;moving.y=anchor.y+uy*length;
  }
  if(geometrySatisfied(m))return;
 }
 throw Error('These geometry constraints conflict through shared nodes. Remove a constraint or choose another reference.');
}
export function beamGroupName(m:Model,family:string){return `Beam ${[...new Set(m.beams.map(b=>b.family))].indexOf(family)+1}`;}
export function joinContinuous(m:Model,first:string,second:string){
 const a=m.beams.find(b=>b.id===first)!,b=m.beams.find(b=>b.id===second)!;
 if(!a||!b||a.id===b.id||a.kind!=='beam'||b.kind!=='beam')throw Error('Choose two beam segments to join.');
 const shared=[a.a,a.b].find(id=>id===b.a||id===b.b);if(!shared)throw Error('Connect the segments to the same node before joining their continuity.');
 const n=m.nodes.find(n=>n.id===shared)!;
 if(n.joint==='hinge'||(a.a===shared?a.releaseA:a.releaseB)||(b.a===shared?b.releaseA:b.releaseB))throw Error('An internal hinge or explicit end release breaks continuity here. Remove that release first.');
 const members=m.beams.filter(x=>x.family===a.family||x.family===b.family),degree=new Map<string,number>();
 for(const x of members)for(const id of [x.a,x.b])degree.set(id,(degree.get(id)??0)+1);
 if([...degree.values()].some(n=>n>2))throw Error('A continuous beam group cannot branch into three segments at one node.');
 members.forEach(x=>x.family=a.family);
}

const radians=Math.PI/180;
const wrapAngle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
export function dimensionPoints(d:CadDimension){
 const points=[d.a,d.b];
 if(d.kind==='angle'||d.kind==='perpendicular')points.push(d.c!);
 if(d.kind==='angle')points.push(d.d!);
 return points;
}

function dimensionTarget(d:CadDimension){
 return d.kind==='perpendicular'?d.c!:d.kind==='angle'?d.d!:d.b;
}

type Position={x:number;y:number};
export function lineProjection(a:Position,b:Position,point:Position){
 const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
 const tangent={x:dx/length,y:dy/length},normal={x:-tangent.y,y:tangent.x};
 const x=point.x-a.x,y=point.y-a.y;
 const along=x*tangent.x+y*tangent.y;
 return {tangent,normal,along,length,distance:x*normal.x+y*normal.y,
  foot:{x:a.x+along*tangent.x,y:a.y+along*tangent.y}};
}

export function dimensionValue(m:Model,d:CadDimension){
 const a=cadPoint(m,d.a!),b=cadPoint(m,d.b!);
 const dx=b.x-a.x,dy=b.y-a.y;
 if(d.kind==='perpendicular')return Math.abs(lineProjection(a,b,cadPoint(m,d.c!)).distance);
 if(d.kind==='horizontal')return Math.abs(dx);
 if(d.kind==='vertical')return Math.abs(dy);
 if(d.kind==='direction')return ((Math.atan2(dy,dx)/radians)%360+360)%360;
 if(d.kind==='angle'){const c=cadPoint(m,d.c!),p=cadPoint(m,d.d!);return Math.abs(wrapAngle(Math.atan2(p.y-c.y,p.x-c.x)-Math.atan2(dy,dx)))/radians;}
 return Math.hypot(dx,dy);
}
export function dimensionSense(m:Model,d:CadDimension):1|-1{
 const a=cadPoint(m,d.a!),b=cadPoint(m,d.b!);
 if(d.kind==='perpendicular')return lineProjection(a,b,cadPoint(m,d.c!)).distance<0?-1:1;
 if(d.kind==='horizontal')return b.x<a.x?-1:1;
 if(d.kind==='vertical')return b.y<a.y?-1:1;
 if(d.kind==='angle'){const c=cadPoint(m,d.c!),p=cadPoint(m,d.d!);return wrapAngle(Math.atan2(p.y-c.y,p.x-c.x)-Math.atan2(b.y-a.y,b.x-a.x))<0?-1:1;}
 return 1;
}
export function dimensionsSatisfied(m:Model){return (m.dimensions??[]).every(d=>{if(!d.driving)return true;const a=cadPoint(m,d.a!),b=cadPoint(m,d.b!);if(d.kind==='perpendicular')return Math.abs(lineProjection(a,b,cadPoint(m,d.c!)).distance-(d.sense??1)*d.value)<1e-6;if(d.kind==='horizontal')return Math.abs(b.x-a.x-(d.sense??1)*d.value)<1e-6;if(d.kind==='vertical')return Math.abs(b.y-a.y-(d.sense??1)*d.value)<1e-6;if(d.kind==='angle'){const c=cadPoint(m,d.c!),p=cadPoint(m,d.d!);return Math.abs(wrapAngle(Math.atan2(p.y-c.y,p.x-c.x)-Math.atan2(b.y-a.y,b.x-a.x)-(d.sense??1)*d.value*radians))<1e-7;}const v=dimensionValue(m,d);return d.kind==='direction'?Math.abs(wrapAngle((v-d.value)*radians))<1e-7:Math.abs(v-d.value)<1e-6;});}
export function validDimensions(m:Model){
 if(m.dimensionAnchor!==undefined&&m.dimensionAnchor!==ORIGIN&&!m.nodes.some(n=>n.id===m.dimensionAnchor))return false;
 if(m.dimensionUnits!==undefined&&!['m','mm'].includes(m.dimensionUnits))return false;
 if(m.dimensions===undefined)return true;
 if(!Array.isArray(m.dimensions)||m.dimensions.length>120)return false;
 const ids=new Set<string>();
 for(const d of m.dimensions){
  if(!d||typeof d.id!=='string'||ids.has(d.id)||!['length','aligned','horizontal','vertical','direction','angle','perpendicular'].includes(d.kind)||typeof d.driving!=='boolean'||typeof d.value!=='number'||!Number.isFinite(d.value)||Math.abs(d.value)>1e8)return false;
  ids.add(d.id);
  if(d.a===d.b||![d.a,d.b].every(id=>id===ORIGIN||m.nodes.some(n=>n.id===id)))return false;
  if(!dimensionPoints(d).every(id=>id===ORIGIN||m.nodes.some(n=>n.id===id)))return false;
  if(d.kind==='angle'&&d.c===d.d)return false;
  if(d.kind==='perpendicular'&&(d.c===d.a||d.c===d.b))return false;
  if(['direction','angle','perpendicular'].includes(d.kind)){const a=cadPoint(m,d.a!),b=cadPoint(m,d.b!);if(Math.hypot(b.x-a.x,b.y-a.y)<1e-6)return false;if(d.kind==='angle'){const c=cadPoint(m,d.c!),p=cadPoint(m,d.d!);if(Math.hypot(p.x-c.x,p.y-c.y)<1e-6)return false;}}
  if((d.kind==='angle'&&(d.value<0||d.value>180))||(d.kind==='direction'&&(d.value<0||d.value>=360)))return false;
  if(['length','aligned'].includes(d.kind)&&d.driving&&d.value<1e-5)return false;
  if(['horizontal','vertical','perpendicular'].includes(d.kind)&&d.value<0)return false;
  if(d.sense!==undefined&&d.sense!==1&&d.sense!==-1)return false;
  if(d.offset!==undefined&&(!Number.isFinite(d.offset)||Math.abs(d.offset)>250))return false;
 }
 try{return dimensionsSatisfied(m);}catch{return false;}
}
// Seed the requested edit with the first point fixed, so unconstrained cases
// behave like a conventional CAD dimension. The coupled solve handles the rest.
export function seedDimension(m:Model,d:CadDimension){
 if(!d.driving||d.b===ORIGIN||d.d===ORIGIN||d.kind==='perpendicular'&&d.c===ORIGIN)return;
 const anchor=m.nodes.find(n=>n.id===m.dimensionAnchor),anchorPosition=anchor?{x:anchor.x,y:anchor.y}:undefined;
 const a=cadPoint(m,d.a!),b=cadPoint(m,d.b!);
 const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
 if(d.kind==='perpendicular'){
  const point=cadPoint(m,d.c!),{foot,normal}=lineProjection(a,b,point);
  point.x=foot.x+normal.x*(d.sense??1)*d.value;
  point.y=foot.y+normal.y*(d.sense??1)*d.value;
 }else if(d.kind==='length'||d.kind==='aligned'){b.x=a.x+(Math.hypot(dx,dy)<1e-8?1:dx/L)*d.value;b.y=a.y+dy/L*d.value;}
 else if(d.kind==='horizontal')b.x=a.x+(d.sense??1)*d.value;
 else if(d.kind==='vertical')b.y=a.y+(d.sense??1)*d.value;
 else if(d.kind==='direction'){b.x=a.x+L*Math.cos(d.value*radians);b.y=a.y+L*Math.sin(d.value*radians);}
 else {const c=cadPoint(m,d.c!),p=cadPoint(m,d.d!),T=Math.hypot(p.x-c.x,p.y-c.y),angle=Math.atan2(dy,dx)+(d.sense??1)*d.value*radians;
  // For a common endpoint keep the shared vertex, including reversed segments.
  if(p.id===a.id||p.id===b.id){c.x=p.x-T*Math.cos(angle);c.y=p.y-T*Math.sin(angle);}else {p.x=c.x+T*Math.cos(angle);p.y=c.y+T*Math.sin(angle);}
 }
 if(anchor&&anchorPosition)Object.assign(anchor,anchorPosition);
}
export type SketchSolveOptions={preferredNodes?:string[]};
export function enforceConstraints(m:Model,editedNode?:string,options:SketchSolveOptions={}){
 enforceGeometry(m,editedNode,options);
 updateLoadStations(m);
 orientLoads(m);
}
export function enforceGeometry(m:Model,editedNode?:string,options:SketchSolveOptions={}){
 constraintOrder(m);
 if(!(m.dimensions??[]).some(d=>d.driving)&&!(m.sketchConstraints??[]).some(c=>!c.suppressed))enforceRelationships(m,editedNode);
 else solveCadGeometry(m,editedNode,options);
}
export class LoadPositionError extends Error{loadIds:string[];constructor(ids:string[]){super(`The position dimension of ${ids.map(id=>'load '+id).join(', ')} lies beyond the shortened member. Keep its distance, or attach the load to the member end. This is not a geometric over-constraint.`);this.name='LoadPositionError';this.loadIds=ids;}}
export class SketchSolveError extends Error{constructor(){super('The geometry solver did not converge. This may be a conflict or a numerical failure.');this.name='SketchSolveError';}}
export function orientLoads(m:Model){for(const l of m.loads)if(l.normal&&l.type!=='moment'){const [a,b]=endpoints(m,l.beam),L=Math.hypot(b.x-a.x,b.y-a.y),mag=Math.hypot(l.fx,l.fy);l.fx=-(b.y-a.y)/L*mag*l.normal;l.fy=(b.x-a.x)/L*mag*l.normal;}}
function updateLoadStations(m:Model){
 const blocked=m.loads.filter(l=>{if(l.attachment||!l.position)return false;const [a,b]=endpoints(m,l.beam);return l.position.distance>Math.hypot(b.x-a.x,b.y-a.y)+1e-7;}).map(l=>l.id);if(blocked.length)throw new LoadPositionError(blocked);
 for(const l of m.loads){if(l.attachment){l.t=l.attachment==='start'?0:1;delete l.position;continue;}if(!l.position)continue;const [a,b]=endpoints(m,l.beam),L=Math.hypot(b.x-a.x,b.y-a.y);l.t=Math.max(0,Math.min(1,l.position.from==='start'?l.position.distance/L:1-l.position.distance/L));}
}
type CadTerm={v:number;period?:number;id:string};
export function cadTerms(m:Model,rightSenses?:Map<string,number>):CadTerm[]{
 const out:CadTerm[]=[];
 for(const c of (m.sketchConstraints??[]).filter(c=>!c.suppressed))for(const v of sketchResiduals(m,c))out.push({v,id:c.id});
 for(const c of (m.constraints??[]).filter(c=>!c.suppressed)){const [a,b]=endpoints(m,c.reference),[p,q]=endpoints(m,c.target),dx=b.x-a.x,dy=b.y-a.y,R=Math.max(1e-8,Math.hypot(dx,dy));
  if(c.type==='collinear')out.push({v:(dx*(p.y-a.y)-dy*(p.x-a.x))/R,id:c.id},{v:(dx*(q.y-a.y)-dy*(q.x-a.x))/R,id:c.id});
  else {const sign=rightSenses?.get(c.id)??(dx*(q.y-p.y)-dy*(q.x-p.x)<0?-1:1);out.push({v:wrapAngle(Math.atan2(q.y-p.y,q.x-p.x)-Math.atan2(dy,dx)-sign*Math.PI/2),period:2*Math.PI,id:c.id});}
 }
 for(const d of (m.dimensions??[]).filter(d=>d.driving)){const a=cadPoint(m,d.a),b=cadPoint(m,d.b),dx=b.x-a.x,dy=b.y-a.y;
  if(d.kind==='perpendicular')out.push({v:lineProjection(a,b,cadPoint(m,d.c!)).distance-(d.sense??1)*d.value,id:d.id});
  else if(d.kind==='horizontal')out.push({v:dx-(d.sense??1)*d.value,id:d.id});
  else if(d.kind==='vertical')out.push({v:dy-(d.sense??1)*d.value,id:d.id});
  else if(d.kind==='direction')out.push({v:wrapAngle(Math.atan2(dy,dx)-d.value*radians),period:2*Math.PI,id:d.id});
  else if(d.kind==='angle'){const p=cadPoint(m,d.c!),q=cadPoint(m,d.d!);out.push({v:wrapAngle(Math.atan2(q.y-p.y,q.x-p.x)-Math.atan2(dy,dx)-(d.sense??1)*d.value*radians),period:2*Math.PI,id:d.id});}
  else out.push({v:Math.hypot(dx,dy)-d.value,id:d.id});
 }
 return out;
}
type Coordinate={i:number;axis:'x'|'y'};
function cadJacobian(m:Model,variables:Coordinate[],terms:()=>CadTerm[]){
 const r=terms(),J=Array.from({length:r.length},()=>Array(variables.length).fill(0));
 for(let j=0;j<variables.length;j++){const {i,axis}=variables[j],n=m.nodes[i],old=n[axis],h=Math.max(1e-7,Math.min(1e-5,Math.abs(old)*1e-9));
  try{n[axis]=old+h;const plus=terms();n[axis]=old-h;const minus=terms();for(let k=0;k<r.length;k++){const delta=plus[k].v-minus[k].v;J[k][j]=(r[k].period?wrapAngle(delta):delta)/(2*h);}}
  finally{n[axis]=old;}
 }
 return {r,J};
}
function geometrySolved(m:Model){return cadTerms(m).every(t=>Number.isFinite(t.v)&&Math.abs(t.v)<1e-8)&&geometrySatisfied(m)&&sketchSatisfied(m)&&dimensionsSatisfied(m)&&m.beams.every(b=>{const [a,z]=endpoints(m,b.id);return Math.hypot(z.x-a.x,z.y-a.y)>1e-6;});}
// Local solve preferences are temporary. No physical node, support or first
// dimension is implicitly fixed to the drawing's world coordinates.
function solveCadGeometry(m:Model,editedNode?:string,options:SketchSolveOptions={}){
 if(geometrySolved(m))return;
 const original=m.nodes.map(n=>({x:n.x,y:n.y})),restore=()=>m.nodes.forEach((n,i)=>Object.assign(n,original[i]));
 const lastPoint=[...(m.sketchConstraints??[])].reverse().find(c=>!c.suppressed&&(c.type==='coincident'||c.scope==='points'||isMemberPointConstraint(c))&&sketchResiduals(m,c).some(v=>Math.abs(v)>1e-8));
 const lastDimension=[...(m.dimensions??[])].reverse().find(d=>d.driving),target=lastDimension?dimensionTarget(lastDimension):undefined;
 let preferred=options.preferredNodes?.length?options.preferredNodes:editedNode?[editedNode]:[];
 if(!preferred.length&&lastPoint){
  if(isMemberPointConstraint(lastPoint)){
   preferred=lastPoint.a===ORIGIN?memberPointEnds(m,lastPoint).map(n=>n.id):[lastPoint.a];
  }else{
   preferred=[lastPoint.b===ORIGIN?lastPoint.a:lastPoint.b!];
  }
 }else if(!preferred.length&&target&&target!==ORIGIN){
  preferred=[target];
 }
 const neighbours=new Set(preferred);for(const b of m.beams)if(preferred.includes(b.a)||preferred.includes(b.b)){neighbours.add(b.a);neighbours.add(b.b);}
 const all=m.nodes.map(n=>n.id),tiers=[preferred,[...neighbours],all];
 const unique=new Set<string>();
 for(const tier of tiers){const key=[...tier].sort().join('|');if(unique.has(key)||!tier.length)continue;unique.add(key);restore();
  if(lastPoint&&isMemberPointConstraint(lastPoint)&&tier===preferred
   &&memberPointEnds(m,lastPoint).every(n=>preferred.includes(n.id))){
   if(translateToPointConstraint(m,lastPoint,preferred))return;
   restore();
  }
  if(lastPoint&&tier.length===all.length&&unique.size>1){if(translateToPointConstraint(m,lastPoint,preferred))return;restore();}
  if(projectGeometry(m,new Set(tier),editedNode))return;
  // A rigid translation is the least disruptive fallback for anchoring a
  // shape-defined group. Try it after the picked point and its line first.
  if(lastPoint&&tier.length===neighbours.size){restore();if(translateToPointConstraint(m,lastPoint,preferred))return;}
 }
 // A constrained point can have only one remaining drag direction. Project the
 // cursor to that manifold rather than forcing an impossible pair of X/Y goals.
 if(editedNode){restore();if(projectGeometry(m,new Set(all),undefined,editedNode))return;}
 restore();throw new SketchSolveError();
}
function projectGeometry(m:Model,movable:Set<string>,hold?:string,preferred?:string){
 const variables=m.nodes.flatMap((n,i)=>movable.has(n.id)&&n.id!==hold?[{i,axis:'x' as const},{i,axis:'y' as const}]:[]);
 if(!variables.length)return geometrySolved(m);
 const rightSenses=new Map((m.constraints??[]).map(c=>{const [a,b]=endpoints(m,c.reference),[p,q]=endpoints(m,c.target);return [c.id,(b.x-a.x)*(q.y-p.y)-(b.y-a.y)*(q.x-p.x)<0?-1:1];}));
 const terms=()=>cadTerms(m,rightSenses),cost=(r:CadTerm[])=>r.reduce((sum,x)=>sum+x.v*x.v,0),N=variables.length,penalty=variables.map(v=>m.nodes[v.i].id===preferred?10000:1);let lambda=1e-5;
 for(let step=0;step<110;step++){
  if(geometrySolved(m))return true;
  const {r,J}=cadJacobian(m,variables,terms),A=Array.from({length:N},()=>Array(N).fill(0)),rhs=Array(N).fill(0);
  for(let k=0;k<r.length;k++)for(let i=0;i<N;i++){rhs[i]-=J[k][i]*r[k].v;for(let j=0;j<=i;j++)A[i][j]+=J[k][i]*J[k][j];}
  if(rhs.every(v=>Math.abs(v)<1e-15))return false;
  for(let i=0;i<N;i++){A[i][i]+=lambda*penalty[i];for(let j=0;j<i;j++)A[j][i]=A[i][j];}
  const L=Array.from({length:N},()=>Array(N).fill(0));let stable=true;
  for(let i=0;i<N&&stable;i++)for(let j=0;j<=i;j++){let x=A[i][j];for(let k=0;k<j;k++)x-=L[i][k]*L[j][k];if(i===j){if(x<=0||!Number.isFinite(x)){stable=false;break;}L[i][j]=Math.sqrt(x);}else L[i][j]=x/L[j][j];}
  if(!stable){lambda*=10;continue;}
  const y=Array(N).fill(0),delta=Array(N).fill(0);for(let i=0;i<N;i++){let v=rhs[i];for(let j=0;j<i;j++)v-=L[i][j]*y[j];y[i]=v/L[i][i];}for(let i=N-1;i>=0;i--){let v=y[i];for(let j=i+1;j<N;j++)v-=L[j][i]*delta[j];delta[i]=v/L[i][i];}
  const previous=variables.map(v=>m.nodes[v.i][v.axis]);variables.forEach((v,j)=>m.nodes[v.i][v.axis]+=delta[j]);const nextCost=cost(terms());
  if(Number.isFinite(nextCost)&&nextCost<cost(r)){lambda=Math.max(1e-12,lambda*.3);}else{variables.forEach((v,j)=>m.nodes[v.i][v.axis]=previous[j]);lambda*=10;if(lambda>1e10)break;}
 }
 return geometrySolved(m);
}
export function sketchComponent(m:Model,seeds:string[],skip?:string){
 const ids=new Set(seeds.filter(id=>id!==ORIGIN));const groups:string[][]=m.beams.map(b=>[b.a,b.b]);
 for(const d of m.dimensions??[])if(d.driving)groups.push(dimensionPoints(d));
 for(const c of (m.constraints??[]).filter(c=>!c.suppressed))groups.push(...[m.beams.filter(b=>b.id===c.reference||b.id===c.target).flatMap(b=>[b.a,b.b])]);
 for(const c of m.sketchConstraints??[])if(!c.suppressed&&c.id!==skip)groups.push(sketchReferencePoints(m,c));
 let changed=true;while(changed){changed=false;for(const group of groups)if(group.some(id=>id!==ORIGIN&&ids.has(id)))for(const id of group)if(id!==ORIGIN&&!ids.has(id)){ids.add(id);changed=true;}}
 return ids;
}
function translateToPointConstraint(m:Model,c:SketchConstraint,preferred:string[]){
 if(isMemberPointConstraint(c)){
  const [start,end]=memberPointEnds(m,c);
  const moveMember=c.a===ORIGIN||preferred.includes(start.id)&&preferred.includes(end.id);
  const moving=sketchComponent(m,moveMember?[start.id,end.id]:[c.a],c.id);
  const stationary=moveMember?[c.a]:[start.id,end.id];
  if(stationary.some(id=>moving.has(id)))return false;
  const point=cadPoint(m,c.a);
  const target=c.type==='midpoint'?{x:(start.x+end.x)/2,y:(start.y+end.y)/2}:project(point,start,end);
  const dx=point.x-target.x,dy=point.y-target.y,sign=moveMember?1:-1;
  for(const n of m.nodes)if(moving.has(n.id)){n.x+=sign*dx;n.y+=sign*dy;}
  return geometrySolved(m);
 }
 if(c.type!=='coincident'&&c.scope!=='points')return false;
 const target=c.b===ORIGIN?c.a:c.b!,reference=target===c.a?c.b!:c.a,a=cadPoint(m,reference),b=cadPoint(m,target),dx=c.type==='horizontal'?0:a.x-b.x,dy=c.type==='vertical'?0:a.y-b.y,ids=sketchComponent(m,[target],c.id);
 if(ids.has(reference))return false;
 for(const n of m.nodes)if(ids.has(n.id)){n.x+=dx;n.y+=dy;}
 return geometrySolved(m);
}
export function translateSketch(m:Model,seeds:string[],dx:number,dy:number){
 const ids=sketchComponent(m,seeds),before=m.nodes.map(n=>({x:n.x,y:n.y}));
 const pose=(x:number,y:number)=>m.nodes.forEach((n,i)=>{n.x=before[i].x+(ids.has(n.id)?x:0);n.y=before[i].y+(ids.has(n.id)?y:0);});
 const cost=(r:CadTerm[])=>r.reduce((sum,t)=>sum+t.v*t.v,0);let x=dx,y=dy,lambda=1e-8;pose(x,y);
 // Keep the whole group rigid while projecting a drag onto any remaining
 // placement freedoms (one origin coordinate, or a radial origin distance).
 for(let step=0;step<60&&!geometrySolved(m);step++){
  const r=cadTerms(m),h=1e-6;pose(x+h,y);const xp=cadTerms(m);pose(x-h,y);const xm=cadTerms(m);pose(x,y+h);const yp=cadTerms(m);pose(x,y-h);const ym=cadTerms(m);pose(x,y);
  let aa=lambda,bb=lambda,ab=0,rx=0,ry=0;for(let k=0;k<r.length;k++){const gx=(r[k].period?wrapAngle(xp[k].v-xm[k].v):xp[k].v-xm[k].v)/(2*h),gy=(r[k].period?wrapAngle(yp[k].v-ym[k].v):yp[k].v-ym[k].v)/(2*h);aa+=gx*gx;bb+=gy*gy;ab+=gx*gy;rx-=gx*r[k].v;ry-=gy*r[k].v;}
  const determinant=aa*bb-ab*ab;if(determinant<1e-24)break;const sx=(rx*bb-ry*ab)/determinant,sy=(ry*aa-rx*ab)/determinant;pose(x+sx,y+sy);
  if(cost(cadTerms(m))<cost(r)){x+=sx;y+=sy;lambda=Math.max(1e-12,lambda*.3);}else{pose(x,y);lambda*=10;if(lambda>1e8)break;}
 }
 if(!geometrySolved(m)||(Math.hypot(dx,dy)>1e-6&&Math.hypot(x,y)<1e-7)){pose(0,0);throw Error('This sketch position is constrained to the origin. Adjust or remove its origin dimensions to move it.');}
 updateLoadStations(m);return ids;
}
// Row-space analysis reports actual independent geometric freedoms; supports
// and beam stiffness never participate in CAD constraint-state colours.
function rowBasis(rows:number[][],width:number){
 const basis:number[][]=[];
 for(const source of rows){const norm=Math.hypot(...source);if(norm<1e-9)continue;const v=source.map(x=>x/norm);
  for(let pass=0;pass<2;pass++)for(const q of basis){let d=0;for(let j=0;j<width;j++)d+=v[j]*q[j];for(let j=0;j<width;j++)v[j]-=d*q[j];}
  const remaining=Math.hypot(...v);if(remaining>1e-7)basis.push(v.map(x=>x/remaining));
 }
 return basis;
}
export function sketchMobility(m:Model){
 const variables=m.nodes.flatMap((n,i)=>[{i,axis:'x' as const},{i,axis:'y' as const}]),{J}=cadJacobian(m,variables,()=>cadTerms(m)),basis=rowBasis(J,variables.length),freedom=variables.map((_,j)=>Math.max(0,1-basis.reduce((sum,q)=>sum+q[j]*q[j],0))),fixedNodes=new Set(m.nodes.filter((_,i)=>freedom[i*2]<1e-7&&freedom[i*2+1]<1e-7).map(n=>n.id));
 return {rank:basis.length,dof:variables.length-basis.length,fixedNodes,fixedBeams:new Set(m.beams.filter(b=>fixedNodes.has(b.a)&&fixedNodes.has(b.b)).map(b=>b.id))};
}

export function validMassProperties(p:any){if(p===undefined)return true;if(!p||typeof p!=='object'||Array.isArray(p))return false;for(const [k,v] of Object.entries(p)){if(['material','reference'].includes(k)){if(typeof v!=='string'||v.length>200)return false;}else if(['mass','density','specimenLength','ixx','iyy','izz','ixy','ixz','iyz'].includes(k)){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e15||(!['ixy','ixz','iyz'].includes(k)&&v<0))return false;}else return false;}return true;}
export function validBeamPreset(p:any){return validSection(p?.section)&&validMassProperties(p?.section?.massProperties)&&!!p&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=100&&[p.E,p.A,p.I].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<1e12)&&validMassProperties(p.massProperties);}

export function validSketchConstraints(m:Model){
 if(m.sketchConstraints===undefined)return true;
 if(!Array.isArray(m.sketchConstraints)||m.sketchConstraints.length>150)return false;
 const ids=new Set<string>();
 return m.sketchConstraints.every(c=>{if(!c||typeof c.id!=='string'||ids.has(c.id)||c.suppressed!==undefined&&typeof c.suppressed!=='boolean')return false;ids.add(c.id);
  if(isMemberPointConstraint(c))return c.scope===undefined&&hasSketchReferences(m,c);
  if(c.spanEnd!==undefined)return false;
  if(c.scope!==undefined&&!['points','members'].includes(c.scope)||c.scope==='points'&&!['horizontal','vertical','coincident'].includes(c.type))return false;
  if(c.type==='coincident'||c.scope==='points'&&['horizontal','vertical'].includes(c.type))return c.a!==c.b&&[c.a,c.b].every(id=>id===ORIGIN||m.nodes.some(n=>n.id===id));
  if(!['horizontal','vertical','equal','parallel','perpendicular','collinear'].includes(c.type)||!m.beams.some(b=>b.id===c.a))return false;
  return ['horizontal','vertical'].includes(c.type)||c.a!==c.b&&m.beams.some(b=>b.id===c.b);
 });
}
export function isMemberPointConstraint(c:SketchConstraint){
 return c.type==='pointOnMember'||c.type==='midpoint';
}
export function memberPointEnds(m:Model,c:SketchConstraint){
 const [start,end]=endpoints(m,c.b!);
 return [start,c.spanEnd?cadPoint(m,c.spanEnd):end] as const;
}
export function hasSketchReferences(m:Model,c:SketchConstraint){
 const hasPoint=(id:string|undefined)=>id===ORIGIN||m.nodes.some(n=>n.id===id);
 if(isMemberPointConstraint(c)){
  const member=m.beams.find(b=>b.id===c.b);
  const end=c.spanEnd??member?.b;
  return !!member&&hasPoint(c.a)&&end!==ORIGIN&&hasPoint(end)
    &&member.a!==end&&c.a!==member.a&&c.a!==end;
 }
 if(c.type==='coincident'||c.scope==='points')return hasPoint(c.a)&&hasPoint(c.b);
 return m.beams.some(b=>b.id===c.a)&&(!c.b||m.beams.some(b=>b.id===c.b));
}
function sketchReferencePoints(m:Model,c:SketchConstraint){
 if(isMemberPointConstraint(c))return [c.a,...memberPointEnds(m,c).map(n=>n.id)];
 if(c.type==='coincident'||c.scope==='points')return [c.a,c.b!];
 return m.beams.filter(b=>b.id===c.a||b.id===c.b).flatMap(b=>[b.a,b.b]);
}
function remapSketchPoint(c:SketchConstraint,from:string,to:string){
 if(isMemberPointConstraint(c)){
  if(c.a===from)c.a=to;
  if(c.spanEnd===from)c.spanEnd=to;
 }else if(c.type==='coincident'||c.scope==='points'){
  if(c.a===from)c.a=to;
  if(c.b===from)c.b=to;
 }
}
export function sketchResiduals(m:Model,c:SketchConstraint):number[]{
 if(isMemberPointConstraint(c)){
  const [start,end]=memberPointEnds(m,c),point=cadPoint(m,c.a);
  if(Math.hypot(end.x-start.x,end.y-start.y)<=1e-6)return [NaN,NaN];
  if(c.type==='midpoint')return [point.x-(start.x+end.x)/2,point.y-(start.y+end.y)/2];
  const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
  const px=point.x-start.x,py=point.y-start.y;
  const along=(px*dx+py*dy)/length;
  return [(dx*py-dy*px)/length,along-Math.max(0,Math.min(length,along))];
 }
 if(c.type==='coincident'||c.scope==='points'){const a=cadPoint(m,c.a),b=cadPoint(m,c.b!);return c.type==='horizontal'?[b.y-a.y]:c.type==='vertical'?[b.x-a.x]:[b.x-a.x,b.y-a.y];}
 const [a,b]=endpoints(m,c.a),dx=b.x-a.x,dy=b.y-a.y,L=Math.max(1e-8,Math.hypot(dx,dy));
 if(c.type==='horizontal')return [dy];if(c.type==='vertical')return [dx];
 const [p,q]=endpoints(m,c.b!),ex=q.x-p.x,ey=q.y-p.y,T=Math.max(1e-8,Math.hypot(ex,ey));
 if(c.type==='equal')return [L-T];
 if(c.type==='perpendicular')return [(dx*ex+dy*ey)/(L*T)];
 if(c.type==='parallel')return [(dx*ey-dy*ex)/(L*T)];
 return [(dx*(p.y-a.y)-dy*(p.x-a.x))/L,(dx*(q.y-a.y)-dy*(q.x-a.x))/L];
}
export function sketchSatisfied(m:Model){try{return (m.sketchConstraints??[]).filter(c=>!c.suppressed).every(c=>sketchResiduals(m,c).every(v=>Math.abs(v)<1e-6));}catch{return false;}}
export function mergePoints(m:Model,keep:string,remove:string){
 if(keep===remove)throw Error('Choose two different points.');
 const next=structuredClone(m),a=cadPoint(next,keep) as Node,b=cadPoint(next,remove) as Node;
 if(!a||!b)throw Error('Choose existing points.');
 if(![keep,remove].includes(ORIGIN)){
  if(next.beams.some(v=>[v.a,v.b].includes(keep)&&[v.a,v.b].includes(remove)))throw Error('Connecting these endpoints would collapse their member.');
  if(a.support!=='free'&&b.support!=='free'&&a.support!==b.support)throw Error('The points have different supports. Remove one support before connecting.');
 }
 const coincidence:SketchConstraint={id:uid(),type:'coincident',a:keep,b:remove};next.sketchConstraints=[...(next.sketchConstraints??[]),coincidence];
 // Satisfy the geometric connection before merging topology. This lets the
 // selected line move first, or its entire constrained component when needed.
 enforceConstraints(next,undefined,{preferredNodes:[remove===ORIGIN?keep:remove]});
 if([keep,remove].includes(ORIGIN)){Object.assign(m,next);return;}
 next.sketchConstraints=next.sketchConstraints.filter(c=>c.id!==coincidence.id);
 if(a.support==='free'&&b.support!=='free'){a.support=b.support;a.spring=b.spring;a.settlement=b.settlement;}
 for(const v of next.beams){if(v.a===remove)v.a=keep;if(v.b===remove)v.b=keep;}
 for(const d of next.dimensions??[])for(const key of ['a','b','c','d'] as const)if(d[key]===remove)d[key]=keep;
 next.dimensions=next.dimensions?.filter(d=>d.a!==d.b&&(d.kind!=='angle'||d.c!==d.d)&&(d.kind!=='perpendicular'||d.c!==d.a&&d.c!==d.b));
 for(const c of next.sketchConstraints)remapSketchPoint(c,remove,keep);
 next.sketchConstraints=next.sketchConstraints.filter(c=>!(c.type==='coincident'||c.scope==='points')||c.a!==c.b);
 if(next.dimensionAnchor===remove)next.dimensionAnchor=keep;
 next.nodes=next.nodes.filter(n=>n.id!==remove);
 next.sketchConstraints=next.sketchConstraints.filter(c=>hasSketchReferences(next,c));
 if(!validModel(next))throw Error('Over-constrained connection: the existing dimensions prevent these points from joining.');
 Object.assign(m,next);
}

export type DimensionApplication={model:Model;reason:null|'redundant'|'conflict'|'load-position'|'unresolved';applied:boolean;message?:string;loadIds?:string[];relationIds?:string[]};
export function applyCadDimension(m:Model,dimension:CadDimension):DimensionApplication{
 m=withLoadPositions(structuredClone(m));
 const d=structuredClone(dimension),angular=['angle','direction'].includes(d.kind);
 if(!Number.isFinite(d.value)||Math.abs(d.value)>1e8||angular&&(d.value<0||d.value>(d.kind==='angle'?180:359.99999999))||['length','aligned'].includes(d.kind)&&d.value<1e-5||['horizontal','vertical','perpendicular'].includes(d.kind)&&d.value<0)throw Error('Enter a valid positive length or an angle within its allowed range.');
 const put=(data:Model,value:CadDimension)=>{const index=data.dimensions?.findIndex(x=>x.id===value.id)??-1;if(index>=0)data.dimensions![index]=value;else data.dimensions=[...(data.dimensions??[]),value];};
 if(!m.dimensions?.some(x=>x.id===d.id)&&(m.dimensions?.length??0)>=120)throw Error('Use at most 120 dimensions per sketch.');
 const reference=()=>{const data=structuredClone(m),ref={...d,driving:false,value:dimensionValue(m,d)};put(data,ref);if(!validModel(data))throw Error('This dimension refers to invalid geometry.');return data;};
 if(!d.driving)return {model:reference(),reason:null,applied:true};
 let next=structuredClone(m);put(next,d);const proof=dimensionConflict(next,d.id);
 if(proof.length)return {model:reference(),reason:'conflict',applied:true,relationIds:proof,message:`This value conflicts with ${relationNames(next,proof.filter(id=>id!==d.id).sort((a,b)=>Number(!next.constraints?.some(c=>c.id===a))-Number(!next.constraints?.some(c=>c.id===b)))).join(', ')}. The dimension was made driven; the previous geometry was kept.`};
 const preferred=d.kind==='perpendicular'&&d.c===ORIGIN?[d.a,d.b]:[dimensionTarget(d)].filter(id=>id!==ORIGIN);
 let solved=false;
 try{if(d.kind==='perpendicular'||!dimensionPoints(d).includes(ORIGIN))seedDimension(next,d);enforceGeometry(next,undefined,{preferredNodes:preferred});solved=true;}catch{}
 if(!solved){
  // Follow the feasible branch in small steps before treating a failed direct
  // solve as unresolved. Failure to converge never proves over-constraint.
  next=structuredClone(m);const current=dimensionValue(m,d),target=d.value,delta=d.kind==='direction'?wrapAngle((target-current)*radians)/radians:target-current,steps=Math.min(40,Math.max(8,Math.ceil(Math.abs(delta)/Math.max(.05,Math.abs(current)*.05))));
  try{for(let i=1;i<=steps;i++){const value=d.kind==='direction'?((current+delta*i/steps)%360+360)%360:current+delta*i/steps;put(next,{...d,value});enforceGeometry(next,undefined,{preferredNodes:preferred});}put(next,d);enforceGeometry(next,undefined,{preferredNodes:preferred});solved=true;}catch{}
 }
 if(!solved)return {model:structuredClone(m),reason:'unresolved',applied:false,message:'The solver could not resolve this edit, even after gradual adjustment. It has not been classified as over-constrained. The previous sketch and driving dimensions were kept.'};
 const without=structuredClone(next);without.dimensions=without.dimensions?.filter(x=>x.id!==d.id);
 if(sketchMobility(next).rank===sketchMobility(without).rank)return {model:reference(),reason:'redundant',applied:true,message:'The existing geometry already defines this measurement. It was added as a driven dimension.'};
 try{updateLoadStations(next);}catch(error){if(error instanceof LoadPositionError)return {model:structuredClone(m),reason:'load-position',applied:false,loadIds:error.loadIds,message:'This geometry can be solved, but a fixed load-position distance would extend beyond its member. Attach the blocking load to a node or reduce its position distance, then apply the dimension.'};throw error;}
 if(!validModel(next))return {model:structuredClone(m),reason:'unresolved',applied:false,message:'The geometry solved but model validation failed. The edit was not applied; it has not been classified as over-constrained.'};
 return {model:next,reason:null,applied:true};
}
export function relationNames(m:Model,ids:string[]){return ids.map(id=>{const d=m.dimensions?.findIndex(d=>d.id===id)??-1;if(d>=0)return `D${d+1}`;const c=m.constraints?.findIndex(c=>c.id===id)??-1;if(c>=0)return `C${c+1} (${m.constraints![c].type==='collinear'?'collinear':'perpendicular'})`;const s=m.sketchConstraints?.find(c=>c.id===id);return s?`${s.type} constraint`:id;});}
// Prove contradictions in coordinate equations and directly repeated metrics.
// A point can retain unrelated freedom while a particular measurement is fixed.
export function dimensionConflict(m:Model,dimensionId:string){
 const d=m.dimensions?.find(d=>d.id===dimensionId)!;
 if(d){for(const other of m.dimensions??[]){if(!other.driving||other.id===d.id)continue;const metric=(x:CadDimension)=>['length','aligned'].includes(x.kind)?'distance':x.kind;
  if(d.kind==='perpendicular'&&other.kind==='perpendicular'&&d.c===other.c){
   const orientation=d.a===other.a&&d.b===other.b?1:d.a===other.b&&d.b===other.a?-1:0;
   if(orientation&&Math.abs((d.sense??1)*d.value-orientation*(other.sense??1)*other.value)>1e-7)return [other.id,d.id];
  }
  if(metric(d)===metric(other)&&[d.a,d.b].sort().join('|')===[other.a,other.b].sort().join('|')&&metric(d)==='distance'&&Math.abs(d.value-other.value)>1e-7)return [other.id,d.id];}}
 const width=m.nodes.length*2,index=new Map(m.nodes.map((n,i)=>[n.id,i*2]));type Row={v:number[];rhs:number;ids:Set<string>;pivot:number};const rows:Row[]=[];
 function row(a:string,b:string,axis:'x'|'y',rhs:number,id:string,multiplier=1,existing?:Row){const r=existing??{v:Array(width).fill(0),rhs,ids:new Set([id]),pivot:-1},offset=axis==='x'?0:1;if(a!==ORIGIN)r.v[index.get(a)!+offset]-=multiplier;if(b!==ORIGIN)r.v[index.get(b)!+offset]+=multiplier;if(!existing)rows.push(r);return r;}
 for(const c of (m.sketchConstraints??[]).filter(c=>!c.suppressed)){if(c.type==='coincident'){row(c.a,c.b!,'x',0,c.id);row(c.a,c.b!,'y',0,c.id);}else if(['horizontal','vertical'].includes(c.type)){const b=c.scope==='points'?null:m.beams.find(b=>b.id===c.a)!;row(b?b.a:c.a,b?b.b:c.b!,c.type==='horizontal'?'y':'x',0,c.id);}}
 for(const dim of m.dimensions??[]){if(!dim.driving)continue;if(dim.kind==='horizontal'||dim.kind==='vertical')row(dim.a,dim.b,dim.kind==='horizontal'?'x':'y',(dim.sense??1)*dim.value,dim.id);else if(dim.kind==='direction'){const r=row(dim.a,dim.b,'y',0,dim.id,Math.cos(dim.value*radians));row(dim.a,dim.b,'x',0,dim.id,-Math.sin(dim.value*radians),r);}}
 const derived=new Set<string>();
 for(let pass=0;pass<=m.beams.length;pass++){
 const basis:Row[]=[];
 for(const source of rows){const r={...source,v:[...source.v],ids:new Set(source.ids)};for(const q of basis){const factor=r.v[q.pivot];if(Math.abs(factor)<1e-10)continue;for(let j=q.pivot;j<width;j++)r.v[j]-=factor*q.v[j];r.rhs-=factor*q.rhs;for(const id of q.ids)r.ids.add(id);}
  const pivot=r.v.findIndex(v=>Math.abs(v)>1e-9);if(pivot<0){if(Math.abs(r.rhs)>1e-7)return [...r.ids];continue;}const scale=r.v[pivot];r.v=r.v.map(v=>v/scale);r.rhs/=scale;r.pivot=pivot;basis.push(r);basis.sort((a,b)=>a.pivot-b.pivot);}
 for(let i=basis.length-1;i>=0;i--)for(let j=0;j<i;j++){const q=basis[i],r=basis[j],factor=r.v[q.pivot];if(Math.abs(factor)<1e-10)continue;for(let k=0;k<width;k++)r.v[k]-=factor*q.v[k];r.rhs-=factor*q.rhs;for(const id of q.ids)r.ids.add(id);}
 const fixed=new Map<number,Row>(),copy=structuredClone(m);for(const r of basis)if(r.v.every((v,j)=>j===r.pivot||Math.abs(v)<1e-8)){fixed.set(r.pivot,r);const n=copy.nodes[Math.floor(r.pivot/2)];n[r.pivot%2?'y':'x']=r.rhs;}
 // Once a reference line has uniquely determined endpoints, collinearity is
 // also a linear equation for its target points. Propagate those equations,
 // retaining the dimension/constraint evidence that made the line fixed.
 let added=false;
 for(const c of [...(m.constraints??[]).filter(c=>!c.suppressed&&c.type==='collinear').map(c=>({id:c.id,reference:c.reference,target:c.target})),...(m.sketchConstraints??[]).filter(c=>!c.suppressed&&c.type==='collinear').map(c=>({id:c.id,reference:c.a,target:c.b!}))]){
  if(derived.has(c.id))continue;const ref=m.beams.find(b=>b.id===c.reference)!,target=m.beams.find(b=>b.id===c.target)!,coordinates=[ref.a,ref.b].flatMap(id=>[index.get(id)!,index.get(id)!+1]);if(!coordinates.every(i=>fixed.has(i)))continue;
  const a=cadPoint(copy,ref.a),b=cadPoint(copy,ref.b),L=Math.hypot(b.x-a.x,b.y-a.y);if(L<1e-6)continue;const dx=(b.x-a.x)/L,dy=(b.y-a.y)/L;
  for(const point of [target.a,target.b]){const r:Row={v:Array(width).fill(0),rhs:dx*a.y-dy*a.x,ids:new Set([c.id]),pivot:-1};r.v[index.get(point)!]-=dy;r.v[index.get(point)!+1]+=dx;for(const i of coordinates)for(const id of fixed.get(i)!.ids)r.ids.add(id);rows.push(r);}
  derived.add(c.id);added=true;
 }
 if(added)continue;

 const points=(id:string)=>{const dim=m.dimensions?.find(d=>d.id===id);if(dim)return dimensionPoints(dim);const c=m.constraints?.find(c=>c.id===id);if(c)return m.beams.filter(b=>b.id===c.reference||b.id===c.target).flatMap(b=>[b.a,b.b]);const s=m.sketchConstraints?.find(c=>c.id===id);return s?sketchReferencePoints(m,s):[];};
 for(const t of cadTerms(copy)){if(Math.abs(t.v)<1e-7)continue;const p=points(t.id).filter(id=>id!==ORIGIN),coordinates=p.flatMap(id=>[index.get(id)!,index.get(id)!+1]);if(coordinates.length&&coordinates.every(i=>fixed.has(i))){const ids=new Set([t.id]);for(const i of coordinates)for(const id of fixed.get(i)!.ids)ids.add(id);return [...ids];}}
 return [];
 }
 return [];
}

function validLoadPosition(m:Model,l:Load){
 if(l.attachment!==undefined)return ['start','end'].includes(l.attachment)&&l.type!=='distributed'&&l.position===undefined&&Math.abs(l.t-(l.attachment==='start'?0:1))<1e-8;
 if(l.position===undefined)return true;
 const p=l.position;if(!p||p.fixed!==undefined&&typeof p.fixed!=='boolean'||!['start','end'].includes(p.from)||typeof p.distance!=='number'||!Number.isFinite(p.distance)||p.distance<0)return false;
 const [a,b]=endpoints(m,l.beam),L=Math.hypot(b.x-a.x,b.y-a.y);
 return p.distance<=L+1e-7&&Math.abs(l.t-(p.from==='start'?p.distance/L:1-p.distance/L))<1e-6;
}

// Recover endpoint attachments in older drafts; interior stations remain distance dimensions.
// Coordinates and structural results are unchanged by this migration.
export function withLoadPositions(m:Model){
 for(const l of m.loads){if(l.type==='distributed')continue;if(!l.attachment&&!l.position?.fixed&&(l.t<1e-8||l.t>1-1e-8)){l.attachment=l.t<.5?'start':'end';delete l.position;}else if(!l.attachment&&!l.position){const [a,b]=endpoints(m,l.beam);l.position={from:'start',distance:l.t*Math.hypot(b.x-a.x,b.y-a.y),fixed:true};}}
 updateLoadStations(m);orientLoads(m);return m;
}

// The supplied drawing's nominal dimensions do not describe two exactly
// straight diagonals. Keep four rigidly connected segments without imposing
// collinearity, so every entered drawing dimension is satisfied exactly.
export function elevatorDrawing():Model{
 const node=(id:string,x:number,y:number):Node=>({id,x,y,joint:'rigid',support:id==='N5'?'free':'pinned'}),beam=(id:string,a:string,b:string):Beam=>({...beamDefaults,id,a,b,family:id,profile:'S235JR · CAD section',A:.0008548,I:4.3551e-7});
 return {nodes:[node('N1',0,4.616),node('N2',4.98,.919),node('N3',0,0),node('N4',4.98,3.705),node('N5',3.09,2.312)],beams:[beam('B1','N3','N5'),beam('B2','N5','N4'),beam('B3','N1','N5'),beam('B4','N5','N2')],loads:[{id:'L1',beam:'B1',t:1,attachment:'end',type:'force',fx:0,fy:-12,m:0,case:'Q'},{id:'L2',beam:'B1',t:1,attachment:'end',type:'force',fx:3,fy:0,m:0,case:'Q'},{id:'L3',beam:'B1',t:1,attachment:'end',type:'moment',fx:0,fy:0,m:1,case:'Q'}],dimensionUnits:'mm',sketchConstraints:[{id:'anchor',type:'coincident',a:ORIGIN,b:'N3'},{id:'left',scope:'points',type:'vertical',a:'N3',b:'N1'},{id:'right',scope:'points',type:'vertical',a:'N2',b:'N4'}],dimensions:[{id:'leftSpan',kind:'horizontal',a:'N3',b:'N5',value:3.09,sense:1,driving:true,offset:45},{id:'rightSpan',kind:'horizontal',a:'N5',b:'N4',value:1.89,sense:1,driving:true,offset:-45},{id:'leftUpper',kind:'vertical',a:'N5',b:'N1',value:2.304,sense:1,driving:true,offset:-75},{id:'leftLower',kind:'vertical',a:'N3',b:'N5',value:2.312,sense:1,driving:true,offset:-75},{id:'rightUpper',kind:'vertical',a:'N5',b:'N4',value:1.393,sense:1,driving:true,offset:75},{id:'rightLower',kind:'vertical',a:'N2',b:'N5',value:1.393,sense:1,driving:true,offset:75}]};
}

export function setConstraintSuppressed(m:Model,id:string,suppressed:boolean){
 const next=structuredClone(m),c=next.constraints?.find(c=>c.id===id)??next.sketchConstraints?.find(c=>c.id===id);if(!c)throw Error('This constraint no longer exists.');
 c.suppressed=suppressed;
 if(!suppressed){const conflict=dimensionConflict(next,'');if(conflict.length)throw Error('Cannot re-enable this constraint: it conflicts with '+relationNames(next,conflict.filter(x=>x!==id)).join(', ')+'.');}
 enforceConstraints(next);if(!validModel(next))throw Error('The constraint cannot be changed in the current sketch.');return next;
}
