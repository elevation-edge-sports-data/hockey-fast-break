/**
 * Game speed, kits, play mode, skill sliders, and personnel survive a reload.
 * An old unversioned "scrimmage" id is still Roller. After that migration a
 * stored scrimmage id is the target mode.
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

const uniforms = await server.ssrLoadModule("/src/game/uniforms.ts");
const { COL_KIT, UNIFORMS } = uniforms;

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label} ${actual}`);
}

function seed(entries) {
  mem.clear();
  for (const [k, v] of Object.entries(entries)) mem.set(k, String(v));
}

async function loadStore(tag) {
  return server.ssrLoadModule(`/src/game/store.ts?persist=${tag}`);
}

seed({
  "hfb-play-mode-v": "2",
  "hfb-play-mode": "practice",
  "hfb-game-speed": "1.1",
  "hfb-home-kit": "4",
  "hfb-away-kit": "7",
  "hfb-cpu-offense": "1.5",
  "hfb-cpu-defense": "0.3",
  "hfb-cpu-goalie": "1.2",
  "hfb-user-offense": "0.9",
  "hfb-user-defense": "0.5",
  "hfb-user-goalie": "0.25",
  "hfb-home-lineup": JSON.stringify({ g: 0, d: 1, o: 2 }),
  "hfb-away-lineup": JSON.stringify({ g: 1, d: 1, o: 1 }),
});

const saved = await loadStore("saved");
const { useGame } = saved;

test("saved speed, kits, mode, sliders, and personnel restore on load", () => {
  const ui = useGame.getState();
  assert.equal(ui.clockMode, "practice");
  assert.equal(ui.periodClock, 1200);
  close(ui.gameSpeed, 1.1, "game speed");
  assert.equal(ui.homeKit, 4);
  assert.equal(ui.awayKit, 7);
  close(ui.cpuOffense, 1.5, "cpu offense");
  close(ui.cpuDefense, 0.3, "cpu defense");
  close(ui.cpuGoalie, 1.2, "cpu goalie");
  close(ui.userOffense, 0.9, "user offense");
  close(ui.userDefense, 0.5, "user defense");
  close(ui.userGoalie, 0.25, "user goalie");
  assert.deepEqual(ui.homeLineup, { g: 0, d: 1, o: 2 });
  assert.deepEqual(ui.awayLineup, { g: 1, d: 1, o: 1 });
  assert.deepEqual(ui.liveHome, { g: 0, d: 1, o: 2 });
  assert.deepEqual(ui.liveAway, { g: 1, d: 1, o: 1 });
});

test("setters write the same keys and a new load reads them", async () => {
  const ui = useGame.getState();
  ui.setGameSpeed(0.8);
  ui.setHomeKit(2);
  ui.setAwayKit(2);
  ui.setAwayKit(5);
  ui.setCpuOffense(2);
  ui.setCpuDefense(0);
  ui.setCpuGoalie(1.6);
  ui.setUserOffense(1.2);
  ui.setUserDefense(2);
  ui.setUserGoalie(0);
  ui.setClockMode("roller");
  ui.setHomeLineup({ g: 1, d: 0, o: 2 });
  ui.setAwayLineup({ g: 1, d: 1, o: 2 });

  assert.equal(localStorage.getItem("hfb-game-speed"), "0.8");
  assert.equal(localStorage.getItem("hfb-home-kit"), "2");
  assert.equal(localStorage.getItem("hfb-away-kit"), "5");
  assert.equal(localStorage.getItem("hfb-play-mode"), "roller");
  assert.equal(localStorage.getItem("hfb-cpu-offense"), "2");
  assert.equal(localStorage.getItem("hfb-cpu-defense"), "0");
  assert.equal(localStorage.getItem("hfb-cpu-goalie"), "1.6");
  assert.equal(localStorage.getItem("hfb-user-offense"), "1.2");
  assert.equal(localStorage.getItem("hfb-user-defense"), "2");
  assert.equal(localStorage.getItem("hfb-user-goalie"), "0");
  assert.equal(localStorage.getItem("hfb-home-lineup"), JSON.stringify({ g: 1, d: 0, o: 2 }));
  assert.equal(localStorage.getItem("hfb-away-lineup"), JSON.stringify({ g: 1, d: 1, o: 2 }));

  const again = await loadStore("roundtrip");
  assert.notEqual(again.useGame, useGame);
  const next = again.useGame.getState();
  assert.equal(next.clockMode, "roller");
  assert.equal(next.periodClock, 18 * 60);
  assert.equal(next.gameSpeed, 0.8);
  assert.equal(next.homeKit, 2);
  assert.equal(next.awayKit, 5);
  assert.equal(next.cpuOffense, 2);
  assert.equal(next.cpuDefense, 0);
  assert.equal(next.cpuGoalie, 1.6);
  assert.equal(next.userOffense, 1.2);
  assert.equal(next.userDefense, 2);
  assert.equal(next.userGoalie, 0);
  assert.deepEqual(next.homeLineup, { g: 1, d: 0, o: 2 });
  assert.deepEqual(next.awayLineup, { g: 1, d: 1, o: 2 });
});

test("bad stored values clamp or fall back, and a matching away kit is replaced", async () => {
  seed({
    "hfb-play-mode-v": "2",
    "hfb-play-mode": "nope",
    "hfb-game-speed": "9",
    "hfb-home-kit": "4",
    "hfb-away-kit": "4",
    "hfb-cpu-offense": "nope",
    "hfb-cpu-defense": "-4",
    "hfb-cpu-goalie": "3",
    "hfb-user-offense": "0.63",
    "hfb-user-defense": "abc",
    "hfb-user-goalie": "0.5",
    "hfb-home-lineup": JSON.stringify({ g: 3, d: 9, o: -1 }),
    "hfb-away-lineup": JSON.stringify({ g: 1, d: 2, o: 4 }),
  });
  const bad = await loadStore("bad");
  const ui = bad.useGame.getState();
  assert.equal(ui.clockMode, "game");
  assert.equal(ui.gameSpeed, 1.25);
  assert.equal(ui.homeKit, 4);
  assert.notEqual(ui.awayKit, 4);
  assert.ok(ui.awayKit >= 0 && ui.awayKit < UNIFORMS.length);
  assert.equal(ui.cpuOffense, 1);
  assert.equal(ui.cpuDefense, 0);
  assert.equal(ui.cpuGoalie, 1.6);
  assert.ok(Math.abs(ui.userOffense - 0.66) < 1e-9, `user offense snapped to ${ui.userOffense}`);
  assert.equal(ui.userDefense, 1);
  assert.equal(ui.userGoalie, 0.5);
  assert.deepEqual(ui.homeLineup, { g: 1, d: 2, o: 0 });
  assert.deepEqual(ui.awayLineup, { g: 1, d: 2, o: 3 });
  assert.equal(localStorage.getItem("hfb-away-kit"), "4");
});

test("a scrimmage id before the mode split still loads as roller", async () => {
  seed({ "hfb-play-mode": "scrimmage" });
  const old = await loadStore("migrate");
  assert.equal(old.useGame.getState().clockMode, "roller");
  assert.equal(localStorage.getItem("hfb-play-mode"), "roller");
  assert.equal(localStorage.getItem("hfb-play-mode-v"), "2");
  assert.deepEqual(old.useGame.getState().homeLineup, { g: 1, d: 1, o: 3 });
});

test("a scrimmage id saved after the split loads as scrimmage", async () => {
  seed({
    "hfb-play-mode-v": "2",
    "hfb-play-mode": "scrimmage",
    "hfb-home-lineup": JSON.stringify({ g: 1, d: 2, o: 3 }),
    "hfb-away-lineup": JSON.stringify({ g: 0, d: 2, o: 3 }),
  });
  const mode = await loadStore("scrimmage");
  const ui = mode.useGame.getState();
  assert.equal(ui.clockMode, "scrimmage");
  assert.equal(ui.periodClock, 0);
  assert.equal(localStorage.getItem("hfb-play-mode"), "scrimmage");
  assert.deepEqual(ui.homeLineup, { g: 1, d: 2, o: 3 });
  assert.deepEqual(ui.awayLineup, { g: 0, d: 2, o: 3 });
});

test("missing keys keep the previous defaults", async () => {
  seed({});
  const fresh = await loadStore("empty");
  const ui = fresh.useGame.getState();
  assert.equal(ui.clockMode, "game");
  assert.equal(localStorage.getItem("hfb-play-mode"), null);
  assert.equal(ui.gameSpeed, 0.85);
  assert.equal(ui.homeKit, COL_KIT);
  assert.notEqual(ui.awayKit, ui.homeKit);
  assert.equal(ui.cpuOffense, 1);
  assert.equal(ui.cpuDefense, 1);
  assert.equal(ui.cpuGoalie, 0.8);
  assert.equal(ui.userOffense, 0.6);
  assert.equal(ui.userDefense, 1);
  assert.equal(ui.userGoalie, 0.5);
  assert.deepEqual(ui.homeLineup, { g: 1, d: 2, o: 3 });
  assert.deepEqual(ui.awayLineup, { g: 1, d: 2, o: 3 });
  assert.equal(ui.periodClock, 1200);
});
