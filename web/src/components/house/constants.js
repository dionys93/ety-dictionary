// web/src/components/house/constants.js
//
// Shared numeric constants used across the house components, so a single
// source of truth defines the building's dimensions and the camera poses.

import { wallHeight } from './roofGeometry.js';

export const ROOM_WIDTH = 3;
export const ROOM_DEPTH = 2.5;

// Rooms stacked front-to-back behind the single exterior door. Index 0 is
// the frontmost room (the one with the exterior door, at the house's
// original position); each later room sits directly behind the one before
// it, reached through an interior doorway rather than its own exterior
// entrance. (A room beside this column — sharing the exterior wall, like a
// future bathroom — is a different kind of layout and isn't handled by this
// list; that's worth solving properly once there's a second real example of
// it, rather than guessing at a shared abstraction now.)
export const ROOM_STACK = ['livingRoom', 'kitchen'];

// Only one room wide for now — nothing sits beside the living room.
export const HOUSE_WIDTH = ROOM_WIDTH;
// Grows as rooms stack behind the front one.
export const HOUSE_DEPTH = ROOM_DEPTH * ROOM_STACK.length;

// This room's center along Z, given its position in ROOM_STACK (index 0 =
// frontmost, sitting exactly where the original single-room house was).
export function roomSlotZ(index) {
  return -ROOM_DEPTH * index;
}

// The roof's own reference eave height — the point its rise is measured
// from. Not the actual wall height; that's WALL_HEIGHT below. Only
// Roof.jsx (and roofGeometry.js's callers) need this one.
export const EAVE_HEIGHT = 1;

// What every wall, door header, and window facade actually builds to —
// tall enough that the walls meet the roof's real underside exactly (see
// roofGeometry.js), rather than stopping short and leaving a gap.
export const WALL_HEIGHT = wallHeight(ROOM_WIDTH, HOUSE_WIDTH, EAVE_HEIGHT);

export const DOOR_WIDTH = 0.4;
export const DOOR_HEIGHT = 0.75; // shorter than the wall so there's a header strip above it

// Where the interior doorway (living room <-> kitchen) sits along the
// shared wall's own width — off to the left rather than centered.
export const INTERIOR_DOOR_X = -1.0;

// The kitchen's walls specifically, regardless of which overall color
// scheme is active — a one-off per-room override, not a new named scheme,
// since it's about this specific room rather than the whole house's palette.
export const KITCHEN_WALL_COLOR = '#d4d4d4';

export const GROUND_SIZE = 30;
export const GROUND_THICKNESS = 0.3;

export const LERP_SPEED = 0.08;

// A single named constant for "not inside any room" — used as the initial
// settled location and as the root of the navigation chain.
export const EXTERIOR = 'exterior';

// Close to the original single-room camera — the house is back to being
// only ROOM_WIDTH wide, just deeper now that a room sits behind the front
// one. Worth adjusting further by eye once there's more depth to see.
export const EXTERIOR_CAMERA = { position: [5, 3.5, 7.5], target: [0, 0, -0.5] };
export const EXTERIOR_MIN_DISTANCE = 4;
export const EXTERIOR_MAX_DISTANCE = 16;

// Range used once settled inside any room. Deliberately generous — the
// real thing keeping the camera from bleeding through walls or into
// another room is RoomBounds.jsx's position clamp, not this distance
// range. If this were kept tight (like the single-room house's original
// 0.3-1.4), it would fight that clamp: OrbitControls re-derives its own
// distance/angle state from wherever the camera actually ends up each
// frame, so a tight sphere constraint and a box constraint that disagree
// would just oscillate between correcting each other.
export const INTERIOR_MIN_DISTANCE = 0.3;
export const INTERIOR_MAX_DISTANCE = 3.5;

// How far inside its own walls the camera is kept once settled — see
// RoomBounds.jsx.
export const ROOM_BOUNDS_MARGIN = 0.15;

export const CAMERA_LERP_SPEED = 0.045;
export const CAMERA_ARRIVE_EPSILON = 0.01;