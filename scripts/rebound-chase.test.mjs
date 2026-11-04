/**
 * A loose rebound on the ice pulls the home skater on its line.
 * Wing half and the point spot do not keep that skater planted.
 * A shot that is still going into the net does not.
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
const { resetWorld, stepSim, world } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;

function fresh() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setControlProfile("classic");
  resetWorld();
  world.homeAttack = -1;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.periodOver = false;
  world.periodEndT = 0;
  world.time = 30;
  world.puckOz = -1;
}

function byKind(side, kind) {
  return world.skaters
    .filter((s) => s.side === side && s.kind === kind)
    .sort((a, b) => a.id - b.id);
}

function place(s, x, z) {
  s.x = x;
  s.z = z;
  s.vx = 0;
  s.vz = 0;
  s.yaw = 0;
  s.stun = 0;
  s.struck = 0;
  s.dive = 0;
  s.tumble = 0;
  s.hit = 0;
  s.poke = 0;
  s.windup = 0;
  s.follow = 0;
}

function loosePuck(x, z, vx, vz) {
  const p = world.puck;
  p.owner = null;
  p.x = x;
  p.z = z;
  p.y = 0.042;
  p.vx = vx;
  p.vz = vz;
  p.vy = 0;
  world.lastPass = 10;
  world.lastPassTo = null;
  world.lastPasser = null;
  world.lastHitTime = -10;
  world.puckOz = -1;
  world.delayedOffside = 0;
}

function dist(s) {
  return Math.hypot(s.x - world.puck.x, s.z - world.puck.z);
}

test("left wing meets a cross-ice slide that has left his lane", () => {
  fresh();
  const wings = byKind("home", "winger");
  const defs = byKind("home", "defense");
  const lw = wings[0];
  const rd = defs[1];
  const ld = defs[0];
  world.userId = wings[1].id;
  for (const s of world.skaters) {
    if (s.side === "away" && s.kind !== "goalie") place(s, 22, (s.id - 8) * 3);
  }
  // Shot flight: looseOrRebound is false. Puck z is on the right, LW stands on the left.
  loosePuck(-22, -4, -1.2, 20);
  world.lastShoot = world.time;
  world.goalieSaveT = -10;
  world.reboundN = 0;
  place(lw, -22.15, 6.2);
  place(wings[1], -12, 0);
  place(wings[2], -16, -11);
  place(ld, -8.4, 11);
  place(rd, -8.6, -10.5);
  const lw0 = dist(lw);
  const ld0 = { x: ld.x, z: ld.z };
  for (let i = 0; i < 22; i++) stepSim(1 / 60);
  const closed = lw0 - dist(lw);
  assert.ok(
    world.puck.owner === lw.id || closed > 1.1,
    `LW stayed off the slide (closed ${closed.toFixed(2)}, owner ${world.puck.owner})`,
  );
  assert.ok(Math.hypot(ld.x - ld0.x, ld.z - ld0.z) < 2.4, "far defenseman left the point");
});

test("right defenseman steps onto a rebound that will pass him", () => {
  fresh();
  const wings = byKind("home", "winger");
  const defs = byKind("home", "defense");
  const rd = defs[1];
  const ld = defs[0];
  world.userId = wings[1].id;
  for (const s of world.skaters) {
    if (s.side === "away" && s.kind !== "goalie") place(s, 22, (s.id - 8) * 3);
    if (s.side === "home" && s.kind === "winger") place(s, -8, s.id === wings[0].id ? 8 : s.id === wings[2].id ? -8 : 0);
  }
  // Out of the 6 m ring, on the line, still a fresh save.
  loosePuck(-21, -2.5, 7.2, -6.4);
  world.lastShoot = world.time - 0.35;
  world.goalieSaveT = world.time - 0.2;
  world.reboundN = 1;
  place(rd, -15.2, -8.6);
  place(ld, -8.2, 11.2);
  const d0 = dist(rd);
  assert.ok(d0 > 6, `setup distance ${d0.toFixed(2)} should be outside 6 m`);
  for (let i = 0; i < 24; i++) stepSim(1 / 60);
  assert.ok(rd.x < -12.2, `RD retreated to the point at x ${rd.x.toFixed(2)}`);
  assert.ok(
    world.puck.owner === rd.id || dist(rd) < d0 - 0.8,
    `RD did not close (now ${dist(rd).toFixed(2)}, was ${d0.toFixed(2)}, owner ${world.puck.owner})`,
  );
});

test("a shot still aimed into the net does not pull the point", () => {
  fresh();
  const wings = byKind("home", "winger");
  const defs = byKind("home", "defense");
  const rd = defs[1];
  world.userId = wings[1].id;
  for (const s of world.skaters) {
    if (s.side === "away" && s.kind !== "goalie") place(s, 22, (s.id - 8) * 3);
    if (s.side === "home" && s.kind === "winger") place(s, -10, (s.id - 4) * 4);
  }
  loosePuck(-16, 0.2, -18, 0.15);
  world.lastShoot = world.time;
  world.goalieSaveT = -10;
  place(rd, -11.5, -8.2);
  place(defs[0], -11.2, 8.4);
  const d0 = dist(rd);
  for (let i = 0; i < 16; i++) stepSim(1 / 60);
  assert.ok(dist(rd) > d0 - 1.2, `RD crashed a shot on net (closed ${(d0 - dist(rd)).toFixed(2)})`);
});
