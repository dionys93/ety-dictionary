// web/src/components/house/Door.jsx
import { WallSegment } from './Siding.jsx';
import { Wall } from './Wall.jsx';
import { DOOR_WIDTH, DOOR_HEIGHT, WALL_HEIGHT, FRONT_WALL_Z } from './constants.js';

// A door: a fixed header strip (still wall, same color/siding as everything
// else) sitting above shorter swinging leaves, rather than one panel
// spanning the full wall height. `z` is the wall plane it sits in —
// defaults to the house's front exterior wall; an interior doorway between
// two stacked rooms passes its own boundary's z. `centerX` places it along
// that wall's width (0 = centered). `open`/`onToggle` are controlled from
// HouseExplorer so the same state can also drive the camera fly-in/fly-out.
export function Door({ colors, width = DOOR_WIDTH, height = DOOR_HEIGHT, animation = 'swingDoorOut', open, onToggle, z = FRONT_WALL_Z, centerX = 0 }) {
  const headerHeight = WALL_HEIGHT - height;
  const headerY = height + headerHeight / 2;

  return (
    <group>
      <WallSegment position={[centerX, headerY, z]} size={[width, headerHeight, 0.05]} color={colors.wall} sidingBoards={2} />

      <Wall animation={animation} width={width} height={height} position={[centerX, 0, z]} open={open} onToggle={onToggle} colors={colors} />
    </group>
  );
}