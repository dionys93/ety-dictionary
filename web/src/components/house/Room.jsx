// web/src/components/house/Room.jsx
import { WallSegment } from './Siding.jsx';
import { ROOM_WIDTH, WALL_HEIGHT, ROOM_DEPTH } from './constants.js';

// One room's interior: floor + left/right walls (always) + back wall
// (unless something sits behind this room). `centerZ` places it in its own
// slot in the front-to-back stack of rooms.
//
// `hasBackWall` defaults to true (a normal closed room) and should be set
// false only for a room that has another room directly behind it — in that
// case the boundary is an interior doorway (rendered once, separately, by
// whichever component connects the two rooms) rather than a solid wall.
// Having both rooms render a wall at that exact shared position would be
// two perfectly coincident meshes — a textbook z-fighting setup.
//
// `interiorWallColor`, if given, is used for a thin liner on the inside
// face of each wall, while `colors.wall` (the exterior siding) keeps
// matching the house's outward color regardless — see WallSegment for why
// these can now differ (previously a room's whole wall was one color,
// visible from both inside and outside).
export function Room({ colors, centerZ = 0, hasBackWall = true, interiorWallColor }) {
  return (
    <group position={[0, 0, centerZ]}>
      {/* Floor */}
      <mesh position={[0, 0.025, 0]}>
        <boxGeometry args={[ROOM_WIDTH, 0.05, ROOM_DEPTH]} />
        <meshStandardMaterial color={colors.floor} />
      </mesh>

      {/* Back wall — only if nothing sits behind this room */}
      {hasBackWall && (
        <WallSegment position={[0, WALL_HEIGHT / 2, -ROOM_DEPTH / 2]} size={[ROOM_WIDTH, WALL_HEIGHT, 0.05]} color={colors.wall} sidingSign={-1} interiorColor={interiorWallColor} />
      )}

      {/* Left wall */}
      <WallSegment position={[-ROOM_WIDTH / 2, WALL_HEIGHT / 2, 0]} size={[0.05, WALL_HEIGHT, ROOM_DEPTH]} color={colors.wall} sidingAxis="x" sidingSign={-1} interiorColor={interiorWallColor} />

      {/* Right wall */}
      <WallSegment position={[ROOM_WIDTH / 2, WALL_HEIGHT / 2, 0]} size={[0.05, WALL_HEIGHT, ROOM_DEPTH]} color={colors.wall} sidingAxis="x" sidingSign={1} interiorColor={interiorWallColor} />
    </group>
  );
}