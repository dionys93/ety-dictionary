// web/src/components/house/RoomBounds.jsx
import { useFrame } from '@react-three/fiber';
import { roomRect, roomById, WALL_HEIGHT, ROOM_BOUNDS_MARGIN } from './constants.js';

// Keeps the camera inside the current room's own walls once settled.
// OrbitControls only constrains distance and angle from the orbit target,
// which says nothing about the room's box shape — plenty of valid
// distance/angle combinations still land the camera through a wall or into
// the next room. This clamps the camera's actual world position to the
// room's interior box every frame, after OrbitControls has had its say.
//
// Reads the room's footprint from the tree, so a room of any size anywhere
// in the house is handled without this knowing the layout.
//
// Only active once settled — a transition deliberately crosses boundaries —
// and only for a real room, so EXTERIOR does nothing.
export function RoomBounds({ controlsRef, settledLocation, active }) {
  useFrame(({ camera }) => {
    if (!active || !roomById(settledLocation)) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const { centerX, centerZ, width, depth } = roomRect(settledLocation);
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    const p = camera.position;
    const x = clamp(p.x, centerX - width / 2 + ROOM_BOUNDS_MARGIN, centerX + width / 2 - ROOM_BOUNDS_MARGIN);
    const y = clamp(p.y, ROOM_BOUNDS_MARGIN, WALL_HEIGHT - ROOM_BOUNDS_MARGIN);
    const z = clamp(p.z, centerZ - depth / 2 + ROOM_BOUNDS_MARGIN, centerZ + depth / 2 - ROOM_BOUNDS_MARGIN);

    if (x !== p.x || y !== p.y || z !== p.z) {
      p.set(x, y, z);
      controls.update();
    }
  });

  return null;
}