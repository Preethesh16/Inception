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
    const flap = Math.sin(clock.elapsedTime * 13) * 0.5;
    if (leftWing.current) leftWing.current.rotation.z = -0.3 + flap;
    if (rightWing.current) rightWing.current.rotation.z = 0.3 - flap;
    if (!flying) return;
    if (body.current) {
      body.current.rotation.z = Math.sin(clock.elapsedTime * 3) * 0.07;
      body.current.position.y = Math.sin(clock.elapsedTime * 4) * 0.05;
    }
  });
  const green = "#185f50";
  return (
    <group ref={body} rotation={[0.03, -0.14, 0]}>
      {[-1, 1].map((side) => (
        <group key={side}>
          <group
            ref={side < 0 ? leftWing : rightWing}
            position={[side * 0.4, 0.4, -0.28]}
            rotation={[0, 0, side * -0.48]}
          >
            <Capsule
              position={[side * 0.23, 0.17, 0]}
              scale={[0.35, 0.6, 0.09]}
              color="#c7eee3"
            />
            <Capsule
              position={[side * 0.23, 0.2, 0.075]}
              scale={[0.26, 0.47, 0.03]}
              color="#f1fffa"
            />
          </group>
          <group
            position={[side * 0.31, 0.63, 0]}
            rotation={[0, 0, side * -0.48]}
          >
            <Capsule
              position={[0, 0.22, 0]}
              scale={[0.037, 0.29, 0.037]}
              color={green}
            />
            <Capsule
              position={[0, 0.49, 0]}
              scale={[0.105, 0.105, 0.105]}
              color={green}
            />
            <Capsule
              position={[-0.018, 0.51, 0.077]}
              scale={[0.053, 0.053, 0.028]}
              color="#4cb69b"
            />
          </group>
          <group
            position={[side * 0.23, -0.86, 0]}
            rotation={[0, 0, side * 0.28]}
          >
            <Capsule
              position={[0, -0.08, 0]}
              scale={[0.046, 0.17, 0.048]}
              color={green}
            />
            <Capsule
              position={[0, -0.21, 0.045]}
              scale={[0.1, 0.055, 0.13]}
              color={green}
            />
          </group>
        </group>
      ))}
      <group position={[0, -0.06, 0]} scale={[0.72, 0.84, 0.51]}>
        <mesh>
          <sphereGeometry args={[1, 48, 32]} />
          <meshStandardMaterial color="#f5b92f" roughness={0.4} />
        </mesh>
        {[1.9, 2.43].map((angle) => (
          <mesh key={angle}>
            <sphereGeometry
              args={[1.004, 48, 12, 0, Math.PI * 2, angle, 0.22]}
            />
            <meshStandardMaterial color={green} roughness={0.5} />
          </mesh>
        ))}
      </group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Capsule
            position={[side * 0.225, 0.19, 0.49]}
            scale={[0.092, 0.125, 0.06]}
            color="#173e35"
          />
          <Capsule
            position={[side * 0.225 + 0.022, 0.235, 0.543]}
            scale={[0.033, 0.038, 0.017]}
            color="#ffffff"
          />
          <Capsule
            position={[side * 0.225 - 0.023, 0.151, 0.546]}
            scale={[0.015, 0.017, 0.008]}
            color="#ffffff"
          />
          <Capsule
            position={[side * 0.4, -0.035, 0.453]}
            scale={[0.102, 0.05, 0.022]}
            color="#ef9770"
          />
        </group>
      ))}
      <mesh position={[0, -0.055, 0.518]} rotation={[0, 0, Math.PI + 0.2]}>
        <torusGeometry args={[0.13, 0.019, 10, 28, Math.PI - 0.4]} />
        <meshStandardMaterial color="#173e35" />
      </mesh>
      <group ref={paw} position={[-0.65, -0.15, 0.04]} rotation={[0, 0, -0.5]}>
        <Capsule
          position={[-0.05, -0.14, 0]}
          scale={[0.047, 0.24, 0.047]}
          color={green}
        />
        <Capsule
          position={[-0.06, -0.34, 0]}
          scale={[0.09, 0.09, 0.09]}
          color="#f5b92f"
        />
      </group>
      <group position={[0.64, -0.12, 0.05]} rotation={[0, 0, 0.65]}>
        <Capsule
          position={[0, -0.12, 0]}
          scale={[0.047, 0.23, 0.047]}
          color={green}
        />
      </group>
      <group position={[0.82, -0.5, 0.19]}>
        <mesh position={[0, 0.24, 0]}>
          <torusGeometry args={[0.115, 0.03, 10, 24]} />
          <meshStandardMaterial color={green} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.45, 0.37, 0.2]} />
          <meshStandardMaterial color="#f6fff9" roughness={0.45} />
        </mesh>
        {[-1, 1].map((side) => (
          <Capsule
            key={side}
            position={[side * 0.2, 0, 0]}
            scale={[0.055, 0.185, 0.1]}
            color="#f6fff9"
          />
        ))}
        <mesh position={[0, 0, 0.106]}>
          <boxGeometry args={[0.07, 0.23, 0.016]} />
          <meshStandardMaterial color={green} />
        </mesh>
        <mesh position={[0, 0, 0.107]}>
          <boxGeometry args={[0.23, 0.07, 0.018]} />
          <meshStandardMaterial color={green} />
        </mesh>
      </group>
      <mesh position={[0, -1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.64, 48]} />
        <meshBasicMaterial color="#235f50" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}
