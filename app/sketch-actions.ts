export type GeometryPick = {type:'node'|'member'; id:string};
export type SketchAction = 'connect'|'alongX'|'alongY'|'alongZ'|'pointOnMember'|'midpoint'|'parallel'|'perpendicular'|'equal'|'collinear'|'length'|'dx'|'dy'|'dz'|'offset'|'angle';
export type ActionMode = 'constraint'|'dimension';

const labels:Record<SketchAction,string> = {
  connect:'Connect points', alongX:'Along X', alongY:'Along Y', alongZ:'Along Z',
  pointOnMember:'Point on member', midpoint:'At midpoint', parallel:'Parallel',
  perpendicular:'Perpendicular', equal:'Equal length', collinear:'Collinear',
  length:'True distance', dx:'X distance', dy:'Y distance', dz:'Z distance',
  offset:'Perpendicular distance', angle:'Angle'
};
export function actionLabel(action:SketchAction, space:'2D'|'3D', singleMember=false) {
  if (space==='2D' && action==='alongX') return 'Horizontal';
  if (space==='2D' && action==='alongY') return 'Vertical';
  if (singleMember && action==='length') return 'Member length';
  return labels[action];
}
export function samePick(a:GeometryPick,b:GeometryPick) {return a.type===b.type && a.id===b.id;}

// A third pick starts a fresh pair. Picking a highlighted item again deselects it.
export function toggleGeometry(picks:GeometryPick[], next:GeometryPick):GeometryPick[] {
  if (picks.some(p=>samePick(p,next))) return picks.filter(p=>!samePick(p,next));
  return picks.length<2 ? [...picks,next] : [next];
}
type Member = {id:string;a:string;b:string};
export function availableActions(space:'2D'|'3D', mode:ActionMode, picks:GeometryPick[], members:Member[]):SketchAction[] {
  const points=picks.filter(p=>p.type==='node');
  const lines=picks.filter(p=>p.type==='member').map(p=>members.find(b=>b.id===p.id));
  if (!picks.length || picks.length>2 || lines.some(b=>!b)) return [];
  const axes:SketchAction[]=space==='3D'?['alongX','alongY','alongZ']:['alongX','alongY'];
  const distances:SketchAction[]=space==='3D'?['length','dx','dy','dz']:['length','dx','dy'];
  if (points.length===2) {
    if (mode==='dimension') return distances;
    const sameMember=members.some(b=>points.every(p=>p.id===b.a || p.id===b.b));
    return sameMember ? axes : ['connect',...axes];
  }
  if (lines.length===2) return mode==='dimension'?['angle']:['parallel','perpendicular','equal','collinear'];
  if (lines.length && points.length) {
    const line=lines[0]!;
    if (line.a===points[0].id || line.b===points[0].id) return [];
    return mode==='dimension'?['offset']:['pointOnMember','midpoint'];
  }
  if (lines.length===1) return mode==='dimension'?(space==='3D'?distances:['length']):axes;
  return [];
}

/** Resolve a named 3D ribbon command against existing or newly picked geometry. */
export function spatialCommandSelection(action:SketchAction,mode:ActionMode,picks:GeometryPick[],members:Member[]) {
  const mixed=picks.length===2&&picks[0].type!==picks[1].type;
  const resolved=action==='connect'&&mixed?'pointOnMember':action;
  if(availableActions('3D',mode,picks,members).includes(resolved))return {picks,action:resolved,complete:true,error:''};
  const twoMembers=['equal','parallel','perpendicular','collinear','angle'].includes(action);
  const single=picks.find(p=>!twoMembers||p.type==='member');
  const retained=single?[single]:[];
  let error='';
  if(picks.length>retained.length){
    if(twoMembers)error='Pick two different members.';
    else if(action==='connect')error='Pick two distinct joints or a joint and a member away from its end.';
    else if(['midpoint','pointOnMember','offset'].includes(action))error='Pick a joint and a member away from its end.';
    else error='Pick a member or two distinct joints.';
  }
  return {picks:retained,action,complete:false,error};
}
