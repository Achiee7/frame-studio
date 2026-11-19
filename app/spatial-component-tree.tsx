import type {MouseEvent} from 'react';
import {ArrowDown,CircleDot,Component,GitBranch,Layers3,MoveUpRight,RotateCcw,TrendingDown} from 'lucide-react';
import {SupportGlyph,supportTypes} from './support-symbol';
import type {SpatialModel} from './spatial-model';
import type {SpatialLoad} from './spatial-analysis-input';
import type {SpatialSelection} from './spatial-canvas';
import {sectionForSpatialMember} from './spatial-analysis-input';
import {useUnits} from './unit-context';
import {quantity,settingNumber} from './units';

type Props={
  model:SpatialModel;
  selected:SpatialSelection;
  selectedLoad?:string;
  highlightedMembers?:string[];
  onPick:(object:NonNullable<SpatialSelection>,event:MouseEvent<HTMLButtonElement>)=>void;
  onLoad:(load:SpatialLoad)=>void;
};
const loadNames={force:'Point force',moment:'Moment',distributed:'Distributed load'};
export default function SpatialComponentTree({model,selected,selectedLoad,highlightedMembers=[],onPick,onLoad}:Props){
  const units=useUnits(),loads=model.loads??[];
  const active=(type:'node'|'member',id:string)=>selected?.type===type&&selected.id===id||type==='member'&&highlightedMembers.includes(id);
  return <nav data-sketch-surface="tree" className="sp-component-tree" aria-label="Model tree">
    <header>Model tree</header>
    <details open>
      <summary><Component size={14}/>Components <span>{model.members.length+model.nodes.length}</span></summary>
      <details className="sp-tree-branch" open>
        <summary>Members <span>{model.members.length}</span></summary>
        {model.members.map(member=>{
          const Icon=member.kind==='beam'?MoveUpRight:GitBranch;
          return <button key={member.id} type="button" aria-label={'Select member '+member.id} aria-pressed={active('member',member.id)}
            onClick={e=>onPick({type:'member',id:member.id},e)}><Icon size={13}/><b>{member.id}</b><small>{sectionForSpatialMember(member).name}</small></button>;
        })}
      </details>
      <details className="sp-tree-branch" open>
        <summary>Joints &amp; supports <span>{model.nodes.length}</span></summary>
        {model.nodes.map(node=><button key={node.id} type="button" aria-label={'Select joint '+node.id} aria-pressed={active('node',node.id)}
          onClick={e=>onPick({type:'node',id:node.id},e)}>
          {node.support==='free'?<CircleDot size={13}/>:<svg aria-hidden="true" width="16" height="17" viewBox="-23 -5 46 50"><SupportGlyph type={node.support}/></svg>}
          <b>{node.id}</b><small>{node.support==='free'?node.joint:supportTypes.find(v=>v.id===node.support)?.name}</small></button>)}
      </details>
    </details>
    <details open>
      <summary><Layers3 size={14}/>Forces <span>{loads.length}</span></summary>
      {loads.map(load=>{
        const Icon=load.kind==='moment'?RotateCcw:load.kind==='distributed'?TrendingDown:ArrowDown;
        const q=quantity(units,load.kind==='moment'?'moment':load.kind==='distributed'?'distributed':'force');
        const value=settingNumber(Math.hypot(load.vector.x,load.vector.y,load.vector.z)/q.factor,units,false)+' '+q.unit;
        return <button key={load.id} type="button" aria-label={'Select '+load.id+' '+loadNames[load.kind].toLowerCase()} aria-pressed={selectedLoad===load.id}
          title={loadNames[load.kind]+' · '+load.targetId+' · '+value} onClick={()=>onLoad(load)}>
          <Icon size={13}/><b>{load.id}</b><span>{load.targetId}</span><small>{value}</small></button>;
      })}
      {!loads.length&&<p>No applied loads</p>}
    </details>
  </nav>;
}
