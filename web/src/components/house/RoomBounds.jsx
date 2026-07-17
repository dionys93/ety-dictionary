// web/src/components/house/RoomBounds.jsx
import { useFrame } from '@react-three/fiber';
import { ROOM_WIDTH, ROOM_DEPTH, ROOM_STACK, roomSlotZ, WALL_HEIGHT, ROOM_BOUNDS_MARGIN } from './constants.js';

// Keeps the camera inside the current room's own walls once settled there.
// OrbitControls only constrains distance/angle from the orbit target, which
// says nothing about the room's actual box shape — plenty of valid
// distance/angle combinations still land the camera outside the room
// entirely (through a side wall, or into whichever room is stacked in
// front of or behind this one). This clamps the camera's actual world
// position to the current room's interior box every frame, after
// OrbitControls has applied its own update.
//
// Only active once settled (not `active` during a fly-through transition,
// which deliberately crosses room boundaries) and only for a real room
// (settledLocation not found in ROOM_STACK, e.g. EXTERIOR, does nothing).
export function RoomBounds({ controlsRef, settledLocation, active }) {
  useFrame(({ camera }) => {
    if (!active) return;
    const roomIndex = ROOM_STACK.indexOf(settledLocation);
    if (roomIndex === -1) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const centerZ = roomSlotZ(roomIndex);
    const minX = -ROOM_WIDTH / 2 + ROOM_BOUNDS_MARGIN;
    const maxX = ROOM_WIDTH / 2 - ROOM_BOUNDS_MARGIN;
    const minZ = centerZ - ROOM_DEPTH / 2 + ROOM_BOUNDS_MARGIN;
    const maxZ = centerZ + ROOM_DEPTH / 2 - ROOM_BOUNDS_MARGIN;
    const minY = ROOM_BOUNDS_MARGIN;
    const maxY = WALL_HEIGHT - ROOM_BOUNDS_MARGIN;

    const p = camera.position;
    const clampedX = Math.min(maxX, Math.max(minX, p.x));
    const clampedY = Math.min(maxY, Math.max(minY, p.y));
    const clampedZ = Math.min(maxZ, Math.max(minZ, p.z));

    if (clampedX !== p.x || clampedY !== p.y || clampedZ !== p.z) {
      p.set(clampedX, clampedY, clampedZ);
      controls.update();
    }
  });

  return null;
}