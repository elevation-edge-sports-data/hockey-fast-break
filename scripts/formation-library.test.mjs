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
  libraryRemoveFile,
  libraryStateAfterDelete,
  repoJsonName,
  retiredNamesForFile,
  nextAfterLeftRemove,
  readRetiredFormations,
  writeRetiredFormations,
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
  LOCK_SLIDE_MPS,
  lockedReplayIndex,
  restoreFormationFrame,
} = lib;
const { formationDownloadBody, formationDownloadName } = await server.ssrLoadModule(
  "/src/game/formationDownload.ts",
);
const replayLib = await server.ssrLoadModule("/src/game/replayLibrary.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const { readReplayLibrary, writeReplayLibrary, partitionReplayLibrary, replayClipFromFile } =
  replayLib;
const { gameSpeedRate } = store;
const mark = await server.ssrLoadModule("/src/game/iceMark.ts");
const { world } = sim;
const poses = await server.ssrLoadModule("/src/game/poseOverrideInfer.ts");
const { inferNamedPose } = poses;

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
  const entries = entriesFromFile(
    "replay-0-2.json",
    JSON.stringify([frame, { ...frame, frame: 20, time: 1 }]),
    () => `id-${n++}`,
  );
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

test("a recorded side, kind, and jersey are shown, and a bad one is rejected", () => {
  const tagged = structuredClone(frame);
  tagged.adjusted.players[0] = {
    ...tagged.adjusted.players[0],
    x: 0,
    z: 0,
    side: "away",
    kind: "defense",
    number: 7,
  };
  tagged.adjusted.players[1] = {
    ...tagged.adjusted.players[1],
    x: 1,
    z: 1,
    side: "home",
    kind: "goalie",
    number: 41,
  };
  const parsed = parseFormationJson(JSON.stringify(tagged));
  assert.equal(parsed[0].adjusted.players[0].side, "away");
  assert.equal(parsed[0].adjusted.players[0].kind, "defense");
  assert.equal(parsed[0].adjusted.players[0].number, 7);
  assert.equal(parsed[0].adjusted.players[0].id, 4);
  assert.equal(parsed[0].adjusted.players[0].yaw, 0.4);
  const stood = formationSkaters(parsed[0].adjusted.players);
  assert.equal(stood[0].side, "away");
  assert.equal(stood[0].kind, "defense");
  assert.equal(stood[0].number, 7);
  assert.equal(stood[1].side, "home");
  assert.equal(stood[1].kind, "goalie");
  assert.equal(stood[1].number, 41);
  assert.equal(stood[1].radius, 0.58);

  const release = mountFormation(parsed[0].adjusted);
  const sample = sampleReplay(parsed, 0);
  assert.equal(sample.players[0].side, "away");
  assert.equal(sample.players[0].kind, "defense");
  assert.equal(sample.players[0].number, 7);
  sample.players[0].x = 3;
  sample.players[0].number = 22;
  sample.players[0].kind = "winger";
  applyReplayPose(sample.players, sample.puck);
  assert.equal(world.skaters[0].x, 3);
  assert.equal(world.skaters[0].number, 22);
  assert.equal(world.skaters[0].kind, "winger");
  assert.equal(world.skaters[0].side, "away");
  assert.equal(world.skaters[1].number, 41);
  release();

  const badKind = structuredClone(frame);
  badKind.adjusted.players[0].kind = "center";
  assert.equal(framesFromUnknown(badKind), "That file is not a replay frame.");
  const badSide = structuredClone(frame);
  badSide.adjusted.players[0].side = "visitor";
  assert.equal(framesFromUnknown(badSide), "That file is not a replay frame.");
  const badNumber = structuredClone(frame);
  badNumber.adjusted.players[0].number = "seven";
  assert.equal(framesFromUnknown(badNumber), "That file is not a replay frame.");
  const badPose = structuredClone(frame);
  badPose.adjusted.players[0].pose = 1;
  assert.equal(framesFromUnknown(badPose), "That file is not a replay frame.");
});

test("a recorded pose is shown, and an older frame without one still parses", () => {
  const tagged = structuredClone(frame);
  tagged.adjusted.players[0] = {
    ...tagged.adjusted.players[0],
    side: "home",
    kind: "goalie",
    number: 39,
    pose: "goaliePlayPuck1",
  };
  tagged.adjusted.players[1] = { ...tagged.adjusted.players[1], pose: null };
  const parsed = parseFormationJson(JSON.stringify(tagged));
  assert.equal(parsed[0].adjusted.players[0].pose, "goaliePlayPuck1");
  assert.equal(parsed[0].adjusted.players[1].pose, null);
  assert.equal(parsed[0].original.players[0].pose, undefined);
  const release = mountFormation(parsed[0].adjusted);
  try {
    const goalie = world.skaters.find((s) => s.kind === "goalie");
    assert.equal(inferNamedPose(goalie, goalie.id), "goaliePlayPuck1");
    const next = structuredClone(parsed[0]);
    next.frame = 13;
    next.adjusted.players[0] = { ...next.adjusted.players[0], pose: "goalieMid" };
    const mid = sampleReplay([parsed[0], next], 0.5);
    assert.equal(mid.players[0].pose, "goaliePlayPuck1");
    const landed = sampleReplay([parsed[0], next], 1);
    assert.equal(landed.players[0].pose, "goalieMid");
    applyReplayPose(landed.players, landed.puck);
    assert.equal(
      inferNamedPose(
        world.skaters.find((s) => s.id === goalie.id),
        goalie.id,
      ),
      "goalieMid",
    );
  } finally {
    release();
  }
  const goalie = world.skaters.find((s) => s.kind === "goalie");
  if (goalie) assert.notEqual(inferNamedPose(goalie, goalie.id), "goaliePlayPuck1");
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
  const hit = mark.nearestMark(
    0.2,
    0.1,
    [
      { x: 0, z: 0 },
      { x: 3, z: 0 },
    ],
    { x: 2, z: 2 },
  );
  assert.deepEqual(hit, { kind: "skater", index: 0 });
  assert.equal(mark.nearestMark(3, 3, [{ x: 0, z: 0 }], { x: 0, z: 0 }), null);

  const view = [
    readFileSync(join(repo, "src/game/FormationLibraryView.tsx"), "utf8"),
    readFileSync(join(repo, "src/game/FormationEdit.tsx"), "utf8"),
  ].join("\n");
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
  assert.match(replay, /nearestMark/);
  assert.match(replay, /cycleMarkLock/);
  assert.match(view, /cycleMarkLock/);
  assert.match(view, /windowHasInputFocus/);
  assert.match(replay, /windowHasInputFocus/);
  assert.doesNotMatch(replay, /cursorRef\.current \+= act\.stickX/);
  assert.equal(mark.cycleMarkLock(null, 2).kind, "puck");
  assert.deepEqual(mark.cycleMarkLock({ kind: "puck" }, 2), { kind: "skater", index: 0 });
  assert.deepEqual(mark.cycleMarkLock({ kind: "skater", index: 0 }, 2), {
    kind: "skater",
    index: 1,
  });
  assert.equal(mark.cycleMarkLock({ kind: "skater", index: 1 }, 2), null);
  assert.equal(mark.cycleMarkLock({ kind: "puck" }, 0), null);
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
  assert.deepEqual(
    open.imported.map((entry) => entry.id),
    ["import-1"],
  );
  assert.deepEqual(
    open.repo.map((entry) => entry.id),
    ["bundled:formations/slot.json:0"],
  );

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

test("remove unlinks a repo file from either panel and leaves a never-saved import", () => {
  const onDisk = { id: "bundled:formations/slot.json:0", name: "slot.json", frame };
  const other = { id: "bundled:../../formations/range.json:1", name: "range.json · 12", frame };
  const otherFrame = {
    id: "bundled:../../formations/range.json:2",
    name: "range.json · 13",
    frame,
  };
  const imported = { id: "import-1", name: "slot.json", frame };
  const moved = { id: "moved-1", name: "old.json", frame };
  const rows = [onDisk, other, otherFrame, imported, moved];
  assert.equal(repoJsonName(other.id, other.name), "range.json");
  assert.equal(repoJsonName("import-2", "notes"), "notes.json");
  assert.equal(libraryRemoveFile(onDisk, rows, []), "slot.json");
  assert.equal(libraryRemoveFile(other, rows, []), "range.json");
  assert.equal(libraryRemoveFile(imported, rows, []), null);
  assert.equal(libraryRemoveFile(moved, rows, ["old.json"]), "old.json");
  assert.deepEqual(
    lib.retiredRepoFiles(
      ["slot.json", "range.json · 12"],
      [onDisk, other, otherFrame, imported],
    ),
    ["slot.json", "range.json"],
  );
  assert.deepEqual(lib.retiredRepoFiles(["replay-183-301.json"], [imported]), []);

  const dropped = libraryStateAfterDelete([], [onDisk], [], rows, onDisk.id, "slot.json");
  assert.equal(dropped.saved.length, 0);
  assert.ok(dropped.retired.includes("slot.json"));
  const hidden = partitionFormationLibrary(
    [imported],
    [onDisk, other, otherFrame],
    dropped.saved,
    dropped.retired,
  );
  assert.deepEqual(
    hidden.repo.map((entry) => entry.id),
    [other.id, otherFrame.id],
  );
  assert.deepEqual(
    hidden.imported.map((entry) => entry.id),
    ["import-1"],
  );

  const rangeRetired = retiredNamesForFile(rows, [], "range.json");
  assert.ok(rangeRetired.includes("range.json"));
  assert.ok(rangeRetired.includes("range.json · 12"));
  assert.ok(rangeRetired.includes("range.json · 13"));
  const rangeGone = partitionFormationLibrary([], [other, otherFrame], [], rangeRetired);
  assert.equal(rangeGone.repo.length, 0);

  const kept = libraryStateAfterDelete(
    [imported, moved],
    [],
    ["old.json"],
    rows,
    moved.id,
    "old.json",
  );
  assert.deepEqual(
    kept.local.map((entry) => entry.id),
    ["import-1"],
  );
  writeRetiredFormations(kept.retired);
  assert.ok(readRetiredFormations().includes("old.json"));
  writeRetiredFormations([]);

  const left = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const right = [{ id: "r1" }, { id: "r2" }];
  assert.equal(nextAfterLeftRemove(left, right, () => 0).id, "a");
  assert.equal(nextAfterLeftRemove(left, right, () => 0.99).id, "c");
  assert.equal(nextAfterLeftRemove([], right, () => 0).id, "r1");
  assert.equal(nextAfterLeftRemove([], right, () => 0.5).id, "r2");
  assert.equal(
    nextAfterLeftRemove([], [], () => 0.2),
    null,
  );
  const seen = new Set();
  for (let i = 0; i < 80; i++) seen.add(nextAfterLeftRemove(left, right).id);
  assert.ok(seen.has("a") && seen.has("b") && seen.has("c"));
  assert.equal(
    [...seen].every((id) => id === "a" || id === "b" || id === "c"),
    true,
  );

  const view = readFileSync(join(repo, "src/game/FormationLibraryView.tsx"), "utf8");
  assert.ok(view.indexOf("Import frame") < view.indexOf('className="formation-side"'));
  assert.match(view, /formation-top-center/);
  assert.match(view, /nextAfterLeftRemove/);
  assert.match(view, /deleteRepoJson\("formations"/);
  assert.equal((view.match(/void remove\(chosen\.id\)/g) ?? []).length, 2);
  assert.doesNotMatch(view, /moveRepoToLeft/);
  assert.match(view, /imported\.length > 0 \?/);
  assert.match(view, /repo\.length > 0 \?/);
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

test("a loaded replay stays on the left until it is saved", () => {
  const frames = [frame, { ...structuredClone(frame), frame: 13, time: 0.4 }];
  const text = JSON.stringify(frames);
  const clip = replayClipFromFile("replay-1-2.json", text, "load-1");
  assert.equal(typeof clip, "object");
  assert.equal(clip.frames.length, 2);
  const onDisk = { id: "bundled:../../replays/replay-1-2.json:0", name: "replay-1-2.json", frames };
  const open = partitionReplayLibrary([clip], [onDisk]);
  assert.deepEqual(
    open.imported.map((entry) => entry.id),
    ["load-1"],
  );
  assert.equal(open.repo[0].id, onDisk.id);
  const written = { id: "bundled:replays/replay-1-2.json:0", name: "replay-1-2.json", frames };
  const saved = partitionReplayLibrary([], [onDisk], [written]);
  assert.equal(saved.imported.length, 0);
  assert.equal(saved.repo.length, 1);
  assert.equal(saved.repo[0], written);
  assert.equal(writeReplayLibrary([clip]), null);
  assert.equal(readReplayLibrary()[0].id, "load-1");
  assert.equal(readReplayLibrary()[0].frames.length, 2);
  assert.equal(writeReplayLibrary([]), null);
});

test("replay playback uses the in-game game-speed clock and the formation save layout", () => {
  const replay = readFileSync(join(repo, "src/game/ReplayViewerView.tsx"), "utf8");
  const overlay = readFileSync(join(repo, "src/game/Overlay.tsx"), "utf8");
  const css = readFileSync(join(repo, "src/styles.css"), "utf8");
  const simSrc = readFileSync(join(repo, "src/game/sim.ts"), "utf8");
  assert.ok(Math.abs(gameSpeedRate(0.85) - 0.68) < 1e-9);
  assert.match(simSrc, /playAcc \+= d \* gameSpeedRate\(useGame\.getState\(\)\.gameSpeed\)/);
  assert.match(replay, /60 \* gameSpeedRate\(useGame\.getState\(\)\.gameSpeed\) \* dt/);
  assert.doesNotMatch(replay, /cursorRef\.current \+= dt \* 60/);
  assert.match(replay, /Load replay/);
  assert.doesNotMatch(replay, /Open replay/);
  assert.doesNotMatch(replay, /\{clip\.name\}/);
  assert.doesNotMatch(replay, /playing \? "Pause" : "Play"/);
  assert.doesNotMatch(replay, /Saved \$\{/);
  assert.doesNotMatch(replay, /Removed \$\{/);
  assert.match(replay, /deleteRepoJson\("replays"/);
  assert.equal((replay.match(/void remove\(chosen\.id\)/g) ?? []).length, 2);
  assert.doesNotMatch(replay, /moveRepoToLeft/);
  const helper = readFileSync(join(repo, "src/game/formationLibrary.ts"), "utf8");
  assert.match(helper, /method: "DELETE"/);
  assert.match(helper, /Vite restart is required for the glob to drop the file completely/);
  assert.match(replay, /aria-label="Play\/pause"/);
  assert.match(replay, /Fast rewind/);
  assert.match(replay, /formation-top-center/);
  assert.ok(replay.indexOf("Load replay") < replay.indexOf('className="formation-side"'));
  assert.match(replay, /imported\.length > 0 \?/);
  assert.match(replay, /repo\.length > 0 \?/);
  assert.match(replay, /aria-label="Loaded replay name"/);
  assert.match(replay, /aria-label="Replay file name"/);
  assert.match(replay, /\/api\/replays/);
  assert.match(replay, />\s*Rename\s*</);
  assert.match(replay, /formation-repo/);
  assert.match(overlay, /className="play-top"/);
  assert.match(overlay, /Elevation Edge Sports Data/);
  assert.match(overlay, /Hockey Fast Break \(V4\)/);
  assert.match(
    overlay,
    /\{playing && !paused \? null : hudReady \? \(\s*<>\s*<span className="play-gap" aria-hidden="true" \/>\s*<FormationKits \/>/,
  );
  assert.match(overlay, /className=\{`play-lineups\$\{lineupsFit \? "" : " is-hidden"\}`\}/);
  assert.doesNotMatch(overlay, /className="uni-banner"/);
  assert.doesNotMatch(overlay, /\(playing && !paused\) \|\| replay \? null/);
  assert.match(
    css,
    /\.formation-lib \{\s*display: grid;\s*grid-template-columns: min\(280px, 25%\) minmax\(50%, 1fr\) min\(280px, 25%\);\s*grid-template-rows: auto minmax\(0, 1fr\);\s*grid-template-areas:\s*"top top top"\s*"side stage repo";/,
  );
  assert.match(
    css,
    /@container \(max-width: 220px\) \{\s*\.formation-save,\s*\.formation-version \{\s*flex-direction: column;/,
  );
  assert.match(css, /\.formation-top-center \{\s*justify-self: center;/);
  assert.doesNotMatch(css, /grid-template-areas:\s*"top top"\s*"side stage"/);
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

test("locked-frame download keeps original and adjusted, matching the in-game replay", () => {
  assert.equal(LOCK_SLIDE_MPS, 4);
  const simSrc = readFileSync(join(repo, "src/game/sim.ts"), "utf8");
  assert.match(simSrc, /const REPLAY_EDIT_SPEED = 4/);
  const slide = mark.iceBasisMove(1, LOCK_SLIDE_MPS, 0, 1, { rx: 0, rz: 1, fx: 1, fz: 0 });
  assert.equal(slide.dx, 4);
  assert.equal(slide.dz, 0);
  assert.equal(lockedReplayIndex(4.8, 10), 4);
  assert.equal(lockedReplayIndex(-2, 10), 0);
  assert.equal(lockedReplayIndex(40, 3), 2);

  const shot = structuredClone(frame);
  shot.frame = 1107;
  shot.userId = 1;
  const body = formationDownloadBody(shot);
  assert.equal(body, JSON.stringify(shot, null, 2) + "\n");
  assert.equal(formationDownloadName(shot.frame), "replay-frame-1107.json");
  const parsed = JSON.parse(body);
  assert.equal(parsed.original.players[0].x, shot.original.players[0].x);
  assert.equal(parsed.adjusted.players[0].x, shot.adjusted.players[0].x);
  assert.notEqual(parsed.original.players[0].x, parsed.adjusted.players[0].x);

  const live = structuredClone(shot);
  const base = structuredClone(shot);
  const release = mountFormation(live.adjusted);
  const prev = world.userId;
  world.skaters[0].x += 2;
  writeAdjustedPositions(live, "adjusted");
  assert.equal(
    live.adjusted.players.find((p) => p.id === world.skaters[0].id).x,
    base.adjusted.players[0].x + 2,
  );
  assert.equal(live.original.players[0].x, base.original.players[0].x);
  const saved = JSON.parse(formationDownloadBody(live));
  assert.equal(saved.original.players[0].x, base.original.players[0].x);
  assert.equal(saved.adjusted.players[0].x, base.adjusted.players[0].x + 2);
  assert.equal(saved.userId, 1);
  restoreFormationFrame(live, base);
  assert.equal(live.adjusted.players[0].x, base.adjusted.players[0].x);
  assert.equal(live.original.players[0].x, base.original.players[0].x);
  release();
  world.userId = prev;

  const edit = readFileSync(join(repo, "src/game/FormationEdit.tsx"), "utf8");
  const library = readFileSync(join(repo, "src/game/FormationLibraryView.tsx"), "utf8");
  const replay = readFileSync(join(repo, "src/game/ReplayViewerView.tsx"), "utf8");
  const overlay = readFileSync(join(repo, "src/game/Overlay.tsx"), "utf8");
  assert.match(edit, /iceBasisMove\(dt, LOCK_SLIDE_MPS/);
  assert.match(edit, /iceBasisStep\(\s*dt,\s*viewRadius\.current/);
  assert.match(edit, /writeAdjustedPositions\(frame, viewRef\.current\)/);
  assert.match(library, /Download formation/);
  assert.match(library, /downloadFormationFrame\(chosen\.frame\)/);
  assert.match(library, /<FormationMarkDriver/);
  assert.match(replay, /Edit formation/);
  assert.match(replay, /"Revert"/);
  assert.match(replay, /Download formation/);
  assert.match(replay, /downloadFormationFrame\(frame\)/);
  assert.match(replay, /<FormationMarkDriver/);
  assert.match(replay, /restoreFormationFrame/);
  assert.match(replay, /lockedReplayIndex/);
  assert.match(overlay, /downloadFormationFrame\(data\)/);
  assert.match(overlay, /Download formation/);
});
