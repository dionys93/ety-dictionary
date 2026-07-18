// web/src/components/house/rooms.js
//
// THE file you edit to add, remove, or rearrange a room. Everything else —
// where each room sits, which walls it has, where its doorway is, the
// camera poses, the navigation graph, the roof's shape — is derived from
// this list. Nothing here imports anything; it's pure data, deliberately,
// so every derivation can depend on it without cycles.
//
// The rooms form a TREE, not a line: each room names its `parent` and which
// side of that parent it attaches to. The first entry has no parent — it's
// the one reached through the house's exterior front door.
//
// Per room:
//   id                - unique key, also its location id in navigation
//   label             - display name
//   width / depth     - its own footprint; rooms need not match each other
//   parent            - id of the room you pass through to reach it
//   attach            - which face of the parent it sits against:
//                       'back' (behind it) | 'right' | 'left'
//   doorway.offset    - where its doorway sits along the shared wall,
//                       measured from the room's own centre (0 = centred)
//   doorway.animation - which ANIMATIONS entry that doorway opens with
//   interiorWallColor - optional; walls and ceiling read this colour from
//                       inside, while the exterior siding still matches the
//                       rest of the house. Omit to just use the scheme.
//
// 'right' means right as seen FACING the house from the front, which is +X:
// the default camera sits at +Z looking toward -Z, so +X falls on its right.

export const ROOMS = [
  {
    id: 'livingRoom',
    label: 'Living Room',
    width: 3,
    depth: 2.5,
    doorway: { offset: 0, animation: 'swingDoorOut' }, // the exterior front door
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    width: 3,
    depth: 2.5,
    parent: 'livingRoom',
    attach: 'back',
    interiorWallColor: '#d4d4d4',
    doorway: { offset: -1.0, animation: 'swingDoorIn' },
  },
  {
    id: 'bathroom',
    label: 'Bathroom',
    width: 1.6,
    depth: 1.8,
    parent: 'livingRoom',
    attach: 'right',
    interiorWallColor: '#c8d5c8',
    doorway: { offset: 0, animation: 'swingDoorIn' },
  },
];