import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  createArenaEnv,
  createJumboFace,
  createRibbonCanvas,
  createScoreboardCanvas,
  mixHex,
} from "./iceTexture";
import { BOARD_H, CORNER_R, FT, GLASS_H, GOAL_LINE_X, RINK_L, RINK_W } from "./rink";
import { rinkPerimeter } from "./rinkGeom";
import { kitById } from "./uniforms";
import { periodOrdinal, showsPeriodClock, useGame, type ArenaLook } from "./store";
import { benchGoalieNumber, defendDir, jumboReplayView, penaltyNumbers, stepJumboReplay, world } from "./sim";
import { SeatedPlayer } from "./PlayerMesh";
import {
  FASCIA_D,
  FASCIA_DROP,
  FASCIA_H,
  FASCIA_W,
  BOWL_WALL,
  fasciaRing,
  JUMBO_FACE_SCALE,
  JUMBO_HH,
  JUMBO_HW,
  JUMBO_SHELL_SHRINK,
  JUMBO_Y,
  PERSON_H,
  PERSON_LIFT,
  PERSON_RB,
  PERSON_RT,
  PRESS_BAYS,
  PRESS_GLASS,
  PRESS_GLASS_X,
  PRESS_ROOF,
  PRESS_SHELL,
  pressBoxFrame,
  RIBBON_INSET,
  RIBBON_INSET2,
  RIBBON_Y,
  RIBBON_Y2,
  SEAT_D,
  SEAT_H,
  SEAT_W,
  STANDS,
} from "./crowd";

const seatGeo = new THREE.BoxGeometry(SEAT_W, SEAT_H, SEAT_D);
const personGeo = new THREE.CylinderGeometry(PERSON_RT, PERSON_RB, PERSON_H, 5);
const _crowdDummy = new THREE.Object3D();

const RINK_HX = RINK_L / 2;
const RINK_HZ = RINK_W / 2;
const RINK_WALL_TOP = BOARD_H + GLASS_H;
const RINK_INNER_X = RINK_HX - CORNER_R;
const RINK_INNER_Z = RINK_HZ - CORNER_R;
const CORNER_CENTERS: ReadonlyArray<readonly [number, number]> = [
  [RINK_INNER_X, RINK_INNER_Z],
  [RINK_INNER_X, -RINK_INNER_Z],
  [-RINK_INNER_X, RINK_INNER_Z],
  [-RINK_INNER_X, -RINK_INNER_Z],
];

function insideRink(x: number, z: number): boolean {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax <= RINK_INNER_X) return az <= RINK_HZ;
  if (az <= RINK_INNER_Z) return ax <= RINK_HX;
  const dx = ax - RINK_INNER_X;
  const dz = az - RINK_INNER_Z;
  return dx * dx + dz * dz <= CORNER_R * CORNER_R;
}

/** Nearest t > 0 where O + t D meets the ice or the board/glass wall. Infinity if it misses. */
function nearestRinkT(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  let best = Infinity;
  if (dy < -1e-5 || dy > 1e-5) {
    const t = -oy / dy;
    if (t > 0.05) {
      const x = ox + dx * t;
      const z = oz + dz * t;
      if (insideRink(x, z) && t < best) best = t;
    }
  }
  if (dz < -1e-5 || dz > 1e-5) {
    for (const hz of [RINK_HZ, -RINK_HZ]) {
      const t = (hz - oz) / dz;
      if (t <= 0.05 || t >= best) continue;
      const x = ox + dx * t;
      const y = oy + dy * t;
      if (Math.abs(x) <= RINK_INNER_X && y >= 0 && y <= RINK_WALL_TOP) best = t;
    }
  }
  if (dx < -1e-5 || dx > 1e-5) {
    for (const hx of [RINK_HX, -RINK_HX]) {
      const t = (hx - ox) / dx;
      if (t <= 0.05 || t >= best) continue;
      const z = oz + dz * t;
      const y = oy + dy * t;
      if (Math.abs(z) <= RINK_INNER_Z && y >= 0 && y <= RINK_WALL_TOP) best = t;
    }
  }
  for (let i = 0; i < CORNER_CENTERS.length; i++) {
    const ccx = CORNER_CENTERS[i]![0];
    const ccz = CORNER_CENTERS[i]![1];
    const lx = ox - ccx;
    const lz = oz - ccz;
    const a = dx * dx + dz * dz;
    if (a < 1e-8) continue;
    const b = 2 * (lx * dx + lz * dz);
    const c = lx * lx + lz * lz - CORNER_R * CORNER_R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const root = Math.sqrt(disc);
    const inv = 0.5 / a;
    const t0 = (-b - root) * inv;
    const t1 = (-b + root) * inv;
    if (t0 > 0.05 && t0 < best) {
      const y = oy + dy * t0;
      if (y >= 0 && y <= RINK_WALL_TOP) best = t0;
    }
    if (t1 > 0.05 && t1 < best) {
      const y = oy + dy * t1;
      if (y >= 0 && y <= RINK_WALL_TOP) best = t1;
    }
  }
  return best;
}

/** Point is in front of the ice, boards, or glass along the ray from the camera. */
function occludesRink(cx: number, cy: number, cz: number, x: number, y: number, z: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  const hit = nearestRinkT(cx, cy, cz, dx, dy, dz);
  return hit > 1.015 && hit < Infinity;
}

/** Ice and glass outline, used to find the rink's on-screen silhouette. */
const SIGHT_RING = rinkPerimeter(0, 48);
const SIGHT_BINS = 32;
const SIGHT_PAD_X = 0.05;
const SIGHT_PAD_Y = 0.03;
const sightBin = new Float64Array(SIGHT_BINS);
const sightPts = new Float32Array(SIGHT_RING.length * 4);
const _sightNdc = new THREE.Vector3();
let sightPtN = 0;
let sightMinX = -1;
let sightMaxX = 1;
let sightReady = false;
let sightCam: THREE.Camera | null = null;
let sightCx = 0;
let sightCy = 0;
let sightCz = 0;
let sightFx = 0;
let sightFy = 0;
let sightFz = 1;
/** Hidden radial span of a seat column, filled after the seat pass. */
const crowdClear = new Map<number, { r0: number; r1: number }>();

