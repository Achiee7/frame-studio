import {createContext,useContext,useEffect,useId,useRef,useState} from 'react';
import type {ComponentType,ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown,Pin,PinOff} from 'lucide-react';
import './cad-ribbon.css';

const afterCommand=createContext<()=>void>(()=>{});
const storageKey='frame-studio.ribbon-pinned';

export function CadRibbon({label,children}:{label:string;children:ReactNode}) {
  const [pinned,setPinned]=useState(()=>{try{return localStorage.getItem(storageKey)!=='false';}catch{return true;}});
  const [expanded,setExpanded]=useState(false);
  const ref=useRef<HTMLElement>(null),toggleRef=useRef<HTMLButtonElement>(null);
  const visible=pinned||expanded;
  useEffect(()=>{
    if(pinned||!expanded)return;
    function outside(e:PointerEvent){if(!ref.current?.contains(e.target as Node))setExpanded(false);}
    function key(e:KeyboardEvent){if(e.key==='Escape'){setExpanded(false);toggleRef.current?.focus();}}
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key);
    return ()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key);};
  },[pinned,expanded]);
  function pin(){
    const next=!pinned;
    try{localStorage.setItem(storageKey,String(next));}catch{}
    setPinned(next);setExpanded(false);
  }
  return <section data-sketch-surface="ribbon" className={'cad-command-ribbon'+(pinned?' pinned':' auto-hide')} ref={ref} aria-label={label}>
    {!pinned&&<button className="ribbon-reveal" ref={toggleRef} aria-expanded={visible} onClick={()=>setExpanded(!expanded)}>{label}<ChevronDown size={14}/></button>}
    {visible&&<div className="cad-ribbon-body"><div role="toolbar" aria-label={label} className="cad-ribbon-scroll">
      <afterCommand.Provider value={()=>{if(!pinned)setExpanded(false);}}>{children}</afterCommand.Provider>
    </div><button className="ribbon-pin" aria-label={pinned?'Unpin ribbon':'Pin ribbon'} title={pinned?'Unpin ribbon to collapse it between commands':'Keep the ribbon open'} onClick={pin}>{pinned?<Pin size={15}/>:<PinOff size={15}/>}</button></div>}
  </section>;
}

export function PickPrompt({label,children}:{label:string;children:ReactNode}){
  return <div className="cad-pick-prompt" role="status"><strong>{label}</strong><span>{children}</span></div>;
}

export function RibbonGroup({label,compact=false,children}:{label:string;compact?:boolean;children:ReactNode}){
  return <div className={'cad-ribbon-group'+(compact?' compact':'')} role="group" aria-label={label}>
    <div className="ribbon-group-items">{children}</div><span className="ribbon-group-label">{label}</span>
  </div>;
}

type ToolProps={label:string;icon:ComponentType<{size?:number;strokeWidth?:number}>;description:string;onClick:()=>void;active?:boolean;small?:boolean;disabled?:boolean};
export function RibbonTool({label,icon:Icon,description,onClick,active,small,disabled}:ToolProps){
  const done=useContext(afterCommand),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [tip,setTip]=useState<{x:number;y:number}|null>(null),id=useId();
  function hide(){clearTimeout(timer.current);setTip(null);}
  function show(el:HTMLElement){hide();const box=el.getBoundingClientRect();
    timer.current=setTimeout(()=>setTip({x:Math.max(6,Math.min(box.left,window.innerWidth-262)),y:box.bottom+7}),350);}
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  return <button type="button" className={'ribbon-tool'+(small?' small':'')} aria-label={label} aria-pressed={active} disabled={disabled}
    aria-describedby={tip?id:undefined} onMouseEnter={e=>show(e.currentTarget)} onMouseLeave={hide}
    onFocus={e=>show(e.currentTarget)} onBlur={hide} onClick={()=>{hide();onClick();done();}}>
    <Icon size={small?17:25} strokeWidth={1.65}/>{!small&&<span>{label}</span>}
    {tip&&createPortal(<span className="cad-tool-tip" role="tooltip" id={id} style={{left:tip.x,top:tip.y}}><b>{label}</b>{description}</span>,document.body)}
  </button>;
}
