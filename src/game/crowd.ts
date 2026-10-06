import { CORNER_R, RINK_L, RINK_W } from "./rink";
import { rinkPerimeter } from "./rinkGeom";

/** Seat mesh in Arena SeatDeck. Spacing along a row is wider than this box. */
export const SEAT_W = 0.48;
export const SEAT_H = 0.36;
export const SEAT_D = 0.44;
/** personGeo cylinder: top radius, bottom radius, height. Collision uses the wider end. */
export const PERSON_RT = 0.1;
export const PERSON_RB = 0.12;
export const PERSON_H = 0.34;
export const PERSON_LIFT = 0.32;
export const FASCIA_W = 0.55;
export const FASCIA_H = 0.22;
export const FASCIA_D = 0.55;
export const FASCIA_DROP = 0.52;
export const RIBBON_Y = 5.55;
export const RIBBON_INSET = -12.55;
export const RIBBON_Y2 = 10.18;
export const RIBBON_INSET2 = -21.15;
export const JUMBO_Y = 27.4;
export const JUMBO_HW = 5.15;
export const JUMBO_HH = 2.42;
export const JUMBO_SHELL_SHRINK = 0.12;
export const JUMBO_FACE_SCALE = 1.92;
export const PRESS_SHELL = { w: 18.4, h: 3.7, d: 4.6, z: 0.2 };
export const PRESS_ROOF = { w: 19.2, h: 0.28, d: 5.1, lift: 0.16, z: 0.12 };
export const PRESS_GLASS_X = [-6.4, -3.2, 0, 3.2, 6.4] as const;
export const PRESS_GLASS = { w: 2.7, h: 2.15, d: 0.08, y: 0.08, z: -2.22 };
export const PRESS_BAYS = [0, 18.4] as const;
/** Live puck cylinder in PuckMesh. */
export const CROWD_PUCK_R = 0.052;

const THIRD_ROWS = 12;
const THIRD_GAP = 21.8;
const THIRD_Y0 = 10.9;
const THIRD_ROW_D = 0.56;
const THIRD_RISE = 0.28;

export type SeatSpot = { x: number; y: number; z: number; rot: number; awayFan: boolean };

export function pressBoxFrame(): { y: number; z: number; boxH: number } {
  const boxH = PRESS_SHELL.h;
  const deckTopY = THIRD_Y0 + (THIRD_ROWS - 1) * THIRD_RISE;
  const y = deckTopY + 0.62 + boxH / 2;
  const z = RINK_W / 2 + THIRD_GAP + (THIRD_ROWS - 1) * THIRD_ROW_D - 0.2;
  return { y, z, boxH };
}

function skipRinkside(x: number, z: number): boolean {
  if (Math.abs(x) > RINK_L / 2 - CORNER_R + 0.6) return false;
  const out = Math.abs(z) - RINK_W / 2;
  if (out < 0.15 || out > 3.4) return false;
  if (z < 0 && Math.abs(x) < 10.6) return true;
  if (z > 0 && Math.abs(x) < 4.1) return true;
  return false;
}

function buildStands(
  rows: number,
  gap: number,
  y0: number,
  rowD: number,
  rise: number,
  skip?: (x: number, z: number) => boolean,
): SeatSpot[] {
  const spots: SeatSpot[] = [];
  const seatW = 0.72;

  for (let row = 0; row < rows; row++) {
    const y = y0 + row * rise;
    const offset = gap + row * rowD;
    const ring = rinkPerimeter(-offset, 128);
    const n = ring.length;
    let dist = 0;
    let nextSeat = seatW * 0.45;
    for (let i = 0; i < n; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % n]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.04) continue;
      const tx = dx / len;
      const tz = dz / len;
      const nx = -tz;
      const nz = tx;
      const rot = Math.atan2(nx, nz);
      while (nextSeat <= dist + len) {
        const t = (nextSeat - dist) / len;
        const x = a.x + dx * t;
        const z = a.z + dz * t;
        if (!skip?.(x, z)) spots.push({ x, y, z, rot, awayFan: false });
        nextSeat += seatW;
      }
      dist += len;
    }
  }
  return spots;
}

