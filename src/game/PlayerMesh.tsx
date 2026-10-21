import { useLayoutEffect, useMemo, useRef, type ReactElement, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { createNumberTexture } from "./iceTexture";
import { attackDir, burstPoseWeight, checkedCyclePose, defendDir, drillFade, faceYaw, goalieButterflyPose, goaliePlaysPuck, goalieZKind, noteGoalieMidBlade, rageDraw, shotFollowTime, TUMBLE_PITCH_MAX, TUMBLE_PITCH_RATE, TUMBLE_STRIKE, TUMBLE_UP, world, type Referee, type Skater } from "./sim";
import { GOALIE_BUTTERFLY_BLADE_LEAD, GOALIE_ICE_CENTER_Z, GOALIE_PADDLE_T, GOALIE_PADDLE_W, GOALIE_STICK_LEN, GOALIE_Z, GOALIE_Z_BLADE_LEAD, bodyToLocal, bodyToWorld, goalieIceGeo, goalieIceHeel, layoutGoalieStick, placeGoalieIceMesh, poseGoalieButterflyArms, poseGoalieButterflyLimbs, poseGoalieHand, poseGoalieButterflyStanceLimbs, poseGoaliePlay, poseGoalieZArms, poseGoalieZLimbs, posedBody, torsoPivotY, torsoPlacedY } from "./goalieStance";
import { SKATER_GRIP_BOT, SKATER_GRIP_TOP, SKATER_STICK_LEN, SKATER_TAPE_Z0, SKATER_TAPE_Z1, burstCarryStickAim, carryStickAim, dekePull, dekeStickAim, neutralCarryBlend, neutralCarryStickAim, shotStickAim, skaterBladeCurveX, skaterBladeLiePoint, skillCarryStickAim, stickFrame, type StickAim } from "./stickSide";
import { kitById, type UniformKit } from "./uniforms";
import { useGame } from "./store";
import { BLUE_X, GOAL_H, GOAL_LINE_X } from "./rink";
import { applyPoseJoints, namedPoseFor, poseHasJoint, stampPoseOverride, type PoseJointId } from "./poseOverrides";
import { pivotGoalieStickOnKnob, releaseStickFromHand, restoreGoalieStickGrip, setGoalieKnobShift } from "./stickKnobPivot";

export const USER_MARK_INNER = 0.44;
export const USER_MARK_OUTER = 0.54;
/** Ice disc under the puck. The ring around it starts at the inner radius. */
export const PUCK_MARK_INNER = 0.15;
export const PUCK_MARK_OUTER = 0.22;

const visorGeo = new THREE.BoxGeometry(0.2, 0.07, 0.08);
/** 10% narrower, 10% shorter, and 20% shallower than the 0.46 × 0.64 × 0.3 jersey. */
const torsoGeo = new THREE.BoxGeometry(0.414, 0.576, 0.24);
/** One flat shoulder cap. Depth matches the torso. The old chest slab and tilted side caps are this box. */
const yokeTopGeo = new THREE.BoxGeometry(0.61, 0.13, 0.24);
/** Same width and depth as torsoGeo. Height is 20% under the previous hip block. */
const PANTS_W = 0.414;
const PANTS_D = 0.24;
const PANTS_H = 0.2 * 0.9 * 0.8;
const SKATER_PANTS_H = 0.28 * 0.9 * 0.8;
const pantsGeo = new THREE.BoxGeometry(PANTS_W, PANTS_H, PANTS_D);
const skaterPantsGeo = new THREE.BoxGeometry(PANTS_W, SKATER_PANTS_H, PANTS_D);
const pantStripeGeo = new THREE.BoxGeometry(0.012, 0.2, 0.08);
/** Outer face of the side stripe, flush with the pant. */
const PANT_STRIPE_X = PANTS_W / 2 - 0.006;
/**
 * Pants center in the feet frame. The jersey hem is 0.9 for every kit.
 * The top sits 1 cm above that hem.
 */
const PANTS_Y_GOALIE = 0.9 + 0.01 - PANTS_H / 2;
const PANTS_Y_SKATER = 0.9 + 0.01 - SKATER_PANTS_H / 2;
/** Seated hips group is at y=0.16. Hem is 0.24. Top overlaps it; bottom stays under the bench hip. */
const PANTS_Y_SEAT = 0.24 + 0.003 - PANTS_H / 2 - 0.16;
/** Bench skaters use the standing skater pants. Same hem overlap, taller box. */
const PANTS_Y_SEAT_SKATER = 0.24 + 0.003 - SKATER_PANTS_H / 2 - 0.16;
/** Inside skaterPantsGeo. ±0.20 left the thigh cap outside the pelvis on a hit. */
const SKATER_HIP_X = 0.12;
const SKATER_HIP_Y = 0.86;
/** Jersey torso box center. Every kit uses the shortened jersey. The hem stays on the hips. */
function torsoMeshCenterY(_kitId: number, seated: boolean): number {
  if (seated) return 0.456;
  return 1.116;
}
/** How far the jersey top dropped when the height was cut, with the hem held on the hips. */
function torsoTopDrop(_kitId: number): number {
  return 0.48 * 0.1;
}
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
/** Kit 2 sleeve. Sides, front, and back run from the arm stripe to the shoulder end. The top face stays gold. */
const armSideStripeGeo = new THREE.BoxGeometry(0.01, 0.065, 0.145);
const armEndStripeGeo = new THREE.BoxGeometry(0.14, 0.065, 0.01);
const forearmGeo = new THREE.BoxGeometry(0.11, 0.26, 0.13);
const gloveGeo = new THREE.BoxGeometry(0.14, 0.12, 0.16);
/** Blocker glove center in the forearm. Rx(0.12) applied to the glove offset [-0.058, 0, -0.01]. */
const GOALIE_BLOCKER_POS: [number, number, number] = [-0.058, -0.2788, 0.02007];
/** Seated hand origin is that center. Blocker local position is -R times the glove offset. */
const GOALIE_BLOCKER_IN_HAND: [number, number, number] = [0.058, -0.0012, 0.00993];
/** Large glove face (local +Y, 0.14 by 0.16) turned onto the board. Long edge stays on Z. */
const BLOCKER_GLOVE_ROLL: [number, number, number] = [0, 0, -Math.PI / 2];
/** 0.5 mm past that face. Board thickness stays on +X; its short edge (0.18) runs along Z. */
const BLOCKER_BOARD_AT: [number, number, number] = [0.088, 0, 0];
const BLOCKER_TRIM_AT: [number, number, number] = [0.098, 0, 0.09];
const BLOCKER_GLOVE_SEATED: [number, number, number] = [-0.058, 0, -0.01];
const BLOCKER_BOARD_SEATED: [number, number, number] = [0.03, 0, -0.01];
const BLOCKER_TRIM_SEATED: [number, number, number] = [0.04, 0, 0.08];
const sockStripeGeo = new THREE.BoxGeometry(0.145, 0.04, 0.165);
const goaliePadThighGeo = new THREE.BoxGeometry(0.22, 0.34, 0.12);
const goaliePadKneeGeo = new THREE.BoxGeometry(0.23, 0.09, 0.13);
/** Ankle face. Shorter than the shin; it covers the top of the skate, not the whole boot. */
const goaliePadAnkleGeo = new THREE.BoxGeometry(0.2, 0.09, 0.14);
const goalieBootGeo = new THREE.BoxGeometry(0.16, 0.09, 0.28);
/** Shin pad in the shin frame: length along Y, wide face toward +Z. Width is 20% under 0.15. HALF_L stays the pose anchor. */
const GOALIE_SHIN_HALF_W = 0.15 * 0.8;
const GOALIE_SHIN_HALF_L = 0.22;
const GOALIE_SHIN_FRONT_Z = 0.024;
const GOALIE_SHIN_BACK_Z = -0.012;
const GOALIE_SHIN_MESH_Z = 0.02;
/** Center of the shin face. Thigh and knee faces use this so the pad is one plane. */
const GOALIE_PAD_FACE_Z = GOALIE_SHIN_MESH_Z + (GOALIE_SHIN_FRONT_Z + GOALIE_SHIN_BACK_Z) / 2;
/**
 * Geometry Y in the pad mesh. The mesh stays at y=-HALF_L.
 * Height is 20% over the old 0.30 span. The center stays at 0.07.
 */
const GOALIE_SHIN_PAD_Y0 = 0.07 - 0.15 * 1.2;
const GOALIE_SHIN_PAD_Y1 = 0.07 + 0.15 * 1.2;
/** Under the knee pivot, level with the bottom of the knee block. */
const GOALIE_KNEE_DROP = 0.03;
/** Centered on the shin. The pad is wider than the leg, so it covers the front and hangs past both edges. */
const GOALIE_SHIN_LIFT = 0;
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
  const y0 = GOALIE_SHIN_PAD_Y0;
  const y1 = GOALIE_SHIN_PAD_Y1;
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
/** Thin cage wires. Each segment is scaled to the distance between two grid points. */
const cageBarV = new THREE.BoxGeometry(0.0055, 1, 0.0055);
const cageBarH = new THREE.BoxGeometry(1, 0.0055, 0.0055);
/**
 * Rectangular shell shared by skaters, goalies, and referees. +Z is the face.
 * Depth matches the shoulder cap (yokeTopGeo is 0.24 along Z).
 * The other edges keep the 0.76 : 0.92 : 1.12 ratio, so front-to-back is
 * longest, then top-to-bottom, then side-to-side.
 * Goalie heads undo the root scale, so a goalie shell matches a skater shell.
 */
const HELMET_DEPTH = 0.24;
const HELMET_SX = 0.76;
const HELMET_SY = 0.92;
const HELMET_SZ = 1.12;
const HELMET_POS_Y = 0.08;
const HELMET_RZ = HELMET_DEPTH / 2;
const HELMET_RX = HELMET_RZ * (HELMET_SX / HELMET_SZ);
const HELMET_RY = HELMET_RZ * (HELMET_SY / HELMET_SZ);
const helmetGeo = new THREE.BoxGeometry(HELMET_RX * 2, HELMET_RY * 2, HELMET_RZ * 2);
/** Referee shell. Same box as skaters and goalies. */
const refHelmet = helmetGeo;
/** 7×7 opening. Outer x stays inside the front face. Outer y is 0..0.14. */
const CAGE_HALF_X = 0.065;
const CAGE_X = [-3, -2, -1, 0, 1, 2, 3].map((i) => (i * CAGE_HALF_X) / 3);
const CAGE_Y = [0, 0.023333, 0.046667, 0.07, 0.093333, 0.116667, 0.14] as const;

/** Front face of the box. Outside the face the cage has nothing to mount on. */
function shellFrontZ(x: number, y: number) {
  if (Math.abs(x) > HELMET_RX || Math.abs(y - HELMET_POS_Y) > HELMET_RY) return 0;
  return HELMET_RZ;
}

/** Outer grid points sit on the shell. Interior points bow forward. */
function cageZ(x: number, y: number) {
  const edge = Math.min(1, Math.max(Math.abs(x / CAGE_HALF_X), Math.abs((y - 0.07) / 0.07)));
  return shellFrontZ(x, y) + 0.05 * (1 - edge * edge);
}

const catcherWebGeo = new THREE.BoxGeometry(0.16, 0.2, 0.04);
/** Back-of-wrist roll. The wrap and lip cylinders sit around the forearm. */
const catcherCuffGeo = new THREE.BoxGeometry(0.14, 0.068, 0.05);
const catcherCuffWrapGeo = new THREE.CylinderGeometry(0.086, 0.092, 0.08, 8);
const catcherCuffLipGeo = new THREE.CylinderGeometry(0.094, 0.112, 0.044, 8);
/** Thumb pad. Local +Y runs from the cuff break out beside the pocket. */
const catcherThumbGeo = new THREE.BoxGeometry(0.074, 0.16, 0.08);
const catcherThumbBreakGeo = new THREE.BoxGeometry(0.052, 0.07, 0.056);
const catcherThumbTipGeo = new THREE.SphereGeometry(0.036, 8, 6);
/** Padded shell behind the pocket. The mesh scale flattens it. */
const catcherBackGeo = new THREE.SphereGeometry(0.1, 8, 6);
const catcherHeelGeo = new THREE.SphereGeometry(0.046, 7, 5);
const catcherRimXGeo = new THREE.BoxGeometry(0.046, 0.236, 0.092);
const catcherRimYGeo = new THREE.BoxGeometry(0.16, 0.04, 0.092);
/** Rim corner. Local Y is the cylinder axis; the mesh turns it along pocket depth. */
const catcherRimCornerGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.086, 6);
/**
 * Leather frame beside the glove on local +X, meeting the front face (z = 0.08).
 * Opening is 0.102 × 0.087 around the 0.10 × 0.085 net and still faces +Z.
 */
const CATCHER_TRIM_T = 0.015;
const CATCHER_TRIM_D = 0.034;
const CATCHER_TRIM_W = 0.132;
const CATCHER_TRIM_H = 0.117;
const catcherTrimSideGeo = new THREE.BoxGeometry(CATCHER_TRIM_T, CATCHER_TRIM_H, CATCHER_TRIM_D);
const catcherTrimCapGeo = new THREE.BoxGeometry(CATCHER_TRIM_W, CATCHER_TRIM_T, CATCHER_TRIM_D);
const CATCHER_TRIM_X = CATCHER_TRIM_W / 2 - CATCHER_TRIM_T / 2;
const CATCHER_TRIM_Y = CATCHER_TRIM_H / 2 - CATCHER_TRIM_T / 2;
/** Opening's near edge is 2 mm inside the +X face (x = 0.07). Back of the frame is 6 mm inside the front face. */
const CATCHER_POCKET_X = 0.07 - 0.002 + (CATCHER_TRIM_W / 2 - CATCHER_TRIM_T);
const CATCHER_POCKET_Z = 0.08 - 0.006 + CATCHER_TRIM_D / 2;
const CATCHER_NET_Z = CATCHER_POCKET_Z + CATCHER_TRIM_D / 2 - 0.008;
/** Visual center of the catcher in the forearm. The left-hand joint sits here. */
const CATCHER_PIVOT_LIVE: [number, number, number] = [0.03928, -0.2928, 0.08468];
const CATCHER_PIVOT_SEAT: [number, number, number] = [0.04101, -0.28971, 0.06544];
/** Same white as the goal-net mesh in Rink.tsx. */
const NET_WHITE = "#e8eef4";

/**
 * Pocket shell, built like the goal cage: a quad grid the net texture sits on.
 * The center bows toward local -Z, into the glove. Winding faces +Z (the shooter).
 * Check: the center vertex normal is (0, 0, 1).
 */
