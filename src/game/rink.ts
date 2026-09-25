export const FT = 0.3048;

export const RINK_L = 200 * FT;
export const RINK_W = 85 * FT;
export const CORNER_R = 28 * FT;
export const BOARD_H = (42 / 12) * FT;
export const GLASS_H = 7.5 * FT;
export const KICK_H = 0.18;
export const RIBBON_H = 0.14;

export const GOAL_LINE_FROM_END = 11 * FT;
export const BLUE_FROM_GOAL = 64 * FT;
const NET_FACE = Math.sqrt(1.25);
export const GOAL_W = 6 * FT * NET_FACE;
export const GOAL_H = 4 * FT * NET_FACE;
export const GOAL_D = (44 / 12) * FT;
export const GOAL_D_TOP = (22 / 12) * FT;
export const CREASE_R = 6 * FT;
export const FACEOFF_R = 15 * FT;
export const FACEOFF_MARK_R = FACEOFF_R * 0.88;
export const DOT_R = FT;
export const HASH_L = 4 * FT;
export const HASH_MARK_L = 2 * FT;
export const HASH_MARK_INSIDE = (5 + 11 / 12) * FT;
export const L_STEM = 4 * FT;
export const L_ARM = (2 + 10 / 12) * FT;
export const L_GAP = (18 / 12) * FT;
export const L_INSET = FT;
export const MARK_W = (2 / 12) * FT;

export const GOAL_LINE_X = RINK_L / 2 - GOAL_LINE_FROM_END;
export const BLUE_X = GOAL_LINE_X - BLUE_FROM_GOAL;
export const FACEOFF_EZ_X = GOAL_LINE_X - 20 * FT;
export const FACEOFF_NZ_X = BLUE_X - 5 * FT;
export const FACEOFF_SPOT_Z = 22 * FT;

export const LINE_RED = "#c8102e";
export const LINE_BLUE = "#1d4ed8";
export const CREASE_FILL = "rgba(70, 168, 255, 0.62)";

export const GOAL_LINE_W = 0.09;
export const CENTER_LINE_W = FT / 1.25;
export const BLUE_LINE_W = FT / 1.25;

export function boardLineFaces(
  lineX: number,
  inset: number,
  proud: number,
): { x: number; z: number; rot: number }[] {
  const cornerX = RINK_L / 2 - CORNER_R;
  const cornerZ = RINK_W / 2 - CORNER_R;
  const r = Math.max(0.05, CORNER_R - inset);
  const faceZ = RINK_W / 2 - inset;
  const absX = Math.abs(lineX);
  const spots: { x: number; z: number; rot: number }[] = [];
  if (absX <= cornerX + 0.02) {
    spots.push({ x: lineX, z: faceZ - proud, rot: 0 });
    spots.push({ x: lineX, z: -(faceZ - proud), rot: Math.PI });
    return spots;
  }
  const dx = absX - cornerX;
  if (dx >= r - 0.01) return spots;
  const dz = Math.sqrt(Math.max(0, r * r - dx * dx));
  const sx = lineX < 0 ? -1 : 1;
  for (const sz of [1, -1] as const) {
    const nx = (sx * dx) / r;
    const nz = (sz * dz) / r;
    spots.push({
      x: sx * cornerX + sx * dx - nx * proud,
      z: sz * cornerZ + sz * dz - nz * proud,
      rot: Math.atan2(nx, nz),
    });
  }
  return spots;
}

export function iceWidthAtX(x: number): number {
  const absX = Math.abs(x);
  const halfL = RINK_L / 2;
  const halfW = RINK_W / 2;
  const innerL = halfL - CORNER_R;
  if (absX <= innerL) return RINK_W;
  const dx = absX - innerL;
  if (dx >= CORNER_R) return 0;
  const dz = Math.sqrt(CORNER_R * CORNER_R - dx * dx);
  return 2 * (halfW - CORNER_R + dz);
}

