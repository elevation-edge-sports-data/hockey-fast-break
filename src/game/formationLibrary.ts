import { lerpAngle } from "./iceMark";
import { GOAL_LINE_X, RINK_L } from "./rink";
import { world, type Skater, type SkaterKind } from "./sim";

export type FormationPlayer = {
  index: number;
  id: number;
  x: number;
  z: number;
  yaw: number;
  /** Recorded team. Absent on older downloads, which still split the list in half. */
  side?: "home" | "away";
  /** Recorded position. Absent on older downloads, which still guess a goalie from the goal line. */
  kind?: SkaterKind;
  /** Recorded jersey. Absent on older downloads, which still derive one from the id. */
  number?: number;
};

export type FormationSide = {
  puck: { x: number; z: number; y: number; owner: number | null };
  players: FormationPlayer[];
};

/** Same shape the locked-frame Save button writes. userId and controlledId are optional download fields. */
export type FormationFrame = {
  frame: number;
  time: number;
  /** Skater index under user control when the frame was recorded. */
  userId?: number;
  /** Skater id, when a download names the controlled player that way. */
  controlledId?: number;
  original: FormationSide;
  adjusted: FormationSide;
};

export type FormationView = "original" | "adjusted";

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

/** A missing or non-numeric control id is ignored. It does not reject the frame. */
function optionalNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = num(v);
  return n === null ? undefined : n;
}

/** Missing is allowed. A present value of the wrong shape rejects the player. */
function optionalSide(v: unknown): "home" | "away" | undefined | null {
  if (v == null) return undefined;
  if (v === "home" || v === "away") return v;
  return null;
}

