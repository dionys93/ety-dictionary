// web/src/components/house/locations.js
import { ROOMS } from './constants.js';
import { roomRect, roomDoorway, roomStair, CAMERA_EYE_HEIGHT } from './constants.js';

const EYE_BACK = 0.32;
const LOOK_AHEAD = 0.24;

function roomCamera(id) {
  const rect = roomRect(id);
  const baseY = rect.baseY ?? 0;
  const doorway = roomDoorway(id);
  const stair = doorway ? null : roomStair(id);

  let out;
  if (doorway) {
    out = [Math.sin(doorway.rotationY), Math.cos(doorway.rotationY)];
  } else if (stair) {
    // Face from the stair opening across the room.
    const dx = rect.centerX - stair.overlapRect.centerX;
    const dz = rect.centerZ - stair.overlapRect.centerZ;
    const len = Math.hypot(dx, dz);
    out = len > 0.01 ? [-dx / len, -dz / len] : [0, 1];
  } else {
    out = [0, 1];
  }
  const extent = Math.abs(out[0]) > 0.5 ? rect.width : rect.depth;

  return {
    position: [
      rect.centerX + out[0] * EYE_BACK * extent,
      CAMERA_EYE_HEIGHT + baseY,
      rect.centerZ + out[1] * EYE_BACK * extent,
    ],
    target: [
      rect.centerX - out[0] * LOOK_AHEAD * extent,
      0.2 + baseY,
      rect.centerZ - out[1] * LOOK_AHEAD * extent,
    ],
  };
}

export const LOCATIONS = Object.fromEntries(
  ROOMS.map((room) => [room.id, { label: room.label, camera: roomCamera(room.id) }])
);