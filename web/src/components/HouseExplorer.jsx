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
import { ROOMS } from './house/rooms.js';
import {
  ROOM_WIDTH,
  roomSlotZ,
  roomFrontZ,
  HOUSE_WIDTH,
  HOUSE_DEPTH,
  HOUSE_CENTER_Z,
  FRONT_WALL_Z,
  HOUSE_BACK_Z,
  EAVE_HEIGHT,
  EXTERIOR,
  EXTERIOR_CAMERA,
  EXTERIOR_MIN_DISTANCE,
  EXTERIOR_MAX_DISTANCE,
  INTERIOR_MIN_DISTANCE,
  INTERIOR_MAX_DISTANCE,
  depthOf,
  parentOf,
} from './house/constants.js';

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

  // The doorway leading into ROOMS[doorIndex] is open whenever we're settled
  // at, or transitioning to/from, that room OR anything deeper than it. Just
  // checking "is this room involved in the current transition" would
  // false-positive on an outer door (like the front door) during a move
  // between two rooms further down the chain — this depth check avoids that
  // however deep the chain gets.
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

  // Clicking a room's own doorway toggles between that room and whatever
  // sits in front of it — so it works as both "go in" and "come back out".
  const toggleRoom = (roomId) => () =>
    goTo(settledLocation === roomId ? parentOf(roomId) : roomId);

  return (
    <div style={{ width: '100%', height: '600px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
      <Canvas camera={{ position: EXTERIOR_CAMERA.position, fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />

        <Ground colors={colors} />
        <Roof colors={colors} houseWidth={HOUSE_WIDTH} houseDepth={HOUSE_DEPTH} centerZ={HOUSE_CENTER_Z} />

        {/* Gable-end triangles closing the roof at the front and back of the
            stack — without these, the space under the ridge is open at both
            ends. Both planes are derived (constants.js), not re-computed
            from ROOM_DEPTH here. */}
        <GableEnd
          colors={colors}
          roomWidth={ROOM_WIDTH}
          houseWidth={HOUSE_WIDTH}
          eaveHeight={EAVE_HEIGHT}
          z={FRONT_WALL_Z}
          outwardSign={1}
          interiorColor={ROOMS[0].interiorWallColor}
        />
        <GableEnd
          colors={colors}
          roomWidth={ROOM_WIDTH}
          houseWidth={HOUSE_WIDTH}
          eaveHeight={EAVE_HEIGHT}
          z={HOUSE_BACK_Z}
          outwardSign={-1}
          interiorColor={ROOMS[ROOMS.length - 1].interiorWallColor}
        />

        {/* One entry per room in ROOMS. The frontmost gets the exterior
            facade and front door; every other gets an interior doorway at
            its own front plane, plus its interior. `hasBackWall` is
            structural (is anything behind me?) rather than something a
            caller has to remember to flip — forgetting that gave two
            coincident z-fighting walls. */}
        {ROOMS.map((room, index) => {
          const isLast = index === ROOMS.length - 1;

          if (index === 0) {
            return (
              <GroundFloorRoom
                key={room.id}
                colors={colors}
                hasBackWall={isLast}
                interiorWallColor={room.interiorWallColor}
                doorway={room.doorway}
                open={isDoorOpen(index)}
                onToggle={toggleRoom(room.id)}
              />
            );
          }

          return (
            <group key={room.id}>
              <InteriorDoorway
                colors={colors}
                z={roomFrontZ(index)}
                centerX={room.doorway.centerX}
                animation={room.doorway.animation}
                open={isDoorOpen(index)}
                onToggle={toggleRoom(room.id)}
                interiorWallColor={room.interiorWallColor}
              />
              <Room
                colors={colors}
                centerZ={roomSlotZ(index)}
                hasBackWall={isLast}
                interiorWallColor={room.interiorWallColor}
              />
            </group>
          );
        })}

        <CameraRig fromLocation={settledLocation} transitionTarget={transitionTarget} controlsRef={controlsRef} onArrived={handleArrived} />

        {/* OrbitControls clamps distance/polar-angle every frame in update(),
            regardless of `enabled` — enabled only gates new pointer input.
            So while CameraRig is actively flying the camera, these
            constraints must already be wide open, or the fly-to gets clamped
            partway and never actually arrives. Once settled, the real
            interior/exterior ranges take over for user-driven orbiting. */}
        <OrbitControls
          ref={controlsRef}
          enabled={!isTransitioning}
          enablePan={false}
          minDistance={isTransitioning ? 0 : isInterior ? INTERIOR_MIN_DISTANCE : EXTERIOR_MIN_DISTANCE}
          maxDistance={isTransitioning ? 50 : isInterior ? INTERIOR_MAX_DISTANCE : EXTERIOR_MAX_DISTANCE}
          maxPolarAngle={isTransitioning ? Math.PI : Math.PI / 2 - 0.05}
        />

        {/* Keeps the camera inside the current room's own walls once settled
            — OrbitControls' distance/angle constraints don't know about the
            room's box shape, so plenty of valid orbit angles would place the
            camera through a wall or into the next room. Placed after
            OrbitControls so its clamp is the last word each frame. */}
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