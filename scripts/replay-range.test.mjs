/**
 * Pause-replay range marks are export-only.
 * Two marks bound a download. A later mark replaces the nearer one,
 * or the earlier one when the distances match. Scrub and lock stay put.
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
if (typeof globalThis.navigator !== "object" || globalThis.navigator === null) globalThis.navigator = {};
Object.defineProperty(globalThis.navigator, "getGamepads", {
  configurable: true,
  value: () => [],
});

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
const {
  resetWorld,
  stepSim,
  world,
  beginPauseReplay,
  stopPauseReplay,
  seekReplay,
  replayFootagePct,
  toggleReplayFrameLock,
  replayFrameLocked,
  exportReplayFrame,
  markReplayRange,
  exportReplayRange,
  replayRangeMarkPcts,
} = sim;
const { useGame } = store;
const { setInjectedKeys } = input;

const DT = 1 / 60;

function bootReplay() {
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
  for (let i = 0; i < 40; i++) stepSim(DT);
  useGame.getState().setPaused(true);
  if (!beginPauseReplay()) throw new Error("replay did not start");
  world.replayPlaying = false;
  seekReplay(1);
  const maxT = world.replayT;
  const last = Math.floor(maxT * 60);
  assert.ok(last >= 8, `replay too short (${last})`);
  return { maxT, last };
}

function shownFrame() {
  return Math.max(0, Math.floor(world.replayT * 60));
}

function markFrame(frame, last, maxT) {
  if (frame <= 0) seekReplay(0);
  else if (frame >= last) seekReplay(1);
  else {
    world.replayT = Math.min(maxT, (frame + 0.5) / 60);
    for (let n = 0; shownFrame() !== frame && n < 12; n++) {
      world.replayT = Math.min(maxT, (frame + 0.05 * (n + 1)) / 60);
    }
  }
  assert.equal(shownFrame(), frame, `scrub showed ${shownFrame()} instead of ${frame}`);
  markReplayRange();
}

test("marks export the inclusive span and leave the scrubber free", () => {
  assert.equal(exportReplayRange(), null);
  markReplayRange();
  assert.equal(exportReplayRange(), null);

  const { maxT, last } = bootReplay();
  try {
    assert.equal(exportReplayRange(), null);
    assert.equal(replayRangeMarkPcts().length, 0);
    const empty = replayRangeMarkPcts();
    assert.equal(replayRangeMarkPcts(), empty);

    markFrame(0, last, maxT);
    assert.equal(exportReplayRange(), null);
    assert.equal(replayRangeMarkPcts().length, 1);
    assert.notEqual(replayRangeMarkPcts(), empty);

    markFrame(0, last, maxT);
    const same = exportReplayRange();
    assert.equal(same.length, 1);
    assert.equal(same[0].frame, 0);
    assert.equal(same[0].time, 0);
    assert.deepEqual(same[0].original, same[0].adjusted);

    stopPauseReplay();
    const span = bootReplay();
    markFrame(2, span.last, span.maxT);
    markFrame(5, span.last, span.maxT);
    let range = exportReplayRange();
    assert.deepEqual(
      range.map((frame) => frame.frame),
      [2, 3, 4, 5],
    );
    for (const frame of range) {
      assert.equal(frame.time, frame.frame / 60);
      assert.deepEqual(frame.original, frame.adjusted);
      assert.ok(frame.original.players.length > 0);
      assert.deepEqual(Object.keys(frame).sort(), ["adjusted", "frame", "original", "time", "userId"]);
      assert.equal(frame.userId, world.userId);
      assert.ok(frame.original.players.some((p) => p.id === frame.userId));
      assert.deepEqual(Object.keys(frame.original.puck).sort(), ["owner", "x", "y", "z"]);
      assert.deepEqual(Object.keys(frame.original.players[0]).sort(), ["id", "index", "x", "yaw", "z"]);
    }

    stopPauseReplay();
    const flipped = bootReplay();
    markFrame(5, flipped.last, flipped.maxT);
    markFrame(2, flipped.last, flipped.maxT);
    range = exportReplayRange();
    assert.deepEqual(
      range.map((frame) => frame.frame),
      [2, 3, 4, 5],
    );

    const held = exportReplayRange();
    seekReplay(0);
    assert.equal(replayFootagePct(), 0);
    world.replayPlaying = true;
    stepSim(DT);
    stepSim(DT);
    assert.ok(world.replayT > 0);
    seekReplay(1);
    assert.equal(replayFootagePct(), 1);
    assert.deepEqual(exportReplayRange(), held);

    stopPauseReplay();
    const wide = bootReplay();
    markFrame(0, wide.last, wide.maxT);
    markFrame(wide.last, wide.last, wide.maxT);
    const full = exportReplayRange();
    assert.equal(full[0].frame, 0);
    assert.equal(full[full.length - 1].frame, wide.last);
    assert.equal(full.length, wide.last + 1);
    assert.notEqual(full[0].original.puck.x, full[full.length - 1].original.puck.x);
    const pcts = replayRangeMarkPcts();
    assert.equal(pcts.length, 2);
    assert.equal(pcts[0], 0);
    assert.ok(Math.abs(pcts[1] - wide.last / Math.round(wide.maxT * 60)) < 1e-9);

    const shotT = world.replayT;
    assert.equal(toggleReplayFrameLock(), true);
    const shot = exportReplayFrame();
    assert.equal(shot.frame, Math.floor(shotT * 60));
    assert.equal(shot.userId, full[shot.frame].userId);
    assert.deepEqual(Object.keys(shot).sort(), Object.keys(full[0]).sort());
    seekReplay(0);
    assert.equal(world.replayT, shotT);
    assert.deepEqual(exportReplayRange(), full);
    assert.equal(toggleReplayFrameLock(), false);
    assert.equal(exportReplayFrame(), null);
    assert.equal(replayFrameLocked(), false);
    assert.deepEqual(exportReplayRange(), full);
  } finally {
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
    setInjectedKeys([]);
  }
});

test("a later mark replaces the nearer mark, or the older one on a tie", () => {
  const { maxT, last } = bootReplay();
  try {
    markFrame(0, last, maxT);
    markFrame(last, last, maxT);
    markFrame(last - 1, last, maxT);
    let range = exportReplayRange();
    assert.equal(range[0].frame, 0);
    assert.equal(range[range.length - 1].frame, last - 1);

    markFrame(1, last, maxT);
    range = exportReplayRange();
    assert.equal(range[0].frame, 1);
    assert.equal(range[range.length - 1].frame, last - 1);

    stopPauseReplay();
    const again = bootReplay();
    markFrame(0, again.last, again.maxT);
    markFrame(8, again.last, again.maxT);
    markFrame(4, again.last, again.maxT);
    range = exportReplayRange();
    assert.deepEqual(
      range.map((frame) => frame.frame),
      [4, 5, 6, 7, 8],
    );
  } finally {
    stopPauseReplay();
    setInjectedKeys([]);
  }
});

test("leaving replay clears the marks", () => {
  const { maxT, last } = bootReplay();
  try {
    markFrame(0, last, maxT);
    markFrame(last, last, maxT);
    assert.ok(exportReplayRange().length > 1);
  } finally {
    stopPauseReplay();
  }
  assert.equal(exportReplayRange(), null);
  assert.deepEqual([...replayRangeMarkPcts()], []);
  const next = bootReplay();
  try {
    assert.equal(replayRangeMarkPcts().length, 0);
    assert.equal(exportReplayRange(), null);
    assert.ok(next.last >= 8);
  } finally {
    stopPauseReplay();
  }
});
