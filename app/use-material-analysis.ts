import {useEffect,useRef,useState} from 'react';
import type {Model} from './model';
import type {MaterialResult} from './plastic';
import {LatestAnalysis} from './latest-analysis';
export {analysisKey} from './latest-analysis';
type Input={model:Model;factors:Record<string,number>};type Reply={result?:MaterialResult;error?:string};
export function useMaterialAnalysis(enabled:boolean,key:string,model:Model,factors:Record<string,number>){
 const [state,setState]=useState<{key:string;data?:MaterialResult;error?:string}>({key:''}),queue=useRef<LatestAnalysis<Input,Reply>|null>(null),latest=useRef(key);latest.current=key;
 useEffect(()=>{if(!enabled)return;const worker=new Worker(new URL('./material-worker.ts',import.meta.url),{type:'module'});const q=new LatestAnalysis<Input,Reply>(job=>worker.postMessage(job),(key,value)=>{if(key===latest.current)setState({key,data:value.result,error:value.error});});queue.current=q;worker.onmessage=e=>q.complete(e.data.key,e.data);worker.onerror=e=>{q.stop();setState({key:latest.current,error:e.message||'Material worker failed. Switch analysis mode to retry.'});};return()=>{q.stop();worker.terminate();queue.current=null;};},[enabled]);
 useEffect(()=>{if(enabled)queue.current?.submit(key,{model,factors});},[key,enabled]);
 return state;
}
