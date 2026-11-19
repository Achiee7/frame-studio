import type {SpatialModel,SpatialNode,Vec3} from './spatial-model.ts';
import {validSpatialAnalysisInput} from './spatial-analysis-input.ts';
import {modelRange} from './analysis-validity.ts';
import {SpatialSystem} from './spatial-analysis-system.ts';
import {addMemberLoad,assembleElement,createElement,cross,endState,minus,norm,plus,recover,times,zero} from './spatial-analysis-element.ts';
import type {Element,SpatialSample} from './spatial-analysis-element.ts';

export type {SpatialSample} from './spatial-analysis-element.ts';
export type SpatialResult = {
  nodes:{id:string;displacement:Vec3;rotation:Vec3|null}[];
  reactions:{id:string;force:Vec3;moment:Vec3}[];
  members:{id:string;localX:Vec3;localY:Vec3;localZ:Vec3;samples:SpatialSample[]}[];
  maxDisplacement:number;equilibrium:{force:Vec3;moment:Vec3};warnings:string[];
};
type Wrench={force:Vec3;moment:Vec3};
function wrench():Wrench{return {force:zero(),moment:zero()};}
function accumulate(total:Wrench,point:Vec3,force:Vec3,moment:Vec3){
  total.force=plus(total.force,force);
  total.moment=plus(total.moment,plus(moment,cross(point,force)));
}
const xyz=(values:number[],i:number):Vec3=>({x:values[i],y:values[i+1],z:values[i+2]});
const indices=(i:number)=>[i,i+1,i+2];
const released=[-1,-1,-1];
function addLoad(loads:number[],i:number,v:Vec3){loads[i]+=v.x;loads[i+1]+=v.y;loads[i+2]+=v.z;}

// Roots in the interior of [0,1]. The derivative's roots bracket every monotone
// segment, including extrema between regular diagram samples.
function polynomialRoots(values:number[]):number[] {
  const scale=Math.max(...values.map(Math.abs));
  if(!scale)return [];
  const p=values.map(v=>v/scale);
  while(p.length>1 && Math.abs(p[p.length-1])<1e-13)p.pop();
  if(p.length<2)return [];
  if(p.length===2){const x=-p[0]/p[1];return x>0&&x<1?[x]:[];}
  const value=(x:number)=>p.reduceRight((sum,c)=>sum*x+c,0);
  const critical=polynomialRoots(p.slice(1).map((c,i)=>c*(i+1)));
  const bounds=[0,...critical,1],roots=critical.filter(x=>Math.abs(value(x))<1e-12);
  for(let i=1;i<bounds.length;i++){
    let low=bounds[i-1],high=bounds[i],f=value(low);
    if(f*value(high)>=0)continue;
    for(let k=0;k<45;k++){
      const mid=(low+high)/2,g=value(mid);
      if((f<0)===(g<0)){low=mid;f=g;}else high=mid;
    }
    roots.push((low+high)/2);
  }
  return roots.sort((a,b)=>a-b);
}
function normDerivative(polys:number[][]){
  const result=Array<number>(2*Math.max(...polys.map(p=>p.length))-2).fill(0);
  for(const p of polys)for(let i=0;i<p.length;i++)for(let j=1;j<p.length;j++)result[i+j-1]+=p[i]*j*p[j];
  return result;
}
function sampleElement(element:Element,U:number[]){
  const {d,end}=endState(element,U);
  const {section:{E,A,Iy,Iz},uniform:q,length:L}=element;
  const stations=new Set<number>(Array.from({length:25},(_,j)=>j/24));
  const breaks=[...new Set([0,1,...element.points.map(p=>p.t)])].sort((a,b)=>a-b);
  for(let k=1;k<breaks.length;k++){
    const a=breaks[k-1],b=breaks[k],h=(b-a)*L;
    stations.add(a);stations.add(b);
    const {sample:s,slope,localDisplacement:u}=recover(element,d,end,a);
    const ux=[u.x,slope.x*h,-q.x*h*h/(2*E*A)],uy=[u.y,slope.y*h],uz=[u.z,slope.z*h];
    const my=[s.My,s.Vz*h,-q.z*h*h/2],mz=[s.Mz,-s.Vy*h,q.y*h*h/2];
    if(element.member.kind==='beam'){
      uy.push(s.Mz*h*h/(2*E*Iz),-s.Vy*h**3/(6*E*Iz),q.y*h**4/(24*E*Iz));
      uz.push(-s.My*h*h/(2*E*Iy),-s.Vz*h**3/(6*E*Iy),q.z*h**4/(24*E*Iy));
    }
    for(const polynomial of [normDerivative([ux,uy,uz]),normDerivative([my,mz]),[my[1],2*my[2]],[mz[1],2*mz[2]]]){
      for(const root of polynomialRoots(polynomial))stations.add(a+(b-a)*root);
    }
  }
  const jumps=new Set(element.points.map(p=>p.t));
  const samples:SpatialSample[]=[];
  for(const t of [...stations].sort((a,b)=>a-b)){
    for(const left of jumps.has(t)?[true,false]:[false]){
      const result=recover(element,d,end,t,left);
      if(Object.values(result.sample).flatMap(v=>typeof v==='number'?[v]:Object.values(v)).some(v=>!Number.isFinite(v)))throw Error('No finite 3D displacement or member forces could be recovered.');
      if(result.relative>modelRange.relativeDisplacement||result.rotation>modelRange.rotation||Math.abs(result.strain)>modelRange.strain)
        throw Error('Member '+element.member.id+' exceeds the small-displacement range of the linear 3D model. A geometrically nonlinear analysis is required.');
      samples.push(result.sample);
    }
  }
  return samples;
}

