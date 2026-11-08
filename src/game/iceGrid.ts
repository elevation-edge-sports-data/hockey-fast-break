import { CORNER_R, iceWidthAtX, RINK_L, RINK_W } from "./rink";

/** Metres between formation-library grid lines. Counted from center ice. */
export const ICE_GRID_STEP = 5;

const GRID_KEY = "hfb-formation-grid";
const EDGE_INSET = 0.08;

function gridStore(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** On for this browser tab. A new tab starts with the grid off. */
export function readFormationGrid(): boolean {
  return gridStore()?.getItem(GRID_KEY) === "1";
}

export function writeFormationGrid(on: boolean): void {
  try {
    gridStore()?.setItem(GRID_KEY, on ? "1" : "0");
  } catch {
    /* The toggle still updates for this page load. */
  }
}

/** Half-length of the ice at this z, out to the boards. 0 is off the ice. */
export function iceHalfLengthAtZ(z: number): number {
  const halfL = RINK_L / 2;
  const halfW = RINK_W / 2;
  const az = Math.abs(z);
  if (az > halfW + 1e-8) return 0;
  const innerW = halfW - CORNER_R;
  const innerL = halfL - CORNER_R;
  if (az <= innerW) return halfL;
  const dz = az - innerW;
  if (dz >= CORNER_R) return innerL;
  return innerL + Math.sqrt(Math.max(0, CORNER_R * CORNER_R - dz * dz));
}

function stops(limit: number, step: number): number[] {
  const n = Math.floor((limit - 1e-4) / step);
  const out = [0];
  for (let i = 1; i <= n; i++) {
    out.push(i * step, -i * step);
  }
  return out;
}

/** [x0, z0, x1, z1] segments. Lines stop just inside the boards, corners included. */
export function iceGridSegments(step = ICE_GRID_STEP): [number, number, number, number][] {
  const lines: [number, number, number, number][] = [];
  const add = (x0: number, z0: number, x1: number, z1: number) => {
    if (Math.hypot(x1 - x0, z1 - z0) < 0.25) return;
    lines.push([x0, z0, x1, z1]);
  };
  for (const x of stops(RINK_L / 2, step)) {
    const half = iceWidthAtX(x) / 2 - EDGE_INSET;
    if (half > 0.2) add(x, -half, x, half);
  }
  for (const z of stops(RINK_W / 2, step)) {
    const half = iceHalfLengthAtZ(z) - EDGE_INSET;
    if (half > 0.2) add(-half, z, half, z);
  }
  return lines;
}
