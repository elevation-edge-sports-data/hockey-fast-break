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

/**
 * Regulation cage footprint, scaled to this net.
 * Hockey Canada base: 18 in corner radius, 88 in overall width, on a 72 in opening.
 * The game posts sit on the 6 ft opening (GOAL_W), so 36 in maps to GOAL_W / 2.
 * The base straight back ends 26 in from center (inside each post). The rounded
 * sides reach 44 in (past the posts). The side is a quarter-circle into the back,
 * then a second arc to the post.
 * The top shelf does not flare. It leaves each post and bends inward to a straight
 * back 6 in inside the post line, at depth GOAL_D_TOP.
 */
const cage = (() => {
  const hw = GOAL_W / 2;
  const R = (hw * 18) / 36;
  const zJoin = (hw * 26) / 36;
  const zMax = (hw * 44) / 36;
  const a0 = GOAL_D - R;
  const ext = zMax - hw;
  const R2 = (a0 * a0 + ext * ext) / (2 * ext);
  const cz = zMax - R2;
  const phiEnd = Math.atan2(-a0, hw - cz);
  const lFront = R2 * -phiEnd;
  const lCorner = R * (Math.PI / 2);
  const lStraight = zJoin * 2;
  const total = lFront * 2 + lCorner * 2 + lStraight;
  const topInset = (hw * 6) / 36;
  const zJoinTop = hw - topInset;
  return {
    hw,
    R,
    zJoin,
    zMax,
    a0,
    R2,
    cz,
    phiEnd,
    lFront,
    lCorner,
    lStraight,
    total,
    topInset,
    zJoinTop,
  };
})();

type OutlinePoint = { a: number; z: number };
type OutlineHit = OutlinePoint & { na: number; nz: number };

/** Ice outline. t = 0 at the +z post, t = 1 at the -z post. Along is unscaled. */
function iceOutline(t: number): OutlinePoint {
  if (t <= 0) return { a: 0, z: cage.hw };
  if (t >= 1) return { a: 0, z: -cage.hw };
  let s = t * cage.total;
  if (s < cage.lFront) {
    const phi = cage.phiEnd * (1 - s / cage.lFront);
    return { a: cage.a0 + cage.R2 * Math.sin(phi), z: cage.cz + cage.R2 * Math.cos(phi) };
  }
  s -= cage.lFront;
  if (s < cage.lCorner) {
    const theta = (Math.PI / 2) * (1 - s / cage.lCorner);
    return { a: cage.a0 + cage.R * Math.cos(theta), z: cage.zJoin + cage.R * Math.sin(theta) };
  }
  s -= cage.lCorner;
  if (s < cage.lStraight) return { a: GOAL_D, z: cage.zJoin - s };
  s -= cage.lStraight;
  if (s < cage.lCorner) {
    const theta = (Math.PI / 2) * (s / cage.lCorner);
    return { a: cage.a0 + cage.R * Math.cos(theta), z: -(cage.zJoin + cage.R * Math.sin(theta)) };
  }
  s -= cage.lCorner;
  const phi = cage.phiEnd * Math.min(1, s / cage.lFront);
  return { a: cage.a0 + cage.R2 * Math.sin(phi), z: -(cage.cz + cage.R2 * Math.cos(phi)) };
}

/**
 * Top shelf. Same t as the ice outline (0 at the +z post, 0.5 at center, 1 at the -z post)
 * so a blend keeps the straight back straight. The side is a quarter-ellipse: full depth
 * at zJoinTop, on the goal line at the post, and never outside the posts.
 */
function topOutline(t: number): OutlinePoint {
  if (t <= 0) return { a: 0, z: cage.hw };
  if (t >= 1) return { a: 0, z: -cage.hw };
  const sideT = (cage.lFront + cage.lCorner) / cage.total;
  const ts = t <= 0.5 ? t : 1 - t;
  const sign = t <= 0.5 ? 1 : -1;
  if (ts <= sideT) {
    const phi = (ts / sideT) * (Math.PI / 2);
    return {
      a: GOAL_D_TOP * Math.sin(phi),
      z: sign * (cage.zJoinTop + cage.topInset * Math.cos(phi)),
    };
  }
  const s = (ts - sideT) / (0.5 - sideT);
  return { a: GOAL_D_TOP, z: sign * cage.zJoinTop * (1 - s) };
}

