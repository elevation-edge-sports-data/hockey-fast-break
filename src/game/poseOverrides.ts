import { Quaternion, Vector3, type Object3D } from "three";
import { mirrorPoseJoints } from "./poseMirror";
import { goalieHandPivotShift, torsoPivotY } from "./goalieStance";
import { goalieBladeKnobShift, goalieStickKnobShift } from "./stickKnobPivot";
import { world, type Skater } from "./sim";
import bundledOverrides from "./poseOverrides.example.json";

const _poseShift = new Vector3();
const _poseStore = new Vector3();

/** Joints the pose editor exposes. Order is the order written into the file. */
export const POSE_JOINTS = [
  "body",
  "torso",
  "hips",
  "shoulders",
  "head",
  "lArm",
  "lFore",
  "lHand",
  "rArm",
  "rFore",
  "rHand",
  "lLeg",
  "lShin",
  "lBoot",
  "rLeg",
  "rShin",
  "rBoot",
  "stick",
  "shaftHold",
  "bladeGrp",
] as const;

export type PoseJointId = (typeof POSE_JOINTS)[number];

const _blendFromQ = POSE_JOINTS.map(() => new Quaternion());
const _blendFromP = POSE_JOINTS.map(() => new Vector3());
const _blendToQ = new Quaternion();
const _blendToP = new Vector3();
/** Three Euler radians, or six numbers when the stick also stores local position. */
export type PoseJointValue = number[];
export type PoseJoints = Partial<Record<PoseJointId, PoseJointValue>>;
export type PoseFile = Record<string, PoseJoints>;

