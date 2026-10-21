/**
 * Named pose pairs: back skate, dive poke, speed puck, shot follows,
 * shoulder check, and the three equal auto-deke phases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const posesFile = JSON.parse(readFileSync(join(root, "src/game/poseOverrides.json"), "utf8"));

function sameJoints(a, b) {
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
}

test("new poses are full copies and renamed poses keep their joints", () => {
  sameJoints(posesFile.backSkate, posesFile.ready);
  sameJoints(posesFile.divePoke, posesFile.dive);
  sameJoints(posesFile.speedPuckRight, posesFile.speedPuckLeft);
  sameJoints(posesFile.autoDeke2, posesFile.autoDeke1);
  sameJoints(posesFile.shoulderCheck2, posesFile.shoulderCheck1);
  sameJoints(posesFile.slapFollow, posesFile.wristFollow);
  sameJoints(posesFile.backhandFollow, posesFile.backhandShot);
  sameJoints(posesFile.snap, posesFile.snapFollow);
  for (const old of ["speedPuckPossess", "autoDeke", "shoulderCheck", "shot-follow-through"]) {
    assert.equal(posesFile[old], undefined);
  }
  assert.ok(posesFile.ready.body.length >= 3);
  assert.ok(posesFile.dive.body.length >= 3);
});

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

const server = await createServer({
  configFile: false,
  root,
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
const { resetWorld, stepSim, world, holdBurstPose } = sim;
const { inferNamedPose } = poses;
const { useGame } = store;
const { setInjectedKeys } = input;

function skater() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  const s = world.skaters.find((p) => p.side === "home" && p.kind !== "goalie");
  world.userId = s.id;
  s.x = 0;
  s.z = 20;
  s.vx = 0;
  s.vz = 0;
  s.yaw = 0;
  s.stride = 0;
  s.burst = 0;
  s.deke = 0;
  s.hit = 0;
  s.poke = 0;
  s.dive = 0;
  s.windup = 0;
  s.follow = 0;
  s.struck = 0;
  s.tumble = 0;
  s.celebrate = 0;
  s.backskate = false;
  s.stickPull = 0;
  world.puck.owner = null;
  world.lastShooter = null;
  world.lastShotKind = null;
  world.lastShotSlap = false;
  world.lastShotBackhand = false;
  return s;
}

test("back skate replaces ready and puck possess while backskating", () => {
  const s = skater();
  assert.equal(inferNamedPose(s, s.id), "ready");
  s.backskate = true;
  assert.equal(inferNamedPose(s, s.id), "backSkate");
  world.puck.owner = s.id;
  assert.equal(inferNamedPose(s, s.id), "backSkate");
  s.backskate = false;
  assert.equal(inferNamedPose(s, s.id), "puckPossess1");
});

test("dive and dive poke follow the stride sine", () => {
  const s = skater();
  s.dive = 0.95;
  s.stride = Math.PI / 2;
  assert.equal(inferNamedPose(s, s.id), "dive");
  s.stride = -Math.PI / 2;
  assert.equal(inferNamedPose(s, s.id), "divePoke");
});

test("a stopped dive still advances stride at the skate rate", () => {
  const s = skater();
  s.dive = 0.5;
  s.stride = 0;
  stepSim(0.1);
  const diving = s.stride;
  assert.ok(diving > 0.5, `dive stride ${diving}`);
  const quiet = skater();
  quiet.stride = 0;
  stepSim(0.1);
  assert.ok(quiet.stride < 0.05, `skate stride ${quiet.stride}`);
});

test("speed puck left and right alternate with stride", () => {
  const s = skater();
  world.puck.owner = s.id;
  s.burst = 1;
  holdBurstPose(s.id);
  s.stride = Math.PI / 2;
  assert.equal(inferNamedPose(s, s.id), "speedPuckLeft");
  s.stride = -Math.PI / 2;
  assert.equal(inferNamedPose(s, s.id), "speedPuckRight");
});

test("shot follow uses the shot kind", () => {
  const s = skater();
  world.lastShooter = s.id;
  world.lastShoot = world.time;
  const cases = [
    ["wrist", false, false, 0.35, "wristFollow"],
    ["slap", true, false, 0.35, "slapFollow"],
    ["backhand", false, true, 0.35, "backhandFollow"],
    ["snap", false, false, 0.12, "snapFollow"],
  ];
  for (const [kind, slap, backhand, follow, pose] of cases) {
    world.lastShotKind = kind;
    world.lastShotSlap = slap;
    world.lastShotBackhand = backhand;
    s.follow = follow;
    s.windup = 0;
    assert.equal(inferNamedPose(s, s.id), pose, kind);
  }
});

test("auto deke plays 1, 2, 1 across equal thirds of the deke window", () => {
  const s = skater();
  world.puck.owner = s.id;
  const start = 1.05;
  const end = 0.02;
  const span = start - end;
  const third = span / 3;
  const samples = [
    [start, "autoDeke1"],
    [start - third + 0.001, "autoDeke1"],
    [start - third, "autoDeke2"],
    [start - 2 * third + 0.001, "autoDeke2"],
    [start - 2 * third, "autoDeke1"],
    [end + 0.001, "autoDeke1"],
  ];
  for (const [deke, pose] of samples) {
    s.deke = deke;
    assert.equal(inferNamedPose(s, s.id), pose, String(deke));
  }
  assert.ok(Math.abs(3 * third - span) < 1e-9);
});

test("a check shows shoulder check 1 for 0.12s, then shoulder check 2", () => {
  const s = skater();
  s.hit = 0.42;
  assert.equal(inferNamedPose(s, s.id), "shoulderCheck1");
  stepSim(0.05);
  assert.equal(inferNamedPose(s, s.id), "shoulderCheck1");
  stepSim(0.1);
  assert.ok(s.hit > 0);
  assert.equal(inferNamedPose(s, s.id), "shoulderCheck2");
});