const GLASS = buildStands(2, 0.52, 0.96, 0.52, 0.1, skipRinkside);
const INNER = buildStands(2, 1.56, 1.16, 0.5, 0.08, skipRinkside);
const LOWER = buildStands(21, 2.5, 1.28, 0.51, 0.18, skipRinkside);
const UPPER = buildStands(14, 13.8, 6.35, 0.54, 0.27);
const THIRD = buildStands(THIRD_ROWS, THIRD_GAP, THIRD_Y0, THIRD_ROW_D, THIRD_RISE).filter(
  (p) => !(p.z > RINK_W / 2 + 25.6 && p.x > -9.4 && p.x < 28.2 && p.y > 13.4),
);
export const STANDS: SeatSpot[] = [...GLASS, ...INNER, ...LOWER, ...UPPER, ...THIRD];
(() => {
  const nAway = Math.round(STANDS.length * 0.05);
  const pocket = STANDS.map((p, i) => ({ p, i }))
    .filter(({ p }) => p.y >= 10.9 && p.x > 0 && p.z < 0)
    .sort((a, b) => a.p.z - b.p.z || Math.abs(a.p.x - 5) - Math.abs(b.p.x - 5));
  const away = new Set<number>();
  for (const { i } of pocket) {
    if (away.size >= nAway) break;
    away.add(i);
  }
  for (const i of away) STANDS[i]!.awayFan = true;
})();

export function fasciaRing(inset: number): { x: number; z: number }[] {
  return rinkPerimeter(inset + 0.08, 48).map((p) => ({ x: p.x, z: p.z }));
}

type Solid = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  dist2: (px: number, py: number, pz: number) => number;
};

const CELL = 4;
const solids: Solid[] = [];
const buckets = new Map<string, number[]>();
let crowdMinY = Infinity;
let seen = new Uint32Array(0);
let queryStamp = 1;

function worldBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Solid {
  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    dist2: (px, py, pz) => {
      const x = Math.max(minX, Math.min(maxX, px));
      const y = Math.max(minY, Math.min(maxY, py));
      const z = Math.max(minZ, Math.min(maxZ, pz));
      const dx = px - x;
      const dy = py - y;
      const dz = pz - z;
      return dx * dx + dy * dy + dz * dz;
    },
  };
}

function addSolid(s: Solid): void {
  const i = solids.length;
  solids.push(s);
  if (s.minY < crowdMinY) crowdMinY = s.minY;
  const ix0 = Math.floor(s.minX / CELL);
  const ix1 = Math.floor(s.maxX / CELL);
  const iz0 = Math.floor(s.minZ / CELL);
  const iz1 = Math.floor(s.maxZ / CELL);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iz = iz0; iz <= iz1; iz++) {
      const k = ix + "," + iz;
      let list = buckets.get(k);
      if (!list) {
        list = [];
        buckets.set(k, list);
      }
      list.push(i);
    }
  }
}

function addAabb(
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
): void {
  addSolid(worldBox(cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz));
}

function addSeat(p: SeatSpot): void {
  const hx = SEAT_W / 2;
  const hy = SEAT_H / 2;
  const hz = SEAT_D / 2;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const ax = Math.abs(c) * hx + Math.abs(s) * hz;
  const az = Math.abs(s) * hx + Math.abs(c) * hz;
  addSolid({
    minX: p.x - ax,
    maxX: p.x + ax,
    minY: p.y - hy,
    maxY: p.y + hy,
    minZ: p.z - az,
    maxZ: p.z + az,
    dist2: (px, py, pz) => {
      const dx = px - p.x;
      const dy = py - p.y;
      const dz = pz - p.z;
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      const qx = Math.max(-hx, Math.min(hx, lx));
      const qy = Math.max(-hy, Math.min(hy, dy));
      const qz = Math.max(-hz, Math.min(hz, lz));
      const ex = lx - qx;
      const ey = dy - qy;
      const ez = lz - qz;
      return ex * ex + ey * ey + ez * ez;
    },
  });
  const cy = p.y + PERSON_LIFT;
  const hh = PERSON_H / 2;
  const pr = PERSON_RB;
  addSolid({
    minX: p.x - pr,
    maxX: p.x + pr,
    minY: cy - hh,
    maxY: cy + hh,
    minZ: p.z - pr,
    maxZ: p.z + pr,
    dist2: (px, py, pz) => {
      const radial = Math.hypot(px - p.x, pz - p.z);
      const y = Math.max(cy - hh, Math.min(cy + hh, py));
      const dr = Math.max(0, radial - pr);
      const dy = py - y;
      return dr * dr + dy * dy;
    },
  });
}

function addFascia(y: number, inset: number): void {
  const cy = y - FASCIA_DROP;
  const hx = FASCIA_W / 2;
  const hy = FASCIA_H / 2;
  const hz = FASCIA_D / 2;
  for (const p of fasciaRing(inset)) addAabb(p.x, cy, p.z, hx, hy, hz);
}

