/**
 * Ice X shared by the formation library and the replay viewer.
 * Pause replay pans with `cam.radius * 0.9` metres per second at full stick.
 */
export const MARK_SPEED_PER_RADIUS = 0.9;

/** Same rest gate as pause-replay pan. A stick that sits just off center is not a move. */
export const MARK_STICK_GATE = 0.12;

/**
 * World distance from the shadow center that selects a player.
 * The old click sphere was 0.7 m on the skater root, behind the shadow.
 */
export const ACCEPT_PLAYER = 1.2;

/** World distance from the puck that selects it. The old click sphere was 0.35 m. */
export const ACCEPT_PUCK = 0.65;

export type MarkLock = { kind: "puck" } | { kind: "skater"; index: number };

export type IceMark = {
  x: number;
  z: number;
  lock: MarkLock | null;
  /** The free X has reached open ice, so the next body it meets can be carried. */
  driven: boolean;
};

export function markMetersPerSecond(radius: number): number {
  return radius * MARK_SPEED_PER_RADIUS;
}

/** Flat camera basis from a Three.js matrixWorld. Same signs as writeCamBasis. */
export function basisFromCameraElements(e: ArrayLike<number>): { rx: number; rz: number; fx: number; fz: number } {
  let fx = -(e[8] ?? 0);
  let fz = -(e[10] ?? 0);
  let rx = e[0] ?? 1;
  let rz = e[2] ?? 0;
  const fm = Math.hypot(fx, fz);
  if (fm < 0.12) {
    fx = e[4] ?? 0;
    fz = e[6] ?? 1;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len;
    fz /= len;
    rx = -fz;
    rz = fx;
  } else {
    fx /= fm;
    fz /= fm;
    const rm = Math.hypot(rx, rz) || 1;
    rx /= rm;
    rz /= rm;
  }
  return { rx, rz, fx, fz };
}

/**
 * One stick step on the ice, in the camera basis.
 * Full deflection of stick-up with fx 1 and fz 0 is world +X.
 * Stick-right with rx 0 and rz 1 is world +Z.
 * A diagonal is the same metres per second as a cardinal. A half stick is half speed.
 */
export function iceBasisMove(
  dt: number,
  metersPerSecond: number,
  ix: number,
  iy: number,
  basis: { rx: number; rz: number; fx: number; fz: number },
): { dx: number; dz: number } | null {
  if (!(dt > 0) || !(metersPerSecond > 0)) return null;
  const mag = Math.hypot(ix, iy);
  if (mag < 1e-8) return null;
  const x = mag > 1 ? ix / mag : ix;
  const y = mag > 1 ? iy / mag : iy;
  const dx = basis.rx * x + basis.fx * y;
  const dz = basis.rz * x + basis.fz * y;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null;
  const scale = metersPerSecond * dt;
  return { dx: dx * scale, dz: dz * scale };
}

/**
 * Free ice X step. Speed is `radius * 0.9` metres per second, before the basis is applied.
 */
export function iceBasisStep(
  dt: number,
  radius: number,
  ix: number,
  iy: number,
  basis: { rx: number; rz: number; fx: number; fz: number },
): { dx: number; dz: number } | null {
  if (!(radius > 0)) return null;
  return iceBasisMove(dt, markMetersPerSecond(radius), ix, iy, basis);
}

/** Shadow center. Falls back to the skater root before the mesh has posed. */
export function shadowXZ(comX: number, comZ: number, x: number, z: number): { x: number; z: number } {
  return {
    x: Number.isFinite(comX) ? comX : x,
    z: Number.isFinite(comZ) ? comZ : z,
  };
}

/** Skater root that puts the shadow center on `anchorX` / `anchorZ`. */
export function rootForShadow(
  anchorX: number,
  anchorZ: number,
  comX: number,
  comZ: number,
  rootX: number,
  rootZ: number,
): { x: number; z: number } {
  const shadow = shadowXZ(comX, comZ, rootX, rootZ);
  return { x: anchorX - (shadow.x - rootX), z: anchorZ - (shadow.z - rootZ) };
}

/** Closest puck or shadow inside its own acceptance radius. */
export function nearestMark(
  x: number,
  z: number,
  players: readonly { x: number; z: number }[],
  puck: { x: number; z: number },
): MarkLock | null {
  let best: MarkLock | null = null;
  let bestD = Infinity;
  const puckD = Math.hypot(puck.x - x, puck.z - z);
  if (puckD <= ACCEPT_PUCK) {
    best = { kind: "puck" };
    bestD = puckD;
  }
  for (let i = 0; i < players.length; i++) {
    const p = players[i]!;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d <= ACCEPT_PLAYER && d < bestD) {
      best = { kind: "skater", index: i };
      bestD = d;
    }
  }
  return best;
}

/** Tap Y: no lock, then the puck, then each skater, then no lock again. */
export function cycleMarkLock(lock: MarkLock | null, skaterCount: number): MarkLock | null {
  if (!lock) return { kind: "puck" };
  if (lock.kind === "puck") return skaterCount > 0 ? { kind: "skater", index: 0 } : null;
  const next = lock.index + 1;
  return next < skaterCount ? { kind: "skater", index: next } : null;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * Pause-replay orbit while Y is held: theta += stickX * 1.85 * dt,
 * phi -= stickY * 1.25 * dt, pitch clamped to 0.12–1.45.
 */
export function orbitStick(
  theta: number,
  phi: number,
  stickX: number,
  stickY: number,
  dt: number,
): { theta: number; phi: number } {
  return {
    theta: theta + stickX * 1.85 * dt,
    phi: Math.max(0.12, Math.min(1.45, phi - stickY * 1.25 * dt)),
  };
}

/** Left or right lands on a whole frame. A fractional cursor steps to the neighbor in that direction. */
export function stepReplayFrame(cursor: number, dir: -1 | 1, last: number): number {
  const next = dir > 0 ? Math.floor(cursor + 1e-4) + 1 : Math.ceil(cursor - 1e-4) - 1;
  return Math.max(0, Math.min(last, next));
}
