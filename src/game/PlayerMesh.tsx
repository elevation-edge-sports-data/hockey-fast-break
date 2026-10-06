import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createNetTexture, createNumberTexture } from "./iceTexture";
import { attackDir, cheerFor, defendDir, drillFade, faceYaw, goalieButterflyPose, goaliePlaysPuck, goalieZKind, noteGoalieMidBlade, rageDraw, world, type Referee, type Skater } from "./sim";
import { GOALIE_BUTTERFLY_BLADE_LEAD, GOALIE_Z, GOALIE_Z_BLADE_LEAD, poseGoalieButterflyArms, poseGoalieButterflyLimbs, poseGoalieHand, poseGoalieButterflyStanceLimbs, poseGoaliePlay, poseGoalieZArms, poseGoalieZLimbs } from "./goalieStance";
import { SKATER_GRIP_BOT, SKATER_GRIP_TOP, SKATER_STICK_LEN, carryStickAim, dekePull, dekeStickAim, shotStickAim, stickFrame, type StickAim } from "./stickSide";
import { kitById, type UniformKit } from "./uniforms";
import { useGame } from "./store";
import { BLUE_X, GOAL_H, GOAL_LINE_X } from "./rink";

export const USER_MARK_INNER = 0.44;
export const USER_MARK_OUTER = 0.54;
/** Ice disc under the puck. The ring around it starts at the inner radius. */
export const PUCK_MARK_INNER = 0.15;
export const PUCK_MARK_OUTER = 0.22;

const helmetGeo = new THREE.SphereGeometry(0.132, 18, 14);
const neckGeo = new THREE.CylinderGeometry(0.07, 0.085, 0.14, 10);
const visorGeo = new THREE.BoxGeometry(0.2, 0.07, 0.08);
const torsoGeo = new THREE.BoxGeometry(0.44, 0.64, 0.3);
const yokeGeo = new THREE.BoxGeometry(0.16, 0.12, 0.26);
const yokeChestGeo = new THREE.BoxGeometry(0.46, 0.13, 0.32);
const pantsGeo = new THREE.BoxGeometry(0.36, 0.2, 0.24);
/** Jersey width, 1cm inside the jersey depth. Height keeps the thigh cap inside a tumble pitch. */
const skaterPantsGeo = new THREE.BoxGeometry(0.44, 0.28, 0.28);
const pantStripeGeo = new THREE.BoxGeometry(0.012, 0.2, 0.08);
/** Inside skaterPantsGeo. ±0.20 left the thigh cap outside the pelvis on a hit. */
const SKATER_HIP_X = 0.12;
const SKATER_HIP_Y = 0.86;
/** Slide lean. Leg roots stay at the hip socket; the knee and this pitch do the fold. */
const DIVE_PITCH = 1.1;
const DIVE_DROP = -0.287;
const DIVE_THIGH = 0.1;
const DIVE_KNEE = 0.7;
const DIVE_BOOT = -(DIVE_PITCH + DIVE_THIGH + DIVE_KNEE);
/** Goalie slide. Pad hips stay at y=0.82; the thigh does not cancel this pitch. */
const GOALIE_DIVE_PITCH = 1.05;
const GOALIE_DIVE_DROP = -0.18;
const GOALIE_DIVE_THIGH = 0;
const GOALIE_DIVE_KNEE = 1.0;
const thighStripeGeo = new THREE.BoxGeometry(0.01, 0.34, 0.036);
const thighGeo = new THREE.BoxGeometry(0.16, 0.34, 0.18);
const shinGeo = new THREE.BoxGeometry(0.14, 0.3, 0.16);
const bootGeo = new THREE.BoxGeometry(0.14, 0.1, 0.32);
const bladeGeo = new THREE.BoxGeometry(0.03, 0.035, 0.32);
const skateFrameGeo = new THREE.BoxGeometry(0.046, 0.014, 0.26);
const goalieFrameGeo = new THREE.BoxGeometry(0.055, 0.014, 0.2);
const wheelTireGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.034, 12);
const wheelHubGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.048, 8);
const SKATE_WHEEL_Z = [-0.108, -0.036, 0.036, 0.108] as const;
const GOALIE_WHEEL_Z = [-0.078, -0.026, 0.026, 0.078] as const;
const upperArmGeo = new THREE.BoxGeometry(0.12, 0.28, 0.14);
const armStripeGeo = new THREE.BoxGeometry(0.135, 0.055, 0.155);
const forearmGeo = new THREE.BoxGeometry(0.11, 0.26, 0.13);
const gloveGeo = new THREE.BoxGeometry(0.14, 0.12, 0.16);
const sockStripeGeo = new THREE.BoxGeometry(0.145, 0.04, 0.165);
const goaliePadThighGeo = new THREE.BoxGeometry(0.22, 0.34, 0.12);
const goaliePadKneeGeo = new THREE.BoxGeometry(0.23, 0.09, 0.13);
const goalieBootGeo = new THREE.BoxGeometry(0.16, 0.09, 0.28);
/** Shin pad in the shin frame: length along Y, wide face toward +Z, short returns on ±X. */
const GOALIE_SHIN_HALF_W = 0.15;
const GOALIE_SHIN_HALF_L = 0.22;
const GOALIE_SHIN_FRONT_Z = 0.024;
const GOALIE_SHIN_BACK_Z = -0.012;
const GOALIE_SHIN_MESH_Z = 0.02;
/** Under the knee pivot, level with the bottom of the knee block. */
const GOALIE_KNEE_DROP = 0.03;
const GOALIE_SHIN_LIFT = GOALIE_SHIN_HALF_W - GOALIE_KNEE_DROP;
/** Blade center is 0.06 under the boot; bladeGeo extends another 0.0175. */
const GOALIE_BOOT_LIFT = 0.06 + 0.0175 - GOALIE_KNEE_DROP;

function goaliePadQuad(pos: number[], nor: number[], a: readonly [number, number, number], b: readonly [number, number, number], c: readonly [number, number, number], d: readonly [number, number, number]) {
  const e1x = b[0] - a[0];
  const e1y = b[1] - a[1];
  const e1z = b[2] - a[2];
  const e2x = d[0] - a[0];
  const e2y = d[1] - a[1];
  const e2z = d[2] - a[2];
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  for (const v of [a, b, c, a, c, d]) {
    pos.push(v[0], v[1], v[2]);
    nor.push(nx, ny, nz);
  }
}

function makeGoalieShinPad(): THREE.BufferGeometry {
  const y0 = -GOALIE_SHIN_HALF_L;
  const y1 = GOALIE_SHIN_HALF_L;
  const bl: [number, number, number] = [-GOALIE_SHIN_HALF_W, y0, GOALIE_SHIN_FRONT_Z];
  const br: [number, number, number] = [GOALIE_SHIN_HALF_W, y0, GOALIE_SHIN_FRONT_Z];
  const tr: [number, number, number] = [GOALIE_SHIN_HALF_W, y1, GOALIE_SHIN_FRONT_Z];
  const tl: [number, number, number] = [-GOALIE_SHIN_HALF_W, y1, GOALIE_SHIN_FRONT_Z];
  const blb: [number, number, number] = [-GOALIE_SHIN_HALF_W, y0, GOALIE_SHIN_BACK_Z];
  const brb: [number, number, number] = [GOALIE_SHIN_HALF_W, y0, GOALIE_SHIN_BACK_Z];
  const trb: [number, number, number] = [GOALIE_SHIN_HALF_W, y1, GOALIE_SHIN_BACK_Z];
  const tlb: [number, number, number] = [-GOALIE_SHIN_HALF_W, y1, GOALIE_SHIN_BACK_Z];
  const pos: number[] = [];
  const nor: number[] = [];
  goaliePadQuad(pos, nor, bl, br, tr, tl);
  goaliePadQuad(pos, nor, br, brb, trb, tr);
  goaliePadQuad(pos, nor, blb, bl, tl, tlb);
  goaliePadQuad(pos, nor, tlb, trb, brb, blb);
  goaliePadQuad(pos, nor, tl, tr, trb, tlb);
  goaliePadQuad(pos, nor, bl, blb, brb, br);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.computeBoundingSphere();
  return geo;
}

const goaliePadShinGeo = makeGoalieShinPad();
const maskPlateGeo = new THREE.BoxGeometry(0.24, 0.2, 0.07);
const maskBarH = new THREE.BoxGeometry(0.2, 0.016, 0.016);
const maskBarV = new THREE.BoxGeometry(0.016, 0.16, 0.016);
const catcherWebGeo = new THREE.BoxGeometry(0.16, 0.2, 0.04);
const catcherCuffGeo = new THREE.BoxGeometry(0.14, 0.1, 0.13);
const catcherThumbGeo = new THREE.BoxGeometry(0.08, 0.17, 0.08);
/** Leather behind the pocket. The rim sits in front of this and frames the opening. */
const catcherBackGeo = new THREE.BoxGeometry(0.26, 0.24, 0.028);
const catcherRimXGeo = new THREE.BoxGeometry(0.05, 0.24, 0.055);
const catcherRimYGeo = new THREE.BoxGeometry(0.16, 0.045, 0.055);
/** Same white as the goal-net mesh in Rink.tsx. */
const NET_WHITE = "#e8eef4";

/**
 * Pocket shell, built like the goal cage: a quad grid the net texture sits on.
 * The center bows toward local -Z, into the glove. Winding faces +Z (the shooter).
 * Check: the center vertex normal is (0, 0, 1).
 */
function makeCatcherPocketNet() {
  const w = 0.18;
  const h = 0.17;
  const segs = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= segs; j++) {
    const v = j / segs;
    const y = (v - 0.5) * h;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const x = (u - 0.5) * w;
      const dx = u - 0.5;
      const dy = v - 0.5;
      const z = -0.014 * (1 - 4 * dx * dx) * (1 - 4 * dy * dy);
      pos.push(x, y, z);
      uv.push(u, v);
    }
  }
  const cols = segs + 1;
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c0 = a + cols;
      const d = c0 + 1;
      idx.push(a, b, c0, b, d, c0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const catcherPocketNetGeo = makeCatcherPocketNet();
let pocketNetTex: THREE.CanvasTexture | null = null;

function pocketNetTexture(): THREE.CanvasTexture {
  if (!pocketNetTex) {
    pocketNetTex = createNetTexture();
    pocketNetTex.repeat.set(1, 1);
  }
  return pocketNetTex;
}

const blockerBoardGeo = new THREE.BoxGeometry(0.055, 0.36, 0.18);
const blockerCuffGeo = new THREE.BoxGeometry(0.14, 0.12, 0.18);
const stickShaftGeo = new THREE.CylinderGeometry(0.009, 0.014, 1, 8);
const bladePlateGeo = new THREE.BoxGeometry(0.075, 0.052, 0.38);
const bladeToeGeo = new THREE.BoxGeometry(0.06, 0.048, 0.08);
const heelJoinGeo = new THREE.BoxGeometry(0.04, 0.05, 0.08);
const knobGeo = new THREE.BoxGeometry(0.036, 0.026, 0.036);
/** Wide lower stick. Length is 1 so the shaft group can scale it. */
const goaliePaddleGeo = new THREE.BoxGeometry(0.1, 1, 0.04);
/** Ice blade: a few centimeters tall, long axis along local +Z. */
const goalieIceGeo = new THREE.BoxGeometry(0.09, 0.032, 0.26);
const numPlane = new THREE.PlaneGeometry(0.28, 0.28);
const shadowGeo = new THREE.CircleGeometry(0.42, 16);
const puckDiscGeo = new THREE.CircleGeometry(PUCK_MARK_INNER, 28);
const puckRingGeo = new THREE.RingGeometry(PUCK_MARK_INNER, PUCK_MARK_OUTER, 32);
const puckShadowGeo = new THREE.CircleGeometry(0.08, 12);
const ringGeo = new THREE.RingGeometry(USER_MARK_INNER, USER_MARK_OUTER, 48);
const goalieRingGeo = new THREE.RingGeometry(1.02, 1.38, 48);
const goalieDiscGeo = new THREE.CircleGeometry(1.08, 32);
const _fromY = new THREE.Vector3(0, 1, 0);
const _ikDown = new THREE.Vector3(0, -1, 0);
const _ikTo = new THREE.Vector3();
const _ikPole = new THREE.Vector3();
const _ikN = new THREE.Vector3();
const _ikElbow = new THREE.Vector3();
const _ikD1 = new THREE.Vector3();
const _ikD2 = new THREE.Vector3();
const _ikInv = new THREE.Quaternion();
const _handTop = new THREE.Vector3();
const _handBot = new THREE.Vector3();
const _stickM = new THREE.Matrix4();
const _stickQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _liftAxis = new THREE.Vector3();
const _liftPt = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _goaliePalmAxis = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0.1, 0.16, 0.22)).normalize();
const _goalieBoardAxis = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0.12, 0, 0)).normalize();
const _blendQ = new THREE.Quaternion();
const _blendP = new THREE.Vector3();
const _euler = new THREE.Euler();
const _rinkShadowPos = new THREE.Vector3();
const _rinkShadowScale = new THREE.Vector3();
const _rinkShadowParentQ = new THREE.Quaternion();
const _rinkShadowZ = new THREE.Vector3();
const _rinkShadowX = new THREE.Vector3();
const _rinkShadowWorld = new THREE.Matrix4();
const _rinkShadowFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const SHADOW_ICE_Y = 0.015;
const STICK_ICE_Y = 0.03;
const GOALIE_STICK_LEN = 1.02;
/** Grip in body space: in front of the chest (+Z) and out on the blocker side (−X). */
const GOALIE_GRIP = { x: -0.38, y: 1.15, z: 0.4 } as const;
const _goalieCarryQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.15);
const _padBox = new THREE.Box3();
const _padFwd = new THREE.Vector3();
const _padCatch = new THREE.Vector3();
const _padUp = new THREE.Vector3(0, 1, 0);
const _padRoot = new THREE.Vector3();
const _padQ = new THREE.Quaternion();
const _shinX = new THREE.Vector3();
const _shinY = new THREE.Vector3();
const _shinZ = new THREE.Vector3();
const _shinBasis = new THREE.Matrix4();
const _legInv = new THREE.Quaternion();
const _rootQ = new THREE.Quaternion();
const _bootX = new THREE.Vector3();
const _bootY = new THREE.Vector3();
const _bootZ = new THREE.Vector3();
const _bootQ = new THREE.Quaternion();
const _bootBasis = new THREE.Matrix4();
const CARRY_HIP = (18 * Math.PI) / 180;
const CARRY_KNEE = (40 * Math.PI) / 180;
const CARRY_DROP = -0.163;
const CARRY_BOOT = -(CARRY_HIP + CARRY_KNEE);
const CARRY_SHAFT_PITCH = (55 * Math.PI) / 180;
const STRIDE_ARM = 0.02;
const DEKE_BLADE_YAW = (-8 * Math.PI) / 180;
const DEKE_HIP_YAW = (-12 * Math.PI) / 180;
const DEKE_SHOULDER = -0.05;

/** Drive side > 0 is about 25–45°. Glide side < 0 is about 15–25°. */
function strideKnee(side: number): number {
  if (side >= 0) return ((25 + 20 * side) * Math.PI) / 180;
  return ((25 + 10 * side) * Math.PI) / 180;
}

/** Hip pitch that plants a level skate for this knee flex. 15° knee → 15° thigh, 45° → -3.5°. */
function strideThigh(knee: number): number {
  const kneeDeg = (knee * 180) / Math.PI;
  const thighDeg = 15 - (kneeDeg - 15) * (18.5 / 30);
  return (thighDeg * Math.PI) / 180;
}
const READY_SHAFT_PITCH = (40 * Math.PI) / 180;
const POKE_HIP = (10 * Math.PI) / 180;
const POKE_TILT = (50 * Math.PI) / 180;
const POKE_FRONT_KNEE = (16 * Math.PI) / 180;
const POKE_BACK_KNEE = (46 * Math.PI) / 180;
const POKE_RELEASE = 0.15;
const RAGE_HX = 0.14;
const RAGE_HY = 1.2;
const RAGE_HZ = 0.34;

function mat(color: string, extras: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.04,
    envMapIntensity: 0.85,
    ...extras,
  });
}

type KitMats = {
  helmet: THREE.MeshStandardMaterial;
  visor: THREE.MeshStandardMaterial;
  jersey: THREE.MeshStandardMaterial;
  yoke: THREE.MeshStandardMaterial;
  sleeves: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  stripe: THREE.MeshStandardMaterial;
  socks: THREE.MeshStandardMaterial;
  gloves: THREE.MeshStandardMaterial;
  skates: THREE.MeshStandardMaterial;
  blade: THREE.MeshStandardMaterial;
  stick: THREE.MeshStandardMaterial;
  tape: THREE.MeshStandardMaterial;
  number: THREE.MeshBasicMaterial;
  shadow: THREE.MeshBasicMaterial;
  ring: THREE.MeshBasicMaterial;
  ringFill: THREE.MeshBasicMaterial;
  blocker: THREE.MeshStandardMaterial;
  catcher: THREE.MeshStandardMaterial;
  catcherWeb: THREE.MeshStandardMaterial;
  catcherMesh: THREE.MeshBasicMaterial;
  pads: THREE.MeshStandardMaterial;
  mask: THREE.MeshStandardMaterial;
  numberMap: THREE.CanvasTexture;
};

function hexChannel(hex: string, i: number): number {
  const h = hex.trim().replace("#", "");
  const p = h.length === 3 ? `${h[i] ?? "0"}${h[i] ?? "0"}` : h.slice(i * 2, i * 2 + 2);
  const n = Number.parseInt(p, 16);
  return Number.isNaN(n) ? 0 : n;
}

/** High and gray, so the net white would sit on top of itself. */
function isNearWhite(hex: string): boolean {
  const r = hexChannel(hex, 0);
  const g = hexChannel(hex, 1);
  const b = hexChannel(hex, 2);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min >= 200 && max - min <= 40;
}

/** Net white against colored leather. A white glove uses the first other kit color. */
function catcherPocketColor(kit: UniformKit, glove: string): string {
  if (!isNearWhite(glove)) return NET_WHITE;
  const used = [kit.yoke, kit.pants, kit.stripe, kit.sleeves, kit.socks, kit.gloves, kit.helmet, kit.crowdPri, kit.crowdSec, kit.ribbon, kit.number, kit.numberOutline];
  for (const c of used) if (!isNearWhite(c)) return c;
  return NET_WHITE;
}

function goaliePadColor(kit: UniformKit): string {
  const pants = kit.pants.toLowerCase();
  const primary = kit.crowdPri.toLowerCase();
  const secondary = kit.crowdSec.toLowerCase();
  if (primary !== secondary && pants === primary) return kit.crowdSec;
  if (primary !== secondary && pants === secondary) return kit.crowdPri;
  return pants === kit.jersey.toLowerCase() ? kit.yoke : kit.jersey;
}

