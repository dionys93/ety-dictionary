// web/src/components/house/GroundFloorRoom.jsx
import { Room } from './Room.jsx';
import { FrontFacade } from './FrontFacade.jsx';
import { Door } from './Door.jsx';
import { DOOR_WIDTH } from './constants.js';

// The single exterior-facing room: its interior, its own front-facing wall
// segments with windows, and the house's front door. `hasBackWall` should
// be false if another room sits directly behind this one (an interior
// doorway takes its place instead of a solid wall) — see Room.jsx.
export function GroundFloorRoom({ colors, open, onToggle, hasBackWall = true }) {
  return (
    <>
      <Room colors={colors} centerZ={0} hasBackWall={hasBackWall} />
      <FrontFacade colors={colors} doorWidth={DOOR_WIDTH} />
      <Door colors={colors} open={open} onToggle={onToggle} />
    </>
  );
}