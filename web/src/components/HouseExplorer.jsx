// web/src/components/HouseExplorer.jsx
import { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { WALL_ANIMATIONS } from '../utils/wallAnimations.js';
import { COLOR_SCHEMES } from '../utils/houseColors.js';
import { createShingleTexture } from '../utils/proceduralTextures.js';

const LERP_SPEED = 0.08;
const DOOR_WIDTH = 0.7;
const HOUSE_WIDTH = 2;
const HOUSE_HEIGHT = 1;
const HOUSE_DEPTH = 1.5;

// Renders a stack of thin horizontal "board" strips proud of a flat wall —
// real geometry, not a texture, so it actually catches light and casts
// shadow between boards instead of just looking painted on. `axis`/`sign`
// say which local direction is "outward" so the same component works for
// walls facing any of the house's four sides.
function Siding({ width, height, color, axis = 'z', sign = 1, boards = 6 }) {
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

// A simple frame + glass pane, proud of whatever wall it's placed on.
function Window({ width = 0.32, height = 0.32 }) {
  return (
    <group>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[width + 0.06, height + 0.06, 0.02]} />
        <meshStandardMaterial color="#5b4636" />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <boxGeometry args={[width, height, 0.01]} />
        <meshStandardMaterial color="#bfe3f0" transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

// The two fixed wall segments flanking the (narrower) front door, each with
// its own siding and a window. Static — these never move, unlike the door.
function FrontFacade({ colors, doorWidth }) {
  const flankWidth = (HOUSE_WIDTH - doorWidth) / 2;
  const flankCenterX = doorWidth / 2 + flankWidth / 2;

  return (
    <>
      {[-1, 1].map((side) => {
        const x = side * flankCenterX;
        return (
          <group key={side}>
            <mesh position={[x, HOUSE_HEIGHT / 2, 0.75]}>
              <boxGeometry args={[flankWidth, HOUSE_HEIGHT, 0.05]} />
              <meshStandardMaterial color={colors.wall} />
            </mesh>
            <group position={[x, HOUSE_HEIGHT / 2, 0.75]}>
              <Siding width={flankWidth} height={HOUSE_HEIGHT} color={colors.wall} axis="z" sign={1} />
            </group>
            <group position={[x, HOUSE_HEIGHT * 0.62, 0.75]}>
              <Window />
            </group>
          </group>
        );
      })}
    </>
  );
}

function WallPanel({ size, pivot = [0, 0, 0], closed, open, isOpen, onToggle, colors }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);

  // The lerp target just depends on which state we're currently in — this
  // is what makes "reverse" free: flip isOpen back to false and every
  // animation eases back toward its own `closed` transform, whatever that
  // happens to mean for that animation (rise up, slide back together,
  // swing shut).
  useFrame(() => {
    if (!ref.current) return;
    const target = isOpen ? open : closed;
    const p = ref.current.position;
    p.x += (target.position[0] - p.x) * LERP_SPEED;
    p.y += (target.position[1] - p.y) * LERP_SPEED;
    p.z += (target.position[2] - p.z) * LERP_SPEED;
    ref.current.rotation.y += (target.rotation - ref.current.rotation.y) * LERP_SPEED;
  });

  // Doorknob sits near whichever edge of this panel meets the other door
  // (or right-of-center for a single full-width panel), inferred from which
  // side of center this panel's closed position sits on — works for any
  // animation without needing to know which one is active.
  const knobSign = closed.position[0] < 0 ? 1 : closed.position[0] > 0 ? -1 : 1;
  const knobX = pivot[0] + knobSign * (size[0] / 2 - 0.08);
  const knobZ = pivot[2] + size[2] / 2 + 0.02;

  return (
    <group ref={ref} position={closed.position} rotation={[0, closed.rotation, 0]}>
      <mesh
        position={pivot}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial color={hovered ? colors.wallHover : colors.wall} />
      </mesh>

      <mesh position={[knobX, -size[1] * 0.12, knobZ]}>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshStandardMaterial color="#d4af37" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Wall({ animation = 'doubleDoors', width = HOUSE_WIDTH, height = HOUSE_HEIGHT, thickness = 0.05, position = [0, 0, 0.75], onToggle, colors }) {
  const [open, setOpen] = useState(false);
  const panels = WALL_ANIMATIONS[animation](width, height, thickness);

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      onToggle?.(next);
      return next;
    });
  };

  return (
    <group position={position}>
      {panels.map((panel, i) => (
        <WallPanel key={i} {...panel} isOpen={open} onToggle={handleToggle} colors={colors} />
      ))}
    </group>
  );
}

function Room({ colors }) {
  return (
    <group>
      {/* Floor */}
      <mesh position={[0, 0.025, 0]}>
        <boxGeometry args={[HOUSE_WIDTH, 0.05, HOUSE_DEPTH]} />
        <meshStandardMaterial color={colors.floor} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 0.5, -0.75]}>
        <boxGeometry args={[HOUSE_WIDTH, HOUSE_HEIGHT, 0.05]} />
        <meshStandardMaterial color={colors.wall} />
      </mesh>
      <group position={[0, 0.5, -0.75]}>
        <Siding width={HOUSE_WIDTH} height={HOUSE_HEIGHT} color={colors.wall} axis="z" sign={-1} />
      </group>

      {/* Left wall */}
      <mesh position={[-1, 0.5, 0]}>
        <boxGeometry args={[0.05, HOUSE_HEIGHT, HOUSE_DEPTH]} />
        <meshStandardMaterial color={colors.wall} />
      </mesh>
      <group position={[-1, 0.5, 0]}>
        <Siding width={HOUSE_DEPTH} height={HOUSE_HEIGHT} color={colors.wall} axis="x" sign={-1} />
      </group>

      {/* Right wall */}
      <mesh position={[1, 0.5, 0]}>
        <boxGeometry args={[0.05, HOUSE_HEIGHT, HOUSE_DEPTH]} />
        <meshStandardMaterial color={colors.wall} />
      </mesh>
      <group position={[1, 0.5, 0]}>
        <Siding width={HOUSE_DEPTH} height={HOUSE_HEIGHT} color={colors.wall} axis="x" sign={1} />
      </group>

      {/* One placeholder item so the room isn't just an empty box */}
      <mesh position={[0, 0.2, -0.4]}>
        <boxGeometry args={[0.4, 0.35, 0.3]} />
        <meshStandardMaterial color={colors.item} />
      </mesh>
    </group>
  );
}

function Roof({ colors }) {
  const texture = useMemo(() => createShingleTexture(colors.roof), [colors.roof]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={[0, 1.35, 0]} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[1.6, 0.8, 4]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
}

export default function HouseExplorer({ colorScheme = 'robinsEgg' }) {
  const colors = COLOR_SCHEMES[colorScheme];

  return (
    <div style={{ width: '100%', height: '600px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      <Canvas camera={{ position: [4, 3, 5], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />

        <Room colors={colors} />
        <Roof colors={colors} />
        <FrontFacade colors={colors} doorWidth={DOOR_WIDTH} />
        <Wall animation="swingDoorsOut" width={DOOR_WIDTH} colors={colors} />

        <OrbitControls enablePan={false} minDistance={3} maxDistance={12} />
      </Canvas>
    </div>
  );
}