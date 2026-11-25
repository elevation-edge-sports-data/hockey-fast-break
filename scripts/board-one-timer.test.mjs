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

const { resetWorld, stepSim, world, setBoardPassIntent } = sim;
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
  world.lastPass = world.time - 2.5;
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
  other.x = 8;
  other.z = 0;
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

test("a player a step off the rail still one-times a live board pass", () => {
  fresh();
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  placeRail(receiver, true);
  receiver.z = 12.79 - 1.6;
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastShotOneTimer, true);
  assert.equal(world.lastShooter, receiver.id);
  assert.equal(world.oneTimerArmed, false);
});

test("a player ahead of the puck on the rail still one-times", () => {
  fresh();
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  placeRail(receiver, true);
  receiver.x = -7.93;
  receiver.z = 12.79 - 0.8;
  step(1);
  assert.equal(world.lastShotOneTimer, true);
  assert.equal(world.lastShooter, receiver.id);
});

test("a player well off the rail does not one-time", () => {
  fresh();
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  placeRail(receiver, true);
  receiver.z = 12.79 - 2.15;
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.puck.owner, null);
});

test("a clean boards bounce clears the armed one-timer", () => {
  fresh();
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const passer = placeRail(receiver, true);
  parkFar(passer.id);
  receiver.x = -40;
  receiver.z = 0;
  world.puck.x = 0;
  world.puck.z = 12.55;
  world.puck.vx = 0.4;
  world.puck.vz = 25;
  world.puck.vy = 0;
  world.oneTimerSlap = true;
  world.oneTimerPass = true;
  world.oneTimerSaucer = true;
  world.oneTimerUntil = world.time + 1.5;
  world.lastPass = world.time - 0.3;
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.oneTimerArmed, false);
  assert.equal(world.oneTimerSlap, false);
  assert.equal(world.oneTimerPass, false);
  assert.equal(world.oneTimerSaucer, false);
  assert.equal(world.oneTimerUntil, -10);
});

test("a second board hit after the press clears a carom one-timer", () => {
  fresh();
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const passer = placeRail(receiver, false);
  parkFar(passer.id);
  receiver.x = -40;
  receiver.z = 0;
  setBoardPassIntent("carom");
  world.puck.x = 0;
  world.puck.z = -12.55;
  world.puck.vx = 0.4;
  world.puck.vz = -25;
  world.puck.vy = 0;
  world.lastPass = world.time - 0.3;
  setInjectedKeys(["KeyF"]);
  step(1);
  setInjectedKeys([]);
  assert.equal(world.oneTimerArmed, true);
  assert.equal(world.lastShotOneTimer, false);
  world.puck.x = 0;
  world.puck.z = 12.55;
  world.puck.vx = 0.4;
  world.puck.vz = 25;
  world.puck.vy = 0;
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.oneTimerArmed, false);
  assert.equal(world.oneTimerUntil, -10);
});

test("a puck that stays on the wall keeps the armed one-timer", () => {
  fresh();
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const passer = placeRail(receiver, true);
  parkFar(passer.id);
  receiver.x = -40;
  world.puck.x = 0;
  world.puck.z = 12.85;
  world.puck.vx = 20;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.oneTimerUntil = world.time + 1.4;
  world.lastPass = world.time - 0.4;
  step(1);
  assert.equal(world.oneTimerArmed, true);
  world.puck.vz = 1.2;
  const until = world.oneTimerUntil;
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.oneTimerArmed, true);
  assert.equal(world.oneTimerUntil, until);
});

test("the armed one-timer drops after 3 seconds even on the wall", () => {
  fresh();
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  placeRail(receiver, true);
  world.oneTimerUntil = world.time + 1;
  world.lastPass = world.time - 3.2;
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.oneTimerArmed, false);
  assert.equal(world.oneTimerSlap, false);
  assert.equal(world.oneTimerUntil, -10);
});

