// web/src/components/house/CameraRig.jsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { LOCATIONS } from './locations.js';
import {
  EXTERIOR,
  EXTERIOR_CAMERA,
  TRANSITION_SPEED,
  TRANSITION_MIN_DURATION,
  TRANSITION_MAX_DURATION,
} from './constants.js';
import { transitionWaypoint } from './transitionWaypoints.js';

// A backgrounded tab hands back one enormous delta on return; without this
// the camera would teleport most of the way through a transition in a
// single frame.
const MAX_FRAME_DELTA = 0.1;

// Centripetal (alpha = 0.5) rather than uniform. Uniform Catmull-Rom
// overshoots hard on sharp corners — and the living room -> kitchen turn is
// a 92 degree one — which would bulge the path sideways out through the
// wall beside the door. Centripetal keeps the overshoot to ~0.017 units
// where uniform gives ~0.074.
const CURVE_ALPHA = 0.5;
const CURVE_SAMPLES_PER_SPAN = 60;

// Ease in AND out. An exponential lerp only eases out, so it always starts
// at full speed and creeps into its destination.
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function lerpArray(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// One span of a centripetal Catmull-Rom spline. Unlike a Bezier, this
// passes exactly THROUGH p1 and p2 rather than merely being pulled toward
// them — which is the whole requirement here, since the middle point is the
// doorway and missing it means flying through a wall.
function catmullRomPoint(p0, p1, p2, p3, t) {
  const knot = (ti, pi, pj) => ti + Math.pow(distance(pi, pj), CURVE_ALPHA);
  const t0 = 0;
  const t1 = knot(t0, p0, p1);
  const t2 = knot(t1, p1, p2);
  const t3 = knot(t2, p2, p3);
  // Coincident control points collapse a knot span; bail rather than
  // dividing by zero.
  if (t1 === t0 || t2 === t1 || t3 === t2) return p1;

  const tt = t1 + t * (t2 - t1);
  const between = (a, b, ta, tb) =>
    a.map((v, i) => ((tb - tt) / (tb - ta)) * v + ((tt - ta) / (tb - ta)) * b[i]);

  const a1 = between(p0, p1, t0, t1);
  const a2 = between(p1, p2, t1, t2);
  const a3 = between(p2, p3, t2, t3);
  const b1 = a1.map((v, i) => ((t2 - tt) / (t2 - t0)) * v + ((tt - t0) / (t2 - t0)) * a2[i]);
  const b2 = a2.map((v, i) => ((t3 - tt) / (t3 - t1)) * v + ((tt - t1) / (t3 - t1)) * a3[i]);
  return b1.map((v, i) => ((t2 - tt) / (t2 - t1)) * v + ((tt - t1) / (t2 - t1)) * b2[i]);
}

// Turn the corner points into a dense smooth polyline. Sampling the spline
// once at plan time means everything downstream (arc-length walking, the
// eased timeline) works on a plain polyline and doesn't care that it came
// from a curve.
function sampleCurve(points) {
  if (points.length < 3) return points;
  // Reflected phantom endpoints, so the curve begins and ends exactly on
  // the real first and last points rather than short of them.
  const head = points[0].map((v, i) => 2 * v - points[1][i]);
  const tail = points[points.length - 1].map((v, i) => 2 * v - points[points.length - 2][i]);
  const padded = [head, ...points, tail];

  const sampled = [];
  for (let s = 0; s < padded.length - 3; s++) {
    for (let i = 0; i < CURVE_SAMPLES_PER_SPAN; i++) {
      sampled.push(catmullRomPoint(padded[s], padded[s + 1], padded[s + 2], padded[s + 3], i / CURVE_SAMPLES_PER_SPAN));
    }
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

// Walk the path by ARC LENGTH rather than per-segment progress, so speed
// stays continuous everywhere — the camera doesn't slow down just because a
// sample boundary happens to be there.
function pointAtDistance(segments, travelled) {
  let remaining = travelled;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      return lerpArray(segment.from, segment.to, remaining / segment.length);
    }
    remaining -= segment.length;
  }
  return segments[segments.length - 1].to;
}

// Flies the camera and OrbitControls' target to whichever location
// `transitionTarget` names, along a smooth curve routed through that
// boundary's doorway (see transitionWaypoints.js) so it never passes
// through solid wall.
//
// The flight is planned once, when the transition starts: it captures
// wherever the camera actually is right then (the user may have orbited),
// builds and samples the curve, and measures it. From there a single
// normalized progress runs 0 -> 1 over a length-scaled duration, eased at
// both ends. Because progress is time-based rather than a chase toward a
// moving goal, the camera arrives exactly rather than asymptotically — no
// epsilon test, no creeping final approach.
//
// Mutating camera.position and controls.target directly, then calling
// controls.update(), is safe alongside OrbitControls as long as it's
// disabled during the transition, which HouseExplorer.jsx handles.
export function CameraRig({ fromLocation, transitionTarget, controlsRef, onArrived }) {
  const flight = useRef(null);

  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (!transitionTarget) {
      flight.current = null;
      return;
    }

    // Plan the flight once per transition.
    if (!flight.current || flight.current.destination !== transitionTarget) {
      const destination = transitionTarget === EXTERIOR ? EXTERIOR_CAMERA : LOCATIONS[transitionTarget].camera;
      const waypoint = transitionWaypoint(fromLocation, transitionTarget);
      const corners = [
        [camera.position.x, camera.position.y, camera.position.z],
        ...(waypoint ? [waypoint.position] : []),
        destination.position,
      ];
      const curve = sampleCurve(corners);

      const segments = [];
      let totalLength = 0;
      for (let i = 0; i < curve.length - 1; i++) {
        const length = distance(curve[i], curve[i + 1]);
        if (length === 0) continue; // skip duplicates so pointAtDistance stays simple
        segments.push({ from: curve[i], to: curve[i + 1], length });
        totalLength += length;
      }
      // Degenerate case: already exactly at the destination.
      if (segments.length === 0) {
        segments.push({ from: destination.position, to: destination.position, length: Number.EPSILON });
        totalLength = Number.EPSILON;
      }

      flight.current = {
        destination: transitionTarget,
        segments,
        totalLength,
        fromTarget: [controls.target.x, controls.target.y, controls.target.z],
        toTarget: destination.target,
        duration: Math.min(
          TRANSITION_MAX_DURATION,
          Math.max(TRANSITION_MIN_DURATION, totalLength / TRANSITION_SPEED)
        ),
        elapsed: 0,
        done: false,
      };
    }

    const f = flight.current;
    if (f.done) return; // onArrived already fired; wait for the state update

    f.elapsed += Math.min(delta, MAX_FRAME_DELTA);
    const progress = Math.min(1, f.elapsed / f.duration);
    const eased = easeInOut(progress);

    const position = pointAtDistance(f.segments, eased * f.totalLength);
    camera.position.set(position[0], position[1], position[2]);

    const target = lerpArray(f.fromTarget, f.toTarget, eased);
    controls.target.set(target[0], target[1], target[2]);
    controls.update();

    if (progress >= 1) {
      f.done = true;
      onArrived(transitionTarget);
    }
  });

  return null;
}