import {memo,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent,ReactNode} from 'react';
import {Box,Maximize,ZoomIn,ZoomOut} from 'lucide-react';
import type {spatialSketchMobility} from './spatial-mobility';
import type {SpatialMember,SpatialNode,Vec3} from './spatial-model';
import {SupportGlyph} from './support-symbol';
import {useUnits} from './unit-context';
import {lengthUnits,settingNumber} from './units';
import {directions,fitCamera,geometryDragDelta,geometryDragPlane,initialCamera,nearbySpatialCrossing,panCamera,planeAxes,project3D,workplaneGrid,workplanePoint,zoomCamera} from './spatial-projection';
import {maxGridIntervals,visibleSegment,wheelZoomFactor,zoomButtonFactor} from './drafting-grid';
import type {CanvasSize,ScreenPoint,SpatialCamera,SpatialPlane,ViewName} from './spatial-projection';
import './spatial-canvas.css';

export type {SpatialPlane} from './spatial-projection';
export type SpatialTool = 'select'|'beam'|'strut'|'joint'|'orbit'|'pan'|'dimension'|'constraint';
export type SpatialSelection = {type:'node'|'member';id:string}|null;
export type SpatialDrag = (selection:NonNullable<SpatialSelection>,delta:Vec3,phase:'preview'|'commit'|'cancel')=>void;
export type SpatialCanvasProps = {
  onGeometryDrag?:SpatialDrag;
  mobility?:ReturnType<typeof spatialSketchMobility>;
  rejected?:NonNullable<SpatialSelection>[];
  nodes:SpatialNode[];members:SpatialMember[];tool:SpatialTool;plane:SpatialPlane;offset:number;snap:number|'auto';
  start?:Vec3|null;selection?:SpatialSelection;showGrid?:boolean;showNames?:boolean;
  onPoint:(point:Vec3,nodeId?:string)=>void;
  onSelect:(selection:SpatialSelection,point?:Vec3)=>void;
  highlights?:NonNullable<SpatialSelection>[];
  onSketchPick?:(selection:SpatialSelection,at:ScreenPoint,shortcut:boolean)=>void;
  renderOverlay?:(project:(p:Vec3)=>ScreenPoint,viewport:CanvasSize)=>ReactNode;
  onMemberPoint?:(memberId:string,point:Vec3)=>void;
};

type Hit = {type:'node'|'member'|'intersection'|'plane';id:string;point:Vec3;distance:number;depth:number};
type Gesture = {id:number;origin:ScreenPoint;last:ScreenPoint;mode:'pan'|'orbit'|'pick';moved:boolean;shortcut:boolean;
  geometry?:{pick:NonNullable<SpatialSelection>;update:SpatialDrag;plane:SpatialPlane;step:number;camera:SpatialCamera;size:CanvasSize};
};
const stateColors={free:'#326dcc',fixed:'#20262c',conflict:'#cc3f4c'};
const stateLabels={free:'Underconstrained',fixed:'Fully constrained',conflict:'Constraint conflict'};
const axisColor={x:'#b56d53',y:'#58865a',z:'#5987b0'};
const axes=['x','y','z'] as const;
const centerOf=(s:CanvasSize)=>({x:s.width/2,y:s.height/2});
const lengthOf=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

