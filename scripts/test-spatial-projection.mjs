import assert from 'node:assert/strict';
import {directions,fitCamera,geometryDragDelta,geometryDragPlane,initialCamera,nearbySpatialCrossing,panCamera,planeAxes,project3D,workplaneGrid,workplanePoint,zoomCamera} from '../app/spatial-projection.ts';
import {clampDrawingScale,draftingStep,fitPlanar,gridPixels,maxGridIntervals,snapCoordinate,visibleSegment,wheelZoomFactor,zoomButtonFactor,zoomPlanar} from '../app/drafting-grid.ts';

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
for(const [view,expected] of [['Top','XY'],['Front','XZ'],['Right','YZ'],['Isometric','XY']]){
  const cam={...camera,...directions[view]},plane=geometryDragPlane(cam,'XY');
  assert.equal(plane,expected);
  const p={x:4,y:7,z:.8},from=project3D(p,cam,size),to={x:from.x+43,y:from.y-29};
  const d=geometryDragDelta(from,to,cam,size,plane,0);
  near(d[planeAxes[plane][2]],0);
  const dest=project3D({x:p.x+d.x,y:p.y+d.y,z:p.z+d.z},cam,size);
  near(dest.x,to.x);near(dest.y,to.y);
  const snapped=geometryDragDelta(from,to,cam,size,plane,.25);
  for(const value of Object.values(snapped))near(value*4,Math.round(value*4));
}
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
// Repeated zoom clicks and a wheel zoom use one scale interval, retain the
// hovered physical point, and reveal an aligned sub-millimetre grid.
const centered={x:size.width/2,y:size.height/2},view={scale:80,x:222,y:211};
const world={x:(centered.x-view.x)/view.scale,y:(centered.y-view.y)/view.scale};
let magnified=view;
for(let i=0;i<50;i++)magnified=zoomPlanar(magnified,centered,zoomButtonFactor);
near((centered.x-magnified.x)/magnified.scale,world.x);near((centered.y-magnified.y)/magnified.scale,world.y);
assert.ok(magnified.scale>1e6);
const fine=draftingStep(gridPixels/magnified.scale,.001);
assert.ok(fine<.0001&&fine*magnified.scale>=gridPixels-1e-8&&fine*magnified.scale<31);
near(snapCoordinate(.00008765,fine),Math.round(.00008765/fine)*fine);
near(snapCoordinate(.00008765,0),.00008765);
near(wheelZoomFactor(2,1,size.height),wheelZoomFactor(32,0,size.height));
near(wheelZoomFactor(1,2,size.height),wheelZoomFactor(size.height,0,size.height));
const capped=zoomPlanar(view,centered,1e40);
assert.equal(capped.scale,clampDrawingScale(Infinity));
for(const length of [.0002,1e8]){
  const points=[{x:5,y:7},{x:5+length,y:7+length/10}];
  const framed=fitPlanar(points,size.width,size.height,false,true);
  const ends=points.map(p=>({x:framed.x+p.x*framed.scale,y:framed.y-p.y*framed.scale}));
  assert.ok(ends[1].x-ends[0].x>size.width/2);
  assert.ok(ends.every(p=>p.x>0&&p.y>0&&p.x<size.width&&p.y<size.height));
}
const extreme=zoomCamera(top,size,centered,1e-40);
near(size.height/extreme.height,capped.scale);
for(const plane of ['XY','XZ','YZ']){
  for(const height of [.00002,12,1e6]){
    const iso={...camera,height},g=workplaneGrid(iso,size,plane,0,.001);
    assert.ok(g);
    assert.ok((g.highU-g.lowU)/g.step<=maxGridIntervals+1);
    assert.ok((g.highV-g.lowV)/g.step<=maxGridIntervals+1);
  }
}
const fineView={...top,height:size.height/magnified.scale,target:{x:0,y:0,z:0}};
const fineGrid=workplaneGrid(fineView,size,'XY',0,.001);
near(fineGrid.step,fine);
const fixedGrid=workplaneGrid(fineView,size,'XY',0,.25);
assert.ok(fixedGrid.step<.001);
const point={x:.00008765,y:0,z:0},sample=project3D(point,fineView,size);
near(workplanePoint(sample,fineView,size,'XY',0,.25).x,0);
near(workplanePoint(sample,fineView,size,'XY',0,fine).x,snapCoordinate(point.x,fine));
assert.equal(workplaneGrid({...camera,...directions.Front},size,'XY',0,1),null);
for(const extent of [1e6,1e8,1e10,1e12]){
  const segment=visibleSegment({x:200-extent,y:150+extent},{x:200+extent,y:150-extent},400,300);
  assert.ok(segment&&Object.values(segment).every(v=>Math.abs(v)<500));
  assert.ok(Math.abs(segment.x1+segment.y1-350)<.001 && Math.abs(segment.x2+segment.y2-350)<.001);
}
assert.equal(visibleSegment({x:0,y:1e8},{x:1e8,y:1e8},400,300),null);
assert.deepEqual(visibleSegment({x:3,y:4},{x:97,y:14},400,300),{x1:3,y1:4,x2:97,y2:14});
console.log('3D projection, workplanes, cursor zoom, pan, fit, adaptive fine grids and fixed snapping passed.');
