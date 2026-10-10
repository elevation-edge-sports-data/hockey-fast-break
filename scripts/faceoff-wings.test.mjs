/**
 * Non-dot forwards at a faceoff stand on their own defending side of the dot,
 * outside the circle, about 2 m from the opposing forward on the same hash.
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

const { resetWorld, stepSim, world, defendDir, faceYaw } = sim;
const { useGame } = store;
const { FACEOFF_EZ_X, FACEOFF_R, FACEOFF_SPOT_Z } = rink;
const { setInjectedKeys } = input;

function drop({ lineup, attack, face } = {}) {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setPlaying(true);
  ui.setPaused(false);
  if (lineup) {
    ui.setHomeLineup(lineup);
    ui.setAwayLineup(lineup);
  }
  resetWorld();
  if (attack || face) {
    if (attack) world.homeAttack = attack;
    if (face) {
      world.faceX = face.x;
      world.faceZ = face.z;
    }
    resetWorld({ keepScore: true });
  }
}

function extras(side) {
  const skip = side === "home" ? world.homeDot : world.awayDot;
  return world.skaters.filter((s) => s.side === side && s.kind === "winger" && s.id !== skip);
}

function pairByHash(home, away) {
  const used = new Set();
  const pairs = [];
  for (const h of home) {
    let best = null;
    let bestDz = Infinity;
    for (const a of away) {
      if (used.has(a)) continue;
      const dz = Math.abs(h.z - a.z);
      if (dz < bestDz) {
        bestDz = dz;
        best = a;
      }
    }
    if (best && bestDz < 0.2) {
      used.add(best);
      pairs.push([h, best]);
    }
  }
  return pairs;
}

function assertWingPair(h, a, label) {
  const dx = Math.abs(h.x - a.x);
  const dz = Math.abs(h.z - a.z);
  assert.ok(dz < 0.05, `${label} share a hash, |dz|=${dz.toFixed(3)}`);
  assert.ok(dx >= 1.8 && dx <= 2.2, `${label} center gap ${dx.toFixed(3)} m`);
  assert.ok((h.x - world.faceX) * defendDir("home") > 0.5, `${label} home is on the defending half`);
  assert.ok((a.x - world.faceX) * defendDir("away") > 0.5, `${label} away is on the defending half`);
  for (const s of [h, a]) {
    const r = Math.hypot(s.x - world.faceX, s.z - world.faceZ);
    assert.ok(r > FACEOFF_R, `${label} ${s.side} is outside the circle (r=${r.toFixed(3)})`);
    assert.ok(Math.abs(s.x - world.faceX) < FACEOFF_R * 0.5, `${label} ${s.side} is not split to the far edge`);
    assert.equal(s.yaw, faceYaw(s.side));
    assert.equal(s.vx, 0);
    assert.equal(s.vz, 0);
  }
}

function assertCentersAndPuck() {
  const home = world.skaters.find((s) => s.id === world.homeDot);
  const away = world.skaters.find((s) => s.id === world.awayDot);
  assert.ok(home && away);
  assert.ok(Math.abs(home.x - (world.faceX + defendDir("home") * 1.15)) < 1e-9);
  assert.ok(Math.abs(away.x - (world.faceX + defendDir("away") * 1.15)) < 1e-9);
  assert.ok(Math.abs(home.z - world.faceZ) < 1e-9);
  assert.ok(Math.abs(away.z - world.faceZ) < 1e-9);
  const gap = Math.hypot(home.x - away.x, home.z - away.z);
  assert.ok(gap > home.radius + away.radius, `dot takers overlap (${gap.toFixed(3)})`);
  assert.equal(world.puck.x, world.faceX);
  assert.equal(world.puck.z, world.faceZ);
}

function assertDefenseParked() {
  for (const side of ["home", "away"]) {
    const sign = defendDir(side);
    const skip = side === "home" ? world.homeDot : world.awayDot;
    const ds = world.skaters.filter((s) => s.side === side && s.kind === "defense" && s.id !== skip);
    for (const s of ds) {
      const want = world.faceX + sign * (FACEOFF_R + 1.05);
      assert.ok(Math.abs(s.x - want) < 1e-9, `${side} D x ${s.x} want ${want}`);
      assert.equal(s.yaw, faceYaw(side));
    }
  }
}

test("opening Game drop separates wing pairs on opposite halves", () => {
  drop();
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);
  assert.equal(world.faceoff, true);
  const home = extras("home");
  const away = extras("away");
  assert.equal(home.length, 2);
  assert.equal(away.length, 2);
  const pairs = pairByHash(home, away);
  assert.equal(pairs.length, 2);
  for (const [h, a] of pairs) assertWingPair(h, a, "center");
  const zs = pairs.map(([h]) => h.z).sort((p, q) => p - q);
  assert.ok(zs[0] < -FACEOFF_R && zs[1] > FACEOFF_R, "one pair above the circle and one below");
  assertCentersAndPuck();
  assertDefenseParked();
  const dropRef = world.refLane >= 0 ? world.ref : world.ref2;
  assert.equal(dropRef.x, world.faceX);
  assert.ok(Math.abs(Math.abs(dropRef.z - world.faceZ) - 0.68) < 1e-9);

  stepSim(1 / 60);
  const again = pairByHash(extras("home"), extras("away"));
  assert.equal(again.length, 2);
  for (const [h, a] of again) assertWingPair(h, a, "after a hold step");
  assertCentersAndPuck();
});

test("an end-zone dot and a flipped attack use the same gap", () => {
  drop({ face: { x: FACEOFF_EZ_X, z: FACEOFF_SPOT_Z } });
  assert.equal(world.faceX, FACEOFF_EZ_X);
  assert.equal(world.faceZ, FACEOFF_SPOT_Z);
  const pairs = pairByHash(extras("home"), extras("away"));
  assert.equal(pairs.length, 2);
  for (const [h, a] of pairs) assertWingPair(h, a, "end zone");
  assertCentersAndPuck();
  assertDefenseParked();

  drop({ attack: -1 });
  assert.equal(world.homeAttack, -1);
  assert.equal(defendDir("home"), 1);
  const flipped = pairByHash(extras("home"), extras("away"));
  assert.equal(flipped.length, 2);
  for (const [h, a] of flipped) assertWingPair(h, a, "flipped");
  assertCentersAndPuck();
});

test("the hash-fourth forward stays on the hash", () => {
  drop({ lineup: { g: 1, d: 1, o: 4 } });
  const home = extras("home");
  const away = extras("away");
  assert.equal(home.length, 3);
  assert.equal(away.length, 3);
  const hashZ = (world.refLane >= 0 ? 1 : -1) * 3.4;
  for (const side of ["home", "away"]) {
    const sign = defendDir(side);
    const hash = extras(side).filter(
      (s) => Math.abs(s.x - (world.faceX + sign * (FACEOFF_R + 1.05))) < 1e-9,
    );
    assert.equal(hash.length, 1, `${side} hash forward`);
    assert.ok(Math.abs(hash[0].z - (world.faceZ + hashZ)) < 1e-9);
    assert.equal(hash[0].yaw, faceYaw(side));
  }
  const wingHome = home.filter((s) => Math.abs(s.z - (world.faceZ + hashZ)) > 0.2);
  const wingAway = away.filter((s) => Math.abs(s.z - (world.faceZ + hashZ)) > 0.2);
  const pairs = pairByHash(wingHome, wingAway);
  assert.equal(pairs.length, 2);
  for (const [h, a] of pairs) assertWingPair(h, a, "hash fourth");
  assertDefenseParked();
  assertCentersAndPuck();
});
