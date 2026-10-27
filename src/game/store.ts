import { create } from "zustand";
import { COL_KIT, UNIFORMS } from "./uniforms";

export type CamMode = "classic" | "chase" | "broadcast" | "high" | "freestyle";
export type ArenaLook = "light" | "dark";

export type Lineup = { g: number; d: number; o: number };
export type PlayMode = "practice" | "roller" | "scrimmage" | "game" | "drill" | "shootout";
export type DrillTargets = 4 | 8 | 12 | 16;
export type ControlProfile = "classic" | "wings" | "stick";
/** Playoff keeps 20:00 5-on-5 sudden death. Reg is one 5:00 3-on-3 period, then a shootout. */
export type OtFormat = "reg" | "playoff";
export type ShootoutResult = "goal" | "save";
/** Scheduled shootout rounds before sudden death. */
export type ShootoutRounds = 3 | 5 | 7;
/** One shootout try. `result` stays null while the shooter is still on the ice. */
export type ShootoutAttempt = {
  side: "home" | "away";
  number: number;
  result: ShootoutResult | null;
};
/** One column per round. Missing shots stay null so the cell stays empty. */
export function shootoutColumns(
  attempts: readonly ShootoutAttempt[],
  rounds: ShootoutRounds = 3,
): {
  away: (ShootoutResult | null)[];
  home: (ShootoutResult | null)[];
} {
  const away: (ShootoutResult | null)[] = [];
  const home: (ShootoutResult | null)[] = [];
  for (const a of attempts) (a.side === "away" ? away : home).push(a.result);
  const n = Math.max(away.length, home.length, rounds);
  while (away.length < n) away.push(null);
  while (home.length < n) home.push(null);
  return { away, home };
}

/** Record the HUD can read. The live approach and puck stay on the sim. */
export type ShootoutRecord = {
  first: "home" | "away";
  order: { home: readonly number[]; away: readonly number[] };
  attempts: readonly ShootoutAttempt[];
  /** On-ice skaters sitting out this attempt. The shooter and both goalies are omitted. */
  bench: { home: readonly number[]; away: readonly number[] };
  /** Columns scheduled before sudden death. Captured when the series starts. */
  rounds: ShootoutRounds;
};
export type ShotKind = "wrist" | "snap" | "slap" | "backhand";
export type HudRelease = ShotKind | "pass" | "saucer";

/** One row of the practice shot profile. Attempts, shots on goal, and goals. */
export type ShotTally = { attempts: number; onGoal: number; goals: number };
export type PracticeShotProfile = Record<ShotKind, ShotTally>;
export type TeamShotCounts = { attempts: number; onGoal: number };
export type TeamShots = { home: TeamShotCounts; away: TeamShotCounts };

export function emptyTeamShots(): TeamShots {
  return {
    home: { attempts: 0, onGoal: 0 },
    away: { attempts: 0, onGoal: 0 },
  };
}

export function emptyPracticeShots(): PracticeShotProfile {
  return {
    backhand: { attempts: 0, onGoal: 0, goals: 0 },
    snap: { attempts: 0, onGoal: 0, goals: 0 },
    wrist: { attempts: 0, onGoal: 0, goals: 0 },
    slap: { attempts: 0, onGoal: 0, goals: 0 },
  };
}

/** A released wrist, snap, slap, or backhand. Passes, saucers, and unlabeled clears are not attempts. */
export function isShotAttemptKind(kind: HudRelease | null): kind is ShotKind {
  return kind === "wrist" || kind === "snap" || kind === "slap" || kind === "backhand";
}

export function hudReleaseName(kind: HudRelease | null): string {
  if (kind === "slap") return "slap shot";
  if (kind === "snap") return "snap shot";
  if (kind === "wrist") return "wrist shot";
  if (kind === "backhand") return "backhand shot";
  if (kind === "saucer") return "saucer pass";
  if (kind === "pass") return "pass";
  return "Shot";
}
export type WhistleKind = "goal" | "cover" | "offside" | "brawl" | "crowd" | null;

export const LINEUP_CAP = 6;
export const CHAOS_CAP = 11;

export const MODE_LINEUPS: Record<PlayMode, { home: Lineup; away: Lineup }> = {
  practice: { home: { g: 0, d: 0, o: 1 }, away: { g: 1, d: 0, o: 0 } },
  roller: { home: { g: 1, d: 1, o: 3 }, away: { g: 1, d: 1, o: 3 } },
  scrimmage: { home: { g: 0, d: 2, o: 3 }, away: { g: 0, d: 2, o: 3 } },
  game: { home: { g: 1, d: 2, o: 3 }, away: { g: 1, d: 2, o: 3 } },
  drill: { home: { g: 0, d: 0, o: 1 }, away: { g: 0, d: 0, o: 0 } },
  /** Same starting five as a game, so the first five shooters are those skaters. */
  shootout: { home: { g: 1, d: 2, o: 3 }, away: { g: 1, d: 2, o: 3 } },
};