function asFile(value: unknown): PoseFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const file: PoseFile = {};
  for (const [name, joints] of Object.entries(value as Record<string, unknown>)) {
    if (!joints || typeof joints !== "object" || Array.isArray(joints)) continue;
    const row: PoseJoints = {};
    for (const id of POSE_JOINTS) {
      const raw = (joints as Record<string, unknown>)[id];
      if (!Array.isArray(raw) || raw.length < 3) continue;
      const nums = raw.slice(0, raw.length >= 6 ? 6 : 3).map(Number);
      if (nums.some((n) => !Number.isFinite(n))) continue;
      row[id] = nums;
    }
    if (Object.keys(row).length > 0) file[name] = row;
  }
  if (file.neutral && !file.default) file.default = file.neutral;
  delete file.neutral;
  if (file.puckDropSet && !file.idle && !file.coast) file.idle = file.puckDropSet;
  delete file.puckDropSet;
  if (file.idle && !file.coast) file.coast = file.idle;
  delete file.idle;
  if (file.puckDrop && !file.faceoff) file.faceoff = file.puckDrop;
  delete file.puckDrop;
  if (file.skillBackhand && !file.backhandCarry) file.backhandCarry = file.skillBackhand;
  delete file.skillBackhand;
  if (file.burstCarry && !file.speedCarry) file.speedCarry = file.burstCarry;
  delete file.burstCarry;
  if (file.backhandCarry && !file.backhandDeke) file.backhandDeke = file.backhandCarry;
  delete file.backhandCarry;
  if (file.speedCarry && !file.speedPuckPossess && !file.speedPuckLeft) file.speedPuckPossess = file.speedCarry;
  delete file.speedCarry;
  if (file.speedPuckPossess && !file.speedPuckLeft) file.speedPuckLeft = file.speedPuckPossess;
  delete file.speedPuckPossess;
  if (file.speedPuckLeft && !file.speedPuckRight) file.speedPuckRight = cloneJoints(file.speedPuckLeft);
  if (file.neutralCarry && !file.puckPossess) file.puckPossess = file.neutralCarry;
  delete file.neutralCarry;
  if (file.wristBackhand && !file.backhandShot) file.backhandShot = file.wristBackhand;
  delete file.wristBackhand;
  if (file.skillCarry && !file.forehandDeke) file.forehandDeke = file.skillCarry;
  delete file.skillCarry;
  if (file.deke && !file.autoDeke && !file.autoDeke1) file.autoDeke = file.deke;
  delete file.deke;
  if (file.autoDeke && !file.autoDeke1) file.autoDeke1 = file.autoDeke;
  delete file.autoDeke;
  if (file.autoDeke1 && !file.autoDeke2) file.autoDeke2 = cloneJoints(file.autoDeke1);
  if (file.getUp && !file.recover) file.recover = file.getUp;
  delete file.getUp;
  if (file.checked && !file.absorb) file.absorb = file.checked;
  delete file.checked;
  if (file.tumble && !file.knockout) file.knockout = file.tumble;
  delete file.tumble;
  if (file.brawl && !file.fight) file.fight = file.brawl;
  delete file.brawl;
  if (file.cheer && !file.celebrate) file.celebrate = file.cheer;
  delete file.cheer;
  if (file.check && !file.shoulderCheck && !file.shoulderCheck1) file.shoulderCheck = file.check;
  delete file.check;
  if (file.shoulderCheck && !file.shoulderCheck1) file.shoulderCheck1 = file.shoulderCheck;
  delete file.shoulderCheck;
  if (file.shoulderCheck1 && !file.shoulderCheck2) file.shoulderCheck2 = cloneJoints(file.shoulderCheck1);
  if (file.stride && !file.strideLeft) file.strideLeft = file.stride;
  delete file.stride;
  if (file.strideLeft && !file.strideRight) {
    file.strideRight = mirrorPoseJoints(file.strideLeft as Record<string, number[]>);
  }
  if (file["shot-follow-through"] && !file.wristFollow) file.wristFollow = file["shot-follow-through"];
  delete file["shot-follow-through"];
  if (file.wristFollow && !file.slapFollow) file.slapFollow = cloneJoints(file.wristFollow);
  if (file.wristFollow && !file.backhandFollow) file.backhandFollow = cloneJoints(file.wristFollow);
  if (file.wristFollow && !file.snapFollow) file.snapFollow = cloneJoints(file.wristFollow);
  if (file.snapFollow && !file.snap) file.snap = cloneJoints(file.snapFollow);
  if (file.ready && !file.backSkate) file.backSkate = cloneJoints(file.ready);
  if (file.dive && !file.divePoke) file.divePoke = cloneJoints(file.dive);
  if (file.rage && !file.rage1) file.rage1 = cloneJoints(file.rage);
  if (file.rage && !file.rage2) file.rage2 = cloneJoints(file.rage);
  if (file.goalieRage && !file.goalieRage1) file.goalieRage1 = cloneJoints(file.goalieRage);
  if (file.goalieRage && !file.goalieRage2) file.goalieRage2 = cloneJoints(file.goalieRage);
  if (file.puckPossess && !file.puckPossess1) file.puckPossess1 = cloneJoints(file.puckPossess);
  if (file.puckPossess && !file.puckPossess2) file.puckPossess2 = cloneJoints(file.puckPossess);
  if (file.celebrate && !file.debug) file.debug = cloneJoints(file.celebrate);
  if (file.goalieCheer && !file.goalieDebug) file.goalieDebug = cloneJoints(file.goalieCheer);
  return file;
}

/** Temporary live fallback. Off leaves a missing gallery pose on the last joint writes. */
export const DEBUG_POSE_FALLBACK = false;

function cloneJoints(joints: PoseJoints): PoseJoints {
  return JSON.parse(JSON.stringify(joints)) as PoseJoints;
}

let live: PoseFile = asFile(bundledOverrides);
let revision = 0;

/** Position written into a pose file. Body and the goalie left hand stay in the pre-pivot frame. */
export function poseStoredPosition(id: PoseJointId, group: Object3D): [number, number, number] {
  _poseStore.copy(group.position);
  if (id === "body") {
    _poseShift.set(0, torsoPivotY(group), 0).applyQuaternion(group.quaternion);
    _poseStore.sub(_poseShift);
  } else if (id === "lHand" && goalieHandPivotShift(group, _poseShift)) {
    _poseStore.sub(_poseShift);
  } else if (id === "stick" && goalieStickKnobShift(group, _poseShift)) {
    // File still stores the grip. The mesh origin is the knob.
    _poseShift.applyQuaternion(group.quaternion);
    _poseStore.sub(_poseShift);
  } else if (id === "bladeGrp" && goalieBladeKnobShift(group, _poseShift)) {
    _poseStore.add(_poseShift);
  }
  return [_poseStore.x, _poseStore.y, _poseStore.z];
}

export function poseJoints(name: string): PoseJoints | null {
  return live[name] ?? null;
}

export function hasAnyPoseOverride(): boolean {
  return Object.keys(live).length > 0;
}

