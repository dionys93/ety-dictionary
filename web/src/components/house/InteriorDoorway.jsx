// web/src/components/house/InteriorDoorway.jsx
import { WallSegment } from './Siding.jsx';
import { Door } from './Door.jsx';
import { ROOM_WIDTH, DOOR_WIDTH, WALL_HEIGHT } from './constants.js';

// A doorway between two stacked rooms: the swinging door itself, plus solid
// wall segments filling the rest of the shared boundary's width. The door
// alone is only DOOR_WIDTH wide — far narrower than the ROOM_WIDTH-wide
// room it's supposedly closing off. This is the interior equivalent of
// FrontFacade (which does the same job for the exterior door), just
// without windows, since nothing needs a window looking into another room.
//
// `centerX` doesn't have to be 0 — the two flanking segments are computed
// independently (not as two equal halves), so the door can sit anywhere
// along the wall's width and the flanks still tile the full width exactly.
//
// `interiorWallColor`, if given, colors the side facing whichever room is
// on the far side of `z` from `colors.wall`'s own siding — for the living
// room/kitchen boundary specifically, siding defaults to facing the living
// room, so this lands on the kitchen-facing side (see WallSegment).
export function InteriorDoorway({ colors, z, centerX = 0, animation, open, onToggle, interiorWallColor }) {
  const leftFlankSpan = [-ROOM_WIDTH / 2, centerX - DOOR_WIDTH / 2];
  const rightFlankSpan = [centerX + DOOR_WIDTH / 2, ROOM_WIDTH / 2];
  const leftFlankWidth = leftFlankSpan[1] - leftFlankSpan[0];
  const rightFlankWidth = rightFlankSpan[1] - rightFlankSpan[0];
  const leftFlankCenterX = (leftFlankSpan[0] + leftFlankSpan[1]) / 2;
  const rightFlankCenterX = (rightFlankSpan[0] + rightFlankSpan[1]) / 2;

  return (
    <>
      <WallSegment position={[leftFlankCenterX, WALL_HEIGHT / 2, z]} size={[leftFlankWidth, WALL_HEIGHT, 0.05]} color={colors.wall} interiorColor={interiorWallColor} />
      <WallSegment position={[rightFlankCenterX, WALL_HEIGHT / 2, z]} size={[rightFlankWidth, WALL_HEIGHT, 0.05]} color={colors.wall} interiorColor={interiorWallColor} />
      <Door colors={colors} z={z} centerX={centerX} animation={animation} open={open} onToggle={onToggle} />
    </>
  );
}