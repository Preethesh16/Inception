import { Component, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  Group,
  LineDashedMaterial,
  Line,
  Mesh,
  MeshBasicMaterial,
  QuadraticBezierCurve3,
  Vector3,
} from "three";

/* Sign-in visual: medical supply redistribution between two hospitals.
   A donor platform holds stacked supply crates; one crate lifts off, follows
   a dashed transfer arc and lands on the recipient platform, whose ring
   pulses on arrival. A capsule and a vial float nearby. */

const WHITE = "#f4faf7";
const GREEN = "#1c6553";
const MINT = "#8fe0c2";
const TEAL = "#2b8a72";

const DONOR = new Vector3(-1.35, 0, -0.55);
const RECIPIENT = new Vector3(1.45, 0, 0.75);
const CRATE = 0.46;
const CYCLE = 4.2; // seconds per transfer

function Crate({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh>
        <boxGeometry args={[CRATE, CRATE, CRATE]} />
        <meshStandardMaterial color={WHITE} roughness={0.55} />
      </mesh>
      {/* green straps */}
      <mesh>
        <boxGeometry args={[CRATE + 0.01, CRATE + 0.01, 0.07]} />
        <meshStandardMaterial color={TEAL} roughness={0.6} />
      </mesh>
      {/* cross on the lid */}
      <group position={[0, CRATE / 2 + 0.006, 0]}>
        <mesh>
          <boxGeometry args={[0.24, 0.012, 0.08]} />
          <meshStandardMaterial color={GREEN} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.08, 0.012, 0.24]} />
          <meshStandardMaterial color={GREEN} />
        </mesh>
      </group>
    </group>
  );
}

function Platform({ position, ringRef }: { position: Vector3; ringRef?: RefObject<Mesh | null> }) {
  return (
    <group position={position}>
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.95, 1.0, 0.12, 48]} />
        <meshStandardMaterial color="#dfeee7" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.9, 0.015, 8, 64]} />
        <meshStandardMaterial color={TEAL} emissive={TEAL} emissiveIntensity={0.4} />
      </mesh>
      {ringRef && (
        <mesh ref={ringRef} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.9, 0.03, 8, 64]} />
          <meshBasicMaterial color={MINT} transparent opacity={0} />
        </mesh>
      )}
    </group>
  );
}