function updateSight(camera: THREE.Camera): void {
  sightCam = camera;
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  sightCx = camera.position.x;
  sightCy = camera.position.y;
  sightCz = camera.position.z;
  sightFx = -e[8];
  sightFy = -e[9];
  sightFz = -e[10];
  sightPtN = 0;
  for (let pass = 0; pass < 2; pass++) {
    const y = pass === 0 ? 0 : RINK_WALL_TOP;
    for (let i = 0; i < SIGHT_RING.length; i++) {
      const p = SIGHT_RING[i]!;
      const depth = (p.x - sightCx) * sightFx + (y - sightCy) * sightFy + (p.z - sightCz) * sightFz;
      if (depth <= 0.35) continue;
      _sightNdc.set(p.x, y, p.z).project(camera);
      if (_sightNdc.x < -1.15 || _sightNdc.x > 1.15) continue;
      let sy = _sightNdc.y;
      if (sy < -1.05) sy = -1;
      else if (sy > 1.2) continue;
      sightPts[sightPtN++] = _sightNdc.x;
      sightPts[sightPtN++] = sy;
    }
  }
  if (sightPtN < 8) {
    sightReady = false;
    return;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < sightPtN; i += 2) {
    const x = sightPts[i]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  if (!(maxX - minX > 1e-3)) {
    sightReady = false;
    return;
  }
  sightMinX = minX;
  sightMaxX = maxX;
  sightBin.fill(Infinity);
  const span = maxX - minX;
  for (let i = 0; i < sightPtN; i += 2) {
    const t = (sightPts[i]! - minX) / span;
    const bin = Math.min(SIGHT_BINS - 1, Math.max(0, Math.round(t * (SIGHT_BINS - 1))));
    const y = sightPts[i + 1]!;
    if (y < sightBin[bin]!) sightBin[bin] = y;
  }
  let first = -1;
  let last = -1;
  for (let i = 0; i < SIGHT_BINS; i++) {
    if (sightBin[i]! < Infinity) {
      if (first < 0) first = i;
      if (last >= 0 && i - last > 1) {
        const a = sightBin[last]!;
        const b = sightBin[i]!;
        for (let k = last + 1; k < i; k++) {
          const f = (k - last) / (i - last);
          sightBin[k] = a + (b - a) * f;
        }
      }
      last = i;
    }
  }
  if (first < 0 || last < 0) {
    sightReady = false;
    return;
  }
  for (let i = 0; i < first; i++) sightBin[i] = sightBin[first]!;
  for (let i = last + 1; i < SIGHT_BINS; i++) sightBin[i] = sightBin[last]!;
  sightReady = true;
}

/** On screen at or above the rink silhouette, and not well outside its width. */
function crossesSightline(x: number, y: number, z: number): boolean {
  if (!sightReady || !sightCam) return false;
  const depth = (x - sightCx) * sightFx + (y - sightCy) * sightFy + (z - sightCz) * sightFz;
  if (depth <= 0.35) return false;
  _sightNdc.set(x, y, z).project(sightCam);
  if (_sightNdc.x < sightMinX - SIGHT_PAD_X || _sightNdc.x > sightMaxX + SIGHT_PAD_X) return false;
  const span = sightMaxX - sightMinX;
  let t = span > 1e-4 ? (_sightNdc.x - sightMinX) / span : 0.5;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const f = t * (SIGHT_BINS - 1);
  const i0 = Math.min(SIGHT_BINS - 1, Math.floor(f));
  const i1 = Math.min(SIGHT_BINS - 1, i0 + 1);
  const u = i1 === i0 ? 0 : f - i0;
  const lim = sightBin[i0]! * (1 - u) + sightBin[i1]! * u;
  return _sightNdc.y >= lim - SIGHT_PAD_Y;
}

function columnCrosses(i: number): boolean {
  const p = STANDS[i]!;
  return crossesSightline(p.x, p.y + PERSON_LIFT + PERSON_H * 0.5, p.z);
}

/** Seat hangs into the upper frame, including just past the top edge. Not the foreground. */
function protrudesTop(i: number): boolean {
  if (!sightReady || !sightCam) return false;
  const p = STANDS[i]!;
  const y = p.y + PERSON_LIFT + PERSON_H * 0.5;
  const depth = (p.x - sightCx) * sightFx + (y - sightCy) * sightFy + (p.z - sightCz) * sightFz;
  if (depth <= 0.35) return false;
  _sightNdc.set(p.x, y, p.z).project(sightCam);
  if (_sightNdc.y < 0) return false;
  return _sightNdc.x >= -1.35 && _sightNdc.x <= 1.35;
}

const SKY_BINS = 64;
const skyTop = new Float64Array(SKY_BINS);

function headOnScreen(i: number): boolean {
  if (!sightCam) return false;
  const p = STANDS[i]!;
  const y = p.y + PERSON_LIFT + PERSON_H * 0.5;
  const depth = (p.x - sightCx) * sightFx + (y - sightCy) * sightFy + (p.z - sightCz) * sightFz;
  if (depth <= 0.35) return false;
  _sightNdc.set(p.x, y, p.z).project(sightCam);
  return _sightNdc.z >= -1 && _sightNdc.z <= 1;
}

/** Drop seats that stick up above the crowd to either side. The lower frame is left alone. */
function trimTopWedges(): void {
  if (!sightReady) return;
  skyTop.fill(-2);
  for (let i = 0; i < STANDS.length; i++) {
    if (crowdHide[i] === 1 || !headOnScreen(i)) continue;
    if (_sightNdc.y < 0 || _sightNdc.x < -1.15 || _sightNdc.x > 1.15) continue;
    const b = Math.min(SKY_BINS - 1, Math.max(0, Math.floor(((_sightNdc.x + 1) * 0.5) * SKY_BINS)));
    if (_sightNdc.y > skyTop[b]!) skyTop[b] = _sightNdc.y;
  }
  for (let i = 0; i < STANDS.length; i++) {
    if (crowdHide[i] === 1 || !headOnScreen(i)) continue;
    if (_sightNdc.y < 0.02 || _sightNdc.x < -1.15 || _sightNdc.x > 1.15) continue;
    const b = Math.min(SKY_BINS - 1, Math.max(0, Math.floor(((_sightNdc.x + 1) * 0.5) * SKY_BINS)));
    let shoulder = -2;
    for (const dir of [-1, 1]) {
      for (let d = 8; d <= 18; d++) {
        const j = b + dir * d;
        if (j < 0 || j >= SKY_BINS) continue;
        if (skyTop[j]! > shoulder) shoulder = skyTop[j]!;
      }
    }
    if (shoulder < -1) continue;
    if (_sightNdc.y > shoulder + 0.045) crowdHide[i] = 1;
  }
}

function sameColumnFamily(a: number, b: number): boolean {
  return Math.floor(a / 100_000) === Math.floor(b / 100_000);
}

/** Stadium solid between the camera and the rink, or left floating in a cleared column. */
function floatsInSight(x: number, y: number, z: number): boolean {
  if (!sightReady || !sightCam) return false;
  const depth = (x - sightCx) * sightFx + (y - sightCy) * sightFy + (z - sightCz) * sightFz;
  if (depth <= 0.35) return false;
  if (occludesRink(sightCx, sightCy, sightCz, x, y, z)) return true;
  const key = crowdColumnKey(x, z);
  const r = Math.hypot(x, z);
  let inClear = false;
  for (let d = -2; d <= 2; d++) {
    const n = key + d;
    if (!sameColumnFamily(n, key)) continue;
    const span = crowdClear.get(n);
    if (span && r >= span.r0 - 1.2) {
      inClear = true;
      break;
    }
  }
  if (!inClear) return false;
  if (crossesSightline(x, y, z)) return true;
  _sightNdc.set(x, y, z).project(sightCam);
  return (
    _sightNdc.z >= -1 &&
    _sightNdc.z <= 1 &&
    _sightNdc.y >= 0 &&
    _sightNdc.x >= -1.35 &&
    _sightNdc.x <= 1.35
  );
}

const crowdHide = new Uint8Array(STANDS.length);
const crowdCols = new Map<number, number[]>();

/** Straight-side columns share x, end columns share z, corners share an angle. */
function crowdColumnKey(x: number, z: number): number {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax <= RINK_INNER_X + 2 && az >= RINK_HZ - 1) {
    return 1_000_000 + (z >= 0 ? 100_000 : 0) + Math.round(x / 0.72);
  }
  if (az <= RINK_INNER_Z + 2 && ax >= RINK_HX - 1) {
    return 2_000_000 + (x >= 0 ? 100_000 : 0) + Math.round(z / 0.72);
  }
  return 3_000_000 + Math.round(Math.atan2(z, x) / 0.04);
}

