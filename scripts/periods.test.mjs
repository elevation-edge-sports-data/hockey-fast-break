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

const { periodEndLive, periodEndLook, resetPlayFrame, resetWorld, stepPlayFrame, stepSim, world } = sim;
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
  ui.setGameSpeed(1);
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
  ui.setGameSpeed(1);
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
  const spots = world.skaters.map((s) => ({ x: s.x, z: s.z }));
  const puck0 = { x: world.puck.x, z: world.puck.z };
  step(45);
  assert.equal(useGame.getState().periodBreak, ended, "banner stays up");
  assert.equal(world.period, ended);
  assert.equal(periodEndLive(), true);
  const moved =
    world.skaters.some((s, i) => Math.hypot(s.x - spots[i].x, s.z - spots[i].z) > 0.05) ||
    Math.hypot(world.puck.x - puck0.x, world.puck.z - puck0.z) > 0.05;
  assert.ok(moved, "players or the puck keep moving through the period break");
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

test("period length is 1 to 5 minutes and defaults to 1", () => {
  mem.set("hfb-game-length", "10");
  mem.set("hfb-game-minutes", "8");
  assert.equal(GAME_MINUTES_MIN, 1);
  assert.equal(GAME_MINUTES_MAX, 5);
  assert.equal(GAME_MINUTES_DEFAULT, 1);
  assert.equal(GAME_PERIODS, 3);
  assert.equal(useGame.getState().gameMinutes, 1);
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
  assert.equal(periodEndCopy(1, 2, 0).title, "END 1ST");
  assert.equal(periodEndCopy(1, 2, 0).score, "YOU 2-0 CPU");
  assert.equal(periodEndCopy(2, 4, 3).title, "END 2ND");
  assert.equal(periodEndCopy(2, 4, 3).score, "YOU 4-3 CPU");
  assert.equal(periodEndCopy(3, 1, 1).title, "END 3RD");
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
    title: "END 1ST",
    score: "YOU 2-1 CPU",
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
  assert.equal(periodEndCopy(useGame.getState().periodBreak, 2, 1).title, "END 2ND");
  assert.equal(periodEndCopy(2, useGame.getState().homeScore, useGame.getState().awayScore).score, "YOU 2-1 CPU");
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
  assert.equal(ROLLER_MINUTES_DEFAULT, 1);
  assert.equal(useGame.getState().rollerMinutes, 1);
  assert.equal(useGame.getState().gameMinutes, 2);
  assert.equal(rollerClockScale(1), 18);
  assert.equal(rollerClockScale(3), 6);
  assert.equal(rollerClockScale(5), 18 / 5);
  assert.equal(clampRollerMinutes(0), 1);
  assert.equal(clampRollerMinutes(9), 5);
  assert.equal(clampRollerMinutes(Number.NaN), 1);

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
    title: "END 1ST",
    score: "YOU 1-0 CPU",
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
  assert.equal(periodEndCopy(useGame.getState().periodBreak, 2, 0).score, "YOU 2-0 CPU");
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
    assert.equal(periodEndLive(), false, mode);
  }
});

