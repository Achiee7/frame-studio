import {validModel,validBeamPreset,withLoadPositions} from './model';
import type {Model,MassProperties} from './model';
import type {SectionSpec} from './sections';

export const LIBRARY_KEY='frame-studio:community:library:v1';
export const DRAFT_KEY='frame-studio:community:draft:v1';
export type Project={id:string;name:string;model:Model;createdAt:string;updatedAt:string;archived?:boolean};
export type BeamPreset={section?:SectionSpec;id:string;name:string;E:number;A:number;I:number;massProperties?:MassProperties;createdAt:string};
export type Draft={name:string;model:Model;projectId:string|null;dirty:boolean};
export type StorageLike=Pick<Storage,'getItem'|'setItem'>;
type Library={schemaVersion:1;projects:Project[];beamPresets:BeamPreset[];favorites?:string[]};
type Backup=Library&{format:'frame-studio-browser-backup-v1';exportedAt:string};
const clone=<T,>(value:T):T=>structuredClone(value);
const isDate=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const isId=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(v);
const validProject=(v:any):v is Project=>v&&isId(v.id)&&typeof v.name==='string'&&v.name.trim().length>0&&v.name.length<=100&&validModel(v.model)&&isDate(v.createdAt)&&isDate(v.updatedAt)&&(v.archived===undefined||typeof v.archived==='boolean');
const validPreset=(v:any):v is BeamPreset=>v&&isId(v.id)&&isDate(v.createdAt)&&validBeamPreset(v);
function validLibrary(v:any):v is Library{return v?.schemaVersion===1&&(v.favorites===undefined||Array.isArray(v.favorites)&&v.favorites.length<=2000&&v.favorites.every((x:unknown)=>typeof x==='string'&&x.length<=100)&&new Set(v.favorites).size===v.favorites.length)&&Array.isArray(v.projects)&&Array.isArray(v.beamPresets)&&v.projects.length<=1000&&v.beamPresets.length<=1000&&v.projects.every(validProject)&&v.beamPresets.every(validPreset)&&new Set(v.projects.map((p:Project)=>p.id)).size===v.projects.length&&new Set(v.beamPresets.map((p:BeamPreset)=>p.id)).size===v.beamPresets.length;}
function validDraft(v:any):v is Draft{return v&&typeof v.name==='string'&&v.name.trim().length>0&&v.name.length<=100&&validModel(v.model)&&(v.projectId===null||isId(v.projectId))&&typeof v.dirty==='boolean';}
function parse(raw:string){try{return JSON.parse(raw);}catch{throw Error('Browser data could not be read. The stored data has been left unchanged. Export your current frame as JSON before changing browser storage.');}}
function write(storage:StorageLike,key:string,value:unknown){try{storage.setItem(key,JSON.stringify(value));}catch{throw Error('Browser storage is unavailable or full. Export your frame as JSON to keep a backup.');}}
export function createLocalStore(storage:StorageLike){
 function read():Library{const raw=storage.getItem(LIBRARY_KEY);if(raw===null)return {schemaVersion:1,projects:[],beamPresets:[]};const value=parse(raw);if(!validLibrary(value))throw Error('The browser project library is invalid or uses an unsupported version. It has been left unchanged.');return value;}
 function persist(value:Library){if(!validLibrary(value))throw Error('Cannot save an invalid project or beam preset.');write(storage,LIBRARY_KEY,value);}
 return {
  listProjects(includeArchived=false){return clone(read().projects.filter(p=>includeArchived||!p.archived).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));},
  loadProject(id:string){const project=read().projects.find(p=>p.id===id);if(!project)throw Error('This project is no longer saved in this browser.');return {...clone(project),model:withLoadPositions(clone(project.model))};},
  saveProject(name:string,model:Model,id?:string|null){const clean=name.trim();if(!clean||clean.length>100||!validModel(model))throw Error('Enter a project name and a valid frame before saving.');const db=read(),existing=id?db.projects.find(p=>p.id===id):undefined;if(id&&!existing)throw Error('This project was removed from browser storage. Use Save a copy to preserve the current frame.');const now=new Date().toISOString(),project:Project={id:existing?.id??crypto.randomUUID(),name:clean,model:clone(model),createdAt:existing?.createdAt??now,updatedAt:now};db.projects=db.projects.filter(p=>p.id!==project.id);db.projects.push(project);persist(db);return clone(project);},
  archiveProject(id:string,archived:boolean){const db=read(),p=db.projects.find(p=>p.id===id);if(!p)throw Error('Project not found.');p.archived=archived;persist(db);},
  readDraft():Draft|null{const raw=storage.getItem(DRAFT_KEY);if(raw===null)return null;const draft=parse(raw);if(!validDraft(draft))throw Error('The recovery draft could not be read. Saved projects have not been changed.');return {...clone(draft),model:withLoadPositions(clone(draft.model))};},
  writeDraft(draft:Draft){if(!validDraft(draft))throw Error('The recovery draft is invalid.');write(storage,DRAFT_KEY,draft);},
  listPresets(){return clone(read().beamPresets);},
  listFavorites(){return clone(read().favorites??[]);},
  setFavorite(id:string,enabled:boolean){if(typeof id!=='string'||!id||id.length>100)throw Error('Invalid section identifier.');const db=read();db.favorites=[...new Set([...(db.favorites??[]).filter(x=>x!==id),...(enabled?[id]:[])])];persist(db);},
  updatePreset(id:string,preset:Omit<BeamPreset,'id'|'createdAt'>){if(!validBeamPreset(preset))throw Error('Check the section dimensions and properties.');const db=read(),existing=db.beamPresets.find(p=>p.id===id);if(!existing)throw Error('Section no longer exists.');Object.assign(existing,clone(preset),{name:preset.name.trim()});persist(db);return clone(existing);},
  savePreset(preset:Omit<BeamPreset,'id'|'createdAt'>){if(!validBeamPreset(preset))throw Error('Check the beam name and section properties before saving.');const db=read(),p:BeamPreset={...clone(preset),name:preset.name.trim(),id:crypto.randomUUID(),createdAt:new Date().toISOString()};db.beamPresets.unshift(p);persist(db);return clone(p);},
  exportBackup():Backup{return {...clone(read()),format:'frame-studio-browser-backup-v1',exportedAt:new Date().toISOString()};},
  importBackup(input:unknown){const incoming=input as Backup;if(incoming?.format!=='frame-studio-browser-backup-v1'||!validLibrary(incoming))throw Error('Choose a valid Frame Studio browser backup. No saved projects were changed.');const db=read();let projects=0,presets=0;const favoriteMap=new Map<string,string>();for(const p of incoming.projects){const existing=db.projects.find(x=>x.id===p.id);if(existing&&JSON.stringify(existing)===JSON.stringify(p))continue;db.projects.push({...clone(p),id:existing?crypto.randomUUID():p.id});projects++;}for(const p of incoming.beamPresets){const existing=db.beamPresets.find(x=>x.id===p.id);if(existing&&JSON.stringify(existing)===JSON.stringify(p))continue;const row={...clone(p),id:existing?crypto.randomUUID():p.id};if(row.section&&db.beamPresets.some(x=>x.section?.id===row.section!.id)){const oldId=row.section.id;row.section.id='custom-'+row.id;favoriteMap.set(oldId,row.section.id);}db.beamPresets.push(row);presets++;}db.favorites=[...new Set([...(db.favorites??[]),...(incoming.favorites??[]).map(id=>favoriteMap.get(id)??id)])];persist(db);return {projects,presets};}
 };
}
function storage(){try{return window.localStorage;}catch{throw Error('This browser has blocked local storage. You can still calculate and export frames as JSON.');}}
// Resolve storage only when used, so blocked storage never prevents rendering.
export const browserStore:ReturnType<typeof createLocalStore>=Object.fromEntries(Object.keys(createLocalStore({getItem:()=>null,setItem:()=>{}})).map(key=>[key,(...args:unknown[])=>(createLocalStore(storage()) as any)[key](...args)])) as ReturnType<typeof createLocalStore>;
