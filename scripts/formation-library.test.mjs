/**
 * Formation library reads replay-frame JSON and shows it without entering replay.
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

const lib = await server.ssrLoadModule("/src/game/formationLibrary.ts");
const sim = await server.ssrLoadModule("/src/game/sim.ts");
const {
  parseFormationJson,
  framesFromUnknown,
  entriesFromFile,
  readFormationLibrary,
  writeFormationLibrary,
  formationSkaters,
  mountFormation,
  classicFormationEye,
  formationOrbitFromEye,
} = lib;
const { world } = sim;

const frame = {
  frame: 12,
  time: 0.2,
  original: {
    puck: { x: 1, z: 2, y: 0.04, owner: null },
    players: [
      { index: 0, id: 4, x: -8, z: 1, yaw: 0.2 },
      { index: 1, id: 9, x: 6, z: -2, yaw: 1.1 },
    ],
  },
  adjusted: {
    puck: { x: 3, z: -4, y: 0.2, owner: 0 },
    players: [
      { index: 0, id: 4, x: -2, z: 5, yaw: 0.4 },
      { index: 1, id: 9, x: 7, z: -1, yaw: -0.3 },
    ],
  },
};

test("a saved frame and a range file both parse", () => {
  const one = parseFormationJson(JSON.stringify(frame));
  assert.equal(one.length, 1);
  assert.equal(one[0].adjusted.puck.x, 3);
  assert.equal(one[0].original.players[0].x, -8);

  const range = framesFromUnknown([frame, { ...frame, frame: 13, time: 0.4 }]);
  assert.equal(range.length, 2);
  assert.equal(range[1].frame, 13);

  const noYaw = structuredClone(frame);
  for (const side of [noYaw.original, noYaw.adjusted]) {
    for (const player of side.players) delete player.yaw;
  }
  const older = parseFormationJson(JSON.stringify(noYaw));
  assert.equal(older.length, 1);
  assert.equal(older[0].original.players[0].yaw, 0);
  assert.equal(older[0].adjusted.players[1].x, 7);
  const olderRange = framesFromUnknown([noYaw, { ...noYaw, frame: 14, time: 0.5 }]);
  assert.equal(olderRange.length, 2);

  assert.equal(parseFormationJson("{"), "That file is not JSON.");
  assert.equal(framesFromUnknown({ frame: 1 }), "That file is not a replay frame.");
  assert.equal(framesFromUnknown([]), "That file has no frames.");
  const badYaw = structuredClone(frame);
  badYaw.adjusted.players[0].yaw = "east";
  assert.equal(framesFromUnknown(badYaw), "That file is not a replay frame.");
});

test("a frame opens on the classic angle and an adjusted orbit stays put", () => {
  world.homeAttack = -1;
  const here = { x: -4, y: 0.4, z: 3 };
  const eye = classicFormationEye(here);
  assert.equal(eye.atk, -1);
  assert.equal(eye.y, 9.4);
  assert.equal(eye.z, here.z);
  assert.ok(eye.x > here.x);

  const orbit = formationOrbitFromEye(here, eye);
  const there = { x: 12, y: 0.4, z: -6 };
  const moved = formationOrbitFromEye(there, classicFormationEye(there));
  assert.equal(moved.theta, orbit.theta);
  assert.ok(Math.abs(moved.phi - orbit.phi) < 1e-9);
  assert.ok(Math.abs(moved.radius - orbit.radius) < 1e-9);
  world.homeAttack = -1;
});

test("import stores each frame and the rink shows the adjusted side", () => {
  mem.clear();
  let n = 0;
  const entries = entriesFromFile("replay-0-2.json", JSON.stringify([frame, { ...frame, frame: 20, time: 1 }]), () => `id-${n++}`);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, "replay-0-2.json · 12");
  assert.equal(entries[1].name, "replay-0-2.json · 20");
  assert.equal(writeFormationLibrary(entries), null);
  assert.equal(readFormationLibrary().length, 2);

  const prev = world.skaters;
  const puckX = world.puck.x;
  world.replay = true;
  world.replayKind = "pause";
  world.replayPlaying = false;
  world.replayT = 4;
  const release = mountFormation(entries[0].frame.adjusted);
  assert.equal(world.replay, true);
  assert.equal(world.replayKind, "pause");
  assert.equal(world.replayPlaying, false);
  assert.equal(world.replayT, 4);
  assert.equal(world.skaters.length, 2);
  assert.equal(world.skaters[0].side, "home");
  assert.equal(world.skaters[1].side, "away");
  assert.equal(world.skaters[0].x, -2);
  assert.equal(world.skaters[0].z, 5);
  assert.equal(world.skaters[0].yaw, 0.4);
  assert.equal(world.puck.x, 3);
  assert.equal(world.puck.z, -4);
  assert.equal(world.puck.owner, 0);
  assert.equal(world.puck.vx, 0);
  const stood = formationSkaters(entries[0].frame.adjusted.players);
  assert.equal(stood[0].vx, 0);
  assert.equal(stood[0].windup, 0);
  release();
  assert.equal(world.skaters, prev);
  assert.equal(world.puck.x, puckX);
  assert.equal(world.replay, true);
  assert.equal(world.replayT, 4);
  world.replay = false;
  world.replayKind = null;
});
