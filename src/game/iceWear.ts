import * as THREE from "three";
import { RINK_L, RINK_W } from "./rink";

export const ICE_WEAR_W = 1024;
export const ICE_WEAR_H = 436;

export type WearSkater = {
  id: number;
  side: "home" | "away";
  number: number;
  kind: "winger" | "defense" | "goalie";
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Mesh yaw: faceYaw(side) while backskating, otherwise the sim yaw. */
  yaw: number;
  stride: number;
  dive: number;
};

export type WearClock = {
  mode: "game" | "roller" | "practice" | "scrimmage" | "drill" | "shootout";
  /** Display seconds left. Used only for game and roller. */
  periodClock: number;
  /** 1200, 1080, or 300. Null for every other mode. */
  periodLength: number | null;
};

const STAMP_MIN_M = 0.35;
const TELEPORT_M = 1.2;
const SPEED_MIN = 1.2;
const DIVE_SPEED_MIN = 0.4;
const WEAR_AGE_FULL = 180;
const FLUSH_MS = 100;

const sx = ICE_WEAR_W / RINK_L;
const sz = ICE_WEAR_H / RINK_W;

type Stamp = { x: number; z: number };

const stamps = new Map<string, Stamp>();
let wearAge = 0;
let dirty = false;
let lastFlush = 0;
let wearCanvas: HTMLCanvasElement | null = null;
let wearCtx: CanvasRenderingContext2D | null = null;
let wearTexture: THREE.CanvasTexture | null = null;

function ensure(): boolean {
  if (wearCtx && wearTexture) return true;
  const doc = globalThis.document;
  if (!doc || typeof doc.createElement !== "function") return false;
  const canvas = doc.createElement("canvas");
  canvas.width = ICE_WEAR_W;
  canvas.height = ICE_WEAR_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.clearRect(0, 0, ICE_WEAR_W, ICE_WEAR_H);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  wearCanvas = canvas;
  wearCtx = ctx;
  wearTexture = texture;
  return true;
}

function wearU(clock: WearClock): number {
  if (clock.mode === "game" || clock.mode === "roller") {
    const len = clock.periodLength;
    if (!(len !== null && len > 0)) return 1;
    return Math.min(1, Math.max(0, 1 - clock.periodClock / len));
  }
  return Math.min(1, wearAge / WEAR_AGE_FULL);
}

function skatePoint(s: WearSkater): Stamp {
  const fx = -Math.sin(s.yaw);
  const fz = -Math.cos(s.yaw);
  const phase = Math.sin(s.stride);
  // sin(stride) > 0 puts local −X in front, so the planted blade is local +X.
  const side = phase > 0 ? 1 : -1;
  const back = 0.2 * Math.abs(phase);
  return {
    x: s.x + fz * side * 0.14 - fx * back,
    z: s.z - fx * side * 0.14 - fz * back,
  };
}

function putStamp(key: string, x: number, z: number): void {
  const prev = stamps.get(key);
  if (prev) {
    prev.x = x;
    prev.z = z;
    return;
  }
  stamps.set(key, { x, z });
}

/** Record this sim step. Game and roller follow the display clock. Other modes age for 180 s. */
export function noteSkateWear(dt: number, skaters: readonly WearSkater[], clock: WearClock): void {
  if (!ensure() || !wearCtx) return;
  const period = clock.mode === "game" || clock.mode === "roller";
  if (!period) wearAge += Math.max(0, dt);
  const u = wearU(clock);
  const ctx = wearCtx;
  for (let i = 0; i < skaters.length; i++) {
    const s = skaters[i]!;
    if (s.kind === "goalie") continue;
    const p = skatePoint(s);
    const key = `${s.side}:${s.number}`;
    const prev = stamps.get(key);
    if (!prev) {
      putStamp(key, p.x, p.z);
      continue;
    }
    const dist = Math.hypot(p.x - prev.x, p.z - prev.z);
    if (dist > TELEPORT_M) {
      putStamp(key, p.x, p.z);
      continue;
    }
    const speed = Math.hypot(s.vx, s.vz);
    const minSpeed = s.dive > 0 ? DIVE_SPEED_MIN : SPEED_MIN;
    if (speed < minSpeed) {
      putStamp(key, p.x, p.z);
      continue;
    }
    if (dist < STAMP_MIN_M) continue;
    const speedK = Math.min(1, Math.max(0.35, speed / 6));
    const alpha = (0.018 + 0.05 * u) * speedK * (s.dive > 0 ? 1.4 : 1);
    ctx.strokeStyle = `rgba(170, 196, 214, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo((prev.x + RINK_L / 2) * sx, (prev.z + RINK_W / 2) * sz);
    ctx.lineTo((p.x + RINK_L / 2) * sx, (p.z + RINK_W / 2) * sz);
    ctx.stroke();
    putStamp(key, p.x, p.z);
    dirty = true;
  }
}

/** Fresh sheet. Period start and a new match. Not a faceoff inside a period. */
export function clearIceWear(): void {
  stamps.clear();
  wearAge = 0;
  if (!ensure() || !wearCtx || !wearCanvas) return;
  wearCtx.clearRect(0, 0, wearCanvas.width, wearCanvas.height);
  dirty = true;
}

/** Upload at most once per 100 ms, and only after a stroke or a clear. */
export function flushIceWear(now = performance.now()): void {
  if (!dirty || !wearTexture) return;
  if (now - lastFlush < FLUSH_MS) return;
  wearTexture.needsUpdate = true;
  dirty = false;
  lastFlush = now;
}

export function iceWearTexture(): THREE.CanvasTexture {
  if (!ensure() || !wearTexture) {
    throw new Error("ice wear texture requires a canvas");
  }
  return wearTexture;
}
