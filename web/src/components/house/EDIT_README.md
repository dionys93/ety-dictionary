# `components/house/`

This folder is the interactive house scene: exterior shell, front door, windows,
the interior room, and the camera choreography that flies you in and out. It's
split across 11 files, and a couple of pieces of state get passed through
several of them under names that don't fully disambiguate what they mean —
English only has so many words for "open," and none of them distinguish "a
boolean that's true or false" from "a place something moves to." This file
exists to fill that gap.

## What's in each file

| File | Exports | Owns |
|---|---|---|
| `constants.js` | `HOUSE_WIDTH/HEIGHT/DEPTH`, `DOOR_WIDTH/HEIGHT`, `GROUND_SIZE/THICKNESS`, `LERP_SPEED`, `EXTERIOR_CAMERA`, `INTERIOR_CAMERA`, `CAMERA_LERP_SPEED`, `CAMERA_ARRIVE_EPSILON`, `VIEW_MODE` | Every shared number and the camera poses. Single source of truth — nothing else redefines these. |
| `Siding.jsx` | `Siding`, `WallSegment` | The horizontal board-strip geometry, and the "flat wall + its siding, sharing one position" pairing. |
| `Window.jsx` | `Window`, `WallWithWindow` | The glass pane, and a wall with a real rectangular hole cut into it (built from 4 `WallSegment`s around the opening). |
| `FrontFacade.jsx` | `FrontFacade` | The two static wall segments flanking the door, each using `WallWithWindow`. |
| `WallPanel.jsx` | `WallPanel` | One door leaf: the mesh, its doorknob, and the per-frame animation loop. |
| `Wall.jsx` | `Wall` | Looks up an animation by name from the `ANIMATIONS` registry and renders however many `WallPanel`s it returns. Generic — not specific to the front door. |
| `Door.jsx` | `Door` | The specific composition: a fixed header (still wall) above a `Wall` sized to `DOOR_WIDTH`/`DOOR_HEIGHT`. |
| `Room.jsx` | `Room` | Floor + back/left/right walls (via `WallSegment`) + the placeholder item. |
| `Ground.jsx` | `Ground` | The grass slab everything sits on. |
| `Roof.jsx` | `Roof` | The shingle-textured cone. |
| `CameraRig.jsx` | `CameraRig` | Flies the camera between exterior and interior poses. Lives inside the `<Canvas>` since it needs `useFrame`. |

`HouseExplorer.jsx` (one level up, not in this folder) is the only thing that
imports from all of these — it owns the top-level state and assembles the
scene.

## The "open" problem

There are two unrelated things in this codebase both called some form of
"open," and they get passed through the same components:

| Name | Where | Type | Means |
|---|---|---|---|
| `doorOpen` | `HouseExplorer.jsx` | `boolean` | Is the door currently open. |
| `open` | prop on `Door`, `Wall` | `boolean` | Same value, just renamed at each hop. |
| `isOpen` | prop on `WallPanel` | `boolean` | Same value again — deliberately renamed here so it doesn't collide with... |
| `open` | field on a panel descriptor (from `ANIMATIONS`) | `{ position: [x,y,z], rotation: number }` | **Not a boolean.** Where this specific leaf should sit *when* it's open. |
| `closed` | same descriptor | `{ position, rotation }` | Where it sits when closed. |

`Wall.jsx` is where both meanings meet in the same line:

```jsx
{panels.map((panel, i) => (
  <WallPanel key={i} {...panel} isOpen={open} onToggle={onToggle} colors={colors} />
))}
```

`{...panel}` spreads `size`, `pivot`, `closed`, and `open` — that `open` is the
*transform*, from whichever animation function ran in `ANIMATIONS[animation](...)`.
Right after, `isOpen={open}` explicitly passes `Wall`'s own `open` prop — the
*boolean* — under a different name. If both were spread onto the element as
`open`, the boolean would silently clobber the transform (or vice versa,
depending on JSX attribute order). The rename is the whole fix.

Inside `WallPanel.jsx`, this is the line that actually uses both meanings at once:

```jsx
const target = isOpen ? open : closed;
```

Read literally: "if the boolean says open, chase the open-transform; otherwise
chase the closed-transform."

## How a door leaf actually animates

There's no `playAnimation()` call anywhere. Instead:

1. Clicking a leaf (or the exit arrow, in `HouseExplorer.jsx`) calls `toggleDoor()`, which flips `doorOpen`.
2. That boolean is threaded down as a prop — renamed to `isOpen` along the way — through `Door` → `Wall` → `WallPanel`. None of the components in between do anything with it except forward it.
3. `WallPanel`'s `useFrame` hook runs on *every rendered frame, unconditionally*. Each frame it picks `target = isOpen ? open : closed` and nudges the panel's position/rotation a fraction of the way toward it, via `lerpVec3` (`utils/lerp.js`).

