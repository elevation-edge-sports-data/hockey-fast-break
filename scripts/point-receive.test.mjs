/**
 * A forward's pass toward the blue-line / boards corner.
 * The pass-side defenseman skates onto the puck and stays onside.
 * The partner keeps the shallow board anchor.
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

const { resetWorld, stepSim, world, faceYaw } = sim;
const { useGame } = store;
const { BLUE_X, BLUE_LINE_W, RINK_W, FACEOFF_SPOT_Z } = rink;
const { setInjectedKeys } = input;

const DT = 1 / 60;
const RELEASE_FRAMES = 27;
const PUCK_DRAG = 0.2;

// Frame 1712 release and frame 1739 corrected receiver, attack -1.
const RELEASE = [
  { id: 0, x: 26.277, z: -0.117 },
  { id: 1, x: -9.923, z: -11.157 },
  { id: 2, x: -11.591, z: 5.642 },
  { id: 3, x: -23.328, z: -8.351 },
  { id: 4, x: -20.985, z: -1.503 },
  { id: 5, x: -22.002, z: 6.701 },
  { id: 6, x: -26.277, z: -0.7 },
  { id: 7, x: -25.896, z: 3.969 },
  { id: 8, x: -18.125, z: -6.41 },
  { id: 9, x: -10.873, z: 2.81 },
  { id: 10, x: -20.866, z: -5.544 },
  { id: 11, x: -22.579, z: 4.366 },
];
const PUCK_RELEASE = { x: -21.861, z: -7.428 };
const PUCK_LATER = { x: -11.203, z: -11.63 };
const RECEIVER_BUG = { x: -7.943, z: -11.12 };
const RECEIVER_WANT = { x: -10.384, z: -11.668 };

function fresh(attack) {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("classic");
  ui.setUserDefense(1);
  resetWorld();
  if (attack !== world.homeAttack) {
    world.homeAttack = attack;
    resetWorld({ keepScore: true });
  }
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.periodOver = false;
  world.replay = false;
  world.oneTimerArmed = false;
}

function place(s, x, z, attack) {
  s.x = attack < 0 ? x : -x;
  s.z = z;
  s.vx = 0;
  s.vz = 0;
  s.stun = 0;
  s.struck = 0;
  s.dive = 0;
  s.tumble = 0;
  s.hit = 0;
  s.poke = 0;
  s.backskate = false;
  s.yaw = faceYaw(s.side);
}

function halfSign(defs, s, attack) {
  const i = defs.findIndex((d) => d.id === s.id);
  const left = attack >= 0 ? 1 : -1;
  return (i % 2 === 0 ? left : -left);
}

function releaseVelocity() {
  const dx = PUCK_LATER.x - PUCK_RELEASE.x;
  const dz = PUCK_LATER.z - PUCK_RELEASE.z;
  const r = Math.exp(-PUCK_DRAG * DT);
  const sum = (DT * (1 - r ** RELEASE_FRAMES)) / (1 - r);
  return { vx: dx / sum, vz: dz / sum };
}

function armPass(attack, intoZone) {
  const passer = world.skaters.find((s) => s.side === "home" && s.kind === "winger");
  world.userId = passer.id;
  const defs = world.skaters
    .filter((s) => s.side === "home" && s.kind === "defense")
    .sort((a, b) => a.id - b.id);
  for (const row of RELEASE) {
    const s = world.skaters[row.id];
    place(s, row.x, row.z, attack);
  }
  // The snapshot's point man is on -z. Put whichever half owns that side there.
  const point = defs.find((d) => halfSign(defs, d, attack) < 0);
  const other = defs.find((d) => d !== point);
  const pointRow = RELEASE.find((row) => row.id === 1);
  const otherRow = RELEASE.find((row) => row.id === 2);
  place(point, pointRow.x, pointRow.z, attack);
  place(other, otherRow.x, otherRow.z, attack);

  const sign = attack < 0 ? 1 : -1;
  const vel = releaseVelocity();
  const puck = world.puck;
  puck.owner = null;
  puck.x = sign * PUCK_RELEASE.x;
  puck.z = PUCK_RELEASE.z;
  puck.y = 0.042;
  puck.vx = (intoZone ? -1 : 1) * sign * vel.vx;
  puck.vz = (intoZone ? -1 : 1) * vel.vz;
  puck.vy = 0;
  world.puckOz = attack < 0 ? -1 : 1;
  world.lastPass = world.time;
  world.lastPasser = passer.id;
  world.lastPassTo = null;
  world.lastPassX = passer.x;
  world.lastPassZ = passer.z;
  world.lastShoot = -10;
  world.lastHitTime = -10;
  world.goalieSaveT = -10;
  world.oneTimerArmed = false;
  world.whistle = null;
  world.stoppage = false;
  world.faceoff = false;
  return { passer, point, other };
}

function step(n) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function hypot(x, z) {
  return Math.hypot(x, z);
}

test("the pass-side defenseman meets the blue-line board pass onside", () => {
  for (const attack of [-1, 1]) {
    fresh(attack);
    const { point, other } = armPass(attack, false);
    const sign = attack < 0 ? 1 : -1;
    const want = { x: sign * RECEIVER_WANT.x, z: RECEIVER_WANT.z };
    const bug = { x: sign * RECEIVER_BUG.x, z: RECEIVER_BUG.z };
    const edge = (BLUE_X + BLUE_LINE_W * 0.5) * (attack < 0 ? -1 : 1);
    let owner = world.puck.owner;
    let ownedInside = false;
    const watch = () => {
      const prevX = world.puck.x;
      step(1);
      const gained = owner === null && world.puck.owner === point.id;
      owner = world.puck.owner;
      if (gained) {
        const prevInside = (prevX - edge) * attack > -0.05;
        const nowInside = (world.puck.x - edge) * attack > -0.05;
        ownedInside = prevInside && nowInside;
      }
      return (world.puck.x - edge) * attack > -0.05;
    };
    for (let i = 0; i < RELEASE_FRAMES; i++) watch();
    const dWant = hypot(point.x - want.x, point.z - want.z);
    const dBug = hypot(point.x - bug.x, point.z - bug.z);
    assert.ok(
      dWant < dBug,
      `attack ${attack} receiver ${(point.x).toFixed(2)},${point.z.toFixed(2)} is closer to the retreat (${dBug.toFixed(2)}) than the intercept (${dWant.toFixed(2)})`,
    );
    assert.ok(
      dWant < 0.75,
      `attack ${attack} receiver ${(point.x).toFixed(2)},${point.z.toFixed(2)} is ${dWant.toFixed(2)} m from the intercept`,
    );
    assert.ok(
      point.z < -11.157 - 0.2,
      `attack ${attack} receiver stayed off the pass lane (z ${point.z.toFixed(2)})`,
    );
    const inside = (point.x - edge) * attack;
    assert.ok(inside > 1.15, `attack ${attack} receiver is only ${inside.toFixed(2)} m inside the blue`);
    assert.ok(other.z * point.z < 0, `attack ${attack} partner joined the pass side (z ${other.z.toFixed(2)})`);
    assert.ok(
      Math.abs(other.z) > FACEOFF_SPOT_Z * 0.4,
      `attack ${attack} partner left his half (z ${other.z.toFixed(2)})`,
    );

    for (let i = 0; i < 90 && owner === null && world.whistle === null; i++) {
      if (!watch()) break;
    }
    assert.equal(owner, point.id, `attack ${attack} puck owner ${owner} whistle ${world.whistle}`);
    assert.equal(ownedInside, true, `attack ${attack} claim was not inside the zone`);
    assert.equal(world.whistle, null, `attack ${attack} whistled ${world.whistle}`);
  }
});

test("a pass back into the zone leaves the point on the board anchor", () => {
  fresh(-1);
  const { point } = armPass(-1, true);
  step(RELEASE_FRAMES);
  const anchorX = -(BLUE_X + 0.35);
  const anchorZ = -(RINK_W / 2 - 1.7);
  const dAnchor = hypot(point.x - anchorX, point.z - anchorZ);
  const dWant = hypot(point.x - RECEIVER_WANT.x, point.z - RECEIVER_WANT.z);
  assert.ok(
    dAnchor < dWant,
    `inward pass pulled the point to ${point.x.toFixed(2)},${point.z.toFixed(2)} (anchor ${dAnchor.toFixed(2)}, intercept ${dWant.toFixed(2)})`,
  );
  assert.notEqual(world.puck.owner, point.id);
});
