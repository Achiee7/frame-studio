import {validSpatialModel} from './spatial-model.ts';
import type {SpatialModel, Vec3} from './spatial-model.ts';

import type {GeometryPick,SketchAction} from './sketch-actions.ts';

export const SPATIAL_ORIGIN = '@origin';
export type SpatialRef = GeometryPick;
export type SpatialAction = SketchAction;
/** Member operands retain their full original span when an intermediate joint is inserted. */
type Operand = SpatialRef & {segments?:string[]};
export type SpatialRule = {
  id:string; kind:SpatialAction; refs:Operand[]; points:string[];
  value?:number; sense?:1|-1; driven?:boolean; suppressed?:boolean; labelOffset?:{x:number;y:number};
};
type Axis = keyof Vec3;
type Positions = Map<string, Vec3>;
const axes:Axis[] = ['x', 'y', 'z'];
const origin:Vec3 = {x:0, y:0, z:0};
const positionLimit = 1e12, memberTolerance = 1e-6, solveTolerance = 1e-8;
const axisOf = {alongX:'x', alongY:'y', alongZ:'z', dx:'x', dy:'y', dz:'z'} as const;
const actions = new Set<string>(['connect','alongX','alongY','alongZ','pointOnMember','midpoint',
  'equal','parallel','perpendicular','collinear','length','dx','dy','dz','offset','angle']);
export const isSpatialDimension = (kind:SpatialAction) =>
  kind==='length'||kind==='dx'||kind==='dy'||kind==='dz'||kind==='offset'||kind==='angle';

const minus = (a:Vec3,b:Vec3):Vec3 => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const plus = (a:Vec3,b:Vec3):Vec3 => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const scale = (p:Vec3,k:number):Vec3 => ({x:p.x*k,y:p.y*k,z:p.z*k});
const dot = (a:Vec3,b:Vec3) => a.x*b.x+a.y*b.y+a.z*b.z;
const cross = (a:Vec3,b:Vec3):Vec3 => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const size = (p:Vec3) => Math.hypot(p.x,p.y,p.z);
const unit = (p:Vec3) => scale(p,1/Math.max(1e-14,size(p)));
const components = (p:Vec3) => [p.x,p.y,p.z];
const positions = (m:SpatialModel):Positions => new Map([[SPATIAL_ORIGIN,origin], ...m.nodes.map(n=>[n.id,n] as [string,Vec3])]);
const isAxisRule = (kind:SpatialAction) => kind==='alongX'||kind==='alongY'||kind==='alongZ';
const isComponent = (kind:SpatialAction) => kind==='dx'||kind==='dy'||kind==='dz';
const isMixed = (kind:SpatialAction) => kind==='pointOnMember'||kind==='midpoint'||kind==='offset';
const active = (r:SpatialRule) => !r.driven && !r.suppressed;
const pathOf = (ref:Operand) => ref.segments ?? [ref.id];

function normalTo(direction:Vec3, preferred:Vec3):Vec3 {
  const normal=minus(preferred,scale(direction,dot(preferred,direction)));
  if(size(normal)>1e-10)return unit(normal);
  const least=axes.reduce((a,b)=>Math.abs(direction[a])<Math.abs(direction[b])?a:b);
  return unit(cross(direction,{...origin,[least]:1}));
}
function footOnLine(a:Vec3,b:Vec3,p:Vec3,bounded:boolean) {
  const ab=minus(b,a), t=dot(minus(p,a),ab)/Math.max(1e-28,dot(ab,ab));
  return plus(a,scale(ab,bounded?Math.min(1,Math.max(0,t)):t));
}
function angle(u:Vec3,v:Vec3) {return Math.atan2(size(cross(u,v)),dot(u,v));}

