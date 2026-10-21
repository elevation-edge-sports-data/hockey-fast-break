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
const input = await server.ssrLoadModule("/src/game/input.ts");

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
const { GOAL_LINE_X, BLUE_X } = rink;
const { setInjectedKeys } = input;

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
  const coast = world.skaters[world.userId];
  coast.vx = 4;
  coast.vz = -0.6;
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
  assert.equal(periodOrdinal(4), "OT");
  assert.equal(periodOrdinal(5), "2OT");
  assert.equal(periodOrdinal(6), "3OT");
  assert.equal(periodOrdinal(7), "4OT");
  assert.equal(periodEndCopy(1, 2, 0).title, "END 1ST");
  assert.equal(periodEndCopy(1, 2, 0).score, "YOU 2-0 CPU");
  assert.equal(periodEndCopy(2, 4, 3).title, "END 2ND");
  assert.equal(periodEndCopy(2, 4, 3).score, "YOU 4-3 CPU");
  assert.equal(periodEndCopy(3, 1, 1).title, "END 3RD");
  assert.equal(periodEndCopy(4, 1, 1).title, "END OT");
  assert.equal(periodEndCopy(4, 1, 1).score, "YOU 1-1 CPU");
  assert.equal(periodEndCopy(5, 2, 2).title, "END 2OT");
  assert.equal(periodEndCopy(6, 3, 3).title, "END 3OT");
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
  assert.equal(world.homeAttack, -1);
});

