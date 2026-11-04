/**
 * CPU pass choice from replay 1439–1633. The left wing must not sauce through
 * traffic to the center when the right wing is open at the net. A saucer that
 * is thrown has to arrive at or under that target's shoulder.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const input = await server.ssrLoadModule("/src/game/input.ts");
const { resetWorld, stepSim, world } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;

const DT = 1 / 60;
const SHOULDER_Y = 1.402;
const frames = JSON.parse(readFileSync(`${repo}/dev/reference/replay-1439-1633.json`, "utf8"));
const by = new Map(frames.map((f) => [f.frame, f]));

function fresh() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setCpuOffense(1);
  resetWorld();
  if (world.homeAttack !== 1) {
    world.homeAttack = 1;
    resetWorld({ keepScore: true });
  }
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.userId = 0;
}

function place(s, x, z, vx = 0, vz = 0) {
  s.x = x;
  s.z = z;
  s.vx = vx;
  s.vz = vz;
  s.stun = 0;
  s.struck = 0;
  s.dive = 0;
  s.tumble = 0;
  s.hit = 0;
  s.poke = 0;
  s.windup = 0;
  s.follow = 0;
  s.deke = 0;
  const atk = s.side === "home" ? world.homeAttack : -world.homeAttack;
  s.yaw = atk > 0 ? -Math.PI / 2 : Math.PI / 2;
}

function givePuck(s) {
  world.puck.owner = s.id;
  world.puck.x = s.x;
  world.puck.z = s.z;
  world.puck.y = 0.042;
  world.puck.vx = s.vx;
  world.puck.vz = s.vz;
  world.puck.vy = 0;
  world.lastPass = -10;
  world.lastShoot = -10;
  world.lastPassTo = null;
  world.lastPasser = null;
  world.lastShooter = null;
  world.whistle = null;
  world.stoppage = false;
  world.faceoff = false;
}

test("replay 1548 passes to the open right wing, not through traffic", () => {
  const frame = by.get(1548);
  const next = by.get(1549);
  const seen = new Map();
  let sauces = 0;
  for (let trial = 0; trial < 24; trial++) {
    fresh();
    for (const s of world.skaters) {
      const p = frame.adjusted.players.find((q) => q.id === s.id);
      const q = next.adjusted.players.find((row) => row.id === s.id);
      place(s, p.x, p.z, (q.x - p.x) / DT, (q.z - p.z) / DT);
      s.yaw = p.yaw;
    }
    const lw = world.skaters[9];
    const rw = world.skaters[11];
    assert.equal(lw.kind, "winger");
    assert.equal(rw.kind, "winger");
    givePuck(lw);
    world.puck.x = frame.adjusted.puck.x;
    world.puck.z = frame.adjusted.puck.z;
    world.time = frame.time;
    const before = world.lastPass;
    stepSim(DT);
    assert.equal(world.lastPasser, lw.id, "left wing did not pass");
    assert.notEqual(world.lastPass, before);
    assert.equal(world.lastPassTo, rw.id, `target ${world.lastPassTo}`);
    seen.set(world.lastPassTo, (seen.get(world.lastPassTo) ?? 0) + 1);
    const kind = useGame.getState().shotKind;
    if (kind === "saucer") {
      sauces += 1;
      let nearY = world.puck.y;
      let nearD = Infinity;
      for (let i = 0; i < 80; i++) {
        stepSim(DT);
        const d = Math.hypot(world.puck.x - rw.x, world.puck.z - rw.z);
        if (d < nearD) {
          nearD = d;
          nearY = world.puck.y;
        }
      }
      assert.ok(nearY <= SHOULDER_Y + 0.03, `saucer at the wing y ${nearY.toFixed(3)}`);
    }
  }
  assert.equal(sauces, 0, "crease feed should stay on the ice");
  assert.equal(seen.get(11), 24);
});

test("a long saucer arrives at or under the target shoulder", () => {
  let sauces = 0;
  let passes = 0;
  for (let trial = 0; trial < 20; trial++) {
    fresh();
    const attack = -world.homeAttack;
    const mouth = attack * 27.13;
    const carrier = world.skaters.find((s) => s.side === "away" && s.kind === "winger");
    const mate = world.skaters.filter((s) => s.side === "away" && s.kind === "winger" && s.id !== carrier.id)[0];
    const foe = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
    assert.ok(carrier && mate && foe);
    const cx = mouth - attack * 22;
    place(carrier, cx, -2, attack * 1);
    place(mate, cx + attack * 16, 6, attack * 1);
    place(foe, cx + attack * 1.6, -0.4, 0);
    let n = 0;
    for (const s of world.skaters) {
      if (s.id === carrier.id || s.id === mate.id || s.id === foe.id || s.kind === "goalie") continue;
      place(s, cx - attack * (18 + n), -11, 0);
      s.stun = 40;
      n += 1;
    }
    givePuck(carrier);
    world.time = 30;
    let kind = null;
    for (let i = 0; i < 30; i++) {
      const before = world.lastPass;
      stepSim(DT);
      if (world.lastPasser === carrier.id && world.lastPass !== before) {
        kind = useGame.getState().shotKind;
        passes += 1;
        break;
      }
    }
    if (kind !== "saucer") continue;
    sauces += 1;
    const target = world.skaters[world.lastPassTo];
    assert.ok(target);
    let nearY = world.puck.y;
    let nearD = Infinity;
    let maxNear = 0;
    for (let i = 0; i < 120; i++) {
      stepSim(DT);
      const d = Math.hypot(world.puck.x - target.x, world.puck.z - target.z);
      if (d < 3.2) maxNear = Math.max(maxNear, world.puck.y);
      if (d < nearD) {
        nearD = d;
        nearY = world.puck.y;
      }
      if (world.puck.owner !== null) break;
    }
    assert.ok(nearD < 6, `saucer missed, closest ${nearD.toFixed(2)}`);
    assert.ok(nearY <= SHOULDER_Y + 0.03, `arrival y ${nearY.toFixed(3)} shoulder ${SHOULDER_Y}`);
    assert.ok(maxNear <= SHOULDER_Y + 0.08, `near-target y ${maxNear.toFixed(3)}`);
  }
  assert.ok(passes > 0, "carrier never passed");
  assert.ok(sauces > 0, "no saucer was thrown to check");
});

after(() => server.close());
