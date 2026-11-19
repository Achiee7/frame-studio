import type {Joint, Support} from './model.ts';

import {validSpatialRules,cleanSpatialRules,trackSpatialSplits,moveConstrainedSpatialNode} from './spatial-sketch.ts';
import type {SpatialRule} from './spatial-sketch.ts';
import {validSpatialAnalysisInput,splitSpatialLoads} from './spatial-analysis-input.ts';
import type {SpatialSection,SpatialLoad} from './spatial-analysis-input.ts';

/** Positions are Cartesian coordinates in metres, with Z upward. */
export type Vec3 = {x: number; y: number; z: number};
export type SpatialNode = Vec3 & {id: string; joint: Joint; support: Support; spring?:number};
export type SpatialMember = {id: string; a: string; b: string; kind: 'beam' | 'strut'; section?:SpatialSection; family?:string};
export type SpatialModel = {nodes: SpatialNode[]; members: SpatialMember[]; rules?:SpatialRule[]; loads?:SpatialLoad[]};

const tolerance = 1e-6;
const maxNodes = 500;
const maxMembers = 750;
const jointTypes = new Set<Joint>(['rigid', 'pin', 'hinge']);
const supportTypes = new Set<Support>(['free', 'pinned', 'roller', 'rollerX', 'fixed', 'guided', 'spring']);

export function emptySpatialModel(): SpatialModel {
  return {nodes: [], members: []};
}

function validPosition(point: Vec3) {
  return point && [point.x, point.y, point.z].every(n => Number.isFinite(n) && Math.abs(n) < 1e12);
}

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function nextId(items: {id: string}[], prefix: string) {
  const used = new Set(items.map(item => item.id));
  let number = items.length + 1;
  while (used.has(prefix + number)) number++;
  return prefix + number;
}

function validId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

function validKind(kind: unknown): kind is SpatialMember['kind'] {
  return kind === 'beam' || kind === 'strut';
}

export function validSpatialModel(value: unknown): value is SpatialModel {
  if (!value || typeof value !== 'object') return false;
  const {nodes, members} = value as SpatialModel;
  if (!Array.isArray(nodes) || !Array.isArray(members) || nodes.length > maxNodes || members.length > maxMembers) return false;
  const byId = new Map<string, SpatialNode>();
  const locations = new Set<string>();
  for (const node of nodes) {
    if (!validPosition(node) || !validId(node.id) || node.id==='@origin' || byId.has(node.id) || !jointTypes.has(node.joint) || !supportTypes.has(node.support)) return false;
    const location = JSON.stringify([node.x, node.y, node.z]);
    if (locations.has(location)) return false;
    locations.add(location);
    byId.set(node.id, node);
  }
  const memberIds = new Set<string>();
  const spans = new Set<string>();
  for (const member of members) {
    if (!member || !validId(member.id) || memberIds.has(member.id) || !validKind(member.kind)) return false;
    const a = byId.get(member.a), b = byId.get(member.b);
    if (!a || !b || distance(a, b) <= tolerance) return false;
    const span = JSON.stringify([a.id, b.id].sort());
    if (spans.has(span)) return false;
    spans.add(span);
    memberIds.add(member.id);
  }
  return validSpatialRules(value as SpatialModel) && validSpatialAnalysisInput(value as SpatialModel);
}

export function ensureSpatialNode(model: SpatialModel, point: Vec3): {model: SpatialModel; node: SpatialNode} {
  if (!validPosition(point)) throw Error('Enter finite X, Y and Z coordinates.');
  const existing = model.nodes.find(node => distance(point, node) <= tolerance);
  if (existing) return {model, node: existing};
  if (model.nodes.length >= maxNodes) throw Error(`The 3D model supports up to ${maxNodes} joints.`);
  const node: SpatialNode = {id: nextId(model.nodes, 'N'), x: point.x, y: point.y, z: point.z, joint: 'rigid', support: 'free'};
  return {model: {...model, nodes: [...model.nodes, node]}, node};
}

export function addSpatialMember(model: SpatialModel, start: Vec3, end: Vec3, kind: SpatialMember['kind']) {
  if (!validKind(kind)) throw Error('Choose Beam or Strut.');
  const a = ensureSpatialNode(model, start);
  const b = ensureSpatialNode(a.model, end);
  if (a.node.id === b.node.id) throw Error('Choose two distinct joints for the member.');
  const joined = splitMembersAtNode(splitMembersAtNode(b.model, a.node), b.node);
  if (joined.members.some(m => (m.a === a.node.id && m.b === b.node.id) || (m.a === b.node.id && m.b === a.node.id))) {
    throw Error('A member already joins these two joints.');
  }
  const nodes = new Map(joined.nodes.map(node => [node.id, node]));
  const onNewSpan = (id: string) => {
    const point = nodes.get(id)!;
    return distance(closestOnSpan(point, a.node, b.node), point) <= tolerance;
  };
  if (joined.members.some(member => onNewSpan(member.a) && onNewSpan(member.b))) throw Error('This member overlaps an existing span.');
  if (joined.members.length >= maxMembers) throw Error(`The 3D model supports up to ${maxMembers} members.`);
  const member: SpatialMember = {id: nextId(joined.members, 'B'), a: a.node.id, b: b.node.id, kind};
  return {model: {...joined, members: [...joined.members, member]}, member};
}

