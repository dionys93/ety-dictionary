// web/src/components/house/constants.js
//
// The public shelf. Everything the rest of the app reads about the house is
// exported here. The actual work — turning the rooms.js grid into walls,
// doorways, footprints, and navigation — is done once by the engine in
// grid-engine.js; this file just calls it and lays the results out as a flat
// list of named exports, so it reads like a table of contents.
//
// You edit rooms.js. You never need to edit this file or the engine.

import { GROUND_FLOOR, DOORS, FIXTURES, CELL } from './rooms.js';
import { isRoom } from './blocks.js';
import { WALL_HEIGHT } from './roofGeometry.js';
import { EXTERIOR } from './grid-shared.js';
import {
  makeGrid, readRooms, measureGrid, makeCoords,
  findFootprints, findWalls, buildNavigation, placeDoorways, placeFixtures,
} from './grid-engine.js';

export { CELL, DOORS, FIXTURES, WALL_HEIGHT, EXTERIOR };

// ── House-wide dimensions (not derived from the grid) ─────────────────────
export const DOOR_WIDTH = 0.4;
export const DOOR_HEIGHT = 0.75;
export const WALL_THICKNESS = 0.05;
export const GROUND_SIZE = 30;
export const GROUND_THICKNESS = 0.3;
export const LERP_SPEED = 0.08;

// The front wall of the main body sits here in world Z; the engine shifts the
// whole grid so this stays put no matter how many rows you add at the back.
const FRONT_WALL_Z_TARGET = 1.25;

// ── Run the engine once ───────────────────────────────────────────────────
const grid = makeGrid(GROUND_FLOOR, isRoom);
const coords = makeCoords(CELL, measureGrid(grid, CELL, FRONT_WALL_Z_TARGET));

const rooms = readRooms(grid);
const footprints = findFootprints(grid);
const walls = findWalls(grid, coords);
const nav = buildNavigation(DOORS, rooms);
const doorways = placeDoorways(DOORS, walls, nav, CELL, DOOR_WIDTH);

// ── Rooms ─────────────────────────────────────────────────────────────────
export const ROOMS = rooms;
const roomsById = new Map(rooms.map((r) => [r.id, r]));
export const roomById = (id) => roomsById.get(id);

export function roomRect(id) {
  const box = footprints.get(id);
  if (!box) return undefined;
  return {
    centerX: (coords.xEdge(box.colLo) + coords.xEdge(box.colHi)) / 2,
    centerZ: (coords.zEdge(box.rowLo) + coords.zEdge(box.rowHi)) / 2,
    width: (box.colHi - box.colLo) * CELL,
    depth: (box.rowHi - box.rowLo) * CELL,
  };
}

// ── Walls & doorways ──────────────────────────────────────────────────────
export const DOORWAYS = doorways;
export const roomDoorway = (id) => doorways.find((d) => d.child === id);
export const SOLID_WALL_RUNS = walls.filter((run) => !doorways.some((d) => d.run === run));

export function sideColor(spaceId, colors) {
  if (spaceId === EXTERIOR) return colors.wall;
  return roomsById.get(spaceId)?.interiorWallColor ?? colors.wall;
}

// ── Navigation (thin re-exports of the engine's graph) ────────────────────
export const parentOf = nav.parentOf;
export const pathTo = nav.pathTo;
export const areAdjacent = nav.areAdjacent;
export const depthOf = nav.depthOf;

// ── Roof extents ──────────────────────────────────────────────────────────
// The roof is one gable over the WHOLE filled footprint — no "main body" or
// "wings". We take the bounding box of every room's cells and put a single
// ridge down its longer axis; the roof covers everything inside that box.
// This means where a room sits (a bathroom in any corner, a bump-out, an
// L-shape) never reshapes the roof: it always just covers the footprint.
// The old main-column/wing detection tried to infer the house's "shape" and
// broke when a room didn't leave an obvious rectangular core — a whole class
// of bug that simply can't happen here.
export const ROOT_ID = doorways.find((d) => d.isExterior).child;

const footprintBox = [...footprints.values()].reduce(
  (box, b) => ({
    colLo: Math.min(box.colLo, b.colLo),
    colHi: Math.max(box.colHi, b.colHi),
    rowLo: Math.min(box.rowLo, b.rowLo),
    rowHi: Math.max(box.rowHi, b.rowHi),
  }),
  { colLo: Infinity, colHi: -Infinity, rowLo: Infinity, rowHi: -Infinity }
);

// The footprint's outer edges in world space, and its two spans.
export const HOUSE_LEFT_X = coords.xEdge(footprintBox.colLo);
export const HOUSE_RIGHT_X = coords.xEdge(footprintBox.colHi);
export const FRONT_WALL_Z = coords.zEdge(footprintBox.rowHi);
export const HOUSE_BACK_Z = coords.zEdge(footprintBox.rowLo);
export const HOUSE_CENTER_X = (HOUSE_LEFT_X + HOUSE_RIGHT_X) / 2;
export const HOUSE_CENTER_Z = (FRONT_WALL_Z + HOUSE_BACK_Z) / 2;

const houseWidth = HOUSE_RIGHT_X - HOUSE_LEFT_X;   // extent across X
const houseDepth = FRONT_WALL_Z - HOUSE_BACK_Z;    // extent across Z

// Ridge runs along the LONGER axis, so the slopes fall across the shorter
// one (a normal gable). 'z' = ridge front-to-back, slopes fall in X.
export const RIDGE_AXIS = houseDepth >= houseWidth ? 'z' : 'x';
// The width the gable spans (the short axis the slopes cover) and the ridge
// length (the long axis it runs along).
export const GABLE_SPAN = Math.min(houseWidth, houseDepth);
export const RIDGE_LENGTH = Math.max(houseWidth, houseDepth);

// Kept for anything still importing it (camera framing): the main body width
// is now just the footprint's X extent.
export const MAIN_COLUMN_WIDTH = houseWidth;

// ── Fixtures ──────────────────────────────────────────────────────────────
export const PLACED_FIXTURES = placeFixtures(FIXTURES, roomRect);

// ── Camera ────────────────────────────────────────────────────────────────
export const CAMERA_EYE_HEIGHT = 0.75;
export const DOORWAY_CLEARANCE = 0.15;
export const DOORWAY_WAYPOINT_Y = DOOR_HEIGHT - DOORWAY_CLEARANCE;

export const EXTERIOR_CAMERA = { position: [5.5, 3.5, 8], target: [0.5, 0, -0.5] };
export const EXTERIOR_MIN_DISTANCE = 4;
export const EXTERIOR_MAX_DISTANCE = 16;

export const INTERIOR_MIN_DISTANCE = 0.3;
export const INTERIOR_MAX_DISTANCE = 3.5;
export const ROOM_BOUNDS_MARGIN = 0.15;

export const TRANSITION_SPEED = 4.5;
export const TRANSITION_MIN_DURATION = 1.8;
export const TRANSITION_MAX_DURATION = 2.2;