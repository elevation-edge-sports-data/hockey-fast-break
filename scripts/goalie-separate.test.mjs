/**
 * A skater cannot skate through a goalie. Goalie pairs keep a wider shell
 * than two skaters. Celebration overlap and skater-skater spacing stay put.
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

let pads = [];
if (typeof globalThis.navigator !== "object" || globalThis.navigator === null) {
  globalThis.navigator = {};
}
Object.defineProperty(globalThis.navigator, "getGamepads", {
  configurable: true,
  value: () => pads,
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

const { resetWorld, stepSim, world } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;

const DT = 1 / 60;
/** Goalie 0.58 + skater 0.42 + pad 1. The old pad left contact at 1.28. */
const GOALIE_SHELL = 2;

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function clearPad() {
  pads = [];
  setInjectedKeys([]);
}

function fresh() {
  clearPad();
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(false);
  ui.setIgnoreAutoFind(false);
  ui.setPassLock(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("classic");
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.faceoffA = false;
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.periodOver = false;
  world.replay = false;
  world.camFx = 1;
  world.camFz = 0;
  world.camRx = 0;
  world.camRz = 1;
  step(1);
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.faceoffA = false;
  world.stoppage = false;
  world.whistle = null;
}

function park(s, x, z) {
  s.x = x;
  s.z = z;
  s.vx = 0;
  s.vz = 0;
  s.struck = 0;
  s.tumble = 0;
  s.stun = 0;
  s.dive = 0;
  s.hit = 0;
  s.poke = 0;
  s.celebrate = 0;
}

function gap(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

test("a skater inside the away goalie at 1.6 m is pushed out to the pad shell", () => {
  fresh();
  const g = world.skaters.find((s) => s.side === "away" && s.kind === "goalie");
  const sk = world.skaters.find((s) => s.side === "home" && s.number === 29);
  assert.ok(g && sk);
  world.userId = sk.id;
  for (const s of world.skaters) {
    if (s.id !== g.id && s.id !== sk.id) park(s, 18, s.id - 6);
  }
  park(g, -26.28, -0.63);
  // Just under the coast gate, and still the unstruck separation weight.
  g.struck = 0.19;
  park(sk, -26.28 + 1.6, -0.63);
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.z = 0;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  step(1);
  const d = gap(sk, g);
  assert.ok(d >= GOALIE_SHELL - 0.08, `still inside the goalie at ${d.toFixed(3)}`);
  assert.ok(d < GOALIE_SHELL + 0.25, `launched clear of the goalie at ${d.toFixed(3)}`);
});

test("skating into the away goalie never closes to the old 1.6 m overlap", () => {
  fresh();
  const g = world.skaters.find((s) => s.side === "away" && s.kind === "goalie");
  const sk = world.skaters.find((s) => s.side === "home" && s.number === 29);
  assert.ok(g && sk);
  world.userId = sk.id;
  for (const s of world.skaters) {
    if (s.id !== g.id && s.id !== sk.id) park(s, 18, s.id - 6);
  }
  park(g, -26.28, -0.63);
  park(sk, -24.2, 0.7);
  sk.vx = -8;
  sk.vz = -2;
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.z = 0;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  let minD = Infinity;
  for (let i = 0; i < 36; i++) {
    g.struck = 0.19;
    g.tumble = 0;
    setInjectedKeys(["KeyS"]);
    step(1);
    minD = Math.min(minD, gap(sk, g));
  }
  setInjectedKeys([]);
  assert.ok(minD >= GOALIE_SHELL - 0.12, `phased through to ${minD.toFixed(3)}`);
});

test("two skaters still separate on the smaller pad", () => {
  fresh();
  const mates = world.skaters.filter((s) => s.side === "home" && s.kind === "winger");
  const a = mates[0];
  const b = mates[1];
  assert.ok(a && b);
  world.userId = a.id;
  for (const s of world.skaters) {
    if (s.id !== a.id && s.id !== b.id) park(s, -20, 8 + s.id);
  }
  park(a, 0, 0);
  park(b, 0.7, 0);
  b.stun = 1;
  world.puck.owner = null;
  world.puck.x = 30;
  world.puck.z = 12;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  step(1);
  const d = gap(a, b);
  assert.ok(d > 0.95 && d < 1.4, `skater gap ${d.toFixed(3)}`);
});
