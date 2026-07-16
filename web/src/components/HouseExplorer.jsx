// web/src/components/HouseExplorer.jsx
import { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { COLOR_SCHEMES } from '../utils/houseColors.js';
import { Room } from './house/Room.jsx';
import { Roof } from './house/Roof.jsx';
import { Ground } from './house/Ground.jsx';
import { FrontFacade } from './house/FrontFacade.jsx';
import { Door } from './house/Door.jsx';
import { CameraRig } from './house/CameraRig.jsx';
import { DOOR_WIDTH, EXTERIOR_CAMERA, VIEW_MODE } from './house/constants.js';

export default function HouseExplorer({ colorScheme = 'robinsEgg' }) {
  const colors = COLOR_SCHEMES[colorScheme];
  const controlsRef = useRef();

  const [doorOpen, setDoorOpen] = useState(false);
  // One of the VIEW_MODE values.
  const [viewMode, setViewMode] = useState(VIEW_MODE.EXTERIOR);
  const [showExitArrow, setShowExitArrow] = useState(false);

  // The single toggle both the door panels and the exit arrow call. Whichever
  // triggers it, the door swings and the camera starts flying in the matching
  // direction together.
  const toggleDoor = () => {
    setDoorOpen((prev) => {
      const next = !prev;
      setViewMode(next ? VIEW_MODE.ENTERING : VIEW_MODE.EXITING);
      return next;
    });
  };

  const isInterior = viewMode === VIEW_MODE.INTERIOR;
  const isTransitioning = viewMode === VIEW_MODE.ENTERING || viewMode === VIEW_MODE.EXITING;

  return (
    <div style={{ width: '100%', height: '600px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
      <Canvas camera={{ position: EXTERIOR_CAMERA.position, fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />

        <Ground colors={colors} />
        <Room colors={colors} />
        <Roof colors={colors} />
        <FrontFacade colors={colors} doorWidth={DOOR_WIDTH} />
        <Door colors={colors} open={doorOpen} onToggle={toggleDoor} />

        <CameraRig mode={viewMode} controlsRef={controlsRef} onArrived={setViewMode} />

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
          minDistance={isTransitioning ? 0 : isInterior ? 0.3 : 3}
          maxDistance={isTransitioning ? 50 : isInterior ? 1.4 : 12}
          maxPolarAngle={isTransitioning ? Math.PI : Math.PI / 2 - 0.05}
        />
      </Canvas>

      {/* Exit affordance: hovering the bottom strip while inside reveals an
          arrow; clicking it closes the door and flies the camera back out. */}
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
            onClick={toggleDoor}
            aria-label="Exit the house"
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