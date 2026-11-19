import {addSketchConstraint} from './cad.ts';
import {mergePoints} from './model.ts';
import type {Model,SketchConstraint} from './model.ts';
import {availableActions} from './sketch-actions.ts';
import type {GeometryPick,SketchAction} from './sketch-actions.ts';

function constraintArgs(action:SketchAction, picks:GeometryPick[]) {
  const point=picks.find(p=>p.type==='node'),line=picks.find(p=>p.type==='member');
  if (point && line) return {kind:action as 'midpoint'|'pointOnMember',a:point.id,b:line.id,moveMember:picks[0]===point,scope:undefined};
  const kind=action==='alongX'?'horizontal':action==='alongY'?'vertical':action==='connect'?'coincident':action as SketchConstraint['type'];
  return {kind,a:picks[0].id,b:picks[1]?.id,moveMember:false,scope:point?'points' as const:undefined};
}
export function planarActions(model:Model,picks:GeometryPick[]) {
  return availableActions('2D','constraint',picks,model.beams).filter(action=>{
    const {kind,a,b,scope}=constraintArgs(action,picks);
    if ((model.sketchConstraints??[]).some(c=>!c.suppressed && c.type===kind &&
      (c.scope===scope || kind==='coincident') &&
      (c.a===a && c.b===b || kind!=='midpoint' && kind!=='pointOnMember' && c.a===b && c.b===a))) return false;
    return !(model.constraints??[]).some(c=>!c.suppressed && (c.type===kind || c.type==='rightAngle' && kind==='perpendicular') &&
      (c.reference===a && c.target===b || c.reference===b && c.target===a));
  });
}
export function quickPlanarConstraint(model:Model,action:SketchAction,picks:GeometryPick[]) {
  if (!planarActions(model,picks).includes(action)) throw Error('Choose an available constraint for this selection.');
  const next=structuredClone(model),{kind,a,b,scope,moveMember}=constraintArgs(action,picks);
  if (action==='connect') mergePoints(next,a,b!);
  else addSketchConstraint(next,kind,a,b,scope,moveMember);
  return next;
}
