import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PlayerMesh, SeatedPlayer } from "./PlayerMesh";
import { world } from "./sim";
import { useGame } from "./store";
import { kitById, UNIFORMS } from "./uniforms";

type Seat = "skater" | "goalie";

function PoseStage({ pose, index, kitId, seat }: { pose: string; index: number; kitId: number; seat: Seat | null }) {
  const advance = useThree((s) => s.advance);
  const clock = useThree((s) => s.clock);
  const stamp = useRef(0);
  const busy = useRef(false);

  useLayoutEffect(() => {
    const prev = clock.getDelta.bind(clock);
    clock.getDelta = () => 0;
    busy.current = true;
    let t = 0;
    for (let i = 0; i < 5; i++) {
      t += 0.05;
      stamp.current = t;
      advance(t, true);
    }
    busy.current = false;
    return () => {
      clock.getDelta = prev;
    };
  }, [advance, clock, pose, index]);

  return (
    <>
      <color attach="background" args={["#070b12"]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#d7e8f4", "#1a2838", 0.45]} />
      <directionalLight position={[3.2, 6.5, -2.4]} intensity={1.35} />
      <directionalLight position={[-3.5, 3.2, 3]} intensity={0.28} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#d5e4ee" roughness={0.4} metalness={0.02} />
      </mesh>
      {seat ? (
        <SeatedPlayer
          key={`${pose}-${index}-kit-${kitId}`}
          kit={kitById(kitId)}
          number={world.skaters[index]?.number ?? 1}
          holdStick={seat === "skater"}
          goalie={seat === "goalie"}
          seatX={-1}
          poseId={pose}
        />
      ) : (
        <PlayerMesh key={`${pose}-${index}-kit-${kitId}`} index={index} kitId={kitId} />
      )}
      <OrbitControls
        makeDefault
        target={[0, 0.9, 0]}
        enableDamping={false}
        enableRotate
        enableZoom
        minDistance={1.5}
        maxDistance={9}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 - 0.04}
      />
    </>
  );
}

function KitSwatch({ id, selected, onPick }: { id: number; selected: boolean; onPick: (id: number) => void }) {
  const u = UNIFORMS[id]!;
  return (
    <button
      type="button"
      aria-label={`Kit ${id + 1}`}
      onClick={() => onPick(id)}
      className={`uni-swatch${selected ? " is-on" : ""}`}
    >
      <span style={{ background: u.helmet }} />
      <span style={{ background: u.jersey }} />
      <span style={{ background: u.pants }} />
    </button>
  );
}

export function PoseGalleryView<Id extends string>({
  poses,
  labels,
  initial,
  applyPose,
  releasePoseGallery,
  seated,
}: {
  poses: readonly Id[];
  labels: Record<Id, string>;
  initial: Id;
  applyPose: (pose: Id) => number;
  releasePoseGallery: () => void;
  seated?: (pose: Id) => Seat | null;
}) {
  const homeKit = useGame((s) => s.homeKit);
  const setHomeKit = useGame((s) => s.setHomeKit);
  const [pose, setPose] = useState<Id>(initial);
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    setPose(initial);
    setIndex(applyPose(initial));
    return () => releasePoseGallery();
  }, [applyPose, initial, releasePoseGallery]);

  const pick = (next: Id) => {
    setPose(next);
    setIndex(applyPose(next));
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100dvh",
        width: "100%",
        background: "#070b12",
        color: "#e8ece6",
        textTransform: "uppercase",
      }}
    >
      <aside
        style={{
          width: 220,
          flex: "0 0 220px",
          overflow: "auto",
          borderRight: "1px solid #243040",
          background: "#10161f",
          padding: "16px 12px",
        }}
      >
        <div
          style={{
            fontFamily: '"Barlow Condensed", sans-serif',
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: 18,
            margin: "0 8px 12px",
          }}
        >
          Poses
        </div>
        {poses.map((id) => {
          const on = id === pose;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => pick(id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                marginBottom: 4,
                padding: "8px 10px",
                border: "none",
                borderLeft: on ? "3px solid #7eb8d4" : "3px solid transparent",
                borderRadius: 6,
                background: on ? "#1c2836" : "transparent",
                color: on ? "#e8ece6" : "#8b97a4",
                fontFamily: '"Barlow Condensed", sans-serif',
                fontSize: 16,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {labels[id]}
            </button>
          );
        })}
      </aside>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div
          role="group"
          aria-label="Uniforms"
          className="uni-row"
          style={{
            overflowX: "auto",
            flex: "0 0 auto",
            padding: "10px 12px",
            borderBottom: "1px solid #243040",
            background: "#10161f",
          }}
        >
          {UNIFORMS.map((kit) => (
            <KitSwatch key={kit.id} id={kit.id} selected={kit.id === homeKit} onPick={setHomeKit} />
          ))}
        </div>
        <div style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0 }}>
          <div
            style={{
              position: "absolute",
              zIndex: 1,
              top: 16,
              left: 18,
              pointerEvents: "none",
              fontFamily: '"Barlow Condensed", sans-serif',
              fontSize: 28,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {labels[pose]}
          </div>
          {index === null ? (
            <div
              style={{
                height: "100%",
                display: "grid",
                placeItems: "center",
                color: "#d7e8f4",
                textTransform: "uppercase",
              }}
            >
              Pose gallery
            </div>
          ) : (
            <Canvas
              frameloop="always"
              dpr={[1, 1.5]}
              gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.92 }}
              camera={{ position: [1.8, 1.4, -3.6], fov: 38, near: 0.05, far: 50 }}
              onCreated={({ gl, camera }) => {
                gl.setClearColor("#070b12");
                camera.lookAt(0, 0.9, 0);
              }}
              style={{ width: "100%", height: "100%", display: "block" }}
            >
              <PoseStage pose={pose} index={index} kitId={homeKit} seat={seated?.(pose) ?? null} />
            </Canvas>
          )}
        </div>
      </div>
    </div>
  );
}
