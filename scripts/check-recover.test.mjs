/**
 * A checked body stays hittable after the opening beat of the strike.
 * A referee finishes that cycle sooner than a skater tumble.
 * A celebrating opponent just after a goal uses a wider user check.
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
const { setInjectedKeys, setInjectedAim } = input;

const DT = 1 / 60;

function user() {
  return world.skaters[world.userId];
}

function sheet() {
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("stick");
  ui.setCheckRefs(true);
  ui.setCheckGoalies(true);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.replay = false;
  world.goalSide = null;
  world.lastShooter = null;
  world.camFx = 1;
  world.camFz = 0;
  world.camRx = 0;
  world.camRz = 1;
  stepSim(DT);
}

function parkIdle(keep) {
  const u = user();
  u.x = 0;
  u.z = 0;
  u.vx = 0;
  u.vz = 0;
  u.yaw = -Math.PI / 2;
  u.hit = 0;
  u.stun = 0;
  u.dive = 0;
  u.poke = 0;
  u.windup = 0;
  u.follow = 0;
  u.struck = 0;
  u.tumble = 0;
  u.celebrate = 0;
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.z = 12;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastHitTime = -10;
  for (const s of world.skaters) {
    if (s === u || keep.has(s)) continue;
    s.x = s.side === "home" ? -28 : 28;
    s.z = (s.id % 7) * 1.4 - 4;
    s.vx = 0;
    s.vz = 0;
    s.stun = 40;
    s.hit = 0;
    s.struck = 0;
    s.tumble = 0;
    s.celebrate = 0;
  }
  if (!keep.has(world.ref)) {
    world.ref.x = 36;
    world.ref.z = 6;
    world.ref.vx = 0;
    world.ref.vz = 0;
    world.ref.struck = 0;
    world.ref.tumble = 0;
  }
  if (!keep.has(world.ref2)) {
    world.ref2.x = 36;
    world.ref2.z = -6;
    world.ref2.vx = 0;
    world.ref2.vz = 0;
    world.ref2.struck = 0;
    world.ref2.tumble = 0;
  }
}

function pressY() {
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  stepSim(DT);
  setInjectedKeys(["KeyQ"]);
  stepSim(DT);
  setInjectedKeys([]);
}

function placeFoe(kind) {
  const foe = world.skaters.find((s) => s.side === "away" && s.kind === kind);
  assert.ok(foe);
  parkIdle(new Set([foe]));
  foe.x = 1.05;
  foe.z = 0;
  foe.vx = 0;
  foe.vz = 0;
  foe.stun = 0;
  foe.hit = 0;
  foe.celebrate = 0;
  return foe;
}

test("a skater in the get-up is checkable and the opening beat is not", () => {
  sheet();
  const foe = placeFoe("winger");
  foe.struck = 0.35;
  foe.tumble = 1;
  pressY();
  assert.ok(foe.struck > 1.1, `recover struck ${foe.struck}`);
  assert.ok(world.lastHitTime > 0);

  foe.x = 1.05;
  foe.z = 0;
  foe.vx = 0;
  foe.vz = 0;
  foe.struck = 1.55;
  foe.tumble = 1;
  foe.stun = 1.4;
  world.lastHitTime = -10;
  pressY();
  assert.ok(foe.struck > 1.4 && foe.struck < 1.6, `opening struck ${foe.struck}`);
  assert.equal(foe.tumble === 0, false);
  assert.equal(world.lastHitTime, -10);
});

test("a goalie in the get-up is checkable and the opening beat is not", () => {
  sheet();
  const foe = placeFoe("goalie");
  foe.struck = 0.9;
  foe.tumble = 1;
  pressY();
  assert.ok(foe.struck > 1.1, `goalie recover struck ${foe.struck}`);
  assert.ok(world.lastHitTime > 0);

  foe.x = 1.05;
  foe.z = 0;
  foe.vx = 0;
  foe.vz = 0;
  foe.struck = 1.55;
  foe.tumble = 1;
  foe.stun = 1.4;
  world.lastHitTime = -10;
  pressY();
  assert.ok(foe.struck > 1.4 && foe.struck < 1.6, `goalie opening struck ${foe.struck}`);
  assert.equal(world.lastHitTime, -10);
});

test("a referee in the get-up is checkable and the opening beat is not", () => {
  sheet();
  parkIdle(new Set([world.ref]));
  world.ref.x = 1.05;
  world.ref.z = 0;
  world.ref.vx = 0;
  world.ref.vz = 0;
  world.ref.struck = 0.3;
  world.ref.tumble = 1;
  pressY();
  assert.ok(world.ref.struck > 1.1, `ref recover struck ${world.ref.struck}`);
  assert.equal(world.ref.tumble, 0);
  assert.ok(world.lastHitTime > 0);

  world.ref.x = 1.05;
  world.ref.z = 0;
  world.ref.vx = 0;
  world.ref.vz = 0;
  world.ref.struck = 1.55;
  world.ref.tumble = 1;
  world.lastHitTime = -10;
  pressY();
  assert.ok(world.ref.struck > 1.4 && world.ref.struck < 1.6, `ref opening struck ${world.ref.struck}`);
  assert.notEqual(world.ref.tumble, 0);
  assert.equal(world.lastHitTime, -10);
});

test("a referee finishes a check before a skater tumble ends", () => {
  sheet();
  parkIdle(new Set([world.ref]));
  world.ref.x = 1.05;
  world.ref.z = 0;
  world.ref.vx = 0;
  world.ref.vz = 0;
  world.ref.struck = 0;
  world.ref.tumble = 0;
  pressY();
  assert.ok(world.ref.struck > 1.1 && world.ref.tumble === 0, "absorb started");
  const foe = world.skaters.find((s) => s.side === "away" && s.kind === "winger");
  assert.ok(foe);
  foe.x = 40;
  foe.z = 0;
  foe.vx = 0;
  foe.vz = 0;
  foe.stun = 1.45;
  foe.struck = 1.68;
  foe.tumble = 1;
  const t0 = world.time;
  let up = -1;
  for (let i = 0; i < 180 && up < 0; i++) {
    stepSim(DT);
    foe.x = 40;
    foe.stun = Math.max(foe.stun, 0.5);
    if (world.ref.struck === 0 && world.ref.tumble === 0) up = world.time - t0;
  }
  assert.ok(up > 0.6 && up < 1.4, `ref up in ${up}`);
  assert.ok(foe.tumble !== 0 && foe.struck > 0.35, `skater still down ${foe.struck}`);
});

test("a celebrating CPU just after a goal is checkable from well outside the normal reach", () => {
  sheet();
  const foe = placeFoe("winger");
  world.stoppage = true;
  world.whistle = "goal";
  world.goalSide = "away";
  world.stoppageT = 0.4;
  world.lastShooter = null;
  foe.x = 2.8;
  foe.z = 0;
  foe.vx = 0;
  foe.vz = 0;
  foe.stun = 0;
  foe.struck = 0;
  foe.tumble = 0;
  foe.celebrate = 2;
  pressY();
  assert.ok(foe.struck > 1.1, `celeb struck ${foe.struck}`);

  foe.x = 2.8;
  foe.z = 0;
  foe.vx = 0;
  foe.vz = 0;
  foe.stun = 0;
  foe.struck = 0;
  foe.tumble = 0;
  foe.celebrate = 0;
  world.stoppageT = 0.4;
  world.lastHitTime = -10;
  pressY();
  assert.equal(foe.struck, 0);
  assert.equal(world.lastHitTime, -10);

  foe.celebrate = 2;
  foe.x = 2.8;
  world.stoppageT = 2.4;
  world.lastHitTime = -10;
  pressY();
  assert.ok(foe.struck < 0.05, `late celeb struck ${foe.struck}`);
  assert.equal(world.lastHitTime, -10);

  foe.x = 4.2;
  foe.z = 0;
  foe.struck = 0;
  foe.celebrate = 2;
  world.stoppageT = 0.4;
  world.lastHitTime = -10;
  pressY();
  assert.equal(foe.struck, 0);
  assert.equal(world.lastHitTime, -10);
});
