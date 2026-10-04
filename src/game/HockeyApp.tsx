import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { World } from "./World";
import { useGame } from "./store";
import { world } from "./sim";

export function GameCanvas() {
  const quality = useGame((s) => s.quality);

  return (
    <Canvas
      className="rink-canvas"
      shadows={false}
      dpr={quality === "high" ? [1, 1.5] : [1, 1]}
      gl={{
        antialias: quality === "high",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.88,
        powerPreference: "high-performance",
      }}
      camera={{ position: [-13.6, 9.6, 0], fov: 50, near: 0.15, far: 220 }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor("#0c121c");
        const atk = world.homeAttack > 0 ? 1 : -1;
        camera.up.set(0, 1, 0);
        camera.position.set(-atk * 13.6, 9.6, 0);
        camera.lookAt(atk * 1.4, 0.4, 0);
      }}
    >
      <World />
    </Canvas>
  );
}

export function HockeyApp() {
  return <GameCanvas />;
}
