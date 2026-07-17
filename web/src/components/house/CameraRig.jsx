// web/src/components/house/CameraRig.jsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { lerpVec3 } from '../../utils/lerp.js';
import { LOCATIONS } from './locations.js';
import { EXTERIOR, EXTERIOR_CAMERA, CAMERA_LERP_SPEED, CAMERA_ARRIVE_EPSILON } from './constants.js';
import { transitionWaypoint } from './transitionWaypoints.js';

// Flies the camera and OrbitControls' target toward whichever location
// `transitionTarget` names — EXTERIOR_CAMERA if it's EXTERIOR, otherwise
// that room's pose from LOCATIONS. `transitionTarget` being null means
// nothing is happening; settled states don't need this component to do
// anything, normal user-driven orbiting takes over once arrived.
//
// `fromLocation` (the settled location this transition started from) is
// used to look up whether this specific edge needs a waypoint — some
// doorways aren't centered on the room they open into, so a straight line
// between the two rooms' resting poses can cut through solid wall instead
// of the actual opening. When a waypoint exists, position eases through it
// first, then switches to the final destination; controls.target eases
// toward the final target throughout (no need for the waypoint to have its
// own look-direction — the position detour is what matters).
//
// Mutating camera.position and controls.target directly, then calling
// controls.update(), works safely alongside OrbitControls as long as it's
// disabled (no queued user input) during the transition, which
// HouseExplorer.jsx takes care of.
export function CameraRig({ fromLocation, transitionTarget, controlsRef, onArrived }) {
  const phase = useRef('final'); // 'waypoint' | 'final'
  const lastEdge = useRef(null);

  useFrame(({ camera }) => {
    if (!transitionTarget) {
      lastEdge.current = null;
      return;
    }
    const controls = controlsRef.current;
    if (!controls) return;

    const edgeKey = `${fromLocation}->${transitionTarget}`;
    if (lastEdge.current !== edgeKey) {
      lastEdge.current = edgeKey;
      const waypoint = transitionWaypoint(fromLocation, transitionTarget);
      phase.current = waypoint ? 'waypoint' : 'final';
    }

    const finalDest = transitionTarget === EXTERIOR ? EXTERIOR_CAMERA : LOCATIONS[transitionTarget].camera;

    // controls.target always eases toward the final look-at point, whether
    // or not this transition has a waypoint phase.
    lerpVec3(controls.target, finalDest.target, CAMERA_LERP_SPEED);

    if (phase.current === 'waypoint') {
      const waypoint = transitionWaypoint(fromLocation, transitionTarget);
      lerpVec3(camera.position, waypoint.position, CAMERA_LERP_SPEED);
      controls.update();

      const dx = waypoint.position[0] - camera.position.x;
      const dy = waypoint.position[1] - camera.position.y;
      const dz = waypoint.position[2] - camera.position.z;
      if (dx * dx + dy * dy + dz * dz < CAMERA_ARRIVE_EPSILON * CAMERA_ARRIVE_EPSILON) {
        phase.current = 'final';
      }
      return;
    }

    // phase === 'final': either this edge never needed a waypoint, or the
    // waypoint phase already completed.
    lerpVec3(camera.position, finalDest.position, CAMERA_LERP_SPEED);
    controls.update();

    const dx = finalDest.position[0] - camera.position.x;
    const dy = finalDest.position[1] - camera.position.y;
    const dz = finalDest.position[2] - camera.position.z;
    if (dx * dx + dy * dy + dz * dz < CAMERA_ARRIVE_EPSILON * CAMERA_ARRIVE_EPSILON) {
      onArrived(transitionTarget);
    }
  });

  return null;
}