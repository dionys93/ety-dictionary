// web/src/components/house/Roof.jsx
import { useMemo, useEffect } from 'react';
import { createShingleTexture } from '../../utils/proceduralTextures.js';
import {
  ROOF_PITCH, EAVE_HEIGHT, ROOF_EAVE_OVERHANG, ROOF_GABLE_OVERHANG, ROOF_THICKNESS,
  ridgeHeight,
} from './roofGeometry.js';
import {
  roomRect, MAIN_COLUMN, MAIN_COLUMN_WIDTH, WINGS,
  FRONT_WALL_Z, HOUSE_BACK_Z,
} from './constants.js';

// A single sloped roof panel: a thin box tilted to the pitch. `spanReach` is
// the horizontal distance the slope covers (wall half-width + whatever
// overhang applies at each end), `length` is its extent along the ridge, and
// the panel is placed so its high edge sits on the ridge line.
function slopePanel({ ridgeAxis, ridgePos, ridgeHeightY, sign, spanReach, length, texture, overhangHigh = 0 }) {
  const pitchAngle = Math.atan(ROOF_PITCH);
  const panelWidth = Math.hypot(spanReach, spanReach * ROOF_PITCH); // slope length
  // midpoint of the slope, horizontally half the reach out from the ridge
  const midOut = sign * spanReach / 2;
  const midY = ridgeHeightY - (spanReach / 2) * ROOF_PITCH;

  if (ridgeAxis === 'z') {
    // ridge runs along Z; slopes fall in X. The rotation sign is NEGATED
    // relative to the slope's outward sign: a +X slope must tilt so its
    // outer (+X) edge drops to the eave, which is a negative rotation about
    // Z. Getting this backwards lifts the eaves above the ridge — an
    // inverted V instead of a peak.
    return (
      <mesh position={[ridgePos[0] + midOut, midY, ridgePos[2]]} rotation={[0, 0, -sign * pitchAngle]}>
        <boxGeometry args={[panelWidth, ROOF_THICKNESS, length]} />
        <meshStandardMaterial map={texture} />
      </mesh>
    );
  }
  // ridge runs along X; slopes fall in Z. Same negation for the same reason:
  // the outer edge must drop to the eave, not rise above the ridge.
  return (
    <mesh position={[ridgePos[0], midY, ridgePos[2] + midOut]} rotation={[sign * pitchAngle, 0, 0]}>
      <boxGeometry args={[length, ROOF_THICKNESS, panelWidth]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
}

// The house's roof: one main gable over the main column (ridge along Z), plus
// one cross-gable per side wing (ridge along X), its lower ridge tucking
// under the main slope. The main slope on a wing's side is split along Z so
// its eave overhang is trimmed flush to the wall where the wing joins —
// otherwise the overhang would dip below the wing's ceiling and show inside.
export function Roof({ colors }) {
  const texture = useMemo(
    () => createShingleTexture(colors.roof, { repeatX: 2, repeatY: 3 }),
    [colors.roof]
  );
  useEffect(() => () => texture.dispose(), [texture]);

  const mainHalf = MAIN_COLUMN_WIDTH / 2;
  const mainRidgeY = ridgeHeight(MAIN_COLUMN_WIDTH);
  const mainReach = mainHalf + ROOF_EAVE_OVERHANG;
  const mainFront = FRONT_WALL_Z + ROOF_GABLE_OVERHANG;
  const mainBack = HOUSE_BACK_Z - ROOF_GABLE_OVERHANG;
  const mainLength = mainFront - mainBack;
  const mainMidZ = (mainFront + mainBack) / 2;

  // Wings on the +X side that force the main +X slope to be trimmed. (Only
  // right-side wings interrupt the +X slope; a left wing would interrupt -X.)
  const rightWings = WINGS.map(roomRect).filter((r) => r.centerX > 0);

  return (
    <group>
      {/* Main roof, -X slope: always full width (no wing on the left here). */}
      {slopePanel({ ridgeAxis: 'z', ridgePos: [0, 0, mainMidZ], ridgeHeightY: mainRidgeY, sign: -1, spanReach: mainReach, length: mainLength, texture })}

      {/* Main roof, +X slope: split along Z into full-overhang runs and, over
          each right wing's depth, a trimmed run reaching only to the wall. */}
      {(() => {
        const cuts = [];
        let z = mainBack;
        const trims = rightWings
          .map((r) => ({ from: r.centerZ - r.depth / 2, to: r.centerZ + r.depth / 2 }))
          .sort((a, b) => a.from - b.from);
        for (const trim of trims) {
          if (trim.from > z) cuts.push({ from: z, to: trim.from, reach: mainReach });
          cuts.push({ from: trim.from, to: trim.to, reach: mainHalf }); // trimmed flush to wall
          z = trim.to;
        }
        if (z < mainFront) cuts.push({ from: z, to: mainFront, reach: mainReach });
        return cuts.map((cut, i) =>
          <group key={i}>
            {slopePanel({ ridgeAxis: 'z', ridgePos: [0, 0, (cut.from + cut.to) / 2], ridgeHeightY: mainRidgeY, sign: 1, spanReach: cut.reach, length: cut.to - cut.from, texture })}
          </group>
        );
      })()}

      {/* One cross-gable per wing. */}
      {rightWings.map((r, i) => {
        const wingRidgeY = ridgeHeight(r.depth);
        // ridge runs along X, from just inside the valley out past the wall.
        const valleyX = r.centerX - r.width / 2;              // meets main roof here
        const outerEaveX = r.centerX + r.width / 2 + ROOF_GABLE_OVERHANG;
        const ridgeLen = outerEaveX - valleyX;
        const ridgeMidX = (valleyX + outerEaveX) / 2;
        const wingReach = r.depth / 2 + ROOF_EAVE_OVERHANG;
        return (
          <group key={i}>
            {slopePanel({ ridgeAxis: 'x', ridgePos: [ridgeMidX, 0, r.centerZ], ridgeHeightY: wingRidgeY, sign: 1, spanReach: wingReach, length: ridgeLen, texture })}
            {slopePanel({ ridgeAxis: 'x', ridgePos: [ridgeMidX, 0, r.centerZ], ridgeHeightY: wingRidgeY, sign: -1, spanReach: wingReach, length: ridgeLen, texture })}
          </group>
        );
      })}
    </group>
  );
}