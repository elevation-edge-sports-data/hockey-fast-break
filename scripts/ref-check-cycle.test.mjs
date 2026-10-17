/**
 * A checked referee plays the skater cycle: absorb, knockout, recover.
 * The windows are checkedCyclePose, shared with live player poses.
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

const { resetWorld, stepSim, world, checkedCyclePose, TUMBLE_STRIKE, TUMBLE_UP } = sim;
const { useGame } = store;
const { setInjectedKeys, setInjectedAim } = input;

const DT = 1 / 60;

function user() {
  return world.skaters[world.userId];
}

function sheet(mode) {
  setInjectedKeys([]);
  setInjectedAim(0, 0);
  const ui = useGame.getState();
  ui.setClockMode(mode);
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("stick");
  ui.setCheckRefs(true);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.replay = false;
  world.camFx = 1;
  world.camFz = 0;
  world.camRx = 0;
  world.camRz = 1;
  stepSim(DT);
}

function placeCheck(ref) {
  const u = user();
  assert.notEqual(u.kind, "goalie");
  u.x = 0;
  u.z = 0;
  u.vx = 0;
  u.vz = 0;
  u.yaw = -Math.PI / 2;
  u.hit = 0;
  u.stun = 0;
  u.dive = 0;
  u.poke = 0;
  u.windup = 0;
  u.follow = 0;
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.z = 8;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  ref.x = 1;
  ref.z = 0;
  ref.vx = 0;
  ref.vz = 0;
  ref.yaw = 0;
  ref.struck = 0;
  ref.tumble = 0;
  ref.pose = "idle";
  const other = ref === world.ref ? world.ref2 : world.ref;
  other.x = 40;
  other.z = 40;
  other.vx = 0;
  other.vz = 0;
  other.struck = 0;
  other.tumble = 0;
  for (const s of world.skaters) {
    if (s.id === u.id) continue;
    s.x = s.side === "home" ? -30 : 30;
    s.z = (s.id % 5) * 1.5 - 3;
    s.vx = 0;
    s.vz = 0;
    s.stun = 30;
    s.hit = 0;
    s.struck = 0;
    s.tumble = 0;
  }
}

function parkCrowd(ref) {
  const u = user();
  u.x = -18;
  u.z = 0;
  u.vx = 0;
  u.vz = 0;
  u.hit = 0;
  const other = ref === world.ref ? world.ref2 : world.ref;
  other.x = 40;
  other.z = 40;
  other.vx = 0;
  other.vz = 0;
  other.struck = 0;
  other.tumble = 0;
  world.puck.owner = null;
  world.puck.x = 0;
  world.puck.z = 8;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.puck.y = 0.042;
  for (const s of world.skaters) {
    if (s.id === u.id) continue;
    s.x = s.side === "home" ? -30 : 30;
    s.z = (s.id % 5) * 1.5 - 3;
    s.vx = 0;
    s.vz = 0;
    s.stun = 30;
    s.hit = 0;
  }
}

function phasesOf(ref) {
  const phases = [];
  const push = () => {
    const pose = checkedCyclePose(ref.struck, ref.tumble);
    const last = phases[phases.length - 1];
    if (!last || last.pose !== pose) {
      phases.push({ pose, struck: ref.struck, tumble: ref.tumble, whistle: world.whistle });
    }
  };
  push();
  for (let i = 0; i < 240; i++) {
    stepSim(DT);
    parkCrowd(ref);
    push();
    if (phases[phases.length - 1].pose === null) break;
  }
  return phases;
}

test("checked cycle windows match a skater", () => {
  assert.equal(checkedCyclePose(1.25, 0), "absorb");
  assert.equal(checkedCyclePose(0.21, 0), "absorb");
  assert.equal(checkedCyclePose(0.2, 0), null);
  assert.equal(checkedCyclePose(TUMBLE_STRIKE, 1), "knockout");
  assert.equal(checkedCyclePose(0.55, 1), "knockout");
  assert.equal(checkedCyclePose(0.2, 1), "recover");
  assert.equal(checkedCyclePose(0.1, 1), null);
  const edge = TUMBLE_STRIKE * (1 - TUMBLE_UP);
  assert.equal(checkedCyclePose(edge + 0.01, 1), "knockout");
  assert.equal(checkedCyclePose(edge - 0.01, 1), "recover");
});

function assertCycle(mode, ref) {
  sheet(mode);
  placeCheck(ref);
  setInjectedAim(0, 1);
  stepSim(DT);
  setInjectedAim(0, 0);
  setInjectedKeys([]);
  parkCrowd(ref);
  const phases = phasesOf(ref);
  const names = phases.map((p) => p.pose);
  assert.deepEqual(names, ["absorb", "knockout", "recover", null], `${mode} ${JSON.stringify(phases)}`);
  assert.equal(phases[0].tumble, 0);
  assert.ok(phases[0].struck > 1.2 && phases[0].struck < 1.25, `absorb struck ${phases[0].struck}`);
  assert.equal(phases[1].struck, TUMBLE_STRIKE);
  assert.ok(Math.abs(phases[1].tumble) >= 0.85 && Math.abs(phases[1].tumble) <= 1.3);
  assert.ok(Math.abs(phases[2].tumble) >= 0.85);
  assert.ok(phases[2].struck > 0.1 && phases[2].struck <= TUMBLE_STRIKE * (1 - TUMBLE_UP));
  assert.equal(ref.struck, 0);
  assert.equal(ref.tumble, 0);
  assert.equal(world.whistle, null);
}

test("a game check sends the referee through absorb, knockout, and recover", () => {
  assertCycle("game", world.ref);
});

test("a drill check sends the ice referee through the same cycle", () => {
  assertCycle("drill", world.ref2);
});

test("clearing a referee during absorb does not start the tumble", () => {
  sheet("game");
  placeCheck(world.ref);
  setInjectedAim(0, 1);
  stepSim(DT);
  setInjectedAim(0, 0);
  assert.equal(checkedCyclePose(world.ref.struck, world.ref.tumble), "absorb");
  world.ref.struck = 0;
  world.ref.tumble = 0;
  for (let i = 0; i < 80; i++) {
    stepSim(DT);
    parkCrowd(world.ref);
    assert.equal(world.ref.tumble, 0);
    assert.equal(world.ref.struck, 0);
    assert.equal(checkedCyclePose(world.ref.struck, world.ref.tumble), null);
  }
});
