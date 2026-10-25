/**
 * CPU goalie clears and sauces stay in the rink. A CPU skater high clear
 * can still sail out, but only rarely, and only on the arc that used to.
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
const { resetWorld, stepSim, world } = sim;
const { useGame } = store;
const { GOAL_LINE_X, resolveRink, wallTop } = rink;
const DT = 1 / 60;

function step(n = 1) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function aboveGlass(x, z, y) {
  const hit = resolveRink(x, z, 0.09);
  if (!hit.hit) return false;
  return y > wallTop(hit.nx, hit.nz, hit.x, hit.z) - 0.02;
}

function flewOut() {
  for (let i = 0; i < 360; i++) {
    step(1);
    if (world.whistle === "crowd" || aboveGlass(world.puck.x, world.puck.z, world.puck.y)) return true;
    if (world.puck.owner !== null && i > 8) return false;
    if (world.whistle) return false;
    if (world.puck.y <= 0.08 && i > 10) return false;
  }
  return false;
}

function fresh() {
  useGame.getState().setClockMode("game");
  useGame.getState().setOffsides(false);
  useGame.getState().setPlaying(true);
  resetWorld();
  world.homeAttack = -1;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.periodOver = false;
  world.replay = false;
  world.faceoffA = false;
  world.coverT = 0.9;
  world.lastPass = -10;
  world.lastShoot = -10;
}

test("a CPU goalie clear never leaves the rink", () => {
  let plays = 0;
  let outs = 0;
  let high = 0;
  for (const z of [0, 4, 8, -7]) {
    for (let seed = 1; seed <= 24; seed++) {
      const real = Math.random;
      Math.random = mulberry32(seed + Math.round((z + 20) * 100));
      try {
        fresh();
        const g = world.skaters.find((s) => s.kind === "goalie" && s.side === "away");
        assert.ok(g);
        g.x = -(GOAL_LINE_X - 1.1);
        g.z = z;
        g.vx = 0;
        g.vz = 0;
        g.yaw = -Math.PI / 2;
        g.stun = 0;
        g.coverPose = 0;
        g.gloveFlash = 0;
        g.struck = 0;
        g.tumble = 0;
        world.userId = world.skaters.find((s) => s.side === "home" && s.kind !== "goalie").id;
        world.puck.owner = g.id;
        world.puck.x = g.x;
        world.puck.z = g.z;
        world.puck.y = 0.042;
        world.puck.vx = 0;
        world.puck.vz = 0;
        world.puck.vy = 0;
        for (const s of world.skaters) {
          if (s.id === g.id) continue;
          s.x = 40;
          s.z = ((s.id % 9) - 4) * 2;
          s.vx = 0;
          s.vz = 0;
        }
        const owner = g.id;
        step(1);
        if (world.puck.owner === owner) continue;
        plays++;
        if (world.puck.vy > 8) high++;
        if (aboveGlass(world.puck.x, world.puck.z, world.puck.y) || flewOut()) outs++;
      } finally {
        Math.random = real;
      }
    }
  }
  assert.ok(plays >= 40, `goalie plays ${plays}`);
  assert.ok(high >= 20, `goalie lobs ${high}`);
  assert.equal(outs, 0, `goalie crowd shots ${outs}`);
});

test("a CPU skater high clear rarely leaves the rink", () => {
  let clears = 0;
  let outs = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const real = Math.random;
    Math.random = mulberry32(seed * 17);
    try {
      fresh();
      const attack = 1;
      const s = world.skaters.find((p) => p.side === "away" && p.kind === "winger");
      assert.ok(s);
      s.x = -(GOAL_LINE_X - 4);
      s.z = 1;
      s.vx = 0;
      s.vz = 0;
      s.yaw = -Math.PI / 2;
      s.stun = 0;
      s.struck = 0;
      s.tumble = 0;
      world.userId = world.skaters.find((p) => p.side === "home" && p.kind !== "goalie").id;
      world.puck.owner = s.id;
      world.puck.x = s.x;
      world.puck.z = s.z;
      world.puck.y = 0.042;
      world.puck.vx = 0;
      world.puck.vz = 0;
      world.puck.vy = 0;
      let foe = false;
      for (const o of world.skaters) {
        if (o.id === s.id) continue;
        if (!foe && o.side === "home" && o.kind !== "goalie") {
          o.x = s.x - attack * 1.6;
          o.z = s.z;
          foe = true;
        } else {
          o.x = 55;
          o.z = (o.id % 5) * 2;
        }
        o.vx = 0;
        o.vz = 0;
      }
      world.time = seed * 5;
      const owner = s.id;
      step(1);
      if (world.puck.owner === owner || world.puck.vy < 12) continue;
      clears++;
      if (aboveGlass(world.puck.x, world.puck.z, world.puck.y) || flewOut()) outs++;
    } finally {
      Math.random = real;
    }
  }
  assert.ok(clears >= 30, `clears ${clears}`);
  assert.ok(outs / clears < 0.2, `crowd clears ${outs} of ${clears}`);
});