function crowdColumn(key: number): number[] {
  let list = crowdCols.get(key);
  if (!list) {
    list = [];
    crowdCols.set(key, list);
  }
  return list;
}

function SeatDeck() {
  const home = kitById(useGame((s) => s.homeKit));
  const away = kitById(useGame((s) => s.awayKit));
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const crowdRef = useRef<THREE.InstancedMesh>(null);
  const cheering = useRef(false);
  const count = STANDS.length;
  const { camera } = useThree();

  const colors = useMemo(
    () => ({
      seat: new THREE.Color("#2a3340"),
      homePri: new THREE.Color(home.crowdPri),
      homeSec: new THREE.Color(home.crowdSec),
      awayPri: new THREE.Color(away.crowdPri),
      dark: new THREE.Color("#1c222c"),
    }),
    [home, away],
  );

  useLayoutEffect(() => {
    const seats = meshRef.current;
    const crowd = crowdRef.current;
    if (!seats || !crowd) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < STANDS.length; i++) {
      const p = STANDS[i]!;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      color.copy(colors.seat);
      color.offsetHSL(0, 0, ((i * 13) % 9) * 0.012 - 0.05);
      seats.setColorAt(i, color);

      dummy.position.y = p.y + PERSON_LIFT;
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
      const jersey = p.awayFan
        ? i % 3 === 0
          ? colors.dark
          : colors.awayPri
        : i % 6 === 0
          ? colors.homeSec
          : i % 11 === 0
            ? colors.dark
            : colors.homePri;
      crowd.setColorAt(i, jersey);
    }
    seats.instanceMatrix.needsUpdate = true;
    crowd.instanceMatrix.needsUpdate = true;
    if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  }, [colors]);

  useFrame(() => {
    const seats = meshRef.current;
    const crowd = crowdRef.current;
    if (!seats || !crowd) return;
    const dummy = _crowdDummy;
    const ui = useGame.getState();
    const scrimmageHomeWin =
      ui.clockMode === "scrimmage" && world.periodOver && world.goalSide === "home";
    const scrimmageAwayWin =
      ui.clockMode === "scrimmage" && world.periodOver && world.goalSide === "away";
    const winHome = (world.periodOver && ui.homeScore > ui.awayScore) || scrimmageHomeWin;
    const winAway = (world.periodOver && ui.awayScore > ui.homeScore) || scrimmageAwayWin;
    const drill = ui.clockMode === "drill";
    const brawl = world.lineBrawl !== null;
    const on = drill
      ? world.drillCheer > 0
      : (world.goalTicker > 0 && !!world.goalSide) || winHome || winAway;
    const scoringHome = winHome || (!world.periodOver && world.goalSide === "home");
    const t = world.time;
    updateSight(camera);
    const cx = sightCx;
    const cy = sightCy;
    const cz = sightCz;
    const fx = sightFx;
    const fy = sightFy;
    const fz = sightFz;
    for (const list of crowdCols.values()) list.length = 0;
    for (let i = 0; i < STANDS.length; i++) {
      const p = STANDS[i]!;
      const depth = (p.x - cx) * fx + (p.y - cy) * fy + (p.z - cz) * fz;
      let hide = false;
      if (depth > 0.35) {
        const foot = p.y - SEAT_H * 0.5;
        const head = p.y + PERSON_LIFT + PERSON_H * 0.5;
        hide =
          occludesRink(cx, cy, cz, p.x, foot, p.z) ||
          occludesRink(cx, cy, cz, p.x, p.y, p.z) ||
          occludesRink(cx, cy, cz, p.x, p.y + PERSON_LIFT, p.z) ||
          occludesRink(cx, cy, cz, p.x, head, p.z);
      }
      crowdHide[i] = hide ? 1 : 0;
      crowdColumn(crowdColumnKey(p.x, p.z)).push(i);
    }
    for (const col of crowdCols.values()) {
      if (col.length === 0) continue;
      let any = false;
      for (let k = 0; k < col.length; k++) {
        if (crowdHide[col[k]!] === 1) {
          any = true;
          break;
        }
      }
      if (!any) continue;
      col.sort((a, b) => {
        const pa = STANDS[a]!;
        const pb = STANDS[b]!;
        return Math.hypot(pa.x, pa.z) - Math.hypot(pb.x, pb.z) || pa.y - pb.y;
      });
      let seen = false;
      for (let k = 0; k < col.length; k++) {
        if (crowdHide[col[k]!] === 1) seen = true;
        else if (seen && columnCrosses(col[k]!)) crowdHide[col[k]!] = 1;
      }
      if (col.length > 1 && crowdHide[col[1]!] === 1 && columnCrosses(col[0]!)) crowdHide[col[0]!] = 1;
      for (let k = 0; k < col.length; k++) {
        if (crowdHide[col[k]!] !== 1 && protrudesTop(col[k]!)) crowdHide[col[k]!] = 1;
      }
    }
    // One neighboring column, same deck band, so the cleared edge is not a stair of triangles.
    // Seats below the ice stay. Seats that hang in from the top of the frame go with the column.
    const cleared: number[] = [];
    for (const [key, col] of crowdCols) {
      for (let k = 0; k < col.length; k++) {
        if (crowdHide[col[k]!] === 1) {
          cleared.push(key);
          break;
        }
      }
    }
    for (let c = 0; c < cleared.length; c++) {
      const key = cleared[c]!;
      const col = crowdCols.get(key);
      if (!col) continue;
      let r0 = Infinity;
      let r1 = -Infinity;
      for (let k = 0; k < col.length; k++) {
        if (crowdHide[col[k]!] !== 1) continue;
        const p = STANDS[col[k]!]!;
        const r = Math.hypot(p.x, p.z);
        if (r < r0) r0 = r;
        if (r > r1) r1 = r;
      }
      const family = Math.floor(key / 100_000);
      for (const n of [key - 2, key - 1, key + 1, key + 2]) {
        if (Math.floor(n / 100_000) !== family) continue;
        const ncol = crowdCols.get(n);
        if (!ncol) continue;
        let top = false;
        for (let k = 0; k < ncol.length; k++) {
          const p = STANDS[ncol[k]!]!;
          const r = Math.hypot(p.x, p.z);
          if (r >= r0 - 0.9 && r <= r1 + 0.9 && columnCrosses(ncol[k]!)) crowdHide[ncol[k]!] = 1;
          if (r >= r0 - 0.9 && protrudesTop(ncol[k]!)) {
            crowdHide[ncol[k]!] = 1;
            top = true;
          }
        }
        if (!top) continue;
        for (let k = 0; k < ncol.length; k++) {
          if (crowdHide[ncol[k]!] !== 1 && protrudesTop(ncol[k]!)) crowdHide[ncol[k]!] = 1;
        }
      }
    }
    trimTopWedges();
    crowdClear.clear();
    for (const [key, col] of crowdCols) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k < col.length; k++) {
        if (crowdHide[col[k]!] !== 1) continue;
        const r = Math.hypot(STANDS[col[k]!]!.x, STANDS[col[k]!]!.z);
        if (r < lo) lo = r;
        if (r > hi) hi = r;
      }
      if (lo <= hi) crowdClear.set(key, { r0: lo, r1: hi });
    }
    for (let i = 0; i < STANDS.length; i++) {
      const p = STANDS[i]!;
      const sc = crowdHide[i] === 1 ? 0.001 : 1;
      let hop = 0;
      if (brawl || (on && p.awayFan !== scoringHome)) {
        hop = 0.16 + 0.72 * Math.abs(Math.sin(t * 13.4 + i * 0.37));
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      dummy.position.y = p.y + PERSON_LIFT + hop;
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
    }
    seats.instanceMatrix.needsUpdate = true;
    crowd.instanceMatrix.needsUpdate = true;
    cheering.current = on;
  });

  return (
    <group>
      <instancedMesh ref={meshRef} args={[seatGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial color="#2a3340" roughness={0.82} />
      </instancedMesh>
      <instancedMesh ref={crowdRef} args={[personGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.75} />
      </instancedMesh>
    </group>
  );
}

function ribbonSegGeo(len: number, u0: number, u1: number) {
  const g = new THREE.PlaneGeometry(len, 0.92);
  const uv = g.attributes.uv;
  if (uv) {
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      uv.setX(i, u0 + (u1 - u0) * u);
    }
    uv.needsUpdate = true;
  }
  return g;
}

function StadiumRibbon({
  y = RIBBON_Y,
  inset = RIBBON_INSET,
  boardsOn = true,
}: {
  y?: number;
  inset?: number;
  boardsOn?: boolean;
}) {
  const home = kitById(useGame((s) => s.homeKit));
  const away = kitById(useGame((s) => s.awayKit));
  const homeScore = useGame((s) => s.homeScore);
  const awayScore = useGame((s) => s.awayScore);
  const goalSide = useGame((s) => s.goalSide);
  const clockMode = useGame((s) => s.clockMode);
  const periodClock = useGame((s) => s.periodClock);
  const ribbon = useMemo(() => createRibbonCanvas(), []);
  const board = useMemo(() => createScoreboardCanvas(), []);
  useLayoutEffect(
    () => () => {
      ribbon.texture.dispose();
      board.texture.dispose();
    },
    [ribbon, board],
  );

  const segs = useMemo(() => {
    const ring = rinkPerimeter(inset, 72);
    const out: { x: number; z: number; rot: number; len: number; u0: number; u1: number; geo: THREE.PlaneGeometry }[] =
      [];
    const module = 26;
    let acc = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      const nx = -dz / len;
      const nz = dx / len;
      const u0 = acc / module;
      const u1 = (acc + len) / module;
      out.push({
        x: (a.x + b.x) / 2 + nx * 0.04,
        z: (a.z + b.z) / 2 + nz * 0.04,
        rot: Math.atan2(nx, nz),
        len,
        u0,
        u1,
        geo: ribbonSegGeo(len * 1.02, u0, u1),
      });
      acc += len;
    }
    return out;
  }, [inset]);
  useLayoutEffect(() => () => segs.forEach((s) => s.geo.dispose()), [segs]);

  const fascia = useMemo(() => fasciaRing(inset), [inset]);
  const fasciaGroup = useRef<THREE.Group>(null);
  const segGroup = useRef<THREE.Group>(null);
  const boardGroup = useRef<THREE.Group>(null);

  const boards = useMemo(() => {
    const longs = segs.filter((s) => Math.abs(s.z) > 16);
    const pick = (xSign: number, zSign: number) =>
      longs
        .filter((s) => Math.sign(s.z) === zSign && s.x * xSign > 0)
        .sort((a, b) => Math.abs(a.x - xSign * 16) - Math.abs(b.x - xSign * 16))[0];
    return [pick(-1, 1), pick(1, 1), pick(-1, -1), pick(1, -1)].filter(
      (s): s is NonNullable<typeof s> => !!s,
    );
  }, [segs]);

  useFrame((_, dt) => {
    void dt;
    const scoring = world.goalSide ?? goalSide;
    const fill =
      scoring === "home" ? home.ribbon : scoring === "away" ? away.ribbon : home.ribbon;
    const lit = clockMode === "drill" ? world.drillCheer > 0 : !!scoring && world.goalTicker > 0;
    const opts = {
      homeJersey: home.jersey,
      homeStripe: home.stripe,
      awayJersey: away.jersey,
      awayStripe: away.stripe,
      fill: lit ? mixHex(fill, "#ffffff", 0.18) : fill,
      homeScore,
      awayScore,
      ticker: world.time,
      goal: lit,
      clock:
        clockMode === "scrimmage" || showsPeriodClock(clockMode)
          ? `${Math.floor(Math.max(0, periodClock) / 60)}:${String(Math.floor(Math.max(0, periodClock) % 60)).padStart(2, "0")}`
          : null,
    };
    ribbon.paint(opts);
    board.paint(opts);
    const fy = y - FASCIA_DROP;
    const shells = fasciaGroup.current;
    if (shells) {
      for (let i = 0; i < fascia.length; i++) {
        const mesh = shells.children[i];
        const p = fascia[i];
        if (!mesh || !p) continue;
        mesh.visible = !floatsInSight(p.x, fy, p.z);
      }
    }
    const bands = segGroup.current;
    if (bands) {
      for (let i = 0; i < segs.length; i++) {
        const mesh = bands.children[i];
        const s = segs[i];
        if (!mesh || !s) continue;
        mesh.visible = !floatsInSight(s.x, y, s.z);
      }
    }
    const leds = boardGroup.current;
    if (leds) {
      for (let i = 0; i < boards.length; i++) {
        const mesh = leds.children[i];
        const b = boards[i];
        if (!mesh || !b) continue;
        mesh.visible = !floatsInSight(b.x, y, b.z);
      }
    }
  });

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: ribbon.texture,
        toneMapped: false,
      }),
    [ribbon],
  );
  const boardMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: board.texture,
        toneMapped: false,
      }),
    [board],
  );
  const shell = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#141a22", roughness: 0.55, metalness: 0.2 }),
    [],
  );

  return (
    <group>
      <group ref={fasciaGroup}>
        {fascia.map((p, i) => (
          <mesh key={`fascia-${i}`} position={[p.x, y - FASCIA_DROP, p.z]} material={shell}>
            <boxGeometry args={[FASCIA_W, FASCIA_H, FASCIA_D]} />
          </mesh>
        ))}
      </group>
      <group ref={segGroup}>
        {segs.map((s, i) => (
          <mesh key={i} geometry={s.geo} position={[s.x, y, s.z]} rotation={[0, s.rot, 0]} material={mat} />
        ))}
      </group>
      {boardsOn ? (
        <group ref={boardGroup}>
          {boards.map((b, i) => (
            <mesh
              key={`led-${i}`}
              position={[b.x, y, b.z]}
              rotation={[0, b.rot, 0]}
              material={boardMat}
            >
              <planeGeometry args={[5.4, 0.98]} />
            </mesh>
          ))}
        </group>
      ) : null}
    </group>
  );
}

