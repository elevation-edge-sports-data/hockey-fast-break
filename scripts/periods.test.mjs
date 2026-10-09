/**
 * Game mode is three 20:00 periods. Real length is 1–5 minutes (default 2)
 * and scales that countdown. Teams switch ends; the attack net stays up-screen.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import * as THREE from "three";

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
after(() => server.close());

const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { resetWorld, stepSim, world } = sim;
const {
  useGame,
  GAME_MINUTES_DEFAULT,
  GAME_MINUTES_MIN,
  GAME_MINUTES_MAX,
  GAME_PERIODS,
  gameClockScale,
  clampGameMinutes,
  periodOrdinal,
  periodEndCopy,
  ROLLER_MINUTES_DEFAULT,
  ROLLER_PERIODS,
  ROLLER_CLOCK_DISPLAY_MINUTES,
  rollerClockScale,
  clampRollerMinutes,
} = store;
const { GOAL_LINE_X } = rink;

const DT = 1 / 60;

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function freshRoller() {
  const ui = useGame.getState();
  ui.setPaused(false);
  ui.setPlaying(true);
  ui.setClockMode("roller");
  ui.setRollerMinutes(3);
  resetWorld();
  world.replay = false;
  world.lineBrawl = null;
  world.periodOver = false;
}

function freshGame() {
  const ui = useGame.getState();
  ui.setPaused(false);
  ui.setPlaying(true);
  ui.setClockMode("game");
  ui.setGameMinutes(2);
  resetWorld();
  world.replay = false;
  world.lineBrawl = null;
  world.periodOver = false;
}

function liveClock() {
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.replay = false;
  world.lineBrawl = null;
  world.periodOver = false;
  useGame.getState().setPlaying(true);
  useGame.getState().setPaused(false);
  useGame.getState().setPeriodOver(false);
}

function expirePeriod() {
  liveClock();
  world.periodClock = 0.01;
  step(1);
}

function drainPeriodBreak() {
  const ended = useGame.getState().periodBreak;
  assert.ok(ended > 0, "end-of-period banner");
  assert.equal(world.period, ended);
  assert.equal(world.faceoff, false);
  assert.equal(world.periodOver, false);
  const x = world.skaters[world.userId]?.x;
  step(45);
  assert.equal(useGame.getState().periodBreak, ended, "banner stays up");
  assert.equal(world.period, ended);
  if (x !== undefined) assert.equal(world.skaters[world.userId].x, x);
  let guard = 0;
  while (useGame.getState().periodBreak > 0 && guard < 400) {
    step(1);
    guard++;
  }
  assert.equal(useGame.getState().periodBreak, 0);
  assert.equal(world.periodEndT, 0);
}

function headingX(yaw) {
  return -Math.sin(yaw);
}

function classicCam(attack) {
  const atk = attack > 0 ? 1 : -1;
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.15, 240);
  cam.up.set(atk, 0, 0);
  cam.position.set(-atk * 13.2, 9.4, 0);
  cam.lookAt(0, 0.55, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

function highCam(attack) {
  const atk = attack > 0 ? 1 : -1;
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.15, 240);
  cam.up.set(atk, 0, 0);
  cam.position.set(0, 32, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

function ndc(cam, x, y, z) {
  return new THREE.Vector3(x, y, z).project(cam);
}

function assertAttackNetOnTop(attack) {
  for (const cam of [classicCam(attack), highCam(attack)]) {
    const atk = attack > 0 ? 1 : -1;
    const net = ndc(cam, atk * GOAL_LINE_X, 1.1, 0);
    const own = ndc(cam, -atk * GOAL_LINE_X, 1.1, 0);
    assert.ok(net.z < 1, `attack net behind camera z=${net.z}`);
    assert.ok(net.y > 0.2, `attack net not at the top y=${net.y.toFixed(3)}`);
    if (own.z <= 1) assert.ok(own.y < net.y, `defend net above the attack net`);
  }
  const s = world.skaters[world.userId];
  const fx = headingX(s.yaw);
  assert.ok(fx * attack > 0.9, `user faces ${fx} while attack is ${attack}`);
  assert.ok(s.x * attack < 0, `user x ${s.x} is not on the defensive side of attack ${attack}`);
  const cam = classicCam(attack);
  const feet = ndc(cam, s.x, 1, s.z);
  const ahead = ndc(cam, s.x + fx * 4, 1, s.z);
  assert.ok(ahead.y > feet.y + 0.02, `user faces down-screen ahead=${ahead.y.toFixed(3)} feet=${feet.y.toFixed(3)}`);
  const homeG = world.skaters.find((p) => p.side === "home" && p.kind === "goalie");
  const awayG = world.skaters.find((p) => p.side === "away" && p.kind === "goalie");
  assert.ok(homeG && homeG.x * attack < 0, "home goalie did not switch ends");
  assert.ok(awayG && awayG.x * attack > 0, "away goalie did not switch ends");
}

test("period length is 1 to 5 minutes and defaults to 2", () => {
  mem.set("hfb-game-length", "10");
  mem.set("hfb-game-minutes", "8");
  assert.equal(GAME_MINUTES_MIN, 1);
  assert.equal(GAME_MINUTES_MAX, 5);
  assert.equal(GAME_MINUTES_DEFAULT, 2);
  assert.equal(GAME_PERIODS, 3);
  assert.equal(useGame.getState().gameMinutes, 2);
  assert.equal(clampGameMinutes(0), 1);
  assert.equal(clampGameMinutes(1.4), 1);
  assert.equal(clampGameMinutes(5), 5);
  assert.equal(clampGameMinutes(9), 5);
  assert.equal(gameClockScale(1), 20);
  assert.equal(gameClockScale(2), 10);
  assert.equal(gameClockScale(4), 5);
  assert.equal(gameClockScale(5), 4);
  assert.ok(Math.abs(gameClockScale(3) - 20 / 3) < 1e-9);
  assert.equal(periodOrdinal(1), "1st");
  assert.equal(periodOrdinal(2), "2nd");
  assert.equal(periodOrdinal(3), "3rd");
  assert.equal(periodEndCopy(1, 2, 0).title, "end 1st");
  assert.equal(periodEndCopy(1, 2, 0).score, "You 2 - 0 CPU");
  assert.equal(periodEndCopy(2, 4, 3).title, "end 2nd");
  assert.equal(periodEndCopy(2, 4, 3).score, "You 4 - 3 CPU");
});

test("the 20:00 clock scales with the real period length", () => {
  freshGame();
  liveClock();
  world.periodClock = 1200;
  useGame.getState().setPeriodClock(1200);
  useGame.getState().setGameMinutes(2);
  step(60);
  assert.ok(Math.abs(world.periodClock - 1190) < 0.05, `2 min scale dropped to ${world.periodClock}`);
  assert.equal(useGame.getState().periodClock, Math.floor(world.periodClock));

  world.periodClock = 1200;
  useGame.getState().setGameMinutes(1);
  step(60);
  assert.ok(Math.abs(world.periodClock - 1180) < 0.02, `1 min scale dropped to ${world.periodClock}`);

  world.periodClock = 1200;
  useGame.getState().setGameMinutes(5);
  step(60);
  assert.ok(Math.abs(world.periodClock - 1196) < 0.02, `5 min scale dropped to ${world.periodClock}`);
  assert.equal(world.period, 1);
  assert.equal(world.homeAttack, 1);
});

test("three periods switch ends and keep the attack net at the top", () => {
  freshGame();
  useGame.getState().setHomeScore(2);
  useGame.getState().setAwayScore(1);
  assert.equal(world.period, 1);
  assert.equal(world.homeAttack, 1);
  assertAttackNetOnTop(1);

  const view1 = world.periodView;
  expirePeriod();
  assert.equal(useGame.getState().periodBreak, 1);
  assert.deepEqual(periodEndCopy(1, useGame.getState().homeScore, useGame.getState().awayScore), {
    title: "end 1st",
    score: "You 2 - 1 CPU",
  });
  assert.equal(world.homeAttack, 1);
  drainPeriodBreak();
  assert.equal(world.period, 2);
  assert.equal(useGame.getState().period, 2);
  assert.equal(world.homeAttack, -1);
  assert.ok(world.periodView > view1);
  assert.equal(world.periodOver, false);
  assert.equal(useGame.getState().periodOver, false);
  assert.equal(world.periodClock, 1200);
  assert.equal(useGame.getState().periodClock, 1200);
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);
  assert.equal(world.faceoff, true);
  assert.equal(useGame.getState().homeScore, 2);
  assert.equal(useGame.getState().awayScore, 1);
  assertAttackNetOnTop(-1);

  const held = world.periodClock;
  const view2 = world.periodView;
  step(30);
  assert.equal(world.periodClock, held);
  assert.equal(world.homeAttack, -1);
  resetWorld({ keepScore: true });
  assert.equal(world.period, 2);
  assert.equal(world.homeAttack, -1);
  assert.equal(world.periodView, view2);
  assert.equal(useGame.getState().homeScore, 2);

  expirePeriod();
  assert.equal(useGame.getState().periodBreak, 2);
  assert.equal(periodEndCopy(useGame.getState().periodBreak, 2, 1).title, "end 2nd");
  assert.equal(periodEndCopy(2, useGame.getState().homeScore, useGame.getState().awayScore).score, "You 2 - 1 CPU");
  drainPeriodBreak();
  assert.equal(world.period, 3);
  assert.equal(useGame.getState().period, 3);
  assert.equal(world.homeAttack, 1);
  assert.equal(world.periodOver, false);
  assert.equal(world.periodClock, 1200);
  assertAttackNetOnTop(1);

  expirePeriod();
  assert.equal(useGame.getState().periodBreak, 0);
  assert.equal(world.periodEndT, 0);
  assert.equal(world.period, 3);
  assert.equal(useGame.getState().period, 3);
  assert.equal(world.periodOver, true);
  assert.equal(useGame.getState().periodOver, true);
  assert.equal(useGame.getState().periodClock, 0);
  assert.equal(world.homeAttack, 1);
  assert.equal(useGame.getState().homeScore, 2);
  assert.equal(useGame.getState().awayScore, 1);

  resetWorld();
  assert.equal(world.period, 1);
  assert.equal(useGame.getState().period, 1);
  assert.equal(world.homeAttack, 1);
  assert.equal(world.periodOver, false);
  assert.equal(world.periodClock, 1200);
  assert.equal(useGame.getState().homeScore, 0);
});

test("roller is two 18:00 periods and switches ends after the first", () => {
  assert.equal(ROLLER_PERIODS, 2);
  assert.equal(ROLLER_CLOCK_DISPLAY_MINUTES, 18);
  assert.equal(ROLLER_MINUTES_DEFAULT, 3);
  assert.equal(useGame.getState().rollerMinutes, 3);
  assert.equal(useGame.getState().gameMinutes, 2);
  assert.equal(rollerClockScale(1), 18);
  assert.equal(rollerClockScale(3), 6);
  assert.equal(rollerClockScale(5), 18 / 5);
  assert.equal(clampRollerMinutes(0), 1);
  assert.equal(clampRollerMinutes(9), 5);
  assert.equal(clampRollerMinutes(Number.NaN), 3);

  freshRoller();
  assert.equal(world.period, 1);
  assert.equal(world.homeAttack, 1);
  assert.equal(world.periodClock, 18 * 60);
  assertAttackNetOnTop(1);
  liveClock();
  world.periodClock = 18 * 60;
  step(60);
  assert.ok(Math.abs(world.periodClock - (18 * 60 - 6)) < 0.05, `3 min scale dropped to ${world.periodClock}`);

  world.periodClock = 18 * 60;
  useGame.getState().setRollerMinutes(1);
  step(60);
  assert.ok(Math.abs(world.periodClock - (18 * 60 - 18)) < 0.05, `1 min scale dropped to ${world.periodClock}`);

  world.periodClock = 18 * 60;
  useGame.getState().setRollerMinutes(5);
  step(60);
  assert.ok(Math.abs(world.periodClock - (18 * 60 - 3.6)) < 0.05, `5 min scale dropped to ${world.periodClock}`);
  assert.equal(useGame.getState().gameMinutes, 2);

  useGame.getState().setHomeScore(1);
  useGame.getState().setAwayScore(0);
  expirePeriod();
  assert.equal(useGame.getState().periodBreak, 1);
  assert.deepEqual(periodEndCopy(1, useGame.getState().homeScore, useGame.getState().awayScore), {
    title: "end 1st",
    score: "You 1 - 0 CPU",
  });
  assert.equal(world.homeAttack, 1);
  drainPeriodBreak();
  assert.equal(world.period, 2);
  assert.equal(useGame.getState().period, 2);
  assert.equal(world.homeAttack, -1);
  assert.equal(world.periodOver, false);
  assert.equal(world.periodClock, 18 * 60);
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);
  assert.equal(world.faceoff, true);
  assert.equal(useGame.getState().homeScore, 1);
  assertAttackNetOnTop(-1);

  const held = world.periodClock;
  const view = world.periodView;
  step(30);
  assert.equal(world.periodClock, held);
  resetWorld({ keepScore: true });
  assert.equal(world.period, 2);
  assert.equal(world.homeAttack, -1);
  assert.equal(world.periodView, view);

  expirePeriod();
  assert.equal(useGame.getState().periodBreak, 0);
  assert.equal(world.periodEndT, 0);
  assert.equal(world.period, 2);
  assert.equal(world.periodOver, true);
  assert.equal(useGame.getState().periodOver, true);
  assert.equal(useGame.getState().periodClock, 0);
  assert.equal(world.homeAttack, -1);
  assert.equal(useGame.getState().homeScore, 1);

  resetWorld();
  assert.equal(world.period, 1);
  assert.equal(world.homeAttack, 1);
  assert.equal(world.periodClock, 18 * 60);
  assert.equal(world.periodOver, false);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().periodBreak, 0);
});

test("end-of-period banner stays on game and roller, and pause or reset holds it", () => {
  freshGame();
  useGame.getState().setHomeScore(2);
  useGame.getState().setAwayScore(0);
  expirePeriod();
  assert.equal(periodEndCopy(useGame.getState().periodBreak, 2, 0).score, "You 2 - 0 CPU");
  useGame.getState().setPaused(true);
  step(180);
  assert.equal(useGame.getState().periodBreak, 1);
  assert.equal(world.period, 1);
  assert.ok(world.periodEndT > 2);
  useGame.getState().setPaused(false);
  resetWorld();
  assert.equal(useGame.getState().periodBreak, 0);
  assert.equal(world.periodEndT, 0);
  assert.equal(world.period, 1);

  for (const mode of ["practice", "scrimmage", "drill"]) {
    useGame.getState().setClockMode(mode);
    useGame.getState().setPaused(false);
    useGame.getState().setPlaying(true);
    resetWorld();
    liveClock();
    world.period = 1;
    world.periodClock = 0.01;
    step(8);
    assert.equal(useGame.getState().periodBreak, 0, mode);
  }
});
