import {useEffect,useState} from 'react';
import type {SpatialResult} from './spatial-analysis';
import type {SpatialInstability} from './spatial-instability';
import type {SpatialModel} from './spatial-model';

type Reply={result?:SpatialResult;error?:string;instability?:SpatialInstability};
export function useSpatialAnalysis(model:SpatialModel,enabled:boolean):Reply & {pending:boolean}{
  const [reply,setReply]=useState<(Reply & {model:SpatialModel})|null>(null);
  useEffect(()=>{
    if(!enabled)return;
    let worker:Worker|undefined,active=true;
    try{
      worker=new Worker(new URL('./spatial-analysis-worker.ts',import.meta.url),{type:'module'});
      worker.onmessage=(event:MessageEvent<Reply>)=>{if(active)setReply({...event.data,model});};
      worker.onerror=e=>{if(active)setReply({model,error:e.message||'The 3D analysis worker could not run.'});};
      worker.postMessage(model);
    }catch(error){setReply({model,error:error instanceof Error?error.message:'The 3D analysis worker could not start.'});}
    return ()=>{active=false;worker?.terminate();};
  },[enabled,model]);
  if(!enabled)return {pending:false};
  return reply?.model===model?{result:reply.result,error:reply.error,instability:reply.instability,pending:false}:{pending:true};
}
