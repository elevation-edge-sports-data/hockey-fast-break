import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type CSSProperties } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { PlayerMesh, SeatedPlayer } from "./PlayerMesh";
import { applyPose, holdNamedPose, prepareGalleryPose, PUBLIC_POSES, releasePoseGallery, type PublicPoseId } from "./poseGallery";
import { applyPoseJoints, noteSavedPose, POSE_JOINTS, pullPoseOverrides, savePoseOverride, type PoseJoints } from "./poseOverrides";
import { mountStickKnobPivot, mountStickOnHand, releaseStickFromHand, releaseStickKnobPivot } from "./stickKnobPivot";
import { world } from "./sim";
import { kitById, UNIFORMS } from "./uniforms";

function applyEditorPose(pose: string, applyFull: ((pose: string) => number) | null): number {
  if (pose === "default") {
    const { index } = prepareGalleryPose(false, false);
    holdNamedPose(index, "default");
    return index;
  }
  if (applyFull) return applyFull(pose);
  if ((PUBLIC_POSES as readonly string[]).includes(pose)) return applyPose(pose as PublicPoseId);
  return prepareGalleryPose(false, false).index;
}

const BG_KEY = "hfb-pose-editor-bg";
const SCENE_BG = { dark: "#0a0a0c", gray: "#79797b", light: "#e8e8ea" } as const;
const GRID_BG = {
  dark: ["#2a2a2a", "#1a1a1a"],
  gray: ["#3a3a40", "#a4a4aa"],
  light: ["#b9b9c2", "#d0d0d6"],
} as const;
type SceneBg = keyof typeof SCENE_BG;

function loadSceneBg(): SceneBg {
  try {
    const saved = localStorage.getItem(BG_KEY);
    if (saved === "dark" || saved === "gray" || saved === "light") return saved;
  } catch {
    return "gray";
  }
  return "gray";
}

/** The shaft mesh is not its own joint. Clicks on it select the stick shaft. The knob is part of that shaft. */
const SHAFT_HIT = "shaftHold";

/**
 * Mesh l* groups sit on the player's right, for skaters and goalies.
 * Menu labels and mesh clicks swap through this map. Stick shaft and blade are not sided.
 */
const SIDE_SWAP: Record<string, string> = {
  lArm: "rArm",
  rArm: "lArm",
  lFore: "rFore",
  rFore: "lFore",
  lHand: "rHand",
  rHand: "lHand",
  lLeg: "rLeg",
  rLeg: "lLeg",
  lShin: "rShin",
  rShin: "lShin",
  lBoot: "rBoot",
  rBoot: "lBoot",
};

/** Label id ↔ mesh id. The map is symmetric, so it works in both directions. */
function sidedMeshId(id: string): string {
  return SIDE_SWAP[id] ?? id;
}

const JOINTS: { id: string; label: string }[] = [
  { id: "body", label: "Torso" },
  { id: "head", label: "Head" },
  { id: "lArm", label: "Left Upper Arm" },
  { id: "lFore", label: "Left Forearm" },
  { id: "lHand", label: "Left Hand" },
  { id: "rArm", label: "Right Upper Arm" },
  { id: "rFore", label: "Right Forearm" },
  { id: "rHand", label: "Right Hand" },
  { id: "lLeg", label: "Left Thigh" },
  { id: "lShin", label: "Left Shin" },
  { id: "lBoot", label: "Left Skate" },
  { id: "rLeg", label: "Right Thigh" },
  { id: "rShin", label: "Right Shin" },
  { id: "rBoot", label: "Right Skate" },
  { id: "stick", label: "Stick shaft" },
  { id: "bladeGrp", label: "Stick blade" },
];

const EditorPlayer = memo(PlayerMesh);

type StickPivotApi = {
  release: () => void;
  restore: () => void;
};

/**
 * Write the gallery pose, then freeze so the gizmo is not overwritten.
 * A save locks edits. Switching during that save still bakes: the lock is
 * lifted only for these frames, then put back. A failed bake stays hidden.
 */
