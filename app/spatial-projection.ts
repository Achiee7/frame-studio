import type {Vec3} from './spatial-model';
import {spatialMemberIntersection} from './spatial-model.ts';
import {clampDrawingScale,draftingStep,gridPixels,maxGridIntervals,snapCoordinate} from './drafting-grid.ts';

export type SpatialPlane = 'XY' | 'XZ' | 'YZ';
export type ViewName = 'Isometric' | 'Top' | 'Front' | 'Right';
export type ScreenPoint = {x:number;y:number};
export type CanvasSize = {width:number;height:number};
export type SpatialCamera = {yaw:number;pitch:number;target:Vec3;height:number};
export const directions:Record<ViewName,{yaw:number;pitch:number}> = {
  Isometric:{yaw:Math.PI/4,pitch:Math.atan(1/Math.sqrt(2))},
  Top:{yaw:0,pitch:Math.PI/2},
  Front:{yaw:0,pitch:0},
  Right:{yaw:Math.PI/2,pitch:0},
};
export const initialCamera:SpatialCamera = {...directions.Isometric,target:{x:0,y:0,z:0},height:12};
export const planeAxes = {XY:['x','y','z'],XZ:['x','z','y'],YZ:['y','z','x']} as const;

function basis(camera:SpatialCamera) {
  const c=Math.cos(camera.yaw),s=Math.sin(camera.yaw),u=Math.cos(camera.pitch),v=Math.sin(camera.pitch);
  return {right:{x:c,y:s,z:0},up:{x:-s*v,y:c*v,z:u},towards:{x:s*u,y:-c*u,z:v}};
}
function dot(a:Vec3,b:Vec3) {return a.x*b.x+a.y*b.y+a.z*b.z;}
function shift(p:Vec3,v:Vec3,k:number):Vec3 {return {x:p.x+v.x*k,y:p.y+v.y*k,z:p.z+v.z*k};}
export function project3D(point:Vec3,camera:SpatialCamera,size:CanvasSize) {
  const {right,up,towards}=basis(camera),scale=size.height/camera.height;
  const relative={x:point.x-camera.target.x,y:point.y-camera.target.y,z:point.z-camera.target.z};
  return {x:size.width/2+scale*dot(relative,right),y:size.height/2-scale*dot(relative,up),depth:dot(relative,towards)};
}
export function nearbySpatialCrossing(a:Vec3,b:Vec3,c:Vec3,d:Vec3,pointer:ScreenPoint,camera:SpatialCamera,size:CanvasSize) {
  const point=spatialMemberIntersection(a,b,c,d);
  if(!point)return null;
  const screen=project3D(point,camera,size),distance=Math.hypot(screen.x-pointer.x,screen.y-pointer.y);
  return distance<=8?{point,distance,depth:screen.depth}:null;
}
export function workplanePoint(screen:ScreenPoint,camera:SpatialCamera,size:CanvasSize,plane:SpatialPlane,offset:number,snap=0):Vec3|null {
  const {right,up,towards}=basis(camera),normal=planeAxes[plane][2];
  // A view along the workplane does not determine a unique 3D point.
  if(Math.abs(towards[normal])<0.025)return null;
  const scale=camera.height/size.height;
  const ray=shift(shift(camera.target,right,(screen.x-size.width/2)*scale),up,(size.height/2-screen.y)*scale);
  const point=shift(ray,towards,(offset-ray[normal])/towards[normal]);
  if(snap>0)for(const axis of planeAxes[plane].slice(0,2))point[axis]=snapCoordinate(point[axis],snap);
  point[normal]=offset;
  return point;
}
/** Use the active workplane through the grab. An edge-on plane falls back to the most face-on plane. */
export function geometryDragPlane(camera:SpatialCamera,active:SpatialPlane):SpatialPlane {
  const {towards}=basis(camera);
  const facing=(plane:SpatialPlane)=>Math.abs(towards[planeAxes[plane][2]]);
  if(facing(active)>=0.025)return active;
  return (Object.keys(planeAxes) as SpatialPlane[]).reduce((a,b)=>facing(a)>=facing(b)?a:b);
}