/** 0 on the ice outline, 1 on the top shelf. */
function shelfBlend(depth: number): number {
  const span = GOAL_D - GOAL_D_TOP;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (GOAL_D - depth) / span));
}

/**
 * Point on the cage outline at straight-back depth `depth`.
 * t = 0 at the +z post on the goal line, t = 1 at the -z post.
 * `a` is depth behind the goal line. The back is flat.
 * GOAL_D is the outward base. GOAL_D_TOP is the inward top shelf.
 * Depths in between blend the two outlines.
 */
export function cageOutlinePoint(t: number, depth: number): OutlinePoint {
  const base = iceOutline(t);
  const u = shelfBlend(depth);
  if (u <= 0) return { a: base.a * (depth / GOAL_D), z: base.z };
  const top = topOutline(t);
  const uu = Math.min(1, u);
  const a = (1 - uu) * base.a * (depth / GOAL_D) + uu * top.a * (depth / GOAL_D_TOP);
  const z = (1 - uu) * base.z + uu * top.z;
  return { a, z };
}

function depthScale(y: number): number {
  const yT = Math.max(0, Math.min(1, y / Math.max(1e-6, GOAL_H)));
  return 1 - yT * (1 - GOAL_D_TOP / GOAL_D);
}

/** Back of the ice outline at lateral z. 0 outside the flared width. */
function iceBack(z: number): number {
  const az = Math.abs(z);
  if (az > cage.zMax + 1e-8) return 0;
  if (az <= cage.zJoin) return GOAL_D;
  const sinT = Math.min(1, (az - cage.zJoin) / cage.R);
  return cage.a0 + cage.R * Math.sqrt(Math.max(0, 1 - sinT * sinT));
}

/** Front of the ice outline. The mouth chord is 0 between the posts. */
function iceFront(z: number): number {
  const az = Math.abs(z);
  if (az <= cage.hw || az > cage.zMax + 1e-8) return 0;
  const cosP = Math.min(1, Math.max(-1, (az - cage.cz) / cage.R2));
  return cage.a0 - cage.R2 * Math.sqrt(Math.max(0, 1 - cosP * cosP));
}

/** Back of the top shelf. 0 outside the posts. Full GOAL_D_TOP on the straight run. */
function topBack(z: number): number {
  const az = Math.abs(z);
  if (az > cage.hw + 1e-8) return 0;
  if (az <= cage.zJoinTop) return GOAL_D_TOP;
  const cosP = Math.min(1, (az - cage.zJoinTop) / cage.topInset);
  return GOAL_D_TOP * Math.sqrt(Math.max(0, 1 - cosP * cosP));
}

const SHELF_N = 160;
const shelfSamples = Array.from({ length: SHELF_N + 1 }, (_, i) => {
  const t = i / SHELF_N;
  return { ice: iceOutline(t), top: topOutline(t) };
});

/** Back depth of the blended shell at straight-back depth `depth`. */
function blendedBack(z: number, depth: number): number {
  const u = shelfBlend(depth);
  if (u <= 0) {
    const back = iceBack(z);
    return back > 0 ? back * (depth / GOAL_D) : 0;
  }
  if (u >= 1) return topBack(z);
  const target = Math.abs(z);
  let best = 0;
  let prevZ = 0;
  let prevA = 0;
  let minZ = Infinity;
  let minA = 0;
  for (let i = 0; i < shelfSamples.length; i++) {
    const ice = shelfSamples[i].ice;
    const top = shelfSamples[i].top;
    const a = (1 - u) * ice.a * (depth / GOAL_D) + u * top.a * (depth / GOAL_D_TOP);
    const zz = Math.abs((1 - u) * ice.z + u * top.z);
    if (zz < minZ) {
      minZ = zz;
      minA = a;
    }
    if (i > 0 && (zz - target) * (prevZ - target) <= 0) {
      const den = zz - prevZ;
      const aa = Math.abs(den) < 1e-12 ? Math.max(prevA, a) : prevA + ((target - prevZ) / den) * (a - prevA);
      if (aa > best) best = aa;
    }
    prevZ = zz;
    prevA = a;
  }
  // The straight back crosses center at z = 0. A query on that center is inside
  // every sample's |z| and would otherwise miss the segment test.
  if (target <= minZ + 1e-9) best = Math.max(best, minA);
  return best;
}

