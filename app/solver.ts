import {assessResult} from './analysis-validity.ts';
import type {Applicability} from './analysis-validity.ts';
import type {Model,Node,Beam} from './model';
export type Sample={beam:string;t:number;x:number;y:number;ux:number;uy:number;N:number;V:number;M:number};
export type Result={applicability?:Applicability;samples:Sample[];reactions:{node:string;fx:number;fy:number;m:number}[];maxDisplacement:number;maxMoment:number;nodeDisplacements:{node:string;ux:number;uy:number;rotations:{key:string;value:number}[]}[]};
// Linear elastic Euler–Bernoulli 2D frame stiffness method. SI geometry, kN force.
export function assembleFrame(model:Model,factors:Record<string,number>={G:1,Q:1,W:1},divisions=8,splitStrutLoads=false) {
 if(!model.beams.length)throw Error('Draw at least one member to analyse.');
 if(model.beams.length>80)throw Error('Analysis supports up to 80 members.');
 const nodes:Node[]=model.nodes.map(n=>({...n}));const segments:{beam:Beam;a:Node;b:Node;t0:number;t1:number}[]=[];
 for(const beam of model.beams){const a=nodes.find(n=>n.id===beam.a)!,b=nodes.find(n=>n.id===beam.b)!;if(Math.hypot(a.x-b.x,a.y-b.y)<1e-6)throw Error('A member has zero length.');const ts=beam.kind==='strut'&&!splitStrutLoads?[0,1]:[0,1,...model.loads.filter(l=>l.beam===beam.id&&l.type!=='distributed').map(l=>l.t)];if(beam.kind!=='strut')for(let i=1;i<divisions;i++)ts.push(i/divisions);const sorted=[...new Set(ts.map(t=>+t.toFixed(10)))].sort((a,b)=>a-b);let prev=a;for(let i=1;i<sorted.length;i++){const t=sorted[i],next=t===1?b:{id:`mesh:${beam.id}:${t}`,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,joint:'rigid' as const,support:'free' as const};if(t!==1)nodes.push(next);segments.push({beam,a:prev,b:next,t0:sorted[i-1],t1:t});prev=next;}}
 const keys:string[]=[],dof=(key:string)=>{let i=keys.indexOf(key);if(i<0){i=keys.length;keys.push(key);}return i;};
 const rotation=(n:Node,b:Beam,isEnd:boolean)=>dof(`${n.id}:r:${isEnd&&(n.id===b.a?b.releaseA:b.releaseB)?'release:'+b.id:n.joint==='pin'?b.family:n.joint==='hinge'?'hinge:'+b.id:'shared'}`);
 const elements=segments.map(s=>{const {a,b,beam}=s,L=Math.hypot(b.x-a.x,b.y-a.y),c=(b.x-a.x)/L,sn=(b.y-a.y)/L;const indices=[dof(a.id+':x'),dof(a.id+':y'),rotation(a,beam,s.t0===0),dof(b.id+':x'),dof(b.id+':y'),rotation(b,beam,s.t1===1)];const E=beam.E,A=beam.A,I=beam.kind==='strut'?0:beam.I,u=E*A/L,v=12*E*I/L**3,w=6*E*I/L**2,z=4*E*I/L,h=2*E*I/L;const k=[[u,0,0,-u,0,0],[0,v,w,0,-v,w],[0,w,z,0,-w,h],[-u,0,0,u,0,0],[0,-v,-w,0,v,-w],[0,w,h,0,-w,z]];const T=[[c,sn,0,0,0,0],[-sn,c,0,0,0,0],[0,0,1,0,0,0],[0,0,0,c,sn,0],[0,0,0,-sn,c,0],[0,0,0,0,0,1]];let qx=0,qy=0;model.loads.filter(l=>l.beam===beam.id&&l.type==='distributed').forEach(l=>{const f=factors[l.case]??0;qx+=(l.fx*c+l.fy*sn)*f;qy+=(-l.fx*sn+l.fy*c)*f;});const f=[qx*L/2,qy*L/2,qy*L*L/12,qx*L/2,qy*L/2,-qy*L*L/12];if(beam.kind==='strut'&&Math.abs(qy)>1e-9)throw Error('A strut cannot carry transverse distributed load. Use a beam.');return {...s,L,c,sn,indices,k,T,f,qx,qy};});
 const size=keys.length,K=Array.from({length:size},()=>Array(size).fill(0)),F=Array(size).fill(0),fixed=new Map<number,number>();
 for(const e of elements)for(let i=0;i<6;i++){for(let j=0;j<6;j++){let kg=0;for(let p=0;p<6;p++)for(let q=0;q<6;q++)kg+=e.T[p][i]*e.k[p][q]*e.T[q][j];K[e.indices[i]][e.indices[j]]+=kg;}for(let p=0;p<6;p++)F[e.indices[i]]+=e.T[p][i]*e.f[p];}
 for(const l of model.loads.filter(l=>l.type!=='distributed')){
  const member=model.beams.find(b=>b.id===l.beam)!;
  if(member.kind==='strut'&&!splitStrutLoads&&l.t>1e-8&&l.t<1-1e-8){const e=elements.find(e=>e.beam.id===l.beam)!,f=factors[l.case]??0;
   if(l.type==='moment'&&Math.abs(l.m*f)>1e-10||l.type==='force'&&Math.abs((-l.fx*e.sn+l.fy*e.c)*f)>1e-9)throw Error('An axial-only strut cannot carry an interior transverse force or moment. Use a beam.');
   if(l.type==='force'){const P=(l.fx*e.c+l.fy*e.sn)*f;e.f[0]+=P*(1-l.t);e.f[3]+=P*l.t;}if(l.type==='force')for(const [o,w] of [[0,1-l.t],[3,l.t]]){F[e.indices[o]]+=l.fx*f*w;F[e.indices[o+1]]+=l.fy*f*w;}continue;
  }
  const e=elements.find(e=>e.beam.id===l.beam&&Math.abs(e.t0-l.t)<1e-8)??elements.find(e=>e.beam.id===l.beam&&Math.abs(e.t1-l.t)<1e-8)!;
  const atStart=Math.abs(e.t0-l.t)<1e-8,o=atStart?0:3,f=factors[l.case]??0;F[e.indices[o]]+=(l.type==='force'?l.fx:0)*f;F[e.indices[o+1]]+=(l.type==='force'?l.fy:0)*f;F[e.indices[o+2]]+=(l.type==='moment'?l.m:0)*f;
 }
 for(const n of model.nodes){const x=keys.indexOf(n.id+':x'),y=keys.indexOf(n.id+':y');if(x<0)continue;if(['pinned','fixed','rollerX'].includes(n.support))fixed.set(x,0);if(['pinned','fixed','roller','guided'].includes(n.support))fixed.set(y,(n.settlement??0)/1000);if(['fixed','guided'].includes(n.support))keys.forEach((k,i)=>{if(k.startsWith(n.id+':r:')&&!k.includes(':release:')&&!k.includes(':hinge:'))fixed.set(i,0);});if(n.support==='spring')K[y][y]+=n.spring??10000;}
 return {nodes,elements,keys,K,F,fixed,size};
}
export function elasticSystem(model:Model,factors:Record<string,number>={G:1,Q:1,W:1}) {
 const {elements,keys,K,F,fixed,size}=assembleFrame(model,factors);
 // Inactive rotations from axial-only elements carry no stiffness and may be omitted.
 const active=keys.map((_,i)=>i).filter(i=>!fixed.has(i)&&K[i].some(v=>Math.abs(v)>1e-12));
 for(let i=0;i<size;i++)if(!fixed.has(i)&&!active.includes(i)&&(Math.abs(F[i])>1e-9||keys[i].endsWith(':x')||keys[i].endsWith(':y')))throw Error('Unstable frame: an unrestrained translation or loaded free rotation has no stiffness.');
 const A=active.map(i=>active.map(j=>K[i][j])),rhs=active.map(i=>F[i]-[...fixed].reduce((s,[j,v])=>s+K[i][j]*v,0));
 // Diagonal scaling makes the singularity check independent of section/length units.
 const scale=active.map(i=>Math.sqrt(Math.abs(K[i][i]))||1);for(let i=0;i<A.length;i++){rhs[i]/=scale[i];for(let j=0;j<A.length;j++)A[i][j]/=scale[i]*scale[j];}
 for(let p=0;p<A.length;p++){let pivot=p;for(let i=p+1;i<A.length;i++)if(Math.abs(A[i][p])>Math.abs(A[pivot][p]))pivot=i;if(Math.abs(A[pivot][p])<1e-10)throw Error('Unstable frame. Check supports, disconnected nodes, struts, and releases.');[A[p],A[pivot]]=[A[pivot],A[p]];[rhs[p],rhs[pivot]]=[rhs[pivot],rhs[p]];for(let i=p+1;i<A.length;i++){const f=A[i][p]/A[p][p];for(let j=p;j<A.length;j++)A[i][j]-=f*A[p][j];rhs[i]-=f*rhs[p];}}
 const sol=Array(A.length).fill(0);for(let i=A.length-1;i>=0;i--)sol[i]=(rhs[i]-sol.reduce((s,v,j)=>s+(j>i?A[i][j]*v:0),0))/A[i][i];const U=Array(size).fill(0);fixed.forEach((v,i)=>U[i]=v);active.forEach((v,i)=>U[v]=sol[i]/scale[i]);
 return {elements,keys,K,F,fixed,size,active,U};
}
export function solve(model:Model,factors:Record<string,number>={G:1,Q:1,W:1}):Result {
 const {elements,keys,K,F,size,U}=elasticSystem(model,factors);
 const samples:Sample[]=[];
 for(const e of elements){const d=e.T.map(row=>row.reduce((s,v,j)=>s+v*U[e.indices[j]],0)),end=e.k.map((row,i)=>row.reduce((s,v,j)=>s+v*d[j],0)-e.f[i]);
  const positions=Array.from({length:9},(_,j)=>j/8);
  if(e.beam.kind==='beam'&&Math.abs(e.qy)>1e-12){const t=-end[1]/(e.qy*e.L);if(t>0&&t<1)positions.push(t);}
  const pointLoads=model.loads.filter(l=>e.beam.kind==='strut'&&l.beam===e.beam.id&&l.type==='force'&&l.t>1e-8&&l.t<1-1e-8);
  pointLoads.forEach(l=>positions.push(l.t));
  for(const t of [...new Set(positions)].sort((a,b)=>a-b)){
   const x=t*e.L,EA=e.beam.E*e.beam.A,EI=e.beam.E*e.beam.I;
   let ax=(1-t)*d[0]+t*d[3]+e.qx*x*(e.L-x)/(2*EA),v=e.beam.kind==='strut'?(1-t)*d[1]+t*d[4]:(1-3*t*t+2*t**3)*d[1]+e.L*(t-2*t*t+t**3)*d[2]+(3*t*t-2*t**3)*d[4]+e.L*(-t*t+t**3)*d[5]+e.qy*x*x*(x-e.L)**2/(24*EI);
   let N=-end[0]-e.qx*x;for(const l of pointLoads){const P=(l.fx*e.c+l.fy*e.sn)*(factors[l.case]??0),a=l.t*e.L;ax+=P*(Math.min(x,a)-x*a/e.L)/EA;if(l.t<t-1e-10)N-=P;}
   const s={beam:e.beam.id,t:e.t0+(e.t1-e.t0)*t,x:e.a.x+(e.b.x-e.a.x)*t,y:e.a.y+(e.b.y-e.a.y)*t,ux:e.c*ax-e.sn*v,uy:e.sn*ax+e.c*v,N,V:end[1]+e.qy*x,M:-end[2]+end[1]*x+e.qy*x*x/2};samples.push(s);
   const jump=pointLoads.filter(l=>Math.abs(l.t-t)<1e-10).reduce((sum,l)=>sum+(l.fx*e.c+l.fy*e.sn)*(factors[l.case]??0),0);if(jump)samples.push({...s,N:N-jump});
  }
 }
 const R=K.map((row,i)=>row.reduce((s,v,j)=>s+v*U[j],0)-F[i]);const reactions=model.nodes.filter(n=>n.support!=='free').map(n=>({node:n.id,fx:R[keys.indexOf(n.id+':x')]??0,fy:n.support==='spring'?-(n.spring??10000)*U[keys.indexOf(n.id+':y')]:R[keys.indexOf(n.id+':y')]??0,m:keys.reduce((s,k,i)=>s+(k.startsWith(n.id+':r:')?R[i]:0),0)}));
 const nodeDisplacements=model.nodes.map(n=>({node:n.id,ux:U[keys.indexOf(n.id+':x')]??0,uy:U[keys.indexOf(n.id+':y')]??0,rotations:keys.flatMap((key,i)=>key.startsWith(n.id+':r:')?[{key,value:U[i]}]:[])}));
 const result:Result={samples,reactions,nodeDisplacements,maxDisplacement:Math.max(...samples.map(s=>Math.hypot(s.ux,s.uy)))*1000,maxMoment:Math.max(...samples.map(s=>Math.abs(s.M)))};return {...result,applicability:assessResult(model,result)};
}


