import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {X} from 'lucide-react';
import {actionLabel} from './sketch-actions';
import type {ActionMode,GeometryPick,SketchAction} from './sketch-actions';
import './sketch-popover.css';

export type CursorPosition={x:number;y:number};
export function SketchPopover({at,title,caption,onClose,children}:{at:CursorPosition;title:string;caption?:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState(at);
  useLayoutEffect(()=>{
    const el=ref.current;
    if (!el) return;
    const positionMenu=()=>{
      const rect=el.getBoundingClientRect(),gap=12;
      const left=at.x+gap+rect.width<=window.innerWidth ? at.x+gap : at.x-gap-rect.width;
      const top=at.y+gap+rect.height<=window.innerHeight ? at.y+gap : at.y-gap-rect.height;
      setPosition({x:Math.max(6,Math.min(left,window.innerWidth-rect.width-6)),y:Math.max(6,Math.min(top,window.innerHeight-rect.height-6))});
    };
    positionMenu();
    const ro=new ResizeObserver(positionMenu);ro.observe(el);
    window.addEventListener('resize',positionMenu);
    return ()=>{ro.disconnect();window.removeEventListener('resize',positionMenu);};
  },[at.x,at.y]);
  useEffect(()=>{
    function outside(e:PointerEvent){
      const target=e.target as Element;
      if (!ref.current?.contains(target) && !target.closest('[data-sketch-surface]')) onClose();
    }
    function escape(e:KeyboardEvent){
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();onClose();}
    }
    document.addEventListener('pointerdown',outside,true);
    window.addEventListener('keydown',escape,true);
    return ()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',escape,true);};
  },[onClose]);
  return <div className="sketch-cursor-popover" ref={ref} role="dialog" aria-label={title}
    style={{left:position.x,top:position.y}} onPointerDown={e=>e.stopPropagation()}>
    <div className="sketch-popover-head"><strong>{title}</strong><button type="button" aria-label={'Close '+title} onClick={onClose}><X size={14}/></button></div>
    {caption && <p className="sketch-pick-caption">{caption}</p>}
    {children}
  </div>;
}
export function SketchActionMenu({at,picks,actions,space,mode,describe,onAction,onClose,error}:{
  at:CursorPosition;picks:GeometryPick[];actions:SketchAction[];space:'2D'|'3D';mode:ActionMode;
  describe:(p:GeometryPick)=>string;onAction:(s:SketchAction)=>void;onClose:()=>void;error?:string
}) {
  const single=picks.length===1 && picks[0].type==='member';
  return <SketchPopover at={at} title={mode==='constraint'?'Available constraints':'Dimension'} caption={picks.map(describe).join(' + ')} onClose={onClose}>
    <div className="sketch-action-buttons">{actions.map(id=><button key={id} type="button" onClick={()=>onAction(id)}>{actionLabel(id,space,single)}</button>)}</div>
    {!actions.length && <p className="sketch-pick-caption">No additional relation is available for this selection.</p>}
    {single && <small>Pick a second point or member for more options.</small>}
    {error && <p className="sketch-pick-error" role="alert">{error}</p>}
  </SketchPopover>;
}