test("a new press on an old rim still one-times", () => {
  fresh();
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  placeRail(receiver, false);
  world.lastPass = world.time - 4;
  setInjectedKeys(["KeyF"]);
  step(1);
  setInjectedKeys([]);
  assert.equal(world.lastShotOneTimer, true);
  assert.equal(world.lastShooter, receiver.id);
});

test("a held shoot does not re-arm after the boards bounce", () => {
  fresh();
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const passer = placeRail(receiver, false);
  parkFar(passer.id);
  receiver.x = -40;
  receiver.z = 0;
  world.puck.x = 0;
  world.puck.z = 12.55;
  world.puck.vx = 0.4;
  world.puck.vz = 25;
  world.lastPass = world.time - 0.3;
  setInjectedKeys(["KeyF"]);
  step(1);
  assert.equal(world.oneTimerArmed, false);
  assert.equal(world.lastShotOneTimer, false);
  placeRail(receiver, false);
  setInjectedKeys(["KeyF"]);
  step(1);
  assert.equal(world.oneTimerArmed, false);
  assert.equal(world.lastShotOneTimer, false);
  setInjectedKeys([]);
  step(1);
  setInjectedKeys(["KeyF"]);
  step(1);
  setInjectedKeys([]);
  assert.equal(world.lastShotOneTimer, true);
  assert.equal(world.lastShooter, receiver.id);
});

test("the named receiver still skates at a board one-timer after the tape clock", () => {
  fresh();
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const receiver = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  parkExcept(receiver.id);
  passer.x = -40;
  passer.z = 0;
  receiver.x = 0;
  receiver.z = 0;
  receiver.vx = 0;
  receiver.vz = 0;
  receiver.yaw = 0;
  world.userId = passer.id;
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.z = 12.8;
  world.puck.y = 0.042;
  world.puck.vx = 6;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = world.time - 2.6;
  world.lastPasser = passer.id;
  world.lastPassTo = receiver.id;
  world.lastPassX = -8;
  world.lastPassZ = 12.8;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = true;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  const z0 = receiver.z;
  step(20);
  assert.ok(receiver.z > z0 + 0.4);
  assert.equal(world.lastShotOneTimer, false);
});

test("an open-ice one-timer stays armed while the puck is still approaching", () => {
  fresh();
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const named = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  parkExcept(named.id);
  passer.x = -40;
  named.x = 6;
  named.z = 0;
  named.yaw = -Math.PI / 2;
  named.vx = 0;
  named.vz = 0;
  world.userId = passer.id;
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 8;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = world.time - 0.3;
  world.lastPasser = passer.id;
  world.lastPassTo = named.id;
  world.lastPassX = -6;
  world.lastPassZ = 0;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = true;
  world.oneTimerSlap = true;
  world.oneTimerUntil = world.time + 1.6;
  const until = world.oneTimerUntil;
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.oneTimerArmed, true);
  assert.equal(world.oneTimerSlap, true);
  assert.equal(world.oneTimerUntil, until);
});

test("a missed open-ice one-timer is a normal catch for the next teammate", () => {
  fresh();
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const named = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  const next = world.skaters.filter((s) => s.side === "home" && s.kind === "winger")[1];
  parkExcept(next.id);
  passer.x = -40;
  named.x = -30;
  named.z = 0;
  next.x = 2;
  next.z = 0;
  next.yaw = -Math.PI / 2;
  next.vx = 0;
  next.vz = 0;
  next.follow = 0;
  next.windup = 0;
  next.stun = 0;
  next.dive = 0;
  world.userId = passer.id;
  world.puck.owner = null;
  world.puck.x = 1.95;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 8;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = world.time - 0.4;
  world.lastPasser = passer.id;
  world.lastPassTo = named.id;
  world.lastPassX = -12;
  world.lastPassZ = 0;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.lastShooter = null;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = true;
  world.oneTimerSlap = true;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  world.oneTimerUntil = world.time + 1.5;
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.oneTimerArmed, false);
  assert.equal(world.oneTimerSlap, false);
  assert.equal(world.oneTimerPass, false);
  assert.equal(world.oneTimerSaucer, false);
  assert.equal(world.oneTimerUntil, -10);
  assert.equal(world.puck.owner, next.id);
});

