/**
 * Power play follows the button. Mode changes do not clear it or restore it.
 * A missing saved flag stays off. Deselect writes "0" and cancels a release
 * already armed for the next faceoff.
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

if (typeof globalThis.navigator?.getGamepads !== "function") {
  Object.defineProperty(globalThis.navigator, "getGamepads", {
    configurable: true,
    value: () => [],
  });
}

const { useGame } = await server.ssrLoadModule("/src/game/store.ts");
const { resetWorld, world } = await server.ssrLoadModule("/src/game/sim.ts");
const loadedPowerPlay = useGame.getState().powerPlay;
const loadedStoredFlag = localStorage.getItem("hfb-power-play");

function stored() {
  return localStorage.getItem("hfb-power-play");
}

/** Land on Game with a known saved flag. */
function boot(flag) {
  localStorage.setItem("hfb-power-play", flag ? "1" : "0");
  const ui = useGame.getState();
  if (ui.clockMode !== "game") ui.setClockMode("game");
  ui.setPowerPlay(flag);
  assert.equal(useGame.getState().clockMode, "game");
  assert.equal(useGame.getState().powerPlay, flag);
  assert.equal(stored(), flag ? "1" : "0");
}

test("a missing saved flag loads off", () => {
  assert.equal(loadedPowerPlay, false);
  assert.equal(loadedStoredFlag, null);
});

test("mode changes leave the toggle where the button set it", () => {
  boot(true);
  for (const mode of ["practice", "scrimmage", "roller", "game", "drill", "shootout"]) {
    useGame.getState().setClockMode(mode);
    assert.equal(useGame.getState().powerPlay, true);
    assert.equal(stored(), "1");
  }

  boot(false);
  for (const mode of ["practice", "scrimmage", "roller", "game"]) {
    useGame.getState().setClockMode(mode);
    assert.equal(useGame.getState().powerPlay, false);
    assert.equal(stored(), "0");
  }
});

test("deselecting stays off and cancels a release armed at the whistle", () => {
  boot(true);
  useGame.getState().setChaos(false);
  useGame.getState().setClockMode("roller");
  resetWorld();
  const before = useGame.getState().liveAway.d;
  assert.equal(before, 1);

  world.ppRelease = "away";
  world.ppChaos = false;
  useGame.getState().setPowerPlay(false);
  assert.equal(useGame.getState().powerPlay, false);
  assert.equal(stored(), "0");
  resetWorld({ keepScore: true });
  assert.equal(useGame.getState().liveAway.d, before);
  assert.equal(world.ppRelease, null);

  useGame.getState().setClockMode("practice");
  useGame.getState().setClockMode("game");
  assert.equal(useGame.getState().powerPlay, false);
  assert.equal(stored(), "0");

  useGame.getState().setPowerPlay(true);
  useGame.getState().setClockMode("roller");
  world.ppRelease = "away";
  world.ppChaos = false;
  resetWorld({ keepScore: true });
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(useGame.getState().liveAway.d, before + 1);
});

test("chaos forces power play on, and turning chaos off turns power play off", () => {
  const ui = useGame.getState();
  ui.setChaos(false);
  ui.setPowerPlay(false);
  assert.equal(useGame.getState().chaos, false);
  assert.equal(useGame.getState().powerPlay, false);

  useGame.getState().setChaos(true);
  assert.equal(useGame.getState().chaos, true);
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(localStorage.getItem("hfb-chaos"), "1");
  assert.equal(localStorage.getItem("hfb-power-play"), "1");

  useGame.getState().setPowerPlay(false);
  assert.equal(useGame.getState().chaos, true);
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(localStorage.getItem("hfb-power-play"), "1");

  useGame.getState().setChaos(false);
  assert.equal(useGame.getState().chaos, false);
  assert.equal(useGame.getState().powerPlay, false);
  assert.equal(localStorage.getItem("hfb-chaos"), "0");
  assert.equal(localStorage.getItem("hfb-power-play"), "0");

  useGame.getState().setPowerPlay(true);
  assert.equal(useGame.getState().chaos, false);
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(localStorage.getItem("hfb-chaos"), "0");
  assert.equal(localStorage.getItem("hfb-power-play"), "1");

  useGame.getState().setChaos(false);
  assert.equal(useGame.getState().chaos, false);
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(localStorage.getItem("hfb-power-play"), "1");
});