function rulePoints(model:SpatialModel,kind:SpatialAction,refs:Operand[]):string[] {
  if(!actions.has(kind)||refs.length<1||refs.length>2)throw Error('Choose geometry for this relation.');
  if(refs.length===2&&refs[0].type===refs[1].type&&refs[0].id===refs[1].id)throw Error('Choose two different objects.');
  const nodes=new Set(model.nodes.map(n=>n.id)), members=new Map(model.members.map(m=>[m.id,m]));
  const operands=refs.map(ref=>{
    if(ref.type==='node'){
      if(ref.segments||ref.id!==SPATIAL_ORIGIN&&!nodes.has(ref.id))throw Error('Choose an existing joint.');
      return [ref.id];
    }
    if(ref.type!=='member')throw Error('Choose a joint or a member.');
    const ids=pathOf(ref);
    if(!Array.isArray(ids)||!ids.length||ids[0]!==ref.id||new Set(ids).size!==ids.length||ids.length>model.members.length)throw Error('This member span is incomplete.');
    const path=ids.map(id=>members.get(id));
    if(path.some((m,i)=>!m||i>0&&m.a!==path[i-1]!.b))throw Error('This member span is incomplete.');
    return [path[0]!.a,path.at(-1)!.b];
  });
  if(kind==='connect'){
    if(operands.length===2&&operands.every(p=>p.length===1))return operands.flat();
  }else if(isAxisRule(kind)||isComponent(kind)||kind==='length'){
    if(operands.length===1&&operands[0].length===2||operands.length===2&&operands.every(p=>p.length===1))return operands.flat();
  }else if(isMixed(kind)){
    const line=operands.find(p=>p.length===2), point=operands.find(p=>p.length===1);
    if(line&&point&&!line.includes(point[0]))return [...line,point[0]];
  }else if(operands.length===2&&operands.every(p=>p.length===2)){
    const [line1,line2]=operands;
    if(kind==='angle'){
      const shared=line1.find(p=>line2.includes(p));
      if(shared)return [shared,line1.find(p=>p!==shared)!,shared,line2.find(p=>p!==shared)!];
    }
    return [...line1,...line2];
  }
  throw Error('This relation is unavailable for the selected geometry.');
}

function numberAllowed(kind:SpatialAction,v:unknown):v is number {
  if(typeof v!=='number'||!Number.isFinite(v)||v<0)return false;
  if(kind==='angle')return v<=180;
  if(kind==='length'&&v<=memberTolerance)return false;
  return v<positionLimit;
}

function measure(pts:Positions,kind:SpatialAction,ids:string[]) {
  const [a,b,c,d]=ids.map(id=>pts.get(id)!);
  const ab=minus(b,a);
  if(isComponent(kind))return Math.abs(ab[axisOf[kind as 'dx'|'dy'|'dz']]);
  if(kind==='length')return size(ab);
  if(kind==='angle')return angle(ab,minus(d,c))*180/Math.PI;
  if(kind==='offset')return size(minus(c,footOnLine(a,b,c,false)));
  throw Error('Choose a dimension to measure.');
}
export function spatialMeasurement(model:SpatialModel,kind:SpatialAction,refs:SpatialRef[]) {
  return measure(positions(model),kind,rulePoints(model,kind,refs));
}
export function spatialRuleValue(model:SpatialModel,rule:SpatialRule) {
  return measure(positions(model),rule.kind,rule.points);
}

function residual(pts:Positions,kind:SpatialAction,ids:string[],target=0,sense=1):number[] {
  const [a,b,c,d]=ids.map(id=>pts.get(id)!);
  const ab=minus(b,a);
  if(kind==='connect')return components(ab);
  if(isAxisRule(kind))return axes.filter(i=>i!==axisOf[kind as 'alongX'|'alongY'|'alongZ']).map(i=>ab[i]);
  if(isComponent(kind))return [ab[axisOf[kind as 'dx'|'dy'|'dz']]-sense*target];
  if(kind==='length')return [size(ab)-target];
  if(kind==='midpoint')return components(minus(c,plus(a,scale(ab,.5))));
  if(kind==='pointOnMember'||kind==='offset'){
    const normal=minus(c,footOnLine(a,b,c,kind==='pointOnMember'));
    return kind==='offset'&&target>0?[size(normal)-target]:components(normal);
  }
  const cd=minus(d,c),u=unit(ab),v=unit(cd);
  if(kind==='equal')return [size(cd)-size(ab)];
  if(kind==='parallel')return components(cross(u,v));
  if(kind==='perpendicular')return [dot(u,v)];
  if(kind==='collinear')return [...components(cross(u,minus(c,a))),...components(cross(u,minus(d,a)))];
  if(target===0||target===180)return [...components(cross(u,v)),dot(u,v)-(target===0?1:-1)];
  return [angle(u,v)-target*Math.PI/180];
}