function makeKitMats(kit: UniformKit, num: number, goalie = false): KitMats {
  const numberMap = createNumberTexture(num, kit.number, kit.numberOutline);
  const pad = kit.jersey;
  const legPad = goalie ? goaliePadColor(kit) : pad;
  return {
    helmet: mat(goalie ? pad : kit.helmet, {
      roughness: 0.26,
      metalness: 0.14,
      envMapIntensity: 1.2,
      emissive: goalie ? pad : kit.helmet,
      emissiveIntensity: 0.18,
    }),
    visor: new THREE.MeshStandardMaterial({
      color: kit.visor,
      roughness: 0.08,
      metalness: 0.4,
      transparent: true,
      opacity: 0.72,
    }),
    jersey: mat(kit.jersey, {
      roughness: 0.48,
      envMapIntensity: 1.4,
      emissive: kit.jersey,
      emissiveIntensity: 0.28,
    }),
    yoke: mat(kit.yoke, {
      roughness: 0.46,
      envMapIntensity: 1.4,
      emissive: kit.yoke,
      emissiveIntensity: 0.26,
    }),
    sleeves: mat(kit.sleeves, {
      roughness: 0.48,
      envMapIntensity: 1.4,
      emissive: kit.sleeves,
      emissiveIntensity: 0.28,
    }),
    pants: mat(kit.pants, {
      roughness: 0.5,
      envMapIntensity: 1.35,
      emissive: kit.pants,
      emissiveIntensity: 0.22,
      transparent: false,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    stripe: mat(kit.stripe, {
      roughness: 0.48,
      envMapIntensity: 1.4,
      emissive: kit.stripe,
      emissiveIntensity: 0.3,
    }),
    socks: mat(kit.socks, {
      roughness: 0.5,
      envMapIntensity: 1.3,
      emissive: kit.socks,
      emissiveIntensity: 0.24,
    }),
    gloves: mat(kit.gloves, {
      roughness: 0.48,
      envMapIntensity: 1.25,
      emissive: kit.gloves,
      emissiveIntensity: 0.2,
    }),
    skates: mat(kit.skates, { roughness: 0.4, metalness: 0.12 }),
    blade: mat("#c5ccd4", {
      roughness: 0.38,
      metalness: 0.28,
      emissive: "#9aa3ab",
      emissiveIntensity: 0.22,
    }),
    stick: mat(kit.stick, { roughness: 0.4 }),
    tape: mat(kit.tape, { roughness: 0.8 }),
    number: new THREE.MeshBasicMaterial({
      map: numberMap,
      transparent: true,
      alphaTest: 0.12,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    shadow: new THREE.MeshBasicMaterial({
      color: "#000000",
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
    ring: new THREE.MeshBasicMaterial({
      color: kit.ribbon,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    ringFill: new THREE.MeshBasicMaterial({
      color: kit.ribbon,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    blocker: mat(goalie ? pad : "#f2ece0", { roughness: 0.48 }),
    catcher: mat(goalie ? pad : "#6b3a24", { roughness: 0.58 }),
    catcherWeb: mat(goalie ? pad : "#d9c39a", { roughness: 0.72 }),
    catcherMesh: new THREE.MeshBasicMaterial({
      color: catcherPocketColor(kit, goalie ? pad : "#6b3a24"),
      map: pocketNetTexture(),
      transparent: true,
      opacity: 0.7,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    pads: mat(legPad, {
      roughness: 0.48,
      envMapIntensity: 1.25,
      emissive: legPad,
      emissiveIntensity: 0.22,
    }),
    mask: mat("#121212", { roughness: 0.42, metalness: 0.18 }),
    numberMap,
  };
}

function disposeKit(m: KitMats) {
  m.helmet.dispose();
  m.visor.dispose();
  m.jersey.dispose();
  m.yoke.dispose();
  m.sleeves.dispose();
  m.pants.dispose();
  m.stripe.dispose();
  m.socks.dispose();
  m.gloves.dispose();
  m.skates.dispose();
  m.blade.dispose();
  m.stick.dispose();
  m.tape.dispose();
  m.number.dispose();
  m.shadow.dispose();
  m.ring.dispose();
  m.ringFill.dispose();
  m.blocker.dispose();
  m.catcher.dispose();
  m.catcherWeb.dispose();
  m.catcherMesh.dispose();
  m.pads.dispose();
  m.mask.dispose();
  m.numberMap.dispose();
}

function stickLayout(goalie: boolean) {
  const len = goalie ? GOALIE_STICK_LEN : SKATER_STICK_LEN;
  const heel: [number, number, number] = [0, 0, 0];
  const top: [number, number, number] = [0, len, 0];
  const bot: [number, number, number] = [0, len * 0.42, 0];
  const mid: [number, number, number] = [0, len * 0.5, 0];
  const quat = new THREE.Quaternion();
  return { heel, top, bot, mid, quat, len };
}

function applyStickAim(stick: THREE.Group, aim: StickAim) {
  const f = stickFrame(aim);
  _ikN.set(f.axisX.x, f.axisX.y, f.axisX.z);
  _ikD1.set(f.axisY.x, f.axisY.y, f.axisY.z);
  _ikD2.set(f.axisZ.x, f.axisZ.y, f.axisZ.z);
  _stickM.makeBasis(_ikN, _ikD1, _ikD2);
  stick.quaternion.setFromRotationMatrix(_stickM);
  stick.position.set(f.heel.x, f.heel.y, f.heel.z);
}

/** Puck carry only. Shaft through the 0.92 and 0.74 grips, 55° off vertical, blade toward travel. */
function carryOwnStickAim(): StickAim {
  return {
    heel: [-1.15, 0.03, 0.65],
    shaft: [Math.sin(CARRY_SHAFT_PITCH), Math.cos(CARRY_SHAFT_PITCH), 0],
    blade: [0, 0, 1],
  };
}

/** Idle, no puck. Shaft 40° off vertical, yaw closed, blade toward travel, heel near the ice. */
function readyStickAim(): StickAim {
  return {
    heel: [-1.15, STICK_ICE_Y + 0.012, 0.3],
    shaft: [Math.sin(READY_SHAFT_PITCH), Math.cos(READY_SHAFT_PITCH), 0],
    blade: [0, 0, 1],
  };
}

type WristKey = {
  bot: [number, number, number];
  dir: [number, number, number];
  roll: number;
  yaw: number;
  hip: number;
  aim: number;
  open: number;
  weight: number;
  kneeL: number;
  kneeR: number;
  drop: number;
};

const WRIST_BOT_ALONG = SKATER_STICK_LEN * SKATER_GRIP_BOT;
const WRIST_CARRY: WristKey = {
  bot: [-1.15 + Math.sin(CARRY_SHAFT_PITCH) * WRIST_BOT_ALONG, 0.03 + Math.cos(CARRY_SHAFT_PITCH) * WRIST_BOT_ALONG, 0.65],
  dir: [Math.sin(CARRY_SHAFT_PITCH), Math.cos(CARRY_SHAFT_PITCH), 0],
  roll: 0,
  yaw: 0,
  hip: CARRY_HIP,
  aim: 0,
  open: 0,
  weight: 0,
  kneeL: 0.22,
  kneeR: 0.22,
  drop: CARRY_DROP,
};
const WRIST_SETTLE: WristKey = { ...WRIST_CARRY, hip: 0, drop: 0 };
const WRIST_LOAD: WristKey = {
  bot: [-0.46, 0.96, -0.06],
  dir: [0.55, 0.8, 0.16],
  roll: (-24 * Math.PI) / 180,
  yaw: (30 * Math.PI) / 180,
  hip: (10 * Math.PI) / 180,
  aim: 0.2,
  open: -0.42,
  weight: -0.055,
  kneeL: (50 * Math.PI) / 180,
  kneeR: (44 * Math.PI) / 180,
  drop: -0.152,
};
const WRIST_PLANT: WristKey = {
  bot: [-0.32, 1.02, 0.5],
  dir: [0.58, 0.78, 0.1],
  roll: (-8 * Math.PI) / 180,
  yaw: (8 * Math.PI) / 180,
  hip: (18 * Math.PI) / 180,
  aim: 0.9,
  open: 0,
  weight: 0.03,
  kneeL: (42 * Math.PI) / 180,
  kneeR: (16 * Math.PI) / 180,
  drop: -0.16,
};
const WRIST_RELEASE: WristKey = {
  bot: [-0.22, 1.02, 0.66],
  dir: [0.2, 0.74, -0.68],
  roll: (52 * Math.PI) / 180,
  yaw: (-36 * Math.PI) / 180,
  hip: (24 * Math.PI) / 180,
  aim: 1,
  open: 0.18,
  weight: 0.02,
  kneeL: (36 * Math.PI) / 180,
  kneeR: (20 * Math.PI) / 180,
  drop: -0.168,
};
const WRIST_FOLLOW: WristKey = {
  bot: [0.08, 1.34, -0.02],
  dir: [0.58, 0.68, -0.42],
  roll: (6 * Math.PI) / 180,
  yaw: (-22 * Math.PI) / 180,
  hip: (12 * Math.PI) / 180,
  aim: 0.65,
  open: 0.32,
  weight: 0,
  kneeL: (26 * Math.PI) / 180,
  kneeR: (22 * Math.PI) / 180,
  drop: -0.15,
};
const BH_LOAD: WristKey = {
  bot: [0.12, 0.94, 0.12],
  dir: [-0.75, 0.9, 0.11],
  roll: (-8 * Math.PI) / 180,
  yaw: (-34 * Math.PI) / 180,
  hip: (8 * Math.PI) / 180,
  aim: 0.15,
  open: -0.45,
  weight: -0.04,
  kneeL: (50 * Math.PI) / 180,
  kneeR: (42 * Math.PI) / 180,
  drop: -0.18,
};
const BH_PLANT: WristKey = {
  bot: [0.14, 1, 0.44],
  dir: [-0.4, 0.75, 0],
  roll: 0,
  yaw: (-12 * Math.PI) / 180,
  hip: (16 * Math.PI) / 180,
  aim: 0.4,
  open: -0.05,
  weight: 0.01,
  kneeL: (40 * Math.PI) / 180,
  kneeR: (16 * Math.PI) / 180,
  drop: -0.16,
};
const BH_RELEASE: WristKey = {
  bot: [-0.22, 1.08, 0.45],
  dir: [0.45, 0.75, 0.15],
  roll: (-52 * Math.PI) / 180,
  yaw: (36 * Math.PI) / 180,
  hip: (22 * Math.PI) / 180,
  aim: 1,
  open: 0.2,
  weight: 0.02,
  kneeL: (34 * Math.PI) / 180,
  kneeR: (22 * Math.PI) / 180,
  drop: -0.16,
};
const BH_FOLLOW: WristKey = {
  bot: [-0.08, 1.14, 0.14],
  dir: [0.5, 0.7, 0.08],
  roll: (-6 * Math.PI) / 180,
  yaw: (16 * Math.PI) / 180,
  hip: (12 * Math.PI) / 180,
  aim: 0.55,
  open: 0.28,
  weight: 0,
  kneeL: (28 * Math.PI) / 180,
  kneeR: (24 * Math.PI) / 180,
  drop: -0.14,
};

function lerpWrist(a: WristKey, b: WristKey, u: number): WristKey {
  const t = u * u * (3 - 2 * u);
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    bot: [n(a.bot[0], b.bot[0]), n(a.bot[1], b.bot[1]), n(a.bot[2], b.bot[2])],
    dir: [n(a.dir[0], b.dir[0]), n(a.dir[1], b.dir[1]), n(a.dir[2], b.dir[2])],
    roll: n(a.roll, b.roll),
    yaw: n(a.yaw, b.yaw),
    hip: n(a.hip, b.hip),
    aim: n(a.aim, b.aim),
    open: n(a.open, b.open),
    weight: n(a.weight, b.weight),
    kneeL: n(a.kneeL, b.kneeL),
    kneeR: n(a.kneeR, b.kneeR),
    drop: n(a.drop, b.drop),
  };
}

function wristStickAim(key: WristKey): StickAim {
  const m = Math.hypot(key.dir[0], key.dir[1], key.dir[2]) || 1;
  const dx = key.dir[0] / m;
  const dy = key.dir[1] / m;
  const dz = key.dir[2] / m;
  return {
    heel: [key.bot[0] - dx * WRIST_BOT_ALONG, key.bot[1] - dy * WRIST_BOT_ALONG, key.bot[2] - dz * WRIST_BOT_ALONG],
    shaft: [dx, dy, dz],
    blade: [0, 0, 1],
  };
}

function bladeFlatRoll(stick: THREE.Group): number {
  stick.updateMatrix();
  const el = stick.matrix.elements;
  return -Math.PI / 2 - Math.atan2(-el[5], el[1]);
}

function poseWristBlade(blade: THREE.Group, stick: THREE.Group, roll: number, yaw: number) {
  const rz = bladeFlatRoll(stick);
  _ikInv.setFromAxisAngle(_ikN.set(1, 0, 0), roll);
  _parentQ.setFromAxisAngle(_ikD1.set(0, 1, 0), yaw);
  _stickQ.setFromAxisAngle(_ikD2.set(0, 0, 1), rz);
  blade.quaternion.copy(_stickQ).multiply(_parentQ).multiply(_ikInv);
}

function seatBlade(stick: THREE.Group, blade: THREE.Group, lock = true) {
  stick.updateWorldMatrix(true, true);
  let minY = Infinity;
  for (const x of [-0.0375, 0.0375]) {
    for (const z of [0, 0.38]) {
      _corner.set(x, 0, z);
      blade.localToWorld(_corner);
      if (_corner.y < minY) minY = _corner.y;
    }
  }
  if (minY < Infinity && (lock || minY < STICK_ICE_Y)) stick.position.y += STICK_ICE_Y - minY;
}

/** Possession ring on the puck. Root scale is 1.14, so this is not a raw offset. */
export function seatGoalieRing(root: THREE.Object3D, ring: THREE.Object3D, puckX: number, puckZ: number): void {
  root.updateWorldMatrix(true, false);
  _corner.set(puckX, root.position.y, puckZ);
  root.worldToLocal(_corner);
  ring.position.set(_corner.x, 0, _corner.z);
}

/** Backskate chest points at the other end. Otherwise the sim yaw, which already does. */
function meshYaw(s: Skater): number {
  if (s.kind !== "goalie" && s.backskate) return faceYaw(s.side);
  return s.yaw;
}

function wristHipYaw(s: Skater, aim: number, open: number): number {
  const netX = attackDir(s.side) * GOAL_LINE_X;
  const dx = netX - s.x;
  const dz = -s.z;
  const ry = s.yaw + Math.PI;
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  const lx = dx * c - dz * sn;
  const lz = dx * sn + dz * c;
  const y = Math.atan2(lx, lz) * aim + open;
  return Math.max(-0.75, Math.min(0.75, y));
}

function poseWristLeg(leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, x: number, knee: number, hip: number) {
  const thigh = strideThigh(knee);
  leg.position.set(x, SKATER_HIP_Y, 0);
  leg.rotation.set(thigh, 0, 0);
  if (shin) shin.rotation.set(knee, 0, 0);
  if (boot) boot.rotation.set(-(hip + thigh + knee), 0, 0);
}

function watchPoint(head: THREE.Group, body: THREE.Group, x: number, y: number, z: number) {
  body.updateWorldMatrix(true, false);
  _ikTo.set(x, y, z);
  body.worldToLocal(_ikTo);
  const dx = _ikTo.x;
  const dy = _ikTo.y - 1.54;
  const dz = _ikTo.z - 0.02;
  const hy = Math.hypot(dx, dz) || 1e-4;
  head.rotation.order = "YXZ";
  head.rotation.y = Math.max(-1.2, Math.min(1.2, Math.atan2(dx, dz)));
  head.rotation.x = Math.max(-0.9, Math.min(0.6, Math.atan2(-dy, hy)));
  head.rotation.z = 0;
}

function wristAfter(elapsed: number, total: number): { phase: "release" | "follow" | "blend"; u: number } {
  const blend = Math.min(0.2, total);
  const rel = Math.min(0.14, Math.max(0, total - blend) * 0.55);
  const fol = Math.max(0.001, total - blend - rel);
  if (elapsed < rel) return { phase: "release", u: rel > 0 ? elapsed / rel : 1 };
  if (elapsed < rel + fol) return { phase: "follow", u: (elapsed - rel) / fol };
  return { phase: "blend", u: Math.min(1, (elapsed - rel - fol) / blend) };
}

const SLAP_UP = 0.83;

function slapFill(bot: [number, number, number], dir: [number, number, number], roll: number, yaw: number): WristKey {
  return {
    bot,
    dir,
    roll,
    yaw,
    hip: 0,
    aim: 0,
    open: 0,
    weight: 0,
    kneeL: 0.22,
    kneeR: 0.22,
    drop: 0,
  };
}

function slapFromTop(top: [number, number, number], toBlade: [number, number, number], roll: number, yaw: number): WristKey {
  const m = Math.hypot(toBlade[0], toBlade[1], toBlade[2]) || 1;
  const bx = toBlade[0] / m;
  const by = toBlade[1] / m;
  const bz = toBlade[2] / m;
  const slide = SKATER_STICK_LEN * (SKATER_GRIP_TOP - SKATER_GRIP_BOT);
  return slapFill([top[0] + bx * slide, top[1] + by * slide, top[2] + bz * slide], [-bx, -by, -bz], roll, yaw);
}

function slapFromHeel(heel: [number, number, number], dir: [number, number, number], roll: number, yaw: number): WristKey {
  const m = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const dx = dir[0] / m;
  const dy = dir[1] / m;
  const dz = dir[2] / m;
  return slapFill([heel[0] + dx * WRIST_BOT_ALONG, heel[1] + dy * WRIST_BOT_ALONG, heel[2] + dz * WRIST_BOT_ALONG], [dx, dy, dz], roll, yaw);
}

const _slapCarry = carryStickAim();
const SLAP_PLANT = slapFromHeel(_slapCarry.heel, _slapCarry.shaft, 0, 0);
const SLAP_WIND = slapFromTop([0.05, 1.4, 0.05], [-0.7, 0.35, -0.45], 0, 0);
const SLAP_HIT = slapFromHeel([-0.72, 0.2, 0.72], [0.35, 0.78, -0.5], (48 * Math.PI) / 180, (-36 * Math.PI) / 180);
const SLAP_FOLLOW = slapFromTop([0.15, 1.5, 0.25], [0.25, 0.45, 0.4], (8 * Math.PI) / 180, (-20 * Math.PI) / 180);

function slapBotSlide(u: number): number {
  const t = u < 0.5 ? u / 0.5 : (u - 0.5) / 0.5;
  const s = t * t * (3 - 2 * t);
  if (u < 0.5) return SKATER_GRIP_BOT + (SLAP_UP - SKATER_GRIP_BOT) * s;
  return SLAP_UP + (SKATER_GRIP_BOT - SLAP_UP) * s;
}

function slapStick(wind: number, follow: number): { key: WristKey; lock: boolean; bot: number } | null {
  const loaded = wind > 0.5 ? Math.min(1, (wind - 0.5) / 0.5) : 0;
  const raised = lerpWrist(SLAP_PLANT, SLAP_WIND, loaded);
  if (follow <= 0.02) {
    if (wind <= 0.5) return null;
    return { key: raised, lock: false, bot: slapBotSlide(loaded) };
  }
  const total = 0.62;
  const elapsed = Math.min(total, Math.max(0, total - follow));
  const down = 0.18;
  const hit = 0.1;
  const fol = 0.14;
  const blend = 0.2;
  if (elapsed < down) {
    const u = elapsed / down;
    const slide = slapBotSlide(loaded);
    return {
      key: lerpWrist(raised, SLAP_PLANT, u),
      lock: u > 0.85,
      bot: slide + (SKATER_GRIP_BOT - slide) * u,
    };
  }
  if (elapsed < down + hit) {
    const u = (elapsed - down) / hit;
    return { key: lerpWrist(SLAP_PLANT, SLAP_HIT, u), lock: true, bot: SKATER_GRIP_BOT };
  }
  if (elapsed < down + hit + fol) {
    const u = (elapsed - down - hit) / fol;
    return { key: lerpWrist(SLAP_HIT, SLAP_FOLLOW, u), lock: false, bot: SKATER_GRIP_BOT };
  }
  const u = Math.min(1, (elapsed - down - hit - fol) / blend);
  return { key: lerpWrist(SLAP_FOLLOW, WRIST_CARRY, u), lock: false, bot: SKATER_GRIP_BOT };
}

function hangSkaterArm(arm: THREE.Group, fore: THREE.Group | null, side: -1 | 1) {
  arm.position.set(side < 0 ? -0.26 : 0.24, 1.46, 0.06);
  arm.rotation.set(0.22, 0, side * 0.16);
  if (fore) fore.rotation.set(0.25, 0, 0);
}

function pokeBodyDrop(pitch: number): number {
  return -0.09 - pitch * 0.22;
}

/** Sole bottom of the skate blade in root space. Boot pitch cancels hip + thigh + knee. */
function skateSoleYZ(pitch: number, drop: number, thigh: number, knee: number): { y: number; z: number } {
  const boot = -(pitch + thigh + knee);
  const rx = (y: number, z: number, a: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [y * c - z * s, y * s + z * c] as const;
  };
  let y = -0.1375;
  let z = 0.02;
  [y, z] = rx(y, z, boot);
  y += -0.3;
  z += 0.04;
  [y, z] = rx(y, z, knee);
  y += -0.32;
  [y, z] = rx(y, z, thigh);
  y += SKATER_HIP_Y;
  [y, z] = rx(y, z, pitch);
  y += drop;
  return { y, z };
}

function plantThigh(pitch: number, drop: number, knee: number, lo: number, hi: number, wantZ: number): number {
  let bestT = (lo + hi) * 0.5;
  let best = Infinity;
  const score = (t: number) => {
    const s = skateSoleYZ(pitch, drop, t, knee);
    return Math.abs(s.y - 0.02) * 4 + Math.abs(s.z - wantZ);
  };
  const step = (a: number, b: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      const err = score(t);
      if (err < best) {
        best = err;
        bestT = t;
      }
    }
  };
  step(lo, hi, 12);
  const span = (hi - lo) / 12;
  step(bestT - span, bestT + span, 8);
  return bestT;
}

function posePokeLeg(leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, x: number, thigh: number, knee: number, pitch: number) {
  leg.position.set(x, SKATER_HIP_Y, 0);
  leg.rotation.set(thigh, 0, 0);
  if (shin) shin.rotation.set(knee, 0, 0);
  if (boot) boot.rotation.set(-(pitch + thigh + knee), 0, 0);
}

/** Body-check crouch, then the shoulder drive. Shared by user and CPU. */
const CHECK_PITCH = 0.66;
const CHECK_KNEE = 0.9;
const CHECK_DORSI = 0.32;
const CHECK_HIP_Z = 0.14;
const CHECK_YAW = 0.48;
const DRIVE_KNEE = 1.02;
const TRAIL_THIGH = 0.25;
const TRAIL_KNEE = 0.05;
const TRAIL_TOE = 0.25;
const CHECK_HEAD_Z = -0.16;
const CHECK_TUCK = 0.26;
const CHECK_ARM_Z = 0.1;
const CHECK_ARM_RX = -1.55;
const CHECK_ARM_RY = -0.2;
const CHECK_ARM_RZ = -0.4;
const CHECK_FORE_RX = -1.4;
const CHECK_DOWN_S = 0.12;
const CHECK_DRIVE_S = 0.14;
const CHECK_RECOVER_S = 0.16;
const RECV_PITCH = -0.3;
const RECV_KNEE = 0.4;
const RECV_DORSI = 0.12;
const _checkBase = new THREE.Quaternion();
const _checkTo = new THREE.Quaternion();
const _checkPt = new THREE.Vector3();

function smooth01(u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  return t * t * (3 - 2 * t);
}

function checkBoot(pitch: number, thigh: number, knee: number, dorsi: number): number {
  return -(pitch + thigh + knee) - dorsi;
}

/**
 * Blade heel in root Y. Dorsi raises the toe; the heel stays the contact.
 * Body rotation is Euler XYZ, so yaw after the hip pitch changes this height when hipX is not 0.
 */
function checkHeelY(pitch: number, drop: number, thigh: number, knee: number, dorsi: number, yaw = 0, hipX = 0): number {
  const boot = checkBoot(pitch, thigh, knee, dorsi);
  const rx = (y: number, z: number, a: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [y * c - z * s, y * s + z * c] as const;
  };
  let y = -0.1375;
  let z = -0.14;
  [y, z] = rx(y, z, boot);
  y += -0.3;
  z += 0.04;
  [y, z] = rx(y, z, knee);
  y += -0.32;
  [y, z] = rx(y, z, thigh);
  y += SKATER_HIP_Y;
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  return sp * sy * hipX + cp * y - sp * cy * z + drop;
}

function plantCheckThigh(pitch: number, drop: number, knee: number, dorsi: number, yaw = 0, hipX = 0): number {
  let bestT = 0;
  let best = Infinity;
  const step = (a: number, b: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      const err = Math.abs(checkHeelY(pitch, drop, t, knee, dorsi, yaw, hipX) - 0.02);
      if (err < best) {
        best = err;
        bestT = t;
      }
    }
  };
  step(-1.3, 1.2, 36);
  step(bestT - 0.08, bestT + 0.08, 8);
  return bestT;
}

function checkPlant(pitch: number, knee: number, dorsi: number, yaw = 0, hipX = 0): { drop: number; thigh: number } {
  let thigh = plantCheckThigh(pitch, 0, knee, dorsi, yaw, hipX);
  let drop = 0.02 - checkHeelY(pitch, 0, thigh, knee, dorsi, yaw, hipX);
  thigh = plantCheckThigh(pitch, drop, knee, dorsi, yaw, hipX);
  drop = 0.02 - checkHeelY(pitch, 0, thigh, knee, dorsi, yaw, hipX);
  return { thigh, drop };
}

type CheckTargets = {
  pitch: number;
  drop: number;
  bz: number;
  yaw: number;
  kneeF: number;
  thighF: number;
  bootF: number;
  kneeB: number;
  thighB: number;
  bootB: number;
  headZ: number;
  headRx: number;
  armZ: number;
  armRx: number;
  armRy: number;
  armRz: number;
  foreRx: number;
  influence: number;
};

function checkTargets(side: 1 | -1, elapsed: number, hit: number): CheckTargets {
  const end = smooth01(Math.min(1, hit / 0.12));
  const load = checkPlant(CHECK_PITCH, CHECK_KNEE, CHECK_DORSI);
  const downT = CHECK_DOWN_S;
  const driveT = CHECK_DRIVE_S;
  let driveU = 0;
  let influence = end;
  if (elapsed < downT) {
    influence = smooth01(elapsed / downT) * end;
  } else if (elapsed < downT + driveT) {
    driveU = smooth01((elapsed - downT) / driveT);
  } else {
    const u = smooth01(Math.min(1, (elapsed - downT - driveT) / CHECK_RECOVER_S));
    driveU = 1;
    influence = (1 - u) * end;
  }
  const mix = (a: number, b: number) => a + (b - a) * driveU;
  const yaw = -side * CHECK_YAW * driveU;
  const kneeF = mix(CHECK_KNEE, DRIVE_KNEE);
  const front = checkPlant(CHECK_PITCH, kneeF, CHECK_DORSI, yaw, side * SKATER_HIP_X);
  const kneeB = mix(CHECK_KNEE, TRAIL_KNEE);
  const thighB = mix(load.thigh, TRAIL_THIGH);
  return {
    pitch: CHECK_PITCH,
    drop: front.drop,
    // Origin is the skates. Shift back so this pitch hinges at the hips, not the blades.
    bz: CHECK_HIP_Z - Math.sin(CHECK_PITCH) * SKATER_HIP_Y,
    yaw,
    kneeF,
    thighF: front.thigh,
    bootF: checkBoot(CHECK_PITCH, front.thigh, kneeF, CHECK_DORSI),
    kneeB,
    thighB,
    bootB: checkBoot(CHECK_PITCH, thighB, kneeB, CHECK_DORSI * (1 - driveU)) + TRAIL_TOE * driveU,
    headZ: CHECK_HEAD_Z,
    headRx: CHECK_TUCK,
    armZ: mix(0.06, CHECK_ARM_Z),
    armRx: mix(0.25, CHECK_ARM_RX),
    armRy: side * CHECK_ARM_RY,
    armRz: side * CHECK_ARM_RZ,
    foreRx: mix(-0.45, CHECK_FORE_RX),
    influence,
  };
}

function latchCheckSide(root: THREE.Object3D, s: Skater): 1 | -1 {
  root.updateWorldMatrix(true, false);
  let best = 3.2;
  let lx = -1;
  const take = (x: number, z: number) => {
    _checkPt.set(x, 0, z);
    root.worldToLocal(_checkPt);
    if (_checkPt.z < -0.15) return;
    const d = Math.hypot(_checkPt.x, _checkPt.z);
    if (d < best) {
      best = d;
      lx = _checkPt.x;
    }
  };
  for (const o of world.skaters) {
    if (o.id !== s.id && o.side !== s.side) take(o.x, o.z);
  }
  take(world.ref.x, world.ref.z);
  take(world.ref2.x, world.ref2.z);
  return lx >= 0 ? 1 : -1;
}

function slerpRot(obj: THREE.Object3D, rx: number, ry: number, rz: number, w: number) {
  _checkBase.copy(obj.quaternion);
  obj.rotation.set(rx, ry, rz);
  _checkTo.copy(obj.quaternion);
  obj.quaternion.copy(_checkBase).slerp(_checkTo, w);
}

/** Top grip extended toward the puck. Shaft stays near 50° off vertical so the blade is not a spear. */
function pokeStickAim(shX: number, shY: number, shZ: number, px: number, pz: number): StickAim {
  let dx = px;
  let dz = pz;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-3) {
    dx = 0;
    dz = 1;
  } else {
    dx /= dist;
    dz /= dist;
  }
  const grip = SKATER_STICK_LEN * SKATER_GRIP_TOP;
  const vert = Math.cos(POKE_TILT) * grip;
  const shift = Math.min(0.38, 0.2 + Math.max(0, dist - 0.75) * 0.22);
  let topX = -0.06 + dx * shift;
  let topY = STICK_ICE_Y + vert;
  let topZ = 0.36 + dz * shift;
  const maxR = 0.64;
  const ox = topX - shX;
  const oy = topY - shY;
  const oz = topZ - shZ;
  const od = Math.hypot(ox, oy, oz);
  if (od > maxR) {
    const sc = maxR / od;
    topX = shX + ox * sc;
    topY = shY + oy * sc;
    topZ = shZ + oz * sc;
  }
  const rise = Math.max(0.35, topY - STICK_ICE_Y);
  const maxRise = Math.cos((42 * Math.PI) / 180) * grip;
  const useV = Math.min(maxRise, rise);
  const useH = Math.sqrt(Math.max(0.05, grip * grip - useV * useV));
  topY = STICK_ICE_Y + useV;
  const heelX = topX + dx * useH;
  const heelZ = topZ + dz * useH;
  const sx = topX - heelX;
  const sy = topY - STICK_ICE_Y;
  const sz = topZ - heelZ;
  const sm = Math.hypot(sx, sy, sz) || 1;
  return {
    heel: [heelX, STICK_ICE_Y, heelZ],
    shaft: [sx / sm, sy / sm, sz / sm],
    blade: [dx, 0, dz],
  };
}

/** Blade local +Y becomes world up, toe stays horizontal toward the puck. Sole sits on the heel plane. */
function posePokeBlade(blade: THREE.Group, stick: THREE.Group, toeX: number, toeZ: number) {
  stick.updateMatrix();
  const e = stick.matrix.elements;
  _ikTo.set(toeX, 0, toeZ);
  if (_ikTo.lengthSq() < 1e-8) _ikTo.set(0, 0, 1);
  else _ikTo.normalize();
  const ax = e[0];
  const ay = e[1];
  const az = e[2];
  const bx = e[4];
  const by = e[5];
  const bz = e[6];
  const cx = e[8];
  const cy = e[9];
  const cz = e[10];
  _ikN.set(ay, by, cy);
  if (_ikN.lengthSq() < 1e-8) _ikN.set(0, 1, 0);
  else _ikN.normalize();
  _ikD2.set(ax * _ikTo.x + ay * _ikTo.y + az * _ikTo.z, bx * _ikTo.x + by * _ikTo.y + bz * _ikTo.z, cx * _ikTo.x + cy * _ikTo.y + cz * _ikTo.z);
  _ikD2.addScaledVector(_ikN, -_ikD2.dot(_ikN));
  if (_ikD2.lengthSq() < 1e-8) _ikD2.set(cx, cy, cz);
  _ikD2.normalize();
  _ikD1.crossVectors(_ikN, _ikD2).normalize();
  _ikD2.crossVectors(_ikD1, _ikN).normalize();
  _stickM.makeBasis(_ikD1, _ikN, _ikD2);
  blade.quaternion.setFromRotationMatrix(_stickM);
}

type PokeSnap = {
  stickQ: THREE.Quaternion;
  stickP: THREE.Vector3;
  bladeQ: THREE.Quaternion;
  topQ: THREE.Quaternion;
  topF: THREE.Quaternion;
  botQ: THREE.Quaternion;
  botF: THREE.Quaternion;
  topP: THREE.Vector3;
  botP: THREE.Vector3;
  pitch: number;
  drop: number;
  lThigh: number;
  rThigh: number;
  lKnee: number;
  rKnee: number;
  lBoot: number;
  rBoot: number;
};

function blendFromSnap(obj: THREE.Object3D, from: THREE.Quaternion, t: number) {
  _blendQ.copy(obj.quaternion);
  obj.quaternion.copy(from).slerp(_blendQ, t);
}

function freshPokeSnap(): PokeSnap {
  return {
    stickQ: new THREE.Quaternion(),
    stickP: new THREE.Vector3(),
    bladeQ: new THREE.Quaternion(),
    topQ: new THREE.Quaternion(),
    topF: new THREE.Quaternion(),
    botQ: new THREE.Quaternion(),
    botF: new THREE.Quaternion(),
    topP: new THREE.Vector3(),
    botP: new THREE.Vector3(),
    pitch: 0,
    drop: 0,
    lThigh: 0,
    rThigh: 0,
    lKnee: 0,
    rKnee: 0,
    lBoot: 0,
    rBoot: 0,
  };
}

function gripSkaterHand(body: THREE.Group, arm: THREE.Group, fore: THREE.Group, sx: number, sy: number, sz: number, gx: number, gy: number, gz: number, poleSign: number, coincide = false) {
  arm.position.set(sx, sy, sz);
  const ox = poleSign < 0 ? 0.02 : -0.01;
  const oz = poleSign < 0 ? 0.06 : 0.07;
  let tx = gx;
  let ty = gy;
  let tz = gz;
  const passes = coincide ? 16 : 4;
  const eps = coincide ? 0.001 : 0.03;
  for (let n = 0; n < passes; n++) {
    poseArmIk(arm, fore, sx, sy, sz, tx, ty, tz, poleSign, true);
    body.updateWorldMatrix(true, true);
    _corner.set(ox, -0.28, oz);
    fore.localToWorld(_corner);
    body.worldToLocal(_corner);
    const ex = gx - _corner.x;
    const ey = gy - _corner.y;
    const ez = gz - _corner.z;
    if (Math.hypot(ex, ey, ez) < eps) break;
    tx += ex * 0.85;
    ty += ey * 0.85;
    tz += ez * 0.85;
  }
}

function puckNearSkater(s: Skater): boolean {
  const puck = world.puck;
  if (puck.y > 1.35) return false;
  const dx = puck.x - s.x;
  const dz = puck.z - s.z;
  return dx * dx + dz * dz < 2.2 * 2.2;
}

function clampHandOutsideTorso(
  tx: number,
  ty: number,
  tz: number,
  sideSign: number,
  allowFront = false,
): {
  x: number;
  y: number;
  z: number;
} {
  const y0 = 0.76;
  const y1 = 1.66;
  if (ty >= y0 && ty <= y1) {
    if (allowFront) {
      if (Math.abs(tx) < 0.2 && tz < 0.14 && tz > -0.2) tz = 0.22;
    } else {
      const minX = 0.38;
      const zFront = 0.28;
      const zBack = -0.16;
      if (Math.abs(tx) < minX && tz < zFront && tz > zBack) {
        tx = sideSign * minX;
        tz = Math.max(0.16, tz);
      }
      if (tz < zBack) tz = zBack;
      if (Math.abs(tx) < 0.22) {
        tx = sideSign * 0.28;
        tz = Math.max(tz, 0.22);
      }
    }
  }
  return { x: tx, y: ty, z: tz };
}

function poseArmIk(arm: THREE.Group, fore: THREE.Group | null, sx: number, sy: number, sz: number, tx: number, ty: number, tz: number, poleSign: number, allowFront = false, fitGlove = false) {
  const clamped = clampHandOutsideTorso(tx, ty, tz, poleSign, allowFront || fitGlove);
  tx = clamped.x;
  ty = clamped.y;
  tz = clamped.z;
  const UPPER = fitGlove ? 0.281 : allowFront ? 0.3 : 0.28;
  const LOWER = fitGlove ? 0.287 : allowFront ? 0.44 : 0.4;
  _ikTo.set(tx - sx, ty - sy, tz - sz);
  let dist = _ikTo.length();
  const maxR = UPPER + LOWER - 0.02;
  if (dist < 0.08) dist = 0.08;
  if (dist > maxR) {
    _ikTo.multiplyScalar(maxR / dist);
    dist = maxR;
    tx = sx + _ikTo.x;
    ty = sy + _ikTo.y;
    tz = sz + _ikTo.z;
  }
  _ikTo.normalize();
  const a = (UPPER * UPPER - LOWER * LOWER + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  if (fitGlove) _ikPole.set(poleSign * (ty > sy ? 0.85 : 0.35), ty > sy ? 0.2 : -0.9, 0.28);
  else if (allowFront) _ikPole.set(-poleSign * 0.08, -0.42, 0.4);
  else _ikPole.set(poleSign * 0.28, -0.48, 0.32);
  _ikN.copy(_ikTo).cross(_ikPole);
  _ikN.cross(_ikTo);
  if (_ikN.lengthSq() < 1e-6) _ikN.set(poleSign, 0, 0);
  _ikN.normalize();
  _ikElbow.set(sx, sy, sz).addScaledVector(_ikTo, a).addScaledVector(_ikN, h);
  if (!fitGlove) {
    _ikElbow.y = Math.min(_ikElbow.y, sy - (poleSign < 0 ? 0.22 : 0.14));
    _ikElbow.z = Math.max(_ikElbow.z, sz + 0.08);
  }
  if (!fitGlove && allowFront) {
    if (poleSign < 0) _ikElbow.x = Math.min(_ikElbow.x, sx + 0.12);
  } else if (!fitGlove) {
    const elbow = clampHandOutsideTorso(_ikElbow.x, _ikElbow.y, _ikElbow.z, poleSign, allowFront);
    _ikElbow.set(elbow.x, Math.min(elbow.y, sy - 0.18), elbow.z);
  }
  _ikD1.set(_ikElbow.x - sx, _ikElbow.y - sy, _ikElbow.z - sz);
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0, -1, 0);
  else _ikD1.normalize();
  _ikN.set(poleSign, 0, 0.15);
  _ikN.addScaledVector(_ikD1, -_ikN.dot(_ikD1));
  if (_ikN.lengthSq() < 1e-6) _ikN.set(0, 0, 1);
  _ikN.normalize();
  _ikD2.crossVectors(_ikD1, _ikN).normalize();
  _ikTo.copy(_ikD1).multiplyScalar(-1);
  _stickM.makeBasis(_ikN, _ikTo, _ikD2);
  arm.quaternion.setFromRotationMatrix(_stickM);
  if (fore) {
    _ikD1.set(tx - _ikElbow.x, ty - _ikElbow.y, tz - _ikElbow.z);
    if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0, -1, 0);
    else _ikD1.normalize();
    _ikInv.copy(arm.quaternion).invert();
    _ikD1.applyQuaternion(_ikInv);
    fore.quaternion.setFromUnitVectors(_ikDown, _ikD1);
  }
}

function poseStickOneHand(stick: THREE.Group, parent: THREE.Group, hand: THREE.Group, layout: { len: number }) {
  parent.updateWorldMatrix(true, false);
  hand.updateWorldMatrix(true, false);
  _handTop.set(0.02, -0.28, 0.06);
  hand.localToWorld(_handTop);
  parent.worldToLocal(_handTop);
  const grip = layout.len * 0.86;
  const drop = _handTop.y - 0.05;
  const horiz = drop < grip ? Math.sqrt(Math.max(0.04, grip * grip - drop * drop)) : 0.22;
  const bx = _handTop.x - horiz * 0.92;
  const by = drop < grip ? 0.05 : _handTop.y - grip * 0.92;
  const bz = _handTop.z + horiz * 0.28;
  _ikD1.set(_handTop.x - bx, _handTop.y - by, _handTop.z - bz);
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0.2, 1, 0.1);
  else _ikD1.normalize();
  stick.quaternion.setFromUnitVectors(_fromY, _ikD1);
  _ikD2.set(0, grip, 0).applyQuaternion(stick.quaternion);
  stick.position.set(_handTop.x - _ikD2.x, _handTop.y - _ikD2.y, _handTop.z - _ikD2.z);
}

function skaterPoint(s: Skater, lx: number, ly: number, lz: number, out: THREE.Vector3): void {
  const ry = s.yaw + Math.PI;
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  out.set(s.x + lx * c + lz * sn, ly, s.z - lx * sn + lz * c);
}

function poseGloveAt(body: THREE.Group, arm: THREE.Group, fore: THREE.Group, sx: number, sy: number, sz: number, gx: number, gy: number, gz: number, poleSign: number): void {
  const ox = poleSign < 0 ? 0.02 : -0.01;
  const oz = poleSign < 0 ? 0.06 : 0.07;
  let tx = gx;
  let ty = gy;
  let tz = gz;
  let best = Infinity;
  for (let n = 0; n < 4; n++) {
    poseArmIk(arm, fore, sx, sy, sz, tx, ty, tz, poleSign, true, true);
    body.updateWorldMatrix(true, true);
    _corner.set(ox, -0.28, oz);
    fore.localToWorld(_corner);
    body.worldToLocal(_corner);
    const ex = gx - _corner.x;
    const ey = gy - _corner.y;
    const ez = gz - _corner.z;
    const err = Math.hypot(ex, ey, ez);
    if (err < best) {
      best = err;
      _stickQ.copy(arm.quaternion);
      _parentQ.copy(fore.quaternion);
    } else break;
    if (err < 0.02) break;
    tx += ex;
    ty += ey;
    tz += ez;
  }
  arm.quaternion.copy(_stickQ);
  fore.quaternion.copy(_parentQ);
}

function cheerNeutral(body: THREE.Group, arm: THREE.Group, fore: THREE.Group, side: -1 | 1): void {
  const sx = side < 0 ? -0.26 : 0.24;
  poseGloveAt(body, arm, fore, sx, 1.46, 0.06, side * 0.46, 0.98, 0.16, side);
}

function slapOpen(t: number): number {
  const u = (t % 0.85) / 0.85;
  if (u < 0.5) return 0.06;
  if (u < 0.68) {
    const c = (u - 0.5) / 0.18;
    return 0.06 + c * c * (3 - 2 * c) * 0.94;
  }
  return 1;
}

function patReach(t: number): number {
  const u = t % 0.5;
  if (u < 0.25) return 1;
  return 1 - ((u - 0.25) / 0.25) * 0.38;
}

function lateralMates(s: Skater): { neg: Skater | null; pos: Skater | null } {
  const ry = s.yaw + Math.PI;
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  let neg: Skater | null = null;
  let pos: Skater | null = null;
  let negD = 1.85;
  let posD = 1.85;
  for (const o of world.skaters) {
    if (o.id === s.id || o.kind === "goalie" || o.side !== s.side || o.celebrate <= 0.05) continue;
    const dx = o.x - s.x;
    const dz = o.z - s.z;
    const lx = dx * c - dz * sn;
    const d = Math.hypot(dx, dz);
    if (d > 1.85 || d < 0.05) continue;
    const lz = dx * sn + dz * c;
    if (Math.abs(lx) < Math.abs(lz) * 0.4) continue;
    if (lx >= 0 && d < posD) {
      pos = o;
      posD = d;
    } else if (lx < 0 && d < negD) {
      neg = o;
      negD = d;
    }
  }
  return { neg, pos };
}

function nearShoulder(mate: Skater, from: Skater, out: THREE.Vector3): void {
  skaterPoint(mate, -0.3, 1.44, -0.07, _handTop);
  skaterPoint(mate, 0.28, 1.44, -0.07, _handBot);
  const dl = (_handTop.x - from.x) ** 2 + (_handTop.z - from.z) ** 2;
  const dr = (_handBot.x - from.x) ** 2 + (_handBot.z - from.z) ** 2;
  out.copy(dl <= dr ? _handTop : _handBot);
}

function bestMeet(a: Skater, b: Skater, yWant: number): { x: number; y: number; z: number; handA: 0 | 1; handB: 0 | 1 } {
  const preferA = cheerFor(a.id)?.hand ?? 0;
  const preferB = cheerFor(b.id)?.hand ?? 0;
  const reach = 0.53;
  let bestScore = Infinity;
  let pick = {
    x: (a.x + b.x) * 0.5,
    y: yWant,
    z: (a.z + b.z) * 0.5,
    handA: preferA,
    handB: preferB,
  };
  for (const ha of [0, 1] as const) {
    for (const hb of [0, 1] as const) {
      skaterPoint(a, ha === 0 ? -0.26 : 0.24, 1.46, 0.06, _handTop);
      skaterPoint(b, hb === 0 ? -0.26 : 0.24, 1.46, 0.06, _handBot);
      const ax = _handTop.x;
      const az = _handTop.z;
      const bx = _handBot.x;
      const bz = _handBot.z;
      const mx = (ax + bx) * 0.5;
      const mz = (az + bz) * 0.5;
      const h = Math.max(Math.hypot(mx - ax, mz - az), Math.hypot(mx - bx, mz - bz));
      const yMax = 1.46 + Math.sqrt(Math.max(0, reach * reach - h * h));
      const y = Math.max(1.05, Math.min(yWant, yMax));
      const miss = Math.max(0, Math.min(yWant, 1.8) - y);
      const prefer = (ha === preferA ? 0 : 1) + (hb === preferB ? 0 : 1);
      const score = miss * 30 + prefer + h * 0.02;
      if (score < bestScore) {
        bestScore = score;
        pick = { x: mx, y, z: mz, handA: ha, handB: hb };
      }
    }
  }
  return pick;
}

function mountRagePiece(
  root: THREE.Group,
  group: THREE.Group,
  p: {
    x: number;
    y: number;
    z: number;
    rx: number;
    ry: number;
    rz: number;
    dx: number;
    dy: number;
    dz: number;
  },
) {
  root.updateWorldMatrix(true, false);
  _liftPt.set(p.x, p.y, p.z);
  root.worldToLocal(_liftPt);
  group.position.copy(_liftPt);
  root.getWorldQuaternion(_parentQ);
  _ikD1.set(p.dx, p.dy, p.dz);
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0, 1, 0);
  else _ikD1.normalize();
  _ikD1.applyQuaternion(_parentQ.invert());
  group.quaternion.setFromUnitVectors(_fromY, _ikD1);
  _euler.set(p.rx, p.ry, p.rz);
  _ikInv.setFromEuler(_euler);
  group.quaternion.multiply(_ikInv);
  group.visible = true;
}

function poseRage(s: Skater, root: THREE.Group, body: THREE.Group | null, lArm: THREE.Group, rArm: THREE.Group, lFore: THREE.Group | null, rFore: THREE.Group | null, stick: THREE.Group, shaft: THREE.Group, blade: THREE.Group, knob: THREE.Object3D, flyBlade: THREE.Group, flyShaft: THREE.Group, layout: { len: number }, view: NonNullable<ReturnType<typeof rageDraw>>) {
  const t = view.t;
  const hit = view.hit > 0 ? view.hit : 99;
  const toss = view.toss > 0 ? view.toss : 99;
  const wind0 = Math.max(0.16, hit - 0.52);
  let e = 0;
  if (t >= hit) e = 1;
  else if (t > wind0) {
    const u = (t - wind0) / Math.max(0.05, hit - wind0);
    e = u * u * (3 - 2 * u);
  }
  const snapped = t >= hit && view.hit > 0;
  const thrown = t >= toss && view.toss > 0;
  if (body) {
    body.position.y = 0;
    body.rotation.set(thrown ? 0.06 : 0.1 + e * 0.2, 0, 0);
  }
  lArm.position.set(-0.26, 1.46, 0.06);
  rArm.position.set(0.24, 1.46, 0.06);
  root.updateWorldMatrix(true, false);
  _ikTo.set(view.ironX, view.ironY, view.ironZ);
  root.worldToLocal(_ikTo);
  _ikD2.set(0.22, 0.88, -0.42);
  if (_ikD2.lengthSq() > 1e-8) _ikD2.normalize();
  const cockGrip = layout.len * 0.7;
  const cBx = 0.24 - _ikD2.x * cockGrip;
  const cBy = 1.4 - _ikD2.y * cockGrip;
  const cBz = -0.05 - _ikD2.z * cockGrip;
  _ikD1.set(RAGE_HX - _ikTo.x, RAGE_HY - _ikTo.y, RAGE_HZ - _ikTo.z);
  const reach = _ikD1.length();
  const maxReach = layout.len * 0.9;
  let tBx = _ikTo.x;
  let tBy = _ikTo.y;
  let tBz = _ikTo.z;
  if (reach > maxReach && reach > 1e-4) {
    const sc = maxReach / reach;
    tBx = RAGE_HX - _ikD1.x * sc;
    tBy = RAGE_HY - _ikD1.y * sc;
    tBz = RAGE_HZ - _ikD1.z * sc;
    _ikD1.multiplyScalar(sc);
  }
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0, 1, 0);
  else _ikD1.normalize();
  const bx = cBx * (1 - e) + tBx * e;
  const by = cBy * (1 - e) + tBy * e;
  const bz = cBz * (1 - e) + tBz * e;
  _handBot.set(_ikD2.x * (1 - e) + _ikD1.x * e, _ikD2.y * (1 - e) + _ikD1.y * e, _ikD2.z * (1 - e) + _ikD1.z * e);
  if (_handBot.lengthSq() < 1e-8) _handBot.set(0, 1, 0);
  else _handBot.normalize();
  stick.quaternion.setFromUnitVectors(_fromY, _handBot);
  stick.position.set(bx, by, bz);
  stick.visible = !thrown;
  knob.visible = !thrown;
  blade.visible = !snapped;
  if (snapped) {
    shaft.position.set(0, layout.len * 0.75, 0);
    shaft.scale.set(1, layout.len * 0.5, 1);
  } else {
    shaft.position.set(0, layout.len * 0.5, 0);
    shaft.scale.set(1, layout.len, 1);
  }
  shaft.visible = !thrown;
  if (thrown) {
    const f = Math.min(1, (t - toss) / 0.24);
    lArm.quaternion.identity();
    rArm.quaternion.identity();
    lArm.rotation.set(-0.5 - f * 0.25, 0.12, -0.42);
    rArm.rotation.set(-1.25 + f * 0.7, -0.16, 0.48);
    if (lFore) lFore.rotation.set(-0.3, 0, 0);
    if (rFore) rFore.rotation.set(-0.62 + f * 0.4, 0, 0);
  } else if (body) {
    stick.updateWorldMatrix(true, false);
    body.updateWorldMatrix(true, false);
    const contactTop = Math.min(layout.len * 0.88, Math.max(layout.len * 0.62, Math.min(reach, maxReach)));
    let topT = layout.len * 0.7 * (1 - e) + contactTop * e;
    let botT = topT - (snapped ? 0.22 : 0.36);
    if (snapped) {
      topT = Math.max(layout.len * 0.6, topT);
      botT = Math.max(layout.len * 0.52, Math.min(botT, topT - 0.16));
    }
    _handTop.set(0, topT, 0);
    stick.localToWorld(_handTop);
    body.worldToLocal(_handTop);
    _handBot.set(0, botT, 0);
    stick.localToWorld(_handBot);
    body.worldToLocal(_handBot);
    poseArmIk(lArm, lFore, -0.26, 1.46, 0.06, _handTop.x, _handTop.y, _handTop.z, -1, true);
    poseArmIk(rArm, rFore, 0.24, 1.46, 0.06, _handBot.x, _handBot.y, _handBot.z, 1, true);
  }
  if (view.blade.on) mountRagePiece(root, flyBlade, view.blade);
  else flyBlade.visible = false;
  if (view.shaft.on) mountRagePiece(root, flyShaft, view.shaft);
  else flyShaft.visible = false;
}

function poseCheer(s: Skater, body: THREE.Group, lArm: THREE.Group, rArm: THREE.Group, lFore: THREE.Group | null, rFore: THREE.Group | null): void {
  lArm.position.set(-0.26, 1.46, 0.06);
  rArm.position.set(0.24, 1.46, 0.06);
  if (!lFore || !rFore) return;
  const plan = cheerFor(s.id);
  const kind = plan?.kind ?? 0;
  const hand = plan?.hand ?? 0;
  const straight = plan?.straight ?? 1;
  const mate = plan && plan.mate >= 0 ? world.skaters[plan.mate] : undefined;
  const near = !!mate && Math.hypot(mate.x - s.x, mate.z - s.z) < 2.4;
  body.updateWorldMatrix(true, false);
  const toBody = (src: THREE.Vector3) => {
    _liftPt.copy(src);
    body.worldToLocal(_liftPt);
    return { x: _liftPt.x, y: _liftPt.y, z: _liftPt.z };
  };
  const aim = (side: -1 | 1, gx: number, gy: number, gz: number) => {
    const arm = side < 0 ? lArm : rArm;
    const fore = side < 0 ? lFore : rFore;
    const sx = side < 0 ? -0.26 : 0.24;
    poseGloveAt(body, arm, fore, sx, 1.46, 0.06, gx, gy, gz, side);
  };
  const park = (active: -1 | 1 | 2) => {
    if (active !== -1) cheerNeutral(body, lArm, lFore, -1);
    if (active !== 1) cheerNeutral(body, rArm, rFore, 1);
  };
  if (kind === 2) {
    const sides = lateralMates(s);
    const k = patReach(world.time);
    const patSide = (side: -1 | 1, mateS: Skater | null) => {
      const sx = side < 0 ? -0.26 : 0.24;
      if (!mateS) {
        aim(side, side * 0.46, 0.98, 0.16);
        return;
      }
      nearShoulder(mateS, s, _ikTo);
      const c = toBody(_ikTo);
      aim(side, sx + (c.x - sx) * k, 1.46 + (c.y - 1.46) * k, 0.06 + (c.z - 0.06) * k);
    };
    patSide(-1, sides.neg);
    patSide(1, sides.pos);
    return;
  }
  let active: 0 | 1 = hand;
  let mx = (hand === 0 ? -1 : 1) * 0.08;
  let my = kind === 1 ? (straight ? 1.42 : 1.36) : straight ? 1.96 : 1.8;
  let mz = 0.42;
  if ((kind === 0 || kind === 1) && mate && near) {
    const yWant = kind === 0 ? (straight ? 1.96 : 1.8) : straight ? 1.42 : 1.36;
    const meet = bestMeet(s, mate, yWant);
    active = meet.handA;
    _ikTo.set(meet.x, meet.y, meet.z);
    const c = toBody(_ikTo);
    mx = c.x;
    my = c.y;
    mz = c.z;
  } else if (kind === 3 && mate && near && mate.id !== s.id) {
    const dx = s.x - mate.x;
    const dz = s.z - mate.z;
    const d = Math.hypot(dx, dz) || 1;
    skaterPoint(mate, 0, 1.68, 0.02, _ikTo);
    _ikTo.x += (dx / d) * 0.16;
    _ikTo.z += (dz / d) * 0.16;
    _ikTo.y = 1.7;
    const c = toBody(_ikTo);
    const side: -1 | 1 = hand === 0 ? -1 : 1;
    const sx = side < 0 ? -0.26 : 0.24;
    const k = patReach(world.time);
    park(side);
    aim(side, sx + (c.x - sx) * k, 1.46 + (c.y - 1.46) * k, 0.06 + (c.z - 0.06) * k);
    return;
  }
  const side: -1 | 1 = active === 0 ? -1 : 1;
  park(side);
  const open = kind === 3 ? patReach(world.time) : slapOpen(world.time + (kind === 1 ? 0.2 : 0));
  const cockY = kind === 0 ? 1.64 : kind === 3 ? 1.35 : 1.18;
  const cockX = side * 0.34;
  const cockZ = 0.1;
  aim(side, cockX + (mx - cockX) * open, cockY + (my - cockY) * open, cockZ + (mz - cockZ) * open);
}

function poseGoalieCheer(s: Skater, body: THREE.Group, lArm: THREE.Group, rArm: THREE.Group, lFore: THREE.Group | null, rFore: THREE.Group | null, stick: THREE.Group | null) {
  body.position.y = 0;
  body.rotation.set(-0.1, 0, 0);
  const pump = (Math.sin(world.time * 5.4 + s.id) + 1) * 0.5;
  // Blocker and stick are body −X. Catcher (body +X) pumps. Pitch stays; yaw and roll flip.
  lArm.position.set(-0.24, 1.46, 0.1);
  rArm.position.set(0.36, 1.48, 0.08);
  lArm.rotation.set(-1.95, 0.12, -0.4);
  rArm.rotation.set(-1.85 - pump * 0.75, -0.1, 0.38);
  if (lFore) lFore.rotation.set(-0.18, 0.04, 0.02);
  if (rFore) rFore.rotation.set(-0.5, -0.08, -0.04);
  if (!stick) return;
  carryGoalieStick(stick, 0);
  keepGoalieStickOnIce(stick);
}

/**
 * Stick pad and glove pad in the root frame.
 * `front` is the shooter-facing face. `stick` / `glove` are catcher-axis centers
 * (body +X is the catcher, so the stick pad is negative).
 */
function goaliePadLane(root: THREE.Object3D): { front: number; stick: number; glove: number } | null {
  const stickPad = root.getObjectByName("goalieStickPad");
  const glovePad = root.getObjectByName("goalieGlovePad");
  if (!stickPad || !glovePad) return null;
  root.updateWorldMatrix(true, true);
  _padFwd.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_padQ));
  _padFwd.y = 0;
  if (_padFwd.lengthSq() < 1e-8) _padFwd.set(0, 0, 1);
  else _padFwd.normalize();
  _padCatch.crossVectors(_padUp, _padFwd);
  if (_padCatch.lengthSq() < 1e-8) return null;
  _padCatch.normalize();
  root.getWorldPosition(_padRoot);
  const laneOf = (pad: THREE.Object3D) => {
    _padBox.setFromObject(pad);
    let front = -Infinity;
    let lat = 0;
    let n = 0;
    const min = _padBox.min;
    const max = _padBox.max;
    for (let i = 0; i < 8; i++) {
      _corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z);
      const along = (_corner.x - _padRoot.x) * _padFwd.x + (_corner.z - _padRoot.z) * _padFwd.z;
      const side = (_corner.x - _padRoot.x) * _padCatch.x + (_corner.z - _padRoot.z) * _padCatch.z;
      if (along > front) front = along;
      lat += side;
      n++;
    }
    return { front, lat: lat / n };
  };
  const stick = laneOf(stickPad);
  const glove = laneOf(glovePad);
  return { front: Math.max(stick.front, glove.front), stick: stick.lat, glove: glove.lat };
}

/** Puck lateral in the goalie frame. +1 is body +X, the catcher. The blocker is body −X. */
function goalieLat(s: Skater, root: THREE.Object3D): number {
  const ry = root.rotation.y;
  const lat = (world.puck.x - s.x) * Math.cos(ry) - (world.puck.z - s.z) * Math.sin(ry);
  // ry = π/2 (facing +X): body +X is world −Z. A puck at +Z is the blocker and lat is negative.
  return Math.max(-1, Math.min(1, lat / 3));
}

function poseGoalieArms(s: Skater, l: THREE.Group, r: THREE.Group, lf: THREE.Group | null, rf: THREE.Group | null, cover: number) {
  const body = l.parent;
  const root = body?.parent;
  if (!body || !root || !lf || !rf) return;
  const u = Math.min(1, Math.max(0, cover));
  const lat = goalieLat(s, root);
  const flash = Math.max(0, s.gloveFlash);
  const flashUp = flash > 0.55 ? 1 : flash > 0.12 ? (flash - 0.12) / 0.43 : 0;
  const high = Math.max(flashUp, Math.max(0, Math.min(1, (world.puck.y - 0.08) / Math.max(0.4, GOAL_H - 0.18))));
  root.updateWorldMatrix(true, true);
  _ikD1.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_parentQ));
  _ikD1.y = 0;
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0, 0, 1);
  else _ikD1.normalize();
  _liftAxis.set(0, 1, 0);
  _ikD2.crossVectors(_liftAxis, _ikD1).normalize();
  if (goaliePlaysPuck(s)) return;
  const zKind = goalieZKind(s);
  if (zKind) {
    poseGoalieZArms(zKind, l, r, lf, rf, _goaliePalmAxis, _goalieBoardAxis);
    return;
  }
  if (goalieButterflyPose(s)) {
    poseGoalieButterflyArms(l, r, lf, rf, _goaliePalmAxis, _goalieBoardAxis);
    return;
  }
  const gripX: number = GOALIE_GRIP.x;
  const gripY: number = GOALIE_GRIP.y;
  const gripZ: number = GOALIE_GRIP.z;
  root.getWorldPosition(_handBot);
  _handBot.y = 1.2 + high * 0.38 - u * 0.04;
  _handBot.addScaledVector(_ikD1, 0.55);
  // _ikD2 is up × forward, which is body +X. Positive scale is the catcher.
  _handBot.addScaledVector(_ikD2, 0.76 + lat * 0.42);
  body.worldToLocal(_handBot);
  // Palm reaches about 0.19 m back toward the chest. 0.66 keeps that edge past the yoke.
  if (_handBot.x < 0.66) _handBot.x = 0.66;
  const gloveX = _handBot.x;
  const gloveY = _handBot.y;
  const gloveZ = _handBot.z;
  const fwdX = _ikD1.x;
  const fwdY = _ikD1.y;
  const fwdZ = _ikD1.z;
  _corner.copy(_ikD1).addScaledVector(_liftAxis, 0.32 + high * 0.35);
  // Catcher on body +X (r). Blocker and stick on body −X (l).
  // Check, root yaw π/2: grip world z = −GOALIE_GRIP.x > 0, pocket world z < 0.
  poseGoalieHand(body, r, rf, 0.34, 1.46, 0.1, gloveX, gloveY, gloveZ, 1, 0.34, 0.02, -0.32, 0.02, _goaliePalmAxis, _corner.x, _corner.y, _corner.z, true);
  poseGoalieHand(body, l, lf, -0.28, 1.42, 0.08, gripX, gripY, gripZ, -1, 0.24, 0.03, -0.22, 0.05, _goalieBoardAxis, fwdX, fwdY, fwdZ, false);
}

