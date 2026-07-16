// web/src/components/house/FrontFacade.jsx
import { WallWithWindow } from './Window.jsx';
import { HOUSE_WIDTH, HOUSE_HEIGHT } from './constants.js';

// The two fixed wall segments flanking the (narrower) front door, each with
// an actual window opening in it. Static — these never move, unlike the door.
export function FrontFacade({ colors, doorWidth }) {
  const flankWidth = (HOUSE_WIDTH - doorWidth) / 2;
  const flankCenterX = doorWidth / 2 + flankWidth / 2;

  return (
    <>
      {[-1, 1].map((side) => (
        <WallWithWindow key={side} x={side * flankCenterX} width={flankWidth} height={HOUSE_HEIGHT} colors={colors} />
      ))}
    </>
  );
}