function validDefinition(model:SpatialModel,r:SpatialRule) {
  if(!r||typeof r.id!=='string'||!r.id||r.id.length>100||!Array.isArray(r.refs)||!Array.isArray(r.points))return false;
  if(r.driven!==undefined&&typeof r.driven!=='boolean'||r.suppressed!==undefined&&typeof r.suppressed!=='boolean')return false;
  if(r.labelOffset!==undefined&&(!r.labelOffset||[r.labelOffset.x,r.labelOffset.y].some(v=>!Number.isFinite(v)||Math.abs(v)>10000)))return false;
  if(isSpatialDimension(r.kind)?!numberAllowed(r.kind,r.value):r.value!==undefined||r.driven)return false;
  if(r.sense!==undefined&&(!isComponent(r.kind)||r.sense!==1&&r.sense!==-1))return false;
  try{
    const ids=rulePoints(model,r.kind,r.refs);
    return ids.length===r.points.length&&ids.every((v,i)=>v===r.points[i]);
  }catch{return false;}
}

/** The displayed geometry, saved dimensions and connected topology must agree on import. */
export function validSpatialRules(model:SpatialModel):boolean {
  if(model.nodes.some(n=>n.id===SPATIAL_ORIGIN))return false;
  const rs=model.rules;
  if(rs===undefined)return true;
  if(!Array.isArray(rs)||!rs.every(r=>validDefinition(model,r))||new Set(rs.map(r=>r.id)).size!==rs.length)return false;
  const pts=positions(model);
  return equations(model).every(eq=>evaluate(pts,eq).every(v=>Math.abs(v)<=1e-6));
}
export function cleanSpatialRules(model:SpatialModel):SpatialModel {
  if(!model.rules?.length)return model;
  const rules=model.rules.filter(r=>validDefinition(model,r));
  return rules.length===model.rules.length?model:{...model,rules};
}
/** The original segment keeps its id and a new tail follows it on every affected path. */
export function trackSpatialSplits(model:SpatialModel,tails:Map<string,string>):SpatialModel {
  if(!tails.size||!model.rules?.length)return model;
  const rules=model.rules.map(r=>({...r,refs:r.refs.map(ref=>{
    if(ref.type==='node'||!pathOf(ref).some(id=>tails.has(id)))return ref;
    return {...ref,segments:pathOf(ref).flatMap(id=>tails.has(id)?[id,tails.get(id)!]:[id])};
  })}));
  return {...model,rules};
}
export function spatialRuleTouchesMember(model:SpatialModel,rule:SpatialRule,id:string) {
  const member=model.members.find(m=>m.id===id);
  return !!member&&rule.refs.some(ref=>ref.type==='member'?pathOf(ref).includes(id):ref.id===member.a||ref.id===member.b);
}

