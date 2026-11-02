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
const { GOAL_LINE_X, GOAL_W, GOAL_H, RINK_W, RINK_L, CORNER_R, reflectBoard, BOARD_BOUNCE_DAMP } = rink;

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
  // Normal restitution only. A steeper inbound angle still leaves toward the net.
  const ix0 = outX;
  const iz0 = -outZ / BOARD_BOUNCE_DAMP;
  const inL = Math.hypot(ix0, iz0) || 1;
  const ix = ix0 / inL;
  const iz = iz0 / inL;
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
  const rise = wallZ - bz;
  const hx =
    (BOARD_BOUNCE_DAMP * rise * GOAL_LINE_X + bx * wallZ) / (wallZ + BOARD_BOUNCE_DAMP * rise);
  const ax = hx - bx;
  const az = rise;
  const n = Math.hypot(ax, az) || 1;
  return { mx: az / n, my: ax / n, hx, wallZ };
}

function runLooseBank() {
  boot();
  const bank = flatBankStart();
  const sp = 16;
  launch(bank.x, PUCK_Y, bank.z, bank.vx * sp, 0, bank.vz * sp);
  let faceZ = null;
  let bounced = false;
  let deepest = world.puck.x;
  let prevVx = world.puck.vx;
  const samples = [];
  for (let i = 0; i < 180; i++) {
    step(1);
    samples.push([world.puck.x, world.puck.z, world.puck.vx, world.puck.vz]);
    if (world.puck.x > deepest) deepest = world.puck.x;
    if (prevVx > 1 && world.puck.vx < 0 && world.puck.x > GOAL_LINE_X - 1.2) {
      bounced = true;
      faceZ = world.puck.z;
      break;
    }
    prevVx = world.puck.vx;
    if (world.stoppage) break;
  }
  return { faceZ, bounced, deepest, samples, x: world.puck.x };
}

