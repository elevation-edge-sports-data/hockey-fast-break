/**
 * After a goal the scored-on side rages before the faceoff.
 * Exactly one skater breaks a stick. A scored-on goalie is not put on the smash clock.
 * A second scored-on skater can check a referee. The scoring side does not rage.
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
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;

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
const poses = await server.ssrLoadModule("/src/game/poseOverrideInfer.ts");
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { resetWorld, stepSim, world, rageDraw, checkedCyclePose, defendDir, installControlsProbe, armStickRage, stepRagePreview } = sim;
const { GOAL_LINE_X } = rink;
const { inferNamedPose } = poses;
const { useGame } = store;
const { setInjectedKeys, setInjectedAim } = input;

installControlsProbe();

const DT = 1 / 60;

function frames(n) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function seconds(t) {
  frames(Math.round(t / DT));
}

function sheet(mode) {
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  const ui = useGame.getState();
  ui.setClockMode(mode);
  ui.setPowerPlay(false);
  ui.setChaos(false);
  ui.setOffsides(false);
  ui.setCheckRefs(true);
  ui.setControlProfile("stick");
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.replay = false;
  world.goalSide = null;
}

function score(net) {
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  globalThis.window.__controlsTest.forceGoal(net);
}

function stickRagers(side) {
  return world.skaters.filter((s) => s.side === side && s.kind !== "goalie" && s.smashKind > 0);
}

function goalie(side) {
  return world.skaters.find((s) => s.side === side && s.kind === "goalie");
}

function downedRefs() {
  return [world.ref, world.ref2, world.ref3, world.ref4].filter((r) => r.struck > 0.2 || r.tumble !== 0);
}

function reactionCount(side) {
  return stickRagers(side).length + (goalie(side)?.smashKind > 0 ? 1 : 0) + downedRefs().length;
}

test("user goal: one CPU skater breaks a stick, and the goalie does not", () => {
  sheet("game");
  const user = world.skaters[world.userId];
  assert.equal(user.side, "home");
  assert.notEqual(user.kind, "goalie");
  score(world.homeAttack);
  assert.equal(world.whistle, "goal");
  assert.equal(world.goalSide, "home");
  assert.equal(stickRagers("away").length, 0);
  for (const s of world.skaters) {
    if (s.side === "home") assert.equal(s.smashKind, 0);
  }
  const cpuGoalie = goalie("away");
  assert.ok(cpuGoalie);
  assert.equal(cpuGoalie.smashKind, 0);
  seconds(0.45);
  assert.equal(stickRagers("away").length, 0);
  assert.equal(cpuGoalie.smashKind, 0);
  assert.ok(cpuGoalie.coverPose > 0.3);
  seconds(0.12);
  const ragers = stickRagers("away");
  assert.equal(ragers.length, 1);
  assert.ok(rageDraw(ragers[0].id));
  assert.equal(ragers[0].smashHit, 0.7);
  const x0 = ragers[0].x;
  const mouth = defendDir("away") * GOAL_LINE_X;
  seconds(0.45);
  const toward = Math.sign(mouth - x0) || 1;
  assert.ok((ragers[0].x - x0) * toward > 0.4, "raging skater skates toward the net");
  seconds(2.2);
  assert.equal(stickRagers("away").length, 1);
  assert.equal(cpuGoalie.smashKind, 0);
  for (const s of world.skaters) {
    if (s.side === "home") assert.equal(s.smashKind, 0);
  }
  let seen = 0;
  let guard = 0;
  while (world.stoppage && guard < 400) {
    stepSim(DT);
    guard += 1;
    if (world.stoppage && world.stoppageT > 3.9 && world.stoppageT < 4.35) seen = reactionCount("away");
  }
  assert.equal(world.stoppage, false);
  assert.equal(world.faceoff, true);
  assert.equal(world.whistle, null);
  assert.ok(seen >= 1 && seen <= 2, `reactions ${seen}`);
});

test("user goal: a CPU skater checks the referee through absorb, tumble, and recover", () => {
  sheet("game");
  const orig = Math.random;
  Math.random = () => 0.9;
  try {
    score(world.homeAttack);
    let down = [];
    let armGuard = 0;
    while (down.length === 0 && armGuard < 220) {
      stepSim(DT);
      armGuard += 1;
      down = downedRefs();
    }
    assert.equal(down.length, 1);
    assert.equal(checkedCyclePose(down[0].struck, down[0].tumble), "absorb");
    const checker = world.skaters.find(
      (s) => s.side === "away" && s.kind !== "goalie" && s.smashKind <= 0 && s.id !== world.userId,
    );
    assert.ok(checker);
    let sawKnockout = false;
    let sawRecover = false;
    let reactions = 0;
    let upAt = -1;
    let guard = 0;
    while (world.stoppage && guard < 400 && upAt < 0) {
      stepSim(DT);
      guard += 1;
      const pose = checkedCyclePose(down[0].struck, down[0].tumble);
      if (pose === "knockout") sawKnockout = true;
      if (pose === "recover" && !sawRecover) {
        sawRecover = true;
        reactions = reactionCount("away");
      }
      if (down[0].struck === 0 && down[0].tumble === 0) upAt = world.stoppageT;
    }
    assert.equal(sawKnockout, true);
    assert.equal(sawRecover, true);
    assert.ok(upAt > 0 && upAt < 3.5, `ref up at ${upAt}`);
    assert.equal(world.stoppage, true);
    assert.equal(stickRagers("away").length, 1);
    assert.equal(goalie("away").smashKind, 0);
    assert.equal(reactions, 2, `reactions ${reactions}`);
  } finally {
    Math.random = orig;
  }
});

function awaitRagers(side) {
  let list = stickRagers(side);
  let guard = 0;
  while (list.length === 0 && guard < 80) {
    stepSim(DT);
    guard += 1;
    list = stickRagers(side);
  }
  return list;
}

test("a raging CPU skater stays checkable during and after the swing", () => {
  sheet("game");
  score(world.homeAttack);
  const foe = awaitRagers("away")[0];
  assert.ok(foe);
  const user = world.skaters[world.userId];
  for (const s of world.skaters) {
    if (s.id === user.id || s.id === foe.id) continue;
    s.x = 40;
    s.z = 18;
    s.vx = 0;
    s.vz = 0;
  }
  world.ref.x = 36;
  world.ref.z = 8;
  world.ref2.x = 36;
  world.ref2.z = -8;
  world.ref3.x = 36;
  world.ref3.z = 4;
  world.ref4.x = 36;
  world.ref4.z = -4;
  user.yaw = -Math.PI / 2;
  user.vx = 0;
  user.vz = 0;
  user.hit = 0;
  user.x = foe.x - 2.6;
  user.z = foe.z;
  foe.celebrate = 0;
  foe.vx = 0;
  foe.vz = 0;
  foe.struck = 0;
  foe.tumble = 0;
  world.puck.owner = null;
  world.camFx = 1;
  world.camFz = 0;
  world.camRx = 0;
  world.camRz = 1;
  world.lastHitTime = -10;
  setInjectedKeys([]);
  stepSim(DT);
  setInjectedKeys(["KeyQ"]);
  stepSim(DT);
  setInjectedKeys([]);
  assert.ok(foe.struck > 1.1, `during rage struck ${foe.struck}`);
  const pose = inferNamedPose(foe, foe.id);
  assert.ok(pose === "absorb" || pose === "knockout" || pose === "recover", `pose ${pose}`);

  sheet("game");
  score(world.homeAttack);
  const later = awaitRagers("away")[0];
  assert.ok(later);
  seconds(0.9);
  assert.ok(later.smash > later.smashHit, `swing ${later.smash}`);
  const u2 = world.skaters[world.userId];
  for (const s of world.skaters) {
    if (s.id === u2.id || s.id === later.id) continue;
    s.x = 40;
    s.z = 18;
  }
  world.ref.x = 36;
  world.ref2.x = 36;
  world.ref3.x = 36;
  world.ref4.x = 36;
  u2.x = 0;
  u2.z = 0;
  u2.yaw = -Math.PI / 2;
  u2.vx = 0;
  u2.vz = 0;
  u2.hit = 0;
  later.x = 2.6;
  later.z = 0;
  later.vx = 0;
  later.vz = 0;
  later.celebrate = 0;
  later.struck = 0;
  later.tumble = 0;
  later.stun = 0;
  world.puck.owner = null;
  world.camFx = 1;
  world.camFz = 0;
  world.camRx = 0;
  world.camRz = 1;
  world.lastHitTime = -10;
  setInjectedKeys([]);
  stepSim(DT);
  setInjectedKeys(["KeyQ"]);
  stepSim(DT);
  setInjectedKeys([]);
  assert.ok(later.smashKind > 0);
  assert.ok(later.struck > 1.1, `after the swing struck ${later.struck}`);
  const after = inferNamedPose(later, later.id);
  assert.notEqual(after, "rage1");
  assert.notEqual(after, "rage2");
});

test("CPU goal: one home teammate rages and the user does not", () => {
  sheet("game");
  const user = world.skaters[world.userId];
  score(-world.homeAttack);
  assert.equal(world.goalSide, "away");
  assert.equal(stickRagers("home").length, 0);
  seconds(0.55);
  assert.equal(stickRagers("home").length, 1);
  assert.notEqual(stickRagers("home")[0].id, user.id);
  assert.ok(rageDraw(stickRagers("home")[0].id));
  for (const s of world.skaters) {
    if (s.side === "away") assert.equal(s.smashKind, 0);
  }
  assert.equal(user.smashKind, 0);
  const x0 = stickRagers("home")[0].x;
  const mouth = defendDir("home") * GOAL_LINE_X;
  seconds(0.5);
  const toward = Math.sign(mouth - x0) || 1;
  assert.ok((stickRagers("home")[0].x - x0) * toward > 0.4);
  seconds(2.2);
  const g = goalie("home");
  assert.ok(g);
  assert.notEqual(g.id, user.id);
  assert.equal(g.smashKind, 0);
  assert.equal(stickRagers("home").length, 1);
  assert.equal(user.smashKind, 0);
});

test("practice user goal: the CPU goalie scoops, then holds goalie rage 1", () => {
  sheet("practice");
  assert.equal(world.skaters.filter((s) => s.side === "away" && s.kind !== "goalie").length, 0);
  score(world.homeAttack);
  const g = goalie("away");
  assert.ok(g);
  seconds(0.4);
  assert.equal(g.smashKind, 0);
  assert.equal(g.smashHit, 0);
  assert.ok(g.coverPose > 0.3);
  seconds(2.2);
  assert.equal(g.smashKind, 0);
  assert.equal(g.smash, 0);
  assert.equal(g.smashHit, 0);
  assert.equal(inferNamedPose(g, g.id), "goalieRage1");
  assert.equal(stickRagers("away").length, 0);
  assert.equal(stickRagers("home").length, 0);
});

test("check refs off: scored-on skaters still rage and the officials stay up", () => {
  sheet("game");
  useGame.getState().setCheckRefs(false);
  score(world.homeAttack);
  seconds(2.4);
  assert.equal(stickRagers("away").length, 1);
  assert.equal(goalie("away").smashKind, 0);
  assert.equal(downedRefs().length, 0);
  assert.equal(world.ref.tumble, 0);
  assert.equal(world.ref2.tumble, 0);
});

test("scrimmage knockdown: the other team rages without a goalie", () => {
  sheet("scrimmage");
  const orig = Math.random;
  Math.random = () => 0.9;
  try {
    score(world.homeAttack);
    assert.equal(world.whistle, "goal");
    assert.equal(goalie("away"), undefined);
    assert.equal(stickRagers("away").length, 0);
    seconds(0.55);
    assert.equal(stickRagers("away").length, 1);
    let knocked = false;
    let knockGuard = 0;
    while (!knocked && knockGuard < 180 && world.stoppage) {
      stepSim(DT);
      knockGuard += 1;
      knocked = downedRefs().length >= 1;
    }
    assert.equal(knocked, true);
    assert.equal(checkedCyclePose(downedRefs()[0].struck, downedRefs()[0].tumble), "absorb");
    let guard = 0;
    while (world.stoppage && guard < 400) {
      stepSim(DT);
      guard += 1;
    }
    assert.equal(world.stoppage, false);
    assert.equal(world.faceoff, true);
  } finally {
    Math.random = orig;
  }
});

test("held rage1 and goalieRage1 do not advance the preview clock", () => {
  sheet("game");
  const s = world.skaters.find((p) => p.kind !== "goalie" && p.side === "away");
  assert.ok(s);
  const x0 = s.x;
  const z0 = s.z;
  world.poseHold = true;
  world.namedPose = "rage1";
  world.namedPoseIndex = s.id;
  s.smashKind = 1;
  s.smash = 0;
  s.smashHit = 0.7;
  armStickRage(s.id);
  stepRagePreview(0.5);
  assert.equal(s.smash, 0);
  assert.equal(rageDraw(s.id).blade.on, false);
  assert.equal(s.x, x0);
  assert.equal(s.z, z0);
  const g = goalie("away");
  assert.ok(g);
  const gx = g.x;
  const gz = g.z;
  world.namedPose = "goalieRage1";
  world.namedPoseIndex = g.id;
  g.smashKind = 1;
  g.smash = 0;
  g.smashHit = 0.7;
  stepRagePreview(0.5);
  assert.equal(g.smash, 0);
  assert.equal(g.x, gx);
  assert.equal(g.z, gz);
  world.poseHold = false;
  world.namedPose = null;
  world.namedPoseIndex = null;
});

test("game officials hold four board quadrants through a goal", () => {
  sheet("game");
  world.faceoff = false;
  world.whistle = null;
  world.stoppage = false;
  seconds(1.2);
  const refs = [world.ref, world.ref2, world.ref3, world.ref4];
  const quads = new Set(refs.map((r) => `${Math.sign(r.x)}:${Math.sign(r.z)}`));
  assert.equal(quads.size, 4);
  for (const r of refs) {
    assert.ok(Math.abs(r.z) > 9, `board z ${r.z}`);
    assert.equal(r.pose, "idle");
  }
  const before = refs.map((r) => ({ x: r.x, z: r.z }));
  score(world.homeAttack);
  seconds(0.8);
  const netX =
    world.goalSide === "home" ? world.homeAttack * GOAL_LINE_X : -world.homeAttack * GOAL_LINE_X;
  const after = new Set(refs.map((r) => `${Math.sign(r.x)}:${Math.sign(r.z)}`));
  assert.equal(after.size, 4);
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    assert.equal(r.pose, "goal");
    assert.ok(Math.abs(r.z) > 9, `ref ${i} left the boards at z ${r.z}`);
    assert.equal(Math.sign(r.x), Math.sign(before[i].x));
    assert.equal(Math.sign(r.z), Math.sign(before[i].z));
    assert.ok(
      Math.abs(r.x - netX) > Math.abs(before[i].x - netX) - 0.35,
      `ref ${i} skated toward the net ${r.x} from ${before[i].x}`,
    );
  }
});

test("roller keeps the extra officials off the ice", () => {
  sheet("roller");
  seconds(0.4);
  assert.ok(Math.abs(world.ref.z) < 20);
  assert.ok(Math.abs(world.ref2.z) < 20);
  assert.ok(Math.abs(world.ref3.z) > 40);
  assert.ok(Math.abs(world.ref4.z) > 40);
});
