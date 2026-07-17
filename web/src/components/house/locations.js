// web/src/components/house/locations.js
//
// Every enterable room, keyed by id, with the camera pose used once you're
// inside it. 'exterior' isn't listed here — it's the implicit starting
// point and uses EXTERIOR_CAMERA from constants.js instead.
//
// Same registry pattern as ANIMATIONS and COLOR_SCHEMES: HouseExplorer.jsx
// never needs to change to support a new room, just this file (plus adding
// the id to ROOM_STACK in constants.js, in the right front-to-back order).

import { roomSlotZ } from './constants.js';

// A room's interior camera pose, expressed relative to the room's own
// center along Z — so a new room's pose is just picking which slot it's in.
function roomCamera(centerZ) {
  return {
    position: [0, 0.75, centerZ + 0.8],
    target: [0, 0.2, centerZ - 0.6],
  };
}

export const LOCATIONS = {
  livingRoom: { label: 'Living Room', camera: roomCamera(roomSlotZ(0)) },
  kitchen: { label: 'Kitchen', camera: roomCamera(roomSlotZ(1)) },
};