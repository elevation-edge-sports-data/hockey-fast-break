/**
 * User pass power follows how long A is held. A skater tap is 55 mph and 1.5s is 95.
 * A goalie tap is 45 mph and 1.5s is 85. A goalie shot tap is 55 mph and a full hold is 87.
 * Select (gamepad button 8) held at release makes that pass a saucer.
 * Sauce height is a second curve on that hold: empty at the tap, full at 1s.
 * Select held alone for 2s, with A never down, releases a high clear.
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
const { GOAL_H, GOAL_LINE_X, BOARD_H, GLASS_H, RINK_W, RINK_L, BLUE_X } = rink;

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

function assertSauceFull() {
  const got = mph();
  const dragged = 86 * Math.exp(-0.2 * DT);
  const ui = useGame.getState();
  assert.equal(ui.shotKind, "saucer");
  assert.ok(Math.abs(ui.speed - 86) < 1.4, `hud ${ui.speed.toFixed(2)}`);
  assert.ok(Math.abs(got - dragged) < 1.6, `full sauce ${got.toFixed(2)} want ${dragged.toFixed(2)}`);
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

test("Select at release is a saucer at the same speed, Start is not", () => {
  fresh();
  holdSelect(true);
  passFor(0.02);
  assertSpeed(0.02);
  assertHud(0.02, "saucer");
  assertSaucer();

  fresh();
  holdSelect(true);
  passFor(1.5);
  assertSauceFull();
  assertSaucer();
  const charged = useGame.getState();
  assert.equal(charged.chargeKind, null);

  fresh();
  holdSelect(true);
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
  holdStart(true);
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
  holdSelect(true);
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
  assertSauceFull();

  fresh();
  pressPass();
  clockMs += 500;
  step(1);
  const ice = useGame.getState();
  assert.equal(ice.chargeKind, "pass");
  assert.equal(ice.chargeWind, "Pass");
  assert.equal(ice.sauce, 0);
});

test("sauce starts on Select alone, and a full pass does not fill it", () => {
  fresh();
  holdSelect(true);
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
  holdSelect(true);
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
  holdSelect(true);
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
  holdSelect(true);
  step(1);
  clockMs += 1100;
  step(1);
  pressPass();
  releasePass();
  assertSauceFull();
  const lob = sauceLob();
  assert.ok(lob.peak > 2.4, `early sauce peak ${lob.peak}`);
  assert.ok(lob.floor < lob.peak * 0.45, `early sauce did not come down ${lob.floor} peak ${lob.peak}`);
});

function sauceLob() {
  let peak = world.puck.y;
  let floor = world.puck.y;
  let afterPeak = false;
  for (let i = 0; i < 220; i++) {
    step(1);
    if (world.puck.owner !== null && world.whistle === null) break;
    if (world.puck.y > peak) peak = world.puck.y;
    if (peak > 0.8 && world.puck.y < peak - 0.3) afterPeak = true;
    if (afterPeak && world.puck.y < floor) floor = world.puck.y;
    if (afterPeak && world.puck.y <= 0.08) break;
  }
  return { peak, floor: afterPeak ? floor : world.puck.y };
}

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
  holdSelect(true);
  pressPass();
  clockMs += 1200;
  const real = Math.random;
  Math.random = () => 0;
  try {
    releasePass();
  } finally {
    Math.random = real;
  }
  assertSauceFull();
  const lob = sauceLob();
  assert.ok(lob.peak > 2.4, `full sauce peak ${lob.peak}`);
  assert.ok(lob.floor < 0.45, `full sauce floor ${lob.floor}`);

  fresh();
  parkGoalie();
  settleUser();
  user().z = 6;
  setInjectedAim(0, 1);
  holdSelect(true);
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
  holdSelect(true);
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
  holdSelect(true);
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

  holdSelect(true);
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

function parkOthers() {
  const me = user().id;
  for (const s of world.skaters) {
    if (s.id === me) continue;
    s.x = -58;
    s.z = (s.id % 7) * 3 - 9;
    s.vx = 0;
    s.vz = 0;
  }
}

test("a 2s Select hold with A never down releases a high clear", () => {
  fresh();
  parkGoalie();
  settleUser();
  parkOthers();
  user().z = 0;
  setInjectedAim(0, 1);
  holdSelect(true);
  step(1);
  clockMs += 2050;
  step(1);
  const winding = useGame.getState();
  assert.equal(winding.chargeWind, "Clear");
  assert.equal(winding.chargeKind, null);
  assert.ok(winding.sauce > 0.99, `clear sauce ${winding.sauce}`);
  assert.equal(world.puck.owner, user().id);
  holdSelect(false);
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(useGame.getState().shotKind, "saucer");
  let peak = world.puck.y;
  for (let i = 0; i < 180; i++) {
    step(1);
    if (world.puck.y > peak) peak = world.puck.y;
    if (world.puck.owner !== null) break;
  }
  assert.ok(peak > GOAL_H + 1.15, `clear peak ${peak}`);

  fresh();
  parkGoalie();
  settleUser();
  parkOthers();
  setInjectedAim(0, 1);
  holdSelect(true);
  step(1);
  pressPass();
  clockMs += 2100;
  step(1);
  holdSelect(false);
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(useGame.getState().shotKind, "saucer");
  assertSauceFull();
});

test("a user goalie sauces on Select release, and a 2s hold is a clear", () => {
  const g = ownGoalie();
  parkOthers();
  g.x = 0;
  g.z = 0;
  setInjectedAim(0, 1);
  holdSelect(true);
  step(1);
  clockMs += 450;
  step(1);
  assert.ok(useGame.getState().sauce > 0.35, `goalie sauce ${useGame.getState().sauce}`);
  assert.equal(world.puck.owner, g.id);
  holdSelect(false);
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(useGame.getState().shotKind, "saucer");
  assert.ok(world.puck.vy > 1.2, `goalie saucer vy ${world.puck.vy}`);

  const g2 = ownGoalie();
  parkOthers();
  g2.x = 0;
  g2.z = 0;
  setInjectedAim(0, 1);
  holdSelect(true);
  step(1);
  clockMs += 2100;
  step(1);
  assert.equal(useGame.getState().chargeWind, "Clear");
  holdSelect(false);
  step(1);
  assert.equal(world.puck.owner, null);
  assert.equal(useGame.getState().shotKind, "saucer");
  let peak = world.puck.y;
  for (let i = 0; i < 160; i++) {
    step(1);
    if (world.puck.y > peak) peak = world.puck.y;
    if (world.puck.owner !== null) break;
  }
  assert.ok(peak > GOAL_H + 1.15, `goalie clear peak ${peak}`);
});

test("a full sauce releases on Select as soon as the meter fills", () => {
  fresh();
  parkGoalie();
  settleUser();
  parkOthers();
  user().z = 0;
  setInjectedAim(0, 1);
  holdSelect(true);
  step(1);
  clockMs += 1000;
  step(1);
  const full = useGame.getState();
  assert.ok(full.sauce > 0.99, `sauce ${full.sauce}`);
  assert.equal(full.chargeKind, null);
  assert.equal(world.puck.owner, user().id);
  const real = Math.random;
  Math.random = () => 0;
  holdSelect(false);
  try {
    step(1);
  } finally {
    Math.random = real;
  }
  assert.equal(world.puck.owner, null);
  assertSauceFull();
  const lob = sauceLob();
  assert.ok(lob.peak > 2.4, `release peak ${lob.peak}`);
  assert.ok(lob.floor < 0.5, `release floor ${lob.floor}`);
});

test("full sauce landing follows the zone, and the ice takes speed with charge", () => {
  function place(x) {
    fresh();
    parkGoalie();
    settleUser();
    parkOthers();
    const s = user();
    s.x = x;
    s.z = 0;
    s.yaw = -Math.PI / 2;
    const b = stickBlade(s);
    world.puck.owner = s.id;
    world.puck.x = b.x;
    world.puck.z = b.z;
    setInjectedAim(0, 1);
  }
  function fire(roll) {
    holdSelect(true);
    step(1);
    clockMs += 1100;
    step(1);
    const real = Math.random;
    Math.random = () => roll;
    holdSelect(false);
    try {
      step(1);
    } finally {
      Math.random = real;
    }
  }
  function track() {
    let peak = world.puck.y;
    let cleared = false;
    let glass = false;
    let iced = null;
    for (let i = 0; i < 240; i++) {
      const prevY = world.puck.y;
      const prevVx = world.puck.vx;
      step(1);
      if (world.puck.y > peak) peak = world.puck.y;
      if (world.puck.y > BOARD_H + GLASS_H - 0.02 && Math.abs(world.puck.x) > RINK_L / 2 - 1.2) cleared = true;
      if (prevVx > 0.4 && world.puck.vx < -0.15 && world.puck.y > BOARD_H + 0.8) glass = true;
      if (iced === null && prevY > 0.15 && world.puck.y <= 0.08) {
        iced = world.puck.x;
      }
      if (world.puck.owner !== null) break;
    }
    return { peak, cleared, glass, iced };
  }

  place(16);
  fire(0);
  const crowd = track();
  assert.ok(crowd.cleared || world.puck.owner === user().id, `oz crowd peak ${crowd.peak}`);
  assert.ok(crowd.peak > BOARD_H + GLASS_H * 0.7, `oz peak ${crowd.peak}`);

  place(16);
  fire(0.85);
  const glassHit = track();
  assert.equal(glassHit.cleared, false);
  assert.ok(glassHit.glass, `oz glass peak ${glassHit.peak} y ${world.puck.y}`);

  place(4);
  fire(0.5);
  const neutral = track();
  assert.equal(neutral.cleared, false);
  assert.ok(neutral.glass, `attacking neutral peak ${neutral.peak}`);

  place(-16);
  fire(0);
  const own = track();
  assert.equal(own.cleared, false);
  assert.ok(own.peak > 2.2, `own zone peak ${own.peak}`);
  assert.ok(own.iced !== null && own.iced > BLUE_X && own.iced < GOAL_LINE_X, `own zone ice at ${own.iced}`);

  place(0);
  fire(0);
  let before = 0;
  let after = 0;
  let seen = false;
  for (let i = 0; i < 220; i++) {
    const y0 = world.puck.y;
    const v0 = Math.hypot(world.puck.vx, world.puck.vz);
    step(1);
    if (!seen && y0 > 0.15 && world.puck.y <= 0.08) {
      before = v0;
      after = Math.hypot(world.puck.vx, world.puck.vz);
      seen = true;
      break;
    }
  }
  assert.ok(seen, "full sauce never landed");
  assert.ok(after / before < 0.55, `full keep ${after / before}`);

  fresh();
  parkGoalie();
  settleUser();
  parkOthers();
  setInjectedAim(0, 1);
  holdSelect(true);
  passFor(0.02);
  let tapSeen = false;
  let tapKeep = 1;
  let tapAir = 0;
  for (let i = 0; i < 160; i++) {
    const y0 = world.puck.y;
    const v0 = Math.hypot(world.puck.vx, world.puck.vz);
    step(1);
    if (world.puck.y > tapAir) tapAir = world.puck.y;
    if (tapAir > 0.08 && y0 > 0.055 && world.puck.y <= 0.05) {
      tapKeep = Math.hypot(world.puck.vx, world.puck.vz) / Math.max(0.01, v0);
      tapSeen = true;
      break;
    }
  }
  assert.ok(tapSeen, `tap sauce never landed, peak ${tapAir}`);
  assert.ok(tapKeep > 0.9, `tap keep ${tapKeep}`);
});

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
