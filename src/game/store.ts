import { create } from "zustand";
import { COL_KIT, UNIFORMS } from "./uniforms";

export type CamMode = "classic" | "chase" | "broadcast" | "high" | "freestyle";
export type ArenaLook = "light" | "dark";

export type Lineup = { g: number; d: number; o: number };
export type PlayMode = "practice" | "scrimmage" | "game" | "drill";
export type DrillTargets = 4 | 8 | 12 | 16;
export type ControlProfile = "classic" | "wings" | "stick";
export type ShotKind = "wrist" | "snap" | "slap" | "backhand";
export type WhistleKind = "goal" | "cover" | "offside" | "brawl" | "crowd" | null;

export const LINEUP_CAP = 6;
export const CHAOS_CAP = 11;

export const MODE_LINEUPS: Record<PlayMode, { home: Lineup; away: Lineup }> = {
  practice: { home: { g: 0, d: 0, o: 1 }, away: { g: 1, d: 0, o: 0 } },
  scrimmage: { home: { g: 1, d: 1, o: 3 }, away: { g: 1, d: 1, o: 3 } },
  game: { home: { g: 1, d: 2, o: 3 }, away: { g: 1, d: 2, o: 3 } },
  drill: { home: { g: 0, d: 0, o: 1 }, away: { g: 0, d: 0, o: 0 } },
};

export function modeLineupCap(mode: PlayMode): number {
  return mode === "scrimmage" ? 5 : 6;
}

export const DEFAULT_HOME: Lineup = { ...MODE_LINEUPS.scrimmage.home };
export const DEFAULT_AWAY: Lineup = { ...MODE_LINEUPS.scrimmage.away };

export function lineupTotal(l: Lineup): number {
  return l.g + l.d + l.o;
}

export function clampSlot(slot: keyof Lineup, v: number): number {
  const max = slot === "g" ? 1 : slot === "d" ? 2 : 4;
  return Math.max(0, Math.min(max, Math.round(v)));
}

