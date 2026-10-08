import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Group } from "three";
import { X } from "lucide-react";

function Capsule({
  position,
  scale,
  color,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} scale={scale}>
      <sphereGeometry args={[1, 32, 24]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.02} />
    </mesh>
  );
}
function Pip({ flying, waving }: { flying: boolean; waving: boolean }) {
  const paw = useRef<Group>(null);
  const body = useRef<Group>(null);
  const leftWing = useRef<Group>(null);
  const rightWing = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (waving && paw.current)
      paw.current.rotation.z = 2.35 + Math.sin(clock.elapsedTime * 4) * 0.35;
    if (!flying) return;
    const flap = Math.sin(clock.elapsedTime * 13) * 0.5;
    if (body.current) {
      body.current.rotation.z = Math.sin(clock.elapsedTime * 3) * 0.07;
      body.current.position.y = Math.sin(clock.elapsedTime * 4) * 0.05;
    }
    if (leftWing.current) leftWing.current.rotation.z = -0.3 + flap;
    if (rightWing.current) rightWing.current.rotation.z = 0.3 - flap;
  });
  return (
    <group ref={body} rotation={[0.03, -0.14, 0]}>
      <group position={[0.52, -0.66, -0.22]} rotation={[0, 0, -0.65]}>
        <Capsule
          position={[0.12, 0.25, 0]}
          scale={[0.3, 0.63, 0.27]}
          color="#cf592a"
        />
        <Capsule
          position={[0.13, 0.72, 0.01]}
          scale={[0.26, 0.29, 0.25]}
          color="#fff0d6"
        />
      </group>
      {[-1, 1].map((side) => (
        <group
          key={side}
          ref={side < 0 ? leftWing : rightWing}
          position={[side * 0.4, -0.23, -0.2]}
          rotation={[0, 0, side * 0.3]}
        >
          {[0, 1, 2].map((i) => (
            <group key={i} rotation={[0, 0, side * (0.45 + i * 0.3)]}>
              <Capsule
                position={[side * (0.38 + i * 0.06), 0.19, 0]}
                scale={[0.45 - i * 0.06, 0.12, 0.09]}
                color={i === 0 ? "#b4a1e6" : "#ddd0f5"}
              />
            </group>
          ))}
        </group>
      ))}
      <Capsule
        position={[0, -0.5, 0]}
        scale={[0.46, 0.57, 0.37]}
        color="#e57a36"
      />
      <Capsule
        position={[0, -0.45, 0.3]}
        scale={[0.31, 0.4, 0.12]}
        color="#fff0d6"
      />
      <Capsule
        position={[0, 0.34, 0]}
        scale={[0.68, 0.59, 0.46]}
        color="#ed8138"
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <group
            position={[side * 0.46, 0.94, -0.03]}
            rotation={[0, 0, side * -0.23]}
          >
            <mesh>
              <coneGeometry args={[0.28, 0.67, 4]} />
              <meshStandardMaterial color="#d96930" roughness={0.8} />
            </mesh>
            <mesh position={[0, -0.01, 0.17]}>
              <coneGeometry args={[0.15, 0.43, 3]} />
              <meshStandardMaterial color="#ffcfa7" roughness={0.8} />
            </mesh>
          </group>
          <Capsule
            position={[side * 0.27, 0.17, 0.36]}
            scale={[0.33, 0.27, 0.21]}
            color="#fff0d6"
          />
          <Capsule
            position={[side * 0.25, 0.43, 0.414]}
            scale={[0.083, 0.115, 0.052]}
            color="#382536"
          />
          <Capsule
            position={[side * 0.25 - 0.02, 0.468, 0.455]}
            scale={[0.025, 0.032, 0.018]}
            color="#ffffff"
          />
          <Capsule
            position={[side * 0.4, 0.19, 0.54]}
            scale={[0.075, 0.035, 0.016]}
            color="#e9a08d"
          />
          <group
            ref={side === 1 ? paw : undefined}
            position={[side * 0.48, -0.23, 0.16]}
            rotation={[0, 0, side === 1 && waving ? 2.35 : side * 0.3]}
          >
            <Capsule
              position={[0, -0.15, 0]}
              scale={[0.13, 0.28, 0.14]}
              color="#db7136"
            />
            <Capsule
              position={[0, -0.36, 0.03]}
              scale={[0.14, 0.14, 0.16]}
              color="#744331"
            />
          </group>
          <Capsule
            position={[side * 0.23, -1.01, 0.14]}
            scale={[0.19, 0.16, 0.26]}
            color="#744331"
          />
        </group>
      ))}
      <group position={[-0.63, -0.5, 0.43]} rotation={[0, 0, -0.12]}>
        <mesh>
          <cylinderGeometry args={[0.16, 0.16, 0.48, 32]} />
          <meshStandardMaterial color="#fff5e4" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.28, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.12, 24]} />
          <meshStandardMaterial color="#9278ce" />
        </mesh>
        <mesh position={[0, -0.015, 0]}>
          <cylinderGeometry args={[0.164, 0.164, 0.25, 32]} />
          <meshStandardMaterial color="#bba9e1" />
        </mesh>
        <mesh position={[0, -0.015, 0.166]}>
          <boxGeometry args={[0.045, 0.15, 0.014]} />
          <meshBasicMaterial color="#fffaf1" />
        </mesh>
        <mesh position={[0, -0.015, 0.167]}>
          <boxGeometry args={[0.15, 0.045, 0.015]} />
          <meshBasicMaterial color="#fffaf1" />
        </mesh>
        <Capsule
          position={[0.12, -0.15, 0.12]}
          scale={[0.12, 0.1, 0.09]}
          color="#744331"
        />
      </group>
      <Capsule
        position={[0, 0.19, 0.56]}
        scale={[0.16, 0.13, 0.17]}
        color="#fff4df"
      />
      <Capsule
        position={[0, 0.24, 0.698]}
        scale={[0.09, 0.065, 0.055]}
        color="#382536"
      />
      <mesh position={[0, 0.08, 0.588]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.09, 0.016, 8, 20, Math.PI]} />
        <meshBasicMaterial color="#744331" />
      </mesh>
      <mesh position={[0, -0.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.35, 0.075, 12, 32]} />
        <meshStandardMaterial color="#7860bc" />
      </mesh>
      <group position={[0.3, -0.31, 0.35]} rotation={[0, 0, -0.3]}>
        <Capsule
          position={[0, 0, 0]}
          scale={[0.09, 0.24, 0.045]}
          color="#9278ce"
        />
      </group>
      <mesh position={[0, -0.62, 0.38]}>
        <boxGeometry args={[0.45, 0.34, 0.15]} />
        <meshStandardMaterial color="#7860bc" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.62, 0.46]}>
        <boxGeometry args={[0.065, 0.22, 0.018]} />
        <meshBasicMaterial color="#fff4df" />
      </mesh>
      <mesh position={[0, -0.62, 0.46]}>
        <boxGeometry args={[0.22, 0.065, 0.02]} />
        <meshBasicMaterial color="#fff4df" />
      </mesh>
      <mesh position={[0, -1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.64, 48]} />
        <meshBasicMaterial color="#8a6876" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}
