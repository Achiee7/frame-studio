import type {SpatialMember,SpatialModel,SpatialNode,Vec3} from './spatial-model.ts';
import {cross,minus,norm,times,zero} from './spatial-analysis-element.ts';
import type {Element} from './spatial-analysis-element.ts';
import type {SpatialSystem} from './spatial-analysis-system.ts';

export type SpatialInstability={
  kind:'translation'|'rotation';
  title:string;detail:string;guidance:string;
  primaryNode:string;
  motions:{node:string;vector:Vec3}[];
  members:string[];
  supportAxis?:[string,string];
  /** Applied moment in kN·m, positive by the right-hand rule from the first support to the second. */
  axisMoment?:number;
};
export class SpatialInstabilityError extends Error {
  instability:SpatialInstability;
  constructor(instability:SpatialInstability){
    super('Unstable 3D frame. '+(instability.kind==='rotation'?'An applied moment acts about an unrestrained rotation. ': '')+instability.title);
    this.instability=instability;
  }
}

const at=(vector:number[],i:number):Vec3=>({x:vector[i],y:vector[i+1],z:vector[i+2]});
const axes=['x','y','z'] as const;
const movingTolerance=1e-6;
function direction(v:Vec3){
  const magnitude=norm(v);
  const active=axes.filter(axis=>Math.abs(v[axis])>.01*magnitude)
    .sort((a,b)=>Math.abs(v[b])-Math.abs(v[a]));
  const main='global '+active[0].toUpperCase();
  if(Math.abs(v[active[0]])>=.999999*magnitude)return 'along '+main;
  if(Math.abs(v[active[0]])>=.9*magnitude)return 'mainly along '+main;
  return 'in a direction with components along global '+active.map(axis=>axis.toUpperCase()).join('/');
}

function componentAt(model:SpatialModel,id:string){
  const attached=new Map<string,SpatialMember[]>();
  for(const member of model.members)for(const key of [member.a,member.b]){
    const list=attached.get(key);
    if(list)list.push(member);else attached.set(key,[member]);
  }
  const ids=new Set([id]),spans=new Set<SpatialMember>();
  for(const key of ids)for(const member of attached.get(key)??[]){
    ids.add(member.a);ids.add(member.b);spans.add(member);
  }
  return {nodes:model.nodes.filter(n=>ids.has(n.id)),members:[...spans]};
}

function supportAxisMotion(nodes:SpatialNode[],system:SpatialSystem,translations:Map<string,number>,rotations:Map<string,Map<string,number>>){
  const anchors=nodes.filter(n=>n.support==='pinned'||n.support==='fixed');
  if(anchors.length<2)return;
  let length=0,start=anchors[0],end=anchors[1];
  for(let i=0;i<anchors.length;i++)for(const b of anchors.slice(i+1)){
    const d=norm(minus(b,anchors[i]));
    if(d>length){length=d;start=anchors[i];end=b;}
  }
  if(!length)return;
  const axis=times(minus(end,start),1/length),candidate=system.load.map(()=>0);
  const motion=new Map<string,Vec3>();
  for(const n of nodes){
    const v=cross(axis,minus(n,start)),i=translations.get(n.id)!;
    motion.set(n.id,v);
    for(const [j,key] of axes.entries()){
      candidate[i+j]=v[key];
      for(const r of rotations.get(n.id)!.values()){
        if(system.fixed.has(r+j)&&Math.abs(axis[key])>1e-10)return;
        candidate[r+j]=axis[key];
      }
    }
  }
  const amplitude=Math.max(...[...motion.values()].map(norm));
  if(amplitude<=length*1e-10)return;
  for(const n of nodes){
    const v=motion.get(n.id)!,i=translations.get(n.id)!;
    for(const [j,key] of axes.entries()){
      if((system.fixed.has(i+j)||n.support==='spring'&&key==='z')&&Math.abs(v[key])>amplitude*1e-9)return;
    }
  }
  // The nullspace basis can mix a uniform rotation with local mechanisms.
  // Present the more interpretable candidate only if the assembled frame also
  // verifies that this specific rigid rotation produces zero restoring force.
  for(const row of system.stiffness){
    let residual=0,magnitude=0;
    for(const [j,k] of row){const term=k*candidate[j];residual+=term;magnitude+=Math.abs(term);}
    if(Math.abs(residual)>1e-8*magnitude)return;
  }
  // For a unit rotation, external virtual work equals the resultant applied
  // moment about the directed axis. The assembled load includes member loads
  // and couples; disconnected groups contribute zero to this component's work.
  const axisMoment=system.load.reduce((work,force,i)=>work+force*candidate[i],0);
  return {motion,axis:[start.id,end.id] as [string,string],axisMoment};
}

