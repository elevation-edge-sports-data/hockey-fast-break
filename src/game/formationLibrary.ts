import { GOAL_LINE_X, RINK_L } from "./rink";
import { world, type Skater, type SkaterKind } from "./sim";

export type FormationPlayer = {
  index: number;
  id: number;
  x: number;
  z: number;
  yaw: number;
};

export type FormationSide = {
  puck: { x: number; z: number; y: number; owner: number | null };
  players: FormationPlayer[];
};

/** Same shape the locked-frame Save button writes. */
export type FormationFrame = {
  frame: number;
  time: number;
  original: FormationSide;
  adjusted: FormationSide;
};

export type FormationEntry = {
  id: string;
  name: string;
  frame: FormationFrame;
};

const STORAGE_KEY = "hfb-formation-library";

const CLASSIC_BACK = 13.2;
const CLASSIC_EYE_Y = 9.4;
const CLASSIC_MIN_BACK = 2;
const CLASSIC_UP_COS = Math.cos((25 * Math.PI) / 180);

/** Classic eye point: behind the look target along the attack axis, rink length up the screen. */
export function classicFormationEye(look: { x: number; y: number; z: number }) {
  const atk: 1 | -1 = world.homeAttack >= 0 ? 1 : -1;
  const limit = RINK_L / 2 - 1.6;
  let x = atk > 0 ? Math.max(-limit, look.x - CLASSIC_BACK) : Math.min(limit, look.x + CLASSIC_BACK);
  let y = CLASSIC_EYE_Y;
  const z = look.z;
  let behind = (look.x - x) * atk;
  if (behind < CLASSIC_MIN_BACK) behind = CLASSIC_MIN_BACK;
  x = look.x - atk * behind;
  const dy = look.y - y;
  const dz = look.z - z;
  const len = Math.hypot(behind, dy, dz);
  if (!(len > 1e-4 && behind / len <= CLASSIC_UP_COS)) {
    const minPerp = behind * Math.tan((25 * Math.PI) / 180);
    y = look.y + Math.sqrt(Math.max(0, minPerp * minPerp - dz * dz)) + 1e-3;
  }
  return { x, y, z, atk };
}

/** Orbit that reproduces a classic eye, so a later drag starts from that angle. */
export function formationOrbitFromEye(
  look: { x: number; y: number; z: number },
  eye: { x: number; y: number; z: number },
) {
  const dx = eye.x - look.x;
  const dy = eye.y - look.y;
  const dz = eye.z - look.z;
  return {
    theta: Math.atan2(dz, dx),
    phi: Math.atan2(Math.hypot(dx, dz), dy),
    radius: Math.hypot(dx, dy, dz),
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asPlayer(v: unknown): FormationPlayer | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const index = num(p.index);
  const id = num(p.id);
  const x = num(p.x);
  const z = num(p.z);
  // Older locked-frame exports omit yaw. A present non-number is still invalid.
  const yaw = p.yaw == null ? 0 : num(p.yaw);
  if (index === null || id === null || x === null || z === null || yaw === null) return null;
  return { index, id, x, z, yaw };
}

function asSide(v: unknown): FormationSide | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  const puck = s.puck;
  if (!puck || typeof puck !== "object" || !Array.isArray(s.players)) return null;
  const p = puck as Record<string, unknown>;
  const x = num(p.x);
  const z = num(p.z);
  const y = num(p.y);
  if (x === null || z === null || y === null) return null;
  const owner = p.owner === null ? null : num(p.owner);
  if (p.owner !== null && owner === null) return null;
  const players: FormationPlayer[] = [];
  for (const row of s.players) {
    const player = asPlayer(row);
    if (!player) return null;
    players.push(player);
  }
  return { puck: { x, z, y, owner }, players };
}

function asFrame(v: unknown): FormationFrame | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  const frame = num(f.frame);
  const time = num(f.time);
  const original = asSide(f.original);
  const adjusted = asSide(f.adjusted);
  if (frame === null || time === null || !original || !adjusted) return null;
  return { frame, time, original, adjusted };
}

/** One saved frame, or every frame in a range download. */
export function framesFromUnknown(data: unknown): FormationFrame[] | string {
  const list = Array.isArray(data) ? data : [data];
  if (!list.length) return "That file has no frames.";
  const frames: FormationFrame[] = [];
  for (const item of list) {
    const frame = asFrame(item);
    if (!frame) return "That file is not a replay frame.";
    frames.push(frame);
  }
  return frames;
}

export function parseFormationJson(text: string): FormationFrame[] | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return "That file is not JSON.";
  }
  return framesFromUnknown(data);
}

function entryName(fileName: string, frames: FormationFrame[], frame: FormationFrame): string {
  if (frames.length === 1) return fileName;
  return `${fileName} · ${frame.frame}`;
}