function StaticPip() {
  return (
    <svg viewBox="0 0 180 180" aria-hidden="true">
      <path d="M123 144Q177 118 145 86Q124 100 119 131" fill="#de7135" />
      <path d="M145 86Q158 98 156 110L134 108Z" fill="#fff0d6" />
      <ellipse cx="88" cy="124" rx="35" ry="37" fill="#e57a36" />
      <path d="M40 67L35 13L72 40M107 40L145 13L140 69" fill="#de7135" />
      <ellipse cx="90" cy="70" rx="57" ry="44" fill="#ed8138" />
      <path
        d="M36 71Q60 62 90 89Q120 62 145 71Q138 115 90 111Q45 111 36 71"
        fill="#fff0d6"
      />
      <g fill="#382536">
        <ellipse cx="69" cy="65" rx="5" ry="8" />
        <ellipse cx="111" cy="65" rx="5" ry="8" />
        <ellipse cx="90" cy="87" rx="7" ry="5" />
      </g>
      <path
        d="M78 96Q90 107 102 96"
        fill="none"
        stroke="#744331"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="64" y="120" width="49" height="33" rx="6" fill="#7860bc" />
      <path d="M88 126v21m-10-10h20" stroke="#fff4df" strokeWidth="6" />
    </svg>
  );
}
class MascotBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <StaticPip /> : this.props.children;
  }
}
export default function CareMascot({
  onOpenLogin,
  context = "home",
  guidance,
}: {
  onOpenLogin?: () => void;
  context?: "home" | "login" | "dashboard";
  guidance?: { title: string; text: string };
}) {
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [landed, setLanded] = useState(reduced || context !== "home");
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(media.matches);
      if (media.matches) setLanded(true);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <aside
      className={`care-mascot ${landed ? "is-landed" : "is-flying"}`}
      aria-label="Pip, Inception's welcome guide"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setLanded(true);
      }}
    >
      {landed && open && (
        <div className="mascot-intro" id="pip-introduction" role="status">
          <button
            className="mascot-close"
            aria-label="Close introduction"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
          <span className="mascot-eyebrow">
            {context === "dashboard"
              ? "YOUR HOSPITAL GUIDE"
              : context === "login"
                ? "LET’S GET YOU SIGNED IN"
                : "YOUR FLYING FOX"}
          </span>
          <h2>
            {guidance?.title ??
              (context === "login" ? "I’ll help you sign in." : "Hi, I’m Pip!")}
          </h2>
          <p>
            {guidance?.text ??
              (context === "login"
                ? "Enter your hospital’s email and password, then select Log in. Your account opens the matching hospital dashboard. You can use the eye icon to check your password."
                : "I’m your flying fox guide to Inception. We help hospitals forecast supply needs, spot shortages, and coordinate safe transfers.")}
          </p>
          {context === "home" && (
            <a
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                setOpen(false);
                onOpenLogin?.();
              }}
            >
              Let’s meet your hospital <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      )}
      <div className="mascot-model" aria-hidden="true">
        <MascotBoundary>
          <Canvas
            camera={{
              position: [0, 0.2, 5.3],
              fov: 38,
            }}
            dpr={[1, 1.5]}
            gl={{ alpha: true, antialias: true }}
            frameloop={hidden || reduced || landed ? "demand" : "always"}
            fallback={<StaticPip />}
          >
            <ambientLight intensity={1.8} />
            <directionalLight position={[3, 4, 5]} intensity={2.8} />
            <directionalLight
              position={[-3, 1, 2]}
              intensity={0.6}
              color="#f8d4ef"
            />
            <Pip flying={!landed && !reduced} waving={false} />
          </Canvas>
        </MascotBoundary>
      </div>
      {landed && (
        <button
          className="mascot-hit-target"
          onClick={() => setOpen((value) => !value)}
          aria-label={
            context === "dashboard"
              ? open
                ? "Dismiss Pip explanation"
                : "Show Pip explanation"
              : "Open Pip introduction"
          }
          aria-expanded={open}
          aria-controls={open ? "pip-introduction" : undefined}
        />
      )}
    </aside>
  );
}
