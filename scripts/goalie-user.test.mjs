/**
 * A user goalie bursts with B the way a skater does, and a goalie-only
 * home lineup starts in the crease instead of on the faceoff dot.
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
if (typeof globalThis.navigator !== "object" || globalThis.navigator === null) globalThis.navigator = {};
Object.defineProperty(globalThis.navigator, "getGamepads", {
  configurable: true,
  value: () => [],
});

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

const { resetWorld, stepSim, world, defendDir } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;
const { GOAL_LINE_X } = rink;

const DT = 1 / 60;
const FULL = { g: 1, d: 2, o: 3 };
const SOLO = { g: 1, d: 0, o: 0 };

function homeGoalie() {
  const g = world.skaters.find((s) => s.side === "home" && s.kind === "goalie");
  assert.ok(g);
  return g;
}

function liveSolo() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setHomeLineup(SOLO);
  ui.setAwayLineup(FULL);
  resetWorld();
  const g = homeGoalie();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.x = 20;
  world.puck.z = 12;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.y = 0.042;
  g.vx = 0;
  g.vz = 0;
  return g;
}

function skate(g, keys, seconds) {
  setInjectedKeys(keys);
  let max = 0;
  const x0 = g.x;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepSim(DT);
    max = Math.max(max, Math.hypot(g.vx, g.vz));
  }
  return { max, sp: Math.hypot(g.vx, g.vz), dx: g.x - x0, burst: g.burst, userId: world.userId };
}

test("goalie-only home starts in the crease and is not the faceoff taker", () => {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setHomeLineup(SOLO);
  ui.setAwayLineup(FULL);
  resetWorld();

  const home = world.skaters.filter((s) => s.side === "home");
  assert.equal(home.length, 1);
  const g = home[0];
  assert.equal(g.kind, "goalie");
  assert.equal(world.userId, g.id);
  assert.notEqual(world.homeDot, g.id);
  const mouth = defendDir("home") * GOAL_LINE_X;
  const fromLine = (g.x - mouth) * -defendDir("home");
  assert.ok(fromLine > 0.4 && fromLine < 1.6, `crease depth ${fromLine.toFixed(3)}`);
  assert.ok(Math.abs(g.z) < 0.2);
  assert.ok(Math.abs(g.x - world.faceX) > 10, "not standing on the dot");

  for (let i = 0; i < 45; i++) stepSim(DT);
  const later = (g.x - mouth) * -defendDir("home");
  assert.ok(later > 0.3 && later < 2.2, `still in the crease after the drop (${later.toFixed(3)})`);
  assert.ok(Math.abs(g.z) < 0.6);
  assert.notEqual(world.homeDot, g.id);
  assert.equal(world.userId, g.id);
});

test("holding the goalie still bursts, and release hands back to a skater", () => {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setHomeLineup(FULL);
  ui.setAwayLineup(FULL);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.x = 20;
  world.puck.z = 12;
  const g = homeGoalie();
  const held = skate(g, ["KeyR", "KeyW", "Space"], 1);
  assert.equal(held.userId, g.id);
  assert.equal(held.burst, 1);
  assert.ok(held.sp > 14, `held burst ${held.sp.toFixed(2)}`);
  setInjectedKeys(["KeyW"]);
  stepSim(DT);
  assert.notEqual(world.userId, g.id);
  assert.equal(world.skaters[world.userId].kind !== "goalie", true);
});

test("user goalie B burst reaches skater speed and cruise does not get recall-damped", () => {
  const burst = skate(liveSolo(), ["KeyW", "Space"], 1.2);
  const cruise = skate(liveSolo(), ["KeyW"], 1.2);
  assert.equal(burst.userId, 0);
  assert.equal(burst.burst, 1);
  assert.equal(cruise.burst, 0);
  assert.ok(burst.sp > 14, `burst speed ${burst.sp.toFixed(2)}`);
  assert.ok(burst.dx > 8, `burst travel ${burst.dx.toFixed(2)}`);
  assert.ok(cruise.sp > 5, `cruise speed ${cruise.sp.toFixed(2)} was recall-damped`);
  assert.ok(burst.sp > cruise.sp + 2, `burst ${burst.sp.toFixed(2)} vs cruise ${cruise.sp.toFixed(2)}`);
});
