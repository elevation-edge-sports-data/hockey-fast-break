/**
 * Headless Skill Stick: right-stick gestures, left-stick aim, plant deadzone,
 * and the X fallback. Classic and Wings stay on their own shot paths.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
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

const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const input = await server.ssrLoadModule("/src/game/input.ts");

const { resetWorld, stepSim, world, stickBlade } = sim;
const { useGame } = store;
const { setInjectedKeys, setInjectedAim } = input;

const DT = 1 / 60;

function step(n = 1, dt = DT) {
  for (let i = 0; i < n; i++) stepSim(dt);
}

function user() {
  return world.skaters[world.userId];
}

function localX(s = user()) {
  const ry = s.yaw + Math.PI;
  const dx = world.puck.x - s.x;
  const dz = world.puck.z - s.z;
  return dx * Math.cos(ry) - dz * Math.sin(ry);
}

function speed() {
  return useGame.getState().speed;
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
  world.lastShotSlap = false;
  world.lastShotBackhand = false;
  world.shotWindupT = 0;
  world.windupCancel = false;
}

function fresh(profile = "stick", mode = "drill") {
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  step(2);
  const ui = useGame.getState();
  ui.setClockMode(mode);
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile(profile);
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

function centerBlade() {
  const s = user();
  const b = stickBlade(s);
  s.z -= b.z;
  const next = stickBlade(s);
  world.puck.x = next.x;
  world.puck.z = next.z;
  world.puck.vx = 0;
  world.puck.vz = 0;
}

function hold(x, y, n = 4) {
  setInjectedKeys([]);
  setInjectedAim(x, y);
  step(n);
}

function release(x, y, keys = []) {
  setInjectedAim(x, y);
  setInjectedKeys(keys);
  step(1);
}

function shotOf() {
  return {
    kind: world.lastShotKind,
    ui: useGame.getState().shotKind,
    mph: speed(),
    slap: world.lastShotSlap,
    owner: world.puck.owner,
  };
}

test("profile stick persists and is not Wings", () => {
  fresh("stick");
  assert.equal(useGame.getState().controlProfile, "stick");
  assert.equal(localStorage.getItem("hfb-control-profile"), "stick");
  assert.equal(world.wingL, null);
  assert.equal(world.wingR, null);
});

test("up from neutral is a snap", () => {
  fresh();
  release(0, 1);
  const shot = shotOf();
  assert.equal(shot.kind, "snap");
  assert.equal(shot.ui, "snap");
  assert.equal(shot.slap, false);
  assert.ok(shot.mph > 81 && shot.mph < 86, `snap ${shot.mph}`);
  assert.equal(shot.owner, null);
});

test("right then up is a wrist, and a deeper roll is a harder wrist", () => {
  fresh();
  hold(0.9, -0.25);
  assert.equal(world.puck.owner, user().id);
  assert.equal(world.lastShoot, -10);
  assert.ok(localX() < 0);
  release(0, 1);
  const soft = shotOf();
  assert.equal(soft.kind, "wrist");
  assert.equal(soft.ui, "wrist");
  assert.ok(soft.mph > 72 && soft.mph < 76, `soft wrist ${soft.mph}`);

  fresh();
  hold(0.72, -0.48);
  release(0, 1);
  const hard = shotOf();
  assert.equal(hard.kind, "wrist");
  assert.ok(hard.mph > soft.mph + 3 && hard.mph < 83, `hard wrist ${hard.mph}`);
});

test("left then up is a backhand, including a slap load", () => {
  fresh();
  hold(-0.9, 0);
  assert.equal(user().stickPull, 1);
  assert.ok(localX() > 0);
  assert.equal(user().deke, 0);
  assert.equal(world.lastShoot, -10);
  release(0, 1);
  const back = shotOf();
  assert.equal(back.kind, "backhand");
  assert.equal(back.ui, "backhand");
  assert.equal(back.slap, false);
  assert.ok(back.mph > 58 && back.mph < 68, `backhand ${back.mph}`);
  assert.ok(user().follow > 0.4 && user().follow < 0.47, `follow ${user().follow}`);

  fresh();
  hold(-0.9, 0);
  hold(-0.39, -0.92, 3);
  assert.equal(user().stickPull, 1);
  assert.ok(user().windup < 0.5);
  release(0, 1);
  const loaded = shotOf();
  assert.equal(loaded.kind, "backhand");
  assert.equal(loaded.slap, false);
  assert.ok(loaded.mph > 58 && loaded.mph < 68, `loaded backhand ${loaded.mph}`);
});

test("pull back and a toe drag are slap, only on the forehand", () => {
  fresh();
  hold(0.39, -0.92, 3);
  assert.ok(user().windup > 0.5);
  assert.equal(user().stickPull, 0);
  release(0, 1);
  const solid = shotOf();
  assert.equal(solid.kind, "slap");
  assert.equal(solid.ui, "slap");
  assert.equal(solid.slap, true);
  assert.ok(solid.mph > 94 && solid.mph < 100, `solid slap ${solid.mph}`);
  assert.ok(user().follow > 0.55, `slap follow ${user().follow}`);

  fresh();
  hold(0, -1, 3);
  release(0, 1);
  const full = shotOf();
  assert.equal(full.kind, "slap");
  assert.ok(full.mph > 100, `full slap ${full.mph}`);

  fresh();
  hold(0.9, 0, 3);
  hold(0.39, -0.92, 3);
  release(0, 1);
  assert.equal(world.lastShotKind, "slap");
  assert.equal(world.lastShotSlap, true);
});

test("a side hold does not shoot, and a resting stick does not plant", () => {
  fresh();
  setInjectedKeys(["KeyW"]);
  setInjectedAim(0.2, 0);
  step(40);
  const coast = Math.hypot(user().vx, user().vz);
  assert.ok(coast > 3, `coast ${coast}`);
  assert.equal(world.puck.owner, user().id);
  assert.equal(world.lastShoot, -10);
  step(12);
  const still = Math.hypot(user().vx, user().vz);
  assert.ok(still > coast * 0.7, `deadzone skate ${still} from ${coast}`);
  setInjectedAim(0.9, 0);
  step(20);
  const planted = Math.hypot(user().vx, user().vz);
  assert.ok(planted < 0.5, `plant ${planted}`);
  assert.equal(world.puck.owner, user().id);
  assert.equal(world.lastShoot, -10);
  assert.equal(user().deke, 0);
});

test("the left stick aims and the right stick does not", () => {
  fresh();
  centerBlade();
  hold(0.9, -0.2, 3);
  release(-0.2, 0.98, ["KeyD"]);
  const right = world.puck.vz;
  assert.equal(world.lastShotKind, "wrist");
  assert.ok(right > 0.4, `ls right vz ${right}`);

  fresh();
  centerBlade();
  hold(0.9, -0.2, 3);
  release(-0.2, 0.98, ["KeyA"]);
  const left = world.puck.vz;
  assert.ok(left < -0.4, `ls left vz ${left}`);

  fresh("classic");
  centerBlade();
  setInjectedAim(1, 0);
  setInjectedKeys(["KeyF"]);
  step(2);
  setInjectedKeys([]);
  step(1);
  const classic = world.puck.vz;
  assert.equal(world.lastShotKind, "wrist");
  assert.ok(classic > 0.4, `classic rs vz ${classic}`);

  fresh("stick");
  centerBlade();
  setInjectedAim(1, 0);
  setInjectedKeys(["KeyF"]);
  step(2);
  setInjectedKeys([]);
  step(1);
  assert.equal(world.lastShotKind, "wrist");
  assert.ok(Math.abs(world.puck.vz) < classic * 0.45, `stick x vz ${world.puck.vz}`);
});

test("X tap is a wrist, X hold is a slap, and off-hand X is a backhand", async () => {
  fresh();
  setInjectedKeys(["KeyF"]);
  step(1);
  assert.equal(world.puck.owner, user().id);
  setInjectedKeys([]);
  step(1);
  const tap = shotOf();
  assert.equal(tap.kind, "wrist");
  assert.equal(tap.slap, false);
  assert.ok(tap.mph >= 69 && tap.mph < 80, `tap ${tap.mph}`);

  fresh();
  setInjectedAim(-0.9, 0);
  setInjectedKeys(["KeyF"]);
  step(3);
  assert.ok(localX() > 0);
  setInjectedKeys([]);
  step(1);
  const off = shotOf();
  assert.equal(off.kind, "backhand");
  assert.equal(off.slap, false);
  assert.ok(off.mph > 58 && off.mph < 68, `x backhand ${off.mph}`);

  fresh();
  setInjectedKeys(["KeyF"]);
  const t0 = performance.now();
  while (performance.now() - t0 < 360) {
    step(1, 0.12);
    await new Promise((r) => setTimeout(r, 40));
  }
  setInjectedKeys([]);
  step(1);
  const held = shotOf();
  assert.equal(held.kind, "slap");
  assert.equal(held.slap, true);
  assert.ok(held.mph >= 86, `x slap ${held.mph}`);

  fresh("classic");
  setInjectedKeys(["KeyQ", "KeyF"]);
  const t1 = performance.now();
  let backhand = false;
  while (performance.now() - t1 < 360) {
    step(1, 0.12);
    if (localX() > 0) backhand = true;
    await new Promise((r) => setTimeout(r, 40));
  }
  assert.equal(backhand, true);
  setInjectedKeys(["KeyQ"]);
  step(1);
  const classic = shotOf();
  assert.equal(classic.kind, "slap");
  assert.equal(classic.slap, true);
  assert.ok(classic.mph >= 86, `classic backhand slap ${classic.mph}`);
});

test("B cancels a loaded stick shot and Y still dekes", () => {
  fresh();
  hold(0, -1, 3);
  setInjectedKeys(["Space"]);
  setInjectedAim(0, -1);
  step(1);
  setInjectedKeys([]);
  release(0, 1);
  assert.equal(world.puck.owner, user().id);
  assert.equal(world.lastShoot, -10);

  fresh();
  setInjectedKeys(["Space"]);
  step(1);
  setInjectedKeys([]);
  release(0, 1);
  assert.equal(world.lastShotKind, "snap");

  fresh();
  setInjectedKeys(["KeyQ"]);
  step(1);
  assert.ok(user().deke > 0.5);
  assert.equal(world.lastShoot, -10);
  const held = user().deke;
  setInjectedKeys([]);
  setInjectedAim(-0.9, 0);
  step(4);
  assert.ok(user().deke < held - 0.04, `deke decay ${user().deke} from ${held}`);
  assert.equal(world.puck.owner, user().id);

  fresh();
  setInjectedAim(-0.9, 0);
  step(4);
  assert.equal(user().deke, 0);
  assert.equal(world.puck.owner, user().id);
});

test("Skill Stick does not claim wings and still dives on RT", () => {
  fresh("wings", "scrimmage");
  const s = user();
  const mate = world.skaters.find((p) => p.side === "home" && p.kind !== "goalie" && p.id !== s.id);
  assert.ok(mate);
  mate.x = s.x;
  mate.z = s.z - 3;
  mate.vx = 0;
  mate.vz = 0;
  mate.stun = 30;
  setInjectedKeys(["KeyG"]);
  step(2);
  assert.equal(world.wingL, mate.id);

  fresh("stick", "scrimmage");
  const s2 = user();
  const mate2 = world.skaters.find((p) => p.side === "home" && p.kind !== "goalie" && p.id !== s2.id);
  mate2.x = s2.x;
  mate2.z = s2.z - 3;
  mate2.vx = 0;
  mate2.vz = 0;
  mate2.stun = 30;
  setInjectedKeys(["KeyG", "ShiftLeft"]);
  step(2);
  assert.equal(world.wingL, null);
  assert.equal(world.wingR, null);

  fresh("stick");
  world.puck.owner = null;
  setInjectedKeys(["ShiftLeft"]);
  step(1);
  assert.ok(user().dive > 1);
});

function headingOf(s) {
  return { fx: -Math.sin(s.yaw), fz: -Math.cos(s.yaw) };
}

/** User faces +Z. Default camera forward is +X, so stick-up is not their current facing. */
function placeCarrier(x, z) {
  const s = user();
  const foe = world.skaters.find((p) => p.side === "away" && p.kind === "winger");
  assert.ok(foe);
  world.camFx = 1;
  world.camFz = 0;
  world.camRx = 0;
  world.camRz = 1;
  s.x = 0;
  s.z = 0;
  s.vx = 0;
  s.vz = 0;
  s.yaw = Math.PI;
  s.hit = 0;
  s.stun = 0;
  s.dive = 0;
  s.poke = 0;
  s.deke = 0;
  s.stickPull = 0;
  s.windup = 0;
  foe.x = x;
  foe.z = z;
  foe.vx = 0;
  foe.vz = 0;
  foe.hit = 0;
  foe.stun = 0;
  foe.struck = 0;
  foe.tumble = 0;
  foe.dive = 0;
  world.puck.owner = foe.id;
  world.puck.x = foe.x;
  world.puck.z = foe.z;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastShotKind = null;
  world.lastShoot = -10;
  world.lastHitTime = -10;
  world.ref.x = 22;
  world.ref.z = 8;
  world.ref.vx = 0;
  world.ref.vz = 0;
  world.ref.struck = 0;
  world.ref2.x = 22;
  world.ref2.z = -8;
  world.ref2.vx = 0;
  world.ref2.vz = 0;
  world.ref2.struck = 0;
  for (const o of world.skaters) {
    if (o.id === s.id || o.id === foe.id) continue;
    o.x = o.side === "home" ? -16 : 16;
    o.z = (o.id % 7) - 3;
    o.vx = 0;
    o.vz = 0;
    o.stun = 30;
    o.struck = 0;
    o.hit = 0;
  }
  return foe;
}

