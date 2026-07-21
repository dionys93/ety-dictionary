// web/src/components/house/Roof.jsx
import { useMemo, useEffect } from 'react';
import { createShingleTexture } from '../../utils/proceduralTextures.js';
import {
  ROOF_PITCH, ROOF_EAVE_OVERHANG, ROOF_GABLE_OVERHANG, ROOF_THICKNESS,
  ridgeHeight,
} from './roofGeometry.js';
import {
  RIDGE_AXIS, GABLE_SPAN, RIDGE_LENGTH,
  HOUSE_CENTER_X, HOUSE_CENTER_Z,
} from './constants.js';

// A single sloped roof panel: a thin box tilted to the pitch. `spanReach` is
// the horizontal distance the slope covers (half the gable span plus the
// eave overhang), `length` is its extent along the ridge, placed so its high
// edge sits on the ridge line and its low edge at the eave.
function slopePanel({ ridgeAxis, center, ridgeHeightY, sign, spanReach, length, texture }) {
  const pitchAngle = Math.atan(ROOF_PITCH);
  const panelWidth = Math.hypot(spanReach, spanReach * ROOF_PITCH); // slope length
  const midOut = sign * spanReach / 2;
  const midY = ridgeHeightY - (spanReach / 2) * ROOF_PITCH;

  if (ridgeAxis === 'z') {
    // ridge runs along Z; slopes fall in X. The rotation sign is negated so
    // the outer edge drops to the eave (a peak, not an inverted V).
    return (
      <mesh position={[center[0] + midOut, midY, center[2]]} rotation={[0, 0, -sign * pitchAngle]}>
        <boxGeometry args={[panelWidth, ROOF_THICKNESS, length]} />
        <meshStandardMaterial map={texture} />
      </mesh>
    );
  }
  // ridge runs along X; slopes fall in Z.
  return (
    <mesh position={[center[0], midY, center[2] + midOut]} rotation={[sign * pitchAngle, 0, 0]}>
      <boxGeometry args={[length, ROOF_THICKNESS, panelWidth]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
}

// One gable over the whole house footprint. The ridge runs down the footprint's
// longer axis (RIDGE_AXIS); two slopes fall across the shorter axis (GABLE_SPAN)
// to the eaves. There are no wings and no per-room roofs: the roof simply covers
// the footprint's bounding box, so moving a room never changes the roofline.
export function Roof({ colors }) {
  const texture = useMemo(
    () => createShingleTexture(colors.roof, { repeatX: 2, repeatY: 3 }),
    [colors.roof]
  );
  useEffect(() => () => texture.dispose(), [texture]);

  const ridgeY = ridgeHeight(GABLE_SPAN);
  const reach = GABLE_SPAN / 2 + ROOF_EAVE_OVERHANG;      // slope reach past the ridge
  const length = RIDGE_LENGTH + 2 * ROOF_GABLE_OVERHANG;  // ridge run + gable overhangs
  const center = [HOUSE_CENTER_X, 0, HOUSE_CENTER_Z];

  return (
    <group>
      {slopePanel({ ridgeAxis: RIDGE_AXIS, center, ridgeHeightY: ridgeY, sign: -1, spanReach: reach, length, texture })}
      {slopePanel({ ridgeAxis: RIDGE_AXIS, center, ridgeHeightY: ridgeY, sign: 1, spanReach: reach, length, texture })}
    </group>
  );
}