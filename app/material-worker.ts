import {solveMaterial} from './plastic';
self.onmessage=e=>{const {key,input}=e.data;try{self.postMessage({key,result:solveMaterial(input.model,input.factors)});}catch(error){self.postMessage({key,error:(error as Error).message});}};
