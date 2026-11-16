import type {Model} from './model';
import type {Result} from './solver';
import {elasticSystem} from './solver';
import {equilibrium} from './reversals';
import {escapeHtml as esc} from './frame-drawing';
import {display,formatNumber} from './units';
import {equation as eq,matrix,vector,texNumber as n} from './report-math';
const table=(heads:string[],rows:string[][])=>`<table class="calc-table"><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+row.map(x=>`<td>${x}</td>`).join('')+'</tr>').join('')}</tbody></table>`;
export function equilibriumSteps(model:Model,result:Result,factors:Record<string,number>,detailed=false){
 const checks=equilibrium(model,result,factors),rx=result.reactions.reduce((a,r)=>a+r.fx,0),ry=result.reactions.reduce((a,r)=>a+r.fy,0),rm=result.reactions.reduce((sum,r)=>{const p=model.nodes.find(p=>p.id===r.node)!;return sum+r.m+p.x*r.fy-p.y*r.fx;},0);
 const rows:string[][]=[];
 model.loads.forEach((l,i)=>{const b=model.beams.find(b=>b.id===l.beam)!,a=model.nodes.find(p=>p.id===b.a)!,z=model.nodes.find(p=>p.id===b.b)!,t=l.type==='distributed'?.5:l.t,L=l.type==='distributed'?Math.hypot(z.x-a.x,z.y-a.y):1,f=factors[l.case]??0,x=a.x+t*(z.x-a.x),y=a.y+t*(z.y-a.y),fx=l.type==='moment'?0:l.fx*f*L,fy=l.type==='moment'?0:l.fy*f*L,m=l.type==='moment'?l.m*f:0;rows.push([`L${i+1}${l.type==='distributed'?' · resultant at midpoint':''}`,n(x),n(y),n(fx),n(fy),n(m),n(x*fy-y*fx+m)]);});
 result.reactions.forEach(r=>{const p=model.nodes.find(p=>p.id===r.node)!;rows.push([`N${model.nodes.indexOf(p)+1} · reaction`,n(p.x),n(p.y),n(r.fx),n(r.fy),n(r.m),n(p.x*r.fy-p.y*r.fx+r.m)]);});
 // Table values are plain text; TeX decimal punctuation is only used inside equations.
 const plainRows=rows.map(row=>row.map((v,i)=>i?v.replaceAll('{.}','.').replaceAll('{,}',',').replace(/\\times10\^\{(-?\d+)\}/g,'e$1'):esc(v)));
 return `<div class="calculation equilibrium-work"><h3>Equilibrium: loads + support reactions</h3><p>Global +X is right, +Y is up and positive moment is counterclockwise. Moments are taken about the coordinate origin. A distributed load is replaced by its resultant at its midpoint for this check.</p>${eq(String.raw`\sum F_x=${n(checks.applied.fx)}+(${n(rx)})=${n(checks.residual.fx)}\;\mathrm{kN}`)}${eq(String.raw`\sum F_y=${n(checks.applied.fy)}+(${n(ry)})=${n(checks.residual.fy)}\;\mathrm{kN}`)}${eq(String.raw`\sum M_O=\sum(xF_y-yF_x+M)=${n(checks.applied.m)}+(${n(rm)})=${n(checks.residual.m)}\;\mathrm{kN\,m}`)}<p class="trace-note">Residuals are calculated from the unrounded solver values; substitutions are rounded for readability. Small nonzero residuals are floating-point error; equilibrium alone does not validate the supports, material model or section.</p>${detailed?table(['Action','x (m)','y (m)','Fx (kN)','Fy (kN)','M (kN m)','xFy − yFx + M (kN m)'],plainRows):''}</div>`;
}
export function workedElastic(model:Model,result:Result,factors:Record<string,number>,caseName:string){
 const sys=elasticSystem(model,factors),{elements,keys,K,F,fixed,active,U}=sys,e=elements[0],b=e.beam,a=model.nodes.find(p=>p.id===b.a)!,z=model.nodes.find(p=>p.id===b.b)!,L=Math.hypot(z.x-a.x,z.y-a.y),d=e.T.map(row=>row.reduce((s,v,j)=>s+v*U[e.indices[j]],0)),end=e.k.map((row,i)=>row.reduce((s,v,j)=>s+v*d[j],0)-e.f[i]),peakM=result.samples.reduce((a,b)=>Math.abs(a.M)>=Math.abs(b.M)?a:b),peakU=result.samples.reduce((a,b)=>Math.hypot(a.ux,a.uy)>=Math.hypot(b.ux,b.uy)?a:b);
 const label=(key:string)=>{const at=key.indexOf(':'),id=key.slice(0,at),idx=model.nodes.findIndex(p=>p.id===id);return (idx<0?id:`N${idx+1}`)+key.slice(at);};
 const rowIndex=active.find(i=>Math.abs(F[i])>1e-12)??active.reduce((i,j)=>Math.abs(U[j])>Math.abs(U[i]??0)?j:i,active[0]??0),terms=K[rowIndex].flatMap((k,j)=>Math.abs(k)>1e-12?[`(${n(k,4)})(${n(U[j],9)})`]:[]),lhs=K[rowIndex].reduce((s,k,j)=>s+k*U[j],0),rhs=F[rowIndex];
 const dofs=keys.map((key,i)=>[esc(label(key)),fixed.has(i)?'Prescribed':'Free / inactive',formatNumber(F[i],8),formatNumber(U[i],10)]);
 const trace={case:caseName,units:{translation:'m',rotation:'rad',force:'kN',moment:'kN m'},model,keys,K,F,U,fixed:[...fixed],active,elements:elements.map(e=>({beam:e.beam.id,t0:e.t0,t1:e.t1,L:e.L,c:e.c,s:e.sn,indices:e.indices,k:e.k,T:e.T,equivalentLoads:e.f})),result};
 return `<section class="calculation" data-worked-calculation="elastic"><div class="eyebrow">Worked calculation · ${esc(caseName)}</div><h3>From geometry to results</h3><p>This worked case uses the actual frame, restraints, releases and factored loads. The same process is repeated for every included reversal. Calculation units are <b>m, kN, kN m and radians</b>; final results use your chosen display units. A matrix contains mixed translation/rotation units as identified below.</p>
 <h4>1. Member length and orientation</h4><p>Member B${model.beams.indexOf(b)+1} runs from N${model.nodes.indexOf(a)+1} to N${model.nodes.indexOf(z)+1}. Local x follows the member; local y is its counterclockwise normal.</p>
 ${eq(String.raw`L_b=\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}=\sqrt{(${n(z.x)}-${n(a.x)})^2+(${n(z.y)}-${n(a.y)})^2}=${n(L)}\;\mathrm m`)}
 ${eq(String.raw`c=\frac{x_2-x_1}{L_b}=${n(e.c)},\qquad s=\frac{y_2-y_1}{L_b}=${n(e.sn)}`)}
 <p>For accurate internal-load placement and recovery, beam members are divided at eighth points and at interior concentrated loads. This model has ${elements.length} finite elements and ${keys.length} degrees of freedom. The first element below covers ${formatNumber(e.t0*100)}–${formatNumber(e.t1*100)}% of this member, with element length ℓ = ${formatNumber(e.L,6)} m. Axial-only struts use one element.</p>
 <h4>2. Section stiffness and element matrix</h4>
 ${eq(String.raw`E=${n(b.E)}\;\mathrm{kN/m^2},\quad A=${n(b.A,9)}\;\mathrm{m^2},\quad I=${n(b.kind==='strut'?0:b.I,9)}\;\mathrm{m^4}`)}
 ${eq(String.raw`EA=${n(b.E*b.A)}\;\mathrm{kN},\qquad EI=${n(b.kind==='strut'?0:b.E*b.I)}\;\mathrm{kN\,m^2}`)}
 <p>Element displacement order is [u₁, v₁, θ₁, u₂, v₂, θ₂]. Translations are in m and rotations in radians. Force order is [Fx₁, Fy₁, M₁, Fx₂, Fy₂, M₂], with forces in kN and moments in kN m. For struts I = 0, so only axial stiffness remains.</p>
 ${eq(String.raw`\mathbf k_e=\begin{bmatrix}EA/\ell&0&0&-EA/\ell&0&0\\0&12EI/\ell^3&6EI/\ell^2&0&-12EI/\ell^3&6EI/\ell^2\\0&6EI/\ell^2&4EI/\ell&0&-6EI/\ell^2&2EI/\ell\\-EA/\ell&0&0&EA/\ell&0&0\\0&-12EI/\ell^3&-6EI/\ell^2&0&12EI/\ell^3&-6EI/\ell^2\\0&6EI/\ell^2&2EI/\ell&0&-6EI/\ell^2&4EI/\ell\end{bmatrix}`)}
 ${eq(String.raw`\mathbf k_e=${matrix(e.k,3)}`)}
 <h4>3. Transform, assemble and apply the loads</h4>
 ${eq(String.raw`\mathbf d_e=\mathbf T_e\mathbf U_e,\qquad \mathbf T_e=${matrix(e.T,4)}`)}
 ${eq(String.raw`\mathbf K=\sum_e\mathbf A_e^{T}\mathbf T_e^{T}\mathbf k_e\mathbf T_e\mathbf A_e,\qquad \mathbf F=\mathbf P+\sum_e\mathbf A_e^{T}\mathbf T_e^{T}\mathbf f_e^{\,eq}`)}
 <p>Aₑ maps each element to the global degrees of freedom. Connected rigid ends share rotation; released ends and hinges get independent rotation degrees of freedom. Spring support stiffness is added to K. Concentrated loads act at their actual mesh point. For a uniform local distributed load the consistent vector is shown below. On an unsplit axial strut, the numerical vector also includes interior axial point loads with weights (1−t) and t.</p>
 ${eq(String.raw`\mathbf f_e^{\,eq}=\begin{bmatrix}q_x\ell/2\\q_y\ell/2\\q_y\ell^2/12\\q_x\ell/2\\q_y\ell/2\\-q_y\ell^2/12\end{bmatrix}=${vector(e.f,5)}`)}
 <h4>4. Apply supports and solve the free displacements</h4>
 ${eq(String.raw`\mathbf K_{ff}\mathbf U_f=\mathbf F_f-\mathbf K_{fc}\mathbf U_c`)}
 <p>Subscript f denotes free degrees of freedom; c denotes prescribed support motion. There are ${active.length} active free degrees of freedom and ${fixed.size} prescribed values. Unloaded zero-stiffness strut rotations are omitted. The numerical row below corresponds to <b>${esc(label(keys[rowIndex]))}</b>; all terms, including any prescribed values, are included.</p>
 ${terms.length?eq(String.raw`\begin{aligned}\sum_jK_{ij}U_j&=${terms.reduce<string[]>((rows,term,i)=>{if(i%2===0)rows.push('');rows[rows.length-1]+=(i?' + ':'')+term;return rows;},[]).join(String.raw`\\ &`)}\\&\simeq ${n(lhs)}=F_i=${n(rhs)}\end{aligned}`):'<p>All degrees of freedom in this model are prescribed.</p>'}
 <details><summary>Full force and displacement vectors (${keys.length} entries)</summary><p>Rows ending x/y: F in kN and U in m. Rows containing r: F in kN m and U in rad. Mesh labels are the solver’s internal subdivision points.</p>${table(['Degree of freedom','Restraint','F','U'],dofs)}</details>
 <h4>5. Recover member end actions and support reactions</h4>
 ${eq(String.raw`\mathbf d_e=${vector(d,8)},\qquad \mathbf q_e=\mathbf k_e\mathbf d_e-\mathbf f_e^{\,eq}=${vector(end,6)}`)}
 <p>The vector above gives the actual end actions of the first finite element. Support reactions at prescribed degrees of freedom follow from the complete assembled system. For a spring already included in K, its support reaction is recovered separately as Rᵧ = −kₛuᵧ:</p>
 ${eq(String.raw`\mathbf R=\mathbf K\mathbf U-\mathbf F`)}
 ${result.reactions.length?table(['Node','Rx','Ry','Reaction moment'],result.reactions.map(r=>['N'+(model.nodes.findIndex(p=>p.id===r.node)+1),display(model,r.fx,'force',6),display(model,r.fy,'force',6),display(model,r.m,'moment',6)])):''}
 <h4>6. Recover diagrams and report the extrema</h4>
 ${eq(String.raw`N(x)=-q_1-q_x\,x,\qquad V(x)=q_2+q_y\,x,\qquad M(x)=-q_3+q_2x+\frac{q_yx^2}{2}`)}
 <p>Here x is measured from the start of each finite element; q₁, q₂ and q₃ are its first three end actions. Concentrated-load jumps are evaluated on each side. Uniform-load bending extrema also include V(x) = 0.</p>
 ${eq(String.raw`\max|M|=|${n(peakM.M)}|=${n(result.maxMoment)}\;\mathrm{kN\,m}`)}
 <p>This occurs on B${model.beams.findIndex(b=>b.id===peakM.beam)+1} at ${formatNumber(peakM.t*100,3)}% of its length: <b>${display(model,result.maxMoment,'moment',6)}</b>.</p>
 ${eq(String.raw`u_{max}=\max\sqrt{u_x^2+u_y^2}=\sqrt{(${n(peakU.ux,9)})^2+(${n(peakU.uy,9)})^2}=${n(result.maxDisplacement/1000,9)}\;\mathrm m`)}
 <p>The sampled maximum occurs on B${model.beams.findIndex(b=>b.id===peakU.beam)+1} at ${formatNumber(peakU.t*100,3)}%: <b>${display(model,result.maxDisplacement/1000,'deflection',6)}</b>. Displacements use beam interpolation with uniform-load correction. Display magnification is not part of this value. Sampled displacement extrema are an approximation.</p>
 <p class="trace-note">The complete unrounded assembled K, F, U, element matrices and model for this worked case are embedded in this HTML as JSON under “frame-calculation-audit”. They can be inspected in the document source without running code.</p>
 <script type="application/json" id="frame-calculation-audit">${JSON.stringify(trace).replaceAll('<','\\u003c')}</script></section>`;
}
