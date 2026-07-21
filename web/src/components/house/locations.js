// web/src/components/house/locations.js
//
// Every room's resting camera pose, derived from its footprint and its own
// doorway: stand back from the room's centre toward the door, look past the
// centre at the far side. The outward direction comes straight from the
// doorway's orientation (local +Z points out through the door), so a room
// entered from any side gets a sensible pose with no per-face tables.

import { ROOMS } from './constants.js';
import { roomRect, roomDoorway, CAMERA_EYE_HEIGHT } from './constants.js';

const EYE_BACK = 0.32;   // fraction of the room's extent along the entry axis
const LOOK_AHEAD = 0.24;

function roomCamera(id) {
  const rect = roomRect(id);
  const doorway = roomDoorway(id);
  // local +Z of the doorway = out through the door, toward the parent.
  const out = [Math.sin(doorway.rotationY), Math.cos(doorway.rotationY)];
  const extent = Math.abs(out[0]) > 0.5 ? rect.width : rect.depth;

  return {
    position: [
      rect.centerX + out[0] * EYE_BACK * extent,
      CAMERA_EYE_HEIGHT,
      rect.centerZ + out[1] * EYE_BACK * extent,
    ],
    target: [
      rect.centerX - out[0] * LOOK_AHEAD * extent,
      0.2,
      rect.centerZ - out[1] * LOOK_AHEAD * extent,
    ],
  };
}

export const LOCATIONS = Object.fromEntries(
  ROOMS.map((room) => [room.id, { label: room.label, camera: roomCamera(room.id) }])
);