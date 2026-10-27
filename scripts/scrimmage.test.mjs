/**
 * A saved Roller id ("scrimmage") loads as roller once. Scrimmage knocks the
 * other team's crease targets. The score belongs to the team that knocked the
 * target down. That knockdown is a goal celebration, then a center-ice faceoff.
 * The last opposing target wins.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};
if (typeof globalThis.navigator?.getGamepads !== "function") {
  Object.defineProperty(globalThis.navigator, "getGamepads", {
    configurable: true,
    value: () => [],
  });
}

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const server = await createServer({
  configFile: false,
  root: repo,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
after(() => server.close());

mem.set("hfb-play-mode", "scrimmage");
mem.set("hfb-power-play", "1");

const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const input = await server.ssrLoadModule("/src/game/input.ts");
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { resetWorld, stepSim, world, targetBoard, beginPauseReplay, stopPauseReplay } = sim;
const { useGame, gameSpeedRate } = store;
const { setInjectedKeys } = input;
const { GOAL_LINE_X, GOAL_W, GOAL_H } = rink;

const DT = 1 / 60;

const loadedMode = useGame.getState().clockMode;
const loadedStored = localStorage.getItem("hfb-play-mode");
const loadedVersion = localStorage.getItem("hfb-play-mode-v");
const loadedHomeTargets = useGame.getState().scrimmageHomeTargets;
const loadedAwayTargets = useGame.getState().scrimmageAwayTargets;

function cellCenter(count, index) {
  const { cols, rows, list } = targetBoard(count);
  const t = list[index];
  const y = (t.row + 0.5) * (GOAL_H / rows);
  const z = -GOAL_W / 2 + (t.col + 0.5) * (GOAL_W / cols);
  return { y, z };
}

function bootScrimmage(home = 4, away = 4) {
  setInjectedKeys([]);
  const ui = useGame.getState();
  if (ui.clockMode === "scrimmage" || ui.clockMode === "practice") ui.setClockMode("roller");
  ui.setPowerPlay(true);
  ui.setScrimmageHomeTargets(home);
  ui.setScrimmageAwayTargets(away);
  ui.setClockMode("scrimmage");
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.homeAttack = 1;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.goalSide = null;
  world.puck.owner = null;
  world.goalBank = null;
  world.goalieShot = null;
  const now = useGame.getState();
  now.setWhistle(null);
  now.setPeriodOver(false);
  now.setGoalSide(null);
}

function launch(x, y, z, vx, vy, vz) {
  const puck = world.puck;
  puck.owner = null;
  puck.x = x;
  puck.y = y;
  puck.z = z;
  puck.vx = vx;
  puck.vy = vy;
  puck.vz = vz;
}

function driveAtMouth(mouth, y, z) {
  const start = mouth * GOAL_LINE_X - mouth * 0.35;
  launch(start, y, z, mouth * 30, 0, 0);
  for (let i = 0; i < 8; i++) {
    stepSim(DT);
    if (world.stoppage || world.periodOver) return i + 1;
  }
  return 8;
}

test("a saved scrimmage id loads as roller", () => {
  assert.equal(loadedMode, "roller");
  assert.equal(loadedStored, "roller");
  assert.equal(loadedVersion, "2");
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(loadedHomeTargets, 4);
  assert.equal(loadedAwayTargets, 4);
});

test("a knockdown schedules a center-ice faceoff", () => {
  bootScrimmage(4, 4);
  const ui = useGame.getState();
  assert.equal(ui.clockMode, "scrimmage");
  assert.equal(localStorage.getItem("hfb-play-mode"), "scrimmage");
  assert.equal(localStorage.getItem("hfb-play-mode-v"), "2");
  assert.equal(ui.powerPlay, false);
  assert.equal(localStorage.getItem("hfb-power-play"), "1");
  assert.equal(ui.offsides, false);
  assert.equal(world.homeAttack, 1);
  assert.equal(world.skaters.filter((s) => s.kind === "goalie").length, 0);

  const { y, z } = cellCenter(4, 0);
  const frames = driveAtMouth(1, y, z);
  assert.equal(
    world.stoppage,
    true,
    `no stoppage after ${frames} frames at puck ${world.puck.x.toFixed(3)},${world.puck.y.toFixed(3)},${world.puck.z.toFixed(3)}`,
  );
  assert.equal(world.periodOver, false);
  assert.equal(world.faceoff, false);
  assert.equal(world.whistle, "goal");
  assert.equal(useGame.getState().whistle, "goal");
  assert.equal(world.goalSide, "home");
  assert.ok(world.goalTicker > 1);
  assert.equal(world.ref.pose, "goal");
  assert.equal(world.ref2.pose, "goal");
  assert.ok(world.skaters.some((s) => s.side === "home" && s.celebrate > 0));
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);
  assert.deepEqual(world.scrimmageAwayGone, [true, false, false, false]);
  assert.deepEqual(world.scrimmageHomeGone, [false, false, false, false]);
  assert.equal(useGame.getState().scrimmageHomeDown, 1);
  assert.equal(useGame.getState().scrimmageAwayDown, 0);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().awayScore, 0);

  for (let i = 0; i < 60; i++) stepSim(DT);
  assert.equal(world.faceoff, false);
  assert.equal(world.periodOver, false);
  assert.equal(world.whistle, "goal");
  assert.ok(world.skaters.some((s) => s.side === "home" && s.celebrate > 0));
  assert.equal(world.ref.pose, "goal");
  assert.equal(world.ref2.pose, "goal");

  let faced = false;
  for (let i = 0; i < 320 && !faced; i++) {
    stepSim(DT);
    faced = world.faceoff === true;
  }
  assert.equal(faced, true);
  assert.equal(world.periodOver, false);
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);
  assert.ok(Math.abs(world.puck.x) < 0.05);
  assert.ok(Math.abs(world.puck.z) < 0.05);
  assert.deepEqual(world.scrimmageAwayGone, [true, false, false, false]);
  assert.deepEqual(world.scrimmageHomeGone, [false, false, false, false]);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().awayScore, 0);
});

test("clearing the last opposing target wins", () => {
  bootScrimmage(4, 4);
  world.scrimmageAwayGone[1] = true;
  world.scrimmageAwayGone[2] = true;
  world.scrimmageAwayGone[3] = true;
  useGame.getState().setScrimmageDown(3, 0);
  const { y, z } = cellCenter(4, 0);
  driveAtMouth(1, y, z);
  assert.equal(world.periodOver, false);
  assert.equal(world.faceoff, false);
  assert.equal(world.whistle, "goal");
  assert.equal(useGame.getState().whistle, "goal");
  assert.equal(world.goalSide, "home");
  assert.ok(world.goalTicker > 1);
  assert.equal(world.ref.pose, "goal");
  assert.equal(world.ref2.pose, "goal");
  assert.ok(world.skaters.some((s) => s.side === "home" && s.celebrate > 0));
  assert.deepEqual(world.scrimmageAwayGone, [true, true, true, true]);
  assert.deepEqual(world.scrimmageHomeGone, [false, false, false, false]);
  assert.equal(useGame.getState().scrimmageHomeDown, 4);
  assert.equal(useGame.getState().scrimmageAwayDown, 0);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().awayScore, 0);
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);

  let frames = 0;
  let over = false;
  for (; frames < 400 && !over; frames++) {
    stepSim(DT);
    over = world.periodOver === true;
    assert.equal(world.faceoff, false);
  }
  assert.ok(frames > 120, `match ended on frame ${frames}`);
  assert.equal(over, true);
  assert.equal(world.goalSide, "home");
  assert.equal(useGame.getState().goalSide, "home");
  assert.equal(useGame.getState().periodOver, true);
  assert.equal(world.faceoff, false);
  assert.equal(useGame.getState().scrimmageHomeDown, 4);
  assert.equal(useGame.getState().scrimmageAwayDown, 0);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().awayScore, 0);
});

function playReplayAt(t) {
  world.replayPlaying = false;
  world.replayT = t;
  stepSim(DT);
}

test("replay keeps the target up until the knockdown frame", () => {
  bootScrimmage(4, 4);
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.z = 0;
  world.puck.y = 0.05;
  world.puck.vx = 2;
  world.puck.vz = 0;
  for (let i = 0; i < 30; i++) stepSim(DT);
  assert.equal(world.scrimmageAwayGone[0], false);
  const { y, z } = cellCenter(4, 0);
  driveAtMouth(1, y, z);
  assert.equal(world.scrimmageAwayGone[0], true);
  useGame.getState().setPaused(true);
  assert.equal(beginPauseReplay(), true);
  playReplayAt(0);
  assert.equal(world.scrimmageAwayGone[0], false);
  playReplayAt(999);
  assert.equal(world.scrimmageAwayGone[0], true);
  stopPauseReplay();
  assert.equal(world.replay, false);
  assert.equal(world.scrimmageAwayGone[0], true);
});

test("drill replay shows the card leave the board", () => {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("drill");
  ui.setDrillTargets(4);
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.vx = 2;
  world.puck.vz = 0;
  world.puck.vy = 0;
  for (let i = 0; i < 20; i++) stepSim(DT);
  assert.equal(world.drillGone[0], false);
  assert.equal(world.drillCards.length, 0);
  world.drillGone[0] = true;
  world.drillCards.push({
    x: GOAL_LINE_X - 0.05,
    y: 0.4,
    z: 0,
    vx: -3,
    vy: 1.2,
    vz: 0.2,
    rx: 0,
    ry: 0,
    rz: 0,
    sx: 0,
    sy: 0,
    sz: 4,
    w: 0.3,
    h: 0.3,
    pts: 20,
    age: 0,
    flutter: 0,
  });
  for (let i = 0; i < 12; i++) stepSim(DT);
  assert.equal(world.drillGone[0], true);
  assert.ok(world.drillCards.length > 0);
  const flown = world.drillCards[0].x;
  useGame.getState().setPaused(true);
  assert.equal(beginPauseReplay(), true);
  playReplayAt(0);
  assert.equal(world.drillGone[0], false);
  assert.equal(world.drillCards.length, 0);
  playReplayAt(999);
  assert.equal(world.drillGone[0], true);
  assert.ok(world.drillCards.length > 0);
  assert.ok(Math.abs(world.drillCards[0].x - flown) < 0.05);
  stopPauseReplay();
  assert.equal(world.drillGone[0], true);
  assert.ok(world.drillCards.length > 0);
});

function replaySamples() {
  world.replayPlaying = false;
  const out = [];
  let prev = -1;
  for (let t = 0; t < 8; t += 0.05) {
    world.replayT = t;
    stepSim(DT);
    if (t > 0 && world.replayT <= prev + 1e-4) break;
    prev = world.replayT;
    out.push({
      scrimmage: world.scrimmageAwayGone[0] === true,
      drill: world.drillGone[0] === true,
      y: world.drillCards[0] ? world.drillCards[0].y : null,
    });
  }
  return out;
}

test("scrimmage replay plays the target down to the ice", () => {
  bootScrimmage(4, 4);
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.z = 0;
  world.puck.y = 0.05;
  world.puck.vx = 2;
  world.puck.vz = 0;
  for (let i = 0; i < 20; i++) stepSim(DT);
  const { y, z } = cellCenter(4, 0);
  driveAtMouth(1, y, z);
  assert.equal(world.scrimmageAwayGone[0], true);
  assert.ok(world.drillCards.length > 0);
  for (let i = 0; i < 80; i++) stepSim(DT);
  assert.ok(world.drillCards[0].y <= 0.08, `live landing y ${world.drillCards[0].y}`);
  useGame.getState().setPaused(true);
  assert.equal(beginPauseReplay(), true);
  const seen = replaySamples();
  const up = seen.findIndex((s) => !s.scrimmage);
  const air = seen.findIndex((s) => s.scrimmage && s.y !== null && s.y > 0.2);
  const ice = seen.findIndex((s) => s.scrimmage && s.y !== null && s.y <= 0.08);
  assert.ok(up >= 0, "target was never up");
  assert.ok(air > up, "card never left the board");
  assert.ok(ice > air, `card never reached the ice ${JSON.stringify(seen.filter((s) => s.y !== null).slice(0, 8))}`);
  stopPauseReplay();
});

test("drill replay plays the card down to the ice", () => {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("drill");
  ui.setDrillTargets(4);
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.vx = 2;
  world.puck.vz = 0;
  world.puck.vy = 0;
  for (let i = 0; i < 20; i++) stepSim(DT);
  assert.equal(world.drillGone[0], false);
  world.drillGone[0] = true;
  world.drillCards.push({
    x: GOAL_LINE_X - 0.05,
    y: 1.1,
    z: 0,
    vx: -3,
    vy: 1.2,
    vz: 0.2,
    rx: 0,
    ry: 0,
    rz: 0,
    sx: 1,
    sy: 1,
    sz: 4,
    w: 0.3,
    h: 0.3,
    pts: 20,
    age: 0,
    flutter: 0,
  });
  for (let i = 0; i < 90; i++) stepSim(DT);
  assert.ok(world.drillCards[0].y <= 0.08, `live drill y ${world.drillCards[0].y}`);
  useGame.getState().setPaused(true);
  assert.equal(beginPauseReplay(), true);
  const seen = replaySamples();
  const up = seen.findIndex((s) => !s.drill);
  const air = seen.findIndex((s) => s.drill && s.y !== null && s.y > 0.2);
  const ice = seen.findIndex((s) => s.drill && s.y !== null && s.y <= 0.08);
  assert.ok(up >= 0, "target was never up");
  assert.ok(air > up, "card was never in the air");
  assert.ok(ice > air, "card never reached the ice");
  stopPauseReplay();
});

test("a knockdown on the home board is credited to away", () => {
  bootScrimmage(4, 4);
  const { y, z } = cellCenter(4, 0);
  driveAtMouth(-1, y, z);
  assert.equal(world.stoppage, true);
  assert.equal(world.periodOver, false);
  assert.equal(world.whistle, "goal");
  assert.equal(world.goalSide, "away");
  assert.equal(world.ref.pose, "goal");
  assert.equal(world.ref2.pose, "goal");
  assert.ok(world.skaters.some((s) => s.side === "away" && s.celebrate > 0));
  assert.deepEqual(world.scrimmageHomeGone, [true, false, false, false]);
  assert.deepEqual(world.scrimmageAwayGone, [false, false, false, false]);
  assert.equal(useGame.getState().scrimmageHomeDown, 0);
  assert.equal(useGame.getState().scrimmageAwayDown, 1);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().awayScore, 0);
  assert.equal(world.faceoff, false);
});

function waitUntilOver() {
  let frames = 0;
  for (; frames < 400 && !world.periodOver; frames++) stepSim(DT);
  assert.equal(world.periodOver, true, `still playing after ${frames}`);
  return frames;
}

test("a scrimmage win freezes the clock, handicaps the loser, and cycles a home kit", () => {
  bootScrimmage(4, 4);
  const kit = useGame.getState().awayKit;
  world.scrimmageAwayGone[1] = true;
  world.scrimmageAwayGone[2] = true;
  world.scrimmageAwayGone[3] = true;
  const { y, z } = cellCenter(4, 0);
  driveAtMouth(1, y, z);
  const frozen = world.periodClock;
  for (let i = 0; i < 60; i++) stepSim(DT);
  assert.equal(world.periodClock, frozen);
  assert.equal(world.periodOver, false);
  waitUntilOver();
  assert.equal(world.periodClock, frozen);
  assert.equal(useGame.getState().scrimmageAwayTargets, 4);
  assert.equal(useGame.getState().scrimmageHomeTargets, 4);
  setInjectedKeys(["KeyE"]);
  stepSim(DT);
  setInjectedKeys([]);
  assert.equal(world.periodClock, 0);
  assert.equal(useGame.getState().periodClock, 0);
  assert.equal(world.periodOver, false);
  assert.equal(useGame.getState().scrimmageAwayTargets, 8);
  assert.equal(useGame.getState().scrimmageHomeTargets, 4);
  assert.equal(world.scrimmageAwayGone.length, 8);
  assert.notEqual(useGame.getState().awayKit, kit);

  bootScrimmage(4, 16);
  world.scrimmageAwayGone.fill(true);
  world.scrimmageAwayGone[0] = false;
  const last = cellCenter(16, 0);
  driveAtMouth(1, last.y, last.z);
  waitUntilOver();
  setInjectedKeys(["KeyE"]);
  stepSim(DT);
  setInjectedKeys([]);
  assert.equal(useGame.getState().scrimmageAwayTargets, 16);
  assert.equal(useGame.getState().scrimmageHomeTargets, 4);
  assert.equal(world.periodClock, 0);

  bootScrimmage(4, 4);
  const stayed = useGame.getState().awayKit;
  world.scrimmageHomeGone[1] = true;
  world.scrimmageHomeGone[2] = true;
  world.scrimmageHomeGone[3] = true;
  const cpu = cellCenter(4, 0);
  driveAtMouth(-1, cpu.y, cpu.z);
  const cpuClock = world.periodClock;
  for (let i = 0; i < 40; i++) stepSim(DT);
  assert.equal(world.periodClock, cpuClock);
  waitUntilOver();
  setInjectedKeys(["KeyE"]);
  stepSim(DT);
  setInjectedKeys([]);
  assert.equal(useGame.getState().scrimmageHomeTargets, 8);
  assert.equal(useGame.getState().scrimmageAwayTargets, 4);
  assert.equal(useGame.getState().awayKit, stayed);
  assert.equal(world.periodClock, 0);
});

test("scrimmage clock counts up from zero and does not expire", () => {
  bootScrimmage(4, 4);
  assert.equal(world.periodClock, 0);
  assert.equal(useGame.getState().periodClock, 0);
  assert.equal(world.periodOver, false);
  const rate = gameSpeedRate(useGame.getState().gameSpeed);
  const steps = 48;
  for (let i = 0; i < steps; i++) stepSim(DT);
  const expected = (steps * DT) / rate;
  assert.ok(Math.abs(world.periodClock - expected) < 0.02, `clock ${world.periodClock}`);
  assert.equal(useGame.getState().periodClock, Math.floor(world.periodClock));
  assert.equal(world.periodOver, false);
  assert.equal(useGame.getState().periodBreak, 0);

  const pausedAt = world.periodClock;
  useGame.getState().setPaused(true);
  for (let i = 0; i < 30; i++) stepSim(DT);
  assert.equal(world.periodClock, pausedAt);

  useGame.getState().setPaused(false);
  world.faceoff = true;
  world.stoppage = true;
  world.whistle = null;
  for (let i = 0; i < steps; i++) stepSim(DT);
  assert.ok(world.periodClock > pausedAt + 0.9, `clock through whistle ${world.periodClock}`);
  assert.equal(world.periodOver, false);
  assert.equal(useGame.getState().periodBreak, 0);

  const mid = world.periodClock;
  resetWorld({ keepScore: true });
  assert.ok(Math.abs(world.periodClock - mid) < 0.001);
  resetWorld();
  assert.equal(world.periodClock, 0);
  assert.equal(useGame.getState().periodClock, 0);

  useGame.getState().setClockMode("game");
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  const gameStart = world.periodClock;
  assert.equal(gameStart, 1200);
  stepSim(DT);
  assert.ok(world.periodClock < gameStart);

  useGame.getState().setClockMode("practice");
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  const practiceStart = world.periodClock;
  for (let i = 0; i < steps; i++) stepSim(DT);
  assert.equal(world.periodClock, practiceStart);
  assert.equal(world.periodOver, false);
});

test("a shot through an empty scrimmage cell bounces off the face", () => {
  bootScrimmage(4, 4);
  launch(GOAL_LINE_X - 0.35, GOAL_H * 0.5, 0, 30, 0, 0);
  stepSim(DT);
  assert.ok(
    world.puck.x < GOAL_LINE_X - 0.01,
    `puck went through at ${world.puck.x.toFixed(3)},${world.puck.y.toFixed(3)},${world.puck.z.toFixed(3)}`,
  );
  assert.ok(world.puck.vx < 0, `face did not bounce vx ${world.puck.vx.toFixed(2)}`);
  assert.equal(world.stoppage, false);
  assert.equal(world.periodOver, false);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().awayScore, 0);
  assert.deepEqual(world.scrimmageAwayGone, [false, false, false, false]);
  assert.deepEqual(world.scrimmageHomeGone, [false, false, false, false]);
});