type Equation = {kind:SpatialAction;points:string[];value?:number;sense?:number};
function equations(m:SpatialModel):Equation[] {
  const rows:Equation[]=[], spans=new Set<string>(),members=new Map(m.members.map(b=>[b.id,b]));
  for(const r of m.rules??[]){
    if(!active(r))continue;
    rows.push(r);
    for(const ref of r.refs){
      if(!ref.segments?.length)continue;
      const key=JSON.stringify(ref.segments);
      if(spans.has(key))continue;
      spans.add(key);
      const path=ref.segments.map(id=>members.get(id)!);
      for(const inner of path.slice(0,-1))rows.push({kind:'pointOnMember',points:[path[0].a,path.at(-1)!.b,inner.b]});
    }
  }
  return rows;
}
function connectedEquations(all:Equation[],seeds:string[]) {
  const byId=new Map<string,Equation[]>();
  for(const row of all)for(const id of new Set(row.points)){
    if(id===SPATIAL_ORIGIN)continue;
    if(!byId.has(id))byId.set(id,[]);
    byId.get(id)!.push(row);
  }
  const seen=new Set<Equation>(),ids=new Set<string>(),queue=seeds.slice();
  for(let i=0;i<queue.length;i++){
    const id=queue[i];
    if(ids.has(id)||id===SPATIAL_ORIGIN)continue;
    ids.add(id);
    for(const row of byId.get(id)??[]){
      if(seen.has(row))continue;
      seen.add(row);queue.push(...row.points);
    }
  }
  return {rows:[...seen],ids:[...ids]};
}
type SparseRow = {columns:number[]; derivatives:number[]; error:number};
const evaluate=(pts:Positions,eq:Equation)=>residual(pts,eq.kind,eq.points,eq.value,eq.sense);
function jacobian(pts:Positions,eqs:Equation[],variables:Map<string,number>):SparseRow[] {
  const result:SparseRow[]=[];
  for(const eq of eqs){
    const rows:SparseRow[]=evaluate(pts,eq).map(error=>({columns:[],derivatives:[],error}));
    for(const id of new Set(eq.points)){
      const index=variables.get(id);
      if(index===undefined)continue;
      const p=pts.get(id)!;
      for(const [j,axis] of axes.entries()){
        const old=p[axis],h=Math.max(1e-7,Math.abs(old)*1e-10);
        p[axis]=old+h;const hi=evaluate(pts,eq);
        p[axis]=old-h;const lo=evaluate(pts,eq);
        p[axis]=old;
        for(const [k,row] of rows.entries()){
          const derivative=(hi[k]-lo[k])/(2*h);
          if(Math.abs(derivative)<1e-13)continue;
          row.columns.push(index*3+j);row.derivatives.push(derivative);
        }
      }
    }
    result.push(...rows);
  }
  return result;
}
const arrayDot=(a:Float64Array,b:Float64Array)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
/** Solve the damped normal equations without allocating a dense matrix over the whole frame. */
function correction(rows:SparseRow[],width:number,damping:number) {
  const x=new Float64Array(width),r=new Float64Array(width),diagonal=new Float64Array(width).fill(damping);
  for(const row of rows)for(let k=0;k<row.columns.length;k++){
    const i=row.columns[k],v=row.derivatives[k];
    r[i]-=v*row.error;
    diagonal[i]+=v*v;
  }
  const z=r.map((v,i)=>v/diagonal[i]),p=z.slice(),q=new Float64Array(width);
  let rz=arrayDot(r,z);
  const first=rz;
  for(let step=0;step<Math.min(width*2+4,350)&&rz>first*1e-20&&rz>1e-40;step++){
    for(let i=0;i<width;i++)q[i]=damping*p[i];
    for(const row of rows){
      let jp=0;
      for(let k=0;k<row.columns.length;k++)jp+=row.derivatives[k]*p[row.columns[k]];
      for(let k=0;k<row.columns.length;k++)q[row.columns[k]]+=row.derivatives[k]*jp;
    }
    const divisor=arrayDot(p,q);
    if(!Number.isFinite(divisor)||divisor<=0)break;
    const alpha=rz/divisor;
    for(let i=0;i<width;i++){x[i]+=alpha*p[i];r[i]-=alpha*q[i];z[i]=r[i]/diagonal[i];}
    const next=arrayDot(r,z),beta=next/rz;
    for(let i=0;i<width;i++)p[i]=z[i]+beta*p[i];
    rz=next;
  }
  return x;
}
function project(pts:Positions,eqs:Equation[],ids:string[]) {
  const valid=()=>eqs.every(eq=>evaluate(pts,eq).every(v=>Math.abs(v)<=solveTolerance));
  if(valid())return true;
  if(!ids.length)return false;
  const variables=new Map(ids.map((id,i)=>[id,i]));
  let damping=1e-6;
  for(let iteration=0;iteration<75;iteration++){
    const J=jacobian(pts,eqs,variables);
    const cost=J.reduce((s,row)=>s+row.error**2,0);
    const delta=correction(J,ids.length*3,damping);
    if(delta.every(v=>Math.abs(v)<1e-13))return false;
    const old=ids.map(id=>({...pts.get(id)!}));
    ids.forEach((id,i)=>axes.forEach((ax,j)=>{pts.get(id)![ax]=old[i][ax]+delta[3*i+j];}));
    if(valid())return true;
    const next=eqs.reduce((s,eq)=>evaluate(pts,eq).reduce((sum,n)=>sum+n*n,s),0);
    if(Number.isFinite(next)&&next<cost)damping=Math.max(1e-12,damping*.2);
    else{
      ids.forEach((id,i)=>Object.assign(pts.get(id)!,old[i]));
      damping*=10;
      if(damping>1e9)break;
    }
  }
  return false;
}
function solve(m:SpatialModel,focus:string[],preferred:string[],locked:string[]=[],reference:string[]=[]) {
  const pts=positions(m),{rows,ids}=connectedEquations(equations(m),focus);
  const old=ids.map(id=>({...pts.get(id)!}));
  const movable=ids.filter(id=>!locked.includes(id));
  const local=movable.filter(id=>preferred.includes(id));
  const tiers=[local,movable.filter(id=>!reference.includes(id)),movable];
  const attempted=new Set<string>();
  for(const tier of tiers){
    const key=JSON.stringify(tier);
    if(attempted.has(key))continue;
    attempted.add(key);
    if(project(pts,rows,tier))return true;
    ids.forEach((id,i)=>Object.assign(pts.get(id)!,old[i]));
  }
  return false;
}

