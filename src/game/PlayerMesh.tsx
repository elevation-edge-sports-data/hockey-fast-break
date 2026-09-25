import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createNumberTexture } from "./iceTexture";
import { cheerFor, defendDir, drillFade, rageDraw, world, type Skater } from "./sim";
import { kitById, type UniformKit } from "./uniforms";
import { useGame } from "./store";
import { BLUE_X, GOAL_H } from "./rink";

export const USER_MARK_INNER = 0.44;
export const USER_MARK_OUTER = 0.54;

const helmetGeo = new THREE.SphereGeometry(0.132, 18, 14);
const neckGeo = new THREE.CylinderGeometry(0.07, 0.085, 0.14, 10);
const visorGeo = new THREE.BoxGeometry(0.2, 0.07, 0.08);
const torsoGeo = new THREE.BoxGeometry(0.44, 0.64, 0.3);
const yokeGeo = new THREE.BoxGeometry(0.16, 0.12, 0.26);
const yokeChestGeo = new THREE.BoxGeometry(0.46, 0.13, 0.32);
const pantsGeo = new THREE.BoxGeometry(0.36, 0.2, 0.24);
const pantStripeGeo = new THREE.BoxGeometry(0.012, 0.2, 0.08);
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
const goaliePadShinGeo = new THREE.BoxGeometry(0.24, 0.4, 0.12);
const goalieBootGeo = new THREE.BoxGeometry(0.16, 0.09, 0.28);
const maskPlateGeo = new THREE.BoxGeometry(0.24, 0.2, 0.07);
const maskBarH = new THREE.BoxGeometry(0.2, 0.016, 0.016);
const maskBarV = new THREE.BoxGeometry(0.016, 0.16, 0.016);
const catcherPalmGeo = new THREE.BoxGeometry(0.26, 0.24, 0.11);
const catcherWebGeo = new THREE.BoxGeometry(0.16, 0.2, 0.04);
const catcherCuffGeo = new THREE.BoxGeometry(0.14, 0.1, 0.13);
const catcherThumbGeo = new THREE.BoxGeometry(0.08, 0.17, 0.08);
const catcherPocketGeo = new THREE.BoxGeometry(0.12, 0.11, 0.04);
const catcherPocketNetGeo = new THREE.PlaneGeometry(0.11, 0.12, 4, 4);
const catcherLaceH = new THREE.BoxGeometry(0.1, 0.005, 0.005);
const catcherLaceV = new THREE.BoxGeometry(0.005, 0.1, 0.005);
const blockerBoardGeo = new THREE.BoxGeometry(0.055, 0.36, 0.18);
const blockerCuffGeo = new THREE.BoxGeometry(0.14, 0.12, 0.18);
const stickShaftGeo = new THREE.CylinderGeometry(0.009, 0.014, 1, 8);
const bladePlateGeo = new THREE.BoxGeometry(0.075, 0.052, 0.38);
const bladeToeGeo = new THREE.BoxGeometry(0.06, 0.048, 0.08);
const heelJoinGeo = new THREE.BoxGeometry(0.04, 0.05, 0.08);
const paddleGeo = new THREE.BoxGeometry(0.09, 0.2, 0.4);
const paddleThroatGeo = new THREE.BoxGeometry(0.05, 0.1, 0.12);
const knobGeo = new THREE.SphereGeometry(0.02, 8, 8);
const numPlane = new THREE.PlaneGeometry(0.28, 0.28);
const shadowGeo = new THREE.CircleGeometry(0.42, 16);
const puckDiscGeo = new THREE.CircleGeometry(0.15, 28);
const puckRingGeo = new THREE.RingGeometry(0.15, 0.22, 32);
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
const _euler = new THREE.Euler();
const STICK_ICE_Y = 0.03;
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
  catcherMesh: THREE.MeshStandardMaterial;
  pads: THREE.MeshStandardMaterial;
  mask: THREE.MeshStandardMaterial;
  numberMap: THREE.CanvasTexture;
};

function makeKitMats(kit: UniformKit, num: number, goalie = false): KitMats {
  const numberMap = createNumberTexture(num, kit.number, kit.numberOutline);
  const pad = kit.jersey;
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
    jersey: mat(kit.jersey, { roughness: 0.48, envMapIntensity: 1.4, emissive: kit.jersey, emissiveIntensity: 0.28 }),
    yoke: mat(kit.yoke, { roughness: 0.46, envMapIntensity: 1.4, emissive: kit.yoke, emissiveIntensity: 0.26 }),
    sleeves: mat(kit.sleeves, { roughness: 0.48, envMapIntensity: 1.4, emissive: kit.sleeves, emissiveIntensity: 0.28 }),
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
    stripe: mat(kit.stripe, { roughness: 0.48, envMapIntensity: 1.4, emissive: kit.stripe, emissiveIntensity: 0.3 }),
    socks: mat(kit.socks, { roughness: 0.5, envMapIntensity: 1.3, emissive: kit.socks, emissiveIntensity: 0.24 }),
    gloves: mat(kit.gloves, { roughness: 0.48, envMapIntensity: 1.25, emissive: kit.gloves, emissiveIntensity: 0.2 }),
    skates: mat(kit.skates, { roughness: 0.4, metalness: 0.12 }),
    blade: mat("#c5ccd4", { roughness: 0.38, metalness: 0.28, emissive: "#9aa3ab", emissiveIntensity: 0.22 }),
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
    catcherMesh: new THREE.MeshStandardMaterial({
      color: goalie ? pad : "#cbb896",
      roughness: 0.7,
      metalness: 0.12,
      wireframe: true,
    }),
    pads: mat(pad, { roughness: 0.48, envMapIntensity: 1.25, emissive: pad, emissiveIntensity: 0.22 }),
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
  const len = goalie ? 1.02 : 1.66;
  const heel: [number, number, number] = [0, 0, 0];
  const top: [number, number, number] = [0, len, 0];
  const bot: [number, number, number] = [0, len * 0.42, 0];
  const mid: [number, number, number] = [0, len * 0.5, 0];
  const quat = new THREE.Quaternion();
  return { heel, top, bot, mid, quat, len };
}

function poseSlapStick(g: THREE.Group, t: number) {
  const u = t < 0 ? t + 1 : t;
  const s = u * u * (3 - 2 * u);
  let bx: number;
  let by: number;
  let bz: number;
  let dx: number;
  let dy: number;
  let dz: number;
  if (t < 0) {
    const a = 1 - s;
    const b = s;
    bx = 0.56 * a + 0.22 * b;
    by = 1.48 * a + 0.05 * b;
    bz = -0.52 * a + 0.58 * b;
    dx = -0.34 * a - 0.08 * b;
    dy = -0.36 * a + 1.02 * b;
    dz = 0.52 * a - 0.34 * b;
  } else {
    const a = 1 - s;
    const b = s;
    bx = 0.22 * a - 0.44 * b;
    by = 0.05 * a + 1.46 * b;
    bz = 0.58 * a + 0.5 * b;
    dx = -0.08 * a + 0.48 * b;
    dy = 1.02 * a - 0.3 * b;
    dz = -0.34 * a - 0.32 * b;
  }
  _ikD1.set(dx, dy, dz);
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0, 1, 0);
  else _ikD1.normalize();
  g.quaternion.setFromUnitVectors(_fromY, _ikD1);
  g.position.set(bx, by, bz);
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

