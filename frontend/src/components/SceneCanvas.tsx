import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";

/* Shared wrapper for the landing page's small 3D scenes: renders only while
   on screen, stays still for reduced-motion users, and disappears quietly if
   WebGL is unavailable. */

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function SceneCanvas({
  className,
  camera,
  lookAt = [0, 0, 0],
  children,
}: {
  className: string;
  camera: { position: [number, number, number]; fov: number };
  lookAt?: [number, number, number];
  children: (animate: boolean) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    const observer = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    if (box.current) observer.observe(box.current);
    return () => {
      media.removeEventListener("change", change);
      observer.disconnect();
    };
  }, []);
  const animate = visible && !reduced;
  return (
    <div className={className} ref={box} aria-hidden="true">
      <SceneBoundary>
        <Canvas
          camera={camera}
          onCreated={({ camera: c }) => c.lookAt(...lookAt)}
          dpr={[1, 1.75]}
          frameloop={animate ? "always" : "demand"}
          gl={{ antialias: true, alpha: true }}
          fallback={null}
        >
          <ambientLight intensity={1.05} />
          <directionalLight position={[3, 7, 5]} intensity={1.5} />
          <directionalLight position={[-4, 3, -3]} intensity={0.45} />
          {children(animate)}
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
