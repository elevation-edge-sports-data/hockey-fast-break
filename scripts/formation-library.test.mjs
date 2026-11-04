/**
 * Formation library reads replay-frame JSON and shows it without entering replay.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { dirname, join } from "node:path";
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
  sampleReplay,
  controlledSkaterIndex,
  writeAdjustedPositions,
  formationSideOf,
  partitionFormationLibrary,
  applyReplayPose,
  freshFormHist,
  openFormGesture,
  closeFormGesture,
  undoFormEdit,
  redoFormEdit,
  formYawSnap,
  formYawToward,
  formLocalOffset,
  formWorldOffset,
} = lib;
const mark = await server.ssrLoadModule("/src/game/iceMark.ts");
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

test("a control id is kept when it is numeric and ignored when it is not", () => {
  const withIds = parseFormationJson(JSON.stringify({ ...frame, userId: 1, controlledId: 4 }));
  assert.equal(withIds[0].userId, 1);
  assert.equal(withIds[0].controlledId, 4);
  const bad = parseFormationJson(JSON.stringify({ ...frame, userId: "nope", controlledId: null }));
  assert.equal(bad.length, 1);
  assert.equal(bad[0].userId, undefined);
  assert.equal(bad[0].controlledId, undefined);
  assert.equal("userId" in bad[0], false);
});

test("the controlled slot prefers controlledId, then the recorded index", () => {
  const players = frame.adjusted.players;
  assert.equal(controlledSkaterIndex({ controlledId: 4, userId: 1 }, players), 0);
  assert.equal(controlledSkaterIndex({ userId: 1 }, players), 1);
  assert.equal(controlledSkaterIndex({ userId: 9 }, players), 1);
  assert.equal(controlledSkaterIndex({}, players), -1);
  assert.equal(controlledSkaterIndex({ userId: 50 }, players), -1);
});

test("a fractional cursor lerps positions and takes the short yaw", () => {
  const start = structuredClone(frame);
  start.adjusted.players[0].yaw = 0;
  const next = structuredClone(start);
  next.frame = 13;
  next.adjusted.players[0].x = 2;
  next.adjusted.players[0].z = 1;
  next.adjusted.players[0].yaw = Math.PI * 1.5;
  next.adjusted.puck = { x: 5, z: 0, y: 0.4, owner: 0 };
  const mid = sampleReplay([start, next], 0.5);
  assert.equal(mid.players[0].x, 0);
  assert.equal(mid.players[0].z, 3);
  assert.ok(Math.abs(mid.players[0].yaw - -Math.PI / 4) < 1e-9);
  assert.equal(mid.puck.x, 4);
  assert.ok(Math.abs(mid.puck.y - 0.3) < 1e-9);
  assert.equal(mark.stepReplayFrame(0.2, 1, 4), 1);
  assert.equal(mark.stepReplayFrame(0.2, -1, 4), 0);
  assert.equal(mark.stepReplayFrame(3, -1, 4), 2);
  assert.equal(mark.stepReplayFrame(3, 1, 3), 3);
});

test("the ice X uses the pause-replay zoom speed and the shadow center", () => {
  const simSrc = readFileSync(join(repo, "src/game/sim.ts"), "utf8");
  assert.match(simSrc, /cam\.radius \* 0\.9 \* dt/);
  assert.equal(mark.MARK_SPEED_PER_RADIUS, 0.9);
  assert.equal(mark.markMetersPerSecond(14), 12.6);
  assert.equal(mark.ACCEPT_PLAYER > 0.7, true);
  assert.equal(mark.ACCEPT_PUCK > 0.35, true);
  const step = mark.iceBasisStep(1, 10, 0, 1, { rx: 0, rz: 1, fx: 1, fz: 0 });
  assert.equal(step.dx, 9);
  assert.equal(step.dz, 0);
  const right = mark.iceBasisStep(1, 10, 0.5, 0, { rx: 0, rz: 1, fx: 1, fz: 0 });
  assert.equal(right.dx, 0);
  assert.equal(right.dz, 4.5);
  assert.equal(mark.iceBasisStep(0, 10, 1, 0, { rx: 0, rz: 1, fx: 1, fz: 0 }), null);

  const root = mark.rootForShadow(5, 1, 0.35, -0.2, 0, 0);
  assert.ok(Math.abs(root.x - 4.65) < 1e-9);
  assert.ok(Math.abs(root.z - 1.2) < 1e-9);
  const hit = mark.nearestMark(0.2, 0.1, [{ x: 0, z: 0 }, { x: 3, z: 0 }], { x: 2, z: 2 });
  assert.deepEqual(hit, { kind: "skater", index: 0 });
  assert.equal(mark.nearestMark(3, 3, [{ x: 0, z: 0 }], { x: 0, z: 0 }), null);

  const view = readFileSync(join(repo, "src/game/FormationLibraryView.tsx"), "utf8");
  const replay = readFileSync(join(repo, "src/game/ReplayViewerView.tsx"), "utf8");
  assert.match(view, /iceBasisStep/);
  assert.match(view, /hit\.kind === "ice"/);
  assert.match(view, /nearestMark/);
  assert.match(replay, /iceBasisStep/);
  assert.match(replay, /sampleReplay/);
  assert.match(replay, /controlledSkaterIndex/);
  assert.match(replay, /act\.arrowX\) \+ \(live \? act\.stickX : 0\)/);
  assert.match(replay, /hit\.kind === "ice"/);
  assert.match(replay, /rate = -3\.4/);
  assert.match(replay, /rate = 0\.28/);
  assert.match(replay, /Fast rewind/);
  assert.match(replay, /Slow rewind/);
  assert.match(replay, /Slow forward/);
  assert.match(replay, /Fast forward/);
  assert.match(replay, /shuttleRef\.current/);
  assert.match(replay, /act\.aEdge && gamepadFaceDown\("a"\)/);
  assert.match(replay, /gamepadFaceDown\("y"\)/);
  assert.doesNotMatch(replay, /cursorRef\.current \+= act\.stickX/);
  const turned = mark.orbitStick(1, 0.8, 1, 0.2, 1);
  assert.equal(turned.theta, 2.85);
  assert.ok(Math.abs(turned.phi - 0.55) < 1e-9);
  assert.equal(mark.orbitStick(0, 0.2, 0, 1, 1).phi, 0.12);
  assert.equal(mark.orbitStick(0, 1.4, 0, -1, 1).phi, 1.45);
});

test("moving a selected player stores the root that keeps the shadow on the mark", () => {
  const saved = structuredClone(frame);
  const release = mountFormation(saved.adjusted);
  const s = world.skaters[0];
  s.comX = s.x + 0.35;
  s.comZ = s.z - 0.2;
  const root = mark.rootForShadow(1, 2, s.comX, s.comZ, s.x, s.z);
  s.x = root.x;
  s.z = root.z;
  s.yaw = 1.2;
  writeAdjustedPositions(saved);
  const stored = saved.adjusted.players.find((p) => p.id === s.id);
  assert.equal(stored.x, root.x);
  assert.equal(stored.z, root.z);
  assert.equal(stored.yaw, 1.2);
  assert.ok(Math.abs(stored.x + 0.35 - 1) < 1e-9);
  assert.ok(Math.abs(stored.z - 0.2 - 2) < 1e-9);
  const kept = saved.original.players.find((p) => p.id === s.id).x;
  writeAdjustedPositions(saved, "original");
  assert.equal(saved.original.players.find((p) => p.id === s.id).x, root.x);
  assert.notEqual(kept, root.x);
  assert.equal(formationSideOf(saved, "adjusted").players.find((p) => p.id === s.id).x, root.x);
  assert.equal(formationSideOf(saved, "original").players.find((p) => p.id === s.id).yaw, 1.2);
  release();
});

test("a carried puck keeps its place in the player's frame when the player turns", () => {
  const yaw = 0.4;
  const dx = 1.2;
  const dz = -0.5;
  const local = formLocalOffset(yaw, dx, dz);
  const turned = yaw + 1.1;
  const at = formWorldOffset(turned, 3, 4, local.lx, local.lz);
  const again = formLocalOffset(turned, at.x - 3, at.z - 4);
  assert.ok(Math.abs(again.lx - local.lx) < 1e-9);
  assert.ok(Math.abs(again.lz - local.lz) < 1e-9);
});

test("an import stays on the left until it is saved, and removing it leaves the repo copy", () => {
  const imported = { id: "import-1", name: "slot.json", frame };
  const onDisk = { id: "bundled:formations/slot.json:0", name: "slot.json", frame };
  const open = partitionFormationLibrary([imported], [onDisk]);
  assert.deepEqual(open.imported.map((entry) => entry.id), ["import-1"]);
  assert.deepEqual(open.repo.map((entry) => entry.id), ["bundled:formations/slot.json:0"]);

  const written = { id: "bundled:formations/slot.json:0", name: "slot.json", frame };
  const saved = partitionFormationLibrary([], [onDisk], [written]);
  assert.equal(saved.imported.length, 0);
  assert.equal(saved.repo.length, 1);
  assert.equal(saved.repo[0], written);

  const removed = partitionFormationLibrary([], [onDisk]);
  assert.equal(removed.imported.length, 0);
  assert.equal(removed.repo.length, 1);
  assert.equal(removed.repo[0].id, onDisk.id);
});

test("undo and redo restore a slide and a turn", () => {
  const h = freshFormHist();
  openFormGesture(h, {
    kind: "skater",
    id: 4,
    x0: 1,
    z0: 2,
    x1: 1,
    z1: 2,
    yaw0: 0,
    yaw1: 0,
    puck: false,
    px0: 0,
    pz0: 0,
    px1: 0,
    pz1: 0,
  });
  h.gesture.x1 = 4;
  h.gesture.z1 = -1;
  h.gesture.yaw1 = formYawSnap(1, 0);
  closeFormGesture(h);
  assert.equal(h.undo.length, 1);
  assert.equal(h.redo.length, 0);
  const back = undoFormEdit(h);
  assert.equal(back.x0, 1);
  assert.equal(back.z0, 2);
  assert.equal(back.yaw0, 0);
  assert.equal(h.redo.length, 1);
  const again = redoFormEdit(h);
  assert.equal(again.x1, 4);
  assert.equal(again.z1, -1);
  assert.equal(again.yaw1, -Math.PI / 2);
  assert.ok(Math.abs(formYawToward(0, 1, 0, 0.1) - -0.24) < 1e-9);
});

test("playback writes lerped spots onto the mounted roster and marks the controlled skater", () => {
  const start = structuredClone(frame);
  start.userId = 0;
  const next = structuredClone(start);
  next.adjusted.players = start.adjusted.players.map((p) => ({ ...p, x: p.x + 4, z: p.z }));
  const release = mountFormation(start.adjusted);
  const prev = world.userId;
  const mid = sampleReplay([start, next], 0.5);
  applyReplayPose(mid.players, mid.puck);
  world.userId = controlledSkaterIndex(mid, mid.players);
  assert.equal(world.skaters[0].x, start.adjusted.players[0].x + 2);
  assert.equal(world.userId, 0);
  release();
  world.userId = prev;
});
