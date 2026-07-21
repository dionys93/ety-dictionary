// web/src/components/HouseExplorer.jsx
import { useRef, useState, Suspense } from 'react';   // + Suspense
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { COLOR_SCHEMES } from '../utils/houseColors.js';
import { Roof } from './house/Roof.jsx';
import { Ground } from './house/Ground.jsx';
import { Room } from './house/Room.jsx';
import { Walls } from './house/Walls.jsx';
import { FrontFacade } from './house/FrontFacade.jsx';
import { Door } from './house/Door.jsx';
import { InteriorDoorway } from './house/InteriorDoorway.jsx';
import { GableEnd } from './house/GableEnd.jsx';
import { CameraRig } from './house/CameraRig.jsx';
import { RoomBounds } from './house/RoomBounds.jsx';
import { ridgeHeight, WALL_HEIGHT } from './house/roofGeometry.js';
import {
  ROOMS, DOORWAYS,
  roomById,
  parentOf, pathTo,
  RIDGE_AXIS, GABLE_SPAN,
  HOUSE_CENTER_X, HOUSE_CENTER_Z,
  HOUSE_LEFT_X, HOUSE_RIGHT_X,
  FRONT_WALL_Z, HOUSE_BACK_Z,
  EXTERIOR, EXTERIOR_CAMERA,
  EXTERIOR_MIN_DISTANCE, EXTERIOR_MAX_DISTANCE,
  INTERIOR_MIN_DISTANCE, INTERIOR_MAX_DISTANCE,
} from './house/constants.js';
import { ITEM_COMPONENTS } from './house/items';

export default function HouseExplorer({ colorScheme = 'robinsEgg' }) {
  const colors = COLOR_SCHEMES[colorScheme];
  const controlsRef = useRef();

  const [settledLocation, setSettledLocation] = useState(EXTERIOR);
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [showExitArrow, setShowExitArrow] = useState(false);

  const isTransitioning = transitionTarget !== null;
  const isInterior = (isTransitioning ? transitionTarget : settledLocation) !== EXTERIOR;

  // A doorway is open when the room it leads into is on the path to wherever
  // we are or are heading — path-based, so sibling rooms stay independent.
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

  const toggleRoom = (roomId) => () =>
    goTo(settledLocation === roomId ? parentOf(roomId) : roomId);

  return (
    <div style={{ width: '100%', height: '600px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
      <Canvas camera={{ position: EXTERIOR_CAMERA.position, fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />

        <Ground colors={colors} />
        <Roof colors={colors} />

        {/* The two gable ends, at the short ends of the footprint the ridge
            runs between. No wing gables — one roof over the whole footprint,
            so there are exactly two triangular ends, wherever the rooms sit. */}
        {RIDGE_AXIS === 'z' ? (
          <>
            <group position={[HOUSE_CENTER_X, 0, FRONT_WALL_Z]}>
              <GableEnd colors={colors} halfSpan={GABLE_SPAN / 2} baseY={WALL_HEIGHT} ridgeY={ridgeHeight(GABLE_SPAN)} outwardSign={1} interiorColor={colors.wall} />
            </group>
            <group position={[HOUSE_CENTER_X, 0, HOUSE_BACK_Z]}>
              <GableEnd colors={colors} halfSpan={GABLE_SPAN / 2} baseY={WALL_HEIGHT} ridgeY={ridgeHeight(GABLE_SPAN)} outwardSign={-1} interiorColor={colors.wall} />
            </group>
          </>
        ) : (
          <>
            <group position={[HOUSE_RIGHT_X, 0, HOUSE_CENTER_Z]} rotation={[0, Math.PI / 2, 0]}>
              <GableEnd colors={colors} halfSpan={GABLE_SPAN / 2} baseY={WALL_HEIGHT} ridgeY={ridgeHeight(GABLE_SPAN)} outwardSign={1} interiorColor={colors.wall} />
            </group>
            <group position={[HOUSE_LEFT_X, 0, HOUSE_CENTER_Z]} rotation={[0, Math.PI / 2, 0]}>
              <GableEnd colors={colors} halfSpan={GABLE_SPAN / 2} baseY={WALL_HEIGHT} ridgeY={ridgeHeight(GABLE_SPAN)} outwardSign={-1} interiorColor={colors.wall} />
            </group>
          </>
        )}

        {/* Every solid wall in the house, derived from the grid. */}
        <Walls colors={colors} />

        {/* Every doorway, from the DOORS list: the exterior one gets the
            window facade + front door; interior ones get door + flanks.
            Each fills its entire wall run, positioned by the run itself. */}
        {DOORWAYS.map((doorway) => (
          <group
            key={`door-${doorway.child}`}
            position={[doorway.wallCenter[0], 0, doorway.wallCenter[2]]}
            rotation={[0, doorway.rotationY, 0]}
          >
            {doorway.isExterior ? (
              <>
                <FrontFacade colors={colors} span={doorway.span} offset={doorway.offset} />
                <Door
                  colors={colors}
                  centerX={doorway.offset}
                  animation={doorway.animation}
                  open={isDoorOpen(doorway.child)}
                  onToggle={toggleRoom(doorway.child)}
                />
              </>
            ) : (
              <InteriorDoorway
                colors={colors}
                span={doorway.span}
                offset={doorway.offset}
                animation={doorway.animation}
                open={isDoorOpen(doorway.child)}
                onToggle={toggleRoom(doorway.child)}
                interiorColor={roomById(doorway.child).interiorWallColor}
              />
            )}
          </group>
        ))}

        {/* Floors and ceilings, one pair per room. */}
        {ROOMS.map((room) => (
          <Room key={room.id} roomId={room.id} colors={colors} />
        ))}

        {/* Items, from the PLACEMENTS list — same shape as the DOORWAYS map above:
    each entry arrives already resolved to a world position + rotationY, so
    this map just drops the generic item in. The tv suspends while its model
    loads; the primitive items (toilet, bath, bookcase) don't suspend at all,
    which is why the boundary can wrap them all without ever blanking them. */}
        <Suspense fallback={null}>
          {PLACEMENTS.map((p) => {
            const Item = ITEM_COMPONENTS[p.item];
            return (
              <group key={p.id} position={p.position} rotation={[0, p.rotationY, 0]}>
                <Item />
              </group>
            );
          })}
        </Suspense>

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