test("period end keeps skating and the camera look stays on the user", () => {
  freshGame();
  assert.equal(periodEndLive(), false);
  assert.equal(periodEndLook(), null);

  useGame.getState().setHomeScore(2);
  useGame.getState().setAwayScore(0);
  expirePeriod();
  assert.equal(useGame.getState().periodBreak, 1);
  assert.equal(periodEndLive(), true);

  const user = world.skaters[world.userId];
  user.x = -8;
  user.z = 10;
  user.vx = 5;
  user.vz = -1.2;
  world.puck.owner = null;
  world.puck.x = 12;
  world.puck.z = 8;
  world.puck.y = 0.05;
  world.puck.vx = 7;
  world.puck.vz = 0;
  world.puck.vy = 0;
  const ux = user.x;
  const uz = user.z;
  const px = world.puck.x;
  const look = periodEndLook();
  assert.ok(look);
  assert.equal(look.x, user.x);
  assert.equal(look.z, user.z);
  assert.equal(look.y, 1.05);

  const atk = world.homeAttack > 0 ? 1 : -1;
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.15, 240);
  cam.up.set(atk, 0, 0);
  cam.position.set(look.x - atk * 13.2, 9.4, look.z);
  cam.lookAt(look.x + atk * 1.15, look.y + 0.16, look.z);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const userN = ndc(cam, look.x, look.y, look.z);
  const puckN = ndc(cam, world.puck.x, 0.2, world.puck.z);
  assert.ok(Math.hypot(userN.x, userN.y) < 0.2, `user left the period-end frame ${userN.x.toFixed(2)},${userN.y.toFixed(2)}`);
  assert.ok(
    Math.hypot(puckN.x, puckN.y) > Math.hypot(userN.x, userN.y) + 0.35,
    "period-end frame stayed on the puck",
  );

  const home = useGame.getState().homeScore;
  const away = useGame.getState().awayScore;
  step(1);
  assert.ok(Math.abs(world.puck.x - px) > 0.05, `puck froze at ${world.puck.x}`);
  step(24);
  assert.ok(Math.hypot(user.x - ux, user.z - uz) > 0.2, `user froze dx=${user.x - ux}`);
  assert.equal(useGame.getState().homeScore, home);
  assert.equal(useGame.getState().awayScore, away);
  assert.equal(useGame.getState().periodBreak, 1);
  const followed = periodEndLook();
  assert.equal(followed.x, world.skaters[world.userId].x);
  assert.equal(followed.z, world.skaters[world.userId].z);

  let guard = 0;
  while (useGame.getState().periodBreak > 0 && guard < 400) {
    step(1);
    guard++;
  }
  assert.equal(world.period, 2);
  world.period = 3;
  useGame.getState().setPeriod(3);
  liveClock();
  world.periodClock = 0.01;
  step(1);
  assert.equal(world.periodOver, true);
  assert.equal(periodEndLive(), true);
  const u2 = world.skaters[world.userId];
  u2.x = -8;
  u2.z = 10;
  u2.vx = 5;
  u2.vz = 0;
  world.puck.owner = null;
  world.puck.x = 12;
  world.puck.z = -8;
  world.puck.vx = 6;
  world.puck.vz = 0.4;
  world.puck.vy = 0;
  const x2 = u2.x;
  const p2 = world.puck.x;
  const score = useGame.getState().homeScore;
  step(20);
  assert.equal(world.periodOver, true);
  assert.equal(world.period, 3);
  assert.equal(useGame.getState().homeScore, score);
  assert.ok(Math.abs(u2.x - x2) > 0.15, `final buzzer froze the user at ${u2.x}`);
  assert.ok(Math.abs(world.puck.x - p2) > 0.25, `final buzzer froze the puck at ${world.puck.x}`);
  const finalLook = periodEndLook();
  assert.equal(finalLook.x, world.skaters[world.userId].x);
  assert.equal(finalLook.z, world.skaters[world.userId].z);
  assert.equal(finalLook.y, 1.05);
});

test("the game speed slider does not change the period countdown", () => {
  try {
    const drops = [];
    for (const speed of [0.5, 1, 1.5]) {
      freshGame();
      liveClock();
      resetPlayFrame();
      useGame.getState().setGameMinutes(1);
      useGame.getState().setGameSpeed(speed);
      world.periodClock = 1200;
      useGame.getState().setPeriodClock(1200);
      for (let i = 0; i < 60; i++) stepPlayFrame(DT);
      const drop = 1200 - world.periodClock;
      drops.push(drop);
      assert.equal(world.stoppage, false, `speed ${speed} stopped play`);
      assert.equal(world.faceoff, false, `speed ${speed} faced off`);
      assert.ok(Math.abs(drop - 20) < 0.05, `speed ${speed} dropped ${drop}`);
    }
    assert.ok(Math.abs(drops[0] - drops[1]) < 0.02);
    assert.ok(Math.abs(drops[2] - drops[1]) < 0.02);

    freshRoller();
    liveClock();
    resetPlayFrame();
    useGame.getState().setRollerMinutes(1);
    world.periodClock = 18 * 60;
    for (const speed of [0.5, 1.5]) {
      useGame.getState().setGameSpeed(speed);
      world.periodClock = 18 * 60;
      resetPlayFrame();
      for (let i = 0; i < 60; i++) stepPlayFrame(DT);
      const drop = 18 * 60 - world.periodClock;
      assert.ok(Math.abs(drop - 18) < 0.05, `roller speed ${speed} dropped ${drop}`);
    }
  } finally {
    useGame.getState().setGameSpeed(1);
    resetPlayFrame();
  }
});
