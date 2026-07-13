// web/src/components/HouseExplorer.jsx
import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { WALL_ANIMATIONS } from '../utils/wallAnimations.js';
import { COLOR_SCHEMES } from '../utils/houseColors.js';

const LERP_SPEED = 0.08;

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

  // The animated group sits at the panel's transform (position + rotation);
  // the actual door mesh is offset from the group's origin by `pivot`. For
  // sliding animations pivot is [0,0,0] (mesh centered on the group, so this
  // is a no-op). For swinging animations pivot offsets the mesh so the
  // group's origin — the thing rotation.y actually rotates around — lands
  // on the door's hinge edge instead of its center.
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
    </group>
  );
}

function Wall({ animation = 'swingDoorsOut', width = 2, height = 1, thickness = 0.05, position = [0, 0, 0.75], onToggle, colors }) {
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
        <boxGeometry args={[2, 0.05, 1.5]} />
        <meshStandardMaterial color={colors.floor} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 0.5, -0.75]}>
        <boxGeometry args={[2, 1, 0.05]} />
        <meshStandardMaterial color={colors.wall} />
      </mesh>

      {/* Left wall */}
      <mesh position={[-1, 0.5, 0]}>
        <boxGeometry args={[0.05, 1, 1.5]} />
        <meshStandardMaterial color={colors.wall} />
      </mesh>

      {/* Right wall */}
      <mesh position={[1, 0.5, 0]}>
        <boxGeometry args={[0.05, 1, 1.5]} />
        <meshStandardMaterial color={colors.wall} />
      </mesh>

      {/* One placeholder item so the room isn't just an empty box */}
      <mesh position={[0, 0.2, -0.4]}>
        <boxGeometry args={[0.4, 0.35, 0.3]} />
        <meshStandardMaterial color={colors.item} />
      </mesh>
    </group>
  );
}

function Roof({ colors }) {
  return (
    <mesh position={[0, 1.35, 0]} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[1.6, 0.8, 4]} />
      <meshStandardMaterial color={colors.roof} />
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
        <Wall colors={colors} />

        <OrbitControls enablePan={false} minDistance={3} maxDistance={12} />
      </Canvas>
    </div>
  );
}