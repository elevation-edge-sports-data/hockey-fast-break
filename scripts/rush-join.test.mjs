/**
 * Headless check for offensive-zone rush join.
 * Both teams' forwards leave with the carrier before the attacking blue,
 * stay onside until the puck is in, then cross instead of parking outside.
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
const rink = await server.ssrLoadModule("/src/game/rink.ts");
const input = await server.ssrLoadModule("/src/game/input.ts");

const { resetWorld, stepSim, world } = sim;
const { useGame } = store;
const { BLUE_X, BLUE_LINE_W } = rink;
const { setInjectedKeys } = input;

const DT = 1 / 60;
const EDGE = BLUE_X + BLUE_LINE_W * 0.5;

function fresh() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.homeAttack = 1;
}

function wings(side) {
  return world.skaters
    .filter((s) => s.side === side && s.kind === "winger")
    .sort((a, b) => a.id - b.id);
}

function defs(side) {
  return world.skaters
    .filter((s) => s.side === side && s.kind === "defense")
    .sort((a, b) => a.id - b.id);
}

/** Stun everyone who is not in the play, off the lane. */
function parkBench(keep) {
  let n = 0;
  for (const s of world.skaters) {
    if (keep.has(s.id) || s.kind === "goalie") continue;
    const dir = s.side === "home" ? -1 : 1;
    s.x = dir * 22;
    s.z = -11 + (n % 5) * 1.4;
    s.vx = 0;
    s.vz = 0;
    s.stun = 40;
    n += 1;
  }
}

function pinCarrier(s, x, z, vx) {
  s.x = x;
  s.z = z;
  s.vx = vx;
  s.vz = 0;
  s.stun = 0;
  s.yaw = s.side === "home" ? -Math.PI / 2 : Math.PI / 2;
  const puck = world.puck;
  puck.owner = s.id;
  puck.x = x;
  puck.z = z;
  puck.y = 0.05;
  puck.vx = vx;
  puck.vz = 0;
  puck.vy = 0;
  world.lastPass = world.time;
  world.lastShoot = world.time;
  world.whistle = null;
  world.stoppage = false;
  world.faceoff = false;
}

function stepN(n, before) {
  for (let i = 0; i < n; i++) {
    before();
    stepSim(DT);
  }
}

test("home forwards join before the attacking blue and cross on entry", () => {
  fresh();
  const user = world.skaters[world.userId];
  assert.equal(user.side, "home");
  assert.equal(user.kind, "winger");
  const mates = wings("home").filter((s) => s.id !== user.id);
  const backs = defs("home");
  assert.ok(mates.length >= 2);
  assert.ok(backs.length >= 2);
  const keep = new Set([user.id, ...mates.map((s) => s.id), ...backs.map((s) => s.id)]);
  parkBench(keep);
  mates.forEach((s, i) => {
    s.x = -11;
    s.z = i === 0 ? -3.35 : 3.35;
    s.vx = 0;
    s.vz = 0;
    s.stun = 0;
  });
  backs.forEach((s, i) => {
    s.x = -18;
    s.z = i % 2 === 0 ? -8.2 : 8.2;
    s.vx = 0;
    s.vz = 0;
    s.stun = 0;
  });

  stepN(120, () => pinCarrier(user, -4, 0, 8));
  assert.equal(world.whistle, null);
  assert.ok(world.puck.x < 0, `puck left the defensive half (${world.puck.x.toFixed(2)})`);
  for (const s of mates) {
    assert.ok(s.x < EDGE - 0.15, `winger ${s.id} crossed early at ${s.x.toFixed(2)}`);
    assert.ok(
      s.x > 5.2,
      `winger ${s.id} stayed back at ${s.x.toFixed(2)} while the carrier was still in the defensive half`,
    );
  }
  for (const s of backs) {
    assert.ok(s.x < EDGE - 0.15, `defense ${s.id} crossed early at ${s.x.toFixed(2)}`);
    assert.ok(s.x > 0, `defense ${s.id} did not join (x=${s.x.toFixed(2)})`);
  }

  stepN(90, () => pinCarrier(user, EDGE + 1.6, 0, 3));
  assert.equal(world.whistle, null);
  for (const s of mates) {
    assert.ok(s.x > EDGE + 0.45, `winger ${s.id} parked outside at ${s.x.toFixed(2)} after entry`);
    assert.ok(s.x < EDGE + 6, `winger ${s.id} left the entry lane at ${s.x.toFixed(2)}`);
  }
  for (const s of backs) {
    assert.ok(s.x > EDGE + 0.2, `defense ${s.id} stayed outside at ${s.x.toFixed(2)} after entry`);
  }
});