function poseGoalieStance(s: Skater, l: THREE.Group, r: THREE.Group, lf: THREE.Group | null, rf: THREE.Group | null) {
  poseGoalieArms(s, l, r, lf, rf, s.coverPose);
}

function carryGoalieStick(stick: THREE.Group, cover: number) {
  stick.visible = true;
  stick.position.set(0.03, -0.22, 0.05);
  stick.rotation.set(0.06 + cover * 0.1, 0.04, -0.16);
  stick.scale.set(1, 1, 1);
  const len = GOALIE_STICK_LEN;
  const shaft = stick.getObjectByName("goalieShaft");
  const blade = stick.getObjectByName("goalieBlade");
  const knob = stick.getObjectByName("goalieKnob");
  if (shaft) {
    shaft.position.set(0, -len / 6, 0);
    shaft.scale.set(1, len, 1);
  }
  if (knob) knob.position.set(0, len / 3, 0);
  if (blade) {
    blade.position.set(0, (-2 * len) / 3, 0);
    blade.scale.set(1, 1, 1);
    blade.quaternion.copy(_goalieCarryQ);
    const ice = blade.getObjectByName("goalieIce");
    if (ice) ice.position.set(0, 0.016, 0.13);
  }
}

function poseGoalieStick(stick: THREE.Group, cover: number, s: Skater, gloveArm: THREE.Object3D | null = null, gloveFore: THREE.Object3D | null = null) {
  const fore = stick.parent;
  const body = fore?.parent?.parent ?? null;
  const root = body?.parent ?? null;
  const shaft = stick.getObjectByName("goalieShaft");
  const blade = stick.getObjectByName("goalieBlade");
  const knob = stick.getObjectByName("goalieKnob");
  if (!fore || !body || !root || !shaft || !blade || !knob || Math.abs(body.rotation.x) > 0.9) {
    carryGoalieStick(stick, cover);
    return;
  }
  if (goaliePlaysPuck(s) && fore.parent && gloveArm && gloveFore) {
    const lane = goaliePadLane(root);
    poseGoaliePlay(fore.parent, fore, gloveArm, gloveFore, stick, world.puck.x, world.puck.z, lane?.front ?? 0.42, _goaliePalmAxis, _goalieBoardAxis);
    return;
  }
  root.updateWorldMatrix(true, true);
  // Facing +X (root yaw π/2): local +Z is world +X, the shooter. up × that = world −Z = body +X, the catcher.
  _ikD1.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_parentQ));
  _ikD1.y = 0;
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0, 0, 1);
  else _ikD1.normalize();
  _liftAxis.set(0, 1, 0);
  _ikD2.crossVectors(_liftAxis, _ikD1);
  if (_ikD2.lengthSq() < 1e-8) _ikD2.set(1, 0, 0);
  else _ikD2.normalize();
  const fx = _ikD1.x;
  const fy = _ikD1.y;
  const fz = _ikD1.z;
  const bx = _ikD2.x;
  const by = _ikD2.y;
  const bz = _ikD2.z;
  root.getWorldPosition(_handTop);
  const ox = _handTop.x;
  const oy = _handTop.y;
  const oz = _handTop.z;
  const anchorX = 0.03;
  const anchorY = -0.22;
  const anchorZ = 0.05;
  _corner.set(anchorX, anchorY, anchorZ);
  fore.localToWorld(_corner);
  const gx = _corner.x;
  const gy = _corner.y;
  const gz = _corner.z;
  const gripLat = (gx - ox) * bx + (gy - oy) * by + (gz - oz) * bz;
  const gripFwd = (gx - ox) * fx + (gy - oy) * fy + (gz - oz) * fz;
  if (gy - STICK_ICE_Y < 0.25) {
    carryGoalieStick(stick, cover);
    return;
  }
  const ice = blade.getObjectByName("goalieIce");
  if (!ice) {
    carryGoalieStick(stick, cover);
    return;
  }
  // Shaft rises back at 45° so the flat ice blade meets it at 135°. Paddle corners
  // sit below that centerline; the heel lifts and the blade mesh drops onto the ice.
  // The Z stances keep the heel on the grip's lateral and lead the pad face so the
  // blade sits on the ice in front of the pads. The ice mesh center is 0.13 ahead of the heel.
  const plantY = STICK_ICE_Y + 0.002;
  let heelLat = gripLat;
  let midHeelFwd: number | null = null;
  const zKind = goalieZKind(s);
  if (zKind) {
    const lane = goaliePadLane(root);
    if (lane) {
      midHeelFwd = lane.front + GOALIE_Z_BLADE_LEAD[zKind] - 0.13;
      // Compact butterfly keeps the blade on the stick pad. The hands sit on the chest,
      // so the grip's own lateral would plant the blade in the five-hole.
      if (zKind === "butterfly") heelLat = lane.stick;
    }
  } else if (goalieButterflyPose(s)) {
    // Hand is at the top corner. Keep the blade on the stick pad, not in the five-hole.
    const lane = goaliePadLane(root);
    if (lane) {
      heelLat = lane.stick;
      midHeelFwd = lane.front + GOALIE_BUTTERFLY_BLADE_LEAD - 0.13;
    }
  }
  const place = (heelY: number) => {
    const drop = gy - heelY;
    const heelFwd = midHeelFwd ?? gripFwd + drop;
    const hx = ox + fx * heelFwd + bx * heelLat;
    const hz = oz + fz * heelFwd + bz * heelLat;
    stick.position.set(anchorX, anchorY, anchorZ);
    stick.quaternion.identity();
    stick.scale.set(1, 1, 1);
    fore.updateWorldMatrix(true, false);
    _liftPt.set(hx, heelY, hz);
    fore.worldToLocal(_liftPt);
    _ikD1.set(_liftPt.x - anchorX, _liftPt.y - anchorY, _liftPt.z - anchorZ);
    const lower = _ikD1.length();
    if (lower < 0.2) return 0;
    _ikD1.multiplyScalar(1 / lower);
    _ikD2.set(-_ikD1.x, -_ikD1.y, -_ikD1.z);
    // Width faces the shooter: stick +X is body +X (catcher), flattened against the shaft.
    _ikN.set(bx, by, bz).applyQuaternion(fore.getWorldQuaternion(_parentQ).invert());
    _ikN.addScaledVector(_ikD2, -_ikN.dot(_ikD2));
    if (_ikN.lengthSq() < 1e-8) _ikN.set(1, 0, 0);
    else _ikN.normalize();
    _liftAxis.crossVectors(_ikN, _ikD2).normalize();
    _stickM.makeBasis(_ikN, _ikD2, _liftAxis);
    stick.quaternion.setFromRotationMatrix(_stickM);
    stick.position.set(anchorX, anchorY, anchorZ);
    stick.scale.set(1, 1, 1);
    const shaftBottom = -lower;
    const shaftTop = lower * 0.5;
    shaft.position.set(0, (shaftTop + shaftBottom) * 0.5, 0);
    shaft.scale.set(1, shaftTop - shaftBottom, 1);
    knob.position.set(0, shaftTop, 0);
    blade.position.set(0, -lower, 0);
    blade.scale.set(1, 1, 1);
    // Ice blade: +X toward the catcher, +Y up, +Z forward on the ice. Right-handed.
    _stickM.makeBasis(_ikD1.set(bx, by, bz), _ikD2.set(0, 1, 0), _liftAxis.set(fx, fy, fz));
    _stickQ.setFromRotationMatrix(_stickM);
    stick.updateWorldMatrix(true, false);
    stick.getWorldQuaternion(_parentQ).invert();
    blade.quaternion.copy(_parentQ).multiply(_stickQ);
    ice.position.set(0, 0.016 - (heelY - plantY), 0.13);
    return lower;
  };
  let heelY = STICK_ICE_Y;
  if (place(heelY) < 0.2) {
    carryGoalieStick(stick, cover);
    return;
  }
  for (let i = 0; i < 3; i++) {
    const dip = plantY - stickLowPoint(stick, _liftPt);
    if (dip <= 0.0005) break;
    heelY += dip;
    if (place(heelY) < 0.2) {
      carryGoalieStick(stick, cover);
      return;
    }
  }
}