function PoseBake({ token, onBaked }: { token: number; onBaked: (ok: boolean) => void }) {
  const advance = useThree((s) => s.advance);
  const clock = useThree((s) => s.clock);

  useLayoutEffect(() => {
    const locked = world.poseEditorLock;
    world.poseEditorLock = false;
    world.poseEditorActive = false;
    const prev = clock.getDelta.bind(clock);
    clock.getDelta = () => 0;
    let posed = false;
    try {
      let t = 0;
      for (let i = 0; i < 5; i++) {
        t += 0.05;
        advance(t, true);
      }
      posed = true;
    } finally {
      clock.getDelta = prev;
      world.poseEditorActive = true;
      if (locked) world.poseEditorLock = true;
    }
    onBaked(posed);
  }, [advance, clock, onBaked, token]);

  return null;
}

function Scene({
  selected,
  mode,
  object,
  setJoints,
  setSelected,
  meshIndex,
  bake,
  onBaked,
  sceneBg,
  kitId,
  pose,
  seat,
  stickPivotRef,
  editable,
  showPlayer,
  posedEpoch,
  stick,
  hand,
}: {
  selected: string | null;
  mode: "translate" | "rotate";
  object: THREE.Object3D | null;
  setJoints: (refs: Record<string, THREE.Object3D | null>) => void;
  setSelected: (id: string) => void;
  meshIndex: number;
  bake: number;
  onBaked: (ok: boolean) => void;
  sceneBg: SceneBg;
  kitId: number;
  pose: string;
  seat: "skater" | "goalie" | null;
  stickPivotRef: { current: StickPivotApi | null };
  editable: boolean;
  showPlayer: boolean;
  posedEpoch: number;
  /** Stick group. Parented under `hand` while the editor is active. */
  stick: THREE.Object3D | null;
  /** Goalie right hand, or the skater left hand. */
  hand: THREE.Object3D | null;
}) {
  const orbitRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const pivotRef = useRef<THREE.Group>(new THREE.Group());
  const pivotedStick = useRef<THREE.Object3D | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const [gizmo, setGizmo] = useState<THREE.Object3D | null>(null);

  const stickRef = useRef(stick);
  const handRef = useRef(hand);
  stickRef.current = stick;
  handRef.current = hand;

  const releaseKnob = useCallback(() => {
    releaseStickKnobPivot(pivotedStick.current, pivotRef.current);
    pivotedStick.current = null;
  }, []);

  const releasePivot = useCallback(() => {
    releaseKnob();
    releaseStickFromHand(stickRef.current);
  }, [releaseKnob]);

  const restorePivot = useCallback(() => {
    const stickObj = stickRef.current;
    const handObj = handRef.current;
    if (stickObj && handObj && world.poseEditorActive) mountStickOnHand(stickObj, handObj);
    if (selected !== "stick" || !object) {
      releaseKnob();
      setGizmo(object);
      return;
    }
    releaseKnob();
    const home = mountStickKnobPivot(object, pivotRef.current);
    if (!home) {
      setGizmo(object);
      return;
    }
    pivotedStick.current = object;
    setGizmo(pivotRef.current);
  }, [object, releaseKnob, selected]);

  useLayoutEffect(() => {
    stickPivotRef.current = { release: releasePivot, restore: restorePivot };
    if (editable) restorePivot();
    else {
      releasePivot();
      setGizmo(null);
    }
    return () => {
      releasePivot();
      if (stickPivotRef.current?.release === releasePivot) stickPivotRef.current = null;
    };
  }, [editable, posedEpoch, releasePivot, restorePivot, stickPivotRef]);

  useEffect(() => {
    invalidate();
  }, [invalidate, sceneBg, selected, mode, gizmo]);

  return (
    <>
      <color attach="background" args={[SCENE_BG[sceneBg]]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 7, 4]} intensity={1.1} castShadow />
      <gridHelper args={[8, 16, GRID_BG[sceneBg][0], GRID_BG[sceneBg][1]]} />

      <group visible={showPlayer}>
        {seat ? (
          <SeatedPlayer
            key={`${pose}-${bake}`}
            kit={kitById(kitId)}
            number={1}
            holdStick={seat === "skater"}
            goalie={seat === "goalie"}
            seatX={-1}
            poseId={pose}
            onJointRefs={setJoints}
            onJointClick={editable ? setSelected : undefined}
          />
        ) : (
          <EditorPlayer
            key={`${meshIndex}-${bake}`}
            index={meshIndex}
            kitId={kitId}
            onJointRefs={setJoints}
            onJointClick={editable ? setSelected : undefined}
            posedEpoch={posedEpoch}
          />
        )}
      </group>
      <PoseBake token={bake} onBaked={onBaked} />

      {editable && gizmo && (
        <TransformControls
          object={gizmo}
          mode={mode}
          size={0.55}
          onMouseDown={() => {
            if (orbitRef.current) orbitRef.current.enabled = false;
          }}
          onMouseUp={() => {
            if (orbitRef.current) orbitRef.current.enabled = true;
          }}
        />
      )}

      <OrbitControls ref={orbitRef} makeDefault enableDamping={false} target={[0, 0.95, 0]} />
    </>
  );
}

