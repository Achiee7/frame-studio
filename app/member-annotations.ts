import {cadPoint, dimensionPoints, isMemberPointConstraint, lineProjection} from './model.ts';
import type {Beam, Model} from './model.ts';

// Dimensions retain the original endpoint IDs when a member is split.
// Match a split span by both geometry and connected segments of its beam family.
function usesSpan(model: Model, beam: Beam, start: string, end: string) {
 if (beam.a === start && beam.b === end || beam.a === end && beam.b === start) return true;
 const a = cadPoint(model, start), b = cadPoint(model, end);
 if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return false;

 const onSpan = (id: string) => {
  const p = lineProjection(a, b, cadPoint(model, id));
  return Math.abs(p.distance) < 1e-6 && p.along >= -1e-6 && p.along <= p.length + 1e-6;
 };
 if (!onSpan(beam.a) || !onSpan(beam.b)) return false;

 const adjacent = new Map<string, string[]>();
 for (const segment of model.beams) {
  if (segment.family !== beam.family || !onSpan(segment.a) || !onSpan(segment.b)) continue;
  adjacent.set(segment.a, [...(adjacent.get(segment.a) ?? []), segment.b]);
  adjacent.set(segment.b, [...(adjacent.get(segment.b) ?? []), segment.a]);
 }
 const connected = new Set([beam.a]);
 for (const id of connected) for (const neighbour of adjacent.get(id) ?? []) connected.add(neighbour);
 return connected.has(start) && connected.has(end);
}

export function memberAnnotations(model: Model, beam: Beam) {
 const isEndpoint = (id?: string) => id === beam.a || id === beam.b;
 const sketchConstraints = (model.sketchConstraints ?? []).filter(constraint => {
  if (isMemberPointConstraint(constraint)) {
   const reference = model.beams.find(member => member.id === constraint.b);
   return constraint.b === beam.id || isEndpoint(constraint.a)
    || !!(constraint.spanEnd && reference?.family === beam.family
      && usesSpan(model, beam, reference.a, constraint.spanEnd));
  }
  if (constraint.type === 'coincident' || constraint.scope === 'points') {
   return isEndpoint(constraint.a) || isEndpoint(constraint.b);
  }
  return constraint.a === beam.id || constraint.b === beam.id;
 });
 const continuityConstraints = (model.constraints ?? []).filter(constraint =>
  constraint.reference === beam.id || constraint.target === beam.id);
 const dimensions = (model.dimensions ?? []).filter(dimension => {
  if (dimension.kind === 'perpendicular') {
   return isEndpoint(dimension.c) || usesSpan(model, beam, dimension.a, dimension.b);
  }
  if (dimension.kind === 'angle') {
   return usesSpan(model, beam, dimension.a, dimension.b)
    || usesSpan(model, beam, dimension.c!, dimension.d!);
  }
  if (dimension.kind === 'length' || dimension.kind === 'direction') {
   return usesSpan(model, beam, dimension.a, dimension.b);
  }
  return dimensionPoints(dimension).some(isEndpoint);
 });
 const loads = model.loads.filter(load => load.beam === beam.id);
 return {sketchConstraints, continuityConstraints, dimensions, loads};
}
