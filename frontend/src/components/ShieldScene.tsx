import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ExtrudeGeometry, Shape, type Group } from "three";
import SceneCanvas from "./SceneCanvas";
import { Capsule, TEAL, WHITE, GREEN } from "./scenePieces";

/* FAQ visual: a protective shield with a medical cross, with capsules in a
   slow orbit. Stands for the safeguards the FAQ answers explain. */

function Shield({ animate }: { animate: boolean }) {
  const shield = useRef<Group>(null);
  const orbit = useRef<Group>(null);
  const geometry = useMemo(() => {
    const s = new Shape();
    s.moveTo(0, 1.15);
    s.quadraticCurveTo(0.55, 1.05, 0.95, 0.85);
    s.lineTo(0.95, 0.15);
    s.quadraticCurveTo(0.85, -0.75, 0, -1.2);
    s.quadraticCurveTo(-0.85, -0.75, -0.95, 0.15);
    s.lineTo(-0.95, 0.85);
    s.quadraticCurveTo(-0.55, 1.05, 0, 1.15);
    const g = new ExtrudeGeometry(s, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.07,
      bevelSegments: 6,
      curveSegments: 24,
    });
    g.center();
    return g;
  }, []);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.getElapsedTime();
    if (shield.current) {
      shield.current.rotation.y = Math.sin(t * 0.6) * 0.45;
      shield.current.position.y = Math.sin(t * 1.1) * 0.08;
    }
    if (orbit.current) orbit.current.rotation.y = t * 0.45;
  });

  return (
    <group>
      <group ref={shield}>
        <mesh geometry={geometry}>
          <meshStandardMaterial color={TEAL} roughness={0.35} metalness={0.05} />
        </mesh>
        {/* inner face plate */}
        <mesh position={[0, 0, 0.2]} scale={[0.8, 0.8, 1]} geometry={geometry}>
          <meshStandardMaterial color={WHITE} roughness={0.5} />
        </mesh>
        {/* medical cross */}
        <mesh position={[0, 0.05, 0.42]}>
          <boxGeometry args={[0.62, 0.2, 0.08]} />
          <meshStandardMaterial color={GREEN} />
        </mesh>
        <mesh position={[0, 0.05, 0.42]}>
          <boxGeometry args={[0.2, 0.62, 0.08]} />
          <meshStandardMaterial color={GREEN} />
        </mesh>
      </group>
      <group ref={orbit} rotation={[0.35, 0, 0.15]}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          return (
            <group
              key={i}
              position={[Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75]}
              rotation={[0.4 * i, a, 0.9]}
            >
              <Capsule scale={0.85} />
            </group>
          );
        })}
      </group>
      <mesh position={[0, -1.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.2, 48]} />
        <meshBasicMaterial color="#1c6553" transparent opacity={0.08} />
      </mesh>
    </group>
  );
}

export default function ShieldScene() {
  return (
    <SceneCanvas
      className="faq-scene"
      camera={{ position: [0, 0.6, 5.4], fov: 38 }}
      lookAt={[0, -0.1, 0]}
    >
      {(animate) => <Shield animate={animate} />}
    </SceneCanvas>
  );
}