function poseArmIk(
  arm: THREE.Group,
  fore: THREE.Group | null,
  sx: number,
  sy: number,
  sz: number,
  tx: number,
  ty: number,
  tz: number,
  poleSign: number,
  allowFront = false,
  fitGlove = false,
) {
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

function poseStickFromHands(
  stick: THREE.Group,
  parent: THREE.Group,
  lFore: THREE.Group,
  rFore: THREE.Group | null,
  layout: { top: [number, number, number]; heel: [number, number, number]; len: number },
  poke: boolean,
  plant = true,
) {
  parent.updateWorldMatrix(true, false);
  lFore.updateWorldMatrix(true, false);
  _handTop.set(0.02, -0.28, 0.06);
  lFore.localToWorld(_handTop);
  parent.worldToLocal(_handTop);
  if (poke || !rFore) {
    _ikD1.set(0.18, -0.95, 0.42).normalize();
    stick.quaternion.setFromUnitVectors(_fromY, _ikD1);
    _ikD2.set(layout.top[0], layout.top[1], layout.top[2]).applyQuaternion(stick.quaternion);
    stick.position.set(_handTop.x - _ikD2.x, _handTop.y - _ikD2.y, _handTop.z - _ikD2.z);
    return;
  }
  rFore.updateWorldMatrix(true, false);
  _handBot.set(-0.01, -0.28, 0.07);
  rFore.localToWorld(_handBot);
  parent.worldToLocal(_handBot);
  if (_handTop.y < _handBot.y + 0.28) _handTop.y = _handBot.y + 0.32;
  _ikD1.set(_handTop.x - _handBot.x, _handTop.y - _handBot.y, _handTop.z - _handBot.z);
  if (_ikD1.y < 0.2) _ikD1.y = 0.2;
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(-0.06, 1, 0.12);
  _ikD1.normalize();
  const botT = 0.56;
  let heelFromBot = layout.len * botT;
  if (plant) {
    const ice = 0.048;
    const ay = Math.max(0.42, Math.min(0.92, (_handBot.y - ice) / Math.max(0.22, heelFromBot)));
    const xz = Math.hypot(_ikD1.x, _ikD1.z) || 0.18;
    const rest = Math.sqrt(Math.max(0.08, 1 - ay * ay));
    _ikD1.x *= rest / xz;
    _ikD1.z *= rest / xz;
    _ikD1.y = ay;
    _ikD1.normalize();
    heelFromBot = (_handBot.y - ice) / Math.max(0.2, _ikD1.y);
    stick.quaternion.setFromUnitVectors(_fromY, _ikD1);
    stick.position.set(
      _handBot.x - _ikD1.x * heelFromBot,
      ice,
      _handBot.z - _ikD1.z * heelFromBot,
    );
    return;
  }
  stick.quaternion.setFromUnitVectors(_fromY, _ikD1);
  stick.position.set(
    _handBot.x - _ikD1.x * heelFromBot,
    _handBot.y - _ikD1.y * heelFromBot,
    _handBot.z - _ikD1.z * heelFromBot,
  );
}

function poseStickToPuck(
  stick: THREE.Group,
  root: THREE.Group,
  hasPuck: boolean,
  dekeA: number,
) {
  root.updateWorldMatrix(true, false);
  _ikTo.set(world.puck.x, world.puck.y, world.puck.z);
  root.worldToLocal(_ikTo);
  let bx = _ikTo.x + dekeA * 0.3;
  let bz = _ikTo.z;
  const dist = Math.hypot(bx, bz);
  const reach = hasPuck ? 1.02 : 0.92;
  if (dist > reach && dist > 1e-4) {
    bx *= reach / dist;
    bz *= reach / dist;
  }
  if (!hasPuck && dist > 1.5) {
    const ang = Math.atan2(_ikTo.x, Math.max(0.15, _ikTo.z));
    bx = Math.sin(ang) * 0.34 + dekeA * 0.14;
    bz = 0.46;
  }
  bx = Math.max(0.14, Math.min(0.34, bx));
  bz = Math.max(0.5, Math.min(0.78, bz));
  const by = 0.048;
  const hx = 0.18;
  const hy = 1.16;
  const hz = 0.28;
  _ikD1.set(hx - bx, hy - by, hz - bz);
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0.05, 1, -0.2);
  _ikD1.normalize();
  _ikD2.set(_ikTo.x - bx, 0, _ikTo.z - bz);
  if (_ikD2.lengthSq() < 1e-4) _ikD2.set(-_ikD1.z, 0, _ikD1.x);
  _ikD2.addScaledVector(_ikD1, -_ikD2.dot(_ikD1));
  if (_ikD2.lengthSq() < 1e-6) _ikD2.set(0, 0, 1);
  _ikD2.normalize();
  _ikN.crossVectors(_ikD1, _ikD2);
  if (_ikN.lengthSq() < 1e-6) _ikN.set(1, 0, 0);
  _ikN.normalize();
  _ikD2.crossVectors(_ikN, _ikD1).normalize();
  _stickM.makeBasis(_ikN, _ikD1, _ikD2);
  stick.quaternion.setFromRotationMatrix(_stickM);
  stick.position.set(bx, by, bz);
}

