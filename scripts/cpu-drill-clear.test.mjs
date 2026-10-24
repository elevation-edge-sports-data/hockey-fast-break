/**
 * CPU shooting accuracy from three held spots in drill mode.
 * One away forward, game speed and the CPU sliders at maximum.
 * The 60s drill clock is ignored. Each spot fires a fixed sample as soon as
 * the puck is back. Shots use the real release: target choice, CPU_SHOT_ERR,
 * and launchShotAtNet. A fixed seed makes the counts repeatable.
 * Boards are the game's 4, 8, 12, and 16 target layouts. Default is 4.
 * Accuracy is target hits / attempts. On net counts a puck that crosses the
 * mouth, including a gap that is not a target cell.
 *
 * Run:
 *   node scripts/cpu-drill-clear.test.mjs
 *   node scripts/cpu-drill-clear.test.mjs 8
 *   node scripts/cpu-drill-clear.test.mjs 12
 *   node scripts/cpu-drill-clear.test.mjs 16
 *   CPU_DRILL_TARGETS=16 node scripts/cpu-drill-clear.test.mjs
 *
 * Watch the same shooter in the game. No home skater. Targets fall and a full clear ends the drill.
 *   ?cpuDrill=4
 *   ?cpuDrill=16&cpuDrillSpot=blue
 *   ?cpuDrill=8&cpuDrillSpot=center
 * spot is dot (attacking faceoff dot), blue, or center. Default is dot.
 *
 * Example:
 *   4-target board, 20 shots each, seed 1, shooter held stationary
 *   attacking faceoff dot (+z)  (21.031, 6.706)  6.096 m from the goal line, 9.062 m to board center, 47.7° off center
 *     20 attempted, 18 hit a target (90.0%), 18 on net (90.0%)
 *   attacking blue line  (7.620, 0.000)  19.507 m from the goal line, 19.507 m to board center, 0.0° off center
 *     20 attempted, 15 hit a target (75.0%), 17 on net (85.0%)
 *   center ice  (0.000, 0.000)  27.127 m from the goal line, 27.127 m to board center, 0.0° off center
 *     20 attempted, 15 hit a target (75.0%), 17 on net (85.0%)
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const TARGET_CHOICES = [4, 8, 12, 16];

function failTargets(raw) {
  console.error(`drill target count must be 4, 8, 12, or 16 (got ${raw})`);
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
  const at = argv.findIndex((a) => a === script || a.endsWith("cpu-drill-clear.test.mjs"));
  const positionals = (at >= 0 ? argv.slice(at + 1) : []).filter((a) => a !== "--" && !a.startsWith("-"));
  if (positionals.length > 1) failTargets(positionals.join(" "));
  if (positionals.length === 1) return parseCount(positionals[0]);
  const env = process.env.CPU_DRILL_TARGETS;
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
after(() => {
  Math.random = realRandom;
  return server.close();
});

const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const input = await server.ssrLoadModule("/src/game/input.ts");
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { resetWorld, stepSim, world, setCpuDrillProbe, setCpuDrillSpot, resetCpuDrillAccuracy, cpuDrillAccuracy } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;
const { GOAL_LINE_X, BLUE_X, FACEOFF_EZ_X, FACEOFF_SPOT_Z } = rink;

const DT = 1 / 60;
const SEED = 1;
const SHOTS = 20;
const TIMEOUT_S = 60;
const realRandom = Math.random;

const SPOTS = [
  { name: "attacking faceoff dot (+z)", x: FACEOFF_EZ_X, z: FACEOFF_SPOT_Z },
  { name: "attacking blue line", x: BLUE_X, z: 0 },
  { name: "center ice", x: 0, z: 0 },
];

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
  ui.setClockMode("drill");
  ui.setDrillTargets(TARGETS);
  ui.setHomeLineup({ g: 0, d: 0, o: 1 });
  ui.setAwayLineup({ g: 0, d: 0, o: 1 });
  ui.setGameSpeed(1.25);
  ui.setCpuOffense(2);
  ui.setCpuDefense(2);
  ui.setCpuGoalie(1.6);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setOffsides(false);
  setCpuDrillProbe(true);
  resetWorld();
  const st = useGame.getState();
  assert.equal(st.clockMode, "drill");
  assert.equal(st.gameSpeed, 1.25);
  assert.equal(st.cpuOffense, 2);
  assert.equal(st.cpuDefense, 2);
  assert.equal(st.cpuGoalie, 1.6);
  assert.equal(st.drillTargets, TARGETS);
  assert.equal(
    world.skaters.filter((s) => s.side === "away" && s.kind !== "goalie").length,
    1,
  );
}

function cpuShooter() {
  return world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
}

function sampleSpot(spot) {
  boot();
  setCpuDrillSpot(spot.x, spot.z);
  resetCpuDrillAccuracy();
  const cpu = cpuShooter();
  assert.ok(cpu);
  let shots = 0;
  let seenShoot = world.lastShoot;
  let drift = 0;
  const maxSteps = Math.ceil(TIMEOUT_S / DT);
  let steps = 0;
  while (shots < SHOTS && steps < maxSteps) {
    stepSim(DT);
    steps += 1;
    if (world.lastShoot > seenShoot && world.lastShooter === cpu.id) {
      shots += 1;
      seenShoot = world.lastShoot;
      drift = Math.max(drift, Math.hypot(cpu.x - spot.x, cpu.z - spot.z));
    }
  }
  const marks = cpuDrillAccuracy();
  const goalLine = Math.abs(GOAL_LINE_X - spot.x);
  const toBoard = Math.hypot(GOAL_LINE_X - spot.x, spot.z);
  const angle = (Math.atan2(spot.z, GOAL_LINE_X - spot.x) * 180) / Math.PI;
  return {
    name: spot.name,
    x: spot.x,
    z: spot.z,
    shots,
    hits: marks.targetHits,
    onNet: marks.onNet,
    goalLine,
    toBoard,
    angle,
    held: drift < 0.05,
    clock: world.periodClock,
  };
}

function pct(n, d) {
  return d > 0 ? ((100 * n) / d).toFixed(1) : "0.0";
}

function report(rows) {
  console.log(`${TARGETS}-target board, ${SHOTS} shots each, seed ${SEED}, shooter held stationary`);
  for (const row of rows) {
    console.log(
      `${row.name}  (${row.x.toFixed(3)}, ${row.z.toFixed(3)})  ${row.goalLine.toFixed(3)} m from the goal line, ${row.toBoard.toFixed(3)} m to board center, ${row.angle.toFixed(1)}° off center`,
    );
    console.log(
      `  ${row.shots} attempted, ${row.hits} hit a target (${pct(row.hits, row.shots)}%), ${row.onNet} on net (${pct(row.onNet, row.shots)}%)`,
    );
  }
}

function sameSample(a, b) {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(b[i].shots, a[i].shots);
    assert.equal(b[i].hits, a[i].hits);
    assert.equal(b[i].onNet, a[i].onNet);
    assert.equal(b[i].held, a[i].held);
  }
}

test(`CPU shot accuracy from three spots on ${TARGETS} targets`, () => {
  const first = SPOTS.map(sampleSpot);
  for (const row of first) {
    assert.equal(row.shots, SHOTS, `${row.name} did not finish ${SHOTS} shots`);
    assert.ok(row.held, `${row.name} did not stay on its spot`);
    assert.ok(row.hits <= row.onNet && row.onNet <= row.shots);
    assert.ok(row.clock > 50, "the 60s drill clock should stay up");
  }
  const second = SPOTS.map(sampleSpot);
  sameSample(first, second);
  report(first);
  Math.random = realRandom;
  setCpuDrillProbe(false);
});