/** Depth of the cage from the goal line at lateral z and height y. */
export function cageDepthAt(z: number, y = 0): number {
  const yT = Math.max(0, Math.min(1, y / Math.max(1e-6, GOAL_H)));
  if (yT <= 0) return iceBack(z);
  if (yT >= 1) return topBack(z);
  const depth = GOAL_D * depthScale(y);
  return blendedBack(z, depth);
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
  const back = iceBack(z);
  if (back <= 0.02) return false;
  const front = iceFront(z);
  return along > front + 1e-6 && along < back - 1e-6;
}

function clampAng(ang: number, min: number, max: number): number {
  if (ang < min) return min;
  if (ang > max) return max;
  return ang;
}

function hitOf(a: number, z: number, na: number, nz: number): OutlineHit {
  const len = Math.hypot(na, nz) || 1;
  return { a, z, na: na / len, nz: nz / len };
}

/** Closest point on the +z front arc. Angle 0 is the wide point, phiEnd is the post. */
function closestRightFront(a: number, z: number): OutlineHit {
  const phi = clampAng(Math.atan2(a - cage.a0, z - cage.cz), cage.phiEnd, 0);
  const na = Math.sin(phi);
  const nz = Math.cos(phi);
  return hitOf(cage.a0 + cage.R2 * na, cage.cz + cage.R2 * nz, na, nz);
}

/** Closest point on the +z rear corner. Angle 0 is the straight back, π/2 is the wide point. */
function closestRightCorner(a: number, z: number): OutlineHit {
  const theta = clampAng(Math.atan2(z - cage.zJoin, a - cage.a0), 0, Math.PI / 2);
  const na = Math.cos(theta);
  const nz = Math.sin(theta);
  return hitOf(cage.a0 + cage.R * na, cage.zJoin + cage.R * nz, na, nz);
}

function mirrorHit(hit: OutlineHit): OutlineHit {
  return { a: hit.a, z: -hit.z, na: hit.na, nz: -hit.nz };
}

function closestStraight(z: number): OutlineHit {
  return { a: GOAL_D, z: Math.max(-cage.zJoin, Math.min(cage.zJoin, z)), na: 1, nz: 0 };
}

