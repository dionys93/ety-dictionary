// web/src/components/house/rooms.js
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │  THIS IS THE FILE YOU EDIT TO CHANGE THE HOUSE.                        │
// └──────────────────────────────────────────────────────────────────────┘
//
// The house is a grid of square cells. You draw the floor plan directly:
// each entry in the grid is a room's block (or `_` for empty space). Where
// two of the SAME room's blocks touch, they merge into one open room; where
// two DIFFERENT rooms touch, a wall appears between them; and any block on
// the outer edge gets an exterior wall. You never place a wall yourself —
// walls are entirely a consequence of the grid.
//
// Reading the grid: the FIRST row is the BACK of the house, the LAST row is
// the FRONT (nearest the camera). Left-to-right in a row is left-to-right as
// you face the house. Rows can be different lengths; a short row just means
// empty space in the missing columns.
//
// Doors and items aren't blocks — a door is a gap in the wall BETWEEN two
// rooms, and an item is an object sitting INSIDE a room — so they're small
// separate lists below the grid.

import { defineRoom, EMPTY } from './blocks.js';

// One cell = this many world units on a side. Rooms are whole numbers of
// cells, so their real sizes are multiples of this.
export const CELL = 0.5;

// ── 1. The rooms: a letter, a name, and the colour seen from inside. ──
const K = defineRoom({ key: 'kitchen', name: 'Kitchen', color: '#d4d4d4' });
const L = defineRoom({ key: 'livingRoom', name: 'Living Room' }); // no color = house default
const B = defineRoom({ key: 'bathroom', name: 'Bathroom', color: '#c8d5c8' });
const _ = EMPTY;

// ── 2. The floor plan. Back row first, front row last. ──
export const GROUND_FLOOR = [
  [K, K, K, K, K, K],
  [K, K, K, K, K, K],
  [K, K, K, K, K, K],
  [K, K, K, K, K, K],
  [K, K, K, K, K, K],
  [L, L, L, L, B, B],
  [L, L, L, L, B, B],
  [L, L, L, L, B, B],
  [L, L, L, L, B, B],
  [L, L, L, L, B, B],
];

// ── 3. Doors. Each names the two rooms it joins ('outside' is a place). ──
export const DOORS = [
  { between: ['outside', 'livingRoom'], side: 'front', swing: 'out' },
  { between: ['livingRoom', 'kitchen'], swing: 'in' },
  { between: ['livingRoom', 'bathroom'], side: 'left', swing: 'in' },
];

// ── 4. Items. Each names its room and a spot inside it. ──
export const ITEMS = [
  // { type: 'toilet', room: 'bathroom', spot: 'back-left' },
  // { type: 'bathShower', room: 'bathroom', spot: 'right-wall' },
];