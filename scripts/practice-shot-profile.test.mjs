/**
 * Practice shot profile: attempts, shots on goal, and goals for each shot type.
 * An attempt is a released wrist, snap, slap, or backhand.
 * A shot on goal meets the mouth. A counted goal from that shot is also on goal.
 * A miss stays an attempt only. Passes and other modes do not count.
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
const { GOAL_LINE_X } = rink;

const DT = 1 / 60;
const KINDS = ["backhand", "snap", "wrist", "slap"];

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function user() {
  return world.skaters[world.userId];
}

function profile() {
  return useGame.getState().practiceShots;
}

function teams() {
  return useGame.getState().teamShots;
}

function zeros() {
  for (const kind of KINDS) {
    const row = profile()[kind];
    assert.equal(row.attempts, 0, kind);
    assert.equal(row.onGoal, 0, kind);
    assert.equal(row.goals, 0, kind);
  }
}

function settleUser() {
  const s = user();
  s.x = 0;
  s.z = 0;
  s.vx = 0;
  s.vz = 0;
  s.yaw = -Math.PI / 2;
  s.deke = 0;
  s.windup = 0;
  s.follow = 0;
  s.stickPull = 0;
  s.stun = 0;
  s.dive = 0;
  s.hit = 0;
  s.poke = 0;
  const b = stickBlade(s);
  world.puck.owner = s.id;
  world.puck.x = b.x;
  world.puck.z = b.z;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastShoot = -10;
  world.lastShotKind = null;
  world.lastPass = -10;
  world.shotWindupT = 0;
  world.windupCancel = false;
}

function fresh(profileName = "stick", mode = "practice") {
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  step(2);
  const ui = useGame.getState();
  ui.setClockMode(mode);
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile(profileName);
  resetWorld();
  world.homeAttack = 1;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.periodOver = false;
  world.replay = false;
  settleUser();
  step(1);
  settleUser();
}

function release(x, y) {
  setInjectedAim(x, y);
  setInjectedKeys([]);
  step(1);
}

test("each shot type counts an attempt only for itself", () => {
  fresh();
  zeros();
  release(0, 1);
  assert.equal(world.lastShotKind, "snap");
  assert.equal(profile().snap.attempts, 1);
  assert.equal(profile().snap.goals, 0);
  assert.equal(profile().wrist.attempts, 0);
  assert.equal(profile().slap.attempts, 0);
  assert.equal(profile().backhand.attempts, 0);

  fresh();
  setInjectedAim(0.39, -0.92);
  step(3);
  release(0, 1);
  assert.equal(world.lastShotKind, "slap");
  assert.equal(profile().slap.attempts, 1);
  assert.equal(profile().snap.attempts, 0);

  fresh();
  setInjectedAim(-0.39, -0.92);
  step(3);
  release(0, 1);
  assert.equal(world.lastShotKind, "backhand");
  assert.equal(profile().backhand.attempts, 1);
  assert.equal(profile().slap.attempts, 0);

  fresh("classic");
  setInjectedKeys(["KeyF"]);
  step(12);
  setInjectedKeys([]);
  step(1);
  assert.equal(world.lastShotKind, "wrist");
  assert.equal(profile().wrist.attempts, 1);
  assert.equal(profile().snap.attempts, 0);
  assert.equal(profile().wrist.goals, 0);
});

test("a shot that misses the mouth is an attempt only", () => {
  fresh();
  release(0, 1);
  setInjectedAim(0, 0);
  assert.equal(profile().snap.attempts, 1);
  world.puck.x = 0;
  world.puck.z = 0;
  world.puck.y = 0.2;
  world.puck.vx = 0;
  world.puck.vz = 28;
  world.puck.vy = 0;
  world.puck.owner = null;
  step(50);
  assert.equal(profile().snap.attempts, 1);
  assert.equal(profile().snap.onGoal, 0);
  assert.equal(profile().snap.goals, 0);
  assert.equal(teams().home.attempts, 1);
  assert.equal(teams().home.onGoal, 0);
  assert.equal(teams().away.attempts, 0);
  assert.equal(useGame.getState().homeScore, 0);
});

test("a shot that goes in counts on goal and a goal", () => {
  fresh();
  release(0, 1);
  setInjectedAim(0, 0);
  assert.equal(profile().snap.attempts, 1);
  const goalie = world.skaters.find((s) => s.kind === "goalie");
  assert.ok(goalie);
  goalie.x = 0;
  goalie.z = 18;
  goalie.vx = 0;
  goalie.vz = 0;
  world.lastShotDist = 4;
  world.goalieShot = null;
  world.puck.owner = null;
  world.puck.x = GOAL_LINE_X - 0.25;
  world.puck.z = 0;
  world.puck.y = 0.3;
  world.puck.vx = 12;
  world.puck.vz = 0;
  world.puck.vy = 0;
  step(120);
  const row = profile().snap;
  assert.equal(row.attempts, 1);
  assert.equal(row.onGoal, 1);
  assert.equal(row.goals, 1);
  assert.equal(teams().home.attempts, 1);
  assert.equal(teams().home.onGoal, 1);
  assert.equal(teams().away.onGoal, 0);
  assert.equal(teams().away.attempts, 0);
  assert.equal(useGame.getState().homeScore, 1);
  step(90);
  assert.equal(profile().snap.goals, 1);
  assert.equal(profile().snap.onGoal, 1);
  assert.equal(profile().snap.attempts, 1);
});

test("a pass is not a shot attempt", () => {
  fresh("classic");
  setInjectedKeys(["KeyE"]);
  step(1);
  setInjectedKeys([]);
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(useGame.getState().shotKind, "pass");
  zeros();
  assert.equal(teams().home.attempts, 0);
  assert.equal(teams().away.attempts, 0);
});

test("game mode does not fill the practice profile", () => {
  fresh("stick", "game");
  release(0, 1);
  assert.equal(world.lastShotKind, "snap");
  zeros();
  assert.equal(teams().home.attempts, 1);
  assert.equal(teams().home.onGoal, 0);
  assert.equal(teams().away.attempts, 0);
});

test("reset and entering practice clear the profile", () => {
  fresh();
  release(0, 1);
  assert.equal(profile().snap.attempts, 1);
  resetWorld();
  zeros();

  fresh();
  release(0, 1);
  assert.equal(profile().snap.attempts, 1);
  useGame.getState().setClockMode("game");
  assert.equal(profile().snap.attempts, 1);
  useGame.getState().setClockMode("practice");
  zeros();
});

test("team shots stay through a faceoff reset and clear on a new game", () => {
  fresh();
  release(0, 1);
  setInjectedAim(0, 0);
  assert.equal(teams().home.attempts, 1);
  resetWorld({ keepScore: true });
  assert.equal(teams().home.attempts, 1);
  assert.equal(teams().away.attempts, 0);
  resetWorld();
  assert.equal(teams().home.attempts, 0);
  assert.equal(teams().home.onGoal, 0);
  assert.equal(teams().away.onGoal, 0);
});
