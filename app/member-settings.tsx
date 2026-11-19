import type {ReactNode} from 'react';
import {resizeMemberSection} from './profile-edit';
import MaterialControls from './material-controls';
import {materialForBeam} from './materials';
import {display} from './units';
import {useMemo,useState,useEffect} from 'react';
import {MoveUpRight,ChevronRight,Grid3X3,FolderOpen} from 'lucide-react';
import type {Model,Beam} from './model';
import {beamGroupName} from './model';
import {browserStore} from './local-storage';
import {sections,sectionForBeam,applySection} from './sections';
import type {SectionSpec} from './sections';
import {MemberSectionView} from './section-view';
export default function MemberSettings({model:m,beam:b,onChange,onSections,onContinuity,onNode,libraryVersion,annotations}:{model:Model;beam:Beam;onChange:(m:Model)=>boolean;onSections:()=>void;onContinuity:()=>void;onNode:(id:string)=>void;libraryVersion:number;annotations:ReactNode}){
 const [preview,setPreview]=useState<SectionSpec|null>(null),[wholeProfile,setWholeProfile]=useState(true);useEffect(()=>setPreview(null),[b.id,b.A,b.I]);
 function resizeProfile(next:SectionSpec,commit:boolean){if(!commit){setPreview(next);return true;}if(onChange(resizeMemberSection(m,[b.id],next,wholeProfile))){setPreview(null);return true;}return false;}
 const favourites=useMemo(()=>{try{const ids=browserStore.listFavorites(),custom:SectionSpec[]=browserStore.listPresets().map(p=>({...p.section,id:p.section?.id??p.id,name:p.name,category:'Custom',E:p.E,A:p.A,I:p.I,massProperties:p.massProperties}));return [...sections,...custom].filter(s=>ids.includes(s.id));}catch{return [];}},[libraryVersion]);
 const s=sectionForBeam(b),a=m.nodes.find(n=>n.id===b.a)!,z=m.nodes.find(n=>n.id===b.b)!,length=Math.hypot(z.x-a.x,z.y-a.y);
 function patch(patch:Partial<Beam>){const next=structuredClone(m);Object.assign(next.beams.find(x=>x.id===b.id)!,patch);onChange(next);}
 return <><div className="selection-head"><span className="selection-icon"><MoveUpRight size={24}/></span><div><h2>Segment B{m.beams.indexOf(b)+1}</h2><p>{b.kind} · {display(m,length,'length')}</p></div></div>
 {annotations}
 <div className="property-section beam-settings"><h3>BEAM SETTINGS</h3><h4>End releases</h4>{(['releaseA','releaseB'] as const).map((key,i)=><label className="toggle-row" key={key}><span>Release rotation at {i?'end':'start'}</span><input type="checkbox" checked={!!b[key]} onChange={e=>patch({[key]:e.target.checked})}/></label>)}<div className="endpoint-buttons">{[b.a,b.b].map((id,i)=><button key={id} onClick={()=>onNode(id)}>{i?'End':'Start'}: N{m.nodes.findIndex(n=>n.id===id)+1}<ChevronRight size={12}/></button>)}</div><button className="continuity-option" onClick={onContinuity}><Grid3X3 size={15}/>Beam continuity<ChevronRight size={13}/></button><p className="beam-family-caption">{beamGroupName(m,b.family)} · segments {m.beams.filter(x=>x.family===b.family).map(x=>'B'+(m.beams.indexOf(x)+1)).join(' + ')}</p><label>Behaviour<select aria-label="Member behaviour" value={b.kind} onChange={e=>patch({kind:e.target.value as Beam['kind']})}><option value="beam">Beam · axial + bending</option><option value="strut">Strut · axial only</option></select></label></div>
 <details className="property-section member-section-settings" open><summary>Beam section <span>{b.profile}</span></summary><MemberSectionView key={b.id} section={preview??s} onResize={resizeProfile} onCancel={()=>setPreview(null)}/>{m.beams.filter(x=>x.family===b.family).length>1&&<label className="toggle-row"><span>Resize all segments of this beam</span><input type="checkbox" checked={wholeProfile} onChange={e=>setWholeProfile(e.target.checked)}/></label>}<small className="profile-edit-note">Dimension edits create a custom member section. Library presets stay unchanged; use Sections to save it by name.</small><label>Favourite sections<select aria-label="Favourite section" value="" onChange={e=>{const section=favourites.find(s=>s.id===e.target.value);if(section)onChange(applySection(m,[b.id],section));}}><option value="">{favourites.length?'Choose a favourite…':'Star sections in the library…'}</option>{favourites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="open-sections" onClick={onSections}><FolderOpen size={16}/>Sections…</button></details><details className="property-section"><summary>Material &amp; failure limits</summary><MaterialControls model={m} material={materialForBeam(b)} onChange={material=>patch({material,E:material.E})}/></details></>;
}