export function modeLineupCap(mode: PlayMode): number {
  return mode === "roller" || mode === "scrimmage" ? 5 : 6;
}

export const DEFAULT_HOME: Lineup = { ...MODE_LINEUPS.roller.home };
export const DEFAULT_AWAY: Lineup = { ...MODE_LINEUPS.roller.away };

export function lineupTotal(l: Lineup): number {
  return l.g + l.d + l.o;
}

export function clampSlot(slot: keyof Lineup, v: number): number {
  const max = slot === "g" ? 1 : slot === "d" ? 2 : 4;
  return Math.max(0, Math.min(max, Math.round(v)));
}

export function patchLineup(
  l: Lineup,
  slot: keyof Lineup,
  v: number,
  cap = LINEUP_CAP,
  goalieExtra = false,
): Lineup {
  const n = clampSlot(slot, v);
  const next = { ...l, [slot]: n };
  if (goalieExtra) {
    if (next.g > 1 || next.d + next.o > cap) return l;
    return next;
  }
  if (lineupTotal(next) > cap) return l;
  return next;
}

export function releaseFromBox(l: Lineup, cap = LINEUP_CAP): Lineup {
  if (lineupTotal(l) >= cap) return l;
  if (l.o < 3) return { ...l, o: l.o + 1 };
  if (l.d < 2) return { ...l, d: l.d + 1 };
  if (l.g < 1) return { ...l, g: 1 };
  if (l.o < 4) return { ...l, o: l.o + 1 };
  if (cap <= LINEUP_CAP) return l;
  if (l.o < 6) return { ...l, o: l.o + 1 };
  if (l.d < 4) return { ...l, d: l.d + 1 };
  return l;
}