/** Editor save, or a fetch of the file, so this session matches disk before the next pack. */
export function noteSavedPose(name: string, joints: PoseJoints): void {
  revision += 1;
  live = { ...live, [name]: joints };
}

export function notePoseFile(file: PoseFile): void {
  revision += 1;
  live = file;
}

export function poseOverrideRevision(): number {
  return revision;
}

/** Shaft scale is the stick length. Leave that group on the procedural shaft. */
function writePoseJoint(id: PoseJointId, v: PoseJointValue, group: Object3D): void {
  group.rotation.set(v[0]!, v[1]!, v[2]!);
  group.quaternion.setFromEuler(group.rotation);
  if (id === "lHand" && goalieHandPivotShift(group, _poseShift)) {
    // Saved positions are the old arm-side origin. The joint now sits on the glove.
    if (v.length >= 6) group.position.set(v[3]!, v[4]!, v[5]!);
    else if (group.name === "goalieBlocker") group.position.set(0, -0.28, 0.03);
    else group.position.set(0, 0, 0);
    group.position.add(_poseShift);
  } else if (v.length >= 6) {
    group.position.set(v[3]!, v[4]!, v[5]!);
    if (id === "body") {
      _poseShift.set(0, torsoPivotY(group), 0).applyQuaternion(group.quaternion);
      group.position.add(_poseShift);
    } else if (id === "stick" && goalieStickKnobShift(group, _poseShift)) {
      _poseShift.applyQuaternion(group.quaternion);
      group.position.add(_poseShift);
    } else if (id === "bladeGrp" && goalieBladeKnobShift(group, _poseShift)) {
      group.position.sub(_poseShift);
    }
  }
}

/**
 * Copy saved local transforms onto the groups.
 * Joints store parent-local Euler radians. The pose editor shows the world
 * XYZ decomposition and converts back to this local quaternion before saving.
 * A 6-number entry also stores local position.
 * Euler order is left as the group already has it.
 */
export function applyPoseJoints(name: string, groups: Partial<Record<PoseJointId, Object3D | null>>): boolean {
  const row = live[name];
  if (!row) return false;
  let hit = false;
  for (const id of POSE_JOINTS) {
    const v = row[id];
    const group = groups[id];
    if (!v || v.length < 3 || !group || id === "shaftHold") continue;
    writePoseJoint(id, v, group);
    hit = true;
  }
  return hit;
}

/**
 * Smash wind-up curve shared by the skater and goalie rage sequences.
 * 0 holds the first pose. An unset hit stays there. Otherwise hold until
 * hit - 0.52 (at least 0.16), then smoothstep, and stay on the second pose after contact.
 */
function ragePoseBlend(smash: number, smashHit: number): number {
  const h = smashHit > 0 ? smashHit : 99;
  const wind0 = Math.max(0.16, h - 0.52);
  if (smash >= h) return 1;
  if (smash <= wind0) return 0;
  const u = (smash - wind0) / Math.max(0.05, h - wind0);
  return u * u * (3 - 2 * u);
}

/**
 * Puck-possess stride clock. Stride 0 is puckPossess1. One stride later
 * (π radians, the same half-cycle as strideLeft / strideRight) is puckPossess2.
 */
function puckPossessBlend(stride: number): number {
  return (1 - Math.cos(stride)) * 0.5;
}

/** Write the first pose, then slerp toward the second. t is 0 at the first and 1 at the second. */
export function applyBlendedPoseJoints(
  fromName: string,
  toName: string,
  t: number,
  groups: Partial<Record<PoseJointId, Object3D | null>>,
): boolean {
  const from = live[fromName];
  const to = live[toName];
  const u = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  if (!from && !to) return false;
  if (!to || u <= 0) return from ? applyPoseJoints(fromName, groups) : false;
  if (!from || u >= 1) return applyPoseJoints(toName, groups);
  let hit = false;
  for (let i = 0; i < POSE_JOINTS.length; i++) {
    const id = POSE_JOINTS[i]!;
    const a = from[id];
    const b = to[id];
    const group = groups[id];
    if (id === "shaftHold" || !group) continue;
    const aOk = !!a && a.length >= 3;
    const bOk = !!b && b.length >= 3;
    if (!aOk && !bOk) continue;
    if (!bOk) {
      writePoseJoint(id, a!, group);
      hit = true;
      continue;
    }
    if (!aOk) {
      writePoseJoint(id, b!, group);
      hit = true;
      continue;
    }
    writePoseJoint(id, a!, group);
    _blendFromQ[i]!.copy(group.quaternion);
    _blendFromP[i]!.copy(group.position);
    writePoseJoint(id, b!, group);
    _blendToQ.copy(group.quaternion);
    _blendToP.copy(group.position);
    group.quaternion.copy(_blendFromQ[i]!).slerp(_blendToQ, u);
    group.position.copy(_blendFromP[i]!).lerp(_blendToP, u);
    group.rotation.setFromQuaternion(group.quaternion);
    hit = true;
  }
  return hit;
}

