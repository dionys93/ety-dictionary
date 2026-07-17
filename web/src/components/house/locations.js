// web/src/components/house/locations.js
//
// Every enterable room's resting camera pose, keyed by id. Derived entirely
// from ROOMS — adding a room to rooms.js gets it an entry here for free.
// 'exterior' isn't listed: it's the implicit root of the navigation chain
// and uses EXTERIOR_CAMERA from constants.js instead, since it isn't
// "entered" through a doorway the way a room is.

import { ROOMS } from './rooms.js';
import { roomSlotZ, CAMERA_EYE_HEIGHT } from './constants.js';

// Where the camera rests inside a room, relative to that room's own center
// along Z — stand back from center, look toward the far end.
const EYE_BACK_FROM_CENTER = 0.8;
const LOOK_FORWARD_OF_CENTER = -0.6;

function roomCamera(centerZ) {
  return {
    position: [0, CAMERA_EYE_HEIGHT, centerZ + EYE_BACK_FROM_CENTER],
    target: [0, 0.2, centerZ + LOOK_FORWARD_OF_CENTER],
  };
}

export const LOCATIONS = Object.fromEntries(
  ROOMS.map((room, index) => [
    room.id,
    { label: room.label, camera: roomCamera(roomSlotZ(index)) },
  ])
);