function stickLowPoint(stick: THREE.Object3D, out: THREE.Vector3): number {
  let best = Infinity;
  stick.updateWorldMatrix(true, true);
  stick.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return;
    for (let i = 0; i < 8; i++) {
      _corner.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
      mesh.localToWorld(_corner);
      if (_corner.y < best) {
        best = _corner.y;
        out.copy(_corner);
      }
    }
  });
  return best;
}

function keepGoalieStickOnIce(stick: THREE.Group) {
  const parent = stick.parent;
  if (!parent) return;
  stick.updateWorldMatrix(true, true);
  _ikD2.set(0, 1, 0).applyQuaternion(stick.getWorldQuaternion(_stickQ));
  if (_ikD2.y > 0.995) {
    const low = stickLowPoint(stick, _liftPt);
    const dy = STICK_ICE_Y - low;
    if (Math.abs(dy) < 0.001) return;
    stick.getWorldPosition(_corner);
    _corner.y += dy;
    parent.worldToLocal(_corner);
    stick.position.copy(_corner);
    return;
  }
  for (let n = 0; n < 4; n++) {
    const low = stickLowPoint(stick, _liftPt);
    if (low >= STICK_ICE_Y) return;
    stick.getWorldPosition(_handTop);
    _ikD1.copy(_liftPt).sub(_handTop);
    const horiz = Math.hypot(_ikD1.x, _ikD1.z);
    if (horiz < 0.05) break;
    const ang = Math.min(0.5, (STICK_ICE_Y - low) / horiz);
    _liftAxis.set(-_ikD1.z, 0, _ikD1.x).normalize();
    _stickQ.setFromAxisAngle(_liftAxis, ang);
    stick.getWorldQuaternion(_parentQ);
    _parentQ.premultiply(_stickQ);
    parent.getWorldQuaternion(_stickQ);
    stick.quaternion.copy(_stickQ.invert()).multiply(_parentQ);
  }
  const low = stickLowPoint(stick, _liftPt);
  if (low >= STICK_ICE_Y) return;
  stick.getWorldPosition(_liftPt);
  _liftPt.y += STICK_ICE_Y - low;
  parent.worldToLocal(_liftPt);
  stick.position.copy(_liftPt);
}

/** Shin -Y runs out along the ice. An X hinge would fold the calf back toward the torso. */
function poseGoalieShin(body: THREE.Group, leg: THREE.Group, shin: THREE.Group, side: number) {
  _legInv.copy(body.quaternion).multiply(leg.quaternion).invert();
  _shinZ.set(0, 0, 1).applyQuaternion(_legInv).normalize();
  _shinY.set(side, 0, 0).applyQuaternion(_legInv).negate().normalize();
  _shinX.crossVectors(_shinY, _shinZ).normalize();
  _shinZ.crossVectors(_shinX, _shinY).normalize();
  shin.quaternion.setFromRotationMatrix(_shinBasis.makeBasis(_shinX, _shinY, _shinZ));
}

/** Upright skate at the end of the shin, toe out, blade on the knee's ice line. */
function poseGoalieBoot(root: THREE.Object3D, shin: THREE.Object3D, boot: THREE.Group, side: number) {
  root.updateWorldMatrix(true, true);
  root.getWorldQuaternion(_rootQ);
  _bootY.set(0, 1, 0);
  _bootZ.set(side, 0, 0).applyQuaternion(_rootQ).normalize();
  _bootX.crossVectors(_bootY, _bootZ).normalize();
  _bootZ.crossVectors(_bootX, _bootY).normalize();
  _bootQ.setFromRotationMatrix(_bootBasis.makeBasis(_bootX, _bootY, _bootZ));
  shin.getWorldQuaternion(_legInv);
  boot.quaternion.copy(_legInv.invert()).multiply(_bootQ);
  _corner.set(0, -0.42, 0.02);
  shin.localToWorld(_corner);
  _corner.addScaledVector(_bootY, GOALIE_BOOT_LIFT);
  shin.worldToLocal(_corner);
  boot.position.copy(_corner);
}

function resetGoalieBoot(boot: THREE.Group | null) {
  if (!boot) return;
  boot.position.set(0, -0.42, 0.04);
  boot.rotation.set(0, 0, 0);
}

function resetGoalieShinPad(shin: THREE.Object3D | null, side: -1 | 1) {
  const pad = shin?.getObjectByName("goalieShinPad");
  if (!pad) return;
  pad.position.set(side * GOALIE_SHIN_LIFT, -GOALIE_SHIN_HALF_L, GOALIE_SHIN_MESH_Z);
}

/** Slide the pad up the shin until the skate blade is the ice contact. */
function tuckGoaliePadToSkate(shin: THREE.Object3D | null, boot: THREE.Object3D | null) {
  const pad = shin?.getObjectByName("goalieShinPad");
  const blade = boot?.getObjectByName("goalieSkateBlade") ?? boot;
  if (!shin || !pad || !blade) return;
  for (let n = 0; n < 16; n++) {
    shin.updateWorldMatrix(true, true);
    const padLow = stickLowPoint(pad, _liftPt);
    const bladeLow = stickLowPoint(blade, _corner);
    if (padLow >= bladeLow - 0.006) return;
    pad.position.y += 0.01;
  }
}

function poseGoaliePads(s: Skater, root: THREE.Group, body: THREE.Group | null, lLeg: THREE.Group | null, rLeg: THREE.Group | null, lShin: THREE.Group | null, rShin: THREE.Group | null, lBoot: THREE.Group | null, rBoot: THREE.Group | null) {
  const cover = Math.min(1, Math.max(0, s.coverPose));
  const struckY = s.struck > 0.2 ? -0.18 * Math.min(1, s.struck) : 0;
  const diveU = s.dive > 0.04 ? Math.min(1, s.dive / 0.95) : 0;
  root.position.y = 0;
  resetGoalieShinPad(lShin, -1);
  resetGoalieShinPad(rShin, 1);
  const playing = goaliePlaysPuck(s);
  const zKind = playing ? null : goalieZKind(s);
  if (playing && body && lLeg && rLeg && lShin && rShin) {
    poseGoalieZLimbs(root, body, lLeg, rLeg, lShin, rShin, lBoot, rBoot, GOALIE_Z.perimeter, s.bank * 0.15);
    tuckGoaliePadToSkate(lShin, lBoot);
    tuckGoaliePadToSkate(rShin, rBoot);
  } else if (zKind === "butterfly" && body && lLeg && rLeg && lShin && rShin) {
    poseGoalieButterflyStanceLimbs(root, body, lLeg, rLeg, lShin, rShin, lBoot, rBoot, s.bank * 0.15);
  } else if (zKind && body && lLeg && rLeg && lShin && rShin) {
    poseGoalieZLimbs(root, body, lLeg, rLeg, lShin, rShin, lBoot, rBoot, GOALIE_Z[zKind], s.bank * 0.15);
    tuckGoaliePadToSkate(lShin, lBoot);
    tuckGoaliePadToSkate(rShin, rBoot);
  } else if (goalieButterflyPose(s) && body && lLeg && rLeg && lShin && rShin) {
    poseGoalieButterflyLimbs(root, body, lLeg, rLeg, lShin, rShin, lBoot, rBoot);
  } else {
    if (body) {
      const def = defendDir(s.side);
      const dx = (world.puck.x - def * BLUE_X) * def;
      const alert = Math.max(0, Math.min(1, (dx + 9) / 11));
      let pitch = 0.2 + 0.06 * cover + alert * 0.1 * (1 - cover) + (s.hit > 0 ? 0.2 : 0);
      if (diveU > 0) pitch += (Math.max(pitch, GOALIE_DIVE_PITCH) - pitch) * diveU;
      body.position.y = GOALIE_DIVE_DROP * diveU;
      body.rotation.x = pitch;
      body.rotation.z = s.bank * (1 - cover) * 0.4 * (1 - diveU);
      body.rotation.y = 0;
    }
    const poseLeg = (leg: THREE.Group | null, shin: THREE.Group | null, boot: THREE.Group | null, side: number, pad: number) => {
      if (!leg) return;
      const kick = Math.max(0, pad - 0.17) * (1 - cover);
      const hipX = 0.2 + 0.06 * cover + kick * 0.05;
      const hipZ = 0.05 + 0.04 * cover;
      leg.position.set(side * hipX, 0.82, hipZ);
      const planted = body ? -body.rotation.x : 0;
      leg.rotation.set(planted, 0, 0);
      if (shin && body) poseGoalieShin(body, leg, shin, side);
      else if (shin) shin.rotation.set(0, 0, side * (Math.PI / 2));
      if (boot && shin) poseGoalieBoot(root, shin, boot, side);
      if (diveU > 0 && body && shin) {
        _parentQ.copy(shin.quaternion);
        if (boot) {
          _bootQ.copy(boot.quaternion);
          _corner.copy(boot.position);
        }
        leg.rotation.x = planted + (GOALIE_DIVE_THIGH - planted) * diveU;
        shin.rotation.set(GOALIE_DIVE_KNEE, 0, 0);
        _stickQ.copy(shin.quaternion);
        shin.quaternion.copy(_parentQ).slerp(_stickQ, diveU);
        if (boot) {
          boot.rotation.set(-(body.rotation.x + leg.rotation.x + GOALIE_DIVE_KNEE), 0, 0);
          _stickQ.copy(boot.quaternion);
          boot.quaternion.copy(_bootQ).slerp(_stickQ, diveU);
          _blendP.set(0, -0.42, 0.04);
          boot.position.copy(_corner).lerp(_blendP, diveU);
        }
      }
    };
    poseLeg(lLeg, lShin, lBoot, -1, s.lPad);
    poseLeg(rLeg, rShin, rBoot, 1, s.rPad);
  }
  root.updateWorldMatrix(true, true);
  let low = Infinity;
  if (lLeg) low = Math.min(low, stickLowPoint(lLeg, _liftPt));
  if (rLeg) low = Math.min(low, stickLowPoint(rLeg, _liftPt));
  if (low < Infinity) root.position.y = 0.02 - low + struckY;
}

function poseGoalieCover(s: Skater, _root: THREE.Group, _body: THREE.Group | null, _lLeg: THREE.Group | null, _rLeg: THREE.Group | null, lArm: THREE.Group | null, rArm: THREE.Group | null, lFore: THREE.Group | null, rFore: THREE.Group | null, stick: THREE.Group | null): boolean {
  const cover = Math.min(1, Math.max(0, s.coverPose));
  if (cover < 0.08) return false;
  if (lArm && rArm) poseGoalieArms(s, lArm, rArm, lFore, rFore, cover);
  if (stick) {
    poseGoalieStick(stick, cover, s);
    keepGoalieStickOnIce(stick);
  }
  return true;
}

const TUMBLE_PITCH_MAX = 1.12;
const TUMBLE_PITCH_RATE = 1.55;
/** u where tumbleRoot pitch hits its cap. Before this the body is still going down. */
const TUMBLE_UP = TUMBLE_PITCH_MAX / TUMBLE_PITCH_RATE;

