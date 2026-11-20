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

/** Along-board samples once the puck is on the glass. Glide must not bleed speed. */
function runRim(frames) {
  const x0 = world.puck.x;
  const z0 = world.puck.z;
  const halfW = RINK_W / 2;
  const speeds = [];
  for (let i = 0; i < frames; i++) {
    step(1);
    if (Math.abs(world.puck.z) > halfW - 0.35) {
      speeds.push(Math.hypot(world.puck.vx, world.puck.vz));
    }
  }
  return {
    run: Math.hypot(world.puck.x - x0, world.puck.z - z0),
    wall: Math.abs(world.puck.z),
    speeds,
  };
}

function assertGlideHoldsSpeed(speeds, label) {
  assert.ok(speeds.length >= 30, `${label} wall samples ${speeds.length}`);
  const held = speeds.slice(3);
  const hi = Math.max(...held);
  const lo = Math.min(...held);
  assert.ok(lo > 12, `${label} glide died at ${lo.toFixed(2)} m/s`);
  assert.ok(lo > hi * 0.985, `${label} slowed ${hi.toFixed(2)} -> ${lo.toFixed(2)}`);
}

test("a charged board rim is faster and runs farther than a tap", () => {
  const tapLeave = releaseRim(0.05);
  assert.ok(world.puck.owner === null, "tap rim did not leave the stick");
  const tap = runRim(45);
  assert.equal(world.puck.owner, null, "tap rim was picked up");
  assertGlideHoldsSpeed(tap.speeds, "tap");

  const fullLeave = releaseRim(1.5);
  assert.ok(world.puck.owner === null, "charged rim did not leave the stick");
  const full = runRim(45);
  assert.equal(world.puck.owner, null, "charged rim was picked up");
  assertGlideHoldsSpeed(full.speeds, "charge");

  const tapMps = 55 / 2.23694;
  const fullMps = 95 / 2.23694;
  assert.ok(Math.abs(tapLeave - tapMps) < 1.5, `tap left at ${tapLeave.toFixed(2)} m/s`);
  assert.ok(fullLeave > tapLeave * 1.45, `full ${fullLeave.toFixed(2)} vs tap ${tapLeave.toFixed(2)}`);
  assert.ok(Math.abs(fullLeave - fullMps) < 1.5, `full left at ${fullLeave.toFixed(2)} m/s`);
  assert.ok(full.run > tap.run * 1.35, `full ran ${full.run.toFixed(1)} m, tap ${tap.run.toFixed(1)} m`);
  assert.ok(tap.wall > RINK_W / 2 - 2, `tap left the wall at z ${world.puck.z.toFixed(2)}`);
  assert.ok(Math.abs(world.puck.z) > RINK_W / 2 - 2, `charge left the wall at z ${world.puck.z.toFixed(2)}`);
});

test("a fast slide keeps its speed through the corner", () => {
  boot();
  const halfW = RINK_W / 2;
  const innerL = RINK_L / 2 - CORNER_R;
  const innerW = RINK_W / 2 - CORNER_R;
  launch(-12, PUCK_Y, halfW - 0.12, -33, 0, 0);
  const cornerEff = [];
  let prevX = world.puck.x;
  let prevZ = world.puck.z;
  let leftCorner = false;
  for (let i = 0; i < 80; i++) {
    step(1);
    const corner = Math.abs(world.puck.x) > innerL && Math.abs(world.puck.z) > innerW;
    const eff = Math.hypot(world.puck.x - prevX, world.puck.z - prevZ) / DT;
    if (corner && !leftCorner) cornerEff.push(eff);
    else if (cornerEff.length > 0) leftCorner = true;
    prevX = world.puck.x;
    prevZ = world.puck.z;
    if (world.puck.owner !== null) break;
  }
  assert.ok(cornerEff.length > 8, "the slide never reached the corner");
  assert.equal(world.puck.owner, null);
  const minCorner = Math.min(...cornerEff);
  assert.ok(minCorner > 26, `corner crawl ${minCorner.toFixed(1)} m/s`);
});

test("friction slider changes loose-puck drag", () => {
  const coast = (friction) => {
    boot();
    useGame.getState().setFriction(friction);
    launch(0, PUCK_Y, 0, 20, 0, 0);
    world.lastPass = -10;
    world.lastShoot = -10;
    step(60);
    assert.equal(world.puck.owner, null, `friction ${friction} picked the puck up`);
    return Math.hypot(world.puck.vx, world.puck.vz);
  };
  try {
    const light = coast(0);
    const normal = coast(0.25);
    const heavy = coast(1);
    const expectAt = (k) => 20 * Math.exp(-k);
    assert.ok(Math.abs(light - 20) < 0.35, `zero drag ${light.toFixed(3)}`);
    assert.ok(Math.abs(normal - expectAt(0.25)) < 0.4, `default drag ${normal.toFixed(3)}`);
    assert.ok(light > normal + 1, `light ${light.toFixed(3)} vs normal ${normal.toFixed(3)}`);
    assert.ok(heavy < normal - 4, `heavy ${heavy.toFixed(3)} vs normal ${normal.toFixed(3)}`);
    assert.ok(Math.abs(heavy - expectAt(1)) < 0.6, `heavy drag ${heavy.toFixed(3)}`);
  } finally {
    useGame.getState().setFriction(0.25);
  }
});

