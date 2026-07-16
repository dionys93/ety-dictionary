// web/src/components/house/CameraRig.jsx
import { useFrame } from '@react-three/fiber';
import { lerpVec3 } from '../../utils/lerp.js';
import { EXTERIOR_CAMERA, INTERIOR_CAMERA, CAMERA_LERP_SPEED, CAMERA_ARRIVE_EPSILON, VIEW_MODE } from './constants.js';

// Flies the camera and OrbitControls' target between EXTERIOR_CAMERA and
// INTERIOR_CAMERA whenever mode is ENTERING or EXITING. Settled states
// (EXTERIOR / INTERIOR) do nothing here — normal user-driven orbiting
// takes over once arrived. Mutating camera.position and controls.target
// directly, then calling controls.update(), works safely alongside
// OrbitControls as long as it's disabled (no queued user input) during the
// transition, which HouseExplorer takes care of.
export function CameraRig({ mode, controlsRef, onArrived }) {
  useFrame(({ camera }) => {
    if (mode !== VIEW_MODE.ENTERING && mode !== VIEW_MODE.EXITING) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const dest = mode === VIEW_MODE.ENTERING ? INTERIOR_CAMERA : EXTERIOR_CAMERA;

    lerpVec3(camera.position, dest.position, CAMERA_LERP_SPEED);
    lerpVec3(controls.target, dest.target, CAMERA_LERP_SPEED);
    controls.update();

    const dx = dest.position[0] - camera.position.x;
    const dy = dest.position[1] - camera.position.y;
    const dz = dest.position[2] - camera.position.z;
    if (dx * dx + dy * dy + dz * dz < CAMERA_ARRIVE_EPSILON * CAMERA_ARRIVE_EPSILON) {
      onArrived(mode === VIEW_MODE.ENTERING ? VIEW_MODE.INTERIOR : VIEW_MODE.EXTERIOR);
    }
  });

  return null;
}