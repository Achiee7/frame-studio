import {solveMaterial} from './plastic';
self.onmessage=e=>{try{self.postMessage({result:solveMaterial(e.data.model,e.data.factors)});}catch(error){self.postMessage({error:(error as Error).message});}};