test("three periods switch ends and keep the attack net at the top", () => {
  freshGame();
  useGame.getState().setHomeScore(2);
  useGame.getState().setAwayScore(1);
  assert.equal(world.period, 1);
  assert.equal(world.homeAttack, -1);
  assertAttackNetOnTop(-1);

  const view1 = world.periodView;
  expirePeriod();
  assert.equal(useGame.getState().periodBreak, 1);
  assert.deepEqual(periodEndCopy(1, useGame.getState().homeScore, useGame.getState().awayScore), {
    title: "END 1ST",
    score: "YOU 2-1 CPU",
  });
  assert.equal(world.homeAttack, -1);
  drainPeriodBreak();
  assert.equal(world.period, 2);
  assert.equal(useGame.getState().period, 2);
  assert.equal(world.homeAttack, 1);
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
  assertAttackNetOnTop(1);

  const held = world.periodClock;
  const view2 = world.periodView;
  step(30);
  assert.equal(world.periodClock, held);
  assert.equal(world.homeAttack, 1);
  resetWorld({ keepScore: true });
  assert.equal(world.period, 2);
  assert.equal(world.homeAttack, 1);
  assert.equal(world.periodView, view2);
  assert.equal(useGame.getState().homeScore, 2);

  expirePeriod();
  assert.equal(useGame.getState().periodBreak, 2);
  assert.equal(periodEndCopy(useGame.getState().periodBreak, 2, 1).title, "END 2ND");
  assert.equal(periodEndCopy(2, useGame.getState().homeScore, useGame.getState().awayScore).score, "YOU 2-1 CPU");
  drainPeriodBreak();
  assert.equal(world.period, 3);
  assert.equal(useGame.getState().period, 3);
  assert.equal(world.homeAttack, -1);
  assert.equal(world.periodOver, false);
  assert.equal(world.periodClock, 1200);
  assertAttackNetOnTop(-1);

  expirePeriod();
  assert.equal(useGame.getState().periodBreak, 0);
  assert.equal(world.periodEndT, 0);
  assert.equal(world.period, 3);
  assert.equal(useGame.getState().period, 3);
  assert.equal(world.periodOver, true);
  assert.equal(useGame.getState().periodOver, true);
  assert.equal(useGame.getState().periodClock, 0);
  assert.equal(world.homeAttack, -1);
  assert.equal(useGame.getState().homeScore, 2);
  assert.equal(useGame.getState().awayScore, 1);

  resetWorld();
  assert.equal(world.period, 1);
  assert.equal(useGame.getState().period, 1);
  assert.equal(world.homeAttack, -1);
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
  assert.equal(world.homeAttack, -1);
  assert.equal(world.periodClock, 18 * 60);
  assertAttackNetOnTop(-1);
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
  assert.equal(world.homeAttack, -1);
  drainPeriodBreak();
  assert.equal(world.period, 2);
  assert.equal(useGame.getState().period, 2);
  assert.equal(world.homeAttack, 1);
  assert.equal(world.periodOver, false);
  assert.equal(world.periodClock, 18 * 60);
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);
  assert.equal(world.faceoff, true);
  assert.equal(useGame.getState().homeScore, 1);
  assertAttackNetOnTop(1);

  const held = world.periodClock;
  const view = world.periodView;
  step(30);
  assert.equal(world.periodClock, held);
  resetWorld({ keepScore: true });
  assert.equal(world.period, 2);
  assert.equal(world.homeAttack, 1);
  assert.equal(world.periodView, view);

  expirePeriod();
  assert.equal(useGame.getState().periodBreak, 0);
  assert.equal(world.periodEndT, 0);
  assert.equal(world.period, 2);
  assert.equal(world.periodOver, true);
  assert.equal(useGame.getState().periodOver, true);
  assert.equal(useGame.getState().periodClock, 0);
  assert.equal(world.homeAttack, 1);
  assert.equal(useGame.getState().homeScore, 1);

  resetWorld();
  assert.equal(world.period, 1);
  assert.equal(world.homeAttack, -1);
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

test("period end keeps skating and the camera look stays on center ice", () => {
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
  assert.equal(look.x, 0);
  assert.equal(look.z, 0);
  assert.equal(look.y, 0.55);
  assert.ok(Math.hypot(look.x - user.x, look.z - user.z) > 8);
  assert.ok(Math.hypot(look.x - world.puck.x, look.z - world.puck.z) > 8);

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
  assert.equal(followed.x, 0);
  assert.equal(followed.z, 0);
  assert.equal(followed.y, 0.55);

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
  assert.equal(finalLook.x, 0);
  assert.equal(finalLook.z, 0);
  assert.equal(finalLook.y, 0.55);
  assert.equal(useGame.getState().paused, false);
});

test("period end suspends chasing, possession, and zone holds", () => {
  freshGame();
  useGame.getState().setOffsides(true);
  expirePeriod();
  assert.equal(periodEndLive(), true);
  assert.equal(world.periodOver, false);

  const cpu = world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
  const chaser = world.skaters.find(
    (s) => s.side === "home" && s.kind === "winger" && s.id !== world.userId,
  );
  const defender = world.skaters.find(
    (s) => s.side === "home" && s.kind === "defense" && s.id !== world.userId,
  );
  const goalie = world.skaters.find((s) => s.side === "home" && s.kind === "goalie");
  assert.ok(cpu && chaser && defender && goalie);

  cpu.x = 6;
  cpu.z = 3;
  cpu.vx = 3.2;
  cpu.vz = 0;
  cpu.stun = 0;
  cpu.struck = 0;
  cpu.dive = 0;
  cpu.yaw = -Math.PI / 2;
  chaser.x = -16;
  chaser.z = -8;
  chaser.vx = -2.5;
  chaser.vz = 0;
  chaser.stun = 0;
  chaser.struck = 0;
  chaser.dive = 0;
  defender.x = -(BLUE_X - 0.35 + 1.1);
  defender.z = 11;
  defender.vx = 0;
  defender.vz = 0;
  defender.stun = 0;
  defender.struck = 0;
  goalie.vx = 0;
  goalie.vz = 0;
  world.puck.owner = null;
  world.puck.x = cpu.x + 0.12;
  world.puck.z = cpu.z;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  const cpuX = cpu.x;
  const chaseX = chaser.x;
  const defX = defender.x;
  const goalieX = goalie.x;
  step(2);
  assert.equal(world.puck.owner, null, "period break picked up the puck");
  step(40);
  assert.equal(world.puck.owner, null, "period break gained possession");
  assert.ok(cpu.x > cpuX + 0.2, `skater with the loose puck froze at ${cpu.x}`);
  assert.ok(chaser.x < chaseX - 0.15, `forecheck turned toward the puck at ${chaser.x}`);
  assert.ok(Math.abs(defender.x - defX) < 0.45, `zone hold moved the defender by ${defender.x - defX}`);
  assert.ok(Math.abs(goalie.x - goalieX) < 0.45, `goalie chased during the break to ${goalie.x}`);
  assert.equal(useGame.getState().periodBreak, 1);
  assert.equal(world.whistle, null);

  let guard = 0;
  while (useGame.getState().periodBreak > 0 && guard < 400) {
    step(1);
    guard++;
  }
  assert.equal(world.period, 2);
  assert.equal(world.faceoff, true);
  assert.equal(world.periodOver, false);
  assert.equal(periodEndLive(), false);

  useGame.getState().setHomeScore(1);
  useGame.getState().setAwayScore(0);
  world.period = 3;
  useGame.getState().setPeriod(3);
  liveClock();
  world.periodClock = 0.01;
  step(1);
  assert.equal(world.periodOver, true);
  assert.equal(periodEndLive(), true);
  const cpu2 = world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
  cpu2.x = -4;
  cpu2.z = -2;
  cpu2.vx = -3;
  cpu2.vz = 0.4;
  cpu2.stun = 0;
  cpu2.struck = 0;
  cpu2.dive = 0;
  world.puck.owner = null;
  world.puck.x = cpu2.x + 0.1;
  world.puck.z = cpu2.z;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  const x2 = cpu2.x;
  const score = useGame.getState().homeScore;
  step(8);
  assert.equal(world.puck.owner, null, "final buzzer picked up the puck");
  assert.ok(cpu2.x < x2 - 0.1, `final buzzer froze the skater at ${cpu2.x}`);
  assert.equal(useGame.getState().homeScore, score);
  assert.equal(world.periodOver, true);
  assert.equal(world.whistle, null);

  resetWorld();
  liveClock();
  world.faceoff = false;
  world.faceoffPhase = "live";
  const cpu3 = world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
  cpu3.x = 2;
  cpu3.z = 1;
  cpu3.vx = 0;
  cpu3.vz = 0;
  cpu3.stun = 0;
  cpu3.struck = 0;
  cpu3.dive = 0;
  cpu3.yaw = -Math.PI / 2;
  for (const s of world.skaters) {
    if (s.id === cpu3.id) continue;
    s.x = (s.side === "home" ? -1 : 1) * 18;
    s.z = ((s.id % 5) - 2) * 2.2;
    s.vx = 0;
    s.vz = 0;
  }
  world.puck.owner = null;
  world.puck.x = cpu3.x + 0.12;
  world.puck.z = cpu3.z;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  step(3);
  assert.equal(world.puck.owner, cpu3.id, "live play did not resume pickup");
  assert.equal(periodEndLive(), false);
});

test("the game speed slider does not change the period countdown", () => {
  try {
    useGame.getState().setGameSpeed(0.5);
    assert.equal(useGame.getState().gameSpeed, 0.75);
    useGame.getState().setGameSpeed(1.5);
    assert.equal(useGame.getState().gameSpeed, 1.25);
    const drops = [];
    for (const speed of [0.75, 1, 1.2]) {
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
    for (const speed of [0.75, 1.2]) {
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

test("period end still checks, dives, and bursts, including a referee", () => {
  freshGame();
  useGame.getState().setCheckRefs(true);
  expirePeriod();
  assert.equal(periodEndLive(), true);
  const user = world.skaters[world.userId];
  user.x = 0;
  user.z = 0;
  user.yaw = -Math.PI / 2;
  user.vx = 0;
  user.vz = 0;
  user.dive = 0;
  user.hit = 0;
  user.stun = 0;
  user.struck = 0;
  world.puck.owner = null;
  world.camFx = 1;
  world.camFz = 0;
  world.camRx = 0;
  world.camRz = 1;
  setInjectedKeys(["KeyW", "Space"]);
  step(18);
  setInjectedKeys([]);
  assert.equal(user.burst, 1);
  assert.ok(Math.hypot(user.vx, user.vz) > 2, `burst speed ${Math.hypot(user.vx, user.vz)}`);

  user.dive = 0;
  user.vx = 0;
  user.vz = 0;
  setInjectedKeys(["ShiftLeft"]);
  step(1);
  setInjectedKeys([]);
  assert.ok(user.dive > 1, `dive ${user.dive}`);

  user.dive = 0;
  user.hit = 0;
  user.x = world.ref.x - 1.05;
  user.z = world.ref.z;
  user.yaw = -Math.PI / 2;
  user.vx = 0;
  user.vz = 0;
  world.ref.struck = 0;
  world.ref.tumble = 0;
  world.ref.vx = 0;
  world.ref.vz = 0;
  world.lastHitTime = -10;
  setInjectedKeys(["KeyQ"]);
  step(1);
  setInjectedKeys([]);
  assert.ok(world.ref.struck > 1, `ref struck ${world.ref.struck}`);
  assert.equal(periodEndLive(), true);
  assert.equal(useGame.getState().paused, false);
});

test("the final buzzer celebrates for 10 seconds, then pauses", () => {
  freshGame();
  useGame.getState().setHomeScore(2);
  useGame.getState().setAwayScore(0);
  useGame.getState().setPeriod(3);
  world.period = 3;
  expirePeriod();
  assert.equal(world.periodOver, true);
  assert.equal(useGame.getState().paused, false);
  const user = world.skaters[world.userId];
  assert.ok(user.celebrate > 8, `celebrate ${user.celebrate}`);
  const away = world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
  assert.ok(away);
  assert.equal(away.celebrate, 0);
  step(599);
  assert.equal(useGame.getState().paused, false);
  assert.equal(world.periodOver, true);
  step(1);
  assert.equal(useGame.getState().paused, true);
  assert.equal(world.periodOver, true);
});

function countKind(side, kind) {
  return world.skaters.filter((s) => s.side === side && s.kind === kind).length;
}

function tiedThroughPeriod(period) {
  freshGame();
  useGame.getState().setHomeScore(1);
  useGame.getState().setAwayScore(1);
  for (let i = 1; i < period; i++) {
    world.period = i;
    useGame.getState().setPeriod(i);
    expirePeriod();
    assert.equal(world.periodOver, false, `period ${i} ended a tie`);
    drainPeriodBreak();
  }
  assert.equal(world.period, period);
}

test("a tied game plays sudden-death overtime and does not end 0-0", () => {
  tiedThroughPeriod(3);
  assert.equal(world.homeAttack, -1);
  expirePeriod();
  assert.equal(world.periodOver, false);
  assert.equal(useGame.getState().periodOver, false);
  assert.equal(useGame.getState().periodBreak, 3);
  assert.equal(periodEndCopy(3, 1, 1).title, "END 3RD");
  assert.equal(world.period, 3);
  drainPeriodBreak();
  assert.equal(world.period, 4);
  assert.equal(useGame.getState().period, 4);
  assert.equal(periodOrdinal(world.period), "OT");
  assert.equal(world.periodOver, false);
  assert.equal(world.periodClock, 1200);
  assert.equal(useGame.getState().periodClock, 1200);
  assert.equal(useGame.getState().gameMinutes, 2);
  assert.equal(world.homeAttack, 1);
  assert.equal(world.faceoff, true);
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);
  assert.equal(useGame.getState().homeScore, 1);
  assert.equal(useGame.getState().awayScore, 1);
  for (const side of ["home", "away"]) {
    assert.equal(countKind(side, "goalie"), 1, side);
    assert.equal(countKind(side, "defense"), 2, side);
    assert.equal(countKind(side, "winger"), 3, side);
  }

  expirePeriod();
  assert.equal(world.periodOver, false);
  assert.equal(useGame.getState().periodBreak, 4);
  assert.equal(periodEndCopy(useGame.getState().periodBreak, 1, 1).title, "END OT");
  drainPeriodBreak();
  assert.equal(world.period, 5);
  assert.equal(periodOrdinal(world.period), "2OT");
  assert.equal(periodEndCopy(5, 1, 1).title, "END 2OT");
  assert.equal(world.periodClock, 1200);
  assert.equal(world.homeAttack, -1);
  assert.equal(world.periodOver, false);
  assert.equal(useGame.getState().homeScore, 1);
  assert.equal(useGame.getState().awayScore, 1);

  useGame.getState().setHomeScore(2);
  useGame.getState().setAwayScore(1);
  world.period = 4;
  useGame.getState().setPeriod(4);
  expirePeriod();
  assert.equal(world.periodOver, true);
  assert.equal(world.period, 4);
  assert.equal(useGame.getState().periodBreak, 0);
});

test("roller still ends when the second period is tied", () => {
  freshRoller();
  useGame.getState().setHomeScore(0);
  useGame.getState().setAwayScore(0);
  world.period = 2;
  useGame.getState().setPeriod(2);
  expirePeriod();
  assert.equal(world.periodOver, true);
  assert.equal(useGame.getState().periodOver, true);
  assert.equal(world.period, 2);
  assert.equal(useGame.getState().periodBreak, 0);
});

function parkNets() {
  for (const s of world.skaters) {
    if (s.kind !== "goalie") continue;
    s.x = 0;
    s.z = 18;
    s.vx = 0;
    s.vz = 0;
    s.stun = 30;
  }
}

function crossNet(side) {
  parkNets();
  const mouth = side * GOAL_LINE_X;
  world.goalieShot = "score";
  world.lastShoot = -10;
  world.lastShooter = null;
  world.puck.owner = null;
  world.puck.x = mouth - side * 0.01;
  world.puck.z = 0;
  world.puck.y = 0.2;
  world.puck.vx = side * 2;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.periodOver = false;
  world.replay = false;
  useGame.getState().setOffsides(false);
  useGame.getState().setWhistle(null);
  useGame.getState().setPeriodOver(false);
  useGame.getState().setPlaying(true);
  useGame.getState().setPaused(false);
  step(1);
}

test("a regulation goal still faces off, and an overtime goal ends the match", () => {
  freshGame();
  useGame.getState().setHomeScore(0);
  useGame.getState().setAwayScore(0);
  world.period = 3;
  useGame.getState().setPeriod(3);
  world.periodClock = 600;
  useGame.getState().setPeriodClock(600);
  liveClock();
  world.periodClock = 600;
  crossNet(world.homeAttack);
  assert.equal(world.whistle, "goal");
  assert.equal(world.periodOver, false);
  assert.equal(useGame.getState().homeScore, 1);
  let guard = 0;
  while (!world.faceoff && guard < 500) {
    step(1);
    guard++;
  }
  assert.equal(world.faceoff, true);
  assert.equal(world.periodOver, false);
  assert.equal(world.period, 3);
  assert.equal(useGame.getState().homeScore, 1);
  assert.equal(useGame.getState().awayScore, 0);

  freshGame();
  useGame.getState().setHomeScore(1);
  useGame.getState().setAwayScore(1);
  world.period = 4;
  useGame.getState().setPeriod(4);
  world.homeAttack = -1;
  world.periodClock = 480;
  useGame.getState().setPeriodClock(480);
  liveClock();
  world.period = 4;
  world.periodClock = 480;
  const before = world.periodClock;
  crossNet(world.homeAttack);
  assert.equal(world.whistle, "goal");
  assert.equal(world.periodOver, false);
  assert.equal(world.faceoff, false);
  assert.equal(useGame.getState().homeScore, 2);
  assert.equal(useGame.getState().awayScore, 1);
  assert.equal(world.period, 4);
  guard = 0;
  while (!world.periodOver && guard < 500) {
    step(1);
    guard++;
    assert.equal(world.faceoff, false);
  }
  assert.equal(world.periodOver, true);
  assert.equal(useGame.getState().periodOver, true);
  assert.equal(world.faceoff, false);
  assert.equal(world.whistle, null);
  assert.equal(world.stoppage, false);
  assert.equal(world.period, 4);
  assert.equal(useGame.getState().period, 4);
  assert.ok(world.periodClock > 400, `ot clock cleared to ${world.periodClock}`);
  assert.ok(Math.abs(world.periodClock - before) < 1, `ot clock ran during the goal ${world.periodClock}`);
  assert.equal(useGame.getState().paused, false);
  const user = world.skaters[world.userId];
  assert.ok(user.celebrate > 8, `celebrate ${user.celebrate}`);
  const away = world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
  assert.equal(away.celebrate, 0);
  step(599);
  assert.equal(useGame.getState().paused, false);
  step(1);
  assert.equal(useGame.getState().paused, true);
  assert.equal(world.periodOver, true);
  assert.equal(world.faceoff, false);

  freshGame();
  useGame.getState().setHomeScore(0);
  useGame.getState().setAwayScore(0);
  world.period = 5;
  useGame.getState().setPeriod(5);
  world.periodClock = 900;
  liveClock();
  world.period = 5;
  world.periodClock = 900;
  crossNet(-world.homeAttack);
  assert.equal(useGame.getState().awayScore, 1);
  assert.equal(world.whistle, "goal");
  assert.equal(world.periodOver, false);
  step(10);
  setInjectedKeys(["Space"]);
  step(3);
  setInjectedKeys([]);
  step(1);
  assert.equal(world.periodOver, true);
  assert.equal(world.faceoff, false);
  assert.equal(world.period, 5);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().awayScore, 1);
});
