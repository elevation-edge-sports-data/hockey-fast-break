/**
 * Default slider is 1.00x and runs the sim at 0.8. A freestyle orbit keeps its
 * zoom and elevation when the period puts that same view on the other end of the rink.
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
const { beginPauseCam, finishPauseCam, mirrorFreeCamEnds, orbitFromOffset, world } = sim;
const { useGame, gameSpeedRate } = store;

function place(theta, phi, radius) {
  const cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 240);
  cam.up.set(0, 1, 0);
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  cam.position.set(radius * sp * Math.sin(theta), 0.55 + radius * cp, radius * sp * Math.cos(theta));
  cam.lookAt(0, 0.55, 0);
  cam.updateMatrixWorld();
  return cam;
}

function ndc(cam, x) {
  const v = new THREE.Vector3(x, 0.55, 0).project(cam);
  return [v.x, v.y];
}

test("default game speed is 1x", () => {
  assert.equal(useGame.getState().gameSpeed, 1);
  assert.equal(useGame.getState().gameSpeed.toFixed(2) + "x", "1.00x");
  assert.equal(gameSpeedRate(useGame.getState().gameSpeed), 0.8);
});

test("a title freestyle orbit round-trips onto the puck", () => {
  const theta = 1.15;
  const phi = 0.86;
  const radius = 18;
  const cam = place(theta, phi, radius);
  const orbit = orbitFromOffset(cam.position.x, cam.position.y - 0.55, cam.position.z, true);
  assert.ok(Math.abs(orbit.theta - theta) < 1e-6);
  assert.ok(Math.abs(orbit.phi - phi) < 1e-6);
  assert.ok(Math.abs(orbit.radius - radius) < 1e-6);
  const again = place(orbit.theta, orbit.phi, orbit.radius);
  assert.ok(again.position.distanceTo(cam.position) < 1e-4);
});

test("pause capture still clamps inside the pause orbit limits", () => {
  const tight = orbitFromOffset(1.2, 0.4, 0.2, false);
  assert.equal(tight.radius, 4.2);
  assert.ok(tight.phi <= 1.45 && tight.phi >= 0.12);
  const loose = orbitFromOffset(6, 3, 2, true);
  assert.ok(Math.abs(loose.radius - 7) < 1e-9);
  assert.ok(Math.abs(loose.phi - Math.acos(3 / 7)) < 1e-9);
});

test("a live freestyle orbit is not recaptured by pause", () => {
  const ui = useGame.getState();
  ui.setCamMode("freestyle");
  ui.setFreeCamLive(true);
  world.freeCam.theta = 1.2;
  world.freeCam.phi = 0.9;
  world.freeCam.radius = 14;
  world.freeCam.captured = true;
  world.pauseDirty = false;
  world.freeCamReapply = false;
  beginPauseCam("freestyle");
  assert.equal(world.freeCam.captured, true);
  assert.equal(world.freeCam.theta, 1.2);
  assert.equal(world.freeCam.phi, 0.9);
  assert.equal(world.freeCam.radius, 14);
  finishPauseCam();
  assert.equal(useGame.getState().camMode, "freestyle");
  assert.equal(useGame.getState().freeCamLive, true);
  assert.equal(world.freeCamReapply, true);
  assert.equal(world.freeCam.theta, 1.2);
  assert.equal(world.freeCam.phi, 0.9);
  assert.equal(world.freeCam.radius, 14);
});

test("pausing classic drops a stale freestyle capture", () => {
  const ui = useGame.getState();
  ui.setCamMode("classic");
  ui.setFreeCamLive(false);
  world.freeCam.captured = true;
  world.pauseDirty = false;
  beginPauseCam("classic");
  assert.equal(world.freeCam.captured, false);
  finishPauseCam();
  assert.equal(useGame.getState().camMode, "classic");
  assert.equal(useGame.getState().freeCamLive, false);
  assert.equal(world.freeCamReapply, false);
});

test("a camera picked while paused replaces the paused mode", () => {
  const ui = useGame.getState();
  ui.setCamMode("classic");
  ui.setFreeCamLive(false);
  world.pauseDirty = true;
  world.camPick = false;
  beginPauseCam("classic");
  ui.setCamMode("chase");
  world.camPick = true;
  finishPauseCam();
  assert.equal(useGame.getState().camMode, "chase");
  assert.equal(useGame.getState().freeCamLive, false);
  assert.equal(world.freeCamReapply, false);
  assert.equal(world.camPick, false);
});

test("switching ends keeps freestyle zoom and elevation from the other side", () => {
  world.freeCam.theta = Math.PI / 2 + 0.4;
  world.freeCam.phi = 0.72;
  world.freeCam.radius = 22;
  const before = place(world.freeCam.theta, world.freeCam.phi, world.freeCam.radius);
  const beforeAtk = ndc(before, -10);
  mirrorFreeCamEnds();
  assert.equal(world.freeCam.phi, 0.72);
  assert.equal(world.freeCam.radius, 22);
  const after = place(world.freeCam.theta, world.freeCam.phi, world.freeCam.radius);
  const afterAtk = ndc(after, 10);
  assert.ok(Math.abs(beforeAtk[0] - afterAtk[0]) < 1e-3, `attack x ${beforeAtk[0]} -> ${afterAtk[0]}`);
  assert.ok(Math.abs(beforeAtk[1] - afterAtk[1]) < 1e-3, `attack y ${beforeAtk[1]} -> ${afterAtk[1]}`);
  assert.ok(after.position.distanceTo(before.position) > 20);
  mirrorFreeCamEnds();
  assert.ok(Math.abs(world.freeCam.theta - (Math.PI / 2 + 0.4)) < 1e-9);
  assert.equal(world.freeCam.phi, 0.72);
  assert.equal(world.freeCam.radius, 22);
});