test("a board bounce at the right angle hits the scrimmage face and repeats", () => {
  const a = runLooseBank();
  const b = runLooseBank();
  assert.equal(a.bounced, true, "first bank did not come off the face");
  assert.ok(a.deepest > GOAL_LINE_X - 0.8, `bank never reached the net, deepest ${a.deepest.toFixed(2)}`);
  assert.ok(a.x < GOAL_LINE_X - 0.01, `bank went through at ${a.x.toFixed(2)}`);
  assert.ok(a.faceZ !== null && Math.abs(a.faceZ) < GOAL_W / 2 + 0.15, `bank met the face at z ${a.faceZ}`);
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

test("board damp keeps along-board speed and does not repeat while pressed", () => {
  // +z wall, outbound +vz. Normal comes back inward. Tangent is untouched.
  const head = reflectBoard(0, 10, 0, 1);
  assert.ok(Math.abs(head.vx) < 1e-9);
  assert.ok(Math.abs(head.vz - -10 * BOARD_BOUNCE_DAMP) < 1e-9);
  const graze = reflectBoard(18, 1.2, 0, 1);
  assert.ok(Math.abs(graze.vx - 18) < 1e-9, `tangent ${graze.vx}`);
  assert.ok(Math.abs(graze.vz - (1.2 - (1 + BOARD_BOUNCE_DAMP) * 1.2)) < 1e-9);
  const away = reflectBoard(18, -2, 0, 1);
  assert.equal(away.vx, 18);
  assert.equal(away.vz, -2);
  const mirror = reflectBoard(4, 7, 0, 1, 1);
  assert.ok(Math.abs(mirror.vx - 4) < 1e-9 && Math.abs(mirror.vz + 7) < 1e-9);

  boot();
  const halfW = RINK_W / 2;
  launch(-8, PUCK_Y, halfW - 0.05, 16, 0, 0.4);
  step(1);
  assert.ok(world.puck.vx > 15.5, `first contact scaled the whole vector, vx ${world.puck.vx.toFixed(3)}`);
  step(89);
  const dragged = 16 * Math.exp(-0.2 * 90 * DT);
  assert.ok(
    world.puck.vx > dragged * 0.92,
    `slide vx ${world.puck.vx.toFixed(3)} fell below ice drag ${dragged.toFixed(3)}`,
  );
  assert.ok(Math.abs(world.puck.z) > halfW - 0.4, `left the wall at z ${world.puck.z.toFixed(3)}`);

  // A later hit on the far boards is a new contact and damps that normal once.
  boot();
  launch(0, PUCK_Y, -halfW + 0.04, 2, 0, -8);
  const before = Math.hypot(world.puck.vx, world.puck.vz);
  step(1);
  const draggedIn = 8 * Math.exp(-0.2 * DT);
  assert.ok(
    world.puck.vz > draggedIn * BOARD_BOUNCE_DAMP - 0.15 &&
      world.puck.vz < draggedIn * BOARD_BOUNCE_DAMP + 0.15,
    `new wall bounced vz ${world.puck.vz.toFixed(3)}`,
  );
  assert.ok(Math.abs(world.puck.vx - 2 * Math.exp(-0.2 * DT)) < 0.05, "far-wall tangent kept");
  assert.ok(Math.hypot(world.puck.vx, world.puck.vz) < before, "normal restitution removed energy");

  // Around the corner the wall normal turns every step. That is still one press.
  boot();
  const innerL = RINK_L / 2 - CORNER_R;
  const innerW = RINK_W / 2 - CORNER_R;
  const theta = 0.55;
  const nx = Math.sin(theta);
  const nz = Math.cos(theta);
  const rad = CORNER_R - 0.05;
  const sp = 14;
  launch(innerL + nx * rad, PUCK_Y, innerW + nz * rad, nz * sp + nx * 0.35, 0, -nx * sp + nz * 0.35);
  step(50);
  const left = Math.hypot(world.puck.vx, world.puck.vz);
  const cornerDrag = sp * Math.exp(-0.2 * 50 * DT);
  assert.ok(left > cornerDrag * 0.9, `corner slide ${left.toFixed(3)} vs ice drag ${cornerDrag.toFixed(3)}`);
});

test("a pass off the boards at that angle comes off the scrimmage face", () => {
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
  let faceZ = null;
  let prevVx = world.puck.vx;
  for (let i = 0; i < 200; i++) {
    step(1);
    if (prevVx > 1 && world.puck.vx < 0 && world.puck.x > GOAL_LINE_X - 1.2) {
      faceZ = world.puck.z;
      break;
    }
    prevVx = world.puck.vx;
    if (world.puck.owner !== null) break;
  }
  assert.ok(faceZ !== null, `pass bank missed the face, puck ${world.puck.x.toFixed(2)}, ${world.puck.z.toFixed(2)}`);
  assert.ok(world.puck.x < GOAL_LINE_X - 0.01, `pass went through at ${world.puck.x.toFixed(2)}`);
  assert.ok(Math.abs(faceZ) < GOAL_W / 2 + 0.15, `pass met the face at z ${faceZ}`);
});

function releaseRim(holdS) {
  boot();
  const halfW = RINK_W / 2;
  putBlade(-18, halfW - 0.45);
  const s = user();
  s.stun = 0;
  world.puck.owner = s.id;
  const blade = stickBlade(s);
  world.puck.x = blade.x;
  world.puck.z = blade.z;
  world.puck.y = PUCK_Y;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  const realNow = performance.now.bind(performance);
  let ms = 5_000_000;
  performance.now = () => ms;
  try {
    setInjectedAim(0.05, 1);
    setInjectedKeys(["KeyE"]);
    step(1);
    ms += holdS * 1000;
    step(1);
    setInjectedKeys([]);
    step(1);
  } finally {
    performance.now = realNow;
    setInjectedKeys([]);
    setInjectedAim(0, 0);
  }
  s.stun = 9;
  s.x = -24;
  s.z = 0;
  return Math.hypot(world.puck.vx, world.puck.vz);
}

test("a charged board rim is faster and runs farther than a tap", () => {
  const tapLeave = releaseRim(0.05);
  assert.ok(world.puck.owner === null, "tap rim did not leave the stick");
  const tapX = world.puck.x;
  const tapZ = world.puck.z;
  step(45);
  const tapRun = Math.hypot(world.puck.x - tapX, world.puck.z - tapZ);
  const tapWall = Math.abs(world.puck.z);

  const fullLeave = releaseRim(1.5);
  assert.ok(world.puck.owner === null, "charged rim did not leave the stick");
  const fullX = world.puck.x;
  const fullZ = world.puck.z;
  step(45);
  const fullRun = Math.hypot(world.puck.x - fullX, world.puck.z - fullZ);

  const tapMps = 55 / 2.23694;
  const fullMps = 95 / 2.23694;
  assert.ok(Math.abs(tapLeave - tapMps) < 1.5, `tap left at ${tapLeave.toFixed(2)} m/s`);
  assert.ok(fullLeave > tapLeave * 1.45, `full ${fullLeave.toFixed(2)} vs tap ${tapLeave.toFixed(2)}`);
  assert.ok(Math.abs(fullLeave - fullMps) < 1.5, `full left at ${fullLeave.toFixed(2)} m/s`);
  assert.ok(fullRun > tapRun * 1.35, `full ran ${fullRun.toFixed(1)} m, tap ${tapRun.toFixed(1)} m`);
  assert.ok(tapWall > RINK_W / 2 - 2, `tap left the wall at z ${world.puck.z.toFixed(2)}`);
  assert.ok(Math.abs(world.puck.z) > RINK_W / 2 - 2, `charge left the wall at z ${world.puck.z.toFixed(2)}`);
});