type GameUi = {
  playing: boolean;
  paused: boolean;
  camAdjust: boolean;
  camMode: CamMode;
  freeCamLive: boolean;
  homeKit: number;
  awayKit: number;
  homeLineup: Lineup;
  awayLineup: Lineup;
  liveHome: Lineup;
  liveAway: Lineup;
  lineupRev: number;
  powerPlay: boolean;
  chaos: boolean;
  speed: number;
  shotKind: HudRelease | null;
  /** Practice only. Wrist, snap, slap, and backhand attempts, shots on goal, and goals. */
  practiceShots: PracticeShotProfile;
  /** Both teams. Shot attempts and shots on goal for the scoreboard. */
  teamShots: TeamShots;
  quality: "high" | "low";
  arenaLook: ArenaLook;
  pad: "Keyboard" | "Gamepad";
  hasPuck: boolean;
  charge: number;
  chargeKind: "pass" | "saucer" | "shot" | null;
  /** 0–1 sauce height while Select is held. 0 hides nothing by itself; the saucer kind shows the meter. */
  sauce: number;
  /** Live charge label: Pass, Saucer, Clear, Snap, Wrist, Slap, Shot, or Backhand. Not the previous release. */
  chargeWind: string | null;
  /** Shot-meter ticks, fractions of the full windup. Empty when the bar has no sections. */
  chargeMark: readonly number[] | null;
  homeScore: number;
  awayScore: number;
  whistle: WhistleKind;
  delayedOffside: boolean;
  passChain: number;
  goalSide: "home" | "away" | null;
  replay: boolean;
  clockMode: PlayMode;
  controlProfile: ControlProfile;
  gameMinutes: number;
  rollerMinutes: number;
  otFormat: OtFormat;
  /** Roller overtime. Separate from the Game format so each mode keeps its own default. */
  rollerOtFormat: OtFormat;
  /** Initial shootout rounds for Reg OT and the Shootout minigame. */
  shootoutRounds: ShootoutRounds;
  /** Null outside a regular-season shootout. Kept after it ends until the next reset. */
  shootout: ShootoutRecord | null;
  period: number;
  periodClock: number;
  periodOver: boolean;
  periodBreak: number;
  drillScore: number;
  drillTargets: DrillTargets;
  scrimmageHomeTargets: DrillTargets;
  scrimmageAwayTargets: DrillTargets;
  scrimmageHomeDown: number;
  scrimmageAwayDown: number;
  checkRefs: boolean;
  checkGoalies: boolean;
  lineBrawl: boolean;
  /**
   * Old Ignore Auto-Find. True skips teammate search.
   * The pause button shows the opposite and is labeled Pass Lock.
   */
  ignoreAutoFind: boolean;
  /** Aimed passes snap onto a teammate in the cone. The pause button is Snap Pass. */
  passLock: boolean;
  offsides: boolean;
  gameSpeed: number;
  cpuOffense: number;
  cpuDefense: number;
  cpuGoalie: number;
  userOffense: number;
  userDefense: number;
  userGoalie: number;
  setPlaying: (v: boolean) => void;
  setPaused: (v: boolean) => void;
  setCamAdjust: (v: boolean) => void;
  setCamMode: (m: CamMode) => void;
  setFreeCamLive: (v: boolean) => void;
  setHomeKit: (id: number) => void;
  setAwayKit: (id: number) => void;
  rerollAwayKit: () => void;
  rerollClockMode: () => void;
  applyCornerReset: () => void;
  setHomeLineup: (l: Lineup) => void;
  setAwayLineup: (l: Lineup) => void;
  setLiveHome: (l: Lineup) => void;
  setLiveAway: (l: Lineup) => void;
  bumpLineup: () => void;
  setPowerPlay: (v: boolean) => void;
  setChaos: (v: boolean) => void;
  setSpeed: (n: number) => void;
  setShotKind: (k: HudRelease | null) => void;
  notePracticeShot: (kind: ShotKind, field: keyof ShotTally) => void;
  resetPracticeShots: () => void;
  noteTeamShot: (side: "home" | "away", field: keyof TeamShotCounts) => void;
  resetTeamShots: () => void;
  setQuality: (q: "high" | "low") => void;
  setArenaLook: (v: ArenaLook) => void;
  setPad: (s: "Keyboard" | "Gamepad") => void;
  setHasPuck: (v: boolean) => void;
  setCharge: (
    n: number,
    kind: "pass" | "saucer" | "shot" | null,
    sauce?: number,
    wind?: string | null,
    mark?: readonly number[] | null,
  ) => void;
  setHomeScore: (n: number) => void;
  setAwayScore: (n: number) => void;
  setWhistle: (w: WhistleKind) => void;
  setDelayedOffside: (v: boolean) => void;
  setPassChain: (n: number) => void;
  setGoalSide: (s: "home" | "away" | null) => void;
  setReplay: (v: boolean) => void;
  setClockMode: (m: PlayMode) => void;
  setControlProfile: (v: ControlProfile) => void;
  setGameMinutes: (n: number) => void;
  setRollerMinutes: (n: number) => void;
  setOtFormat: (v: OtFormat) => void;
  setRollerOtFormat: (v: OtFormat) => void;
  setShootoutRounds: (n: ShootoutRounds) => void;
  setShootout: (v: ShootoutRecord | null) => void;
  setPeriod: (n: number) => void;
  setPeriodClock: (n: number) => void;
  setPeriodOver: (v: boolean) => void;
  setPeriodBreak: (n: number) => void;
  setDrillScore: (n: number) => void;
  setDrillTargets: (n: DrillTargets) => void;
  setScrimmageHomeTargets: (n: DrillTargets) => void;
  setScrimmageAwayTargets: (n: DrillTargets) => void;
  setScrimmageDown: (home: number, away: number) => void;
  setCheckRefs: (v: boolean) => void;
  setCheckGoalies: (v: boolean) => void;
  setLineBrawl: (v: boolean) => void;
  setIgnoreAutoFind: (v: boolean) => void;
  setPassLock: (v: boolean) => void;
  setOffsides: (v: boolean) => void;
  setGameSpeed: (n: number) => void;
  setCpuOffense: (n: number) => void;
  setCpuDefense: (n: number) => void;
  setCpuGoalie: (n: number) => void;
  setUserOffense: (n: number) => void;
  setUserDefense: (n: number) => void;
  setUserGoalie: (n: number) => void;
};

function loadLook(): ArenaLook {
  try {
    const raw = localStorage.getItem("hfb-arena-look");
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    /* ignore */
  }
  return "light";
}

function saveLook(v: ArenaLook): void {
  try {
    localStorage.setItem("hfb-arena-look", v);
  } catch {
    /* ignore */
  }
}

function rollClockMode(): PlayMode {
  return "game";
}

/** Old Roller saves used this id. The new target mode reuses it after one migration. */
const PLAY_MODE_VERSION = "hfb-play-mode-v";

function loadClockMode(): PlayMode {
  try {
    const version = localStorage.getItem(PLAY_MODE_VERSION);
    const raw = localStorage.getItem("hfb-play-mode");
    if (version !== "2") {
      localStorage.setItem(PLAY_MODE_VERSION, "2");
      if (raw === "scrimmage") {
        localStorage.setItem("hfb-play-mode", "roller");
        return "roller";
      }
    }
  } catch {
    /* ignore */
  }
  return rollClockMode();
}

function clampTargets(n: number): DrillTargets {
  return n === 16 ? 16 : n === 12 ? 12 : n === 8 ? 8 : 4;
}

function loadTargetCount(key: string): DrillTargets {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "4" || raw === "8" || raw === "12" || raw === "16") return clampTargets(Number(raw));
  } catch {
    /* ignore */
  }
  return 4;
}