function boardGap(x, z) {
  const halfL = RINK_L / 2;
  const halfW = RINK_W / 2;
  const innerL = halfL - CORNER_R;
  const innerW = halfW - CORNER_R;
  if (Math.abs(x) <= innerL) return halfW - Math.abs(z);
  if (Math.abs(z) <= innerW) return halfL - Math.abs(x);
  const cx = Math.sign(x || 1) * innerL;
  const cz = Math.sign(z || 1) * innerW;
  return CORNER_R - Math.hypot(x - cx, z - cz);
}

function nearCorner(x, z) {
  return Math.abs(x) > RINK_L / 2 - CORNER_R - 1.4 && Math.abs(z) > RINK_W / 2 - CORNER_R - 1.4;
}

/** What straight the puck was on just before it left the rail. */
function approachKind(hist) {
  const on = hist.filter((s) => s.gap < 0.9);
  const endish = (s) => Math.abs(s.x) > GOAL_LINE_X - 0.5 && Math.abs(s.z) < 8;
  const sideish = (s) => Math.abs(s.z) > RINK_W / 2 - 1.6 && Math.abs(s.x) < RINK_L / 2 - CORNER_R + 1.2;
  let i = on.length - 1;
  while (i >= 0 && !endish(on[i]) && !sideish(on[i])) i--;
  if (i < 0) return "other";
  const mode = endish(on[i]) ? "net" : "side";
  const stretch = [];
  while (i >= 0) {
    const s = on[i];
    if (mode === "net" ? !endish(s) : !sideish(s)) break;
    stretch.push(s);
    i--;
  }
  if (mode === "net" && stretch.length > 3) return "net";
  if (mode === "side" && stretch.length > 3) {
    const xs = stretch.map((s) => s.x);
    if (Math.min(...xs) < -1 && Math.max(...xs) > 1) return "center";
  }
  return "other";
}

function rideRim(roll, seconds) {
  releaseRim(0.05);
  for (const s of world.skaters) {
    s.stun = 40;
    s.vx = 0;
    s.vz = 0;
    s.hit = 0;
    s.poke = 0;
  }
  const real = Math.random;
  Math.random = () => roll;
  const hist = [];
  let left = null;
  let straightLate = false;
  let glideAt = null;
  try {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      step(1);
      const p = world.puck;
      const gap = boardGap(p.x, p.z);
      if (glideAt === null && gap < 0.45) glideAt = world.time;
      const age = glideAt === null ? 0 : world.time - glideAt;
      hist.push({ x: p.x, z: p.z, gap, age });
      if (hist.length > 220) hist.shift();
      const onSide = Math.abs(p.x) < RINK_L / 2 - CORNER_R - 2 && gap < 0.55;
      if (age > 5 && onSide) straightLate = true;
      if (glideAt !== null && !left && gap > 1.15) {
        left = {
          age,
          x: p.x,
          z: p.z,
          corner: nearCorner(p.x, p.z),
          kind: approachKind(hist),
        };
        break;
      }
    }
  } finally {
    Math.random = real;
  }
  return { left, straightLate };
}

test("an ice board glide leaves only at a corner after 5s", () => {
  const held = rideRim(0.99, 8);
  assert.equal(held.left, null, `roll 0.99 left at ${held.left?.age.toFixed(2)}s`);
  assert.equal(held.straightLate, true, "the straight after 5s did not keep the puck");

  const sure = rideRim(0, 9);
  assert.ok(sure.left, "a certain roll never left");
  assert.ok(sure.left.age >= 5, `left at ${sure.left.age.toFixed(2)}s`);
  assert.equal(sure.left.corner, true, `left off a straight at ${sure.left.x.toFixed(1)}, ${sure.left.z.toFixed(1)}`);
  assert.equal(sure.left.kind, "net", `certain roll left on ${sure.left.kind}`);

  // 0.40 is under the center-line 50% and over the behind-net 25%.
  const center = rideRim(0.4, 10);
  assert.ok(center.left, "center-line roll never left");
  assert.ok(center.left.age >= 5, `center left at ${center.left.age.toFixed(2)}s`);
  assert.equal(center.left.kind, "center", `0.40 left on ${center.left.kind}`);

  // 0.20 is under both, so the first eligible corner can be the one behind the net.
  const net = rideRim(0.2, 10);
  assert.ok(net.left, "behind-net roll never left");
  assert.ok(net.left.age >= 5, `net left at ${net.left.age.toFixed(2)}s`);
  assert.equal(net.left.kind, "net", `0.20 left on ${net.left.kind}`);
});
