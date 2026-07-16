// web/src/components/house/Room.jsx
import { WallSegment } from './Siding.jsx';
import { HOUSE_WIDTH, HOUSE_HEIGHT, HOUSE_DEPTH } from './constants.js';

export function Room({ colors }) {
  return (
    <group>
      {/* Floor */}
      <mesh position={[0, 0.025, 0]}>
        <boxGeometry args={[HOUSE_WIDTH, 0.05, HOUSE_DEPTH]} />
        <meshStandardMaterial color={colors.floor} />
      </mesh>

      {/* Back wall */}
      <WallSegment position={[0, 0.5, -0.75]} size={[HOUSE_WIDTH, HOUSE_HEIGHT, 0.05]} color={colors.wall} sidingSign={-1} />

      {/* Left wall */}
      <WallSegment position={[-1, 0.5, 0]} size={[0.05, HOUSE_HEIGHT, HOUSE_DEPTH]} color={colors.wall} sidingAxis="x" sidingSign={-1} />

      {/* Right wall */}
      <WallSegment position={[1, 0.5, 0]} size={[0.05, HOUSE_HEIGHT, HOUSE_DEPTH]} color={colors.wall} sidingAxis="x" sidingSign={1} />

      {/* One placeholder item so the room isn't just an empty box */}
      <mesh position={[0, 0.2, -0.4]}>
        <boxGeometry args={[0.4, 0.35, 0.3]} />
        <meshStandardMaterial color={colors.item} />
      </mesh>
    </group>
  );
}