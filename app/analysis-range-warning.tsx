import type {Applicability,RangeIssue} from './analysis-validity';
import type {Model} from './model';
import type {MaterialResult} from './plastic';
import {stressRamp,type StressPoint} from './result-fields';
import {display,formatNumber} from './units';

function exceeded(issue:RangeIssue,model:Model){
 const i=model.beams.findIndex(b=>b.id===issue.beam);
 const member=i>=0?`B${i+1} · `:'';
 if(issue.kind==='non-finite')return 'The numerical result is non-finite.';
 const rotation=issue.kind==='rotation',scale=rotation?1:100,unit=rotation?' rad':'%';
 const label=rotation?'Rotation / slope':issue.kind==='strain'?'Strain':'Relative displacement / member length';
 return `${member}${label}: ${formatNumber(issue.value*scale,6)}${unit} (threshold ${formatNumber(issue.limit*scale,3)}${unit})`;
}

type Props={model:Model;assessment:Applicability;rangeField?:Applicability;material?:MaterialResult;
 acceptedLoad?:string;displacementMm?:number;pending:boolean};
export default function AnalysisRangeWarning({model,assessment,material,rangeField,acceptedLoad,displacementMm,pending}:Props){
 const yielded=material&&Object.values(material.memberStates).some(b=>b.maxPlasticStrain>0);
 const field=acceptedLoad?material?.loadedField.filter(p=>p.state!=='unknown'):undefined;
 const peak=field?.reduce<StressPoint|undefined>((a,p)=>!a||p.ratio>a.ratio?p:a,undefined);
 const failureRatios=(field??[]).flatMap(p=>p.failureRatio===undefined?[]:[p.failureRatio]);
 const stop=material?.rangeStop;
 const unload=stop?.phase==='unloading';
 const diagnostic=rangeField?.memberUtilisation;
 return <aside className="model-range-banner" role="alert">
   <strong>{unload?'Unloading stopped · permanent set unknown':'Small-displacement limit · target response unknown'}</strong>
   <p>{assessment.issues.map(issue=>exceeded(issue,model)).join(' · ')}</p>
   {diagnostic?<><p>{acceptedLoad?`Member colours show the accepted loading result at ${acceptedLoad} of the entered load.`:'Member colours show a rejected elastic extrapolation at the entered load.'} Each colour uses the highest rotation, strain or relative displacement ratio on that member.</p>
     <div className="field-ramp" style={{background:stressRamp}}/><div className="field-range"><span>0%</span><span>50%</span><span>≥100% of model limit</span></div>
   </>:<p>Member utilisation is unknown. Grey marks unavailable results.</p>}
   <details><summary>Load step and material evidence</summary>
     {stop&&<p>{unload?'Rejected unloading step':'Rejected loading step'} at {formatNumber(100*stop.factor,6)}% of the entered load.</p>}
     {peak&&<p>At the displayed loading step, B{model.beams.findIndex(b=>b.id===peak.beam)+1} reaches {formatNumber(100*peak.ratio,2)}% of yield stress. {yielded?'Yielding occurred in the model.':'No sampled fibre has yielded.'} {failureRatios.length?`Peak demand against configured material limits: ${formatNumber(100*Math.max(...failureRatios),2)}%.`:'Material failure limits are unavailable for this field.'}</p>}
     {displacementMm!==undefined&&Number.isFinite(displacementMm)&&<p>Rejected trial displacement: {display(model,displacementMm/1000,'deflection')}.</p>}
     <p>Red on this scale identifies a limit of the small-displacement equations. Establishing the response beyond it requires a geometrically nonlinear analysis. Material failure and permanent deformation at the target load remain undetermined.</p>
   </details>{pending&&<small>Material analysis is running.</small>}
 </aside>;
}
