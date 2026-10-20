/**
 * CPU rush choices. A solo breakaway dekes, then shoots in tight.
 * A 2-on-0 passes for a one-timer. A defender, and a home teammate, keep the old path.
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
const { GOAL_LINE_X, BLUE_X, BLUE_LINE_W } = rink;
const { setInjectedKeys } = input;

const DT = 1 / 60;

function fresh(homeAttack = -1) {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setCpuOffense(1);
  resetWorld();
  if (world.homeAttack !== homeAttack) {
    world.homeAttack = homeAttack;
    resetWorld({ keepScore: true });
  }
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
}

function awayAttack() {
  return -world.homeAttack;
}

function place(s, x, z, vx) {
  s.x = x;
  s.z = z;
  s.vx = vx;
  s.vz = 0;
  s.stun = 0;
  s.struck = 0;
  s.dive = 0;
  s.deke = 0;
  s.tumble = 0;
  s.hit = 0;
  s.poke = 0;
  s.windup = 0;
  s.follow = 0;
  const atk = s.side === "home" ? world.homeAttack : -world.homeAttack;
  s.yaw = atk > 0 ? -Math.PI / 2 : Math.PI / 2;
}

function givePuck(s, lastPass = -10, lastShoot = -10) {
  world.puck.owner = s.id;
  world.puck.x = s.x;
  world.puck.z = s.z;
  world.puck.y = 0.05;
  world.puck.vx = s.vx;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = lastPass;
  world.lastShoot = lastShoot;
  world.lastPassTo = null;
  world.lastPasser = null;
  world.lastShooter = null;
  world.lastShotOneTimer = false;
  world.whistle = null;
  world.stoppage = false;
  world.faceoff = false;
  const edge = BLUE_X + BLUE_LINE_W * 0.5;
  world.puckOz = world.puck.x > edge + 0.3 ? 1 : world.puck.x < -edge - 0.3 ? -1 : 0;
}

function parkBehind(keep, carrierX, attack) {
  let n = 0;
  for (const s of world.skaters) {
    if (keep.has(s.id) || s.kind === "goalie") continue;
    place(s, carrierX - attack * (14 + (n % 3) * 0.4), -10 + (n % 5) * 1.5, 0);
    s.stun = 40;
    n += 1;
  }
}

function wings(side) {
  return world.skaters
    .filter((s) => s.side === side && s.kind === "winger")
    .sort((a, b) => a.id - b.id);
}

function defendingGoalie(side) {
  return world.skaters.find((s) => s.kind === "goalie" && s.side !== side);
}

test("a breakaway dekes across the goalie and shoots in tight", () => {
  for (const homeAttack of [-1, 1]) {
    fresh(homeAttack);
    const attack = awayAttack();
    const mouth = attack * GOAL_LINE_X;
    const carrier = wings("away")[0];
    assert.ok(carrier);
    const x0 = mouth - attack * 11;
    place(carrier, x0, 1.2, attack * 7);
    parkBehind(new Set([carrier.id]), x0, attack);
    givePuck(carrier);
    const g = defendingGoalie("away");
    assert.ok(g);
    const gz0 = g.z;
    let sawDeke = false;
    let pulled = false;
    let shotDist = null;
    for (let i = 0; i < 200; i++) {
      if (carrier.deke > 0.5) sawDeke = true;
      if (carrier.deke > 0.7 && g.stun > 0.05 && g.z > gz0 + 0.15) pulled = true;
      const shoot = world.lastShoot;
      stepSim(DT);
      if (world.lastShooter === carrier.id && world.lastShoot !== shoot) {
        shotDist = (mouth - carrier.x) * attack;
        break;
      }
      if (world.whistle) break;
    }
    assert.equal(world.whistle, null, `whistle ${world.whistle} attack ${attack}`);
    assert.ok(sawDeke, `no deke, attack ${attack}, deke ${carrier.deke}`);
    assert.ok(pulled, `goalie not pulled, z ${g.z.toFixed(2)} from ${gz0.toFixed(2)} stun ${g.stun}`);
    assert.ok(shotDist !== null, `no shot, attack ${attack}, x ${carrier.x.toFixed(2)}`);
    assert.ok(shotDist < 8, `shot from ${shotDist.toFixed(2)} m, attack ${attack}`);
    assert.ok(shotDist > 1, `shot from ${shotDist.toFixed(2)} m, attack ${attack}`);
    assert.equal(world.lastShotOneTimer, false);
    assert.ok((carrier.x - x0) * attack > 1.5, `did not attack, dx ${carrier.x - x0}`);
    assert.ok(carrier.z < 1.2 - 0.3, `no cut, z ${carrier.z.toFixed(2)} attack ${attack}`);
  }
});

test("a 2-on-0 passes and the mate one-times", () => {
  for (const homeAttack of [-1, 1]) {
    fresh(homeAttack);
    const attack = awayAttack();
    const mouth = attack * GOAL_LINE_X;
    const [carrier, mate] = wings("away");
    assert.ok(carrier && mate);
    const cx = mouth - attack * 12;
    const mx = mouth - attack * 8;
    place(carrier, cx, 0.2, attack * 4);
    place(mate, mx, 3.6, attack * 3);
    parkBehind(new Set([carrier.id, mate.id]), cx, attack);
    givePuck(carrier);
    let oneT = false;
    for (let i = 0; i < 160; i++) {
      stepSim(DT);
      if (world.lastShotOneTimer && world.lastShooter === mate.id) {
        oneT = true;
        break;
      }
      if (world.whistle && world.whistle !== "goal") break;
    }
    assert.equal(world.lastPasser, carrier.id, `attack ${attack} passer ${world.lastPasser}`);
    assert.equal(world.lastPassTo, mate.id, `attack ${attack} target ${world.lastPassTo}`);
    assert.ok(oneT, `no one-timer, attack ${attack}, shooter ${world.lastShooter}`);
    assert.notEqual(world.lastShooter, carrier.id);
  }
});

test("a developing 2-on-0 does not shoot while the mate is arriving", () => {
  fresh(-1);
  const attack = awayAttack();
  const mouth = attack * GOAL_LINE_X;
  const [carrier, mate] = wings("away");
  const cx = mouth - attack * 11;
  const mx = mouth - attack * 18;
  place(carrier, cx, 0, attack * 5);
  place(mate, mx, 3.5, attack * 6);
  parkBehind(new Set([carrier.id, mate.id]), cx, attack);
  givePuck(carrier);
  for (let i = 0; i < 30; i++) stepSim(DT);
  assert.notEqual(world.lastShooter, carrier.id, `shot early from the rush`);
  assert.ok(
    world.puck.owner === carrier.id || world.lastPassTo === mate.id,
    `puck left without a pass to the mate`,
  );
});

test("a defender in the rush does not start a breakaway deke or a forced pass", () => {
  fresh(-1);
  const attack = awayAttack();
  const mouth = attack * GOAL_LINE_X;
  const carrier = wings("away")[0];
  const mate = wings("away")[1];
  const defender = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  assert.ok(carrier && mate && defender);
  const cx = mouth - attack * 11;
  place(carrier, cx, 0.4, attack * 6);
  place(mate, mouth - attack * 8, 3.4, attack * 3);
  place(defender, cx + attack * 5, 0, 0);
  defender.stun = 40;
  parkBehind(new Set([carrier.id, mate.id, defender.id]), cx, attack);
  givePuck(carrier, 0, 0);
  let maxDeke = 0;
  for (let i = 0; i < 20; i++) {
    stepSim(DT);
    maxDeke = Math.max(maxDeke, carrier.deke);
  }
  assert.equal(maxDeke, 0);
  assert.equal(world.puck.owner, carrier.id);
  assert.equal(world.lastPassTo, null);
});

test("a home teammate on a breakaway does not take the CPU deke", () => {
  fresh(-1);
  const attack = world.homeAttack;
  const mouth = attack * GOAL_LINE_X;
  const carrier = wings("home").find((s) => s.id !== world.userId);
  assert.ok(carrier);
  const x0 = mouth - attack * 11;
  place(carrier, x0, 1.2, attack * 7);
  parkBehind(new Set([carrier.id]), x0, attack);
  givePuck(carrier);
  let maxDeke = 0;
  for (let i = 0; i < 50; i++) {
    stepSim(DT);
    maxDeke = Math.max(maxDeke, carrier.deke);
  }
  assert.equal(maxDeke, 0);
  assert.notEqual(world.lastShooter, carrier.id);
});