function LightRig({ look }: { look: ArenaLook }) {
  const dark = look === "dark";
  const home = kitById(useGame((s) => s.homeKit));
  const away = kitById(useGame((s) => s.awayKit));
  const hemi = useRef<THREE.HemisphereLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const party = useRef<THREE.PointLight>(null);
  const partyA = useRef<THREE.PointLight>(null);
  const partyB = useRef<THREE.PointLight>(null);
  const netGlow = useRef<THREE.SpotLight>(null);
  const spots: [number, number, number][] = [
    [0, dark ? 26 : 22, 10],
    [16, dark ? 28 : 24, 8],
    [-16, dark ? 28 : 24, 8],
    [16, dark ? 28 : 24, -8],
    [-16, dark ? 28 : 24, -8],
  ];
  useFrame(() => {
    const scored = world.goalTicker > 0 && !!world.goalSide;
    const drill = useGame.getState().clockMode === "drill";
    const partyOn = drill ? world.drillCheer > 0 : scored && world.goalSide === "home";
    const hex = world.goalSide === "away" ? away.ribbon : home.ribbon;
    const pulse = partyOn ? 0.48 + 0.52 * Math.abs(Math.sin(world.time * 9.4)) : 0;
    if (party.current) {
      party.current.color.set(hex);
      party.current.intensity = partyOn ? (dark ? 90 : 420) * (0.7 + pulse) : 0;
    }
    if (partyA.current) {
      partyA.current.color.set(hex);
      partyA.current.intensity = partyOn ? (dark ? 55 : 280) * pulse : 0;
    }
    if (partyB.current) {
      partyB.current.color.set(hex);
      partyB.current.intensity = partyOn ? (dark ? 55 : 280) * pulse : 0;
    }
    if (netGlow.current) {
      const netX = world.goalSide === "away" ? -GOAL_LINE_X : GOAL_LINE_X;
      netGlow.current.position.set(netX * 0.82, 12, 0);
      netGlow.current.target.position.set(netX, 0, 0);
      netGlow.current.target.updateMatrixWorld();
      netGlow.current.color.set(hex);
      const netOn = drill ? world.drillCheer > 0 : scored;
      netGlow.current.intensity = netOn ? (dark ? 140 : 640) * (partyOn ? pulse : 0.55) : 0;
    }
    if (amb.current) amb.current.intensity = (dark ? 0.62 : 0.5) + (partyOn ? 1.05 * pulse : 0);
    if (hemi.current) {
      if (partyOn) {
        hemi.current.color.set(hex);
        hemi.current.intensity = (dark ? 0.5 : 0.88) + 0.55 * pulse;
      } else {
        hemi.current.color.set(dark ? "#b4c4d4" : "#d4e0ec");
        hemi.current.intensity = dark ? 0.5 : 0.88;
      }
    }
  });
  return (
    <group>
      <hemisphereLight ref={hemi} args={dark ? ["#b4c4d4", "#2a2620", 0.5] : ["#d4e0ec", "#3a3428", 0.88]} />
      <ambientLight ref={amb} intensity={dark ? 0.62 : 0.5} />
      <directionalLight
        position={dark ? [8, 32, 6] : [10, 28, 8]}
        intensity={dark ? 0.95 : 1.75}
        color={dark ? "#efeae2" : "#f7f3ec"}
      />
      {spots.map((p, i) => (
        <group key={i}>
          <spotLight
            position={p}
            angle={dark ? 0.48 : 0.52}
            penumbra={dark ? 0.9 : 0.82}
            intensity={dark ? (i === 0 ? 90 : 48) : i === 0 ? 420 : 220}
            color={i === 0 ? (dark ? "#efe8dc" : "#f4efe4") : dark ? "#c8d2de" : "#dce6f2"}
            distance={90}
            decay={2}
          />
        </group>
      ))}
      <pointLight position={[0, dark ? 12 : 10, 0]} intensity={dark ? 8 : 40} color={dark ? "#b8c4d0" : "#cdd8e4"} distance={48} />
      <pointLight ref={party} position={[0, 9, 0]} intensity={0} distance={80} decay={1.6} />
      <pointLight ref={partyA} position={[18, 7, 0]} intensity={0} distance={55} decay={1.8} />
      <pointLight ref={partyB} position={[-18, 7, 0]} intensity={0} distance={55} decay={1.8} />
      <spotLight ref={netGlow} position={[GOAL_LINE_X, 12, 0]} angle={0.7} penumbra={0.55} intensity={0} distance={48} decay={1.5} />
    </group>
  );
}

