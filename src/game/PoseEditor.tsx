import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type CSSProperties } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { PlayerMesh, SeatedPlayer } from "./PlayerMesh";
import { applyPose, holdNamedPose, prepareGalleryPose, PUBLIC_POSES, releasePoseGallery, type PublicPoseId } from "./poseGallery";
import { applyPoseJoints, noteSavedPose, POSE_JOINTS, poseStoredPosition, pullPoseOverrides, savePoseOverride, type PoseJoints } from "./poseOverrides";
import {
  addWorldEuler,
  applyWorldQuaternion,
  originForFixedRotationOffset,
  readWorldEuler,
  rotateAboutWorldAxis,
  rotationFrameOffset,
  rotationWorldQuaternion,
  setWorldEulerAxis,
} from "./poseWorldEuler";
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

/** The shaft mesh is not its own joint. Clicks on it select the stick. The knob is part of that shaft. */
const SHAFT_HIT = "shaftHold";

/**
 * Mesh l* groups sit on the player's right, for skaters and goalies.
 * Menu labels and mesh clicks swap through this map. Stick and blade are not sided.
 * The stick stays on the player's left hand (mesh rHand) for strideLeft and strideRight.
 */
/** Player's left hand. Body +X. Both stride poses parent the stick here. */
function skaterLeftHand(joints: Record<string, THREE.Object3D | null>): THREE.Object3D | null {
  return joints.rHand ?? null;
}

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
  { id: "body", label: "Body" },
  { id: "torso", label: "Torso" },
  { id: "hips", label: "Hips" },
  { id: "shoulders", label: "Shoulders" },
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
  { id: "stick", label: "Stick" },
  { id: "bladeGrp", label: "Blade" },
];

const EditorPlayer = memo(PlayerMesh);

type StickPivotApi = {
  release: () => void;
  restore: () => void;
};

type EditApi = {
  undo: () => void;
  redo: () => void;
  /** Record the joint, run `mutate`, then keep the previous pose if it changed. */
  commit: (object: THREE.Object3D, mutate: () => void) => void;
};