const PlaneGrid=memo(function PlaneGrid({camera,size,plane,offset,grid}:{camera:SpatialCamera;size:CanvasSize;plane:SpatialPlane;offset:number;grid:NonNullable<ReturnType<typeof workplaneGrid>>}) {
  const [u,v,n]=planeAxes[plane];
  const {lowU,highU,lowV,highV,step}=grid;
  const lines=[];
  for(const axis of [u,v]){
    const other=axis===u?v:u,low=axis===u?lowU:lowV,high=axis===u?highU:highV;
    const first=Math.ceil(low/step),count=Math.min(maxGridIntervals+1,Math.max(0,Math.floor(high/step)-first+1));
    for(let i=0;i<count;i++){
      const j=first+i;
      const p={x:0,y:0,z:0};p[n]=offset;p[axis]=j*step;p[other]=other===u?lowU:lowV;
      const q={...p,[other]:other===u?highU:highV};
      const a=project3D(p,camera,size),b=project3D(q,camera,size);
      lines.push(<line key={axis+i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={j===0?axisColor[other]:j%5===0?'#c8d8ce':'#dee8e1'} opacity={j===0?.67:j%5===0?.85:.8}/>);
    }
  }
  return <g aria-hidden="true" data-grid-step={step} pointerEvents="none">{lines}</g>;
});

function ViewAxes({camera}:{camera:SpatialCamera}){
  const size={width:86,height:80},view={...camera,target:{x:0,y:0,z:0},height:3},o=centerOf(size);
  return <svg className="sp-canvas-axes" viewBox="0 0 86 80" role="img" aria-label="3D orientation axes">
    {axes.map(axis=>{
      const p={x:0,y:0,z:0};p[axis]=1;
      const q=project3D(p,view,size);
      // In an aligned view the third axis points towards the viewer.
      if(Math.hypot(q.x-o.x,q.y-o.y)<2)return null;
      return <g key={axis} stroke={axisColor[axis]}><line x1={o.x} y1={o.y} x2={q.x} y2={q.y} strokeWidth="1.7"/>
        <text x={q.x+(q.x-o.x)*.34} y={q.y+(q.y-o.y)*.34+3} textAnchor="middle" fill={axisColor[axis]} stroke="none">{axis.toUpperCase()}</text></g>;
    })}<circle cx={o.x} cy={o.y} r="2.5" fill="#607565"/>
  </svg>;
}

export function SpatialCanvas({nodes,members,tool,plane,offset,snap,start,selection,showGrid=true,showNames=true,onPoint,onSelect,onSketchPick,highlights=[],renderOverlay,onMemberPoint,onGeometryDrag,mobility,rejected=[]}:SpatialCanvasProps) {
  const svgRef=useRef<SVGSVGElement>(null),gesture=useRef<Gesture|null>(null),didFit=useRef(false);
  const [size,setSize]=useState<CanvasSize>({width:800,height:600});
  const [camera,setCamera]=useState<SpatialCamera>(initialCamera);
  const [pointer,setPointer]=useState<ScreenPoint|null>(null);
  const [picker,setPicker]=useState<{screen:ScreenPoint;hits:Hit[];shortcut:boolean}|null>(null);
  const [dragging,setDragging]=useState(false);
  const units=useUnits(),unit=units.length;
  const grid=useMemo(()=>workplaneGrid(camera,size,plane,offset,lengthUnits[unit]),[camera,size,plane,offset,unit]);
  const snapStep=snap==='auto'?(grid?.step??0):snap;
  const number=(v:number)=>settingNumber(v/lengthUnits[unit],units,false);
  const coordinates=(p:Vec3)=>axes.map(axis=>axis.toUpperCase()+' '+number(p[axis])).join('  ·  ')+' '+unit;
  const sketchTool=tool==='constraint'||tool==='dimension';
  const [modified,setModified]=useState(false);
  const drawing=tool==='beam'||tool==='strut'||tool==='joint';

  useLayoutEffect(()=>{
    const element=svgRef.current;
    if(!element)return;
    const measure=()=>{
      const rect=element.getBoundingClientRect();
      if(rect.width>0&&rect.height>0)setSize(old=>old.width===rect.width&&old.height===rect.height?old:{width:rect.width,height:rect.height});
    };
    measure();
    const observer=new ResizeObserver(measure);observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{
    if(didFit.current)return;
    const rect=svgRef.current?.getBoundingClientRect();
    if(!rect?.width||!rect.height)return;
    didFit.current=true;
    if(nodes.length)setCamera(c=>fitCamera(c,nodes,{width:rect.width,height:rect.height}));
  },[nodes,size]);
  useEffect(()=>{
    const el=svgRef.current;if(!el)return;
    function wheel(e:WheelEvent){
      e.preventDefault();
      if(gesture.current?.geometry)return;
      const r=el!.getBoundingClientRect();
      setPicker(null);
      setCamera(c=>zoomCamera(c,{width:r.width,height:r.height},{x:e.clientX-r.left,y:e.clientY-r.top},1/wheelZoomFactor(e.deltaY,e.deltaMode,r.height)));
    }
    el.addEventListener('wheel',wheel,{passive:false});
    return ()=>el.removeEventListener('wheel',wheel);
  },[]);
  useEffect(()=>{setPicker(null);},[tool,plane,offset,nodes,members]);
  const projected=nodes.map(node=>({node,screen:project3D(node,camera,size)})).sort((a,b)=>a.screen.depth-b.screen.depth);
  const byId=new Map(projected.map(item=>[item.node.id,item]));
  const segments=members.flatMap(member=>{
    const a=byId.get(member.a),b=byId.get(member.b);
    return a&&b?[{member,a,b,depth:(a.screen.depth+b.screen.depth)/2}]:[];
  }).sort((a,b)=>a.depth-b.depth);
  const cameraView=(Object.keys(directions) as ViewName[]).find(name=>Math.cos(camera.yaw-directions[name].yaw)>.999999&&Math.abs(camera.pitch-directions[name].pitch)<.001);
  const planeEdgeOn=!grid;

  function hitsAt(p:ScreenPoint,shortcut=false):Hit[]{
    const hits:Hit[]=[];
    for(const {node,screen} of projected){
      const distance=Math.hypot(screen.x-p.x,screen.y-p.y);
      if(distance<=10)hits.push({type:'node',id:node.id,point:node,distance,depth:screen.depth});
    }
    if(!hits.length&&(tool==='select'||drawing||sketchTool||shortcut)){
      const nearby:typeof segments=[];
      for(const segment of segments){
        const {member,a,b}=segment;
        const dx=b.screen.x-a.screen.x,dy=b.screen.y-a.screen.y,l2=dx*dx+dy*dy;
        if(l2<.0001)continue;
        const t=Math.max(0,Math.min(1,((p.x-a.screen.x)*dx+(p.y-a.screen.y)*dy)/l2));
        const distance=Math.hypot(a.screen.x+t*dx-p.x,a.screen.y+t*dy-p.y);
        if(distance>7)continue;
        const point={x:a.node.x+(b.node.x-a.node.x)*t,y:a.node.y+(b.node.y-a.node.y)*t,z:a.node.z+(b.node.z-a.node.z)*t};
        hits.push({type:'member',id:member.id,point,distance,depth:a.screen.depth+t*(b.screen.depth-a.screen.depth)});
        nearby.push(segment);
      }
      if(drawing&&!shortcut&&nearby.length>1){
        const joined=new Set<string>(),crossings:Hit[]=[];
        for(let i=0;i<nearby.length;i++)for(let j=i+1;j<nearby.length;j++){
          const a=nearby[i],b=nearby[j];
          const snap=nearbySpatialCrossing(a.a.node,a.b.node,b.a.node,b.b.node,p,camera,size);
          if(!snap)continue;
          joined.add(a.member.id);joined.add(b.member.id);
          if(!crossings.some(hit=>lengthOf(hit.point,snap.point)<1e-6)){
            crossings.push({type:'intersection',id:a.member.id+' × '+b.member.id,...snap});
          }
        }
        // At a physical crossing the snap is the exact common point. Projected
        // crossings at different depths retain their separate member choices.
        for(let i=hits.length-1;i>=0;i--)if(joined.has(hits[i].id))hits.splice(i,1);
        hits.push(...crossings);
      }
    }
    hits.sort((a,b)=>a.distance-b.distance||b.depth-a.depth);
    const near=hits.filter(hit=>hit.distance<=hits[0].distance+2);
    const planePoint=workplanePoint(p,camera,size,plane,offset,snapStep);
    // Looking straight down on two storeys can put a new upper joint and an
    // existing lower joint on the same pixel. Offer both physical locations.
    const normal=planeAxes[plane][2];
    if(drawing&&!shortcut&&planePoint&&near.every(hit=>Math.abs(hit.point[normal]-offset)>1e-6)){
      near.push({type:'plane',id:plane+' plane',point:planePoint,distance:0,depth:0});
    }
    return near;
  }
  const hover=pointer&&!dragging&&!picker&&(drawing||sketchTool||modified||tool==='select')?hitsAt(pointer,modified):[];
  const target=hover.length===1?hover[0]:null;
  const targetScreen=target&&project3D(target.point,camera,size);
  const startScreen=start&&project3D(start,camera,size);
  const preview=startScreen&&targetScreen&&visibleSegment(startScreen,targetScreen,size.width,size.height);
  function choose(hit:Hit|undefined,screen:ScreenPoint,shortcut:boolean){
    setPicker(null);
    if(onSketchPick && (shortcut||sketchTool)) {
      const ref=hit&&(hit.type==='member'||hit.type==='node')?{type:hit.type,id:hit.id}:null;
      const rect=svgRef.current!.getBoundingClientRect();
      onSketchPick(ref,{x:rect.left+screen.x,y:rect.top+screen.y},shortcut);
      return;
    }
    if(tool==='select')onSelect(hit&&(hit.type==='node'||hit.type==='member')?{type:hit.type,id:hit.id}:null,hit?.point);
    if(drawing&&hit){
      if(tool==='joint'&&hit.type==='member'&&onMemberPoint)onMemberPoint(hit.id,hit.point);
      else onPoint(hit.point,hit.type==='node'?hit.id:undefined);
    }
  }
  function local(e:ReactPointerEvent<SVGSVGElement>){
    const r=e.currentTarget.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};
  }
  function begin(e:ReactPointerEvent<SVGSVGElement>){
    if(gesture.current||e.button>2)return;
    const p=local(e);
    setPicker(null);e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);
    const shortcut=!!onSketchPick&&e.button===0&&(e.ctrlKey||e.metaKey);
    const mode=shortcut?'pick':e.button===1||e.shiftKey||tool==='pan'?'pan':e.button===2||e.altKey||tool==='orbit'?'orbit':'pick';
    const g:Gesture={id:e.pointerId,origin:p,last:p,mode,moved:false,shortcut};
    if(mode==='pick'&&tool==='select'&&!shortcut&&onGeometryDrag){
      const hits=hitsAt(p);
      const hit=hits.length===1?hits[0]:hits.find(h=>selection?.type===h.type&&selection.id===h.id);
      if(hit&&(hit.type==='node'||hit.type==='member')){
        const dragPlane=geometryDragPlane(camera,plane);
        const step=snap==='auto'&&dragPlane!==plane?workplaneGrid(camera,size,dragPlane,hit.point[planeAxes[dragPlane][2]],lengthUnits[unit])?.step??0:snapStep;
        g.geometry={pick:{type:hit.type,id:hit.id},update:onGeometryDrag,plane:dragPlane,step,camera,size};
      }
    }
    gesture.current=g;
    setPointer(p);
  }
  function move(e:ReactPointerEvent<SVGSVGElement>){
    const g=gesture.current,p=local(e);setPointer(p);setModified(!!onSketchPick&&(e.ctrlKey||e.metaKey));
    if(!g||g.id!==e.pointerId)return;
    if(!g.moved&&Math.hypot(p.x-g.origin.x,p.y-g.origin.y)<4)return;
    g.moved=true;const dx=p.x-g.last.x,dy=p.y-g.last.y;g.last=p;setDragging(true);
    if(g.geometry)updateGeometry(g,p,'preview');
    else if(g.mode==='pan')setCamera(c=>panCamera(c,size,dx,dy));
    else if(g.mode==='orbit'||(g.mode==='pick'&&tool==='select'&&!g.shortcut))setCamera(c=>({...c,
      yaw:c.yaw-dx*.008,pitch:Math.max(-Math.PI/2,Math.min(Math.PI/2,c.pitch+dy*.008))}));
  }
  function updateGeometry(g:Gesture,p:ScreenPoint,phase:'preview'|'commit'|'cancel'){
    const drag=g.geometry!;
    drag.update(drag.pick,geometryDragDelta(g.origin,p,drag.camera,drag.size,drag.plane,drag.step),phase);
  }
  function cancel(){
    const g=gesture.current;
    gesture.current=null;
    if(g?.geometry&&g.moved)updateGeometry(g,g.last,'cancel');
    if(g&&svgRef.current?.hasPointerCapture(g.id))svgRef.current.releasePointerCapture(g.id);
    setDragging(false);setPointer(null);
  }
  function end(e:ReactPointerEvent<SVGSVGElement>){
    const g=gesture.current;if(!g||g.id!==e.pointerId)return;
    gesture.current=null;setDragging(false);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    if(g.moved&&g.geometry)updateGeometry(g,local(e),'commit');
    if(g.moved||g.mode!=='pick')return;
    const p=local(e),hits=hitsAt(p,g.shortcut);
    if(hits.length>1){setPicker({screen:p,hits,shortcut:g.shortcut});return;}
    choose(hits[0],p,g.shortcut);
  }
  function align(view:ViewName){setPicker(null);setCamera(c=>fitCamera({...c,...directions[view]},nodes,size));}
  function fit(){setPicker(null);setCamera(c=>fitCamera(c,nodes,size));}
  function zoom(factor:number){setPicker(null);setCamera(c=>zoomCamera(c,size,centerOf(size),factor));}

  return <div className="sp-canvas">
    <svg ref={svgRef} data-sketch-surface="3D" style={{cursor:!dragging&&onGeometryDrag&&tool==='select'&&target&&!modified?'grab':undefined}} className={'sp-canvas-drawing sp-canvas-tool-'+tool+(dragging?' is-dragging':'')} tabIndex={0}
      role="application" aria-label="Interactive 3D frame drawing" viewBox={`0 0 ${size.width} ${size.height}`}
      onPointerDown={begin} onPointerMove={move} onPointerUp={end}
      onPointerCancel={cancel} onLostPointerCapture={()=>{if(gesture.current)cancel();}}
      onPointerLeave={()=>{if(!gesture.current)setPointer(null);}} onContextMenu={e=>e.preventDefault()}
      onKeyDown={e=>{if(e.key==='Escape'){setPicker(null);if(gesture.current){e.preventDefault();cancel();}}if(e.key.toLowerCase()==='f'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();fit();}}}>
      {showGrid&&grid&&<PlaneGrid camera={camera} size={size} plane={plane} offset={offset} grid={grid}/>}
      {segments.map(({member,a,b})=>{
        const line=visibleSegment(a.screen,b.screen,size.width,size.height);
        if(!line)return null;
        const active=selection?.type==='member'&&selection.id===member.id||highlights.some(p=>p.type==='member'&&p.id===member.id);
        const highlighted=hover.some(h=>h.type==='member'&&h.id===member.id);
        const state=rejected.some(p=>p.type==='member'&&p.id===member.id)?'conflict':mobility?.members.get(member.id);
        const color=state?stateColors[state]:active?'#b76520':highlighted?'#16745d':member.kind==='strut'?'#526c5e':'#284c41';
        return <g key={member.id} data-member={member.id} aria-label={member.id+' '+member.kind+(state?' · '+stateLabels[state]:'')}>
          {state&&<title>{member.id} · {stateLabels[state]}</title>}
          {(active||highlighted)&&<line {...line} stroke={active?'#b76520':'#16745d'} opacity=".32" strokeWidth="8" strokeLinecap="round"/>}
          <line {...line} stroke={color} strokeWidth={2.7} strokeLinecap="round" strokeDasharray={member.kind==='strut'?'8 4':undefined}/>
          {showNames&&<text className="sp-member-label" x={(a.screen.x+b.screen.x)/2} y={(a.screen.y+b.screen.y)/2-7} textAnchor="middle">{member.id}</text>}
        </g>;
      })}
      {startScreen&&drawing&&<g stroke="#bd732a" fill="none">
        {preview&&<line {...preview} strokeWidth="2" strokeDasharray="6 4"/>}
        <circle cx={startScreen.x} cy={startScreen.y} r="6" strokeWidth="2"/>
      </g>}
      {projected.map(({node,screen})=>{
        const active=selection?.type==='node'&&selection.id===node.id||highlights.some(p=>p.type==='node'&&p.id===node.id);
        const hot=hover.some(h=>h.type==='node'&&h.id===node.id);
        const state=rejected.some(p=>p.type==='node'&&p.id===node.id)?'conflict':mobility?.nodes.get(node.id);
        const ink=state?stateColors[state]:'#295948';
        return <g key={node.id} transform={`translate(${screen.x} ${screen.y})`} data-node={node.id} aria-label={node.id+' '+node.joint+' joint'+(state?' · '+stateLabels[state]:'')}>
          {state&&<title>{node.id} · {stateLabels[state]}{node.positionLocked?' · Position locked':''}</title>}
          {mobility&&node.positionLocked&&<g transform="translate(6 5)" stroke="#20262c" fill="#f7faf7" pointerEvents="none">
            <path d="M2 4V2a2 2 0 0 1 4 0v2" fill="none"/><rect x="1" y="4" width="6" height="5" rx="1"/>
          </g>}
          {node.support!=='free'&&<g transform="scale(.72)" color="#647b6e"><SupportGlyph type={node.support}/></g>}
          {(active||hot)&&<circle r="9" fill={active?'#f3d5b3':'#bce3cf'} stroke={active?'#b76520':'#3b8469'} strokeWidth="1"/>}
          <circle r={node.joint==='rigid'?3.5:5} fill={node.joint==='rigid'?ink:'#fff'} stroke={ink} strokeWidth="1.7"/>
          {node.joint==='pin'&&<circle r="1.6" fill={ink}/>}
          {showNames&&<text className="sp-node-label" x="8" y="-7">{node.id}</text>}
        </g>;
      })}
      {onSketchPick&&(sketchTool||modified||tool==='select')&&(()=>{
        const p=project3D({x:0,y:0,z:0},camera,size);
        return <g data-origin="true" aria-label="3D sketch origin" transform={`translate(${p.x} ${p.y})`}
          onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSketchPick({type:'node',id:'@origin'},{x:e.clientX,y:e.clientY},e.ctrlKey||e.metaKey);}}>
          <path d="M-6 0h12 M0 -6v12" fill="none" stroke="#977bb0" pointerEvents="none"/>
          <rect x="-47" y="6" width="41" height="17" rx="4" fill="#faf7ff" stroke={highlights.some(p=>p.id==='@origin')?'#7952aa':'#d8cde4'} cursor="pointer"/>
          <text x="-26" y="18" textAnchor="middle" style={{fill:'#785d90'}}>Origin</text>
        </g>;
      })()}
      {renderOverlay?.(p=>project3D(p,camera,size),size)}
      {targetScreen&&drawing&&target?.type!=='node'&&<g transform={`translate(${targetScreen.x} ${targetScreen.y})`} stroke="#b9722e" fill="#fff">
        <circle r="3.5"/><path d="M-10 0h5m10 0h5M0 -10v5m0 10v5" fill="none"/>
      </g>}
    </svg>
    <div className="sp-canvas-view" aria-label="3D view controls">
      <Box size={15} aria-hidden="true"/>
      <select aria-label="3D view orientation" value={cameraView??''} onChange={e=>align(e.target.value as ViewName)}>
        {!cameraView&&<option value="" disabled>Orbit view</option>}
        {(Object.keys(directions) as ViewName[]).map(name=><option key={name}>{name}</option>)}
      </select>
      <button type="button" title="Zoom out" aria-label="Zoom out in 3D" onClick={()=>zoom(zoomButtonFactor)}><ZoomOut size={16}/></button>
      <button type="button" title="Zoom in" aria-label="Zoom in in 3D" onClick={()=>zoom(1/zoomButtonFactor)}><ZoomIn size={16}/></button>
      <button type="button" title="Fit model (F)" aria-label="Fit 3D model" onClick={fit}><Maximize size={15}/></button>
    </div>
    <ViewAxes camera={camera}/>
    {mobility&&nodes.length>0&&<div className="sp-sketch-legend" aria-label="Sketch constraint colours">
      {(['free','fixed','conflict'] as const).map(state=><span key={state}><i style={{background:stateColors[state]}}/>{stateLabels[state]}</span>)}
    </div>}
    {drawing&&planeEdgeOn&&<button className="sp-canvas-plane-tip" onClick={()=>align(({XY:'Top',XZ:'Front',YZ:'Right'} as const)[plane])}>
      View {plane} face-on to place points
    </button>}
    {hover.length>1&&!picker&&<div className="sp-canvas-readout">Multiple locations under the pointer · click to choose</div>}
    {target&&drawing&&<div className="sp-canvas-readout">
      {target.type!=='plane'&&<strong>{target.id} · </strong>}{coordinates(target.point)}
      {start&&<span>Length {number(lengthOf(start,target.point))} {unit}</span>}
    </div>}
    {picker&&<div className="sp-canvas-picker" data-sketch-surface="picker" role="group" aria-label="Choose overlapping geometry"
      style={{left:Math.max(5,Math.min(picker.screen.x+10,size.width-245)),top:Math.max(5,Math.min(picker.screen.y+10,size.height-175))}}>
      <strong>Choose at this position</strong>
      {picker.hits.map(hit=><button key={hit.type+hit.id} onClick={()=>choose(hit,picker.screen,picker.shortcut)}><b>{hit.id}</b><span>{coordinates(hit.point)}</span></button>)}
      <button onClick={()=>setPicker(null)}>Cancel</button>
    </div>}
  </div>;
}
