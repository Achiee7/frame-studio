import {useState} from 'react';
import {ArrowDown, Eye, EyeOff, Link2, Pencil, RotateCcw, Ruler, Trash2} from 'lucide-react';
import type {ReactNode} from 'react';
import type {Beam, GeometryConstraint, Model, SketchConstraint} from './model';
import {dimensionPoints, isMemberPointConstraint, ORIGIN} from './model';
import {dimensionText} from './dimension-layer';
import {dimensionNames} from './dimensions-panel';
import {display} from './units';
import {caseNames, loadLength} from './load-controls';
import InlineEditor from './inline-editor';
import type {AnnotationTarget} from './inline-editor';
import {memberAnnotations} from './member-annotations';

type Props = {
 model: Model;
 beam: Beam;
 canRemove: boolean;
 onApply: (target: AnnotationTarget, value: number, direction: number, driving: boolean) => boolean;
 onRemoveDimension: (id: string) => boolean;
 onRemoveConstraint: (id: string, legacy: boolean) => void;
 onToggleConstraint: (id: string, suppressed: boolean) => void;
};

const constraintNames: Record<SketchConstraint['type'] | GeometryConstraint['type'], string> = {
 horizontal: 'Horizontal',
 vertical: 'Vertical',
 equal: 'Equal length',
 parallel: 'Parallel',
 perpendicular: 'Perpendicular',
 collinear: 'Collinear',
 coincident: 'Coincident',
 pointOnMember: 'Point on member',
 midpoint: 'Midpoint',
 rightAngle: 'Perpendicular',
};

function Branch({name, count, children}: {name: string; count: number; children: ReactNode}) {
 return <details className="member-annotation-branch" open={count > 0}>
  <summary>{name}<span className="member-annotation-count">{count}</span></summary>
  {count ? <ul>{children}</ul> : <p className="member-annotation-empty">No {name.toLowerCase()}</p>}
 </details>;
}

