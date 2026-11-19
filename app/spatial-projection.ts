import type {Vec3} from './spatial-model';
import {spatialMemberIntersection} from './spatial-model.ts';

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
  if(snap>0)for(const axis of planeAxes[plane].slice(0,2))point[axis]=Math.round(point[axis]/snap)*snap;
  point[normal]=offset;
  return point;
}
export function panCamera(camera:SpatialCamera,size:CanvasSize,dx:number,dy:number):SpatialCamera {
  const {right,up}=basis(camera),scale=camera.height/size.height;
  return {...camera,target:shift(shift(camera.target,right,-dx*scale),up,dy*scale)};
}
export function zoomCamera(camera:SpatialCamera,size:CanvasSize,point:ScreenPoint,factor:number):SpatialCamera {
  const height=Math.max(1e-7,Math.min(1e14,camera.height*factor));
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
  return {...camera,target,height:extent>1e-8?extent:initialCamera.height};
}