export function resolveRink(
  x: number,
  z: number,
  radius: number,
): { x: number; z: number; nx: number; nz: number; hit: boolean } {
  const maxX = RINK_L / 2 - radius;
  const maxZ = RINK_W / 2 - radius;
  const corner = CORNER_R - radius;
  const innerL = RINK_L / 2 - CORNER_R;
  const innerW = RINK_W / 2 - CORNER_R;

  let px = x;
  let pz = z;
  let nx = 0;
  let nz = 0;
  let hit = false;

  if (Math.abs(x) <= innerL) {
    if (z > maxZ) {
      pz = maxZ;
      nz = 1;
      hit = true;
    } else if (z < -maxZ) {
      pz = -maxZ;
      nz = -1;
      hit = true;
    }
  } else if (Math.abs(z) <= innerW) {
    if (x > maxX) {
      px = maxX;
      nx = 1;
      hit = true;
    } else if (x < -maxX) {
      px = -maxX;
      nx = -1;
      hit = true;
    }
  } else {
    const cx = Math.sign(x) * innerL;
    const cz = Math.sign(z) * innerW;
    const dx = x - cx;
    const dz = z - cz;
    const dist = Math.hypot(dx, dz) || 1e-6;
    if (dist > corner) {
      nx = dx / dist;
      nz = dz / dist;
      px = cx + nx * corner;
      pz = cz + nz * corner;
      hit = true;
    }
  }

  return { x: px, z: pz, nx, nz, hit };
}

export function benchGlassOpen(x: number, z: number): boolean {
  return z < -RINK_W / 2 + 0.85 && Math.abs(x) < 9.95;
}

export function wallTop(nx: number, nz: number, x: number, z: number): number {
  if (nz < -0.65 && Math.abs(nx) < 0.45 && benchGlassOpen(x, z)) return BOARD_H;
  return BOARD_H + GLASS_H;
}

/** Depth of the D-shaped cage from the goal line at lateral z and height y. */
export function cageDepthAt(z: number, y = 0): number {
  const hw = GOAL_W / 2;
  const az = Math.abs(z);
  if (az >= hw) return 0;
  const yT = Math.max(0, Math.min(1, y / Math.max(1e-6, GOAL_H)));
  const d = GOAL_D * (1 - yT * (1 - GOAL_D_TOP / GOAL_D));
  const u = az / hw;
  return d * Math.sqrt(Math.max(0, 1 - u * u));
}

/** Solid cage behind the goal line (mouth is on the goal line). Pushes skaters out. */
export function resolveCage(
  x: number,
  z: number,
  radius: number,
): { x: number; z: number; nx: number; nz: number; hit: boolean } {
  const hw = GOAL_W / 2 + radius;
  const pad = radius + 0.05;
  let px = x;
  let pz = z;
  let nx = 0;
  let nz = 0;
  let hit = false;

  for (const side of [1, -1] as const) {
    const mouth = side * GOAL_LINE_X;
    const postR = 0.07 + radius;
    for (const zPost of [GOAL_W / 2, -GOAL_W / 2]) {
      const dx = px - mouth;
      const dz = pz - zPost;
      const dist = Math.hypot(dx, dz);
      if (dist < postR && dist > 1e-6) {
        nx = dx / dist;
        nz = dz / dist;
        px = mouth + nx * postR;
        pz = zPost + nz * postR;
        hit = true;
      }
    }

    const along = (px - mouth) * side;
    if (along <= 0) continue;
    if (Math.abs(pz) > hw) continue;
    const depth = cageDepthAt(pz, 0) + pad;
    if (along > depth) continue;

    const toMouth = along;
    const toBack = Math.max(0.01, depth - along);
    const toPos = hw - pz;
    const toNeg = pz + hw;
    const m = Math.min(toMouth, toBack, toPos, toNeg);
    if (m === toMouth) {
      px = mouth - side * 0.01;
      nx = -side;
    } else if (m === toBack) {
      px = mouth + side * cageDepthAt(pz, 0);
      nx = side;
    } else if (m === toPos) {
      pz = hw;
      nz = 1;
    } else {
      pz = -hw;
      nz = -1;
    }
    hit = true;
  }
  return { x: px, z: pz, nx, nz, hit };
}

export function bounce(
  vx: number,
  vz: number,
  nx: number,
  nz: number,
  rest = 0.38,
): { vx: number; vz: number } {
  const vn = vx * nx + vz * nz;
  if (vn >= 0) {
    return {
      vx: vx - (1 + rest) * vn * nx,
      vz: vz - (1 + rest) * vn * nz,
    };
  }
  return { vx, vz };
}

export const BOARD_BOUNCE_DAMP = 0.84;

export function reflectBoard(
  vx: number,
  vz: number,
  nx: number,
  nz: number,
  damp = BOARD_BOUNCE_DAMP,
): { vx: number; vz: number } {
  const vn = vx * nx + vz * nz;
  if (vn <= 0) return { vx, vz };
  // Outward normal. +z wall (nz > 0) with inbound +vz comes back as -vz.
  const k = 2 * vn;
  return { vx: (vx - k * nx) * damp, vz: (vz - k * nz) * damp };
}