test("skill stick body check is one Y hit per right-stick push", () => {
  fresh("stick", "scrimmage");
  const foe = placeCarrier(1.1, 0);
  setInjectedAim(0, 1);
  step(1);
  const face = headingOf(user());
  assert.ok(face.fx > 0.9 && Math.abs(face.fz) < 0.2, `aimed ${face.fx} ${face.fz}`);
  assert.ok(foe.struck > 0, "carrier checked");
  assert.ok(foe.vx > 6 && Math.abs(foe.vz) < 4, `knock ${foe.vx} ${foe.vz}`);
  assert.equal(world.lastShotKind, null);
  const hitAt = world.lastHitTime;
  step(40);
  assert.equal(world.lastHitTime, hitAt);
  assert.equal(user().hit, 0);

  setInjectedAim(0, 0);
  step(2);
  foe.x = 1.1;
  foe.z = 0;
  foe.vx = 0;
  foe.vz = 0;
  foe.stun = 0;
  foe.struck = 0;
  foe.tumble = 0;
  user().x = 0;
  user().z = 0;
  user().vx = 0;
  user().vz = 0;
  user().yaw = Math.PI;
  user().hit = 0;
  world.puck.owner = foe.id;
  world.puck.x = foe.x;
  world.puck.z = foe.z;
  setInjectedAim(0, 1);
  step(1);
  assert.ok(foe.struck > 0, "second push checks again");

  fresh("stick", "scrimmage");
  setInjectedAim(0, 0);
  step(1);
  const mate = world.skaters.find((p) => p.side === "home" && p.kind !== "goalie" && p.id !== user().id);
  assert.ok(mate);
  placeCarrier(16, 2);
  mate.x = 1.1;
  mate.z = 0;
  mate.vx = 0;
  mate.vz = 0;
  mate.stun = 0;
  mate.struck = 0;
  mate.hit = 0;
  setInjectedAim(0, 1);
  step(1);
  assert.equal(mate.struck, 0);
  assert.ok(user().hit > 0, "empty lane still swings");

  fresh("stick", "scrimmage");
  const yFoe = placeCarrier(1.1, 0);
  user().yaw = -Math.PI / 2;
  setInjectedAim(0, 0);
  setInjectedKeys(["KeyQ"]);
  step(1);
  assert.ok(yFoe.struck > 0, "Y still checks");
  setInjectedKeys([]);

  fresh("stick", "scrimmage");
  const resting = placeCarrier(1.1, 0);
  user().yaw = -Math.PI / 2;
  setInjectedAim(0, 0.3);
  step(2);
  assert.equal(resting.struck, 0);
  assert.equal(user().hit, 0);

  fresh("stick", "scrimmage");
  const held = placeCarrier(12, 8);
  setInjectedAim(0, 1);
  step(1);
  assert.equal(world.lastShotKind, null);
  world.puck.owner = user().id;
  world.puck.x = user().x;
  world.puck.z = user().z;
  world.puck.vx = 0;
  world.puck.vz = 0;
  setInjectedAim(1, 0);
  step(3);
  assert.equal(user().stickPull, 0);
  assert.equal(world.lastShotKind, null);
  assert.equal(world.puck.owner, user().id);
  setInjectedAim(0, 1);
  step(2);
  assert.equal(world.lastShotKind, null, "defensive push must not snap");
  assert.equal(world.puck.owner, user().id);
  setInjectedAim(0, 0);
  step(2);
  setInjectedAim(0, 1);
  step(1);
  assert.equal(world.lastShotKind, "snap");
  assert.equal(held.struck, 0);

  fresh("stick", "scrimmage");
  const shotFoe = placeCarrier(1.1, 0);
  shotFoe.stun = 30;
  user().yaw = -Math.PI / 2;
  world.puck.owner = user().id;
  const blade = stickBlade(user());
  world.puck.x = blade.x;
  world.puck.z = blade.z;
  world.puck.vx = user().vx;
  world.puck.vz = user().vz;
  setInjectedAim(0, 0);
  step(1);
  setInjectedAim(0, 1);
  step(1);
  assert.equal(world.lastShotKind, "snap");
  assert.equal(shotFoe.struck, 0);
  assert.equal(user().hit, 0);

  fresh("classic", "scrimmage");
  const classicFoe = placeCarrier(1.1, 0);
  setInjectedAim(0, 1);
  step(3);
  assert.equal(classicFoe.struck, 0);
  assert.equal(user().hit, 0);
  assert.equal(world.lastShotKind, null);

  fresh("wings", "scrimmage");
  const wingsFoe = placeCarrier(1.1, 0);
  setInjectedAim(0, 1);
  step(3);
  assert.equal(wingsFoe.struck, 0);
  assert.equal(user().hit, 0);

  fresh("stick", "scrimmage");
  placeCarrier(8, 6);
  const crease = world.skaters.find((p) => p.kind === "goalie" && p.side === "away");
  assert.ok(crease);
  crease.x = 1.3;
  crease.z = 0;
  crease.vx = 0;
  crease.vz = 0;
  crease.stun = 30;
  crease.struck = 0;
  world.stoppage = true;
  world.whistle = "cover";
  world.stoppageT = 0.2;
  world.creasePokeN = 0;
  setInjectedAim(0, 1);
  step(1);
  assert.equal(world.creasePokeN, 1);
  setInjectedAim(0, 0);
});

