// web/src/components/house/Room.jsx
import { WallSegment } from './Siding.jsx';
import { roomRect, roomById, wallFacesOf, wallSegmentsOn, WALL_HEIGHT, WALL_THICKNESS } from './constants.js';

const SLAB_THICKNESS = 0.05;

// Place one solid wall segment on a face. A face runs along X (front/back) or
// Z (left/right); `seg` is its {lo, hi} interval in that axis, in world
// coordinates. We convert to a position/size in the ROOM's local frame
// (the group below is translated to the room centre).
function segmentMesh(face, seg, rect, colors, interiorColor, key) {
  const alongX = face === 'front' || face === 'back';
  const segCenter = (seg.lo + seg.hi) / 2;
  const segLength = seg.hi - seg.lo;

  // local coordinates = world minus room centre
  const localCenterAlong = segCenter - (alongX ? rect.centerX : rect.centerZ);
  const faceOffset = {
    front: rect.depth / 2, back: -rect.depth / 2,
    right: rect.width / 2, left: -rect.width / 2,
  }[face];
  const sidingSign = (face === 'front' || face === 'right') ? 1 : -1;

  const position = alongX
    ? [localCenterAlong, WALL_HEIGHT / 2, faceOffset]
    : [faceOffset, WALL_HEIGHT / 2, localCenterAlong];
  const size = alongX
    ? [segLength, WALL_HEIGHT, WALL_THICKNESS]
    : [WALL_THICKNESS, WALL_HEIGHT, segLength];
  const sidingAxis = alongX ? 'z' : 'x';

  return (
    <WallSegment
      key={key}
      position={position}
      size={size}
      color={colors.wall}
      sidingAxis={sidingAxis}
      sidingSign={sidingSign}
      interiorColor={interiorColor}
    />
  );
}

// One room's interior: floor, ceiling, and every solid wall SEGMENT on every
// face. A face isn't simply "wall" or "doorway" any more — a face may be
// solid wall with a child's opening carved partway along it (the L-shape's
// bump-out), leaving stub segments either side. wallSegmentsOn gives those
// intervals; the shared opening itself is filled separately by the child's
// InteriorDoorway. This is what makes the living room's right wall read as a
// continuous wall with the bathroom poking through it, rather than a single
// mis-sized doorway with gaps.
//
// `interiorWallColor` lines the inward face of each wall segment and colours
// the ceiling; the exterior siding stays the house colour. An exterior stub
// beside a bump-out and the shared wall behind the doorway both come from
// this same room, so both get the right split automatically.
export function Room({ roomId, colors }) {
  const rect = roomRect(roomId);
  const { centerX, centerZ, width, depth } = rect;
  const interiorColor = roomById(roomId).interiorWallColor;
  const ceilingColor = interiorColor ?? colors.wall;

  return (
    <group position={[centerX, 0, centerZ]}>
      {/* Floor */}
      <mesh position={[0, SLAB_THICKNESS / 2, 0]}>
        <boxGeometry args={[width, SLAB_THICKNESS, depth]} />
        <meshStandardMaterial color={colors.floor} />
      </mesh>

      {/* Ceiling — top face flush with the wall tops. */}
      <mesh position={[0, WALL_HEIGHT - SLAB_THICKNESS / 2, 0]}>
        <boxGeometry args={[width, SLAB_THICKNESS, depth]} />
        <meshStandardMaterial color={ceilingColor} />
      </mesh>

      {wallFacesOf(roomId).flatMap((face) =>
        wallSegmentsOn(roomId, face).map((seg, i) =>
          segmentMesh(face, seg, rect, colors, interiorColor, `${face}-${i}`)
        )
      )}
    </group>
  );
}