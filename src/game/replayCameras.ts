import type { MarkLock } from "./iceMark";
import { RINK_L, RINK_W } from "./rink";
import type { CamMode } from "./store";

/**
 * Same labels as the in-game Camera menu.
 * Classic, chase, broadcast, and high match CameraRig at defend-zoom 0.
 * Freestyle is the replay orbit (theta 0 on +X), seeded like the live free camera.
 */
export const REPLAY_CAMS: { id: CamMode; label: string; blurb: string }[] = [
  { id: "classic", label: "Classic", blurb: "Angled up-ice — CPU net at the top, camera follows the puck" },
  { id: "chase", label: "Chase", blurb: "Third-person behind the puck" },
  { id: "broadcast", label: "Broadcast", blurb: "Sideline TV angle, always on the puck" },
  { id: "high", label: "High", blurb: "Straight-down from the rafters, puck at center" },
  { id: "freestyle", label: "Freestyle", blurb: "Free orbit around the puck — pause to look around" },
];

export const REPLAY_PHI_MIN = 0.12;
export const REPLAY_PHI_MAX = 1.45;
export const REPLAY_RADIUS_MIN = 4.2;
export const REPLAY_RADIUS_MAX = 120;
export const REPLAY_FREESTYLE_FOV = 46;

const CLASSIC_BACK = 13.2;
const CLASSIC_EYE_Y = 9.4;
const CLASSIC_MIN_BACK = 2;
const CLASSIC_AHEAD = 1.15;
const CLASSIC_LOOK_LIFT = 0.16;
const CLASSIC_UP_COS = Math.cos((25 * Math.PI) / 180);

export type CamPoint = { x: number; y: number; z: number };

export type ReplayOrbit = { theta: number; phi: number; radius: number };

export type ReplayCamPlacement = {
  eye: CamPoint;
  look: CamPoint;
  up: CamPoint;
  fov: number;
};

export type ChaseBody = { id: number; yaw: number };

/** homeAttack -1 keeps -X at the top of the screen, matching classicFormationEye. */
export function replayAttackUp(homeAttack: number): 1 | -1 {
  return homeAttack >= 0 ? 1 : -1;
}

/**
 * CameraRig chase heading. Local forward is -Z, so yaw -π/2 faces +X:
 * (-sin(yaw), -cos(yaw)) = (1, 0).
 */
export function yawChaseForward(yaw: number): { x: number; z: number } {
  const x = -Math.sin(yaw);
  const z = -Math.cos(yaw);
  const m = Math.hypot(x, z) || 1;
  return { x: x / m, z: z / m };
}

/**
 * Locked skater wins. Otherwise the puck holder, then puck travel above 0.55 m/s,
 * then the heading already in use. A zero previous heading falls back to +X.
 */
export function replayChaseAim(
  lock: MarkLock | null,
  skaters: readonly ChaseBody[],
  owner: number | null,
  velocity: { x: number; z: number },
  previous: { x: number; z: number },
): { x: number; z: number } {
  if (lock?.kind === "skater") {
    const s = skaters[lock.index];
    if (s) return yawChaseForward(s.yaw);
  }
  if (owner !== null) {
    const holder = skaters[owner] ?? skaters.find((s) => s.id === owner);
    if (holder) return yawChaseForward(holder.yaw);
  }
  const spd = Math.hypot(velocity.x, velocity.z);
  if (spd > 0.55) return { x: velocity.x / spd, z: velocity.z / spd };
  const pm = Math.hypot(previous.x, previous.z);
  if (pm > 1e-4) return { x: previous.x / pm, z: previous.z / pm };
  return { x: 1, z: 0 };
}

/** Live freestyle seed: 12 m toward -X and 14 m toward +Z, 9.2 m up. Shootouts do not run here. */
export function freestyleReplayEye(look: CamPoint): CamPoint {
  return { x: look.x - 12, y: 9.2, z: look.z + 14 };
}

/** Replay theta 0 sits on +X. Pause replay and the formation orbit use this same map. */
export function replayOrbitFromEye(look: CamPoint, eye: CamPoint): ReplayOrbit {
  const dx = eye.x - look.x;
  const dy = eye.y - look.y;
  const dz = eye.z - look.z;
  return {
    theta: Math.atan2(dz, dx),
    phi: Math.atan2(Math.hypot(dx, dz), dy),
    radius: Math.hypot(dx, dy, dz),
  };
}

export function replayOrbitEye(look: CamPoint, orbit: ReplayOrbit): CamPoint {
  const sp = Math.sin(orbit.phi);
  const cp = Math.cos(orbit.phi);
  return {
    x: look.x + orbit.radius * sp * Math.cos(orbit.theta),
    y: look.y + orbit.radius * cp,
    z: look.z + orbit.radius * sp * Math.sin(orbit.theta),
  };
}