export default function MemberAnnotationsPanel({
 model, beam, canRemove, onApply, onRemoveDimension, onRemoveConstraint, onToggleConstraint,
}: Props) {
 const [editing, setEditing] = useState<AnnotationTarget | null>(null);
 const {sketchConstraints, continuityConstraints, dimensions, loads} = memberAnnotations(model, beam);
 const memberLabel = (id: string) => 'B' + (model.beams.findIndex(member => member.id === id) + 1);
 const pointLabel = (id: string) => id === ORIGIN ? 'Origin' : 'N' + (model.nodes.findIndex(node => node.id === id) + 1);

 function edit(type: AnnotationTarget['type'], id: string) {
  setEditing(current => current?.type === type && current.id === id ? null : {type, id});
 }

 function editor(id: string, dimension = false) {
  if (editing?.id !== id || (editing.type === 'dimension') !== dimension) return null;
  return <InlineEditor key={editing.type + editing.id} model={model} target={editing}
   onApply={(value, direction, driving) => onApply(editing, value, direction, driving)}
   onClose={() => setEditing(null)}
   onDelete={canRemove && dimension ? () => { if (onRemoveDimension(id)) setEditing(null); } : undefined}/>;
 }

 function constraintRow(constraint: SketchConstraint | GeometryConstraint, label: string, context: string) {
  const name = constraintNames[constraint.type];
  const action = constraint.suppressed ? 'Re-enable' : 'Suppress';
  return <li className="member-annotation" key={label + constraint.id}>
   <div className="member-annotation-row">
    <Link2 size={14} aria-hidden="true"/>
    <div className="member-annotation-copy">
     <b>{label} · {name}</b>
     <small>{context}{constraint.suppressed && ' · Suppressed'}</small>
    </div>
    {canRemove && <div className="member-annotation-actions">
     <button type="button" title={action} aria-label={action + ' ' + label + ' ' + name}
      onClick={() => onToggleConstraint(constraint.id, !constraint.suppressed)}>
      {constraint.suppressed ? <Eye size={14}/> : <EyeOff size={14}/>}
     </button>
     <button type="button" className="annotation-remove" title="Remove constraint"
      aria-label={'Remove ' + label + ' ' + name} onClick={() => onRemoveConstraint(constraint.id, 'reference' in constraint)}>
      <Trash2 size={14}/>
     </button>
    </div>}
   </div>
  </li>;
 }

 return <section className="property-section member-annotations" aria-label="Member annotations">
  <h3>On this member</h3>
  <Branch name="Constraints" count={sketchConstraints.length + continuityConstraints.length}>
   {sketchConstraints.map(constraint => {
    let context: string;
    if (isMemberPointConstraint(constraint)) {
     context = memberLabel(constraint.b!) + ' ↔ ' + pointLabel(constraint.a);
    } else {
     const label = constraint.type === 'coincident' || constraint.scope === 'points' ? pointLabel : memberLabel;
     context = [constraint.a, constraint.b].filter((id): id is string => !!id).map(label).join(' ↔ ');
    }
    return constraintRow(constraint, 'S' + (model.sketchConstraints!.indexOf(constraint) + 1), context);
   })}
   {continuityConstraints.map(constraint =>
    constraintRow(constraint, 'C' + (model.constraints!.indexOf(constraint) + 1),
     memberLabel(constraint.reference) + ' ↔ ' + memberLabel(constraint.target)))}
  </Branch>
  <Branch name="Dimensions" count={dimensions.length}>
   {dimensions.map(dimension => {
    const label = 'D' + (model.dimensions!.indexOf(dimension) + 1);
    const isEditing = editing?.type === 'dimension' && editing.id === dimension.id;
    return <li className="member-annotation" key={dimension.id}>
     <button type="button" className="member-annotation-row annotation-edit" aria-expanded={isEditing}
      aria-label={'Edit ' + label + ' ' + dimensionNames[dimension.kind]} onClick={() => edit('dimension', dimension.id)}>
      <Ruler size={14} aria-hidden="true"/>
      <span className="member-annotation-copy">
       <b>{label} · {dimensionNames[dimension.kind]}</b>
       <small>{dimensionText(model, dimension)}{!dimension.driving && ' · Driven'}</small>
       <small>{dimensionPoints(dimension).map(pointLabel).join(' · ')}</small>
      </span>
      <Pencil size={13} aria-hidden="true"/>
     </button>
     {editor(dimension.id, true)}
    </li>;
   })}
  </Branch>
  <Branch name="Loads" count={loads.length}>
   {loads.map(load => {
    const label = 'L' + (model.loads.indexOf(load) + 1);
    const moment = load.type === 'moment', distributed = load.type === 'distributed';
    const name = moment ? 'Moment' : distributed ? 'Distributed load' : 'Point force';
    const amount = display(model, moment ? load.m : Math.hypot(load.fx, load.fy),
     moment ? 'moment' : distributed ? 'distributed' : 'force');
    const position = distributed ? 'Whole segment' : load.attachment
     ? pointLabel(load.attachment === 'start' ? beam.a : beam.b)
     : display(model, load.position?.distance ?? load.t * loadLength(model, load), 'length')
       + ' from ' + (load.position?.from ?? 'start');
    const isEditing = editing?.id === load.id && editing.type !== 'dimension';
    return <li className="member-annotation" key={load.id}>
     <button type="button" className="member-annotation-row annotation-edit" aria-expanded={isEditing}
      aria-label={'Edit ' + label + ' ' + name} onClick={() => setEditing(isEditing ? null : {type:'load', id:load.id})}>
      {moment ? <RotateCcw size={14} aria-hidden="true"/> : <ArrowDown size={14} aria-hidden="true"/>}
      <span className="member-annotation-copy"><b>{label} · {name}</b><small>{amount} · {position}</small>
       <small>{caseNames[load.case]}</small></span>
      <Pencil size={13} aria-hidden="true"/>
     </button>
     {isEditing && !distributed && <button type="button" className="annotation-position"
      onClick={() => setEditing({type: editing?.type === 'position' ? 'load' : 'position', id: load.id})}>
      {editing?.type === 'position' ? 'Edit load value' : 'Edit position'}
     </button>}
     {editor(load.id)}
    </li>;
   })}
  </Branch>
 </section>;
}
