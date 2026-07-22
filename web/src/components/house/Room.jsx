// web/src/components/house/Room.jsx
import { roomRect, roomById, WALL_HEIGHT } from './constants.js';

const SLAB_THICKNESS = 0.05;

export function Room({ roomId, colors, rect, ceilingColor, ceiling = true }) {
  const r = rect ?? roomRect(roomId);
  if (!r) return null;
  const ceil = ceilingColor ?? roomById(roomId)?.interiorWallColor ?? colors.wall;

  return (
    <group position={[r.centerX, 0, r.centerZ]}>
      <mesh position={[0, SLAB_THICKNESS / 2, 0]}>
        <boxGeometry args={[r.width, SLAB_THICKNESS, r.depth]} />
        <meshStandardMaterial color={colors.floor} />
      </mesh>
      {ceiling && (
        <mesh position={[0, WALL_HEIGHT - SLAB_THICKNESS / 2, 0]}>
          <boxGeometry args={[r.width, SLAB_THICKNESS, r.depth]} />
          <meshStandardMaterial color={ceil} />
        </mesh>
      )}
    </group>
  );
}