// web/src/components/house/Fixtures.jsx
import { PLACED_FIXTURES, WALL_HEIGHT } from './constants.js';

// Furniture. The grid + rooms.js decide WHERE (a friendly spot like
// 'back-left' inside a named room, already resolved to a world position and
// facing in constants.js); this module only decides what each type LOOKS
// like. Each component is modelled at the origin facing +Z and the placement
// group positions/rotates it.
const PORCELAIN = '#f7f7f4';
const CHROME = '#c8ccce';
const TILE = '#dfe7e6';

function Toilet() {
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.17, 0.13, 0.36, 20]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.04, 20]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
      {/* tank behind the bowl (local -Z) */}
      <mesh position={[0, 0.42, -0.22]}>
        <boxGeometry args={[0.4, 0.4, 0.12]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.11, 0.14, 0.12, 16]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
    </group>
  );
}

// Tub runs along local Z; tiled surround + shower on local +X.
function BathShower({ length = 1.5 }) {
  const tubW = 0.62, tubH = 0.42;
  return (
    <group>
      <mesh position={[0, tubH / 2, 0]}>
        <boxGeometry args={[tubW, tubH, length]} />
        <meshStandardMaterial color={PORCELAIN} />
      </mesh>
      <mesh position={[0, tubH / 2 + 0.04, 0]}>
        <boxGeometry args={[tubW - 0.12, tubH - 0.08, length - 0.14]} />
        <meshStandardMaterial color={TILE} />
      </mesh>
      <mesh position={[tubW / 2 - 0.02, WALL_HEIGHT * 0.42, 0]}>
        <boxGeometry args={[0.04, WALL_HEIGHT * 0.84, length]} />
        <meshStandardMaterial color={TILE} />
      </mesh>
      <mesh position={[tubW / 2 - 0.06, WALL_HEIGHT * 0.55, length / 2 - 0.15]}>
        <cylinderGeometry args={[0.015, 0.015, WALL_HEIGHT * 0.7, 10]} />
        <meshStandardMaterial color={CHROME} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[tubW / 2 - 0.16, WALL_HEIGHT * 0.88, length / 2 - 0.15]} rotation={[0, 0, Math.PI / 6]}>
        <cylinderGeometry args={[0.06, 0.03, 0.05, 14]} />
        <meshStandardMaterial color={CHROME} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, tubH + 0.02, -length / 2 + 0.2]}>
        <cylinderGeometry args={[0.025, 0.025, 0.12, 10]} />
        <meshStandardMaterial color={CHROME} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

const FIXTURE_COMPONENTS = { toilet: Toilet, bathShower: BathShower };

export function Fixtures() {
  return (
    <>
      {PLACED_FIXTURES.map((fixture, i) => {
        const Component = FIXTURE_COMPONENTS[fixture.type];
        if (!Component) return null;
        return (
          <group key={i} position={[fixture.x, 0, fixture.z]} rotation={[0, fixture.rotationY ?? 0, 0]}>
            <Component length={fixture.length} />
          </group>
        );
      })}
    </>
  );
}