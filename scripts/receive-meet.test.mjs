/**
 * Receivers who still have ground to cover skate onto the pass.
 * A one-timer in the slot does it even when a nearer teammate is not the shot,
 * then squares to the net. An ordinary catch still meets the puck facing the pass.
 * The good pass is dev/reference/replay-759-885.json, home winger 29.
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
const rink = await server.ssrLoadModule("/src/game/rink.ts");
const { resetWorld, stepSim, world, faceYaw } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;
const { GOAL_LINE_X } = rink;

function fresh() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("classic");
  ui.setFriction(0.25);
  resetWorld();
  world.homeAttack = -1;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.periodOver = false;
  world.periodEndT = 0;
  world.replay = false;
  world.time = 30;
  world.puckOz = -1;
}

function place(s, x, z, yaw = 0, vx = 0, vz = 0) {
  s.x = x;
  s.z = z;
  s.vx = vx;
  s.vz = vz;
  s.yaw = yaw;
  s.stun = 0;
  s.struck = 0;
  s.dive = 0;
  s.tumble = 0;
  s.hit = 0;
  s.poke = 0;
  s.windup = 0;
  s.follow = 0;
  s.celebrate = 0;
}

function parkAway() {
  for (const s of world.skaters) {
    if (s.side !== "away") continue;
    if (s.kind === "goalie") place(s, -GOAL_LINE_X + 0.9, 0, faceYaw("away"));
    else place(s, 18, (s.id - 6) * 2.2, faceYaw("away"));
  }
}

/** heading() dot the vector to the net. 1 faces the net. */
function netAlign(s) {
  const fx = -Math.sin(s.yaw);
  const fz = -Math.cos(s.yaw);
  const nx = -GOAL_LINE_X - s.x;
  const nz = -s.z;
  const d = Math.hypot(nx, nz) || 1;
  return (fx * nx + fz * nz) / d;
}

function releasePass(x, z, vx, vz, toId) {
  const puck = world.puck;
  puck.owner = null;
  puck.x = x;
  puck.z = z;
  puck.y = 0.043;
  puck.vx = vx;
  puck.vz = vz;
  puck.vy = 0;
  world.lastPass = world.time;
  world.lastPassX = x;
  world.lastPassZ = z;
  world.lastPasser = 1;
  world.lastPassTo = toId;
  world.lastShoot = world.time - 5;
  world.lastShooter = null;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.oneTimerUntil = world.time + 2.2;
  world.oneTimerSlap = false;
}

const CLIP = [
  { id: 0, x: 26.277, z: 0.229, yaw: 1.918, vx: 0, vz: -0.52 },
  { id: 1, x: -9.352, z: 11.345, yaw: 3.085, vx: -0.76, vz: 2.62 },
  { id: 2, x: -10.374, z: -10.738, yaw: -0.5, vx: 0.26, vz: -0.41 },
  { id: 3, x: -22.173, z: 8.792, yaw: 8.13, vx: -8.41, vz: -0.15 },
  { id: 4, x: -18.365, z: -0.108, yaw: -1.564, vx: 0.68, vz: -0.02 },
  { id: 5, x: -22.859, z: -6.035, yaw: -7.146, vx: 0.56, vz: 0.05 },
];

function setupClip(named, armed) {
  fresh();
  world.userId = 1;
  for (const row of CLIP) {
    place(world.skaters[row.id], row.x, row.z, row.yaw, row.vx, row.vz);
  }
  parkAway();
  releasePass(-9.174, 12.864, -6.788, -21.204, named ? 4 : null);
  world.oneTimerArmed = armed;
}

test("named receiver skates onto the pass and does not square for a catch", () => {
  setupClip(true, false);
  const s0 = world.skaters[4];
  const x0 = s0.x;
  const z0 = s0.z;
  let minGap = 99;
  let alignAtCatch = 0;
  for (let i = 0; i < 50; i++) {
    stepSim(1 / 60);
    const s = world.skaters[4];
    const gap = Math.hypot(s.x - world.puck.x, s.z - world.puck.z);
    if (gap < minGap) {
      minGap = gap;
      alignAtCatch = netAlign(s);
    }
  }
  const moved = Math.hypot(world.skaters[4].x - x0, world.skaters[4].z - z0);
  assert.ok(minGap < 1.4, `ordinary receive stayed off the puck (${minGap.toFixed(2)})`);
  assert.ok(moved > 3.5, `ordinary receiver did not close (${moved.toFixed(2)})`);
  assert.ok(alignAtCatch < 0, `ordinary catch faced the net (${alignAtCatch.toFixed(2)})`);
});

test("armed one-timer closes on the intercept and faces the net through the follow", () => {
  setupClip(true, true);
  const s0 = world.skaters[4];
  const x0 = s0.x;
  const z0 = s0.z;
  let minGap = 99;
  let alignAtShot = -1;
  let followHold = 0;
  let sawFollow = false;
  for (let i = 0; i < 70; i++) {
    stepSim(1 / 60);
    const s = world.skaters[4];
    const gap = Math.hypot(s.x - world.puck.x, s.z - world.puck.z);
    if (gap < minGap) minGap = gap;
    if (s.follow > 0.2 && !sawFollow) {
      sawFollow = true;
      alignAtShot = netAlign(s);
    }
    if (sawFollow && s.follow > 0.05 && netAlign(s) > 0.75) followHold += 1;
  }
  const moved = Math.hypot(world.skaters[4].x - x0, world.skaters[4].z - z0);
  assert.ok(minGap < 1.4, `one-timer stayed off the puck (${minGap.toFixed(2)})`);
  assert.ok(moved > 3.5, `one-timer did not skate to the intercept (${moved.toFixed(2)})`);
  assert.ok(sawFollow, "one-timer did not release");
  assert.ok(alignAtShot > 0.75, `one-timer faced away from the net (${alignAtShot.toFixed(2)})`);
  assert.ok(followHold >= 8, `follow-through did not hold the net (${followHold})`);
});

