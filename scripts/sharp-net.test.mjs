/**
 * Net mesh absorbs a shot and the puck keeps moving after a goal.
 * Sharp angles stay accurate. Shots from below the goal line do not slip behind the net.
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

const { resetWorld, stepSim, world, stickBlade } = sim;
const { useGame } = store;
const { setInjectedKeys, setInjectedAim } = input;
const { GOAL_LINE_X, GOAL_H, GOAL_W, FACEOFF_EZ_X, FACEOFF_SPOT_Z, cageDepthAt } = rink;

const DT = 1 / 60;

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function user() {
  return world.skaters[world.userId];
}

function boot(mode = "game") {
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  const ui = useGame.getState();
  if (ui.clockMode === "scrimmage" || ui.clockMode === "practice") ui.setClockMode("roller");
  ui.setClockMode(mode);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setOffsides(false);
  ui.setControlProfile("classic");
  resetWorld();
  world.homeAttack = 1;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.goalSide = null;
  world.goalBank = null;
  world.puck.owner = null;
  useGame.getState().setWhistle(null);
  useGame.getState().setPeriodOver(false);
  for (const s of world.skaters) {
    if (s.id === world.userId) continue;
    s.x = 0;
    s.z = (s.id - 3) * 1.2;
    s.vx = 0;
    s.vz = 0;
    s.stun = 9;
  }
}

function putBlade(x, z) {
  const s = user();
  s.yaw = -Math.PI / 2;
  s.vx = 0;
  s.vz = 0;
  s.stun = 0;
  s.x = x;
  s.z = z;
  for (let i = 0; i < 3; i++) {
    const b = stickBlade(s);
    s.x += x - b.x;
    s.z += z - b.z;
  }
  const b = stickBlade(s);
  world.puck.owner = s.id;
  world.puck.x = b.x;
  world.puck.z = b.z;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
}

function releaseShot() {
  setInjectedKeys(["KeyF"]);
  step(1);
  setInjectedKeys([]);
  step(1);
}

test("a goal does not freeze the puck on the goal line", () => {
  boot("game");
  const mouth = GOAL_LINE_X;
  world.puck.owner = null;
  world.puck.x = mouth - 0.35;
  world.puck.y = 0.72;
  world.puck.z = 0;
  world.puck.vx = 16;
  world.puck.vy = 0.2;
  world.puck.vz = 0;
  world.lastShoot = world.time;
  world.lastPass = world.time - 1;
  world.lastShooter = world.userId;
  let scored = false;
  for (let i = 0; i < 40 && !scored; i++) {
    step(1);
    scored = world.whistle === "goal";
  }
  assert.equal(scored, true);
  const y0 = world.puck.y;
  const x0 = world.puck.x;
  step(18);
  const moved = Math.abs(world.puck.y - y0) > 0.04 || Math.abs(world.puck.x - x0) > 0.05;
  assert.ok(moved, `puck stuck at ${world.puck.x.toFixed(2)}, ${world.puck.y.toFixed(2)}`);
  assert.ok(world.puck.y < y0 + 0.02, "puck hovered instead of falling");
});

test("a shot into the mesh comes back slower", () => {
  boot("scrimmage");
  const mouth = GOAL_LINE_X;
  world.puck.owner = null;
  world.puck.x = mouth + 0.08;
  world.puck.y = 0.3;
  world.puck.z = 0;
  world.puck.vx = 14;
  world.puck.vy = 0;
  world.puck.vz = 0;
  world.lastShoot = world.time;
  world.lastPass = world.time - 1;
  world.lastShooter = world.userId;
  const before = Math.hypot(world.puck.vx, world.puck.vy, world.puck.vz);
  let flipped = false;
  for (let i = 0; i < 30; i++) {
    const vx0 = world.puck.vx;
    step(1);
    if (vx0 > 1 && world.puck.vx < 0) {
      flipped = true;
      const after = Math.hypot(world.puck.vx, world.puck.vy, world.puck.vz);
      assert.ok(after < before * 0.4, `mesh return ${after.toFixed(2)} from ${before.toFixed(2)}`);
      break;
    }
  }
  assert.equal(flipped, true);
});

test("a sharp corner shot aimed at the middle is not pulled to the far post", () => {
  boot("scrimmage");
  const spotZ = FACEOFF_SPOT_Z + 2.2;
  putBlade(GOAL_LINE_X - 1.4, spotZ);
  setInjectedAim(0, 0.7);
  releaseShot();
  assert.equal(world.puck.owner, null);
  const dx = GOAL_LINE_X - world.puck.x;
  const center = Math.atan2(-world.puck.z, dx);
  const got = Math.atan2(world.puck.vz, world.puck.vx);
  const postZ = -Math.sign(spotZ) * (GOAL_W / 2);
  const post = Math.atan2(postZ - world.puck.z, dx);
  assert.ok(Math.abs(got - center) < 0.12, `aim ${got.toFixed(3)} center ${center.toFixed(3)}`);
  assert.ok(Math.abs(got - center) < Math.abs(post - center) * 0.45, "shot was pulled to the far post");
});

test("a top-corner iron hit does not come back harder than it arrived", () => {
  boot("scrimmage");
  const postZ = GOAL_W / 2;
  world.lastShotCorner = true;
  world.lastShotCornerSide = 1;
  world.lastShoot = world.time;
  world.lastPass = world.time - 1;
  world.lastShooter = world.userId;
  world.reboundN = 0;
  world.puck.owner = null;
  world.puck.x = GOAL_LINE_X - 0.5;
  world.puck.z = postZ;
  world.puck.y = 1.05;
  world.puck.vx = 22;
  world.puck.vy = 1.4;
  world.puck.vz = 0.3;
  const before = Math.hypot(world.puck.vx, world.puck.vy, world.puck.vz);
  let hit = false;
  for (let i = 0; i < 20; i++) {
    const vx0 = world.puck.vx;
    step(1);
    const sp = Math.hypot(world.puck.vx, world.puck.vy, world.puck.vz);
    if (vx0 > 4 && world.puck.vx < vx0 * 0.5) {
      hit = true;
      assert.ok(sp <= before + 0.05, `top corner left at ${sp.toFixed(2)} from ${before.toFixed(2)}`);
      assert.ok(sp < before * 0.55, `top corner stayed too hot ${sp.toFixed(2)}`);
      break;
    }
  }
  assert.equal(hit, true);
});

test("a high-angle near-post hit can still go in, and a goal-line one bounces out", () => {
  function shootNear(fromLine) {
    boot("scrimmage");
    putBlade(GOAL_LINE_X - fromLine, FACEOFF_SPOT_Z + 1.8);
    setInjectedAim(1, -0.75);
    setInjectedKeys(["KeyF"]);
    step(1);
    putBlade(GOAL_LINE_X - fromLine, FACEOFF_SPOT_Z + 1.8);
    const real = Math.random;
    Math.random = () => 0.1;
    let deepest = world.puck.x;
    try {
      setInjectedKeys([]);
      step(1);
      for (let i = 0; i < 50; i++) {
        step(1);
        if (world.puck.x > deepest) deepest = world.puck.x;
        if (world.puck.vx < -0.3) break;
      }
    } finally {
      Math.random = real;
    }
    return { vx: world.puck.vx, deepest, x: world.puck.x };
  }
  const high = shootNear(3.2);
  assert.ok(high.deepest > GOAL_LINE_X + 0.05, `high-angle near post stayed out at ${high.deepest.toFixed(2)}`);
  const line = shootNear(0.35);
  assert.ok(line.vx < -0.15, `goal-line near post kept going in vx ${line.vx.toFixed(2)}`);
  assert.ok(line.x < GOAL_LINE_X + 0.08, `goal-line near post lodged in at ${line.x.toFixed(2)}`);
});

test("a shot from below the goal line does not travel behind the net", () => {
  for (const roll of [0.05, 0.4, 0.85]) {
    boot("scrimmage");
    putBlade(GOAL_LINE_X + 1.4, FACEOFF_SPOT_Z + 1.6);
    setInjectedAim(0, 0.4);
    setInjectedKeys(["KeyF"]);
    step(1);
    putBlade(GOAL_LINE_X + 1.4, FACEOFF_SPOT_Z + 1.6);
    const real = Math.random;
    Math.random = () => roll;
    try {
      setInjectedKeys([]);
      step(1);
    } finally {
      Math.random = real;
    }
    assert.equal(world.puck.owner, null, `roll ${roll} did not shoot`);
    const mouth = GOAL_LINE_X;
    assert.ok(world.puck.vx < -0.4, `roll ${roll} kept going behind vx ${world.puck.vx.toFixed(2)}`);
    if (Math.abs(world.puck.vx) > 0.3) {
      const t = (mouth - world.puck.x) / world.puck.vx;
      if (t > 0) {
        const zCross = world.puck.z + world.puck.vz * t;
        const behindTarget = world.puck.x + world.puck.vx * 0.35 > mouth + 0.15 && world.puck.vx > 0;
        assert.equal(behindTarget, false);
        if (roll > 0.7) {
          assert.ok(Math.abs(zCross) > GOAL_W / 2, `front miss crossed in the net z ${zCross.toFixed(2)}`);
        }
      }
    }
  }
});

function pastShell(mouth, x, y, z) {
  const along = x - mouth;
  const limit = cageDepthAt(z, Math.min(Math.max(y, 0), GOAL_H));
  return limit > 0.05 && along > limit + 0.18 && Math.abs(z) < GOAL_W / 2 && y < GOAL_H + 0.02;
}

test("the twine and the bottom pipe stop the puck both ways", () => {
  boot("game");
  const mouth = GOAL_LINE_X;
  const cases = [
    { x: mouth + 0.4, y: 0.55, z: 0, vx: 26, vy: 0, vz: 0 },
    { x: mouth + 0.35, y: 0.042, z: 0.15, vx: 8, vy: 0, vz: 16 },
    { x: mouth + 1.55, y: 0.042, z: 0, vx: -24, vy: 0, vz: 0 },
    { x: mouth + 1.45, y: 0.7, z: -0.2, vx: -18, vy: 0, vz: 7 },
  ];
  for (const c of cases) {
    world.whistle = null;
    world.stoppage = false;
    world.puck.owner = null;
    world.puck.x = c.x;
    world.puck.y = c.y;
    world.puck.z = c.z;
    world.puck.vx = c.vx;
    world.puck.vy = c.vy;
    world.puck.vz = c.vz;
    let leaked = false;
    for (let i = 0; i < 25; i++) {
      step(1);
      if (pastShell(mouth, world.puck.x, world.puck.y, world.puck.z) && c.vx > 0) leaked = true;
      if (c.vx > 0 && world.puck.x > mouth + 0.12 && Math.abs(world.puck.z) > GOAL_W / 2 + 0.12) leaked = true;
      if (c.vx < 0 && world.puck.x < mouth - 0.05 && Math.abs(world.puck.z) < GOAL_W / 2 - 0.05) leaked = true;
    }
    assert.equal(leaked, false, `leaked from ${c.x.toFixed(2)},${c.z.toFixed(2)} to ${world.puck.x.toFixed(2)},${world.puck.z.toFixed(2)}`);
  }
});

test("a goalie does not snap a puck back from the faceoff dot", () => {
  boot("game");
  const goalie = world.skaters.find((s) => s.kind === "goalie" && s.side === "away");
  assert.ok(goalie);
  world.whistle = "goal";
  world.stoppage = true;
  world.stoppageT = 0.7;
  world.goalSide = "home";
  useGame.getState().setWhistle("goal");
  useGame.getState().setGoalSide("home");
  world.puck.owner = null;
  world.puck.x = FACEOFF_EZ_X;
  world.puck.y = 0.042;
  world.puck.z = 0;
  world.puck.vx = 0;
  world.puck.vy = 0;
  world.puck.vz = 0;
  const x0 = world.puck.x;
  step(1);
  assert.ok(Math.abs(world.puck.x - x0) < 0.4, `snapped from ${x0.toFixed(2)} to ${world.puck.x.toFixed(2)}`);
  assert.notEqual(world.puck.owner, goalie.id);
});
