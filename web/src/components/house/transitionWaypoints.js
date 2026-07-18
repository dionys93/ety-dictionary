// web/src/components/house/transitionWaypoints.js
//
// A camera transition between two locations can't just fly the straight
// line between their resting poses — that line cuts through whatever solid
// wall happens to be in the way, since a doorway is a narrow opening and
// the poses know nothing about it. So every transition routes through the
// doorway it's actually passing through.
//
// This used to be a hand-maintained registry of "which edges need a
// waypoint," which meant remembering to add one whenever a doorway wasn't
// centered — and forgetting meant flying through a wall. It's all derived
// from ROOMS now: a doorway's position is already in the descriptor, and
// generating a waypoint unconditionally costs nothing for a centered door
// (its waypoint lies on the direct path anyway) while removing the entire
// class of "forgot to register one" bugs.

import { ROOMS } from './rooms.js';
import { roomFrontZ, depthOf, DOORWAY_WAYPOINT_Y } from './constants.js';

// The transition between `from` and `to` crosses exactly one boundary: the
// front of whichever location is deeper into the house. Going in or coming
// back out crosses the same doorway, so direction doesn't matter.
export function transitionWaypoint(fromLocation, toLocation) {
  const deeperIndex = Math.max(depthOf(fromLocation), depthOf(toLocation));
  if (deeperIndex < 0) return null; // exterior to exterior — no boundary crossed

  const room = ROOMS[deeperIndex];
  if (!room) return null;

  return {
    position: [room.doorway.centerX, DOORWAY_WAYPOINT_Y, roomFrontZ(deeperIndex)],
  };
}