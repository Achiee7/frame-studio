import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronRight,Layers,Plus,Search,Star,X} from 'lucide-react';
import type {Model} from './model';
import {uid,validBeamPreset} from './model';
import {browserStore} from './local-storage';
import {sections,applySection,sectionProperties,geometryError,validSection} from './sections';
import type {SectionSpec,SectionGeometry} from './sections';
import {planarSectionTargets,sectionVariant,usedSections} from './section-assignment';
import type {SectionTarget} from './section-assignment';
import {SectionDrawing,SectionDetails} from './section-view';
import {useUnits} from './unit-context';
import {quantity,getUnits,display} from './units';
import MaterialControls from './material-controls';
import {defaultMaterial} from './materials';
import NumberInput from './number-input';

function readLibrary(){
  try{return {items:browserStore.listPresets(),favs:browserStore.listFavorites(),error:''};}
  catch(e){return {items:[],favs:[],error:(e as Error).message};}
}
function savedSections(items:ReturnType<typeof readLibrary>['items']):SectionSpec[]{
  return items.map(p=>({...p.section,id:p.section?.id??p.id,name:p.name,category:'Custom',A:p.A,I:p.I,E:p.E,massProperties:p.massProperties??p.section?.massProperties}));
}

export function SectionQuickPicker({targets,onUse,libraryVersion=0,currentId}:{targets:SectionTarget[];onUse:(section:SectionSpec)=>void;libraryVersion?:number;currentId?:string}){
  const saved=useMemo(readLibrary,[libraryVersion]);
  const used=usedSections(targets);
  const usedKeys=new Set(used.map(x=>sectionVariant(x.section)));
  const favourites=[...sections,...savedSections(saved.items)].filter(s=>saved.favs.includes(s.id)&&!usedKeys.has(sectionVariant(s)));
  const options=[...used.map(x=>x.section),...favourites];
  const chosen=targets.find(t=>t.id===currentId)?.section;
  const index=chosen?options.findIndex(s=>sectionVariant(s)===sectionVariant(chosen)):-1;
  const sameName=(name:string)=>options.filter(s=>s.name===name).length>1;
  return <label className="section-quick-picker">Quick sections
    <select aria-label="Used and favourite sections" value={index<0?'':index} onChange={e=>{if(e.target.value!=='')onUse(options[Number(e.target.value)]);}}>
      <option value="" disabled>Choose a section…</option>
      {!!used.length&&<optgroup label="Used in this drawing">{used.map(({section,members},i)=><option key={i} value={i}>
        {section.name}{sameName(section.name)?' · '+members[0]:''}{saved.favs.includes(section.id)?' ★':''}
      </option>)}</optgroup>}
      {!!favourites.length&&<optgroup label="Favourites">{favourites.map((s,i)=><option key={s.id} value={used.length+i}>{s.name}</option>)}</optgroup>}
    </select>
  </label>;
}

type BrowserProps={
  model?:Model;targets:SectionTarget[];selected?:string;selectedIds?:string[];
  onApply:(ids:string[],section:SectionSpec)=>boolean;onApplyMultiple?:(section:SectionSpec)=>void;
  onClose?:()=>void;onLibraryChange?:()=>void;
};
type PlanarProps={
  model:Model;selected?:string;selectedIds?:string[];onChange:(m:Model)=>boolean;onLibraryChange:()=>void;
  onClose?:()=>void;onApplyMultiple?:(section:SectionSpec)=>void;
};

export default function BeamLibrary({model,onChange,...props}:PlanarProps){
  return <SectionBrowser {...props} model={model} targets={planarSectionTargets(model)} onApply={(ids,s)=>onChange(applySection(model,ids,s))}/>;
}

export function SectionLibraryDialog(props:BrowserProps & {onClose:()=>void}){
  useEffect(()=>{
    function escape(e:KeyboardEvent){if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();e.stopPropagation();props.onClose();}}
    document.addEventListener('keydown',escape);
    return ()=>document.removeEventListener('keydown',escape);
  },[props.onClose]);
  return createPortal(<div className="modal-backdrop" onClick={props.onClose}>
    <section className="modal" role="dialog" aria-modal="true" aria-label="Sections" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><h2>Sections</h2><button aria-label="Close sections" onClick={props.onClose}><X size={20}/></button></div>
      <SectionBrowser {...props}/>
    </section>
  </div>,document.body);
}

