import type {Beam} from './model';
export type MaterialSpec={id:string;name:string;family:string;E:number;fy:number;fu?:number;hardening:number;ultimateStrain?:number;source?:string;notes?:string};
const steel='https://www.tatasteeluk.com/products/hot-rolled/structural-steel';
const stainless='https://www.outokumpu.com/-/media/files/products/core/outokumpu-core-range-datasheet.pdf';
const plastics='https://www.ensingerplastics.com/en-us/-/media/ensinger/files/document-teaser-files/brochures/shapes/engineering-plastics-manual-english.ashx';
function make(id:string,name:string,family:string,E:number,fy:number,fu:number|undefined,source:string,notes:string):MaterialSpec{return {id,name,family,E:E*1000,fy,fu,hardening:.01,source,notes};}
const metalNote='Room-temperature starting values; confirm grade, product form, thickness and certificate. Post-yield tangent 1% of E is a modelling assumption, not a certified stress–strain curve. Ultimate stress is a tensile limit, not a buckling or connection check.';
const plasticNote='Typical short-term tensile values for the named product, not a design allowable. Symmetric bilinear approximation with assumed 1% hardening. No creep, temperature, moisture, strain-rate, viscoelasticity or stress-softening model. Enter an independently justified failure limit.';
export const materials:MaterialSpec[]=[
 ...[['s235','S235JR',235,360],['s275','S275JR',275,430],['s355','S355JR',355,470]].map(([id,name,fy,fu])=>make(String(id),String(name),'Structural steel',210000,+fy,+fu,steel,'Nominal thickness ≤ 16 mm. '+metalNote)),
 ...[['ss304','304 / 1.4301',230],['ss304l','304L / 1.4307',220],['ss305','305 / 1.4303',220],['ss321','321 / 1.4541',220],['ss301','301 / 1.4310',250],['ss301ln','301LN / 1.4318',350]].map(([id,name,fy])=>make(String(id),String(name),'Stainless steel',200000,+fy,undefined,stainless,'Typical proof strength from Core range overview. '+metalNote)),
 make('al6060t4','EN AW-6060 T4','Aluminium',70000,60,120,'https://www.hydro.com/Document/Doc/Standards%20Catalogue.pdf?docId=629095',metalNote),
 make('al6060t66','EN AW-6060 T66','Aluminium',70000,160,215,'https://www.thyssenkrupp-materials.co.uk/aluminium-6060.html','Extruded profile thickness ≤ 5 mm. '+metalNote),
 make('al6082t6','EN AW-6082 T6','Aluminium',70000,250,290,'https://www.hydro.com/Document/Doc/EN-AW-6082%20T6%20-%20CE-v3.pdf?docId=591668','Extruded profile thickness ≤ 5 mm. '+metalNote),
 ...[['abs','ABS · TECARAN grey',1700,32],['pp','PP · TECAPRO MT',2000,34],['pomc','POM-C · TECAFORM AH',2800,67],['pomh','POM-H · TECAFORM AD',3400,79],['ppe','PPE · TECANYL MT',2400,67]].map(([id,name,E,fy])=>make(String(id),String(name),'Engineering plastics',+E,+fy,undefined,plastics,plasticNote)),
 make('pc','Polycarbonate · Makrolon 2405','Engineering plastics',2400,65,undefined,'https://www.covestro.com/en/products/makrolon-2405-00945088',plasticNote),
 make('peek','PEEK · TECAPEEK natural','Engineering plastics',4200,110,undefined,'https://www.ensingerplastics.com/en/shapes/tecapeek-natural',plasticNote),
 make('pa6','PA6 · Ertalon 6 SA (dry)','Engineering plastics',3300,80,undefined,'https://groupe-mb.scene7.com/is/content/groupemb/ft_DSME_Ertalon_PA6_SA',plasticNote),
];
export const defaultMaterial=materials[0];
export function materialForBeam(b:Beam):MaterialSpec{return {...(b.material??b.section?.material??defaultMaterial),E:b.E};}
export function validMaterial(m:any){return m===undefined||!!m&&typeof m.id==='string'&&typeof m.name==='string'&&m.name.trim().length>0&&m.name.length<=100&&typeof m.family==='string'&&[m.E,m.fy].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<1e12)&&typeof m.hardening==='number'&&Number.isFinite(m.hardening)&&m.hardening>=0&&m.hardening<.5&&(m.fu===undefined||typeof m.fu==='number'&&Number.isFinite(m.fu)&&m.fu>=m.fy)&&(m.ultimateStrain===undefined||typeof m.ultimateStrain==='number'&&Number.isFinite(m.ultimateStrain)&&m.ultimateStrain>m.fy*1000/m.E&&m.ultimateStrain<=10)&&['source','notes'].every(k=>m[k]===undefined||typeof m[k]==='string'&&m[k].length<1500);}
export type Fiber={y:number;area:number};
export type FiberState={plastic:number;yielded:boolean};
// 1D bilinear return mapping with linear kinematic hardening. MPa -> kN/m².
export function fiberResponse(strain:number,previous:FiberState,m:MaterialSpec){const E=m.E,fy=m.fy*1000,H=m.hardening?E*m.hardening/(1-m.hardening):0,trial=E*(strain-previous.plastic),relative=trial-H*previous.plastic,excess=Math.abs(relative)-fy,increment=excess>0?Math.sign(relative)*excess/(E+H):0,plastic=previous.plastic+increment,stress=trial-E*increment;return {trial,relative,increment,H,stress,tangent:excess>0?E*H/(E+H):E,state:{plastic,yielded:previous.yielded||Math.abs(increment)>1e-12},failed:!!(m.fu!==undefined&&stress>m.fu*1000*(1+1e-8)||m.ultimateStrain!==undefined&&Math.abs(strain)>m.ultimateStrain),strain};}