test("loose one-timer candidate skates to the intercept ahead of a nearer teammate", () => {
  fresh();
  world.userId = 1;
  parkAway();
  place(world.skaters[1], -8.4, 11.2, 0);
  place(world.skaters[2], -6, -11, 0);
  place(world.skaters[3], -11.5, 7.6, 0);
  place(world.skaters[4], -20.2, 1.4, -1.57);
  place(world.skaters[5], -16, -10, 0);
  releasePass(-8.2, 10.4, -8.2, -16.5, null);
  world.oneTimerArmed = true;
  const x0 = world.skaters[4].x;
  const z0 = world.skaters[4].z;
  for (let i = 0; i < 50; i++) stepSim(1 / 60);
  const s = world.skaters[4];
  const moved = Math.hypot(s.x - x0, s.z - z0);
  assert.ok(moved > 5.5, `slot candidate did not sprint (${moved.toFixed(2)})`);
  assert.ok(s.z < z0 - 3.5, `slot candidate did not lead down to the intercept (${s.z.toFixed(2)})`);
});

test("a point one-timer turns to the net before the shot and holds it", () => {
  fresh();
  world.userId = 1;
  parkAway();
  const rd = world.skaters[2];
  place(world.skaters[1], -12.2, -3.2, 0);
  place(rd, -9.4, -11.3, -Math.PI / 2);
  place(world.skaters[3], -18, 6, 0);
  place(world.skaters[4], -20, 1, 0);
  place(world.skaters[5], -19, -6, 0);
  releasePass(-11.87, -4.39, 13.8, -38.9, rd.id);
  world.oneTimerArmed = true;
  const x0 = rd.x;
  const z0 = rd.z;
  let best = -1;
  let followHold = 0;
  let sawFollow = false;
  for (let i = 0; i < 40; i++) {
    stepSim(1 / 60);
    const align = netAlign(rd);
    if (align > best) best = align;
    if (rd.follow > 0.05) {
      sawFollow = true;
      if (align > 0.7) followHold += 1;
    }
  }
  const moved = Math.hypot(rd.x - x0, rd.z - z0);
  assert.ok(best > 0.7, `point one-timer stayed faced away (${best.toFixed(2)})`);
  assert.ok(sawFollow, "point one-timer did not release");
  assert.ok(followHold >= 4, `follow-through left the net (${followHold})`);
  assert.ok(moved < 4, `point left the intercept (${moved.toFixed(2)})`);
});

test("an ordinary shot keeps facing the net through the follow-through", () => {
  fresh();
  const shooter = world.skaters.find((s) => s.side === "home" && s.kind === "winger" && s.id !== 1);
  world.userId = 1;
  parkAway();
  place(shooter, -16, -2, -Math.PI / 2);
  shooter.follow = 0.5;
  world.lastShooter = shooter.id;
  world.lastShotOneTimer = false;
  world.puck.owner = null;
  world.puck.x = -20;
  world.puck.z = 0;
  world.puck.vx = -8;
  world.puck.vz = 0;
  let hold = 0;
  for (let i = 0; i < 18; i++) {
    stepSim(1 / 60);
    if (shooter.follow > 0.02 && netAlign(shooter) > 0.75) hold += 1;
  }
  assert.ok(hold >= 8, `ordinary follow did not face the net (${hold}, align ${netAlign(shooter).toFixed(2)})`);
  const user = world.skaters[1];
  place(user, -15, 1.5, -Math.PI / 2);
  user.follow = 0.45;
  world.userId = user.id;
  world.lastShooter = user.id;
  let userHold = 0;
  for (let i = 0; i < 16; i++) {
    stepSim(1 / 60);
    if (user.follow > 0.02 && netAlign(user) > 0.75) userHold += 1;
  }
  assert.ok(userHold >= 6, `user follow did not face the net (${userHold}, align ${netAlign(user).toFixed(2)})`);
});

test("a dive or a rim from behind the goal line does not get spun to the net", () => {
  fresh();
  const s = world.skaters.find((p) => p.side === "home" && p.kind === "winger" && p.id !== 1);
  world.userId = 1;
  place(s, GOAL_LINE_X + 1.2, 2, 0.4);
  s.follow = 0.5;
  s.dive = 0.4;
  world.lastShooter = s.id;
  const yaw = s.yaw;
  for (let i = 0; i < 10; i++) stepSim(1 / 60);
  assert.ok(Math.abs(s.yaw - yaw) < 0.05, `unsafe follow changed yaw (${s.yaw.toFixed(2)})`);
});

test("a receiver already on the pass does not leave that spot for a worse intercept", () => {
  fresh();
  world.userId = 1;
  parkAway();
  place(world.skaters[1], -8, 8, 0);
  place(world.skaters[2], 4, 10, 0);
  place(world.skaters[3], -4, 9, 0);
  // On the coast about 0.6s out, in the slot. Staying catches it. A far wing is the decoy.
  place(world.skaters[4], -14.3, 1.3, faceYaw("home"));
  place(world.skaters[5], -22, 8, 0);
  releasePass(-10.2, 6.4, -7.4, -9.2, null);
  world.oneTimerArmed = true;
  const x0 = world.skaters[4].x;
  const z0 = world.skaters[4].z;
  for (let i = 0; i < 36; i++) stepSim(1 / 60);
  const s = world.skaters[4];
  const moved = Math.hypot(s.x - x0, s.z - z0);
  assert.ok(moved < 1.8, `in-position receiver was pulled off the pass (${moved.toFixed(2)})`);
});