/** World pose of one joint. Restores a drag, a typed value, or a nudge. */
type JointSnap = {
  object: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

const POS_STEP = 0.01;
const ROT_STEP = 0.05;
/** Keep a nudged joint origin inside the frame, not on the exact pixel edge. */
const VIEW_MARGIN = 0.96;

const UNDO_MAX = 20;
const _jointPos = new THREE.Vector3();
const _jointQuat = new THREE.Quaternion();
const _viewWorld = new THREE.Vector3();
const _viewCam = new THREE.Vector3();
const _viewFwd = new THREE.Vector3();
const _viewNdc = new THREE.Vector3();
const _gizmoLocal = new THREE.Vector3();
const _gizmoPos = new THREE.Vector3();
const _gizmoQuat = new THREE.Quaternion();
const _gizmoDelta = new THREE.Quaternion();
const _gizmoJointPos = new THREE.Vector3();
const _gizmoJointQuat = new THREE.Quaternion();
const _gizmoScratchQuat = new THREE.Quaternion();
const _gizmoOrbit = new THREE.Vector3();
const _gizmoBox = new THREE.Box3();
const _gizmoBoxTmp = new THREE.Box3();
const _quatStart = new THREE.Quaternion();
const _pivotWorld = new THREE.Vector3();
const _localOff = new THREE.Vector3();
/** Joint or stick-knob pivot receiving the world-axis drag. */
let _spinTarget: THREE.Object3D | null = null;
/** Body/torso anchor. Its world point stays fixed while the joint turns. */
let _orbitAnchor: THREE.Object3D | null = null;
/** Stick pieces. They would pull the body center off the player. */
const BODY_GIZMO_SKIP = new Set(["goalieKnob", "goalieShaft", "goalieBlade", "goalieIce"]);

/** Pivot height stored on the body. Walk up from torso or body. */
function torsoPivotOf(joint: THREE.Object3D): number {
  let node: THREE.Object3D | null = joint;
  while (node) {
    const y = node.userData.torsoPivotY;
    if (typeof y === "number" && y !== 0) return y;
    node = node.parent;
  }
  return 0;
}

/**
 * The body origin sits on the torso center, and the torso origin sits on the body center.
 * The gizmo for each joint is drawn at the other one's rest point.
 */
function swappedGizmoOffset(id: string, joint: THREE.Object3D, out: THREE.Vector3): boolean {
  if (id !== "body" && id !== "torso") return false;
  const pivot = torsoPivotOf(joint);
  if (!pivot) return false;
  // Goalie torso origin is already the jersey center. Skaters still need the offset.
  if (id === "torso" && joint.userData.torsoCentered) {
    out.set(0, 0, 0);
    return true;
  }
  out.set(0, id === "torso" ? pivot : -pivot, 0);
  return true;
}

/** World center of the posed body, without the stick. */
function bodyVisualCenter(body: THREE.Object3D, out: THREE.Vector3): boolean {
  let hit = false;
  body.updateWorldMatrix(true, true);
  body.traverse((obj) => {
    let node: THREE.Object3D | null = obj;
    while (node) {
      if (BODY_GIZMO_SKIP.has(node.name)) return;
      node = node.parent;
    }
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (!bounds) return;
    _gizmoBoxTmp.copy(bounds).applyMatrix4(mesh.matrixWorld);
    if (!hit) {
      _gizmoBox.copy(_gizmoBoxTmp);
      hit = true;
    } else _gizmoBox.union(_gizmoBoxTmp);
  });
  if (!hit) return false;
  _gizmoBox.getCenter(out);
  return true;
}

/** Put the anchor on the swapped center, oriented with the joint. */
function placeGizmoAnchor(anchor: THREE.Object3D, joint: THREE.Object3D, id: string, lastPos: THREE.Vector3, lastQuat: THREE.Quaternion, pose: string): boolean {
  joint.updateWorldMatrix(true, false);
  if (id === "body" && (pose === "goalieButterfly" || pose === "goalieGloveSave" || pose === "goalieBlockerSave" || pose === "goalieDivingGloveSave" || pose === "goalieDivingStickSave" || pose === "goalieProtectLeft" || pose === "goalieProtectRight" || pose === "goalieCover")) {
    if (!bodyVisualCenter(joint, _gizmoLocal)) return false;
  } else {
    if (!swappedGizmoOffset(id, joint, _gizmoLocal)) return false;
    joint.localToWorld(_gizmoLocal);
  }
  rotationWorldQuaternion(joint, _gizmoQuat);
  anchor.position.copy(_gizmoLocal);
  anchor.quaternion.copy(_gizmoQuat);
  anchor.scale.set(1, 1, 1);
  anchor.updateMatrixWorld(true);
  lastPos.copy(_gizmoLocal);
  lastQuat.copy(_gizmoQuat);
  return true;
}

/**
 * Remember the world orientation before a wheel drag.
 * Body and torso orbit the anchor. The stick gizmo turns the knob pivot, so
 * the knob stays put. Every other joint turns about its own origin.
 */
function beginRotationDrag(joint: THREE.Object3D, gizmo: THREE.Object3D | null, anchor: THREE.Object3D | null) {
  _orbitAnchor = null;
  _localOff.set(0, 0, 0);
  if (anchor && anchor !== joint) {
    _spinTarget = joint;
    _orbitAnchor = anchor;
    joint.updateWorldMatrix(true, false);
    anchor.updateWorldMatrix(true, false);
    anchor.getWorldPosition(_pivotWorld);
    joint.getWorldPosition(_gizmoJointPos);
    rotationWorldQuaternion(joint, _gizmoJointQuat);
    rotationFrameOffset(_gizmoJointPos, _pivotWorld, _gizmoJointQuat, _localOff);
  } else if (gizmo && gizmo !== joint) {
    _spinTarget = gizmo;
  } else {
    _spinTarget = joint;
  }
  rotationWorldQuaternion(_spinTarget, _quatStart);
}

/** Turn the drag target about one fixed world axis, from the pointer-down pose. */
function applyRotationDrag(axis: "X" | "Y" | "Z", angle: number) {
  const target = _spinTarget;
  if (!target) return;
  rotateAboutWorldAxis(target, axis, angle, _quatStart);
  const anchor = _orbitAnchor;
  if (anchor && _localOff.lengthSq() > 1e-12) {
    const parent = target.parent;
    if (!parent) return;
    rotationWorldQuaternion(target, _gizmoQuat);
    originForFixedRotationOffset(_pivotWorld, _gizmoQuat, _localOff, _gizmoJointPos);
    parent.updateWorldMatrix(true, false);
    parent.worldToLocal(target.position.copy(_gizmoJointPos));
    target.updateMatrixWorld(true);
    rotationWorldQuaternion(target, anchor.quaternion);
    anchor.position.copy(_pivotWorld);
    anchor.updateMatrixWorld(true);
    return;
  }
  target.updateMatrixWorld(true);
}

/**
 * Drag of the anchor moves the joint around that swapped center.
 * Translation changes position only. Rotation uses the scale-free world
 * quaternion. Decomposing matrixWorld shears under the goalie root scale
 * and turns a move into a spin.
 */
function applyGizmoAnchor(anchor: THREE.Object3D, joint: THREE.Object3D, lastPos: THREE.Vector3, lastQuat: THREE.Quaternion, translating: boolean) {
  const parent = joint.parent;
  if (!parent) return;
  anchor.updateWorldMatrix(true, false);
  joint.updateWorldMatrix(true, false);
  anchor.getWorldPosition(_gizmoPos);
  if (translating) {
    joint.getWorldPosition(_gizmoJointPos).add(_gizmoPos).sub(lastPos);
    parent.updateWorldMatrix(true, false);
    parent.worldToLocal(joint.position.copy(_gizmoJointPos));
    joint.updateMatrixWorld(true);
    lastPos.copy(_gizmoPos);
    return;
  }
  rotationWorldQuaternion(anchor, _gizmoQuat);
  _gizmoDelta.copy(_gizmoQuat).multiply(_gizmoScratchQuat.copy(lastQuat).invert());
  joint.getWorldPosition(_gizmoJointPos);
  rotationWorldQuaternion(joint, _gizmoJointQuat);
  _gizmoOrbit.copy(_gizmoJointPos).sub(lastPos);
  _gizmoOrbit.applyQuaternion(_gizmoDelta);
  _gizmoJointPos.copy(lastPos).add(_gizmoOrbit).add(_gizmoPos).sub(lastPos);
  _gizmoJointQuat.premultiply(_gizmoDelta);
  parent.updateWorldMatrix(true, false);
  parent.worldToLocal(joint.position.copy(_gizmoJointPos));
  applyWorldQuaternion(joint, _gizmoJointQuat);
  joint.updateMatrixWorld(true);
  lastPos.copy(_gizmoPos);
  lastQuat.copy(_gizmoQuat);
}

/** Pull a joint origin back into the camera's current view. Local position is what the panel edits. */
function clampJointToView(object: THREE.Object3D, camera: THREE.Camera) {
  const parent = object.parent;
  if (!parent) return;
  object.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();
  object.getWorldPosition(_viewWorld);
  camera.getWorldPosition(_viewCam);
  camera.getWorldDirection(_viewFwd);
  const ahead = _viewWorld.x * _viewFwd.x + _viewWorld.y * _viewFwd.y + _viewWorld.z * _viewFwd.z
    - (_viewCam.x * _viewFwd.x + _viewCam.y * _viewFwd.y + _viewCam.z * _viewFwd.z);
  const near = camera instanceof THREE.PerspectiveCamera ? camera.near : 0.1;
  if (ahead < near * 4) _viewWorld.addScaledVector(_viewFwd, near * 4 - ahead);
  _viewNdc.copy(_viewWorld).project(camera);
  const nx = _viewNdc.x;
  const ny = _viewNdc.y;
  const nz = _viewNdc.z;
  const x = THREE.MathUtils.clamp(nx, -VIEW_MARGIN, VIEW_MARGIN);
  const y = THREE.MathUtils.clamp(ny, -VIEW_MARGIN, VIEW_MARGIN);
  const zOk = Number.isFinite(nz) && nz >= -1 && nz <= 1;
  const z = zOk ? nz : THREE.MathUtils.clamp(Number.isFinite(nz) ? nz : 0, -0.98, 0.98);
  const onScreen = ahead >= near * 4 && Math.abs(nx) <= VIEW_MARGIN + 1e-4 && Math.abs(ny) <= VIEW_MARGIN + 1e-4 && zOk;
  if (onScreen) return;
  _viewNdc.set(x, y, z).unproject(camera);
  parent.worldToLocal(_viewNdc);
  object.position.copy(_viewNdc);
}

function captureJoint(object: THREE.Object3D): JointSnap {
  object.updateWorldMatrix(true, false);
  return {
    object,
    position: object.getWorldPosition(new THREE.Vector3()),
    quaternion: rotationWorldQuaternion(object, new THREE.Quaternion()),
  };
}

function jointMoved(snap: JointSnap): boolean {
  snap.object.updateWorldMatrix(true, false);
  snap.object.getWorldPosition(_jointPos);
  rotationWorldQuaternion(snap.object, _jointQuat);
  if (_jointPos.distanceToSquared(snap.position) > 1e-10) return true;
  return Math.abs(1 - Math.abs(_jointQuat.dot(snap.quaternion))) > 1e-8;
}

function applyJoint(snap: JointSnap) {
  const parent = snap.object.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.worldToLocal(snap.object.position.copy(snap.position));
  applyWorldQuaternion(snap.object, snap.quaternion);
  snap.object.updateMatrixWorld();
}

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
  editApi,
  onHistory,
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
  editApi: { current: EditApi };
  onHistory: (undo: number, redo: number) => void;
  editable: boolean;
  showPlayer: boolean;
  posedEpoch: number;
  /** Stick group. Parented under `hand` while the editor is active. */
  stick: THREE.Object3D | null;
  /** Goalie right hand (mesh lHand), or the skater left hand (mesh rHand). */
  hand: THREE.Object3D | null;
}) {
  const orbitRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const pivotRef = useRef<THREE.Group>(new THREE.Group());
  const pivotedStick = useRef<THREE.Object3D | null>(null);
  const anchorRef = useRef<THREE.Group>(new THREE.Group());
  const anchorPos = useRef(new THREE.Vector3());
  const anchorQuat = useRef(new THREE.Quaternion());
  const draggingGizmo = useRef(false);
  const controlsRef = useRef<{ axis: string | null; mode: string; rotationAngle: number; dragging: boolean } | null>(null);
  const objectRef = useRef(object);
  objectRef.current = object;
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
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
    const anchor = anchorRef.current;
    if (selected !== "stick" || !object) {
      releaseKnob();
      if (object && (selected === "body" || selected === "torso") && placeGizmoAnchor(anchor, object, selected, anchorPos.current, anchorQuat.current, pose)) {
        if (anchor.parent !== scene) scene.add(anchor);
        setGizmo(anchor);
        return;
      }
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
  }, [object, pose, releaseKnob, scene, selected]);

  const pastRef = useRef<JointSnap[]>([]);
  const futureRef = useRef<JointSnap[]>([]);
  const pendingRef = useRef<JointSnap | null>(null);

  const publishHistory = () => onHistory(pastRef.current.length, futureRef.current.length);

  const pushPast = (before: JointSnap) => {
    futureRef.current = [];
    pastRef.current.push(before);
    if (pastRef.current.length > UNDO_MAX) pastRef.current.shift();
    publishHistory();
  };

  const rememberDrag = () => {
    if (!object) return;
    pendingRef.current = captureJoint(object);
  };

  const commitDrag = () => {
    const before = pendingRef.current;
    pendingRef.current = null;
    if (!before || before.object !== object) return;
    clampJointToView(object, camera);
    if (!jointMoved(before)) return;
    pushPast(before);
    invalidate();
  };

  editApi.current.commit = (target, mutate) => {
    if (!target.parent) return;
    const before = captureJoint(target);
    mutate();
    target.updateWorldMatrix(true, false);
    if (target.getWorldPosition(_viewWorld).distanceToSquared(before.position) > 1e-10) clampJointToView(target, camera);
    target.updateMatrixWorld();
    if (!jointMoved(before)) return;
    pushPast(before);
    restorePivot();
    invalidate();
  };

  editApi.current.undo = () => {
    const before = pastRef.current[pastRef.current.length - 1];
    if (!before?.object.parent) return;
    const current = captureJoint(before.object);
    pastRef.current.pop();
    futureRef.current.push(current);
    applyJoint(before);
    publishHistory();
    restorePivot();
    invalidate();
  };

  editApi.current.redo = () => {
    const next = futureRef.current[futureRef.current.length - 1];
    if (!next?.object.parent) return;
    const current = captureJoint(next.object);
    futureRef.current.pop();
    pastRef.current.push(current);
    if (pastRef.current.length > UNDO_MAX) pastRef.current.shift();
    applyJoint(next);
    publishHistory();
    restorePivot();
    invalidate();
  };

  useEffect(() => {
    pastRef.current = [];
    futureRef.current = [];
    pendingRef.current = null;
    onHistory(0, 0);
  }, [bake, meshIndex, onHistory, pose]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    anchor.name = "poseGizmoAnchor";
    scene.add(anchor);
    return () => {
      scene.remove(anchor);
    };
  }, [scene]);

  useLayoutEffect(() => {
    stickPivotRef.current = { release: releasePivot, restore: restorePivot };
    if (editable) restorePivot();
    else {
      releasePivot();
      draggingGizmo.current = false;
      setGizmo(null);
    }
    return () => {
      releasePivot();
      draggingGizmo.current = false;
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
            posedEpoch={posedEpoch}
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
          ref={controlsRef}
          object={gizmo}
          mode={mode}
          space="world"
          size={0.55}
          onMouseDown={() => {
            if (orbitRef.current) orbitRef.current.enabled = false;
            draggingGizmo.current = gizmo === anchorRef.current;
            rememberDrag();
            const joint = objectRef.current;
            if (joint) beginRotationDrag(joint, gizmo, gizmo === anchorRef.current ? anchorRef.current : null);
          }}
          onMouseUp={() => {
            if (orbitRef.current) orbitRef.current.enabled = true;
            commitDrag();
            draggingGizmo.current = false;
            const joint = objectRef.current;
            if (joint && gizmo === anchorRef.current && (selected === "body" || selected === "torso")) {
              placeGizmoAnchor(anchorRef.current, joint, selected, anchorPos.current, anchorQuat.current, pose);
            }
          }}
          onObjectChange={() => {
            const joint = objectRef.current;
            const controls = controlsRef.current;
            if (!joint || !controls?.dragging) return;
            const axis = controls.axis;
            if (controls.mode === "rotate" && (axis === "X" || axis === "Y" || axis === "Z")) {
              applyRotationDrag(axis, controls.rotationAngle);
              invalidate();
              return;
            }
            if (gizmo !== anchorRef.current) return;
            applyGizmoAnchor(anchorRef.current, joint, anchorPos.current, anchorQuat.current, controls.mode === "translate");
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
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const [jointRev, setJointRev] = useState(0);
  const savingRef = useRef(false);
  const editApi = useRef<EditApi>({
    undo: () => {},
    redo: () => {},
    commit: () => {},
  });
  const poseShownRef = useRef(true);
  savingRef.current = saving;
  const jointsRef = useRef(joints);
  const stickPivotRef = useRef<StickPivotApi | null>(null);
  jointsRef.current = joints;

  const onHistory = useCallback((undo: number, redo: number) => {
    setHist({ undo, redo });
    setJointRev((n) => n + 1);
  }, []);

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
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !typingTarget(event.target) && !savingRef.current) {
        const key = event.key.toLowerCase();
        if (key === "z" && !event.shiftKey) {
          event.preventDefault();
          editApi.current.undo();
          return;
        }
        if ((key === "z" && event.shiftKey) || key === "y") {
          event.preventDefault();
          editApi.current.redo();
          return;
        }
      }
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
      // Parent-local Euler. The panel edits world XYZ, which is already
      // converted into this local quaternion. Existing pose files stay valid.
      const r = group.rotation;
      const rx = Math.round(r.x * 10000) / 10000;
      const ry = Math.round(r.y * 10000) / 10000;
      const rz = Math.round(r.z * 10000) / 10000;
      // Shaft scale is the stick length, so that group is not a saved joint.
      if (id === "shaftHold") continue;
      const p = poseStoredPosition(id, group);
      saved[id] = [
        rx,
        ry,
        rz,
        Math.round(p[0] * 10000) / 10000,
        Math.round(p[1] * 10000) / 10000,
        Math.round(p[2] * 10000) / 10000,
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
        gridTemplateColumns: "minmax(220px, 360px) minmax(0, 1fr) auto 220px",
        gridTemplateRows: "auto minmax(0, 1fr)",
        height: "100vh",
        minHeight: 0,
        overflow: "hidden",
        background: "#070b12",
        color: "#e8ece6",
      }}
    >
      <div style={{ ...barCell, gridColumn: 1, gridRow: 1 }}>
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
      <div style={{ ...barCell, flexDirection: "column", alignItems: "stretch", gap: 6, gridColumn: "2 / 4", gridRow: 1 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, flexWrap: "wrap", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => editApi.current.undo()}
              disabled={hist.undo === 0 || saving}
              style={histBtn(hist.undo > 0 && !saving)}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => editApi.current.redo()}
              disabled={hist.redo === 0 || saving}
              style={histBtn(hist.redo > 0 && !saving)}
            >
              Redo
            </button>
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
      <div style={{ ...barCell, ...selectedLine, gridColumn: 4, gridRow: 1 }}>
        Selected: {info?.label ?? "none"}
      </div>
      <aside
        style={{
          gridColumn: 1,
          gridRow: 2,
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

      <div style={{ gridColumn: 2, gridRow: 2, flex: 1, minWidth: 0, minHeight: 0, height: "100%", background: SCENE_BG[sceneBg] }}>
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
              editApi={editApi}
              onHistory={onHistory}
              editable={!saving}
              showPlayer={showPlayer}
              posedEpoch={posedEpoch}
              stick={joints.stick ?? null}
              hand={
                (seated?.(pose) === "goalie" || (meshIndex != null && world.skaters[meshIndex]?.kind === "goalie")
                  ? joints.lHand ?? null
                  : skaterLeftHand(joints))
              }
            />
          </Canvas>
        ) : null}
      </div>

      {controlObject ? (
        <aside
          style={{
            gridColumn: 3,
            gridRow: 2,
            alignSelf: "start",
            justifySelf: "stretch",
            height: "auto",
            background: "#10161f",
            color: "#e8ece6",
            padding: "16px 12px",
            borderLeft: "1px solid #243040",
          }}
        >
          <JointNumbers
            object={controlObject}
            revision={jointRev}
            disabled={saving}
            onCommit={(apply) => {
              if (!controlObject || saving) return;
              editApi.current.commit(controlObject, () => apply(controlObject));
            }}
          />
        </aside>
      ) : null}

      <aside
        style={{
          gridColumn: 4,
          gridRow: 2,
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

function JointNumbers({
  object,
  revision,
  disabled,
  onCommit,
}: {
  object: THREE.Object3D | null;
  revision: number;
  disabled: boolean;
  onCommit: (apply: (object: THREE.Object3D) => void) => void;
}) {
  if (!object) return null;
  const axes = ["x", "y", "z"] as const;
  const worldRot = readWorldEuler(object);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 16 }}>
      <div>
        <div style={menuHead}>Position</div>
        {axes.map((axis) => (
          <AxisRow
            key={`p-${axis}-${revision}`}
            label={axis.toUpperCase()}
            value={object.position[axis]}
            disabled={disabled}
            onCommit={(next) => onCommit((obj) => (obj.position[axis] = next))}
            onNudge={(dir) => onCommit((obj) => (obj.position[axis] += dir * POS_STEP))}
          />
        ))}
      </div>
      <div>
        <div style={menuHead}>World rotation</div>
        {axes.map((axis) => (
          <AxisRow
            key={`r-${axis}-${revision}`}
            label={axis.toUpperCase()}
            value={worldRot[axis]}
            disabled={disabled}
            onCommit={(next) => onCommit((obj) => setWorldEulerAxis(obj, axis, next))}
            onNudge={(dir) => onCommit((obj) => addWorldEuler(obj, axis, dir * ROT_STEP))}
          />
        ))}
      </div>
    </div>
  );
}

function AxisRow({
  label,
  value,
  disabled,
  onCommit,
  onNudge,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (next: number) => void;
  onNudge: (dir: -1 | 1) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
      <span style={{ width: 14, color: "#8b97a4", fontFamily: '"Barlow Condensed", sans-serif' }}>{label}</span>
      <button type="button" aria-label={`Decrease ${label}`} disabled={disabled} onClick={() => onNudge(-1)} style={nudgeBtn}>
        −
      </button>
      <input
        defaultValue={value.toFixed(4)}
        disabled={disabled}
        aria-label={label}
        inputMode="decimal"
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next) || Math.abs(next) > 1e6) {
            event.target.value = value.toFixed(4);
            return;
          }
          if (Math.abs(next - value) < 1e-6) return;
          onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        style={numInput}
      />
      <button type="button" aria-label={`Increase ${label}`} disabled={disabled} onClick={() => onNudge(1)} style={nudgeBtn}>
        +
      </button>
    </div>
  );
}

const nudgeBtn: CSSProperties = {
  width: 26,
  height: 26,
  padding: 0,
  border: "none",
  borderRadius: 4,
  background: "#1c2836",
  color: "#e8ece6",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};

const numInput: CSSProperties = {
  width: 72,
  flex: "1 1 auto",
  minWidth: 0,
  background: "#0c1218",
  color: "#e8ece6",
  border: "1px solid #243040",
  borderRadius: 4,
  padding: "4px 6px",
  fontFamily: "ui-monospace, monospace",
  fontSize: 12,
};

function histBtn(enabled: boolean): CSSProperties {
  return {
    ...btn(enabled, "charcoal"),
    opacity: enabled ? 1 : 0.45,
    cursor: enabled ? "pointer" : "default",
  };
}

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
