import {
  bounce,
  BOARD_BOUNCE_DAMP,
  reflectBoard,
  wallTop,
  CORNER_R,
  CREASE_R,
  FACEOFF_R,
  FACEOFF_EZ_X,
  FACEOFF_NZ_X,
  FACEOFF_SPOT_Z,
  FT,
  GOAL_D,
  GOAL_H,
  GOAL_LINE_X,
  GOAL_W,
  BLUE_X,
  BOARD_H,
  GLASS_H,
  cageDepthAt,
  GOAL_PIPE_R,
  iceWidthAtX,
  resolveCage,
  segmentHitsCage,
  resolveRink,
  RINK_L,
  RINK_W,
} from "./rink";
import { readActions, setInjectedKeys, type Actions } from "./input";
import {
  CHAOS_CAP,
  LINEUP_CAP,
  lineupTotal,
  releaseFromBox,
  useGame,
  type CamMode,
  type DrillTargets,
  type Lineup,
  type PlayMode,
} from "./store";

export type SkaterKind = "winger" | "defense" | "goalie";
export type FaceoffPhase = "hold" | "lower" | "fake" | "drop" | "live";

export type Skater = {
  id: number;
  side: "home" | "away";
  kind: SkaterKind;
  number: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  stride: number;
  lean: number;
  bank: number;
  radius: number;
  burst: number;
  deke: number;
  hit: number;
  stun: number;
  poke: number;
  struck: number;
  tumble: number;
  windup: number;
  follow: number;
  trackZ: number;
  trackVz: number;
  celebrate: number;
  smash: number;
  smashKind: number;
  smashHit: number;
  coverPose: number;
  lPad: number;
  rPad: number;
  dive: number;
  gloveFlash: number;
};

export type Puck = {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  owner: number | null;
};

export type DrillGhost = Puck & { age: number; strike: boolean };

export type DrillCard = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  w: number;
  h: number;
  pts: number;
  age: number;
  flutter: number;
};

export function drillFade(age: number): number {
  if (age < 1) return 1;
  if (age >= 1.5) return 0;
  return 1 - (age - 1) / 0.5;
}

export type RefPose = "idle" | "drop" | "goal" | "cover";

export type Referee = {
  x: number;
  z: number;
  yaw: number;
  pose: RefPose;
  poseT: number;
  handY: number;
  vx: number;
  vz: number;
  struck: number;
  tumble: number;
};

export type FreeCam = {
  theta: number;
  phi: number;
  radius: number;
  tx: number;
  ty: number;
  tz: number;
  captured: boolean;
};

export type ReplayCam = {
  theta: number;
  phi: number;
  radius: number;
  lx: number;
  ly: number;
  lz: number;
};

export type BenchDump = {
  id: number;
  t: number;
  dur: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  phase: "fly" | "bench" | "back";
  kind: "help" | "shove";
  gap: boolean;
};

export type BrawlPair = {
  home: number;
  away: number;
  ko: boolean;
  celeb: number;
  hx: number;
  hz: number;
  ax: number;
  az: number;
  homeSwing: number;
  awaySwing: number;
  homeKind: 0 | 1;
  awayKind: 0 | 1;
};

export type LineBrawl = {
  t: number;
  focus: number;
  last: 0 | 1 | 2;
  lastAt: number;
  pairs: BrawlPair[];
};

export type World = {
  time: number;
  skaters: Skater[];
  puck: Puck;
  userId: number;
  lastShoot: number;
  lastPass: number;
  lastPassTo: number | null;
  lastPasser: number | null;
  oneTimerUntil: number;
  faceoff: boolean;
  faceoffT: number;
  faceoffA: boolean;
  faceoffPhase: FaceoffPhase;
  faceoffFakes: number;
  faceoffAimX: number;
  faceoffAimY: number;
  homeDot: number;
  awayDot: number;
  faceX: number;
  faceZ: number;
  camFx: number;
  camFz: number;
  camRx: number;
  camRy: number;
  camRz: number;
  camUx: number;
  camUy: number;
  camUz: number;
  camX: number;
  camY: number;
  camZ: number;
  ref: Referee;
  ref2: Referee;
  stoppage: boolean;
  stoppageT: number;
  coverT: number;
  whistle: "goal" | "cover" | "offside" | "brawl" | null;
  userSx: number;
  userSy: number;
  userVisible: boolean;
  puckSx: number;
  puckSy: number;
  puckVisible: boolean;
  lastShotSlap: boolean;
  lastShotOneTimer: boolean;
  lastShotRedirect: boolean;
  lastShooter: number | null;
  lastShotDist: number;
  lastShotCorner: boolean;
  lastShotCornerSide: number;
  shotWindupT: number;
  oneTimerArmed: boolean;
  oneTimerSlap: boolean;
  oneTimerMx: number;
  oneTimerMy: number;
  oneTimerPass: boolean;
  oneTimerSaucer: boolean;
  puckOz: 0 | 1 | -1;
  delayedOffside: 0 | 1 | -1;
  shotSpeedLive: boolean;
  shotSpeedMax: number;
  windupCancel: boolean;
  wrapBehind: boolean;
  wrapSide: number;
  drillGone: boolean[];
  drillFlash: number[];
  drillShot: boolean;
  drillCheer: number;
  drillGhosts: DrillGhost[];
  drillCards: DrillCard[];
  drillWon: boolean;
  drillElapsed: number;
  drillView: number;
  goalTicker: number;
  goalSide: "home" | "away" | null;
  goalieSaveT: number;
  coverSideZ: number;
  idlePokeT: number;
  aimCompassLock: "up" | "down" | "left" | "right" | null;
  refLane: number;
  ltReturnId: number | null;
  wingL: number | null;
  wingR: number | null;
  offsideCarrier: number | null;
  freeCam: FreeCam;
  pauseDirty: boolean;
  pauseRestoreMode: string;
  replay: boolean;
  replayT: number;
  replayNet: 1 | -1;
  replayKind: "goal" | "pause" | null;
  replayHardCut: boolean;
  replayPlaying: boolean;
  replayCam: ReplayCam;
  goalPuckT: number;
  goalBank: { side: 1 | -1; hits: number[]; i: number; t: number } | null;
  lastPassX: number;
  lastPassZ: number;
  lastOneTimerDanger: number;
  reboundN: number;
  reboundSoft: boolean;
  lastHitter: number | null;
  lastHitTime: number;
  lastUserActT: number;
  periodClock: number;
  periodOver: boolean;
  goalieRecallT: number;
  goalieShot: "score" | "out" | null;
  whiffUntil: number;
  whiffPending: boolean;
  ppRelease: "home" | "away" | null;
  ppChaos: boolean;
  creasePokeN: number;
  creasePokeGoalie: number | null;
  homeAttack: 1 | -1;
  benchDump: BenchDump | null;
  lineBrawl: LineBrawl | null;
};

const WINGER_SPEED = 12.2;
const WINGER_BURST = 15.4;
const WINGER_ACCEL = 22.4;
const DEFENSE_SPEED = 8.4;
const DEFENSE_BURST = 9.8;
const DEFENSE_ACCEL = 13.6;
const ICE_DRAG = 0.85;
const TURN = 8.0;
const PUCK_Y = 0.042;

function cpuMul(kind: "off" | "def" | "g"): number {
  const ui = useGame.getState();
  const t = kind === "off" ? ui.cpuOffense : kind === "def" ? ui.cpuDefense : ui.cpuGoalie;
  const cap = kind === "g" ? 1.6 : 2;
  return 0.55 + Math.max(0, Math.min(cap, t)) * 0.9;
}

function userMul(kind: "off" | "def" | "g"): number {
  const ui = useGame.getState();
  const t = kind === "off" ? ui.userOffense : kind === "def" ? ui.userDefense : ui.userGoalie;
  const cap = kind === "def" ? 2 : kind === "off" ? 1.2 : 1;
  return 0.55 + Math.max(0, Math.min(cap, t)) * 0.9;
}

function userIdle(): boolean {
  return world.time - world.lastUserActT > 1.6;
}

function shotFromOutsideOz(): boolean {
  return world.lastShotDist > GOAL_LINE_X - BLUE_X + 0.4;
}
const HOLD_T = 0.32;
const LOWER_T = 0.28;
const FAKE_T = 0.32;
const DROP_FLY_T = 0.18;
const COVER_HOLD = 2.0;
const GOALIE_HOLD = 0.5;
const playLooseMem = new Map<number, { key: string; yes: boolean }>();
const PRESS_JOIN = 9.2;
const pressPeelAt = new Map<number, number>();
const pressPeelEnd = new Map<number, number>();
let stickLooseUntil = -1;
let stickLooseBy = -1;
let stickLooseFrom = -1;
let pressCacheT = Number.NaN;
let pressPrimary = -1;
let pressSecond = -1;
type OzSpot = "slot" | "high" | "circle" | "net" | "bumper" | "hash";
const ozHold = new Map<
  number,
  { tx: number; tz: number; until: number; picked: number; calm: boolean; settled: number }
>();
const REF_STAND = 0.68;
const REF_BOARD_Z = RINK_W / 2 - 1.15;

function dropperLane(): 1 | -1 {
  if (useGame.getState().clockMode === "practice") return 1;
  if (Math.abs(world.faceZ) > 0.8) return world.faceZ >= 0 ? 1 : -1;
  return world.refLane >= 0 ? 1 : -1;
}

function refsOnIce(): Referee[] {
  const mode = useGame.getState().clockMode;
  if (mode === "practice") return [world.ref];
  if (mode === "drill") return [world.ref2];
  return [world.ref, world.ref2];
}

function refForLane(lane: number): Referee {
  return lane >= 0 ? world.ref : world.ref2;
}

function placeRefsForFaceoff(): void {
  const dLane = dropperLane();
  const drop = refForLane(dLane);
  const other = refForLane(-dLane);
  drop.x = world.faceX;
  drop.z = world.faceZ + dLane * REF_STAND;
  drop.yaw = 0;
  drop.pose = "drop";
  drop.poseT = 0;
  drop.handY = 1.38;
  drop.vx = 0;
  drop.vz = 0;
  drop.struck = 0;
  drop.tumble = 0;
  refStayPut.delete(drop);
  other.x = world.faceX;
  other.z = -dLane * REF_BOARD_Z;
  other.yaw = 0;
  other.pose = "idle";
  other.poseT = 0;
  other.handY = 1.38;
  other.vx = 0;
  other.vz = 0;
  other.struck = 0;
  other.tumble = 0;
  refStayPut.delete(other);
  if (useGame.getState().clockMode === "practice") {
    world.ref2.x = 0;
    world.ref2.z = -80;
    world.ref2.vx = 0;
    world.ref2.vz = 0;
    world.ref2.struck = 0;
    world.ref2.tumble = 0;
    refStayPut.delete(world.ref2);
  }
}

function refBackInPlay(): boolean {
  if (world.stoppage) return false;
  if (world.faceoff && world.faceoffPhase !== "live") return false;
  if (world.drillWon && world.goalTicker > 0) return false;
  return true;
}

function holdCheckedRef(r: Referee, netX: number, dt: number): void {
  r.vx = 0;
  r.vz = 0;
  r.yaw = turnToward(r.yaw, netX - r.x, -r.z, 10, dt);
  r.pose = "goal";
}

const HOME_NUMS = { g: [41, 39], d: [8, 7, 84, 42], o: [29, 92, 88, 62, 11, 10] };

function rollAwayNums(): { g: number[]; d: number[]; o: number[] } {
  const used = new Set<number>();
  const pick = () => {
    let n = 1 + Math.floor(Math.random() * 98);
    while (used.has(n)) n = 1 + Math.floor(Math.random() * 98);
    used.add(n);
    return n;
  };
  return {
    g: [pick(), pick()],
    d: [pick(), pick(), pick(), pick()],
    o: [pick(), pick(), pick(), pick(), pick(), pick()],
  };
}

let awayNums = rollAwayNums();

export function benchGoalieNumber(side: "home" | "away", onIceG: number): number {
  const nums = side === "home" ? HOME_NUMS : awayNums;
  if (onIceG >= 1) return nums.g[1] ?? nums.g[0] ?? 30;
  return nums.g[0] ?? 1;
}

export function penaltyNumbers(side: "home" | "away", lu: Lineup): number[] {
  const nums = side === "home" ? HOME_NUMS : awayNums;
  const unused: number[] = [];
  for (let i = lu.o; i < 3; i++) {
    const n = nums.o[i];
    if (n != null) unused.push(n);
  }
  for (let i = lu.d; i < 2; i++) {
    const n = nums.d[i];
    if (n != null) unused.push(n);
  }
  if (lu.g < 1 && nums.g[0] != null) unused.push(nums.g[0]);
  const cap = useGame.getState().clockMode === "scrimmage" ? 5 : 6;
  return unused.slice(0, Math.max(0, cap - lineupTotal(lu)));
}

let refLaneLocked = false;

export const world: World = {
  time: 0,
  skaters: [],
  puck: { x: 0, z: 0, y: 0.9, vx: 0, vz: 0, vy: 0, owner: null },
  userId: 0,
  lastShoot: -10,
  lastPass: -10,
  lastPassTo: null,
  lastPasser: null,
  oneTimerUntil: -10,
  faceoff: true,
  faceoffT: 0,
  faceoffA: false,
  faceoffPhase: "hold",
  faceoffFakes: 0,
  faceoffAimX: 0,
  faceoffAimY: 0,
  homeDot: 0,
  awayDot: 0,
  faceX: 0,
  faceZ: 0,
  camFx: 1,
  camFz: 0,
  camRx: 0,
  camRy: 0,
  camRz: 1,
  camUx: 0,
  camUy: 1,
  camUz: 0,
  camX: 0,
  camY: 8,
  camZ: 0,
  ref: { x: 0, z: 1.12, yaw: 0, pose: "drop", poseT: 0, handY: 1.38, vx: 0, vz: 0, struck: 0, tumble: 0 },
  ref2: { x: 0, z: -12.8, yaw: 0, pose: "idle", poseT: 0, handY: 1.38, vx: 0, vz: 0, struck: 0, tumble: 0 },
  stoppage: false,
  stoppageT: 0,
  coverT: 0,
  whistle: null,
  userSx: 0,
  userSy: 0,
  userVisible: true,
  puckSx: 0,
  puckSy: 0,
  puckVisible: true,
  lastShotSlap: false,
  lastShotOneTimer: false,
  lastShotRedirect: false,
  lastShooter: null,
  lastShotDist: 0,
  lastShotCorner: false,
  lastShotCornerSide: 0,
  shotWindupT: 0,
  oneTimerArmed: false,
  oneTimerSlap: false,
  oneTimerMx: 0,
  oneTimerMy: 0,
  oneTimerPass: false,
  oneTimerSaucer: false,
  puckOz: 0,
  delayedOffside: 0,
  shotSpeedLive: false,
  shotSpeedMax: 0,
  windupCancel: false,
  wrapBehind: false,
  wrapSide: 0,
  drillGone: [false, false, false, false, false, false, false, false],
  drillFlash: [0, 0, 0, 0, 0, 0, 0, 0],
  drillShot: false,
  drillCheer: 0,
  drillGhosts: [],
  drillCards: [],
  drillWon: false,
  drillElapsed: 0,
  drillView: 0,
  goalTicker: 0,
  goalSide: null,
  goalieSaveT: -10,
  coverSideZ: 0,
  idlePokeT: 0,
  aimCompassLock: null,
  refLane: 1,
  ltReturnId: null,
  wingL: null,
  wingR: null,
  offsideCarrier: null,
  freeCam: { theta: Math.PI * 0.5, phi: 0.72, radius: 28, tx: 0, ty: 0.5, tz: 0, captured: false },
  pauseDirty: false,
  pauseRestoreMode: "classic",
  replay: false,
  replayT: 0,
  replayNet: 1,
  replayKind: null,
  replayHardCut: false,
  replayPlaying: true,
  replayCam: { theta: 2.2, phi: 0.82, radius: 14, lx: 0, ly: 0.5, lz: 0 },
  goalPuckT: 0,
  goalBank: null,
  lastPassX: 0,
  lastPassZ: 0,
  lastOneTimerDanger: 0,
  reboundN: 0,
  reboundSoft: false,
  lastHitter: null,
  lastHitTime: -10,
  lastUserActT: 0,
  periodClock: 1200,
  periodOver: false,
  goalieRecallT: 0,
  goalieShot: null,
  whiffUntil: -10,
  whiffPending: false,
  ppRelease: null,
  ppChaos: false,
  creasePokeN: 0,
  creasePokeGoalie: null,
  homeAttack: Math.random() < 0.5 ? 1 : -1,
  benchDump: null,
  lineBrawl: null,
};

function heading(yaw: number): { fx: number; fz: number } {
  return { fx: -Math.sin(yaw), fz: -Math.cos(yaw) };
}

function turnToward(yaw: number, tx: number, tz: number, rate: number, dt: number): number {
  const desired = Math.atan2(-tx, -tz);
  let d = desired - yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const max = rate * dt;
  if (d > max) d = max;
  if (d < -max) d = -max;
  return yaw + d;
}

function makeSkater(
  id: number,
  side: "home" | "away",
  kind: SkaterKind,
  number: number,
  x: number,
  z: number,
): Skater {
  return {
    id,
    side,
    kind,
    number,
    x,
    z,
    vx: 0,
    vz: 0,
    yaw: faceYaw(side),
    stride: id * 0.7,
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
  };
}

function laneZ(count: number, i: number, span: number): number {
  if (count <= 1) return 0;
  return -span + (2 * span * i) / (count - 1);
}

function spawnSide(side: "home" | "away", lu: Lineup, startId: number): Skater[] {
  const sign = defendDir(side);
  const nums = side === "home" ? HOME_NUMS : awayNums;
  const out: Skater[] = [];
  let id = startId;
  const netX = sign * (GOAL_LINE_X - 0.9);

  if (lu.g > 0) {
    out.push(makeSkater(id++, side, "goalie", nums.g[0]!, netX, 0));
  }
  for (let i = 0; i < lu.d; i++) {
    const z = laneZ(lu.d, i, 4.4);
    out.push(makeSkater(id++, side, "defense", nums.d[i] ?? 5 + i, sign * 16, z));
  }
  for (let i = 0; i < lu.o; i++) {
    const z = laneZ(lu.o, i, 5.4);
    const x = sign * (7.2 + (i % 2) * 2.4);
    out.push(makeSkater(id++, side, "winger", nums.o[i] ?? 10 + i, x, z));
  }
  return out;
}

function parkFaceoffWingers(skaters: Skater[], homeDot: number, awayDot: number): void {
  const ox = world.faceX;
  const oz = world.faceZ;
  for (const side of ["home", "away"] as const) {
    const sign = defendDir(side);
    const skip = side === "home" ? homeDot : awayDot;
    const extras = skaters.filter((s) => s.side === side && s.kind === "winger" && s.id !== skip);
    const ds = skaters.filter((s) => s.side === side && s.kind === "defense");
    const hashFourth = extras.length === 3 && ds.length === 1;
    extras.forEach((s, i) => {
      if (hashFourth && i === 1) {
        const hashZ = (world.refLane >= 0 ? 1 : -1) * 3.4;
        s.x = ox + sign * (FACEOFF_R + 1.05);
        s.z = oz + hashZ;
        s.vx = 0;
        s.vz = 0;
        s.yaw = faceYaw(side);
        return;
      }
      const zSpread = extras.length <= 1 ? FACEOFF_R + 0.5 : FACEOFF_R + 0.55;
      const zOff = extras.length === 1 ? zSpread * (side === "home" ? 1 : -1) : laneZ(extras.length, i, zSpread);
      let x = ox + sign * 0.42;
      let z = oz + zOff;
      const dx = x - ox;
      const dz = z - oz;
      const d = Math.hypot(dx, dz);
      const min = FACEOFF_R + 0.42;
      if (d < min && d > 1e-4) {
        const k = min / d;
        x = ox + dx * k;
        z = oz + dz * k;
      }
      s.x = x;
      s.z = z;
      s.vx = 0;
      s.vz = 0;
      s.yaw = faceYaw(side);
    });
    ds.filter((s) => s.id !== skip).forEach((s, i) => {
      const left = ds.filter((d) => d.id !== skip);
      const zOff = laneZ(Math.max(1, left.length), i, 3.4);
      s.x = ox + sign * (FACEOFF_R + 1.05);
      s.z = oz + zOff;
      s.vx = 0;
      s.vz = 0;
      s.yaw = faceYaw(side);
    });
  }
}

function placeFaceoff(skaters: Skater[]): { userId: number; homeDot: number; awayDot: number } {
  const homeSkate = skaters.filter((s) => s.side === "home" && s.kind !== "goalie");
  const awaySkate = skaters.filter((s) => s.side === "away" && s.kind !== "goalie");
  const user =
    homeSkate.find((s) => s.kind === "winger") ?? homeSkate[0] ?? skaters.find((s) => s.side === "home");
  const userId = user?.id ?? -1;
  const ox = world.faceX;
  const oz = world.faceZ;
  if (user) {
    user.x = ox + defendDir("home") * 1.15;
    user.z = oz;
    user.yaw = faceYaw("home");
    user.vx = 0;
    user.vz = 0;
  }
  const foe = awaySkate.find((s) => s.kind === "winger") ?? awaySkate[0];
  if (foe) {
    foe.x = ox + defendDir("away") * 1.15;
    foe.z = oz;
    foe.yaw = faceYaw("away");
    foe.vx = 0;
    foe.vz = 0;
  }
  const homeDot = user?.id ?? 0;
  const awayDot = foe?.id ?? -1;
  parkFaceoffWingers(skaters, homeDot, awayDot);
  return { userId, homeDot, awayDot };
}

function resetSkaters(): void {
  if (world.whistle === "cover") {
    let g: Skater | undefined;
    let bestPose = -1;
    for (const s of world.skaters) {
      if (s.kind !== "goalie") continue;
      if (s.coverPose > bestPose) {
        bestPose = s.coverPose;
        g = s;
      }
    }
    chooseCoverFaceoff(bestPose > 0.2 ? g : undefined);
  }
  const ui = useGame.getState();
  const side = world.ppRelease;
  const cap = world.ppChaos ? CHAOS_CAP : LINEUP_CAP;
  world.ppRelease = null;
  world.ppChaos = false;
  let homeLu = ui.liveHome;
  let awayLu = ui.liveAway;
  if (side === "home") {
    homeLu = releaseFromBox(homeLu, cap);
    ui.setLiveHome(homeLu);
  } else if (side === "away") {
    awayLu = releaseFromBox(awayLu, cap);
    ui.setLiveAway(awayLu);
  }
  const home = spawnSide("home", homeLu, 0);
  const away = spawnSide("away", awayLu, home.length);
  const skaters = [...home, ...away];
  const { userId, homeDot, awayDot } = placeFaceoff(skaters);
  const prevKey = world.skaters.map((s) => `${s.side}:${s.kind}:${s.number}`).join("|");
  const nextKey = skaters.map((s) => `${s.side}:${s.kind}:${s.number}`).join("|");
  world.skaters = skaters;
  if (prevKey !== nextKey) ui.bumpLineup();
  world.userId = userId;
  world.homeDot = homeDot;
  world.awayDot = awayDot;
  world.puck = { x: world.faceX, z: world.faceZ, y: 1.38, vx: 0, vz: 0, vy: 0, owner: null };
  world.time = 0;
  world.lastShoot = -10;
  world.lastPass = -10;
  world.lastPassTo = null;
  world.lastPasser = null;
  world.oneTimerUntil = -10;
  world.faceoff = skaters.length > 0;
  world.faceoffT = 0;
  world.faceoffA = false;
  world.faceoffPhase = "hold";
  world.faceoffFakes = 0;
  world.faceoffAimX = 0;
  world.faceoffAimY = 0;
  if (!refLaneLocked) {
    world.refLane = Math.random() < 0.5 ? 1 : -1;
    refLaneLocked = true;
  }
  placeRefsForFaceoff();
  world.stoppage = false;
  world.stoppageT = 0;
  world.coverT = 0;
  world.whistle = null;
  world.lastShotSlap = false;
  world.lastShotOneTimer = false;
  world.lastShotRedirect = false;
  world.lastShooter = null;
  world.lastShotDist = 0;
  world.lastShotCorner = false;
  world.lastShotCornerSide = 0;
  shotIron = null;
  ironResolved = null;
  rimRide = null;
  boardRide = null;
  boardBank = null;
  overWall.delete(world.puck);
  world.shotWindupT = 0;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  world.oneTimerMx = 0;
  world.oneTimerMy = 0;
  world.puckOz = 0;
  world.delayedOffside = 0;
  world.shotSpeedLive = false;
  world.shotSpeedMax = 0;
  world.windupCancel = false;
  world.wrapBehind = false;
  world.wrapSide = 0;
  world.goalieSaveT = -10;
  world.coverSideZ = 0;
  world.idlePokeT = 0;
  world.ltReturnId = null;
  world.wingL = null;
  world.wingR = null;
  world.offsideCarrier = null;
  world.drillWon = false;
  world.drillElapsed = 0;
  world.goalieRecallT = 0;
  playLooseMem.clear();
  pressPeelAt.clear();
  pressPeelEnd.clear();
  stickLooseUntil = -1;
  stickLooseBy = -1;
  stickLooseFrom = -1;
  userStickCommit = false;
  ozHold.clear();
  pressCacheT = Number.NaN;
  pressPrimary = -1;
  pressSecond = -1;
  world.goalieShot = null;
  world.whiffUntil = -10;
  world.whiffPending = false;
  world.creasePokeN = 0;
  world.creasePokeGoalie = null;
  world.pauseDirty = false;
  world.replay = false;
  world.replayT = 0;
  world.replayNet = 1;
  world.replayKind = null;
  world.replayHardCut = false;
  world.replayPlaying = true;
  world.goalPuckT = 0;
  world.goalBank = null;
  world.lastPassX = 0;
  world.lastPassZ = 0;
  world.lastOneTimerDanger = 0;
  world.reboundN = 0;
  world.reboundSoft = false;
  world.lastHitter = null;
  world.lastHitTime = -10;
  world.lastUserActT = world.time;
}

let rimRide: { sideZ: 1 | -1; attack: 1 | -1; until: number } | null = null;
let boardRide: { dir: 1 | -1; speed: number; until: number; phase: "seek" | "glide" } | null = null;
const overWall = new WeakSet<Puck>();
let boardBank: { hx: number; hz: number; vx: number; vz: number; until: number; loft: boolean } | null = null;
let userWinding = false;
let userStickCommit = false;
let slapMx = 0;
let slapMy = 0;
let cpuOtKey = -1;
let cpuOtId = -2;
let cpuOtYes = false;
let shotIron: { kind: "post" | "bar"; z: number; y: number } | null = null;
let ironResolved: "in" | "back" | "out" | null = null;
let drillPipeHit = false;
let drillFromPass = false;
let drillPassSide = false;
let drillPuckLive = false;
let drillRecastAt = Infinity;
let drillFlightStashed = false;
let drillNetTouch = false;
let steppingGhost = false;
const drillSettledUntil = new WeakMap<Puck, number>();
let drillWinPuck: Puck | null = null;
let drillWinAt = -10;
let drillWinKicked = false;
let drillWinLodged = false;
let drillEncoreLive = false;
let drillEncoreAt = -10;
let drillEncoreShots = 0;
let drillPuckFrozen = false;
let drillPin: { x: number; y: number; z: number } | null = null;
let drillWinPin: { x: number; y: number; z: number } | null = null;

function drillGhostScoring(): boolean {
  return world.drillGhosts.some((g) => g.strike);
}

function releaseDrillShotState(): void {
  if (drillPuckLive || drillGhostScoring()) return;
  world.drillShot = false;
  drillFromPass = false;
  drillPassSide = false;
}

export type DrillTarget = { col: number; row: number; pts: number };

const DRILL_SECONDS = 60;

function buildDrillTargets(cols: number, rows: number, cornersOnly = false): DrillTarget[] {
  const out: DrillTarget[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const top = row === rows - 1;
      const side = col === 0 || col === cols - 1;
      const corner = (row === rows - 1 || row === 0) && side;
      if (cornersOnly) {
        if (!corner) continue;
      } else if (!top && !side) continue;
      out.push({ col, row, pts: cornersOnly ? 10 : corner ? 20 : 10 });
    }
  }
  return out;
}

const DRILL_4 = buildDrillTargets(4, 3, true);
const DRILL_8 = buildDrillTargets(4, 3);
const DRILL_12 = buildDrillTargets(6, 4);
const DRILL_16 = buildDrillTargets(8, 5);

let drillPromote = false;

export function drillTargetList(): DrillTarget[] {
  const n = useGame.getState().drillTargets;
  if (n === 4) return DRILL_4;
  if (n === 12) return DRILL_12;
  if (n === 16) return DRILL_16;
  return DRILL_8;
}

export function drillGrid(): { cols: number; rows: number } {
  const n = useGame.getState().drillTargets;
  if (n === 16) return { cols: 8, rows: 5 };
  if (n === 12) return { cols: 6, rows: 4 };
  return { cols: 4, rows: 3 };
}

function applyDrillPromote(): void {
  if (!drillPromote) return;
  drillPromote = false;
  const cur = useGame.getState().drillTargets;
  const next: DrillTargets = cur === 4 ? 8 : cur === 8 ? 12 : cur === 12 ? 16 : 16;
  if (next !== cur) useGame.getState().setDrillTargets(next);
}

export function drillMaxScore(): number {
  return drillTargetList().reduce((sum, t) => sum + t.pts, 0);
}

export function drillCellIndex(y: number, z: number): number {
  const { cols, rows } = drillGrid();
  const hw = GOAL_W / 2;
  if (y < 0 || y > GOAL_H || Math.abs(z) > hw) return -1;
  const col = Math.min(cols - 1, Math.max(0, Math.floor(((z + hw) / GOAL_W) * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((y / GOAL_H) * rows)));
  return drillTargetList().findIndex((t) => t.col === col && t.row === row);
}

function drill16MouthCell(lat: number, hgt: number, zSign: number): { col: number; row: number } | null {
  const half = GOAL_W / 2;
  let tZ = Math.max(-1, Math.min(1, lat)) * (half - 0.16) * zSign;
  let wantY = shotHeight(hgt).wantY;
  tZ = Math.max(-half + 0.12, Math.min(half - 0.12, tZ));
  wantY = Math.max(PUCK_Y, Math.min(mouthTopY(), wantY));
  if (wantY < 0 || wantY > GOAL_H || Math.abs(tZ) > half) return null;
  const cols = 8;
  const rows = 5;
  return {
    col: Math.min(cols - 1, Math.max(0, Math.floor(((tZ + half) / GOAL_W) * cols))),
    row: Math.min(rows - 1, Math.max(0, Math.floor((wantY / GOAL_H) * rows))),
  };
}

function drill16CornerSpot(lat: number, hgt: number, zSign: number): { tZ: number; wantY: number } | null {
  const ui = useGame.getState();
  if (ui.clockMode !== "drill" || ui.drillTargets !== 16) return null;
  const cell = drill16MouthCell(lat, hgt, zSign);
  if (!cell) return null;
  const cols = 8;
  const rows = 5;
  const side = cell.col === 0 || cell.col === cols - 1;
  const top = cell.row === rows - 1;
  const corner = (cell.row === 0 || cell.row === rows - 1) && side;
  let col = cell.col;
  let row = cell.row;
  if (!corner) {
    if (top || side) return null;
    if (Math.hypot(lat, hgt) < 0.8) return null;
    const nearC = cell.col === 1 ? 0 : cell.col === cols - 2 ? cols - 1 : -1;
    const nearR = cell.row <= 1 ? 0 : cell.row >= rows - 2 ? rows - 1 : -1;
    if (nearC < 0 || nearR < 0) return null;
    col = nearC;
    row = nearR;
  }
  const half = GOAL_W / 2;
  const colW = GOAL_W / cols;
  const rowH = GOAL_H / rows;
  const z0 = -half + col * colW;
  const z1 = z0 + colW;
  const zLo = Math.min(z0, z1);
  const zHi = Math.max(z0, z1);
  const tZ = col === 0 ? (zLo + 0.16 + zHi - 0.04) / 2 : (zLo + 0.04 + zHi - 0.16) / 2;
  const wantY = row === 0 ? rowH * 0.42 : 4 * rowH + rowH * 0.22;
  return { tZ, wantY };
}

function drill16CornerIndex(y: number, z: number): number {
  if (useGame.getState().drillTargets !== 16) return -1;
  const i = drillCellIndex(y, z);
  if (i < 0) return -1;
  return drillTargetList()[i]!.pts === 20 ? i : -1;
}

function drill16EnteredCorner(
  prevX: number,
  prevY: number,
  prevZ: number,
  x: number,
  y: number,
  z: number,
): number {
  const mouth = GOAL_LINE_X;
  if ((prevX - mouth) * (x - mouth) <= 0 && x !== prevX && prevX < mouth) {
    const t = (mouth - prevX) / (x - prevX || 1);
    const hit = drill16CornerIndex(prevY + (y - prevY) * t, prevZ + (z - prevZ) * t);
    if (hit >= 0) return hit;
  }
  if (x > mouth - 0.12 && x < mouth + 0.2) {
    const hit = drill16CornerIndex(y, z);
    if (hit >= 0) return hit;
  }
  if (prevX > mouth - 0.12 && prevX < mouth + 0.2) {
    const hit = drill16CornerIndex(prevY, prevZ);
    if (hit >= 0) return hit;
  }
  return -1;
}

function resetDrill(): void {
  const n = drillTargetList().length;
  world.drillGone = Array.from({ length: n }, () => false);
  world.drillFlash = Array.from({ length: n }, () => 0);
  world.drillShot = false;
  world.drillWon = false;
  world.drillElapsed = 0;
  world.drillCheer = 0;
  world.drillGhosts = [];
  world.drillCards = [];
  drillPipeHit = false;
  drillFromPass = false;
  drillPassSide = false;
  drillPuckLive = false;
  drillRecastAt = Infinity;
  drillFlightStashed = false;
  drillNetTouch = false;
  drillSettledUntil.delete(world.puck);
  drillWinPuck = null;
  drillWinAt = -10;
  drillWinKicked = false;
  drillWinLodged = false;
  drillEncoreLive = false;
  drillEncoreAt = -10;
  drillEncoreShots = 0;
  drillPuckFrozen = false;
  drillPin = null;
  drillWinPin = null;
  useGame.getState().setDrillScore(0);
}

function spawnDrillGhost(p: Puck, strike = false): void {
  const g: DrillGhost = {
    x: p.x,
    y: p.y,
    z: p.z,
    vx: p.vx,
    vy: p.vy,
    vz: p.vz,
    owner: null,
    age: 0,
    strike,
  };
  const until = drillSettledUntil.get(p);
  if (until !== undefined) drillSettledUntil.set(g, until);
  world.drillGhosts.push(g);
}

function spawnDrillCard(i: number): void {
  const t = drillTargetList()[i];
  if (!t) return;
  const { cols, rows } = drillGrid();
  const hw = GOAL_W / 2;
  const colW = GOAL_W / cols;
  const rowH = GOAL_H / rows;
  const y = (t.row + 0.5) * rowH;
  const z = -hw + (t.col + 0.5) * colW;
  const kick = 3.4 + Math.random() * 2.1;
  world.drillCards.push({
    x: GOAL_LINE_X - 0.05,
    y,
    z,
    vx: -kick,
    vy: 1.15 + Math.random() * 1.5,
    vz: world.puck.vz * 0.05 + (Math.random() - 0.5) * 1.7,
    rx: (Math.random() - 0.5) * 0.25,
    ry: (Math.random() - 0.5) * 0.45,
    rz: Math.PI / 2 + (Math.random() - 0.5) * 0.18,
    sx: (Math.random() - 0.5) * 16,
    sy: (Math.random() - 0.5) * 12,
    sz: (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 8),
    w: rowH * 0.88,
    h: colW * 0.88,
    pts: t.pts,
    age: 0,
    flutter: Math.random() * Math.PI * 2,
  });
}

function easeAngle(cur: number, target: number, k: number, dt: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, k * dt);
}

function stepDrillGhosts(dt: number): void {
  if (world.drillGhosts.length === 0) {
    releaseDrillShotState();
    return;
  }
  steppingGhost = true;
  for (const g of world.drillGhosts) {
    g.age += dt;
    if (drillWinLodged && drillWinPin && g === drillWinPuck) {
      g.x = drillWinPin.x;
      g.y = drillWinPin.y;
      g.z = drillWinPin.z;
      g.vx = 0;
      g.vy = 0;
      g.vz = 0;
      g.owner = null;
      g.strike = false;
      continue;
    }
    const prevX = g.x;
    const prevY = g.y;
    const prevZ = g.z;
    g.x += g.vx * dt;
    g.z += g.vz * dt;
    g.y += g.vy * dt;
    g.vy -= 12 * dt;
    if (g.y <= PUCK_Y) {
      g.y = PUCK_Y;
      if (g.vy < 0) g.vy *= -0.28;
      if (Math.abs(g.vy) < 0.4) g.vy = 0;
    }
    const damp = Math.exp(-0.35 * dt);
    g.vx *= damp;
    g.vz *= damp;
    containPuckBoards(g);
    const shotX = g.x;
    const shotY = g.y;
    const shotZ = g.z;
    bouncePuckCage(g, prevX, prevZ, prevY);
    containPuckBoards(g);
    if (g.strike) {
      const strike = strikeDrillMouth(prevX, prevY, prevZ, g.x, g.y, g.z, shotX, shotY, shotZ, g);
      if (strike.crossed || strike.hit || g.age >= 2.5) g.strike = false;
    }
    if (drillWinLodged && drillWinPin && g === drillWinPuck) {
      g.x = drillWinPin.x;
      g.y = drillWinPin.y;
      g.z = drillWinPin.z;
      g.vx = 0;
      g.vy = 0;
      g.vz = 0;
      g.owner = null;
      g.strike = false;
      continue;
    }
    drillReboundNet(g);
  }
  steppingGhost = false;
  if (world.drillGhosts.some((g) => g.age >= 1.5 && !g.strike && !(drillWinLodged && g === drillWinPuck))) {
    world.drillGhosts = world.drillGhosts.filter(
      (g) => g.age < 1.5 || g.strike || (drillWinLodged && g === drillWinPuck),
    );
  }
  releaseDrillShotState();
}

function stepDrillCards(dt: number): void {
  if (world.drillCards.length === 0) return;
  for (const c of world.drillCards) {
    c.age += dt;
    const air = c.y > 0.08;
    if (air) {
      const f = Math.sin(c.age * 21 + c.flutter);
      c.vy += f * 4.5 * dt;
      c.sx += Math.cos(c.age * 16 + c.flutter) * 9 * dt;
      c.sz += f * 7 * dt;
      c.vx *= Math.exp(-0.35 * dt);
      c.vz *= Math.exp(-0.35 * dt);
      c.sx *= Math.exp(-0.4 * dt);
      c.sy *= Math.exp(-0.4 * dt);
      c.sz *= Math.exp(-0.4 * dt);
    }
    c.vy -= 11 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.z += c.vz * dt;
    c.rx += c.sx * dt;
    c.ry += c.sy * dt;
    c.rz += c.sz * dt;
    const spinning = Math.hypot(c.sx, c.sy, c.sz);
    const floor = spinning > 2.2 ? 0.055 : 0.016;
    if (c.y <= floor) {
      c.y = floor;
      if (c.vy < 0) c.vy = Math.abs(c.vy) * 0.16;
      c.vx *= Math.exp(-1.6 * dt);
      c.vz *= Math.exp(-1.6 * dt);
      c.sx *= Math.exp(-3.4 * dt);
      c.sy *= Math.exp(-2.4 * dt);
      c.sz *= Math.exp(-3.4 * dt);
      if (Math.abs(c.vy) < 0.4) {
        c.vy = 0;
        c.rx = easeAngle(c.rx, Math.round(c.rx / Math.PI) * Math.PI, 11, dt);
        c.rz = easeAngle(c.rz, Math.round(c.rz / Math.PI) * Math.PI, 11, dt);
      }
    }
    const ice = resolveRink(c.x, c.z, 0.18);
    if (ice.hit) {
      c.x = ice.x;
      c.z = ice.z;
      const b = bounce(c.vx, c.vz, ice.nx, ice.nz, 0.22);
      c.vx = b.vx;
      c.vz = b.vz;
    }
  }
  if (world.drillCards.some((c) => c.age >= 1.5)) {
    world.drillCards = world.drillCards.filter((c) => c.age < 1.5);
  }
}

function giveUserPuck(): void {
  const u = world.skaters.find((s) => s.id === world.userId) ?? world.skaters.find((s) => s.side === "home");
  if (!u) return;
  world.userId = u.id;
  const b = stickBlade(u);
  world.puck.owner = u.id;
  world.puck.x = b.x;
  world.puck.z = b.z;
  world.puck.y = PUCK_Y;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  drillPuckLive = false;
  drillFromPass = false;
  drillPassSide = false;
  drillSettledUntil.delete(world.puck);
  if (!drillGhostScoring()) world.drillShot = false;
  useGame.getState().setHasPuck(true);
}

function recycleDrillPuck(strike = false): void {
  spawnDrillGhost(world.puck, strike);
  giveUserPuck();
}

function drillScoreSoft(puck: Puck): boolean {
  const until = drillSettledUntil.get(puck);
  return until !== undefined && world.time < until;
}

function clampDrillScoreSpeed(puck: Puck): void {
  const sp = Math.hypot(puck.vx, puck.vz);
  if (sp > 1.35) {
    const s = 1.35 / sp;
    puck.vx *= s;
    puck.vz *= s;
  }
  if (puck.vy > 1.1) puck.vy = 1.1;
  else if (puck.vy < -1.1) puck.vy = -1.1;
}

function buryDrillScore(puck: Puck, i: number): void {
  const t = drillTargetList()[i];
  if (!t) return;
  const { cols, rows } = drillGrid();
  const hw = GOAL_W / 2;
  const colW = GOAL_W / cols;
  const rowH = GOAL_H / rows;
  const z = Math.max(-hw + 0.14, Math.min(hw - 0.14, -hw + (t.col + 0.5) * colW));
  const y = Math.max(PUCK_Y, Math.min(GOAL_H - 0.1, (t.row + 0.5) * rowH));
  const side = 1;
  const mouth = side * GOAL_LINE_X;
  const depth = Math.max(0.08, cageDepthAt(z, Math.min(y, GOAL_H)));
  let inset = Math.min(0.16, Math.max(0.07, depth * 0.4));
  if (inset > depth - 0.05) inset = Math.max(0.03, depth - 0.05);
  puck.x = mouth + side * inset;
  puck.y = y;
  puck.z = z;
  const trickle = (i % 5) / 4;
  const out = 0.2 + trickle * 1.05;
  puck.vx = -side * out;
  puck.vz = ((i % 3) - 1) * 0.22;
  puck.vy = y > PUCK_Y + 0.2 ? -0.35 : 0.05;
  drillSettledUntil.set(puck, world.time + 0.7);
}

function hitDrillTarget(i: number, puck?: Puck): void {
  if (i < 0 || world.drillGone[i]) return;
  world.drillGone[i] = true;
  spawnDrillCard(i);
  const pts = drillTargetList()[i]!.pts;
  const ui = useGame.getState();
  ui.setDrillScore(ui.drillScore + pts);
  world.goalSide = "home";
  world.goalTicker = 0.48;
  world.drillCheer = 0.48;
  ui.setGoalSide("home");
  let wonNow = false;
  if (world.drillGone.length > 0 && world.drillGone.every(Boolean)) {
    world.drillWon = true;
    wonNow = true;
    drillPromote = true;
    world.drillElapsed = Math.max(0, DRILL_SECONDS - world.periodClock);
    world.goalTicker = 8;
    world.drillCheer = 8;
    const u = world.skaters[world.userId];
    if (u) {
      u.celebrate = 8;
      world.lastShooter = u.id;
    }
    world.ref2.pose = "goal";
    world.ref2.poseT = 0;
  }
  if (puck) buryDrillScore(puck, i);
  if (wonNow) noteDrillWin(puck);
}

function strikeDrillMouth(
  prevX: number,
  prevY: number,
  prevZ: number,
  x: number,
  y: number,
  z: number,
  shotX: number,
  shotY: number,
  shotZ: number,
  puck?: Puck,
): { crossed: boolean; hit: boolean } {
  const mouth = GOAL_LINE_X;
  const crossed = (prevX - mouth) * (x - mouth) <= 0 && x !== prevX && prevX < mouth;
  let i = -1;
  if (crossed) {
    const t = (mouth - prevX) / (x - prevX || 1);
    const hy = prevY + (y - prevY) * t;
    const hz = prevZ + (z - prevZ) * t;
    i = drillCellIndex(hy, hz);
    if (i < 0) i = drillCellIndex(y, z);
    if (i < 0) i = drill16EnteredCorner(prevX, prevY, prevZ, shotX, shotY, shotZ);
  } else {
    i = drill16EnteredCorner(prevX, prevY, prevZ, shotX, shotY, shotZ);
  }
  if (i >= 0 && !world.drillGone[i]) {
    hitDrillTarget(i, puck);
    return { crossed, hit: true };
  }
  return { crossed, hit: false };
}

function tickDrill(
  dt: number,
  prevX: number,
  prevY: number,
  prevZ: number,
  shotX: number,
  shotY: number,
  shotZ: number,
): boolean {
  if (useGame.getState().clockMode !== "drill") return false;
  for (let i = 0; i < world.drillFlash.length; i++) {
    if (world.drillFlash[i]! > 0) world.drillFlash[i] = Math.max(0, world.drillFlash[i]! - dt);
  }
  const puck = world.puck;
  if (world.drillWon || !world.drillShot || !drillPuckLive || puck.owner !== null) {
    if (!drillGhostScoring()) {
      ironResolved = null;
      drillPipeHit = false;
    }
    if (puck.owner !== null || world.drillWon || !drillPuckLive) releaseDrillShotState();
    return true;
  }
  const mouth = GOAL_LINE_X;
  const crossed = (prevX - mouth) * (puck.x - mouth) <= 0 && puck.x !== prevX && prevX < mouth;
  const past = puck.x > mouth + 0.55;
  const farLine = -GOAL_LINE_X;
  const crossedFar =
    drillFromPass &&
    puck.x !== prevX &&
    (prevX - farLine) * (puck.x - farLine) <= 0 &&
    prevX > farLine;
  const released = drillFromPass ? world.lastPass : world.lastShoot;
  if (
    world.time - released < 0.06 &&
    ironResolved === null &&
    !drillPipeHit &&
    !crossed &&
    !past &&
    !drillPassSide &&
    !crossedFar
  ) {
    return true;
  }
  const pipe = drillPipeHit;
  drillPipeHit = false;
  const resolved = ironResolved;
  ironResolved = null;
  let settled = false;
  if (resolved !== "back" && resolved !== "out") {
    const strike = strikeDrillMouth(prevX, prevY, prevZ, puck.x, puck.y, puck.z, shotX, shotY, shotZ, puck);
    if (strike.crossed || strike.hit) settled = true;
  }
  if (pipe || resolved !== null) settled = true;
  if (crossedFar) settled = true;
  if (drillPassSide && !settled) {
    drillPassSide = false;
    spawnDrillGhost(world.puck, true);
    giveUserPuck();
    return true;
  }
  drillPassSide = false;
  const u = world.skaters[world.userId];
  const behind = !drillFromPass && !!(u && puck.x < u.x - 0.45);
  const missed = past || behind || crossedFar;
  const recastAt = Number.isFinite(drillRecastAt) ? drillRecastAt : released + 1;
  const recastDue = world.time >= recastAt;
  if (!settled && !missed && !recastDue) return true;
  if (world.drillWon) {
    if (drillWinKicked) spawnDrillGhost(world.puck);
  } else recycleDrillPuck(recastDue && !settled && !missed);
  return true;
}

export function resetWorld(opts?: { keepScore?: boolean; keepReplay?: boolean }): void {
  checkAbsorbed.clear();
  checkCloseLeft.clear();
  refStayPut.delete(world.ref);
  refStayPut.delete(world.ref2);
  stickRage = null;
  world.benchDump = null;
  world.lineBrawl = null;
  world.drillGhosts = [];
  world.drillCards = [];
  world.drillCheer = 0;
  drillPipeHit = false;
  drillFromPass = false;
  drillPassSide = false;
  drillPuckLive = false;
  drillRecastAt = Infinity;
  drillFlightStashed = false;
  drillNetTouch = false;
  drillSettledUntil.delete(world.puck);
  drillWinPuck = null;
  drillWinAt = -10;
  drillWinKicked = false;
  drillWinLodged = false;
  drillEncoreLive = false;
  drillEncoreAt = -10;
  drillEncoreShots = 0;
  drillPuckFrozen = false;
  drillPin = null;
  drillWinPin = null;
  const ui = useGame.getState();
  if (ui.clockMode === "drill") {
    world.homeAttack = 1;
    world.faceX = 0;
    world.faceZ = 0;
  }
  if (!opts?.keepScore) {
    if (ui.clockMode !== "drill") {
      world.faceX = 0;
      world.faceZ = 0;
    }
    refLaneLocked = false;
    ui.setHomeScore(0);
    ui.setAwayScore(0);
    ui.setGoalSide(null);
    world.goalTicker = 0;
    world.goalSide = null;
    world.periodOver = false;
    world.periodClock = 1200;
    ui.setPeriodOver(false);
    ui.setPeriodClock(1200);
    if (!opts?.keepReplay) clearReplayBuf();
    world.ppRelease = null;
    world.ppChaos = false;
    ui.setLiveHome(ui.homeLineup);
    ui.setLiveAway(ui.awayLineup);
    if (ui.clockMode !== "drill") world.homeAttack = Math.random() < 0.5 ? 1 : -1;
    awayNums = rollAwayNums();
    world.aimCompassLock = null;
  }
  resetSkaters();
  if (!opts?.keepScore) ui.bumpLineup();
  if (ui.clockMode === "drill") {
    applyDrillPromote();
    resetDrill();
    beginDrillDrop();
    world.periodClock = DRILL_SECONDS;
    ui.setPeriodClock(DRILL_SECONDS);
    ui.setPeriodOver(false);
  }
  ui.setHasPuck(false);
  if (ui.clockMode === "drill") {
    const u =
      world.skaters.find((s) => s.id === world.userId) ??
      world.skaters.find((s) => s.side === "home");
    if (u) {
      world.userId = u.id;
      u.x = defendDir("home") * 1.15;
      u.z = 0;
      u.vx = 0;
      u.vz = 0;
      u.yaw = faceYaw("home");
    }
    world.drillView += 1;
  }
  ui.setCharge(0, null);
  ui.setWhistle(null);
  clearDelayedOffside();
  ui.setSpeed(0);
  ui.setReplay(false);
  beginUserCheck();
}

function cageBodySamples(s: Skater): { x: number; z: number; r: number }[] {
  const pts = [{ x: s.x, z: s.z, r: s.radius }];
  const { fx, fz } = heading(s.yaw);
  const rx = -fz;
  const rz = fx;
  if (s.dive > 0.04 || (s.kind === "goalie" && s.tumble !== 0)) {
    const reach = s.dive > 0.04 ? 1.15 : 0.85;
    pts.push({ x: s.x + fx * reach * 0.62, z: s.z + fz * reach * 0.62, r: 0.32 });
    pts.push({ x: s.x + fx * reach, z: s.z + fz * reach, r: 0.26 });
    pts.push({ x: s.x - fx * 0.42, z: s.z - fz * 0.42, r: 0.28 });
  }
  const spread = Math.max(s.coverPose, s.lPad, s.rPad);
  if (s.kind === "goalie" && (s.coverPose > 0.08 || spread > 0.32 || s.tumble !== 0)) {
    const wide = s.tumble !== 0 ? 0.72 : 0.38 + spread * 0.5;
    pts.push({ x: s.x + rx * wide, z: s.z + rz * wide, r: 0.3 });
    pts.push({ x: s.x - rx * wide, z: s.z - rz * wide, r: 0.3 });
    const fwd = 0.2 + Math.max(s.coverPose, s.tumble !== 0 ? 0.4 : 0) * 0.5;
    pts.push({ x: s.x + fx * fwd, z: s.z + fz * fwd, r: 0.3 });
  }
  return pts;
}

function separateBodyFromCage(s: Skater): void {
  for (let n = 0; n < 4; n++) {
    let moved = false;
    for (const p of cageBodySamples(s)) {
      const cage = resolveCage(p.x, p.z, p.r, true);
      if (!cage.hit) continue;
      const dx = cage.x - p.x;
      const dz = cage.z - p.z;
      if (dx * dx + dz * dz < 1e-10) continue;
      s.x += dx;
      s.z += dz;
      const vn = s.vx * cage.nx + s.vz * cage.nz;
      if (vn < 0) {
        s.vx -= vn * cage.nx;
        s.vz -= vn * cage.nz;
      }
      moved = true;
      break;
    }
    if (!moved) return;
  }
}

function collideSkater(s: Skater): void {
  if (world.benchDump?.id === s.id) return;
  const ice = resolveRink(s.x, s.z, s.radius);
  if (ice.hit) {
    s.x = ice.x;
    s.z = ice.z;
    const b = bounce(s.vx, s.vz, ice.nx, ice.nz, s.kind === "goalie" ? 0.08 : 0.32);
    s.vx = b.vx;
    s.vz = b.vz;
  }
  separateBodyFromCage(s);
}

function skateStats(s: Skater, burst: boolean): { cap: number; accel: number } {
  const user = s.id === world.userId;
  const holder = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  let cpu = 1;
  if (s.side === "away") {
    cpu = s.kind === "goalie" ? cpuMul("g") : holder && holder.side === "away" ? cpuMul("off") : cpuMul("def");
  } else {
    cpu = s.kind === "goalie" ? userMul("g") : s.kind === "defense" ? userMul("def") : userMul("off");
  }
  if (s.kind === "goalie") {
    if (goalieOutOfCrease(s)) return { cap: goalieSkateCap(s), accel: WINGER_ACCEL };
    if (user) return { cap: (burst ? 7.4 : 6.2) * cpu, accel: 12.4 * cpu };
    return { cap: 5.2 * cpu, accel: 9 * cpu };
  }
  if (s.kind === "defense") {
    const cap = burst ? DEFENSE_BURST : DEFENSE_SPEED;
    return {
      cap: cap * (user ? 1.12 : 0.9) * cpu,
      accel: DEFENSE_ACCEL * (user ? 1.16 : 0.88) * cpu,
    };
  }
  const carrying = world.puck.owner === s.id;
  const offPuck = carrying ? 1 : 0.9;
  const cap = (burst ? WINGER_BURST : WINGER_SPEED) * offPuck;
  return {
    cap: cap * (user ? 1.14 : 0.9) * cpu,
    accel: WINGER_ACCEL * (carrying ? 1 : 0.92) * (user ? 1.16 : 0.88) * cpu,
  };
}

function integrateSkater(
  s: Skater,
  wx: number,
  wz: number,
  mag: number,
  burst: boolean,
  dt: number,
): void {
  if (heldBody(s.id)) return;
  if (s.poke > 0) s.poke = Math.max(0, s.poke - dt);
  if (
    s.kind === "goalie" &&
    world.whistle !== "goal" &&
    (s.tumble !== 0 || s.struck > 0.18 || s.stun > 0.08)
  ) {
    decayGoalieDown(s, dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.vx *= Math.exp(-2.2 * dt);
    s.vz *= Math.exp(-2.2 * dt);
    collideSkater(s);
    keepInBowl(s);
    return;
  }
  if (s.struck > 0) s.struck = Math.max(0, s.struck - dt);
  if (s.dive > 1) {
    s.dive -= 2.6 * dt;
    const puck = world.puck;
    const dx = puck.x - s.x;
    const dz = puck.z - s.z;
    const d = Math.hypot(dx, dz) || 1;
    s.vx += (dx / d) * 20 * dt;
    s.vz += (dz / d) * 20 * dt;
    s.vx *= Math.exp(-1.6 * dt);
    s.vz *= Math.exp(-1.6 * dt);
    const spDive = Math.hypot(s.vx, s.vz);
    if (spDive > 11) {
      s.vx *= 11 / spDive;
      s.vz *= 11 / spDive;
    }
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    collideSkater(s);
    keepOnside(s);
    if (s.dive <= 1) s.dive = 0.95;
    return;
  }
  if (s.dive > 0) {
    s.dive = Math.max(0, s.dive - 0.78 * dt);
    s.vx *= Math.exp(-6.2 * dt);
    s.vz *= Math.exp(-6.2 * dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    collideSkater(s);
    keepOnside(s);
    s.lean += (0.04 - s.lean) * Math.min(1, 10 * dt);
    s.bank += (0 - s.bank) * Math.min(1, 10 * dt);
    if (s.dive <= 0) s.stun = Math.max(s.stun, 0.42);
    return;
  }
  if (s.celebrate > 0 && !world.stoppage) s.celebrate = Math.max(0, s.celebrate - dt);
  if (s.stun > 0) {
    s.stun = Math.max(0, s.stun - dt);
    s.vx *= Math.exp(-3 * dt);
    s.vz *= Math.exp(-3 * dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    collideSkater(s);
    keepOnside(s);
    return;
  }
  const stats = skateStats(s, burst || s.deke > 0);
  const cap = stats.cap;
  const planting = s.id === world.userId && s.kind !== "goalie" && userWinding;
  const speed = Math.hypot(s.vx, s.vz);

  if (planting) {
    s.vx *= Math.exp(-16 * dt);
    s.vz *= Math.exp(-16 * dt);
  } else if (mag <= 0.1) {
    s.vx *= Math.exp(-10 * dt);
    s.vz *= Math.exp(-10 * dt);
  }

  if (!planting && mag > 0.12) {
    const inv = 1 / mag;
    const dx = wx * inv;
    const dz = wz * inv;
    const user = s.id === world.userId;
    const turnMul = user ? 1.22 : 0.55;
    const turnSpd = 0.8 + Math.min(1, speed / 7);
    s.yaw = turnToward(s.yaw, dx, dz, TURN * turnMul * turnSpd, dt);
    const a = stats.accel * (burst ? 1.35 : 1) * mag;
    s.vx += dx * a * dt;
    s.vz += dz * a * dt;
    if (speed > 0.8) {
      const k = Math.min(1, (user ? 7.6 : 6.4) * dt);
      s.vx += (dx * speed - s.vx) * k;
      s.vz += (dz * speed - s.vz) * k;
    }
  }

  const drag = ICE_DRAG + (burst ? -0.15 : 0) + (s.deke > 0 ? -0.4 : 0);
  const damp = Math.exp(-drag * dt);
  s.vx *= damp;
  s.vz *= damp;

  const sp = Math.hypot(s.vx, s.vz);
  if (sp > cap) {
    const m = cap / sp;
    s.vx *= m;
    s.vz *= m;
  }

  stepCheckClose(s, dt);
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  collideSkater(s);
  keepOnside(s);

  const now = Math.hypot(s.vx, s.vz);
  s.stride += now * 2.35 * dt;
  s.lean += ((now / WINGER_SPEED) * 0.22 - s.lean) * Math.min(1, 8 * dt);
  const lat = !planting && mag > 0.12 ? wx * world.camRx + wz * world.camRz : 0;
  s.bank += (-lat * 0.5 - s.bank) * Math.min(1, 10 * dt);
  if (s.deke > 0) {
    s.bank += (0 - s.bank) * Math.min(1, 12 * dt);
    s.lean += (0.08 - s.lean) * Math.min(1, 8 * dt);
  }
  s.burst = burst ? 1 : 0;
  if (s.deke > 0) s.deke = Math.max(0, s.deke - dt);
  if (s.follow > 0) {
    s.follow = Math.max(0, s.follow - dt);
    if (s.follow <= 0) s.windup = 0;
  }
  if (s.hit > 0) {
    s.hit = Math.max(0, s.hit - dt);
    if (s.hit <= 0) endCheckSwing(s.id);
  }
  if (s.windup > 0 && mag < 0.01 && s.follow <= 0) s.windup = Math.max(0, s.windup - dt * 1.6);
}

function separateSkaters(): void {
  bowlUserChecks();
  const arr = world.skaters;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < arr.length; i++) {
      const A = arr[i]!;
      for (let j = i + 1; j < arr.length; j++) {
        const B = arr[j]!;
        if (heldBody(A.id) || heldBody(B.id)) continue;
        let dx = B.x - A.x;
        let dz = B.z - A.z;
        let dist = Math.hypot(dx, dz);
        if (dist < 1e-4) {
          dx = 0.18;
          dz = 0.08 * ((A.id % 2) * 2 - 1);
          dist = Math.hypot(dx, dz);
        }
        const celebA =
          world.whistle === "goal" && A.celebrate > 0.05 && A.kind !== "goalie" && A.side === B.side;
        const celebB = world.whistle === "goal" && B.celebrate > 0.05 && B.kind !== "goalie";
        const userA = A.id === world.userId;
        const userB = B.id === world.userId;
        let pad = A.kind === "goalie" || B.kind === "goalie" ? 0.28 : 0.2;
        let wA = A.kind === "goalie" ? (A.struck > 0.2 ? 0.62 : 0.08) : A.struck > 0.2 ? 0.28 : 1;
        let wB = B.kind === "goalie" ? (B.struck > 0.2 ? 0.62 : 0.08) : B.struck > 0.2 ? 0.28 : 1;
        if (celebA && celebB) {
          if (userA !== userB) {
            pad = -0.2;
            if (userA) wB = 0.02;
            else wA = 0.02;
          } else {
            pad = -0.14;
          }
        }
        const min = A.radius + B.radius + pad;
        if (dist >= min) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        const pen = min - dist;
        const sum = wA + wB;
        A.x -= nx * pen * (wA / sum);
        A.z -= nz * pen * (wA / sum);
        B.x += nx * pen * (wB / sum);
        B.z += nz * pen * (wB / sum);
        const rv = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
        if (rv < 0) {
          let jimp = rv * 0.78;
          const aFly = userCheckSkaters.has(A.id) && A.struck > 0.35 && A.vx * A.vx + A.vz * A.vz > 20.25;
          const bFly = userCheckSkaters.has(B.id) && B.struck > 0.35 && B.vx * B.vx + B.vz * B.vz > 20.25;
          if (aFly !== bFly) jimp *= 0.15;
          A.vx += nx * jimp * (wA / sum) * 2;
          A.vz += nz * jimp * (wA / sum) * 2;
          B.vx -= nx * jimp * (wB / sum) * 2;
          B.vz -= nz * jimp * (wB / sum) * 2;
        }
      }
    }
  }
  for (const s of arr) collideSkater(s);
  collideRefs();
}

function refIceRadius(r: Referee): number {
  if (r.tumble !== 0 && r.struck > 0.1) {
    const u = Math.min(1, Math.max(0, 1 - r.struck / 1.68));
    const pitch = Math.min(1.12, u * 1.55);
    const roll = Math.abs(Math.sin(u * 4.6 * r.tumble)) * 0.48;
    return 0.57 + Math.sin(pitch) * 1.48 + roll * 0.55;
  }
  if (r.struck > 0.2) return 0.42 + Math.min(1, r.struck) * 1.23;
  return 0.42;
}

function collideRefIce(r: Referee): void {
  const ice = resolveRink(r.x, r.z, refIceRadius(r));
  if (!ice.hit) return;
  r.x = ice.x;
  r.z = ice.z;
  const b = bounce(r.vx, r.vz, ice.nx, ice.nz, 0.32);
  r.vx = b.vx;
  r.vz = b.vz;
}

function collideRefs(): void {
  for (const r of refsOnIce()) {
    const rr = 0.45;
    for (const s of world.skaters) {
      const dx = s.x - r.x;
      const dz = s.z - r.z;
      const dist = Math.hypot(dx, dz);
      const min = s.radius + rr;
      if (dist >= min || dist < 1e-4) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const pen = min - dist;
      s.x += nx * pen * 0.08;
      s.z += nz * pen * 0.08;
      r.x -= nx * pen * 0.92;
      r.z -= nz * pen * 0.92;
      const rv = s.vx * nx + s.vz * nz;
      if (rv < 0 && !userCheckRefs.has(r)) {
        const fly = userCheckSkaters.has(s.id) && s.struck > 0.35 && s.vx * s.vx + s.vz * s.vz > 20.25;
        r.vx += nx * rv * (fly ? 0.2 : 0.85);
        r.vz += nz * rv * (fly ? 0.2 : 0.85);
      }
    }
    collideRefIce(r);
  }
}

export function attackDir(side: "home" | "away"): number {
  return side === "home" ? world.homeAttack : -world.homeAttack;
}

export function defendDir(side: "home" | "away"): number {
  return -attackDir(side);
}

function faceYaw(side: "home" | "away"): number {
  return attackDir(side) > 0 ? -Math.PI / 2 : Math.PI / 2;
}

function creaseCrash(g: Skater): number {
  const side = defendDir(g.side);
  const netX = side * GOAL_LINE_X;
  let best = Infinity;
  for (const o of world.skaters) {
    if (o.side === g.side || o.kind === "goalie") continue;
    const fromLine = -side * (o.x - netX);
    if (fromLine < -0.4 || fromLine > CREASE_R + 1.4) continue;
    if (Math.abs(o.z) > 2.6) continue;
    const d = Math.hypot(o.x - g.x, o.z - g.z);
    if (d < best) best = d;
  }
  return best;
}

function goalieGlovePuck(s: Skater): { x: number; y: number; z: number } {
  const yaw = s.yaw + Math.PI;
  const c = Math.cos(yaw);
  const si = Math.sin(yaw);
  if (s.coverPose > 0.35 && s.gloveFlash <= 0.12) {
    const lz = 0.34;
    return {
      x: s.x + lz * si,
      y: PUCK_Y,
      z: s.z + lz * c,
    };
  }
  const flash = Math.max(0, s.gloveFlash);
  const up = flash > 0.55 ? 1 : flash > 0.12 ? (flash - 0.12) / 0.43 : 0;
  const lx = -0.5;
  const ly = 0.58 + up * 1.02;
  const lz = 0.26 + up * 0.1;
  return {
    x: s.x + lx * c + lz * si,
    y: ly,
    z: s.z - lx * si + lz * c,
  };
}

function rejectPuckYank(puck: Puck, prevX: number, prevZ: number): void {
  const d = Math.hypot(puck.x - prevX, puck.z - prevZ);
  const afterSave = world.time - world.goalieSaveT < 0.9;
  const cap = afterSave ? 1.25 : 6.5;
  if (d > cap) {
    puck.x = prevX;
    puck.z = prevZ;
  }
}

function cornerSnipeLive(): boolean {
  return world.lastShotCorner && world.reboundN === 0 && world.time - world.lastShoot < 0.75;
}

function updateCoverPose(dt: number): void {
  const puck = world.puck;
  for (const s of world.skaters) {
    if (s.kind !== "goalie") {
      s.coverPose = 0;
      continue;
    }
    if (s.gloveFlash > 0) s.gloveFlash = Math.max(0, s.gloveFlash - dt);
    if (s.celebrate > 0.05 && world.whistle === "goal" && world.goalSide === s.side) {
      const ck = 1 - Math.exp(-10 * dt);
      s.coverPose += (0 - s.coverPose) * ck;
      if (s.coverPose < 0.01) s.coverPose = 0;
      updateGoaliePads(s, dt);
      continue;
    }
    const holding = puck.owner === s.id;
    const crash = creaseCrash(s);
    const moving = Math.hypot(s.vx, s.vz) > 1.5;
    const scoredOn = world.whistle === "goal" && !!world.goalSide && s.side !== world.goalSide;
    const freezeHold = holding && !moving && (s.side === "home" || crash <= 2.15);
    const nearLoose =
      !scoredOn &&
      puck.owner === null &&
      world.coverT > 0.12 &&
      Math.hypot(s.x - puck.x, s.z - puck.z) < 1.15;
    const whistleCover =
      world.stoppage && world.whistle === "cover" && Math.hypot(s.x - puck.x, s.z - puck.z) < 2.6;
    const flashing = s.gloveFlash > 0.12;
    const scooping = scoredOn && world.stoppageT < 1.28;
    const want = scooping
      ? world.stoppageT < 0.95
        ? 1
        : Math.max(0.14, 1 - (world.stoppageT - 0.95) * 2.2)
      : scoredOn || flashing
        ? 0
        : freezeHold || nearLoose || whistleCover
          ? 1
          : 0;
    const k = 1 - Math.exp(-(scoredOn ? 5.5 : want > 0.5 ? 11 : 7) * dt);
    s.coverPose += (want - s.coverPose) * k;
    if (s.coverPose < 0.01) s.coverPose = 0;
    updateGoaliePads(s, dt);
  }
}

function updateGoaliePads(s: Skater, dt: number): void {
  if (s.celebrate > 0.05 && world.whistle === "goal" && s.side === world.goalSide) {
    const stand = 0.18;
    const pkUp = 1 - Math.exp(-6 * dt);
    s.lPad += (stand - s.lPad) * pkUp;
    s.rPad += (stand - s.rPad) * pkUp;
    s.lean += (0.02 - s.lean) * pkUp;
    return;
  }
  const puck = world.puck;
  const side = defendDir(s.side);
  const netX = side * GOAL_LINE_X;
  const towardCenter = -side * (puck.x - netX);
  const zone = GOAL_LINE_X - BLUE_X;
  const inMyEnd = towardCenter > -1.2 && towardCenter < zone + 1.4;
  const past = (puck.x - netX) * side;
  const nearEnd =
    past > -0.55 &&
    Math.abs(puck.x - netX) < 4.6 &&
    (Math.abs(puck.z) > GOAL_W / 2 - 0.12 || past > 0.04);
  let lWant = 15 / 90;
  let rWant = 15 / 90;
  let leanWant = 0.08;
  if (world.whistle === "offside") {
    const idle = 15 / 90;
    const pk = 1 - Math.exp(-3.1 * dt);
    s.lPad += (idle - s.lPad) * pk;
    s.rPad += (idle - s.rPad) * pk;
    s.lean += (0.08 - s.lean) * pk;
    return;
  }
  if (world.whistle === "goal" && world.goalSide && s.side !== world.goalSide) {
    if (world.stoppageT < 1.08) {
      lWant = 0.52;
      rWant = 0.52;
      leanWant = 0.34;
    } else {
      lWant = 15 / 90;
      rWant = 15 / 90;
      leanWant = 0.1;
    }
    const pkUp = 1 - Math.exp(-5.2 * dt);
    s.lPad += (lWant - s.lPad) * pkUp;
    s.rPad += (rWant - s.rPad) * pkUp;
    s.lean += (leanWant - s.lean) * pkUp;
    return;
  }
  if (s.coverPose > 0.35) {
    lWant = 0.52;
    rWant = 0.52;
    leanWant = 0.28;
  } else if (nearEnd) {
    const left = puck.z < s.z;
    lWant = left ? 0.48 : 0.18;
    rWant = left ? 0.18 : 0.48;
    leanWant = 0.24;
  } else if (inMyEnd) {
    const d = Math.hypot(puck.x - s.x, puck.z - s.z);
    const shot = puck.owner === null && Math.hypot(puck.vx, puck.vz) > 8;
    let spread = 15 / 90;
    if (d < 8) spread = 15 / 90 + (1 - d / 8) * 0.28;
    if (d < 3.2) spread = Math.max(spread, 0.38);
    if (shot) spread = Math.max(spread, 0.42);
    const bias = Math.max(-0.12, Math.min(0.12, (puck.z - s.z) * 0.18));
    lWant = Math.max(15 / 90, Math.min(0.52, spread - bias));
    rWant = Math.max(15 / 90, Math.min(0.52, spread + bias));
    leanWant = 0.12 + spread * 0.16;
  }
  const pk = 1 - Math.exp(-3.1 * dt);
  s.lPad += (lWant - s.lPad) * pk;
  s.rPad += (rWant - s.rPad) * pk;
  s.lean += (leanWant + s.coverPose * 0.12 - s.lean) * pk;
}

function nearestFoe(s: Skater): { d: number; foe: Skater | null } {
  let best = Infinity;
  let foe: Skater | null = null;
  for (const o of world.skaters) {
    if (o.side === s.side || o.kind === "goalie") continue;
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d < best) {
      best = d;
      foe = o;
    }
  }
  return { d: best, foe };
}

function slotAmong(s: Skater, kind: SkaterKind, span: number): number {
  const mates = world.skaters.filter((p) => p.side === s.side && p.kind === kind);
  const i = mates.findIndex((p) => p.id === s.id);
  return laneZ(mates.length, Math.max(0, i), span);
}

function homeDBluePatrol(
  s: Skater,
  attack: number,
  wide: number,
  puckZ: number,
  pinch: boolean,
): { tx: number; tz: number } {
  const boards = RINK_W / 2 - 1.7;
  const u = (Math.sin(world.time * 0.4 + s.id * 1.17) + 1) * 0.5;
  let tz = wide < 0 ? -u * boards : u * boards;
  let tx = attack * (BLUE_X + 1.05);
  if (pinch) {
    tx = attack * (BLUE_X + 3.3);
    const sideZ =
      wide < 0 ? Math.max(-boards, Math.min(0.2, puckZ)) : Math.min(boards, Math.max(-0.2, puckZ));
    tz = tz * 0.42 + sideZ * 0.58;
  }
  return { tx, tz };
}

function clampLane(tx: number, tz: number, attack: number, behindNet = false): { tx: number; tz: number } {
  const mouth = attack * GOAL_LINE_X;
  let x = tx;
  if (behindNet) {
    const end = attack * (RINK_L / 2 - 0.85);
    if (attack > 0) x = Math.min(x, end);
    else x = Math.max(x, end);
  } else if (attack > 0) x = Math.min(x, mouth - 2.6);
  else x = Math.max(x, mouth + 2.6);
  const ownMouth = -mouth;
  if (attack > 0) x = Math.max(x, ownMouth + 2.4);
  else x = Math.min(x, ownMouth - 2.4);
  const z = Math.max(-RINK_W / 2 + 1.6, Math.min(RINK_W / 2 - 1.6, tz));
  return { tx: x, tz: z };
}

function userBehindAwayNet(holder: Skater | null): boolean {
  if (!holder || holder.id !== world.userId || holder.side !== "home") return false;
  const attack = attackDir("home");
  return (holder.x - attack * GOAL_LINE_X) * attack > 0.04;
}

function ozDepth(tx: number, attack: number): number {
  return (attack * GOAL_LINE_X - tx) * attack;
}

function carrierBelowGoal(x: number, attack: number): boolean {
  return (x - attack * GOAL_LINE_X) * attack > 0.04;
}

function inCarrierCorner(
  tx: number,
  tz: number,
  pivot: { x: number; z: number },
  attack: number,
): boolean {
  const depth = ozDepth(tx, attack);
  const side = Math.abs(pivot.z) > 1.4 ? Math.sign(pivot.z) : 0;
  if (depth < 4.2 && side !== 0 && tz * side > 5.2) return true;
  if (depth < 0.15 && side !== 0 && tz * side > 0.6) return true;
  if (depth < 0.15 && Math.abs(tz) > 3.4) return true;
  if (side !== 0) {
    const cx = attack * (RINK_L / 2 - 1.45);
    const cz = side * (RINK_W / 2 - 1.7);
    if (Math.hypot(tx - cx, tz - cz) < 3.5) return true;
  }
  return false;
}

function shotStacked(
  tx: number,
  tz: number,
  pivot: { x: number; z: number },
  attack: number,
): boolean {
  const depth = Math.max(0.35, ozDepth(tx, attack));
  const cDepth = ozDepth(pivot.x, attack);
  if (cDepth < 0.8) {
    return depth < 6.2 && Math.abs(pivot.z) > 2 && tz * pivot.z > 0 && Math.abs(tz - pivot.z) < 2.4;
  }
  const lineZ = pivot.z * (depth / Math.max(0.45, cDepth));
  if (Math.abs(tz - lineZ) < 2.05) return true;
  const angP = Math.atan2(tz, depth);
  const angC = Math.atan2(pivot.z, Math.max(0.45, cDepth));
  return Math.abs(angP - angC) < 0.28;
}

function laneBlocked(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  side: "home" | "away",
): boolean {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  if (len2 < 6) return false;
  for (const o of world.skaters) {
    if (o.side === side || o.kind === "goalie") continue;
    const t = ((o.x - x0) * dx + (o.z - z0) * dz) / len2;
    if (t < 0.14 || t > 0.86) continue;
    const px = x0 + dx * t;
    const pz = z0 + dz * t;
    if (Math.hypot(o.x - px, o.z - pz) < 1.22) return true;
  }
  return false;
}

function defenderGap(tx: number, tz: number, side: "home" | "away"): number {
  let best = 28;
  for (const o of world.skaters) {
    if (o.side === side || o.kind === "goalie") continue;
    const d = Math.hypot(o.x - tx, o.z - tz);
    if (d < best) best = d;
  }
  return best;
}

function spotCoord(name: OzSpot, attack: number, weak: number): { tx: number; tz: number } {
  const mouth = attack * GOAL_LINE_X;
  const dot = GOAL_LINE_X - FACEOFF_EZ_X;
  let depth = 6;
  let z = 0;
  if (name === "slot") {
    depth = 5.15;
    z = weak * 1.55;
  } else if (name === "high") {
    depth = 10.35;
    z = weak * 2.45;
  } else if (name === "circle") {
    depth = dot;
    z = weak * FACEOFF_SPOT_Z;
  } else if (name === "net") {
    depth = 3.2;
    z = weak * 1.05;
  } else if (name === "bumper") {
    depth = 7.85;
    z = -weak * 1.15;
  } else {
    depth = Math.max(3.05, dot - FACEOFF_R * 0.55);
    z = weak * (FACEOFF_SPOT_Z - 0.35);
  }
  return { tx: mouth - attack * depth, tz: z };
}

function offShotLine(
  tx: number,
  tz: number,
  pivot: { x: number; z: number },
  attack: number,
  weak: number,
): { tx: number; tz: number } | null {
  if (!shotStacked(tx, tz, pivot, attack)) return { tx, tz };
  let z = Math.abs(tz) < 1.9 ? weak * 2.55 : -tz;
  z = Math.max(-7.45, Math.min(7.45, z));
  if (shotStacked(tx, z, pivot, attack)) {
    z = Math.max(-7.45, Math.min(7.45, z + weak * 2.2));
    if (shotStacked(tx, z, pivot, attack)) return null;
  }
  return { tx, tz: z };
}

function supportWings(side: "home" | "away", holderId: number): Skater[] {
  return world.skaters
    .filter((p) => p.side === side && p.kind === "winger" && p.id !== holderId)
    .sort((a, b) => a.id - b.id);
}

function rotateNames(names: OzSpot[], step: number): OzSpot[] {
  const n = names.length;
  const k = ((step % n) + n) % n;
  return names.slice(k).concat(names.slice(0, k));
}

function teammateNear(tx: number, tz: number, s: Skater, holderId: number): boolean {
  for (const o of world.skaters) {
    if (o.id === s.id || o.id === holderId || o.side !== s.side || o.kind === "goalie") continue;
    const h = ozHold.get(o.id);
    if (h && Math.hypot(h.tx - tx, h.tz - tz) < 1.85) return true;
  }
  return false;
}

function supportSpot(
  s: Skater,
  pivot: { x: number; z: number },
  holderId: number,
): { tx: number; tz: number } {
  const attack = attackDir(s.side);
  const behind = carrierBelowGoal(pivot.x, attack);
  const now = world.time;
  const prev = ozHold.get(s.id);
  const cornerNow = !!prev && behind && inCarrierCorner(prev.tx, prev.tz, pivot, attack);
  const spoiled =
    !!prev &&
    (defenderGap(prev.tx, prev.tz, s.side) < 1.9 ||
      laneBlocked(pivot.x, pivot.z, prev.tx, prev.tz, s.side) ||
      shotStacked(prev.tx, prev.tz, pivot, attack) ||
      cornerNow);
  const pauseDone = !!prev && prev.settled > 0 && now >= prev.settled + 2.6;
  const expired = !!prev && ((now >= prev.until && pauseDone) || now >= prev.until + 2.5);
  if (prev && !expired && !spoiled) return { tx: prev.tx, tz: prev.tz };
  if (prev && now < prev.picked + 1.15 && !cornerNow) return { tx: prev.tx, tz: prev.tz };

  const wings = supportWings(s.side, holderId);
  const role = Math.max(0, wings.findIndex((p) => p.id === s.id));
  const step = Math.floor((now + (s.id % 5) * 0.68) / 3.25);
  const weak = Math.abs(pivot.z) > 1.15 ? -Math.sign(pivot.z) : role % 2 === 0 ? 1 : -1;
  const high: OzSpot[] = ["slot", "high", "circle", "bumper"];
  const low: OzSpot[] = ["net", "hash"];
  const order: OzSpot[] =
    behind && role === 0
      ? [...rotateNames(low, step), ...rotateNames(high, step)]
      : behind
        ? rotateNames(high, step + role)
        : rotateNames(["slot", "high", "circle", "net", "bumper"], step + role);
  const flee = !!prev;

  let best: { tx: number; tz: number; score: number } | null = null;
  let near: { tx: number; tz: number; score: number } | null = null;
  let fallback: { tx: number; tz: number; score: number } | null = null;
  for (const name of order) {
    const base = spotCoord(name, attack, weak);
    const angled = offShotLine(base.tx, base.tz, pivot, attack, weak);
    if (!angled) continue;
    if (ozDepth(angled.tx, attack) < 2.7) continue;
    if (behind && inCarrierCorner(angled.tx, angled.tz, pivot, attack)) continue;
    if (Math.hypot(angled.tx - pivot.x, angled.tz - pivot.z) < 3.55) continue;
    if (teammateNear(angled.tx, angled.tz, s, holderId)) continue;
    const gap = defenderGap(angled.tx, angled.tz, s.side);
    const open = laneBlocked(pivot.x, pivot.z, angled.tx, angled.tz, s.side) ? 0 : 1;
    const score = gap + open * 5.5;
    const spot = { tx: angled.tx, tz: angled.tz, score };
    if (!fallback || score > fallback.score) fallback = spot;
    if (gap < 2.15 || open !== 1) continue;
    const moved = prev ? Math.hypot(angled.tx - prev.tx, angled.tz - prev.tz) : 99;
    if (flee && moved < 3.1) {
      if (!near) near = spot;
      continue;
    }
    best = spot;
    break;
  }
  let pick = best ?? near ?? fallback;
  if (!pick) {
    const spare = spotCoord(behind && role !== 0 ? "high" : order[0]!, attack, weak);
    pick = { tx: spare.tx, tz: spare.tz, score: 0 };
    if (behind && inCarrierCorner(pick.tx, pick.tz, pivot, attack)) {
      const alt = spotCoord("high", attack, weak);
      pick = { tx: alt.tx, tz: alt.tz, score: 0 };
    }
  }
  if (prev && Math.hypot(pick.tx - prev.tx, pick.tz - prev.tz) < 1.7 && !cornerNow) {
    prev.until = now + 1.45;
    prev.picked = now;
    return { tx: prev.tx, tz: prev.tz };
  }
  const held = {
    tx: pick.tx,
    tz: pick.tz,
    until: now + 3.15 + (s.id % 4) * 0.22,
    picked: now,
    calm: false,
    settled: 0,
  };
  ozHold.set(s.id, held);
  return { tx: held.tx, tz: held.tz };
}

function wrapChaseTarget(s: Skater, holder: Skater): { tx: number; tz: number } {
  const attack = attackDir(holder.side);
  const mouth = attack * GOAL_LINE_X;
  const post = GOAL_W / 2 + 1.38;
  const side = Math.sign(holder.z) || Math.sign(s.z) || 1;
  const sAlong = s.x * attack;
  if (sAlong < GOAL_LINE_X - 0.15 && Math.abs(s.z) < post) {
    return { tx: mouth + attack * 0.5, tz: side * post };
  }
  let tx = holder.x + attack * 0.42;
  let tz = holder.z;
  if (Math.abs(tz) < post) tz = side * post;
  const end = attack * (RINK_L / 2 - 0.95);
  if (attack > 0) tx = Math.min(tx, end);
  else tx = Math.max(tx, end);
  return { tx, tz };
}

function houseDefenderId(side: "home" | "away"): number {
  let d: Skater | null = null;
  for (const p of world.skaters) {
    if (p.side !== side || p.kind !== "defense") continue;
    if (!d || p.id < d.id) d = p;
  }
  return d ? d.id : -1;
}

function wrapChaserId(holder: Skater): number {
  let d: Skater | null = null;
  for (const p of world.skaters) {
    if (p.side !== "away" || p.kind !== "defense") continue;
    if (!d || p.id < d.id) d = p;
  }
  if (d) return d.id;
  let best = -1;
  let bestD = 99;
  for (const p of world.skaters) {
    if (p.side !== "away" || p.kind === "goalie") continue;
    const dist = Math.hypot(p.x - holder.x, p.z - holder.z);
    if (dist < bestD) {
      bestD = dist;
      best = p.id;
    }
  }
  return best;
}

function repulsion(s: Skater): { x: number; z: number } {
  let x = 0;
  let z = 0;
  const carrier = world.puck.owner;
  const passTo = world.lastPassTo === s.id && world.time - world.lastPass < 1.85;
  for (const o of world.skaters) {
    if (o.id === s.id) continue;
    const dx = s.x - o.x;
    const dz = s.z - o.z;
    const d = Math.hypot(dx, dz);
    let min = o.kind === "goalie" || s.kind === "goalie" ? 2.5 : 4.2;
    if (s.side === o.side && s.kind !== "goalie" && o.kind !== "goalie") min = 5.6;
    if (!passTo && carrier === o.id && s.side === o.side && s.kind !== "goalie") min = 5.8;
    if (carrier === s.id || carrier === o.id) min += 0.35;
    if (pressingUserCarrier(s) && (o.id === world.userId || pressingUserCarrier(o))) {
      min = o.id === world.userId ? 0.92 : 1.25;
    }
    if (d < min && d > 0.01) {
      const w = ((min - d) / min) * (carrier === o.id && s.side === o.side ? 2.2 : 1.7);
      x += (dx / d) * w;
      z += (dz / d) * w;
    }
  }
  return { x, z };
}

function thinkCarrier(s: Skater): { wx: number; wz: number; mag: number; burst: boolean } {
  const attack = attackDir(s.side);
  const mouth = attack * GOAL_LINE_X;
  const distMouth = (mouth - s.x) * attack;
  const pressure = nearestFoe(s).d;
  const lane = slotAmong(s, s.kind === "defense" ? "defense" : "winger", 4.6);

  if (world.time - world.lastShoot > 0.55 && distMouth < 11.5 && distMouth > 1.15 && Math.abs(s.z) < 6.2) {
    const idle = userIdle();
    const wantShot =
      distMouth < (idle && s.side === "away" ? 10.4 : 8.2) ||
      pressure < (idle && s.side === "away" ? 4.4 : 3.4) ||
      Math.abs(s.z) < 3.2;
    const shootOk =
      s.side !== "away" ||
      Math.random() <
        (idle ? 0.52 : 0.28) + cpuMul("off") * (idle ? 0.5 : 0.72) + (whiffHot() ? 0.42 : 0);
    if (wantShot && shootOk && !(s.side === "home" && s.id !== world.userId)) {
      shootAtNet(s);
      return { wx: 0, wz: 0, mag: 0.15, burst: false };
    }
  }

  if (pressure < 2.35 && world.time - world.lastPass > 1.15) {
    const mate = bestPassTarget(s, attack, 0);
    if (mate) {
      const md = Math.hypot(mate.x - s.x, mate.z - s.z);
      if (md > 3.2 && md < 18) {
        aiPass(s, mate);
        return { wx: 0, wz: 0, mag: 0.2, burst: false };
      }
    }
  }

  let tx = mouth - attack * (distMouth < 9 ? 6.5 : 8.5);
  let tz = lane + (s.id % 2 === 0 ? 1.4 : -1.4);
  if (distMouth < 5.5) {
    tz = s.z >= 0 ? 3.4 : -3.4;
    tx = mouth - attack * 5.8;
  }
  const c = clampLane(tx, tz, attack);
  const dx = c.tx - s.x;
  const dz = c.tz - s.z;
  const dist = Math.hypot(dx, dz) || 1;
  let mag = dist < 1.5 ? 0.18 : 0.95;
  if (s.side === "away") mag *= Math.min(1, 0.45 + cpuMul("off") * 0.55);
  const rep = repulsion(s);
  return {
    wx: dx / dist + rep.x * 0.55,
    wz: dz / dist + rep.z * 0.55,
    mag,
    burst: distMouth > 16 && pressure > 4 && (s.side !== "away" || cpuMul("off") > 0.42),
  };
}

function inPressPeel(id: number): boolean {
  const a = pressPeelAt.get(id);
  const b = pressPeelEnd.get(id);
  if (a === undefined || b === undefined) return false;
  return world.time >= a && world.time < b;
}

function userPressIds(holder: Skater): { primary: number; second: number } {
  if (pressCacheT === world.time) return { primary: pressPrimary, second: pressSecond };
  const dist = (p: Skater) => Math.hypot(p.x - holder.x, p.z - holder.z);
  const foes: Skater[] = [];
  for (const p of world.skaters) {
    if (p.side === holder.side || p.kind === "goalie") continue;
    if (p.stun > 0.45 || p.struck > 0.5) continue;
    foes.push(p);
  }
  foes.sort((a, b) => dist(a) - dist(b));
  const defs = foes.filter((p) => p.kind === "defense");
  const primary = defs[0] ?? foes[0];
  let second = -1;
  if (primary) {
    const d2 = defs.find((p) => p.id !== primary.id && dist(p) < PRESS_JOIN);
    if (d2) second = d2.id;
    else {
      const f2 = foes.find((p) => p.id !== primary.id && p.kind !== "defense" && dist(p) < PRESS_JOIN);
      if (f2) second = f2.id;
    }
  }
  pressCacheT = world.time;
  pressPrimary = primary ? primary.id : -1;
  pressSecond = second;
  return { primary: pressPrimary, second: pressSecond };
}

function pressingUserCarrier(s: Skater): boolean {
  if (s.kind === "goalie") return false;
  const holder = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  if (!holder || holder.id !== world.userId || holder.kind === "goalie" || holder.side === s.side) return false;
  if (inPressPeel(s.id)) return false;
  const ids = userPressIds(holder);
  return s.id === ids.primary || s.id === ids.second;
}

function thinkWithoutPuck(s: Skater): { wx: number; wz: number; mag: number; burst: boolean } {
  const attack = attackDir(s.side);
  const own = -attack;
  const ownMouth = own * GOAL_LINE_X;
  const mouth = attack * GOAL_LINE_X;
  const puck = world.puck;
  const holder = puck.owner !== null ? world.skaters[puck.owner] : null;
  const weHave = !!(holder && holder.side === s.side);
  const mates = world.skaters.filter((p) => p.side === s.side && p.kind !== "goalie");
  const ranked = [...mates].sort((a, b) => {
    const da = Math.hypot(a.x - puck.x, a.z - puck.z);
    const db = Math.hypot(b.x - puck.x, b.z - puck.z);
    return da - db;
  });
  const rank = ranked.findIndex((p) => p.id === s.id);
  const ourPassFlight =
    !holder &&
    world.lastPasser !== null &&
    world.skaters[world.lastPasser]?.side === s.side &&
    world.time - world.lastPass < 1.85;
  const passToMe = ourPassFlight && world.lastPassTo === s.id;
  const pivot = holder && weHave ? holder : ourPassFlight ? puck : null;
  const puckAtk = (pivot ? pivot.x : puck.x) * attack;
  const inOz = offsidesLive()
    ? puckOzSide(puck) === attack
    : puckAtk > BLUE_X - 0.4;
  const inNz = puckAtk >= -BLUE_X + 0.35 && puckAtk <= BLUE_X - 0.4;

  let tx = s.x;
  let tz = s.z;
  let wrapDeep = false;
  let ozHoldSkate = false;
  let stickChase = false;
  let userPress: "on" | "peel" | "hold" | null = null;
  if (holder && userBehindAwayNet(holder) && !passToMe) {
    if (s.side === "away" && s.kind !== "goalie" && wrapChaserId(holder) === s.id) {
      const chase = wrapChaseTarget(s, holder);
      tx = chase.tx;
      tz = chase.tz;
      wrapDeep = true;
    }
  }

  if (!wrapDeep && pivot && (weHave || ourPassFlight)) {
    if (s.kind === "defense") {
      const dMates = world.skaters.filter((p) => p.side === s.side && p.kind === "defense");
      const di = Math.max(0, dMates.findIndex((p) => p.id === s.id));
      const wide = di === 0 ? -1 : 1;
      if (s.side === "home") {
        const trail = inOz ? 2.6 + di * 1.15 : inNz ? 2.15 + di * 1.05 : 3.1 + di * 0.7;
        const width = inOz ? 4.35 : inNz ? 5.35 : 4.7;
        tx = pivot.x - attack * trail;
        tz = pivot.z * 0.2 + wide * width;
        if (attack > 0) {
          tx = Math.min(tx, pivot.x - 1.35);
          tx = Math.max(tx, ownMouth + 2.5);
        } else {
          tx = Math.max(tx, pivot.x + 1.35);
          tx = Math.min(tx, ownMouth - 2.5);
        }
        const pointCap = mouth - attack * 7.6;
        if (attack > 0) tx = Math.min(tx, pointCap);
        else tx = Math.max(tx, pointCap);
      } else if (inOz) {
        tx = attack * (BLUE_X + 2.6);
        tz = wide * 5.1;
      } else {
        tx = pivot.x - attack * 10.2;
        tz = wide * 3.8;
      }
    } else if (!passToMe) {
      const st = supportSpot(s, pivot, holder?.id ?? -1);
      tx = st.tx;
      tz = st.tz;
      ozHoldSkate = true;
    }
    if (passToMe) {
      const ix = puck.x + puck.vx * 0.2;
      const iz = puck.z + puck.vz * 0.2;
      const fromNet = (mouth - ix) * attack;
      tx = mouth - attack * Math.max(3.8, Math.min(13.5, fromNet));
      tz = Math.max(-7.3, Math.min(7.3, iz));
    }
  } else if (
    !wrapDeep &&
    holder &&
    holder.id === world.userId &&
    holder.kind !== "goalie" &&
    holder.side !== s.side
  ) {
    const ids = userPressIds(holder);
    const on = s.id === ids.primary || s.id === ids.second;
    if (on && !inPressPeel(s.id)) {
      userPress = "on";
      tx = holder.x + Math.max(-1.15, Math.min(1.15, holder.vx * 0.15));
      tz = holder.z + Math.max(-1.15, Math.min(1.15, holder.vz * 0.15));
    } else if (on) {
      userPress = "peel";
      const side = s.id % 2 === 0 ? 1 : -1;
      tx = holder.x - own * 2.55;
      tz = holder.z + side * 1.7;
    } else if (s.kind === "defense") {
      userPress = "hold";
      tx = holder.x + own * 4.6;
      const inOurZone = holder.x * own > BLUE_X - 0.4;
      if (!inOurZone) {
        const blue = own * (BLUE_X - 0.55);
        if (own > 0) tx = Math.min(tx, blue);
        else tx = Math.max(tx, blue);
      }
      tz = holder.z * 0.4 + slotAmong(s, "defense", 2.8) * 0.35;
    } else {
      userPress = "hold";
      const wings = mates.filter((p) => p.kind === "winger");
      const fi = Math.max(0, wings.findIndex((p) => p.id === s.id));
      const side = fi % 2 === 0 ? 1 : -1;
      tx = holder.x + own * (3.7 + fi * 0.75);
      tz = holder.z * 0.38 + side * (2.5 + fi * 0.55);
      tz = Math.max(-7.2, Math.min(7.2, tz));
    }
  } else if (!wrapDeep && holder) {
    const closeIdle =
      holder.id === world.userId &&
      (world.idlePokeT > 0.12 || Math.hypot(holder.vx, holder.vz) < 1.25);
    const cpuInDz = s.side === "home" && holder.side === "away" && holder.x * own > BLUE_X - 0.55;
    if (cpuInDz) {
      if (s.kind === "defense" && s.id === houseDefenderId("home")) {
        tx = ownMouth - own * 3.9;
        tz = Math.max(-2.35, Math.min(2.35, holder.z * 0.32));
      } else if (s.kind === "defense") {
        tx = holder.x - attack * 1.7;
        tz = holder.z * 0.68 + (s.id % 2 === 0 ? 1.35 : -1.35);
      } else {
        const wings = mates.filter((p) => p.kind === "winger");
        const fi = Math.max(0, wings.findIndex((p) => p.id === s.id));
        const side = fi % 2 === 0 ? 1 : -1;
        tx = holder.x - attack * (0.9 + fi * 0.85);
        tz = holder.z + side * (1.85 + fi * 0.7);
        const blue = -attack * (BLUE_X - 0.8);
        if (attack > 0) tx = Math.min(tx, blue);
        else tx = Math.max(tx, blue);
      }
    } else if (s.kind === "defense") {
      const dMates = world.skaters.filter((p) => p.side === s.side && p.kind === "defense");
      const di = Math.max(0, dMates.findIndex((p) => p.id === s.id));
      const wide = di === 0 ? -1 : 1;
      const holdAtk = holder.x * attack;
      if (s.side === "home") {
        if (holdAtk > BLUE_X - 0.8) {
          const p = homeDBluePatrol(s, attack, wide, holder.z, false);
          tx = p.tx;
          tz = p.tz;
        } else if (holdAtk > -BLUE_X - 1.1) {
          tx = holder.x + attack * 2.3;
          tz = holder.z * 0.62 + wide * 1.5;
        } else {
          const deepest = ownMouth - own * 6.8;
          const highest = -attack * (BLUE_X + 0.2);
          tx = holder.x - attack * 2.6;
          if (attack > 0) tx = Math.max(deepest, Math.min(highest, tx));
          else tx = Math.min(deepest, Math.max(highest, tx));
          tz = holder.z * 0.72 + wide * 1.6;
        }
      } else {
        const gap = closeIdle ? 2.45 : 1.95;
        tx = holder.x + own * gap;
        const inOurZone = holder.x * own > BLUE_X - 0.4;
        if (!inOurZone) {
          if (own > 0) tx = Math.min(tx, BLUE_X + 2.2);
          else tx = Math.max(tx, -BLUE_X - 2.2);
        }
        tz = slotAmong(s, "defense", 3.6) * 0.72 + holder.z * 0.18;
        const ddx = tx - holder.x;
        const ddz = tz - holder.z;
        const gapNow = Math.hypot(ddx, ddz);
        if (gapNow < 1.55) {
          const k = 1.9 / (gapNow || 1);
          tx = holder.x + ddx * k;
          tz = holder.z + ddz * k;
        }
      }
    } else if (rank === 0) {
      const side = s.id % 2 === 0 ? 1.15 : -1.15;
      tx = holder.x + own * (closeIdle ? 0.08 : 1.05);
      tz = holder.z + (closeIdle ? side * 0.18 : side);
    } else {
      tx = (holder.x + ownMouth) * 0.5;
      tz = Math.max(-7.2, Math.min(7.2, slotAmong(s, "winger", 5.2)));
    }
  } else if (!wrapDeep && rank === 0 && s.kind !== "defense") {
    tx = puck.x;
    tz = puck.z;
  } else if (!wrapDeep && s.kind === "defense") {
    if (s.side === "home") {
      const dMates = world.skaters.filter((p) => p.side === s.side && p.kind === "defense");
      const di = Math.max(0, dMates.findIndex((p) => p.id === s.id));
      const wide = di === 0 ? -1 : 1;
      const puckAt = puck.x * attack;
      if (puckAt > BLUE_X - 0.8) {
        const p = homeDBluePatrol(s, attack, wide, puck.z, false);
        tx = p.tx;
        tz = p.tz;
      } else if (puckAt > -BLUE_X) {
        tx = puck.x + attack * 1.8;
        tz = puck.z * 0.5 + wide * 2.2;
      } else {
        const deepest = ownMouth - own * 7.2;
        tx = puck.x - attack * 2.2;
        if (attack > 0) tx = Math.max(deepest, tx);
        else tx = Math.min(deepest, tx);
        tz = puck.z * 0.65 + wide * 1.8;
      }
    } else {
      const emptyNet = !world.skaters.some((p) => p.side === "away" && p.kind === "goalie");
      tx = ownMouth - own * (emptyNet ? 2.5 : 5.2);
      tz = slotAmong(s, "defense", 3.5) + puck.z * 0.2;
      if (emptyNet && puck.vx * attack < -1.6) {
        tx = puck.x * 0.28 + ownMouth * 0.72;
        tz = puck.z * 0.58;
      }
    }
  } else if (!wrapDeep) {
    tx = puck.x + own * 4;
    tz = Math.max(-7.4, Math.min(7.4, slotAmong(s, "winger", 5)));
  }

  if (!holder && !ourPassFlight && s.side === "away" && s.kind !== "defense") {
    const dPuck = Math.hypot(s.x - puck.x, s.z - puck.z);
    const loose = puck.y < 0.72 && Math.hypot(puck.vx, puck.vz) < 9;
    if (loose && (dPuck < 5.2 || (rank === 0 && dPuck < 10))) {
      tx = puck.x + puck.vx * 0.1;
      tz = puck.z + puck.vz * 0.1;
    }
  }

  if (!holder && stickLooseBy >= 0 && world.time < stickLooseUntil + 0.85) {
    const poker = world.skaters[stickLooseBy];
    if (poker && s.side === poker.side && s.id !== world.userId && (s.id === stickLooseBy || rank === 0)) {
      tx = puck.x + puck.vx * 0.18;
      tz = puck.z + puck.vz * 0.18;
      stickChase = true;
    }
  }

  tx = clampOnsideX(s, tx);
  const endLoose = !holder && !world.faceoff && !world.stoppage ? looseEnd(puck) : 0;
  let retrieving = false;
  if (endLoose !== 0 && !wrapDeep) {
    const dPuck = Math.hypot(s.x - puck.x, s.z - puck.z);
    if (passToMe || rank === 0 || dPuck < 6.2 || (s.kind === "defense" && dPuck < 14)) {
      const chase = retrieveAroundNet(s, puck, endLoose);
      tx = chase.tx;
      tz = chase.tz;
      retrieving = true;
    }
  }
  const c =
    retrieving && endLoose !== 0
      ? clampRetrieve(tx, tz, endLoose)
      : clampLane(tx, tz, attack, wrapDeep);
  if (userPress === "on" && holder) {
    const line = own * GOAL_LINE_X;
    const deep = line - own * 1.05;
    if (own > 0) {
      const want = Math.min(holder.x, deep);
      if (c.tx < want) c.tx = want;
    } else {
      const want = Math.max(holder.x, deep);
      if (c.tx > want) c.tx = want;
    }
  }
  const dx = c.tx - s.x;
  const dz = c.tz - s.z;
  const dist = Math.hypot(dx, dz) || 1;
  let mag = dist < 0.85 ? 0 : dist < 1.7 ? 0.22 : dist < 2.8 ? 0.48 : 0.92;
  let burst = !weHave && rank === 0 && dist > 10 && s.kind !== "defense";
  if (passToMe) {
    mag = 0.82;
    burst = dist > 4.5;
  }
  if (wrapDeep) {
    mag = Math.max(mag, dist < 1.1 ? 0.42 : 0.96);
    if (dist > 5.5) burst = true;
  }
  if (!weHave && holder && holder.side === "away" && s.side === "home" && s.id !== world.userId) {
    const inDz = holder.x * own > BLUE_X - 0.55;
    if (inDz && s.kind === "winger") {
      mag = Math.max(mag, dist < 1.2 ? 0.55 : 0.97);
      burst = dist > 4.2;
    }
  }
  if (weHave && s.kind === "winger" && dist > 3.2) mag = Math.max(mag, 0.98);
  if (weHave && s.kind === "winger" && inOz) mag = Math.max(mag, dist < 1.15 ? 0.28 : 0.55);
  if ((weHave || ourPassFlight) && holder && dist < 2.4 && mag > 0.14) {
    s.yaw = turnToward(s.yaw, holder.x - s.x, holder.z - s.z, 1.6, 0.016);
  }
  if (!weHave && holder && holder.id === world.userId && rank === 0 && s.kind === "winger" && userPress === "on") {
    mag = Math.max(mag, 0.95);
  }
  if (weHave && holder && holder.side === "home" && s.id !== holder.id && !passToMe && nearestFoe(s).d < 3.2) {
    mag = Math.max(mag, 0.78);
    burst = dist > 4.2;
  }
  if (!holder && s.side === "away" && s.kind !== "defense") {
    const dPuck = Math.hypot(s.x - puck.x, s.z - puck.z);
    if (puck.y < 0.72 && dPuck < 5.2) {
      mag = Math.max(mag, dPuck < 1.35 ? 0.82 : 0.98);
      burst = dPuck > 2.1 && Math.hypot(puck.vx, puck.vz) < 5;
    }
  }
  if (s.side === "home" && s.id !== world.userId) {
    mag *= Math.min(1, weHave ? userMul("off") : userMul("def"));
  }
  if (s.kind === "defense") {
    if (s.side === "home") {
      mag = Math.min(1, Math.max(mag, dist > 2.4 ? 0.97 : mag));
      if (inOz) mag = Math.max(mag, 0.48);
      if (!weHave && dist > 5.5) burst = true;
      if (weHave && dist > 6.5) burst = true;
    } else if (userPress !== "on" && userPress !== "peel") {
      const join = weHave && holder && holder.x * attackDir(s.side) > BLUE_X - 0.35;
      mag = Math.min(mag, join ? 0.9 : 0.72);
    }
  }
  if (userPress === "on") {
    mag = dist < 0.65 ? 0.62 : 1;
    if (dist > 2.2) burst = true;
  } else if (userPress === "peel") {
    mag = dist < 0.75 ? 0.3 : 0.9;
  } else if (userPress === "hold") {
    mag = s.kind === "winger" ? (dist > 5 ? 0.74 : Math.min(mag, 0.6)) : dist > 4 ? 0.8 : Math.min(mag, 0.68);
    burst = false;
  }
  if (s.side === "away" && s.id !== world.userId) {
    mag *= Math.min(1, weHave ? cpuMul("off") : cpuMul("def"));
  }
  if (retrieving) {
    mag = dist < 0.9 ? 0.55 : 1;
    burst = dist > 1.4;
  }
  if (userPress === "on" && holder) {
    s.yaw = turnToward(s.yaw, holder.x - s.x, holder.z - s.z, 11, 0.016);
  }
  if (ozHoldSkate) {
    const h = ozHold.get(s.id);
    if (h) {
      if (dist < 1.55) {
        h.calm = true;
        if (h.settled <= 0) h.settled = world.time;
      } else if (dist > 2.7) {
        h.calm = false;
        h.settled = 0;
      }
      if (h.calm && dist < 2.7) {
        mag = 0;
        burst = false;
      } else mag = Math.max(mag, dist < 3.2 ? 0.78 : 0.96);
    }
  }
  if (stickChase) {
    const dPuck = Math.hypot(s.x - puck.x, s.z - puck.z);
    mag = dPuck < 0.9 ? 0.78 : 1;
    burst = dPuck > 1.5;
  }
  const rep = repulsion(s);
  const rw = stickChase
    ? 0.12
    : ozHoldSkate
      ? 0
      : userPress === "on"
        ? 0.05
        : s.side === "home" && weHave && !passToMe
          ? 1.15
          : dist < 2
            ? 0.55
            : 1;
  return {
    wx: dx / dist + rep.x * rw,
    wz: dz / dist + rep.z * rw,
    mag,
    burst,
  };
}

function chaseDumpIn(s: Skater, dt: number): boolean {
  if (s.side !== "home" || s.id === world.userId) return false;
  if (world.whistle || world.faceoff) return false;
  const puck = world.puck;
  if (puck.owner !== null) return false;
  const spd = Math.hypot(puck.vx, puck.vz);
  const def = defendDir("home");
  if (spd > 13.2 && puck.vx * def > 6.5 && Math.abs(puck.z) < 2.4) return false;
  const inHome = puck.x * def > BLUE_X - 5;
  const comingHome = puck.vx * def > 2 && puck.x * def > -8;
  if (!inHome && !comingHome) return false;
  if (puck.x * def > GOAL_LINE_X - 0.08) return false;
  const lookX = puck.x + puck.vx * 0.28;
  const lookZ = puck.z + puck.vz * 0.28;
  const gD = Math.hypot(s.x - lookX, s.z - lookZ);
  const gEta = gD / 6.6;
  let awayEta = 99;
  for (const o of world.skaters) {
    if (o.side !== "away" || o.kind === "goalie") continue;
    const d = Math.hypot(o.x - lookX, o.z - lookZ);
    const closing = 10.8 + Math.hypot(o.vx, o.vz) * 0.12;
    const eta = d / Math.max(2.4, closing);
    if (eta < awayEta) awayEta = eta;
  }
  if (gEta + 0.38 >= awayEta) return false;
  skateGoalieTo(s, lookX, lookZ, dt);
  return true;
}

function goalieOutOfCrease(s: Skater): boolean {
  const fromLine = (s.x - defendDir(s.side) * GOAL_LINE_X) * attackDir(s.side);
  if (fromLine < -0.06) return true;
  const r = CREASE_R + 0.12;
  return !(fromLine <= r && fromLine * fromLine + s.z * s.z <= r * r);
}

function looseEnd(puck: Puck): 1 | -1 | 0 {
  if (puck.owner !== null || puck.y > 1.25) return 0;
  if (puck.x > GOAL_LINE_X + 0.02) return 1;
  if (puck.x < -(GOAL_LINE_X + 0.02)) return -1;
  return 0;
}

function retrieveAroundNet(s: Skater, puck: Puck, end: 1 | -1): { tx: number; tz: number } {
  const mouth = end * GOAL_LINE_X;
  const post = GOAL_W / 2 + s.radius + GOAL_PIPE_R + 0.22;
  const side = (Math.sign(puck.z) || Math.sign(s.z) || 1) as 1 | -1;
  const skaterBehind = (s.x - mouth) * end > GOAL_D + 0.2;
  const skaterWide = Math.abs(s.z) > post - 0.25;
  if (segmentHitsCage(s.x, s.z, puck.x, puck.z)) {
    if (!skaterWide && !skaterBehind) return { tx: mouth - end * 0.2, tz: side * post };
    const backX = mouth + end * (GOAL_D + s.radius + 0.48);
    if (!skaterBehind) return { tx: backX, tz: side * post };
    const tz = Math.max(-post, Math.min(post, puck.z));
    if (segmentHitsCage(s.x, s.z, backX, tz) || segmentHitsCage(backX, tz, puck.x, puck.z)) {
      return { tx: backX, tz: side * post };
    }
    return { tx: backX, tz };
  }
  let tx = puck.x + puck.vx * 0.14;
  const tz = puck.z + puck.vz * 0.14;
  const endX = end * (RINK_L / 2 - 0.78);
  if (end > 0) tx = Math.min(tx, endX);
  else tx = Math.max(tx, endX);
  return { tx, tz };
}

function clampRetrieve(tx: number, tz: number, end: 1 | -1): { tx: number; tz: number } {
  const endX = end * (RINK_L / 2 - 0.72);
  let x = end > 0 ? Math.min(tx, endX) : Math.max(tx, endX);
  if (end > 0) x = Math.max(x, -GOAL_LINE_X + 2.4);
  else x = Math.min(x, GOAL_LINE_X - 2.4);
  const z = Math.max(-RINK_W / 2 + 1.05, Math.min(RINK_W / 2 - 1.05, tz));
  return { tx: x, tz: z };
}

function goalieCreasePoint(s: Skater): { x: number; z: number } {
  const end = (defendDir(s.side) >= 0 ? 1 : -1) as 1 | -1;
  const mouth = end * GOAL_LINE_X;
  const netX = end * (GOAL_LINE_X - 0.85);
  const spot = { x: netX, z: 0 };
  if (!segmentHitsCage(s.x, s.z, spot.x, spot.z)) return spot;
  const post = GOAL_W / 2 + s.radius + GOAL_PIPE_R + 0.22;
  const side = Math.sign(s.z) || Math.sign(world.puck.z) || 1;
  const wide = Math.abs(s.z) > post - 0.2;
  const behind = (s.x - mouth) * end > 0.15;
  if (!wide) return { x: mouth - end * 0.15, z: side * post };
  if (behind) return { x: mouth + end * (GOAL_D + s.radius + 0.4), z: side * post };
  return { x: mouth - end * 0.15, z: side * post };
}

function goalieRetrievePoint(s: Skater): { x: number; z: number } {
  const end = (defendDir(s.side) >= 0 ? 1 : -1) as 1 | -1;
  const at = retrieveAroundNet(s, world.puck, end);
  return { x: at.tx, z: at.tz };
}

function skateGoalieTo(s: Skater, tx: number, tz: number, dt: number): void {
  const dx = tx - s.x;
  const dz = tz - s.z;
  const d = Math.hypot(dx, dz) || 1;
  integrateSkater(s, dx / d, dz / d, d < 0.28 ? 0 : 1, goalieOutOfCrease(s), dt);
  const puck = world.puck;
  s.yaw = turnToward(s.yaw, puck.x - s.x, puck.z - s.z, 6.5, dt);
  keepInBowl(s);
}

function etaToSpot(s: Skater, x: number, z: number): number {
  const d = Math.hypot(s.x - x, s.z - z);
  const spd = Math.max(7.5, Math.hypot(s.vx, s.vz));
  return d / spd;
}

function attackerPressingNet(g: Skater): boolean {
  const end = defendDir(g.side);
  const mouth = end * GOAL_LINE_X;
  for (const o of world.skaters) {
    if (o.side === g.side || o.kind === "goalie") continue;
    if (o.stun > 0.35 || o.struck > 0.4) continue;
    const fromLine = (mouth - o.x) * end;
    if (fromLine > 0.4 && fromLine < 8 && Math.abs(o.z) < 3.2) return true;
  }
  return false;
}

function goaliePlayLoose(g: Skater): boolean {
  const puck = world.puck;
  if (puck.owner !== null || world.stoppage || world.faceoff) return false;
  if (g.stun > 0.12 || g.struck > 0.18 || g.tumble !== 0) return false;
  if (puck.y > 1.25) return false;
  const end = defendDir(g.side);
  const mouth = end * GOAL_LINE_X;
  const behindLine = puck.x * end > GOAL_LINE_X - 0.08;
  const nearNet = Math.hypot(puck.x - mouth, puck.z) < 7.5 && puck.x * end > BLUE_X - 2.5;
  const spd = Math.hypot(puck.vx, puck.vz);
  if (!behindLine && !nearNet) return false;
  if (!behindLine && (spd > 6.5 || (puck.vx * end > 4.5 && spd > 7))) return false;
  const lookX = puck.x + puck.vx * 0.18;
  const lookZ = puck.z + puck.vz * 0.18;
  const gD = Math.hypot(g.x - lookX, g.z - lookZ);
  const gEta = gD / Math.max(8, goalieSkateCap(g) * 0.82);
  let aEta = 99;
  for (const o of world.skaters) {
    if (o.side === g.side || o.kind === "goalie") continue;
    if (o.stun > 0.35 || o.struck > 0.4) continue;
    const eta = etaToSpot(o, lookX, lookZ);
    if (eta < aEta) aEta = eta;
  }
  let band: "free" | "no" | "risk" = "free";
  if (gD < 2.4 && spd < 8) band = "free";
  else if (aEta + 0.5 < gEta) band = "no";
  else if (aEta <= gEta + 0.25) band = "risk";
  const key = `${band}:${behindLine ? 1 : 0}:${Math.round(lookX / 2)}:${Math.round(lookZ / 2)}`;
  const prev = playLooseMem.get(g.id);
  if (prev && prev.key === key) return prev.yes;
  let yes = true;
  if (band === "no") yes = false;
  else if (band === "risk") yes = !attackerPressingNet(g) && Math.random() < 0.65;
  playLooseMem.set(g.id, { key, yes });
  return yes;
}

function goalieFar(s: Skater): boolean {
  if (s.tumble !== 0 || s.struck > 0.18 || s.stun > 0.08) return true;
  return goalieOutOfCrease(s);
}

function goalieSkateCap(s: Skater): number {
  const mul = s.side === "home" ? userMul("off") : cpuMul("off");
  return WINGER_BURST * (s.id === world.userId ? 1.14 : 0.9) * mul;
}

function decayGoalieDown(s: Skater, dt: number): void {
  s.stun = Math.max(0, s.stun - dt);
  if (s.struck > 0) s.struck = Math.max(0, s.struck - dt);
  if (s.tumble === 0) return;
  const u = Math.max(0, (s.struck - 0.14) / 1.54);
  const sign = Math.sign(s.tumble) || 1;
  s.tumble = sign * Math.min(Math.abs(s.tumble), 1.3 * u);
  if (u <= 0) s.tumble = 0;
}

function skateGoalieBack(s: Skater, dt: number): void {
  const spot = goalieCreasePoint(s);
  skateGoalieTo(s, spot.x, spot.z, dt);
}

function thinkGoalie(s: Skater, dt: number): void {
  const netX = defendDir(s.side) * (GOAL_LINE_X - 0.85);
  const puck = world.puck;
  const holder = puck.owner !== null ? world.skaters[puck.owner] : null;
  const attackOnMe = holder && holder.side !== s.side;
  const home = s.side === "home";
  const far = s.id !== world.userId && goalieFar(s);
  if (home && s.id !== world.userId && world.goalieRecallT > 0) {
    const shotAt =
      !holder &&
      Math.hypot(puck.vx, puck.vz) > 5.5 &&
      puck.vx * defendDir(s.side) > 5;
    if ((shotAt || attackOnMe) && !far) world.goalieRecallT = 0;
    else if (!far && Math.hypot(s.x - netX, s.z) < 2.45) {
      world.goalieRecallT = Math.max(0, world.goalieRecallT - dt);
    }
  }

  if (world.faceoff && world.faceoffPhase !== "live") {
    const spot = goalieCreasePoint(s);
    s.x += (spot.x - s.x) * Math.min(1, 8 * dt);
    s.z += (spot.z - s.z) * Math.min(1, 7 * dt);
    s.trackZ = 0;
    s.trackVz = 0;
    s.yaw = faceYaw(s.side);
    s.vx = 0;
    s.vz = 0;
    s.lean = 0.1;
    s.bank = 0;
    collideSkater(s);
    return;
  }

  s.poke = Math.max(0, s.poke - dt);

  if (s.stun > 0.04 || s.struck > 0.18 || s.tumble !== 0) {
    decayGoalieDown(s, dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.vx *= Math.exp(-2.2 * dt);
    s.vz *= Math.exp(-2.2 * dt);
    collideSkater(s);
    keepInBowl(s);
    return;
  }

  if (s.id !== world.userId && home && puck.owner !== s.id && chaseDumpIn(s, dt)) return;

  if (puck.owner === s.id) {
    if (s.gloveFlash > 0.12) {
      collideSkater(s);
      keepInBowl(s);
      return;
    }
    const crash = creaseCrash(s);
    const open = !Number.isFinite(crash) || crash > 2.15;
    if (s.side === "away" && open && world.coverT >= GOALIE_HOLD && world.time - world.lastPass > 0.16) {
      s.coverPose += (0 - s.coverPose) * Math.min(1, 10 * dt);
      doGoalieOutlet(s, 0, 0, !Number.isFinite(crash) || crash > 3.8);
      s.coverPose *= 0.2;
      collideSkater(s);
      return;
    }
    if (goalieOutOfCrease(s)) {
      const spot = goalieCreasePoint(s);
      skateGoalieTo(s, spot.x, spot.z, dt);
      return;
    }
    s.x += (netX - s.x) * Math.min(1, 4 * dt);
    s.trackZ = s.z;
    s.trackVz = 0;
    s.vx = 0;
    s.vz = 0;
    s.lean = 0.12 + s.coverPose * 0.42;
    s.bank = 0;
    s.yaw = faceYaw(s.side);
    collideSkater(s);
    return;
  }

  if (goaliePlayLoose(s)) {
    const spot = goalieRetrievePoint(s);
    skateGoalieTo(s, spot.x, spot.z, dt);
    return;
  }

  if (far) {
    skateGoalieBack(s, dt);
    return;
  }

  const gMul = home ? 1 : cpuMul("g");
  const lead = home ? 0.18 : 0.04 + 0.08 * Math.min(1, gMul);
  const reverse = home ? 14 : 5 + 6 * Math.min(1, gMul);
  const zMax = home ? 0.84 : 0.7;
  const mouth = defendDir(s.side) * GOAL_LINE_X;
  const depth = Math.max(0.5, Math.abs(s.x - mouth));
  const angleZ = (tx: number, tz0: number) => {
    const along = Math.max(depth, Math.abs(tx - mouth));
    return Math.max(-zMax, Math.min(zMax, tz0 * (depth / along)));
  };

  let tz: number;
  const shotAtMe =
    !holder &&
    Math.hypot(puck.vx, puck.vz) > 5.5 &&
    puck.vx * defendDir(s.side) > 5;
  if (shotAtMe && !far) {
    const ttm = Math.max(0.02, (mouth - puck.x) / (puck.vx || 1));
    tz = puck.z + puck.vz * Math.min(home ? 0.35 : 0.1, ttm);
    tz = Math.max(-zMax, Math.min(zMax, tz));
    if (home) {
      s.trackZ = tz;
      s.trackVz = 0;
      const step = Math.max(-6.2 * dt, Math.min(6.2 * dt, tz - s.z));
      s.z += step;
    } else {
      s.trackZ += (tz - s.trackZ) * Math.min(1, 2.1 * dt);
      s.trackVz = 0;
      s.z += (s.trackZ - s.z) * Math.min(1, 2.6 * dt);
      s.z = Math.max(-zMax, Math.min(zMax, s.z));
    }
  } else if (attackOnMe && holder) {
    tz = angleZ(holder.x, holder.z + holder.vz * lead);
  } else {
    tz = angleZ(puck.x, puck.z + puck.vz * (home ? 0.08 : 0.06));
  }
  tz = Math.max(-zMax, Math.min(zMax, tz));

  if (!shotAtMe) {
    const toward = tz - s.trackZ;
    const reversing = Math.sign(toward) !== Math.sign(s.trackVz) && Math.abs(s.trackVz) > 0.55;
    if (reversing && home) {
      s.trackVz *= Math.exp(-1.05 * dt);
      s.trackZ += s.trackVz * dt;
    } else {
      const k = reverse * dt;
      s.trackVz += (toward * 9 - s.trackVz * 3.4) * dt;
      s.trackZ += s.trackVz * Math.min(1, k);
    }
    s.trackZ = Math.max(-zMax, Math.min(zMax, s.trackZ));
    const recalling = home && world.goalieRecallT > 0;
    s.x += (netX - s.x) * Math.min(1, (recalling ? 1.4 : 6) * dt);
    s.z += (s.trackZ - s.z) * Math.min(1, (recalling ? 1.6 : home ? 10 : 14) * dt);
  } else if (!far) {
    s.x += (netX - s.x) * Math.min(1, 8 * dt);
  }
  collideSkater(s);
  const restYaw = faceYaw(s.side);
  const def = defendDir(s.side);
  const endLine = def * GOAL_LINE_X;
  const behind = puck.x * def > GOAL_LINE_X - 0.12;
  if (s.id === world.userId) {
    s.yaw = turnToward(s.yaw, puck.x - s.x, puck.z - s.z, 4, dt);
  } else if (behind) {
    const post = (GOAL_W / 2 - 0.14) * (puck.z >= 0 ? 1 : -1);
    const wrapMax = GOAL_W / 2 + 0.08;
    const lip = s.radius + GOAL_PIPE_R + 0.04;
    s.trackZ = Math.max(-wrapMax, Math.min(wrapMax, post));
    s.trackVz = 0;
    s.x += (endLine - def * lip - s.x) * Math.min(1, 7 * dt);
    s.z += (s.trackZ - s.z) * Math.min(1, 9 * dt);
    collideSkater(s);
    const wrapYaw =
      attackDir(s.side) > 0 ? (puck.z >= 0 ? -Math.PI : 0) : puck.z >= 0 ? Math.PI : 0;
    s.yaw = turnToward(s.yaw, -Math.sin(wrapYaw), -Math.cos(wrapYaw), 7, dt);
  } else {
    const want = turnToward(s.yaw, puck.x - s.x, puck.z - s.z, 4, dt);
    let dYaw = want - restYaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    dYaw = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, dYaw));
    s.yaw = turnToward(s.yaw, -Math.sin(restYaw + dYaw), -Math.cos(restYaw + dYaw), 5, dt);
    s.z = Math.max(-zMax, Math.min(zMax, s.z));
    s.trackZ = Math.max(-zMax, Math.min(zMax, s.trackZ));
  }
  s.vx = 0;
  s.vz = shotAtMe ? 0 : s.trackVz * 0.35;
  s.lean = 0.08;
  s.bank = 0;

  if (attackOnMe && holder) {
    goalieDefendCarry(s, holder);
  }
}

function stripByGoalie(g: Skater, holder: Skater): void {
  g.poke = 0.42;
  const dx = holder.x - g.x;
  const dz = holder.z - g.z;
  const d = Math.hypot(dx, dz) || 1;
  const out = defendDir(g.side);
  launchPuck(
    holder,
    out * -(10 + Math.random() * 4) + (dx / d) * 2.2,
    (dz / d) * 6 + (Math.random() - 0.5) * 5,
    1.1 + Math.random() * 0.7,
  );
  holder.stun = 0.28;
  world.lastPass = world.time;
  world.lastShoot = world.time;
  world.goalieSaveT = world.time;
}

function updateWrapFlag(holder: Skater): void {
  const attack = attackDir(holder.side);
  const mouth = attack * GOAL_LINE_X;
  const past = (holder.x - mouth) * attack;
  const beside = Math.abs(holder.z) > GOAL_W / 2 + 0.12;
  if (past > 0.08 && beside) {
    world.wrapBehind = true;
    world.wrapSide = Math.sign(holder.z) || world.wrapSide;
  } else if ((mouth - holder.x) * attack > 5.5) {
    world.wrapBehind = false;
    world.wrapSide = 0;
  }
}

function goalieDefendCarry(g: Skater, holder: Skater): void {
  if (holder.kind === "goalie" || holder.side === g.side) return;
  if (userStickCommitHolds(holder.id)) return;
  const attack = attackDir(holder.side);
  const mouth = attack * GOAL_LINE_X;
  const distMouth = (mouth - holder.x) * attack;
  const d = Math.hypot(holder.x - g.x, holder.z - g.z);
  if (d > 2.25) return;
  const inFront = distMouth >= 0 && distMouth < 2.7 && Math.abs(holder.z) < 1.95;
  if (inFront && !world.wrapBehind) {
    stripByGoalie(g, holder);
  }
}

function allowWrapTuck(holder: Skater, g: Skater | undefined): boolean {
  if (!world.wrapBehind || !g) return false;
  const vacated = Math.sign(holder.z) !== 0 && Math.sign(holder.z) !== Math.sign(g.z);
  const over = Math.abs(g.z) > 0.38;
  return vacated && over && Math.random() < 0.58;
}

function thinkAi(s: Skater, dt: number): { wx: number; wz: number; mag: number; burst: boolean } {
  if (s.kind === "goalie") {
    thinkGoalie(s, dt);
    return { wx: 0, wz: 0, mag: 0, burst: false };
  }
  if (s.dive > 0) return { wx: 0, wz: 0, mag: 0, burst: false };
  if (world.puck.owner === s.id) return thinkCarrier(s);
  return thinkWithoutPuck(s);
}

function defendUserCarrier(s: Skater, holder: Skater): void {
  if ((pressPeelEnd.get(s.id) ?? -1) > world.time) return;
  const ids = userPressIds(holder);
  if (s.id !== ids.primary && s.id !== ids.second) return;
  const dx = holder.x - s.x;
  const dz = holder.z - s.z;
  const d = Math.hypot(dx, dz);
  const { fx, fz } = heading(s.yaw);
  const ahead = dx * fx + dz * fz;
  if (d > 2.15 || ahead < -0.15) return;
  const blade = stickBlade(s);
  const dBlade = Math.hypot(blade.x - world.puck.x, blade.z - world.puck.z);
  if (dBlade > 1.42) return;
  s.yaw = Math.atan2(-dx, -dz);
  const idle = world.time - world.lastUserActT > 3;
  const hitP = (idle ? 0.36 : 0.11) * (s.kind === "defense" ? 1 : 0.4);
  const hit = Math.random() < hitP;
  if (hit) {
    s.hit = 0.42;
    armCheckSwing(s);
    const wind = 0.5;
    const peel = idle ? 0.55 : 0.84;
    pressPeelAt.set(s.id, world.time + wind);
    pressPeelEnd.set(s.id, world.time + wind + peel);
  } else {
    s.poke = 0.36;
    pressPeelAt.set(s.id, world.time + 0.62);
    pressPeelEnd.set(s.id, world.time + 0.62);
  }
}

function cpuDefend(s: Skater): void {
  if (s.id === world.userId || s.kind === "goalie") return;
  if (s.side === "home" && s.kind !== "defense") return;
  if (s.stun > 0.04 || s.struck > 0.18) return;
  if (world.faceoff || world.stoppage) return;
  const puck = world.puck;
  const holder = puck.owner !== null ? world.skaters[puck.owner] : null;
  if (holder && holder.side === s.side) return;

  const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : null;
  const sinceShot = world.time - world.lastShoot;
  if (
    !holder &&
    shooter &&
    shooter.side !== s.side &&
    sinceShot < 0.72 &&
    s.dive <= 0 &&
    s.poke <= 0
  ) {
    const attack = attackDir(shooter.side);
    const netX = attack * GOAL_LINE_X;
    const toward = puck.vx * attack > 4.2;
    const lane = Math.abs(s.z - puck.z) < 1.7 && (netX - s.x) * attack > 0.25 && (netX - s.x) * attack < 13;
    const dPuck = Math.hypot(s.x - puck.x, s.z - puck.z);
    const diveP =
      s.side === "away" ? 0.48 * cpuMul("def") : userIdle() ? 0.05 : 0.2;
    if (toward && lane && dPuck < 4.4 && sinceShot < 0.12 && Math.random() < diveP) {
      s.dive = 1.5;
      s.poke = 0.52;
      s.yaw = Math.atan2(-(puck.x - s.x), -(puck.z - s.z));
      return;
    }
  }

  if (!holder || holder.kind === "goalie") return;
  if (s.poke > 0 || s.hit > 0 || s.dive > 0) return;
  if (holder.id === world.userId && holder.side !== s.side) {
    defendUserCarrier(s, holder);
    return;
  }
  const dx = holder.x - s.x;
  const dz = holder.z - s.z;
  const d = Math.hypot(dx, dz);
  const { fx, fz } = heading(s.yaw);
  const ahead = dx * fx + dz * fz;
  if (d > 2.4 || ahead < -0.35) return;
  s.yaw = Math.atan2(-dx, -dz);
  const def = s.side === "away" ? cpuMul("def") : userIdle() ? 0.32 : 0.7;
  const roll = Math.random();
  if (roll < 0.026 * def) {
    s.poke = 0.36;
  } else if (
    s.side === "away" &&
    s.kind === "defense" &&
    world.time - world.lastUserActT >= 2.5 &&
    roll < 0.0032 * def &&
    d < 2.12 &&
    ahead > 0.12
  ) {
    s.hit = 0.42;
    armCheckSwing(s);
  }
}

export function stickBlade(s: Skater): { x: number; z: number } {
  const yaw = s.yaw + Math.PI;
  const lx = s.kind === "goalie" ? 0.04 : 0.22;
  const lz = s.kind === "goalie" ? 0.28 : 0.82;
  const c = Math.cos(yaw);
  const si = Math.sin(yaw);
  return {
    x: s.x + lx * c + lz * si,
    z: s.z - lx * si + lz * c,
  };
}

const BLUE_HALF = 0.5 * FT;
const PUCK_R = 0.04;
const CROSSBAR_R = GOAL_PIPE_R;

function puckOzSide(puck: Puck): 0 | 1 | -1 {
  if (puck.x - PUCK_R > BLUE_X + BLUE_HALF) return 1;
  if (puck.x + PUCK_R < -BLUE_X - BLUE_HALF) return -1;
  return 0;
}

function offsidesLive(): boolean {
  const ui = useGame.getState();
  return ui.offsides && ui.clockMode === "game";
}

function mustHoldOnside(s: Skater): boolean {
  if (s.kind === "goalie") return false;
  if (world.puck.owner === s.id) return false;
  if (world.stoppage || world.faceoff) return false;
  if (!offsidesLive()) return false;
  return puckOzSide(world.puck) !== attackDir(s.side);
}

function clampOnsideX(s: Skater, tx: number): number {
  if (!mustHoldOnside(s)) return tx;
  const attack = attackDir(s.side);
  const cap = attack * (BLUE_X - 0.5);
  return attack > 0 ? Math.min(tx, cap) : Math.max(tx, cap);
}

function keepOnside(s: Skater): void {
  if (!mustHoldOnside(s)) return;
  const attack = attackDir(s.side);
  const capAlong = BLUE_X - 0.35;
  const over = s.x * attack - capAlong;
  if (over <= 0 || over > 2.2) return;
  s.x -= attack * Math.min(over, 0.28);
  if (s.vx * attack > 0) s.vx = 0;
}

function attackerClearOfBlue(s: Skater, dir: 1 | -1): boolean {
  const blade = stickBlade(s);
  const xs = [s.x - s.radius, s.x + s.radius, blade.x, s.x * 0.5 + blade.x * 0.5, s.x * 0.2 + blade.x * 0.8];
  let minAlong = Infinity;
  for (const x of xs) {
    const along = x * dir;
    if (along < minAlong) minAlong = along;
  }
  return minAlong > BLUE_X + BLUE_HALF;
}

let offsideTouchSide: 0 | 1 | -1 = 0;

function noteAttackerTouch(s: Skater): void {
  if (s.kind === "goalie" || !offsidesLive()) return;
  const side = (attackDir(s.side) >= 0 ? 1 : -1) as 1 | -1;
  if (world.delayedOffside !== 0 && world.delayedOffside !== side) return;
  if (puckOzSide(world.puck) !== side) return;
  offsideTouchSide = side;
}

function setDelayedSide(side: 0 | 1 | -1): void {
  world.delayedOffside = side;
  const on = side !== 0;
  const ui = useGame.getState();
  if (ui.delayedOffside !== on) ui.setDelayedOffside(on);
}

function clearDelayedOffside(): void {
  if (world.delayedOffside !== 0) world.delayedOffside = 0;
  const ui = useGame.getState();
  if (ui.delayedOffside) ui.setDelayedOffside(false);
}

function attackingSide(dir: 1 | -1): "home" | "away" {
  return attackDir("home") === dir ? "home" : "away";
}

function attackersTaggedUp(dir: 1 | -1): boolean {
  const side = attackingSide(dir);
  for (const s of world.skaters) {
    if (s.side !== side || s.kind === "goalie") continue;
    if (attackerClearOfBlue(s, dir)) return false;
  }
  return true;
}

function attackerAcrossBlue(dir: 1 | -1): boolean {
  const side = attackingSide(dir);
  for (const s of world.skaters) {
    if (s.side !== side || s.kind === "goalie") continue;
    if (attackerClearOfBlue(s, dir)) return true;
  }
  return false;
}

function attackerContactingPuck(dir: 1 | -1): boolean {
  const side = attackingSide(dir);
  const puck = world.puck;
  if (puck.owner !== null) {
    const h = world.skaters[puck.owner];
    if (h && h.side === side && h.kind !== "goalie") return true;
  }
  for (const s of world.skaters) {
    if (s.side !== side || s.kind === "goalie") continue;
    if (Math.hypot(s.x - puck.x, s.z - puck.z) < s.radius + 0.07 && puck.y < 1.15) return true;
    if (puck.y > 0.5) continue;
    const blade = stickBlade(s);
    const xs = [blade.x, s.x * 0.5 + blade.x * 0.5, s.x * 0.2 + blade.x * 0.8];
    const zs = [blade.z, s.z * 0.5 + blade.z * 0.5, s.z * 0.2 + blade.z * 0.8];
    for (let i = 0; i < xs.length; i++) {
      if (Math.hypot(xs[i]! - puck.x, zs[i]! - puck.z) < 0.3) return true;
    }
  }
  return false;
}

function blowDelayedOffside(dir: 1 | -1): void {
  world.faceX = dir * FACEOFF_NZ_X;
  world.faceZ = world.puck.z >= 0 ? FACEOFF_SPOT_Z : -FACEOFF_SPOT_Z;
  clearDelayedOffside();
  startStoppage("offside");
}

function checkOffside(): void {
  if (world.stoppage || world.faceoff) return;
  if (!offsidesLive()) {
    world.puckOz = puckOzSide(world.puck);
    clearDelayedOffside();
    return;
  }
  const now = puckOzSide(world.puck);
  const was = world.puckOz;
  world.puckOz = now;
  const delay = world.delayedOffside;
  if (delay !== 0) {
    if (now === delay && attackersTaggedUp(delay)) clearDelayedOffside();
    else if (offsideTouchSide === delay || (now === delay && attackerContactingPuck(delay))) {
      blowDelayedOffside(delay);
      return;
    } else if (now !== delay) clearDelayedOffside();
  }
  if (now === 0 || now === was || world.delayedOffside !== 0) return;
  if (!attackerAcrossBlue(now)) return;
  setDelayedSide(now);
  if (offsideTouchSide === now || attackerContactingPuck(now)) blowDelayedOffside(now);
}

function stopForGoal(side: 1 | -1): void {
  checkOffside();
  if (world.stoppage) return;
  if (world.delayedOffside !== 0) {
    blowDelayedOffside(world.delayedOffside);
    return;
  }
  startStoppage("goal", side);
}

export function refHandPos(): { x: number; y: number; z: number } {
  const r = refForLane(dropperLane());
  const yaw = r.yaw + Math.PI;
  const lx = 0.3;
  const ly = r.handY;
  const lz = 0.2;
  const c = Math.cos(yaw);
  const si = Math.sin(yaw);
  return {
    x: r.x + lx * c + lz * si,
    y: ly,
    z: r.z - lx * si + lz * c,
  };
}

function aimDir(s: Skater, mx: number, my: number): { ax: number; az: number } {
  const mag = Math.hypot(mx, my);
  if (mag > 0.18) {
    const wx = world.camRx * mx + world.camFx * my;
    const wz = world.camRz * mx + world.camFz * my;
    const m = Math.hypot(wx, wz) || 1;
    return { ax: wx / m, az: wz / m };
  }
  const { fx, fz } = heading(s.yaw);
  return { ax: fx, az: fz };
}

function teammatesOf(from: Skater): Skater[] {
  return world.skaters.filter((s) => s.id !== from.id && s.side === from.side && s.kind !== "goalie");
}

function bestPassTarget(from: Skater, ax: number, az: number, requireAim = false): Skater | null {
  const mates = teammatesOf(from);
  if (!mates.length) return null;
  let best: Skater | null = null;
  let bestScore = -Infinity;
  for (const s of mates) {
    const dx = s.x - from.x;
    const dz = s.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) continue;
    const nd = dist || 1;
    const align = (dx * ax + dz * az) / nd;
    if (requireAim && align < 0.58) continue;
    const perp = Math.abs(dx * -az + dz * ax);
    const along = dx * ax + dz * az;
    const cover = nearestFoe(s);
    const open = Math.min(6, cover.d);
    const distTerm = dist < 22 ? (dist < 3.2 ? dist * 0.18 : 1.25 - dist * 0.022) : -1.4;
    const cone = align > 0.06 ? align * 18 : align * 0.4;
    const onLine = along > 0.5 && perp < 2.8 ? 10 - perp * 2.2 : 0;
    const score = cone + onLine + distTerm * 2.4 + open * 0.32 + (s.kind === "winger" ? 0.4 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (requireAim) return best && bestScore > 5.5 ? best : null;
  if (best && bestScore > -2) return best;
  let nearest = mates[0]!;
  let nd = Infinity;
  for (const s of mates) {
    const d = Math.hypot(s.x - from.x, s.z - from.z);
    if (d < nd) {
      nd = d;
      nearest = s;
    }
  }
  return nearest;
}

function passOrigin(s: Skater): { x: number; z: number } {
  if (s.kind === "goalie") {
    const attack = attackDir(s.side);
    return { x: s.x + attack * 1.35, z: s.z };
  }
  return stickBlade(s);
}

function tapePass(s: Skater, mate: Skater, saucer: boolean): void {
  const blade = passOrigin(s);
  const cpuGoalie = s.kind === "goalie" && s.side !== "home";
  const leadT = cpuGoalie
    ? 0.34 + Math.min(0.4, Math.hypot(mate.x - s.x, mate.z - s.z) * 0.018)
    : 0.22 + Math.min(0.32, Math.hypot(mate.x - s.x, mate.z - s.z) * 0.014);
  const tx = mate.x + mate.vx * leadT;
  const tz = mate.z + mate.vz * leadT;
  const dx = tx - blade.x;
  const dz = tz - blade.z;
  const travel = Math.hypot(dx, dz) || 1;
  const eta = Math.max(cpuGoalie ? 0.48 : 0.44, Math.min(cpuGoalie ? 0.92 : 0.66, travel / (cpuGoalie ? 22 : 24)));
  const cap = saucer || cpuGoalie ? (cpuGoalie ? 22 : 28) : 24;
  const floor = cpuGoalie ? 12.5 : 15.5;
  const power = Math.min(cap, Math.max(floor, travel / eta));
  launchPuck(s, (dx / travel) * power, (dz / travel) * power, saucer ? 2.2 : cpuGoalie ? 0.42 : 0.03);
  world.lastPassTo = mate.id;
  world.oneTimerUntil = world.time + 2.2;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
}

function launchPuck(s: Skater, vx: number, vz: number, vy = 0): void {
  noteAttackerTouch(s);
  rimRide = null;
  boardRide = null;
  boardBank = null;
  overWall.delete(world.puck);
  shotIron = null;
  ironResolved = null;
  drillPipeHit = false;
  const blade = passOrigin(s);
  world.puck.owner = null;
  world.puck.x = blade.x;
  world.puck.z = blade.z;
  world.puck.y = PUCK_Y + Math.max(0, vy * 0.02);
  world.puck.vx = vx;
  world.puck.vz = vz;
  world.puck.vy = vy;
  world.coverT = 0;
  world.reboundSoft = false;
  world.goalieShot = null;
  if (s.kind === "goalie") {
    s.coverPose = 0;
    s.gloveFlash = 0;
  }
}

function clearPassTarget(from: Skater, ax: number, az: number, aimed: boolean): Skater | null {
  const attack = attackDir(from.side);
  let best: Skater | null = null;
  let bestScore = -Infinity;
  for (const s of teammatesOf(from)) {
    const dx = s.x - from.x;
    const dz = s.z - from.z;
    const dist = Math.hypot(dx, dz) || 1;
    const up = dx * attack;
    if (up < 1.15 || dist < 2.3 || dist > 24) continue;
    const align = (dx * ax + dz * az) / dist;
    if (aimed && align < 0.62) continue;
    const open = nearestFoe(s).d;
    if (open < 2.7) continue;
    const score =
      up * 0.42 + open * 0.8 + (aimed ? align * 12 : 1.6) + (s.kind === "winger" ? 0.45 : 0) - dist * 0.02;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

type FarPlay = { flip: boolean; bank: -1 | 0 | 1; high: boolean };
type FarLuck = "in" | "post" | "bar" | "wide" | "over";

function farPlayFromStick(mx: number, my: number, hold: boolean): FarPlay {
  const aim = stickToNetAim(mx, my, "home");
  const side = aim.lat * aimZSign("home");
  let bank: -1 | 0 | 1 = 0;
  if (side > 0.32) bank = 1;
  else if (side < -0.32) bank = -1;
  const high = hold;
  return { flip: high && bank === 0, bank, high };
}

function cpuFarPlay(): FarPlay {
  const r = Math.random();
  if (r < 0.25) return { flip: false, bank: 0, high: false };
  if (r < 0.5) return { flip: true, bank: 0, high: true };
  if (r < 0.75) return { flip: false, bank: -1, high: false };
  return { flip: false, bank: 1, high: false };
}

function farLuck(): FarLuck {
  const r = Math.random();
  if (r < 0.5) return "in";
  if (r < 0.625) return "post";
  if (r < 0.75) return "bar";
  if (r < 0.875) return "wide";
  return "over";
}

function farAim(luck: FarLuck, bank: -1 | 0 | 1): { z: number; y: number | null } {
  const hw = GOAL_W / 2;
  const post = bank !== 0 ? bank : Math.random() < 0.5 ? 1 : -1;
  if (luck === "in") return { z: (Math.random() * 2 - 1) * (hw - 0.28), y: null };
  if (luck === "post") return { z: post * hw, y: null };
  if (luck === "wide") return { z: post * (hw + 0.3 + Math.random() * 0.16), y: null };
  const z = (Math.random() * 2 - 1) * (hw - 0.36);
  if (luck === "bar") return { z, y: GOAL_H + 0.02 + Math.random() * 0.06 };
  return { z, y: GOAL_H + 0.32 + Math.random() * 0.14 };
}

function speedForTime(dist: number, t: number): number {
  const drag = 0.35;
  const knee = drag * t;
  if (knee < 0.05) return dist / Math.max(0.12, t);
  return (dist * drag) / (1 - Math.exp(-knee));
}

function timeForArrival(dist: number, vend: number): number {
  const drag = 0.35;
  return Math.log(1 + (Math.max(0.2, dist) * drag) / Math.max(0.8, vend)) / drag;
}

function loftTo(wantY: number, t: number): number {
  return Math.max(0, (wantY - PUCK_Y + 6 * t * t) / Math.max(0.12, t));
}

function farLoft(wantY: number, t: number): number {
  const dt = 1 / 60;
  const tt = Math.max(0.2, t);
  return Math.max(0, (wantY - PUCK_Y + 6 * tt * (tt - dt)) / (tt + 0.02));
}

function capPuckSpeed(vx: number, vz: number, maxMph: number): { vx: number; vz: number } {
  const cap = maxMph / 2.23694;
  const sp = Math.hypot(vx, vz);
  if (sp <= cap) return { vx, vz };
  const m = cap / sp;
  return { vx: vx * m, vz: vz * m };
}

function etaToNet(x: number, z: number, vx: number, vz: number, netX: number): number {
  const attack = Math.sign(netX - x) || 1;
  let px = x;
  let pz = z;
  let pvx = vx;
  let pvz = vz;
  const halfW = RINK_W / 2 - 0.09;
  const straight = RINK_L / 2 - CORNER_R;
  for (let i = 0; i < 360; i++) {
    px += pvx / 60;
    pz += pvz / 60;
    const damp = Math.exp(-0.35 / 60);
    pvx *= damp;
    pvz *= damp;
    if (Math.abs(pz) > halfW && Math.abs(px) < straight) {
      const nz = pz >= 0 ? 1 : -1;
      pz = nz * halfW;
      const b = reflectBoard(pvx, pvz, 0, nz);
      pvx = b.vx;
      pvz = b.vz;
    }
    if ((netX - px) * attack <= 0) return (i + 1) / 60;
    if (Math.hypot(pvx, pvz) < 0.8) break;
  }
  return 6;
}

function goalieLengthPlay(s: Skater, play: FarPlay): void {
  const attack = attackDir(s.side);
  const from = passOrigin(s);
  const netX = attack * GOAL_LINE_X;
  const drag = 0.35;
  const damp = BOARD_BOUNCE_DAMP;
  const luck = farLuck();
  const aim = farAim(luck, play.bank);
  let vx = 0;
  let vz = 0;
  let vy = 0.2;
  let path = Math.abs(netX - from.x);
  let banked = false;

  const fireDirect = (toX: number, toZ: number, speed: number, up: number): void => {
    const dx = toX - from.x;
    const dz = toZ - from.z;
    const dist = Math.hypot(dx, dz) || 1;
    vx = (dx / dist) * speed;
    vz = (dz / dist) * speed;
    vy = up;
    path = dist;
  };
  const iceArrive = (): number => 5.8 + Math.random() * 1.5;
  const fireFlip = (front: number): void => {
    const span = Math.abs(netX - from.x);
    const drop = Math.max(2.6, Math.min(front, span - 2.2));
    const landX = netX - attack * drop;
    const dist = Math.hypot(landX - from.x, aim.z - from.z) || 1;
    const vend = 6.2 + drag * drop;
    const t = Math.max(0.95, Math.min(2.35, timeForArrival(dist, vend)));
    fireDirect(landX, aim.z, speedForTime(dist, t), 6 * t);
    path = dist + drop;
  };
  const fireHigh = (): void => {
    const dist = Math.hypot(netX - from.x, aim.z - from.z) || 1;
    const vend = 7.4 + Math.random() * 1.4;
    const t = Math.max(1.05, Math.min(2.35, timeForArrival(dist, vend)));
    fireDirect(netX, aim.z, speedForTime(dist, t), farLoft(aim.y ?? GOAL_H, t));
  };
  const fireIce = (): void => {
    const dist = Math.hypot(netX - from.x, aim.z - from.z) || 1;
    fireDirect(netX, aim.z, drag * dist + iceArrive(), 0.05 + Math.random() * 0.16);
  };

  const homeStick = s.side === "home";
  if (play.bank === 0) {
    if (homeStick) {
      if (play.high) fireFlip(9 + Math.random() * 6);
      else fireIce();
    } else if (play.flip && aim.y === null) fireFlip(9 + Math.random() * 6);
    else if (aim.y !== null) fireHigh();
    else fireIce();
  } else {
    const B = play.bank * (RINK_W / 2 - 0.09);
    const along0 = from.x * attack;
    const alongG = GOAL_LINE_X;
    const Bz = B - from.z;
    const Bg = B - aim.z;
    const denom = Bz + Bg;
    const alongB = (Bz * alongG + Bg * along0) / denom;
    let xB = alongB * attack;
    if (homeStick && play.high && play.bank < 0 && Math.abs(xB) < 10.6) {
      const along = from.x * attack;
      xB = along < -11.2 ? -attack * 11.2 : attack * 11.2;
    }
    const dx1 = xB - from.x;
    const dz1 = B - from.z;
    const L1 = Math.hypot(dx1, dz1) || 1;
    const dx2 = netX - xB;
    const dz2 = aim.z - B;
    const L2 = Math.hypot(dx2, dz2) || 1;
    const straight =
      Math.abs(denom) > 1 && dz1 * play.bank > 0.4 && Math.abs(xB) < RINK_L / 2 - CORNER_R - 1.2;
    let clear = straight;
    if (clear) {
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        if (u < 0.9) {
          const xIn = from.x + (xB - from.x) * u;
          const zIn = from.z + (B - from.z) * u;
          if (Math.abs(zIn) > iceWidthAtX(xIn) / 2 - 0.2) clear = false;
        }
        if (u > 0.12) {
          const xOut = xB + (netX - xB) * u;
          const zOut = B + (aim.z - B) * u;
          if (Math.abs(zOut) > iceWidthAtX(xOut) / 2 - 0.16) clear = false;
        }
      }
    }
    if (!clear) {
      if (homeStick) {
        if (play.high) fireFlip(12);
        else fireIce();
      } else if (play.flip && aim.y === null) fireFlip(12);
      else if (aim.y !== null) fireHigh();
      else fireIce();
    } else {
      const ux = dx1 / L1;
      const uz = dz1 / L1;
      const arrive = !homeStick && aim.y !== null ? 7.8 + Math.random() * 1.1 : iceArrive();
      const speed = (arrive + drag * L2) / damp + drag * L1;
      vx = ux * speed;
      vz = uz * speed;
      path = L1 + L2;
      vy = homeStick ? (play.high ? 3.2 : 0.1) : aim.y === null ? 0.08 + Math.random() * 0.22 : 2.4;
      banked = true;
    }
  }

  let guard = 0;
  while (guard < 5) {
    const eta = etaToNet(from.x, from.z, vx, vz, netX);
    if (eta < 4.6) break;
    if (Math.hypot(vx, vz) >= 74 / 2.23694) break;
    vx *= 1.14;
    vz *= 1.14;
    guard++;
  }
  const capped = capPuckSpeed(vx, vz, 96);
  vx = capped.vx;
  vz = capped.vz;
  if (!homeStick && aim.y !== null && !banked) {
    const eta = etaToNet(from.x, from.z, vx, vz, netX);
    vy = farLoft(aim.y, Math.max(0.45, eta));
  }
  if (banked) {
    vy = homeStick
      ? vyForBank(from.x, from.z, vx, vz, play.high)
      : bankContactVy(from.x, from.z, vx, vz, vy);
  }

  launchPuck(s, vx, vz, vy);
  world.goalieShot = luck === "in" ? "score" : "out";
  if (world.time - world.goalieSaveT > 1.35 || path > 12) {
    world.reboundN = 0;
    world.reboundSoft = false;
  }
  world.lastShoot = world.time;
  world.lastShotSlap = false;
  world.lastShotOneTimer = false;
  world.lastShotRedirect = false;
  world.lastShotCorner = false;
  world.lastShotCornerSide = 0;
  world.lastShooter = s.id;
  world.lastShotDist = path;
  world.lastPassTo = null;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  beginShotSpeedTrack();
}

function doGoalieOutlet(s: Skater, mx: number, my: number, saucer: boolean): void {
  if (world.coverT < GOALIE_HOLD) return;
  s.coverPose = 0;
  world.coverT = 0;
  const { ax, az } = aimDir(s, mx, my);
  const aimed = Math.hypot(mx, my) > (s.side === "home" ? 0.22 : 0.16);
  const mate = clearPassTarget(s, ax, az, aimed);
  if (mate) {
    tapePass(s, mate, saucer);
  } else if (s.side === "home") {
    goalieLengthPlay(s, farPlayFromStick(mx, my, saucer));
  } else {
    goalieLengthPlay(s, cpuFarPlay());
  }
  world.lastPass = world.time;
  world.lastPasser = s.id;
  world.lastPassX = s.x;
  world.lastPassZ = s.z;
  world.coverT = 0;
  s.coverPose = 0;
}

type BoardHit = { x: number; z: number; nx: number; nz: number; dist: number };

function nearestBoards(x: number, z: number): BoardHit {
  const halfL = RINK_L / 2;
  const halfW = RINK_W / 2;
  const innerL = halfL - CORNER_R;
  const innerW = halfW - CORNER_R;
  if (Math.abs(x) <= innerL) {
    const nz = z >= 0 ? 1 : -1;
    return { x, z: nz * halfW, nx: 0, nz, dist: halfW - Math.abs(z) };
  }
  if (Math.abs(z) <= innerW) {
    const nx = x >= 0 ? 1 : -1;
    return { x: nx * halfL, z, nx, nz: 0, dist: halfL - Math.abs(x) };
  }
  const sx = x >= 0 ? 1 : -1;
  const sz = z >= 0 ? 1 : -1;
  const cx = sx * innerL;
  const cz = sz * innerW;
  const dx = x - cx;
  const dz = z - cz;
  const distC = Math.hypot(dx, dz) || 1e-6;
  const nx = dx / distC;
  const nz = dz / distC;
  return { x: cx + nx * CORNER_R, z: cz + nz * CORNER_R, nx, nz, dist: CORNER_R - distC };
}

function rayBoard(x: number, z: number, ax: number, az: number, maxDist: number): BoardHit | null {
  if (resolveRink(x, z, 0.02).hit) {
    const w = nearestBoards(x, z);
    return { x: w.x, z: w.z, nx: w.nx, nz: w.nz, dist: 0 };
  }
  const len = Math.hypot(ax, az) || 1;
  const ux = ax / len;
  const uz = az / len;
  const step = 0.28;
  for (let t = step; t <= maxDist; t += step) {
    if (!resolveRink(x + ux * t, z + uz * t, 0.02).hit) continue;
    let lo = t - step;
    let hi = t;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) * 0.5;
      if (resolveRink(x + ux * mid, z + uz * mid, 0.02).hit) hi = mid;
      else lo = mid;
    }
    const w = nearestBoards(x + ux * hi, z + uz * hi);
    return { x: w.x, z: w.z, nx: w.nx, nz: w.nz, dist: hi };
  }
  return null;
}

function rideDir(nx: number, nz: number, ax: number, az: number, attack: number): 1 | -1 {
  const t1x = -nz;
  const t1z = nx;
  const d1 = ax * t1x + az * t1z;
  if (Math.abs(d1) > 0.1) return d1 >= 0 ? 1 : -1;
  const up1 = t1x * attack;
  if (Math.abs(up1) > 0.2) return up1 > 0 ? 1 : -1;
  if (Math.abs(t1z) > 0.5) return (az >= 0 ? t1z : -t1z) >= 0 ? 1 : -1;
  return 1;
}

function alongWallSide(from: { x: number; z: number }, ax: number, az: number): 1 | -1 | null {
  if (Math.abs(from.z) < RINK_W / 2 - 2.8) return null;
  if (Math.abs(ax) < 0.55) return null;
  const sideZ = (from.z >= 0 ? 1 : -1) as 1 | -1;
  if (az * sideZ < -0.28) return null;
  return sideZ;
}

function intoBoard(ax: number, az: number, nx: number, nz: number): boolean {
  return ax * nx + az * nz >= 0.34;
}

function aimIsBoard(from: { x: number; z: number }, ax: number, az: number, hit: BoardHit): boolean {
  const approach = ax * hit.nx + az * hit.nz;
  if (approach < 0.05) return false;
  const sideWall = Math.abs(hit.nz) > 0.82 && Math.abs(hit.nx) < 0.35;
  if (sideWall) {
    if (approach > 0.18) return true;
    const wallZ = Math.sign(hit.nz) * (RINK_W / 2);
    return Math.abs(from.z - wallZ) < 3.2 && approach > 0.06;
  }
  const nearEnd = RINK_L / 2 - Math.abs(from.x) < 12 || hit.dist < 10;
  const flatEnd = Math.abs(hit.nx) > 0.92;
  if (flatEnd && approach > 0.72 && Math.abs(from.z) < 3.4 && !nearEnd) return false;
  if (nearEnd && approach > 0.1) return true;
  return !flatEnd && approach > 0.22;
}

function bankTarget(hit: BoardHit, ax: number, az: number, from: Skater): Skater | null {
  const refl = reflectBoard(ax, az, hit.nx, hit.nz);
  const rl = Math.hypot(refl.vx, refl.vz) || 1;
  const rx = refl.vx / rl;
  const rz = refl.vz / rl;
  if (rx * hit.nx + rz * hit.nz > -0.05) return null;
  let best: Skater | null = null;
  let bestPerp = 2.05;
  for (const mate of teammatesOf(from)) {
    const tx = mate.x + mate.vx * 0.24;
    const tz = mate.z + mate.vz * 0.24;
    const dx = tx - hit.x;
    const dz = tz - hit.z;
    const along = dx * rx + dz * rz;
    if (along < 2.2 || along > 34) continue;
    const perp = Math.hypot(dx - rx * along, dz - rz * along);
    if (perp < bestPerp) {
      bestPerp = perp;
      best = mate;
    }
  }
  return best;
}

function passCrossesCage(x: number, z: number, vx: number, vz: number): boolean {
  const sp = Math.hypot(vx, vz) || 1;
  for (let i = 1; i <= 16; i++) {
    const u = (i / 16) * 8;
    const px = x + (vx / sp) * u;
    const pz = z + (vz / sp) * u;
    if (inCageVolume(px, pz, PUCK_Y, 1) || inCageVolume(px, pz, PUCK_Y, -1)) return true;
  }
  return false;
}

const BOARD_RIDE_INSET = 0.16;

function placeOnWall(dir: 1 | -1, speed: number): void {
  const puck = world.puck;
  const w = nearestBoards(puck.x, puck.z);
  puck.x = w.x - w.nx * BOARD_RIDE_INSET;
  puck.z = w.z - w.nz * BOARD_RIDE_INSET;
  puck.y = PUCK_Y;
  puck.vy = 0;
  const tx = dir > 0 ? -w.nz : w.nz;
  const tz = dir > 0 ? w.nx : -w.nx;
  const m = Math.hypot(tx, tz) || 1;
  puck.vx = (tx / m) * speed;
  puck.vz = (tz / m) * speed;
}

function launchBank(s: Skater, ax: number, az: number, hit: BoardHit, mate: Skater, saucer = false): void {
  const refl = reflectBoard(ax, az, hit.nx, hit.nz);
  const rl = Math.hypot(refl.vx, refl.vz) || 1;
  const rx = refl.vx / rl;
  const rz = refl.vz / rl;
  const lead = 0.22 + Math.min(0.35, Math.hypot(mate.x - hit.x, mate.z - hit.z) * 0.02);
  const dx = mate.x + mate.vx * lead - hit.x;
  const dz = mate.z + mate.vz * lead - hit.z;
  const toL = Math.hypot(dx, dz) || 1;
  let ox = rx * 0.5 + (dx / toL) * 0.5;
  let oz = rz * 0.5 + (dz / toL) * 0.5;
  const ol = Math.hypot(ox, oz) || 1;
  ox /= ol;
  oz /= ol;
  const L2 = Math.max(1.5, dx * ox + dz * oz);
  const outSpeed = Math.max(14, 11 + 0.35 * L2);
  let ovx = ox * outSpeed;
  let ovz = oz * outSpeed;
  const into = ovx * hit.nx + ovz * hit.nz;
  if (into > -0.35) {
    ovx -= hit.nx * (into + 1.1);
    ovz -= hit.nz * (into + 1.1);
  }
  const inSpeed = Math.min(27, Math.max(17.5, 15 + hit.dist * 0.35));
  const from = passOrigin(s);
  let vy = saucer ? 2.2 : 0.03;
  if (saucer) vy = bankContactVy(from.x, from.z, ax * inSpeed, az * inSpeed, vy);
  launchPuck(s, ax * inSpeed, az * inSpeed, vy);
  boardBank = { hx: hit.x, hz: hit.z, vx: ovx, vz: ovz, until: world.time + 1.8, loft: saucer };
  world.lastPassTo = mate.id;
  world.oneTimerUntil = world.time + 2.2;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
}

function launchBoardRim(s: Skater, ax: number, az: number, nx: number, nz: number, dir: 1 | -1): void {
  const from = passOrigin(s);
  const speed = 19.5;
  let vx = ax + nx * 0.28;
  let vz = az + nz * 0.28;
  let n = Math.hypot(vx, vz) || 1;
  vx = (vx / n) * speed;
  vz = (vz / n) * speed;
  if (passCrossesCage(from.x, from.z, vx, vz)) {
    const sideZ = Math.abs(nz) > 0.4 ? Math.sign(nz) : Math.sign(from.z || az || 1);
    vx = ax * speed;
    vz = sideZ * speed * 0.85;
    n = Math.hypot(vx, vz) || 1;
    vx = (vx / n) * speed;
    vz = (vz / n) * speed;
  }
  launchPuck(s, vx, vz, 0.02);
  boardRide = { dir, speed, until: world.time + 5.2, phase: "seek" };
  world.lastPassTo = null;
  world.oneTimerUntil = world.time + 2.2;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
}

function launchBoardCarom(s: Skater, ax: number, az: number, hit: BoardHit): void {
  const from = passOrigin(s);
  const inSpeed = Math.min(27, Math.max(17.5, 15 + hit.dist * 0.35));
  const vx = ax * inSpeed;
  const vz = az * inSpeed;
  launchPuck(s, vx, vz, bankContactVy(from.x, from.z, vx, vz, 0.03));
  world.lastPassTo = null;
  world.oneTimerUntil = world.time + 2.2;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
}

function launchSaucerBoard(s: Skater, ax: number, az: number, hit: BoardHit): void {
  const from = passOrigin(s);
  const travel = Math.max(1, hit.dist);
  const eta = Math.max(0.44, Math.min(0.66, travel / 24));
  const power = Math.min(28, Math.max(15.5, travel / eta));
  const vx = ax * power;
  const vz = az * power;
  launchPuck(s, vx, vz, bankContactVy(from.x, from.z, vx, vz, 2.2));
  world.lastPassTo = null;
  world.oneTimerUntil = world.time + 2.2;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
}

function userBoardPass(s: Skater, ax: number, az: number, saucer = false): boolean {
  const from = passOrigin(s);
  const hit = rayBoard(from.x, from.z, ax, az, 46);
  const mate = bestPassTarget(s, ax, az, true);
  if (mate) {
    const d = Math.hypot(mate.x - from.x, mate.z - from.z);
    if (!(hit && hit.dist < d - 0.45)) return false;
  }
  const along = alongWallSide(from, ax, az);
  const atWall = !!hit && aimIsBoard(from, ax, az, hit);
  const attack = attackDir(s.side);
  const intoNear = !!hit && hit.dist < 9 && ax * hit.nx + az * hit.nz > 0.42;
  if (saucer) {
    if (!hit || (!atWall && !along)) return false;
    const bankMate = bankTarget(hit, ax, az, s);
    if (bankMate && (atWall || hit.dist < 14)) {
      launchBank(s, ax, az, hit, bankMate, true);
      return true;
    }
    launchSaucerBoard(s, ax, az, hit);
    return true;
  }
  if (along && !intoNear && !intoBoard(ax, az, 0, along)) {
    if (atWall && hit && hit.dist < 14) {
      const bankMate = bankTarget(hit, ax, az, s);
      if (bankMate) {
        launchBank(s, ax, az, hit, bankMate);
        return true;
      }
    }
    launchBoardRim(s, ax, az, 0, along, rideDir(0, along, ax, az, attack));
    return true;
  }
  if (!atWall || !hit) return false;
  const bankMate = bankTarget(hit, ax, az, s);
  if (bankMate) {
    launchBank(s, ax, az, hit, bankMate);
    return true;
  }
  if (!intoBoard(ax, az, hit.nx, hit.nz)) {
    launchBoardRim(s, ax, az, hit.nx, hit.nz, rideDir(hit.nx, hit.nz, ax, az, attack));
    return true;
  }
  launchBoardCarom(s, ax, az, hit);
  return true;
}

function stepBoardGlide(dt: number): void {
  const ride = boardRide;
  if (!ride) return;
  if (world.time > ride.until || world.stoppage || world.puck.owner !== null) {
    boardRide = null;
    return;
  }
  ride.speed *= Math.exp(-0.18 * dt);
  if (ride.speed < 3.4) {
    boardRide = null;
    return;
  }
  const puck = world.puck;
  const w0 = nearestBoards(puck.x, puck.z);
  const tx = ride.dir > 0 ? -w0.nz : w0.nz;
  const tz = ride.dir > 0 ? w0.nx : -w0.nx;
  const m = Math.hypot(tx, tz) || 1;
  puck.x += (tx / m) * ride.speed * dt;
  puck.z += (tz / m) * ride.speed * dt;
  placeOnWall(ride.dir, ride.speed);
}

function settleBoardPass(): void {
  const puck = world.puck;
  if (boardBank && world.time > boardBank.until) boardBank = null;
  if (boardRide && world.time > boardRide.until) boardRide = null;
  const w = nearestBoards(puck.x, puck.z);
  const pressed = w.dist < 0.28;
  if (pressed && puck.y > wallTop(w.nx, w.nz, w.x, w.z)) {
    boardBank = null;
    if (boardRide?.phase === "seek") boardRide = null;
    return;
  }
  if (boardBank && pressed && Math.hypot(puck.x - boardBank.hx, puck.z - boardBank.hz) < 3.4) {
    puck.x = w.x - w.nx * 0.2;
    puck.z = w.z - w.nz * 0.2;
    if (!(boardBank.loft && puck.y > PUCK_Y + 0.03)) {
      puck.y = PUCK_Y;
      puck.vy = 0;
    }
    let vx = boardBank.vx;
    let vz = boardBank.vz;
    const into = vx * w.nx + vz * w.nz;
    if (into > -0.35) {
      vx -= w.nx * (into + 1.1);
      vz -= w.nz * (into + 1.1);
    }
    puck.vx = vx;
    puck.vz = vz;
    boardBank = null;
    boardRide = null;
    return;
  }
  if (boardRide?.phase === "seek" && pressed) {
    const sp = Math.hypot(puck.vx, puck.vz);
    boardRide.speed = Math.max(12, Math.min(boardRide.speed, Math.max(sp, 12)));
    boardRide.phase = "glide";
    placeOnWall(boardRide.dir, boardRide.speed);
  }
}

function doPass(s: Skater, mx: number, my: number, saucer: boolean): void {
  if (s.kind === "goalie") {
    doGoalieOutlet(s, mx, my, saucer);
    return;
  }
  const { ax, az } = aimDir(s, mx, my);
  const aimed = Math.hypot(mx, my) > 0.22;
  if (s.id === world.userId && aimed && userBoardPass(s, ax, az, saucer)) {
    world.lastPass = world.time;
    world.lastPasser = s.id;
    world.lastPassX = s.x;
    world.lastPassZ = s.z;
    noteDrillUserPass(s);
    return;
  }
  const mate = bestPassTarget(s, ax, az, aimed);
  if (mate) {
    tapePass(s, mate, saucer);
  } else {
    const power = saucer ? 17.6 : 16.4;
    launchPuck(s, ax * power, az * power, saucer ? 3.4 : 0.06);
    world.lastPassTo = null;
  }
  world.lastPass = world.time;
  world.lastPasser = s.id;
  world.lastPassX = s.x;
  world.lastPassZ = s.z;
  noteDrillUserPass(s);
}

function armDrillShot(): void {
  if (useGame.getState().clockMode !== "drill") return;
  drillFromPass = false;
  drillPassSide = false;
  world.drillShot = true;
  drillPuckLive = true;
  if (!drillFlightStashed) drillRecastAt = world.time + 1;
  drillFlightStashed = false;
}

function passGoesBack(s: Skater): boolean {
  const { fx, fz } = heading(s.yaw);
  const sp = Math.hypot(world.puck.vx, world.puck.vz);
  if (sp < 0.5) return false;
  return (world.puck.vx * fx + world.puck.vz * fz) / sp <= 1e-4;
}

function noteDrillUserPass(s: Skater): void {
  if (useGame.getState().clockMode !== "drill") return;
  if (s.id !== world.userId) return;
  if (world.puck.owner !== null) return;
  drillPassSide = false;
  drillFromPass = true;
  world.drillShot = true;
  drillPuckLive = true;
  const netX = attackDir(s.side) * GOAL_LINE_X;
  const dist = Math.hypot(netX - world.puck.x, world.puck.z) || 1;
  const power = Math.hypot(world.puck.vx, world.puck.vz) || 1;
  drillRecastAt = world.time + Math.min(1, dist / power);
  drillFlightStashed = false;
  if (!passGoesBack(s)) return;
  spawnDrillGhost(world.puck, true);
  giveUserPuck();
}

function shotAim(act: Actions): { mx: number; my: number } {
  const rm = Math.hypot(act.aimX, act.aimY);
  if (rm > 0.16) return { mx: act.aimX, my: act.aimY };
  return { mx: act.moveX, my: act.moveY };
}

export function attackCompass(): "up" | "down" | "left" | "right" {
  return world.aimCompassLock ?? "up";
}

export function cycleAimCompass(): void {
  const order = ["up", "right", "down", "left"] as const;
  const cur = attackCompass();
  const i = order.indexOf(cur);
  world.aimCompassLock = order[(i + 1) % 4]!;
}

function aimZSign(side: "home" | "away"): 1 | -1 {
  return attackDir(side) >= 0 ? 1 : -1;
}

function stickToNetAim(mx: number, my: number, _side: "home" | "away"): { lat: number; hgt: number } {
  mx = Math.max(-1, Math.min(1, mx));
  my = Math.max(-1, Math.min(1, my));
  const c = attackCompass();
  let lat: number;
  let hgt: number;
  if (c === "up") {
    lat = mx;
    hgt = my;
  } else if (c === "down") {
    lat = -mx;
    hgt = -my;
  } else if (c === "left") {
    lat = my;
    hgt = -mx;
  } else {
    lat = -my;
    hgt = mx;
  }
  return {
    lat: Math.max(-1, Math.min(1, lat)),
    hgt: Math.max(-1, Math.min(1, hgt)),
  };
}

function mouthTopY(): number {
  return GOAL_H - CROSSBAR_R - PUCK_R - 0.02;
}

function shotHeight(hgt: number): { wantY: number; loft: number } {
  const yT = (Math.max(-1, Math.min(1, hgt)) + 1) * 0.5;
  const low = PUCK_Y + 0.02;
  const wantY = low + yT * (mouthTopY() - low);
  return { wantY, loft: yT < 0.08 ? 0 : 1 };
}

function arriveVy(wantY: number, flight: number, loft: number): number {
  if (loft < 0.04 || wantY <= PUCK_Y + 0.06) return 0;
  const dragK = 0.35;
  let travel = Math.max(0.08, flight);
  const kneel = dragK * flight;
  if (kneel > 0.02 && kneel < 0.9) travel = -Math.log(1 - kneel) / dragK;
  const vy = (wantY - PUCK_Y + 6 * travel * travel) / Math.max(0.08, travel + 0.02);
  return Math.max(0, Math.min(8.2, vy));
}

function cornerArriveVy(wantY: number, dist: number, power: number): number {
  const dragK = 0.35;
  const speed = Math.max(8, power);
  const flight = dist / speed;
  const kneel = dragK * flight;
  let travel = Math.max(0.05, flight);
  if (kneel > 0.02 && kneel < 0.92) travel = -Math.log(1 - Math.min(0.92, kneel)) / dragK;
  let vy = (wantY - PUCK_Y + 6 * travel * travel) / Math.max(0.05, travel);
  const start = PUCK_Y + Math.max(0, vy) * 0.02;
  vy = (wantY - start + 6 * travel * travel) / Math.max(0.05, travel);
  return Math.max(0, Math.min(14, vy));
}

const MPH = 2.23694;

function clampHorizMph(maxMph: number): void {
  const cap = maxMph / MPH;
  const sp = Math.hypot(world.puck.vx, world.puck.vz);
  if (sp <= cap) return;
  const m = cap / sp;
  world.puck.vx *= m;
  world.puck.vz *= m;
}

function behindOwnGoalLine(s: Skater): boolean {
  return s.x * defendDir(s.side) > GOAL_LINE_X;
}

function rimBoardSide(s: Skater, mx: number, my: number): 1 | -1 {
  const aim = stickToNetAim(mx, my, s.side);
  const lat = aim.lat * aimZSign(s.side);
  if (lat > 0.08) return 1;
  if (lat < -0.08) return -1;
  return s.z >= 0 ? 1 : -1;
}

function rayHitsCage(x: number, z: number, vx: number, vz: number, side: 1 | -1): boolean {
  const sp = Math.hypot(vx, vz) || 1;
  for (let i = 1; i <= 12; i++) {
    const u = (i / 12) * 2.8;
    const px = x + (vx / sp) * u;
    const pz = z + (vz / sp) * u;
    if (inCageVolume(px, pz, PUCK_Y, side)) return true;
  }
  return false;
}

function safeRimRelease(x: number, z: number, side: 1 | -1, sideZ: 1 | -1): { x: number; z: number } {
  const mouth = side * GOAL_LINE_X;
  const along = (x - mouth) * side;
  const hw = GOAL_W / 2;
  const depth = Math.max(0.25, cageDepthAt(Math.min(Math.abs(z), hw - 0.001), 0));
  if (Math.abs(z) >= hw + 0.2) return { x, z };
  if (along >= depth + 0.28) return { x, z };
  return { x: mouth + side * Math.max(depth + 0.18, 0.4), z: sideZ * (hw + 0.48) };
}

function launchRim(s: Skater, mx: number, my: number, power: number): void {
  const attack = (attackDir(s.side) >= 0 ? 1 : -1) as 1 | -1;
  const def = (defendDir(s.side) >= 0 ? 1 : -1) as 1 | -1;
  const sideZ = rimBoardSide(s, mx, my);
  const from = stickBlade(s);
  const rel = safeRimRelease(from.x, from.z, def, sideZ);
  const speed = Math.min(Math.max(8, power), 101 / MPH);
  let vx = attack * speed * 0.22 + def * speed * 0.06;
  let vz = sideZ * speed * 0.96;
  if (rayHitsCage(rel.x, rel.z, vx, vz, def)) {
    vx = def * speed * 0.22;
    vz = sideZ * speed * 0.98;
  }
  const n = Math.hypot(vx, vz) || 1;
  launchPuck(s, (vx / n) * speed, (vz / n) * speed, 0.02);
  world.puck.x = rel.x;
  world.puck.z = rel.z;
  world.puck.y = PUCK_Y;
  clampHorizMph(101);
  world.lastShotCorner = false;
  world.lastShotCornerSide = 0;
  rimRide = { sideZ, attack, until: world.time + 1.6 };
}

function stepRimRide(): void {
  const r = rimRide;
  if (!r) return;
  if (world.time > r.until || world.puck.owner !== null || world.stoppage || world.whistle) {
    rimRide = null;
    return;
  }
  const puck = world.puck;
  if (puck.z * r.sideZ < GOAL_W / 2 + 0.55) return;
  const def = (r.attack > 0 ? -1 : 1) as 1 | -1;
  if (rayHitsCage(puck.x, puck.z, r.attack, 0, def)) return;
  const sp = Math.hypot(puck.vx, puck.vz);
  if (sp < 1) {
    rimRide = null;
    return;
  }
  const up = r.attack * 0.96;
  const into = r.sideZ * 0.28;
  const n = Math.hypot(up, into);
  puck.vx = (up / n) * sp;
  puck.vz = (into / n) * sp;
  rimRide = null;
}

function shotAtThisNet(side: 1 | -1): boolean {
  if (world.lastPass > world.lastShoot) return false;
  if (world.time - world.lastShoot > 3.2) return false;
  const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : null;
  if (!shooter) return false;
  return attackDir(shooter.side) === side;
}

function goalieCoversMouth(g: Skater, y: number, z: number): boolean {
  if (goalieFar(g)) return false;
  if (y >= GOAL_H - 0.03) return false;
  if (Math.abs(z) > GOAL_W / 2 - 0.02) return false;
  if (equipmentCovers(g, y, z) || equipmentHits(g, g.x, y, z)) return true;
  return Math.abs(z - g.z) <= 0.8 && y < 1.05;
}

function carrierIntoOwnMouth(s: Skater): 1 | -1 | 0 {
  if (s.kind === "goalie") return 0;
  const side = (defendDir(s.side) >= 0 ? 1 : -1) as 1 | -1;
  const mouth = side * GOAL_LINE_X;
  if (s.vx * side < 0.45) return 0;
  const along = (s.x - mouth) * side;
  if (along < -0.28 || along > 0.35) return 0;
  if (Math.abs(s.z) > GOAL_W / 2 - 0.06) return 0;
  return side;
}

function keepOwnCageSolid(s: Skater): void {
  const side = (defendDir(s.side) >= 0 ? 1 : -1) as 1 | -1;
  if (s.x * side <= GOAL_LINE_X + 0.02) return;
  const puck = world.puck;
  const mouth = side * GOAL_LINE_X;
  const along = (puck.x - mouth) * side;
  const hw = GOAL_W / 2;
  if (Math.abs(puck.z) > hw + 0.25) return;
  const depth = Math.max(0.2, cageDepthAt(Math.min(Math.abs(puck.z), hw - 0.001), 0));
  if (along >= depth + 0.02) return;
  const sideZ = (Math.sign(s.z) || Math.sign(puck.z) || 1) as 1 | -1;
  puck.x = mouth + side * (depth + 0.2);
  puck.z = sideZ * Math.max(hw + 0.36, Math.abs(puck.z));
}

function drillIronTarget(
  _tZ: number,
  _wantY: number,
): { tZ: number; wantY: number; kind: "post" | "bar" } | null {
  return null;
}

function launchShotAtNet(
  s: Skater,
  mx: number,
  my: number,
  power: number,
  sprayAmt: number,
  bodyAim = false,
  lock?: { tZ: number; wantY: number },
): number {
  const attack = attackDir(s.side);
  const netX = attack * GOAL_LINE_X;
  const zSign = aimZSign(s.side);
  let stickX = Math.max(-1, Math.min(1, mx));
  let stickY = Math.max(-1, Math.min(1, my));
  const stickMag = Math.hypot(stickX, stickY);
  if (stickMag < 1e-6) {
    stickX = 0;
    stickY = 0;
  } else {
    const stickScale = 1 / Math.max(Math.abs(stickX / stickMag), Math.abs(stickY / stickMag));
    stickX *= stickScale;
    stickY *= stickScale;
  }
  const half = GOAL_W / 2;
  let drillCorner = false;
  const g = world.skaters.find((p) => p.kind === "goalie" && p.side !== s.side);
  let tZ: number;
  let wantY: number;
  if (lock) {
    tZ = lock.tZ;
    wantY = lock.wantY;
    sprayAmt = Math.min(sprayAmt, 0.012);
  } else if (bodyAim && g) {
    tZ = Math.max(-half + 0.2, Math.min(half - 0.2, g.z));
    wantY = 0.34 + Math.min(0.16, g.coverPose * 0.12);
    sprayAmt = Math.min(sprayAmt, 0.008);
  } else {
    const aim = stickToNetAim(stickX, stickY, s.side);
    tZ = Math.max(-1, Math.min(1, aim.lat)) * (half - 0.16) * zSign;
    wantY = shotHeight(aim.hgt).wantY;
  }
  const from = stickBlade(s);
  const fromLine = GOAL_LINE_X - from.x * attack;
  const lowCorner = fromLine < 3.6 && fromLine > -0.28 && Math.abs(from.z) > 4.6;
  const drillAim = useGame.getState().clockMode === "drill";
  world.lastShotCorner = lowCorner;
  world.lastShotCornerSide = lowCorner ? Math.sign(from.z || 1) : 0;
  shotIron = null;
  if (lowCorner && !lock && !bodyAim) {
    tZ = -Math.sign(from.z || 1) * (half - 0.05);
    wantY = shotHeight(stickToNetAim(stickX, stickY, s.side).hgt).wantY;
    if (!drillAim && wantY < GOAL_H * 0.38 && Math.random() < 0.4) wantY = GOAL_H * 0.78;
    sprayAmt = Math.min(sprayAmt, 0.007);
  }
  tZ = Math.max(-half + (lowCorner ? 0.04 : 0.12), Math.min(half - (lowCorner ? 0.04 : 0.12), tZ));
  wantY = Math.max(PUCK_Y, Math.min(mouthTopY(), wantY));
  if (!bodyAim && !lowCorner && !lock) {
    const aim = stickToNetAim(stickX, stickY, s.side);
    const spot = drill16CornerSpot(aim.lat, aim.hgt, zSign);
    if (spot) {
      tZ = spot.tZ;
      wantY = spot.wantY;
      drillCorner = true;
    }
  }
  let ironKind: "post" | "bar" | null = null;
  if (!bodyAim && !lock && !lowCorner && !drillCorner) {
    const iron = drillIronTarget(tZ, wantY);
    if (iron) {
      tZ = iron.tZ;
      wantY = iron.wantY;
      ironKind = iron.kind;
    }
  }
  const dx = netX - from.x;
  const dz = tZ - from.z;
  const dist = Math.hypot(dx, dz) || 1;
  const ax = dx / dist;
  const az = dz / dist;
  if (drillAim) sprayAmt = 0;
  else if (!lowCorner) sprayAmt = Math.min(1.5, sprayAmt + 0.045 * dist);
  const spray = ironKind || drillAim ? 0 : (Math.random() - 0.5) * sprayAmt;
  const flight = Math.max(0.14, dist / Math.max(8, power));
  if (drillAim) {
    drillRecastAt = world.time + Math.min(1, flight);
    drillFlightStashed = true;
  }
  const loft =
    wantY > mouthTopY()
      ? 1
      : lock
        ? wantY > PUCK_Y + 0.08
          ? 1
          : 0
        : shotHeight(stickToNetAim(stickX, stickY, s.side).hgt).loft;
  let vy = drillCorner || ironKind === "bar" ? cornerArriveVy(wantY, dist, power) : arriveVy(wantY, flight, loft);
  if (!drillCorner && ironKind === null && wantY > mouthTopY()) {
    const dragK = 0.35;
    let travel = Math.max(0.14, dist / Math.max(8, power));
    const kneel = dragK * travel;
    if (kneel > 0.02 && kneel < 0.9) travel = -Math.log(1 - kneel) / dragK;
    const need = (wantY - PUCK_Y + 6 * travel * travel) / Math.max(0.08, travel + 0.02);
    vy = Math.max(vy, Math.min(16, need));
  }
  launchPuck(s, ax * power - az * spray, az * power + ax * spray, vy);
  if (ironKind) shotIron = { kind: ironKind, z: tZ, y: wantY };
  clampHorizMph(101);
  if (world.time - world.goalieSaveT > 1.35 || dist > 12) {
    world.reboundN = 0;
    world.reboundSoft = false;
  }
  return dist;
}

function beginShotSpeedTrack(): void {
  const puck = world.puck;
  const mph = Math.hypot(puck.vx, puck.vz) * 2.23694;
  world.shotSpeedLive = true;
  world.shotSpeedMax = mph;
  useGame.getState().setSpeed(mph);
}

function tickShotSpeed(): void {
  if (!world.shotSpeedLive) return;
  const puck = world.puck;
  if (puck.owner !== null || world.stoppage) {
    world.shotSpeedLive = false;
    return;
  }
  const mph = Math.hypot(puck.vx, puck.vz) * 2.23694;
  if (mph > world.shotSpeedMax) {
    world.shotSpeedMax = mph;
    useGame.getState().setSpeed(mph);
  }
  if (mph < 1.8) world.shotSpeedLive = false;
}

function oneTimerReceiver(): Skater | null {
  if (world.time - world.lastPass > 2.2) return null;
  const passer = world.lastPasser !== null ? world.skaters[world.lastPasser] : null;
  if (!passer || passer.side !== "home") return null;
  if (world.lastPassTo !== null) {
    const t = world.skaters[world.lastPassTo];
    if (t && t.side === "home" && t.kind !== "goalie" && t.id !== passer.id) return t;
  }
  let best: Skater | null = null;
  let bestD = 99;
  for (const s of world.skaters) {
    if (s.side !== "home" || s.kind === "goalie" || s.id === passer.id) continue;
    const d = Math.hypot(s.x - world.puck.x, s.z - world.puck.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function userPassInFlight(): boolean {
  if (world.lastShoot > world.lastPass) return false;
  if (world.time - world.lastPass > 2.2) return false;
  const passer = world.lastPasser !== null ? world.skaters[world.lastPasser] : null;
  if (!passer || passer.side !== "home") return false;
  if (world.puck.owner === null) return true;
  const holder = world.skaters[world.puck.owner];
  if (!holder || holder.side !== "home" || holder.kind === "goalie") return false;
  return world.lastPassTo === holder.id || world.oneTimerArmed;
}

function tryFireArmedOneTimer(): void {
  if (!world.oneTimerArmed) return;
  if (world.time - world.lastShoot < 0.08) return;
  const t = oneTimerReceiver();
  if (!t) {
    if (world.time - world.lastPass > 2.2) {
      world.oneTimerArmed = false;
      world.oneTimerSlap = false;
      world.oneTimerPass = false;
      world.oneTimerSaucer = false;
    }
    return;
  }
  if (world.puck.owner !== null && world.puck.owner !== t.id) {
    world.oneTimerArmed = false;
    world.oneTimerSlap = false;
    world.oneTimerPass = false;
    world.oneTimerSaucer = false;
    return;
  }
  if (world.puck.owner === t.id) {
    if (world.oneTimerPass) fireOneTimerPass(t);
    else fireOneTimer(t);
  }
}

function fireOneTimerPass(t: Skater): void {
  if (t.kind === "goalie") return;
  const mx = world.oneTimerMx;
  const my = world.oneTimerMy;
  const saucer = world.oneTimerSaucer;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  if (t.side === "home") world.userId = t.id;
  const blade = stickBlade(t);
  world.puck.owner = t.id;
  world.puck.x = blade.x;
  world.puck.z = blade.z;
  world.puck.y = PUCK_Y;
  world.puck.vx = t.vx;
  world.puck.vz = t.vz;
  world.puck.vy = 0;
  doPass(t, mx, my, saucer);
  t.follow = 0.4;
  t.windup = 0;
}

function fireOneTimer(t: Skater): void {
  if (t.kind === "goalie") return;
  if (world.time - world.lastShoot < 0.05) return;
  const spd = Math.hypot(t.vx, t.vz);
  const attack = attackDir(t.side);
  const netX = attack * GOAL_LINE_X;
  const px = world.lastPassX;
  const pz = world.lastPassZ;
  const angS = Math.atan2(-t.z, netX - t.x);
  const angP = Math.atan2(-pz, netX - px);
  let dAng = angS - angP;
  while (dAng > Math.PI) dAng -= Math.PI * 2;
  while (dAng < -Math.PI) dAng += Math.PI * 2;
  const danger = Math.min(1, Math.abs(dAng) / 0.85);
  const slap = world.oneTimerSlap;
  const holdT = slap ? Math.max(1, world.shotWindupT) : 0.2;
  const { power } = shotFromHold(holdT, spd);
  if (behindOwnGoalLine(t)) {
    launchRim(t, world.oneTimerMx, world.oneTimerMy, power);
    world.oneTimerArmed = false;
    world.oneTimerSlap = false;
    world.oneTimerPass = false;
    world.oneTimerSaucer = false;
    world.lastShoot = world.time;
    world.lastShotSlap = slap;
    world.lastShotOneTimer = true;
    world.lastShotRedirect = false;
    world.lastShooter = t.id;
    world.lastShotDist = 6;
    t.follow = slap ? 0.62 : 0.52;
    t.windup = 0;
    if (t.side === "home") world.userId = t.id;
    beginShotSpeedTrack();
    return;
  }
  const half = GOAL_W / 2 - 0.1;
  const g = world.skaters.find((p) => p.kind === "goalie" && p.side !== t.side);
  let stickX = Math.max(-1, Math.min(1, world.oneTimerMx));
  let stickY = Math.max(-1, Math.min(1, world.oneTimerMy));
  const stickMag = Math.hypot(stickX, stickY);
  if (stickMag < 1e-6) {
    stickX = 0;
    stickY = 0;
  } else {
    const stickScale = 1 / Math.max(Math.abs(stickX / stickMag), Math.abs(stickY / stickMag));
    stickX *= stickScale;
    stickY *= stickScale;
  }
  const aim = stickToNetAim(stickX, stickY, t.side);
  const corner = Math.max(-1, Math.min(1, aim.lat));
  const wantY = shotHeight(aim.hgt).wantY;
  const lat = t.z - pz;
  const far = (Math.abs(lat) > 0.35 ? Math.sign(lat) : Math.abs(dAng) > 0.08 ? Math.sign(dAng) : Math.sign(t.z || 1)) * half;
  const bodyZ = g ? Math.max(-half, Math.min(half, g.z)) : 0;
  let tZ = danger > 0.18 ? bodyZ + (far - bodyZ) * Math.min(1, 0.4 + danger * 0.7) : bodyZ;
  tZ = Math.max(-half, Math.min(half, tZ + corner * 0.28));
  world.lastOneTimerDanger = danger;
  const dist = launchShotAtNet(t, 0, 0, power, slap ? 0.018 : 0.016, false, { tZ, wantY });
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  world.lastShoot = world.time;
  world.lastShotSlap = slap;
  world.lastShotOneTimer = true;
  world.lastShotRedirect = false;
  world.lastShooter = t.id;
  world.lastShotDist = dist;
  t.follow = slap ? 0.62 : 0.52;
  t.windup = 0;
  if (t.side === "home") world.userId = t.id;
  beginShotSpeedTrack();
}

function shotFromHold(holdT: number, spd: number): { power: number; slap: boolean } {
  const t = Math.max(0, holdT);
  let mph: number;
  let slap = false;
  if (t < 0.28) mph = 69 + t * 14;
  else if (t < 0.5) mph = 76 + ((t - 0.28) / 0.22) * 6;
  else if (t < 1) {
    slap = true;
    mph = 86 + ((t - 0.5) / 0.5) * 14;
  } else {
    slap = true;
    mph = 101;
  }
  if (!slap) mph = Math.max(69, mph);
  mph = Math.min(101, mph + Math.min(1.6, spd * 0.08));
  if (!slap) mph = Math.max(69, mph);
  return { power: mph / MPH, slap };
}

function doShot(s: Skater, mx: number, my: number, slap: boolean, holdT?: number): void {
  drillFlightStashed = false;
  if (useGame.getState().clockMode === "drill" && world.drillWon) {
    if (!drillUserEncore(s)) return;
    const held = holdT ?? (slap ? 1.05 : 0.1);
    const { power } = shotFromHold(held, Math.hypot(s.vx, s.vz));
    const shelf = drillTopShelfPin();
    launchShotAtNet(s, 0, 1, Math.max(power, 28), 0, false, { tZ: 0, wantY: shelf.y });
    world.lastShoot = world.time;
    world.lastShotSlap = false;
    world.lastShotOneTimer = false;
    world.lastShotRedirect = false;
    world.lastShooter = s.id;
    world.oneTimerArmed = false;
    world.oneTimerSlap = false;
    world.oneTimerPass = false;
    world.oneTimerSaucer = false;
    world.shotWindupT = 0;
    drillEncoreLive = true;
    drillEncoreAt = world.time;
    drillEncoreShots = 1;
    s.windup = 0;
    s.follow = 0.2;
    beginShotSpeedTrack();
    return;
  }
  if (s.kind === "goalie") {
    if (world.coverT < GOALIE_HOLD) return;
    goalieLengthPlay(s, farPlayFromStick(mx, my, slap));
    world.shotWindupT = 0;
    if (useGame.getState().clockMode === "drill") armDrillShot();
    s.windup = 0;
    s.follow = 0.2;
    return;
  }
  const held = holdT ?? (slap ? 1.05 : 0.1);
  const { power, slap: isSlap } = shotFromHold(held, Math.hypot(s.vx, s.vz));
  if (behindOwnGoalLine(s)) {
    launchRim(s, mx, my, power);
    world.lastShoot = world.time;
    world.lastShotSlap = isSlap;
    world.lastShotOneTimer = false;
    world.lastShotRedirect = false;
    world.lastShooter = s.id;
    world.lastShotDist = 6;
    world.oneTimerArmed = false;
    world.oneTimerSlap = false;
    world.oneTimerPass = false;
    world.oneTimerSaucer = false;
    world.shotWindupT = 0;
    if (useGame.getState().clockMode === "drill") armDrillShot();
    s.windup = 0;
    s.follow = isSlap ? 0.62 : 0.2;
    beginShotSpeedTrack();
    return;
  }
  const oneTimer = world.lastPassTo === s.id && world.time <= world.oneTimerUntil;
  let sprayAmt = isSlap ? 0.016 : oneTimer ? 0.012 : 0.01;
  if (useGame.getState().clockMode === "drill") sprayAmt = 0;
  const dist = launchShotAtNet(s, mx, my, power, sprayAmt);
  world.lastShoot = world.time;
  world.lastShotSlap = isSlap;
  world.lastShotOneTimer = oneTimer;
  world.lastShotRedirect = false;
  world.lastShooter = s.id;
  world.lastShotDist = dist;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  world.shotWindupT = 0;
  if (useGame.getState().clockMode === "drill") armDrillShot();
  if (isSlap || oneTimer) s.follow = isSlap ? 0.62 : 0.5;
  else s.windup = 0;
  beginShotSpeedTrack();
}

function shootAtNet(s: Skater): void {
  if (world.drillWon) return;
  const attack = attackDir(s.side);
  const netX = attack * GOAL_LINE_X;
  const g = world.skaters.find((p) => p.kind === "goalie" && p.side !== s.side);
  const juice = s.side === "away" && whiffHot();
  const openZ = g ? -Math.sign(g.z || 1) * (juice ? 0.78 : 0.55) : (Math.random() - 0.5) * 1.35;
  const dx = netX - s.x;
  const dz = openZ - s.z;
  const dist = Math.hypot(dx, dz) || 1;
  const spd = Math.hypot(s.vx, s.vz);
  const power = 17 + spd * 0.7 + Math.min(9, dist * 0.35) + (juice ? 5.2 : 0);
  launchPuck(s, (dx / dist) * power, (dz / dist) * power, 0.18);
  if (world.time - world.goalieSaveT > 1.35 || dist > 12) {
    world.reboundN = 0;
    world.reboundSoft = false;
  }
  world.lastShoot = world.time;
  world.lastShotSlap = false;
  world.lastShotOneTimer = false;
  world.lastShotRedirect = false;
  world.lastShooter = s.id;
  world.lastShotDist = dist;
  beginShotSpeedTrack();
}

function aiPass(s: Skater, mate: Skater): void {
  tapePass(s, mate, false);
  world.lastPass = world.time;
  world.lastPasser = s.id;
  world.lastPassX = s.x;
  world.lastPassZ = s.z;
}

function winFaceoff(winner: Skater, passAim?: { mx: number; my: number }): void {
  world.faceoff = false;
  world.faceoffPhase = "live";
  markPuckDrop();
  const blade = stickBlade(winner);
  world.puck.owner = winner.id;
  world.puck.x = blade.x;
  world.puck.z = blade.z;
  world.puck.y = PUCK_Y;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.ref.pose = "idle";
  world.ref.poseT = 0;
  world.ref2.pose = "idle";
  world.ref2.poseT = 0;
  world.lastPass = world.time;
  world.lastShoot = world.time;
  if (winner.side === "home") world.userId = winner.id;
  if (passAim && Math.hypot(passAim.mx, passAim.my) > 0.22) {
    doPass(winner, passAim.mx, passAim.my, false);
  }
  world.puckOz = puckOzSide(world.puck);
}

function recallHomeGoalie(): void {
  const g = world.skaters.find((s) => s.side === "home" && s.kind === "goalie");
  if (!g) return;
  g.trackZ = g.z;
  g.trackVz = g.vz * 0.45;
  g.vx *= 0.72;
  g.vz *= 0.72;
  world.goalieRecallT = 1.85;
}

function nearestHomeSkater(exceptId: number): Skater | null {
  const puck = world.puck;
  let best: Skater | null = null;
  let bestD = Infinity;
  for (const s of world.skaters) {
    if (s.side !== "home" || s.kind === "goalie" || s.id === exceptId) continue;
    const d = Math.hypot(s.x - puck.x, s.z - puck.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function changePlayer(): void {
  const user = world.skaters[world.userId];
  if (!user) return;
  const mates = world.skaters.filter(
    (s) => s.side === user.side && s.id !== user.id && s.kind !== "goalie",
  );
  if (!mates.length) return;
  if (user.kind === "goalie") {
    const next = nearestHomeSkater(user.id);
    if (next) world.userId = next.id;
    world.ltReturnId = null;
    recallHomeGoalie();
    return;
  }
  const puck = world.puck;
  if (puck.owner === null && world.lastPassTo !== null && world.time - world.lastPass < 1.6) {
    const t = world.skaters[world.lastPassTo];
    if (t && t.side === user.side && t.kind !== "goalie" && t.id !== user.id) {
      world.userId = t.id;
      return;
    }
  }
  if (puck.owner !== null) {
    const holder = world.skaters[puck.owner];
    if (holder && holder.side === user.side && holder.id !== user.id && holder.kind !== "goalie") {
      world.userId = holder.id;
      return;
    }
    if (holder && holder.side !== user.side && holder.kind !== "goalie") {
      const ownNet = defendDir(user.side) * GOAL_LINE_X;
      const towardNetX = Math.sign(ownNet - holder.x) || defendDir(user.side);
      const hvx = holder.vx;
      const hvz = holder.vz;
      let best = mates[0]!;
      let bestScore = -Infinity;
      for (const s of mates) {
        const dPuck = Math.hypot(s.x - holder.x, s.z - holder.z);
        const along = (s.x - holder.x) * towardNetX;
        const ix = holder.x + towardNetX * 2.4 + hvx * 0.28;
        const iz = holder.z + hvz * 0.22;
        const dCut = Math.hypot(s.x - ix, s.z - iz);
        const lat = Math.abs(s.z - holder.z);
        const trailing = along < -0.35;
        const inLane = along > 0.25 && along < 14;
        let score = -dCut * 1.2 + Math.max(0, along) * 3.6;
        if (inLane) score += 9.5;
        if (trailing) score -= 16;
        if (lat < 2.6 && along > 0) score += 3.4;
        if (s.kind === "defense") score += 1.4;
        score -= Math.max(0, dPuck - 7.5) * 0.4;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
      world.userId = best.id;
      return;
    }
  }
  let best = mates[0]!;
  let bestD = Infinity;
  for (const s of mates) {
    const d = Math.hypot(s.x - puck.x, s.z - puck.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  world.userId = best.id;
}

function dropWingClaims(): void {
  world.wingL = null;
  world.wingR = null;
}

function wingLateral(user: Skater, s: Skater): number {
  const { fx, fz } = heading(user.yaw);
  return -(s.x - user.x) * fz + (s.z - user.z) * fx;
}

function wingClaimOk(id: number | null, user: Skater): boolean {
  if (id === null || id === user.id || id === world.userId) return false;
  const s = world.skaters[id];
  if (!s || s.side !== "home" || s.kind === "goalie") return false;
  if (world.puck.owner === s.id) return false;
  return true;
}

function nearestWing(
  user: Skater,
  side: -1 | 1,
  skipA: number | null,
  skipB: number | null,
): { id: number; d: number } | null {
  let best: { id: number; d: number } | null = null;
  for (const s of world.skaters) {
    if (s.side !== "home" || s.kind === "goalie" || s.id === user.id || s.id === world.userId) continue;
    if (s.id === skipA || s.id === skipB) continue;
    if (world.puck.owner === s.id) continue;
    const lat = wingLateral(user, s);
    if (side < 0 ? lat > -0.45 : lat < 0.45) continue;
    const d = Math.hypot(s.x - user.x, s.z - user.z);
    if (!best || d < best.d) best = { id: s.id, d };
  }
  return best;
}

function pickWing(user: Skater, side: -1 | 1, skip: number | null, held: number | null): number | null {
  if (held !== null && wingClaimOk(held, user) && held !== skip) {
    const cur = world.skaters[held]!;
    const lat = wingLateral(user, cur);
    const wrong = side < 0 ? lat > 1.2 : lat < -1.2;
    if (!wrong) {
      const dCur = Math.hypot(cur.x - user.x, cur.z - user.z);
      const alt = nearestWing(user, side, held, skip);
      if (!alt || alt.d > dCur - 2.4) return held;
      return alt.id;
    }
  }
  return nearestWing(user, side, skip, null)?.id ?? null;
}

function applyWingClaims(user: Skater, act: Actions, wings: boolean): void {
  if (!wings || user.side !== "home") {
    dropWingClaims();
    return;
  }
  world.wingL = act.ltDown ? pickWing(user, -1, null, world.wingL) : null;
  world.wingR = act.rtDown ? pickWing(user, 1, world.wingL, world.wingR) : null;
}

function holdGoalie(down: boolean): void {
  const user = world.skaters[world.userId];
  if (!user || user.side !== "home") return;
  const g = world.skaters.find((s) => s.side === "home" && s.kind === "goalie");
  if (!g) return;
  if (down) {
    const owner = world.puck.owner;
    if (owner !== null) {
      const holder = world.skaters[owner];
      if (holder && holder.side === "home" && holder.kind !== "goalie") return;
    }
    if (user.kind !== "goalie") {
      world.ltReturnId = user.id;
      world.userId = g.id;
    }
    world.goalieRecallT = 0;
    return;
  }
  if (user.kind === "goalie") {
    const back = world.ltReturnId !== null ? world.skaters[world.ltReturnId] : null;
    if (back && back.side === "home" && back.kind !== "goalie") world.userId = back.id;
    else {
      const next = nearestHomeSkater(g.id);
      if (next) world.userId = next.id;
    }
    recallHomeGoalie();
  }
  world.ltReturnId = null;
}

function autoSwitchToHolder(): void {
  if (world.ltReturnId !== null) return;
  const puck = world.puck;
  if (puck.owner === null) return;
  const holder = world.skaters[puck.owner];
  if (!holder || holder.side !== "home") return;
  if (holder.kind === "goalie") return;
  const user = world.skaters[world.userId];
  if (user?.kind === "goalie") return;
  if (world.userId !== holder.id) world.userId = holder.id;
}

function cpuIdlePoke(foe: Skater, holder: Skater): void {
  const dx = holder.x - foe.x;
  const dz = holder.z - foe.z;
  const d = Math.hypot(dx, dz) || 1;
  foe.yaw = Math.atan2(-dx, -dz);
  foe.poke = 0.48;
  const lx = -dz / d;
  const lz = dx / d;
  const side = Math.sign(holder.z - foe.z) || (foe.id % 2 === 0 ? 1 : -1);
  launchPuck(holder, lx * side * 10.2 + (dx / d) * 1.2, lz * side * 10.2 + (dz / d) * 1.2, 0.38);
  holder.stun = 0.4;
  holder.struck = 0.28;
  world.lastPass = world.time;
  world.lastPassTo = null;
  world.lastPasser = null;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  stickLooseUntil = world.time + 0.3;
  stickLooseBy = foe.id;
  stickLooseFrom = holder.id;
  world.idlePokeT = 0;
}

function reboundShotReady(user: Skater): boolean {
  if (user.kind === "goalie" || user.dive > 0 || user.stun > 0.04 || user.struck > 0.12) return false;
  if (world.reboundN < 1) return false;
  if (world.time - world.goalieSaveT > 1.65) return false;
  const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
  if (!shooter || shooter.side !== "home") return false;
  const puck = world.puck;
  if (puck.owner !== null && puck.owner !== user.id) return false;
  const blade = stickBlade(user);
  const d = Math.min(
    Math.hypot(blade.x - puck.x, blade.z - puck.z),
    Math.hypot(user.x - puck.x, user.z - puck.z),
  );
  return d < 2.85 && puck.y < 1.65;
}

function tryReboundSnap(user: Skater, act: Actions): boolean {
  if (world.drillWon && !drillUserEncore(user)) return false;
  if (!(act.xTap || act.xEdge)) return false;
  if (world.oneTimerArmed || userPassInFlight()) return false;
  if (world.time - world.lastShoot < 0.08) return false;
  if (!reboundShotReady(user)) return false;
  const puck = world.puck;
  puck.owner = user.id;
  const blade = stickBlade(user);
  puck.x = blade.x;
  puck.z = blade.z;
  puck.y = PUCK_Y;
  puck.vx = user.vx;
  puck.vz = user.vz;
  puck.vy = 0;
  user.poke = 0;
  const aim = shotAim(act);
  doShot(user, aim.mx, aim.my, false);
  return true;
}

function refreshUserStickCommit(act: Actions): void {
  const user = world.skaters[world.userId];
  userStickCommit =
    !!user &&
    world.puck.owner === user.id &&
    ((!world.faceoffA && act.aDown) || (act.xDown && !world.windupCancel));
}

function userStickCommitHolds(id: number): boolean {
  return userStickCommit && id === world.userId;
}

function userJustReleasedPuck(): boolean {
  if (world.lastShooter === world.userId && world.lastShoot === world.time) return true;
  return (
    world.lastPasser === world.userId &&
    world.lastPass === world.time &&
    world.lastShoot < world.lastPass
  );
}

function pokeCheck(user: Skater): void {
  if (userPassInFlight() && (world.puck.owner === null || user.id === world.userId)) return;
  const puck = world.puck;
  if (puck.owner === user.id) return;
  const blade = stickBlade(user);
  const { fx, fz } = heading(user.yaw);
  if (puck.owner !== null) {
    const holder = world.skaters[puck.owner];
    if (!holder || holder.side === user.side) return;
    if (userStickCommitHolds(holder.id)) return;
    if (holder.deke > 0.06) return;
    const dBlade = Math.hypot(blade.x - puck.x, blade.z - puck.z);
    const dBody = Math.hypot(user.x - holder.x, user.z - holder.z);
    const ahead = (holder.x - user.x) * fx + (holder.z - user.z) * fz;
    if (holder.kind === "goalie") {
      const reach = holder.coverPose > 0.25 ? 2.55 : 2.2;
      if ((dBlade < reach || dBody < reach + 0.2) && ahead > -0.85) {
        noteAttackerTouch(user);
        const towardCenter = attackDir(holder.side);
        const lx = -fz;
        const lz = fx;
        const side = Math.sign((holder.x - user.x) * lx + (holder.z - user.z) * lz) || 1;
        launchPuck(
          holder,
          towardCenter * (9.5 + Math.random() * 4) + fx * 1.6 + lx * side * 3.2,
          fz * 2.4 + lz * side * 6.5 + (Math.random() - 0.5) * 4,
          0.32 + Math.random() * 0.28,
        );
        holder.stun = 0.26;
        holder.struck = 0.2;
        holder.coverPose = Math.max(0, holder.coverPose - 0.7);
        world.coverT = 0;
        world.lastPass = world.time;
        world.lastPasser = user.id;
        world.lastPassTo = null;
      }
      return;
    }
    const cpu = user.id !== world.userId;
    const dive = user.dive > 0.04;
    const reach = dive ? 3.15 : cpu ? 1.22 : 1.95;
    const bodyR = dive ? 3.35 : cpu ? 0 : 2.25;
    const aheadMin = cpu && !dive ? 0.22 : -0.85;
    if ((dBlade < reach || (bodyR > 0 && dBody < bodyR)) && ahead > aheadMin) {
      noteAttackerTouch(user);
      const lx = -fz;
      const lz = fx;
      const side = Math.sign((holder.x - user.x) * lx + (holder.z - user.z) * lz) || 1;
      if (cpu && !dive && Math.random() < 0.11) {
        puck.owner = user.id;
        puck.x = blade.x;
        puck.z = blade.z;
        puck.y = PUCK_Y;
        puck.vx = user.vx;
        puck.vz = user.vz;
        puck.vy = 0;
        holder.stun = 0.22;
        holder.struck = 0.14;
        stickLooseUntil = -1;
        stickLooseBy = -1;
        stickLooseFrom = -1;
        world.lastPassTo = null;
        world.lastPasser = null;
        world.oneTimerArmed = false;
        world.oneTimerSlap = false;
        world.oneTimerPass = false;
        world.oneTimerSaucer = false;
        return;
      }
      const pop = dive ? 12.5 : cpu ? 4.8 : 8.5;
      const fwd = dive ? 4.2 : cpu ? -2.2 : 2.8;
      launchPuck(holder, fx * fwd + lx * side * pop, fz * fwd + lz * side * pop, dive ? 0.7 : cpu ? 0.22 : 0.4);
      holder.stun = dive ? 0.62 : cpu ? 0.24 : 0.42;
      holder.struck = dive ? 0.48 : cpu ? 0.16 : 0.32;
      world.lastPass = world.time;
      if (cpu) {
        world.lastPassTo = null;
        world.lastPasser = null;
        world.oneTimerArmed = false;
        world.oneTimerSlap = false;
        world.oneTimerPass = false;
        world.oneTimerSaucer = false;
        stickLooseUntil = world.time + (dive ? 0.26 : 0.3);
        stickLooseBy = user.id;
        stickLooseFrom = holder.id;
      }
    }
    return;
  }
  if (user.dive > 0) return;
  if (user.id !== world.userId && userJustReleasedPuck()) return;
  const d = Math.hypot(blade.x - puck.x, blade.z - puck.z);
  if (d < 0.95 && puck.y < 0.4) {
    if (world.time < stickLooseUntil && (user.id !== world.userId || user.id === stickLooseFrom)) return;
    noteAttackerTouch(user);
    puck.owner = user.id;
    const livePass =
      world.lastPassTo === user.id &&
      world.time - world.lastPass < 2.2 &&
      world.lastShoot < world.lastPass;
    if (!livePass) maybeLoadedSlap(user);
  }
}

function rushCounts(side: "home" | "away"): { attackers: number; defenders: number } {
  const attack = attackDir(side);
  const netX = attack * GOAL_LINE_X;
  const px = world.puck.x;
  let attackers = 0;
  let defenders = 0;
  for (const s of world.skaters) {
    if (s.kind === "goalie") continue;
    const toNet = (netX - s.x) * attack;
    if (s.side === side) {
      if (toNet > -1.5 && toNet < 22 && (s.x - px) * attack > -9) attackers++;
    } else if (toNet > 0.4 && (s.x - px) * attack > -1.2 && toNet < 20) {
      defenders++;
    }
  }
  return { attackers, defenders };
}

function defendersInLane(shooter: Skater): number {
  const attack = attackDir(shooter.side);
  const netX = attack * GOAL_LINE_X;
  const dx = netX - shooter.x;
  const dz = -shooter.z;
  const span2 = dx * dx + dz * dz;
  if (span2 < 1) return 0;
  let n = 0;
  for (const s of world.skaters) {
    if (s.side === shooter.side || s.kind === "goalie") continue;
    const t = ((s.x - shooter.x) * dx + (s.z - shooter.z) * dz) / span2;
    if (t < 0.08 || t > 0.92) continue;
    const lx = shooter.x + dx * t;
    const lz = shooter.z + dz * t;
    if (Math.hypot(s.x - lx, s.z - lz) < 1.45) n++;
  }
  return n;
}

function applyDeke(user: Skater): void {
  const { fx, fz } = heading(user.yaw);
  const lx = -fz;
  const lz = fx;
  const side = user.z >= 0 ? 1 : -1;
  user.vx += lx * side * 6.5 + fx * 1.4;
  user.vz += lz * side * 6.5 + fz * 1.4;
  const rush = rushCounts(user.side);
  if (rush.defenders > 0) return;
  const g = world.skaters.find((p) => p.kind === "goalie" && p.side !== user.side);
  if (!g) return;
  const attack = attackDir(user.side);
  const distMouth = (attack * GOAL_LINE_X - user.x) * attack;
  if (distMouth > 14 || distMouth < 0.35) return;
  const pull = (rush.attackers >= 3 ? 1.15 : rush.attackers >= 2 ? 0.95 : 0.72) * side;
  g.trackZ = Math.max(-1.65, Math.min(1.65, user.z + pull));
  g.z = Math.max(-1.65, Math.min(1.65, g.z + pull * 0.62));
  g.stun = Math.max(g.stun, rush.attackers >= 2 ? 0.55 : 0.38);
}

function tickDeke(user: Skater, dt: number): void {
  const { fx, fz } = heading(user.yaw);
  const lx = -fz;
  const lz = fx;
  const wave = Math.sin(user.deke * 12);
  user.x += lx * wave * 1.55 * dt;
  user.z += lz * wave * 1.55 * dt;
}

function spillCheckedPuck(s: Skater, hitter?: Skater): void {
  const { fx, fz } = heading(s.yaw);
  let vx = fx * 3.2 + s.vx * 0.35 + (Math.random() - 0.5) * 6.5;
  let vz = fz * 3.2 + s.vz * 0.35 + (Math.random() - 0.5) * 6.5;
  let vy = 0.85 + Math.random() * 0.7;
  if (hitter) {
    const { fx: hx, fz: hz } = heading(hitter.yaw);
    const lx = -hz;
    const lz = hx;
    const side =
      Math.sign((s.x - hitter.x) * lx + (s.z - hitter.z) * lz) || (s.z >= 0 ? 1 : -1);
    vx = hx * 4.6 + lx * side * (8.6 + Math.random() * 3.4) + s.vx * 0.12;
    vz = hz * 4.6 + lz * side * (8.6 + Math.random() * 3.4) + s.vz * 0.12;
    vy = 1.18 + Math.random() * 0.72;
  }
  launchPuck(s, vx, vz, vy);
  world.lastPass = world.time;
  world.lastPassTo = null;
  if (world.lastPasser === s.id) world.lastPasser = null;
}

function cpuAttacking(): boolean {
  const owner = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  if (owner?.side === "away") return true;
  if (owner?.side === "home") return false;
  const last =
    world.lastShooter !== null
      ? world.skaters[world.lastShooter]
      : world.lastPasser !== null
        ? world.skaters[world.lastPasser]
        : undefined;
  return last?.side === "away" && world.puck.x * defendDir("home") > -BLUE_X - 1.2;
}

function whiffHot(): boolean {
  return world.time < world.whiffUntil;
}

function goalieInStickRange(user: Skater): Skater | undefined {
  const { fx, fz } = heading(user.yaw);
  let best: Skater | undefined;
  let bestD = 2.55;
  for (const s of world.skaters) {
    if (s.kind !== "goalie" || s.side === user.side) continue;
    const dx = s.x - user.x;
    const dz = s.z - user.z;
    const d = Math.hypot(dx, dz);
    const ahead = dx * fx + dz * fz;
    if (d < bestD && ahead > -0.85) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function bumpCreasePoke(g: Skater): void {
  if (!world.stoppage) return;
  world.creasePokeN += 1;
  world.creasePokeGoalie = g.id;
}

let userCheckOpen = true;
let userCheckDowns = 0;
const userCheckSkaters = new Set<number>();
const userCheckRefs = new Set<Referee>();
const userCheckSpared = new Set<Skater | Referee>();

function beginUserCheck(): void {
  userCheckOpen = true;
  userCheckDowns = 0;
  userCheckSkaters.clear();
  userCheckRefs.clear();
  userCheckSpared.clear();
  const u = world.skaters[world.userId];
  if (u) armCheckSwing(u);
}

const CHECK_PAD = 0.22;
const CHECK_LAT = 0.5;
const CHECK_CLOSE_S = 0.12;
const CHECK_CLOSE_V = 3.2;
const CHECK_KEEP_FWD = 0.7;
const CHECK_KEEP_LAT = 0.85;
const CHECK_RECOIL = 0.6;
const CHECK_POSE = 0.22;
const checkCloseLeft = new Map<number, number>();
const checkAbsorbed = new Set<number>();
// Checked refs stay where they get up through a goal or a finished drill.
const refStayPut = new WeakSet<Referee>();

function armCheckSwing(s: Skater): void {
  checkAbsorbed.delete(s.id);
  checkCloseLeft.set(s.id, CHECK_CLOSE_S);
}

function endCheckSwing(id: number): void {
  checkAbsorbed.delete(id);
  checkCloseLeft.delete(id);
}

function checkSpot(hitterR: number, targetR: number): { reach: number; lateral: number } {
  const bodies = hitterR + targetR;
  return { reach: bodies + CHECK_PAD, lateral: bodies * CHECK_LAT };
}

function checkLane(
  dx: number,
  dz: number,
  fx: number,
  fz: number,
  reach: number,
  lateralGate: number,
): { ok: boolean; ahead: number; lateral: number } {
  const ahead = dx * fx + dz * fz;
  const lateral = Math.abs(dx * fz - dz * fx);
  return {
    ok: Math.hypot(dx, dz) < reach && ahead > 0 && lateral < lateralGate,
    ahead,
    lateral,
  };
}

function foeNearCheck(s: Skater, left: number): boolean {
  const { fx, fz } = heading(s.yaw);
  const ui = useGame.getState();
  const extra = CHECK_CLOSE_V * left;
  for (const o of world.skaters) {
    if (o.id === s.id || o.side === s.side) continue;
    if (o.kind === "goalie" && !ui.checkGoalies) continue;
    if (o.struck > 0.45) continue;
    const spot = checkSpot(s.radius, o.radius);
    const dx = o.x - s.x;
    const dz = o.z - s.z;
    const near = checkLane(dx, dz, fx, fz, spot.reach + extra, spot.lateral);
    const touching = checkLane(dx, dz, fx, fz, spot.reach, spot.lateral);
    if (near.ok && !touching.ok) return true;
  }
  if (!ui.checkRefs) return false;
  for (const r of refsOnIce()) {
    if (r.struck > 0.45) continue;
    const spot = checkSpot(s.radius, 0.45);
    const dx = r.x - s.x;
    const dz = r.z - s.z;
    const near = checkLane(dx, dz, fx, fz, spot.reach + extra, spot.lateral);
    const touching = checkLane(dx, dz, fx, fz, spot.reach, spot.lateral);
    if (near.ok && !touching.ok) return true;
  }
  return false;
}

/** Shoulder lean before contact only. Stops on connect; never the old 7.2 through-check. */
function stepCheckClose(s: Skater, dt: number): void {
  if (s.hit <= 0 || checkAbsorbed.has(s.id)) return;
  const left = checkCloseLeft.get(s.id) ?? 0;
  if (left <= 0 || !foeNearCheck(s, left)) return;
  const step = Math.min(left, dt);
  const { fx, fz } = heading(s.yaw);
  s.x += fx * CHECK_CLOSE_V * step;
  s.z += fz * CHECK_CLOSE_V * step;
  checkCloseLeft.set(s.id, left - step);
}

function solidRunInto(
  ox: number,
  oz: number,
  vx: number,
  vz: number,
  tx: number,
  tz: number,
  gate: number,
): boolean {
  const sp2 = vx * vx + vz * vz;
  if (sp2 < 20.25) return false;
  const sp = Math.sqrt(sp2);
  const dx = tx - ox;
  const dz = tz - oz;
  if ((dx * vx + dz * vz) / sp < -0.08) return false;
  return Math.abs(dx * vz - dz * vx) / sp < gate;
}

function takeChainDown(key: Skater | Referee): boolean {
  if (userCheckSpared.has(key)) return false;
  if (userCheckDowns >= 2 && Math.random() >= 0.1) {
    userCheckSpared.add(key);
    return false;
  }
  userCheckDowns += 1;
  return true;
}

/** First connect only: keep most of the forward speed, light lateral damp, small kick back. */
function absorbHitterMomentum(hitter: Skater): void {
  checkCloseLeft.set(hitter.id, 0);
  if (checkAbsorbed.has(hitter.id)) return;
  checkAbsorbed.add(hitter.id);
  const { fx, fz } = heading(hitter.yaw);
  const fwd = hitter.vx * fx + hitter.vz * fz;
  const lat = -hitter.vx * fz + hitter.vz * fx;
  const outFwd = fwd * CHECK_KEEP_FWD - CHECK_RECOIL;
  const outLat = lat * CHECK_KEEP_LAT;
  hitter.vx = fx * outFwd - fz * outLat;
  hitter.vz = fz * outFwd + fx * outLat;
  if (hitter.hit > CHECK_POSE) hitter.hit = CHECK_POSE;
}

function layDownSkater(s: Skater, fx: number, fz: number, ivx: number, ivz: number): void {
  if (s.kind === "goalie") {
    const out = attackDir(s.side);
    s.stun = 1.55;
    s.vx = fx * 11 + ivx * 0.55 + out * 5.2;
    s.vz = fz * 11 + ivz * 0.55;
    s.x += fx * 0.55 + out * 0.42;
    s.z += fz * 0.55;
    s.coverPose = 0;
    s.gloveFlash = 0;
    if (Math.random() < 0.45) {
      s.struck = 1.68;
      s.tumble = (Math.random() < 0.5 ? 1 : -1) * (0.85 + Math.random() * 0.45);
    } else {
      s.struck = 1.7;
      s.tumble = 0;
    }
  } else if (Math.random() < 0.45) {
    s.stun = 1.45;
    s.struck = 1.68;
    s.tumble = (Math.random() < 0.5 ? 1 : -1) * (0.85 + Math.random() * 0.45);
    s.vx = fx * 12 + ivx * 0.45;
    s.vz = fz * 12 + ivz * 0.45;
  } else {
    s.stun = 1.2;
    s.struck = 1.25;
    s.tumble = 0;
    s.vx = fx * 12 + ivx * 0.45;
    s.vz = fz * 12 + ivz * 0.45;
  }
}

function layDownRef(r: Referee, fx: number, fz: number, ivx: number, ivz: number): void {
  refStayPut.add(r);
  r.vx = fx * 11 + ivx * 0.45;
  r.vz = fz * 11 + ivz * 0.45;
  r.pose = "idle";
  if (Math.random() < 0.45) {
    r.struck = 1.68;
    r.tumble = (Math.random() < 0.5 ? 1 : -1) * (0.85 + Math.random() * 0.45);
  } else {
    r.struck = 1.4;
    r.tumble = 0;
  }
}

function lineBrawlAllowed(): boolean {
  const ui = useGame.getState();
  if (!ui.lineBrawl) return false;
  return ui.clockMode === "scrimmage" || ui.clockMode === "game";
}

function heldBody(id: number): boolean {
  if (world.benchDump?.id === id) return true;
  const b = world.lineBrawl;
  if (!b) return false;
  for (const p of b.pairs) {
    if (p.home === id || p.away === id) return true;
  }
  return false;
}

function tryBenchDump(user: Skater, s: Skater, fx: number, fz: number): boolean {
  if (!lineBrawlAllowed() || world.benchDump || world.lineBrawl) return false;
  if (s.kind === "goalie" || s.side !== "away") return false;
  if (world.puck.owner === s.id) return false;
  if (world.stoppage || world.faceoff) return false;
  const boardZ = -RINK_W / 2;
  const along = s.z - boardZ;
  if (along > 1.22 || along < 0.05) return false;
  if (Math.abs(s.x) > 9.65) return false;
  if (fz > -0.58) return false;
  if (Math.hypot(user.vx, user.vz) < 2.4) return false;
  let landX = s.x + fx * 1.1;
  const gap = Math.abs(landX) < 0.62;
  let landZ = boardZ - 1.2;
  if (gap) landX = Math.max(-0.22, Math.min(0.22, landX));
  else if (landX >= 0) landX = Math.max(0.85, Math.min(9.15, landX));
  else landX = Math.min(-0.85, Math.max(-9.15, landX));
  s.stun = 2.4;
  s.struck = 0.55;
  s.tumble = 1;
  s.vx = 0;
  s.vz = 0;
  s.hit = 0;
  s.yaw = 0;
  s.celebrate = 0;
  world.benchDump = {
    id: s.id,
    t: 0,
    dur: 0.7,
    x0: s.x,
    z0: s.z,
    x1: landX,
    z1: landZ,
    y: 0,
    phase: "fly",
    kind: landX >= 0 ? "help" : "shove",
    gap,
  };
  return true;
}

function beginLineBrawl(): boolean {
  const homeG = world.skaters.filter((s) => s.side === "home" && s.kind === "goalie");
  const awayG = world.skaters.filter((s) => s.side === "away" && s.kind === "goalie");
  const homeS = world.skaters
    .filter((s) => s.side === "home" && s.kind !== "goalie")
    .sort((a, b) => a.x - b.x);
  const awayS = world.skaters.filter((s) => s.side === "away" && s.kind !== "goalie");
  const pairs: BrawlPair[] = [];
  const push = (h: Skater, a: Skater) => {
    pairs.push({
      home: h.id,
      away: a.id,
      ko: false,
      celeb: 0,
      hx: 0,
      hz: 0,
      ax: 0,
      az: 0,
      homeSwing: 0,
      awaySwing: 0,
      homeKind: 0,
      awayKind: 0,
    });
  };
  const remaining = [...awayS];
  for (const h of homeS) {
    let bestI = -1;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[i]!;
      const d = Math.hypot(a.x - h.x, a.z - h.z);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    if (bestI >= 0) {
      const a = remaining.splice(bestI, 1)[0];
      if (a) push(h, a);
    }
  }
  if (homeG[0] && awayG[0]) push(homeG[0], awayG[0]);
  if (pairs.length === 0) return false;
  const n = pairs.length;
  const zH = -RINK_W / 2 + 2.35;
  const zA = -RINK_W / 2 + 1.15;
  const span = n <= 1 ? 0 : Math.min(14, (n - 1) * 2.3);
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
    const p = pairs[i]!;
    p.hx = x;
    p.hz = zH;
    p.ax = x;
    p.az = zA;
  }
  const user = world.skaters[world.userId];
  let focus = pairs[0]!.home;
  if (user) {
    let bestD = Infinity;
    for (const p of pairs) {
      if (p.home === user.id) {
        focus = user.id;
        break;
      }
      const h = world.skaters[p.home];
      if (!h) continue;
      const d = Math.hypot(h.x - user.x, h.z - user.z);
      if (d < bestD) {
        bestD = d;
        focus = p.home;
      }
    }
  }
  for (const s of world.skaters) {
    s.vx = 0;
    s.vz = 0;
    s.stun = 0;
    s.struck = 0;
    s.tumble = 0;
    s.hit = 0;
    s.deke = 0;
    s.poke = 0;
    s.dive = 0;
    s.windup = 0;
    s.follow = 0;
    s.celebrate = 0;
    s.coverPose = 0;
  }
  world.lineBrawl = { t: 0, focus, last: 0, lastAt: -10, pairs };
  world.benchDump = null;
  world.stoppage = true;
  world.stoppageT = 0;
  world.faceoff = false;
  world.whistle = "brawl";
  world.goalBank = null;
  world.puck.owner = null;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.puck.y = PUCK_Y;
  world.puck.x = 0;
  world.puck.z = -RINK_W / 2 + 4.2;
  clearDelayedOffside();
  world.ref.pose = "cover";
  world.ref.poseT = 0;
  world.ref2.pose = "cover";
  world.ref2.poseT = 0;
  world.userId = focus;
  const ui = useGame.getState();
  ui.setWhistle("brawl");
  ui.setHasPuck(false);
  return true;
}

function focusNextBrawl(fromId: number): void {
  const b = world.lineBrawl;
  if (!b) return;
  const from = world.skaters[fromId];
  let best: BrawlPair | null = null;
  let bestD = Infinity;
  for (const p of b.pairs) {
    if (p.ko || p.home === fromId) continue;
    const h = world.skaters[p.home];
    if (!h || !from) continue;
    const d = Math.hypot(h.x - from.x, h.z - from.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (!best) return;
  b.focus = best.home;
  world.userId = best.home;
  b.last = 0;
}

function koBrawlPair(p: BrawlPair): void {
  p.ko = true;
  p.celeb = 0;
  p.awaySwing = 0;
  const home = world.skaters[p.home];
  if (home) {
    home.celebrate = 8;
    home.struck = 0;
    home.tumble = 0;
    home.stun = 0;
  }
  const away = world.skaters[p.away];
  if (away) {
    away.struck = away.kind === "goalie" ? 1.68 : 0.55;
    away.tumble = 1;
    away.celebrate = 0;
    away.stun = 8;
    away.coverPose = 0;
    away.vx = 0;
    away.vz = 0;
  }
  focusNextBrawl(p.home);
}

function stepBenchDump(dt: number): void {
  const d = world.benchDump;
  if (!d) return;
  if (!lineBrawlAllowed()) {
    const s = world.skaters[d.id];
    world.benchDump = null;
    if (s) {
      s.z = Math.max(s.z, -RINK_W / 2 + 0.85);
      s.struck = 1.15;
      s.tumble = 1;
      s.stun = 1.05;
      s.vx = 0;
      s.vz = 0;
    }
    return;
  }
  const s = world.skaters[d.id];
  if (!s) {
    world.benchDump = null;
    return;
  }
  d.t += dt;
  s.vx = 0;
  s.vz = 0;
  s.hit = 0;
  if (d.phase === "fly") {
    const u = Math.min(1, d.t / d.dur);
    const e = u * u * (3 - 2 * u);
    s.x = d.x0 + (d.x1 - d.x0) * e;
    s.z = d.z0 + (d.z1 - d.z0) * e;
    d.y = Math.sin(Math.PI * u) * (BOARD_H + 0.55);
    s.struck = 0.55;
    s.tumble = 0.45 + u * 1.35;
    s.yaw = 0;
    if (u >= 1) {
      if (d.gap && !world.stoppage && !world.faceoff && beginLineBrawl()) return;
      d.phase = "bench";
      d.t = 0;
      d.y = 0.22;
      d.gap = false;
    }
    return;
  }
  if (d.phase === "bench") {
    const wait = d.kind === "help" ? 1.15 : 2.7;
    if (d.kind === "help") {
      const k = Math.min(1, d.t / wait);
      s.x = d.x1;
      s.z = d.z1 + k * 0.45;
      d.y = 0.22 + k * 0.18;
      s.struck = 0.55;
      s.tumble = 1;
    } else {
      s.x = d.x1 + Math.sin(d.t * 8) * 0.28;
      s.z = d.z1 - Math.abs(Math.sin(d.t * 7)) * 0.16;
      d.y = 0.16;
      s.struck = 0.5;
      s.tumble = 1;
    }
    if (d.t >= wait) {
      d.phase = "back";
      d.t = 0;
      d.x0 = s.x;
      d.z0 = s.z;
      d.x1 = Math.max(-9.2, Math.min(9.2, s.x));
      d.z1 = -RINK_W / 2 + 1.15;
    }
    return;
  }
  const backDur = d.kind === "help" ? 0.75 : 1.35;
  const u = Math.min(1, d.t / backDur);
  const e = u * u * (3 - 2 * u);
  s.x = d.x0 + (d.x1 - d.x0) * e;
  s.z = d.z0 + (d.z1 - d.z0) * e;
  d.y = Math.sin(Math.PI * u) * (d.kind === "help" ? BOARD_H * 0.85 : BOARD_H * 0.95);
  s.tumble = 1;
  s.struck = d.kind === "help" ? 0.55 + u * 0.95 : 0.62;
  s.yaw = 0;
  if (u >= 1) {
    s.stun = d.kind === "help" ? 0.35 : 0.95;
    s.struck = d.kind === "help" ? 0.35 : 1.15;
    s.tumble = d.kind === "help" ? 0 : 1;
    s.vx = 0;
    s.vz = 1.1;
    s.z = Math.max(s.z, -RINK_W / 2 + 0.9);
    world.benchDump = null;
  }
}

function stepLineBrawl(dt: number, act: Actions): void {
  const b = world.lineBrawl;
  if (!b) return;
  if (!lineBrawlAllowed()) {
    world.lineBrawl = null;
    world.whistle = null;
    world.stoppage = false;
    useGame.getState().setWhistle(null);
    return;
  }
  b.t += dt;
  if (b.t >= 7) {
    const mid = b.pairs[Math.floor((b.pairs.length - 1) / 2)];
    const mx = mid?.hx ?? 0;
    world.faceX = (mx >= 0 ? 1 : -1) * FACEOFF_NZ_X;
    world.faceZ = -FACEOFF_SPOT_Z;
    world.lineBrawl = null;
    world.benchDump = null;
    resetWorld({ keepScore: true });
    return;
  }
  const focusPair = b.pairs.find((p) => p.home === b.focus && !p.ko);
  if (focusPair && (act.xEdge || act.bEdge)) {
    const use: 1 | 2 = act.xEdge && act.bEdge ? (b.last === 1 ? 2 : 1) : act.xEdge ? 1 : 2;
    focusPair.homeKind = use === 1 ? 0 : 1;
    focusPair.homeSwing = 1;
    if (b.last !== 0 && b.last !== use && world.time - b.lastAt < 0.5) {
      b.last = 0;
      koBrawlPair(focusPair);
    } else {
      b.last = use;
      b.lastAt = world.time;
    }
  }
  const k = Math.min(1, 9 * dt);
  for (const p of b.pairs) {
    p.homeSwing = Math.max(0, p.homeSwing - dt * 2.6);
    p.awaySwing = Math.max(0, p.awaySwing - dt * 2.6);
    const home = world.skaters[p.home];
    const away = world.skaters[p.away];
    if (p.ko) {
      if (home && p.homeSwing > 0.08) {
        home.x += (p.hx - home.x) * k;
        home.z += (p.hz - home.z) * k;
        home.yaw = 0;
        home.vx = 0;
        home.vz = 0;
        home.struck = 0;
        home.tumble = 0;
        home.celebrate = 0;
        home.hit = 0;
      } else if (home) {
        p.celeb += dt;
        const ang = p.celeb * 2.15;
        home.x = p.hx + Math.cos(ang) * 1.05;
        home.z = p.hz + Math.sin(ang) * 1.05;
        home.yaw = Math.atan2(Math.sin(ang), -Math.cos(ang));
        home.stride += dt * 10;
        home.celebrate = 8;
        home.vx = 0;
        home.vz = 0;
        home.struck = 0;
        home.tumble = 0;
        home.hit = 0;
        home.stun = 0;
      }
      if (away) {
        away.x = p.ax;
        away.z = p.az;
        away.vx = 0;
        away.vz = 0;
        away.struck = away.kind === "goalie" ? 1.68 : 0.55;
        away.tumble = away.tumble || 1;
        away.coverPose = 0;
        away.celebrate = 0;
        away.yaw = Math.PI;
      }
      continue;
    }
    if (home) {
      home.x += (p.hx - home.x) * k;
      home.z += (p.hz - home.z) * k;
      home.yaw = 0;
      home.vx = 0;
      home.vz = 0;
      home.struck = 0;
      home.tumble = 0;
      home.stun = 0;
      home.celebrate = 0;
      home.hit = 0;
      if (p.home !== b.focus && p.homeSwing <= 0.02 && Math.random() < dt * 1.7) {
        p.homeKind = Math.random() < 0.55 ? 0 : 1;
        p.homeSwing = 1;
      }
    }
    if (away) {
      away.x += (p.ax - away.x) * k;
      away.z += (p.az - away.z) * k;
      away.yaw = Math.PI;
      away.vx = 0;
      away.vz = 0;
      away.struck = 0;
      away.tumble = 0;
      away.stun = 0;
      away.celebrate = 0;
      if (p.awaySwing <= 0.02 && Math.random() < dt * 1.7) {
        p.awayKind = Math.random() < 0.55 ? 0 : 1;
        p.awaySwing = 1;
      }
    }
  }
  const paired = new Set<number>();
  for (const p of b.pairs) {
    paired.add(p.home);
    paired.add(p.away);
  }
  let extra = 0;
  for (const s of world.skaters) {
    if (paired.has(s.id)) continue;
    const tz = 2.2 + (extra % 5) * 1.35;
    extra++;
    s.x += (Math.max(-8, Math.min(8, s.x)) - s.x) * k;
    s.z += (tz - s.z) * k;
    s.vx = 0;
    s.vz = 0;
    s.yaw = s.side === "home" ? 0 : Math.PI;
    s.hit = 0;
    s.celebrate = 0;
  }
  world.puck.owner = null;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  const watchZ = RINK_W / 2 - 2.2;
  const refs = [
    { r: world.ref, x: -6.2 },
    { r: world.ref2, x: 6.2 },
  ];
  for (const spot of refs) {
    const r = spot.r;
    r.pose = "cover";
    r.poseT += dt;
    r.vx = 0;
    r.vz = 0;
    r.struck = 0;
    r.tumble = 0;
    r.x += (spot.x - r.x) * Math.min(1, 4 * dt);
    r.z += (watchZ - r.z) * Math.min(1, 4 * dt);
    r.yaw = turnToward(r.yaw, -r.x, -RINK_W / 2 + 1.7 - r.z, 6, dt);
  }
}

function applyUserHit(user: Skater): boolean {
  if (!userCheckOpen) return userCheckDowns > 0;
  const { fx, fz } = heading(user.yaw);
  const ui = useGame.getState();
  const best: { s: Skater | null; r: Referee | null; ahead: number; lat: number } = {
    s: null,
    r: null,
    ahead: Infinity,
    lat: Infinity,
  };
  const take = (ahead: number, lateral: number, s: Skater | null, r: Referee | null) => {
    const closer = ahead < best.ahead - 0.12;
    const tighter = Math.abs(ahead - best.ahead) <= 0.12 && lateral < best.lat;
    if ((best.s === null && best.r === null) || closer || tighter) {
      best.ahead = ahead;
      best.lat = lateral;
      best.s = s;
      best.r = r;
    }
  };
  for (const s of world.skaters) {
    if (s.id === user.id || s.side === user.side) continue;
    if (s.kind === "goalie" && !ui.checkGoalies) continue;
    if (s.struck > 0.45) continue;
    const dx = s.x - user.x;
    const dz = s.z - user.z;
    const spot = checkSpot(user.radius, s.radius);
    const lane = checkLane(dx, dz, fx, fz, spot.reach, spot.lateral);
    if (lane.ok) take(lane.ahead, lane.lateral, s, null);
  }
  if (ui.checkRefs) {
    for (const r of refsOnIce()) {
      if (r.struck > 0.45) continue;
      const dx = r.x - user.x;
      const dz = r.z - user.z;
      const spot = checkSpot(user.radius, 0.45);
      const lane = checkLane(dx, dz, fx, fz, spot.reach, spot.lateral);
      if (lane.ok) take(lane.ahead, lane.lateral, null, r);
    }
  }
  if (!best.s && !best.r) return false;
  userCheckOpen = false;
  userCheckDowns = 1;
  if (best.s) {
    if (tryBenchDump(user, best.s, fx, fz)) {
      absorbHitterMomentum(user);
      world.lastHitter = user.id;
      world.lastHitTime = world.time;
      return true;
    }
    layDownSkater(best.s, fx, fz, user.vx, user.vz);
    absorbHitterMomentum(user);
    userCheckSkaters.add(best.s.id);
    if (world.puck.owner === best.s.id) spillCheckedPuck(best.s, user);
    else if (world.puck.owner === null && world.time - world.lastHitTime > 0.2) {
      const dP = Math.hypot(world.puck.x - best.s.x, world.puck.z - best.s.z);
      if (dP < 1.45) {
        const lx = -fz;
        const lz = fx;
        const side = Math.sign((world.puck.x - user.x) * lx + (world.puck.z - user.z) * lz) || 1;
        world.puck.vx = fx * 5.2 + lx * side * 8.5;
        world.puck.vz = fz * 5.2 + lz * side * 8.5;
        world.puck.vy = 1.2;
        world.puck.y = Math.max(world.puck.y, PUCK_Y + 0.12);
      }
    }
  } else if (best.r) {
    layDownRef(best.r, fx, fz, user.vx, user.vz);
    absorbHitterMomentum(user);
    userCheckRefs.add(best.r);
  }
  world.lastHitter = user.id;
  world.lastHitTime = world.time;
  return true;
}

function bowlUserChecks(): void {
  if (userCheckDowns <= 0) return;
  const ui = useGame.getState();
  const userSide = world.skaters[world.userId]?.side;
  if (!userSide) return;
  const flyers: { x: number; z: number; vx: number; vz: number; rad: number; goalie: boolean }[] = [];
  for (const s of world.skaters) {
    if (userCheckSkaters.has(s.id) && s.struck > 0.35 && s.vx * s.vx + s.vz * s.vz > 20.25) {
      flyers.push({ x: s.x, z: s.z, vx: s.vx, vz: s.vz, rad: s.radius, goalie: s.kind === "goalie" });
    }
  }
  if (ui.checkRefs) {
    for (const r of refsOnIce()) {
      if (userCheckRefs.has(r) && r.struck > 0.35 && r.vx * r.vx + r.vz * r.vz > 20.25) {
        flyers.push({ x: r.x, z: r.z, vx: r.vx, vz: r.vz, rad: 0.45, goalie: false });
      }
    }
  }
  for (const f of flyers) {
    let bestS: Skater | null = null;
    let bestR: Referee | null = null;
    let bestAlong = Infinity;
    const sp = Math.hypot(f.vx, f.vz) || 1;
    for (const s of world.skaters) {
      if (s.side === userSide || s.id === world.userId) continue;
      if (s.kind === "goalie" && !ui.checkGoalies) continue;
      if (userCheckSkaters.has(s.id) || s.struck > 0.45) continue;
      const dx = s.x - f.x;
      const dz = s.z - f.z;
      const dist = Math.hypot(dx, dz);
      const min = f.rad + s.radius + (f.goalie || s.kind === "goalie" ? 0.28 : 0.2);
      if (dist >= min || dist < 1e-4) continue;
      if (!solidRunInto(f.x, f.z, f.vx, f.vz, s.x, s.z, (f.rad + s.radius) * 0.58)) continue;
      const along = (dx * f.vx + dz * f.vz) / sp;
      if (along < bestAlong) {
        bestAlong = along;
        bestS = s;
        bestR = null;
      }
    }
    if (ui.checkRefs) {
      for (const r of refsOnIce()) {
        if (userCheckRefs.has(r) || r.struck > 0.45) continue;
        const dx = r.x - f.x;
        const dz = r.z - f.z;
        const dist = Math.hypot(dx, dz);
        const min = f.rad + 0.45;
        if (dist >= min || dist < 1e-4) continue;
        if (!solidRunInto(f.x, f.z, f.vx, f.vz, r.x, r.z, (f.rad + 0.45) * 0.58)) continue;
        const along = (dx * f.vx + dz * f.vz) / sp;
        if (along < bestAlong) {
          bestAlong = along;
          bestS = null;
          bestR = r;
        }
      }
    }
    const dirX = f.vx / sp;
    const dirZ = f.vz / sp;
    if (bestS && takeChainDown(bestS)) {
      layDownSkater(bestS, dirX, dirZ, 0, 0);
      userCheckSkaters.add(bestS.id);
      if (world.puck.owner === bestS.id) spillCheckedPuck(bestS);
    } else if (bestR && takeChainDown(bestR)) {
      layDownRef(bestR, dirX, dirZ, 0, 0);
      userCheckRefs.add(bestR);
    }
  }
}

function applyHit(user: Skater): boolean {
  if (user.id === world.userId) return applyUserHit(user);
  const { fx, fz } = heading(user.yaw);
  const checkGoalies = useGame.getState().checkGoalies;
  let connected = false;
  let landed = false;
  for (const s of world.skaters) {
    if (s.id === user.id || s.side === user.side) continue;
    if (s.kind === "goalie" && !checkGoalies) continue;
    if (s.struck > 0.45) continue;
    const dx = s.x - user.x;
    const dz = s.z - user.z;
    const spot = checkSpot(user.radius, s.radius);
    const lane = checkLane(dx, dz, fx, fz, spot.reach, spot.lateral);
    if (lane.ok) {
      connected = true;
      landed = true;
      if (s.kind === "goalie") {
        const out = attackDir(s.side);
        s.stun = 1.55;
        s.vx = fx * 11 + user.vx * 0.55 + out * 5.2;
        s.vz = fz * 11 + user.vz * 0.55;
        s.x += fx * 0.55 + out * 0.42;
        s.z += fz * 0.55;
        s.coverPose = 0;
        s.gloveFlash = 0;
        if (Math.random() < 0.45) {
          s.struck = 1.68;
          s.tumble = (Math.random() < 0.5 ? 1 : -1) * (0.85 + Math.random() * 0.45);
        } else {
          s.struck = 1.7;
          s.tumble = 0;
        }
      } else if (Math.random() < 0.45) {
        s.stun = 1.45;
        s.struck = 1.68;
        s.tumble = (Math.random() < 0.5 ? 1 : -1) * (0.85 + Math.random() * 0.45);
        s.vx = fx * 12 + user.vx * 0.45;
        s.vz = fz * 12 + user.vz * 0.45;
      } else {
        s.stun = 1.2;
        s.struck = 1.25;
        s.tumble = 0;
        s.vx = fx * 12 + user.vx * 0.45;
        s.vz = fz * 12 + user.vz * 0.45;
      }
      if (world.puck.owner === s.id && !userStickCommitHolds(s.id)) spillCheckedPuck(s, user);
      else if (world.puck.owner === null && world.time - world.lastHitTime > 0.2) {
        const dP = Math.hypot(world.puck.x - s.x, world.puck.z - s.z);
        if (dP < 1.45) {
          const lx = -fz;
          const lz = fx;
          const side =
            Math.sign((world.puck.x - user.x) * lx + (world.puck.z - user.z) * lz) || 1;
          world.puck.vx = fx * 5.2 + lx * side * 8.5;
          world.puck.vz = fz * 5.2 + lz * side * 8.5;
          world.puck.vy = 1.2;
          world.puck.y = Math.max(world.puck.y, PUCK_Y + 0.12);
        }
      }
      world.lastHitter = user.id;
      world.lastHitTime = world.time;
    }
  }
  if (useGame.getState().checkRefs) {
    for (const r of refsOnIce()) {
      if (r.struck > 0.45) continue;
      const dx = r.x - user.x;
      const dz = r.z - user.z;
      const spot = checkSpot(user.radius, 0.45);
      const lane = checkLane(dx, dz, fx, fz, spot.reach, spot.lateral);
      if (lane.ok) {
        landed = true;
        r.vx = fx * 11 + user.vx * 0.45;
        r.vz = fz * 11 + user.vz * 0.45;
        r.pose = "idle";
        if (Math.random() < 0.45) {
          r.struck = 1.68;
          r.tumble = (Math.random() < 0.5 ? 1 : -1) * (0.85 + Math.random() * 0.45);
        } else {
          r.struck = 1.4;
          r.tumble = 0;
        }
      }
    }
  }
  if (landed) absorbHitterMomentum(user);
  return connected;
}

function defendingGoalie(side: 1 | -1): Skater | undefined {
  const who: "home" | "away" = side === world.homeAttack ? "away" : "home";
  return world.skaters.find((s) => s.kind === "goalie" && s.side === who);
}

function goalBankTarget(side: 1 | -1, hit: number): { x: number; y: number; z: number } {
  const mouth = side * GOAL_LINE_X;
  const hw = GOAL_W / 2;
  const puck = world.puck;
  if (hit === 1) {
    return { x: mouth, y: GOAL_H, z: Math.max(-hw + 0.18, Math.min(hw - 0.18, puck.z)) };
  }
  if (hit === 2) {
    const g = defendingGoalie(side);
    if (g) return { x: g.x, y: Math.max(0.16, Math.min(0.92, puck.y)), z: g.z };
    return { x: mouth - side * 0.2, y: puck.y, z: puck.z };
  }
  const zPost =
    world.lastShotCorner && world.lastShotCornerSide
      ? -Math.sign(world.lastShotCornerSide) * hw
      : puck.z >= 0
        ? hw
        : -hw;
  return { x: mouth, y: Math.max(0.12, Math.min(GOAL_H - 0.1, puck.y)), z: zPost };
}

function pingGoalBank(puck: Puck, side: 1 | -1, hit: number, next: number | undefined): void {
  const mouth = side * GOAL_LINE_X;
  const hw = GOAL_W / 2;
  if (hit === 2) {
    const g = defendingGoalie(side);
    const open = g ? Math.sign(puck.z - g.z) || (puck.z >= 0 ? 1 : -1) : puck.z >= 0 ? 1 : -1;
    if (g && Math.hypot(puck.x - g.x, puck.z - g.z) < 2.4) {
      puck.x = g.x + side * 0.12;
      puck.z = g.z + open * 0.32;
      g.poke = Math.max(g.poke, 0.38);
      g.stun = Math.max(g.stun, 0.18);
      g.coverPose = Math.max(g.coverPose, 0.42);
    }
    puck.vx = side * (4.2 + Math.random() * 2.4);
    puck.vz = open * (next === 0 ? 6.4 : 3.6 + Math.random() * 2.8);
    puck.vy = 0.55 + Math.random() * 1.4;
    puck.y = Math.max(0.16, puck.y);
    return;
  }
  if (hit === 1) {
    puck.x = mouth + side * 0.05;
    puck.y = GOAL_H - 0.05;
    puck.z = Math.max(-hw + 0.16, Math.min(hw - 0.16, puck.z));
    puck.vy = -Math.max(2.4, Math.abs(puck.vy) * 0.55 + 1.6);
    puck.vx = side * Math.max(3.1, Math.abs(puck.vx) * 0.42 + 2.2);
    puck.vz *= 0.28;
    return;
  }
  const zPost = puck.z >= 0 ? hw : -hw;
  puck.x = mouth + side * 0.04;
  puck.z = zPost - Math.sign(zPost) * 0.09;
  puck.y = Math.max(PUCK_Y, Math.min(GOAL_H - 0.08, puck.y));
  puck.vx = side * Math.max(3.4, Math.abs(puck.vx) * 0.5 + 2.4);
  puck.vz = -Math.sign(zPost) * (next === 1 ? 1.4 : 4.2);
  puck.vy = next === 1 ? 3.6 : Math.abs(puck.vy) * 0.35 + 0.7;
}

function steerGoalBank(puck: Puck, side: 1 | -1, hit: number): void {
  const tgt = goalBankTarget(side, hit);
  const dx = tgt.x - puck.x;
  const dy = tgt.y - puck.y;
  const dz = tgt.z - puck.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const spd = hit === 2 ? 9.5 : 8.2;
  puck.vx = (dx / d) * spd;
  puck.vy = (dy / d) * spd;
  puck.vz = (dz / d) * spd;
}

function goalieShotSide(side: 1 | -1): boolean {
  if (world.goalieShot === null) return false;
  const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : null;
  return !!shooter && shooter.kind === "goalie" && attackDir(shooter.side) === side;
}

function kickGoalieMiss(puck: Puck, side: 1 | -1, z: number, bar: boolean): void {
  const mouth = side * GOAL_LINE_X;
  const hw = GOAL_W / 2;
  world.goalieShot = null;
  if (bar) {
    puck.x = mouth - side * 0.28;
    puck.y = GOAL_H + 0.2;
    puck.z = Math.max(-hw + 0.12, Math.min(hw - 0.12, z));
    puck.vy = Math.max(2.2, Math.abs(puck.vy) * 0.3);
    puck.vx = -side * Math.max(3.8, Math.abs(puck.vx) * 0.34);
    puck.vz *= 0.42;
    return;
  }
  const outward = Math.sign(z) || 1;
  puck.x = mouth - side * 0.22;
  puck.z = outward * (hw + 0.22);
  puck.y = Math.max(PUCK_Y, Math.min(puck.y, 0.55));
  puck.vx = -side * Math.max(4.2, Math.abs(puck.vx) * 0.4);
  puck.vz = outward * Math.max(3.2, Math.abs(puck.vz) * 0.4 + 1.4);
  puck.vy = Math.max(0.45, puck.vy * 0.15);
}

function beginGoalBank(side: 1 | -1): boolean {
  if (world.goalBank || world.whistle === "goal" || world.goalieShot === "out") return false;
  const puck = world.puck;
  if (Math.abs(puck.x - side * GOAL_LINE_X) > 2.4) return false;
  if (puck.vx * side < 0.35) return false;
  const spd = Math.hypot(puck.vx, puck.vz);
  if (spd < 2.4) return false;
  const hw = GOAL_W / 2;
  const nearPost = Math.abs(Math.abs(puck.z) - hw) < 0.22;
  const nearBar = puck.y > GOAL_H - 0.16;
  const g = defendingGoalie(side);
  const nearG = !!g && Math.hypot(puck.x - g.x, puck.z - g.z) < 1.65 && puck.y < 1.15;
  const r = Math.random();
  let hits: number[];
  const highPost = puck.y > GOAL_H * 0.55;
  if (cornerSnipeLive()) {
    if (!highPost) hits = [0];
    else if (r < 0.28) hits = [0];
    else if (r < 0.5) hits = [1];
    else if (r < 0.76) hits = [0, 1];
    else hits = [1, 0];
  } else if (nearPost || nearBar) {
    return false;
  } else if (nearG) {
    if (r < 0.16) hits = [0];
    else if (r < 0.28) hits = highPost ? [1] : [0];
    else if (r < 0.5) hits = [2, 0];
    else if (r < 0.92) hits = [2];
    else return false;
  } else if (r < 0.12) {
    return false;
  } else if (!highPost) {
    hits = [0];
  } else if (r < 0.45) {
    hits = [1];
  } else if (r < 0.72) {
    hits = [0, 1];
  } else {
    hits = [1, 0];
  }
  if (!hits.length) return false;
  world.goalBank = { side, hits, i: 0, t: 0 };
  const first = hits[0]!;
  if (nearG && first === 2) {
    pingGoalBank(puck, side, 2, hits[1]);
    world.goalBank.i = 1;
    if (world.goalBank.i >= hits.length) {
      world.goalBank = null;
      stopForGoal(side);
    } else {
      steerGoalBank(puck, side, hits[1]!);
    }
  } else {
    steerGoalBank(puck, side, first);
  }
  return true;
}

function stepGoalBank(dt: number): void {
  checkOffside();
  if (world.stoppage || !world.goalBank) return;
  const b = world.goalBank;
  if (!b) return;
  const puck = world.puck;
  const along = (puck.x - b.side * GOAL_LINE_X) * b.side;
  if (along < -0.4 || Math.abs(puck.x - b.side * GOAL_LINE_X) > 3.2) {
    world.goalBank = null;
    return;
  }
  const prevX = puck.x;
  const prevZ = puck.z;
  const prevY = puck.y;
  puck.x += puck.vx * dt;
  puck.z += puck.vz * dt;
  puck.y += puck.vy * dt;
  puck.vy -= 12 * dt;
  if (puck.y <= PUCK_Y) {
    puck.y = PUCK_Y;
    if (puck.vy < 0) puck.vy *= -0.22;
  }
  puck.vx *= Math.exp(-0.45 * dt);
  puck.vz *= Math.exp(-0.45 * dt);
  bouncePuckCage(puck, prevX, prevZ, prevY);
  containPuckBoards(puck);
  b.t += dt;
  if (b.i >= b.hits.length) {
    world.goalBank = null;
    stopForGoal(b.side);
    return;
  }
  const hit = b.hits[b.i]!;
  const tgt = goalBankTarget(b.side, hit);
  const d = Math.hypot(puck.x - tgt.x, puck.z - tgt.z, (puck.y - tgt.y) * 0.85);
  if (d < 0.2 || b.t > 0.26) {
    pingGoalBank(puck, b.side, hit, b.hits[b.i + 1]);
    b.i += 1;
    b.t = 0;
    if (b.i >= b.hits.length) {
      world.goalBank = null;
      stopForGoal(b.side);
      return;
    }
    steerGoalBank(puck, b.side, b.hits[b.i]!);
  }
}

function crossedGoalMouth(prevX: number, prevZ: number, prevY: number, puck: Puck): 1 | -1 | 0 {
  for (const side of [1, -1] as const) {
    const mouth = side * GOAL_LINE_X;
    const before = side > 0 ? prevX < mouth : prevX > mouth;
    const nowPast = side > 0 ? puck.x >= mouth : puck.x <= mouth;
    if (before && nowPast) {
      if (puck.vx * side < 0.2) continue;
      const span = puck.x - prevX;
      const t = Math.abs(span) < 1e-6 ? 1 : (mouth - prevX) / span;
      const zAt = prevZ + (puck.z - prevZ) * t;
      const yAt = prevY + (puck.y - prevY) * t;
      if (yAt <= GOAL_H - 0.02 && Math.abs(zAt) <= GOAL_W / 2 - 0.02) {
        const back = mouth + side * GOAL_D;
        const pastBack = side > 0 ? puck.x > back + 0.3 : puck.x < back - 0.3;
        if (!pastBack) return side;
      }
    }
    const fromIce = side > 0 ? prevX < mouth - 0.01 : prevX > mouth + 0.01;
    if (
      fromIce &&
      inCageVolume(puck.x, puck.z, puck.y, side) &&
      prevY < GOAL_H &&
      Math.abs(prevZ) <= GOAL_W / 2 + 0.22
    ) {
      return side;
    }
  }
  return 0;
}

function inCageVolume(x: number, z: number, y: number, side: 1 | -1): boolean {
  const mouth = side * GOAL_LINE_X;
  const depth = cageDepthAt(z, Math.min(y, GOAL_H));
  if (depth <= 0.02) return false;
  const along = (x - mouth) * side;
  return along > 0 && along < depth && Math.abs(z) < GOAL_W / 2 && y < GOAL_H;
}

function containPuckBoards(puck: Puck): boolean {
  const hit = resolveRink(puck.x, puck.z, 0.09);
  if (!hit.hit) {
    overWall.delete(puck);
    return false;
  }
  if (puck.y > wallTop(hit.nx, hit.nz, hit.x, hit.z) || overWall.has(puck)) {
    overWall.add(puck);
    return false;
  }
  if (
    !steppingGhost &&
    drillFromPass &&
    world.drillShot &&
    Math.abs(hit.nz) >= Math.abs(hit.nx)
  ) {
    drillPassSide = true;
  }
  puck.x = hit.x;
  puck.z = hit.z;
  const b = reflectBoard(puck.vx, puck.vz, hit.nx, hit.nz);
  puck.vx = b.vx;
  puck.vz = b.vz;
  const again = resolveRink(puck.x, puck.z, 0.09);
  if (again.hit && puck.y <= wallTop(again.nx, again.nz, again.x, again.z)) {
    puck.x = again.x;
    puck.z = again.z;
  }
  return true;
}

function boardArrival(x: number, z: number, vx: number, vz: number, vy: number): { y: number; limit: number } | null {
  let px = x;
  let pz = z;
  let pvx = vx;
  let pvz = vz;
  let py = PUCK_Y + Math.max(0, vy) * 0.02;
  let pvy = vy;
  for (let i = 0; i < 300; i++) {
    const damp = Math.exp(-0.35 / 60);
    pvx *= damp;
    pvz *= damp;
    px += pvx / 60;
    pz += pvz / 60;
    py += pvy / 60;
    pvy -= 12 / 60;
    if (py <= PUCK_Y) {
      py = PUCK_Y;
      if (pvy < 0) pvy *= -0.28;
      if (Math.abs(pvy) < 0.4) pvy = 0;
    }
    const hit = resolveRink(px, pz, 0.09);
    if (hit.hit) return { y: py, limit: wallTop(hit.nx, hit.nz, hit.x, hit.z) };
    if (Math.hypot(pvx, pvz) < 0.6) break;
  }
  return null;
}

function vyForBank(x: number, z: number, vx: number, vz: number, high: boolean): number {
  if (!high) return 0.06 + Math.random() * 0.12;
  const glass = BOARD_H + GLASS_H * 0.42;
  let lo = 0.3;
  let hi = 14;
  let best = 0.3;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) * 0.5;
    const hit = boardArrival(x, z, vx, vz, mid);
    if (!hit) {
      hi = mid;
      continue;
    }
    const ceil = hit.limit - 0.28;
    if (hit.y > ceil) hi = mid;
    else {
      best = mid;
      if (hit.y < glass) lo = mid;
      else hi = mid;
    }
  }
  return best;
}

function bankContactVy(x: number, z: number, vx: number, vz: number, vy: number): number {
  let px = x;
  let pz = z;
  let pvx = vx;
  let pvz = vz;
  for (let i = 0; i < 240; i++) {
    const damp = Math.exp(-0.35 / 60);
    pvx *= damp;
    pvz *= damp;
    const nx = px + pvx / 60;
    const nz = pz + pvz / 60;
    const hit = resolveRink(nx, nz, 0.09);
    if (hit.hit) {
      const t = (i + 1) / 60;
      const y = PUCK_Y + vy * t - 6 * t * t;
      const limit = wallTop(hit.nx, hit.nz, hit.x, hit.z) - 0.08;
      if (y <= limit) return vy;
      return Math.max(0.05, (limit - 0.12 - PUCK_Y + 6 * t * t) / Math.max(0.08, t));
    }
    px = nx;
    pz = nz;
    if (Math.hypot(pvx, pvz) < 0.8) break;
  }
  return vy;
}

function ejectFromCage(puck: Puck, prevX: number): void {
  if (world.whistle === "goal") return;
  for (const side of [1, -1] as const) {
    if (!inCageVolume(puck.x, puck.z, puck.y, side)) continue;
    const mouth = side * GOAL_LINE_X;
    const fromIce = side > 0 ? prevX < mouth : prevX > mouth;
    if (fromIce) continue;
    const back = mouth + side * Math.max(0.12, cageDepthAt(puck.z, puck.y));
    puck.x = back + side * 0.14;
    puck.vx = side * Math.abs(puck.vx) * 0.45;
  }
}

function segmentCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  rad: number,
): { t: number; x: number; y: number; nx: number; ny: number } | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-8) {
    const dist = Math.hypot(fx, fy);
    if (dist > rad || dist < 1e-6) return null;
    return { t: 0, x: x0, y: y0, nx: fx / dist, ny: fy / dist };
  }
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - rad * rad;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  const t = t1 >= 0 && t1 <= 1 ? t1 : t2 >= 0 && t2 <= 1 ? t2 : null;
  if (t === null) return null;
  const x = x0 + dx * t;
  const y = y0 + dy * t;
  return { t, x, y, nx: (x - cx) / rad, ny: (y - cy) / rad };
}

function drillCageSide(puck: Puck): 1 | -1 | 0 {
  const cage = resolveCage(puck.x, puck.z, 0.1);
  for (const side of [1, -1] as const) {
    const mouth = side * GOAL_LINE_X;
    const along = (puck.x - mouth) * side;
    const az = Math.abs(puck.z);
    const depth = Math.max(0.12, cageDepthAt(Math.min(az, GOAL_W / 2 - 0.001), 0));
    const near = az < GOAL_W / 2 + 0.35 && along > -0.35 && along < depth + 0.4;
    if (!near) continue;
    if (inCageVolume(puck.x, puck.z, puck.y, side)) return side;
    if (cage.hit && puck.y < GOAL_H + 0.35 && along > -0.25 && along < depth + 0.2) return side;
    if (
      puck.y > GOAL_H - 0.06 &&
      puck.y < GOAL_H + 0.55 &&
      along > -0.12 &&
      along < depth + 0.18 &&
      az < GOAL_W / 2 + 0.12
    ) {
      return side;
    }
    const shell = cageDepthAt(
      Math.min(az, GOAL_W / 2 - 0.001),
      Math.min(Math.max(puck.y, 0), GOAL_H),
    );
    if (
      shell > 0.04 &&
      puck.y < GOAL_H + 0.2 &&
      along > shell - 0.16 &&
      along < shell + 0.18 &&
      az < GOAL_W / 2 + 0.1
    ) {
      return side;
    }
  }
  return 0;
}

function drillAttackSide(): 1 | -1 {
  return world.homeAttack >= 0 ? 1 : -1;
}

function drillPuckInNet(puck: Puck): boolean {
  const side = drillAttackSide();
  const mouth = side * GOAL_LINE_X;
  const along = (puck.x - mouth) * side;
  if (along <= 0.015) return false;
  const hw = GOAL_W / 2;
  if (Math.abs(puck.z) > hw - 0.02) return false;
  if (puck.y > GOAL_H + 0.08 || puck.y < -0.02) return false;
  const depth = Math.max(
    0.08,
    cageDepthAt(Math.min(Math.abs(puck.z), hw - 0.001), Math.min(Math.max(puck.y, 0), GOAL_H)),
  );
  return along < depth + 0.05;
}

function drillMeshLodge(z: number, y: number): { x: number; y: number; z: number } {
  const side = drillAttackSide();
  const mouth = side * GOAL_LINE_X;
  const hw = GOAL_W / 2;
  const zz = Math.max(-(hw - 0.1), Math.min(hw - 0.1, z));
  const yy = Math.max(PUCK_Y, Math.min(GOAL_H - 0.08, y));
  const depth = Math.max(0.2, cageDepthAt(zz, Math.min(yy, GOAL_H)));
  const along = Math.max(0.12, depth - 0.03);
  return { x: mouth + side * along, y: yy, z: zz };
}

function drillTopShelfPin(): { x: number; y: number; z: number } {
  const y = Math.min(mouthTopY() - 0.02, GOAL_H * 0.8);
  return drillMeshLodge(0, y);
}

function noteDrillWin(puck?: Puck): void {
  const scored = puck ?? world.puck;
  drillWinPuck = scored;
  drillWinAt = world.time;
  drillWinKicked = false;
  drillWinLodged = false;
  drillEncoreLive = false;
  drillEncoreShots = 0;
  drillPuckFrozen = false;
  drillPin = null;
  drillPuckLive = false;
  world.drillShot = false;
  if (scored !== world.puck) {
    drillWinLodged = true;
    const pin = drillMeshLodge(scored.z, scored.y);
    drillWinPin = pin;
    drillPin = pin;
    scored.x = pin.x;
    scored.y = pin.y;
    scored.z = pin.z;
    scored.vx = 0;
    scored.vy = 0;
    scored.vz = 0;
    scored.owner = null;
    return;
  }
  if (!drillPuckInNet(scored)) drillWinKicked = true;
}

function holdDrillPin(): void {
  if (!drillPin) return;
  const puck = world.puck;
  puck.owner = null;
  puck.x = drillPin.x;
  puck.y = drillPin.y;
  puck.z = drillPin.z;
  puck.vx = 0;
  puck.vy = 0;
  puck.vz = 0;
}

function stepDrillWinPuck(): void {
  if (!world.drillWon || drillWinLodged || drillWinKicked || drillPuckFrozen || drillEncoreLive) return;
  const puck = drillWinPuck;
  if (!puck || puck !== world.puck) return;
  const side = drillAttackSide();
  const mouth = side * GOAL_LINE_X;
  const along = (puck.x - mouth) * side;
  const sp = Math.hypot(puck.vx, puck.vz);
  const kicked = along < -0.45 || (along <= 0.015 && sp > 0.55);
  if (kicked) {
    drillWinKicked = true;
    return;
  }
  const age = world.time - drillWinAt;
  if (age < 0.45 && sp > 0.15) return;
  if (along <= 0.015 && sp > 0.35) {
    drillWinKicked = true;
    return;
  }
  drillWinLodged = true;
  drillPuckFrozen = true;
  const pin = drillMeshLodge(puck.z, puck.y);
  drillPin = pin;
  puck.owner = null;
  puck.x = pin.x;
  puck.y = pin.y;
  puck.z = pin.z;
  puck.vx = 0;
  puck.vy = 0;
  puck.vz = 0;
}

function settleDrillEncore(): void {
  if (!drillEncoreLive || drillPuckFrozen) return;
  const side = drillAttackSide();
  const mouth = side * GOAL_LINE_X;
  const arrived = (world.puck.x - mouth) * side > -0.4 || world.time - drillEncoreAt > 0.9;
  if (!arrived) return;
  const pin = drillTopShelfPin();
  drillPin = pin;
  drillPuckFrozen = true;
  drillEncoreLive = false;
  drillPuckLive = false;
  world.drillShot = false;
  world.puck.owner = null;
  world.puck.x = pin.x;
  world.puck.y = pin.y;
  world.puck.z = pin.z;
  world.puck.vx = 0;
  world.puck.vy = 0;
  world.puck.vz = 0;
}

function drillUserEncore(s: Skater): boolean {
  if (s.id !== world.userId || s.kind === "goalie") return false;
  if (!world.drillWon || drillPuckFrozen || drillEncoreLive || drillEncoreShots >= 1) return false;
  if (drillWinKicked && !drillWinLodged) return true;
  return drillWinLodged && drillWinPuck !== world.puck && world.puck.owner === s.id;
}

function releaseDrillNetPuck(puck: Puck): void {
  if (useGame.getState().clockMode !== "drill" || world.drillWon || !world.periodOver) return;
  const side = drillCageSide(puck);
  if (!side) return;
  const mouth = side * GOAL_LINE_X;
  puck.owner = null;
  puck.x = mouth - side * 2.5;
  puck.z = Math.max(-0.55, Math.min(0.55, puck.z));
  puck.y = PUCK_Y;
  puck.vx = 0;
  puck.vz = 0;
  puck.vy = 0;
}

function noteDrillPipe(): void {
  if (steppingGhost || !world.drillShot) return;
  if (useGame.getState().clockMode !== "drill") return;
  drillPipeHit = true;
}

function rollIronFate(): "in" | "back" | "out" {
  const r = Math.random();
  if (r < 0.58) return "in";
  if (r < 0.79) return "back";
  return "out";
}

function applyShotIron(
  puck: Puck,
  side: 1 | -1,
  kind: "post" | "bar",
  zHit: number,
  yHit: number,
): void {
  shotIron = null;
  const fate = rollIronFate();
  if (useGame.getState().clockMode === "drill") {
    ironResolved = fate;
    noteDrillPipe();
  }
  const mouth = side * GOAL_LINE_X;
  const hw = GOAL_W / 2;
  const sp = Math.hypot(puck.vx, puck.vz) || 1;
  if (fate === "back") {
    const back = Math.max(5.2, Math.min(16, sp * 0.62));
    puck.x = mouth - side * 0.22;
    puck.z = kind === "post" ? zHit : Math.max(-hw + 0.08, Math.min(hw - 0.08, zHit));
    puck.y = kind === "bar" ? GOAL_H + 0.02 : Math.max(PUCK_Y, Math.min(yHit, GOAL_H - 0.08));
    puck.vx = (-puck.vx / sp) * back;
    puck.vz = (-puck.vz / sp) * back;
    puck.vy = kind === "bar" ? Math.max(0.15, -Math.min(0, puck.vy) * 0.08) : Math.max(0, puck.vy * 0.04);
    return;
  }
  if (fate === "out") {
    if (kind === "bar") {
      puck.x = mouth - side * 0.1;
      puck.y = GOAL_H + CROSSBAR_R + PUCK_R + 0.1;
      puck.z = Math.max(-hw + 0.08, Math.min(hw - 0.08, zHit));
      puck.vy = Math.max(5.4, Math.min(9, Math.abs(puck.vy) * 0.2 + 5.6));
      puck.vx = -side * Math.max(1.4, Math.min(4, sp * 0.1));
      puck.vz *= 0.25;
      return;
    }
    const outward = Math.sign(zHit) || 1;
    puck.x = mouth - side * 0.16;
    puck.z = zHit + outward * 0.3;
    puck.y = Math.max(PUCK_Y, Math.min(yHit, GOAL_H - 0.1));
    puck.vz = outward * Math.max(6.4, Math.min(11, sp * 0.38));
    puck.vx = -side * Math.max(2.2, Math.min(6, sp * 0.16));
    puck.vy = Math.max(0.2, Math.min(1.4, Math.abs(puck.vy) * 0.12));
    return;
  }
  if (kind === "bar") {
    puck.x = mouth + side * 0.14;
    puck.y = GOAL_H - 0.12;
    puck.z = Math.max(-(hw - 0.16), Math.min(hw - 0.16, zHit));
    puck.vy = -1.35;
    puck.vx = side * Math.max(3.2, Math.abs(puck.vx) * 0.55);
    puck.vz *= 0.22;
    return;
  }
  const inward = -Math.sign(zHit) || 1;
  puck.x = mouth + side * 0.14;
  puck.z = zHit + inward * 0.2;
  puck.y = Math.max(PUCK_Y + 0.02, Math.min(yHit, GOAL_H - 0.12));
  puck.vx = side * Math.max(3.2, Math.abs(puck.vx) * 0.55);
  puck.vz = inward * 0.85;
  puck.vy = Math.min(puck.vy, 0.4);
}

function drillReboundNet(puck: Puck): void {
  if (useGame.getState().clockMode !== "drill" || puck.owner !== null) return;
  const soft = drillScoreSoft(puck);
  const x0 = puck.x;
  const y0 = puck.y;
  const z0 = puck.z;
  const vx0 = puck.vx;
  const vy0 = puck.vy;
  const vz0 = puck.vz;
  const hw = GOAL_W / 2;
  for (const side of [1, -1] as const) {
    const mouth = side * GOAL_LINE_X;
    if (Math.abs(puck.x - mouth) > 3.2) continue;
    const zAbs = Math.min(Math.abs(puck.z), hw - 0.001);
    const yMesh = Math.max(0, Math.min(puck.y, GOAL_H));
    const depth = cageDepthAt(zAbs, yMesh);
    const along = (puck.x - mouth) * side;
    if (
      depth > 0.04 &&
      Math.abs(puck.z) < hw + 0.05 &&
      puck.y < GOAL_H + 0.25 &&
      puck.y > -0.05 &&
      along > depth - 0.02
    ) {
      puck.x = mouth + side * Math.max(0.05, depth - 0.06);
      if (puck.vx * side > 0) {
        puck.vx = soft ? -side * Math.min(0.7, Math.abs(puck.vx) * 0.08) : -puck.vx * 0.62;
      }
      puck.vz *= soft ? 0.4 : 0.8;
    }
    const roof = cageDepthAt(zAbs, GOAL_H);
    if (
      along > 0.02 &&
      along < roof + 0.1 &&
      Math.abs(puck.z) < hw - 0.02 &&
      puck.y > GOAL_H - 0.02 &&
      puck.y < GOAL_H + 0.45
    ) {
      puck.y = GOAL_H - 0.05;
      if (puck.vy > 0) puck.vy = soft ? -Math.min(0.4, puck.vy * 0.08) : -puck.vy * 0.5;
    }
    for (const zPost of [hw, -hw]) {
      const dx = puck.x - mouth;
      const dz = puck.z - zPost;
      const dist = Math.hypot(dx, dz);
      const rad = 0.12;
      if (dist >= rad || dist < 1e-6 || puck.y > GOAL_H + 0.08 || puck.y < -0.02) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      puck.x = mouth + nx * rad;
      puck.z = zPost + nz * rad;
      const vn = puck.vx * nx + puck.vz * nz;
      if (vn < 0) {
        const k = soft ? 0.08 : 1.65;
        puck.vx -= k * vn * nx;
        puck.vz -= k * vn * nz;
      }
    }
  }
  if (puck.y > GOAL_H + 0.2) {
    if (soft) clampDrillScoreSpeed(puck);
    markDrillNetTouch(puck, x0, y0, z0, vx0, vy0, vz0);
    return;
  }
  if (!soft) {
    const cage = resolveCage(puck.x, puck.z, 0.09);
    if (cage.hit) {
      const vn = puck.vx * cage.nx + puck.vz * cage.nz;
      puck.x = cage.x;
      puck.z = cage.z;
      if (vn < 0) {
        puck.vx -= 1.55 * vn * cage.nx;
        puck.vz -= 1.55 * vn * cage.nz;
      }
    }
  }
  for (const side of [1, -1] as const) {
    const mouth = side * GOAL_LINE_X;
    if (Math.abs(puck.x - mouth) > 3.2) continue;
    const zAbs = Math.min(Math.abs(puck.z), hw - 0.001);
    const depth = cageDepthAt(zAbs, Math.max(0, Math.min(puck.y, GOAL_H)));
    const along = (puck.x - mouth) * side;
    if (depth <= 0.04 || Math.abs(puck.z) >= hw + 0.02 || along < depth - 0.03) continue;
    puck.x = mouth + side * (depth - 0.06);
    if (puck.vx * side > 0) {
      puck.vx = soft ? -side * Math.min(0.7, Math.abs(puck.vx) * 0.08) : -Math.abs(puck.vx) * 0.62;
    }
  }
  if (soft) clampDrillScoreSpeed(puck);
  markDrillNetTouch(puck, x0, y0, z0, vx0, vy0, vz0);
}

function markDrillNetTouch(
  puck: Puck,
  x0: number,
  y0: number,
  z0: number,
  vx0: number,
  vy0: number,
  vz0: number,
): void {
  if (steppingGhost || puck !== world.puck || !world.drillShot) return;
  if (puck.x === x0 && puck.y === y0 && puck.z === z0 && puck.vx === vx0 && puck.vy === vy0 && puck.vz === vz0) {
    return;
  }
  drillNetTouch = true;
}

function bouncePuckCage(puck: Puck, prevX: number, prevZ: number, prevY: number): void {
  const hw = GOAL_W / 2;
  const pr = 0.11;
  const soft = drillScoreSoft(puck);
  for (const side of [1, -1] as const) {
    if (world.whistle === "goal") {
      const scoring: 1 | -1 =
        world.goalSide === "home" ? world.homeAttack : ((-world.homeAttack) as 1 | -1);
      if (side !== scoring) continue;
    }
    const mouth = side * GOAL_LINE_X;
    if (Math.abs(puck.x - mouth) > 4.2 && Math.abs(prevX - mouth) > 4.2) continue;
    const depthNow = Math.max(0.08, cageDepthAt(puck.z, Math.min(puck.y, GOAL_H)));
    const back = mouth + side * depthNow;
    const iceDepth = Math.max(0.08, cageDepthAt(puck.z, 0));
    const along = (puck.x - mouth) * side;
    const prevAlong = (prevX - mouth) * side;
    const inFoot =
      along > -0.1 && along < iceDepth + 0.14 && Math.abs(puck.z) < hw + 0.12;

    for (const zPost of [hw, -hw]) {
      const prevDist = Math.hypot(prevX - mouth, prevZ - zPost);
      const shotHere = !world.whistle && shotAtThisNet(side);
      const swept = shotHere ? segmentCircle(prevX, prevZ, puck.x, puck.z, mouth, zPost, pr) : null;
      const dx = puck.x - mouth;
      const dz = puck.z - zPost;
      const dist = Math.hypot(dx, dz);
      const yHit = swept ? prevY + (puck.y - prevY) * swept.t : puck.y;
      const endpoint = dist < pr && dist > 1e-6 && puck.y < GOAL_H + 0.08;
      const sweptHit = !!swept && yHit <= GOAL_H + 0.08 && yHit >= -0.02;
      if (!endpoint && !sweptHit) continue;
      if (world.goalieShot === "out" && goalieShotSide(side)) {
        kickGoalieMiss(puck, side, zPost, false);
        return;
      }
      const goingIn = (puck.x - prevX) * side > 0 && puck.vx * side > 0.2;
      if (
        !steppingGhost &&
        sweptHit &&
        prevDist > pr &&
        goingIn &&
        yHit < GOAL_H + 0.02 &&
        !cornerSnipeLive() &&
        shotHere
      ) {
        applyShotIron(puck, side, "post", zPost, Math.max(PUCK_Y, Math.min(yHit, GOAL_H - 0.08)));
        return;
      }
      noteDrillPipe();
      if (!endpoint || dist < 1e-6) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const legacyIn = Math.sign(puck.vx) === side && puck.y < GOAL_H - 0.05;
      const insideEdge = Math.abs(puck.z) <= hw + 0.02;
      const farPost =
        world.lastShotCornerSide !== 0 && Math.sign(zPost) !== Math.sign(world.lastShotCornerSide);
      const snipeNear = cornerSnipeLive() && !farPost;
      const towardOpening =
        (cornerSnipeLive() && farPost) ||
        (!snipeNear && (-Math.sign(zPost) * puck.vz > 0.12 || insideEdge));
      if (legacyIn && towardOpening && world.whistle !== "offside") {
        const inward = -Math.sign(zPost) || 1;
        puck.z = zPost + inward * 0.1;
        puck.x = mouth + side * 0.1;
        if (soft) {
          puck.vx *= 0.08;
          puck.vz *= 0.2;
          puck.vy *= 0.4;
        } else {
          puck.vx = side * Math.max(3.4, Math.abs(puck.vx) * 0.72);
          puck.vz = inward * Math.max(0.8, Math.abs(puck.vz) * 0.25);
          puck.vy *= 0.4;
        }
      } else {
        puck.x = mouth + nx * pr;
        puck.z = zPost + nz * pr;
        const b = bounce(puck.vx, puck.vz, -nx, -nz, soft ? 0.08 : 0.55);
        puck.vx = b.vx;
        puck.vz = b.vz;
      }
    }

    const nearNet = Math.abs(along) < 2.6 || Math.abs(prevAlong) < 2.6;
    const zGate = Math.abs(puck.z) <= hw + 0.12 || Math.abs(prevZ) <= hw + 0.12;
    const yGate = puck.y <= GOAL_H + 0.08 || prevY <= GOAL_H + 0.08;
    if (
      nearNet &&
      zGate &&
      yGate &&
      (prevAlong - depthNow) * (along - depthNow) <= 0 &&
      prevX !== puck.x
    ) {
      const fromBehind = prevAlong > depthNow;
      if (fromBehind) {
        puck.x = back + side * 0.14;
        const b = bounce(puck.vx, puck.vz, side, 0, soft ? 0.08 : 0.42);
        puck.vx = b.vx;
        puck.vz = b.vz;
      } else if (puck.y < GOAL_H - 0.02) {
        puck.x = back - side * 0.1;
        const b = bounce(puck.vx, puck.vz, -side, 0, soft ? 0.08 : 0.35);
        puck.vx = b.vx;
        puck.vz = b.vz;
      }
    }

    for (const zWall of [hw, -hw] as const) {
      const xIn = inFoot || (prevAlong > -0.1 && prevAlong < iceDepth + 0.14);
      if (!xIn) continue;
      if (puck.y > GOAL_H + 0.08 && prevY > GOAL_H + 0.08) continue;
      if ((prevZ - zWall) * (puck.z - zWall) > 0 || prevZ === puck.z) continue;
      const fromOut = Math.abs(prevZ) > hw;
      const nz = Math.sign(zWall) || 1;
      const nowInMouth = along > 0 && along < iceDepth && Math.abs(puck.z) <= hw && puck.y < GOAL_H;
      const goingIn = Math.sign(puck.vx) === side;
      const farSide =
        world.lastShotCornerSide !== 0 && puck.z * world.lastShotCornerSide <= 0.12;
      if (
        fromOut &&
        world.goalieShot === "out" &&
        goalieShotSide(side) &&
        (nowInMouth || (cornerSnipeLive() && goingIn && puck.y < GOAL_H && farSide))
      ) {
        kickGoalieMiss(puck, side, zWall, false);
        return;
      } else if (fromOut && (nowInMouth || (cornerSnipeLive() && goingIn && puck.y < GOAL_H && farSide))) {
        puck.z = zWall - nz * 0.1;
        if (!soft && puck.vx * side < 0.4) puck.vx = side * Math.max(2.2, Math.abs(puck.vx));
      } else if (fromOut) {
        puck.z = zWall + nz * 0.12;
        const b = bounce(puck.vx, puck.vz, 0, -nz, soft ? 0.08 : 0.5);
        puck.vx = b.vx;
        puck.vz = b.vz;
      } else {
        puck.z = zWall - nz * 0.1;
        const b = bounce(puck.vx, puck.vz, 0, nz, soft ? 0.08 : 0.4);
        puck.vx = b.vx;
        puck.vz = b.vz;
      }
    }

    if (world.whistle !== "goal" && !world.goalBank) {
      const barRad = CROSSBAR_R + PUCK_R;
      const barHit =
        Math.abs(puck.z) <= hw + barRad || Math.abs(prevZ) <= hw + barRad
          ? segmentCircle(prevX, prevY, puck.x, puck.y, mouth, GOAL_H, barRad)
          : null;
      const barZ = barHit ? prevZ + (puck.z - prevZ) * barHit.t : 0;
      if (barHit && Math.abs(barZ) <= hw + 0.02) {
        if (world.goalieShot === "out" && goalieShotSide(side)) {
          kickGoalieMiss(puck, side, barZ, true);
          return;
        }
        const goingIn = (puck.x - prevX) * side > 0;
        const prevBar = Math.hypot(prevX - mouth, prevY - GOAL_H);
        if (
          !steppingGhost &&
          prevBar > barRad &&
          goingIn &&
          puck.vx * side > 0.2 &&
          !world.whistle &&
          !cornerSnipeLive() &&
          shotAtThisNet(side)
        ) {
          applyShotIron(puck, side, "bar", barZ, GOAL_H);
          return;
        }
        noteDrillPipe();
        if (soft) {
          puck.vy = Math.min(0.4, Math.abs(puck.vy) * 0.1);
          puck.vx *= 0.15;
          puck.vz *= 0.5;
        } else if (barHit.ny < 0.08 && goingIn) {
          puck.x = mouth + side * 0.04;
          puck.y = Math.min(barHit.y, GOAL_H - barRad - 0.012);
          puck.z = barZ;
          if (puck.vy > -0.25) puck.vy = -0.65;
          if (puck.vx * side < 1.2) puck.vx = side * Math.max(2.4, Math.abs(puck.vx));
        } else {
          puck.x = mouth + side * 0.06;
          puck.y = GOAL_H + CROSSBAR_R + 0.1;
          puck.z = barZ;
          puck.vy = Math.max(4.2, Math.abs(puck.vy) * 0.3 + 3.2);
          puck.vx = side * Math.max(2.6, Math.abs(puck.vx) * 0.22);
          puck.vz *= 0.75;
        }
      } else if (
        !soft &&
        along > 0.02 &&
        along < depthNow + 0.05 &&
        Math.abs(puck.z) < hw &&
        puck.y > GOAL_H + 0.02 &&
        Math.hypot(puck.vx, puck.vz, puck.vy) < 1.35
      ) {
        puck.y = GOAL_H + 0.1;
        puck.vy = 2.8;
        puck.vx = -side * 3.2;
      }
    }

    if (!steppingGhost && shotIron && !world.whistle && shotAtThisNet(side) && prevX !== puck.x) {
      const crossedIn = (prevX - mouth) * side < 0 && (puck.x - mouth) * side >= 0;
      if (crossedIn) {
        const span = puck.x - prevX || 1;
        const t = (mouth - prevX) / span;
        const zAt = prevZ + (puck.z - prevZ) * t;
        const yAt = prevY + (puck.y - prevY) * t;
        if (shotIron.kind === "post") {
          const zPost = Math.sign(shotIron.z || 1) * hw;
          if (Math.abs(zAt - zPost) <= 0.55 && yAt <= GOAL_H + 0.12) {
            applyShotIron(puck, side, "post", zPost, Math.max(PUCK_Y, Math.min(yAt, GOAL_H - 0.1)));
            return;
          }
        } else if (Math.abs(zAt) <= hw + 0.08 && yAt >= GOAL_H - 0.4 && yAt <= GOAL_H + 0.45) {
          applyShotIron(puck, side, "bar", Math.max(-hw + 0.2, Math.min(hw - 0.2, zAt)), GOAL_H);
          return;
        }
        shotIron = null;
      }
    }

    if (world.whistle === "goal") {
      const meshD = Math.max(0.1, cageDepthAt(puck.z, Math.min(puck.y, GOAL_H - 0.05)));
      if (along > -0.4 && along < meshD + 1.2 && along > meshD - 0.05) {
        const deep = Math.abs(puck.z) > GOAL_W * 0.28 ? 0.34 : 0.5;
        puck.x = mouth + side * Math.max(0.12, meshD * deep);
        if (puck.vx * side > 0) puck.vx = -Math.abs(puck.vx) * 0.28;
        puck.vy = Math.min(puck.vy, 0.35);
      }
      if (along < 0.05 && along > -0.4 && Math.abs(puck.z) < hw) {
        puck.x = mouth + side * 0.14;
        if (puck.vx * side < 0) puck.vx = side * 0.6;
      }
      if (along > 0 && along < meshD + 1.2 && Math.abs(puck.z) > hw - 0.05) {
        puck.z = Math.sign(puck.z || 1) * (hw - 0.1);
        puck.vz *= -0.28;
      }
      if (along > 0 && along < meshD + 1.2 && Math.abs(puck.z) < hw && puck.y > GOAL_H - 0.07) {
        puck.y = GOAL_H - 0.14;
        puck.vy = Math.min(puck.vy, -0.55);
      }
      if (along > 0 && along < meshD + 1.6 && (along > meshD + 0.2 || puck.y > GOAL_H + 0.2)) {
        puck.x = mouth + side * Math.min(meshD * 0.72, Math.max(0.12, along * 0.85));
        puck.z = Math.max(-hw + 0.1, Math.min(hw - 0.1, puck.z));
        puck.y = Math.min(GOAL_H - 0.08, Math.max(PUCK_Y, puck.y));
        puck.vx *= -0.42;
        puck.vz *= 0.72;
        puck.vy *= 0.55;
      }
    }
  }
  if (soft) clampDrillScoreSpeed(puck);
}

function chooseCoverFaceoff(coverer: Skater | undefined): void {
  const puck = world.puck;
  let g = coverer && coverer.kind === "goalie" ? coverer : undefined;
  if (!g) {
    let best: Skater | undefined;
    let bestD = Infinity;
    for (const s of world.skaters) {
      if (s.kind !== "goalie") continue;
      const d = Math.hypot(s.x - puck.x, s.z - puck.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    g = best;
  }
  const byPuck =
    puck.x * defendDir("home") > 6 ? "home" : puck.x * defendDir("away") > 6 ? "away" : null;
  const defending: "home" | "away" =
    byPuck ?? g?.side ?? (puck.x * defendDir("home") > 0 ? "home" : "away");
  world.faceX = defendDir(defending) * FACEOFF_EZ_X;
  const z = Number.isFinite(world.coverSideZ) ? world.coverSideZ : puck.z;
  const CLEAR = 0.35;
  if (z > CLEAR) world.faceZ = FACEOFF_SPOT_Z;
  else if (z < -CLEAR) world.faceZ = -FACEOFF_SPOT_Z;
  else world.faceZ = z >= 0 ? FACEOFF_SPOT_Z : -FACEOFF_SPOT_Z;
}

function startStoppage(kind: "goal" | "cover" | "offside", net?: 1 | -1): void {
  clearDelayedOffside();
  if (world.stoppage) return;
  rimRide = null;
  boardRide = null;
  boardBank = null;
  const holderId = world.puck.owner;
  const scorerId = world.puck.owner ?? world.lastShooter;
  if (kind === "goal") recordReplay(true);
  world.stoppage = true;
  world.stoppageT = 0;
  world.whistle = kind;
  world.goalBank = null;
  const coverer = holderId !== null ? world.skaters[holderId] : undefined;
  const holder = holderId !== null ? world.skaters[holderId] : undefined;
  const keepCarrier =
    kind === "offside" &&
    holderId === world.userId &&
    !!holder &&
    holder.kind !== "goalie" &&
    holder.side === "home";
  world.offsideCarrier = keepCarrier && holderId !== null ? holderId : null;
  world.puck.owner = keepCarrier ? holderId : null;
  if (keepCarrier) world.coverT = 0;
  if (kind === "goal") {
    world.goalPuckT = 0.62;
  } else if (!keepCarrier) {
    world.puck.vx *= 0.15;
    world.puck.vz *= 0.15;
  }
  world.ref.pose = kind === "goal" ? "goal" : "cover";
  world.ref.poseT = 0;
  world.ref2.pose = kind === "goal" ? "goal" : "cover";
  world.ref2.poseT = 0;
  world.reboundN = 0;
  world.reboundSoft = false;
  const ui = useGame.getState();
  ui.setWhistle(world.whistle);
  ui.setHasPuck(keepCarrier);
  if (kind === "goal") {
    const homeScored = (net ?? (world.puck.x > 0 ? 1 : -1)) === world.homeAttack;
    if (homeScored) ui.setHomeScore(ui.homeScore + 1);
    else ui.setAwayScore(ui.awayScore + 1);
    world.goalSide = homeScored ? "home" : "away";
    world.goalTicker = 6.5;
    ui.setGoalSide(world.goalSide);
    if (ui.powerPlay || ui.chaos) {
      const scoredOn = homeScored ? "away" : "home";
      const ice = scoredOn === "home" ? ui.liveHome : ui.liveAway;
      const cap = ui.chaos ? CHAOS_CAP : LINEUP_CAP;
      if (lineupTotal(ice) < cap) {
        world.ppRelease = scoredOn;
        world.ppChaos = ui.chaos;
      }
    }
    world.faceX = 0;
    world.faceZ = 0;
    const netX = (homeScored ? world.homeAttack : -world.homeAttack) * GOAL_LINE_X;
    world.ref.yaw = Math.atan2(-(netX - world.ref.x), -(0 - world.ref.z));
    world.ref2.yaw = Math.atan2(-(netX - world.ref2.x), -(0 - world.ref2.z));
    const want: "home" | "away" = homeScored ? "home" : "away";
    let scorer = scorerId !== null ? world.skaters[scorerId] : undefined;
    if (!scorer || scorer.side !== want) {
      scorer = world.skaters
        .filter((s) => s.side === want && s.kind !== "goalie")
        .sort(
          (a, b) =>
            Math.hypot(a.x - world.puck.x, a.z - world.puck.z) -
            Math.hypot(b.x - world.puck.x, b.z - world.puck.z),
        )[0];
    }
    if (scorer) {
      world.lastShooter = scorer.id;
      let i = 0;
      for (const s of world.skaters) {
        if (s.side !== scorer.side || s.kind === "goalie") continue;
        s.celebrate = [1.05, 1.55, 2.1, 2.65, 3.4][(s.id + i * 2) % 5]!;
        i++;
      }
      if (scorer.kind === "goalie") {
        scorer.celebrate = 3.4;
        scorer.coverPose = 0;
        scorer.poke = 0;
        scorer.windup = 0;
        scorer.follow = 0;
        scorer.hit = 0;
        scorer.dive = 0;
      }
    }
    maybeStickRage(homeScored);
    if (scorer) {
      const anchor = scorer.kind === "goalie" ? skaterCheerLead(scorer.side) : scorer;
      assignGoalCheer(scorer.side, anchor?.id ?? scorer.id);
    }
    beginJumboReplay();
  } else if (kind === "cover") {
    if (coverer?.kind === "goalie") coverer.coverPose = 1;
    chooseCoverFaceoff(coverer);
  }
}

function onGloveSave(g: Skater, puckY: number, puckZ: number): boolean {
  const home = g.side === "home";
  const scale = home ? 1.22 : 0.88;
  const catcherDir = attackDir(g.side) > 0 ? -1 : 1;
  const gloveZ = catcherDir * 0.5 * scale;
  const gloveR = home ? 0.2 : 0.12;
  return Math.abs(puckZ - g.z - gloveZ) <= gloveR && puckY > 0.54 && puckY < (home ? 1.16 : 0.98);
}

function applyGoalieSave(g: Skater, puck: Puck, reboundChance: number, _outX: number, glove = false): void {
  const prevX = puck.x;
  const prevZ = puck.z;
  world.goalieSaveT = world.time;
  world.goalieShot = null;
  g.follow = 0;
  g.windup = 0;
  g.poke = 0.34;
  if (g.side === "home") reboundChance = Math.max(reboundChance, userIdle() ? 0.86 : 0.64);
  if (Math.random() < reboundChance) {
    const out = attackDir(g.side);
    const slot = g.z === 0 ? (Math.random() < 0.5 ? 1 : -1) : -Math.sign(g.z);
    const oneT = world.lastShotOneTimer;
    const juicy =
      oneT ||
      world.reboundN >= 1 ||
      (g.side === "away" ? Math.random() < 0.72 : Math.random() < 0.38);
    puck.owner = null;
    world.coverT = 0;
    world.reboundN += 1;
    world.lastShotCorner = false;
    world.lastShotCornerSide = 0;
    const roll = Math.random();
    let kind: "muffled" | "long" | "juicy" = "juicy";
    if (juicy && (oneT || world.reboundN >= 2)) kind = roll < 0.2 ? "muffled" : roll < 0.52 ? "long" : "juicy";
    else if (juicy) kind = roll < 0.3 ? "muffled" : roll < 0.62 ? "long" : "juicy";
    else kind = roll < 0.58 ? "muffled" : "long";
    world.reboundSoft = kind === "muffled";
    g.coverPose = Math.max(g.coverPose, kind === "juicy" ? 0.72 : kind === "muffled" ? 0.58 : 0.4);
    g.stun = Math.max(g.stun, kind === "juicy" ? 0.42 : kind === "muffled" ? 0.2 : 0.28);
    g.lPad = Math.max(g.lPad, kind === "muffled" ? 0.62 : 0.48);
    g.rPad = Math.max(g.rPad, kind === "muffled" ? 0.62 : 0.48);
    const hitX = puck.x;
    const hitZ = puck.z;
    puck.x = hitX + out * 0.22;
    puck.z = hitZ;
    if (kind === "muffled") {
      puck.y = PUCK_Y + 0.02 + Math.random() * 0.06;
      puck.vy = 0.08 + Math.random() * 0.28;
      puck.vx = out * (0.28 + Math.random() * 0.7);
      puck.vz = (Math.random() - 0.5) * 0.7;
    } else if (kind === "long") {
      puck.y = Math.max(puck.y, 0.22 + Math.random() * 0.28);
      puck.vy = 0.9 + Math.random() * 1.3;
      puck.vx = out * (5.6 + Math.random() * 4.6);
      puck.vz = slot * (1.1 + Math.random() * 2.8);
    } else {
      const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
      const far = world.lastShotOneTimer && world.lastShotDist > 12.2;
      const clutter = shooter && world.lastShotOneTimer ? defendersInLane(shooter) : 0;
      const feed = far || clutter > 0;
      let mate: Skater | undefined;
      if (feed && shooter) {
        let best = 99;
        for (const s of world.skaters) {
          if (s.side !== shooter.side || s.kind === "goalie" || s.id === shooter.id) continue;
          if ((s.x - g.x) * out < 1.1) continue;
          const d = Math.hypot(s.x - g.x, s.z - g.z);
          if (d < best && d < 8) {
            best = d;
            mate = s;
          }
        }
      }
      puck.y = Math.max(puck.y, 0.38);
      if (mate) {
        const dx = mate.x - puck.x;
        const dz = mate.z - puck.z;
        const d = Math.hypot(dx, dz) || 1;
        puck.vy = 2.4 + Math.random() * 2.6;
        puck.vx = (dx / d) * (4.4 + Math.random() * 2.2) + out * 0.8;
        puck.vz = (dz / d) * (4.4 + Math.random() * 2.2);
      } else if (feed) {
        puck.vy = 2.8 + Math.random() * 2.8;
        puck.vx = out * (2.2 + Math.random() * 3.4);
        puck.vz = slot * (0.8 + Math.random() * 2.6);
      } else {
        puck.vy = 3.4 + Math.random() * 3.2;
        puck.vx = out * (0.8 + Math.random() * 2.4);
        puck.vz = slot * (0.6 + Math.random() * 2.2) + (Math.random() - 0.5) * 1.8;
      }
    }
  } else {
    world.reboundN = 0;
    world.reboundSoft = false;
    puck.owner = g.id;
    puck.vx = 0;
    puck.vz = 0;
    puck.vy = 0;
    world.coverT = 0;
    world.coverSideZ = puck.z;
    if (glove) {
      g.gloveFlash = 1.18;
      g.coverPose = 0;
      const gp = goalieGlovePuck(g);
      puck.x = gp.x;
      puck.z = gp.z;
      puck.y = gp.y;
    } else {
      puck.x = stickBlade(g).x;
      puck.z = stickBlade(g).z;
      puck.y = PUCK_Y;
      g.coverPose = Math.max(g.coverPose, 0.55);
    }
  }
  if (Math.hypot(puck.x - prevX, puck.z - prevZ) > 6.5) {
    puck.x = prevX;
    puck.z = prevZ;
    puck.owner = null;
  }
}

function tryGoalieCatch(puck: Puck): boolean {
  if (puck.owner !== null) return false;
  const spd = Math.hypot(puck.vx, puck.vz);
  if (spd < 2.4 || puck.y > GOAL_H + 0.06) return false;
  for (const g of world.skaters) {
    if (g.kind !== "goalie") continue;
    if (g.side !== "home") continue;
    if (world.lastPasser === g.id && world.time - world.lastPass < 1.05) continue;
    const towardNet = puck.vx * defendDir(g.side) > 1.2;
    if (!towardNet) continue;
    const dNow = Math.hypot(g.x - puck.x, g.z - puck.z);
    const tHit = Math.abs(puck.vx) > 0.25 ? (g.x - puck.x) / puck.vx : 99;
    const zAt = puck.z + puck.vz * Math.max(0, Math.min(0.4, tHit));
    const yAt =
      puck.y + puck.vy * Math.max(0, Math.min(0.4, tHit)) - 6 * Math.max(0, Math.min(0.4, tHit)) ** 2;
    const catcherZ = g.z + (attackDir(g.side) > 0 ? -0.42 : 0.42);
    const onGlove = Math.abs(zAt - catcherZ) < 0.24 && yAt > 0.52 && yAt < 1.2;
    const closeNow = dNow < 0.95 && puck.y < GOAL_H && onGlove;
    const intercept =
      tHit >= -0.02 && tHit <= 0.36 && onGlove && Math.abs(g.x - puck.x) < 1.35;
    if (!closeNow && !intercept) continue;
    const inZone = puck.x * defendDir(g.side) > BLUE_X - 3;
    if (!inZone && !closeNow) continue;
    if (userIdle() && Math.random() < 0.55) return false;
    applyGoalieSave(g, puck, userIdle() ? 0.72 : 0.42, g.x + attackDir(g.side) * 0.5, true);
    return true;
  }
  return false;
}

function equipmentCovers(g: Skater, puckY: number, puckZ: number): boolean {
  const home = g.side === "home";
  const scale = home ? 1.22 : 0.88;
  const blockerDir = attackDir(g.side) > 0 ? 1 : -1;
  const catcherDir = -blockerDir;
  const dz = puckZ - g.z;

  const padReach = 0.36 * scale;
  const padHalf = 0.15 * scale;
  const padTop = 0.5 * scale;
  const leftPad = Math.abs(dz - catcherDir * padReach) <= padHalf && puckY <= padTop;
  const rightPad = Math.abs(dz - blockerDir * padReach) <= padHalf && puckY <= padTop;

  const fiveHole = Math.abs(dz) <= (home ? 0.22 : 0.18) && puckY <= (home ? 0.34 : 0.28);

  const onGlove = onGloveSave(g, puckY, puckZ);

  const blockerZ = blockerDir * 0.42 * scale;
  const onBlocker =
    Math.abs(dz - blockerZ) <= (home ? 0.15 : 0.1) && puckY > 0.2 && puckY < (home ? 0.7 : 0.58);

  return leftPad || rightPad || fiveHole || onGlove || onBlocker;
}

function equipmentHits(g: Skater, x: number, y: number, z: number): boolean {
  if (Math.abs(x - g.x) > 0.62) return false;
  if (Math.abs(x - g.x) < 0.36 && Math.abs(z - g.z) < 0.3 && y < 1.28 && y > 0.05) return true;
  const blade = stickBlade(g);
  if (Math.hypot(x - blade.x, z - blade.z) < 0.22 && y < 0.55) return true;
  return equipmentCovers(g, y, z);
}

function cpuSaveMiss(g: Skater, y: number, z: number): boolean {
  const n = world.reboundN;
  if (g.side === "home") {
    const idle = userIdle();
    if (n < 1 && !idle) return false;
    let miss = n < 1 ? 0.14 : n === 1 ? 0.26 : Math.min(0.74, 0.26 + (n - 1) * 0.24);
    if (idle) miss += 0.12 + Math.min(0.28, (world.time - world.lastUserActT - 1.6) * 0.05);
    const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
    if (shooter?.side === "away" && rushCounts("away").defenders === 0) {
      miss += n >= 2 ? 0.42 : 0.28;
    }
    if (whiffHot() && shooter?.side === "away") miss += 0.36;
    if (Math.abs(z - g.z) > 0.45) miss += 0.08;
    if (y > 0.88) miss += 0.07;
    return Math.random() < miss;
  }
  const body = Math.abs(z - g.z) < 0.4 && y < 0.75;
  if (body && n < 1) return false;
  let miss = 0.08;
  if (world.lastShotSlap) {
    if (world.lastShotDist > GOAL_LINE_X - BLUE_X + 0.4) miss -= 0.2;
    else miss += 0.08;
  }
  if (world.lastShotOneTimer) {
    const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
    const rush = shooter ? rushCounts(shooter.side) : { attackers: 0, defenders: 1 };
    if (rush.defenders === 0 && rush.attackers >= 2) miss += 0.82;
    else if (world.lastShotDist > 12.2 || (shooter && defendersInLane(shooter) > 0)) miss += 0.02;
    else if (world.lastOneTimerDanger > 0.22) miss += 0.03 + world.lastOneTimerDanger * 0.22;
    else miss += 0.012;
  }
  if (world.lastShotRedirect) miss += 0.16;
  if (Math.abs(z) > 0.62) miss += 0.18;
  if (y > 0.88) miss += 0.12;
  if (world.wrapBehind) miss += 0.2;
  if (n >= 1) miss += n === 1 ? 0.22 : Math.min(0.64, 0.22 + (n - 1) * 0.2);
  if (body) miss *= 0.45;
  miss *= 1.55 - cpuMul("g");
  return Math.random() < miss;
}

function tryGoalieSweep(puck: Puck, prevX: number, prevZ: number, prevY: number): boolean {
  if (puck.owner !== null || world.whistle === "goal") return false;
  const spd = Math.hypot(puck.vx, puck.vz);
  if (spd < 1.4) return false;
  for (const g of world.skaters) {
    if (g.kind !== "goalie") continue;
    if (world.lastPasser === g.id && world.time - world.lastPass < 1.05) continue;
    const dx = puck.x - prevX;
    const dz = puck.z - prevZ;
    const len2 = dx * dx + dz * dz;
    let t = 0;
    if (len2 > 1e-8) {
      t = Math.max(0, Math.min(1, ((g.x - prevX) * dx + (g.z - prevZ) * dz) / len2));
    }
    const cx = prevX + dx * t;
    const cz = prevZ + dz * t;
    if (Math.hypot(cx - g.x, cz - g.z) > 1.12) continue;
    const n = Math.max(6, Math.min(16, Math.ceil(spd * 0.4)));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = prevX + (puck.x - prevX) * u;
      const z = prevZ + (puck.z - prevZ) * u;
      const y = prevY + (puck.y - prevY) * u;
      if (!equipmentHits(g, x, y, z)) continue;
      if (cpuSaveMiss(g, y, z)) continue;
      const out = attackDir(g.side);
      let reboundChance = g.side === "home" ? 0.22 : 0.9;
      if (world.lastShotOneTimer) {
        const sh = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
        const far = world.lastShotDist > 12.2;
        const clutter = sh ? defendersInLane(sh) > 0 : false;
        reboundChance = far || clutter ? 0.98 : Math.max(reboundChance, g.side === "away" ? 0.96 : 0.78);
      }
      applyGoalieSave(g, puck, reboundChance, g.x + out * 0.65, onGloveSave(g, y, z));
      return true;
    }
  }
  return false;
}

function trySave(puck: Puck, prevX: number, prevZ: number, prevY: number): boolean {
  for (const side of [1, -1] as const) {
    const mouth = side * GOAL_LINE_X;
    const crossed =
      (prevX - mouth) * (puck.x - mouth) <= 0 && Math.abs(puck.vx) > 0.4 && Math.sign(puck.vx) === side;
    if (!crossed) continue;
    if (puck.y > GOAL_H - 0.05 || Math.abs(puck.z) > GOAL_W / 2 - 0.04) continue;
    const g = defendingGoalie(side);
    if (!g) continue;
    if (world.lastPasser === g.id && world.time - world.lastPass < 1.05) return false;

    const span = puck.x - prevX;
    const t = Math.abs(span) < 1e-6 ? 1 : Math.max(0, Math.min(1, (mouth - prevX) / span));
    const zAt = prevZ + (puck.z - prevZ) * t;
    const yAt = prevY + (puck.y - prevY) * t;
    const xAt = mouth;
    const hit = equipmentHits(g, g.x, yAt, zAt) || equipmentHits(g, xAt, yAt, zAt);
    if (world.goalieShot === null && shotFromOutsideOz() && shotAtThisNet(side)) {
      if (Math.random() < 0.98) {
        applyGoalieSave(
          g,
          puck,
          g.side === "home" ? 0.22 : 0.9,
          mouth - side * (0.55 + Math.random() * 0.4),
          onGloveSave(g, yAt, zAt),
        );
        return true;
      }
      return false;
    }
    if (!hit) return false;
    const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
    const rush = shooter ? rushCounts(shooter.side) : { attackers: 0, defenders: 1 };
    const oddMan = world.lastShotOneTimer && rush.defenders === 0 && rush.attackers >= 2;
    const farOt = world.lastShotOneTimer && world.lastShotDist > 12.2;
    const clutterOt = !!(world.lastShotOneTimer && shooter && defendersInLane(shooter) > 0);
    if (oddMan && g.side === "away" && Math.random() < 0.92) return false;
    if (
      g.side === "home" &&
      shooter?.side === "away" &&
      world.reboundN >= 1 &&
      rush.defenders === 0
    ) {
      if (Math.random() < (world.reboundN >= 2 ? 0.58 : 0.3)) return false;
    }
    if (
      world.lastShotOneTimer &&
      !farOt &&
      !clutterOt &&
      world.lastOneTimerDanger > 0.48 &&
      Math.abs(zAt - g.z) > 0.38 &&
      Math.random() < world.lastOneTimerDanger * 0.32
    ) {
      return false;
    }
    if (g.side === "home" && whiffHot() && shooter?.side === "away" && Math.random() < 0.4) return false;
    if (cpuSaveMiss(g, yAt, zAt)) return false;
    let reboundChance = g.side === "home" ? 0.22 : 0.9;
    if (world.lastShotOneTimer) {
      if (farOt || clutterOt) reboundChance = 0.98;
      else reboundChance = Math.max(reboundChance, g.side === "away" ? 0.96 : 0.78);
    }
    applyGoalieSave(g, puck, reboundChance, mouth - side * (0.55 + Math.random() * 0.4), onGloveSave(g, yAt, zAt));
    return true;
  }
  return false;
}

function maybeRedirect(puck: Puck): void {
  if (!world.lastShotSlap || world.lastShotRedirect) return;
  if (world.time - world.lastShoot > 0.7) return;
  const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : null;
  if (!shooter) return;
  const attack = attackDir(shooter.side);
  const netX = attack * GOAL_LINE_X;
  const distMouth = (netX - puck.x) * attack;
  if (distMouth < 0.6 || distMouth > 8) return;
  for (const s of world.skaters) {
    if (s.side !== shooter.side || s.kind === "goalie" || s.id === shooter.id) continue;
    const inSlot = (netX - s.x) * attack > 0.4 && (netX - s.x) * attack < 5.2 && Math.abs(s.z) < 2.6;
    if (!inSlot) continue;
    const blade = stickBlade(s);
    const dx = blade.x - puck.x;
    const dz = blade.z - puck.z;
    const along = dx * puck.vx + dz * puck.vz;
    if (along < 0) continue;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.55) continue;
    const g = world.skaters.find((p) => p.kind === "goalie" && p.side !== shooter.side);
    const open = g ? -Math.sign(g.z || puck.z || 1) : Math.sign(Math.random() - 0.5);
    const spd = Math.hypot(puck.vx, puck.vz);
    const nd = Math.hypot(netX - puck.x, open * 0.7 - puck.z) || 1;
    puck.vx = ((netX - puck.x) / nd) * spd * 0.92;
    puck.vz = ((open * 0.72 - puck.z) / nd) * spd * 0.92;
    puck.vy = 0.35;
    world.lastShotRedirect = true;
    noteAttackerTouch(s);
    return;
  }
}

function placeDrillBoxRef(r: Referee): void {
  r.x = 2.6 / 2 + 0.05;
  r.z = RINK_W / 2 + 1.55 - 0.32;
  r.vx = 0;
  r.vz = 0;
  r.yaw = 0;
  r.pose = "idle";
  r.poseT = 0;
  r.struck = 0;
  r.tumble = 0;
}

function placeDrillIceRef(r: Referee): void {
  r.x = -3.6;
  r.z = -REF_BOARD_Z;
  r.vx = 0;
  r.vz = 0;
  r.yaw = Math.PI;
  r.pose = "idle";
  r.poseT = 0;
  r.struck = 0;
  r.tumble = 0;
}

function drillDropLive(): boolean {
  return useGame.getState().clockMode === "drill" && world.faceoff && world.faceoffPhase !== "live";
}

function beginDrillDrop(): void {
  world.faceX = 0;
  world.faceZ = 0;
  world.faceoff = true;
  world.faceoffT = 0;
  world.faceoffA = false;
  world.faceoffPhase = "hold";
  world.faceoffFakes = 0;
  world.faceoffAimX = 0;
  world.faceoffAimY = 0;
  const r = world.ref2;
  r.x = world.faceX;
  r.z = world.faceZ - REF_STAND;
  r.yaw = 0;
  r.pose = "drop";
  r.poseT = 0;
  r.handY = 1.38;
  r.vx = 0;
  r.vz = 0;
  r.struck = 0;
  r.tumble = 0;
  refStayPut.delete(r);
  placeDrillBoxRef(world.ref);
  world.puck.x = world.faceX;
  world.puck.z = world.faceZ;
  world.puck.y = r.handY;
  world.puck.owner = null;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  useGame.getState().setHasPuck(false);
}

function stepDrillDrop(dt: number): void {
  world.faceoffT += dt;
  const user = world.skaters[world.userId];
  if (user) lockDot(user, defendDir("home") * 1.15, 0, faceYaw("home"));
  const r = world.ref2;
  r.pose = "drop";
  r.poseT += dt;
  r.vx = 0;
  r.vz = 0;
  r.x = world.faceX;
  r.z = world.faceZ - REF_STAND;
  r.yaw = 0;
  if (world.faceoffPhase === "hold") {
    r.handY = 1.38;
    if (world.faceoffT > HOLD_T) {
      world.faceoffPhase = "lower";
      world.faceoffT = 0;
    }
  } else if (world.faceoffPhase === "lower") {
    const k = Math.min(1, world.faceoffT / LOWER_T);
    const e = k * k;
    r.handY = 1.38 + (PUCK_Y - 1.38) * e;
    if (world.faceoffT > LOWER_T) {
      world.faceoff = false;
      world.faceoffPhase = "live";
      world.faceoffT = 0;
      r.pose = "idle";
      r.handY = 1.38;
      giveUserPuck();
      return;
    }
  } else {
    world.faceoff = false;
    world.faceoffPhase = "live";
    world.faceoffT = 0;
    r.pose = "idle";
    giveUserPuck();
    return;
  }
  world.puck.x = world.faceX;
  world.puck.z = world.faceZ;
  world.puck.y = r.handY;
  world.puck.owner = null;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
}

function stepDrillRefs(dt: number): void {
  if (drillDropLive()) return;
  placeDrillBoxRef(world.ref);
  const r = world.ref2;
  r.poseT += dt;
  if (r.struck > 0) {
    r.struck = Math.max(0, r.struck - dt);
    r.vx *= Math.exp(-3.2 * dt);
    r.vz *= Math.exp(-3.2 * dt);
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    if (!(world.drillWon && world.goalTicker > 0)) {
      const lim = BLUE_X - 0.45;
      r.x = Math.max(-lim, Math.min(lim, r.x));
    }
    collideRefIce(r);
    return;
  }
  if (refBackInPlay()) refStayPut.delete(r);
  r.vx = 0;
  r.vz = 0;
  if (world.drillWon && world.goalTicker > 0) {
    const netX = world.homeAttack * GOAL_LINE_X;
    if (refStayPut.has(r)) {
      holdCheckedRef(r, netX, dt);
      return;
    }
    const k = Math.min(1, 3.6 * dt);
    r.x += (world.homeAttack * FACEOFF_EZ_X - r.x) * k;
    r.z += (-FACEOFF_SPOT_Z - r.z) * k;
    r.yaw = turnToward(r.yaw, netX - r.x, -r.z, 10, dt);
    r.pose = "goal";
    return;
  }
  const standX = -3.6;
  const standZ = -REF_BOARD_Z;
  let tx = standX;
  let tz = standZ;
  const user = world.skaters[world.userId];
  if (user) {
    const onSpot = Math.hypot(user.x - standX, user.z - standZ) < 1.7;
    const onRef = Math.hypot(user.x - r.x, user.z - r.z) < 1.55;
    if (onSpot || onRef) {
      const sign = user.x >= standX ? -1 : 1;
      const lo = -BLUE_X + 0.65;
      const hi = BLUE_X - 0.65;
      tx = Math.max(lo, Math.min(hi, standX + sign * 2.4));
      const alt = Math.max(lo, Math.min(hi, standX - sign * 2.4));
      if (Math.hypot(user.x - alt, user.z - standZ) > Math.hypot(user.x - tx, user.z - standZ)) tx = alt;
      if (Math.hypot(user.x - tx, user.z - standZ) < 1.35) tz = standZ + 1.5;
    }
  }
  const k = Math.min(1, 3.2 * dt);
  r.x += (tx - r.x) * k;
  r.z += (tz - r.z) * k;
  r.yaw = turnToward(r.yaw, 0, 1, 5, dt);
  r.pose = "idle";
}

function stepOneRef(r: Referee, lane: 1 | -1, dt: number): void {
  r.poseT += dt;
  if (r.struck > 0) {
    r.struck = Math.max(0, r.struck - dt);
    r.vx *= Math.exp(-3.2 * dt);
    r.vz *= Math.exp(-3.2 * dt);
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    collideRefIce(r);
    return;
  }
  if (refBackInPlay()) refStayPut.delete(r);
  if (world.drillWon && world.goalTicker > 0) {
    const netX = world.homeAttack * GOAL_LINE_X;
    if (refStayPut.has(r)) {
      holdCheckedRef(r, netX, dt);
      return;
    }
    const standX = netX - Math.sign(netX || 1) * 4.4;
    const boardZ = lane * REF_BOARD_Z;
    r.x += (standX - r.x) * Math.min(1, 3.6 * dt);
    r.z += (boardZ * 0.42 - r.z) * Math.min(1, 3.6 * dt);
    r.yaw = turnToward(r.yaw, netX - r.x, -r.z, 10, dt);
    r.pose = "goal";
    return;
  }
  const boardZ = lane * REF_BOARD_Z;
  const dropping = dropperLane() === lane;
  if (world.faceoff && world.faceoffPhase !== "live") {
    refStayPut.delete(r);
    if (dropping) {
      r.x += (world.faceX - r.x) * Math.min(1, 8 * dt);
      r.z += (world.faceZ + lane * REF_STAND - r.z) * Math.min(1, 8 * dt);
      r.yaw = turnToward(r.yaw, world.faceX - r.x, world.faceZ - r.z, 6, dt);
      r.pose = "drop";
    } else {
      r.x += (world.faceX - r.x) * Math.min(1, 4 * dt);
      r.z += (boardZ - r.z) * Math.min(1, 4 * dt);
      r.yaw = turnToward(r.yaw, world.faceX - r.x, world.faceZ - r.z, 5, dt);
      r.pose = "idle";
    }
    return;
  }
  if (world.stoppage) {
    const puck = world.puck;
    if (world.whistle === "goal") {
      const netX = world.goalSide === "home" ? world.homeAttack * GOAL_LINE_X : -world.homeAttack * GOAL_LINE_X;
      if (refStayPut.has(r)) {
        holdCheckedRef(r, netX, dt);
        return;
      }
      const standX = netX - Math.sign(netX || 1) * 4.4;
      r.x += (standX - r.x) * Math.min(1, 3.6 * dt);
      r.z += (boardZ * 0.42 - r.z) * Math.min(1, 3.6 * dt);
      r.yaw = turnToward(r.yaw, netX - r.x, -r.z, 10, dt);
      r.pose = "goal";
      return;
    }
    r.x += (puck.x - r.x) * Math.min(1, 3.2 * dt);
    r.z += (boardZ - r.z) * Math.min(1, 3.2 * dt);
    r.yaw = turnToward(r.yaw, puck.x - r.x, puck.z - r.z, 5, dt);
    return;
  }
  const puck = world.puck;
  r.x += (puck.x * 0.58 - r.x) * Math.min(1, 2.1 * dt);
  r.z += (boardZ - r.z) * Math.min(1, 2.6 * dt);
  r.yaw = turnToward(r.yaw, puck.x - r.x, puck.z - r.z, 3, dt);
  r.pose = "idle";
}

function stepRef(dt: number): void {
  if (useGame.getState().clockMode === "drill") {
    stepDrillRefs(dt);
    return;
  }
  stepOneRef(world.ref, 1, dt);
  if (useGame.getState().clockMode !== "practice") stepOneRef(world.ref2, -1, dt);
}

function checkCover(dt: number): void {
  const puck = world.puck;
  if (puck.owner !== null) {
    const holder = world.skaters[puck.owner];
    if (holder?.kind === "goalie") {
      if (world.coverT <= 0) world.coverSideZ = puck.z;
      world.coverT += dt;
      if (holder.gloveFlash > 0.12) return;
      if (holder.side === "away") {
        const crash = creaseCrash(holder);
        const open = !Number.isFinite(crash) || crash > 2.15;
        if (open) return;
      }
      if (world.coverT >= COVER_HOLD) startStoppage("cover");
      return;
    }
    world.coverT = Math.max(0, world.coverT - dt * 2);
    return;
  }
  const passer = world.lastPasser !== null ? world.skaters[world.lastPasser] : undefined;
  const sincePass = world.time - world.lastPass;
  if (passer?.kind === "goalie" && sincePass < 1.65) {
    world.coverT = Math.max(0, world.coverT - dt * 4);
    return;
  }
  if (puck.y > 0.25) {
    world.coverT = Math.max(0, world.coverT - dt * 2);
    return;
  }
  const spd = Math.hypot(puck.vx, puck.vz);
  let covering: Skater | null = null;
  for (const s of world.skaters) {
    if (s.kind !== "goalie") continue;
    const side = defendDir(s.side);
    const netX = side * GOAL_LINE_X;
    const towardCenter = -side * (puck.x - netX);
    const inCrease = towardCenter > -0.2 && towardCenter < CREASE_R + 0.15 && Math.abs(puck.z) < 2.05;
    const d = Math.hypot(s.x - puck.x, s.z - puck.z);
    const blade = stickBlade(s);
    if (inCrease && d < 0.95 && spd < 2.6 && !segmentHitsCage(puck.x, puck.z, blade.x, blade.z)) {
      covering = s;
    }
  }
  if (covering) {
    puck.owner = covering.id;
    puck.vx = 0;
    puck.vz = 0;
    puck.vy = 0;
    puck.y = PUCK_Y;
    world.coverT = 0;
    world.coverSideZ = puck.z;
    covering.follow = 0;
    covering.windup = 0;
    return;
  }
  world.coverT = Math.max(0, world.coverT - dt * 2);
  if (world.coverT >= COVER_HOLD) startStoppage("cover");
}

function cpuOneTimerAttempt(s: Skater): boolean {
  if (s.id === world.userId || s.kind === "goalie") return false;
  if (s.stun > 0.04 || s.struck > 0.18 || s.dive > 0) return false;
  const attack = attackDir(s.side);
  const distMouth = (attack * GOAL_LINE_X - s.x) * attack;
  if (distMouth < 1.05 || distMouth > 24 || Math.abs(s.z) > 12) return false;
  if (cpuOtKey === world.lastPass && cpuOtId === s.id) return cpuOtYes;
  cpuOtKey = world.lastPass;
  cpuOtId = s.id;
  const hot = distMouth < 15 && Math.abs(s.z) < 7.4;
  const p = hot ? 0.74 : distMouth < 20 ? 0.48 : 0.3;
  cpuOtYes = Math.random() < p;
  return cpuOtYes;
}

function cpuOneTimerShot(s: Skater): void {
  const attack = attackDir(s.side);
  const netX = attack * GOAL_LINE_X;
  const g = world.skaters.find((p) => p.kind === "goalie" && p.side !== s.side);
  const half = GOAL_W / 2;
  let tZ = g ? -Math.sign(g.z || 1) * (0.28 + Math.random() * 0.5) : (Math.random() * 2 - 1) * (half * 0.7);
  let wantY = PUCK_Y + 0.12 + Math.random() * (GOAL_H * 0.72);
  const roll = Math.random();
  if (roll < 0.2) tZ = (Math.sign(tZ) || 1) * (half + 0.22 + Math.random() * 0.48);
  else if (roll < 0.34) wantY = GOAL_H + 0.12 + Math.random() * 0.4;
  const from = stickBlade(s);
  const dx = netX - from.x;
  const dz = tZ - from.z;
  const dist = Math.hypot(dx, dz) || 1;
  const spd = Math.hypot(s.vx, s.vz);
  const power = 18 + spd * 0.45 + Math.min(8, dist * 0.22);
  const flight = Math.max(0.12, dist / Math.max(8, power));
  const vy = wantY > PUCK_Y + 0.1 ? arriveVy(wantY, flight, 1) : 0.05;
  launchPuck(s, (dx / dist) * power, (dz / dist) * power, vy);
  if (world.time - world.goalieSaveT > 1.35 || dist > 12) {
    world.reboundN = 0;
    world.reboundSoft = false;
  }
  world.lastShoot = world.time;
  world.lastShotSlap = false;
  world.lastShotOneTimer = true;
  world.lastShotRedirect = false;
  world.lastShotCorner = false;
  world.lastShotCornerSide = 0;
  world.lastShooter = s.id;
  world.lastShotDist = dist;
  world.shotWindupT = 0;
  s.follow = 0.5;
  s.windup = 0;
  beginShotSpeedTrack();
}

function maybeLoadedSlap(s: Skater): boolean {
  if (s.id !== world.userId || s.kind === "goalie") return false;
  if (world.oneTimerArmed || world.windupCancel) return false;
  if (!(world.shotWindupT > 0.5)) return false;
  doShot(s, slapMx, slapMy, true, world.shotWindupT);
  return true;
}

function shaftTouch(s: Skater, x: number, y: number, z: number): boolean {
  const yaw = s.yaw + Math.PI;
  const c = Math.cos(yaw);
  const si = Math.sin(yaw);
  const lx = 0.2;
  const handLz = 0.34;
  const bladeLz = 0.82;
  const hx = s.x + lx * c + handLz * si;
  const hz = s.z - lx * si + handLz * c;
  const bx = s.x + lx * c + bladeLz * si;
  const bz = s.z - lx * si + bladeLz * c;
  const abx = bx - hx;
  const aby = 0.08 - 1.12;
  const abz = bz - hz;
  const apx = x - hx;
  const apy = y - 1.12;
  const apz = z - hz;
  const ab2 = abx * abx + aby * aby + abz * abz || 1e-6;
  let u = (apx * abx + apy * aby + apz * abz) / ab2;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  const cx = hx + abx * u;
  const cy = 1.12 + aby * u;
  const cz = hz + abz * u;
  const rad = s.id === world.userId ? 0.28 : 0.2;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz) < rad * rad;
}

function bodyTouch(s: Skater, x: number, y: number, z: number): boolean {
  if (y < 0.02 || y > 1.82) return false;
  const extra = s.id === world.userId ? 0.2 : 0.1;
  const rad = s.radius + extra;
  const dx = x - s.x;
  const dz = z - s.z;
  return dx * dx + dz * dz < rad * rad;
}

function grantFlightCarry(s: Skater): void {
  const blade = stickBlade(s);
  const puck = world.puck;
  puck.owner = s.id;
  puck.x = blade.x;
  puck.z = blade.z;
  puck.y = PUCK_Y;
  puck.vx = s.vx;
  puck.vz = s.vz;
  puck.vy = 0;
  world.goalieShot = null;
  world.lastPassTo = null;
  noteAttackerTouch(s);
}

function interceptGoalieFlight(puck: Puck, prevX: number, prevY: number, prevZ: number): boolean {
  if (world.goalieShot === null) return false;
  if (world.time - world.lastShoot > 3.2) return false;
  const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : null;
  if (!shooter || shooter.kind !== "goalie") return false;
  const moving = Math.hypot(puck.vx, puck.vz);
  if (moving < 2.2 && puck.y < 0.4) return false;
  const dx = puck.x - prevX;
  const dy = puck.y - prevY;
  const dz = puck.z - prevZ;
  const span = Math.hypot(dx, dy, dz);
  const steps = Math.max(1, Math.ceil(span / 0.08));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = prevX + dx * t;
    const y = prevY + dy * t;
    const z = prevZ + dz * t;
    if (Math.hypot(x - shooter.x, z - shooter.z) < 2.2) continue;
    let hit: Skater | null = null;
    for (const s of world.skaters) {
      if (s.kind === "goalie" || s.id === shooter.id) continue;
      if (!bodyTouch(s, x, y, z) && !shaftTouch(s, x, y, z)) continue;
      if (s.id === world.userId) {
        hit = s;
        break;
      }
      if (!hit) hit = s;
    }
    if (hit) {
      grantFlightCarry(hit);
      return true;
    }
  }
  return false;
}

function tryPickup(puck: Puck): void {
  if (world.time < stickLooseUntil) return;
  const intended = world.lastPassTo;
  const passer = world.lastPasser;
  const sincePass = world.time - world.lastPass;
  const sinceShot = world.time - world.lastShoot;
  const sinceSave = world.time - world.goalieSaveT;
  const passLive = intended !== null && sincePass < 2.2;

  if (passLive) {
    const t = world.skaters[intended];
    if (t && t.kind !== "goalie" && t.stun <= 0.04 && t.struck <= 0.18 && t.dive <= 0) {
      const justShot =
        sinceShot < 0.6 &&
        world.lastShoot >= world.lastPass &&
        (world.lastShooter === t.id || world.lastShotOneTimer);
      if (!justShot) {
        const blade = stickBlade(t);
        const dx = blade.x + t.vx * 0.06 - puck.x;
        const dz = blade.z + t.vz * 0.06 - puck.z;
        const dist = Math.hypot(dx, dz);
        const spd = Math.hypot(puck.vx, puck.vz);
        const passerSk = passer !== null ? world.skaters[passer] : undefined;
        const passerIsGoalie = !!passerSk && passerSk.kind === "goalie";
        const fromPasser = passerSk ? Math.hypot(puck.x - passerSk.x, puck.z - passerSk.z) : 99;
        const pastPasser = fromPasser > 0.85 || dist + 0.25 < fromPasser;
        const oneT = world.oneTimerArmed && t.side === "home";
        const stillPass =
          world.lastShoot < world.lastPass &&
          world.goalieSaveT < world.lastPass &&
          world.lastHitTime < world.lastPass;
        const along = puck.vx * dx + puck.vz * dz;
        if (
          stillPass &&
          along > 0 &&
          dist > 0.2 &&
          spd > 0.9 &&
          puck.y < (passerIsGoalie ? 1.2 : 0.95)
        ) {
          const maxH = passerIsGoalie ? 3.2 : t.id === world.userId ? 2.4 : 1.15;
          if (dist < maxH) {
            const k = passerIsGoalie
              ? dist < 1.6
                ? 0.28
                : 0.12
              : t.id === world.userId
                ? dist < 1.2
                  ? 0.2
                  : 0.08
                : dist < 0.7
                  ? 0.1
                  : 0.04;
            const bx = puck.vx / spd;
            const bz = puck.vz / spd;
            const nx = bx + (dx / dist - bx) * k;
            const nz = bz + (dz / dist - bz) * k;
            const nm = Math.hypot(nx, nz) || 1;
            puck.vx = (nx / nm) * spd;
            puck.vz = (nz / nm) * spd;
          }
        }
        const reach = passerIsGoalie ? 4.4 : t.id === world.userId ? 3.35 : 2.25;
        const tooEarly = sincePass < 0.04 || !pastPasser;
        if (oneT) {
          if (!tooEarly && dist < 3 && puck.y < 1.45) {
            if (world.oneTimerPass) fireOneTimerPass(t);
            else fireOneTimer(t);
            return;
          }
        } else if (!tooEarly && t.id !== world.userId && dist < 2.8 && puck.y < 1.35 && cpuOneTimerAttempt(t)) {
          cpuOneTimerShot(t);
          return;
        } else if (!tooEarly && dist < reach && puck.y < (passerIsGoalie ? 1.15 : 0.9)) {
          puck.owner = t.id;
          puck.x = blade.x;
          puck.z = blade.z;
          puck.y = PUCK_Y;
          puck.vx = t.vx;
          puck.vz = t.vz;
          puck.vy = 0;
          return;
        }
      }
    }
  }

  if (puck.y > 1.18) return;
  const moving = Math.hypot(puck.vx, puck.vz);
  const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
  const reboundAway = sinceSave < 1.05 && puck.x * defendDir("away") > 1.2;
  const reboundHome = sinceSave < 1.05 && puck.x * defendDir("home") > 1.2;
  const awayEmpty = !world.skaters.some((p) => p.side === "away" && p.kind === "goalie");

  let best = -1;
  let bestD = 99;
  let userLooseWin = false;
  const justReleased = userJustReleasedPuck();
  for (const s of world.skaters) {
    if (justReleased && s.side === "away") continue;
    if (s.kind === "goalie") {
      if (s.stun > 0.2 || s.struck > 0.3 || s.tumble !== 0) continue;
      const behind = puck.x * defendDir(s.side) > GOAL_LINE_X - 0.2;
      const dG = Math.hypot(s.x - puck.x, s.z - puck.z);
      const reach = behind ? 1.28 : 1.02;
      if (puck.y > 0.72) continue;
      if (moving > 11 && !(behind && dG < 0.9)) continue;
      if (shooter && sinceShot < 0.45 && moving > 8 && !behind) continue;
      if (dG < reach && dG < bestD) {
        const blade = stickBlade(s);
        if (segmentHitsCage(puck.x, puck.z, blade.x, blade.z)) continue;
        bestD = dG;
        best = s.id;
      }
      continue;
    }
    if (s.stun > 0.04 || s.struck > 0.18 || s.dive > 0) continue;
    if (passer === s.id && (sincePass < 0.62 || Math.hypot(s.x - puck.x, s.z - puck.z) < 2.8 && sincePass < 0.95)) continue;
    if (world.lastHitter === s.id && world.time - world.lastHitTime < 0.5) continue;
    if (world.lastShooter === s.id && sinceShot < (world.lastShotOneTimer ? 0.6 : 0.28)) continue;
    if (shooter && s.side === shooter.side && sinceShot < 0.55) continue;
    if (s.side === "away" && reboundAway && sinceSave < 0.55) continue;
    if (s.side === "home" && reboundHome && sinceSave < 0.52) continue;
    if (world.oneTimerArmed && sincePass < 2.2 && s.side === "home") continue;
    const blade = stickBlade(s);
    const dBlade = Math.hypot(blade.x - puck.x, blade.z - puck.z);
    const { fx, fz } = heading(s.yaw);
    const ahead = (puck.x - s.x) * fx + (puck.z - s.z) * fz;
    const airbornePass =
      passLive && intended !== s.id && (puck.y > 0.12 || Math.abs(puck.vy) > 0.35);
    if (s.id === world.userId && airbornePass) continue;
    if (ahead < -0.08 && !(intended === s.id && sincePass < 2.2) && s.id !== world.userId) continue;
    let d = dBlade;
    const isIntended = intended === s.id && sincePass < 2.2;
    if (isIntended && sincePass < 0.04) continue;
    if (world.oneTimerArmed && isIntended) continue;
    const passerSide = passer !== null ? world.skaters[passer]?.side : null;
    const fromMate = passerSide === s.side && sincePass < 1.3;
    let reach = s.side === "away" ? (moving > 10 ? 0.55 : 0.82) : moving > 10 ? 0.7 : 0.95;
    if (s.id === world.userId) reach = moving > 10 ? 0.95 : 1.22;
    if (s.side === "away" && moving < 3.8 && puck.y < 0.38) {
      reach = Math.max(reach, dBlade < 0.85 ? 0.85 : reach);
    }
    if (passLive && passerSide && s.side !== passerSide) reach = s.side === "away" ? 0.18 : 0.4;
    if (fromMate) reach = 1.15;
    if (isIntended) reach = s.id === world.userId ? 3.05 : 2.15;
    const shotInFlight =
      !!shooter && shooter.side !== s.side && sinceShot < 0.9 && moving > 7.2;
    if (shotInFlight && s.side === "away") {
      if (awayEmpty) reach = s.kind === "defense" ? 1.05 : 1.22;
      else reach = s.kind === "defense" ? 0.12 : 0.14;
    } else if (shotInFlight && s.side === "home") {
      reach = s.id === world.userId ? (userIdle() ? 0.35 : 0.72) : userIdle() ? 0.12 : 0.28;
    } else if (awayEmpty && s.side === "away") {
      reach *= 1.32;
    }
    if (reboundAway) {
      if (s.side === "away") reach *= 0.48;
      else {
        reach *= 1.12;
        if (s.id === world.userId) reach *= 1.08;
      }
    } else if (reboundHome) {
      if (s.side === "home") reach *= 0.52;
      else reach *= 1.12;
    }
    const userLoose =
      s.id === world.userId && sinceSave >= 1.2 && !passLive && !shotInFlight;
    if (userLoose) {
      const looseReach = moving > 10 ? 1.35 : 1.72;
      reach = Math.max(reach, looseReach);
      const bodyD = Math.hypot(s.x - puck.x, s.z - puck.z);
      if (bodyD < d && dBlade <= looseReach) d = bodyD;
    }
    if (d < reach && d < bestD) {
      bestD = d;
      best = s.id;
      userLooseWin = userLoose;
    }
  }
  if (best >= 0) {
    const s = world.skaters[best]!;
    const blade = stickBlade(s);
    if (s.kind === "goalie") {
      if (Math.hypot(s.x - puck.x, s.z - puck.z) > 1.45) return;
      if (segmentHitsCage(puck.x, puck.z, blade.x, blade.z)) return;
      puck.owner = s.id;
      puck.x = blade.x;
      puck.z = blade.z;
      puck.y = PUCK_Y;
      puck.vx = s.vx;
      puck.vz = s.vz;
      puck.vy = 0;
      world.coverT = 0;
      world.goalieShot = null;
      s.follow = 0;
      s.windup = 0;
      return;
    }
    const intendedPickup = intended === best && sincePass < 2.2;
    let snapCap = sinceSave < 1.2 ? 0.55 : intendedPickup ? 2.6 : 1.28;
    if (userLooseWin) snapCap = Math.max(snapCap, 1.72);
    if (Math.hypot(blade.x - puck.x, blade.z - puck.z) > snapCap) return;
    puck.owner = best;
    puck.x = blade.x;
    puck.z = blade.z;
    puck.y = PUCK_Y;
    puck.vx = s.vx;
    puck.vz = s.vz;
    puck.vy = 0;
    const livePass = intended === s.id && sincePass < 2.2 && world.lastShoot < world.lastPass;
    if (livePass && s.id !== world.userId && cpuOneTimerAttempt(s)) {
      cpuOneTimerShot(s);
      return;
    }
    if (!livePass) maybeLoadedSlap(s);
  }
}

function stepWhistlePuck(dt: number): void {
  const puck = world.puck;
  if (puck.owner !== null) {
    const s = world.skaters[puck.owner];
    if (!s || s.id !== world.offsideCarrier) {
      puck.owner = null;
    } else {
      const blade = stickBlade(s);
      puck.x = blade.x;
      puck.z = blade.z;
      puck.y = PUCK_Y;
      puck.vx = s.vx;
      puck.vz = s.vz;
      puck.vy = 0;
      containPuckBoards(puck);
      return;
    }
  }
  const prevX = puck.x;
  const prevZ = puck.z;
  const prevY = puck.y;
  puck.x += puck.vx * dt;
  puck.z += puck.vz * dt;
  puck.y += puck.vy * dt;
  puck.vy -= 12 * dt;
  if (puck.y <= PUCK_Y) {
    puck.y = PUCK_Y;
    if (puck.vy < 0) puck.vy *= -0.28;
    if (Math.abs(puck.vy) < 0.4) puck.vy = 0;
  }
  const damp = Math.exp(-0.35 * dt);
  puck.vx *= damp;
  puck.vz *= damp;
  containPuckBoards(puck);
  bouncePuckCage(puck, prevX, prevZ, prevY);
  containPuckBoards(puck);
  ejectFromCage(puck, prevX);
  for (const side of [1, -1] as const) {
    if (!inCageVolume(puck.x, puck.z, puck.y, side)) continue;
    const mouth = side * GOAL_LINE_X;
    puck.x = mouth - side * 0.45;
    puck.vx = -side * Math.max(4, Math.abs(puck.vx) * 0.35);
    puck.vy = Math.max(puck.vy, 0.4);
  }
  if (puck.y > 1.2) return;
  const since = world.time - world.lastShoot;
  for (const s of world.skaters) {
    if (s.id === world.lastShooter && since < 0.22) continue;
    const dx = puck.x - s.x;
    const dz = puck.z - s.z;
    const rad = s.radius + 0.06;
    const dist = Math.hypot(dx, dz);
    if (dist >= rad || dist < 1e-4) continue;
    const nx = dx / dist;
    const nz = dz / dist;
    puck.x = s.x + nx * rad;
    puck.z = s.z + nz * rad;
    const vn = puck.vx * nx + puck.vz * nz;
    if (vn < 0) {
      puck.vx -= 1.45 * vn * nx;
      puck.vz -= 1.45 * vn * nz;
    }
  }
  for (const r of refsOnIce()) {
    const dx = puck.x - r.x;
    const dz = puck.z - r.z;
    const rad = 0.46;
    const dist = Math.hypot(dx, dz);
    if (dist >= rad || dist < 1e-4) continue;
    const nx = dx / dist;
    const nz = dz / dist;
    puck.x = r.x + nx * rad;
    puck.z = r.z + nz * rad;
    const vn = puck.vx * nx + puck.vz * nz;
    if (vn < 0) {
      puck.vx -= 1.45 * vn * nx;
      puck.vz -= 1.45 * vn * nz;
    }
  }
}

function stepPuck(dt: number): void {
  if (useGame.getState().clockMode === "drill") {
    stepDrillGhosts(dt);
    stepDrillCards(dt);
    if (drillPuckFrozen) {
      holdDrillPin();
      return;
    }
    if (world.drillWon && drillWinPuck === world.puck && !drillWinKicked && !drillEncoreLive) {
      world.puck.owner = null;
    }
  }
  if (
    world.delayedOffside !== 0 &&
    offsideTouchSide === world.delayedOffside &&
    !world.stoppage &&
    !world.faceoff &&
    offsidesLive()
  ) {
    blowDelayedOffside(world.delayedOffside);
    return;
  }
  const puck = world.puck;
  if (puck.owner !== null) {
    world.goalieShot = null;
    boardRide = null;
    boardBank = null;
    const s = world.skaters[puck.owner];
    if (!s) {
      puck.owner = null;
    } else {
      if (
        s.kind !== "goalie" &&
        (s.struck > 0.2 || s.stun > 0.12 || s.dive > 0) &&
        !userStickCommitHolds(s.id)
      ) {
        spillCheckedPuck(s);
      } else {
        updateWrapFlag(s);
        const prevX = puck.x;
        const prevZ = puck.z;
        const prevY = puck.y;
        let nextX: number;
        let nextZ: number;
        let nextY: number;
        if (s.kind === "goalie" && s.gloveFlash > 0.12) {
          const gp = goalieGlovePuck(s);
          nextX = gp.x;
          nextZ = gp.z;
          nextY = gp.y;
        } else {
          const blade = s.kind === "goalie" && s.coverPose > 0.35 ? goalieGlovePuck(s) : stickBlade(s);
          nextX = blade.x;
          nextZ = blade.z;
          nextY = PUCK_Y;
        }
        if (s.kind === "goalie" && segmentHitsCage(prevX, prevZ, nextX, nextZ)) {
          puck.owner = null;
          puck.x = prevX;
          puck.z = prevZ;
          puck.y = prevY;
          puck.vx = 0;
          puck.vz = 0;
          puck.vy = 0;
          return;
        }
        puck.x = nextX;
        puck.z = nextZ;
        puck.y = nextY;
        if (Math.hypot(puck.x - prevX, puck.z - prevZ) > 6.5) {
          puck.x = prevX;
          puck.z = prevZ;
          puck.owner = null;
        }
        puck.vx = s.vx;
        puck.vz = s.vz;
        puck.vy = 0;
        keepOwnCageSolid(s);
        const crossed = crossedGoalMouth(prevX, prevZ, prevY, puck);
        const bodyIn = crossed !== 0 ? 0 : carrierIntoOwnMouth(s);
        const scored = crossed !== 0 ? crossed : bodyIn;
        if (scored !== 0 && useGame.getState().clockMode !== "drill") {
          const defending: "home" | "away" = scored === world.homeAttack ? "away" : "home";
          const g = world.skaters.find((p) => p.kind === "goalie" && p.side === defending);
          const own = s.side === defending;
          if (own) {
            const yAt = bodyIn !== 0 ? PUCK_Y : puck.y;
            const zAt = bodyIn !== 0 ? s.z : puck.z;
            if (g && goalieCoversMouth(g, yAt, zAt)) {
              stripByGoalie(g, s);
              return;
            }
            if (bodyIn !== 0) {
              const mouth = scored * GOAL_LINE_X;
              const hw = GOAL_W / 2 - 0.12;
              puck.x = mouth + scored * 0.28;
              puck.z = Math.max(-hw, Math.min(hw, s.z));
              puck.y = PUCK_Y;
              puck.vx = scored * Math.max(2.6, Math.abs(s.vx));
              puck.vz = s.vz * 0.12;
              puck.vy = 0.12;
            }
          } else if (s.kind !== "goalie" && g && !allowWrapTuck(s, g)) {
            stripByGoalie(g, s);
            return;
          }
          stopForGoal(scored);
          return;
        }
        containPuckBoards(puck);
        ejectFromCage(puck, prevX);
        checkOffside();
        return;
      }
    }
  }

  if (world.goalBank) {
    stepGoalBank(dt);
    return;
  }

  stepRimRide();
  const prevX = puck.x;
  const prevZ = puck.z;
  const prevY = puck.y;
  if (boardRide?.phase === "glide") {
    stepBoardGlide(dt);
  } else {
    puck.x += puck.vx * dt;
    puck.z += puck.vz * dt;
    puck.y += puck.vy * dt;
    puck.vy -= 12 * dt;
    if (puck.y <= PUCK_Y) {
      puck.y = PUCK_Y;
      if (world.reboundSoft) {
        if (puck.vy < 0) puck.vy *= -0.06;
        if (Math.abs(puck.vy) < 0.55) puck.vy = 0;
        puck.vx *= 0.62;
        puck.vz *= 0.62;
      } else {
        if (puck.vy < 0) puck.vy *= -0.28;
        if (Math.abs(puck.vy) < 0.4) puck.vy = 0;
      }
    }
    const damp = Math.exp((world.reboundSoft ? -1.85 : -0.35) * dt);
    puck.vx *= damp;
    puck.vz *= damp;
    const destX = puck.x;
    const destZ = puck.z;
    const step = Math.hypot(destX - prevX, destZ - prevZ);
    if (step > 0.26) {
      const n = Math.min(5, Math.ceil(step / 0.2));
      puck.x = prevX;
      puck.z = prevZ;
      for (let i = 1; i <= n; i++) {
        puck.x = prevX + (destX - prevX) * (i / n);
        puck.z = prevZ + (destZ - prevZ) * (i / n);
        if (containPuckBoards(puck)) break;
      }
    } else {
      containPuckBoards(puck);
    }
  }
  if (interceptGoalieFlight(puck, prevX, prevY, prevZ)) return;
  const shotX = puck.x;
  const shotY = puck.y;
  const shotZ = puck.z;
  bouncePuckCage(puck, prevX, prevZ, prevY);
  containPuckBoards(puck);
  settleBoardPass();
  if (boardRide?.phase === "glide") placeOnWall(boardRide.dir, boardRide.speed);
  rejectPuckYank(puck, prevX, prevZ);
  maybeRedirect(puck);

  if (useGame.getState().clockMode === "drill") {
    drillNetTouch = false;
    tickDrill(dt, prevX, prevY, prevZ, shotX, shotY, shotZ);
    drillReboundNet(puck);
    for (const g of world.drillGhosts) {
      if (drillWinLodged && g === drillWinPuck) continue;
      drillReboundNet(g);
    }
    const released = drillFromPass ? world.lastPass : world.lastShoot;
    if (
      drillNetTouch &&
      drillPuckLive &&
      puck.owner === null &&
      world.drillShot &&
      !world.drillWon &&
      world.time - released >= 0.06
    ) {
      recycleDrillPuck(true);
    }
    stepDrillWinPuck();
    settleDrillEncore();
    if (drillPuckFrozen) {
      holdDrillPin();
      return;
    }
    releaseDrillNetPuck(puck);
    if (puck.owner === null && !(world.drillWon && !drillWinKicked) && !drillEncoreLive) tryPickup(puck);
    return;
  }

  if (tryGoalieCatch(puck)) return;
  if (tryGoalieSweep(puck, prevX, prevZ, prevY)) return;
  if (trySave(puck, prevX, prevZ, prevY)) return;

  const scored = crossedGoalMouth(prevX, prevZ, prevY, puck);
  if (scored !== 0) {
    if (world.goalieShot === "out") {
      kickGoalieMiss(puck, scored, puck.z, puck.y > GOAL_H - 0.2);
      return;
    }
    const g = defendingGoalie(scored);
    const aimed = shotAtThisNet(scored);
    if (world.goalieShot === null && g && aimed && shotFromOutsideOz() && Math.random() > 0.02) {
      applyGoalieSave(
        g,
        puck,
        g.side === "home" ? 0.22 : 0.9,
        g.x + (scored > 0 ? -1 : 1) * 0.7,
        onGloveSave(g, puck.y, puck.z),
      );
      return;
    }
    if (world.goalieShot !== "score" && g && !aimed && goalieCoversMouth(g, puck.y, puck.z)) {
      applyGoalieSave(
        g,
        puck,
        g.side === "home" ? 0.22 : 0.9,
        g.x + (scored > 0 ? -1 : 1) * 0.7,
        onGloveSave(g, puck.y, puck.z),
      );
      return;
    }
    if (beginGoalBank(scored)) return;
    stopForGoal(scored);
    return;
  }
  ejectFromCage(puck, prevX);
  tryPickup(puck);
  checkOffside();
}

function keepInBowl(s: Skater): void {
  if (world.benchDump?.id === s.id) return;
  s.x = Math.max(-RINK_L / 2 + 0.6, Math.min(RINK_L / 2 - 0.6, s.x));
  s.z = Math.max(-RINK_W / 2 + 0.6, Math.min(RINK_W / 2 - 0.6, s.z));
}

function keepOutOfCircle(s: Skater): void {
  if (s.id === world.homeDot || s.id === world.awayDot) return;
  const dx = s.x - world.faceX;
  const dz = s.z - world.faceZ;
  const d = Math.hypot(dx, dz);
  const min = FACEOFF_R + 0.35;
  if (d < min && d > 1e-4) {
    const k = min / d;
    s.x = world.faceX + dx * k;
    s.z = world.faceZ + dz * k;
    s.vx = 0;
    s.vz = 0;
  }
}

function lockDot(s: Skater | undefined, x: number, z: number, yaw: number): void {
  if (!s) return;
  s.x = x;
  s.z = z;
  s.vx = 0;
  s.vz = 0;
  s.yaw = yaw;
}

function tickFreeCam(dt: number, act: Actions): void {
  const fc = world.freeCam;
  const mag = Math.hypot(act.moveX, act.moveY);
  if (mag > 0.04) {
    fc.theta -= act.moveX * dt * 2.15;
    fc.phi = Math.max(0.12, Math.min(1.45, fc.phi - act.moveY * dt * 1.35));
    world.pauseDirty = true;
  }
  if (act.zoomIn || act.xDown) {
    fc.radius = Math.max(4.2, fc.radius - dt * 18);
    world.pauseDirty = true;
  }
  if (act.zoomOut) {
    fc.radius = Math.min(120, fc.radius + dt * 18);
    world.pauseDirty = true;
  }
}

type PauseDraft = {
  clockMode: PlayMode;
  drillTargets: DrillTargets;
  gameMinutes: number;
};

let pauseDraft: PauseDraft | null = null;
const pauseDraftListeners = new Set<() => void>();

function publishPauseDraft(): void {
  for (const fn of pauseDraftListeners) fn();
}

export function subscribePauseDraft(listener: () => void): () => void {
  pauseDraftListeners.add(listener);
  return () => {
    pauseDraftListeners.delete(listener);
  };
}

export function getPauseDraft(): PauseDraft | null {
  return pauseDraft;
}

function clearPauseDraft(): void {
  if (!pauseDraft) return;
  pauseDraft = null;
  publishPauseDraft();
}

function runningDraft(): PauseDraft {
  const s = useGame.getState();
  return {
    clockMode: pauseDraft?.clockMode ?? s.clockMode,
    drillTargets: pauseDraft?.drillTargets ?? s.drillTargets,
    gameMinutes: pauseDraft?.gameMinutes ?? s.gameMinutes,
  };
}

function writePauseDraft(next: PauseDraft): void {
  if (
    pauseDraft &&
    pauseDraft.clockMode === next.clockMode &&
    pauseDraft.drillTargets === next.drillTargets &&
    pauseDraft.gameMinutes === next.gameMinutes
  ) {
    return;
  }
  pauseDraft = next;
  publishPauseDraft();
}

export function previewPausedMode(m: PlayMode): void {
  const ui = useGame.getState();
  if (!(ui.playing && ui.paused)) {
    ui.setClockMode(m);
    resetWorld();
    return;
  }
  writePauseDraft({ ...runningDraft(), clockMode: m });
}

export function previewPausedTargets(n: DrillTargets): void {
  const ui = useGame.getState();
  if (!(ui.playing && ui.paused)) {
    drillPromote = false;
    ui.setDrillTargets(n);
    if (useGame.getState().clockMode === "drill") resetWorld();
    return;
  }
  const v: DrillTargets = n === 16 ? 16 : n === 12 ? 12 : n === 8 ? 8 : 4;
  writePauseDraft({ ...runningDraft(), drillTargets: v });
}

export function previewPausedMinutes(n: number): void {
  const minutes = Math.max(1, Math.min(5, Math.round(n)));
  const ui = useGame.getState();
  if (!(ui.playing && ui.paused)) {
    ui.setGameMinutes(minutes);
    return;
  }
  writePauseDraft({ ...runningDraft(), gameMinutes: minutes });
}

export function resumePausedGame(): void {
  clearPauseDraft();
  finishPauseCam();
  useGame.getState().setPaused(false);
}

export function resetPausedGame(): void {
  clearPauseDraft();
  resetWorld();
  useGame.getState().setPaused(false);
}

export function startPausedNewGame(): void {
  const draft = pauseDraft;
  clearPauseDraft();
  if (draft) {
    drillPromote = false;
    const ui = useGame.getState();
    if (draft.drillTargets !== ui.drillTargets) ui.setDrillTargets(draft.drillTargets);
    if (draft.gameMinutes !== ui.gameMinutes) ui.setGameMinutes(draft.gameMinutes);
    if (draft.clockMode !== ui.clockMode) ui.setClockMode(draft.clockMode);
  }
  resetWorld();
  useGame.getState().setPaused(false);
}

export function beginPauseCam(prevMode: CamMode): void {
  clearPauseDraft();
  world.freeCam.captured = false;
  world.pauseDirty = false;
  world.pauseRestoreMode = prevMode;
}

export function finishPauseCam(): void {
  const ui = useGame.getState();
  if (world.pauseDirty) {
    ui.setCamMode("freestyle");
    ui.setFreeCamLive(true);
    world.freeCam.captured = true;
  } else if (world.pauseRestoreMode) {
    const mode = world.pauseRestoreMode as CamMode;
    ui.setCamMode(mode);
    ui.setFreeCamLive(false);
  }
  ui.setCamAdjust(false);
}

function stepPause(dt: number, act: Actions): boolean {
  const ui = useGame.getState();
  if (ui.pad !== act.padKind) ui.setPad(act.padKind);
  if (world.goalTicker > 0) world.goalTicker = Math.max(0, world.goalTicker - dt);
  if (world.drillCheer > 0) world.drillCheer = Math.max(0, world.drillCheer - dt);
  if (world.drillWon && world.goalTicker <= 0 && !world.periodOver) {
    world.periodOver = true;
    world.stoppage = true;
    world.stoppageT = 0;
    ui.setPeriodOver(true);
  }
  if (world.goalTicker <= 0 && world.goalSide && !world.stoppage && !world.drillWon) {
    world.goalSide = null;
    ui.setGoalSide(null);
  }

  if (!ui.playing) {
    dropWingClaims();
    if (ui.camAdjust) ui.setCamAdjust(false);
    if (act.aEdge || act.aTap) {
      resetWorld();
      ui.setPlaying(true);
      world.faceoffA = true;
    }
    return true;
  }

  if (world.periodOver) {
    dropWingClaims();
    world.stoppageT += dt;
    if (ui.homeScore !== ui.awayScore) stepGoalCelebrate(dt);
    if (act.aEdge || act.aTap) {
      resetWorld();
      world.faceoffA = true;
    }
    return true;
  }

  if (world.replay && world.replayKind === "pause") {
    dropWingClaims();
    stepReplay(dt, act);
    return true;
  }

  if (act.pausePress) {
    if (ui.paused) {
      if (world.replay) {
        dropWingClaims();
        return true;
      }
      resumePausedGame();
      return false;
    }
    dropWingClaims();
    beginPauseCam(ui.camMode);
    ui.setPaused(true);
    return true;
  }

  if (!ui.paused) {
    if (ui.camAdjust) ui.setCamAdjust(false);
    return false;
  }

  dropWingClaims();
  tickFreeCam(dt, act);
  if (world.faceoffA && !act.aDown && !act.aTap && !act.aHoldRel && !act.aEdge) {
    world.faceoffA = false;
  }
  if (act.aEdge && !world.faceoffA) {
    resumePausedGame();
    world.faceoffA = true;
    return true;
  }
  return true;
}

function stepFaceoff(dt: number, act: Actions, user: Skater): void {
  if (useGame.getState().clockMode === "drill") {
    stepDrillDrop(dt);
    return;
  }
  world.faceoffT += dt;
  const home = world.skaters[world.homeDot];
  const away = world.skaters.find((s) => s.id === world.awayDot);
  lockDot(home, world.faceX + defendDir("home") * 1.15, world.faceZ, faceYaw("home"));
  lockDot(away, world.faceX + defendDir("away") * 1.15, world.faceZ, faceYaw("away"));
  if (world.faceoffPhase !== "live") {
    parkFaceoffWingers(world.skaters, world.homeDot, world.awayDot);
  }
  world.faceoffAimX = act.moveX;
  world.faceoffAimY = act.moveY;

  const r = refForLane(dropperLane());
  if (world.faceoffPhase === "hold") {
    r.handY = 1.38;
    r.pose = "drop";
    if (world.faceoffT > HOLD_T) {
      world.faceoffPhase = "lower";
      world.faceoffT = 0;
    }
  } else if (world.faceoffPhase === "lower") {
    const k = Math.min(1, world.faceoffT / LOWER_T);
    const e = k * k;
    r.handY = 1.38 + (PUCK_Y - 1.38) * e;
    if (world.faceoffT > LOWER_T) {
      world.faceoffPhase = "live";
      world.faceoffT = 0;
      world.puck.y = PUCK_Y;
      world.puck.x = world.faceX;
      world.puck.z = world.faceZ;
      world.puck.owner = null;
    }
  } else if (world.faceoffPhase === "fake") {
    const u = (world.faceoffT % FAKE_T) / FAKE_T;
    const wave = u < 0.5 ? u * 2 : 2 - u * 2;
    r.handY = 0.22 + wave * 0.38;
    if (world.faceoffT > FAKE_T) {
      world.faceoffFakes -= 1;
      world.faceoffT = 0;
      world.faceoffPhase = world.faceoffFakes > 0 ? "fake" : "drop";
    }
  } else if (world.faceoffPhase === "drop") {
    r.handY = Math.max(PUCK_Y, 0.22 - (world.faceoffT / DROP_FLY_T) * 0.18);
    if (world.faceoffT > DROP_FLY_T) {
      world.faceoffPhase = "live";
      world.faceoffT = 0;
      world.puck.y = PUCK_Y;
      world.puck.x = world.faceX;
      world.puck.z = world.faceZ;
      world.puck.owner = null;
    }
  }

  if (world.faceoffPhase !== "live") {
    world.puck.x = world.faceX;
    world.puck.z = world.faceZ;
    world.puck.y = r.handY;
    world.puck.owner = null;
    world.puck.vx = 0;
    world.puck.vz = 0;
    world.puck.vy = 0;
    return;
  }

  world.puck.y = PUCK_Y;
  world.puck.x = world.faceX;
  world.puck.z = world.faceZ;
  world.puck.owner = null;
  world.puckOz = puckOzSide(world.puck);

  if (act.aEdge || act.aDown || act.aTap) {
    const foe = away ?? world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
    if (foe && Math.random() < 0.18) winFaceoff(foe);
    else winFaceoff(user, { mx: world.faceoffAimX, my: world.faceoffAimY });
    world.faceoffA = true;
    return;
  }
  if ((act.yEdge || act.yDown) && away) {
    away.stun = 0.9;
    away.struck = 0.7;
    away.vx = 2.4;
    away.vz = (Math.random() - 0.5) * 3;
    world.faceoff = false;
    world.faceoffPhase = "live";
    markPuckDrop();
    world.puck.owner = null;
    world.puck.x = world.faceX + 0.15;
    world.puck.z = world.faceZ + (Math.random() - 0.5) * 0.8;
    world.puck.vx = -1.4 + Math.random() * 0.6;
    world.puck.vz = (Math.random() - 0.5) * 6;
    world.puck.y = PUCK_Y;
    world.puckOz = puckOzSide(world.puck);
    world.ref.pose = "idle";
    world.ref2.pose = "idle";
    return;
  }
  if (act.xEdge || act.xDown) {
    world.faceoff = false;
    world.faceoffPhase = "live";
    markPuckDrop();
    if (away) {
      away.stun = 0.35;
      away.struck = 0.25;
    }
    user.stun = 0.2;
    const ang = Math.random() * Math.PI * 2;
    const spd = 5.5 + Math.random() * 4;
    world.puck.owner = null;
    world.puck.x = world.faceX;
    world.puck.z = world.faceZ;
    world.puck.vx = Math.cos(ang) * spd;
    world.puck.vz = Math.sin(ang) * spd;
    world.puck.y = PUCK_Y;
    world.puckOz = puckOzSide(world.puck);
    world.ref.pose = "idle";
    world.ref2.pose = "idle";
    return;
  }
  if (world.faceoffT > 0.5) {
    const foe = away ?? world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
    if (foe) winFaceoff(foe);
    else {
      world.faceoff = false;
      markPuckDrop();
    }
  }
}

type ReplayBody = {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  stride: number;
  lean: number;
  bank: number;
  coverPose: number;
  lPad: number;
  rPad: number;
  deke: number;
  poke: number;
  windup: number;
  follow: number;
  dive: number;
  stun: number;
  struck: number;
  tumble: number;
  celebrate: number;
  smash: number;
  smashKind: number;
  smashHit: number;
  gloveFlash: number;
};

type ReplayRef = {
  x: number;
  z: number;
  yaw: number;
  pose: RefPose;
  poseT: number;
  handY: number;
  vx: number;
  vz: number;
  struck: number;
  tumble: number;
};

type ReplaySnap = {
  puck: { x: number; z: number; y: number; vx: number; vz: number; vy: number; owner: number | null };
  userId: number;
  bodies: ReplayBody[];
  ref: ReplayRef;
  ref2: ReplayRef;
  rage: StickRage | null;
};

const REPLAY_CAP = 1800;
const replayBuf: ReplaySnap[] = new Array(REPLAY_CAP);
let replayW = 0;
let replayN = 0;
let replaySeq = 0;
let replayDropSeq = 0;
let replayPlay: ReplaySnap[] = [];
let pauseHold: ReplaySnap | null = null;
let jumboPlay: ReplaySnap[] = [];
let jumboT = 0;
let jumboOn = false;

function markPuckDrop(): void {
  replayDropSeq = replaySeq;
}

function clearReplayBuf(): void {
  replayN = 0;
  replayW = 0;
  replaySeq = 0;
  replayDropSeq = 0;
  replayPlay = [];
  pauseHold = null;
  jumboPlay = [];
  jumboT = 0;
  jumboOn = false;
}

function snapOneRef(r: Referee): ReplayRef {
  return {
    x: r.x,
    z: r.z,
    yaw: r.yaw,
    pose: r.pose,
    poseT: r.poseT,
    handY: r.handY,
    vx: r.vx,
    vz: r.vz,
    struck: r.struck,
    tumble: r.tumble,
  };
}

function snapRef(): ReplayRef {
  return snapOneRef(world.ref);
}

function snapRef2(): ReplayRef {
  return snapOneRef(world.ref2);
}

function applyOneRef(r: Referee, snap: ReplayRef): void {
  r.x = snap.x;
  r.z = snap.z;
  r.yaw = snap.yaw;
  r.pose = snap.pose;
  r.poseT = snap.poseT;
  r.handY = snap.handY;
  r.vx = snap.vx;
  r.vz = snap.vz;
  r.struck = snap.struck;
  r.tumble = snap.tumble ?? 0;
}

function snapBody(s: Skater): ReplayBody {
  return {
    x: s.x,
    z: s.z,
    yaw: s.yaw,
    vx: s.vx,
    vz: s.vz,
    stride: s.stride,
    lean: s.lean,
    bank: s.bank,
    coverPose: s.coverPose,
    lPad: s.lPad,
    rPad: s.rPad,
    deke: s.deke,
    poke: s.poke,
    windup: s.windup,
    follow: s.follow,
    dive: s.dive,
    stun: s.stun,
    struck: s.struck,
    tumble: s.tumble,
    celebrate: s.celebrate,
    smash: s.smash,
    smashKind: s.smashKind,
    smashHit: s.smashHit,
    gloveFlash: s.gloveFlash,
  };
}

function recordReplay(force = false): void {
  if (world.replay) return;
  if (!force && world.faceoff) return;
  if (!force && world.stoppage && world.whistle !== "goal") return;
  replayBuf[replayW] = {
    puck: {
      x: world.puck.x,
      z: world.puck.z,
      y: world.puck.y,
      vx: world.puck.vx,
      vz: world.puck.vz,
      vy: world.puck.vy,
      owner: world.puck.owner,
    },
    userId: world.userId,
    bodies: world.skaters.map(snapBody),
    ref: snapRef(),
    ref2: snapRef2(),
    rage: snapRage(),
  };
  replayW = (replayW + 1) % REPLAY_CAP;
  if (replayN < REPLAY_CAP) replayN++;
  replaySeq++;
}

function applyReplaySnap(snap: ReplaySnap): void {
  const p = world.puck;
  p.x = snap.puck.x;
  p.z = snap.puck.z;
  p.y = snap.puck.y;
  p.vx = snap.puck.vx;
  p.vz = snap.puck.vz;
  p.vy = snap.puck.vy;
  p.owner = snap.puck.owner;
  world.userId = snap.userId;
  const n = Math.min(snap.bodies.length, world.skaters.length);
  for (let i = 0; i < n; i++) {
    const s = world.skaters[i]!;
    const b = snap.bodies[i]!;
    s.x = b.x;
    s.z = b.z;
    s.yaw = b.yaw;
    s.vx = b.vx;
    s.vz = b.vz;
    s.stride = b.stride;
    s.lean = b.lean;
    s.bank = b.bank;
    s.coverPose = b.coverPose;
    s.lPad = b.lPad;
    s.rPad = b.rPad;
    s.deke = b.deke;
    s.poke = b.poke;
    s.windup = b.windup;
    s.follow = b.follow;
    s.dive = b.dive;
    s.stun = b.stun;
    s.struck = b.struck;
    s.tumble = b.tumble;
    s.celebrate = b.celebrate;
    s.smash = b.smash ?? 0;
    s.smashKind = b.smashKind ?? 0;
    s.smashHit = b.smashHit ?? 0;
    s.gloveFlash = b.gloveFlash;
  }
  applyRage(snap.rage);
  if (snap.ref) applyOneRef(world.ref, snap.ref);
  if (snap.ref2) applyOneRef(world.ref2, snap.ref2);
}

function dumpReplayBuf(): ReplaySnap[] {
  const raw: ReplaySnap[] = [];
  const start = replayN < REPLAY_CAP ? 0 : replayW;
  for (let i = 0; i < replayN; i++) {
    const snap = replayBuf[(start + i) % REPLAY_CAP];
    if (snap) raw.push(snap);
  }
  return raw;
}

function trimReplayDead(raw: ReplaySnap[]): ReplaySnap[] {
  if (raw.length < 24) return raw;
  let start = 0;
  for (let i = 0; i < raw.length - 16; i++) {
    const s = raw[i]!;
    const puckSpd = Math.hypot(s.puck.vx, s.puck.vz, s.puck.vy);
    let busy = puckSpd > 1.5;
    if (!busy) {
      for (const b of s.bodies) {
        if (Math.hypot(b.vx, b.vz) > 2.2) {
          busy = true;
          break;
        }
      }
    }
    if (busy) {
      start = Math.max(0, i - 12);
      break;
    }
  }
  if (start <= 0) return raw;
  return raw.slice(start);
}

function endReplay(): void {
  const kind = world.replayKind;
  world.replay = false;
  world.replayT = 0;
  world.replayKind = null;
  world.replayHardCut = false;
  replayPlay = [];
  useGame.getState().setReplay(false);
  if (kind === "pause") {
    if (pauseHold) applyReplaySnap(pauseHold);
    pauseHold = null;
    world.faceoffA = true;
    return;
  }
  replayN = 0;
  replayW = 0;
  pauseHold = null;
  resetWorld({ keepScore: true });
  world.faceoffA = true;
}

export function replayHasFootage(): boolean {
  return replayN >= 12;
}

export function beginJumboReplay(): void {
  jumboPlay = trimReplayDead(dumpReplayBuf());
  jumboOn = jumboPlay.length >= 8;
  jumboT = 0;
}

export function stepJumboReplay(dt: number): void {
  if (!jumboOn || jumboPlay.length < 2) return;
  jumboT += dt * 0.72;
  const maxT = (jumboPlay.length - 1) / 60;
  if (jumboT > maxT) jumboT = maxT;
}

export function jumboReplayView(): {
  puckX: number;
  puckZ: number;
  players: { x: number; z: number; home: boolean }[];
} | null {
  if (!jumboOn || !jumboPlay.length) return null;
  const i = Math.min(jumboPlay.length - 1, Math.max(0, Math.floor(jumboT * 60)));
  const snap = jumboPlay[i];
  if (!snap) return null;
  return {
    puckX: snap.puck.x,
    puckZ: snap.puck.z,
    players: snap.bodies.map((b, idx) => ({
      x: b.x,
      z: b.z,
      home: world.skaters[idx]?.side === "home",
    })),
  };
}

function seedPauseReplayCam(): void {
  const p = world.puck;
  world.replayCam.lx = p.x;
  world.replayCam.ly = Math.max(0.4, p.y);
  world.replayCam.lz = p.z;
  world.replayCam.theta = 2.15;
  world.replayCam.phi = 0.82;
  world.replayCam.radius = 14;
}

export function beginPauseReplay(): boolean {
  if (world.replay || replayN < 12) return false;
  pauseHold = {
    puck: {
      x: world.puck.x,
      z: world.puck.z,
      y: world.puck.y,
      vx: world.puck.vx,
      vz: world.puck.vz,
      vy: world.puck.vy,
      owner: world.puck.owner,
    },
    userId: world.userId,
    bodies: world.skaters.map(snapBody),
    ref: snapRef(),
    ref2: snapRef2(),
    rage: snapRage(),
  };
  const raw = trimReplayDead(dumpReplayBuf());
  replayPlay = raw;
  world.replay = true;
  world.replayKind = "pause";
  world.replayHardCut = true;
  world.replayPlaying = true;
  world.replayT = 0;
  world.replayNet = world.puck.x >= 0 ? 1 : -1;
  useGame.getState().setReplay(true);
  if (!replayPlay[0]) return false;
  applyReplaySnap(replayPlay[0]);
  seedPauseReplayCam();
  return true;
}

export function rewindPauseReplay(): void {
  if (world.replayKind !== "pause") return;
  world.replayT = Math.max(0, world.replayT - 2);
  world.replayHardCut = true;
  const i = Math.min(replayPlay.length - 1, Math.floor(world.replayT * 60));
  if (replayPlay[i]) applyReplaySnap(replayPlay[i]!);
}

export function stopPauseReplay(): void {
  if (world.replayKind !== "pause") return;
  endReplay();
}

function tickPauseReplayCam(dt: number, act: Actions): void {
  const cam = world.replayCam;
  const mx = -act.moveX;
  if (act.yDown) {
    cam.theta -= mx * 1.85 * dt;
    cam.phi = Math.max(0.12, Math.min(1.48, cam.phi - act.moveY * 1.25 * dt));
  } else {
    const s = Math.sin(cam.theta);
    const c = Math.cos(cam.theta);
    const k = cam.radius * 0.9 * dt;
    cam.lx += (-s * mx - c * act.moveY) * k;
    cam.lz += (c * mx - s * act.moveY) * k;
  }
  if (act.zoomIn || act.xDown) cam.radius = Math.max(3.6, cam.radius - 18 * dt);
  if (act.zoomOut || act.bDown) cam.radius = Math.min(96, cam.radius + 18 * dt);
}

function stepReplay(dt: number, act: Actions): void {
  if (!replayPlay.length) {
    endReplay();
    return;
  }
  if (world.replayKind === "pause") {
    if (act.viewPress) {
      endReplay();
      return;
    }
    if (act.aEdge) world.replayPlaying = !world.replayPlaying;
    tickPauseReplayCam(dt, act);
    let rate = world.replayPlaying ? 1 : 0;
    if (act.ltDown) rate = -3.4;
    else if (act.rtDown) rate = 3.4;
    else if (act.lbDown) rate = -0.28;
    else if (act.rbDown) rate = 0.28;
    const maxT = (replayPlay.length - 1) / 60;
    world.replayT = Math.max(0, Math.min(maxT, world.replayT + dt * rate));
    const i = Math.min(replayPlay.length - 1, Math.floor(world.replayT * 60));
    applyReplaySnap(replayPlay[i]!);
    return;
  }
  if (act.aEdge || act.bEdge || act.xEdge || act.yEdge) {
    endReplay();
    return;
  }
  world.replayT += dt;
  const i = Math.min(replayPlay.length - 1, Math.floor(world.replayT * 60));
  applyReplaySnap(replayPlay[i]!);
  if (i >= replayPlay.length - 1) endReplay();
}

function scoredOnGoalie(): Skater | undefined {
  if (world.whistle !== "goal" || !world.goalSide) return undefined;
  const side: "home" | "away" = world.goalSide === "home" ? "away" : "home";
  return world.skaters.find((s) => s.kind === "goalie" && s.side === side);
}

function stepGoalieClear(dt: number): void {
  const g = scoredOnGoalie();
  if (!g) return;
  const t = world.stoppageT;
  const puck = world.puck;
  const creaseX = defendDir(g.side) * (GOAL_LINE_X - 0.9);
  const out = attackDir(g.side);
  if (t < 0.55) {
    const dx = puck.x - g.x;
    const dz = puck.z - g.z;
    const d = Math.hypot(dx, dz) || 1;
    integrateSkater(g, dx / d, dz / d, Math.min(1, 0.35 + d * 0.55), false, dt);
    g.yaw = turnToward(g.yaw, dx, dz, 9, dt);
    g.coverPose = Math.max(g.coverPose, 0.42);
    g.stun = 0;
    return;
  }
  if (t < 0.95) {
    g.coverPose = Math.min(1, g.coverPose + dt * 2.8);
    g.vx *= Math.exp(-6 * dt);
    g.vz *= Math.exp(-6 * dt);
    g.x += g.vx * dt;
    g.z += g.vz * dt;
    collideSkater(g);
    const gp = goalieGlovePuck(g);
    if (segmentHitsCage(puck.x, puck.z, gp.x, gp.z)) return;
    puck.owner = g.id;
    puck.x = gp.x;
    puck.z = gp.z;
    puck.y = Math.max(0.16, gp.y * 0.45);
    puck.vx = 0;
    puck.vz = 0;
    puck.vy = 0;
    return;
  }
  if (t < 1.22) {
    if (puck.owner === g.id) {
      launchPuck(g, out * (8.2 + Math.random() * 2.4), (Math.random() - 0.5) * 4.2, 1.55);
      g.coverPose = 0.48;
    }
    g.coverPose = Math.max(0.22, g.coverPose - dt * 0.8);
    return;
  }
  g.coverPose = Math.max(0.12, g.coverPose - dt * 1.6);
  const dx = creaseX - g.x;
  const dz = -g.z;
  const d = Math.hypot(dx, dz) || 1;
  integrateSkater(g, dx / d, dz / d, Math.min(0.72, d / 2.2), false, dt);
  g.yaw = turnToward(g.yaw, -Math.sin(faceYaw(g.side)), -Math.cos(faceYaw(g.side)), 5, dt);
}

function stepGoalPuck(dt: number): void {
  if (world.stoppageT < 1.22) return;
  const puck = world.puck;
  const prevX = puck.x;
  const prevZ = puck.z;
  const prevY = puck.y;
  puck.x += puck.vx * dt;
  puck.z += puck.vz * dt;
  puck.y += puck.vy * dt;
  puck.vy -= 12 * dt;
  if (puck.y <= PUCK_Y) {
    puck.y = PUCK_Y;
    if (puck.vy < 0) puck.vy *= -0.22;
    if (Math.abs(puck.vy) < 0.35) puck.vy = 0;
  }
  puck.vx *= Math.exp(-0.55 * dt);
  puck.vz *= Math.exp(-0.55 * dt);
  bouncePuckCage(puck, prevX, prevZ, prevY);
  containPuckBoards(puck);
}

let goalPileX = 0;
let goalPileZ = 0;
let goalPileSet = false;

export type CheerPose = {
  kind: 0 | 1 | 2 | 3;
  hand: 0 | 1;
  straight: 0 | 1;
  mate: number;
};

const cheerSlots: CheerPose[] = [];

export function cheerFor(id: number): CheerPose | null {
  return cheerSlots[id] ?? null;
}

function skaterCheerLead(side: "home" | "away"): Skater | undefined {
  return world.skaters.find((s) => s.side === side && s.kind !== "goalie" && s.smashKind <= 0);
}

function goalCrew(side: "home" | "away"): Skater[] {
  const out: Skater[] = [];
  for (const s of world.skaters) {
    if (s.side !== side || s.kind === "goalie" || s.smashKind > 0) continue;
    out.push(s);
  }
  return out;
}

function assignGoalCheer(side: "home" | "away", scorerId: number): void {
  cheerSlots.length = 0;
  const ring = goalCrew(side).filter((s) => s.id !== world.userId);
  const n = ring.length;
  const user = world.skaters[world.userId];
  const userIn = !!user && user.side === side && user.kind !== "goalie" && user.smashKind <= 0;
  const kinds = new Array<number>(n).fill(-1);
  let at = 0;
  const placePair = (k: number): boolean => {
    if (at + 1 >= n) return false;
    kinds[at] = k;
    kinds[at + 1] = k;
    at += 2;
    return true;
  };
  const first = Math.random() < 0.5 ? 0 : 1;
  const second = first === 0 ? 1 : 0;
  if (n >= 2) placePair(first);
  if (n >= 4 && n - at >= 2 && (n - at > 2 || Math.random() < 0.45)) placePair(second);
  const soloA = Math.random() < 0.5 ? 2 : 3;
  const soloB = soloA === 2 ? 3 : 2;
  let flip = Math.random() < 0.5;
  while (at < n) {
    let k = flip ? soloA : soloB;
    flip = !flip;
    if (k === 2 && n < 3) k = 3;
    if (k === 3 && ring[at]!.id === scorerId) k = n >= 3 ? 2 : first;
    kinds[at] = k;
    at++;
  }
  if (n > 1) {
    const rot = Math.floor(Math.random() * n);
    const spun = kinds.map((_, i) => kinds[(i + rot) % n]!);
    for (let i = 0; i < n; i++) kinds[i] = spun[i]!;
  }
  const pairStraight = new Map<number, 0 | 1>();
  for (let i = 0; i < n; i++) {
    const k = kinds[i]!;
    if (k !== 0 && k !== 1) continue;
    const prev = (i + n - 1) % n;
    const next = (i + 1) % n;
    const mateI = kinds[next] === k ? next : prev;
    if (kinds[mateI] !== k) continue;
    const a = ring[i]!.id;
    const b = ring[mateI]!.id;
    const key = a < b ? a * 32 + b : b * 32 + a;
    if (!pairStraight.has(key)) pairStraight.set(key, Math.random() < 0.5 ? 1 : 0);
    cheerSlots[a] = {
      kind: k as 0 | 1,
      hand: Math.random() < 0.5 ? 0 : 1,
      straight: pairStraight.get(key)!,
      mate: b,
    };
  }
  for (let i = 0; i < n; i++) {
    const id = ring[i]!.id;
    if (cheerSlots[id]) continue;
    let k = kinds[i]!;
    if ((k === 0 || k === 1) && n >= 3) k = 2;
    if (k === 3 && id === scorerId) k = n >= 3 ? 2 : 0;
    if (k === 2 && n < 3) k = id === scorerId ? 0 : 3;
    cheerSlots[id] = {
      kind: k as 0 | 1 | 2 | 3,
      hand: Math.random() < 0.5 ? 0 : 1,
      straight: Math.random() < 0.5 ? 1 : 0,
      mate: k === 3 ? scorerId : -1,
    };
  }
  if (userIn && user) {
    let partner: Skater | undefined;
    for (const s of ring) {
      const c = cheerSlots[s.id];
      if (c && c.mate < 0 && c.kind !== 2) {
        partner = s;
        break;
      }
    }
    if (partner) {
      const kind: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
      const straight: 0 | 1 = 0;
      cheerSlots[user.id] = {
        kind,
        hand: Math.random() < 0.5 ? 0 : 1,
        straight,
        mate: partner.id,
      };
      cheerSlots[partner.id] = {
        kind,
        hand: Math.random() < 0.5 ? 0 : 1,
        straight,
        mate: user.id,
      };
    } else if (user.id !== scorerId) {
      cheerSlots[user.id] = {
        kind: 3,
        hand: Math.random() < 0.5 ? 0 : 1,
        straight: 0,
        mate: scorerId,
      };
    } else {
      cheerSlots[user.id] = {
        kind: Math.random() < 0.5 ? 0 : 1,
        hand: Math.random() < 0.5 ? 0 : 1,
        straight: Math.random() < 0.5 ? 1 : 0,
        mate: ring[0]?.id ?? -1,
      };
    }
  }
  const ids = ring.map((s) => s.id);
  if (userIn && user) ids.push(user.id);
  const used = new Set(ids.map((id) => cheerSlots[id]?.kind));
  if (ids.length >= 3 && used.size < 2) {
    const id = ids[ids.length - 1]!;
    const cur = cheerSlots[id];
    if (cur) {
      let next: 0 | 1 | 2 | 3 = cur.kind === 0 ? 1 : cur.kind === 1 ? 0 : cur.kind === 2 ? 3 : 2;
      if (next === 3 && id === scorerId) next = 2;
      if (next === 2 && n < 3) next = cur.kind === 0 ? 1 : 0;
      cheerSlots[id] = {
        ...cur,
        kind: next,
        mate: next === 3 ? scorerId : next <= 1 ? cur.mate : -1,
      };
    }
  }
}

function packRadius(n: number): number {
  if (n <= 1) return 0.8;
  return 0.9 / (2 * Math.sin(Math.PI / n));
}

function spreadCheerPairs(mates: Skater[], base: { x: number; z: number }[]): void {
  const seen = new Set<number>();
  for (let i = 0; i < mates.length; i++) {
    const s = mates[i]!;
    const plan = cheerSlots[s.id];
    if (!plan || plan.mate < 0 || (plan.kind !== 0 && plan.kind !== 1)) continue;
    if (plan.mate === world.userId || seen.has(s.id)) continue;
    const j = mates.findIndex((m) => m.id === plan.mate);
    if (j < 0) continue;
    seen.add(s.id);
    seen.add(plan.mate);
    const want = plan.kind === 0 ? (plan.straight ? 0.78 : 0.74) : plan.straight ? 1.18 : 0.8;
    const ax0 = base[i]!.x;
    const az0 = base[i]!.z;
    const bx0 = base[j]!.x;
    const bz0 = base[j]!.z;
    const dx = bx0 - ax0;
    const dz = bz0 - az0;
    const d = Math.hypot(dx, dz) || 1;
    const mx = (ax0 + bx0) * 0.5;
    const mz = (az0 + bz0) * 0.5;
    const hx = (dx / d) * want * 0.5;
    const hz = (dz / d) * want * 0.5;
    base[i] = { x: mx - hx, z: mz - hz };
    base[j] = { x: mx + hx, z: mz + hz };
  }
}

const RAGE_NEAR = 6.5;
const RAGE_STICK = 1.66;
const RAGE_HAND_X = 0.14;
const RAGE_HAND_Y = 1.2;
const RAGE_HAND_Z = 0.34;

type RagePiece = {
  on: boolean;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  dx: number;
  dy: number;
  dz: number;
  vx: number;
  vy: number;
  vz: number;
  sx: number;
  sy: number;
  sz: number;
};

type StickRage = {
  id: number;
  kind: number;
  blade: RagePiece;
  shaft: RagePiece;
};

let stickRage: StickRage | null = null;

function blankPiece(): RagePiece {
  return {
    on: false,
    x: 0,
    y: 0,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    dx: 0,
    dy: 1,
    dz: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    sx: 0,
    sy: 0,
    sz: 0,
  };
}

function rageSpot(kind: number, sideSign: number): { x: number; y: number; z: number; sx: number; sz: number } {
  const mouth = sideSign * GOAL_LINE_X;
  const into = -sideSign;
  const post = kind === 3 ? -1 : 1;
  if (kind === 1) {
    const z = post * 0.46;
    return { x: mouth, y: GOAL_H, z, sx: mouth + into * 1.16, sz: z + post * 0.7 };
  }
  const z = post * (GOAL_W / 2);
  return { x: mouth, y: GOAL_H * 0.58, z, sx: mouth + into * 1.06, sz: z + post * 0.62 };
}

function rageHand(s: Skater): { x: number; y: number; z: number } {
  const yaw = s.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  return {
    x: s.x + RAGE_HAND_X * rx + RAGE_HAND_Z * fx,
    y: RAGE_HAND_Y,
    z: s.z + RAGE_HAND_X * rz + RAGE_HAND_Z * fz,
  };
}

function snapRage(): StickRage | null {
  if (!stickRage) return null;
  return {
    id: stickRage.id,
    kind: stickRage.kind,
    blade: { ...stickRage.blade },
    shaft: { ...stickRage.shaft },
  };
}

function applyRage(r: StickRage | null | undefined): void {
  if (!r) {
    stickRage = null;
    return;
  }
  stickRage = {
    id: r.id,
    kind: r.kind,
    blade: { ...r.blade },
    shaft: { ...r.shaft },
  };
}

export function rageDraw(id: number): {
  t: number;
  hit: number;
  toss: number;
  bar: boolean;
  ironX: number;
  ironY: number;
  ironZ: number;
  blade: RagePiece;
  shaft: RagePiece;
} | null {
  if (!stickRage || stickRage.id !== id) return null;
  const s = world.skaters[id];
  if (!s || s.smashKind <= 0) return null;
  const iron = rageSpot(s.smashKind, defendDir(s.side));
  const hit = s.smashHit > 0 ? s.smashHit : 0;
  return {
    t: s.smash,
    hit,
    toss: hit > 0 ? hit + 0.4 : 0,
    bar: s.smashKind === 1,
    ironX: iron.x,
    ironY: iron.y,
    ironZ: iron.z,
    blade: stickRage.blade,
    shaft: stickRage.shaft,
  };
}

function maybeStickRage(homeScored: boolean): void {
  stickRage = null;
  if (!homeScored) return;
  const mode = useGame.getState().clockMode;
  if (mode !== "scrimmage" && mode !== "game") return;
  if (Math.random() >= 0.34) return;
  const side = defendDir("away");
  const mouth = side * GOAL_LINE_X;
  let best: Skater | undefined;
  let bestD = RAGE_NEAR;
  for (const s of world.skaters) {
    if (s.side !== "away" || s.kind === "goalie") continue;
    if (s.struck > 0.45 || s.tumble !== 0) continue;
    const d = Math.hypot(s.x - mouth, s.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (!best) return;
  const post = Math.abs(best.z) < 0.35 ? (Math.random() < 0.5 ? 1 : -1) : best.z >= 0 ? 1 : -1;
  const bar = Math.random() < 0.5;
  best.smashKind = bar ? 1 : post > 0 ? 2 : 3;
  best.smash = 0;
  best.smashHit = 0;
  best.celebrate = 0;
  best.windup = 0;
  best.follow = 0;
  best.poke = 0;
  best.deke = 0;
  best.hit = 0;
  best.stun = 0;
  best.struck = 0;
  best.dive = 0;
  best.tumble = 0;
  stickRage = { id: best.id, kind: best.smashKind, blade: blankPiece(), shaft: blankPiece() };
}

function kickPiece(
  p: RagePiece,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  vx: number,
  vy: number,
  vz: number,
): void {
  p.on = true;
  p.x = x;
  p.y = y;
  p.z = z;
  p.dx = dx;
  p.dy = dy;
  p.dz = dz;
  p.vx = vx;
  p.vy = vy;
  p.vz = vz;
  p.rx = 0;
  p.ry = 0;
  p.rz = 0;
  p.sx = (Math.random() - 0.5) * 16;
  p.sy = (Math.random() - 0.5) * 14;
  p.sz = (Math.random() - 0.5) * 16;
}

function stepRagePiece(p: RagePiece, dt: number): void {
  if (!p.on) return;
  p.vy -= 11 * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  p.rx += p.sx * dt;
  p.ry += p.sy * dt;
  p.rz += p.sz * dt;
  if (p.y < 0.05) {
    p.y = 0.05;
    if (p.vy < 0) p.vy *= -0.32;
    p.vx *= Math.exp(-1.6 * dt);
    p.vz *= Math.exp(-1.6 * dt);
    p.sx *= Math.exp(-1.2 * dt);
    p.sy *= Math.exp(-1.2 * dt);
    p.sz *= Math.exp(-1.2 * dt);
    if (Math.abs(p.vy) < 0.35) p.vy = 0;
  }
  const ice = resolveRink(p.x, p.z, 0.08);
  if (ice.hit && p.y < wallTop(ice.nx, ice.nz, ice.x, ice.z)) {
    p.x = ice.x;
    p.z = ice.z;
    const b = bounce(p.vx, p.vz, ice.nx, ice.nz, 0.3);
    p.vx = b.vx;
    p.vz = b.vz;
  }
}

function stepStickRage(dt: number): void {
  if (!stickRage) return;
  const s = world.skaters[stickRage.id];
  if (!s || s.smashKind <= 0) return;
  s.smash += dt;
  s.poke = 0;
  s.windup = 0;
  s.follow = 0;
  const iron = rageSpot(s.smashKind, defendDir(s.side));
  const dx = iron.sx - s.x;
  const dz = iron.sz - s.z;
  const d = Math.hypot(dx, dz) || 1;
  if (s.smashHit <= 0 && (d < 0.42 || (s.smash > 1.7 && d < 0.95))) {
    s.smashHit = Math.max(0.8, s.smash + 0.52);
  }
  if (d > 0.32 && (s.smashHit <= 0 || s.smash < s.smashHit)) {
    integrateSkater(s, dx / d, dz / d, 1, false, dt);
  } else {
    s.vx *= Math.exp(-8 * dt);
    s.vz *= Math.exp(-8 * dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    collideSkater(s);
    s.stride += Math.hypot(s.vx, s.vz) * 2.35 * dt;
  }
  s.yaw = turnToward(s.yaw, iron.x - s.x, iron.z - s.z, 12, dt);
  stepRagePiece(stickRage.blade, dt);
  stepRagePiece(stickRage.shaft, dt);
  const hand = rageHand(s);
  let bdx = hand.x - iron.x;
  let bdy = hand.y - iron.y;
  let bdz = hand.z - iron.z;
  const reach = Math.hypot(bdx, bdy, bdz) || 1;
  const maxReach = RAGE_STICK * 0.9;
  let bx = iron.x;
  let by = iron.y;
  let bz = iron.z;
  if (reach > maxReach) {
    const sc = maxReach / reach;
    bx = hand.x - bdx * sc;
    by = hand.y - bdy * sc;
    bz = hand.z - bdz * sc;
  }
  const dlen = Math.hypot(hand.x - bx, hand.y - by, hand.z - bz) || 1;
  const dir = { x: (hand.x - bx) / dlen, y: (hand.y - by) / dlen, z: (hand.z - bz) / dlen };
  const h = heading(s.yaw);
  const post = s.smashKind === 3 ? -1 : 1;
  if (!stickRage.blade.on && s.smashHit > 0 && s.smash >= s.smashHit) {
    kickPiece(
      stickRage.blade,
      bx,
      by,
      bz,
      dir.x,
      dir.y,
      dir.z,
      -h.fx * (3.4 + Math.random() * 1.8) + post * h.fz * 1.4,
      3.6 + Math.random() * 1.6,
      -h.fz * (3.4 + Math.random() * 1.8) - post * h.fx * 1.4,
    );
  }
  if (!stickRage.shaft.on && s.smashHit > 0 && s.smash >= s.smashHit + 0.4) {
    kickPiece(
      stickRage.shaft,
      bx + dir.x * RAGE_STICK * 0.75,
      by + dir.y * RAGE_STICK * 0.75,
      bz + dir.z * RAGE_STICK * 0.75,
      dir.x,
      dir.y,
      dir.z,
      -h.fx * (5.2 + Math.random() * 1.6) - post * h.fz * 1.8,
      4.4 + Math.random() * 1.4,
      -h.fz * (5.2 + Math.random() * 1.6) + post * h.fx * 1.8,
    );
  }
}

function stepGoalCelebrate(dt: number): void {
  const scorer = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
  if (!scorer) return;
  const side = scorer.side;
  const user = world.skaters[world.userId];
  const userLeads = !!user && user.side === side && user.kind !== "goalie";
  let lead = userLeads && user ? user : scorer;
  if (lead.kind === "goalie") {
    const mate = skaterCheerLead(side);
    if (mate) lead = mate;
  }
  for (const s of world.skaters) {
    if (s.kind !== "goalie" || s.side !== side || s.celebrate <= 0) continue;
    if (world.whistle !== "goal") continue;
    s.celebrate = Math.max(0, s.celebrate - dt);
    s.coverPose = 0;
    s.vx *= Math.exp(-8 * dt);
    s.vz *= Math.exp(-8 * dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    const atk = attackDir(s.side);
    s.yaw = turnToward(s.yaw, atk, 0, 7, dt);
    collideSkater(s);
  }
  if (world.stoppageT < 0.5) goalPileSet = false;
  else if (!goalPileSet) {
    goalPileX = lead.x;
    goalPileZ = lead.z;
    goalPileSet = true;
  }
  const forming = world.stoppageT < 0.5;
  const ax = forming ? lead.x : goalPileX;
  const az = forming ? lead.z : goalPileZ;
  const mates: Skater[] = [];
  for (const s of world.skaters) {
    if (s.kind === "goalie" || s.side !== side) continue;
    if (world.whistle === "goal" && s.celebrate > 0) s.celebrate = Math.max(0, s.celebrate - dt);
    if (s.id === world.userId) continue;
    mates.push(s);
  }
  const n = mates.length;
  const lsp = Math.hypot(lead.vx, lead.vz);
  const ring = forming ? 1.05 : packRadius(n);
  const spots: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ang = n > 0 ? (i / n) * Math.PI * 2 + 0.55 : 0;
    spots.push({ x: ax + Math.cos(ang) * ring, z: az + Math.sin(ang) * ring });
  }
  if (!forming) spreadCheerPairs(mates, spots);
  let i = 0;
  for (const s of mates) {
    const spot = spots[i]!;
    i++;
    if (forming && s.id === lead.id) {
      s.vx *= Math.exp(-2.2 * dt);
      s.vz *= Math.exp(-2.2 * dt);
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      collideSkater(s);
      continue;
    }
    if (s.celebrate <= 0.05 && world.whistle === "goal") {
      const ox = s.x - ax;
      const oz = s.z - az;
      const od = Math.hypot(ox, oz) || 1;
      integrateSkater(s, ox / od, oz / od, od > 7 ? 0.12 : 0.7, false, dt);
      continue;
    }
    const tx = spot.x;
    const tz = spot.z;
    const dx = tx - s.x;
    const dz = tz - s.z;
    const d = Math.hypot(dx, dz) || 1;
    let dirx = dx / d;
    let dirz = dz / d;
    if (forming && lsp > 1.5 && d < 2.2) {
      dirx = dirx * 0.3 + (lead.vx / lsp) * 0.7;
      dirz = dirz * 0.3 + (lead.vz / lsp) * 0.7;
      const dl = Math.hypot(dirx, dirz) || 1;
      dirx /= dl;
      dirz /= dl;
    }
    const mag = forming ? (d < 0.28 && lsp < 1 ? 0.04 : 1) : d < 0.22 ? 0.02 : d < 1.6 ? 0.48 : 0.86;
    integrateSkater(s, dirx, dirz, mag, forming, dt);
    const plan = cheerSlots[s.id];
    const mate = plan && plan.mate >= 0 ? world.skaters[plan.mate] : undefined;
    const faceMate =
      !forming &&
      !!mate &&
      d < 3.2 &&
      (plan!.kind === 0 || plan!.kind === 1 || plan!.kind === 3);
    if (faceMate && mate) s.yaw = turnToward(s.yaw, mate.x - s.x, mate.z - s.z, 8, dt);
    else if (d < 3.2) s.yaw = turnToward(s.yaw, ax - s.x, az - s.z, 8, dt);
  }
}

function stepPlay(dt: number, act: Actions): void {
  offsideTouchSide = 0;
  userWinding = false;
  userStickCommit = false;
  const ui = useGame.getState();
  world.time += dt;

  if (world.replay) {
    dropWingClaims();
    stepReplay(dt, act);
    return;
  }

  if (world.periodOver) {
    dropWingClaims();
    if (ui.clockMode === "drill") releaseDrillNetPuck(world.puck);
    return;
  }

  stepBenchDump(dt);
  if (world.lineBrawl) {
    dropWingClaims();
    stepLineBrawl(dt, act);
    return;
  }

  if (ui.clockMode === "drill" && !world.stoppage && !world.drillWon && !drillDropLive()) {
    world.periodClock = Math.max(0, world.periodClock - dt);
    const shown = Math.floor(world.periodClock);
    if (shown !== ui.periodClock) ui.setPeriodClock(shown);
    if (world.periodClock <= 0) {
      world.periodOver = true;
      world.stoppage = true;
      world.stoppageT = 0;
      world.whistle = null;
      clearDelayedOffside();
      world.puck.owner = null;
      world.puck.vx = 0;
      world.puck.vz = 0;
      world.puck.vy = 0;
      releaseDrillNetPuck(world.puck);
      ui.setPeriodOver(true);
      ui.setPeriodClock(0);
      ui.setHasPuck(false);
      dropWingClaims();
      return;
    }
  }

  if (ui.clockMode === "game" && !world.stoppage && !world.faceoff) {
    const minutes = Math.max(1, Math.min(5, ui.gameMinutes));
    world.periodClock = Math.max(0, world.periodClock - dt * (20 / minutes));
    const shown = Math.floor(world.periodClock);
    if (shown !== ui.periodClock) ui.setPeriodClock(shown);
    if (world.periodClock <= 0) {
      world.periodOver = true;
      world.stoppage = true;
      world.stoppageT = 0;
      world.whistle = null;
      clearDelayedOffside();
      world.puck.owner = null;
      world.puck.vx = 0;
      world.puck.vz = 0;
      world.puck.vy = 0;
      ui.setPeriodOver(true);
      ui.setPeriodClock(0);
      ui.setWhistle(null);
      ui.setHasPuck(false);
      const winner: "home" | "away" | null =
        ui.homeScore > ui.awayScore ? "home" : ui.awayScore > ui.homeScore ? "away" : null;
      if (winner) {
        let lead: Skater | undefined;
        for (const s of world.skaters) {
          if (s.side !== winner || s.kind === "goalie") continue;
          s.celebrate = 8;
          if (!lead || s.kind === "winger") lead = s;
        }
        if (lead) {
          world.lastShooter = lead.id;
          assignGoalCheer(winner, lead.id);
        }
      }
      dropWingClaims();
      return;
    }
  }

  if (world.stoppage) {
    dropWingClaims();
    world.stoppageT += dt;
    if (world.whistle === "goal" && !world.periodOver) {
      if (world.stoppageT > 0.12 && act.bEdge) {
        resetWorld({ keepScore: true });
        world.faceoffA = true;
        return;
      }
      if (act.aEdge) changePlayer();
    }
    if (world.whistle === "goal") {
      stepGoalCelebrate(dt);
      stepStickRage(dt);
      stepGoalieClear(dt);
      stepGoalPuck(dt);
    }
    const user = world.skaters[world.userId];
    if (
      world.offsideCarrier !== null &&
      (world.userId !== world.offsideCarrier || world.skaters[world.offsideCarrier]?.side !== "home")
    ) {
      if (world.puck.owner === world.offsideCarrier) world.puck.owner = null;
      world.offsideCarrier = null;
    }
    const offsideCarry =
      world.whistle === "offside" &&
      world.offsideCarrier !== null &&
      user?.id === world.offsideCarrier &&
      world.puck.owner === user.id;
    if (user && user.kind !== "goalie") {
      const wx = world.camRx * act.moveX + world.camFx * act.moveY;
      const wz = world.camRz * act.moveX + world.camFz * act.moveY;
      const mag = Math.hypot(act.moveX, act.moveY);
      if (offsideCarry) {
        const aim = shotAim(act);
        if (!world.windupCancel && act.xTap && world.time - world.lastShoot > 0.25) {
          doShot(user, aim.mx, aim.my, false, world.shotWindupT);
        }
        if (!world.windupCancel && act.xHoldRel && world.time - world.lastShoot > 0.25) {
          doShot(user, aim.mx, aim.my, true, world.shotWindupT);
        }
        if (act.yEdge) {
          user.deke = 1.05;
          applyDeke(user);
        } else if (act.yDown && user.deke > 0.08) {
          user.deke = Math.max(user.deke, 0.5);
        }
        if (user.deke > 0) tickDeke(user, dt);
        if (act.xDown && !world.windupCancel) {
          world.shotWindupT += dt;
          user.windup = Math.min(1, world.shotWindupT / 1);
          if (act.bEdge) {
            world.windupCancel = true;
            user.windup = 0;
            world.shotWindupT = 0;
          } else {
            userWinding = true;
          }
        } else if (user.follow <= 0) {
          user.windup = Math.max(0, user.windup - dt * 3);
          if (!act.xDown) world.shotWindupT = 0;
        }
        if (!act.xDown) world.windupCancel = false;
      } else {
        if (act.yEdge) {
          user.hit = 0.55;
          beginUserCheck();
          const g = goalieInStickRange(user);
          if (g) bumpCreasePoke(g);
        }
        if (act.xEdge && world.whistle !== "goal") {
          user.poke = 0.34;
          const g = goalieInStickRange(user);
          if (g) bumpCreasePoke(g);
        }
      }
      if (user.hit > 0) applyHit(user);
      integrateSkater(user, wx, wz, mag, world.whistle === "goal" ? false : act.burst, dt);
      keepInBowl(user);
      refreshUserStickCommit(act);
      let retaliator: Skater | undefined;
      if (world.creasePokeN >= 2 && world.creasePokeGoalie !== null) {
        const g = world.skaters[world.creasePokeGoalie];
        if (g) {
          let bestD = 99;
          for (const s of world.skaters) {
            if (s.side !== g.side || s.kind === "goalie" || s.id === user.id) continue;
            if (s.struck > 0.25 || s.stun > 0.05) continue;
            const d = Math.hypot(s.x - user.x, s.z - user.z);
            if (d < bestD) {
              bestD = d;
              retaliator = s;
            }
          }
        }
      }
      for (const s of world.skaters) {
        if (s.id === world.userId || s.kind === "goalie") continue;
        if (s.smashKind > 0) continue;
        if (world.whistle === "goal" && s.side === (world.goalSide ?? s.side)) continue;
        if (retaliator && s.id === retaliator.id) {
          const dx = user.x - s.x;
          const dz = user.z - s.z;
          const d = Math.hypot(dx, dz) || 1;
          s.yaw = Math.atan2(-dx, -dz);
          integrateSkater(s, dx / d, dz / d, Math.min(1, d / 1.6), d > 2.2, dt);
          if (d < 2.35 && s.hit <= 0 && s.struck <= 0.12) {
            s.hit = 0.52;
            armCheckSwing(s);
          }
          if (s.hit > 0) applyHit(s);
          keepInBowl(s);
          continue;
        }
        const deadShot =
          world.whistle === "offside" && world.offsideCarrier !== null && world.puck.owner === null;
        if (deadShot) {
          s.vx *= Math.exp(-4 * dt);
          s.vz *= Math.exp(-4 * dt);
          s.x += s.vx * dt;
          s.z += s.vz * dt;
        } else {
          const ai = thinkWithoutPuck(s);
          integrateSkater(s, ai.wx, ai.wz, Math.min(0.7, ai.mag), false, dt);
        }
        keepInBowl(s);
      }
    } else {
      const clearingId = scoredOnGoalie()?.id;
      for (const s of world.skaters) {
        if (s.kind === "goalie" && (s.stun > 0.04 || s.struck > 0.18 || s.tumble !== 0)) continue;
        if (s.id === clearingId) continue;
        if (s.smashKind > 0) continue;
        s.vx *= Math.exp(-4 * dt);
        s.vz *= Math.exp(-4 * dt);
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        if (s.struck > 0) s.struck = Math.max(0, s.struck - dt);
      }
      if (world.whistle !== "goal") {
        world.puck.vx *= Math.exp(-3 * dt);
        world.puck.vz *= Math.exp(-3 * dt);
      } else {
        world.puck.vx *= Math.exp(-0.35 * dt);
        world.puck.vz *= Math.exp(-0.35 * dt);
      }
    }
    const clearing = scoredOnGoalie();
    for (const s of world.skaters) {
      if (s.kind !== "goalie") continue;
      if (clearing && s.id === clearing.id) continue;
      if (s.stun <= 0.04 && s.struck <= 0.18 && s.tumble === 0) continue;
      decayGoalieDown(s, dt);
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.vx *= Math.exp(-2.2 * dt);
      s.vz *= Math.exp(-2.2 * dt);
      collideSkater(s);
      keepInBowl(s);
    }
    separateSkaters();
    for (const s of world.skaters) keepInBowl(s);
    if (world.whistle === "offside" && world.offsideCarrier !== null) {
      stepWhistlePuck(dt);
      const mine = world.puck.owner === world.userId;
      if (ui.hasPuck !== mine) ui.setHasPuck(mine);
    }
    stepRef(dt);
    updateCoverPose(dt);
    if (world.whistle === "goal") recordReplay();
    if (world.stoppageT > 3.2) {
      if (world.periodOver) return;
      resetWorld({ keepScore: true });
    }
    return;
  }

  const wings = ui.controlProfile === "wings";
  holdGoalie(wings ? act.lbDown : act.ltDown);
  const user = world.skaters[world.userId];
  if (!user) {
    dropWingClaims();
    return;
  }

  if (world.faceoff) {
    dropWingClaims();
    const taker = world.skaters[world.homeDot] ?? user;
    stepFaceoff(dt, act, taker);
    for (const s of world.skaters) {
      if (s.id === world.homeDot || s.id === world.awayDot || s.kind === "goalie") {
        if (s.kind === "goalie" && s.id !== world.userId) thinkGoalie(s, dt);
        continue;
      }
      if (world.faceoffPhase !== "live" && s.kind === "winger") continue;
      const ai = thinkWithoutPuck(s);
      integrateSkater(s, ai.wx, ai.wz, ai.mag * 0.5, false, dt);
      keepOutOfCircle(s);
      keepInBowl(s);
    }
    if (user.kind === "goalie") {
      const wx = world.camRx * act.moveX + world.camFx * act.moveY;
      const wz = world.camRz * act.moveX + world.camFz * act.moveY;
      integrateSkater(user, wx, wz, Math.hypot(act.moveX, act.moveY), act.burst, dt);
      keepInBowl(user);
    }
    stepRef(dt);
    separateSkaters();
    return;
  }

  const hasPuck = world.puck.owner === user.id;
  const wx = world.camRx * act.moveX + world.camFx * act.moveY;
  const wz = world.camRz * act.moveX + world.camFz * act.moveY;
  const mag = Math.hypot(act.moveX, act.moveY);
  if (
    mag > 0.12 ||
    act.aDown ||
    act.xDown ||
    act.yDown ||
    act.bDown ||
    act.burst ||
    act.rtDown ||
    act.ltDown ||
    (wings && (act.lbDown || act.rbDown))
  ) {
    world.lastUserActT = world.time;
  }
  if (world.faceoffA && !act.aDown && !act.aTap && !act.aHoldRel && !act.aEdge) {
    world.faceoffA = false;
  }
  const aReady = !world.faceoffA;

  if (hasPuck) {
    if (user.kind === "goalie") {
      const aim = shotAim(act);
      if (aReady && act.aTap && world.time - world.lastPass > 0.2) {
        doGoalieOutlet(user, aim.mx, aim.my, false);
      }
      if (aReady && act.aHoldRel && world.time - world.lastPass > 0.2) {
        doGoalieOutlet(user, aim.mx, aim.my, true);
      }
      if ((act.xTap || act.xHoldRel) && world.time - world.lastShoot > 0.25) {
        doShot(user, act.moveX, act.moveY, act.xHoldRel, world.shotWindupT);
      }
    } else {
      let passedThis = false;
      if (aReady && act.aTap && world.time - world.lastPass > 0.2) {
        doPass(user, act.moveX, act.moveY, false);
        passedThis = true;
      }
      if (aReady && act.aHoldRel && world.time - world.lastPass > 0.2) {
        doPass(user, act.moveX, act.moveY, true);
        passedThis = true;
      }
      if (passedThis && (act.xDown || act.xEdge || act.xTap || act.xHeld || act.xHoldRel)) {
        world.oneTimerArmed = true;
        world.oneTimerPass = false;
        world.oneTimerSaucer = false;
      }
      const snapped = !passedThis && tryReboundSnap(user, act);
      const aim = shotAim(act);
      const shotWait = ui.clockMode === "drill" ? 0.02 : 0.25;
      if (
        !passedThis &&
        !snapped &&
        !world.windupCancel &&
        act.xTap &&
        world.time - world.lastShoot > shotWait
      ) {
        doShot(user, aim.mx, aim.my, false, world.shotWindupT);
      }
      if (
        !passedThis &&
        !snapped &&
        !world.windupCancel &&
        act.xHoldRel &&
        world.time - world.lastShoot > shotWait
      ) {
        doShot(user, aim.mx, aim.my, true, world.shotWindupT);
      }
      if (act.yEdge) {
        user.deke = 1.05;
        applyDeke(user);
      } else if (act.yDown && user.deke > 0.08) {
        user.deke = Math.max(user.deke, 0.5);
      }
    }
    if (user.deke > 0) tickDeke(user, dt);
    if (act.xDown && !world.windupCancel) {
      world.shotWindupT += dt;
      user.windup = Math.min(1, world.shotWindupT / 1);
      if (act.bEdge) {
        world.windupCancel = true;
        user.windup = 0;
        world.shotWindupT = 0;
      } else if (user.kind !== "goalie") {
        userWinding = true;
      }
    } else if (user.follow <= 0) {
      user.windup = Math.max(0, user.windup - dt * 3);
      if (!act.xDown) world.shotWindupT = 0;
    }
    if (!act.xDown) world.windupCancel = false;
  } else {
    const g = world.skaters.find((s) => s.side === "home" && s.kind === "goalie");
    const goalieHas = g !== undefined && world.puck.owner === g.id;
    const xGo = act.xEdge || act.xTap || act.xDown || act.xHoldRel;
    const aOneTimer = aReady && userPassInFlight() && act.aEdge;
    if (
      aReady &&
      goalieHas &&
      (act.aTap || act.aEdge || act.aHoldRel) &&
      world.time - world.lastPass > 0.12
    ) {
      const aim = shotAim(act);
      doGoalieOutlet(g, aim.mx, aim.my, act.aHoldRel);
    } else if (aOneTimer) {
      world.oneTimerArmed = true;
      world.oneTimerPass = true;
      world.oneTimerSlap = false;
      world.oneTimerSaucer = false;
      user.poke = 0;
    } else if (aReady && act.aEdge && !userPassInFlight()) {
      changePlayer();
    }
    const shotArm = xGo && !(world.oneTimerPass && !act.xEdge && !act.xTap && !act.xHoldRel);
    if (userPassInFlight() && shotArm) {
      world.oneTimerArmed = true;
      world.oneTimerPass = false;
      world.oneTimerSaucer = false;
      user.poke = 0;
    } else if (tryReboundSnap(user, act)) {
      user.poke = 0;
    } else if (act.xEdge && user.kind !== "goalie" && !world.oneTimerArmed && !userPassInFlight()) {
      user.poke = 0.34;
    }
    if (act.yEdge && user.kind !== "goalie") {
      user.hit = 0.42;
      beginUserCheck();
      if (cpuAttacking()) world.whiffPending = true;
    }
    if (
      (wings ? act.rbDown : act.rtDown) &&
      user.kind !== "goalie" &&
      user.stun <= 0.04 &&
      user.hit <= 0 &&
      !userPassInFlight() &&
      !world.oneTimerArmed
    ) {
      if (user.dive <= 0) user.poke = 0.52;
      user.dive = 1.5;
    } else if (user.dive > 1) {
      user.dive = 0.95;
    }
    if (!world.oneTimerArmed && user.kind !== "goalie") {
      if (act.xDown && !world.windupCancel) {
        world.shotWindupT += dt;
        user.windup = Math.min(1, world.shotWindupT / 1);
        if (act.bEdge) {
          world.windupCancel = true;
          user.windup = 0;
          world.shotWindupT = 0;
        }
      } else if (user.follow <= 0) {
        user.windup = Math.max(0, user.windup - dt * 3);
        if (!act.xDown) world.shotWindupT = 0;
      }
      if (!act.xDown) world.windupCancel = false;
    } else if (user.follow <= 0) {
      user.windup = Math.max(0, user.windup - dt * 3);
    }
  }

  if (world.oneTimerArmed && world.oneTimerPass) {
    world.oneTimerMx = act.moveX;
    world.oneTimerMy = act.moveY;
    if (act.aHeld || act.aHoldRel) world.oneTimerSaucer = true;
    user.poke = 0;
  } else if (world.oneTimerArmed) {
    const aim = shotAim(act);
    world.oneTimerMx = aim.mx;
    world.oneTimerMy = aim.my;
    if (act.xHeld && !world.windupCancel) {
      world.oneTimerSlap = true;
      world.shotWindupT += dt;
      const t = oneTimerReceiver();
      if (t) t.windup = Math.min(1, world.shotWindupT / 1);
      if (act.bEdge) {
        world.windupCancel = true;
        world.oneTimerSlap = false;
        world.shotWindupT = 0;
        if (t) t.windup = 0;
      }
    }
    if (!act.xDown) world.windupCancel = false;
  }

  tryFireArmedOneTimer();

  if (user.poke > 0) pokeCheck(user);
  if (user.hit > 0) {
    if (applyHit(user)) world.whiffPending = false;
  } else if (world.whiffPending) {
    world.whiffPending = false;
    if (cpuAttacking()) world.whiffUntil = world.time + 4.5;
  }

  let charge = 0;
  let kind: "pass" | "shot" | null = null;
  if (hasPuck && !world.faceoffA && act.aDown) {
    charge = act.aHeld ? 1 : 0.4;
    kind = "pass";
  } else if (act.xDown && !world.windupCancel && (hasPuck || world.shotWindupT > 0.28)) {
    charge = act.xHeld ? 1 : 0.4;
    kind = "shot";
  }
  if (act.xDown) {
    const aim = shotAim(act);
    slapMx = aim.mx;
    slapMy = aim.my;
  }
  if (ui.charge !== charge || ui.chargeKind !== kind) ui.setCharge(charge, kind);

  applyWingClaims(user, act, wings);

  if (
    user.kind === "goalie" &&
    !hasPuck &&
    mag < 0.16 &&
    !act.xDown &&
    !act.aDown &&
    goaliePlayLoose(user)
  ) {
    const spot = goalieRetrievePoint(user);
    skateGoalieTo(user, spot.x, spot.z, dt);
  } else {
    integrateSkater(user, wx, wz, mag, act.burst, dt);
  }
  keepInBowl(user);
  refreshUserStickCommit(act);

  for (const s of world.skaters) {
    if (s.id === world.userId || s.id === user.id) continue;
    if (s.id === world.wingL || s.id === world.wingR) {
      let sx = wx;
      let sz = wz;
      let sm = mag;
      if (userWinding) {
        const sp = Math.hypot(s.vx, s.vz);
        if (sp > 1) {
          sx = (s.vx / sp) * 0.35;
          sz = (s.vz / sp) * 0.35;
          sm = 0.35;
        } else {
          sx = 0;
          sz = 0;
          sm = 0;
        }
      }
      integrateSkater(s, sx, sz, sm, false, dt);
      keepInBowl(s);
      continue;
    }
    const ai = thinkAi(s, dt);
    if (s.kind !== "goalie") {
      integrateSkater(s, ai.wx, ai.wz, ai.mag, ai.burst, dt);
      keepInBowl(s);
    }
  }

  for (const s of world.skaters) {
    if (s.id === world.userId || s.id === user.id) continue;
    if (s.id === world.wingL || s.id === world.wingR) continue;
    cpuDefend(s);
    if (s.poke > 0) pokeCheck(s);
    if (s.hit > 0) applyHit(s);
  }

  separateSkaters();
  for (const s of world.skaters) keepInBowl(s);

  if (hasPuck && user.kind !== "goalie") {
    const idle =
      mag < 0.12 && !act.aDown && !act.xDown && !act.yDown && !act.bDown && !act.burst && user.deke <= 0;
    if (idle) {
      const n = nearestFoe(user);
      if (n.foe && n.d < 1.85) world.idlePokeT += dt;
      else world.idlePokeT = Math.max(0, world.idlePokeT - dt * 0.35);
      if (world.idlePokeT >= 2 && n.foe && n.d < 1.85 && !userStickCommit) {
        cpuIdlePoke(n.foe, user);
      }
    } else {
      world.idlePokeT = 0;
    }
  } else {
    world.idlePokeT = 0;
  }

  stepPuck(dt);
  if (!world.stoppage) checkCover(dt);
  updateCoverPose(dt);
  stepRef(dt);
  autoSwitchToHolder();
  if (world.wingL === world.userId || world.wingL === world.puck.owner) world.wingL = null;
  if (world.wingR === world.userId || world.wingR === world.puck.owner) world.wingR = null;

  const mine = world.puck.owner === world.userId;
  if (ui.hasPuck !== mine) ui.setHasPuck(mine);

  tickShotSpeed();
  recordReplay();
}

export function stepSim(dt: number): void {
  const act = readActions();
  if (stepPause(dt, act)) return;
  const ui = useGame.getState();
  if (!ui.playing) return;
  stepPlay(dt, act);
}

export function installControlsProbe(): void {
  window.__controlsTest = {
    getYaw: () => world.skaters[world.userId]?.yaw ?? 0,
    getSpeed: () => {
      const s = world.skaters[world.userId];
      return s ? Math.hypot(s.vx, s.vz) : 0;
    },
    setKeys: (codes: string[]) => setInjectedKeys(codes),
    getDebug: () => {
      const s = world.skaters[world.userId];
      const g = world.skaters.find((p) => p.kind === "goalie" && p.side === "away");
      return {
        yaw: s?.yaw ?? 0,
        x: s?.x ?? 0,
        z: s?.z ?? 0,
        userId: world.userId,
        camFx: world.camFx,
        camFz: world.camFz,
        camRx: world.camRx,
        camRz: world.camRz,
        faceoff: world.faceoff,
        owner: world.puck.owner ?? -1,
        phase:
          world.faceoffPhase === "hold"
            ? 0
            : world.faceoffPhase === "lower"
              ? 1
              : world.faceoffPhase === "fake"
                ? 2
                : world.faceoffPhase === "drop"
                  ? 3
                  : 4,
        faceT: world.faceoffT,
        puckY: world.puck.y,
        paused: useGame.getState().paused ? 1 : 0,
        playing: useGame.getState().playing ? 1 : 0,
        camMode:
          useGame.getState().camMode === "classic"
            ? 0
            : useGame.getState().camMode === "chase"
              ? 1
              : useGame.getState().camMode === "broadcast"
                ? 2
                : useGame.getState().camMode === "high"
                  ? 3
                  : 4,
        camAdjust: useGame.getState().camAdjust ? 1 : 0,
        freeCamLive: useGame.getState().freeCamLive ? 1 : 0,
        homeScore: useGame.getState().homeScore,
        awayScore: useGame.getState().awayScore,
        whistle: useGame.getState().whistle === "goal" ? 1 : useGame.getState().whistle === "cover" ? 2 : 0,
        puckX: world.puck.x,
        puckZ: world.puck.z,
        puckVx: world.puck.vx,
        lastShotDist: world.lastShotDist,
        homeWingerX: world.skaters.find((p) => p.side === "home" && p.kind === "winger" && p.id !== world.homeDot)?.x ?? 0,
        homeWingerZ: world.skaters.find((p) => p.side === "home" && p.kind === "winger" && p.id !== world.homeDot)?.z ?? 0,
        camX: (world as { camX?: number }).camX ?? 0,
        camY: (world as { camY?: number }).camY ?? 0,
        camZ: (world as { camZ?: number }).camZ ?? 0,
        idlePokeT: world.idlePokeT,
        faceX: world.faceX,
        faceZ: world.faceZ,
        wrapBehind: world.wrapBehind ? 1 : 0,
        goalieZ: g?.z ?? 0,
        goalieX: g?.x ?? 0,
        coverT: world.coverT,
        coverPose: g?.coverPose ?? 0,
        refLane: world.refLane,
        refZ: world.ref.z,
        ref2Z: world.ref2.z,
        userKind: s?.kind === "goalie" ? 1 : 0,
        homeKit: useGame.getState().homeKit,
        awayKit: useGame.getState().awayKit,
        awaySkate: world.skaters.filter((p) => p.side === "away" && p.kind !== "goalie").length,
        homeSkate: world.skaters.filter((p) => p.side === "home" && p.kind !== "goalie").length,
      };
    },
    setPose: (x: number, z: number, yaw: number) => {
      const s = world.skaters[world.userId];
      if (!s) return;
      s.x = x;
      s.z = z;
      s.yaw = yaw;
      s.vx = 0;
      s.vz = 0;
    },
    skipToLive: () => {
      world.faceoff = true;
      world.faceoffPhase = "live";
      world.faceoffT = 0;
      world.puck.x = world.faceX;
      world.puck.z = world.faceZ;
      world.puck.y = PUCK_Y;
      world.puck.owner = null;
      const drop = refForLane(dropperLane());
      drop.handY = PUCK_Y;
      drop.pose = "drop";
    },
    launchPuck: (x: number, z: number, vx: number, vz: number) => {
      world.faceoff = false;
      world.faceoffPhase = "live";
      world.stoppage = false;
      world.whistle = null;
      clearDelayedOffside();
      world.puck.owner = null;
      world.puck.x = x;
      world.puck.z = z;
      world.puck.y = PUCK_Y;
      world.puck.vx = vx;
      world.puck.vz = vz;
      world.puck.vy = 0;
      useGame.getState().setWhistle(null);
    },
    parkGoalies: () => {
      for (const s of world.skaters) {
        if (s.kind !== "goalie") continue;
        s.z = 1.55;
        s.trackZ = 1.55;
        s.trackVz = 0;
      }
    },
    tick: (n: number) => {
      const steps = Math.max(1, Math.min(400, Math.round(n)));
      for (let i = 0; i < steps; i++) stepSim(1 / 60);
    },
    forceCover: (side: "home" | "away" = "away", z = 1.6) => {
      const g = world.skaters.find((p) => p.kind === "goalie" && p.side === side);
      if (!g) return;
      world.faceoff = false;
      world.faceoffPhase = "live";
      world.stoppage = false;
      world.whistle = null;
      g.z = z;
      g.trackZ = z;
      world.puck.owner = g.id;
      world.puck.x = g.x;
      world.puck.z = z;
      world.puck.y = PUCK_Y;
      world.puck.vx = 0;
      world.puck.vz = 0;
      world.coverT = 0;
      world.coverSideZ = z;
      world.goalieSaveT = world.time;
      g.coverPose = 1;
      if (side === "home") world.userId = g.id;
      useGame.getState().setWhistle(null);
    },
    forceGoal: () => {
      const s = world.skaters[world.userId];
      if (s) world.lastShooter = s.id;
      world.puck.x = world.homeAttack * GOAL_LINE_X + world.homeAttack * 0.3;
      world.puck.z = 0;
      startStoppage("goal", world.homeAttack);
    },
  };
}

resetWorld();

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
      getDebug?: () => Record<string, number | boolean>;
      setPose?: (x: number, z: number, yaw: number) => void;
      skipToLive?: () => void;
      launchPuck?: (x: number, z: number, vx: number, vz: number) => void;
      parkGoalies?: () => void;
      tick?: (n: number) => void;
      forceGoal?: () => void;
      forceCover?: (side?: "home" | "away", z?: number) => void;
    };
  }
}
