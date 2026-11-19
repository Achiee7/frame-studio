import {useState} from 'react';
import {ArrowDown,ArrowDownToLine,BetweenHorizontalStart,CircleDot,DraftingCompass,Equal,Eye,FolderOpen,GitBranch,GitMerge,Hand,Link2,ListTree,Locate,MousePointer2,MoveUpRight,Orbit,RotateCcw,Ruler,Triangle} from 'lucide-react';
import type {ComponentType} from 'react';
import {CadRibbon,RibbonGroup,RibbonTool} from './cad-ribbon';
import {SketchPopover} from './sketch-popover';
import type {CursorPosition} from './sketch-popover';
import type {SpatialTool} from './spatial-canvas';
import type {SpatialLoad} from './spatial-analysis-input';
import type {SketchAction} from './sketch-actions';
import {Parallel,Perpendicular,Collinear} from './relation-icons';

type Icon=ComponentType<{size?:number;strokeWidth?:number}>;
export function commandPosition():CursorPosition {
  const r=document.activeElement?.getBoundingClientRect();
  return {x:r?.left??24,y:r?.bottom??110};
}
export function useSpatialLayers(){
  const [at,setAt]=useState<CursorPosition|null>(null);
  return {open:!!at,toggle:()=>setAt(at?null:commandPosition()),close:()=>setAt(null),
    menu:(entries:{name:string;checked:boolean;change:(v:boolean)=>void}[])=>at&&<SketchPopover at={at} title="Drawing layers" onClose={()=>setAt(null)}>
      <div className="sp-drawing-layers">{entries.map(o=><label key={o.name}><input type="checkbox" checked={o.checked} onChange={e=>o.change(e.target.checked)}/>{o.name}</label>)}</div>
    </SketchPopover>};
}
function axisIcon(axis:'X'|'Y'|'Z',measure:boolean):Icon{
  return ({size=18,strokeWidth=1.65})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
    {measure?<path d="M2 5v8m20-8v8M3 9h18m-15-2-3 2 3 2m12-4 3 2-3 2"/>:<path d="M2 9h19m-4-4 4 4-4 4"/>}
    <text x="8.5" y="22" fill="currentColor" stroke="none" fontSize="10" fontWeight="700">{axis}</text>
  </svg>;
}
type ActionCommand={action:SketchAction;label:string;description:string;icon:Icon};
const dimensions:ActionCommand[]=[
  {action:'length',label:'Length',icon:Ruler,description:'Set member length or the true distance between two points.'},
  {action:'dx',label:'X distance',icon:axisIcon('X',true),description:'Set the X distance between two points.'},
  {action:'dy',label:'Y distance',icon:axisIcon('Y',true),description:'Set the Y distance between two points.'},
  {action:'dz',label:'Z distance',icon:axisIcon('Z',true),description:'Set the Z distance between two points.'},
  {action:'offset',label:'Offset',icon:BetweenHorizontalStart,description:'Set the perpendicular distance between a point and a member line.'},
  {action:'angle',label:'Angle',icon:DraftingCompass,description:'Set the included angle between two members.'}
];
const constraints:ActionCommand[]=[
  {action:'alongX',label:'Along X',icon:axisIcon('X',false),description:'Align one member or two points along global X.'},
  {action:'alongY',label:'Along Y',icon:axisIcon('Y',false),description:'Align one member or two points along global Y.'},
  {action:'alongZ',label:'Along Z',icon:axisIcon('Z',false),description:'Align one member or two points along global Z.'},
  {action:'connect',label:'Connect',icon:GitMerge,description:'Join two points or keep a point on a member.'},
  {action:'pointOnMember',label:'Point on member',icon:Locate,description:'Keep a point on a member line.'},
  {action:'midpoint',label:'Midpoint',icon:BetweenHorizontalStart,description:'Constrain a point at the centre of a member.'},
  {action:'parallel',label:'Parallel',icon:Parallel,description:'Keep two members parallel in 3D.'},
  {action:'perpendicular',label:'Perpendicular',icon:Perpendicular,description:'Make a right angle between the selected members.'},
  {action:'equal',label:'Equal length',icon:Equal,description:'Keep two members equal in length.'},
  {action:'collinear',label:'Collinear',icon:Collinear,description:'Keep both members on the same straight line.'}
];
export const drawingTools=[
  {id:'select',name:'Select',icon:MousePointer2,key:'V',description:'Select an object to inspect or edit it.'},
  {id:'beam',name:'Beam',icon:MoveUpRight,key:'B',description:'Draw connected bending and axial members.'},
  {id:'strut',name:'Strut',icon:GitBranch,key:'T',description:'Draw an axial member between two joints.'},
  {id:'joint',name:'Joint',icon:CircleDot,key:'J',description:'Place a joint on the workplane or connect intersecting members.'},
  {id:'dimension',name:'Dimension',icon:Ruler,key:'L',description:'Choose geometry to see its available dimensions.'},
  {id:'constraint',name:'Constraints',icon:Link2,key:'C',description:'Choose geometry to see its available constraints.'},
  {id:'orbit',name:'Orbit',icon:Orbit,key:'O',description:'Rotate the view around the model.'},
  {id:'pan',name:'Pan',icon:Hand,key:'H',description:'Move the view without changing the model.'}
] as const;
export type TargetAction='support'|SpatialLoad['kind'];
type Props={
  tool:SpatialTool;target:TargetAction|null;activeAction?:SketchAction|null;onTool:(tool:SpatialTool)=>void;
  onTarget:(target:TargetAction)=>void;onAction:(action:SketchAction,dimension:boolean)=>void;onSections:()=>void;
  pane:boolean;onPane:()=>void;layers:boolean;onLayers:()=>void;
};
export function SpatialModelRibbon({tool,target,activeAction,onTool,onTarget,onAction,onSections,pane,onPane,layers,onLayers}:Props){
  const button=(id:SpatialTool,small=false)=>{
    const item=drawingTools.find(o=>o.id===id)!;
    return <RibbonTool key={id} label={item.name} icon={item.icon} description={item.description+' ('+item.key+')'}
      active={tool===id&&!target&&!activeAction} small={small} onClick={()=>onTool(id)}/>;
  };
  const action=(c:ActionCommand,dim:boolean)=><RibbonTool key={c.action} label={c.label} description={c.description} icon={c.icon}
    onClick={()=>onAction(c.action,dim)} small active={activeAction===c.action}/>;
  return <CadRibbon label="3D model tools">
    <RibbonGroup label="View" compact>{button('select',true)}{button('pan',true)}
      <RibbonTool label="Model tree" icon={ListTree} small description="Show or hide the model tree and inspector." active={pane} onClick={onPane}/>
      <RibbonTool label="Visibility options" icon={Eye} small description="Show or hide grid, dimensions, constraints, loads and names." active={layers} onClick={onLayers}/>
      {button('orbit',true)}
    </RibbonGroup>
    <RibbonGroup label="Build">{button('beam')}{button('strut')}{button('joint')}
      <RibbonTool label="Support" description="Select a joint to choose its support." icon={Triangle} onClick={()=>onTarget('support')} active={target==='support'}/>
      <RibbonTool label="Sections" icon={FolderOpen} description="Browse and assign section profiles." onClick={onSections}/>
    </RibbonGroup>
    <RibbonGroup label="Dimension">{button('dimension')}</RibbonGroup>
    <RibbonGroup label="Dimensions" compact>{dimensions.map(c=>action(c,true))}</RibbonGroup>
    <RibbonGroup label="Constraints" compact>{button('constraint',true)}{constraints.map(c=>action(c,false))}</RibbonGroup>
    <RibbonGroup label="Forces">{([{key:'force',label:'Point force',icon:ArrowDown,description:'Place a force at a joint or anywhere on a member.'},
      {key:'moment',label:'Moment',icon:RotateCcw,description:'Place a couple at a joint or a position on a beam.'},
      {key:'distributed',label:'Distributed load',icon:ArrowDownToLine,description:'Apply a uniform load across a member.'}] as const).map(item=>
      <RibbonTool key={item.key} label={item.label} icon={item.icon} description={item.description} active={target===item.key} onClick={()=>onTarget(item.key)}/>)}
    </RibbonGroup>
  </CadRibbon>;
}
