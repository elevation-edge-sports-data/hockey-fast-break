/**
 * One skater meets a board rail. The others keep their spots.
 * A skater the puck has gone past is not held on the glass.
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
const DT = 1 / 60;

function fresh() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setPaused(false);
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
  world.replay = false;
  world.oneTimerArmed = false;
}

function byKind(side, kind) {
  return world.skaters.filter((s) => s.side === side && s.kind === kind).sort((a, b) => a.id - b.id);
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
  s.backskate = false;
}

function boardPuck(x, z, vx, vz) {
  fresh();
  const passer = byKind("away", "defense")[0];
  world.userId = byKind("home", "winger")[2].id;
  for (const s of world.skaters) {
    if (s.kind === "goalie") continue;
    place(s, 0, (s.id - 6) * 1.1);
  }
  world.lastPasser = world.skaters.indexOf(passer);
  world.lastPass = world.time - 0.4;
  world.lastPassX = x - vx * 0.3;
  world.lastPassZ = z;
  world.lastPassTo = null;
  world.lastShoot = 0;
  world.goalieSaveT = 0;
  world.lastHitTime = 0;
  const p = world.puck;
  p.owner = null;
  p.x = x;
  p.z = z;
  p.y = 0.042;
  p.vx = vx;
  p.vz = vz;
  p.vy = 0;
}

test("only the soonest skater leaves his spot for a board rail", () => {
  boardPuck(-16, -12.6, -10, 0.4);
  const near = byKind("home", "defense")[0];
  const farHome = byKind("home", "winger")[0];
  const farAway = byKind("away", "winger")[0];
  place(near, -22, -7);
  place(farHome, -8, 2);
  place(farAway, -6, -1);
  const nearZ = near.z;
  const homeZ = farHome.z;
  const awayZ = farAway.z;
  for (let i = 0; i < 30; i++) stepSim(DT);
  assert.ok(near.z < nearZ - 1.2, `nearest did not close on the rail (${nearZ.toFixed(1)} -> ${near.z.toFixed(1)})`);
  assert.ok(farHome.z > -6, `home winger left for the glass (z ${homeZ.toFixed(1)} -> ${farHome.z.toFixed(1)})`);
  assert.ok(farAway.z > -6, `away winger left for the glass (z ${awayZ.toFixed(1)} -> ${farAway.z.toFixed(1)})`);
});

test("home LW meets the corner when that is the first spot he can reach", () => {
  boardPuck(-30.15, -1.2, 0.4, 12);
  const lw = byKind("home", "winger")[0];
  const rw = byKind("home", "winger")[2];
  const center = byKind("home", "winger")[1];
  place(lw, -25.5, 7.2);
  place(rw, 2, -1);
  place(center, 1, 1);
  for (const s of world.skaters) {
    if (s.kind === "goalie" || s.id === lw.id) continue;
    if (s.kind === "winger") continue;
    place(s, 0, (s.id - 4) * 1.3);
  }
  const z0 = lw.z;
  const x0 = lw.x;
  for (let i = 0; i < 40; i++) stepSim(DT);
  assert.ok(lw.x < x0 - 0.7, `LW did not go down to the end (x ${x0.toFixed(1)} -> ${lw.x.toFixed(1)})`);
  assert.ok(lw.z > z0 - 0.4, `LW cut inward (z ${z0.toFixed(1)} -> ${lw.z.toFixed(1)})`);
  assert.ok(Math.abs(rw.z) < 6, `RW joined the board rush (z ${rw.z.toFixed(1)})`);
});

test("home LW stays inside when no board meet is in time", () => {
  boardPuck(-30.15, -1.2, 0.4, 12);
  const lw = byKind("home", "winger")[0];
  place(lw, 2, 1);
  for (const s of world.skaters) {
    if (s.id === lw.id || s.kind === "goalie") continue;
    place(s, 8, (s.id - 5) * 1.1);
  }
  for (let i = 0; i < 30; i++) stepSim(DT);
  assert.ok(lw.x > -2, `LW chased a rim he cannot reach (x ${lw.x.toFixed(1)})`);
  assert.ok(Math.abs(lw.z) < 6, `LW left for the boards (z ${lw.z.toFixed(1)})`);
});

test("home LW meets the side boards at his x when the corner is out of reach", () => {
  boardPuck(-22, 12.55, 16, 0.2);
  const lw = byKind("home", "winger")[0];
  place(lw, -16, 7.2);
  for (const s of world.skaters) {
    if (s.id === lw.id || s.kind === "goalie") continue;
    place(s, 6, (s.id - 5) * 1.1);
  }
  const z0 = lw.z;
  for (let i = 0; i < 36; i++) stepSim(DT);
  assert.ok(lw.z > z0 + 1.4, `LW did not close on the side boards (z ${z0.toFixed(1)} -> ${lw.z.toFixed(1)})`);
});

test("home LD on his wall turns for a rim before it reaches his x", () => {
  boardPuck(-26, 12.6, 18, 0.15);
  const ld = byKind("home", "defense")[0];
  const rd = byKind("home", "defense")[1];
  place(ld, -14, 10.6);
  ld.yaw = 0;
  place(rd, -10, -8);
  for (const s of world.skaters) {
    if (s.kind === "goalie" || s.id === ld.id || s.id === rd.id) continue;
    place(s, 4, (s.id - 6) * 0.8);
  }
  for (let i = 0; i < 30; i++) stepSim(DT);
  const fx = -Math.sin(ld.yaw);
  const fz = -Math.cos(ld.yaw);
  const px = world.puck.x - ld.x;
  const pz = world.puck.z - ld.z;
  const plen = Math.hypot(px, pz) || 1;
  const face = (fx * px + fz * pz) / plen;
  assert.ok(ld.z > 11, `LD did not step to the glass (z ${ld.z.toFixed(2)})`);
  assert.ok(ld.x < -14.35, `LD did not turn up the wall toward the puck (x ${ld.x.toFixed(2)})`);
  assert.ok(face > 0.55, `LD is not facing the puck (dot ${face.toFixed(2)})`);
  assert.ok(rd.z < -2, `RD left his side for the rim (z ${rd.z.toFixed(2)})`);
});

test("a skater the puck has passed does not stay on the wall", () => {
  boardPuck(-24, -12.6, -12, 0.2);
  const behind = byKind("home", "defense")[1];
  const ahead = byKind("away", "defense")[0];
  place(behind, -14, -10.5);
  place(ahead, -28, -6);
  for (let i = 0; i < 28; i++) stepSim(DT);
  assert.ok(
    Math.abs(behind.z) < 10.2,
    `passed skater held the wall at z ${behind.z.toFixed(2)}`,
  );
  assert.ok(
    Math.abs(ahead.z) > Math.abs(-6) + 0.8,
    `ahead skater did not take the rail (z ${ahead.z.toFixed(2)})`,
  );
});