const massFields=[['mass','Mass','kg'],['density','Density','kg/m³'],['specimenLength','CAD specimen length','m'],['ixx','Ixx','kg·m²'],['iyy','Iyy','kg·m²'],['izz','Izz','kg·m²'],['ixy','Ixy','kg·m²'],['ixz','Ixz','kg·m²'],['iyz','Iyz','kg·m²']] as const;
const dimensionNames={h:'Height / diameter',b:'Width',tw:'Web thickness',tf:'Flange thickness',t:'Wall thickness',r:'Root / outside radius',ri:'Inside radius'};
type Dim=keyof typeof dimensionNames;
const dimensionsByShape:Record<SectionGeometry['shape'],Dim[]>={i:['h','b','tw','tf','r'],rhs:['h','b','t','r','ri'],chs:['h','t'],rectangle:['h','b']};
const categoryNames:Record<string,string>={Used:'Used in this drawing',Favorites:'Favourites',SHS:'Square · SHS',RHS:'Rectangular · RHS',CHS:'Circular · CHS',Scaffold:'Scaffold tube',Custom:'My sections'};

function SectionBrowser({model,targets,selected,selectedIds,onApply,onApplyMultiple,onLibraryChange,onClose}:BrowserProps){
  const units=useUnits(),m=model??{nodes:[],beams:[],loads:[],units};
  const initialTarget=targets.find(t=>t.id===selected)??targets.find(t=>selectedIds?.includes(t.id))??(targets.length===1?targets[0]:undefined);
  const [library,setLibrary]=useState(readLibrary);
  const custom=useMemo(()=>savedSections(library.items),[library.items]);
  const all=[...sections,...custom],used=usedSections(targets).map(x=>x.section);
  const initial=initialTarget?.section??sections[1];
  const [chosen,setChosen]=useState<SectionSpec>(()=>structuredClone(initial));
  const [category,setCategory]=useState(initialTarget?'Used':initial.category),[query,setQuery]=useState('');
  const [targetId,setTargetId]=useState(initialTarget?.id??''),[whole,setWhole]=useState(false);
  const [editing,setEditing]=useState(false),[manual,setManual]=useState(!initial.geometry);
  const [inputUnit,setInputUnit]=useState('m'),[drawingVersion,setDrawingVersion]=useState(0),[typingSize,setTypingSize]=useState(false);
  const [error,setError]=useState(library.error),[status,setStatus]=useState('');
  const target=targets.find(t=>t.id===targetId);
  const siblings=target?.family?targets.filter(t=>t.family===target.family):[];
  const group=(c:string)=>c==='Used'?used:c==='Favorites'?all.filter(s=>library.favs.includes(s.id)):all.filter(s=>s.category===c);
  const visible=group(category).filter(s=>s.name.toLowerCase().includes(query.trim().toLowerCase()));
  const known=all.find(s=>s.id===chosen.id),chosenIsSaved=!!known&&chosen.category==='Custom';
  const favoriteId=(s:SectionSpec)=>all.find(x=>sectionVariant(x)===sectionVariant(s))?.id;
  const isFav=(s:SectionSpec)=>library.favs.includes(favoriteId(s)??'');

  function select(s:SectionSpec){
    setChosen(structuredClone(s));setEditing(false);setTypingSize(false);setManual(!s.geometry);setError('');setStatus('');setDrawingVersion(v=>v+1);
  }
  function browse(c:string){
    setCategory(c);setQuery('');const first=group(c)[0];
    if(first)select(first);
  }
  function refresh(){setLibrary(readLibrary());onLibraryChange?.();}
  function favorite(s:SectionSpec){
    try{
      let id=favoriteId(s);
      if(!id){
        const section={...structuredClone(s),id:s.id==='current'||all.some(x=>x.id===s.id)?'custom-'+uid():s.id,category:'Custom'};
        browserStore.savePreset({name:section.name,E:section.E,A:section.A,I:section.I,section,massProperties:section.massProperties});
        id=section.id;
      }
      browserStore.setFavorite(id,!library.favs.includes(id));refresh();setError('');
    }catch(e){setError((e as Error).message);}
  }
  function startNew(base=chosen){
    const copy:SectionSpec={...structuredClone(base),id:'custom-'+uid(),name:('Custom '+base.name).slice(0,100),category:'Custom',source:undefined,
      method:base.geometry?'Calculated from editable nominal geometry':'User-entered structural properties'};
    setChosen(copy);setEditing(true);setTypingSize(false);setManual(!copy.geometry);setInputUnit('m');setError('');setStatus('');setDrawingVersion(v=>v+1);
  }
  function editGeometry(key:Dim,value:number){
    if(!chosen.geometry)return;
    const geometry={...chosen.geometry,[key]:value};if(geometry.shape==='chs')geometry.b=geometry.h;
    const message=geometryError(geometry);
    setChosen({...chosen,geometry,J:undefined,...(!message&&sectionProperties(geometry))});setError(message);
  }
  function sectionToUse(){
    if(!editing)return structuredClone(chosen);
    const name=chosen.name.trim();
    if(!name)throw Error('Give the section a name.');
    if(!manual&&(!chosen.geometry||geometryError(chosen.geometry)))throw Error(chosen.geometry?geometryError(chosen.geometry):'Choose a section shape.');
    const s={...chosen,name,...(manual?{geometry:undefined,method:'User-entered structural properties'}:sectionProperties(chosen.geometry!))};
    if(!validSection(s)||!validBeamPreset({...s,section:s}))throw Error('Check the section properties and its name.');
    return s;
  }
  function save(){
    try{
      const s=sectionToUse(),section={...s,material:s.material??{...defaultMaterial,E:s.E},id:s.id==='current'?'custom-'+uid():s.id};
      const existing=library.items.find(p=>(p.section?.id??p.id)===section.id);
      const preset={name:section.name,E:section.E,A:section.A,I:section.I,section,massProperties:section.massProperties};
      if(existing)browserStore.updatePreset(existing.id,preset);else browserStore.savePreset(preset);
      browserStore.setFavorite(section.id,true);refresh();select(section);setCategory('Custom');setStatus('Section saved to favourites.');
    }catch(e){setError((e as Error).message);}
  }
  function apply(multiple:boolean){
    try{
      const s=sectionToUse();
      if(multiple&&onApplyMultiple){onClose?.();onApplyMultiple(s);return;}
      if(!target)throw Error('Choose the member you want to change.');
      const ids=whole&&siblings.length>1?siblings.map(t=>t.id):[target.id];
      if(!onApply(ids,s))throw Error('The section could not be applied. Check the member and section properties.');
      setError('');setStatus('Section applied.');onClose?.();
    }catch(e){setError((e as Error).message);}
  }
  function number(label:string,value:number,unit:string,onCommit:(v:number)=>void){
    const q=unit==='mm'?quantity(getUnits(m),'length'):undefined;
    return <label key={label}>{label} <small>{q?.unit??unit}</small><NumberInput label={label} value={q?value*.001/q.factor:value} onCommit={v=>onCommit(q?v*q.factor*1000:v)}/></label>;
  }
  function branch(c:string){
    const name=categoryNames[c]??c;
    return <button key={c} aria-pressed={category===c} className={category===c?'active':''} onClick={()=>browse(c)}>
      {c==='Favorites'?<Star size={15}/>:c==='Used'?<Layers size={15}/>:<ChevronRight size={13}/>}
      {name}<small>{group(c).length}</small>
    </button>;
  }
  function mass(k:string,v:string|number){setChosen(s=>({...s,massProperties:{...s.massProperties,[k]:v}}));}
  const drawing=<SectionDrawing key={drawingVersion} section={chosen} onEditChange={setTypingSize} onResize={manual?undefined:(next)=>{
    setChosen(next);setEditing(true);setManual(false);setError('');return true;
  }} onCancel={base=>{setChosen(base);setError('');if(base.category!=='Custom')setEditing(false);}}/>;
  return <div className="section-library">
    <nav className="section-tree" aria-label="Section categories">
      {branch('Used')}{branch('Favorites')}
      <details open><summary>Standard sections</summary>
        <details open><summary>I &amp; H profiles</summary>{['HEA','HEB','IPE'].map(branch)}</details>
        <details open><summary>Hollow sections</summary>{['SHS','RHS','CHS','Scaffold'].map(branch)}</details>
      </details>
      {branch('Custom')}<button className="primary" onClick={()=>startNew()}><Plus size={15}/>New section</button>
    </nav>
    <section className="section-browser">
      <div className="section-search"><Search size={16}/><input aria-label="Search sections" placeholder={'Search '+(categoryNames[category]??category).toLowerCase()+'…'} value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <div className="section-gallery" aria-label={(categoryNames[category]??category)+' section previews'}>
        {visible.map(s=><div key={s.id+sectionVariant(s)} className={'section-card '+(sectionVariant(s)===sectionVariant(chosen)?'selected':'')}>
          <button className="profile-pick" aria-label={'View '+s.name} onClick={()=>select(s)}>
            <SectionDrawing section={s} dimensions={false}/><strong>{s.name}</strong>
            <small>{s.geometry?display(m,s.geometry.h*.001,'length')+' × '+display(m,(s.geometry.shape==='chs'?s.geometry.t:s.geometry.b)*.001,'length'):'User-defined properties'}</small>
          </button>
          <button className="favorite" aria-label={(isFav(s)?'Unfavourite ':'Favourite ')+s.name} aria-pressed={isFav(s)} onClick={()=>favorite(s)}><Star size={15} fill={isFav(s)?'currentColor':'none'}/></button>
        </div>)}
        {!visible.length&&<p className="section-empty">{category==='Favorites'?'Star a section to add it to your favourites.':category==='Used'?'Assigned member sections appear here.':category==='Custom'?'Create a section from a template or enter its properties.':'No matching sections.'}</p>}
      </div>
    </section>
    <section className="section-detail">
      <div className="section-detail-heading"><h3>{chosen.name}</h3>{!editing&&<button aria-label={(isFav(chosen)?'Unfavourite ':'Favourite ')+chosen.name} aria-pressed={isFav(chosen)} onClick={()=>favorite(chosen)}><Star size={18} fill={isFav(chosen)?'currentColor':'none'}/></button>}</div>
      <div className="section-assign-controls">
        <div className="section-assign-actions">
          <button className="primary" disabled={!target||typingSize} onClick={()=>apply(false)}><Check size={16}/>Use section</button>
          {onApplyMultiple&&<button disabled={!targets.length||typingSize} onClick={()=>apply(true)}><Layers size={15}/>Apply to multiple</button>}
        </div>
        {!!targets.length&&<label>Member<select aria-label="Section target member" value={targetId} onChange={e=>{setTargetId(e.target.value);setWhole(false);}}>
          <option value="">Choose a member…</option>{targets.map(t=><option key={t.id} value={t.id}>{t.label} · {t.section.name}</option>)}
        </select></label>}
        {siblings.length>1&&<label className="toggle-row"><span>Include all {siblings.length} continuous segments</span><input type="checkbox" checked={whole} onChange={e=>setWhole(e.target.checked)}/></label>}
      </div>
      {error&&<p role="alert" className="geometry-error">{error}</p>}{status&&<p role="status" className="geometry-success">{status}</p>}
      {drawing}
      {editing?<>
        <label>Section name<input aria-label="Section name" maxLength={100} value={chosen.name} onChange={e=>setChosen({...chosen,name:e.target.value})}/></label>
        <label>Base / template<select aria-label="Section template" value="" onChange={e=>{const s=all.find(s=>s.id===e.target.value);if(s)startNew(s);}}>
          <option value="">Choose a different base…</option>{all.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label className="toggle-row"><span>Enter section properties directly</span><input type="checkbox" checked={manual} onChange={e=>{
          setManual(e.target.checked);setError('');setTypingSize(false);setDrawingVersion(v=>v+1);if(!e.target.checked&&!chosen.geometry){const geometry:SectionGeometry={shape:'rectangle',h:100,b:50,tw:0,tf:0,t:0,r:0};setChosen({...chosen,geometry,J:undefined,...sectionProperties(geometry)});}
        }}/></label>
        {!manual&&chosen.geometry&&<>
          <label>Shape<select aria-label="Section shape" value={chosen.geometry.shape} onChange={e=>{
            const shape=e.target.value as SectionGeometry['shape'],geometry:SectionGeometry={shape,h:120,b:shape==='chs'?120:100,tw:6,tf:9,t:5,r:shape==='i'?12:shape==='rhs'?7.5:0};
            setChosen({...chosen,geometry,J:undefined,...sectionProperties(geometry)});setError('');setTypingSize(false);setDrawingVersion(v=>v+1);
          }}><option value="i">I / H profile</option><option value="rhs">Rectangular / square hollow</option><option value="chs">Circular hollow</option><option value="rectangle">Solid rectangle</option></select></label>
          <div className="section-dimension-fields">{dimensionsByShape[chosen.geometry.shape].map(key=>number(dimensionNames[key],chosen.geometry![key]??Math.max(0,chosen.geometry!.r-chosen.geometry!.t),'mm',v=>editGeometry(key,v)))}</div>
        </>}
        {manual&&<div className="section-dimension-fields">
          {number('Section area',chosen.A*1e4,'cm²',v=>setChosen({...chosen,A:v/1e4}))}
          {number('Major-axis second moment',chosen.I*1e8,'cm⁴',v=>setChosen({...chosen,I:v/1e8}))}
          {number('Minor-axis second moment (3D)',(chosen.Iminor??0)*1e8,'cm⁴',v=>setChosen({...chosen,Iminor:v===0?undefined:v/1e8}))}
          {number('Torsion constant (3D)',(chosen.J??0)*1e8,'cm⁴',v=>setChosen({...chosen,J:v===0?undefined:v/1e8}))}
        </div>}
        <details><summary>Material &amp; failure limits</summary><MaterialControls model={m} material={{...(chosen.material??defaultMaterial),E:chosen.E}} onChange={material=>setChosen({...chosen,material,E:material.E,G:undefined})}/></details>
        <details className="cad-mass-editor"><summary>CAD mass properties</summary>
          <p>Mass moments describe the CAD solid. The static solver uses section area and second moments of area.</p>
          <label>Material<input aria-label="Material name" value={chosen.massProperties?.material??''} onChange={e=>mass('material',e.target.value)}/></label>
          <label>CAD axes / origin<input aria-label="CAD reference" value={chosen.massProperties?.reference??''} onChange={e=>mass('reference',e.target.value)}/></label>
          <label>Mass inertia input units<select aria-label="Mass inertia units" value={inputUnit} onChange={e=>setInputUnit(e.target.value)}><option value="m">kg·m²</option><option value="mm">kg·mm²</option></select></label>
          <div className="section-dimension-fields">{massFields.map(([key,label,unit])=>{
            const kgmm=key.startsWith('i')&&inputUnit==='mm';
            return number(label,(chosen.massProperties?.[key]??0)*(kgmm?1e6:1),kgmm?'kg·mm²':unit,v=>mass(key,v*(kgmm?1e-6:1)));
          })}</div>
        </details>
        <div className="section-actions"><button className="primary" disabled={typingSize} onClick={save}><Check size={15}/>Save section</button><button onClick={()=>select(initial)}>Cancel</button></div>
      </>:<><button className="new-from-section" onClick={()=>startNew()}><Plus size={15}/>Create from this section</button>
        {chosen.category==='Custom'&&<button onClick={()=>{setManual(!chosen.geometry);setEditing(true);}}>{chosenIsSaved?'Edit saved section':'Save as a named section'}</button>}</>}
      <SectionDetails section={chosen}/>
    </section>
  </div>;
}
