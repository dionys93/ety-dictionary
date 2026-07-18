// web/src/components/house/GableEnd.jsx
import { useMemo } from 'react';
import * as THREE from 'three';
import { ROOF_THICKNESS, roofHeightAtX } from './roofGeometry.js';

const LINER_THICKNESS = 0.02;

// The triangular wall infill at one end of the ridge — apex at the ridge
// peak, base corners at the height the side walls actually reach (matching
// WALL_HEIGHT). Without this, the space under the roof's peak at the front
// and back of the house is completely open. Both the apex and base heights
// come from roofHeightAtX (the same function the roof panels and the walls
// are built from), evaluated at x=0 (ridge) and x=halfWidth (base) using
// the same eaveHeight/houseWidth reference — not re-derived from an
// already-derived value, which is exactly the mistake that would silently
// produce a slightly-too-tall triangle that doesn't match the roof.
//
// `outwardSign` says which way faces out of the house (+1 = +Z, the front
// end; -1 = -Z, the back end). `interiorColor`, if given and different from
// the wall color, adds a thin liner triangle on the INWARD face in that
// color — the same interior/exterior split WallSegment does for ordinary
// walls. This matters because the rooms have no ceilings, so whichever room
// a gable backs onto can see its inward face from inside.
//
// This is the one shape in the house that isn't a box or a cone, so it's
// built from THREE.Shape + extrudeGeometry. Note extrudeGeometry always
// extrudes toward local +Z regardless of orientation, which is why the
// liner's offset is asymmetric between the two ends rather than a simple
// mirror. DoubleSide avoids having to reason about the triangle's winding
// order for the two different-facing ends.
export function GableEnd({ colors, roomWidth, houseWidth, eaveHeight, z, outwardSign = 1, interiorColor }) {
  const halfWidth = roomWidth / 2;
  const baseY = roofHeightAtX(halfWidth, eaveHeight, houseWidth);
  const ridgeY = roofHeightAtX(0, eaveHeight, houseWidth);
  const hasLiner = interiorColor && interiorColor !== colors.wall;

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-halfWidth, baseY);
    s.lineTo(halfWidth, baseY);
    s.lineTo(0, ridgeY);
    s.closePath();
    return s;
  }, [halfWidth, baseY, ridgeY]);

  // extrudeGeometry spans local z in [0, depth], so a mesh positioned at P
  // occupies [P, P + depth]. The core is centered on `z`; the liner sits
  // flush against whichever of its faces points into the house.
  const coreZ = z - ROOF_THICKNESS / 2;
  const linerZ = outwardSign > 0
    ? z - ROOF_THICKNESS / 2 - LINER_THICKNESS
    : z + ROOF_THICKNESS / 2;

  return (
    <group>
      <mesh position={[0, 0, coreZ]}>
        <extrudeGeometry args={[shape, { depth: ROOF_THICKNESS, bevelEnabled: false }]} />
        <meshStandardMaterial color={colors.wall} side={THREE.DoubleSide} />
      </mesh>
      {hasLiner && (
        <mesh position={[0, 0, linerZ]}>
          <extrudeGeometry args={[shape, { depth: LINER_THICKNESS, bevelEnabled: false }]} />
          <meshStandardMaterial color={interiorColor} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}