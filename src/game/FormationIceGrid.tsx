import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { iceGridSegments } from "./iceGrid";

/** Light 5 m lattice on the ice. Sits just above the painted lines. */
export function IceGrid() {
  const geometry = useMemo(() => {
    const segments = iceGridSegments();
    const position = new Float32Array(segments.length * 6);
    let i = 0;
    for (const [x0, z0, x1, z1] of segments) {
      position[i++] = x0;
      position[i++] = 0;
      position[i++] = z0;
      position[i++] = x1;
      position[i++] = 0;
      position[i++] = z1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    return geometry;
  }, []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} position={[0, 0.046, 0]} renderOrder={3} frustumCulled={false}>
      <lineBasicMaterial color="#8eabc4" transparent opacity={0.72} toneMapped={false} depthWrite={false} />
    </lineSegments>
  );
}
