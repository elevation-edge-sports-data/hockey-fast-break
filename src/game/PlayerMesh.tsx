import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createNumberTexture } from "./iceTexture";
import { defendDir, world, type Skater } from "./sim";
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
) {
  const clamped = clampHandOutsideTorso(tx, ty, tz, poleSign, allowFront);
  tx = clamped.x;
  ty = clamped.y;
  tz = clamped.z;
  const UPPER = allowFront ? 0.3 : 0.28;
  const LOWER = allowFront ? 0.44 : 0.4;
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
  if (allowFront) _ikPole.set(-poleSign * 0.08, -0.42, 0.4);
  else _ikPole.set(poleSign * 0.28, -0.48, 0.32);
  _ikN.copy(_ikTo).cross(_ikPole);
  _ikN.cross(_ikTo);
  if (_ikN.lengthSq() < 1e-6) _ikN.set(poleSign, 0, 0);
  _ikN.normalize();
  _ikElbow.set(sx, sy, sz).addScaledVector(_ikTo, a).addScaledVector(_ikN, h);
  _ikElbow.y = Math.min(_ikElbow.y, sy - (poleSign < 0 ? 0.22 : 0.14));
  _ikElbow.z = Math.max(_ikElbow.z, sz + 0.08);
  if (allowFront) {
    if (poleSign < 0) _ikElbow.x = Math.min(_ikElbow.x, sx + 0.12);
  } else {
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

function poseStickRaised(
  stick: THREE.Group,
  parent: THREE.Group,
  hand: THREE.Group,
  layout: { len: number },
) {
  parent.updateWorldMatrix(true, false);
  hand.updateWorldMatrix(true, false);
  _handTop.set(0.02, -0.28, 0.06);
  hand.localToWorld(_handTop);
  parent.worldToLocal(_handTop);
  _ikD1.set(0.1, -0.93, 0.28).normalize();
  stick.quaternion.setFromUnitVectors(_fromY, _ikD1);
  const grip = layout.len * 0.88;
  _ikD2.set(0, grip, 0).applyQuaternion(stick.quaternion);
  stick.position.set(_handTop.x - _ikD2.x, _handTop.y - _ikD2.y, _handTop.z - _ikD2.z);
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
  if (stick) poseGoalieStick(stick, cover);
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
  const ring = useRef<THREE.Group>(null);
  const skater = world.skaters[index]!;
  const kit = kitById(liveKitId);
  const goalie = skater.kind === "goalie";
  const mats = useMemo(() => makeKitMats(kit, skater.number, goalie), [liveKitId, kit, skater.number, goalie]);
  const layout = useMemo(() => stickLayout(goalie), [goalie]);

  useLayoutEffect(() => () => disposeKit(mats), [mats]);

  useFrame(() => {
    const s: Skater | undefined = world.skaters[index];
    const g = root.current;
    if (!s || !g) return;
    const diving = !goalie && s.dive > 0.04;
    const tumbling = s.tumble !== 0 && s.struck > 0.1;
    if (tumbling) {
      const t = tumbleRoot(s.struck, s.tumble, s.yaw);
      g.position.set(s.x, t.y, s.z);
      g.rotation.set(t.rx, t.ry, t.rz);
    } else {
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
    const cheer = s.celebrate > 0.05;
    const scorer = cheer && world.lastShooter === index && world.whistle === "goal";
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
    if (body.current && !butterflied && !goalie) {
      const down = tumbling ? 0 : s.struck > 0.2 ? Math.min(1.15, s.struck * 0.95) : 0;
      let pitch = s.lean + (s.hit > 0 ? 0.45 : 0) + down;
      if (diving) pitch = 1.08;
      if (slapping) pitch += swingT * 0.28;
      body.current.position.y = diving ? -0.12 : 0;
      body.current.rotation.x = pitch;
      body.current.rotation.z = diving ? 0 : s.deke > 0.02 ? dekeA * 0.16 : s.bank;
      body.current.rotation.y = slapping ? swingT * 0.4 : 0;
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
    if (lArm.current && rArm.current && !butterflied) {
      if ((scorer || cheer) && s.hit <= 0) {
        const pump = Math.sin(world.time * 7.2 + s.id * 1.3) * 0.1;
        lArm.current.quaternion.identity();
        rArm.current.quaternion.identity();
        lArm.current.rotation.set(-Math.PI + pump * 0.04, 0, 0.22);
        rArm.current.rotation.set(-Math.PI - pump * 0.03, 0, -0.24);
        if (lFore.current) {
          lFore.current.quaternion.identity();
          lFore.current.rotation.set(0, 0, 0);
        }
        if (rFore.current) {
          rFore.current.quaternion.identity();
          rFore.current.rotation.set(0, 0, 0);
        }
      } else if (s.dive > 0.04) {
        lArm.current.rotation.set(-0.15, 0.4, 1.15);
        rArm.current.rotation.set(-0.15, -0.4, -1.15);
        if (lFore.current) lFore.current.rotation.set(-0.2, 0, 0);
        if (rFore.current) rFore.current.rotation.set(-0.2, 0, 0);
      } else if (goalie) {
        poseGoalieStance(s, lArm.current, rArm.current, lFore.current, rFore.current);
      } else if (stick.current && body.current && (slapping || s.dive <= 0.04)) {
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
    if (stick.current && !butterflied) {
      if (goalie) {
        poseGoalieStick(stick.current, s.coverPose);
      } else if ((scorer || cheer) && s.hit <= 0) {
        if (rFore.current) poseStickRaised(stick.current, g, rFore.current, layout);
      } else if (s.dive > 0.04) {
        if (lFore.current && g) {
          poseStickFromHands(stick.current, g, lFore.current, rFore.current, layout, true);
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
                <mesh geometry={bladeGeo} material={mats.blade} position={[0, -0.48, 0.08]} />
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
                  <mesh geometry={bladeGeo} material={mats.blade} position={[0, -0.12, 0.02]} />
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
                <mesh geometry={bladeGeo} material={mats.blade} position={[0, -0.48, 0.08]} />
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
                  <mesh geometry={bladeGeo} material={mats.blade} position={[0, -0.12, 0.02]} />
                </group>
              </group>
            </>
          )}
        </group>
      </group>
      {goalie ? null : (
        <group ref={stick}>
          <group position={layout.mid} scale={[1, layout.len, 1]}>
            <mesh geometry={stickShaftGeo} material={mats.stick} castShadow />
          </group>
          <mesh geometry={knobGeo} material={mats.tape} position={layout.top} />
          <mesh geometry={heelJoinGeo} material={mats.tape} position={[0, 0.022, 0.03]} />
          <group>
            <mesh geometry={bladePlateGeo} material={mats.tape} position={[0, 0.026, 0.19]} castShadow />
            <mesh geometry={bladeToeGeo} material={mats.tape} position={[0, 0.024, 0.4]} />
          </group>
        </group>
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
          <mesh geometry={bladeGeo} material={mats.blade} position={[0, -0.48, 0.06]} />
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
          <mesh geometry={bladeGeo} material={mats.blade} position={[0, -0.12, 0.02]} />
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
}: {
  kit: UniformKit;
  number: number;
  holdStick?: boolean;
  goalie?: boolean;
}) {
  const mats = useMemo(() => makeKitMats(kit, number, goalie), [kit, kit.id, number, goalie]);
  useLayoutEffect(() => () => disposeKit(mats), [mats]);
  return (
    <group>
      <mesh
        geometry={shadowGeo}
        material={mats.shadow}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0.18]}
        scale={[0.9, 1.15, 0.7]}
      />
      <group rotation={[0.08, 0, 0]}>
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
      <mesh geometry={refBoot} material={mats.helm} position={[0.13, 0.22, 0.04]} />
    </group>
  );
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
    </>
  );
}
