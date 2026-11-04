/**
 * After a faceoff-win pass back to the defense, each defenseman stays on
 * his faceoff half. The near one holds to receive, then chases a miss
 * without crossing the far post or his partner.
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
if (typeof globalThis.navigator !== "object" || globalThis.navigator === null) {
  globalThis.navigator = {};
}
if (typeof globalThis.navigator.getGamepads !== "function") {
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
const { GOAL_W } = rink;

const DT = 1 / 60;
const POST = GOAL_W / 2;

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function fresh() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("classic");
  resetWorld();
  world.homeAttack = -1;
  resetWorld({ keepScore: true });
  world.camFx = 1;
  world.camFz = 0;
  world.camRx = 0;
  world.camRz = 1;
}

function defs() {
  return world.skaters
    .filter((s) => s.side === "home" && s.kind === "defense")
    .sort((a, b) => a.id - b.id);
}

test("a faceoff pass back keeps the left defenseman on his side, then he chases the miss", () => {
  fresh();
  for (let i = 0; i < 90 && !(world.faceoff && world.faceoffPhase === "live"); i++) step(1);
  assert.equal(world.faceoffPhase, "live");
  const centerId = world.userId;
  const [ld, rd] = defs();
  assert.ok(ld && rd);
  const ldZ0 = ld.z;
  const rdZ0 = rd.z;
  assert.ok(ldZ0 > 1, `LD faceoff z ${ldZ0.toFixed(2)}`);
  assert.ok(rdZ0 < -1, `RD faceoff z ${rdZ0.toFixed(2)}`);

  const realRandom = Math.random;
  Math.random = () => 0.9;
  setInjectedKeys(["KeyW", "KeyD", "KeyE"]);
  try {
    step(1);
  } finally {
    Math.random = realRandom;
  }
  setInjectedKeys([]);
  assert.equal(world.faceoff, false);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastPassTo, ld.id);

  let ldMin = ld.z;
  let rdMax = rd.z;
  let gapMin = ld.z - rd.z;
  for (let i = 0; i < 36; i++) {
    step(1);
    ldMin = Math.min(ldMin, ld.z);
    rdMax = Math.max(rdMax, rd.z);
    gapMin = Math.min(gapMin, ld.z - rd.z);
  }
  assert.ok(ldMin > 1.2, `LD left his side during the pass (z ${ldMin.toFixed(2)}, started ${ldZ0.toFixed(2)})`);
  assert.ok(rdMax < -1.2, `RD left his side during the pass (z ${rdMax.toFixed(2)}, started ${rdZ0.toFixed(2)})`);
  assert.ok(gapMin > 2, `defensemen crossed during the pass (gap ${gapMin.toFixed(2)})`);

  const puck = world.puck;
  const holdX = ld.x;
  const holdZ = ld.z;
  world.userId = centerId;
  puck.owner = null;
  puck.x = ld.x + 6;
  puck.z = ldZ0 + 2.2;
  puck.y = 0.04;
  puck.vx = 3.2;
  puck.vz = 1.1;
  puck.vy = 0;
  const before = Math.hypot(ld.x - puck.x, ld.z - puck.z);
  ldMin = ld.z;
  rdMax = rd.z;
  for (let i = 0; i < 50; i++) {
    step(1);
    ldMin = Math.min(ldMin, ld.z);
    rdMax = Math.max(rdMax, rd.z);
  }
  const after = Math.hypot(ld.x - world.puck.x, ld.z - world.puck.z);
  const moved = Math.hypot(ld.x - holdX, ld.z - holdZ);
  assert.ok(
    world.puck.owner === ld.id || (moved > 2.2 && after < before - 0.8),
    `LD did not chase the miss (moved ${moved.toFixed(2)}, ${before.toFixed(2)} -> ${after.toFixed(2)})`,
  );
  assert.ok(ldMin > -POST - 0.35, `LD crossed the far post (z ${ldMin.toFixed(2)})`);
  assert.ok(rdMax < POST + 0.35, `RD crossed the far post (z ${rdMax.toFixed(2)})`);
  assert.ok(ld.z > rd.z, `defensemen swapped sides (LD ${ld.z.toFixed(2)}, RD ${rd.z.toFixed(2)})`);
});