So "the animation" is really just a continuous per-frame comparison chasing
whichever boolean value currently exists — not a discrete event. That's also
why reversing it is free: flip the boolean, and the same loop starts chasing
the other target next frame.

## Where `ANIMATIONS` is actually used

Exactly one place: `Wall.jsx`.

```js
import { ANIMATIONS } from '../../utils/animations.js';
...
const panels = ANIMATIONS[animation](width, height, thickness);
```

`ANIMATIONS` itself lives in `utils/animations.js` (outside this folder) and
is never imported anywhere else — not in `WallPanel.jsx` (it only ever
receives already-resolved `closed`/`open` transforms as props), not in
`Door.jsx`, not in the top-level `HouseExplorer.jsx`.

The animation *name* (`'swingDoorOut'`, etc.) isn't set in `HouseExplorer.jsx`
either — it falls through `Door.jsx`'s own default parameter
(`animation = 'swingDoorOut'`), since `HouseExplorer` renders `<Door>` without
passing one. To change the default door style, change that default in
`Door.jsx` (or pass `<Door animation="...">` explicitly) — not `Wall.jsx`,
even though that's where the registry is actually read.

Currently registered, in `utils/animations.js`: `slideDown`, `doubleDoors`,
`swingDoorsIn`, `swingDoorsOut`, `swingDoorIn`, `swingDoorOut`. The `s`-plural
ones are two-leaf French-door style — not currently used by the active house,
kept around for a grander entrance later (a mansion, say).

## How the camera knows to fly in

`toggleDoor()` flips two pieces of state in the same call: `doorOpen` (above)
and `viewMode`, one of the `VIEW_MODE` constants (`EXTERIOR`, `ENTERING`,
`INTERIOR`, `EXITING`). `CameraRig.jsx` watches `viewMode`: while it's
`ENTERING` or `EXITING`, its own `useFrame` eases the camera position and the
orbit-controls target toward `INTERIOR_CAMERA` or `EXTERIOR_CAMERA`
(`constants.js`) every frame, the same `lerpVec3` pattern as the door leaf.
Once it's within `CAMERA_ARRIVE_EPSILON`, it calls back to settle `viewMode`
into `INTERIOR` or `EXTERIOR`.

One easy-to-miss subtlety, documented where it's used in `HouseExplorer.jsx`:
`OrbitControls` clamps distance and polar angle every frame in its own
internal `update()`, regardless of its `enabled` prop — `enabled` only gates
new pointer input, not the clamp. So the distance/angle constraints have to
already be wide open *during* `ENTERING`/`EXITING`, not just once settled, or
the camera physically can't reach the interior pose and gets stuck. This was
a real bug once — see the constraint logic in `HouseExplorer.jsx` for the fix.

## Color schemes

`colors` is a single object threaded as a prop through nearly everything here
(`Room`, `Roof`, `Ground`, `Door`/`Wall`/`WallPanel`, `FrontFacade`/
`WallWithWindow`/`Siding`/`WallSegment`). It comes from `COLOR_SCHEMES` in
`utils/houseColors.js`. Every scheme must define the same 8 keys: `wall`,
`wallHover`, `floor`, `roof`, `item`, `door`, `doorHover`, `ground`. Currently:
`robinsEgg` (default), `sunset`, `monochrome`.

## Known rough edges

- The camera's fly-in/out path is a straight line between the two poses, not
  path-planned around geometry — it should thread the doorway fine given
  where the numbers land, but isn't guaranteed to avoid grazing wall edges if
  the poses ever move.
- The two-leaf `swingDoorsIn`/`swingDoorsOut` hinge points sit at the same x
  as the room's side walls, so a fully-open two-leaf door could visually
  z-fight the side wall. Currently moot since the active default is
  single-leaf, but worth knowing if `doubleDoors`-style animations get used.
- While `viewMode === 'interior'`, the bottom ~22% of the canvas is a
  transparent hover-zone reserved for revealing the exit arrow — normal
  orbit-drag won't register if it starts in that strip.
- `Wall.jsx` was deliberately kept generic (any width/height/animation/
  position) so it's reusable for a second opening later, but nothing composes
  a second one yet.

## Extending this

- **New animation style**: add an entry to `ANIMATIONS` in `utils/animations.js`. Nothing here needs to change unless you also want it to be the default (`Door.jsx`'s `animation` parameter).
- **New color scheme**: add an object with the same 8 keys to `COLOR_SCHEMES` in `utils/houseColors.js`.
- **Another window or wall-with-a-hole**: reuse `WallWithWindow`/`WallSegment` rather than hand-rolling new mesh pairs.
- **Clickable room items** (the actual next step toward the vocabulary feature): not built yet. `Room.jsx`'s placeholder item is the only thing currently sitting in the room — it isn't interactive.