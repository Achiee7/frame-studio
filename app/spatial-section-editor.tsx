import {useEffect,useMemo,useState} from 'react';
import {Check,Layers3,X} from 'lucide-react';
import {SectionLibraryDialog} from './beam-library';
import {assignSpatialSections,spatialSectionTargets} from './section-assignment';
import type {SectionSpec} from './sections';
import type {SpatialModel} from './spatial-model';
import type {SpatialSelection} from './spatial-canvas';

export function useSpatialSections(model:SpatialModel,selection:SpatialSelection,onChange?:((next:SpatialModel)=>void)){
  const [library,setLibrary]=useState(false),[version,setVersion]=useState(0);
  const [bulk,setBulk]=useState<SectionSpec|null>(null),[ids,setIds]=useState<string[]>([]),[error,setError]=useState('');
  const targets=useMemo(()=>spatialSectionTargets(model),[model]);
  const chosen=ids.filter(id=>model.members.some(m=>m.id===id));
  const closeBulk=()=>{setBulk(null);setIds([]);setError('');};
  const open=()=>{closeBulk();setLibrary(true);};
  function apply(memberIds:string[],section:SectionSpec){
    if(!onChange||!memberIds.length)return false;
    const next=assignSpatialSections(model,memberIds,section);
    onChange(next);return true;
  }
  function pick(id:string){setIds(prev=>prev.includes(id)?prev.filter(v=>v!==id):[...prev,id]);setError('');}
  useEffect(()=>{
    if(!bulk)return;
    function key(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();closeBulk();}}
    window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);
  },[bulk]);
  const dialog=library&&<SectionLibraryDialog targets={targets} selected={selection?.type==='member'?selection.id:undefined}
    onApply={apply} onClose={()=>setLibrary(false)} onLibraryChange={()=>setVersion(v=>v+1)}
    onApplyMultiple={section=>{setLibrary(false);setBulk(section);setIds([]);setError('');}}/>;
  const selectionBar=bulk&&<div className="sp-section-assignment" role="region" aria-label="Apply section to multiple members">
    <Layers3 size={15}/><span><b>{bulk.name}</b> · {chosen.length} selected</span>
    <span>Click members in the drawing or tree.</span>
    <button disabled={!chosen.length} onClick={()=>{try{if(apply(chosen,bulk))closeBulk();}catch(e){setError((e as Error).message);}}}><Check size={14}/>Apply</button>
    <button onClick={closeBulk}><X size={13}/>Cancel</button>{error&&<span role="alert">{error}</span>}
  </div>;
  return {targets,version,bulk,chosen,pick,open,apply,closeBulk,dialog,selectionBar};
}
export type SpatialSectionsControl=ReturnType<typeof useSpatialSections>;
