import type {ReactNode} from 'react';
import {Activity,ArrowDown,ArrowDownUp,ChartNoAxesCombined,Equal,Eye,FileText,FolderOpen,GitBranch,Hand,Layers,Link2,ListTree,MousePointer2,MoveHorizontal,MoveUpRight,RotateCcw,Ruler,ScanLine,Settings2,Triangle} from 'lucide-react';
import {Horizontal,Vertical,Parallel,Perpendicular,Collinear} from './relation-icons';
import {CadRibbon,RibbonGroup,RibbonTool} from './cad-ribbon';

const build=[
  ['beam','Beam',MoveUpRight,'Draw a continuous chain of members that carry bending and axial force. Enter finishes the chain. (B)'],
  ['strut','Strut',GitBranch,'Draw an axial member between two joints. (T)'],
  ['connect','Joint',Link2,'Join intersecting beams or insert an internal hinge in a member. (J)'],
  ['support','Support',Triangle,'Choose a support symbol, then place it on a joint or member. (S)']
] as const;
const loads=[
  ['force','Point force',ArrowDown,'Place a concentrated force on a joint or anywhere along a member. (F)'],
  ['moment','Moment',RotateCcw,'Apply a concentrated couple at the picked position. (M)'],
  ['distributed','Distributed load',Layers,'Apply a uniform load along the chosen member. (D)']
] as const;
const constraints=[
  ['connect','Connect',Link2,'Join two points, or constrain a separate point to a member or its midpoint.'],
  ['horizontal','Horizontal',Horizontal,'Make a selected member horizontal, or align two points along X.'],
  ['vertical','Vertical',Vertical,'Make a selected member vertical, or align two points along Y.'],
  ['equal','Equal length',Equal,'Give two members the same length and keep them equal as the sketch changes.'],
  ['parallel','Parallel',Parallel,'Keep the directions of two members parallel.'],
  ['perpendicular','Perpendicular',Perpendicular,'Keep a right angle between two members.'],
  ['collinear','Collinear',Collinear,'Keep two members on the same straight line.']
] as const;
const diagrams=[
  ['R','Reactions',ArrowDownUp,'Show the support reactions for the current load combination.'],
  ['N','Axial force',MoveHorizontal,'Show the axial force along each member.'],
  ['V','Shear force',Activity,'Show the shear force diagram and peak member values.'],
  ['M','Bending moment',ChartNoAxesCombined,'Show the bending moment diagram along each member.'],
  ['u','Deflection',RotateCcw,'Show the displaced shape and its peak displacement.'],
  ['stress','Stress',ScanLine,'Show how the normal stress varies along each member.']
] as const;
type Props={results:boolean;tool:string;constraint:string;diagram:string;tree:boolean;visible:boolean;onTree:()=>void;onVisibility:()=>void;
  onTool:(tool:string)=>void;onConstraint:(c:string)=>void;onDiagram:(d:string)=>void;onSections:()=>void;onAudit:()=>void;
  onReport:()=>void;onOptions:()=>void;children?:ReactNode};
export default function PlanarRibbon(p:Props){
  const group=(items:typeof build|typeof loads)=>items.map(([id,name,icon,description])=><RibbonTool key={id} label={name} icon={icon}
    description={description} active={p.tool===id} onClick={()=>p.onTool(id)}/>);
  return <CadRibbon label={p.results?'2D results tools':'2D model tools'}>
    <RibbonGroup label="View" compact>
      <RibbonTool small label="Select" description="Select and edit an item. Drag a selection box or Shift-click to extend it. (V)" icon={MousePointer2} active={p.tool==='select'} onClick={()=>p.onTool('select')}/>
      <RibbonTool small label="Pan" description="Drag the drawing to reposition the view. (H)" icon={Hand} active={p.tool==='pan'} onClick={()=>p.onTool('pan')}/>
      <RibbonTool small label="Model tree" description="Show or collapse the components and forces in this drawing." icon={ListTree} active={p.tree} onClick={p.onTree}/>
      <RibbonTool small label="Visibility options" description="Choose whether dimensions, constraints, forces and names appear on the drawing." icon={Eye} active={p.visible} onClick={p.onVisibility}/>
    </RibbonGroup>
    {p.results?<><RibbonGroup label="Results">{diagrams.map(([id,name,icon,description])=><RibbonTool key={id} label={name} icon={icon} description={description} active={p.diagram===id} onClick={()=>p.onDiagram(id)}/>)}</RibbonGroup>
      {p.children}
      <RibbonGroup label="Review"><RibbonTool label="Analysis details" description="Inspect the analysis status, material response and worked calculations." icon={Settings2} onClick={p.onOptions}/>
      <RibbonTool label="Report" description="Choose possible load reversals and generate a worked calculation report." icon={FileText} onClick={p.onReport}/></RibbonGroup>
    </>:<><RibbonGroup label="Build">{group(build)}
      <RibbonTool label="Sections" icon={FolderOpen} description="Browse, edit and assign cross-sections to one or more members." onClick={p.onSections}/>
    </RibbonGroup><RibbonGroup label="Dimension"><RibbonTool label="Dimension" icon={Ruler} description="Pick a line for length, two lines for angle, two points for spacing, or a line and point for clearance. (L)" active={p.tool==='dimension'} onClick={()=>p.onTool('dimension')}/></RibbonGroup>
    <RibbonGroup label="Constraints" compact>{constraints.map(([id,label,icon,description])=><RibbonTool key={id} small label={label} icon={icon} description={description} active={p.tool==='constraint'&&p.constraint===id} onClick={()=>p.onConstraint(id)}/>)}</RibbonGroup>
    <RibbonGroup label="Forces">{group(loads)}</RibbonGroup>
    <RibbonGroup label="Inspect"><RibbonTool label="Connections" icon={ScanLine} description="Review intersections and check which members share a structural joint." onClick={p.onAudit}/></RibbonGroup></>}
  </CadRibbon>;
}
