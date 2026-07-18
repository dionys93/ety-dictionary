// web/src/components/house/transitionWaypoints.js
//
// A camera transition can't fly the straight line between two rooms' resting
// poses — that line cuts through whatever wall is in the way, since a doorway
// is a narrow opening the poses know nothing about. So every transition
// routes through the doorway it actually passes through.
//
// Fully derived from the ROOMS tree. Any move is between a room and its
// parent, so the doorway crossed is always the child's own — no registry to
// keep in step, and no way to forget one.

import { parentOf, roomDoorway, DOORWAY_WAYPOINT_Y, EXTERIOR } from './constants.js';

export function transitionWaypoint(fromLocation, toLocation) {
  const child =
    parentOf(toLocation) === fromLocation ? toLocation :
    parentOf(fromLocation) === toLocation ? fromLocation :
    null;
  if (!child || child === EXTERIOR) return null;

  const { doorPosition } = roomDoorway(child);
  return { position: [doorPosition[0], DOORWAY_WAYPOINT_Y, doorPosition[2]] };
}