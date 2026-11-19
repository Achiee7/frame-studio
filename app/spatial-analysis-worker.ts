import {solveSpatial} from './spatial-analysis.ts';
import type {SpatialModel} from './spatial-model.ts';

self.onmessage=(event:MessageEvent<SpatialModel>)=>{
  try{self.postMessage({result:solveSpatial(event.data)});}
  catch(error){self.postMessage({error:error instanceof Error?error.message:'The 3D frame could not be solved.'});}
};
