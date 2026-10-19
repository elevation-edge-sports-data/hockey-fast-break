/**
 * User pass power follows how long A is held. A skater tap is 55 mph and 1.5s is 95.
 * A goalie tap is 45 mph and 1.5s is 85. A goalie shot tap is 55 mph and a full hold is 87.
 * Start (gamepad button 9) held at release makes that pass a saucer.
 * Sauce height is a second curve on that hold: empty at the tap, full at 1s.
 * The shot meter fills across the 1.5s windup. Slap starts at half of that, not at xHeld.
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

let pads = [];
if (typeof globalThis.navigator !== "object" || globalThis.navigator === null) {
  globalThis.navigator = {};
}
Object.defineProperty(globalThis.navigator, "getGamepads", {
  configurable: true,
  value: () => pads,
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

const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const input = await server.ssrLoadModule("/src/game/input.ts");
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { resetWorld, stepSim, world, stickBlade } = sim;
const { useGame, hudReleaseName } = store;
const { setInjectedKeys, setInjectedAim, setInjectedStart } = input;
const { GOAL_H, GOAL_LINE_X, BOARD_H, GLASS_H, RINK_W } = rink;

after(() => server.close());

const DT = 1 / 60;
let clockMs = 1_000_000;
performance.now = () => clockMs;

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function user() {
  return world.skaters[world.userId];
}

function mph() {
  return Math.hypot(world.puck.vx, world.puck.vz) * 2.23694;
}

function expectedMph(holdS) {
  const t = Math.min(1, Math.max(0, holdS / 1.5));
  return (55 + 40 * t) * Math.exp(-0.2 * DT);
}

function padButton(pressed) {
  return { pressed, touched: pressed, value: pressed ? 1 : 0 };
}

function holdStart(on) {
  const buttons = Array.from({ length: 17 }, () => padButton(false));
  if (on) buttons[9] = padButton(true);
  pads = [
    {
      id: "test-standard",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: clockMs,
      axes: [0, 0, 0, 0],
      buttons,
    },
  ];
}

function holdSelect(on) {
  const buttons = Array.from({ length: 17 }, () => padButton(false));
  if (on) buttons[8] = padButton(true);
  pads = [
    {
      id: "test-standard",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: clockMs,
      axes: [0, 0, 0, 0],
      buttons,
    },
  ];
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
  world.lastPass = -10;
  world.lastPasser = null;
  world.lastPassTo = null;
}

function fresh() {
  pads = [];
  setInjectedStart(false);
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  step(2);
  const ui = useGame.getState();
  ui.setClockMode("practice");
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("classic");
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.homeAttack = 1;
  world.periodOver = false;
  world.replay = false;
  settleUser();
  step(1);
  settleUser();
}

function pressPass() {
  setInjectedKeys(["KeyE"]);
  step(1);
}

function releasePass() {
  setInjectedKeys([]);
  step(1);
}

function passFor(holdS) {
  pressPass();
  clockMs += holdS * 1000;
  releasePass();
}

function assertSpeed(holdS) {
  const got = mph();
  const want = expectedMph(holdS);
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastPasser, user().id);
  assert.ok(Math.abs(got - want) < 0.8, `hold ${holdS}s -> ${got.toFixed(2)} mph, want ${want.toFixed(2)}`);
}

function assertHud(holdS, kind) {
  const t = Math.min(1, Math.max(0, holdS / 1.5));
  const launch = 55 + 40 * t;
  const ui = useGame.getState();
  assert.equal(ui.shotKind, kind);
  assert.equal(hudReleaseName(kind), kind === "saucer" ? "saucer pass" : "pass");
  assert.ok(Math.abs(ui.speed - launch) < 0.8, `hud ${ui.speed.toFixed(2)} want ${launch.toFixed(2)}`);
}

function assertIce() {
  assert.ok(world.puck.y < 0.08 && Math.abs(world.puck.vy) < 0.6, `ice y ${world.puck.y} vy ${world.puck.vy}`);
}

function assertSaucer() {
  assert.ok(world.puck.vy > 2 && world.puck.y > 0.1, `saucer y ${world.puck.y} vy ${world.puck.vy}`);
}

test("A hold sets pass speed from 55 mph to 95 mph and does not saucer", () => {
  fresh();
  pressPass();
  assert.equal(world.puck.owner, user().id);
  clockMs += 1500;
  step(1);
  assert.equal(world.puck.owner, user().id, "full charge waits for release");
  const full = useGame.getState();
  assert.equal(full.chargeKind, "pass");
  assert.ok(Math.abs(full.charge - 1) < 0.02, `charge ${full.charge}`);
  releasePass();
  assertSpeed(1.5);
  assertHud(1.5, "pass");
  assertIce();

  fresh();
  passFor(0.02);
  assertSpeed(0.02);
  assertHud(0.02, "pass");
  assertIce();

  fresh();
  pressPass();
  clockMs += 750;
  step(1);
  const mid = useGame.getState();
  assert.equal(mid.chargeKind, "pass");
  assert.ok(Math.abs(mid.charge - 0.5) < 0.02, `mid charge ${mid.charge}`);
  releasePass();
  assertSpeed(0.75);
  assertHud(0.75, "pass");
  assertIce();

  fresh();
  passFor(2);
  assertSpeed(2);
  assertHud(2, "pass");
  assertIce();
});

test("Start at release is a saucer at the same speed, Select is not", () => {
  fresh();
  holdStart(true);
  passFor(0.02);
  assertSpeed(0.02);
  assertHud(0.02, "saucer");
  assertSaucer();

  fresh();
  holdStart(true);
  passFor(1.5);
  assertSpeed(1.5);
  assertHud(1.5, "saucer");
  assertSaucer();
  const charged = useGame.getState();
  assert.equal(charged.chargeKind, null);

  fresh();
  holdStart(true);
  pressPass();
  clockMs += 750;
  step(1);
  assert.equal(useGame.getState().chargeKind, "saucer");
  assert.equal(world.puck.owner, user().id);
  releasePass();
  assertSpeed(0.75);
  assertHud(0.75, "saucer");
  assertSaucer();

  fresh();
  holdSelect(true);
  passFor(1.5);
  assertSpeed(1.5);
  assertHud(1.5, "pass");
  assertIce();
});

test("hud release names are the four shots and both passes", () => {
  assert.equal(hudReleaseName("slap"), "slap shot");
  assert.equal(hudReleaseName("snap"), "snap shot");
  assert.equal(hudReleaseName("wrist"), "wrist shot");
  assert.equal(hudReleaseName("backhand"), "backhand shot");
  assert.equal(hudReleaseName("pass"), "pass");
  assert.equal(hudReleaseName("saucer"), "saucer pass");
  assert.equal(hudReleaseName(null), "Shot");
});

function parkGoalie() {
  for (const s of world.skaters) {
    if (s.kind !== "goalie") continue;
    s.x = -40;
    s.z = 30;
    s.vx = 0;
    s.vz = 0;
  }
}

test("sauce meter fills across 1s beside the pass meter and does not change pass speed", () => {
  fresh();
  holdStart(true);
  pressPass();
  clockMs += 500;
  step(1);
  const mid = useGame.getState();
  assert.equal(mid.chargeKind, "saucer");
  assert.equal(mid.chargeWind, "Saucer");
  assert.ok(Math.abs(mid.sauce - 0.5) < 0.04, `sauce ${mid.sauce}`);
  assert.ok(Math.abs(mid.charge - 0.5 / 1.5) < 0.04, `pass charge ${mid.charge}`);
  clockMs += 700;
  step(1);
  const full = useGame.getState();
  assert.ok(full.sauce > 0.99, `full sauce ${full.sauce}`);
  assert.ok(Math.abs(full.charge - 1.2 / 1.5) < 0.04, `pass charge ${full.charge}`);
  releasePass();
  assertSpeed(1.2);
  assertHud(1.2, "saucer");

  fresh();
  pressPass();
  clockMs += 500;
  step(1);
  const ice = useGame.getState();
  assert.equal(ice.chargeKind, "pass");
  assert.equal(ice.chargeWind, "Pass");
  assert.equal(ice.sauce, 0);
});

test("sauce starts on Start alone, and a full pass does not fill it", () => {
  fresh();
  holdStart(true);
  step(1);
  clockMs += 500;
  step(1);
  const early = useGame.getState();
  assert.equal(early.chargeKind, null);
  assert.equal(early.charge, 0);
  assert.equal(early.chargeWind, "Saucer");
  assert.ok(Math.abs(early.sauce - 0.5) < 0.04, `early sauce ${early.sauce}`);

  pressPass();
  const joined = useGame.getState();
  assert.equal(joined.chargeKind, "saucer");
  assert.ok(joined.charge < 0.05, `pass just started ${joined.charge}`);
  assert.ok(Math.abs(joined.sauce - 0.5) < 0.06, `sauce stayed ${joined.sauce}`);

  fresh();
  pressPass();
  clockMs += 1600;
  step(1);
  const fullPass = useGame.getState();
  assert.equal(fullPass.chargeKind, "pass");
  assert.ok(fullPass.charge > 0.99, `pass ${fullPass.charge}`);
  assert.equal(fullPass.sauce, 0);
  holdStart(true);
  step(1);
  const started = useGame.getState();
  assert.equal(started.chargeKind, "saucer");
  assert.ok(started.charge > 0.99, `pass stayed ${started.charge}`);
  assert.ok(started.sauce < 0.05, `sauce restart ${started.sauce}`);
  clockMs += 400;
  step(1);
  const mid = useGame.getState();
  assert.ok(mid.charge > 0.99, `pass still full ${mid.charge}`);
  assert.ok(Math.abs(mid.sauce - 0.4) < 0.05, `sauce ${mid.sauce}`);
});

test("a full pass plus a new sauce stays low, and sauce charged before a tap stays high", () => {
  fresh();
  parkGoalie();
  settleUser();
  user().z = 6;
  setInjectedAim(0, 1);
  pressPass();
  clockMs += 1600;
  step(1);
  holdStart(true);
  clockMs += 40;
  releasePass();
  assertSpeed(1.64);
  assertHud(1.64, "saucer");
  const low = yAtGoalLine();
  assert.ok(low !== null && low < GOAL_H * 0.45, `late sauce y ${low}`);

  fresh();
  parkGoalie();
  settleUser();
  user().z = 6;
  setInjectedAim(0, 1);
  holdStart(true);
  step(1);
  clockMs += 1100;
  step(1);
  pressPass();
  releasePass();
  assertSpeed(0);
  assertHud(0, "saucer");
  const high = yAtGoalLine();
  assert.ok(high !== null && high > GOAL_H * 0.9 && high < GOAL_H + 0.2, `early sauce y ${high}`);
});

function yAtGoalLine() {
  let crossed = null;
  for (let i = 0; i < 240; i++) {
    const prevX = world.puck.x;
    const prevY = world.puck.y;
    step(1);
    if (world.puck.owner !== null) break;
    if (prevX < GOAL_LINE_X && world.puck.x >= GOAL_LINE_X) {
      const t = (GOAL_LINE_X - prevX) / (world.puck.x - prevX || 1);
      crossed = prevY + (world.puck.y - prevY) * t;
      break;
    }
  }
  return crossed;
}

test("full sauce reaches the top of the net and a tap sauce stays low", () => {
  fresh();
  parkGoalie();
  settleUser();
  user().z = 6;
  setInjectedAim(0, 1);
  holdStart(true);
  pressPass();
  clockMs += 1200;
  releasePass();
  const high = yAtGoalLine();
  assert.ok(high !== null, "full sauce did not reach the goal line");
  assert.ok(high > GOAL_H * 0.9 && high < GOAL_H + 0.2, `full sauce y ${high} goal ${GOAL_H}`);

  fresh();
  parkGoalie();
  settleUser();
  user().z = 6;
  setInjectedAim(0, 1);
  holdStart(true);
  passFor(0.02);
  let peak = world.puck.y;
  for (let i = 0; i < 90; i++) {
    step(1);
    if (world.puck.y > peak) peak = world.puck.y;
    if (world.puck.x > GOAL_LINE_X - 1) break;
  }
  assert.ok(peak < GOAL_H * 0.45, `tap sauce peak ${peak}`);
});

function boardSauce(roll) {
  fresh();
  parkGoalie();
  settleUser();
  setInjectedAim(1, 0);
  holdStart(true);
  pressPass();
  clockMs += 1200;
  const real = Math.random;
  Math.random = () => roll;
  try {
    releasePass();
  } finally {
    Math.random = real;
  }
}

test("a full board saucer usually hits the glass high, and can still reach the crowd", () => {
  boardSauce(0.99);
  let bounced = false;
  let escaped = false;
  let peak = world.puck.y;
  for (let i = 0; i < 200; i++) {
    const prevVz = world.puck.vz;
    step(1);
    if (world.puck.owner !== null) break;
    if (world.puck.y > peak) peak = world.puck.y;
    if (world.puck.y > BOARD_H + GLASS_H - 0.05 && Math.abs(world.puck.z) > RINK_W / 2 - 0.15) escaped = true;
    if (prevVz > 0.4 && world.puck.vz < -0.2 && world.puck.y > BOARD_H + 0.45) bounced = true;
  }
  assert.equal(escaped, false);
  assert.ok(bounced, `glass bounce peak ${peak} z ${world.puck.z}`);
  assert.ok(peak > BOARD_H + GLASS_H * 0.45, `high glass peak ${peak}`);

  boardSauce(0);
  let back = false;
  for (let i = 0; i < 200; i++) {
    step(1);
    if (world.puck.owner === user().id && world.whistle === null && !world.stoppage) {
      back = true;
      break;
    }
  }
  assert.ok(back, "practice crowd entry did not return the puck");
  assert.equal(world.faceoff, false);

  fresh();
  parkGoalie();
  settleUser();
  setInjectedAim(1, 0);
  holdStart(true);
  passFor(0.02);
  let lowPeak = world.puck.y;
  let lowEscaped = false;
  for (let i = 0; i < 120; i++) {
    step(1);
    if (world.puck.y > lowPeak) lowPeak = world.puck.y;
    if (world.puck.y > BOARD_H + GLASS_H - 0.05 && Math.abs(world.puck.z) > RINK_W / 2 - 0.15) {
      lowEscaped = true;
    }
  }
  assert.equal(lowEscaped, false);
  assert.ok(lowPeak < BOARD_H + GLASS_H * 0.55, `tap board peak ${lowPeak}`);
});

test("B cancels a charged pass and does not release it", () => {
  fresh();
  pressPass();
  clockMs += 800;
  step(1);
  const charging = useGame.getState();
  assert.equal(charging.chargeKind, "pass");
  assert.ok(charging.charge > 0.4, `charge ${charging.charge}`);
  setInjectedKeys(["KeyE", "Space"]);
  step(1);
  const dropped = useGame.getState();
  assert.equal(dropped.chargeKind, null);
  assert.equal(dropped.charge, 0);
  assert.equal(dropped.sauce, 0);
  assert.equal(world.puck.owner, user().id);
  setInjectedKeys([]);
  step(1);
  assert.equal(world.puck.owner, user().id);
  assert.notEqual(world.lastPasser, user().id);

  holdStart(true);
  pressPass();
  clockMs += 400;
  step(1);
  assert.ok(useGame.getState().sauce > 0.3);
  setInjectedKeys(["KeyE", "Space"]);
  step(1);
  assert.equal(useGame.getState().chargeKind, null);
  assert.equal(useGame.getState().sauce, 0);
  setInjectedKeys([]);
  step(1);
  assert.equal(world.puck.owner, user().id);
});

test("shot charge fills continuously and the label previews wrist then slap", () => {
  fresh();
  setInjectedKeys(["KeyF"]);
  step(2);
  setInjectedKeys([]);
  step(1);
  assert.equal(useGame.getState().shotKind, "wrist");

  settleUser();
  setInjectedKeys(["KeyF"]);
  step(8);
  const brief = useGame.getState();
  assert.equal(brief.shotKind, "wrist");
  assert.equal(brief.chargeKind, "shot");
  assert.equal(brief.chargeWind, "Wrist");
  assert.equal(brief.chargeMark, 0.5);
  assert.ok(brief.charge < 0.5, `brief charge ${brief.charge}`);
  assert.ok(Math.abs(brief.charge - 8 / 60 / 1.5) < 0.04, `brief fill ${brief.charge}`);

  step(42);
  const loaded = useGame.getState();
  assert.equal(loaded.shotKind, "wrist");
  assert.equal(loaded.chargeWind, "Slap");
  assert.ok(loaded.charge >= 0.5, `slap fill ${loaded.charge}`);
  assert.equal(world.puck.owner, user().id);

  fresh();
  useGame.getState().setControlProfile("stick");
  settleUser();
  setInjectedAim(-0.9, 0);
  setInjectedKeys(["KeyF"]);
  step(50);
  const back = useGame.getState();
  assert.equal(back.chargeKind, "shot");
  assert.equal(back.chargeWind, "Backhand");
  assert.equal(back.chargeMark, null);
  assert.equal(world.puck.owner, user().id);
});

function ownGoalie() {
  fresh();
  const g = world.skaters.find((s) => s.kind === "goalie");
  assert.ok(g);
  world.userId = g.id;
  g.x = 0;
  g.z = 0;
  g.vx = 0;
  g.vz = 0;
  g.yaw = -Math.PI / 2;
  g.stun = 0;
  g.windup = 0;
  g.coverPose = 0;
  world.coverT = 0;
  world.puck.owner = g.id;
  world.puck.x = g.x;
  world.puck.z = g.z;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = -10;
  world.lastShoot = -10;
  world.shotWindupT = 0;
  return g;
}

test("a goalie pass is 45 to 85 mph and a goalie shot is 55 to 87", () => {
  ownGoalie();
  pressPass();
  releasePass();
  assert.ok(Math.abs(useGame.getState().speed - 45) < 1, `goalie tap pass ${useGame.getState().speed}`);

  ownGoalie();
  pressPass();
  clockMs += 1500;
  step(1);
  releasePass();
  assert.ok(Math.abs(useGame.getState().speed - 85) < 1, `goalie full pass ${useGame.getState().speed}`);

  ownGoalie();
  setInjectedKeys(["KeyF"]);
  step(1);
  setInjectedKeys([]);
  step(1);
  const tap = 55 + (87 - 55) * (1 / 60 / 1.5);
  assert.ok(Math.abs(useGame.getState().speed - tap) < 1.5, `goalie tap shot ${useGame.getState().speed}`);

  ownGoalie();
  setInjectedKeys(["KeyF"]);
  step(90);
  setInjectedKeys([]);
  step(1);
  assert.ok(Math.abs(useGame.getState().speed - 87) < 1, `goalie full shot ${useGame.getState().speed}`);
});