function segmentHitsBox(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  const slabs: [number, number, number, number][] = [
    [ax, dx, minX, maxX],
    [ay, dy, minY, maxY],
    [az, dz, minZ, maxZ],
  ];
  for (const [o, d, mn, mx] of slabs) {
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return false;
      continue;
    }
    let r0 = (mn - o) / d;
    let r1 = (mx - o) / d;
    if (r0 > r1) {
      const tmp = r0;
      r0 = r1;
      r1 = tmp;
    }
    t0 = Math.max(t0, r0);
    t1 = Math.min(t1, r1);
    if (t0 > t1) return false;
  }
  return true;
}

function Jumbotron() {
  const cam = useGame((s) => s.camMode);
  const paused = useGame((s) => s.paused);
  const home = kitById(useGame((s) => s.homeKit));
  const away = kitById(useGame((s) => s.awayKit));
  const homeScore = useGame((s) => s.homeScore);
  const awayScore = useGame((s) => s.awayScore);
  const goalSide = useGame((s) => s.goalSide);
  const clockMode = useGame((s) => s.clockMode);
  const periodClock = useGame((s) => s.periodClock);
  const period = useGame((s) => s.period);
  const face = useMemo(() => createJumboFace(), []);
  useLayoutEffect(() => () => face.texture.dispose(), [face]);
  const root = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    stepJumboReplay(dt);
    const y = camera.position.y;
    const dist = camera.position.length();
    const xz = Math.hypot(camera.position.x, camera.position.z);
    const far = world.freeCam.radius > 36 || dist > 32;
    const overhead = y > JUMBO_Y - JUMBO_HH - 1.8 && xz < JUMBO_HW + 4;
    const minX = -JUMBO_HW;
    const maxX = JUMBO_HW;
    const minY = JUMBO_Y - JUMBO_HH;
    const maxY = JUMBO_Y + JUMBO_HH;
    const minZ = -JUMBO_HW;
    const maxZ = JUMBO_HW;
    const inside =
      camera.position.x > minX &&
      camera.position.x < maxX &&
      y > minY &&
      y < maxY &&
      camera.position.z > minZ &&
      camera.position.z < maxZ;
    const lookX = world.puck.x;
    const lookY = Math.max(0.35, world.puck.y);
    const lookZ = world.puck.z;
    const occludes =
      inside ||
      segmentHitsBox(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        lookX,
        lookY,
        lookZ,
        minX,
        minY,
        minZ,
        maxX,
        maxY,
        maxZ,
      ) ||
      segmentHitsBox(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        0,
        0.4,
        0,
        minX,
        minY,
        minZ,
        maxX,
        maxY,
        maxZ,
      );
    const celebrating = world.whistle === "goal";
    g.visible =
      cam !== "high" &&
      cam !== "classic" &&
      cam !== "chase" &&
      cam !== "broadcast" &&
      !overhead &&
      !occludes &&
      (celebrating || ((cam === "freestyle" || paused) && far));

    const scoring = world.goalSide ?? goalSide;
    const fill =
      scoring === "home" ? home.ribbon : scoring === "away" ? away.ribbon : home.ribbon;
    const lit = clockMode === "drill" ? world.drillCheer > 0 : !!scoring && world.goalTicker > 0;
    const replay = jumboReplayView();
    face.paint({
      homeJersey: home.jersey,
      homeStripe: home.stripe,
      awayJersey: away.jersey,
      awayStripe: away.stripe,
      fill: lit ? mixHex(fill, "#ffffff", 0.12) : fill,
      homeScore,
      awayScore,
      ticker: world.time,
      goal: lit,
      clock:
        clockMode === "scrimmage"
          ? `${Math.floor(Math.max(0, periodClock) / 60)}:${String(Math.floor(Math.max(0, periodClock) % 60)).padStart(2, "0")}`
          : showsPeriodClock(clockMode)
            ? `${periodOrdinal(period).toUpperCase()}  ${Math.floor(Math.max(0, periodClock) / 60)}:${String(Math.floor(Math.max(0, periodClock) % 60)).padStart(2, "0")}`
            : "—",
      puckX: replay?.puckX ?? world.puck.x,
      puckZ: replay?.puckZ ?? world.puck.z,
      players: replay?.players ?? world.skaters.map((s) => ({ x: s.x, z: s.z, home: s.side === "home" })),
    });
  });

  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: face.texture, toneMapped: false }),
    [face],
  );
  const shell = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0d1216", roughness: 0.48, metalness: 0.22 }),
    [],
  );
  const hw = JUMBO_HW;
  const hh = JUMBO_HH;
  const hd = JUMBO_HW;

  return (
    <group position={[0, JUMBO_Y, 0]} ref={root} visible={false}>
      <mesh material={shell}>
        <boxGeometry args={[hw * 2 - JUMBO_SHELL_SHRINK, hh * 2 - JUMBO_SHELL_SHRINK, hd * 2 - JUMBO_SHELL_SHRINK]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          material={mat}
          rotation={[0, (i * Math.PI) / 2, 0]}
          position={[
            Math.sin((i * Math.PI) / 2) * hw,
            0,
            Math.cos((i * Math.PI) / 2) * hd,
          ]}
        >
          <planeGeometry args={[hw * JUMBO_FACE_SCALE, hh * JUMBO_FACE_SCALE]} />
        </mesh>
      ))}
    </group>
  );
}

