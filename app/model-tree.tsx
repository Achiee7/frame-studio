import {ArrowDown, GitBranch, MoveUpRight, RotateCcw, X} from 'lucide-react';
import {beamGroupName} from './model';
import type {Model} from './model';
import type {Picked} from './selection';
import {SupportGlyph} from './support-symbol';
import {display} from './units';

type Props = {
 model: Model;
 selected: Picked[];
 onSelect: (picked: Picked, add: boolean, cursor?:{x:number;y:number}) => void;
 onClose: () => void;
};

export default function ModelTree({model,selected,onSelect,onClose}:Props){
 function pick(item:Picked,e:React.MouseEvent) {
  onSelect(item,e.shiftKey||e.ctrlKey||e.metaKey,e.ctrlKey||e.metaKey?{x:e.clientX,y:e.clientY}:undefined);
 }
 const active=(picked:Picked)=>selected.some(item=>item.type===picked.type&&item.id===picked.id);
 const families=[...new Set(model.beams.map(beam=>beam.family))];

 return <aside data-sketch-surface="tree" className="model-tree-panel" aria-label="Model tree">
  <header><b><GitBranch size={15}/> Model tree</b><button aria-label="Collapse model tree" onClick={onClose}><X size={15}/></button></header>
  <details className="tree-root" open><summary>Components <small>{model.beams.length+model.nodes.length}</small></summary>
  <details open>
   <summary>Members <small>{model.beams.length} segments</small></summary>
   {families.map(family=><details key={family} open>
    <summary>{beamGroupName(model,family)}</summary>
    {model.beams.filter(beam=>beam.family===family).map(beam=>{
     const picked:Picked={type:'beam',id:beam.id};
     return <button key={beam.id} className={active(picked)?'active':''}
      onClick={e=>pick(picked,e)}>
      <MoveUpRight size={14}/><span>B{model.beams.indexOf(beam)+1} · {beam.profile}</span>
     </button>;
    })}
   </details>)}
  </details>
  <details>
   <summary>Joints &amp; supports <small>{model.nodes.length}</small></summary>
   {model.nodes.map((node,index)=>{
    const picked:Picked={type:'node',id:node.id};
    return <button key={node.id} className={active(picked)?'active':''} onClick={e=>pick(picked,e)}>
     <svg width="25" height="29" viewBox="-20 -3 40 45"><SupportGlyph type={node.support}/></svg>N{index+1} · {node.support}
    </button>;
   })}
  </details>
  </details>
  <details className="tree-root" open>
   <summary>Forces <small>{model.loads.length}</small></summary>
   {model.loads.map((load,index)=>{
    const picked:Picked={type:'load',id:load.id};
    const moment=load.type==='moment',distributed=load.type==='distributed';
    const name=moment?'Moment':distributed?'Distributed load':'Point force';
    const value=moment?load.m:Math.hypot(load.fx,load.fy);
    const category=moment?'moment':distributed?'distributed':'force';
    const member=model.beams.findIndex(beam=>beam.id===load.beam)+1;
    return <button key={load.id} aria-label={'Select L'+(index+1)+' '+name.toLowerCase()}
     className={active(picked)?'active':''} onClick={e=>pick(picked,e)}>
     {moment?<RotateCcw size={13}/>:<ArrowDown size={13}/>}
     <span>L{index+1} · {name}<small>{display(model,value,category)} · B{member}</small></span>
    </button>;
   })}
   {model.loads.length===0&&<small className="model-tree-empty">No applied loads</small>}
  </details>
 </aside>;
}
