// web/src/components/house/Roof.jsx
import { useMemo, useEffect } from 'react';
import { createShingleTexture } from '../../utils/proceduralTextures.js';
import { EAVE_HEIGHT, HOUSE_WIDTH, HOUSE_DEPTH } from './constants.js';
import { ROOF_RISE, ROOF_DEPTH_OVERHANG, ROOF_THICKNESS, roofRun } from './roofGeometry.js';

// A ridge (gable) roof: two flat sloped panels meeting at a horizontal
// ridge line. The house is elongated along Z (deeper, as rooms stack
// behind the front one) rather than X, so the ridge runs along Z and the
// two slopes span X. `centerZ` is the room stack's own Z-midpoint (the
// caller computes it, since only it knows the stack's layout) — 0 for a
// single room, further back as more stack up.
//
// The slope constants live in roofGeometry.js and are shared with the
// walls (Room.jsx, Door.jsx, FrontFacade.jsx, InteriorDoorway.jsx, via
// WALL_HEIGHT) and the gable-end triangles (GableEnd.jsx) — so all of them
// are guaranteed to meet this exact slope, not an independently-guessed one.
export function Roof({ colors, houseWidth = HOUSE_WIDTH, houseDepth = HOUSE_DEPTH, centerZ = 0 }) {
  const run = roofRun(houseWidth);
  const slant = Math.sqrt(run * run + ROOF_RISE * ROOF_RISE);
  const pitch = Math.atan2(ROOF_RISE, run);
  const panelLength = houseDepth + ROOF_DEPTH_OVERHANG * 2;
  const centerY = EAVE_HEIGHT + ROOF_RISE / 2;

  const texture = useMemo(
    () => createShingleTexture(colors.roof, { repeatX: 2, repeatY: Math.max(2, Math.round(houseDepth)) }),
    [colors.roof, houseDepth]
  );
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group position={[0, 0, centerZ]}>
      {/* right slope (+X) */}
      <mesh position={[run / 2, centerY, 0]} rotation={[0, 0, -pitch]}>
        <boxGeometry args={[slant, ROOF_THICKNESS, panelLength]} />
        <meshStandardMaterial map={texture} />
      </mesh>
      {/* left slope (-X): mirror of the right */}
      <mesh position={[-run / 2, centerY, 0]} rotation={[0, 0, pitch]}>
        <boxGeometry args={[slant, ROOF_THICKNESS, panelLength]} />
        <meshStandardMaterial map={texture} />
      </mesh>
    </group>
  );
}