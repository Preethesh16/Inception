/* Small medical-supply models shared by the landing page scenes. */

export const WHITE = "#f4faf7";
export const GREEN = "#1c6553";
export const TEAL = "#2b8a72";
export const MINT = "#bfe8d6";

export function Crate({ size = 0.42 }: { size?: number }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color={WHITE} roughness={0.55} />
      </mesh>
      <mesh>
        <boxGeometry args={[size + 0.01, size + 0.01, size * 0.16]} />
        <meshStandardMaterial color={TEAL} roughness={0.6} />
      </mesh>
      <mesh position={[0, size / 2 + 0.005, 0]}>
        <boxGeometry args={[size * 0.52, 0.012, size * 0.17]} />
        <meshStandardMaterial color={GREEN} />
      </mesh>
      <mesh position={[0, size / 2 + 0.005, 0]}>
        <boxGeometry args={[size * 0.17, 0.012, size * 0.52]} />
        <meshStandardMaterial color={GREEN} />
      </mesh>
    </group>
  );
}

export function Capsule({ scale = 1 }: { scale?: number }) {
  const r = 0.11;
  return (
    <group scale={scale}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[r, r, 0.24, 24]} />
        <meshStandardMaterial color={WHITE} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <sphereGeometry args={[r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={WHITE} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[r, r, 0.24, 24]} />
        <meshStandardMaterial color={TEAL} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.24, 0]} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={TEAL} roughness={0.3} />
      </mesh>
    </group>
  );
}

export function Vial({ fill = MINT }: { fill?: string }) {
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, 0.36, 24]} />
        <meshStandardMaterial color="#e6f3ee" transparent opacity={0.7} roughness={0.15} />
      </mesh>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.088, 0.088, 0.24, 24]} />
        <meshStandardMaterial color={fill} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.23, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.1, 24]} />
        <meshStandardMaterial color={GREEN} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function PillBottle() {
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[0.15, 0.15, 0.36, 28]} />
        <meshStandardMaterial color={WHITE} roughness={0.4} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.152, 0.152, 0.14, 28]} />
        <meshStandardMaterial color={MINT} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.12, 28]} />
        <meshStandardMaterial color={GREEN} roughness={0.5} />
      </mesh>
    </group>
  );
}