function Capsule({ animate }: { animate: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || !animate) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = 2.25 + Math.sin(t * 1.1) * 0.12;
    ref.current.rotation.z = 0.9 + Math.sin(t * 0.7) * 0.2;
    ref.current.rotation.y = t * 0.5;
  });
  return (
    <group ref={ref} position={[0.15, 2.25, -0.6]} rotation={[0, 0, 0.9]}>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.28, 24]} />
        <meshStandardMaterial color={WHITE} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <sphereGeometry args={[0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={WHITE} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.14, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.28, 24]} />
        <meshStandardMaterial color={TEAL} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.28, 0]} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={TEAL} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Vial({ animate }: { animate: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || !animate) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = 1.7 + Math.sin(t * 0.9 + 1.5) * 0.1;
    ref.current.rotation.y = -t * 0.4;
  });
  return (
    <group ref={ref} position={[1.15, 1.7, -1.5]} rotation={[0.2, 0, -0.25]}>
      <mesh>
        <cylinderGeometry args={[0.13, 0.13, 0.42, 24]} />
        <meshStandardMaterial color="#d8f1e7" transparent opacity={0.75} roughness={0.15} />
      </mesh>
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.115, 0.115, 0.26, 24]} />
        <meshStandardMaterial color={MINT} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.12, 24]} />
        <meshStandardMaterial color={GREEN} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Scene({ animate }: { animate: boolean }) {
  const root = useRef<Group>(null);
  const mover = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const pointer = useRef({ x: 0, y: 0 });

  // Donor stack: 2x2 base, plus a top layer whose last crate is the one in transit.
  const stack = useMemo(() => {
    const out: [number, number, number][] = [];
    const g = CRATE + 0.04;
    for (const [x, z] of [[-g / 2, -g / 2], [g / 2, -g / 2], [-g / 2, g / 2], [g / 2, g / 2]])
      out.push([DONOR.x + x, CRATE / 2, DONOR.z + z]);
    out.push([DONOR.x - g / 2, CRATE * 1.5 + 0.02, DONOR.z - g / 2]);
    out.push([DONOR.x + g / 2, CRATE * 1.5 + 0.02, DONOR.z - g / 2]);
    return out;
  }, []);
  const received: [number, number, number][] = [
    [RECIPIENT.x - 0.26, CRATE / 2, RECIPIENT.z + 0.1],
  ];
  const start = new Vector3(DONOR.x + (CRATE + 0.04) / 2, CRATE * 1.5 + 0.02, DONOR.z + (CRATE + 0.04) / 2);
  const end = new Vector3(RECIPIENT.x + 0.28, CRATE / 2, RECIPIENT.z - 0.05);

  const { curve, path } = useMemo(() => {
    const control = start.clone().add(end).multiplyScalar(0.5).add(new Vector3(0, 1.9, 0));
    const curve = new QuadraticBezierCurve3(start, control, end);
    const geometry = new BufferGeometry().setFromPoints(curve.getPoints(60));
    const path = new Line(
      geometry,
      new LineDashedMaterial({ color: MINT, dashSize: 0.09, gapSize: 0.07, transparent: true, opacity: 0.85 }),
    );
    path.computeLineDistances();
    return { curve, path };
  }, []);

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
      root.current.rotation.y += (pointer.current.x * 0.18 + Math.sin(t * 0.2) * 0.08 - root.current.rotation.y) * k;
      root.current.rotation.x += (pointer.current.y * 0.05 - root.current.rotation.x) * k;
    }
    if (!mover.current) return;
    if (!animate) {
      mover.current.position.copy(curve.getPoint(0.5));
      return;
    }
    // phase: 0-0.15 lift, 0.15-0.75 travel, 0.75-1 settle + fade
    const p = (t % CYCLE) / CYCLE;
    let pos: Vector3;
    let scale = 1;
    if (p < 0.15) {
      pos = start.clone().add(new Vector3(0, (p / 0.15) * 0.08, 0));
      scale = 0.6 + (p / 0.15) * 0.4;
    } else if (p < 0.75) {
      const u = (p - 0.15) / 0.6;
      const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      pos = curve.getPoint(eased);
      mover.current.rotation.y = eased * Math.PI * 0.5;
    } else {
      pos = end.clone();
      scale = 1 - Math.max(0, (p - 0.88) / 0.12);
    }
    mover.current.position.copy(pos);
    mover.current.scale.setScalar(Math.max(scale, 0.001));
    if (ring.current) {
      const r = p >= 0.75 ? (p - 0.75) / 0.25 : 0;
      ring.current.scale.setScalar(1 + r * 0.35);
      (ring.current.material as MeshBasicMaterial).opacity = r > 0 ? (1 - r) * 0.9 : 0;
    }
  });

  return (
    <group ref={root} position={[0.25, -0.75, 0]}>
      <Platform position={DONOR} />
      <Platform position={RECIPIENT} ringRef={ring} />
      {stack.map((p, i) => (
        <Crate key={i} position={p} />
      ))}
      {received.map((p, i) => (
        <Crate key={i} position={p} />
      ))}
      <primitive object={path} />
      <group ref={mover}>
        <Crate position={[0, 0, 0]} />
      </group>
      <Capsule animate={animate} />
      <Vial animate={animate} />
    </group>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function LoginScene() {
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    media.addEventListener("change", change);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const animate = !reduced && !hidden;
  return (
    <div className="login-scene-canvas" aria-hidden="true">
      <SceneBoundary>
        <Canvas
          camera={{ position: [1.3, 4.6, 8.4], fov: 34 }}
          onCreated={({ camera }) => camera.lookAt(0.1, -0.55, 0)}
          dpr={[1, 1.75]}
          frameloop={animate ? "always" : "demand"}
          gl={{ antialias: true, alpha: true }}
          fallback={null}
        >
          <ambientLight intensity={1.1} />
          <directionalLight position={[4, 8, 5]} intensity={1.6} />
          <directionalLight position={[-5, 3, -2]} intensity={0.45} color={MINT} />
          <Scene animate={animate} />
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