function makeCatcherPocketNet() {
  const w = 0.1;
  const h = 0.085;
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

/**
 * Catcher webbing. The goal net is 14 by 14 cells with a 2.1 px cord.
 * This pocket keeps 60% of the horizontal cords and 50% of the vertical cords, 50% thicker.
 */
function pocketNetTexture(): THREE.CanvasTexture {
  if (!pocketNetTex) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    if (!g) throw new Error("catcher net: no canvas context");
    g.clearRect(0, 0, size, size);
    g.fillStyle = "rgba(196, 206, 216, 0.16)";
    g.fillRect(0, 0, size, size);
    g.strokeStyle = "rgba(236, 242, 246, 0.92)";
    g.lineWidth = 2.1 * 1.5;
    const cols = Math.round(14 * 0.5);
    const rows = Math.round(14 * 0.6);
    const xStep = size / cols;
    const yStep = size / rows;
    for (let i = 0; i <= cols; i++) {
      g.beginPath();
      g.moveTo(i * xStep, 0);
      g.lineTo(i * xStep, size);
      g.stroke();
    }
    for (let i = 0; i <= rows; i++) {
      g.beginPath();
      g.moveTo(0, i * yStep);
      g.lineTo(size, i * yStep);
      g.stroke();
    }
    g.strokeStyle = "rgba(168, 180, 192, 0.55)";
    g.lineWidth = 0.9 * 1.5;
    for (let i = 0; i < cols; i++) {
      g.beginPath();
      g.moveTo(i * xStep, 0);
      g.lineTo((i + 1) * xStep, size);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    pocketNetTex = tex;
  }
  return pocketNetTex;
}

const blockerBoardGeo = new THREE.BoxGeometry(0.055, 0.36, 0.18);
/** Extra roll on the board's outside edge. Local +Z is that edge when the face points at the shooter. */
const blockerTrimGeo = new THREE.BoxGeometry(0.075, 0.36, 0.028);
const stickShaftGeo = new THREE.CylinderGeometry(0.009, 0.014, 1, 8);
/**
 * Skater blade in the stick frame, before the lie rotation.
 * +Z runs to the toe, +Y is face height, X is thickness.
 * Thickness matches the shaft at the heel (diameter 0.028). The face is taller than that.
 * Heel and toe stay the shaft color. The heel is straight. The tape turns inward
 * toward local +X (player's left), and the toe stays straight on that exit angle.
 * The taped span is only the tape mesh, so the black blade cannot show through it.
 * Vertices are then rotated +45° around X so the shaft and the sole meet at 135°.
 * The rounded toe is the end of the blade.
 * Along the heel, the top edge turns into the blade before the sole does.
 */
const SKATER_BLADE_HALF = 0.014;
const SKATER_TAPE_PAD = 0.0015;

function catmullBlade(pts: { z: number; y: number }[], nPer: number) {
  const out: { z: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < nPer; s++) {
      const t = s / nPer;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function bladeLine(a: { z: number; y: number }, b: { z: number; y: number }, n: number) {
  const out: { z: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    out.push({ z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function skaterBladeOutline() {
  const top = catmullBlade(
    [
      { z: 0, y: 0.046 },
      { z: 0.035, y: 0.046 },
      { z: 0.09, y: 0.049 },
      { z: 0.15, y: 0.055 },
      { z: 0.22, y: 0.064 },
      { z: 0.28, y: 0.072 },
      { z: 0.318, y: 0.074 },
    ],
    4,
  );
  top.pop();
  const toe: { z: number; y: number }[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI / 2 - (i / 14) * Math.PI;
    toe.push({ z: 0.318 + Math.cos(a) * 0.062, y: 0.037 + Math.sin(a) * 0.037 });
  }
  const sole = bladeLine(toe[toe.length - 1], { z: 0.07, y: 0 }, 4);
  const heel = catmullBlade(
    [
      { z: 0.07, y: 0 },
      { z: 0.045, y: 0 },
      { z: 0.02, y: 0.004 },
      { z: 0.004, y: 0.016 },
      { z: -0.002, y: 0.03 },
      { z: 0, y: 0.046 },
    ],
    4,
  );
  heel.pop();
  const pts = [...top, ...toe, ...sole, ...heel];
  for (const p of pts) if (p.y < 0) p.y = 0;
  return pts;
}

function bladeVert(x: number, y: number, z: number): [number, number, number] {
  const lied = skaterBladeLiePoint(x + skaterBladeCurveX(z), y, z);
  return [lied.x, lied.y, lied.z];
}

/** Keep the part of a closed outline on one side of a z cut. */
function clipBladeZ(pts: { z: number; y: number }[], limit: number, keepAbove: boolean): { z: number; y: number }[] {
  const inside = (z: number) => (keepAbove ? z >= limit - 1e-8 : z <= limit + 1e-8);
  const cross = (a: { z: number; y: number }, b: { z: number; y: number }) => {
    const t = (limit - a.z) / (b.z - a.z || 1e-8);
    return { z: limit, y: a.y + (b.y - a.y) * t };
  };
  const out: { z: number; y: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const ain = inside(a.z);
    const bin = inside(b.z);
    if (ain && bin) out.push(b);
    else if (ain && !bin) out.push(cross(a, b));
    else if (!ain && bin) {
      out.push(cross(a, b));
      out.push(b);
    }
  }
  return out;
}

function extrudeBlade(poly: { z: number; y: number }[], inflate: number): THREE.BufferGeometry | null {
  if (poly.length < 3) return null;
  const verts: number[] = [];
  const idx: number[] = [];
  const add = (x: number, y: number, z: number) => {
    const i = verts.length / 3;
    const bow = skaterBladeCurveX(z);
    const p = skaterBladeLiePoint(bow + x, y, z);
    verts.push(p.x, p.y, p.z);
    return i;
  };
  const right: number[] = [];
  const left: number[] = [];
  for (const p of poly) {
    const pad = Math.sign(1) * inflate;
    right.push(add(SKATER_BLADE_HALF + pad, p.y, p.z));
    left.push(add(-SKATER_BLADE_HALF - pad, p.y, p.z));
  }
  const faces = THREE.ShapeUtils.triangulateShape(
    poly.map((p) => new THREE.Vector2(p.z, p.y)),
    [],
  );
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(right[i]!, left[i]!, right[j]!, left[i]!, left[j]!, right[j]!);
  }
  for (const [a, b, c] of faces) {
    idx.push(right[a]!, right[c]!, right[b]!);
    idx.push(left[a]!, left[b]!, left[c]!);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function mergeBladeGeos(parts: Array<THREE.BufferGeometry | null>): THREE.BufferGeometry {
  const verts: number[] = [];
  const idx: number[] = [];
  for (const geo of parts) {
    if (!geo) continue;
    const base = verts.length / 3;
    const pos = geo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) verts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    const index = geo.getIndex();
    if (!index) continue;
    for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + base);
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

function makeSkaterStickBlade() {
  const outline = skaterBladeOutline();
  const heel = clipBladeZ(outline, SKATER_TAPE_Z0, false);
  const toe = clipBladeZ(outline, SKATER_TAPE_Z1, true);
  const tape = clipBladeZ(clipBladeZ(outline, SKATER_TAPE_Z0, true), SKATER_TAPE_Z1, false);
  return {
    blade: mergeBladeGeos([extrudeBlade(heel, 0), extrudeBlade(toe, 0)]),
    tape: extrudeBlade(tape, SKATER_TAPE_PAD) ?? new THREE.BufferGeometry(),
  };
}

const { blade: skaterBladeGeo, tape: skaterTapeGeo } = makeSkaterStickBlade();
/** Sole corners after the lie, used to plant the low point without treating the blade as a putter. */
const SKATER_SOLE_SAMPLES: ReadonlyArray<readonly [number, number, number]> = [0.07, 0.2, 0.318, 0.38].flatMap((z) =>
  ([-1, 1] as const).map((side) => bladeVert(side * (SKATER_BLADE_HALF + SKATER_TAPE_PAD), 0, z)),
);
const knobGeo = new THREE.BoxGeometry(0.036, 0.026, 0.036);
/** Wide lower paddle, half the old unit height. The shaft group still scales it. */
const goaliePaddleGeo = new THREE.BoxGeometry(GOALIE_PADDLE_W, 0.5, GOALIE_PADDLE_T);
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
/** Identity. The mark group's children are already laid flat, so the group itself must not take the shadow's −90° X. */
const _rinkMarkLevel = new THREE.Quaternion();
const _shadowCom = new THREE.Vector3();
const SHADOW_ICE_Y = 0.015;
const STICK_ICE_Y = 0.03;
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
/** Faceoff set. Chest over a flat blade. Back skate, then the left skate a step ahead. */
const PUCK_DROP_PITCH = (36 * Math.PI) / 180;
const PUCK_DROP_KNEE = (82 * Math.PI) / 180;
const PUCK_DROP_KNEE_F = (100 * Math.PI) / 180;
const PUCK_DROP_DROP = -0.12;
const PUCK_DROP_FOOT_Z = 0.26;
const PUCK_DROP_FOOT_Z_F = 0.42;
const PUCK_DROP_STANCE = SKATER_HIP_X + 0.06;
const PUCK_DROP_ABDUCT = (14 * Math.PI) / 180;
const PUCK_DROP_ANKLE = (8 * Math.PI) / 180;
/** Shaft angle off vertical. A diagonal down to the dot, not a near-vertical plant. */
const PUCK_DROP_SHAFT = (50 * Math.PI) / 180;
/** 90° would lay the shaft out to the player's left. 130° brings the heel forward. */
const PUCK_DROP_YAW = (130 * Math.PI) / 180;
/** Lower than the carry knob. Hands stay 0.30 m apart on the shortened shaft. */
const PUCK_DROP_GRIP_TOP = 0.58;
const PUCK_DROP_GRIP_BOT = PUCK_DROP_GRIP_TOP - 0.3 / SKATER_STICK_LEN;
/**
 * Draw crouch for the two dot takers. The gallery "Puck drop" skater is one of them.
 * The body stays on the skater root. The heel stays in front of the hips in that frame.
 * Shaft is 44° off vertical. The old [0.05, 0.92, -0.15] shaft was about 10° off vertical.
 */
const DRAW_PITCH = (42 * Math.PI) / 180;
const DRAW_DROP = -0.12;
const DRAW_HIP_BACK = 1.05;
/** How far the pitched helmet sits ahead of the hips. The crouch shifts back by this so the head stays over the root. */
const DRAW_HEAD_OVER_ROOT = 1.115;
const DRAW_STANCE = SKATER_HIP_X + 0.1;
const DRAW_KNEE_F = (108 * Math.PI) / 180;
const DRAW_KNEE_B = (110 * Math.PI) / 180;
const DRAW_TOE_F = (8 * Math.PI) / 180;
const DRAW_TOE_B = (6 * Math.PI) / 180;
const DRAW_ABDUCT = (14 * Math.PI) / 180;
const DRAW_ANKLE = (6 * Math.PI) / 180;
/** Sole centers this far behind the heel on local −Z. A shorter gap than a full stride. */
const DRAW_FOOT_F = 0.36;
const DRAW_FOOT_B = 0.52;
/** Between the planted skates. The sweep stops here so both hands stay on the shaft. */
const DRAW_SWEEP_Z = 0.58;
const DRAW_SWEEP_T = 0.32;
/**
 * Same distances up the shaft as before (0.76 m and the old 1.58 m).
 * The upper grip stops at the knob now that the stick is chin height.
 */
const DRAW_GRIP_BOT = 0.616;
const DRAW_GRIP_TOP = 0.99;
const DRAW_HEEL_X = -1.12;
/** Back from the near-side gap. The blade still reaches toward the dot along +Z. */
const DRAW_HEEL_ADVANCE = -0.201;
/**
 * Flat 135° sole. The shaft runs from outside the right knee,
 * in front of both knees, to outside the left knee.
 */
const DRAW_SHAFT: [number, number, number] = [0.9544, 0.2389, 0.1789];
const DRAW_BLADE: [number, number, number] = [-0.842, 0, 0.5395];
/** Athletic stand. Taller than the faceoff crouch. Both skates share one plant. */
const READY_HIP = (10 * Math.PI) / 180;
const READY_KNEE = (40 * Math.PI) / 180;
const READY_DROP = -0.096;
const READY_FOOT_Z = 0.1;
const READY_STANCE = SKATER_HIP_X + 0.04;
/** hypot(vx, vz). Held through a coast, blended out before that speed reads as a skate. */
const READY_COAST = 1.2;
const READY_SKATE = 2.6;
const READY_SHAFT_DOWN = (12 * Math.PI) / 180;
const READY_HAND: [number, number, number] = [0.32, 0.96, 0.52];
/** Ready pose only. Further down the shaft than SKATER_GRIP_BOT. */
const READY_GRIP_BOT = 0.53;
/** Owned puck, no burst. Wider than idle, front skate ahead, chest over the stick. */
const NEUTRAL_PITCH = (30 * Math.PI) / 180;
const NEUTRAL_DROP = -0.1002;
const NEUTRAL_KNEE_F = (54 * Math.PI) / 180;
const NEUTRAL_KNEE_B = (72 * Math.PI) / 180;
const NEUTRAL_THIGH_F = (-80.21 * Math.PI) / 180;
const NEUTRAL_THIGH_B = (-45.84 * Math.PI) / 180;
const NEUTRAL_STANCE = SKATER_HIP_X + 0.04;
const NEUTRAL_ABDUCT = (18 * Math.PI) / 180;
const NEUTRAL_TOE_F = (24 * Math.PI) / 180;
const NEUTRAL_TOE_B = (12 * Math.PI) / 180;
const NEUTRAL_ANKLE = (14 * Math.PI) / 180;
/** Top-speed carry. Chest over the stick. Legs swap on the stride phase. */
const BURST_PITCH = (52 * Math.PI) / 180;
const BURST_DROP = 0.08;
const BURST_STANCE = SKATER_HIP_X + 0.04;
const BURST_KNEE_F = (90 * Math.PI) / 180;
const BURST_KNEE_B = (16 * Math.PI) / 180;
const BURST_TOE_F = (14 * Math.PI) / 180;
const BURST_TOE_B = (18 * Math.PI) / 180;
/** Sole-center z of the near ice crossing. The far crossing sits near z 0.8 and 1.1. */
const BURST_Z_F = 0.573;
const BURST_Z_B = 0.271;
const BURST_SOLE: ReadonlyArray<readonly [number, number, number]> = [
  [0, -0.1375, -0.14],
  [0, -0.1375, 0.02],
  [0, -0.1375, 0.18],
];
/** Goal glide. Chest up, knees soft, legs swap on the celebrate clock. */
const CHEER_PITCH = (16 * Math.PI) / 180;
const CHEER_DROP = -0.105;
const CHEER_HEAD = -0.35;
/** Cheer head sits slightly forward so the standard helmet stays against the chest. */
const CHEER_HEAD_Z = 0.05;
const CHEER_STANCE = SKATER_HIP_X + 0.04;
const CHEER_KNEE_F = (56 * Math.PI) / 180;
const CHEER_KNEE_B = (34 * Math.PI) / 180;
const CHEER_Z_F = 0.4;
const CHEER_Z_B = 0.04;
const CHEER_GLIDE = (5 * Math.PI) / 4;
/** Left glove, body +X. The IK point is short of the socket so the glove lands 0.25 m forward. */
const CHEER_HAND_OUT = 0.08;
const CHEER_HAND_FWD = 0.23;
const CHEER_HAND_Y = 1.42;
/** Right glove. The rest pitch (0.4) bends the wrist down; this continues the forearm. */
const CHEER_FIST_PITCH = 0.04;
const _burstRoot = new THREE.Group();
const _burstBody = new THREE.Group();
const _burstFrame = new THREE.Group();
const _burstLeg = new THREE.Group();
const _burstShin = new THREE.Group();
const _burstBoot = new THREE.Group();
const _burstSole = new THREE.Vector3();
_burstFrame.name = "torsoFrame";
_burstShin.position.set(0, -0.32, 0);
_burstBoot.position.set(0, -0.3, 0.04);
_burstShin.add(_burstBoot);
_burstLeg.add(_burstShin);
_burstFrame.add(_burstLeg);
_burstBody.add(_burstFrame);
_burstRoot.add(_burstBody);
const POKE_HIP = (28 * Math.PI) / 180;
const POKE_TILT = (50 * Math.PI) / 180;
const POKE_FRONT_KNEE = (88 * Math.PI) / 180;
const POKE_BACK_KNEE = (28 * Math.PI) / 180;
const POKE_RELEASE = 0.15;
/** Right-shot rear skate (rLeg). Knee stays ahead of the ankle, with a modest forward shin. */
const POKE_BACK_FOOT_Z = -0.13;
/** Right-shot lead skate (lLeg). The shin stays nearly under the knee. */
const POKE_FRONT_FOOT_Z = 0.47;
/** Left hand at or above the knob-side grip. */
const POKE_LEFT_GRIP = 0.96;

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
  sockBand: THREE.MeshStandardMaterial;
  sockBandLow: THREE.MeshStandardMaterial;
  armStripe: THREE.MeshStandardMaterial | null;
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
  cage: THREE.MeshStandardMaterial;
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
    helmet: mat(kit.helmet, {
      roughness: 0.26,
      metalness: 0.14,
      envMapIntensity: 0.3,
      emissive: kit.helmet,
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
    stripe: mat(kit.pantStripe ?? kit.stripe, {
      roughness: 0.48,
      envMapIntensity: 1.4,
      emissive: kit.pantStripe ?? kit.stripe,
      emissiveIntensity: 0.3,
    }),
    sockBand: mat(kit.sockBand ?? kit.stripe, {
      roughness: 0.48,
      envMapIntensity: 1.4,
      emissive: kit.sockBand ?? kit.stripe,
      emissiveIntensity: 0.3,
    }),
    sockBandLow: mat(kit.sockBandLow ?? kit.stripe, {
      roughness: 0.48,
      envMapIntensity: 1.4,
      emissive: kit.sockBandLow ?? kit.stripe,
      emissiveIntensity: 0.3,
    }),
    armStripe: kit.armStripe
      ? mat(kit.armStripe, {
          roughness: 0.48,
          envMapIntensity: 1.4,
          emissive: kit.armStripe,
          emissiveIntensity: 0.3,
        })
      : null,
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
    blocker: mat(goalie ? legPad : "#f2ece0", { roughness: 0.48 }),
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
    cage: mat(pad, {
      roughness: 0.4,
      metalness: 0.2,
      emissive: pad,
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
  m.sockBand.dispose();
  m.sockBandLow.dispose();
  m.armStripe?.dispose();
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
  m.cage.dispose();
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

/**
 * Pre-drop set. Blade sole flat on the ice, toe ahead of the chest.
 * Shaft runs from that heel back up toward the left hand.
 * Local +X is the player's left. Local −X is the shot side.
 */
function puckDropStickAim(): StickAim {
  const sx = Math.sin(PUCK_DROP_SHAFT) * Math.sin(PUCK_DROP_YAW);
  const sy = Math.cos(PUCK_DROP_SHAFT);
  const sz = Math.sin(PUCK_DROP_SHAFT) * Math.cos(PUCK_DROP_YAW);
  return {
    heel: [-0.35, STICK_ICE_Y, 1.25],
    shaft: [sx, sy, sz],
    blade: [-sz, 0, sx],
  };
}

/**
 * No-puck stand. Shaft 12° up toward the knob, across the hips.
 * Top grip stays near the knob, outside the left hip.
 * Bottom grip is further down that shaft, outside the right hip.
 * Toe is up. The blade stays clear of the ice.
 * Local −X is the shot side for home and away.
 */
function skaterReadyStickAim(): StickAim {
  const sx = Math.cos(READY_SHAFT_DOWN);
  const sy = Math.sin(READY_SHAFT_DOWN);
  const along = SKATER_STICK_LEN * SKATER_GRIP_TOP;
  return {
    heel: [READY_HAND[0] - sx * along, READY_HAND[1] - sy * along, READY_HAND[2]],
    shaft: [sx, sy, 0],
    blade: [0, 1, 0.2],
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
  /** Horizontal toe, so a forward shaft can lie the sole on the ice. */
  flat: boolean;
  /** Root-frame sole Z. Player's right trails, player's left leads. */
  zL: number;
  zR: number;
  /** Boot yaw. π points the trail toe back along an extended leg. */
  toeL: number;
  toeR: number;
  /** Shift the pitched chest back so the lean hinges at the hips. */
  bz: number;
  /** Thighs leave the sockets by this much. Wrist keys stay at 0. */
  abduct: number;
  /** 0 keeps the right skate planted. 1 lifts it and aims the blade back. */
  lift: number;
  /** Bottom-hand fraction along the shaft. Lower sits closer to the blade. */
  botGrip: number;
};

const WRIST_BOT_ALONG = SKATER_STICK_LEN * SKATER_GRIP_BOT;
/** 10 cm further down the shaft than the carry grip. 0.60 sat past the right arm. */
const WRIST_LOW_GRIP = SKATER_GRIP_BOT - 0.1 / SKATER_STICK_LEN;
/** Both grips this much further forward in the yaw-0 root frame. */
const WRIST_REACH_Z = 0.06;
/** Chest yaw toward the player's right. The old gallery lean was about −39°. */
const WRIST_OPEN = (8 * Math.PI) / 180;
/** Lied-sole roll that lays the taped bottom flat after the chest yaw. */
const WRIST_FLAT_ROLL = (43 * Math.PI) / 180;
/** Horizontal blade-hint angle. Negative leans the toe back along the shaft so the 135° lie lies flat. */
const WRIST_BLADE_ALPHA = (-59.5 * Math.PI) / 180;
const WRIST_DIR: [number, number, number] = [0.897, 0.442, -0.005];
function wristBot(): [number, number, number] {
  return [-0.08, 0.56, 0.908 + WRIST_REACH_Z];
}
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
  flat: true,
  ...wristStance(0.22, 0.22),
};
const WRIST_SETTLE: WristKey = { ...WRIST_CARRY, hip: 0, drop: 0 };
const WRIST_LOAD: WristKey = {
  bot: wristBot(),
  dir: WRIST_DIR,
  roll: WRIST_FLAT_ROLL,
  yaw: 0,
  hip: (34 * Math.PI) / 180,
  aim: 0,
  open: WRIST_OPEN,
  weight: 0,
  kneeL: (34 * Math.PI) / 180,
  kneeR: (72 * Math.PI) / 180,
  drop: -0.06,
  flat: true,
  ...wristStance((34 * Math.PI) / 180, (72 * Math.PI) / 180, WRIST_LOW_GRIP),
};
const WRIST_PLANT: WristKey = {
  bot: wristBot(),
  dir: WRIST_DIR,
  roll: WRIST_FLAT_ROLL,
  yaw: 0,
  hip: (38 * Math.PI) / 180,
  aim: 0,
  open: WRIST_OPEN,
  weight: 0,
  kneeL: (28 * Math.PI) / 180,
  kneeR: (90 * Math.PI) / 180,
  drop: -0.05,
  flat: true,
  ...wristStance((28 * Math.PI) / 180, (90 * Math.PI) / 180, WRIST_LOW_GRIP),
};
const WRIST_RELEASE: WristKey = {
  bot: wristBot(),
  dir: WRIST_DIR,
  roll: WRIST_FLAT_ROLL + (8 * Math.PI) / 180,
  yaw: (-6 * Math.PI) / 180,
  hip: (38 * Math.PI) / 180,
  aim: 0,
  open: WRIST_OPEN,
  weight: 0,
  kneeL: (28 * Math.PI) / 180,
  kneeR: (86 * Math.PI) / 180,
  drop: -0.05,
  flat: true,
  ...wristStance((28 * Math.PI) / 180, (86 * Math.PI) / 180, WRIST_LOW_GRIP),
};
/**
 * Shared post-release finish for wrist, snap, and slap.
 * Pitch is half of the previous 50° slap follow. No chest yaw, so the
 * torso does not lean to either side. The right thigh and shin meet at
 * 90°. That skate stays lifted with the blade aimed back. The shaft falls about 10°.
 */
const FOLLOW_HIP = (25 * Math.PI) / 180;
/** Ankle sits 4 cm ahead of the shin, so this joint rotation makes the bones meet at 90°. */
const FOLLOW_KNEE_RIGHT = (97.59 * Math.PI) / 180;
const FOLLOW_BOT_GRIP = 0.48;
const FOLLOW_STICK_DIR: [number, number, number] = [0.9037, 0.0744, -0.4217];
const FOLLOW_STICK_BOT: [number, number, number] = [-0.0247, 0.8477, 0.7182];
/** Right thigh ~30° down and back in the player frame. Boot X cancels the knee opening so the blade stays aimed back. */
const FOLLOW_TRAIL_THIGH = (5 * Math.PI) / 180;
const FOLLOW_TRAIL_BOOT_X = (-32.59 * Math.PI) / 180;
const FOLLOW_TRAIL_BOOT_Y = 0;
const WRIST_FOLLOW: WristKey = {
  bot: FOLLOW_STICK_BOT,
  dir: FOLLOW_STICK_DIR,
  roll: WRIST_FLAT_ROLL,
  yaw: 0,
  hip: FOLLOW_HIP,
  aim: 0,
  open: 0,
  weight: 0,
  kneeL: FOLLOW_KNEE_RIGHT,
  kneeR: (82 * Math.PI) / 180,
  drop: -0.04,
  flat: true,
  zL: -0.35,
  zR: 0.35,
  toeL: 0,
  toeR: 0,
  bz: followHinge(FOLLOW_HIP, 0),
  abduct: 0,
  lift: 1,
  botGrip: FOLLOW_BOT_GRIP,
};
/** Outward elbow for the top wrist hand. +X is the player's left, away from the chest. */
const _wristTopPole = new THREE.Vector3(0.7, -0.03, 0.02);
/**
 * watchPoint's downward clamp (0.6) plants the visor in the chest and opens a
 * red neck gap behind the helmet. Positive rotation.x looks down.
 */
const WRIST_HEAD_DOWN = 0.36;
/** Fraction of the full two-bone bend. 1 folds the top arm back into the chest. */
const WRIST_TOP_BEND = 0.45;
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
  flat: false,
  zL: 0,
  zR: 0,
  toeL: 0,
  toeR: 0,
  bz: 0,
  abduct: 0,
  lift: 0,
  botGrip: SKATER_GRIP_BOT,
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
  flat: false,
  zL: 0,
  zR: 0,
  toeL: 0,
  toeR: 0,
  bz: 0,
  abduct: 0,
  lift: 0,
  botGrip: SKATER_GRIP_BOT,
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
  flat: false,
  zL: 0,
  zR: 0,
  toeL: 0,
  toeR: 0,
  bz: 0,
  abduct: 0,
  lift: 0,
  botGrip: SKATER_GRIP_BOT,
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
  flat: false,
  zL: 0,
  zR: 0,
  toeL: 0,
  toeR: 0,
  bz: 0,
  abduct: 0,
  lift: 0,
  botGrip: SKATER_GRIP_BOT,
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
    flat: a.flat && b.flat,
    zL: n(a.zL, b.zL),
    zR: n(a.zR, b.zR),
    toeL: n(a.toeL, b.toeL),
    toeR: n(a.toeR, b.toeR),
    bz: n(a.bz, b.bz),
    abduct: n(a.abduct, b.abduct),
    lift: n(a.lift, b.lift),
    botGrip: n(a.botGrip, b.botGrip),
  };
}

/** Horizontal toe hint. Leaned back along the shaft so the taped sole, not a ramp, meets the ice. */
function flatWristBlade(dx: number, dz: number): [number, number, number] {
  const horiz = Math.hypot(dx, dz) || 1;
  const hx = -dz / horiz;
  const hz = dx / horiz;
  const ax = dx / horiz;
  const az = dz / horiz;
  const c = Math.cos(WRIST_BLADE_ALPHA);
  const s = Math.sin(WRIST_BLADE_ALPHA);
  return [c * hx + s * ax, 0, c * hz + s * az];
}

function wristStickAim(key: WristKey): StickAim {
  const m = Math.hypot(key.dir[0], key.dir[1], key.dir[2]) || 1;
  const dx = key.dir[0] / m;
  const dy = key.dir[1] / m;
  const dz = key.dir[2] / m;
  const blade: [number, number, number] = key.flat ? flatWristBlade(dx, dz) : [0, 0, 1];
  return {
    heel: [key.bot[0] - dx * WRIST_BOT_ALONG, key.bot[1] - dy * WRIST_BOT_ALONG, key.bot[2] - dz * WRIST_BOT_ALONG],
    shaft: [dx, dy, dz],
    blade,
  };
}

const _wristMount = new THREE.Object3D();
const _wristInv = new THREE.Matrix4();

/** Authored aim is root space at chest yaw 0. Reapply it through the pitched, yawed chest. */
function mountWristAim(body: THREE.Group, aim: StickAim): StickAim {
  if (Math.abs(body.rotation.y) < 1e-4) return aim;
  _wristMount.position.copy(body.position);
  _wristMount.rotation.set(body.rotation.x, 0, body.rotation.z);
  _wristMount.scale.set(1, 1, 1);
  _wristMount.updateMatrix();
  _wristInv.copy(_wristMount.matrix).invert();
  _corner.set(aim.heel[0], aim.heel[1], aim.heel[2]).applyMatrix4(_wristInv);
  _ikTo.set(aim.heel[0] + aim.shaft[0], aim.heel[1] + aim.shaft[1], aim.heel[2] + aim.shaft[2]).applyMatrix4(_wristInv);
  _ikD1.set(aim.heel[0] + aim.blade[0], aim.heel[1] + aim.blade[1], aim.heel[2] + aim.blade[2]).applyMatrix4(_wristInv);
  body.updateMatrix();
  _corner.applyMatrix4(body.matrix);
  _ikTo.applyMatrix4(body.matrix);
  _ikD1.applyMatrix4(body.matrix);
  _ikTo.sub(_corner);
  _ikD1.sub(_corner);
  return {
    heel: [_corner.x, _corner.y, _corner.z],
    shaft: [_ikTo.x, _ikTo.y, _ikTo.z],
    blade: [_ikD1.x, _ikD1.y, _ikD1.z],
  };
}

/** Roll around the lied sole, then yaw around the shaft, so the side-view angle stays 135°. */
function poseWristBlade(blade: THREE.Group, _stick: THREE.Group, roll: number, yaw: number) {
  _parentQ.setFromAxisAngle(_ikD1.set(0, 1, 0), yaw);
  _ikInv.setFromAxisAngle(_ikN.set(0, -Math.SQRT1_2, Math.SQRT1_2), roll);
  blade.quaternion.copy(_parentQ).multiply(_ikInv);
}

function seatBlade(stick: THREE.Group, blade: THREE.Group, lock = true) {
  stick.updateWorldMatrix(true, true);
  let minY = Infinity;
  for (const p of SKATER_SOLE_SAMPLES) {
    _corner.set(p[0], p[1], p[2]);
    blade.localToWorld(_corner);
    if (_corner.y < minY) minY = _corner.y;
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

/** Player's left (x > 0) steps forward as the knee flexes. The other skate stays back. */
function wristFootZ(x: number, knee: number): number {
  const bend = Math.max(0, Math.min(1, ((knee * 180) / Math.PI - 16) / 80));
  return x > 0 ? 0.12 + bend * 0.56 : 0.2 - bend * 0.04;
}

/** Load and release keep this stance. Follow replaces it. */
function wristStance(
  kneeL: number,
  kneeR: number,
  botGrip = SKATER_GRIP_BOT,
): Pick<WristKey, "zL" | "zR" | "toeL" | "toeR" | "bz" | "abduct" | "lift" | "botGrip"> {
  return { zL: wristFootZ(-1, kneeL), zR: wristFootZ(1, kneeR), toeL: 0, toeR: 0, bz: 0, abduct: 0, lift: 0, botGrip };
}

/** Cancel the hip swing from pitch and chest yaw so the skates stay near the root. */
function followHinge(hip: number, open: number, pivot = 0): number {
  return -Math.sin(hip) * (SKATER_HIP_Y - pivot) * Math.cos(open);
}

/** Follow only. The release crouch still uses plantThigh so its skates stay put. */
function plantFollowThigh(leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, knee: number, hip: number, toeYaw: number, wantZ: number): number {
  const root = posedBody(leg.parent)?.parent ?? null;
  let bestT = 0;
  let best = Infinity;
  const score = (t: number) => {
    leg.rotation.set(t, 0, 0);
    if (shin) shin.rotation.set(knee, 0, 0);
    if (boot) boot.rotation.set(-(hip + t + knee), toeYaw, 0);
    if (!root || !boot) return Math.abs(t);
    leg.updateWorldMatrix(true, true);
    _corner.set(0, -0.1375, 0.02);
    boot.localToWorld(_corner);
    root.worldToLocal(_corner);
    return Math.abs(_corner.y - 0.02) * 5 + Math.abs(_corner.z - wantZ);
  };
  for (let i = 0; i <= 36; i++) {
    const t = -2.4 + (3.5 * i) / 36;
    const err = score(t);
    if (err < best) {
      best = err;
      bestT = t;
    }
  }
  const span = 3.5 / 36;
  const center = bestT;
  for (let i = 0; i <= 12; i++) {
    const t = center - span + (2 * span * i) / 12;
    const err = score(t);
    if (err < best) {
      best = err;
      bestT = t;
    }
  }
  return bestT;
}

/** Right skate leaves the ice. The blade's down axis swings back to -Z. */
function raiseTrailSkate(leg: THREE.Group, boot: THREE.Group, lift: number) {
  const plantedThigh = leg.rotation.x;
  const planted = boot.quaternion.clone();
  leg.rotation.x = plantedThigh + (FOLLOW_TRAIL_THIGH - plantedThigh) * lift;
  leg.rotation.z *= 1 - lift;
  boot.rotation.set(FOLLOW_TRAIL_BOOT_X, FOLLOW_TRAIL_BOOT_Y, 0);
  boot.quaternion.slerp(planted, 1 - lift);
}

function poseWristLeg(leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, x: number, knee: number, hip: number, drop: number, flat: boolean, wantZ: number | null = null, toeYaw = 0, lift = 0, pivot = 0) {
  leg.position.set(x, SKATER_HIP_Y, 0);
  const thigh = !flat
    ? strideThigh(knee)
    : wantZ == null
      ? plantThigh(hip, drop, knee, -2.4, 0.8, wristFootZ(x, knee), pivot)
      : plantFollowThigh(leg, shin, boot, knee, hip, toeYaw, wantZ);
  leg.rotation.set(thigh, 0, 0);
  if (shin) shin.rotation.set(knee, 0, 0);
  if (boot) boot.rotation.set(-(hip + thigh + knee), toeYaw, 0);
  if (x < 0 && lift > 0 && boot) raiseTrailSkate(leg, boot, lift);
}

/** Sole stays world-level after the chest yaw. Toe direction is kept, pitch is not. */
function levelSlapBoot(boot: THREE.Object3D) {
  const parent = boot.parent;
  if (!parent) return;
  boot.updateWorldMatrix(true, false);
  boot.getWorldQuaternion(_bootQ);
  _bootZ.set(0, 0, 1).applyQuaternion(_bootQ);
  _bootZ.y = 0;
  if (_bootZ.lengthSq() < 1e-8) _bootZ.set(0, 0, 1);
  else _bootZ.normalize();
  _bootY.set(0, 1, 0);
  _bootX.crossVectors(_bootY, _bootZ).normalize();
  _bootBasis.makeBasis(_bootX, _bootY, _bootZ);
  _bootQ.setFromRotationMatrix(_bootBasis);
  parent.getWorldQuaternion(_legInv);
  boot.quaternion.copy(_legInv.invert()).multiply(_bootQ);
}

function slapSoleY(boot: THREE.Object3D): number {
  _corner.set(0, -0.1375, 0.02);
  boot.localToWorld(_corner);
  return _corner.y;
}

/** Knees bent, soles level, thighs abducted from the normal hip sockets. */
function poseSlapLeg(leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, x: number, knee: number, hip: number, side: 1 | -1, wantZ: number, toeYaw = 0, abduct = SLAP_ABDUCT, wide = false, lift = 0) {
  leg.position.set(x, SKATER_HIP_Y, 0);
  const spread = side * abduct;
  const body = posedBody(leg.parent);
  let bestT = -0.6;
  let best = Infinity;
  const score = (t: number) => {
    leg.rotation.set(t, 0, spread);
    if (shin) shin.rotation.set(knee, 0, 0);
    if (!boot) return Math.abs(t);
    boot.rotation.set(-(hip + t + knee), toeYaw, 0);
    levelSlapBoot(boot);
    _corner.set(0, -0.1375, 0.02);
    boot.localToWorld(_corner);
    const y = _corner.y;
    const root = body?.parent;
    if (root) root.worldToLocal(_corner);
    const zErr = Math.abs(_corner.z - wantZ);
    if (wide) return Math.abs(y - 0.02) * 5 + zErr;
    return Math.abs(y - 0.02) * 24 + (zErr > 0.16 ? zErr * 3 : zErr * 0.35);
  };
  const lo = wide ? -2.35 : -1.8;
  const span0 = wide ? 3.4 : 2.4;
  const steps = wide ? 28 : 16;
  for (let i = 0; i <= steps; i++) {
    const t = lo + (span0 * i) / steps;
    const err = score(t);
    if (err < best) {
      best = err;
      bestT = t;
    }
  }
  const span = span0 / steps;
  const center = bestT;
  for (let i = 0; i <= 8; i++) {
    const t = center - span + (2 * span * i) / 8;
    const err = score(t);
    if (err < best) {
      best = err;
      bestT = t;
    }
  }
  leg.rotation.set(bestT, 0, spread);
  if (shin) shin.rotation.set(knee, 0, 0);
  if (boot) {
    boot.rotation.set(-(hip + bestT + knee), toeYaw, 0);
    levelSlapBoot(boot);
    if (side < 0 && lift > 0) raiseTrailSkate(leg, boot, lift);
  }
}

function watchPoint(head: THREE.Group, body: THREE.Group, x: number, y: number, z: number) {
  body.updateWorldMatrix(true, false);
  _ikTo.set(x, y, z);
  bodyToLocal(body, _ikTo);
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

/**
 * Forehand follow window. Most of `total` sits on the shared follow pose.
 * A short release eases in and a short blend leaves. Backhand keeps wristAfter.
 */
function shotFollowAfter(elapsed: number, total: number): { phase: "release" | "follow" | "blend"; u: number } {
  const blend = Math.min(0.1, total * 0.16);
  const rel = Math.min(0.08, Math.max(0.03, total * 0.1));
  const fol = Math.max(0.05, total - blend - rel);
  if (elapsed < rel) return { phase: "release", u: elapsed / Math.max(1e-4, rel) };
  if (elapsed < rel + fol) {
    const u = (elapsed - rel) / fol;
    const ramp = Math.min(1, 0.1 / fol);
    return { phase: "follow", u: Math.min(1, u / ramp) };
  }
  return { phase: "blend", u: Math.min(1, (elapsed - rel - fol) / Math.max(1e-4, blend)) };
}

/** Right hand, nearer the blade, on the right flank and a little behind the back. */
const SLAP_UP = 0.22;
/** Left hand, nearer the knob, above the left hip. */
const SLAP_TOP = 0.954;
/** Slight forward hip. Positive rotation.x pitches the chest toward +Z. */
const SLAP_HIP = (15 * Math.PI) / 180;
/** Chest and shoulders toward local −X, the player's right. */
const SLAP_YAW = -Math.PI / 4;
const SLAP_KNEE = (60 * Math.PI) / 180;
const SLAP_DROP = -0.2;
/** Thighs leave ±SKATER_HIP_X and angle out so the skates stay apart. */
const SLAP_ABDUCT = (22 * Math.PI) / 180;
/** Root-frame +Z. The player's left skate leads. */
const SLAP_Z_LEAD = 0.3;
const SLAP_Z_TRAIL = -0.02;
/** Left socket stays on the shoulder. The right socket sits lower so that arm can extend. */
const SLAP_SH_L = { x: 0.24, y: 1.46, z: 0.06 };
const SLAP_SH_R = { x: -0.2, y: 1.2, z: 0.02 };
/** Follow lifts the right socket back up so that hand can stay on the high shaft. */
const SLAP_SH_FOLLOW = { x: -0.26, y: 1.46, z: 0.06 };
/** Left elbow bends slightly forward, not into the chest. Right elbow goes out to −X and back to −Z. */
const _slapTopPole = new THREE.Vector3(0.25, -0.15, 0.2);
const _slapBotPole = new THREE.Vector3(-0.7, 0.15, -1);
/** Follow elbows stay outside the chest: left to +X, right to -X, both forward. */
const _followTopPole = new THREE.Vector3(0.9, 0.05, 0.5);
const _followBotPole = new THREE.Vector3(-0.95, 0.05, 0.55);
const _pokeElbowLocal = new THREE.Vector3(0, -0.28, 0.02);
const _pokeLeftGlove = new THREE.Vector3(0.02, -0.28, 0.06);
const _pokeRightGlove = new THREE.Vector3(-0.01, -0.28, 0.07);

function slapFill(bot: [number, number, number], dir: [number, number, number], roll: number, yaw: number): WristKey {
  return {
    bot,
    dir,
    roll,
    yaw,
    hip: SLAP_HIP,
    aim: 0,
    open: 0,
    weight: 0,
    kneeL: SLAP_KNEE,
    kneeR: SLAP_KNEE,
    drop: SLAP_DROP,
    flat: false,
    zL: SLAP_Z_TRAIL,
    zR: SLAP_Z_LEAD,
    toeL: 0,
    toeR: 0,
    bz: 0,
    abduct: SLAP_ABDUCT,
    lift: 0,
    botGrip: SKATER_GRIP_BOT,
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
/**
 * Loaded stick after the forward pitch and the −45° yaw.
 * Dir points at the knob. The blade stays the high end, a little under the previous cock.
 * The shaft crosses in front of the chest and finishes outside the right flank.
 */
const SLAP_WIND = slapFromHeel([-0.2854, 1.7173, 0.0264], [0.0841, -0.7665, 0.6368], 0, 0);
SLAP_WIND.open = SLAP_YAW;
const SLAP_HIT = slapFromHeel([-0.72, 0.2, 0.72], [0.35, 0.78, -0.5], (48 * Math.PI) / 180, (-36 * Math.PI) / 180);

function slapBotSlide(u: number): number {
  const s = u * u * (3 - 2 * u);
  return SKATER_GRIP_BOT + (SLAP_UP - SKATER_GRIP_BOT) * s;
}

function mixShoulder(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, u: number) {
  const t = u * u * (3 - 2 * u);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function slapStick(wind: number, follow: number): { key: WristKey; lock: boolean; bot: number; shR: { x: number; y: number; z: number }; wide: boolean } | null {
  const loaded = wind > 0.5 ? Math.min(1, (wind - 0.5) / 0.5) : 0;
  const raised = lerpWrist(SLAP_PLANT, SLAP_WIND, loaded);
  if (follow <= 0.02) {
    if (wind <= 0.5) return null;
    return { key: raised, lock: false, bot: slapBotSlide(loaded), shR: SLAP_SH_R, wide: false };
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
      shR: SLAP_SH_R,
      wide: false,
    };
  }
  if (elapsed < down + hit) {
    const u = (elapsed - down) / hit;
    const key = lerpWrist(SLAP_PLANT, SLAP_HIT, u);
    return { key, lock: true, bot: key.botGrip, shR: SLAP_SH_R, wide: false };
  }
  if (elapsed < down + hit + fol) {
    const u = (elapsed - down - hit) / fol;
    const key = lerpWrist(SLAP_HIT, WRIST_FOLLOW, u);
    return { key, lock: false, bot: key.botGrip, shR: mixShoulder(SLAP_SH_R, SLAP_SH_FOLLOW, u), wide: true };
  }
  const u = Math.min(1, (elapsed - down - hit - fol) / blend);
  const key = lerpWrist(WRIST_FOLLOW, WRIST_CARRY, u);
  return { key, lock: false, bot: key.botGrip, shR: SLAP_SH_FOLLOW, wide: true };
}

/** Upper arm along dirBody. up lifts the forearm a little above that line. */
function posePokeStraightArm(arm: THREE.Group, fore: THREE.Group, gloveLocal: THREE.Vector3, dirBody: THREE.Vector3, up = 0) {
  _ikD1.copy(_pokeElbowLocal).normalize();
  const elbowDir = _ikD1.clone();
  _ikTo.copy(gloveLocal).normalize();
  const gloveDir = _ikTo.clone();
  _ikD2.copy(dirBody).normalize();
  _gripInv.setFromUnitVectors(elbowDir, _ikD2);
  arm.quaternion.copy(_gripInv);
  _ikN.copy(_ikD2);
  _ikN.y += up;
  _ikN.normalize();
  _ikTo.copy(_ikN).applyQuaternion(_gripQ.copy(arm.quaternion).invert());
  _gripQ.setFromUnitVectors(gloveDir, _ikTo);
  fore.quaternion.copy(_gripQ);
}

/**
 * Right-shot poke. On this mesh +X (rArm) is the player's left hand: nearly
 * straight, bent a little up at the elbow, and the only grip near the knob.
 * −X (lArm) is the player's right hand: upper arm down and slightly to the
 * player's right, forearm toward the midline, off the shaft.
 * Places the stick heel. posePoke then writes the authored joint rotations.
 */
function posePokeReachArms(body: THREE.Group, lArm: THREE.Group, lFore: THREE.Group, rArm: THREE.Group, rFore: THREE.Group, stick: THREE.Group, layout: { len: number }) {
  lArm.position.set(-0.26, 1.46, 0.06);
  rArm.position.set(0.24, 1.46, 0.06);
  _ikN.set(0, -1, 0).applyQuaternion(_gripInv.copy(body.quaternion).invert());
  _ikN.x -= 0.18;
  _ikN.normalize();
  _ikD1.copy(_pokeElbowLocal).normalize();
  _gripQ.setFromUnitVectors(_ikD1, _ikN);
  lArm.quaternion.copy(_gripQ);
  // Still toward the midline, but less +X so the hand stays on the player's right.
  _ikD2.set(0.55, 0.08, 0.3).normalize();
  _ikTo.copy(_ikD2).applyQuaternion(_gripInv.copy(lArm.quaternion).invert());
  _ikN.copy(_pokeLeftGlove).normalize();
  _gripQ.setFromUnitVectors(_ikN, _ikTo);
  lFore.quaternion.copy(_gripQ);
  const fist = lFore.getObjectByName(SKATER_FIST_GLOVE);
  if (fist) fist.rotation.set(0.4, 0.18, 0.1);
  posePokeStraightArm(rArm, rFore, _pokeRightGlove, _ikD2.set(-0.08, -0.22, 1), 0.3);
  const parent = stick.parent;
  if (!parent) return;
  body.updateWorldMatrix(true, true);
  parent.updateWorldMatrix(true, false);
  _handTop.copy(_pokeRightGlove);
  rFore.localToWorld(_handTop);
  parent.worldToLocal(_handTop);
  // Shaft from the heel up to the knob. Y is just shallow enough that the lied sole clears the ice.
  // The 0.96 point stays on the glove; do not translate the heel after this.
  _ikD1.set(-0.02, 0.58, -0.815).normalize();
  const along = layout.len * Math.max(POKE_LEFT_GRIP, SKATER_GRIP_TOP);
  _ikD2.copy(_handTop).addScaledVector(_ikD1, -along);
  applyStickAim(stick, {
    heel: [_ikD2.x, _ikD2.y, _ikD2.z],
    shaft: [_ikD1.x, _ikD1.y, _ikD1.z],
    blade: [0, 0, 1],
  });
  orientTopHand(body, rFore, stick);
}

function hangSkaterArm(arm: THREE.Group, fore: THREE.Group | null, side: -1 | 1, forePitch = 0.25) {
  arm.position.set(side < 0 ? -0.26 : 0.24, 1.46, 0.06);
  arm.rotation.set(0.22, 0, side * 0.16);
  if (fore) fore.rotation.set(forePitch, 0, 0);
}

function pokeBodyDrop(pitch: number): number {
  return -0.09 - pitch * 0.22;
}

/** Sole bottom of the skate blade in root space. Boot pitch cancels hip + thigh + knee. */
function skateSoleYZ(pitch: number, drop: number, thigh: number, knee: number, pivot = 0): { y: number; z: number } {
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
  y += SKATER_HIP_Y - pivot;
  [y, z] = rx(y, z, pitch);
  y += drop + pivot;
  return { y, z };
}

function plantThigh(pitch: number, drop: number, knee: number, lo: number, hi: number, wantZ: number, pivot = 0): number {
  let bestT = (lo + hi) * 0.5;
  let best = Infinity;
  const score = (t: number) => {
    const s = skateSoleYZ(pitch, drop, t, knee, pivot);
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

/** Both skates down, chest over the stick, head toward the dot. No stride. */
function posePuckDrop(
  body: THREE.Group,
  head: THREE.Group | null,
  lLeg: THREE.Group,
  rLeg: THREE.Group,
  lShin: THREE.Group | null,
  rShin: THREE.Group | null,
  lBoot: THREE.Group | null,
  rBoot: THREE.Group | null,
  lArm: THREE.Group,
  rArm: THREE.Group,
  lFore: THREE.Group,
  rFore: THREE.Group,
  stick: THREE.Group,
  blade: THREE.Group,
  layout: { len: number },
  keepStick = false,
): void {
  const pitch = PUCK_DROP_PITCH;
  const drop = PUCK_DROP_DROP;
  body.position.set(0, torsoPlacedY(body, drop), 0);
  body.rotation.set(pitch, 0, 0);
  const plant = (leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, x: number, knee: number, wantZ: number) => {
    const side = x < 0 ? -1 : 1;
    const thigh = plantThigh(pitch, drop, knee, -1.7, 0.5, wantZ, torsoPivotY(body));
    leg.position.set(x, SKATER_HIP_Y, 0);
    leg.rotation.set(thigh, 0, side * PUCK_DROP_ABDUCT);
    if (shin) shin.rotation.set(knee, 0, 0);
    if (boot) boot.rotation.set(-(pitch + thigh + knee), 0, -side * PUCK_DROP_ANKLE);
  };
  plant(lLeg, lShin, lBoot, -PUCK_DROP_STANCE, PUCK_DROP_KNEE, PUCK_DROP_FOOT_Z);
  plant(rLeg, rShin, rBoot, PUCK_DROP_STANCE, PUCK_DROP_KNEE_F, PUCK_DROP_FOOT_Z_F);
  if (lBoot && rBoot) {
    body.updateWorldMatrix(true, true);
    let low = Infinity;
    for (const boot of [lBoot, rBoot]) {
      _corner.set(0, -0.1375, 0.02);
      boot.localToWorld(_corner);
      if (_corner.y < low) low = _corner.y;
    }
    if (low < Infinity) body.position.y -= low - 0.02;
  }
  if (!keepStick) {
    applyStickAim(stick, puckDropStickAim());
    poseWristBlade(blade, stick, 0, 0);
    seatBlade(stick, blade, false);
  }
  stick.updateWorldMatrix(true, true);
  body.updateWorldMatrix(true, false);
  _handTop.set(0, layout.len * PUCK_DROP_GRIP_TOP, 0);
  stick.localToWorld(_handTop);
  bodyToLocal(body, _handTop);
  _handBot.set(0, layout.len * PUCK_DROP_GRIP_BOT, 0);
  stick.localToWorld(_handBot);
  bodyToLocal(body, _handBot);
  gripSkaterHand(body, rArm, rFore, 0.24, 1.46, 0.06, _handTop.x, _handTop.y, _handTop.z, 1, true, stick);
  gripSkaterHand(body, lArm, lFore, -0.26, 1.46, 0.06, _handBot.x, _handBot.y, _handBot.z, -1, true);
  if (head) {
    head.position.set(0, 1.54, 0.02);
    watchPoint(head, body, world.faceX, 0.1, world.faceZ);
  }
}

/** Dot center in the skater frame. Local +Z is toward the opponent. */
function faceoffDotLocal(root: THREE.Object3D, out: THREE.Vector3): void {
  root.updateWorldMatrix(true, false);
  out.set(world.faceX, 0, world.faceZ);
  root.worldToLocal(out);
}

/** +1 keeps the player's left skate forward. Center ice has no boards side. */
function faceoffInside(root: THREE.Object3D): 1 | -1 {
  if (Math.abs(world.faceZ) < 0.2) return 1;
  faceoffDotLocal(root, _ikTo);
  _corner.set(world.faceX, 0, 0);
  root.worldToLocal(_corner);
  return _corner.x - _ikTo.x >= 0 ? 1 : -1;
}

/** 0 while the blades wait in the gaps. 1 once the puck is down and the draw has pulled back. */
function faceoffDrawSweep(): number {
  if (world.faceoffPhase !== "live") return 0;
  const u = Math.min(1, world.faceoffT / DRAW_SWEEP_T);
  return u * u * (3 - 2 * u);
}

function pointSegDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  _ikD2.subVectors(b, a);
  const len2 = _ikD2.lengthSq() || 1e-8;
  const t = Math.max(0, Math.min(1, _liftPt.subVectors(p, a).dot(_ikD2) / len2));
  _liftPt.copy(a).addScaledVector(_ikD2, t);
  return p.distanceTo(_liftPt);
}

const DRAW_CLEAR_LOCAL: ReadonlyArray<readonly [number, number, number]> = [
  ...([0.05, 0.2, 0.38] as const).map((z) => {
    const p = skaterBladeLiePoint(0, 0, z);
    return [p.x, p.y, p.z] as const;
  }),
  [0, 0.3, 0],
  [0, 0.6, 0],
  [0, 0.95, 0],
  [0, 1.3, 0],
  [0, 1.55, 0],
];

/** If the stick meets a leg or the torso, slide it forward. seatBlade keeps the sole on the ice. */
function clearStickOfSkater(
  stick: THREE.Group,
  blade: THREE.Group,
  body: THREE.Group,
  lLeg: THREE.Group,
  rLeg: THREE.Group,
  lShin: THREE.Group | null,
  rShin: THREE.Group | null,
  lBoot: THREE.Group | null,
  rBoot: THREE.Group | null,
): void {
  const legs: Array<[THREE.Group, THREE.Group | null, THREE.Group | null]> = [
    [lLeg, lShin, lBoot],
    [rLeg, rShin, rBoot],
  ];
  for (let pass = 0; pass < 8; pass++) {
    stick.updateWorldMatrix(true, true);
    body.updateWorldMatrix(true, true);
    let shift = 0;
    for (const local of DRAW_CLEAR_LOCAL) {
      _corner.set(local[0], local[1], local[2]);
      stick.localToWorld(_corner);
      for (const [leg, shin, boot] of legs) {
        leg.getWorldPosition(_ikTo);
        (shin ?? leg).getWorldPosition(_ikD1);
        if (pointSegDist(_corner, _ikTo, _ikD1) < 0.12) shift += 0.03;
        if (shin && boot) {
          shin.getWorldPosition(_ikTo);
          boot.getWorldPosition(_ikD1);
          if (pointSegDist(_corner, _ikTo, _ikD1) < 0.1) shift += 0.03;
        }
      }
      _ikTo.copy(_corner);
      bodyToLocal(body, _ikTo);
      if (Math.abs(_ikTo.x) < 0.24 && _ikTo.y > 0.88 && _ikTo.y < 1.56 && _ikTo.z > -0.17 && _ikTo.z < 0.18) {
        shift += 0.03;
      }
    }
    if (shift < 0.001) break;
    stick.position.z += Math.min(0.04, shift);
  }
  seatBlade(stick, blade, true);
}

/** Low faceoff crouch. Both hands on a flat blade just ahead of the skates, then the draw pulls it back. */
function poseFaceoffDraw(
  body: THREE.Group,
  head: THREE.Group | null,
  lLeg: THREE.Group,
  rLeg: THREE.Group,
  lShin: THREE.Group | null,
  rShin: THREE.Group | null,
  lBoot: THREE.Group | null,
  rBoot: THREE.Group | null,
  lArm: THREE.Group,
  rArm: THREE.Group,
  lFore: THREE.Group,
  rFore: THREE.Group,
  stick: THREE.Group,
  blade: THREE.Group,
  layout: { len: number },
  root: THREE.Object3D,
  sweep: number,
): void {
  const inside = faceoffInside(root);
  const pitch = DRAW_PITCH;
  const drop = DRAW_DROP;
  body.position.set(0, torsoPlacedY(body, drop), -DRAW_HEAD_OVER_ROOT);
  body.rotation.set(pitch, 0, 0);
  const plant = (leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, side: 1 | -1) => {
    const front = side === inside;
    const knee = front ? DRAW_KNEE_F : DRAW_KNEE_B;
    const toe = front ? DRAW_TOE_F : DRAW_TOE_B;
    const wantZ = DRAW_HIP_BACK - (front ? DRAW_FOOT_F : DRAW_FOOT_B);
    const thigh = plantThigh(pitch, drop, knee, -2.8, -0.4, wantZ, torsoPivotY(body));
    leg.position.set(side * DRAW_STANCE, SKATER_HIP_Y, 0);
    leg.rotation.set(thigh, 0, side * DRAW_ABDUCT);
    if (shin) shin.rotation.set(knee, 0, 0);
    if (boot) boot.rotation.set(-(pitch + thigh + knee), side * toe, -side * DRAW_ANKLE);
  };
  plant(lLeg, lShin, lBoot, -1);
  plant(rLeg, rShin, rBoot, 1);
  if (lBoot && rBoot) {
    body.updateWorldMatrix(true, true);
    let low = Infinity;
    for (const boot of [lBoot, rBoot]) {
      _corner.set(0, -0.1375, 0.02);
      boot.localToWorld(_corner);
      if (_corner.y < low) low = _corner.y;
    }
    if (low < Infinity) body.position.y -= low - 0.02;
  }
  const u = sweep < 0 ? 0 : sweep > 1 ? 1 : sweep;
  const parkZ = -DRAW_HEAD_OVER_ROOT + DRAW_HIP_BACK + DRAW_HEEL_ADVANCE;
  const sweepZ = -DRAW_HEAD_OVER_ROOT + DRAW_SWEEP_Z;
  const heelZ = parkZ + (Math.min(parkZ, sweepZ) - parkZ) * u;
  applyStickAim(stick, {
    heel: [DRAW_HEEL_X, STICK_ICE_Y, heelZ],
    shaft: DRAW_SHAFT,
    blade: DRAW_BLADE,
  });
  poseWristBlade(blade, stick, 0, 0);
  seatBlade(stick, blade, true);
  clearStickOfSkater(stick, blade, body, lLeg, rLeg, lShin, rShin, lBoot, rBoot);
  stick.updateWorldMatrix(true, true);
  body.updateWorldMatrix(true, false);
  _handTop.set(0, layout.len * DRAW_GRIP_TOP, 0);
  stick.localToWorld(_handTop);
  bodyToLocal(body, _handTop);
  _handBot.set(0, layout.len * DRAW_GRIP_BOT, 0);
  stick.localToWorld(_handBot);
  bodyToLocal(body, _handBot);
  gripSkaterHand(body, rArm, rFore, 0.24, 1.46, 0.06, _handTop.x, _handTop.y, _handTop.z, 1, true, stick);
  gripSkaterHand(body, lArm, lFore, -0.26, 1.46, 0.06, _handBot.x, _handBot.y, _handBot.z, -1, true);
  if (head) {
    head.position.set(0, 1.54, 0.02);
    watchPoint(head, body, world.faceX, 0.04, world.faceZ);
  }
}

function skaterReadyWeight(speed: number): number {
  if (speed <= READY_COAST) return 1;
  if (speed >= READY_SKATE) return 0;
  return 1 - smooth01((speed - READY_COAST) / (READY_SKATE - READY_COAST));
}

/** Both blades down, chest up, stick across the hips. No stride. Yaw stays on the root. */
function poseSkaterReady(
  body: THREE.Group,
  head: THREE.Group | null,
  lLeg: THREE.Group,
  rLeg: THREE.Group,
  lShin: THREE.Group | null,
  rShin: THREE.Group | null,
  lBoot: THREE.Group | null,
  rBoot: THREE.Group | null,
  lArm: THREE.Group,
  rArm: THREE.Group,
  lFore: THREE.Group,
  rFore: THREE.Group,
  stick: THREE.Group,
  blade: THREE.Group,
  layout: { len: number },
  weight: number,
): void {
  const w = weight < 0 ? 0 : weight > 1 ? 1 : weight;
  if (w <= 0) return;
  const mix = (from: number, to: number) => from + (to - from) * w;
  const pitch = READY_HIP;
  const knee = READY_KNEE;
  const drop = READY_DROP;
  const thigh = plantThigh(pitch, drop, knee, -1.2, 0.45, READY_FOOT_Z, torsoPivotY(body));
  const bootX = -(pitch + thigh + knee);
  body.position.x = mix(body.position.x, 0);
  body.position.y = mix(body.position.y, torsoPlacedY(body, drop));
  body.position.z = mix(body.position.z, 0);
  body.rotation.x = mix(body.rotation.x, pitch);
  body.rotation.z = mix(body.rotation.z, 0);
  const plant = (leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, x: number) => {
    leg.position.x = mix(leg.position.x, x);
    leg.position.y = SKATER_HIP_Y;
    leg.position.z = mix(leg.position.z, 0);
    leg.rotation.x = mix(leg.rotation.x, thigh);
    leg.rotation.y = mix(leg.rotation.y, 0);
    leg.rotation.z = mix(leg.rotation.z, 0);
    if (shin) {
      shin.rotation.x = mix(shin.rotation.x, knee);
      shin.rotation.y = mix(shin.rotation.y, 0);
      shin.rotation.z = mix(shin.rotation.z, 0);
    }
    if (boot) {
      boot.rotation.x = mix(boot.rotation.x, bootX);
      boot.rotation.y = mix(boot.rotation.y, 0);
      boot.rotation.z = mix(boot.rotation.z, 0);
    }
  };
  plant(lLeg, lShin, lBoot, -READY_STANCE);
  plant(rLeg, rShin, rBoot, READY_STANCE);
  _stickQ.copy(stick.quaternion);
  _blendP.copy(stick.position);
  _parentQ.copy(blade.quaternion);
  applyStickAim(stick, skaterReadyStickAim());
  blade.rotation.set(0, 0, 0);
  if (w < 1) {
    _blendQ.copy(stick.quaternion);
    stick.quaternion.copy(_stickQ).slerp(_blendQ, w);
    _corner.copy(stick.position);
    stick.position.copy(_blendP).lerp(_corner, w);
    _blendQ.copy(blade.quaternion);
    blade.quaternion.copy(_parentQ).slerp(_blendQ, w);
  }
  stick.updateWorldMatrix(true, true);
  body.updateWorldMatrix(true, false);
  _handTop.set(0, layout.len * SKATER_GRIP_TOP, 0);
  stick.localToWorld(_handTop);
  bodyToLocal(body, _handTop);
  _handBot.set(0, layout.len * READY_GRIP_BOT, 0);
  stick.localToWorld(_handBot);
  bodyToLocal(body, _handBot);
  gripSkaterHand(body, rArm, rFore, 0.24, 1.46, 0.06, _handTop.x, _handTop.y, _handTop.z, 1, true, stick);
  gripSkaterHand(body, lArm, lFore, -0.26, 1.46, 0.06, _handBot.x, _handBot.y, _handBot.z, -1, true);
  if (head) {
    head.position.set(0, 1.54, 0.02);
    head.rotation.order = "XYZ";
    head.rotation.x = mix(head.rotation.x, -pitch);
    head.rotation.y = mix(head.rotation.y, 0);
    head.rotation.z = mix(head.rotation.z, 0);
  }
}

/** Low carry. Puck straight ahead, both skates down, shaft from the left hip. Yaw stays on the root. */
function poseNeutralCarry(
  body: THREE.Group,
  head: THREE.Group | null,
  lLeg: THREE.Group,
  rLeg: THREE.Group,
  lShin: THREE.Group | null,
  rShin: THREE.Group | null,
  lBoot: THREE.Group | null,
  rBoot: THREE.Group | null,
  lArm: THREE.Group,
  rArm: THREE.Group,
  lFore: THREE.Group,
  rFore: THREE.Group,
  stick: THREE.Group,
  blade: THREE.Group,
  layout: { len: number },
  weight: number,
  shX: number,
  armZ: number,
): void {
  const w = weight < 0 ? 0 : weight > 1 ? 1 : weight;
  if (w <= 0) return;
  const mix = (from: number, to: number) => from + (to - from) * w;
  body.position.x = mix(body.position.x, 0);
  body.position.y = mix(body.position.y, torsoPlacedY(body, NEUTRAL_DROP));
  body.position.z = mix(body.position.z, 0);
  body.rotation.x = mix(body.rotation.x, NEUTRAL_PITCH);
  body.rotation.y = mix(body.rotation.y, 0);
  body.rotation.z = mix(body.rotation.z, 0);
  const plant = (leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, side: 1 | -1, thigh: number, knee: number, toe: number) => {
    leg.position.x = mix(leg.position.x, side * NEUTRAL_STANCE);
    leg.position.y = SKATER_HIP_Y;
    leg.position.z = mix(leg.position.z, 0);
    leg.rotation.x = mix(leg.rotation.x, thigh);
    leg.rotation.y = mix(leg.rotation.y, 0);
    leg.rotation.z = mix(leg.rotation.z, side * NEUTRAL_ABDUCT);
    if (shin) {
      shin.rotation.x = mix(shin.rotation.x, knee);
      shin.rotation.y = mix(shin.rotation.y, 0);
      shin.rotation.z = mix(shin.rotation.z, 0);
    }
    if (boot) {
      boot.rotation.x = mix(boot.rotation.x, -(NEUTRAL_PITCH + thigh + knee));
      boot.rotation.y = mix(boot.rotation.y, side * toe);
      boot.rotation.z = mix(boot.rotation.z, -side * NEUTRAL_ANKLE);
    }
  };
  plant(rLeg, rShin, rBoot, 1, NEUTRAL_THIGH_F, NEUTRAL_KNEE_F, NEUTRAL_TOE_F);
  plant(lLeg, lShin, lBoot, -1, NEUTRAL_THIGH_B, NEUTRAL_KNEE_B, NEUTRAL_TOE_B);
  if (w >= 1 && lBoot && rBoot) {
    body.updateWorldMatrix(true, true);
    let low = Infinity;
    for (const boot of [lBoot, rBoot]) {
      _corner.set(0, -0.1375, 0.02);
      boot.localToWorld(_corner);
      if (_corner.y < low) low = _corner.y;
    }
    if (low < Infinity) body.position.y -= low - 0.02;
  }
  _gripQ.copy(stick.quaternion);
  _blendP.copy(stick.position);
  _bootQ.copy(blade.quaternion);
  applyStickAim(stick, neutralCarryStickAim());
  poseWristBlade(blade, stick, 0, 0);
  seatBlade(stick, blade, true);
  if (w < 1) {
    _blendQ.copy(stick.quaternion);
    stick.quaternion.copy(_gripQ).slerp(_blendQ, w);
    _corner.copy(stick.position);
    stick.position.copy(_blendP).lerp(_corner, w);
    _blendQ.copy(blade.quaternion);
    blade.quaternion.copy(_bootQ).slerp(_blendQ, w);
  }
  stick.updateWorldMatrix(true, true);
  body.updateWorldMatrix(true, false);
  _handTop.set(0, layout.len * SKATER_GRIP_TOP, 0);
  stick.localToWorld(_handTop);
  bodyToLocal(body, _handTop);
  _handBot.set(0, layout.len * SKATER_GRIP_BOT, 0);
  stick.localToWorld(_handBot);
  bodyToLocal(body, _handBot);
  const fade = 1 - w;
  gripSkaterHand(body, rArm, rFore, 0.24 + shX * fade, 1.46, 0.06 + armZ * fade, _handTop.x, _handTop.y, _handTop.z, 1, true, stick);
  gripSkaterHand(body, lArm, lFore, -0.26 + shX * fade, 1.46, 0.06 - armZ * fade, _handBot.x, _handBot.y, _handBot.z, -1, true);
  if (head) {
    _blendQ.copy(head.quaternion);
    head.position.set(0, 1.54, 0.02);
    head.rotation.order = "XYZ";
    head.rotation.set(-NEUTRAL_PITCH, 0, 0);
    if (w < 1) {
      _stickQ.copy(head.quaternion);
      head.quaternion.copy(_blendQ).slerp(_stickQ, w);
    }
  }
}

/**
 * Thigh that plants this skate on the near ice crossing.
 * plantThigh ignores abduct and toe yaw, so the sole is sampled on the rig chain.
 * The far crossing (straight leg, z past 0.8) loses to wantZ.
 */
function burstPlantThigh(knee: number, side: 1 | -1, toe: number, wantZ: number, pivot = 0): number {
  _burstBody.position.set(0, BURST_DROP + pivot, 0);
  _burstFrame.position.set(0, -pivot, 0);
  _burstBody.rotation.set(BURST_PITCH, 0, 0);
  let bestT = -0.6;
  let best = Infinity;
  const score = (thigh: number) => {
    _burstLeg.position.set(side * BURST_STANCE, SKATER_HIP_Y, 0);
    _burstLeg.rotation.set(thigh, 0, 0);
    _burstShin.rotation.set(knee, 0, 0);
    _burstBoot.rotation.set(-(BURST_PITCH + thigh + knee), side * toe, 0);
    _burstRoot.updateWorldMatrix(true, true);
    let low = Infinity;
    let cz = 0;
    for (const [x, y, z] of BURST_SOLE) {
      _burstSole.set(x, y, z);
      _burstBoot.localToWorld(_burstSole);
      _burstRoot.worldToLocal(_burstSole);
      if (z === 0.02) cz = _burstSole.z;
      if (_burstSole.y < low) low = _burstSole.y;
    }
    return Math.abs(low - 0.02) * 4 + Math.abs(cz - wantZ);
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
  step(-2.2, 0.5, 36);
  step(bestT - 0.08, bestT + 0.08, 8);
  step(bestT - 0.02, bestT + 0.02, 8);
  return bestT;
}

/**
 * Driving carry. One stride frame, cycled by stride.
 * sin(stride) > 0 sets the right skate (local −X) in front. The next half swaps.
 * Grips stay SKATER_GRIP_TOP and SKATER_GRIP_BOT, a forearm apart near the knob,
 * so the lower hand is a forearm down the shaft from the left chest.
 * The blade continues to the stick side, ahead of the front skate.
 */
function poseBurstCarry(
  body: THREE.Group,
  head: THREE.Group | null,
  lLeg: THREE.Group,
  rLeg: THREE.Group,
  lShin: THREE.Group | null,
  rShin: THREE.Group | null,
  lBoot: THREE.Group | null,
  rBoot: THREE.Group | null,
  lArm: THREE.Group,
  rArm: THREE.Group,
  lFore: THREE.Group,
  rFore: THREE.Group,
  stick: THREE.Group,
  blade: THREE.Group,
  layout: { len: number },
  weight: number,
  stride: number,
): void {
  const w = weight < 0 ? 0 : weight > 1 ? 1 : weight;
  if (w <= 0) return;
  const mix = (from: number, to: number) => from + (to - from) * w;
  const sin = Math.sin(stride);
  body.position.x = mix(body.position.x, 0);
  body.position.y = mix(body.position.y, torsoPlacedY(body, BURST_DROP));
  body.position.z = mix(body.position.z, 0);
  body.rotation.x = mix(body.rotation.x, BURST_PITCH);
  body.rotation.y = mix(body.rotation.y, 0);
  body.rotation.z = mix(body.rotation.z, 0);
  const plant = (leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, side: 1 | -1) => {
    const drive = side < 0 ? sin : -sin;
    const u = drive * 0.5 + 0.5;
    const knee = BURST_KNEE_B + (BURST_KNEE_F - BURST_KNEE_B) * u;
    const toe = BURST_TOE_B + (BURST_TOE_F - BURST_TOE_B) * u;
    const wantZ = BURST_Z_B + (BURST_Z_F - BURST_Z_B) * u;
    const thigh = burstPlantThigh(knee, side, toe, wantZ, torsoPivotY(body));
    leg.position.x = mix(leg.position.x, side * BURST_STANCE);
    leg.position.y = SKATER_HIP_Y;
    leg.position.z = mix(leg.position.z, 0);
    leg.rotation.x = mix(leg.rotation.x, thigh);
    leg.rotation.y = mix(leg.rotation.y, 0);
    leg.rotation.z = mix(leg.rotation.z, 0);
    if (shin) {
      shin.rotation.x = mix(shin.rotation.x, knee);
      shin.rotation.y = mix(shin.rotation.y, 0);
      shin.rotation.z = mix(shin.rotation.z, 0);
    }
    if (boot) {
      boot.rotation.x = mix(boot.rotation.x, -(BURST_PITCH + thigh + knee));
      boot.rotation.y = mix(boot.rotation.y, side * toe);
      boot.rotation.z = mix(boot.rotation.z, 0);
    }
  };
  plant(lLeg, lShin, lBoot, -1);
  plant(rLeg, rShin, rBoot, 1);
  if (w >= 1 && lBoot && rBoot) {
    body.updateWorldMatrix(true, true);
    let low = Infinity;
    for (const boot of [lBoot, rBoot]) {
      for (const [x, y, z] of BURST_SOLE) {
        _corner.set(x, y, z);
        boot.localToWorld(_corner);
        if (_corner.y < low) low = _corner.y;
      }
    }
    if (low < Infinity) body.position.y -= low - 0.02;
  }
  _gripQ.copy(stick.quaternion);
  _blendP.copy(stick.position);
  _bootQ.copy(blade.quaternion);
  applyStickAim(stick, burstCarryStickAim());
  poseWristBlade(blade, stick, 0, 0);
  seatBlade(stick, blade, true);
  if (w < 1) {
    _blendQ.copy(stick.quaternion);
    stick.quaternion.copy(_gripQ).slerp(_blendQ, w);
    _corner.copy(stick.position);
    stick.position.copy(_blendP).lerp(_corner, w);
    _blendQ.copy(blade.quaternion);
    blade.quaternion.copy(_bootQ).slerp(_blendQ, w);
  }
  stick.updateWorldMatrix(true, true);
  body.updateWorldMatrix(true, false);
  _handTop.set(0, layout.len * SKATER_GRIP_TOP, 0);
  stick.localToWorld(_handTop);
  bodyToLocal(body, _handTop);
  _handBot.set(0, layout.len * SKATER_GRIP_BOT, 0);
  stick.localToWorld(_handBot);
  bodyToLocal(body, _handBot);
  gripSkaterHand(body, rArm, rFore, 0.24, 1.46, 0.06, _handTop.x, _handTop.y, _handTop.z, 1, true, stick);
  gripSkaterHand(body, lArm, lFore, -0.26, 1.46, 0.06, _handBot.x, _handBot.y, _handBot.z, -1, true);
  if (head) {
    _blendQ.copy(head.quaternion);
    head.position.set(0, 1.54, 0.02);
    head.rotation.order = "XYZ";
    head.rotation.set(-BURST_PITCH, 0, 0);
    if (w < 1) {
      _stickQ.copy(head.quaternion);
      head.quaternion.copy(_blendQ).slerp(_stickQ, w);
    }
  }
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
function checkHeelY(pitch: number, drop: number, thigh: number, knee: number, dorsi: number, yaw = 0, hipX = 0, pivot = 0): number {
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
  y += SKATER_HIP_Y - pivot;
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  return sp * sy * hipX + cp * y - sp * cy * z + drop + pivot;
}

function plantCheckThigh(pitch: number, drop: number, knee: number, dorsi: number, yaw = 0, hipX = 0, pivot = 0): number {
  let bestT = 0;
  let best = Infinity;
  const step = (a: number, b: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      const err = Math.abs(checkHeelY(pitch, drop, t, knee, dorsi, yaw, hipX, pivot) - 0.02);
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

function checkPlant(pitch: number, knee: number, dorsi: number, yaw = 0, hipX = 0, pivot = 0): { drop: number; thigh: number } {
  let thigh = plantCheckThigh(pitch, 0, knee, dorsi, yaw, hipX, pivot);
  let drop = 0.02 - checkHeelY(pitch, 0, thigh, knee, dorsi, yaw, hipX, pivot);
  thigh = plantCheckThigh(pitch, drop, knee, dorsi, yaw, hipX, pivot);
  drop = 0.02 - checkHeelY(pitch, 0, thigh, knee, dorsi, yaw, hipX, pivot);
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

function checkTargets(side: 1 | -1, elapsed: number, hit: number, pivot = 0): CheckTargets {
  const end = smooth01(Math.min(1, hit / 0.12));
  const load = checkPlant(CHECK_PITCH, CHECK_KNEE, CHECK_DORSI, 0, 0, pivot);
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
  const front = checkPlant(CHECK_PITCH, kneeF, CHECK_DORSI, yaw, side * SKATER_HIP_X, pivot);
  const kneeB = mix(CHECK_KNEE, TRAIL_KNEE);
  const thighB = mix(load.thigh, TRAIL_THIGH);
  return {
    pitch: CHECK_PITCH,
    drop: front.drop,
    // Origin is the skates. Shift back so this pitch hinges at the hips, not the blades.
    bz: CHECK_HIP_Z - Math.sin(CHECK_PITCH) * (SKATER_HIP_Y - pivot),
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
  take(world.ref3.x, world.ref3.z);
  take(world.ref4.x, world.ref4.z);
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

/** Leave the baked 135° lie on the shaft. The poke aim already points the toe. */
function posePokeBlade(blade: THREE.Group, _stick: THREE.Group, _toeX: number, _toeZ: number) {
  blade.rotation.set(0, 0, 0);
}

/** Active poke. Local XYZ eulers from the pose editor. Stick position stays on the reach aim. */
function posePoke(
  body: THREE.Group,
  head: THREE.Group | null,
  lArm: THREE.Group,
  lFore: THREE.Group,
  lHand: THREE.Object3D | null,
  rArm: THREE.Group,
  rFore: THREE.Group,
  rHand: THREE.Object3D | null,
  lLeg: THREE.Group,
  lShin: THREE.Group | null,
  lBoot: THREE.Group | null,
  rLeg: THREE.Group,
  rShin: THREE.Group | null,
  rBoot: THREE.Group | null,
  stick: THREE.Group,
  shaftHold: THREE.Group | null,
  bladeGrp: THREE.Group | null,
) {
  body.rotation.set(0.489, 0, 0);
  if (head) head.rotation.set(0, 0, 0);
  lArm.rotation.set(-0.408, 0.002, -0.461);
  lFore.rotation.set(-0.7, -0.256, 1.225);
  if (lHand) lHand.rotation.set(0.4, 0.18, 0.1);
  rArm.rotation.set(-1.538, 0.171, 0.128);
  rFore.rotation.set(-0.137, -0.217, -0.497);
  if (rHand) rHand.rotation.set(-0.031, -0.057, 1.652);
  lLeg.rotation.set(-1.715, 0, 0);
  if (lShin) lShin.rotation.set(1.536, 0, 0);
  if (lBoot) lBoot.rotation.set(-0.31, 0, 0);
  rLeg.rotation.set(0.194, 0, 0);
  if (rShin) rShin.rotation.set(0.489, 0, 0);
  if (rBoot) rBoot.rotation.set(-1.171, 0, 0);
  stick.rotation.set(-0.99, -0.032, -0.189);
  if (shaftHold) shaftHold.rotation.set(0, 0, 0);
  if (bladeGrp) bladeGrp.rotation.set(0, 0, 0);
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

const SKATER_TOP_GLOVE = "skaterTopGlove";
const SKATER_FIST_GLOVE = "skaterFistGlove";
const GRIP_PALM_DOWN = 0.12;
const _topGloveRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, -0.1, -0.08, "XYZ"));
const _gripShaft = new THREE.Vector3();
const _gripPalm = new THREE.Vector3();
const _gripKnuckle = new THREE.Vector3();
const _gripHint = new THREE.Vector3();
const _gripHead = new THREE.Vector3();
const _gripHold = new THREE.Vector3();
const _gripQ = new THREE.Quaternion();
const _gripBodyQ = new THREE.Quaternion();
const _gripInv = new THREE.Quaternion();

function resetTopGlove(fore: THREE.Object3D) {
  const glove = fore.getObjectByName(SKATER_TOP_GLOVE);
  if (glove) glove.quaternion.copy(_topGloveRest);
}

function resetFistGlove(fore: THREE.Object3D) {
  const glove = fore.getObjectByName(SKATER_FIST_GLOVE);
  if (!glove) return;
  glove.rotation.set(0.4, 0.18, 0.1);
}

/** Cheer only. Drop the fixed downward wrist pitch so the fist follows the forearm. */
function alignCheerFist(fore: THREE.Object3D) {
  const glove = fore.getObjectByName(SKATER_FIST_GLOVE);
  if (!glove) return;
  glove.rotation.set(CHEER_FIST_PITCH, 0, 0);
}

function releaseTopGlove(fore: THREE.Object3D, w: number) {
  const glove = fore.getObjectByName(SKATER_TOP_GLOVE);
  if (!glove || w <= 0) return;
  glove.quaternion.slerp(_topGloveRest, w > 1 ? 1 : w);
}

/** Shaft through the fist, palm toward the chest. Carry: palm · chest ≈ 0.9 and palm · up ≈ 0. */
function orientTopHand(body: THREE.Object3D, fore: THREE.Object3D, stick: THREE.Object3D) {
  const glove = fore.getObjectByName(SKATER_TOP_GLOVE);
  if (!glove) return;
  stick.updateWorldMatrix(true, false);
  body.updateWorldMatrix(true, false);
  fore.updateWorldMatrix(true, false);
  _gripShaft.set(0, 1, 0).applyQuaternion(stick.getWorldQuaternion(_gripQ));
  if (_gripShaft.lengthSq() < 1e-8) return;
  _gripShaft.normalize();
  _gripPalm.set(_gripShaft.z, 0, -_gripShaft.x);
  body.getWorldQuaternion(_gripBodyQ);
  if (_gripPalm.lengthSq() < 1e-4) {
    _gripPalm.set(-0.42, 0, -1).applyQuaternion(_gripBodyQ);
    _gripPalm.y = 0;
  }
  if (_gripPalm.lengthSq() < 1e-8) return;
  _gripPalm.normalize();
  _gripHint.set(-0.42, -0.05, -1).applyQuaternion(_gripBodyQ);
  if (_gripPalm.dot(_gripHint) < 0) _gripPalm.negate();
  let tilt = GRIP_PALM_DOWN;
  glove.getWorldPosition(_gripHead);
  _gripHold.set(0, 1.54, 0.02);
  bodyToWorld(body, _gripHold);
  _gripHold.sub(_gripHead);
  if (_gripHold.lengthSq() > 1e-6) {
    _gripHold.normalize();
    const face0 = _gripShaft.dot(_gripHold);
    const face1 = Math.cos(tilt) * face0 + Math.sin(tilt) * _gripPalm.dot(_gripHold);
    if (face0 > 0.5 && face1 > face0) tilt = 0;
  }
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  _gripHold.copy(_gripShaft);
  _gripShaft.multiplyScalar(c).addScaledVector(_gripPalm, s);
  _gripPalm.multiplyScalar(c).addScaledVector(_gripHold, -s);
  _gripShaft.normalize();
  _gripPalm.normalize();
  _gripKnuckle.crossVectors(_gripShaft, _gripPalm).normalize();
  _stickM.makeBasis(_gripShaft, _gripPalm, _gripKnuckle);
  _gripQ.setFromRotationMatrix(_stickM);
  fore.getWorldQuaternion(_gripInv).invert();
  glove.quaternion.copy(_gripInv).multiply(_gripQ);
}

function gripSkaterHand(body: THREE.Group, arm: THREE.Group, fore: THREE.Group, sx: number, sy: number, sz: number, gx: number, gy: number, gz: number, poleSign: number, coincide = false, stick: THREE.Object3D | null = null, pole: THREE.Vector3 | null = null, freeElbow = false, bendScale = 1) {
  arm.position.set(sx, sy, sz);
  const ox = poleSign < 0 ? 0.02 : -0.01;
  const oz = poleSign < 0 ? 0.06 : 0.07;
  let tx = gx;
  let ty = gy;
  let tz = gz;
  const passes = coincide ? 16 : 4;
  const eps = coincide ? 0.001 : 0.03;
  for (let n = 0; n < passes; n++) {
    poseArmIk(arm, fore, sx, sy, sz, tx, ty, tz, poleSign, true, false, pole, freeElbow, bendScale);
    body.updateWorldMatrix(true, true);
    _corner.set(ox, -0.28, oz);
    fore.localToWorld(_corner);
    bodyToLocal(body, _corner);
    const ex = gx - _corner.x;
    const ey = gy - _corner.y;
    const ez = gz - _corner.z;
    if (Math.hypot(ex, ey, ez) < eps) break;
    tx += ex * 0.85;
    ty += ey * 0.85;
    tz += ez * 0.85;
  }
  if (poleSign > 0 && stick) orientTopHand(body, fore, stick);
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

function poseArmIk(arm: THREE.Group, fore: THREE.Group | null, sx: number, sy: number, sz: number, tx: number, ty: number, tz: number, poleSign: number, allowFront = false, fitGlove = false, pole: THREE.Vector3 | null = null, freeElbow = false, bendScale = 1) {
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
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a)) * bendScale;
  if (pole) _ikPole.copy(pole);
  else if (fitGlove) _ikPole.set(poleSign * (ty > sy ? 0.85 : 0.35), ty > sy ? 0.2 : -0.9, 0.28);
  else if (allowFront) _ikPole.set(-poleSign * 0.08, -0.42, 0.4);
  else _ikPole.set(poleSign * 0.28, -0.48, 0.32);
  _ikN.copy(_ikTo).cross(_ikPole);
  _ikN.cross(_ikTo);
  if (_ikN.lengthSq() < 1e-6) _ikN.set(poleSign, 0, 0);
  _ikN.normalize();
  _ikElbow.set(sx, sy, sz).addScaledVector(_ikTo, a).addScaledVector(_ikN, h);
  if (!fitGlove && !freeElbow) {
    _ikElbow.y = Math.min(_ikElbow.y, sy - (poleSign < 0 ? 0.22 : 0.14));
    _ikElbow.z = Math.max(_ikElbow.z, sz + 0.08);
  }
  if (!fitGlove && allowFront) {
    if (poleSign < 0 && !freeElbow) _ikElbow.x = Math.min(_ikElbow.x, sx + 0.12);
  } else if (!fitGlove && !freeElbow) {
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
    bodyToLocal(body, _corner);
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

/**
 * Folded reach used only by the goal glide. The pole is the elbow hint in body space.
 * The glove point, not the forearm origin, lands on the target.
 */
function poseCheerReach(
  arm: THREE.Group,
  fore: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  gx: number,
  gy: number,
  gz: number,
  px: number,
  py: number,
  pz: number,
): void {
  arm.position.set(sx, sy, sz);
  const UPPER = 0.2807;
  const LOWER = 0.2888;
  _ikTo.set(gx - sx, gy - sy, gz - sz);
  let dist = _ikTo.length();
  const maxR = UPPER + LOWER - 0.02;
  const minR = Math.abs(LOWER - UPPER) + 0.02;
  if (dist < minR) {
    if (dist < 1e-8) _ikTo.set(0.2, -1, 0.2);
    _ikTo.multiplyScalar(minR / _ikTo.length());
    dist = minR;
  } else if (dist > maxR) {
    _ikTo.multiplyScalar(maxR / dist);
    dist = maxR;
  }
  const tx = sx + _ikTo.x;
  const ty = sy + _ikTo.y;
  const tz = sz + _ikTo.z;
  _ikTo.normalize();
  const along = (UPPER * UPPER - LOWER * LOWER + dist * dist) / (2 * dist);
  const lift = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
  _ikPole.set(px, py, pz);
  _ikN.copy(_ikTo).cross(_ikPole);
  _ikN.cross(_ikTo);
  if (_ikN.lengthSq() < 1e-6) _ikN.set(1, 0, 0);
  _ikN.normalize();
  _ikElbow.set(sx, sy, sz).addScaledVector(_ikTo, along).addScaledVector(_ikN, lift);
  _ikD1.set(_ikElbow.x - sx, _ikElbow.y - sy, _ikElbow.z - sz);
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0, -1, 0);
  else _ikD1.normalize();
  _ikN.set(1, 0, 0.15);
  _ikN.addScaledVector(_ikD1, -_ikN.dot(_ikD1));
  if (_ikN.lengthSq() < 1e-6) _ikN.set(0, 0, 1);
  _ikN.normalize();
  _ikD2.crossVectors(_ikD1, _ikN).normalize();
  _ikTo.copy(_ikD1).multiplyScalar(-1);
  _stickM.makeBasis(_ikN, _ikTo, _ikD2);
  arm.quaternion.setFromRotationMatrix(_stickM);
  _ikD1.set(tx - _ikElbow.x, ty - _ikElbow.y, tz - _ikElbow.z);
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(-0.01, -0.28, 0.07);
  else _ikD1.normalize();
  _ikInv.copy(arm.quaternion).invert();
  _ikD1.applyQuaternion(_ikInv);
  _handBot.set(-0.01, -0.28, 0.07).normalize();
  fore.quaternion.setFromUnitVectors(_handBot, _ikD1);
}

/**
 * Cheer only. Inverted one-hand grip: local +Y (the knob) points down from the
 * player's left glove, so the blade group sits above the knob.
 */
function poseCheerStick(stick: THREE.Group, parent: THREE.Object3D, hand: THREE.Group, layout: { len: number }) {
  parent.updateWorldMatrix(true, false);
  hand.updateWorldMatrix(true, false);
  _handTop.set(-0.01, -0.28, 0.07);
  hand.localToWorld(_handTop);
  parent.worldToLocal(_handTop);
  const grip = layout.len * 0.86;
  _ikD1.set(-0.08, -0.98, 0.12);
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0, -1, 0);
  else _ikD1.normalize();
  stick.quaternion.setFromUnitVectors(_fromY, _ikD1);
  _ikD2.set(0, grip, 0).applyQuaternion(stick.quaternion);
  stick.position.set(_handTop.x - _ikD2.x, _handTop.y - _ikD2.y, _handTop.z - _ikD2.z);
}

/**
 * Skating glide after a goal. One skate leads, the other trails, on the celebrate clock.
 * The left hand holds the stick in front of the shoulder, blade above the knob.
 * The right hand is a fist in front of the chest, in line with the forearm.
 * Yaw stays on the root. Home and away share this local pose.
 */
function poseCheer(
  s: Skater,
  root: THREE.Object3D,
  body: THREE.Group,
  head: THREE.Group | null,
  lLeg: THREE.Group,
  rLeg: THREE.Group,
  lShin: THREE.Group | null,
  rShin: THREE.Group | null,
  lBoot: THREE.Group | null,
  rBoot: THREE.Group | null,
  lArm: THREE.Group,
  rArm: THREE.Group,
  lFore: THREE.Group,
  rFore: THREE.Group,
  stick: THREE.Group,
  blade: THREE.Group,
  layout: { len: number },
): void {
  const glide = Math.sin(s.celebrate * CHEER_GLIDE);
  const pitch = CHEER_PITCH;
  body.position.set(0, torsoPlacedY(body, CHEER_DROP), 0);
  body.rotation.set(pitch, 0, 0);
  const plant = (leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, side: 1 | -1) => {
    const drive = side < 0 ? glide : -glide;
    const u = drive * 0.5 + 0.5;
    const knee = CHEER_KNEE_B + (CHEER_KNEE_F - CHEER_KNEE_B) * u;
    const wantZ = CHEER_Z_B + (CHEER_Z_F - CHEER_Z_B) * u;
    const thigh = plantThigh(pitch, CHEER_DROP, knee, -1.6, 0.6, wantZ, torsoPivotY(body));
    leg.position.set(side * CHEER_STANCE, SKATER_HIP_Y, 0);
    leg.rotation.set(thigh, 0, 0);
    if (shin) shin.rotation.set(knee, 0, 0);
    if (boot) boot.rotation.set(-(pitch + thigh + knee), 0, 0);
  };
  plant(lLeg, lShin, lBoot, -1);
  plant(rLeg, rShin, rBoot, 1);
  if (lBoot && rBoot) {
    body.updateWorldMatrix(true, true);
    let low = Infinity;
    for (const boot of [lBoot, rBoot]) {
      for (const z of [-0.14, 0.02, 0.18]) {
        _corner.set(0, -0.1375, z);
        boot.localToWorld(_corner);
        if (_corner.y < low) low = _corner.y;
      }
    }
    if (low < Infinity) body.position.y -= low - 0.02;
  }
  const sockX = 0.24;
  const sockY = 1.46;
  const sockZ = 0.06;
  const gx = sockX + CHEER_HAND_OUT;
  const gy = CHEER_HAND_Y;
  const gz = sockZ + CHEER_HAND_FWD;
  poseCheerReach(rArm, rFore, sockX, sockY, sockZ, gx, gy, gz, 1, -0.35, 0.8);
  poseCheerStick(stick, root, rFore, layout);
  blade.rotation.set(0, 0, 0);
  orientTopHand(body, rFore, stick);
  lArm.position.set(-0.26, 1.46, 0.06);
  const fistY = 1.24 + glide * 0.04;
  poseGloveAt(body, lArm, lFore, -0.26, 1.46, 0.06, -0.18, fistY, 0.34, -1);
  alignCheerFist(lFore);
  if (head) {
    head.position.set(0, 1.54, CHEER_HEAD_Z);
    head.rotation.order = "XYZ";
    head.rotation.set(CHEER_HEAD, 0, 0);
  }
}

function poseGoalieCheer(s: Skater, body: THREE.Group, lArm: THREE.Group, rArm: THREE.Group, lFore: THREE.Group | null, rFore: THREE.Group | null, stick: THREE.Group | null) {
  body.position.y = torsoPlacedY(body, 0);
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
  const body = posedBody(l.parent);
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
  bodyToLocal(body, _handBot);
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
  const shaft = stick.getObjectByName("goalieShaft");
  const blade = stick.getObjectByName("goalieBlade");
  const knob = stick.getObjectByName("goalieKnob");
  if (shaft && knob && blade) {
    layoutGoalieStick(shaft, knob, blade);
    blade.quaternion.copy(_goalieCarryQ);
    const ice = blade.getObjectByName("goalieIce");
    if (ice) placeGoalieIceMesh(ice);
  }
  pivotGoalieStickOnKnob(stick);
}

function poseGoalieStick(stick: THREE.Group, cover: number, s: Skater, gloveArm: THREE.Object3D | null = null, gloveFore: THREE.Object3D | null = null) {
  const fore = stick.parent;
  const body = posedBody(fore?.parent?.parent ?? null);
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
    pivotGoalieStickOnKnob(stick);
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
  // Shaft rises back at 45° so the flat ice blade meets it at 135°. The blade is
  // centered on that shaft, so the sole is the low point and the heel lift keeps it
  // on the ice. The Z stances keep the heel on the grip's lateral and lead the pad
  // face. The ice mesh origin is the blade center, GOALIE_ICE_CENTER_Z ahead of the heel.
  const plantY = STICK_ICE_Y + 0.002;
  let heelLat = gripLat;
  let midHeelFwd: number | null = null;
  const zKind = goalieZKind(s);
  if (zKind) {
    const lane = goaliePadLane(root);
    if (lane) {
      midHeelFwd = lane.front + GOALIE_Z_BLADE_LEAD[zKind] - GOALIE_ICE_CENTER_Z;
      // Compact butterfly keeps the blade on the stick pad. The hands sit on the chest,
      // so the grip's own lateral would plant the blade in the five-hole.
      if (zKind === "butterfly") heelLat = lane.stick;
    }
  } else if (goalieButterflyPose(s)) {
    // Hand is at the top corner. Keep the blade on the stick pad, not in the five-hole.
    const lane = goaliePadLane(root);
    if (lane) {
      heelLat = lane.stick;
      midHeelFwd = lane.front + GOALIE_BUTTERFLY_BLADE_LEAD - GOALIE_ICE_CENTER_Z;
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
    goalieIceHeel(fore, anchorX, anchorY, anchorZ, hx, heelY, hz, _corner);
    const aimX = _corner.x;
    const aimY = _corner.y;
    const aimZ = _corner.z;
    fore.updateWorldMatrix(true, false);
    _liftPt.set(aimX, aimY, aimZ);
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
    layoutGoalieStick(shaft, knob, blade);
    // Ice blade: +X toward the catcher, +Y up, +Z forward on the ice. Right-handed.
    _stickM.makeBasis(_ikD1.set(bx, by, bz), _ikD2.set(0, 1, 0), _liftAxis.set(fx, fy, fz));
    _stickQ.setFromRotationMatrix(_stickM);
    stick.updateWorldMatrix(true, false);
    stick.getWorldQuaternion(_parentQ).invert();
    blade.quaternion.copy(_parentQ).multiply(_stickQ);
    placeGoalieIceMesh(ice);
    return GOALIE_STICK_LEN;
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
  pivotGoalieStickOnKnob(stick);
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
  // Ice lift still hinges on the grip. The knob pivot is put back after that.
  restoreGoalieStickGrip(stick);
  try {
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
  } finally {
    pivotGoalieStickOnKnob(stick);
  }
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
    tuckGoaliePadToSkate(lShin, lBoot);
    tuckGoaliePadToSkate(rShin, rBoot);
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
      body.position.y = torsoPlacedY(body, GOALIE_DIVE_DROP * diveU);
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

function tumbleRoot(struck: number, tumble: number, yaw: number) {
  const u = Math.min(1, Math.max(0, 1 - struck / TUMBLE_STRIKE));
  const pitch = Math.min(TUMBLE_PITCH_MAX, u * TUMBLE_PITCH_RATE);
  const spin = u * 4.6 * tumble;
  const roll = Math.sin(spin) * 0.48;
  const y = 0.1 + Math.sin(pitch) * 0.36 + Math.abs(roll) * 0.22;
  return { y, rx: pitch, ry: yaw + Math.PI + spin * 0.45, rz: roll };
}

/**
 * Flat circle on the rink at world `(worldX, SHADOW_ICE_Y, worldZ)`.
 * Parent pitch, roll, and a non-uniform scale shear a position/quaternion/scale
 * into a tilted ellipse, so the matrix is written directly.
 */
function plantRinkShadowAt(shadow: THREE.Object3D, worldX: number, worldZ: number, uniform: number) {
  const parent = shadow.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  _rinkShadowPos.set(worldX, SHADOW_ICE_Y, worldZ);
  _rinkShadowScale.set(uniform, uniform, uniform);
  _rinkShadowWorld.compose(_rinkShadowPos, _rinkShadowFlat, _rinkShadowScale);
  shadow.matrix.copy(parent.matrixWorld).invert().multiply(_rinkShadowWorld);
  shadow.matrixAutoUpdate = false;
  shadow.matrixWorldNeedsUpdate = true;
}

/**
 * Referee circle. `localX` / `localZ` are the offset in the parent's yaw frame
 * (the get-up foot midpoint is written onto the mesh before this runs).
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
  const worldX = _rinkShadowPos.x + (_rinkShadowX.x * localX + _rinkShadowZ.x * localZ) * uniform;
  const worldZ = _rinkShadowPos.z + (_rinkShadowX.z * localX + _rinkShadowZ.z * localZ) * uniform;
  plantRinkShadowAt(shadow, worldX, worldZ, uniform);
}

/** Pants center in the body group. Skaters and goalies both hang the pelvis here. */
function playerShadowCom(body: THREE.Object3D, out: THREE.Vector3) {
  out.set(0, SKATER_HIP_Y, 0);
  body.updateWorldMatrix(true, false);
  bodyToWorld(body, out);
}

/**
 * Flat team mark on the rink at world `(worldX, 0, worldZ)`.
 * Child meshes already sit in XZ at y=0.02 and y=0.03, so this group stays level.
 * `scaleX` / `scaleZ` are the world radii factors (goalie pulse, after undoing root scale).
 */
function plantFlatRinkMark(mark: THREE.Object3D, worldX: number, worldZ: number, scaleX: number, scaleZ: number) {
  const parent = mark.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  _rinkShadowPos.set(worldX, 0, worldZ);
  _rinkShadowScale.set(scaleX, 1, scaleZ);
  _rinkShadowWorld.compose(_rinkShadowPos, _rinkMarkLevel, _rinkShadowScale);
  mark.matrix.copy(parent.matrixWorld).invert().multiply(_rinkShadowWorld);
  mark.matrixAutoUpdate = false;
  mark.matrixWorldNeedsUpdate = true;
}

/** 0 when the fall finishes tipping, 1 when tumbling ends (struck just above 0.1). */
function struckRise(u: number): number {
  const end = 1 - 0.1 / TUMBLE_STRIKE;
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
    body.position.set(0, torsoPlacedY(body, 0), 0);
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
  const roller = useGame((s) => s.clockMode) === "roller";
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

/** Teammate glove plus a pocket. The palm group is the pose attachment. */
function Catcher({ mats, seated = false }: { mats: KitMats; seated?: boolean }) {
  const glovePos = seated ? ([-0.01, -0.28, 0.05] as const) : ([-0.01, -0.28, 0.07] as const);
  const gloveRot = seated ? ([0.4, -0.08, -0.06] as const) : ([0.5, -0.1, -0.08] as const);
  const pivot = seated ? CATCHER_PIVOT_SEAT : CATCHER_PIVOT_LIVE;
  const gloveLocal: [number, number, number] = [glovePos[0] - pivot[0], glovePos[1] - pivot[1], glovePos[2] - pivot[2]];
  const palmLocal: [number, number, number] = [0.02 - pivot[0], -0.32 - pivot[1], 0.02 - pivot[2]];
  return (
    <>
      <mesh geometry={gloveGeo} material={mats.gloves} position={gloveLocal} rotation={gloveRot} castShadow>
        <mesh geometry={catcherTrimSideGeo} material={mats.gloves} position={[CATCHER_POCKET_X - CATCHER_TRIM_X, 0, CATCHER_POCKET_Z]} castShadow />
        <mesh geometry={catcherTrimSideGeo} material={mats.gloves} position={[CATCHER_POCKET_X + CATCHER_TRIM_X, 0, CATCHER_POCKET_Z]} castShadow />
        <mesh geometry={catcherTrimCapGeo} material={mats.gloves} position={[CATCHER_POCKET_X, -CATCHER_TRIM_Y, CATCHER_POCKET_Z]} castShadow />
        <mesh geometry={catcherTrimCapGeo} material={mats.gloves} position={[CATCHER_POCKET_X, CATCHER_TRIM_Y, CATCHER_POCKET_Z]} castShadow />
        <mesh geometry={catcherPocketNetGeo} material={mats.catcherMesh} position={[CATCHER_POCKET_X, 0, CATCHER_NET_Z]} renderOrder={1} />
      </mesh>
      {/* Palm axis in the forearm. Pose aims this point. */}
      <group position={palmLocal} rotation={[0.1, 0.16, 0.22]} />
    </>
  );
}

function GoalieMask({ material }: { material: THREE.Material }) {
  const bars: ReactElement[] = [];
  for (const x of CAGE_X) {
    for (let i = 0; i < CAGE_Y.length - 1; i++) {
      const y1 = CAGE_Y[i] ?? 0;
      const y2 = CAGE_Y[i + 1] ?? y1;
      const z1 = cageZ(x, y1);
      const z2 = cageZ(x, y2);
      const dy = y2 - y1;
      const dz = z2 - z1;
      bars.push(
        <mesh
          key={`v${x}-${i}`}
          geometry={cageBarV}
          material={material}
          position={[x, (y1 + y2) / 2, (z1 + z2) / 2]}
          rotation={[Math.atan2(dz, dy), 0, 0]}
          scale={[1, Math.hypot(dy, dz) + 0.008, 1]}
        />,
      );
    }
  }
  for (const y of CAGE_Y) {
    for (let i = 0; i < CAGE_X.length - 1; i++) {
      const x1 = CAGE_X[i] ?? 0;
      const x2 = CAGE_X[i + 1] ?? x1;
      const z1 = cageZ(x1, y);
      const z2 = cageZ(x2, y);
      const dx = x2 - x1;
      const dz = z2 - z1;
      bars.push(
        <mesh
          key={`h${y}-${i}`}
          geometry={cageBarH}
          material={material}
          position={[(x1 + x2) / 2, y, (z1 + z2) / 2]}
          rotation={[0, Math.atan2(-dz, dx), 0]}
          scale={[Math.hypot(dx, dz) + 0.008, 1, 1]}
        />,
      );
    }
  }
  return (
    <>
      <group name="goalieCage">{bars}</group>
    </>
  );
}

export function PlayerMesh({
  index,
  kitId,
  onJointRefs,
  onJointClick,
  posedEpoch = 0,
}: {
  index: number;
  kitId: number;
  onJointRefs?: (refs: Record<string, THREE.Object3D | null>) => void;
  /** Pose editor only. Clicks select the nearest tagged joint while world.poseEditorActive is set. */
  onJointClick?: (id: string) => void;
  /** Bumps after a pose bake so the saved joints are stamped again once React commits. */
  posedEpoch?: number;
}) {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const side = world.skaters[index]?.side;
  const liveKitId = onJointRefs ? kitId : ((side === "away" ? awayKit : homeKit) ?? kitId);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const shoulders = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const lLeg = useRef<THREE.Group>(null);
  const rLeg = useRef<THREE.Group>(null);
  const lShin = useRef<THREE.Group>(null);
  const rShin = useRef<THREE.Group>(null);
  const lBoot = useRef<THREE.Group>(null);
  const rBoot = useRef<THREE.Group>(null);
  const lArm = useRef<THREE.Group>(null);
  const rArm = useRef<THREE.Group>(null);
  const rSleeve = useRef<THREE.Group>(null);
  const rForeSleeve = useRef<THREE.Group>(null);
  const lFore = useRef<THREE.Group>(null);
  const rFore = useRef<THREE.Group>(null);
  const lGlove = useRef<THREE.Mesh>(null);
  const rGlove = useRef<THREE.Mesh>(null);
  const catcherGrp = useRef<THREE.Group>(null);
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
  const torsoPivot = torsoMeshCenterY(kit.id, false);
  const torsoDrop = torsoTopDrop(kit.id);
  const torsoShift = goalie ? torsoPivot : 0;
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

  const poseGroups = (): Partial<Record<PoseJointId, THREE.Object3D | null>> => ({
    body: body.current,
    torso: torso.current,
    hips: hips.current,
    shoulders: shoulders.current,
    head: head.current,
    lArm: lArm.current,
    lFore: lFore.current,
    lHand: lGlove.current ?? blocker.current,
    rArm: rArm.current,
    rFore: rFore.current,
    rHand: rGlove.current ?? catcherGrp.current,
    lLeg: lLeg.current,
    lShin: lShin.current,
    lBoot: lBoot.current,
    rLeg: rLeg.current,
    rShin: rShin.current,
    rBoot: rBoot.current,
    stick: stick.current,
    bladeGrp: bladeGrp.current,
    shaftHold: shaftHold.current,
  });

  useLayoutEffect(() => {
    const group = body.current;
    if (!group) return;
    const prev = group.userData.torsoPivotY;
    group.userData.torsoPivotY = torsoPivot;
    if (torso.current) torso.current.userData.torsoCentered = goalie ? 1 : 0;
    if (typeof prev === "number") {
      group.position.add(new THREE.Vector3(0, torsoPivot - prev, 0).applyQuaternion(group.quaternion));
    } else group.position.set(0, torsoPivot, 0);
  }, [goalie, torsoPivot]);

  useLayoutEffect(() => {
    if (!onJointRefs || !posedEpoch || !world.poseEditorActive) return;
    const s = world.skaters[index];
    if (!s) return;
    releaseStickFromHand(stick.current);
    stampPoseOverride(index, s, poseGroups());
  }, [index, onJointRefs, posedEpoch]);

  useLayoutEffect(() => {
    const groups = {
      body: body.current,
      torso: torso.current,
      hips: hips.current,
      shoulders: shoulders.current,
      head: head.current,
      lArm: lArm.current,
      lFore: lFore.current,
      lHand: lGlove.current ?? blocker.current,
      rArm: rArm.current,
      rFore: rFore.current,
      rHand: rGlove.current ?? catcherGrp.current,
      lLeg: lLeg.current,
      lShin: lShin.current,
      lBoot: lBoot.current,
      rLeg: rLeg.current,
      rShin: rShin.current,
      rBoot: rBoot.current,
      stick: stick.current,
      bladeGrp: bladeGrp.current,
      shaftHold: shaftHold.current,
    };
    // Tag only for the editor. Gameplay never passes onJointClick, so these groups stay untouched.
    if (onJointClick && world.poseEditorActive) {
      for (const [id, obj] of Object.entries(groups)) {
        if (obj) obj.userData.poseJoint = id;
      }
    }
    if (goalie && stick.current) {
      const knob = stick.current.getObjectByName("goalieKnob");
      if (knob && knob.position.lengthSq() < 1e-8 && !stick.current.userData.goalieKnobShift) {
        setGoalieKnobShift(stick.current, 0, layout.len / 3, 0);
      }
    }
    onJointRefs?.(groups);
    return () => {
      for (const obj of Object.values(groups)) {
        if (obj) delete obj.userData.poseJoint;
      }
    };
  }, [goalie, layout, onJointRefs, onJointClick]);

  useLayoutEffect(() => () => disposeKit(mats), [mats]);

  useLayoutEffect(() => {
    root.current?.traverse((obj) => {
      obj.frustumCulled = false;
    });
  }, []);

  useFrame((_, delta) => {
    if (world.poseEditorActive || world.poseEditorLock) {
      // The editor does not apply the goalie root scale, so the helmet stays at the skater size.
      if (head.current) head.current.scale.set(1, 1, 1);
      return;
    }
    if (body.current) body.current.userData.torsoPivotY = torsoPivot;
    const s: Skater | undefined = world.skaters[index];
    const g = root.current;
    if (!s || !g) return;
    g.visible = true;
    const diveU = Math.min(1, Math.max(0, s.dive / 0.95));
    const diving = !goalie && s.dive > 0.04;
    const tumbling = s.tumble !== 0 && s.struck > 0.1;
    const tumbleU = tumbling ? Math.min(1, Math.max(0, 1 - s.struck / TUMBLE_STRIKE)) : 0;
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
    if (goalie) {
      g.scale.set(1.14, 1, 1.14);
      // Undo the root width and depth on the head so the shell matches a skater helmet. The cage is inside this group.
      head.current?.scale.set(1 / 1.14, 1, 1 / 1.14);
    } else {
      g.scale.set(1, 1, 1);
      head.current?.scale.set(1, 1, 1);
    }
    const poke = s.poke > 0.04;
    const wind = s.windup;
    const follow = s.follow;
    const dekeA = s.deke > 0.02 ? Math.sin(s.deke * 12) : 0;
    const cheer = !goalie && s.celebrate > 0.05;
    const goalieCheer = goalie && !tumbling && s.celebrate > 0.05;
    // Rage is only the saved rage1/rage2 or goalieRage1/goalieRage2 joints. No stick aim, dip, or IK.
    // A scored-on goalie with no smash clock still stamps goalieRage1, so the stick plant stays off.
    const goalieRageStill =
      goalie &&
      !world.poseHold &&
      !tumbling &&
      s.dive <= 0.04 &&
      !checkedCyclePose(s.struck, s.tumble) &&
      namedPoseFor(s, index) === "goalieRage1";
    const rage =
      (!goalie && !!rageDraw(s.id)) ||
      (goalie && s.smashKind > 0 && !tumbling && s.dive <= 0.04 && !checkedCyclePose(s.struck, s.tumble)) ||
      goalieRageStill;
    let swingT = 0;
    let slapping = false;
    if (follow > 0.02) {
      const span = Math.max(0.2, shotFollowTime(world.lastShotKind, world.lastShotSlap));
      const u = 1 - Math.min(1, follow / span);
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
    const forehandFollow = !goalie && !wristBlocked && follow > 0.02 && world.lastShooter === s.id && !world.lastShotBackhand;
    if (world.windupCancel && follow <= 0.02 && wind <= 0.04) {
      wristFrom.current = null;
      wristBack.current = false;
    }
    if (forehandFollow && wristShotAt.current !== world.lastShoot) {
      wristShotAt.current = world.lastShoot;
      wristHold.current = world.lastShotSlap ? SLAP_HIT : (wristFrom.current ?? WRIST_CARRY);
      wristFrom.current = null;
      wristBack.current = false;
    }
    if (wristBlocked || slapRelease || slapLoad || forehandFollow) {
      wristLeft.current = 0;
      if (slapLoad || (slapRelease && !forehandFollow)) wristFrom.current = null;
      if (!forehandFollow) wristBack.current = false;
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
    if (forehandFollow) {
      const total = shotFollowTime(world.lastShotKind, world.lastShotSlap);
      const elapsed = Math.min(total, Math.max(0, total - follow));
      const after = shotFollowAfter(elapsed, total);
      const from = wristHold.current ?? (world.lastShotSlap ? SLAP_HIT : WRIST_CARRY);
      const releaseKey = world.lastShotSlap ? SLAP_HIT : WRIST_RELEASE;
      const settleKey = ownsPuck ? WRIST_CARRY : WRIST_SETTLE;
      if (after.phase === "release") wristKey = lerpWrist(from, releaseKey, after.u);
      else if (after.phase === "follow") {
        // A lerp from the slap hit keeps flat false, so the hold would miss the gallery planter.
        if (after.u >= 1) wristKey = WRIST_FOLLOW;
        else {
          wristKey = lerpWrist(releaseKey, WRIST_FOLLOW, after.u);
          wristKey.flat = true;
        }
      } else wristKey = lerpWrist(WRIST_FOLLOW, settleKey, after.u);
      wristIce = after.phase === "release" && !world.lastShotSlap;
      wristWatch = "net";
    } else if (!wristBlocked && !slapRelease && !slapLoad && wristLeft.current > 0 && wristSpan.current > 0) {
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
    const slap = !wrist && slapLoad ? slapStick(wind, follow) : null;
    const carryPose = !goalie && world.puck.owner === index && !slapping && !wrist && !diving && !tumbling && !cheer && !rage && s.struck <= 0.2 && !brawlPoseFor(s.id);
    const dekePose = carryPose && s.deke > 0.02;
    const sidePose = carryPose && !dekePose && s.stickPull > 0.02;
    const skillCarry =
      carryPose && !dekePose && s.id === world.userId && useGame.getState().controlProfile === "stick";
    const dekeAmt = dekePose ? dekePull(s.deke) : sidePose ? dekePull(0.525 * Math.min(1, s.stickPull)) : 0;
    const puckDrop =
      !goalie &&
      world.faceoff &&
      world.faceoffPhase !== "live" &&
      !tumbling &&
      !diving &&
      s.celebrate <= 0.05 &&
      s.struck <= 0.2 &&
      !brawlPoseFor(s.id) &&
      !rage;
    const faceoffTaker =
      !goalie &&
      world.faceoff &&
      (s.id === world.homeDot || s.id === world.awayDot) &&
      !tumbling &&
      !diving &&
      s.celebrate <= 0.05 &&
      s.struck <= 0.2 &&
      !brawlPoseFor(s.id) &&
      !rage;
    const pokeReach = !puckDrop && !faceoffTaker && !goalie && world.puck.owner !== index && (poke || puckNearSkater(s)) && !slapping && !wrist && !diving && !tumbling && !cheer && !rage && s.hit <= 0 && s.struck <= 0.2 && !brawlPoseFor(s.id);
    let pokePosed = false;
    let pokeToeX = 0;
    let pokeToeZ = 1;
    const pokeStop = puckDrop || faceoffTaker || diving || tumbling || cheer || !!rage || !!brawlPoseFor(s.id) || slapping || wrist || s.hit > 0 || s.struck > 0.2;
    if (goalie && !tumbling && !rage) {
      poseGoaliePads(s, g, body.current, lLeg.current, rLeg.current, lShin.current, rShin.current, lBoot.current, rBoot.current);
    }
    const butterflied = goalie && !tumbling && !goalieCheer && !rage && poseGoalieCover(s, g, body.current, lLeg.current, rLeg.current, lArm.current, rArm.current, lFore.current, rFore.current, stick.current);
    const checking = !goalie && s.hit > 0 && !diving && !tumbling && s.struck <= 0.2 && !slapping && !wrist && !rage;
    if (checking) {
      if (!checkWas.current) {
        checkElapsed.current = 0;
        checkSide.current = latchCheckSide(g, s);
      }
      checkElapsed.current += Math.min(0.05, delta || 0);
    }
    checkWas.current = checking;
    const checkT = checking ? checkTargets(checkSide.current, checkElapsed.current, s.hit, torsoPivot) : null;
    const absorbK = !goalie && !tumbling && !diving && !rage && !checking && s.struck > 0.2 ? smooth01(Math.min(1, (Math.min(s.struck, 1.15) - 0.2) / 0.7)) : 0;
    if (body.current && !butterflied && !goalie && !rage) {
      if (wrist && wristKey) {
        body.current.position.x = wristKey.weight;
        body.current.position.y = torsoPlacedY(body.current, wristKey.drop);
        body.current.position.z = (wristKey.bz * (SKATER_HIP_Y - torsoPivot)) / SKATER_HIP_Y;
        body.current.rotation.x = wristKey.hip;
        body.current.rotation.y = wristHipYaw(s, wristKey.aim, wristKey.open);
        body.current.rotation.z = 0;
      } else if (slap) {
        body.current.position.set(0, torsoPlacedY(body.current, slap.key.drop), slap.key.bz);
        body.current.rotation.set(slap.key.hip, slap.key.open, 0);
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
          const planted = checkPlant(pitch, knee, RECV_DORSI, 0, 0, torsoPivot);
          drop += (planted.drop - drop) * absorbK;
          bz = -Math.sin(pitch) * (SKATER_HIP_Y - torsoPivot) * absorbK;
          roll *= 1 - absorbK;
        }
        body.current.position.y = torsoPlacedY(body.current, drop);
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
      const followFeet = wristKey.flat && (Math.abs(wristKey.bz) > 1e-3 || Math.abs(wristKey.toeL) > 1e-3 || Math.abs(wristKey.toeR) > 1e-3);
      if (lLeg.current)
        poseWristLeg(
          lLeg.current,
          lShin.current,
          lBoot.current,
          -SKATER_HIP_X,
          wristKey.kneeL,
          wristKey.hip,
          wristKey.drop,
          wristKey.flat,
          followFeet ? wristKey.zL : null,
          followFeet ? wristKey.toeL : 0,
          wristKey.lift,
          torsoPivot,
        );
      if (rLeg.current)
        poseWristLeg(
          rLeg.current,
          rShin.current,
          rBoot.current,
          SKATER_HIP_X,
          wristKey.kneeR,
          wristKey.hip,
          wristKey.drop,
          wristKey.flat,
          followFeet ? wristKey.zR : null,
          followFeet ? wristKey.toeR : 0,
          0,
          torsoPivot,
        );
      if (wristKey.flat && body.current && lBoot.current && rBoot.current) {
        body.current.updateWorldMatrix(true, true);
        let low = Infinity;
        const boots = wristKey.lift > 0.15 ? [rBoot.current] : [lBoot.current, rBoot.current];
        for (const boot of boots) {
          _corner.set(0, -0.1375, 0.02);
          boot.localToWorld(_corner);
          if (_corner.y < low) low = _corner.y;
        }
        if (low < Infinity) body.current.position.y -= low - 0.02;
      }
    } else if (!goalie && slap) {
      if (lLeg.current) poseSlapLeg(lLeg.current, lShin.current, lBoot.current, -SKATER_HIP_X, slap.key.kneeL, slap.key.hip, -1, slap.key.zL, slap.key.toeL, slap.key.abduct, slap.wide, slap.key.lift);
      if (rLeg.current) poseSlapLeg(rLeg.current, rShin.current, rBoot.current, SKATER_HIP_X, slap.key.kneeR, slap.key.hip, 1, slap.key.zR, slap.key.toeR, slap.key.abduct, slap.wide, 0);
      if (body.current && lBoot.current && rBoot.current) {
        body.current.updateWorldMatrix(true, true);
        let low = Infinity;
        let high = -Infinity;
        for (const boot of [lBoot.current, rBoot.current]) {
          _corner.set(0, -0.1375, 0.02);
          boot.localToWorld(_corner);
          if (_corner.y < low) low = _corner.y;
          if (_corner.y > high) high = _corner.y;
        }
        if (slap.key.lift > 0.15 && rBoot.current) {
          _corner.set(0, -0.1375, 0.02);
          rBoot.current.localToWorld(_corner);
          body.current.position.y -= _corner.y - 0.02;
        } else if (low < Infinity) body.current.position.y -= (low + high) * 0.5 - 0.02;
      }
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
      const pivot = torsoPivotY(body.current);
      const drop = body.current.position.y - pivot;
      const frontThigh = plantThigh(pitch, drop, POKE_FRONT_KNEE, -1.85, -1.35, POKE_FRONT_FOOT_Z, pivot);
      const backThigh = plantThigh(pitch, drop, POKE_BACK_KNEE, -0.35, 0.55, POKE_BACK_FOOT_Z, pivot);
      if (lLeg.current) posePokeLeg(lLeg.current, lShin.current, lBoot.current, -SKATER_HIP_X, frontThigh, POKE_FRONT_KNEE, pitch);
      if (rLeg.current) posePokeLeg(rLeg.current, rShin.current, rBoot.current, SKATER_HIP_X, backThigh, POKE_BACK_KNEE, pitch);
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
        const planted = checkPlant(pitch, knee, RECV_DORSI, 0, 0, torsoPivot);
        const bootX = checkBoot(pitch, planted.thigh, knee, RECV_DORSI);
        blendLeg(lLeg.current, lShin.current, lBoot.current, -SKATER_HIP_X, planted.thigh, knee, bootX, absorbK);
        blendLeg(rLeg.current, rShin.current, rBoot.current, SKATER_HIP_X, planted.thigh, knee, bootX, absorbK);
      }
    }
    if (!goalie && rFore.current) resetTopGlove(rFore.current);
    if (!goalie && lFore.current) resetFistGlove(lFore.current);
    if (lArm.current && rArm.current && !butterflied && !rage) {
      if (goalieCheer && body.current) {
        poseGoalieCheer(s, body.current, lArm.current, rArm.current, lFore.current, rFore.current, stick.current);
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
          applyStickAim(stick.current, wristKey.flat ? mountWristAim(body.current, wristStickAim(wristKey)) : wristStickAim(wristKey));
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
          bodyToWorld(body.current, _corner);
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
        else if (carryPose) applyStickAim(stick.current, dekePose ? dekeStickAim(s.deke) : skillCarry ? skillCarryStickAim(Math.max(-1, Math.min(1, s.stickPull))) : sidePose ? dekeStickAim(0.525 * Math.min(1, s.stickPull)) : carryOwnStickAim());
        else if (hasPuck || reach) applyStickAim(stick.current, carryStickAim());
        else if (!(puckDrop && !faceoffTaker) && !poseHasJoint(namedPoseFor(s, index), "stick")) {
          applyStickAim(stick.current, readyStickAim());
        }
        if (!fallHand && !wrist && !slapping && !hasPuck && !reach) {
          stick.current.updateWorldMatrix(true, false);
          body.current.updateWorldMatrix(true, false);
          _handTop.set(0, layout.len * SKATER_GRIP_TOP, 0);
          stick.current.localToWorld(_handTop);
          bodyToLocal(body.current, _handTop);
          _handBot.set(0, layout.len * SKATER_GRIP_BOT, 0);
          stick.current.localToWorld(_handBot);
          bodyToLocal(body.current, _handBot);
          gripSkaterHand(body.current, rArm.current, rFore.current, 0.24, 1.46, 0.06, _handTop.x, _handTop.y, _handTop.z, 1, true, stick.current);
          gripSkaterHand(body.current, lArm.current, lFore.current, -0.26, 1.46, 0.06, _handBot.x, _handBot.y, _handBot.z, -1, true);
        } else if (!fallHand) {
          stick.current.updateWorldMatrix(true, false);
          body.current.updateWorldMatrix(true, false);
          _handTop.set(0, layout.len * (slap ? SLAP_TOP : SKATER_GRIP_TOP), 0);
          stick.current.localToWorld(_handTop);
          bodyToLocal(body.current, _handTop);
          _handBot.set(0, layout.len * (wrist && wristKey ? wristKey.botGrip : slap ? slap.bot : SKATER_GRIP_BOT), 0);
          stick.current.localToWorld(_handBot);
          bodyToLocal(body.current, _handBot);
          const armOpp = carryPose && s.poke <= 0.04 ? Math.sin(s.stride) * STRIDE_ARM : 0;
          const shX = -DEKE_SHOULDER * dekeAmt;
          const handsOn = carryPose || wrist || !!slap || (tumbleRise && hasPuck);
          const wristHands = !!(wrist && wristKey && wristKey.flat);
          const followArms = (!!slap && slap.key.lift > 0.35) || (!!wristKey && wristKey.lift > 0.35);
          const pokeArm = poke && reach && !slapping && !wrist && !tumbleRise && !checkT;
          if (pokeArm) posePokeReachArms(body.current, lArm.current, lFore.current, rArm.current, rFore.current, stick.current, layout);
          else gripSkaterHand(
            body.current,
            rArm.current,
            rFore.current,
            slap ? SLAP_SH_L.x : 0.24 + shX,
            slap ? SLAP_SH_L.y : 1.46,
            slap ? SLAP_SH_L.z : 0.06 + armOpp,
            _handTop.x,
            _handTop.y,
            _handTop.z,
            1,
            handsOn,
            stick.current,
            followArms ? _followTopPole : slap ? _slapTopPole : wristHands ? _wristTopPole : null,
            !!slap || wristHands || followArms,
            wristHands ? (followArms ? 0.85 : WRIST_TOP_BEND) : 1,
          );
          if (!pokeArm && reach && !slapping && !wrist && !tumbleRise && !checkT) hangSkaterArm(lArm.current, lFore.current, -1, 0.25);
          else if (!pokeArm)
            gripSkaterHand(
              body.current,
              lArm.current,
              lFore.current,
              slap ? slap.shR.x : -0.26 + shX,
              slap ? slap.shR.y : 1.46,
              slap ? slap.shR.z : 0.06 - armOpp,
              _handBot.x,
              _handBot.y,
              _handBot.z,
              -1,
              handsOn,
              null,
              followArms ? _followBotPole : slap ? _slapBotPole : null,
              !!slap || wristHands || followArms,
              followArms ? 0.12 : 1,
            );
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
          if (offFore === rFore.current && body.current && stick.current) orientTopHand(body.current, rFore.current, stick.current);
          else releaseTopGlove(rFore.current, w);
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
      } else if (s.dive > 0.04) {
        applyStickAim(stick.current, carryStickAim());
      } else if (!goalie && fallHand && lFore.current) {
        poseStickOneHand(stick.current, g, lFore.current, layout);
      }
    }
    if (!goalie && shaftHold.current && bladeGrp.current && knobRef.current && stick.current) {
      stick.current.visible = true;
      shaftHold.current.visible = true;
      shaftHold.current.position.set(0, layout.len * 0.5, 0);
      shaftHold.current.scale.set(1, layout.len, 1);
      bladeGrp.current.visible = true;
      if (pokePosed) posePokeBlade(bladeGrp.current, stick.current, pokeToeX, pokeToeZ);
      else if (!poseHasJoint(namedPoseFor(s, index), "bladeGrp") && (tumbling || (!wrist && !slap))) {
        const bladeYaw = !tumbling && (dekePose || sidePose) ? -DEKE_BLADE_YAW * dekeAmt : 0;
        bladeGrp.current.rotation.set(0, bladeYaw, 0);
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
      if (poke && pokePosed) {
        posePoke(
          bodyM,
          head.current,
          lArmM,
          lForeM,
          lGlove.current,
          rArmM,
          rForeM,
          rGlove.current,
          lLegM,
          lShin.current,
          lBoot.current,
          rLegM,
          rShin.current,
          rBoot.current,
          stickM,
          shaftHold.current,
          bladeM,
        );
      }
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
        if (!rage && !brawlPoseFor(s.id)) orientTopHand(bodyM, rForeM, stickM);
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
      if (!goalie) resetTopGlove(rFore.current);
      body.current.rotation.set(0, 0, 0);
      body.current.position.y = torsoPlacedY(body.current, 0);
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
        head.current.rotation.x = Math.min(head.current.rotation.x, WRIST_HEAD_DOWN);
      } else if (slap && slapRelease && body.current) {
        head.current.position.set(0, 1.54, 0.02);
        watchPoint(head.current, body.current, attackDir(s.side) * GOAL_LINE_X, GOAL_H * 0.45, 0);
        head.current.rotation.x = Math.min(head.current.rotation.x, WRIST_HEAD_DOWN);
      } else if ((dekePose || sidePose) && body.current) {
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
    const neutralW =
      carryPose && s.burst <= 0 && s.poke <= 0.04 && s.hit <= 0 && !puckDrop && pokeLeft.current <= 0
        ? neutralCarryBlend(s.deke, s.stickPull)
        : 0;
    if (
      neutralW > 0 &&
      body.current &&
      stick.current &&
      bladeGrp.current &&
      lArm.current &&
      rArm.current &&
      lFore.current &&
      rFore.current &&
      lLeg.current &&
      rLeg.current
    ) {
      poseNeutralCarry(
        body.current,
        head.current,
        lLeg.current,
        rLeg.current,
        lShin.current,
        rShin.current,
        lBoot.current,
        rBoot.current,
        lArm.current,
        rArm.current,
        lFore.current,
        rFore.current,
        stick.current,
        bladeGrp.current,
        layout,
        neutralW,
        -DEKE_SHOULDER * dekeAmt,
        Math.sin(s.stride) * STRIDE_ARM,
      );
    }
    const burstW = goalie ? 0 : burstPoseWeight(s.id);
    const burstPose =
      burstW > 0 &&
      carryPose &&
      s.deke <= 0.02 &&
      Math.abs(s.stickPull) <= 0.02 &&
      s.poke <= 0.04 &&
      s.hit <= 0 &&
      !puckDrop &&
      pokeLeft.current <= 0;
    if (
      burstPose &&
      body.current &&
      stick.current &&
      bladeGrp.current &&
      lArm.current &&
      rArm.current &&
      lFore.current &&
      rFore.current &&
      lLeg.current &&
      rLeg.current
    ) {
      poseBurstCarry(
        body.current,
        head.current,
        lLeg.current,
        rLeg.current,
        lShin.current,
        rShin.current,
        lBoot.current,
        rBoot.current,
        lArm.current,
        rArm.current,
        lFore.current,
        rFore.current,
        stick.current,
        bladeGrp.current,
        layout,
        burstW,
        s.stride,
      );
    }
    const readyHold =
      s.kind !== "goalie" &&
      world.puck.owner !== index &&
      !(world.faceoff && world.faceoffPhase !== "live") &&
      !carryPose &&
      s.deke <= 0.02 &&
      Math.abs(s.stickPull) <= 0.02 &&
      !poke &&
      !puckNearSkater(s) &&
      s.hit <= 0 &&
      !slapping &&
      !wrist &&
      s.dive <= 0.04 &&
      !tumbling &&
      !brawlPoseFor(s.id) &&
      s.celebrate <= 0.05 &&
      !rage &&
      s.struck <= 0.2 &&
      pokeLeft.current <= 0;
    const readyW = readyHold ? skaterReadyWeight(Math.hypot(s.vx, s.vz)) : 0;
    if (
      readyW > 0 &&
      body.current &&
      stick.current &&
      bladeGrp.current &&
      lArm.current &&
      rArm.current &&
      lFore.current &&
      rFore.current &&
      lLeg.current &&
      rLeg.current
    ) {
      poseSkaterReady(
        body.current,
        head.current,
        lLeg.current,
        rLeg.current,
        lShin.current,
        rShin.current,
        lBoot.current,
        rBoot.current,
        lArm.current,
        rArm.current,
        lFore.current,
        rFore.current,
        stick.current,
        bladeGrp.current,
        layout,
        readyW,
      );
    }
    if (
      puckDrop &&
      !faceoffTaker &&
      body.current &&
      stick.current &&
      bladeGrp.current &&
      lArm.current &&
      rArm.current &&
      lFore.current &&
      rFore.current &&
      lLeg.current &&
      rLeg.current
    ) {
      posePuckDrop(
        body.current,
        head.current,
        lLeg.current,
        rLeg.current,
        lShin.current,
        rShin.current,
        lBoot.current,
        rBoot.current,
        lArm.current,
        rArm.current,
        lFore.current,
        rFore.current,
        stick.current,
        bladeGrp.current,
        layout,
        poseHasJoint(namedPoseFor(s, index), "stick"),
      );
    }
    if (
      faceoffTaker &&
      body.current &&
      stick.current &&
      bladeGrp.current &&
      lArm.current &&
      rArm.current &&
      lFore.current &&
      rFore.current &&
      lLeg.current &&
      rLeg.current
    ) {
      poseFaceoffDraw(
        body.current,
        head.current,
        lLeg.current,
        rLeg.current,
        lShin.current,
        rShin.current,
        lBoot.current,
        rBoot.current,
        lArm.current,
        rArm.current,
        lFore.current,
        rFore.current,
        stick.current,
        bladeGrp.current,
        layout,
        g,
        faceoffDrawSweep(),
      );
    }
    if (
      cheer &&
      s.hit <= 0 &&
      !tumbling &&
      s.struck <= 0.2 &&
      !brawlPoseFor(s.id) &&
      !rage &&
      s.dive <= 0.04 &&
      body.current &&
      stick.current &&
      bladeGrp.current &&
      lArm.current &&
      rArm.current &&
      lFore.current &&
      rFore.current &&
      lLeg.current &&
      rLeg.current
    ) {
      poseCheer(
        s,
        g,
        body.current,
        head.current,
        lLeg.current,
        rLeg.current,
        lShin.current,
        rShin.current,
        lBoot.current,
        rBoot.current,
        lArm.current,
        rArm.current,
        lFore.current,
        rFore.current,
        stick.current,
        bladeGrp.current,
        layout,
      );
    }
    const stamped = stampPoseOverride(index, s, poseGroups());
    if (
      stamped &&
      pokePosed &&
      pokeSnap.current &&
      stick.current &&
      bladeGrp.current &&
      rArm.current &&
      rFore.current &&
      lArm.current &&
      lFore.current &&
      body.current &&
      lLeg.current &&
      rLeg.current
    ) {
      const snap = pokeSnap.current;
      snap.stickQ.copy(stick.current.quaternion);
      snap.stickP.copy(stick.current.position);
      snap.bladeQ.copy(bladeGrp.current.quaternion);
      snap.topQ.copy(rArm.current.quaternion);
      snap.topF.copy(rFore.current.quaternion);
      snap.botQ.copy(lArm.current.quaternion);
      snap.botF.copy(lFore.current.quaternion);
      snap.topP.copy(rArm.current.position);
      snap.botP.copy(lArm.current.position);
      snap.pitch = body.current.rotation.x;
      snap.drop = body.current.position.y;
      snap.lThigh = lLeg.current.rotation.x;
      snap.rThigh = rLeg.current.rotation.x;
      snap.lKnee = lShin.current ? lShin.current.rotation.x : 0;
      snap.rKnee = rShin.current ? rShin.current.rotation.x : 0;
      snap.lBoot = lBoot.current ? lBoot.current.rotation.x : 0;
      snap.rBoot = rBoot.current ? rBoot.current.rotation.x : 0;
    }
    if (rSleeve.current) rSleeve.current.rotation.y = !goalie && wrist && wristKey?.flat ? Math.PI / 2 : 0;
    if (rForeSleeve.current) {
      if (!goalie && wrist && wristKey?.flat && rFore.current) {
        // Upper blue is arm-local +X after the sleeve yaw. Match the forearm's +Z to it.
        _ikInv.copy(rFore.current.quaternion).invert();
        _ikN.set(1, 0, 0).applyQuaternion(_ikInv);
        rForeSleeve.current.rotation.y = Math.atan2(_ikN.x, _ikN.z);
      } else rForeSleeve.current.rotation.y = 0;
    }
    if (shadow.current || ring.current) playerShadowCom(body.current ?? g, _shadowCom);
    if (shadow.current) plantRinkShadowAt(shadow.current, _shadowCom.x, _shadowCom.z, goalie ? 1.14 : 1);
    if (ring.current) {
      // Same ice XZ as the shadow, including a holding goalie. seatGoalieRing still runs above for that hold.
      const fit = goalie ? 1.14 : 1;
      plantFlatRinkMark(ring.current, _shadowCom.x, _shadowCom.z, ring.current.scale.x * fit, ring.current.scale.z * fit);
    }
    // Slap aim, arm IK, the lead leg, and the torso plant all run above. Stamp again
    // so every saved rotation and position is the last joint write of the frame.
    // Skater rage blends rage1 into rage2. A goalie smash blends goalieRage1 into goalieRage2.
    // A scored-on goalie with no smash clock stamps goalieRage1 and does not blend.
    // Puck possess blends puckPossess1 into puckPossess2 on the stride clock.
    stampPoseOverride(index, s, poseGroups());
  });

  const selectPoseJoint = (event: ThreeEvent<MouseEvent>) => {
    if (!world.poseEditorActive || !onJointClick || event.delta > 2) return;
    let obj: THREE.Object3D | null = event.object;
    while (obj) {
      const id = obj.userData.poseJoint;
      if (typeof id === "string") {
        event.stopPropagation();
        onJointClick(id);
        return;
      }
      obj = obj.parent;
    }
  };

  return (
    <group ref={root} onClick={onJointClick && world.poseEditorActive ? selectPoseJoint : undefined}>
      <mesh ref={shadow} geometry={shadowGeo} material={mats.shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, SHADOW_ICE_Y, 0]} />
      <group ref={ring} visible={false}>
        {goalie ? <mesh geometry={goalieDiscGeo} material={mats.ringFill} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} /> : null}
        <mesh geometry={goalie ? goalieRingGeo : ringGeo} material={mats.ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} />
      </group>
      <group ref={body}>
        <group name="torsoFrame" position={[0, -torsoPivot, 0]}>
        <group ref={torso} name="torso" position={[0, torsoShift, 0]}>
        <mesh geometry={torsoGeo} material={mats.jersey} position={[0, 1.116 - torsoShift, 0]} scale={[1, 0.75, 1]} castShadow />
        <mesh geometry={numPlane} material={mats.number} position={[0, 1.24 - torsoDrop - torsoShift, -0.13]} rotation={[0, Math.PI, 0]} />

        <group ref={shoulders} name="shoulders" position={[0, 1.45 - torsoDrop - torsoShift, 0]}>
        <group name="shoulderFrame" position={[0, -1.45, 0]}>
        <group ref={head} position={[0, 1.54, 0.02]}>
          <mesh geometry={helmetGeo} material={mats.helmet} position={[0, HELMET_POS_Y, 0]} castShadow />
          {goalie ? <GoalieMask material={mats.cage} /> : null}
        </group>
        <mesh geometry={yokeTopGeo} material={mats.yoke} position={[0, 1.45, 0]} scale={goalie ? [1.12, 1.04, 1] : 1} castShadow />
        <group ref={lArm} position={[-0.237, 1.46, 0.06]}>
          {kit.id === 0 ? (
            <>
              <mesh geometry={upperArmGeo} material={mats.yoke} position={[0, -0.14, 0.055]} scale={[1, 1, 0.5]} castShadow />
              <mesh geometry={upperArmGeo} material={mats.jersey} position={[0, -0.14, -0.015]} scale={[1, 1, 0.5]} castShadow />
            </>
          ) : (
            <mesh geometry={upperArmGeo} material={mats.sleeves} position={[0, -0.14, 0.02]} castShadow />
          )}
          <SleeveStripes kit={kit} mats={mats} />
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
                <group ref={blocker} name="goalieBlocker" position={GOALIE_BLOCKER_POS} rotation={[0.12, 0, 0]}>
                  <mesh geometry={gloveGeo} material={mats.gloves} rotation={BLOCKER_GLOVE_ROLL} castShadow />
                  <mesh geometry={blockerBoardGeo} material={mats.blocker} position={BLOCKER_BOARD_AT} castShadow />
                  <mesh geometry={blockerTrimGeo} material={mats.blocker} position={BLOCKER_TRIM_AT} />
                </group>
                <group ref={stick} position={[0.03, -0.22 + layout.len / 3, 0.05]}>
                  <mesh name="goalieKnob" ref={knobRef} geometry={knobGeo} material={mats.tape} />
                  <group name="goalieShaft" ref={shaftHold} position={[0, -layout.len / 2, 0]} scale={[1, layout.len, 1]}>
                    <mesh geometry={stickShaftGeo} material={mats.stick} position={[0, 0.14, 0]} scale={[1, 0.72, 1]} castShadow />
                    <mesh geometry={goaliePaddleGeo} material={mats.tape} position={[0, -0.355, 0]} scale={[1, 0.58, 1]} castShadow />
                  </group>
                  <group name="goalieBlade" ref={bladeGrp} position={[0, -layout.len, 0]}>
                    <mesh name="goalieIce" geometry={goalieIceGeo} material={mats.tape} position={[0, 0, GOALIE_ICE_CENTER_Z]} castShadow />
                  </group>
                </group>
              </>
            ) : (
              <mesh ref={lGlove} name={SKATER_FIST_GLOVE} geometry={gloveGeo} material={mats.gloves} position={[0.02, -0.28, 0.06]} rotation={[0.4, 0.18, 0.1]} castShadow />
            )}
          </group>
        </group>
        <group ref={rArm} position={[0.217, 1.46, 0.06]}>
          <group ref={rSleeve}>
            {kit.id === 0 ? (
              <>
                <mesh geometry={upperArmGeo} material={mats.yoke} position={[0, -0.14, 0.055]} scale={[1, 1, 0.5]} castShadow />
                <mesh geometry={upperArmGeo} material={mats.jersey} position={[0, -0.14, -0.015]} scale={[1, 1, 0.5]} castShadow />
              </>
            ) : (
              <mesh geometry={upperArmGeo} material={mats.sleeves} position={[0, -0.14, 0.02]} castShadow />
            )}
            <SleeveStripes kit={kit} mats={mats} />
          </group>
          <group ref={rFore} position={[0, -0.28, 0.02]}>
            <group ref={rForeSleeve}>
              {kit.id === 0 ? (
                <>
                  <mesh geometry={forearmGeo} material={mats.yoke} position={[0, -0.13, 0.062]} scale={[1, 1, 0.5]} />
                  <mesh geometry={forearmGeo} material={mats.jersey} position={[0, -0.13, -0.002]} scale={[1, 1, 0.5]} />
                </>
              ) : (
                <mesh geometry={forearmGeo} material={mats.sleeves} position={[0, -0.13, 0.03]} />
              )}
            </group>
            {goalie ? (
              <group ref={catcherGrp} position={CATCHER_PIVOT_LIVE}>
                <Catcher mats={mats} />
              </group>
            ) : (
              <mesh ref={rGlove} name={SKATER_TOP_GLOVE} geometry={gloveGeo} material={mats.gloves} position={[-0.01, -0.28, 0.07]} rotation={[0.5, -0.1, -0.08]} castShadow />
            )}
          </group>
        </group>
        </group>
        </group>
        </group>

        <group ref={hips} name="hips" position={[0, SKATER_HIP_Y, 0]}>
        <group name="hipsFrame" position={[0, -SKATER_HIP_Y, 0]}>
        <mesh geometry={goalie ? pantsGeo : skaterPantsGeo} material={mats.pants} position={[0, goalie ? PANTS_Y_GOALIE : PANTS_Y_SKATER, 0]} castShadow />
        <mesh geometry={pantStripeGeo} material={mats.stripe} position={[-PANT_STRIPE_X, goalie ? PANTS_Y_GOALIE : PANTS_Y_SKATER, 0]} scale={goalie ? [1, PANTS_H / 0.2, 1] : [1, SKATER_PANTS_H / 0.2, 1]} />
        <mesh geometry={pantStripeGeo} material={mats.stripe} position={[PANT_STRIPE_X, goalie ? PANTS_Y_GOALIE : PANTS_Y_SKATER, 0]} scale={goalie ? [1, PANTS_H / 0.2, 1] : [1, SKATER_PANTS_H / 0.2, 1]} />
        <group ref={lLeg} position={[goalie ? -0.14 : -SKATER_HIP_X, goalie ? 0.88 : SKATER_HIP_Y, 0]}>
          {goalie ? (
            <>
              <GoalieThigh side={-1} mats={mats} />
              <group ref={lShin} name="goalieStickPad" position={[0, -0.36, 0]}>
                <mesh geometry={shinGeo} material={mats.socks} position={[0, -0.15, -0.04]} />
                <SockBands mats={mats} z={-0.04} />
                <mesh geometry={goaliePadThighGeo} material={mats.pads} position={[0, 0.14, GOALIE_PAD_FACE_Z]} scale={[1.42 * 0.8, 0.48 * 1.2, 0.3]} castShadow />
                <mesh geometry={goaliePadKneeGeo} material={mats.pads} position={[0, 0.02, GOALIE_PAD_FACE_Z]} scale={[1.42 * 0.8, 1.25 * 1.2, 0.276923]} />
                <mesh name="goalieShinPad" geometry={goaliePadShinGeo} material={mats.pads} position={[-GOALIE_SHIN_LIFT, -GOALIE_SHIN_HALF_L, GOALIE_SHIN_MESH_Z]} castShadow />
                <mesh geometry={goaliePadAnkleGeo} material={mats.pads} position={[0, 0.08, GOALIE_PAD_FACE_Z]} scale={[0.8, 1.2, 0.257143]} />
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
                <SockBands mats={mats} z={0} />
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
              <group ref={rShin} name="goalieGlovePad" position={[0, -0.36, 0]}>
                <mesh geometry={shinGeo} material={mats.socks} position={[0, -0.15, -0.04]} />
                <SockBands mats={mats} z={-0.04} />
                <mesh geometry={goaliePadThighGeo} material={mats.pads} position={[0, 0.14, GOALIE_PAD_FACE_Z]} scale={[1.42 * 0.8, 0.48 * 1.2, 0.3]} castShadow />
                <mesh geometry={goaliePadKneeGeo} material={mats.pads} position={[0, 0.02, GOALIE_PAD_FACE_Z]} scale={[1.42 * 0.8, 1.25 * 1.2, 0.276923]} />
                <mesh name="goalieShinPad" geometry={goaliePadShinGeo} material={mats.pads} position={[GOALIE_SHIN_LIFT, -GOALIE_SHIN_HALF_L, GOALIE_SHIN_MESH_Z]} castShadow />
                <mesh geometry={goaliePadAnkleGeo} material={mats.pads} position={[0, 0.08, GOALIE_PAD_FACE_Z]} scale={[0.8, 1.2, 0.257143]} />
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
                <SockBands mats={mats} z={0} />
                <group ref={rBoot} position={[0, -0.3, 0.04]}>
                  <mesh geometry={bootGeo} material={mats.skates} position={[0, -0.05, 0.02]} />
                  <SkateSole mats={mats} position={[0, -0.12, 0.02]} />
                </group>
              </group>
            </>
          )}
        </group>
        </group>
        </group>
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
              <mesh geometry={skaterBladeGeo} material={mats.stick} castShadow />
              <mesh geometry={skaterTapeGeo} material={mats.tape} />
            </group>
          </group>
          <group ref={flyBlade} visible={false}>
            <mesh geometry={stickShaftGeo} material={mats.stick} position={[0, layout.len * 0.25, 0]} scale={[1, layout.len * 0.5, 1]} />
            <mesh geometry={skaterBladeGeo} material={mats.stick} />
            <mesh geometry={skaterTapeGeo} material={mats.tape} />
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

/** Kit 2 paints this layout with the pants cloth. Other kits use armStripe. */
function SleeveStripes({ kit, mats }: { kit: UniformKit; mats: KitMats }) {
  const material = kit.id === 1 ? mats.pants : mats.armStripe;
  if (!material) return null;
  return (
    <>
      <mesh geometry={armStripeGeo} material={material} position={[0, -0.08, 0.02]} />
      <mesh geometry={armSideStripeGeo} material={material} position={[-0.065, -0.0325, 0.02]} />
      <mesh geometry={armSideStripeGeo} material={material} position={[0.065, -0.0325, 0.02]} />
      <mesh geometry={armEndStripeGeo} material={material} position={[0, -0.0325, -0.055]} />
      <mesh geometry={armEndStripeGeo} material={material} position={[0, -0.0325, 0.095]} />
    </>
  );
}

function SockBands({ mats, z }: { mats: Pick<KitMats, "sockBand" | "sockBandLow">; z: number }) {
  return (
    <>
      <mesh geometry={sockStripeGeo} material={mats.sockBand} position={[0, -0.1, z]} />
      <mesh geometry={sockStripeGeo} material={mats.sockBandLow} position={[0, -0.18, z]} />
    </>
  );
}

function GoalieThigh({ side, mats }: { side: -1 | 1; mats: Pick<KitMats, "pants" | "stripe"> }) {
  return (
    <>
      <mesh geometry={thighGeo} material={mats.pants} position={[0, -0.17, 0]} castShadow />
      <mesh geometry={thighStripeGeo} material={mats.stripe} position={[side * 0.082, -0.17, 0]} />
    </>
  );
}

function SeatedLeg({
  side,
  mats,
  goalie = false,
  thighRef,
  shinRef,
  bootRef,
}: {
  side: -1 | 1;
  mats: KitMats;
  goalie?: boolean;
  thighRef?: RefObject<THREE.Group | null>;
  shinRef?: RefObject<THREE.Group | null>;
  bootRef?: RefObject<THREE.Group | null>;
}) {
  if (goalie) {
    return (
      <group ref={thighRef} position={[side * 0.16, 0.12 * Math.cos(0.08) + 0.02 * Math.sin(0.08) - 0.16, -0.12 * Math.sin(0.08) + 0.02 * Math.cos(0.08) - 0.02]} rotation={[-Math.PI / 2 - 0.08, 0, side * 0.06]}>
        <GoalieThigh side={side} mats={mats} />
        <group ref={shinRef} position={[0, -0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh geometry={shinGeo} material={mats.socks} position={[0, -0.15, -0.04]} />
          <SockBands mats={mats} z={-0.04} />
          <mesh geometry={goaliePadThighGeo} material={mats.pads} position={[0, 0.14, GOALIE_PAD_FACE_Z]} scale={[1.42 * 0.8, 0.48 * 1.2, 0.3]} castShadow />
          <mesh geometry={goaliePadKneeGeo} material={mats.pads} position={[0, 0.02, GOALIE_PAD_FACE_Z]} scale={[1.42 * 0.8, 1.25 * 1.2, 0.276923]} />
          <mesh geometry={goaliePadShinGeo} material={mats.pads} position={[0, -GOALIE_SHIN_HALF_L, GOALIE_SHIN_MESH_Z]} castShadow />
          <mesh geometry={goaliePadAnkleGeo} material={mats.pads} position={[0, -0.34, GOALIE_PAD_FACE_Z]} scale={[0.8, 1.2, 0.257143]} />
          <group ref={bootRef}>
            <mesh geometry={goalieBootGeo} material={mats.skates} position={[0, -0.42, 0.06]} />
            <SkateSole mats={mats} goalie position={[0, -0.48, 0.06]} />
          </group>
        </group>
      </group>
    );
  }
  return (
    <group ref={thighRef} position={[side * 0.19, 0.1 * Math.cos(0.08) + 0.02 * Math.sin(0.08) - 0.16, -0.1 * Math.sin(0.08) + 0.02 * Math.cos(0.08) - 0.02]} rotation={[-Math.PI / 2 - 0.08, 0, side * 0.08]}>
      <mesh geometry={thighGeo} material={mats.pants} position={[0, -0.17, 0]} castShadow />
      <mesh geometry={thighStripeGeo} material={mats.stripe} position={[side * 0.082, -0.17, 0]} />
      <group ref={shinRef} position={[0, -0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh geometry={shinGeo} material={mats.socks} position={[0, -0.15, 0]} />
        <SockBands mats={mats} z={0} />
        <group ref={bootRef} position={[0, -0.3, 0.05]}>
          <mesh geometry={bootGeo} material={mats.skates} position={[0, -0.05, 0.02]} />
          <SkateSole mats={mats} position={[0, -0.12, 0.02]} />
        </group>
      </group>
    </group>
  );
}

/**
 * Seated backup knob-to-heel. The old prop was 1.04 m with the heel at the
 * group origin; shaft and paddle centers are scaled from that frame.
 */
const SEATED_GOALIE_FROM = 1.04;
const SEATED_GOALIE_KNOB_Y = GOALIE_STICK_LEN;
const SEATED_STICK_SCALE = SEATED_GOALIE_KNOB_Y / SEATED_GOALIE_FROM;
const SEATED_SHAFT_Y = 0.665 * SEATED_STICK_SCALE;
const SEATED_SHAFT_SY = 0.71 * SEATED_STICK_SCALE;
const SEATED_PADDLE_Y = 0.175 * SEATED_STICK_SCALE;
const SEATED_PADDLE_SY = 0.58 * SEATED_STICK_SCALE;
const _seatedGoalieKnobOff = new THREE.Vector3(0, SEATED_GOALIE_KNOB_Y, 0).applyQuaternion(
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0.04, Math.PI, 0)),
);

export function SeatedPlayer({
  kit,
  number,
  holdStick = false,
  goalie = false,
  seatX,
  poseId,
  onJointRefs,
  onJointClick,
  posedEpoch = 0,
}: {
  kit: UniformKit;
  number: number;
  holdStick?: boolean;
  goalie?: boolean;
  seatX?: number;
  poseId?: string;
  onJointRefs?: (refs: Record<string, THREE.Object3D | null>) => void;
  onJointClick?: (id: string) => void;
  /** Bumps after a pose bake so the saved joints are stamped again once React commits. */
  posedEpoch?: number;
}) {
  const mats = useMemo(() => makeKitMats(kit, number, goalie), [kit, kit.id, number, goalie]);
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const shoulders = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const lArm = useRef<THREE.Group>(null);
  const lFore = useRef<THREE.Group>(null);
  const lHand = useRef<THREE.Object3D>(null);
  const rArm = useRef<THREE.Group>(null);
  const rFore = useRef<THREE.Group>(null);
  const rHand = useRef<THREE.Object3D>(null);
  const lLeg = useRef<THREE.Group>(null);
  const lShin = useRef<THREE.Group>(null);
  const lBoot = useRef<THREE.Group>(null);
  const rLeg = useRef<THREE.Group>(null);
  const rShin = useRef<THREE.Group>(null);
  const rBoot = useRef<THREE.Group>(null);
  const stick = useRef<THREE.Group>(null);
  const bladeGrp = useRef<THREE.Group>(null);
  // Same local stick on every seat. Bench side does not mirror it toward center ice.
  const seatedStickPos: [number, number, number] = [
    0.72 + _seatedGoalieKnobOff.x,
    0.04 + _seatedGoalieKnobOff.y,
    0.14 + _seatedGoalieKnobOff.z,
  ];
  const torsoPivot = torsoMeshCenterY(kit.id, true);
  const torsoDrop = torsoTopDrop(kit.id);
  const torsoShift = goalie ? torsoPivot : 0;
  const seatPitch = 0.08;
  const torsoRestY = torsoPivot * Math.cos(seatPitch);
  const torsoRestZ = torsoPivot * Math.sin(seatPitch);
  useLayoutEffect(() => () => disposeKit(mats), [mats]);
  useLayoutEffect(() => {
    const group = body.current;
    if (!group) return;
    const prev = group.userData.torsoPivotY;
    group.userData.torsoPivotY = torsoPivot;
    if (torso.current) torso.current.userData.torsoCentered = goalie ? 1 : 0;
    if (typeof prev === "number") {
      group.position.add(new THREE.Vector3(0, torsoPivot - prev, 0).applyQuaternion(group.quaternion));
    } else group.position.set(0, torsoRestY, torsoRestZ);
  }, [goalie, torsoPivot, torsoRestY, torsoRestZ]);
  const poseGroups = (): Partial<Record<PoseJointId, THREE.Object3D | null>> => ({
    body: body.current,
    torso: torso.current,
    hips: hips.current,
    shoulders: shoulders.current,
    head: head.current,
    lArm: lArm.current,
    lFore: lFore.current,
    lHand: lHand.current,
    rArm: rArm.current,
    rFore: rFore.current,
    rHand: rHand.current,
    lLeg: lLeg.current,
    lShin: lShin.current,
    lBoot: lBoot.current,
    rLeg: rLeg.current,
    rShin: rShin.current,
    rBoot: rBoot.current,
    stick: stick.current,
    bladeGrp: bladeGrp.current,
  });
  useLayoutEffect(() => {
    const groups = poseGroups();
    if (onJointClick && world.poseEditorActive) {
      for (const [id, obj] of Object.entries(groups)) {
        if (obj) obj.userData.poseJoint = id;
      }
    }
    if (goalie && stick.current) setGoalieKnobShift(stick.current, 0, SEATED_GOALIE_KNOB_Y, 0);
    onJointRefs?.(groups);
    return () => {
      for (const obj of Object.values(groups)) {
        if (obj) delete obj.userData.poseJoint;
      }
    };
  }, [goalie, onJointClick, onJointRefs]);
  useLayoutEffect(() => {
    if (!onJointRefs || !posedEpoch || !world.poseEditorActive || !poseId) return;
    releaseStickFromHand(stick.current);
    applyPoseJoints(poseId, poseGroups());
  }, [onJointRefs, poseId, posedEpoch]);
  useFrame(() => {
    if (world.poseEditorActive || world.poseEditorLock) return;
    const g = body.current;
    if (!g) return;
    g.rotation.x = seatPitch;
    g.rotation.z = 0;
    if (poseId) applyPoseJoints(poseId, poseGroups());
    const d = world.benchDump;
    const near = seatX !== undefined && !!d && (d.phase !== "fly" || d.t > d.dur * 0.45) && ((d.kind === "help" && seatX > 0.4) || (d.kind === "shove" && seatX < -0.4)) && Math.abs(seatX - d.x1) < 2.8;
    if (!near || !d) return;
    if (d.kind === "help") {
      g.rotation.x = seatPitch + 0.38 + Math.sin(world.time * 5.2) * 0.12;
      g.rotation.z = Math.sin(world.time * 3.4) * 0.05;
    } else {
      const jab = Math.max(0, Math.sin(world.time * 11));
      g.rotation.x = seatPitch + jab * 0.62;
      g.rotation.z = Math.sin(world.time * 11) * 0.16;
    }
  });
  const selectPoseJoint = (event: ThreeEvent<MouseEvent>) => {
    if (!world.poseEditorActive || !onJointClick || event.delta > 2) return;
    let obj: THREE.Object3D | null = event.object;
    while (obj) {
      const id = obj.userData.poseJoint;
      if (typeof id === "string") {
        event.stopPropagation();
        onJointClick(id);
        return;
      }
      obj = obj.parent;
    }
  };
  return (
    <group onClick={onJointClick && world.poseEditorActive ? selectPoseJoint : undefined}>
      {poseId === "bench" || poseId === "goalieBench" ? null : (
        <mesh geometry={shadowGeo} material={mats.shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0.18]} scale={[0.9, 1.15, 0.7]} />
      )}
      <group ref={body} rotation={[seatPitch, 0, 0]}>
        <group name="torsoFrame" position={[0, -torsoPivot, 0]}>
        <group ref={torso} name="torso" position={[0, torsoShift, 0]}>
        <mesh geometry={torsoGeo} material={mats.jersey} position={[0, 0.456 - torsoShift, 0]} scale={[1, 0.75, 1]} castShadow />
        <mesh geometry={numPlane} material={mats.number} position={[0, 0.58 - torsoDrop - torsoShift, -0.13]} rotation={[0, Math.PI, 0]} />

        <group ref={shoulders} name="shoulders" position={[0, 0.8 - torsoDrop - torsoShift, 0.02]}>
        <group name="shoulderFrame" position={[0, -0.8, -0.02]}>
        <group ref={head} position={[0, 0.88, 0.04]}>
          <mesh geometry={helmetGeo} material={mats.helmet} position={[0, HELMET_POS_Y, 0]} castShadow />
          {goalie ? <GoalieMask material={mats.cage} /> : null}
        </group>
        <mesh geometry={yokeTopGeo} material={mats.yoke} position={[0, 0.8, 0]} scale={goalie ? [0.53 / 0.61, 1, 1] : 1} castShadow />
        <group ref={lArm} position={[-0.257, 0.76, 0.02]} rotation={[0.25, -0.2, -0.6]}>
          {kit.id === 0 ? (
            <>
              <mesh geometry={upperArmGeo} material={mats.yoke} position={[0, -0.14, 0.055]} scale={[1, 1, 0.5]} castShadow />
              <mesh geometry={upperArmGeo} material={mats.jersey} position={[0, -0.14, -0.015]} scale={[1, 1, 0.5]} castShadow />
            </>
          ) : (
            <mesh geometry={upperArmGeo} material={mats.sleeves} position={[0, -0.14, 0.02]} castShadow />
          )}
          <SleeveStripes kit={kit} mats={mats} />
          <group ref={lFore} position={[0, -0.28, 0.02]} rotation={[-1, 0.2, 0.4]}>
            {kit.id === 0 ? (
              <>
                <mesh geometry={forearmGeo} material={mats.yoke} position={[0, -0.13, 0.062]} scale={[1, 1, 0.5]} />
                <mesh geometry={forearmGeo} material={mats.jersey} position={[0, -0.13, -0.002]} scale={[1, 1, 0.5]} />
              </>
            ) : (
              <mesh geometry={forearmGeo} material={mats.sleeves} position={[0, -0.13, 0.03]} />
            )}
            {goalie ? (
              <group ref={lHand} position={GOALIE_BLOCKER_POS}>
                <group name="goalieBlocker" position={GOALIE_BLOCKER_IN_HAND} rotation={[0.12, 0, 0]}>
                  <mesh geometry={gloveGeo} material={mats.gloves} position={BLOCKER_GLOVE_SEATED} rotation={BLOCKER_GLOVE_ROLL} castShadow />
                  <mesh geometry={blockerBoardGeo} material={mats.blocker} position={BLOCKER_BOARD_SEATED} castShadow />
                  <mesh geometry={blockerTrimGeo} material={mats.blocker} position={BLOCKER_TRIM_SEATED} />
                </group>
              </group>
            ) : (
              <mesh ref={lHand} geometry={gloveGeo} material={mats.gloves} position={[0.02, -0.28, 0.04]} rotation={[0.35, 0.1, 0.08]} castShadow />
            )}
          </group>
        </group>
        <group ref={rArm} position={[0.257, 0.76, 0.02]} rotation={[0.25, 0.2, 0.6]}>
          {kit.id === 0 ? (
            <>
              <mesh geometry={upperArmGeo} material={mats.yoke} position={[0, -0.14, 0.055]} scale={[1, 1, 0.5]} castShadow />
              <mesh geometry={upperArmGeo} material={mats.jersey} position={[0, -0.14, -0.015]} scale={[1, 1, 0.5]} castShadow />
            </>
          ) : (
            <mesh geometry={upperArmGeo} material={mats.sleeves} position={[0, -0.14, 0.02]} castShadow />
          )}
          <SleeveStripes kit={kit} mats={mats} />
          <group ref={rFore} position={[0, -0.28, 0.02]} rotation={[-1, -0.2, -0.4]}>
            {kit.id === 0 ? (
              <>
                <mesh geometry={forearmGeo} material={mats.yoke} position={[0, -0.13, 0.062]} scale={[1, 1, 0.5]} />
                <mesh geometry={forearmGeo} material={mats.jersey} position={[0, -0.13, -0.002]} scale={[1, 1, 0.5]} />
              </>
            ) : (
              <mesh geometry={forearmGeo} material={mats.sleeves} position={[0, -0.13, 0.03]} />
            )}
            {goalie ? (
              <group ref={rHand} position={CATCHER_PIVOT_SEAT}>
                <Catcher mats={mats} seated />
              </group>
            ) : (
              <mesh ref={rHand} geometry={gloveGeo} material={mats.gloves} position={[-0.01, -0.28, 0.05]} rotation={[0.4, -0.08, -0.06]} castShadow />
            )}
          </group>
        </group>
        </group>
        </group>
        <group rotation={[-seatPitch, 0, 0]} position={[0, -torsoShift, 0]}>
      {goalie ? (
        <group ref={stick} position={seatedStickPos} rotation={[0.04, Math.PI, 0]}>
          <mesh name="goalieKnob" geometry={knobGeo} material={mats.tape} />
          <mesh geometry={stickShaftGeo} material={mats.stick} position={[0, SEATED_SHAFT_Y - SEATED_GOALIE_KNOB_Y, 0]} scale={[1, SEATED_SHAFT_SY, 1]} />
          <mesh geometry={goaliePaddleGeo} material={mats.tape} position={[0, SEATED_PADDLE_Y - SEATED_GOALIE_KNOB_Y, 0]} scale={[1, SEATED_PADDLE_SY, 1]} />
          <group ref={bladeGrp} position={[0, -SEATED_GOALIE_KNOB_Y, 0]}>
            <mesh geometry={goalieIceGeo} material={mats.tape} position={[0, 0, GOALIE_ICE_CENTER_Z]} />
          </group>
        </group>
      ) : (
        <group ref={stick} position={[holdStick ? -0.58 : 0.58, 0.05, 0.16]} rotation={[0.06, Math.PI, 0]}>
          <group position={[0, 0.59, 0]} scale={[1, 1.18, 1]}>
            <mesh geometry={stickShaftGeo} material={mats.stick} />
          </group>
          <mesh geometry={knobGeo} material={mats.tape} position={[0, 1.18, 0]} />
          <group ref={bladeGrp}>
            <mesh geometry={skaterBladeGeo} material={mats.stick} />
            <mesh geometry={skaterTapeGeo} material={mats.tape} />
          </group>
        </group>
      )}
        </group>
        </group>
        <group ref={hips} name="hips" position={[0, 0.16, 0.02]}>
          <mesh geometry={goalie ? pantsGeo : skaterPantsGeo} material={mats.pants} position={[0, goalie ? PANTS_Y_SEAT : PANTS_Y_SEAT_SKATER, 0]} castShadow />
          <mesh geometry={pantStripeGeo} material={mats.stripe} position={[-PANT_STRIPE_X, goalie ? PANTS_Y_SEAT : PANTS_Y_SEAT_SKATER, 0]} scale={goalie ? [1, PANTS_H / 0.2, 1] : [1, SKATER_PANTS_H / 0.2, 1]} />
          <mesh geometry={pantStripeGeo} material={mats.stripe} position={[PANT_STRIPE_X, goalie ? PANTS_Y_SEAT : PANTS_Y_SEAT_SKATER, 0]} scale={goalie ? [1, PANTS_H / 0.2, 1] : [1, SKATER_PANTS_H / 0.2, 1]} />
          <SeatedLeg side={-1} mats={mats} goalie={goalie} thighRef={lLeg} shinRef={lShin} bootRef={lBoot} />
          <SeatedLeg side={1} mats={mats} goalie={goalie} thighRef={rLeg} shinRef={rShin} bootRef={rBoot} />
        </group>
        </group>
      </group>
    </group>
  );
}

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
const REF_SHIN = new THREE.Vector3(0, -0.32, 0);
const REF_BOOT = new THREE.Vector3(0, -0.3, 0.04);
const REF_FORE = new THREE.Vector3(0, -0.28, 0.02);
const _refHip = new THREE.Vector3();

function restRefRig(body: THREE.Group, lLeg: THREE.Group, rLeg: THREE.Group, shadow: THREE.Mesh | null) {
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  lLeg.position.set(-0.13, REF_HIP, 0);
  lLeg.rotation.set(0, 0, 0);
  rLeg.position.set(0.13, REF_HIP, 0);
  rLeg.rotation.set(0, 0, 0);
  if (shadow) shadow.position.set(0, SHADOW_ICE_Y, 0);
}

function restRefShin(shin: THREE.Group | null, boot: THREE.Group | null) {
  if (shin) {
    shin.position.copy(REF_SHIN);
    shin.quaternion.identity();
    shin.rotation.set(0, 0, 0);
  }
  if (boot) {
    boot.position.copy(REF_BOOT);
    boot.quaternion.identity();
    boot.rotation.set(0, 0, 0);
  }
}

function restRefArm(arm: THREE.Group | null, fore: THREE.Group | null, x: number) {
  if (arm) {
    arm.position.set(x, 1.46, 0);
    arm.scale.set(1, 1, 1);
    arm.quaternion.identity();
    arm.rotation.set(0.25, 0, 0);
  }
  if (fore) {
    fore.position.copy(REF_FORE);
    fore.quaternion.identity();
    fore.rotation.set(0, 0, 0);
    fore.scale.set(1, 1, 1);
  }
}

/** Same absorb weight a checked skater uses: full from struck 0.9 down through 0.2. */
function refAbsorbK(struck: number): number {
  if (struck <= 0.2) return 0;
  return smooth01(Math.min(1, (Math.min(struck, 1.15) - 0.2) / 0.7));
}

function poseRefLeg(leg: THREE.Group, shin: THREE.Group | null, boot: THREE.Group | null, x: number, thigh: number, knee: number, bootX: number, roll: number) {
  leg.position.set(x, REF_HIP, 0);
  leg.rotation.set(thigh, 0, roll);
  if (shin) {
    shin.position.copy(REF_SHIN);
    shin.rotation.set(knee, 0, 0);
  }
  if (boot) {
    boot.position.copy(REF_BOOT);
    boot.rotation.set(bootX, 0, 0);
  }
}

/**
 * Checked referee. Same windows as a skater: absorb, then tumbleRoot knockout, then recover.
 * Saved player joints stamp last. The body is the feet frame, so thigh rotation does not add body pitch.
 */
function poseRefChecked(
  r: Referee,
  root: THREE.Group,
  body: THREE.Group,
  lArm: THREE.Group | null,
  lFore: THREE.Group | null,
  rArm: THREE.Group | null,
  rFore: THREE.Group | null,
  lLeg: THREE.Group,
  lShin: THREE.Group | null,
  lBoot: THREE.Group | null,
  rLeg: THREE.Group,
  rShin: THREE.Group | null,
  rBoot: THREE.Group | null,
  shadow: THREE.Mesh | null,
): boolean {
  const pose = checkedCyclePose(r.struck, r.tumble);
  if (!pose) return false;
  if (pose === "absorb") {
    const absorbK = refAbsorbK(r.struck);
    const sink = Math.max(0, 0.04 - 0.04 * Math.min(1, r.struck));
    root.position.set(r.x, sink, r.z);
    root.rotation.set(0, r.yaw + Math.PI, 0);
    const pitch = RECV_PITCH * absorbK;
    const knee = 0.24 + (RECV_KNEE - 0.24) * absorbK;
    const planted = checkPlant(pitch, knee, RECV_DORSI);
    const drop = planted.drop * absorbK;
    const bz = -Math.sin(pitch) * SKATER_HIP_Y * absorbK;
    body.position.set(0, drop, bz);
    body.rotation.set(pitch, 0, 0);
    const bootX = checkBoot(pitch, planted.thigh, knee, RECV_DORSI);
    poseRefLeg(lLeg, lShin, lBoot, -0.13, planted.thigh * absorbK, knee * absorbK, bootX * absorbK, 0);
    poseRefLeg(rLeg, rShin, rBoot, 0.13, planted.thigh * absorbK, knee * absorbK, bootX * absorbK, 0);
    restRefArm(lArm, lFore, -0.24);
    restRefArm(rArm, rFore, 0.24);
  } else {
    const t = tumbleRoot(r.struck, r.tumble, r.yaw);
    root.position.set(r.x, t.y, r.z);
    root.rotation.set(t.rx, t.ry, t.rz);
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    const u = Math.min(1, Math.max(0, 1 - r.struck / TUMBLE_STRIKE));
    const tuck = u * u * (3 - 2 * u);
    poseRefLeg(lLeg, lShin, lBoot, -0.13, 0.05 + 0.8 * tuck, 0.25 + 0.45 * tuck, -0.16 + 0.26 * tuck, -0.22 * tuck);
    poseRefLeg(rLeg, rShin, rBoot, 0.13, 0.05 + 1.1 * tuck, 0.25 + 0.6 * tuck, -0.16 + 0.28 * tuck, 0.28 * tuck);
    if (pose === "knockout") {
      if (lArm) {
        lArm.position.set(-0.26, 1.46, 0.06);
        lArm.scale.set(1, 1, 1);
        lArm.rotation.set(0.7, -0.25, 0.15);
      }
      if (rArm) {
        rArm.position.set(0.24, 1.46, 0.06);
        rArm.scale.set(1, 1, 1);
        rArm.rotation.set(-0.45, 0.35, -0.4);
      }
      if (lFore) {
        lFore.position.copy(REF_FORE);
        lFore.scale.set(1, 1, 1);
        lFore.rotation.set(-0.85, 0, 0);
      }
      if (rFore) {
        rFore.position.copy(REF_FORE);
        rFore.scale.set(1, 1, 1);
        rFore.rotation.set(-0.55, 0, 0);
      }
    } else {
      restRefArm(lArm, lFore, -0.24);
      restRefArm(rArm, rFore, 0.24);
    }
  }
  applyPoseJoints(pose, {
    body,
    lArm,
    lFore,
    rArm,
    rFore,
    lLeg,
    lShin,
    lBoot,
    rLeg,
    rShin,
    rBoot,
  });
  if (shadow) {
    root.updateWorldMatrix(true, true);
    _refHip.set(0, REF_HIP, 0);
    body.localToWorld(_refHip);
    plantRinkShadowAt(shadow, _refHip.x, _refHip.z, 1);
  }
  return true;
}

export function RefereeMesh({ slot = 0 }: { slot?: 0 | 1 | 2 | 3 }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
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
    const r =
      slot === 0 ? world.ref : slot === 1 ? world.ref2 : slot === 2 ? world.ref3 : world.ref4;
    const g = root.current;
    const b = body.current;
    const ll = lLeg.current;
    const rl = rLeg.current;
    if (!g || !b || !ll || !rl) return;
    if (
      poseRefChecked(
        r,
        g,
        b,
        lArm.current,
        lFore.current,
        rArm.current,
        rFore.current,
        ll,
        lShin.current,
        lBoot.current,
        rl,
        rShin.current,
        rBoot.current,
        shadow.current,
      )
    ) {
      return;
    }
    g.position.set(r.x, 0, r.z);
    g.rotation.set(0, r.yaw + Math.PI, 0);
    restRefRig(b, ll, rl, shadow.current);
    restRefShin(lShin.current, lBoot.current);
    restRefShin(rShin.current, rBoot.current);
    restRefArm(lArm.current, lFore.current, -0.24);
    restRefArm(rArm.current, rFore.current, 0.24);
    if (r.pose === "drop") {
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
    if (shadow.current) plantRinkShadow(shadow.current, 0, 0, 1);
  });

  return (
    <group ref={root}>
      <mesh ref={shadow} geometry={refShadowGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, SHADOW_ICE_Y, 0]}>
        <meshBasicMaterial color="#000000" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <group ref={body}>
          <mesh geometry={refNeck} material={mats.white} position={[0, 1.52, 0.02]} />
          <mesh geometry={refHelmet} material={mats.helm} position={[0, 1.62, 0.02]} />
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
            <group ref={lFore} position={[0, -0.28, 0.02]}>
              <mesh geometry={gloveGeo} material={mats.black} position={[0, -0.16, 0]} />
            </group>
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
            <group ref={rFore} position={[0, -0.28, 0.02]}>
              <mesh geometry={gloveGeo} material={mats.black} position={[0, -0.16, 0]} />
            </group>
          </group>
          <group ref={lLeg} position={[-0.13, REF_HIP, 0]}>
            <mesh geometry={refLeg} material={mats.pants} position={[0, 0.55 - REF_HIP, 0]} />
            <group ref={lShin} position={[0, -0.32, 0]}>
              <group ref={lBoot} position={[0, -0.3, 0.04]}>
                <mesh geometry={refBoot} material={mats.helm} position={[0, 0.06, 0]} />
                <SkateSole mats={{ blade: mats.blade, skates: mats.helm, mask: mats.mask }} position={[0, -0.01, 0]} />
              </group>
            </group>
          </group>
          <group ref={rLeg} position={[0.13, REF_HIP, 0]}>
            <mesh geometry={refLeg} material={mats.pants} position={[0, 0.55 - REF_HIP, 0]} />
            <group ref={rShin} position={[0, -0.32, 0]}>
              <group ref={rBoot} position={[0, -0.3, 0.04]}>
                <mesh geometry={refBoot} material={mats.helm} position={[0, 0.06, 0]} />
                <SkateSole mats={{ blade: mats.blade, skates: mats.helm, mask: mats.mask }} position={[0, -0.01, 0]} />
              </group>
            </group>
          </group>
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
