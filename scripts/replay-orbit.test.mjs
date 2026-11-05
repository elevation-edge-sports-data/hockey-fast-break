/**
 * Pause-replay mouse orbit uses the same gains as the pause screen.
 * Replay theta 0 sits on +X, so a rightward drag increases theta and the
 * camera still moves toward screen-left. Wheel down pulls the camera back.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import * as THREE from "three";

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
if (typeof globalThis.navigator !== "object" || globalThis.navigator === null) globalThis.navigator = {};
let pads = [];
Object.defineProperty(globalThis.navigator, "getGamepads", {
  configurable: true,
  value: () => pads,
});

function stickPad(x, y, a = false) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  if (a) buttons[0] = { pressed: true, touched: true, value: 1 };
  return [
    {
      id: "test-standard",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: 0,
      axes: [x, y, 0, 0],
      buttons,
    },
  ];
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
const { orbitReplayPointer, zoomReplayPointer, resetWorld, stepSim, world, beginPauseReplay, stopPauseReplay, pauseGame, pickReplayLock, replayLockKind, toggleReplayFrameLock, replayFrameLocked, replayEditSkater, exportReplayFrame, rewindPauseReplay, undoReplayEdit, redoReplayEdit, replayUndoDepth, replayRedoDepth, seekReplay, replayFootagePct, goalieZKind, replayBoardNow, pressReplayShuttle, releaseReplayShuttle, toggleReplayTransport } = sim;
const { inferNamedPose } = poses;
const { useGame } = store;
const { setInjectedKeys } = input;

const view = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 240);

function place() {
  const cam = world.replayCam;
  const sp = Math.sin(cam.phi);
  const cp = Math.cos(cam.phi);
  view.up.set(0, 1, 0);
  view.position.set(
    cam.lx + cam.radius * sp * Math.cos(cam.theta),
    cam.ly + cam.radius * cp,
    cam.lz + cam.radius * sp * Math.sin(cam.theta),
  );
  view.lookAt(cam.lx, cam.ly, cam.lz);
  view.updateMatrixWorld();
}

function screenRight() {
  const e = view.matrixWorld.elements;
  return new THREE.Vector3(e[0], e[1], e[2]);
}

function movedCos(before, axis) {
  place();
  const moved = view.position.clone().sub(before);
  return moved.dot(axis) / moved.length();
}

function seed(theta) {
  const cam = world.replayCam;
  cam.theta = theta;
  cam.phi = 0.82;
  cam.radius = 14;
  cam.lx = 2;
  cam.ly = 0.5;
  cam.lz = -3;
  world.pauseDirty = false;
}

test("replay pointer drag matches the pause screen", () => {
  for (const theta of [2.15, 0, -1.2, Math.PI]) {
    seed(theta);
    place();
    const at = view.position.clone();
    const left = screenRight().negate();
    orbitReplayPointer(40, 0);
    const towardLeft = movedCos(at, left);
    assert.ok(towardLeft > 0.9, `theta ${theta}: drag right cos ${towardLeft}`);
    assert.equal(world.pauseDirty, false);

    seed(theta);
    place();
    const back = view.position.clone();
    const right = screenRight();
    orbitReplayPointer(-40, 0);
    const towardRight = movedCos(back, right);
    assert.ok(towardRight > 0.9, `theta ${theta}: drag left cos ${towardRight}`);

    seed(theta);
    place();
    const high = view.position.y;
    orbitReplayPointer(0, 30);
    place();
    assert.ok(world.replayCam.phi < 0.82);
    assert.ok(view.position.y > high + 0.5, `theta ${theta}: drag down should raise the camera`);
  }

  seed(2.15);
  world.replayCam.phi = 0.2;
  orbitReplayPointer(0, 1000);
  assert.equal(world.replayCam.phi, 0.12);
  world.replayCam.phi = 1.4;
  orbitReplayPointer(0, -1000);
  assert.equal(world.replayCam.phi, 1.45);
});

test("replay wheel zoom matches the pause screen", () => {
  seed(2.15);
  zoomReplayPointer(100);
  assert.ok(Math.abs(world.replayCam.radius - 16) < 1e-9);
  zoomReplayPointer(-50);
  assert.ok(Math.abs(world.replayCam.radius - 15) < 1e-9);
  assert.equal(world.pauseDirty, false);
  zoomReplayPointer(-1e6);
  assert.equal(world.replayCam.radius, 4.2);
  zoomReplayPointer(1e6);
  assert.equal(world.replayCam.radius, 120);
});

test("pause orbits from the left stick and arrows only while they are held", () => {
  const dt = 1 / 60;
  const frames = 10;
  useGame.getState().setClockMode("practice");
  useGame.getState().setPlaying(true);
  useGame.getState().setPaused(true);
  resetWorld();
  useGame.getState().setPlaying(true);
  useGame.getState().setPaused(true);
  world.replay = false;
  world.freeCam.theta = 0.4;
  world.freeCam.phi = 0.8;
  world.freeCam.radius = 20;
  world.pauseDirty = false;
  pads = [];
  setInjectedKeys([]);
  try {
    for (let i = 0; i < 30; i++) stepSim(dt);
    assert.equal(world.freeCam.theta, 0.4);
    assert.equal(world.freeCam.phi, 0.8);
    assert.equal(world.pauseDirty, false);

    pads = stickPad(0.05, 0.04);
    for (let i = 0; i < 30; i++) stepSim(dt);
    assert.equal(world.freeCam.theta, 0.4);
    assert.equal(world.freeCam.phi, 0.8);
    pads = [];

    setInjectedKeys(["ArrowRight"]);
    for (let i = 0; i < frames; i++) stepSim(dt);
    assert.ok(Math.abs(world.freeCam.theta - (0.4 - 2.15 * dt * frames)) < 1e-9);
    assert.equal(world.freeCam.phi, 0.8);
    assert.equal(world.pauseDirty, true);

    const heldRight = world.freeCam.theta;
    setInjectedKeys([]);
    for (let i = 0; i < 20; i++) stepSim(dt);
    assert.equal(world.freeCam.theta, heldRight);
    assert.equal(world.freeCam.phi, 0.8);

    world.freeCam.theta = 0.4;
    world.freeCam.phi = 0.8;
    setInjectedKeys(["ArrowLeft"]);
    for (let i = 0; i < frames; i++) stepSim(dt);
    assert.ok(Math.abs(world.freeCam.theta - (0.4 + 2.15 * dt * frames)) < 1e-9);
    assert.equal(world.freeCam.phi, 0.8);

    world.freeCam.theta = 0.4;
    world.freeCam.phi = 0.8;
    setInjectedKeys(["ArrowUp"]);
    for (let i = 0; i < frames; i++) stepSim(dt);
    assert.equal(world.freeCam.theta, 0.4);
    assert.ok(Math.abs(world.freeCam.phi - (0.8 - 1.35 * dt * frames)) < 1e-9);

    world.freeCam.theta = 0.4;
    world.freeCam.phi = 0.8;
    setInjectedKeys(["ArrowDown"]);
    for (let i = 0; i < frames; i++) stepSim(dt);
    assert.equal(world.freeCam.theta, 0.4);
    assert.ok(Math.abs(world.freeCam.phi - (0.8 + 1.35 * dt * frames)) < 1e-9);

    world.freeCam.theta = 0.4;
    world.freeCam.phi = 0.8;
    setInjectedKeys([]);
    pads = stickPad(1, 0);
    for (let i = 0; i < frames; i++) stepSim(dt);
    assert.ok(Math.abs(world.freeCam.theta - (0.4 - 2.15 * dt * frames)) < 1e-9);
    assert.equal(world.freeCam.phi, 0.8);

    const heldStick = world.freeCam.theta;
    pads = stickPad(0, 0);
    for (let i = 0; i < 20; i++) stepSim(dt);
    assert.equal(world.freeCam.theta, heldStick);

    pads = stickPad(1, 0);
    for (let i = 0; i < frames; i++) stepSim(dt);
    const pushed = world.freeCam.theta;
    assert.ok(pushed < heldStick);
    pads = stickPad(0.18, 0);
    for (let i = 0; i < 40; i++) stepSim(dt);
    assert.equal(world.freeCam.theta, pushed);
    assert.equal(world.freeCam.phi, 0.8);

    world.freeCam.theta = 0.4;
    world.freeCam.phi = 0.8;
    pads = stickPad(0, -1);
    for (let i = 0; i < frames; i++) stepSim(dt);
    assert.equal(world.freeCam.theta, 0.4);
    assert.ok(Math.abs(world.freeCam.phi - (0.8 - 1.35 * dt * frames)) < 1e-9);

    pads = [];
    world.freeCam.theta = 0.4;
    world.freeCam.phi = 0.8;
    world.freeCam.radius = 20;
    setInjectedKeys(["Equal"]);
    for (let i = 0; i < frames; i++) stepSim(dt);
    assert.equal(world.freeCam.theta, 0.4);
    assert.equal(world.freeCam.phi, 0.8);
    assert.ok(world.freeCam.radius < 20);
  } finally {
    pads = [];
    setInjectedKeys([]);
    useGame.getState().setPaused(false);
  }
});

function bootReplay() {
  const dt = 1 / 60;
  useGame.getState().setClockMode("practice");
  useGame.getState().setPlaying(true);
  useGame.getState().setPaused(false);
  resetWorld();
  useGame.getState().setPlaying(true);
  useGame.getState().setPaused(false);
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.vx = 3;
  world.puck.vz = 0;
  setInjectedKeys([]);
  pads = [];
  for (let i = 0; i < 20; i++) stepSim(dt);
  useGame.getState().setPaused(true);
  if (!beginPauseReplay()) throw new Error("replay did not start");
  world.replayPlaying = false;
}

function iceXStep(dt) {
  return world.replayCam.radius * 0.9 * dt;
}

test("opening replay stays free while the X follows the puck", () => {
  bootReplay();
  try {
    world.replayPlaying = false;
    seekReplay(0);
    const early = { x: world.puck.x, z: world.puck.z };
    assert.equal(replayLockKind(), "free");
    assert.ok(Math.hypot(world.replayCam.lx - early.x, world.replayCam.lz - early.z) < 0.05);
    seekReplay(1);
    const late = { x: world.puck.x, z: world.puck.z };
    assert.equal(replayLockKind(), "free");
    assert.ok(Math.hypot(world.replayCam.lx - late.x, world.replayCam.lz - late.z) < 0.05);
    const moved = Math.hypot(late.x - early.x, late.z - early.z);
    if (moved > 0.2) assert.ok(Math.hypot(world.replayCam.lx - early.x, world.replayCam.lz - early.z) > 0.15);
  } finally {
    stopPauseReplay();
    setInjectedKeys([]);
  }
});

test("pause replay opens from the last gameplay camera angle", () => {
  bootReplay();
  stopPauseReplay();
  try {
    const ly = Math.max(0.4, world.puck.y);
    const dx = 12;
    const dy = 9;
    const dz = -3;
    world.camX = world.puck.x + dx;
    world.camY = ly + dy;
    world.camZ = world.puck.z + dz;
    useGame.getState().setPaused(false);
    pauseGame();
    if (!beginPauseReplay()) throw new Error("replay did not start");
    const rc = world.replayCam;
    const ox = rc.radius * Math.sin(rc.phi) * Math.cos(rc.theta);
    const oy = rc.radius * Math.cos(rc.phi);
    const oz = rc.radius * Math.sin(rc.phi) * Math.sin(rc.theta);
    assert.ok(Math.abs(ox - dx) < 1e-6, `offset x ${ox}`);
    assert.ok(Math.abs(oy - dy) < 1e-6, `offset y ${oy}`);
    assert.ok(Math.abs(oz - dz) < 1e-6, `offset z ${oz}`);
  } finally {
    stopPauseReplay();
  }
});

test("a click on a skater or the puck locks that target", () => {
  bootReplay();
  try {
    const lookX = world.replayCam.lx;
    const lookZ = world.replayCam.lz;
    for (const s of world.skaters) {
      s.x = 40;
      s.z = 40;
      s.comX = 40;
      s.comZ = 40;
    }
    world.puck.x = lookX;
    world.puck.z = lookZ;
    world.puck.y = world.replayCam.ly;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayLockKind(), "puck");
    assert.ok(Math.hypot(world.replayCam.lx - lookX, world.replayCam.lz - lookZ) < 1e-6);

    world.puck.x = 30;
    world.puck.z = 30;
    world.puck.y = 0.04;
    const skater = world.skaters[0];
    skater.x = lookX;
    skater.z = lookZ;
    skater.comX = lookX;
    skater.comZ = lookZ;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayLockKind(), "skater");
    assert.equal(world.replayCam.lx, skater.x);
    assert.equal(world.replayCam.lz, skater.z);

    skater.x = 25;
    skater.z = 25;
    skater.comX = 25;
    skater.comZ = 25;
    world.puck.x = 28;
    world.puck.z = 28;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayLockKind(), "free");
    assert.equal(skater.x, 25);
    assert.equal(skater.z, 25);
    assert.equal(world.puck.x, 28);
    assert.equal(world.puck.z, 28);
    assert.ok(Math.hypot(world.replayCam.lx - lookX, world.replayCam.lz - lookZ) > 0.4);
  } finally {
    stopPauseReplay();
  }
});

function iceUnder(ndcX, ndcY) {
  place();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), view);
  const ray = raycaster.ray;
  const t = -ray.origin.y / ray.direction.y;
  return {
    x: ray.origin.x + ray.direction.x * t,
    z: ray.origin.z + ray.direction.z * t,
  };
}

test("an ice click places the X and leaves the player and the puck", () => {
  bootReplay();
  try {
    for (const s of world.skaters) {
      s.x = 40;
      s.z = 40;
      s.comX = 40;
      s.comZ = 40;
    }
    world.puck.x = 36;
    world.puck.z = 36;
    world.puck.y = 0.04;
    const spot = iceUnder(0.42, -0.28);
    const beforeX = world.skaters[0].x;
    const beforeZ = world.skaters[0].z;
    const beforePuck = world.puck.x;
    pickReplayLock(0.42, -0.28, 16 / 9);
    assert.equal(replayLockKind(), "free");
    assert.ok(Math.abs(world.replayCam.lx - spot.x) < 1e-3);
    assert.ok(Math.abs(world.replayCam.lz - spot.z) < 1e-3);
    assert.equal(world.skaters[0].x, beforeX);
    assert.equal(world.skaters[0].z, beforeZ);
    assert.equal(world.puck.x, beforePuck);

    assert.equal(toggleReplayFrameLock(), true);
    const skater = world.skaters[0];
    skater.x = world.replayCam.lx;
    skater.z = world.replayCam.lz;
    skater.comX = skater.x;
    skater.comZ = skater.z;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), 0);
    const beforeEdit = exportReplayFrame();
    skater.x = 40;
    skater.z = 40;
    skater.comX = 40;
    skater.comZ = 40;
    const heldPuck = world.puck.x;
    const edited = iceUnder(-0.35, 0.22);
    pickReplayLock(-0.35, 0.22, 16 / 9);
    assert.equal(replayEditSkater(), null);
    assert.equal(replayLockKind(), "free");
    assert.ok(Math.abs(world.replayCam.lx - edited.x) < 1e-3);
    assert.ok(Math.abs(world.replayCam.lz - edited.z) < 1e-3);
    assert.equal(skater.x, 40);
    assert.equal(skater.z, 40);
    assert.equal(world.puck.x, heldPuck);
    const saved = exportReplayFrame();
    assert.equal(saved.adjusted.players[0].x, beforeEdit.adjusted.players[0].x);
    assert.equal(saved.adjusted.players[0].z, beforeEdit.adjusted.players[0].z);
    assert.equal(saved.adjusted.puck.x, beforeEdit.adjusted.puck.x);
    assert.equal(saved.adjusted.puck.z, beforeEdit.adjusted.puck.z);
  } finally {
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("the ice X locks a nearby center of mass and ignores a far one", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    const lx = world.replayCam.lx;
    const lz = world.replayCam.lz;
    for (const s of world.skaters) {
      s.comX = lx + 2.2;
      s.comZ = lz;
    }
    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    stepSim(dt);
    setInjectedKeys([]);
    stepSim(dt);
    assert.equal(replayLockKind(), "puck");
    stopPauseReplay();

    bootReplay();
    const lx2 = world.replayCam.lx;
    const lz2 = world.replayCam.lz;
    for (const s of world.skaters) {
      s.comX = lx2 + 2.2;
      s.comZ = lz2;
    }
    world.skaters[0].comX = lx2 + 0.7;
    world.skaters[0].comZ = lz2;
    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    stepSim(dt);
    setInjectedKeys([]);
    stepSim(dt);
    assert.equal(replayLockKind(), "skater");
  } finally {
    setInjectedKeys([]);
    stopPauseReplay();
  }
});

test("panning the ice X onto a center of mass locks that skater", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    const lx = world.replayCam.lx;
    const lz = world.replayCam.lz;
    for (const s of world.skaters) {
      s.comX = 80;
      s.comZ = 80;
    }
    const skater = world.skaters[0];
    skater.comX = lx + 0.5;
    skater.comZ = lz;
    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    stepSim(dt);
    assert.equal(replayLockKind(), "free");
    const parked = world.replayCam.lx;
    setInjectedKeys([]);
    stepSim(dt);
    assert.equal(replayLockKind(), "skater");
    assert.equal(world.replayCam.lx, skater.x);
    assert.ok(Math.abs(parked - (lx + 0.42)) < 0.03);
    for (let i = 0; i < 6; i++) stepSim(dt);
    assert.equal(replayLockKind(), "skater");
    assert.equal(world.replayCam.lx, skater.x);
  } finally {
    setInjectedKeys([]);
    stopPauseReplay();
  }
});

function stampReplayBasis() {
  place();
  const e = view.matrixWorld.elements;
  let fx = -e[8];
  let fz = -e[10];
  let rx = e[0];
  let rz = e[2];
  const fm = Math.hypot(fx, fz) || 1;
  fx /= fm;
  fz /= fm;
  const rm = Math.hypot(rx, rz) || 1;
  rx /= rm;
  rz /= rm;
  world.camFx = fx;
  world.camFz = fz;
  world.camRx = rx;
  world.camRz = rz;
  return { fx, fz, rx, rz };
}

function parkOffRay(keep) {
  for (const s of world.skaters) {
    if (s === keep) continue;
    s.x = 60;
    s.z = 60;
    s.comX = 60;
    s.comZ = 60;
  }
  world.puck.x = 55;
  world.puck.z = 55;
  world.puck.y = 0.04;
}

test("a locked replay frame freezes scrub and edits a copy", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    assert.equal(toggleReplayFrameLock(), true);
    assert.equal(replayFrameLocked(), true);
    const t0 = world.replayT;
    const before = exportReplayFrame();
    assert.ok(before);
    assert.equal(before.time, t0);
    assert.equal(before.frame, Math.floor(t0 * 60));
    setInjectedKeys(["KeyG", "KeyE"]);
    for (let n = 0; n < 8; n++) stepSim(dt);
    assert.equal(world.replayT, t0);
    assert.equal(world.replayPlaying, false);
    setInjectedKeys([]);

    const theta = world.replayCam.theta;
    const radius = world.replayCam.radius;
    orbitReplayPointer(40, 0);
    zoomReplayPointer(30);
    assert.ok(world.replayCam.theta > theta);
    assert.ok(world.replayCam.radius > radius);

    parkOffRay(world.skaters[0]);
    const skater = world.skaters[0];
    skater.x = world.replayCam.lx;
    skater.z = world.replayCam.lz;
    skater.comX = skater.x;
    skater.comZ = skater.z;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), 0);
    assert.equal(replayLockKind(), "skater");

    world.replayCam.theta = 0;
    const basis = stampReplayBasis();
    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    setInjectedKeys([]);
    const moved = exportReplayFrame();
    assert.ok(moved);
    assert.equal(moved.frame, before.frame);
    assert.equal(moved.time, t0);
    assert.equal(moved.original.players[0].x, before.original.players[0].x);
    assert.equal(moved.original.players[0].z, before.original.players[0].z);
    assert.equal(moved.original.puck.x, before.original.puck.x);
    assert.equal(moved.original.puck.y, before.original.puck.y);
    assert.equal(moved.original.puck.owner, before.original.puck.owner);
    const dx = moved.adjusted.players[0].x - moved.original.players[0].x;
    const dz = moved.adjusted.players[0].z - moved.original.players[0].z;
    const along = (dx * basis.fx + dz * basis.fz) / Math.hypot(dx, dz);
    assert.ok(along > 0.9, `arrow up cos ${along}`);
    assert.ok(Math.abs(Math.hypot(dx, dz) - 4 * dt) < 1e-9);
    assert.equal(world.skaters[0].x, moved.adjusted.players[0].x);
    assert.equal(world.skaters[0].z, moved.adjusted.players[0].z);

    parkOffRay(null);
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), null);
    assert.equal(replayLockKind(), "free");
    const lx = world.replayCam.lx;
    const lz = world.replayCam.lz;
    setInjectedKeys(["ArrowRight"]);
    stepSim(dt);
    setInjectedKeys([]);
    const mx = world.replayCam.lx - lx;
    const mz = world.replayCam.lz - lz;
    const right = (mx * basis.rx + mz * basis.rz) / Math.hypot(mx, mz);
    assert.ok(right > 0.9, `arrow right cos ${right}`);
    const still = exportReplayFrame();
    assert.equal(still.adjusted.players[0].x, moved.adjusted.players[0].x);
    assert.equal(still.adjusted.players[0].z, moved.adjusted.players[0].z);
    stepSim(dt);

    const panLx = world.replayCam.lx;
    const panLz = world.replayCam.lz;
    const panPuck = exportReplayFrame().adjusted.puck.x;
    const panPlayer = exportReplayFrame().adjusted.players[0].x;
    setInjectedKeys(["KeyW", "KeyA", "KeyS", "KeyD"]);
    stepSim(dt);
    setInjectedKeys([]);
    assert.equal(world.replayCam.lx, panLx);
    assert.equal(world.replayCam.lz, panLz);
    assert.equal(exportReplayFrame().adjusted.puck.x, panPuck);
    assert.equal(exportReplayFrame().adjusted.players[0].x, panPlayer);

    assert.equal(toggleReplayFrameLock(), false);
    assert.equal(replayFrameLocked(), false);
    assert.equal(exportReplayFrame(), null);
    assert.equal(world.skaters[0].x, before.original.players[0].x);
    assert.equal(world.skaters[0].z, before.original.players[0].z);
    assert.equal(world.puck.x, before.original.puck.x);
  } finally {
    setInjectedKeys([]);
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("a locked frame picks a player the normal replay radius misses", () => {
  bootReplay();
  try {
    const cam = world.replayCam;
    const dist = 0.55;
    parkOffRay(world.skaters[0]);
    const skater = world.skaters[0];
    assert.ok(skater.radius < dist);
    skater.x = cam.lx + Math.sin(cam.theta) * dist;
    skater.z = cam.lz - Math.cos(cam.theta) * dist;
    skater.comX = skater.x;
    skater.comZ = skater.z;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayLockKind(), "free");
    skater.x = cam.lx + Math.sin(cam.theta) * dist;
    skater.z = cam.lz - Math.cos(cam.theta) * dist;
    skater.comX = skater.x;
    skater.comZ = skater.z;

    assert.equal(toggleReplayFrameLock(), true);
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), 0);
    assert.equal(replayLockKind(), "skater");
  } finally {
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("moving a locked carrier keeps the puck on that player in the export", () => {
  bootReplay();
  stopPauseReplay();
  const carrier = world.skaters[0];
  world.puck.owner = carrier.id;
  world.puck.x = carrier.x;
  world.puck.z = carrier.z;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  useGame.getState().setPaused(false);
  setInjectedKeys([]);
  for (let i = 0; i < 5; i++) stepSim(1 / 60);
  useGame.getState().setPaused(true);
  try {
    assert.equal(world.puck.owner, carrier.id);
    if (!beginPauseReplay()) throw new Error("replay did not start");
    assert.equal(toggleReplayFrameLock(), true);
    const before = exportReplayFrame();
    assert.equal(before.original.puck.owner, carrier.id);
    const index = before.original.players.findIndex((p) => p.id === carrier.id);
    assert.ok(index >= 0);
    parkOffRay(world.skaters[index]);
    const skater = world.skaters[index];
    skater.x = world.replayCam.lx;
    skater.z = world.replayCam.lz;
    skater.comX = skater.x;
    skater.comZ = skater.z;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), index);
    world.camFx = 1;
    world.camFz = 0;
    world.camRx = 0;
    world.camRz = 1;
    setInjectedKeys(["ArrowUp"]);
    stepSim(1 / 60);
    setInjectedKeys([]);
    const after = exportReplayFrame();
    const playerDx = after.adjusted.players[index].x - after.original.players[index].x;
    const puckDx = after.adjusted.puck.x - after.original.puck.x;
    assert.ok(playerDx > 0);
    assert.ok(Math.abs(playerDx - puckDx) < 1e-9);
    assert.equal(after.adjusted.puck.z, after.original.puck.z);
    assert.equal(after.original.puck.x, before.original.puck.x);
  } finally {
    setInjectedKeys([]);
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("a locked frame ignores rewind and an arrow keeps the ice X off a nearby body", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    assert.equal(toggleReplayFrameLock(), true);
    const t0 = world.replayT;
    rewindPauseReplay();
    assert.equal(world.replayT, t0);

    world.camFx = 1;
    world.camFz = 0;
    world.camRx = 0;
    world.camRz = 1;
    for (const s of world.skaters) {
      s.x = 100;
      s.z = 100;
      s.comX = 100;
      s.comZ = 100;
    }
    world.puck.x = 80;
    world.puck.z = 80;
    world.skaters[0].comX = world.replayCam.lx;
    world.skaters[0].comZ = world.replayCam.lz;
    setInjectedKeys(["KeyW"]);
    stepSim(dt);
    setInjectedKeys(["ArrowRight"]);
    const lx = world.replayCam.lx;
    const lz = world.replayCam.lz;
    stepSim(dt);
    assert.ok(Math.abs(world.replayCam.lx - lx) < 1e-9);
    assert.ok(Math.abs(world.replayCam.lz - (lz + iceXStep(dt))) < 1e-9);
    assert.ok(Math.abs(world.replayCam.lx - 100) > 1);
    assert.equal(replayEditSkater(), null);
    assert.equal(world.replayT, t0);
  } finally {
    setInjectedKeys([]);
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("a resting stick does not move the ice X after the frame is locked", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    assert.equal(toggleReplayFrameLock(), true);
    const lx = world.replayCam.lx;
    const lz = world.replayCam.lz;
    const px = world.skaters[0].x;
    pads = stickPad(0.15, -0.12);
    for (let i = 0; i < 30; i++) stepSim(dt);
    assert.equal(world.replayCam.lx, lx);
    assert.equal(world.replayCam.lz, lz);
    assert.equal(world.skaters[0].x, px);
    assert.equal(exportReplayFrame().original.players[0].x, exportReplayFrame().adjusted.players[0].x);
  } finally {
    pads = [];
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("the left stick moves a locked player or the ice X like the arrow keys", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    assert.equal(toggleReplayFrameLock(), true);
    world.camFx = 1;
    world.camFz = 0;
    world.camRx = 0;
    world.camRz = 1;
    const before = exportReplayFrame();
    const lx = world.replayCam.lx;
    const lz = world.replayCam.lz;
    pads = stickPad(0, -1);
    stepSim(dt);
    pads = [];
    assert.ok(Math.abs(world.replayCam.lx - (lx + iceXStep(dt))) < 1e-9);
    assert.ok(Math.abs(world.replayCam.lz - lz) < 1e-9);
    assert.equal(exportReplayFrame().original.players[0].x, before.original.players[0].x);

    const lx2 = world.replayCam.lx;
    pads = stickPad(0, -0.5);
    stepSim(dt);
    pads = [];
    const partial = world.replayCam.lx - lx2;
    assert.ok(partial > 0);
    assert.ok(partial < iceXStep(dt) - 1e-4);

    parkOffRay(world.skaters[0]);
    const skater = world.skaters[0];
    skater.x = world.replayCam.lx;
    skater.z = world.replayCam.lz;
    skater.comX = skater.x;
    skater.comZ = skater.z;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), 0);
    const origin = exportReplayFrame();
    pads = stickPad(1, 0);
    stepSim(dt);
    pads = [];
    const moved = exportReplayFrame();
    const dx = moved.adjusted.players[0].x - origin.adjusted.players[0].x;
    const dz = moved.adjusted.players[0].z - origin.adjusted.players[0].z;
    assert.ok(Math.abs(dx) < 1e-9);
    assert.ok(Math.abs(dz - 4 * dt) < 1e-9);
    assert.equal(moved.original.players[0].z, before.original.players[0].z);
    assert.equal(world.skaters[0].z, moved.adjusted.players[0].z);

    const phi = world.replayCam.phi;
    const theta = world.replayCam.theta;
    const heldX = world.skaters[0].x;
    const heldZ = world.skaters[0].z;
    setInjectedKeys(["KeyQ"]);
    pads = stickPad(1, 0);
    stepSim(dt);
    assert.equal(world.skaters[0].x, heldX);
    assert.equal(world.skaters[0].z, heldZ);
    assert.equal(world.replayCam.phi, phi);
    assert.ok(world.replayCam.theta > theta);
  } finally {
    pads = [];
    setInjectedKeys([]);
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

function faceDot(yaw, x, z) {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return fx * x + fz * z;
}

test("holding A aims the selected player with the left stick and leaves arrows as a slide", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    assert.equal(toggleReplayFrameLock(), true);
    world.camFx = 1;
    world.camFz = 0;
    world.camRx = 0;
    world.camRz = 1;
    parkOffRay(world.skaters[0]);
    const skater = world.skaters[0];
    skater.x = world.replayCam.lx;
    skater.z = world.replayCam.lz;
    skater.comX = skater.x;
    skater.comZ = skater.z;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), 0);
    const before = exportReplayFrame();
    const yaw0 = before.original.players[0].yaw;
    const x0 = before.adjusted.players[0].x;
    const z0 = before.adjusted.players[0].z;

    pads = stickPad(0, -1, true);
    stepSim(dt);
    pads = [];
    const aimed = exportReplayFrame();
    assert.ok(Math.abs(aimed.adjusted.players[0].x - x0) < 1e-9);
    assert.ok(Math.abs(aimed.adjusted.players[0].z - z0) < 1e-9);
    assert.ok(faceDot(skater.yaw, 1, 0) > 0.99, `stick up yaw ${skater.yaw}`);
    assert.equal(aimed.original.players[0].yaw, yaw0);
    assert.equal(aimed.adjusted.players[0].yaw, skater.yaw);
    assert.equal(aimed.original.players[0].x, before.original.players[0].x);

    pads = stickPad(1, 0, true);
    stepSim(dt);
    pads = [];
    assert.ok(Math.abs(exportReplayFrame().adjusted.players[0].x - x0) < 1e-9);
    assert.ok(faceDot(skater.yaw, 0, 1) > 0.99, `stick right yaw ${skater.yaw}`);
    assert.equal(exportReplayFrame().original.players[0].yaw, yaw0);

    const yawHeld = skater.yaw;
    pads = stickPad(0, 0, true);
    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    setInjectedKeys([]);
    pads = [];
    assert.ok(Math.abs(skater.x - (x0 + 4 * dt)) < 1e-9);
    assert.equal(skater.yaw, yawHeld);

    const x1 = skater.x;
    pads = stickPad(0, -1);
    stepSim(dt);
    pads = [];
    assert.ok(skater.x > x1);
    assert.equal(skater.yaw, yawHeld);

    for (const s of world.skaters) {
      s.x = 100;
      s.z = 100;
      s.comX = 100;
      s.comZ = 100;
    }
    world.puck.x = 80;
    world.puck.z = 80;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), null);
    const lx = world.replayCam.lx;
    const lz = world.replayCam.lz;
    pads = stickPad(0, -1, true);
    stepSim(dt);
    pads = [];
    assert.ok(Math.abs(world.replayCam.lx - (lx + iceXStep(dt))) < 1e-9);
    assert.ok(Math.abs(world.replayCam.lz - lz) < 1e-9);

    assert.equal(toggleReplayFrameLock(), false);
    assert.ok(Math.abs(world.skaters[0].yaw - yaw0) < 1e-9);
  } finally {
    pads = [];
    setInjectedKeys([]);
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("undo and redo restore a locked player's yaw and slide", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    assert.equal(toggleReplayFrameLock(), true);
    world.camFx = 1;
    world.camFz = 0;
    world.camRx = 0;
    world.camRz = 1;
    parkOffRay(world.skaters[0]);
    const skater = world.skaters[0];
    skater.x = world.replayCam.lx;
    skater.z = world.replayCam.lz;
    skater.comX = skater.x;
    skater.comZ = skater.z;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), 0);
    const start = exportReplayFrame();
    const yaw0 = start.adjusted.players[0].yaw;
    const x0 = start.adjusted.players[0].x;
    const z0 = start.adjusted.players[0].z;
    const turnRight = faceDot(yaw0, 1, 0) > 0.99;
    const release = () => {
      pads = [];
      setInjectedKeys([]);
      stepSim(dt);
    };

    pads = turnRight ? stickPad(1, 0, true) : stickPad(0, -1, true);
    stepSim(dt);
    release();
    const turned = exportReplayFrame();
    const yaw1 = turned.adjusted.players[0].yaw;
    assert.ok(faceDot(skater.yaw, turnRight ? 0 : 1, turnRight ? 1 : 0) > 0.99);
    assert.equal(turned.adjusted.players[0].x, x0);
    assert.equal(turned.adjusted.players[0].z, z0);
    assert.equal(turned.original.players[0].yaw, start.original.players[0].yaw);
    assert.equal(replayUndoDepth(), 1);

    undoReplayEdit();
    assert.equal(exportReplayFrame().adjusted.players[0].yaw, yaw0);
    assert.equal(skater.yaw, yaw0);
    assert.equal(exportReplayFrame().adjusted.players[0].x, x0);
    assert.equal(replayRedoDepth(), 1);
    redoReplayEdit();
    assert.equal(exportReplayFrame().adjusted.players[0].yaw, yaw1);
    assert.equal(skater.yaw, yaw1);
    assert.equal(replayUndoDepth(), 1);
    assert.equal(replayRedoDepth(), 0);

    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    release();
    const slidX = x0 + 4 * dt;
    assert.ok(Math.abs(exportReplayFrame().adjusted.players[0].x - slidX) < 1e-9);
    assert.equal(exportReplayFrame().adjusted.players[0].yaw, yaw1);
    assert.equal(replayUndoDepth(), 1);
    undoReplayEdit();
    assert.equal(exportReplayFrame().adjusted.players[0].x, x0);
    assert.equal(exportReplayFrame().adjusted.players[0].yaw, yaw0);
    assert.equal(skater.yaw, yaw0);
    redoReplayEdit();
    assert.ok(Math.abs(exportReplayFrame().adjusted.players[0].x - slidX) < 1e-9);
    assert.equal(exportReplayFrame().adjusted.players[0].yaw, yaw1);
    assert.equal(skater.yaw, yaw1);

    const other = world.skaters[1];
    const otherX = exportReplayFrame().adjusted.players[1].x;
    const otherZ = exportReplayFrame().adjusted.players[1].z;
    for (const s of world.skaters) {
      s.x = 50;
      s.z = 50;
      s.comX = 50;
      s.comZ = 50;
    }
    world.puck.x = 70;
    world.puck.z = 70;
    other.x = world.replayCam.lx;
    other.z = world.replayCam.lz;
    other.comX = other.x;
    other.comZ = other.z;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), 1);
    pads = stickPad(1, 0);
    stepSim(dt);
    release();
    assert.ok(Math.abs(exportReplayFrame().adjusted.players[1].z - (otherZ + 4 * dt)) < 1e-9);
    assert.equal(exportReplayFrame().adjusted.players[0].yaw, yaw1);
    assert.equal(replayUndoDepth(), 2);
    undoReplayEdit();
    assert.equal(exportReplayFrame().adjusted.players[1].x, otherX);
    assert.equal(exportReplayFrame().adjusted.players[1].z, otherZ);
    assert.equal(exportReplayFrame().adjusted.players[0].yaw, yaw1);
    assert.ok(Math.abs(exportReplayFrame().adjusted.players[0].x - slidX) < 1e-9);
    undoReplayEdit();
    assert.equal(exportReplayFrame().adjusted.players[0].yaw, yaw0);
    assert.equal(exportReplayFrame().adjusted.players[0].x, x0);
    redoReplayEdit();
    assert.equal(exportReplayFrame().adjusted.players[0].yaw, yaw1);
    assert.ok(Math.abs(exportReplayFrame().adjusted.players[0].x - slidX) < 1e-9);
    redoReplayEdit();
    assert.ok(Math.abs(exportReplayFrame().adjusted.players[1].z - (otherZ + 4 * dt)) < 1e-9);
    assert.equal(exportReplayFrame().original.players[0].yaw, start.original.players[0].yaw);
  } finally {
    pads = [];
    setInjectedKeys([]);
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("a locked frame keeps the goalie stance, moves the puck, eases keyboard yaw, and locks the driven X", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    assert.equal(toggleReplayFrameLock(), true);
    world.camFx = 1;
    world.camFz = 0;
    world.camRx = 0;
    world.camRz = 1;
    const goalie = world.skaters.find((s) => s.kind === "goalie");
    assert.ok(goalie);
    const goalieIndex = world.skaters.indexOf(goalie);
    const stance = goalieZKind(goalie);
    const pose = inferNamedPose(goalie, goalieIndex);
    const puckX = world.puck.x;
    const puckZ = world.puck.z;
    world.puck.x = puckX + 40;
    world.puck.z = puckZ + 20;
    assert.equal(goalieZKind(goalie), stance);
    assert.equal(inferNamedPose(goalie, goalieIndex), pose);
    world.puck.x = puckX;
    world.puck.z = puckZ;

    for (const s of world.skaters) {
      s.x = 40;
      s.z = 40;
      s.comX = 40;
      s.comZ = 40;
    }
    world.puck.x = world.replayCam.lx;
    world.puck.z = world.replayCam.lz;
    world.puck.y = world.replayCam.ly;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), null);
    const before = exportReplayFrame();
    const wasdLx = world.replayCam.lx;
    const wasdLz = world.replayCam.lz;
    setInjectedKeys(["KeyW", "KeyA", "KeyS", "KeyD"]);
    stepSim(dt);
    setInjectedKeys([]);
    assert.equal(exportReplayFrame().adjusted.puck.x, before.adjusted.puck.x);
    assert.equal(exportReplayFrame().adjusted.puck.z, before.adjusted.puck.z);
    assert.equal(world.replayCam.lx, wasdLx);
    assert.equal(world.replayCam.lz, wasdLz);
    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    setInjectedKeys([]);
    const moved = exportReplayFrame();
    assert.ok(Math.abs(moved.adjusted.puck.x - (before.adjusted.puck.x + 4 * dt)) < 1e-9);
    assert.equal(moved.adjusted.puck.z, before.adjusted.puck.z);
    assert.equal(moved.original.puck.x, before.original.puck.x);
    assert.equal(moved.adjusted.players[0].x, before.adjusted.players[0].x);
    assert.equal(goalieZKind(goalie), stance);
    undoReplayEdit();
    assert.equal(exportReplayFrame().adjusted.puck.x, before.adjusted.puck.x);

    parkOffRay(world.skaters[0]);
    const skater = world.skaters[0];
    skater.x = world.replayCam.lx;
    skater.z = world.replayCam.lz;
    skater.comX = skater.x;
    skater.comZ = skater.z;
    world.puck.x = 30;
    world.puck.z = 30;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), 0);
    setInjectedKeys([]);
    stepSim(dt);
    const yawBefore = exportReplayFrame().adjusted.players[0].yaw;
    const wasdX = exportReplayFrame().adjusted.players[0].x;
    const wasdZ = exportReplayFrame().adjusted.players[0].z;
    const wasdMark = world.replayCam.lx;
    setInjectedKeys(["KeyW"]);
    stepSim(dt);
    setInjectedKeys(["KeyA"]);
    stepSim(dt);
    setInjectedKeys([]);
    assert.equal(exportReplayFrame().adjusted.players[0].x, wasdX);
    assert.equal(exportReplayFrame().adjusted.players[0].z, wasdZ);
    assert.equal(exportReplayFrame().adjusted.players[0].yaw, yawBefore);
    assert.equal(world.replayCam.lx, wasdMark);
    pads = stickPad(1, 0, true);
    stepSim(dt);
    pads = [];
    stepSim(dt);
    const yawRight = world.skaters[0].yaw;
    assert.ok(faceDot(yawRight, 0, 1) > 0.99);
    const xHold = exportReplayFrame().adjusted.players[0].x;
    setInjectedKeys(["KeyA", "ArrowUp"]);
    stepSim(dt);
    const yawStep = world.skaters[0].yaw;
    const stepDelta = Math.atan2(Math.sin(yawStep - yawRight), Math.cos(yawStep - yawRight));
    assert.ok(Math.abs(stepDelta) > 0.01 && Math.abs(stepDelta) < 0.2, `yaw step ${stepDelta}`);
    assert.equal(exportReplayFrame().adjusted.players[0].x, xHold);
    for (let i = 0; i < 40; i++) stepSim(dt);
    setInjectedKeys([]);
    stepSim(dt);
    assert.ok(faceDot(world.skaters[0].yaw, 1, 0) > 0.9, `eased yaw ${world.skaters[0].yaw}`);
    undoReplayEdit();
    assert.ok(Math.abs(world.skaters[0].yaw - yawBefore) < 1e-6);

    for (const s of world.skaters) {
      s.x = 70;
      s.z = 70;
      s.comX = 70;
      s.comZ = 70;
    }
    world.puck.x = 65;
    world.puck.z = 65;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), null);
    const spot = exportReplayFrame();
    world.replayCam.lx = spot.adjusted.puck.x - 0.4;
    world.replayCam.lz = spot.adjusted.puck.z;
    stepSim(dt);
    assert.notEqual(replayLockKind(), "puck");
    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    setInjectedKeys([]);
    stepSim(dt);
    assert.equal(replayLockKind(), "puck");
  } finally {
    pads = [];
    setInjectedKeys([]);
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("seekReplay jumps to a fraction of the footage and ignores a locked frame", () => {
  bootReplay();
  try {
    const end = world.replayT;
    assert.ok(end > 0);
    seekReplay(0);
    assert.equal(world.replayT, 0);
    assert.equal(world.replayPlaying, false);
    assert.equal(replayFootagePct(), 0);
    seekReplay(1);
    assert.ok(Math.abs(world.replayT - end) < 1e-9);
    seekReplay(0.5);
    assert.ok(Math.abs(world.replayT - end * 0.5) < 1e-9);
    seekReplay(-2);
    assert.equal(world.replayT, 0);
    seekReplay(4);
    assert.ok(Math.abs(world.replayT - end) < 1e-9);
    const i = Math.floor(world.replayT * 60 + 1e-6);
    assert.ok(i >= 0);
    if (!toggleReplayFrameLock()) throw new Error("frame did not lock");
    const held = world.replayT;
    seekReplay(0);
    assert.equal(world.replayT, held);
  } finally {
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("undo and redo step one formation move at a time", () => {
  const dt = 1 / 60;
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setHomeLineup({ g: 1, d: 2, o: 2 });
  ui.setAwayLineup({ g: 1, d: 2, o: 2 });
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.vx = 2;
  setInjectedKeys([]);
  pads = [];
  for (let i = 0; i < 20; i++) stepSim(dt);
  ui.setPaused(true);
  try {
    if (!beginPauseReplay()) throw new Error("replay did not start");
    world.replayPlaying = false;
    if (!toggleReplayFrameLock()) throw new Error("frame did not lock");
    world.camFx = 1;
    world.camFz = 0;
    world.camRx = 0;
    world.camRz = 1;
    const base = exportReplayFrame();
    const start = base.adjusted.players.map((p) => p.x);
    assert.ok(start.length >= 4);

    const gesture = (index) => {
      for (const s of world.skaters) {
        s.x = 50;
        s.z = 50;
        s.comX = 50;
        s.comZ = 50;
      }
      world.puck.x = 70;
      world.puck.z = 70;
      world.puck.y = 0.04;
      const s = world.skaters[index];
      s.x = world.replayCam.lx;
      s.z = world.replayCam.lz;
      s.comX = s.x;
      s.comZ = s.z;
      pickReplayLock(0, 0, 16 / 9);
      assert.equal(replayEditSkater(), index);
      setInjectedKeys(["ArrowUp"]);
      stepSim(dt);
      stepSim(dt);
      stepSim(dt);
      setInjectedKeys([]);
      stepSim(dt);
    };
    for (let i = 0; i < 4; i++) gesture(i);
    const moved = exportReplayFrame();
    for (let i = 0; i < 4; i++) {
      assert.ok(moved.adjusted.players[i].x - start[i] > 0.15);
      assert.equal(moved.original.players[i].x, base.original.players[i].x);
    }
    assert.equal(replayUndoDepth(), 4);
    undoReplayEdit();
    undoReplayEdit();
    const half = exportReplayFrame();
    assert.equal(half.adjusted.players[0].x, moved.adjusted.players[0].x);
    assert.equal(half.adjusted.players[1].x, moved.adjusted.players[1].x);
    assert.equal(half.adjusted.players[2].x, start[2]);
    assert.equal(half.adjusted.players[3].x, start[3]);
    assert.equal(half.original.players[0].x, base.original.players[0].x);
    assert.equal(replayRedoDepth(), 2);
    redoReplayEdit();
    assert.equal(exportReplayFrame().adjusted.players[2].x, moved.adjusted.players[2].x);
    assert.equal(exportReplayFrame().adjusted.players[3].x, start[3]);

    pads = stickPad(0, -1);
    setInjectedKeys([]);
    for (const s of world.skaters) {
      s.x = 50;
      s.z = 50;
      s.comX = 50;
      s.comZ = 50;
    }
    world.skaters[0].x = world.replayCam.lx;
    world.skaters[0].z = world.replayCam.lz;
    world.skaters[0].comX = world.skaters[0].x;
    world.skaters[0].comZ = world.skaters[0].z;
    pickReplayLock(0, 0, 16 / 9);
    const beforeStick = exportReplayFrame().adjusted.players[0].x;
    stepSim(dt);
    stepSim(dt);
    pads = [];
    stepSim(dt);
    assert.ok(exportReplayFrame().adjusted.players[0].x > beforeStick);
    undoReplayEdit();
    assert.equal(exportReplayFrame().adjusted.players[0].x, beforeStick);

    for (const s of world.skaters) {
      s.x = 80;
      s.z = 80;
      s.comX = 80;
      s.comZ = 80;
    }
    world.puck.x = 80;
    world.puck.z = 80;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), null);
    const lx = world.replayCam.lx;
    const lz = world.replayCam.lz;
    setInjectedKeys(["ArrowRight"]);
    stepSim(dt);
    setInjectedKeys([]);
    stepSim(dt);
    assert.ok(Math.abs(world.replayCam.lz - (lz + iceXStep(dt))) < 1e-9);
    undoReplayEdit();
    assert.ok(Math.abs(world.replayCam.lx - lx) < 1e-9);
    assert.ok(Math.abs(world.replayCam.lz - lz) < 1e-9);
    assert.equal(exportReplayFrame().original.players[0].x, base.original.players[0].x);
  } finally {
    pads = [];
    setInjectedKeys([]);
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("consecutive moves on one player are a single undo", () => {
  const dt = 1 / 60;
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setHomeLineup({ g: 1, d: 2, o: 2 });
  ui.setAwayLineup({ g: 1, d: 2, o: 2 });
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.vx = 2;
  setInjectedKeys([]);
  pads = [];
  for (let i = 0; i < 20; i++) stepSim(dt);
  ui.setPaused(true);
  try {
    if (!beginPauseReplay()) throw new Error("replay did not start");
    world.replayPlaying = false;
    if (!toggleReplayFrameLock()) throw new Error("frame did not lock");
    world.camFx = 1;
    world.camFz = 0;
    world.camRx = 0;
    world.camRz = 1;
    const start = exportReplayFrame().original.players.map((p) => p.x);
    const select = (index) => {
      for (const s of world.skaters) {
        s.x = 50;
        s.z = 50;
        s.comX = 50;
        s.comZ = 50;
      }
      world.puck.x = 70;
      world.puck.z = 70;
      world.puck.y = 0.04;
      const s = world.skaters[index];
      s.x = world.replayCam.lx;
      s.z = world.replayCam.lz;
      s.comX = s.x;
      s.comZ = s.z;
      pickReplayLock(0, 0, 16 / 9);
      assert.equal(replayEditSkater(), index);
    };
    const nudge = () => {
      setInjectedKeys(["ArrowUp"]);
      stepSim(dt);
      setInjectedKeys([]);
      stepSim(dt);
    };
    select(0);
    nudge();
    nudge();
    const afterA = exportReplayFrame().adjusted.players[0].x;
    assert.ok(afterA - start[0] > 4 * dt);
    select(1);
    nudge();
    select(2);
    nudge();
    assert.equal(replayUndoDepth(), 3);
    undoReplayEdit();
    let now = exportReplayFrame();
    assert.equal(now.adjusted.players[2].x, start[2]);
    assert.equal(now.adjusted.players[0].x, afterA);
    assert.equal(now.adjusted.players[1].x > start[1], true);
    undoReplayEdit();
    now = exportReplayFrame();
    assert.equal(now.adjusted.players[1].x, start[1]);
    assert.equal(now.adjusted.players[0].x, afterA);
    undoReplayEdit();
    assert.equal(exportReplayFrame().adjusted.players[0].x, start[0]);
    assert.equal(exportReplayFrame().original.players[0].x, start[0]);
    redoReplayEdit();
    assert.equal(exportReplayFrame().adjusted.players[0].x, afterA);
    assert.equal(exportReplayFrame().adjusted.players[1].x, start[1]);

    for (const s of world.skaters) {
      s.x = 80;
      s.z = 80;
      s.comX = 80;
      s.comZ = 80;
    }
    world.puck.x = 80;
    world.puck.z = 80;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayEditSkater(), null);
    const lz = world.replayCam.lz;
    setInjectedKeys(["ArrowRight"]);
    stepSim(dt);
    setInjectedKeys([]);
    stepSim(dt);
    setInjectedKeys(["ArrowRight"]);
    stepSim(dt);
    setInjectedKeys([]);
    stepSim(dt);
    assert.equal(replayUndoDepth(), 2);
    undoReplayEdit();
    assert.ok(Math.abs(world.replayCam.lz - lz) < 1e-9);
  } finally {
    pads = [];
    setInjectedKeys([]);
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("a stationary ice X stays put when a skater or the puck crosses it", () => {
  const dt = 1 / 60;
  const ui = useGame.getState();
  ui.setClockMode("practice");
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  ui.setPlaying(true);
  ui.setPaused(false);
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  setInjectedKeys([]);
  pads = [];
  const pin = (px) => {
    world.puck.x = px;
    world.puck.z = 0;
    world.puck.y = 0.04;
    world.puck.vx = 0;
    world.puck.vz = 0;
    world.puck.vy = 0;
    world.puck.owner = null;
    world.skaters.forEach((s, i) => {
      s.x = -22;
      s.z = (i - 5) * 3;
      s.vx = 0;
      s.vz = 0;
      s.comX = s.x;
      s.comZ = s.z;
    });
  };
  for (let i = 0; i < 16; i++) {
    pin(0);
    stepSim(dt);
  }
  for (let i = 0; i < 16; i++) {
    pin(6);
    stepSim(dt);
  }
  ui.setPaused(true);
  try {
    if (!beginPauseReplay()) throw new Error("replay did not start");
    world.replayPlaying = false;
    seekReplay(0);
    const earlyPuck = Math.hypot(world.puck.x, world.puck.z);
    seekReplay(1);
    const late = { x: world.puck.x, z: world.puck.z };
    assert.ok(Math.hypot(late.x, late.z) - earlyPuck > 2, `puck moved ${earlyPuck} to ${late.x}`);
    seekReplay(0);
    for (const s of world.skaters) {
      s.comX = -22;
      s.comZ = 0;
    }
    assert.equal(replayLockKind(), "free");
    assert.ok(Math.hypot(world.replayCam.lx - world.puck.x, world.replayCam.lz - world.puck.z) < 0.05);
    assert.ok(Math.hypot(world.puck.x - late.x, world.puck.z - late.z) > 2);
    let guard = 0;
    while (Math.hypot(world.replayCam.lx - late.x, world.replayCam.lz - late.z) > 0.15 && guard++ < 90) {
      const dx = late.x - world.replayCam.lx;
      const dz = late.z - world.replayCam.lz;
      const keys = [];
      if (Math.abs(dx) >= Math.abs(dz)) keys.push(dx > 0 ? "ArrowUp" : "ArrowDown");
      else keys.push(dz > 0 ? "ArrowRight" : "ArrowLeft");
      setInjectedKeys(keys);
      stepSim(dt);
    }
    setInjectedKeys([]);
    stepSim(dt);
    const lx = world.replayCam.lx;
    const lz = world.replayCam.lz;
    assert.equal(replayLockKind(), "free");
    assert.ok(Math.hypot(lx - late.x, lz - late.z) < 0.45, `released at ${lx}, later puck ${late.x}`);
    const skater = world.skaters[0];
    skater.comX = lx;
    skater.comZ = lz;
    stepSim(dt);
    assert.equal(replayLockKind(), "free");
    assert.equal(world.replayCam.lx, lx);
    assert.equal(world.replayCam.lz, lz);
    skater.comX = -22;
    skater.comZ = 0;
    seekReplay(1);
    assert.ok(Math.hypot(world.puck.x - lx, world.puck.z - lz) < 0.45, "later puck should cross the X");
    assert.equal(replayLockKind(), "free");
    assert.equal(world.replayCam.lx, lx);
    assert.equal(world.replayCam.lz, lz);
  } finally {
    setInjectedKeys([]);
    stopPauseReplay();
  }
});

test("a locked frame slides the ice X with the camera zoom", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    assert.equal(toggleReplayFrameLock(), true);
    world.camFx = 1;
    world.camFz = 0;
    world.camRx = 0;
    world.camRz = 1;
    for (const s of world.skaters) {
      s.x = 80;
      s.z = 80;
      s.comX = 80;
      s.comZ = 80;
    }
    world.puck.x = 70;
    world.puck.z = 70;
    world.replayCam.radius = 10;
    const near = world.replayCam.lx;
    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    setInjectedKeys([]);
    assert.ok(Math.abs(world.replayCam.lx - (near + 9 * dt)) < 1e-9);
    world.replayCam.radius = 30;
    const far = world.replayCam.lx;
    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    setInjectedKeys([]);
    assert.ok(Math.abs(world.replayCam.lx - (far + 27 * dt)) < 1e-9);
  } finally {
    setInjectedKeys([]);
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

test("driving the X onto a player selects that player for the next slide", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    assert.equal(toggleReplayFrameLock(), true);
    world.camFx = 1;
    world.camFz = 0;
    world.camRx = 0;
    world.camRz = 1;
    world.replayCam.radius = 14;
    for (const s of world.skaters) {
      s.x = 80;
      s.z = 80;
      s.comX = 80;
      s.comZ = 80;
    }
    world.puck.x = 70;
    world.puck.z = 70;
    const skater = world.skaters[0];
    skater.x = world.replayCam.lx + 0.4;
    skater.z = world.replayCam.lz;
    skater.comX = skater.x;
    skater.comZ = skater.z;
    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    setInjectedKeys([]);
    stepSim(dt);
    assert.equal(replayLockKind(), "skater");
    assert.equal(replayEditSkater(), 0);
    const x0 = exportReplayFrame().adjusted.players[0].x;
    const mark = world.replayCam.lx;
    setInjectedKeys(["ArrowUp"]);
    stepSim(dt);
    setInjectedKeys([]);
    const moved = exportReplayFrame();
    assert.ok(Math.abs(moved.adjusted.players[0].x - (x0 + 4 * dt)) < 1e-9);
    assert.ok(Math.abs(world.replayCam.lx - (mark + 4 * dt)) < 1e-6);
    assert.equal(moved.adjusted.players[1].x, moved.original.players[1].x);
  } finally {
    setInjectedKeys([]);
    pads = [];
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
  }
});

function buttonPad(index, axes = [0, 0, 0, 0]) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  buttons[index] = { pressed: true, touched: true, value: 1 };
  return [
    {
      id: "test-standard",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: 0,
      axes,
      buttons,
    },
  ];
}

test("a background window does not take gamepad zoom, pan, or rotate", () => {
  bootReplay();
  const dt = 1 / 60;
  const previous = globalThis.document;
  try {
    world.camFx = 1;
    world.camFz = 0;
    world.camRx = 0;
    world.camRz = 1;
    globalThis.document = { hasFocus: () => true };
    pads = buttonPad(3);
    stepSim(dt);
    assert.equal(replayLockKind(), "free");
    const radius = world.replayCam.radius;
    const lx = world.replayCam.lx;
    const theta = world.replayCam.theta;
    const phi = world.replayCam.phi;
    globalThis.document = { hasFocus: () => false };
    pads = [];
    stepSim(dt);
    assert.equal(replayLockKind(), "free");
    pads = stickPad(0, -1);
    stepSim(dt);
    pads = buttonPad(2);
    stepSim(dt);
    pads = buttonPad(3, [1, 0, 0, 0]);
    stepSim(dt);
    assert.equal(world.replayCam.radius, radius);
    assert.equal(world.replayCam.lx, lx);
    assert.equal(world.replayCam.theta, theta);
    assert.equal(world.replayCam.phi, phi);
    assert.equal(replayLockKind(), "free");
    globalThis.document = { hasFocus: () => true };
    pads = stickPad(0, -1);
    stepSim(dt);
    assert.ok(world.replayCam.lx > lx);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    pads = [];
    setInjectedKeys([]);
    stopPauseReplay();
  }
});

test("pause replay score, clock, and shots follow the frame on screen", () => {
  const dt = 1 / 60;
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setGameSpeed(1);
  ui.setGameMinutes(1);
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setInstantReplay(false);
  resetWorld();
  ui.setPlaying(true);
  ui.setPaused(false);
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.periodEndT = 0;
  world.periodOver = false;
  ui.setHomeScore(1);
  ui.setAwayScore(0);
  ui.resetTeamShots();
  ui.noteTeamShot("home", "attempts");
  ui.setPeriod(1);
  ui.setPeriodClock(800);
  world.period = 1;
  world.periodClock = 800;
  for (const s of world.skaters) {
    s.stun = 99;
    s.vx = 0;
    s.vz = 0;
    s.x = s.side === "home" ? -24 : 24;
    s.z = (s.id % 7) * 2;
  }
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.z = 0;
  world.puck.y = 0.05;
  world.puck.vx = 3;
  world.puck.vz = 0;
  world.puck.vy = 0;
  setInjectedKeys([]);
  pads = [];
  for (let i = 0; i < 90; i++) stepSim(dt);
  ui.setHomeScore(4);
  ui.noteTeamShot("away", "onGoal");
  ui.noteTeamShot("away", "attempts");
  for (let i = 0; i < 30; i++) stepSim(dt);
  const live = useGame.getState();
  const liveClock = live.periodClock;
  assert.equal(live.homeScore, 4);
  pauseGame();
  try {
    assert.equal(beginPauseReplay(), true);
    const endBoard = replayBoardNow();
    assert.ok(endBoard);
    assert.equal(endBoard.homeScore, 4);
    assert.equal(endBoard.awayScore, 0);
    assert.equal(endBoard.periodClock, liveClock);
    assert.equal(endBoard.homeAttempts, 1);
    assert.equal(endBoard.awayOnGoal, 1);
    assert.equal(endBoard.awayAttempts, 1);
    seekReplay(0);
    const startBoard = replayBoardNow();
    assert.ok(startBoard);
    assert.equal(startBoard.homeScore, 1);
    assert.equal(startBoard.awayOnGoal, 0);
    assert.equal(startBoard.awayAttempts, 0);
    assert.ok(startBoard.periodClock > endBoard.periodClock, `${startBoard.periodClock} vs ${endBoard.periodClock}`);
    assert.equal(useGame.getState().homeScore, 4);
    assert.equal(useGame.getState().periodClock, liveClock);
    assert.equal(useGame.getState().teamShots.away.onGoal, 1);
  } finally {
    stopPauseReplay();
    assert.equal(replayBoardNow(), null);
    assert.equal(useGame.getState().homeScore, 4);
    setInjectedKeys([]);
    pads = [];
  }
});

test("in-game transport buttons shuttle and restart like the replay viewer", () => {
  bootReplay();
  const dt = 1 / 60;
  try {
    world.replayPlaying = false;
    const end = world.replayT;
    assert.ok(end > 0.2, `span ${end}`);
    pressReplayShuttle(-3.4);
    for (let i = 0; i < 4; i++) stepSim(dt);
    assert.ok(Math.abs(world.replayT - Math.max(0, end - 3.4 * dt * 4)) < 1e-6, `rewind ${world.replayT}`);
    assert.equal(world.replayPlaying, false);
    const mid = world.replayT;
    releaseReplayShuttle(-3.4);
    for (let i = 0; i < 6; i++) stepSim(dt);
    assert.ok(Math.abs(world.replayT - mid) < 1e-9);
    pressReplayShuttle(-0.28);
    stepSim(dt);
    releaseReplayShuttle(-0.28);
    assert.ok(world.replayT < mid);
    pressReplayShuttle(0.28);
    const slow = world.replayT;
    stepSim(dt);
    releaseReplayShuttle(0.28);
    assert.ok(Math.abs(world.replayT - (slow + 0.28 * dt)) < 1e-6);
    pressReplayShuttle(3.4);
    const fast = world.replayT;
    stepSim(dt);
    releaseReplayShuttle(3.4);
    assert.ok(Math.abs(world.replayT - Math.min(end, fast + 3.4 * dt)) < 1e-6);
    world.replayT = end;
    world.replayPlaying = false;
    toggleReplayTransport();
    assert.equal(world.replayT, 0);
    assert.equal(world.replayPlaying, true);
    stepSim(dt);
    assert.ok(world.replayT > 0);
    toggleReplayTransport();
    assert.equal(world.replayPlaying, false);
  } finally {
    stopPauseReplay();
    setInjectedKeys([]);
    pads = [];
  }
});
