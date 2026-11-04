import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PUCK_MARK_INNER, USER_MARK_INNER } from "./PlayerMesh";
import type { IceMark } from "./iceMark";

/** Under-stroke corner. The burgundy bars are shorter, matching the pause-replay X. */
const X_REACH = Math.hypot(1.9 / 2, 0.28 / 2);

export function IceCross({ mark }: { mark: { current: IceMark } }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const hole = mark.current.lock?.kind === "puck" ? PUCK_MARK_INNER : USER_MARK_INNER;
    const fit = hole / X_REACH;
    g.position.set(mark.current.x, 0.08, mark.current.z);
    g.scale.set(fit, 1, fit);
  });
  return (
    <group ref={ref} name="ice-x" frustumCulled={false}>
      <mesh rotation={[0, Math.PI / 4, 0]} position={[0, -0.01, 0]}>
        <boxGeometry args={[1.9, 0.02, 0.28]} />
        <meshBasicMaterial color="#1a1404" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]} position={[0, -0.01, 0]}>
        <boxGeometry args={[1.9, 0.02, 0.28]} />
        <meshBasicMaterial color="#1a1404" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[1.75, 0.035, 0.16]} />
        <meshBasicMaterial color="#5a1021" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[1.75, 0.035, 0.16]} />
        <meshBasicMaterial color="#5a1021" toneMapped={false} />
      </mesh>
    </group>
  );
}
