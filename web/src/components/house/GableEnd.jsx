// web/src/components/house/GableEnd.jsx
import { useMemo } from 'react';
import * as THREE from 'three';
import { ROOF_THICKNESS, roofHeightAtX } from './roofGeometry.js';

// The triangular wall infill at one end of the ridge — apex at the ridge
// peak, base corners at the height the side walls actually reach
// (matching WALL_HEIGHT). Without this, the space under the roof's peak at
// the front/back of the house is completely open: you can see straight
// through the attic void from outside. Both the apex and base heights come
// from roofHeightAtX (the same function the roof panels and the walls are
// built from), evaluated at x=0 (ridge) and x=halfWidth (base) using the
// same eaveHeight/houseWidth reference — not re-derived from an
// already-derived value, which is exactly the mistake that would silently
// produce a slightly-too-tall triangle that doesn't actually match the roof.
//
// This is the one shape in the whole house that isn't a box or a cone —
// nothing else here is a flat, non-rectangular panel, so it's built from
// THREE.Shape + extrudeGeometry rather than reusing an existing primitive.
// DoubleSide avoids having to reason about the triangle's winding order
// (which face ends up "front") for the two different-facing gable ends.
export function GableEnd({ colors, roomWidth, houseWidth, eaveHeight, z }) {
  const halfWidth = roomWidth / 2;
  const baseY = roofHeightAtX(halfWidth, eaveHeight, houseWidth);
  const ridgeY = roofHeightAtX(0, eaveHeight, houseWidth);

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-halfWidth, baseY);
    s.lineTo(halfWidth, baseY);
    s.lineTo(0, ridgeY);
    s.closePath();
    return s;
  }, [halfWidth, baseY, ridgeY]);

  return (
    <mesh position={[0, 0, z - ROOF_THICKNESS / 2]}>
      <extrudeGeometry args={[shape, { depth: ROOF_THICKNESS, bevelEnabled: false }]} />
      <meshStandardMaterial color={colors.wall} side={THREE.DoubleSide} />
    </mesh>
  );
}