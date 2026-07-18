// web/src/components/house/constants.js
//
// Everything derivable from the ROOMS tree in rooms.js, plus the few
// house-wide numbers that aren't about any one room. If a value describes a
// single room, it belongs in rooms.js, not here.

import { ROOMS } from './rooms.js';
import { WALL_HEIGHT } from './roofGeometry.js';

export { WALL_HEIGHT };

// "Not inside any room" — the root of the navigation tree.
export const EXTERIOR = 'exterior';

export const DOOR_WIDTH = 0.4;
export const DOOR_HEIGHT = 0.75; // shorter than the wall, leaving a header above
export const WALL_THICKNESS = 0.05;

export const GROUND_SIZE = 30;
export const GROUND_THICKNESS = 0.3;
export const LERP_SPEED = 0.08;

const byId = new Map(ROOMS.map((room) => [room.id, room]));
export function roomById(id) {
  return byId.get(id);
}

export function parentOf(locationId) {
  return byId.get(locationId)?.parent ?? EXTERIOR;
}

// The chain of rooms you pass through to reach `locationId`, outermost
// first — e.g. 'bathroom' -> ['livingRoom', 'bathroom']. This replaces the
// old depth-index arithmetic, which only worked while the rooms formed a
// single line. Returns [] for EXTERIOR.
export function pathTo(locationId) {
  const path = [];
  let id = locationId;
  while (id && id !== EXTERIOR) {
    path.unshift(id);
    id = parentOf(id);
  }
  return path;
}

// Two locations are adjacent if one is the other's parent — the only kind
// of move the UI can produce, and the only kind the camera knows how to fly.
export function areAdjacent(a, b) {
  return parentOf(a) === b || parentOf(b) === a;
}

// Which face of a room its own doorway sits in. A room attached BEHIND its
// parent is entered through its front; one attached to the parent's right
// is entered through its left; the root is entered through its front, from
// outside. So this is always the face pointing back toward the parent.
export function entryFaceOf(id) {
  const room = byId.get(id);
  if (!room?.parent) return 'front';
  return { back: 'front', right: 'left', left: 'right' }[room.attach];
}

const ALL_FACES = ['front', 'back', 'left', 'right'];

// Each face of a room runs along one axis over a 1D span. A room attached to
// this face opens through it, carving out an interval equal to that child's
// own extent along the face; whatever's left is solid wall. Returning the
// axis and span lets a single model handle a face that's fully solid, fully
// a doorway, or (the L-shape case) solid wall with an opening partway along
// it — which the old "a face is either wall or doorway" flag couldn't.
//
// A face's span is centered on the room and measured along:
//   front/back  -> X, width  = room.width   (position varies in X)
//   left/right  -> Z, depth  = room.depth    (position varies in Z)
function faceGeometry(id, face) {
  const rect = rects.get(id);
  const alongX = face === 'front' || face === 'back';
  const length = alongX ? rect.width : rect.depth;
  const center = alongX ? rect.centerX : rect.centerZ;
  return { axis: alongX ? 'x' : 'z', lo: center - length / 2, hi: center + length / 2 };
}

// The children that open through a given face of `id`, each with the
// interval it carves out (in the same axis/coordinate as faceGeometry).
function openingsOn(id, face) {
  return ROOMS
    .filter((child) => child.parent === id && child.attach === face)
    .map((child) => {
      const childRect = rects.get(child.id);
      const alongX = face === 'front' || face === 'back';
      const c = alongX ? childRect.centerX : childRect.centerZ;
      const half = (alongX ? childRect.width : childRect.depth) / 2;
      return { childId: child.id, lo: c - half, hi: c + half };
    });
}

// The solid wall segments of one face: the face span minus every child
// opening. Each segment is { lo, hi } in the face's axis coordinate. The
// root's own front face is excluded (it's the window facade + front door,
// placed separately). Returns [] for the entry face (that's the doorway back
// to the parent, also placed separately).
export function wallSegmentsOn(id, face) {
  if (face === entryFaceOf(id)) return [];
  const room = byId.get(id);
  if (!room.parent && face === 'front') return []; // root front = facade

  const { lo, hi } = faceGeometry(id, face);
  const cuts = openingsOn(id, face).sort((a, b) => a.lo - b.lo);
  const segments = [];
  let cursor = lo;
  for (const cut of cuts) {
    if (cut.lo > cursor) segments.push({ lo: cursor, hi: cut.lo });
    cursor = Math.max(cursor, cut.hi);
  }
  if (cursor < hi) segments.push({ lo: cursor, hi });
  return segments;
}

// The faces that carry any solid wall for this room (so callers can iterate
// faces, then segments within each). All four faces may qualify now, since a
// face with a child opening still has solid stubs beside it.
export function wallFacesOf(id) {
  return ALL_FACES.filter((face) => wallSegmentsOn(id, face).length > 0);
}

