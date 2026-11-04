/**
 * Switching onto a live pass follows who can play the puck now.
 * The skater named when the pass was released does not keep the switch
 * after the puck has gone past them.
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
after(() => server.close());

const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const input = await server.ssrLoadModule("/src/game/input.ts");

const { resetWorld, stepSim, world, stickBlade } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;

const DT = 1 / 60;

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function padButton(pressed) {
  return { pressed, touched: pressed, value: pressed ? 1 : 0 };
}

function setPad(axes) {
  const buttons = Array.from({ length: 17 }, () => padButton(false));
  pads = [
    {
      id: "test-standard",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: 1,
      axes,
      buttons,
    },
  ];
}

function clearPad() {
  pads = [];
  setInjectedKeys([]);
}

function fresh() {
  clearPad();
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(false);
  ui.setIgnoreAutoFind(false);
  ui.setPassLock(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("classic");
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.faceoffA = false;
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.periodOver = false;
  world.replay = false;
  world.camFx = 1;
  world.camFz = 0;
  world.camRx = 0;
  world.camRz = 1;
  // Drop a latched A from the previous test before this one places skaters.
  step(1);
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.faceoffA = false;
  world.stoppage = false;
  world.whistle = null;
}

function user() {
  return world.skaters[world.userId];
}

function homeDefs() {
  return world.skaters
    .filter((s) => s.side === "home" && s.kind === "defense")
    .sort((a, b) => a.id - b.id);
}

function park(s, x, z) {
  s.x = x;
  s.z = z;
  s.vx = 0;
  s.vz = 0;
  s.struck = 0;
  s.tumble = 0;
  s.stun = 0;
  s.dive = 0;
  s.hit = 0;
  s.poke = 0;
}

function giveUserPuck() {
  const s = user();
  park(s, 0, 0);
  s.yaw = -Math.PI / 2;
  const b = stickBlade(s);
  world.puck.owner = s.id;
  world.puck.x = b.x;
  world.puck.z = b.z;
  world.puck.y = 0.04;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.userPossessedAt = world.time - 1;
  world.lastPass = -10;
  world.lastPassTo = null;
  world.lastPasser = null;
  world.lastShoot = -10;
}

/** Stick up on the default camera. Pass tests treat this as world +X. */
function releasePassUpIce() {
  clearPad();
  setInjectedKeys(["KeyE"]);
  step(1);
  setPad([0, 0, 0, -1]);
  setInjectedKeys([]);
  step(1);
  clearPad();
}

function pressSwitch() {
  setInjectedKeys(["KeyE"]);
  step(1);
  setInjectedKeys([]);
}

test("a pass that has run past its target switches to the player on the puck", () => {
  fresh();
  const [ld, rd] = homeDefs();
  assert.ok(ld && rd);
  giveUserPuck();
  park(ld, 8, 0.2);
  let slot = 0;
  for (const s of world.skaters) {
    if (s.id === user().id || s.id === ld.id) continue;
    slot += 1;
    park(s, -22 - (slot % 3), -8 + slot * 1.4);
  }
  releasePassUpIce();
  assert.equal(world.puck.owner, null);
  assert.equal(world.lastPasser, user().id);
  assert.equal(world.lastPassTo, ld.id, "the lane defender is the named receiver");

  const px = ld.x + 12;
  const pz = ld.z + 7;
  world.puck.owner = null;
  world.puck.x = px;
  world.puck.z = pz;
  world.puck.y = 0.04;
  world.puck.vx = 11;
  world.puck.vz = 4;
  world.puck.vy = 0;
  park(ld, ld.x, ld.z);
  park(rd, px - 1.2, pz - 3.6);
  park(user(), 0, 0);
  for (const s of world.skaters) {
    if (s.id === ld.id || s.id === rd.id || s.id === user().id) continue;
    if (s.side !== "home" || s.kind === "goalie") continue;
    park(s, -24, s.z);
  }

  const passer = user().id;
  pressSwitch();
  assert.equal(world.puck.owner, null, "the puck is still loose");
  assert.notEqual(world.userId, passer);
  assert.equal(world.userId, rd.id);
  assert.notEqual(world.userId, ld.id);
});

test("the named receiver still gets the switch when they are the best play", () => {
  fresh();
  const [ld, rd] = homeDefs();
  giveUserPuck();
  park(ld, 7.5, 0.15);
  let slot = 0;
  for (const s of world.skaters) {
    if (s.id === user().id || s.id === ld.id) continue;
    slot += 1;
    park(s, -22 - (slot % 3), -8 + slot * 1.4);
  }
  releasePassUpIce();
  assert.equal(world.lastPassTo, ld.id);
  assert.equal(world.puck.owner, null);
  park(rd, -20, 6);
  pressSwitch();
  assert.equal(world.puck.owner, null);
  assert.equal(world.userId, ld.id);
});

test("a loose puck with no live pass still goes to the nearest teammate", () => {
  fresh();
  const mates = world.skaters.filter(
    (s) => s.side === "home" && s.id !== world.userId && s.kind !== "goalie",
  );
  const near = mates[0];
  assert.ok(near);
  park(user(), 8, 0);
  world.puck.owner = null;
  world.puck.x = -12;
  world.puck.z = 2;
  world.puck.y = 0.04;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = -10;
  world.lastPassTo = null;
  world.lastShoot = -10;
  park(near, -12, 4.2);
  let slot = 0;
  for (const s of world.skaters) {
    if (s.id === near.id || s.id === user().id) continue;
    slot += 1;
    park(s, 18, -6 + slot);
  }
  pressSwitch();
  assert.equal(world.userId, near.id);
});

test("an opponent rush still switches to the skater who can cut the lane", () => {
  fresh();
  const [ld, rd] = homeDefs();
  const decoy = world.skaters.find(
    (s) => s.side === "home" && s.kind === "winger" && s.id !== world.userId,
  );
  const carrier = world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
  assert.ok(ld && rd && decoy && carrier);
  park(user(), -6, 0);
  park(decoy, 10, 0);
  park(ld, -18, 8);
  park(rd, 18, 0.4);
  let slot = 0;
  for (const s of world.skaters) {
    if (s.id === user().id || s.id === decoy.id || s.id === ld.id || s.id === rd.id || s.id === carrier.id)
      continue;
    slot += 1;
    park(s, -16, -8 + slot * 1.6);
  }
  park(carrier, 12, 0);
  carrier.vx = 4;
  carrier.vz = 0;
  world.puck.owner = carrier.id;
  world.puck.x = carrier.x;
  world.puck.z = carrier.z;
  world.puck.y = 0.04;
  world.puck.vx = carrier.vx;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = -10;
  world.lastPassTo = null;
  world.lastShoot = -10;
  pressSwitch();
  assert.equal(world.userId, rd.id);
});
