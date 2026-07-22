// web/src/components/house/transitionWaypoints.js
import { parentOf, roomDoorway, roomStair, DOORWAY_WAYPOINT_Y, EXTERIOR } from './constants.js';

export function transitionWaypoint(fromLocation, toLocation) {
  const child =
    parentOf(toLocation) === fromLocation ? toLocation :
    parentOf(fromLocation) === toLocation ? fromLocation :
    null;
  if (!child || child === EXTERIOR) return null;

  const stair = roomStair(child);
  if (stair) return { position: stair.waypoint };

  const doorway = roomDoorway(child);
  if (!doorway) return null;
  return { position: [doorway.doorPosition[0], DOORWAY_WAYPOINT_Y, doorway.doorPosition[2]] };
}