/** Exact component differences implied by the sketch's linear distance and alignment relations. */
function knownComponents(m:SpatialModel,a:string,b:string):Partial<Vec3> {
  const values:Partial<Vec3>={};
  for(const axis of axes){
    const adjacent=new Map<string,{to:string;d:number}[]>();
    function edge(from:string,to:string,d:number){
      if(!adjacent.has(from))adjacent.set(from,[]);
      adjacent.get(from)!.push({to,d});
    }
    for(const rule of m.rules??[]){
      if(!active(rule))continue;
      const kind=rule.kind;
      let distance:number;
      if(kind==='connect'||isAxisRule(kind)&&axisOf[kind as 'alongX'|'alongY'|'alongZ']!==axis)distance=0;
      else if(isComponent(kind)&&axisOf[kind as 'dx'|'dy'|'dz']===axis)distance=rule.value!*(rule.sense??1);
      else continue;
      const [p,q]=rule.points;edge(p,q,distance);edge(q,p,-distance);
    }
    const queue=[a],visited=new Map([[a,0]]);
    for(let i=0;i<queue.length&&!visited.has(b);i++)for(const step of adjacent.get(queue[i])??[]){
      if(visited.has(step.to))continue;
      visited.set(step.to,visited.get(queue[i])!+step.d);
      queue.push(step.to);
    }
    if(visited.has(b))values[axis]=visited.get(b)!;
  }
  return values;
}

const pairKey=(a:string,b:string)=>JSON.stringify(a<b?[a,b]:[b,a]);
function relationKey(rule:Equation) {
  const [a,b,c,d]=rule.points;
  if(!c)return rule.kind+pairKey(a,b);
  if(!d)return JSON.stringify([rule.kind,pairKey(a,b),c]);
  return rule.kind+pairKey(pairKey(a,b),pairKey(c,d));
}
function fixedMeasurement(base:SpatialModel,rule:SpatialRule) {
  const [a,b,c,d]=rule.points, key=relationKey(rule), others=(base.rules??[]).filter(active);
  if(others.some(other=>relationKey(other)===key))return true;
  if(rule.kind==='angle'&&others.some(other=>['parallel','perpendicular','collinear'].includes(other.kind)&&relationKey({...other,kind:'angle'})===key))return true;
  if(rule.kind==='offset'&&others.some(other=>['midpoint','pointOnMember'].includes(other.kind)&&relationKey({...other,kind:'offset'})===key))return true;
  if(isComponent(rule.kind)||rule.kind==='length'){
    const components=knownComponents(base,a,b);
    if(isComponent(rule.kind)&&components[axisOf[rule.kind as 'dx'|'dy'|'dz']]!==undefined)return true;
    if(axes.every(axis=>components[axis]!==undefined))return true;
    // Equal member lengths share a measurement, including chains of equal relations.
    const fixedLengths=new Set<string>();
    for(const old of others)if(old.kind==='length')fixedLengths.add(pairKey(old.points[0],old.points[1]));
    let changed=true;
    while(changed){
      changed=false;
      for(const eq of others)if(eq.kind==='equal'){
        const first=pairKey(eq.points[0],eq.points[1]),second=pairKey(eq.points[2],eq.points[3]);
        if(fixedLengths.has(first)!==fixedLengths.has(second)){fixedLengths.add(first);fixedLengths.add(second);changed=true;}
      }
    }
    if(fixedLengths.has(pairKey(a,b))&&(rule.kind==='length'||axes.filter(ax=>ax!==axisOf[rule.kind as 'dx'|'dy'|'dz']).every(ax=>components[ax]!==undefined)))return true;
  }
  // Fully anchored points also fix offsets and angles even when the dimensions came from other members.
  return [a,b,c,d].filter(Boolean).every(id=>id===SPATIAL_ORIGIN||Object.keys(knownComponents(base,SPATIAL_ORIGIN,id)).length===3);
}

