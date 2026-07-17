// web/src/components/house/Door.jsx
import { WallSegment } from './Siding.jsx';
import { Wall } from './Wall.jsx';
import { DOOR_WIDTH, DOOR_HEIGHT, WALL_HEIGHT } from './constants.js';

// A door: a fixed header strip (still wall, same color/siding as everything
// else) sitting above shorter swinging leaves, rather than one panel
// spanning the full house height. `z` places it at whichever boundary it
// belongs to — the default (0.75) is the house's front exterior wall; an
// interior doorway between two stacked rooms uses whatever z their shared
// boundary sits at instead. `centerX` places it along that wall's own
// width — 0 (centered) by default, off to a side otherwise. `open`/
// `onToggle` are controlled from HouseExplorer so the same state can also
// drive the camera fly-in/fly-out.
export function Door({ colors, width = DOOR_WIDTH, height = DOOR_HEIGHT, animation = 'swingDoorOut', open, onToggle, z = 0.75, centerX = 0 }) {
  const headerHeight = WALL_HEIGHT - height;
  const headerY = height + headerHeight / 2;

  return (
    <group>
      <WallSegment position={[centerX, headerY, z]} size={[width, headerHeight, 0.05]} color={colors.wall} sidingBoards={2} />

      <Wall animation={animation} width={width} height={height} position={[centerX, 0, z]} open={open} onToggle={onToggle} colors={colors} />
    </group>
  );
}