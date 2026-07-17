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
export function InteriorDoorway({ colors, z, animation, open, onToggle }) {
  const flankWidth = (ROOM_WIDTH - DOOR_WIDTH) / 2;
  const flankOffset = DOOR_WIDTH / 2 + flankWidth / 2;

  return (
    <>
      {[-1, 1].map((side) => (
        <WallSegment
          key={side}
          position={[side * flankOffset, WALL_HEIGHT / 2, z]}
          size={[flankWidth, WALL_HEIGHT, 0.05]}
          color={colors.wall}
        />
      ))}
      <Door colors={colors} z={z} animation={animation} open={open} onToggle={onToggle} />
    </>
  );
}