function PressBox() {
  const cam = useGame((s) => s.camMode);
  const shell = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2a3238", roughness: 0.55, metalness: 0.12 }),
    [],
  );
  const roof = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a444c", roughness: 0.48, metalness: 0.18 }),
    [],
  );
  const glass = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#9ec4d8",
        transparent: true,
        opacity: 0.42,
        roughness: 0.18,
        metalness: 0.08,
      }),
    [],
  );
  const frame = pressBoxFrame();
  const { y, z, boxH } = frame;
  const bayGroups = useRef<Array<THREE.Group | null>>([]);
  useFrame(() => {
    if (useGame.getState().camMode === "high") return;
    for (let i = 0; i < PRESS_BAYS.length; i++) {
      const g = bayGroups.current[i];
      const ox = PRESS_BAYS[i];
      if (!g || ox === undefined) continue;
      let hide = false;
      for (const dx of [0, -8.6, 8.6]) {
        const x = ox + dx;
        const pz = z + PRESS_SHELL.z;
        if (floatsInSight(x, y, pz) || floatsInSight(x, y + boxH * 0.46, pz)) {
          hide = true;
          break;
        }
      }
      g.visible = !hide;
    }
  });
  if (cam === "high") return null;
  const bay = (ox: number, i: number) => (
    <group
      key={ox}
      position={[ox, 0, 0]}
      ref={(node) => {
        bayGroups.current[i] = node;
      }}
    >
      <mesh material={shell} position={[0, 0, PRESS_SHELL.z]}>
        <boxGeometry args={[PRESS_SHELL.w, boxH, PRESS_SHELL.d]} />
      </mesh>
      <mesh material={roof} position={[0, boxH / 2 + PRESS_ROOF.lift, PRESS_ROOF.z]}>
        <boxGeometry args={[PRESS_ROOF.w, PRESS_ROOF.h, PRESS_ROOF.d]} />
      </mesh>
      {PRESS_GLASS_X.map((x) => (
        <mesh key={x} material={glass} position={[x, PRESS_GLASS.y, PRESS_GLASS.z]}>
          <boxGeometry args={[PRESS_GLASS.w, PRESS_GLASS.h, PRESS_GLASS.d]} />
        </mesh>
      ))}
    </group>
  );
  return (
    <group position={[0, y, z]}>
      {PRESS_BAYS.map((ox, i) => bay(ox, i))}
    </group>
  );
}

