import type {Joint} from './model.ts';
import {closestOnSpan,placeSpatialJoint,spatialJoinTolerance,spatialMemberIntersection,updateSpatialNode} from './spatial-model.ts';
import type {SpatialModel,Vec3} from './spatial-model.ts';
import {createSpatialRule} from './spatial-sketch.ts';

export type SpatialConnectionCandidate = {
  id:string; kind:'crossing'|'nodeOnMember'|'nearNodes'; point:Vec3; nodes:string[]; members:string[]; gap:number;
};
type Contact={point:Vec3;node?:string;members:Set<string>};
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const tolerance=spatialJoinTolerance;
const axes=['x','y','z'] as const;
const key=(kind:SpatialConnectionCandidate['kind'],ids:string[])=>JSON.stringify([kind,...ids.slice().sort()]);

export function auditSpatialConnections(model:SpatialModel,maxGap=0.001){
  const nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const incident=new Map(model.nodes.map(n=>[n.id,[] as string[]]));
  const spans=model.members.map(m=>{
    incident.get(m.a)!.push(m.id);incident.get(m.b)!.push(m.id);
    const a=nodes.get(m.a)!,b=nodes.get(m.b)!;
    const min={x:Math.min(a.x,b.x)-tolerance,y:Math.min(a.y,b.y)-tolerance,z:Math.min(a.z,b.z)-tolerance};
    const max={x:Math.max(a.x,b.x)+tolerance,y:Math.max(a.y,b.y)+tolerance,z:Math.max(a.z,b.z)+tolerance};
    return {m,a,b,min,max};
  });
  const members=new Map(model.members.map(m=>[m.id,m]));
  const isolated=model.nodes.filter(n=>!incident.get(n.id)!.length).map(n=>n.id);
  const joined=model.nodes.filter(n=>incident.get(n.id)!.length>1).map(n=>({node:n.id,members:incident.get(n.id)!}));
  const components:{nodes:string[];members:string[]}[]=[];
  const componentByNode=new Map<string,number>();
  const visited=new Set<string>();
  for(const {a} of spans){
    if(visited.has(a.id))continue;
    const queue=[a.id],group=new Set<string>();visited.add(a.id);
    for(let i=0;i<queue.length;i++){
      const id=queue[i];
      for(const memberId of incident.get(id)!){
        group.add(memberId);
        const m=members.get(memberId)!,other=m.a===id?m.b:m.a;
        if(!visited.has(other)){visited.add(other);queue.push(other);}
      }
    }
    for(const id of queue)componentByNode.set(id,components.length);
    components.push({nodes:queue,members:[...group]});
  }

  // Group all members meeting at one physical location. In crowded frames a
  // single joint may connect three or more members and must be offered once.
  const buckets=new Map<string,Contact[]>(),contacts:Contact[]=[];
  function record(point:Vec3,memberIds:string[],node?:string){
    const [x,y,z]=axes.map(axis=>Math.floor(point[axis]/tolerance));
    let contact:Contact|undefined;
    for(let dx=-1;dx<=1&&!contact;dx++)for(let dy=-1;dy<=1&&!contact;dy++)for(let dz=-1;dz<=1&&!contact;dz++){
      contact=buckets.get([x+dx,y+dy,z+dz].join('/'))?.find(c=>distance(c.point,point)<=tolerance);
    }
    if(!contact){
      contact={point,node,members:new Set()};contacts.push(contact);
      const cell=[x,y,z].join('/'),bucket=buckets.get(cell);
      if(bucket)bucket.push(contact);else buckets.set(cell,[contact]);
    }
    for(const id of memberIds)contact.members.add(id);
  }
  for(const {m,a,b,min,max} of spans){
    for(const node of model.nodes){
      if(m.a===node.id||m.b===node.id||axes.some(axis=>node[axis]<min[axis]||node[axis]>max[axis]))continue;
      if(distance(node,a)<=tolerance||distance(node,b)<=tolerance)continue;
      if(distance(closestOnSpan(node,a,b),node)<=tolerance)record(node,[m.id,...incident.get(node.id)!],node.id);
    }
  }
  for(let i=0;i<spans.length;i++)for(let j=i+1;j<spans.length;j++){
    const first=spans[i],second=spans[j];
    if(first.a===second.a||first.a===second.b||first.b===second.a||first.b===second.b)continue;
    if(axes.some(axis=>first.max[axis]<second.min[axis]||second.max[axis]<first.min[axis]))continue;
    const point=spatialMemberIntersection(first.a,first.b,second.a,second.b);
    if(point&&[first.a,first.b,second.a,second.b].every(n=>distance(point,n)>tolerance))
      record(point,[first.m.id,second.m.id]);
  }
  const candidates:SpatialConnectionCandidate[]=contacts.map(c=>{
    const kind=c.node?'nodeOnMember':'crossing',nodes=c.node?[c.node]:[],members=[...c.members];
    return {id:key(kind,c.node?[c.node]:members),kind,point:c.point,nodes,members,gap:0};
  });

  // Nearby endpoints are explicit proposals with a measured gap. A candidate
  // never joins merely because lines overlap in the current camera projection.
  const gapLimit=Number.isFinite(maxGap)?Math.max(0,maxGap):0;
  if(gapLimit>0)for(let i=0;i<model.nodes.length;i++)for(let j=i+1;j<model.nodes.length;j++){
    const a=model.nodes[i],b=model.nodes[j];
    const left=incident.get(a.id)!,right=incident.get(b.id)!;
    if(componentByNode.get(a.id)===componentByNode.get(b.id)&&left.length>1&&right.length>1)continue;
    if(left.some(id=>right.includes(id)))continue;
    const gap=distance(a,b);
    if(gap>gapLimit)continue;
    const keep=b.positionLocked&&!a.positionLocked||!a.positionLocked&&!b.positionLocked&&right.length>left.length?b:a;
    const nodes=keep===a?[a.id,b.id]:[b.id,a.id];
    candidates.push({id:key('nearNodes',nodes),kind:'nearNodes',nodes,members:[...left,...right],point:keep,gap});
  }
  return {candidates,components,isolated,joined};
}

export function connectSpatialCandidate(model:SpatialModel,candidate:SpatialConnectionCandidate,joint:Joint){
  const current=auditSpatialConnections(model,candidate.kind==='nearNodes'?candidate.gap+tolerance:0).candidates.find(c=>c.id===candidate.id);
  if(!current)throw Error('This connection has changed. Review the current drawing.');
  if(current.kind==='nearNodes'){
    // Use the sketch solver's physical merge so locks, supports, rules and
    // nodal loads follow the surviving joint. All changes are atomic.
    const selected=new Set(current.nodes);
    const staged={...model,nodes:model.nodes.map(n=>selected.has(n.id)?{...n,joint}:n)};
    const next=createSpatialRule(staged,'connect',current.nodes.map(id=>({type:'node',id})));
    return {model:next,node:next.nodes.find(n=>n.id===current.nodes[0])!};
  }
  const placed=placeSpatialJoint(model,current.point);
  const next=placed.node.joint===joint?placed.model:updateSpatialNode(placed.model,placed.node.id,{joint});
  return {model:next,node:next.nodes.find(n=>n.id===placed.node.id)!};
}