function addPress(): void {
  const frame = pressBoxFrame();
  const { y, z, boxH } = frame;
  for (const ox of PRESS_BAYS) {
    addAabb(ox, y, z + PRESS_SHELL.z, PRESS_SHELL.w / 2, boxH / 2, PRESS_SHELL.d / 2);
    addAabb(
      ox,
      y + boxH / 2 + PRESS_ROOF.lift,
      z + PRESS_ROOF.z,
      PRESS_ROOF.w / 2,
      PRESS_ROOF.h / 2,
      PRESS_ROOF.d / 2,
    );
    for (const gx of PRESS_GLASS_X) {
      addAabb(
        ox + gx,
        y + PRESS_GLASS.y,
        z + PRESS_GLASS.z,
        PRESS_GLASS.w / 2,
        PRESS_GLASS.h / 2,
        PRESS_GLASS.d / 2,
      );
    }
  }
}

function addJumbo(): void {
  const hx = (JUMBO_HW * 2 - JUMBO_SHELL_SHRINK) / 2;
  const hy = (JUMBO_HH * 2 - JUMBO_SHELL_SHRINK) / 2;
  const hz = hx;
  addAabb(0, JUMBO_Y, 0, hx, hy, hz);
  const fw = (JUMBO_HW * JUMBO_FACE_SCALE) / 2;
  const fh = (JUMBO_HH * JUMBO_FACE_SCALE) / 2;
  addSolid(worldBox(-fw, JUMBO_Y - fh, JUMBO_HW, fw, JUMBO_Y + fh, JUMBO_HW));
  addSolid(worldBox(-fw, JUMBO_Y - fh, -JUMBO_HW, fw, JUMBO_Y + fh, -JUMBO_HW));
  addSolid(worldBox(JUMBO_HW, JUMBO_Y - fh, -fw, JUMBO_HW, JUMBO_Y + fh, fw));
  addSolid(worldBox(-JUMBO_HW, JUMBO_Y - fh, -fw, -JUMBO_HW, JUMBO_Y + fh, fw));
}

function buildCrowd(): void {
  for (const p of STANDS) addSeat(p);
  addFascia(RIBBON_Y, RIBBON_INSET);
  addFascia(RIBBON_Y2, RIBBON_INSET2);
  addPress();
  addJumbo();
  seen = new Uint32Array(solids.length);
}
buildCrowd();

export type CrowdHit = { x: number; y: number; z: number; t: number };

/** First contact of a puck-radius sphere swept along the segment. A miss returns null. */
export function sweepCrowd(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radius: number,
): CrowdHit | null {
  const maxY = Math.max(ay, by) + radius;
  if (maxY < crowdMinY) return null;
  const minX = Math.min(ax, bx) - radius;
  const maxX = Math.max(ax, bx) + radius;
  const minY = Math.min(ay, by) - radius;
  const minZ = Math.min(az, bz) - radius;
  const maxZ = Math.max(az, bz) + radius;
  const r2 = radius * radius;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  queryStamp++;
  if (queryStamp === 0xffffffff) {
    seen.fill(0);
    queryStamp = 1;
  }
  let bestT = Infinity;
  const ix0 = Math.floor(minX / CELL);
  const ix1 = Math.floor(maxX / CELL);
  const iz0 = Math.floor(minZ / CELL);
  const iz1 = Math.floor(maxZ / CELL);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iz = iz0; iz <= iz1; iz++) {
      const bucket = buckets.get(ix + "," + iz);
      if (!bucket) continue;
      for (let n = 0; n < bucket.length; n++) {
        const i = bucket[n]!;
        if (seen[i] === queryStamp) continue;
        seen[i] = queryStamp;
        const s = solids[i]!;
        if (s.maxX < minX || s.minX > maxX || s.maxY < minY || s.minY > maxY || s.maxZ < minZ || s.minZ > maxZ) {
          continue;
        }
        const at = (t: number) => s.dist2(ax + dx * t, ay + dy * t, az + dz * t);
        let lo = 0;
        let hi = 1;
        for (let k = 0; k < 22; k++) {
          const m1 = lo + (hi - lo) / 3;
          const m2 = hi - (hi - lo) / 3;
          if (at(m1) < at(m2)) hi = m2;
          else lo = m1;
        }
        const tClose = (lo + hi) * 0.5;
        if (at(tClose) > r2) continue;
        let tHit = 0;
        if (at(0) > r2) {
          let a = 0;
          let b = tClose;
          for (let k = 0; k < 16; k++) {
            const mid = (a + b) * 0.5;
            if (at(mid) <= r2) b = mid;
            else a = mid;
          }
          tHit = b;
        }
        if (tHit < bestT) bestT = tHit;
      }
    }
  }
  if (bestT === Infinity) return null;
  return { x: ax + dx * bestT, y: ay + dy * bestT, z: az + dz * bestT, t: bestT };
}
