import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {example,validModel} from '../app/model.ts';
import {sectionProperties} from '../app/sections.ts';
import {defaultMaterial} from '../app/materials.ts';
import {solveMaterial} from '../app/plastic.ts';
import {solve} from '../app/solver.ts';
import {loadReversals} from '../app/reversals.ts';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'frame-report-'));
try{
 const entry=path.join(tmp,'reports.mjs');
 await build({stdin:{contents:"export {reportHtml} from './app/frame-report'; export {materialReportHtml} from './app/material-report'; export {texNumber} from './app/report-math';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:entry});
 const {reportHtml,materialReportHtml,texNumber}=await import(pathToFileURL(entry));
 assert.equal(texNumber(12345.67),'12{.}345{,}67');
 const model=example('elevator'),study=loadReversals(model,solve,{G:1,Q:1,W:1},[]),html=reportHtml(model,'Worked <frame>',study,[]);
 assert.ok(html.includes('class="katex"'));assert.ok(html.includes('data:font/woff2;base64,'));assert.ok(!/url\((?:fonts\/|https?:)/.test(html));assert.ok(html.includes('From geometry to results'));
 const audit=JSON.parse(html.match(/id="frame-calculation-audit">([^<]*)<\/script>/)[1]);
 audit.active.forEach(i=>assert.ok(Math.abs(audit.K[i].reduce((sum,k,j)=>sum+k*audit.U[j],0)-audit.F[i])<1e-7));
 const geometry={shape:'rectangle',h:100,b:50,tw:0,tf:0,t:0,r:0},props=sectionProperties(geometry),material={...defaultMaterial,fu:undefined,hardening:0},section={id:'qa-rect',name:'Rectangle 100 × 50',category:'Custom',geometry,E:material.E,...props};
 const m={nodes:[{id:'a',x:0,y:0,joint:'rigid',support:'fixed'},{id:'b',x:1,y:0,joint:'rigid',support:'free'}],beams:[{id:'beam',a:'a',b:'b',family:'beam',kind:'beam',profile:section.name,section,material,E:material.E,A:props.A,I:props.I}],loads:[{id:'load',beam:'beam',t:1,attachment:'end',type:'moment',fx:0,fy:0,m:25,case:'Q'}]};
 assert.ok(validModel(m));const result=solveMaterial(m),mh=materialReportHtml(m,'Plastic <beam>',result,{G:1,Q:1,W:1});assert.equal(result.status,'plastic');assert.ok(result.maxResidual>0);
 const trace=result.trace;assert.ok(trace);const E=material.E,H=trace.H,previous=trace.previousPlastic,trial=E*(trace.strain-previous),relative=trial-H*previous,increment=Math.sign(relative)*Math.max(0,Math.abs(relative)-material.fy*1000)/(E+H);
 assert.ok(Math.abs(trace.stress-(trial-E*increment))<1e-7);assert.ok(Math.abs(trace.plastic-(previous+increment))<1e-12);assert.equal(result.unloadingHistory.at(-1).factor,0);assert.equal(result.unloadingHistory.at(-1).displacement,result.unloaded.maxDisplacement);
 const ma=JSON.parse(mh.match(/id="material-calculation-audit">([^<]*)<\/script>/)[1]);assert.equal(ma.result.maxResidual,result.maxResidual);assert.ok(mh.includes('Plastic &lt;beam&gt;'));assert.ok(mh.includes('class="katex"'));assert.ok(mh.includes('one and the same fibre'));
 if(process.env.REPORT_QA_DIR){fs.mkdirSync(process.env.REPORT_QA_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.REPORT_QA_DIR,'elastic-report.html'),html);fs.writeFileSync(path.join(process.env.REPORT_QA_DIR,'material-report.html'),mh);fs.writeFileSync(path.join(process.env.REPORT_QA_DIR,'plastic-beam.json'),JSON.stringify({format:'frame-studio-v1',name:'Material benchmark · plastic bending',model:m},null,2));const failure=structuredClone(m);failure.beams[0].material={...defaultMaterial,fu:260};failure.loads[0].m=35;fs.writeFileSync(path.join(process.env.REPORT_QA_DIR,'failure-beam.json'),JSON.stringify({format:'frame-studio-v1',name:'Material benchmark · tensile limit',model:failure},null,2));}
 const huge=structuredClone(m);huge.loads[0].m=1e8;const hugeStudy=loadReversals(huge,solve,{G:1,Q:1,W:1},[]);assert.throws(()=>reportHtml(huge,'Invalid target',hugeStudy,[]),/model range/i);const stop=solveMaterial(huge);assert.equal(stop.status,'out-of-range');const stoppedHtml=materialReportHtml(huge,'Stopped run',stop,{G:1,Q:1,W:1});assert.ok(stoppedHtml.includes('Last accepted load step only'));assert.ok(stoppedHtml.includes('no valid target deformation or failure verdict'));assert.ok(stoppedHtml.includes('Permanent set is unavailable'));
 console.log('Passed: rendered offline LaTeX, locale-safe math numbers, actual assembled equilibrium trace, same-fibre plastic correction, converged unloading history, escaped titles and complete embedded report audit.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
