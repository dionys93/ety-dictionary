// web/src/components/house/Door.jsx
import { WallSegment } from './Siding.jsx';
import { Wall } from './Wall.jsx';
import { DOOR_WIDTH, DOOR_HEIGHT, HOUSE_HEIGHT } from './constants.js';

// The front door as its own concept: a fixed header strip (still wall, same
// color/siding as everything else) sitting above shorter swinging leaves,
// rather than one panel spanning the full house height. `open`/`onToggle`
// are controlled from HouseExplorer so the same state can also drive the
// camera fly-in/fly-out — clicking a door leaf and clicking the exit arrow
// both end up calling the same toggle function.
export function Door({ colors, width = DOOR_WIDTH, height = DOOR_HEIGHT, animation = 'swingDoorOut', open, onToggle }) {
  const headerHeight = HOUSE_HEIGHT - height;
  const headerY = height + headerHeight / 2;

  return (
    <group>
      <WallSegment position={[0, headerY, 0.75]} size={[width, headerHeight, 0.05]} color={colors.wall} sidingBoards={2} />

      <Wall animation={animation} width={width} height={height} position={[0, 0, 0.75]} open={open} onToggle={onToggle} colors={colors} />
    </group>
  );
}