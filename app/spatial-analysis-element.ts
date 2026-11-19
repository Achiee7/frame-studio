import type {SpatialMember, SpatialNode, Vec3} from './spatial-model.ts';
import {sectionForSpatialMember} from './spatial-analysis-input.ts';
import type {SpatialLoad,SpatialSection} from './spatial-analysis-input.ts';
import {SpatialSystem} from './spatial-analysis-system.ts';

export const zero=():Vec3=>({x:0,y:0,z:0});
export const plus=(a:Vec3,b:Vec3):Vec3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
export const times=(a:Vec3,k:number):Vec3=>({x:a.x*k,y:a.y*k,z:a.z*k});
export const minus=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
export const norm=(a:Vec3)=>Math.hypot(a.x,a.y,a.z);
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
export const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});

export type SpatialSample = {
  t:number;position:Vec3;displacement:Vec3;N:number;Vy:number;Vz:number;T:number;My:number;Mz:number;
};
type PointAction={t:number;force:Vec3;moment:Vec3};
type Basis={x:Vec3;y:Vec3;z:Vec3};
export type Element={
  member:SpatialMember;section:SpatialSection;start:Vec3;length:number;basis:Basis;dofs:number[];
  stiffness:number[][];consistent:number[];uniform:Vec3;points:PointAction[];
};
export function toLocal(v:Vec3,basis:Basis):Vec3 {
  return {x:dot(v,basis.x),y:dot(v,basis.y),z:dot(v,basis.z)};
}
function toGlobal(v:Vec3,basis:Basis):Vec3 {
  return plus(plus(times(basis.x,v.x),times(basis.y,v.y)),times(basis.z,v.z));
}
function coordinates(a:Vec3,b:Vec3,roll:number):Basis {
  const x=times(minus(b,a),1/norm(minus(b,a)));
  // Use global Z in the local x-z plane, or global X for a vertical member.
  const reference=Math.hypot(x.x,x.y)>1e-8?{x:0,y:0,z:1}:{x:1,y:0,z:0};
  const y0=cross(reference,x),y=times(y0,1/norm(y0)),z=cross(x,y);
  const angle=(roll%360)*Math.PI/180;
  return {x,y:plus(times(y,Math.cos(angle)),times(z,Math.sin(angle))),z:plus(times(z,Math.cos(angle)),times(y,-Math.sin(angle)))};
}

// Prismatic 12-DOF Euler–Bernoulli element. See H. P. Gavin, Duke CEE 421,
// "Geometric Stiffness Effects in 2D and 3D Frames", §6, with zero shear flexibility.
// https://people.duke.edu/~hpgavin/cee421/frame-finite-def.pdf
function localStiffness(section:SpatialSection,L:number,beam:boolean){
  const k=Array.from({length:12},()=>Array<number>(12).fill(0));
  function axial(i:number,stiffness:number){k[i][i]=k[i+6][i+6]=stiffness;k[i][i+6]=k[i+6][i]=-stiffness;}
  axial(0,section.E*section.A/L);
  if(beam){
    axial(3,section.G*section.J/L);
    function bending(v:number,r:number,EI:number,rotationSign:number){
      const a=12*EI/L**3,b=rotationSign*6*EI/L**2,c=4*EI/L,d=2*EI/L;
      const block=[[a,b,-a,b],[b,c,-b,d],[-a,-b,a,-b],[b,d,-b,c]],indices=[v,r,v+6,r+6];
      indices.forEach((p,i)=>indices.forEach((q,j)=>{k[p][q]=block[i][j];}));
    }
    bending(1,5,section.E*section.Iz,1);
    bending(2,4,section.E*section.Iy,-1);
  }
  return k;
}

export function createElement(member:SpatialMember,a:SpatialNode,b:SpatialNode,dofs:number[]):Element {
  const length=norm(minus(b,a)),section=sectionForSpatialMember(member);
  if(!(length>1e-6))throw Error('Member '+member.id+' is too short for analysis.');
  const basis=coordinates(a,b,section.roll);
  return {member,section,start:a,length,basis,dofs,stiffness:localStiffness(section,length,member.kind==='beam'),
    consistent:Array(12).fill(0),uniform:zero(),points:[]};
}
const addVector=(array:number[],i:number,v:Vec3)=>{array[i]+=v.x;array[i+1]+=v.y;array[i+2]+=v.z;};
export function addMemberLoad(element:Element,load:SpatialLoad){
  const {basis,consistent,length:L}=element;
  const local=toLocal(load.vector,basis),strut=element.member.kind==='strut';
  if(strut&&(load.kind==='moment'||Math.hypot(local.y,local.z)>1e-10*norm(local))){
    throw Error('Axial strut '+element.member.id+' cannot carry interior transverse loading or a moment. Use a beam or apply a force at a joint.');
  }
  if(load.kind==='distributed'){
    element.uniform=plus(element.uniform,local);
    addVector(consistent,0,times(local,L/2));addVector(consistent,6,times(local,L/2));
    if(!strut){
      const couple={x:0,y:-local.z*L*L/12,z:local.y*L*L/12};
      addVector(consistent,3,couple);addVector(consistent,9,times(couple,-1));
    }
    return;
  }
  const t=load.t,s=1-t;
  const force=load.kind==='force'?local:zero(),moment=load.kind==='moment'?local:zero();
  element.points.push({t,force,moment});
  consistent[0]+=s*force.x;consistent[6]+=t*force.x;
  if(strut)return;
  consistent[3]+=s*moment.x;consistent[9]+=t*moment.x;
  // Virtual work with cubic transverse interpolation and its slope for moments.
  const h=[s*s*(1+2*t),L*t*s*s,t*t*(3-2*t),-L*t*t*s];
  const dh=[-6*t*s/L,s*(1-3*t),6*t*s/L,t*(3*t-2)];
  const y=[1,5,7,11],z=[2,4,8,10];
  for(let i=0;i<4;i++){
    consistent[y[i]]+=h[i]*force.y+dh[i]*moment.z;
    consistent[z[i]]+=(i%2===0?1:-1)*(h[i]*force.z-dh[i]*moment.y);
  }
}

