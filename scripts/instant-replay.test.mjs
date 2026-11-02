/**
 * Instant replay plays one goal clip three times, then cuts to the center-ice drop.
 * The sim stays still during the clip. A and X only skip.
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

const { resetWorld, stepSim, world, installControlsProbe, instantReplayModes, instantReplayCam, instantReplayFrames, instantReplayPose } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;
const { inferNamedPose } = poses;

installControlsProbe();

const DT = 1 / 60;

function frames(n) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function sheet(mode = "game") {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setInstantReplay(true);
  ui.setClockMode(mode);
  ui.setPowerPlay(false);
  ui.setChaos(false);
  ui.setOffsides(false);
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
  world.shootout = null;
}

function fillBuffer() {
  for (const s of world.skaters) {
    s.stun = 99;
    s.vx = 0;
    s.vz = 0;
  }
  world.puck.owner = null;
  for (let i = 0; i < 180; i++) {
    world.puck.x = Math.sin(i / 30) * 6;
    world.puck.z = 0;
    world.puck.y = 0.05;
    world.puck.vx = 4;
    world.puck.vz = 0;
    world.puck.vy = 0;
    stepSim(DT);
  }
}

function score(net) {
  world.lastShoot = world.time - 0.5;
  world.lastPass = world.time - 3;
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  globalThis.window.__controlsTest.forceGoal(net ?? world.homeAttack);
}

function edge(code) {
  setInjectedKeys([]);
  stepSim(DT);
  setInjectedKeys([code]);
  stepSim(DT);
  setInjectedKeys([]);
}

test("instant replay is on until the player turns it off", () => {
  assert.equal(useGame.getState().instantReplay, true);
  useGame.getState().setInstantReplay(false);
  assert.equal(useGame.getState().instantReplay, false);
  useGame.getState().setInstantReplay(true);
});

test("a goal clip starts 1.5s before the release and plays three puck-centered cameras", () => {
  sheet("game");
  fillBuffer();
  const userId = world.userId;
  score();
  const modes = [...instantReplayModes()];
  assert.deepEqual(modes.slice().sort(), ["broadcast", "chase", "classic"]);
  frames(40);
  const framesInClip = instantReplayFrames();
  assert.ok(framesInClip >= 140 && framesInClip <= 170, `clip frames ${framesInClip}`);
  assert.equal(world.replay, false);
  edge("KeyE");
  assert.equal(instantReplayCam(), modes[0]);
  assert.equal(world.userId, userId);
  assert.equal(world.replayKind, "goal");
  assert.equal(useGame.getState().replay, false);
  assert.equal(useGame.getState().paused, false);
  const pose = instantReplayPose();
  assert.ok(pose);
  assert.equal(pose.lookX, world.puck.x);
  assert.equal(pose.lookY, Math.max(0.35, world.puck.y));
  assert.equal(pose.lookZ, world.puck.z);
  assert.equal(pose.mode, instantReplayCam());
  if (pose.mode === "classic") {
    const atk = world.homeAttack > 0 ? 1 : -1;
    assert.ok((pose.lookX - pose.camX) * atk > 1);
    assert.equal(pose.upX, atk);
    assert.equal(pose.fov, 50);
  } else if (pose.mode === "broadcast") {
    assert.ok(pose.camY > 10);
    assert.equal(pose.upY, 1);
    assert.equal(pose.fov, 44);
  } else {
    assert.ok(Math.hypot(pose.camX - pose.lookX, pose.camZ - pose.lookZ) > 1);
    assert.equal(pose.upY, 1);
    assert.equal(pose.fov, 44);
  }
  const frozen = world.time;
  edge("KeyE");
  assert.equal(instantReplayCam(), modes[1]);
  edge("KeyE");
  assert.equal(instantReplayCam(), modes[2]);
  assert.equal(world.time, frozen);
  edge("KeyE");
  assert.equal(world.faceoff, true);
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);
  assert.equal(world.whistle, null);
  assert.equal(world.replay, false);
});

test("the clip starts on its own after 2s, and X cuts to the faceoff", () => {
  sheet("roller");
  fillBuffer();
  score();
  frames(119);
  assert.equal(world.replay, false);
  frames(2);
  assert.equal(world.replayKind, "goal");
  const t0 = world.replayT;
  setInjectedKeys(["KeyG"]);
  frames(6);
  setInjectedKeys([]);
  assert.ok(world.replayT > t0);
  edge("KeyF");
  assert.equal(world.faceoff, true);
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);
  assert.equal(world.replay, false);
});

test("X during the celebration skips the replay", () => {
  sheet("scrimmage");
  fillBuffer();
  score();
  assert.equal(instantReplayModes().length, 3);
  edge("KeyF");
  assert.equal(world.faceoff, true);
  assert.equal(world.whistle, null);
  assert.equal(instantReplayModes().length, 0);
});

test("broadcast uses 1.5s before the release and classic and chase use 1s", () => {
  sheet("game");
  fillBuffer();
  score();
  frames(40);
  edge("KeyE");
  const steps = {};
  for (let n = 0; n < 3; n++) {
    const cam = instantReplayCam();
    assert.ok(cam);
    let played = 0;
    while (instantReplayCam() === cam && played < 400) {
      stepSim(DT);
      played += 1;
    }
    steps[cam] = played;
  }
  assert.equal(world.faceoff, true);
  assert.equal(steps.broadcast - steps.classic, 30);
  assert.equal(steps.classic - steps.chase, 30);
});

test("each goal gets a new camera order", () => {
  const orders = new Set();
  for (let n = 0; n < 8; n++) {
    sheet("game");
    frames(8);
    score();
    const modes = [...instantReplayModes()];
    assert.deepEqual(modes.slice().sort(), ["broadcast", "chase", "classic"]);
    orders.add(modes.join(","));
  }
  assert.ok(orders.size > 1, `orders ${[...orders].join(" | ")}`);
});

test("a pass into the net starts 1.5s before that pass, not an older shot", () => {
  sheet("game");
  fillBuffer();
  world.lastShoot = world.time - 4;
  world.lastPass = world.time - 0.4;
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  globalThis.window.__controlsTest.forceGoal(world.homeAttack);
  frames(40);
  const framesInClip = instantReplayFrames();
  assert.ok(framesInClip >= 130 && framesInClip <= 170, `pass clip frames ${framesInClip}`);
});

test("each replay frame keeps the pose from that moment", () => {
  sheet("game");
  fillBuffer();
  const u = world.skaters[world.userId];
  for (let i = 0; i < 30; i++) {
    u.windup = 1;
    u.follow = 0;
    u.hit = 0;
    u.celebrate = 0;
    u.vx = 0;
    u.vz = 0;
    stepSim(DT);
  }
  world.lastShoot = world.time - 0.05;
  world.lastShotBackhand = false;
  world.lastShotSlap = true;
  world.lastShotKind = "slap";
  score();
  u.celebrate = 4;
  u.windup = 0;
  u.hit = 0.9;
  edge("KeyE");
  const shown = world.skaters[world.userId];
  assert.notEqual(inferNamedPose(shown, shown.id), "celebrate");
  assert.equal(shown.hit, 0);
  let sawSlap = inferNamedPose(shown, shown.id) === "slap";
  let sawOther = !sawSlap;
  for (let i = 0; i < 100 && !(sawSlap && sawOther); i++) {
    stepSim(DT);
    const pose = inferNamedPose(world.skaters[world.userId], world.skaters[world.userId].id);
    if (pose === "slap") sawSlap = true;
    else sawOther = true;
    assert.notEqual(pose, "celebrate");
  }
  assert.equal(sawSlap, true);
  assert.equal(sawOther, true);
  assert.equal(world.replayKind, "goal");
});

test("drill, practice, and the off switch do not arm a clip", () => {
  sheet("drill");
  fillBuffer();
  score();
  assert.equal(instantReplayModes().length, 0);
  sheet("practice");
  fillBuffer();
  score();
  assert.equal(instantReplayModes().length, 0);
  sheet("game");
  useGame.getState().setInstantReplay(false);
  fillBuffer();
  score();
  frames(130);
  assert.equal(world.replay, false);
  assert.equal(world.whistle, "goal");
});