test("pressing X again after an open-ice miss re-arms the one-timer", () => {
  fresh();
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const named = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  parkExcept(named.id);
  passer.x = -40;
  named.x = -8;
  named.z = 0;
  named.yaw = -Math.PI / 2;
  world.userId = passer.id;
  world.puck.owner = null;
  world.puck.x = 2;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 4;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = world.time - 0.4;
  world.lastPasser = passer.id;
  world.lastPassTo = named.id;
  world.lastPassX = -14;
  world.lastPassZ = 0;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = true;
  world.oneTimerUntil = world.time + 1.5;
  step(1);
  assert.equal(world.oneTimerArmed, false);
  assert.equal(world.puck.owner, null);
  named.x = 12;
  named.z = 0;
  named.vx = 0;
  named.vz = 0;
  world.puck.x = 2;
  world.puck.z = 0;
  world.puck.vx = 4;
  world.puck.vz = 0;
  world.lastPass = world.time - 3;
  setInjectedKeys(["KeyF"]);
  step(1);
  setInjectedKeys([]);
  assert.equal(world.oneTimerArmed, true);
  assert.ok(world.oneTimerUntil >= world.time);
  named.x = 0.2;
  named.z = 0;
  named.yaw = -Math.PI / 2;
  named.vx = 0;
  named.vz = 0;
  world.puck.owner = null;
  world.puck.x = -0.7;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 18;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastShotOneTimer = false;
  world.lastShooter = null;
  step(1);
  assert.equal(world.lastShotOneTimer, true);
  assert.equal(world.lastShooter, named.id);
  assert.equal(world.puck.owner, null);
});

test("a bank one-timer goes to the first teammate the puck reaches", () => {
  fresh();
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const first = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  const later = world.skaters.filter((s) => s.side === "home" && s.kind === "winger")[1];
  parkExcept(first.id);
  passer.x = -40;
  later.x = 18;
  later.z = 0;
  first.x = 0;
  first.z = 0;
  first.yaw = -Math.PI / 2;
  first.vx = 0;
  first.vz = 0;
  first.follow = 0;
  first.windup = 0;
  first.stun = 0;
  first.dive = 0;
  world.userId = passer.id;
  world.puck.owner = null;
  world.puck.x = -0.9;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 18;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = world.time - 0.35;
  world.lastPasser = passer.id;
  world.lastPassTo = later.id;
  world.lastPassX = -8;
  world.lastPassZ = 0;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.lastShooter = null;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = true;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  setBoardPassIntent("bank");
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastShotOneTimer, true);
  assert.equal(world.lastShooter, first.id);
  assert.equal(world.oneTimerArmed, false);
});

test("a missed bank one-timer gives the first teammate the puck", () => {
  fresh();
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const first = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  const later = world.skaters.filter((s) => s.side === "home" && s.kind === "winger")[1];
  parkExcept(first.id);
  passer.x = -40;
  later.x = 16;
  later.z = 0;
  first.x = 0;
  first.z = 1.15;
  first.yaw = -Math.PI / 2;
  first.vx = 0;
  first.vz = 0;
  first.follow = 0;
  first.windup = 0;
  first.stun = 0;
  first.dive = 0;
  world.userId = passer.id;
  world.puck.owner = null;
  world.puck.x = -0.15;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 8;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = world.time - 0.4;
  world.lastPasser = passer.id;
  world.lastPassTo = later.id;
  world.lastPassX = -10;
  world.lastPassZ = 0;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.lastShooter = null;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = true;
  world.oneTimerSlap = true;
  world.oneTimerPass = false;
  world.oneTimerUntil = world.time + 1.4;
  setBoardPassIntent("bank");
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.puck.owner, first.id);
  assert.equal(world.oneTimerArmed, false);
  assert.equal(world.oneTimerSlap, false);
  assert.equal(world.oneTimerUntil, -10);
  world.puck.owner = null;
  world.puck.x = later.x - 0.4;
  world.puck.z = 0;
  world.puck.vx = 16;
  world.puck.vz = 0;
  world.oneTimerArmed = false;
  step(1);
  assert.equal(world.lastShotOneTimer, false);
  assert.notEqual(world.lastShooter, later.id);
});