function saveTargetCount(key: string, n: DrillTargets): void {
  try {
    localStorage.setItem(key, String(n));
  } catch {
    /* ignore */
  }
}

/** sim.ts drops a pending scrimmage handicap when the player picks a count. */
let scrimmageTargetsTouched: (() => void) | null = null;

export function onScrimmageTargetsSet(fn: () => void): void {
  scrimmageTargetsTouched = fn;
}

function loadDrillTargets(): DrillTargets {
  return loadTargetCount("hfb-drill-targets");
}

function saveDrillTargets(n: DrillTargets): void {
  saveTargetCount("hfb-drill-targets", n);
}

function saveClockMode(v: PlayMode): void {
  try {
    localStorage.setItem("hfb-play-mode", v);
  } catch {
    /* ignore */
  }
}

export function persistClockMode(v: PlayMode): void {
  saveClockMode(v);
}

function loadControlProfile(): ControlProfile {
  try {
    const raw = localStorage.getItem("hfb-control-profile");
    if (raw === "classic" || raw === "wings" || raw === "stick") return raw;
  } catch {
    /* ignore */
  }
  return "classic";
}

function saveControlProfile(v: ControlProfile): void {
  try {
    localStorage.setItem("hfb-control-profile", v);
  } catch {
    /* ignore */
  }
}

export const GAME_MINUTES_MIN = 1;
export const GAME_MINUTES_MAX = 5;
export const GAME_MINUTES_DEFAULT = 1.5;
/** Real period lengths. The stepper moves one entry at a time. */
export const PERIOD_MINUTE_STEPS = [1, 1.5, 2, 3, 4, 5] as const;
/** Each period counts down 20:00, scaled to the real length. Regulation is three of them. */
export const GAME_CLOCK_DISPLAY_MINUTES = 20;
export const GAME_PERIODS = 3;
/** Regular-season overtime shows 5:00 and runs at the same rate as the 20:00 clock. */
export const REG_OT_SECONDS = 5 * 60;
/** Each roller period counts down 18:00. A roller match is two of them. */
export const ROLLER_CLOCK_DISPLAY_MINUTES = 18;
export const ROLLER_PERIODS = 2;
export const ROLLER_MINUTES_DEFAULT = 1.5;
export const OT_FORMAT_DEFAULT: OtFormat = "playoff";
/** Roller opens on the regular-season overtime. Game stays on playoff. */
export const ROLLER_OT_FORMAT_DEFAULT: OtFormat = "reg";
export const SHOOTOUT_ROUNDS_DEFAULT: ShootoutRounds = 3;
const GAME_MINUTES_KEY = "hfb-game-minutes";
const ROLLER_MINUTES_KEY = "hfb-roller-minutes";
const OT_FORMAT_KEY = "hfb-ot-format";
const ROLLER_OT_FORMAT_KEY = "hfb-roller-ot-format";
const SHOOTOUT_ROUNDS_KEY = "hfb-shootout-rounds";

export function clampOtFormat(v: unknown): OtFormat {
  return v === "reg" ? "reg" : OT_FORMAT_DEFAULT;
}

export function clampRollerOtFormat(v: unknown): OtFormat {
  return v === "playoff" ? "playoff" : ROLLER_OT_FORMAT_DEFAULT;
}

export function clampShootoutRounds(v: unknown): ShootoutRounds {
  const n = typeof v === "number" ? v : Number(v);
  return n === 5 ? 5 : n === 7 ? 7 : SHOOTOUT_ROUNDS_DEFAULT;
}

/** The Shootout minigame uses the saved 3/5/7 count. Every other mode stays at 3. */
export function seriesShootoutRounds(mode: PlayMode, saved: ShootoutRounds): ShootoutRounds {
  return mode === "shootout" ? clampShootoutRounds(saved) : SHOOTOUT_ROUNDS_DEFAULT;
}

export function clampPeriodMinutes(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  let best: number = PERIOD_MINUTE_STEPS[0];
  let bestD = Infinity;
  for (const step of PERIOD_MINUTE_STEPS) {
    const d = Math.abs(step - n);
    if (d < bestD - 1e-9) {
      best = step;
      bestD = d;
    }
  }
  return best;
}

/** Next or previous legal period length. 1 goes to 1.5, then 2, 3, 4, and 5. */
export function stepPeriodMinutes(current: number, dir: -1 | 1): number {
  const cur = clampPeriodMinutes(current, GAME_MINUTES_DEFAULT);
  let i = PERIOD_MINUTE_STEPS.findIndex((step) => Math.abs(step - cur) < 1e-6);
  if (i < 0) i = 0;
  const next = i + dir;
  if (next < 0 || next >= PERIOD_MINUTE_STEPS.length) return PERIOD_MINUTE_STEPS[i];
  return PERIOD_MINUTE_STEPS[next];
}