const EditorScene = memo(Scene);

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function PoseEditor({
  poses = PUBLIC_POSES,
  labels,
  applyNamedPose,
  showRest = true,
  publicOnly = false,
  seated,
}: {
  poses?: readonly string[];
  labels?: Record<string, string>;
  applyNamedPose?: (pose: string) => number;
  showRest?: boolean;
  /** Refuse save names outside the public gallery set. */
  publicOnly?: boolean;
  seated?: (pose: string) => "skater" | "goalie" | null;
}) {
  const [pose, setPose] = useState(showRest ? "default" : "wrist");
  const posesRef = useRef(poses);
  const labelsRef = useRef(labels);
  const applyRef = useRef(applyNamedPose);
  const restRef = useRef(showRest);
  posesRef.current = poses;
  labelsRef.current = labels;
  applyRef.current = applyNamedPose;
  restRef.current = showRest;
  const [meshIndex, setMeshIndex] = useState<number | null>(null);
  const [bake, setBake] = useState(0);
  const [selected, setSelected] = useState<string | null>("lShin");
  const [mode, setMode] = useState<"translate" | "rotate">("rotate");
  const [sceneBg, setSceneBg] = useState<SceneBg>(loadSceneBg);
  const [kitId, setKitId] = useState(0);
  const [joints, setJointsState] = useState<Record<string, THREE.Object3D | null>>({});
  const [saving, setSaving] = useState(false);
  const [showPlayer, setShowPlayer] = useState(true);
  const [posedEpoch, setPosedEpoch] = useState(0);
  const [saveNote, setSaveNote] = useState("");
  const savingRef = useRef(false);
  const poseShownRef = useRef(true);
  savingRef.current = saving;
  const jointsRef = useRef(joints);
  const stickPivotRef = useRef<StickPivotApi | null>(null);
  jointsRef.current = joints;

  const commitJoints = useCallback((next: Record<string, THREE.Object3D | null>) => {
    setJointsState((prev) => {
      const keys = Object.keys(next);
      if (keys.length === Object.keys(prev).length && keys.every((key) => prev[key] === next[key])) return prev;
      return next;
    });
  }, []);

  const onBaked = useCallback((ok: boolean) => {
    poseShownRef.current = ok;
    setShowPlayer(ok);
    if (ok) setPosedEpoch((n) => n + 1);
  }, []);

  useLayoutEffect(() => {
    world.poseEditorActive = true;
    const start = restRef.current ? "default" : (posesRef.current[0] ?? "wrist");
    setPose(start);
    setMeshIndex(applyEditorPose(start, applyRef.current ?? null));
    return () => {
      world.poseEditorActive = false;
      releasePoseGallery();
    };
  }, []);

  const loadPose = (next: string) => {
    stickPivotRef.current?.release();
    world.poseEditorActive = true;
    const index = applyEditorPose(next, applyRef.current ?? null);
    if (savingRef.current) setShowPlayer(false);
    setPose(next);
    setMeshIndex(index);
    commitJoints({});
    setBake((n) => n + 1);
  };

  const poseChoices = poses;
  const poseLabel = (id: string) => labels?.[id] ?? id;
  const poseRef = useRef(pose);
  poseRef.current = pose;

  useEffect(() => {
    void pullPoseOverrides();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BG_KEY, sceneBg);
    } catch {
      /* ignore */
    }
  }, [sceneBg]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (savingRef.current || event.metaKey || event.ctrlKey || event.altKey || typingTarget(event.target)) return;
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        setMode("rotate");
      } else if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        setMode("translate");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pickJoint = useCallback((id: string) => {
    if (savingRef.current) return;
    const hit = id === SHAFT_HIT ? "stick" : id;
    setSelected(sidedMeshId(hit));
  }, []);

  const info = JOINTS.find((joint) => joint.id === selected);
  const controlId = selected ? sidedMeshId(selected) : null;
  const controlObject = controlId ? joints[controlId] ?? null : null;
  const canSave = !saving && (poses.includes(pose) || (showRest && pose === "default"));

  const savePose = () => {
    const name = poseRef.current;
    const listed = posesRef.current.includes(name) || (restRef.current && name === "default");
    if (saving || !listed) return;
    if (publicOnly && !(PUBLIC_POSES as readonly string[]).includes(name)) {
      setSaveNote("That pose cannot be saved from the public editor.");
      return;
    }
    stickPivotRef.current?.release();
    const saved: PoseJoints = {};
    for (const id of POSE_JOINTS) {
      const group = jointsRef.current[id];
      if (!group) continue;
      const r = group.rotation;
      const rx = Math.round(r.x * 10000) / 10000;
      const ry = Math.round(r.y * 10000) / 10000;
      const rz = Math.round(r.z * 10000) / 10000;
      // Shaft scale is the stick length, so that group is not a saved joint.
      if (id === "shaftHold") continue;
      const p = group.position;
      saved[id] = [
        rx,
        ry,
        rz,
        Math.round(p.x * 10000) / 10000,
        Math.round(p.y * 10000) / 10000,
        Math.round(p.z * 10000) / 10000,
      ];
    }
    if (!saved.body) {
      setSaveNote("The pose is still settling.");
      return;
    }
    world.poseEditorLock = true;
    world.poseEditorActive = true;
    noteSavedPose(name, saved);
    setSaving(true);
    setSaveNote("Saving and rebuilding…");
    savePoseOverride(name, saved, publicOnly).then(
      () => {
        if (poseRef.current === name) applyPoseJoints(name, jointsRef.current);
        world.poseEditorActive = true;
        setSaveNote("Saved and rebuilt. Refresh galleries / game / editor to see it.");
      },
      (err: unknown) => {
        world.poseEditorActive = true;
        setSaveNote(err instanceof Error ? err.message : "Save failed.");
      },
    ).finally(() => {
      world.poseEditorLock = false;
      world.poseEditorActive = true;
      setSaving(false);
      if (poseShownRef.current) stickPivotRef.current?.restore();
      else setBake((n) => n + 1);
    });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 360px) minmax(0, 1fr) 220px",
        gridTemplateRows: "auto minmax(0, 1fr)",
        height: "100vh",
        minHeight: 0,
        overflow: "hidden",
        background: "#070b12",
        color: "#e8ece6",
      }}
    >
      <div style={barCell}>
        <div style={{ ...selectedLine, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Selected: {poseLabel(pose)}
        </div>
        <button
          type="button"
          onClick={savePose}
          disabled={!canSave}
          style={{
            ...btn(canSave, "green"),
            flex: "0 0 auto",
            fontWeight: 700,
            opacity: canSave ? 1 : 0.45,
            cursor: canSave ? "pointer" : "default",
          }}
        >
          {saving ? "Saving…" : "Save pose"}
        </button>
        <button type="button" onClick={() => loadPose(pose)} style={{ ...btn(false), flex: "0 0 auto" }}>
          Reset
        </button>
      </div>
      <div style={{ ...barCell, flexDirection: "column", alignItems: "stretch", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setMode("rotate")} style={btn(mode === "rotate", "charcoal")}>
              Rotate
            </button>
            <button type="button" onClick={() => setMode("translate")} style={btn(mode === "translate", "charcoal")}>
              Translate
            </button>
          </div>
          <div className="uni-row" role="group" aria-label="Uniform">
            {UNIFORMS.map((kit) => (
              <KitSwatch key={kit.id} id={kit.id} selected={kit.id === kitId} onPick={setKitId} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" aria-pressed={sceneBg === "dark"} onClick={() => setSceneBg("dark")} style={btn(sceneBg === "dark", "charcoal")}>
              Dark
            </button>
            <button type="button" aria-pressed={sceneBg === "gray"} onClick={() => setSceneBg("gray")} style={btn(sceneBg === "gray", "charcoal")}>
              Gray
            </button>
            <button type="button" aria-pressed={sceneBg === "light"} onClick={() => setSceneBg("light")} style={btn(sceneBg === "light", "charcoal")}>
              Light
            </button>
          </div>
        </div>
        {saveNote ? (
          <div
            style={{
              fontFamily: '"Barlow Condensed", sans-serif',
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              fontSize: 14,
              lineHeight: 1.3,
              color: saveNote.startsWith("Saved ") ? "#9c9" : saveNote.startsWith("Saving") ? "#9ab" : "#f0a0a0",
            }}
          >
            {saveNote}
          </div>
        ) : null}
      </div>
      <div style={{ ...barCell, ...selectedLine }}>
        Selected: {info?.label ?? "none"}
      </div>
      <aside
        style={{
          width: 220,
          flex: "0 0 220px",
          height: "100%",
          minHeight: 0,
          overflowY: "auto",
          borderRight: "1px solid #243040",
          background: "#10161f",
          padding: "16px 12px",
        }}
      >
        <div style={menuHead}>Poses</div>
        {(showRest && !poseChoices.includes("default") ? ["default", ...poseChoices] : poseChoices).map((id) => {
          const on = id === pose;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => loadPose(id)}
              style={menuRow(on)}
            >
              {poseLabel(id)}
            </button>
          );
        })}
      </aside>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, height: "100%", background: SCENE_BG[sceneBg] }}>
        {meshIndex !== null ? (
          <Canvas shadows frameloop="demand" camera={{ position: [2.8, 1.6, 3.6], fov: 38 }}>
            <EditorScene
              selected={selected}
              mode={mode}
              object={controlObject}
              setJoints={commitJoints}
              setSelected={pickJoint}
              meshIndex={meshIndex}
              bake={bake}
              onBaked={onBaked}
              sceneBg={sceneBg}
              kitId={kitId}
              pose={pose}
              seat={seated?.(pose) ?? null}
              stickPivotRef={stickPivotRef}
              editable={!saving}
              showPlayer={showPlayer}
              posedEpoch={posedEpoch}
              stick={joints.stick ?? null}
              hand={
                (seated?.(pose) === "goalie" || (meshIndex != null && world.skaters[meshIndex]?.kind === "goalie")
                  ? joints.lHand
                  : joints.rHand) ?? null
              }
            />
          </Canvas>
        ) : null}
      </div>

      <aside
        style={{
          width: 220,
          flex: "0 0 220px",
          height: "100%",
          minHeight: 0,
          overflowY: "auto",
          background: "#10161f",
          color: "#e8ece6",
          padding: "16px 12px",
          borderLeft: "1px solid #243040",
        }}
      >
        <div style={menuHead}>Body</div>
        {JOINTS.map((joint) => {
          const on = selected === joint.id;
          return (
            <button
              key={joint.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (saving) return;
                setSelected(joint.id);
              }}
              disabled={saving || !joints[sidedMeshId(joint.id)]}
              style={{ ...menuRow(on), opacity: saving || !joints[sidedMeshId(joint.id)] ? 0.4 : 1 }}
            >
              {joint.label}
            </button>
          );
        })}
      </aside>
    </div>
  );
}

