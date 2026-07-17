// web/src/components/house/rooms.js
//
// THE file you edit to add, remove, or reorder a room. Everything else —
// ROOM_STACK, LOCATIONS, camera waypoints, which walls exist, which
// doorway leads where — is derived from this list (see constants.js,
// locations.js, transitionWaypoints.js, HouseExplorer.jsx). Nothing here
// imports anything; it's pure data, deliberately, so every derivation can
// depend on it without cycles.
//
// Order is front-to-back: index 0 is the frontmost room, the one whose
// doorway is the house's exterior front door. Each later room sits directly
// behind the one before it and is reached through its doorway.
//
// Per room:
//   id                 - unique key, used as the location id in navigation
//   label              - display name
//   doorway.centerX    - where this room's doorway sits along its front
//                        wall's width (0 = centered)
//   doorway.animation  - which ANIMATIONS entry that doorway opens with
//   interiorWallColor  - optional; if set, this room's walls get a liner in
//                        this color on their inward faces, while their
//                        exterior siding still matches the house. Omit for
//                        a room that just uses the scheme's wall color.

export const ROOMS = [
  {
    id: 'livingRoom',
    label: 'Living Room',
    doorway: { centerX: 0, animation: 'swingDoorOut' },
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    interiorWallColor: '#d4d4d4',
    doorway: { centerX: -1.0, animation: 'swingDoorIn' },
  },
];