function closestOnOutline(along: number, z: number): OutlineHit {
  const cands = [
    closestStraight(z),
    closestRightCorner(along, z),
    closestRightFront(along, z),
    mirrorHit(closestRightCorner(along, -z)),
    mirrorHit(closestRightFront(along, -z)),
  ];
  let best = cands[0];
  let bestD = Infinity;
  for (const c of cands) {
    const d = (c.a - along) * (c.a - along) + (c.z - z) * (c.z - z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function pushFromTwine(
  along: number,
  z: number,
  reach: number,
): { along: number; z: number; na: number; nz: number } | null {
  const inside = semiInside(along, z);
  const frame = closestOnOutline(along, z);
  const dx = along - frame.a;
  const dz = z - frame.z;
  const dist = Math.hypot(dx, dz);
  if (!inside && dist >= reach) return null;
  if (!inside) {
    if (dx * frame.na + dz * frame.nz < 0) return null;
    return {
      along: frame.a + frame.na * reach,
      z: frame.z + frame.nz * reach,
      na: frame.na,
      nz: frame.nz,
    };
  }
  const mouthDist = iceFront(z) <= 1e-6 && Math.abs(z) <= cage.hw + 1e-6 ? along : Infinity;
  if (mouthDist <= dist) return { along: -reach, z, na: -1, nz: 0 };
  return {
    along: frame.a + frame.na * reach,
    z: frame.z + frame.nz * reach,
    na: frame.na,
    nz: frame.nz,
  };
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
      if (Math.abs(pz) > cage.zMax + reach + 1.4) continue;

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

function angIn(ang: number, min: number, max: number): boolean {
  return ang >= min - 1e-3 && ang <= max + 1e-3;
}

function segmentHitsArc(
  a0: number,
  z0: number,
  a1: number,
  z1: number,
  ca: number,
  cz: number,
  rad: number,
  contains: (a: number, z: number) => boolean,
): boolean {
  const da = a1 - a0;
  const dz = z1 - z0;
  const fa = a0 - ca;
  const fz = z0 - cz;
  const quadA = da * da + dz * dz;
  const quadC = fa * fa + fz * fz - rad * rad;
  if (quadA < 1e-12) return quadC <= 1e-8 && contains(a0, z0);
  const quadB = 2 * (fa * da + fz * dz);
  const disc = quadB * quadB - 4 * quadA * quadC;
  if (disc < 0) return false;
  const root = Math.sqrt(disc);
  for (const t of [(-quadB - root) / (2 * quadA), (-quadB + root) / (2 * quadA)]) {
    if (t < -1e-4 || t > 1 + 1e-4) continue;
    if (contains(a0 + da * t, z0 + dz * t)) return true;
  }
  return false;
}

function onRightFront(a: number, z: number): boolean {
  return angIn(Math.atan2(a - cage.a0, z - cage.cz), cage.phiEnd, 0);
}

function onRightCorner(a: number, z: number): boolean {
  return angIn(Math.atan2(z - cage.zJoin, a - cage.a0), 0, Math.PI / 2);
}

function segmentHitsBack(a0: number, z0: number, a1: number, z1: number): boolean {
  const da = a1 - a0;
  const dz = z1 - z0;
  const zLo = -cage.zJoin;
  const zHi = cage.zJoin;
  if (Math.abs(da) < 1e-12) {
    if (Math.abs(a0 - GOAL_D) > 1e-5) return false;
    const lo = Math.min(z0, z1);
    const hi = Math.max(z0, z1);
    return hi >= zLo - 1e-6 && lo <= zHi + 1e-6;
  }
  const t = (GOAL_D - a0) / da;
  if (t < -1e-5 || t > 1 + 1e-5) return false;
  const z = z0 + dz * t;
  return z >= zLo - 1e-6 && z <= zHi + 1e-6;
}

function segmentHitsOutline(a0: number, z0: number, a1: number, z1: number): boolean {
  if (segmentHitsBack(a0, z0, a1, z1)) return true;
  const arcs: [number, number, number, (a: number, z: number) => boolean][] = [
    [cage.a0, cage.cz, cage.R2, onRightFront],
    [cage.a0, cage.zJoin, cage.R, onRightCorner],
    [cage.a0, -cage.cz, cage.R2, (a, z) => onRightFront(a, -z)],
    [cage.a0, -cage.zJoin, cage.R, (a, z) => onRightCorner(a, -z)],
  ];
  for (const [ca, cz, rad, contains] of arcs) {
    if (segmentHitsArc(a0, z0, a1, z1, ca, cz, rad, contains)) return true;
  }
  if (semiInside(a0, z0) || semiInside(a1, z1)) return true;
  return semiInside((a0 + a1) * 0.5, (z0 + z1) * 0.5);
}

function arcHitTimes(
  a0: number,
  z0: number,
  a1: number,
  z1: number,
  ca: number,
  cz: number,
  rad: number,
  contains: (a: number, z: number) => boolean,
): number[] {
  const da = a1 - a0;
  const dz = z1 - z0;
  const fa = a0 - ca;
  const fz = z0 - cz;
  const quadA = da * da + dz * dz;
  const quadC = fa * fa + fz * fz - rad * rad;
  const times: number[] = [];
  if (quadA < 1e-12) {
    if (quadC <= 1e-8 && contains(a0, z0)) times.push(0);
    return times;
  }
  const quadB = 2 * (fa * da + fz * dz);
  const disc = quadB * quadB - 4 * quadA * quadC;
  if (disc < 0) return times;
  const root = Math.sqrt(disc);
  for (const t of [(-quadB - root) / (2 * quadA), (-quadB + root) / (2 * quadA)]) {
    if (t < -1e-4 || t > 1 + 1e-4) continue;
    if (contains(a0 + da * t, z0 + dz * t)) times.push(t);
  }
  return times;
}

function backHitTime(a0: number, z0: number, a1: number, z1: number): number | null {
  const da = a1 - a0;
  const dz = z1 - z0;
  if (Math.abs(da) < 1e-12) return null;
  const t = (GOAL_D - a0) / da;
  if (t < -1e-4 || t > 1 + 1e-4) return null;
  const z = z0 + dz * t;
  if (z < -cage.zJoin - 1e-4 || z > cage.zJoin + 1e-4) return null;
  return t;
}

/**
 * A puck segment that meets the ice-level cage frame from the outside.
 * Shots that reach the frame through the mouth or from inside the net are ignored.
 * The normal points out of the cage.
 */
export function cageBaseStrike(
  a0: number,
  z0: number,
  a1: number,
  z1: number,
): OutlineHit | null {
  if (semiInside(a0, z0)) return null;
  const da = a1 - a0;
  const dz = z1 - z0;
  let bestT = 2;
  let best: OutlineHit | null = null;
  const take = (t: number) => {
    if (t < -1e-4 || t > 1 + 1e-4 || t >= bestT) return;
    const a = a0 + da * t;
    const z = z0 + dz * t;
    const before = Math.max(0, t - 1e-3);
    const ba = a0 + da * before;
    const bz = z0 + dz * before;
    if (semiInside(ba, bz)) return;
    const n = closestOnOutline(a, z);
    if ((ba - n.a) * n.na + (bz - n.z) * n.nz < -1e-4) return;
    if (da * n.na + dz * n.nz >= -1e-8) return;
    bestT = t;
    best = n;
  };
  const backT = backHitTime(a0, z0, a1, z1);
  if (backT !== null) take(backT);
  const arcs: [number, number, number, (a: number, z: number) => boolean][] = [
    [cage.a0, cage.cz, cage.R2, onRightFront],
    [cage.a0, cage.zJoin, cage.R, onRightCorner],
    [cage.a0, -cage.cz, cage.R2, (a, z) => onRightFront(a, -z)],
    [cage.a0, -cage.zJoin, cage.R, (a, z) => onRightCorner(a, -z)],
  ];
  for (const [ca, cz, rad, contains] of arcs) {
    for (const t of arcHitTimes(a0, z0, a1, z1, ca, cz, rad, contains)) take(t);
  }
  if (best || semiInside(a1, z1)) return best;
  // The pipe has thickness. A segment can strike it without crossing the centerline.
  let nearDist = Infinity;
  let nearHit: OutlineHit | null = null;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = a0 + da * t;
    const z = z0 + dz * t;
    if (semiInside(a, z)) continue;
    const n = closestOnOutline(a, z);
    const dx = a - n.a;
    const dzp = z - n.z;
    const dist = Math.hypot(dx, dzp);
    if (dx * n.na + dzp * n.nz < -1e-3) continue;
    if (dist < nearDist) {
      nearDist = dist;
      nearHit = n;
    }
  }
  // Touching the pipe counts, including a tangent skim. A center moving clearly away does not.
  if (
    nearHit &&
    nearDist < GOAL_PIPE_R + 0.045 &&
    da * nearHit.na + dz * nearHit.nz < 0.02
  ) {
    return nearHit;
  }
  return null;
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
    if (segmentHitsOutline(a0, z0, a1, z1)) return true;
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
    const near = closestOnOutline(along, pz);
    const dx = along - near.a;
    const dz = pz - near.z;
    const dist = Math.hypot(dx, dz);
    const outside = dx * near.na + dz * near.nz;
    const inside = semiInside(along, pz);
    if (!inside && (outside < 0 || dist >= pad)) continue;

    const mouthDist = iceFront(pz) <= 1e-6 && Math.abs(pz) <= cage.hw + 1e-6 ? along : Infinity;
    if (mouthDist <= dist) {
      px = mouth - side * 0.01;
      nx = -side;
      nz = 0;
    } else {
      px = mouth + side * near.a;
      pz = near.z;
      const nxw = side * near.na;
      const nlen = Math.hypot(nxw, near.nz) || 1;
      nx = nxw / nlen;
      nz = near.nz / nlen;
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
  // damp is restitution on that normal only. Speed along the boards stays.
  const rest = 1 + damp;
  return { vx: vx - rest * vn * nx, vz: vz - rest * vn * nz };
}