function StaticPip() {
  return (
    <svg viewBox="0 0 180 180" aria-hidden="true">
      <g stroke="#1c6553" strokeWidth="4" strokeLinecap="round">
        <ellipse
          cx="59"
          cy="56"
          rx="23"
          ry="34"
          transform="rotate(-35 59 56)"
          fill="#e2f7ef"
        />
        <ellipse
          cx="121"
          cy="56"
          rx="23"
          ry="34"
          transform="rotate(35 121 56)"
          fill="#e2f7ef"
        />
        <path d="M74 50L58 19M106 50L122 19M73 150L68 164M108 150L113 164" />
        <circle cx="57" cy="17" r="7" fill="#389c82" />
        <circle cx="123" cy="17" r="7" fill="#389c82" />
        <ellipse cx="90" cy="99" rx="55" ry="57" fill="#f5bc3e" />
        <path
          d="M38 119Q90 143 142 119M51 142Q90 159 129 142"
          strokeWidth="10"
          fill="none"
        />
        <path d="M77 103Q90 117 103 103" fill="none" />
        <path d="M38 111L24 128M142 111L154 122" />
      </g>
      <g fill="#193e34">
        <ellipse cx="72" cy="86" rx="7" ry="10" />
        <ellipse cx="108" cy="86" rx="7" ry="10" />
      </g>
      <g fill="white">
        <circle cx="74" cy="83" r="2.7" />
        <circle cx="110" cy="83" r="2.7" />
      </g>
      <g fill="#ee9b70">
        <ellipse cx="59" cy="105" rx="8" ry="4" />
        <ellipse cx="121" cy="105" rx="8" ry="4" />
      </g>
      <rect
        x="139"
        y="119"
        width="35"
        height="32"
        rx="8"
        fill="#fffef5"
        stroke="#1c6553"
        strokeWidth="3"
      />
      <path d="M156 126v17m-8-8h16" stroke="#278570" strokeWidth="5" />
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
                : "YOUR HELPFUL BEE"}
          </span>
          <h2>
            {guidance?.title ??
              (context === "login" ? "I’ll help you sign in." : "Hi, I’m Pip!")}
          </h2>
          <p>
            {guidance?.text ??
              (context === "login"
                ? "Enter your hospital’s email and password, then select Log in. Your account opens the matching hospital dashboard. You can use the eye icon to check your password."
                : "I’m your bee guide to Inception. We help hospitals forecast supply needs, spot shortages, and coordinate safe transfers.")}
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
            frameloop={hidden || reduced ? "demand" : "always"}
            fallback={<StaticPip />}
          >
            <ambientLight intensity={1.8} />
            <directionalLight position={[3, 4, 5]} intensity={2.8} />
            <directionalLight
              position={[-3, 1, 2]}
              intensity={0.6}
              color="#fff1ca"
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
