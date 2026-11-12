/**
 * Goalie board retrieval.
 * An attacking-zone rim is not his. A dump is his only when he meets the rail first.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { dirname, join } from "node:path";
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
  s.backskate = false;
}

/**
 * Loose board puck. releaseX in the passer's attacking zone keeps the rim
 * in that zone. releaseX near center is a dump from neutral.
 */
function boardSetup({ x, z, vx, vz, releaseX }) {
  fresh();
  const user = byKind("home", "winger")[2];
  world.userId = user.id;
  let i = 0;
  for (const s of world.skaters) {
    if (s.kind === "goalie") continue;
    place(s, 1 + (i % 3) * 1.4, -2 + i * 0.7);
    i += 1;
  }
  const passer = byKind("home", "winger")[0];
  world.lastPasser = world.skaters.indexOf(passer);
  world.lastPass = world.time - 0.35;
  world.lastPassX = releaseX;
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

function moved(s, x0, z0) {
  return Math.hypot(s.x - x0, s.z - z0);
}

test("away goalie stays in the crease for an attacking-zone board rim", () => {
  // Home attacks -x. The rim is already in that zone and still there.
  boardSetup({
    x: -29.5,
    z: -4,
    vx: 0,
    vz: 5,
    releaseX: -16,
  });
  const g = byKind("away", "goalie")[0];
  const x0 = g.x;
  const z0 = g.z;
  for (let i = 0; i < 45; i++) stepSim(DT);
  const d = moved(g, x0, z0);
  assert.ok(world.puck.owner !== g.id, `goalie took the rim (owner ${world.puck.owner})`);
  assert.ok(d < 1, `goalie left the crease for an OZ rim (${d.toFixed(2)} m)`);
});

test("away goalie plays a neutral-zone dump when he meets it first", () => {
  boardSetup({
    x: -29.5,
    z: -4,
    vx: 0,
    vz: 5,
    releaseX: 0,
  });
  const g = byKind("away", "goalie")[0];
  const x0 = g.x;
  const z0 = g.z;
  for (let i = 0; i < 45; i++) stepSim(DT);
  const d = moved(g, x0, z0);
  assert.ok(
    d > 1.4 || world.puck.owner === g.id,
    `goalie stayed on a dump he should win (moved ${d.toFixed(2)}, owner ${world.puck.owner})`,
  );
});

test("away goalie stays when a skater can meet the dump first", () => {
  boardSetup({
    x: -29.5,
    z: -4,
    vx: 0,
    vz: 5,
    releaseX: 0,
  });
  const g = byKind("away", "goalie")[0];
  const d = byKind("away", "defense")[0];
  place(d, -29.2, -3.4);
  const x0 = g.x;
  const z0 = g.z;
  for (let i = 0; i < 45; i++) stepSim(DT);
  const dist = moved(g, x0, z0);
  assert.ok(world.puck.owner !== g.id, `goalie took a puck a skater could reach`);
  assert.ok(dist < 1, `goalie left while a skater was first (${dist.toFixed(2)} m)`);
});

function loadReplay(name) {
  const raw = JSON.parse(readFileSync(join(repo, "dev/reference", name), "utf8"));
  return new Map(raw.map((fr) => [fr.frame, fr]));
}

/** Drop a replay frame into the live sim and keep the pass that produced it. */
function applyReplay(by, frame, releaseFrame) {
  fresh();
  const now = by.get(frame);
  const nxt = by.get(frame + 1);
  const body = now.original;
  for (const pl of body.players) {
    const s = world.skaters.find((q) => q.id === pl.id);
    if (!s) continue;
    const n = nxt?.original.players.find((q) => q.id === pl.id);
    place(s, pl.x, pl.z);
    s.yaw = pl.yaw ?? 0;
    if (n) {
      s.vx = (n.x - pl.x) / DT;
      s.vz = (n.z - pl.z) / DT;
    }
  }
  let rel = releaseFrame;
  while (rel > by.get([...by.keys()][0]).frame && by.get(rel)?.original.puck.owner == null) rel -= 1;
  const released = by.get(rel).original;
  const passer = world.skaters.find((s) => s.id === released.puck.owner);
  world.userId = typeof now.userId === "number" ? now.userId : passer.id;
  if (world.userId === byKind("home", "goalie")[0].id || world.userId === byKind("away", "goalie")[0].id) {
    world.userId = byKind("home", "winger")[2].id;
  }
  world.lastPasser = world.skaters.indexOf(passer);
  world.lastPass = world.time - Math.max(0.2, (frame - rel) / 60);
  world.lastPassX = released.puck.x;
  world.lastPassZ = released.puck.z;
  world.lastPassTo = null;
  world.lastShoot = 0;
  world.goalieSaveT = 0;
  world.lastHitTime = 0;
  const p = world.puck;
  const nPuck = nxt?.original.puck;
  p.owner = null;
  p.x = body.puck.x;
  p.z = body.puck.z;
  p.y = 0.042;
  p.vy = 0;
  p.vx = nPuck ? (nPuck.x - body.puck.x) / DT : 0;
  p.vz = nPuck ? (nPuck.z - body.puck.z) / DT : 0;
  return { passer, releaseX: released.puck.x, releaseZ: released.puck.z };
}

function chase(by, frame, releaseFrame, frames = 40) {
  const info = applyReplay(by, frame, releaseFrame);
  const g = world.puck.x >= 0 ? byKind("home", "goalie")[0] : byKind("away", "goalie")[0];
  const x0 = g.x;
  const z0 = g.z;
  for (let i = 0; i < frames; i++) stepSim(DT);
  return {
    ...info,
    g,
    moved: moved(g, x0, z0),
    owner: world.puck.owner,
    from: `${x0.toFixed(1)},${z0.toFixed(1)}`,
    to: `${g.x.toFixed(1)},${g.z.toFixed(1)}`,
    puck0: `${by.get(frame).original.puck.x.toFixed(1)},${by.get(frame).original.puck.z.toFixed(1)}`,
  };
}

const replay978 = loadReplay("replay-978-1799.json");
const replay1508 = loadReplay("replay-1508-1799.json");

test("replay 1716: away goalie stays while skaters are closer to the rim", () => {
  const r = chase(replay1508, 1716, 1684);
  assert.ok(r.owner !== r.g.id, `goalie took the rim (owner ${r.owner})`);
  // A post slide inside the crease is ordinary tracking. Leaving is a move
  // behind the goal line or out to the glass.
  assert.ok(r.g.x > -27.4 && r.g.x < -25.2, `left the crease along x to ${r.to}`);
  assert.ok(Math.abs(r.g.z) < 1.9, `left the crease toward the boards at ${r.to}`);
});

test("replay 1205: home goalie retrieves a rim that wraps behind his net", () => {
  const r = chase(replay978, 1205, 987, 50);
  assert.ok(
    r.moved > 1,
    `home goalie stayed for a behind-net rim he is first to (${r.moved.toFixed(2)} m, ${r.from} -> ${r.to})`,
  );
  assert.ok(r.g.x > 26.8, `did not start behind his line (${r.to})`);
});

test("home goalie goes behind his net for a latched rim he meets first", () => {
  boardSetup({
    x: 20,
    z: -12.6,
    vx: 6,
    vz: 0,
    releaseX: -16,
  });
  const g = byKind("home", "goalie")[0];
  for (const s of world.skaters) {
    if (s.kind === "goalie") continue;
    place(s, 0, (s.id - 6) * 1.2);
  }
  stepSim(DT);
  place(g, 26.2, 0.2);
  g.vx = 0;
  g.vz = 0;
  const p = world.puck;
  p.x = 30.15;
  p.z = 0.5;
  p.vx = 0;
  p.vz = -8;
  p.owner = null;
  const x0 = g.x;
  const z0 = g.z;
  for (let i = 0; i < 75; i++) stepSim(DT);
  const d = moved(g, x0, z0);
  assert.ok(d > 1.2, `goalie stayed in the crease (${d.toFixed(2)} m, now ${g.x.toFixed(1)},${g.z.toFixed(1)})`);
  assert.ok(g.x > 27.15, `goalie did not go behind the goal line (x ${g.x.toFixed(2)})`);
});

test("home goalie stays when a skater is first to the puck behind his net", () => {
  boardSetup({
    x: 20,
    z: -12.6,
    vx: 6,
    vz: 0,
    releaseX: -16,
  });
  const g = byKind("home", "goalie")[0];
  for (const s of world.skaters) {
    if (s.kind === "goalie") continue;
    place(s, 0, (s.id - 6) * 1.2);
  }
  stepSim(DT);
  const d = byKind("home", "defense")[0];
  place(g, 26.2, 0.2);
  place(d, 29.6, 0.8);
  g.vx = 0;
  g.vz = 0;
  const p = world.puck;
  p.x = 30.15;
  p.z = 0.6;
  p.vx = 0;
  p.vz = -6;
  p.owner = null;
  const x0 = g.x;
  const z0 = g.z;
  for (let i = 0; i < 30; i++) stepSim(DT);
  assert.ok(world.puck.owner !== g.id, `goalie took a puck a skater could reach`);
  assert.ok(moved(g, x0, z0) < 1.2, `goalie left while a skater was first (${g.x.toFixed(1)},${g.z.toFixed(1)})`);
});

test("home goalie stays for an attacking-zone board pass in front of the far net", () => {
  boardSetup({
    x: -24,
    z: -12.2,
    vx: -14,
    vz: 0.2,
    releaseX: -18,
  });
  const g = byKind("home", "goalie")[0];
  const x0 = g.x;
  const z0 = g.z;
  for (let i = 0; i < 40; i++) stepSim(DT);
  assert.ok(moved(g, x0, z0) < 1, `home goalie left for an OZ rim (${g.x.toFixed(1)},${g.z.toFixed(1)})`);
});

test("goalie does not claim a fast attacking-zone board pass on the glass", () => {
  boardSetup({
    x: -24,
    z: -12.2,
    vx: -14,
    vz: 0.2,
    releaseX: -18,
  });
  const g = byKind("away", "goalie")[0];
  place(g, -24, -11.2);
  for (let i = 0; i < 6; i++) stepSim(DT);
  assert.notEqual(
    world.puck.owner,
    g.id,
    `goalie claimed an OZ board pass (owner ${world.puck.owner})`,
  );
});