export function clampGameMinutes(n: number): number {
  return clampPeriodMinutes(n, GAME_MINUTES_DEFAULT);
}

export function clampRollerMinutes(n: number): number {
  return clampPeriodMinutes(n, ROLLER_MINUTES_DEFAULT);
}

/** Displayed minutes elapsed per real minute. A 1-minute period runs the clock at 20×, a 5-minute period at 4×. */
export function gameClockScale(minutes: number): number {
  return GAME_CLOCK_DISPLAY_MINUTES / clampGameMinutes(minutes);
}

/**
 * Sim steps per real second, relative to 60 Hz.
 * `speed` is the slider label (0.75–1.25, default 1). Applied speed is that
 * label times 0.8, clamped to 0.6–1.0, so 1.00x is the old display-30 rate.
 * World multiplies the frame delta by this. The period clock divides it back out.
 */
export function gameSpeedRate(speed: number): number {
  const label = Number.isFinite(speed) ? speed : 1;
  return Math.max(0.6, Math.min(1, label * 0.8));
}

/** A 1-minute roller period runs the 18:00 clock at 18×. A 3-minute period runs it at 6×. */
export function rollerClockScale(minutes: number): number {
  return ROLLER_CLOCK_DISPLAY_MINUTES / clampRollerMinutes(minutes);
}

export function showsPeriodClock(mode: PlayMode): boolean {
  return mode === "game" || mode === "roller";
}

export function periodOrdinal(period: number, mode: PlayMode = "game"): string {
  const regulation = mode === "roller" ? ROLLER_PERIODS : GAME_PERIODS;
  if (period > regulation) {
    const ot = period - regulation;
    return ot === 1 ? "OT" : `${ot}OT`;
  }
  if (period === 2) return "2nd";
  if (period === 3) return "3rd";
  return "1st";
}

export function periodEndCopy(
  period: number,
  homeScore: number,
  awayScore: number,
  mode: PlayMode = "game",
): { title: string; score: string } {
  return {
    title: `END ${periodOrdinal(period, mode).toUpperCase()}`,
    score: `YOU ${homeScore}-${awayScore} CPU`,
  };
}

/** Saved period length, or the 1.5 minute default. */
function loadStoredMinutes(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return clampPeriodMinutes(Number(raw), fallback);
  } catch {
    return fallback;
  }
}

function saveStoredMinutes(key: string, n: number): void {
  try {
    localStorage.setItem(key, String(n));
  } catch {
    /* ignore */
  }
}

function loadGameMinutes(): number {
  return loadStoredMinutes(GAME_MINUTES_KEY, GAME_MINUTES_DEFAULT);
}

function loadRollerMinutes(): number {
  return loadStoredMinutes(ROLLER_MINUTES_KEY, ROLLER_MINUTES_DEFAULT);
}

function loadOtFormat(): OtFormat {
  try {
    return clampOtFormat(localStorage.getItem(OT_FORMAT_KEY));
  } catch {
    return OT_FORMAT_DEFAULT;
  }
}

function loadRollerOtFormat(): OtFormat {
  try {
    return clampRollerOtFormat(localStorage.getItem(ROLLER_OT_FORMAT_KEY));
  } catch {
    return ROLLER_OT_FORMAT_DEFAULT;
  }
}

function saveOtFormat(v: OtFormat): void {
  try {
    localStorage.setItem(OT_FORMAT_KEY, v);
  } catch {
    /* ignore */
  }
}

function saveRollerOtFormat(v: OtFormat): void {
  try {
    localStorage.setItem(ROLLER_OT_FORMAT_KEY, v);
  } catch {
    /* ignore */
  }
}

function loadShootoutRounds(): ShootoutRounds {
  try {
    return clampShootoutRounds(localStorage.getItem(SHOOTOUT_ROUNDS_KEY));
  } catch {
    return SHOOTOUT_ROUNDS_DEFAULT;
  }
}

function saveShootoutRounds(n: ShootoutRounds): void {
  try {
    localStorage.setItem(SHOOTOUT_ROUNDS_KEY, String(n));
  } catch {
    /* ignore */
  }
}

/** CPU kits already used in this sequence. The user kit is never an entry. */
const cpuKitSeen = new Set<number>();
let cpuCycleArmed = false;

function markCpuSeen(id: number): void {
  if (id >= 0 && id < UNIFORMS.length && id !== useGame.getState().homeKit) cpuKitSeen.add(id);
}