/** Prismatic Euler–Bernoulli bending and extension, Saint-Venant torsion, global XYZ loads.
 * The equilibrium moment sums are taken about the global origin. */
export function solveSpatial(model:SpatialModel):SpatialResult{
  if(!model.members.length)throw Error('Draw a beam or strut to calculate 3D results.');
  if(!validSpatialAnalysisInput(model))throw Error('Check the 3D member properties, load targets and spring stiffnesses.');
  const byId=new Map(model.nodes.map(n=>[n.id,n]));
  const connected=new Set(model.members.flatMap(b=>[b.a,b.b]));
  const system=new SpatialSystem(),translations=new Map<string,number>();
  const rotations=new Map<string,Map<string,number>>(),warnings:string[]=[];
  const nodes=model.nodes.filter(n=>connected.has(n.id));
  if(nodes.length<model.nodes.length)warnings.push('Unloaded joints without attached members were omitted.');
  for(const node of nodes){
    const t=system.nextTriple(true);translations.set(node.id,t);rotations.set(node.id,new Map());
    if(node.support==='fixed'||node.support==='pinned')indices(t).forEach(i=>system.fixed.add(i));
    if(node.support==='roller'||node.support==='guided')system.fixed.add(t+2);
    if(node.support==='rollerX')system.fixed.add(t);
    if(node.support==='spring')system.add(t+2,t+2,node.spring??10000);
    if((node.support==='fixed'||node.support==='guided')&&node.joint!=='rigid')warnings.push('Joint '+node.id+' releases its member rotations at the support.');
  }
  function rotationDofs(node:SpatialNode,key:string){
    const groups=rotations.get(node.id)!;
    if(!groups.has(key)){
      const r=system.nextTriple(false);groups.set(key,r);
      if(node.joint==='rigid'&&(node.support==='fixed'||node.support==='guided'))indices(r).forEach(i=>system.fixed.add(i));
    }
    return indices(groups.get(key)!);
  }
  const elements=new Map<string,Element>();
  for(const member of model.members){
    const a=byId.get(member.a),b=byId.get(member.b);
    if(!a||!b||a===b)throw Error('Check the end joints of member '+member.id+'.');
    const dofs=[a,b].flatMap(node=>{
      const group=node.joint==='rigid'?'':node.joint==='pin'?member.family??member.id:member.id;
      return [...indices(translations.get(node.id)!),...(member.kind==='beam'?rotationDofs(node,group):released)];
    });
    elements.set(member.id,createElement(member,a,b,dofs));
  }
  const external=wrench();
  let forceScale=0,momentScale=0;
  function count(point:Vec3,force:Vec3,moment:Vec3){
    forceScale+=norm(force);momentScale+=norm(cross(point,force))+norm(moment);
    accumulate(external,point,force,moment);
  }
  for(const load of model.loads??[]){
    if(!norm(load.vector))continue;
    const force=load.kind==='moment'?zero():load.vector,moment=load.kind==='moment'?load.vector:zero();
    if(load.target==='node'){
      const t=translations.get(load.targetId),node=byId.get(load.targetId)!;
      if(t===undefined)throw Error('Load '+load.id+' is on a joint without an attached member.');
      addLoad(system.load,t,force);
      if(load.kind==='moment'){
        if(node.joint!=='rigid')throw Error('Load '+load.id+' needs a rigid joint for a nodal moment. Apply it to a specific beam end at this connection.');
        const r=rotationDofs(node,'')[0];addLoad(system.load,r,moment);
      }
      count(node,force,moment);
    }else{
      const element=elements.get(load.targetId)!,position=plus(element.start,times(element.basis.x,(load.kind==='distributed'?0.5:load.t)*element.length));
      count(position,load.kind==='distributed'?times(force,element.length):force,moment);
      if(load.kind!=='distributed'&&(load.t===0||load.t===1)){
        const end=load.t*6;
        addLoad(system.load,element.dofs[end],force);
        if(load.kind==='moment'){
          if(element.member.kind==='strut')throw Error('A strut has no rotational stiffness. Apply the moment to a rigid joint or beam.');
          addLoad(system.load,element.dofs[end+3],moment);
        }
      }else addMemberLoad(element,load);
    }
  }
  for(const element of elements.values())assembleElement(system,element);
  const {U,R,indeterminate}=system.solve();
  if(indeterminate.size)warnings.push('A free spin has no unique joint rotation. Displacements, member forces and reactions are resolved.');
  const nodal=nodes.map(n=>{
    const t=translations.get(n.id)!,groups=rotations.get(n.id)!,r=groups.size===1?[...groups.values()][0]:undefined;
    const rotation=r!==undefined&&!indices(r).some(i=>indeterminate.has(i))?xyz(U,r):null;
    return {id:n.id,displacement:xyz(U,t),rotation};
  });
  const reactions=nodes.filter(n=>n.support!=='free').map(n=>{
    const t=translations.get(n.id)!,force=zero();
    if(system.fixed.has(t))force.x=R[t];
    if(system.fixed.has(t+1))force.y=R[t+1];
    if(system.fixed.has(t+2))force.z=R[t+2];
    if(n.support==='spring')force.z=-(n.spring??10000)*U[t+2];
    let moment=zero();
    for(const r of rotations.get(n.id)!.values())if(system.fixed.has(r))moment=plus(moment,xyz(R,r));
    count(n,force,moment);
    return {id:n.id,force,moment};
  });
  const size=Math.max(...[...elements.values()].map(element=>element.length));
  if(norm(external.force)>1e-7*Math.max(1e-10,forceScale,momentScale/size)||norm(external.moment)>1e-7*Math.max(1e-10,momentScale,forceScale*size)){
    throw Error('Global 3D equilibrium could not be resolved to numerical tolerance. Check the model and support conditions.');
  }
  let maxDisplacement=0;
  const members=[...elements.values()].map(e=>{
    const samples=sampleElement(e,U);
    for(const p of samples)maxDisplacement=Math.max(maxDisplacement,norm(p.displacement));
    return {id:e.member.id,localX:e.basis.x,localY:e.basis.y,localZ:e.basis.z,samples};
  });
  return {nodes:nodal,reactions,members,maxDisplacement,equilibrium:external,warnings};
}
