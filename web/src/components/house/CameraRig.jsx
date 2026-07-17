// web/src/components/house/CameraRig.jsx
import { useFrame } from '@react-three/fiber';
import { lerpVec3 } from '../../utils/lerp.js';
import { LOCATIONS } from './locations.js';
import { EXTERIOR, EXTERIOR_CAMERA, CAMERA_LERP_SPEED, CAMERA_ARRIVE_EPSILON } from './constants.js';

// Flies the camera and OrbitControls' target toward whichever location
// `transitionTarget` names — EXTERIOR_CAMERA if it's EXTERIOR, otherwise
// that room's pose from LOCATIONS. `transitionTarget` being null means
// nothing is happening; settled states don't need this component to do
// anything, normal user-driven orbiting takes over once arrived.
//
// Mutating camera.position and controls.target directly, then calling
// controls.update(), works safely alongside OrbitControls as long as it's
// disabled (no queued user input) during the transition, which
// HouseExplorer.jsx takes care of.
export function CameraRig({ transitionTarget, controlsRef, onArrived }) {
  useFrame(({ camera }) => {
    if (!transitionTarget) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const dest = transitionTarget === EXTERIOR ? EXTERIOR_CAMERA : LOCATIONS[transitionTarget].camera;

    lerpVec3(camera.position, dest.position, CAMERA_LERP_SPEED);
    lerpVec3(controls.target, dest.target, CAMERA_LERP_SPEED);
    controls.update();

    const dx = dest.position[0] - camera.position.x;
    const dy = dest.position[1] - camera.position.y;
    const dz = dest.position[2] - camera.position.z;
    if (dx * dx + dy * dy + dz * dz < CAMERA_ARRIVE_EPSILON * CAMERA_ARRIVE_EPSILON) {
      onArrived(transitionTarget);
    }
  });

  return null;
}