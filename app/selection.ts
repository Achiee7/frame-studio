import type {Model} from './model';
export type Picked={type:'node'|'beam'|'load';id:string};
type P={x:number;y:number};
export function boxSelection(m:Model,a:P,b:P,screen:(p:P)=>P):Picked[]{
 const xmin=Math.min(a.x,b.x),xmax=Math.max(a.x,b.x),ymin=Math.min(a.y,b.y),ymax=Math.max(a.y,b.y),inside=(p:P)=>p.x>=xmin&&p.x<=xmax&&p.y>=ymin&&p.y<=ymax,crossing=b.x<a.x;
 function intersects(p:P,q:P){let lo=0,hi=1;for(const [start,delta,min,max]of [[p.x,q.x-p.x,xmin,xmax],[p.y,q.y-p.y,ymin,ymax]]){if(Math.abs(delta)<1e-12){if(start<min||start>max)return false;}else{const t1=(min-start)/delta,t2=(max-start)/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;}}return true;}
 return [...m.nodes.filter(n=>inside(screen(n))).map(n=>({type:'node' as const,id:n.id})),...m.beams.filter(member=>{const p=screen(m.nodes.find(n=>n.id===member.a)!),q=screen(m.nodes.find(n=>n.id===member.b)!);return crossing?intersects(p,q):inside(p)&&inside(q);}).map(n=>({type:'beam' as const,id:n.id})),...m.loads.filter(l=>{const member=m.beams.find(b=>b.id===l.beam)!,p=m.nodes.find(n=>n.id===member.a)!,q=m.nodes.find(n=>n.id===member.b)!;return inside(screen({x:p.x+(q.x-p.x)*l.t,y:p.y+(q.y-p.y)*l.t}));}).map(l=>({type:'load' as const,id:l.id}))];
}
export function mergeSelection(a:Picked[],b:Picked[]){return [...new Map([...a,...b].map(p=>[p.type+':'+p.id,p])).values()];}
export function removeSelected(m:Model,selection:Picked[]){const next=structuredClone(m),nodes=new Set(selection.filter(s=>s.type==='node').map(s=>s.id)),beams=new Set(selection.filter(s=>s.type==='beam').map(s=>s.id)),loads=new Set(selection.filter(s=>s.type==='load').map(s=>s.id));next.beams.forEach(b=>{if(nodes.has(b.a)||nodes.has(b.b))beams.add(b.id);});next.nodes=next.nodes.filter(n=>!nodes.has(n.id));next.beams=next.beams.filter(b=>!beams.has(b.id));next.loads=next.loads.filter(l=>!loads.has(l.id)&&!beams.has(l.beam));return next;}
