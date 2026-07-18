// web/src/components/HouseExplorer.jsx
import { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { COLOR_SCHEMES } from '../utils/houseColors.js';
import { Roof } from './house/Roof.jsx';
import { Ground } from './house/Ground.jsx';
import { Room } from './house/Room.jsx';
import { FrontFacade } from './house/FrontFacade.jsx';
import { Door } from './house/Door.jsx';
import { InteriorDoorway } from './house/InteriorDoorway.jsx';
import { GableEnd } from './house/GableEnd.jsx';
import { BathroomFixtures } from './house/BathroomFixtures.jsx';
import { CameraRig } from './house/CameraRig.jsx';
import { RoomBounds } from './house/RoomBounds.jsx';
import { ROOMS } from './house/rooms.js';
import { ridgeHeight, WALL_HEIGHT, ROOF_GABLE_OVERHANG } from './house/roofGeometry.js';
import {
  roomById, roomRect, roomDoorway, doorwayWallSpan, entryFaceOf,
  parentOf, pathTo, areAdjacent,
  MAIN_COLUMN, MAIN_COLUMN_WIDTH, WINGS,
  FRONT_WALL_Z, HOUSE_BACK_Z, HOUSE_CENTER_Z,
  EXTERIOR, EXTERIOR_CAMERA,
  EXTERIOR_MIN_DISTANCE, EXTERIOR_MAX_DISTANCE,
  INTERIOR_MIN_DISTANCE, INTERIOR_MAX_DISTANCE,
} from './house/constants.js';

export default function HouseExplorer({ colorScheme = 'robinsEgg' }) {
  const colors = COLOR_SCHEMES[colorScheme];
  const controlsRef = useRef();

  const [settledLocation, setSettledLocation] = useState(EXTERIOR);
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [showExitArrow, setShowExitArrow] = useState(false);

  const isTransitioning = transitionTarget !== null;
  const activeLocation = isTransitioning ? transitionTarget : settledLocation;
  const isInterior = activeLocation !== EXTERIOR;

  // A room's doorway is open when the room we're settled at or heading to is
  // that room or lies beyond it — i.e. the room is on the path to the active
  // location. Path-based rather than depth-based, so it's correct for a tree
  // (the bathroom being open must NOT open the kitchen, and vice versa).
  const isDoorOpen = (roomId) => {
    const onSettledPath = pathTo(settledLocation).includes(roomId);
    const onTargetPath = isTransitioning && pathTo(transitionTarget).includes(roomId);
    return onSettledPath || onTargetPath;
  };

  const goTo = (locationId) => {
    if (isTransitioning) return;
    setTransitionTarget(locationId);
  };

  const handleArrived = (locationId) => {
    setSettledLocation(locationId);
    setTransitionTarget(null);
  };

  // Clicking a room's doorway toggles between that room and its parent, so
  // the same door works to enter and to leave.
  const toggleRoom = (roomId) => () =>
    goTo(settledLocation === roomId ? parentOf(roomId) : roomId);

  const rootId = ROOMS[0].id;
  const rootDoorway = roomDoorway(rootId);

  return (
    <div style={{ width: '100%', height: '600px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
      <Canvas camera={{ position: EXTERIOR_CAMERA.position, fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />

        <Ground colors={colors} />
        <Roof colors={colors} />

        {/* Gable ends. Main gable caps the front and back of the main column;
            each wing gets its own gable on its outer end. */}
        <group position={[0, 0, FRONT_WALL_Z]}>
          <GableEnd colors={colors} halfSpan={MAIN_COLUMN_WIDTH / 2} baseY={WALL_HEIGHT} ridgeY={ridgeHeight(MAIN_COLUMN_WIDTH)} outwardSign={1} interiorColor={roomById(rootId).interiorWallColor} />
        </group>
        <group position={[0, 0, HOUSE_BACK_Z]}>
          <GableEnd colors={colors} halfSpan={MAIN_COLUMN_WIDTH / 2} baseY={WALL_HEIGHT} ridgeY={ridgeHeight(MAIN_COLUMN_WIDTH)} outwardSign={-1} interiorColor={roomById(MAIN_COLUMN[MAIN_COLUMN.length - 1]).interiorWallColor} />
        </group>
        {WINGS.map((id) => {
          const r = roomRect(id);
          const outerX = r.centerX + r.width / 2;
          // wing gable faces +X, sits at the wing's outer wall, ridge along the room depth
          return (
            <group key={`gable-${id}`} position={[outerX, 0, r.centerZ]} rotation={[0, Math.PI / 2, 0]}>
              <GableEnd colors={colors} halfSpan={r.depth / 2} baseY={WALL_HEIGHT} ridgeY={ridgeHeight(r.depth)} outwardSign={1} interiorColor={roomById(id).interiorWallColor} />
            </group>
          );
        })}

        {/* The root room's exterior front door + window facade. */}
        <group position={[rootDoorway.wallCenter[0], 0, rootDoorway.wallCenter[2]]}>
          <FrontFacade colors={colors} span={roomRect(rootId).width} offset={rootDoorway.offset} />
          <Door
            colors={colors}
            centerX={rootDoorway.offset}
            animation={roomById(rootId).doorway.animation}
            open={isDoorOpen(rootId)}
            onToggle={toggleRoom(rootId)}
          />
        </group>

        {/* Every room's interior. */}
        {ROOMS.map((room) => (
          <Room key={room.id} roomId={room.id} colors={colors} />
        ))}

        {/* Every non-root room's doorway, rotated into its parent-facing wall. */}
        {ROOMS.filter((room) => room.parent).map((room) => {
          const d = roomDoorway(room.id);
          return (
            <group key={`door-${room.id}`} position={[d.wallCenter[0], 0, d.wallCenter[2]]} rotation={[0, d.rotationY, 0]}>
              <InteriorDoorway
                colors={colors}
                span={doorwayWallSpan(room.id)}
                offset={d.offset}
                animation={room.doorway.animation}
                open={isDoorOpen(room.id)}
                onToggle={toggleRoom(room.id)}
                interiorColor={room.interiorWallColor}
              />
            </group>
          );
        })}

        {/* Bathroom fixtures. */}
        <BathroomFixtures wallHeight={WALL_HEIGHT} />

        <CameraRig fromLocation={settledLocation} transitionTarget={transitionTarget} controlsRef={controlsRef} onArrived={handleArrived} />

        <OrbitControls
          ref={controlsRef}
          enabled={!isTransitioning}
          enablePan={false}
          minDistance={isTransitioning ? 0 : isInterior ? INTERIOR_MIN_DISTANCE : EXTERIOR_MIN_DISTANCE}
          maxDistance={isTransitioning ? 50 : isInterior ? INTERIOR_MAX_DISTANCE : EXTERIOR_MAX_DISTANCE}
          maxPolarAngle={isTransitioning ? Math.PI : Math.PI / 2 - 0.05}
        />

        <RoomBounds controlsRef={controlsRef} settledLocation={settledLocation} active={!isTransitioning} />
      </Canvas>

      {isInterior && (
        <div
          onMouseEnter={() => setShowExitArrow(true)}
          onMouseLeave={() => setShowExitArrow(false)}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '22%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '18px' }}
        >
          <button
            onClick={() => goTo(parentOf(settledLocation))}
            aria-label="Go back"
            style={{ width: '48px', height: '48px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(17, 24, 39, 0.6)', color: '#ffffff', fontSize: '1.3rem', cursor: 'pointer', opacity: showExitArrow ? 1 : 0, transition: 'opacity 0.25s ease', pointerEvents: showExitArrow ? 'auto' : 'none' }}
          >
            ←
          </button>
        </div>
      )}
    </div>
  );
}