/** Sparse symmetric stiffness assembly and scaled LDLᵀ elimination. kN, m, rad. */
export class SpatialSystem {
  readonly stiffness:Map<number,number>[]=[];
  readonly load:number[]=[];
  readonly fixed=new Set<number>();
  readonly translations=new Set<number>();

  nextTriple(translation:boolean):number {
    const start=this.load.length;
    for(let i=start;i<start+3;i++){
      this.stiffness.push(new Map());this.load.push(0);
      if(translation)this.translations.add(i);
    }
    return start;
  }
  add(i:number,j:number,value:number){
    if(value!==0)this.stiffness[i].set(j,(this.stiffness[i].get(j)??0)+value);
  }
  solve(instability:(kind:'translation'|'rotation',physical:number[])=>Error){
    const active=new Set<number>();
    const scale=this.stiffness.map((row,i)=>{
      if(!this.fixed.has(i))active.add(i);
      const diagonal=row.get(i)??0;
      if(!Number.isFinite(diagonal)||diagonal<0)throw Error('Invalid stiffness. Check the member length and section properties.');
      return Math.sqrt(diagonal)||1;
    });
    const rows=this.stiffness.map((row,i)=>{
      const result=new Map<number,number>();
      if(active.has(i))for(const [j,value] of row)if(active.has(j)&&value!==0)result.set(j,value/(scale[i]*scale[j]));
      return result;
    });
    const applied=this.load.map((value,i)=>value/scale[i]),rhs=[...applied],values=this.load.map(()=>0);
    const rhsScale=Math.max(1e-20,...[...active].map(i=>Math.abs(applied[i])));
    const steps:{i:number;adjacent:[number,number][]}[]=[];
    const tolerance=1e-11;
    while(active.size){
      // The fewest remaining neighbours usually gives the smallest fill-in.
      let pivot=-1,degree=Infinity;
      for(const i of active)if((rows[i].get(i)??0)>tolerance&&rows[i].size<degree){pivot=i;degree=rows[i].size;}
      if(pivot<0)break;
      const diagonal=rows[pivot].get(pivot)!;
      rows[pivot].delete(pivot);
      const neighbours=[...rows[pivot]];
      const adjacent=neighbours.map(([j,value]):[number,number]=>[j,value/diagonal]);
      rhs[pivot]/=diagonal;
      for(let k=0;k<neighbours.length;k++){
        const [i,ki]=neighbours[k];rows[i].delete(pivot);
        rhs[i]-=ki*rhs[pivot];
        for(let l=k;l<neighbours.length;l++){
          const [j,ratio]=adjacent[l];
          const next=(rows[i].get(j)??0)-ki*ratio;
          if(next===0){rows[i].delete(j);rows[j].delete(i);}
          else{rows[i].set(j,next);rows[j].set(i,next);}
        }
      }
      active.delete(pivot);rows[pivot].clear();
      steps.push({i:pivot,adjacent});
    }

    function backSubstitute(vector:number[],homogeneous:boolean){
      for(let k=steps.length-1;k>=0;k--){
        const {i,adjacent}=steps[k];
        let value=homogeneous?0:rhs[i];
        for(const [j,ratio] of adjacent)value-=ratio*vector[j];
        vector[i]=value;
      }
    }
    const indeterminate=new Set<number>();
    for(const gauge of active){
      const mode=Array(rhs.length).fill(0);mode[gauge]=1;
      backSubstitute(mode,true);
      const max=Math.max(1,...mode.map(Math.abs));
      if([...this.translations].some(i=>Math.abs(mode[i])>1e-7*max)){
        throw instability('translation',mode.map((value,i)=>value/scale[i]));
      }
      // A simply supported beam can spin freely about its own axis. Its
      // bending reactions are unique if the applied loads do no work on that mode.
      let work=0,absoluteWork=0;
      for(let i=0;i<mode.length;i++){
        if(Math.abs(mode[i])<=1e-12*max)continue;
        const contribution=applied[i]*mode[i];
        work+=contribution;absoluteWork+=Math.abs(contribution);
      }
      if(Math.abs(work)>1e-8*absoluteWork)throw instability('rotation',mode.map((value,i)=>value/scale[i]));
      mode.forEach((v,i)=>{if(Math.abs(v)>1e-7*max)indeterminate.add(i);});
    }
    backSubstitute(values,false);
    const U=values.map((v,i)=>v/scale[i]);
    const R=this.stiffness.map((row,i)=>{
      let value=-this.load[i];for(const [j,k] of row)value+=k*U[j];
      return value;
    });
    for(let i=0;i<U.length;i++){
      if(!Number.isFinite(U[i])||!Number.isFinite(R[i]))throw Error('No finite 3D solution. Check geometry and section stiffness.');
      if(!this.fixed.has(i)&&Math.abs(R[i])/scale[i]>1e-6*rhsScale)throw Error('3D equilibrium could not be resolved. Check the supports and stiffness contrast.');
    }
    return {U,R,indeterminate};
  }
}