function KitSwatch({ id, selected, onPick }: { id: number; selected: boolean; onPick: (id: number) => void }) {
  const kit = UNIFORMS[id]!;
  return (
    <button
      type="button"
      aria-label={`Kit ${id + 1}`}
      aria-pressed={selected}
      onClick={() => onPick(id)}
      className={`uni-swatch${selected ? " is-on" : ""}`}
    >
      <span style={{ background: kit.helmet }} />
      <span style={{ background: kit.jersey }} />
      <span style={{ background: kit.pants }} />
    </button>
  );
}

function menuRow(on: boolean): CSSProperties {
  return {
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
    cursor: "pointer",
  };
}

const barCell: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 48,
  padding: "8px 12px",
  background: "#10161f",
  borderBottom: "1px solid #243040",
};

const menuHead: CSSProperties = {
  fontFamily: '"Barlow Condensed", sans-serif',
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontSize: 18,
  margin: "0 8px 12px",
};

const selectedLine: CSSProperties = {
  fontFamily: '"Barlow Condensed", sans-serif',
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  fontSize: 16,
};

function btn(active: boolean, tone: "green" | "charcoal" = "charcoal"): CSSProperties {
  return {
    background: active ? (tone === "green" ? "#2d8a5a" : "#5c6370") : "#1c2836",
    color: active ? "#e8ece6" : "#8b97a4",
    border: "none",
    borderRadius: 6,
    padding: "8px 10px",
    cursor: "pointer",
    fontFamily: '"Barlow Condensed", sans-serif',
    fontSize: 16,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

export default PoseEditor;
