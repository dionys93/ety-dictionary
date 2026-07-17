// web/src/components/house/Wall.jsx
import { ANIMATIONS } from '../../utils/animations.js';
import { WallPanel } from './WallPanel.jsx';
import { HOUSE_WIDTH, WALL_HEIGHT } from './constants.js';

// A generic wall that can open via any registered animation — kept
// independent of Door so it stays reusable for a different opening later
// (a second door, a garage) without dragging Door's header/sizing along.
// `open`/`onToggle` are controlled from HouseExplorer.
export function Wall({ animation = 'swingDoorOut', width = HOUSE_WIDTH, height = WALL_HEIGHT, thickness = 0.05, position = [0, 0, 0.75], open, onToggle, colors }) {
  const panels = ANIMATIONS[animation](width, height, thickness);

  return (
    <group position={position}>
      {panels.map((panel, i) => (
        <WallPanel key={i} {...panel} isOpen={open} onToggle={onToggle} colors={colors} />
      ))}
    </group>
  );
}