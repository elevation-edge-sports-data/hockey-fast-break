/**
 * Opponent carrying toward your net: both defensemen stay deeper than the forwards.
 * Replay-0-488 frames 137–149 had the home pair above all three forwards.
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

const { resetWorld, stepSim, world } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;

const DT = 1 / 60;

function fresh(homeAttack) {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.homeAttack = homeAttack;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
}

function skaters(side, kind) {
  return world.skaters.filter((s) => s.side === side && s.kind === kind).sort((a, b) => a.id - b.id);
}

function pinStill(s, x, z) {
  s.x = x;
  s.z = z;
  s.vx = 0;
  s.vz = 0;
  s.stun = 40;
  s.struck = 0;
  s.dive = 0;
  s.tumble = 0;
}

function pinCarrier(s, x, z, vx) {
  s.x = x;
  s.z = z;
  s.vx = vx;
  s.vz = 0;
  s.stun = 0;
  s.struck = 0;
  s.dive = 0;
  s.tumble = 0;
  const puck = world.puck;
  puck.owner = s.id;
  puck.x = x;
  puck.z = z;
  puck.y = 0.05;
  puck.vx = vx;
  puck.vz = 0;
  puck.vy = 0;
  world.lastPass = world.time;
  world.lastShoot = world.time;
  world.whistle = null;
  world.stoppage = false;
  world.faceoff = false;
  world.delayedOffside = 0;
}

/** own > 0 means deeper is larger x. */
function assertDeeper(defs, forwards, own, label) {
  const depth = (s) => s.x * own;
  const shallowD = Math.min(...defs.map(depth));
  const deepF = Math.max(...forwards.map(depth));
  assert.ok(
    shallowD > deepF + 0.7,
    `${label} D ${shallowD.toFixed(2)} is not behind F ${deepF.toFixed(2)} ` +
      `(D ${defs.map((s) => s.x.toFixed(1)).join(",")} F ${forwards.map((s) => s.x.toFixed(1)).join(",")})`,
  );
}

test("home defensemen stay behind the forwards when away carries into +x", () => {
  fresh(-1);
  const defs = skaters("home", "defense");
  const forwards = skaters("home", "winger");
  assert.equal(defs.length, 2);
  assert.equal(forwards.length, 3);
  const carrier = skaters("away", "defense")[0];
  const others = world.skaters.filter((s) => s.side === "away" && s.id !== carrier.id);
  world.userId = others[0].id;
  defs.forEach((s, i) => {
    s.stun = 0;
    s.vx = 0;
    s.vz = 0;
    s.x = 7.6 + i * 0.4;
    s.z = i === 0 ? 1.4 : -4.2;
  });
  forwards.forEach((s, i) => {
    s.stun = 0;
    s.vx = 0;
    s.vz = 0;
    s.x = 10.2 + i * 1.6;
    s.z = [-2, 6, -6][i];
  });
  for (let i = 0; i < 200; i++) {
    pinCarrier(carrier, 6.4, -6.4, 4.5);
    others.forEach((s, n) => pinStill(s, -8 - n, (n - 2) * 3));
    stepSim(DT);
  }
  assert.equal(world.whistle, null, world.whistle);
  assertDeeper(defs, forwards, 1, "home");
});

test("away defensemen stay behind the forwards when home carries into -x", () => {
  fresh(-1);
  const defs = skaters("away", "defense");
  const forwards = skaters("away", "winger");
  assert.equal(defs.length, 2);
  assert.equal(forwards.length, 3);
  const carrier = skaters("home", "defense")[0];
  const others = world.skaters.filter((s) => s.side === "home" && s.id !== carrier.id);
  world.userId = others[0].id;
  defs.forEach((s, i) => {
    s.stun = 0;
    s.vx = 0;
    s.vz = 0;
    s.x = -7.4 - i * 0.3;
    s.z = i === 0 ? -2 : 4;
  });
  forwards.forEach((s, i) => {
    s.stun = 0;
    s.vx = 0;
    s.vz = 0;
    s.x = -12 - i * 1.4;
    s.z = [2, -5, 6][i];
  });
  for (let i = 0; i < 200; i++) {
    pinCarrier(carrier, -6.2, 5.5, -4.5);
    others.forEach((s, n) => pinStill(s, 10 + n, (n - 2) * 3));
    stepSim(DT);
  }
  assert.equal(world.whistle, null, world.whistle);
  assertDeeper(defs, forwards, -1, "away");
});