test("a bank arrival just past the stick window still belongs to the first teammate", () => {
  fresh();
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const first = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  const later = world.skaters.filter((s) => s.side === "home" && s.kind === "winger")[1];
  parkExcept(first.id);
  passer.x = -40;
  later.x = 18;
  later.z = 0;
  later.yaw = -Math.PI / 2;
  first.x = 0;
  first.z = 0.69;
  first.yaw = -Math.PI / 2;
  first.vx = 0;
  first.vz = 0;
  first.follow = 0;
  first.windup = 0;
  first.stun = 0;
  first.dive = 0;
  world.userId = passer.id;
  world.puck.owner = null;
  world.puck.x = 0.52;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 16;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = world.time - 0.4;
  world.lastPasser = passer.id;
  world.lastPassTo = later.id;
  world.lastPassX = -12;
  world.lastPassZ = 0;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.lastShooter = null;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = true;
  world.oneTimerSlap = true;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  world.oneTimerUntil = world.time + 1.4;
  setBoardPassIntent("bank");
  step(1);
  const firstTookIt =
    world.puck.owner === first.id || (world.lastShotOneTimer && world.lastShooter === first.id);
  assert.equal(firstTookIt, true);
  assert.equal(world.oneTimerArmed, false);
  assert.equal(world.oneTimerSlap, false);
  assert.notEqual(world.puck.owner, later.id);
  assert.notEqual(world.lastShooter, later.id);
});

test("pressing X again after a missed bank one-timer arms the next teammate", () => {
  fresh();
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  const first = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  const later = world.skaters.filter((s) => s.side === "home" && s.kind === "winger")[1];
  parkExcept(first.id);
  passer.x = -40;
  later.x = 16;
  later.z = 8;
  first.x = 0;
  first.z = 1.15;
  first.yaw = -Math.PI / 2;
  first.vx = 0;
  first.vz = 0;
  first.follow = 0;
  first.windup = 0;
  first.stun = 0;
  first.dive = 0;
  world.userId = passer.id;
  world.puck.owner = null;
  world.puck.x = -0.15;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 8;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = world.time - 0.4;
  world.lastPasser = passer.id;
  world.lastPassTo = later.id;
  world.lastPassX = -10;
  world.lastPassZ = 0;
  world.lastShoot = -10;
  world.lastShotOneTimer = false;
  world.lastShooter = null;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerArmed = true;
  world.oneTimerSlap = false;
  world.oneTimerPass = false;
  world.oneTimerSaucer = false;
  world.oneTimerUntil = world.time + 1.4;
  setBoardPassIntent("bank");
  step(1);
  assert.equal(world.puck.owner, first.id);
  assert.equal(world.oneTimerArmed, false);
  first.x = -40;
  first.z = 0;
  later.x = 20;
  later.z = 0;
  world.puck.owner = null;
  world.puck.x = 2;
  world.puck.z = 0;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  setInjectedKeys(["KeyF"]);
  step(1);
  setInjectedKeys([]);
  assert.equal(world.oneTimerArmed, true);
  assert.equal(world.lastShotOneTimer, false);
  assert.equal(world.puck.owner, null);
  later.x = 0.2;
  later.z = 0;
  later.yaw = -Math.PI / 2;
  later.vx = 0;
  later.vz = 0;
  world.puck.x = -0.7;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 18;
  world.puck.vz = 0;
  world.lastShotOneTimer = false;
  world.lastShooter = null;
  step(1);
  assert.equal(world.lastShotOneTimer, true);
  assert.equal(world.lastShooter, later.id);
  assert.equal(world.puck.owner, null);
});
