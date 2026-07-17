// web/src/components/house/GroundFloorRoom.jsx
import { Room } from './Room.jsx';
import { FrontFacade } from './FrontFacade.jsx';
import { Door } from './Door.jsx';
import { DOOR_WIDTH } from './constants.js';

// The frontmost room: its interior, its front-facing wall segments with
// windows, and the house's exterior front door. This is the only room with
// an exterior presence — every room behind it is reached through an
// InteriorDoorway instead.
//
// `hasBackWall` should be false when another room sits directly behind this
// one (an interior doorway takes the wall's place) — HouseExplorer derives
// that from the room's position in ROOMS rather than it being hand-set.
export function GroundFloorRoom({ colors, open, onToggle, hasBackWall, interiorWallColor, doorway }) {
  return (
    <>
      <Room colors={colors} centerZ={0} hasBackWall={hasBackWall} interiorWallColor={interiorWallColor} />
      <FrontFacade colors={colors} doorWidth={DOOR_WIDTH} />
      <Door colors={colors} centerX={doorway.centerX} animation={doorway.animation} open={open} onToggle={onToggle} />
    </>
  );
}