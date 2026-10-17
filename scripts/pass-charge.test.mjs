/**
 * User pass power follows how long A is held. A tap is 60 mph and 1.5s is 90.
 * Start (gamepad button 9) held at release makes that pass a saucer.
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

const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const input = await server.ssrLoadModule("/src/game/input.ts");

const { resetWorld, stepSim, world, stickBlade } = sim;
const { useGame, hudReleaseName } = store;
const { setInjectedKeys, setInjectedAim, setInjectedStart } = input;

after(() => server.close());

const DT = 1 / 60;
let clockMs = 1_000_000;
performance.now = () => clockMs;

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function user() {
  return world.skaters[world.userId];
}

function mph() {
  return Math.hypot(world.puck.vx, world.puck.vz) * 2.23694;
}

function expectedMph(holdS) {
  const t = Math.min(1, Math.max(0, holdS / 1.5));
  return (60 + 30 * t) * Math.exp(-0.35 * DT);
}

function padButton(pressed) {
  return { pressed, touched: pressed, value: pressed ? 1 : 0 };
}

function holdStart(on) {
  const buttons = Array.from({ length: 17 }, () => padButton(false));
  if (on) buttons[9] = padButton(true);
  pads = [
    {
      id: "test-standard",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: clockMs,
      axes: [0, 0, 0, 0],
      buttons,
    },
  ];
}

function holdSelect(on) {
  const buttons = Array.from({ length: 17 }, () => padButton(false));
  if (on) buttons[8] = padButton(true);
  pads = [
    {
      id: "test-standard",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: clockMs,
      axes: [0, 0, 0, 0],
      buttons,
    },
  ];
}

function settleUser() {
  const s = user();
  s.x = 0;
  s.z = 0;
  s.vx = 0;
  s.vz = 0;
  s.yaw = -Math.PI / 2;
  s.deke = 0;
  s.windup = 0;
  s.follow = 0;
  s.stun = 0;
  s.dive = 0;
  s.hit = 0;
  s.poke = 0;
  const b = stickBlade(s);
  world.puck.owner = s.id;
  world.puck.x = b.x;
  world.puck.z = b.z;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastShoot = -10;
  world.lastPass = -10;
  world.lastPasser = null;
  world.lastPassTo = null;
}

function fresh() {
  pads = [];
  setInjectedStart(false);
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  step(2);
  const ui = useGame.getState();
  ui.setClockMode("practice");
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("classic");
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.homeAttack = 1;
  world.periodOver = false;
  world.replay = false;
  settleUser();
  step(1);
  settleUser();
}

function pressPass() {
  setInjectedKeys(["KeyE"]);
  step(1);
}

function releasePass() {
  setInjectedKeys([]);
  step(1);
}

function passFor(holdS) {
  pressPass();
  clockMs += holdS * 1000;
  releasePass();
}

function assertSpeed(holdS) {
  const got = mph();
  const want = expectedMph(holdS);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastPasser, user().id);
  assert.ok(Math.abs(got - want) < 0.8, `hold ${holdS}s -> ${got.toFixed(2)} mph, want ${want.toFixed(2)}`);
}

function assertHud(holdS, kind) {
  const t = Math.min(1, Math.max(0, holdS / 1.5));
  const launch = 60 + 30 * t;
  const ui = useGame.getState();
  assert.equal(ui.shotKind, kind);
  assert.equal(hudReleaseName(kind), kind === "saucer" ? "saucer pass" : "pass");
  assert.ok(Math.abs(ui.speed - launch) < 0.8, `hud ${ui.speed.toFixed(2)} want ${launch.toFixed(2)}`);
}

function assertIce() {
  assert.ok(world.puck.y < 0.08 && Math.abs(world.puck.vy) < 0.6, `ice y ${world.puck.y} vy ${world.puck.vy}`);
}

function assertSaucer() {
  assert.ok(world.puck.vy > 2 && world.puck.y > 0.1, `saucer y ${world.puck.y} vy ${world.puck.vy}`);
}

test("A hold sets pass speed from 60 mph to 90 mph and does not saucer", () => {
  fresh();
  pressPass();
  assert.equal(world.puck.owner, user().id);
  clockMs += 1500;
  step(1);
  assert.equal(world.puck.owner, user().id, "full charge waits for release");
  const full = useGame.getState();
  assert.equal(full.chargeKind, "pass");
  assert.ok(Math.abs(full.charge - 1) < 0.02, `charge ${full.charge}`);
  releasePass();
  assertSpeed(1.5);
  assertHud(1.5, "pass");
  assertIce();

  fresh();
  passFor(0.02);
  assertSpeed(0.02);
  assertHud(0.02, "pass");
  assertIce();

  fresh();
  pressPass();
  clockMs += 750;
  step(1);
  const mid = useGame.getState();
  assert.equal(mid.chargeKind, "pass");
  assert.ok(Math.abs(mid.charge - 0.5) < 0.02, `mid charge ${mid.charge}`);
  releasePass();
  assertSpeed(0.75);
  assertHud(0.75, "pass");
  assertIce();

  fresh();
  passFor(2);
  assertSpeed(2);
  assertHud(2, "pass");
  assertIce();
});

test("Start at release is a saucer at the same speed, Select is not", () => {
  fresh();
  holdStart(true);
  passFor(0.02);
  assertSpeed(0.02);
  assertHud(0.02, "saucer");
  assertSaucer();

  fresh();
  holdStart(true);
  passFor(1.5);
  assertSpeed(1.5);
  assertHud(1.5, "saucer");
  assertSaucer();
  const charged = useGame.getState();
  assert.equal(charged.chargeKind, null);

  fresh();
  holdStart(true);
  pressPass();
  clockMs += 750;
  step(1);
  assert.equal(useGame.getState().chargeKind, "saucer");
  assert.equal(world.puck.owner, user().id);
  releasePass();
  assertSpeed(0.75);
  assertHud(0.75, "saucer");
  assertSaucer();

  fresh();
  holdSelect(true);
  passFor(1.5);
  assertSpeed(1.5);
  assertHud(1.5, "pass");
  assertIce();
});

test("hud release names are the four shots and both passes", () => {
  assert.equal(hudReleaseName("slap"), "slap shot");
  assert.equal(hudReleaseName("snap"), "snap shot");
  assert.equal(hudReleaseName("wrist"), "wrist shot");
  assert.equal(hudReleaseName("backhand"), "backhand shot");
  assert.equal(hudReleaseName("pass"), "pass");
  assert.equal(hudReleaseName("saucer"), "saucer pass");
  assert.equal(hudReleaseName(null), "Shot");
});