function seed(m:SpatialModel,base:SpatialModel,r:SpatialRule):string[] {
  const pts=positions(m),ids=r.points.slice(),kind=r.kind;
  let [aId,bId,cId,dId]=ids;
  const originalA=aId,originalB=bId;
  const direction=(r.sense??1)*(bId===SPATIAL_ORIGIN?-1:1);
  if(bId===SPATIAL_ORIGIN)[aId,bId]=[bId,aId];
  const a=pts.get(aId)!,b=pts.get(bId)!,c=pts.get(cId),d=pts.get(dId);
  const ab=minus(b,a),L=size(ab),u=unit(ab);
  const assign=(id:string,p:Vec3)=>{if(id!==SPATIAL_ORIGIN){const n=pts.get(id)!;n.x=p.x;n.y=p.y;n.z=p.z;}};
  if(kind==='connect')assign(bId,a);
  else if(isAxisRule(kind)){
    const axis=axisOf[kind as 'alongX'|'alongY'|'alongZ'];
    const coordinate=r.refs.length===2&&Math.abs(ab[axis])>memberTolerance?b[axis]:a[axis]+(ab[axis]<0?-L:L);
    assign(bId,{...a,[axis]:coordinate});
  }else if(isComponent(kind))b[axisOf[kind as 'dx'|'dy'|'dz']]=a[axisOf[kind as 'dx'|'dy'|'dz']]+direction*r.value!;
  else if(kind==='length'){
    const known=knownComponents(base,aId,bId),free=axes.filter(axis=>known[axis]===undefined);
    const min2=axes.reduce((acc,axis)=>acc+(known[axis]??0)**2,0);
    const newLength=r.value!;
    if(newLength**2<min2-1e-12)throw Error('The length is shorter than the fixed coordinate differences.');
    if(free.length){
      const available=Math.sqrt(Math.max(0,newLength**2-min2));
      const initial=Math.hypot(...free.map(axis=>ab[axis]));
      const target={...origin};
      for(const axis of axes)target[axis]=known[axis]??(initial>1e-12?ab[axis]/initial*available:axis===free[0]?available:0);
      assign(bId,plus(a,target));
    }
  }else if(isMixed(kind)){
    const foot=footOnLine(a,b,c!,kind==='pointOnMember');
    let goal=kind==='midpoint'?plus(a,scale(ab,.5)):foot;
    // A separate sketch point sliding on a span must not duplicate either physical end joint.
    if(kind==='pointOnMember'&&(size(minus(foot,a))<=memberTolerance||size(minus(foot,b))<=memberTolerance)){
      const inset=Math.min(L/2,Math.max(2*memberTolerance,Math.min(.01*L,.001)));
      goal=plus(a,scale(u,size(minus(foot,a))<=memberTolerance?inset:L-inset));
    }
    if(kind==='offset')goal=plus(foot,scale(normalTo(u,minus(c!,foot)),r.value!));
    const moveLine=cId===SPATIAL_ORIGIN||r.refs[1].type==='member';
    if(moveLine){
      const delta=minus(c!,goal);
      assign(aId,plus(a,delta));assign(bId,plus(b,delta));return [aId,bId];
    }
    assign(cId,goal);return [cId];
  }else if(c&&d){
    // Keep a shared joint on the reference member and rotate the other end about it.
    const reversed=dId===originalA||dId===originalB;
    const anchor=reversed?d:c,moving=reversed?c:d;
    const pivotId=reversed?dId:cId,tipId=reversed?cId:dId;
    const cd=minus(moving,anchor),T=size(cd);
    let dir=unit(cd),pivot={...anchor};
    const sign=dot(cd,u)<0?-1:1;
    if(kind==='parallel'||kind==='collinear')dir=scale(u,sign);
    else if(kind==='perpendicular')dir=normalTo(u,cd);
    else if(kind==='angle'){
      const theta=(reversed?180-r.value!:r.value!)*Math.PI/180;
      dir=plus(scale(u,Math.cos(theta)),scale(normalTo(u,cd),Math.sin(theta)));
    }
    const movingPivot=kind==='collinear'&&pivotId!==aId&&pivotId!==bId;
    if(movingPivot){pivot=footOnLine(a,b,anchor,false);assign(pivotId,pivot);}
    assign(tipId,plus(pivot,scale(dir,kind==='equal'?L:T)));
    return movingPivot?[pivotId,tipId]:[tipId];
  }
  return [bId];
}

