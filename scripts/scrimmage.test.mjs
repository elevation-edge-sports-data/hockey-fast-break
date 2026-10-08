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

const { resetWorld, stepSim, world, targetBoard } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;
const { GOAL_LINE_X, GOAL_W, GOAL_H } = rink;

const DT = 1 / 60;

const loadedMode = useGame.getState().clockMode;
const loadedStored = localStorage.getItem("hfb-play-mode");
const loadedVersion = localStorage.getItem("hfb-play-mode-v");

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
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.goalSide = null;
  world.puck.owner = null;
  world.homeAttack = 1;
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
  for (let i = 0; i < 200 && !faced; i++) {
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
  for (; frames < 260 && !over; frames++) {
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

test("a shot through an empty scrimmage cell is not a goal", () => {
  bootScrimmage(4, 4);
  launch(GOAL_LINE_X - 0.35, GOAL_H * 0.5, 0, 30, 0, 0);
  stepSim(DT);
  assert.ok(
    world.puck.x > GOAL_LINE_X - 0.05,
    `puck stayed in front at ${world.puck.x.toFixed(3)},${world.puck.y.toFixed(3)},${world.puck.z.toFixed(3)}`,
  );
  assert.equal(world.stoppage, false);
  assert.equal(world.periodOver, false);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().awayScore, 0);
  assert.deepEqual(world.scrimmageAwayGone, [false, false, false, false]);
  assert.deepEqual(world.scrimmageHomeGone, [false, false, false, false]);
});