export function updateSpatialNode(model: SpatialModel, id: string, change: Partial<Omit<SpatialNode, 'id'>>): SpatialModel {
  const node = model.nodes.find(item => item.id === id);
  if (!node) throw Error('Select a joint in this model.');
  const updated = {...node, ...change, id};
  if (!validPosition(updated)) throw Error('Enter finite X, Y and Z coordinates.');
  if (!jointTypes.has(updated.joint) || !supportTypes.has(updated.support)) throw Error('Choose a listed joint and support type.');
  if (model.nodes.some(item=>item.id!==id && distance(item,updated)<=tolerance))
    throw Error('A joint already occupies that position.');
  const positioned = updated.x!==node.x || updated.y!==node.y || updated.z!==node.z
    ? moveConstrainedSpatialNode(model,id,updated) : model;
  const next = {...positioned,nodes:positioned.nodes.map(item=>item.id===id?{...item,...change,x:item.x,y:item.y,z:item.z,id}:item)};
  if (!validSpatialModel(next)) throw Error('The joint edit would create invalid geometry or properties.');
  return next;
}

export function updateSpatialMember(model: SpatialModel, id: string, change: Pick<SpatialMember, 'kind'>): SpatialModel {
  if (!model.members.some(item => item.id === id)) throw Error('Select a member in this model.');
  if (!validKind(change.kind)) throw Error('Choose Beam or Strut.');
  return {...model, members: model.members.map(item => item.id === id ? {...item, kind: change.kind} : item)};
}

export function removeSpatialMember(model: SpatialModel, id: string): SpatialModel {
  return cleanSpatialRules({...model, members:model.members.filter(item=>item.id!==id),
    ...(model.loads?{loads:model.loads.filter(load=>load.target!=='member'||load.targetId!==id)}:{})});
}

export function removeSpatialNode(model: SpatialModel, id: string): SpatialModel {
  const members=model.members.filter(item=>item.a!==id && item.b!==id);
  const remaining=new Set(members.map(b=>b.id));
  return cleanSpatialRules({...model, nodes:model.nodes.filter(node=>node.id!==id), members,
    ...(model.loads?{loads:model.loads.filter(load=>load.target==='node'?load.targetId!==id:remaining.has(load.targetId))}:{})});
}

function closestOnSpan(point: Vec3, a: Vec3, b: Vec3): Vec3 {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x-a.x)*dx + (point.y-a.y)*dy + (point.z-a.z)*dz) / (dx*dx + dy*dy + dz*dz)));
  return {x: a.x + t*dx, y: a.y + t*dy, z: a.z + t*dz};
}

/** For a real crossing, recover its 3D position independently of mouse precision. */
export function spatialMemberIntersection(a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 | null {
  const difference = (end: Vec3, start: Vec3) => ({x: end.x-start.x, y: end.y-start.y, z: end.z-start.z});
  const cross = (u: Vec3, v: Vec3) => ({x: u.y*v.z-u.z*v.y, y: u.z*v.x-u.x*v.z, z: u.x*v.y-u.y*v.x});
  const dot = (u: Vec3, v: Vec3) => u.x*v.x + u.y*v.y + u.z*v.z;
  const u = difference(b, a), v = difference(d, c), separation = difference(c, a);
  const normal = cross(u, v), denominator = dot(normal, normal);
  const lengthU = distance(a, b), lengthV = distance(c, d);
  if (lengthU <= tolerance || lengthV <= tolerance || denominator <= 1e-24 * lengthU**2 * lengthV**2) return null;
  const s = dot(cross(separation, v), normal) / denominator;
  const t = dot(cross(separation, u), normal) / denominator;
  if (s < -tolerance/lengthU || s > 1+tolerance/lengthU || t < -tolerance/lengthV || t > 1+tolerance/lengthV) return null;
  const p = {x: a.x + s*u.x, y: a.y + s*u.y, z: a.z + s*u.z};
  const q = {x: c.x + t*v.x, y: c.y + t*v.y, z: c.z + t*v.z};
  return distance(p, q) <= tolerance ? p : null;
}

export function placeSpatialJoint(model: SpatialModel, point: Vec3) {
  const {model: withJoint, node} = ensureSpatialNode(model, point);
  return {model: splitMembersAtNode(withJoint, node), node};
}

/** An explicit joint joins every member passing through the same position in space. */
export function insertSpatialJoint(model: SpatialModel, memberId: string, point: Vec3): {model: SpatialModel; node: SpatialNode} {
  const selected = model.members.find(member => member.id === memberId);
  if (!selected) throw Error('Select a member in this model.');
  if (!validPosition(point)) throw Error('Enter finite X, Y and Z coordinates.');
  const nodes = new Map(model.nodes.map(node => [node.id, node]));
  const projected = closestOnSpan(point, nodes.get(selected.a)!, nodes.get(selected.b)!);
  return placeSpatialJoint(model, projected);
}

function splitMembersAtNode(model: SpatialModel, node: SpatialNode): SpatialModel {
  const nodes = new Map(model.nodes.map(item => [item.id, item]));
  const halves: SpatialMember[] = [];
  const tails=new Map<string,string>();
  let loads=model.loads;
  const first = model.members.map(member => {
    if (member.a === node.id || member.b === node.id) return member;
    const a = nodes.get(member.a)!, b = nodes.get(member.b)!;
    if (distance(closestOnSpan(node, a, b), node) > tolerance) return member;
    const id=nextId([...model.members,...halves],'B'), family=member.family??nextId([...model.members,...halves].map(b=>({id:b.family??b.id})),'chain-');
    halves.push({...member,id,a:node.id,family});
    tails.set(member.id,id);
    loads=splitSpatialLoads(loads,member.id,id,distance(a,node)/distance(a,b));
    return {...member,b:node.id,family};
  });
  if (!halves.length) return model;
  if (first.length + halves.length > maxMembers) throw Error(`Splitting here would exceed the limit of ${maxMembers} members.`);
  const result = trackSpatialSplits({...model, members:[...first,...halves],...(loads?{loads}:{})},tails);
  if (!validSpatialModel(result)) throw Error('This joint would create overlapping member segments.');
  return result;
}
