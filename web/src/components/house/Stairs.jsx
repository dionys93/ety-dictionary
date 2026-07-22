// web/src/components/house/Stairs.jsx
import { useState } from 'react';

const TREAD = '#b8a888';

export function Stairs({ stair, onNavigate, colors }) {
  const [hovered, setHovered] = useState(false);
  const { overlapRect, rise } = stair;

  const runAlongZ = overlapRect.depth >= overlapRect.width;
  const steps = Math.max(4, Math.round(rise / 0.18));
  const availLong = runAlongZ ? overlapRect.depth : overlapRect.width;
  const availShort = runAlongZ ? overlapRect.width : overlapRect.depth;
  const runLen = Math.min(steps * 0.26, availLong * 0.9);
  const width = Math.min(0.9, availShort * 0.8);
  const stepD = runLen / steps;
  const stepH = rise / steps;

  return (
    <group
      position={[overlapRect.centerX, stair.position[1], overlapRect.centerZ]}
      onClick={(e) => { e.stopPropagation(); onNavigate(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
    >
      {Array.from({ length: steps }, (_, i) => {
        const along = -runLen / 2 + stepD * (i + 0.5);
        const y = stepH * (i + 0.5);
        const pos = runAlongZ ? [0, y, along] : [along, y, 0];
        const size = runAlongZ ? [width, stepH, stepD] : [stepD, stepH, width];
        return (
          <mesh key={i} position={pos}>
            <boxGeometry args={size} />
            <meshStandardMaterial color={hovered ? (colors.doorHover ?? TREAD) : TREAD} />
          </mesh>
        );
      })}
    </group>
  );
}