type PoseInfer = (s: Skater, index: number) => string | null;

let poseInfer: PoseInfer | null = null;

/** Game and the private gallery install this. The public gallery bundle does not. */
export function setPoseInfer(fn: PoseInfer): void {
  poseInfer = fn;
}

/** A gallery still uses the explicit name. Live play uses the installed inferrer. */
export function namedPoseFor(s: Skater, index: number): string | null {
  if (world.poseHold) {
    if (world.namedPose && world.namedPoseIndex === index) return world.namedPose;
    return null;
  }
  if (!hasAnyPoseOverride() || !poseInfer) return null;
  return poseInfer(s, index);
}

export function poseHasJoint(name: string | null, id: PoseJointId): boolean {
  if (!name) return false;
  const v = live[name]?.[id];
  return !!v && v.length >= 3;
}

export function stampPoseOverride(index: number, s: Skater, groups: Partial<Record<PoseJointId, Object3D | null>>): boolean {
  const name = namedPoseFor(s, index);
  if (!name) return false;
  // Held rage1 and goalieRage1 are stills. Live smash blends those into the *2 poses.
  if (!world.poseHold && name === "rage1" && s.kind !== "goalie" && s.smashKind > 0 && (live.rage1 || live.rage2)) {
    return applyBlendedPoseJoints("rage1", "rage2", ragePoseBlend(s.smash, s.smashHit), groups);
  }
  if (!world.poseHold && name === "goalieRage1" && s.smashKind > 0 && (live.goalieRage1 || live.goalieRage2)) {
    return applyBlendedPoseJoints("goalieRage1", "goalieRage2", ragePoseBlend(s.smash, s.smashHit), groups);
  }
  // Editor stills apply the selected pose. Live play blends puckPossess1 into puckPossess2.
  if (!world.poseHold && name === "puckPossess1" && (live.puckPossess1 || live.puckPossess2)) {
    return applyBlendedPoseJoints("puckPossess1", "puckPossess2", puckPossessBlend(s.stride), groups);
  }
  if (!live[name]) return false;
  return applyPoseJoints(name, groups);
}

const SAVE_URLS = ["/api/pose-overrides", "http://127.0.0.1:8080/api/pose-overrides"];
const REBUILD_URLS = ["http://127.0.0.1:8081/save", "http://localhost:8081/save"];

async function readJson(url: string, init?: RequestInit): Promise<unknown | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Latest file from the dev server, when it is running. Keeps a stale bundle from hiding a save. */
export async function pullPoseOverrides(): Promise<boolean> {
  const seen = revision;
  for (const url of SAVE_URLS) {
    const data = await readJson(url);
    if (revision !== seen) return false;
    const file = asFile(data);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      notePoseFile(file);
      return true;
    }
  }
  return false;
}

export async function savePoseOverride(name: string, joints: PoseJoints, publicOnly = false): Promise<void> {
  noteSavedPose(name, joints);
  const body = JSON.stringify({ poseName: name, joints, publicOnly });
  let detail = "Save server is not running. Start it with: node scripts/pose-save-server.mjs";
  for (const url of REBUILD_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const text = await res.text();
      let payload: { ok?: boolean; error?: string } | null = null;
      try {
        payload = JSON.parse(text) as { ok?: boolean; error?: string };
      } catch {
        payload = null;
      }
      if (res.ok && payload?.ok) {
        noteSavedPose(name, joints);
        return;
      }
      throw new Error(payload?.error || text || `Save failed (${res.status})`);
    } catch (err) {
      if (err instanceof Error && !/failed to fetch|networkerror|load failed/i.test(err.message)) throw err;
    }
  }
  throw new Error(detail);
}