export function describeSpatialInstability(kind:SpatialInstability['kind'],physical:number[],model:SpatialModel,system:SpatialSystem,
  translations:Map<string,number>,rotations:Map<string,Map<string,number>>,elements:Map<string,Element>):SpatialInstability{
  let motion=new Map<string,Vec3>();
  for(const [id,i] of translations){
    if(kind==='translation'){motion.set(id,at(physical,i));continue;}
    // Different beam families at a pin have independent rotations. Display
    // the strongest participating family rather than cancelling their arrows.
    let strongest=zero();
    for(const r of rotations.get(id)!.values()){
      const v=at(physical,r);
      if(norm(v)>norm(strongest))strongest=v;
    }
    motion.set(id,strongest);
  }
  const largest=[...motion].reduce((best,e)=>norm(e[1])>norm(best[1])?e:best);
  const group=componentAt(model,largest[0]);
  const axisMode=kind==='translation'?supportAxisMotion(group.nodes,system,translations,rotations):undefined;
  if(axisMode)motion=axisMode.motion;
  const maximum=Math.max(...group.nodes.map(n=>norm(motion.get(n.id)!)));
  const motions=group.nodes.map(n=>({node:n.id,vector:times(motion.get(n.id)!,1/maximum)}))
    .filter(m=>norm(m.vector)>movingTolerance).sort((a,b)=>norm(b.vector)-norm(a.vector));
  const primaryNode=motions[0].node,v=motions[0].vector,axesLabel=direction(v);
  const moving=new Set(motions.map(m=>m.node));
  const affected=group.members.filter(m=>{
    if(!moving.has(m.a)&&!moving.has(m.b))return false;
    if(kind==='translation'||m.kind==='strut')return true;
    const {dofs}=elements.get(m.id)!;
    return [3,9].some(i=>norm(at(physical,dofs[i]))>maximum*movingTolerance);
  });
  const members=affected.map(m=>m.id);
  const info={kind,primaryNode,motions,members};
  if(axisMode){
    const [a,b]=axisMode.axis;
    return {...info,supportAxis:axisMode.axis,axisMoment:axisMode.axisMoment,title:'The frame can rotate about '+a+'–'+b+'.',
      detail:'Both supports hold their joint positions. The frame can turn around the line between them, moving '+primaryNode+' '+axesLabel+'.',
      guidance:'Check which physical brace or moment-resisting connection restrains rotation about this line.'};
  }
  const primaryMembers=group.members.filter(m=>m.a===primaryNode||m.b===primaryNode);
  if(kind==='rotation')return {...info,title:'Unrestrained rotation at '+primaryNode+'.',
    detail:'The applied loading drives a free rotation with its axis '+axesLabel+'.'+(primaryMembers.every(m=>m.kind==='strut')?' Only axial struts meet at this joint.':''),
    guidance:'Inspect the moment direction, the beam end connections and the rotational restraints in the highlighted group.'};
  if(group.nodes.every(n=>n.support==='free'))return {...info,title:'The group containing '+primaryNode+' has no support.',
    detail:primaryNode+' moves '+axesLabel+' in one free motion of this group.',
    guidance:'Inspect where this group is attached to the supported structure or restrained by its real supports.'};
  const uniform=group.nodes.every(n=>norm(minus(times(motion.get(n.id)!,1/maximum),v))<1e-5);
  if(uniform)return {...info,title:'The frame can slide '+axesLabel+'.',
    detail:'All joints in the group containing '+primaryNode+' can translate together in this direction.',
    guidance:'Inspect the support directions and the attachment to the surrounding structure.'};
  return {...info,title:primaryNode+' can move '+axesLabel+'.',
    detail:primaryMembers.every(m=>m.kind==='strut')?'Only axial struts meet at '+primaryNode+'. Their axial stiffness and the current restraints leave this motion free.':
      'The assembled members and support restraints leave the highlighted motion free.',
    guidance:'Inspect the connected members at '+primaryNode+' and the physical bracing or restraints in the indicated direction.'};
}