function tumbleRoot(struck: number, tumble: number, yaw: number) {
  const u = Math.min(1, Math.max(0, 1 - struck / 1.68));
  const pitch = Math.min(TUMBLE_PITCH_MAX, u * TUMBLE_PITCH_RATE);
  const spin = u * 4.6 * tumble;
  const roll = Math.sin(spin) * 0.48;
  const y = 0.1 + Math.sin(pitch) * 0.36 + Math.abs(roll) * 0.22;
  return { y, rx: pitch, ry: yaw + Math.PI + spin * 0.45, rz: roll };
}

/**
 * Circle on the rink. `localX` / `localZ` are the offset in the parent's yaw frame
 * before this replaces the mesh matrix. Pitch, roll, and a non-uniform parent scale
 * shear a position/quaternion/scale, so the matrix is written directly.
 */
function plantRinkShadow(shadow: THREE.Object3D, localX: number, localZ: number, uniform: number) {
  const parent = shadow.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.getWorldPosition(_rinkShadowPos);
  parent.getWorldQuaternion(_rinkShadowParentQ);
  // Parent local +Z, flattened. Ry maps that to (sin yaw, 0, cos yaw) and local +X to (fwd.z, 0, -fwd.x).
  _rinkShadowZ.set(0, 0, 1).applyQuaternion(_rinkShadowParentQ);
  _rinkShadowZ.y = 0;
  if (_rinkShadowZ.lengthSq() < 1e-8) _rinkShadowZ.set(0, 0, 1);
  else _rinkShadowZ.normalize();
  _rinkShadowX.set(_rinkShadowZ.z, 0, -_rinkShadowZ.x);
  _rinkShadowPos.x += (_rinkShadowX.x * localX + _rinkShadowZ.x * localZ) * uniform;
  _rinkShadowPos.z += (_rinkShadowX.z * localX + _rinkShadowZ.z * localZ) * uniform;
  _rinkShadowPos.y = SHADOW_ICE_Y;
  _rinkShadowScale.set(uniform, uniform, uniform);
  _rinkShadowWorld.compose(_rinkShadowPos, _rinkShadowFlat, _rinkShadowScale);
  shadow.matrix.copy(parent.matrixWorld).invert().multiply(_rinkShadowWorld);
  shadow.matrixAutoUpdate = false;
  shadow.matrixWorldNeedsUpdate = true;
}

/** 0 when the fall finishes tipping, 1 when tumbling ends (struck just above 0.1). */
function struckRise(u: number): number {
  const end = 1 - 0.1 / 1.68;
  const raw = (u - TUMBLE_UP) / (end - TUMBLE_UP);
  const x = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  return x * x * (3 - 2 * x);
}

type GetUpFrame = {
  brx: number;
  brz: number;
  lx: number;
  ly: number;
  lz: number;
  lrx: number;
  lrz: number;
  ls: number;
  rx: number;
  ry: number;
  rz: number;
  rrx: number;
  rrz: number;
  rs: number;
  lpx: number;
  lpy: number;
  lpz: number;
  larx: number;
  lary: number;
  larz: number;
  lfr: number;
  rpx: number;
  rpy: number;
  rpz: number;
  rarx: number;
  rary: number;
  rarz: number;
  rfr: number;
};

const GOALIE_DOWN: GetUpFrame = {
  brx: 1.15,
  brz: 0.18,
  lx: -0.18,
  ly: 0.82,
  lz: 0.12,
  lrx: 0.9,
  lrz: -0.55,
  ls: 1.8,
  rx: 0.16,
  ry: 0.82,
  rz: 0.12,
  rrx: 1.05,
  rrz: 0.44,
  rs: 1.9,
  lpx: -0.24,
  lpy: 1.46,
  lpz: 0.06,
  larx: -0.4,
  lary: 0,
  larz: 1.1,
  lfr: 0,
  rpx: 0.26,
  rpy: 1.46,
  rpz: 0.06,
  rarx: -1.4,
  rary: 0,
  rarz: -0.2,
  rfr: -1.2,
};

const GOALIE_ONE: GetUpFrame = {
  brx: 1.05,
  brz: 0.08,
  lx: -0.2,
  ly: 0.82,
  lz: 0.16,
  lrx: 0.7,
  lrz: -0.4,
  ls: 1.2,
  rx: 0.16,
  ry: 0.82,
  rz: 0.08,
  rrx: -0.45,
  rrz: 0.12,
  rs: 0.85,
  lpx: -0.22,
  lpy: 1.4,
  lpz: 0.1,
  larx: -0.65,
  lary: 0.08,
  larz: 0.22,
  lfr: -0.35,
  rpx: 0.34,
  rpy: 1.42,
  rpz: 0.1,
  rarx: -1.25,
  rary: -0.08,
  rarz: -0.32,
  rfr: -0.85,
};

const GOALIE_BOTH: GetUpFrame = {
  brx: 0.14,
  brz: 0,
  lx: -0.12,
  ly: 0.82,
  lz: 0.04,
  lrx: 0.14,
  lrz: -0.08,
  ls: 0.2,
  rx: 0.12,
  ry: 0.82,
  rz: 0.04,
  rrx: 0.14,
  rrz: 0.08,
  rs: 0.2,
  lpx: -0.22,
  lpy: 1.4,
  lpz: 0.12,
  larx: -0.6,
  lary: 0.1,
  larz: -0.2,
  lfr: -0.22,
  rpx: 0.36,
  rpy: 1.44,
  rpz: 0.1,
  rarx: -0.5,
  rary: -0.16,
  rarz: 0.5,
  rfr: -0.85,
};

function mixGetUp(a: GetUpFrame, b: GetUpFrame, t: number): GetUpFrame {
  const o = { ...a };
  for (const k of Object.keys(a) as (keyof GetUpFrame)[]) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}

function poseGoalieGetUp(s: Skater, root: THREE.Group, body: THREE.Group | null, lLeg: THREE.Group | null, rLeg: THREE.Group | null, lShin: THREE.Group | null, rShin: THREE.Group | null, lArm: THREE.Group | null, rArm: THREE.Group | null, lFore: THREE.Group | null, rFore: THREE.Group | null, stick: THREE.Group | null, lBoot: THREE.Group | null, rBoot: THREE.Group | null) {
  const p = Math.min(1, Math.max(0, (1.68 - s.struck) / 1.52));
  const smooth = p < 0.42 ? p / 0.42 : (p - 0.42) / 0.58;
  const u = smooth * smooth * (3 - 2 * smooth);
  const k = p < 0.42 ? mixGetUp(GOALIE_DOWN, GOALIE_ONE, u) : mixGetUp(GOALIE_ONE, GOALIE_BOTH, u);
  const roll = Math.sign(s.tumble || 1) * 0.22 * (1 - p) * (1 - p);
  root.position.set(s.x, 0, s.z);
  root.rotation.set(0, s.yaw + Math.PI, roll);
  if (body) {
    body.position.set(0, 0, 0);
    body.rotation.set(k.brx, 0, k.brz);
  }
  if (lLeg) {
    lLeg.position.set(k.lx, k.ly, k.lz);
    lLeg.rotation.set(k.lrx, 0, k.lrz);
  }
  if (rLeg) {
    rLeg.position.set(k.rx, k.ry, k.rz);
    rLeg.rotation.set(k.rrx, 0, k.rrz);
  }
  if (lShin) lShin.rotation.set(k.ls, 0, 0);
  if (rShin) rShin.rotation.set(k.rs, 0, 0);
  resetGoalieBoot(lBoot);
  resetGoalieBoot(rBoot);
  if (lArm) {
    lArm.position.set(k.lpx, k.lpy, k.lpz);
    lArm.rotation.set(k.larx, k.lary, k.larz);
  }
  if (rArm) {
    rArm.position.set(k.rpx, k.rpy, k.rpz);
    rArm.rotation.set(k.rarx, k.rary, k.rarz);
  }
  if (lFore) lFore.rotation.set(k.lfr, 0, 0);
  if (rFore) rFore.rotation.set(k.rfr, 0, 0);
  root.updateWorldMatrix(true, true);
  const wy = (obj: THREE.Object3D, x: number, y: number, z: number) => {
    _liftPt.set(x, y, z);
    obj.localToWorld(_liftPt);
    return _liftPt.y;
  };
  const lb = lShin ? stickLowPoint(lShin, _corner) : 0;
  const rb = rShin ? stickLowPoint(rShin, _corner) : 0;
  const knees = Math.min(lShin ? wy(lShin, 0, 0, 0) : 1, rShin ? wy(rShin, 0, 0, 0) : 1);
  const chest = body ? wy(body, 0, 0.9, 0.12) : 0;
  const hip = body ? wy(body, 0, 0.76, 0) : 0;
  const bodyLow = Math.min(knees, chest, hip);
  let lift: number;
  if (p < 0.42) lift = 0.04 - Math.min(bodyLow, lb, rb);
  else if (p < 0.78) lift = 0.03 - Math.min(rb, bodyLow, lb);
  else {
    const gnd = 0.03 - Math.min(lb, rb, bodyLow);
    const settle = (p - 0.78) / 0.22;
    lift = gnd * (1 - settle) + -0.12 * settle;
  }
  root.position.y = lift;
  if (stick) {
    carryGoalieStick(stick, 0);
    keepGoalieStickOnIce(stick);
  }
}

function SkateSole({ mats, position, goalie = false, bladeName }: { mats: Pick<KitMats, "blade" | "skates" | "mask">; position: [number, number, number]; goalie?: boolean; bladeName?: string }) {
  const roller = useGame((s) => s.clockMode) === "scrimmage";
  if (!roller) {
    return <mesh name={bladeName} geometry={bladeGeo} material={mats.blade} position={position} />;
  }
  const zs = goalie ? GOALIE_WHEEL_Z : SKATE_WHEEL_Z;
  return (
    <group position={position}>
      <mesh geometry={goalie ? goalieFrameGeo : skateFrameGeo} material={mats.skates} position={[0, 0.016, 0]} />
      {zs.map((z) => (
        <group key={z} position={[0, 0, z]} rotation={[0, 0, Math.PI / 2]}>
          <mesh geometry={wheelTireGeo} material={mats.mask} />
          <mesh geometry={wheelHubGeo} material={mats.blade} />
        </group>
      ))}
    </group>
  );
}

function brawlPoseFor(id: number): { kind: 0 | 1; swing: number; celeb: boolean; ko: boolean } | null {
  const b = world.lineBrawl;
  if (!b) return null;
  for (const p of b.pairs) {
    if (p.home === id) return { kind: p.homeKind, swing: p.homeSwing, celeb: p.celeb > 0, ko: false };
    if (p.away === id) return { kind: p.awayKind, swing: p.awaySwing, celeb: false, ko: p.ko };
  }
  return null;
}

function poseBrawl(kind: 0 | 1, swing: number, body: THREE.Group, lArm: THREE.Group, rArm: THREE.Group, lFore: THREE.Group, rFore: THREE.Group, stick: THREE.Group | null, root: THREE.Group, layout: { len: number }, goalie: boolean) {
  const jab = Math.sin(Math.min(1, Math.max(0, swing)) * Math.PI);
  lArm.position.set(-0.26, 1.46, 0.06);
  rArm.position.set(0.24, 1.46, 0.06);
  if (swing < 0.04) {
    poseGloveAt(body, lArm, lFore, -0.26, 1.46, 0.06, -0.22, 1.25, 0.38, -1);
    poseGloveAt(body, rArm, rFore, 0.24, 1.46, 0.06, 0.18, 1.22, 0.36, 1);
  } else if (kind === 0) {
    poseGloveAt(body, lArm, lFore, -0.26, 1.46, 0.06, -0.28, 1.28, 0.26, -1);
    poseGloveAt(body, rArm, rFore, 0.24, 1.46, 0.06, 0.06, 1.32, 0.16 + jab * 0.78, 1);
  } else {
    const up = swing < 0.55 ? swing / 0.55 : 1;
    poseGloveAt(body, lArm, lFore, -0.26, 1.46, 0.06, -0.28, 1.22, 0.24, -1);
    poseGloveAt(body, rArm, rFore, 0.24, 1.46, 0.06, 0.1, 0.7 + up * 1.2, 0.18 + up * 0.32, 1);
  }
  if (!goalie && stick) poseStickOneHand(stick, root, lFore, layout);
}

/** Leather frame with the net pocket set into the opening, facing the shooter. */
function Catcher({ mats }: { mats: KitMats }) {
  return (
    <>
      <mesh geometry={catcherCuffGeo} material={mats.catcher} position={[0, -0.18, 0.01]} rotation={[0.08, 0.1, 0.06]} />
      <mesh geometry={catcherThumbGeo} material={mats.catcher} position={[-0.06, -0.28, 0.03]} rotation={[0.06, 0.42, 0.22]} />
      <group position={[0.02, -0.32, 0.02]} rotation={[0.1, 0.16, 0.22]}>
        <mesh geometry={catcherBackGeo} material={mats.catcher} position={[0, 0, -0.048]} castShadow />
        <mesh geometry={catcherRimXGeo} material={mats.catcher} position={[-0.105, 0, 0.012]} castShadow />
        <mesh geometry={catcherRimXGeo} material={mats.catcher} position={[0.105, 0, 0.012]} castShadow />
        <mesh geometry={catcherRimYGeo} material={mats.catcher} position={[0, 0.0975, 0.012]} castShadow />
        <mesh geometry={catcherRimYGeo} material={mats.catcher} position={[0, -0.0975, 0.012]} castShadow />
        <mesh geometry={catcherPocketNetGeo} material={mats.catcherMesh} position={[0, 0, -0.004]} renderOrder={1} />
        <mesh geometry={catcherWebGeo} material={mats.catcherWeb} position={[0, 0.105, 0.02]} scale={[0.9, 0.3, 0.7]} />
      </group>
    </>
  );
}