function Truss() {
  const cam = useGame((s) => s.camMode);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#1b222c", roughness: 0.55, metalness: 0.4 }),
    [],
  );
  const roof = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (roof.current) roof.current.position.set(0, 80, 0);
  });
  if (cam === "high") return null;
  return (
    <group>
      <mesh ref={roof} position={[0, 80, 0]} material={mat}>
        <boxGeometry args={[64, 0.35, 36]} />
      </mesh>
    </group>
  );
}

const BENCH_SKATERS = 9;
const BENCH_SEATS = BENCH_SKATERS + 1;
const HOME_BENCH_NUMS = [84, 62, 42, 25, 11, 10, 15, 18, 21];
const AWAY_BENCH_NUMS = [2, 4, 9, 14, 17, 19, 22, 27, 31];

/** 9 skaters plus one goalie. Index 0 of a −X bench is the end toward −X. */
function benchXs(end: -1 | 1): number[] {
  const inner = 0.88;
  const outer = 9.42;
  const xs: number[] = [];
  for (let i = 0; i < BENCH_SEATS; i++) xs.push(inner + ((outer - inner) * i) / (BENCH_SEATS - 1));
  if (end < 0) {
    xs.reverse();
    return xs.map((x) => -x);
  }
  return xs;
}

const HOME_BENCH_XS = benchXs(1);
const AWAY_BENCH_XS = benchXs(-1);

function penaltyBoxWidth(n: number): number {
  return n <= 2 ? 2.6 : Math.min(5.1, 1.15 + n * 0.96);
}

function PenaltyBox({
  x,
  z,
  sitters,
}: {
  x: number;
  z: number;
  sitters?: { kit: ReturnType<typeof kitById>; number: number }[];
}) {
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#cfd5dc", roughness: 0.5 }), []);
  const glass = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c8d8e8",
        transparent: true,
        opacity: 0.28,
        roughness: 0.12,
        metalness: 0.08,
      }),
    [],
  );
  const n = sitters?.length ?? 0;
  const w = penaltyBoxWidth(n);
  const gY = BOARD_H + GLASS_H / 2;
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 0.56, -0.12]} material={wood}>
        <boxGeometry args={[w, 0.1, 0.55]} />
      </mesh>
      <mesh position={[0, 0.28, -0.32]} material={wood}>
        <boxGeometry args={[w, 0.56, 0.22]} />
      </mesh>
      <mesh position={[0, gY, -0.52]} material={glass}>
        <boxGeometry args={[w - 0.05, GLASS_H, 0.06]} />
      </mesh>
      <mesh position={[-(w / 2 - 0.05), gY, 0]} material={glass}>
        <boxGeometry args={[0.06, GLASS_H, 1.1]} />
      </mesh>
      <mesh position={[w / 2 - 0.05, gY, 0]} material={glass}>
        <boxGeometry args={[0.06, GLASS_H, 1.1]} />
      </mesh>
      {sitters?.map((s, i) => (
        <group
          key={`${s.number}-${s.kit.id}`}
          position={[n <= 1 ? 0 : (i - (n - 1) / 2) * 0.92, 0.61, -0.18]}
        >
          <SeatedPlayer kit={s.kit} number={s.number} holdStick={i % 2 === 0} />
        </group>
      ))}
    </group>
  );
}