test("a held neutral-zone spot is dropped once the puck enters", () => {
  fresh();
  const user = world.skaters[world.userId];
  const mates = wings("home").filter((s) => s.id !== user.id);
  parkBench(new Set([user.id, ...mates.map((s) => s.id)]));
  mates.forEach((s, i) => {
    s.x = 1;
    s.z = i === 0 ? -2 : 2;
    s.vx = 0;
    s.vz = 0;
    s.stun = 0;
  });

  // Stopped in the offensive half of the neutral zone: support can hold a spot.
  stepN(100, () => pinCarrier(user, 4, 0, 0));
  assert.equal(world.whistle, null);
  for (const s of mates) {
    assert.ok(s.x > 4.8, `winger ${s.id} never took a neutral-zone spot (${s.x.toFixed(2)})`);
    assert.ok(s.x < EDGE - 0.15, `winger ${s.id} was offside before entry (${s.x.toFixed(2)})`);
  }

  // Past the rush window, so only a dropped hold lets supportSpot leave the stripe.
  stepN(110, () => pinCarrier(user, EDGE + 8, 0, 0));
  assert.equal(world.whistle, null);
  for (const s of mates) {
    assert.ok(
      s.x > EDGE + 1.2,
      `winger ${s.id} kept the neutral-zone hold at ${s.x.toFixed(2)}`,
    );
  }
});

test("away forwards use the same join and the user is not steered", () => {
  fresh();
  const user = world.skaters[world.userId];
  user.x = 18;
  user.z = 11;
  user.vx = 0;
  user.vz = 0;
  for (const s of world.skaters) {
    if (s.side === "home" && s.id !== user.id) s.stun = 30;
  }
  const awayW = wings("away");
  assert.ok(awayW.length >= 3);
  const carrier = awayW[0];
  const mates = awayW.slice(1);
  mates.forEach((s, i) => {
    s.x = 10;
    s.z = i % 2 === 0 ? -4 : 4.5;
    s.vx = 0;
    s.vz = 0;
    s.stun = 0;
  });
  const x0 = user.x;
  const z0 = user.z;
  stepN(80, () => pinCarrier(carrier, -1, 0, -7));
  assert.equal(world.whistle, null);
  assert.ok(world.puck.x > -EDGE + 0.2, `puck entered early (${world.puck.x})`);
  for (const s of mates) {
    assert.ok(s.x < 5, `away winger ${s.id} did not join (x=${s.x.toFixed(2)})`);
    assert.ok(s.x > -EDGE + 0.15, `away winger ${s.id} crossed early at ${s.x.toFixed(2)}`);
  }
  assert.ok(Math.abs(user.x - x0) < 0.45, `user was steered in x to ${user.x}`);
  assert.ok(Math.abs(user.z - z0) < 0.45, `user was steered in z to ${user.z}`);
});

test("a live team pass through the neutral zone starts the join", () => {
  fresh();
  for (const s of world.skaters) {
    if (s.side === "home") s.stun = 30;
  }
  const awayW = wings("away");
  const passer = awayW[0];
  const mates = awayW.slice(1);
  mates.forEach((s, i) => {
    s.x = 9;
    s.z = i % 2 === 0 ? -3.5 : 3.5;
    s.vx = 0;
    s.vz = 0;
    s.stun = 0;
  });
  stepN(70, () => {
    passer.x = 2;
    passer.z = 0;
    passer.vx = 0;
    passer.vz = 0;
    world.puck.owner = null;
    world.puck.x = -1;
    world.puck.z = 0;
    world.puck.y = 0.05;
    world.puck.vx = -12;
    world.puck.vz = 0;
    world.puck.vy = 0;
    world.lastPasser = passer.id;
    world.lastPassTo = null;
    world.lastPass = world.time;
    world.lastShoot = -10;
    world.faceoff = false;
    world.stoppage = false;
    world.whistle = null;
  });
  assert.equal(world.whistle, null);
  for (const s of mates) {
    assert.ok(s.x < 5.5, `pass did not pull away winger ${s.id} (x=${s.x.toFixed(2)})`);
    assert.ok(s.x > -EDGE + 0.15, `winger ${s.id} crossed ahead of the pass (${s.x.toFixed(2)})`);
  }
});
