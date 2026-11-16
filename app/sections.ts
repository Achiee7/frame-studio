import type {Beam,Model,MassProperties} from './model';

export type SectionGeometry={shape:'i'|'rhs'|'chs'|'rectangle';h:number;b:number;tw:number;tf:number;t:number;r:number;ri?:number};
export type SectionSpec={id:string;name:string;category:string;E:number;A:number;I:number;Iminor?:number;geometry?:SectionGeometry;source?:string;method?:string;massProperties?:MassProperties};
export const HE_SOURCE='https://orangebook.arcelormittal.com/node/234';
export const IPE_SOURCE='https://orangebook.arcelormittal.com/index.php/node/6';
export const HOLLOW_SOURCE='https://www.steelforlifebluebook.co.uk/explanatory-notes/bs5950/properties/';
export function geometryError(g:SectionGeometry):string {
 if(!g||!['i','rhs','chs','rectangle'].includes(g.shape))return 'Choose a section shape.';
 if(![g.h,g.b,g.tw,g.tf,g.t,g.r].every(x=>Number.isFinite(x)&&x>=0&&x<=10000)||g.h<=0||g.b<=0)return 'Dimensions must be finite, positive and at most 10,000 mm. Radius may be zero.';
 if(g.shape==='i'&&(g.tw<=0||g.tf<=0||g.tw>=g.b||2*g.tf>=g.h||g.r>Math.min((g.b-g.tw)/2,(g.h-2*g.tf)/2)))return 'Web, flanges and root radius must fit inside the profile.';
 if(['rhs','chs'].includes(g.shape)&&(g.t<=0||2*g.t>=Math.min(g.h,g.b)))return 'Wall thickness must be less than half the outside size.';
 if(g.ri!==undefined&&(!Number.isFinite(g.ri)||g.ri<0||g.ri>Math.min(g.h-2*g.t,g.b-2*g.t)/2))return 'Inside radius must fit inside the hollow section.';
 if(g.shape==='rhs'&&(g.r>Math.min(g.h,g.b)/2||g.r!==0&&g.r<g.t))return 'Outside corner radius must be zero or at least the wall thickness, and fit inside the section.';
 if(g.shape==='chs'&&g.h!==g.b)return 'A circular section must have equal height and width.';
 return '';
}
// Exact integrals of square-minus-quarter-circle corner areas. Units: mm²/mm⁴.
function corner(r:number){return {A:r*r*(1-Math.PI/4),Q:r**3*(5/6-Math.PI/4),J:r**4*(1-5*Math.PI/16)};}
function rounded(b:number,h:number,r:number){const c=corner(r),x=b/2,y=h/2;return {A:b*h-4*c.A,I:b*h**3/12-4*(y*y*c.A-2*y*c.Q+c.J),Iminor:h*b**3/12-4*(x*x*c.A-2*x*c.Q+c.J)};}
export function sectionProperties(g:SectionGeometry){
 const error=geometryError(g);if(error)throw Error(error);const {h,b,tw,tf,t,r}=g;let A:number,I:number,Iminor:number;
 if(g.shape==='i'){const c=corner(r),y=h/2-tf,x=tw/2;A=2*b*tf+(h-2*tf)*tw+4*c.A;I=(b*h**3-(b-tw)*(h-2*tf)**3)/12+4*(y*y*c.A-2*y*c.Q+c.J);Iminor=2*tf*b**3/12+(h-2*tf)*tw**3/12+4*(x*x*c.A+2*x*c.Q+c.J);}
 else if(g.shape==='chs'){const d=h-2*t;A=Math.PI*(h*h-d*d)/4;I=Iminor=Math.PI*(h**4-d**4)/64;}
 else if(g.shape==='rhs'){const o=rounded(b,h,r),n=rounded(b-2*t,h-2*t,(g.ri??Math.max(0,r-t)));A=o.A-n.A;I=o.I-n.I;Iminor=o.Iminor-n.Iminor;}
 else {A=b*h;I=b*h**3/12;Iminor=h*b**3/12;}
 return {A:A/1e6,I:I/1e12,Iminor:Iminor/1e12};
}
export function validSection(s:any){return s===undefined||!!s&&typeof s.id==='string'&&typeof s.name==='string'&&s.name.length<=100&&typeof s.category==='string'&&[s.E,s.A,s.I].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<1e12)&&(s.Iminor===undefined||typeof s.Iminor==='number'&&Number.isFinite(s.Iminor)&&s.Iminor>0)&&(s.geometry===undefined||!geometryError(s.geometry))&&['source','method'].every(k=>s[k]===undefined||typeof s[k]==='string'&&s[k].length<500);}
const steel=210e6;
function rolled(category:string,rows:number[][]):SectionSpec[]{return rows.map(([size,h,b,tw,tf,r,A,I,Iminor])=>({id:`${category}-${size}`,name:`${category} ${size}`,category,E:steel,A:A/1e4,I:I/1e8,Iminor:Iminor/1e8,geometry:{shape:'i',h,b,tw,tf,t:0,r},source:category==='IPE'?IPE_SOURCE:HE_SOURCE,method:'Tabulated section properties · major-axis bending'}));}
export const sections:SectionSpec[]=[
 ...rolled('HEA',[[100,96,100,5,8,12,21.2,349,134],[120,114,120,5,8,12,25.3,606,231],[140,133,140,5.5,8.5,12,31.4,1030,389],[160,152,160,6,9,15,38.8,1670,616],[180,171,180,6,9.5,15,45.3,2510,925],[200,190,200,6.5,10,18,53.8,3690,1340],[240,230,240,7.5,12,21,76.8,7760,2770],[300,290,300,8.5,14,27,112,18300,6310]]),
 ...rolled('HEB',[[100,100,100,6,10,12,26,450,167],[120,120,120,6.5,11,12,34,864,318],[160,160,160,8,13,15,54.3,2490,889],[200,200,200,9,15,18,78.1,5700,2000]]),
 ...rolled('IPE',[[120,120,64,4.4,6.3,7,13.2,318,27.7],[160,160,82,5,7.4,9,20.1,869,68.3],[200,200,100,5.6,8.5,12,28.5,1940,142],[240,240,120,6.2,9.8,15,39.1,3890,284],[300,300,150,7.1,10.7,15,53.8,8360,604]]),
 ...[['SHS',60,60,3],['SHS',100,100,5],['SHS',150,150,6.3],['RHS',100,50,4],['RHS',150,100,5],['RHS',200,100,6.3],['CHS',60.3,60.3,3.2],['CHS',114.3,114.3,5],['CHS',168.3,168.3,6.3]].map(([cat,h,b,t])=>{const category=String(cat),geometry:SectionGeometry={shape:category==='CHS'?'chs':'rhs',h:+h,b:+b,tw:0,tf:0,t:+t,r:category==='CHS'?0:1.5*(+t),...(category==='CHS'?{}:{ri:+t})};return {id:`${category}-${h}-${b}-${t}`,name:category==='CHS'?`CHS ${h} × ${t}`:`${category} ${h} × ${b} × ${t}`,category,E:steel,geometry,...sectionProperties(geometry),source:HOLLOW_SOURCE,method:category==='CHS'?'Calculated from nominal circular dimensions':'Calculated nominal hot-finished shape · outside radius 1.5t, inside radius 1.0t'};}),
];
export function sectionForBeam(b:Beam):SectionSpec {const found=b.section??sections.find(s=>s.name===b.profile&&Math.abs(s.A/b.A-1)<.005&&Math.abs(s.I/b.I-1)<.005);return {...found,id:found?.id??'current',name:b.profile,category:found?.category??'Custom',E:b.E,A:b.A,I:b.I,massProperties:b.massProperties};}
export function applySection(m:Model,ids:string[],section:SectionSpec,wholeBeam=false){if(!validSection(section))throw Error('Invalid section properties.');const next=structuredClone(m),families=new Set(next.beams.filter(b=>ids.includes(b.id)).map(b=>b.family));next.beams.filter(b=>wholeBeam?families.has(b.family):ids.includes(b.id)).forEach(b=>Object.assign(b,{profile:section.name,E:section.E,A:section.A,I:section.I,section:structuredClone(section),massProperties:structuredClone(section.massProperties??{})}));return next;}