function optionalKind(v: unknown): SkaterKind | undefined | null {
  if (v == null) return undefined;
  if (v === "winger" || v === "defense" || v === "goalie") return v;
  return null;
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
  const side = optionalSide(p.side);
  const kind = optionalKind(p.kind);
  const jersey = p.number == null ? undefined : num(p.number);
  if (index === null || id === null || x === null || z === null || yaw === null) return null;
  if (side === null || kind === null || jersey === null) return null;
  return {
    index,
    id,
    x,
    z,
    yaw,
    ...(side !== undefined ? { side } : {}),
    ...(kind !== undefined ? { kind } : {}),
    ...(jersey !== undefined ? { number: jersey } : {}),
  };
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
  const userId = optionalNum(f.userId);
  const controlledId = optionalNum(f.controlledId);
  return {
    frame,
    time,
    ...(userId !== undefined ? { userId } : {}),
    ...(controlledId !== undefined ? { controlledId } : {}),
    original,
    adjusted,
  };
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

/**
 * Left list is unsaved imports. Right list is formations/ files, plus a file
 * saved earlier in this session. A shared name does not hide the import.
 * Retired names drop only the repo copy that was renamed away.
 */
export function partitionFormationLibrary(
  local: readonly FormationEntry[],
  bundled: readonly FormationEntry[],
  saved: readonly FormationEntry[] = [],
  retired: readonly string[] = [],
): { imported: FormationEntry[]; repo: FormationEntry[] } {
  const repoSaved = saved.filter((entry) => !retired.includes(entry.name));
  const taken = new Set(repoSaved.map((entry) => entry.name));
  const repo = [
    ...repoSaved,
    ...bundled.filter((entry) => !retired.includes(entry.name) && !taken.has(entry.name)),
  ];
  const imported = local.filter((entry) => !entry.id.startsWith("bundled:"));
  return { imported, repo };
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
    number: p.number !== undefined ? p.number : Math.max(1, Math.round(Math.abs(p.id)) % 99 || p.index + 1),
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

/**
 * Bodies are stored home-first, the same order the replay buffer records.
 * A recorded side, kind, or number wins. Older files still split the list
 * in half and treat a player within 4 m of a goal line as the goalie.
 */
export function formationSkaters(players: FormationPlayer[]): Skater[] {
  const ordered = players.slice().sort((a, b) => a.index - b.index);
  const goalies = goalieIndexes(ordered);
  const homeCut = Math.ceil(ordered.length / 2);
  return ordered.map((p, i) =>
    stillSkater(
      p,
      p.side ?? (i < homeCut ? "home" : "away"),
      p.kind ?? (goalies.has(p.index) ? "goalie" : "winger"),
    ),
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

/** The side on screen. Adjusted is the default. A missing side falls back to the other. */
export function formationSideOf(frame: FormationFrame, view: FormationView): FormationSide {
  if (view === "original") return frame.original ?? frame.adjusted;
  return frame.adjusted ?? frame.original;
}

/** Copy the live rink onto the side being viewed so Save keeps that edit. */
export function writeAdjustedPositions(frame: FormationFrame, view: FormationView = "adjusted"): void {
  const side = formationSideOf(frame, view);
  side.puck.x = world.puck.x;
  side.puck.z = world.puck.z;
  side.puck.y = world.puck.y;
  side.puck.owner = world.puck.owner;
  for (const player of side.players) {
    const skater = world.skaters.find((s) => s.id === player.id);
    if (!skater) continue;
    player.x = skater.x;
    player.z = skater.z;
    player.yaw = skater.yaw;
  }
}

/** Keyboard A eases a facing at the locked-frame rate, 2.4 rad/s. */
export const FORM_YAW_RATE = 2.4;

export function formYawSnap(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz || 0);
}

export function formYawToward(yaw: number, dx: number, dz: number, dt: number): number {
  const desired = Math.atan2(-dx, -dz);
  let d = desired - yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const max = FORM_YAW_RATE * dt;
  if (d > max) d = max;
  if (d < -max) d = -max;
  return yaw + d;
}

export type FormEdit =
  | { kind: "puck"; x0: number; z0: number; x1: number; z1: number; owner0: number | null; owner1: number | null }
  | {
      kind: "skater";
      id: number;
      x0: number;
      z0: number;
      x1: number;
      z1: number;
      yaw0: number;
      yaw1: number;
      puck: boolean;
      px0: number;
      pz0: number;
      px1: number;
      pz1: number;
    };

export type FormHist = {
  undo: FormEdit[];
  redo: FormEdit[];
  gesture: FormEdit | null;
};

export function freshFormHist(): FormHist {
  return { undo: [], redo: [], gesture: null };
}

export function sameFormTarget(a: FormEdit, b: FormEdit): boolean {
  if (a.kind === "puck" && b.kind === "puck") return true;
  return a.kind === "skater" && b.kind === "skater" && a.id === b.id;
}

export function formEditMoved(g: FormEdit): boolean {
  if (g.x0 !== g.x1 || g.z0 !== g.z1) return true;
  if (g.kind === "puck" && g.owner0 !== g.owner1) return true;
  if (g.kind === "skater" && g.yaw0 !== g.yaw1) return true;
  return g.kind === "skater" && g.puck && (g.px0 !== g.px1 || g.pz0 !== g.pz1);
}

/** An open drag counts, unless it continues the undo step already on the stack. */
export function formUndoDepth(h: FormHist): number {
  const g = h.gesture;
  if (!g) return h.undo.length;
  const prev = h.undo[h.undo.length - 1];
  if (prev && sameFormTarget(prev, g)) return h.undo.length;
  return h.undo.length + 1;
}

export function closeFormGesture(h: FormHist): void {
  const g = h.gesture;
  if (!g) return;
  h.gesture = null;
  if (!formEditMoved(g)) return;
  const prev = h.undo[h.undo.length - 1];
  if (prev && sameFormTarget(prev, g)) {
    prev.x1 = g.x1;
    prev.z1 = g.z1;
    if (prev.kind === "skater" && g.kind === "skater") {
      prev.yaw1 = g.yaw1;
      prev.px1 = g.px1;
      prev.pz1 = g.pz1;
      if (g.puck) prev.puck = true;
    } else if (prev.kind === "puck" && g.kind === "puck") {
      prev.owner1 = g.owner1;
    }
    return;
  }
  h.undo.push(g);
}

export function openFormGesture(h: FormHist, next: FormEdit): void {
  const g = h.gesture;
  if (g && sameFormTarget(g, next)) return;
  closeFormGesture(h);
  h.redo.length = 0;
  h.gesture = next;
}

export function syncFormGesture(
  h: FormHist,
  end: { x: number; z: number; yaw?: number; px?: number; pz?: number; owner?: number | null },
): void {
  const g = h.gesture;
  if (!g) return;
  g.x1 = end.x;
  g.z1 = end.z;
  if (g.kind === "puck") {
    if (end.owner !== undefined) g.owner1 = end.owner;
    return;
  }
  if (end.yaw !== undefined) g.yaw1 = end.yaw;
  if (end.px !== undefined) g.px1 = end.px;
  if (end.pz !== undefined) g.pz1 = end.pz;
}

/** Local offset in the yaw+π frame shared with the skater mesh. */
export function formLocalOffset(yaw: number, dx: number, dz: number): { lx: number; lz: number } {
  const ry = yaw + Math.PI;
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  return { lx: dx * c - dz * sn, lz: dx * sn + dz * c };
}

export function formWorldOffset(yaw: number, x: number, z: number, lx: number, lz: number): { x: number; z: number } {
  const ry = yaw + Math.PI;
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  return { x: x + lx * c + lz * sn, z: z - lx * sn + lz * c };
}

export function undoFormEdit(h: FormHist): FormEdit | null {
  closeFormGesture(h);
  const g = h.undo.pop();
  if (!g) return null;
  h.redo.push(g);
  return g;
}

export function redoFormEdit(h: FormHist): FormEdit | null {
  closeFormGesture(h);
  const g = h.redo.pop();
  if (!g) return null;
  h.undo.push(g);
  return g;
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export type ReplaySample = {
  players: FormationPlayer[];
  puck: FormationSide["puck"];
  userId?: number;
  controlledId?: number;
};

/** Linear positions between two adjusted frames. `cursor` is a frame index, and it may sit between frames. */
export function sampleReplay(frames: readonly FormationFrame[], cursor: number): ReplaySample {
  const last = Math.max(0, frames.length - 1);
  const u = Math.max(0, Math.min(last, cursor));
  const i0 = Math.floor(u);
  const i1 = Math.min(last, i0 + 1);
  const t = i1 === i0 ? 0 : u - i0;
  const a = frames[i0]!;
  const b = frames[i1]!;
  const players = a.adjusted.players.map((p) => {
    const q = b.adjusted.players.find((row) => row.index === p.index) ?? p;
    const side = p.side ?? q.side;
    const kind = p.kind ?? q.kind;
    const number = p.number ?? q.number;
    return {
      index: p.index,
      id: p.id,
      x: lerpNum(p.x, q.x, t),
      z: lerpNum(p.z, q.z, t),
      yaw: lerpAngle(p.yaw, q.yaw, t),
      ...(side ? { side } : {}),
      ...(kind ? { kind } : {}),
      ...(number !== undefined ? { number } : {}),
    };
  });
  const ap = a.adjusted.puck;
  const bp = b.adjusted.puck;
  return {
    players,
    puck: {
      x: lerpNum(ap.x, bp.x, t),
      z: lerpNum(ap.z, bp.z, t),
      y: lerpNum(ap.y, bp.y, t),
      owner: ap.owner,
    },
    ...(a.userId !== undefined ? { userId: a.userId } : {}),
    ...(a.controlledId !== undefined ? { controlledId: a.controlledId } : {}),
  };
}

/**
 * Slot in the sorted roster. controlledId prefers a player id, then an index.
 * userId prefers the recorded skater index, then an id. -1 when neither matches.
 */
export function controlledSkaterIndex(
  frame: { userId?: number; controlledId?: number },
  players: readonly FormationPlayer[],
): number {
  const ordered = players.slice().sort((a, b) => a.index - b.index);
  const slot = (n: number | undefined, mode: "id" | "index"): number => {
    if (n === undefined) return -1;
    return ordered.findIndex((p) => (mode === "id" ? p.id === n : p.index === n));
  };
  if (frame.controlledId !== undefined) {
    const byId = slot(frame.controlledId, "id");
    if (byId >= 0) return byId;
    const byIndex = slot(frame.controlledId, "index");
    if (byIndex >= 0) return byIndex;
  }
  if (frame.userId !== undefined) {
    const byIndex = slot(frame.userId, "index");
    if (byIndex >= 0) return byIndex;
    const byId = slot(frame.userId, "id");
    if (byId >= 0) return byId;
  }
  return -1;
}

/** Move the mounted roster. A recorded side, kind, or number replaces the mounted one. */
export function applyReplayPose(players: readonly FormationPlayer[], puck: FormationSide["puck"]): void {
  for (const player of players) {
    const skater = world.skaters.find((s) => s.id === player.id);
    if (!skater) continue;
    skater.x = player.x;
    skater.z = player.z;
    skater.yaw = player.yaw;
    if (player.side) skater.side = player.side;
    if (player.kind) {
      skater.kind = player.kind;
      skater.radius = player.kind === "goalie" ? 0.58 : 0.42;
    }
    if (player.number !== undefined) skater.number = player.number;
  }
  world.puck.x = puck.x;
  world.puck.z = puck.z;
  world.puck.y = puck.y;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.puck.owner = puck.owner;
}