export function assembleElement(system:SpatialSystem,element:Element){
  const {basis,dofs,stiffness,consistent}=element;
  const rows=[basis.x,basis.y,basis.z].map(v=>[v.x,v.y,v.z]);
  for(let i=0;i<12;i++){
    if(dofs[i]<0)continue;
    const blockI=i-i%3;
    for(let a=0;a<3;a++)system.load[dofs[i]]+=rows[a][i%3]*consistent[blockI+a];
    for(let j=i;j<12;j++){
      if(dofs[j]<0)continue;
      let value=0;
      const blockJ=j-j%3;
      for(let a=0;a<3;a++)for(let b=0;b<3;b++)value+=rows[a][i%3]*stiffness[blockI+a][blockJ+b]*rows[b][j%3];
      system.add(dofs[i],dofs[j],value);
      if(i!==j)system.add(dofs[j],dofs[i],value);
    }
  }
}

export function endState(element:Element,U:number[]){
  const {basis,dofs}=element,d:number[]=[];
  for(let i=0;i<12;i+=3){
    const v=toLocal({x:U[dofs[i]]??0,y:U[dofs[i+1]]??0,z:U[dofs[i+2]]??0},basis);
    d.push(v.x,v.y,v.z);
  }
  const end=element.stiffness.map((row,i)=>row.reduce((v,k,j)=>v+k*d[j],-element.consistent[i]));
  return {d,end};
}

export function recover(element:Element,d:number[],end:number[],t:number,left=false){
  const {section,length:L}=element;
  const x=t*L,q=element.uniform,EA=section.E*section.A,EIy=section.E*section.Iy,EIz=section.E*section.Iz,GJ=section.G*section.J;
  const f={x:-end[0]-q.x*x,y:-end[1]-q.y*x,z:-end[2]-q.z*x};
  const m={x:-end[3],y:-end[4]-end[2]*x-q.z*x*x/2,z:-end[5]+end[1]*x+q.y*x*x/2};
  // Integrate axial force, torsion and moment once/twice along the undeformed
  // member. These load terms recover interior deflection even for a fixed-fixed span.
  let ux=d[0]+(-end[0]*x-q.x*x*x/2)/EA;
  let uy=d[1]+d[5]*x+(-end[5]*x*x/2+end[1]*x**3/6+q.y*x**4/24)/EIz;
  let uz=d[2]-d[4]*x+(end[4]*x*x/2+end[2]*x**3/6+q.z*x**4/24)/EIy;
  let sy=d[5]+(-end[5]*x+end[1]*x*x/2+q.y*x**3/6)/EIz;
  let sz=-d[4]+(end[4]*x+end[2]*x*x/2+q.z*x**3/6)/EIy;
  let twist=d[3]-end[3]*x/GJ;
  for(const p of element.points){
    if(p.t>t||(left&&p.t===t))continue;
    const a=(t-p.t)*L,F=p.force,M=p.moment;
    f.x-=F.x;f.y-=F.y;f.z-=F.z;m.x-=M.x;m.y-=M.y+F.z*a;m.z+=F.y*a-M.z;
    ux-=F.x*a/EA;twist-=M.x*a/GJ;
    uy+=(F.y*a**3/6-M.z*a*a/2)/EIz;uz+=(F.z*a**3/6+M.y*a*a/2)/EIy;
    sy+=(F.y*a*a/2-M.z*a)/EIz;sz+=(F.z*a*a/2+M.y*a)/EIy;
  }
  const beam=element.member.kind==='beam';
  if(!beam){uy=(1-t)*d[1]+t*d[7];uz=(1-t)*d[2]+t*d[8];sy=(d[7]-d[1])/L;sz=(d[8]-d[2])/L;twist=0;}
  const localDisplacement={x:ux,y:uy,z:uz};
  const sample:SpatialSample={
    t,position:plus(element.start,times(element.basis.x,x)),displacement:toGlobal(localDisplacement,element.basis),
    N:f.x,Vy:f.y,Vz:f.z,T:m.x,My:m.y,Mz:m.z,
  };
  const strain=f.x/EA;
  return {sample,strain,localDisplacement,slope:{x:strain,y:sy,z:sz},rotation:Math.hypot(sy,sz,twist-d[3]),relative:norm(minus(localDisplacement,{x:d[0],y:d[1],z:d[2]}))/L};
}
