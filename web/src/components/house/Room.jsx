// web/src/components/house/Room.jsx
import { roomRect, roomById, WALL_HEIGHT } from './constants.js';

const SLAB_THICKNESS = 0.05;

// One room's floor and ceiling. Walls belong to the house and are derived
// from the grid (see Walls.jsx); a room only caps its own footprint. The
// footprint is the bounding box of the room's grid cells (roomRect). For a
// rectangular room that's exact; an L-shaped room would over-cover its notch
// slightly at floor/ceiling level — acceptable, and revisitable if we add
// non-rectangular rooms.
export function Room({ roomId, colors }) {
  const rect = roomRect(roomId);
  if (!rect) return null;
  const ceilingColor = roomById(roomId).interiorWallColor ?? colors.wall;

  return (
    <group position={[rect.centerX, 0, rect.centerZ]}>
      <mesh position={[0, SLAB_THICKNESS / 2, 0]}>
        <boxGeometry args={[rect.width, SLAB_THICKNESS, rect.depth]} />
        <meshStandardMaterial color={colors.floor} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT - SLAB_THICKNESS / 2, 0]}>
        <boxGeometry args={[rect.width, SLAB_THICKNESS, rect.depth]} />
        <meshStandardMaterial color={ceilingColor} />
      </mesh>
    </group>
  );
}