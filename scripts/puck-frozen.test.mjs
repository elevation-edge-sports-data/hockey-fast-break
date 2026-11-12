/**
 * A puck that sits on the cage roof whistles PUCK FROZEN after 1.5 s.
 * The faceoff is the nearer end-zone dot, after a further 1.25 s that X skips.
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

const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const input = await server.ssrLoadModule("/src/game/input.ts");
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { resetWorld, stepSim, world } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;
const { GOAL_H, GOAL_LINE_X, GOAL_W, GOAL_D_TOP, FACEOFF_EZ_X, FACEOFF_SPOT_Z, cageDepthAt } = rink;

const DT = 1 / 60;
const SETTLE_FRAMES = Math.round(1.5 / DT);
const DELAY_FRAMES = Math.round(1.25 / DT);

function liveSheet() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.puck.owner = null;
  ui.setWhistle(null);
  ui.setPeriodOver(false);
}

function placeRoof(side, z, along) {
  const puck = world.puck;
  puck.owner = null;
  puck.x = side * GOAL_LINE_X + side * along;
  puck.z = z;
  puck.y = GOAL_H + 0.08;
  puck.vx = 0;
  puck.vz = 0;
  puck.vy = 0;
}

function untilFrozen(limit = SETTLE_FRAMES + 30) {
  for (let i = 0; i < limit; i++) {
    if (world.whistle === "frozen") return i;
    stepSim(DT);
  }
  return -1;
}

function edge(code) {
  setInjectedKeys([]);
  stepSim(DT);
  setInjectedKeys([code]);
  stepSim(DT);
  setInjectedKeys([]);
}

test("settled puck on the straight top shelf whistles and faces off on the near dot", () => {
  liveSheet();
  const z = 0.4;
  const depth = cageDepthAt(z, GOAL_H);
  assert.equal(depth, GOAL_D_TOP);
  placeRoof(1, z, depth * 0.45);
  const frames = untilFrozen();
  assert.equal(frames, SETTLE_FRAMES);
  assert.equal(world.stoppage, true);
  assert.equal(useGame.getState().whistle, "frozen");
  assert.equal(world.faceX, FACEOFF_EZ_X);
  assert.equal(world.faceZ, FACEOFF_SPOT_Z);
  const clock = world.periodClock;
  for (let i = 0; i < DELAY_FRAMES - 1; i++) stepSim(DT);
  assert.equal(world.whistle, "frozen");
  assert.equal(useGame.getState().whistle, "frozen");
  assert.equal(world.periodClock, clock);
  stepSim(DT);
  assert.equal(world.whistle, null);
  assert.equal(useGame.getState().whistle, null);
  assert.equal(world.faceoff, true);
  assert.equal(world.puck.x, FACEOFF_EZ_X);
  assert.equal(world.puck.z, FACEOFF_SPOT_Z);
});

test("the other cage and the curved shelf use that end's nearer dot", () => {
  liveSheet();
  const hw = GOAL_W / 2;
  const zJoinTop = hw - (hw * 6) / 36;
  const z = -((zJoinTop + hw) * 0.5);
  const depth = cageDepthAt(z, GOAL_H);
  assert.ok(depth > 0.05 && depth < GOAL_D_TOP - 0.01, `curve depth ${depth}`);
  placeRoof(-1, z, depth * 0.5);
  const frames = untilFrozen();
  assert.equal(frames, SETTLE_FRAMES);
  assert.equal(world.faceX, -FACEOFF_EZ_X);
  assert.equal(world.faceZ, -FACEOFF_SPOT_Z);
});

test("X skips the rest of the 1.25 s faceoff delay", () => {
  liveSheet();
  const depth = cageDepthAt(-0.55, GOAL_H);
  placeRoof(1, -0.55, depth * 0.4);
  assert.equal(untilFrozen(), SETTLE_FRAMES);
  assert.equal(world.faceZ, -FACEOFF_SPOT_Z);
  for (let i = 0; i < 20; i++) stepSim(DT);
  assert.equal(world.whistle, "frozen");
  assert.ok(world.stoppageT < 1.25);
  edge("KeyF");
  assert.equal(world.whistle, null);
  assert.equal(world.faceoff, true);
  assert.equal(world.puck.x, FACEOFF_EZ_X);
  assert.equal(world.puck.z, -FACEOFF_SPOT_Z);
});

test("a moving or off-shelf puck does not freeze, and motion restarts the 1.5 s", () => {
  liveSheet();
  const z = 0.2;
  const depth = cageDepthAt(z, GOAL_H);
  const along = depth * 0.5;
  const puck = world.puck;
  for (let i = 0; i < SETTLE_FRAMES + 20; i++) {
    placeRoof(1, z, along);
    puck.vx = 3;
    stepSim(DT);
    assert.notEqual(world.whistle, "frozen");
  }
  placeRoof(1, z, along);
  puck.x = GOAL_LINE_X + depth + 0.45;
  puck.y = GOAL_H + 0.08;
  for (let i = 0; i < SETTLE_FRAMES + 15; i++) stepSim(DT);
  assert.notEqual(world.whistle, "frozen");

  placeRoof(1, z, along);
  puck.y = GOAL_H * 0.45;
  for (let i = 0; i < SETTLE_FRAMES + 15; i++) stepSim(DT);
  assert.notEqual(world.whistle, "frozen");

  placeRoof(1, hwOutside(), 0.2);
  for (let i = 0; i < SETTLE_FRAMES + 15; i++) stepSim(DT);
  assert.notEqual(world.whistle, "frozen");

  placeRoof(1, z, along);
  for (let i = 0; i < 60; i++) stepSim(DT);
  assert.equal(world.whistle, null);
  puck.vx = 4;
  stepSim(DT);
  placeRoof(1, z, along);
  for (let i = 0; i < SETTLE_FRAMES - 1; i++) stepSim(DT);
  assert.equal(world.whistle, null);
  stepSim(DT);
  assert.equal(world.whistle, "frozen");
  assert.equal(world.faceX, FACEOFF_EZ_X);
  assert.equal(world.faceZ, FACEOFF_SPOT_Z);
});

function hwOutside() {
  return GOAL_W / 2 + 0.3;
}

test("a puck passing over the cage is not a frozen puck", () => {
  liveSheet();
  const puck = world.puck;
  puck.owner = null;
  puck.x = GOAL_LINE_X - 1.5;
  puck.z = 0.25;
  puck.y = GOAL_H + 0.7;
  puck.vx = 14;
  puck.vz = 0.4;
  puck.vy = 0.4;
  for (let i = 0; i < SETTLE_FRAMES + 40; i++) {
    stepSim(DT);
    assert.notEqual(world.whistle, "frozen");
  }
});
