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
export const GOAL_PIPE_R = 0.042;
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

type CagePush = { x: number; z: number; nx: number; nz: number; hit: boolean };

function pushFromCircle(
  x: number,
  z: number,
  cx: number,
  cz: number,
  reach: number,
  fx: number,
  fz: number,
): { x: number; z: number; nx: number; nz: number } | null {
  const dx = x - cx;
  const dz = z - cz;
  const dist = Math.hypot(dx, dz);
  if (dist >= reach) return null;
  const fl = Math.hypot(fx, fz) || 1;
  const nx = dist <= 1e-6 ? fx / fl : dx / dist;
  const nz = dist <= 1e-6 ? fz / fl : dz / dist;
  return { x: cx + nx * reach, z: cz + nz * reach, nx, nz };
}

function semiInside(along: number, z: number): boolean {
  if (along <= 0) return false;
  const depth = cageDepthAt(z, 0);
  return depth > 0.02 && along < depth - 1e-6;
}

function closestOnArc(along: number, z: number): { a: number; z: number } {
  const hw = GOAL_W / 2;
  let best = Infinity;
  let ba = 0;
  let bz = hw;
  let bt = 0;
  const n = 32;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI;
    const ca = GOAL_D * Math.sin(t);
    const cz = hw * Math.cos(t);
    const d = (ca - along) * (ca - along) + (cz - z) * (cz - z);
    if (d < best) {
      best = d;
      ba = ca;
      bz = cz;
      bt = t;
    }
  }
  let t = bt;
  for (let k = 0; k < 6; k++) {
    const step = Math.PI / n / 2 ** k;
    for (const cand of [t - step, t + step]) {
      const tt = Math.max(0, Math.min(Math.PI, cand));
      const ca = GOAL_D * Math.sin(tt);
      const cz = hw * Math.cos(tt);
      const d = (ca - along) * (ca - along) + (cz - z) * (cz - z);
      if (d < best) {
        best = d;
        ba = ca;
        bz = cz;
        t = tt;
      }
    }
  }
  return { a: ba, z: bz };
}

function arcOutward(a: number, z: number): { na: number; nz: number } {
  const hw = GOAL_W / 2;
  const na = a / (GOAL_D * GOAL_D);
  const nz = z / (hw * hw);
  const len = Math.hypot(na, nz) || 1;
  return { na: na / len, nz: nz / len };
}

function pushFromTwine(
  along: number,
  z: number,
  reach: number,
): { along: number; z: number; na: number; nz: number } | null {
  const inside = semiInside(along, z);
  const arc = closestOnArc(along, z);
  const dx = along - arc.a;
  const dz = z - arc.z;
  const dist = Math.hypot(dx, dz);
  if (!inside && dist >= reach) return null;
  if (!inside) {
    const o = arcOutward(arc.a, arc.z);
    if (dx * o.na + dz * o.nz < 0) return null;
    return { along: arc.a + o.na * reach, z: arc.z + o.nz * reach, na: o.na, nz: o.nz };
  }
  if (along <= dist) return { along: -reach, z, na: -1, nz: 0 };
  const o = arcOutward(arc.a, arc.z);
  return { along: arc.a + o.na * reach, z: arc.z + o.nz * reach, na: o.na, nz: o.nz };
}

function resolveBodyCage(x: number, z: number, radius: number): CagePush {
  let px = x;
  let pz = z;
  let nx = 0;
  let nz = 0;
  let hit = false;
  const hw = GOAL_W / 2;
  const reach = radius + GOAL_PIPE_R;

  for (let iter = 0; iter < 3; iter++) {
    for (const side of [1, -1] as const) {
      const mouth = side * GOAL_LINE_X;
      const along0 = (px - mouth) * side;
      if (along0 < -(reach + 1.4) || along0 > GOAL_D + reach + 1.4) continue;
      if (Math.abs(pz) > hw + reach + 1.4) continue;

      const outX = -side;
      for (const zPost of [hw, -hw] as const) {
        const sep = pushFromCircle(px, pz, mouth, zPost, reach, outX, zPost >= 0 ? 1 : -1);
        if (!sep) continue;
        px = sep.x;
        pz = sep.z;
        nx = sep.nx;
        nz = sep.nz;
        hit = true;
      }

      const cz = Math.max(-hw, Math.min(hw, pz));
      const bar = pushFromCircle(px, pz, mouth, cz, reach, outX, 0);
      if (bar) {
        px = bar.x;
        pz = bar.z;
        nx = bar.nx;
        nz = bar.nz;
        hit = true;
      }

      const along = (px - mouth) * side;
      const twine = pushFromTwine(along, pz, reach);
      if (!twine) continue;
      px = mouth + side * twine.along;
      pz = twine.z;
      const nxw = side * twine.na;
      const nlen = Math.hypot(nxw, twine.nz) || 1;
      nx = nxw / nlen;
      nz = twine.nz / nlen;
      hit = true;
    }
  }
  return { x: px, z: pz, nx, nz, hit };
}

function segmentHitsCircle(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  cx: number,
  cz: number,
  rad: number,
): boolean {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const fx = x0 - cx;
  const fz = z0 - cz;
  const a = dx * dx + dz * dz;
  const c = fx * fx + fz * fz - rad * rad;
  if (a < 1e-10) return c <= 0;
  const b = 2 * (fx * dx + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return true;
  if (t2 >= 0 && t2 <= 1) return true;
  return c <= 0 && t1 <= 0 && t2 >= 1;
}

function segmentHitsSemi(
  a0: number,
  z0: number,
  a1: number,
  z1: number,
): boolean {
  const depth = GOAL_D;
  const hw = GOAL_W / 2;
  const da = a1 - a0;
  const dz = z1 - z0;
  const qa = (da * da) / (depth * depth) + (dz * dz) / (hw * hw);
  const qb = 2 * ((a0 * da) / (depth * depth) + (z0 * dz) / (hw * hw));
  const qc = (a0 * a0) / (depth * depth) + (z0 * z0) / (hw * hw) - 1;
  const onArc = (t: number) => {
    if (t < -1e-4 || t > 1 + 1e-4) return false;
    return a0 + da * t >= -1e-3;
  };
  if (qa < 1e-12) return qc <= 0 && a0 >= -1e-3 && Math.abs(z0) <= hw + 1e-3;
  const disc = qb * qb - 4 * qa * qc;
  if (disc >= 0) {
    const root = Math.sqrt(Math.max(0, disc));
    const t1 = (-qb - root) / (2 * qa);
    const t2 = (-qb + root) / (2 * qa);
    if (onArc(t1) || onArc(t2)) return true;
  }
  const amid = (a0 + a1) * 0.5;
  const zmid = (z0 + z1) * 0.5;
  return semiInside(amid, zmid);
}

export function segmentHitsCage(x0: number, z0: number, x1: number, z1: number): boolean {
  const hw = GOAL_W / 2;
  for (const side of [1, -1] as const) {
    const mouth = side * GOAL_LINE_X;
    for (const zPost of [hw, -hw] as const) {
      if (segmentHitsCircle(x0, z0, x1, z1, mouth, zPost, GOAL_PIPE_R)) return true;
    }
    const a0 = (x0 - mouth) * side;
    const a1 = (x1 - mouth) * side;
    if (segmentHitsSemi(a0, z0, a1, z1)) return true;
  }
  return false;
}

/** Solid cage behind the goal line (mouth is on the goal line). Pushes skaters out. */
export function resolveCage(
  x: number,
  z: number,
  radius: number,
  body = false,
): CagePush {
  if (body) return resolveBodyCage(x, z, radius);
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
