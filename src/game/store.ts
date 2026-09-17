import { create } from "zustand";
import { COL_KIT, DAL_KIT, UNIFORMS, VGK_KIT } from "./uniforms";

export type CamMode = "classic" | "chase" | "broadcast" | "high" | "freestyle";
export type ArenaLook = "light" | "dark";

export type Lineup = { g: number; d: number; o: number };

export const LINEUP_CAP = 6;

export const DEFAULT_HOME: Lineup = { g: 1, d: 1, o: 2 };
export const DEFAULT_AWAY: Lineup = { g: 1, d: 1, o: 1 };

export function lineupTotal(l: Lineup): number {
  return l.g + l.d + l.o;
}

export function clampSlot(slot: keyof Lineup, v: number): number {
  const max = slot === "g" ? 1 : slot === "d" ? 2 : 4;
  return Math.max(0, Math.min(max, Math.round(v)));
}

export function patchLineup(l: Lineup, slot: keyof Lineup, v: number): Lineup {
  const n = clampSlot(slot, v);
  const next = { ...l, [slot]: n };
  const total = lineupTotal(next);
  if (total > LINEUP_CAP || total < 1) return l;
  return next;
}

export function releaseFromBox(l: Lineup): Lineup {
  if (lineupTotal(l) >= LINEUP_CAP) return l;
  if (l.o < 3) return { ...l, o: l.o + 1 };
  if (l.d < 2) return { ...l, d: l.d + 1 };
  if (l.g < 1) return { ...l, g: 1 };
  if (l.o < 4) return { ...l, o: l.o + 1 };
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
  speed: number;
  quality: "high" | "low";
  arenaLook: ArenaLook;
  pad: "Keyboard" | "Gamepad";
  hasPuck: boolean;
  charge: number;
  chargeKind: "pass" | "shot" | null;
  homeScore: number;
  awayScore: number;
  whistle: "goal" | "cover" | null;
  goalSide: "home" | "away" | null;
  replay: boolean;
  clockMode: "practice" | "game";
  gameMinutes: number;
  periodClock: number;
  periodOver: boolean;
  checkRefs: boolean;
  checkGoalies: boolean;
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
  setHomeLineup: (l: Lineup) => void;
  setAwayLineup: (l: Lineup) => void;
  setLiveHome: (l: Lineup) => void;
  setLiveAway: (l: Lineup) => void;
  bumpLineup: () => void;
  setPowerPlay: (v: boolean) => void;
  setSpeed: (n: number) => void;
  setQuality: (q: "high" | "low") => void;
  setArenaLook: (v: ArenaLook) => void;
  setPad: (s: "Keyboard" | "Gamepad") => void;
  setHasPuck: (v: boolean) => void;
  setCharge: (n: number, kind: "pass" | "shot" | null) => void;
  setHomeScore: (n: number) => void;
  setAwayScore: (n: number) => void;
  setWhistle: (w: "goal" | "cover" | null) => void;
  setGoalSide: (s: "home" | "away" | null) => void;
  setReplay: (v: boolean) => void;
  setClockMode: (m: "practice" | "game") => void;
  setGameMinutes: (n: number) => void;
  setPeriodClock: (n: number) => void;
  setPeriodOver: (v: boolean) => void;
  setCheckRefs: (v: boolean) => void;
  setCheckGoalies: (v: boolean) => void;
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

function loadClockMode(): "practice" | "game" {
  try {
    const raw = localStorage.getItem("hfb-clock-mode");
    if (raw === "game" || raw === "practice") return raw;
  } catch {
    /* ignore */
  }
  return "practice";
}

function saveClockMode(v: "practice" | "game"): void {
  try {
    localStorage.setItem("hfb-clock-mode", v);
  } catch {
    /* ignore */
  }
}

function loadGameMinutes(): number {
  try {
    const n = Number(localStorage.getItem("hfb-game-minutes"));
    if (Number.isFinite(n)) return Math.max(1, Math.min(5, Math.round(n)));
  } catch {
    /* ignore */
  }
  return 2;
}

function saveGameMinutes(n: number): void {
  try {
    localStorage.setItem("hfb-game-minutes", String(n));
  } catch {
    /* ignore */
  }
}

function rollAwayKit(): number {
  return Math.random() < 0.5 ? DAL_KIT : VGK_KIT;
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

export const useGame = create<GameUi>((set, get) => ({
  playing: false,
  paused: false,
  camAdjust: false,
  camMode: "classic",
  freeCamLive: false,
  homeKit: COL_KIT,
  awayKit: rollAwayKit(),
  homeLineup: { ...DEFAULT_HOME },
  awayLineup: { ...DEFAULT_AWAY },
  liveHome: { ...DEFAULT_HOME },
  liveAway: { ...DEFAULT_AWAY },
  lineupRev: 0,
  powerPlay: loadFlag("hfb-power-play", true),
  speed: 0,
  quality: "high",
  arenaLook: loadLook(),
  pad: "Keyboard",
  hasPuck: false,
  charge: 0,
  chargeKind: null,
  homeScore: 0,
  awayScore: 0,
  whistle: null,
  goalSide: null,
  replay: false,
  clockMode: loadClockMode(),
  gameMinutes: loadGameMinutes(),
  periodClock: 1200,
  periodOver: false,
  checkRefs: loadFlag("hfb-check-refs", true),
  checkGoalies: loadFlag("hfb-check-goalies", true),
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
  setSpeed: (n) => set({ speed: n }),
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
  setGoalSide: (s) => set({ goalSide: s }),
  setReplay: (v) => set({ replay: v }),
  setClockMode: (m) => {
    saveClockMode(m);
    set({ clockMode: m, periodOver: false, periodClock: m === "game" ? get().periodClock || 1200 : 1200 });
  },
  setGameMinutes: (n) => {
    const minutes = Math.max(1, Math.min(5, Math.round(n)));
    saveGameMinutes(minutes);
    set({ gameMinutes: minutes });
  },
  setPeriodClock: (n) => set({ periodClock: n }),
  setPeriodOver: (v) => set({ periodOver: v }),
  setCheckRefs: (v) => {
    saveFlag("hfb-check-refs", v);
    set({ checkRefs: v });
  },
  setCheckGoalies: (v) => {
    saveFlag("hfb-check-goalies", v);
    set({ checkGoalies: v });
  },
  setGameSpeed: (n) => set({ gameSpeed: snapSlider(n, 0.5, 1.5) }),
  setCpuOffense: (n) => set({ cpuOffense: snapSlider(n, 0, 2) }),
  setCpuDefense: (n) => set({ cpuDefense: snapSlider(n, 0, 2) }),
  setCpuGoalie: (n) => set({ cpuGoalie: snapSlider(n, 0, 1.6) }),
  setUserOffense: (n) => set({ userOffense: snapSlider(n, 0, 1.2) }),
  setUserDefense: (n) => set({ userDefense: snapSlider(n, 0, 2) }),
  setUserGoalie: (n) => set({ userGoalie: snapSlider(n, 0, 1) }),
}));
