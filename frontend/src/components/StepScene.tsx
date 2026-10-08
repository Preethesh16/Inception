import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  CatmullRomCurve3,
  TubeGeometry,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type PerspectiveCamera,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import SceneCanvas from "./SceneCanvas";

/* "How it works" strip: four pedestals, one per step, joined by a supply path.
   Each pedestal carries a small model of its step; the active one rises,
   glows and pulses, and supply dots flow along the path between them. */

const WHITE = "#f7fbf9";
const PALE = "#e6f2ec";
const MINT = "#bfe8d6";
const TEAL = "#2b8a72";
const GREEN = "#1c6553";
const XS = [-2.3, -0.77, 0.77, 2.3];
const ZS = [0.15, -0.15, 0.15, -0.15];

function RBox({
  size,
  radius = 0.04,
  color,
  position,
  rotation,
  emissive,
}: {
  size: [number, number, number];
  radius?: number;
  color: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  emissive?: number;
}) {
  const [w, h, d] = size;
  const geometry = useMemo(() => new RoundedBoxGeometry(w, h, d, 4, radius), [w, h, d, radius]);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      <meshStandardMaterial
        color={color}
        roughness={0.45}
        emissive={emissive ? color : "#000000"}
        emissiveIntensity={emissive ?? 0}
      />
    </mesh>
  );
}

function Crate({ s = 0.3, position }: { s?: number; position: [number, number, number] }) {
  return (
    <group position={position}>
      <RBox size={[s, s, s]} radius={s * 0.12} color={WHITE} />
      <RBox size={[s * 1.02, s * 1.02, s * 0.2]} radius={s * 0.06} color={TEAL} />
      <RBox size={[s * 0.5, 0.02, s * 0.15]} radius={0.008} color={GREEN} position={[0, s / 2 + 0.005, 0]} />
      <RBox size={[s * 0.15, 0.02, s * 0.5]} radius={0.008} color={GREEN} position={[0, s / 2 + 0.005, 0]} />
    </group>
  );
}

function InventoryModel() {
  return (
    <group>
      <Crate position={[-0.17, 0.15, 0.06]} />
      <Crate position={[0.17, 0.15, -0.04]} />
      <Crate s={0.26} position={[0.0, 0.43, 0.02]} />
      {/* vial */}
      <group position={[0.42, 0.16, 0.2]}>
        <mesh>
          <cylinderGeometry args={[0.07, 0.07, 0.28, 24]} />
          <meshStandardMaterial color="#e3f1ea" transparent opacity={0.75} roughness={0.1} />
        </mesh>
        <mesh position={[0, -0.03, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.18, 24]} />
          <meshStandardMaterial color={MINT} />
        </mesh>
        <mesh position={[0, 0.17, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.07, 24]} />
          <meshStandardMaterial color={GREEN} />
        </mesh>
      </group>
    </group>
  );
}

function ForecastModel({ active }: { active: boolean }) {
  const bars = useRef<Group>(null);
  const heights = [0.28, 0.42, 0.36, 0.62];
  const line = useMemo(() => {
    const pts = heights.map((h, i) => new Vector3(-0.36 + i * 0.24, h + 0.12, 0.12));
    return new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.018, 8, false);
  }, []);
  useFrame(({ clock }, delta) => {
    if (!bars.current) return;
    bars.current.children.forEach((bar, i) => {
      const wobble = active ? Math.sin(clock.getElapsedTime() * 2 + i) * 0.03 : 0;
      const target = (active ? 1 : 0.75) + wobble;
      bar.scale.y += (target - bar.scale.y) * (1 - Math.exp(-5 * delta));
    });
  });
  return (
    <group>
      <group ref={bars}>
        {heights.map((h, i) => (
          <group key={i} position={[-0.36 + i * 0.24, 0, 0]}>
            <RBox
              size={[0.17, h, 0.17]}
              radius={0.05}
              color={[MINT, MINT, TEAL, GREEN][i]}
              position={[0, h / 2, 0]}
            />
          </group>
        ))}
      </group>
      <mesh geometry={line}>
        <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={0.3} />
      </mesh>
      {heights.map((h, i) => (
        <mesh key={i} position={[-0.36 + i * 0.24, h + 0.12, 0.12]}>
          <sphereGeometry args={[0.035, 16, 16]} />
          <meshStandardMaterial color="white" />
        </mesh>
      ))}
    </group>
  );
}