function BenchReporter() {
  const shell = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c0c6ce", metalness: 0.46, roughness: 0.34 }),
    [],
  );
  const plate = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#8e969e", metalness: 0.4, roughness: 0.42 }),
    [],
  );
  const joint = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a424c", metalness: 0.36, roughness: 0.48 }),
    [],
  );
  return (
    <group scale={[1, 1.0862, 1]}>
      {[-0.09, 0.09].map((x) => (
        <mesh key={`foot${x}`} position={[x, 0.035, 0.02]} material={plate}>
          <boxGeometry args={[0.12, 0.07, 0.2]} />
        </mesh>
      ))}
      {[-0.09, 0.09].map((x) => (
        <mesh key={`shin${x}`} position={[x, 0.26, 0]} material={shell}>
          <boxGeometry args={[0.08, 0.38, 0.09]} />
        </mesh>
      ))}
      {[-0.09, 0.09].map((x) => (
        <mesh key={`knee${x}`} position={[x, 0.46, 0]} rotation={[0, 0, Math.PI / 2]} material={joint}>
          <capsuleGeometry args={[0.048, 0.02, 3, 6]} />
        </mesh>
      ))}
      {[-0.09, 0.09].map((x) => (
        <mesh key={`thigh${x}`} position={[x, 0.66, 0]} material={shell}>
          <boxGeometry args={[0.1, 0.34, 0.11]} />
        </mesh>
      ))}
      <mesh position={[0, 0.86, 0]} material={joint}>
        <boxGeometry args={[0.28, 0.08, 0.14]} />
      </mesh>
      <mesh position={[0, 1.16, 0]} material={shell}>
        <boxGeometry args={[0.32, 0.5, 0.18]} />
      </mesh>
      <mesh position={[0, 1.18, 0.105]} material={plate}>
        <boxGeometry args={[0.18, 0.22, 0.02]} />
      </mesh>
      <mesh position={[0, 1.46, 0]} material={joint}>
        <capsuleGeometry args={[0.04, 0.05, 3, 6]} />
      </mesh>
      <mesh position={[0, 1.6, 0]} material={shell}>
        <boxGeometry args={[0.18, 0.16, 0.16]} />
      </mesh>
      <mesh position={[0, 1.625, 0.09]} material={joint}>
        <boxGeometry args={[0.11, 0.032, 0.016]} />
      </mesh>
      <mesh position={[0, 1.74, 0]} material={plate}>
        <capsuleGeometry args={[0.012, 0.11, 2, 5]} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.175, 1.34, 0]} rotation={[0, 0, Math.PI / 2]} material={joint}>
            <capsuleGeometry args={[0.042, 0.02, 3, 6]} />
          </mesh>
          <mesh position={[side * 0.215, 1.18, 0]} material={shell}>
            <boxGeometry args={[0.055, 0.26, 0.07]} />
          </mesh>
          <mesh position={[side * 0.215, 1.02, 0]} rotation={[0, 0, Math.PI / 2]} material={joint}>
            <capsuleGeometry args={[0.034, 0.01, 3, 6]} />
          </mesh>
          <mesh position={[side * 0.215, 0.85, 0.01]} material={plate}>
            <boxGeometry args={[0.05, 0.26, 0.06]} />
          </mesh>
          <mesh position={[side * 0.215, 0.685, 0.02]} material={shell}>
            <boxGeometry args={[0.055, 0.06, 0.065]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Benches() {
  const home = kitById(useGame((s) => s.homeKit));
  const away = kitById(useGame((s) => s.awayKit));
  const liveHome = useGame((s) => s.liveHome);
  const liveAway = useGame((s) => s.liveAway);
  useGame((s) => s.lineupRev);
  const clockMode = useGame((s) => s.clockMode);
  const homeBox =
    clockMode === "practice" || clockMode === "drill" ? [] : penaltyNumbers("home", liveHome);
  const awayBox =
    clockMode === "practice" || clockMode === "drill" ? [] : penaltyNumbers("away", liveAway);
  const homeGSlot = defendDir("home") < 0 ? 0 : HOME_BENCH_XS.length - 1;
  const awayGSlot = defendDir("away") < 0 ? 0 : AWAY_BENCH_XS.length - 1;
  const homeGNum = benchGoalieNumber("home", liveHome.g);
  const awayGNum = benchGoalieNumber("away", liveAway.g);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d8dde3", roughness: 0.5 }), []);
  const glass = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c8d8e8",
        transparent: true,
        opacity: 0.22,
        roughness: 0.12,
        metalness: 0.08,
      }),
    [],
  );
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c8102e", roughness: 0.42, metalness: 0.08 }),
    [],
  );
  const zBench = -RINK_W / 2 - 1.58;
  const zBox = RINK_W / 2 + 1.55;
  const gY = BOARD_H + GLASS_H / 2;
  const benchOuter = 9.8;
  const benchInner = 0.52;
  const benchSpan = benchOuter - benchInner;
  const benchMid = (benchOuter + benchInner) / 2;
  const postH = BOARD_H + GLASS_H - 4 * FT;
  const postW = 0.18;
  const postX = benchInner - 0.04 - postW / 2;
  const zPost = zBench + 0.37;
  return (
    <group>
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * benchMid, 0, zBench]}>
          <mesh position={[0, 0.7, 0.08]} material={wood}>
            <boxGeometry args={[benchSpan, 0.1, 0.58]} />
          </mesh>
          <mesh position={[0, 0.34, -0.22]} material={wood}>
            <boxGeometry args={[benchSpan, 0.68, 0.28]} />
          </mesh>
          <mesh position={[0, 0.7, -0.48]} material={wood}>
            <boxGeometry args={[benchSpan, 0.22, 0.12]} />
          </mesh>
          <mesh position={[0, gY, -0.62]} material={glass}>
            <boxGeometry args={[benchSpan, GLASS_H, 0.06]} />
          </mesh>
        </group>
      ))}
      <mesh position={[-benchOuter, gY, zBench - 0.18]} material={glass}>
        <boxGeometry args={[0.06, GLASS_H, 1.05]} />
      </mesh>
      <mesh position={[benchOuter, gY, zBench - 0.18]} material={glass}>
        <boxGeometry args={[0.06, GLASS_H, 1.05]} />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <mesh key={`post${side}`} position={[side * postX, postH / 2, zPost]} material={postMat}>
          <boxGeometry args={[postW, postH, 0.28]} />
        </mesh>
      ))}
      <group position={[0, 0, zPost]}>
        <BenchReporter />
      </group>
      {/* Same pose on both benches. Stick side is not flipped toward center ice. */}
      {HOME_BENCH_XS.map((x, i) => {
        const goalie = i === homeGSlot;
        const number = goalie ? homeGNum : HOME_BENCH_NUMS[i < homeGSlot ? i : i - 1]!;
        return (
          <group key={`h${i}`} position={[x, 0.75, zBench - 0.04]}>
            <SeatedPlayer kit={home} number={number} holdStick={!goalie} goalie={goalie} seatX={x} poseId={goalie ? "goalieBench" : "bench"} />
          </group>
        );
      })}
      {AWAY_BENCH_XS.map((x, i) => {
        const goalie = i === awayGSlot;
        const number = goalie ? awayGNum : AWAY_BENCH_NUMS[i < awayGSlot ? i : i - 1]!;
        return (
          <group key={`a${i}`} position={[x, 0.75, zBench - 0.04]}>
            <SeatedPlayer kit={away} number={number} holdStick={!goalie} goalie={goalie} seatX={x} poseId={goalie ? "goalieBench" : "bench"} />
          </group>
        );
      })}
      <PenaltyBox
        x={-(penaltyBoxWidth(homeBox.length) / 2 + 0.05)}
        z={zBox}
        sitters={homeBox.map((number) => ({ kit: home, number }))}
      />
      <PenaltyBox
        x={penaltyBoxWidth(awayBox.length) / 2 + 0.05}
        z={zBox}
        sitters={awayBox.map((number) => ({ kit: away, number }))}
      />
    </group>
  );
}

export function Arena() {
  const look = useGame((s) => s.arenaLook);
  const cam = useGame((s) => s.camMode);
  const env = useMemo(() => createArenaEnv(look), [look]);
  useLayoutEffect(() => () => env.dispose(), [env]);
  const overhead = cam === "high";

  return (
    <group>
      <primitive object={env} attach="environment" />
      <LightRig look={look} />
      <SeatDeck />
      {overhead ? null : (
        <>
          <StadiumRibbon />
          <StadiumRibbon y={RIBBON_Y2} inset={RIBBON_INSET2} boardsOn={false} />
        </>
      )}
      <PressBox />
      <Jumbotron />
      <Truss />
      <Benches />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[BOWL_WALL.floorL, BOWL_WALL.floorW]} />
        <meshStandardMaterial color="#12161c" roughness={0.9} />
      </mesh>
      <mesh position={[0, BOWL_WALL.y, 0]}>
        <cylinderGeometry args={[BOWL_WALL.topR, BOWL_WALL.bottomR, BOWL_WALL.height, 48, 1, true]} />
        <meshStandardMaterial color="#151b24" side={THREE.BackSide} roughness={0.85} />
      </mesh>
    </group>
  );
}
