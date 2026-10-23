/**
 * After a goal the user can burst and dive.
 * X rages only within 2 m of a post or the crossbar, and only when the home team did not score.
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
const input = await server.ssrLoadModule("/src/game/input.ts");
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { resetWorld, stepSim, whistleUserLook, world, rageDraw } = sim;
const { useGame } = store;
const { setInjectedKeys, setInjectedAim } = input;
const { GOAL_LINE_X, GOAL_W } = rink;

const DT = 1 / 60;

function user() {
  return world.skaters[world.userId];
}

function sheet() {
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("stick");
  resetWorld();
  world.homeAttack = 1;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.replay = false;
  world.goalSide = null;
  world.lastShooter = null;
  world.camFx = 1;
  world.camFz = 0;
  world.camRx = 0;
  world.camRz = 1;
  stepSim(DT);
}

function park() {
  const u = user();
  u.vx = 0;
  u.vz = 0;
  u.yaw = -Math.PI / 2;
  u.hit = 0;
  u.stun = 0;
  u.dive = 0;
  u.poke = 0;
  u.windup = 0;
  u.follow = 0;
  u.struck = 0;
  u.tumble = 0;
  u.celebrate = 0;
  u.smash = 0;
  u.smashKind = 0;
  u.smashHit = 0;
  u.backskate = false;
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.z = 10;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  for (const s of world.skaters) {
    if (s.id === u.id) continue;
    s.x = s.side === "home" ? -8 : 8;
    s.z = 12 + (s.id % 5) * 1.2;
    s.vx = 0;
    s.vz = 0;
    s.stun = 30;
    s.hit = 0;
    s.celebrate = 0;
    s.smashKind = 0;
  }
  world.ref.x = 0;
  world.ref.z = 12;
  world.ref.vx = 0;
  world.ref.vz = 0;
  world.ref2.x = 0;
  world.ref2.z = -12;
  world.ref2.vx = 0;
  world.ref2.vz = 0;
  world.ref3.x = 24;
  world.ref3.z = 12;
  world.ref3.vx = 0;
  world.ref3.vz = 0;
  world.ref4.x = 24;
  world.ref4.z = -12;
  world.ref4.vx = 0;
  world.ref4.vz = 0;
}

function goal(side) {
  world.stoppage = true;
  world.whistle = "goal";
  world.goalSide = side;
  world.stoppageT = 0.4;
  world.faceoff = false;
  world.periodOver = false;
  useGame.getState().setWhistle("goal");
}

function frames(n, keys) {
  setInjectedKeys(keys);
  for (let i = 0; i < n; i++) stepSim(DT);
  setInjectedKeys([]);
}

function speed() {
  const s = user();
  return Math.hypot(s.vx, s.vz);
}

test("holding B after either goal bursts, and a tap still skips", () => {
  for (const side of ["home", "away"]) {
    sheet();
    park();
    const u = user();
    assert.notEqual(u.kind, "goalie");
    u.x = 0;
    u.z = 0;
    u.celebrate = 2.4;
    goal(side);
    world.lastShooter = u.id;
    frames(Math.round(0.55 / DT), ["KeyW", "Space"]);
    const burst = speed();
    assert.equal(world.whistle, "goal", side);
    assert.equal(u.burst, 1, side);
    sheet();
    park();
    user().x = 0;
    user().z = 0;
    goal(side);
    frames(Math.round(0.55 / DT), ["KeyW"]);
    assert.ok(burst > speed() + 1.5, `${side} burst ${burst.toFixed(2)} vs ${speed().toFixed(2)}`);
  }
  sheet();
  park();
  user().x = 0;
  user().z = 0;
  goal("home");
  frames(1, ["Space"]);
  frames(1, []);
  assert.equal(world.whistle, null);
  assert.equal(world.stoppage, false);
});

test("an offside whistle stays on the puck spot and keeps burst, dive, pass, and saucer", () => {
  sheet();
  park();
  const u = user();
  u.x = -8;
  u.z = 10;
  u.yaw = -Math.PI / 2;
  world.puck.owner = null;
  world.puck.x = u.x + 16;
  world.puck.z = u.z - 4;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.offsideCarrier = u.id;
  world.stoppage = true;
  world.whistle = "offside";
  world.stoppageT = 0.4;
  world.faceoff = false;
  world.faceoffA = false;
  useGame.getState().setWhistle("offside");
  const spotX = world.puck.x;
  const spotZ = world.puck.z;
  const look = whistleUserLook();
  assert.ok(look);
  assert.equal(look.x, spotX);
  assert.equal(look.z, spotZ);
  assert.equal(look.y, 0.55);
  assert.ok(Math.hypot(look.x - u.x, look.z - u.z) > 8);

  frames(Math.round(0.45 / DT), ["KeyW", "Space"]);
  const burst = speed();
  const held = whistleUserLook();
  assert.equal(held.x, spotX);
  assert.equal(held.z, spotZ);
  assert.equal(world.whistle, "offside");
  assert.equal(u.burst, 1);
  sheet();
  park();
  const u2 = user();
  u2.x = -8;
  u2.z = 10;
  world.offsideCarrier = u2.id;
  world.stoppage = true;
  world.whistle = "offside";
  world.stoppageT = 0.4;
  world.faceoff = false;
  world.faceoffA = false;
  frames(Math.round(0.45 / DT), ["KeyW"]);
  assert.ok(burst > speed() + 1.5, `offside burst ${burst.toFixed(2)} vs ${speed().toFixed(2)}`);

  sheet();
  park();
  user().x = 2;
  user().z = 1;
  world.puck.owner = null;
  world.offsideCarrier = user().id;
  world.stoppage = true;
  world.whistle = "offside";
  world.stoppageT = 0.2;
  world.faceoff = false;
  frames(1, []);
  frames(1, ["ShiftLeft"]);
  assert.ok(user().dive > 1, `offside dive ${user().dive}`);

  sheet();
  park();
  const passer = user();
  passer.x = 0;
  passer.z = 0;
  passer.yaw = -Math.PI / 2;
  world.puck.owner = passer.id;
  world.offsideCarrier = passer.id;
  world.stoppage = true;
  world.whistle = "offside";
  world.stoppageT = 0.2;
  world.faceoff = false;
  world.faceoffA = false;
  world.lastPass = -10;
  setInjectedKeys(["KeyE"]);
  stepSim(DT);
  setInjectedKeys([]);
  stepSim(DT);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastPasser, passer.id);
  assert.equal(useGame.getState().shotKind, "pass");
  assert.ok(Math.hypot(world.puck.vx, world.puck.vz) > 4, `pass speed ${world.puck.vx}`);

  sheet();
  park();
  const saucer = user();
  saucer.x = 0;
  saucer.z = 0;
  saucer.yaw = -Math.PI / 2;
  world.puck.owner = saucer.id;
  world.offsideCarrier = saucer.id;
  world.stoppage = true;
  world.whistle = "offside";
  world.stoppageT = 0.2;
  world.faceoff = false;
  world.faceoffA = false;
  world.lastPass = -10;
  const sauceX = world.puck.x;
  const sauceZ = world.puck.z;
  whistleUserLook();
  setInjectedKeys(["KeyR", "KeyE"]);
  stepSim(DT);
  setInjectedKeys(["KeyR"]);
  stepSim(DT);
  setInjectedKeys([]);
  assert.equal(world.puck.owner, null);
  assert.equal(useGame.getState().shotKind, "saucer");
  assert.ok(world.puck.vy > 0.3, `saucer vy ${world.puck.vy}`);
  const lookAfter = whistleUserLook();
  assert.equal(lookAfter.x, sauceX);
  assert.equal(lookAfter.z, sauceZ);
  assert.ok(Math.hypot(world.puck.x - sauceX, world.puck.z - sauceZ) > 0.2);
});

test("RT starts a dive after either goal", () => {
  for (const side of ["home", "away"]) {
    sheet();
    park();
    user().x = 2;
    user().z = 1;
    goal(side);
    frames(1, []);
    frames(1, ["ShiftLeft"]);
    assert.ok(user().dive > 1, `${side} dive ${user().dive}`);
  }
});

test("X rages within 2 m of a post or the bar after an away goal, and not after a home goal", () => {
  sheet();
  park();
  const u = user();
  const postZ = GOAL_W / 2;
  u.x = GOAL_LINE_X - 1.7;
  u.z = postZ;
  const x0 = u.x;
  goal("away");
  frames(1, []);
  frames(1, ["KeyF"]);
  assert.equal(u.smashKind, 2);
  assert.ok(rageDraw(u.id));
  frames(18, ["KeyS"]);
  assert.ok(u.x < x0 - 0.12, `skates off the iron ${u.x} from ${x0}`);
  assert.ok(u.smash > 0);
  assert.ok(rageDraw(u.id));

  sheet();
  park();
  user().x = -GOAL_LINE_X + 1.7;
  user().z = -postZ;
  goal("away");
  frames(1, []);
  frames(1, ["KeyF"]);
  assert.equal(user().smashKind, 3);

  sheet();
  park();
  user().x = GOAL_LINE_X - 1.4;
  user().z = 0;
  goal("away");
  frames(1, []);
  frames(1, ["KeyF"]);
  assert.equal(user().smashKind, 1);

  sheet();
  park();
  user().x = GOAL_LINE_X - 1.7;
  user().z = postZ;
  goal("home");
  frames(1, []);
  frames(1, ["KeyF"]);
  assert.equal(user().smashKind, 0);

  sheet();
  park();
  user().x = GOAL_LINE_X - 1.4;
  user().z = 0;
  goal("home");
  frames(1, []);
  frames(1, ["KeyF"]);
  assert.equal(user().smashKind, 0);

  sheet();
  park();
  user().x = GOAL_LINE_X - 2.25;
  user().z = postZ;
  goal("away");
  frames(1, []);
  frames(1, ["KeyF"]);
  assert.equal(user().smashKind, 0);

  sheet();
  park();
  const checker = user();
  checker.x = 0;
  checker.z = 0;
  checker.yaw = -Math.PI / 2;
  goal("home");
  world.ref.x = 1.05;
  world.ref.z = 0;
  world.ref.struck = 0;
  world.ref.tumble = 0;
  world.ref.vx = 0;
  world.ref.vz = 0;
  world.lastHitTime = -10;
  frames(1, ["KeyQ"]);
  assert.equal(checker.smashKind, 0);
  assert.ok(world.ref.struck > 1, `ref check after a home goal ${world.ref.struck}`);
});

test("a user goalie can burst and rage after a goal", () => {
  sheet();
  const g = world.skaters.find((s) => s.kind === "goalie" && s.side === "home");
  assert.ok(g);
  world.userId = g.id;
  park();
  g.x = 0;
  g.z = 0;
  g.stun = 0;
  g.struck = 0;
  g.tumble = 0;
  goal("home");
  frames(Math.round(0.55 / DT), ["KeyW", "Space"]);
  const burst = speed();
  assert.equal(world.whistle, "goal");
  assert.equal(g.burst, 1);
  sheet();
  const g2 = world.skaters.find((s) => s.kind === "goalie" && s.side === "home");
  world.userId = g2.id;
  park();
  g2.x = 0;
  g2.z = 0;
  g2.stun = 0;
  g2.struck = 0;
  g2.tumble = 0;
  goal("home");
  frames(Math.round(0.55 / DT), ["KeyW"]);
  assert.ok(burst > speed() + 1, `goalie burst ${burst.toFixed(2)} vs ${speed().toFixed(2)}`);

  sheet();
  const g3 = world.skaters.find((s) => s.kind === "goalie" && s.side === "home");
  world.userId = g3.id;
  park();
  g3.x = GOAL_LINE_X - 1.5;
  g3.z = 0;
  g3.stun = 0;
  g3.struck = 0;
  g3.tumble = 0;
  goal("home");
  frames(1, []);
  frames(1, ["KeyF"]);
  assert.equal(g3.smashKind, 0);
  sheet();
  const g4 = world.skaters.find((s) => s.kind === "goalie" && s.side === "home");
  world.userId = g4.id;
  park();
  g4.x = GOAL_LINE_X - 1.5;
  g4.z = 0;
  g4.stun = 0;
  g4.struck = 0;
  g4.tumble = 0;
  goal("away");
  frames(1, []);
  frames(1, ["KeyF"]);
  assert.equal(g4.smashKind, 1);
  assert.ok(g4.smashHit > 0);
  const gx = g4.x;
  frames(16, ["KeyS"]);
  assert.ok(g4.x < gx - 0.08, `goalie skates during rage ${g4.x} from ${gx}`);
  assert.ok(g4.smash > 0);
});

test("a raging user can still burst, dive, and check", () => {
  sheet();
  park();
  const u = user();
  u.x = GOAL_LINE_X - 1.7;
  u.z = GOAL_W / 2;
  goal("away");
  frames(1, []);
  frames(1, ["KeyF"]);
  assert.equal(u.smashKind, 2);
  const coast = Math.hypot(u.vx, u.vz);
  frames(18, ["KeyS"]);
  const skating = Math.hypot(u.vx, u.vz);
  frames(18, ["KeyS", "Space"]);
  assert.equal(world.whistle, "goal");
  assert.equal(u.burst, 1);
  assert.ok(Math.hypot(u.vx, u.vz) > Math.max(coast, skating) + 0.4);
  assert.ok(rageDraw(u.id));
  frames(1, ["ShiftLeft"]);
  assert.ok(u.dive > 1, `dive ${u.dive}`);
  assert.equal(u.smashKind, 2);
  assert.ok(rageDraw(u.id));

  sheet();
  park();
  const hitter = user();
  hitter.x = GOAL_LINE_X - 1.6;
  hitter.z = 0;
  hitter.yaw = -Math.PI / 2;
  goal("away");
  frames(1, []);
  frames(1, ["KeyF"]);
  assert.equal(hitter.smashKind, 1);
  const foe = world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
  assert.ok(foe);
  foe.x = hitter.x + 1.05;
  foe.z = hitter.z;
  foe.vx = 0;
  foe.vz = 0;
  foe.stun = 0;
  foe.struck = 0;
  foe.tumble = 0;
  foe.hit = 0;
  foe.celebrate = 0;
  for (const r of [world.ref, world.ref2, world.ref3, world.ref4]) {
    r.x = -30;
    r.z = 0;
    r.vx = 0;
    r.vz = 0;
  }
  frames(1, ["KeyQ"]);
  assert.ok(foe.struck > 1.1, `checked during rage ${foe.struck}`);
  assert.equal(hitter.smashKind, 1);
  assert.ok(rageDraw(hitter.id));
});
