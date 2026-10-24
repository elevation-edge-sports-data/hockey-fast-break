/**
 * How long an away CPU team takes to knock down every home target in 0v6 scrimmage.
 * Home is empty. Away is 0G/2D/4F, six skaters. Game speed and the CPU sliders
 * are at maximum. Shots use the normal scrimmage CPU release: the usual shot
 * choice, CPU_SHOT_ERR, and launchShotAtNet. Nothing aims them at a chosen cell.
 * Target count is 4, 8, 12, or 16. Default is 4.
 *
 * Run:
 *   node scripts/cpu-scrimmage-clear.test.mjs
 *   node scripts/cpu-scrimmage-clear.test.mjs 8
 *   node scripts/cpu-scrimmage-clear.test.mjs 12
 *   node scripts/cpu-scrimmage-clear.test.mjs 16
 *   CPU_SCRIMMAGE_TARGETS=16 node scripts/cpu-scrimmage-clear.test.mjs
 *
 * Watch the same 0v6 clear in the game. The camera follows the puck, turned
 * 180° so the CPU attacking net is at the top. A scored target does not wait
 * out the goal whistle.
 *   ?cpuScrimmage=4
 *   ?cpuScrimmage=8
 *   ?cpuScrimmage=16
 *
 * Faceoffs reset the in-game clock, so the clear time is the sum of sim steps.
 *
 * The CPU prefers standing targets, especially the top shelf, and can still miss.
 *
 * Example (seed 1):
 *   0v6 scrimmage, 4 targets
 *   cleared in 19.800 s sim, 5 shots, 4 hits
 *   0v6 scrimmage, 16 targets
 *   cleared in 95.233 s sim, 23 shots, 16 hits
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const TARGET_CHOICES = [4, 8, 12, 16];

function failTargets(raw) {
  console.error(`scrimmage target count must be 4, 8, 12, or 16 (got ${raw})`);
  process.exit(1);
}

function parseCount(raw) {
  const n = Number(raw);
  if (!TARGET_CHOICES.includes(n) || String(n) !== String(raw)) failTargets(raw);
  return n;
}

function readTargets() {
  const argv = process.argv.slice(1);
  const script = fileURLToPath(import.meta.url);
  const at = argv.findIndex((a) => a === script || a.endsWith("cpu-scrimmage-clear.test.mjs"));
  const positionals = (at >= 0 ? argv.slice(at + 1) : []).filter((a) => a !== "--" && !a.startsWith("-"));
  if (positionals.length > 1) failTargets(positionals.join(" "));
  if (positionals.length === 1) return parseCount(positionals[0]);
  const env = process.env.CPU_SCRIMMAGE_TARGETS;
  if (env !== undefined && env !== "") return parseCount(env);
  return 4;
}

const TARGETS = readTargets();

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
if (typeof globalThis.navigator?.getGamepads !== "function") {
  Object.defineProperty(globalThis.navigator, "getGamepads", {
    configurable: true,
    value: () => [],
  });
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
const realRandom = Math.random;
after(() => {
  Math.random = realRandom;
  return server.close();
});

const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const input = await server.ssrLoadModule("/src/game/input.ts");

const { resetWorld, stepSim, world } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;

const DT = 1 / 60;
const SEED = 1;
const TIMEOUT_S = 300;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boot() {
  Math.random = mulberry32(SEED);
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("scrimmage");
  ui.setHomeLineup({ g: 0, d: 0, o: 0 });
  ui.setAwayLineup({ g: 0, d: 2, o: 4 });
  ui.setScrimmageHomeTargets(TARGETS);
  ui.setScrimmageAwayTargets(TARGETS);
  ui.setGameSpeed(1.25);
  ui.setCpuOffense(2);
  ui.setCpuDefense(2);
  ui.setCpuGoalie(1.6);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setOffsides(false);
  resetWorld();
  const st = useGame.getState();
  assert.equal(st.clockMode, "scrimmage");
  assert.equal(st.gameSpeed, 1.25);
  assert.equal(st.cpuOffense, 2);
  assert.equal(st.cpuDefense, 2);
  assert.equal(st.cpuGoalie, 1.6);
  assert.equal(st.scrimmageHomeTargets, TARGETS);
  assert.equal(
    world.skaters.filter((s) => s.side === "home").length,
    0,
  );
  assert.equal(
    world.skaters.filter((s) => s.side === "away").length,
    6,
  );
}

function homeHits() {
  return world.scrimmageHomeGone.filter(Boolean).length;
}

function clearBoard() {
  boot();
  let shots = 0;
  let seenShoot = world.lastShoot;
  const wall0 = performance.now();
  const maxSteps = Math.ceil(TIMEOUT_S / DT);
  let steps = 0;
  while (steps < maxSteps && homeHits() < TARGETS && !world.periodOver) {
    stepSim(DT);
    steps += 1;
    if (world.lastShoot !== seenShoot) {
      const who = world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
      if (world.lastShoot >= 0 && who && who.side === "away") shots += 1;
      seenShoot = world.lastShoot;
    }
  }
  return {
    sim: steps * DT,
    wall: (performance.now() - wall0) / 1000,
    shots,
    hits: homeHits(),
    cleared: homeHits() >= TARGETS,
  };
}

test(`away CPU clears ${TARGETS} home targets in 0v6 scrimmage`, () => {
  const run = clearBoard();
  assert.ok(
    run.cleared,
    `timed out after ${run.sim.toFixed(2)} s with ${run.hits}/${TARGETS} targets down and ${run.shots} shots`,
  );
  assert.ok(run.sim > 0 && run.sim < TIMEOUT_S);
  assert.equal(run.hits, TARGETS);
  console.log(`0v6 scrimmage, ${TARGETS} targets, seed ${SEED}`);
  console.log(
    `cleared in ${run.sim.toFixed(3)} s sim, ${run.wall.toFixed(3)} s wall, ${run.shots} shots, ${run.hits} hits`,
  );
  Math.random = realRandom;
});
