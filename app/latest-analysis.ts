import type {Model} from './model';
export function analysisKey(m:Model,factors:Record<string,number>){return JSON.stringify({nodes:m.nodes,beams:m.beams.map(({id,a,b,family,kind,profile,E,A,I,releaseA,releaseB,material,section})=>({id,a,b,family,kind,profile,E,A,I,releaseA,releaseB,material,geometry:section?.geometry,sectionMaterial:section?.material})),loads:m.loads.map(({id,beam,t,type,fx,fy,m,case:loadCase})=>({id,beam,t,type,fx,fy,m,case:loadCase})),factors});}
// At most one solve is in flight. Pointer edits replace the pending job, never
// restart a worker or accumulate a backlog of obsolete intermediate models.
export class LatestAnalysis<T,R>{
 private busy=false;private pending?:{key:string;input:T};private stopped=false;private latestKey='';
 private send:(job:{key:string;input:T})=>void;private receive:(key:string,result:R)=>void;
 constructor(send:(job:{key:string;input:T})=>void,receive:(key:string,result:R)=>void){this.send=send;this.receive=receive;}
 submit(key:string,input:T){if(this.stopped)return;this.latestKey=key;const job={key,input};if(this.busy)this.pending=job;else{this.busy=true;this.send(job);}}
 complete(key:string,result:R){if(this.stopped)return;if(key===this.latestKey)this.receive(key,result);this.busy=false;const next=this.pending;this.pending=undefined;if(next)this.submit(next.key,next.input);}
 stop(){this.stopped=true;this.pending=undefined;}
}
