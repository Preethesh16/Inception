import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Group, Mesh, QuadraticBezierCurve3, Vector3 } from "three";

const hospitals = [
  {
    id: "A",
    name: "Kaveri",
    position: [-2.1, 0, 1.2] as [number, number, number],
  },
  {
    id: "B",
    name: "Chamundi",
    position: [1.65, 0, 1.8] as [number, number, number],
  },
  {
    id: "D",
    name: "Mandya",
    position: [0.4, 0, -2] as [number, number, number],
  },
];

function Block({
  position,
  size,
  color = "#f8fbfa",
}: {
  position: [number, number, number];
  size: [number, number, number];
  color?: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}
function Hospital({
  position,
  selected,
  animate,
}: {
  position: [number, number, number];
  selected: boolean;
  animate: boolean;
}) {
  const building = useRef<Group>(null);
  useFrame((_, delta) => {
    if (!animate || !building.current) return;
    const target = selected ? 1.1 : 1;
    const scale = building.current.scale.x;
    building.current.scale.setScalar(
      scale + (target - scale) * (1 - Math.exp(-5 * delta)),
    );
  });
  const tone = selected ? "#098b68" : "#6b9790";
  return (
    <group ref={building} position={position}>
      <mesh position={[0, 0.07, 0]} receiveShadow>
        <cylinderGeometry args={[1.43, 1.49, 0.14, 48]} />
        <meshStandardMaterial color={selected ? "#d2eee3" : "#e9efec"} />
      </mesh>
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.36, selected ? 0.025 : 0.012, 8, 64]} />
        <meshStandardMaterial
          color={tone}
          emissive={tone}
          emissiveIntensity={selected ? 1.5 : 0}
        />
      </mesh>
      {/* A taller inpatient tower and two lower clinical wings. */}
      <Block position={[0, 1.2, -0.15]} size={[0.88, 2.1, 0.92]} />
      <Block
        position={[-0.77, 0.83, 0]}
        size={[0.66, 1.36, 1.16]}
        color="#e3ece7"
      />
      <Block
        position={[0.77, 0.83, 0]}
        size={[0.66, 1.36, 1.16]}
        color="#edf2ef"
      />
      <Block
        position={[0, 0.39, 0.49]}
        size={[0.84, 0.48, 0.68]}
        color="#a0c9c8"
      />
      {/* Continuous glazing and slab edges make every side readable as it rotates. */}
      {[0.65, 1.05, 1.45, 1.85].map((y) => (
        <group key={y}>
          {[0.322, -0.622].map((z) => (
            <group key={z}>
              <Block
                position={[0, y, z]}
                size={[0.74, 0.24, 0.018]}
                color="#669899"
              />
              {[-0.24, 0, 0.24].map((x) => (
                <Block
                  key={x}
                  position={[x, y, z]}
                  size={[0.022, 0.25, 0.03]}
                  color="#d2e4dc"
                />
              ))}
            </group>
          ))}
          <Block
            position={[0, y - 0.17, -0.15]}
            size={[0.94, 0.055, 0.99]}
            color="#d0dfd7"
          />
          {[-0.45, 0.45].map((x) => (
            <Block
              key={x}
              position={[x, y, -0.15]}
              size={[0.02, 0.24, 0.73]}
              color="#739fa1"
            />
          ))}
        </group>
      ))}
      {[-0.77, 0.77].map((x) => (
        <group key={x}>
          {[0.48, 0.86, 1.24].map((y) => (
            <group key={y}>
              {[0.59, -0.59].map((z) => (
                <Block
                  key={z}
                  position={[x, y, z]}
                  size={[0.48, 0.19, 0.024]}
                  color="#739fa1"
                />
              ))}
              <Block
                position={[x < 0 ? -1.11 : 1.11, y, 0]}
                size={[0.025, 0.19, 0.93]}
                color="#739fa1"
              />
            </group>
          ))}
          <Block
            position={[x, 1.55, 0]}
            size={[0.75, 0.1, 1.25]}
            color={tone}
          />
        </group>
      ))}
      {/* Roof coping, mechanical plant, and prominent illuminated medical signs. */}
      <Block position={[0, 2.3, -0.15]} size={[1, 0.1, 1.04]} color={tone} />
      <Block
        position={[0, 2.38, -0.39]}
        size={[0.46, 0.12, 0.32]}
        color="#b3c7bd"
      />
      <Block
        position={[0, 2.43, 0.18]}
        size={[0.5, 0.52, 0.12]}
        color="#f8fbfa"
      />
      {[0.247, 0.113].map((z) => (
        <group key={z}>
          <Block
            position={[0, 2.45, z]}
            size={[0.095, 0.32, 0.018]}
            color={tone}
          />
          <Block
            position={[0, 2.45, z]}
            size={[0.32, 0.095, 0.02]}
            color={tone}
          />
        </group>
      ))}
      {/* Glass lobby, sliding doors, and a sheltered ambulance entrance. */}
      <Block
        position={[0, 0.37, 0.845]}
        size={[0.42, 0.4, 0.03]}
        color="#3d7276"
      />
      <Block
        position={[0, 0.37, 0.867]}
        size={[0.023, 0.4, 0.02]}
        color="#e8f3ef"
      />
      <Block
        position={[0, 0.69, 0.8]}
        size={[1.12, 0.075, 0.65]}
        color={tone}
      />
      {[-0.49, 0.49].map((x) => (
        <Block
          key={x}
          position={[x, 0.4, 1.04]}
          size={[0.045, 0.53, 0.045]}
          color="#ccdcd3"
        />
      ))}
      <Block
        position={[0, 0.18, 1.01]}
        size={[0.73, 0.07, 0.45]}
        color="#ccd9d2"
      />
      {/* Compact ambulance with wheels, windshield, beacon, and a medical cross. */}
      <group position={[0.86, 0.18, 0.93]} rotation={[0, -0.2, 0]}>
        <Block position={[0, 0.15, 0]} size={[0.29, 0.23, 0.54]} />
        <Block
          position={[0, 0.14, 0.29]}
          size={[0.29, 0.19, 0.16]}
          color="#e0e9e5"
        />
        <Block
          position={[0, 0.23, 0.29]}
          size={[0.25, 0.12, 0.04]}
          color="#3d7276"
        />
        <Block
          position={[0, 0.29, 0.1]}
          size={[0.2, 0.04, 0.06]}
          color="#db6c58"
        />
        <Block
          position={[0.151, 0.18, -0.06]}
          size={[0.014, 0.11, 0.035]}
          color={tone}
        />
        <Block
          position={[0.151, 0.18, -0.06]}
          size={[0.016, 0.035, 0.11]}
          color={tone}
        />
        {[-0.15, 0.15].flatMap((x) =>
          [-0.17, 0.21].map((z) => (
            <mesh
              key={`${x}-${z}`}
              position={[x, 0.04, z]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.07, 0.07, 0.035, 12]} />
              <meshStandardMaterial color="#38534e" />
            </mesh>
          )),
        )}
      </group>
    </group>
  );
}
function Route({
  from,
  to,
  offset,
  animate,
}: {
  from: [number, number, number];
  to: [number, number, number];
  offset: number;
  animate: boolean;
}) {
  const dot = useRef<Mesh>(null);
  const progress = useRef(offset);
  const curve = useMemo(
    () =>
      new QuadraticBezierCurve3(
        new Vector3(from[0], 0.23, from[2]),
        new Vector3((from[0] + to[0]) / 2, 1.75, (from[2] + to[2]) / 2),
        new Vector3(to[0], 0.23, to[2]),
      ),
    [from, to],
  );
  useFrame((_, delta) => {
    if (!animate) return;
    progress.current = (progress.current + Math.min(delta, 0.05) * 0.12) % 1;
    dot.current?.position.copy(curve.getPoint(progress.current));
  });
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 48, 0.018, 8, false]} />
        <meshBasicMaterial color="#559b83" transparent opacity={0.75} />
      </mesh>
      <mesh ref={dot} position={curve.getPoint(offset)}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshStandardMaterial
          color="#bde9bd"
          emissive="#2c8972"
          emissiveIntensity={0.35}
        />
      </mesh>
    </group>
  );
}
function Scene({ selected, animate }: { selected: string; animate: boolean }) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (animate && group.current)
      group.current.rotation.y += Math.min(delta, 0.05) * 0.12;
  });
  return (
    <>
      <ambientLight intensity={1.7} />
      <directionalLight
        position={[3, 9, 4]}
        intensity={3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-normalBias={0.04}
      />
      <group ref={group}>
        <mesh position={[0, -0.14, 0]} receiveShadow>
          <cylinderGeometry args={[4.45, 4.5, 0.2, 96]} />
          <meshStandardMaterial color="#e3eee7" />
        </mesh>
        <gridHelper
          args={[6.2, 16, "#c6d8ce", "#d4e2d8"]}
          position={[0, -0.027, 0]}
        />
        {[
          [0, 1],
          [1, 2],
          [2, 0],
        ].map(([a, b], index) => (
          <Route
            key={index}
            from={hospitals[a].position}
            to={hospitals[b].position}
            offset={index / 3}
            animate={animate}
          />
        ))}
        {hospitals.map((hospital) => (
          <Hospital
            key={hospital.id}
            position={hospital.position}
            selected={selected === hospital.id}
            animate={animate}
          />
        ))}
        {[
          [-3.1, -0.8],
          [-2.8, -1.1],
          [2.6, -0.8],
          [2.9, -0.6],
          [-0.5, 3],
          [-0.85, 3.1],
          [1.8, -2.7],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <Block
              position={[0, 0.16, 0]}
              size={[0.055, 0.3, 0.055]}
              color="#9baf9b"
            />
            <mesh position={[0, 0.4, 0]} castShadow>
              <icosahedronGeometry args={[0.21, 1]} />
              <meshStandardMaterial
                color={i % 2 ? "#98b49c" : "#bbccac"}
                flatShading
              />
            </mesh>
          </group>
        ))}
      </group>
    </>
  );
}
function NetworkFallback() {
  return (
    <div
      className="network-fallback"
      role="img"
      aria-label="Hospital network schematic connecting Kaveri, Chamundi and Mandya"
    >
      <svg viewBox="0 0 520 300" aria-hidden="true">
        <path
          d="M110 205Q230 15 410 205M110 205Q260 310 410 205M110 205L260 65L410 205"
          fill="none"
          stroke="#82b7a3"
          strokeWidth="2"
          strokeDasharray="6 8"
        />
        {[
          [110, 205],
          [260, 65],
          [410, 205],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect
              x="-31"
              y="-29"
              width="62"
              height="58"
              rx="10"
              fill="#fff"
              stroke="#579a86"
            />
            <path d="M-12 0H12M0-12V12" stroke="#197f68" strokeWidth="7" />
          </g>
        ))}
      </svg>
      <span>Network schematic · 3D unavailable</span>
    </div>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <NetworkFallback /> : this.props.children;
  }
}
export default function HospitalNetwork() {
  const [activeHospital, setActiveHospital] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (container.current) observer.observe(container.current);
    media.addEventListener("change", change);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (reduced || !visible || hidden) return;
    const timer = window.setInterval(() => {
      setActiveHospital((current) => (current + 1) % hospitals.length);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [reduced, visible, hidden]);
  return (
    <div
      className="hospital-network"
      ref={container}
      data-active-hospital={hospitals[activeHospital].id}
    >
      <div className="network-canvas" aria-hidden="true">
        <SceneBoundary>
          <Canvas
            shadows
            camera={{ position: [8, 8, 10], fov: 37 }}
            dpr={[1, 1.5]}
            frameloop={reduced || !visible || hidden ? "demand" : "always"}
            gl={{ antialias: true, alpha: true }}
            fallback={<NetworkFallback />}
          >
            <Scene
              selected={hospitals[activeHospital].id}
              animate={!reduced && visible && !hidden}
            />
          </Canvas>
        </SceneBoundary>
      </div>
    </div>
  );
}