/** Next CPU kit from the kits this sequence has not used. A finished sequence starts over, skipping the kit just worn. */
export function drawCpuKit(
  home: number,
  away: number,
  seen: Iterable<number>,
): { next: number; seen: number[] } {
  const nextSeen = new Set<number>();
  for (const id of seen) {
    if (id >= 0 && id < UNIFORMS.length && id !== home) nextSeen.add(id);
  }
  if (away >= 0 && away < UNIFORMS.length && away !== home) nextSeen.add(away);
  const eligible = UNIFORMS.map((u) => u.id).filter((id) => id !== home);
  let pool = eligible.filter((id) => !nextSeen.has(id));
  if (pool.length === 0) {
    nextSeen.clear();
    if (away >= 0 && away < UNIFORMS.length && away !== home) nextSeen.add(away);
    pool = eligible.filter((id) => !nextSeen.has(id));
  }
  if (pool.length === 0) return { next: away, seen: [...nextSeen] };
  const next = pool[Math.floor(Math.random() * pool.length)]!;
  nextSeen.add(next);
  return { next, seen: [...nextSeen] };
}

/** After a user win or a finished drill, the next continue draws a CPU kit this sequence has not used. */
export function cycleMatchKits(): void {
  const cur = useGame.getState();
  const draw = drawCpuKit(cur.homeKit, cur.awayKit, cpuKitSeen);
  cpuKitSeen.clear();
  for (const id of draw.seen) cpuKitSeen.add(id);
  if (draw.next !== cur.awayKit) cur.setAwayKit(draw.next);
}

export function armCpuKitCycle(): void {
  cpuCycleArmed = true;
}

export function applyArmedCpuKitCycle(): void {
  if (!cpuCycleArmed) return;
  cpuCycleArmed = false;
  cycleMatchKits();
}

export function disarmCpuKitCycle(): void {
  cpuCycleArmed = false;
}

function rollAwayKit(): number {
  const ids = UNIFORMS.map((u) => u.id).filter((id) => id !== COL_KIT);
  return ids[Math.floor(Math.random() * ids.length)] ?? 2;
}

function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    /* ignore */
  }
  return fallback;
}

