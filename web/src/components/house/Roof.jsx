// web/src/components/house/Roof.jsx
import { useMemo, useEffect } from 'react';
import { createShingleTexture } from '../../utils/proceduralTextures.js';

export function Roof({ colors }) {
  const texture = useMemo(() => createShingleTexture(colors.roof), [colors.roof]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={[0, 1.35, 0]} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[1.6, 0.8, 4]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
}