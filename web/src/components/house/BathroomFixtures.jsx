// web/src/components/house/BathroomFixtures.jsx
import { roomRect } from './constants.js';

// A porcelain-white toilet and a bath/shower combination, built from simple
// primitives and placed against the bathroom's own walls. Everything is
// positioned relative to the room's derived footprint (roomRect), so if the
// bathroom's size or location changes in rooms.js, the fixtures follow.
//
// Layout, with the doorway on the room's left (-X) wall left clear:
//   - bath along the far/outer (+X) wall, running front-to-back
//   - toilet against the back (-Z) wall
const PORCELAIN = '#f7f7f4';
const CHROME = '#c8ccce';
const TILE = '#dfe7e6';

function Toilet({ x, z, faceX }) {
  // faceX = direction the toilet faces (+1 or -1 in X). Tank sits behind it.
  return (
    <group position={[x, 0, z]}>
      {/* bowl */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.17, 0.13, 0.36, 20]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
      {/* seat */}
      <mesh position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.04, 20]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
      {/* tank, set behind the bowl (away from faceX) */}
      <mesh position={[-faceX * 0.22, 0.42, 0]}>
        <boxGeometry args={[0.12, 0.4, 0.4]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
      {/* base/pedestal */}
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.11, 0.14, 0.12, 16]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
    </group>
  );
}

function BathShower({ x, z, length, faceX, wallHeight }) {
  // Tub runs along Z (length), sits against the outer wall at +X. `faceX`
  // points from the wall into the room (-1 here), so the surround goes on
  // the +faceX-away (wall) side.
  const tubW = 0.62, tubH = 0.42, wall = -faceX; // wall side sign
  return (
    <group position={[x, 0, z]}>
      {/* outer tub shell */}
      <mesh position={[0, tubH / 2, 0]}>
        <boxGeometry args={[tubW, tubH, length]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
      {/* hollowed basin (a slightly smaller inset, tinted for depth) */}
      <mesh position={[0, tubH / 2 + 0.04, 0]}>
        <boxGeometry args={[tubW - 0.12, tubH - 0.08, length - 0.14]} />
        <meshStandardMaterial color={TILE} />
      </mesh>
      {/* tiled surround up the wall behind the tub */}
      <mesh position={[wall * (tubW / 2 - 0.02), wallHeight * 0.42, 0]}>
        <boxGeometry args={[0.04, wallHeight * 0.84, length]} />
        <meshStandardMaterial color={TILE} />
      </mesh>
      {/* shower riser pipe up the wall */}
      <mesh position={[wall * (tubW / 2 - 0.06), wallHeight * 0.55, length / 2 - 0.15]}>
        <cylinderGeometry args={[0.015, 0.015, wallHeight * 0.7, 10]} />
        <meshStandardMaterial color={CHROME} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* shower head */}
      <mesh position={[wall * (tubW / 2 - 0.16), wallHeight * 0.88, length / 2 - 0.15]} rotation={[0, 0, wall * Math.PI / 6]}>
        <cylinderGeometry args={[0.06, 0.03, 0.05, 14]} />
        <meshStandardMaterial color={CHROME} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* mixer tap on the tub rim */}
      <mesh position={[0, tubH + 0.02, -length / 2 + 0.2]}>
        <cylinderGeometry args={[0.025, 0.025, 0.12, 10]} />
        <meshStandardMaterial color={CHROME} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

export function BathroomFixtures({ wallHeight }) {
  const r = roomRect('bathroom');
  if (!r) return null;

  const outerX = r.centerX + r.width / 2;   // +X outer wall
  const backZ = r.centerZ - r.depth / 2;    // -Z back wall

  return (
    <group>
      {/* Bath against the outer wall, inset by half the tub width + a small gap. */}
      <BathShower
        x={outerX - 0.34}
        z={r.centerZ}
        length={r.depth - 0.24}
        faceX={-1}
        wallHeight={wallHeight}
      />
      {/* Toilet against the back wall, toward the inner side, facing +Z (into room). */}
      <group position={[0, 0, 0]}>
        <Toilet x={r.centerX - 0.15} z={backZ + 0.32} faceX={1} />
      </group>
    </group>
  );
}