function nextRuleId(m:SpatialModel,kind:SpatialAction) {
  const prefix=isSpatialDimension(kind)?'D':'C';
  const ids=new Set(m.rules?.map(r=>r.id));
  let i=1;
  while(ids.has(prefix+i))i++;
  return prefix+i;
}
function putRule(model:SpatialModel,r:SpatialRule):SpatialModel {
  const rules=model.rules??[];
  return {...model,rules:rules.some(old=>old.id===r.id)?rules.map(old=>old.id===r.id?r:old):[...rules,r]};
}
function verified(m:SpatialModel):SpatialModel {
  const {nodes}=m;
  if(!validSpatialModel(m)){
    const coincident=nodes.find((a,i)=>nodes.slice(i+1).some(b=>size(minus(a,b))<=memberTolerance));
    if(coincident)throw Error('This edit would overlap existing joints. Use Connect points to form one joint.');
    throw Error('The edit would collapse a member or invalidate existing sketch geometry.');
  }
  return m;
}
function physicalMerge(m:SpatialModel,r:SpatialRule):SpatialModel {
  const [keep,remove]=r.points;
  const left=m.nodes.find(n=>n.id===keep)!,right=m.nodes.find(n=>n.id===remove)!;
  if(left.support!=='free'&&right.support!=='free'&&left.support!==right.support)
    throw Error('The joints have different supports. Choose compatible supports before connecting them.');
  if(left.support==='spring'&&right.support==='spring'&&(left.spring??10000)!==(right.spring??10000))
    throw Error('Set matching spring stiffnesses before connecting these joints.');
  const attached=(id:string)=>m.members.some(member=>member.a===id||member.b===id);
  if(left.joint!==right.joint&&attached(keep)&&attached(remove))throw Error('Choose matching joint types before connecting the two frames.');
  if(left.support==='free'){left.support=right.support;if(right.spring!==undefined)left.spring=right.spring;}
  if(!attached(keep))left.joint=right.joint;
  const swap=(id:string)=>id===remove?keep:id;
  const combined:SpatialModel={...m,nodes:m.nodes.filter(n=>n.id!==remove),
    members:m.members.map(member=>({...member,a:swap(member.a),b:swap(member.b)}))};
  if(combined.loads)combined.loads=combined.loads.map(load=>load.target==='node'?{...load,targetId:swap(load.targetId)}:load);
  combined.rules=m.rules?.filter(rule=>rule.id!==r.id).map(rule=>({...rule,
    refs:rule.refs.map(ref=>ref.type==='node'?{...ref,id:swap(ref.id)}:ref),points:rule.points.map(swap)}));
  return verified(cleanSpatialRules(combined));
}
function checkedRule(model:SpatialModel,rule:SpatialRule):SpatialModel {
  const without:SpatialModel={...model,rules:(model.rules??[]).filter(old=>old.id!==rule.id)};
  const dim=isSpatialDimension(rule.kind);
  const reference=()=>putRule(model,{...rule,driven:true,value:spatialRuleValue(model,rule)});
  if(dim&&(rule.driven||fixedMeasurement(without,rule)))return reference();
  const key=relationKey(rule);
  if(!dim&&without.rules!.some(other=>active(other)&&key===relationKey(other)))throw Error('The selection already has this constraint.');
  if(rule.kind==='connect'){
    const [a,b]=rule.points;
    if(model.members.some(member=>[member.a,member.b].includes(a)&&[member.a,member.b].includes(b)))
      throw Error('Joining these endpoints would collapse their member.');
  }
  if(rule.kind==='length'){
    const fixed=Object.values(knownComponents(without,rule.points[0],rule.points[1]));
    if(rule.value!+solveTolerance<Math.hypot(...fixed))return reference();
  }
  const next=putRule({...model,nodes:model.nodes.map(n=>({...n}))},rule);
  const preferred=seed(next,without,rule);
  const referenceNodes=rule.points.filter(id=>!preferred.includes(id));
  if(!solve(next,rule.points,preferred,[],referenceNodes)){
    // If a large change jumps branches, follow the old feasible shape toward the requested dimension.
    if(dim&&rule.value!==undefined){
      const stepped:SpatialModel={...model,nodes:model.nodes.map(n=>({...n}))};
      const old=spatialRuleValue(model,rule);
      let stepModel=stepped,ok=true;
      for(let i=1;i<=12;i++){
        const stepRule={...rule,value:old+(rule.value-old)*i/12};
        stepModel=putRule(stepModel,stepRule);
        const targets=seed(stepModel,without,stepRule);
        if(!solve(stepModel,rule.points,targets,[],referenceNodes)){ok=false;break;}
      }
      if(ok)return verified(stepModel);
    }
    throw Error('The geometry could not satisfy this edit together with its active dimensions and constraints.');
  }
  if(rule.kind==='connect'&&!rule.points.includes(SPATIAL_ORIGIN))return physicalMerge(next,rule);
  return verified(next);
}
export function createSpatialRule(model:SpatialModel,kind:SpatialAction,refs:SpatialRef[],value?:number,driven=false):SpatialModel {
  const points=rulePoints(model,kind,refs),dim=isSpatialDimension(kind);
  const rule:SpatialRule={id:nextRuleId(model,kind),kind,refs:refs.map(({id,type})=>({id,type})),points};
  if(dim){
    rule.value=value??spatialRuleValue(model,rule);
    if(!numberAllowed(kind,rule.value))throw Error(kind==='angle'?'Enter an angle from 0Â° to 180Â°.':'Enter a valid dimension in the project length unit.');
    rule.driven=driven;
    if(isComponent(kind)){
      const [a,b]=points.map(id=>positions(model).get(id)!);const axis=axisOf[kind as 'dx'|'dy'|'dz'];
      rule.sense=b[axis]<a[axis]?-1:1;
    }
  }
  return checkedRule(model,rule);
}
export function editSpatialRule(model:SpatialModel,id:string,value:number,driven=false):SpatialModel {
  const old=model.rules?.find(r=>r.id===id);
  if(!old||!isSpatialDimension(old.kind))throw Error('Select an existing spatial dimension.');
  if(!numberAllowed(old.kind,value))throw Error(old.kind==='angle'?'Enter an angle from 0Â° to 180Â°.':'Enter a valid dimension.');
  return checkedRule(model,{...old,suppressed:false,value,driven});
}
export function suppressSpatialRule(model:SpatialModel,id:string,suppressed:boolean):SpatialModel {
  const old=model.rules?.find(r=>r.id===id);
  if(!old)throw Error('Select an existing spatial relation.');
  const rule={...old,suppressed};
  return suppressed?putRule(model,rule):checkedRule(model,rule);
}
export function removeSpatialRule(model:SpatialModel,id:string):SpatialModel {
  return {...model,rules:model.rules?.filter(r=>r.id!==id)};
}
export function moveConstrainedSpatialNode(model:SpatialModel,id:string,point:Vec3):SpatialModel {
  const current=model.nodes.find(n=>n.id===id);
  if(!current)throw Error('Select an existing joint.');
  if(axes.some(axis=>!Number.isFinite(point[axis])||Math.abs(point[axis])>=positionLimit))throw Error('Enter finite X, Y and Z coordinates.');
  const next:SpatialModel={...model,nodes:model.nodes.map(n=>({...n}))},target=next.nodes.find(n=>n.id===id)!;
  Object.assign(target,{x:point.x,y:point.y,z:point.z});
  const related=connectedEquations(equations(next),[id]);
  const pts=positions(next);
  const errors=()=>related.rows.some(eq=>evaluate(pts,eq).some(value=>Math.abs(value)>solveTolerance));
  if(errors()){
    const movable=related.ids.filter(key=>key!==id);
    // A uniform displacement is exact for a floating rigid assembly. An active
    // origin reference requires projecting the move onto the sketch equations.
    if(!related.rows.some(eq=>eq.points.includes(SPATIAL_ORIGIN)) && related.rows.length>1){
      const delta=minus(point,current);
      for(const key of movable){
        const n=next.nodes.find(node=>node.id===key)!;
        Object.assign(n,plus(n,delta));
      }
    }
    if(!solve(next,[id],movable,[id]))throw Error('That position conflicts with an active 3D dimension or constraint.');
  }
  return verified(next);
}
