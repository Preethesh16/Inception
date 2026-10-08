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
  onSelect,
}: {
  position: [number, number, number];
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = selected ? "#197f68" : "#6b9790";
  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh position={[0, 0.07, 0]} receiveShadow>
        <cylinderGeometry args={[1.18, 1.24, 0.14, 48]} />
        <meshStandardMaterial color={selected ? "#d2eee3" : "#e9efec"} />
      </mesh>
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.1, selected ? 0.025 : 0.012, 8, 64]} />
        <meshBasicMaterial color={tone} />
      </mesh>
      <Block position={[0, 0.69, 0]} size={[1.35, 1.08, 0.88]} />
      <Block
        position={[-0.58, 0.46, 0.25]}
        size={[0.63, 0.62, 1.1]}
        color="#e0eae5"
      />
      <Block position={[0, 1.25, 0]} size={[1.43, 0.1, 0.96]} color={tone} />
      <Block
        position={[0.35, 1.39, -0.17]}
        size={[0.4, 0.2, 0.35]}
        color="#dbe7e1"
      />
      <Block
        position={[0.15, 0.3, 0.458]}
        size={[0.28, 0.32, 0.04]}
        color="#265d60"
      />
      <Block
        position={[0.15, 0.49, 0.56]}
        size={[0.5, 0.07, 0.35]}
        color={tone}
      />
      {[0.62, 0.9].flatMap((y) =>
        [-0.42, -0.05, 0.32].map((x) => (
          <Block
            key={`${x}-${y}`}
            position={[x, y, 0.454]}
            size={[0.18, 0.14, 0.025]}
            color="#9bbfbd"
          />
        )),
      )}
      {[0.6, 0.9].flatMap((y) =>
        [-0.22, 0.13].map((z) => (
          <Block
            key={`${z}-${y}`}
            position={[0.684, y, z]}
            size={[0.025, 0.14, 0.16]}
            color="#8dafad"
          />
        )),
      )}
      <Block
        position={[-0.76, 0.52, 0.808]}
        size={[0.1, 0.29, 0.025]}
        color={tone}
      />
      <Block
        position={[-0.76, 0.52, 0.808]}
        size={[0.28, 0.1, 0.028]}
        color={tone}
      />
      <mesh position={[0, 1.8, 0]}>
        <sphereGeometry args={[selected ? 0.09 : 0.055, 16, 16]} />
        <meshStandardMaterial
          color={tone}
          emissive={tone}
          emissiveIntensity={0.2}
        />
      </mesh>
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
function Scene({
  selected,
  onSelect,
  animate,
}: {
  selected: string;
  onSelect: (id: string) => void;
  animate: boolean;
}) {
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
            onSelect={() => onSelect(hospital.id)}
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
export default function HospitalNetwork({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
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
  return (
    <div className="hospital-network" ref={container}>
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
              selected={selected}
              onSelect={onSelect}
              animate={!reduced && visible && !hidden}
            />
          </Canvas>
        </SceneBoundary>
      </div>
    </div>
  );
}
