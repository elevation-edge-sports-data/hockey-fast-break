import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { applyFunctionPreview, PlayerMesh, RefereeMesh, type PreviewParts } from "./PlayerMesh";
import { registerFunctionPreview } from "./functionViewerGate";

registerFunctionPreview((id, parts) => applyFunctionPreview(id, parts as PreviewParts));
import {
  functionArgSpecs,
  functionViewGoalie,
  functionViewMesh,
  functionViewerArgValues,
  FUNCTION_VIEWS,
  primaryArg,
  resetFunctionViewerArgs,
  setFunctionViewerActive,
  setFunctionViewerArg,
  setFunctionViewerId,
  setFunctionViewerMesh,
  type FunctionArgSpec,
  type FunctionViewId,
  type ViewerValue,
} from "./functionViewer";
import { loosePuck, prepareGalleryPose, releasePoseGallery } from "./poseGallery";
import { BLUE_LINE_W, BLUE_X } from "./rink";
import { defendDir, world, type Skater } from "./sim";
import { useGame } from "./store";

function placeGoaliePuck(s: Skater, id: FunctionViewId): void {
  if (id === "poseGoalieGetUp") return;
  if (id === "poseGoalieCover") {
    loosePuck(0, -0.55);
    return;
  }
  const end = defendDir(s.side) > 0 ? 1 : -1;
  const edge = BLUE_X + BLUE_LINE_W * 0.5;
  loosePuck(-end * (edge + 6), 0);
}

function placeMesh(id: FunctionViewId): number {
  if (functionViewMesh(id) === "ref") {
    prepareGalleryPose(false, false);
    world.ref.x = 0;
    world.ref.z = 0;
    world.ref.yaw = 0;
    setFunctionViewerMesh(null);
    setFunctionViewerId(id);
    setFunctionViewerActive(true);
    return -1;
  }
  const { s, index } = prepareGalleryPose(functionViewGoalie(id), false);
  if (functionViewGoalie(id)) placeGoaliePuck(s, id);
  setFunctionViewerMesh(index);
  setFunctionViewerId(id);
  setFunctionViewerActive(true);
  return index;
}

function formatArg(spec: FunctionArgSpec, value: ViewerValue): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (spec.step >= 1) return String(Math.round(value));
  return value.toFixed(2);
}