function Hospital({ h, position }: { h: number; position: [number, number, number] }) {
  return (
    <group position={position}>
      <RBox size={[0.34, h, 0.3]} radius={0.04} color={WHITE} position={[0, h / 2, 0]} />
      <RBox size={[0.37, 0.05, 0.33]} radius={0.02} color={TEAL} position={[0, h + 0.02, 0]} />
      {/* windows */}
      {Array.from({ length: Math.floor(h / 0.14) - 1 }, (_, r) =>
        [-0.08, 0.08].map((x) => (
          <RBox key={`${r}${x}`} size={[0.06, 0.05, 0.01]} radius={0.01} color={MINT} position={[x, 0.12 + r * 0.13, 0.151]} />
        )),
      )}
      {/* cross sign */}
      <group position={[0, h + 0.15, 0]}>
        <RBox size={[0.16, 0.16, 0.04]} radius={0.02} color="white" />
        <RBox size={[0.1, 0.03, 0.05]} radius={0.01} color={GREEN} />
        <RBox size={[0.03, 0.1, 0.05]} radius={0.01} color={GREEN} />
      </group>
    </group>
  );
}

function PartnerModel({ animate }: { animate: boolean }) {
  const dot = useRef<Mesh>(null);
  const curve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(-0.22, 0.5, 0.05),
        new Vector3(0.0, 0.85, 0.05),
        new Vector3(0.24, 0.62, -0.05),
      ]),
    [],
  );
  const tube = useMemo(() => new TubeGeometry(curve, 30, 0.012, 6, false), [curve]);
  useFrame(({ clock }) => {
    if (!dot.current) return;
    const t = animate ? (clock.getElapsedTime() * 0.6) % 1 : 0.5;
    dot.current.position.copy(curve.getPoint(t));
  });
  return (
    <group>
      <Hospital h={0.46} position={[-0.24, 0, 0.06]} />
      <Hospital h={0.6} position={[0.24, 0, -0.06]} />
      <mesh geometry={tube}>
        <meshBasicMaterial color={TEAL} transparent opacity={0.6} />
      </mesh>
      <mesh ref={dot}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshStandardMaterial color={GREEN} emissive={TEAL} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function ApproveModel() {
  return (
    <group position={[0, 0.5, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.1, 48]} />
        <meshStandardMaterial color={GREEN} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.052]}>
        <torusGeometry args={[0.3, 0.012, 8, 48]} />
        <meshStandardMaterial color={MINT} />
      </mesh>
      <RBox size={[0.08, 0.2, 0.06]} radius={0.025} color="white" position={[-0.075, -0.035, 0.06]} rotation={[0, 0, Math.PI / 4]} />
      <RBox size={[0.08, 0.36, 0.06]} radius={0.025} color="white" position={[0.07, 0.03, 0.06]} rotation={[0, 0, -Math.PI / 5]} />
      {/* stand */}
      <mesh position={[0, -0.42, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 0.14, 16]} />
        <meshStandardMaterial color={TEAL} />
      </mesh>
    </group>
  );
}

