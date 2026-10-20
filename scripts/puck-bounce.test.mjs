/**
 * Iron does not throw a puck back harder than it arrived.
 * A board pass at the reflection angle reaches an empty net, and the bounce repeats.
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

const { resetWorld, stepSim, world, stickBlade } = sim;
const { useGame } = store;
const { setInjectedKeys, setInjectedAim } = input;
const { GOAL_LINE_X, GOAL_W, GOAL_H, RINK_W, RINK_L, CORNER_R } = rink;

const DT = 1 / 60;
const PUCK_Y = 0.042;

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function user() {
  return world.skaters[world.userId];
}

function speedOf(p = world.puck) {
  return Math.hypot(p.vx, p.vy, p.vz);
}

function boot() {
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  const ui = useGame.getState();
  if (ui.clockMode === "scrimmage" || ui.clockMode === "practice") ui.setClockMode("roller");
  ui.setScrimmageHomeTargets(4);
  ui.setScrimmageAwayTargets(4);
  ui.setClockMode("scrimmage");
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setOffsides(false);
  ui.setControlProfile("classic");
  resetWorld();
  world.homeAttack = 1;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.goalSide = null;
  world.goalBank = null;
  world.goalieShot = null;
  world.reboundSoft = false;
  world.reboundN = 0;
  world.lastShotCorner = false;
  world.lastShotCornerSide = 0;
  world.puck.owner = null;
  const now = useGame.getState();
  now.setWhistle(null);
  now.setPeriodOver(false);
  now.setGoalSide(null);
  for (const s of world.skaters) {
    s.x = -24;
    s.z = (s.id - 2) * 1.4;
    s.vx = 0;
    s.vz = 0;
    s.stun = 8;
    s.struck = 0;
    s.dive = 0;
  }
}

function markShot() {
  world.lastPass = world.time - 1;
  world.lastShoot = world.time;
  world.lastShooter = world.userId;
  world.lastShotCorner = false;
  world.lastShotCornerSide = 0;
  world.goalieShot = null;
  world.goalBank = null;
  world.puck.owner = null;
}

function launch(x, y, z, vx, vy, vz) {
  const puck = world.puck;
  puck.owner = null;
  puck.x = x;
  puck.y = y;
  puck.z = z;
  puck.vx = vx;
  puck.vy = vy;
  puck.vz = vz;
}

function withRoll(roll, fn) {
  const real = Math.random;
  Math.random = () => roll;
  try {
    fn();
  } finally {
    Math.random = real;
  }
}

function assertNoEnergyGain(frames = 50) {
  for (let i = 0; i < frames; i++) {
    const prev = speedOf();
    const prevH = Math.hypot(world.puck.vx, world.puck.vz);
    const prevVy = world.puck.vy;
    step(1);
    const sp = speedOf();
    const horiz = Math.hypot(world.puck.vx, world.puck.vz);
    assert.ok(horiz <= prevH + 0.02, `frame ${i} horizontal ${horiz.toFixed(3)} from ${prevH.toFixed(3)}`);
    if (world.puck.vy > prevVy + 0.05) {
      assert.ok(sp <= prev + 0.05, `frame ${i} popped to ${sp.toFixed(3)} from ${prev.toFixed(3)}`);
    }
    if (world.stoppage || world.periodOver) return;
  }
}

test("a slow post or crossbar does not return the puck harder than it arrived", () => {
  const mouth = GOAL_LINE_X;
  const postZ = GOAL_W / 2;
  for (const roll of [0.1, 0.7, 0.9]) {
    boot();
    markShot();
    launch(mouth - 1.1, 0.35, postZ, 3, 0, 0);
    withRoll(roll, () => assertNoEnergyGain(36));
  }
  for (const roll of [0.1, 0.7, 0.9]) {
    boot();
    markShot();
    launch(mouth - 0.9, 0.25, 0, 2.2, 1.4, 0);
    withRoll(roll, () => assertNoEnergyGain(40));
  }
});

test("a fast iron hit stays at or under the incoming speed", () => {
  const mouth = GOAL_LINE_X;
  boot();
  markShot();
  launch(mouth - 1.4, 0.4, GOAL_W / 2, 18, 0.4, 0);
  assertNoEnergyGain(30);
  boot();
  markShot();
  launch(mouth - 1.2, 0.4, 0, 16, 8, 0);
  assertNoEnergyGain(30);
});

test("a puck resting on the crossbar is not launched", () => {
  boot();
  launch(GOAL_LINE_X + 0.16, GOAL_H + 0.08, 0, 0.15, 0.04, 0.05);
  const beforeH = Math.hypot(world.puck.vx, world.puck.vz);
  for (let i = 0; i < 20; i++) {
    step(1);
    const horiz = Math.hypot(world.puck.vx, world.puck.vz);
    assert.ok(horiz <= beforeH + 0.02, `resting iron horizontal ${horiz.toFixed(3)}`);
    assert.ok(world.puck.vy < 0.4, `resting iron launched vy ${world.puck.vy.toFixed(3)}`);
  }
});

function flatBankStart() {
  const wallZ = RINK_W / 2 - 0.2;
  const hx = 18;
  assert.ok(Math.abs(hx) < RINK_L / 2 - CORNER_R - 1, "bank spot is on the flat boards");
  const outX = GOAL_LINE_X - hx;
  const outZ = -wallZ;
  const outL = Math.hypot(outX, outZ) || 1;
  const ix = outX / outL;
  const iz = -outZ / outL;
  const back = 8;
  return {
    x: hx - ix * back,
    z: wallZ - iz * back,
    vx: ix,
    vz: iz,
    wallZ,
    hx,
  };
}

function aimIntoNet(bx, bz) {
  const wallZ = RINK_W / 2 - 0.09;
  const hx = ((wallZ - bz) * GOAL_LINE_X + bx * wallZ) / (2 * wallZ - bz);
  const ax = hx - bx;
  const az = wallZ - bz;
  const n = Math.hypot(ax, az) || 1;
  return { mx: az / n, my: ax / n, hx, wallZ };
}

function mouthZ(prevX, prevZ, x, z) {
  const mouth = GOAL_LINE_X;
  if (x === prevX) return null;
  if (!((prevX - mouth) * (x - mouth) <= 0)) return null;
  if (prevX >= mouth) return null;
  const t = (mouth - prevX) / (x - prevX);
  return prevZ + (z - prevZ) * t;
}

function runLooseBank() {
  boot();
  const bank = flatBankStart();
  const sp = 16;
  launch(bank.x, PUCK_Y, bank.z, bank.vx * sp, 0, bank.vz * sp);
  let crossed = null;
  let prevX = world.puck.x;
  let prevZ = world.puck.z;
  const samples = [];
  for (let i = 0; i < 180; i++) {
    step(1);
    samples.push([world.puck.x, world.puck.z, world.puck.vx, world.puck.vz]);
    const zAt = mouthZ(prevX, prevZ, world.puck.x, world.puck.z);
    if (zAt !== null) {
      crossed = zAt;
      break;
    }
    prevX = world.puck.x;
    prevZ = world.puck.z;
    if (world.stoppage) break;
  }
  return { crossed, samples };
}

test("a board bounce at the right angle enters the empty net, and it repeats", () => {
  const a = runLooseBank();
  const b = runLooseBank();
  assert.ok(a.crossed !== null, "first bank missed the goal line");
  assert.ok(Math.abs(a.crossed) < GOAL_W / 2 - 0.04, `bank crossed at z ${a.crossed}`);
  assert.equal(a.samples.length, b.samples.length);
  for (let i = 0; i < a.samples.length; i++) {
    for (let k = 0; k < 4; k++) {
      assert.ok(Math.abs(a.samples[i][k] - b.samples[i][k]) < 1e-6, `sample ${i} differed`);
    }
  }
});

function putBlade(x, z) {
  const s = user();
  s.yaw = -Math.PI / 2;
  s.vx = 0;
  s.vz = 0;
  s.stun = 0;
  s.x = x;
  s.z = z;
  for (let i = 0; i < 3; i++) {
    const b = stickBlade(s);
    s.x += x - b.x;
    s.z += z - b.z;
  }
}

test("a pass off the boards at that angle still goes in", () => {
  boot();
  const bank = flatBankStart();
  putBlade(bank.x, bank.z);
  const s = user();
  world.puck.owner = s.id;
  world.puck.x = stickBlade(s).x;
  world.puck.z = stickBlade(s).z;
  world.puck.y = PUCK_Y;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  setInjectedKeys(["KeyE"]);
  step(1);
  const blade = stickBlade(s);
  const aim = aimIntoNet(blade.x, blade.z);
  assert.ok(Math.abs(aim.hx) < RINK_L / 2 - CORNER_R - 0.4, `contact x ${aim.hx}`);
  setInjectedAim(aim.mx, aim.my);
  setInjectedKeys([]);
  step(1);
  assert.equal(world.puck.owner, null, "pass did not leave the stick");
  let crossed = null;
  let prevX = world.puck.x;
  let prevZ = world.puck.z;
  for (let i = 0; i < 200; i++) {
    step(1);
    const zAt = mouthZ(prevX, prevZ, world.puck.x, world.puck.z);
    if (zAt !== null) {
      crossed = zAt;
      break;
    }
    prevX = world.puck.x;
    prevZ = world.puck.z;
    if (world.puck.owner !== null) break;
  }
  assert.ok(crossed !== null, `pass bank missed, puck ${world.puck.x.toFixed(2)}, ${world.puck.z.toFixed(2)}`);
  assert.ok(Math.abs(crossed) < GOAL_W / 2 - 0.04, `pass crossed at z ${crossed}`);
});