function ArgPanel({
  id,
  playing,
  setPlaying,
  playStarted,
}: {
  id: FunctionViewId;
  playing: boolean;
  setPlaying: (on: boolean) => void;
  /** Set when Play begins. Left alone when the selected function changes, so the loop does not jump back to the start. */
  playStarted: MutableRefObject<number | null>;
}) {
  const specs = functionArgSpecs(id);
  const lead = primaryArg(id);
  const [values, setValues] = useState<Record<string, ViewerValue>>(() => functionViewerArgValues(id));

  useEffect(() => {
    if (!playing || !lead || lead.kind !== "number") return;
    if (playStarted.current == null) playStarted.current = performance.now();
    const started = playStarted.current;
    let frame = 0;
    const tick = (now: number) => {
      const phase = ((now - started) / 1400) % 2;
      const u = phase <= 1 ? phase : 2 - phase;
      const next = lead.min + (lead.max - lead.min) * u;
      setFunctionViewerArg(id, lead.name, next);
      setValues(functionViewerArgValues(id));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id, lead, playing, playStarted]);

  const write = (spec: FunctionArgSpec, value: ViewerValue) => {
    if (playing && spec.primary) setPlaying(false);
    setFunctionViewerArg(id, spec.name, value);
    setValues(functionViewerArgValues(id));
  };

  return (
    <div style={{ padding: "16px 12px", overflow: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 4px 8px" }}>
        <span style={{ fontFamily: '"Barlow Condensed", sans-serif', letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 14 }}>Arguments</span>
        {lead ? (
          <button
            type="button"
            aria-pressed={playing}
            onClick={() => setPlaying(!playing)}
            style={{
              border: "1px solid #3d4c5c",
              borderRadius: 6,
              background: playing ? "#1c2836" : "transparent",
              color: "#e8ece6",
              fontFamily: '"IBM Plex Sans", sans-serif',
              fontSize: 12,
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            {playing ? "Stop" : `Play ${lead.name}`}
          </button>
        ) : null}
      </div>
      {specs.map((spec) => {
        const value = values[spec.name] ?? spec.default;
        const shown = formatArg(spec, value);
        return (
          <div key={spec.name} style={{ display: "block", margin: "0 4px 10px", fontFamily: '"IBM Plex Sans", sans-serif', fontSize: 13 }}>
            <span style={{ display: "flex", justifyContent: "space-between", color: "#c5ced6", marginBottom: 4 }}>
              <span>{spec.name}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "#e8ece6" }}>{shown}</span>
            </span>
            {spec.kind === "boolean" ? (
              <button
                type="button"
                aria-pressed={value === true}
                aria-label={`${spec.name} ${shown}`}
                onClick={() => write(spec, value !== true)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "1px solid #3d4c5c",
                  borderRadius: 6,
                  background: value === true ? "#1c2836" : "transparent",
                  color: "#e8ece6",
                  padding: "6px 8px",
                  cursor: "pointer",
                }}
              >
                {shown}
              </button>
            ) : (
              <input
                type="range"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={typeof value === "number" ? value : spec.min}
                aria-label={spec.name}
                onChange={(event) => write(spec, Number(event.target.value))}
                style={{ width: "100%", accentColor: "#7eb8d4" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Preview of the procedural pose functions. No joint editing and no saves.
 * Camera, lights, and the gray ground match the pose editor.
 */
export function FunctionViewer() {
  const kitId = useGame((s) => s.homeKit);
  const [id, setId] = useState<FunctionViewId | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [playing, setPlayingState] = useState(false);
  const playStarted = useRef<number | null>(null);
  const setPlaying = (on: boolean) => {
    if (!on) playStarted.current = null;
    setPlayingState(on);
  };

  useLayoutEffect(() => {
    return () => {
      setFunctionViewerActive(false);
      setFunctionViewerId(null);
      setFunctionViewerMesh(null);
      releasePoseGallery();
    };
  }, []);

  const pick = (next: FunctionViewId) => {
    resetFunctionViewerArgs(next);
    setId(next);
    setIndex(placeMesh(next));
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100dvh",
        width: "100%",
        background: "#070b12",
        color: "#e8ece6",
      }}
    >
      <aside
        aria-label="Functions"
        style={{
          width: 260,
          flex: "0 0 260px",
          overflow: "auto",
          borderRight: "1px solid #243040",
          background: "#10161f",
          padding: "16px 12px",
          minHeight: 0,
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
          Functions
        </div>
        {FUNCTION_VIEWS.map((row) => {
          const on = row.id === id;
          return (
            <button
              key={row.id}
              type="button"
              aria-pressed={on}
              onClick={() => pick(row.id)}
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
                fontFamily: '"IBM Plex Sans", sans-serif',
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {row.label}
              {row.mesh !== "skater" ? <span style={{ display: "block", fontSize: 11, color: "#6f7c8a" }}>{row.mesh === "goalie" ? "goalie" : "referee"}</span> : null}
            </button>
          );
        })}
      </aside>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, background: "#79797b" }}>
        <Canvas shadows frameloop="always" camera={{ position: [2.8, 1.6, 3.6], fov: 38 }} style={{ width: "100%", height: "100%" }}>
          <color attach="background" args={["#79797b"]} />
          <ambientLight intensity={0.45} />
          <directionalLight position={[4, 7, 4]} intensity={1.1} castShadow />
          <gridHelper args={[8, 16, "#3a3a40", "#a4a4aa"]} />
          {id && functionViewMesh(id) === "ref" ? (
            <RefereeMesh key={id} />
          ) : index !== null && index >= 0 && id ? (
            <PlayerMesh key={`${functionViewGoalie(id) ? "g" : "s"}-${index}`} index={index} kitId={kitId} />
          ) : null}
          <OrbitControls makeDefault enableDamping={false} target={[0, 0.95, 0]} />
        </Canvas>
      </div>
      <aside
        aria-label="Arguments"
        style={{
          width: 300,
          flex: "0 0 300px",
          overflow: "auto",
          borderLeft: "1px solid #243040",
          background: "#10161f",
          minHeight: 0,
        }}
      >
        {id ? (
          <ArgPanel key={id} id={id} playing={playing} setPlaying={setPlaying} playStarted={playStarted} />
        ) : (
          <p style={{ margin: "20px 16px", color: "#8b97a4", fontFamily: '"IBM Plex Sans", sans-serif', fontSize: 14, lineHeight: 1.4 }}>
            Select a function.
          </p>
        )}
      </aside>
    </div>
  );
}
