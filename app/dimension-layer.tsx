import {display,modelNumber} from './units';
import type {Model,CadDimension} from './model';
import {cadPoint,dimensionValue} from './model';
import {intersection} from './cad';
import type {Point} from './cad';
export function dimensionText(m:Model,d:CadDimension){return ['angle','direction'].includes(d.kind)?`${modelNumber(m,dimensionValue(m,d),2)}°`:display(m,dimensionValue(m,d),'length',3);}
export default function DimensionLayer({model:m,screen,onEdit,onDrag,preview,conflictId}:{model:Model;screen:(p:Point)=>Point;onEdit?:(id:string,e:React.MouseEvent)=>void;onDrag?:(id:string,e:React.PointerEvent)=>void;preview?:CadDimension|null;conflictId?:string}){
 const tick=(p:Point,n:Point,t:Point)=><line x1={p.x-n.x*4-t.x*3} y1={p.y-n.y*4-t.y*3} x2={p.x+n.x*4+t.x*3} y2={p.y+n.y*4+t.y*3}/>;
 const line=(a:Point,b:Point)=><line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>;
 return <g className="cad-dimensions">{(preview?[preview]:m.dimensions??[]).map((d,i)=>{
 const a=screen(cadPoint(m,d.a)),b=screen(cadPoint(m,d.b)),offset=d.offset??42,dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;let p:Point,q:Point,label:Point,draw;
 if(d.kind==='angle'||d.kind==='direction'){
  let vertex=a,start=0,end=Math.atan2(dy,dx);
  if(d.kind==='angle'){const c=screen(cadPoint(m,d.c!)),z=screen(cadPoint(m,d.d!));vertex=intersection(a,b,c,z)??a;start=Math.atan2(dy,dx);end=Math.atan2(z.y-c.y,z.x-c.x);}
  const delta=d.kind==='direction'?-dimensionValue(m,d)*Math.PI/180:Math.atan2(Math.sin(end-start),Math.cos(end-start)),radius=Math.max(24,Math.abs(offset)),middle=start+delta/2;
  p={x:vertex.x+radius*Math.cos(start),y:vertex.y+radius*Math.sin(start)};q={x:vertex.x+radius*Math.cos(end),y:vertex.y+radius*Math.sin(end)};label={x:vertex.x+(radius+19)*Math.cos(middle),y:vertex.y+(radius+19)*Math.sin(middle)};
  draw=<>{line(vertex,{x:vertex.x+(radius+9)*Math.cos(start),y:vertex.y+(radius+9)*Math.sin(start)})}{line(vertex,{x:vertex.x+(radius+9)*Math.cos(end),y:vertex.y+(radius+9)*Math.sin(end)})}<path d={`M ${p.x} ${p.y} A ${radius} ${radius} 0 ${Math.abs(delta)>Math.PI?1:0} ${delta>=0?1:0} ${q.x} ${q.y}`} fill="none"/>{tick(p,{x:Math.cos(start),y:Math.sin(start)},{x:-Math.sin(start),y:Math.cos(start)})}{tick(q,{x:Math.cos(end),y:Math.sin(end)},{x:-Math.sin(end),y:Math.cos(end)})}</>;
 }else {
  let normal:Point,tangent:Point;
  if(d.kind==='horizontal'){const y=(offset>=0?Math.max(a.y,b.y):Math.min(a.y,b.y))+offset;p={x:a.x,y};q={x:b.x,y};normal={x:0,y:1};tangent={x:1,y:0};}
  else if(d.kind==='vertical'){const x=(offset>=0?Math.max(a.x,b.x):Math.min(a.x,b.x))+offset;p={x,y:a.y};q={x,y:b.y};normal={x:1,y:0};tangent={x:0,y:1};}
  else{normal={x:-dy/L,y:dx/L};tangent={x:dx/L,y:dy/L};p={x:a.x+normal.x*offset,y:a.y+normal.y*offset};q={x:b.x+normal.x*offset,y:b.y+normal.y*offset};}
  label={x:(p.x+q.x)/2,y:(p.y+q.y)/2};draw=<>{line(a,{x:p.x+normal.x*7*Math.sign(offset),y:p.y+normal.y*7*Math.sign(offset)})}{line(b,{x:q.x+normal.x*7*Math.sign(offset),y:q.y+normal.y*7*Math.sign(offset)})}{line(p,q)}{tick(p,normal,tangent)}{tick(q,normal,tangent)}</>;
 }
 const text=`${dimensionText(m,d)}${d.driving?'':' (driven)'}`,width=text.length*6.3+18;
 return <g key={d.id} data-dimension={d.id} className={'cad-dimension '+(preview?'preview':d.driving?'driving':'reference')+(conflictId===d.id?' conflict':'')} pointerEvents={preview?'none':undefined} onPointerDown={e=>{e.stopPropagation();onDrag?.(d.id,e);}} onClick={e=>e.stopPropagation()} onDoubleClick={e=>{e.stopPropagation();onEdit?.(d.id,e);}}><title>{`D${i+1} · double-click to edit, drag to move`}</title><g className="dimension-geometry">{draw}</g><rect x={label.x-width/2} y={label.y-12} width={width} height="24" rx="5"/><text x={label.x} y={label.y+4} textAnchor="middle">{text}</text></g>;
 })}</g>;
}
