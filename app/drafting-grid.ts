/** Camera scale is in screen pixels per metre. Both drawings use the same wheel and button steps. */
export const zoomButtonFactor = 1.25;
export const clampDrawingScale = (scale:number) => Math.max(1e-12, Math.min(1e10,scale));
export function wheelZoomFactor(delta:number,mode:number,height:number) {
  const pixels=delta*(mode===1?16:mode===2?height:1);
  return Math.exp(Math.max(-2,Math.min(2,-pixels*.0015)));
}

type PlanarView={scale:number;x:number;y:number};
type Point={x:number;y:number};
export function zoomPlanar(view:PlanarView,anchor:Point,factor:number):PlanarView {
  const scale=clampDrawingScale(view.scale*factor),ratio=scale/view.scale;
  return {scale,x:anchor.x+(view.x-anchor.x)*ratio,y:anchor.y+(view.y-anchor.y)*ratio};
}

export function fitPlanar(nodes:Point[],width:number,height:number,includeOrigin:boolean,hasDimensions:boolean):PlanarView {
  if(!nodes.length)return {scale:68,x:80,y:height-100};
  const points=includeOrigin?[...nodes,{x:0,y:0}]:nodes;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const minX=Math.min(...xs),minY=Math.min(...ys);
  const rangeX=Math.max(...xs)-minX,rangeY=Math.max(...ys)-minY;
  const margin=Math.min(hasDimensions?220:170,width*.35);
  const top=Math.min(160,height*.22),bottom=Math.min(100,height*.15),vertical=height-top-bottom;
  const fitX=rangeX>0?(width-margin)/rangeX:Infinity,fitY=rangeY>0?vertical/rangeY:Infinity;
  const scale=rangeX||rangeY?clampDrawingScale(Math.min(fitX,fitY)):68;
  return {scale,x:(width-rangeX*scale)/2-minX*scale,y:top+(vertical+rangeY*scale)/2+minY*scale};
}

// A readable 1–2–5 interval in the selected unit. The view can refine through
// fractional millimetres without increasing the number of rendered grid lines.
export const gridPixels=12;
export const maxGridIntervals=160;
export function draftingStep(minimum:number,unit:number,largestCoordinate=0):number {
  const safeMinimum=Math.max(minimum,Math.abs(largestCoordinate)*Number.EPSILON*8);
  const order=10**Math.floor(Math.log10(safeMinimum/unit));
  const fraction=safeMinimum/(unit*order);
  const multiple=fraction<=1.000000000001?1:fraction<=2.000000000002?2:fraction<=5.000000000005?5:10;
  return unit*order*multiple;
}
export function snapCoordinate(value:number,spacing:number):number {
  return spacing>0?Math.round(value/spacing)*spacing:value;
}

/** Clip on the CPU before the SVG renderer converts large endpoints to floats.
 * Keep a margin for rounded beam ends, selection halos and hit testing. */
export function visibleSegment(a:Point,b:Point,width:number,height:number) {
  const pad=32,dx=b.x-a.x,dy=b.y-a.y;
  let start=0,end=1;
  function intersect(position:number,delta:number,extent:number){
    if(delta===0)return position>=-pad&&position<=extent+pad;
    const p=(-pad-position)/delta,q=(extent+pad-position)/delta;
    start=Math.max(start,Math.min(p,q));end=Math.min(end,Math.max(p,q));
    return start<=end;
  }
  if(!intersect(a.x,dx,width)||!intersect(a.y,dy,height))return null;
  // Interpolate from the nearer endpoint to preserve a visible joint exactly.
  const x=(t:number)=>t<=.5?a.x+dx*t:b.x-dx*(1-t);
  const y=(t:number)=>t<=.5?a.y+dy*t:b.y-dy*(1-t);
  return {x1:x(start),y1:y(start),x2:x(end),y2:y(end)};
}
