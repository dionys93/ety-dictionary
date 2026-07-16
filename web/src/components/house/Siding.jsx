// web/src/components/house/Siding.jsx

// Renders a stack of thin horizontal "board" strips proud of a flat wall —
// real geometry, not a texture, so it actually catches light and casts
// shadow between boards instead of just looking painted on. `axis`/`sign`
// say which local direction is "outward" so the same component works for
// walls facing any of the house's four sides.
export function Siding({ width, height, color, axis = 'z', sign = 1, boards = 6 }) {
  const spacing = height / boards;
  const boardThickness = spacing * 0.8; // leaves a visible groove between boards
  const proud = 0.015;

  return (
    <group>
      {Array.from({ length: boards }).map((_, i) => {
        const y = -height / 2 + spacing * (i + 0.5);
        const size = axis === 'z' ? [width, boardThickness, 0.02] : [0.02, boardThickness, width];
        const position = axis === 'z' ? [0, y, sign * proud] : [sign * proud, y, 0];
        return (
          <mesh key={i} position={position}>
            <boxGeometry args={size} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
    </group>
  );
}

// A flat wall mesh plus its Siding overlay, sharing one position instead of
// being written as two separately-positioned elements that have to be kept
// in sync by hand — this exact pairing used to repeat 8 times across the
// house before being pulled out here.
export function WallSegment({ position, size, color, sidingAxis = 'z', sidingSign = 1, sidingBoards = 6 }) {
  const sidingWidth = sidingAxis === 'z' ? size[0] : size[2];

  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} />
      </mesh>
      <Siding width={sidingWidth} height={size[1]} color={color} axis={sidingAxis} sign={sidingSign} boards={sidingBoards} />
    </group>
  );
}