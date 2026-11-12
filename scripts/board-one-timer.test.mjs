/**
 * A buffered shoot on a board pass one-times the player in the rail lane.
 * It does not give them the puck, and it does not fire without the shoot latch
 * or for a pass that is not on the boards.
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
const poses = await server.ssrLoadModule("/src/game/poseOverrideInfer.ts");

const { resetWorld, stepSim, world } = sim;
const { inferNamedPose } = poses;
const { useGame } = store;
const { setInjectedKeys } = input;

const DT = 1 / 60;

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function fresh() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(false);
  ui.setIgnoreAutoFind(false);
  ui.setPassLock(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.faceoffA = false;
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.periodOver = false;
  world.replay = false;
  step(1);
}

function parkFar(exceptId) {
  for (const s of world.skaters) {
    if (s.id === exceptId) continue;
    s.x = -40 - s.id;
    s.z = 0;
    s.vx = 0;
    s.vz = 0;
    s.stun = 0;
    s.struck = 0;
    s.dive = 0;
    s.windup = 0;
    s.follow = 0;
  }
}

/** Puck on the +z wall, receiver one stick-length inside, facing off the wall. */
function placeRail(receiver, armed, namedId = null) {
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "winger" && s.id !== receiver.id);
  world.userId = passer.id;
  parkFar(receiver.id);
  passer.x = -40;
  passer.z = 0;
  receiver.x = -9.13;
  receiver.z = 11.57;
  receiver.yaw = 0;
  receiver.vx = 0;
  receiver.vz = 0;
  receiver.windup = 0;
  receiver.follow = 0;
  receiver.stun = 0;
  receiver.struck = 0;
  receiver.dive = 0;
  const puck = world.puck;
  puck.owner = null;
  puck.x = -10;
  puck.z = 12.79;
  puck.y = 0.042;
  puck.vx = 22;
  puck.vz = 0;
  puck.vy = 0;
  world.lastPass = world.time - 0.25;
  world.lastPasser = passer.id;
  world.lastPassTo = namedId;
  world.lastPassX = -18;
  world.lastPassZ = 12.79;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.lastShotKind = null;
  world.lastShooter = null;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = armed;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  return passer;
}

fresh();

test("a buffered shoot one-times the player in the board lane without possession", () => {
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  placeRail(receiver, true);
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastShotOneTimer, true);
  assert.equal(world.lastShooter, receiver.id);
  assert.equal(world.lastShotKind, "wrist");
  assert.ok(receiver.follow > 0.02);
  assert.equal(world.oneTimerArmed, false);
  assert.equal(inferNamedPose(receiver, receiver.id), "wristFollow");
});

test("the same lane does not catch the puck when shoot is not buffered", () => {
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  placeRail(receiver, false);
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastShotOneTimer, false);
  assert.notEqual(world.lastShooter, receiver.id);
});

test("pass snap keeps the shot on the named target", () => {
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const wings = world.skaters.filter((s) => s.side === "home" && s.kind === "winger");
  placeRail(receiver, true, wings[1].id);
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.puck.owner, null);
  assert.notEqual(world.lastShooter, receiver.id);
});

test("a shoot press from the approach still fires after the tape clock", () => {
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  placeRail(receiver, true);
  world.lastPass = world.time - 3;
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastShotOneTimer, true);
  assert.equal(world.lastShooter, receiver.id);
  assert.equal(inferNamedPose(receiver, receiver.id), "wristFollow");
});

test("the same late press is dropped when the puck is not on the boards", () => {
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  placeRail(receiver, true);
  world.puck.z = 0;
  receiver.z = -1.22;
  world.lastPass = world.time - 3;
  step(1);
  assert.equal(world.oneTimerArmed, false);
  assert.equal(world.lastShotOneTimer, false);
});

test("a shoot press as the puck reaches the wall still arms the one-timer", () => {
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  placeRail(receiver, false);
  world.lastPass = world.time - 3;
  setInjectedKeys(["KeyF"]);
  step(1);
  setInjectedKeys([]);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastShotOneTimer, true);
  assert.equal(world.lastShooter, receiver.id);
});

function parkExcept(id) {
  for (const s of world.skaters) {
    if (s.id === id) continue;
    s.x = -40 - s.id;
    s.z = 0;
    s.vx = 0;
    s.vz = 0;
    s.stun = 0;
    s.struck = 0;
    s.dive = 0;
    s.follow = 0;
    s.windup = 0;
  }
}

test("a named center one-times when the puck passes under him", () => {
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const center = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  parkExcept(center.id);
  passer.x = -40;
  center.x = 0;
  center.z = 0;
  center.yaw = -Math.PI / 2;
  center.vx = 0;
  center.vz = 0;
  center.follow = 0;
  center.windup = 0;
  center.stun = 0;
  center.dive = 0;
  world.userId = passer.id;
  world.puck.owner = null;
  world.puck.x = -0.9;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 22;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = world.time - 0.3;
  world.lastPasser = passer.id;
  world.lastPassTo = center.id;
  world.lastPassX = -8;
  world.lastPassZ = 0;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.lastShotKind = null;
  world.lastShooter = null;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = true;
  world.oneTimerSlap = false;
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastShotOneTimer, true);
  assert.equal(world.lastShooter, center.id);
  assert.equal(inferNamedPose(center, center.id), "wristFollow");
});

test("a puck in the body is caught while a one-timer is armed", () => {
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const other = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  const close = world.skaters.filter((s) => s.side === "home" && s.kind === "winger")[1];
  parkExcept(close.id);
  passer.x = -40;
  other.x = -38;
  close.x = 0;
  close.z = 0;
  close.yaw = -Math.PI / 2;
  close.vx = 0;
  close.vz = 0;
  close.follow = 0;
  close.windup = 0;
  close.stun = 0;
  close.dive = 0;
  world.userId = passer.id;
  world.puck.owner = null;
  world.puck.x = 0.05;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 11;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = world.time - 0.4;
  world.lastPasser = passer.id;
  world.lastPassTo = other.id;
  world.lastPassX = -12;
  world.lastPassZ = 4;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.lastShooter = null;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = true;
  world.oneTimerSlap = false;
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.puck.owner, close.id);
});

test("a fast puck through a non-target does not stick", () => {
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const other = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  const close = world.skaters.filter((s) => s.side === "home" && s.kind === "winger")[1];
  parkExcept(close.id);
  passer.x = -40;
  other.x = -38;
  close.x = 0;
  close.z = 0;
  close.yaw = -Math.PI / 2;
  close.vx = 0;
  close.vz = 0;
  close.stun = 0;
  close.dive = 0;
  world.userId = passer.id;
  world.puck.owner = null;
  world.puck.x = 0.1;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 24;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = world.time - 0.4;
  world.lastPasser = passer.id;
  world.lastPassTo = other.id;
  world.lastPassX = -12;
  world.lastPassZ = 4;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.lastShooter = null;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = true;
  world.oneTimerSlap = false;
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastShotOneTimer, false);
});

test("a buffered shoot away from the boards does not use the lane", () => {
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  placeRail(receiver, true);
  world.puck.z = 0;
  receiver.z = -1.22;
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.puck.owner, null);
});