export function geometryDragDelta(from:ScreenPoint,to:ScreenPoint,camera:SpatialCamera,size:CanvasSize,plane:SpatialPlane,step:number):Vec3 {
  // In orthographic projection only the screen displacement matters. Working
  // around zero preserves the grabbed depth and avoids a jump on off-grid joints.
  const relative={x:size.width/2+to.x-from.x,y:size.height/2+to.y-from.y};
  return workplanePoint(relative,{...camera,target:{x:0,y:0,z:0}},size,plane,0,step)!;
}

export function workplaneGrid(camera:SpatialCamera,size:CanvasSize,plane:SpatialPlane,offset:number,unit:number){
  if(size.width<=0||size.height<=0)return null;
  const corners=[{x:0,y:0},{x:size.width,y:0},{x:0,y:size.height},{x:size.width,y:size.height}]
    .map(p=>workplanePoint(p,camera,size,plane,offset));
  if(corners.some(p=>!p))return null;
  const [u,v]=planeAxes[plane];
  function bounds(axis:typeof u|typeof v) {
    const values=corners.map(p=>p![axis]);
    const low=Math.min(...values),high=Math.max(...values);
    // Distance in model coordinates per pixel perpendicular to this grid family.
    const perPixel=Math.hypot((values[1]-values[0])/size.width,(values[2]-values[0])/size.height);
    return {low,high,minimum:Math.max(gridPixels*perPixel,(high-low)/maxGridIntervals)};
  }
  const ub=bounds(u),vb=bounds(v);
  const step=draftingStep(Math.max(ub.minimum,vb.minimum,gridPixels*camera.height/size.height),unit,
    Math.max(Math.abs(ub.low),Math.abs(ub.high),Math.abs(vb.low),Math.abs(vb.high)));
  return {lowU:ub.low,highU:ub.high,lowV:vb.low,highV:vb.high,step};
}
export function panCamera(camera:SpatialCamera,size:CanvasSize,dx:number,dy:number):SpatialCamera {
  const {right,up}=basis(camera),scale=camera.height/size.height;
  return {...camera,target:shift(shift(camera.target,right,-dx*scale),up,dy*scale)};
}
export function zoomCamera(camera:SpatialCamera,size:CanvasSize,point:ScreenPoint,factor:number):SpatialCamera {
  const height=size.height/clampDrawingScale((size.height/camera.height)/factor);
  const ratio=1-height/camera.height;
  return {...panCamera(camera,size,(size.width/2-point.x)*ratio,(size.height/2-point.y)*ratio),height};
}
export function fitCamera(camera:SpatialCamera,nodes:Vec3[],size:CanvasSize):SpatialCamera {
  if(!nodes.length)return {...camera,height:initialCamera.height,target:{...initialCamera.target}};
  const reference={...camera,target:{...nodes[0]},height:size.height};
  const points=nodes.map(n=>project3D(n,reference,size));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),zs=points.map(p=>p.depth);
  const xMin=Math.min(...xs),xMax=Math.max(...xs),yMin=Math.min(...ys),yMax=Math.max(...ys);
  const center=panCamera(reference,size,(size.width-xMin-xMax)/2,(size.height-yMin-yMax)/2);
  const target=shift(center.target,basis(camera).towards,(Math.min(...zs)+Math.max(...zs))/2);
  const padding=Math.min(65,Math.min(size.width,size.height)*.17);
  const extent=Math.max((xMax-xMin)*size.height/(size.width-2*padding),(yMax-yMin)*size.height/(size.height-2*padding));
  return {...camera,target,height:extent>0?size.height/clampDrawingScale(size.height/extent):initialCamera.height};
}