export function PlayerMesh({ index, kitId }: { index: number; kitId: number }) {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const side = world.skaters[index]?.side;
  const liveKitId = (side === "away" ? awayKit : homeKit) ?? kitId;
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const lLeg = useRef<THREE.Group>(null);
  const rLeg = useRef<THREE.Group>(null);
  const lShin = useRef<THREE.Group>(null);
  const rShin = useRef<THREE.Group>(null);
  const lBoot = useRef<THREE.Group>(null);
  const rBoot = useRef<THREE.Group>(null);
  const lArm = useRef<THREE.Group>(null);
  const rArm = useRef<THREE.Group>(null);
  const lFore = useRef<THREE.Group>(null);
  const rFore = useRef<THREE.Group>(null);
  const blocker = useRef<THREE.Group>(null);
  const stick = useRef<THREE.Group>(null);
  const shaftHold = useRef<THREE.Group>(null);
  const bladeGrp = useRef<THREE.Group>(null);
  const knobRef = useRef<THREE.Mesh>(null);
  const flyBlade = useRef<THREE.Group>(null);
  const flyShaft = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const skater = world.skaters[index]!;
  const kit = kitById(liveKitId);
  const goalie = skater.kind === "goalie";
  const mats = useMemo(() => makeKitMats(kit, skater.number, goalie), [liveKitId, kit, skater.number, goalie]);
  const layout = useMemo(() => stickLayout(goalie), [goalie]);
  const wristLeft = useRef(0);
  const wristSpan = useRef(0);
  const wristShotAt = useRef(-100);
  const wristFrom = useRef<WristKey | null>(null);
  const wristHold = useRef<WristKey | null>(null);
  const wristBack = useRef(false);
  const pokeLeft = useRef(0);
  const pokeSnap = useRef<PokeSnap | null>(null);
  const checkElapsed = useRef(0);
  const checkWas = useRef(false);
  const checkSide = useRef<1 | -1>(-1);

  useLayoutEffect(() => () => disposeKit(mats), [mats]);

  useLayoutEffect(() => {
    root.current?.traverse((obj) => {
      obj.frustumCulled = false;
    });
  }, []);

  useFrame((_, delta) => {
    const s: Skater | undefined = world.skaters[index];
    const g = root.current;
    if (!s || !g) return;
    g.visible = true;
    const diveU = Math.min(1, Math.max(0, s.dive / 0.95));
    const diving = !goalie && s.dive > 0.04;
    const tumbling = s.tumble !== 0 && s.struck > 0.1;
    const tumbleU = tumbling ? Math.min(1, Math.max(0, 1 - s.struck / 1.68)) : 0;
    const tumbleRise = tumbling && tumbleU >= TUMBLE_UP;
    const fallHand = tumbling && !tumbleRise;
    const goalieUp = goalie && tumbling;
    if (tumbling && !goalieUp) {
      const t = tumbleRoot(s.struck, s.tumble, s.yaw);
      g.position.set(s.x, t.y, s.z);
      g.rotation.set(t.rx, t.ry, t.rz);
    } else if (!goalieUp) {
      g.position.set(s.x, diving ? 0.12 * diveU : s.struck > 0.2 ? Math.max(0, 0.04 - 0.04 * Math.min(1, s.struck)) : 0, s.z);
      g.rotation.set(0, meshYaw(s) + Math.PI, 0);
    }
    if (goalie) g.scale.set(1.14, 1, 1.14);
    else g.scale.set(1, 1, 1);
    const poke = s.poke > 0.04;
    const wind = s.windup;
    const follow = s.follow;
    const dekeA = s.deke > 0.02 ? Math.sin(s.deke * 12) : 0;
    const cheer = !goalie && s.celebrate > 0.05;
    const goalieCheer = goalie && !tumbling && s.celebrate > 0.05;
    const rage = !goalie ? rageDraw(s.id) : null;
    let swingT = 0;
    let slapping = false;
    if (follow > 0.02) {
      const u = 1 - Math.min(1, follow / 0.62);
      const startT = -Math.max(0.4, wind);
      swingT = startT + u * (1 - startT);
      slapping = true;
    } else if (wind > 0.04) {
      swingT = -wind;
      slapping = true;
    }
    const slapRelease = follow > 0.02 && world.lastShotSlap && world.lastShooter === s.id;
    const slapLoad = follow <= 0.02 && wind > 0.5;
    const wristBlocked = goalie || poke || diving || tumbling || cheer || !!rage || s.hit > 0 || s.struck > 0.2 || !!brawlPoseFor(s.id);
    if (world.windupCancel && follow <= 0.02 && wind <= 0.04) {
      wristFrom.current = null;
      wristBack.current = false;
    }
    if (wristBlocked || slapRelease || slapLoad) {
      wristLeft.current = 0;
      if (slapLoad || slapRelease) wristFrom.current = null;
      wristBack.current = false;
    } else if (world.lastShooter === s.id && !world.lastShotSlap && world.time - world.lastShoot < 0.1 && wristShotAt.current !== world.lastShoot && (follow > 0.02 || wristFrom.current)) {
      wristShotAt.current = world.lastShoot;
      const span = Math.max(0.46, follow > 0.02 ? follow + Math.max(0, world.time - world.lastShoot) : 0.46);
      wristSpan.current = span;
      wristLeft.current = span;
      wristHold.current = wristFrom.current ?? WRIST_CARRY;
      wristFrom.current = null;
      wristBack.current = world.lastShotBackhand;
    }
    if (wristLeft.current > 0) wristLeft.current = Math.max(0, wristLeft.current - Math.min(0.05, delta || 0));
    let wristKey: WristKey | null = null;
    let wristIce = false;
    let wristWatch: "puck" | "net" = "puck";
    const ownsPuck = world.puck.owner === index;
    if (!wristBlocked && !slapRelease && !slapLoad && wristLeft.current > 0 && wristSpan.current > 0) {
      const elapsed = wristSpan.current - wristLeft.current;
      const after = wristAfter(elapsed, wristSpan.current);
      const from = wristHold.current ?? WRIST_CARRY;
      const releaseKey = wristBack.current ? BH_RELEASE : WRIST_RELEASE;
      const followKey = wristBack.current ? BH_FOLLOW : WRIST_FOLLOW;
      const settleKey = wristBack.current ? WRIST_CARRY : ownsPuck ? WRIST_CARRY : WRIST_SETTLE;
      if (after.phase === "release") wristKey = lerpWrist(from, releaseKey, after.u);
      else if (after.phase === "follow") wristKey = lerpWrist(releaseKey, followKey, after.u);
      else wristKey = lerpWrist(followKey, settleKey, after.u);
      wristIce = after.phase === "release";
      wristWatch = "net";
    } else if (!wristBlocked && !slapRelease && !slapLoad && follow <= 0.02 && wind > 0.04 && wind <= 0.5 && ownsPuck && !world.windupCancel) {
      const backhandWind = world.lastShotBackhand && s.id === world.userId;
      const loadKey = backhandWind ? BH_LOAD : WRIST_LOAD;
      const plantKey = backhandWind ? BH_PLANT : WRIST_PLANT;
      const prep = Math.min(1, wind / 0.28);
      if (prep < 0.5) wristKey = lerpWrist(WRIST_CARRY, loadKey, prep / 0.5);
      else wristKey = lerpWrist(loadKey, plantKey, (prep - 0.5) / 0.5);
      wristFrom.current = wristKey;
      wristIce = true;
      wristWatch = "puck";
    }
    const wrist = wristKey !== null;
    const slap = !wrist && (slapLoad || slapRelease) ? slapStick(wind, follow) : null;
    const carryPose = !goalie && world.puck.owner === index && !slapping && !wrist && !diving && !tumbling && !cheer && !rage && s.struck <= 0.2 && !brawlPoseFor(s.id);
    const dekeAmt = carryPose ? dekePull(s.deke) : 0;
    const dekePose = carryPose && s.deke > 0.02;
    const pokeReach = !goalie && world.puck.owner !== index && (poke || puckNearSkater(s)) && !slapping && !wrist && !diving && !tumbling && !cheer && !rage && s.hit <= 0 && s.struck <= 0.2 && !brawlPoseFor(s.id);
    let pokePosed = false;
    let pokeToeX = 0;
    let pokeToeZ = 1;
    const pokeStop = diving || tumbling || cheer || !!rage || !!brawlPoseFor(s.id) || slapping || wrist || s.hit > 0 || s.struck > 0.2;
    if (goalie && !tumbling) {
      poseGoaliePads(s, g, body.current, lLeg.current, rLeg.current, lShin.current, rShin.current, lBoot.current, rBoot.current);
    }
    const butterflied = goalie && !tumbling && !goalieCheer && poseGoalieCover(s, g, body.current, lLeg.current, rLeg.current, lArm.current, rArm.current, lFore.current, rFore.current, stick.current);
    const checking = !goalie && s.hit > 0 && !diving && !tumbling && s.struck <= 0.2 && !slapping && !wrist && !rage;
    if (checking) {
      if (!checkWas.current) {
        checkElapsed.current = 0;
        checkSide.current = latchCheckSide(g, s);
      }
      checkElapsed.current += Math.min(0.05, delta || 0);
    }
    checkWas.current = checking;
    const checkT = checking ? checkTargets(checkSide.current, checkElapsed.current, s.hit) : null;
    const absorbK = !goalie && !tumbling && !diving && !rage && !checking && s.struck > 0.2 ? smooth01(Math.min(1, (Math.min(s.struck, 1.15) - 0.2) / 0.7)) : 0;
    if (body.current && !butterflied && !goalie && !rage) {
      if (cheer && s.hit <= 0) {
        body.current.position.x = 0;
        body.current.position.y = 0;
        body.current.position.z = 0;
        body.current.rotation.set(0, 0, 0);
      } else if (wrist && wristKey) {
        body.current.position.x = wristKey.weight;
        body.current.position.y = wristKey.drop;
        body.current.position.z = 0;
        body.current.rotation.x = wristKey.hip;
        body.current.rotation.y = wristHipYaw(s, wristKey.aim, wristKey.open);
        body.current.rotation.z = 0;
      } else {
        body.current.position.x = 0;
        let pitch = s.lean;
        if (slapping) pitch += swingT * 0.28;
        if (carryPose) pitch = CARRY_HIP;
        if (pokeReach) pitch += POKE_HIP;
        if (diving) pitch = s.lean + (DIVE_PITCH - s.lean) * diveU;
        let roll = diving ? 0 : dekePose ? s.bank : s.deke > 0.02 ? dekeA * 0.16 : s.bank;
        let drop = diving ? DIVE_DROP * diveU : carryPose ? CARRY_DROP : pokeReach ? pokeBodyDrop(pitch) : 0;
        let yaw = slapping ? swingT * 0.4 : -DEKE_HIP_YAW * dekeAmt;
        let bz = 0;
        if (checkT) {
          const w = checkT.influence;
          pitch += (checkT.pitch - pitch) * w;
          drop += (checkT.drop - drop) * w;
          yaw += (checkT.yaw - yaw) * w;
          roll *= 1 - w;
          bz = checkT.bz * w;
        } else if (absorbK > 0) {
          pitch += (RECV_PITCH - pitch) * absorbK;
          const knee = 0.24 + (RECV_KNEE - 0.24) * absorbK;
          const planted = checkPlant(pitch, knee, RECV_DORSI);
          drop += (planted.drop - drop) * absorbK;
          bz = -Math.sin(pitch) * SKATER_HIP_Y * absorbK;
          roll *= 1 - absorbK;
        }
        body.current.position.y = drop;
        body.current.position.z = bz;
        body.current.rotation.x = pitch;
        body.current.rotation.z = roll;
        body.current.rotation.y = yaw;
      }
    }
    const amp = s.kind === "goalie" ? 0.08 : 0.52;
    const a = Math.sin(s.stride) * amp;
    const b = Math.sin(s.stride + Math.PI) * amp;
    if (!goalie && diving) {
      const mix = (from: number, to: number) => from + (to - from) * diveU;
      const kneeL = 0.22 + Math.max(0, -a) * 1.15;
      const kneeR = 0.22 + Math.max(0, -b) * 1.15;
      const bootL = -0.1 - kneeL * 0.32 + Math.max(0, a) * 0.18;
      const bootR = -0.1 - kneeR * 0.32 + Math.max(0, b) * 0.18;
      if (lLeg.current) {
        lLeg.current.position.set(-SKATER_HIP_X, SKATER_HIP_Y, 0);
        lLeg.current.rotation.set(mix(a, DIVE_THIGH), 0, 0);
      }
      if (rLeg.current) {
        rLeg.current.position.set(SKATER_HIP_X, SKATER_HIP_Y, 0);
        rLeg.current.rotation.set(mix(b, DIVE_THIGH), 0, 0);
      }
      if (lShin.current) lShin.current.rotation.set(mix(kneeL, DIVE_KNEE), 0, 0);
      if (rShin.current) rShin.current.rotation.set(mix(kneeR, DIVE_KNEE), 0, 0);
      if (lBoot.current) lBoot.current.rotation.set(mix(bootL, DIVE_BOOT), 0, 0);
      if (rBoot.current) rBoot.current.rotation.set(mix(bootR, DIVE_BOOT), 0, 0);
    } else if (tumbling && goalie) {
      poseGoalieGetUp(s, g, body.current, lLeg.current, rLeg.current, lShin.current, rShin.current, lArm.current, rArm.current, lFore.current, rFore.current, stick.current, lBoot.current, rBoot.current);
    } else if (tumbling) {
      const u = tumbleU;
      const tuck = u * u * (3 - 2 * u);
      if (lLeg.current) {
        lLeg.current.position.set(-SKATER_HIP_X, SKATER_HIP_Y, 0);
        lLeg.current.rotation.set(0.05 + 0.8 * tuck, 0, -0.22 * tuck);
      }
      if (rLeg.current) {
        rLeg.current.position.set(SKATER_HIP_X, SKATER_HIP_Y, 0);
        rLeg.current.rotation.set(0.05 + 1.1 * tuck, 0, 0.28 * tuck);
      }
      if (lShin.current) lShin.current.rotation.set(0.25 + 0.45 * tuck, 0, 0);
      if (rShin.current) rShin.current.rotation.set(0.25 + 0.6 * tuck, 0, 0);
      if (lBoot.current) lBoot.current.rotation.set(-0.16 + 0.26 * tuck, 0, 0);
      if (rBoot.current) rBoot.current.rotation.set(-0.16 + 0.28 * tuck, 0, 0);
      if (tumbleRise && world.puck.owner === index) {
        const rise = struckRise(u);
        const sinL = Math.sin(s.stride);
        const kneeL = strideKnee(sinL);
        const kneeR = strideKnee(-sinL);
        const thighL = strideThigh(kneeL);
        const thighR = strideThigh(kneeR);
        const mix = (from: number, to: number) => from + (to - from) * rise;
        if (lLeg.current) {
          lLeg.current.rotation.x = mix(lLeg.current.rotation.x, thighL);
          lLeg.current.rotation.z = mix(lLeg.current.rotation.z, 0);
        }
        if (rLeg.current) {
          rLeg.current.rotation.x = mix(rLeg.current.rotation.x, thighR);
          rLeg.current.rotation.z = mix(rLeg.current.rotation.z, 0);
        }
        if (lShin.current) lShin.current.rotation.x = mix(lShin.current.rotation.x, kneeL);
        if (rShin.current) rShin.current.rotation.x = mix(rShin.current.rotation.x, kneeR);
        if (lBoot.current) lBoot.current.rotation.x = mix(lBoot.current.rotation.x, -(CARRY_HIP + thighL + kneeL));
        if (rBoot.current) rBoot.current.rotation.x = mix(rBoot.current.rotation.x, -(CARRY_HIP + thighR + kneeR));
      }
    } else if (!goalie && wrist && wristKey && s.poke <= 0.04) {
      if (lLeg.current) poseWristLeg(lLeg.current, lShin.current, lBoot.current, -SKATER_HIP_X, wristKey.kneeL, wristKey.hip);
      if (rLeg.current) poseWristLeg(rLeg.current, rShin.current, rBoot.current, SKATER_HIP_X, wristKey.kneeR, wristKey.hip);
    } else if (!goalie && carryPose && s.poke <= 0.04) {
      const sinL = Math.sin(s.stride);
      const kneeL = strideKnee(sinL);
      const kneeR = strideKnee(-sinL);
      const thighL = strideThigh(kneeL);
      const thighR = strideThigh(kneeR);
      if (lLeg.current) {
        lLeg.current.position.set(-SKATER_HIP_X, SKATER_HIP_Y, 0);
        lLeg.current.rotation.set(thighL, 0, 0);
      }
      if (rLeg.current) {
        rLeg.current.position.set(SKATER_HIP_X, SKATER_HIP_Y, 0);
        rLeg.current.rotation.set(thighR, 0, 0);
      }
      if (lShin.current) lShin.current.rotation.set(kneeL, 0, 0);
      if (rShin.current) rShin.current.rotation.set(kneeR, 0, 0);
      if (lBoot.current) lBoot.current.rotation.set(-(CARRY_HIP + thighL + kneeL), 0, 0);
      if (rBoot.current) rBoot.current.rotation.set(-(CARRY_HIP + thighR + kneeR), 0, 0);
    } else if (pokeReach && body.current) {
      const pitch = body.current.rotation.x;
      const drop = body.current.position.y;
      const frontThigh = plantThigh(pitch, drop, POKE_FRONT_KNEE, -1.15, -0.2, 0.42);
      const backThigh = plantThigh(pitch, drop, POKE_BACK_KNEE, -0.55, 0.45, -0.06);
      if (lLeg.current) posePokeLeg(lLeg.current, lShin.current, lBoot.current, -SKATER_HIP_X, backThigh, POKE_BACK_KNEE, pitch);
      if (rLeg.current) posePokeLeg(rLeg.current, rShin.current, rBoot.current, SKATER_HIP_X, frontThigh, POKE_FRONT_KNEE, pitch);
    } else if (!goalie) {
      if (lLeg.current) {
        lLeg.current.position.set(-SKATER_HIP_X, SKATER_HIP_Y, 0);
        lLeg.current.rotation.x = a;
        lLeg.current.rotation.z = 0;
      }
      if (rLeg.current) {
        rLeg.current.position.set(SKATER_HIP_X, SKATER_HIP_Y, 0);
        rLeg.current.rotation.x = b;
        rLeg.current.rotation.z = 0;
      }
      const kneeL = 0.22 + Math.max(0, -a) * 1.15;
      const kneeR = 0.22 + Math.max(0, -b) * 1.15;
      if (lShin.current) lShin.current.rotation.set(kneeL, 0, 0);
      if (rShin.current) rShin.current.rotation.set(kneeR, 0, 0);
      if (lBoot.current) lBoot.current.rotation.set(-0.1 - kneeL * 0.32 + Math.max(0, a) * 0.18, 0, 0);
      if (rBoot.current) rBoot.current.rotation.set(-0.1 - kneeR * 0.32 + Math.max(0, b) * 0.18, 0, 0);
      if (carryPose) {
        const extraKnee = CARRY_KNEE - 0.22;
        const bootDelta = CARRY_BOOT - (-0.1 - 0.22 * 0.32);
        if (lShin.current) lShin.current.rotation.x += extraKnee;
        if (rShin.current) rShin.current.rotation.x += extraKnee;
        if (lBoot.current) lBoot.current.rotation.x += bootDelta;
        if (rBoot.current) rBoot.current.rotation.x += bootDelta;
      }
    }
    if (!goalie && lLeg.current && rLeg.current && (checkT || absorbK > 0)) {
      const blendLeg = (leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, x: number, thigh: number, knee: number, bootX: number, w: number) => {
        leg.position.set(x, SKATER_HIP_Y, 0);
        leg.rotation.x += (thigh - leg.rotation.x) * w;
        leg.rotation.y = 0;
        leg.rotation.z += (0 - leg.rotation.z) * w;
        if (shin) {
          shin.rotation.x += (knee - shin.rotation.x) * w;
          shin.rotation.y = 0;
          shin.rotation.z += (0 - shin.rotation.z) * w;
        }
        if (boot) {
          boot.rotation.x += (bootX - boot.rotation.x) * w;
          boot.rotation.y = 0;
          boot.rotation.z += (0 - boot.rotation.z) * w;
        }
      };
      if (checkT) {
        const w = checkT.influence;
        const frontLeft = checkSide.current < 0;
        blendLeg(lLeg.current, lShin.current, lBoot.current, -SKATER_HIP_X, frontLeft ? checkT.thighF : checkT.thighB, frontLeft ? checkT.kneeF : checkT.kneeB, frontLeft ? checkT.bootF : checkT.bootB, w);
        blendLeg(rLeg.current, rShin.current, rBoot.current, SKATER_HIP_X, frontLeft ? checkT.thighB : checkT.thighF, frontLeft ? checkT.kneeB : checkT.kneeF, frontLeft ? checkT.bootB : checkT.bootF, w);
      } else {
        const pitch = body.current ? body.current.rotation.x : RECV_PITCH;
        const knee = 0.24 + (RECV_KNEE - 0.24) * absorbK;
        const planted = checkPlant(pitch, knee, RECV_DORSI);
        const bootX = checkBoot(pitch, planted.thigh, knee, RECV_DORSI);
        blendLeg(lLeg.current, lShin.current, lBoot.current, -SKATER_HIP_X, planted.thigh, knee, bootX, absorbK);
        blendLeg(rLeg.current, rShin.current, rBoot.current, SKATER_HIP_X, planted.thigh, knee, bootX, absorbK);
      }
    }
    if (lArm.current && rArm.current && !butterflied && !rage) {
      if (goalieCheer && body.current) {
        poseGoalieCheer(s, body.current, lArm.current, rArm.current, lFore.current, rFore.current, stick.current);
      } else if (cheer && s.hit <= 0 && body.current) {
        poseCheer(s, body.current, lArm.current, rArm.current, lFore.current, rFore.current);
      } else if (s.dive > 0.04 && !goalie) {
        lArm.current.rotation.set(-0.15, 0.4, 1.15);
        rArm.current.rotation.set(-0.15, -0.4, -1.15);
        if (lFore.current) lFore.current.rotation.set(-0.2, 0, 0);
        if (rFore.current) rFore.current.rotation.set(-0.2, 0, 0);
      } else if (goalie && !tumbling) {
        poseGoalieStance(s, lArm.current, rArm.current, lFore.current, rFore.current);
      } else if (!goalie && stick.current && body.current && lFore.current && rFore.current) {
        const hasPuck = world.puck.owner === index;
        const reach = !hasPuck && (poke || puckNearSkater(s));
        if (fallHand) {
          lArm.current.position.set(-0.26, 1.46, 0.06);
          rArm.current.position.set(0.24, 1.46, 0.06);
          lArm.current.rotation.set(0.7, -0.25, 0.15);
          rArm.current.rotation.set(-0.45, 0.35, -0.4);
          lFore.current.rotation.set(-0.85, 0, 0);
          rFore.current.rotation.set(-0.55, 0, 0);
        } else if (wrist && wristKey && bladeGrp.current) {
          applyStickAim(stick.current, wristStickAim(wristKey));
          poseWristBlade(bladeGrp.current, stick.current, wristKey.roll, wristKey.yaw);
          if (wristIce) seatBlade(stick.current, bladeGrp.current);
        } else if (slap && bladeGrp.current) {
          applyStickAim(stick.current, wristStickAim(slap.key));
          poseWristBlade(bladeGrp.current, stick.current, slap.key.roll, slap.key.yaw);
          seatBlade(stick.current, bladeGrp.current, slap.lock);
        } else if (slapping) applyStickAim(stick.current, shotStickAim(swingT));
        else if (pokeReach) {
          body.current.updateWorldMatrix(true, false);
          _corner.set(0.24, 1.46, 0.06);
          body.current.localToWorld(_corner);
          g.worldToLocal(_corner);
          const shX = _corner.x;
          const shY = _corner.y;
          const shZ = _corner.z;
          _ikTo.set(world.puck.x, world.puck.y, world.puck.z);
          g.worldToLocal(_ikTo);
          const aim = pokeStickAim(shX, shY, shZ, _ikTo.x, _ikTo.z);
          applyStickAim(stick.current, aim);
          pokeToeX = aim.blade[0];
          pokeToeZ = aim.blade[2];
          pokePosed = true;
        } else if (tumbleRise && hasPuck) applyStickAim(stick.current, carryOwnStickAim());
        else if (tumbleRise) applyStickAim(stick.current, readyStickAim());
        else if (carryPose) applyStickAim(stick.current, dekePose ? dekeStickAim(s.deke) : carryOwnStickAim());
        else if (hasPuck || reach) applyStickAim(stick.current, carryStickAim());
        else applyStickAim(stick.current, readyStickAim());
        if (!fallHand && !wrist && !slapping && !hasPuck && !reach) {
          stick.current.updateWorldMatrix(true, false);
          body.current.updateWorldMatrix(true, false);
          _handTop.set(0, layout.len * SKATER_GRIP_TOP, 0);
          stick.current.localToWorld(_handTop);
          body.current.worldToLocal(_handTop);
          _handBot.set(0, layout.len * SKATER_GRIP_BOT, 0);
          stick.current.localToWorld(_handBot);
          body.current.worldToLocal(_handBot);
          gripSkaterHand(body.current, rArm.current, rFore.current, 0.24, 1.46, 0.06, _handTop.x, _handTop.y, _handTop.z, 1, true);
          gripSkaterHand(body.current, lArm.current, lFore.current, -0.26, 1.46, 0.06, _handBot.x, _handBot.y, _handBot.z, -1, true);
        } else if (!fallHand) {
          stick.current.updateWorldMatrix(true, false);
          body.current.updateWorldMatrix(true, false);
          _handTop.set(0, layout.len * SKATER_GRIP_TOP, 0);
          stick.current.localToWorld(_handTop);
          body.current.worldToLocal(_handTop);
          _handBot.set(0, layout.len * (slap ? slap.bot : SKATER_GRIP_BOT), 0);
          stick.current.localToWorld(_handBot);
          body.current.worldToLocal(_handBot);
          const armOpp = carryPose && s.poke <= 0.04 ? Math.sin(s.stride) * STRIDE_ARM : 0;
          const shX = -DEKE_SHOULDER * dekeAmt;
          const handsOn = carryPose || wrist || !!slap || (tumbleRise && hasPuck);
          gripSkaterHand(body.current, rArm.current, rFore.current, 0.24 + shX, 1.46, 0.06 + armOpp, _handTop.x, _handTop.y, _handTop.z, 1, handsOn);
          if (reach && !slapping && !wrist && !tumbleRise && !checkT) hangSkaterArm(lArm.current, lFore.current, -1);
          else gripSkaterHand(body.current, lArm.current, lFore.current, -0.26 + shX, 1.46, 0.06 - armOpp, _handBot.x, _handBot.y, _handBot.z, -1, handsOn);
        }
        if (checkT && lFore.current && rFore.current) {
          const w = checkT.influence;
          const side = checkSide.current;
          const checkArm = side > 0 ? rArm.current : lArm.current;
          const checkFore = side > 0 ? rFore.current : lFore.current;
          const offArm = side > 0 ? lArm.current : rArm.current;
          const offFore = side > 0 ? lFore.current : rFore.current;
          const sockX = side > 0 ? 0.24 : -0.26;
          const offX = side > 0 ? -0.26 : 0.24;
          checkArm.position.set(sockX, 1.46, 0.06 + (checkT.armZ - 0.06) * w);
          slerpRot(checkArm, checkT.armRx, checkT.armRy, checkT.armRz, w);
          slerpRot(checkFore, checkT.foreRx, 0, 0, w);
          offArm.position.set(offX, 1.46, 0.06);
          slerpRot(offArm, 0.3, 0, -side * 0.35, w);
          slerpRot(offFore, -0.55, 0, 0, w);
          if (w > 0.4) poseStickOneHand(stick.current, g, offFore, layout);
        }
      }
    }
    if (stick.current && !butterflied && !rage && !goalieCheer) {
      if (goalie && !tumbling) {
        poseGoalieStick(stick.current, s.coverPose, s, rArm.current, rFore.current);
        // Both hands are on this shaft. A rotation lift would pull the catcher off it.
        if (!goaliePlaysPuck(s)) keepGoalieStickOnIce(stick.current);
        const ice = stick.current.getObjectByName("goalieIce");
        if (ice && (goalieZKind(s) || goaliePlaysPuck(s))) {
          ice.getWorldPosition(_corner);
          noteGoalieMidBlade(s, _corner.x, _corner.z);
        }
      } else if (cheer && s.hit <= 0 && !rage) {
        if (lFore.current) poseStickOneHand(stick.current, g, lFore.current, layout);
      } else if (s.dive > 0.04) {
        applyStickAim(stick.current, carryStickAim());
      } else if (!goalie && fallHand && lFore.current) {
        poseStickOneHand(stick.current, g, lFore.current, layout);
      }
    }
    if (rage && stick.current && shaftHold.current && bladeGrp.current && knobRef.current && flyBlade.current && flyShaft.current && lArm.current && rArm.current) {
      bladeGrp.current.rotation.set(0, 0, 0);
      poseRage(s, g, body.current, lArm.current, rArm.current, lFore.current, rFore.current, stick.current, shaftHold.current, bladeGrp.current, knobRef.current, flyBlade.current, flyShaft.current, layout, rage);
    } else if (!goalie && shaftHold.current && bladeGrp.current && knobRef.current && stick.current) {
      stick.current.visible = true;
      shaftHold.current.visible = true;
      shaftHold.current.position.set(0, layout.len * 0.5, 0);
      shaftHold.current.scale.set(1, layout.len, 1);
      bladeGrp.current.visible = true;
      const idleReady = !slapping && world.puck.owner !== index && !poke && !puckNearSkater(s) && !(cheer && s.hit <= 0) && !tumbling && s.dive <= 0.04 && !brawlPoseFor(s.id) && !!body.current && !!lArm.current && !!rArm.current && !!lFore.current && !!rFore.current;
      if (pokePosed) posePokeBlade(bladeGrp.current, stick.current, pokeToeX, pokeToeZ);
      else if (tumbling || (!wrist && !slap)) {
        let bladeYaw = dekePose ? -DEKE_BLADE_YAW * dekeAmt : 0;
        let bladeZ = carryPose ? CARRY_SHAFT_PITCH : idleReady ? READY_SHAFT_PITCH : 0;
        if (tumbling) {
          bladeYaw = 0;
          bladeZ = tumbleRise && world.puck.owner === index ? CARRY_SHAFT_PITCH * struckRise(tumbleU) : 0;
        }
        bladeGrp.current.rotation.set(0, bladeYaw, bladeZ);
      }
      knobRef.current.visible = true;
      if (flyBlade.current) flyBlade.current.visible = false;
      if (flyShaft.current) flyShaft.current.visible = false;
    }
    const bodyM = body.current;
    const stickM = stick.current;
    const bladeM = bladeGrp.current;
    const lArmM = lArm.current;
    const rArmM = rArm.current;
    const lForeM = lFore.current;
    const rForeM = rFore.current;
    const lLegM = lLeg.current;
    const rLegM = rLeg.current;
    if (!goalie && bodyM && stickM && bladeM && lArmM && rArmM && lForeM && rForeM && lLegM && rLegM) {
      if (pokePosed) {
        const snap = pokeSnap.current ?? (pokeSnap.current = freshPokeSnap());
        snap.stickQ.copy(stickM.quaternion);
        snap.stickP.copy(stickM.position);
        snap.bladeQ.copy(bladeM.quaternion);
        snap.topQ.copy(rArmM.quaternion);
        snap.topF.copy(rForeM.quaternion);
        snap.botQ.copy(lArmM.quaternion);
        snap.botF.copy(lForeM.quaternion);
        snap.topP.copy(rArmM.position);
        snap.botP.copy(lArmM.position);
        snap.pitch = bodyM.rotation.x;
        snap.drop = bodyM.position.y;
        snap.lThigh = lLegM.rotation.x;
        snap.rThigh = rLegM.rotation.x;
        snap.lKnee = lShin.current ? lShin.current.rotation.x : 0;
        snap.rKnee = rShin.current ? rShin.current.rotation.x : 0;
        snap.lBoot = lBoot.current ? lBoot.current.rotation.x : 0;
        snap.rBoot = rBoot.current ? rBoot.current.rotation.x : 0;
        pokeLeft.current = POKE_RELEASE;
      } else if (pokeStop) {
        pokeLeft.current = 0;
      } else if (pokeLeft.current > 0 && pokeSnap.current) {
        const snap = pokeSnap.current;
        const u = 1 - pokeLeft.current / POKE_RELEASE;
        const t = u * u * (3 - 2 * u);
        blendFromSnap(stickM, snap.stickQ, t);
        _blendP.copy(stickM.position);
        stickM.position.copy(snap.stickP).lerp(_blendP, t);
        blendFromSnap(bladeM, snap.bladeQ, t);
        blendFromSnap(rArmM, snap.topQ, t);
        blendFromSnap(rForeM, snap.topF, t);
        blendFromSnap(lArmM, snap.botQ, t);
        blendFromSnap(lForeM, snap.botF, t);
        _blendP.copy(rArmM.position);
        rArmM.position.copy(snap.topP).lerp(_blendP, t);
        _blendP.copy(lArmM.position);
        lArmM.position.copy(snap.botP).lerp(_blendP, t);
        const destPitch = bodyM.rotation.x;
        const destDrop = bodyM.position.y;
        bodyM.rotation.x = snap.pitch + (destPitch - snap.pitch) * t;
        bodyM.position.y = snap.drop + (destDrop - snap.drop) * t;
        const lThigh = lLegM.rotation.x;
        const rThigh = rLegM.rotation.x;
        lLegM.rotation.x = snap.lThigh + (lThigh - snap.lThigh) * t;
        rLegM.rotation.x = snap.rThigh + (rThigh - snap.rThigh) * t;
        if (lShin.current) lShin.current.rotation.x = snap.lKnee + (lShin.current.rotation.x - snap.lKnee) * t;
        if (rShin.current) rShin.current.rotation.x = snap.rKnee + (rShin.current.rotation.x - snap.rKnee) * t;
        if (lBoot.current) lBoot.current.rotation.x = snap.lBoot + (lBoot.current.rotation.x - snap.lBoot) * t;
        if (rBoot.current) rBoot.current.rotation.x = snap.rBoot + (rBoot.current.rotation.x - snap.rBoot) * t;
        pokeLeft.current = Math.max(0, pokeLeft.current - Math.min(0.05, delta || 0));
      }
    } else if (pokeStop) {
      pokeLeft.current = 0;
    }
    const dump = world.benchDump;
    if (dump && s.id === dump.id) {
      const t = tumbleRoot(s.struck, s.tumble || 1, s.yaw);
      g.position.set(s.x, t.y + dump.y, s.z);
      g.rotation.set(t.rx, t.ry, t.rz);
    }
    const bp = brawlPoseFor(s.id);
    if (bp && !bp.ko && body.current && lArm.current && rArm.current && lFore.current && rFore.current) {
      body.current.rotation.set(0, 0, 0);
      body.current.position.y = 0;
      if (bp.celeb) {
        poseGloveAt(body.current, lArm.current, lFore.current, -0.26, 1.46, 0.06, -0.32, 1.94, 0.16, -1);
        poseGloveAt(body.current, rArm.current, rFore.current, 0.24, 1.46, 0.06, 0.28, 1.9, 0.18, 1);
        if (!goalie && stick.current) poseStickOneHand(stick.current, g, lFore.current, layout);
      } else {
        poseBrawl(bp.kind, bp.swing, body.current, lArm.current, rArm.current, lFore.current, rFore.current, stick.current, g, layout, goalie);
        if (!goalie && lLeg.current && rLeg.current) {
          lLeg.current.position.set(-0.18, 0.82, 0.04);
          rLeg.current.position.set(0.18, 0.82, 0.04);
          lLeg.current.rotation.set(0.32, 0, -0.04);
          rLeg.current.rotation.set(0.32, 0, 0.04);
          if (lShin.current) lShin.current.rotation.set(0.4, 0, 0);
          if (rShin.current) rShin.current.rotation.set(0.4, 0, 0);
        }
      }
    }
    if (ring.current) {
      const holding = goalie && world.puck.owner === index;
      ring.current.visible = world.userId === index || holding || world.wingL === index || world.wingR === index;
      if (goalie) {
        const pulse = holding ? 1.08 + 0.12 * Math.abs(Math.sin(world.time * 7.4)) : 1;
        ring.current.scale.set(pulse / 1.14, 1, pulse / 1.14);
        mats.ring.color.set("#f4f8ff");
        mats.ring.opacity = holding ? 1 : 0.88;
        mats.ringFill.opacity = holding ? 0.55 : 0.3;
        if (holding) seatGoalieRing(g, ring.current, world.puck.x, world.puck.z);
        else ring.current.position.set(0, 0, 0);
      }
    }
    if (!goalie && head.current) {
      if (checkT) {
        const w = checkT.influence;
        const baseRx = carryPose ? -CARRY_HIP * 0.5 : 0;
        head.current.position.set(0, 1.54, 0.02 + (checkT.headZ - 0.02) * w);
        head.current.rotation.order = "XYZ";
        head.current.rotation.set(baseRx + (checkT.headRx - baseRx) * w, 0, 0);
      } else if (absorbK > 0) {
        head.current.position.set(0, 1.54, 0.02);
        head.current.rotation.order = "XYZ";
        head.current.rotation.set(0, 0, 0);
      } else if (wrist && wristKey && body.current) {
        head.current.position.set(0, 1.54, 0.02);
        if (wristWatch === "puck") watchPoint(head.current, body.current, world.puck.x, world.puck.y, world.puck.z);
        else watchPoint(head.current, body.current, attackDir(s.side) * GOAL_LINE_X, GOAL_H * 0.45, 0);
      } else if (dekePose && body.current) {
        head.current.position.set(0, 1.54, 0.02);
        watchPoint(head.current, body.current, attackDir(s.side) * GOAL_LINE_X, GOAL_H * 0.45, 0);
      } else {
        head.current.position.set(0, 1.54, 0.02);
        head.current.rotation.order = "XYZ";
        head.current.rotation.y = 0;
        head.current.rotation.z = 0;
        head.current.rotation.x = carryPose ? -CARRY_HIP * 0.5 : 0;
      }
    }
    if (shadow.current) plantRinkShadow(shadow.current, 0, 0, goalie ? 1.14 : 1);
  });

  return (
    <group ref={root}>
      <mesh ref={shadow} geometry={shadowGeo} material={mats.shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, SHADOW_ICE_Y, 0]} />
      <group ref={ring} visible={false}>
        {goalie ? <mesh geometry={goalieDiscGeo} material={mats.ringFill} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} /> : null}
        <mesh geometry={goalie ? goalieRingGeo : ringGeo} material={mats.ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} />
      </group>
      <group ref={body}>
        <mesh geometry={neckGeo} material={mats.jersey} position={[0, 1.52, 0.02]} />
        <group ref={head} position={[0, 1.54, 0.02]}>
          <mesh geometry={helmetGeo} material={mats.helmet} position={[0, 0.08, 0]} scale={[1.05, 0.92, 1.12]} castShadow />
          {goalie ? (
            <>
              <mesh geometry={maskPlateGeo} material={mats.mask} position={[0, 0.02, 0.16]} />
              {[-0.06, 0, 0.06].map((x) => (
                <mesh key={`v${x}`} geometry={maskBarV} material={mats.blade} position={[x, 0.02, 0.2]} />
              ))}
              {[-0.05, 0.05].map((y) => (
                <mesh key={`h${y}`} geometry={maskBarH} material={mats.blade} position={[0, 0.02 + y, 0.2]} />
              ))}
            </>
          ) : (
            <mesh geometry={visorGeo} material={mats.visor} position={[0, 0.04, 0.1]} />
          )}
        </group>
        {kit.id === 0 ? (
          <>
            <mesh geometry={torsoGeo} material={mats.jersey} position={[0, 1.14, 0]} scale={[1, 0.75, 1]} castShadow />
            <mesh geometry={torsoGeo} material={mats.yoke} position={[0, 1.46, 0]} scale={[1, 0.25, 1]} castShadow />
          </>
        ) : kit.id >= 3 && kit.id <= 7 ? (
          <>
            <mesh geometry={torsoGeo} material={mats.jersey} position={[0, 1.14, 0]} scale={[1, 0.75, 1]} castShadow />
            <mesh geometry={torsoGeo} material={mats.yoke} position={[0, 1.46, 0]} scale={[1, 0.25, 1]} castShadow />
          </>
        ) : (
          <mesh geometry={torsoGeo} material={mats.jersey} position={[0, 1.22, 0]} castShadow />
        )}
        <mesh geometry={yokeChestGeo} material={mats.yoke} position={[0, 1.45, 0]} scale={goalie ? [1.12, 1.04, 1.08] : 1} castShadow />
        <mesh geometry={yokeGeo} material={mats.yoke} position={[goalie ? -0.25 : -0.24, 1.45, 0.02]} rotation={[0.08, 0, 0.12]} scale={goalie ? [1.12, 1.04, 1.08] : 1} castShadow />
        <mesh geometry={yokeGeo} material={mats.yoke} position={[goalie ? 0.25 : 0.24, 1.45, 0.02]} rotation={[0.08, 0, -0.12]} scale={goalie ? [1.12, 1.04, 1.08] : 1} castShadow />
        <mesh geometry={numPlane} material={mats.number} position={[0, 1.24, -0.16]} rotation={[0, Math.PI, 0]} />
        <mesh geometry={goalie ? pantsGeo : skaterPantsGeo} material={mats.pants} position={[0, SKATER_HIP_Y, 0]} castShadow />
        <mesh geometry={pantStripeGeo} material={mats.stripe} position={[goalie ? -0.185 : -0.214, SKATER_HIP_Y, 0]} scale={goalie ? 1 : [1, 1.4, 1]} />
        <mesh geometry={pantStripeGeo} material={mats.stripe} position={[goalie ? 0.185 : 0.214, SKATER_HIP_Y, 0]} scale={goalie ? 1 : [1, 1.4, 1]} />

        <group ref={lArm} position={[-0.26, 1.46, 0.06]}>
          {kit.id === 0 ? (
            <>
              <mesh geometry={upperArmGeo} material={mats.yoke} position={[0, -0.14, 0.055]} scale={[1, 1, 0.5]} castShadow />
              <mesh geometry={upperArmGeo} material={mats.jersey} position={[0, -0.14, -0.015]} scale={[1, 1, 0.5]} castShadow />
            </>
          ) : (
            <mesh geometry={upperArmGeo} material={mats.sleeves} position={[0, -0.14, 0.02]} castShadow />
          )}
          {kit.id === 1 ? <mesh geometry={armStripeGeo} material={mats.pants} position={[0, -0.08, 0.02]} /> : null}
          <group ref={lFore} position={[0, -0.28, 0.02]}>
            {kit.id === 0 ? (
              <>
                <mesh geometry={forearmGeo} material={mats.yoke} position={[0, -0.13, 0.062]} scale={[1, 1, 0.5]} />
                <mesh geometry={forearmGeo} material={mats.jersey} position={[0, -0.13, -0.002]} scale={[1, 1, 0.5]} />
              </>
            ) : (
              <mesh geometry={forearmGeo} material={mats.sleeves} position={[0, -0.13, 0.03]} />
            )}
            {goalie ? (
              <>
                <mesh geometry={blockerCuffGeo} material={mats.blocker} position={[0, -0.18, 0.01]} rotation={[0.08, 0, 0]} />
                <group ref={blocker} name="goalieBlocker" position={[0, -0.28, 0.03]} rotation={[0.12, 0, 0]}>
                  <mesh geometry={blockerBoardGeo} material={mats.blocker} castShadow />
                  <mesh geometry={pantStripeGeo} material={mats.stripe} position={[0.03, 0, 0]} />
                </group>
                <group ref={stick} position={[0.03, -0.22, 0.05]}>
                  <mesh name="goalieKnob" ref={knobRef} geometry={knobGeo} material={mats.tape} position={[0, layout.len / 3, 0]} />
                  <group name="goalieShaft" ref={shaftHold} position={[0, -layout.len / 6, 0]} scale={[1, layout.len, 1]}>
                    <mesh geometry={stickShaftGeo} material={mats.stick} position={[0, 0.24, 0]} scale={[1, 0.52, 1]} castShadow />
                    <mesh geometry={goaliePaddleGeo} material={mats.tape} position={[0, -0.21, 0]} scale={[1, 0.58, 1]} castShadow />
                  </group>
                  <group name="goalieBlade" ref={bladeGrp} position={[0, (-2 * layout.len) / 3, 0]}>
                    <mesh name="goalieIce" geometry={goalieIceGeo} material={mats.tape} position={[0, 0.016, 0.13]} castShadow />
                  </group>
                </group>
              </>
            ) : (
              <mesh geometry={gloveGeo} material={mats.gloves} position={[0.02, -0.28, 0.06]} rotation={[0.4, 0.18, 0.1]} castShadow />
            )}
          </group>
        </group>
        <group ref={rArm} position={[0.24, 1.46, 0.06]}>
          {kit.id === 0 ? (
            <>
              <mesh geometry={upperArmGeo} material={mats.yoke} position={[0, -0.14, 0.055]} scale={[1, 1, 0.5]} castShadow />
              <mesh geometry={upperArmGeo} material={mats.jersey} position={[0, -0.14, -0.015]} scale={[1, 1, 0.5]} castShadow />
            </>
          ) : (
            <mesh geometry={upperArmGeo} material={mats.sleeves} position={[0, -0.14, 0.02]} castShadow />
          )}
          {kit.id === 1 ? <mesh geometry={armStripeGeo} material={mats.pants} position={[0, -0.08, 0.02]} /> : null}
          <group ref={rFore} position={[0, -0.28, 0.02]}>
            {kit.id === 0 ? (
              <>
                <mesh geometry={forearmGeo} material={mats.yoke} position={[0, -0.13, 0.062]} scale={[1, 1, 0.5]} />
                <mesh geometry={forearmGeo} material={mats.jersey} position={[0, -0.13, -0.002]} scale={[1, 1, 0.5]} />
              </>
            ) : (
              <mesh geometry={forearmGeo} material={mats.sleeves} position={[0, -0.13, 0.03]} />
            )}
            {goalie ? <Catcher mats={mats} /> : <mesh geometry={gloveGeo} material={mats.gloves} position={[-0.01, -0.28, 0.07]} rotation={[0.5, -0.1, -0.08]} castShadow />}
          </group>
        </group>

        <group ref={lLeg} position={[goalie ? -0.14 : -SKATER_HIP_X, goalie ? 0.88 : SKATER_HIP_Y, 0]}>
          {goalie ? (
            <>
              <GoalieThigh side={-1} mats={mats} />
              <mesh geometry={goaliePadThighGeo} material={mats.pads} position={[0, -0.16, 0.05]} scale={[1.42, 1.12, 1.55]} castShadow />
              <mesh geometry={goaliePadKneeGeo} material={mats.pads} position={[0, -0.34, 0.06]} scale={[1.42, 1.1, 1.5]} />
              <group ref={lShin} name="goalieStickPad" position={[0, -0.36, 0]}>
                <mesh name="goalieShinPad" geometry={goaliePadShinGeo} material={mats.pads} position={[-GOALIE_SHIN_LIFT, -GOALIE_SHIN_HALF_L, GOALIE_SHIN_MESH_Z]} castShadow />
                <group ref={lBoot}>
                  <mesh geometry={goalieBootGeo} material={mats.skates} />
                  <SkateSole mats={mats} goalie bladeName="goalieSkateBlade" position={[0, -0.06, 0]} />
                </group>
              </group>
            </>
          ) : (
            <>
              <mesh geometry={thighGeo} material={mats.pants} position={[0, -0.16, 0]} castShadow />
              <mesh geometry={thighStripeGeo} material={mats.stripe} position={[-0.082, -0.16, 0]} />
              <group ref={lShin} position={[0, -0.32, 0]}>
                <mesh geometry={shinGeo} material={mats.socks} position={[0, -0.15, 0]} />
                <mesh geometry={sockStripeGeo} material={mats.stripe} position={[0, -0.1, 0]} />
                <mesh geometry={sockStripeGeo} material={mats.stripe} position={[0, -0.18, 0]} />
                <group ref={lBoot} position={[0, -0.3, 0.04]}>
                  <mesh geometry={bootGeo} material={mats.skates} position={[0, -0.05, 0.02]} />
                  <SkateSole mats={mats} position={[0, -0.12, 0.02]} />
                </group>
              </group>
            </>
          )}
        </group>
        <group ref={rLeg} position={[goalie ? 0.14 : SKATER_HIP_X, goalie ? 0.88 : SKATER_HIP_Y, 0]}>
          {goalie ? (
            <>
              <GoalieThigh side={1} mats={mats} />
              <mesh geometry={goaliePadThighGeo} material={mats.pads} position={[0, -0.16, 0.05]} scale={[1.42, 1.12, 1.55]} castShadow />
              <mesh geometry={goaliePadKneeGeo} material={mats.pads} position={[0, -0.34, 0.06]} scale={[1.42, 1.1, 1.5]} />
              <group ref={rShin} name="goalieGlovePad" position={[0, -0.36, 0]}>
                <mesh name="goalieShinPad" geometry={goaliePadShinGeo} material={mats.pads} position={[GOALIE_SHIN_LIFT, -GOALIE_SHIN_HALF_L, GOALIE_SHIN_MESH_Z]} castShadow />
                <group ref={rBoot}>
                  <mesh geometry={goalieBootGeo} material={mats.skates} />
                  <SkateSole mats={mats} goalie bladeName="goalieSkateBlade" position={[0, -0.06, 0]} />
                </group>
              </group>
            </>
          ) : (
            <>
              <mesh geometry={thighGeo} material={mats.pants} position={[0, -0.16, 0]} castShadow />
              <mesh geometry={thighStripeGeo} material={mats.stripe} position={[0.082, -0.16, 0]} />
              <group ref={rShin} position={[0, -0.32, 0]}>
                <mesh geometry={shinGeo} material={mats.socks} position={[0, -0.15, 0]} />
                <mesh geometry={sockStripeGeo} material={mats.stripe} position={[0, -0.1, 0]} />
                <mesh geometry={sockStripeGeo} material={mats.stripe} position={[0, -0.18, 0]} />
                <group ref={rBoot} position={[0, -0.3, 0.04]}>
                  <mesh geometry={bootGeo} material={mats.skates} position={[0, -0.05, 0.02]} />
                  <SkateSole mats={mats} position={[0, -0.12, 0.02]} />
                </group>
              </group>
            </>
          )}
        </group>
      </group>
      {goalie ? null : (
        <>
          <group ref={stick}>
            <group ref={shaftHold} position={layout.mid} scale={[1, layout.len, 1]}>
              <mesh geometry={stickShaftGeo} material={mats.stick} castShadow />
            </group>
            <mesh ref={knobRef} geometry={knobGeo} material={mats.tape} position={layout.top} />
            <group ref={bladeGrp}>
              <mesh geometry={heelJoinGeo} material={mats.tape} position={[0, 0.022, 0.03]} />
              <mesh geometry={bladePlateGeo} material={mats.tape} position={[0, 0.026, 0.19]} castShadow />
              <mesh geometry={bladeToeGeo} material={mats.tape} position={[0, 0.024, 0.4]} />
            </group>
          </group>
          <group ref={flyBlade} visible={false}>
            <mesh geometry={stickShaftGeo} material={mats.stick} position={[0, layout.len * 0.25, 0]} scale={[1, layout.len * 0.5, 1]} />
            <mesh geometry={heelJoinGeo} material={mats.tape} position={[0, 0.022, 0.03]} />
            <mesh geometry={bladePlateGeo} material={mats.tape} position={[0, 0.026, 0.19]} />
            <mesh geometry={bladeToeGeo} material={mats.tape} position={[0, 0.024, 0.4]} />
          </group>
          <group ref={flyShaft} visible={false}>
            <mesh geometry={stickShaftGeo} material={mats.stick} scale={[1, layout.len * 0.5, 1]} />
            <mesh geometry={knobGeo} material={mats.tape} position={[0, layout.len * 0.25, 0]} />
          </group>
        </>
      )}
    </group>
  );
}