function poseStickOneHand(
  stick: THREE.Group,
  parent: THREE.Group,
  hand: THREE.Group,
  layout: { len: number },
) {
  parent.updateWorldMatrix(true, false);
  hand.updateWorldMatrix(true, false);
  _handTop.set(-0.01, -0.28, 0.07);
  hand.localToWorld(_handTop);
  parent.worldToLocal(_handTop);
  const grip = layout.len * 0.86;
  const drop = _handTop.y - 0.05;
  const horiz = drop < grip ? Math.sqrt(Math.max(0.04, grip * grip - drop * drop)) : 0.22;
  const bx = _handTop.x + horiz * 0.92;
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

function poseGloveAt(
  body: THREE.Group,
  arm: THREE.Group,
  fore: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  gx: number,
  gy: number,
  gz: number,
  poleSign: number,
): void {
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

function cheerNeutral(
  body: THREE.Group,
  arm: THREE.Group,
  fore: THREE.Group,
  side: -1 | 1,
): void {
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

function bestMeet(
  a: Skater,
  b: Skater,
  yWant: number,
): { x: number; y: number; z: number; handA: 0 | 1; handB: 0 | 1 } {
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
  p: { x: number; y: number; z: number; rx: number; ry: number; rz: number; dx: number; dy: number; dz: number },
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

function poseRage(
  s: Skater,
  root: THREE.Group,
  body: THREE.Group | null,
  lArm: THREE.Group,
  rArm: THREE.Group,
  lFore: THREE.Group | null,
  rFore: THREE.Group | null,
  stick: THREE.Group,
  shaft: THREE.Group,
  blade: THREE.Group,
  knob: THREE.Object3D,
  flyBlade: THREE.Group,
  flyShaft: THREE.Group,
  layout: { len: number },
  view: NonNullable<ReturnType<typeof rageDraw>>,
) {
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

function poseCheer(
  s: Skater,
  body: THREE.Group,
  lArm: THREE.Group,
  rArm: THREE.Group,
  lFore: THREE.Group | null,
  rFore: THREE.Group | null,
): void {
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
  aim(
    side,
    cockX + (mx - cockX) * open,
    cockY + (my - cockY) * open,
    cockZ + (mz - cockZ) * open,
  );
}

function poseGoalieCheer(
  s: Skater,
  body: THREE.Group,
  lArm: THREE.Group,
  rArm: THREE.Group,
  lFore: THREE.Group | null,
  rFore: THREE.Group | null,
  stick: THREE.Group | null,
) {
  body.position.y = 0;
  body.rotation.set(-0.1, 0, 0);
  const pump = (Math.sin(world.time * 5.4 + s.id) + 1) * 0.5;
  lArm.position.set(-0.36, 1.48, 0.08);
  rArm.position.set(0.24, 1.46, 0.1);
  lArm.rotation.set(-1.85 - pump * 0.75, 0.1, -0.38);
  rArm.rotation.set(-1.95, -0.12, 0.4);
  if (lFore) lFore.rotation.set(-0.5, 0.08, 0.04);
  if (rFore) rFore.rotation.set(-0.18, -0.04, -0.02);
  if (!stick) return;
  stick.visible = true;
  stick.position.set(0.03, -0.22, 0.05);
  stick.rotation.set(0.06, 0.04, -0.16);
  keepGoalieStickOnIce(stick);
}

function poseGoalieStance(
  s: Skater,
  l: THREE.Group,
  r: THREE.Group,
  lf: THREE.Group | null,
  rf: THREE.Group | null,
) {
  const shade = Math.max(-1, Math.min(1, (world.puck.z - s.z) * 0.5 + s.trackZ * 0.12));
  const idle = Math.sin(world.time * 1.15 + s.id * 1.7) * 0.04;
  const idle2 = Math.sin(world.time * 0.82 + s.id) * 0.03;
  const flash = Math.max(0, s.gloveFlash);
  const flashUp = flash > 0.55 ? 1 : flash > 0.12 ? (flash - 0.12) / 0.43 : 0;
  const high = Math.max(flashUp, Math.max(0, Math.min(1, (world.puck.y - 0.08) / Math.max(0.4, GOAL_H - 0.18))));
  const def = defendDir(s.side);
  const dx = (world.puck.x - def * BLUE_X) * def;
  const alert = Math.max(0, Math.min(1, (dx + 9) / 11));
  const rX = -0.55 + alert * (-0.12 - Math.max(0, shade) * 0.06) - idle2;
  const rZ = 0.18 + alert * (0.06 + shade * 0.08) - idle;
  l.position.set(-0.36, 1.44 + high * 0.06, 0.1);
  r.position.set(0.22, 1.4, 0.12);
  l.rotation.set(-0.28 - high * 1.28 + idle, 0.18 - high * 0.08, -0.48 - Math.max(0, -shade) * 0.28 - high * 0.1);
  r.rotation.set(rX, -0.1, rZ);
  if (lf) lf.rotation.set(-0.12 - (1 - high) * 1.08, 0.12, 0.08);
  if (rf) rf.rotation.set(-0.22, -0.04, -0.04);
}

function poseGoalieStick(stick: THREE.Group, cover: number) {
  stick.position.set(0.03, -0.22, 0.05);
  stick.rotation.set(0.06 + cover * 0.1, 0.04, -0.16);
}

function stickLowPoint(stick: THREE.Group, out: THREE.Vector3): number {
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

function poseGoaliePads(
  s: Skater,
  root: THREE.Group,
  body: THREE.Group | null,
  lLeg: THREE.Group | null,
  rLeg: THREE.Group | null,
  lShin: THREE.Group | null,
  rShin: THREE.Group | null,
) {
  const cover = Math.min(1, Math.max(0, s.coverPose));
  const lSp = Math.max(0, Math.min(0.58, Math.max(s.lPad, cover * 0.5)));
  const rSp = Math.max(0, Math.min(0.58, Math.max(s.rPad, cover * 0.5)));
  const sp = Math.max(lSp, rSp);
  const struckY = s.struck > 0.2 ? -0.18 * Math.min(1, s.struck) : 0;
  root.position.y = struckY - 0.12 - sp * 0.14;
  if (body) {
    const def = defendDir(s.side);
    const dx = (world.puck.x - def * BLUE_X) * def;
    const alert = Math.max(0, Math.min(1, (dx + 9) / 11));
    body.position.y = 0;
    body.rotation.x = 0.03 + alert * 0.26 + cover * 0.22 + (s.hit > 0 ? 0.28 : 0);
    body.rotation.z = s.bank * (1 - cover) * 0.4;
    body.rotation.y = 0;
  }
  const poseLeg = (
    leg: THREE.Group | null,
    shin: THREE.Group | null,
    side: number,
    pad: number,
  ) => {
    if (!leg) return;
    const flare = 0.08 + pad * 0.14;
    const fold = 0.14 + pad * 0.28;
    leg.position.set(side * (0.12 + pad * 0.04), 0.82, 0.04 + pad * 0.08);
    leg.rotation.set(fold, 0, side * flare);
    if (shin) {
      shin.rotation.set(0.2 + pad * 1.02, 0, side * -0.03 * pad);
    }
  };
  poseLeg(lLeg, lShin, -1, lSp);
  poseLeg(rLeg, rShin, 1, rSp);
}

function poseGoalieCover(
  s: Skater,
  _root: THREE.Group,
  _body: THREE.Group | null,
  _lLeg: THREE.Group | null,
  _rLeg: THREE.Group | null,
  lArm: THREE.Group | null,
  rArm: THREE.Group | null,
  lFore: THREE.Group | null,
  rFore: THREE.Group | null,
  stick: THREE.Group | null,
): boolean {
  const cover = Math.min(1, Math.max(0, s.coverPose));
  if (cover < 0.08) return false;
  const shade = Math.max(-1, Math.min(1, (world.puck.z - s.z) * 0.4));
  if (lArm && rArm) {
    const high = Math.max(0, Math.min(1, (world.puck.y - 0.08) / Math.max(0.4, GOAL_H - 0.18)));
    lArm.position.set(-0.22 - shade * 0.04, 1.28 + high * 0.08, 0.22);
    rArm.position.set(0.16 - shade * 0.04, 1.24, 0.22);
    lArm.rotation.set(-0.55 - high * 0.85 - cover * 0.1, 0.28, -0.32 - high * 0.12);
    rArm.rotation.set(-0.72 - cover * 0.12, -0.28, 0.14);
    if (lFore) lFore.rotation.set(-0.2 - (1 - high) * 0.85 - cover * 0.08, 0.16, 0.08);
    if (rFore) rFore.rotation.set(-0.42 - cover * 0.08, -0.12, -0.06);
  }
  if (stick) {
    poseGoalieStick(stick, cover);
    keepGoalieStickOnIce(stick);
  }
  return true;
}

function tumbleRoot(struck: number, tumble: number, yaw: number) {
  const u = Math.min(1, Math.max(0, 1 - struck / 1.68));
  const pitch = Math.min(1.12, u * 1.55);
  const spin = u * 4.6 * tumble;
  const roll = Math.sin(spin) * 0.48;
  const y = 0.1 + Math.sin(pitch) * 0.36 + Math.abs(roll) * 0.22;
  return { y, rx: pitch, ry: yaw + Math.PI + spin * 0.45, rz: roll };
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
  ly: 0.55,
  lz: 0.12,
  lrx: 0.9,
  lrz: -0.55,
  ls: 1.8,
  rx: 0.16,
  ry: 0.55,
  rz: 0.12,
  rrx: 1.05,
  rrz: 0.44,
  rs: 1.9,
  lpx: -0.26,
  lpy: 1.46,
  lpz: 0.06,
  larx: -1.4,
  lary: 0,
  larz: 0.2,
  lfr: -1.2,
  rpx: 0.24,
  rpy: 1.46,
  rpz: 0.06,
  rarx: -0.4,
  rary: 0,
  rarz: -1.1,
  rfr: 0,
};

const GOALIE_ONE: GetUpFrame = {
  brx: 1.05,
  brz: 0.08,
  lx: -0.2,
  ly: 0.58,
  lz: 0.16,
  lrx: 0.7,
  lrz: -0.4,
  ls: 1.2,
  rx: 0.16,
  ry: 0.78,
  rz: 0.08,
  rrx: -0.45,
  rrz: 0.12,
  rs: 0.85,
  lpx: -0.34,
  lpy: 1.42,
  lpz: 0.1,
  larx: -1.25,
  lary: 0.08,
  larz: 0.32,
  lfr: -0.85,
  rpx: 0.22,
  rpy: 1.4,
  rpz: 0.1,
  rarx: -0.65,
  rary: -0.08,
  rarz: -0.22,
  rfr: -0.35,
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
  lpx: -0.36,
  lpy: 1.44,
  lpz: 0.1,
  larx: -0.5,
  lary: 0.16,
  larz: -0.5,
  lfr: -0.85,
  rpx: 0.22,
  rpy: 1.4,
  rpz: 0.12,
  rarx: -0.6,
  rary: -0.1,
  rarz: 0.2,
  rfr: -0.22,
};

function mixGetUp(a: GetUpFrame, b: GetUpFrame, t: number): GetUpFrame {
  const o = { ...a };
  for (const k of Object.keys(a) as (keyof GetUpFrame)[]) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}

function poseGoalieGetUp(
  s: Skater,
  root: THREE.Group,
  body: THREE.Group | null,
  lLeg: THREE.Group | null,
  rLeg: THREE.Group | null,
  lShin: THREE.Group | null,
  rShin: THREE.Group | null,
  lArm: THREE.Group | null,
  rArm: THREE.Group | null,
  lFore: THREE.Group | null,
  rFore: THREE.Group | null,
) {
  const p = Math.min(1, Math.max(0, (1.68 - s.struck) / 1.52));
  const smooth = p < 0.42 ? (p / 0.42) : (p - 0.42) / 0.58;
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
  const lb = lShin ? wy(lShin, 0, -0.48, 0.08) : 0;
  const rb = rShin ? wy(rShin, 0, -0.48, 0.08) : 0;
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
}

function SkateSole({
  mats,
  position,
  goalie = false,
}: {
  mats: Pick<KitMats, "blade" | "skates" | "mask">;
  position: [number, number, number];
  goalie?: boolean;
}) {
  const roller = useGame((s) => s.clockMode) === "scrimmage";
  if (!roller) {
    return <mesh geometry={bladeGeo} material={mats.blade} position={position} />;
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

function poseBrawl(
  kind: 0 | 1,
  swing: number,
  body: THREE.Group,
  lArm: THREE.Group,
  rArm: THREE.Group,
  lFore: THREE.Group,
  rFore: THREE.Group,
  stick: THREE.Group | null,
  root: THREE.Group,
  layout: { len: number },
  goalie: boolean,
) {
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
  if (!goalie && stick) poseStickOneHand(stick, root, rFore, layout);
}

export function PlayerMesh({ index, kitId }: { index: number; kitId: number }) {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const side = world.skaters[index]?.side;
  const liveKitId = (side === "away" ? awayKit : homeKit) ?? kitId;
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
  const blocker = useRef<THREE.Group>(null);
  const stick = useRef<THREE.Group>(null);
  const shaftHold = useRef<THREE.Group>(null);
  const bladeGrp = useRef<THREE.Group>(null);
  const knobRef = useRef<THREE.Mesh>(null);
  const flyBlade = useRef<THREE.Group>(null);
  const flyShaft = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);
  const skater = world.skaters[index]!;
  const kit = kitById(liveKitId);
  const goalie = skater.kind === "goalie";
  const mats = useMemo(() => makeKitMats(kit, skater.number, goalie), [liveKitId, kit, skater.number, goalie]);
  const layout = useMemo(() => stickLayout(goalie), [goalie]);

  useLayoutEffect(() => () => disposeKit(mats), [mats]);

  useLayoutEffect(() => {
    root.current?.traverse((obj) => {
      obj.frustumCulled = false;
    });
  }, []);

  useFrame(() => {
    const s: Skater | undefined = world.skaters[index];
    const g = root.current;
    if (!s || !g) return;
    g.visible = true;
    const diving = !goalie && s.dive > 0.04;
    const tumbling = s.tumble !== 0 && s.struck > 0.1;
    const goalieUp = goalie && tumbling;
    if (tumbling && !goalieUp) {
      const t = tumbleRoot(s.struck, s.tumble, s.yaw);
      g.position.set(s.x, t.y, s.z);
      g.rotation.set(t.rx, t.ry, t.rz);
    } else if (!goalieUp) {
      g.position.set(
        s.x,
        diving ? 0.12 : s.struck > 0.2 ? Math.max(0, 0.04 - 0.04 * Math.min(1, s.struck)) : 0,
        s.z,
      );
      g.rotation.set(0, s.yaw + Math.PI, 0);
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
    if (goalie && !tumbling) {
      poseGoaliePads(
        s,
        g,
        body.current,
        lLeg.current,
        rLeg.current,
        lShin.current,
        rShin.current,
      );
    }
    const butterflied =
      goalie &&
      !tumbling &&
      !goalieCheer &&
      poseGoalieCover(
        s,
        g,
        body.current,
        lLeg.current,
        rLeg.current,
        lArm.current,
        rArm.current,
        lFore.current,
        rFore.current,
        stick.current,
      );
    if (body.current && !butterflied && !goalie && !rage) {
      if (cheer && s.hit <= 0) {
        body.current.position.y = 0;
        body.current.rotation.set(0, 0, 0);
      } else {
        const down = tumbling ? 0 : s.struck > 0.2 ? Math.min(1.15, s.struck * 0.95) : 0;
        let pitch = s.lean + (s.hit > 0 ? 0.45 : 0) + down;
        if (diving) pitch = 1.08;
        if (slapping) pitch += swingT * 0.28;
        body.current.position.y = diving ? -0.12 : 0;
        body.current.rotation.x = pitch;
        body.current.rotation.z = diving ? 0 : s.deke > 0.02 ? dekeA * 0.16 : s.bank;
        body.current.rotation.y = slapping ? swingT * 0.4 : 0;
      }
    }
    if (slapping && stick.current && !goalie) poseSlapStick(stick.current, swingT);
    const amp = s.kind === "goalie" ? 0.08 : 0.52;
    const a = Math.sin(s.stride) * amp;
    const b = Math.sin(s.stride + Math.PI) * amp;
    if (!goalie && diving) {
      if (lLeg.current) {
        lLeg.current.position.set(-0.16, 0.3, 0.1);
        lLeg.current.rotation.set(1.32, 0, -0.1);
      }
      if (rLeg.current) {
        rLeg.current.position.set(0.16, 0.3, 0.1);
        rLeg.current.rotation.set(1.32, 0, 0.1);
      }
      if (lShin.current) lShin.current.rotation.set(0.16, 0, 0);
      if (rShin.current) rShin.current.rotation.set(0.16, 0, 0);
      if (lBoot.current) lBoot.current.rotation.set(0.08, 0, 0);
      if (rBoot.current) rBoot.current.rotation.set(0.08, 0, 0);
    } else if (tumbling && goalie) {
      poseGoalieGetUp(
        s,
        g,
        body.current,
        lLeg.current,
        rLeg.current,
        lShin.current,
        rShin.current,
        lArm.current,
        rArm.current,
        lFore.current,
        rFore.current,
      );
    } else if (tumbling) {
      if (lLeg.current) {
        lLeg.current.position.set(-0.14, 0.55, 0.04);
        lLeg.current.rotation.set(0.85, 0, -0.22);
      }
      if (rLeg.current) {
        rLeg.current.position.set(0.14, 0.55, 0.04);
        rLeg.current.rotation.set(1.15, 0, 0.28);
      }
      if (lShin.current) lShin.current.rotation.set(0.7, 0, 0);
      if (rShin.current) rShin.current.rotation.set(0.85, 0, 0);
    } else if (!goalie) {
      if (lLeg.current) {
        lLeg.current.position.set(-0.2, 0.86, 0);
        lLeg.current.rotation.x = a;
        lLeg.current.rotation.z = 0;
      }
      if (rLeg.current) {
        rLeg.current.position.set(0.2, 0.86, 0);
        rLeg.current.rotation.x = b;
        rLeg.current.rotation.z = 0;
      }
      const kneeL = 0.22 + Math.max(0, -a) * 1.15;
      const kneeR = 0.22 + Math.max(0, -b) * 1.15;
      if (lShin.current) lShin.current.rotation.set(kneeL, 0, 0);
      if (rShin.current) rShin.current.rotation.set(kneeR, 0, 0);
      if (lBoot.current) lBoot.current.rotation.set(-0.1 - kneeL * 0.32 + Math.max(0, a) * 0.18, 0, 0);
      if (rBoot.current) rBoot.current.rotation.set(-0.1 - kneeR * 0.32 + Math.max(0, b) * 0.18, 0, 0);
    }
    if (lArm.current && rArm.current && !butterflied && !rage) {
      if (goalieCheer && body.current) {
        poseGoalieCheer(
          s,
          body.current,
          lArm.current,
          rArm.current,
          lFore.current,
          rFore.current,
          stick.current,
        );
      } else if (cheer && s.hit <= 0 && body.current) {
        poseCheer(s, body.current, lArm.current, rArm.current, lFore.current, rFore.current);
      } else if (s.dive > 0.04 && !goalie) {
        lArm.current.rotation.set(-0.15, 0.4, 1.15);
        rArm.current.rotation.set(-0.15, -0.4, -1.15);
        if (lFore.current) lFore.current.rotation.set(-0.2, 0, 0);
        if (rFore.current) rFore.current.rotation.set(-0.2, 0, 0);
      } else if (goalie && !tumbling) {
        poseGoalieStance(s, lArm.current, rArm.current, lFore.current, rFore.current);
      } else if (!goalie && stick.current && body.current && (slapping || s.dive <= 0.04)) {
        const hasPuck = world.puck.owner === index;
        if (!slapping) {
          poseStickToPuck(stick.current, g, hasPuck || poke, dekeA);
        }
        stick.current.updateWorldMatrix(true, false);
        body.current.updateWorldMatrix(true, false);
        _handTop.set(0, layout.len * 0.76, 0);
        stick.current.localToWorld(_handTop);
        body.current.worldToLocal(_handTop);
        _handBot.set(0, layout.len * 0.48, 0);
        stick.current.localToWorld(_handBot);
        body.current.worldToLocal(_handBot);
        _handTop.y = Math.min(_handTop.y, hasPuck || slapping ? 1.36 : 1.16);
        const onStick = hasPuck || slapping || poke;
        poseArmIk(
          lArm.current,
          lFore.current,
          -0.26,
          1.46,
          0.06,
          _handTop.x,
          _handTop.y,
          _handTop.z,
          -1,
          onStick,
        );
        poseArmIk(
          rArm.current,
          rFore.current,
          0.24,
          1.46,
          0.06,
          _handBot.x,
          _handBot.y,
          _handBot.z,
          1,
          onStick,
        );
        if (slapping && lFore.current && rFore.current) {
          poseStickFromHands(stick.current, g, lFore.current, rFore.current, layout, false, false);
        }
      }
    }
    if (stick.current && !butterflied && !rage && !goalieCheer) {
      if (goalie) {
        poseGoalieStick(stick.current, s.coverPose);
        if (s.dive > 0.04 && body.current) {
          body.current.position.y = 0;
          body.current.rotation.x = Math.max(body.current.rotation.x, 0.42);
        }
        keepGoalieStickOnIce(stick.current);
      } else if (cheer && s.hit <= 0 && !rage) {
        if (rFore.current) poseStickOneHand(stick.current, g, rFore.current, layout);
      } else if (s.dive > 0.04) {
        if (lFore.current && g) {
          poseStickFromHands(stick.current, g, lFore.current, rFore.current, layout, true);
        }
      }
    }
    if (
      rage &&
      stick.current &&
      shaftHold.current &&
      bladeGrp.current &&
      knobRef.current &&
      flyBlade.current &&
      flyShaft.current &&
      lArm.current &&
      rArm.current
    ) {
      poseRage(
        s,
        g,
        body.current,
        lArm.current,
        rArm.current,
        lFore.current,
        rFore.current,
        stick.current,
        shaftHold.current,
        bladeGrp.current,
        knobRef.current,
        flyBlade.current,
        flyShaft.current,
        layout,
        rage,
      );
    } else if (!goalie && shaftHold.current && bladeGrp.current && knobRef.current && stick.current) {
      stick.current.visible = true;
      shaftHold.current.visible = true;
      shaftHold.current.position.set(0, layout.len * 0.5, 0);
      shaftHold.current.scale.set(1, layout.len, 1);
      bladeGrp.current.visible = true;
      knobRef.current.visible = true;
      if (flyBlade.current) flyBlade.current.visible = false;
      if (flyShaft.current) flyShaft.current.visible = false;
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
        if (!goalie && stick.current) poseStickOneHand(stick.current, g, rFore.current, layout);
      } else {
        poseBrawl(
          bp.kind,
          bp.swing,
          body.current,
          lArm.current,
          rArm.current,
          lFore.current,
          rFore.current,
          stick.current,
          g,
          layout,
          goalie,
        );
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
      ring.current.visible =
        world.userId === index || holding || world.wingL === index || world.wingR === index;
      if (goalie) {
        const pulse = holding ? 1.08 + 0.12 * Math.abs(Math.sin(world.time * 7.4)) : 1;
        ring.current.scale.set(pulse / 1.14, 1, pulse / 1.14);
        mats.ring.color.set("#f4f8ff");
        mats.ring.opacity = holding ? 1 : 0.88;
        mats.ringFill.opacity = holding ? 0.55 : 0.3;
      }
    }
  });

  return (
    <group ref={root}>
      <mesh
        geometry={shadowGeo}
        material={mats.shadow}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.015, 0]}
      />
      <group ref={ring} visible={false}>
        {goalie ? (
          <mesh
            geometry={goalieDiscGeo}
            material={mats.ringFill}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.02, 0]}
          />
        ) : null}
        <mesh
          geometry={goalie ? goalieRingGeo : ringGeo}
          material={mats.ring}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.03, 0]}
        />
      </group>
      <group ref={body}>
        <mesh geometry={neckGeo} material={mats.jersey} position={[0, 1.52, 0.02]} />
        <group position={[0, 1.54, 0.02]}>
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
        ) : (
          <mesh geometry={torsoGeo} material={mats.jersey} position={[0, 1.22, 0]} castShadow />
        )}
        <mesh
          geometry={yokeChestGeo}
          material={mats.yoke}
          position={[0, 1.45, 0]}
          scale={goalie ? [1.12, 1.04, 1.08] : 1}
          castShadow
        />
        <mesh
          geometry={yokeGeo}
          material={mats.yoke}
          position={[goalie ? -0.25 : -0.24, 1.45, 0.02]}
          rotation={[0.08, 0, 0.12]}
          scale={goalie ? [1.12, 1.04, 1.08] : 1}
          castShadow
        />
        <mesh
          geometry={yokeGeo}
          material={mats.yoke}
          position={[goalie ? 0.25 : 0.24, 1.45, 0.02]}
          rotation={[0.08, 0, -0.12]}
          scale={goalie ? [1.12, 1.04, 1.08] : 1}
          castShadow
        />
        <mesh geometry={numPlane} material={mats.number} position={[0, 1.24, -0.16]} rotation={[0, Math.PI, 0]} />
        <mesh geometry={pantsGeo} material={mats.pants} position={[0, 0.86, 0]} castShadow />
        <mesh geometry={pantStripeGeo} material={mats.stripe} position={[-0.185, 0.86, 0]} />
        <mesh geometry={pantStripeGeo} material={mats.stripe} position={[0.185, 0.86, 0]} />

        <group ref={lArm} position={[-0.26, 1.46, 0.06]}>
          {kit.id === 0 ? (
            <>
              <mesh geometry={upperArmGeo} material={mats.yoke} position={[0, -0.14, 0.055]} scale={[1, 1, 0.5]} castShadow />
              <mesh geometry={upperArmGeo} material={mats.jersey} position={[0, -0.14, -0.015]} scale={[1, 1, 0.5]} castShadow />
            </>
          ) : (
            <mesh geometry={upperArmGeo} material={mats.sleeves} position={[0, -0.14, 0.02]} castShadow />
          )}
          {kit.id === 1 ? (
            <mesh geometry={armStripeGeo} material={mats.pants} position={[0, -0.08, 0.02]} />
          ) : null}
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
                <mesh geometry={catcherCuffGeo} material={mats.catcher} position={[0, -0.18, 0.01]} rotation={[0.08, 0.1, 0.06]} />
                <mesh geometry={catcherPalmGeo} material={mats.catcher} position={[0.02, -0.32, 0.02]} rotation={[0.1, 0.16, 0.22]} castShadow />
                <mesh geometry={catcherPocketGeo} material={mats.catcher} position={[0.02, -0.33, -0.02]} rotation={[0.18, 0.16, 0.2]} />
                <mesh
                  geometry={catcherPocketNetGeo}
                  material={mats.catcherMesh}
                  position={[0.02, -0.33, 0.055]}
                  rotation={[0.22, 0.16, 0.2]}
                />
                {[-0.03, 0, 0.03].map((x) => (
                  <mesh
                    key={`lv${x}`}
                    geometry={catcherLaceV}
                    material={mats.catcherWeb}
                    position={[0.02 + x, -0.33, 0.052]}
                    rotation={[0.2, 0.16, 0.2]}
                  />
                ))}
                {[-0.03, 0, 0.03].map((y) => (
                  <mesh
                    key={`lh${y}`}
                    geometry={catcherLaceH}
                    material={mats.catcherWeb}
                    position={[0.02, -0.33 + y, 0.052]}
                    rotation={[0.2, 0.16, 0.2]}
                  />
                ))}
                <mesh geometry={catcherThumbGeo} material={mats.catcher} position={[-0.06, -0.28, 0.03]} rotation={[0.06, 0.42, 0.22]} />
                <mesh geometry={catcherWebGeo} material={mats.catcherWeb} position={[0.01, -0.34, 0.09]} rotation={[0.08, 0.22, 0.1]} />
                <mesh geometry={catcherWebGeo} material={mats.catcherWeb} position={[0.01, -0.26, 0.06]} rotation={[0.7, 0.18, 0.06]} scale={[0.7, 0.55, 1]} />
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
          {kit.id === 1 ? (
            <mesh geometry={armStripeGeo} material={mats.pants} position={[0, -0.08, 0.02]} />
          ) : null}
          <group ref={rFore} position={[0, -0.28, 0.02]}>
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
                <group ref={blocker} position={[0, -0.28, 0.03]} rotation={[0.12, 0, 0]}>
                  <mesh geometry={blockerBoardGeo} material={mats.blocker} castShadow />
                  <mesh geometry={pantStripeGeo} material={mats.stripe} position={[0.03, 0, 0]} />
                </group>
                <group ref={stick} position={[0.03, -0.22, 0.05]}>
                  <group position={[0, layout.len / 3, 0]}>
                    <mesh geometry={knobGeo} material={mats.tape} position={[0, 0.02, 0]} />
                    <group position={[0, -layout.len * 0.5, 0]} scale={[1, layout.len, 1]}>
                      <mesh geometry={stickShaftGeo} material={mats.stick} castShadow />
                    </group>
                    <mesh geometry={heelJoinGeo} material={mats.tape} position={[0, -layout.len + 0.02, 0.04]} />
                    <mesh geometry={paddleThroatGeo} material={mats.tape} position={[0, -layout.len + 0.05, 0.08]} />
                    <mesh
                      geometry={paddleGeo}
                      material={mats.tape}
                      position={[0, -layout.len + 0.04, 0.2]}
                      rotation={[0, 0, Math.PI / 2]}
                      castShadow
                    />
                  </group>
                </group>
              </>
            ) : (
              <mesh geometry={gloveGeo} material={mats.gloves} position={[-0.01, -0.28, 0.07]} rotation={[0.5, -0.1, -0.08]} castShadow />
            )}
          </group>
        </group>

        <group ref={lLeg} position={[goalie ? -0.14 : -0.2, goalie ? 0.88 : 0.86, 0]}>
          {goalie ? (
            <>
              <mesh geometry={goaliePadThighGeo} material={mats.pads} position={[0, -0.16, 0.05]} scale={[1.42, 1.12, 1.55]} castShadow />
              <mesh geometry={goaliePadKneeGeo} material={mats.pads} position={[0, -0.34, 0.06]} scale={[1.42, 1.1, 1.5]} />
              <group ref={lShin} position={[0, -0.36, 0]}>
                <mesh geometry={goaliePadShinGeo} material={mats.pads} position={[0, -0.2, 0.05]} scale={[1.48, 1.12, 1.58]} castShadow />
                <mesh geometry={goalieBootGeo} material={mats.skates} position={[0, -0.42, 0.08]} />
                <SkateSole mats={mats} goalie position={[0, -0.48, 0.08]} />
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
        <group ref={rLeg} position={[goalie ? 0.14 : 0.2, goalie ? 0.88 : 0.86, 0]}>
          {goalie ? (
            <>
              <mesh geometry={goaliePadThighGeo} material={mats.pads} position={[0, -0.16, 0.05]} scale={[1.42, 1.12, 1.55]} castShadow />
              <mesh geometry={goaliePadKneeGeo} material={mats.pads} position={[0, -0.34, 0.06]} scale={[1.42, 1.1, 1.5]} />
              <group ref={rShin} position={[0, -0.36, 0]}>
                <mesh geometry={goaliePadShinGeo} material={mats.pads} position={[0, -0.2, 0.05]} scale={[1.48, 1.12, 1.58]} castShadow />
                <mesh geometry={goalieBootGeo} material={mats.skates} position={[0, -0.42, 0.08]} />
                <SkateSole mats={mats} goalie position={[0, -0.48, 0.08]} />
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
            <mesh
              geometry={stickShaftGeo}
              material={mats.stick}
              position={[0, layout.len * 0.25, 0]}
              scale={[1, layout.len * 0.5, 1]}
            />
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

function SeatedLeg({
  side,
  mats,
  goalie = false,
}: {
  side: -1 | 1;
  mats: KitMats;
  goalie?: boolean;
}) {
  if (goalie) {
    return (
      <group position={[side * 0.16, 0.12, 0.02]} rotation={[-Math.PI / 2, 0, side * 0.06]}>
        <mesh geometry={goaliePadThighGeo} material={mats.pads} position={[0, -0.16, 0.04]} scale={[1.42, 1.08, 1.5]} castShadow />
        <mesh geometry={goaliePadKneeGeo} material={mats.pads} position={[0, -0.34, 0.05]} scale={[1.42, 1.05, 1.45]} />
        <group position={[0, -0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh geometry={goaliePadShinGeo} material={mats.pads} position={[0, -0.2, 0.04]} scale={[1.48, 1.08, 1.5]} castShadow />
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

export function SeatedPlayer({
  kit,
  number,
  holdStick = false,
  goalie = false,
  seatX,
}: {
  kit: UniformKit;
  number: number;
  holdStick?: boolean;
  goalie?: boolean;
  seatX?: number;
}) {
  const mats = useMemo(() => makeKitMats(kit, number, goalie), [kit, kit.id, number, goalie]);
  const lean = useRef<THREE.Group>(null);
  useLayoutEffect(() => () => disposeKit(mats), [mats]);
  useFrame(() => {
    const g = lean.current;
    if (!g) return;
    const d = world.benchDump;
    const near =
      seatX !== undefined &&
      !!d &&
      (d.phase !== "fly" || d.t > d.dur * 0.45) &&
      ((d.kind === "help" && seatX > 0.4) || (d.kind === "shove" && seatX < -0.4)) &&
      Math.abs(seatX - d.x1) < 2.8;
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
      <mesh
        geometry={shadowGeo}
        material={mats.shadow}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0.18]}
        scale={[0.9, 1.15, 0.7]}
      />
      <group ref={lean} rotation={[0.08, 0, 0]}>
        <mesh geometry={neckGeo} material={mats.jersey} position={[0, 0.86, 0.04]} />
        <group position={[0, 0.88, 0.04]}>
          <mesh
            geometry={helmetGeo}
            material={mats.helmet}
            position={[0, 0.08, 0]}
            scale={[1.05, 0.92, 1.12]}
            castShadow
          />
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

        <group position={[-0.22, 0.78, 0.02]} rotation={[-1.18, 0.22, 0.55]}>
          {kit.id === 0 ? (
            <>
              <mesh geometry={upperArmGeo} material={mats.yoke} position={[0, -0.14, 0.055]} scale={[1, 1, 0.5]} castShadow />
              <mesh geometry={upperArmGeo} material={mats.jersey} position={[0, -0.14, -0.015]} scale={[1, 1, 0.5]} castShadow />
            </>
          ) : (
            <mesh geometry={upperArmGeo} material={mats.sleeves} position={[0, -0.14, 0.02]} castShadow />
          )}
          {kit.id === 1 ? (
            <mesh geometry={armStripeGeo} material={mats.pants} position={[0, -0.08, 0.02]} />
          ) : null}
          <group position={[0, -0.28, 0.02]} rotation={[-0.42, 0.1, 0.08]}>
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
                <mesh geometry={catcherCuffGeo} material={mats.catcher} position={[0, -0.18, 0.01]} rotation={[0.08, 0.1, 0.06]} />
                <mesh geometry={catcherPalmGeo} material={mats.catcher} position={[0.02, -0.32, 0.02]} rotation={[0.1, 0.16, 0.22]} castShadow />
                <mesh geometry={catcherWebGeo} material={mats.catcherWeb} position={[0.01, -0.34, 0.09]} rotation={[0.08, 0.22, 0.1]} />
              </>
            ) : (
              <mesh geometry={gloveGeo} material={mats.gloves} position={[0.02, -0.28, 0.04]} rotation={[0.35, 0.1, 0.08]} castShadow />
            )}
          </group>
        </group>
        <group
          position={[0.2, 0.76, 0.04]}
          rotation={holdStick ? [-0.72, -0.18, -0.22] : [-1.12, -0.16, -0.48]}
        >
          {kit.id === 0 ? (
            <>
              <mesh geometry={upperArmGeo} material={mats.yoke} position={[0, -0.14, 0.055]} scale={[1, 1, 0.5]} castShadow />
              <mesh geometry={upperArmGeo} material={mats.jersey} position={[0, -0.14, -0.015]} scale={[1, 1, 0.5]} castShadow />
            </>
          ) : (
            <mesh geometry={upperArmGeo} material={mats.sleeves} position={[0, -0.14, 0.02]} castShadow />
          )}
          {kit.id === 1 ? (
            <mesh geometry={armStripeGeo} material={mats.pants} position={[0, -0.08, 0.02]} />
          ) : null}
          <group position={[0, -0.28, 0.02]} rotation={holdStick ? [-0.35, -0.08, -0.06] : [-0.38, -0.06, -0.04]}>
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
              <mesh geometry={gloveGeo} material={mats.gloves} position={[-0.01, -0.28, 0.05]} rotation={[0.4, -0.08, -0.06]} castShadow />
            )}
          </group>
        </group>
      </group>

      <SeatedLeg side={-1} mats={mats} goalie={goalie} />
      <SeatedLeg side={1} mats={mats} goalie={goalie} />

      {goalie ? (
        <group position={[0.22, -0.52, 0.28]} rotation={[0.12, 0.08, 0.18]}>
          <group position={[0, 0.51, 0]} scale={[1, 1.02, 1]}>
            <mesh geometry={stickShaftGeo} material={mats.stick} />
          </group>
          <mesh geometry={knobGeo} material={mats.tape} position={[0, 1.02, 0]} />
          <mesh geometry={paddleThroatGeo} material={mats.tape} position={[0, 0.05, 0.08]} />
          <mesh geometry={paddleGeo} material={mats.tape} position={[0, 0.04, 0.2]} rotation={[0, 0, Math.PI / 2]} />
        </group>
      ) : holdStick ? (
        <group position={[0.16, -0.62, 0.34]} rotation={[0.04, 0.06, 0.05]}>
          <group position={[0, 0.59, 0]} scale={[1, 1.18, 1]}>
            <mesh geometry={stickShaftGeo} material={mats.stick} />
          </group>
          <mesh geometry={knobGeo} material={mats.tape} position={[0, 1.18, 0]} />
          <mesh geometry={heelJoinGeo} material={mats.tape} position={[0, 0.022, 0.03]} />
          <mesh geometry={bladePlateGeo} material={mats.tape} position={[0, 0.026, 0.19]} />
          <mesh geometry={bladeToeGeo} material={mats.tape} position={[0, 0.024, 0.4]} />
        </group>
      ) : (
        <group position={[0.42, 0.04, 0.06]} rotation={[0.06, 0, 0.1]}>
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


export function RefereeMesh({ lane = 1 }: { lane?: 1 | -1 }) {
  const root = useRef<THREE.Group>(null);
  const lArm = useRef<THREE.Group>(null);
  const rArm = useRef<THREE.Group>(null);
  const mats = useMemo(
    () => ({
      helm: mat("#1a1a1a", { roughness: 0.32, metalness: 0.2 }),
      white: mat("#f4f4f0", { roughness: 0.7 }),
      black: mat("#161616", { roughness: 0.62 }),
      orange: mat("#e85d04", { roughness: 0.55 }),
      pants: mat("#111111", { roughness: 0.7 }),
      blade: mat("#c5ccd4", { roughness: 0.38, metalness: 0.28, emissive: "#9aa3ab", emissiveIntensity: 0.22 }),
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
    if (!g) return;
    const tumbling = r.tumble !== 0 && r.struck > 0.1;
    const down = !tumbling && r.struck > 0.2 ? Math.min(1, r.struck) : 0;
    if (tumbling) {
      const t = tumbleRoot(r.struck, r.tumble, r.yaw);
      g.position.set(r.x, t.y, r.z);
      g.rotation.set(t.rx, t.ry, t.rz);
    } else {
      g.position.set(r.x, 0, r.z);
      g.rotation.set(down * 1.05, r.yaw + Math.PI, down * 0.18);
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
    if (down > 0.18) {
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
  });

  return (
    <group ref={root}>
      <mesh geometry={refShadowGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <meshBasicMaterial color="#000000" transparent opacity={0.1} depthWrite={false} />
      </mesh>
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
      <mesh geometry={refLeg} material={mats.pants} position={[-0.13, 0.55, 0]} />
      <mesh geometry={refLeg} material={mats.pants} position={[0.13, 0.55, 0]} />
      <mesh geometry={refBoot} material={mats.helm} position={[-0.13, 0.22, 0.04]} />
      <SkateSole mats={{ blade: mats.blade, skates: mats.helm, mask: mats.mask }} position={[-0.13, 0.15, 0.04]} />
      <mesh geometry={refBoot} material={mats.helm} position={[0.13, 0.22, 0.04]} />
      <SkateSole mats={{ blade: mats.blade, skates: mats.helm, mask: mats.mask }} position={[0.13, 0.15, 0.04]} />
    </group>
  );
}

const ghostPuckGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.032, 16);
const ghostBandGeo = new THREE.TorusGeometry(0.04, 0.006, 6, 14);

function DrillGhostPucks() {
  const root = useRef<THREE.Group>(null);
  const pool = useRef<
    { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; bandMat: THREE.MeshStandardMaterial }[]
  >([]);
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
      const owner = world.puck.owner !== null ? world.skaters[world.puck.owner] : undefined;
      if (owner?.kind === "goalie") mark.current.position.set(owner.x, 0.021, owner.z);
      else mark.current.position.set(world.puck.x, 0.018, world.puck.z);
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
