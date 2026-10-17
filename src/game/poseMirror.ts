import { Euler, Quaternion } from "three";

/** Mesh ids. l* sits on the player's right (body −X). r* is the player's left. */
const PAIRS = [
  ["lArm", "rArm"],
  ["lFore", "rFore"],
  ["lHand", "rHand"],
  ["lLeg", "rLeg"],
  ["lShin", "rShin"],
  ["lBoot", "rBoot"],
] as const;

/** Stick stays put. Both stride poses parent it on the player's left hand. */
const STICK_JOINTS = new Set(["stick", "bladeGrp", "shaftHold"]);

const ORDER = [
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
];

function round4(n: number): number {
  const v = Math.round(n * 10000) / 10000;
  return v === 0 ? 0 : v;
}

/**
 * Reflect one parent-local XYZ Euler across the body's YZ plane.
 * Pitch (X) stays. Yaw (Y) and roll (Z) flip.
 * Check: Euler(0.4, 0.3, -0.2) on (0.2, -0.5, 0.1), then this reflection on
 * (-0.2, -0.5, 0.1), lands on the X-mirror of that first point.
 */
function mirrorEuler(rx: number, ry: number, rz: number): [number, number, number] {
  const euler = new Euler(rx, ry, rz, "XYZ");
  const q = new Quaternion().setFromEuler(euler);
  q.set(q.x, -q.y, -q.z, q.w);
  euler.setFromQuaternion(q, "XYZ");
  return [round4(euler.x), round4(euler.y), round4(euler.z)];
}

function mirrorJoint(value: number[]): number[] {
  const [rx, ry, rz] = mirrorEuler(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
  if (value.length < 6) return [rx, ry, rz];
  return [rx, ry, rz, round4(-(value[3] ?? 0)), round4(value[4] ?? 0), round4(value[5] ?? 0)];
}

/** Left/right mirror of a pose. Paired limbs swap. Stick, blade, and shaft are copied. */
export function mirrorPoseJoints(src: Record<string, number[]>): Record<string, number[]> {
  const mirrored: Record<string, number[]> = {};
  const paired = new Set<string>();
  for (const [left, right] of PAIRS) {
    paired.add(left);
    paired.add(right);
    if (src[left]) mirrored[right] = mirrorJoint(src[left]);
    if (src[right]) mirrored[left] = mirrorJoint(src[right]);
  }
  for (const [id, value] of Object.entries(src)) {
    if (STICK_JOINTS.has(id)) {
      mirrored[id] = value.slice();
      continue;
    }
    if (paired.has(id)) continue;
    mirrored[id] = mirrorJoint(value);
  }
  const out: Record<string, number[]> = {};
  for (const id of ORDER) {
    if (mirrored[id]) out[id] = mirrored[id];
  }
  for (const [id, value] of Object.entries(mirrored)) {
    if (!out[id]) out[id] = value;
  }
  return out;
}
