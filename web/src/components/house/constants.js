// web/src/components/house/constants.js
//
// House-wide dimensions, plus everything derivable from the ROOMS list in
// rooms.js. If a value is about one specific room, it belongs in rooms.js,
// not here — this file is only for facts about the house as a whole and
// the functions that turn a room's index into its geometry.

import { wallHeight } from './roofGeometry.js';
import { ROOMS } from './rooms.js';

export const ROOM_WIDTH = 3;
export const ROOM_DEPTH = 2.5;

// Room ids in front-to-back order. Derived — add a room in rooms.js, not
// here. (A room *beside* this column, sharing the exterior wall like a
// future bathroom, is a different layout entirely and isn't modeled by this
// linear chain; the roof centering, HOUSE_WIDTH, the depth-based door
// logic, and RoomBounds all assume one column. Worth solving properly when
// a second layout actually exists, rather than guessing at a shared
// abstraction now.)
export const ROOM_STACK = ROOMS.map((room) => room.id);

// Only one room wide. Depth grows as rooms stack behind the front one.
export const HOUSE_WIDTH = ROOM_WIDTH;
export const HOUSE_DEPTH = ROOM_DEPTH * ROOMS.length;

// This room's center along Z. Index 0 is frontmost, sitting where the
// original single-room house was.
export function roomSlotZ(index) {
  return -ROOM_DEPTH * index;
}

// The Z of the wall plane at the FRONT of room `index` — i.e. the boundary
// you cross to enter it. This is the same fact whether the room is the
// frontmost one (in which case it's the house's exterior front wall) or
// deeper in the stack (in which case it's the interior boundary with the
// room ahead of it). Unifying those two cases is what lets doorways and
// camera waypoints be derived identically for every room.
export function roomFrontZ(index) {
  return roomSlotZ(index) + ROOM_DEPTH / 2;
}

// The house's own front and back planes. Exported so nothing else has to
// re-derive them from ROOM_DEPTH by hand — every past attempt at that
// silently went stale when ROOM_DEPTH changed.
export const FRONT_WALL_Z = roomFrontZ(0);
export const HOUSE_BACK_Z = roomSlotZ(ROOMS.length - 1) - ROOM_DEPTH / 2;
export const HOUSE_CENTER_Z = (FRONT_WALL_Z + HOUSE_BACK_Z) / 2;

// Depth of a location in the navigation chain: EXTERIOR = -1, ROOM_STACK[i]
// = i. Lets every door's open-state be computed the same way regardless of
// how deep it sits in the chain (see HouseExplorer's isDoorOpen).
export function depthOf(locationId) {
  if (locationId === EXTERIOR) return -1;
  return ROOM_STACK.indexOf(locationId);
}

// One step back toward the exterior — not always the exterior itself, since
// a room can be several hops in (kitchen -> livingRoom -> exterior).
export function parentOf(locationId) {
  const index = ROOM_STACK.indexOf(locationId);
  if (index <= 0) return EXTERIOR;
  return ROOM_STACK[index - 1];
}

// The roof's own reference eave height — the point its rise is measured
// from. Not the actual wall height; that's WALL_HEIGHT below.
export const EAVE_HEIGHT = 1;

// What every wall, door header, and window facade actually builds to —
// tall enough that the walls meet the roof's real underside exactly (see
// roofGeometry.js), rather than stopping short and leaving a gap.
export const WALL_HEIGHT = wallHeight(ROOM_WIDTH, HOUSE_WIDTH, EAVE_HEIGHT);

export const DOOR_WIDTH = 0.4;
export const DOOR_HEIGHT = 0.75; // shorter than the wall so there's a header strip above it

export const GROUND_SIZE = 30;
export const GROUND_THICKNESS = 0.3;

export const LERP_SPEED = 0.08;

// A single named constant for "not inside any room" — the initial settled
// location and the root of the navigation chain.
export const EXTERIOR = 'exterior';

// Eye height for a room's resting camera pose.
export const CAMERA_EYE_HEIGHT = 0.75;

// How far below a door's top edge the camera passes when going through it.
// The camera is not a point for clipping purposes: at fov 50 / near 0.1 its
// near plane reaches ~0.047 above the eye, so passing at exactly DOOR_HEIGHT
// puts part of the frustum inside the header and you see straight through
// it. This clearance keeps the whole frustum within the opening, with room
// to spare for the slight downward pitch during a pass.
export const DOORWAY_CLEARANCE = 0.15;
export const DOORWAY_WAYPOINT_Y = DOOR_HEIGHT - DOORWAY_CLEARANCE;

export const EXTERIOR_CAMERA = { position: [5, 3.5, 7.5], target: [0, 0, -0.5] };
export const EXTERIOR_MIN_DISTANCE = 4;
export const EXTERIOR_MAX_DISTANCE = 16;

// Range used once settled inside any room. Deliberately generous — the
// real thing keeping the camera from bleeding through walls or into
// another room is RoomBounds.jsx's position clamp, not this distance
// range. If this were kept tight, it would fight that clamp: OrbitControls
// re-derives its own distance/angle state from wherever the camera
// actually ends up each frame, so a tight sphere constraint and a box
// constraint that disagree would just oscillate correcting each other.
export const INTERIOR_MIN_DISTANCE = 0.3;
export const INTERIOR_MAX_DISTANCE = 3.5;

// How far inside its own walls the camera is kept once settled — see
// RoomBounds.jsx.
export const ROOM_BOUNDS_MARGIN = 0.15;

// Camera transitions run on a fixed, eased timeline rather than an
// exponential chase toward a moving goal. The chase approach eased OUT
// only, so every leg jolted from a standstill and then crept asymptotically
// into its destination — and with a doorway waypoint in the middle, that
// meant the camera nearly halted mid-flight before jolting off again.
// A single normalized progress value over the whole path, eased in AND out,
// accelerates and decelerates once and crosses the doorway at full speed.
//
// Duration scales with the path's actual length so a short hop between
// rooms doesn't take as long as a flight in from outside, clamped at both
// ends so it never feels either frantic or sluggish.
export const TRANSITION_SPEED = 4.5;        // world units per second
export const TRANSITION_MIN_DURATION = 1.8; // seconds
export const TRANSITION_MAX_DURATION = 2.2; // seconds