export function patchLineup(l: Lineup, slot: keyof Lineup, v: number, cap = LINEUP_CAP): Lineup {
  const n = clampSlot(slot, v);
  const next = { ...l, [slot]: n };
  const total = lineupTotal(next);
  if (total > cap) return l;
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
  shotKind: ShotKind | null;
  quality: "high" | "low";
  arenaLook: ArenaLook;
  pad: "Keyboard" | "Gamepad";
  hasPuck: boolean;
  charge: number;
  chargeKind: "pass" | "shot" | null;
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
  periodClock: number;
  periodOver: boolean;
  drillScore: number;
  drillTargets: DrillTargets;
  checkRefs: boolean;
  checkGoalies: boolean;
  lineBrawl: boolean;
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
  setHomeLineup: (l: Lineup) => void;
  setAwayLineup: (l: Lineup) => void;
  setLiveHome: (l: Lineup) => void;
  setLiveAway: (l: Lineup) => void;
  bumpLineup: () => void;
  setPowerPlay: (v: boolean) => void;
  setChaos: (v: boolean) => void;
  setSpeed: (n: number) => void;
  setShotKind: (k: ShotKind | null) => void;
  setQuality: (q: "high" | "low") => void;
  setArenaLook: (v: ArenaLook) => void;
  setPad: (s: "Keyboard" | "Gamepad") => void;
  setHasPuck: (v: boolean) => void;
  setCharge: (n: number, kind: "pass" | "shot" | null) => void;
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
  setPeriodClock: (n: number) => void;
  setPeriodOver: (v: boolean) => void;
  setDrillScore: (n: number) => void;
  setDrillTargets: (n: DrillTargets) => void;
  setCheckRefs: (v: boolean) => void;
  setCheckGoalies: (v: boolean) => void;
  setLineBrawl: (v: boolean) => void;
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

function loadClockMode(): PlayMode {
  return rollClockMode();
}

function loadDrillTargets(): DrillTargets {
  try {
    const raw = localStorage.getItem("hfb-drill-targets");
    if (raw === "4") return 4;
    if (raw === "8") return 8;
    if (raw === "12") return 12;
    if (raw === "16") return 16;
  } catch {
    /* ignore */
  }
  return 4;
}

function saveDrillTargets(n: DrillTargets): void {
  try {
    localStorage.setItem("hfb-drill-targets", String(n));
  } catch {
    /* ignore */
  }
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
export const GAME_MINUTES_MAX = 10;
export const GAME_MINUTES_DEFAULT = 5;
/** The scoreboard always counts down a 20:00 period, scaled to the real length. */
export const GAME_CLOCK_DISPLAY_MINUTES = 20;

export function clampGameMinutes(n: number): number {
  if (!Number.isFinite(n)) return GAME_MINUTES_DEFAULT;
  return Math.max(GAME_MINUTES_MIN, Math.min(GAME_MINUTES_MAX, Math.round(n)));
}

/** Displayed minutes elapsed per real minute. A 5-minute game runs the clock at 4×. */
export function gameClockScale(minutes: number): number {
  return GAME_CLOCK_DISPLAY_MINUTES / clampGameMinutes(minutes);
}

/** A full page load always starts at 5. The in-memory length survives the next game, not a refresh. */
function loadGameMinutes(): number {
  return GAME_MINUTES_DEFAULT;
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
  quality: "high",
  arenaLook: loadLook(),
  pad: "Keyboard",
  hasPuck: false,
  charge: 0,
  chargeKind: null,
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
  periodClock: INITIAL_MODE === "drill" ? 60 : 1200,
  periodOver: false,
  drillScore: 0,
  drillTargets: loadDrillTargets(),
  checkRefs: loadFlag("hfb-check-refs", true),
  checkGoalies: loadFlag("hfb-check-goalies", true),
  lineBrawl: loadFlag("hfb-line-brawl", false),
  offsides: INITIAL_MODE === "game",
  gameSpeed: 1,
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
    const away = get().awayKit;
    if (id === away) return;
    if (id < 0 || id >= UNIFORMS.length) return;
    set({ homeKit: id, lineupRev: get().lineupRev + 1 });
  },
  setAwayKit: (id) => {
    const home = get().homeKit;
    if (id === home) return;
    if (id < 0 || id >= UNIFORMS.length) return;
    set({ awayKit: id, lineupRev: get().lineupRev + 1 });
  },
  rerollClockMode: () => {
    get().setClockMode(rollClockMode());
  },
  rerollAwayKit: () => {
    const home = get().homeKit;
    const away = get().awayKit;
    const other = UNIFORMS.map((u) => u.id).filter((id) => id !== home && id !== away);
    const pool = other.length ? other : UNIFORMS.map((u) => u.id).filter((id) => id !== home);
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (next === undefined || next === away) return;
    set({ awayKit: next, lineupRev: get().lineupRev + 1 });
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
  setQuality: (q) => set({ quality: q }),
  setArenaLook: (v) => {
    saveLook(v);
    set({ arenaLook: v });
  },
  setPad: (s) => set({ pad: s }),
  setHasPuck: (v) => set({ hasPuck: v }),
  setCharge: (n, kind) => set({ charge: n, chargeKind: kind }),
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
    const lu = MODE_LINEUPS[m];
    set({
      clockMode: m,
      homeLineup: { ...lu.home },
      awayLineup: { ...lu.away },
      liveHome: { ...lu.home },
      liveAway: { ...lu.away },
      lineupRev: get().lineupRev + 1,
      periodOver: false,
      periodClock: m === "game" ? get().periodClock || 1200 : m === "drill" ? 60 : 1200,
      drillScore: 0,
      offsides: m === "game",
    });
  },
  setGameMinutes: (n) => {
    set({ gameMinutes: clampGameMinutes(n) });
  },
  setPeriodClock: (n) => set({ periodClock: n }),
  setPeriodOver: (v) => set({ periodOver: v }),
  setDrillScore: (n) => set({ drillScore: n }),
  setDrillTargets: (n) => {
    const v: DrillTargets = n === 16 ? 16 : n === 12 ? 12 : n === 8 ? 8 : 4;
    saveDrillTargets(v);
    set({ drillTargets: v });
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
  setOffsides: (v) => {
    saveFlag("hfb-offsides", v);
    set({ offsides: v });
  },
  setGameSpeed: (n) => set({ gameSpeed: snapSlider(n, 0.5, 1.5) }),
  setCpuOffense: (n) => set({ cpuOffense: snapSlider(n, 0, 2) }),
  setCpuDefense: (n) => set({ cpuDefense: snapSlider(n, 0, 2) }),
  setCpuGoalie: (n) => set({ cpuGoalie: snapSlider(n, 0, 1.6) }),
  setUserOffense: (n) => set({ userOffense: snapSlider(n, 0, 1.2) }),
  setUserDefense: (n) => set({ userDefense: snapSlider(n, 0, 2) }),
  setUserGoalie: (n) => set({ userGoalie: snapSlider(n, 0, 1) }),
}));
