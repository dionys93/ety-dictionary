// web/src/components/house/transitionWaypoints.js
//
// Some transitions can't just fly in a straight line between the two
// rooms' resting camera poses — if the poses are both centered but the
// actual doorway between them isn't (like the living room <-> kitchen
// doorway, which sits off to one side), a straight line cuts through solid
// wall instead of passing through the opening. This defines, for a given
// pair of locations, an intermediate point the camera should pass through
// first — null if the direct path is fine (most transitions).

import { INTERIOR_DOOR_X, roomSlotZ, ROOM_DEPTH } from './constants.js';

const INTERIOR_DOOR_Z = roomSlotZ(0) - ROOM_DEPTH / 2; // the living room/kitchen shared boundary
const WAYPOINT_Y = 0.75; // matches the rooms' own camera pose height

// Undirected — the same waypoint applies going either direction across a
// given boundary, so order doesn't matter.
function edgeKey(a, b) {
  return [a, b].sort().join('|');
}

const WAYPOINTS = {
  [edgeKey('livingRoom', 'kitchen')]: { position: [INTERIOR_DOOR_X, WAYPOINT_Y, INTERIOR_DOOR_Z] },
};

export function transitionWaypoint(fromLocation, toLocation) {
  return WAYPOINTS[edgeKey(fromLocation, toLocation)] ?? null;
}