test("skill stick RB plus right stick pokes once along the stick", () => {
  fresh("stick", "scrimmage");
  const foe = placeCarrier(1.1, 0);
  const hitAt = world.lastHitTime;
  setInjectedKeys(["KeyM"]);
  setInjectedAim(0, 1);
  step(1);
  const face = headingOf(user());
  assert.ok(face.fx > 0.9 && Math.abs(face.fz) < 0.2, `aimed ${face.fx} ${face.fz}`);
  assert.ok(user().poke > 0.2, "poke window");
  assert.equal(user().hit, 0);
  assert.equal(user().dive, 0);
  assert.ok(foe.struck > 0, "carrier poked");
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastShotKind, null);
  assert.equal(world.lastHitTime, hitAt);
  step(40);
  assert.equal(user().poke, 0, "holding RB must not refresh the poke");
  assert.equal(user().hit, 0);
  assert.equal(user().dive, 0);

  foe.x = 1.1;
  foe.z = 0;
  foe.vx = 0;
  foe.vz = 0;
  foe.stun = 30;
  foe.struck = 0;
  foe.tumble = 0;
  user().x = 0;
  user().z = 0;
  user().vx = 0;
  user().vz = 0;
  user().yaw = Math.PI;
  user().hit = 0;
  world.puck.owner = foe.id;
  world.puck.x = foe.x;
  world.puck.z = foe.z;
  world.puck.vx = 0;
  world.puck.vz = 0;
  step(8);
  assert.equal(user().poke, 0);
  assert.equal(foe.struck, 0);

  setInjectedAim(0, 0);
  step(2);
  foe.stun = 0;
  foe.struck = 0;
  foe.x = 1.1;
  foe.z = 0;
  foe.vx = 0;
  foe.vz = 0;
  user().x = 0;
  user().z = 0;
  user().yaw = Math.PI;
  user().vx = 0;
  user().vz = 0;
  world.puck.owner = foe.id;
  world.puck.x = foe.x;
  world.puck.z = foe.z;
  setInjectedAim(0, 1);
  step(1);
  assert.ok(user().poke > 0.2, "a new push pokes again");
  assert.equal(user().hit, 0);
  assert.ok(foe.struck > 0);

  fresh("stick", "scrimmage");
  const xFoe = placeCarrier(1.1, 0);
  const yawBefore = user().yaw;
  setInjectedKeys(["KeyF"]);
  setInjectedAim(0, 0);
  step(1);
  assert.ok(user().poke > 0, "X still pokes");
  assert.equal(user().hit, 0);
  assert.ok(xFoe.struck > 0);
  assert.ok(Math.abs(user().yaw - yawBefore) < 0.2, "X does not aim the stick");

  fresh("stick");
  setInjectedKeys(["KeyM"]);
  setInjectedAim(0, 0);
  step(1);
  setInjectedAim(0, 1);
  step(1);
  assert.equal(world.lastShotKind, "snap");
  assert.equal(world.puck.owner, null);
  assert.equal(user().hit, 0);
  assert.equal(user().poke, 0);
  assert.equal(user().dive, 0);

  fresh("stick", "scrimmage");
  placeCarrier(1.1, 0);
  setInjectedKeys(["KeyM"]);
  setInjectedAim(0, 0);
  step(3);
  assert.equal(user().dive, 0);
  assert.equal(user().poke, 0);
  assert.equal(user().hit, 0);

  fresh("classic", "scrimmage");
  const classicFoe = placeCarrier(1.1, 0);
  setInjectedKeys(["KeyM"]);
  setInjectedAim(0, 1);
  step(3);
  assert.equal(classicFoe.struck, 0);
  assert.equal(user().hit, 0);
  assert.equal(user().poke, 0);
  assert.equal(user().dive, 0);

  fresh("wings", "scrimmage");
  world.puck.owner = null;
  setInjectedKeys(["KeyM"]);
  setInjectedAim(0, 1);
  step(1);
  assert.ok(user().dive > 1, "Wings RB still dives");
  assert.equal(user().hit, 0);
});

test("classic up on the right stick does not snap", () => {
  fresh("classic");
  setInjectedAim(0, 1);
  step(4);
  assert.equal(world.puck.owner, user().id);
  assert.equal(world.lastShotKind, null);
  setInjectedKeys(["KeyF"]);
  step(1);
  assert.equal(world.puck.owner, user().id);
  setInjectedKeys([]);
  step(1);
  assert.equal(world.lastShotKind, "wrist");
  assert.notEqual(world.lastShotKind, "snap");
});

test.after(() => server.close());
