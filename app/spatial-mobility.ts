import type {SpatialModel} from './spatial-model.ts';
import {spatialSketchLinearization} from './spatial-sketch.ts';

export type SpatialConstraintState = 'free'|'fixed'|'conflict';
type Row = Map<number,number>;
const rankTolerance=1e-7;

/** Subtract a pivot row to eliminate its coordinate from another equation. */
function eliminate(row:Row,pivot:number,basis:Row) {
  const factor=row.get(pivot);
  if(factor===undefined)return;
  row.delete(pivot);
  for(const [column,coefficient] of basis){
    if(column===pivot)continue;
    const value=(row.get(column)??0)-factor*coefficient;
    if(Math.abs(value)<=rankTolerance)row.delete(column);
    else row.set(column,value);
  }
}

/** A joint is fixed only if every allowed sketch motion leaves all three
 * coordinates stationary in world space. FE supports do not enter this system. */
export function spatialSketchMobility(model:SpatialModel) {
  const pivots=new Map<number,Row>(),conflicts=new Set<string>();
  model.nodes.forEach((node,i)=>{
    if(node.positionLocked)for(let col=i*3;col<i*3+3;col++)pivots.set(col,new Map([[col,1]]));
  });
  for(const equation of spatialSketchLinearization(model)){
    if(!Number.isFinite(equation.error)||Math.abs(equation.error)>1e-6){
      for(const id of equation.points)conflicts.add(id);
    }
    const magnitude=Math.max(0,...equation.derivatives.map(Math.abs));
    if(magnitude<=equation.scale*rankTolerance)continue;
    const row:Row=new Map();
    equation.columns.forEach((col,i)=>{
      const v=equation.derivatives[i]/magnitude;
      if(Math.abs(v)>rankTolerance)row.set(col,v);
    });
    for(const [pivot,basis] of pivots)eliminate(row,pivot,basis);
    if(!row.size)continue;
    let pivot=-1,largest=0;
    for(const [col,v] of row)if(Math.abs(v)>largest){largest=Math.abs(v);pivot=col;}
    const divisor=row.get(pivot)!;
    for(const [col,v] of row)row.set(col,v/divisor);
    pivots.set(pivot,row);
  }
  // Reduce each pivot to a function of independent (non-pivot) variables.
  // A pivot with no remaining dependency is an immovable coordinate.
  const fixed=new Set<number>();
  for(const [pivot,row] of [...pivots].reverse()){
    for(const col of [...row.keys()]){
      if(col===pivot)continue;
      const later=pivots.get(col);
      if(later)eliminate(row,col,later);
    }
    if(row.size===1)fixed.add(pivot);
  }
  const nodes=new Map<string,SpatialConstraintState>(),members=new Map<string,SpatialConstraintState>();
  model.nodes.forEach((node,i)=>{
    const at=i*3;
    nodes.set(node.id,conflicts.has(node.id)?'conflict':fixed.has(at)&&fixed.has(at+1)&&fixed.has(at+2)?'fixed':'free');
  });
  for(const member of model.members){
    const a=nodes.get(member.a),b=nodes.get(member.b);
    members.set(member.id,a==='conflict'||b==='conflict'?'conflict':a==='fixed'&&b==='fixed'?'fixed':'free');
  }
  return {dof:model.nodes.length*3-pivots.size,nodes,members};
}
