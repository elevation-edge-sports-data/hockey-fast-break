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
  GOAL_D,
  GOAL_H,
  GOAL_LINE_X,
  GOAL_W,
  BLUE_X,
  BLUE_LINE_W,
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
import { BUTTERFLY_STANCE_DROP, GOALIE_STICK_LEN, GOALIE_Z, goalieRaisedHandCovers } from "./goalieStance";
import { readActions, setInjectedKeys, type Actions } from "./input";
import { burstCarryLocal, dekePuckLocal, neutralCarryBlend, neutralCarryLocal, skaterKnobLocal, skaterPlateLocal, skillCarryLocal, SKATER_STICK_LEN } from "./stickSide";
import {
  CHAOS_CAP,
  GAME_CLOCK_DISPLAY_MINUTES,
  GAME_PERIODS,
  REG_OT_SECONDS,
  LINEUP_CAP,
  ROLLER_CLOCK_DISPLAY_MINUTES,
  ROLLER_PERIODS,
  gameClockScale,
  gameSpeedRate,
  rollerClockScale,
  lineupTotal,
  modeLineupCap,
  clampGameMinutes,
  clampRollerMinutes,
  armCpuKitCycle,
  applyArmedCpuKitCycle,
  disarmCpuKitCycle,
  onScrimmageTargetsSet,
  releaseFromBox,
  isShotAttemptKind,
  seriesShootoutRounds,
  useGame,
  type CamMode,
  type DrillTargets,
  type Lineup,
  type OtFormat,
  type PlayMode,
  type ShootoutAttempt,
  type ShootoutRounds,
  type ShotKind,
  type WhistleKind,
} from "./store";
import { CROWD_PUCK_R, outsideStandFootprint, sweepCrowd } from "./crowd";

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
  /** Non-zero is a full fall. Zero is absorb, staying up. Not the twist. */
  tumble: number;
  /** Reaction twist. Zero on a fall, signed on absorb. */
  tumbleSpin: number;
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
  /** LB stance. Torso faces the other end; vx/vz still carry the skates. */
  backskate: boolean;
  /** Skill Stick aimed deke. −1 forehand, 0 neutral, +1 backhand. Not the Y auto-deke. */
  stickPull: number;
  /** Ice projection of the hip, the same point as the player ring. */
  comX: number;
  comZ: number;
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
  /** Non-zero is a full fall. Zero is absorb. Not the twist. */
  tumble: number;
  /** Reaction twist. Zero on a fall, signed on absorb. */
  tumbleSpin: number;
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

export type ShootoutPhase = "approach" | "flight" | "result" | "live" | "done";

/** Live shootout. Attempts are copied onto the store for the HUD. */
export type ShootoutLive = {
  first: "home" | "away";
  order: { home: number[]; away: number[] };
  attempts: ShootoutAttempt[];
  phase: ShootoutPhase;
  t: number;
  scores: boolean;
  shooterId: number;
  releaseX: number;
  /** Away attempt: the user has taken the home goalie and CPU help stays off. */
  goalieUser: boolean;
  /** Furthest attack-axis center of the shooter this attempt. Backing up from it fails. */
  backAlong: number;
  /** world.time when this attempt started. Earlier saves do not count. */
  startedAt: number;
  /** The defending goalie has touched the puck since startedAt. */
  goalieTouch: boolean;
  /** world.time of that goalie touch. A later skater touch fails the attempt. */
  goalieTouchAt: number;
  /** Scheduled rounds before sudden death. Fixed when the series starts. */
  rounds: ShootoutRounds;
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
  ref3: Referee;
  ref4: Referee;
  stoppage: boolean;
  stoppageT: number;
  coverT: number;
  whistle: WhistleKind;
  userSx: number;
  userSy: number;
  userVisible: boolean;
  puckSx: number;
  puckSy: number;
  puckVisible: boolean;
  lastShotSlap: boolean;
  lastShotBackhand: boolean;
  lastShotKind: ShotKind | null;
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
  scrimmageHomeGone: boolean[];
  scrimmageAwayGone: boolean[];
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
  freeCamReapply: boolean;
  /** User picked a camera mode on the load screen or while paused. */
  camPick: boolean;
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
  periodEndT: number;
  period: number;
  periodView: number;
  /** Regular-season shootout. Null during playoff overtime and regulation. */
  shootout: ShootoutLive | null;
  goalieRecallT: number;
  goalieShot: "score" | "out" | null;
  whiffUntil: number;
  whiffPending: boolean;
  ppRelease: "home" | "away" | null;
  ppChaos: boolean;
  creasePokeN: number;
  creasePokeGoalie: number | null;
  /** Completed home passes. Time never clears this; faceoff, goal, and away possession do. */
  passChain: number;
  homeAttack: 1 | -1;
  benchDump: BenchDump | null;
  lineBrawl: LineBrawl | null;
  /** PlayerMesh skips pose writes while a pose editor drives the joints. */
  poseEditorActive: boolean;
  /** Save is in flight. Pose writes stay off even if a bake frame starts. */
  poseEditorLock: boolean;
  /** Gallery or the pose editor is holding a still. Live play leaves this false. */
  poseHold: boolean;
  /** Named still to stamp from poseOverrides.json. Null keeps the procedural pose. */
  namedPose: string | null;
  /** Skater index that namedPose applies to. */
  namedPoseIndex: number | null;
};

const WINGER_SPEED = 12.2;
const WINGER_BURST = 15.4;
const WINGER_ACCEL = 22.4;
const DEFENSE_SPEED = 8.4;
const DEFENSE_BURST = 9.8;
const DEFENSE_ACCEL = 13.6;
const ICE_DRAG = 0.85;
/** Live puck ice drag. Pass coast, shot flight, and a loose puck share this. */
const PUCK_DRAG = 0.2;
/** Skater shot band. The wrist and slap curve stays inside it. Backhands stay 58–68. */
const SKATER_SHOT_LO_MPH = 73;
const SKATER_SHOT_HI_MPH = 105;
/** Goalie shot band, from a tap to a full 1.5s hold. */
const GOALIE_SHOT_LO_MPH = 55;
const GOALIE_SHOT_HI_MPH = 87;
/** Pass band. Skaters and goalies use the same 1.5s hold, different ends. */
const SKATER_PASS_LO_MPH = 55;
const SKATER_PASS_HI_MPH = 95;
const GOALIE_PASS_LO_MPH = 45;
const GOALIE_PASS_HI_MPH = 85;
/** Shot-plant speed kept. Classic and Wings drop half. Skill Stick keeps a fifth. */
const PLANT_KEEP_SKATE = 0.5;
const PLANT_KEEP_STICK = 0.2;
const TURN = 8.0;
const PUCK_Y = 0.042;

function cpuMul(kind: "off" | "def" | "g"): number {
  const ui = useGame.getState();
  const raw = kind === "off" ? ui.cpuOffense : kind === "def" ? ui.cpuDefense : ui.cpuGoalie;
  // Offense slider 1.0 plays at the old 0.5. The thumb still sits on 1.0.
  const t = kind === "off" ? raw * 0.5 : raw;
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
/** Time from a cover whistle until the faceoff. Game and roller only. */
const COVER_STOPPAGE_S = 2.5;
/** Pass, shot, or saucer held during the first COVER_HOLD seconds adds this long to release. */
const GOALIE_RELEASE_EXTRA = 2.0;
const GOALIE_HOLD = 0.5;
/** Home goalie whose current pass, shot, or saucer hold began before COVER_HOLD. */
let goalieReleaseId = -1;
const playLooseMem = new Map<number, { key: string; yes: boolean }>();
/** Goalie is out for a loose puck that stops at the end-zone circle tops. */
const goalieCircleChase = new Set<number>();
/**
 * Sim is skating this goalie to a loose puck.
 * The play pose reads the set. It does not roll the chase itself.
 */
const goalieLooseSkate = new Set<number>();
/** Time the goalie first sat behind his own goal line. Cleared once he is out. */
const goalieBehindSince = new Map<number, number>();
/** After the end-line shove, skate home before chasing behind the net again. */
const goalieNetEscape = new Set<number>();
const GOALIE_END_HOLD = 1.05;
const PRESS_JOIN = 9.2;
const pressPeelAt = new Map<number, number>();
const pressPeelEnd = new Map<number, number>();
let stickLooseUntil = -1;
let stickLooseBy = -1;
let stickLooseFrom = -1;
/** X went down while an opponent had the puck. That press may poke, not shoot. */
let xPokePress = false;
/** That X press may take the puck. A stick poke does not. */
let xPokeArmed = false;

function opponentOwnsPuck(user: Skater): boolean {
  const id = world.puck.owner;
  if (id === null || id === user.id) return false;
  const holder = world.skaters[id];
  return !!holder && holder.side !== user.side;
}

/** True on the poke press and its release. The release must not become a shot. */
function blockShotFromPokePress(act: Actions): boolean {
  if (!xPokePress) return false;
  const block = act.xDown || act.xEdge || act.xTap || act.xHoldRel || act.xHeld;
  if (!act.xDown) xPokePress = false;
  return block;
}
let pressCacheT = Number.NaN;
let pressPrimary = -1;
let pressSecond = -1;
type OzSpot = "slot" | "high" | "circle" | "net" | "bumper" | "hash";
const ozHold = new Map<
  number,
  { tx: number; tz: number; until: number; picked: number; calm: boolean; settled: number }
>();
/** Last attacking zone the puck occupied. Entry clears that side's held spots. */
let ozEntrySide: 0 | 1 | -1 = 0;
let ozEntryFrame = Number.NaN;
const REF_STAND = 0.68;
const REF_BOARD_Z = RINK_W / 2 - 1.15;
const REF_QUAD_X = BLUE_X + 4.5;

function dropperLane(): 1 | -1 {
  if (useGame.getState().clockMode === "practice") return 1;
  if (Math.abs(world.faceZ) > 0.8) return world.faceZ >= 0 ? 1 : -1;
  return world.refLane >= 0 ? 1 : -1;
}

function refsOnIce(): Referee[] {
  const mode = useGame.getState().clockMode;
  if (mode === "practice") return [world.ref];
  if (mode === "drill") return [world.ref2];
  if (mode === "game") return [world.ref, world.ref2, world.ref3, world.ref4];
  return [world.ref, world.ref2];
}

function refQuadrant(r: Referee): { sx: 1 | -1; sz: 1 | -1 } | null {
  if (r === world.ref) return { sx: 1, sz: 1 };
  if (r === world.ref2) return { sx: 1, sz: -1 };
  if (r === world.ref3) return { sx: -1, sz: 1 };
  if (r === world.ref4) return { sx: -1, sz: -1 };
  return null;
}

function poseEveryRef(pose: RefPose): void {
  for (const r of [world.ref, world.ref2, world.ref3, world.ref4]) {
    r.pose = pose;
    r.poseT = 0;
  }
}

function parkRefAway(r: Referee): void {
  r.x = 0;
  r.z = -80;
  r.vx = 0;
  r.vz = 0;
  r.struck = 0;
  r.tumble = 0;
  refStayPut.delete(r);
  refOnAbsorb.delete(r);
}

function parkRefQuadrant(r: Referee): void {
  const q = refQuadrant(r);
  if (!q) return;
  r.x = q.sx * REF_QUAD_X;
  r.z = q.sz * REF_BOARD_Z;
  r.yaw = 0;
  r.pose = "idle";
  r.poseT = 0;
  r.handY = 1.38;
  r.vx = 0;
  r.vz = 0;
  r.struck = 0;
  r.tumble = 0;
  refStayPut.delete(r);
  refOnAbsorb.delete(r);
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
  refOnAbsorb.delete(drop);
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
  refOnAbsorb.delete(other);
  if (useGame.getState().clockMode === "practice") {
    world.ref2.x = 0;
    world.ref2.z = -80;
    world.ref2.vx = 0;
    world.ref2.vz = 0;
    world.ref2.struck = 0;
    world.ref2.tumble = 0;
    refStayPut.delete(world.ref2);
    refOnAbsorb.delete(world.ref2);
  }
  if (useGame.getState().clockMode === "game") {
    parkRefQuadrant(world.ref3);
    parkRefQuadrant(world.ref4);
  } else {
    parkRefAway(world.ref3);
    parkRefAway(world.ref4);
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
  const cap = modeLineupCap(useGame.getState().clockMode);
  return unused.slice(0, Math.max(0, cap - lineupTotal(lu)));
}

let refLaneLocked = false;

/** Periods 1 and 3. Home defends +X, the end beside the home bench. */
const OPENING_HOME_ATTACK = -1 as const;

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
  ref: {
    x: 0,
    z: 1.12,
    yaw: 0,
    pose: "drop",
    poseT: 0,
    handY: 1.38,
    vx: 0,
    vz: 0,
    struck: 0,
    tumble: 0,
    tumbleSpin: 0,
  },
  ref2: {
    x: 0,
    z: -12.8,
    yaw: 0,
    pose: "idle",
    poseT: 0,
    handY: 1.38,
    vx: 0,
    vz: 0,
    struck: 0,
    tumble: 0,
    tumbleSpin: 0,
  },
  ref3: {
    x: -(BLUE_X + 4.5),
    z: RINK_W / 2 - 1.15,
    yaw: 0,
    pose: "idle",
    poseT: 0,
    handY: 1.38,
    vx: 0,
    vz: 0,
    struck: 0,
    tumble: 0,
    tumbleSpin: 0,
  },
  ref4: {
    x: -(BLUE_X + 4.5),
    z: -(RINK_W / 2 - 1.15),
    yaw: 0,
    pose: "idle",
    poseT: 0,
    handY: 1.38,
    vx: 0,
    vz: 0,
    struck: 0,
    tumble: 0,
    tumbleSpin: 0,
  },
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
  lastShotBackhand: false,
  lastShotKind: null,
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
  scrimmageHomeGone: [],
  scrimmageAwayGone: [],
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
  freeCamReapply: false,
  camPick: false,
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
  periodEndT: 0,
  period: 1,
  periodView: 0,
  shootout: null,
  goalieRecallT: 0,
  goalieShot: null,
  whiffUntil: -10,
  whiffPending: false,
  ppRelease: null,
  ppChaos: false,
  creasePokeN: 0,
  creasePokeGoalie: null,
  passChain: 0,
  homeAttack: OPENING_HOME_ATTACK,
  benchDump: null,
  lineBrawl: null,
  poseEditorActive: false,
  poseEditorLock: false,
  poseHold: false,
  namedPose: null,
  namedPoseIndex: null,
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
    comX: x,
    comZ: z,
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

/** Root offset. Posed reach toward the dot is 0.269 m, so this stops just outside the center-line paint. */
const FACEOFF_DOT_X = 0.393;
/** Extra wingers on one hash. The crouch reaches about 1.6 m, so 2.2 m still crosses. */
const FACEOFF_WING_X = 1.64;

function faceoffWingX(zOff: number): number {
  const minR = FACEOFF_R + 0.08;
  if (Math.hypot(FACEOFF_WING_X, zOff) >= minR) return FACEOFF_WING_X;
  return Math.sqrt(minR * minR - zOff * zOff);
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
      const zOff =
        extras.length === 1
          ? zSpread * (side === "home" ? 1 : -1)
          : laneZ(extras.length, i, zSpread);
      s.x = ox + sign * faceoffWingX(zOff);
      s.z = oz + zOff;
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
  // Only a forward takes the dot. With no forwards, defenders stay on the
  // defense line and the goalie stays in the crease.
  const taker = homeSkate.find((s) => s.kind === "winger");
  const user = taker ?? homeSkate[0] ?? skaters.find((s) => s.side === "home");
  const userId = user?.id ?? -1;
  const ox = world.faceX;
  const oz = world.faceZ;
  if (taker) {
    taker.x = ox + defendDir("home") * FACEOFF_DOT_X;
    taker.z = oz;
    taker.yaw = faceYaw("home");
    taker.vx = 0;
    taker.vz = 0;
  }
  const foe = awaySkate.find((s) => s.kind === "winger");
  if (foe) {
    foe.x = ox + defendDir("away") * FACEOFF_DOT_X;
    foe.z = oz;
    foe.yaw = faceYaw("away");
    foe.vx = 0;
    foe.vz = 0;
  }
  const homeDot = taker?.id ?? -1;
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
  if (regOtIce()) {
    homeLu = { g: 1, d: 0, o: 3 };
    awayLu = { g: 1, d: 0, o: 3 };
    ui.setLiveHome(homeLu);
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
  crowdTouch = null;
  lastOnIce = { x: world.faceX, z: world.faceZ };
  world.time = 0;
  clearPracticeGoalPuck();
  faceoffClearUntil = -1;
  world.lastShoot = -10;
  world.lastPass = -10;
  world.lastPassTo = null;
  world.lastPasser = null;
  passMeet = null;
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
  armFaceoffBackSkate();
  world.stoppage = false;
  world.stoppageT = 0;
  world.coverT = 0;
  goalieReleaseId = -1;
  goaliePlayChargeId = -1;
  userGoaliePokePoseUntil = -1;
  goaliePlayReleaseUntil.clear();
  goalieDiveSave.clear();
  world.whistle = null;
  world.lastShotSlap = false;
  world.lastShotBackhand = false;
  world.lastShotKind = null;
  world.lastShotOneTimer = false;
  world.lastShotRedirect = false;
  world.lastShooter = null;
  world.lastShotDist = 0;
  world.lastShotCorner = false;
  world.lastShotCornerSide = 0;
  shotIron = null;
  clearShotShape();
  ironResolved = null;
  ironStanceEnd = 0;
  ironStanceT = -20;
  ironPoseLatch.clear();
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
  passChargeCancel = false;
  resetSauceWindow();
  clearWindupCommit();
  windupCommitHot = false;
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
  goalieCircleChase.clear();
  goalieLooseSkate.clear();
  goalieBehindSince.clear();
  goalieNetEscape.clear();
  pressPeelAt.clear();
  pressPeelEnd.clear();
  dekeCommit.clear();
  cpuDekeAt.clear();
  cpuOtLook.clear();
  stickLooseUntil = -1;
  stickLooseBy = -1;
  stickLooseFrom = -1;
  xPokePress = false;
  xPokeArmed = false;
  userStickCommit = false;
  userAProtectId = -1;
  userAProtectUntil = -1;
  userXProtectId = -1;
  userXProtectUntil = -1;
  ozHold.clear();
  clearUserOzPlan();
  ozEntrySide = 0;
  ozEntryFrame = Number.NaN;
  wingAim.clear();
  wingAimFrame = Number.NaN;
  passChaseFrame = Number.NaN;
  passChaseId = -1;
  nzSafetyFrame = Number.NaN;
  nzSafetyId = -1;
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
  clearReplayCamControl();
  world.goalPuckT = 0;
  world.goalBank = null;
  world.lastPassX = 0;
  world.lastPassZ = 0;
  resetPassChain();
  world.lastOneTimerDanger = 0;
  world.reboundN = 0;
  world.reboundSoft = false;
  stickBackUntil = -1;
  stickBackSide = 0;
  world.lastHitter = null;
  world.lastHitTime = -10;
  world.lastUserActT = world.time;
}

let rimRide: { sideZ: 1 | -1; attack: 1 | -1; until: number } | null = null;
let boardRide: { dir: 1 | -1; speed: number; until: number; phase: "seek" | "glide" } | null = null;
const overWall = new WeakSet<Puck>();
let boardBank: {
  hx: number;
  hz: number;
  vx: number;
  vz: number;
  until: number;
  loft: boolean;
} | null = null;
let passMeet: { x: number; z: number } | null = null;
let userWinding = false;
let skillStickLoading = false;
/** 1 while skating. Shot windup sets the profile's plant keep. */
let shotPlantKeep = 1;

/** Shot windup slows the user skater. Skill Stick also drops stick push so the left stick aims. */
function markShotPlant(): void {
  if (useGame.getState().controlProfile === "stick") {
    userWinding = true;
    shotPlantKeep = PLANT_KEEP_STICK;
  } else {
    shotPlantKeep = PLANT_KEEP_SKATE;
  }
}
/** This frame is a left/right aimed deke, so the 2s X shield must not arm. */
let skillStickSideHold = false;
let userStickCommit = false;

/** Larger than shotAim's 0.16 so a resting right stick does not shoot or plant. */
const SKILL_STICK_DZ = 0.36;

type SkillSide = "neutral" | "fore" | "back" | "down";

type SkillGesture = {
  fired: boolean;
  cancel: boolean;
  side: SkillSide;
  roll: number;
  slap: boolean;
  down: number;
};

const skillG: SkillGesture = {
  fired: false,
  cancel: false,
  side: "neutral",
  roll: 0,
  slap: false,
  down: 0,
};

function freshSkillGesture(): void {
  skillG.fired = false;
  skillG.cancel = false;
  skillG.side = "neutral";
  skillG.roll = 0;
  skillG.slap = false;
  skillG.down = 0;
}

/** Right stick was inside the shot-gesture deadzone on the previous sample. */
let skillRsNeutral = true;
/** This sample crossed from inside that deadzone to outside it. One check per crossing. */
let skillRsRising = false;
/** Defensive push. The shot classifier ignores the stick until it returns inside the deadzone. */
let skillHitPush = false;
/** Facing for that check. The Y hit reads heading(yaw), so this aims it along the stick. */
let skillHitYaw: number | null = null;
/** RB held on that push. Consumed like the hit so it cannot snap, and it must not check. */
let skillPokePush = false;
/** Facing for that poke. The X poke reads heading(yaw) and the blade. */
let skillPokeYaw: number | null = null;
/**
 * Sideways push with no RB. The poke still runs, but a loose puck in the stick
 * lane is knocked free instead of collected. Cleared when that poke ends.
 */
let skillSweepPoke = false;
/** This sweep already touched the puck, so the rest of the poke does not collect it. */
let skillSweepBat = false;

function clearSkillStickHit(): void {
  skillRsNeutral = true;
  skillRsRising = false;
  skillHitPush = false;
  skillHitYaw = null;
  skillPokePush = false;
  skillPokeYaw = null;
  skillSweepPoke = false;
  skillSweepBat = false;
}

function trackSkillStick(act: Actions): void {
  const hot = Math.hypot(act.aimX, act.aimY) >= SKILL_STICK_DZ;
  skillRsRising = hot && skillRsNeutral;
  skillRsNeutral = !hot;
  if (!hot) {
    skillHitPush = false;
    skillPokePush = false;
  }
}

/**
 * Poke shield while A, X, or Select (saucer) is held with the puck.
 * One window per possession, from the first frame any of those is down.
 * The window is a hard cap: it does not auto-pass or auto-shoot, and a later press does not refresh it.
 * Select uses the same window as A. It does not start a second timer or extend the first.
 * A Skill Stick left/right hold does not use this. That protect is skillProtectSide.
 */
const USER_A_PROTECT_S = 2;
/**
 * Aimed-deke protect. While the right stick is held left or right the blade stays
 * on that side, and a poke from the other side does not take the puck.
 * Releasing the stick returns the blade to the center plate. The denial keeps
 * the side it had for this long, well under a second, then ends.
 * −1 is the forehand (body local −X). +1 is the backhand (body local +X).
 */
const SKILL_PROTECT_TAIL = 0.4;
let skillProtectSide = 0;
let skillProtectUntil = -1;

function clearSkillProtect(): void {
  skillProtectSide = 0;
  skillProtectUntil = -1;
}

/** Side hold of the aimed deke. Each frame pushes the short release tail out. */
function holdSkillProtect(side: -1 | 1): void {
  skillProtectSide = side;
  skillProtectUntil = world.time + SKILL_PROTECT_TAIL;
  skillStickSideHold = true;
}

function skillProtectLive(): boolean {
  return skillProtectSide !== 0 && world.time < skillProtectUntil;
}

/**
 * Checker body in the carrier's yaw+π frame.
 * Blade local X has the same sign as skillProtectSide, so the other sign is the exposed side.
 * A checker nearly on the center line is not on either side.
 */
function skillProtectBlocks(holder: Skater, poker: Skater): boolean {
  if (!skillProtectLive()) return false;
  if (holder.id !== world.userId) return false;
  if (useGame.getState().controlProfile !== "stick") return false;
  const rel = skaterLocal(holder, poker.x, poker.z);
  if (Math.abs(rel.lx) < 0.25) return false;
  return Math.sign(rel.lx) !== skillProtectSide;
}
let userAProtectId = -1;
let userAProtectUntil = -1;
let userXProtectId = -1;
let userXProtectUntil = -1;
let slapMx = 0;
let slapMy = 0;
let cpuOtKey = -1;
let cpuOtId = -2;
let cpuOtYes = false;
/** Breakaway deke already sold this rush. cut is the lateral sign, opposite the goalie pull. */
const cpuDekeAt = new Map<number, { t: number; cut: number }>();
/** Last time this CPU skater looked at a high clear. A reset of world.time rolls again. */
const cpuClearRoll = new Map<number, number>();
/** When the carrier started waiting on a developing odd-man one-timer. */
const cpuOtLook = new Map<number, number>();
let otLinesPass = -1;
let otLinesShooter = -1;
let otLines = 0;
/** world.time minus seconds already counted in the current 4s window. */
let passChainHold: number | null = null;
let passChainHoldId = -1;
/**
 * Seconds already counted, frozen while the user's pass is in the air.
 * Null while the countdown is running.
 */
let passChainPaused: number | null = null;
/** world.time of the release this freeze belongs to. Matches lastPass. */
let passChainPauseAt = -1;
/** lastPass timestamp already added, so one catch cannot count twice. */
let passChainNoted = -1;

function publishPassChain(): void {
  const n = world.passChain;
  const ui = useGame.getState();
  if (ui.passChain !== n) ui.setPassChain(n);
}

function resetPassChain(): void {
  passChainHold = null;
  passChainHoldId = -1;
  passChainPaused = null;
  passChainPauseAt = -1;
  passChainNoted = -1;
  if (world.passChain !== 0) world.passChain = 0;
  publishPassChain();
}

function clearPassChain(): void {
  passChainHold = null;
  passChainHoldId = -1;
  passChainPaused = null;
  passChainPauseAt = -1;
  if (world.passChain !== 0) world.passChain = 0;
  publishPassChain();
}

/** A home teammate who was the target takes a live pass. Time does not do this. */
function noteChainReception(s: Skater): void {
  if (world.stoppage || world.faceoff || world.whistle === "goal") return;
  if (s.side !== "home" || world.lastPassTo !== s.id) return;
  if (!(world.lastShoot < world.lastPass)) return;
  const passer = world.lastPasser !== null ? world.skaters[world.lastPasser] : undefined;
  if (!passer || passer.side !== "home" || passer.id === s.id) return;
  if (passChainNoted === world.lastPass) return;
  passChainNoted = world.lastPass;
  world.passChain += 1;
  publishPassChain();
  if (passChainPaused !== null && world.lastPass === passChainPauseAt) resumePassChainHold(s.id);
}

/** A clear that is not a pass ends the hold. Under 4s does not subtract. */
function stopPassChainHold(id: number): void {
  if (id !== world.userId) return;
  passChainHold = null;
  passChainHoldId = -1;
  passChainPaused = null;
  passChainPauseAt = -1;
}

/** Freeze the 4s countdown on the user's pass release. Flight does not count. */
function pausePassChainHold(id: number): void {
  if (id !== world.userId || passChainPaused !== null) return;
  let elapsed = 0;
  if (passChainHold !== null && passChainHoldId === id) {
    elapsed = Math.max(0, world.time - passChainHold);
  }
  if (elapsed >= 4) {
    const steps = Math.floor(elapsed / 4);
    elapsed -= steps * 4;
    const next = Math.max(0, world.passChain - steps);
    if (next !== world.passChain) {
      world.passChain = next;
      publishPassChain();
    }
  }
  passChainPaused = elapsed;
  passChainPauseAt = world.time;
  passChainHold = null;
  passChainHoldId = -1;
}

/** Continue the frozen window. The gap since the release is not added. */
function resumePassChainHold(id: number): void {
  if (passChainPaused === null) return;
  const elapsed = passChainPaused;
  passChainPaused = null;
  passChainPauseAt = -1;
  passChainHold = world.time - elapsed;
  passChainHoldId = id;
}

function syncPassChainHold(): void {
  const owner = world.puck.owner !== null ? world.skaters[world.puck.owner] : undefined;
  if (owner?.side === "away") {
    clearPassChain();
    return;
  }
  if (passChainPaused !== null) {
    // The pass is still out, or the user has it back. Do not count the gap.
    if (owner?.id === world.userId) resumePassChainHold(owner.id);
    return;
  }
  if (passChainHold !== null && owner?.id === passChainHoldId) return;
  if (owner?.id !== world.userId) {
    passChainHold = null;
    passChainHoldId = -1;
    return;
  }
  // Origin is the frame the user has the puck, never lastPass.
  if (passChainHold === null || passChainHoldId !== owner.id) {
    passChainHold = world.time;
    passChainHoldId = owner.id;
  }
}

function tickPassChainHold(): void {
  if (passChainPaused !== null) return;
  if (passChainHold === null || world.puck.owner !== passChainHoldId) return;
  const elapsed = world.time - passChainHold;
  if (elapsed < 4) return;
  const steps = Math.floor(elapsed / 4);
  passChainHold += steps * 4;
  const next = Math.max(0, world.passChain - steps);
  if (next === world.passChain) return;
  world.passChain = next;
  publishPassChain();
}

function cpuPokeTune(): { reach: number } {
  const n = world.passChain;
  if (n >= 3) return { reach: 0.55 };
  if (n === 2) return { reach: 0.72 };
  if (n === 1) return { reach: 0.95 };
  return { reach: 1.22 };
}
let shotIron: { kind: "post" | "bar"; z: number; y: number } | null = null;
let shotSharp = 0;
let shotReleaseZ = 0;
let shotAttack: 1 | -1 = 1;
let shotBelowLine = false;
let shotFromLine = 99;
let meshAbsorbShot = false;
let belowLineDeflectId = -1;
let meshRestUntil = -1;
let meshRestY = 0;
let meshRestShelf = false;
/** Net that last rang, and when. Compact butterfly holds in that end for a short window. */
let ironStanceEnd: 1 | -1 | 0 = 0;
let ironStanceT = -20;
/** Pose chosen for this iron shot, so the hands do not flicker as the puck moves. */
const ironPoseLatch = new Map<number, { shoot: number; pose: string }>();
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

/**
 * Headless CPU drill accuracy sample. Stays off in play.
 * One away shooter is held on a spot and uses the normal release.
 * The 60s clock does not end the run, and a hit does not clear the board.
 */
let cpuDrillProbe = false;
let cpuDrillWatch = false;
let cpuDrillSpotName = "";
let cpuDrillSpot: { x: number; z: number } | null = null;
let cpuDrillTargetHits = 0;
let cpuDrillOnNet = 0;
let cpuDrillNoted = false;
/** Watchable 0v6 scrimmage. Off unless ?cpuScrimmage= is set. Does not change shot aim. */
let cpuScrimmageWatch = false;

export function setCpuDrillProbe(on: boolean): void {
  cpuDrillProbe = on;
}

/** Where the probe holds the shooter. Ignored while the probe is off. */
export function setCpuDrillSpot(x: number, z: number): void {
  cpuDrillSpot = { x, z };
}

/** True only while ?cpuScrimmage= is driving a watchable clear. */
export function cpuScrimmageWatchOn(): boolean {
  return cpuScrimmageWatch;
}

const CPU_DRILL_WATCH_SPOTS = {
  dot: { name: "attacking faceoff dot", x: FACEOFF_EZ_X, z: FACEOFF_SPOT_Z },
  blue: { name: "attacking blue line", x: BLUE_X, z: 0 },
  center: { name: "center ice", x: 0, z: 0 },
} as const;

/**
 * Start a watchable CPU drill from ?cpuDrill=4|8|12|16 and optional
 * ?cpuDrillSpot=dot|blue|center. Returns a HUD label, or null when the query is absent.
 * Off unless that query is set.
 */
export function startCpuDrillWatchFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const raw = q.get("cpuDrill");
  if (raw !== "4" && raw !== "8" && raw !== "12" && raw !== "16") return null;
  const spotKey = q.get("cpuDrillSpot") ?? "dot";
  const spot = CPU_DRILL_WATCH_SPOTS[spotKey as keyof typeof CPU_DRILL_WATCH_SPOTS] ?? CPU_DRILL_WATCH_SPOTS.dot;
  const ui = useGame.getState();
  ui.setClockMode("drill");
  ui.setDrillTargets(Number(raw) as 4 | 8 | 12 | 16);
  ui.setHomeLineup({ g: 0, d: 0, o: 0 });
  ui.setAwayLineup({ g: 0, d: 0, o: 1 });
  ui.setGameSpeed(1.25);
  ui.setCpuOffense(2);
  ui.setCpuDefense(2);
  ui.setCpuGoalie(1.6);
  ui.setOffsides(false);
  ui.setPaused(false);
  ui.setPlaying(true);
  cpuDrillWatch = true;
  cpuDrillSpotName = spot.name;
  setCpuDrillProbe(true);
  setCpuDrillSpot(spot.x, spot.z);
  resetWorld();
  const meters = Math.abs(GOAL_LINE_X - spot.x).toFixed(1);
  return `CPU drill · ${spot.name} · ${meters} m`;
}

/**
 * Watch a 0v6 scrimmage clear from ?cpuScrimmage=4|8|12|16.
 * Home is empty. Away is 0G/2D/4F. Off unless that query is set.
 * ?cpuDrill= wins when both are present.
 */
export function startCpuScrimmageWatchFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  if (q.get("cpuDrill") === "4" || q.get("cpuDrill") === "8" || q.get("cpuDrill") === "12" || q.get("cpuDrill") === "16") {
    return null;
  }
  const raw = q.get("cpuScrimmage");
  if (raw !== "4" && raw !== "8" && raw !== "12" && raw !== "16") return null;
  const ui = useGame.getState();
  ui.setClockMode("scrimmage");
  ui.setHomeLineup({ g: 0, d: 0, o: 0 });
  ui.setAwayLineup({ g: 0, d: 2, o: 4 });
  ui.setScrimmageHomeTargets(Number(raw) as 4 | 8 | 12 | 16);
  ui.setScrimmageAwayTargets(Number(raw) as 4 | 8 | 12 | 16);
  ui.setGameSpeed(1.25);
  ui.setCpuOffense(2);
  ui.setCpuDefense(2);
  ui.setCpuGoalie(1.6);
  ui.setOffsides(false);
  ui.setPaused(false);
  ui.setPlaying(true);
  cpuScrimmageWatch = true;
  resetWorld();
  return `CPU scrimmage · 0v6 · ${raw} targets`;
}

/** Camera look for the watchable drill. Null in normal play. */
export function cpuDrillWatchLook(): { x: number; y: number; z: number } | null {
  if (!cpuDrillWatch || !cpuDrillActive()) return null;
  const s = cpuDrillShooter();
  if (!s) return null;
  return { x: s.x, y: 1.05, z: s.z };
}

export function resetCpuDrillAccuracy(): void {
  cpuDrillTargetHits = 0;
  cpuDrillOnNet = 0;
  cpuDrillNoted = false;
}

export function cpuDrillAccuracy(): { targetHits: number; onNet: number } {
  return { targetHits: cpuDrillTargetHits, onNet: cpuDrillOnNet };
}

/** One result per release. A target hit is also on net. Ghosts do not count. */
function noteCpuDrillShot(targetHit: boolean): void {
  if (!cpuDrillProbe || cpuDrillNoted || steppingGhost) return;
  cpuDrillNoted = true;
  cpuDrillOnNet += 1;
  if (targetHit) cpuDrillTargetHits += 1;
}

function cpuDrillActive(): boolean {
  return cpuDrillProbe && useGame.getState().clockMode === "drill";
}

function cpuDrillShooter(): Skater | undefined {
  if (!cpuDrillActive()) return undefined;
  return world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
}

/** Cell center of the first target still up. CPU_SHOT_ERR still scatters the release. */
function cpuDrillCellLock(): { tZ: number; wantY: number } | null {
  if (!cpuDrillActive()) return null;
  const list = drillTargetList();
  const i = world.drillGone.findIndex((gone) => !gone);
  const t = i >= 0 ? list[i] : undefined;
  if (!t) return null;
  const { cols, rows } = drillGrid();
  const hw = GOAL_W / 2;
  const z = -hw + (t.col + 0.5) * (GOAL_W / cols);
  const y = (t.row + 0.5) * (GOAL_H / rows);
  return {
    tZ: z,
    wantY: Math.max(PUCK_Y + 0.08, Math.min(mouthTopY() - 0.03, y)),
  };
}

/** Held spot, facing the +X target net. The same place for every release. */
function holdCpuDrillSpot(s: Skater): void {
  s.x = cpuDrillSpot ? cpuDrillSpot.x : GOAL_LINE_X - 8;
  s.z = cpuDrillSpot ? cpuDrillSpot.z : 0;
  s.vx = 0;
  s.vz = 0;
  s.yaw = drillFaceYaw();
}

function parkCpuDrillBystanders(): void {
  const shooter = cpuDrillShooter();
  if (!shooter) return;
  for (const s of world.skaters) {
    if (s.id === shooter.id) continue;
    s.x = -GOAL_LINE_X + 1.5;
    s.z = 0;
    s.vx = 0;
    s.vz = 0;
  }
}

const PERIOD_SECONDS = GAME_CLOCK_DISPLAY_MINUTES * 60;
const ROLLER_PERIOD_SECONDS = ROLLER_CLOCK_DISPLAY_MINUTES * 60;
const PERIOD_END_HOLD = 2;
/** Real seconds of celebration after the final buzzer, then a new game. */
const MATCH_END_HOLD = 12;
let matchEndHold = 0;
/** A counted goal in Game overtime. The post-goal flow ends the match instead of facing off. */
let overtimeWinner = false;

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

export function targetBoard(n: DrillTargets): { cols: number; rows: number; list: DrillTarget[] } {
  if (n === 4) return { cols: 4, rows: 3, list: DRILL_4 };
  if (n === 12) return { cols: 6, rows: 4, list: DRILL_12 };
  if (n === 16) return { cols: 8, rows: 5, list: DRILL_16 };
  return { cols: 4, rows: 3, list: DRILL_8 };
}

export function drillTargetList(): DrillTarget[] {
  return targetBoard(useGame.getState().drillTargets).list;
}

export function drillGrid(): { cols: number; rows: number } {
  const board = targetBoard(useGame.getState().drillTargets);
  return { cols: board.cols, rows: board.rows };
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

function gridCellIndex(
  y: number,
  z: number,
  cols: number,
  rows: number,
  targets: DrillTarget[],
): number {
  const hw = GOAL_W / 2;
  if (y < 0 || y > GOAL_H || Math.abs(z) > hw) return -1;
  const col = Math.min(cols - 1, Math.max(0, Math.floor(((z + hw) / GOAL_W) * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((y / GOAL_H) * rows)));
  return targets.findIndex((t) => t.col === col && t.row === row);
}

export function drillCellIndex(y: number, z: number): number {
  const { cols, rows, list } = targetBoard(useGame.getState().drillTargets);
  return gridCellIndex(y, z, cols, rows, list);
}

function drill16MouthCell(
  lat: number,
  hgt: number,
  zSign: number,
): { col: number; row: number } | null {
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

function drill16CornerSpot(
  lat: number,
  hgt: number,
  zSign: number,
): { tZ: number; wantY: number } | null {
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

function resetScrimmageBoards(): void {
  const ui = useGame.getState();
  world.scrimmageHomeGone = Array.from(
    { length: targetBoard(ui.scrimmageHomeTargets).list.length },
    () => false,
  );
  world.scrimmageAwayGone = Array.from(
    { length: targetBoard(ui.scrimmageAwayTargets).list.length },
    () => false,
  );
  ui.setScrimmageDown(0, 0);
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

/** Knocked board piece. `awayFromNet` is +1 or -1 toward center ice. */
function spawnLooseTarget(x: number, y: number, z: number, awayFromNet: number, w: number, h: number, pts: number): void {
  const kick = 3.4 + Math.random() * 2.1;
  world.drillCards.push({
    x,
    y,
    z,
    vx: awayFromNet * kick,
    vy: 1.15 + Math.random() * 1.5,
    vz: world.puck.vz * 0.05 + (Math.random() - 0.5) * 1.7,
    rx: (Math.random() - 0.5) * 0.25,
    ry: (Math.random() - 0.5) * 0.45,
    rz: Math.PI / 2 + (Math.random() - 0.5) * 0.18,
    sx: (Math.random() - 0.5) * 16,
    sy: (Math.random() - 0.5) * 12,
    sz: (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 8),
    w,
    h,
    pts,
    age: 0,
    flutter: Math.random() * Math.PI * 2,
  });
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
  spawnLooseTarget(GOAL_LINE_X - 0.05, y, z, -1, rowH * 0.88, colW * 0.88, t.pts);
}

function spawnScrimmageCard(team: "home" | "away", index: number): void {
  const ui = useGame.getState();
  const count = team === "home" ? ui.scrimmageHomeTargets : ui.scrimmageAwayTargets;
  const grid = targetBoard(count);
  const t = grid.list[index];
  if (!t) return;
  const netX = defendDir(team) * GOAL_LINE_X;
  const towardCenter = -Math.sign(netX) || -1;
  const colW = GOAL_W / grid.cols;
  const rowH = GOAL_H / grid.rows;
  const y = (t.row + 0.5) * rowH;
  const z = -GOAL_W / 2 + (t.col + 0.5) * colW;
  spawnLooseTarget(netX + towardCenter * 0.05, y, z, towardCenter, rowH * 0.88, colW * 0.88, 0);
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
    const damp = Math.exp(-PUCK_DRAG * dt);
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
  if (
    world.drillGhosts.some(
      (g) => g.age >= 1.5 && !g.strike && !(drillWinLodged && g === drillWinPuck),
    )
  ) {
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
  if (world.drillCards.some((c) => c.age >= 1.5 && c.y <= 0.08)) {
    world.drillCards = world.drillCards.filter((c) => c.age < 1.5 || c.y > 0.08);
  }
}

function giveUserPuck(): void {
  const cpu = cpuDrillShooter();
  if (cpu) {
    const b = stickBlade(cpu);
    world.puck.owner = cpu.id;
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
    useGame.getState().setHasPuck(false);
    return;
  }
  const u =
    world.skaters.find((s) => s.id === world.userId) ??
    world.skaters.find((s) => s.side === "home");
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
  const sample = cpuDrillProbe && !cpuDrillWatch;
  if (i < 0 || (!sample && world.drillGone[i])) return;
  if (sample) noteCpuDrillShot(true);
  else world.drillGone[i] = true;
  spawnDrillCard(i);
  const pts = drillTargetList()[i]!.pts;
  const ui = useGame.getState();
  ui.setDrillScore(ui.drillScore + pts);
  world.goalSide = "home";
  world.goalTicker = 0.48;
  world.drillCheer = 0.48;
  ui.setGoalSide("home");
  let wonNow = false;
  if (!sample && world.drillGone.length > 0 && world.drillGone.every(Boolean)) {
    world.drillWon = true;
    wonNow = true;
    if (!cpuDrillProbe) drillPromote = true;
    world.drillElapsed = cpuDrillProbe ? world.time : Math.max(0, DRILL_SECONDS - world.periodClock);
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
  if (wonNow) {
    armCpuKitCycle();
    noteDrillWin(puck);
  }
}

function strikeTargetBoard(
  side: 1 | -1,
  prevX: number,
  prevY: number,
  prevZ: number,
  x: number,
  y: number,
  z: number,
  cols: number,
  rows: number,
  targets: DrillTarget[],
  gone: boolean[],
): { crossed: boolean; index: number; fresh: boolean } {
  const mouth = side * GOAL_LINE_X;
  const fromIce = side > 0 ? prevX < mouth : prevX > mouth;
  const crossed = (prevX - mouth) * (x - mouth) <= 0 && x !== prevX && fromIce;
  if (!crossed) return { crossed: false, index: -1, fresh: false };
  const t = (mouth - prevX) / (x - prevX || 1);
  const hy = prevY + (y - prevY) * t;
  const hz = prevZ + (z - prevZ) * t;
  let index = gridCellIndex(hy, hz, cols, rows, targets);
  if (index < 0) index = gridCellIndex(y, z, cols, rows, targets);
  const fresh = index >= 0 && !gone[index];
  return { crossed: true, index, fresh };
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
): { crossed: boolean; hit: boolean; onNet: boolean } {
  const grid = targetBoard(useGame.getState().drillTargets);
  const board = strikeTargetBoard(
    1,
    prevX,
    prevY,
    prevZ,
    x,
    y,
    z,
    grid.cols,
    grid.rows,
    grid.list,
    world.drillGone,
  );
  let i = board.fresh ? board.index : -1;
  if (board.index < 0) {
    const corner = drill16EnteredCorner(prevX, prevY, prevZ, shotX, shotY, shotZ);
    if (corner >= 0 && !world.drillGone[corner]) i = corner;
  }
  let onNet = i >= 0;
  if (!onNet && board.crossed && x !== prevX) {
    const t = (GOAL_LINE_X - prevX) / (x - prevX || 1);
    const hy = prevY + (y - prevY) * t;
    const hz = prevZ + (z - prevZ) * t;
    onNet = hy >= 0 && hy <= GOAL_H && Math.abs(hz) <= GOAL_W / 2;
  }
  if (i >= 0) {
    hitDrillTarget(i, puck);
    return { crossed: board.crossed, hit: true, onNet: true };
  }
  return { crossed: board.crossed, hit: false, onNet };
}

function teamOnMouth(mouth: 1 | -1): "home" | "away" {
  const homeMouth: 1 | -1 = defendDir("home") >= 0 ? 1 : -1;
  return homeMouth === mouth ? "home" : "away";
}

function scrimmageGone(team: "home" | "away"): boolean[] {
  return team === "home" ? world.scrimmageHomeGone : world.scrimmageAwayGone;
}

function scrimmageWinner(): "home" | "away" | null {
  const ui = useGame.getState();
  if (ui.clockMode !== "scrimmage") return null;
  const homeScored = world.scrimmageAwayGone.filter(Boolean).length;
  const awayScored = world.scrimmageHomeGone.filter(Boolean).length;
  if (ui.scrimmageAwayTargets > 0 && homeScored >= ui.scrimmageAwayTargets) return "home";
  if (ui.scrimmageHomeTargets > 0 && awayScored >= ui.scrimmageHomeTargets) return "away";
  return null;
}

/** Winner of the round that just ended. Applied on the next fresh reset, not during the banner. */
let scrimmageBump: { winner: "home" | "away"; home: DrillTargets; away: DrillTargets } | null = null;

function nextScrimmageCount(n: DrillTargets): DrillTargets {
  if (n === 4) return 8;
  if (n === 8) return 12;
  if (n === 12) return 16;
  return 16;
}

function noteScrimmageProgress(winner: "home" | "away"): void {
  const ui = useGame.getState();
  scrimmageBump = { winner, home: ui.scrimmageHomeTargets, away: ui.scrimmageAwayTargets };
}

onScrimmageTargetsSet(() => {
  scrimmageBump = null;
});

/** The loser defends more targets next round. The winner's net stays. A manual count cancels it. */
function applyScrimmageProgress(): void {
  const bump = scrimmageBump;
  scrimmageBump = null;
  if (!bump) return;
  const ui = useGame.getState();
  if (ui.clockMode !== "scrimmage") return;
  if (ui.scrimmageHomeTargets !== bump.home || ui.scrimmageAwayTargets !== bump.away) return;
  if (bump.winner === "home") {
    const next = nextScrimmageCount(bump.away);
    if (next !== bump.away) ui.setScrimmageAwayTargets(next);
  } else {
    const next = nextScrimmageCount(bump.home);
    if (next !== bump.home) ui.setScrimmageHomeTargets(next);
  }
}

function endScrimmageMatch(): boolean {
  const winner = scrimmageWinner();
  if (!winner) return false;
  const fresh = !world.periodOver;
  world.periodOver = true;
  world.goalSide = winner;
  world.whistle = null;
  const ui = useGame.getState();
  ui.setGoalSide(winner);
  ui.setPeriodOver(true);
  ui.setWhistle(null);
  if (fresh) {
    if (winner === "home") armCpuKitCycle();
    noteScrimmageProgress(winner);
  }
  return true;
}

function knockScrimmage(team: "home" | "away", index: number): void {
  const gone = scrimmageGone(team);
  if (index < 0 || index >= gone.length || gone[index]) return;
  gone[index] = true;
  spawnScrimmageCard(team, index);
  const homeScored = world.scrimmageAwayGone.filter(Boolean).length;
  const awayScored = world.scrimmageHomeGone.filter(Boolean).length;
  useGame.getState().setScrimmageDown(homeScored, awayScored);
  const mouth: 1 | -1 = defendDir(team) >= 0 ? 1 : -1;
  startStoppage("goal", mouth);
}

function tickScrimmage(
  prevX: number,
  prevY: number,
  prevZ: number,
  x: number,
  y: number,
  z: number,
): boolean {
  const ui = useGame.getState();
  if (ui.clockMode !== "scrimmage" || world.stoppage || world.periodOver) return false;
  for (const mouth of [1, -1] as const) {
    const team = teamOnMouth(mouth);
    const count = team === "home" ? ui.scrimmageHomeTargets : ui.scrimmageAwayTargets;
    const grid = targetBoard(count);
    const hit = strikeTargetBoard(
      mouth,
      prevX,
      prevY,
      prevZ,
      x,
      y,
      z,
      grid.cols,
      grid.rows,
      grid.list,
      scrimmageGone(team),
    );
    if (hit.fresh) {
      knockScrimmage(team, hit.index);
      return true;
    }
    if (bounceScrimmageFace(mouth, prevX, prevY, prevZ, x, y, z)) return true;
  }
  return false;
}

/** Scrimmage misses treat the goal mouth as a tarp. A non-target hit comes back out. */
function bounceScrimmageFace(
  mouth: 1 | -1,
  prevX: number,
  prevY: number,
  prevZ: number,
  x: number,
  y: number,
  z: number,
): boolean {
  if ((prevX - mouth * GOAL_LINE_X) * (x - mouth * GOAL_LINE_X) >= 0 || x === prevX) return false;
  const line = mouth * GOAL_LINE_X;
  const t = (line - prevX) / (x - prevX || 1);
  if (t < 0 || t > 1) return false;
  const hy = prevY + (y - prevY) * t;
  const hz = prevZ + (z - prevZ) * t;
  const hw = GOAL_W / 2;
  if (hy < -0.02 || hy > GOAL_H || Math.abs(hz) > hw) return false;
  const puck = world.puck;
  const fromIce = (prevX - line) * mouth < 0;
  puck.owner = null;
  puck.x = line + mouth * (fromIce ? -0.07 : 0.07);
  puck.y = Math.max(PUCK_Y, Math.min(hy, GOAL_H - 0.04));
  puck.z = Math.max(-hw + 0.04, Math.min(hw - 0.04, hz));
  const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
  const into = puck.vx * mouth;
  let vx = puck.vx;
  if (fromIce && into > 0) vx = puck.vx - 1.35 * into * mouth;
  else if (!fromIce && into < 0) vx = puck.vx - 1.35 * into * mouth;
  writeRebound(puck, vx, Math.min(puck.vy, 0) * 0.25, puck.vz * 0.45, cap * 0.25);
  return true;
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
    const strike = strikeDrillMouth(
      prevX,
      prevY,
      prevZ,
      puck.x,
      puck.y,
      puck.z,
      shotX,
      shotY,
      shotZ,
      puck,
    );
    if (strike.crossed || strike.hit) settled = true;
    if (strike.onNet && !strike.hit) noteCpuDrillShot(false);
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
  periodEndUserPlay = false;
  if (!opts?.keepScore) disarmCpuKitCycle();
  world.poseHold = false;
  world.namedPose = null;
  world.namedPoseIndex = null;
  const uiAtStart = useGame.getState();
  const pauseEdited = world.pauseDirty;
  const liveFree = uiAtStart.freeCamLive;
  const holdLive = !opts?.keepScore && (pauseEdited || liveFree);
  const holdOrbit =
    !opts?.keepScore &&
    !holdLive &&
    uiAtStart.paused &&
    uiAtStart.camMode === "freestyle" &&
    world.freeCam.captured;
  const heldTheta = world.freeCam.theta;
  const heldPhi = world.freeCam.phi;
  const heldRadius = world.freeCam.radius;
  checkAbsorbed.clear();
  checkCycleIds.clear();
  burstPoseW.clear();
  checkCloseLeft.clear();
  shoulderCheckArmed.clear();
  passerCheckedAt.clear();
  passSpeedCutFor = -1;
  refStayPut.delete(world.ref);
  refStayPut.delete(world.ref2);
  refStayPut.delete(world.ref3);
  refStayPut.delete(world.ref4);
  clearGoalReactions();
  matchEndHold = 0;
  overtimeWinner = false;
  clearShootout();
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
  world.periodEndT = 0;
  if (ui.periodBreak !== 0) ui.setPeriodBreak(0);
  if (ui.clockMode === "drill") {
    assignHomeAttack(OPENING_HOME_ATTACK);
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
    ui.resetTeamShots();
    ui.setGoalSide(null);
    world.goalTicker = 0;
    world.goalSide = null;
    world.period = 1;
    world.periodOver = false;
    const openingClock =
      ui.clockMode === "roller"
        ? ROLLER_PERIOD_SECONDS
        : ui.clockMode === "scrimmage" || ui.clockMode === "shootout"
          ? 0
          : PERIOD_SECONDS;
    world.periodClock = openingClock;
    ui.setPeriod(1);
    ui.setPeriodOver(false);
    ui.setPeriodClock(openingClock);
    if (!opts?.keepReplay) clearReplayBuf();
    world.ppRelease = null;
    world.ppChaos = false;
    ui.setLiveHome(ui.homeLineup);
    ui.setLiveAway(ui.awayLineup);
    if (ui.clockMode !== "drill") assignHomeAttack(OPENING_HOME_ATTACK);
    awayNums = rollAwayNums();
    world.aimCompassLock = null;
    applyScrimmageProgress();
    resetScrimmageBoards();
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
      u.x = drillStartX();
      u.z = 0;
      u.vx = 0;
      u.vz = 0;
      u.yaw = drillFaceYaw();
    }
    world.drillView += 1;
  }
  ui.setCharge(0, null);
  ui.setWhistle(null);
  clearDelayedOffside();
  ui.setSpeed(0);
  ui.setShotKind(null);
  clearShotTrack();
  ui.resetPracticeShots();
  freshSkillGesture();
  clearSkillStickHit();
  clearSkillProtect();
  ui.setReplay(false);
  beginUserCheck();
  if (holdLive || holdOrbit) {
    world.freeCam.theta = heldTheta;
    world.freeCam.phi = heldPhi;
    world.freeCam.radius = heldRadius;
    world.freeCam.tx = world.puck.x;
    world.freeCam.ty = Math.max(0.45, world.puck.y);
    world.freeCam.tz = world.puck.z;
    world.freeCam.captured = true;
    if (holdLive) {
      ui.setCamMode("freestyle");
      ui.setFreeCamLive(true);
      world.freeCamReapply = false;
    } else {
      world.freeCamReapply = true;
    }
  } else {
    world.freeCamReapply = false;
  }
  if (!opts?.keepScore && ui.clockMode === "shootout") beginShootout();
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
    // Dive legs fold under the chest. The old trailing sample sat behind the body.
    const tail = s.dive > 0.04 ? 0.22 : -0.42;
    pts.push({ x: s.x + fx * tail, z: s.z + fz * tail, r: 0.28 });
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
  const goalie = s.kind === "goalie";
  const end = (defendDir(s.side) >= 0 ? 1 : -1) as 1 | -1;
  const mouth = end * GOAL_LINE_X;
  const pocket = GOAL_W / 2 + 0.2;
  for (let n = 0; n < 4; n++) {
    let moved = false;
    for (const p of cageBodySamples(s)) {
      const cage = resolveCage(p.x, p.z, p.r, true);
      if (!cage.hit) continue;
      let dx = cage.x - p.x;
      let dz = cage.z - p.z;
      if (dx * dx + dz * dz < 1e-10) continue;
      // Behind the goal line and still between the posts, the twine's outward
      // push is into the end boards. Slide to the boards side of the post instead.
      if (goalie) {
        const depth = (s.x - mouth) * end;
        const between = Math.abs(s.z) < pocket;
        if (depth > 0.02 && between && dx * end > 0) {
          const side = (Math.sign(s.z) || Math.sign(world.puck.z) || 1) as 1 | -1;
          dx = 0;
          dz = side * Math.max(0.08, Math.min(0.24, pocket + s.radius - Math.abs(s.z)));
        }
      }
      s.x += dx;
      s.z += dz;
      const vn = s.vx * cage.nx + s.vz * cage.nz;
      if (vn < 0) {
        s.vx -= vn * cage.nx;
        s.vz -= vn * cage.nz;
      }
      if (goalie) {
        const depth = (s.x - mouth) * end;
        const deeper = s.vx * end;
        if (depth > 0.02 && Math.abs(s.z) < pocket && deeper > 0) s.vx -= end * deeper;
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
    cpu =
      s.kind === "goalie"
        ? cpuMul("g")
        : holder && holder.side === "away"
          ? cpuMul("off")
          : cpuMul("def");
  } else {
    cpu =
      s.kind === "goalie" ? userMul("g") : s.kind === "defense" ? userMul("def") : userMul("off");
  }
  if (s.kind === "goalie") {
    // Loose goalies keep 75% of the skate cap. Carrying the puck keeps 50%.
    const pace = goaliePace(s);
    if (user && burst) {
      // Same B burst shape as a user winger, then the goalie pace above.
      const carrying = world.puck.owner === s.id;
      const offPuck = carrying ? 1 : 0.9;
      const skate = s.side === "home" ? userMul("off") : cpuMul("off");
      const burstCap = WINGER_BURST * offPuck * 1.14 * skate * pace;
      const burstAccel = WINGER_ACCEL * (carrying ? 1 : 0.92) * 1.16 * skate;
      if (!goalieOutOfCrease(s)) return { cap: burstCap, accel: burstAccel };
      return {
        cap: Math.max(goalieSkateCap(s), burstCap),
        accel: Math.max(WINGER_ACCEL, burstAccel),
      };
    }
    if (goalieOutOfCrease(s)) return { cap: goalieSkateCap(s), accel: WINGER_ACCEL };
    if (user) return { cap: 6.2 * cpu * pace, accel: 12.4 * cpu };
    return { cap: 5.2 * cpu * pace, accel: 9 * cpu };
  }
  if (shootoutCpuShooter(s)) {
    const carrying = world.puck.owner === s.id;
    const offPuck = carrying ? 1 : 0.9;
    const full = (burst ? WINGER_BURST : WINGER_SPEED) * offPuck;
    return {
      cap: full * 1.14,
      accel: WINGER_ACCEL * (carrying ? 1 : 0.92) * 1.16,
    };
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

/**
 * Chest toward the other end, away from the net this skater defends.
 * yaw −π/2 faces +X: heading fx = −sin(yaw), fz = −cos(yaw).
 * Does not read velocity. Callers keep vx/vz on the skate direction.
 */
function lockBackskateYaw(s: Skater): void {
  s.yaw = faceYaw(s.side);
}

const FACEOFF_BACK_P = 0.12;
let faceoffBackId = -1;
let faceoffBackSwingAt = Infinity;

/** One defender, on about 12% of faceoffs, back skates and then throws a check. */
function armFaceoffBackSkate(): void {
  faceoffBackId = -1;
  faceoffBackSwingAt = Infinity;
  if (Math.random() > FACEOFF_BACK_P) return;
  const cpu = world.skaters.filter(
    (s) => s.id !== world.userId && s.kind !== "goalie" && s.id !== world.homeDot && s.id !== world.awayDot,
  );
  const defs = cpu.filter((s) => s.kind === "defense");
  const pool = defs.length > 0 ? defs : cpu;
  if (pool.length === 0) return;
  const pick = pool[Math.floor(Math.random() * pool.length)]!;
  faceoffBackId = pick.id;
  faceoffBackSwingAt = world.time + 0.5;
}

/**
 * CPU is closer to its own goal than the carrier, and the carrier sits in a
 * ±30° cone along the line from the CPU away from that goal mouth.
 */
function cpuBetweenCarrier(s: Skater, holder: Skater): boolean {
  const mouthX = defendDir(s.side) * GOAL_LINE_X;
  const cpuGoal = Math.hypot(s.x - mouthX, s.z);
  const carrierGoal = Math.hypot(holder.x - mouthX, holder.z);
  if (carrierGoal <= cpuGoal + 0.05) return false;
  const dx = holder.x - s.x;
  const dz = holder.z - s.z;
  const d = Math.hypot(dx, dz);
  if (d < 3 || d > 12) return false;
  const axisX = s.x - mouthX;
  const axisZ = s.z;
  const axis = Math.hypot(axisX, axisZ) || 1;
  const dot = (dx * axisX + dz * axisZ) / (d * axis);
  const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
  return ang <= Math.PI / 6;
}

function cpuOffensiveBackBand(s: Skater): boolean {
  if (s.kind === "goalie" || world.puck.owner !== s.id) return false;
  const past = s.x * attackDir(s.side) - BLUE_X;
  return past >= 0 && past <= SKATER_STICK_LEN;
}

/** Sets or clears backskate for one CPU skater or CPU goalie. */
function refreshCpuBackskate(s: Skater): void {
  if (s.id === world.userId) return;
  if (s.dive > 0.04 || s.tumble !== 0 || s.stun > 0.04 || s.struck > 0.18 || world.stoppage) {
    if (s.id !== faceoffBackId) s.backskate = false;
    return;
  }
  if (s.id === faceoffBackId) {
    s.backskate = true;
    if (world.time >= faceoffBackSwingAt && s.hit <= 0) {
      s.hit = 0.42;
      armCheckSwing(s);
      faceoffBackId = -1;
    }
    return;
  }
  if (cpuOffensiveBackBand(s)) {
    s.backskate = true;
    return;
  }
  const holder = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  s.backskate = !!holder && holder.side !== s.side && holder.kind !== "goalie" && cpuBetweenCarrier(s, holder);
}

/**
 * Loose puck running up to a skater who would skate past it.
 * Returns the pace to ease toward, or null when this is not a reception.
 */
function incomingPuckPace(s: Skater, wx: number, wz: number, mag: number, burst: boolean): number | null {
  if (periodEndLive()) return null;
  if (burst || s.kind === "goalie") return null;
  if (s.dive > 0.04 || s.stun > 0.08 || s.windup > 0.04 || s.follow > 0.02) return null;
  if (s.tumble !== 0 && s.struck > 0.15) return null;
  if (world.faceoff || world.stoppage || world.whistle) return null;
  const puck = world.puck;
  if (puck.owner !== null || puck.y > 0.45 || Math.abs(puck.vy) > 0.8) return null;
  if (world.lastPasser === s.id && world.time - world.lastPass < 0.4) return null;
  if (
    world.lastShooter === s.id &&
    world.lastShoot >= world.lastPass &&
    world.time - world.lastShoot < 0.4
  )
    return null;
  const dx = s.x - puck.x;
  const dz = s.z - puck.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.45 || dist > 7.5) return null;
  const pspd = Math.hypot(puck.vx, puck.vz);
  if (pspd < 2.4 || pspd > 16) return null;
  const px = puck.vx / pspd;
  const pz = puck.vz / pspd;
  const along = dx * px + dz * pz;
  const perp = Math.abs(-dx * pz + dz * px);
  if (along < 0.45 || along > 6.5 || perp > 1.45) return null;
  const eta = along / pspd;
  if (eta < 0.06 || eta > 0.9) return null;
  if (mag > 0.5 && wx * px + wz * pz < -0.12) return null;
  const skateAlong = s.vx * px + s.vz * pz;
  if (skateAlong < pspd * 0.92) return null;
  return Math.max(2.4, pspd * 0.94);
}

/** Radians of stride per meter. strideLeft and strideRight each hold for half a turn. */
const STRIDE_PER_M = 2.35;
/** Speed where those stride poses take over. A dive that has stopped still trades feet this fast. */
const STRIDE_SKATE = 2.6;
/** Auto deke timer starts here and the named pose holds until it falls through the end. */
const AUTO_DEKE_START = 1.05;
const AUTO_DEKE_END = 0.02;
/** Opening beat of a check, then shoulder check 2 for the rest of the swing. */
const SHOULDER_CHECK_LEAD = 0.12;

function stepStride(s: Skater, dt: number, speed: number): void {
  s.stride += speed * STRIDE_PER_M * dt;
}

function stepDiveStride(s: Skater, dt: number): void {
  if (s.kind === "goalie") return;
  stepStride(s, dt, Math.max(Math.hypot(s.vx, s.vz), STRIDE_SKATE));
}

/** Positive sine is the left pose, matching strideLeft / strideRight. */
export function stridePair<T>(stride: number, left: T, right: T): T {
  return Math.sin(stride) > 0 ? left : right;
}

/**
 * auto deke 1, then auto deke 2, then auto deke 1.
 * The three phases split the deke pose window into equal thirds.
 */
export function autoDekePoseName(deke: number): "autoDeke1" | "autoDeke2" {
  const third = (AUTO_DEKE_START - AUTO_DEKE_END) / 3;
  const mid = AUTO_DEKE_START - third;
  const late = AUTO_DEKE_START - 2 * third;
  if (deke > mid) return "autoDeke1";
  if (deke > late) return "autoDeke2";
  return "autoDeke1";
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
  syncCheckCycle(s);
  if (s.dive > 1) {
    s.dive -= 2.6 * dt;
    // Stick outside the skate deadzone: lunge on that command. Inside it, keep
    // the velocity the skater already has. Never steer the slide at the puck.
    let dx = 0;
    let dz = 0;
    let aimed = false;
    if (mag > 0.12) {
      const inv = 1 / mag;
      dx = wx * inv;
      dz = wz * inv;
      aimed = true;
      // User, CPU, and goalie dives share this slide. 7 m/s² cannot close a wide gap.
      s.vx += dx * 7 * dt;
      s.vz += dz * 7 * dt;
    } else {
      const sp = Math.hypot(s.vx, s.vz);
      if (sp > 0.2) {
        dx = s.vx / sp;
        dz = s.vz / sp;
        aimed = true;
      }
    }
    s.vx *= Math.exp(-1.6 * dt);
    s.vz *= Math.exp(-1.6 * dt);
    const spDive = Math.hypot(s.vx, s.vz);
    if (spDive > 6.5) {
      s.vx *= 6.5 / spDive;
      s.vz *= 6.5 / spDive;
    }
    if (aimed) s.yaw = turnToward(s.yaw, dx, dz, 4, dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    collideSkater(s);
    keepOnside(s);
    keepHomeDefenseInOz(s);
    if (s.dive <= 1) s.dive = 0.95;
    stepDiveStride(s, dt);
    return;
  }
  if (s.dive > 0) {
    // 2.5× the old 0.78 rate: get-up after the slide, not the dive itself.
    s.dive = Math.max(0, s.dive - 1.95 * dt);
    if (s.id === world.userId && s.kind !== "goalie" && mag > 0.12) {
      const inv = 1 / mag;
      s.yaw = turnToward(s.yaw, wx * inv, wz * inv, 4, dt);
    }
    s.vx *= Math.exp(-6.2 * dt);
    s.vz *= Math.exp(-6.2 * dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    collideSkater(s);
    keepOnside(s);
    keepHomeDefenseInOz(s);
    s.lean += (0.04 - s.lean) * Math.min(1, 10 * dt);
    s.bank += (0 - s.bank) * Math.min(1, 10 * dt);
    if (s.dive <= 0) {
      s.stun = Math.max(s.stun, 0.16);
      if (s.kind === "goalie") goalieDiveSave.delete(s.id);
    }
    stepDiveStride(s, dt);
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
    keepHomeDefenseInOz(s);
    return;
  }
  const stance = s.backskate;
  const skatingBurst = burst && !stance;
  const stats = skateStats(s, skatingBurst || s.deke > 0);
  const planting = s.id === world.userId && s.kind !== "goalie" && shotPlantKeep < 1;
  const skillPlant = planting && userWinding;
  let cap = stats.cap;
  if (stance) cap *= 0.62;
  if (planting) cap *= shotPlantKeep;
  const speed = Math.hypot(s.vx, s.vz);

  // End of period keeps the glide. The stick-release brake is for live play.
  if (!skillPlant && mag <= 0.1 && !periodEndLive()) {
    s.vx *= Math.exp(-10 * dt);
    s.vz *= Math.exp(-10 * dt);
  }

  const catchPace = incomingPuckPace(s, wx, wz, mag, skatingBurst);
  if (catchPace !== null) cap = Math.min(cap, Math.max(cap * 0.94, catchPace));
  if (!skillPlant && mag > 0.12) {
    const inv = 1 / mag;
    const dx = wx * inv;
    const dz = wz * inv;
    const user = s.id === world.userId;
    const turnMul = user ? 1.22 : 0.55;
    const turnSpd = 0.8 + Math.min(1, speed / 7);
    if (!stance && s.kind !== "goalie") s.yaw = turnToward(s.yaw, dx, dz, TURN * turnMul * turnSpd, dt);
    const a = stats.accel * (skatingBurst ? 1.35 : 1) * mag * (catchPace !== null ? 0.7 : 1);
    s.vx += dx * a * dt;
    s.vz += dz * a * dt;
    if (speed > 0.8) {
      const k = Math.min(1, (user ? 7.6 : 6.4) * dt);
      s.vx += (dx * speed - s.vx) * k;
      s.vz += (dz * speed - s.vz) * k;
    }
  }
  if (stance) lockBackskateYaw(s);

  const drag = ICE_DRAG + (skatingBurst ? -0.15 : 0) + (s.deke > 0 ? -0.4 : 0);
  const damp = Math.exp(-drag * dt);
  s.vx *= damp;
  s.vz *= damp;

  const sp = Math.hypot(s.vx, s.vz);
  if (sp > cap) {
    const m = cap / sp;
    s.vx *= m;
    s.vz *= m;
  }
  // Skill Stick plant ignores the left stick. Hold the glide at the reduced cap
  // instead of damping it to a stop.
  if (skillPlant && sp > 0.2) {
    const glide = Math.hypot(s.vx, s.vz);
    if (glide > 0.2) {
      const m = cap / glide;
      s.vx *= m;
      s.vz *= m;
    }
  }
  if (catchPace !== null) {
    const glide = Math.hypot(s.vx, s.vz);
    if (glide > catchPace) {
      const next = glide + (catchPace - glide) * Math.min(1, 1.35 * dt);
      const m = next / glide;
      s.vx *= m;
      s.vz *= m;
    }
  }

  resistAttackingBlue(s, dt, cap, skatingBurst, wx, mag);

  if (s.id === world.userId) {
    keepSkillHitFacing(s);
    keepSkillPokeFacing(s);
  }
  stepCheckClose(s, dt);
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  collideSkater(s);
  keepOnside(s);
  keepHomeDefenseInOz(s);

  const now = Math.hypot(s.vx, s.vz);
  stepStride(s, dt, now);
  s.lean += ((now / WINGER_SPEED) * 0.22 - s.lean) * Math.min(1, 8 * dt);
  const lat = !skillPlant && mag > 0.12 ? wx * world.camRx + wz * world.camRz : 0;
  s.bank += (-lat * 0.5 - s.bank) * Math.min(1, 10 * dt);
  if (s.deke > 0) {
    s.bank += (0 - s.bank) * Math.min(1, 12 * dt);
    s.lean += (0.08 - s.lean) * Math.min(1, 8 * dt);
  }
  s.burst = skatingBurst ? 1 : 0;
  if (s.deke > 0) s.deke = Math.max(0, s.deke - dt);
  if (s.follow > 0) {
    s.follow = Math.max(0, s.follow - dt);
    if (s.follow <= 0) s.windup = 0;
  }
  if (s.hit > 0) {
    noteShoulderCheck(s);
    s.hit = Math.max(0, s.hit - dt);
    if (s.hit <= 0) {
      endCheckSwing(s.id);
      shoulderCheckArmed.delete(s.id);
    }
  }
  if (s.windup > 0 && mag < 0.01 && s.follow <= 0) s.windup = Math.max(0, s.windup - dt * 1.6);
  noteBackhandWindup(s);
}

/**
 * Draw roots sit 0.79 m apart so the crouch can reach the dot.
 * A standing body does not fit there. After the puck is live, keep the
 * centers this far apart and step them onto opposite shoulders.
 */
const FACEOFF_BODY_GAP = 1.55;
const FACEOFF_SHOULDER = 0.42;
let faceoffClearUntil = -1;

function faceoffCenters(): [Skater, Skater] | null {
  if (world.homeDot < 0 || world.awayDot < 0 || world.homeDot === world.awayDot) return null;
  const home = world.skaters[world.homeDot];
  const away = world.skaters.find((s) => s.id === world.awayDot);
  if (!home || !away || home.kind === "goalie" || away.kind === "goalie") return null;
  return [home, away];
}

function shiftSkater(s: Skater, dx: number, dz: number): void {
  s.x += dx;
  s.z += dz;
  if (world.puck.owner === s.id) {
    world.puck.x += dx;
    world.puck.z += dz;
  }
}

/** Once, as the draw ends. Back off the dot line, then apart on the shoulders. */
function releaseFaceoffCenters(): void {
  if (useGame.getState().clockMode === "drill") return;
  faceoffClearUntil = world.time + 1.6;
  const pair = faceoffCenters();
  if (!pair) return;
  const [home, away] = pair;
  let dx = away.x - home.x;
  let dz = away.z - home.z;
  let dist = Math.hypot(dx, dz);
  if (dist < 1e-4) {
    dx = defendDir("away") || 1;
    dz = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const nz = dz / dist;
  const back = Math.max(0, FACEOFF_BODY_GAP - dist) * 0.5;
  let px = -nz;
  let pz = nx;
  const winner = world.puck.owner === home.id ? home : world.puck.owner === away.id ? away : null;
  if (winner) {
    const blade = stickBlade(winner);
    if ((blade.x - winner.x) * px + (blade.z - winner.z) * pz < 0) {
      px = -px;
      pz = -pz;
    }
  }
  const homeSx = winner === home ? px : -px;
  const homeSz = winner === home ? pz : -pz;
  shiftSkater(home, -nx * back + homeSx * FACEOFF_SHOULDER, -nz * back + homeSz * FACEOFF_SHOULDER);
  shiftSkater(away, nx * back - homeSx * FACEOFF_SHOULDER, nz * back - homeSz * FACEOFF_SHOULDER);
  const rv = (away.vx - home.vx) * nx + (away.vz - home.vz) * nz;
  if (rv < 0) {
    home.vx += nx * rv * 0.5;
    home.vz += nz * rv * 0.5;
    away.vx -= nx * rv * 0.5;
    away.vz -= nz * rv * 0.5;
  }
}

/** Hard gap while the two centers leave the dot. Closing speed is removed, not bounced.
 *  forReplay applies that same gap during the ceremony so the snap is not the dot lock.
 */
function holdFaceoffGap(forReplay = false): void {
  if (!forReplay && (world.faceoff || world.time > faceoffClearUntil)) return;
  const pair = faceoffCenters();
  if (!pair) return;
  const [home, away] = pair;
  let dx = away.x - home.x;
  let dz = away.z - home.z;
  let dist = Math.hypot(dx, dz);
  if (dist < 1e-4) {
    dx = defendDir("away") || 1;
    dz = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const nz = dz / dist;
  if (dist < FACEOFF_BODY_GAP) {
    const pen = FACEOFF_BODY_GAP - dist;
    shiftSkater(home, -nx * pen * 0.5, -nz * pen * 0.5);
    shiftSkater(away, nx * pen * 0.5, nz * pen * 0.5);
  } else if (dist > FACEOFF_BODY_GAP + 0.45) {
    return;
  }
  const rv = (away.vx - home.vx) * nx + (away.vz - home.vz) * nz;
  if (rv < 0) {
    home.vx += nx * rv * 0.5;
    home.vz += nz * rv * 0.5;
    away.vx -= nx * rv * 0.5;
    away.vz -= nz * rv * 0.5;
  }
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
          world.whistle === "goal" &&
          A.celebrate > 0.05 &&
          A.kind !== "goalie" &&
          A.side === B.side;
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
          const aFly =
            userCheckSkaters.has(A.id) && A.struck > 0.35 && A.vx * A.vx + A.vz * A.vz > 20.25;
          const bFly =
            userCheckSkaters.has(B.id) && B.struck > 0.35 && B.vx * B.vx + B.vz * B.vz > 20.25;
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
  holdFaceoffGap();
}

function refIceRadius(r: Referee): number {
  if (r.tumble !== 0 && r.struck > 0.1) {
    const u = Math.min(1, Math.max(0, 1 - r.struck / 1.68));
    const pitch = Math.min(1.12, u * 1.55);
    const roll = Math.abs(Math.sin(u * 4.6 * r.tumbleSpin)) * 0.48;
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
        const fly =
          userCheckSkaters.has(s.id) && s.struck > 0.35 && s.vx * s.vx + s.vz * s.vz > 20.25;
        r.vx += nx * rv * (fly ? 0.2 : 0.85);
        r.vz += nz * rv * (fly ? 0.2 : 0.85);
      }
    }
    collideRefIce(r);
  }
}

function assignHomeAttack(next: 1 | -1): void {
  if (world.homeAttack === next) return;
  world.homeAttack = next;
  world.periodView += 1;
}

export function attackDir(side: "home" | "away"): number {
  return side === "home" ? world.homeAttack : -world.homeAttack;
}

export function defendDir(side: "home" | "away"): number {
  return -attackDir(side);
}

export function faceYaw(side: "home" | "away"): number {
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
  // Catcher is body +X. Home yaw −π/2 (mesh π/2) puts that at world −Z.
  const lx = 0.5;
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
    const coverZone = goalieDefendZone(s.side, puck.x);
    const freezeHold =
      coverZone && holding && !moving && (s.side === "home" || crash <= 2.15);
    const nearLoose =
      coverZone &&
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
  const postPlay = postContact(goalieOwnEnd(s));
  const barPlay = postPlay ? null : barContact(goalieOwnEnd(s));
  if (postPlay && s.tumble === 0 && s.struck <= 0.18) {
    const onBlocker = (Math.sign(postPlay.zPost) || 1) === (attackDir(s.side) > 0 ? 1 : -1);
    lWant = onBlocker ? 0.62 : 0.24;
    rWant = onBlocker ? 0.24 : 0.62;
    leanWant = 0.3;
  } else if (barPlay && s.tumble === 0 && s.struck <= 0.18) {
    lWant = 0.55;
    rWant = 0.55;
    leanWant = 0.3;
  } else if (s.coverPose > 0.35) {
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

function clampPassMeet(tx: number, tz: number): { tx: number; tz: number } {
  return {
    tx: Math.max(-RINK_L / 2 + 1.1, Math.min(RINK_L / 2 - 1.1, tx)),
    tz: Math.max(-RINK_W / 2 + 1.1, Math.min(RINK_W / 2 - 1.1, tz)),
  };
}

/** How far a chase aim may sit from the end boards. About a body plus a margin. */
const END_CHASE_PAD = 0.9;

function clampLane(
  tx: number,
  tz: number,
  attack: number,
  openEnd: 1 | -1 | 0 = 0,
): { tx: number; tz: number } {
  let x = tx;
  if (openEnd !== 0) {
    // The puck's end, not the skater's attack end. A backcheck opens the net
    // they are wrapping, and still stops short of the far goal line.
    const endX = openEnd * (RINK_L / 2 - END_CHASE_PAD);
    x = openEnd > 0 ? Math.min(x, endX) : Math.max(x, endX);
    const farStop = -openEnd * (GOAL_LINE_X - 2.4);
    x = openEnd > 0 ? Math.max(x, farStop) : Math.min(x, farStop);
  } else {
    const mouth = attack * GOAL_LINE_X;
    if (attack > 0) x = Math.min(x, mouth - 2.6);
    else x = Math.max(x, mouth + 2.6);
    const ownMouth = -mouth;
    if (attack > 0) x = Math.max(x, ownMouth + 2.4);
    else x = Math.min(x, ownMouth - 2.4);
  }
  const zPad = openEnd !== 0 ? 1.05 : 1.6;
  const z = Math.max(-RINK_W / 2 + zPad, Math.min(RINK_W / 2 - zPad, tz));
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

/** Either spot lies on the other's lane to the net. The depth test is not symmetric. */
function lanesShare(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  attack: number,
): boolean {
  return (
    shotStacked(ax, az, { x: bx, z: bz }, attack) ||
    shotStacked(bx, bz, { x: ax, z: az }, attack)
  );
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

function supportWings(side: "home" | "away", holderId: number): Skater[] {
  return world.skaters
    .filter((p) => p.side === side && p.kind === "winger" && p.id !== holderId)
    .sort((a, b) => a.id - b.id);
}

/** Lateral and depth box. Inside both means the spots are on top of each other. */
const WING_Z_SEP = 5;
const WING_X_STAG = 3;
/** Carrier tape in thinkCarrier already refuses a pass at 18 m. */
const SUPPORT_PASS = 17.8;
const SUPPORT_GAP = 3.2;
/** Past the 0.28 stack angle, so one stride of arrival does not close the lane. */
const CARRIER_SIGHT = 0.4;

/** User is carrying. Teammate spots open up; a CPU carrier keeps the old gaps. */
function userCarrying(): boolean {
  const id = world.puck.owner;
  if (id === null || id !== world.userId) return false;
  const h = world.skaters[id];
  return !!h && h.side === "home" && h.kind !== "goalie";
}

function carrySep(): { z: number; x: number } {
  if (userCarrying()) return { z: 6.6, x: 4.2 };
  return { z: WING_Z_SEP, x: WING_X_STAG };
}

function supportTooClose(ax: number, az: number, bx: number, bz: number): boolean {
  const sep = carrySep();
  return Math.abs(az - bz) < sep.z && Math.abs(ax - bx) < sep.x;
}

/** Open space beside the carrier. x stays put so an onside join is not pulled off its line. */
function pushOffCarrierZ(
  tx: number,
  tz: number,
  px: number,
  pz: number,
  minD: number,
): { tx: number; tz: number } {
  const dx = tx - px;
  const need = minD * minD - dx * dx;
  if (need <= 0.04) return { tx, tz };
  const want = Math.sqrt(need);
  if (Math.abs(tz - pz) >= want - 0.05) return { tx, tz };
  const side = Math.abs(tz - pz) < 0.08 ? (tz >= pz ? 1 : -1) : Math.sign(tz - pz);
  return { tx, tz: pz + side * want };
}
const wingAim = new Map<number, { tx: number; tz: number }>();
let wingAimFrame = Number.NaN;
let passChaseFrame = Number.NaN;
let passChaseId = -1;
let nzSafetyFrame = Number.NaN;
let nzSafetyId = -1;

function wingAimsThisFrame(): Map<number, { tx: number; tz: number }> {
  if (wingAimFrame !== world.time) {
    wingAimFrame = world.time;
    wingAim.clear();
  }
  return wingAim;
}

function noteWingAim(id: number, tx: number, tz: number): void {
  wingAimsThisFrame().set(id, { tx, tz });
}

function wingBias(s: Skater): number {
  const wings = world.skaters
    .filter((p) => p.side === s.side && p.kind === "winger")
    .sort((a, b) => a.id - b.id);
  const i = Math.max(
    0,
    wings.findIndex((p) => p.id === s.id),
  );
  return i % 2 === 0 ? 1 : -1;
}

function wingLaneBox(attack: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const mouth = attack * GOAL_LINE_X;
  const ownMouth = -mouth;
  const minZ = -RINK_W / 2 + 1.6;
  const maxZ = RINK_W / 2 - 1.6;
  if (attack > 0) return { minX: ownMouth + 2.4, maxX: mouth - 2.6, minZ, maxZ };
  return { minX: mouth + 2.6, maxX: ownMouth - 2.4, minZ, maxZ };
}

function legalWingX(x: number, s: Skater): number {
  const attack = attackDir(s.side);
  const box = wingLaneBox(attack);
  let n = Math.max(box.minX, Math.min(box.maxX, x));
  if (mustHoldOnside(s)) {
    const cap = attack * (BLUE_X - 0.5);
    n = attack > 0 ? Math.min(n, cap) : Math.max(n, cap);
  }
  return n;
}

function occupyHomeWings(
  selfId: number,
  withCarrier: boolean,
): { x: number; z: number; carrier: boolean }[] {
  const self = world.skaters[selfId];
  if (!self) return [];
  const aims = wingAimsThisFrame();
  const holderId = world.puck.owner;
  const out: { x: number; z: number; carrier: boolean }[] = [];
  for (const o of world.skaters) {
    if (o.side !== self.side || o.kind !== "winger" || o.id === selfId) continue;
    if (holderId === o.id) {
      if (withCarrier) out.push({ x: o.x, z: o.z, carrier: true });
      continue;
    }
    if (o.id === world.userId) {
      out.push({ x: o.x, z: o.z, carrier: false });
      continue;
    }
    const aim = aims.get(o.id);
    if (aim) {
      out.push({ x: aim.tx, z: aim.tz, carrier: false });
      continue;
    }
    const h = ozHold.get(o.id);
    if (h) out.push({ x: h.tx, z: h.tz, carrier: false });
  }
  return out;
}

function homeWingBlocked(tx: number, tz: number, s: Skater): boolean {
  if (s.kind !== "winger") return false;
  const attack = attackDir(s.side);
  for (const p of occupyHomeWings(s.id, false)) {
    if (supportTooClose(tx, tz, p.x, p.z)) return true;
    if (lanesShare(tx, tz, p.x, p.z, attack)) return true;
  }
  return false;
}

function spreadHomeWing(s: Skater, tx: number, tz: number): { tx: number; tz: number } {
  if (s.kind !== "winger") return { tx, tz };
  const attack = attackDir(s.side);
  const box = wingLaneBox(attack);
  const bias = wingBias(s);
  let x = legalWingX(tx, s);
  let z = Math.max(box.minZ, Math.min(box.maxZ, tz));
  const occ = occupyHomeWings(s.id, true);
  const sep = carrySep();
  const clampZ = (nz: number) => Math.max(box.minZ, Math.min(box.maxZ, nz));
  for (let n = 0; n < 8; n++) {
    let moved = false;
    for (const p of occ) {
      if (supportTooClose(x, z, p.x, p.z)) {
        const dirZ = Math.abs(z - p.z) < 0.08 ? bias : Math.sign(z - p.z) || bias;
        const nz = clampZ(p.z + dirZ * sep.z);
        if (Math.abs(nz - p.z) >= sep.z - 0.05 && !supportTooClose(x, nz, p.x, p.z)) {
          z = nz;
          moved = true;
          continue;
        }
        const dirX = Math.abs(x - p.x) < 0.08 ? -attack : Math.sign(x - p.x) || -attack;
        let nx = legalWingX(p.x + dirX * sep.x, s);
        if (supportTooClose(nx, z, p.x, p.z) || (nx - x) * attack < -0.05) {
          const alt = legalWingX(p.x - dirX * sep.x, s);
          if (!supportTooClose(alt, z, p.x, p.z) && (alt - x) * attack >= -0.05) nx = alt;
        }
        if (
          (nx - x) * attack >= -0.05 &&
          !supportTooClose(nx, z, p.x, p.z) &&
          Math.abs(nx - x) > 0.04
        ) {
          x = nx;
          moved = true;
          continue;
        }
        const nudge = clampZ(z + dirZ * Math.max(1.4, sep.z - Math.abs(z - p.z)));
        if (Math.abs(nudge - p.z) > Math.abs(z - p.z) + 0.25) {
          z = nudge;
          moved = true;
        }
        continue;
      }
      const onCarrierLane = shotStacked(x, z, p, attack);
      const shared =
        onCarrierLane || (!p.carrier && shotStacked(p.x, p.z, { x, z }, attack));
      if (shared) {
        const dirZ = Math.abs(z - p.z) < 0.08 ? bias : Math.sign(z - p.z) || bias;
        let nz = clampZ(z + dirZ * 2.6);
        const still =
          shotStacked(x, nz, p, attack) ||
          (!p.carrier && shotStacked(p.x, p.z, { x, z: nz }, attack));
        if (still) nz = clampZ(z - dirZ * 2.6);
        if (Math.abs(nz - z) > 0.04) {
          z = nz;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  x = legalWingX(x, s);
  z = clampZ(z);
  noteWingAim(s.id, x, z);
  return { tx: x, tz: z };
}

function teammateNear(tx: number, tz: number, s: Skater, holderId: number): boolean {
  if (s.kind !== "winger") return false;
  const attack = attackDir(s.side);
  for (const o of world.skaters) {
    if (o.id === s.id || o.id === holderId || o.side !== s.side || o.kind !== "winger") continue;
    const aim = wingAimsThisFrame().get(o.id);
    const h = ozHold.get(o.id);
    const px = aim ? aim.tx : h ? h.tx : o.id === world.userId ? o.x : Number.NaN;
    const pz = aim ? aim.tz : h ? h.tz : o.id === world.userId ? o.z : Number.NaN;
    if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
    if (supportTooClose(tx, tz, px, pz)) return true;
    if (lanesShare(tx, tz, px, pz, attack)) return true;
  }
  return homeWingBlocked(tx, tz, s);
}

function puckInNeutralZone(): boolean {
  const x = world.puck.x;
  return x >= -BLUE_X + 0.35 && x <= BLUE_X - 0.4;
}

function cpuNzDefenderId(): number {
  if (nzSafetyFrame === world.time) return nzSafetyId;
  nzSafetyFrame = world.time;
  const own = defendDir("away");
  const defs: Skater[] = [];
  for (const p of world.skaters) {
    if (p.side !== "away" || p.kind !== "defense") continue;
    if (p.stun > 0.45 || p.struck > 0.5) continue;
    defs.push(p);
  }
  if (!defs.length) {
    nzSafetyId = -1;
    return -1;
  }
  const holder = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  let primary = -1;
  if (holder && holder.id === world.userId && holder.kind !== "goalie" && holder.side === "home") {
    primary = userPressIds(holder).primary;
  }
  const pool = defs.filter((d) => d.id !== primary);
  const choices = pool.length ? pool : defs;
  choices.sort((a, b) => b.x * own - a.x * own || a.id - b.id);
  nzSafetyId = choices[0]!.id;
  return nzSafetyId;
}

/** A defender between the carrier and the spot. Wider than laneBlocked, so a near miss still hides it. */
function behindDefender(
  pivot: { x: number; z: number },
  tx: number,
  tz: number,
  side: "home" | "away",
): boolean {
  const dx = tx - pivot.x;
  const dz = tz - pivot.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 4) return false;
  for (const o of world.skaters) {
    if (o.side === side || o.kind === "goalie") continue;
    const t = ((o.x - pivot.x) * dx + (o.z - pivot.z) * dz) / len2;
    if (t < 0.08 || t > 0.94) continue;
    const px = pivot.x + dx * t;
    const pz = pivot.z + dz * t;
    if (Math.hypot(o.x - px, o.z - pz) < 1.7) return true;
  }
  return false;
}

/** `sign` is the ice side. Bumper's coord stores the opposite sign; flip it back. */
function supportCoord(name: OzSpot, attack: number, sign: number): { tx: number; tz: number } {
  const base = spotCoord(name, attack, sign);
  if (name === "bumper") return { tx: base.tx, tz: -base.tz };
  return base;
}

function clampSupportBox(tx: number, tz: number, attack: number): { tx: number; tz: number } {
  const box = wingLaneBox(attack);
  return {
    tx: Math.max(box.minX, Math.min(box.maxX, tx)),
    tz: Math.max(box.minZ, Math.min(box.maxZ, tz)),
  };
}

function clampSupportPass(
  pivot: { x: number; z: number },
  tx: number,
  tz: number,
): { tx: number; tz: number } {
  const dx = tx - pivot.x;
  const dz = tz - pivot.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= SUPPORT_PASS || dist < 0.01) return { tx, tz };
  const k = SUPPORT_PASS / dist;
  return { tx: pivot.x + dx * k, tz: pivot.z + dz * k };
}

/**
 * The rush join already has this forward inside the blue.
 * A support spot may slide, but it may not step back across the line.
 */
function keepSupportInside(s: Skater, tx: number, tz: number): { tx: number; tz: number } {
  const attack = attackDir(s.side);
  const edge = BLUE_X + BLUE_LINE_W * 0.5;
  const along = s.x * attack;
  if (along <= edge + 0.35) return { tx, tz };
  if (tx * attack >= edge + 0.55) return { tx, tz };
  return clampSupportBox(s.x, tz, attack);
}

function supportLegal(
  s: Skater,
  pivot: { x: number; z: number },
  attack: number,
  tx: number,
  tz: number,
  holderId: number,
): boolean {
  const box = wingLaneBox(attack);
  if (tx < box.minX - 0.02 || tx > box.maxX + 0.02) return false;
  if (tz < box.minZ - 0.02 || tz > box.maxZ + 0.02) return false;
  if (ozDepth(tx, attack) < 2.7) return false;
  const dist = Math.hypot(tx - pivot.x, tz - pivot.z);
  const minD = holderId === world.userId && userCarrying() ? 6.3 : 3.55;
  if (dist < minD || dist >= 18) return false;
  if (inCarrierCorner(tx, tz, pivot, attack)) return false;
  if (laneBlocked(pivot.x, pivot.z, tx, tz, s.side)) return false;
  if (behindDefender(pivot, tx, tz, s.side)) return false;
  if (defenderGap(tx, tz, s.side) < SUPPORT_GAP) return false;
  if (shotStacked(tx, tz, pivot, attack)) return false;
  if (teammateNear(tx, tz, s, holderId)) return false;
  return true;
}

function supportHoldSpoiled(
  s: Skater,
  pivot: { x: number; z: number },
  attack: number,
  holderId: number,
  inZone: boolean,
): boolean {
  const prev = ozHold.get(s.id);
  if (!prev) return true;
  if (inZone && !mustHoldOnside(s) && prev.tx * attack < BLUE_X + 0.15) return true;
  return !supportLegal(s, pivot, attack, prev.tx, prev.tz, holderId);
}

/** In the zone: low weak, high strong, bumper opposite. Outside: the same sides, held at the blue. */
function rolePlan(
  role: number,
  weak: number,
  inZone: boolean,
): { name: OzSpot; sign: number; lats: number[] }[] {
  const strong = -weak || 1;
  const slot = role % 3;
  if (!inZone) {
    if (slot === 0) return [{ name: "high", sign: weak, lats: [0, 4.4, 6.4] }];
    if (slot === 1) return [{ name: "high", sign: strong, lats: [0, 4.4, 6.4] }];
    return [{ name: "circle", sign: weak, lats: [0, 3.2] }];
  }
  if (slot === 0) {
    return [
      { name: "slot", sign: weak, lats: [0, 4.4, 6.4] },
      { name: "net", sign: weak, lats: [0, 4.4, 6.4] },
    ];
  }
  if (slot === 1) {
    return [
      { name: "high", sign: strong, lats: [0, 4.4, 6.6] },
      { name: "circle", sign: strong, lats: [0, 3.2] },
    ];
  }
  return [
    { name: "bumper", sign: weak, lats: [7.2, 8.6, 5.8] },
    { name: "high", sign: weak, lats: [6.2, 8.2, 4.4] },
  ];
}

function carrierSight(
  tx: number,
  tz: number,
  pivot: { x: number; z: number },
  attack: number,
): boolean {
  const depth = Math.max(0.35, ozDepth(tx, attack));
  const cDepth = Math.max(0.45, ozDepth(pivot.x, attack));
  return Math.abs(Math.atan2(tz, depth) - Math.atan2(pivot.z, cDepth)) >= CARRIER_SIGHT;
}

function seekRoleSpot(
  s: Skater,
  pivot: { x: number; z: number },
  attack: number,
  name: OzSpot,
  sign: number,
  lats: number[],
  holderId: number,
  clear: boolean,
): { tx: number; tz: number } | null {
  const base = supportCoord(name, attack, sign);
  const baseDepth = ozDepth(base.tx, attack);
  for (const dep of [0, 3.05, -2.2]) {
    for (const lat of lats) {
      const depth = Math.max(2.85, Math.min(16.2, baseDepth + dep));
      let spot = clampSupportBox(xFromOzDepth(attack, depth), base.tz + sign * lat, attack);
      const pulled = clampSupportPass(pivot, spot.tx, spot.tz);
      spot = clampSupportBox(pulled.tx, pulled.tz, attack);
      spot = keepSupportInside(s, spot.tx, spot.tz);
      spot = clampSupportBox(spot.tx, spot.tz, attack);
      if (!supportLegal(s, pivot, attack, spot.tx, spot.tz, holderId)) continue;
      if (clear && !carrierSight(spot.tx, spot.tz, pivot, attack)) continue;
      return spot;
    }
  }
  return null;
}

/** Onside shelf. Stay on the skater's side of the carrier so the skate does not stall on him. */
function seekShelf(
  s: Skater,
  pivot: { x: number; z: number },
  attack: number,
  sign: number,
  holderId: number,
  clear: boolean,
): { tx: number; tz: number } | null {
  const cap = attack * (BLUE_X - 0.55);
  for (const lat of [6.2, 11, 8.4]) {
    let spot = clampSupportBox(cap, sign * lat, attack);
    const pulled = clampSupportPass(pivot, spot.tx, spot.tz);
    spot = clampSupportBox(pulled.tx, pulled.tz, attack);
    if (!supportLegal(s, pivot, attack, spot.tx, spot.tz, holderId)) continue;
    if (clear && !carrierSight(spot.tx, spot.tz, pivot, attack)) continue;
    return spot;
  }
  return null;
}

function supportSpot(
  s: Skater,
  pivot: { x: number; z: number },
  holderId: number,
): { tx: number; tz: number } {
  const attack = attackDir(s.side);
  const now = world.time;
  const prev = ozHold.get(s.id);
  const inZone = pivot.x * attack > BLUE_X - 0.4;
  const weak = Math.abs(pivot.z) > 1.15 ? -Math.sign(pivot.z) : 1;

  if (prev && !supportHoldSpoiled(s, pivot, attack, holderId, inZone)) {
    const kept = keepSupportInside(s, prev.tx, prev.tz);
    if (
      Math.hypot(kept.tx - prev.tx, kept.tz - prev.tz) < 0.05 ||
      supportLegal(s, pivot, attack, kept.tx, kept.tz, holderId)
    ) {
      prev.tx = kept.tx;
      prev.tz = kept.tz;
      noteWingAim(s.id, kept.tx, kept.tz);
      return { tx: kept.tx, tz: kept.tz };
    }
  }

  const wings = supportWings(s.side, holderId);
  const role = Math.max(
    0,
    wings.findIndex((p) => p.id === s.id),
  );
  const plan = rolePlan(role, weak, inZone);
  let pick: { tx: number; tz: number } | null = null;
  if (!inZone) {
    const ownSide = Math.sign(s.z - pivot.z) || weak;
    for (const sign of [ownSide, -ownSide || weak]) {
      for (const clear of [true, false]) {
        pick = seekShelf(s, pivot, attack, sign, holderId, clear);
        if (pick) break;
      }
      if (pick) break;
    }
  }
  if (!pick) {
    for (const side of [1, -1]) {
      for (const clear of [true, false]) {
        for (const item of plan) {
          const sign = side > 0 ? item.sign : -item.sign || weak;
          pick = seekRoleSpot(s, pivot, attack, item.name, sign, item.lats, holderId, clear);
          if (pick) break;
        }
        if (pick) break;
      }
      if (pick) break;
    }
  }
  if (!pick) {
    const spare = plan[0] ?? { name: "high" as OzSpot, sign: weak, lats: [0] };
    const base = supportCoord(spare.name, attack, spare.sign);
    const pulled = clampSupportPass(pivot, base.tx, base.tz);
    const boxed = clampSupportBox(pulled.tx, pulled.tz, attack);
    pick = keepSupportInside(s, boxed.tx, boxed.tz);
  }
  const spreadPick = spreadHomeWing(s, pick.tx, pick.tz);
  let use = supportLegal(s, pivot, attack, spreadPick.tx, spreadPick.tz, holderId) ? spreadPick : pick;
  if (holderId === world.userId && userCarrying()) {
    const pushed = pushOffCarrierZ(use.tx, use.tz, pivot.x, pivot.z, 6.3);
    use = clampSupportBox(pushed.tx, pushed.tz, attack);
  }
  noteWingAim(s.id, use.tx, use.tz);
  ozHold.set(s.id, {
    tx: use.tx,
    tz: use.tz,
    until: now + 30,
    picked: now,
    calm: false,
    settled: 0,
  });
  return { tx: use.tx, tz: use.tz };
}

function wrapChaseTarget(s: Skater, holder: Skater): { tx: number; tz: number } {
  const end = chaseEndAt(holder.x, holder.z) || ((Math.sign(holder.x) || 1) as 1 | -1);
  return pursueAroundNet(s, holder.x, holder.z, holder.vx, holder.vz, end);
}

function houseDefenderId(side: "home" | "away"): number {
  let d: Skater | null = null;
  for (const p of world.skaters) {
    if (p.side !== side || p.kind !== "defense") continue;
    if (!d || p.id < d.id) d = p;
  }
  return d ? d.id : -1;
}

function cpuCanChase(s: Skater): boolean {
  if (s.kind === "goalie" || s.id === world.userId) return false;
  if (s.smashKind > 0 || s.dive > 0.2) return false;
  if (s.stun > 0.45 || s.struck > 0.5 || s.tumble !== 0) return false;
  return true;
}

let endChaseFrame = Number.NaN;
let endChaseKey = "";
let endChaseHome = -1;
let endChaseAway = -1;

function nearestEndChaser(side: "home" | "away", x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  for (const p of world.skaters) {
    if (p.side !== side || !cpuCanChase(p)) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD - 0.001 || (Math.abs(d - bestD) <= 0.001 && (best < 0 || p.id < best))) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

/** Nearest eligible CPU on each team that should pursue this end. */
function endChaserIds(
  x: number,
  z: number,
  holderSide: "home" | "away" | null,
): { home: number; away: number } {
  const key = `${world.time}:${holderSide ?? "loose"}:${Math.round(x * 20)}:${Math.round(z * 20)}`;
  if (endChaseFrame === world.time && endChaseKey === key) {
    return { home: endChaseHome, away: endChaseAway };
  }
  endChaseFrame = world.time;
  endChaseKey = key;
  endChaseHome = holderSide === "home" ? -1 : nearestEndChaser("home", x, z);
  endChaseAway = holderSide === "away" ? -1 : nearestEndChaser("away", x, z);
  return { home: endChaseHome, away: endChaseAway };
}

/**
 * Loose puck: nearest CPU on each team. Carrier: nearest CPU on the other team.
 * A pass receiver also goes, so the puck is not left at the mouth.
 */
function endChaseJob(
  s: Skater,
  holder: Skater | null,
  passToMe: boolean,
): { end: 1 | -1; holder: Skater | null } | null {
  if (!cpuCanChase(s) || world.faceoff || world.stoppage || world.whistle) return null;
  const puck = world.puck;
  if (holder) {
    const end = chaseEndAt(holder.x, holder.z);
    if (end === 0 || holder.side === s.side) return null;
    const ids = endChaserIds(holder.x, holder.z, holder.side);
    const mine = s.side === "home" ? ids.home : ids.away;
    if (s.id !== mine) return null;
    return { end, holder };
  }
  if (puck.y > 1.25) return null;
  const end = chaseEndAt(puck.x, puck.z);
  if (end === 0) return null;
  const ids = endChaserIds(puck.x, puck.z, null);
  const mine = s.side === "home" ? ids.home : ids.away;
  if (s.id !== mine && !passToMe) return null;
  return { end, holder: null };
}

function repulsion(s: Skater): { x: number; z: number } {
  let x = 0;
  let z = 0;
  const carrier = world.puck.owner;
  const passTo = world.lastPassTo === s.id && world.time - world.lastPass < 2.2;
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

type CarrierWish = { wx: number; wz: number; mag: number; burst: boolean };

function opposingGoalie(side: "home" | "away"): boolean {
  return world.skaters.some((p) => p.kind === "goalie" && p.side !== side);
}

/** Same push the carrier uses at the bottom of thinkCarrier, including the offense slider. */
function carrierPush(
  s: Skater,
  attack: number,
  tx: number,
  tz: number,
  mag: number,
  burst: boolean,
): CarrierWish {
  const c = clampLane(tx, tz, attack);
  const dx = c.tx - s.x;
  const dz = c.tz - s.z;
  const dist = Math.hypot(dx, dz) || 1;
  const rep = repulsion(s);
  let m = dist < 1.2 ? Math.min(mag, 0.4) : mag;
  if (s.side === "away") m *= Math.min(1, 0.45 + cpuMul("off") * 0.55);
  return {
    wx: dx / dist + rep.x * 0.55,
    wz: dz / dist + rep.z * 0.55,
    mag: m,
    burst,
  };
}

/**
 * Teammate already in a one-timer spot: shooting range, off the carrier's skates, lane open.
 * rushCounts has already required two attackers and no defender.
 */
function oddManOneTimerMate(s: Skater, attack: number): Skater | null {
  const mouth = attack * GOAL_LINE_X;
  let best: Skater | null = null;
  let bestScore = 0;
  for (const m of teammatesOf(s)) {
    if (m.stun > 0.2 || m.struck > 0.3 || m.dive > 0 || m.tumble !== 0) continue;
    const depth = (mouth - m.x) * attack;
    if (depth < 2.4 || depth > 15.5) continue;
    if (Math.abs(m.z) > 8.8) continue;
    const md = Math.hypot(m.x - s.x, m.z - s.z);
    if (md < 3.4 || md > 17.6) continue;
    if (laneBlocked(s.x, s.z, m.x, m.z, s.side)) continue;
    const lateral = Math.abs(m.z - s.z);
    if (lateral < 1.5 && (m.x - s.x) * attack < 1.2) continue;
    const score =
      (Math.abs(m.z) < 5.2 ? 6 : 2) +
      Math.max(0, 6 - Math.abs(depth - 8)) +
      lateral * 0.15 -
      md * 0.04;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Rush teammate not yet in the slot, close enough that a one-timer pass can develop. */
function oddManComing(s: Skater, attack: number): Skater | null {
  const mouth = attack * GOAL_LINE_X;
  let best: Skater | null = null;
  let bestD = 18;
  for (const m of teammatesOf(s)) {
    if (m.stun > 0.45 || m.struck > 0.5 || m.dive > 0 || m.tumble !== 0) continue;
    const depth = (mouth - m.x) * attack;
    if (depth < 4 || depth > 22) continue;
    const md = Math.hypot(m.x - s.x, m.z - s.z);
    if (md < 3.4 || md > 17.6 || md >= bestD) continue;
    if ((m.x - world.puck.x) * attack < -9) continue;
    const lateral = Math.abs(m.z - s.z);
    const ahead = (m.x - s.x) * attack;
    if (lateral < 1.6 && ahead < 2) continue;
    bestD = md;
    best = m;
  }
  return best;
}

/**
 * Alone on the goalie. Skate in on an angle, play the existing deke (stick sweep
 * plus the goalie pull), then finish. Do not fire from the high slot.
 */
function steerBreakawayDeke(s: Skater, attack: number, mouth: number, distMouth: number): CarrierWish {
  let rec = cpuDekeAt.get(s.id);
  const fresh = !rec || world.time - rec.t > 2.6;
  if (fresh && s.deke <= 0.02 && distMouth < 13.5 && distMouth > 2) {
    const cut = s.z >= 0 ? -1 : 1;
    s.deke = 1.05;
    applyDeke(s);
    rec = { t: world.time, cut };
    cpuDekeAt.set(s.id, rec);
  }
  const cut = rec?.cut ?? (s.z >= 0 ? -1 : 1);
  const since = rec ? world.time - rec.t : 99;
  const sold = s.deke <= 0.55;
  if (
    rec &&
    sold &&
    distMouth > 1.25 &&
    world.time - world.lastShoot > 0.4 &&
    (distMouth < 7.6 || (s.deke <= 0.02 && since > 0.35 && distMouth < 8))
  ) {
    shootAtNet(s);
    return { wx: 0, wz: 0, mag: 0.15, burst: false };
  }
  const drive = distMouth < 5.5 ? 0.4 : 6.2;
  const tx = mouth - attack * Math.max(2.4, distMouth - drive);
  const tz = Math.max(-3.2, Math.min(3.2, s.z * 0.2 + cut * (distMouth < 6 ? 2.15 : 1.55)));
  return carrierPush(s, attack, tx, tz, 0.98, true);
}

/**
 * Away CPU only. 2-on-0 passes for a one-timer when a mate can shoot it.
 * A solo breakaway dekes. Anything else, including a defender in the rush, returns null
 * so the existing shot, pass, and skate stay as they are.
 */
function thinkCpuRush(s: Skater, attack: number, mouth: number, distMouth: number): CarrierWish | null {
  if (!opposingGoalie(s.side)) {
    cpuOtLook.delete(s.id);
    return null;
  }
  const rush = rushCounts(s.side);
  const attacking = distMouth > -0.5 && distMouth < 21;
  if (attacking && rush.defenders === 0 && rush.attackers >= 2) {
    cpuDekeAt.delete(s.id);
    const mate = oddManOneTimerMate(s, attack);
    if (mate && world.time - world.lastPass > 0.32) {
      cpuOtLook.delete(s.id);
      aiPass(s, mate);
      return { wx: 0, wz: 0, mag: 0.2, burst: false };
    }
    const coming = oddManComing(s, attack);
    if (coming && distMouth > 5.5) {
      if (!cpuOtLook.has(s.id)) cpuOtLook.set(s.id, world.time);
      const waited = world.time - (cpuOtLook.get(s.id) ?? world.time);
      if (waited < 0.75) {
        const away = Math.sign(s.z - coming.z) || (s.id % 2 === 0 ? 1 : -1);
        const tx = mouth - attack * Math.max(4.2, distMouth - 5);
        const tz = Math.max(-8, Math.min(8, s.z + away * 1.4));
        return carrierPush(s, attack, tx, tz, 0.92, true);
      }
    }
    cpuOtLook.delete(s.id);
    return null;
  }
  cpuOtLook.delete(s.id);
  if (
    rush.defenders === 0 &&
    rush.attackers <= 1 &&
    distMouth > 1.35 &&
    distMouth < 20 &&
    Math.abs(s.z) <= 11 &&
    defendersInLane(s) === 0
  ) {
    return steerBreakawayDeke(s, attack, mouth, distMouth);
  }
  return null;
}

/** Higher is a straighter look at the net. Sharp corners and traffic score lower. */
function cpuLook(s: Skater, attack: number): number {
  const from = passOrigin(s);
  const sharp = cpuReleaseSharp(from.x, from.z, attack);
  const depth = (attack * GOAL_LINE_X - from.x) * attack;
  const slot = depth > 3.2 && depth < 13 && Math.abs(from.z) < 4.2 ? 0.28 : 0;
  const traffic = nearestFoe(s).d < 2.2 ? 0.22 : defendersInLane(s) > 0 ? 0.12 : 0;
  return 1 - sharp + slot - traffic;
}

/** Teammate with a clearly better angle. A slot look is not given up for a small edge. */
function cpuBetterLookMate(s: Skater, attack: number): Skater | null {
  const from = passOrigin(s);
  const sharp = cpuReleaseSharp(from.x, from.z, attack);
  const margin = sharp < 0.28 ? 0.38 : 0.16;
  let best: Skater | null = null;
  let bestScore = cpuLook(s, attack) + margin;
  const mouth = attack * GOAL_LINE_X;
  for (const m of teammatesOf(s)) {
    if (m.stun > 0.3 || m.struck > 0.35 || m.dive > 0 || m.tumble !== 0) continue;
    const depth = (mouth - m.x) * attack;
    if (depth < 2.2 || depth > 18 || Math.abs(m.z) > 10) continue;
    const md = Math.hypot(m.x - s.x, m.z - s.z);
    if (md < 3.2 || md > 18) continue;
    if (laneBlocked(s.x, s.z, m.x, m.z, s.side)) continue;
    const score = cpuLook(m, attack);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Up-ice teammate who can take a short tape. A covered or long target is not one. */
function cpuHasShortOutlet(s: Skater): boolean {
  const mate = clearPassTarget(s, attackDir(s.side), 0, false);
  if (!mate) return false;
  const d = Math.hypot(mate.x - s.x, mate.z - s.z);
  if (d > 12) return false;
  if (laneBlocked(s.x, s.z, mate.x, mate.z, s.side)) return false;
  return nearestFoe(mate).d >= 2.8;
}

/** One roll per 1.35s so a held puck is not cleared on the next frame. */
function cpuClearNow(s: Skater, p: number): boolean {
  const at = cpuClearRoll.get(s.id);
  if (at !== undefined && world.time >= at && world.time - at < 1.35) return false;
  cpuClearRoll.set(s.id, world.time);
  return Math.random() < p;
}

/**
 * Own-zone clear. Heavy pressure with no short outlet is the usual case.
 * A free breakout is left on the skates.
 */
function cpuWantHighClear(s: Skater, pressure: number): boolean {
  if (s.kind === "goalie" || s.id === world.userId) return false;
  if (sauceZone(s) !== "own") return false;
  if (world.time - world.lastPass < 0.4) return false;
  const heavy = pressure < 2.8;
  const outlet = cpuHasShortOutlet(s);
  if (!heavy && outlet) return false;
  if (!heavy && pressure > 6) return false;
  let p = 0.22;
  if (heavy && !outlet) p = 0.62;
  else if (heavy) p = 0.28;
  return cpuClearNow(s, p);
}

/** Up ice, steered away from the nearest checker. */
function cpuSkaterHighClear(s: Skater): void {
  const attack = attackDir(s.side);
  const foe = nearestFoe(s).foe;
  let az = 0;
  if (foe) az = foe.z >= s.z ? -0.55 : 0.55;
  const m = Math.hypot(attack, az) || 1;
  s.yaw = Math.atan2(-attack / m, -az / m);
  withChargedPass(
    PASS_FULL_HOLD,
    true,
    SAUCE_CLEAR_HOLD,
    () => {
      launchHighClear(s, 0, 0);
    },
    false,
    true,
  );
}

function shootoutCpuShooter(s: Skater): boolean {
  const so = world.shootout;
  if (!so || so.phase !== "live" || s.kind === "goalie") return false;
  const attempt = so.attempts[so.attempts.length - 1];
  return !!attempt && attempt.side === "away" && s.id === so.shooterId;
}

type ShootoutArc = {
  n: number;
  boards: 1 | -1;
  wide: number;
  turnAt: number;
  release: number;
  slotZ: number;
  deke: boolean;
  deked: boolean;
  /** Brief coast near the hash marks. -1 until it starts. */
  coastUntil: number;
};

let shootoutArc: ShootoutArc | null = null;

/** One wide ride per attempt. The shot is saved for the hashes, not the blue line. */
function shootoutArcFor(): ShootoutArc {
  const n = world.shootout?.attempts.length ?? 0;
  if (shootoutArc && shootoutArc.n === n) return shootoutArc;
  const boards: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  const arc: ShootoutArc = {
    n,
    boards,
    wide: 8.4 + Math.random() * 2.6,
    turnAt: 15.2 + Math.random() * 6.2,
    release: 6.3 + Math.random() * 2.5,
    slotZ: 0,
    deke: Math.random() < 0.84,
    deked: false,
    coastUntil: Math.random() < 0.55 ? 0 : -1,
  };
  arc.slotZ = boards * (0.35 + Math.random() * 1.45);
  shootoutArc = arc;
  return arc;
}

function shootoutArcWish(
  s: Skater,
  attack: number,
  tx: number,
  tz: number,
  mag: number,
  burst: boolean,
): CarrierWish {
  const c = clampLane(tx, tz, attack);
  const dx = c.tx - s.x;
  const dz = c.tz - s.z;
  const dist = Math.hypot(dx, dz) || 1;
  let wx = dx / dist;
  let wz = dz / dist;
  if (wx * attack < 0.22) {
    wx = attack * 0.42;
    const nrm = Math.hypot(wx, wz) || 1;
    wx /= nrm;
    wz /= nrm;
  }
  return { wx, wz, mag, burst };
}

/** Carry the puck in. Passes are not a shootout move. The arc, the deke, and the shot stay. */
function thinkShootoutCarry(s: Skater): CarrierWish {
  const attack = attackDir(s.side);
  if (world.puck.owner !== s.id) {
    const dx = world.puck.x - s.x;
    const dz = world.puck.z - s.z;
    const dist = Math.hypot(dx, dz) || 1;
    const wx = dx * attack < 0 ? attack : dx / dist;
    const wz = dx * attack < 0 ? Math.max(-0.35, Math.min(0.35, dz / dist)) : dz / dist;
    return { wx, wz, mag: 1, burst: false };
  }
  const arc = shootoutArcFor();
  const mouth = attack * GOAL_LINE_X;
  const distMouth = (mouth - s.x) * attack;
  const curling = distMouth <= arc.turnAt;
  const nearNet = distMouth < arc.release + 2.8 && distMouth > 4.4;
  if (arc.coastUntil === 0 && nearNet) arc.coastUntil = world.time + 0.14 + Math.random() * 0.16;
  const coasting = arc.coastUntil > world.time;
  const mag = coasting ? 0 : 1;
  const burst = !coasting;
  const inSlot = distMouth <= arc.release + 0.45 && distMouth > 4.3 && Math.abs(s.z) < 4.3;
  if (arc.deke && !arc.deked && distMouth < arc.release + 2.6 && distMouth > 4.6) {
    s.deke = 1.05;
    applyDeke(s);
    arc.deked = true;
  }
  const sold = !arc.deke || (arc.deked && s.deke <= 0.6) || distMouth < 5.1;
  if (!coasting && inSlot && sold && world.time - world.lastShoot > 0.45) {
    shootAtNet(s);
    return { wx: attack > 0 ? 1 : -1, wz: 0, mag: 0.2, burst: false };
  }
  let tx: number;
  let tz: number;
  if (!curling) {
    tx = mouth - attack * (arc.turnAt - 1.4);
    tz = arc.boards * arc.wide;
  } else {
    const span = Math.max(0.8, arc.turnAt - arc.release);
    const u = Math.max(0, Math.min(1, (arc.turnAt - distMouth) / span));
    const ease = u * u * (3 - 2 * u);
    tz = arc.boards * arc.wide * (1 - ease) + arc.slotZ * ease;
    const ahead = distMouth > arc.release + 1.4 ? 3.6 : 1.8;
    tx = mouth - attack * Math.max(arc.release - 0.15, distMouth - ahead);
  }
  return shootoutArcWish(s, attack, tx, tz, mag, burst);
}

function thinkCarrier(s: Skater): CarrierWish {
  if (shootoutCpuShooter(s)) return thinkShootoutCarry(s);
  const attack = attackDir(s.side);
  const mouth = attack * GOAL_LINE_X;
  const distMouth = (mouth - s.x) * attack;
  const pressure = nearestFoe(s).d;
  const lane = slotAmong(s, s.kind === "defense" ? "defense" : "winger", 4.6);

  if (s.side === "away" && s.id !== world.userId) {
    const rushWish = thinkCpuRush(s, attack, mouth, distMouth);
    if (rushWish) return rushWish;
  }

  if (cpuWantHighClear(s, pressure)) {
    cpuSkaterHighClear(s);
    return { wx: 0, wz: 0, mag: 0.15, burst: false };
  }

  if (
    world.time - world.lastShoot > 0.55 &&
    distMouth < 11.5 &&
    distMouth > 1.15 &&
    Math.abs(s.z) < 6.2
  ) {
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
      if (s.side === "away" && s.id !== world.userId) {
        const mate = cpuBetterLookMate(s, attack);
        if (mate) {
          aiPass(s, mate);
          return { wx: 0, wz: 0, mag: 0.2, burst: false };
        }
      }
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
      const f2 = foes.find(
        (p) => p.id !== primary.id && p.kind !== "defense" && dist(p) < PRESS_JOIN,
      );
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
  if (!holder || holder.id !== world.userId || holder.kind === "goalie" || holder.side === s.side)
    return false;
  if (inPressPeel(s.id)) return false;
  const ids = userPressIds(holder);
  return s.id === ids.primary || s.id === ids.second;
}

/** Pass still on its way to id. A later shot, save, or hit ends it. */
function livePassTo(id: number): boolean {
  if (world.puck.owner !== null) return false;
  if (world.lastPassTo !== id) return false;
  if (world.time - world.lastPass > 2.2) return false;
  if (world.lastShoot >= world.lastPass) return false;
  if (world.goalieSaveT >= world.lastPass) return false;
  if (world.lastHitTime >= world.lastPass) return false;
  return true;
}

function passMeantForUser(): boolean {
  return livePassTo(world.userId);
}

/** Same-side pass addressed to a different skater. */
function livePassForOther(s: Skater): boolean {
  const to = world.lastPassTo;
  if (to === null || to === s.id || !livePassTo(to)) return false;
  const passer = world.lastPasser !== null ? world.skaters[world.lastPasser] : undefined;
  return !!passer && passer.side === s.side;
}

/** Home pass still on its way. A later shot, save, or hit ends it. */
function homePassInFlight(): boolean {
  if (world.puck.owner !== null || world.faceoff || world.stoppage) return false;
  if (world.lastPasser === null) return false;
  const passer = world.skaters[world.lastPasser];
  if (!passer || passer.side !== "home") return false;
  if (world.time - world.lastPass > 2.2) return false;
  if (world.lastShoot >= world.lastPass) return false;
  if (world.goalieSaveT >= world.lastPass) return false;
  if (world.lastHitTime >= world.lastPass) return false;
  return true;
}

function passFlightLine(x: number, z: number): { along: number; perp: number; spd: number } {
  const puck = world.puck;
  const spd = Math.hypot(puck.vx, puck.vz);
  const dx = x - puck.x;
  const dz = z - puck.z;
  if (spd < 0.8) return { along: 0, perp: Math.hypot(dx, dz), spd };
  const ux = puck.vx / spd;
  const uz = puck.vz / spd;
  const along = dx * ux + dz * uz;
  const perp = Math.hypot(dx - ux * along, dz - uz * along);
  return { along, perp, spd };
}

/**
 * The aimed receiver is still on this pass.
 * A target off the flight, with no meet point on it, is not taking it.
 * The user keeps a pass that was aimed at him.
 */
function aimedTargetTakingPass(): boolean {
  const id = world.lastPassTo;
  if (id === null || !livePassTo(id)) return false;
  const t = world.skaters[id];
  if (!t || t.side !== "home" || t.kind === "goalie") return false;
  if (t.id === world.userId) return true;
  if (t.stun > 0.45 || t.struck > 0.5 || t.tumble !== 0) return false;
  const body = passFlightLine(t.x, t.z);
  if (body.perp < 2.8 && body.along > -1.2) return true;
  if (body.spd < 1.6 && Math.hypot(t.x - world.puck.x, t.z - world.puck.z) < 7) return true;
  if (passMeet) {
    const meet = passFlightLine(passMeet.x, passMeet.z);
    if (meet.perp < 2.2 && meet.along > -0.5) return true;
  }
  return false;
}

/** Nearest home skater when a home pass has no one taking it. Ignores PASS_CONE. */
function nearestHomePassChaser(): number {
  if (passChaseFrame === world.time) return passChaseId;
  passChaseFrame = world.time;
  passChaseId = -1;
  if (!homePassInFlight() || aimedTargetTakingPass()) return -1;
  const puck = world.puck;
  let best = -1;
  let bestD = Infinity;
  for (const s of world.skaters) {
    if (s.side !== "home" || s.kind === "goalie" || s.id === world.userId) continue;
    if (s.stun > 0.45 || s.struck > 0.5 || s.tumble !== 0) continue;
    const d = Math.hypot(s.x - puck.x, s.z - puck.z);
    if (d < bestD - 0.001 || (Math.abs(d - bestD) <= 0.001 && (best < 0 || s.id < best))) {
      bestD = d;
      best = s.id;
    }
  }
  passChaseId = best;
  return best;
}

/** Point on the pass he can skate onto. Coast uses the puck's ice drag. */
/**
 * User pass in the offensive zone running along a side board.
 * 0 when this is not that pass. Otherwise the board's z sign.
 */
function userOzBoardPass(): 1 | -1 | 0 {
  if (world.puck.owner !== null || world.faceoff || world.stoppage) return 0;
  if (world.lastPasser !== world.userId) return 0;
  if (world.time - world.lastPass > 2.2 || world.lastShoot >= world.lastPass) return 0;
  const attack = attackDir("home");
  const released = world.lastPassX * attack;
  const now = world.puck.x * attack;
  if (released < BLUE_X - 1.2 && now < BLUE_X - 1.2) return 0;
  const spd = Math.hypot(world.puck.vx, world.puck.vz);
  if (spd < 3.5) return 0;
  if (Math.abs(world.puck.vx) < Math.abs(world.puck.vz) * 1.15) return 0;
  const zLine = Math.abs(world.puck.z) >= Math.abs(world.lastPassZ) ? world.puck.z : world.lastPassZ;
  if (Math.abs(zLine) < RINK_W / 2 - 7.5) return 0;
  return zLine >= 0 ? 1 : -1;
}

function ontoPassPuck(s: Skater): { x: number; z: number } {
  const puck = world.puck;
  const spd = Math.hypot(puck.vx, puck.vz);
  if (spd < 1.2) return { x: puck.x, z: puck.z };
  const drag = PASS_DRAG;
  const ux = puck.vx / spd;
  const uz = puck.vz / spd;
  const skate = 9;
  let bestX = puck.x;
  let bestZ = puck.z;
  let bestLate = Infinity;
  for (let i = 0; i <= 18; i++) {
    const t = i * 0.1;
    const coast = (spd / drag) * (1 - Math.exp(-drag * t));
    const x = puck.x + ux * coast;
    const z = puck.z + uz * coast;
    const late = Math.hypot(x - s.x, z - s.z) / skate - t;
    if (late < bestLate) {
      bestLate = late;
      bestX = x;
      bestZ = z;
    }
    if (late <= 0.02) break;
  }
  return { x: bestX, z: bestZ };
}

/** Rebound, or a loose puck that is not still a shot in flight. */
function looseOrRebound(): boolean {
  const puck = world.puck;
  if (puck.owner !== null || world.faceoff || world.stoppage) return false;
  const sinceSave = world.time - world.goalieSaveT;
  if (sinceSave < 2.6 && world.goalieSaveT >= world.lastShoot) return true;
  const spd = Math.hypot(puck.vx, puck.vz);
  const shotFlight =
    world.time - world.lastShoot < 1.2 && world.lastShoot >= world.lastPass && spd > 7.5;
  return !shotFlight;
}

/** User puck still in his own zone or on the defensive side of center. */
function userPuckDefensiveHalf(): boolean {
  const puck = world.puck;
  if (puck.owner === null || puck.owner !== world.userId) return false;
  const holder = world.skaters[puck.owner];
  if (!holder || holder.side !== "home") return false;
  return puck.x * attackDir("home") < 0;
}

function forwardSlots(side: "home" | "away"): Skater[] {
  return world.skaters
    .filter((p) => p.side === side && p.kind === "winger")
    .sort((a, b) => a.id - b.id);
}

function homeForwardSlots(): Skater[] {
  return forwardSlots("home");
}

/** Roster slot: the only forward, the middle of three, or the first of two. */
function breakoutCenterSlot(n: number): number {
  if (n <= 2) return 0;
  return Math.floor((n - 1) / 2);
}

const RUSH_JOIN_BEHIND = 6;
const RUSH_JOIN_PAST = 6;

/**
 * Puck entered an attacking zone. Drop that side's held support spots so a
 * neutral-zone or breakout aim cannot stick after the line.
 */
function dropOzHoldOnEntry(): void {
  if (ozEntryFrame === world.time) return;
  ozEntryFrame = world.time;
  const now = puckOzSide(world.puck);
  if (now !== 0 && now !== ozEntrySide) {
    const side: "home" | "away" = now === attackSign("home") ? "home" : "away";
    for (const p of world.skaters) {
      if (p.side === side) ozHold.delete(p.id);
    }
  }
  ozEntrySide = now;
}

/**
 * Carrier, or a live team pass, is in the neutral zone heading for the
 * attacking blue, or has just crossed it.
 */
function rushJoinOn(pivot: { x: number; vx: number }, attack: number): boolean {
  if (world.faceoff || world.stoppage || world.whistle) return false;
  const along = pivot.x * attack;
  const vel = pivot.vx * attack;
  const edge = BLUE_X + BLUE_LINE_W * 0.5;
  const inNz = along >= -BLUE_X + 0.15 && along <= edge;
  const justCrossed = along > edge && along < edge + RUSH_JOIN_PAST;
  if (inNz && vel > 0.45) return true;
  return justCrossed;
}

/** Onside lane just inside the attacking blue. Spread so the join does not stack. */
function rushJoinSpot(s: Skater, carrierId: number): { tx: number; tz: number } {
  const attack = attackDir(s.side);
  const edge = BLUE_X + BLUE_LINE_W * 0.5;
  const mates = world.skaters
    .filter(
      (p) =>
        p.side === s.side &&
        p.kind === s.kind &&
        p.kind !== "goalie" &&
        p.id !== carrierId &&
        p.id !== world.userId,
    )
    .sort((a, b) => a.id - b.id);
  const n = Math.max(1, mates.length);
  const i = Math.max(
    0,
    mates.findIndex((p) => p.id === s.id),
  );
  if (s.kind === "defense") {
    const wide = defenseHalfSign(s);
    const lane = Math.floor(i / 2);
    return {
      tx: attack * (edge + 1.05 + (i % 2) * 0.4),
      tz: wide * Math.min(9.4, 8.2 + lane * 1.2),
    };
  }
  const userCarry = s.side === "home" && carrierId === world.userId;
  if (userCarry) {
    const inset = 1.15 + i * 1.65;
    const lanes = n <= 1 ? [0] : n === 2 ? [-6.6, 6.6] : [-7.8, 0.4, 7.8];
    let tz = lanes[Math.min(i, lanes.length - 1)] ?? (i % 2 === 0 ? -6.6 : 6.6);
    const carrier = world.skaters[carrierId];
    if (carrier && Math.abs(tz - carrier.z) < 4.2) tz += tz >= carrier.z ? 4.4 : -4.4;
    return { tx: attack * (edge + inset), tz: Math.max(-9.2, Math.min(9.2, tz)) };
  }
  const inset = 1.85 + (i % 2) * 0.75;
  const tx = attack * (edge + inset);
  const span = n <= 1 ? 0 : Math.min(4.4, (FACEOFF_SPOT_Z * (n - 1)) / n);
  const tz = n <= 1 ? 0 : ((i / (n - 1)) * 2 - 1) * span;
  return { tx, tz: Math.max(-7.2, Math.min(7.2, tz)) };
}

function homeBreakoutSpot(s: Skater): { tx: number; tz: number } {
  const attack = attackDir("home");
  const forwards = homeForwardSlots();
  const n = forwards.length;
  const ci = breakoutCenterSlot(n);
  const i = forwards.findIndex((p) => p.id === s.id);
  // Between the defending blue and center, and between the faceoff dots.
  if (i < 0 || i === ci) return { tx: -attack * BLUE_X * 0.5, tz: 0 };
  const sign = i < ci ? -1 : 1;
  const group: number[] = [];
  for (let k = 0; k < n; k++) {
    if (k === ci) continue;
    if (k < ci === i < ci) group.push(k);
  }
  const gi = Math.max(0, group.indexOf(i));
  const count = Math.max(1, group.length);
  const xT = count <= 1 ? 0.5 : 0.28 + (0.5 * gi) / (count - 1);
  const inner = FACEOFF_SPOT_Z + 0.65;
  const outer = RINK_W / 2 - 1.85;
  const zT = count <= 1 ? 0.5 : 0.18 + (0.64 * gi) / (count - 1);
  // Between center and the opposing blue, and between the dots and the boards.
  return { tx: attack * BLUE_X * xT, tz: sign * (inner + (outer - inner) * zT) };
}

/**
 * Meters from the attacking goal line toward center.
 * attack +1, depth 11 → x = GOAL_LINE_X - 11. attack -1 → x = 11 - GOAL_LINE_X.
 */
function xFromOzDepth(attack: number, depth: number): number {
  return attack * (GOAL_LINE_X - depth);
}

function cpuDefenders(side: "home" | "away"): Skater[] {
  return world.skaters
    .filter((p) => p.side === side && p.kind === "defense" && p.id !== world.userId)
    .sort((a, b) => a.id - b.id);
}

function defenseRole(s: Skater): number {
  const i = cpuDefenders(s.side).findIndex((p) => p.id === s.id);
  return i < 0 ? 0 : i;
}

function strongSideSign(z: number): number {
  return Math.abs(z) > 1.15 ? Math.sign(z) : 1;
}

function boardsZ(): number {
  return RINK_W / 2 - 1.85;
}

function clampBoardsZ(z: number): number {
  const boards = boardsZ();
  return Math.max(-boards, Math.min(boards, z));
}

/** Inner edge of the attacking blue, then a step farther into the zone. */
function blueInsideX(attack: number, step: number): number {
  return attack * (BLUE_X + BLUE_LINE_W * 0.5 + step);
}

/**
 * Deep cycle: strong-side half-wall (high circle if the wall is taken) and a
 * weak-side point. Both stay above the faceoff dots. Net and hash are forward spots.
 */
function deepPointPair(
  attack: number,
  pivot: { x: number; z: number },
  side: "home" | "away",
): [{ tx: number; tz: number }, { tx: number; tz: number }] {
  const strong = strongSideSign(pivot.z);
  const dot = GOAL_LINE_X - FACEOFF_EZ_X;
  const depths = [11.2, 10.2, 12, 9.2];
  const wallZ = [10.6, 11.15, 9.4, 8.2];
  // Wide point first. The inner ones open a lane when a low defender blocks the cross-ice pass.
  const pointZ = [8.8, 10.1, 7.5, 6.6, 5.6, 5];
  const strongSpots: { tx: number; tz: number }[] = [];
  const weakSpots: { tx: number; tz: number }[] = [];
  for (const depth of depths) {
    if (depth <= dot) continue;
    for (const z of wallZ) {
      strongSpots.push({ tx: xFromOzDepth(attack, depth), tz: clampBoardsZ(strong * z) });
    }
    for (const z of pointZ) {
      weakSpots.push({ tx: xFromOzDepth(attack, depth), tz: clampBoardsZ(-strong * z) });
    }
  }
  const circle = Math.min(12, Math.max(9, goalieCircleTop()));
  strongSpots.push({
    tx: xFromOzDepth(attack, circle),
    tz: clampBoardsZ(strong * FACEOFF_SPOT_Z),
  });

  const clearOfCarrier = (spot: { tx: number; tz: number }) =>
    Math.hypot(spot.tx - pivot.x, spot.tz - pivot.z) >= 4;
  const splitOk = (a: { tx: number; tz: number }, b: { tx: number; tz: number }) =>
    Math.abs(a.tz - b.tz) >= 8 && Math.hypot(a.tx - b.tx, a.tz - b.tz) >= 4;
  const laneOpen = (spot: { tx: number; tz: number }) =>
    !laneBlocked(pivot.x, pivot.z, spot.tx, spot.tz, side);
  const gapOk = (spot: { tx: number; tz: number }) => defenderGap(spot.tx, spot.tz, side) >= 3;

  for (const a of strongSpots) {
    if (!clearOfCarrier(a)) continue;
    for (const b of weakSpots) {
      if (!clearOfCarrier(b) || !splitOk(a, b)) continue;
      if (laneOpen(a) && laneOpen(b) && gapOk(a) && gapOk(b)) return [a, b];
    }
  }

  let best: { a: { tx: number; tz: number }; b: { tx: number; tz: number }; score: number } | null =
    null;
  for (const a of strongSpots) {
    if (!clearOfCarrier(a)) continue;
    for (const b of weakSpots) {
      if (!clearOfCarrier(b) || !splitOk(a, b)) continue;
      const open = (laneOpen(a) ? 1 : 0) + (laneOpen(b) ? 1 : 0);
      const score =
        open * 20 + Math.min(defenderGap(a.tx, a.tz, side), defenderGap(b.tx, b.tz, side));
      if (!best || score > best.score) best = { a, b, score };
    }
  }
  if (best) return [best.a, best.b];
  return [strongSpots[0]!, weakSpots[0]!];
}

/** Carrier still high: puck-side a step inside the blue, partner at the far point. */
function highBluePair(
  attack: number,
  pivot: { x: number; z: number },
): [{ tx: number; tz: number }, { tx: number; tz: number }] {
  const strong = strongSideSign(pivot.z);
  let zNear = clampBoardsZ(strong * 7.4);
  if (Math.abs(zNear - pivot.z) < 3.6) zNear = clampBoardsZ(pivot.z + strong * 4.3);
  if (Math.abs(zNear - pivot.z) < 3.6) zNear = clampBoardsZ(pivot.z - strong * 4.3);
  let zFar = clampBoardsZ(-strong * 9.6);
  if (Math.abs(zFar - pivot.z) < 3.6) zFar = clampBoardsZ(-strong * boardsZ());
  if (Math.abs(zFar - zNear) < 8) {
    const dir = Math.sign(zFar - zNear) || -strong;
    zFar = clampBoardsZ(zNear + dir * 8.2);
  }
  return [
    { tx: blueInsideX(attack, 1.15), tz: zNear },
    { tx: blueInsideX(attack, 2.15), tz: zFar },
  ];
}

/** Outside the attacking zone: wide outlets, not a stack on the carrier's line. */
function supportSpread(
  attack: number,
  pivot: { x: number; z: number },
  role: number,
): { tx: number; tz: number } {
  const strong = strongSideSign(pivot.z);
  const sign = role % 2 === 0 ? strong : -strong;
  const lane = 6.6 + Math.floor(role / 2) * 1.4;
  let tz = clampBoardsZ(sign * lane);
  if (Math.abs(tz - pivot.z) < 4) tz = clampBoardsZ(pivot.z + sign * 4.3);
  return { tx: pivot.x - attack * 5.4, tz };
}

function pairSpot(
  pair: [{ tx: number; tz: number }, { tx: number; tz: number }],
  role: number,
  s: Skater,
): { tx: number; tz: number } {
  const mates = cpuDefenders(s.side);
  if (mates.length === 1) {
    const userD = world.skaters.find(
      (p) => p.id === world.userId && p.side === s.side && p.kind === "defense",
    );
    if (userD) {
      const d0 = Math.hypot(pair[0].tx - userD.x, pair[0].tz - userD.z);
      const d1 = Math.hypot(pair[1].tx - userD.x, pair[1].tz - userD.z);
      return d1 > d0 + 0.4 ? pair[1] : pair[0];
    }
  }
  if (role < 2) {
    const mine = defenseHalfSign(s);
    const spot = pair[role]!;
    const other = pair[role === 0 ? 1 : 0]!;
    // Keep the open spot that already sits on this defenseman's half.
    if (spot.tz * mine < -0.2 && other.tz * mine >= -0.2) return other;
    return spot;
  }
  const shift = (1 + Math.floor(role / 2)) * 2.1;
  const base = pair[role % 2]!;
  const tz = clampDefenseHalf(s, clampBoardsZ(base.tz - Math.sign(base.tz || 1) * shift));
  return { tx: base.tx, tz };
}

/**
 * Possession support for a defenseman. Home and away share attackDir.
 * The user is not passed in. Deep carrier: two point spots. High carrier: staggered blue.
 */
function defensePossessionSpot(
  s: Skater,
  pivot: { x: number; z: number },
  inOz: boolean,
): { tx: number; tz: number } {
  const attack = attackDir(s.side);
  const role = defenseRole(s);
  const depth = ozDepth(pivot.x, attack);
  const deep = inOz && (depth <= goalieCircleTop() || carrierBelowGoal(pivot.x, attack));
  if (deep) return pairSpot(deepPointPair(attack, pivot, s.side), role, s);
  if (inOz) return pairSpot(highBluePair(attack, pivot), role, s);
  return supportSpread(attack, pivot, role);
}

/** User rush already through the join window, still carrying speed. One forward crashes. */
function userFastBreak(holder: Skater | null): boolean {
  if (!holder || holder.id !== world.userId || holder.side !== "home" || holder.kind === "goalie") return false;
  if (world.faceoff || world.stoppage || world.whistle) return false;
  const attack = attackDir("home");
  const edge = BLUE_X + BLUE_LINE_W * 0.5;
  if (holder.vx * attack < 6.2) return false;
  if (holder.x * attack < edge + RUSH_JOIN_PAST) return false;
  return true;
}

function userNetCrasherId(holder: Skater | null): number {
  if (!userFastBreak(holder)) return -1;
  let id = -1;
  for (const p of world.skaters) {
    if (p.side !== "home" || p.kind !== "winger" || p.id === world.userId) continue;
    if (id < 0 || p.id < id) id = p.id;
  }
  return id;
}

function netCrashSpot(holder: Skater): { tx: number; tz: number } {
  const attack = attackDir("home");
  const weak = Math.abs(holder.z) > 1.4 ? -Math.sign(holder.z) : 1;
  return {
    tx: attack * (GOAL_LINE_X - 3.3),
    tz: Math.max(-3.2, Math.min(3.2, weak * 2.15)),
  };
}

/** Carrier is across his own attacking blue. */
function carrierInOffensiveZone(holder: Skater | null): boolean {
  if (!holder || holder.kind === "goalie") return false;
  if (world.faceoff || world.stoppage || world.whistle) return false;
  return holder.x * attackDir(holder.side) > BLUE_X + BLUE_LINE_W * 0.5 - 0.05;
}

/** User has the puck across the attacking blue. Teammates use the zone corners, not a blue stack. */
function userInOffensiveZone(holder: Skater | null): boolean {
  if (!holder || holder.id !== world.userId || holder.side !== "home") return false;
  return carrierInOffensiveZone(holder);
}

/**
 * Who the four-corner plan is built around. Home stays on the user-carry gate.
 * CPU keeps the same shape on their rush, and during a pass between the points.
 */
function ozFormationAnchor(s: Skater, holder: Skater | null, ourPassFlight: boolean): Skater | null {
  if (s.side === "home") return holder && userInOffensiveZone(holder) ? holder : null;
  if (holder && holder.side === "away" && carrierInOffensiveZone(holder)) return holder;
  if (holder || !ourPassFlight || world.lastPasser === null) return null;
  const passer = world.skaters[world.lastPasser];
  if (!passer || passer.side !== "away" || passer.kind === "goalie") return null;
  if (world.puck.x * attackDir("away") <= BLUE_X + BLUE_LINE_W * 0.5 - 0.05) return null;
  return passer;
}

let cornerFrame = Number.NaN;
let cornerPlan = new Map<number, { tx: number; tz: number }>();
/** 1 once a corner player has arrived. Stops the settle from twitching. */
const cornerCalm = new Map<number, number>();
/** Screen identities stick for the whole zone possession, so a point-to-point pass does not swap wings. */
let ozScreenIds: number[] = [];
const screenAim = new Map<number, { tx: number; tz: number }>();

function clearUserOzPlan(): void {
  ozScreenIds = [];
  cornerCalm.clear();
  screenAim.clear();
  cornerFrame = Number.NaN;
  cornerPlan = new Map();
}

type ForwardRole = "center" | "left" | "right";

function forwardRole(s: Skater): ForwardRole {
  const mates = forwardSlots(s.side);
  const i = mates.findIndex((p) => p.id === s.id);
  const c = breakoutCenterSlot(mates.length);
  if (i < 0 || i === c) return "center";
  return i < c ? "left" : "right";
}

/** +1 is the left-wing side of the attacking net. */
function leftWingSign(attack: number): number {
  return attack >= 0 ? 1 : -1;
}

/**
 * Lower roster id is the left defenseman, facing this side's attack.
 * The full pair is counted, including the user and the carrier, so a pass
 * or a zone change does not swap who owns which half.
 */
function defenseHalfSign(s: Skater): number {
  const mates = world.skaters
    .filter((p) => p.side === s.side && p.kind === "defense")
    .sort((a, b) => a.id - b.id);
  const i = Math.max(0, mates.findIndex((p) => p.id === s.id));
  const left = leftWingSign(attackDir(s.side));
  return i % 2 === 0 ? left : -left;
}

/**
 * Stay on that half. A target across center is mirrored so a boards spot
 * stays at the boards instead of both defensemen stacking on the red line.
 */
function clampDefenseHalf(s: Skater, tz: number): number {
  const sign = defenseHalfSign(s);
  const boards = RINK_W / 2 - 1.85;
  const z = Math.max(-boards, Math.min(boards, tz));
  if (z * sign >= -0.2) return z;
  return Math.max(-boards, Math.min(boards, Math.abs(z) * sign));
}

/** Left wings stay above the right dot. Right wings stay below the left dot. */
function clampWingDot(role: "left" | "right", z: number, attack: number): number {
  const boards = RINK_W / 2 - 1.85;
  const dot = FACEOFF_SPOT_Z;
  let tz = Math.max(-boards, Math.min(boards, z));
  if (role === "left") {
    if (attack > 0) tz = Math.max(tz, -dot);
    else tz = Math.min(tz, dot);
  } else if (attack > 0) tz = Math.min(tz, dot);
  else tz = Math.max(tz, -dot);
  return tz;
}

function ozScreens(holder: Skater): number[] {
  const crash = holder.side === "home" ? userNetCrasherId(holder) : -1;
  const forwards = forwardSlots(holder.side).filter((p) => p.id !== holder.id && p.id !== crash);
  const alive = ozScreenIds.filter((id) => forwards.some((p) => p.id === id));
  if (alive.length > 0 && alive.length === ozScreenIds.length) return ozScreenIds;
  if (!carrierInOffensiveZone(holder)) {
    clearUserOzPlan();
    return ozScreenIds;
  }
  const center = forwards.find((p) => forwardRole(p) === "center");
  const wings = forwards.filter((p) => forwardRole(p) !== "center");
  const picked: number[] = [];
  if (center) picked.push(center.id);
  const attack = attackDir(holder.side);
  const leftSign = leftWingSign(attack);
  const puckSide = Math.abs(holder.z) > 1.2 ? Math.sign(holder.z) : 0;
  const wing =
    wings.find((w) => {
      const side = forwardRole(w) === "left" ? leftSign : -leftSign;
      return puckSide !== 0 && side === puckSide;
    }) ?? (picked.length === 0 ? wings[0] : undefined);
  if (wing && !picked.includes(wing.id) && picked.length < 2) picked.push(wing.id);
  ozScreenIds = picked.slice(0, 2);
  return ozScreenIds;
}

/** Between the goalie and the carrier, in the slot, not on the carrier's skates. */
function screenBetween(holder: Skater, attack: number, zBias: number): { tx: number; tz: number } {
  const mouth = attack * GOAL_LINE_X;
  const gx = mouth - attack * 1.1;
  const dx = holder.x - gx;
  const dz = holder.z;
  const len = Math.hypot(dx, dz) || 1;
  const step = Math.min(Math.max(len * 0.36, 3.2), 6.6);
  const along = Math.max(2.7, Math.min(step, len - 4.8));
  const tx = gx + (dx / len) * along;
  const tz = (dz / len) * along + zBias;
  const depth = Math.max(2.85, Math.min(7.4, (mouth - tx) * attack));
  return {
    tx: mouth - attack * depth,
    tz: Math.max(-FACEOFF_SPOT_Z + 0.35, Math.min(FACEOFF_SPOT_Z - 0.35, tz)),
  };
}

function keepOffCarrier(
  spot: { tx: number; tz: number },
  holder: Skater,
  minD: number,
  attack: number,
): { tx: number; tz: number } {
  let tx = spot.tx;
  let tz = spot.tz;
  const dx0 = tx - holder.x;
  const dz0 = tz - holder.z;
  const d0 = Math.hypot(dx0, dz0);
  if (d0 >= minD) return spot;
  const ux = d0 > 0.2 ? dx0 / d0 : -attack;
  const uz = d0 > 0.2 ? dz0 / d0 : 0;
  const push = minD - d0 + 0.4;
  tx += ux * push;
  tz += uz * push;
  const mouth = attack * GOAL_LINE_X;
  const half = (GOAL_LINE_X - (BLUE_X + BLUE_LINE_W * 0.5)) * 0.5;
  const depth = Math.max(2.7, Math.min(half - 0.3, (mouth - tx) * attack));
  return { tx: mouth - attack * depth, tz };
}

function easeScreen(id: number, tx: number, tz: number): { tx: number; tz: number } {
  const prev = screenAim.get(id);
  if (!prev) {
    const spot = { tx, tz };
    screenAim.set(id, spot);
    return spot;
  }
  if (Math.hypot(prev.tx - tx, prev.tz - tz) < 1.15) return prev;
  const spot = { tx: prev.tx + (tx - prev.tx) * 0.4, tz: prev.tz + (tz - prev.tz) * 0.4 };
  screenAim.set(id, spot);
  return spot;
}

/**
 * Four corners while this side carries in the offensive zone.
 * Wings keep one side of the dots. The center, without the puck, fronts the net.
 * Defense stays on a fixed blue-line corner, one man to a half.
 * The corner is far enough inside the stripe that a forehand catch stays
 * in the zone. At 1.15 m the tape crosses the line and the next frame is offside.
 */
function userCornerPlan(holder: Skater): Map<number, { tx: number; tz: number }> {
  if (cornerFrame === world.time) return cornerPlan;
  cornerFrame = world.time;
  const plan = new Map<number, { tx: number; tz: number }>();
  const side = holder.side;
  const attack = attackDir(side);
  const leftSign = leftWingSign(attack);
  const boards = RINK_W / 2 - 1.85;
  const endX = attack * (GOAL_LINE_X - 2.8);
  const nearBlue = holder.x * attack < BLUE_X + BLUE_LINE_W * 0.5 + 8;
  const slotX = nearBlue ? endX : attack * (GOAL_LINE_X - 7.2);
  const blueX = attack * (BLUE_X + BLUE_LINE_W * 0.5 + 2.15);
  const crash = side === "home" ? userNetCrasherId(holder) : -1;
  const screens = new Set(ozScreens(holder));
  const defs = world.skaters
    .filter((p) => p.side === side && p.kind === "defense" && p.id !== holder.id && p.id !== world.userId)
    .sort((a, b) => a.id - b.id);
  defs.forEach((d) => {
    plan.set(d.id, { tx: blueX, tz: defenseHalfSign(d) * boards });
  });
  for (const f of forwardSlots(side)) {
    if (f.id === holder.id || f.id === world.userId || f.id === crash) continue;
    const role = forwardRole(f);
    if (role === "center" || screens.has(f.id)) {
      const side = role === "left" ? leftSign : role === "right" ? -leftSign : 0;
      const bias = side * (role === "center" ? 0 : FACEOFF_SPOT_Z * 0.92);
      let spot = screenBetween(holder, attack, bias);
      if (role !== "center") {
        const mouth = attack * GOAL_LINE_X;
        const depth = Math.min(8.2, (mouth - spot.tx) * attack + 2.6);
        spot = { tx: mouth - attack * depth, tz: spot.tz };
      }
      spot = keepOffCarrier(spot, holder, role === "center" ? 4.8 : 5.6, attack);
      if (role !== "center") spot = { tx: spot.tx, tz: clampWingDot(role, spot.tz, attack) };
      plan.set(f.id, easeScreen(f.id, spot.tx, spot.tz));
      continue;
    }
    const side = role === "left" ? leftSign : -leftSign;
    let tx = endX * 0.78 + slotX * 0.22;
    let tz = side * boards * 0.84 + side * (FACEOFF_SPOT_Z + 0.8) * 0.16;
    let spot = keepOffCarrier({ tx, tz }, holder, 5.6, attack);
    spot = { tx: spot.tx, tz: clampWingDot(role, spot.tz, attack) };
    plan.set(f.id, spot);
  }
  const placed = forwardSlots(side).filter((p) => plan.has(p.id));
  for (let n = 0; n < 4; n++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const pa = plan.get(a.id)!;
        const pb = plan.get(b.id)!;
        const dx = pb.tx - pa.tx;
        const dz = pb.tz - pa.tz;
        const dist = Math.hypot(dx, dz);
        if (dist >= 5.1) continue;
        const push = (5.2 - dist) * 0.5;
        const uz = dist > 0.2 ? dz / dist : leftSign;
        const ux = dist > 0.2 ? dx / dist : 0;
        const shift = (p: Skater, sign: number) => {
          const cur = plan.get(p.id)!;
          const role = forwardRole(p);
          let tz = cur.tz + uz * push * sign;
          let tx = cur.tx + ux * push * sign;
          if (role !== "center") tz = clampWingDot(role, tz, attack);
          const mouth = attack * GOAL_LINE_X;
          const depth = Math.max(2.7, Math.min(8.6, (mouth - tx) * attack));
          plan.set(p.id, { tx: mouth - attack * depth, tz });
        };
        if (forwardRole(a) === "center") shift(b, 1);
        else if (forwardRole(b) === "center") shift(a, -1);
        else {
          shift(a, -1);
          shift(b, 1);
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  cornerPlan = plan;
  return plan;
}

function deepestHomeForward(): Skater | null {
  const attack = attackDir("home");
  let best: Skater | null = null;
  let along = -Infinity;
  for (const p of world.skaters) {
    if (p.side !== "home" || p.kind !== "winger") continue;
    if (p.stun > 0.5 || p.tumble !== 0) continue;
    const a = p.x * attack;
    if (a > along) {
      along = a;
      best = p;
    }
  }
  return best;
}

/** Home has the puck and a forward is already on the attacking side of center. */
function homeRushThreat(): boolean {
  if (world.faceoff || world.stoppage || world.whistle) return false;
  const holder = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  const homeHas = !!(holder && holder.side === "home" && holder.kind !== "goalie");
  if (!homeHas && !homePassInFlight()) return false;
  const deep = deepestHomeForward();
  if (!deep) return false;
  return deep.x * attackDir("home") > 0.4;
}

let depthFrame = Number.NaN;
let depthId = -1;

/** One away defender. A second skater may still pursue. Depth wins when he is the only one. */
function depthDefenderId(): number {
  if (depthFrame === world.time) return depthId;
  depthFrame = world.time;
  depthId = -1;
  if (!homeRushThreat()) return -1;
  const defs: Skater[] = [];
  for (const p of world.skaters) {
    if (p.side !== "away" || p.kind !== "defense") continue;
    if (p.stun > 0.45 || p.struck > 0.5 || p.tumble !== 0) continue;
    defs.push(p);
  }
  if (!defs.length) return -1;
  const holder = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  let primary = -1;
  if (holder && holder.id === world.userId && holder.side === "home" && holder.kind !== "goalie") {
    primary = userPressIds(holder).primary;
  }
  const spare = defs.find((d) => d.id !== primary);
  depthId = (spare ?? defs[0]!).id;
  return depthId;
}

/** Same ice depth as the deepest home forward, or hold if already deeper. Lateral stays off his skates. */
function depthMatchSpot(s: Skater): { tx: number; tz: number } | null {
  const fwd = deepestHomeForward();
  if (!fwd) return null;
  const attack = attackDir("home");
  const mouth = attack * GOAL_LINE_X;
  const minDepth = 1.15;
  let tx = fwd.x;
  const fwdAlong = fwd.x * attack;
  if (s.x * attack > fwdAlong + 0.3) tx = s.x;
  if (attack > 0) tx = Math.min(tx, mouth - minDepth);
  else tx = Math.max(tx, mouth + minDepth);
  let tz = Math.max(-4.2, Math.min(4.2, fwd.z * 0.45));
  if (Math.abs(tz - fwd.z) < 2.2) {
    const dir = fwd.z >= 0 ? -1 : 1;
    tz = Math.max(-4.2, Math.min(4.2, fwd.z + dir * 2.4));
  }
  return { tx, tz };
}

let boardArc = 0;
let boardPrevX = 0;
let boardPrevZ = 0;
let boardPrevId = -1;
let boardCutId = -1;
let boardCutUntil = -1;
let boardCutCool = -1;
let boardCutX = 0;
let boardCutZ = 0;
let boardFrame = Number.NaN;

function boardCutLive(s: Skater): boolean {
  return s.id === boardCutId && world.time < boardCutUntil && !world.faceoff && !world.stoppage && !world.whistle;
}

function boardIntercept(holder: Skater): { tx: number; tz: number } {
  const spd = Math.hypot(holder.vx, holder.vz) || 1;
  const ux = holder.vx / spd;
  const uz = holder.vz / spd;
  let tx = holder.x + ux * 7.2;
  let tz = holder.z + uz * 7.2;
  if (Math.abs(holder.z) >= RINK_W / 2 - 3.6) tz -= Math.sign(holder.z) * 2.6;
  else tx -= Math.sign(holder.x || ux || 1) * 2.4;
  tx = Math.max(-RINK_L / 2 + 1.2, Math.min(RINK_L / 2 - 1.2, tx));
  tz = Math.max(-RINK_W / 2 + 1.3, Math.min(RINK_W / 2 - 1.3, tz));
  return { tx, tz };
}

function pickBoardCutter(holder: Skater): Skater | null {
  const ids = userPressIds(holder);
  const primary = ids.primary >= 0 ? world.skaters[ids.primary] : null;
  if (primary) {
    const dx = holder.x - primary.x;
    const dz = holder.z - primary.z;
    const d = Math.hypot(dx, dz);
    const spd = Math.hypot(holder.vx, holder.vz) || 1;
    const ahead = -((dx * holder.vx + dz * holder.vz) / spd);
    if (d < 3.2 && ahead > 0.4) return null;
  }
  const skip = depthDefenderId();
  let best: Skater | null = null;
  let bestScore = Infinity;
  for (const p of world.skaters) {
    if (p.side === holder.side || p.kind === "goalie") continue;
    if (p.stun > 0.45 || p.struck > 0.5 || p.tumble !== 0) continue;
    if (p.id === skip && p.kind === "defense") continue;
    const d = Math.hypot(p.x - holder.x, p.z - holder.z);
    const score = d + (p.kind === "defense" ? 4 : 0) + (p.id === ids.primary ? 6 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** Long board run by the user. One CPU steps into the lane, then leaves it alone. */
function updateBoardCircuit(): void {
  if (boardFrame === world.time) return;
  boardFrame = world.time;
  if (world.time >= boardCutUntil) boardCutId = -1;
  const holder = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  const skating =
    !!holder &&
    holder.id === world.userId &&
    holder.side === "home" &&
    holder.kind !== "goalie" &&
    !world.faceoff &&
    !world.stoppage &&
    !world.whistle;
  if (!skating || !holder) {
    boardArc = 0;
    boardPrevId = -1;
    return;
  }
  const near = Math.abs(holder.z) >= RINK_W / 2 - 3.1 || Math.abs(holder.x) >= RINK_L / 2 - 3.4;
  const spd = Math.hypot(holder.vx, holder.vz);
  if (!near || spd < 4) {
    if (!near) boardArc = Math.max(0, boardArc - 6);
    boardPrevX = holder.x;
    boardPrevZ = holder.z;
    boardPrevId = holder.id;
    return;
  }
  if (boardPrevId !== holder.id) {
    boardArc = 0;
    boardPrevX = holder.x;
    boardPrevZ = holder.z;
    boardPrevId = holder.id;
    return;
  }
  const step = Math.hypot(holder.x - boardPrevX, holder.z - boardPrevZ);
  boardPrevX = holder.x;
  boardPrevZ = holder.z;
  if (step > 0.05 && step < 1.2) boardArc += step;
  if (boardArc < 38 || world.time < boardCutCool || boardCutId >= 0) return;
  const cut = pickBoardCutter(holder);
  if (!cut) {
    boardArc = 24;
    return;
  }
  const spot = boardIntercept(holder);
  boardCutId = cut.id;
  boardCutUntil = world.time + 0.95;
  boardCutCool = world.time + 7.5;
  boardCutX = spot.tx;
  boardCutZ = spot.tz;
  boardArc = 0;
}

function thinkWithoutPuck(s: Skater): { wx: number; wz: number; mag: number; burst: boolean } {
  const bitten = dekeMissWish(s);
  if (bitten) return bitten;
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
    world.time - world.lastPass < 2.2;
  const passToMe = ourPassFlight && world.lastPassTo === s.id;
  const pivot = holder && weHave ? holder : ourPassFlight ? puck : null;
  const puckAtk = (pivot ? pivot.x : puck.x) * attack;
  const inOz = offsidesLive() ? puckOzSide(puck) === attack : puckAtk > BLUE_X - 0.4;

  dropOzHoldOnEntry();
  updateBoardCircuit();
  let tx = s.x;
  let tz = s.z;
  let wrapDeep = false;
  let ozHoldSkate = false;
  let breakoutHold = false;
  let rushJoin = false;
  let netCrash = false;
  let cornerHold = false;
  let cornerSettled = false;
  let depthHold = false;
  let rushSpot: { tx: number; tz: number } | null = null;
  let stickChase = false;
  let matePuckChase = false;
  let loosePassChase = false;
  let retrieving = false;
  let openEnd: 1 | -1 | 0 = 0;
  let userPress: "on" | "peel" | "hold" | null = null;
  const endJob = endChaseJob(s, holder, passToMe);
  if (endJob) {
    wrapDeep = true;
    openEnd = endJob.end;
  }

  let steered = false;
  const ozAnchor = ozFormationAnchor(s, holder, ourPassFlight);
  if (
    !wrapDeep &&
    ozAnchor &&
    s.id !== world.userId &&
    s.id !== (holder?.id ?? -1) &&
    s.kind !== "goalie" &&
    !passToMe
  ) {
    if (holder && s.side === "home" && s.kind === "winger" && s.id === userNetCrasherId(holder)) {
      const st = netCrashSpot(holder);
      tx = st.tx;
      tz = st.tz;
      netCrash = true;
      ozHold.delete(s.id);
      steered = true;
    } else {
      const st = userCornerPlan(ozAnchor).get(s.id);
      if (st) {
        tx = st.tx;
        tz = st.tz;
        cornerHold = true;
        ozHold.delete(s.id);
        steered = true;
      }
    }
  }
  if (!steered && !wrapDeep && pivot && (weHave || ourPassFlight)) {
    const carrierId = holder?.id ?? -1;
    const joining =
      !passToMe &&
      s.kind !== "goalie" &&
      s.id !== world.userId &&
      s.id !== carrierId &&
      rushJoinOn(pivot, attack);
    if (joining) {
      const st = rushJoinSpot(s, carrierId);
      tx = st.tx;
      tz = st.tz;
      rushSpot = st;
      rushJoin = true;
    } else if (s.kind === "defense" && s.id !== world.userId) {
      const st = defensePossessionSpot(s, pivot, inOz);
      tx = st.tx;
      tz = st.tz;
    } else if (s.kind === "defense") {
      // User defenseman. Live play does not steer him; do not hand him a forward spot.
    } else if (!passToMe) {
      if (s.side === "home" && s.kind === "winger" && userPuckDefensiveHalf()) {
        const st = homeBreakoutSpot(s);
        tx = st.tx;
        tz = st.tz;
        breakoutHold = true;
      } else if (holder && s.id === userNetCrasherId(holder)) {
        const st = netCrashSpot(holder);
        tx = st.tx;
        tz = st.tz;
        netCrash = true;
        ozHold.delete(s.id);
      } else {
        const st = supportSpot(s, pivot, carrierId);
        tx = st.tx;
        tz = st.tz;
        ozHoldSkate = true;
      }
    }
    if (passToMe) {
      if (passMeet) {
        tx = passMeet.x;
        tz = passMeet.z;
      } else {
        const spd = Math.hypot(puck.vx, puck.vz);
        const look = spd > 1 ? Math.max(2.4, Math.min(16, spd * 0.7)) : 0;
        tx = puck.x + (spd > 1 ? (puck.vx / spd) * look : 0);
        tz = puck.z + (spd > 1 ? (puck.vz / spd) * look : 0);
      }
    }
  } else if (
    !steered &&
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
      const fi = Math.max(
        0,
        wings.findIndex((p) => p.id === s.id),
      );
      const side = fi % 2 === 0 ? 1 : -1;
      tx = holder.x + own * (3.7 + fi * 0.75);
      tz = holder.z * 0.38 + side * (2.5 + fi * 0.55);
      tz = Math.max(-7.2, Math.min(7.2, tz));
    }
  } else if (!steered && !wrapDeep && holder) {
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
        const fi = Math.max(
          0,
          wings.findIndex((p) => p.id === s.id),
        );
        const side = fi % 2 === 0 ? 1 : -1;
        tx = holder.x - attack * (0.9 + fi * 0.85);
        tz = holder.z + side * (1.85 + fi * 0.7);
        const blue = -attack * (BLUE_X - 0.8);
        if (attack > 0) tx = Math.min(tx, blue);
        else tx = Math.max(tx, blue);
      }
    } else if (s.kind === "defense") {
      const dMates = world.skaters.filter((p) => p.side === s.side && p.kind === "defense");
      const di = Math.max(
        0,
        dMates.findIndex((p) => p.id === s.id),
      );
      const wide = di === 0 ? -1 : 1;
      const holdAtk = holder.x * attack;
      if (s.side === "home") {
        // Carrier skating back toward our net while still near the offensive blue.
        const leavingOz = holder.vx * attack < -0.85 && holdAtk < BLUE_X + 5;
        if (holdAtk > BLUE_X - 0.15 && !leavingOz) {
          const p = homeDBluePatrol(s, attack, wide, holder.z, false);
          tx = p.tx;
          tz = p.tz;
        } else if (holdAtk > -BLUE_X - 1.1 || leavingOz) {
          const gap = 2.45 + di * 2.2;
          tx = holder.x - attack * gap;
          tz = holder.z * 0.35 + wide * 3.3;
          if (leavingOz && holdAtk > BLUE_X - 0.5) {
            const shelf = attack * (BLUE_X - 1.05 - di * 0.45);
            if (attack > 0) tx = Math.min(tx, shelf);
            else tx = Math.max(tx, shelf);
          }
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
    } else if (!weHave && rank === 0) {
      const side = s.id % 2 === 0 ? 1.15 : -1.15;
      tx = holder.x + own * (closeIdle ? 0.08 : 1.05);
      tz = holder.z + (closeIdle ? side * 0.18 : side);
    } else if (!weHave && s.side === "home" && rank <= 2) {
      const back = rank === 1 ? 7.4 : 9.6;
      tx = holder.x - attack * back;
      const lane = rank === 1 ? -6.7 : 6.7;
      tz = Math.max(-7.2, Math.min(7.2, holder.z * 0.34 + lane));
    } else if (!weHave) {
      tx = (holder.x + ownMouth) * 0.5;
      tz = Math.max(-7.2, Math.min(7.2, slotAmong(s, "winger", 5.2)));
    }
  } else if (!steered && !wrapDeep && rank === 0 && s.kind !== "defense") {
    const meet = ontoPassPuck(s);
    tx = meet.x;
    tz = meet.z;
  } else if (!steered && !wrapDeep && s.kind === "defense") {
    if (s.side === "home") {
      const dMates = world.skaters.filter((p) => p.side === s.side && p.kind === "defense");
      const di = Math.max(
        0,
        dMates.findIndex((p) => p.id === s.id),
      );
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
      // Same goalside gap as a carrier outside the zone: stay with the puck,
      // hold the blue until it actually enters, then sink.
      const gap = 1.95;
      tx = puck.x + own * gap;
      const inOurZone = puck.x * own > BLUE_X - 0.4;
      if (!inOurZone) {
        if (own > 0) tx = Math.min(tx, BLUE_X + 2.2);
        else tx = Math.max(tx, -BLUE_X - 2.2);
      }
      tz = slotAmong(s, "defense", 3.6) * 0.72 + puck.z * 0.18;
      const ddx = tx - puck.x;
      const ddz = tz - puck.z;
      const gapNow = Math.hypot(ddx, ddz);
      if (gapNow < 1.55) {
        const k = 1.9 / (gapNow || 1);
        tx = puck.x + ddx * k;
        tz = puck.z + ddz * k;
      }
    }
  } else if (!steered && !wrapDeep) {
    tx = puck.x + own * 4;
    tz = Math.max(-7.4, Math.min(7.4, slotAmong(s, "winger", 5)));
  }

  if (!wrapDeep && !holder && !ourPassFlight && s.side === "away" && s.kind !== "defense") {
    const dPuck = Math.hypot(s.x - puck.x, s.z - puck.z);
    const loose = puck.y < 0.72 && Math.hypot(puck.vx, puck.vz) < 9;
    if (loose && (dPuck < 5.2 || (rank === 0 && dPuck < 10))) {
      const meet = ontoPassPuck(s);
      tx = meet.x;
      tz = meet.z;
    }
  }

  if (!holder && stickLooseBy >= 0 && world.time < stickLooseUntil + 0.85) {
    const poker = world.skaters[stickLooseBy];
    if (
      poker &&
      s.side === poker.side &&
      s.id !== world.userId &&
      (s.id === stickLooseBy || rank === 0)
    ) {
      const meet = ontoPassPuck(s);
      tx = meet.x;
      tz = meet.z;
      stickChase = true;
      rushJoin = false;
    }
  }

  if (
    s.side === "home" &&
    s.id !== world.userId &&
    s.kind !== "goalie" &&
    !wrapDeep &&
    looseOrRebound() &&
    !livePassForOther(s) &&
    !livePassTo(s.id)
  ) {
    const dPuck = Math.hypot(s.x - puck.x, s.z - puck.z);
    if (dPuck <= 6) {
      const meet = ontoPassPuck(s);
      tx = meet.x;
      tz = meet.z;
      ozHoldSkate = false;
      matePuckChase = true;
      rushJoin = false;
    }
  }

  // No aimed receiver on this home pass: the nearest teammate leaves the
  // blue-line stack and skates onto the puck, even outside PASS_CONE.
  if (
    s.side === "home" &&
    s.id !== world.userId &&
    s.kind !== "goalie" &&
    !wrapDeep &&
    nearestHomePassChaser() === s.id
  ) {
    const spot = ontoPassPuck(s);
    tx = spot.x;
    tz = spot.z;
    loosePassChase = true;
    ozHoldSkate = false;
    breakoutHold = false;
    rushJoin = false;
  }

  tx = clampOnsideX(s, tx);
  const endLoose = !holder && !world.faceoff && !world.stoppage ? looseEnd(puck) : 0;
  if (!retrieving && endLoose !== 0 && !wrapDeep) {
    const dPuck = Math.hypot(s.x - puck.x, s.z - puck.z);
    if (passToMe || rank === 0 || dPuck < 6.2 || (s.kind === "defense" && dPuck < 14)) {
      const chase = retrieveAroundNet(s, puck, endLoose);
      tx = chase.tx;
      tz = chase.tz;
      retrieving = true;
      openEnd = endLoose;
      rushJoin = false;
    }
  }
  if (endJob) {
    const chase = endJob.holder
      ? wrapChaseTarget(s, endJob.holder)
      : retrieveAroundNet(s, puck, endJob.end);
    tx = chase.tx;
    tz = chase.tz;
    retrieving = true;
    openEnd = endJob.end;
    wrapDeep = true;
    ozHoldSkate = false;
    breakoutHold = false;
    rushJoin = false;
  }
  const c =
    openEnd !== 0
      ? clampLane(tx, tz, attack, openEnd)
      : passToMe || matePuckChase || loosePassChase
        ? clampPassMeet(tx, tz)
        : clampLane(tx, tz, attack);
  if (userPress === "on" && holder && openEnd === 0) {
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
  c.tx = clampOnsideX(s, c.tx);
  c.tx = holdHomeDefenseX(s, c.tx);
  if (s.kind === "winger") {
    const looseChase = !holder && !ourPassFlight && rank === 0;
    if (breakoutHold || rushJoin || netCrash || cornerHold) {
      noteWingAim(s.id, c.tx, c.tz);
    } else if (
      !passToMe &&
      !stickChase &&
      !retrieving &&
      !looseChase &&
      !matePuckChase &&
      !loosePassChase
    ) {
      const spread = spreadHomeWing(s, c.tx, c.tz);
      let steer = spread;
      if (ozHoldSkate) {
        const held = ozHold.get(s.id);
        const ownerId = holder?.id ?? -1;
        const spreadLegal =
          !!pivot && supportLegal(s, pivot, attack, spread.tx, spread.tz, ownerId);
        const heldLegal =
          !!held && !!pivot && supportLegal(s, pivot, attack, held.tx, held.tz, ownerId);
        if (held && heldLegal && !spreadLegal) {
          steer = { tx: held.tx, tz: held.tz };
          noteWingAim(s.id, held.tx, held.tz);
        } else if (held) {
          held.tx = spread.tx;
          held.tz = spread.tz;
        }
      }
      c.tx = steer.tx;
      c.tz = steer.tz;
    } else {
      noteWingAim(s.id, c.tx, c.tz);
    }
  }
  if (
    openEnd === 0 &&
    !rushJoin &&
    s.side === "away" &&
    s.kind === "defense" &&
    puckInNeutralZone() &&
    s.id === cpuNzDefenderId()
  ) {
    const ownSide = defendDir("away");
    if (c.tx * ownSide <= 0) {
      // Red line is not their side. Park just past center, toward the CPU net.
      c.tx = ownSide * 1.2;
      if (userPress === "on" || userPress === "peel") userPress = "hold";
    }
  }
  const boardSide = openEnd === 0 && !wrapDeep ? userOzBoardPass() : 0;
  if (boardSide !== 0 && s.side === "home" && s.id !== world.userId && s.kind !== "goalie") {
    const attack = attackDir("home");
    const wall = boardSide * (RINK_W / 2 - 1.7);
    if (s.kind === "defense") {
      const defs = world.skaters.filter((p) => p.side === s.side && p.kind === "defense");
      const di = Math.max(0, defs.findIndex((p) => p.id === s.id));
      c.tx = attack * (BLUE_X + 0.35 + di * 0.85);
      c.tz = wall * (di === 0 ? 1 : 0.7);
    } else {
      const wings = world.skaters.filter((p) => p.side === s.side && p.kind === "winger");
      const fi = Math.max(0, wings.findIndex((p) => p.id === s.id));
      const dot = attack * FACEOFF_EZ_X;
      const low = attack * (GOAL_LINE_X - 2.8);
      const meet = ontoPassPuck(s);
      let x = meet.x;
      if ((dot - x) * attack > 0) x = dot;
      x += attack * Math.min(fi, 2) * 1.5;
      if ((x - low) * attack > 0) x = low;
      c.tx = x;
      c.tz = wall;
    }
  }
  if (
    holder &&
    holder.id === world.userId &&
    s.side === holder.side &&
    s.id !== holder.id &&
    s.kind !== "goalie" &&
    !passToMe &&
    !retrieving &&
    !matePuckChase &&
    !loosePassChase &&
    !cornerHold &&
    openEnd === 0
  ) {
    const minD = netCrash ? 2.4 : 6.2;
    const sep = pushOffCarrierZ(c.tx, c.tz, holder.x, holder.z, minD);
    c.tx = clampOnsideX(s, sep.tx);
    const zPad = RINK_W / 2 - 1.6;
    c.tz = Math.max(-zPad, Math.min(zPad, sep.tz));
  }
  if (s.side === "away" && s.kind === "defense" && s.id === depthDefenderId() && openEnd === 0) {
    const spot = depthMatchSpot(s);
    if (spot) {
      c.tx = spot.tx;
      c.tz = spot.tz;
      depthHold = true;
      userPress = null;
    }
  }
  if (boardCutLive(s) && openEnd === 0) {
    c.tx = boardCutX;
    c.tz = boardCutZ;
    if (userPress === "on" || userPress === "peel") userPress = null;
  }
  // Half-ice lock is last so a puck-side gap, a point swap, or a board pass
  // cannot drag both defensemen onto one corner. A net wrap and a live lane
  // cut still cross. The carrier and the human defenseman are not steered here.
  if (
    s.kind === "defense" &&
    s.id !== world.userId &&
    s.id !== puck.owner &&
    openEnd === 0 &&
    !retrieving &&
    !boardCutLive(s)
  ) {
    c.tz = clampDefenseHalf(s, c.tz);
  }
  const dx = c.tx - s.x;
  const dz = c.tz - s.z;
  const dist = Math.hypot(dx, dz) || 1;
  let mag = dist < 0.85 ? 0 : dist < 1.7 ? 0.22 : dist < 2.8 ? 0.48 : 0.92;
  let burst = !weHave && rank === 0 && dist > 10 && s.kind !== "defense";
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
    if (s.kind === "winger" && rank >= 1 && rank <= 2 && (s.x - holder.x) * attack > 0.2) {
      burst = true;
    }
  }
  if (weHave && s.kind === "winger" && dist > 3.2) mag = Math.max(mag, 0.98);
  if (weHave && s.kind === "winger" && inOz) mag = Math.max(mag, dist < 1.15 ? 0.28 : 0.55);
  if ((weHave || ourPassFlight) && holder && dist < 2.4 && mag > 0.14) {
    s.yaw = turnToward(s.yaw, holder.x - s.x, holder.z - s.z, 1.6, 0.016);
  }
  if (
    !weHave &&
    holder &&
    holder.id === world.userId &&
    rank === 0 &&
    s.kind === "winger" &&
    userPress === "on"
  ) {
    mag = Math.max(mag, 0.95);
  }
  if (
    weHave &&
    holder &&
    holder.side === "home" &&
    s.id !== holder.id &&
    !passToMe &&
    nearestFoe(s).d < 3.2
  ) {
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
      if (!weHave && holder && holder.side !== s.side && (s.x - holder.x) * attack > 0.2) {
        burst = true;
      }
    } else if (depthHold) {
      mag = Math.max(mag, dist > 2 ? 0.98 : 0.64);
      if (dist > 2.2) burst = true;
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
    mag =
      s.kind === "winger"
        ? dist > 5
          ? 0.74
          : Math.min(mag, 0.6)
        : dist > 4
          ? 0.8
          : Math.min(mag, 0.68);
    burst = false;
  }
  if (s.side === "away" && s.id !== world.userId) {
    mag *= Math.min(1, weHave ? cpuMul("off") : cpuMul("def"));
  }
  if (retrieving || openEnd !== 0) {
    const src = holder && openEnd !== 0 ? holder : puck;
    const dPuck = Math.hypot(s.x - src.x, s.z - src.z);
    mag = dPuck < 1.15 ? 0.72 : 1;
    burst = dPuck > 2.2;
  }
  if (userPress === "on" && holder) {
    s.yaw = turnToward(s.yaw, holder.x - s.x, holder.z - s.z, 11, 0.016);
  }
  if (ozHoldSkate) {
    const h = ozHold.get(s.id);
    if (h) {
      if (dist < 0.55) {
        h.calm = true;
        if (h.settled <= 0) h.settled = world.time;
      } else if (dist > 1.35) {
        h.calm = false;
        h.settled = 0;
      }
      if (h.calm && dist < 1.05) {
        mag = 0;
        burst = false;
      } else {
        mag = Math.max(mag, dist < 3.2 ? 0.78 : 0.96);
        if (dist > 5.5) burst = true;
      }
    }
  }
  if (stickChase) {
    const dPuck = Math.hypot(s.x - puck.x, s.z - puck.z);
    mag = dPuck < 0.9 ? 0.78 : 1;
    burst = dPuck > 1.5;
  }
  if (passToMe && !retrieving) {
    mag = dist < 0.45 ? 0 : dist < 1.15 ? 0.55 : 1;
    burst = dist > 1.4;
  }
  if (matePuckChase && !retrieving) {
    const dPuck = Math.hypot(s.x - puck.x, s.z - puck.z);
    mag = (dPuck < 0.35 ? 0.15 : 1) * Math.min(1, userMul("def"));
    burst = dPuck > 2.2;
    s.yaw = turnToward(s.yaw, puck.x - s.x, puck.z - s.z, 8, 0.016);
  }
  if (loosePassChase && !retrieving) {
    mag = dist < 0.45 ? 0.15 : dist < 1.2 ? 0.62 : 1;
    burst = dist > 1.5;
    s.yaw = turnToward(s.yaw, puck.x - s.x, puck.z - s.z, 8, 0.016);
  }
  if (breakoutHold) {
    if (dist < 1.35) {
      mag = 0;
      burst = false;
    } else mag = Math.max(mag, 0.98);
  }
  if (rushJoin && rushSpot && pivot && !retrieving) {
    const behind = (pivot.x - s.x) * attack;
    const heldShort = (rushSpot.tx - c.tx) * attack > 0.35;
    const gap = Math.hypot(rushSpot.tx - s.x, rushSpot.tz - s.z);
    if (!heldShort && gap < 1.55) {
      mag = gap < 0.7 ? 0.22 : 0.38;
      burst = false;
    } else if (behind > RUSH_JOIN_BEHIND) {
      mag = 0.98;
      burst = true;
    } else {
      mag = Math.max(mag, 0.86);
      burst = false;
    }
  }
  if (netCrash) {
    mag = Math.max(mag, dist > 2.2 ? 0.98 : 0.6);
    if (dist > 4.5) burst = true;
  }
  if (cornerHold) {
    const rigid = s.kind === "defense";
    const calmIn = rigid ? 0.55 : 1.05;
    const calmOut = rigid ? 0.95 : 1.9;
    const stopIn = rigid ? 0.75 : 1.4;
    let calm = cornerCalm.get(s.id) === 1;
    if (dist < calmIn) calm = true;
    else if (dist > calmOut) calm = false;
    cornerCalm.set(s.id, calm ? 1 : 0);
    if (calm && dist < stopIn) {
      mag = 0;
      burst = false;
      cornerSettled = true;
    } else {
      mag = Math.max(mag, dist > 3 ? 0.98 : rigid ? 0.9 : 0.7);
      if (dist > (rigid ? 2.6 : 4.5)) burst = true;
    }
  }
  if (depthHold) {
    mag = Math.max(mag, dist > 2 ? 0.98 : 0.64);
    if (dist > 2.2) burst = true;
  }
  if (boardCutLive(s)) {
    mag = Math.max(mag, dist > 1.5 ? 1 : 0.7);
    if (dist > 2.8) burst = true;
  }
  const rep = repulsion(s);
  const rw =
    cornerSettled
      ? 0
      : cornerHold
        ? 0.08
        : openEnd !== 0 || retrieving || stickChase
        ? 0.12
        : passToMe || matePuckChase || loosePassChase
          ? 0.06
          : rushJoin
            ? 0.1
            : ozHoldSkate || breakoutHold
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

/** Goal line out to the tops of the end-zone faceoff circles (20 ft + radius). */
function goalieCircleTop(): number {
  return GOAL_LINE_X - FACEOFF_EZ_X + FACEOFF_R;
}

/** Positive toward center ice, from this goalie's goal line. */
function goalieFromLine(side: "home" | "away", x: number): number {
  const mouth = defendDir(side) * GOAL_LINE_X;
  return (x - mouth) * attackDir(side);
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
  if (goalieFromLine("home", puck.x) > goalieCircleTop() + 0.05) return false;
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

/**
 * Behind a goal line toward the end glass, or in that end's corner.
 * The corner includes the last metre in front of the paint, wide of the posts,
 * where the lane clamp (mouth ± 2.6) never lets a skater arrive.
 */
function chaseEndAt(x: number, z: number): 1 | -1 | 0 {
  if (x >= GOAL_LINE_X - 0.06) return 1;
  if (x <= -(GOAL_LINE_X - 0.06)) return -1;
  const end = (x >= 0 ? 1 : -1) as 1 | -1;
  const past = (x - end * GOAL_LINE_X) * end;
  if (past > -1.35 && Math.abs(z) > GOAL_W / 2 + 2.4) return end;
  return 0;
}

function looseEnd(puck: Puck): 1 | -1 | 0 {
  if (puck.owner !== null || puck.y > 1.25) return 0;
  return chaseEndAt(puck.x, puck.z);
}

function cageClearZ(radius: number): number {
  return GOAL_W / 2 + radius + GOAL_PIPE_R + 0.28;
}

function chaseRoom(): number {
  return RINK_L / 2 - END_CHASE_PAD - GOAL_LINE_X;
}

function chasePathBlocked(x0: number, z0: number, x1: number, z1: number, radius: number): boolean {
  if (segmentHitsCage(x0, z0, x1, z1)) return true;
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (resolveCage(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, radius, true).hit) return true;
  }
  return false;
}

function onIce(x: number, z: number, radius: number): { tx: number; tz: number } {
  const ice = resolveRink(x, z, radius);
  return { tx: ice.x, tz: ice.z };
}

/** Lead the puck, then shove an aim that sits in the cage out beside or behind it. */
function aimPastGoal(
  px: number,
  pz: number,
  vx: number,
  vz: number,
  end: 1 | -1,
  radius: number,
): { tx: number; tz: number } {
  const mouth = end * GOAL_LINE_X;
  const clear = cageClearZ(radius);
  const side = (Math.sign(pz) || 1) as 1 | -1;
  const room = chaseRoom();
  let tx = px + vx * 0.16;
  let tz = pz + vz * 0.16;
  const endX = end * (RINK_L / 2 - END_CHASE_PAD);
  if (end > 0) tx = Math.min(tx, endX);
  else tx = Math.max(tx, endX);
  const along = (tx - mouth) * end;
  const inCage =
    (along > -0.02 && along < GOAL_D + radius + 0.08 && Math.abs(tz) < clear - 0.05) ||
    resolveCage(tx, tz, radius, true).hit;
  if (inCage) {
    const deep = along > GOAL_D * 0.45;
    if (deep) {
      const back = Math.min(Math.max(along, GOAL_D + radius + 0.5), room);
      tx = mouth + end * back;
      if (Math.abs(tz) < clear) tz = side * clear;
    } else {
      tx = mouth - end * 0.4;
      tz = side * clear;
    }
  }
  return onIce(tx, tz, radius);
}

/**
 * Skate to a loose puck or a carrier behind the goal line.
 * Waypoints stay outside the posts. The last aim is the puck, led slightly,
 * and may sit past the goal line out to the end boards.
 */
function pursueAroundNet(
  s: Skater,
  px: number,
  pz: number,
  vx: number,
  vz: number,
  end: 1 | -1,
): { tx: number; tz: number } {
  const mouth = end * GOAL_LINE_X;
  const clear = cageClearZ(s.radius);
  const side = (Math.sign(pz) || Math.sign(s.z) || 1) as 1 | -1;
  const room = chaseRoom();
  const aim = aimPastGoal(px, pz, vx, vz, end, s.radius);
  if (
    !chasePathBlocked(s.x, s.z, aim.tx, aim.tz, s.radius) &&
    !resolveCage(aim.tx, aim.tz, s.radius, true).hit
  ) {
    return aim;
  }

  const past = (s.x - mouth) * end;
  const wide = Math.abs(s.z) >= clear - 0.3;
  const behindNet = past > GOAL_D + 0.12;
  const backPast = Math.min(GOAL_D + s.radius + 0.62, room);
  const flank = onIce(mouth - end * 0.4, side * clear, s.radius);
  const beside = onIce(mouth + end * backPast, side * clear, s.radius);

  if (behindNet) {
    const mySide = (Math.sign(s.z) || side) as 1 | -1;
    const depth = Math.min(room, Math.max(past, backPast, (px - mouth) * end));
    const deepX = mouth + end * depth;
    const atPuck = onIce(deepX, aim.tz, s.radius);
    if (
      !resolveCage(atPuck.tx, atPuck.tz, s.radius, true).hit &&
      !chasePathBlocked(s.x, s.z, atPuck.tx, atPuck.tz, s.radius)
    ) {
      return atPuck;
    }
    const hold = onIce(deepX, mySide * Math.max(clear, Math.abs(s.z)), s.radius);
    if (!chasePathBlocked(s.x, s.z, hold.tx, hold.tz, s.radius)) return hold;
    const cross = onIce(deepX, side * clear, s.radius);
    if (!chasePathBlocked(s.x, s.z, cross.tx, cross.tz, s.radius)) return cross;
    return hold;
  }

  if (!wide && past < GOAL_D * 0.35) {
    const nearFlank = Math.hypot(s.x - flank.tx, s.z - flank.tz) < 1.25;
    if (nearFlank && !chasePathBlocked(s.x, s.z, beside.tx, beside.tz, s.radius)) return beside;
    return flank;
  }
  if (!chasePathBlocked(s.x, s.z, beside.tx, beside.tz, s.radius)) return beside;
  return flank;
}

function retrieveAroundNet(s: Skater, puck: Puck, end: 1 | -1): { tx: number; tz: number } {
  return pursueAroundNet(s, puck.x, puck.z, puck.vx, puck.vz, end);
}

function clampRetrieve(tx: number, tz: number, end: 1 | -1): { tx: number; tz: number } {
  return clampLane(tx, tz, end, end);
}

function goalieOwnEnd(s: Skater): 1 | -1 {
  return (defendDir(s.side) >= 0 ? 1 : -1) as 1 | -1;
}

/** Positive when the goalie is past his goal line, toward the end boards. */
function goalieLineDepth(s: Skater): number {
  const end = goalieOwnEnd(s);
  return (s.x - end * GOAL_LINE_X) * end;
}

function goaliePostClear(s: Skater): number {
  return GOAL_W / 2 + s.radius + GOAL_PIPE_R + 0.32;
}

function goalieRouteBlocked(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  radius: number,
): boolean {
  if (segmentHitsCage(x0, z0, x1, z1)) return true;
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (resolveCage(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, radius, true).hit) return true;
  }
  return false;
}

function goalieAgainstCage(s: Skater): boolean {
  if (resolveCage(s.x, s.z, s.radius, true).hit) return true;
  const end = goalieOwnEnd(s);
  return goalieRouteBlocked(s.x, s.z, end * (GOAL_LINE_X - 0.85), 0, s.radius);
}

/** Boards side of the near post, just in front of the goal line. */
function shoveGoalieBoardsSide(s: Skater): void {
  const end = goalieOwnEnd(s);
  const mouth = end * GOAL_LINE_X;
  const side = (Math.sign(s.z) || Math.sign(world.puck.z) || 1) as 1 | -1;
  const ice = resolveRink(mouth - end * 0.5, side * (goaliePostClear(s) + 0.4), s.radius);
  s.x = ice.x;
  s.z = ice.z;
  const cage = resolveCage(s.x, s.z, s.radius, true);
  if (cage.hit) {
    const again = resolveRink(cage.x, cage.z, s.radius);
    s.x = again.x;
    s.z = again.z;
  }
  s.vx = 0;
  s.vz = 0;
}

function goalieOnPuckBehind(s: Skater): boolean {
  const puck = world.puck;
  if (puck.owner === s.id) return true;
  if (puck.owner !== null || world.stoppage || world.faceoff) return false;
  const end = goalieOwnEnd(s);
  if (puck.x * end <= GOAL_LINE_X - 0.08) return false;
  if (Math.hypot(puck.x - s.x, puck.z - s.z) > 1.7) return false;
  return !resolveCage(s.x, s.z, s.radius, true).hit;
}

/** True when he should abandon the net and skate to the crease. */
function keepGoalieOffNet(s: Skater, allowShove: boolean): boolean {
  if (s.kind !== "goalie") return false;
  const down = s.stun > 0.18 || s.struck > 0.18 || s.tumble !== 0;
  const behind = goalieLineDepth(s) > 0.05;
  if (!behind) {
    goalieBehindSince.delete(s.id);
    if (!down && goalieNetEscape.has(s.id) && !goalieOutOfCrease(s)) goalieNetEscape.delete(s.id);
  } else if (!down && goalieOnPuckBehind(s)) {
    goalieBehindSince.delete(s.id);
  } else if (!goalieBehindSince.has(s.id)) {
    goalieBehindSince.set(s.id, world.time);
  }
  const since = goalieBehindSince.get(s.id);
  const held = behind && since !== undefined ? world.time - since : 0;
  const mayShove =
    allowShove &&
    !down &&
    behind &&
    held >= GOALIE_END_HOLD &&
    !(world.whistle === "goal" && world.stoppageT < 1.22) &&
    !(world.faceoff && world.faceoffPhase !== "live");
  if (mayShove) {
    shoveGoalieBoardsSide(s);
    goalieBehindSince.delete(s.id);
    goalieNetEscape.add(s.id);
  }
  if (down) return false;
  return goalieNetEscape.has(s.id);
}

function goalieCreasePoint(s: Skater): { x: number; z: number } {
  const end = goalieOwnEnd(s);
  const mouth = end * GOAL_LINE_X;
  const creaseX = end * (GOAL_LINE_X - 0.85);
  const spot = { x: creaseX, z: 0 };
  const depth = (s.x - mouth) * end;
  const behind = depth > 0.05;
  const against = resolveCage(s.x, s.z, s.radius, true).hit;
  if (!behind && !against && !segmentHitsCage(s.x, s.z, spot.x, spot.z)) return spot;

  const post = goaliePostClear(s);
  const side = (Math.sign(s.z) || Math.sign(world.puck.z) || 1) as 1 | -1;
  const sideZ = side * post;
  // Outside the pipe counts as wide. The boards-side spot is further out, and the
  // cage will not let him stand on it while he is still on the goal line.
  const wide = Math.abs(s.z) >= GOAL_W / 2 + s.radius + GOAL_PIPE_R + 0.12;
  const maxDepth = RINK_L / 2 - GOAL_LINE_X - s.radius - 0.12;
  const backX = mouth + end * Math.min(Math.max(depth, GOAL_D + s.radius + 0.36), maxDepth);
  const flank = { x: creaseX, z: sideZ };
  const frontSide = { x: mouth - end * 0.42, z: sideZ };
  const candidates: { x: number; z: number }[] = [];
  if (!wide && behind) candidates.push({ x: s.x, z: sideZ });
  if (wide || !behind) candidates.push(flank);
  candidates.push(frontSide);
  if (behind) candidates.push({ x: backX, z: sideZ });
  if (!goalieRouteBlocked(s.x, s.z, spot.x, spot.z, s.radius)) candidates.push(spot);
  for (const c of candidates) {
    if (!goalieRouteBlocked(s.x, s.z, c.x, c.z, s.radius)) return c;
  }
  return { x: behind ? s.x : frontSide.x, z: sideZ };
}

/**
 * Loose-puck skates stop at the tops of the two end-zone circles.
 * Behind the goal line is a net retrieve and is left alone.
 * A puck already in the old near-net bubble may still be wider than the dots.
 */
function clampGoalieLooseSkate(s: Skater, tx: number, tz: number): { x: number; z: number } {
  const end = defendDir(s.side);
  const mouth = end * GOAL_LINE_X;
  const attack = attackDir(s.side);
  const from = (tx - mouth) * attack;
  if (from < 0.08) return { x: tx, z: tz };
  const top = goalieCircleTop();
  const x = from > top ? mouth + attack * top : tx;
  const puck = world.puck;
  const wideNear =
    Math.abs(puck.z) > FACEOFF_SPOT_Z + 0.05 &&
    Math.hypot(puck.x - mouth, puck.z) < 7.5 &&
    puck.x * end > BLUE_X - 2.5;
  if (wideNear) return { x, z: tz };
  const side = FACEOFF_SPOT_Z;
  const z = tz > side ? side : tz < -side ? -side : tz;
  return { x, z };
}

function goalieRetrievePoint(s: Skater): { x: number; z: number } {
  const end = (defendDir(s.side) >= 0 ? 1 : -1) as 1 | -1;
  const at = retrieveAroundNet(s, world.puck, end);
  return clampGoalieLooseSkate(s, at.tx, at.tz);
}

/**
 * Chest stays on the ice side of this goalie's own net.
 * A puck or skater in front may turn the shoulders. Nothing turns them into the cage.
 */
function orientGoalieOut(s: Skater, dt: number): void {
  if (s.dive > 0 || s.tumble !== 0 || s.stun > 0.08) return;
  const rest = faceYaw(s.side);
  const faceRest = () => {
    s.yaw = turnToward(s.yaw, -Math.sin(rest), -Math.cos(rest), 7, dt);
  };
  if (world.puck.owner === s.id) {
    faceRest();
    return;
  }
  const defend = defendDir(s.side);
  const mouth = defend * GOAL_LINE_X;
  const onIce = (x: number) => (mouth - x) * defend > -0.35;
  const puck = world.puck;
  let tx = s.x + attackDir(s.side);
  let tz = s.z;
  if (onIce(puck.x)) {
    tx = puck.x;
    tz = puck.z;
  } else {
    let best = Infinity;
    for (const o of world.skaters) {
      if (o.side === s.side || o.kind === "goalie" || !onIce(o.x)) continue;
      const d = Math.hypot(o.x - s.x, o.z - s.z);
      if (d < best) {
        best = d;
        tx = o.x;
        tz = o.z;
      }
    }
  }
  const want = turnToward(s.yaw, tx - s.x, tz - s.z, 6, dt);
  let dYaw = want - rest;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  dYaw = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, dYaw));
  s.yaw = turnToward(s.yaw, -Math.sin(rest + dYaw), -Math.cos(rest + dYaw), 7, dt);
}

function skateGoalieTo(s: Skater, tx: number, tz: number, dt: number): void {
  const mouth = defendDir(s.side) * GOAL_LINE_X;
  const attack = attackDir(s.side);
  const top = goalieCircleTop();
  let aimX = tx;
  let goalFrom = (aimX - mouth) * attack;
  if (goalFrom > top) {
    aimX = mouth + attack * top;
    goalFrom = top;
  }
  const aimZ = tz;
  const dx = aimX - s.x;
  const dz = aimZ - s.z;
  const d = Math.hypot(dx, dz) || 1;
  const here = (s.x - mouth) * attack;
  const room = Math.hypot(Math.max(0, goalFrom - here), aimZ - s.z);
  let mag = d < 0.28 ? 0 : 1;
  if (room < 1.35) mag = Math.min(mag, Math.max(0, room / 1.35));
  integrateSkater(s, dx / d, dz / d, mag, goalieOutOfCrease(s), dt);
  const after = (s.x - mouth) * attack;
  if (goalFrom >= top - 0.08 && after > goalFrom) {
    s.x = mouth + attack * goalFrom;
    const out = s.vx * attack;
    if (out > 0) s.vx -= attack * out;
  }
  if (Math.abs(Math.abs(aimZ) - FACEOFF_SPOT_Z) <= 0.04 && Math.abs(s.z) > FACEOFF_SPOT_Z) {
    const sign = Math.sign(s.z) || Math.sign(aimZ) || 1;
    s.z = sign * FACEOFF_SPOT_Z;
    if (s.vz * sign > 0) s.vz = 0;
  }
  orientGoalieOut(s, dt);
  keepInBowl(s);
}

function puckAtGoalieCircleTop(side: "home" | "away"): boolean {
  const puck = world.puck;
  if (puck.owner !== null || puck.y > 1.25) return false;
  const fromLine = goalieFromLine(side, puck.x);
  const top = goalieCircleTop();
  return fromLine >= -0.05 && fromLine <= top + 0.05 && Math.abs(puck.z) <= FACEOFF_SPOT_Z + 0.05;
}

/**
 * A circle-top chase must not coast past those tops on arrival.
 * Stick steering and a real knockdown are left alone.
 */
function sealGoalieCircleChases(userSteering: boolean): void {
  const top = goalieCircleTop();
  const sideLim = FACEOFF_SPOT_Z;
  for (const s of world.skaters) {
    if (s.kind !== "goalie" || !goalieCircleChase.has(s.id)) continue;
    if ((userSteering && s.id === world.userId) || s.tumble !== 0 || s.struck > 0.18) {
      goalieCircleChase.delete(s.id);
      continue;
    }
    const attack = attackDir(s.side);
    const mouth = defendDir(s.side) * GOAL_LINE_X;
    const here = (s.x - mouth) * attack;
    if (here > top) {
      s.x = mouth + attack * top;
      const out = s.vx * attack;
      if (out > 0) s.vx -= attack * out;
    }
    if (Math.abs(s.z) > sideLim) {
      const sign = Math.sign(s.z) || 1;
      s.z = sign * sideLim;
      if (s.vz * sign > 0) s.vz = 0;
    }
    const puck = world.puck;
    const chasing = puck.owner === s.id || (puck.owner === null && puckAtGoalieCircleTop(s.side));
    if (!chasing || (here < 2 && Math.abs(s.z) < 2)) goalieCircleChase.delete(s.id);
  }
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

/** Where a loose puck is a goalie play, before the chase roll. */
function goalieLooseGeometry(g: Skater): boolean {
  const puck = world.puck;
  if (puck.owner !== null || world.stoppage || world.faceoff) return false;
  if (g.stun > 0.12 || g.struck > 0.18 || g.tumble !== 0) return false;
  if (puck.y > 1.25) return false;
  const end = defendDir(g.side);
  const mouth = end * GOAL_LINE_X;
  const fromLine = goalieFromLine(g.side, puck.x);
  const behindLine = puck.x * end > GOAL_LINE_X - 0.08;
  const nearNet = Math.hypot(puck.x - mouth, puck.z) < 7.5 && puck.x * end > BLUE_X - 2.5;
  // Either circle top: out to 20 ft + radius, and only as wide as those tops.
  const atCircleTop =
    fromLine >= -0.05 &&
    fromLine <= goalieCircleTop() + 0.05 &&
    Math.abs(puck.z) <= FACEOFF_SPOT_Z + 0.05;
  const spd = Math.hypot(puck.vx, puck.vz);
  if (!behindLine && !nearNet && !atCircleTop) return false;
  if (!behindLine && (spd > 6.5 || (puck.vx * end > 4.5 && spd > 7))) return false;
  return true;
}

function goaliePlayLoose(g: Skater): boolean {
  if (!goalieLooseGeometry(g)) return false;
  const puck = world.puck;
  const end = defendDir(g.side);
  const behindLine = puck.x * end > GOAL_LINE_X - 0.08;
  const spd = Math.hypot(puck.vx, puck.vz);
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

/**
 * The user is steering at a loose puck. Idle chases use goalieLooseSkate.
 * This does not call goaliePlayLoose, so the chase roll stays where it was.
 */
function goalieUserChasingLoose(s: Skater): boolean {
  if (s.id !== world.userId || s.kind !== "goalie") return false;
  if (!goalieLooseGeometry(s)) return false;
  const puck = world.puck;
  const dx = puck.x - s.x;
  const dz = puck.z - s.z;
  const dist = Math.hypot(dx, dz);
  const spd = Math.hypot(s.vx, s.vz);
  if (spd >= 0.75 && dist > 0.2) {
    const toward = (s.vx * dx + s.vz * dz) / (spd * dist);
    if (toward > 0.28) return true;
  }
  return spd < 0.75 && goalieOutOfCrease(s) && dist < 5 && dist > 0.2;
}

function goalieFar(s: Skater): boolean {
  if (s.tumble !== 0 || s.struck > 0.18 || s.stun > 0.08) return true;
  return goalieOutOfCrease(s);
}

/** Loose 0.75, carrying 0.5. Applied once on every goalie skate cap. */
function goaliePace(s: Skater): number {
  return world.puck.owner === s.id ? 0.5 : 0.75;
}

function goalieSkateCap(s: Skater): number {
  const mul = s.side === "home" ? userMul("off") : cpuMul("off");
  return WINGER_BURST * (s.id === world.userId ? 1.14 : 0.9) * mul * goaliePace(s);
}

/**
 * Latched at the dive press so the slide can turn yaw without flipping the pose.
 * skaterLocal +X is the goalie's left. Facing +X (yaw −π/2), world +Z is lx −1,
 * the blocker side. goalieDivingStickSave leans left (body x > 0).
 * goalieDivingGloveSave leans right, onto the blocker.
 */
const goalieDiveSave = new Map<number, "goalieDivingStickSave" | "goalieDivingGloveSave">();

function goalieDivePoseFor(s: Skater, dx: number, dz: number): "goalieDivingStickSave" | "goalieDivingGloveSave" {
  let lx = 0;
  if (Math.hypot(dx, dz) > 0.05) lx = skaterLocal(s, s.x + dx, s.z + dz).lx;
  if (Math.abs(lx) < 0.08) lx = skaterLocal(s, world.puck.x, world.puck.z).lx;
  return lx >= 0 ? "goalieDivingStickSave" : "goalieDivingGloveSave";
}

function noteGoalieDiveSide(s: Skater, dx: number, dz: number): void {
  goalieDiveSave.set(s.id, goalieDivePoseFor(s, dx, dz));
}

/** Pose for a goalie whose dive is already running. */
export function goalieDiveSavePose(s: Skater): "goalieDivingStickSave" | "goalieDivingGloveSave" {
  const held = goalieDiveSave.get(s.id);
  if (held) return held;
  const posed = goalieDivePoseFor(s, s.vx, s.vz);
  goalieDiveSave.set(s.id, posed);
  return posed;
}

function decayGoalieDown(s: Skater, dt: number): void {
  s.stun = Math.max(0, s.stun - dt);
  if (s.struck > 0) s.struck = Math.max(0, s.struck - dt);
  if (s.tumble !== 0) {
    const u = Math.max(0, (s.struck - 0.14) / 1.54);
    const sign = Math.sign(s.tumble) || 1;
    s.tumble = sign * Math.min(Math.abs(s.tumble), 1.3 * u);
    if (u <= 0) {
      s.tumble = 0;
      s.tumbleSpin = 0;
    }
  }
  syncCheckCycle(s);
}

function skateGoalieBack(s: Skater, dt: number): void {
  const spot = goalieCreasePoint(s);
  skateGoalieTo(s, spot.x, spot.z, dt);
}

/**
 * Cage post sweep in bouncePuckCage. About a pipe width: a center inside this
 * of the post is iron. Anything wider is a miss the goalie may watch.
 */
const POST_HIT_R = 0.11;

type PostContact = { zPost: number; y: number };

let postMemoKey = "";
const postMemo = new Map<number, PostContact | null>();

/** Where the pad stacks on a post: body just inside the pipe, still in front of the line. */
function postSaveAnchor(g: Skater, zPost: number): { x: number; z: number } {
  const end = goalieOwnEnd(g);
  const mouth = end * GOAL_LINE_X;
  const pad = 0.36 * (g.side === "home" ? 1.22 : 0.88);
  const sign = Math.sign(zPost) || 1;
  const z = sign * Math.min(Math.abs(zPost) - pad, GOAL_W / 2 - 0.08);
  return { x: mouth - end * 0.62, z };
}

/**
 * Shot path that meets a post, including a high corner.
 * A clear miss outside the pipe returns null.
 * A crossbar that is not on a post is barContact, not this sweep.
 * Same horizontal step as stepPuck so the call and the collision agree.
 */
function postContact(side: 1 | -1): PostContact | null {
  const puck = world.puck;
  const key = [
    world.time,
    puck.owner ?? -1,
    puck.x,
    puck.y,
    puck.z,
    puck.vx,
    puck.vy,
    puck.vz,
    world.lastShoot,
    world.lastShooter ?? -1,
    world.lastPass,
    world.reboundSoft ? 1 : 0,
  ].join("|");
  if (key !== postMemoKey) {
    postMemoKey = key;
    postMemo.clear();
  }
  if (postMemo.has(side)) return postMemo.get(side) ?? null;
  const hit = findPostContact(side);
  postMemo.set(side, hit);
  return hit;
}

function findPostContact(side: 1 | -1): PostContact | null {
  const puck = world.puck;
  if (puck.owner !== null || world.whistle || world.stoppage || world.goalBank) return null;
  if (!shotAtThisNet(side) || puck.vx * side < 4.5) return null;
  const mouth = side * GOAL_LINE_X;
  const along0 = (mouth - puck.x) * side;
  if (along0 < -0.25 || along0 > 48) return null;
  let x = puck.x;
  let y = puck.y;
  let z = puck.z;
  let vx = puck.vx;
  let vy = puck.vy;
  let vz = puck.vz;
  const hw = GOAL_W / 2;
  const dt = 1 / 60;
  const steps = Math.min(150, Math.ceil(along0 / Math.max(3, puck.vx * side) / dt) + 8);
  const soft = world.reboundSoft;
  for (let i = 0; i < steps; i++) {
    const px = x;
    const py = y;
    const pz = z;
    x += vx * dt;
    z += vz * dt;
    y += vy * dt;
    vy -= 12 * dt;
    if (y <= PUCK_Y) {
      y = PUCK_Y;
      if (soft) {
        if (vy < 0) vy *= -0.06;
        if (Math.abs(vy) < 0.55) vy = 0;
        vx *= 0.62;
        vz *= 0.62;
      } else {
        if (vy < 0) vy *= -0.28;
        if (Math.abs(vy) < 0.4) vy = 0;
      }
    }
    const damp = Math.exp((soft ? -1.85 : -PUCK_DRAG) * dt);
    vx *= damp;
    vz *= damp;
    for (const zPost of [hw, -hw]) {
      const swept = segmentCircle(px, pz, x, z, mouth, zPost, POST_HIT_R);
      if (!swept) continue;
      const yHit = py + (y - py) * swept.t;
      if (yHit > GOAL_H + 0.08 || yHit < -0.02) continue;
      return { zPost, y: yHit };
    }
    if ((px - mouth) * side < 0.2 && (x - mouth) * side > 0.28) break;
    if (Math.hypot(vx, vz) < 2.2) break;
  }
  return null;
}

/** Butterfly or slide onto the post. Does not stop because the puck will ding. */
function slideGoalieToPost(s: Skater, zPost: number, dt: number): void {
  const spot = postSaveAnchor(s, zPost);
  const dx = spot.x - s.x;
  const dz = spot.z - s.z;
  const dist = Math.hypot(dx, dz);
  const rate = s.side === "home" ? 7.2 : 6.4;
  const step = Math.min(dist, rate * dt);
  if (dist > 1e-5) {
    s.x += (dx / dist) * step;
    s.z += (dz / dist) * step;
  }
  s.trackZ = spot.z;
  s.trackVz = 0;
  s.vx = 0;
  s.vz = 0;
  s.lean = 0.26;
  const onBlocker = (Math.sign(zPost) || 1) === (attackDir(s.side) > 0 ? 1 : -1);
  if (onBlocker) {
    s.lPad = Math.max(s.lPad, 0.62);
    s.poke = Math.max(s.poke, 0.46);
  } else {
    s.rPad = Math.max(s.rPad, 0.62);
  }
  collideSkater(s);
  const rest = faceYaw(s.side);
  s.yaw = turnToward(s.yaw, -Math.sin(rest), -Math.cos(rest), 6, dt);
}

type BarContact = { z: number; y: number };

let barMemoKey = "";
const barMemo = new Map<number, BarContact | null>();

/**
 * Body just in front of the crossbar, inside the posts.
 * Same depth as the post stack: not clamped to crease zMax.
 */
function barSaveAnchor(g: Skater, zBar: number): { x: number; z: number } {
  const end = goalieOwnEnd(g);
  const mouth = end * GOAL_LINE_X;
  const hw = GOAL_W / 2 - 0.2;
  const z = Math.max(-hw, Math.min(hw, zBar));
  return { x: mouth - end * 0.62, z };
}

/**
 * Shot path that meets the crossbar.
 * A clear miss over the bar returns null, so the goalie may keep watching.
 * Same step as findPostContact and stepPuck. A post is not this sweep.
 */
function barContact(side: 1 | -1): BarContact | null {
  const puck = world.puck;
  const key = [
    world.time,
    puck.owner ?? -1,
    puck.x,
    puck.y,
    puck.z,
    puck.vx,
    puck.vy,
    puck.vz,
    world.lastShoot,
    world.lastShooter ?? -1,
    world.lastPass,
    world.reboundSoft ? 1 : 0,
  ].join("|");
  if (key !== barMemoKey) {
    barMemoKey = key;
    barMemo.clear();
  }
  if (barMemo.has(side)) return barMemo.get(side) ?? null;
  const hit = findBarContact(side);
  barMemo.set(side, hit);
  return hit;
}

function findBarContact(side: 1 | -1): BarContact | null {
  const puck = world.puck;
  if (puck.owner !== null || world.whistle || world.stoppage || world.goalBank) return null;
  if (!shotAtThisNet(side) || puck.vx * side < 4.5) return null;
  const mouth = side * GOAL_LINE_X;
  const along0 = (mouth - puck.x) * side;
  if (along0 < -0.25 || along0 > 48) return null;
  let x = puck.x;
  let y = puck.y;
  let z = puck.z;
  let vx = puck.vx;
  let vy = puck.vy;
  let vz = puck.vz;
  const hw = GOAL_W / 2;
  const dt = 1 / 60;
  const steps = Math.min(150, Math.ceil(along0 / Math.max(3, puck.vx * side) / dt) + 8);
  const soft = world.reboundSoft;
  const barRad = CROSSBAR_R + PUCK_R;
  for (let i = 0; i < steps; i++) {
    const px = x;
    const py = y;
    const pz = z;
    x += vx * dt;
    z += vz * dt;
    y += vy * dt;
    vy -= 12 * dt;
    if (y <= PUCK_Y) {
      y = PUCK_Y;
      if (soft) {
        if (vy < 0) vy *= -0.06;
        if (Math.abs(vy) < 0.55) vy = 0;
        vx *= 0.62;
        vz *= 0.62;
      } else {
        if (vy < 0) vy *= -0.28;
        if (Math.abs(vy) < 0.4) vy = 0;
      }
    }
    const damp = Math.exp((soft ? -1.85 : -PUCK_DRAG) * dt);
    vx *= damp;
    vz *= damp;
    const swept = segmentCircle(px, py, x, y, mouth, GOAL_H, barRad);
    if (swept) {
      const zHit = pz + (z - pz) * swept.t;
      if (Math.abs(zHit) <= hw + 0.02) return { z: zHit, y: GOAL_H };
    }
    if ((px - mouth) * side < 0.2 && (x - mouth) * side > 0.28) break;
    if (Math.hypot(vx, vz) < 2.2) break;
  }
  return null;
}

/** Slide onto the crossbar. No poke: that flare must not beat the inbound save. */
function slideGoalieToBar(s: Skater, zBar: number, dt: number): void {
  const spot = barSaveAnchor(s, zBar);
  const dx = spot.x - s.x;
  const dz = spot.z - s.z;
  const dist = Math.hypot(dx, dz);
  const rate = s.side === "home" ? 7.2 : 6.4;
  const step = Math.min(dist, rate * dt);
  if (dist > 1e-5) {
    s.x += (dx / dist) * step;
    s.z += (dz / dist) * step;
  }
  s.trackZ = spot.z;
  s.trackVz = 0;
  s.vx = 0;
  s.vz = 0;
  s.lean = 0.26;
  s.lPad = Math.max(s.lPad, 0.55);
  s.rPad = Math.max(s.rPad, 0.55);
  collideSkater(s);
  const rest = faceYaw(s.side);
  s.yaw = turnToward(s.yaw, -Math.sin(rest), -Math.cos(rest), 6, dt);
}

/** Up-ice aim for a CPU goalie who is not using the camera stick. */
function cpuGoalieUpIce(s: Skater): { ax: number; az: number } {
  const attack = attackDir(s.side);
  const foe = nearestFoe(s).foe;
  let az = 0;
  if (foe && Math.abs(foe.z - s.z) < 8) az = foe.z >= s.z ? -0.42 : 0.42;
  const m = Math.hypot(attack, az) || 1;
  return { ax: attack / m, az: az / m };
}

/** Empty net, or a quiet lane in front of the far goalie. */
function cpuGoalieShotLook(s: Skater): boolean {
  const attack = attackDir(s.side);
  if (!opposingGoalie(s.side)) return Math.abs(s.z) < 14;
  if (Math.abs(s.z) > 10) return false;
  const netX = attack * GOAL_LINE_X;
  const span = (netX - s.x) * attack;
  let lane = 0;
  for (const o of world.skaters) {
    if (o.side === s.side || o.kind === "goalie") continue;
    const along = (o.x - s.x) * attack;
    if (along < 3 || along > span - 1) continue;
    if (Math.abs(o.z) > 7) continue;
    lane++;
  }
  return lane <= 1;
}

function takeCpuGoaliePlay(
  outlet: number,
  sauce: number,
  clear: number,
  shot: number,
): "outlet" | "sauce" | "clear" | "shot" {
  const w = [outlet, sauce, clear, shot].map((n) => Math.max(0, n));
  const sum = w[0]! + w[1]! + w[2]! + w[3]! || 1;
  let roll = Math.random() * sum;
  if ((roll -= w[0]!) <= 0) return "outlet";
  if ((roll -= w[1]!) <= 0) return "sauce";
  if ((roll -= w[2]!) <= 0) return "clear";
  return "shot";
}

function finishCpuGoaliePass(s: Skater, mateId: number | null): void {
  world.lastPass = world.time;
  world.lastPasser = s.id;
  world.lastPassX = s.x;
  world.lastPassZ = s.z;
  world.coverT = 0;
  s.coverPose = 0;
  if (mateId !== null) pausePassChainHold(s.id);
  else stopPassChainHold(s.id);
  noteGoaliePlayRelease(s);
}

/** Full saucer: tape to an open teammate, or up the open ice when nobody is there. */
function cpuGoalieSauce(s: Skater): void {
  const mate = clearPassTarget(s, attackDir(s.side), 0, false);
  withChargedPass(
    PASS_FULL_HOLD,
    true,
    SAUCE_FULL_HOLD,
    () => {
      if (mate) tapePass(s, mate, true);
      else {
        s.yaw = faceYaw(s.side);
        const aim = cpuGoalieUpIce(s);
        freeAimToLane(s, aim.ax, aim.az, true, true);
      }
    },
    true,
    false,
  );
  finishCpuGoaliePass(s, mate ? mate.id : world.lastPassTo);
}

/** Full-charge dump. Higher than a saucer, and it does not hunt a teammate. */
function cpuGoalieHighClear(s: Skater): void {
  s.yaw = faceYaw(s.side);
  withChargedPass(
    PASS_FULL_HOLD,
    true,
    SAUCE_CLEAR_HOLD,
    () => {
      launchHighClear(s, 0, 0);
    },
    true,
    true,
  );
  stopPassChainHold(s.id);
}

/** Same full-rink lob the user goalie fires on a straight shot. */
function cpuGoalieLengthShot(s: Skater): void {
  s.yaw = faceYaw(s.side);
  const prev = chargedPassPower;
  chargedPassPower = goalieShotChargeMps(SHOT_FULL_HOLD);
  try {
    goalieLengthPlay(s, { flip: true, bank: 0, high: true });
  } finally {
    chargedPassPower = prev;
  }
  s.windup = 0;
  s.follow = 0.2;
}

/**
 * One release once the away CPU goalie is allowed to play the puck.
 * Outlet stays the usual play. Sauce, a high clear, and a length shot
 * take the rest, weighted by pressure, a teammate, and how long he has held it.
 */
function playCpuGoaliePuck(s: Skater, crash: number): void {
  const veryOpen = !Number.isFinite(crash) || crash > 3.8;
  const mate = clearPassTarget(s, attackDir(s.side), 0, false);
  const mateDist = mate ? Math.hypot(mate.x - s.x, mate.z - s.z) : 99;
  const mateRoom = mate ? nearestFoe(mate).d : 0;
  const goodTarget = !!mate && mateRoom >= 3.2;
  const stretch = goodTarget && mateDist >= 15;
  const pressed = !veryOpen || nearestFoe(s).d < 4.5;
  const looked = Math.min(1, Math.max(0, (world.coverT - GOALIE_HOLD) / 0.85));
  const shotLook = cpuGoalieShotLook(s);

  // A free teammate keeps the outlet. Pressure or a long look adds the clear.
  // No teammate is when the saucer, the high clear, and the length shot take over.
  let outlet = 0.56;
  let sauce = 0.26;
  let clear = 0.06;
  let shot = 0.12;
  if (goodTarget && pressed) {
    outlet = 0.4;
    sauce = 0.22;
    clear = 0.26;
    shot = 0.12;
  } else if (goodTarget && stretch) {
    outlet = 0.34;
    sauce = 0.36;
    clear = 0.12;
    shot = 0.18;
  } else if (!goodTarget && (pressed || looked > 0.45)) {
    outlet = 0.16;
    sauce = 0.18;
    clear = 0.42;
    shot = 0.24;
  } else if (!goodTarget) {
    outlet = 0.22;
    sauce = 0.3;
    clear = 0.16;
    shot = 0.32;
  }
  if (shotLook) {
    shot += 0.08;
    outlet -= 0.04;
    clear -= 0.04;
  } else {
    const keep = shot * 0.22;
    const moved = shot - keep;
    shot = keep;
    outlet += moved * 0.45;
    sauce += moved * 0.2;
    clear += moved * 0.35;
  }
  if (looked > 0.45 && pressed) {
    clear += 0.1;
    outlet = Math.max(0, outlet - 0.1);
  }

  const play = takeCpuGoaliePlay(outlet, sauce, clear, shot);
  if (play === "sauce") cpuGoalieSauce(s);
  else if (play === "clear") cpuGoalieHighClear(s);
  else if (play === "shot") cpuGoalieLengthShot(s);
  else doGoalieOutlet(s, 0, 0, veryOpen);
}

function thinkGoalie(s: Skater, dt: number): void {
  if (s.dive > 0) {
    const sp = Math.hypot(s.vx, s.vz);
    const dx = sp > 0.2 ? s.vx / sp : 0;
    const dz = sp > 0.2 ? s.vz / sp : 0;
    integrateSkater(s, dx, dz, sp > 0.2 ? 1 : 0, false, dt);
    return;
  }
  if (s.id !== world.userId) goalieLooseSkate.delete(s.id);
  const netX = defendDir(s.side) * (GOAL_LINE_X - 0.85);
  const puck = world.puck;
  const holder = puck.owner !== null ? world.skaters[puck.owner] : null;
  const attackOnMe = holder && holder.side !== s.side;
  const home = s.side === "home";
  const far = s.id !== world.userId && goalieFar(s);
  if (home && s.id !== world.userId && world.goalieRecallT > 0) {
    const shotAt = !holder && Math.hypot(puck.vx, puck.vz) > 5.5 && puck.vx * defendDir(s.side) > 5;
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

  if (keepGoalieOffNet(s, true)) {
    skateGoalieBack(s, dt);
    return;
  }

  if (s.id !== world.userId && home && puck.owner !== s.id && chaseDumpIn(s, dt)) {
    goalieLooseSkate.add(s.id);
    return;
  }

  if (puck.owner === s.id) {
    if (s.gloveFlash > 0.12) {
      collideSkater(s);
      keepInBowl(s);
      return;
    }
    const crash = creaseCrash(s);
    const open = !Number.isFinite(crash) || crash > 2.15;
    if (
      s.side === "away" &&
      s.id !== world.userId &&
      open &&
      world.coverT >= GOALIE_HOLD &&
      world.time - world.lastPass > 0.16
    ) {
      s.coverPose += (0 - s.coverPose) * Math.min(1, 10 * dt);
      playCpuGoaliePuck(s, crash);
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

  const ironPlay = ironThreat(goalieOwnEnd(s));
  if (ironPlay) {
    if (ironPlay.kind === "post") slideGoalieToPost(s, ironPlay.z, dt);
    else slideGoalieToBar(s, ironPlay.z, dt);
    return;
  }

  if (goaliePlayLoose(s)) {
    goalieLooseSkate.add(s.id);
    if (puckAtGoalieCircleTop(s.side)) goalieCircleChase.add(s.id);
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
  const shotAtMe = !holder && Math.hypot(puck.vx, puck.vz) > 5.5 && puck.vx * defendDir(s.side) > 5;
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
  const def = defendDir(s.side);
  const endLine = def * GOAL_LINE_X;
  const behind = puck.x * def > GOAL_LINE_X - 0.12;
  if (s.id !== world.userId && behind) {
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
    orientGoalieOut(s, dt);
    if (s.id !== world.userId) {
      s.z = Math.max(-zMax, Math.min(zMax, s.z));
      s.trackZ = Math.max(-zMax, Math.min(zMax, s.trackZ));
    }
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
  if (periodEndLive()) return;
  g.poke = 0.42;
  const dx = holder.x - g.x;
  const dz = holder.z - g.z;
  const d = Math.hypot(dx, dz) || 1;
  const out = defendDir(g.side);
  noteRelease("poke", g);
  launchPuck(
    holder,
    out * -(10 + Math.random() * 4) + (dx / d) * 2.2,
    (dz / d) * 6 + (Math.random() - 0.5) * 5,
    1.1 + Math.random() * 0.7,
  );
  holder.stun = 0.28;
  holder.struck = 0.16;
  world.lastPass = world.time;
  world.lastShoot = world.time;
  world.goalieSaveT = world.time;
  stickLooseUntil = world.time + 0.3;
  stickLooseBy = g.id;
  stickLooseFrom = holder.id;
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
  if (periodEndLive()) {
    if (s.kind === "goalie") {
      integrateSkater(s, 0, 0, 0, false, dt);
      keepInBowl(s);
    }
    return { wx: 0, wz: 0, mag: 0, burst: false };
  }
  if (s.kind === "goalie") {
    thinkGoalie(s, dt);
    return { wx: 0, wz: 0, mag: 0, burst: false };
  }
  const drillCpu = cpuDrillShooter();
  if (drillCpu && s.id === drillCpu.id) {
    holdCpuDrillSpot(s);
    if (world.puck.owner === s.id && !world.drillWon && !world.faceoff && !world.stoppage) {
      shootAtNet(s);
    }
    holdCpuDrillSpot(s);
    return { wx: 0, wz: 0, mag: 0, burst: false };
  }
  const bitten = dekeMissWish(s);
  if (bitten) return bitten;
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
  refreshCpuBackskate(s);
  if (periodEndLive()) return;
  if (dekeCommitBlocks(s.id)) {
    disarmDekeBite(s);
    return;
  }
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
    // Perpendicular distance to the puck → net-mouth line. Puck (0, 0), mouth
    // (10, 0), defender (5, 1) is 1 m off that line.
    const abx = netX - puck.x;
    const abz = -puck.z;
    const ab = Math.hypot(abx, abz);
    const lateral =
      ab < 1e-4
        ? Math.hypot(s.x - puck.x, s.z - puck.z)
        : Math.abs((s.x - puck.x) * abz - (s.z - puck.z) * abx) / ab;
    const depth = (netX - s.x) * attack;
    const puckDepth = (netX - puck.x) * attack;
    const lane = lateral <= 1 && depth > 0.25 && depth < 13 && depth < puckDepth;
    const dPuck = Math.hypot(s.x - puck.x, s.z - puck.z);
    const diveP = s.side === "away" ? 0.48 * cpuMul("def") : userIdle() ? 0.05 : 0.2;
    if (toward && lane && dPuck < 4.4 && sinceShot < 0.12 && Math.random() < diveP) {
      s.dive = 1.5;
      s.poke = 0.52;
      const sp = Math.hypot(s.vx, s.vz);
      if (sp > 0.2) s.yaw = Math.atan2(-s.vx / sp, -s.vz / sp);
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

/** yaw+π frame shared by skaterXZ and its inverse. ry = π/2: local +Z is world +X. */
function yawBasis(yaw: number): { c: number; sn: number } {
  const ry = yaw + Math.PI;
  return { c: Math.cos(ry), sn: Math.sin(ry) };
}

function skaterXZ(s: Skater, lx: number, lz: number): { x: number; z: number } {
  const { c, sn } = yawBasis(s.yaw);
  return { x: s.x + lx * c + lz * sn, z: s.z - lx * sn + lz * c };
}

function skaterLocal(s: Skater, x: number, z: number): { lx: number; lz: number } {
  const { c, sn } = yawBasis(s.yaw);
  const dx = x - s.x;
  const dz = z - s.z;
  return { lx: dx * c - dz * sn, lz: dx * sn + dz * c };
}

export type GoalieZKind = "upright" | "perimeter" | "mid" | "butterfly";

/**
 * A shot still traveling at this goalie's net. That pose is the blocker save, not mid,
 * unless the compact butterfly owns this spot.
 * No clock cutoff: a shot from the neutral zone is still a shot after it crosses the blue line.
 * Speed and direction drop it once the puck is no longer in flight at this net.
 */
export function goalieShotSave(s: Skater): boolean {
  if (s.kind !== "goalie") return false;
  const puck = world.puck;
  if (puck.owner !== null) return false;
  if (world.lastShooter === null || world.lastShooter === s.id) return false;
  if (world.lastPass > world.lastShoot) return false;
  if (Math.hypot(puck.vx, puck.vz) < 7) return false;
  return puck.vx * defendDir(s.side) > 5;
}

/**
 * Where this shot crosses the goal line, with the same step as the post sweep.
 * A top corner there is the raised blocker or glove, not the compact butterfly.
 */
function shotGoalLineSample(s: Skater): { y: number; z: number } | null {
  if (!goalieShotSave(s)) return null;
  const puck = world.puck;
  const end = (defendDir(s.side) > 0 ? 1 : -1) as 1 | -1;
  const mouth = end * GOAL_LINE_X;
  const along0 = (mouth - puck.x) * end;
  if (along0 < -0.35 || along0 > 40) return null;
  let x = puck.x;
  let y = puck.y;
  let z = puck.z;
  let vx = puck.vx;
  let vy = puck.vy;
  let vz = puck.vz;
  const dt = 1 / 60;
  const steps = Math.min(140, Math.ceil(along0 / Math.max(3, puck.vx * end) / dt) + 6);
  const soft = world.reboundSoft;
  for (let i = 0; i < steps; i++) {
    const px = x;
    const py = y;
    const pz = z;
    x += vx * dt;
    z += vz * dt;
    y += vy * dt;
    vy -= 12 * dt;
    if (y <= PUCK_Y) {
      y = PUCK_Y;
      if (soft) {
        if (vy < 0) vy *= -0.06;
        if (Math.abs(vy) < 0.55) vy = 0;
        vx *= 0.62;
        vz *= 0.62;
      } else {
        if (vy < 0) vy *= -0.28;
        if (Math.abs(vy) < 0.4) vy = 0;
      }
    }
    const damp = Math.exp((soft ? -1.85 : -PUCK_DRAG) * dt);
    vx *= damp;
    vz *= damp;
    if ((px - mouth) * end <= 0 && (x - mouth) * end >= 0) {
      const span = x - px || 1;
      const u = (mouth - px) / span;
      return { y: py + (y - py) * u, z: pz + (z - pz) * u };
    }
    if (Math.hypot(vx, vz) < 2.2) break;
  }
  return null;
}

/** Top corner on the blocker or the glove. Positive towardBlocker is the stick side. */
export function shotTopCornerHand(s: Skater): "blocker" | "glove" | null {
  const at = shotGoalLineSample(s);
  if (!at) return null;
  const blockerDir = attackDir(s.side) > 0 ? 1 : -1;
  const toward = (at.z - s.z) * blockerDir;
  if (!goalieRaisedHandCovers(at.y, toward)) return null;
  return toward > 0 ? "blocker" : "glove";
}

function shotAimsTopCorner(s: Skater): boolean {
  return shotTopCornerHand(s) !== null;
}

/** Low slot in front of this net. The rest of the defending zone stays mid. */
const HIGH_DANGER_DEPTH = 4.9;
const HIGH_DANGER_HALF = 3.15;

function puckInHighDanger(side: "home" | "away"): boolean {
  const from = goalieFromLine(side, world.puck.x);
  if (from < -0.12 || from > HIGH_DANGER_DEPTH) return false;
  return Math.abs(world.puck.z) <= HIGH_DANGER_HALF;
}

/**
 * Compact butterfly. This end only: not the neutral zone, not the far end.
 * High danger is the low slot. A rebound or iron keeps it for the scramble
 * even when the puck slides out of that slot, until it leaves the end.
 */
function goalieCompactButterfly(s: Skater): boolean {
  if (s.kind !== "goalie") return false;
  if (s.dive > 0.04 || s.tumble !== 0 || s.celebrate > 0.05) return false;
  if (world.stoppage || world.faceoff || world.goalieShot !== null) return false;
  if (world.puck.owner === s.id) return false;
  const end = defendDir(s.side) > 0 ? 1 : -1;
  if (zoneAtX(world.puck.x) !== end) return false;
  if (puckInHighDanger(s.side)) return true;
  const sinceSave = world.time - world.goalieSaveT;
  if (world.reboundN >= 1 && sinceSave >= 0 && sinceSave < 2.6) return true;
  const sinceIron = world.time - ironStanceT;
  if (ironStanceEnd === end && sinceIron >= 0 && sinceIron < 2.6) return true;
  return false;
}

/**
 * A crossbar on this net. Same flight gates as barContact, not the 7 m/s shot-save cutoff,
 * so a slowing long shot still holds the raised save. A miss over the bar is not a threat.
 */
export function shotThreatensBar(s: Skater): boolean {
  if (s.kind !== "goalie") return false;
  return barContact(goalieOwnEnd(s)) !== null;
}

type IronThreat = { kind: "bar" | "post"; z: number; y: number };

/**
 * Iron the shot was aimed at, before the thin bar sweep agrees.
 * A long shot tagged for the crossbar or a post is played from the release.
 */
function launchedIron(side: 1 | -1): IronThreat | null {
  const aimed = shotIron;
  if (!aimed) return null;
  const puck = world.puck;
  if (puck.owner !== null || world.whistle || world.stoppage || world.goalBank) return null;
  if (!shotAtThisNet(side) || puck.vx * side < 4.5) return null;
  const mouth = side * GOAL_LINE_X;
  const along = (mouth - puck.x) * side;
  if (along < -0.25 || along > 48) return null;
  if (aimed.kind === "post") {
    return { kind: "post", z: (Math.sign(aimed.z) || 1) * (GOAL_W / 2), y: aimed.y };
  }
  return { kind: "bar", z: aimed.z, y: GOAL_H };
}

/** Crossbar or post this shot will meet. A clear miss stays null so the goalie can watch it. */
function ironThreat(side: 1 | -1): IronThreat | null {
  const post = postContact(side);
  if (post) return { kind: "post", z: post.zPost, y: post.y };
  const bar = barContact(side);
  if (bar) return { kind: "bar", z: bar.z, y: GOAL_H };
  return launchedIron(side);
}

const IRON_WATCH_IN = 0.38;

function pickIronPose(s: Skater, threat: IronThreat): string {
  const blockerDir = attackDir(s.side) > 0 ? 1 : -1;
  const toward = (threat.z - s.z) * blockerDir;
  if (threat.kind === "bar" && Math.abs(toward) < 0.28) return "goalieUpright";
  const glove = toward < 0;
  const high = threat.kind === "bar" || threat.y >= GOAL_H * 0.62;
  if (high) return glove ? "goalieUprightGlove" : "goalieUprightBlocker";
  return glove ? "goalieGloveSave" : "goalieBlockerSave";
}

/**
 * Upright, glove save, blocker save, upright glove, or upright blocker.
 * Not the butterfly. Latched for the shot.
 */
export function ironDefensePose(s: Skater): string | null {
  if (s.kind !== "goalie") return null;
  const threat = ironThreat(goalieOwnEnd(s));
  if (!threat) {
    ironPoseLatch.delete(s.id);
    return null;
  }
  const prev = ironPoseLatch.get(s.id);
  if (prev && prev.shoot === world.lastShoot) return prev.pose;
  const pose = pickIronPose(s, threat);
  ironPoseLatch.set(s.id, { shoot: world.lastShoot, pose });
  return pose;
}

function ironAnchor(g: Skater, kind: "post" | "bar", zHit: number): { x: number; z: number } {
  if (kind === "bar") return barSaveAnchor(g, zHit);
  return postSaveAnchor(g, (Math.sign(zHit) || 1) * (GOAL_W / 2));
}

/** Standing still off the iron. A slide or a goalie already on the anchor is a play, not a watch. */
export function ironWasWatched(side: 1 | -1, kind: "post" | "bar", zHit: number): boolean {
  const g = defendingGoalie(side);
  if (!g || g.tumble !== 0 || g.struck > 0.45 || g.dive > 0.04) return false;
  const spot = ironAnchor(g, kind, zHit);
  if (Math.hypot(g.x - spot.x, g.z - spot.z) <= 0.42) return false;
  if (g.lean > 0.2) return false;
  return true;
}

/** A passive watch sometimes comes off the iron and in. An attempt keeps the normal fate. */
export function deflectIronIn(watched: boolean, fate: IronFate, roll: number): IronFate {
  if (watched && fate !== "in" && roll < IRON_WATCH_IN) return "in";
  return fate;
}

/**
 * Raised blocker save, or a full butterfly with the hands at the posts.
 * A top-corner shot uses this instead of the compact butterfly.
 * Iron uses the upright family, or the glove and blocker saves. Not a sit-and-watch butterfly.
 * Other shots in flight still use it, except in the compact-butterfly window.
 * A length clear sets goalieShot and leaves both butterflies, so the zone stance returns.
 */
export function goalieButterflyPose(s: Skater): boolean {
  if (s.kind !== "goalie") return false;
  if (s.dive > 0.04 || s.tumble !== 0 || s.celebrate > 0.05) return false;
  if (world.goalieShot !== null) return false;
  const iron = ironDefensePose(s);
  if (iron === "goalieGloveSave" || iron === "goalieBlockerSave") return true;
  if (iron) return false;
  if (goalieShotSave(s)) {
    if (shotAimsTopCorner(s)) return true;
    if (goalieCompactButterfly(s)) return false;
    return true;
  }
  if (goalieCompactButterfly(s)) return false;
  return s.coverPose >= 0.35;
}

/**
 * Upright, perimeter, mid, or the compact butterfly.
 * A dive, a tumble, a celebration, and a raised save stay on their own poses.
 * Perimeter is the neutral zone. Upright is the other end, and an iron shot that is not a pad save.
 * Mid is the rest of this defending zone. Butterfly is the low slot, a rebound, or iron.
 */
export function goalieZKind(s: Skater): GoalieZKind | null {
  if (s.kind !== "goalie") return null;
  if (s.dive > 0.04 || s.tumble !== 0 || s.celebrate > 0.05) return null;
  const iron = ironDefensePose(s);
  if (iron === "goalieGloveSave" || iron === "goalieBlockerSave") return null;
  if (iron) return "upright";
  if (goalieShotSave(s) && (shotAimsTopCorner(s) || !goalieCompactButterfly(s))) return null;
  if (s.coverPose > 0.08 && !goalieCompactButterfly(s)) return null;
  const zone = zoneAtX(world.puck.x);
  const end = defendDir(s.side) > 0 ? 1 : -1;
  if (zone === 0) return "perimeter";
  if (zone !== end) return "upright";
  if (goalieCompactButterfly(s)) return "butterfly";
  return "mid";
}

/**
 * Blocker hand in world space. Same body-space points as goalieZBlockerPoint,
 * pitched with that Z and dropped in the butterfly.
 */
export function goalieBlockerHand(s: Skater): { x: number; y: number; z: number } {
  const kind = goalieZKind(s) ?? "butterfly";
  let lx = -0.31;
  let ly = 0.92;
  let lz = 0.13;
  if (kind === "butterfly") {
    lx = -0.32;
    ly = 1.22;
    lz = 0.16;
  } else if (kind === "mid") {
    lx = -0.46;
    ly = 1.12;
    lz = 0.28;
  } else if (kind === "perimeter") {
    lx = -0.33;
    ly = 0.92;
    lz = 0.16;
  }
  const pitch = GOALIE_Z[kind].torso;
  const c = Math.cos(pitch);
  const sn = Math.sin(pitch);
  const drop = kind === "butterfly" ? BUTTERFLY_STANCE_DROP : 0;
  const y = drop + ly * c - lz * sn;
  const bz = ly * sn + lz * c;
  const at = skaterXZ(s, lx, bz);
  return { x: at.x, y, z: at.z };
}

/** How long an X press keeps the goalie poke-check pose up. Same clock as the poke. */
const USER_GOALIE_POKE_POSE = 0.34;
let userGoaliePokePoseUntil = -1;

/** User X. The pose does not wait for a puck or skater inside the stick. */
function armUserGoaliePokePose(s: Skater): void {
  if (!userControlsGoalie(s) || world.puck.owner === s.id) return;
  userGoaliePokePoseUntil = world.time + USER_GOALIE_POKE_POSE;
}

export function goalieUserPokePose(s: Skater): boolean {
  if (!userControlsGoalie(s) || world.puck.owner === s.id) return false;
  if (s.poke <= 0.04) return false;
  return world.time <= userGoaliePokePoseUntil;
}

/**
 * An opponent has the puck within one goalie stick length of this goalie's blocker hand.
 * A user X press uses the same pose with nobody in reach. Contact stays on the stick length.
 */
export function goaliePokeCheckPose(s: Skater): boolean {
  if (s.kind !== "goalie") return false;
  if (goalieUserPokePose(s)) return true;
  const owner = world.puck.owner;
  if (owner === null || owner === s.id) return false;
  const foe = world.skaters[owner];
  if (!foe || foe.side === s.side) return false;
  const hand = goalieBlockerHand(s);
  const puck = world.puck;
  const dist = Math.hypot(puck.x - hand.x, puck.y - hand.y, puck.z - hand.z);
  return dist <= GOALIE_STICK_LEN;
}

/** How long the release pose stays up after the puck leaves. */
const GOALIE_PLAY_RELEASE = 0.2;
let goaliePlayChargeId = -1;
const goaliePlayReleaseUntil = new Map<number, number>();

function noteGoaliePlayRelease(s: Skater): void {
  if (s.kind !== "goalie") return;
  goaliePlayReleaseUntil.set(s.id, world.time + GOALIE_PLAY_RELEASE);
  if (goaliePlayChargeId === s.id) goaliePlayChargeId = -1;
}

function goaliePlayReleaseLive(s: Skater): boolean {
  const until = goaliePlayReleaseUntil.get(s.id);
  if (until === undefined) return false;
  if (world.time >= until || world.puck.owner === s.id) {
    goaliePlayReleaseUntil.delete(s.id);
    return false;
  }
  return true;
}

/**
 * Play-puck sequence. Charge is the first pose. The release is the second.
 * Holding the puck with no windup stays on goaliePlayPuck1.
 */
export function goaliePlayPuckPose(s: Skater): "goaliePlayPuck1" | "goaliePlayPuck2" | null {
  if (s.kind !== "goalie") return null;
  if (goaliePlayReleaseLive(s)) return "goaliePlayPuck2";
  if (!goaliePlaysPuck(s)) return null;
  if (goaliePlayChargeId === s.id) return "goaliePlayPuck1";
  return "goaliePlayPuck1";
}

/** Puck is in this goalie's defending zone, the goalie is up, and no shot is in flight. */
export function goalieInMid(s: Skater): boolean {
  return goalieZKind(s) === "mid";
}

/**
 * Handling a loose puck, or skating out to one.
 * The body stays in the perimeter Z. Zone kind is unchanged: a shot in flight,
 * a rebound, and iron keep the save poses. A cover or a clear leaves this.
 */
export function goaliePlaysPuck(s: Skater): boolean {
  if (s.kind !== "goalie") return false;
  if (s.dive > 0.04 || s.tumble !== 0 || s.celebrate > 0.05) return false;
  if (s.gloveFlash > 0.12 || s.coverPose > 0.08) return false;
  if (world.stoppage || world.faceoff || world.goalieShot !== null) return false;
  if (world.puck.owner === s.id) return true;
  if (goalieShotSave(s) || ironDefensePose(s)) return false;
  const end = (defendDir(s.side) > 0 ? 1 : -1) as 1 | -1;
  if (zoneAtX(world.puck.x) === end) {
    const sinceSave = world.time - world.goalieSaveT;
    if (world.reboundN >= 1 && sinceSave >= 0 && sinceSave < 2.6) return false;
    const sinceIron = world.time - ironStanceT;
    if (ironStanceEnd === end && sinceIron >= 0 && sinceIron < 2.6) return false;
  }
  return goalieLooseSkate.has(s.id) || goalieUserChasingLoose(s);
}

/** Mid ice-blade center in the yaw+π frame, sampled from the posed mesh. */
const goalieMidBlade = new Map<number, { lx: number; lz: number }>();

export function noteGoalieMidBlade(s: Skater, x: number, z: number): void {
  goalieMidBlade.set(s.id, skaterLocal(s, x, z));
}

/**
 * Skill Stick user who is carrying. −1 forehand, 0 center, +1 backhand.
 * null keeps the classic forehand plate, including a slap load.
 */
function skillStickCarryPull(s: Skater): number | null {
  if (s.kind === "goalie" || s.id !== world.userId) return null;
  if (world.puck.owner !== s.id || s.deke > 0.02) return null;
  if (useGame.getState().controlProfile !== "stick") return null;
  if (s.stickPull > 0.02 || s.stickPull < -0.02) return Math.max(-1, Math.min(1, s.stickPull));
  if (s.windup > 0.5) return null;
  return 0;
}

/** Blend from the neutral plate to the top-speed plate. Release eases. A press snaps on. */
const BURST_POSE_S = 0.18;
const burstPoseW = new Map<number, number>();

export function burstPoseWeight(id: number): number {
  return burstPoseW.get(id) ?? 0;
}

/** Gallery still. A held burst snaps this weight to 1 in easeBurstPoses. */
export function holdBurstPose(id: number): void {
  burstPoseW.set(id, 1);
}

/** Forwards and defense who own the puck and are holding burst. Shots, dekes, and pulls win. */
function burstCarryPose(s: Skater): boolean {
  if (s.kind === "goalie" || world.puck.owner !== s.id || s.burst <= 0) return false;
  if (s.deke > 0.02 || Math.abs(s.stickPull) > 0.02) return false;
  if (s.poke > 0.04 || s.hit > 0 || s.dive > 0.04) return false;
  if (s.tumble !== 0 && s.struck > 0.1) return false;
  if (s.celebrate > 0.05 || s.struck > 0.2) return false;
  if (s.windup > 0.04 || s.follow > 0.02) return false;
  if (world.faceoff && world.faceoffPhase !== "live") return false;
  if (rageDraw(s.id)) return false;
  const brawl = world.lineBrawl;
  if (brawl) {
    for (const p of brawl.pairs) {
      if (p.home === s.id || p.away === s.id) return false;
    }
  }
  return true;
}

function easeBurstPoses(dt: number): void {
  const step = dt / BURST_POSE_S;
  const live = new Set<number>();
  for (const s of world.skaters) {
    live.add(s.id);
    const cur = burstPoseW.get(s.id) ?? 0;
    let next = 0;
    if (burstCarryPose(s)) next = 1;
    else if (s.deke > 0.02 || Math.abs(s.stickPull) > 0.02) next = 0;
    else if (cur > 0 && neutralCarryOn(s)) next = Math.max(0, cur - step);
    if (next <= 0) burstPoseW.delete(s.id);
    else burstPoseW.set(s.id, next);
  }
  for (const id of burstPoseW.keys()) {
    if (!live.has(id)) burstPoseW.delete(id);
  }
}

/** Forwards and defense who own the puck, coasting. Shots and the faceoff set win.
 *  Burst uses the top-speed plate, except an active deke, which stays on this blend.
 */
function neutralCarryOn(s: Skater): boolean {
  if (s.kind === "goalie" || world.puck.owner !== s.id) return false;
  if ((s.burst > 0 && s.deke <= 0.02) || s.poke > 0.04 || s.hit > 0 || s.dive > 0.04) return false;
  if (s.tumble !== 0 && s.struck > 0.1) return false;
  if (s.celebrate > 0.05 || s.struck > 0.2) return false;
  if (s.windup > 0.5 || s.follow > 0.02) return false;
  if (world.faceoff && world.faceoffPhase !== "live") return false;
  if (rageDraw(s.id)) return false;
  const brawl = world.lineBrawl;
  if (brawl) {
    for (const p of brawl.pairs) {
      if (p.home === s.id || p.away === s.id) return false;
    }
  }
  return true;
}

export function stickBlade(s: Skater): { x: number; z: number } {
  // Skater plate is the shooter's right in this yaw+π frame (same point as the mesh).
  // Facing +X (yaw −π/2) that lands at world +Z, classic-camera screen-right.
  // Goalie sample is on the ice blade: blocker side, in front of the pads.
  // It stays inside that blade from butterfly pitch 0.2 through a hit pitch of 0.5.
  // Upright, perimeter, mid, and the compact butterfly replace that sample with the posed blade center.
  // The raised butterfly, the dive, and a shot save keep the fixed sample.
  // A deke carries the skater plate across to local +X. The mesh blade crosses it.
  // Skill Stick possession with the stick centered uses the center line, in front of the skates.
  // A side hold pulls that plate to the forehand or the backhand. A slap load keeps this plate.
  const plate = s.kind === "goalie" ? null : skaterPlateLocal();
  let lx = plate ? plate.x : -0.73;
  let lz = plate ? plate.z : 1.35;
  if (plate && s.deke > 0.02 && world.puck.owner === s.id) {
    const across = dekePuckLocal(s.deke);
    lx = across.x;
    lz = across.z;
  } else if (plate) {
    const skillPull = skillStickCarryPull(s);
    if (skillPull !== null) {
      const at = skillCarryLocal(skillPull);
      lx = at.x;
      lz = at.z;
    } else if (s.stickPull > 0.02 && world.puck.owner === s.id) {
      const across = dekePuckLocal(0.525 * Math.min(1, s.stickPull));
      lx = across.x;
      lz = across.z;
    }
  }
  if (plate && neutralCarryOn(s)) {
    const n = neutralCarryBlend(s.deke, s.stickPull);
    if (n > 0) {
      const at = neutralCarryLocal();
      lx += (at.x - lx) * n;
      lz += (at.z - lz) * n;
    }
  }
  const bw = burstPoseW.get(s.id) ?? 0;
  if (
    bw > 0 &&
    plate &&
    s.deke <= 0.02 &&
    Math.abs(s.stickPull) <= 0.02 &&
    (burstCarryPose(s) || neutralCarryOn(s))
  ) {
    const at = burstCarryLocal();
    const from = neutralCarryLocal();
    lx = from.x + (at.x - from.x) * bw;
    lz = from.z + (at.z - from.z) * bw;
  }
  if (s.kind === "goalie" && goalieZKind(s)) {
    const noted = goalieMidBlade.get(s.id);
    if (noted) {
      lx = noted.lx;
      lz = noted.lz;
    }
  }
  return skaterXZ(s, lx, lz);
}

/**
 * Ice point in front of a goalie who owns the puck.
 * Cover-1 pads reach 0.76 m along the chest. This clears that.
 * yaw −π/2 faces +X: heading is (1, 0), so the puck is at x + GOALIE_HOLD_AHEAD.
 */
const GOALIE_HOLD_AHEAD = 1.05;

/**
 * The user's own goalie takes the puck when the carrier skates into him.
 * Opponent goalies are not affected.
 */
function ownGoalieTakeUserPuck(user: Skater): void {
  if (periodEndLive() || world.faceoff || world.stoppage) return;
  if (user.kind === "goalie" || world.puck.owner !== user.id) return;
  const g = world.skaters.find((s) => s.kind === "goalie" && s.side === user.side);
  if (!g || g.tumble !== 0 || g.dive > 0.04 || g.stun > 0.2) return;
  const reach = g.radius + user.radius + 0.45;
  if (Math.hypot(user.x - g.x, user.z - g.z) > reach) return;
  const hold = goaliePuckHold(g);
  world.puck.owner = g.id;
  world.puck.x = hold.x;
  world.puck.z = hold.z;
  world.puck.y = PUCK_Y;
  world.puck.vx = g.vx;
  world.puck.vz = g.vz;
  world.puck.vy = 0;
  noteControl(g, "play");
}

function goaliePuckHold(s: Skater): { x: number; z: number } {
  const { fx, fz } = heading(s.yaw);
  return { x: s.x + fx * GOALIE_HOLD_AHEAD, z: s.z + fz * GOALIE_HOLD_AHEAD };
}

const PUCK_R = 0.04;
const CROSSBAR_R = GOAL_PIPE_R;
const SKATE_LX = 0.2;
const SKATE_LZ = skateSoleZ();

function skateSoleZ(): number {
  const hip = (18 * Math.PI) / 180;
  const knee = (25 * Math.PI) / 180;
  const thigh = ((15 - 10 * (18.5 / 30)) * Math.PI) / 180;
  const boot = -(hip + thigh + knee);
  const rot = (y: number, z: number, th: number) => ({
    y: y * Math.cos(th) - z * Math.sin(th),
    z: y * Math.sin(th) + z * Math.cos(th),
  });
  let y = -0.12;
  let z = 0.02;
  let p = rot(y, z, boot);
  y = p.y - 0.3;
  z = p.z + 0.04;
  p = rot(y, z, knee);
  y = p.y - 0.32;
  z = p.z;
  p = rot(y, z, thigh);
  y = p.y + 0.86;
  z = p.z;
  p = rot(y, z, hip);
  return p.z;
}

type OffHow = "loose" | "shot" | "pass" | "poke" | "check" | "rebound" | "official";
type OffSpot = "carry" | "shot" | "intentional";
type OffRelease = { how: OffHow; id: number; x: number; z: number; t: number };
type OffCause = {
  how: OffHow;
  id: number;
  x: number;
  z: number;
  side: "home" | "away" | null;
  nz: boolean;
};
type OffFlight = {
  dir: 1 | -1;
  live: boolean;
  x: number;
  z: number;
  offenderContact: boolean;
  defenderPlayed: boolean;
};

let releasePin = false;
let release: OffRelease | null = null;
let deflectKind: "rebound" | "official" | null = null;
let deflectId = -1;
let deflectNz = false;
let precedeId: number | null = null;
let frameAct: "play" | "receive" | null = null;
let frameActId = -1;
let receiveFrom: { x: number; z: number } | null = null;
let delayOnside: number[] = [];
let offsideFlight: OffFlight | null = null;

function ozEdge(dir: 1 | -1): number {
  return dir * (BLUE_X + BLUE_LINE_W * 0.5);
}

function pastEdge(x: number, dir: 1 | -1): boolean {
  return dir > 0 ? x > ozEdge(1) : x < ozEdge(-1);
}

function puckOzSide(puck: Puck): 0 | 1 | -1 {
  const half = BLUE_LINE_W * 0.5;
  if (puck.x - PUCK_R > BLUE_X + half) return 1;
  if (puck.x + PUCK_R < -BLUE_X - half) return -1;
  return 0;
}

function zoneAtX(x: number): 0 | 1 | -1 {
  const edge = BLUE_X + BLUE_LINE_W * 0.5;
  if (x > edge) return 1;
  if (x < -edge) return -1;
  return 0;
}

/**
 * Puck x is in this goalie's defensive zone.
 * zoneAtX counts the ice behind their own goal line as their end.
 * Neutral ice and the other end do not.
 */
function goalieDefendZone(side: "home" | "away", x: number): boolean {
  const end = defendDir(side) > 0 ? 1 : -1;
  return zoneAtX(x) === end;
}

function offsidesLive(): boolean {
  const ui = useGame.getState();
  return ui.offsides && ui.clockMode === "game";
}

function attackSign(side: "home" | "away"): 1 | -1 {
  return attackDir(side) >= 0 ? 1 : -1;
}

/**
 * This side has the puck fully in its attacking zone.
 * A clear, a turnover, a delay, or an offside whistle ends it.
 * Roller never qualifies: offsides are not live, so there is no blue-line shelf.
 */
function sideOzPossession(side: "home" | "away"): boolean {
  if (periodEndLive()) return false;
  if (!offsidesLive() || world.stoppage || world.faceoff) return false;
  if (world.whistle === "offside") return false;
  if (world.delayedOffside !== 0) return false;
  const puck = world.puck;
  if (puck.owner === null) return false;
  const holder = world.skaters[puck.owner];
  if (!holder || holder.side !== side || holder.kind === "goalie") return false;
  return puckOzSide(puck) === attackSign(side);
}

function defenseShelfIndex(s: Skater): number {
  let i = 0;
  for (const p of world.skaters) {
    if (p.side !== s.side || p.kind !== "defense") continue;
    if (p.id === s.id) return i;
    i++;
  }
  return 0;
}

/** 0.6 m and 1.2 m on the offensive side of the blue-line stripe. */
function ozShelfX(s: Skater): number {
  const inset = Math.min(1.2, 0.6 + defenseShelfIndex(s) * 0.6);
  return attackDir(s.side) * (BLUE_X + inset);
}

/**
 * Keep a defender's aim from retreating through the attacking blue line.
 * A target that is still outside is brought up to the shelf so he joins.
 * A target already deeper in the zone is left there.
 */
function holdHomeDefenseX(s: Skater, tx: number): number {
  if (s.kind !== "defense") return tx;
  if (s.id === world.userId || s.id === world.puck.owner) return tx;
  if (!sideOzPossession(s.side)) return tx;
  const shelf = ozShelfX(s);
  const attack = attackDir(s.side);
  return attack > 0 ? Math.max(tx, shelf) : Math.min(tx, shelf);
}

/**
 * Stop a short step back through the blue line. A defender still in the
 * neutral zone is not dragged; his steer target is inside, so he skates in.
 */
function keepHomeDefenseInOz(s: Skater): void {
  if (periodEndLive()) return;
  if (s.kind !== "defense") return;
  if (s.id === world.userId || s.id === world.puck.owner) return;
  if (!sideOzPossession(s.side)) return;
  const attack = attackDir(s.side);
  const shallow = (ozShelfX(s) - s.x) * attack;
  if (shallow <= 0.02 || shallow > 1.6) return;
  s.x += attack * Math.min(shallow, 0.28);
  if (s.vx * attack < 0) s.vx = 0;
}

function mustHoldOnside(s: Skater): boolean {
  if (periodEndLive()) return false;
  if (s.kind === "goalie") return false;
  if (world.puck.owner === s.id) return false;
  if (world.stoppage || world.faceoff) return false;
  if (!offsidesLive()) return false;
  const dir = attackSign(s.side);
  // Delay keeps the clamp on. A player the rules already allow inside (exempt,
  // and not on the tag-up list) is released once the puck is in.
  if (world.delayedOffside === dir && !(precedeId === s.id && !delayOnside.includes(s.id)))
    return true;
  // Possession already in the zone. Do not walk a defender back across the line.
  if (s.kind === "defense" && s.id !== world.userId && sideOzPossession(s.side)) return false;
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

/**
 * Carrier easing back out of his own attacking zone.
 * Sheds outward speed while the puck is still in that zone and a skate or
 * the puck is at the blue line. A committed leave keeps a light brush.
 * Outward speed is never reversed, and nothing pulls him back once the puck
 * has left the zone.
 */
function resistAttackingBlue(
  s: Skater,
  dt: number,
  cap: number,
  burst: boolean,
  wx: number,
  mag: number,
): void {
  if (periodEndLive()) return;
  if (s.kind === "goalie" || world.puck.owner !== s.id) return;
  if (world.stoppage || world.faceoff || !offsidesLive()) return;
  const attack = attackDir(s.side);
  const alongV = s.vx * attack;
  if (alongV >= -0.35) return;
  const leaving = -alongV;
  const edge = BLUE_X + BLUE_LINE_W * 0.5;
  const puckInside = world.puck.x * attack - edge;
  // The puck has left the zone. Do not pull a carrier back across the line.
  if (puckInside <= PUCK_R) return;
  const [a, b] = skatePair(s);
  const skateInside = Math.min(a.x * attack, b.x * attack) - edge;
  let inside = puckInside;
  if (skateInside > -0.02) inside = Math.min(inside, skateInside);
  const BAND = 0.92;
  if (inside > BAND) return;
  const dirOut = mag > 0.12 ? Math.max(0, Math.min(1, -((wx / mag) * attack))) : 0;
  const steer = dirOut * Math.min(1, mag);
  const clear = Math.max(8.2, cap * 0.58);
  const committed = Math.max(burst ? 1 : 0, steer, Math.min(1, leaving / clear));
  const near = 0.5 + 0.5 * (1 - inside / BAND);
  const rate = (16 * (1 - committed) + 1.85 * committed) * near;
  const next = alongV * Math.exp(-rate * dt);
  s.vx += attack * (next - alongV);
}

function skatePair(s: Skater): [{ x: number; z: number }, { x: number; z: number }] {
  return [skaterXZ(s, -SKATE_LX, SKATE_LZ), skaterXZ(s, SKATE_LX, SKATE_LZ)];
}

function bothSkatesPast(s: Skater, dir: 1 | -1): boolean {
  if (s.kind === "goalie") return false;
  const [a, b] = skatePair(s);
  return pastEdge(a.x, dir) && pastEdge(b.x, dir);
}

function inNeutral(s: Skater): boolean {
  if (s.kind === "goalie") return zoneAtX(s.x) === 0;
  return !bothSkatesPast(s, 1) && !bothSkatesPast(s, -1);
}

function setDelayedSide(side: 0 | 1 | -1): void {
  world.delayedOffside = side;
  const on = side !== 0;
  const ui = useGame.getState();
  if (ui.delayedOffside !== on) ui.setDelayedOffside(on);
}

let offsideReleasePending = false;

function clearDelayedOffside(): void {
  if (world.delayedOffside !== 0) world.delayedOffside = 0;
  offsideReleasePending = false;
  delayOnside = [];
  offsideFlight = null;
  precedeId = null;
  release = null;
  releasePin = false;
  deflectKind = null;
  deflectId = -1;
  deflectNz = false;
  frameAct = null;
  frameActId = -1;
  receiveFrom = null;
  const ui = useGame.getState();
  if (ui.delayedOffside) ui.setDelayedOffside(false);
}

function markAct(via: "play" | "receive", id: number): void {
  frameAct = via;
  frameActId = id;
}

function latchPrecede(): void {
  frameAct = null;
  frameActId = -1;
  receiveFrom = null;
  releasePin = false;
  const id = world.puck.owner;
  if (id === null) {
    precedeId = null;
    return;
  }
  const s = world.skaters[id];
  if (!s || s.kind === "goalie") {
    precedeId = null;
    return;
  }
  if (!bothSkatesPast(s, attackSign(s.side))) precedeId = s.id;
  else if (precedeId !== s.id) precedeId = null;
}

function touchFlight(how: OffHow, s: Skater): void {
  const flight = offsideFlight;
  if (s.kind === "goalie") {
    if (flight?.live && attackSign(s.side) !== flight.dir && (how === "shot" || how === "pass")) {
      flight.defenderPlayed = true;
      flight.live = false;
    }
    return;
  }
  if (flight?.live && attackSign(s.side) === flight.dir && precedeId !== s.id) {
    if (
      how === "poke" ||
      how === "check" ||
      how === "shot" ||
      how === "pass" ||
      how === "rebound"
    ) {
      flight.offenderContact = true;
    }
  } else if (
    flight?.live &&
    attackSign(s.side) !== flight.dir &&
    (how === "shot" || how === "pass")
  ) {
    flight.defenderPlayed = true;
    flight.live = false;
  }
  const delay = world.delayedOffside;
  if (
    delay !== 0 &&
    attackSign(s.side) === delay &&
    precedeId !== s.id &&
    (how === "poke" || how === "check" || how === "shot" || how === "pass")
  ) {
    markAct("play", s.id);
  }
}

function noteRelease(how: OffHow, s: Skater, pin = true): void {
  release = { how, id: s.id, x: s.x, z: s.z, t: world.time };
  markCrowdTouch(s.x, s.z);
  releasePin = pin;
  deflectKind = null;
  deflectId = -1;
  deflectNz = false;
  touchFlight(how, s);
}

function noteLooseRelease(s: Skater): void {
  release = { how: "loose", id: s.id, x: s.x, z: s.z, t: world.time };
  markCrowdTouch(s.x, s.z);
  deflectKind = null;
  deflectId = -1;
  deflectNz = false;
}

function noteControl(s: Skater, via: "play" | "receive"): void {
  if (!offsidesLive() || world.stoppage || world.faceoff) return;
  if (via === "receive") receiveFrom = { x: world.lastPassX, z: world.lastPassZ };
  if (s.kind === "goalie") {
    precedeId = null;
    if (offsideFlight?.live && attackSign(s.side) !== offsideFlight.dir) {
      offsideFlight.defenderPlayed = true;
      offsideFlight.live = false;
    }
    return;
  }
  const wasExempt = precedeId === s.id;
  const past = bothSkatesPast(s, attackSign(s.side));
  if (!past) {
    if (wasExempt || world.delayedOffside === 0) precedeId = s.id;
  } else if (!wasExempt) precedeId = null;
  const exempt = precedeId === s.id;
  if (offsideFlight?.live && attackSign(s.side) === offsideFlight.dir && !exempt) {
    offsideFlight.offenderContact = true;
    if (world.delayedOffside !== offsideFlight.dir) offsideFlight.live = false;
  } else if (offsideFlight?.live && attackSign(s.side) !== offsideFlight.dir) {
    offsideFlight.defenderPlayed = true;
    offsideFlight.live = false;
  }
  const delay = world.delayedOffside;
  if (via === "receive") markAct(via, s.id);
  else if (delay !== 0 && attackSign(s.side) === delay && !exempt) markAct(via, s.id);
}

function noteDeflect(kind: "rebound" | "official", s: Skater): void {
  deflectKind = kind;
  deflectId = s.id;
  deflectNz = inNeutral(s);
  markCrowdTouch(s.x, s.z);
  if (offsideFlight?.live && s.kind !== "goalie" && attackSign(s.side) === offsideFlight.dir) {
    offsideFlight.offenderContact = true;
  }
}

function inferredHow(rel: OffRelease): OffHow {
  if (rel.how !== "loose") return rel.how;
  const shot =
    world.lastShoot + 1e-9 >= rel.t &&
    world.lastShooter === rel.id &&
    world.lastShoot > world.lastPass;
  const pass =
    world.lastPass + 1e-9 >= rel.t &&
    world.lastPasser === rel.id &&
    world.lastPass >= world.lastShoot;
  if (shot) return "shot";
  if (pass) return "pass";
  return "loose";
}

function entryCause(): OffCause {
  if (deflectKind && release) {
    const s = deflectId >= 0 ? world.skaters[deflectId] : undefined;
    return {
      how: deflectKind,
      id: deflectId,
      x: release.x,
      z: release.z,
      side: s?.side ?? null,
      nz: deflectNz,
    };
  }
  if (!release) {
    return {
      how: "loose",
      id: -1,
      x: world.puck.x,
      z: world.puck.z,
      side: null,
      nz: zoneAtX(world.puck.x) === 0,
    };
  }
  const s = world.skaters[release.id];
  return {
    how: inferredHow(release),
    id: release.id,
    x: release.x,
    z: release.z,
    side: s?.side ?? null,
    nz: s ? inNeutral(s) : zoneAtX(release.x) === 0,
  };
}

function attackersInside(dir: 1 | -1, skipId = -1): boolean {
  for (const s of world.skaters) {
    if (s.id === skipId || s.kind === "goalie" || attackSign(s.side) !== dir) continue;
    if (bothSkatesPast(s, dir)) return true;
  }
  return false;
}

function faceZOf(z: number): number {
  return z >= 0 ? FACEOFF_SPOT_Z : -FACEOFF_SPOT_Z;
}

function placeOffsideFaceoff(dir: 1 | -1, _spot: OffSpot, origin?: { x: number; z: number }): void {
  world.faceX = dir * FACEOFF_NZ_X;
  const z = origin?.z ?? offsideFlight?.z ?? world.puck.z;
  world.faceZ = faceZOf(z);
}

function blowOffside(dir: 1 | -1, spot: OffSpot, origin?: { x: number; z: number }): void {
  placeOffsideFaceoff(dir, spot, origin);
  startStoppage("offside");
}

function attackerIsTouching(dir: 1 | -1, id: number): boolean {
  const s = world.skaters[id];
  return !!s && s.kind !== "goalie" && attackSign(s.side) === dir && precedeId !== s.id;
}

/** Possession or a stick play, and only while the puck is fully in the zone. */
function attackerActed(dir: 1 | -1): boolean {
  if (puckOzSide(world.puck) !== dir) return false;
  if (frameAct !== null && frameActId >= 0 && attackerIsTouching(dir, frameActId)) return true;
  if (!release || Math.abs(release.t - world.time) > 1e-6) return false;
  const how = inferredHow(release);
  if (how !== "poke" && how !== "check" && how !== "shot" && how !== "pass") return false;
  return attackerIsTouching(dir, release.id);
}

function endDelay(defenderPlay: boolean): void {
  const dir = offsideFlight?.dir ?? 0;
  const attackerPlay = dir !== 0 && attackerActed(dir);
  setDelayedSide(0);
  delayOnside = [];
  if (offsideFlight && (defenderPlay || attackerPlay)) offsideFlight.live = false;
}

function attackersTagged(dir: 1 | -1): boolean {
  for (const s of world.skaters) {
    if (s.kind === "goalie" || attackSign(s.side) !== dir) continue;
    if (bothSkatesPast(s, dir)) return false;
  }
  return true;
}

function defenderCleared(dir: 1 | -1): boolean {
  if (puckOzSide(world.puck) === dir) return false;
  const owner = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  if (owner && attackSign(owner.side) !== dir) return true;
  if (owner || !release) return false;
  if (inferredHow(release) !== "pass") return false;
  const passer = world.skaters[release.id];
  if (!passer || attackSign(passer.side) === dir) return false;
  if (world.time - world.lastPass > 2.2 || world.lastPass < world.lastShoot) return false;
  return world.lastPasser === passer.id;
}

function maintainDelay(dir: 1 | -1): boolean {
  if (defenderCleared(dir)) {
    endDelay(true);
    return false;
  }
  if (attackersTagged(dir)) {
    endDelay(false);
    return false;
  }
  if (attackerActed(dir)) {
    blowOffside(dir, "intentional");
    return true;
  }
  return false;
}

function teamBroughtBack(dir: 1 | -1, cause: OffCause): boolean {
  const owner = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  if (owner) return attackSign(owner.side) !== dir;
  if (!cause.side || attackSign(cause.side) === dir) return false;
  if (
    cause.how === "shot" ||
    cause.how === "pass" ||
    cause.how === "poke" ||
    cause.how === "check" ||
    cause.how === "loose"
  ) {
    return true;
  }
  return cause.how === "rebound" && cause.nz;
}

function freshDefendingPlay(dir: 1 | -1, cause: OffCause): boolean {
  const owner = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  if (owner) return attackSign(owner.side) !== dir;
  return (
    !!cause.side && attackSign(cause.side) !== dir && (cause.how === "shot" || cause.how === "pass")
  );
}

function beginDelay(dir: 1 | -1, cause: OffCause): void {
  setDelayedSide(dir);
  delayOnside = [];
  for (const s of world.skaters) {
    if (s.kind === "goalie" || attackSign(s.side) !== dir) continue;
    if (!bothSkatesPast(s, dir)) delayOnside.push(s.id);
  }
  offsideFlight = {
    dir,
    live: true,
    x: cause.x,
    z: cause.z,
    offenderContact: false,
    defenderPlayed: false,
  };
}

function onEntry(dir: 1 | -1, was: 0 | 1 | -1): void {
  const cause = entryCause();
  if (!release) {
    cause.x = was === 0 ? 0 : was * (BLUE_X + BLUE_LINE_W * 0.5 + 1);
    cause.z = world.puck.z;
    cause.nz = was === 0;
  }
  if (teamBroughtBack(dir, cause)) {
    if (freshDefendingPlay(dir, cause) && offsideFlight?.dir === dir) offsideFlight.live = false;
    return;
  }
  if (frameAct === "receive") {
    const recv = world.skaters[frameActId];
    if (recv && recv.kind !== "goalie" && attackSign(recv.side) === dir) {
      if (bothSkatesPast(recv, dir) || attackersInside(dir, recv.id)) {
        blowOffside(dir, "shot", receiveFrom ?? cause);
        return;
      }
    }
  }
  const owner = world.puck.owner !== null ? world.skaters[world.puck.owner] : null;
  if (owner && owner.kind !== "goalie" && attackSign(owner.side) === dir) {
    const mateInside = attackersInside(dir, owner.id);
    const selfInside = bothSkatesPast(owner, dir);
    if (!mateInside && !selfInside) return;
    const received =
      (frameAct === "receive" && frameActId === owner.id) ||
      (cause.how === "pass" &&
        cause.id !== owner.id &&
        !!release &&
        Math.abs(release.t - world.time) < 1e-6);
    if (!mateInside && selfInside && precedeId === owner.id && !received) return;
    blowOffside(dir, received ? "shot" : "carry", received ? (receiveFrom ?? cause) : cause);
    return;
  }
  if (!attackersInside(dir)) return;
  beginDelay(dir, cause);
}

/** Banner only. A teammate is already in the zone while this team still has the puck outside it. */
function preEntryOffside(): boolean {
  if (periodEndLive() || world.stoppage || world.faceoff || !offsidesLive()) return false;
  if (world.delayedOffside !== 0) return false;
  const puck = world.puck;
  if (puck.owner === null) return false;
  const holder = world.skaters[puck.owner];
  if (!holder || holder.kind === "goalie") return false;
  const dir = attackSign(holder.side);
  if (puckOzSide(puck) === dir) return false;
  return attackersInside(dir, holder.id);
}

function syncPreEntryOffside(): void {
  if (world.delayedOffside !== 0) return;
  const on = preEntryOffside();
  const ui = useGame.getState();
  if (ui.delayedOffside !== on) ui.setDelayedOffside(on);
}

function checkOffside(): void {
  if (periodEndLive() || world.stoppage || world.faceoff) {
    syncPreEntryOffside();
    return;
  }
  if (!offsidesLive()) {
    world.puckOz = puckOzSide(world.puck);
    clearDelayedOffside();
    return;
  }
  const now = puckOzSide(world.puck);
  const was = world.puckOz;
  world.puckOz = now;
  const delay = world.delayedOffside;
  if (delay !== 0 && maintainDelay(delay)) return;
  if (world.delayedOffside !== 0) return;
  if (now !== 0 && now !== was) onEntry(now, was);
  syncPreEntryOffside();
}

function offsideGoalCounts(side: 1 | -1): boolean {
  const pending = world.delayedOffside !== 0 || !!offsideFlight?.live;
  if (!pending) return true;
  const zone = (world.delayedOffside !== 0 ? world.delayedOffside : (offsideFlight?.dir ?? 0)) as
    1 | -1 | 0;
  if (zone === 0 || side !== zone) return true;
  // The shot that crosses the line is the goal. Only a touch already recorded disallows it.
  if (offsideFlight?.offenderContact) return false;
  return true;
}

function stopForGoal(side: 1 | -1): void {
  if (periodEndLive()) return;
  if (shootoutAttemptDecided()) return;
  if (world.stoppage) return;
  // A shootout shot that crosses the line is a goal. A pending offside does not swallow it
  // unless that team already played the puck in the zone.
  if (offsidesLive() && !shootoutLive() && !offsideGoalCounts(side)) {
    const dir = (world.delayedOffside || offsideFlight?.dir || side) as 1 | -1;
    blowOffside(dir, "shot");
    return;
  }
  clearDelayedOffside();
  noteShotGoal();
  if (useGame.getState().clockMode === "practice") {
    awardPracticeGoal(side);
    return;
  }
  startStoppage("goal", side);
}

const PRACTICE_GOAL_PUCK_DELAY = 0.5;
let practicePuckWait = -1;
let practiceScorerId = -1;

/**
 * Team shot totals, shared with the practice shot-type profile.
 * An attempt is a released shot, including a goalie shot. A pass, saucer, or goalie clear is not.
 * On goal: the path would have entered the net without a goalie, including a save of that path
 * and iron that kicks straight in. Iron that stays out is an attempt only.
 * A goalie stop of a path that would have missed, and a block, stay attempts only.
 */
type ShotTrack = {
  side: "home" | "away";
  at: number;
  kind: ShotKind | null;
  onGoal: boolean;
  goal: boolean;
  /** Goalie or another player changed the puck after the release. */
  deflected: boolean;
};
let shotTrack: ShotTrack | null = null;

function clearShotTrack(): void {
  shotTrack = null;
}

function shotOpen(): ShotTrack | null {
  const open = shotTrack;
  if (!open || world.lastShoot !== open.at || world.lastPass > world.lastShoot) return null;
  const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : null;
  if (!shooter || shooter.side !== open.side) return null;
  return open;
}

function noteShotRelease(): void {
  const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : null;
  // Goalie passes and clears go through beginPassSpeedTrack and never get here.
  // A goalie shot uses beginShotSpeedTrack with no wrist/snap/slap kind. It still counts.
  if (!shooter) {
    clearShotTrack();
    return;
  }
  const kind = isShotAttemptKind(world.lastShotKind) ? world.lastShotKind : null;
  shotTrack = {
    side: shooter.side,
    at: world.lastShoot,
    kind,
    onGoal: false,
    goal: false,
    deflected: false,
  };
  const ui = useGame.getState();
  ui.noteTeamShot(shooter.side, "attempts");
  if (kind && ui.clockMode === "practice") ui.notePracticeShot(kind, "attempts");
}

function noteShotOnGoal(): void {
  const open = shotOpen();
  if (!open || open.onGoal) return;
  open.onGoal = true;
  const ui = useGame.getState();
  ui.noteTeamShot(open.side, "onGoal");
  if (open.kind && ui.clockMode === "practice") ui.notePracticeShot(open.kind, "onGoal");
}

function noteShotGoal(): void {
  const open = shotOpen();
  if (!open || open.goal) return;
  // Clean entry, including iron that kicks straight in. A player redirect does not turn a miss into a shot on goal.
  if (!open.deflected) noteShotOnGoal();
  open.goal = true;
  if (open.kind && useGame.getState().clockMode === "practice") {
    useGame.getState().notePracticeShot(open.kind, "goals");
  }
}

function markShotDeflected(): void {
  const open = shotOpen();
  if (open) open.deflected = true;
}

/** The puck's path meets the mouth: under the bar and between the posts. Ice holds a low puck up. */
function pathMeetsMouth(x: number, y: number, z: number, vx: number, vy: number, vz: number): boolean {
  for (const side of [1, -1] as const) {
    if (vx * side < 0.35) continue;
    const mouth = side * GOAL_LINE_X;
    const before = side > 0 ? x < mouth : x > mouth;
    if (!before) continue;
    const dt = (mouth - x) / vx;
    if (!(dt >= 0 && dt <= 2.2)) continue;
    const zAt = z + vz * dt;
    let yAt = y + vy * dt - 6 * dt * dt;
    if (yAt < PUCK_Y) yAt = PUCK_Y;
    if (yAt > GOAL_H - 0.02) continue;
    if (Math.abs(zAt) > GOAL_W / 2 - 0.02) continue;
    return true;
  }
  return false;
}

function clearPracticeGoalPuck(): void {
  practicePuckWait = -1;
  practiceScorerId = -1;
}

function practiceGoalScorer(side: 1 | -1): Skater | undefined {
  const want: "home" | "away" = side === world.homeAttack ? "home" : "away";
  const id = world.puck.owner ?? world.lastShooter;
  const named = id !== null ? world.skaters[id] : undefined;
  if (named && named.side === want) return named;
  const user = world.skaters[world.userId];
  if (user && user.side === want) return user;
  let best: Skater | undefined;
  let bestD = Infinity;
  for (const s of world.skaters) {
    if (s.side !== want) continue;
    const d = Math.hypot(s.x - world.puck.x, s.z - world.puck.z);
    const rank = s.kind === "goalie" ? d + 40 : d;
    if (rank < bestD) {
      bestD = rank;
      best = s;
    }
  }
  return best;
}

function placePracticePuck(s: Skater): void {
  const spot = s.kind === "goalie" ? goaliePuckHold(s) : stickBlade(s);
  world.puck.owner = s.id;
  world.puck.x = spot.x;
  world.puck.z = spot.z;
  world.puck.y = PUCK_Y;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  useGame.getState().setHasPuck(s.id === world.userId);
}

function deliverPracticeGoalPuck(): void {
  const s = practiceScorerId >= 0 ? world.skaters[practiceScorerId] : undefined;
  practiceScorerId = -1;
  if (s) {
    placePracticePuck(s);
    return;
  }
  giveUserPuck();
  if (world.puck.owner !== null) return;
  world.puck.x = 0;
  world.puck.z = 0;
  world.puck.y = PUCK_Y;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  useGame.getState().setHasPuck(false);
}

function releasePracticeGoalPuck(dt: number): boolean {
  if (practicePuckWait < 0) return false;
  if (useGame.getState().clockMode !== "practice") {
    clearPracticeGoalPuck();
    return false;
  }
  practicePuckWait -= dt;
  if (practicePuckWait > 1e-4) {
    world.puck.owner = null;
    world.puck.vx = 0;
    world.puck.vz = 0;
    world.puck.vy = 0;
    return true;
  }
  practicePuckWait = -1;
  deliverPracticeGoalPuck();
  return false;
}

function awardPracticeGoal(side: 1 | -1): void {
  const ui = useGame.getState();
  const homeScored = side === world.homeAttack;
  if (homeScored) ui.setHomeScore(ui.homeScore + 1);
  else ui.setAwayScore(ui.awayScore + 1);
  world.goalSide = homeScored ? "home" : "away";
  world.goalTicker = 0.48;
  ui.setGoalSide(world.goalSide);
  world.whistle = null;
  world.stoppage = false;
  ui.setWhistle(null);
  const scorer = practiceGoalScorer(side);
  practiceScorerId = scorer ? scorer.id : -1;
  practicePuckWait = PRACTICE_GOAL_PUCK_DELAY;
  world.puck.owner = null;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.goalieShot = null;
  ui.setHasPuck(false);
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
  return world.skaters.filter(
    (s) => s.id !== from.id && s.side === from.side && s.kind !== "goalie",
  );
}

const PASS_DRAG = PUCK_DRAG;
const PASS_CONE = 0.58;
// Still a pass at the target. Slower than this, the coast has died.
const PASS_ARRIVE = 8;
// A body check this close to the release slows that pass. A clean release stays at full tapePower.
const PASS_CHECK_BEFORE = 0.32;
const PASS_CHECK_START = 0.2;
const PASS_CHECK_CUT = 0.5;
// Pass speed stays this curve. It is not the sauce-height clock below.
// Skaters: tap 55 mph, 1.5s 95 mph. Goalies: tap 45 mph, 1.5s 85 mph. Then clamped.
const PASS_TAP_MPH = SKATER_PASS_LO_MPH;
const PASS_FULL_MPH = SKATER_PASS_HI_MPH;
const PASS_FULL_HOLD = 1.5;
// Sauce height is Select's hold, not A's. Empty when Select goes down, full at 1s, then clamped.
// It used to copy aHoldFor, so it could not start before A and jumped to full if the pass was already full.
// Full sauce toward the net and open ice is above the crossbar (the old high loft).
// A board saucer used to aim over the glass (wall top + 0.28) on every full hold, and
// containPuckBoards does not bounce a puck above wallTop, so those all reached the crowd.
// Most board saucers still hit high on the glass and bounce. SAUCE_CROWD_P still clears.
// A Select hold that stays at full for another second, with A never down, is a high clear.
const SAUCE_FULL_HOLD = 1;
const SAUCE_CLEAR_HOLD = 2;
const SAUCE_LOW_Y = 0.38;
const SAUCE_CROWD_AT = 0.8;
const SAUCE_CROWD_P = 0.2;
// Full saucer leaves at 86 mph. The old clear boost was 1.12 × a 95 mph pass (~106).
const SAUCE_FULL_MPH = 86;
const SAUCE_FULL_MPS = SAUCE_FULL_MPH / 2.23694;
// Full sauces drop faster than a shot so a high lob still comes down inside the zone.
const SAUCE_GRAV = 46;
const passerCheckedAt = new Map<number, number>();
let passSpeedCutFor = -1;
let chargedPassPower: number | null = null;
let chargedSauce: number | null = null;
let chargedClear = false;
// B during an A hold. The release must not launch. Cleared once A is up.
let passChargeCancel = false;
// Select sauce clock while this possession can charge. Offset drops time Select was
// already held before the puck arrived (a goalie stays on Select). A during the window
// keeps the saucer on the A release and blocks the high clear.
let sauceHold = 0;
let sauceReleaseClean = false;
let sauceReleaseFull = false;
let sauceCleanLive = false;
let sauceTracking = false;
let sauceOffset = 0;
let sauceClean = true;
// Sauce charge until the first ice hit. Negative means this puck is not a saucer.
let sauceLandCharge = -1;

function resetSauceWindow(): void {
  sauceHold = 0;
  sauceReleaseClean = false;
  sauceReleaseFull = false;
  sauceCleanLive = false;
  sauceTracking = false;
  sauceOffset = 0;
  sauceClean = true;
  sauceLandCharge = -1;
}

function sauceMeterWind(): string {
  return sauceCleanLive && sauceHold >= SAUCE_CLEAR_HOLD ? "Clear" : "Saucer";
}

function passChargeMps(holdS: number, goalie = false): number {
  const t = Math.min(1, Math.max(0, holdS / PASS_FULL_HOLD));
  const tap = goalie ? GOALIE_PASS_LO_MPH : PASS_TAP_MPH;
  const full = goalie ? GOALIE_PASS_HI_MPH : PASS_FULL_MPH;
  return (tap + (full - tap) * t) / 2.23694;
}

function sauceCharge01(holdS: number): number {
  return Math.min(1, Math.max(0, holdS / SAUCE_FULL_HOLD));
}

function withChargedPass(
  holdS: number,
  saucer: boolean,
  sauceHoldS: number,
  fire: () => void,
  goalie = false,
  clear = false,
): void {
  chargedPassPower = passChargeMps(holdS, goalie);
  chargedSauce = saucer ? sauceCharge01(sauceHoldS) : null;
  chargedClear = clear;
  try {
    fire();
  } finally {
    chargedPassPower = null;
    chargedSauce = null;
    chargedClear = false;
  }
}

function chargedHoriz(vx: number, vz: number): { vx: number; vz: number } {
  if (chargedPassPower === null && !(chargedSauce !== null && chargedSauce >= 0.999)) return { vx, vz };
  const power =
    chargedSauce !== null && chargedSauce >= 0.999 ? SAUCE_FULL_MPS : (chargedPassPower as number);
  const sp = Math.hypot(vx, vz) || 1;
  const m = power / sp;
  return { vx: vx * m, vz: vz * m };
}

function tapePower(travel: number, saucer: boolean, cpuGoalie: boolean): number {
  const floor = cpuGoalie ? 12.5 : 15.5;
  const want = cpuGoalie ? 0.72 : 0.5;
  // Pace cap is the old launch. Passes it already delivered firmly stay on it.
  const paceCap = cpuGoalie ? 22 : saucer ? 28 : 24;
  // Reach cap is only for a coast the pace cap would die on, such as goal line to goal line.
  const reachCap = cpuGoalie ? 22 : saucer ? 32 : 30;
  const pace = Math.min(paceCap, Math.max(floor, travel / want));
  const firm = PASS_ARRIVE + PASS_DRAG * travel;
  if (firm <= pace) return pace;
  return Math.min(reachCap, Math.max(pace, firm));
}

function flightSeconds(travel: number, power: number): number {
  const asymptote = Math.max(0.5, power) / PASS_DRAG;
  const reach = Math.min(Math.max(0.2, travel), asymptote * 0.8);
  const cover = (PASS_DRAG * reach) / Math.max(0.5, power);
  if (cover >= 0.97) return Math.max(0.16, reach / Math.max(0.5, power));
  return Math.max(0.16, -Math.log(1 - cover) / PASS_DRAG);
}

function reachPoint(
  ox: number,
  oz: number,
  tx: number,
  tz: number,
  power: number,
): { x: number; z: number; eta: number } {
  const dx = tx - ox;
  const dz = tz - oz;
  const travel = Math.hypot(dx, dz) || 1;
  const asymptote = Math.max(0.5, power) / PASS_DRAG;
  const reach = Math.min(travel, asymptote * 0.8);
  const eta = flightSeconds(reach, power);
  return { x: ox + (dx / travel) * reach, z: oz + (dz / travel) * reach, eta };
}

function bestPassTarget(from: Skater, ax: number, az: number, requireAim = false): Skater | null {
  const mates = teammatesOf(from);
  if (!mates.length) return null;
  const cpuGoalie = from.kind === "goalie" && from.side !== "home";
  let best: Skater | null = null;
  let bestScore = -Infinity;
  for (const s of mates) {
    const dx0 = s.x - from.x;
    const dz0 = s.z - from.z;
    const dist0 = Math.hypot(dx0, dz0);
    if (dist0 < 0.7) continue;
    const preview = flightSeconds(dist0, tapePower(dist0, false, cpuGoalie));
    const lx = s.x + s.vx * preview - from.x;
    const lz = s.z + s.vz * preview - from.z;
    const distL = Math.hypot(lx, lz) || 1;
    const alignBody = (dx0 * ax + dz0 * az) / dist0;
    const alignLead = (lx * ax + lz * az) / distL;
    const align = Math.max(alignBody, alignLead);
    if (requireAim && align < PASS_CONE) continue;
    const useLead = alignLead >= alignBody;
    const dx = useLead ? lx : dx0;
    const dz = useLead ? lz : dz0;
    const dist = useLead ? distL : dist0;
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
  if (requireAim) return best;
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

function nearestLaneMate(from: Skater, ax: number, az: number): Skater | null {
  let best: Skater | null = null;
  let bestD = Infinity;
  for (const s of teammatesOf(from)) {
    const dx = s.x - from.x;
    const dz = s.z - from.z;
    const along = dx * ax + dz * az;
    if (along < 2 || along > 44) continue;
    const perp = Math.hypot(dx - ax * along, dz - az * along);
    if (perp > 12) continue;
    const d = Math.hypot(dx, dz);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function skaterReach(t: number): number {
  const lag = 0.32;
  if (t <= lag) return 2.2 * t;
  return 2.2 * lag + 8.4 * (t - lag);
}

function laneLanding(
  ox: number,
  oz: number,
  ax: number,
  az: number,
  power: number,
  mate: Skater,
): { x: number; z: number } {
  let bestX = ox + ax * 3;
  let bestZ = oz + az * 3;
  let bestLate = Infinity;
  for (let i = 1; i <= 28; i++) {
    const t = (i / 28) * 1.7;
    const reach = (Math.max(0.5, power) / PASS_DRAG) * (1 - Math.exp(-PASS_DRAG * t));
    const x = ox + ax * reach;
    const z = oz + az * reach;
    const late = Math.hypot(x - mate.x, z - mate.z) - skaterReach(t);
    if (late <= 0.2) return { x, z };
    if (late < bestLate) {
      bestLate = late;
      bestX = x;
      bestZ = z;
    }
  }
  return { x: bestX, z: bestZ };
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
  const forced = chargedPassPower;
  const seed = Math.hypot(mate.x - blade.x, mate.z - blade.z) || 1;
  let power = forced ?? tapePower(seed, saucer, cpuGoalie);
  let eta = flightSeconds(seed, power);
  let tx = mate.x;
  let tz = mate.z;
  for (let i = 0; i < 4; i++) {
    tx = mate.x + mate.vx * eta;
    tz = mate.z + mate.vz * eta;
    const travel = Math.hypot(tx - blade.x, tz - blade.z) || 1;
    power = forced ?? tapePower(travel, saucer, cpuGoalie);
    const shot = reachPoint(blade.x, blade.z, tx, tz, power);
    eta = shot.eta;
    tx = shot.x;
    tz = shot.z;
  }
  const dx = tx - blade.x;
  const dz = tz - blade.z;
  const travel = Math.hypot(dx, dz) || 1;
  launchPass(
    s,
    (dx / travel) * power,
    (dz / travel) * power,
    saucer ? 2.2 : cpuGoalie ? 0.42 : 0.03,
    saucer,
    saucer ? { dist: travel, over: false, bank: false } : undefined,
  );
  passMeet = { x: tx, z: tz };
  world.lastPassTo = mate.id;
  world.oneTimerUntil = world.time + 2.2;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
}

function freeAimToLane(s: Skater, ax: number, az: number, saucer: boolean, keepLane = true): void {
  const from = passOrigin(s);
  // Pass lock off still names the lane mate. Only the puck's direction stays on the aim.
  const lane = nearestLaneMate(s, ax, az);
  const power = chargedPassPower ?? (saucer ? 17.6 : 16.4);
  const spot = lane ? laneLanding(from.x, from.z, ax, az, power, lane) : null;
  if (keepLane && lane && spot) {
    const laneDist = Math.hypot(spot.x - from.x, spot.z - from.z);
    launchPass(
      s,
      ax * power,
      az * power,
      saucer ? 3.4 : 0.06,
      saucer,
      saucer ? { dist: laneDist, over: false, bank: false } : undefined,
    );
  } else {
    launchPass(s, ax * power, az * power, saucer ? 3.4 : 0.06, saucer);
  }
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  if (lane && spot) {
    passMeet = spot;
    world.lastPassTo = lane.id;
    world.oneTimerUntil = world.time + 2.2;
  } else {
    world.lastPassTo = null;
  }
}

function launchPuck(s: Skater, vx: number, vz: number, vy = 0): void {
  if (releasePin) releasePin = false;
  else noteLooseRelease(s);
  rimRide = null;
  boardRide = null;
  boardBank = null;
  overWall.delete(world.puck);
  shotIron = null;
  ironResolved = null;
  clearShotShape();
  drillPipeHit = false;
  sauceLandCharge = -1;
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

function checkedPassScale(s: Skater): number {
  const at = passerCheckedAt.get(s.id);
  if (at === undefined) return 1;
  const age = world.time - at;
  if (age < 0 || age > PASS_CHECK_BEFORE) return 1;
  return PASS_CHECK_CUT;
}

type SauceAim = { dist: number; over: boolean; bank: boolean; wall?: number };
type SauceZone = "own" | "ownNeutral" | "attackNeutral" | "offensive";

function sauceNetY(sauce: number): number {
  // Partial charges stay on this ramp. Full end-aimed sauces use the zone landing instead.
  const high = mouthTopY() + 0.78;
  return SAUCE_LOW_Y + sauce * (high - SAUCE_LOW_Y);
}

function sauceGlassY(sauce: number, wall: number): number {
  const high = Math.max(SAUCE_LOW_Y + 0.04, wall - 0.2);
  return SAUCE_LOW_Y + sauce * (high - SAUCE_LOW_Y);
}

/** High clear arrives well above a full net saucer and carries down the ice. */
function sauceClearY(): number {
  return mouthTopY() + 2.15;
}

/** Arrival loft. A low sauce keeps a short hop. A full sauce uses the real flight. */
function sauceLaunchVy(dist: number, speed: number, wantY: number, sauce: number, grav = 12): number {
  const raw = Math.max(0.1, flightSeconds(Math.max(0.55, dist), Math.max(8, speed)));
  const t = (1 - sauce) * Math.min(raw, 0.36) + sauce * raw;
  const drop = 0.5 * grav * t * t;
  const vy = (wantY - PUCK_Y + drop) / Math.max(0.08, t + 0.02);
  return Math.max(0.45, Math.min(22, vy));
}

function sauceZone(s: Skater): SauceZone {
  const along = s.x * attackDir(s.side);
  const blue = BLUE_X + BLUE_LINE_W * 0.5;
  if (along > blue) return "offensive";
  if (along > 0.35) return "attackNeutral";
  if (along >= -blue) return "ownNeutral";
  return "own";
}

function aimingAtAttackEnd(s: Skater, ax: number, az: number): boolean {
  const attack = attackDir(s.side);
  if (ax * attack > 0.42) return true;
  const from = passOrigin(s);
  const hit = rayBoard(from.x, from.z, ax, az, 80);
  if (!hit) return false;
  return Math.abs(hit.nx) > 0.72 && hit.nx * attack > 0.45;
}

type FullSauceLand = { dist: number; wantY: number };

/** Full charge only. Partial sauces keep the lower proportional arc. */
function fullSauceLand(s: Skater, ax: number, az: number): FullSauceLand | null {
  if (!aimingAtAttackEnd(s, ax, az)) return null;
  const attack = attackDir(s.side);
  const from = passOrigin(s);
  const hit = rayBoard(from.x, from.z, ax, az, 90);
  const wall = hit ? wallTop(hit.nx, hit.nz, hit.x, hit.z) : BOARD_H + GLASS_H;
  const zone = sauceZone(s);
  const distToX = (x: number): number | null => {
    if (ax * attack < 0.12) return null;
    const d = (x - from.x) / ax;
    return d > 0.8 ? d : null;
  };
  if (zone === "offensive") {
    const dist = hit ? Math.max(1.2, hit.dist) : 10;
    const roll = Math.random();
    // Most clear the end glass. A glass hit is next. A clip that can kick out is rare.
    if (roll < 0.74) return { dist, wantY: wall + 0.85 };
    if (roll < 0.94) return { dist, wantY: Math.max(1.6, wall - 0.9) };
    return { dist, wantY: wall + 0.12 };
  }
  if (zone === "attackNeutral") {
    const dist = hit ? Math.max(1.2, hit.dist) : 18;
    const slip = (Math.random() - 0.5) * 0.2;
    return { dist, wantY: Math.max(1.7, wall - 0.7 + slip) };
  }
  if (zone === "ownNeutral") {
    const goal = attack * GOAL_LINE_X;
    const roll = Math.random();
    if (roll >= 0.74 && hit) {
      return { dist: Math.max(2, hit.dist), wantY: 0.5 + Math.random() * 0.35 };
    }
    const landX =
      roll < 0.42
        ? goal - attack * (0.5 + Math.random() * 1.5)
        : goal + attack * (0.35 + Math.random() * 2.2);
    const dist = distToX(landX) ?? (hit ? Math.min(hit.dist * 0.9, 40) : 26);
    return { dist, wantY: PUCK_Y + 0.03 };
  }
  const blue = BLUE_X + BLUE_LINE_W * 0.5;
  const landAlong = blue + 2.2 + Math.random() * Math.max(3.5, GOAL_LINE_X - blue - 7);
  const dist = distToX(attack * landAlong) ?? 34;
  return { dist: Math.max(8, dist), wantY: PUCK_Y + 0.04 };
}

function inferSauceAim(s: Skater, ax: number, az: number): SauceAim {
  const from = passOrigin(s);
  const hit = rayBoard(from.x, from.z, ax, az, 70);
  const board = !!hit && (aimIsBoard(from, ax, az, hit) || alongWallSide(from, ax, az) !== null);
  if (board && hit) {
    return {
      dist: Math.max(0.6, hit.dist),
      over: true,
      bank: false,
      wall: wallTop(hit.nx, hit.nz, hit.x, hit.z),
    };
  }
  const netX = attackDir(s.side) * GOAL_LINE_X;
  if (Math.abs(ax) > 0.15 && (netX - from.x) * ax > 0.4) {
    const dist = (netX - from.x) / ax;
    if (dist > 0.6 && dist < 70) return { dist, over: false, bank: false };
  }
  return { dist: hit ? Math.max(0.6, Math.min(16, hit.dist)) : 10, over: false, bank: false };
}

/**
 * Share of CPU skater high clears that may still sail over the glass.
 * A goalie clear never does. User aim is not passed through this.
 */
const CPU_CROWD_CLEAR_P = 0.08;

/** True when this release may keep an arc that leaves the rink. */
function cpuKeepsCrowdArc(s: Skater): boolean {
  if (s.id === world.userId) return true;
  if (s.kind === "goalie") return false;
  if (!chargedClear) return false;
  return Math.random() < CPU_CROWD_CLEAR_P;
}

/**
 * Height where this flight first meets the boards. Null when it lands on
 * the ice first. Same 60 Hz step as the live puck, so a clear that is still
 * climbing at the glass is not treated as an ice chip.
 */
function boardMeetY(
  x: number,
  z: number,
  vx: number,
  vz: number,
  vy: number,
  grav: number,
): number | null {
  const dt = 1 / 60;
  const damp = Math.exp(-PUCK_DRAG * dt);
  let px = x;
  let pz = z;
  let py = PUCK_Y + Math.max(0, vy) * 0.02;
  let pvx = vx;
  let pvz = vz;
  let pvy = vy;
  for (let i = 0; i < 480; i++) {
    const nx = px + pvx * dt;
    const nz = pz + pvz * dt;
    const ny = py + pvy * dt;
    const nvy = pvy - grav * dt;
    if (resolveRink(nx, nz, 0.09).hit) {
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) * 0.5;
        if (resolveRink(px + (nx - px) * mid, pz + (nz - pz) * mid, 0.09).hit) hi = mid;
        else lo = mid;
      }
      const iceT = ny < py ? (PUCK_Y - py) / (ny - py) : 2;
      if (ny <= PUCK_Y && iceT <= hi) return null;
      const xHit = px + (nx - px) * hi;
      const zHit = pz + (nz - pz) * hi;
      const yHit = py + (ny - py) * hi;
      const w = nearestBoards(xHit, zHit);
      return yHit > wallTop(w.nx, w.nz, w.x, w.z) - 0.08 ? yHit : -1;
    }
    px = nx;
    pz = nz;
    py = ny;
    pvy = nvy;
    if (py <= PUCK_Y) return null;
    pvx *= damp;
    pvz *= damp;
    if (Math.hypot(pvx, pvz) < 0.35) return null;
  }
  return null;
}

/** Highest loft at or below `vy` that meets the glass or the ice, not the seats. */
function keepShotUnderGlass(
  x: number,
  z: number,
  vx: number,
  vz: number,
  vy: number,
  grav: number,
): number {
  if (vy <= 0) return vy;
  const meet = boardMeetY(x, z, vx, vz, vy, grav);
  if (meet === null || meet < 0) return vy;
  let lo = 0;
  let hi = vy;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) * 0.5;
    const at = boardMeetY(x, z, vx, vz, mid, grav);
    if (at !== null && at > 0) hi = mid;
    else lo = mid;
  }
  return lo;
}

function holdCpuReleaseInRink(
  s: Skater,
  vx: number,
  vz: number,
  vy: number,
  grav: number,
): number {
  if (cpuKeepsCrowdArc(s)) return vy;
  const from = passOrigin(s);
  return keepShotUnderGlass(from.x, from.z, vx, vz, vy, grav);
}

/** Pass launch. A check in the moment before release cuts this puck only. */
function launchPass(
  s: Skater,
  vx: number,
  vz: number,
  vy = 0,
  saucer = false,
  sauceAim?: SauceAim,
): void {
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  const scaled = chargedHoriz(vx, vz);
  const m = checkedPassScale(s);
  let useVy = vy;
  let sauceCharge = -1;
  // No Select charge still sauces. Goalies were leaving on the flat 2.2 hop.
  // Speed stays whatever the pass already chose. Only the arc is filled in.
  const sauceNow = chargedSauce !== null ? chargedSauce : saucer && s.kind === "goalie" ? 1 : null;
  if (saucer && sauceNow !== null) {
    sauceCharge = sauceNow;
    const sp = Math.hypot(scaled.vx, scaled.vz) || 1;
    const dirx = scaled.vx / sp;
    const dirz = scaled.vz / sp;
    const full = sauceNow >= 0.999;
    const grav = full ? SAUCE_GRAV : 12;
    const zoneLand = full && !chargedClear ? fullSauceLand(s, dirx, dirz) : null;
    if (zoneLand) {
      useVy = sauceLaunchVy(zoneLand.dist, sp, zoneLand.wantY, 1, grav);
    } else {
      const aim = sauceAim ?? inferSauceAim(s, dirx, dirz);
      let want = chargedClear ? sauceClearY() : sauceNetY(sauceNow);
      if (aim.over && !chargedClear) {
        const wall = aim.wall ?? BOARD_H + GLASS_H;
        const intoCrowd = sauceNow >= SAUCE_CROWD_AT && Math.random() < SAUCE_CROWD_P;
        want = intoCrowd ? wall + 0.32 : sauceGlassY(sauceNow, wall);
      }
      useVy = sauceLaunchVy(aim.dist, sp, want, chargedClear ? 1 : sauceNow, chargedClear ? SAUCE_GRAV : grav);
      if (aim.bank && !aim.over && !zoneLand) {
        const from = passOrigin(s);
        useVy = bankContactVy(from.x, from.z, scaled.vx, scaled.vz, useVy);
      }
    }
  }
  if (m < 1) passSpeedCutFor = world.time;
  const flightGrav = saucer && sauceCharge >= 0.999 ? SAUCE_GRAV : 12;
  const lvy = holdCpuReleaseInRink(s, scaled.vx * m, scaled.vz * m, useVy * m, flightGrav);
  launchPuck(s, scaled.vx * m, scaled.vz * m, lvy);
  sauceLandCharge = sauceCharge;
  beginPassSpeedTrack(saucer);
}

function sauceWindowAllowed(): boolean {
  const user = world.skaters[world.userId];
  if (!user || world.puck.owner !== user.id) return false;
  if (world.faceoff || world.faceoffA || world.lineBrawl) return false;
  if (periodEndLive() && !periodEndUserPlay) return false;
  if (world.whistle && world.whistle !== "offside") return false;
  return true;
}

/** Select hold that counts toward sauce, starting when this possession can charge. */
function syncSauceWindow(act: Actions): void {
  const allow = sauceWindowAllowed();
  const down = act.viewDown;
  sauceReleaseClean = false;
  sauceReleaseFull = false;
  if (down && allow) {
    if (!sauceTracking) {
      sauceOffset = act.viewPress ? 0 : act.selectHoldFor;
      sauceClean = !act.aDown;
      sauceTracking = true;
    } else if (act.aDown) sauceClean = false;
    sauceHold = Math.max(0, act.selectHoldFor - sauceOffset);
    sauceCleanLive = sauceClean;
    return;
  }
  if (sauceTracking && !down && allow) {
    sauceHold = Math.max(0, act.selectHoldFor - sauceOffset);
    sauceReleaseClean = sauceClean && !act.aDown && sauceHold >= 0.05;
    sauceReleaseFull = sauceHold >= SAUCE_FULL_HOLD - 1e-3;
    sauceCleanLive = false;
    sauceTracking = false;
    sauceClean = true;
    sauceOffset = 0;
    return;
  }
  sauceHold = 0;
  sauceCleanLive = false;
  sauceTracking = false;
  sauceClean = true;
  sauceOffset = 0;
}

/** Dump. Higher and longer than a net saucer. Does not hunt a teammate. */
function launchHighClear(s: Skater, mx: number, my: number): void {
  if (s.kind === "goalie" && goalieMustHoldCover(s)) return;
  const { ax, az } = aimDir(s, mx, my);
  const from = passOrigin(s);
  const hit = rayBoard(from.x, from.z, ax, az, 70);
  const dist = Math.max(28, Math.min(52, hit ? hit.dist * 0.9 : 40));
  const speed = passChargeMps(PASS_FULL_HOLD, s.kind === "goalie");
  launchPass(s, ax * speed, az * speed, 0, true, { dist, over: false, bank: false });
  world.lastPass = world.time;
  world.lastPasser = s.id;
  world.lastPassX = s.x;
  world.lastPassZ = s.z;
  world.lastPassTo = null;
  if (s.kind !== "goalie") noteDrillUserPass(s);
  else noteGoaliePlayRelease(s);
}

/**
 * Select up. A full meter fires a saucer immediately. No extra second.
 * A clean hold of SAUCE_CLEAR_HOLD is still the longer high clear.
 * A user goalie also sends a partial saucer on a shorter clean release.
 * A skater's partial Select hold still waits for the A release.
 */
function releaseSelectSauce(act: Actions): void {
  if (!sauceReleaseClean && !sauceReleaseFull) return;
  if (passChargeCancel) return;
  const user = world.skaters[world.userId];
  if (!user || world.puck.owner !== user.id) return;
  if (world.time - world.lastPass <= 0.2) return;
  const hold = sauceHold;
  const full = sauceReleaseFull;
  const high = sauceReleaseClean && hold >= SAUCE_CLEAR_HOLD;
  const goalie = user.kind === "goalie";
  if (!full && !high && !goalie) return;
  if (goalie && goalieMustHoldCover(user)) return;
  const aim = shotAim(act);
  if (high) {
    withChargedPass(PASS_FULL_HOLD, true, hold, () => {
      launchHighClear(user, aim.mx, aim.my);
    }, goalie, true);
    return;
  }
  if (full) {
    withChargedPass(PASS_FULL_HOLD, true, SAUCE_FULL_HOLD, () => {
      if (goalie) doGoalieOutlet(user, aim.mx, aim.my, true);
      else doPass(user, aim.mx, aim.my, true);
    }, goalie, false);
    return;
  }
  withChargedPass(hold, true, hold, () => {
    doGoalieOutlet(user, aim.mx, aim.my, true);
  }, true, false);
}

function passJustStarting(s: Skater): boolean {
  if (world.puck.owner !== null) return false;
  if (world.lastPasser !== s.id) return false;
  if (!(world.lastShoot < world.lastPass)) return false;
  const age = world.time - world.lastPass;
  return age >= 0 && age <= PASS_CHECK_START;
}

function cutStartingPass(): void {
  if (passSpeedCutFor === world.lastPass) return;
  world.puck.vx *= PASS_CHECK_CUT;
  world.puck.vz *= PASS_CHECK_CUT;
  world.puck.vy *= PASS_CHECK_CUT;
  if (boardBank) {
    boardBank.vx *= PASS_CHECK_CUT;
    boardBank.vz *= PASS_CHECK_CUT;
  }
  if (boardRide) boardRide.speed *= PASS_CHECK_CUT;
  passSpeedCutFor = world.lastPass;
}

/** Stamp a body check on the carrier, and slow a pass that is just leaving their stick. */
function notePasserChecked(s: Skater): void {
  if (world.puck.owner === s.id || passJustStarting(s)) passerCheckedAt.set(s.id, world.time);
  if (passJustStarting(s)) cutStartingPass();
}

function dampCheckedPassRide(): void {
  if (passSpeedCutFor !== world.time) return;
  if (boardBank) {
    boardBank.vx *= PASS_CHECK_CUT;
    boardBank.vz *= PASS_CHECK_CUT;
  }
  if (boardRide) boardRide.speed *= PASS_CHECK_CUT;
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
      up * 0.42 +
      open * 0.8 +
      (aimed ? align * 12 : 1.6) +
      (s.kind === "winger" ? 0.45 : 0) -
      dist * 0.02;
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
  // User aim up = high flip. User aim down = full-rink shot. No ice-level clear.
  const up = aim.hgt > 0.22;
  return { flip: bank === 0 && up, bank, high: hold };
}

function cpuFarPlay(): FarPlay {
  // No high flip. A random loft was clearing the far crossbar.
  const r = Math.random();
  if (r < 0.5) return { flip: false, bank: 0, high: false };
  if (r < 0.75) return { flip: false, bank: -1, high: false };
  return { flip: false, bank: 1, high: false };
}

function farLuck(): FarLuck {
  // Length clear at the far net: 60% in, 30% wide, 10% post, 0% crossbar.
  const r = Math.random();
  if (r < 0.6) return "in";
  if (r < 0.9) return "wide";
  return "post";
}

/** Board bank only. More of them find the net. Never the post. */
function farBankLuck(): FarLuck {
  return Math.random() < 0.75 ? "in" : "wide";
}

function farAim(luck: FarLuck, bank: -1 | 0 | 1): { z: number; y: number | null } {
  const hw = GOAL_W / 2;
  const post = bank !== 0 ? bank : Math.random() < 0.5 ? 1 : -1;
  if (luck === "in") return { z: (Math.random() * 2 - 1) * (hw - 0.28), y: null };
  if (luck === "post") return { z: post * hw, y: null };
  // Wide, and a stale bar/over roll: beside the post, on the ice. Never the crossbar.
  return { z: post * (hw + 0.3 + Math.random() * 0.16), y: null };
}

function speedForTime(dist: number, t: number): number {
  const drag = PUCK_DRAG;
  const knee = drag * t;
  if (knee < 0.05) return dist / Math.max(0.12, t);
  return (dist * drag) / (1 - Math.exp(-knee));
}

function timeForArrival(dist: number, vend: number): number {
  const drag = PUCK_DRAG;
  return Math.log(1 + (Math.max(0.2, dist) * drag) / Math.max(0.8, vend)) / drag;
}

function loftTo(wantY: number, t: number): number {
  return Math.max(0, (wantY - PUCK_Y + 6 * t * t) / Math.max(0.12, t));
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
    const damp = Math.exp(-PUCK_DRAG / 60);
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

/**
 * Where this lob meets the far goal line. Same symplectic step as the puck
 * (y += vy*dt, vy -= 12*dt, ice drag PUCK_DRAG), so a crossbar shot is still above
 * the bar there. A closed form that uses 6*t*t calls that shot an ice shot.
 * attack > 0 means the far net is +X.
 */
function lobAtGoalLine(
  x: number,
  z: number,
  vx: number,
  vz: number,
  vy: number,
  netX: number,
  attack: number,
): { z: number; y: number } | null {
  const dt = 1 / 60;
  const damp = Math.exp(-PUCK_DRAG * dt);
  let px = x;
  let pz = z;
  let py = PUCK_Y + Math.max(0, vy) * 0.02;
  let pvx = vx;
  let pvz = vz;
  let pvy = vy;
  for (let i = 0; i < 480; i++) {
    const prevX = px;
    const prevZ = pz;
    const prevY = py;
    px += pvx * dt;
    pz += pvz * dt;
    py += pvy * dt;
    pvy -= 12 * dt;
    if (py <= PUCK_Y) {
      py = PUCK_Y;
      pvy = 0;
    }
    pvx *= damp;
    pvz *= damp;
    const before = attack > 0 ? prevX < netX : prevX > netX;
    const now = attack > 0 ? px >= netX : px <= netX;
    if (!(before && now)) {
      if (Math.hypot(pvx, pvz) < 0.3 && py <= PUCK_Y) return null;
      continue;
    }
    const span = px - prevX;
    const t = Math.abs(span) < 1e-6 ? 1 : (netX - prevX) / span;
    return { z: prevZ + (pz - prevZ) * t, y: prevY + (py - prevY) * t };
  }
  return null;
}

/**
 * A lob that will not pass through the mouth keeps its whole coast in front of
 * the far goal line. Mouth shots still slide in. A wide miss dies short of the
 * line instead of dropping behind the cage.
 * attack > 0 means the far net is +X. ux > 0 travels toward that net.
 */
function holdLobInFront(
  x: number,
  z: number,
  vx: number,
  vz: number,
  vy: number,
  netX: number,
  attack: number,
): { vx: number; vz: number } {
  const speed = Math.hypot(vx, vz);
  if (speed < 0.4) return { vx, vz };
  const ux = vx / speed;
  if (ux * attack <= 0.05) return { vx, vz };
  const path = (netX - x) / ux;
  if (!(path > 0.4)) return { vx, vz };
  const at = lobAtGoalLine(x, z, vx, vz, vy, netX, attack);
  if (at && Math.abs(at.z) <= GOAL_W / 2 - 0.04 && at.y <= GOAL_H - 0.02) return { vx, vz };
  const drag = PUCK_DRAG;
  const stop = Math.max(0.4, path - 1.1);
  const cap = drag * stop;
  if (speed <= cap) return { vx, vz };
  const scale = cap / speed;
  return { vx: vx * scale, vz: vz * scale };
}

/** Highest puck center that is still under the far crossbar. */
function lengthClearCeiling(): number {
  return Math.min(GOAL_H - 0.02, mouthTopY());
}

/**
 * Length-clear vy cannot carry the puck above the crossbar at the far goal
 * line. Same symplectic step as the puck. A shot that dies short is left as-is.
 */
function capLengthClearVy(
  x: number,
  z: number,
  vx: number,
  vz: number,
  vy: number,
  netX: number,
  attack: number,
): number {
  const limit = lengthClearCeiling();
  const clears = (up: number): boolean => {
    const at = lobAtGoalLine(x, z, vx, vz, up, netX, attack);
    return !!at && at.y > limit;
  };
  const launch = Math.max(0, vy);
  if (!clears(launch)) return launch;
  let lo = 0;
  let hi = launch;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) * 0.5;
    if (clears(mid)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * User high flip. Lands past center, in the other neutral zone or the other end.
 * Flight time stays short enough to stay in the rink. That speed still crosses
 * the far goal line after the landing, including when the first bounce is in
 * the neutral zone, so the 75% carry holds for every flip.
 */
function userHighFlipLaunch(
  from: { x: number; z: number },
  attack: number,
): { vx: number; vz: number; vy: number } {
  const edge = BLUE_X + BLUE_LINE_W * 0.5;
  const nzHi = Math.max(1.35, edge - 0.4);
  const dzLo = edge + 0.55;
  const dzHi = Math.max(dzLo + 1, GOAL_LINE_X - 3.2);
  let depth =
    Math.random() < 0.5
      ? 0.95 + Math.random() * (nzHi - 0.95)
      : dzLo + Math.random() * (dzHi - dzLo);
  depth = Math.max(depth, 0.9, from.x * attack + 2.2);
  const zoneCap = GOAL_LINE_X - 2.4;
  if (depth > zoneCap) depth = zoneCap;
  if (depth < 0.9) depth = 0.9;
  const landX = attack * depth;
  const post = GOAL_W / 2;
  const wide = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
  const landZ = wide * (post + 0.7 + Math.random() * 4.8);
  const dx = landX - from.x;
  const dz = landZ - from.z;
  const dist = Math.hypot(dx, dz) || 1;
  const ux = dx / dist;
  const uz = dz / dist;
  const netX = attack * GOAL_LINE_X;
  const toLine = ux * attack > 0.08 ? Math.max(0.5, (netX - landX) / ux) : Math.abs(netX - landX);
  let t = 1.12 + Math.random() * 0.36;
  const need = PUCK_DRAG * (toLine + 1.25);
  const ratio = need / (dist * PUCK_DRAG);
  if (ratio > 0) {
    const tMax = -Math.log(ratio / (1 + ratio)) / PUCK_DRAG;
    if (t > tMax) t = Math.max(0.82, tMax * 0.9);
  }
  const speed = speedForTime(dist, t);
  const vy = (6 * t * t) / Math.max(0.12, t + 0.02);
  return { vx: ux * speed, vz: uz * speed, vy };
}

/** Goal-line z of a bank, using the same board snap as the puck. */
function predictBankCrossZ(
  x: number,
  z: number,
  vx: number,
  vz: number,
  netX: number,
  attack: number,
): number | null {
  const dt = 1 / 60;
  const damp = Math.exp(-PUCK_DRAG * dt);
  let px = x;
  let pz = z;
  let pvx = vx;
  let pvz = vz;
  for (let i = 0; i < 420; i++) {
    const prevX = px;
    const prevZ = pz;
    px += pvx * dt;
    pz += pvz * dt;
    pvx *= damp;
    pvz *= damp;
    const hit = resolveRink(px, pz, 0.09);
    if (hit.hit) {
      px = hit.x;
      pz = hit.z;
      const b = reflectBoard(pvx, pvz, hit.nx, hit.nz);
      pvx = b.vx;
      pvz = b.vz;
    }
    const before = attack > 0 ? prevX < netX : prevX > netX;
    const now = attack > 0 ? px >= netX : px <= netX;
    if (before && now) {
      const span = px - prevX;
      const t = Math.abs(span) < 1e-6 ? 1 : (netX - prevX) / span;
      return prevZ + (pz - prevZ) * t;
    }
    if (Math.hypot(pvx, pvz) < 0.4) break;
  }
  return null;
}

function bankClipsPost(z: number | null): boolean {
  if (z === null) return false;
  return Math.abs(Math.abs(z) - GOAL_W / 2) <= POST_HIT_R + 0.05;
}

/** A goalie bank marked to score. The crease must not field it before the goal line. */
let goalieBankLive = false;

/** Pull a bank target off the pipe. Into the net stays inside; a miss stays outside. */
function separateBankZ(z: number, intoNet: boolean, bank: -1 | 1): number {
  const hw = GOAL_W / 2;
  const gap = POST_HIT_R + 0.26;
  if (intoNet) {
    // Just inside the pipe on the bank side. The middle of the net is the goalie's body.
    const inside = hw - gap;
    return bank * (inside - Math.random() * 0.08);
  }
  const minOut = hw + gap;
  if (bank > 0) return z >= minOut ? z : minOut + Math.random() * 0.22;
  return z <= -minOut ? z : -(minOut + Math.random() * 0.22);
}

function goalieLengthPlay(s: Skater, play: FarPlay, registerShot = true): void {
  const attack = attackDir(s.side);
  const from = passOrigin(s);
  const netX = attack * GOAL_LINE_X;
  const drag = PUCK_DRAG;
  const damp = BOARD_BOUNCE_DAMP;
  const homeStick = s.side === "home";
  // Away CPU length shot only. cpuFarPlay never sets flip and high together.
  const cpuLengthShot =
    s.side === "away" && s.id !== world.userId && play.flip && play.high && play.bank === 0;
  // Straight user clear: aim up is the high flip, anything else is the full-rink shot.
  let keepRink = (homeStick && play.bank === 0 && !play.flip) || (cpuLengthShot && cpuGoalieShotLook(s));
  let luck = play.bank !== 0 ? farBankLuck() : farLuck();
  if (keepRink) luck = "in";
  const aim = farAim(luck, play.bank);
  let sealed: { vx: number; vz: number; vy: number } | null = null;
  let vx = 0;
  let vz = 0;
  let vy = 0.2;
  let path = Math.abs(netX - from.x);
  let banked = false;
  let lob = false;

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
    lob = true;
    const span = Math.abs(netX - from.x);
    const drop = Math.max(2.6, Math.min(front, span - 2.2));
    const landX = netX - attack * drop;
    const dist = Math.hypot(landX - from.x, aim.z - from.z) || 1;
    const vend = 6.2 + drag * drop;
    const t = Math.max(0.95, Math.min(2.35, timeForArrival(dist, vend)));
    fireDirect(landX, aim.z, speedForTime(dist, t), 6 * t);
    path = dist + drop;
  };
  const fireIce = (): void => {
    const dist = Math.hypot(netX - from.x, aim.z - from.z) || 1;
    fireDirect(netX, aim.z, drag * dist + iceArrive(), 0.05 + Math.random() * 0.16);
  };

  if (play.bank === 0) {
    if (homeStick && play.flip) {
      sealed = userHighFlipLaunch(from, attack);
      vx = sealed.vx;
      vz = sealed.vz;
      vy = sealed.vy;
      path = Math.hypot(netX - from.x, from.z);
    } else if (homeStick || cpuLengthShot) {
      // Full-rink shot. Same lob as before: lands in front of the far goalie.
      fireFlip(9 + Math.random() * 6);
    } else fireIce();
  } else {
    const bankSide: -1 | 1 = play.bank < 0 ? -1 : 1;
    const launchBank = (targetZ: number): boolean => {
      const B = bankSide * (RINK_W / 2 - 0.09);
      const along0 = from.x * attack;
      const alongG = GOAL_LINE_X;
      const Bz = B - from.z;
      const Bg = B - targetZ;
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
      const dz2 = targetZ - B;
      const L2 = Math.hypot(dx2, dz2) || 1;
      const straight =
        Math.abs(denom) > 1 && dz1 * bankSide > 0.4 && Math.abs(xB) < RINK_L / 2 - CORNER_R - 1.2;
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
            const zOut = B + (targetZ - B) * u;
            if (Math.abs(zOut) > iceWidthAtX(xOut) / 2 - 0.16) clear = false;
          }
        }
      }
      if (!clear) return false;
      const ux = dx1 / L1;
      const uz = dz1 / L1;
      const speed = (iceArrive() + drag * L2) / damp + drag * L1;
      vx = ux * speed;
      vz = uz * speed;
      path = L1 + L2;
      vy = homeStick && play.high ? 3.2 : 0.1;
      banked = true;
      lob = false;
      return true;
    };
    const intoNet = luck === "in";
    aim.z = separateBankZ(aim.z, intoNet, bankSide);
    const bankCross = (): number | null => predictBankCrossZ(from.x, from.z, vx, vz, netX, attack);
    let played = launchBank(aim.z);
    if (played && bankClipsPost(bankCross())) {
      aim.z = intoNet
        ? bankSide * (0.16 + Math.random() * 0.32)
        : bankSide * (GOAL_W / 2 + POST_HIT_R + 0.55 + Math.random() * 0.2);
      played = launchBank(aim.z);
      if (played && bankClipsPost(bankCross())) {
        played = false;
        banked = false;
      }
    }
    if (!played) {
      banked = false;
      if (homeStick) {
        // A board angle that cannot be played is still not an ice clear.
        keepRink = true;
        luck = "in";
        aim.z = farAim("in", 0).z;
        fireFlip(9 + Math.random() * 6);
      } else fireIce();
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
  if (banked) {
    vy = homeStick
      ? vyForBank(from.x, from.z, vx, vz, play.high)
      : bankContactVy(from.x, from.z, vx, vz, vy);
  }
  vy = capLengthClearVy(from.x, from.z, vx, vz, vy, netX, attack);
  if (lob && !banked && !keepRink) {
    const at = lobAtGoalLine(from.x, from.z, vx, vz, vy, netX, attack);
    const onPost =
      luck === "post" &&
      !!at &&
      Math.abs(Math.abs(at.z) - GOAL_W / 2) <= 0.22 &&
      at.y <= lengthClearCeiling();
    if (!onPost) {
      const held = holdLobInFront(from.x, from.z, vx, vz, vy, netX, attack);
      vx = held.vx;
      vz = held.vz;
    }
  }
  vy = capLengthClearVy(from.x, from.z, vx, vz, vy, netX, attack);
  if (chargedPassPower !== null && !sealed) {
    const scaled = chargedHoriz(vx, vz);
    vx = scaled.vx;
    vz = scaled.vz;
    if (lob && !banked && !keepRink) {
      const held = holdLobInFront(from.x, from.z, vx, vz, vy, netX, attack);
      vx = held.vx;
      vz = held.vz;
    }
    vy = capLengthClearVy(from.x, from.z, vx, vz, vy, netX, attack);
  }
  if (sealed) {
    vx = sealed.vx;
    vz = sealed.vz;
    vy = sealed.vy;
  }
  if (s.id !== world.userId) vy = keepShotUnderGlass(from.x, from.z, vx, vz, vy, 12);
  launchPuck(s, vx, vz, vy);
  goalieBankLive = banked;
  if (world.time - world.goalieSaveT > 1.35 || path > 12) {
    world.reboundN = 0;
    world.reboundSoft = false;
  }
  world.goalieShot = sealed ? "out" : luck === "in" ? "score" : "out";
  world.lastPassTo = null;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  world.lastShotCorner = false;
  world.lastShotCornerSide = 0;
  if (!registerShot) {
    beginPassSpeedTrack(false);
    noteGoaliePlayRelease(s);
    return;
  }
  world.lastShoot = world.time;
  world.lastShotSlap = false;
  world.lastShotBackhand = false;
  world.lastShotKind = null;
  world.lastShotOneTimer = false;
  world.lastShotRedirect = false;
  world.lastShooter = s.id;
  world.lastShotDist = path;
  beginShotSpeedTrack();
  noteGoaliePlayRelease(s);
}

/** In their end, a goalie waits out the cover hold before a pass or clear. */
function goalieMustHoldCover(s: Skater): boolean {
  // A live shootout never runs the cover clock, so the hold would block every release.
  // The save celebration is phase result. The goalie can still pass, saucer, or shoot.
  const soHold = world.shootout;
  if (s.side === "home" && soHold && (soHold.phase === "live" || soHold.phase === "result")) return false;
  return goalieDefendZone(s.side, world.puck.x) && world.coverT < GOALIE_HOLD;
}

function passFindLocked(directed: boolean): { skipFind: boolean; lock: boolean } {
  if (!directed) return { skipFind: false, lock: true };
  const ui = useGame.getState();
  // Pause Pass Lock ON is ignoreAutoFind off, so a teammate can be found.
  const skipFind = ui.ignoreAutoFind;
  return { skipFind, lock: ui.passLock && !skipFind };
}

function doGoalieOutlet(s: Skater, mx: number, my: number, saucer: boolean, fromUser = false): void {
  if (periodEndLive() && !periodEndUserPlayOk(s)) return;
  const directed = fromUser || s.id === world.userId;
  // One A release is the ice pass. A second A has no extra goalie action.
  const userIce = directed && s.kind === "goalie" && !saucer;
  if (!userIce && goalieMustHoldCover(s)) return;
  s.coverPose = 0;
  world.coverT = 0;
  const { ax, az } = aimDir(s, mx, my);
  const aimed = Math.hypot(mx, my) > (s.side === "home" ? 0.22 : 0.16);
  const { skipFind, lock } = passFindLocked(directed);
  let mate: Skater | null = null;
  if (skipFind || (directed && !lock && aimed)) {
    freeAimToLane(s, ax, az, saucer, !skipFind);
    mate = world.lastPassTo === null ? null : (world.skaters[world.lastPassTo] ?? null);
  } else {
    mate = clearPassTarget(s, ax, az, aimed);
    if (mate) {
      tapePass(s, mate, saucer);
    } else if (saucer) {
      freeAimToLane(s, ax, az, true, !skipFind);
    } else if (userIce) {
      freeAimToLane(s, ax, az, false, !skipFind);
    } else if (s.side === "home") {
      goalieLengthPlay(s, farPlayFromStick(mx, my, saucer), false);
    } else {
      goalieLengthPlay(s, cpuFarPlay(), false);
    }
  }
  world.lastPass = world.time;
  world.lastPasser = s.id;
  world.lastPassX = s.x;
  world.lastPassZ = s.z;
  world.coverT = 0;
  s.coverPose = 0;
  if (mate) pausePassChainHold(s.id);
  else stopPassChainHold(s.id);
  noteGoaliePlayRelease(s);
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

function aimIsBoard(
  from: { x: number; z: number },
  ax: number,
  az: number,
  hit: BoardHit,
): boolean {
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

function launchBank(
  s: Skater,
  ax: number,
  az: number,
  hit: BoardHit,
  mate: Skater,
  saucer = false,
): void {
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
  launchPass(
    s,
    ax * inSpeed,
    az * inSpeed,
    vy,
    saucer,
    saucer ? { dist: hit.dist, over: false, bank: true } : undefined,
  );
  boardBank = { hx: hit.x, hz: hit.z, vx: ovx, vz: ovz, until: world.time + 1.8, loft: saucer };
  dampCheckedPassRide();
  world.lastPassTo = mate.id;
  world.oneTimerUntil = world.time + 2.2;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
}

function launchBoardRim(
  s: Skater,
  ax: number,
  az: number,
  nx: number,
  nz: number,
  dir: 1 | -1,
): void {
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
  launchPass(s, vx, vz, 0.02);
  boardRide = { dir, speed, until: world.time + 5.2, phase: "seek" };
  dampCheckedPassRide();
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
  launchPass(s, vx, vz, bankContactVy(from.x, from.z, vx, vz, 0.03));
  dampCheckedPassRide();
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
  launchPass(s, vx, vz, bankContactVy(from.x, from.z, vx, vz, 2.2), true, {
    dist: travel,
    over: true,
    bank: false,
    wall: wallTop(hit.nx, hit.nz, hit.x, hit.z),
  });
  dampCheckedPassRide();
  world.lastPassTo = null;
  world.oneTimerUntil = world.time + 2.2;
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
}

/** Pure board reflection, continued to a goal mouth. Angle only: damp does not change it. */
function boardReflectsIntoNet(
  hx: number,
  hz: number,
  ax: number,
  az: number,
  nx: number,
  nz: number,
): boolean {
  const refl = reflectBoard(ax, az, nx, nz, 1);
  const sp = Math.hypot(refl.vx, refl.vz);
  if (sp < 1e-4) return false;
  const rx = refl.vx / sp;
  const rz = refl.vz / sp;
  for (const side of [1, -1] as const) {
    if (rx * side <= 0.08) continue;
    const mouth = side * GOAL_LINE_X;
    const dx = mouth - hx;
    if (dx * side <= 0.3) continue;
    const t = dx / rx;
    if (t < 0.35 || t > 46) continue;
    if (Math.abs(hz + rz * t) <= GOAL_W / 2 - 0.06) return true;
  }
  return false;
}

/** Already-reflected flight. Does not bounce again. */
function flightEntersMouth(x: number, z: number, vx: number, vz: number): boolean {
  const sp = Math.hypot(vx, vz);
  if (sp < 1.2) return false;
  for (const side of [1, -1] as const) {
    if (vx * side <= 0.2) continue;
    const mouth = side * GOAL_LINE_X;
    const dx = mouth - x;
    if (dx * side <= 0.15) continue;
    const t = dx / vx;
    if (t < 0 || t > 3.5) continue;
    if (Math.abs(z + vz * t) <= GOAL_W / 2 - 0.05) return true;
  }
  return false;
}

function userBoardPass(s: Skater, ax: number, az: number, saucer = false, lock = true): boolean {
  const steerMate = (hit: BoardHit): Skater | null => (lock ? bankTarget(hit, ax, az, s) : null);
  const from = passOrigin(s);
  const hit = rayBoard(from.x, from.z, ax, az, 46);
  if (hit && boardReflectsIntoNet(hit.x, hit.z, ax, az, hit.nx, hit.nz)) {
    if (saucer) launchSaucerBoard(s, ax, az, hit);
    else launchBoardCarom(s, ax, az, hit);
    return true;
  }
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
    const bankMate = steerMate(hit);
    if (bankMate && (atWall || hit.dist < 14)) {
      launchBank(s, ax, az, hit, bankMate, true);
      return true;
    }
    launchSaucerBoard(s, ax, az, hit);
    return true;
  }
  if (along && !intoNear && !intoBoard(ax, az, 0, along)) {
    if (atWall && hit && hit.dist < 14) {
      const bankMate = steerMate(hit);
      if (bankMate) {
        launchBank(s, ax, az, hit, bankMate);
        return true;
      }
    }
    launchBoardRim(s, ax, az, 0, along, rideDir(0, along, ax, az, attack));
    return true;
  }
  if (!atWall || !hit) return false;
  const bankMate = steerMate(hit);
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
  if (flightEntersMouth(puck.x, puck.z, puck.vx, puck.vz)) {
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
  if (periodEndLive() && !periodEndUserPlayOk(s)) return;
  if (s.kind === "goalie") {
    passMeet = null;
    doGoalieOutlet(s, mx, my, saucer, s.id === world.userId);
    return;
  }
  pausePassChainHold(s.id);
  passMeet = null;
  const { ax, az } = aimDir(s, mx, my);
  const aimed = Math.hypot(mx, my) > 0.22;
  const directed = s.id === world.userId;
  const { skipFind, lock } = passFindLocked(directed);
  if (directed && aimed && !skipFind && userBoardPass(s, ax, az, saucer, lock)) {
    world.lastPass = world.time;
    world.lastPasser = s.id;
    world.lastPassX = s.x;
    world.lastPassZ = s.z;
    noteDrillUserPass(s);
    return;
  }
  if (skipFind || (directed && !lock && aimed)) {
    freeAimToLane(s, ax, az, saucer, !skipFind);
  } else {
    const mate = bestPassTarget(s, ax, az, aimed);
    if (mate) {
      tapePass(s, mate, saucer);
    } else if (aimed) {
      freeAimToLane(s, ax, az, saucer);
    } else {
      const power = chargedPassPower ?? (saucer ? 17.6 : 16.4);
      launchPass(s, ax * power, az * power, saucer ? 3.4 : 0.06, saucer);
      world.lastPassTo = null;
    }
  }
  world.lastPass = world.time;
  world.lastPasser = s.id;
  world.lastPassX = s.x;
  world.lastPassZ = s.z;
  noteDrillUserPass(s);
}

function armDrillShot(): void {
  if (useGame.getState().clockMode !== "drill") return;
  cpuDrillNoted = false;
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
  const netX = drillAttackSide() * GOAL_LINE_X;
  const dist = Math.hypot(netX - world.puck.x, world.puck.z) || 1;
  const power = Math.hypot(world.puck.vx, world.puck.vz) || 1;
  drillRecastAt = world.time + Math.min(1, dist / power);
  drillFlightStashed = false;
  if (!passGoesBack(s)) return;
  spawnDrillGhost(world.puck, true);
  giveUserPuck();
}

function shotAim(act: Actions): { mx: number; my: number } {
  if (useGame.getState().controlProfile === "stick") return { mx: act.moveX, my: act.moveY };
  const rm = Math.hypot(act.aimX, act.aimY);
  if (rm > 0.16) return { mx: act.aimX, my: act.aimY };
  return { mx: act.moveX, my: act.moveY };
}

export function attackCompass(): "up" | "down" | "left" | "right" {
  return world.aimCompassLock === "down" ? "down" : "up";
}

export function cycleAimCompass(): void {
  world.aimCompassLock = attackCompass() === "down" ? "up" : "down";
}

function aimZSign(side: "home" | "away"): 1 | -1 {
  // Drill looks toward the +X target net, so screen-right follows the camera, not homeAttack.
  if (useGame.getState().clockMode === "drill") return world.camRz >= 0 ? 1 : -1;
  return attackDir(side) >= 0 ? 1 : -1;
}

function stickToNetAim(
  mx: number,
  my: number,
  _side: "home" | "away",
): { lat: number; hgt: number } {
  mx = Math.max(-1, Math.min(1, mx));
  my = Math.max(-1, Math.min(1, my));
  const c = attackCompass();
  let lat: number;
  let hgt: number;
  if (c === "up") {
    lat = mx;
    hgt = my;
  } else if (c === "down") {
    // Down swaps the shooter's left and right only. Stick up still aims up.
    lat = -mx;
    hgt = my;
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
  const dragK = PUCK_DRAG;
  let travel = Math.max(0.08, flight);
  const kneel = dragK * flight;
  if (kneel > 0.02 && kneel < 0.9) travel = -Math.log(1 - kneel) / dragK;
  const vy = (wantY - PUCK_Y + 6 * travel * travel) / Math.max(0.08, travel + 0.02);
  return Math.max(0, Math.min(8.2, vy));
}

function cornerArriveVy(wantY: number, dist: number, power: number): number {
  const dragK = PUCK_DRAG;
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

function safeRimRelease(
  x: number,
  z: number,
  side: 1 | -1,
  sideZ: 1 | -1,
): { x: number; z: number } {
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

function clearShotShape(): void {
  shotSharp = 0;
  shotReleaseZ = 0;
  shotBelowLine = false;
  shotFromLine = 99;
  meshAbsorbShot = false;
  belowLineDeflectId = -1;
  meshRestUntil = -1;
  meshRestShelf = false;
}

/** Outside the dot and below it, toward the net. 1 is the corner just above the goal line. */
function sharpGeometry(
  x: number,
  z: number,
  attack: number,
): { sharp: number; below: boolean; near: 1 | -1 } {
  const fromLine = (attack * GOAL_LINE_X - x) * attack;
  const dotDepth = GOAL_LINE_X - FACEOFF_EZ_X;
  const outside = Math.abs(z) - FACEOFF_SPOT_Z;
  const near = (Math.sign(z) || 1) as 1 | -1;
  const below = fromLine < -0.04;
  if (outside <= 0.02 || fromLine >= dotDepth) return { sharp: 0, below, near };
  const wideSpan = Math.max(0.35, RINK_W / 2 - 0.45 - FACEOFF_SPOT_Z);
  const wide = Math.min(1, outside / wideSpan);
  const depth = fromLine <= 0 ? 1 : (dotDepth - fromLine) / dotDepth;
  return { sharp: Math.min(1, depth * 0.58 + wide * 0.58), below, near };
}

function creaseCrowd(attack: number): { goalie: Skater | null; skaters: Skater[] } {
  const mouth = attack * GOAL_LINE_X;
  const cx = mouth - attack * 0.85;
  const defend: "home" | "away" = attack === world.homeAttack ? "away" : "home";
  let goalie: Skater | null = null;
  const skaters: Skater[] = [];
  for (const s of world.skaters) {
    if (Math.hypot(s.x - cx, s.z) > CREASE_R + 1.15) continue;
    if (s.kind === "goalie") {
      if (s.side === defend) goalie = s;
      continue;
    }
    skaters.push(s);
  }
  skaters.sort((a, b) => Math.hypot(a.x - cx, a.z) - Math.hypot(b.x - cx, b.z));
  return { goalie, skaters };
}

function launchBelowLineShot(s: Skater, attack: number, power: number): number {
  const from = stickBlade(s);
  const near = (Math.sign(from.z) || 1) as 1 | -1;
  const mouth = attack * GOAL_LINE_X;
  const hw = GOAL_W / 2;
  const roll = Math.random();
  let tx = mouth;
  let tz = near * hw;
  let absorb = false;
  let deflect = -1;
  if (roll < 0.2) {
    absorb = true;
    const depth = Math.max(0.22, cageDepthAt(hw * 0.72, 0.15));
    if (Math.random() < 0.65) {
      tx = mouth + attack * depth * 0.42;
      tz = near * (hw - 0.04);
    } else {
      tx = mouth + attack * depth * 0.82;
      tz = near * hw * 0.35;
    }
  } else if (roll < 0.7) {
    tx = mouth;
    tz = near * hw;
  } else {
    tx = mouth - attack * 1.15;
    tz = -near * (hw + 0.65);
    const span = tx - from.x;
    if (Math.abs(span) > 1e-4) {
      const t = (mouth - from.x) / span;
      const zCross = from.z + (tz - from.z) * t;
      if (Math.abs(zCross) < hw + 0.2) tz = -near * (hw + 1.15);
    }
    const chance = creaseCrowd(attack);
    const n = Math.min(3, chance.skaters.length);
    const p = n <= 0 ? (chance.goalie ? 0.05 : 0) : n === 1 ? 0.2 : n === 2 ? 0.3 : 0.4;
    const id = n > 0 ? chance.skaters[0]!.id : chance.goalie ? chance.goalie.id : -1;
    if (id >= 0 && Math.random() < p) {
      const body = world.skaters[id];
      if (body) {
        deflect = id;
        tx = body.x;
        tz = body.z;
      }
    }
  }
  const dx = tx - from.x;
  const dz = tz - from.z;
  const dist = Math.hypot(dx, dz) || 1;
  const sp = Math.max(8, power);
  launchPuck(s, (dx / dist) * sp, (dz / dist) * sp, 0.05);
  shotBelowLine = true;
  shotSharp = 1;
  shotReleaseZ = from.z;
  shotFromLine = (attack * GOAL_LINE_X - from.x) * attack;
  shotAttack = attack >= 0 ? 1 : -1;
  meshAbsorbShot = absorb;
  belowLineDeflectId = deflect;
  if (roll >= 0.2 && roll < 0.7) shotIron = { kind: "post", z: near * hw, y: PUCK_Y + 0.1 };
  clampHorizMph(SKATER_SHOT_HI_MPH);
  return dist;
}

function maybeCreaseDeflect(puck: Puck): void {
  if (periodEndLive()) return;
  if (belowLineDeflectId < 0) return;
  const s = world.skaters[belowLineDeflectId];
  if (!s) {
    belowLineDeflectId = -1;
    return;
  }
  if (Math.hypot(puck.x - s.x, puck.z - s.z) > s.radius + 0.38) return;
  const mouth = shotAttack * GOAL_LINE_X;
  const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
  const dx = mouth - puck.x;
  const dz = -puck.z * 0.35;
  const len = Math.hypot(dx, dz) || 1;
  const keep = cap * 0.45;
  writeRebound(puck, (dx / len) * keep, Math.min(0.1, puck.vy), (dz / len) * keep, cap);
  belowLineDeflectId = -1;
}

function holdMeshRest(): void {
  if (!meshRestShelf || world.time > meshRestUntil) return;
  const puck = world.puck;
  const hw = GOAL_W / 2;
  if (Math.abs(puck.z) > hw - 0.02) return;
  let held = false;
  for (const side of [1, -1] as const) {
    const along = (puck.x - side * GOAL_LINE_X) * side;
    if (along > 0.02 && along < 0.7) held = true;
  }
  if (!held || puck.y > meshRestY + 0.02) return;
  puck.y = meshRestY;
  if (puck.vy < 0) puck.vy = 0;
}

/**
 * Share of the old CPU aim error that remains. Tightened again from 0.28 to 0.14.
 * Independent of the six skill sliders — do not fold this into cpuMul or userMul.
 * cpuReleaseSharp scales this down on poor angles and pulls the aim inside the mouth.
 * Distance falloff stays. A miss that remains sits near the post or the bar.
 */
const CPU_SHOT_ERR = 0.14;

function cpuShotRelease(s: Skater): boolean {
  return s.side === "away" && s.id !== world.userId && s.kind !== "goalie";
}

/** 0 straight on, 1 in the corner or just below the goal line. Continuous in |z| and depth. */
function cpuReleaseSharp(x: number, z: number, attack: number): number {
  const fromLine = (attack * GOAL_LINE_X - x) * attack;
  const depth = Math.max(0.45, fromLine);
  const ang = Math.atan(Math.abs(z) / depth) / (Math.PI / 2);
  const behind = fromLine < 0.6 ? Math.min(1, (0.6 - fromLine) / 2.2) : 0;
  const look = Math.max(0, ang * 1.2 - 0.22);
  return Math.max(0, Math.min(1, Math.max(look, sharpGeometry(x, z, attack).sharp, behind)));
}

function cpuAimErr(sharp: number): number {
  const u = Math.max(0, Math.min(1, sharp));
  return CPU_SHOT_ERR * (1 - 0.7 * u);
}

/**
 * Pull a CPU goal-line target inside the mouth.
 * A sharp look that was aimed at the near post fades toward center.
 */
function cpuInsideTarget(tZ: number, sharp: number, shooterZ: number, openSign: number): number {
  const half = GOAL_W / 2;
  const u = Math.max(0, Math.min(1, sharp));
  const near = Math.sign(shooterZ) || 1;
  const prefer = openSign === 0 ? Math.sign(tZ) || -near : openSign;
  const intoNear = prefer === near && Math.abs(shooterZ) > half * 0.9;
  const side = intoNear ? prefer * (1 - u) : prefer;
  const pocket = side * half * (0.4 - 0.26 * u);
  const pull = 0.22 + 0.74 * u;
  let z = tZ + (pocket - tZ) * pull;
  const limit = half * (0.78 - 0.46 * u);
  if (z > limit) z = limit;
  else if (z < -limit) z = -limit;
  return z;
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
  const drillAim = useGame.getState().clockMode === "drill";
  const cpuDrillErr = drillAim && cpuDrillProbe && cpuShotRelease(s);
  const attack = drillAim ? drillAttackSide() : attackDir(s.side);
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
  const geo = sharpGeometry(from.x, from.z, attack);
  world.lastShotCorner = lowCorner || geo.sharp > 0.45;
  world.lastShotCornerSide = world.lastShotCorner ? Math.sign(from.z || 1) : 0;
  shotIron = null;
  if (geo.below && !drillAim && !lock && !bodyAim && !cpuShotRelease(s)) {
    return launchBelowLineShot(s, attack, power);
  }
  const cpuClear = !!lock && cpuShotRelease(s) && lock.wantY > mouthTopY();
  const cpuWide = !!lock && cpuShotRelease(s) && Math.abs(lock.tZ) > half - 0.02;
  tZ = cpuWide ? lock.tZ : Math.max(-half + 0.12, Math.min(half - 0.12, tZ));
  wantY = Math.max(PUCK_Y, Math.min(cpuClear ? mouthTopY() + 0.55 : mouthTopY(), wantY));
  if (geo.sharp > 0.08 && !lock && !bodyAim && !drillAim) {
    const farZ = -geo.near * half;
    const nearZ = geo.near * half;
    const farR = 0.09 * (1 + 2 * geo.sharp);
    const nearR = 0.09 * (1 + 1.5 * geo.sharp);
    const barBand = 0.07 * (1 + geo.sharp);
    if (Math.abs(tZ - farZ) < farR && wantY < GOAL_H - 0.04) {
      tZ = farZ;
      shotIron = { kind: "post", z: farZ, y: wantY };
    } else if (Math.abs(tZ - nearZ) < nearR && wantY < GOAL_H - 0.04) {
      tZ = nearZ;
      shotIron = { kind: "post", z: nearZ, y: wantY };
    } else if (GOAL_H - wantY < barBand && Math.abs(tZ) < half - 0.08) {
      wantY = mouthTopY();
      shotIron = { kind: "bar", z: tZ, y: GOAL_H };
    }
    sprayAmt *= 1 - 0.92 * geo.sharp;
  }
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
  if (cpuShotRelease(s) && !drillAim) {
    const sharp = cpuReleaseSharp(from.x, from.z, attack);
    if (!lock) {
      const side = g ? -Math.sign(g.z || 1) : -geo.near;
      tZ = cpuInsideTarget(tZ, sharp, from.z, side);
    } else if (Math.abs(tZ) > half - 0.02) {
      const signZ = Math.sign(tZ) || 1;
      const past = Math.abs(tZ) - (half - 0.02);
      tZ = signZ * (half + 0.03 + Math.min(0.2, past));
    }
    if (wantY <= mouthTopY() + 0.02) {
      const midY = PUCK_Y + (mouthTopY() - PUCK_Y) * 0.5;
      // A chosen top-shelf pocket stays under the bar. Sharp angles ease it in, they do not drop it to the middle.
      const shelfKeep =
        cpuShotRelease(s) &&
        !drillAim &&
        wantY > midY + (mouthTopY() - midY) * 0.55 &&
        cpuStandingCells(s)?.top.length;
      const pull = shelfKeep ? 0.16 * sharp : 0.7 * sharp;
      wantY += (midY - wantY) * pull;
      wantY = Math.max(PUCK_Y + 0.04, Math.min(mouthTopY(), wantY));
    } else {
      wantY = Math.min(wantY, mouthTopY() + 0.12 + 0.4 * (1 - sharp));
    }
    if (Math.abs(tZ) < half - 0.16 && wantY < GOAL_H - 0.05) shotIron = null;
  }
  const dx = netX - from.x;
  const dz = tZ - from.z;
  const dist = Math.hypot(dx, dz) || 1;
  const ax = dx / dist;
  const az = dz / dist;
  if (drillAim && !cpuDrillErr) sprayAmt = 0;
  else if (geo.sharp > 0.2) sprayAmt *= 0.2;
  else sprayAmt = Math.min(1.5, sprayAmt + 0.045 * dist);
  // Same CPU factor as shootAtNet / cpuOneTimerShot. Sharp angles spray even less. User spray is left alone.
  if (cpuShotRelease(s)) {
    const sharp = cpuReleaseSharp(from.x, from.z, attack);
    sprayAmt *= cpuAimErr(sharp) * (1 - 0.55 * sharp);
  }
  const spray = ironKind || (drillAim && !cpuDrillErr) || shotIron ? 0 : (Math.random() - 0.5) * sprayAmt;
  const flight = Math.max(0.14, dist / Math.max(8, power));
  if (drillAim) {
    drillRecastAt = world.time + drillArriveTime(dist, power);
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
  let vy =
    drillCorner || ironKind === "bar"
      ? cornerArriveVy(wantY, dist, power)
      : arriveVy(wantY, flight, loft);
  // Top-shelf scrimmage looks were landing a row low. Use the corner arrival so they reach under the bar.
  if (
    cpuShotRelease(s) &&
    !drillAim &&
    !drillCorner &&
    ironKind === null &&
    wantY > PUCK_Y + (mouthTopY() - PUCK_Y) * 0.72 &&
    cpuStandingCells(s)?.top.length
  ) {
    vy = Math.max(vy, cornerArriveVy(Math.min(wantY, mouthTopY() - 0.02), dist, power));
  }
  if (!drillCorner && ironKind === null && wantY > mouthTopY()) {
    const dragK = PUCK_DRAG;
    let travel = Math.max(0.14, dist / Math.max(8, power));
    const kneel = dragK * travel;
    if (kneel > 0.02 && kneel < 0.9) travel = -Math.log(1 - kneel) / dragK;
    const need = (wantY - PUCK_Y + 6 * travel * travel) / Math.max(0.08, travel + 0.02);
    vy = Math.max(vy, Math.min(16, need));
  }
  const aimedIron = shotIron;
  launchPuck(s, ax * power - az * spray, az * power + ax * spray, vy);
  shotSharp = geo.sharp;
  shotReleaseZ = from.z;
  shotFromLine = (attack * GOAL_LINE_X - from.x) * attack;
  shotAttack = attack >= 0 ? 1 : -1;
  shotIron = aimedIron;
  if (ironKind) shotIron = { kind: ironKind, z: tZ, y: wantY };
  clampHorizMph(SKATER_SHOT_HI_MPH);
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
  const ui = useGame.getState();
  ui.setSpeed(mph);
  ui.setShotKind(world.lastShotKind);
  noteShotRelease();
}

function beginPassSpeedTrack(saucer: boolean): void {
  clearShotTrack();
  const puck = world.puck;
  const mph = Math.hypot(puck.vx, puck.vz) * 2.23694;
  world.shotSpeedLive = true;
  world.shotSpeedMax = mph;
  const ui = useGame.getState();
  ui.setSpeed(mph);
  ui.setShotKind(saucer ? "saucer" : "pass");
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
  if (periodEndLive()) return;
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
    if (world.oneTimerPass) {
      world.oneTimerArmed = false;
      world.oneTimerSlap = false;
      world.oneTimerPass = false;
      world.oneTimerSaucer = false;
      return;
    }
    fireOneTimer(t);
  }
}

function passLinesCrossed(fromX: number, toX: number): number {
  const lo = Math.min(fromX, toX);
  const hi = Math.max(fromX, toX);
  let n = 0;
  for (const x of [-GOAL_LINE_X, -BLUE_X, 0, BLUE_X, GOAL_LINE_X]) {
    if (x > lo && x < hi) n++;
  }
  return n;
}

function rememberOneTimerLines(id: number, lines: number): void {
  otLinesPass = world.lastPass;
  otLinesShooter = id;
  otLines = lines;
}

function oneTimerLinesAtSave(): number {
  if (world.lastShooter === otLinesShooter && otLinesPass === world.lastPass) return otLines;
  const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
  return passLinesCrossed(world.lastPassX, shooter ? shooter.x : world.lastPassX);
}

function kickOneTimerZ(dz: number): void {
  const puck = world.puck;
  const along = Math.sign(puck.vx || 1) * GOAL_LINE_X - puck.x;
  if (Math.abs(along) < 0.35 || Math.abs(puck.vx) < 0.3) return;
  let dvz = (dz * puck.vx) / along;
  const cap = Math.hypot(puck.vx, puck.vz) * 0.62;
  if (dvz > cap) dvz = cap;
  else if (dvz < -cap) dvz = -cap;
  puck.vz += dvz;
}

function pushOneTimerMiss(lines: number, err = 1): void {
  if (lines < 1 || useGame.getState().clockMode === "drill") return;
  const puck = world.puck;
  const along = Math.sign(puck.vx || 1) * GOAL_LINE_X - puck.x;
  if (Math.abs(puck.vx) < 0.3 || Math.abs(along) < 0.35) return;
  const zAt = puck.z + (puck.vz / puck.vx) * along;
  if (lines >= 2) {
    const side = Math.abs(zAt) > 0.15 ? Math.sign(zAt) : Math.random() < 0.5 ? -1 : 1;
    const want =
      Math.random() < 0.9
        ? side * (1.55 + Math.random() * 1.7)
        : zAt + side * (0.4 + Math.random() * 0.35);
    kickOneTimerZ((want - zAt) * err);
    if (Math.random() < 0.6 * err) puck.vy += (3.6 + Math.random() * 4.2) * err;
    return;
  }
  if (Math.abs(zAt) < 0.42)
    kickOneTimerZ((Math.random() < 0.5 ? -1 : 1) * (0.04 + Math.random() * 0.1) * err);
  else kickOneTimerZ(Math.sign(zAt) * (0.08 + Math.random() * 0.62) * err);
}

function fireOneTimer(t: Skater): void {
  if (periodEndLive()) return;
  if (t.kind === "goalie") return;
  if (world.time - world.lastShoot < 0.05) return;
  const spd = Math.hypot(t.vx, t.vz);
  const attack = attackDir(t.side);
  const netX = attack * GOAL_LINE_X;
  const px = world.lastPassX;
  const pz = world.lastPassZ;
  const lines = passLinesCrossed(px, t.x);
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
    world.lastShotBackhand = false;
    world.lastShotKind = slap ? "slap" : "wrist";
    world.lastShotOneTimer = true;
    world.lastShotRedirect = false;
    world.lastShooter = t.id;
    world.lastShotDist = 6;
    rememberOneTimerLines(t.id, lines);
    world.lastOneTimerDanger = lines >= 1 ? 0 : danger;
    t.follow = shotFollowTime(slap ? "slap" : "wrist");
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
  const far =
    (Math.abs(lat) > 0.35
      ? Math.sign(lat)
      : Math.abs(dAng) > 0.08
        ? Math.sign(dAng)
        : Math.sign(t.z || 1)) * half;
  const bodyZ = g ? Math.max(-half, Math.min(half, g.z)) : 0;
  let tZ = danger > 0.18 ? bodyZ + (far - bodyZ) * Math.min(1, 0.4 + danger * 0.7) : bodyZ;
  tZ = Math.max(-half, Math.min(half, tZ + corner * 0.28));
  world.lastOneTimerDanger = lines >= 1 ? 0 : danger;
  const dist = launchShotAtNet(t, 0, 0, power, slap ? 0.018 : 0.016, false, { tZ, wantY });
  pushOneTimerMiss(lines);
  rememberOneTimerLines(t.id, lines);
  world.oneTimerArmed = false;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  world.lastShoot = world.time;
  world.lastShotSlap = slap;
  world.lastShotBackhand = false;
  world.lastShotKind = slap ? "slap" : "wrist";
  world.lastShotOneTimer = true;
  world.lastShotRedirect = false;
  world.lastShooter = t.id;
  world.lastShotDist = dist;
  t.follow = shotFollowTime(slap ? "slap" : "wrist");
  t.windup = 0;
  if (t.side === "home") world.userId = t.id;
  beginShotSpeedTrack();
}

/**
 * Real seconds of an X hold to a full slap.
 * shotFromHold still treats 1 as full power; real time is divided by this.
 * A backhand does not become a slap. It releases when the hold reaches this.
 */
const SHOT_FULL_HOLD = 1.5;
/** A skater hold shorter than this is a snap. The slap still starts at half of SHOT_FULL_HOLD. */
const SNAP_HOLD_S = 0.1;
const SKATER_CHARGE_NOTCHES = [SNAP_HOLD_S / SHOT_FULL_HOLD, 0.5] as const;
const ONE_TIMER_NOTCH = [0.28 / SHOT_FULL_HOLD] as const;

function chargeHold(holdT: number | undefined, slap: boolean): number {
  if (holdT !== undefined) return holdT / SHOT_FULL_HOLD;
  return slap ? 1.05 : 0.1;
}

function shotFromHold(holdT: number, spd: number): { power: number; slap: boolean } {
  const t = Math.max(0, holdT);
  let mph: number;
  let slap = false;
  if (t < 0.28) mph = SKATER_SHOT_LO_MPH + t * 14;
  else if (t < 0.5) mph = 80 + ((t - 0.28) / 0.22) * 6;
  else if (t < 1) {
    slap = true;
    mph = 90 + ((t - 0.5) / 0.5) * 14;
  } else {
    slap = true;
    mph = SKATER_SHOT_HI_MPH;
  }
  if (!slap) mph = Math.max(SKATER_SHOT_LO_MPH, mph);
  mph = Math.min(SKATER_SHOT_HI_MPH, mph + Math.min(1.6, spd * 0.08));
  if (!slap) mph = Math.max(SKATER_SHOT_LO_MPH, mph);
  return { power: mph / MPH, slap };
}

function puckOnBackhand(s: Skater): boolean {
  const ry = s.yaw + Math.PI;
  const dx = world.puck.x - s.x;
  const dz = world.puck.z - s.z;
  return dx * Math.cos(ry) - dz * Math.sin(ry) > 0;
}

/** Max angle between the release aim and the aim sampled at windup start. */
const WINDUP_AIM_CONE = (80 * Math.PI) / 180;

let windupLockedBackhand: boolean | null = null;
let windupCommitAim: { ax: number; az: number } | null = null;
let windupCommitHot = false;

function clearWindupCommit(): void {
  windupLockedBackhand = null;
  windupCommitAim = null;
}

/**
 * Sample kind and aim once, on the frame windup crosses 0.04 while this skater
 * has the puck. Later frames of that windup keep the sample.
 */
function trackWindupCommit(s: Skater, mx: number, my: number): void {
  if (s.id !== world.userId || s.kind === "goalie") return;
  if (world.windupCancel || world.puck.owner !== s.id) {
    clearWindupCommit();
    windupCommitHot = s.windup > 0.04;
    return;
  }
  const hot = s.windup > 0.04;
  if (hot && !windupCommitHot) {
    windupLockedBackhand = puckOnBackhand(s);
    windupCommitAim = aimDir(s, mx, my);
  }
  windupCommitHot = hot;
}

/** Locked side while that windup is active. Otherwise the live puck side. */
function windupBackhand(s: Skater): boolean {
  if (
    s.id === world.userId &&
    windupLockedBackhand !== null &&
    s.windup > 0.04 &&
    !world.windupCancel
  ) {
    return windupLockedBackhand;
  }
  return puckOnBackhand(s);
}

function clampAimToCone(
  commit: { ax: number; az: number },
  live: { ax: number; az: number },
  maxAng: number,
): { ax: number; az: number } {
  const dot = Math.max(-1, Math.min(1, commit.ax * live.ax + commit.az * live.az));
  const ang = Math.acos(dot);
  if (ang <= maxAng + 1e-4) return live;
  let px = -commit.az;
  let pz = commit.ax;
  if (live.ax * px + live.az * pz < 0) {
    px = -px;
    pz = -pz;
  }
  const ax = commit.ax * Math.cos(maxAng) + px * Math.sin(maxAng);
  const az = commit.az * Math.cos(maxAng) + pz * Math.sin(maxAng);
  const m = Math.hypot(ax, az) || 1;
  return { ax: ax / m, az: az / m };
}

function stickFromWorld(ax: number, az: number): { mx: number; my: number } {
  return {
    mx: ax * world.camRx + az * world.camRz,
    my: ax * world.camFx + az * world.camFz,
  };
}

/** Live stick aim, pulled back onto the windup cone when it has left it. */
function releaseAim(s: Skater, mx: number, my: number): { mx: number; my: number } {
  if (
    s.id !== world.userId ||
    !windupCommitAim ||
    s.windup <= 0.04 ||
    world.windupCancel
  ) {
    return { mx, my };
  }
  const live = aimDir(s, mx, my);
  const clamped = clampAimToCone(windupCommitAim, live, WINDUP_AIM_CONE);
  if (clamped.ax * live.ax + clamped.az * live.az > 0.9995) return { mx, my };
  const stick = stickFromWorld(clamped.ax, clamped.az);
  const mag = Math.hypot(stick.mx, stick.my);
  if (mag > 1) return { mx: stick.mx / mag, my: stick.my / mag };
  return stick;
}

function finishUserShot(s: Skater): void {
  if (s.id !== world.userId) return;
  clearWindupCommit();
  windupCommitHot = false;
}

function noteBackhandWindup(s: Skater): void {
  if (s.id !== world.userId || s.kind === "goalie") return;
  if (s.follow > 0.02) return;
  if (world.windupCancel) {
    if (world.puck.owner === s.id) world.lastShotBackhand = false;
    return;
  }
  if (s.windup <= 0.04 || s.windup > 0.5) return;
  if (world.puck.owner !== s.id) return;
  world.lastShotBackhand = windupBackhand(s);
}

type ShotRelease = { kind: ShotKind; mph: number };

function shotReach(s: Skater): number {
  const from = stickBlade(s);
  const netX = attackDir(s.side) * GOAL_LINE_X;
  return Math.hypot(netX - from.x, from.z);
}

function wristMph(roll: number, spd: number): number {
  const t = Math.max(0, Math.min(1, roll));
  const mph = SKATER_SHOT_LO_MPH + t * 13 + Math.min(1.6, spd * 0.08);
  return Math.max(SKATER_SHOT_LO_MPH, Math.min(86, mph));
}

function snapMph(spd: number): number {
  return Math.max(84, Math.min(89, 87 + Math.min(1.2, spd * 0.05)));
}

function slapMph(down: number, spd: number): number {
  const t = 0.5 + Math.max(0, Math.min(1, down)) * 0.55;
  return shotFromHold(t >= 1 ? 1.05 : t, spd).power * MPH;
}

function backhandMph(spd: number): number {
  return Math.max(58, Math.min(68, 63 + Math.min(4, spd * 0.2)));
}

function backhandSpray(s: Skater): number {
  const dist = shotReach(s);
  if (dist <= 9) return 0.003;
  return 0.012 + 0.05 * (dist - 9);
}

function resolveShot(
  s: Skater,
  slap: boolean,
  holdT: number | undefined,
  release: ShotRelease | undefined,
): { kind: ShotKind; power: number; backhandBand: boolean } {
  const spd = Math.hypot(s.vx, s.vz);
  if (release) {
    return {
      kind: release.kind,
      power: release.mph / MPH,
      backhandBand: release.kind === "backhand",
    };
  }
  const held = chargeHold(holdT, slap);
  const built = shotFromHold(held, spd);
  const onBack = windupBackhand(s) && s.kind !== "goalie";
  if (onBack) {
    return { kind: "backhand", power: backhandMph(spd) / MPH, backhandBand: true };
  }
  if (built.slap) return { kind: "slap", power: built.power, backhandBand: false };
  if (holdT !== undefined && holdT < SNAP_HOLD_S) {
    return { kind: "snap", power: built.power, backhandBand: false };
  }
  return { kind: "wrist", power: built.power, backhandBand: false };
}

function shotSpray(kind: ShotKind, s: Skater, oneTimer: boolean, backhandBand: boolean): number {
  if (kind === "slap") return 0.016;
  if (kind === "snap") return 0.014;
  if (kind === "backhand" && backhandBand) return backhandSpray(s);
  if (oneTimer) return 0.012;
  return 0.01;
}

/** Goalie clear, linear from a tap to a full hold. Skater shots stay on shotFromHold. */
function goalieShotChargeMps(holdS: number): number {
  const t = Math.min(1, Math.max(0, holdS / SHOT_FULL_HOLD));
  return (GOALIE_SHOT_LO_MPH + (GOALIE_SHOT_HI_MPH - GOALIE_SHOT_LO_MPH) * t) / MPH;
}

/** Seconds the shot follow-through pose stays up. Slap longest, snap shortest. */
export function shotFollowTime(kind: ShotKind | null, slap = false): number {
  if (slap || kind === "slap") return 0.75;
  if (kind === "snap") return 0.25;
  if (kind === "backhand") return 0.46;
  return 0.5;
}

function doShot(
  s: Skater,
  mx: number,
  my: number,
  slap: boolean,
  holdT?: number,
  release?: ShotRelease,
): void {
  if (periodEndLive() && !periodEndUserPlayOk(s)) return;
  drillFlightStashed = false;
  if (useGame.getState().clockMode === "drill" && world.drillWon) {
    if (!drillUserEncore(s)) return;
    const held = chargeHold(holdT, slap);
    const { power } = shotFromHold(held, Math.hypot(s.vx, s.vz));
    const backhand = windupBackhand(s);
    const shelf = drillTopShelfPin();
    launchShotAtNet(s, 0, 1, Math.max(power, 28), 0, false, { tZ: 0, wantY: shelf.y });
    world.lastShoot = world.time;
    world.lastShotSlap = false;
    world.lastShotBackhand = backhand;
    world.lastShotKind = backhand ? "backhand" : "wrist";
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
    s.follow = shotFollowTime(backhand ? "backhand" : "wrist");
    beginShotSpeedTrack();
    finishUserShot(s);
    return;
  }
  if (s.kind === "goalie") {
    if (goalieMustHoldCover(s)) return;
    const prevCharge = chargedPassPower;
    chargedPassPower = goalieShotChargeMps(holdT ?? 0);
    try {
      goalieLengthPlay(s, farPlayFromStick(mx, my, slap));
    } finally {
      chargedPassPower = prevCharge;
    }
    world.shotWindupT = 0;
    if (useGame.getState().clockMode === "drill") armDrillShot();
    s.windup = 0;
    s.follow = 0.2;
    return;
  }
  const resolved = resolveShot(s, slap, holdT, release);
  const kind = resolved.kind;
  const power = resolved.power;
  const isSlap = kind === "slap";
  const backhand = kind === "backhand";
  const shot = releaseAim(s, mx, my);
  if (behindOwnGoalLine(s)) {
    launchRim(s, shot.mx, shot.my, power);
    world.lastShoot = world.time;
    world.lastShotSlap = isSlap;
    world.lastShotBackhand = backhand;
    world.lastShotKind = kind;
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
    s.follow = shotFollowTime(kind);
    beginShotSpeedTrack();
    finishUserShot(s);
    return;
  }
  const oneTimer = world.lastPassTo === s.id && world.time <= world.oneTimerUntil;
  let sprayAmt = shotSpray(kind, s, oneTimer, resolved.backhandBand);
  if (useGame.getState().clockMode === "drill") sprayAmt = 0;
  const dist = launchShotAtNet(s, shot.mx, shot.my, power, sprayAmt);
  world.lastShoot = world.time;
  world.lastShotSlap = isSlap;
  world.lastShotBackhand = backhand;
  world.lastShotKind = kind;
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
  s.windup = 0;
  s.follow = shotFollowTime(kind);
  beginShotSpeedTrack();
  finishUserShot(s);
}

/** Standing cells on the net this shooter is attacking. Top row is listed separately. */
function cpuStandingCells(s: Skater): {
  top: { z: number; y: number }[];
  rest: { z: number; y: number }[];
  colW: number;
  rowH: number;
} | null {
  const ui = useGame.getState();
  if (ui.clockMode !== "scrimmage") return null;
  const mouth: 1 | -1 = attackDir(s.side) > 0 ? 1 : -1;
  const team = teamOnMouth(mouth);
  const count = team === "home" ? ui.scrimmageHomeTargets : ui.scrimmageAwayTargets;
  if (count <= 0) return null;
  const board = targetBoard(count);
  const gone = scrimmageGone(team);
  const topRow = board.rows - 1;
  const hw = GOAL_W / 2;
  const colW = GOAL_W / board.cols;
  const rowH = GOAL_H / board.rows;
  const top: { z: number; y: number }[] = [];
  const rest: { z: number; y: number }[] = [];
  for (let i = 0; i < board.list.length; i++) {
    if (gone[i]) continue;
    const t = board.list[i]!;
    const cell = {
      z: -hw + (t.col + 0.5) * colW,
      y: Math.min(mouthTopY() - 0.04, Math.max(PUCK_Y + 0.12, (t.row + 0.55) * rowH)),
    };
    if (t.row === topRow) top.push(cell);
    else rest.push(cell);
  }
  if (!top.length && !rest.length) return null;
  return { top, rest, colW, rowH };
}

/**
 * Pocket toward targets that are still up. The top shelf wins while any of it remains,
 * on the side that still has more of those cells. Jitter keeps it off a perfect cell lock.
 * `p` is how often to take this look instead of the usual lower middle.
 */
function cpuShelfPocket(s: Skater): { tZ: number; wantY: number; p: number } | null {
  const board = cpuStandingCells(s);
  if (!board) return null;
  const shelf = board.top.length > 0;
  const cells = shelf ? board.top : board.rest;
  const hw = GOAL_W / 2;
  let pos = 0;
  let neg = 0;
  for (const c of cells) {
    if (c.z >= 0) pos += 1;
    else neg += 1;
  }
  const side: 1 | -1 = pos === neg ? ((-Math.sign(s.z) || 1) as 1 | -1) : pos > neg ? 1 : -1;
  const onSide = cells.filter((c) => (Math.sign(c.z) || side) === side);
  const pool = onSide.length ? onSide : cells;
  const pick = pool[Math.floor(Math.random() * pool.length)]!;
  const tZ = Math.max(-hw + 0.12, Math.min(hw - 0.12, pick.z + (Math.random() - 0.5) * board.colW * 0.45));
  const wantY = Math.max(
    PUCK_Y + 0.2,
    Math.min(mouthTopY() - 0.03, pick.y + (Math.random() - 0.35) * board.rowH * 0.22),
  );
  const p = shelf ? (board.rest.length === 0 ? 0.9 : 0.72) : 0.84;
  return { tZ, wantY, p };
}

/**
 * Intended spot in the net, chosen before CPU_SHOT_ERR.
 * A skilled stick uses the goalie's body and stick, plus anyone screening a side,
 * and tucks the puck just inside the post or just under the bar when that pocket is the shot.
 * Residual spray stays on CPU_SHOT_ERR in the release.
 */
function cpuSkilledTarget(
  s: Skater,
  from: { x: number; z: number },
  g: Skater | undefined,
  sharp: number,
  juice: boolean,
): { tZ: number; wantY: number } {
  const half = GOAL_W / 2;
  const postZ = half - 0.18;
  const attack = attackDir(s.side);
  const mouth = attack * GOAL_LINE_X;
  if (!g) {
    const far = (-Math.sign(from.z) || 1) as 1 | -1;
    const tZ = sharp > 0.35 ? far * postZ * 0.42 : 0;
    return { tZ, wantY: shotHeight(0.32).wantY };
  }
  const gZ = Math.max(-half + 0.15, Math.min(half - 0.15, g.z));
  const blocker: 1 | -1 = attackDir(g.side) > 0 ? 1 : -1;
  const body = (0.46 + Math.min(0.14, g.coverPose * 0.18)) * (juice ? 0.82 : 1);
  const stick = 0.2;
  const gapOf = (side: 1 | -1) => {
    const cover = gZ + side * body + (side === blocker ? side * stick : 0);
    return side * (side * postZ - cover);
  };
  let clogPos = 0;
  let clogNeg = 0;
  const fromAlong = (mouth - from.x) * attack;
  for (const o of world.skaters) {
    if (o.side === s.side || o.kind === "goalie") continue;
    const along = (mouth - o.x) * attack;
    if (along < 0.35 || along > fromAlong - 0.25) continue;
    if (o.z > 0.2) clogPos += 1;
    else if (o.z < -0.2) clogNeg += 1;
    else {
      clogPos += 0.35;
      clogNeg += 0.35;
    }
  }
  const score = (side: 1 | -1) => {
    const gap = gapOf(side);
    const clog = side > 0 ? clogPos : clogNeg;
    return Math.max(-0.15, gap) * 1.85 - clog * 0.42 + (side === -blocker ? 0.07 : 0);
  };
  let side: 1 | -1 = score(1) >= score(-1) ? 1 : -1;
  if (Math.abs(gZ) > 0.22) {
    const open: 1 | -1 = gZ > 0 ? -1 : 1;
    if (gapOf(open) > gapOf((open === 1 ? -1 : 1) as 1 | -1) + 0.1) side = open;
  }
  const gap = gapOf(side);
  const coverEdge =
    side > 0 ? gZ + body + (blocker > 0 ? stick : 0) : gZ - body - (blocker < 0 ? stick : 0);
  const post = side * postZ;
  let tZ = gap > 0.38 ? post : gap > 0.14 ? (coverEdge + post) * 0.5 : coverEdge + side * 0.06;
  tZ = Math.max(-postZ, Math.min(postZ, tZ));
  const onStick = side === blocker;
  let hgt = gap > 0.32 ? (onStick ? 0.8 : 0.92) : onStick ? 0.74 : 0.84;
  if (clogPos > 0.6 && clogNeg > 0.6) hgt = Math.min(0.96, hgt + 0.08);
  hgt = Math.max(0.2, hgt - sharp * 0.22);
  return { tZ, wantY: shotHeight(Math.min(0.96, hgt)).wantY };
}

function cpuShotChoice(
  s: Skater,
  sharp: number,
  oneTimer: boolean,
): { kind: ShotKind; power: number; slap: boolean } {
  const spd = Math.hypot(s.vx, s.vz);
  const distMouth = (attackDir(s.side) * GOAL_LINE_X - passOrigin(s).x) * attackDir(s.side);
  const pressure = nearestFoe(s).d;
  if (!oneTimer && pressure > 3.4 && distMouth > 8.5 && sharp < 0.42) {
    const held = Math.max(0.55, Math.min(1, 0.5 + (pressure - 3.4) * 0.12));
    const built = shotFromHold(held, spd);
    return { kind: built.slap ? "slap" : "wrist", power: built.power, slap: built.slap };
  }
  if (oneTimer || distMouth < 5.5 || pressure < 2.2) {
    return { kind: "snap", power: snapMph(spd) / MPH, slap: false };
  }
  return {
    kind: "wrist",
    power: wristMph(Math.min(1, distMouth / 14), spd) / MPH,
    slap: false,
  };
}

/**
 * CPU net release. The pocket is chosen first, the way a skilled stick would
 * place it. CPU_SHOT_ERR still supplies the residual spray afterward.
 * Height, kind, and follow-through stay on the user shot path.
 */
function cpuFinishOnNet(s: Skater, oneTimer: boolean): void {
  if (periodEndLive() || world.drillWon || s.kind === "goalie") return;
  const attack = attackDir(s.side);
  const g = world.skaters.find((p) => p.kind === "goalie" && p.side !== s.side);
  const from = passOrigin(s);
  const sharp = cpuReleaseSharp(from.x, from.z, attack);
  const err = cpuAimErr(sharp);
  const juice = !oneTimer && s.side === "away" && whiffHot();
  const half = GOAL_W / 2;
  const probeAim = cpuDrillActive() ? cpuDrillCellLock() : null;
  if (cpuDrillActive() && !probeAim) return;
  const aim = probeAim ?? cpuSkilledTarget(s, from, g, sharp, juice);
  let tZ = aim.tZ;
  let wantY = aim.wantY;
  // High targets still up: lift toward the shelf and the open side, not the low slot or the body.
  let shelfShot = false;
  if (!probeAim) {
    const shelf = cpuShelfPocket(s);
    if (shelf && Math.random() < shelf.p) {
      tZ = shelf.tZ;
      wantY = shelf.wantY;
      shelfShot = true;
    }
  }
  const lines = oneTimer ? passLinesCrossed(world.lastPassX, s.x) : 0;
  const roll = Math.random();
  const wideAt = oneTimer
    ? (lines >= 2 ? 0.58 : lines >= 1 ? 0.36 : 0.2) * err
    : 0.045 + sharp * 0.04;
  const distMouth = (attack * GOAL_LINE_X - from.x) * attack;
  const overAt = oneTimer
    ? (lines >= 2 ? 0.88 : lines >= 1 ? 0.52 : 0.34) * err
    : wideAt + 0.03 + (distMouth > 12 ? 0.035 : 0);
  const side = Math.sign(tZ) || (g ? -Math.sign(g.z || 1) : 1);
  if (roll < wideAt) {
    tZ = (side || 1) * (half + 0.05 + Math.random() * (lines >= 2 ? 0.55 : 0.22) * err);
  } else if (roll < overAt) {
    wantY = mouthTopY() + 0.06 + Math.random() * (lines >= 2 ? 0.28 : 0.12);
    if (sharp > 0.18 && !shelfShot) tZ = cpuInsideTarget(tZ, sharp, from.z, side);
  } else if (sharp > 0.18 && !shelfShot) {
    tZ = cpuInsideTarget(tZ, sharp, from.z, side);
  }
  const choice = cpuShotChoice(s, sharp, oneTimer);
  const spray = shotSpray(choice.kind, s, oneTimer, false);
  const dist = launchShotAtNet(s, 0, 0, choice.power, spray, false, {
    tZ,
    wantY,
  });
  if (probeAim) armDrillShot();
  if (oneTimer) {
    pushOneTimerMiss(lines, err);
    rememberOneTimerLines(s.id, lines);
    if (lines >= 1) world.lastOneTimerDanger = 0;
  }
  if (world.time - world.goalieSaveT > 1.35 || dist > 12) {
    world.reboundN = 0;
    world.reboundSoft = false;
  }
  world.lastShoot = world.time;
  world.lastShotSlap = choice.slap;
  world.lastShotBackhand = false;
  world.lastShotKind = choice.kind;
  world.lastShotOneTimer = oneTimer;
  world.lastShotRedirect = false;
  world.lastShotCorner = false;
  world.lastShotCornerSide = 0;
  world.lastShooter = s.id;
  world.lastShotDist = dist;
  world.shotWindupT = 0;
  s.windup = 0;
  s.follow = shotFollowTime(choice.kind, choice.slap);
  beginShotSpeedTrack();
}

function shootAtNet(s: Skater): void {
  if (periodEndLive()) return;
  if (world.drillWon) return;
  if (cpuShotRelease(s)) {
    cpuFinishOnNet(s, false);
    return;
  }
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
  world.lastShotBackhand = false;
  world.lastShotKind = null;
  world.lastShotOneTimer = false;
  world.lastShotRedirect = false;
  world.lastShooter = s.id;
  world.lastShotDist = dist;
  beginShotSpeedTrack();
}

/**
 * Open slot feeds stay on the ice so a one-timer can arrive.
 * Longer passes, a stick in the lane, and a close checker go up.
 */
function cpuWantsSaucer(s: Skater, mate: Skater): boolean {
  if (s.id === world.userId || s.kind === "goalie") return false;
  const dist = Math.hypot(mate.x - s.x, mate.z - s.z);
  const blocked = laneBlocked(s.x, s.z, mate.x, mate.z, s.side);
  const pressure = nearestFoe(s).d;
  const attack = attackDir(s.side);
  const depth = (attack * GOAL_LINE_X - mate.x) * attack;
  const slotFeed =
    depth > 2.2 && depth < 16 && Math.abs(mate.z) < 9 && dist < 14 && !blocked && pressure > 3.2;
  if (slotFeed) return false;
  let p = 0.07;
  if (dist > 12) p += 0.34;
  else if (dist > 8) p += 0.18;
  if (blocked) p += 0.36;
  if (pressure < 3.1) p += 0.16;
  if (Math.abs(mate.z - s.z) > 6.5 && dist > 7) p += 0.16;
  if (nearestFoe(mate).d < 2.6) p += 0.12;
  return Math.random() < Math.min(0.8, p);
}

function aiPass(s: Skater, mate: Skater): void {
  if (periodEndLive() || shootoutCpuShooter(s)) return;
  if (cpuWantsSaucer(s, mate)) {
    const dist = Math.hypot(mate.x - s.x, mate.z - s.z);
    const hold = dist > 12 ? 1.05 : dist > 8 ? 0.72 : 0.42;
    const sauce = dist > 12 ? 0.95 : dist > 8 ? 0.74 : 0.55;
    withChargedPass(hold, true, sauce, () => {
      tapePass(s, mate, true);
    });
  } else {
    tapePass(s, mate, false);
  }
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
  poseEveryRef("idle");
  world.lastPass = world.time;
  world.lastShoot = world.time;
  if (winner.side === "home") world.userId = winner.id;
  releaseFaceoffCenters();
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

const SWITCH_PASS_WINDOW = 1.6;

function passAxes(puck: Puck): { ax: number; az: number; spd: number } {
  const spd = Math.hypot(puck.vx, puck.vz);
  if (spd < 0.35) return { ax: 0, az: 0, spd };
  return { ax: puck.vx / spd, az: puck.vz / spd, spd };
}

/** Named receiver who can actually play this pass, not a far off-lane name. */
function passReceiverUseful(s: Skater, puck: Puck): boolean {
  if (passMeet && Math.hypot(s.x - passMeet.x, s.z - passMeet.z) < 6.5) return true;
  const { ax, az } = passAxes(puck);
  const dx = s.x - puck.x;
  const dz = s.z - puck.z;
  const along = dx * ax + dz * az;
  const perp = Math.hypot(dx - ax * along, dz - az * along);
  return along > -0.5 && perp < 5.5 && Math.hypot(dx, dz) < 18;
}

/** Teammate nearest the pass line or the spot the pass is aimed at. */
function bestAlongPass(mates: Skater[], puck: Puck): Skater | null {
  const { ax, az, spd } = passAxes(puck);
  if (spd < 0.8 && !passMeet) return null;
  let best: Skater | null = null;
  let bestScore = 4;
  for (const s of mates) {
    const dx = s.x - puck.x;
    const dz = s.z - puck.z;
    const along = dx * ax + dz * az;
    const perp = Math.hypot(dx - ax * along, dz - az * along);
    const d = Math.hypot(dx, dz);
    if (along < -1.5 && d > 3) continue;
    let score = 12 + Math.min(Math.max(along, 0), 16) * 0.9 - perp * 2.1;
    score -= Math.max(0, d - 14) * 0.7;
    if (passMeet) {
      const dm = Math.hypot(s.x - passMeet.x, s.z - passMeet.z);
      score -= dm * 1.15;
      if (dm < 2.8) score += 5;
    }
    if (s.id === world.lastPassTo) score += 3;
    if (s.struck > 0.35 || s.tumble !== 0) score -= 14;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/**
 * Opponent carrying on our half, or anyone coming back toward our net.
 * A puck sitting in their zone is a forecheck, not this.
 */
function defensiveRush(user: Skater): { x: number; z: number; vx: number; vz: number } | null {
  const defend = defendDir(user.side);
  const puck = world.puck;
  const holder = puck.owner !== null ? world.skaters[puck.owner] : undefined;
  if (holder && holder.side !== user.side && holder.kind !== "goalie") {
    const toward = holder.vx * defend;
    const onOurHalf = holder.x * defend > -6;
    if (toward > 0.65 || onOurHalf) return { x: holder.x, z: holder.z, vx: holder.vx, vz: holder.vz };
    return null;
  }
  if (puck.owner !== null) return null;
  const spd = Math.hypot(puck.vx, puck.vz);
  if (spd < 3.5 || puck.vx * defend < 2.6) return null;
  if (world.lastShooter !== null && world.lastShoot >= world.lastPass && world.time - world.lastShoot < 0.9) {
    const sh = world.skaters[world.lastShooter];
    if (sh && sh.side === user.side) return null;
  }
  return { x: puck.x, z: puck.z, vx: puck.vx, vz: puck.vz };
}

/** Skater who can step into the lane, not the one parked deepest at our net. */
function pickDefender(
  user: Skater,
  mates: Skater[],
  rush: { x: number; z: number; vx: number; vz: number },
): Skater {
  const defend = defendDir(user.side);
  const netX = defend * GOAL_LINE_X;
  const gx = netX - rush.x;
  const gz = -rush.z * 0.85;
  const glen = Math.hypot(gx, gz) || 1;
  const nx = gx / glen;
  const nz = gz / glen;
  const spd = Math.hypot(rush.vx, rush.vz);
  const lead = Math.min(7.5, 2.1 + Math.min(spd, 12) * 0.22);
  let ix = rush.x + nx * lead + rush.vx * 0.2;
  let iz = rush.z + nz * lead * 0.45 + rush.vz * 0.2;
  if ((netX - ix) * defend < 0.8) ix = netX - defend * 0.8;
  let best = mates[0]!;
  let bestScore = -Infinity;
  for (const s of mates) {
    const dx = s.x - rush.x;
    const dz = s.z - rush.z;
    const dPuck = Math.hypot(dx, dz) || 1;
    const goalSide = dx * nx + dz * nz;
    const lat = Math.abs(-dx * nz + dz * nx);
    const dCut = Math.hypot(s.x - ix, s.z - iz);
    let score = -dCut * 2.5 + Math.min(Math.max(goalSide, 0), 8) * 1.1;
    if (goalSide > 0.2 && goalSide < 11 && lat < 4.2) score += 6.5;
    if (goalSide < -1) score -= 11;
    if (lat < 2.8 && goalSide > 0) score += 2;
    if (s.kind === "defense" && rush.x * defend > -BLUE_X) score += 1.5;
    score -= Math.max(0, dPuck - 11) * 0.5;
    const closing = ((rush.x - s.x) * s.vx + (rush.z - s.z) * s.vz) / dPuck;
    if (closing > 0.4) score += Math.min(2.2, closing * 0.35);
    if (s.struck > 0.35 || s.tumble !== 0) score -= 18;
    if (score > bestScore) {
      bestScore = score;
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
  const sincePass = world.time - world.lastPass;
  const passLive =
    puck.owner === null && sincePass >= 0 && sincePass < SWITCH_PASS_WINDOW && world.lastShoot <= world.lastPass;
  if (passLive && world.lastPassTo !== null) {
    const t = world.skaters[world.lastPassTo];
    if (
      t &&
      t.side === user.side &&
      t.kind !== "goalie" &&
      t.id !== user.id &&
      passReceiverUseful(t, puck)
    ) {
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
  }
  if (passLive && (world.lastPasser === user.id || world.lastPassTo !== null)) {
    const next = bestAlongPass(mates, puck);
    if (next) {
      world.userId = next.id;
      return;
    }
  }
  const rush = defensiveRush(user);
  if (rush) {
    world.userId = pickDefender(user, mates, rush).id;
    return;
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
    if (s.side !== "home" || s.kind === "goalie" || s.id === user.id || s.id === world.userId)
      continue;
    if (s.id === skipA || s.id === skipB) continue;
    if (world.puck.owner === s.id) continue;
    const lat = wingLateral(user, s);
    if (side < 0 ? lat > -0.45 : lat < 0.45) continue;
    const d = Math.hypot(s.x - user.x, s.z - user.z);
    if (!best || d < best.d) best = { id: s.id, d };
  }
  return best;
}

function pickWing(
  user: Skater,
  side: -1 | 1,
  skip: number | null,
  held: number | null,
): number | null {
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
  if (!wings || user.side !== "home" || user.kind === "goalie") {
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
    if (user.kind !== "goalie") {
      world.ltReturnId = user.id;
      world.userId = g.id;
    }
    world.goalieRecallT = 0;
    return;
  }
  if (user.kind === "goalie") {
    const back = world.ltReturnId !== null ? world.skaters[world.ltReturnId] : null;
    let handed = false;
    if (back && back.side === "home" && back.kind !== "goalie") {
      world.userId = back.id;
      handed = true;
    } else {
      const next = nearestHomeSkater(g.id);
      if (next) {
        world.userId = next.id;
        handed = true;
      }
    }
    // No skater to take back: the user stays the goalie. Do not recall-damp them.
    if (handed) recallHomeGoalie();
  }
  world.ltReturnId = null;
}

function autoSwitchToHolder(): void {
  if (periodEndLive()) return;
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
  if (periodEndLive()) return;
  if (dekeCommitBlocks(foe.id)) return;
  const dx = holder.x - foe.x;
  const dz = holder.z - foe.z;
  const d = Math.hypot(dx, dz) || 1;
  foe.yaw = Math.atan2(-dx, -dz);
  foe.poke = 0.48;
  const lx = -dz / d;
  const lz = dx / d;
  const side = Math.sign(holder.z - foe.z) || (foe.id % 2 === 0 ? 1 : -1);
  noteRelease("poke", foe);
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
  if (user.kind === "goalie" || user.dive > 0 || user.stun > 0.04 || user.struck > 0.12)
    return false;
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
  if (periodEndLive()) return false;
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
  noteControl(user, "play");
  const aim = shotAim(act);
  doShot(user, aim.mx, aim.my, false);
  return true;
}

function refreshUserStickCommit(act: Actions): void {
  const user = world.skaters[world.userId];
  const owns = !!user && world.puck.owner === user.id;
  if (!owns || !user) {
    userAProtectId = -1;
    userAProtectUntil = -1;
    userXProtectId = -1;
    userXProtectUntil = -1;
    userStickCommit = false;
    return;
  }
  const holdingA = !world.faceoffA && act.aDown;
  const holdingSauce = act.viewDown;
  const holdingProtect = holdingA || holdingSauce;
  if (holdingProtect && userAProtectId !== user.id) {
    userAProtectId = user.id;
    userAProtectUntil = world.time + USER_A_PROTECT_S;
  }
  const aLive = holdingProtect && userAProtectId === user.id && world.time < userAProtectUntil;
  const skaterShot =
    user.kind !== "goalie" &&
    !world.windupCancel &&
    (act.xDown || (skillStickLoading && !skillStickSideHold));
  if (skaterShot && userXProtectId !== user.id) {
    userXProtectId = user.id;
    userXProtectUntil = world.time + USER_A_PROTECT_S;
  }
  const xLive =
    user.kind === "goalie"
      ? act.xDown && !world.windupCancel
      : skaterShot && userXProtectId === user.id && world.time < userXProtectUntil;
  userStickCommit = aLive || xLive;
}

/** Owned shot windup. Hard-caps at 2s and does not fire a slap. A backhand releases at SHOT_FULL_HOLD. */
function accumulateOwnedShotWindup(user: Skater, dt: number): void {
  if (user.kind !== "goalie") {
    if (world.shotWindupT < USER_A_PROTECT_S) {
      world.shotWindupT = Math.min(USER_A_PROTECT_S, world.shotWindupT + dt);
    }
  } else {
    world.shotWindupT += dt;
  }
  user.windup = Math.min(1, world.shotWindupT / SHOT_FULL_HOLD);
}

function capBackhandWindup(user: Skater): void {
  if (user.kind === "goalie" || world.puck.owner !== user.id) return;
  if (!windupBackhand(user)) return;
  user.windup = Math.min(0.48, user.windup);
}

/** Fires the backhand once the hold crosses SHOT_FULL_HOLD. Returns true when it shot. */
function releaseHeldBackhand(user: Skater, act: Actions): boolean {
  if (user.kind === "goalie" || world.puck.owner !== user.id) return false;
  if (world.shotWindupT < SHOT_FULL_HOLD) return false;
  if (!windupBackhand(user)) return false;
  const wait = useGame.getState().clockMode === "drill" ? 0.02 : 0.25;
  if (world.time - world.lastShoot <= wait) return false;
  const aim = shotAim(act);
  doShot(user, aim.mx, aim.my, false, world.shotWindupT);
  return true;
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

function userControlsGoalie(s: Skater): boolean {
  return s.id === world.userId && s.kind === "goalie" && s.side === "home";
}

function shootoutUserGoalie(s: Skater): boolean {
  if (!shootoutLive() || !userControlsGoalie(s)) return false;
  const attempt = world.shootout?.attempts[world.shootout.attempts.length - 1];
  return !!attempt && !attempt.result && attempt.side === "away";
}

function failShootoutGoaliePoke(poker: Skater): void {
  if (!shootoutUserGoalie(poker)) return;
  const so = world.shootout;
  const attempt = so?.attempts[so.attempts.length - 1];
  if (!so || !attempt) return;
  attempt.result = "save";
  so.phase = "result";
  so.t = 0;
  cheerShootoutSave(attempt.side);
  publishShootout();
}

/** Same launch as a carrier strip. The loose puck stays where it was hit. */
function knockLooseLikeStrip(user: Skater, diveKnock: boolean): void {
  if (stickLooseBy === user.id && world.time < stickLooseUntil) return;
  const puck = world.puck;
  const { fx, fz } = heading(user.yaw);
  const lx = -fz;
  const lz = fx;
  const side = Math.sign((puck.x - user.x) * lx + (puck.z - user.z) * lz) || 1;
  const pop = diveKnock ? 12.5 : 8.5;
  const fwd = diveKnock ? 4.2 : 2.8;
  const x = puck.x;
  const z = puck.z;
  noteRelease("poke", user);
  launchPuck(user, fx * fwd + lx * side * pop, fz * fwd + lz * side * pop, diveKnock ? 0.7 : 0.4);
  puck.x = x;
  puck.z = z;
  world.lastPass = world.time;
  stickLooseUntil = world.time + (diveKnock ? 0.26 : 0.3);
  stickLooseBy = user.id;
  stickLooseFrom = user.id;
}

/** Peak absorb twist. Perpendicular velocities reach it. Parallel or head-on stay at 0. */
const POKE_ABSORB_SPIN = 0.6;
const DIVE_ABSORB_SPIN = 0.9;
const CPU_DIVE_ABSORB_SPIN = 0.5;
const CHECK_ABSORB_SPIN = 1;
/** Old reactionSpin ceiling (0.85..1.3). Goalie and referee absorb still peak here. */
const REACT_ABSORB_SPIN = 1.3;
/** Dive poke. Modestly past a check (1.5–1.7). Carrier, loose knock, and crowd share these. */
const DIVE_POKE_BLADE = 2;
const DIVE_POKE_BODY = 2.2;

type DivePokeOutcome = { stun: number; struck: number; fallP: number; maxSpin: number };

const USER_DIVE_POKE: DivePokeOutcome = {
  stun: 0.55,
  struck: 0.4,
  fallP: 0.2,
  maxSpin: DIVE_ABSORB_SPIN,
};
const CPU_DIVE_POKE: DivePokeOutcome = {
  stun: 0.4,
  struck: 0.3,
  fallP: 0.1,
  maxSpin: CPU_DIVE_ABSORB_SPIN,
};

/**
 * |sin θ| between two planar velocities. θ is 0° parallel, 90° perpendicular,
 * 180° head-on. A body slower than 0.05 m/s has no direction, so the spin is 0.
 */
function impactSpeedSin(hvx: number, hvz: number, vvx: number, vvz: number): number {
  const hm = Math.hypot(hvx, hvz);
  const vm = Math.hypot(vvx, vvz);
  if (hm < 0.05 || vm < 0.05) return 0;
  const cross = hvx * vvz - hvz * vvx;
  return Math.min(1, Math.abs(cross) / (hm * vm));
}

/**
 * +1 when the hitter is on the body's right, −1 on the left.
 * Same +x as skaterLocal, which is the body's left.
 * yaw 0 faces −Z, so a hitter at world +X is on the right and this returns +1.
 * A dead-center contact (lx === 0) is +1. No coin flip.
 */
function impactSideSign(body: { x: number; z: number; yaw: number }, hx: number, hz: number): number {
  const { c, sn } = yawBasis(body.yaw);
  const lx = (hx - body.x) * c - (hz - body.z) * sn;
  // sin(π) is not exact 0, so a contact on the facing axis can be a few ulps off center.
  if (Math.abs(lx) < 1e-4) return 1;
  return lx > 0 ? -1 : 1;
}

function impactTumbleSpin(
  victim: { x: number; z: number; yaw: number; vx: number; vz: number },
  hitter: { x: number; z: number; vx: number; vz: number },
  maxSpin: number,
): number {
  const mag = maxSpin * impactSpeedSin(hitter.vx, hitter.vz, victim.vx, victim.vz);
  if (mag === 0) return 0;
  return impactSideSign(victim, hitter.x, hitter.z) * mag;
}

/** Dive-poke outcome. Fall stays a coin flip. Absorb twist comes from the impact. */
function applyDivePokeVictim(s: Skater, hitter: Skater, hit: DivePokeOutcome): void {
  s.stun = hit.stun;
  s.struck = hit.struck;
  if (Math.random() < hit.fallP) {
    s.tumble = Math.random() < 0.5 ? 1 : -1;
    s.tumbleSpin = 0;
  } else {
    s.tumble = 0;
    s.tumbleSpin = impactTumbleSpin(s, hitter, hit.maxSpin);
  }
}

/** Opposing skaters in the dive blade or body reach, ahead of the diver. */
function markDivePokeCrowd(
  diver: Skater,
  blade: { x: number; z: number },
  fx: number,
  fz: number,
  skipId: number | null,
  hit: DivePokeOutcome,
): void {
  for (const s of world.skaters) {
    if (s.id === diver.id || s.side === diver.side || s.kind === "goalie") continue;
    if (skipId !== null && s.id === skipId) continue;
    const dx = s.x - diver.x;
    const dz = s.z - diver.z;
    const ahead = dx * fx + dz * fz;
    if (ahead <= -0.85) continue;
    const dBody = Math.hypot(dx, dz);
    const dBlade = Math.hypot(blade.x - s.x, blade.z - s.z);
    if (dBlade < DIVE_POKE_BLADE || dBody < DIVE_POKE_BODY) applyDivePokeVictim(s, diver, hit);
  }
}

function pokeCheck(user: Skater): void {
  if (user.id === world.userId && user.poke <= 0) xPokeArmed = false;
  if (dekeCommitBlocks(user.id)) return;
  if (userPassInFlight() && (world.puck.owner === null || user.id === world.userId)) return;
  const puck = world.puck;
  if (puck.owner === user.id) return;
  const blade = stickBlade(user);
  const { fx, fz } = heading(user.yaw);
  const stance = user.backskate && user.id === world.userId;
  const dive = user.dive > 0.04;
  // Dive reach stays at 1. A standing poke may still widen while backskating.
  const reachMul = dive ? 1 : stance && user.poke > 0 ? 1.35 : 1;
  // Player hits do not wait for the puck. Goalies do not use this crowd pass.
  const sweepDive = (skipId: number | null) => {
    if (user.kind === "goalie" || !dive || user.poke <= 0) return;
    const hit = user.id === world.userId ? USER_DIVE_POKE : CPU_DIVE_POKE;
    markDivePokeCrowd(user, blade, fx, fz, skipId, hit);
  };
  if (puck.owner !== null) {
    if (user.poke <= 0) return;
    const holder = world.skaters[puck.owner];
    if (!holder || holder.side === user.side) {
      sweepDive(null);
      return;
    }
    if (userStickCommitHolds(holder.id)) {
      sweepDive(holder.id);
      return;
    }
    const goaliePoke = userControlsGoalie(user);
    if (holder.deke > 0.06 && !goaliePoke) {
      sweepDive(holder.id);
      return;
    }
    if (skillProtectBlocks(holder, user) && !goaliePoke) {
      sweepDive(holder.id);
      return;
    }
    let dBlade = Math.hypot(blade.x - puck.x, blade.z - puck.z);
    if (goaliePoke) {
      const hand = goalieBlockerHand(user);
      dBlade = Math.min(dBlade, Math.hypot(hand.x - puck.x, hand.z - puck.z));
    }
    const dBody = Math.hypot(user.x - holder.x, user.z - holder.z);
    const ahead = (holder.x - user.x) * fx + (holder.z - user.z) * fz;
    if (holder.kind === "goalie") {
      const reach = holder.coverPose > 0.25 ? 2.55 : 2.2;
      if ((dBlade < reach || dBody < reach + 0.2) && ahead > -0.85) {
        const towardCenter = attackDir(holder.side);
        const lx = -fz;
        const lz = fx;
        const side = Math.sign((holder.x - user.x) * lx + (holder.z - user.z) * lz) || 1;
        noteRelease("poke", user);
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
        if (user.kind === "goalie") {
          stickLooseUntil = world.time + 0.3;
          stickLooseBy = user.id;
          stickLooseFrom = holder.id;
        }
      }
      sweepDive(null);
      return;
    }
    const cpu = user.id !== world.userId;
    const poke = cpuPokeTune();
    const reach = (dive ? DIVE_POKE_BLADE : cpu ? poke.reach : goaliePoke ? GOALIE_STICK_LEN + 0.2 : 1.95) * (cpu ? 1 : reachMul);
    const bodyR = (dive ? DIVE_POKE_BODY : cpu ? 0 : 2.25) * (cpu ? 1 : reachMul);
    const aheadMin = cpu && !dive ? 0.22 : -0.85;
    let carrierHandled = false;
    if ((dBlade < reach || (bodyR > 0 && dBody < bodyR)) && ahead > aheadMin) {
      carrierHandled = true;
      failShootoutGoaliePoke(user);
      const lx = -fz;
      const lz = fx;
      const side = Math.sign((holder.x - user.x) * lx + (holder.z - user.z) * lz) || 1;
      // X on an opponent carrier gives the user the puck. Goalie and CPU pokes only knock it free.
      const userSteal =
        xPokeArmed && user.id === world.userId && !cpu && !dive && !goaliePoke && !skillSweepPoke;
      if (userSteal) {
        noteRelease("poke", user);
        puck.owner = user.id;
        puck.x = blade.x;
        puck.z = blade.z;
        puck.y = PUCK_Y;
        puck.vx = user.vx;
        puck.vz = user.vz;
        puck.vy = 0;
      } else {
        const pop = dive ? 12.5 : cpu ? 4.8 : 8.5;
        const fwd = dive ? 4.2 : cpu ? -2.2 : 2.8;
        noteRelease("poke", user);
        launchPuck(
          holder,
          fx * fwd + lx * side * pop,
          fz * fwd + lz * side * pop,
          dive ? 0.7 : cpu ? 0.22 : 0.4,
        );
      }
      // Non-goalie victim. Fall is tumble; twist is tumbleSpin. A fall does not
      // change these stun/struck numbers. A diving CPU uses the dive outcome
      // with weaker numbers. A standing CPU poke never falls and never spins.
      if (dive && user.kind !== "goalie") {
        applyDivePokeVictim(holder, user, cpu ? CPU_DIVE_POKE : USER_DIVE_POKE);
      } else if (cpu) {
        holder.stun = 0.24;
        holder.struck = 0.16;
        holder.tumble = 0;
        holder.tumbleSpin = 0;
      } else if (dive) {
        applyDivePokeVictim(holder, user, USER_DIVE_POKE);
      } else {
        holder.stun = 0.4;
        holder.struck = 0.4;
        if (Math.random() < 0.15) {
          holder.tumble = Math.random() < 0.5 ? 1 : -1;
          holder.tumbleSpin = 0;
        } else {
          holder.tumble = 0;
          holder.tumbleSpin = impactTumbleSpin(holder, user, POKE_ABSORB_SPIN);
        }
      }
      if (skillSweepPoke && user.id === world.userId) skillSweepBat = true;
      world.lastPass = world.time;
      if (userSteal) {
        world.lastPassTo = null;
        world.oneTimerArmed = false;
        world.oneTimerSlap = false;
        world.oneTimerPass = false;
        world.oneTimerSaucer = false;
      }
      if (cpu || goaliePoke) {
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
    sweepDive(carrierHandled ? holder.id : null);
    return;
  }
  if (user.dive > 0) {
    // Dive can knock a loose puck. It never takes possession.
    // Players in the dive volume are hit even when the puck is not.
    if (user.kind !== "goalie" && dive && user.poke > 0) {
      const dLoose = Math.hypot(blade.x - puck.x, blade.z - puck.z);
      const bodyLoose = Math.hypot(user.x - puck.x, user.z - puck.z);
      const aheadLoose = (puck.x - user.x) * fx + (puck.z - user.z) * fz;
      if ((dLoose < DIVE_POKE_BLADE || bodyLoose < DIVE_POKE_BODY) && aheadLoose > -0.85 && puck.y < 1.2) {
        knockLooseLikeStrip(user, true);
      }
    }
    sweepDive(null);
    return;
  }
  if (user.id !== world.userId && userJustReleasedPuck()) return;
  // A post slide flares the stick for the mesh. That pose must not cover the
  // puck here; tryDefendPost is the save, and a miss still hits iron.
  if (user.kind === "goalie") {
    const end = goalieOwnEnd(user);
    if (shotAtThisNet(end) && puck.vx * end > 4.5) return;
  }
  let d = Math.hypot(blade.x - puck.x, blade.z - puck.z);
  if (userControlsGoalie(user)) {
    const hand = goalieBlockerHand(user);
    d = Math.min(d, Math.hypot(hand.x - puck.x, hand.z - puck.z));
  }
  const dBody = Math.hypot(user.x - puck.x, user.z - puck.z);
  const pokeReach =
    userControlsGoalie(user) ? GOALIE_STICK_LEN + 0.2 : 0.95 * (stance ? 1.35 : 1);
  const bladeHit = user.poke > 0 && d < pokeReach && puck.y < 0.4;
  const throughBody =
    user.id === world.userId &&
    user.kind !== "goalie" &&
    !liveShotFlight() &&
    dBody < user.radius * 1.35 &&
    puck.y < 1.2;
  if (skillSweepPoke && user.id === world.userId && user.poke > 0 && sweepLooseContact(user)) {
    if (!skillSweepBat) {
      skillSweepBat = true;
      const { fx, fz } = heading(user.yaw);
      noteRelease("poke", user);
      puck.vx = fx * 8.2;
      puck.vz = fz * 8.2;
      puck.vy = 0.18;
      world.lastPass = world.time;
      world.lastPasser = user.id;
      world.lastPassTo = null;
    }
    return;
  }
  // X pokes at a loose puck. It knocks the puck and does not take it.
  if (user.id === world.userId && user.poke > 0) {
    if (bladeHit) {
      failShootoutGoaliePoke(user);
      knockLooseLikeStrip(user, false);
    }
    return;
  }
  if (bladeHit || throughBody) {
    failShootoutGoaliePoke(user);
    if (world.time < stickLooseUntil && (user.id !== world.userId || user.id === stickLooseFrom))
      return;
    puck.owner = user.id;
    const livePass =
      world.lastPassTo === user.id &&
      world.time - world.lastPass < 2.2 &&
      world.lastShoot < world.lastPass;
    noteControl(user, livePass ? "receive" : "play");
    if (livePass) noteChainReception(user);
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

const DEKE_COMMIT_S = 0.45;
const DEKE_COMMIT_REACH = 2.4;
const DEKE_MISS_PAST = 1.05;
const DEKE_MISS_WIDE = 1.15;

type DekeCommit = {
  until: number;
  deker: number;
  ox: number;
  oz: number;
  fx: number;
  fz: number;
  freeze: boolean;
};

const dekeCommit = new Map<number, DekeCommit>();

function dekeCommitOf(id: number): DekeCommit | null {
  const c = dekeCommit.get(id);
  if (!c) return null;
  if (world.time >= c.until) {
    dekeCommit.delete(id);
    return null;
  }
  return c;
}

function dekeCommitBlocks(id: number | null): boolean {
  if (id === null) return false;
  return dekeCommitOf(id) !== null;
}

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const ab2 = abx * abx + abz * abz;
  let t = 0;
  if (ab2 > 1e-8) t = ((px - ax) * abx + (pz - az) * abz) / ab2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

function disarmDekeBite(s: Skater): void {
  s.poke = 0;
  s.dive = 0;
  if (s.hit > 0) {
    s.hit = 0;
    endCheckSwing(s.id);
  }
}

function dekeMissPoint(deker: Skater, c: DekeCommit, s: Skater): { x: number; z: number } {
  const relX = s.x - deker.x;
  const relZ = s.z - deker.z;
  const along = relX * c.fx + relZ * c.fz;
  const lat = relX * c.ox + relZ * c.oz;
  const wantAlong = Math.max(DEKE_MISS_PAST, along + 0.4);
  const wantLat = Math.max(DEKE_MISS_WIDE, lat);
  return {
    x: deker.x + c.fx * wantAlong + c.ox * wantLat,
    z: deker.z + c.fz * wantAlong + c.oz * wantLat,
  };
}

function dekeMissWish(s: Skater): { wx: number; wz: number; mag: number; burst: boolean } | null {
  const c = dekeCommitOf(s.id);
  if (!c) return null;
  disarmDekeBite(s);
  if (c.freeze) {
    s.stun = Math.max(s.stun, c.until - world.time);
    s.vx = 0;
    s.vz = 0;
    return { wx: 0, wz: 0, mag: 0, burst: false };
  }
  const deker = world.skaters[c.deker];
  if (!deker) {
    s.stun = Math.max(s.stun, c.until - world.time);
    s.vx = 0;
    s.vz = 0;
    return { wx: 0, wz: 0, mag: 0, burst: false };
  }
  const toX = deker.x - s.x;
  const toZ = deker.z - s.z;
  const toD = Math.hypot(toX, toZ) || 1;
  const closing = s.vx * (toX / toD) + s.vz * (toZ / toD);
  if (closing > 0) {
    s.vx -= (toX / toD) * closing;
    s.vz -= (toZ / toD) * closing;
  }
  const miss = dekeMissPoint(deker, c, s);
  const dx = miss.x - s.x;
  const dz = miss.z - s.z;
  const dist = Math.hypot(dx, dz) || 1;
  return { wx: dx / dist, wz: dz / dist, mag: 1, burst: false };
}

function commitDekeDefenders(
  user: Skater,
  fx: number,
  fz: number,
  lx: number,
  lz: number,
  side: number,
): void {
  const ox = -lx * side;
  const oz = -lz * side;
  const near: { s: Skater; d: number }[] = [];
  for (const s of world.skaters) {
    if (s.id === user.id || s.side === user.side || s.kind === "goalie") continue;
    const dx = s.x - user.x;
    const dz = s.z - user.z;
    const d = Math.hypot(dx, dz);
    if (d > DEKE_COMMIT_REACH) continue;
    if (dx * fx + dz * fz <= 0.05) continue;
    near.push({ s, d });
  }
  near.sort((a, b) => a.d - b.d);
  dekeCommit.clear();
  const until = world.time + DEKE_COMMIT_S;
  for (const { s, d } of near.slice(0, 2)) {
    const c: DekeCommit = { until, deker: user.id, ox, oz, fx, fz, freeze: false };
    const miss = dekeMissPoint(user, c, s);
    const body = user.radius + s.radius;
    const through = distToSegment(user.x, user.z, s.x, s.z, miss.x, miss.z) < body;
    const closing = s.vx * (user.x - s.x) + s.vz * (user.z - s.z);
    const soon = d < body + 0.45 && closing > 0;
    c.freeze = through || soon || d < body;
    dekeCommit.set(s.id, c);
    disarmDekeBite(s);
    if (c.freeze) {
      s.stun = Math.max(s.stun, DEKE_COMMIT_S);
      s.vx = 0;
      s.vz = 0;
    }
  }
}

function applyDeke(user: Skater): void {
  if (periodEndLive()) return;
  const { fx, fz } = heading(user.yaw);
  const lx = -fz;
  const lz = fx;
  const side = user.z >= 0 ? 1 : -1;
  commitDekeDefenders(user, fx, fz, lx, lz, side);
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

function tickDeke(user: Skater, _dt: number): void {
  if (world.puck.owner !== user.id) return;
  const spot = stickBlade(user);
  world.puck.x = spot.x;
  world.puck.z = spot.z;
  world.puck.y = PUCK_Y;
  world.puck.vx = user.vx;
  world.puck.vz = user.vz;
  world.puck.vy = 0;
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
    const side = Math.sign((s.x - hitter.x) * lx + (s.z - hitter.z) * lz) || (s.z >= 0 ? 1 : -1);
    vx = hx * 4.6 + lx * side * (8.6 + Math.random() * 3.4) + s.vx * 0.12;
    vz = hz * 4.6 + lz * side * (8.6 + Math.random() * 3.4) + s.vz * 0.12;
    vy = 1.18 + Math.random() * 0.72;
    noteRelease("check", hitter);
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

/** Screen-up along the rink. Same sign World uses so the attack net stays at the top. */
function screenUpSign(): 1 | -1 {
  if (useGame.getState().clockMode === "drill") return 1;
  const so = world.shootout;
  if (so && so.attempts.length > 0) {
    const attempt = so.attempts[so.attempts.length - 1];
    if (attempt) {
      const atk = attempt.side === "home" ? world.homeAttack : -world.homeAttack;
      return atk >= 0 ? 1 : -1;
    }
  }
  const homeUp: 1 | -1 = world.homeAttack > 0 ? 1 : -1;
  if (cpuScrimmageWatchOn()) return homeUp === 1 ? -1 : 1;
  return homeUp;
}

/** Home goalie's net is the end at the top of the screen. */
function userGoalieNetAtTop(): boolean {
  const net: 1 | -1 = defendDir("home") >= 0 ? 1 : -1;
  return net === screenUpSign();
}

/** Left triggers are the hand on the left of the screen. Top-net swaps glove and blocker. */
function goalieButtonHand(leftSide: boolean): "glove" | "blocker" {
  const gloveOnLeft = !userGoalieNetAtTop();
  if (leftSide) return gloveOnLeft ? "glove" : "blocker";
  return gloveOnLeft ? "blocker" : "glove";
}

function goalieHandZ(s: Skater, hand: "glove" | "blocker"): 1 | -1 {
  const blocker: 1 | -1 = attackDir(s.side) > 0 ? 1 : -1;
  return hand === "blocker" ? blocker : blocker === 1 ? -1 : 1;
}

const goalieHandSave = new Map<number, { pose: "goalieGloveSave" | "goalieBlockerSave"; until: number }>();

export function goalieHandSavePose(s: Skater): "goalieGloveSave" | "goalieBlockerSave" | null {
  const rec = goalieHandSave.get(s.id);
  if (!rec) return null;
  if (world.time > rec.until) {
    goalieHandSave.delete(s.id);
    return null;
  }
  return rec.pose;
}

function goalieHandContactsPuck(g: Skater, hand: "glove" | "blocker"): boolean {
  const puck = world.puck;
  if (puck.owner === g.id) return false;
  if (puck.owner !== null) {
    const holder = world.skaters[puck.owner];
    if (!holder || holder.side === g.side) return false;
  }
  const side = goalieHandZ(g, hand);
  if ((puck.z - g.z) * side < -0.15) return false;
  if (Math.hypot(puck.x - g.x, puck.z - g.z) > 1.45) return false;
  if (hand === "glove") return puck.y > 0.35 && puck.y < 1.35;
  return puck.y < 1.15;
}

function userGoalieHandSave(user: Skater, hand: "glove" | "blocker", dive: boolean): void {
  if (dive) {
    if (user.dive <= 0) {
      user.dive = 1.5;
      const z = goalieHandZ(user, hand);
      user.vx = 0;
      user.vz = z * 7.5;
      goalieDiveSave.set(user.id, hand === "glove" ? "goalieDivingGloveSave" : "goalieDivingStickSave");
    }
  } else {
    goalieHandSave.set(user.id, {
      pose: hand === "glove" ? "goalieGloveSave" : "goalieBlockerSave",
      until: world.time + 0.4,
    });
  }
  if (!goalieHandContactsPuck(user, hand)) return;
  const end: 1 | -1 = defendDir(user.side) >= 0 ? 1 : -1;
  applyGoalieSave(user, world.puck, 0.7, end * GOAL_LINE_X - end * 0.8, hand === "glove", false, hand === "blocker");
  user.poke = 0;
  if (shootoutUserGoalie(user)) failShootoutGoaliePoke(user);
}

/** Dive toward the stick or the glove. Velocity first, otherwise the puck. */
function startGoalieDiveSave(user: Skater): void {
  if (user.dive > 0) return;
  user.dive = 1.5;
  let dx = user.vx;
  let dz = user.vz;
  if (Math.hypot(dx, dz) < 0.35) {
    dx = world.puck.x - user.x;
    dz = world.puck.z - user.z;
  }
  const pose = goalieDivePoseFor(user, dx, dz);
  const hand = pose === "goalieDivingGloveSave" ? "glove" : "blocker";
  const z = goalieHandZ(user, hand);
  user.vx = 0;
  user.vz = z * 7.5;
  goalieDiveSave.set(user.id, pose);
  if (!goalieHandContactsPuck(user, hand)) return;
  const end: 1 | -1 = defendDir(user.side) >= 0 ? 1 : -1;
  applyGoalieSave(user, world.puck, 0.7, end * GOAL_LINE_X - end * 0.8, hand === "glove", false, hand === "blocker");
  user.poke = 0;
  if (shootoutUserGoalie(user)) failShootoutGoaliePoke(user);
}

/** LT/RT stay the standing saves. LB is back skate. RB is the diving save. */
function stepUserGoaliePads(user: Skater, act: Actions): void {
  if (user.kind !== "goalie" || world.puck.owner === user.id) {
    if (user.dive > 1 && !act.rbDown) user.dive = 0.95;
    return;
  }
  if (act.rbEdge) {
    startGoalieDiveSave(user);
  } else if (act.ltEdge || act.rtEdge) {
    userGoalieHandSave(user, goalieButtonHand(act.ltEdge && !act.rtEdge), false);
  } else if (act.ltDown || act.rtDown) {
    const hand = goalieButtonHand(act.ltDown && !act.rtDown);
    goalieHandSave.set(user.id, {
      pose: hand === "glove" ? "goalieGloveSave" : "goalieBlockerSave",
      until: world.time + 0.4,
    });
  }
  if (user.dive > 1 && !act.rbDown) user.dive = 0.95;
}

/** Y, and a Skill Stick stick-up or pull-back with no puck. A sideways push pokes instead. Stoppage is the frozen-puck check. */
/** Y check and dive stay on during the period-end skate, even if the user still has the puck. */
function skatePeriodEndContact(
  user: Skater,
  act: Actions,
  wings: boolean,
  mag: number,
  wx: number,
  wz: number,
): void {
  if (user.kind !== "goalie") {
    const yHit = act.yEdge;
    if (!yHit) armSkillStickHit(user, act, false);
    finishSkillStickHit(user, yHit);
  }
  if (
    world.puck.owner !== user.id &&
    (act.xEdge || act.xTap) &&
    world.lastShoot !== world.time
  ) {
    user.poke = Math.max(user.poke, 0.34);
    if (user.kind === "goalie") armUserGoaliePokePose(user);
  }
  if (user.kind === "goalie") {
    if (act.yEdge) pressUserCheck(user);
    stepUserGoaliePads(user, act);
    return;
  }
  const diveDown = wings ? act.rbDown : act.rtDown;
  const diveEdge = wings ? act.rbEdge : act.rtEdge;
  if (diveEdge && user.dive <= 0) {
    user.poke = 0.52;
    user.dive = 1.5;
  } else if (user.dive > 1 && !diveDown) {
    user.dive = 0.95;
  }
}

function pressUserCheck(user: Skater): void {
  if (world.stoppage) {
    user.hit = 0.55;
    beginUserCheck();
    const g = goalieInStickRange(user);
    if (g) bumpCreasePoke(g);
    return;
  }
  user.hit = 0.42;
  beginUserCheck();
  if (cpuAttacking()) world.whiffPending = true;
}

function keepSkillHitFacing(user: Skater): void {
  if (skillHitYaw === null) return;
  if (user.hit <= 0) {
    skillHitYaw = null;
    return;
  }
  user.yaw = skillHitYaw;
}

/**
 * Right stick in the camera basis skating already uses.
 * Stick up with camFx 1 and camFz 0 is world +X.
 * atan2(-x, -z) matches heading(): that stick-up case is yaw -PI/2, heading +X.
 * Stick right (aimX 1) with camRx 0 and camRz 1 is world +Z.
 */
function stickPushYaw(act: Actions): number | null {
  const x = world.camRx * act.aimX + world.camFx * act.aimY;
  const z = world.camRz * act.aimX + world.camFz * act.aimY;
  if (Math.hypot(x, z) < 1e-4) return null;
  return Math.atan2(-x, -z);
}

/**
 * Mark one defensive right-stick push that is a body check. Does not swing yet.
 * Live play sends a sideways push to skillStickSweep instead.
 * Stoppage still arms any direction, including sideways.
 * The aim uses the camera basis skating already uses.
 */
function armSkillStickHit(user: Skater, act: Actions, hasPuck: boolean): void {
  if (!skillRsRising) return;
  if (useGame.getState().controlProfile !== "stick") return;
  if (hasPuck || user.kind === "goalie") return;
  const yaw = stickPushYaw(act);
  if (yaw === null) return;
  skillHitPush = true;
  skillHitYaw = yaw;
}

/** Y wins the frame. Otherwise the armed stick push throws that same check. */
function finishSkillStickHit(user: Skater, yAlready: boolean): void {
  if (yAlready) {
    skillHitYaw = null;
    pressUserCheck(user);
    return;
  }
  if (!skillRsRising || !skillHitPush || skillHitYaw === null) return;
  user.yaw = skillHitYaw;
  pressUserCheck(user);
}

/**
 * Skill Stick, no puck, not the goalie: hold RB and one right-stick push.
 * Same 0.36 crossing as the hit. Any direction, including stick-up.
 * A sideways push with no RB is skillStickSweep, not this.
 */
function skillStickPokePush(user: Skater, act: Actions): boolean {
  if (!act.rbDown || !skillRsRising) return false;
  if (useGame.getState().controlProfile !== "stick") return false;
  if (user.kind === "goalie" || world.puck.owner === user.id) return false;
  return stickPushYaw(act) !== null;
}

/**
 * Skill Stick, no puck, not the goalie: one sideways push, no RB.
 * Forehand and backhand only. Stick-up stays the body check.
 * Faces along that stick direction and uses the X poke, so the blade can
 * knock a carried puck free. It does not arm the check.
 */
function skillStickSweep(user: Skater, act: Actions): boolean {
  if (!skillRsRising) return false;
  if (useGame.getState().controlProfile !== "stick") return false;
  if (user.kind === "goalie" || world.puck.owner === user.id) return false;
  const sec = skillSector(act.aimX, act.aimY);
  if (sec !== "fore" && sec !== "back") return false;
  return stickPushYaw(act) !== null;
}

/**
 * Loose puck on the blade, or in a narrow lane along the stick.
 * The lane is shorter and tighter than a body check.
 */
function sweepLooseContact(user: Skater): boolean {
  const puck = world.puck;
  if (puck.y >= 0.4) return false;
  const blade = stickBlade(user);
  if (Math.hypot(blade.x - puck.x, blade.z - puck.z) < 0.95) return true;
  const { fx, fz } = heading(user.yaw);
  const dx = puck.x - user.x;
  const dz = puck.z - user.z;
  const ahead = dx * fx + dz * fz;
  const lat = Math.abs(dx * fz - dz * fx);
  return ahead > 0.3 && ahead < 1.75 && lat < 0.45;
}

function faceSkillStickPoke(user: Skater, act: Actions): void {
  const yaw = stickPushYaw(act);
  if (yaw === null) return;
  skillPokeYaw = yaw;
  user.yaw = skillPokeYaw;
}

function keepSkillPokeFacing(user: Skater): void {
  if (user.poke <= 0) {
    skillPokeYaw = null;
    skillSweepPoke = false;
    skillSweepBat = false;
    return;
  }
  if (skillPokeYaw === null) return;
  if (user.hit > 0) return;
  user.yaw = skillPokeYaw;
}

const CHECK_PAD = 0.22;
const CHECK_LAT = 0.5;
const CHECK_CLOSE_S = 0.12;
const CHECK_CLOSE_V = 3.2;
const CHECK_KEEP_FWD = 0.7;
const CHECK_KEEP_LAT = 0.85;
const CHECK_RECOIL = 0.6;
const CHECK_POSE = 0.22;
// User body checks. CPU stays on checkSpot (bodies + CHECK_PAD, about 1.06 m).
// Struck used to fall at 1/s for everyone. A tumble set stun 1.45 (goalie 1.55),
// struck 1.68, tumble ±(0.85..1.3), tumbleSpin 0. An absorb set stun 1.2
// (goalie 1.55), struck 1.25 (goalie 1.7), tumble 0, tumbleSpin ±(0.85..1.3).
// decayGoalieDown clears a goalie tumble at struck
// <= 0.14. A referee absorbed first (struck 1.25), restarted at 1.68 with a
// tumble when that crossed 0.2, and cleared both at struck <= 0.1, on that same
// 1/s clock (about 2.63 s, longer than a skater tumble, which is up around 1.58 s).
// checkedCyclePose is absorb (tumble 0, struck > 0.2), knockout until struck
// falls through TUMBLE_STRIKE * (1 - TUMBLE_UP) (about 0.466), then recover until
// struck <= 0.1. User, CPU, chain, and close-step checks skipped struck > 0.45,
// so knockout and the first instant of recover could not be hit again.
// User reach is 1.5 with or without backskate, lateral 0.9, ahead -0.2
// (-0.25 while backskating), cap 1.7.
// The 0.12 s close adds up to 0.384 and never passes that cap. CPU reach is the
// two radii plus CHECK_PAD, lateral half the radii. A celebration did not change it.
// The skip is now only CHECK_REHIT_S after the strike opens, so the rest of the
// get-up stays hittable for skaters, goalies, and referees. A hit that lands
// during absorb restarts that absorb strike. A hit during knockout or recover
// restarts at the knockout strike (the first goalieGetUp frame when tumbling).
// A referee hit during any of those poses goes back to absorb, then knockout,
// then recover. Referee struck falls at REF_CHECK_RATE. For CELEB_CHECK_WINDOW
// after a goal, a celebrating opponent uses the wider user reach below.
const USER_CHECK_REACH = 1.5;
const USER_CHECK_LAT = 0.9;
const USER_CHECK_AHEAD = -0.2;
const USER_CHECK_CAP = 1.7;
const CHECK_REHIT_S = 0.3;
const REF_CHECK_RATE = 2.2;
const CELEB_CHECK_WINDOW = 2;
const CELEB_CHECK_REACH = 3.6;
const CELEB_CHECK_LAT = 1.8;
const CELEB_CHECK_AHEAD = -1.2;
const CELEB_CHECK_CAP = 3.6;
const checkCloseLeft = new Map<number, number>();
/** Hit value at the start of this check. Elapsed time is that value minus s.hit. */
const shoulderCheckArmed = new Map<number, number>();

function noteShoulderCheck(s: Skater): void {
  const prev = shoulderCheckArmed.get(s.id);
  if (prev === undefined || s.hit > prev) shoulderCheckArmed.set(s.id, s.hit);
}

/** Shoulder check 1 for the first 0.12s, then shoulder check 2. */
export function shoulderCheckPose(s: Skater): "shoulderCheck1" | "shoulderCheck2" {
  const armed = shoulderCheckArmed.get(s.id) ?? s.hit;
  return armed - s.hit < SHOULDER_CHECK_LEAD ? "shoulderCheck1" : "shoulderCheck2";
}
const checkAbsorbed = new Set<number>();
// Skaters put here by layDownSkater. Knockout and recover rewind without it.
// Absorb rewinds only for this set, so a poke or faceoff flinch stays a fresh check.
const checkCycleIds = new Set<number>();
// Checked refs stay where they get up through a goal or a finished drill.
const refStayPut = new WeakSet<Referee>();
/** Absorb is on. The next decay through 0.2 starts the skater tumble clock. */
const refOnAbsorb = new WeakSet<Referee>();

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

/** User connect range. The 0.12 s close adds CHECK_CLOSE_V * time left, never past 1.7 m. */
function userCheckMetrics(user: Skater): { reach: number; lateral: number; aheadMin: number } {
  const stance = user.backskate;
  const left = Math.max(0, checkCloseLeft.get(user.id) ?? 0);
  const base = USER_CHECK_REACH;
  return {
    reach: Math.min(USER_CHECK_CAP, base + CHECK_CLOSE_V * left),
    lateral: USER_CHECK_LAT,
    aheadMin: stance ? -0.25 : USER_CHECK_AHEAD,
  };
}

/**
 * Wider user-check reach.
 * A goal whistle uses it on a celebrating opponent for CELEB_CHECK_WINDOW, and on
 * anyone who has raged for the rest of that whistle. Rage used to clear celebrate,
 * which dropped them out of the reach, and the stoppage skip then froze struck.
 * An offside whistle uses the same reach on every opposing skater.
 */
function wideCheckTarget(s: Skater): boolean {
  if (s.id === world.userId) return false;
  const user = world.skaters[world.userId];
  if (!user || s.side === user.side) return false;
  if (world.whistle === "offside") return true;
  if (world.whistle !== "goal") return false;
  if (s.smashKind > 0 || goalRageBusy(s.id)) return true;
  return world.stoppageT < CELEB_CHECK_WINDOW && s.celebrate > 0.05;
}

function checkLane(
  dx: number,
  dz: number,
  fx: number,
  fz: number,
  reach: number,
  lateralGate: number,
  aheadMin = 0,
): { ok: boolean; ahead: number; lateral: number } {
  const ahead = dx * fx + dz * fz;
  const lateral = Math.abs(dx * fz - dz * fx);
  return {
    ok: Math.hypot(dx, dz) < reach && ahead > aheadMin && lateral < lateralGate,
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
    if (checkRecoverImmune(o.struck, o.tumble, o.kind === "goalie", false)) continue;
    const spot = checkSpot(s.radius, o.radius);
    const dx = o.x - s.x;
    const dz = o.z - s.z;
    const near = checkLane(dx, dz, fx, fz, spot.reach + extra, spot.lateral);
    const touching = checkLane(dx, dz, fx, fz, spot.reach, spot.lateral);
    if (near.ok && !touching.ok) return true;
  }
  if (!ui.checkRefs) return false;
  for (const r of refsOnIce()) {
    if (checkRecoverImmune(r.struck, r.tumble, false, true)) continue;
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
  if (left <= 0) return;
  if (!foeNearCheck(s, left)) {
    // User reach spends the 0.12 s window from the swing, even on a whiff.
    if (s.id === world.userId) checkCloseLeft.set(s.id, Math.max(0, left - dt));
    return;
  }
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

function layDownSkater(
  s: Skater,
  fx: number,
  fz: number,
  ivx: number,
  ivz: number,
  tumbleP = 0.45,
  hitter: { x: number; z: number; vx: number; vz: number } | null = null,
): void {
  const rewound = rewindCheckedCycle(s);
  // Spin reads the velocities from the moment of impact, before the shove.
  const absorbSpin = hitter
    ? impactTumbleSpin(s, hitter, s.kind === "goalie" ? REACT_ABSORB_SPIN : CHECK_ABSORB_SPIN)
    : 0;
  if (s.kind === "goalie") {
    const out = attackDir(s.side);
    if (!rewound) s.stun = 1.55;
    s.vx = fx * 11 + ivx * 0.55 + out * 5.2;
    s.vz = fz * 11 + ivz * 0.55;
    s.x += fx * 0.55 + out * 0.42;
    s.z += fz * 0.55;
    s.coverPose = 0;
    s.gloveFlash = 0;
    if (!rewound) {
      if (Math.random() < tumbleP) {
        s.struck = TUMBLE_STRIKE;
        s.tumble = (Math.random() < 0.5 ? 1 : -1) * (0.85 + Math.random() * 0.45);
        s.tumbleSpin = 0;
      } else {
        s.struck = GOALIE_ABSORB_STRIKE;
        s.tumble = 0;
        s.tumbleSpin = absorbSpin;
      }
    }
  } else if (rewound) {
    s.vx = fx * 12 + ivx * 0.45;
    s.vz = fz * 12 + ivz * 0.45;
  } else if (Math.random() < tumbleP) {
    s.stun = 1.4;
    s.struck = 1.65;
    s.tumble = Math.random() < 0.5 ? 1 : -1;
    s.tumbleSpin = 0;
    s.vx = fx * 12 + ivx * 0.45;
    s.vz = fz * 12 + ivz * 0.45;
  } else {
    s.stun = 1.1;
    s.struck = 1.2;
    s.tumble = 0;
    s.tumbleSpin = absorbSpin;
    s.vx = fx * 12 + ivx * 0.45;
    s.vz = fz * 12 + ivz * 0.45;
  }
  checkCycleIds.add(s.id);
}

/** Same strike clock as tumbleRoot. Pitch caps once u reaches TUMBLE_UP. */
export const TUMBLE_STRIKE = 1.68;
export const TUMBLE_PITCH_MAX = 1.12;
export const TUMBLE_PITCH_RATE = 1.55;
export const TUMBLE_UP = TUMBLE_PITCH_MAX / TUMBLE_PITCH_RATE;
/** Non-tumble receive on a checked skater. Absorb holds while this decays to 0.2. */
const ABSORB_STRIKE = 1.25;
/** Goalie absorb in layDownSkater and the CPU hit. No tumble. */
const GOALIE_ABSORB_STRIKE = 1.7;

/**
 * True only for the opening CHECK_REHIT_S of this strike.
 * Absorb, knockout, and the get-up after that stay hittable.
 * Referee struck falls at REF_CHECK_RATE, so the same real-time lock is a larger drop.
 */
function checkRecoverImmune(struck: number, tumble: number, goalie: boolean, ref: boolean): boolean {
  if (struck <= 0) return false;
  const open = tumble !== 0 ? TUMBLE_STRIKE : goalie ? GOALIE_ABSORB_STRIKE : ABSORB_STRIKE;
  const rate = ref ? REF_CHECK_RATE : 1;
  return struck > open - CHECK_REHIT_S * rate;
}

/**
 * Live names for a checked body. Same windows as a skater:
 * absorb (tumble 0, struck above 0.2), knockout, then recover.
 */
export function checkedCyclePose(struck: number, tumble: number): "absorb" | "knockout" | "recover" | null {
  if (tumble !== 0 && struck > 0.1) {
    const u = Math.min(1, Math.max(0, 1 - struck / TUMBLE_STRIKE));
    return u >= TUMBLE_UP ? "recover" : "knockout";
  }
  if (tumble === 0 && struck > 0.2) return "absorb";
  return null;
}

function syncCheckCycle(s: Skater): void {
  if (!checkedCyclePose(s.struck, s.tumble)) checkCycleIds.delete(s.id);
}

/** Keep a full fall flag so a rewind plays the same knockdown from the first frame. */
function heldTumble(tumble: number): number {
  const sign = tumble < 0 ? -1 : 1;
  return sign * Math.min(1.3, Math.max(0.85, Math.abs(tumble)));
}

/**
 * True when this body is in the check cycle.
 * knockout and recover are that tumble. absorb counts only after layDownSkater,
 * so a poke or faceoff flinch is still a new check.
 */
function checkCycleLive(s: Skater): boolean {
  if (heldBody(s.id)) return false;
  const brawl = world.lineBrawl;
  if (brawl) {
    for (const p of brawl.pairs) {
      if (p.home === s.id || p.away === s.id) return false;
    }
  }
  const pose = checkedCyclePose(s.struck, s.tumble);
  if (pose === "knockout" || pose === "recover") return true;
  return pose === "absorb" && checkCycleIds.has(s.id);
}

/**
 * Restart the cycle already playing.
 * absorb returns to the absorb strike. knockout and recover return to the
 * knockout strike, which is the first frame of goalieGetUp.
 */
function rewindCheckedCycle(s: Skater): boolean {
  if (!checkCycleLive(s)) return false;
  const pose = checkedCyclePose(s.struck, s.tumble);
  const goalie = s.kind === "goalie";
  if (pose === "absorb") {
    s.stun = goalie ? 1.55 : 1.1;
    s.struck = goalie ? GOALIE_ABSORB_STRIKE : 1.2;
    s.tumble = 0;
  } else {
    s.stun = goalie ? 1.55 : 1.4;
    s.struck = goalie ? TUMBLE_STRIKE : 1.65;
    s.tumble = heldTumble(s.tumble);
    s.tumbleSpin = 0;
  }
  return true;
}

function layDownRef(
  r: Referee,
  fx: number,
  fz: number,
  ivx: number,
  ivz: number,
  hitter: { x: number; z: number; vx: number; vz: number },
): void {
  refStayPut.add(r);
  r.tumbleSpin = impactTumbleSpin(r, hitter, REACT_ABSORB_SPIN);
  r.vx = fx * 11 + ivx * 0.45;
  r.vz = fz * 11 + ivz * 0.45;
  r.pose = "idle";
  r.struck = ABSORB_STRIKE;
  r.tumble = 0;
  refOnAbsorb.add(r);
}

/** Absorb, then the same tumble a knocked-down skater starts, then recover until struck falls through 0.1. */
function advanceCheckedRef(r: Referee, dt: number): void {
  const absorbing = refOnAbsorb.has(r);
  if (r.struck > 0) r.struck = Math.max(0, r.struck - dt * REF_CHECK_RATE);
  if (absorbing && r.tumble === 0 && r.struck <= 0.2) {
    refOnAbsorb.delete(r);
    r.struck = TUMBLE_STRIKE;
    r.tumble = (Math.random() < 0.5 ? 1 : -1) * (0.85 + Math.random() * 0.45);
    r.tumbleSpin = 0;
    return;
  }
  if (r.tumble !== 0 && r.struck <= 0.1) {
    r.tumble = 0;
    r.tumbleSpin = 0;
    r.struck = 0;
  }
}

function lineBrawlAllowed(): boolean {
  const ui = useGame.getState();
  if (!ui.lineBrawl) return false;
  return ui.clockMode === "roller" || ui.clockMode === "game";
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
  poseEveryRef("cover");
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
  const refs =
    useGame.getState().clockMode === "game"
      ? [
          { r: world.ref, x: -7.2 },
          { r: world.ref2, x: -2.4 },
          { r: world.ref3, x: 2.4 },
          { r: world.ref4, x: 7.2 },
        ]
      : [
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
    refOnAbsorb.delete(r);
    r.x += (spot.x - r.x) * Math.min(1, 4 * dt);
    r.z += (watchZ - r.z) * Math.min(1, 4 * dt);
    r.yaw = turnToward(r.yaw, -r.x, -RINK_W / 2 + 1.7 - r.z, 6, dt);
  }
}

function applyUserHit(user: Skater): boolean {
  if (!userCheckOpen) return userCheckDowns > 0;
  const { fx, fz } = heading(user.yaw);
  const ui = useGame.getState();
  const stance = user.backskate;
  const band = userCheckMetrics(user);
  const tumbleP = stance ? 0.4 : 0.3;
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
    if (checkRecoverImmune(s.struck, s.tumble, s.kind === "goalie", false)) continue;
    const dx = s.x - user.x;
    const dz = s.z - user.z;
    const celeb = wideCheckTarget(s);
    const reach = celeb ? CELEB_CHECK_REACH : Math.min(band.reach, USER_CHECK_CAP);
    const lateral = celeb ? CELEB_CHECK_LAT : band.lateral;
    const aheadMin = celeb ? CELEB_CHECK_AHEAD : band.aheadMin;
    const cap = celeb ? CELEB_CHECK_CAP : USER_CHECK_CAP;
    if (Math.hypot(dx, dz) > cap) continue;
    const lane = checkLane(dx, dz, fx, fz, reach, lateral, aheadMin);
    if (lane.ok) take(lane.ahead, lane.lateral, s, null);
  }
  if (ui.checkRefs) {
    for (const r of refsOnIce()) {
      if (checkRecoverImmune(r.struck, r.tumble, false, true)) continue;
      const dx = r.x - user.x;
      const dz = r.z - user.z;
      if (Math.hypot(dx, dz) > USER_CHECK_CAP) continue;
      const lane = checkLane(
        dx,
        dz,
        fx,
        fz,
        Math.min(band.reach, USER_CHECK_CAP),
        band.lateral,
        band.aheadMin,
      );
      if (lane.ok) take(lane.ahead, lane.lateral, null, r);
    }
  }
  if (!best.s && !best.r) return false;
  userCheckOpen = false;
  userCheckDowns = 1;
  if (best.s) {
    if (tryBenchDump(user, best.s, fx, fz)) {
      notePasserChecked(best.s);
      absorbHitterMomentum(user);
      world.lastHitter = user.id;
      world.lastHitTime = world.time;
      return true;
    }
    layDownSkater(best.s, fx, fz, user.vx, user.vz, tumbleP, user);
    absorbHitterMomentum(user);
    userCheckSkaters.add(best.s.id);
    if (world.puck.owner === best.s.id) spillCheckedPuck(best.s, user);
    else if (
      world.puck.owner === null &&
      world.time - world.lastHitTime > 0.2 &&
      !passJustStarting(best.s)
    ) {
      const dP = Math.hypot(world.puck.x - best.s.x, world.puck.z - best.s.z);
      if (dP < 1.45) {
        const lx = -fz;
        const lz = fx;
        const side = Math.sign((world.puck.x - user.x) * lx + (world.puck.z - user.z) * lz) || 1;
        noteRelease("check", user, false);
        world.puck.vx = fx * 5.2 + lx * side * 8.5;
        world.puck.vz = fz * 5.2 + lz * side * 8.5;
        world.puck.vy = 1.2;
        world.puck.y = Math.max(world.puck.y, PUCK_Y + 0.12);
      }
    }
    notePasserChecked(best.s);
  } else if (best.r) {
    layDownRef(best.r, fx, fz, user.vx, user.vz, user);
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
  const flyers: { x: number; z: number; vx: number; vz: number; rad: number; goalie: boolean }[] =
    [];
  for (const s of world.skaters) {
    if (userCheckSkaters.has(s.id) && s.struck > 0.35 && s.vx * s.vx + s.vz * s.vz > 20.25) {
      flyers.push({
        x: s.x,
        z: s.z,
        vx: s.vx,
        vz: s.vz,
        rad: s.radius,
        goalie: s.kind === "goalie",
      });
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
      if (userCheckSkaters.has(s.id) || checkRecoverImmune(s.struck, s.tumble, s.kind === "goalie", false))
        continue;
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
        if (userCheckRefs.has(r) || checkRecoverImmune(r.struck, r.tumble, false, true)) continue;
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
      layDownSkater(bestS, dirX, dirZ, 0, 0, 0.45, { x: f.x, z: f.z, vx: f.vx, vz: f.vz });
      userCheckSkaters.add(bestS.id);
      if (world.puck.owner === bestS.id) spillCheckedPuck(bestS);
      notePasserChecked(bestS);
    } else if (bestR && takeChainDown(bestR)) {
      layDownRef(bestR, dirX, dirZ, 0, 0, { x: f.x, z: f.z, vx: f.vx, vz: f.vz });
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
    if (checkRecoverImmune(s.struck, s.tumble, s.kind === "goalie", false)) continue;
    const dx = s.x - user.x;
    const dz = s.z - user.z;
    const spot = checkSpot(user.radius, s.radius);
    const lane = checkLane(dx, dz, fx, fz, spot.reach, spot.lateral);
    if (lane.ok) {
      connected = true;
      landed = true;
      layDownSkater(s, fx, fz, user.vx, user.vz, user.backskate ? 0.4 : 0.3, user);
      if (world.puck.owner === s.id && !userStickCommitHolds(s.id)) spillCheckedPuck(s, user);
      else if (
        world.puck.owner === null &&
        world.time - world.lastHitTime > 0.2 &&
        !passJustStarting(s)
      ) {
        const dP = Math.hypot(world.puck.x - s.x, world.puck.z - s.z);
        if (dP < 1.45) {
          const lx = -fz;
          const lz = fx;
          const side = Math.sign((world.puck.x - user.x) * lx + (world.puck.z - user.z) * lz) || 1;
          noteRelease("check", user, false);
          world.puck.vx = fx * 5.2 + lx * side * 8.5;
          world.puck.vz = fz * 5.2 + lz * side * 8.5;
          world.puck.vy = 1.2;
          world.puck.y = Math.max(world.puck.y, PUCK_Y + 0.12);
        }
      }
      notePasserChecked(s);
      world.lastHitter = user.id;
      world.lastHitTime = world.time;
    }
  }
  if (useGame.getState().checkRefs) {
    for (const r of refsOnIce()) {
      if (checkRecoverImmune(r.struck, r.tumble, false, true)) continue;
      const dx = r.x - user.x;
      const dz = r.z - user.z;
      const spot = checkSpot(user.radius, 0.45);
      const lane = checkLane(dx, dz, fx, fz, spot.reach, spot.lateral);
      if (lane.ok) {
        landed = true;
        layDownRef(r, fx, fz, user.vx, user.vz, user);
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
  const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
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
    writeRebound(
      puck,
      side * (4.2 + Math.random() * 2.4),
      0.55 + Math.random() * 1.4,
      open * (next === 0 ? 6.4 : 3.6 + Math.random() * 2.8),
      cap,
    );
    puck.y = Math.max(0.16, puck.y);
    return;
  }
  if (hit === 1) {
    puck.x = mouth + side * 0.05;
    puck.y = GOAL_H - 0.05;
    puck.z = Math.max(-hw + 0.16, Math.min(hw - 0.16, puck.z));
    writeRebound(
      puck,
      side * (Math.abs(puck.vx) * 0.42 + cap * 0.2),
      -(Math.abs(puck.vy) * 0.35 + cap * 0.12),
      puck.vz * 0.28,
      cap,
    );
    return;
  }
  const zPost = puck.z >= 0 ? hw : -hw;
  puck.x = mouth + side * 0.04;
  puck.z = zPost - Math.sign(zPost) * 0.09;
  puck.y = Math.max(PUCK_Y, Math.min(GOAL_H - 0.08, puck.y));
  writeRebound(
    puck,
    side * (Math.abs(puck.vx) * 0.45 + cap * 0.16),
    next === 1 ? Math.min(cap * 0.35, 3.6) : Math.abs(puck.vy) * 0.35 + cap * 0.08,
    -Math.sign(zPost) * (next === 1 ? Math.min(cap * 0.2, 1.4) : Math.min(cap * 0.4, 4.2)),
    cap,
  );
}

function steerGoalBank(puck: Puck, side: 1 | -1, hit: number): void {
  const tgt = goalBankTarget(side, hit);
  const dx = tgt.x - puck.x;
  const dy = tgt.y - puck.y;
  const dz = tgt.z - puck.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
  const spd = Math.min(hit === 2 ? 9.5 : 8.2, cap);
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
  const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
  const keep = cap * 0.36;
  if (bar) {
    puck.x = mouth - side * 0.28;
    puck.y = GOAL_H + 0.2;
    puck.z = Math.max(-hw + 0.12, Math.min(hw - 0.12, z));
    writeRebound(puck, -side * keep * 0.45, keep * 0.55, puck.vz * 0.35, cap);
    return;
  }
  const outward = Math.sign(z) || 1;
  puck.x = mouth - side * 0.22;
  puck.z = outward * (hw + 0.22);
  puck.y = Math.max(PUCK_Y, Math.min(puck.y, 0.55));
  writeRebound(
    puck,
    -side * keep * 0.5,
    Math.min(cap * 0.1, Math.max(0, puck.vy) * 0.15),
    outward * keep * 0.8,
    cap,
  );
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

/** Past the goal line and outside the twine: the corner or the ice behind the cage. */
function behindTheCage(x: number, z: number, y: number, side: 1 | -1): boolean {
  const along = (x - side * GOAL_LINE_X) * side;
  if (along <= 0.02) return false;
  if (inCageVolume(x, z, y, side)) return false;
  return true;
}

function alreadyInCageOrBehind(x: number, z: number, y: number): boolean {
  for (const side of [1, -1] as const) {
    if (inCageVolume(x, z, y, side) || behindTheCage(x, z, y, side)) return true;
  }
  return false;
}

function crossedGoalMouth(prevX: number, prevZ: number, prevY: number, puck: Puck): 1 | -1 | 0 {
  for (const side of [1, -1] as const) {
    if (inCageVolume(prevX, prevZ, prevY, side)) continue;
    if (behindTheCage(prevX, prevZ, prevY, side)) continue;
    const mouth = side * GOAL_LINE_X;
    const before = side > 0 ? prevX < mouth : prevX > mouth;
    const nowPast = side > 0 ? puck.x >= mouth : puck.x <= mouth;
    if (!(before && nowPast)) continue;
    const span = puck.x - prevX;
    const t = Math.abs(span) < 1e-6 ? 1 : (mouth - prevX) / span;
    const zAt = prevZ + (puck.z - prevZ) * t;
    const yAt = prevY + (puck.y - prevY) * t;
    const throughMouth = yAt <= GOAL_H - 0.02 && Math.abs(zAt) <= GOAL_W / 2 - 0.02;
    const inNet = inCageVolume(puck.x, puck.z, puck.y, side);
    if (!throughMouth && !inNet) continue;
    return side;
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
  if (!steppingGhost && drillFromPass && world.drillShot && Math.abs(hit.nz) >= Math.abs(hit.nx)) {
    drillPassSide = true;
  }
  puck.x = hit.x;
  puck.z = hit.z;
  const b = reflectBoard(puck.vx, puck.vz, hit.nx, hit.nz);
  puck.vx = b.vx;
  puck.vz = b.vz;
  // A saucer that stays under the wall pops up the glass instead of sliding along it.
  if (useGame.getState().shotKind === "saucer" && puck.y > BOARD_H + 0.25) {
    const room = wallTop(hit.nx, hit.nz, hit.x, hit.z) - 0.18 - puck.y;
    if (room > 0.08) {
      const pop = Math.min(2.6, room * 1.35);
      if (puck.vy < pop) puck.vy = pop;
    }
  }
  const again = resolveRink(puck.x, puck.z, 0.09);
  if (again.hit && puck.y <= wallTop(again.nx, again.nz, again.x, again.z)) {
    puck.x = again.x;
    puck.z = again.z;
  }
  return true;
}

function boardArrival(
  x: number,
  z: number,
  vx: number,
  vz: number,
  vy: number,
): { y: number; limit: number } | null {
  let px = x;
  let pz = z;
  let pvx = vx;
  let pvz = vz;
  let py = PUCK_Y + Math.max(0, vy) * 0.02;
  let pvy = vy;
  for (let i = 0; i < 300; i++) {
    const damp = Math.exp(-PUCK_DRAG / 60);
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
  if (!high) return 0.08;
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
    const damp = Math.exp(-PUCK_DRAG / 60);
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
    // Came through the mouth. Leave it for the goal check; do not push it out the back.
    if (fromIce) continue;
    if (
      (world.delayedOffside === side || offsideFlight?.dir === side) &&
      (side > 0 ? prevX <= mouth + 0.2 : prevX >= mouth - 0.2)
    ) {
      continue;
    }
    const prevAlong = (prevX - mouth) * side;
    const depth = Math.max(0.12, cageDepthAt(puck.z, puck.y));
    // Already in the net. Do not throw it out through the twine.
    if (prevAlong > 0.02 && prevAlong < depth + 0.05) continue;
    const back = mouth + side * depth;
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

/** Targets stay on the +X net. Drill shots use this side, not home's attack end. */
function drillAttackSide(): 1 | -1 {
  return 1;
}

/** Opening drill yaw. Same convention as faceYaw: −π/2 faces the +X target net. */
function drillFaceYaw(): number {
  return drillAttackSide() > 0 ? -Math.PI / 2 : Math.PI / 2;
}

/** Center-ice spot on the side opposite the target net, so the shot is toward that net. */
function drillStartX(): number {
  return -drillAttackSide() * 1.15;
}

/** Time for a drill shot to reach the target net, including ice drag. Capped at 1s. */
function drillArriveTime(dist: number, speed: number): number {
  const drag = PUCK_DRAG;
  const v = Math.max(8, speed);
  const span = (Math.max(0.2, dist) * drag) / v;
  if (span >= 0.92) return 1;
  // One step past the continuous arrival, so the mouth crossing is simulated before recycle.
  return Math.min(1, -Math.log(1 - span) / drag + 1 / 60);
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
  if (!world.drillWon || drillWinLodged || drillWinKicked || drillPuckFrozen || drillEncoreLive)
    return;
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

function reboundWithin(
  vx: number,
  vy: number,
  vz: number,
  cap: number,
): { vx: number; vy: number; vz: number } {
  const sp = Math.hypot(vx, vy, vz);
  const limit = Math.max(0, cap);
  if (sp <= limit + 1e-4 || sp < 1e-8) return { vx, vy, vz };
  const m = limit / sp;
  return { vx: vx * m, vy: vy * m, vz: vz * m };
}

function writeRebound(puck: Puck, vx: number, vy: number, vz: number, cap: number): void {
  const v = reboundWithin(vx, vy, vz, cap);
  puck.vx = v.vx;
  puck.vy = v.vy;
  puck.vz = v.vz;
}

type IronFate = "in" | "back" | "out" | "lodge" | "goalie";

function ironPostSide(zHit: number): "near" | "far" {
  const near = Math.sign(shotReleaseZ) || Math.sign(zHit) || 1;
  return Math.sign(zHit || near) === near ? "near" : "far";
}

/** Near-post shots stay out only on the goal line itself, or behind it. */
function nearPostOnlyOut(): boolean {
  return shotBelowLine || shotFromLine < 0.8;
}

function dampTopCorner(puck: Puck, side: 1 | -1, zHit: number, cap: number): void {
  const keep = cap * 0.3;
  const outZ = Math.sign(zHit) || 1;
  const vy = Math.min(keep * 0.1, Math.max(0, puck.vy) * 0.15);
  writeRebound(puck, -side * keep * 0.7, vy, outZ * keep * 0.25, keep);
}

function lodgeMesh(puck: Puck, side: 1 | -1, where: "shelf" | "near" | "side", cap: number): void {
  const mouth = side * GOAL_LINE_X;
  const hw = GOAL_W / 2;
  const near = Math.sign(shotReleaseZ) || Math.sign(puck.z) || 1;
  if (where === "shelf") {
    puck.x = mouth + side * 0.2;
    puck.y = GOAL_H * 0.84;
    puck.z = near * hw * 0.42;
    meshRestShelf = true;
    meshRestY = puck.y;
    meshRestUntil = world.time + 2.4;
  } else {
    const y =
      where === "near"
        ? Math.max(PUCK_Y + 0.08, Math.min(GOAL_H * 0.7, puck.y || GOAL_H * 0.5))
        : Math.max(PUCK_Y + 0.05, Math.min(GOAL_H * 0.45, puck.y));
    const zz = near * (hw - 0.07);
    const depth = Math.max(0.12, cageDepthAt(Math.min(Math.abs(zz), hw - 0.02), Math.min(y, GOAL_H)));
    puck.x = mouth + side * Math.max(0.1, depth * 0.55);
    puck.y = y;
    puck.z = zz;
    meshRestShelf = false;
    meshRestUntil = -1;
  }
  writeRebound(puck, side * cap * 0.03, -cap * 0.02, 0, Math.max(0.02, cap * 0.08));
}

function dropOnGoalie(puck: Puck, side: 1 | -1, cap: number): boolean {
  const g = defendingGoalie(side);
  if (!g) return false;
  const mouth = side * GOAL_LINE_X;
  const hw = GOAL_W / 2;
  if (Math.hypot(g.x - (mouth - side * 0.7), g.z) > CREASE_R + 1.4) return false;
  puck.z = Math.max(-hw + 0.12, Math.min(hw - 0.12, g.z));
  puck.x = g.x + side * 0.22;
  if ((puck.x - mouth) * side < 0.06) puck.x = mouth + side * 0.14;
  puck.y = 1.08;
  writeRebound(puck, side * cap * 0.16, -cap * 0.1, 0, cap * 0.28);
  return true;
}

function settleFarPostBar(puck: Puck, side: 1 | -1, zHit: number, cap: number): void {
  const hw = GOAL_W / 2;
  const mouth = side * GOAL_LINE_X;
  puck.x = mouth + side * 0.02;
  puck.y = GOAL_H - 0.01;
  puck.z = Math.max(-hw + 0.05, Math.min(hw - 0.05, zHit - Math.sign(zHit || 1) * 0.06));
  if (Math.random() < 0.55) {
    lodgeMesh(puck, side, Math.random() < 0.5 ? "shelf" : "near", cap);
    return;
  }
  dampTopCorner(puck, side, zHit, cap);
}

function rollIronFate(kind: "post" | "bar", zHit: number, yHit: number): IronFate {
  const very = shotSharp >= 0.72 || shotBelowLine;
  if (kind === "post" && yHit <= GOAL_H * (2 / 3)) {
    if (ironPostSide(zHit) === "near" && nearPostOnlyOut()) return "out";
    if (ironPostSide(zHit) === "far" && very) return Math.random() < 0.5 ? "in" : "out";
  }
  const r = Math.random();
  if (kind === "bar") {
    if (r < 0.2) return "goalie";
    if (r < 0.48) return "in";
    if (r < 0.72) return "lodge";
    if (r < 0.86) return "back";
    return "out";
  }
  if (r < 0.4) return "in";
  if (r < 0.68) return "lodge";
  if (r < 0.84) return "back";
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
  ironStanceEnd = side;
  ironStanceT = world.time;
  const mouth = side * GOAL_LINE_X;
  const hw = GOAL_W / 2;
  const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
  const topFar =
    kind === "post" &&
    shotSharp > 0.35 &&
    ironPostSide(zHit) === "far" &&
    yHit > GOAL_H * (2 / 3);
  if (topFar) {
    if (useGame.getState().clockMode === "drill") {
      ironResolved = "in";
      noteDrillPipe();
    }
    settleFarPostBar(puck, side, zHit, cap);
    return;
  }
  const fate = deflectIronIn(ironWasWatched(side, kind, zHit), rollIronFate(kind, zHit, yHit), Math.random());
  if (useGame.getState().clockMode === "drill") {
    ironResolved = fate === "back" || fate === "out" ? fate : "in";
    noteDrillPipe();
  }
  if (fate === "goalie" && dropOnGoalie(puck, side, cap)) return;
  if (fate === "lodge" || fate === "goalie") {
    lodgeMesh(puck, side, kind === "bar" || yHit > GOAL_H * 0.55 ? "shelf" : "side", cap);
    return;
  }
  const spH = Math.hypot(puck.vx, puck.vz);
  const keep = cap * (fate === "back" ? 0.4 : fate === "out" ? 0.34 : 0.48);
  if (fate === "back") {
    puck.x = mouth - side * 0.22;
    puck.z = kind === "post" ? zHit : Math.max(-hw + 0.08, Math.min(hw - 0.08, zHit));
    puck.y = kind === "bar" ? GOAL_H + 0.02 : Math.max(PUCK_Y, Math.min(yHit, GOAL_H - 0.08));
    const ux = spH > 1e-4 ? -puck.vx / spH : -side;
    const uz = spH > 1e-4 ? -puck.vz / spH : 0;
    const vy = kind === "bar" ? Math.max(0, -Math.min(0, puck.vy)) * 0.08 : Math.max(0, puck.vy) * 0.04;
    writeRebound(puck, ux * keep, vy, uz * keep, cap);
    return;
  }
  if (fate === "out") {
    if (kind === "bar") {
      puck.x = mouth - side * 0.1;
      puck.y = GOAL_H + CROSSBAR_R + PUCK_R + 0.1;
      puck.z = Math.max(-hw + 0.08, Math.min(hw - 0.08, zHit));
      writeRebound(puck, -side * keep * 0.22, keep * 0.7, puck.vz * 0.2, cap);
      return;
    }
    const outward = Math.sign(zHit) || 1;
    puck.x = mouth - side * 0.16;
    puck.z = zHit + outward * 0.3;
    puck.y = Math.max(PUCK_Y, Math.min(yHit, GOAL_H - 0.1));
    writeRebound(
      puck,
      -side * keep * 0.28,
      Math.min(Math.abs(puck.vy) * 0.1, keep * 0.12),
      outward * keep * 0.92,
      cap,
    );
    return;
  }
  if (kind === "bar") {
    puck.x = mouth + side * 0.14;
    puck.y = GOAL_H - 0.12;
    puck.z = Math.max(-(hw - 0.16), Math.min(hw - 0.16, zHit));
    writeRebound(
      puck,
      side * Math.min(keep, Math.abs(puck.vx) * 0.5),
      -Math.min(keep * 0.22, cap * 0.12),
      puck.vz * 0.22,
      cap,
    );
    return;
  }
  const inward = -Math.sign(zHit) || 1;
  puck.x = mouth + side * 0.14;
  puck.z = zHit + inward * 0.2;
  puck.y = Math.max(PUCK_Y + 0.02, Math.min(yHit, GOAL_H - 0.12));
  writeRebound(
    puck,
    side * Math.min(cap, Math.abs(puck.vx) * 0.5),
    Math.min(Math.max(0, puck.vy), cap * 0.08),
    inward * Math.min(keep * 0.2, cap * 0.12),
    cap,
  );
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
        const k = soft ? 0.08 : 1.32;
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
        puck.vx -= 1.26 * vn * cage.nx;
        puck.vz -= 1.26 * vn * cage.nz;
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
  if (
    puck.x === x0 &&
    puck.y === y0 &&
    puck.z === z0 &&
    puck.vx === vx0 &&
    puck.vy === vy0 &&
    puck.vz === vz0
  ) {
    return;
  }
  drillNetTouch = true;
}

/**
 * Depth of the solid shell at this height. On the ice the boundary is the
 * bottom pipe, which sits on the y=0 ellipse, so a puck cannot slide under it.
 */
function shellAlongLimit(z: number, y: number): number {
  const hw = GOAL_W / 2;
  if (Math.abs(z) >= hw) return 0;
  const yClamped = Math.max(0, Math.min(y, GOAL_H));
  const ySurf = yClamped <= GOAL_PIPE_R * 2 + PUCK_R ? 0 : yClamped;
  return cageDepthAt(z, ySurf);
}

type CageZone = "in" | "front" | "behind" | "wide" | "over";

function cageZone(side: 1 | -1, x: number, y: number, z: number): CageZone {
  const along = (x - side * GOAL_LINE_X) * side;
  const hw = GOAL_W / 2;
  if (y > GOAL_H + 0.04) return along < -0.08 ? "front" : "over";
  // In front of the posts is still the open ice, even when the puck is wide of the net.
  if (Math.abs(z) >= hw || shellAlongLimit(z, y) <= 0.03) return along < 0.04 ? "front" : "wide";
  const limit = shellAlongLimit(z, y);
  if (along <= 0.035) return "front";
  return along < limit ? "in" : "behind";
}

/** True when the segment would pass through the twine or the bottom pipe. The mouth stays open. */
function shellCrossing(
  prev: CageZone,
  next: CageZone,
): boolean {
  if (prev === next) return false;
  const back = (z: CageZone) => z === "behind" || z === "wide";
  if (prev === "in" && back(next)) return true;
  if (next === "in" && back(prev)) return true;
  if ((prev === "behind" && next === "front") || (prev === "front" && next === "behind")) return true;
  if ((prev === "over" && next === "in") || (prev === "in" && next === "over")) return true;
  return false;
}

function shellOutward(along: number, z: number, y: number): { na: number; nz: number } {
  const hw = GOAL_W / 2;
  const yS = Math.max(0, Math.min(y, GOAL_H));
  const ySurf = yS <= GOAL_PIPE_R * 2 + PUCK_R ? 0 : yS;
  const depth = Math.max(0.25, cageDepthAt(0, ySurf));
  const zz = Math.max(-hw + 0.001, Math.min(hw - 0.001, z));
  const ga = along / (depth * depth);
  const gz = zz / (hw * hw);
  const gl = Math.hypot(ga, gz) || 1;
  return { na: ga / gl, nz: gz / gl };
}

function holdOffShell(
  puck: Puck,
  side: 1 | -1,
  fromInside: boolean,
  x: number,
  y: number,
  z: number,
  soft: boolean,
  roof: boolean,
): void {
  const mouth = side * GOAL_LINE_X;
  const hw = GOAL_W / 2;
  const along0 = (x - mouth) * side;
  if (roof) {
    puck.y = fromInside ? GOAL_H - 0.05 : Math.max(puck.y, GOAL_H + 0.06);
    const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
    const vy = fromInside ? Math.min(0, puck.vy) : Math.max(0, puck.vy);
    writeRebound(puck, puck.vx * 0.45, vy, puck.vz * 0.45, soft ? cap * 0.08 : cap * 0.35);
    return;
  }
  const n = shellOutward(along0, z, y);
  const push = fromInside ? -0.07 : 0.1;
  let along = along0 + n.na * push;
  let zz = z + n.nz * push;
  zz = Math.max(-hw - 0.04, Math.min(hw + 0.04, zz));
  const limit = shellAlongLimit(Math.max(-hw + 0.01, Math.min(hw - 0.01, zz)), y);
  if (fromInside) {
    along = Math.max(0.05, along);
    if (limit > 0.05 && along > limit - 0.03) along = Math.max(0.05, limit - 0.07);
    zz = Math.max(-(hw - 0.03), Math.min(hw - 0.03, zz));
  } else if (limit > 0.05 && along < limit + 0.04) {
    along = limit + 0.1;
  }
  puck.x = mouth + side * along;
  puck.z = zz;
  if (y > PUCK_Y && y < GOAL_H) puck.y = y;
  const nx = side * n.na;
  const nz = n.nz;
  const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
  const vn = puck.vx * nx + puck.vz * nz;
  let vx = puck.vx;
  let vz = puck.vz;
  if (fromInside) {
    if (vn > 0) {
      vx -= 1.22 * vn * nx;
      vz -= 1.22 * vn * nz;
    }
    const absorb = meshAbsorbShot || (!soft && shotAtThisNet(side));
    writeRebound(puck, vx, Math.min(puck.vy, 0) * 0.3, vz, soft ? cap * 0.08 : absorb ? cap * 0.25 : cap * 0.45);
  } else if (vn < 0) {
    vx -= 1.22 * vn * nx;
    vz -= 1.22 * vn * nz;
    writeRebound(puck, vx, puck.vy * 0.25, vz, soft ? cap * 0.08 : cap * 0.4);
  } else {
    writeRebound(puck, vx, puck.vy * 0.25, vz, soft ? cap * 0.08 : cap * 0.4);
  }
}

/** Stop a segment that changes sides of the twine. Sampling catches lateral slips the old depth test missed. */
function sealCageShell(
  puck: Puck,
  side: 1 | -1,
  prevX: number,
  prevY: number,
  prevZ: number,
  soft: boolean,
): boolean {
  const dist = Math.hypot(puck.x - prevX, puck.y - prevY, puck.z - prevZ);
  const steps = Math.max(1, Math.min(36, Math.ceil(dist / 0.035)));
  let prev = cageZone(side, prevX, prevY, prevZ);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = prevX + (puck.x - prevX) * t;
    const y = prevY + (puck.y - prevY) * t;
    const z = prevZ + (puck.z - prevZ) * t;
    const next = cageZone(side, x, y, z);
    if (shellCrossing(prev, next)) {
      const fromInside = prev === "in" || prev === "front";
      holdOffShell(puck, side, fromInside, x, y, z, soft, prev === "over" || next === "over");
      return true;
    }
    prev = next;
  }
  return false;
}

function bouncePuckCage(puck: Puck, prevX: number, prevZ: number, prevY: number): void {
  const hw = GOAL_W / 2;
  const pr = 0.11;
  const soft = drillScoreSoft(puck);
  for (const side of [1, -1] as const) {
    if (world.whistle === "goal") {
      const scoring: 1 | -1 =
        world.goalSide === "home" ? world.homeAttack : (-world.homeAttack as 1 | -1);
      if (side !== scoring) continue;
    }
    const mouth = side * GOAL_LINE_X;
    if (Math.abs(puck.x - mouth) > 4.2 && Math.abs(prevX - mouth) > 4.2) continue;
    const iceDepth = Math.max(0.08, cageDepthAt(puck.z, 0));
    const along = (puck.x - mouth) * side;
    const prevAlong = (prevX - mouth) * side;
    const inFoot = along > -0.1 && along < iceDepth + 0.14 && Math.abs(puck.z) < hw + 0.12;
    let shellSealed = false;

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
      if (goalieBankLive) {
        const into = world.goalieShot === "score";
        const inward = -Math.sign(zPost || 1);
        const sp = Math.hypot(puck.vx, puck.vz) || 8;
        if (into) {
          puck.x = mouth - side * 0.06;
          puck.z = zPost + inward * (POST_HIT_R + 0.18);
          puck.y = Math.max(PUCK_Y, Math.min(puck.y, GOAL_H - 0.08));
          puck.vx = side * Math.abs(sp);
          puck.vz = inward * Math.min(2.2, sp * 0.12);
          return;
        }
        puck.x = mouth - side * 0.16;
        puck.z = zPost - inward * (POST_HIT_R + 0.4);
        puck.y = Math.max(PUCK_Y, Math.min(puck.y, 0.45));
        puck.vx = side * Math.abs(sp) * 0.25;
        puck.vz = -inward * Math.abs(sp) * 0.55;
        world.goalieShot = null;
        goalieBankLive = false;
        return;
      }
      if (world.goalieShot === "out" && goalieShotSide(side)) {
        kickGoalieMiss(puck, side, zPost, false);
        return;
      }
      const goingIn = (puck.x - prevX) * side > 0 && puck.vx * side > 0.2;
      const topCorner = yHit > GOAL_H * 0.62 && yHit < GOAL_H + 0.12;
      if ((endpoint || sweptHit) && topCorner && !soft) {
        const cap0 = Math.hypot(puck.vx, puck.vy, puck.vz);
        const yUse = Math.max(PUCK_Y, Math.min(yHit, GOAL_H - 0.02));
        const sharpFar = shotSharp > 0.35 && ironPostSide(zPost) === "far";
        if (!steppingGhost && shotHere && goingIn && sharpFar) {
          if (!tryDefendPost(puck, side, zPost, yUse)) applyShotIron(puck, side, "post", zPost, yUse);
        } else {
          dampTopCorner(puck, side, zPost, cap0);
          puck.x = mouth - side * 0.1;
          puck.y = yUse;
          puck.z = zPost - Math.sign(zPost || 1) * 0.08;
        }
        return;
      }
      const farPostEarly =
        world.lastShotCornerSide !== 0 && Math.sign(zPost) !== Math.sign(world.lastShotCornerSide);
      if (
        !steppingGhost &&
        sweptHit &&
        prevDist > pr &&
        goingIn &&
        yHit < GOAL_H + 0.02 &&
        !(cornerSnipeLive() && farPostEarly) &&
        shotHere
      ) {
        if (!tryDefendPost(puck, side, zPost, Math.max(PUCK_Y, Math.min(yHit, GOAL_H - 0.08)))) {
          applyShotIron(puck, side, "post", zPost, Math.max(PUCK_Y, Math.min(yHit, GOAL_H - 0.08)));
        }
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
      const snipeNear = cornerSnipeLive() && !farPost && nearPostOnlyOut();
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
          const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
          writeRebound(
            puck,
            side * Math.min(cap, Math.abs(puck.vx) * 0.72),
            puck.vy * 0.4,
            inward * Math.min(cap * 0.2, Math.abs(puck.vz) * 0.25),
            cap,
          );
        }
      } else {
        puck.x = mouth + nx * pr;
        puck.z = zPost + nz * pr;
        const b = bounce(puck.vx, puck.vz, -nx, -nz, soft ? 0.08 : 0.32);
        puck.vx = b.vx;
        puck.vz = b.vz;
      }
    }

    if (sealCageShell(puck, side, prevX, prevY, prevZ, soft)) shellSealed = true;

    for (const zWall of [hw, -hw] as const) {
      if (shellSealed) break;
      const xIn = inFoot || (prevAlong > -0.1 && prevAlong < iceDepth + 0.14);
      if (!xIn) continue;
      if (puck.y > GOAL_H + 0.08 && prevY > GOAL_H + 0.08) continue;
      if ((prevZ - zWall) * (puck.z - zWall) > 0 || prevZ === puck.z) continue;
      const fromOut = Math.abs(prevZ) > hw;
      const nz = Math.sign(zWall) || 1;
      const nowInMouth = along > 0 && along < iceDepth && Math.abs(puck.z) <= hw && puck.y < GOAL_H;
      const goingIn = Math.sign(puck.vx) === side;
      const farSide = world.lastShotCornerSide !== 0 && puck.z * world.lastShotCornerSide <= 0.12;
      if (
        fromOut &&
        world.goalieShot === "out" &&
        goalieShotSide(side) &&
        (nowInMouth || (cornerSnipeLive() && goingIn && puck.y < GOAL_H && farSide))
      ) {
        kickGoalieMiss(puck, side, zWall, false);
        return;
      } else if (
        fromOut &&
        (nowInMouth || (cornerSnipeLive() && goingIn && puck.y < GOAL_H && farSide))
      ) {
        puck.z = zWall - nz * 0.1;
        if (!soft && puck.vx * side < 0) {
          const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
          puck.vx = side * Math.min(cap * 0.35, Math.abs(puck.vx));
        }
      } else if (fromOut) {
        puck.z = zWall + nz * 0.12;
        const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
        const into = puck.vz * -nz;
        const vz = into > 0 ? puck.vz - 1.22 * into * -nz : puck.vz;
        if (meshAbsorbShot) writeRebound(puck, puck.vx * 0.35, puck.vy * 0.2, vz, cap * 0.25);
        else {
          const b = bounce(puck.vx, vz, 0, -nz, soft ? 0.08 : 0.3);
          puck.vx = b.vx;
          puck.vz = b.vz;
        }
      } else {
        puck.z = zWall - nz * 0.1;
        const b = bounce(puck.vx, puck.vz, 0, nz, soft ? 0.08 : 0.26);
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
          if (!tryDefendBar(puck, side, barZ)) applyShotIron(puck, side, "bar", barZ, GOAL_H);
          return;
        }
        noteDrillPipe();
        if (!soft && Math.abs(Math.abs(barZ) - hw) < 0.22) {
          const cap0 = Math.hypot(puck.vx, puck.vy, puck.vz);
          dampTopCorner(puck, side, barZ, cap0);
          puck.x = mouth - side * 0.08;
          puck.y = Math.min(GOAL_H - 0.03, Math.max(PUCK_Y, puck.y));
          puck.z = Math.max(-hw + 0.05, Math.min(hw - 0.05, barZ));
          return;
        }
        if (soft) {
          puck.vy = Math.min(0.4, Math.abs(puck.vy) * 0.1);
          puck.vx *= 0.15;
          puck.vz *= 0.5;
        } else if (barHit.ny < 0.08 && goingIn) {
          const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
          puck.x = mouth + side * 0.04;
          puck.y = Math.min(barHit.y, GOAL_H - barRad - 0.012);
          puck.z = barZ;
          const vy = puck.vy > 0 ? -Math.min(puck.vy, cap) * 0.2 : puck.vy;
          writeRebound(puck, puck.vx, vy, puck.vz, cap);
        } else {
          const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
          puck.x = mouth + side * 0.06;
          puck.y = GOAL_H + CROSSBAR_R + 0.1;
          puck.z = barZ;
          const up = Math.min(cap * 0.28, Math.abs(puck.vy) * 0.25 + cap * 0.08);
          writeRebound(puck, side * Math.min(cap * 0.35, Math.abs(puck.vx) * 0.4), up, puck.vz * 0.7, cap);
        }
      } else if (
        !soft &&
        along > 0.02 &&
        along < Math.max(0.08, cageDepthAt(puck.z, GOAL_H)) + 0.05 &&
        Math.abs(puck.z) < hw &&
        puck.y > GOAL_H + 0.02 &&
        Math.hypot(puck.vx, puck.vz, puck.vy) < 1.35
      ) {
        if (puck.vy > 0) puck.vy *= -0.15;
        puck.vx *= 0.55;
        puck.vz *= 0.55;
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
            const yHit = Math.max(PUCK_Y, Math.min(yAt, GOAL_H - 0.1));
            if (!tryDefendPost(puck, side, zPost, yHit))
              applyShotIron(puck, side, "post", zPost, yHit);
            return;
          }
        } else if (Math.abs(zAt) <= hw + 0.08 && yAt >= GOAL_H - 0.4 && yAt <= GOAL_H + 0.45) {
          const zBar = Math.max(-hw + 0.2, Math.min(hw - 0.2, zAt));
          if (!tryDefendBar(puck, side, zBar)) applyShotIron(puck, side, "bar", zBar, GOAL_H);
          return;
        }
        shotIron = null;
      }
    }

    if (world.whistle === "goal" && puck.y < GOAL_H + 0.02) {
      const cameIn = cageZone(side, prevX, prevY, prevZ) === "in";
      const now = cageZone(side, puck.x, puck.y, puck.z);
      if (cameIn && (now === "behind" || now === "wide")) {
        const zKeep = Math.max(-(hw - 0.08), Math.min(hw - 0.08, puck.z));
        const lim = shellAlongLimit(zKeep, Math.min(puck.y, GOAL_H));
        puck.z = zKeep;
        puck.x = mouth + side * Math.max(0.08, lim - 0.08);
        const cap = Math.hypot(puck.vx, puck.vy, puck.vz);
        if (puck.vx * side > 0) writeRebound(puck, -side * cap * 0.22, puck.vy * 0.2, puck.vz * 0.35, cap * 0.25);
      }
    }
  }
  if (soft) clampDrillScoreSpeed(puck);
}

type CrowdFaceZone = "defendEnd" | "attackEnd" | "defendNz" | "attackNz" | "center";

/** Last player touch, then the last spot the puck was on the ice. Not the crowd exit. */
let crowdTouch: { x: number; z: number } | null = null;
let lastOnIce: { x: number; z: number } | null = null;

function markCrowdTouch(x: number, z: number): void {
  crowdTouch = { x, z };
}

function rememberOnIce(): void {
  const puck = world.puck;
  if (resolveRink(puck.x, puck.z, 0.02).hit || puck.y > 1.2) return;
  lastOnIce = { x: puck.x, z: puck.z };
  if (puck.owner === null) return;
  const holder = world.skaters[puck.owner];
  if (holder) crowdTouch = { x: holder.x, z: holder.z };
}

function crowdFaceZone(x: number): CrowdFaceZone {
  const attack = attackDir("home") >= 0 ? 1 : -1;
  const end = zoneAtX(x);
  if (end !== 0) return end === attack ? "attackEnd" : "defendEnd";
  const along = x * attack;
  const mid = FACEOFF_NZ_X * 0.5;
  if (along > mid) return "attackNz";
  if (along < -mid) return "defendNz";
  return "center";
}

function crowdZoneDots(zone: CrowdFaceZone): [number, number][] {
  const attack = attackDir("home") >= 0 ? 1 : -1;
  const defend = -attack;
  if (zone === "center") return [[0, 0]];
  const x =
    zone === "attackEnd"
      ? attack * FACEOFF_EZ_X
      : zone === "defendEnd"
        ? defend * FACEOFF_EZ_X
        : zone === "attackNz"
          ? attack * FACEOFF_NZ_X
          : defend * FACEOFF_NZ_X;
  return [
    [x, FACEOFF_SPOT_Z],
    [x, -FACEOFF_SPOT_Z],
  ];
}

function chooseCrowdFaceoff(): void {
  const at = crowdTouch ?? lastOnIce ?? { x: 0, z: 0 };
  const dots = crowdZoneDots(crowdFaceZone(at.x));
  let bestX = dots[0][0];
  let bestZ = dots[0][1];
  let bestD = Infinity;
  for (const [x, z] of dots) {
    const d = (x - at.x) * (x - at.x) + (z - at.z) * (z - at.z);
    if (d < bestD) {
      bestD = d;
      bestX = x;
      bestZ = z;
    }
  }
  world.faceX = bestX;
  world.faceZ = bestZ;
}

function crowdWhistleBlocked(): boolean {
  const mode = useGame.getState().clockMode;
  if (mode === "drill" || mode === "practice") return true;
  if (world.stoppage || world.lineBrawl || world.periodOver) return true;
  if (world.faceoffPhase !== "live") return true;
  const w = world.whistle;
  return w === "goal" || w === "cover" || w === "offside" || w === "brawl";
}

/** Elastic bounce. Tangential speed stays; only the inward normal component flips. */
function reflectCrowd(
  vx: number,
  vy: number,
  vz: number,
  nx: number,
  ny: number,
  nz: number,
): { vx: number; vy: number; vz: number } {
  const vn = vx * nx + vy * ny + vz * nz;
  if (vn >= 0) return { vx, vy, vz };
  const k = 2 * vn;
  return { vx: vx - k * nx, vy: vy - k * ny, vz: vz - k * nz };
}

const CROWD_SKIN = 0.008;

/**
 * The segment from (ax,ay,az) to the puck is already integrated.
 * Bounce off crowd solids and keep traveling for the leftover time.
 * Does not write the puck onto the contact and stop.
 */
function deflectCrowdTravel(dt: number, ax: number, ay: number, az: number): void {
  const puck = world.puck;
  let remain = dt;
  let sx = ax;
  let sy = ay;
  let sz = az;
  let ex = puck.x;
  let ey = puck.y;
  let ez = puck.z;
  for (let n = 0; n < 4; n++) {
    if (remain <= 1e-5) {
      puck.x = sx;
      puck.y = sy;
      puck.z = sz;
      return;
    }
    const hit = sweepCrowd(sx, sy, sz, ex, ey, ez, CROWD_PUCK_R);
    if (!hit) {
      puck.x = ex;
      puck.y = ey;
      puck.z = ez;
      return;
    }
    const bounced = reflectCrowd(puck.vx, puck.vy, puck.vz, hit.nx, hit.ny, hit.nz);
    puck.vx = bounced.vx;
    puck.vy = bounced.vy;
    puck.vz = bounced.vz;
    const push = hit.push + CROWD_SKIN;
    sx = hit.x + hit.nx * push;
    sy = hit.y + hit.ny * push;
    sz = hit.z + hit.nz * push;
    const frac = hit.t <= 1e-4 ? 1 : Math.max(0, 1 - hit.t);
    remain *= frac;
    ex = sx + puck.vx * remain;
    ey = sy + puck.vy * remain;
    ez = sz + puck.vz * remain;
  }
  puck.x = ex;
  puck.y = ey;
  puck.z = ez;
}

/** Gravity, ice bounce, and crowd-solid bounces. No stoppage speed cut. */
function stepCrowdPuck(dt: number): void {
  const puck = world.puck;
  const prevX = puck.x;
  const prevY = puck.y;
  const prevZ = puck.z;
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;
  puck.z += puck.vz * dt;
  deflectCrowdTravel(dt, prevX, prevY, prevZ);
  puck.vy -= 12 * dt;
  if (puck.y <= PUCK_Y) {
    puck.y = PUCK_Y;
    if (puck.vy < 0) puck.vy *= -0.28;
    if (Math.abs(puck.vy) < 0.4) puck.vy = 0;
  }
}

/** On the ground, and done bouncing. The ice bounce zeros vy once it is under 0.4. */
function crowdPuckLanded(y: number, vy: number): boolean {
  return y <= PUCK_Y && Math.abs(vy) < 0.4;
}

function maybeCrowdStoppage(prevX: number, prevY: number, prevZ: number, dt: number): boolean {
  const puck = world.puck;
  if (puck.owner !== null) return false;
  // Practice blocks the crowd whistle, so a puck over the glass used to stay in the stands.
  // The same entry now puts a new puck on the user's stick this frame. No faceoff, no wait.
  // A puck still on the ice is not checked. Clearing the wall or leaving the rink is.
  if (useGame.getState().clockMode === "practice") {
    const outsideIce = resolveRink(puck.x, puck.z, 0.02).hit;
    const inSeats = outsideStandFootprint(puck.x, puck.z);
    if (!outsideIce && !inSeats && !overWall.has(puck)) return false;
    const touched = sweepCrowd(prevX, prevY, prevZ, puck.x, puck.y, puck.z, CROWD_PUCK_R);
    const over = overWall.has(puck) && outsideIce;
    if (!touched && !over && !inSeats) return false;
    giveUserPuck();
    overWall.delete(puck);
    return true;
  }
  if (crowdWhistleBlocked()) return false;
  const hit = sweepCrowd(prevX, prevY, prevZ, puck.x, puck.y, puck.z, CROWD_PUCK_R);
  if (hit) {
    chooseCrowdFaceoff();
    startStoppage("crowd");
    deflectCrowdTravel(dt, prevX, prevY, prevZ);
    return true;
  }
  if (!outsideStandFootprint(puck.x, puck.z) || !crowdPuckLanded(puck.y, puck.vy)) return false;
  chooseCrowdFaceoff();
  startStoppage("crowd");
  return true;
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

function startStoppage(kind: "goal" | "cover" | "offside" | "crowd", net?: 1 | -1): void {
  // The period-end skate keeps moving. A whistle here would reset the period.
  if (periodEndLive()) return;
  // A shootout never whistles a cover. After the win, no new stoppage either.
  if (world.shootout) {
    if (world.shootout.phase === "done" || kind !== "goal") return;
  }
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
  if (kind === "offside") offsideLook = { x: world.puck.x, z: world.puck.z };
  else offsideLook = null;
  world.puck.owner = keepCarrier ? holderId : null;
  if (keepCarrier) world.coverT = 0;
  if (kind === "offside") {
    // Keep the puck on its current path for the replay tail. The release runs when that window ends.
    world.puck.owner = holderId;
    offsideReleasePending = true;
  } else if (kind === "goal") {
    resetPassChain();
    world.goalPuckT = 0.62;
  } else if (!keepCarrier && kind !== "crowd") {
    world.puck.vx *= 0.15;
    world.puck.vz *= 0.15;
  }
  poseEveryRef(kind === "goal" ? "goal" : "cover");
  world.reboundN = 0;
  world.reboundSoft = false;
  const ui = useGame.getState();
  ui.setWhistle(world.whistle);
  ui.setHasPuck(world.puck.owner === world.userId);
  if (kind === "goal") {
    const homeScored = (net ?? (world.puck.x > 0 ? 1 : -1)) === world.homeAttack;
    const targetGoal = ui.clockMode === "scrimmage";
    const liveSo = shootoutLive();
    if (!targetGoal && !liveSo) {
      if (homeScored) ui.setHomeScore(ui.homeScore + 1);
      else ui.setAwayScore(ui.awayScore + 1);
    }
    world.goalSide = homeScored ? "home" : "away";
    world.goalTicker = liveSo ? SHOOTOUT_TRY_CHEER_S : 6.5;
    ui.setGoalSide(world.goalSide);
    if (!targetGoal && !liveSo && (ui.powerPlay || ui.chaos)) {
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
    for (const r of refsOnIce()) {
      r.yaw = Math.atan2(-(netX - r.x), -(0 - r.z));
    }
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
    goalRageHold = homeScored ? "away" : "home";
    if (scorer) {
      const anchor = scorer.kind === "goalie" ? skaterCheerLead(scorer.side) : scorer;
      assignGoalCheer(scorer.side, anchor?.id ?? scorer.id);
    }
    beginJumboReplay();
    const otMode = ui.clockMode === "roller" || ui.clockMode === "game";
    const otFormat = ui.clockMode === "roller" ? ui.rollerOtFormat : ui.otFormat;
    const pastRegulation =
      (ui.clockMode === "game" && world.period > GAME_PERIODS) ||
      (ui.clockMode === "roller" && world.period > ROLLER_PERIODS);
    overtimeWinner =
      !targetGoal &&
      otMode &&
      pastRegulation &&
      !world.shootout &&
      (otFormat === "playoff" || otFormat === "reg");
  } else if (kind === "cover") {
    if (coverer?.kind === "goalie") coverer.coverPose = 1;
    chooseCoverFaceoff(coverer);
  }
}

/** Low puck on the goalie ice blade. Pads and the glove stay on the old rebound. */
const STICK_LOW_Y = 0.45;

function goalieStickLow(g: Skater, x: number, y: number, z: number): boolean {
  if (y > STICK_LOW_Y || y < -0.05) return false;
  const blade = stickBlade(g);
  return Math.hypot(x - blade.x, z - blade.z) < 0.24;
}

/** A shot, not a pass, on that blade. */
function goalieStickShot(g: Skater, x: number, y: number, z: number): boolean {
  if (world.lastPass > world.lastShoot) return false;
  if (world.lastShooter === null || world.lastShooter === g.id) return false;
  if (world.time - world.lastShoot > 2.6) return false;
  return goalieStickLow(g, x, y, z);
}

/** A stick kick back into this net. Saves stand down until it crosses. */
let stickBackUntil = -1;
let stickBackSide: 1 | -1 | 0 = 0;

function stickBackLive(side: 1 | -1): boolean {
  return stickBackSide === side && world.time < stickBackUntil;
}

function clearsPosts(end: 1 | -1, x: number, z: number, vx: number, vz: number): boolean {
  const mouth = end * GOAL_LINE_X;
  let px = x;
  let pz = z;
  let pvx = vx;
  let pvz = vz;
  for (let i = 0; i < 180; i++) {
    const damp = Math.exp(-PUCK_DRAG / 60);
    pvx *= damp;
    pvz *= damp;
    const nx = px + pvx / 60;
    const nz = pz + pvz / 60;
    if ((px - mouth) * end <= 0 && (nx - mouth) * end >= 0) {
      const span = (nx - px) * end || 1;
      const u = ((mouth - px) * end) / span;
      return Math.abs(pz + (nz - pz) * u) > GOAL_W / 2 + 0.12;
    }
    px = nx;
    pz = nz;
    if (Math.hypot(pvx, pvz) < 0.8) break;
  }
  return false;
}

/** Backward and already outside the posts at the goal line, so it misses the cage. */
function wideStickBack(end: 1 | -1, x: number, z: number): { vx: number; vz: number } | null {
  const mouth = end * GOAL_LINE_X;
  const sign = Math.sign(z) || 1;
  const along = Math.max(0.3, (mouth - x) * end);
  for (let extra = 0.4; extra <= 3.6; extra += 0.3) {
    const dz = sign * (GOAL_W / 2 + extra) - z;
    let vxMag = 10;
    let vz = (dz / along) * vxMag;
    if (Math.abs(vz) > 14) {
      vz = Math.sign(dz || 1) * 14;
      vxMag = (14 * along) / Math.max(0.25, Math.abs(dz));
    }
    const vx = end * vxMag;
    if (clearsPosts(end, x, z, vx, vz)) return { vx, vz };
  }
  return null;
}

/** Arrival height on the first board. Same drag and gravity as the live puck. */
function stickWallVy(
  x: number,
  z: number,
  vx: number,
  vz: number,
  band: "board" | "glass" | "over",
): number | null {
  let lo = 0.3;
  let hi = 16;
  let best: number | null = null;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) * 0.5;
    const hit = boardArrival(x, z, vx, vz, mid);
    if (!hit) {
      hi = mid;
      continue;
    }
    if (band === "board") {
      if (hit.y > BOARD_H - 0.05) hi = mid;
      else {
        best = mid;
        lo = mid;
      }
    } else if (band === "glass") {
      if (hit.y >= hit.limit - 0.15) hi = mid;
      else if (hit.y <= BOARD_H + 0.1) lo = mid;
      else {
        best = mid;
        break;
      }
    } else if (hit.y >= hit.limit + 0.25) {
      best = mid;
      hi = mid;
    } else lo = mid;
  }
  if (best === null) return null;
  const hit = boardArrival(x, z, vx, vz, best);
  if (!hit) return null;
  if (band === "board" && (hit.y < 0.22 || hit.y > BOARD_H - 0.02)) return null;
  if (band === "glass" && (hit.y < BOARD_H + 0.08 || hit.y > hit.limit - 0.08)) return null;
  if (band === "over" && hit.y < hit.limit + 0.15) return null;
  return best;
}

export type LowStickPlan = {
  vx: number;
  vy: number;
  vz: number;
  y: number;
  x: number;
  net: boolean;
};

/**
 * Low stick rebound. Half stay on the ice in front of the goal line.
 * Half go back high: end boards, end glass, over the glass, or in the net.
 */
export function planLowStickRebound(
  end: 1 | -1,
  x: number,
  y: number,
  z: number,
  modeRoll: number,
  kindRoll: number,
): LowStickPlan {
  const mouth = end * GOAL_LINE_X;
  const out = -end;
  const low = (): LowStickPlan => {
    const u = Math.max(0, Math.min(1, modeRoll / 0.5));
    const ahead = (mouth - x) * end;
    return {
      vx: out * (2.6 + u * 3.4),
      vy: 0.12 + u * 0.7,
      vz: (u - 0.5) * 2.6,
      y: PUCK_Y + 0.02,
      x: ahead < 0.35 ? mouth - end * 0.5 : x,
      net: false,
    };
  };
  if (modeRoll < 0.5) return low();
  if (kindRoll < 0.25) {
    const hw = GOAL_W / 2 - 0.26;
    const tz = Math.max(-hw, Math.min(hw, z * 0.2));
    const dx = mouth - x;
    const dz = tz - z;
    const dist = Math.hypot(dx, dz) || 1;
    const spd = 8;
    let vy = 4.2 + kindRoll * 6;
    const along = Math.max(0.2, dx * end);
    const t = along / spd;
    const at = Math.max(y, PUCK_Y + 0.06) + vy * t - 6 * t * t;
    if (at > GOAL_H - 0.22) vy = Math.max(1.2, (GOAL_H - 0.35 - PUCK_Y) / Math.max(0.08, t));
    return {
      vx: (dx / dist) * spd,
      vy,
      vz: (dz / dist) * spd,
      y: Math.max(y, PUCK_Y + 0.06),
      x,
      net: true,
    };
  }
  const wide = wideStickBack(end, x, z);
  const band = kindRoll < 0.5 ? "board" : kindRoll < 0.75 ? "glass" : "over";
  if (!wide) return low();
  const vy = stickWallVy(x, z, wide.vx, wide.vz, band);
  if (vy === null) return low();
  return {
    vx: wide.vx,
    vy,
    vz: wide.vz,
    y: Math.max(PUCK_Y + 0.04, Math.min(y, 0.35)),
    x,
    net: false,
  };
}

/** Outside the goalie's defending blue line. Same depth as a shot from outside the zone. */
function blockerFromLong(g: Skater): boolean {
  const end = (defendDir(g.side) >= 0 ? 1 : -1) as 1 | -1;
  const depth = GOAL_LINE_X - BLUE_X + 0.4;
  if (shotFromLine < 90 && shotAttack === end) return shotFromLine > depth;
  return world.lastShotDist > depth;
}

function onBlockerSave(g: Skater, puckY: number, puckZ: number): boolean {
  const home = g.side === "home";
  const scale = home ? 1.22 : 0.88;
  const blockerDir = attackDir(g.side) > 0 ? 1 : -1;
  const dz = puckZ - g.z;
  const blockerZ = blockerDir * 0.42 * scale;
  const pad =
    Math.abs(dz - blockerZ) <= (home ? 0.15 : 0.1) &&
    puckY > 0.2 &&
    puckY < (home ? 0.7 : 0.58);
  if (pad) return true;
  const toward = dz * blockerDir;
  return toward > 0 && goalieRaisedHandCovers(puckY, toward);
}

function blockerShotSave(g: Skater, y: number, z: number): boolean {
  if (world.lastPass > world.lastShoot) return false;
  if (world.lastShooter === null || world.lastShooter === g.id) return false;
  if (world.time - world.lastShoot > 2.6) return false;
  return onBlockerSave(g, y, z);
}

function blockerMate(g: Skater): Skater | null {
  const out = attackDir(g.side);
  let best: Skater | null = null;
  let bestD = 18;
  for (const s of world.skaters) {
    if (s.side !== g.side || s.kind === "goalie") continue;
    const along = (s.x - g.x) * out;
    if (along < 0.6 || along > 16) continue;
    const d = Math.hypot(s.x - g.x, s.z - g.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function kickAway(
  end: 1 | -1,
  x: number,
  z: number,
  tx: number,
  tz: number,
  speed: number,
): { vx: number; vz: number } {
  let dx = x - tx;
  let dz = z - tz;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  if (dx * end > 0.2) dx = -end * Math.abs(dx);
  const n = Math.hypot(dx, dz) || 1;
  return { vx: (dx / n) * speed, vz: (dz / n) * speed };
}

function blockerGlass(
  end: 1 | -1,
  x: number,
  z: number,
  where: "end" | "side" | "corner",
  over: boolean,
): { vx: number; vy: number; vz: number } | null {
  const sign = Math.sign(z) || 1;
  let vx = 0;
  let vz = 0;
  if (where === "end") {
    const wide = wideStickBack(end, x, z);
    if (!wide) return null;
    vx = wide.vx;
    vz = wide.vz;
  } else if (where === "side") {
    const targetZ = sign * (RINK_W / 2 - 0.35);
    vz = Math.sign(targetZ - z || sign) * 10;
    vx = -end * 2.4;
  } else {
    const tx = end * (RINK_L / 2 - CORNER_R * 0.45);
    const tz = sign * (RINK_W / 2 - CORNER_R * 0.4);
    const dx = tx - x;
    const dz = tz - z;
    const dist = Math.hypot(dx, dz) || 1;
    vx = (dx / dist) * 9;
    vz = (dz / dist) * 9;
    if (vx * end > 0 && !clearsPosts(end, x, z, vx, vz)) {
      const wide = wideStickBack(end, x, z);
      if (!wide) return null;
      vx = wide.vx;
      vz = wide.vz + sign * 3.5;
    }
  }
  const vy = stickWallVy(x, z, vx, vz, over ? "over" : "glass");
  if (vy === null) return null;
  return { vx, vy, vz };
}

export type BlockerReboundPlan = {
  vx: number;
  vy: number;
  vz: number;
  y: number;
  controlled: boolean;
};

/**
 * Blocker rebound. Outside the defending blue line the goalie places it.
 * From the offensive zone it comes off wild.
 */
export function planBlockerRebound(
  g: Skater,
  x: number,
  y: number,
  z: number,
  roll: number,
): BlockerReboundPlan {
  const end = (defendDir(g.side) >= 0 ? 1 : -1) as 1 | -1;
  const mate = blockerMate(g);
  const foe = nearestFoe(g).foe;
  const y0 = Math.max(PUCK_Y + 0.04, Math.min(y, 0.55));
  if (blockerFromLong(g)) {
    if (roll < 0.62 && mate) {
      const dx = mate.x - x;
      const dz = mate.z - z;
      const dist = Math.hypot(dx, dz) || 1;
      const spd = Math.max(4.2, Math.min(10, dist * 1.05));
      return {
        vx: (dx / dist) * spd,
        vy: 0.22 + roll * 0.5,
        vz: (dz / dist) * spd,
        y: PUCK_Y + 0.03,
        controlled: true,
      };
    }
    const speed = 5.2 + (roll - 0.62) * 4;
    if (foe) {
      const kick = kickAway(end, x, z, foe.x, foe.z, Math.max(4.5, speed));
      return { vx: kick.vx, vy: 0.28, vz: kick.vz, y: PUCK_Y + 0.03, controlled: true };
    }
    const out = attackDir(g.side);
    return { vx: out * 6, vy: 0.3, vz: (roll - 0.5) * 2, y: PUCK_Y + 0.03, controlled: true };
  }
  const glass =
    roll < 0.18
      ? blockerGlass(end, x, z, "end", false)
      : roll < 0.36
        ? blockerGlass(end, x, z, "side", false)
        : roll < 0.52
          ? blockerGlass(end, x, z, "corner", false)
          : roll < 0.7
            ? blockerGlass(end, x, z, roll < 0.6 ? "end" : "side", true)
            : null;
  if (glass) {
    return { vx: glass.vx, vy: glass.vy, vz: glass.vz, y: y0, controlled: false };
  }
  if (roll < 0.85 && mate) {
    const kick = kickAway(end, x, z, mate.x, mate.z, 8);
    return { vx: kick.vx, vy: 1.6 + roll, vz: kick.vz, y: y0, controlled: false };
  }
  if (foe) {
    const dx = foe.x - x;
    const dz = foe.z - z;
    const dist = Math.hypot(dx, dz) || 1;
    const spd = 7.5;
    return {
      vx: (dx / dist) * spd,
      vy: 1.5 + (roll - 0.85) * 4,
      vz: (dz / dist) * spd,
      y: y0,
      controlled: false,
    };
  }
  const spill = blockerGlass(end, x, z, "side", true);
  if (spill) return { vx: spill.vx, vy: spill.vy, vz: spill.vz, y: y0, controlled: false };
  return { vx: attackDir(g.side) * -3, vy: 2.4, vz: 6, y: y0, controlled: false };
}

function onGloveSave(g: Skater, puckY: number, puckZ: number): boolean {
  const home = g.side === "home";
  const scale = home ? 1.22 : 0.88;
  const catcherDir = attackDir(g.side) > 0 ? -1 : 1;
  const gloveZ = catcherDir * 0.5 * scale;
  const gloveR = home ? 0.2 : 0.12;
  return Math.abs(puckZ - g.z - gloveZ) <= gloveR && puckY > 0.54 && puckY < (home ? 1.16 : 0.98);
}

function applyGoalieSave(
  g: Skater,
  puck: Puck,
  reboundChance: number,
  _outX: number,
  glove = false,
  stickLow = false,
  blocker = false,
): void {
  markShotDeflected();
  const prevX = puck.x;
  const prevZ = puck.z;
  world.goalieSaveT = world.time;
  world.goalieShot = null;
  g.follow = 0;
  g.windup = 0;
  g.poke = 0.34;
  if (g.side === "home") reboundChance = Math.max(reboundChance, userIdle() ? 0.86 : 0.64);
  if (Math.random() < reboundChance) {
    noteDeflect("rebound", g);
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
    if (stickLow) {
      const end = (defendDir(g.side) >= 0 ? 1 : -1) as 1 | -1;
      const plan = planLowStickRebound(end, puck.x, puck.y, puck.z, Math.random(), Math.random());
      world.reboundSoft = false;
      g.coverPose = Math.max(g.coverPose, 0.32);
      g.stun = Math.max(g.stun, 0.18);
      puck.x = plan.x;
      puck.y = plan.y;
      puck.vx = plan.vx;
      puck.vy = plan.vy;
      puck.vz = plan.vz;
      if (plan.net) {
        stickBackSide = end;
        stickBackUntil = world.time + 0.75;
      }
    } else if (blocker) {
      const plan = planBlockerRebound(g, puck.x, puck.y, puck.z, Math.random());
      world.reboundSoft = false;
      g.coverPose = Math.max(g.coverPose, plan.controlled ? 0.28 : 0.5);
      g.stun = Math.max(g.stun, plan.controlled ? 0.12 : 0.26);
      puck.y = plan.y;
      puck.vx = plan.vx;
      puck.vy = plan.vy;
      puck.vz = plan.vz;
      puck.x += attackDir(g.side) * 0.12;
    } else {
    const roll = Math.random();
    let kind: "muffled" | "long" | "juicy" = "juicy";
    if (juicy && (oneT || world.reboundN >= 2))
      kind = roll < 0.2 ? "muffled" : roll < 0.52 ? "long" : "juicy";
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
    }
  } else {
    world.reboundN = 0;
    world.reboundSoft = false;
    noteControl(g, "play");
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
      const hold = goaliePuckHold(g);
      puck.x = hold.x;
      puck.z = hold.z;
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
  if (periodEndLive()) return false;
  if (puck.owner !== null) return false;
  const spd = Math.hypot(puck.vx, puck.vz);
  if (spd < 2.4 || puck.y > GOAL_H + 0.06) return false;
  for (const g of world.skaters) {
    if (g.kind !== "goalie") continue;
    if (g.side !== "home") continue;
    if (stickBackLive((defendDir(g.side) >= 0 ? 1 : -1) as 1 | -1)) continue;
    if (world.lastPasser === g.id && world.time - world.lastPass < 1.05) continue;
    const towardNet = puck.vx * defendDir(g.side) > 1.2;
    if (!towardNet) continue;
    const dNow = Math.hypot(g.x - puck.x, g.z - puck.z);
    const tHit = Math.abs(puck.vx) > 0.25 ? (g.x - puck.x) / puck.vx : 99;
    const zAt = puck.z + puck.vz * Math.max(0, Math.min(0.4, tHit));
    const yAt =
      puck.y +
      puck.vy * Math.max(0, Math.min(0.4, tHit)) -
      6 * Math.max(0, Math.min(0.4, tHit)) ** 2;
    const catcherZ = g.z + (attackDir(g.side) > 0 ? -0.42 : 0.42);
    const onGlove = Math.abs(zAt - catcherZ) < 0.24 && yAt > 0.52 && yAt < 1.2;
    const closeNow = dNow < 0.95 && puck.y < GOAL_H && onGlove;
    const intercept = tHit >= -0.02 && tHit <= 0.36 && onGlove && Math.abs(g.x - puck.x) < 1.35;
    if (!closeNow && !intercept) continue;
    const inZone = puck.x * defendDir(g.side) > BLUE_X - 3;
    if (!inZone && !closeNow) continue;
    if (userIdle() && Math.random() < 0.55) return false;
    if (pathMeetsMouth(puck.x, puck.y, puck.z, puck.vx, puck.vy, puck.vz)) noteShotOnGoal();
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

  return (
    leftPad || rightPad || fiveHole || onGlove || onBlocker || butterflyHandSave(g, puckY, puckZ)
  );
}

/** Raised blocker or glove at the top corner. Not a length clear, and not a pad. */
function butterflyHandSave(g: Skater, puckY: number, puckZ: number): boolean {
  if (world.goalieShot !== null) return false;
  if (!goalieButterflyPose(g)) return false;
  const blockerDir = attackDir(g.side) > 0 ? 1 : -1;
  return goalieRaisedHandCovers(puckY, (puckZ - g.z) * blockerDir);
}

function equipmentHits(g: Skater, x: number, y: number, z: number): boolean {
  if (Math.abs(x - g.x) > 0.62) return false;
  if (Math.abs(x - g.x) < 0.36 && Math.abs(z - g.z) < 0.3 && y < 1.28 && y > 0.05) return true;
  const blade = stickBlade(g);
  if (Math.hypot(x - blade.x, z - blade.z) < 0.22 && y < 0.55) return true;
  return equipmentCovers(g, y, z);
}

function cpuSaveMiss(g: Skater, y: number, z: number): boolean {
  if (butterflyHandSave(g, y, z)) return false;
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
    const lines = oneTimerLinesAtSave();
    let bonus = 0.012;
    if (rush.defenders === 0 && rush.attackers >= 2) bonus = 0.82;
    else if (world.lastShotDist > 12.2 || (shooter && defendersInLane(shooter) > 0)) bonus = 0.02;
    else if (world.lastOneTimerDanger > 0.22) bonus = 0.03 + world.lastOneTimerDanger * 0.22;
    if (lines >= 2) bonus = 0;
    else if (lines >= 1) bonus *= 0.15;
    miss += bonus;
  }
  if (world.lastShotRedirect) miss += 0.16;
  if (Math.abs(z) > 0.62) miss += 0.18;
  if (y > 0.88) miss += 0.12;
  if (world.wrapBehind) miss += 0.2;
  if (n >= 1) miss += n === 1 ? 0.22 : Math.min(0.64, 0.22 + (n - 1) * 0.2);
  if (body) miss *= 0.45;
  miss *= 1.55 - cpuMul("g");
  const chain = world.passChain;
  miss += chain >= 3 ? 0.38 : chain === 2 ? 0.24 : chain === 1 ? 0.12 : 0;
  if (miss > 0.7) miss = 0.7;
  return Math.random() < miss;
}

function tryGoalieSweep(puck: Puck, prevX: number, prevZ: number, prevY: number): boolean {
  if (periodEndLive()) return false;
  if (goalieBankLive && world.goalieShot === "score") return false;
  if (puck.owner !== null || world.whistle === "goal") return false;
  const spd = Math.hypot(puck.vx, puck.vz);
  if (spd < 1.4) return false;
  for (const g of world.skaters) {
    if (g.kind !== "goalie") continue;
    if (stickBackLive(goalieOwnEnd(g))) continue;
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
    const blade = stickBlade(g);
    let stickT = 0;
    if (len2 > 1e-8) {
      stickT = Math.max(0, Math.min(1, ((blade.x - prevX) * dx + (blade.z - prevZ) * dz) / len2));
    }
    const nearStick = Math.hypot(prevX + dx * stickT - blade.x, prevZ + dz * stickT - blade.z) <= 0.4;
    if (Math.hypot(cx - g.x, cz - g.z) > 1.12 && !nearStick) continue;
    const n = Math.max(6, Math.min(16, Math.ceil(spd * 0.4)));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = prevX + (puck.x - prevX) * u;
      const z = prevZ + (puck.z - prevZ) * u;
      const y = prevY + (puck.y - prevY) * u;
      const onStick = goalieStickShot(g, x, y, z);
      const gloveHit = onGloveSave(g, y, z) && !onStick;
      const onBlocker = !onStick && !gloveHit && blockerShotSave(g, y, z);
      if (!onStick && !onBlocker && !equipmentHits(g, x, y, z)) continue;
      if (!onStick && !onBlocker && cpuSaveMiss(g, y, z)) continue;
      const out = attackDir(g.side);
      let reboundChance = g.side === "home" ? 0.22 : 0.9;
      if (world.lastShotOneTimer) {
        const sh = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
        const far = world.lastShotDist > 12.2;
        const clutter = sh ? defendersInLane(sh) > 0 : false;
        reboundChance =
          far || clutter ? 0.98 : Math.max(reboundChance, g.side === "away" ? 0.96 : 0.78);
      }
      if (pathMeetsMouth(puck.x, puck.y, puck.z, puck.vx, puck.vy, puck.vz)) noteShotOnGoal();
      applyGoalieSave(g, puck, reboundChance, g.x + out * 0.65, gloveHit, onStick, onBlocker);
      return true;
    }
  }
  return false;
}

/**
 * Save attempt at the pipe, before iron.
 * Arriving on the post is not a reason to pass. A miss here still hits iron.
 * Over the bar is not a save. A wide miss never reaches this call.
 */
function tryDefendPost(puck: Puck, side: 1 | -1, zPost: number, yHit: number): boolean {
  const g = defendingGoalie(side);
  if (!g || g.tumble !== 0 || g.struck > 0.45) return false;
  if (yHit > GOAL_H - 0.04) return false;
  if (world.lastPasser === g.id && world.time - world.lastPass < 1.05) return false;
  const spot = postSaveAnchor(g, zPost);
  if (Math.hypot(g.x - spot.x, g.z - spot.z) > 0.42) return false;
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
    Math.abs(zPost - g.z) > 0.38 &&
    Math.random() < world.lastOneTimerDanger * 0.32
  ) {
    return false;
  }
  if (g.side === "home" && whiffHot() && shooter?.side === "away" && Math.random() < 0.4)
    return false;
  if (cpuSaveMiss(g, yHit, zPost)) return false;
  const mouth = side * GOAL_LINE_X;
  applyGoalieSave(
    g,
    puck,
    g.side === "home" ? 0.22 : 0.9,
    mouth - side * (0.55 + Math.random() * 0.4),
    onGloveSave(g, yHit, zPost),
  );
  return true;
}

/**
 * Save attempt at the crossbar, before iron.
 * Same miss gates as tryDefendPost. The post's over-the-bar reject does not apply:
 * this call is the bar. A clear miss never reaches it. A miss here still hits iron.
 */
function tryDefendBar(puck: Puck, side: 1 | -1, zBar: number): boolean {
  const g = defendingGoalie(side);
  if (!g || g.tumble !== 0 || g.struck > 0.45) return false;
  if (world.lastPasser === g.id && world.time - world.lastPass < 1.05) return false;
  const spot = barSaveAnchor(g, zBar);
  if (Math.hypot(g.x - spot.x, g.z - spot.z) > 0.42) return false;
  const yHit = GOAL_H;
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
    Math.abs(zBar - g.z) > 0.38 &&
    Math.random() < world.lastOneTimerDanger * 0.32
  ) {
    return false;
  }
  if (g.side === "home" && whiffHot() && shooter?.side === "away" && Math.random() < 0.4)
    return false;
  if (cpuSaveMiss(g, yHit, zBar)) return false;
  const mouth = side * GOAL_LINE_X;
  applyGoalieSave(
    g,
    puck,
    g.side === "home" ? 0.22 : 0.9,
    mouth - side * (0.55 + Math.random() * 0.4),
    onGloveSave(g, yHit, zBar),
  );
  return true;
}

function trySave(puck: Puck, prevX: number, prevZ: number, prevY: number): boolean {
  if (periodEndLive()) return false;
  if (goalieBankLive && world.goalieShot === "score") return false;
  for (const side of [1, -1] as const) {
    const mouth = side * GOAL_LINE_X;
    const crossed =
      (prevX - mouth) * (puck.x - mouth) <= 0 &&
      Math.abs(puck.vx) > 0.4 &&
      Math.sign(puck.vx) === side;
    if (!crossed) continue;
    if (puck.y > GOAL_H - 0.05 || Math.abs(puck.z) > GOAL_W / 2 - 0.04) continue;
    const g = defendingGoalie(side);
    if (!g) continue;
    if (stickBackLive(side)) continue;
    if (world.lastPasser === g.id && world.time - world.lastPass < 1.05) return false;

    const span = puck.x - prevX;
    const t = Math.abs(span) < 1e-6 ? 1 : Math.max(0, Math.min(1, (mouth - prevX) / span));
    const zAt = prevZ + (puck.z - prevZ) * t;
    const yAt = prevY + (puck.y - prevY) * t;
    const xAt = mouth;
    const hit = equipmentHits(g, g.x, yAt, zAt) || equipmentHits(g, xAt, yAt, zAt);
    if (world.goalieShot === null && shotFromOutsideOz() && shotAtThisNet(side) && !shootoutLive()) {
      if (Math.random() < 0.98) {
        const gloveHit = onGloveSave(g, yAt, zAt);
        noteShotOnGoal();
        applyGoalieSave(
          g,
          puck,
          g.side === "home" ? 0.22 : 0.9,
          mouth - side * (0.55 + Math.random() * 0.4),
          gloveHit,
          false,
          !gloveHit && blockerShotSave(g, yAt, zAt),
        );
        return true;
      }
      return false;
    }
    if (!hit) return false;
    const onStick = goalieStickShot(g, xAt, yAt, zAt) || goalieStickShot(g, g.x, yAt, zAt);
    const gloveHit = onGloveSave(g, yAt, zAt) && !onStick;
    const onBlocker =
      !onStick &&
      !gloveHit &&
      (blockerShotSave(g, yAt, zAt) || blockerShotSave(g, yAt, puck.z));
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
    if (g.side === "home" && whiffHot() && shooter?.side === "away" && Math.random() < 0.4)
      return false;
    if (cpuSaveMiss(g, yAt, zAt)) return false;
    let reboundChance = g.side === "home" ? 0.22 : 0.9;
    if (world.lastShotOneTimer) {
      if (farOt || clutterOt) reboundChance = 0.98;
      else reboundChance = Math.max(reboundChance, g.side === "away" ? 0.96 : 0.78);
    }
    noteShotOnGoal();
    applyGoalieSave(
      g,
      puck,
      reboundChance,
      mouth - side * (0.55 + Math.random() * 0.4),
      gloveHit,
      onStick,
      onBlocker,
    );
    return true;
  }
  return false;
}

function maybeRedirect(puck: Puck): void {
  if (periodEndLive()) return;
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
    const inSlot =
      (netX - s.x) * attack > 0.4 && (netX - s.x) * attack < 5.2 && Math.abs(s.z) < 2.6;
    if (!inSlot) continue;
    const blade = stickBlade(s);
    const dx = blade.x - puck.x;
    const dz = blade.z - puck.z;
    const along = dx * puck.vx + dz * puck.vz;
    if (along < 0) continue;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.55) continue;
    if (pathMeetsMouth(puck.x, puck.y, puck.z, puck.vx, puck.vy, puck.vz)) noteShotOnGoal();
    markShotDeflected();
    const g = world.skaters.find((p) => p.kind === "goalie" && p.side !== shooter.side);
    const open = g ? -Math.sign(g.z || puck.z || 1) : Math.sign(Math.random() - 0.5);
    const spd = Math.hypot(puck.vx, puck.vz);
    const nd = Math.hypot(netX - puck.x, open * 0.7 - puck.z) || 1;
    puck.vx = ((netX - puck.x) / nd) * spd * 0.92;
    puck.vz = ((open * 0.72 - puck.z) / nd) * spd * 0.92;
    puck.vy = 0.35;
    world.lastShotRedirect = true;
    touchFlight("poke", s);
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
  refOnAbsorb.delete(r);
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
  refOnAbsorb.delete(r);
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
  refOnAbsorb.delete(r);
  placeDrillBoxRef(world.ref);
  armFaceoffBackSkate();
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
  if (user) lockDot(user, drillStartX(), 0, drillFaceYaw());
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
  if (r.struck > 0 || r.tumble !== 0) {
    advanceCheckedRef(r, dt);
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
  refOnAbsorb.delete(r);
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
      if (Math.hypot(user.x - alt, user.z - standZ) > Math.hypot(user.x - tx, user.z - standZ))
        tx = alt;
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
  if (r.struck > 0 || r.tumble !== 0) {
    advanceCheckedRef(r, dt);
    r.vx *= Math.exp(-3.2 * dt);
    r.vz *= Math.exp(-3.2 * dt);
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    collideRefIce(r);
    return;
  }
  refOnAbsorb.delete(r);
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
  const dropping = r === refForLane(dropperLane());
  const quadOnly = r === world.ref3 || r === world.ref4;
  if (world.faceoff && world.faceoffPhase !== "live") {
    refStayPut.delete(r);
    if (dropping) {
      r.x += (world.faceX - r.x) * Math.min(1, 8 * dt);
      r.z += (world.faceZ + lane * REF_STAND - r.z) * Math.min(1, 8 * dt);
      r.yaw = turnToward(r.yaw, world.faceX - r.x, world.faceZ - r.z, 6, dt);
      r.pose = "drop";
    } else if (quadOnly) {
      const q = refQuadrant(r);
      if (q) {
        const k = Math.min(1, 4 * dt);
        r.x += (q.sx * REF_QUAD_X - r.x) * k;
        r.z += (q.sz * REF_BOARD_Z - r.z) * k;
      }
      r.yaw = turnToward(r.yaw, world.faceX - r.x, world.faceZ - r.z, 5, dt);
      r.pose = "idle";
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
      if (useGame.getState().clockMode === "game") {
        const q = refQuadrant(r);
        if (q) {
          const k = Math.min(1, 2.4 * dt);
          r.x += (q.sx * REF_QUAD_X - r.x) * k;
          r.z += (q.sz * REF_BOARD_Z - r.z) * k;
        }
        r.yaw = turnToward(r.yaw, puck.x - r.x, puck.z - r.z, 3, dt);
        r.pose = "goal";
        return;
      }
      const netX =
        world.goalSide === "home"
          ? world.homeAttack * GOAL_LINE_X
          : -world.homeAttack * GOAL_LINE_X;
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
    if (quadOnly) {
      const q = refQuadrant(r);
      if (q) {
        const k = Math.min(1, 3.2 * dt);
        r.x += (q.sx * REF_QUAD_X - r.x) * k;
        r.z += (q.sz * REF_BOARD_Z - r.z) * k;
      }
      r.yaw = turnToward(r.yaw, puck.x - r.x, puck.z - r.z, 5, dt);
      return;
    }
    r.x += (puck.x - r.x) * Math.min(1, 3.2 * dt);
    r.z += (boardZ - r.z) * Math.min(1, 3.2 * dt);
    r.yaw = turnToward(r.yaw, puck.x - r.x, puck.z - r.z, 5, dt);
    return;
  }
  const puck = world.puck;
  if (useGame.getState().clockMode === "game") {
    const q = refQuadrant(r);
    if (q) {
      const k = Math.min(1, 2.4 * dt);
      r.x += (q.sx * REF_QUAD_X - r.x) * k;
      r.z += (q.sz * REF_BOARD_Z - r.z) * k;
      r.yaw = turnToward(r.yaw, puck.x - r.x, puck.z - r.z, 3, dt);
      r.pose = "idle";
      return;
    }
  }
  r.x += (puck.x * 0.58 - r.x) * Math.min(1, 2.1 * dt);
  r.z += (boardZ - r.z) * Math.min(1, 2.6 * dt);
  r.yaw = turnToward(r.yaw, puck.x - r.x, puck.z - r.z, 3, dt);
  r.pose = "idle";
}

const GOAL_REF_SPOTS = [
  { z: -3.15, depth: 3.35 },
  { z: -1.05, depth: 2.7 },
  { z: 1.05, depth: 2.7 },
  { z: 3.15, depth: 3.35 },
];

function refNetSlot(r: Referee): number {
  if (r === world.ref2) return 1;
  if (r === world.ref3) return 2;
  if (r === world.ref4) return 3;
  return 0;
}

function skateRefToConcedingNet(r: Referee, dt: number): void {
  const netX =
    world.goalSide === "home" ? world.homeAttack * GOAL_LINE_X : -world.homeAttack * GOAL_LINE_X;
  if (refStayPut.has(r)) {
    holdCheckedRef(r, netX, dt);
    return;
  }
  const spot = GOAL_REF_SPOTS[refNetSlot(r)]!;
  const into = -Math.sign(netX || 1);
  const k = Math.min(1, 3.6 * dt);
  r.x += (netX + into * spot.depth - r.x) * k;
  r.z += (spot.z - r.z) * k;
  r.yaw = turnToward(r.yaw, netX - r.x, -r.z, 10, dt);
  r.pose = "goal";
}

function stepRef(dt: number): void {
  const mode = useGame.getState().clockMode;
  if (mode === "drill") {
    stepDrillRefs(dt);
    parkRefAway(world.ref3);
    parkRefAway(world.ref4);
    return;
  }
  stepOneRef(world.ref, 1, dt);
  if (mode !== "practice") stepOneRef(world.ref2, -1, dt);
  if (mode === "game") {
    stepOneRef(world.ref3, 1, dt);
    stepOneRef(world.ref4, -1, dt);
  } else {
    parkRefAway(world.ref3);
    parkRefAway(world.ref4);
  }
}

function checkCover(dt: number, act: Actions): void {
  if (periodEndLive()) return;
  if (world.shootout) return;
  const puck = world.puck;
  if (puck.owner !== null) {
    const holder = world.skaters[puck.owner];
    if (holder?.kind === "goalie") {
      if (!goalieDefendZone(holder.side, puck.x)) {
        world.coverT = Math.max(0, world.coverT - dt * 2);
        return;
      }
      if (world.coverT <= 0) world.coverSideZ = puck.z;
      world.coverT += dt;
      if (holder.gloveFlash > 0.12) return;
      if (holder.side === "away") {
        goalieReleaseId = -1;
        const crash = creaseCrash(holder);
        const open = !Number.isFinite(crash) || crash > 2.15;
        if (open) return;
      }
      // No pass, shot, or saucer: whistle after 2 seconds of possession.
      // A, X, or Select held during that window adds 2 seconds to release.
      const playingPuck =
        holder.side === "home" &&
        ((!world.faceoffA && act.aDown) || act.xDown || act.viewDown);
      if (playingPuck && goalieReleaseId !== holder.id && world.coverT - dt < COVER_HOLD) {
        goalieReleaseId = holder.id;
      }
      if (playingPuck && goalieReleaseId === holder.id) {
        if (world.coverT >= COVER_HOLD + GOALIE_RELEASE_EXTRA) whistleCover();
        return;
      }
      if (!playingPuck) goalieReleaseId = -1;
      if (world.coverT >= COVER_HOLD) whistleCover();
      return;
    }
    goalieReleaseId = -1;
    world.coverT = Math.max(0, world.coverT - dt * 2);
    return;
  }
  goalieReleaseId = -1;
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
    const inCrease =
      towardCenter > -0.2 && towardCenter < CREASE_R + 0.15 && Math.abs(puck.z) < 2.05;
    const d = Math.hypot(s.x - puck.x, s.z - puck.z);
    const blade = stickBlade(s);
    if (inCrease && d < 0.95 && spd < 2.6 && !segmentHitsCage(puck.x, puck.z, blade.x, blade.z)) {
      covering = s;
    }
  }
  if (covering) {
    puck.owner = covering.id;
    noteControl(covering, "play");
    noteChainReception(covering);
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
  if (world.coverT >= COVER_HOLD) whistleCover();
}

/** Drill, practice, and scrimmage never whistle a goalie cover. Game and roller do. */
function whistleCover(): void {
  const mode = useGame.getState().clockMode;
  if (mode === "drill" || mode === "practice" || mode === "scrimmage") return;
  startStoppage("cover");
}

function cpuOneTimerAttempt(s: Skater): boolean {
  if (s.side === "home" || s.id === world.userId || s.kind === "goalie") return false;
  if (s.stun > 0.04 || s.struck > 0.18 || s.dive > 0) return false;
  const attack = attackDir(s.side);
  const distMouth = (attack * GOAL_LINE_X - s.x) * attack;
  if (distMouth < 1.05 || distMouth > 24 || Math.abs(s.z) > 12) return false;
  if (cpuOtKey === world.lastPass && cpuOtId === s.id) return cpuOtYes;
  cpuOtKey = world.lastPass;
  cpuOtId = s.id;
  const rush = rushCounts(s.side);
  if (
    opposingGoalie(s.side) &&
    rush.defenders === 0 &&
    rush.attackers >= 2 &&
    distMouth < 17 &&
    Math.abs(s.z) < 10
  ) {
    cpuOtYes = true;
    return true;
  }
  const lines = passLinesCrossed(world.lastPassX, s.x);
  const hot = distMouth < 15 && Math.abs(s.z) < 7.4;
  let p = hot ? 0.74 : distMouth < 20 ? 0.48 : 0.3;
  if (lines >= 2) p = hot ? 0.05 : 0.02;
  else if (lines >= 1) p = hot ? 0.15 : distMouth < 20 ? 0.08 : 0.04;
  cpuOtYes = Math.random() < p;
  return cpuOtYes;
}

function cpuOneTimerShot(s: Skater): void {
  cpuFinishOnNet(s, true);
}

function maybeLoadedSlap(s: Skater): boolean {
  if (s.id !== world.userId || s.kind === "goalie") return false;
  if (world.oneTimerArmed || world.windupCancel) return false;
  if (!(world.shotWindupT > SHOT_FULL_HOLD * 0.5)) return false;
  doShot(s, slapMx, slapMy, true, world.shotWindupT);
  return true;
}

function shaftTouch(s: Skater, x: number, y: number, z: number): boolean {
  const yaw = s.yaw + Math.PI;
  const c = Math.cos(yaw);
  const si = Math.sin(yaw);
  const hand = skaterKnobLocal();
  const plate = skaterPlateLocal();
  const hx = s.x + hand.x * c + hand.z * si;
  const hz = s.z - hand.x * si + hand.z * c;
  const bx = s.x + plate.x * c + plate.z * si;
  const bz = s.z - plate.x * si + plate.z * c;
  const abx = bx - hx;
  const aby = plate.y - hand.y;
  const abz = bz - hz;
  const apx = x - hx;
  const apy = y - hand.y;
  const apz = z - hz;
  const ab2 = abx * abx + aby * aby + abz * abz || 1e-6;
  let u = (apx * abx + apy * aby + apz * abz) / ab2;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  const cx = hx + abx * u;
  const cy = hand.y + aby * u;
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
  const carriedPass =
    world.lastPassTo === s.id &&
    world.time - world.lastPass < 2.2 &&
    world.lastShoot < world.lastPass;
  if (carriedPass) noteChainReception(s);
  world.lastPassTo = null;
  noteControl(s, carriedPass ? "receive" : "play");
}

function interceptGoalieFlight(puck: Puck, prevX: number, prevY: number, prevZ: number): boolean {
  if (periodEndLive()) return false;
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
      if (dekeCommitBlocks(s.id)) continue;
      if (s.dive > 0.04) continue;
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

const DEAD_PUCK = 2.5;
const SKATE_REACH = 0.22;
/** How far the tape sits, plus a short pad, and never past the shaft length. */
function stickClaimRadius(s: Skater): number {
  const blade = stickBlade(s);
  const toBlade = Math.hypot(blade.x - s.x, blade.z - s.z);
  return Math.min(SKATER_STICK_LEN, toBlade + SKATER_STICK_LEN * 0.16);
}
const MATE_LOOSE_REACH = 1.3;
const MATE_LOOSE_SLOW = 4;

function loosePuckDead(puck: Puck): boolean {
  return Math.hypot(puck.vx, puck.vz) < DEAD_PUCK && puck.y < 0.38 && Math.abs(puck.vy) < 0.45;
}

/**
 * Puck in the skate circle around the body.
 * A stopped puck counts, and so does one moving with the skater.
 */
function puckSettledInSkates(s: Skater, puck: Puck): boolean {
  if (puck.y >= 0.38 || Math.abs(puck.vy) >= 0.45) return false;
  if (Math.hypot(s.x - puck.x, s.z - puck.z) > s.radius + SKATE_REACH) return false;
  if (Math.hypot(puck.vx, puck.vz) < DEAD_PUCK) return true;
  return Math.hypot(puck.vx - s.vx, puck.vz - s.vz) < DEAD_PUCK;
}

function segmentPointDist(x0: number, z0: number, x1: number, z1: number, px: number, pz: number): number {
  const abx = x1 - x0;
  const abz = z1 - z0;
  const ab2 = abx * abx + abz * abz;
  if (ab2 < 1e-8) return Math.hypot(px - x1, pz - z1);
  let u = ((px - x0) * abx + (pz - z0) * abz) / ab2;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  return Math.hypot(px - (x0 + abx * u), pz - (z0 + abz * u));
}

function tryPickup(puck: Puck, prevX = puck.x, prevZ = puck.z): void {
  if (periodEndLive()) return;
  if (world.time < stickLooseUntil) return;
  const intended = world.lastPassTo;
  const passer = world.lastPasser;
  const sincePass = world.time - world.lastPass;
  const sinceShot = world.time - world.lastShoot;
  const sinceSave = world.time - world.goalieSaveT;
  const passLive = intended !== null && sincePass < 2.2;

  if (passLive) {
    const t = world.skaters[intended];
    if (
      t &&
      !dekeCommitBlocks(t.id) &&
      t.kind !== "goalie" &&
      t.stun <= 0.04 &&
      t.struck <= 0.18 &&
      t.dive <= 0
    ) {
      const justShot =
        sinceShot < 0.6 &&
        world.lastShoot >= world.lastPass &&
        (world.lastShooter === t.id || world.lastShotOneTimer);
      if (!justShot) {
        const blade = stickBlade(t);
        const dx = blade.x + t.vx * 0.06 - puck.x;
        const dz = blade.z + t.vz * 0.06 - puck.z;
        const distBlade = Math.hypot(dx, dz);
        const distPath = Math.min(
          distBlade,
          segmentPointDist(prevX, prevZ, puck.x, puck.z, blade.x, blade.z),
        );
        const bodyPath = Math.min(
          Math.hypot(t.x - puck.x, t.z - puck.z),
          segmentPointDist(prevX, prevZ, puck.x, puck.z, t.x, t.z),
        );
        const throughStick = bodyPath <= stickClaimRadius(t);
        const dist = throughStick ? Math.min(distPath, bodyPath) : distPath;
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
        const closing = along / (spd * dist || 1);
        if (
          stillPass &&
          closing > -0.22 &&
          dist > 0.2 &&
          spd > 0.9 &&
          puck.y < (passerIsGoalie ? 1.2 : 0.95)
        ) {
          const maxH = passerIsGoalie ? 3.2 : t.id === world.userId ? 3.1 : 2.15;
          if (dist < maxH) {
            let k = passerIsGoalie
              ? dist < 1.6
                ? 0.28
                : 0.12
              : t.id === world.userId
                ? dist < 1.5
                  ? 0.6
                  : 0.3
                : dist < 1.2
                  ? 0.4
                  : 0.2;
            if (!passerIsGoalie && closing <= 0) k *= 0.45;
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
        if (oneT && world.oneTimerPass) {
          world.oneTimerArmed = false;
          world.oneTimerSlap = false;
          world.oneTimerPass = false;
          world.oneTimerSaucer = false;
        }
        if (world.oneTimerArmed && t.side === "home") {
          if (!tooEarly && dist < 3 && puck.y < 1.45) {
            noteControl(t, "receive");
            noteChainReception(t);
            fireOneTimer(t);
            return;
          }
        } else if (
          !tooEarly &&
          t.side === "away" &&
          t.id !== world.userId &&
          dist < 2.8 &&
          puck.y < 1.35 &&
          cpuOneTimerAttempt(t)
        ) {
          noteControl(t, "receive");
          noteChainReception(t);
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
          noteControl(t, "receive");
          noteChainReception(t);
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
  let feetWin = false;
  let stickWin = false;
  let mateLooseWin = false;
  const dead = loosePuckDead(puck);
  const justReleased = userJustReleasedPuck();
  for (const s of world.skaters) {
    if (dekeCommitBlocks(s.id)) continue;
    if (justReleased && s.side === "away") continue;
    if (s.kind === "goalie" && s.id !== world.userId) {
      if (goalieBankLive && world.goalieShot === "score") continue;
      if (!goalieDefendZone(s.side, puck.x)) continue;
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
    if (s.kind === "goalie" && s.tumble !== 0) continue;
    if (s.stun > 0.04 || s.struck > 0.18 || s.dive > 0) continue;
    if (passMeantForUser() && s.side === "home" && s.id !== world.userId) continue;
    const bodyD = Math.hypot(s.x - puck.x, s.z - puck.z);
    const mateSettle =
      s.side === "home" &&
      s.id !== world.userId &&
      bodyD <= MATE_LOOSE_REACH &&
      puck.y < 0.4 &&
      moving < MATE_LOOSE_SLOW &&
      Math.abs(puck.vy) < 1.2 &&
      !passMeantForUser() &&
      !livePassForOther(s);
    const atSkates = puckSettledInSkates(s, puck);
    const stickR = stickClaimRadius(s);
    const bodyPath = Math.min(bodyD, segmentPointDist(prevX, prevZ, puck.x, puck.z, s.x, s.z));
    const onStick = puck.y <= 0.55 && Math.abs(puck.vy) <= 1.1 && bodyPath <= stickR;
    if (passer === s.id && !dead && (sincePass < 0.62 || (bodyD < 2.8 && sincePass < 0.95)))
      continue;
    if (world.lastHitter === s.id && world.time - world.lastHitTime < 0.5) continue;
    if (world.lastShooter === s.id && sinceShot < (world.lastShotOneTimer ? 0.6 : 0.28)) continue;
    if (shooter && s.side === shooter.side && sinceShot < 0.55 && !mateSettle) continue;
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
    if (
      ahead < -0.08 &&
      bodyD > s.radius &&
      !atSkates &&
      !onStick &&
      !mateSettle &&
      !(intended === s.id && sincePass < 2.2) &&
      s.id !== world.userId
    )
      continue;
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
    const shotInFlight = !!shooter && shooter.side !== s.side && sinceShot < 0.9 && moving > 7.2;
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
    const userLoose = s.id === world.userId && sinceSave >= 1.2 && !passLive && !shotInFlight;
    if (userLoose) {
      const looseReach = moving > 10 ? 1.35 : 1.72;
      reach = Math.max(reach, looseReach);
      if (bodyD < d && dBlade <= looseReach) d = bodyD;
    }
    let feetClaim = false;
    if (atSkates) {
      d = Math.min(d, bodyD);
      reach = Math.max(reach, s.radius + SKATE_REACH);
      feetClaim = true;
    }
    const hostile =
      shotInFlight || (!!passLive && !!passerSide && s.side !== passerSide);
    let stickClaim = false;
    if (!hostile && onStick) {
      d = Math.min(d, bodyPath);
      reach = Math.max(reach, stickR);
      stickClaim = true;
    }
    let mateLoose = false;
    if (mateSettle) {
      d = Math.min(d, bodyD);
      reach = Math.max(reach, MATE_LOOSE_REACH);
      mateLoose = true;
    }
    if (d < reach && d < bestD) {
      bestD = d;
      best = s.id;
      userLooseWin = userLoose;
      feetWin = feetClaim;
      stickWin = stickClaim;
      mateLooseWin = mateLoose;
    }
  }
  if (best >= 0) {
    const s = world.skaters[best]!;
    if (s.kind === "goalie" && s.id !== world.userId) {
      if (!goalieDefendZone(s.side, puck.x)) return;
      if (Math.hypot(s.x - puck.x, s.z - puck.z) > 1.45) return;
      const hold = goaliePuckHold(s);
      if (segmentHitsCage(puck.x, puck.z, hold.x, hold.z)) return;
      puck.owner = s.id;
      puck.x = hold.x;
      puck.z = hold.z;
      puck.y = PUCK_Y;
      puck.vx = s.vx;
      puck.vz = s.vz;
      puck.vy = 0;
      noteControl(s, "play");
      noteChainReception(s);
      world.coverT = 0;
      world.goalieShot = null;
      s.follow = 0;
      s.windup = 0;
      return;
    }
    const blade = stickBlade(s);
    const intendedPickup = intended === best && sincePass < 2.2;
    let snapCap = sinceSave < 1.2 ? 0.55 : intendedPickup ? 2.6 : 1.28;
    if (feetWin || stickWin) snapCap = Math.max(snapCap, Math.max(1.8, SKATER_STICK_LEN));
    else if (userLooseWin) snapCap = Math.max(snapCap, 1.72);
    if (mateLooseWin) snapCap = Math.max(snapCap, 1.45);
    const bladeD = Math.hypot(blade.x - puck.x, blade.z - puck.z);
    if (s.kind === "goalie") {
      if (goalieBankLive && world.goalieShot === "score") return;
      const bodyD = Math.hypot(s.x - puck.x, s.z - puck.z);
      const d = feetWin || stickWin || userLooseWin ? Math.min(bladeD, bodyD) : bladeD;
      if (d > snapCap) return;
      const hold = goaliePuckHold(s);
      if (segmentHitsCage(puck.x, puck.z, hold.x, hold.z)) return;
      puck.owner = s.id;
      puck.x = hold.x;
      puck.z = hold.z;
      puck.y = PUCK_Y;
      puck.vx = s.vx;
      puck.vz = s.vz;
      puck.vy = 0;
      noteControl(s, "play");
      noteChainReception(s);
      world.coverT = 0;
      world.goalieShot = null;
      s.follow = 0;
      s.windup = 0;
      return;
    }
    // Skate and stick claims measure the body. The blade sits off to one side.
    const nearBody = feetWin || stickWin;
    const claimD = nearBody ? Math.min(bladeD, Math.hypot(s.x - puck.x, s.z - puck.z)) : bladeD;
    if (claimD > snapCap) return;
    puck.owner = best;
    puck.x = blade.x;
    puck.z = blade.z;
    puck.y = PUCK_Y;
    puck.vx = s.vx;
    puck.vz = s.vz;
    puck.vy = 0;
    const livePass = intended === s.id && sincePass < 2.2 && world.lastShoot < world.lastPass;
    noteControl(s, livePass ? "receive" : "play");
    if (livePass) noteChainReception(s);
    if (livePass && s.side === "away" && s.id !== world.userId && cpuOneTimerAttempt(s)) {
      cpuOneTimerShot(s);
      return;
    }
    if (!livePass) maybeLoadedSlap(s);
  }
}

/** Spots the next faceoff will use. Players only drift toward them during the whistle. */
function offsideFaceoffSpots(): Map<number, { x: number; z: number }> {
  const spots = new Map<number, { x: number; z: number }>();
  const ox = world.faceX;
  const oz = world.faceZ;
  for (const side of ["home", "away"] as const) {
    const sign = defendDir(side);
    const wings = world.skaters
      .filter((s) => s.side === side && s.kind === "winger")
      .sort((a, b) => a.id - b.id);
    const defs = world.skaters
      .filter((s) => s.side === side && s.kind === "defense")
      .sort((a, b) => a.id - b.id);
    const goalie = world.skaters.find((s) => s.side === side && s.kind === "goalie");
    if (goalie) spots.set(goalie.id, { x: sign * (GOAL_LINE_X - 0.9), z: 0 });
    const dot = wings[0];
    if (dot) spots.set(dot.id, { x: ox + sign * FACEOFF_DOT_X, z: oz });
    const extras = dot ? wings.slice(1) : wings;
    const hashFourth = extras.length === 3 && defs.length === 1;
    extras.forEach((s, i) => {
      if (hashFourth && i === 1) {
        const hashZ = (world.refLane >= 0 ? 1 : -1) * 3.4;
        spots.set(s.id, { x: ox + sign * (FACEOFF_R + 1.05), z: oz + hashZ });
        return;
      }
      const zSpread = extras.length <= 1 ? FACEOFF_R + 0.5 : FACEOFF_R + 0.55;
      const zOff =
        extras.length === 1 ? zSpread * (side === "home" ? 1 : -1) : laneZ(extras.length, i, zSpread);
      spots.set(s.id, { x: ox + sign * faceoffWingX(zOff), z: oz + zOff });
    });
    defs.forEach((s, i) => {
      const zOff = laneZ(Math.max(1, defs.length), i, 3.4);
      spots.set(s.id, { x: ox + sign * (FACEOFF_R + 1.05), z: oz + zOff });
    });
  }
  return spots;
}

/** Keep simulating and recording this long after the offside whistle. */
const OFFSIDE_LIVE_TAIL = 0.5;

function offsideTailLive(): boolean {
  return world.whistle === "offside" && world.stoppageT <= OFFSIDE_LIVE_TAIL;
}

function coastOffsidePuck(dt: number): void {
  const puck = world.puck;
  if (puck.owner !== null) {
    const s = world.skaters[puck.owner];
    if (!s) {
      puck.owner = null;
    } else {
      const spot = s.kind === "goalie" ? goaliePuckHold(s) : stickBlade(s);
      puck.x = spot.x;
      puck.z = spot.z;
      puck.y = PUCK_Y;
      puck.vx = s.vx;
      puck.vz = s.vz;
      puck.vy = 0;
      containPuckBoards(puck);
      return;
    }
  }
  puck.x += puck.vx * dt;
  puck.z += puck.vz * dt;
  puck.y += puck.vy * dt;
  puck.vy -= 12 * dt;
  if (puck.y <= PUCK_Y) {
    puck.y = PUCK_Y;
    if (puck.vy < 0) puck.vy = 0;
  }
  containPuckBoards(puck);
}

function releaseOffsidePuck(): void {
  const puck = world.puck;
  const holder = puck.owner !== null ? world.skaters[puck.owner] : undefined;
  if (holder) {
    const sp = Math.hypot(holder.vx, holder.vz);
    const cap = 2.1;
    const k = sp > 0.05 ? Math.min(0.7, cap / sp) : 0;
    puck.vx = holder.vx * k;
    puck.vz = holder.vz * k;
    puck.vy = 0;
  } else {
    puck.vx *= 0.15;
    puck.vz *= 0.15;
  }
  puck.owner = null;
  world.offsideCarrier = null;
  offsideReleasePending = false;
}

/** Other skaters coast toward the faceoff during the offside whistle. The user keeps full control. */
function stepOffsideGlide(dt: number): void {
  const spots = offsideFaceoffSpots();
  for (const s of world.skaters) {
    if (s.id === world.userId) continue;
    const spot = spots.get(s.id);
    if (!spot) continue;
    const dx = spot.x - s.x;
    const dz = spot.z - s.z;
    const dist = Math.hypot(dx, dz);
    let tx = 0;
    let tz = 0;
    if (dist > 0.2) {
      const bend = Math.min(1, dist / 10) * 0.65 * ((s.id % 2) * 2 - 1);
      tx = dx / dist - (dz / dist) * bend;
      tz = dz / dist + (dx / dist) * bend;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
    }
    const accel = dist > 0.2 ? Math.min(2.8, 1.1 + dist * 0.08) : 0;
    const damp = Math.exp(-0.95 * dt);
    s.vx = s.vx * damp + tx * accel * dt;
    s.vz = s.vz * damp + tz * accel * dt;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    if (Math.hypot(s.vx, s.vz) > 0.25) s.yaw = turnToward(s.yaw, s.vx, s.vz, 2.4, dt);
    keepInBowl(s);
  }
  const puck = world.puck;
  if (offsideReleasePending && world.stoppageT < OFFSIDE_LIVE_TAIL) {
    coastOffsidePuck(dt);
    return;
  }
  if (offsideReleasePending) releaseOffsidePuck();
  if (puck.owner !== null) {
    const holder = world.skaters[puck.owner];
    if (holder) {
      const sp = Math.hypot(holder.vx, holder.vz);
      const cap = 2.1;
      const k = sp > 0.05 ? Math.min(0.7, cap / sp) : 0;
      puck.vx = holder.vx * k;
      puck.vz = holder.vz * k;
      puck.vy = 0;
      puck.y = PUCK_Y;
    }
    puck.owner = null;
  }
  puck.vx *= Math.exp(-0.65 * dt);
  puck.vz *= Math.exp(-0.65 * dt);
  puck.x += puck.vx * dt;
  puck.z += puck.vz * dt;
  puck.vy -= 12 * dt;
  puck.y += puck.vy * dt;
  if (puck.y <= PUCK_Y) {
    puck.y = PUCK_Y;
    puck.vy = 0;
  }
  containPuckBoards(puck);
}

function stepWhistlePuck(dt: number): void {
  const puck = world.puck;
  if (puck.owner !== null) {
    const s = world.skaters[puck.owner];
    if (!s) {
      puck.owner = null;
    } else {
      const spot = s.kind === "goalie" ? goaliePuckHold(s) : stickBlade(s);
      puck.x = spot.x;
      puck.z = spot.z;
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
  const damp = Math.exp(-PUCK_DRAG * dt);
  puck.vx *= damp;
  puck.vz *= damp;
  containPuckBoards(puck);
  bouncePuckCage(puck, prevX, prevZ, prevY);
  containPuckBoards(puck);
  ejectFromCage(puck, prevX);
  holdMeshRest();
  if (puck.y > 1.2) return;
  const since = world.time - world.lastShoot;
  if (puck.y < 0.38 && Math.abs(puck.vy) < 0.45 && world.time >= stickLooseUntil) {
    let claim: Skater | null = null;
    let claimD = 99;
    const shooter = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
    for (const s of world.skaters) {
      if (
        s.kind === "goalie" ||
        dekeCommitBlocks(s.id) ||
        s.stun > 0.04 ||
        s.struck > 0.18 ||
        s.dive > 0
      )
        continue;
      if (world.lastHitter === s.id && world.time - world.lastHitTime < 0.5) continue;
      if (world.lastShooter === s.id && since < (world.lastShotOneTimer ? 0.6 : 0.28)) continue;
      if (shooter && s.side === shooter.side && since < 0.55) continue;
      if (world.oneTimerArmed && world.time - world.lastPass < 2.2 && s.side === "home") continue;
      const dist = Math.hypot(s.x - puck.x, s.z - puck.z);
      const settled =
        Math.hypot(puck.vx, puck.vz) < DEAD_PUCK ||
        Math.hypot(puck.vx - s.vx, puck.vz - s.vz) < DEAD_PUCK;
      if (!puckSettledInSkates(s, puck) && !(settled && dist <= stickClaimRadius(s))) continue;
      if (dist >= claimD) continue;
      claim = s;
      claimD = dist;
    }
    if (claim) {
      const blade = stickBlade(claim);
      puck.owner = claim.id;
      puck.x = blade.x;
      puck.z = blade.z;
      puck.y = PUCK_Y;
      puck.vx = claim.vx;
      puck.vz = claim.vz;
      puck.vy = 0;
      return;
    }
  }
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

function stanceShotSkater(): Skater | undefined {
  const s = world.skaters[world.userId];
  if (!s?.backskate || s.kind === "goalie") return undefined;
  return s;
}

function liveShotFlight(): boolean {
  if (world.lastShooter === null) return false;
  if (world.lastPass > world.lastShoot) return false;
  if (world.time - world.lastShoot > 3.2) return false;
  return Math.hypot(world.puck.vx, world.puck.vz) > 4;
}

/** Root plus the dive reach, mid, and tail circles from cageBodySamples. */
function diveBlockSamples(s: Skater): { x: number; z: number; r: number }[] {
  const { fx, fz } = heading(s.yaw);
  const reach = 1.15;
  return [
    { x: s.x, z: s.z, r: s.radius },
    { x: s.x + fx * reach * 0.62, z: s.z + fz * reach * 0.62, r: 0.32 },
    { x: s.x + fx * reach, z: s.z + fz * reach, r: 0.26 },
    { x: s.x + fx * 0.22, z: s.z + fz * 0.22, r: 0.28 },
  ];
}

/** Shaft from knob to plate, same ends and radius as shaftTouch. */
function diveStickSamples(s: Skater): { x: number; z: number; r: number }[] {
  const hand = skaterKnobLocal();
  const plate = skaterPlateLocal();
  const a = skaterXZ(s, hand.x, hand.z);
  const b = skaterXZ(s, plate.x, plate.z);
  const rad = s.id === world.userId ? 0.28 : 0.2;
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(2, Math.ceil(span / Math.max(0.12, rad * 0.75)));
  const pts: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, r: rad });
  }
  return pts;
}

/**
 * Swept puck segment against every diving body.
 * A hit sits just outside that sample and reflects like a stance block.
 */
function blockDiveBodies(
  puck: Puck,
  x0: number,
  y0: number,
  z0: number,
  y1: number,
): boolean {
  if (world.whistle || world.stoppage || world.faceoff) return false;
  const x1 = puck.x;
  const z1 = puck.z;
  const inBand = (y: number) => y >= 0.02 && y <= 1.82;
  let bestT = 2;
  let bestNx = 1;
  let bestNz = 0;
  let bestX = 0;
  let bestZ = 0;
  let bestR = 0;
  let bestS: Skater | null = null;
  for (const s of world.skaters) {
    if (s.dive <= 0.04) continue;
    for (const p of diveBlockSamples(s).concat(diveStickSamples(s))) {
      const sx = x0 - p.x;
      const sz = z0 - p.z;
      const sd = Math.hypot(sx, sz);
      if (sd <= p.r) {
        if (!inBand(y0) && !inBand(y1)) continue;
        if (0 < bestT) {
          bestT = 0;
          bestNx = sd > 1e-4 ? sx / sd : 1;
          bestNz = sd > 1e-4 ? sz / sd : 0;
          bestX = p.x;
          bestZ = p.z;
          bestR = p.r;
          bestS = s;
        }
        continue;
      }
      const hit = segmentCircle(x0, z0, x1, z1, p.x, p.z, p.r);
      if (!hit || hit.t >= bestT) continue;
      const y = y0 + (y1 - y0) * hit.t;
      if (!inBand(y)) continue;
      bestT = hit.t;
      bestNx = hit.nx;
      bestNz = hit.ny;
      bestX = p.x;
      bestZ = p.z;
      bestR = p.r;
      bestS = s;
    }
  }
  if (!bestS) return false;
  const yHit = y0 + (y1 - y0) * bestT;
  const shot = liveShotFlight();
  if (shot && bestS.kind === "goalie" && pathMeetsMouth(puck.x, puck.y, puck.z, puck.vx, puck.vy, puck.vz)) {
    noteShotOnGoal();
  }
  if (shot) markShotDeflected();
  const pass =
    !shot &&
    world.lastPasser !== null &&
    world.lastPass >= world.lastShoot &&
    world.time - world.lastPass < 2.2 &&
    Math.hypot(puck.vx, puck.vz) > 4;
  puck.x = bestX + bestNx * (bestR + 0.04);
  puck.z = bestZ + bestNz * (bestR + 0.04);
  puck.y = inBand(yHit) ? yHit : inBand(y1) ? y1 : y0;
  const vn = puck.vx * bestNx + puck.vz * bestNz;
  if (vn < 0) {
    puck.vx -= 1.45 * vn * bestNx;
    puck.vz -= 1.45 * vn * bestNz;
  }
  noteDeflect("rebound", bestS);
  if (shot) touchFlight("shot", bestS);
  else if (pass) touchFlight("pass", bestS);
  return true;
}

/** Shot segment through the stance body. Bounce matches a whistle-puck body hit. */
function blockStanceShot(puck: Puck, prevX: number, prevY: number, prevZ: number): boolean {
  if (world.whistle || world.stoppage || world.faceoff) return false;
  if (!liveShotFlight()) return false;
  const s = stanceShotSkater();
  if (!s || s.id === world.lastShooter) return false;
  const inBand = (y: number) => y >= 0.02 && y <= 1.82;
  const reflect = (nx: number, nz: number, y: number) => {
    markShotDeflected();
    puck.x = s.x + nx * (s.radius + 0.04);
    puck.z = s.z + nz * (s.radius + 0.04);
    puck.y = y;
    const vn = puck.vx * nx + puck.vz * nz;
    if (vn < 0) {
      puck.vx -= 1.45 * vn * nx;
      puck.vz -= 1.45 * vn * nz;
    }
    noteDeflect("rebound", s);
    touchFlight("shot", s);
  };
  const sx = prevX - s.x;
  const sz = prevZ - s.z;
  const sd = Math.hypot(sx, sz);
  if (sd <= s.radius) {
    if (!inBand(prevY) && !inBand(puck.y)) return false;
    const nx = sd > 1e-4 ? sx / sd : 1;
    const nz = sd > 1e-4 ? sz / sd : 0;
    reflect(nx, nz, inBand(puck.y) ? puck.y : prevY);
    return true;
  }
  const hit = segmentCircle(prevX, prevZ, puck.x, puck.z, s.x, s.z, s.radius);
  if (!hit) return false;
  const y = prevY + (puck.y - prevY) * hit.t;
  if (!inBand(y)) return false;
  reflect(hit.nx, hit.ny, y);
  return true;
}

function stepPuck(dt: number): void {
  rememberOnIce();
  if (releasePracticeGoalPuck(dt)) return;
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
  const puck = world.puck;
  if (puck.owner !== null) {
    clearShotTrack();
    sauceLandCharge = -1;
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
        } else if (s.kind === "goalie") {
          const hold = goaliePuckHold(s);
          nextX = hold.x;
          nextZ = hold.z;
          nextY = PUCK_Y;
        } else {
          const blade = stickBlade(s);
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
        const bodyIn =
          crossed !== 0 || alreadyInCageOrBehind(prevX, prevZ, prevY) ? 0 : carrierIntoOwnMouth(s);
        const scored = crossed !== 0 ? crossed : bodyIn;
        if (tickScrimmage(prevX, prevY, prevZ, puck.x, puck.y, puck.z)) return;
        const carriedMode = useGame.getState().clockMode;
        if (
          scored !== 0 &&
          carriedMode !== "drill" &&
          carriedMode !== "scrimmage" &&
          !periodEndLive()
        ) {
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
  let stanceBlocked = false;
  let diveBlocked = false;
  if (boardRide?.phase === "glide") {
    stepBoardGlide(dt);
  } else {
    puck.x += puck.vx * dt;
    puck.z += puck.vz * dt;
    puck.y += puck.vy * dt;
    const sauceGrav = sauceLandCharge >= 0.999 ? SAUCE_GRAV : 12;
    puck.vy -= sauceGrav * dt;
    if (puck.y <= PUCK_Y) {
      const hitIce = prevY > PUCK_Y + 0.008;
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
      // First ice hit of a saucer. Full charge keeps the least speed. A tap barely sheds any.
      if (hitIce && sauceLandCharge >= 0) {
        const keep = 1 - sauceLandCharge * 0.62;
        puck.vx *= keep;
        puck.vz *= keep;
        sauceLandCharge = -1;
      }
    }
    const damp = Math.exp((world.reboundSoft ? -1.85 : -PUCK_DRAG) * dt);
    puck.vx *= damp;
    puck.vz *= damp;
    stanceBlocked = blockStanceShot(puck, prevX, prevY, prevZ);
    if (!stanceBlocked) {
      const destX = puck.x;
      const destZ = puck.z;
      const destY = puck.y;
      const step = Math.hypot(destX - prevX, destZ - prevZ);
      if (step > 0.26) {
        const n = Math.min(5, Math.ceil(step / 0.2));
        puck.x = prevX;
        puck.z = prevZ;
        for (let i = 1; i <= n; i++) {
          const segX = prevX + (destX - prevX) * ((i - 1) / n);
          const segZ = prevZ + (destZ - prevZ) * ((i - 1) / n);
          const y0 = prevY + (destY - prevY) * ((i - 1) / n);
          const y1 = prevY + (destY - prevY) * (i / n);
          puck.x = prevX + (destX - prevX) * (i / n);
          puck.z = prevZ + (destZ - prevZ) * (i / n);
          if (blockDiveBodies(puck, segX, y0, segZ, y1)) {
            diveBlocked = true;
            containPuckBoards(puck);
            break;
          }
          if (containPuckBoards(puck)) break;
        }
      } else {
        if (blockDiveBodies(puck, prevX, prevY, prevZ, puck.y)) diveBlocked = true;
        containPuckBoards(puck);
      }
    } else {
      containPuckBoards(puck);
    }
  }
  if (!stanceBlocked && interceptGoalieFlight(puck, prevX, prevY, prevZ)) return;
  const shotX = puck.x;
  const shotY = puck.y;
  const shotZ = puck.z;
  const mouthBeforeCage = crossedGoalMouth(prevX, prevZ, prevY, puck);
  noteShootoutContacts();
  bouncePuckCage(puck, prevX, prevZ, prevY);
  containPuckBoards(puck);
  holdMeshRest();
  maybeCreaseDeflect(puck);
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
    if (puck.owner === null && !(world.drillWon && !drillWinKicked) && !drillEncoreLive)
      tryPickup(puck, prevX, prevZ);
    return;
  }

  // Score from where the cage left the puck. Do not put it back on the
  // pre-collision point, or a shot that met the twine continues through it.
  if (!diveBlocked && shootoutLive()) {
    const entered = crossedGoalMouth(prevX, prevZ, prevY, puck);
    if (entered !== 0) {
      noteShotOnGoal();
      stopForGoal(entered);
      return;
    }
  }
  if (!diveBlocked && tryGoalieCatch(puck)) return;
  if (!diveBlocked && tryGoalieSweep(puck, prevX, prevZ, prevY)) return;
  if (!diveBlocked && trySave(puck, prevX, prevZ, prevY)) return;
  if (tickScrimmage(prevX, prevY, prevZ, puck.x, puck.y, puck.z)) return;

  let scored = crossedGoalMouth(prevX, prevZ, prevY, puck);
  if (scored === 0 && mouthBeforeCage !== 0) {
    const side = mouthBeforeCage;
    const along = (puck.x - side * GOAL_LINE_X) * side;
    if (inCageVolume(puck.x, puck.z, puck.y, side) || along > 0.02) scored = side;
  }
  if (scored !== 0 && shootoutLive()) {
    noteShotOnGoal();
    stopForGoal(scored);
    return;
  }
  if (scored !== 0 && useGame.getState().clockMode !== "scrimmage") {
    noteShotOnGoal();
    if (world.goalieShot === "out") {
      kickGoalieMiss(puck, scored, puck.z, puck.y > GOAL_H - 0.2);
      return;
    }
    const g = defendingGoalie(scored);
    const aimed = shotAtThisNet(scored);
    if (
      !stickBackLive(scored) &&
      world.goalieShot === null &&
      g &&
      aimed &&
      shotFromOutsideOz() &&
      Math.random() > 0.02
    ) {
      noteShotOnGoal();
      applyGoalieSave(
        g,
        puck,
        g.side === "home" ? 0.22 : 0.9,
        g.x + (scored > 0 ? -1 : 1) * 0.7,
        onGloveSave(g, puck.y, puck.z),
      );
      return;
    }
    if (
      !stickBackLive(scored) &&
      world.goalieShot !== "score" &&
      g &&
      !aimed &&
      goalieCoversMouth(g, puck.y, puck.z)
    ) {
      applyGoalieSave(
        g,
        puck,
        g.side === "home" ? 0.22 : 0.9,
        g.x + (scored > 0 ? -1 : 1) * 0.7,
        onGloveSave(g, puck.y, puck.z),
      );
      return;
    }
    if (!stickBackLive(scored) && beginGoalBank(scored)) return;
    stopForGoal(scored);
    return;
  }
  ejectFromCage(puck, prevX);
  if (maybeCrowdStoppage(prevX, prevY, prevZ, dt)) return;
  tryPickup(puck, prevX, prevZ);
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

/** Spherical offset from a look point. Loose limits match the title orbit. */
export function orbitFromOffset(
  dx: number,
  dy: number,
  dz: number,
  loose = false,
): { theta: number; phi: number; radius: number } {
  const radius = Math.max(loose ? 3.2 : 4.2, Math.hypot(dx, dy, dz));
  let phi = Math.acos(Math.max(-0.99, Math.min(0.99, dy / Math.max(radius, 1e-4))));
  phi = Math.max(0.12, Math.min(loose ? Math.PI / 2 - 0.08 : 1.45, phi));
  return { theta: Math.atan2(dx, dz), phi, radius };
}

/** Same zoom and elevation, from the other end of the rink. */
export function mirrorFreeCamEnds(): void {
  const fc = world.freeCam;
  fc.theta = Math.atan2(Math.sin(fc.theta + Math.PI), Math.cos(fc.theta + Math.PI));
}

function tickFreeCam(dt: number, act: Actions): void {
  const fc = world.freeCam;
  // Current sample only. A stick that has sprung back near center is not a hold.
  const mag = Math.hypot(act.moveX, act.moveY);
  if (mag > 0.2) {
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
  scrimmageHome: DrillTargets;
  scrimmageAway: DrillTargets;
  gameMinutes: number;
  rollerMinutes: number;
  otFormat: OtFormat;
  rollerOtFormat: OtFormat;
  shootoutRounds: ShootoutRounds;
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

function pausedModeChanged(): boolean {
  return pauseDraft !== null && pauseDraft.clockMode !== useGame.getState().clockMode;
}

function runningDraft(): PauseDraft {
  const s = useGame.getState();
  return {
    clockMode: pauseDraft?.clockMode ?? s.clockMode,
    drillTargets: pauseDraft?.drillTargets ?? s.drillTargets,
    scrimmageHome: pauseDraft?.scrimmageHome ?? s.scrimmageHomeTargets,
    scrimmageAway: pauseDraft?.scrimmageAway ?? s.scrimmageAwayTargets,
    gameMinutes: pauseDraft?.gameMinutes ?? s.gameMinutes,
    rollerMinutes: pauseDraft?.rollerMinutes ?? s.rollerMinutes,
    otFormat: pauseDraft?.otFormat ?? s.otFormat,
    rollerOtFormat: pauseDraft?.rollerOtFormat ?? s.rollerOtFormat,
    shootoutRounds: pauseDraft?.shootoutRounds ?? s.shootoutRounds,
  };
}

function writePauseDraft(next: PauseDraft): void {
  if (
    pauseDraft &&
    pauseDraft.clockMode === next.clockMode &&
    pauseDraft.drillTargets === next.drillTargets &&
    pauseDraft.scrimmageHome === next.scrimmageHome &&
    pauseDraft.scrimmageAway === next.scrimmageAway &&
    pauseDraft.gameMinutes === next.gameMinutes &&
    pauseDraft.rollerMinutes === next.rollerMinutes &&
    pauseDraft.otFormat === next.otFormat &&
    pauseDraft.rollerOtFormat === next.rollerOtFormat &&
    pauseDraft.shootoutRounds === next.shootoutRounds
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

export function previewPausedScrimmage(side: "home" | "away", n: DrillTargets): void {
  const v: DrillTargets = n === 16 ? 16 : n === 12 ? 12 : n === 8 ? 8 : 4;
  const ui = useGame.getState();
  if (!(ui.playing && ui.paused)) {
    if (side === "home") ui.setScrimmageHomeTargets(v);
    else ui.setScrimmageAwayTargets(v);
    if (useGame.getState().clockMode === "scrimmage") resetWorld();
    return;
  }
  writePauseDraft({
    ...runningDraft(),
    ...(side === "home" ? { scrimmageHome: v } : { scrimmageAway: v }),
  });
}

export function previewPausedMinutes(n: number): void {
  const minutes = clampGameMinutes(n);
  const ui = useGame.getState();
  if (!(ui.playing && ui.paused)) {
    ui.setGameMinutes(minutes);
    return;
  }
  writePauseDraft({ ...runningDraft(), gameMinutes: minutes });
}

export function previewPausedRollerMinutes(n: number): void {
  const minutes = clampRollerMinutes(n);
  const ui = useGame.getState();
  if (!(ui.playing && ui.paused)) {
    ui.setRollerMinutes(minutes);
    return;
  }
  writePauseDraft({ ...runningDraft(), rollerMinutes: minutes });
}

export function previewPausedOtFormat(v: OtFormat): void {
  const ui = useGame.getState();
  if (!(ui.playing && ui.paused)) {
    ui.setOtFormat(v);
    return;
  }
  writePauseDraft({ ...runningDraft(), otFormat: v });
}

export function previewPausedRollerOtFormat(v: OtFormat): void {
  const ui = useGame.getState();
  if (!(ui.playing && ui.paused)) {
    ui.setRollerOtFormat(v);
    return;
  }
  writePauseDraft({ ...runningDraft(), rollerOtFormat: v });
}

export function previewPausedShootoutRounds(n: ShootoutRounds): void {
  const rounds: ShootoutRounds = n === 5 ? 5 : n === 7 ? 7 : 3;
  const ui = useGame.getState();
  if (!(ui.playing && ui.paused)) {
    ui.setShootoutRounds(rounds);
    return;
  }
  writePauseDraft({ ...runningDraft(), shootoutRounds: rounds });
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
    if (draft.scrimmageHome !== ui.scrimmageHomeTargets) ui.setScrimmageHomeTargets(draft.scrimmageHome);
    if (draft.scrimmageAway !== ui.scrimmageAwayTargets) ui.setScrimmageAwayTargets(draft.scrimmageAway);
    if (draft.drillTargets !== ui.drillTargets) ui.setDrillTargets(draft.drillTargets);
    if (draft.gameMinutes !== ui.gameMinutes) ui.setGameMinutes(draft.gameMinutes);
    if (draft.rollerMinutes !== ui.rollerMinutes) ui.setRollerMinutes(draft.rollerMinutes);
    if (draft.otFormat !== ui.otFormat) ui.setOtFormat(draft.otFormat);
    if (draft.rollerOtFormat !== ui.rollerOtFormat) ui.setRollerOtFormat(draft.rollerOtFormat);
    if (draft.shootoutRounds !== ui.shootoutRounds) ui.setShootoutRounds(draft.shootoutRounds);
    if (draft.clockMode !== ui.clockMode) ui.setClockMode(draft.clockMode);
  }
  resetWorld();
  useGame.getState().setPaused(false);
}

export function beginPauseCam(prevMode: CamMode): void {
  clearPauseDraft();
  const ui = useGame.getState();
  const keepLive = prevMode === "freestyle" && ui.freeCamLive && world.freeCam.captured;
  if (!keepLive) world.freeCam.captured = false;
  world.freeCamReapply = false;
  world.pauseDirty = false;
  world.camPick = false;
  world.pauseRestoreMode = prevMode;
}

/** Enter the existing pause. Already paused, or not skating, stays as it is. */
export function pauseGame(): void {
  const ui = useGame.getState();
  if (!ui.playing || ui.paused) return;
  dropWingClaims();
  beginPauseCam(ui.camMode);
  ui.setPaused(true);
}

export function finishPauseCam(): void {
  const ui = useGame.getState();
  if (world.camPick) {
    world.camPick = false;
    if (ui.camMode === "freestyle") {
      ui.setFreeCamLive(true);
      world.freeCam.captured = true;
      world.freeCamReapply = true;
    } else {
      ui.setFreeCamLive(false);
      world.freeCamReapply = false;
    }
  } else if (world.pauseDirty) {
    ui.setCamMode("freestyle");
    ui.setFreeCamLive(true);
    world.freeCam.captured = true;
    world.freeCamReapply = true;
  } else if (world.pauseRestoreMode) {
    const mode = world.pauseRestoreMode as CamMode;
    ui.setCamMode(mode);
    if (mode === "freestyle") {
      ui.setFreeCamLive(true);
      if (world.freeCam.captured) world.freeCamReapply = true;
    } else ui.setFreeCamLive(false);
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
    if (!world.camPick && !world.replay) tickFreeCam(dt, act);
    if (act.aEdge || act.aTap) {
      resetWorld();
      ui.setPlaying(true);
      world.faceoffA = true;
    }
    return true;
  }

  if (world.periodOver) {
    const keepSkating =
      ui.clockMode === "game" || ui.clockMode === "roller" || world.shootout?.phase === "done";
    if (!keepSkating) {
      // Shootout mode ends here, before stepPlay. Keep the clock moving so the
      // winning crowd hop and the light pulse are not frozen for those 5 seconds.
      if (world.shootout) world.time += dt;
      dropWingClaims();
      world.stoppageT += dt;
      if (ui.homeScore !== ui.awayScore && !world.shootout) stepGoalCelebrate(dt);
      if (world.shootout?.phase === "done") parkShootoutBench();
      if (act.aEdge || act.aTap) {
        applyArmedCpuKitCycle();
        resetWorld();
        world.faceoffA = true;
      }
      return true;
    }
    if (act.aEdge || act.aTap) {
      dropWingClaims();
      applyArmedCpuKitCycle();
      resetWorld();
      world.faceoffA = true;
      return true;
    }
  }

  if (world.replay && act.r3Edge) {
    dropWingClaims();
    endReplay();
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
    pauseGame();
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
    if (pausedModeChanged()) startPausedNewGame();
    else resumePausedGame();
    world.faceoffA = true;
    return true;
  }
  if (act.yEdge) {
    resumePausedGame();
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
  lockDot(home, world.faceX + defendDir("home") * FACEOFF_DOT_X, world.faceZ, faceYaw("home"));
  lockDot(away, world.faceX + defendDir("away") * FACEOFF_DOT_X, world.faceZ, faceYaw("away"));
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

  // One side has nobody on the dot. The player who is there takes the puck.
  // Do not hand it to a defenseman, goalie, or anyone else off the draw.
  const lone = home && !away ? home : away && !home ? away : null;
  if (lone) {
    winFaceoff(lone);
    return;
  }

  if ((act.aEdge || act.aDown || act.aTap) && home && away) {
    if (Math.random() < 0.18) winFaceoff(away);
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
    poseEveryRef("idle");
    releaseFaceoffCenters();
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
    poseEveryRef("idle");
    releaseFaceoffCenters();
    return;
  }
  if (world.faceoffT > 0.5) {
    if (home && away) winFaceoff(away);
    else if (home) winFaceoff(home);
    else if (away) winFaceoff(away);
    else {
      world.faceoff = false;
      markPuckDrop();
      releaseFaceoffCenters();
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
  stickPull: number;
  follow: number;
  dive: number;
  stun: number;
  struck: number;
  tumble: number;
  tumbleSpin: number;
  celebrate: number;
  smash: number;
  smashKind: number;
  smashHit: number;
  gloveFlash: number;
  backskate: boolean;
  /** Who was on the ice. Playback rebuilds the roster from these, not the pause lineup. */
  side: "home" | "away";
  kind: SkaterKind;
  number: number;
  /**
   * Scored-on goalie pose on this frame. 0 none, 1 goalieRage1, 2 goalieRage2,
   * 3 goalieUpright. The live whistle is not replayed, so the phase is stored.
   */
  ragePose: number;
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
  tumbleSpin: number;
};

type ReplaySnap = {
  puck: {
    x: number;
    z: number;
    y: number;
    vx: number;
    vz: number;
    vy: number;
    owner: number | null;
  };
  userId: number;
  bodies: ReplayBody[];
  ref: ReplayRef;
  ref2: ReplayRef;
  ref3?: ReplayRef;
  ref4?: ReplayRef;
  rage: StickRage[];
  /** Post-hold faceoff frame. Trim keeps the earliest one still in the buffer. */
  ceremony?: boolean;
  /** Drill and scrimmage boards at this frame, including a card knocked loose. */
  targets?: ReplayTargets;
};

type ReplayTargets = {
  drillGone: boolean[];
  scrimmageHomeGone: boolean[];
  scrimmageAwayGone: boolean[];
  drillCards: DrillCard[];
};

const REPLAY_CAP = 1800;
const replayBuf: ReplaySnap[] = new Array(REPLAY_CAP);
let replayW = 0;
let replayN = 0;
let replayPlay: ReplaySnap[] = [];
let pauseHold: ReplaySnap | null = null;
type ReplayScrub = "lt" | "rt" | "lb" | "rb";
type ReplayLock = { kind: "free" } | { kind: "puck" } | { kind: "skater"; index: number };
let replayScrub: ReplayScrub | null = null;
let replayLock: ReplayLock = { kind: "free" };
let replayYHeld = false;
let replayYMoved = false;
/** Stick pan moved the ice X. Opening on the puck does not count. */
let replayMarkMoved = false;
let replayPanning = false;
let replayPct = 1;
const replayPctListeners = new Set<() => void>();
/** Formation edit. The ring buffer and replayPlay stay untouched. */
let replayFrameLock = false;
let replayEdit: ReplaySnap | null = null;
let replayEditBase: ReplaySnap | null = null;
let replayEditId: number | null = null;
let replayEditIndex = -1;
const replayEditListeners = new Set<() => void>();
type ReplaySkaterAdj = {
  kind: "skater";
  index: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  puck: boolean;
  px0: number;
  pz0: number;
  px1: number;
  pz1: number;
};
type ReplayMarkAdj = { kind: "mark"; x0: number; z0: number; x1: number; z1: number };
type ReplayAdj = ReplaySkaterAdj | ReplayMarkAdj;
let replayUndo: ReplayAdj[] = [];
let replayRedo: ReplayAdj[] = [];
/** Open gesture. Consecutive gestures on the same player, or the X, fold into one undo. */
let replayGesture: ReplayAdj | null = null;
/** Recorded scored-on goalie phase, keyed by skater id. 1 rage1, 2 rage2, 3 upright. */
const replayRagePose = new Map<number, number>();
/** Scoop finishes, then rage 1 and rage 2 each hold for one second. */
const GOALIE_RAGE_AT = 1.22;
const GOALIE_RAGE_HOLD = 1;
let jumboPlay: ReplaySnap[] = [];
let jumboT = 0;
let jumboOn = false;

function markPuckDrop(): void {
  // The rewind floor is the post-hold faceoff frames stored below.
  // A win calls this after clearing the faceoff, so it must not move that floor.
}

function clearReplayBuf(): void {
  replayN = 0;
  replayW = 0;
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
    tumbleSpin: r.tumbleSpin,
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
  r.tumbleSpin = snap.tumbleSpin ?? 0;
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
    stickPull: s.stickPull,
    follow: s.follow,
    dive: s.dive,
    stun: s.stun,
    struck: s.struck,
    tumble: s.tumble,
    tumbleSpin: s.tumbleSpin,
    celebrate: s.celebrate,
    smash: s.smash,
    smashKind: s.smashKind,
    smashHit: s.smashHit,
    gloveFlash: s.gloveFlash,
    backskate: s.backskate,
    side: s.side,
    kind: s.kind,
    number: s.number,
    ragePose: scoredOnGoalieRagePhase(s),
  };
}

function replayRosterKey(bodies: readonly ReplayBody[]): string | null {
  for (const b of bodies) {
    if (b.side == null || b.kind == null || b.number == null) return null;
  }
  return bodies.map((b) => `${b.side}:${b.kind}:${b.number}`).join("|");
}

/** Show the skaters this frame recorded. Later pause-screen edits stay out of the snap. */
function ensureReplayRoster(bodies: readonly ReplayBody[]): void {
  const want = replayRosterKey(bodies);
  if (want == null) return;
  const live = world.skaters.map((s) => `${s.side}:${s.kind}:${s.number}`).join("|");
  if (want === live) return;
  world.skaters = bodies.map((b, i) => makeSkater(i, b.side, b.kind, b.number, b.x, b.z));
  useGame.getState().bumpLineup();
}

function scoredOnGoalieCanRage(s: Skater): boolean {
  if (s.kind !== "goalie" || s.id === world.userId || s.smashKind > 0) return false;
  if (world.whistle !== "goal" || world.goalSide === null || world.goalSide === s.side) return false;
  for (const other of world.skaters) {
    if (other.side === s.side && other.kind !== "goalie" && other.smashKind > 0) return false;
  }
  return true;
}

/** 0 before the scoop ends, then 1, 2, and 3 for rage 1, rage 2, and upright. */
function scoredOnGoalieRagePhase(s: Skater): number {
  if (world.replay) return replayRagePose.get(s.id) ?? 0;
  if (!scoredOnGoalieCanRage(s)) return 0;
  const into = world.stoppageT - GOALIE_RAGE_AT;
  if (into < 0) return 0;
  if (into < GOALIE_RAGE_HOLD) return 1;
  if (into < GOALIE_RAGE_HOLD * 2) return 2;
  return 3;
}

/**
 * After the scoop: goalieRage1 for 1s, goalieRage2 for 1s, then goalieUpright.
 * A teammate breaking a stick holds it off. Replay reads the phase stored on that frame.
 */
export function scoredOnGoalieRagePose(s: Skater): "goalieRage1" | "goalieRage2" | "goalieUpright" | null {
  const phase = scoredOnGoalieRagePhase(s);
  if (phase === 1) return "goalieRage1";
  if (phase === 2) return "goalieRage2";
  if (phase === 3) return "goalieUpright";
  return null;
}

function snapTargets(): ReplayTargets {
  return {
    drillGone: world.drillGone.slice(),
    scrimmageHomeGone: world.scrimmageHomeGone.slice(),
    scrimmageAwayGone: world.scrimmageAwayGone.slice(),
    drillCards: world.drillCards.map((c) => ({ ...c })),
  };
}

function applyReplayTargets(snap: ReplaySnap): void {
  const t = snap.targets;
  if (!t) return;
  world.drillGone = t.drillGone.slice();
  world.scrimmageHomeGone = t.scrimmageHomeGone.slice();
  world.scrimmageAwayGone = t.scrimmageAwayGone.slice();
  world.drillCards = t.drillCards.map((c) => ({ ...c }));
}

function recordReplay(force = false): void {
  if (world.replay) return;
  // Hold and non-goal stoppages stay out so a long whistle does not fill REPLAY_CAP.
  // Every faceoff keeps lower, fake, drop, and the live beat before the win.
  if (!force && world.faceoff && world.faceoffPhase === "hold") return;
  if (!force && world.stoppage && world.whistle !== "goal" && !offsideTailLive()) return;
  const ceremony = world.faceoff && world.faceoffPhase !== "hold";
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
    ref3: snapOneRef(world.ref3),
    ref4: snapOneRef(world.ref4),
    rage: snapRage(),
    ceremony,
    targets: snapTargets(),
  };
  replayW = (replayW + 1) % REPLAY_CAP;
  if (replayN < REPLAY_CAP) replayN++;
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
  replayRagePose.clear();
  ensureReplayRoster(snap.bodies);
  const n = Math.min(snap.bodies.length, world.skaters.length);
  for (let i = 0; i < n; i++) {
    const s = world.skaters[i]!;
    const b = snap.bodies[i]!;
    if (b.ragePose) replayRagePose.set(s.id, b.ragePose);
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
    s.stickPull = b.stickPull ?? 0;
    s.follow = b.follow;
    s.dive = b.dive;
    s.stun = b.stun;
    s.struck = b.struck;
    s.tumble = b.tumble;
    s.tumbleSpin = b.tumbleSpin ?? 0;
    s.celebrate = b.celebrate;
    s.smash = b.smash ?? 0;
    s.smashKind = b.smashKind ?? 0;
    s.smashHit = b.smashHit ?? 0;
    s.gloveFlash = b.gloveFlash;
    s.backskate = b.backskate ?? false;
  }
  applyRage(snap.rage);
  applyReplayTargets(snap);
  if (snap.ref) applyOneRef(world.ref, snap.ref);
  if (snap.ref2) applyOneRef(world.ref2, snap.ref2);
  if (snap.ref3) applyOneRef(world.ref3, snap.ref3);
  if (snap.ref4) applyOneRef(world.ref4, snap.ref4);
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
  // A lowering ref is still. Keep every faceoff ceremony that is still in the buffer.
  let ceremonyAt = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i]?.ceremony) {
      ceremonyAt = i;
      break;
    }
  }
  if (ceremonyAt >= 0 && ceremonyAt < start) start = ceremonyAt;
  if (start <= 0) return raw;
  return raw.slice(start);
}

function clearReplayCamControl(): void {
  replayLock = { kind: "free" };
  replayScrub = null;
  replayYHeld = false;
  replayYMoved = false;
  replayMarkMoved = false;
  replayPanning = false;
  dropReplayEdit();
}

function publishReplayEdit(): void {
  for (const fn of replayEditListeners) fn();
}

function dropReplayEdit(): void {
  const was = replayFrameLock || replayEdit !== null;
  replayFrameLock = false;
  replayEdit = null;
  replayEditBase = null;
  replayEditId = null;
  replayEditIndex = -1;
  replayUndo = [];
  replayRedo = [];
  replayGesture = null;
  if (was) publishReplayEdit();
}

function cloneReplaySnap(snap: ReplaySnap): ReplaySnap {
  return {
    puck: { ...snap.puck },
    userId: snap.userId,
    bodies: snap.bodies.map((b) => ({ ...b })),
    ref: { ...snap.ref },
    ref2: { ...snap.ref2 },
    ref3: snap.ref3 ? { ...snap.ref3 } : undefined,
    ref4: snap.ref4 ? { ...snap.ref4 } : undefined,
    rage: snap.rage.map((rec) => ({
      id: rec.id,
      kind: rec.kind,
      blade: { ...rec.blade },
      shaft: { ...rec.shaft },
      end: rec.end,
    })),
    ceremony: snap.ceremony,
    targets: snap.targets
      ? {
          drillGone: snap.targets.drillGone.slice(),
          scrimmageHomeGone: snap.targets.scrimmageHomeGone.slice(),
          scrimmageAwayGone: snap.targets.scrimmageAwayGone.slice(),
          drillCards: snap.targets.drillCards.map((c) => ({ ...c })),
        }
      : undefined,
  };
}

function replaySpan(): number {
  return replayPlay.length > 1 ? (replayPlay.length - 1) / 60 : 0;
}

export function replayFootagePct(): number {
  return replayPct;
}

/** Jump the pause replay to a fraction of the footage. 0 is the first frame, 1 is the last. */
export function seekReplay(fraction: number): void {
  if (!world.replay || world.replayKind !== "pause" || replayFrameLock || !replayPlay.length) return;
  const u = Math.max(0, Math.min(1, fraction));
  const maxT = replaySpan();
  world.replayT = maxT * u;
  world.replayPlaying = false;
  const i = Math.min(replayPlay.length - 1, Math.max(0, Math.floor(world.replayT * 60)));
  applyReplaySnap(replayPlay[i]!);
  catchReplayMarkLock();
  applyReplayLock();
  publishReplayPct();
}

export function replayLockKind(): "free" | "puck" | "skater" {
  return replayLock.kind;
}

export function replayFrameLocked(): boolean {
  return replayFrameLock;
}

/** Skater index chosen for arrow-key edits, or null when the ice X takes the arrows. */
export function replayEditSkater(): number | null {
  return replayEditId;
}

/** Finished runs, plus a held gesture that starts a new run. */
export function replayUndoDepth(): number {
  if (!replayGesture) return replayUndo.length;
  const prev = replayUndo[replayUndo.length - 1];
  if (prev && sameReplayTarget(prev, replayGesture)) return replayUndo.length;
  return replayUndo.length + 1;
}

export function replayRedoDepth(): number {
  return replayRedo.length;
}

export function subscribeReplayEdit(listener: () => void): () => void {
  replayEditListeners.add(listener);
  return () => {
    replayEditListeners.delete(listener);
  };
}

export type ReplayFormationSide = {
  puck: { x: number; z: number; y: number; owner: number | null };
  players: { index: number; id: number; x: number; z: number }[];
};

export type ReplayFormationExport = {
  frame: number;
  time: number;
  original: ReplayFormationSide;
  adjusted: ReplayFormationSide;
};

function formationSide(snap: ReplaySnap): ReplayFormationSide {
  return {
    puck: { x: snap.puck.x, z: snap.puck.z, y: snap.puck.y, owner: snap.puck.owner },
    players: snap.bodies.map((b, index) => ({
      index,
      id: world.skaters[index]?.id ?? index,
      x: b.x,
      z: b.z,
    })),
  };
}

/** Locked-frame positions. Null until the frame is locked. */
export function exportReplayFrame(): ReplayFormationExport | null {
  if (!replayFrameLock || !replayEdit || !replayEditBase) return null;
  return {
    frame: replayEditIndex,
    time: world.replayT,
    original: formationSide(replayEditBase),
    adjusted: formationSide(replayEdit),
  };
}

/** Freeze the current pause-replay frame, or release it and show the buffer frame again. */
export function toggleReplayFrameLock(): boolean {
  if (!world.replay || world.replayKind !== "pause" || !replayPlay.length) {
    if (replayFrameLock) unlockReplayFrame();
    return false;
  }
  if (replayFrameLock) {
    unlockReplayFrame();
    return false;
  }
  const i = Math.min(replayPlay.length - 1, Math.max(0, Math.floor(world.replayT * 60)));
  const snap = replayPlay[i];
  if (!snap) return false;
  replayEditBase = cloneReplaySnap(snap);
  replayEdit = cloneReplaySnap(snap);
  replayEditIndex = i;
  replayEditId = null;
  replayFrameLock = true;
  world.replayPlaying = false;
  publishReplayEdit();
  return true;
}

function unlockReplayFrame(): void {
  dropReplayEdit();
  if (!world.replay || !replayPlay.length) return;
  const i = Math.min(replayPlay.length - 1, Math.max(0, Math.floor(world.replayT * 60)));
  const snap = replayPlay[i];
  if (snap) applyReplaySnap(snap);
  applyReplayLock();
}

export function subscribeReplayPct(listener: () => void): () => void {
  replayPctListeners.add(listener);
  return () => {
    replayPctListeners.delete(listener);
  };
}

function publishReplayPct(): void {
  const span = replaySpan();
  const next = span <= 1e-8 ? 1 : Math.max(0, Math.min(1, world.replayT / span));
  const q = Math.round(next * 1000) / 1000;
  if (q === replayPct) return;
  replayPct = q;
  for (const fn of replayPctListeners) fn();
}

function endReplay(): void {
  const kind = world.replayKind;
  replayRagePose.clear();
  world.replay = false;
  world.replayT = 0;
  world.replayKind = null;
  world.replayHardCut = false;
  replayPlay = [];
  clearReplayCamControl();
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

function cycleReplayLock(): void {
  if (replayLock.kind === "free") {
    replayLock = { kind: "puck" };
    return;
  }
  if (replayLock.kind === "puck") {
    replayLock = world.skaters.length ? { kind: "skater", index: 0 } : { kind: "free" };
    return;
  }
  const next = replayLock.index + 1;
  replayLock = next < world.skaters.length ? { kind: "skater", index: next } : { kind: "free" };
}

function applyReplayLock(): void {
  const cam = world.replayCam;
  if (replayLock.kind === "free") return;
  if (replayLock.kind === "puck") {
    cam.lx = world.puck.x;
    cam.lz = world.puck.z;
    cam.ly = Math.max(0.4, world.puck.y);
    return;
  }
  const s = world.skaters[replayLock.index];
  if (!s) {
    replayLock = { kind: "free" };
    return;
  }
  cam.lx = s.x;
  cam.lz = s.z;
  cam.ly = 1.05;
}

/**
 * Ice X locks when its center is this close to a hip or the puck.
 * The marker itself reaches about 0.44 m, and one full stick step moves it
 * about 0.21 m, so 0.18 m was easy to pan across. 0.45 m is that reach.
 * Touching skaters stay at least about 0.84 m apart, so the closer body wins
 * and a neighbor outside this circle is not locked.
 */
const REPLAY_MARK_LOCK = 0.45;
/** Wider catch while a frame is locked, so a nearby player is easier to land on. */
const REPLAY_MARK_LOCK_EDIT = 0.85;
/** Replay camera fov in CameraRig. Click rays use the same angle. */
const REPLAY_PICK_FOV = (46 * Math.PI) / 180;
const REPLAY_PICK_PUCK = 0.09;
const REPLAY_PICK_PUCK_EDIT = 0.22;
const REPLAY_PICK_HIP = 0.28;
const REPLAY_PICK_HIP_EDIT = 0.55;
/** Added to the skater radius for the upright click column while a frame is locked. */
const REPLAY_PICK_BODY_EXTRA = 0.35;
/** Arrow-key slide of a selected player or the ice X, metres per second. */
const REPLAY_EDIT_SPEED = 4;

function replayMarkRadius(): number {
  return replayFrameLock ? REPLAY_MARK_LOCK_EDIT : REPLAY_MARK_LOCK;
}

function skaterCom(s: Skater): { x: number; z: number } {
  return {
    x: Number.isFinite(s.comX) ? s.comX : s.x,
    z: Number.isFinite(s.comZ) ? s.comZ : s.z,
  };
}

function replayMarkHit(x: number, z: number): ReplayLock | null {
  let best: ReplayLock | null = null;
  let bestD = replayMarkRadius();
  const puckD = Math.hypot(world.puck.x - x, world.puck.z - z);
  if (puckD <= bestD) {
    best = { kind: "puck" };
    bestD = puckD;
  }
  for (let i = 0; i < world.skaters.length; i++) {
    const s = world.skaters[i]!;
    const c = skaterCom(s);
    const d = Math.hypot(c.x - x, c.z - z);
    if (d <= bestD) {
      best = { kind: "skater", index: i };
      bestD = d;
    }
  }
  return best;
}

/** After the stick pan is released, an X sitting on a center of mass locks there. */
function catchReplayMarkLock(): void {
  if (!replayMarkMoved || replayPanning) return;
  const hit = replayMarkHit(world.replayCam.lx, world.replayCam.lz);
  if (!hit) return;
  replayLock = hit;
  replayMarkMoved = false;
}

function raySphereT(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): number | null {
  const fx = ox - cx;
  const fy = oy - cy;
  const fz = oz - cz;
  const b = fx * dx + fy * dy + fz * dz;
  const c = fx * fx + fy * fy + fz * fz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = -b - s;
  if (t0 >= 0) return t0;
  const t1 = -b + s;
  return t1 >= 0 ? t1 : null;
}

/** Upright body column. y is limited to the torso, so an ice click beside the skates misses. */
function rayColumnT(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number,
  y0: number,
  y1: number,
): number | null {
  const fx = ox - cx;
  const fz = oz - cz;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const hitY = (t: number) => {
    if (t < 0) return false;
    const y = oy + dy * t;
    return y >= y0 && y <= y1;
  };
  if (a < 1e-8) {
    if (c > 0) return null;
    if (Math.abs(dy) < 1e-8) return oy >= y0 && oy <= y1 ? 0 : null;
    const t0 = (y0 - oy) / dy;
    const t1 = (y1 - oy) / dy;
    const near = Math.min(t0, t1);
    const far = Math.max(t0, t1);
    if (near >= 0) return near;
    return far >= 0 ? far : null;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const tA = (-b - s) / (2 * a);
  const tB = (-b + s) / (2 * a);
  if (hitY(tA)) return tA;
  if (hitY(tB)) return tB;
  return null;
}

function replayPickRay(
  ndcX: number,
  ndcY: number,
  aspect: number,
): { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number } | null {
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY) || !(aspect > 0)) return null;
  const rc = world.replayCam;
  const sp = Math.sin(rc.phi);
  const cp = Math.cos(rc.phi);
  const ox = rc.lx + rc.radius * sp * Math.cos(rc.theta);
  const oy = rc.ly + rc.radius * cp;
  const oz = rc.lz + rc.radius * sp * Math.sin(rc.theta);
  let fx = rc.lx - ox;
  let fy = rc.ly - oy;
  let fz = rc.lz - oz;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let rx = -fz;
  let ry = 0;
  let rz = fx;
  let rl = Math.hypot(rx, rz);
  if (rl < 1e-4) {
    rx = 1;
    rz = 0;
    rl = 1;
  }
  rx /= rl;
  rz /= rl;
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const tan = Math.tan(REPLAY_PICK_FOV / 2);
  const sx = ndcX * tan * aspect;
  const sy = ndcY * tan;
  let dx = fx + rx * sx + ux * sy;
  let dy = fy + ry * sy + uy * sy;
  let dz = fz + rz * sx + uz * sy;
  const dl = Math.hypot(dx, dy, dz) || 1;
  return { ox, oy, oz, dx: dx / dl, dy: dy / dl, dz: dz / dl };
}

function replayRayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): ReplayLock | null {
  let best: ReplayLock | null = null;
  let bestT = Infinity;
  const puckR = replayFrameLock ? REPLAY_PICK_PUCK_EDIT : REPLAY_PICK_PUCK;
  const hipR = replayFrameLock ? REPLAY_PICK_HIP_EDIT : REPLAY_PICK_HIP;
  const bodyExtra = replayFrameLock ? REPLAY_PICK_BODY_EXTRA : 0;
  const puckT = raySphereT(ox, oy, oz, dx, dy, dz, world.puck.x, world.puck.y, world.puck.z, puckR);
  if (puckT !== null && puckT < bestT) {
    best = { kind: "puck" };
    bestT = puckT;
  }
  for (let i = 0; i < world.skaters.length; i++) {
    const s = world.skaters[i]!;
    const column = rayColumnT(ox, oy, oz, dx, dy, dz, s.x, s.z, s.radius + bodyExtra, 0.2, 1.8);
    const com = skaterCom(s);
    const hip = rayColumnT(ox, oy, oz, dx, dy, dz, com.x, com.z, hipR, 0.35, 1.55);
    const t = column === null ? hip : hip === null ? column : Math.min(column, hip);
    if (t !== null && t < bestT) {
      best = { kind: "skater", index: i };
      bestT = t;
    }
  }
  return best;
}

/** Click during pause replay. A hit on a body or the puck locks the ice X there. */
export function pickReplayLock(ndcX: number, ndcY: number, aspect: number): void {
  if (!world.replay || world.replayKind !== "pause") return;
  const ray = replayPickRay(ndcX, ndcY, aspect);
  if (!ray) return;
  const hit = replayRayHit(ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz);
  if (replayFrameLock) {
    if (hit?.kind === "skater") {
      replayEditId = hit.index;
      replayLock = hit;
      replayMarkMoved = false;
      applyReplayLock();
      publishReplayEdit();
      return;
    }
    const had = replayEditId !== null;
    replayEditId = null;
    if (had) publishReplayEdit();
    replayMarkMoved = false;
    if (hit?.kind === "puck") {
      replayLock = hit;
      applyReplayLock();
      return;
    }
    replayLock = { kind: "free" };
    return;
  }
  if (!hit) return;
  replayLock = hit;
  replayMarkMoved = false;
  applyReplayLock();
}

export function beginPauseReplay(): boolean {
  if (world.replay || replayN < 12) return false;
  const raw = trimReplayDead(dumpReplayBuf());
  const last = raw[raw.length - 1];
  if (!last) return false;
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
    ref3: snapOneRef(world.ref3),
    ref4: snapOneRef(world.ref4),
    rage: snapRage(),
    targets: snapTargets(),
  };
  replayPlay = raw;
  world.replay = true;
  world.replayKind = "pause";
  world.replayHardCut = true;
  world.replayPlaying = true;
  world.replayT = replaySpan();
  world.replayNet = last.puck.x >= 0 ? 1 : -1;
  applyReplaySnap(last);
  seedPauseReplayCam();
  clearReplayCamControl();
  publishReplayPct();
  useGame.getState().setReplay(true);
  return true;
}

export function rewindPauseReplay(): void {
  if (world.replayKind !== "pause" || replayFrameLock) return;
  world.replayT = Math.max(0, world.replayT - 2);
  world.replayHardCut = true;
  const i = Math.min(replayPlay.length - 1, Math.floor(world.replayT * 60));
  if (replayPlay[i]) applyReplaySnap(replayPlay[i]!);
  applyReplayLock();
  publishReplayPct();
}

export function stopPauseReplay(): void {
  if (world.replayKind !== "pause") return;
  endReplay();
}

const REPLAY_STICK_GATE = 0.12;

/** Left stick past the same rest gate as replay pan. A pad that sits just off center is not a move. */
function replayStickLive(act: Actions): boolean {
  return !act.yDown && Math.hypot(act.stickX, act.stickY) > REPLAY_STICK_GATE;
}
const REPLAY_PHI_MIN = 0.12;
const REPLAY_PHI_MAX = 1.45;
const REPLAY_RADIUS_MIN = 4.2;
const REPLAY_RADIUS_MAX = 120;

/**
 * Mouse orbit during pause replay. Gains match PauseOrbit on freeCam.
 * Replay theta 0 sits on +X (pause theta 0 sits on +Z), so drag-right
 * increases theta and the camera still moves toward screen-left.
 * Drag-down (dy > 0) decreases phi, so the camera rises.
 */
export function orbitReplayPointer(dx: number, dy: number): void {
  const cam = world.replayCam;
  cam.theta += dx * 0.008;
  cam.phi = Math.max(REPLAY_PHI_MIN, Math.min(REPLAY_PHI_MAX, cam.phi - dy * 0.006));
}

/** Wheel zoom during pause replay. deltaY sign and gain match PauseOrbit. */
export function zoomReplayPointer(deltaY: number): void {
  const cam = world.replayCam;
  cam.radius = Math.max(REPLAY_RADIUS_MIN, Math.min(REPLAY_RADIUS_MAX, cam.radius + deltaY * 0.02));
}

function tickPauseReplayCam(dt: number, act: Actions): void {
  const cam = world.replayCam;
  // Arrows and the left stick edit the locked frame. Both also sit on moveX and moveY.
  // Y held keeps the stick on the orbit. Arrows still edit.
  const stickEdit = replayStickLive(act);
  const editing = replayFrameLock && (act.arrowX !== 0 || act.arrowY !== 0 || stickEdit);
  const mag = editing ? 0 : Math.hypot(act.moveX, act.moveY);
  if (editing) {
    if (act.yDown) replayYMoved = true;
  } else if (act.yDown) {
    if (mag > REPLAY_STICK_GATE) replayYMoved = true;
    if (replayYMoved) {
      cam.theta += act.moveX * 1.85 * dt;
      cam.phi = Math.max(REPLAY_PHI_MIN, Math.min(REPLAY_PHI_MAX, cam.phi - act.moveY * 1.25 * dt));
    }
  } else {
    if (replayYHeld && !replayYMoved) cycleReplayLock();
    replayYMoved = false;
    if (mag > REPLAY_STICK_GATE) {
      replayLock = { kind: "free" };
      const k = cam.radius * 0.9 * dt;
      // moveX > 0 pans along the replay camera's right (camRx, camRz).
      const dx = world.camRx * act.moveX + world.camFx * act.moveY;
      const dz = world.camRz * act.moveX + world.camFz * act.moveY;
      if (Number.isFinite(dx) && Number.isFinite(dz)) {
        cam.lx += dx * k;
        cam.lz += dz * k;
        replayMarkMoved = true;
      }
    }
  }
  replayPanning = !editing && !act.yDown && mag > REPLAY_STICK_GATE;
  replayYHeld = act.yDown;
  if (act.zoomIn || act.xDown) cam.radius = Math.max(REPLAY_RADIUS_MIN, cam.radius - 18 * dt);
  if (act.zoomOut || act.bDown) cam.radius = Math.min(REPLAY_RADIUS_MAX, cam.radius + 18 * dt);
}

/**
 * Locked-frame step on the ice, in the camera basis writeCamBasis already stored.
 * Up with camFx 1 and camFz 0 is world +X. Right with camRx 0 and camRz 1 is world +Z.
 * Arrows are a full step. The left stick uses that same full step at full deflection.
 */
function replayArrowDelta(dt: number, act: Actions): { dx: number; dz: number } | null {
  const arrows = act.arrowX !== 0 || act.arrowY !== 0;
  const live = replayStickLive(act);
  const sx = live ? act.stickX : 0;
  const sy = live ? act.stickY : 0;
  const x = act.arrowX + sx;
  const y = act.arrowY + sy;
  if (x === 0 && y === 0) return null;
  const dx = world.camRx * x + world.camFx * y;
  const dz = world.camRz * x + world.camFz * y;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null;
  const planar = Math.hypot(dx, dz);
  if (planar < 1e-8) return null;
  const weight = arrows ? 1 : Math.min(1, Math.hypot(sx, sy));
  const scale = (REPLAY_EDIT_SPEED * weight * dt) / planar;
  return { dx: dx * scale, dz: dz * scale };
}

function replayAdjMoved(g: ReplayAdj): boolean {
  if (g.x0 !== g.x1 || g.z0 !== g.z1) return true;
  return g.kind === "skater" && g.puck && (g.px0 !== g.px1 || g.pz0 !== g.pz1);
}

function sameReplayTarget(a: ReplayAdj, b: ReplayAdj): boolean {
  if (a.kind === "mark" && b.kind === "mark") return true;
  return a.kind === "skater" && b.kind === "skater" && a.index === b.index;
}

function closeReplayGesture(): void {
  const g = replayGesture;
  if (!g) return;
  replayGesture = null;
  if (!replayAdjMoved(g)) {
    publishReplayEdit();
    return;
  }
  const prev = replayUndo[replayUndo.length - 1];
  if (prev && sameReplayTarget(prev, g)) {
    prev.x1 = g.x1;
    prev.z1 = g.z1;
    if (prev.kind === "skater" && g.kind === "skater") {
      prev.px1 = g.px1;
      prev.pz1 = g.pz1;
      if (g.puck) prev.puck = true;
    }
  } else {
    replayUndo.push(g);
  }
  publishReplayEdit();
}

function openReplayGesture(next: ReplayAdj): void {
  const g = replayGesture;
  if (g?.kind === "mark" && next.kind === "mark") return;
  if (g?.kind === "skater" && next.kind === "skater" && g.index === next.index) return;
  closeReplayGesture();
  replayRedo.length = 0;
  replayGesture = next;
  publishReplayEdit();
}

function syncReplayGesture(): void {
  const g = replayGesture;
  const edit = replayEdit;
  if (!g || !edit) return;
  if (g.kind === "mark") {
    g.x1 = world.replayCam.lx;
    g.z1 = world.replayCam.lz;
    return;
  }
  const body = edit.bodies[g.index];
  if (!body) return;
  g.x1 = body.x;
  g.z1 = body.z;
  if (g.puck) {
    g.px1 = edit.puck.x;
    g.pz1 = edit.puck.z;
  }
}

function applyReplayAdj(g: ReplayAdj, dir: 0 | 1): void {
  const edit = replayEdit;
  if (!edit) return;
  if (g.kind === "mark") {
    world.replayCam.lx = dir ? g.x1 : g.x0;
    world.replayCam.lz = dir ? g.z1 : g.z0;
    replayLock = { kind: "free" };
    return;
  }
  const body = edit.bodies[g.index];
  if (!body) return;
  body.x = dir ? g.x1 : g.x0;
  body.z = dir ? g.z1 : g.z0;
  if (g.puck) {
    edit.puck.x = dir ? g.px1 : g.px0;
    edit.puck.z = dir ? g.pz1 : g.pz0;
  }
}

export function undoReplayEdit(): void {
  if (!replayFrameLock || !replayEdit) return;
  closeReplayGesture();
  const g = replayUndo.pop();
  if (!g) return;
  applyReplayAdj(g, 0);
  replayRedo.push(g);
  applyReplaySnap(replayEdit);
  applyReplayLock();
  publishReplayEdit();
}

export function redoReplayEdit(): void {
  if (!replayFrameLock || !replayEdit) return;
  closeReplayGesture();
  const g = replayRedo.pop();
  if (!g) return;
  applyReplayAdj(g, 1);
  replayUndo.push(g);
  applyReplaySnap(replayEdit);
  applyReplayLock();
  publishReplayEdit();
}

function nudgeReplayEdit(dt: number, act: Actions): void {
  const edit = replayEdit;
  if (!edit) return;
  const step = replayArrowDelta(dt, act);
  if (!step) {
    closeReplayGesture();
    return;
  }
  // A stick pan that is still "moved" would catch on this step, because arrows
  // are not a pan. That catch snaps the X onto a nearby body and eats the nudge.
  replayMarkMoved = false;
  if (replayEditId === null) {
    openReplayGesture({
      kind: "mark",
      x0: world.replayCam.lx,
      z0: world.replayCam.lz,
      x1: world.replayCam.lx,
      z1: world.replayCam.lz,
    });
    replayLock = { kind: "free" };
    world.replayCam.lx += step.dx;
    world.replayCam.lz += step.dz;
    syncReplayGesture();
    return;
  }
  const body = edit.bodies[replayEditId];
  if (!body) {
    replayEditId = null;
    publishReplayEdit();
    return;
  }
  const ownerId = world.skaters[replayEditId]?.id;
  const puck = ownerId !== undefined && edit.puck.owner === ownerId;
  openReplayGesture({
    kind: "skater",
    index: replayEditId,
    x0: body.x,
    z0: body.z,
    x1: body.x,
    z1: body.z,
    puck,
    px0: edit.puck.x,
    pz0: edit.puck.z,
    px1: edit.puck.x,
    pz1: edit.puck.z,
  });
  body.x += step.dx;
  body.z += step.dz;
  if (puck) {
    edit.puck.x += step.dx;
    edit.puck.z += step.dz;
  }
  syncReplayGesture();
}

function replayScrubNow(act: Actions): ReplayScrub | null {
  if (act.ltDown) return "lt";
  if (act.rtDown) return "rt";
  if (act.lbDown) return "lb";
  if (act.rbDown) return "rb";
  return null;
}

function pauseReplayRate(act: Actions): number {
  const scrub = replayScrubNow(act);
  if (replayScrub && replayScrub !== scrub && replayScrub !== "rt") world.replayPlaying = false;
  replayScrub = scrub;
  if (scrub === "lt") return -3.4;
  if (scrub === "rt") return 3.4;
  if (scrub === "lb") return -0.28;
  if (scrub === "rb") return 0.28;
  return world.replayPlaying ? 1 : 0;
}

function stepReplay(dt: number, act: Actions): void {
  if (!replayPlay.length) {
    endReplay();
    return;
  }
  if (world.replayKind === "pause") {
    if (act.viewPress || act.r3Edge) {
      endReplay();
      return;
    }
    if (!replayFrameLock && act.aEdge) world.replayPlaying = !world.replayPlaying;
    tickPauseReplayCam(dt, act);
    if (!replayFrameLock) {
      const rate = pauseReplayRate(act);
      const maxT = replaySpan();
      world.replayT = Math.max(0, Math.min(maxT, world.replayT + dt * rate));
    }
    if (replayFrameLock && replayEdit) {
      nudgeReplayEdit(dt, act);
      applyReplaySnap(replayEdit);
    } else {
      const i = Math.min(replayPlay.length - 1, Math.floor(world.replayT * 60));
      applyReplaySnap(replayPlay[i]!);
    }
    catchReplayMarkLock();
    applyReplayLock();
    publishReplayPct();
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
  if (!g || g.smashKind > 0) return;
  const t = world.stoppageT;
  const puck = world.puck;
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
    const netSide = (defendDir(g.side) >= 0 ? 1 : -1) as 1 | -1;
    const inNet = inCageVolume(puck.x, puck.z, Math.max(puck.y, 0), netSide);
    const reach = Math.hypot(puck.x - g.x, puck.z - g.z);
    // The shove picks up a puck in the net or already at the glove. It does not
    // teleport one that has bounced out to the faceoff dot.
    if (!inNet && reach > 2.35) return;
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
    return;
  }
  // Cover is updateCoverPose's. A floor in (0.08, 0.35) skipped every named
  // stance and left the procedural splay, which is not a saved pose.
  keepGoalieOffNet(g, true);
  const spot = goalieCreasePoint(g);
  const dx = spot.x - g.x;
  const dz = spot.z - g.z;
  const d = Math.hypot(dx, dz) || 1;
  integrateSkater(g, dx / d, dz / d, Math.min(0.72, d / 2.2), false, dt);
  g.yaw = turnToward(g.yaw, -Math.sin(faceYaw(g.side)), -Math.cos(faceYaw(g.side)), 5, dt);
}

function stepGoalPuck(dt: number): void {
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
  holdMeshRest();
  bouncePuckCage(puck, prevX, prevZ, prevY);
  containPuckBoards(puck);
  holdMeshRest();
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
  /** Goal-line sign the smash aims at. Unset uses the skater's own net. */
  end?: 1 | -1;
};

let stickRages: StickRage[] = [];
type GoalRefCheck = { id: number; ref: Referee; done: boolean };
let goalRefChecks: GoalRefCheck[] = [];
let goalieRageId: number | null = null;
let goalieRageArmed = false;
let goalRageHold: "home" | "away" | null = null;
/** Ice spot of the puck when the offside whistle blew. The camera stays there. */
let offsideLook: { x: number; z: number } | null = null;

function clearGoalReactions(): void {
  stickRages = [];
  goalRefChecks = [];
  goalieRageId = null;
  goalieRageArmed = false;
  goalRageHold = null;
  offsideLook = null;
}

function goalReactionLive(): boolean {
  return stickRages.length > 0 || goalRefChecks.length > 0 || goalieRageId !== null;
}

function goalReactionSettled(): boolean {
  for (const rec of stickRages) {
    const s = world.skaters[rec.id];
    if (s && s.smashHit <= 0) return false;
  }
  for (const job of goalRefChecks) {
    if (!job.done) return false;
  }
  if (goalieRageId !== null) {
    const g = world.skaters[goalieRageId];
    if (!goalieRageArmed || !g || g.smashHit <= 0) return false;
  }
  return true;
}

function goalStoppageLimit(): number {
  if (cpuScrimmageWatch && world.whistle === "goal") return 0;
  if (world.whistle === "goal") return 4;
  if (world.whistle === "offside") return 1.25;
  return 3.2;
}

function goalRageBusy(id: number): boolean {
  if (goalieRageArmed && goalieRageId === id) return true;
  for (const rec of stickRages) if (rec.id === id) return true;
  for (const job of goalRefChecks) if (job.id === id) return true;
  return false;
}

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

function rageSpot(
  kind: number,
  sideSign: number,
): { x: number; y: number; z: number; sx: number; sz: number } {
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

function snapRage(): StickRage[] {
  return stickRages.map((rec) => ({
    id: rec.id,
    kind: rec.kind,
    blade: { ...rec.blade },
    shaft: { ...rec.shaft },
    end: rec.end,
  }));
}

function applyRage(r: StickRage[] | StickRage | null | undefined): void {
  if (!r) {
    stickRages = [];
    return;
  }
  const list = Array.isArray(r) ? r : [r];
  stickRages = list.map((rec) => ({
    id: rec.id,
    kind: rec.kind,
    blade: { ...rec.blade },
    shaft: { ...rec.shaft },
    end: rec.end,
  }));
}

/** Still stick-smash for the pose gallery. The skater's smash fields are already set. */
export function armStickRage(id: number): void {
  const s = world.skaters[id];
  if (!s || s.kind === "goalie" || s.smashKind <= 0) {
    stickRages = [];
    return;
  }
  stickRages = [{ id, kind: s.smashKind, blade: blankPiece(), shaft: blankPiece() }];
}

/** Crossbar or post the rage stick aims at. Kind 1 is the bar. */
export function rageIron(kind: number, side: "home" | "away"): { x: number; y: number; z: number } {
  const iron = rageSpot(kind <= 0 ? 1 : kind, defendDir(side));
  return { x: iron.x, y: iron.y, z: iron.z };
}

let rageGizmoDrag = false;

/** Pose-editor gizmo drag. The rage preview pauses so the wind-up still can be edited. */
export function setRageGizmoDrag(on: boolean): void {
  rageGizmoDrag = on;
}

export function rageGizmoDragOn(): boolean {
  return rageGizmoDrag;
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
  const rec = stickRages.find((one) => one.id === id);
  if (!rec) return null;
  const s = world.skaters[id];
  if (!s || s.kind === "goalie" || s.smashKind <= 0) return null;
  const iron = rageSpot(s.smashKind, rageEnd(s));
  const hit = s.smashHit > 0 ? s.smashHit : 0;
  return {
    t: s.smash,
    hit,
    toss: hit > 0 ? hit + 0.4 : 0,
    bar: s.smashKind === 1,
    ironX: iron.x,
    ironY: iron.y,
    ironZ: iron.z,
    blade: rec.blade,
    shaft: rec.shaft,
  };
}

function silenceForRage(s: Skater): void {
  s.celebrate = 0;
  s.windup = 0;
  s.follow = 0;
  s.poke = 0;
  s.deke = 0;
  s.hit = 0;
  s.stun = 0;
  s.struck = 0;
  s.dive = 0;
  s.tumble = 0;
  s.tumbleSpin = 0;
  s.coverPose = 0;
}

function armSkaterRage(s: Skater, kind: number): void {
  silenceForRage(s);
  s.smashKind = kind;
  s.smash = 0;
  // Same phase clock as the gallery. Contact is 0.7 s, not "when they arrive".
  s.smashHit = 0.7;
  stickRages.push({ id: s.id, kind, blade: blankPiece(), shaft: blankPiece() });
}

/** Net sign stored on a user smash. CPU rages keep defendDir. */
function rageEnd(s: Skater): number {
  const rec = stickRages.find((one) => one.id === s.id);
  return rec?.end === 1 || rec?.end === -1 ? rec.end : defendDir(s.side);
}

const USER_RAGE_REACH = 2;
/** A shorter B press still skips the goal whistle. A hold is the burst. */
const GOAL_B_TAP = 0.2;
let goalBHold = 0;

function segDist(x: number, z: number, x1: number, z1: number, x2: number, z2: number): number {
  const vx = x2 - x1;
  const vz = z2 - z1;
  const len2 = vx * vx + vz * vz || 1;
  let t = ((x - x1) * vx + (z - z1) * vz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(x - (x1 + vx * t), z - (z1 + vz * t));
}

/** Nearest post or crossbar on either net, in the ice plane. */
function nearestIron(x: number, z: number): { end: 1 | -1; kind: number; d: number } | null {
  let best: { end: 1 | -1; kind: number; d: number } | null = null;
  const hw = GOAL_W / 2;
  for (const end of [1, -1] as const) {
    const mouth = end * GOAL_LINE_X;
    for (const [kind, pz] of [
      [2, hw],
      [3, -hw],
    ] as const) {
      const d = Math.hypot(x - mouth, z - pz);
      if (!best || d < best.d) best = { end, kind, d };
    }
    const bar = segDist(x, z, mouth, -hw, mouth, hw);
    if (!best || bar < best.d - 0.05) best = { end, kind: 1, d: bar };
  }
  return best;
}

function clearOtherStickBreaks(keepId: number): void {
  stickRages = stickRages.filter((rec) => {
    if (rec.id === keepId) return true;
    const s = world.skaters[rec.id];
    if (s) {
      s.smashKind = 0;
      s.smash = 0;
      s.smashHit = 0;
    }
    return false;
  });
  if (goalieRageId !== null && goalieRageId !== keepId) {
    const g = world.skaters[goalieRageId];
    if (g) {
      g.smashKind = 0;
      g.smash = 0;
      g.smashHit = 0;
    }
    goalieRageId = null;
    goalieRageArmed = false;
  }
}

/** X during a goal whistle, within USER_RAGE_REACH of a post or the bar. A home goal does not arm it. */
function tryUserGoalRage(user: Skater): void {
  if (world.whistle !== "goal" || world.goalSide === "home" || user.smashKind > 0 || heldBody(user.id)) return;
  const iron = nearestIron(user.x, user.z);
  if (!iron || iron.d > USER_RAGE_REACH) return;
  clearOtherStickBreaks(user.id);
  armSkaterRage(user, user.kind === "goalie" ? 1 : iron.kind);
  const rec = stickRages.find((one) => one.id === user.id);
  if (rec) rec.end = iron.end;
}

function stepGoalWhistleRage(user: Skater, act: Actions): boolean {
  if (world.whistle !== "goal") return false;
  if (user.smashKind <= 0) {
    if (!act.xEdge) return false;
    tryUserGoalRage(user);
  }
  if (user.smashKind <= 0) return false;
  return checkedCyclePose(user.struck, user.tumble) !== null;
}

/** Same dive as live play. RT, or RB on Wings. Goalies stay up. */
function stepGoalWhistleDive(user: Skater, act: Actions): void {
  if (user.kind === "goalie") return;
  const wings = useGame.getState().controlProfile === "wings";
  const diveDown = wings ? act.rbDown : act.rtDown;
  const diveEdge = wings ? act.rbEdge : act.rtEdge;
  if (diveEdge && world.puck.owner !== user.id && user.dive <= 0) {
    user.poke = 0.52;
    user.dive = 1.5;
  } else if (user.dive > 1 && !diveDown) user.dive = 0.95;
}

function rageKindFor(s: Skater, n: number): number {
  const post = s.z >= 0 ? 2 : 3;
  const other = post === 2 ? 3 : 2;
  if (n % 3 === 2) return 1;
  return n % 2 === 0 ? post : other;
}

function nearestOpenRef(s: Skater, taken: Set<Referee>): Referee | null {
  let best: Referee | null = null;
  let bestD = Infinity;
  for (const r of refsOnIce()) {
    if (taken.has(r) || r.struck > 0.45) continue;
    const d = Math.hypot(r.x - s.x, r.z - s.z);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

function beginGoalReactions(scoredOn: "home" | "away"): void {
  const kept = stickRages.filter((rec) => {
    const s = world.skaters[rec.id];
    return !!s && s.id === world.userId && s.side === scoredOn;
  });
  clearGoalReactions();
  stickRages = kept;
  for (const s of world.skaters) {
    if (s.side === scoredOn) continue;
    s.smashKind = 0;
    s.smash = 0;
    s.smashHit = 0;
  }
  const userId = world.userId;
  const eligible = (s: Skater) =>
    s.side === scoredOn && s.id !== userId && s.tumble === 0 && s.struck <= 0.45 && !heldBody(s.id);
  const mouth = defendDir(scoredOn) * GOAL_LINE_X;
  const skaters = world.skaters
    .filter((s) => s.kind !== "goalie" && eligible(s))
    .sort((a, b) => Math.hypot(a.x - mouth, a.z) - Math.hypot(b.x - mouth, b.z));
  const userBreaking = kept.length > 0;
  const breaker = userBreaking ? undefined : skaters[0];
  // The scored-on goalie is not armed. A static goalieRage1 still, if one shows, is the named pose.
  if (breaker) armSkaterRage(breaker, rageKindFor(breaker, 0));
  const canCheck = useGame.getState().checkRefs && refsOnIce().some((r) => r.struck <= 0.45);
  if (!canCheck) return;
  const checker = skaters.find((s) => s !== breaker);
  if (!checker) return;
  const ref = nearestOpenRef(checker, new Set());
  if (!ref) return;
  silenceForRage(checker);
  goalRefChecks.push({ id: checker.id, ref, done: false });
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

function stepRageApproach(s: Skater, dt: number): void {
  // A check has to play out. The rage steer used to keep running, and the
  // stoppage loop skips these bodies, so struck never fell and the next check missed.
  if (checkedCyclePose(s.struck, s.tumble)) {
    if (s.kind === "goalie") decayGoalieDown(s, dt);
    else {
      if (s.stun > 0) s.stun = Math.max(0, s.stun - dt);
      if (s.struck > 0) s.struck = Math.max(0, s.struck - dt);
      syncCheckCycle(s);
    }
    s.vx *= Math.exp(-3 * dt);
    s.vz *= Math.exp(-3 * dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    return;
  }
  s.smash += dt;
  s.poke = 0;
  s.windup = 0;
  s.follow = 0;
  const iron = rageSpot(s.smashKind, rageEnd(s));
  const dx = iron.sx - s.x;
  const dz = iron.sz - s.z;
  const d = Math.hypot(dx, dz) || 1;
  const goalie = s.kind === "goalie";
  const near = goalie ? 0.75 : 0.42;
  const late = goalie ? 0.85 : 1.7;
  const lateD = goalie ? 1.2 : 0.95;
  if (s.smashHit <= 0 && (d < near || (s.smash > late && d < lateD))) {
    s.smashHit = Math.max(0.8, s.smash + 0.52);
  }
  const hold = goalie ? 0.55 : 0.32;
  if (d > hold && (s.smashHit <= 0 || s.smash < s.smashHit)) {
    integrateSkater(s, dx / d, dz / d, 1, false, dt);
  } else {
    s.vx *= Math.exp(-8 * dt);
    s.vz *= Math.exp(-8 * dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    collideSkater(s);
    stepStride(s, dt, Math.hypot(s.vx, s.vz));
  }
  s.yaw = turnToward(s.yaw, iron.x - s.x, iron.z - s.z, 12, dt);
}

function launchRagePieces(s: Skater, rec: StickRage): void {
  const iron = rageSpot(s.smashKind, rageEnd(s));
  const hand = rageHand(s);
  const bdx = hand.x - iron.x;
  const bdy = hand.y - iron.y;
  const bdz = hand.z - iron.z;
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
  if (!rec.blade.on && s.smashHit > 0 && s.smash >= s.smashHit) {
    kickPiece(
      rec.blade,
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
  if (!rec.shaft.on && s.smashHit > 0 && s.smash >= s.smashHit + 0.4) {
    kickPiece(
      rec.shaft,
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

function stepStickRage(dt: number): void {
  for (const rec of stickRages) {
    const s = world.skaters[rec.id];
    if (!s || s.smashKind <= 0) continue;
    if (s.id === world.userId) {
      if (checkedCyclePose(s.struck, s.tumble)) stepRageApproach(s, dt);
      else s.smash += dt;
      if (s.kind === "goalie") continue;
      stepRagePiece(rec.blade, dt);
      stepRagePiece(rec.shaft, dt);
      launchRagePieces(s, rec);
      continue;
    }
    stepRageApproach(s, dt);
    if (s.kind === "goalie") continue;
    stepRagePiece(rec.blade, dt);
    stepRagePiece(rec.shaft, dt);
    launchRagePieces(s, rec);
  }
}

/**
 * Gallery and pose-editor clock. Live play keeps stepStickRage / stepGoalieRage.
 * Advances smash only. Does not skate the player. Loops after the break.
 */
/** Held rage stills do not advance. Live smash uses stepStickRage and stepGoalieRage. */
export function stepRagePreview(_dt: number): void {}

function stepGoalieRage(_dt: number): void {
  // Do not set smashKind, smash, or smashHit. That clock was the post-goal goalie flail.
}

function stepGoalRefChecks(dt: number): void {
  for (const job of goalRefChecks) {
    const s = world.skaters[job.id];
    if (!s) continue;
    if (job.done) {
      s.vx *= Math.exp(-6 * dt);
      s.vz *= Math.exp(-6 * dt);
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      collideSkater(s);
      continue;
    }
    const r = job.ref;
    if (r.struck > 0.45) {
      job.done = true;
      continue;
    }
    const dx = r.x - s.x;
    const dz = r.z - s.z;
    const d = Math.hypot(dx, dz) || 1;
    s.yaw = turnToward(s.yaw, dx, dz, 14, dt);
    if (d < 1.35) {
      const { fx, fz } = heading(s.yaw);
      s.hit = Math.max(s.hit, 0.48);
      layDownRef(r, fx, fz, s.vx, s.vz, s);
      job.done = true;
      s.vx *= 0.25;
      s.vz *= 0.25;
    } else {
      if (d < 2.6) s.hit = Math.max(s.hit, 0.42);
      integrateSkater(s, dx / d, dz / d, 1, d > 6, dt);
    }
  }
}

function stepGoalReactions(dt: number): void {
  if (goalRageHold && world.stoppageT >= 0.5) {
    const side = goalRageHold;
    beginGoalReactions(side);
  }
  stepGoalieRage(dt);
  stepGoalRefChecks(dt);
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
    const mag = forming
      ? d < 0.28 && lsp < 1
        ? 0.04
        : 1
      : d < 0.22
        ? 0.02
        : d < 1.6
          ? 0.48
          : 0.86;
    integrateSkater(s, dirx, dirz, mag, forming, dt);
    const plan = cheerSlots[s.id];
    const mate = plan && plan.mate >= 0 ? world.skaters[plan.mate] : undefined;
    const faceMate =
      !forming && !!mate && d < 3.2 && (plan!.kind === 0 || plan!.kind === 1 || plan!.kind === 3);
    if (faceMate && mate) s.yaw = turnToward(s.yaw, mate.x - s.x, mate.z - s.z, 8, dt);
    else if (d < 3.2) s.yaw = turnToward(s.yaw, ax - s.x, az - s.z, 8, dt);
  }
}

function clearBackskate(): void {
  for (const s of world.skaters) s.backskate = false;
}

function applyBackskate(user: Skater, act: Actions): void {
  user.backskate = false;
  if (!act.lbDown || user.dive > 0 || world.faceoff) return;
  user.backskate = true;
  lockBackskateYaw(user);
}

function skillSector(x: number, y: number): "neutral" | "up" | SkillSide {
  const mag = Math.hypot(x, y);
  if (mag < SKILL_STICK_DZ) return "neutral";
  const ny = y / mag;
  const nx = x / mag;
  if (ny >= 0.78) return "up";
  if (ny <= -0.7) return "down";
  if (nx >= 0.2) return "fore";
  if (nx <= -0.2) return "back";
  return ny >= 0 ? "up" : "down";
}

function skillForeRoll(x: number, y: number): number {
  const mag = Math.hypot(x, y) || 1;
  const ny = y / mag;
  if (ny >= 0) return 0;
  return Math.max(0, Math.min(1, -ny / 0.7));
}

function skillDownDepth(x: number, y: number): number {
  const mag = Math.hypot(x, y) || 1;
  const ny = y / mag;
  return Math.max(0, Math.min(1, (-ny - 0.7) / 0.3));
}

function seatUserPuck(user: Skater): void {
  if (world.puck.owner !== user.id || user.kind === "goalie") return;
  const blade = stickBlade(user);
  world.puck.x = blade.x;
  world.puck.z = blade.z;
  world.puck.y = PUCK_Y;
  world.puck.vx = user.vx;
  world.puck.vz = user.vz;
  world.puck.vy = 0;
}

function skillPullFor(sec: SkillSide | "up" | "neutral", x: number, prev: number): number {
  if (sec === "back" || (sec === "down" && x < -0.12)) return 1;
  if (sec === "fore") return -1;
  if (sec === "down" && x > 0.12) return 0;
  return prev;
}

function noteSkillLoad(user: Skater, x: number, y: number, sec: SkillSide): void {
  skillG.side = sec;
  if (sec === "fore") skillG.roll = Math.max(skillG.roll, skillForeRoll(x, y));
  if (sec === "down") {
    skillG.slap = true;
    skillG.down = Math.max(skillG.down, skillDownDepth(x, y));
  }
  user.stickPull = skillPullFor(sec, x, user.stickPull);
  if (user.stickPull > 0.5 || sec === "back") user.windup = 0;
  else if (skillG.slap) user.windup = Math.max(0.7, Math.min(1, 0.62 + skillG.down * 0.38));
  else user.windup = 0;
  seatUserPuck(user);
}

function skillRelease(user: Skater): ShotRelease {
  const spd = Math.hypot(user.vx, user.vz);
  const locked =
    user.id === world.userId &&
    windupLockedBackhand !== null &&
    user.windup > 0.04 &&
    !world.windupCancel;
  const onBack = locked
    ? windupLockedBackhand === true
    : user.stickPull > 0.5 || skillG.side === "back" || puckOnBackhand(user);
  if (onBack) return { kind: "backhand", mph: backhandMph(spd) };
  if (skillG.slap || skillG.side === "down") return { kind: "slap", mph: slapMph(skillG.down, spd) };
  if (skillG.side === "fore") return { kind: "wrist", mph: wristMph(skillG.roll, spd) };
  return { kind: "snap", mph: snapMph(spd) };
}

/** Forehand is −1 (local −X). Backhand is +1 (local +X). Down and up are not the hold. */
function aimedDekeSide(sec: SkillSide | "up" | "neutral"): -1 | 1 | 0 {
  if (sec === "fore") return -1;
  if (sec === "back") return 1;
  return 0;
}

function stepSkillStick(user: Skater, act: Actions, allowShot: boolean): { loading: boolean } {
  if (skillHitPush || skillPokePush) {
    if (user.stickPull !== 0) user.stickPull = 0;
    freshSkillGesture();
    clearSkillProtect();
    return { loading: false };
  }
  if (useGame.getState().controlProfile !== "stick" || user.kind === "goalie" || world.puck.owner !== user.id) {
    if (user.stickPull !== 0) user.stickPull = 0;
    freshSkillGesture();
    clearSkillProtect();
    return { loading: false };
  }
  const x = act.aimX;
  const y = act.aimY;
  const sec = skillSector(x, y);
  const side = aimedDekeSide(sec);
  if (sec === "neutral") {
    freshSkillGesture();
    if (user.stickPull !== 0) user.stickPull = 0;
    return { loading: false };
  }
  if (skillG.cancel) {
    user.windup = 0;
    user.stickPull = 0;
    return { loading: false };
  }
  if (act.bEdge) {
    skillG.cancel = true;
    skillG.fired = true;
    user.windup = 0;
    user.stickPull = 0;
    world.shotWindupT = 0;
    return { loading: false };
  }
  if (act.xDown) {
    if (sec === "up") skillG.fired = true;
    else {
      if (side !== 0) holdSkillProtect(side);
      noteSkillLoad(user, x, y, sec);
    }
    return { loading: false };
  }
  if (sec === "up") {
    seatUserPuck(user);
    const shotWait = useGame.getState().clockMode === "drill" ? 0.02 : 0.25;
    if (allowShot && !skillG.fired && !world.windupCancel && world.time - world.lastShoot > shotWait) {
      const release = skillRelease(user);
      if (release.kind === "slap") user.windup = Math.max(user.windup, 0.72);
      const aim = shotAim(act);
      doShot(user, aim.mx, aim.my, release.kind === "slap", world.shotWindupT, release);
      skillG.fired = true;
    } else if (sec === "up") {
      skillG.fired = true;
    }
    return { loading: true };
  }
  if (side !== 0) holdSkillProtect(side);
  noteSkillLoad(user, x, y, sec);
  return { loading: true };
}

/**
 * Game and roller keep skating between periods and after the final buzzer.
 * Chasing, possession, and offensive-zone holds stay off until the next faceoff or reset.
 */
/** One user pass or shot is still open after the buzzer. CPU carriers are already loose. */
let periodEndUserPlay = false;

function periodEndUserPlayOk(s: Skater): boolean {
  return periodEndUserPlay && s.id === world.userId;
}

/** Drop a CPU puck in place. Leave the user's puck so one pass or shot can finish. */
function settlePeriodEndPuck(): void {
  const id = world.puck.owner;
  const holder = id !== null ? world.skaters[id] : undefined;
  if (!holder || holder.id === world.userId) {
    periodEndUserPlay = !!holder && holder.id === world.userId;
    return;
  }
  periodEndUserPlay = false;
  const sp = Math.hypot(holder.vx, holder.vz);
  const cap = 0.35;
  const k = sp > cap ? cap / sp : 1;
  world.puck.owner = null;
  world.puck.vx = holder.vx * k;
  world.puck.vz = holder.vz * k;
  world.puck.vy = 0;
  const ui = useGame.getState();
  if (ui.hasPuck) ui.setHasPuck(false);
}

export function periodEndLive(): boolean {
  const mode = useGame.getState().clockMode;
  if (mode !== "game" && mode !== "roller") return false;
  return world.periodEndT > 0 || world.periodOver;
}

/** Center ice while a period end or the final celebration is live. */
export function periodEndLook(): { x: number; y: number; z: number } | null {
  if (!periodEndLive()) return null;
  return { x: 0, y: 0.55, z: 0 };
}

function shootoutGoalCount(side: "home" | "away"): number {
  const so = world.shootout;
  if (!so) return 0;
  let n = 0;
  for (const a of so.attempts) if (a.side === side && a.result === "goal") n++;
  return n;
}

function shootoutFocusBody(kind: "skater" | "goalie", side: "home" | "away"): Skater | undefined {
  const so = world.shootout;
  if (kind === "skater" && so && so.shooterId >= 0) {
    const shooter = world.skaters[so.shooterId];
    if (shooter && shooter.side === side && shooter.kind !== "goalie") return shooter;
  }
  return world.skaters.find((s) => s.side === side && (kind === "goalie" ? s.kind === "goalie" : s.kind !== "goalie"));
}

/**
 * After a shootout attempt, look at the shooter on a goal and the defending goalie on a miss.
 * After the series, look at the winner the same way when that last play decided it.
 */
export function shootoutFocusLook(): { x: number; y: number; z: number } | null {
  const so = world.shootout;
  if (!so || (so.phase !== "result" && so.phase !== "done")) return null;
  const attempt = so.attempts[so.attempts.length - 1];
  if (!attempt?.result) return null;
  let kind: "skater" | "goalie" = attempt.result === "goal" ? "skater" : "goalie";
  let side: "home" | "away" = attempt.result === "goal" ? attempt.side : attempt.side === "home" ? "away" : "home";
  if (so.phase === "done") {
    const home = shootoutGoalCount("home");
    const away = shootoutGoalCount("away");
    const winner: "home" | "away" | null = home > away ? "home" : away > home ? "away" : null;
    if (!winner) return null;
    const saveWon = attempt.result === "save" && attempt.side !== winner;
    kind = saveWon ? "goalie" : "skater";
    side = winner;
  }
  const focus = shootoutFocusBody(kind, side);
  if (!focus) return null;
  return { x: focus.x, y: 1.05, z: focus.z };
}

/** Credited scorer, then the last shooter. Chest height matches the old user look. */
function goalScorerCam(): Skater | undefined {
  if (world.lastShooter === null) return undefined;
  return world.skaters[world.lastShooter];
}

/**
 * A goal whistle follows the scorer. An offside whistle stays on the ice spot
 * where the puck was when the whistle blew.
 */
export function whistleUserLook(): { x: number; y: number; z: number } | null {
  if (world.replay) return null;
  if (world.whistle === "offside") {
    if (!offsideLook) offsideLook = { x: world.puck.x, z: world.puck.z };
    return { x: offsideLook.x, y: 0.55, z: offsideLook.z };
  }
  offsideLook = null;
  if (world.whistle !== "goal") return null;
  const scorer = goalScorerCam();
  if (scorer) return { x: scorer.x, y: 1.05, z: scorer.z };
  if (cpuScrimmageWatch) {
    const holder = world.puck.owner !== null ? world.skaters[world.puck.owner] : undefined;
    const cpu = holder ?? world.skaters.find((p) => p.side === "away" && p.kind !== "goalie");
    if (cpu) return { x: cpu.x, y: 1.05, z: cpu.z };
    return { x: world.puck.x, y: 0.55, z: world.puck.z };
  }
  const s = world.userId >= 0 ? world.skaters[world.userId] : undefined;
  if (!s) return null;
  return { x: s.x, y: 1.05, z: s.z };
}

function winnerSide(): "home" | "away" | null {
  const ui = useGame.getState();
  if (ui.homeScore > ui.awayScore) return "home";
  if (ui.awayScore > ui.homeScore) return "away";
  return null;
}

function armMatchCelebrate(): void {
  matchEndHold = MATCH_END_HOLD;
  const winner = winnerSide();
  if (!winner) return;
  for (const s of world.skaters) {
    if (s.side === winner) s.celebrate = MATCH_END_HOLD + 8;
  }
}

/** Sudden-death goal. Same ending as the final buzzer: no faceoff, then the match celebration. */
function endOvertimeMatch(): void {
  overtimeWinner = false;
  if (world.periodOver) return;
  world.periodOver = true;
  world.stoppage = false;
  world.whistle = null;
  clearDelayedOffside();
  const ui = useGame.getState();
  ui.setPeriodOver(true);
  ui.setWhistle(null);
  if (ui.homeScore > ui.awayScore) armCpuKitCycle();
  armMatchCelebrate();
  settlePeriodEndPuck();
}

function stepMatchEnd(dt: number): void {
  if (matchEndHold <= 0 || !world.periodOver) return;
  const mode = useGame.getState().clockMode;
  if (mode !== "game" && mode !== "roller") {
    matchEndHold = 0;
    return;
  }
  matchEndHold = Math.max(0, matchEndHold - clockDt(dt));
  if (matchEndHold <= 0 && !useGame.getState().paused) resetWorld();
}

const SHOOTOUT_APPROACH_S = 0.85;
const SHOOTOUT_FLIGHT_S = 0.4;
const SHOOTOUT_RESULT_S = 0.7;
/** Skate, dive, and check after a user shootout goal. Crowd cheer stays on its own clock. */
const SHOOTOUT_USER_CHEER_S = 3;
const SHOOTOUT_TRY_CHEER_S = 2;
const SHOOTOUT_WIN_CHEER_S = 5;

let shootoutRoll: (() => boolean) | null = null;

/** Tests pin each shootout attempt. Passing null uses the skill roll again. */
export function setShootoutRoll(fn: (() => boolean) | null): void {
  shootoutRoll = fn;
}

function regOtIce(): boolean {
  const ui = useGame.getState();
  if (world.shootout) return false;
  if (ui.clockMode === "game") return ui.otFormat === "reg" && world.period > GAME_PERIODS;
  if (ui.clockMode === "roller") return ui.rollerOtFormat === "reg" && world.period > ROLLER_PERIODS;
  return false;
}

function clearShootout(): void {
  const ui = useGame.getState();
  if (ui.clockMode !== "shootout") shootoutRoll = null;
  const had = world.shootout !== null || ui.shootout !== null;
  world.shootout = null;
  if (had) ui.setShootout(null);
}

function shuffleNums(list: readonly number[]): number[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = out[i]!;
    out[i] = out[j]!;
    out[j] = swap;
  }
  return out;
}

function rosterShooters(side: "home" | "away"): { starters: number[]; bench: number[] } {
  const ui = useGame.getState();
  const lu = side === "home" ? ui.homeLineup : ui.awayLineup;
  const nums = side === "home" ? HOME_NUMS : awayNums;
  const starters: number[] = [];
  for (let i = 0; i < lu.d; i++) {
    const n = nums.d[i];
    if (n != null) starters.push(n);
  }
  for (let i = 0; i < lu.o; i++) {
    const n = nums.o[i];
    if (n != null) starters.push(n);
  }
  const first = starters.slice(0, 5);
  const used = new Set(first);
  const bench: number[] = [];
  for (const n of [...nums.d, ...nums.o]) {
    if (used.has(n)) continue;
    used.add(n);
    bench.push(n);
  }
  return { starters: first, bench };
}

/** First five are the starting skaters, shuffled. The rest are the remaining skaters, shuffled. */
export function shootoutOrder(starters: readonly number[], bench: readonly number[]): number[] {
  const start = shuffleNums(starters.slice(0, 5));
  const used = new Set(start);
  const rest = shuffleNums(bench.filter((n) => !used.has(n)));
  const order = [...start, ...rest];
  return order.length > 0 ? order : [0];
}

/**
 * Stop as soon as the other side cannot catch up in the shots they have left.
 * The scheduled rounds can end early, including halfway through a round.
 * Sudden death starts only after both sides have shot that many times and the score is tied,
 * and each of those extra rounds plays out as a pair.
 */
export function shootoutStillGoing(
  attempts: readonly ShootoutAttempt[],
  rounds: ShootoutRounds = 3,
): boolean {
  if (attempts.some((a) => a.result === null)) return true;
  let home = 0;
  let away = 0;
  let homeN = 0;
  let awayN = 0;
  for (const a of attempts) {
    if (a.side === "home") {
      homeN++;
      if (a.result === "goal") home++;
    } else {
      awayN++;
      if (a.result === "goal") away++;
    }
  }
  if (homeN < rounds || awayN < rounds) {
    const homeLeft = rounds - homeN;
    const awayLeft = rounds - awayN;
    if (home > away + awayLeft) return false;
    if (away > home + homeLeft) return false;
    return true;
  }
  if (homeN !== awayN) return true;
  return home === away;
}

function attemptSide(first: "home" | "away", index: number): "home" | "away" {
  if (index % 2 === 0) return first;
  return first === "home" ? "away" : "home";
}

function shootoutScripted(): boolean {
  return shootoutRoll !== null;
}

function shootoutLive(): boolean {
  return world.shootout?.phase === "live";
}

function shootoutAttemptDecided(): boolean {
  const so = world.shootout;
  if (!so || so.phase === "done") return false;
  const attempt = so.attempts[so.attempts.length - 1];
  return !!attempt?.result;
}

function shootoutStickInput(act: Actions): boolean {
  return (
    Math.hypot(act.moveX, act.moveY) > 0.18 ||
    Math.hypot(act.aimX, act.aimY) > 0.18 ||
    act.aDown ||
    act.xDown ||
    act.yDown ||
    act.bDown ||
    act.burst ||
    act.rtDown ||
    act.ltDown ||
    act.lbDown ||
    act.rbDown ||
    act.viewDown ||
    act.startDown
  );
}

function shootoutGoalieOnAi(user: Skater): boolean {
  const so = world.shootout;
  if (!so || so.phase !== "live") return false;
  const attempt = so.attempts[so.attempts.length - 1];
  if (!attempt || attempt.side !== "away" || so.goalieUser) return false;
  return user.kind === "goalie" && user.side === "home";
}

function prepareLiveShootout(dt: number, act: Actions): void {
  const so = world.shootout;
  if (!so || so.phase !== "live") return;
  so.t += dt;
  const attempt = so.attempts[so.attempts.length - 1];
  if (!attempt) return;
  if (attempt.side === "home") {
    if (so.shooterId >= 0) world.userId = so.shooterId;
    return;
  }
  const goalie = world.skaters.find((s) => s.side === "home" && s.kind === "goalie");
  if (!goalie) return;
  if (!so.goalieUser && shootoutStickInput(act)) so.goalieUser = true;
  world.userId = goalie.id;
}

function restrainLiveShootout(): void {
  const so = world.shootout;
  if (!so || so.phase !== "live") return;
  const attempt = so.attempts[so.attempts.length - 1];
  if (!attempt) return;
  parkShootoutBench();
  for (const s of world.skaters) {
    if (s.kind !== "goalie" || s.side !== attempt.side) continue;
    const sign = defendDir(s.side);
    s.x = sign * (GOAL_LINE_X - 0.85);
    s.z = 0;
    s.vx = 0;
    s.vz = 0;
    s.yaw = faceYaw(s.side);
  }
  if (attempt.side !== "away" || so.t < 7.5) return;
  const shooter = so.shooterId >= 0 ? world.skaters[so.shooterId] : undefined;
  if (!shooter || world.puck.owner !== shooter.id) return;
  if (world.lastShooter === shooter.id && world.time - world.lastShoot < 1) return;
  const attack = attackDir(shooter.side);
  const distMouth = (attack * GOAL_LINE_X - shooter.x) * attack;
  if (distMouth > 11 || Math.abs(shooter.z) > 5.2) return;
  shootAtNet(shooter);
}

function cheerShootoutFans(side: "home" | "away", seconds: number): void {
  world.goalSide = side;
  world.goalTicker = seconds;
  useGame.getState().setGoalSide(side);
}

function cheerShootoutSave(attacking: "home" | "away"): void {
  cheerShootoutFans(attacking === "home" ? "away" : "home", SHOOTOUT_TRY_CHEER_S);
}

/** The puck is still moving through the blue paint, so a pad touch can still go in. */
function shootoutHeadingIn(attack: number): boolean {
  const depth = (attack * GOAL_LINE_X - world.puck.x) * attack;
  if (depth < -0.35 || depth > 1.6) return false;
  if (Math.abs(world.puck.z) > GOAL_W / 2 + 0.25) return false;
  return world.puck.vx * attack > 0.35;
}

/** Goalie contact, then a skater contact, is a miss even if the puck later crosses the line. */
function noteShootoutContacts(): void {
  const so = world.shootout;
  if (!so || so.phase !== "live") return;
  const attempt = so.attempts[so.attempts.length - 1];
  if (!attempt || attempt.result) return;
  const keeperSide = attempt.side === "home" ? "away" : "home";
  const owner = world.puck.owner !== null ? world.skaters[world.puck.owner] : undefined;
  const goalieHas = !!owner && owner.kind === "goalie" && owner.side === keeperSide;
  if (goalieHas) {
    if (!so.goalieTouch) {
      so.goalieTouch = true;
      so.goalieTouchAt = world.time;
    }
    failShootoutRebound();
    return;
  }
  if (!so.goalieTouch) {
    const saved = world.goalieSaveT >= so.startedAt - 1e-4;
    if (saved) {
      so.goalieTouch = true;
      so.goalieTouchAt = world.goalieSaveT;
    }
  }
  if (!so.goalieTouch) return;
  const skaterHas = !!owner && owner.kind !== "goalie";
  const shotAfter =
    world.lastShooter !== null &&
    world.lastShoot > so.goalieTouchAt + 1e-4 &&
    world.skaters[world.lastShooter]?.kind !== "goalie";
  const passAfter =
    world.lastPasser !== null &&
    world.lastPass > so.goalieTouchAt + 1e-4 &&
    world.skaters[world.lastPasser]?.kind !== "goalie";
  if (skaterHas || shotAfter || passAfter) failShootoutRebound();
}

function failShootoutRebound(): void {
  const so = world.shootout;
  if (!so || so.phase !== "live") return;
  const attempt = so.attempts[so.attempts.length - 1];
  if (!attempt || attempt.result) return;
  attempt.result = "save";
  so.phase = "result";
  so.t = 0;
  world.stoppage = false;
  if (world.whistle === "goal") {
    world.whistle = null;
    const ui = useGame.getState();
    if (ui.whistle) ui.setWhistle(null);
  }
  cheerShootoutSave(attempt.side);
  publishShootout();
}

function settleLiveShootout(): void {
  noteShootoutContacts();
  const so = world.shootout;
  if (!so || so.phase !== "live") return;
  const attempt = so.attempts[so.attempts.length - 1];
  const shooter = so.shooterId >= 0 ? world.skaters[so.shooterId] : undefined;
  if (!attempt || attempt.result || !shooter) return;
  const attack = attackDir(attempt.side);
  const shotRelease = world.lastShooter === shooter.id && world.time >= world.lastShoot;
  const passRelease =
    world.lastPasser === shooter.id && world.lastPass > world.lastShoot && world.time >= world.lastPass;
  const released = shotRelease || passRelease;
  const releaseAt = passRelease ? world.lastPass : world.lastShoot;
  const along = shooter.x * attack;
  if (along > so.backAlong) so.backAlong = along;
  if (so.backAlong - along > SKATER_STICK_LEN) {
    attempt.result = "save";
    so.phase = "result";
    so.t = 0;
    cheerShootoutSave(attempt.side);
    publishShootout();
    return;
  }
  const deflected =
    released &&
    world.goalieSaveT >= releaseAt - 1e-4 &&
    world.time - world.goalieSaveT < 0.6;
  const backOverCenter = released && world.puck.x * attack < -0.4;
  const past = released ? (world.puck.x - attack * GOAL_LINE_X) * attack : -1;
  const inNet =
    past > 0.02 &&
    Math.abs(world.puck.z) <= GOAL_W / 2 - 0.02 &&
    world.puck.y < GOAL_H &&
    world.puck.y > -0.02;
  if (inNet && world.whistle !== "goal") {
    stopForGoal((attack >= 0 ? 1 : -1) as 1 | -1);
    if (world.whistle !== "goal") {
      world.whistle = "goal";
      world.goalSide = attempt.side;
      world.goalTicker = SHOOTOUT_TRY_CHEER_S;
      const ui = useGame.getState();
      ui.setWhistle("goal");
      ui.setGoalSide(attempt.side);
    }
  }
  let result: "goal" | "save" | null = null;
  if (world.whistle === "goal" || inNet) result = "goal";
  else if (deflected && !shootoutHeadingIn(attack)) result = "save";
  else if (backOverCenter || past > 0.2) result = "save";
  else if (so.t > 18 && released && world.puck.owner !== shooter.id) result = "save";
  if (!result) return;
  attempt.result = result;
  so.phase = "result";
  so.t = 0;
  if (result === "save") cheerShootoutSave(attempt.side);
  publishShootout();
}

function shootoutScores(side: "home" | "away"): boolean {
  if (shootoutRoll) return shootoutRoll();
  const ui = useGame.getState();
  const attack = side === "home" ? ui.userOffense : ui.cpuOffense;
  const defend = side === "home" ? ui.cpuGoalie : ui.userGoalie;
  const p = 0.34 + (attack - defend) * 0.28;
  return Math.random() < Math.max(0.12, Math.min(0.7, p));
}

function shootoutBench(side: "home" | "away"): number[] {
  const so = world.shootout;
  if (!so || so.phase === "done") return [];
  const nums: number[] = [];
  for (const s of world.skaters) {
    if (s.side !== side || s.kind === "goalie" || s.id === so.shooterId) continue;
    nums.push(s.number);
  }
  return nums;
}

function publishShootout(): void {
  const so = world.shootout;
  const ui = useGame.getState();
  if (!so) {
    if (ui.shootout) ui.setShootout(null);
    return;
  }
  ui.setShootout({
    first: so.first,
    order: { home: so.order.home, away: so.order.away },
    attempts: so.attempts.map((a) => ({ side: a.side, number: a.number, result: a.result })),
    bench: { home: shootoutBench("home"), away: shootoutBench("away") },
    rounds: so.rounds,
  });
}

function parkShootoutGoalies(): void {
  for (const s of world.skaters) {
    if (s.kind !== "goalie") continue;
    const sign = defendDir(s.side);
    s.x = sign * (GOAL_LINE_X - 0.85);
    s.z = 0;
    s.vx = 0;
    s.vz = 0;
    s.yaw = faceYaw(s.side);
    s.celebrate = 0;
    s.dive = 0;
    s.windup = 0;
    s.follow = 0;
  }
}

function parkShootoutBench(): void {
  const so = world.shootout;
  if (!so) return;
  // Behind the bench glass. yaw π faces the ice, so a replay body is not turned around in the seat.
  const z = -RINK_W / 2 - 2.4;
  const seat = { home: 0, away: 0 };
  for (const s of world.skaters) {
    if (s.kind === "goalie" || s.id === so.shooterId) continue;
    if (so.phase === "done" && s.id === world.userId) continue;
    const end = s.side === "home" ? 1 : -1;
    const i = seat[s.side]++;
    s.x = end * (4.6 + i * 0.64);
    s.z = z;
    s.vx = 0;
    s.vz = 0;
    s.yaw = Math.PI;
    s.windup = 0;
    s.follow = 0;
    s.celebrate = 0;
    s.dive = 0;
    s.hit = 0;
    s.poke = 0;
  }
}

function presentShooter(side: "home" | "away", number: number): number {
  const mates = world.skaters
    .filter((s) => s.side === side && s.kind !== "goalie")
    .sort((a, b) => a.id - b.id);
  const shooter = mates[0];
  if (!shooter) return -1;
  const attack = attackDir(side);
  shooter.number = number;
  shooter.x = 0;
  shooter.z = 0;
  shooter.vx = 0;
  shooter.vz = 0;
  shooter.yaw = faceYaw(side);
  shooter.windup = 0;
  shooter.follow = 0;
  shooter.celebrate = 0;
  shooter.dive = 0;
  shooter.hit = 0;
  shooter.poke = 0;
  shooter.stun = 0;
  world.puck.owner = shooter.id;
  world.puck.x = attack * 0.55;
  world.puck.z = 0;
  world.puck.y = PUCK_Y;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  return shooter.id;
}

function beginAttempt(): void {
  const so = world.shootout;
  if (!so || so.phase === "done") return;
  if (!shootoutStillGoing(so.attempts, so.rounds)) {
    finishShootout();
    return;
  }
  const side = attemptSide(so.first, so.attempts.length);
  const taken = so.attempts.filter((a) => a.side === side).length;
  const order = so.order[side];
  const number = order[taken % order.length] ?? order[0] ?? 0;
  so.attempts.push({ side, number, result: null });
  so.goalieUser = false;
  so.t = 0;
  so.startedAt = world.time;
  so.goalieTouch = false;
  so.goalieTouchAt = -1;
  so.scores = shootoutScripted() ? shootoutScores(side) : false;
  so.phase = shootoutScripted() ? "approach" : "live";
  so.shooterId = presentShooter(side, number);
  so.releaseX = 0;
  const placed = so.shooterId >= 0 ? world.skaters[so.shooterId] : undefined;
  so.backAlong = placed ? placed.x * attackDir(side) : 0;
  world.stoppage = false;
  world.faceoff = false;
  world.whistle = null;
  world.lastShoot = -10;
  world.lastShooter = null;
  world.lastPass = -10;
  world.lastPasser = null;
  if (so.phase === "live") {
    if (side === "home") world.userId = so.shooterId;
    else {
      const goalie = world.skaters.find((s) => s.side === "home" && s.kind === "goalie");
      if (goalie) world.userId = goalie.id;
    }
  }
  for (const s of world.skaters) {
    if (s.kind === "goalie") s.coverPose = 0;
  }
  const ui = useGame.getState();
  world.whistle = null;
  if (ui.whistle) ui.setWhistle(null);
  publishShootout();
}

function markShootoutResult(): void {
  const so = world.shootout;
  if (!so) return;
  const attempt = so.attempts[so.attempts.length - 1];
  if (!attempt || attempt.result) return;
  attempt.result = so.scores ? "goal" : "save";
  const ui = useGame.getState();
  world.puck.owner = null;
  if (so.scores) {
    world.whistle = "goal";
    cheerShootoutFans(attempt.side, SHOOTOUT_TRY_CHEER_S);
    ui.setWhistle("goal");
    const shooter = world.skaters[so.shooterId];
    if (shooter) shooter.celebrate = SHOOTOUT_RESULT_S + 0.4;
  } else {
    world.whistle = null;
    if (ui.whistle) ui.setWhistle(null);
    cheerShootoutSave(attempt.side);
  }
  publishShootout();
}

function finishShootout(): void {
  const so = world.shootout;
  if (!so || so.phase === "done") return;
  so.phase = "done";
  let home = 0;
  let away = 0;
  for (const a of so.attempts) {
    if (a.result !== "goal") continue;
    if (a.side === "home") home++;
    else away++;
  }
  const ui = useGame.getState();
  if (home > away) ui.setHomeScore(ui.homeScore + 1);
  else if (away > home) ui.setAwayScore(ui.awayScore + 1);
  const winner: "home" | "away" | null = home > away ? "home" : away > home ? "away" : null;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  parkShootoutBench();
  publishShootout();
  endOvertimeMatch();
  if (winner) {
    world.goalSide = winner;
    world.goalTicker = SHOOTOUT_WIN_CHEER_S;
    useGame.getState().setGoalSide(winner);
    useGame.getState().setWhistle(null);
  } else {
    world.goalSide = null;
    world.goalTicker = 0;
  }
}

function beginShootout(): void {
  if (world.shootout) return;
  const home = rosterShooters("home");
  const away = rosterShooters("away");
  const first: "home" | "away" = Math.random() < 0.5 ? "home" : "away";
  const uiRounds = useGame.getState();
  const rounds = seriesShootoutRounds(uiRounds.clockMode, uiRounds.shootoutRounds);
  world.shootout = {
    first,
    order: {
      home: shootoutOrder(home.starters, home.bench),
      away: shootoutOrder(away.starters, away.bench),
    },
    attempts: [],
    phase: "approach",
    t: 0,
    scores: false,
    shooterId: -1,
    releaseX: 0,
    goalieUser: false,
    backAlong: 0,
    startedAt: 0,
    goalieTouch: false,
    goalieTouchAt: -1,
    rounds,
  };
  world.periodClock = 0;
  world.periodEndT = 0;
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.goalSide = null;
  world.goalTicker = 0;
  const ui = useGame.getState();
  ui.setPeriodClock(0);
  ui.setWhistle(null);
  ui.setGoalSide(null);
  if (ui.periodBreak !== 0) ui.setPeriodBreak(0);
  dropWingClaims();
  for (const r of [world.ref, world.ref2, world.ref3, world.ref4]) {
    r.vx = 0;
    r.vz = 0;
    r.pose = "idle";
  }
  world.ref.x = 0;
  world.ref.z = RINK_W / 2 - 2;
  world.ref2.x = 0;
  world.ref2.z = -6;
  beginAttempt();
}

function stepShootout(dt: number): void {
  const so = world.shootout;
  if (!so || so.phase === "done") return;
  parkShootoutGoalies();
  parkShootoutBench();
  const attempt = so.attempts[so.attempts.length - 1];
  const shooter = so.shooterId >= 0 ? world.skaters[so.shooterId] : undefined;
  if (!attempt) {
    beginAttempt();
    recordReplay();
    return;
  }
  if (!shooter) return;
  const side = attempt.side;
  const attack = attackDir(side);
  so.t += dt;
  if (so.phase === "approach") {
    const u = Math.min(1, so.t / SHOOTOUT_APPROACH_S);
    shooter.x = attack * 11 * u;
    shooter.z = 0;
    shooter.vx = 0;
    shooter.vz = 0;
    shooter.yaw = faceYaw(side);
    shooter.windup = u;
    shooter.follow = 0;
    world.puck.owner = shooter.id;
    world.puck.x = shooter.x + attack * 0.55;
    world.puck.z = 0;
    world.puck.y = PUCK_Y;
    world.puck.vx = 0;
    world.puck.vz = 0;
    world.puck.vy = 0;
    if (so.t >= SHOOTOUT_APPROACH_S) {
      so.releaseX = shooter.x + attack * 0.55;
      so.phase = "flight";
      so.t = 0;
      shooter.windup = 0;
      shooter.follow = 0.15;
      world.puck.owner = null;
    }
  } else if (so.phase === "flight") {
    const u = Math.min(1, so.t / SHOOTOUT_FLIGHT_S);
    const netX = attack * (so.scores ? GOAL_LINE_X + 0.45 : GOAL_LINE_X - 0.95);
    shooter.x = attack * 11;
    shooter.z = 0;
    shooter.yaw = faceYaw(side);
    shooter.follow = Math.min(1, 0.15 + u);
    world.puck.owner = null;
    world.puck.x = so.releaseX + (netX - so.releaseX) * u;
    world.puck.y = so.scores ? 0.22 + 0.18 * (1 - u) : 0.55;
    world.puck.z = so.scores ? 0.08 : 0.32 * u;
    world.puck.vx = 0;
    world.puck.vz = 0;
    world.puck.vy = 0;
    if (!so.scores) {
      const keeper = world.skaters.find((s) => s.kind === "goalie" && s.side !== side);
      if (keeper) keeper.coverPose = u;
    }
    if (so.t >= SHOOTOUT_FLIGHT_S) {
      markShootoutResult();
      so.phase = "result";
      so.t = 0;
    }
  } else if (so.phase === "result" && so.t >= SHOOTOUT_RESULT_S) {
    if (!shootoutStillGoing(so.attempts, so.rounds)) {
      finishShootout();
      return;
    }
    beginAttempt();
  }
  recordReplay();
}

/** Decorative shootout bench numbers. The arena draws these, then any real extras that fit. */
export const HOME_BENCH_NUMS = [84, 62, 42, 25, 11, 10, 15, 18, 21];
export const AWAY_BENCH_NUMS = [2, 4, 9, 14, 17, 19, 22, 27, 31];
const SHOOTOUT_BENCH_INNER = 0.8;
const SHOOTOUT_BENCH_OUTER = 9.52;
const SHOOTOUT_BENCH_GAP = 0.64;

/** One bench row. The goalie stays at the net-side end. Numbers past the shoulder gap are left off. */
export function shootoutBenchRow(
  side: "home" | "away",
  goalieNum: number,
  extras: readonly number[],
): { x: number; number: number; goalie: boolean }[] {
  const positive = side === "home";
  const lo = positive ? SHOOTOUT_BENCH_INNER : -SHOOTOUT_BENCH_OUTER;
  const hi = positive ? SHOOTOUT_BENCH_OUTER : -SHOOTOUT_BENCH_INNER;
  const goalieX = defendDir(side) >= 0 ? hi : lo;
  const farX = goalieX === lo ? hi : lo;
  const base = side === "home" ? HOME_BENCH_NUMS : AWAY_BENCH_NUMS;
  const seen = new Set<number>([goalieNum]);
  const skaters: number[] = [];
  for (const n of [...base, ...extras]) {
    if (seen.has(n)) continue;
    seen.add(n);
    skaters.push(n);
  }
  const span = Math.abs(farX - goalieX);
  const maxSeats = Math.max(1, Math.floor(span / SHOOTOUT_BENCH_GAP) + 1);
  const count = Math.min(maxSeats, 1 + skaters.length);
  const dir = Math.sign(farX - goalieX) || 1;
  const gap = count <= 1 ? 0 : span / (count - 1);
  const row: { x: number; number: number; goalie: boolean }[] = [
    { x: goalieX, number: goalieNum, goalie: true },
  ];
  for (let i = 1; i < count; i++) {
    row.push({ x: goalieX + dir * gap * i, number: skaters[i - 1]!, goalie: false });
  }
  return row;
}

/** A real skater with no seat. Hidden in live play and in replay. */
export function shootoutBenchOverflow(id: number): boolean {
  const so = world.shootout;
  if (!so) return false;
  const s = world.skaters[id];
  if (!s || s.kind === "goalie" || id === so.shooterId) return false;
  const goalie = world.skaters.find((g) => g.side === s.side && g.kind === "goalie");
  const row = shootoutBenchRow(s.side, goalie?.number ?? -1, shootoutBench(s.side));
  return !row.some((seat) => !seat.goalie && seat.number === s.number);
}

export function shootoutSkaterHidden(id: number): boolean {
  const so = world.shootout;
  if (!so) return false;
  const s = world.skaters[id];
  if (!s || s.kind === "goalie") return false;
  if (id === so.shooterId) return false;
  if (so.phase === "done" && id === world.userId) return false;
  if (shootoutBenchOverflow(id)) return true;
  if (world.replay) return false;
  return true;
}

function beginPeriodBreak(): void {
  world.periodEndT = PERIOD_END_HOLD;
  world.periodClock = 0;
  world.whistle = null;
  clearDelayedOffside();
  const ui = useGame.getState();
  ui.setPeriodClock(0);
  ui.setWhistle(null);
  ui.setPeriodBreak(world.period);
  dropWingClaims();
  settlePeriodEndPuck();
}

function startNextPeriod(): void {
  const ui0 = useGame.getState();
  const roller = ui0.clockMode === "roller";
  const periods = roller ? ROLLER_PERIODS : GAME_PERIODS;
  const format = roller ? ui0.rollerOtFormat : ui0.otFormat;
  const regOt = format === "reg" && world.period >= periods;
  const seconds = regOt ? REG_OT_SECONDS : roller ? ROLLER_PERIOD_SECONDS : PERIOD_SECONDS;
  const next: 1 | -1 = world.homeAttack === 1 ? -1 : 1;
  world.period = world.period + 1;
  assignHomeAttack(next);
  world.faceX = 0;
  world.faceZ = 0;
  world.whistle = null;
  resetWorld({ keepScore: true });
  world.periodClock = seconds;
  const ui = useGame.getState();
  ui.setPeriod(world.period);
  ui.setPeriodClock(seconds);
  ui.setPeriodOver(false);
}

/** Viewable CPU drill with no home skater. The away shooter is held and released as usual. */
function stepCpuDrillWatch(dt: number): void {
  if (world.faceoff) stepDrillDrop(dt);
  const dropping = world.faceoff;
  for (const s of world.skaters) {
    refreshCpuBackskate(s);
    const ai = thinkAi(s, dt);
    if (s.kind === "goalie") {
      refreshCpuBackskate(s);
      if (s.backskate) lockBackskateYaw(s);
    } else {
      integrateSkater(s, ai.wx, ai.wz, ai.mag, ai.burst, dt);
      keepInBowl(s);
    }
  }
  if (dropping) {
    stepRef(dt);
    recordReplay();
    return;
  }
  separateSkaters();
  stepPuck(dt);
  stepRef(dt);
  recordReplay();
}

function stepOpenIce(dt: number, act: Actions): void {
  if (world.faceoff) {
    world.faceoff = false;
    world.faceoffPhase = "live";
    world.puck.x = world.faceX;
    world.puck.z = world.faceZ;
    world.puck.y = PUCK_Y;
    world.puck.owner = null;
    world.puck.vx = 0;
    world.puck.vz = 0;
    world.puck.vy = 0;
    world.stoppage = false;
    world.whistle = null;
    releaseFaceoffCenters();
  }
  for (const s of world.skaters) {
    refreshCpuBackskate(s);
    const ai = thinkAi(s, dt);
    if (s.kind === "goalie") {
      refreshCpuBackskate(s);
      if (s.backskate) lockBackskateYaw(s);
    } else {
      integrateSkater(s, ai.wx, ai.wz, ai.mag, ai.burst, dt);
      keepInBowl(s);
    }
  }
  for (const s of world.skaters) {
    cpuDefend(s);
    if (s.poke > 0) pokeCheck(s);
    if (s.hit > 0) applyHit(s);
  }
  separateSkaters();
  for (const s of world.skaters) keepInBowl(s);
  easeBurstPoses(dt);
  stepPuck(dt);
  if (!world.stoppage) checkCover(dt, act);
  updateCoverPose(dt);
  stepRef(dt);
  const ui = useGame.getState();
  if (ui.hasPuck) ui.setHasPuck(false);
  recordReplay();
}

function stepPlay(dt: number, act: Actions): void {
  latchPrecede();
  userWinding = false;
  shotPlantKeep = 1;
  skillStickLoading = false;
  skillStickSideHold = false;
  userStickCommit = false;
  clearBackskate();
  const ui = useGame.getState();
  world.time += dt;

  if (world.replay) {
    dropWingClaims();
    stepReplay(dt, act);
    return;
  }

  if (world.periodOver) {
    if (ui.clockMode === "drill") {
      dropWingClaims();
      releaseDrillNetPuck(world.puck);
      return;
    }
    if (ui.clockMode !== "game" && ui.clockMode !== "roller" && world.shootout?.phase !== "done") {
      dropWingClaims();
      return;
    }
    stepMatchEnd(dt);
    if (!world.periodOver || useGame.getState().paused) return;
  }

  if (world.periodEndT > 0) {
    world.periodEndT = Math.max(0, world.periodEndT - dt);
    if (world.periodEndT <= 0) {
      startNextPeriod();
      return;
    }
  }

  if (world.shootout && world.shootout.phase !== "done") {
    const so = world.shootout;
    // A live decision keeps the puck and players moving. Scripted attempts stay kinematic.
    if (so.phase === "result" && !shootoutScripted()) {
      parkShootoutBench();
      so.t += dt;
      const attempt = so.attempts[so.attempts.length - 1];
      const userGoal = attempt?.side === "home" && attempt.result === "goal";
      const hold = userGoal ? SHOOTOUT_USER_CHEER_S : SHOOTOUT_RESULT_S;
      if (so.t >= hold) {
        if (!shootoutStillGoing(so.attempts, so.rounds)) finishShootout();
        else beginAttempt();
      }
    }
    if (!world.shootout || world.shootout.phase === "done") return;
    if (world.shootout.phase !== "live" && !(world.shootout.phase === "result" && !shootoutScripted())) {
      stepShootout(dt);
      return;
    }
    if (world.shootout.phase === "live") prepareLiveShootout(dt, act);
  }

  syncPassChainHold();
  tickPassChainHold();

  stepBenchDump(dt);
  if (world.lineBrawl) {
    dropWingClaims();
    stepLineBrawl(dt, act);
    return;
  }

  if (ui.clockMode === "scrimmage" && !world.periodOver && !scrimmageWinner()) {
    world.periodClock += clockDt(dt);
    const shown = Math.floor(world.periodClock);
    if (shown !== ui.periodClock) ui.setPeriodClock(shown);
  }

  if (
    ui.clockMode === "drill" &&
    !cpuDrillProbe &&
    !world.stoppage &&
    !world.drillWon &&
    !drillDropLive()
  ) {
    world.periodClock = Math.max(0, world.periodClock - clockDt(dt));
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

  if (
    world.periodEndT <= 0 &&
    !world.periodOver &&
    (ui.clockMode === "game" || ui.clockMode === "roller") &&
    !world.shootout &&
    !world.stoppage &&
    !world.faceoff
  ) {
    const roller = ui.clockMode === "roller";
    const scale = roller ? rollerClockScale(ui.rollerMinutes) : gameClockScale(ui.gameMinutes);
    const periods = roller ? ROLLER_PERIODS : GAME_PERIODS;
    // Game speed adds or skips sim steps. Divide it out so the countdown stays on real time.
    world.periodClock = Math.max(0, world.periodClock - clockDt(dt) * scale);
    const shown = Math.floor(world.periodClock);
    if (shown !== ui.periodClock) ui.setPeriodClock(shown);
    if (world.periodClock <= 0) {
      const tied = ui.homeScore === ui.awayScore;
      const format = roller ? ui.rollerOtFormat : ui.otFormat;
      const playoffTie = tied && format === "playoff";
      const regOt = tied && format === "reg" && world.period === periods;
      if (world.period < periods || playoffTie || regOt) {
        beginPeriodBreak();
        return;
      }
      if (tied && format === "reg" && world.period > periods) {
        beginShootout();
        return;
      }
      if (!world.periodOver) {
        world.periodOver = true;
        world.whistle = null;
        clearDelayedOffside();
        ui.setPeriodOver(true);
        ui.setPeriodClock(0);
        ui.setWhistle(null);
        const winner: "home" | "away" | null =
          ui.homeScore > ui.awayScore ? "home" : ui.awayScore > ui.homeScore ? "away" : null;
        if (winner === "home") armCpuKitCycle();
        armMatchCelebrate();
        settlePeriodEndPuck();
      }
    }
  }

  if (periodEndLive()) {
    ozHold.clear();
    clearUserOzPlan();
    ozEntrySide = 0;
    ozEntryFrame = Number.NaN;
    goalieCircleChase.clear();
    goalieLooseSkate.clear();
  }

  syncSauceWindow(act);
  releaseSelectSauce(act);

  if (world.stoppage) {
    dropWingClaims();
    world.stoppageT += dt;
    // The knock frame already returned past stepPuck. Keep the loose target
    // falling through the whistle so the replay includes it hitting the ice.
    if (ui.clockMode === "drill" || ui.clockMode === "scrimmage") stepDrillCards(dt);
    // Post-goal input, before this change:
    // input.ts has no whistle lock. Burst is B / Space (bDown). Dive is RT,
    // or RB on Wings, and was only read on the live path after this return.
    // X (gamepad button 2, also F/C/K) is xEdge. During a goal whistle the
    // user could skate, but integrateSkater was called with burst false.
    // X did not poke (the poke edge requires whistle !== "goal"). Dive never
    // started. B's rising edge skipped straight to the faceoff after 0.12 s,
    // so a burst press ended the whistle. Rage was beginGoalReactions only:
    // the scored-on CPU, never the user. A skater smash is armSkaterRage
    // (smashHit 0.7, then stepStickRage). A goalie smash waits until
    // stoppageT 1.22 and uses the same approach. Nothing aimed a smash at
    // the other net; rageSpot used defendDir.
    // A short B tap still skips. Holding B is the burst. Dive uses the live
    // button. X starts that smash when the user is within 2 m of a post or bar.
    if (world.whistle === "goal" && !world.periodOver) {
      if (act.bDown) goalBHold += dt;
      else if (goalBHold > 0 && goalBHold < GOAL_B_TAP && world.stoppageT > 0.12) {
        goalBHold = 0;
        if (!world.shootout) {
          if (endScrimmageMatch()) return;
          if (overtimeWinner) {
            endOvertimeMatch();
            world.faceoffA = true;
            return;
          }
          resetWorld({ keepScore: true });
          world.faceoffA = true;
          return;
        }
      } else goalBHold = 0;
      if (act.aEdge && !world.shootout) changePlayer();
    } else goalBHold = 0;
    if (world.whistle === "goal" && !world.shootout) {
      stepGoalCelebrate(dt);
      stepStickRage(dt);
      stepGoalReactions(dt);
      stepGoalieClear(dt);
      stepGoalPuck(dt);
    } else if (world.whistle === "goal") {
      stepGoalPuck(dt);
    }
    const user = world.skaters[world.userId];
    if (
      world.offsideCarrier !== null &&
      (world.userId !== world.offsideCarrier ||
        world.skaters[world.offsideCarrier]?.side !== "home")
    ) {
      if (world.puck.owner === world.offsideCarrier) world.puck.owner = null;
      world.offsideCarrier = null;
    }
    if (world.whistle === "offside") stepOffsideGlide(dt);
    const offsideCarry =
      world.whistle === "offside" && !!user && user.kind !== "goalie" && world.puck.owner === user.id;
    if (user && user.kind !== "goalie") {
      const wx = world.camRx * act.moveX + world.camFx * act.moveY;
      const wz = world.camRz * act.moveX + world.camFz * act.moveY;
      const mag = Math.hypot(act.moveX, act.moveY);
      if (offsideCarry) {
        if (world.faceoffA && !act.aDown && !act.aTap && !act.aHoldRel && !act.aEdge) world.faceoffA = false;
        const aReady = !world.faceoffA;
        if (aReady && act.bEdge && (act.aDown || act.aHoldRel || act.aTap)) passChargeCancel = true;
        const aim = shotAim(act);
        let passedThis = false;
        if (
          aReady &&
          !passChargeCancel &&
          (act.aTap || act.aHoldRel) &&
          world.time - world.lastPass > 0.2
        ) {
          withChargedPass(act.aHoldFor, act.viewDown, sauceHold, () => {
            doPass(user, aim.mx, aim.my, act.viewDown);
          });
          passedThis = true;
        }
        if (!act.aDown) passChargeCancel = false;
        if (!passedThis && !world.windupCancel && act.xTap && world.time - world.lastShoot > 0.25) {
          doShot(user, aim.mx, aim.my, false, world.shotWindupT);
        }
        if (!passedThis && !world.windupCancel && act.xHoldRel && world.time - world.lastShoot > 0.25) {
          doShot(user, aim.mx, aim.my, true, world.shotWindupT);
        }
        if (act.yEdge) {
          user.deke = 1.05;
          applyDeke(user);
        } else if (act.yDown && user.deke > 0.08) {
          user.deke = Math.max(user.deke, 0.5);
        }
        if (user.deke > 0) tickDeke(user, dt);
        const skill = stepSkillStick(user, act, world.lastShoot !== world.time);
        if (skill.loading) {
          skillStickLoading = true;
          world.lastUserActT = world.time;
        }
        if (act.xDown && !world.windupCancel) {
          accumulateOwnedShotWindup(user, dt);
          capBackhandWindup(user);
          if (act.bEdge) {
            world.windupCancel = true;
            user.windup = 0;
            world.shotWindupT = 0;
          } else if (!releaseHeldBackhand(user, act)) {
            markShotPlant();
          }
        } else if (skill.loading) {
          markShotPlant();
        } else if (user.follow <= 0) {
          user.windup = Math.max(0, user.windup - dt * 3);
          if (!act.xDown) world.shotWindupT = 0;
        }
        if (!act.xDown) world.windupCancel = false;
      } else {
        if (world.puck.owner !== user.id) {
          user.stickPull = 0;
          freshSkillGesture();
        }
        armSkillStickHit(user, act, world.puck.owner === user.id);
        finishSkillStickHit(user, act.yEdge);
        if (act.xEdge && world.whistle !== "goal") {
          user.poke = 0.34;
          if (user.kind === "goalie") armUserGoaliePokePose(user);
          const g = goalieInStickRange(user);
          if (g) bumpCreasePoke(g);
        }
      }
      applyBackskate(user, act);
      keepSkillHitFacing(user);
      if (user.hit > 0) applyHit(user);
      const raging = stepGoalWhistleRage(user, act);
      if ((world.whistle === "goal" || world.whistle === "offside") && !raging) stepGoalWhistleDive(user, act);
      if (!raging) {
        integrateSkater(user, wx, wz, mag, act.burst && !user.backskate, dt);
      }
      keepInBowl(user);
      if (offsideTailLive() && world.puck.owner === user.id) coastOffsidePuck(0);
      refreshUserStickCommit(act);
      if (world.whistle === "offside") {
        /* Non-user skaters already glided. The user is not in that drift. */
      } else {
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
        if (s.smashKind > 0 || goalRageBusy(s.id)) continue;
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
          world.whistle === "offside" &&
          world.offsideCarrier !== null &&
          world.puck.owner !== world.offsideCarrier;
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
      }
    } else {
      if (user && user.kind === "goalie" && (world.whistle === "goal" || world.whistle === "offside")) {
        const wx = world.camRx * act.moveX + world.camFx * act.moveY;
        const wz = world.camRz * act.moveX + world.camFz * act.moveY;
        const mag = Math.hypot(act.moveX, act.moveY);
        const raging = stepGoalWhistleRage(user, act);
        if (!raging) integrateSkater(user, wx, wz, mag, act.burst && !user.backskate, dt);
        keepInBowl(user);
        if (offsideTailLive() && world.puck.owner === user.id) coastOffsidePuck(0);
      }
      if (world.whistle === "offside") {
        /* Glide already slowed everyone but the user. Do not damp the puck again. */
      } else {
      const clearingId = scoredOnGoalie()?.id;
      for (const s of world.skaters) {
        if (user && s.id === user.id && user.kind === "goalie" && world.whistle === "goal") continue;
        if (s.kind === "goalie" && (s.stun > 0.04 || s.struck > 0.18 || s.tumble !== 0)) continue;
        if (s.id === clearingId) continue;
        if (s.smashKind > 0 || goalRageBusy(s.id)) continue;
        s.vx *= Math.exp(-4 * dt);
        s.vz *= Math.exp(-4 * dt);
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        if (s.struck > 0) s.struck = Math.max(0, s.struck - dt);
        syncCheckCycle(s);
      }
      if (world.whistle === "goal") {
        world.puck.vx *= Math.exp(-0.35 * dt);
        world.puck.vz *= Math.exp(-0.35 * dt);
      } else if (world.whistle !== "crowd") {
        world.puck.vx *= Math.exp(-3 * dt);
        world.puck.vz *= Math.exp(-3 * dt);
      }
      }
    }
    const clearing = scoredOnGoalie();
    for (const s of world.skaters) {
      if (s.kind !== "goalie") continue;
      if (world.whistle === "offside") continue;
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
    if (world.whistle === "offside") {
      const mine = world.puck.owner === world.userId;
      if (ui.hasPuck !== mine) ui.setHasPuck(mine);
      if (
        !mine &&
        (ui.charge !== 0 ||
          ui.chargeKind !== null ||
          ui.sauce !== 0 ||
          ui.chargeWind !== null ||
          ui.chargeMark !== null)
      ) {
        ui.setCharge(0, null, 0, null, null);
      }
    }
    if (world.whistle === "crowd") stepCrowdPuck(dt);
    stepRef(dt);
    updateCoverPose(dt);
    if (world.whistle === "goal" || offsideTailLive()) recordReplay();
    if (world.shootout) parkShootoutBench();
    if (world.whistle === "crowd") {
      // Goal, offside, and cover keep their own stoppage limits.
      if (world.stoppageT >= 2) {
        if (world.periodOver) return;
        resetWorld({ keepScore: true });
      }
    } else if (
      (world.whistle === "cover" && world.stoppageT >= COVER_STOPPAGE_S) ||
      (world.whistle !== "cover" && world.stoppageT > goalStoppageLimit())
    ) {
      if (world.periodOver) return;
      if (world.shootout) return;
      if (endScrimmageMatch()) return;
      if (overtimeWinner) {
        endOvertimeMatch();
        return;
      }
      resetWorld({ keepScore: true });
    }
    return;
  }

  const wings = ui.controlProfile === "wings";
  const soLive = world.shootout?.phase === "live" ? world.shootout : null;
  const soAttempt = soLive?.attempts[soLive.attempts.length - 1];
  if (soLive && soAttempt?.side === "home" && act.startDown) holdGoalie(true);
  else if (!soLive && world.shootout?.phase !== "result") holdGoalie(act.startDown);
  const user = world.skaters[world.userId];
  if (!user) {
    dropWingClaims();
    if (cpuDrillWatch && ui.clockMode === "drill") stepCpuDrillWatch(dt);
    else if (ui.clockMode === "practice" || ui.clockMode === "scrimmage") stepOpenIce(dt, act);
    return;
  }

  if (world.faceoff) {
    dropWingClaims();
    const taker = world.skaters[world.homeDot] ?? user;
    stepFaceoff(dt, act, taker);
    for (const s of world.skaters) {
      if (s.id === world.homeDot || s.id === world.awayDot || s.kind === "goalie") {
        if (s.kind === "goalie" && s.id !== world.userId) {
          thinkGoalie(s, dt);
          refreshCpuBackskate(s);
          if (s.backskate) lockBackskateYaw(s);
        }
        continue;
      }
      refreshCpuBackskate(s);
      if (world.faceoffPhase !== "live" && s.kind === "winger") continue;
      const ai = thinkWithoutPuck(s);
      integrateSkater(s, ai.wx, ai.wz, ai.mag * 0.5, false, dt);
      if (s.hit > 0) applyHit(s);
      keepOutOfCircle(s);
      keepInBowl(s);
    }
    if (user.kind === "goalie") {
      const wx = world.camRx * act.moveX + world.camFx * act.moveY;
      const wz = world.camRz * act.moveX + world.camFz * act.moveY;
      integrateSkater(user, wx, wz, Math.hypot(act.moveX, act.moveY), act.burst, dt);
      if (user.dive <= 0) orientGoalieOut(user, dt);
      keepInBowl(user);
    }
    stepRef(dt);
    separateSkaters();
    let restoreFaceoffLock: (() => void) | null = null;
    if (world.faceoff && useGame.getState().clockMode !== "drill") {
      lockDot(
        world.skaters[world.homeDot],
        world.faceX + defendDir("home") * FACEOFF_DOT_X,
        world.faceZ,
        faceYaw("home"),
      );
      lockDot(
        world.skaters.find((s) => s.id === world.awayDot),
        world.faceX + defendDir("away") * FACEOFF_DOT_X,
        world.faceZ,
        faceYaw("away"),
      );
      if (world.faceoffPhase !== "live") {
        const lane = dropperLane();
        const drop = refForLane(lane);
        drop.x = world.faceX;
        drop.z = world.faceZ + lane * REF_STAND;
        drop.vx = 0;
        drop.vz = 0;
      }
      const pair = faceoffCenters();
      if (pair) {
        const [home, away] = pair;
        const hx = home.x;
        const hz = home.z;
        const ax = away.x;
        const az = away.z;
        const px = world.puck.x;
        const pz = world.puck.z;
        holdFaceoffGap(true);
        restoreFaceoffLock = () => {
          home.x = hx;
          home.z = hz;
          away.x = ax;
          away.z = az;
          world.puck.x = px;
          world.puck.z = pz;
        };
      } else {
        // No opposing forward, so the gap has nobody to push against. The snap
        // still steps the lone center back to the same side of the dot.
        const home = world.homeDot >= 0 ? world.skaters[world.homeDot] : undefined;
        const away = world.awayDot >= 0 ? world.skaters.find((s) => s.id === world.awayDot) : undefined;
        const lone = home && !away ? home : away && !home ? away : undefined;
        if (lone && lone.kind !== "goalie") {
          const hx = lone.x;
          const hz = lone.z;
          const back = Math.max(0, FACEOFF_BODY_GAP * 0.5 - FACEOFF_DOT_X);
          lone.x += defendDir(lone.side) * back;
          restoreFaceoffLock = () => {
            lone.x = hx;
            lone.z = hz;
          };
        }
      }
    }
    recordReplay();
    // The snap keeps the body gap. Live roots stay on the dots so the crouch still reaches the puck.
    restoreFaceoffLock?.();
    return;
  }

  if (cpuDrillActive()) parkCpuDrillBystanders();

  const hasPuck = world.puck.owner === user.id;
  const homeGoalie = world.skaters.find((s) => s.side === "home" && s.kind === "goalie");
  const goalieHas = !!homeGoalie && world.puck.owner === homeGoalie.id;
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
    act.lbDown ||
    act.viewDown ||
    act.startDown ||
    (wings && act.rbDown)
  ) {
    world.lastUserActT = world.time;
  }
  if (world.faceoffA && !act.aDown && !act.aTap && !act.aHoldRel && !act.aEdge) {
    world.faceoffA = false;
  }
  const aReady = !world.faceoffA;
  const canChargePass = aReady && (hasPuck || (goalieHas && user.kind !== "goalie"));
  // B while A is down latches a cancel. Releasing A after that must not pass.
  if (!periodEndLive() && canChargePass && act.bEdge && (act.aDown || act.aHoldRel || act.aTap)) passChargeCancel = true;

  if (act.xEdge && opponentOwnsPuck(user)) {
    xPokePress = true;
    xPokeArmed = true;
    world.shotWindupT = 0;
    user.windup = 0;
  }
  const pokePressShot = blockShotFromPokePress(act);
  if ((!periodEndLive() || periodEndUserPlay) && hasPuck) {
    if (user.kind === "goalie") {
      const aim = shotAim(act);
      if (
        aReady &&
        !passChargeCancel &&
        (act.aTap || act.aHoldRel) &&
        world.time - world.lastPass > 0.2
      ) {
        withChargedPass(act.aHoldFor, act.viewDown, sauceHold, () => {
          doGoalieOutlet(user, aim.mx, aim.my, act.viewDown);
        }, true);
      }
      if (!pokePressShot && (act.xTap || act.xHoldRel) && world.time - world.lastShoot > 0.25) {
        doShot(user, act.moveX, act.moveY, act.xHoldRel, world.shotWindupT);
      }
    } else {
      let passedThis = false;
      const aim = shotAim(act);
      if (
        aReady &&
        !passChargeCancel &&
        (act.aTap || act.aHoldRel) &&
        world.time - world.lastPass > 0.2
      ) {
        withChargedPass(act.aHoldFor, act.viewDown, sauceHold, () => {
          doPass(user, aim.mx, aim.my, act.viewDown);
        });
        passedThis = true;
      }
      if (passedThis && (act.xDown || act.xEdge || act.xTap || act.xHeld || act.xHoldRel)) {
        world.oneTimerArmed = true;
        world.oneTimerPass = false;
        world.oneTimerSaucer = false;
      }
      const snapped = !passedThis && !pokePressShot && tryReboundSnap(user, act);
      const shotWait = ui.clockMode === "drill" ? 0.02 : 0.25;
      if (
        !pokePressShot &&
        !passedThis &&
        !snapped &&
        !world.windupCancel &&
        act.xTap &&
        world.time - world.lastShoot > shotWait
      ) {
        doShot(user, aim.mx, aim.my, false, world.shotWindupT);
      }
      if (
        !pokePressShot &&
        !passedThis &&
        !snapped &&
        !world.windupCancel &&
        act.xHoldRel &&
        world.time - world.lastShoot > shotWait
      ) {
        doShot(user, aim.mx, aim.my, true, world.shotWindupT);
      }
      if (!periodEndLive() && act.yEdge) {
        user.deke = 1.05;
        applyDeke(user);
      } else if (!periodEndLive() && act.yDown && user.deke > 0.08) {
        user.deke = Math.max(user.deke, 0.5);
      }
      const skill = stepSkillStick(
        user,
        act,
        !passedThis && !snapped && world.lastShoot !== world.time,
      );
      if (skill.loading) {
        skillStickLoading = true;
        world.lastUserActT = world.time;
      }
    }
    if (user.deke > 0) tickDeke(user, dt);
    if (!pokePressShot && act.xDown && !world.windupCancel) {
      accumulateOwnedShotWindup(user, dt);
      capBackhandWindup(user);
      if (act.bEdge) {
        world.windupCancel = true;
        user.windup = 0;
        world.shotWindupT = 0;
      } else if (user.kind !== "goalie" && !releaseHeldBackhand(user, act)) {
        markShotPlant();
      }
    } else if (skillStickLoading && user.kind !== "goalie") {
      markShotPlant();
    } else if (user.follow <= 0) {
      user.windup = Math.max(0, user.windup - dt * 3);
      if (!act.xDown) world.shotWindupT = 0;
    }
    if (!act.xDown) world.windupCancel = false;
    if (periodEndLive()) skatePeriodEndContact(user, act, wings, mag, wx, wz);
  } else if (!periodEndLive()) {
    const yHit = act.yEdge;
    const rbPoke = !yHit && skillStickPokePush(user, act);
    const sweep = !yHit && !rbPoke && skillStickSweep(user, act);
    const skillPoke = rbPoke || sweep;
    if (sweep) skillSweepPoke = true;
    if (skillPoke && !act.xEdge) xPokeArmed = false;
    if (skillPoke) skillPokePush = true;
    else armSkillStickHit(user, act, false);
    if (user.kind !== "goalie") stepSkillStick(user, act, false);
    const g = homeGoalie;
    const xGo = act.xEdge || act.xTap || act.xDown || act.xHoldRel;
    if (
      aReady &&
      !passChargeCancel &&
      goalieHas &&
      g &&
      (act.aTap || act.aHoldRel) &&
      world.time - world.lastPass > 0.12
    ) {
      const aim = shotAim(act);
      withChargedPass(act.aHoldFor, act.viewDown, sauceHold, () => {
        doGoalieOutlet(g, aim.mx, aim.my, act.viewDown, true);
      }, true);
    } else if (
      goalieHas &&
      g &&
      (act.xTap || act.xHoldRel) &&
      world.time - world.lastShoot > 0.25
    ) {
      const aim = shotAim(act);
      doShot(g, aim.mx, aim.my, act.xHoldRel, world.shotWindupT);
    } else if (aReady && act.aEdge && !goalieHas && !shootoutLive()) {
      changePlayer();
    }
    const shotArm = xGo;
    if (user.kind !== "goalie" && userPassInFlight() && shotArm) {
      world.oneTimerArmed = true;
      world.oneTimerPass = false;
      world.oneTimerSaucer = false;
      user.poke = 0;
    } else if (!pokePressShot && tryReboundSnap(user, act)) {
      user.poke = 0;
    } else if (
      (act.xEdge || skillPoke) &&
      !goalieHas &&
      (user.kind === "goalie" || (!world.oneTimerArmed && !userPassInFlight()))
    ) {
      if (skillPoke) faceSkillStickPoke(user, act);
      user.poke = 0.34;
      if (user.kind === "goalie") armUserGoaliePokePose(user);
    }
    finishSkillStickHit(user, yHit);
    // Wings dives on RB. Classic and Skill Stick stay on RT, so Skill Stick RB can poke.
    // A skater or goalie without the puck can start a dive through stun, a hit, a pass, or a one-timer.
    // A dive already in progress is left to decay. Releasing during the lunge still drops to recovery.
    // The goalie pose is latched from this stick, left versus right in the goalie's frame.
    const diveDown = wings ? act.rbDown : act.rtDown;
    const diveEdge = wings ? act.rbEdge : act.rtEdge;
    if (user.kind === "goalie") stepUserGoaliePads(user, act);
    else if (diveEdge && world.puck.owner !== user.id && user.dive <= 0) {
      user.poke = 0.52;
      user.dive = 1.5;
    } else if (user.dive > 1 && !diveDown) {
      user.dive = 0.95;
    }
    if (goalieHas && g && !world.oneTimerArmed) {
      // The user is still a skater, but X charges the goalie's shot. Same clock as
      // a user goalie hold. The release above already read shotWindupT.
      if (act.xDown && !world.windupCancel) {
        world.shotWindupT += dt;
        g.windup = Math.min(1, world.shotWindupT / SHOT_FULL_HOLD);
        if (act.bEdge) {
          world.windupCancel = true;
          g.windup = 0;
          world.shotWindupT = 0;
        }
      } else if (g.follow <= 0) {
        g.windup = Math.max(0, g.windup - dt * 3);
        if (!act.xDown) world.shotWindupT = 0;
      }
      if (!act.xDown) world.windupCancel = false;
    } else if (!pokePressShot && !world.oneTimerArmed && user.kind !== "goalie" && !goalieHas) {
      if (act.xDown && !world.windupCancel) {
        world.shotWindupT += dt;
        user.windup = Math.min(1, world.shotWindupT / SHOT_FULL_HOLD);
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
  } else {
    skatePeriodEndContact(user, act, wings, mag, wx, wz);
    if (user.windup > 0) user.windup = Math.max(0, user.windup - dt * 3);
    if (!act.xDown) world.shotWindupT = 0;
    world.oneTimerArmed = false;
    world.oneTimerSlap = false;
    world.oneTimerPass = false;
    world.oneTimerSaucer = false;
  }

  if (periodEndUserPlay && world.puck.owner !== world.userId) periodEndUserPlay = false;

  if (!periodEndLive() && world.oneTimerArmed) {
    const aim = shotAim(act);
    world.oneTimerMx = aim.mx;
    world.oneTimerMy = aim.my;
    if (act.xHeld && !world.windupCancel) {
      world.oneTimerSlap = true;
      world.shotWindupT += dt;
      const t = oneTimerReceiver();
      if (t) t.windup = Math.min(1, world.shotWindupT / SHOT_FULL_HOLD);
      if (act.bEdge) {
        world.windupCancel = true;
        world.oneTimerSlap = false;
        world.shotWindupT = 0;
        if (t) t.windup = 0;
      }
    }
    if (!act.xDown) world.windupCancel = false;
  }

  if (!periodEndLive()) tryFireArmedOneTimer();

  applyBackskate(user, act);
  keepSkillPokeFacing(user);
  // Through-body pickup has to run when the user is not backskating.
  pokeCheck(user);
  keepSkillHitFacing(user);
  if (user.hit > 0) {
    if (applyHit(user)) world.whiffPending = false;
  } else if (world.whiffPending) {
    world.whiffPending = false;
    if (cpuAttacking()) world.whiffUntil = world.time + 4.5;
  }

  if (!act.aDown) passChargeCancel = false;

  const commitStick = shotAim(act);
  trackWindupCommit(user, commitStick.mx, commitStick.my);

  // HUD meters. Pass speed fills from aHoldFor across PASS_FULL_HOLD, and only while A is down.
  // Sauce fills from Select's hold across SAUCE_FULL_HOLD, including while A is still up.
  // The two bars do not share a clock. A clean Select hold past SAUCE_CLEAR_HOLD reads Clear.
  // The shot meter used to step to 0.4, then to full once xHeld (0.28s), and the label always said Slap.
  // Skater bar: snap under 0.1s, wrist until half of SHOT_FULL_HOLD, then slap.
  // A goalie shot, including X while the home goalie has the puck, is one section and no tick.
  // shotKind on the speed line stays the previous release. chargeWind is this windup.
  // A sauce-only hold leaves chargeKind null and chargeWind "Saucer" or "Clear" so the pass bar stays hidden.
  let charge = 0;
  let kind: "pass" | "saucer" | "shot" | null = null;
  let sauce = 0;
  let wind: string | null = null;
  let mark: readonly number[] | null = null;
  if (!periodEndLive() && canChargePass && act.aDown && !passChargeCancel) {
    charge = Math.min(1, Math.max(0, act.aHoldFor) / PASS_FULL_HOLD);
    if (act.viewDown) {
      kind = "saucer";
      sauce = sauceCharge01(sauceHold);
      wind = sauceMeterWind();
    } else {
      kind = "pass";
      wind = "Pass";
    }
  } else if (
    !periodEndLive() &&
    act.xDown &&
    !world.windupCancel &&
    (hasPuck || goalieHas || world.shotWindupT > 0.28)
  ) {
    charge = Math.min(1, Math.max(0, world.shotWindupT) / SHOT_FULL_HOLD);
    kind = "shot";
    const directingGoalie = goalieHas && user.kind !== "goalie";
    const back = hasPuck && user.kind !== "goalie" && windupBackhand(user);
    if ((hasPuck && user.kind === "goalie") || directingGoalie) {
      wind = "Shot";
    } else if (back) {
      wind = "Backhand";
    } else if (!hasPuck && world.oneTimerArmed && world.oneTimerSlap) {
      wind = "Slap";
      mark = ONE_TIMER_NOTCH;
    } else {
      wind = charge < SKATER_CHARGE_NOTCHES[0] ? "Snap" : charge < SKATER_CHARGE_NOTCHES[1] ? "Wrist" : "Slap";
      mark = SKATER_CHARGE_NOTCHES;
    }
  } else if (!periodEndLive() && canChargePass && act.viewDown && !passChargeCancel) {
    sauce = sauceCharge01(sauceHold);
    wind = sauceMeterWind();
  }
  if (act.xDown) {
    const aim = shotAim(act);
    slapMx = aim.mx;
    slapMy = aim.my;
  }
  if (
    ui.charge !== charge ||
    ui.chargeKind !== kind ||
    ui.sauce !== sauce ||
    ui.chargeWind !== wind ||
    ui.chargeMark !== mark
  ) {
    ui.setCharge(charge, kind, sauce, wind, mark);
  }
  const playGoalie =
    user.kind === "goalie" && world.puck.owner === user.id
      ? user
      : user.kind !== "goalie" && homeGoalie && world.puck.owner === homeGoalie.id
        ? homeGoalie
        : null;
  const chargingPlay =
    !!playGoalie &&
    !periodEndLive() &&
    ((aReady && !passChargeCancel && (act.aDown || act.viewDown)) || (act.xDown && !world.windupCancel));
  goaliePlayChargeId = chargingPlay && playGoalie ? playGoalie.id : -1;

  applyWingClaims(user, act, wings);

  const userGoalie = user.kind === "goalie";
  const userDiving = user.dive > 0;
  const userStickIdle = mag < 0.16 && !act.xDown && !act.aDown;
  const userLoose = userGoalie && !hasPuck && userStickIdle && !userDiving && goaliePlayLoose(user);
  const userEscape = userGoalie && !userDiving && keepGoalieOffNet(user, userStickIdle && !hasPuck);
  const userNet =
    userGoalie &&
    !hasPuck &&
    userStickIdle &&
    !userDiving &&
    !userLoose &&
    (goalieLineDepth(user) > 0.05 || goalieAgainstCage(user));
  if (userGoalie && userLoose && !userEscape) goalieLooseSkate.add(user.id);
  else goalieLooseSkate.delete(user.id);
  if (shootoutGoalieOnAi(user)) {
    thinkGoalie(user, dt);
  } else if (userDiving) {
    goalieCircleChase.delete(user.id);
    integrateSkater(user, wx, wz, mag, false, dt);
  } else if (!user.backskate && !periodEndLive() && !world.shootout?.goalieUser && (userEscape || userNet)) {
    skateGoalieBack(user, dt);
  } else if (!user.backskate && !periodEndLive() && userLoose && !world.shootout?.goalieUser) {
    if (puckAtGoalieCircleTop(user.side)) goalieCircleChase.add(user.id);
    const spot = goalieRetrievePoint(user);
    skateGoalieTo(user, spot.x, spot.z, dt);
  } else {
    integrateSkater(user, wx, wz, mag, act.burst && !user.backskate, dt);
    if (user.kind === "goalie" && user.dive <= 0 && !user.backskate) orientGoalieOut(user, dt);
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
    refreshCpuBackskate(s);
    const ai = thinkAi(s, dt);
    if (s.kind === "goalie") {
      refreshCpuBackskate(s);
      if (s.backskate) lockBackskateYaw(s);
    } else {
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
  ownGoalieTakeUserPuck(user);
  sealGoalieCircleChases(user.kind === "goalie" && !userStickIdle);

  if (!periodEndLive() && hasPuck && user.kind !== "goalie") {
    const idle =
      mag < 0.12 &&
      !act.aDown &&
      !act.xDown &&
      !act.yDown &&
      !act.bDown &&
      !act.burst &&
      user.deke <= 0;
    if (idle) {
      const n = nearestFoe(user);
      if (n.foe && n.d < 1.85) world.idlePokeT += dt;
      else world.idlePokeT = Math.max(0, world.idlePokeT - dt * 0.35);
      if (
        world.idlePokeT >= 2 &&
        n.foe &&
        n.d < 1.85 &&
        !userStickCommit &&
        !skillProtectBlocks(user, n.foe)
      ) {
        cpuIdlePoke(n.foe, user);
      }
    } else {
      world.idlePokeT = 0;
    }
  } else {
    world.idlePokeT = 0;
  }

  easeBurstPoses(dt);
  restrainLiveShootout();
  stepPuck(dt);
  if (!world.stoppage) checkCover(dt, act);
  updateCoverPose(dt);
  stepRef(dt);
  autoSwitchToHolder();
  if (world.wingL === world.userId || world.wingL === world.puck.owner) world.wingL = null;
  if (world.wingR === world.userId || world.wingR === world.puck.owner) world.wingR = null;

  const mine = world.puck.owner === world.userId;
  if (ui.hasPuck !== mine) ui.setHasPuck(mine);

  tickShotSpeed();
  settleLiveShootout();
  if (world.shootout?.phase === "done") parkShootoutBench();
  recordReplay();
}

/** Period countdown uses real time. Sim steps are scaled by the game-speed slider. */
function clockDt(dt: number): number {
  return dt / gameSpeedRate(useGame.getState().gameSpeed);
}

const SIM_STEP = 1 / 60;
let playAcc = 0;

/** One rendered frame. Game speed scales how many sim steps run, not the period clock. */
export function stepPlayFrame(realDt: number): void {
  const d = Math.min(realDt, 0.1);
  playAcc += d * gameSpeedRate(useGame.getState().gameSpeed);
  let n = 0;
  while (playAcc >= SIM_STEP && n < 8) {
    stepSim(SIM_STEP);
    playAcc -= SIM_STEP;
    n++;
  }
}

export function resetPlayFrame(): void {
  playAcc = 0;
}

export function stepSim(dt: number): void {
  const act = readActions();
  trackSkillStick(act);
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
    getReplay: () => ({
      on: world.replay,
      t: world.replayT,
      maxT: replaySpan(),
      playing: world.replayPlaying,
      pct: replayPct,
      lx: world.replayCam.lx,
      ly: world.replayCam.ly,
      lz: world.replayCam.lz,
      theta: world.replayCam.theta,
      phi: world.replayCam.phi,
      radius: world.replayCam.radius,
      px: world.puck.x,
      py: world.puck.y,
      pz: world.puck.z,
      lock: replayLock.kind,
      lockIndex: replayLock.kind === "skater" ? replayLock.index : -1,
      frameLocked: replayFrameLock,
      editId: replayEditId ?? -1,
      sx: replayLock.kind === "skater" ? (world.skaters[replayLock.index]?.x ?? 0) : 0,
      sz: replayLock.kind === "skater" ? (world.skaters[replayLock.index]?.z ?? 0) : 0,
      nSkaters: world.skaters.length,
    }),
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
        whistle:
          useGame.getState().whistle === "goal"
            ? 1
            : useGame.getState().whistle === "cover"
              ? 2
              : 0,
        puckX: world.puck.x,
        puckZ: world.puck.z,
        puckVx: world.puck.vx,
        lastShotDist: world.lastShotDist,
        homeWingerX:
          world.skaters.find(
            (p) => p.side === "home" && p.kind === "winger" && p.id !== world.homeDot,
          )?.x ?? 0,
        homeWingerZ:
          world.skaters.find(
            (p) => p.side === "home" && p.kind === "winger" && p.id !== world.homeDot,
          )?.z ?? 0,
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
      resetPassChain();
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
    forceGoal: (net?: 1 | -1) => {
      const side = net === -1 || net === 1 ? net : world.homeAttack;
      const want: "home" | "away" = side === world.homeAttack ? "home" : "away";
      const scorer =
        world.skaters.find((p) => p.id === world.userId && p.side === want && p.kind !== "goalie") ??
        world.skaters.find((p) => p.side === want && p.kind !== "goalie");
      if (scorer) world.lastShooter = scorer.id;
      world.puck.x = side * GOAL_LINE_X + side * 0.3;
      world.puck.z = 0;
      startStoppage("goal", side);
    },
  };
}

function moveMapKey<T>(map: Map<number, T>, from: number, to: number): void {
  if (from === to || !map.has(from)) return;
  const value = map.get(from)!;
  map.delete(from);
  map.set(to, value);
}

function moveSetKey(set: Set<number>, from: number, to: number): void {
  if (from === to || !set.has(from)) return;
  set.delete(from);
  set.add(to);
}

function forgetSkaterId(id: number): void {
  if (world.puck.owner === id) world.puck.owner = null;
  if (world.userId === id) world.userId = -1;
  if (world.homeDot === id) world.homeDot = -1;
  if (world.awayDot === id) world.awayDot = -1;
  if (world.lastPassTo === id) world.lastPassTo = null;
  if (world.lastPasser === id) world.lastPasser = null;
  if (world.lastShooter === id) world.lastShooter = null;
  if (world.ltReturnId === id) world.ltReturnId = null;
  if (world.wingL === id) world.wingL = null;
  if (world.wingR === id) world.wingR = null;
  if (world.offsideCarrier === id) world.offsideCarrier = null;
  if (world.lastHitter === id) world.lastHitter = null;
  if (world.creasePokeGoalie === id) world.creasePokeGoalie = null;
  if (world.namedPoseIndex === id) world.namedPoseIndex = null;
  if (world.benchDump?.id === id) world.benchDump = null;
  if (stickLooseBy === id) stickLooseBy = -1;
  if (stickLooseFrom === id) stickLooseFrom = -1;
  if (userAProtectId === id) userAProtectId = -1;
  if (userXProtectId === id) userXProtectId = -1;
  if (pressPrimary === id) pressPrimary = -1;
  if (pressSecond === id) pressSecond = -1;
  if (goalieReleaseId === id) goalieReleaseId = -1;
  if (passChaseId === id) passChaseId = -1;
  if (nzSafetyId === id) nzSafetyId = -1;
  if (endChaseHome === id) endChaseHome = -1;
  if (endChaseAway === id) endChaseAway = -1;
  if (precedeId === id) precedeId = null;
  delayOnside = delayOnside.filter((n) => n !== id);
  if (passSpeedCutFor === id) passSpeedCutFor = -1;
  if (cpuOtId === id) cpuOtId = -2;
  if (passChainHoldId === id) passChainHoldId = -1;
  if (goalieRageId === id) goalieRageId = null;
  if (boardCutId === id) boardCutId = -1;
  if (depthId === id) depthId = -1;
  ozHold.delete(id);
  wingAim.delete(id);
  playLooseMem.delete(id);
  goalieCircleChase.delete(id);
  goalieLooseSkate.delete(id);
  goalieBehindSince.delete(id);
  goalieNetEscape.delete(id);
  pressPeelAt.delete(id);
  pressPeelEnd.delete(id);
  cpuDekeAt.delete(id);
  cpuOtLook.delete(id);
  goalieDiveSave.delete(id);
  postMemo.delete(id);
  barMemo.delete(id);
  goalieMidBlade.delete(id);
  burstPoseW.delete(id);
  passerCheckedAt.delete(id);
  dekeCommit.delete(id);
  userCheckSkaters.delete(id);
  checkCloseLeft.delete(id);
  checkAbsorbed.delete(id);
  checkCycleIds.delete(id);
  delete cheerSlots[id];
  stickRages = stickRages.filter((rec) => rec.id !== id);
  goalRefChecks = goalRefChecks.filter((job) => job.id !== id);
  if (world.lineBrawl) {
    world.lineBrawl.pairs = world.lineBrawl.pairs.filter((p) => p.home !== id && p.away !== id);
    if (world.lineBrawl.focus === id || world.lineBrawl.pairs.length === 0) world.lineBrawl = null;
  }
}

function rewriteSkaterId(from: number, to: number): void {
  if (from === to) return;
  const num = (v: number) => (v === from ? to : v);
  const nul = (v: number | null) => (v === from ? to : v);
  world.userId = num(world.userId);
  if (world.puck.owner === from) world.puck.owner = to;
  world.homeDot = num(world.homeDot);
  world.awayDot = num(world.awayDot);
  world.lastPassTo = nul(world.lastPassTo);
  world.lastPasser = nul(world.lastPasser);
  world.lastShooter = nul(world.lastShooter);
  world.ltReturnId = nul(world.ltReturnId);
  world.wingL = nul(world.wingL);
  world.wingR = nul(world.wingR);
  world.offsideCarrier = nul(world.offsideCarrier);
  world.lastHitter = nul(world.lastHitter);
  world.creasePokeGoalie = nul(world.creasePokeGoalie);
  world.namedPoseIndex = nul(world.namedPoseIndex);
  if (world.benchDump?.id === from) world.benchDump.id = to;
  stickLooseBy = num(stickLooseBy);
  stickLooseFrom = num(stickLooseFrom);
  userAProtectId = num(userAProtectId);
  userXProtectId = num(userXProtectId);
  pressPrimary = num(pressPrimary);
  pressSecond = num(pressSecond);
  goalieReleaseId = num(goalieReleaseId);
  passChaseId = num(passChaseId);
  nzSafetyId = num(nzSafetyId);
  endChaseHome = num(endChaseHome);
  endChaseAway = num(endChaseAway);
  if (precedeId === from) precedeId = to;
  delayOnside = delayOnside.map((n) => (n === from ? to : n));
  passSpeedCutFor = num(passSpeedCutFor);
  cpuOtId = num(cpuOtId);
  passChainHoldId = num(passChainHoldId);
  if (goalieRageId === from) goalieRageId = to;
  boardCutId = num(boardCutId);
  depthId = num(depthId);
  moveMapKey(ozHold, from, to);
  moveMapKey(wingAim, from, to);
  moveMapKey(playLooseMem, from, to);
  moveSetKey(goalieCircleChase, from, to);
  moveSetKey(goalieLooseSkate, from, to);
  moveMapKey(goalieBehindSince, from, to);
  moveSetKey(goalieNetEscape, from, to);
  moveMapKey(pressPeelAt, from, to);
  moveMapKey(pressPeelEnd, from, to);
  moveMapKey(cpuDekeAt, from, to);
  moveMapKey(cpuOtLook, from, to);
  moveMapKey(goalieDiveSave, from, to);
  moveMapKey(postMemo, from, to);
  moveMapKey(barMemo, from, to);
  moveMapKey(goalieMidBlade, from, to);
  moveMapKey(burstPoseW, from, to);
  moveMapKey(passerCheckedAt, from, to);
  moveMapKey(dekeCommit, from, to);
  for (const rec of dekeCommit.values()) if (rec.deker === from) rec.deker = to;
  moveSetKey(userCheckSkaters, from, to);
  moveMapKey(checkCloseLeft, from, to);
  moveSetKey(checkAbsorbed, from, to);
  moveSetKey(checkCycleIds, from, to);
  if (cheerSlots[from]) {
    cheerSlots[to] = cheerSlots[from]!;
    delete cheerSlots[from];
  }
  for (const rec of stickRages) if (rec.id === from) rec.id = to;
  for (const job of goalRefChecks) if (job.id === from) job.id = to;
  if (world.lineBrawl) {
    if (world.lineBrawl.focus === from) world.lineBrawl.focus = to;
    for (const pair of world.lineBrawl.pairs) {
      if (pair.home === from) pair.home = to;
      if (pair.away === from) pair.away = to;
    }
  }
}

function removeSkater(s: Skater): void {
  let id = s.id;
  if (world.skaters[id] !== s) {
    id = world.skaters.indexOf(s);
    if (id < 0) return;
  }
  forgetSkaterId(id);
  const last = world.skaters.length - 1;
  if (id !== last) {
    const moved = world.skaters[last]!;
    world.skaters[id] = moved;
    rewriteSkaterId(moved.id, id);
    moved.id = id;
  }
  world.skaters.pop();
}

function kindList(side: "home" | "away", kind: SkaterKind): Skater[] {
  return world.skaters.filter((p) => p.side === side && p.kind === kind).sort((a, b) => a.id - b.id);
}

function chooseKeep(list: Skater[], count: number): Skater[] {
  if (count <= 0) return [];
  if (list.length <= count) return list;
  const rank = (s: Skater) => {
    if (s.id === world.userId) return 0;
    if (world.puck.owner === s.id) return 1;
    if (world.faceoff && (s.id === world.homeDot || s.id === world.awayDot)) return 2;
    return 3;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.id - b.id).slice(0, count);
}

function nextJersey(side: "home" | "away", kind: SkaterKind, used: Set<number>): number {
  const nums = side === "home" ? HOME_NUMS : awayNums;
  const list = kind === "goalie" ? nums.g : kind === "defense" ? nums.d : nums.o;
  for (const n of list) {
    if (n != null && !used.has(n)) return n;
  }
  let n = kind === "goalie" ? 31 : kind === "defense" ? 4 : 9;
  while (used.has(n)) n += 1;
  return n;
}

function placeIncoming(s: Skater, indexAmongKind: number): void {
  s.vx = 0;
  s.vz = 0;
  s.yaw = faceYaw(s.side);
  const sign = defendDir(s.side);
  if (s.kind === "goalie") {
    s.x = sign * (GOAL_LINE_X - 0.9);
    s.z = 0;
    return;
  }
  if (world.faceoff) {
    const zOff = laneZ(4, indexAmongKind % 4, 3.2);
    s.x = world.faceX + sign * (FACEOFF_R + 1.15);
    s.z = world.faceZ + zOff;
    return;
  }
  if (s.kind === "defense") {
    s.x = sign * 16;
    s.z = laneZ(Math.max(2, indexAmongKind + 1), indexAmongKind, 4.4);
    return;
  }
  s.x = sign * (7.2 + (indexAmongKind % 2) * 2.4);
  s.z = laneZ(Math.max(2, indexAmongKind + 1), indexAmongKind, 5.4);
}

function ensureLiveUser(): void {
  const cur = world.userId >= 0 ? world.skaters[world.userId] : undefined;
  if (cur && cur.side === "home") return;
  const home = world.skaters.filter((s) => s.side === "home");
  const pick = home.find((s) => s.kind === "winger") ?? home.find((s) => s.kind !== "goalie") ?? home[0];
  world.userId = pick ? pick.id : -1;
}

function syncSideLineup(side: "home" | "away", lu: Lineup): void {
  const slots: { kind: SkaterKind; n: number }[] = [
    { kind: "goalie", n: lu.g },
    { kind: "defense", n: lu.d },
    { kind: "winger", n: lu.o },
  ];
  const drop: Skater[] = [];
  const add: { kind: SkaterKind; index: number }[] = [];
  for (const slot of slots) {
    const have = kindList(side, slot.kind);
    const keep = new Set(chooseKeep(have, slot.n));
    for (const s of have) if (!keep.has(s)) drop.push(s);
    for (let i = have.length; i < slot.n; i++) add.push({ kind: slot.kind, index: i });
  }
  drop.sort((a, b) => b.id - a.id);
  for (const s of drop) removeSkater(s);
  const used = new Set<number>();
  for (const s of world.skaters) if (s.side === side) used.add(s.number);
  for (const slot of add) {
    const num = nextJersey(side, slot.kind, used);
    used.add(num);
    const s = makeSkater(world.skaters.length, side, slot.kind, num, 0, 0);
    placeIncoming(s, slot.index);
    world.skaters.push(s);
  }
}

/** Match the on-ice roster to the live lineup. Clock, score, puck, and whistle stay. */
export function applyLiveLineup(side: "home" | "away"): void {
  const ui = useGame.getState();
  if (!ui.playing || regOtIce() || world.shootout) return;
  const lu = side === "home" ? ui.liveHome : ui.liveAway;
  syncSideLineup(side, lu);
  ensureLiveUser();
  pressCacheT = Number.NaN;
  depthFrame = Number.NaN;
  const mine = world.puck.owner !== null && world.puck.owner === world.userId;
  if (ui.hasPuck !== mine) ui.setHasPuck(mine);
  if (!mine && ui.chargeKind) ui.setCharge(0, null);
}

resetWorld();

declare global {
  interface Window {
    __hfb?: {
      pause: () => void;
    };
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
      getReplay?: () => {
        on: boolean;
        t: number;
        maxT: number;
        playing: boolean;
        pct: number;
        lx: number;
        ly: number;
        lz: number;
        px: number;
        py: number;
        pz: number;
        lock: "free" | "puck" | "skater";
        lockIndex: number;
        sx: number;
        sz: number;
        nSkaters: number;
      };
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
