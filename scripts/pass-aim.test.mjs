/**
 * Classic and Wings aim a pass with the gamepad right stick at A release.
 * Skill Stick keeps the left stick. Default camera: stick up is +X, stick right is +Z.
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
const { useGame } = store;
const { setInjectedKeys, setInjectedAim } = input;

after(() => server.close());

const DT = 1 / 60;

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function user() {
  return world.skaters[world.userId];
}

function padButton(pressed) {
  return { pressed, touched: pressed, value: pressed ? 1 : 0 };
}

function setPad(axes) {
  const buttons = Array.from({ length: 17 }, () => padButton(false));
  pads = [
    {
      id: "test-standard",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: 1,
      axes,
      buttons,
    },
  ];
}

function clearPad() {
  pads = [];
  setInjectedAim(0, 0);
  setInjectedKeys([]);
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
  s.stickPull = 0;
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
  world.lastShotKind = null;
  world.lastPass = -10;
  world.lastPasser = null;
  world.lastPassTo = null;
  world.camFx = 1;
  world.camFz = 0;
  world.camRx = 0;
  world.camRz = 1;
  for (const o of world.skaters) {
    if (o.id === s.id) continue;
    o.x = -45;
    o.z = 0;
    o.vx = 0;
    o.vz = 0;
  }
}

function fresh(profile, mode = "practice") {
  clearPad();
  step(2);
  const ui = useGame.getState();
  ui.setClockMode(mode);
  ui.setOffsides(false);
  ui.setIgnoreAutoFind(false);
  ui.setPassLock(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile(profile);
  resetWorld();
  world.homeAttack = 1;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.faceoffA = false;
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.periodOver = false;
  world.replay = false;
  settleUser();
  step(1);
  settleUser();
}

/** Press A, then release it with the right stick already deflected. */
function releasePass(axes, stickKeys = []) {
  clearPad();
  setInjectedKeys(["KeyE", ...stickKeys]);
  step(1);
  setPad(axes);
  setInjectedKeys(stickKeys);
  step(1);
  clearPad();
}

function travel() {
  const sp = Math.hypot(world.puck.vx, world.puck.vz);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastPasser, user().id);
  assert.equal(world.lastShotKind, null);
  assert.ok(sp > 8, `pass speed ${sp.toFixed(2)}`);
  return { x: world.puck.vx / sp, z: world.puck.vz / sp };
}

function assertAlong(axis) {
  const t = travel();
  const along = axis === "x" ? t.x : t.z;
  const cross = axis === "x" ? Math.abs(t.z) : Math.abs(t.x);
  assert.ok(along > 0.9, `want +${axis}, got (${t.x.toFixed(3)}, ${t.z.toFixed(3)})`);
  assert.ok(cross < 0.35, `cross ${cross.toFixed(3)}`);
}

test("classic right stick aims the pass at release", () => {
  fresh("classic");
  releasePass([0, 0, 1, 0]);
  assertAlong("z");

  fresh("classic");
  releasePass([0, 0, 0, -1]);
  assertAlong("x");
});

test("wings right stick aims the pass at release", () => {
  fresh("wings");
  releasePass([0, 0, 1, 0]);
  assertAlong("z");

  fresh("wings");
  releasePass([0, 0, 0, -1]);
  assertAlong("x");
});

test("classic and wings right stick wins over the left stick", () => {
  fresh("classic");
  releasePass([0, 0, 0, -1], ["KeyD"]);
  assertAlong("x");

  fresh("wings");
  releasePass([0, 0, 1, 0], ["KeyW"]);
  assertAlong("z");
});

test("a resting right stick leaves the left stick aim", () => {
  fresh("classic");
  setInjectedAim(0.12, 0);
  setInjectedKeys(["KeyE", "KeyD"]);
  step(1);
  setInjectedKeys(["KeyD"]);
  step(1);
  clearPad();
  assertAlong("z");
});

test("the pass uses the right stick at release, not the press", () => {
  fresh("classic");
  clearPad();
  setPad([0, 0, 1, 0]);
  setInjectedKeys(["KeyE"]);
  step(1);
  assert.equal(world.puck.owner, user().id);
  setPad([0, 0, 0, -1]);
  setInjectedKeys(["KeyE"]);
  step(1);
  assert.equal(world.puck.owner, user().id);
  setInjectedKeys([]);
  step(1);
  clearPad();
  assertAlong("x");
});

function homeMate() {
  const mate = world.skaters.find(
    (s) => s.side === "home" && s.id !== world.userId && s.kind !== "goalie",
  );
  assert.ok(mate);
  return mate;
}

function releaseAt(axes, beforeRelease) {
  clearPad();
  setInjectedKeys(["KeyE"]);
  step(1);
  beforeRelease();
  setPad(axes);
  setInjectedKeys([]);
  step(1);
  clearPad();
}

test("pass lock bends an aimed pass onto a teammate in the cone", () => {
  fresh("classic", "roller");
  let mate;
  releaseAt([0, 0, 1, 0], () => {
    mate = homeMate();
    mate.x = 6;
    mate.z = 8;
    mate.vx = 0;
    mate.vz = 0;
  });
  const t = travel();
  assert.ok(t.x > 0.25, `locked (${t.x.toFixed(3)}, ${t.z.toFixed(3)})`);
  assert.equal(world.lastPassTo, mate.id);
});

test("pass lock off keeps the aimed angle", () => {
  fresh("classic", "roller");
  useGame.getState().setPassLock(false);
  let mate;
  releaseAt([0, 0, 1, 0], () => {
    mate = homeMate();
    mate.x = 6;
    mate.z = 8;
    mate.vx = 0;
    mate.vz = 0;
  });
  assertAlong("z");
  assert.equal(world.lastPassTo, mate.id);
});

test("pass lock off keeps the aim and still names the lane mate", () => {
  fresh("classic", "roller");
  useGame.getState().setIgnoreAutoFind(true);
  let mate;
  releaseAt([0, 0, 1, 0], () => {
    mate = homeMate();
    mate.x = 6;
    mate.z = 8;
    mate.vx = 0;
    mate.vz = 0;
  });
  assertAlong("z");
  assert.equal(world.lastPassTo, mate.id);
  assert.ok(world.oneTimerUntil >= world.time);
});

test("pass lock off sends an unaimed pass along facing and still names the lane mate", () => {
  fresh("classic", "roller");
  useGame.getState().setIgnoreAutoFind(true);
  let mate;
  releaseAt([0, 0, 0, 0], () => {
    mate = homeMate();
    mate.x = 4;
    mate.z = 8;
    mate.vx = 0;
    mate.vz = 0;
  });
  assertAlong("x");
  assert.equal(world.lastPassTo, mate.id);
  assert.ok(world.oneTimerUntil >= world.time);
});

test("skill stick pass ignores the right stick", () => {
  fresh("stick");
  releasePass([0, 0, 1, 0]);
  assertAlong("x");

  fresh("stick");
  releasePass([0, 0, 0, -1], ["KeyD"]);
  assertAlong("z");
});
