import {cadPoint,dimensionValue,dimensionSense,uid,enforceConstraints,sketchMobility} from './model';
import type {Model,CadDimension,SketchConstraint} from './model';
export type Point={x:number;y:number};
export type DimensionPick={points:string[];members:string[]};
export const emptyPick=():DimensionPick=>({points:[],members:[]});
export function intersection(a:Point,b:Point,c:Point,d:Point){const x=b.x-a.x,y=b.y-a.y,u=d.x-c.x,v=d.y-c.y,den=x*v-y*u;if(Math.abs(den)<1e-9)return null;const t=((c.x-a.x)*v-(c.y-a.y)*u)/den;return {x:a.x+t*x,y:a.y+t*y};}
export function placementOffset(d:CadDimension,m:Model,screen:(p:Point)=>Point,mouse:Point){
 const a=screen(cadPoint(m,d.a)),b=screen(cadPoint(m,d.b));
 if(d.kind==='angle'||d.kind==='direction'){const c=d.kind==='angle'?screen(cadPoint(m,d.c!)):a,z=d.kind==='angle'?screen(cadPoint(m,d.d!)):b,vertex=intersection(a,b,c,z)??a;return Math.min(250,Math.max(24,Math.hypot(mouse.x-vertex.x,mouse.y-vertex.y)));}
 if(d.kind==='horizontal')return Math.max(-250,Math.min(250,mouse.y-(mouse.y<(a.y+b.y)/2?Math.min(a.y,b.y):Math.max(a.y,b.y))));
 if(d.kind==='vertical')return Math.max(-250,Math.min(250,mouse.x-(mouse.x<(a.x+b.x)/2?Math.min(a.x,b.x):Math.max(a.x,b.x))));
 const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;return Math.max(-250,Math.min(250,((mouse.x-a.x)*-dy+(mouse.y-a.y)*dx)/L));
}
export function dimensionCandidate(m:Model,pick:DimensionPick,screen:(p:Point)=>Point,mouse:Point,shift=false):CadDimension|null{
 let d:CadDimension={id:'preview',kind:'length',a:'',b:'',value:0,driving:true};
 if(pick.points.length===2){[d.a,d.b]=pick.points;const a=screen(cadPoint(m,d.a)),b=screen(cadPoint(m,d.b)),outsideX=mouse.x<Math.min(a.x,b.x)-14||mouse.x>Math.max(a.x,b.x)+14,outsideY=mouse.y<Math.min(a.y,b.y)-14||mouse.y>Math.max(a.y,b.y)+14;
  d.kind=shift?'aligned':Math.abs(a.x-b.x)<1e-7?'vertical':Math.abs(a.y-b.y)<1e-7?'horizontal':outsideX&&!outsideY?'vertical':outsideY&&!outsideX?'horizontal':Math.abs(mouse.x-(a.x+b.x)/2)>Math.abs(mouse.y-(a.y+b.y)/2)?'vertical':'horizontal';
 }else if(pick.members.length){const b=m.beams.find(b=>b.id===pick.members[0])!;d.a=b.a;d.b=b.b;
  if(pick.members.length===2){const z=m.beams.find(b=>b.id===pick.members[1])!,a=screen(cadPoint(m,b.a)),end=screen(cadPoint(m,b.b)),c=screen(cadPoint(m,z.a)),q=screen(cadPoint(m,z.b)),v=intersection(a,end,c,q);if(!v)return null;
   let best=-Infinity;for(const r of [false,true])for(const t of [false,true]){const u=Math.atan2(end.y-a.y,end.x-a.x)+(r?Math.PI:0),w=Math.atan2(q.y-c.y,q.x-c.x)+(t?Math.PI:0),delta=Math.atan2(Math.sin(w-u),Math.cos(w-u)),mid=u+delta/2,score=Math.cos(mid-Math.atan2(mouse.y-v.y,mouse.x-v.x));if(score>best){best=score;d={...d,kind:'angle',a:r?b.b:b.a,b:r?b.a:b.b,c:t?z.b:z.a,d:t?z.a:z.b};}}
  }
 }else return null;
 if(d.b==='@origin')[d.a,d.b]=[d.b,d.a];d.value=dimensionValue(m,d);d.sense=dimensionSense(m,d);d.offset=placementOffset(d,m,screen,mouse);return d;
}
export function seedSketch(m:Model,c:SketchConstraint){
 if(c.type==='coincident')return;if(c.scope==='points'){const a=cadPoint(m,c.a),b=cadPoint(m,c.b!);if(b.id==='@origin')return;if(c.type==='horizontal')b.y=a.y;else b.x=a.x;return;}const b=m.beams.find(b=>b.id===c.a)!,a=cadPoint(m,b.a),z=cadPoint(m,b.b),L=Math.hypot(z.x-a.x,z.y-a.y);
 if(c.type==='horizontal'){z.x=a.x+(z.x<a.x?-1:1)*L;z.y=a.y;return;}if(c.type==='vertical'){z.y=a.y+(z.y<a.y?-1:1)*L;z.x=a.x;return;}
 const t=m.beams.find(b=>b.id===c.b)!,p=cadPoint(m,t.a),q=cadPoint(m,t.b),shared=[p,q].find(n=>[a.id,z.id].includes(n.id)),anchor=shared??p,moving=anchor===p?q:p,T=Math.hypot(q.x-p.x,q.y-p.y),u=(z.x-a.x)/L,v=(z.y-a.y)/L;
 if(c.type==='equal'){const dx=moving.x-anchor.x,dy=moving.y-anchor.y;moving.x=anchor.x+dx/T*L;moving.y=anchor.y+dy/T*L;return;}
 let dx=c.type==='perpendicular'?-v:u,dy=c.type==='perpendicular'?u:v;if((moving.x-anchor.x)*dx+(moving.y-anchor.y)*dy<0){dx=-dx;dy=-dy;}
 if(c.type==='collinear'&&!shared){const k=(anchor.x-a.x)*u+(anchor.y-a.y)*v;anchor.x=a.x+k*u;anchor.y=a.y+k*v;}moving.x=anchor.x+dx*T;moving.y=anchor.y+dy*T;
}
export function addSketchConstraint(m:Model,type:SketchConstraint['type'],a:string,b?:string,scope?:'points'|'members'){
 if((m.sketchConstraints??[]).some(c=>!c.suppressed&&c.type===type&&(c.scope??'members')===(scope??'members')&&((c.a===a&&c.b===b)||(c.a===b&&c.b===a))))throw Error('Over-constrained sketch: this constraint already exists.');
 const before=structuredClone(m),existing=(m.sketchConstraints??[]).find(c=>c.suppressed&&c.type===type&&(c.scope??'members')===(scope??'members')&&((c.a===a&&c.b===b)||(c.a===b&&c.b===a))),c:SketchConstraint={id:existing?.id??uid(),type,a,b,...(scope?{scope}:{}),...(existing?{suppressed:false}:{})};if(scope!=='points')seedSketch(m,c);m.sketchConstraints=existing?(m.sketchConstraints??[]).map(x=>x.id===existing.id?c:x):[...(m.sketchConstraints??[]),c];
 const preferred=scope==='points'?[b=== '@origin'?a:b!]:[m.beams.find(x=>x.id===(b??a))!.b];
 try{enforceConstraints(m,undefined,{preferredNodes:preferred});const without=structuredClone(m);without.sketchConstraints=without.sketchConstraints?.filter(x=>x.id!==c.id);if(!existing&&sketchMobility(m).rank===sketchMobility(without).rank)throw Error('Over-constrained sketch: the existing relationships already define this constraint.');}
 catch(error){Object.assign(m,before);throw error;}
 return c;
}