function GoalieThigh({ side, mats }: { side: -1 | 1; mats: Pick<KitMats, "pants" | "stripe"> }) {
  return (
    <>
      <mesh geometry={thighGeo} material={mats.pants} position={[side * -0.06, -0.06, 0.02]} scale={[1.5, 1, 1]} castShadow />
      <mesh geometry={thighStripeGeo} material={mats.stripe} position={[side * 0.062, -0.06, 0.02]} />
    </>
  );
}

function SeatedLeg({ side, mats, goalie = false }: { side: -1 | 1; mats: KitMats; goalie?: boolean }) {
  if (goalie) {
    return (
      <group position={[side * 0.16, 0.12, 0.02]} rotation={[-Math.PI / 2, 0, side * 0.06]}>
        <GoalieThigh side={side} mats={mats} />
        <mesh geometry={goaliePadThighGeo} material={mats.pads} position={[0, -0.16, 0.04]} scale={[1.42, 1.08, 1.5]} castShadow />
        <mesh geometry={goaliePadKneeGeo} material={mats.pads} position={[0, -0.34, 0.05]} scale={[1.42, 1.05, 1.45]} />
        <group position={[0, -0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh geometry={goaliePadShinGeo} material={mats.pads} position={[0, -GOALIE_SHIN_HALF_L, GOALIE_SHIN_MESH_Z]} castShadow />
          <mesh geometry={goalieBootGeo} material={mats.skates} position={[0, -0.42, 0.06]} />
          <SkateSole mats={mats} goalie position={[0, -0.48, 0.06]} />
        </group>
      </group>
    );
  }
  return (
    <group position={[side * 0.19, 0.1, 0.02]} rotation={[-Math.PI / 2, 0, side * 0.08]}>
      <mesh geometry={thighGeo} material={mats.pants} position={[0, -0.17, 0]} scale={[1.55, 1.08, 1.5]} castShadow />
      <mesh geometry={thighStripeGeo} material={mats.stripe} position={[side * 0.12, -0.17, 0]} scale={[1, 1.08, 1.45]} />
      <group position={[0, -0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh geometry={shinGeo} material={mats.socks} position={[0, -0.15, 0]} scale={[1.45, 1, 1.45]} />
        <mesh geometry={sockStripeGeo} material={mats.stripe} position={[0, -0.1, 0]} scale={[1.45, 1, 1.45]} />
        <mesh geometry={sockStripeGeo} material={mats.stripe} position={[0, -0.18, 0]} scale={[1.45, 1, 1.45]} />
        <group position={[0, -0.3, 0.05]}>
          <mesh geometry={bootGeo} material={mats.skates} position={[0, -0.05, 0.02]} scale={[1.28, 1, 1.12]} />
          <SkateSole mats={mats} position={[0, -0.12, 0.02]} />
        </group>
      </group>
    </group>
  );
}

export function SeatedPlayer({ kit, number, holdStick = false, goalie = false, seatX }: { kit: UniformKit; number: number; holdStick?: boolean; goalie?: boolean; seatX?: number }) {
  const mats = useMemo(() => makeKitMats(kit, number, goalie), [kit, kit.id, number, goalie]);
  const lean = useRef<THREE.Group>(null);
  // Positive seats rest the paddle on -X so the shaft stays inside the end glass.
  const goalieStickSide = (seatX ?? 0) > 0 ? -1 : 1;
  useLayoutEffect(() => () => disposeKit(mats), [mats]);
  useFrame(() => {
    const g = lean.current;
    if (!g) return;
    const d = world.benchDump;
    const near = seatX !== undefined && !!d && (d.phase !== "fly" || d.t > d.dur * 0.45) && ((d.kind === "help" && seatX > 0.4) || (d.kind === "shove" && seatX < -0.4)) && Math.abs(seatX - d.x1) < 2.8;
    if (!near || !d) {
      g.rotation.x = 0.08;
      g.rotation.z = 0;
      return;
    }
    if (d.kind === "help") {
      g.rotation.x = 0.08 + 0.38 + Math.sin(world.time * 5.2) * 0.12;
      g.rotation.z = Math.sin(world.time * 3.4) * 0.05;
    } else {
      const jab = Math.max(0, Math.sin(world.time * 11));
      g.rotation.x = 0.08 + jab * 0.62;
      g.rotation.z = Math.sin(world.time * 11) * 0.16;
    }
  });
  return (
    <group>
      <mesh geometry={shadowGeo} material={mats.shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0.18]} scale={[0.9, 1.15, 0.7]} />
      <group ref={lean} rotation={[0.08, 0, 0]}>
        <mesh geometry={neckGeo} material={mats.jersey} position={[0, 0.86, 0.04]} />
        <group position={[0, 0.88, 0.04]}>
          <mesh geometry={helmetGeo} material={mats.helmet} position={[0, 0.08, 0]} scale={[1.05, 0.92, 1.12]} castShadow />
          {goalie ? (
            <>
              <mesh geometry={maskPlateGeo} material={mats.mask} position={[0, 0.02, 0.16]} />
              {[-0.06, 0, 0.06].map((x) => (
                <mesh key={`v${x}`} geometry={maskBarV} material={mats.blade} position={[x, 0.02, 0.2]} />
              ))}
              {[-0.05, 0.05].map((y) => (
                <mesh key={`h${y}`} geometry={maskBarH} material={mats.blade} position={[0, 0.02 + y, 0.2]} />
              ))}
            </>
          ) : (
            <mesh geometry={visorGeo} material={mats.visor} position={[0, 0.04, 0.1]} />
          )}
        </group>
        {kit.id === 0 ? (
          <>
            <mesh geometry={torsoGeo} material={mats.jersey} position={[0, 0.48, 0]} scale={[1, 0.75, 1]} castShadow />
            <mesh geometry={torsoGeo} material={mats.yoke} position={[0, 0.8, 0]} scale={[1, 0.25, 1]} castShadow />
          </>
        ) : kit.id >= 3 && kit.id <= 7 ? (
          <>
            <mesh geometry={torsoGeo} material={mats.jersey} position={[0, 0.48, 0]} scale={[1, 0.75, 1]} castShadow />
            <mesh geometry={torsoGeo} material={mats.yoke} position={[0, 0.8, 0]} scale={[1, 0.25, 1]} castShadow />
          </>
        ) : (
          <mesh geometry={torsoGeo} material={mats.jersey} position={[0, 0.56, 0]} castShadow />
        )}
        <mesh geometry={yokeChestGeo} material={mats.yoke} position={[0, 0.8, 0.02]} castShadow />
        <mesh geometry={yokeGeo} material={mats.yoke} position={[-0.2, 0.8, 0.01]} rotation={[0.1, 0, 0.16]} castShadow />
        <mesh geometry={yokeGeo} material={mats.yoke} position={[0.2, 0.8, 0.01]} rotation={[0.1, 0, -0.16]} castShadow />
        <mesh geometry={numPlane} material={mats.number} position={[0, 0.58, -0.16]} rotation={[0, Math.PI, 0]} />
        <mesh geometry={pantsGeo} material={mats.pants} position={[0, 0.16, 0.02]} castShadow />
        <mesh geometry={pantStripeGeo} material={mats.stripe} position={[-0.185, 0.16, 0.02]} />
        <mesh geometry={pantStripeGeo} material={mats.stripe} position={[0.185, 0.16, 0.02]} />

        <group position={[-0.28, 0.76, 0.02]} rotation={[0.25, -0.2, -0.6]}>
          {kit.id === 0 ? (
            <>
              <mesh geometry={upperArmGeo} material={mats.yoke} position={[0, -0.14, 0.055]} scale={[1, 1, 0.5]} castShadow />
              <mesh geometry={upperArmGeo} material={mats.jersey} position={[0, -0.14, -0.015]} scale={[1, 1, 0.5]} castShadow />
            </>
          ) : (
            <mesh geometry={upperArmGeo} material={mats.sleeves} position={[0, -0.14, 0.02]} castShadow />
          )}
          {kit.id === 1 ? <mesh geometry={armStripeGeo} material={mats.pants} position={[0, -0.08, 0.02]} /> : null}
          <group position={[0, -0.28, 0.02]} rotation={[-1, 0.2, 0.4]}>
            {kit.id === 0 ? (
              <>
                <mesh geometry={forearmGeo} material={mats.yoke} position={[0, -0.13, 0.062]} scale={[1, 1, 0.5]} />
                <mesh geometry={forearmGeo} material={mats.jersey} position={[0, -0.13, -0.002]} scale={[1, 1, 0.5]} />
              </>
            ) : (
              <mesh geometry={forearmGeo} material={mats.sleeves} position={[0, -0.13, 0.03]} />
            )}
            {goalie ? (
              <>
                <mesh geometry={blockerCuffGeo} material={mats.blocker} position={[0, -0.18, 0.01]} rotation={[0.08, 0, 0]} />
                <mesh geometry={blockerBoardGeo} material={mats.blocker} position={[0, -0.28, 0.03]} rotation={[0.12, 0, 0]} castShadow />
              </>
            ) : (
              <mesh geometry={gloveGeo} material={mats.gloves} position={[0.02, -0.28, 0.04]} rotation={[0.35, 0.1, 0.08]} castShadow />
            )}
          </group>
        </group>
        <group position={[0.28, 0.76, 0.02]} rotation={[0.25, 0.2, 0.6]}>
          {kit.id === 0 ? (
            <>
              <mesh geometry={upperArmGeo} material={mats.yoke} position={[0, -0.14, 0.055]} scale={[1, 1, 0.5]} castShadow />
              <mesh geometry={upperArmGeo} material={mats.jersey} position={[0, -0.14, -0.015]} scale={[1, 1, 0.5]} castShadow />
            </>
          ) : (
            <mesh geometry={upperArmGeo} material={mats.sleeves} position={[0, -0.14, 0.02]} castShadow />
          )}
          {kit.id === 1 ? <mesh geometry={armStripeGeo} material={mats.pants} position={[0, -0.08, 0.02]} /> : null}
          <group position={[0, -0.28, 0.02]} rotation={[-1, -0.2, -0.4]}>
            {kit.id === 0 ? (
              <>
                <mesh geometry={forearmGeo} material={mats.yoke} position={[0, -0.13, 0.062]} scale={[1, 1, 0.5]} />
                <mesh geometry={forearmGeo} material={mats.jersey} position={[0, -0.13, -0.002]} scale={[1, 1, 0.5]} />
              </>
            ) : (
              <mesh geometry={forearmGeo} material={mats.sleeves} position={[0, -0.13, 0.03]} />
            )}
            {goalie ? <Catcher mats={mats} /> : <mesh geometry={gloveGeo} material={mats.gloves} position={[-0.01, -0.28, 0.05]} rotation={[0.4, -0.08, -0.06]} castShadow />}
          </group>
        </group>
      </group>

      <SeatedLeg side={-1} mats={mats} goalie={goalie} />
      <SeatedLeg side={1} mats={mats} goalie={goalie} />

      {goalie ? (
        <group position={[goalieStickSide * 0.72, 0.04, 0.14]} rotation={[0.04, Math.PI, 0]}>
          <mesh geometry={stickShaftGeo} material={mats.stick} position={[0, 0.78, 0]} scale={[1, 0.48, 1]} />
          <mesh geometry={knobGeo} material={mats.tape} position={[0, 1.04, 0]} />
          <mesh geometry={goaliePaddleGeo} material={mats.tape} position={[0, 0.32, 0]} scale={[1, 0.58, 1]} />
          <mesh geometry={goalieIceGeo} material={mats.tape} position={[0, 0.016, 0.13]} />
        </group>
      ) : (
        <group position={[holdStick ? -0.58 : 0.58, 0.05, 0.16]} rotation={[0.06, Math.PI, 0]}>
          <group position={[0, 0.59, 0]} scale={[1, 1.18, 1]}>
            <mesh geometry={stickShaftGeo} material={mats.stick} />
          </group>
          <mesh geometry={knobGeo} material={mats.tape} position={[0, 1.18, 0]} />
          <mesh geometry={heelJoinGeo} material={mats.tape} position={[0, 0.022, 0.03]} />
          <mesh geometry={bladePlateGeo} material={mats.tape} position={[0, 0.026, 0.19]} />
          <mesh geometry={bladeToeGeo} material={mats.tape} position={[0, 0.024, 0.4]} />
        </group>
      )}
    </group>
  );
}

const refHelmet = new THREE.SphereGeometry(0.132, 14, 12);
const refNeck = new THREE.CylinderGeometry(0.07, 0.085, 0.14, 8);
const refTorso = new THREE.BoxGeometry(0.4, 0.62, 0.28);
const REF_BAND = 0.4 / 10;
const REF_SIDE_BAND = 0.28 / 8;
const refStripe = new THREE.BoxGeometry(REF_BAND * 0.92, 0.62, 0.286);
const refSideStripe = new THREE.BoxGeometry(0.02, 0.62, REF_SIDE_BAND * 0.92);
const refArmBand = 0.12 / 4;
const refArmStripe = new THREE.BoxGeometry(refArmBand * 0.9, 0.4, 0.135);
const refArmSideStripe = new THREE.BoxGeometry(0.125, 0.4, refArmBand * 0.9);
const refPants = new THREE.BoxGeometry(0.42, 0.32, 0.28);
const refArm = new THREE.BoxGeometry(0.12, 0.4, 0.13);
const refLeg = new THREE.BoxGeometry(0.14, 0.58, 0.16);
const refBoot = new THREE.BoxGeometry(0.14, 0.1, 0.32);
const refShadowGeo = new THREE.CircleGeometry(0.22, 14);
const refBand = new THREE.BoxGeometry(0.13, 0.08, 0.14);
const _refArmDown = new THREE.Vector3(0, -1, 0);
const _refArmPoint = new THREE.Vector3(0, 0, 1);
const REF_HIP = 0.78;
const REF_HINGE_RISE = 0.95;
const REF_TUMBLE_RISE = 0.62;
const REF_SOLE_LEN = Math.hypot(0.15 - REF_HIP, 0.04);
const _refEuler = new THREE.Euler(0, 0, 0, "XYZ");
const _refQFall = new THREE.Quaternion();
const _refQFold = new THREE.Quaternion();
const _refQStand = new THREE.Quaternion();
const _refQ = new THREE.Quaternion();
const _refQInv = new THREE.Quaternion();
const _refQLeg = new THREE.Quaternion();
const _refHip0 = new THREE.Vector3(0, REF_HIP, 0);
const _refIdleM = new THREE.Vector3(-0.13, 0.15, 0.04);
const _refIdleP = new THREE.Vector3(0.13, 0.15, 0.04);
const _refSoleLocal = new THREE.Vector3(0, 0.15 - REF_HIP, 0.04);
const _refSoleDir = _refSoleLocal.clone().normalize();
const _refHip = new THREE.Vector3();
const _refHipB = new THREE.Vector3();
const _refSoleM = new THREE.Vector3();
const _refSoleP = new THREE.Vector3();
const _refSoleMB = new THREE.Vector3();
const _refSolePB = new THREE.Vector3();
const _refSock = new THREE.Vector3();
const _refDir = new THREE.Vector3();
const _refLand = new THREE.Vector3();

function refQuat(rx: number, ry: number, rz: number, out: THREE.Quaternion) {
  _refEuler.set(rx, ry, rz);
  return out.setFromEuler(_refEuler);
}

function refSmooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function restRefRig(body: THREE.Group, lLeg: THREE.Group, rLeg: THREE.Group, shadow: THREE.Mesh | null) {
  body.position.set(0, REF_HIP, 0);
  body.rotation.set(0, 0, 0);
  lLeg.position.set(-0.13, REF_HIP, 0);
  lLeg.rotation.set(0, 0, 0);
  rLeg.position.set(0.13, REF_HIP, 0);
  rLeg.rotation.set(0, 0, 0);
  if (shadow) shadow.position.set(0, SHADOW_ICE_Y, 0);
}

function writeRefSnap(kind: "down" | "one" | "both" | "stand", plantP: boolean, fallY: number, hip: THREE.Vector3, soleM: THREE.Vector3, soleP: THREE.Vector3): number {
  if (kind === "down") {
    hip.copy(_refHip0).applyQuaternion(_refQFall);
    soleM.copy(_refIdleM).applyQuaternion(_refQFall);
    soleP.copy(_refIdleP).applyQuaternion(_refQFall);
    return fallY;
  }
  let hx = 0;
  let hy = REF_HIP;
  let hz = 0;
  let mx = -0.13;
  let my = 0.15;
  let mz = 0.04;
  let px = 0.13;
  let py = 0.15;
  let pz = 0.04;
  if (kind === "one") {
    hx = plantP ? 0.05 : -0.05;
    hy = 0.5;
    hz = 0.3;
    if (plantP) {
      mx = -0.2;
      my = 0.46;
      mz = -0.2;
      px = 0.18;
      py = 0.15;
      pz = 0.74;
    } else {
      mx = -0.18;
      my = 0.15;
      mz = 0.74;
      px = 0.2;
      py = 0.46;
      pz = -0.2;
    }
  } else if (kind === "both") {
    hy = 0.58;
    hz = 0.16;
    mx = -0.22;
    my = 0.15;
    mz = 0.58;
    px = 0.22;
    py = 0.15;
    pz = 0.58;
  }
  hip.set(hx, hy, hz).applyQuaternion(_refQStand);
  soleM.set(mx, my, mz).applyQuaternion(_refQStand);
  soleP.set(px, py, pz).applyQuaternion(_refQStand);
  return 0;
}

function plantRefLeg(leg: THREE.Group, socketX: number, target: THREE.Vector3, floorY: number, rootY: number) {
  _refSock.set(socketX, 0, 0).applyQuaternion(_refQ).add(_refHip);
  _refDir.copy(target).sub(_refSock);
  if (_refDir.lengthSq() < 1e-8) _refDir.set(0, -1, 0.15);
  _refDir.normalize();
  const minDirY = (floorY - rootY - _refSock.y) / REF_SOLE_LEN;
  if (_refDir.y < minDirY) {
    _refDir.y = Math.min(0.96, minDirY);
    const h = Math.sqrt(Math.max(0, 1 - _refDir.y * _refDir.y));
    const xz = Math.hypot(_refDir.x, _refDir.z) || 1;
    _refDir.x = (_refDir.x / xz) * h;
    _refDir.z = (_refDir.z / xz) * h;
  }
  // Bend in the body frame, then take the body's yaw, so the boot does not twist against the pants.
  _refQInv.copy(_refQ).invert();
  _refDir.applyQuaternion(_refQInv);
  _refQLeg.setFromUnitVectors(_refSoleDir, _refDir);
  _refQLeg.premultiply(_refQ);
  leg.position.copy(_refSock);
  leg.quaternion.copy(_refQLeg);
}

function poseRefRise(r: Referee, root: THREE.Group, body: THREE.Group, lLeg: THREE.Group, rLeg: THREE.Group, shadow: THREE.Mesh | null) {
  const start = r.tumble !== 0 ? REF_TUMBLE_RISE : REF_HINGE_RISE;
  const p = (start - r.struck) / start;
  let fallY = 0;
  if (r.tumble !== 0) {
    const t = tumbleRoot(REF_TUMBLE_RISE, r.tumble, r.yaw);
    refQuat(t.rx, t.ry, t.rz, _refQFall);
    fallY = t.y;
  } else {
    refQuat(REF_HINGE_RISE * 1.05, r.yaw + Math.PI, REF_HINGE_RISE * 0.18, _refQFall);
  }
  refQuat(REF_HINGE_RISE * 1.05, r.yaw + Math.PI, REF_HINGE_RISE * 0.18, _refQFold);
  refQuat(0, r.yaw + Math.PI, 0, _refQStand);
  // Chest stays folded on one skate, then comes upright as the second skate plants.
  if (p < 0.4) {
    if (r.tumble !== 0) _refQ.copy(_refQFall).slerp(_refQFold, refSmooth(Math.min(1, p / 0.18)));
    else _refQ.copy(_refQFold);
  } else if (p < 0.52) {
    _refQ.copy(_refQFold).slerp(_refQStand, refSmooth((p - 0.4) / 0.12));
  } else {
    _refQ.copy(_refQStand);
  }
  const plantP = r.tumble >= 0;
  let a: "down" | "one" | "both" | "stand" = "down";
  let b: "down" | "one" | "both" | "stand" = "one";
  let blend = 0;
  if (p < 0.18) {
    a = "down";
    b = "one";
    blend = refSmooth(p / 0.18);
  } else if (p < 0.4) {
    a = "one";
    b = "one";
  } else if (p < 0.52) {
    a = "one";
    b = "both";
    blend = refSmooth((p - 0.4) / 0.12);
  } else if (p < 0.7) {
    a = "both";
    b = "both";
  } else {
    a = "both";
    b = "stand";
    blend = refSmooth((p - 0.7) / 0.3);
  }
  const yA = writeRefSnap(a, plantP, fallY, _refHip, _refSoleM, _refSoleP);
  const yB = writeRefSnap(b, plantP, fallY, _refHipB, _refSoleMB, _refSolePB);
  _refHip.lerp(_refHipB, blend);
  _refSoleM.lerp(_refSoleMB, blend);
  _refSoleP.lerp(_refSolePB, blend);
  const rootY = yA + (yB - yA) * blend;
  const floorY = 0.14 * refSmooth(Math.min(1, Math.max(0, (p - 0.02) / 0.14)));
  root.position.set(r.x, rootY, r.z);
  root.rotation.set(0, 0, 0);
  body.position.copy(_refHip);
  body.quaternion.copy(_refQ);
  plantRefLeg(lLeg, -0.13, _refSoleM, floorY, rootY);
  plantRefLeg(rLeg, 0.13, _refSoleP, floorY, rootY);
  if (shadow) {
    _refLand.copy(_refSoleLocal).applyQuaternion(lLeg.quaternion).add(lLeg.position);
    const lx = _refLand.x;
    const lz = _refLand.z;
    _refLand.copy(_refSoleLocal).applyQuaternion(rLeg.quaternion).add(rLeg.position);
    shadow.position.set((lx + _refLand.x) * 0.5, SHADOW_ICE_Y, (lz + _refLand.z) * 0.5);
  }
}

function poseRefRiseArms(lArm: THREE.Group, rArm: THREE.Group, p: number, tumble: number) {
  const brace = tumble !== 0 ? refSmooth(Math.min(1, p / 0.18)) : 1;
  const up = p < 0.4 ? 0 : p < 0.52 ? refSmooth((p - 0.4) / 0.12) : 1;
  const w = brace * (1 - up);
  const hang = 0.25;
  lArm.rotation.set(hang + (-0.35 - hang) * w, 0.2 * w, 0.85 * w);
  rArm.rotation.set(hang + (-0.35 - hang) * w, -0.2 * w, -0.85 * w);
}

export function RefereeMesh({ lane = 1 }: { lane?: 1 | -1 }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const lLeg = useRef<THREE.Group>(null);
  const rLeg = useRef<THREE.Group>(null);
  const lArm = useRef<THREE.Group>(null);
  const rArm = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const mats = useMemo(
    () => ({
      helm: mat("#1a1a1a", { roughness: 0.32, metalness: 0.2 }),
      white: mat("#f4f4f0", { roughness: 0.7 }),
      black: mat("#161616", { roughness: 0.62 }),
      orange: mat("#e85d04", { roughness: 0.55 }),
      pants: mat("#111111", { roughness: 0.7 }),
      blade: mat("#c5ccd4", {
        roughness: 0.38,
        metalness: 0.28,
        emissive: "#9aa3ab",
        emissiveIntensity: 0.22,
      }),
      mask: mat("#121212", { roughness: 0.42, metalness: 0.18 }),
    }),
    [],
  );
  useLayoutEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats],
  );

  useFrame(() => {
    const r = lane >= 0 ? world.ref : world.ref2;
    const g = root.current;
    const b = body.current;
    const ll = lLeg.current;
    const rl = rLeg.current;
    if (!g || !b || !ll || !rl) return;
    // Rise pivots the chest at the hip. Root pitch stays 0 so the feet hinge is not played backward.
    const rising = r.struck > 0 && (r.tumble !== 0 ? r.struck < REF_TUMBLE_RISE : r.struck < REF_HINGE_RISE);
    let down = 0;
    if (rising) {
      poseRefRise(r, g, b, ll, rl, shadow.current);
    } else if (r.tumble !== 0 && r.struck >= REF_TUMBLE_RISE) {
      const t = tumbleRoot(r.struck, r.tumble, r.yaw);
      g.position.set(r.x, t.y, r.z);
      g.rotation.set(t.rx, t.ry, t.rz);
      restRefRig(b, ll, rl, shadow.current);
    } else {
      down = r.struck > 0.2 ? Math.min(1, r.struck) : 0;
      g.position.set(r.x, 0, r.z);
      g.rotation.set(down * 1.05, r.yaw + Math.PI, down * 0.18);
      restRefRig(b, ll, rl, shadow.current);
    }
    if (lArm.current) {
      lArm.current.position.set(-0.24, 1.46, 0);
      lArm.current.scale.set(1, 1, 1);
      lArm.current.quaternion.identity();
      lArm.current.rotation.set(0.25, 0, 0);
    }
    if (rArm.current) {
      rArm.current.position.set(0.24, 1.46, 0);
      rArm.current.scale.set(1, 1, 1);
      rArm.current.quaternion.identity();
      rArm.current.rotation.set(0.25, 0, 0);
    }
    if (rising && lArm.current && rArm.current) {
      const start = r.tumble !== 0 ? REF_TUMBLE_RISE : REF_HINGE_RISE;
      poseRefRiseArms(lArm.current, rArm.current, (start - r.struck) / start, r.tumble);
    } else if (down > 0.18) {
      if (lArm.current) lArm.current.rotation.set(-0.35, 0.2, 0.85);
      if (rArm.current) rArm.current.rotation.set(-0.35, -0.2, -0.85);
    } else if (r.pose === "drop") {
      const dx = world.puck.x - r.x;
      const dy = world.puck.y - 1.46;
      const dz = world.puck.z - r.z;
      const yaw = r.yaw + Math.PI;
      const c = Math.cos(yaw);
      const si = Math.sin(yaw);
      const lx = dx * c + dz * si;
      const lz = -dx * si + dz * c;
      const vx = lx - 0.28;
      const vz = lz;
      const len = Math.hypot(vx, dy, vz) || 1;
      if (rArm.current) {
        rArm.current.position.set(0.24, 1.46, 0);
        rArm.current.scale.set(1, Math.max(0.95, Math.min(1.72, len / 0.42)), 1);
        _refArmPoint.set(vx / len, dy / len, vz / len);
        rArm.current.quaternion.setFromUnitVectors(_refArmDown, _refArmPoint);
      }
      if (lArm.current) {
        lArm.current.position.set(-0.24, 1.46, 0);
        lArm.current.scale.set(1, 1, 1);
        lArm.current.rotation.set(0.22, 0, 0.12);
      }
    } else if (r.pose === "goal") {
      if (rArm.current) {
        rArm.current.position.set(0.24, 1.46, 0);
        rArm.current.scale.set(1, 1, 1);
        rArm.current.quaternion.identity();
        rArm.current.rotation.set(-Math.PI / 2, 0, 0);
      }
      if (lArm.current) {
        lArm.current.position.set(-0.24, 1.46, 0);
        lArm.current.scale.set(1, 1, 1);
        lArm.current.quaternion.identity();
        lArm.current.rotation.set(0.06, 0, 0);
      }
    } else if (r.pose === "cover") {
      if (rArm.current) rArm.current.rotation.set(0.1, 0, -1.35);
      if (lArm.current) lArm.current.rotation.set(0.1, 0, 1.35);
    }
    if (shadow.current) plantRinkShadow(shadow.current, shadow.current.position.x, shadow.current.position.z, 1);
  });

  return (
    <group ref={root}>
      <mesh ref={shadow} geometry={refShadowGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, SHADOW_ICE_Y, 0]}>
        <meshBasicMaterial color="#000000" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <group ref={body} position={[0, REF_HIP, 0]}>
        <group position={[0, -REF_HIP, 0]}>
          <mesh geometry={refNeck} material={mats.white} position={[0, 1.52, 0.02]} />
          <mesh geometry={refHelmet} material={mats.helm} position={[0, 1.62, 0.02]} scale={[1.05, 0.92, 1.12]} />
          <mesh geometry={refTorso} material={mats.white} position={[0, 1.18, 0]} />
          {[1, 3, 5, 7, 9].map((i) => {
            const x = -0.2 + (i + 0.5) * REF_BAND;
            return <mesh key={`f${i}`} geometry={refStripe} material={mats.black} position={[x, 1.18, 0]} />;
          })}
          {[1, 3, 5, 7].map((i) => {
            const z = -0.14 + (i + 0.5) * REF_SIDE_BAND;
            return (
              <group key={`sd${i}`}>
                <mesh geometry={refSideStripe} material={mats.black} position={[0.21, 1.18, z]} />
                <mesh geometry={refSideStripe} material={mats.black} position={[-0.21, 1.18, z]} />
              </group>
            );
          })}
          <mesh geometry={refPants} material={mats.pants} position={[0, 0.84, 0]} />
          <group ref={lArm} position={[-0.24, 1.46, 0]}>
            <mesh geometry={refArm} material={mats.white} position={[0, -0.2, 0]} />
            {[1, 3].map((i) => {
              const x = -0.06 + (i + 0.5) * refArmBand;
              return <mesh key={`ls${i}`} geometry={refArmStripe} material={mats.black} position={[x, -0.2, 0]} />;
            })}
            {[1, 3].map((i) => {
              const z = -0.065 + (i + 0.5) * refArmBand;
              return <mesh key={`lz${i}`} geometry={refArmSideStripe} material={mats.black} position={[0, -0.2, z]} />;
            })}
            <mesh geometry={refBand} material={mats.orange} position={[0, -0.26, 0]} />
            <mesh geometry={gloveGeo} material={mats.black} position={[0, -0.44, 0.02]} />
          </group>
          <group ref={rArm} position={[0.24, 1.46, 0]}>
            <mesh geometry={refArm} material={mats.white} position={[0, -0.2, 0]} />
            {[1, 3].map((i) => {
              const x = -0.06 + (i + 0.5) * refArmBand;
              return <mesh key={`rs${i}`} geometry={refArmStripe} material={mats.black} position={[x, -0.2, 0]} />;
            })}
            {[1, 3].map((i) => {
              const z = -0.065 + (i + 0.5) * refArmBand;
              return <mesh key={`rz${i}`} geometry={refArmSideStripe} material={mats.black} position={[0, -0.2, z]} />;
            })}
            <mesh geometry={refBand} material={mats.orange} position={[0, -0.26, 0]} />
            <mesh geometry={gloveGeo} material={mats.black} position={[0, -0.44, 0.02]} />
          </group>
        </group>
      </group>
      <group ref={lLeg} position={[-0.13, REF_HIP, 0]}>
        <mesh geometry={refLeg} material={mats.pants} position={[0, 0.55 - REF_HIP, 0]} />
        <mesh geometry={refBoot} material={mats.helm} position={[0, 0.22 - REF_HIP, 0.04]} />
        <SkateSole mats={{ blade: mats.blade, skates: mats.helm, mask: mats.mask }} position={[0, 0.15 - REF_HIP, 0.04]} />
      </group>
      <group ref={rLeg} position={[0.13, REF_HIP, 0]}>
        <mesh geometry={refLeg} material={mats.pants} position={[0, 0.55 - REF_HIP, 0]} />
        <mesh geometry={refBoot} material={mats.helm} position={[0, 0.22 - REF_HIP, 0.04]} />
        <SkateSole mats={{ blade: mats.blade, skates: mats.helm, mask: mats.mask }} position={[0, 0.15 - REF_HIP, 0.04]} />
      </group>
    </group>
  );
}

const ghostPuckGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.032, 16);
const ghostBandGeo = new THREE.TorusGeometry(0.04, 0.006, 6, 14);

function DrillGhostPucks() {
  const root = useRef<THREE.Group>(null);
  const pool = useRef<{ mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; bandMat: THREE.MeshStandardMaterial }[]>([]);
  useLayoutEffect(
    () => () => {
      for (const slot of pool.current) {
        slot.mat.dispose();
        slot.bandMat.dispose();
      }
    },
    [],
  );
  useFrame(() => {
    const parent = root.current;
    if (!parent) return;
    const ghosts = world.drillGhosts;
    while (pool.current.length < ghosts.length) {
      const mat = new THREE.MeshStandardMaterial({
        color: "#141414",
        roughness: 0.38,
        metalness: 0.12,
        transparent: true,
      });
      const bandMat = new THREE.MeshStandardMaterial({
        color: "#2a2a2a",
        roughness: 0.5,
        metalness: 0.08,
        transparent: true,
      });
      const mesh = new THREE.Mesh(ghostPuckGeo, mat);
      const band = new THREE.Mesh(ghostBandGeo, bandMat);
      mesh.add(band);
      parent.add(mesh);
      pool.current.push({ mesh, mat, bandMat });
    }
    for (let i = 0; i < pool.current.length; i++) {
      const slot = pool.current[i]!;
      const g = ghosts[i];
      if (!g) {
        slot.mesh.visible = false;
        continue;
      }
      const fade = drillFade(g.age);
      slot.mesh.visible = fade > 0.02;
      slot.mesh.position.set(g.x, g.y, g.z);
      slot.mesh.rotation.y += 0.05 + Math.hypot(g.vx, g.vz) * 0.08;
      slot.mat.opacity = fade;
      slot.bandMat.opacity = fade;
      const solid = fade > 0.92;
      slot.mat.depthWrite = solid;
      slot.bandMat.depthWrite = solid;
    }
  });
  return <group ref={root} />;
}

export function PuckMesh() {
  const ref = useRef<THREE.Group>(null);
  const mark = useRef<THREE.Group>(null);
  const puckMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#141414",
        roughness: 0.38,
        metalness: 0.12,
      }),
    [],
  );
  const bandMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2a2a2a",
        roughness: 0.5,
        metalness: 0.08,
      }),
    [],
  );
  const discMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#8a9098",
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#111111",
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useLayoutEffect(
    () => () => {
      puckMat.dispose();
      bandMat.dispose();
      discMat.dispose();
      ringMat.dispose();
    },
    [puckMat, bandMat, discMat, ringMat],
  );
  useFrame(() => {
    const g = ref.current;
    if (g) {
      g.position.set(world.puck.x, world.puck.y, world.puck.z);
      const spin = Math.hypot(world.puck.vx, world.puck.vz) * 0.08;
      g.rotation.y += 0.05 + spin;
    }
    if (mark.current) {
      mark.current.position.set(world.puck.x, 0.018, world.puck.z);
    }
  });
  return (
    <>
      <group ref={mark}>
        <mesh geometry={puckDiscGeo} material={discMat} rotation={[-Math.PI / 2, 0, 0]} />
        <mesh geometry={puckRingGeo} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} />
      </group>
      <group ref={ref}>
        <mesh material={puckMat} position={[0, 0, 0]} castShadow>
          <cylinderGeometry args={[0.052, 0.052, 0.032, 22]} />
        </mesh>
        <mesh material={bandMat} position={[0, 0, 0]}>
          <torusGeometry args={[0.04, 0.006, 6, 18]} />
        </mesh>
      </group>
      <DrillGhostPucks />
    </>
  );
}
