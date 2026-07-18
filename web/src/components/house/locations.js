// web/src/components/house/locations.js
//
// Every room's resting camera pose, derived from the ROOMS tree — a room
// added to rooms.js gets an entry here for free. 'exterior' isn't listed:
// it's the implicit root and uses EXTERIOR_CAMERA instead, since it isn't
// entered through a doorway.

import { ROOMS } from './rooms.js';
import { roomRect, entryFaceOf, CAMERA_EYE_HEIGHT } from './constants.js';

// Where the camera stands and looks, as fractions of the room's own extent
// along the axis it's entered from: stand back toward the doorway, look
// past the centre to the far side. Expressed as fractions rather than fixed
// distances so a small room (the bathroom) doesn't put the camera through
// its own wall — the values are exactly what the 2.5-deep rooms used before
// (0.8 and 0.6 of 2.5).
const EYE_BACK = 0.32;
const LOOK_AHEAD = 0.24;

// Unit vector pointing from a room's centre out through its own doorway.
const OUTWARD = {
  front: [0, 1],
  back: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

function roomCamera(id) {
  const rect = roomRect(id);
  const [ox, oz] = OUTWARD[entryFaceOf(id)];
  const extent = ox !== 0 ? rect.width : rect.depth;

  return {
    position: [
      rect.centerX + ox * EYE_BACK * extent,
      CAMERA_EYE_HEIGHT,
      rect.centerZ + oz * EYE_BACK * extent,
    ],
    target: [
      rect.centerX - ox * LOOK_AHEAD * extent,
      0.2,
      rect.centerZ - oz * LOOK_AHEAD * extent,
    ],
  };
}

export const LOCATIONS = Object.fromEntries(
  ROOMS.map((room) => [room.id, { label: room.label, camera: roomCamera(room.id) }])
);