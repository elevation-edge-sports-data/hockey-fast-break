/**
 * The rolling replay buffer stays across a new game, a mode change, and a drill
 * level change. A plain resetWorld() still clears it for a fresh harness boot.
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
  pauseGame,
  previewPausedMode,
  previewPausedTargets,
  startPausedNewGame,
  beginPauseReplay,
  stopPauseReplay,
  seekReplay,
  replayFrameNow,
  replayHasFootage,
  replayBufferFrames,
  subscribeReplayFootage,
} = sim;
const { useGame } = store;
const { setInjectedKeys } = input;

const DT = 1 / 60;

function live() {
  useGame.getState().setPlaying(true);
  useGame.getState().setPaused(false);
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  setInjectedKeys([]);
}

test("the footer replay control is a full-length frame scrubber and greys out when empty", () => {
  const overlay = readFileSync(join(repo, "src/game/Overlay.tsx"), "utf8");
  const css = readFileSync(join(repo, "src/styles.css"), "utf8");
  assert.match(overlay, /className=\{`replay-bar madden-replay/);
  assert.match(overlay, /aria-valuetext=\{`frame \$\{frame\}`\}/);
  assert.match(overlay, /<span className="madden-replay-pct">\{frame\}<\/span>/);
  assert.doesNotMatch(overlay, /madden-replay-pct">\{shown\}%/);
  assert.match(overlay, /\{replay \? <ReplayBar \/> : null\}/);
  assert.match(overlay, /disabled=\{!replay && \(!playing \|\| !replayReady\)\}/);
  assert.match(css, /\.cam-row button:disabled \{[^}]*opacity: 0\.4/);
  assert.match(css, /\.replay-bar \{[^}]*left: 16px;[^}]*right: 16px;[^}]*bottom: 16px;/s);
});

test("recent footage survives a new game, a mode change, and a drill level change", () => {
  useGame.getState().setInstantReplay(false);
  useGame.getState().setClockMode("practice");
  resetWorld();
  assert.equal(replayBufferFrames(), 0);
  assert.equal(replayHasFootage(), false);
  assert.equal(beginPauseReplay(), false);

  live();
  world.puck.x = -12;
  world.puck.vx = 4;
  world.puck.vz = 0.4;
  world.puck.y = 0.08;
  let becameReady = 0;
  const stop = subscribeReplayFootage(() => {
    becameReady += 1;
  });
  for (let i = 0; i < 24; i++) stepSim(DT);
  stop();
  const recorded = replayBufferFrames();
  assert.ok(recorded >= 12, `recorded ${recorded}`);
  assert.equal(replayHasFootage(), true);
  assert.equal(becameReady, 1);

  resetWorld({ keepReplay: true });
  assert.equal(replayBufferFrames(), recorded);
  assert.equal(replayHasFootage(), true);

  useGame.getState().setPlaying(false);
  useGame.getState().setPaused(false);
  previewPausedMode("game");
  assert.equal(useGame.getState().clockMode, "game");
  assert.equal(replayBufferFrames(), recorded);

  useGame.getState().setPlaying(true);
  pauseGame();
  previewPausedMode("drill");
  startPausedNewGame();
  assert.equal(useGame.getState().clockMode, "drill");
  assert.equal(useGame.getState().paused, false);
  assert.equal(replayBufferFrames(), recorded);

  live();
  previewPausedTargets(12);
  assert.equal(useGame.getState().drillTargets, 12);
  assert.equal(useGame.getState().clockMode, "drill");
  assert.equal(replayBufferFrames(), recorded);

  useGame.getState().setPaused(true);
  assert.equal(beginPauseReplay(), true);
  seekReplay(0);
  assert.equal(replayFrameNow(), 0);
  seekReplay(1);
  const end = replayFrameNow();
  assert.ok(end >= 11, `frame ${end} of ${recorded}`);
  seekReplay(0.5);
  const mid = replayFrameNow();
  assert.ok(mid > 0 && mid < end, `mid ${mid} end ${end}`);
  stopPauseReplay();

  resetWorld();
  assert.equal(replayBufferFrames(), 0);
  assert.equal(replayHasFootage(), false);
  assert.equal(beginPauseReplay(), false);
});