function Pedestal({
  index,
  active,
  animate,
  children,
}: {
  index: number;
  active: boolean;
  animate: boolean;
  children: ReactNode;
}) {
  const lift = useRef<Group>(null);
  const model = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const pulse = useRef<Mesh>(null);
  useFrame(({ clock }, delta) => {
    const k = animate ? 1 - Math.exp(-6 * delta) : 1;
    const t = clock.getElapsedTime();
    if (lift.current) lift.current.position.y += ((active ? 0.16 : 0) - lift.current.position.y) * k;
    if (model.current) {
      const s = active ? 1.08 : 0.86;
      model.current.scale.setScalar(model.current.scale.x + (s - model.current.scale.x) * k);
      const bob = active && animate ? Math.sin(t * 2) * 0.03 : 0;
      model.current.position.y = 0.08 + bob;
      const ry = active && animate ? Math.sin(t * 0.8) * 0.35 : 0;
      model.current.rotation.y += (ry - model.current.rotation.y) * k;
    }
    if (ring.current) {
      const m = ring.current.material as MeshStandardMaterial;
      m.emissiveIntensity += ((active ? 0.9 : 0) - m.emissiveIntensity) * k;
      m.color.set(active ? TEAL : "#cfe1d8");
    }
    if (pulse.current) {
      const p = active && animate ? (t % 1.8) / 1.8 : 1;
      pulse.current.scale.setScalar(1 + p * 0.45);
      (pulse.current.material as MeshBasicMaterial).opacity = active ? (1 - p) * 0.5 : 0;
    }
  });
  return (
    <group position={[XS[index], 0, ZS[index]]}>
      {/* soft contact shadow */}
      <mesh position={[0, -0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.78, 48]} />
        <meshBasicMaterial color="#1c6553" transparent opacity={0.09} depthWrite={false} />
      </mesh>
      <group ref={lift}>
        <mesh position={[0, -0.035, 0]}>
          <cylinderGeometry args={[0.66, 0.7, 0.09, 64]} />
          <meshStandardMaterial color="white" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.012, 0]}>
          <cylinderGeometry args={[0.58, 0.6, 0.02, 64]} />
          <meshStandardMaterial color={active ? PALE : "#f1f6f3"} roughness={0.7} />
        </mesh>
        <mesh ref={ring} position={[0, 0.024, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.62, 0.016, 8, 64]} />
          <meshStandardMaterial color="#cfe1d8" emissive={TEAL} emissiveIntensity={0} />
        </mesh>
        <mesh ref={pulse} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.66, 64]} />
          <meshBasicMaterial color={TEAL} transparent opacity={0} depthWrite={false} />
        </mesh>
        <group ref={model}>{children}</group>
      </group>
    </group>
  );
}

/* Ground path linking the pedestals, with supply dots flowing along it. */
function SupplyPath({ animate }: { animate: boolean }) {
  const dots = useRef<Group>(null);
  const curve = useMemo(
    () =>
      new CatmullRomCurve3(
        XS.map((x, i) => new Vector3(x, -0.06, ZS[i] + 0.55)),
        false,
        "catmullrom",
        0.5,
      ),
    [],
  );
  const tube = useMemo(() => new TubeGeometry(curve, 120, 0.014, 8, false), [curve]);
  useFrame(({ clock }) => {
    if (!dots.current) return;
    const t = animate ? clock.getElapsedTime() * 0.08 : 0;
    dots.current.children.forEach((d, i) => {
      const u = (t + i / dots.current!.children.length) % 1;
      d.position.copy(curve.getPoint(u));
    });
  });
  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial color={TEAL} transparent opacity={0.28} />
      </mesh>
      <group ref={dots}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.035, 14, 14]} />
            <meshStandardMaterial color={TEAL} emissive={TEAL} emissiveIntensity={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* Pull the camera in or out so the four pedestals always fill the width. */
function FitCamera() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    const halfWidth = 3.5;
    const tanV = Math.tan((cam.fov * Math.PI) / 360);
    const distance = Math.min(9, Math.max(3.4, halfWidth / (tanV * aspect)));
    const dir = new Vector3(0, 0.5, 0.86).normalize();
    cam.position.copy(dir.multiplyScalar(distance)).add(new Vector3(0, 0.25, 0));
    cam.lookAt(0, 0.25, 0);
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);
  return null;
}

function Strip({ active, animate }: { active: number; animate: boolean }) {
  return (
    <group position={[0, -0.1, 0]}>
      <FitCamera />
      <SupplyPath animate={animate} />
      <Pedestal index={0} active={active === 0} animate={animate}>
        <InventoryModel />
      </Pedestal>
      <Pedestal index={1} active={active === 1} animate={animate}>
        <ForecastModel active={active === 1} />
      </Pedestal>
      <Pedestal index={2} active={active === 2} animate={animate}>
        <PartnerModel animate={animate} />
      </Pedestal>
      <Pedestal index={3} active={active === 3} animate={animate}>
        <ApproveModel />
      </Pedestal>
    </group>
  );
}

export default function StepScene({ active }: { active: number }) {
  return (
    <SceneCanvas
      className="how-scene"
      camera={{ position: [0, 2.2, 4.2], fov: 30 }}
      lookAt={[0, 0.25, 0]}
    >
      {(animate) => <Strip active={active} animate={animate} />}
    </SceneCanvas>
  );
}
