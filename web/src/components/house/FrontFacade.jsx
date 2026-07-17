// web/src/components/house/FrontFacade.jsx
import { WallWithWindow } from './Window.jsx';
import { ROOM_WIDTH, WALL_HEIGHT } from './constants.js';

// The two fixed wall segments flanking one room's own door, each with an
// actual window opening in it. `centerX`/`roomWidth` place and size this
// for whichever room slot it belongs to — static, these never move, unlike
// the door between them.
export function FrontFacade({ colors, doorWidth, roomWidth = ROOM_WIDTH, centerX = 0 }) {
  const flankWidth = (roomWidth - doorWidth) / 2;
  const flankOffset = doorWidth / 2 + flankWidth / 2;

  return (
    <>
      {[-1, 1].map((side) => (
        <WallWithWindow key={side} x={centerX + side * flankOffset} width={flankWidth} height={WALL_HEIGHT} colors={colors} />
      ))}
    </>
  );
}