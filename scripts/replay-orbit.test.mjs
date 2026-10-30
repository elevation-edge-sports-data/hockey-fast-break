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

function stickPad(x, y) {
  const button = { pressed: false, touched: false, value: 0 };
  return [
    {
      id: "test-standard",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: 0,
      axes: [x, y, 0, 0],
      buttons: Array.from({ length: 17 }, () => button),
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
const { orbitReplayPointer, zoomReplayPointer, resetWorld, stepSim, world, beginPauseReplay, stopPauseReplay, pickReplayLock, replayLockKind, toggleReplayFrameLock, replayFrameLocked, replayEditSkater, exportReplayFrame, rewindPauseReplay, undoReplayEdit, redoReplayEdit, replayUndoDepth, replayRedoDepth, seekReplay, replayFootagePct } = sim;
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

test("opening replay stays free while the X sits on the puck", () => {
  bootReplay();
  try {
    for (let i = 0; i < 8; i++) stepSim(1 / 60);
    assert.equal(replayLockKind(), "free");
    assert.ok(Math.hypot(world.replayCam.lx - world.puck.x, world.replayCam.lz - world.puck.z) < 0.05);
  } finally {
    stopPauseReplay();
    setInjectedKeys([]);
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
    world.puck.x = 28;
    world.puck.z = 28;
    pickReplayLock(0, 0, 16 / 9);
    assert.equal(replayLockKind(), "skater");
  } finally {
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

    const panLx = world.replayCam.lx;
    setInjectedKeys(["KeyW"]);
    stepSim(dt);
    setInjectedKeys([]);
    assert.ok(Math.abs(world.replayCam.lx - panLx) > 0.05);

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
    assert.ok(Math.abs(world.replayCam.lz - (lz + 4 * dt)) < 1e-9);
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
    assert.ok(Math.abs(world.replayCam.lx - (lx + 4 * dt)) < 1e-9);
    assert.ok(Math.abs(world.replayCam.lz - lz) < 1e-9);
    assert.equal(exportReplayFrame().original.players[0].x, before.original.players[0].x);

    const lx2 = world.replayCam.lx;
    pads = stickPad(0, -0.5);
    stepSim(dt);
    pads = [];
    const partial = world.replayCam.lx - lx2;
    assert.ok(partial > 0);
    assert.ok(partial < 4 * dt - 1e-4);

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
    assert.ok(Math.abs(world.replayCam.lz - (lz + 4 * dt)) < 1e-9);
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
