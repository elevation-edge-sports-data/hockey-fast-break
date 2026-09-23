import {
  bounce,
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
  cageDepthAt,
  resolveCage,
  resolveRink,
  RINK_L,
  RINK_W,
} from "./rink";
import { readActions, setInjectedKeys, type Actions } from "./input";
import {
  LINEUP_CAP,
  lineupTotal,
  persistClockMode,
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
  whistle: "goal" | "cover" | "offside" | null;
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
  puckOz: 0 | 1 | -1;
  shotSpeedLive: boolean;
  shotSpeedMax: number;
  windupCancel: boolean;
  wrapBehind: boolean;
  wrapSide: number;
  practiceDropX: number;
  practiceDropZ: number;
  drillGone: boolean[];
  drillFlash: number[];
  drillShot: boolean;
  drillWon: boolean;
  drillElapsed: number;
  goalTicker: number;
  goalSide: "home" | "away" | null;
  goalieSaveT: number;
  coverSideZ: number;
  idlePokeT: number;
  aimCompassLock: "up" | "down" | "left" | "right" | null;
  aimCompassCam: "up" | "down" | "left" | "right" | null;
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
  whiffUntil: number;
  whiffPending: boolean;
  ppRelease: "home" | "away" | null;
  creasePokeN: number;
  creasePokeGoalie: number | null;
  homeAttack: 1 | -1;
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
const REF_STAND = 0.68;
const REF_BOARD_Z = RINK_W / 2 - 1.15;

function dropperLane(): 1 | -1 {
  if (Math.abs(world.faceZ) > 0.8) return world.faceZ >= 0 ? 1 : -1;
  return world.refLane >= 0 ? 1 : -1;
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
  return { g: [pick(), pick()], d: [pick(), pick()], o: [pick(), pick(), pick(), pick()] };
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
  puckOz: 0,
  shotSpeedLive: false,
  shotSpeedMax: 0,
  windupCancel: false,
  wrapBehind: false,
  wrapSide: 0,
  practiceDropX: 0,
  practiceDropZ: 0,
  drillGone: [false, false, false, false, false, false, false, false],
  drillFlash: [0, 0, 0, 0, 0, 0, 0, 0],
  drillShot: false,
  drillWon: false,
  drillElapsed: 0,
  goalTicker: 0,
  goalSide: null,
  goalieSaveT: -10,
  coverSideZ: 0,
  idlePokeT: 0,
  aimCompassLock: null,
  aimCompassCam: null,
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
  whiffUntil: -10,
  whiffPending: false,
  ppRelease: null,
  creasePokeN: 0,
  creasePokeGoalie: null,
  homeAttack: Math.random() < 0.5 ? 1 : -1,
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
  world.ppRelease = null;
  let homeLu = ui.liveHome;
  let awayLu = ui.liveAway;
  if (side === "home") {
    homeLu = releaseFromBox(homeLu);
    ui.setLiveHome(homeLu);
  } else if (side === "away") {
    awayLu = releaseFromBox(awayLu);
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
  world.shotWindupT = 0;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerMx = 0;
  world.oneTimerMy = 0;
  world.puckOz = 0;
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

resetSkaters();

export type DrillTarget = { col: number; row: number; pts: number };

const DRILL_SECONDS = 60;

function buildDrillTargets(cols: number, rows: number): DrillTarget[] {
  const out: DrillTarget[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const top = row === rows - 1;
      const side = col === 0 || col === cols - 1;
      if (!top && !side) continue;
      const corner = (row === rows - 1 || row === 0) && side;
      out.push({ col, row, pts: corner ? 20 : 10 });
    }
  }
  return out;
}

const DRILL_8 = buildDrillTargets(4, 3);
const DRILL_12 = buildDrillTargets(6, 4);

export function drillTargetList(): DrillTarget[] {
  return useGame.getState().drillTargets === 12 ? DRILL_12 : DRILL_8;
}

export function drillGrid(): { cols: number; rows: number } {
  return useGame.getState().drillTargets === 12 ? { cols: 6, rows: 4 } : { cols: 4, rows: 3 };
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

function resetDrill(): void {
  const n = drillTargetList().length;
  world.drillGone = Array.from({ length: n }, () => false);
  world.drillFlash = Array.from({ length: n }, () => 0);
  world.drillShot = false;
  world.drillWon = false;
  world.drillElapsed = 0;
  useGame.getState().setDrillScore(0);
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
  world.drillShot = false;
  useGame.getState().setHasPuck(true);
}

function recycleDrillPuck(): void {
  giveUserPuck();
}

function hitDrillTarget(i: number): void {
  if (i < 0 || world.drillGone[i]) return;
  world.drillGone[i] = true;
  world.drillFlash[i] = 0.28;
  const pts = drillTargetList()[i]!.pts;
  const ui = useGame.getState();
  ui.setDrillScore(ui.drillScore + pts);
  world.goalSide = "home";
  world.goalTicker = 0.48;
  ui.setGoalSide("home");
  if (world.drillGone.length > 0 && world.drillGone.every(Boolean)) {
    world.drillWon = true;
    world.drillElapsed = Math.max(0, DRILL_SECONDS - world.periodClock);
    world.goalTicker = 8;
    const u = world.skaters[world.userId];
    if (u) {
      u.celebrate = 8;
      world.lastShooter = u.id;
    }
    world.ref.pose = "goal";
    world.ref.poseT = 0;
    world.ref2.pose = "goal";
    world.ref2.poseT = 0;
  }
}

function tickDrill(dt: number, prevX: number, prevY: number, prevZ: number): boolean {
  if (useGame.getState().clockMode !== "drill") return false;
  for (let i = 0; i < world.drillFlash.length; i++) {
    if (world.drillFlash[i]! > 0) world.drillFlash[i] = Math.max(0, world.drillFlash[i]! - dt);
  }
  const puck = world.puck;
  if (world.drillWon) return true;
  if (!world.drillShot || puck.owner !== null) return true;
  if (world.time - world.lastShoot < 0.06) return true;
  const mouth = GOAL_LINE_X;
  const crossed = (prevX - mouth) * (puck.x - mouth) <= 0 && puck.x !== prevX && prevX < mouth;
  const past = puck.x > mouth + 0.55;
  if (crossed) {
    const t = (mouth - prevX) / (puck.x - prevX || 1);
    const y = prevY + (puck.y - prevY) * t;
    const z = prevZ + (puck.z - prevZ) * t;
    const i = drillCellIndex(y, z);
    if (i >= 0) hitDrillTarget(i);
    if (!world.drillWon) recycleDrillPuck();
    return true;
  }
  if (past || world.time - world.lastShoot > 2.5) {
    recycleDrillPuck();
    return true;
  }
  const u = world.skaters[world.userId];
  if (u && puck.x < u.x - 0.45) {
    recycleDrillPuck();
    return true;
  }
  return true;
}

export function setPracticeDrop(x: number, z: number): void {
  const ice = resolveRink(x, z, 0.2);
  world.practiceDropX = ice.x;
  world.practiceDropZ = ice.z;
  if (useGame.getState().clockMode === "practice") {
    world.faceX = world.practiceDropX;
    world.faceZ = world.practiceDropZ;
  }
}

export function resetWorld(opts?: { keepScore?: boolean; keepReplay?: boolean }): void {
  const ui = useGame.getState();
  if (ui.clockMode === "practice") {
    world.faceX = world.practiceDropX;
    world.faceZ = world.practiceDropZ;
  } else if (ui.clockMode === "drill") {
    world.homeAttack = 1;
    world.faceX = GOAL_LINE_X - 9.2;
    world.faceZ = 0;
  }
  if (!opts?.keepScore) {
    if (ui.clockMode !== "practice") {
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
    ui.setLiveHome(ui.homeLineup);
    ui.setLiveAway(ui.awayLineup);
    if (ui.clockMode !== "drill") world.homeAttack = Math.random() < 0.5 ? 1 : -1;
    awayNums = rollAwayNums();
    world.aimCompassLock = null;
    world.aimCompassCam = null;
  }
  resetSkaters();
  if (!opts?.keepScore) ui.bumpLineup();
  if (ui.clockMode === "drill") {
    resetDrill();
    world.faceoff = false;
    world.faceoffPhase = "live";
    world.periodClock = DRILL_SECONDS;
    ui.setPeriodClock(DRILL_SECONDS);
    ui.setPeriodOver(false);
  }
  ui.setHasPuck(false);
  if (ui.clockMode === "drill") giveUserPuck();
  ui.setCharge(0, null);
  ui.setWhistle(null);
  ui.setSpeed(0);
  ui.setReplay(false);
}

function collideSkater(s: Skater): void {
  const ice = resolveRink(s.x, s.z, s.radius);
  if (ice.hit) {
    s.x = ice.x;
    s.z = ice.z;
    const b = bounce(s.vx, s.vz, ice.nx, ice.nz, s.kind === "goalie" ? 0.08 : 0.32);
    s.vx = b.vx;
    s.vz = b.vz;
  }
  const cage = resolveCage(s.x, s.z, s.radius);
  if (cage.hit) {
    s.x = cage.x;
    s.z = cage.z;
    const b = bounce(s.vx, s.vz, cage.nx, cage.nz, 0.18);
    s.vx = b.vx;
    s.vz = b.vz;
  }
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
  if (s.poke > 0) s.poke = Math.max(0, s.poke - dt);
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
  const speed = Math.hypot(s.vx, s.vz);

  if (mag <= 0.1) {
    s.vx *= Math.exp(-10 * dt);
    s.vz *= Math.exp(-10 * dt);
  }

  if (mag > 0.12) {
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

  if (s.hit > 0) {
    const { fx, fz } = heading(s.yaw);
    s.x += fx * 7.2 * dt;
    s.z += fz * 7.2 * dt;
  }

  s.x += s.vx * dt;
  s.z += s.vz * dt;
  collideSkater(s);
  keepOnside(s);

  const now = Math.hypot(s.vx, s.vz);
  s.stride += now * 2.35 * dt;
  s.lean += ((now / WINGER_SPEED) * 0.22 - s.lean) * Math.min(1, 8 * dt);
  const lat = mag > 0.12 ? wx * world.camRx + wz * world.camRz : 0;
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
  if (s.hit > 0) s.hit = Math.max(0, s.hit - dt);
  if (s.windup > 0 && mag < 0.01 && s.follow <= 0) s.windup = Math.max(0, s.windup - dt * 1.6);
}

function separateSkaters(): void {
  const arr = world.skaters;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < arr.length; i++) {
      const A = arr[i]!;
      for (let j = i + 1; j < arr.length; j++) {
        const B = arr[j]!;
        let dx = B.x - A.x;
        let dz = B.z - A.z;
        let dist = Math.hypot(dx, dz);
        if (dist < 1e-4) {
          dx = 0.18;
          dz = 0.08 * ((A.id % 2) * 2 - 1);
          dist = Math.hypot(dx, dz);
        }
        const pad = A.kind === "goalie" || B.kind === "goalie" ? 0.28 : 0.2;
        const min = A.radius + B.radius + pad;
        if (dist >= min) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        const pen = min - dist;
        const wA = A.kind === "goalie" ? (A.struck > 0.2 ? 0.62 : 0.08) : A.struck > 0.2 ? 0.28 : 1;
        const wB = B.kind === "goalie" ? (B.struck > 0.2 ? 0.62 : 0.08) : B.struck > 0.2 ? 0.28 : 1;
        const sum = wA + wB;
        A.x -= nx * pen * (wA / sum);
        A.z -= nz * pen * (wA / sum);
        B.x += nx * pen * (wB / sum);
        B.z += nz * pen * (wB / sum);
        const rv = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
        if (rv < 0) {
          const jimp = rv * 0.78;
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

function collideRefs(): void {
  for (const r of [world.ref, world.ref2]) {
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
      if (rv < 0) {
        r.vx += nx * rv * 0.85;
        r.vz += nz * rv * 0.85;
      }
    }
    const ice = resolveRink(r.x, r.z, 0.42);
    if (ice.hit) {
      r.x = ice.x;
      r.z = ice.z;
    }
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

function wrapSupportRole(s: Skater, holder: Skater): number {
  const others = world.skaters
    .filter((p) => p.side === "home" && p.kind !== "goalie" && p.id !== holder.id)
    .sort((a, b) => a.id - b.id);
  return others.findIndex((p) => p.id === s.id);
}

function wrapCornerStation(holder: Skater, sideZ: 1 | -1): { tx: number; tz: number } {
  const attack = attackDir("home");
  const boards = (RINK_W / 2 - 1.68) * sideZ;
  const cornerAlong = GOAL_LINE_X + 0.55;
  const highAlong = BLUE_X + 2.6;
  const toward = holder.z * sideZ;
  const t = world.time;
  let along = cornerAlong + Math.sin(t * 0.55 + sideZ) * 0.28;
  if (toward > 0.7) {
    const space = 4.4 + Math.min(2.2, Math.max(0, toward - 2) * 0.35);
    along = holder.x * attack - space;
    along = Math.max(highAlong, Math.min(cornerAlong, along));
  }
  const zOff = toward > 2.2 ? Math.min(0.55, (toward - 2.2) * 0.08) : Math.sin(t * 0.42 + sideZ) * 0.22;
  return { tx: attack * along, tz: boards - sideZ * zOff };
}

function wrapCycleStation(s: Skater, holder: Skater, role: number): { tx: number; tz: number } | null {
  if (role < 0) return null;
  const attack = attackDir("home");
  const mouth = attack * GOAL_LINE_X;
  const t = world.time;
  if (role === 0) return wrapCornerStation(holder, 1);
  if (role === 1) return wrapCornerStation(holder, -1);
  if (role === 2) {
    const cover = nearestFoe(s);
    let tz = Math.sin(t * 1.18 + s.id) * 2.2;
    if (cover.foe && cover.d < 2.7) tz += (Math.sign(s.z - cover.foe.z) || 1) * 1.85;
    const depth = 3.35 + Math.cos(t * 0.74 + s.id * 0.5) * 1.2;
    return { tx: mouth - attack * depth, tz: Math.max(-3.5, Math.min(3.5, tz)) };
  }
  const cover = nearestFoe(s);
  let tz = Math.sin(t * 0.88 + s.id * 2.05) * 5.5;
  if (cover.foe && cover.d < 3.3) tz += (Math.sign(s.z - cover.foe.z) || 1) * 2.5;
  return { tx: attack * (BLUE_X + 1.08), tz: Math.max(-7.2, Math.min(7.2, tz)) };
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
  if (holder && userBehindAwayNet(holder) && !passToMe) {
    if (s.side === "home" && s.id !== holder.id) {
      const st = wrapCycleStation(s, holder, wrapSupportRole(s, holder));
      if (st) {
        tx = st.tx;
        tz = st.tz;
        wrapDeep = true;
      }
    } else if (s.side === "away" && s.kind !== "goalie" && wrapChaserId(holder) === s.id) {
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
    } else {
      const support = mates.filter((p) => p.id !== (holder?.id ?? -1) && p.kind === "winger");
      const si = Math.max(0, support.findIndex((p) => p.id === s.id));
      const farZ = pivot.z >= 0 ? -1 : 1;
      const wave = inOz ? Math.sin(world.time * 0.18 + s.id * 1.41) : 0;
      const drift = inOz ? Math.cos(world.time * 0.13 + s.id * 0.93) : 0;
      if (si <= 0) {
        tx = mouth - attack * (7.6 + wave * 1.8);
        tz = farZ * (1.15 + drift * 1.55);
      } else if (si === 1) {
        tx = mouth - attack * (9.8 + drift * 1.7);
        tz = farZ * (5.9 + wave * 1.7);
      } else if (si === 2) {
        tx = mouth - attack * (4.8 + wave * 2.1);
        tz = farZ * (2.7 + drift * 1.9);
      } else {
        tx = mouth - attack * (11.6 + drift * 1.6);
        tz = -farZ * (2.35 + wave * 2.3);
      }
      tz = Math.max(-7.5, Math.min(7.5, tz));
      const fromHolder = Math.hypot(tx - pivot.x, tz - pivot.z);
      if (!passToMe && fromHolder < 5.8) {
        tx = pivot.x + attack * 6.2;
        tz = Math.max(-7.5, Math.min(7.5, tz + farZ * 3.8));
      }
    }
    if (passToMe) {
      const ix = puck.x + puck.vx * 0.2;
      const iz = puck.z + puck.vz * 0.2;
      const fromNet = (mouth - ix) * attack;
      tx = mouth - attack * Math.max(3.8, Math.min(13.5, fromNet));
      tz = Math.max(-7.3, Math.min(7.3, iz));
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

  if (!wrapDeep && weHave && holder && holder.side === "home" && s.id !== holder.id && !passToMe) {
    const cover = nearestFoe(s);
    if (cover.d < 3.2 && cover.foe) {
      const away = Math.sign(s.z - cover.foe.z) || (s.id % 2 === 0 ? 1 : -1);
      const t = world.time * 0.92 + s.id * 1.73;
      tz = Math.max(-7.4, Math.min(7.4, cover.foe.z + away * (3.5 + Math.sin(t) * 1.85)));
      if (inOz) tx = mouth - attack * (5.1 + Math.abs(Math.cos(t * 0.65)) * 3.6);
      else tx = holder.x + attack * (2.4 + Math.cos(t) * 1.6);
      const fromHolder = Math.hypot(tx - holder.x, tz - holder.z);
      if (fromHolder < 4.2) {
        tx = holder.x + attack * 5.4;
        tz = Math.max(-7.4, Math.min(7.4, tz + away * 2.2));
      }
    }
  }

  tx = clampOnsideX(s, tx);
  const c = clampLane(tx, tz, attack, wrapDeep);
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
  if (!weHave && holder && holder.id === world.userId && rank === 0 && s.kind === "winger") {
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
    } else {
      const join = weHave && holder && holder.x * attackDir(s.side) > BLUE_X - 0.35;
      mag = Math.min(mag, join ? 0.9 : 0.72);
    }
  }
  if (s.side === "away" && s.id !== world.userId) {
    mag *= Math.min(1, weHave ? cpuMul("off") : cpuMul("def"));
  }
  const rep = repulsion(s);
  const rw = s.side === "home" && weHave && !passToMe ? 1.15 : dist < 2 ? 0.55 : 1;
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
  if (puck.x * def > GOAL_LINE_X - 1.35 && Math.abs(puck.z) < GOAL_W / 2 + 0.5) return false;
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
  const dx = lookX - s.x;
  const dz = lookZ - s.z;
  const d = Math.hypot(dx, dz) || 1;
  const mag = Math.min(6.8, 4.4 + d * 0.55);
  s.x += (dx / d) * mag * dt;
  s.z += (dz / d) * mag * dt;
  s.vx = (dx / d) * mag;
  s.vz = (dz / d) * mag;
  s.trackZ = s.z;
  s.trackVz = s.vz;
  s.coverPose += (0 - s.coverPose) * Math.min(1, 10 * dt);
  s.yaw = turnToward(s.yaw, dx, dz, 7, dt);
  s.lean = 0.16;
  s.bank = 0;
  collideSkater(s);
  return true;
}

function thinkGoalie(s: Skater, dt: number): void {
  const netX = defendDir(s.side) * (GOAL_LINE_X - 0.85);
  const puck = world.puck;
  const holder = puck.owner !== null ? world.skaters[puck.owner] : null;
  const attackOnMe = holder && holder.side !== s.side;
  const home = s.side === "home";
  if (home && s.id !== world.userId && world.goalieRecallT > 0) {
    const shotAt =
      !holder &&
      Math.hypot(puck.vx, puck.vz) > 5.5 &&
      puck.vx * defendDir(s.side) > 5;
    if (shotAt || attackOnMe) world.goalieRecallT = 0;
    else if (Math.hypot(s.x - netX, s.z) < 2.45) {
      world.goalieRecallT = Math.max(0, world.goalieRecallT - dt);
    }
  }

  if (world.faceoff && world.faceoffPhase !== "live") {
    s.x += (netX - s.x) * Math.min(1, 8 * dt);
    s.z += (0 - s.z) * Math.min(1, 7 * dt);
    s.trackZ = 0;
    s.trackVz = 0;
    s.yaw = faceYaw(s.side);
    s.vx = 0;
    s.vz = 0;
    s.lean = 0.1;
    s.bank = 0;
    return;
  }

  s.poke = Math.max(0, s.poke - dt);

  if (s.stun > 0.04 || s.struck > 0.18) {
    s.stun = Math.max(0, s.stun - dt);
    if (s.struck > 0) s.struck = Math.max(0, s.struck - dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.vx *= Math.exp(-2.2 * dt);
    s.vz *= Math.exp(-2.2 * dt);
    collideSkater(s);
    keepInBowl(s);
    return;
  }

  if (s.id !== world.userId && home && chaseDumpIn(s, dt)) return;

  if (s.id !== world.userId) {
    const recalling = home && world.goalieRecallT > 0;
    const distNet = Math.hypot(s.x - netX, s.z);
    if (distNet > 2.35) {
      const rate = recalling ? (distNet > 6 ? 1.35 : 0.92) : distNet > 5 ? 7.2 : 5.4;
      const k = Math.min(1, rate * dt);
      const zWant = recalling ? s.trackZ : 0;
      s.x += (netX - s.x) * k;
      s.z += (zWant - s.z) * k;
      s.trackZ += ((recalling ? s.z : 0) - s.trackZ) * Math.min(1, (recalling ? 0.7 : 8) * dt);
      s.trackVz *= Math.exp(-(recalling ? 1.6 : 8) * dt);
      s.vx *= Math.exp(-(recalling ? 1.8 : 5) * dt);
      s.vz *= Math.exp(-(recalling ? 1.8 : 5) * dt);
      const rest = faceYaw(s.side);
      s.yaw = recalling
        ? turnToward(s.yaw, -Math.sin(rest), -Math.cos(rest), 2.1, dt)
        : rest;
      s.lean = 0.12;
      s.bank = 0;
      collideSkater(s);
      if (distNet > 3.4 && puck.owner !== s.id) return;
    }
  }

  if (puck.owner === s.id) {
    if (s.gloveFlash > 0.12) {
      collideSkater(s);
      return;
    }
    const crash = creaseCrash(s);
    const open = !Number.isFinite(crash) || crash > 2.15;
    if (s.side === "away") {
      if (open) {
        s.coverPose += (0 - s.coverPose) * Math.min(1, 10 * dt);
        const hold = !Number.isFinite(crash) ? 0.1 : crash > 3.4 ? 0.16 : 0.3;
        if (world.coverT >= hold && world.time - world.lastPass > 0.16) {
          doGoalieOutlet(s, 0, 0, !Number.isFinite(crash) || crash > 3.8);
          s.coverPose *= 0.2;
          collideSkater(s);
          return;
        }
      }
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
  if (shotAtMe) {
    const ttm = Math.max(0.02, (mouth - puck.x) / (puck.vx || 1));
    tz = puck.z + puck.vz * Math.min(home ? 0.35 : 0.1, ttm);
    tz = Math.max(-zMax, Math.min(zMax, tz));
    if (home) {
      s.trackZ = tz;
      s.trackVz = 0;
      s.z = tz;
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
  } else {
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
    s.trackZ = Math.max(-wrapMax, Math.min(wrapMax, post));
    s.trackVz = 0;
    s.x += (endLine - def * 0.28 - s.x) * Math.min(1, 7 * dt);
    s.z += (s.trackZ - s.z) * Math.min(1, 9 * dt);
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

function checkOffside(): void {
  if (world.stoppage || world.faceoff) return;
  if (!offsidesLive()) {
    world.puckOz = puckOzSide(world.puck);
    return;
  }
  const now = puckOzSide(world.puck);
  const was = world.puckOz;
  world.puckOz = now;
  if (now === 0 || now === was) return;
  const attackSide: "home" | "away" = attackDir("home") === now ? "home" : "away";
  for (const s of world.skaters) {
    if (s.side !== attackSide || s.kind === "goalie") continue;
    if (attackerClearOfBlue(s, now)) {
      world.faceX = now * FACEOFF_NZ_X;
      world.faceZ = world.puck.z >= 0 ? FACEOFF_SPOT_Z : -FACEOFF_SPOT_Z;
      startStoppage("offside");
      return;
    }
  }
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
}

function launchPuck(s: Skater, vx: number, vz: number, vy = 0): void {
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
  if (s.kind === "goalie") {
    s.coverPose = 0;
    s.gloveFlash = 0;
  }
}

function bestOutlet(from: Skater, ax: number, az: number, aimed: boolean): Skater | null {
  const mates = teammatesOf(from);
  if (!mates.length) return null;
  const attack = attackDir(from.side);
  let best: Skater | null = null;
  let bestScore = -Infinity;
  for (const s of mates) {
    const dx = s.x - from.x;
    const dz = s.z - from.z;
    const dist = Math.hypot(dx, dz) || 1;
    const up = dx * attack;
    if (up < -3.5) continue;
    const align = aimed ? (dx * ax + dz * az) / dist : 0;
    const cover = nearestFoe(s).d;
    const score =
      up * 0.48 +
      Math.abs(s.z) * 0.22 +
      cover * 0.6 +
      (aimed ? align * 16 : 0) +
      (s.kind === "winger" ? 0.7 : 0.35) -
      dist * 0.012 +
      (dist > 2.2 && dist < 18 ? 2.4 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (best) return best;
  mates.sort((a, b) => (b.x - a.x) * attack - Math.abs(a.z) * 0.05 + Math.abs(b.z) * 0.05);
  return mates[0] ?? null;
}

function doGoalieOutlet(s: Skater, mx: number, my: number, saucer: boolean): void {
  s.coverPose = 0;
  world.coverT = 0;
  const { ax, az } = aimDir(s, mx, my);
  if (s.side === "home") {
    const aimed = Math.hypot(mx, my) > 0.22;
    const mate = bestPassTarget(s, ax, az, aimed);
    if (mate) {
      tapePass(s, mate, saucer);
    } else {
      const power = saucer ? 17.6 : 16.4;
      launchPuck(s, ax * power, az * power, saucer ? 3.4 : 0.06);
      world.lastPassTo = null;
    }
  } else {
    const aimed = Math.hypot(mx, my) > 0.16;
    const mate = bestOutlet(s, ax, az, aimed) ?? bestPassTarget(s, ax, az) ?? teammatesOf(s)[0] ?? null;
    if (mate) {
      tapePass(s, mate, saucer);
    } else if (aimed) {
      launchPuck(s, ax * 18, az * 18, saucer ? 4.8 : 0.55);
      world.lastPassTo = null;
    } else {
      const attack = attackDir(s.side);
      const sideZ = s.z >= 0 ? 1 : -1;
      launchPuck(s, attack * 16.5, sideZ * 8.5, 0.6);
      world.lastPassTo = null;
    }
  }
  world.lastPass = world.time;
  world.lastPasser = s.id;
  world.lastPassX = s.x;
  world.lastPassZ = s.z;
  world.coverT = 0;
  s.coverPose = 0;
}

function doPass(s: Skater, mx: number, my: number, saucer: boolean): void {
  if (s.kind === "goalie") {
    doGoalieOutlet(s, mx, my, saucer);
    return;
  }
  const { ax, az } = aimDir(s, mx, my);
  const aimed = Math.hypot(mx, my) > 0.22;
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
}

function shotAim(act: Actions): { mx: number; my: number } {
  const rm = Math.hypot(act.aimX, act.aimY);
  if (rm > 0.16) return { mx: act.aimX, my: act.aimY };
  return { mx: act.moveX, my: act.moveY };
}

function autoAttackCompass(): "up" | "down" | "left" | "right" {
  const atk = world.homeAttack;
  const sRight = atk * world.camRx;
  const sUp = atk * world.camUx;
  if (Math.abs(sUp) >= Math.abs(sRight)) return sUp >= 0 ? "up" : "down";
  return sRight >= 0 ? "right" : "left";
}

export function attackCompass(): "up" | "down" | "left" | "right" {
  const auto = autoAttackCompass();
  if (world.aimCompassLock && world.aimCompassCam && auto !== world.aimCompassCam) {
    world.aimCompassLock = null;
  }
  world.aimCompassCam = auto;
  return world.aimCompassLock ?? auto;
}

export function cycleAimCompass(): void {
  const order = ["up", "right", "down", "left"] as const;
  const cur = attackCompass();
  const i = order.indexOf(cur);
  world.aimCompassLock = order[(i + 1) % 4]!;
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

function shotHeight(hgt: number): { wantY: number; loft: number } {
  const yT = (Math.max(-1, Math.min(1, hgt)) + 1) * 0.5;
  const wantY = PUCK_Y + 0.01 + yT * (GOAL_H - 0.12 - PUCK_Y);
  const loft = yT < 0.1 ? 0 : (yT - 0.1) / 0.9;
  return { wantY, loft };
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
  const zSign = Math.abs(world.camRz) >= 0.1 ? Math.sign(world.camRz) : 1;
  const stickX = Math.max(-1, Math.min(1, mx));
  const stickY = Math.max(-1, Math.min(1, my));
  const half = GOAL_W / 2;
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
    const dead = 0.22;
    const axAim =
      Math.abs(aim.lat) <= dead
        ? 0
        : Math.sign(aim.lat) * ((Math.abs(aim.lat) - dead) / (1 - dead));
    tZ = axAim * (half - 0.16) * zSign;
    wantY = shotHeight(aim.hgt).wantY;
  }
  const from = stickBlade(s);
  const fromLine = GOAL_LINE_X - from.x * attack;
  const lowCorner = fromLine < 3.6 && fromLine > -0.28 && Math.abs(from.z) > 4.6;
  world.lastShotCorner = lowCorner;
  world.lastShotCornerSide = lowCorner ? Math.sign(from.z || 1) : 0;
  if (lowCorner && !lock && !bodyAim) {
    tZ = -Math.sign(from.z || 1) * (half - 0.05);
    wantY = shotHeight(stickToNetAim(stickX, stickY, s.side).hgt).wantY;
    if (wantY < GOAL_H * 0.38 && Math.random() < 0.4) wantY = GOAL_H * 0.78;
    sprayAmt = Math.min(sprayAmt, 0.007);
  }
  if (sprayAmt > 0.5) {
    tZ += (Math.random() - 0.5) * Math.min(1.1, sprayAmt * 0.32);
    wantY += (Math.random() - 0.5) * Math.min(0.4, sprayAmt * 0.12);
  }
  tZ = Math.max(-half + (lowCorner ? 0.04 : 0.12), Math.min(half - (lowCorner ? 0.04 : 0.12), tZ));
  wantY = Math.max(PUCK_Y, Math.min(GOAL_H - 0.08, wantY));
  const dx = netX - from.x;
  const dz = tZ - from.z;
  const dist = Math.hypot(dx, dz) || 1;
  const ax = dx / dist;
  const az = dz / dist;
  const spray = (Math.random() - 0.5) * sprayAmt;
  const flight = Math.max(0.14, dist / Math.max(8, power));
  const loft = lock
    ? Math.min(1, Math.max(0, (wantY - PUCK_Y) / Math.max(0.2, GOAL_H - 0.2)))
    : shotHeight(stickToNetAim(stickX, stickY, s.side).hgt).loft;
  let vy = loft < 0.04 ? 0 : (wantY - PUCK_Y + 6 * flight * flight * loft) / flight;
  vy = Math.max(0, Math.min(6.4, vy));
  launchPuck(s, ax * power - az * spray, az * power + ax * spray, vy);
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
    }
    return;
  }
  if (world.puck.owner !== null && world.puck.owner !== t.id) {
    world.oneTimerArmed = false;
    world.oneTimerSlap = false;
    return;
  }
  if (world.puck.owner === t.id) fireOneTimer(t);
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
  const half = GOAL_W / 2 - 0.1;
  const g = world.skaters.find((p) => p.kind === "goalie" && p.side !== t.side);
  const aim = stickToNetAim(world.oneTimerMx, world.oneTimerMy, t.side);
  const dead = 0.22;
  const corner =
    Math.abs(aim.lat) <= dead ? 0 : Math.sign(aim.lat) * ((Math.abs(aim.lat) - dead) / (1 - dead));
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
  if (t < 0.28) mph = 62 + t * 12;
  else if (t < 0.5) mph = 76 + ((t - 0.28) / 0.22) * 6;
  else if (t < 1) {
    slap = true;
    mph = 80 + ((t - 0.5) / 0.5) * 20;
  } else {
    slap = true;
    mph = 99 + Math.min(3, (t - 1) * 2);
  }
  mph = Math.min(102, mph + Math.min(1.6, spd * 0.08));
  return { power: mph / 2.23694, slap };
}

function doShot(s: Skater, mx: number, my: number, slap: boolean, holdT?: number): void {
  const held = holdT ?? (slap ? 1.05 : 0.1);
  const { power, slap: isSlap } = shotFromHold(held, Math.hypot(s.vx, s.vz));
  if (s.kind === "goalie") {
    const attack = attackDir(s.side);
    const { ax, az } = aimDir(s, mx, my);
    if (Math.hypot(mx, my) > 0.18) {
      launchPuck(s, ax * (isSlap ? 18 : 15), az * (isSlap ? 18 : 15), isSlap ? 0.7 : 0.4);
    } else {
      const side = s.z >= 0 ? 1 : -1;
      launchPuck(s, attack * (isSlap ? 16 : 13.5), side * 10.5, 0.55);
    }
    world.lastShoot = world.time;
    world.lastShotSlap = isSlap;
    world.lastShotOneTimer = false;
    world.lastShotRedirect = false;
    world.lastShooter = s.id;
    world.lastShotDist = 8;
    s.windup = 0;
    world.shotWindupT = 0;
    beginShotSpeedTrack();
    return;
  }
  const oneTimer = world.lastPassTo === s.id && world.time <= world.oneTimerUntil;
  let sprayAmt = isSlap ? 0.016 : oneTimer ? 0.01 : 0.01;
  if (s.x * attackDir(s.side) < BLUE_X - 0.2) {
    const shy = BLUE_X - s.x * attackDir(s.side);
    sprayAmt = Math.max(sprayAmt, (isSlap ? 1.35 : 0.9) + Math.min(2.4, shy * 0.18));
  }
  const dist = launchShotAtNet(s, mx, my, power, sprayAmt);
  world.lastShoot = world.time;
  world.lastShotSlap = isSlap;
  world.lastShotOneTimer = oneTimer;
  world.lastShotRedirect = false;
  world.lastShooter = s.id;
  world.lastShotDist = dist;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.shotWindupT = 0;
  if (useGame.getState().clockMode === "drill") world.drillShot = true;
  if (isSlap || oneTimer) s.follow = isSlap ? 0.62 : 0.5;
  else s.windup = 0;
  beginShotSpeedTrack();
}

function shootAtNet(s: Skater): void {
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

function tryWindupTurnover(user: Skater): boolean {
  if (world.shotWindupT < 1.5) return false;
  if (world.puck.owner !== user.id) return false;
  if (user.kind === "goalie") return false;
  for (const s of world.skaters) {
    if (s.side === user.side || s.kind === "goalie") continue;
    if (s.stun > 0.12 || s.struck > 0.2 || s.dive > 0) continue;
    const d = Math.hypot(s.x - user.x, s.z - user.z);
    if (d > 2.1) continue;
    const { fx, fz } = heading(s.yaw);
    const lx = -fz;
    const lz = fx;
    const side = Math.sign((user.x - s.x) * lx + (user.z - s.z) * lz) || 1;
    s.poke = 0.48;
    s.yaw = Math.atan2(-(user.x - s.x), -(user.z - s.z));
    launchPuck(user, fx * 2.4 + lx * side * 8.8, fz * 2.4 + lz * side * 8.8, 0.42);
    user.stun = 0.4;
    user.windup = 0;
    world.shotWindupT = 0;
    world.windupCancel = true;
    world.lastPass = world.time;
    world.lastPasser = s.id;
    world.lastPassTo = null;
    return true;
  }
  return false;
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
    if (holder.deke > 0.06) return;
    const dBlade = Math.hypot(blade.x - puck.x, blade.z - puck.z);
    const dBody = Math.hypot(user.x - holder.x, user.z - holder.z);
    const ahead = (holder.x - user.x) * fx + (holder.z - user.z) * fz;
    if (holder.kind === "goalie") {
      const reach = holder.coverPose > 0.25 ? 2.55 : 2.2;
      if ((dBlade < reach || dBody < reach + 0.2) && ahead > -0.85) {
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
    const dive = user.dive > 0.04;
    const reach = dive ? 3.15 : 1.95;
    const bodyR = dive ? 3.35 : 2.25;
    if ((dBlade < reach || dBody < bodyR) && ahead > -0.85) {
      const lx = -fz;
      const lz = fx;
      const side = Math.sign((holder.x - user.x) * lx + (holder.z - user.z) * lz) || 1;
      const pop = dive ? 12.5 : 8.5;
      launchPuck(holder, fx * (dive ? 4.2 : 2.8) + lx * side * pop, fz * (dive ? 4.2 : 2.8) + lz * side * pop, dive ? 0.7 : 0.4);
      holder.stun = dive ? 0.62 : 0.42;
      holder.struck = dive ? 0.48 : 0.32;
      world.lastPass = world.time;
    }
    return;
  }
  if (user.dive > 0) return;
  const d = Math.hypot(blade.x - puck.x, blade.z - puck.z);
  if (d < 0.95 && puck.y < 0.4) puck.owner = user.id;
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

function applyHit(user: Skater): boolean {
  const { fx, fz } = heading(user.yaw);
  const checkGoalies = useGame.getState().checkGoalies;
  let connected = false;
  for (const s of world.skaters) {
    if (s.id === user.id || s.side === user.side) continue;
    if (s.kind === "goalie" && !checkGoalies) continue;
    if (s.struck > 0.45) continue;
    const dx = s.x - user.x;
    const dz = s.z - user.z;
    const d = Math.hypot(dx, dz);
    const ahead = dx * fx + dz * fz;
    const reach = s.kind === "goalie" ? 2.55 : 2.25;
    if (d < reach && ahead > -0.45) {
      connected = true;
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
      if (world.puck.owner === s.id) spillCheckedPuck(s, user);
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
    for (const r of [world.ref, world.ref2]) {
      if (r.struck > 0.45) continue;
      const dx = r.x - user.x;
      const dz = r.z - user.z;
      const d = Math.hypot(dx, dz);
      const ahead = dx * fx + dz * fz;
      if (d < 2.35 && ahead > -0.45) {
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

function beginGoalBank(side: 1 | -1): boolean {
  if (world.goalBank || world.whistle === "goal") return false;
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
      startStoppage("goal", side);
    } else {
      steerGoalBank(puck, side, hits[1]!);
    }
  } else {
    steerGoalBank(puck, side, first);
  }
  return true;
}

function stepGoalBank(dt: number): void {
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
    startStoppage("goal", b.side);
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
      startStoppage("goal", b.side);
      return;
    }
    steerGoalBank(puck, b.side, b.hits[b.i]!);
  }
}

function crossedGoalMouth(prevX: number, prevZ: number, prevY: number, puck: Puck): 1 | -1 | 0 {
  for (const side of [1, -1] as const) {
    const mouth = side * GOAL_LINE_X;
    const onIce = side > 0 ? prevX < mouth - 0.01 : prevX > mouth + 0.01;
    const nowPast = side > 0 ? puck.x >= mouth : puck.x <= mouth;
    if (onIce && nowPast) {
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
    if (
      onIce &&
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

function containPuckBoards(puck: Puck): void {
  const hit = resolveRink(puck.x, puck.z, 0.09);
  if (!hit.hit) return;
  puck.x = hit.x;
  puck.z = hit.z;
  const b = bounce(puck.vx, puck.vz, hit.nx, hit.nz, 0.58);
  puck.vx = b.vx;
  puck.vz = b.vz;
  const again = resolveRink(puck.x, puck.z, 0.09);
  if (again.hit) {
    puck.x = again.x;
    puck.z = again.z;
  }
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

function bouncePuckCage(puck: Puck, prevX: number, prevZ: number, prevY: number): void {
  const hw = GOAL_W / 2;
  const pr = 0.11;
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
      const dx = puck.x - mouth;
      const dz = puck.z - zPost;
      const dist = Math.hypot(dx, dz);
      if (dist < pr && dist > 1e-6 && puck.y < GOAL_H + 0.08) {
        const nx = dx / dist;
        const nz = dz / dist;
        const goingIn = Math.sign(puck.vx) === side && puck.y < GOAL_H - 0.05;
        const insideEdge = Math.abs(puck.z) <= hw + 0.02;
        const farPost =
          world.lastShotCornerSide !== 0 && Math.sign(zPost) !== Math.sign(world.lastShotCornerSide);
        const snipeNear = cornerSnipeLive() && !farPost;
        const towardOpening =
          (cornerSnipeLive() && farPost) ||
          (!snipeNear && (-Math.sign(zPost) * puck.vz > 0.12 || insideEdge));
        if (goingIn && towardOpening && world.whistle !== "offside") {
          const inward = -Math.sign(zPost) || 1;
          puck.z = zPost + inward * 0.1;
          puck.x = mouth + side * 0.1;
          puck.vx = side * Math.max(3.4, Math.abs(puck.vx) * 0.72);
          puck.vz = inward * Math.max(0.8, Math.abs(puck.vz) * 0.25);
          puck.vy *= 0.4;
        } else {
          puck.x = mouth + nx * pr;
          puck.z = zPost + nz * pr;
          const b = bounce(puck.vx, puck.vz, -nx, -nz, 0.55);
          puck.vx = b.vx;
          puck.vz = b.vz;
        }
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
        const b = bounce(puck.vx, puck.vz, side, 0, 0.42);
        puck.vx = b.vx;
        puck.vz = b.vz;
      } else if (puck.y < GOAL_H - 0.02) {
        puck.x = back - side * 0.1;
        const b = bounce(puck.vx, puck.vz, -side, 0, 0.35);
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
      if (fromOut && (nowInMouth || (cornerSnipeLive() && goingIn && puck.y < GOAL_H && farSide))) {
        puck.z = zWall - nz * 0.1;
        if (puck.vx * side < 0.4) puck.vx = side * Math.max(2.2, Math.abs(puck.vx));
      } else if (fromOut) {
        puck.z = zWall + nz * 0.12;
        const b = bounce(puck.vx, puck.vz, 0, -nz, 0.5);
        puck.vx = b.vx;
        puck.vz = b.vz;
      } else {
        puck.z = zWall - nz * 0.1;
        const b = bounce(puck.vx, puck.vz, 0, nz, 0.4);
        puck.vx = b.vx;
        puck.vz = b.vz;
      }
    }

    const onRoof = puck.y >= GOAL_H - 0.06;
    const slowRoof =
      puck.y >= GOAL_H - 0.18 && Math.hypot(puck.vx, puck.vz, puck.vy) < 1.35;
    if (inFoot && (onRoof || slowRoof) && world.whistle !== "goal" && !world.goalBank) {
      const out = -side;
      const zKick = Math.abs(puck.z) < 0.15 ? (puck.z >= 0 ? 1.6 : -1.6) : Math.sign(puck.z) * 1.8;
      puck.x = mouth - side * 0.55;
      puck.y = GOAL_H * 0.42;
      puck.vy = Math.max(2.1, Math.abs(puck.vy) * 0.35 + 2.4);
      puck.vx = out * Math.max(6.8, Math.abs(puck.vx) * 0.4 + 7.6);
      puck.vz = (puck.vz + zKick) * 0.7;
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
  if (world.stoppage) return;
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
    if (ui.powerPlay) {
      const scoredOn = homeScored ? "away" : "home";
      const ice = scoredOn === "home" ? ui.liveHome : ui.liveAway;
      if (lineupTotal(ice) < LINEUP_CAP) world.ppRelease = scoredOn;
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
      scorer.celebrate = 3.6;
      for (const s of world.skaters) {
        if (s.side === scorer.side && s.id !== scorer.id && s.kind !== "goalie") s.celebrate = 3.2;
      }
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
    if (shotFromOutsideOz()) {
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
    return;
  }
}

function stepOneRef(r: Referee, lane: 1 | -1, dt: number): void {
  r.poseT += dt;
  if (r.struck > 0) {
    r.struck = Math.max(0, r.struck - dt);
    r.vx *= Math.exp(-3.2 * dt);
    r.vz *= Math.exp(-3.2 * dt);
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    const ice = resolveRink(r.x, r.z, 0.42);
    if (ice.hit) {
      r.x = ice.x;
      r.z = ice.z;
      const b = bounce(r.vx, r.vz, ice.nx, ice.nz, 0.28);
      r.vx = b.vx;
      r.vz = b.vz;
    }
    return;
  }
  if (world.drillWon && world.goalTicker > 0) {
    const netX = world.homeAttack * GOAL_LINE_X;
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
  stepOneRef(world.ref, 1, dt);
  stepOneRef(world.ref2, -1, dt);
}

function checkCover(dt: number): void {
  const puck = world.puck;
  if (puck.owner !== null) {
    const holder = world.skaters[puck.owner];
    if (holder?.kind === "goalie") {
      if (holder.gloveFlash > 0.12) return;
      if (world.coverT <= 0) world.coverSideZ = puck.z;
      world.coverT += dt;
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
    if (inCrease && d < 0.95 && spd < 2.6) covering = s;
  }
  if (covering) {
    if (world.coverT <= 0) world.coverSideZ = puck.z;
    if (covering.side === "away") {
      const crash = creaseCrash(covering);
      const open = !Number.isFinite(crash) || crash > 2.15;
      if (open) {
        puck.owner = covering.id;
        puck.vx = 0;
        puck.vz = 0;
        puck.vy = 0;
        world.coverT = 0;
        return;
      }
    }
    world.coverT += dt;
  } else world.coverT = Math.max(0, world.coverT - dt * 2);
  if (world.coverT >= COVER_HOLD) startStoppage("cover");
}

function tryPickup(puck: Puck): void {
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
            fireOneTimer(t);
            return;
          }
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
  for (const s of world.skaters) {
    if (s.kind === "goalie") {
      if (s.side !== "home" || s.id === world.userId) continue;
      if (s.stun > 0.04 || s.struck > 0.18) continue;
      if (moving > 8.8) continue;
      if (shooter && sinceShot < 0.65 && moving > 6.2) continue;
      const dG = Math.hypot(s.x - puck.x, s.z - puck.z);
      if (dG < 1.12 && dG < bestD) {
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
    if (ahead < -0.08 && !(intended === s.id && sincePass < 2.2)) continue;
    const d = dBlade;
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
    if (d < reach && d < bestD) {
      bestD = d;
      best = s.id;
    }
  }
  if (best >= 0) {
    const s = world.skaters[best]!;
    const blade = stickBlade(s);
    const intendedPickup = intended === best && sincePass < 2.2;
    const snapCap = sinceSave < 1.2 ? 0.55 : intendedPickup ? 2.6 : 1.28;
    if (Math.hypot(blade.x - puck.x, blade.z - puck.z) > snapCap) return;
    puck.owner = best;
    puck.x = blade.x;
    puck.z = blade.z;
    puck.y = PUCK_Y;
    puck.vx = s.vx;
    puck.vz = s.vz;
    puck.vy = 0;
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
  for (const r of [world.ref, world.ref2]) {
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
  const puck = world.puck;
  if (puck.owner !== null) {
    const s = world.skaters[puck.owner];
    if (!s) {
      puck.owner = null;
    } else {
      if (s.kind !== "goalie" && (s.struck > 0.2 || s.stun > 0.12 || s.dive > 0)) {
        spillCheckedPuck(s);
      } else {
        updateWrapFlag(s);
        const prevX = puck.x;
        const prevZ = puck.z;
        const prevY = puck.y;
        if (s.kind === "goalie" && s.gloveFlash > 0.12) {
          const gp = goalieGlovePuck(s);
          puck.x = gp.x;
          puck.z = gp.z;
          puck.y = gp.y;
        } else {
          const blade = s.kind === "goalie" && s.coverPose > 0.35 ? goalieGlovePuck(s) : stickBlade(s);
          puck.x = blade.x;
          puck.z = blade.z;
          puck.y = PUCK_Y;
        }
        if (Math.hypot(puck.x - prevX, puck.z - prevZ) > 6.5) {
          puck.x = prevX;
          puck.z = prevZ;
          puck.owner = null;
        }
        puck.vx = s.vx;
        puck.vz = s.vz;
        puck.vy = 0;
        const scored = crossedGoalMouth(prevX, prevZ, prevY, puck);
        if (scored !== 0) {
          const defending: "home" | "away" = scored === world.homeAttack ? "away" : "home";
          const g = world.skaters.find((p) => p.kind === "goalie" && p.side === defending);
          if (s.kind !== "goalie" && g && !allowWrapTuck(s, g)) {
            stripByGoalie(g, s);
            return;
          }
          startStoppage("goal", scored);
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

  const prevX = puck.x;
  const prevZ = puck.z;
  const prevY = puck.y;
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
      containPuckBoards(puck);
    }
  } else {
    containPuckBoards(puck);
  }
  bouncePuckCage(puck, prevX, prevZ, prevY);
  containPuckBoards(puck);
  rejectPuckYank(puck, prevX, prevZ);
  maybeRedirect(puck);

  if (useGame.getState().clockMode === "drill") {
    tickDrill(dt, prevX, prevY, prevZ);
    return;
  }

  if (tryGoalieCatch(puck)) return;
  if (tryGoalieSweep(puck, prevX, prevZ, prevY)) return;
  if (trySave(puck, prevX, prevZ, prevY)) return;

  const scored = crossedGoalMouth(prevX, prevZ, prevY, puck);
  if (scored !== 0) {
    if (shotFromOutsideOz() && Math.random() > 0.02) {
      const g = defendingGoalie(scored);
      if (g) {
        applyGoalieSave(
          g,
          puck,
          g.side === "home" ? 0.22 : 0.9,
          g.x + (scored > 0 ? -1 : 1) * 0.7,
          onGloveSave(g, puck.y, puck.z),
        );
        return;
      }
    }
    if (beginGoalBank(scored)) return;
    startStoppage("goal", scored);
    return;
  }
  ejectFromCage(puck, prevX);
  tryPickup(puck);
  checkOffside();
}

function keepInBowl(s: Skater): void {
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

type PauseUi = {
  clockMode: PlayMode;
  homeLineup: Lineup;
  awayLineup: Lineup;
  liveHome: Lineup;
  liveAway: Lineup;
  homeScore: number;
  awayScore: number;
  periodClock: number;
  periodOver: boolean;
  drillScore: number;
  drillTargets: DrillTargets;
  gameMinutes: number;
  offsides: boolean;
  whistle: "goal" | "cover" | "offside" | null;
  goalSide: "home" | "away" | null;
  hasPuck: boolean;
};

let pauseSnap: { world: typeof world; ui: PauseUi } | null = null;

function takePauseUi(): PauseUi {
  const s = useGame.getState();
  return {
    clockMode: s.clockMode,
    homeLineup: { ...s.homeLineup },
    awayLineup: { ...s.awayLineup },
    liveHome: { ...s.liveHome },
    liveAway: { ...s.liveAway },
    homeScore: s.homeScore,
    awayScore: s.awayScore,
    periodClock: s.periodClock,
    periodOver: s.periodOver,
    drillScore: s.drillScore,
    drillTargets: s.drillTargets,
    gameMinutes: s.gameMinutes,
    offsides: s.offsides,
    whistle: s.whistle,
    goalSide: s.goalSide,
    hasPuck: s.hasPuck,
  };
}

function capturePauseSession(): void {
  if (pauseSnap) return;
  pauseSnap = { world: structuredClone(world), ui: takePauseUi() };
}

export function previewPausedMode(m: PlayMode): void {
  capturePauseSession();
  useGame.getState().setClockMode(m);
  resetWorld({ keepReplay: true });
}

export function previewPausedTargets(n: DrillTargets): void {
  const ui = useGame.getState();
  if (ui.playing && ui.paused) capturePauseSession();
  ui.setDrillTargets(n);
  if (useGame.getState().clockMode === "drill") resetWorld({ keepReplay: ui.playing && ui.paused });
}

export function previewPausedMinutes(n: number): void {
  const ui = useGame.getState();
  if (ui.playing && ui.paused) capturePauseSession();
  ui.setGameMinutes(n);
}

export function resumePausedGame(): void {
  if (pauseSnap) {
    const freeCam = world.freeCam;
    const pauseDirty = world.pauseDirty;
    const pauseRestoreMode = world.pauseRestoreMode;
    const ui = pauseSnap.ui;
    Object.assign(world, pauseSnap.world);
    world.freeCam = freeCam;
    world.pauseDirty = pauseDirty;
    world.pauseRestoreMode = pauseRestoreMode;
    useGame.setState({
      clockMode: ui.clockMode,
      homeLineup: ui.homeLineup,
      awayLineup: ui.awayLineup,
      liveHome: ui.liveHome,
      liveAway: ui.liveAway,
      homeScore: ui.homeScore,
      awayScore: ui.awayScore,
      periodClock: ui.periodClock,
      periodOver: ui.periodOver,
      drillScore: ui.drillScore,
      drillTargets: ui.drillTargets,
      gameMinutes: ui.gameMinutes,
      offsides: ui.offsides,
      whistle: ui.whistle,
      goalSide: ui.goalSide,
      hasPuck: ui.hasPuck,
      lineupRev: useGame.getState().lineupRev + 1,
    });
    persistClockMode(ui.clockMode);
    useGame.getState().setDrillTargets(ui.drillTargets);
    useGame.getState().setGameMinutes(ui.gameMinutes);
    useGame.getState().setOffsides(ui.offsides);
    pauseSnap = null;
  }
  finishPauseCam();
  useGame.getState().setPaused(false);
}

export function resetPausedGame(): void {
  pauseSnap = null;
  resetWorld();
  useGame.getState().setPaused(false);
}

export function beginPauseCam(prevMode: CamMode): void {
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
    s.gloveFlash = b.gloveFlash;
  }
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
    puck.owner = g.id;
    const gp = goalieGlovePuck(g);
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

function stepGoalCelebrate(dt: number): void {
  const scorer = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
  if (!scorer) return;
  const userId = world.userId;
  scorer.celebrate = Math.max(scorer.celebrate, 0.4);
  if (scorer.id !== userId) {
    scorer.vx *= Math.exp(-2.4 * dt);
    scorer.vz *= Math.exp(-2.4 * dt);
    scorer.x += scorer.vx * dt;
    scorer.z += scorer.vz * dt;
    collideSkater(scorer);
    const disperse = Math.max(0, Math.min(1, (world.stoppageT - 1.7) / 1.35));
    if (disperse > 0.04) {
      const side = scorer.z >= 0 ? 1 : -1;
      const attack = attackDir(scorer.side);
      integrateSkater(scorer, -attack * 0.25, side * 0.85, 0.28 + disperse * 0.45, false, dt);
    }
  }
  const disperse = Math.max(0, Math.min(1, (world.stoppageT - 1.7) / 1.35));
  let n = 0;
  for (const s of world.skaters) {
    if (s.id !== scorer.id && s.id !== userId && s.kind !== "goalie" && s.side === scorer.side) n++;
  }
  let i = 0;
  for (const s of world.skaters) {
    if (s.id === scorer.id || s.kind === "goalie" || s.side !== scorer.side) continue;
    s.celebrate = Math.max(s.celebrate, 0.3);
    if (s.id === userId) continue;
    const ang = n > 0 ? (i / n) * Math.PI * 2 + 0.4 : 0;
    i++;
    const ring = 1.42 + disperse * 4.2;
    const dx = scorer.x + Math.cos(ang) * ring - s.x;
    const dz = scorer.z + Math.sin(ang) * ring - s.z;
    const d = Math.hypot(dx, dz) || 1;
    const mag =
      disperse > 0.08 ? 0.42 + disperse * 0.5 : d < 0.22 ? 0.02 : d < 1.8 ? 0.38 : 0.88;
    integrateSkater(s, dx / d, dz / d, mag, false, dt);
    if (d < 2.4 && disperse < 0.35) s.yaw = turnToward(s.yaw, scorer.x - s.x, scorer.z - s.z, 8, dt);
  }
}

function stepPlay(dt: number, act: Actions): void {
  const ui = useGame.getState();
  world.time += dt;

  if (world.replay) {
    dropWingClaims();
    stepReplay(dt, act);
    return;
  }

  if (world.periodOver) {
    dropWingClaims();
    return;
  }

  if (ui.clockMode === "drill" && !world.stoppage && !world.drillWon) {
    world.periodClock = Math.max(0, world.periodClock - dt);
    const shown = Math.floor(world.periodClock);
    if (shown !== ui.periodClock) ui.setPeriodClock(shown);
    if (world.periodClock <= 0) {
      world.periodOver = true;
      world.stoppage = true;
      world.stoppageT = 0;
      world.whistle = null;
      world.puck.owner = null;
      world.puck.vx = 0;
      world.puck.vz = 0;
      world.puck.vy = 0;
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
        if (lead) world.lastShooter = lead.id;
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
          }
        } else if (user.follow <= 0) {
          user.windup = Math.max(0, user.windup - dt * 3);
          if (!act.xDown) world.shotWindupT = 0;
        }
        if (!act.xDown) world.windupCancel = false;
      } else {
        if (act.yEdge) {
          user.hit = 0.55;
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
        if (world.whistle === "goal" && s.side === (world.goalSide ?? s.side)) continue;
        if (retaliator && s.id === retaliator.id) {
          const dx = user.x - s.x;
          const dz = user.z - s.z;
          const d = Math.hypot(dx, dz) || 1;
          s.yaw = Math.atan2(-dx, -dz);
          integrateSkater(s, dx / d, dz / d, Math.min(1, d / 1.6), d > 2.2, dt);
          if (d < 2.35 && s.hit <= 0 && s.struck <= 0.12) s.hit = 0.52;
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
        if (s.kind === "goalie" && (s.stun > 0.04 || s.struck > 0.18)) continue;
        if (s.id === clearingId) continue;
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
      if (s.stun <= 0.04 && s.struck <= 0.18) continue;
      s.stun = Math.max(0, s.stun - dt);
      if (s.struck > 0) s.struck = Math.max(0, s.struck - dt);
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
      if (aReady && act.aTap && world.time - world.lastPass > 0.2) {
        doGoalieOutlet(user, act.moveX, act.moveY, false);
      }
      if (aReady && act.aHoldRel && world.time - world.lastPass > 0.2) {
        doGoalieOutlet(user, act.moveX, act.moveY, true);
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
      }
      const snapped = !passedThis && tryReboundSnap(user, act);
      const aim = shotAim(act);
      if (
        !passedThis &&
        !snapped &&
        !world.windupCancel &&
        act.xTap &&
        world.time - world.lastShoot > 0.25
      ) {
        doShot(user, aim.mx, aim.my, false, world.shotWindupT);
      }
      if (
        !passedThis &&
        !snapped &&
        !world.windupCancel &&
        act.xHoldRel &&
        world.time - world.lastShoot > 0.25
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
      } else if (world.shotWindupT > 1.5) {
        tryWindupTurnover(user);
      }
    } else if (user.follow <= 0) {
      user.windup = Math.max(0, user.windup - dt * 3);
      if (!act.xDown) world.shotWindupT = 0;
    }
    if (!act.xDown) world.windupCancel = false;
  } else {
    const g = world.skaters.find((s) => s.side === "home" && s.kind === "goalie");
    const goalieHas = g !== undefined && world.puck.owner === g.id;
    if (
      aReady &&
      goalieHas &&
      (act.aTap || act.aEdge || act.aHoldRel) &&
      world.time - world.lastPass > 0.12
    ) {
      doGoalieOutlet(g, act.moveX, act.moveY, act.aHoldRel);
    } else if (aReady && act.aEdge) {
      changePlayer();
    }
    const xGo = act.xEdge || act.xTap || act.xDown || act.xHoldRel;
    if (userPassInFlight() && xGo) {
      world.oneTimerArmed = true;
      user.poke = 0;
    } else if (tryReboundSnap(user, act)) {
      user.poke = 0;
    } else if (act.xEdge && user.kind !== "goalie" && !world.oneTimerArmed && !userPassInFlight()) {
      user.poke = 0.34;
    }
    if (act.yEdge && user.kind !== "goalie") {
      user.hit = 0.42;
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
    if (user.follow <= 0) user.windup = Math.max(0, user.windup - dt * 3);
  }

  if (world.oneTimerArmed) {
    const aim = shotAim(act);
    world.oneTimerMx = aim.mx;
    world.oneTimerMy = aim.my;
    if (act.xHeld) {
      world.oneTimerSlap = true;
      world.shotWindupT += dt;
      const t = oneTimerReceiver();
      if (t) t.windup = Math.min(1, world.shotWindupT / 1);
    }
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
  } else if (hasPuck && act.xDown && !world.windupCancel) {
    charge = act.xHeld ? 1 : 0.4;
    kind = "shot";
  }
  if (ui.charge !== charge || ui.chargeKind !== kind) ui.setCharge(charge, kind);

  applyWingClaims(user, act, wings);

  integrateSkater(user, wx, wz, mag, act.burst, dt);
  keepInBowl(user);

  for (const s of world.skaters) {
    if (s.id === world.userId || s.id === user.id) continue;
    if (s.id === world.wingL || s.id === world.wingR) {
      integrateSkater(s, wx, wz, mag, false, dt);
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
      if (n.foe && n.d < 3.6) world.idlePokeT += dt;
      else world.idlePokeT = Math.max(0, world.idlePokeT - dt * 0.35);
      if (world.idlePokeT >= 2 && n.foe && n.d < 3.1) {
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
