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
const { orbitReplayPointer, zoomReplayPointer, resetWorld, stepSim, world, beginPauseReplay, stopPauseReplay, pickReplayLock, replayLockKind } = sim;
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