function clampOrbit(orbit: ReplayOrbit): ReplayOrbit {
  return {
    theta: orbit.theta,
    phi: Math.max(REPLAY_PHI_MIN, Math.min(REPLAY_PHI_MAX, orbit.phi)),
    radius: Math.max(REPLAY_RADIUS_MIN, Math.min(REPLAY_RADIUS_MAX, orbit.radius)),
  };
}

/**
 * Drag, wheel, or stick orbit. A scripted mode keeps the current eye so the
 * view does not jump, then the caller switches the menu to freestyle.
 * Entering freestyle from the menu (no eye yet, or already freestyle but not
 * orbiting) uses the live freestyle seed.
 */
export function claimReplayFreestyle(args: {
  mode: CamMode;
  adjusted: { current: boolean };
  orbit: ReplayOrbit;
  look: CamPoint;
  eye: CamPoint | null;
}): CamMode {
  const { mode, adjusted, orbit, look, eye } = args;
  if (mode === "freestyle" && adjusted.current) return mode;
  const from = mode === "freestyle" || !eye ? freestyleReplayEye(look) : eye;
  const seeded = clampOrbit(replayOrbitFromEye(look, from));
  if (!(seeded.radius > 0.05)) {
    const fallback = clampOrbit(replayOrbitFromEye(look, freestyleReplayEye(look)));
    orbit.theta = fallback.theta;
    orbit.phi = fallback.phi;
    orbit.radius = fallback.radius;
  } else {
    orbit.theta = seeded.theta;
    orbit.phi = seeded.phi;
    orbit.radius = seeded.radius;
  }
  adjusted.current = true;
  return "freestyle";
}

function placeClassic(subject: CamPoint, atk: 1 | -1): ReplayCamPlacement {
  const limit = RINK_L / 2 - 1.6;
  let camX = atk > 0 ? Math.max(-limit, subject.x - CLASSIC_BACK) : Math.min(limit, subject.x + CLASSIC_BACK);
  let camY = CLASSIC_EYE_Y;
  const zLimit = RINK_W / 2 - 4.8;
  const fz = Math.max(-zLimit, Math.min(zLimit, subject.z));
  const lookX = subject.x + atk * CLASSIC_AHEAD;
  const lookY = subject.y + CLASSIC_LOOK_LIFT;
  const lookZ = fz;
  let behind = (lookX - camX) * atk;
  if (behind < CLASSIC_MIN_BACK) behind = CLASSIC_MIN_BACK;
  camX = lookX - atk * behind;
  const dy = lookY - camY;
  const dz = lookZ - fz;
  const len = Math.hypot(behind, dy, dz);
  if (!(len > 1e-4 && behind / len <= CLASSIC_UP_COS)) {
    const minPerp = behind * Math.tan((25 * Math.PI) / 180);
    const need = Math.sqrt(Math.max(0, minPerp * minPerp - dz * dz)) + 1e-3;
    camY = lookY + need;
  }
  return {
    eye: { x: camX, y: camY, z: fz },
    look: { x: lookX, y: lookY, z: lookZ },
    up: { x: atk, y: 0, z: 0 },
    fov: 50,
  };
}

/** Sideline TV camera. z stays on the near side, x eases toward center ice. */
function placeBroadcast(subject: CamPoint): ReplayCamPlacement {
  return {
    eye: { x: subject.x * 0.16, y: 12.2, z: Math.min(10.2, RINK_W / 2 - 1.6) },
    look: { x: subject.x, y: subject.y, z: subject.z },
    up: { x: 0, y: 1, z: 0 },
    fov: 44,
  };
}

function placeHigh(subject: CamPoint, atk: 1 | -1): ReplayCamPlacement {
  return {
    eye: { x: subject.x, y: 32, z: subject.z },
    look: { x: subject.x, y: 0, z: subject.z },
    up: { x: atk, y: 0, z: 0 },
    fov: 48,
  };
}

function placeChase(subject: CamPoint, chase: { x: number; z: number }): ReplayCamPlacement {
  const hm = Math.hypot(chase.x, chase.z) || 1;
  const fx = chase.x / hm;
  const fz = chase.z / hm;
  return {
    eye: { x: subject.x - fx * 7.1, y: 2.7, z: subject.z - fz * 7.1 },
    look: { x: subject.x + fx * 0.9, y: subject.y + 0.32, z: subject.z + fz * 0.9 },
    up: { x: 0, y: 1, z: 0 },
    fov: 44,
  };
}

export function placeReplayCamera(
  mode: Exclude<CamMode, "freestyle">,
  subject: CamPoint,
  atk: 1 | -1,
  chase: { x: number; z: number },
): ReplayCamPlacement {
  if (mode === "classic") return placeClassic(subject, atk);
  if (mode === "broadcast") return placeBroadcast(subject);
  if (mode === "high") return placeHigh(subject, atk);
  return placeChase(subject, chase);
}
