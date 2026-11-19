import assert from 'node:assert/strict';
import {directions,fitCamera,initialCamera,nearbySpatialCrossing,panCamera,planeAxes,project3D,workplanePoint,zoomCamera} from '../app/spatial-projection.ts';

const size={width:821,height:476};
const camera={...initialCamera,target:{x:1,y:-2,z:.3}};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);
for(const plane of ['XY','XZ','YZ']){
  const point={x:1.4,y:-1.8,z:.2},[u,v,n]=planeAxes[plane],screen=project3D(point,camera,size);
  const back=workplanePoint(screen,camera,size,plane,point[n]);
  for(const axis of ['x','y','z'])near(back[axis],point[axis]);
  const snapped=workplanePoint(screen,camera,size,plane,point[n],.25);
  near(snapped[n],point[n]);near(snapped[u],Math.round(point[u]*4)/4);near(snapped[v],Math.round(point[v]*4)/4);
  const zoomed=project3D(point,zoomCamera(camera,size,screen,.55),size);
  near(screen.x,zoomed.x);near(screen.y,zoomed.y);
  const panned=project3D(point,panCamera(camera,size,20,50),size);
  near(screen.x+20,panned.x);near(screen.y+50,panned.y);
}
assert.equal(workplanePoint({x:30,y:40},{...camera,...directions.Front},size,'XY',0),null);
const top={...camera,...directions.Top},origin={x:0,y:0,z:2};
const screen=project3D(origin,top,size),cursor={x:screen.x+3,y:screen.y-2};
const a={x:-1,y:0,z:2},b={x:1,y:0,z:2},c={x:0,y:-1,z:2},d={x:0,y:1,z:2};
assert.deepEqual(nearbySpatialCrossing(a,b,c,d,cursor,top,size).point,origin);
assert.equal(nearbySpatialCrossing(a,b,{...c,z:3},{...d,z:3},cursor,top,size),null);
assert.equal(nearbySpatialCrossing(a,b,c,d,{...cursor,x:screen.x+18},top,size),null);
const corners=[{x:3800,y:1,z:-700},{x:-19,y:100,z:17},{x:900,y:-300,z:400}];
for(const view of Object.values(directions)){
  const fit=fitCamera({...camera,...view},corners,size);
  const points=corners.map(p=>project3D(p,fit,size));
  for(const p of points)assert.ok(p.x>=60 && p.x<=size.width-60 && p.y>=60 && p.y<=size.height-60);
  for(const [axis,extent] of [['x',size.width],['y',size.height]]){
    const values=points.map(p=>p[axis]);near((Math.min(...values)+Math.max(...values))/2,extent/2);
  }
}
console.log('3D projection, workplanes, cursor zoom, pan and fit passed.');