function saveFlag(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function snapSlider(n: number, min: number, max: number): number {
  const t = Math.round(((n - min) / (max - min)) * 20);
  return min + Math.max(0, Math.min(20, t)) * ((max - min) / 20);
}

const INITIAL_MODE = loadClockMode();

export const useGame = create<GameUi>((set, get) => ({
  playing: false,
  paused: false,
  camAdjust: false,
  camMode: "classic",
  freeCamLive: false,
  homeKit: COL_KIT,
  awayKit: rollAwayKit(),
  homeLineup: { ...MODE_LINEUPS[INITIAL_MODE].home },
  awayLineup: { ...MODE_LINEUPS[INITIAL_MODE].away },
  liveHome: { ...MODE_LINEUPS[INITIAL_MODE].home },
  liveAway: { ...MODE_LINEUPS[INITIAL_MODE].away },
  lineupRev: 0,
  powerPlay: loadFlag("hfb-power-play", true),
  chaos: loadFlag("hfb-chaos", false),
  speed: 0,
  shotKind: null,
  practiceShots: emptyPracticeShots(),
  teamShots: emptyTeamShots(),
  quality: "high",
  arenaLook: loadLook(),
  pad: "Keyboard",
  hasPuck: false,
  charge: 0,
  chargeKind: null,
  sauce: 0,
  chargeWind: null,
  chargeMark: null,
  homeScore: 0,
  awayScore: 0,
  whistle: null,
  delayedOffside: false,
  passChain: 0,
  goalSide: null,
  replay: false,
  clockMode: INITIAL_MODE,
  controlProfile: loadControlProfile(),
  gameMinutes: loadGameMinutes(),
  rollerMinutes: loadRollerMinutes(),
  otFormat: loadOtFormat(),
  rollerOtFormat: loadRollerOtFormat(),
  shootoutRounds: loadShootoutRounds(),
  shootout: null,
  period: 1,
  periodClock: INITIAL_MODE === "drill" ? 60 : 1200,
  periodOver: false,
  periodBreak: 0,
  drillScore: 0,
  drillTargets: loadDrillTargets(),
  scrimmageHomeTargets: loadTargetCount("hfb-scrimmage-home"),
  scrimmageAwayTargets: loadTargetCount("hfb-scrimmage-away"),
  scrimmageHomeDown: 0,
  scrimmageAwayDown: 0,
  checkRefs: loadFlag("hfb-check-refs", true),
  checkGoalies: loadFlag("hfb-check-goalies", true),
  lineBrawl: loadFlag("hfb-line-brawl", false),
  ignoreAutoFind: loadFlag("hfb-ignore-auto-find", false),
  passLock: loadFlag("hfb-pass-lock", true),
  offsides: INITIAL_MODE === "game",
  gameSpeed: 1.0,
  cpuOffense: 1,
  cpuDefense: 1,
  cpuGoalie: 0.8,
  userOffense: 0.6,
  userDefense: 1,
  userGoalie: 0.5,
  setPlaying: (v) => set({ playing: v, paused: v ? false : get().paused, camAdjust: false }),
  setPaused: (v) => set({ paused: v, camAdjust: v }),
  setCamAdjust: (v) => set({ camAdjust: v }),
  setCamMode: (m) => set({ camMode: m, freeCamLive: m === "freestyle" ? get().freeCamLive : false }),
  setFreeCamLive: (v) => set({ freeCamLive: v }),
  setHomeKit: (id) => {
    if (id < 0 || id >= UNIFORMS.length) return;
    set({ homeKit: id, lineupRev: get().lineupRev + 1 });
  },
  setAwayKit: (id) => {
    const home = get().homeKit;
    if (id === home) return;
    if (id < 0 || id >= UNIFORMS.length) return;
    markCpuSeen(id);
    if (get().awayKit === id) return;
    set({ awayKit: id, lineupRev: get().lineupRev + 1 });
  },
  rerollClockMode: () => {
    get().setClockMode(rollClockMode());
  },
  applyCornerReset: () => {
    let saved: boolean | null = null;
    try {
      const raw = localStorage.getItem("hfb-offsides");
      if (raw === "0") saved = false;
      else if (raw === "1") saved = true;
    } catch {
      /* ignore */
    }
    get().rerollClockMode();
    if (saved !== null) get().setOffsides(saved);
  },
  rerollAwayKit: () => {
    const home = get().homeKit;
    const away = get().awayKit;
    const other = UNIFORMS.map((u) => u.id).filter((id) => id !== home && id !== away);
    const pool = other.length ? other : UNIFORMS.map((u) => u.id).filter((id) => id !== home);
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (next === undefined || next === away) return;
    get().setAwayKit(next);
  },
  setHomeLineup: (l) => {
    set({ homeLineup: l, liveHome: { g: l.g, d: l.d, o: l.o }, lineupRev: get().lineupRev + 1 });
  },
  setAwayLineup: (l) => {
    set({ awayLineup: l, liveAway: { g: l.g, d: l.d, o: l.o }, lineupRev: get().lineupRev + 1 });
  },
  setLiveHome: (l) => set({ liveHome: { g: l.g, d: l.d, o: l.o }, lineupRev: get().lineupRev + 1 }),
  setLiveAway: (l) => set({ liveAway: { g: l.g, d: l.d, o: l.o }, lineupRev: get().lineupRev + 1 }),
  bumpLineup: () => set({ lineupRev: get().lineupRev + 1 }),
  setPowerPlay: (v) => {
    saveFlag("hfb-power-play", v);
    set({ powerPlay: v });
  },
  setChaos: (v) => {
    saveFlag("hfb-chaos", v);
    set({ chaos: v });
  },
  setSpeed: (n) => set({ speed: n }),
  setShotKind: (k) => set({ shotKind: k }),
  notePracticeShot: (kind, field) => {
    if (get().clockMode !== "practice") return;
    const cur = get().practiceShots;
    const line = cur[kind];
    set({
      practiceShots: {
        ...cur,
        [kind]: { ...line, [field]: line[field] + 1 },
      },
    });
  },
  resetPracticeShots: () => set({ practiceShots: emptyPracticeShots() }),
  noteTeamShot: (side, field) => {
    const cur = get().teamShots;
    const line = cur[side];
    set({
      teamShots: {
        ...cur,
        [side]: { ...line, [field]: line[field] + 1 },
      },
    });
  },
  resetTeamShots: () => set({ teamShots: emptyTeamShots() }),
  setQuality: (q) => set({ quality: q }),
  setArenaLook: (v) => {
    saveLook(v);
    set({ arenaLook: v });
  },
  setPad: (s) => set({ pad: s }),
  setHasPuck: (v) => set({ hasPuck: v }),
  setCharge: (n, kind, sauce = 0, wind = null, mark = null) =>
    set({ charge: n, chargeKind: kind, sauce, chargeWind: wind, chargeMark: mark }),
  setHomeScore: (n) => set({ homeScore: n }),
  setAwayScore: (n) => set({ awayScore: n }),
  setWhistle: (w) => set({ whistle: w }),
  setDelayedOffside: (v) => set({ delayedOffside: v }),
  setPassChain: (n) => set({ passChain: n }),
  setGoalSide: (s) => set({ goalSide: s }),
  setReplay: (v) => set({ replay: v }),
  setControlProfile: (v) => {
    saveControlProfile(v);
    set({ controlProfile: v });
  },
  setClockMode: (m) => {
    saveClockMode(m);
    const prev = get().clockMode;
    const lu = MODE_LINEUPS[m];
    const quiet = (mode: PlayMode) => mode === "practice" || mode === "scrimmage";
    const powerPlay =
      quiet(m) && !quiet(prev)
        ? false
        : !quiet(m) && quiet(prev)
          ? loadFlag("hfb-power-play", true)
          : undefined;
    const enterPractice = m === "practice" && prev !== "practice";
    set({
      ...(enterPractice ? { practiceShots: emptyPracticeShots() } : {}),
      clockMode: m,
      homeLineup: { ...lu.home },
      awayLineup: { ...lu.away },
      liveHome: { ...lu.home },
      liveAway: { ...lu.away },
      lineupRev: get().lineupRev + 1,
      periodOver: false,
      periodBreak: 0,
      period: 1,
      periodClock:
        m === "drill"
          ? 60
          : m === "scrimmage" || m === "shootout"
            ? 0
            : m === "roller"
              ? ROLLER_CLOCK_DISPLAY_MINUTES * 60
              : GAME_CLOCK_DISPLAY_MINUTES * 60,
      drillScore: 0,
      offsides: m === "game",
      ...(powerPlay === undefined ? {} : { powerPlay }),
    });
  },
  setGameMinutes: (n) => {
    const minutes = clampGameMinutes(n);
    saveStoredMinutes(GAME_MINUTES_KEY, minutes);
    set({ gameMinutes: minutes });
  },
  setRollerMinutes: (n) => {
    const minutes = clampRollerMinutes(n);
    saveStoredMinutes(ROLLER_MINUTES_KEY, minutes);
    set({ rollerMinutes: minutes });
  },
  setOtFormat: (v) => {
    const otFormat = clampOtFormat(v);
    saveOtFormat(otFormat);
    set({ otFormat });
  },
  setRollerOtFormat: (v) => {
    const rollerOtFormat = clampRollerOtFormat(v);
    saveRollerOtFormat(rollerOtFormat);
    set({ rollerOtFormat });
  },
  setShootoutRounds: (n) => {
    const shootoutRounds = clampShootoutRounds(n);
    saveShootoutRounds(shootoutRounds);
    set({ shootoutRounds });
  },
  setShootout: (v) => set({ shootout: v }),
  setPeriod: (n) => set({ period: n }),
  setPeriodClock: (n) => set({ periodClock: n }),
  setPeriodOver: (v) => set({ periodOver: v }),
  setPeriodBreak: (n) => set({ periodBreak: n }),
  setDrillScore: (n) => set({ drillScore: n }),
  setDrillTargets: (n) => {
    const v = clampTargets(n);
    saveDrillTargets(v);
    set({ drillTargets: v });
  },
  setScrimmageHomeTargets: (n) => {
    const v = clampTargets(n);
    saveTargetCount("hfb-scrimmage-home", v);
    set({ scrimmageHomeTargets: v });
    scrimmageTargetsTouched?.();
  },
  setScrimmageAwayTargets: (n) => {
    const v = clampTargets(n);
    saveTargetCount("hfb-scrimmage-away", v);
    set({ scrimmageAwayTargets: v });
    scrimmageTargetsTouched?.();
  },
  setScrimmageDown: (home, away) => {
    set({
      scrimmageHomeDown: Math.max(0, Math.round(home)),
      scrimmageAwayDown: Math.max(0, Math.round(away)),
    });
  },
  setCheckRefs: (v) => {
    saveFlag("hfb-check-refs", v);
    set({ checkRefs: v });
  },
  setCheckGoalies: (v) => {
    saveFlag("hfb-check-goalies", v);
    set({ checkGoalies: v });
  },
  setLineBrawl: (v) => {
    saveFlag("hfb-line-brawl", v);
    set({ lineBrawl: v });
  },
  setIgnoreAutoFind: (v) => {
    saveFlag("hfb-ignore-auto-find", v);
    set({ ignoreAutoFind: v });
  },
  setPassLock: (v) => {
    saveFlag("hfb-pass-lock", v);
    set({ passLock: v });
  },
  setOffsides: (v) => {
    saveFlag("hfb-offsides", v);
    set({ offsides: v });
  },
  setGameSpeed: (n) => set({ gameSpeed: snapSlider(n, 0.75, 1.25) }),
  setCpuOffense: (n) => set({ cpuOffense: snapSlider(n, 0, 2) }),
  setCpuDefense: (n) => set({ cpuDefense: snapSlider(n, 0, 2) }),
  setCpuGoalie: (n) => set({ cpuGoalie: snapSlider(n, 0, 1.6) }),
  setUserOffense: (n) => set({ userOffense: snapSlider(n, 0, 1.2) }),
  setUserDefense: (n) => set({ userDefense: snapSlider(n, 0, 2) }),
  setUserGoalie: (n) => set({ userGoalie: snapSlider(n, 0, 1) }),
}));

markCpuSeen(useGame.getState().awayKit);
