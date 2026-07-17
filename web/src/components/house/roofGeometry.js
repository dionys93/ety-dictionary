// web/src/components/house/roofGeometry.js
//
// Shared roof-slope math. The roof panels (Roof.jsx), the perimeter walls
// (Room.jsx, Door.jsx, FrontFacade.jsx, InteriorDoorway.jsx), and the
// gable-end triangles (GableEnd.jsx) all derive their heights from these
// same functions, so none of them can drift out of sync with what the roof
// actually looks like — the walls and gable ends are guaranteed to meet the
// roof's real underside, not a hand-tuned guess at where it probably is.

export const ROOF_RISE = 0.8; // height gained from eave to ridge
export const ROOF_WIDTH_OVERHANG = 0.3; // how far the eave extends past the side walls
export const ROOF_DEPTH_OVERHANG = 0.15; // how far the eave extends past the front/back of the whole stack
export const ROOF_THICKNESS = 0.05;

// Distance from the ridge (x=0) to the eave, given the roof's total width.
export function roofRun(houseWidth) {
  return houseWidth / 2 + ROOF_WIDTH_OVERHANG;
}

// The roof's height above y=0 at a given distance x from the ridge,
// tracing the exact straight line the roof panels are built from: ridge at
// (0, eaveHeight + ROOF_RISE), eave at (run, eaveHeight).
export function roofHeightAtX(x, eaveHeight, houseWidth) {
  const run = roofRun(houseWidth);
  return (eaveHeight + ROOF_RISE) - (ROOF_RISE / run) * x;
}

// How tall the perimeter walls actually need to be to meet the roof's
// underside at the room's own edge (x = roomWidth / 2) — not the eave's
// overhang position, which sits further out. Used by every wall/door/
// facade component, and matches GableEnd.jsx's base-corner height exactly.
export function wallHeight(roomWidth, houseWidth, eaveHeight) {
  return roofHeightAtX(roomWidth / 2, eaveHeight, houseWidth);
}