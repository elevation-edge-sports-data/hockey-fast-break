/**
 * Entering Practice turns power play off for that visit without writing the
 * saved flag. Roller and Game keep the stored toggle. A toggle after Practice
 * has started stays on.
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

mem.set("hfb-power-play", "1");
const { useGame } = await server.ssrLoadModule("/src/game/store.ts");

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

test("practice starts with power play off and does not write the saved flag", () => {
  boot(true);
  useGame.getState().setClockMode("practice");
  assert.equal(useGame.getState().clockMode, "practice");
  assert.equal(useGame.getState().powerPlay, false);
  assert.equal(stored(), "1");
});

test("roller and game keep the saved toggle", () => {
  boot(true);
  useGame.getState().setClockMode("scrimmage");
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(stored(), "1");
  useGame.getState().setClockMode("game");
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(stored(), "1");

  useGame.getState().setClockMode("practice");
  assert.equal(useGame.getState().powerPlay, false);
  assert.equal(stored(), "1");
  useGame.getState().setClockMode("scrimmage");
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(stored(), "1");
  useGame.getState().setClockMode("game");
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(stored(), "1");

  boot(false);
  useGame.getState().setClockMode("scrimmage");
  useGame.getState().setClockMode("game");
  assert.equal(useGame.getState().powerPlay, false);
  assert.equal(stored(), "0");
});

test("a power play toggle after practice starts stays on", () => {
  boot(true);
  useGame.getState().setClockMode("practice");
  assert.equal(useGame.getState().powerPlay, false);

  useGame.getState().setPowerPlay(true);
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(stored(), "1");

  useGame.getState().setClockMode("practice");
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(stored(), "1");

  useGame.getState().setClockMode("game");
  assert.equal(useGame.getState().powerPlay, true);
  assert.equal(stored(), "1");
});