export function entriesFromFile(fileName: string, text: string, idAt: () => string): FormationEntry[] | string {
  const frames = parseFormationJson(text);
  if (typeof frames === "string") return frames;
  return frames.map((frame) => ({
    id: idAt(),
    name: entryName(fileName, frames, frame),
    frame,
  }));
}

function asEntry(v: unknown): FormationEntry | null {
  if (!v || typeof v !== "object") return null;
  const row = v as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  const frame = asFrame(row.frame);
  if (!frame) return null;
  return { id: row.id, name: row.name, frame };
}

export function readFormationLibrary(): FormationEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) => {
      const entry = asEntry(item);
      return entry ? [entry] : [];
    });
  } catch {
    return [];
  }
}

export function writeFormationLibrary(entries: FormationEntry[]): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return null;
  } catch {
    return "The browser could not store that frame.";
  }
}

const bundledModules = import.meta.glob("../../formations/*.json", { eager: true });

function moduleJson(mod: unknown): unknown {
  if (mod && typeof mod === "object" && "default" in mod) return (mod as { default: unknown }).default;
  return mod;
}

/** JSON files checked in under formations/. */
export function bundledFormationEntries(): FormationEntry[] {
  const out: FormationEntry[] = [];
  for (const [path, mod] of Object.entries(bundledModules)) {
    const name = path.split("/").pop() ?? path;
    const frames = framesFromUnknown(moduleJson(mod));
    if (typeof frames === "string") continue;
    frames.forEach((frame, i) => {
      out.push({
        id: `bundled:${path}:${i}`,
        name: entryName(name, frames, frame),
        frame,
      });
    });
  }
  return out;
}

function goalieIndexes(players: FormationPlayer[]): Set<number> {
  const picked = new Set<number>();
  for (const end of [GOAL_LINE_X, -GOAL_LINE_X]) {
    let best = -1;
    let bestD = 4;
    for (const p of players) {
      const d = Math.hypot(p.x - end, p.z);
      if (d < bestD) {
        bestD = d;
        best = p.index;
      }
    }
    if (best >= 0) picked.add(best);
  }
  return picked;
}

function stillSkater(p: FormationPlayer, side: "home" | "away", kind: SkaterKind): Skater {
  return {
    id: p.id,
    side,
    kind,
    number: Math.max(1, Math.round(Math.abs(p.id)) % 99 || p.index + 1),
    x: p.x,
    z: p.z,
    vx: 0,
    vz: 0,
    yaw: p.yaw,
    stride: 0,
    lean: 0,
    bank: 0,
    radius: kind === "goalie" ? 0.58 : 0.42,
    burst: 0,
    deke: 0,
    hit: 0,
    stun: 0,
    poke: 0,
    struck: 0,
    tumble: 0,
    tumbleSpin: 0,
    windup: 0,
    follow: 0,
    trackZ: 0,
    trackVz: 0,
    celebrate: 0,
    smash: 0,
    smashKind: 0,
    smashHit: 0,
    coverPose: 0,
    lPad: 0.18,
    rPad: 0.18,
    dive: 0,
    gloveFlash: 0,
    backskate: false,
    stickPull: 0,
    comX: p.x,
    comZ: p.z,
  };
}

/** Bodies are stored home-first, the same order the replay buffer records. */
export function formationSkaters(players: FormationPlayer[]): Skater[] {
  const ordered = players.slice().sort((a, b) => a.index - b.index);
  const goalies = goalieIndexes(ordered);
  const homeCut = Math.ceil(ordered.length / 2);
  return ordered.map((p, i) =>
    stillSkater(p, i < homeCut ? "home" : "away", goalies.has(p.index) ? "goalie" : "winger"),
  );
}

/**
 * Show one saved side on the rink meshes.
 * Restores the skaters, puck, and replay flags that were current when it mounted.
 */
export function mountFormation(side: FormationSide): () => void {
  const prevSkaters = world.skaters;
  const puck = { ...world.puck };
  const replay = world.replay;
  const replayKind = world.replayKind;
  const replayPlaying = world.replayPlaying;
  const replayT = world.replayT;
  world.skaters = formationSkaters(side.players);
  world.puck.x = side.puck.x;
  world.puck.z = side.puck.z;
  world.puck.y = side.puck.y;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.puck.owner = side.puck.owner;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    world.skaters = prevSkaters;
    world.puck.x = puck.x;
    world.puck.z = puck.z;
    world.puck.y = puck.y;
    world.puck.vx = puck.vx;
    world.puck.vz = puck.vz;
    world.puck.vy = puck.vy;
    world.puck.owner = puck.owner;
    world.replay = replay;
    world.replayKind = replayKind;
    world.replayPlaying = replayPlaying;
    world.replayT = replayT;
  };
}
