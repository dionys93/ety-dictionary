// web/src/components/HouseExplorer.jsx
import { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ANIMATIONS } from '../utils/animations.js';
import { COLOR_SCHEMES } from '../utils/houseColors.js';
import { createShingleTexture, createGrassTexture } from '../utils/proceduralTextures.js';

const LERP_SPEED = 0.08;
const DOOR_WIDTH = 0.4;
const DOOR_HEIGHT = 0.75; // shorter than the house so there's wall (a header) above it
const HOUSE_WIDTH = 2;
const HOUSE_HEIGHT = 1;
const HOUSE_DEPTH = 1.5;
const GROUND_SIZE = 30;
const GROUND_THICKNESS = 0.3;

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

// Just the glass — it sits in an actual hole in the wall (see
// WallWithWindow below), so whatever's genuinely behind it shows through
// the tint, rather than a painted-on illusion.
function Window({ width = 0.32, height = 0.32 }) {
  return (
    <mesh position={[0, 0, 0.04]}>
      <boxGeometry args={[width, height, 0.01]} />
      <meshStandardMaterial color="#bfe3f0" transparent opacity={0.3} roughness={0.1} />
    </mesh>
  );
}

// A flat wall with a genuine rectangular hole cut into it — built from 4
// surrounding wall segments (top/bottom/left/right of the opening) instead
// of one solid box, the same trick used for the doorway. The glass sits in
// the actual gap, so there's real depth behind it, and a plain white trim
// frames the opening from outside — extending onto the wall, not over the
// glass, so it never fights with the transparent pane.
function WallWithWindow({ x, width, height, colors, windowWidth = 0.32, windowHeight = 0.32, windowCenterY = height * 0.62 }) {
  const holeTop = windowCenterY + windowHeight / 2;
  const holeBottom = windowCenterY - windowHeight / 2;
  const sideWidth = (width - windowWidth) / 2;
  const trimWidth = 0.015;
  const trimColor = '#ffffff';

  return (
    <group position={[x, 0, 0.75]}>
      {/* top segment, above the opening */}
      <mesh position={[0, (holeTop + height) / 2, 0]}>
        <boxGeometry args={[width, height - holeTop, 0.05]} />
        <meshStandardMaterial color={colors.wall} />
      </mesh>
      <group position={[0, (holeTop + height) / 2, 0]}>
        <Siding width={width} height={height - holeTop} color={colors.wall} axis="z" sign={1} boards={2} />
      </group>

      {/* bottom segment, below the opening */}
      <mesh position={[0, holeBottom / 2, 0]}>
        <boxGeometry args={[width, holeBottom, 0.05]} />
        <meshStandardMaterial color={colors.wall} />
      </mesh>
      <group position={[0, holeBottom / 2, 0]}>
        <Siding width={width} height={holeBottom} color={colors.wall} axis="z" sign={1} boards={3} />
      </group>

      {/* left segment, beside the opening */}
      <mesh position={[-(windowWidth / 2 + sideWidth / 2), windowCenterY, 0]}>
        <boxGeometry args={[sideWidth, windowHeight, 0.05]} />
        <meshStandardMaterial color={colors.wall} />
      </mesh>
      <group position={[-(windowWidth / 2 + sideWidth / 2), windowCenterY, 0]}>
        <Siding width={sideWidth} height={windowHeight} color={colors.wall} axis="z" sign={1} boards={2} />
      </group>

      {/* right segment, beside the opening */}
      <mesh position={[windowWidth / 2 + sideWidth / 2, windowCenterY, 0]}>
        <boxGeometry args={[sideWidth, windowHeight, 0.05]} />
        <meshStandardMaterial color={colors.wall} />
      </mesh>
      <group position={[windowWidth / 2 + sideWidth / 2, windowCenterY, 0]}>
        <Siding width={sideWidth} height={windowHeight} color={colors.wall} axis="z" sign={1} boards={2} />
      </group>

      {/* White trim/casing around the opening — a plain border, no muntin
          bars across the glass. Extends outward from the opening's edge
          onto the wall (not inward over the glass), so it never overlaps
          the transparent pane. */}
      <mesh position={[0, windowCenterY + windowHeight / 2 + trimWidth / 2, 0.03]}>
        <boxGeometry args={[windowWidth + trimWidth * 2, trimWidth, 0.02]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[0, windowCenterY - windowHeight / 2 - trimWidth / 2, 0.03]}>
        <boxGeometry args={[windowWidth + trimWidth * 2, trimWidth, 0.02]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[-(windowWidth / 2 + trimWidth / 2), windowCenterY, 0.03]}>
        <boxGeometry args={[trimWidth, windowHeight, 0.02]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[windowWidth / 2 + trimWidth / 2, windowCenterY, 0.03]}>
        <boxGeometry args={[trimWidth, windowHeight, 0.02]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>

      {/* the glass sits in the actual opening — nothing opaque behind it */}
      <group position={[0, windowCenterY, 0]}>
        <Window width={windowWidth} height={windowHeight} />
      </group>
    </group>
  );
}

// The two fixed wall segments flanking the (narrower) front door, each with
// an actual window opening in it. Static — these never move, unlike the door.
function FrontFacade({ colors, doorWidth }) {
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

function WallPanel({ size, pivot = [0, 0, 0], closed, open, isOpen, onToggle, colors }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (!ref.current) return;
    const target = isOpen ? open : closed;
    const p = ref.current.position;
    p.x += (target.position[0] - p.x) * LERP_SPEED;
    p.y += (target.position[1] - p.y) * LERP_SPEED;
    p.z += (target.position[2] - p.z) * LERP_SPEED;
    ref.current.rotation.y += (target.rotation - ref.current.rotation.y) * LERP_SPEED;
  });

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
        <meshStandardMaterial color={hovered ? colors.doorHover : colors.door} />
      </mesh>

      <mesh position={[knobX, -size[1] * 0.12, knobZ]}>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshStandardMaterial color="#d4af37" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Wall({ animation = 'swingDoorOut', width = HOUSE_WIDTH, height = HOUSE_HEIGHT, thickness = 0.05, position = [0, 0, 0.75], onToggle, colors }) {
  const [open, setOpen] = useState(false);
  const panels = ANIMATIONS[animation](width, height, thickness);

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

// The front door as its own concept: a fixed header strip (still wall, same
// color/siding as everything else) sitting above shorter swinging leaves,
// rather than one panel spanning the full house height.
function Door({ colors, width = DOOR_WIDTH, height = DOOR_HEIGHT, animation = 'swingDoorOut' }) {
  const headerHeight = HOUSE_HEIGHT - height;
  const headerY = height + headerHeight / 2;

  return (
    <group>
      <mesh position={[0, headerY, 0.75]}>
        <boxGeometry args={[width, headerHeight, 0.05]} />
        <meshStandardMaterial color={colors.wall} />
      </mesh>
      <group position={[0, headerY, 0.75]}>
        <Siding width={width} height={headerHeight} color={colors.wall} axis="z" sign={1} boards={2} />
      </group>

      <Wall animation={animation} width={width} height={height} position={[0, 0, 0.75]} colors={colors} />
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

// A large solid slab of ground, textured with a procedural grass pattern.
// Its top surface sits exactly at y=0 — the same level as the bottom of
// every wall and the floor — so the house appears to grow straight out of
// it with no gap or seam, and there's real geometry (not empty space)
// blocking any view of the house's underside.
function Ground({ colors }) {
  const texture = useMemo(() => createGrassTexture(colors.ground), [colors.ground]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={[0, -GROUND_THICKNESS / 2, 0]}>
      <boxGeometry args={[GROUND_SIZE, GROUND_THICKNESS, GROUND_SIZE]} />
      <meshStandardMaterial map={texture} />
    </mesh>
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

        <Ground colors={colors} />
        <Room colors={colors} />
        <Roof colors={colors} />
        <FrontFacade colors={colors} doorWidth={DOOR_WIDTH} />
        <Door colors={colors} />

        <OrbitControls enablePan={false} minDistance={3} maxDistance={12} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
    </div>
  );
}