/**
 * After a goal the scored-on side rages before the faceoff.
 * User goals: CPU skater smash, goalie rage, and a ref check.
 * CPU goals: the same from home teammates, never the user.
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
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;

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

const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const input = await server.ssrLoadModule("/src/game/input.ts");
const poses = await server.ssrLoadModule("/src/game/poseOverrideInfer.ts");
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { resetWorld, stepSim, world, rageDraw, checkedCyclePose, defendDir, installControlsProbe } = sim;
const { GOAL_LINE_X } = rink;
const { inferNamedPose } = poses;
const { useGame } = store;
const { setInjectedKeys, setInjectedAim } = input;

installControlsProbe();

const DT = 1 / 60;

function frames(n) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function seconds(t) {
  frames(Math.round(t / DT));
}

function sheet(mode) {
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  const ui = useGame.getState();
  ui.setClockMode(mode);
  ui.setPowerPlay(false);
  ui.setChaos(false);
  ui.setOffsides(false);
  ui.setCheckRefs(true);
  ui.setControlProfile("stick");
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.replay = false;
  world.goalSide = null;
}

function score(net) {
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  globalThis.window.__controlsTest.forceGoal(net);
}

function stickRagers(side) {
  return world.skaters.filter((s) => s.side === side && s.kind !== "goalie" && s.smashKind > 0);
}

function goalie(side) {
  return world.skaters.find((s) => s.side === side && s.kind === "goalie");
}

function downedRefs() {
  return [world.ref, world.ref2].filter((r) => r.struck > 0.2 || r.tumble !== 0);
}

function reactionCount(side) {
  return stickRagers(side).length + (goalie(side)?.smashKind > 0 ? 1 : 0) + downedRefs().length;
}

test("user goal: CPU smashes, goalie rages after the scoop, then the faceoff returns", () => {
  sheet("game");
  const user = world.skaters[world.userId];
  assert.equal(user.side, "home");
  assert.notEqual(user.kind, "goalie");
  score(world.homeAttack);
  assert.equal(world.whistle, "goal");
  assert.equal(world.goalSide, "home");
  const ragers = stickRagers("away");
  assert.ok(ragers.length >= 1 && ragers.length <= 3);
  for (const s of ragers) assert.ok(rageDraw(s.id));
  for (const s of world.skaters) {
    if (s.side === "home") assert.equal(s.smashKind, 0);
  }
  const cpuGoalie = goalie("away");
  assert.ok(cpuGoalie);
  assert.equal(cpuGoalie.smashKind, 0);
  const x0 = ragers[0].x;
  const mouth = defendDir("away") * GOAL_LINE_X;
  seconds(0.45);
  assert.equal(cpuGoalie.smashKind, 0);
  assert.ok(cpuGoalie.coverPose > 0.3);
  const toward = Math.sign(mouth - x0) || 1;
  assert.ok((ragers[0].x - x0) * toward > 0.4, "raging skater skates toward the net");
  seconds(2.2);
  assert.ok(cpuGoalie.smashKind > 0);
  assert.ok(cpuGoalie.smashHit > 0);
  assert.equal(inferNamedPose(cpuGoalie, cpuGoalie.id), "goalieRage");
  let seen = 0;
  let guard = 0;
  while (world.stoppage && guard < 400) {
    stepSim(DT);
    guard += 1;
    if (world.stoppage && world.stoppageT > 3.9 && world.stoppageT < 4.35) seen = reactionCount("away");
  }
  assert.equal(world.stoppage, false);
  assert.equal(world.faceoff, true);
  assert.equal(world.whistle, null);
  assert.ok(seen >= 2 && seen <= 4, `reactions ${seen}`);
});

test("user goal: a CPU skater checks the referee through absorb, tumble, and recover", () => {
  sheet("game");
  const orig = Math.random;
  Math.random = () => 0.9;
  try {
    score(world.homeAttack);
    seconds(0.35);
    const down = downedRefs();
    assert.equal(down.length, 1);
    assert.equal(checkedCyclePose(down[0].struck, down[0].tumble), "absorb");
    const checker = world.skaters.find(
      (s) => s.side === "away" && s.kind !== "goalie" && s.smashKind <= 0 && s.id !== world.userId,
    );
    assert.ok(checker);
    seconds(1.35);
    assert.notEqual(down[0].tumble, 0);
    assert.equal(checkedCyclePose(down[0].struck, down[0].tumble), "knockout");
    let sawRecover = false;
    let guard = 0;
    while (world.stoppage && guard < 400 && !sawRecover) {
      stepSim(DT);
      guard += 1;
      if (checkedCyclePose(down[0].struck, down[0].tumble) === "recover") sawRecover = true;
    }
    assert.equal(sawRecover, true);
    assert.equal(world.stoppage, true);
    assert.ok(reactionCount("away") >= 3 && reactionCount("away") <= 4);
  } finally {
    Math.random = orig;
  }
});

test("CPU goal: home teammates rage and the user does not", () => {
  sheet("game");
  const user = world.skaters[world.userId];
  score(-world.homeAttack);
  assert.equal(world.goalSide, "away");
  assert.ok(stickRagers("home").length >= 1);
  for (const s of stickRagers("home")) {
    assert.notEqual(s.id, user.id);
    assert.ok(rageDraw(s.id));
  }
  for (const s of world.skaters) {
    if (s.side === "away") assert.equal(s.smashKind, 0);
  }
  assert.equal(user.smashKind, 0);
  const x0 = stickRagers("home")[0].x;
  const mouth = defendDir("home") * GOAL_LINE_X;
  seconds(0.5);
  const toward = Math.sign(mouth - x0) || 1;
  assert.ok((stickRagers("home")[0].x - x0) * toward > 0.4);
  seconds(2.2);
  const g = goalie("home");
  assert.ok(g);
  assert.notEqual(g.id, user.id);
  assert.ok(g.smashKind > 0 && g.smashHit > 0);
  assert.equal(inferNamedPose(g, g.id), "goalieRage");
  assert.equal(user.smashKind, 0);
});

test("practice user goal: the CPU goalie scoops, then rages", () => {
  sheet("practice");
  assert.equal(world.skaters.filter((s) => s.side === "away" && s.kind !== "goalie").length, 0);
  score(world.homeAttack);
  const g = goalie("away");
  assert.ok(g);
  seconds(0.4);
  assert.equal(g.smashKind, 0);
  assert.ok(g.coverPose > 0.3);
  seconds(2.2);
  assert.ok(g.smashKind > 0 && g.smashHit > 0);
  assert.equal(inferNamedPose(g, g.id), "goalieRage");
  assert.equal(stickRagers("away").length, 0);
  assert.equal(stickRagers("home").length, 0);
});

test("check refs off: scored-on skaters still rage and the officials stay up", () => {
  sheet("game");
  useGame.getState().setCheckRefs(false);
  score(world.homeAttack);
  seconds(2.4);
  assert.ok(stickRagers("away").length >= 1);
  assert.equal(downedRefs().length, 0);
  assert.equal(world.ref.tumble, 0);
  assert.equal(world.ref2.tumble, 0);
});

test("scrimmage knockdown: the other team rages without a goalie", () => {
  sheet("scrimmage");
  const orig = Math.random;
  Math.random = () => 0.9;
  try {
    score(world.homeAttack);
    assert.equal(world.whistle, "goal");
    assert.equal(goalie("away"), undefined);
    assert.ok(stickRagers("away").length >= 1);
    seconds(0.4);
    assert.ok(downedRefs().length >= 1);
    assert.equal(checkedCyclePose(downedRefs()[0].struck, downedRefs()[0].tumble), "absorb");
    let guard = 0;
    while (world.stoppage && guard < 400) {
      stepSim(DT);
      guard += 1;
    }
    assert.equal(world.stoppage, false);
    assert.equal(world.faceoff, true);
  } finally {
    Math.random = orig;
  }
});
