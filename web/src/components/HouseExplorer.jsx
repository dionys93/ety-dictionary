// web/src/components/HouseExplorer.jsx
import { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { COLOR_SCHEMES } from '../utils/houseColors.js';
import { Roof } from './house/Roof.jsx';
import { Ground } from './house/Ground.jsx';
import { GroundFloorRoom } from './house/GroundFloorRoom.jsx';
import { Room } from './house/Room.jsx';
import { InteriorDoorway } from './house/InteriorDoorway.jsx';
import { GableEnd } from './house/GableEnd.jsx';
import { CameraRig } from './house/CameraRig.jsx';
import { RoomBounds } from './house/RoomBounds.jsx';
import {
  ROOM_STACK,
  ROOM_WIDTH,
  roomSlotZ,
  ROOM_DEPTH,
  HOUSE_WIDTH,
  HOUSE_DEPTH,
  EAVE_HEIGHT,
  INTERIOR_DOOR_X,
  KITCHEN_WALL_COLOR,
  EXTERIOR,
  EXTERIOR_CAMERA,
  EXTERIOR_MIN_DISTANCE,
  EXTERIOR_MAX_DISTANCE,
  INTERIOR_MIN_DISTANCE,
  INTERIOR_MAX_DISTANCE,
} from './house/constants.js';

// Depth of a location in the navigation chain: EXTERIOR = -1, ROOM_STACK[i]
// = i. Lets every door's open-state be computed the same way regardless of
// how deep it sits in the chain (see isDoorOpen below).
function depthOf(locationId) {
  if (locationId === EXTERIOR) return -1;
  return ROOM_STACK.indexOf(locationId);
}

export default function HouseExplorer({ colorScheme = 'robinsEgg' }) {
  const colors = COLOR_SCHEMES[colorScheme];
  const controlsRef = useRef();

  // Where we're actually settled (not mid-flight): EXTERIOR or a room id.
  const [settledLocation, setSettledLocation] = useState(EXTERIOR);
  // Where we're flying toward, or null if not transitioning.
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [showExitArrow, setShowExitArrow] = useState(false);

  const isTransitioning = transitionTarget !== null;
  const isInterior = (isTransitioning ? transitionTarget : settledLocation) !== EXTERIOR;

  // The door leading into ROOM_STACK[doorIndex] should be open whenever
  // we're settled at, or transitioning to/from, that room OR anything
  // further into the house than it. Just checking "is this room involved
  // in the current transition" would false-positive on an outer door (like
  // the front door) during a move between two rooms further down the
  // chain (e.g. kitchen <-> a future room behind it) — this depth check
  // avoids that regardless of how deep the chain gets.
  const isDoorOpen = (doorIndex) => {
    const settledDepth = depthOf(settledLocation);
    const targetDepth = isTransitioning ? depthOf(transitionTarget) : -Infinity;
    return settledDepth >= doorIndex || targetDepth >= doorIndex;
  };

  const goTo = (locationId) => {
    if (isTransitioning) return; // ignore clicks mid-flight
    setTransitionTarget(locationId);
  };

  const handleArrived = (locationId) => {
    setSettledLocation(locationId);
    setTransitionTarget(null);
  };

  // One step back toward the exterior from wherever we're currently
  // settled — not always the exterior directly, since a room can be
  // several hops in (kitchen -> livingRoom -> exterior).
  const parentOf = (locationId) => {
    const index = ROOM_STACK.indexOf(locationId);
    if (index <= 0) return EXTERIOR;
    return ROOM_STACK[index - 1];
  };

  // The room stack's own Z-midpoint, for centering the roof over it —
  // simplifies to half the last room's slot, since the frontmost room's
  // front edge never moves.
  const roofCenterZ = roomSlotZ(ROOM_STACK.length - 1) / 2;

  return (
    <div style={{ width: '100%', height: '600px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
      <Canvas camera={{ position: EXTERIOR_CAMERA.position, fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />

        <Ground colors={colors} />
        <Roof colors={colors} houseWidth={HOUSE_WIDTH} houseDepth={HOUSE_DEPTH} centerZ={roofCenterZ} />

        {/* Gable-end triangles closing the roof at the very front and back
            of the stack — without these, the triangular space under the
            ridge is completely open at both ends. */}
        <GableEnd colors={colors} roomWidth={ROOM_WIDTH} houseWidth={HOUSE_WIDTH} eaveHeight={EAVE_HEIGHT} z={ROOM_DEPTH / 2} />
        <GableEnd colors={colors} roomWidth={ROOM_WIDTH} houseWidth={HOUSE_WIDTH} eaveHeight={EAVE_HEIGHT} z={roomSlotZ(ROOM_STACK.length - 1) - ROOM_DEPTH / 2} />

        {/* Living room: the one exterior-facing room. Its back wall is
            replaced by the interior doorway to the kitchen below it. */}
        <GroundFloorRoom
          colors={colors}
          hasBackWall={false}
          open={isDoorOpen(0)}
          onToggle={() => goTo(settledLocation === 'livingRoom' ? EXTERIOR : 'livingRoom')}
        />

        {/* The interior doorway between living room and kitchen, at their
            shared boundary — the door itself plus solid wall filling the
            rest of the boundary's width. swingDoorIn swings it toward -Z —
            away from the living room, into the kitchen — the same "swings
            away from its own room" convention as the front door. */}
        <InteriorDoorway
          colors={colors}
          z={roomSlotZ(0) - ROOM_DEPTH / 2}
          centerX={INTERIOR_DOOR_X}
          animation="swingDoorIn"
          open={isDoorOpen(1)}
          onToggle={() => goTo(settledLocation === 'kitchen' ? 'livingRoom' : 'kitchen')}
        />

        {/* Kitchen: no exterior presence, no windows — reached only
            through the interior doorway above. Its own light gray walls,
            regardless of the active color scheme. */}
        <Room colors={{ ...colors, wall: KITCHEN_WALL_COLOR }} centerZ={roomSlotZ(1)} hasBackWall={true} />

        <CameraRig transitionTarget={transitionTarget} controlsRef={controlsRef} onArrived={handleArrived} />

        {/* OrbitControls clamps distance/polar-angle every frame in update(),
            regardless of `enabled` — enabled only gates new pointer input.
            So while CameraRig is actively flying the camera (isTransitioning),
            these constraints must already be wide open, or the fly-to gets
            clamped partway and never actually arrives. Once settled, the
            real interior/exterior ranges take over for user-driven orbiting. */}
        <OrbitControls
          ref={controlsRef}
          enabled={!isTransitioning}
          enablePan={false}
          minDistance={isTransitioning ? 0 : isInterior ? INTERIOR_MIN_DISTANCE : EXTERIOR_MIN_DISTANCE}
          maxDistance={isTransitioning ? 50 : isInterior ? INTERIOR_MAX_DISTANCE : EXTERIOR_MAX_DISTANCE}
          maxPolarAngle={isTransitioning ? Math.PI : Math.PI / 2 - 0.05}
        />

        {/* Keeps the camera inside the current room's own walls once
            settled — OrbitControls' distance/angle constraints alone don't
            know about the room's actual box shape, so plenty of valid
            orbit angles would otherwise place the camera through a wall or
            into whichever room sits next in the stack. Placed after
            OrbitControls so its clamp is the last word each frame, not
            something OrbitControls' own update immediately overwrites. */}
        <RoomBounds controlsRef={controlsRef} settledLocation={settledLocation} active={!isTransitioning} />
      </Canvas>

      {/* "Go back" affordance: hovering the bottom strip while inside any
          room reveals an arrow; clicking it steps back one room toward the
          exterior (kitchen -> living room -> exterior, not straight out). */}
      {isInterior && (
        <div
          onMouseEnter={() => setShowExitArrow(true)}
          onMouseLeave={() => setShowExitArrow(false)}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: '22%',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: '18px',
          }}
        >
          <button
            onClick={() => goTo(parentOf(settledLocation))}
            aria-label="Go back"
            style={{
              width: '48px', height: '48px', borderRadius: '50%', border: 'none',
              backgroundColor: 'rgba(17, 24, 39, 0.6)', color: '#ffffff', fontSize: '1.3rem',
              cursor: 'pointer', opacity: showExitArrow ? 1 : 0,
              transition: 'opacity 0.25s ease',
              pointerEvents: showExitArrow ? 'auto' : 'none',
            }}
          >
            ←
          </button>
        </div>
      )}
    </div>
  );
}