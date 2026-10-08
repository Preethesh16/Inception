import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import SceneCanvas from "./SceneCanvas";
import { Capsule, Crate, PillBottle, Vial, TEAL, WHITE } from "./scenePieces";

/* Features centrepiece: a hospital supply shelf with crates, vials and a pill
   bottle; one crate glides off the shelf to show stock being redistributed. */

function Shelf({ animate }: { animate: boolean }) {
  const root = useRef<Group>(null);
  const mover = useRef<Group>(null);
  const capsule = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / innerWidth - 0.5) * 2;
      pointer.current.y = (e.clientY / innerHeight - 0.5) * 2;
    };
    addEventListener("pointermove", move);
    return () => removeEventListener("pointermove", move);
  }, []);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    if (root.current && animate) {
      const k = 1 - Math.exp(-2 * delta);
      const ry = -0.45 + Math.sin(t * 0.25) * 0.18 + pointer.current.x * 0.15;
      root.current.rotation.y += (ry - root.current.rotation.y) * k;
    }
    if (mover.current && animate) {
      // Slide out, lift, return: a crate leaving and restocking the shelf.
      const p = (t % 6) / 6;
      const out = p < 0.5 ? Math.sin((p / 0.5) * Math.PI) : 0;
      mover.current.position.set(0.85 + out * 0.9, 0.24 + out * 0.35, 0.05 + out * 0.5);
      mover.current.rotation.y = out * 0.6;
    }
    if (capsule.current && animate) {
      capsule.current.position.y = 2.15 + Math.sin(t * 1.2) * 0.08;
      capsule.current.rotation.z = 0.9 + Math.sin(t * 0.8) * 0.15;
      capsule.current.rotation.y = t * 0.6;
    }
  });

  const board = (y: number) => (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={[2.6, 0.07, 0.95]} />
      <meshStandardMaterial color={WHITE} roughness={0.7} />
    </mesh>
  );
  return (
    <group ref={root} position={[0, -0.45, 0]} rotation={[0, -0.45, 0]}>
      {/* frame */}
      {[-1.27, 1.27].map((x) =>
        [-0.43, 0.43].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.95, z]}>
            <boxGeometry args={[0.06, 1.95, 0.06]} />
            <meshStandardMaterial color={TEAL} roughness={0.5} />
          </mesh>
        )),
      )}
      {board(0)}
      {board(0.95)}
      {board(1.9)}
      {/* bottom shelf: crates */}
      <group position={[-0.8, 0.24, 0]}><Crate /></group>
      <group position={[-0.28, 0.24, 0.05]}><Crate /></group>
      <group position={[0.24, 0.24, -0.05]}><Crate /></group>
      <group ref={mover} position={[0.85, 0.24, 0.05]}><Crate /></group>
      {/* middle shelf: vials and bottles */}
      {[-0.95, -0.7, -0.45].map((x, i) => (
        <group key={x} position={[x, 1.17, i % 2 ? 0.12 : -0.05]}><Vial /></group>
      ))}
      <group position={[0.05, 1.17, 0]}><PillBottle /></group>
      <group position={[0.42, 1.17, 0.1]}><PillBottle /></group>
      <group position={[0.85, 1.2, -0.05]}><Crate size={0.32} /></group>
      {/* floating capsule above the top shelf */}
      <group ref={capsule} position={[0.3, 2.15, 0.2]} rotation={[0, 0, 0.9]}>
        <Capsule scale={1.1} />
      </group>
      {/* soft floor shadow */}
      <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.9, 48]} />
        <meshBasicMaterial color="#1c6553" transparent opacity={0.07} />
      </mesh>
    </group>
  );
}

export default function ShelfScene() {
  return (
    <SceneCanvas
      className="feature-scene"
      camera={{ position: [0, 1.7, 5.6], fov: 34 }}
      lookAt={[0, 0.8, 0]}
    >
      {(animate) => <Shelf animate={animate} />}
    </SceneCanvas>
  );
}