// Every room's footprint, resolved by walking down from the root. A room's
// position is entirely a consequence of its parent's position, its own
// size, and which side it attaches to — never written down by hand.
const rects = new Map();
for (const room of ROOMS) {
  if (!room.parent) {
    rects.set(room.id, { centerX: 0, centerZ: 0, width: room.width, depth: room.depth });
    continue;
  }
  const parent = rects.get(room.parent);
  if (!parent) throw new Error(`rooms.js: "${room.id}" lists parent "${room.parent}", which must appear before it`);
  const offsets = {
    back: { centerX: parent.centerX, centerZ: parent.centerZ - parent.depth / 2 - room.depth / 2 },
    right: { centerX: parent.centerX + parent.width / 2 + room.width / 2, centerZ: parent.centerZ },
    left: { centerX: parent.centerX - parent.width / 2 - room.width / 2, centerZ: parent.centerZ },
  };
  rects.set(room.id, { ...offsets[room.attach], width: room.width, depth: room.depth });
}
export function roomRect(id) {
  return rects.get(id);
}

// A room's doorway. Doorways are BUILT in local space — always lying in the
// local z=0 plane, spanning local x, with local +Z pointing back toward the
// parent — and then positioned and rotated into place by `wallCenter` and
// `rotationY`. That one convention makes the front door, a doorway to the
// room behind, and a doorway to a room on the side all the same component
// with no axis special-casing; the siding/liner convention falls out of it
// too, since local +Z is always the parent's side.
function localToWorld(wallCenter, rotationY, localX) {
  return [
    wallCenter[0] + localX * Math.cos(rotationY),
    0,
    wallCenter[2] - localX * Math.sin(rotationY),
  ];
}

export function roomDoorway(id) {
  const room = byId.get(id);
  const rect = rects.get(id);
  const face = entryFaceOf(id);
  const doorOffset = room.doorway.offset ?? 0;

  // The doorway (door + its immediate flanks) is sized to and centred on the
  // CHILD's own opening — the same interval wallSegmentsOn carves out of the
  // parent. Any extra parent wall beyond the child (the bump-out stubs) is
  // solid wall drawn by the parent, not part of this doorway. Built in local
  // space: lies in local z=0, spans local x, local +Z toward the parent.
  const wall = {
    front: { wallCenter: [rect.centerX, 0, rect.centerZ + rect.depth / 2], rotationY: 0, axis: 'z' },
    left: { wallCenter: [rect.centerX - rect.width / 2, 0, rect.centerZ], rotationY: -Math.PI / 2, axis: 'x' },
    right: { wallCenter: [rect.centerX + rect.width / 2, 0, rect.centerZ], rotationY: Math.PI / 2, axis: 'x' },
  }[face];

  return {
    ...wall,
    offset: doorOffset,
    doorPosition: localToWorld(wall.wallCenter, wall.rotationY, doorOffset),
  };
}

// The width of the wall the doorway component fills — the child's own extent
// along the shared face (its width for a front/back doorway, its depth for a
// side one). The parent's extra wall beyond this is solid stub, drawn by the
// parent via wallSegmentsOn, not by the doorway.
export function doorwayWallSpan(id) {
  const rect = rects.get(id);
  return entryFaceOf(id) === 'front' ? rect.width : rect.depth;
}

// The main column: the root and everything stacked behind it. The roof's
// principal gable runs over exactly this; anything attached to a side is a
// wing with its own roof.
export const MAIN_COLUMN = (() => {
  const column = [ROOMS[0].id];
  for (;;) {
    const next = ROOMS.find((room) => room.parent === column[column.length - 1] && room.attach === 'back');
    if (!next) return column;
    column.push(next.id);
  }
})();

export const WINGS = ROOMS.filter((room) => room.attach === 'right' || room.attach === 'left').map((room) => room.id);

const rootRect = rects.get(ROOMS[0].id);
const lastColumnRect = rects.get(MAIN_COLUMN[MAIN_COLUMN.length - 1]);
export const MAIN_COLUMN_WIDTH = rootRect.width;
export const FRONT_WALL_Z = rootRect.centerZ + rootRect.depth / 2;
export const HOUSE_BACK_Z = lastColumnRect.centerZ - lastColumnRect.depth / 2;
export const HOUSE_CENTER_Z = (FRONT_WALL_Z + HOUSE_BACK_Z) / 2;

// Eye height for a room's resting camera pose.
export const CAMERA_EYE_HEIGHT = 0.75;

// How far below a door's top edge the camera passes when going through it.
// The camera is not a point for clipping purposes: at fov 50 / near 0.1 its
// near plane reaches ~0.047 above the eye, so passing at exactly DOOR_HEIGHT
// puts part of the frustum inside the header and you see straight through it.
export const DOORWAY_CLEARANCE = 0.15;
export const DOORWAY_WAYPOINT_Y = DOOR_HEIGHT - DOORWAY_CLEARANCE;

export const EXTERIOR_CAMERA = { position: [5.5, 3.5, 8], target: [0.5, 0, -0.5] };
export const EXTERIOR_MIN_DISTANCE = 4;
export const EXTERIOR_MAX_DISTANCE = 16;

// Deliberately generous — what actually keeps the camera out of the walls
// is RoomBounds' box clamp, not this sphere. Keeping this tight would make
// the two constraints fight each other every frame.
export const INTERIOR_MIN_DISTANCE = 0.3;
export const INTERIOR_MAX_DISTANCE = 3.5;
export const ROOM_BOUNDS_MARGIN = 0.15;

// Transitions run on a fixed eased timeline, not an exponential chase.
export const TRANSITION_SPEED = 4.5;        // world units per second
export const TRANSITION_MIN_DURATION = 1.8; // seconds
export const TRANSITION_MAX_DURATION = 2.2; // seconds