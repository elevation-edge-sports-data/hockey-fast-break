/**
 * A user goalie bursts with B the way a skater does, and a goalie-only
 * home lineup starts in the crease instead of on the faceoff dot.
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
const rink = await server.ssrLoadModule("/src/game/rink.ts");
const poses = await server.ssrLoadModule("/src/game/poseOverrideInfer.ts");

const { resetWorld, stepSim, world, defendDir, faceYaw } = sim;
const { inferNamedPose } = poses;
const { useGame } = store;
const { setInjectedKeys, setInjectedAim, setInjectedStart } = input;
const { GOAL_LINE_X, BLUE_X } = rink;

const DT = 1 / 60;
const FULL = { g: 1, d: 2, o: 3 };
const SOLO = { g: 1, d: 0, o: 0 };

function homeGoalie() {
  const g = world.skaters.find((s) => s.side === "home" && s.kind === "goalie");
  assert.ok(g);
  return g;
}

function liveSolo() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setHomeLineup(SOLO);
  ui.setAwayLineup(FULL);
  resetWorld();
  const g = homeGoalie();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.x = 20;
  world.puck.z = 12;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.y = 0.042;
  g.vx = 0;
  g.vz = 0;
  return g;
}

function skate(g, keys, seconds) {
  setInjectedKeys(keys);
  let max = 0;
  const x0 = g.x;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepSim(DT);
    max = Math.max(max, Math.hypot(g.vx, g.vz));
  }
  return { max, sp: Math.hypot(g.vx, g.vz), dx: g.x - x0, burst: g.burst, userId: world.userId };
}

test("goalie-only home starts in the crease and is not the faceoff taker", () => {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setHomeLineup(SOLO);
  ui.setAwayLineup(FULL);
  resetWorld();

  const home = world.skaters.filter((s) => s.side === "home");
  assert.equal(home.length, 1);
  const g = home[0];
  assert.equal(g.kind, "goalie");
  assert.equal(world.userId, g.id);
  assert.notEqual(world.homeDot, g.id);
  const mouth = defendDir("home") * GOAL_LINE_X;
  const fromLine = (g.x - mouth) * -defendDir("home");
  assert.ok(fromLine > 0.4 && fromLine < 1.6, `crease depth ${fromLine.toFixed(3)}`);
  assert.ok(Math.abs(g.z) < 0.2);
  assert.ok(Math.abs(g.x - world.faceX) > 10, "not standing on the dot");

  for (let i = 0; i < 45; i++) stepSim(DT);
  const later = (g.x - mouth) * -defendDir("home");
  assert.ok(later > 0.3 && later < 2.2, `still in the crease after the drop (${later.toFixed(3)})`);
  assert.ok(Math.abs(g.z) < 0.6);
  assert.notEqual(world.homeDot, g.id);
  assert.equal(world.userId, g.id);
});

test("an idle home goalie slides in the crease in every mode", () => {
  for (const mode of ["game", "roller", "scrimmage", "practice"]) {
    setInjectedKeys([]);
    const ui = useGame.getState();
    ui.setClockMode(mode);
    ui.setPlaying(true);
    ui.setPaused(false);
    ui.setHomeLineup(SOLO);
    ui.setAwayLineup(FULL);
    resetWorld();
    world.faceoff = false;
    world.faceoffPhase = "live";
    world.stoppage = false;
    world.whistle = null;
    const g = homeGoalie();
    const foe = world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
    assert.ok(foe, mode);
    foe.x = 0;
    foe.z = 0;
    foe.vx = 0;
    foe.vz = 0;
    world.puck.owner = foe.id;
    world.puck.x = 0;
    world.puck.z = 0;
    world.puck.vx = 0;
    world.puck.vz = 0;
    world.puck.vy = 0;
    const netX = defendDir("home") * (GOAL_LINE_X - 0.85);
    g.x = netX;
    g.z = 0.7;
    g.vx = 0;
    g.vz = 0;
    g.dive = 0;
    g.stun = 0;
    g.tumble = 0;
    stepSim(DT);
    assert.equal(world.userId, g.id, mode);
    assert.ok(Math.abs(g.z) < 0.7, `${mode} idle crease z ${g.z}`);

    g.x = netX;
    g.z = 0;
    g.vx = 0;
    g.vz = 0;
    setInjectedKeys(["KeyD"]);
    const x0 = g.x;
    const z0 = g.z;
    for (let i = 0; i < 10; i++) stepSim(DT);
    setInjectedKeys([]);
    assert.equal(world.userId, g.id, mode);
    assert.ok(Math.hypot(g.x - x0, g.z - z0) > 0.05, `${mode} stick ${g.x},${g.z}`);

    g.x = netX;
    g.z = 0.7;
    g.vx = 0;
    g.vz = 0;
    stepSim(DT);
    assert.ok(Math.abs(g.z) < 0.7, `${mode} crease resume ${g.z}`);
    assert.equal(world.userId, g.id, mode);
  }

  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setHomeLineup(FULL);
  ui.setAwayLineup(FULL);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  const awayG = world.skaters.find((s) => s.side === "away" && s.kind === "goalie");
  assert.ok(awayG);
  world.userId = awayG.id;
  const homeSkater = world.skaters.find((s) => s.side === "home" && s.kind !== "goalie");
  assert.ok(homeSkater);
  world.puck.owner = homeSkater.id;
  world.puck.x = homeSkater.x;
  world.puck.z = homeSkater.z;
  world.puck.vx = 0;
  world.puck.vz = 0;
  const awayNet = defendDir("away") * (GOAL_LINE_X - 0.85);
  awayG.x = awayNet;
  awayG.z = 0.7;
  awayG.vx = 0;
  awayG.vz = 0;
  awayG.dive = 0;
  awayG.stun = 0;
  awayG.tumble = 0;
  stepSim(DT);
  assert.equal(world.userId, awayG.id);
  assert.ok(Math.abs(awayG.z - 0.7) < 0.02, `away goalie slid to ${awayG.z}`);
  ui.setClockMode("game");
  ui.setHomeLineup(FULL);
  setInjectedKeys([]);
});

test("holding the goalie still bursts, and release hands back to a skater", () => {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setHomeLineup(FULL);
  ui.setAwayLineup(FULL);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.x = 20;
  world.puck.z = 12;
  const g = homeGoalie();
  setInjectedStart(true);
  const held = skate(g, ["KeyW", "Space"], 1);
  setInjectedStart(false);
  assert.equal(held.userId, g.id);
  assert.equal(held.burst, 1);
  assert.ok(held.sp > 13.5 && held.sp < 15.2, `held burst ${held.sp.toFixed(2)}`);
  setInjectedKeys(["KeyW"]);
  stepSim(DT);
  assert.notEqual(world.userId, g.id);
  assert.equal(world.skaters[world.userId].kind !== "goalie", true);
});

test("user goalie loose burst is three quarters of the old skate cap", () => {
  const burst = skate(liveSolo(), ["KeyW", "Space"], 1.2);
  const cruise = skate(liveSolo(), ["KeyW"], 1.2);
  assert.equal(burst.userId, 0);
  assert.equal(burst.burst, 1);
  assert.equal(cruise.burst, 0);
  assert.ok(burst.sp > 13.8 && burst.sp < 15.2, `burst speed ${burst.sp.toFixed(2)}`);
  assert.ok(burst.dx > 10, `burst travel ${burst.dx.toFixed(2)}`);
  assert.ok(cruise.sp > 10, `cruise speed ${cruise.sp.toFixed(2)} was recall-damped`);
  assert.ok(burst.sp > cruise.sp + 1, `burst ${burst.sp.toFixed(2)} vs cruise ${cruise.sp.toFixed(2)}`);
});

test("carrying the puck is two thirds of the loose goalie burst", () => {
  const loose = skate(liveSolo(), ["KeyW", "Space"], 1.2);
  const g = liveSolo();
  world.puck.owner = g.id;
  world.puck.x = g.x;
  world.puck.z = g.z;
  const carrying = skate(g, ["KeyW", "Space"], 1.2);
  assert.equal(world.puck.owner, g.id);
  const ratio = carrying.sp / loose.sp;
  assert.ok(ratio > 0.64 && ratio < 0.7, `carry ${carrying.sp.toFixed(2)} vs loose ${loose.sp.toFixed(2)}`);
});

function parkOthers(g) {
  for (const s of world.skaters) {
    if (s.id === g.id) continue;
    s.stun = 40;
    s.vx = 0;
    s.vz = 0;
    s.x = 22;
    s.z = 8 + s.id;
  }
}

test("user goalie claims a loose puck outside the old crease reach", () => {
  const g = liveSolo();
  const netX = defendDir("home") * (GOAL_LINE_X - 0.85);
  const attack = -defendDir("home");
  parkOthers(g);
  g.yaw = faceYaw("home");
  g.x = netX;
  g.z = 0;
  g.vx = 0;
  g.vz = 0;
  world.puck.owner = null;
  world.puck.x = netX + attack * 1.35;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.goalieSaveT = -10;
  world.lastShoot = -10;
  world.lastPass = -10;
  world.lastPasser = null;
  world.lastPassTo = null;
  world.lastShooter = null;
  stepSim(DT);
  assert.equal(world.puck.owner, g.id);

  const far = liveSolo();
  parkOthers(far);
  far.yaw = faceYaw("home");
  far.x = netX;
  far.z = 0;
  far.vx = 0;
  far.vz = 0;
  world.puck.owner = null;
  world.puck.x = netX + attack * 3.4;
  world.puck.z = 0.73;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.goalieSaveT = -10;
  world.lastShoot = -10;
  world.lastPass = -10;
  world.lastPasser = null;
  world.lastPassTo = null;
  world.lastShooter = null;
  stepSim(DT);
  assert.equal(world.puck.owner, null);
});

test("user goalie dive picks stick or blocker side from the goalie's left and right", () => {
  const right = liveSolo();
  right.yaw = faceYaw("home");
  right.vx = 0;
  right.vz = 0;
  world.puck.owner = null;
  setInjectedKeys(["ShiftLeft", "KeyD"]);
  stepSim(DT);
  assert.ok(right.dive > 1, `right dive ${right.dive}`);
  assert.equal(inferNamedPose(right, right.id), "goalieDivingGloveSave");

  const left = liveSolo();
  left.yaw = faceYaw("home");
  left.vx = 0;
  left.vz = 0;
  world.puck.owner = null;
  stepSim(DT);
  left.yaw = faceYaw("home");
  left.vx = 0;
  left.vz = 0;
  setInjectedKeys(["ShiftLeft", "KeyA"]);
  stepSim(DT);
  assert.ok(left.dive > 1, `left dive ${left.dive}`);
  assert.equal(inferNamedPose(left, left.id), "goalieDivingStickSave");

  const held = liveSolo();
  held.yaw = faceYaw("home");
  world.puck.owner = held.id;
  world.puck.x = held.x;
  world.puck.z = held.z;
  setInjectedKeys(["ShiftLeft", "KeyA"]);
  stepSim(DT);
  assert.equal(held.dive, 0);

  useGame.getState().setControlProfile("wings");
  const wing = liveSolo();
  wing.yaw = faceYaw("home");
  wing.vx = 0;
  wing.vz = 0;
  world.puck.owner = null;
  setInjectedKeys(["KeyM", "KeyD"]);
  stepSim(DT);
  assert.ok(wing.dive > 1, `wings dive ${wing.dive}`);
  assert.equal(inferNamedPose(wing, wing.id), "goalieDivingGloveSave");
  useGame.getState().setControlProfile("classic");
  setInjectedKeys([]);
});

function freshPassGame() {
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  setInjectedStart(false);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("classic");
  ui.setHomeLineup(FULL);
  ui.setAwayLineup(FULL);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.faceoffA = false;
  world.stoppage = false;
  world.whistle = null;
  world.replay = false;
}

function homeEnd() {
  return defendDir("home") >= 0 ? 1 : -1;
}

function placeCreaseGoalie(g) {
  const end = homeEnd();
  g.x = end * (GOAL_LINE_X - 0.85);
  g.z = 0;
  g.vx = 0;
  g.vz = 0;
  g.yaw = faceYaw("home");
  g.stun = 0;
  g.struck = 0;
  g.tumble = 0;
  g.dive = 0;
  g.poke = 0;
}

function releaseIcePass(passer, x, holdS) {
  const end = homeEnd();
  const prevNow = performance.now;
  let clock = 8_000_000;
  performance.now = () => clock;
  const ui = useGame.getState();
  const savedFind = ui.ignoreAutoFind;
  ui.setIgnoreAutoFind(true);
  try {
    world.userId = passer.id;
    world.userPossessedAt = -10;
    world.lastShoot = -10;
    world.lastPass = -10;
    world.lastPasser = null;
    world.lastPassTo = null;
    world.goalieSaveT = -10;
    world.lastHitTime = -10;
    passer.stun = 0;
    passer.struck = 0;
    passer.dive = 0;
    passer.hit = 0;
    passer.vx = 0;
    passer.vz = 0;
    passer.x = x;
    passer.z = 0;
    passer.yaw = end > 0 ? -Math.PI / 2 : Math.PI / 2;
    world.puck.owner = passer.id;
    world.puck.x = x;
    world.puck.z = 0;
    world.puck.y = 0.042;
    world.puck.vx = 0;
    world.puck.vz = 0;
    world.puck.vy = 0;
    for (const s of world.skaters) {
      if (s.id === passer.id) continue;
      s.stun = 30;
      s.vx = 0;
      s.vz = 0;
      s.x = -end * 4;
      s.z = 12;
    }
    setInjectedStart(false);
    setInjectedAim(0, 0);
    setInjectedKeys(["KeyE"]);
    stepSim(DT);
    passer.x = x;
    passer.z = 0;
    passer.yaw = end > 0 ? -Math.PI / 2 : Math.PI / 2;
    passer.vx = 0;
    passer.vz = 0;
    clock += holdS * 1000;
    setInjectedKeys([]);
    stepSim(DT);
  } finally {
    performance.now = prevNow;
    ui.setIgnoreAutoFind(savedFind);
    setInjectedAim(0, 0);
    setInjectedKeys([]);
  }
}

function playPassToUserGoalie() {
  const g = homeGoalie();
  const end = homeEnd();
  const spd = Math.max(12, Math.hypot(world.puck.vx, world.puck.vz));
  world.puck.owner = null;
  world.puck.x = end * (GOAL_LINE_X - 2.15);
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = end * spd;
  world.puck.vz = 0;
  world.puck.vy = 0;
  placeCreaseGoalie(g);
  world.userId = g.id;
  setInjectedStart(true);
  for (let i = 0; i < 100; i++) {
    placeCreaseGoalie(g);
    world.userId = g.id;
    const passer = world.lastPasser;
    stepSim(DT);
    if (world.puck.owner === g.id) return "possess";
    if (world.lastPasser === g.id && passer !== g.id) return "poke";
  }
  return "none";
}

test("user goalie holds an ordinary ice pass and pokes a hard own-zone pass", () => {
  const end = homeEnd();
  const ownX = end * (BLUE_X + 4);

  freshPassGame();
  const mate = world.skaters.find((s) => s.side === "home" && s.kind !== "goalie");
  releaseIcePass(mate, ownX, 0.05);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastPasser, mate.id);
  assert.ok(world.puck.vx * end > 8, `tap pass vx ${world.puck.vx}`);
  assert.equal(playPassToUserGoalie(), "possess");
  setInjectedStart(false);

  freshPassGame();
  const bomber = world.skaters.find((s) => s.side === "home" && s.kind !== "goalie");
  releaseIcePass(bomber, ownX, 1);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastPasser, bomber.id);
  assert.ok(Math.hypot(world.puck.vx, world.puck.vz) * 2.23694 > 70, "hard pass is above half charge");
  assert.equal(playPassToUserGoalie(), "poke");
  setInjectedStart(false);

  freshPassGame();
  const neutral = world.skaters.find((s) => s.side === "home" && s.kind !== "goalie");
  releaseIcePass(neutral, 0, 1);
  assert.equal(world.puck.owner, null);
  assert.equal(playPassToUserGoalie(), "possess");
  setInjectedStart(false);

  freshPassGame();
  const foe = world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
  releaseIcePass(foe, 0, 0.05);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastPasser, foe.id);
  assert.equal(playPassToUserGoalie(), "poke");
  setInjectedStart(false);
  setInjectedKeys([]);
});
