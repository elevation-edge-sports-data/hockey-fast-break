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

function awayDefs() {
  return world.skaters
    .filter((s) => s.side === "away" && s.kind === "defense")
    .sort((a, b) => a.id - b.id);
}

test("away defensemen keep a gap and their faceoff sides through the draw", () => {
  fresh();
  for (let i = 0; i < 120 && world.faceoffPhase !== "live"; i++) step(1);
  assert.equal(world.faceoffPhase, "live");
  const [ld, rd] = awayDefs();
  assert.ok(ld && rd);
  const ldSign = Math.sign(ld.z);
  const rdSign = Math.sign(rd.z);
  assert.ok(ldSign !== 0 && rdSign === -ldSign, `faceoff sides ${ld.z.toFixed(2)} ${rd.z.toFixed(2)}`);
  let minSep = Infinity;
  const realRandom = Math.random;
  Math.random = () => 0.97;
  try {
    for (let i = 0; i < 150; i++) {
      step(1);
      minSep = Math.min(minSep, Math.hypot(ld.x - rd.x, ld.z - rd.z));
      assert.ok(ld.z * ldSign > 0.8, `LD left his side (z ${ld.z.toFixed(2)})`);
      assert.ok(rd.z * rdSign > 0.8, `RD left his side (z ${rd.z.toFixed(2)})`);
    }
  } finally {
    Math.random = realRandom;
  }
  assert.ok(minSep > 2.2, `away D closed to ${minSep.toFixed(2)}`);
});

test("a same-team defense pair cannot occupy one spot", () => {
  fresh();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  const [a, b] = awayDefs();
  assert.ok(a && b);
  for (const s of world.skaters) {
    if (s.id === a.id || s.id === b.id) continue;
    s.x = 22;
    s.z = -12 + s.id;
    s.vx = 0;
    s.vz = 0;
    s.stun = 3;
  }
  a.x = 0;
  a.z = 0;
  b.x = 0.25;
  b.z = 0;
  a.vx = 0;
  a.vz = 0;
  b.vx = 0;
  b.vz = 0;
  a.stun = 3;
  b.stun = 3;
  world.puck.owner = null;
  world.puck.x = 24;
  world.puck.z = 10;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  step(1);
  const sep = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(sep >= 2.3, `defense gap ${sep.toFixed(3)}`);
});

test("a loose puck on one side does not swap the away defense pair", () => {
  fresh();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  const [ld, rd] = awayDefs();
  assert.ok(ld && rd);
  const ldSign = Math.sign(ld.z) || -1;
  const rdSign = Math.sign(rd.z) || 1;
  ld.x = -4.5;
  ld.z = ldSign * 3.2;
  rd.x = -4.5;
  rd.z = rdSign * 3.2;
  ld.vx = rd.vx = 0;
  ld.vz = rd.vz = 0;
  ld.stun = rd.stun = 0;
  for (const s of world.skaters) {
    if (s.id === ld.id || s.id === rd.id || s.kind === "goalie") continue;
    s.x = 20;
    s.z = -11 + s.id;
    s.vx = 0;
    s.vz = 0;
    s.stun = 5;
  }
  const puck = world.puck;
  puck.owner = null;
  puck.x = 2.2;
  puck.z = ldSign * 1.4;
  puck.y = 0.05;
  puck.vx = ldSign * 4;
  puck.vz = ldSign * 1.6;
  puck.vy = 0;
  let minSep = Infinity;
  for (let i = 0; i < 100; i++) {
    puck.owner = null;
    step(1);
    minSep = Math.min(minSep, Math.hypot(ld.x - rd.x, ld.z - rd.z));
  }
  assert.ok(ld.z * ldSign > 1.2, `LD left the puck side (z ${ld.z.toFixed(2)})`);
  assert.ok(rd.z * rdSign > 1.2, `RD crossed onto the puck (z ${rd.z.toFixed(2)})`);
  assert.ok(minSep > 2.2, `away D closed to ${minSep.toFixed(2)}`);
});
