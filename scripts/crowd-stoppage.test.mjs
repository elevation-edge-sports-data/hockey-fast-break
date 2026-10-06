/**
 * A crowd whistle stops the clock only. The puck keeps its incoming speed,
 * bounces off crowd solids, and falls for 3 seconds. Then the saved faceoff runs.
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
const crowd = await server.ssrLoadModule("/src/game/crowd.ts");
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { resetWorld, stepSim, world } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;
const { sweepCrowd, CROWD_PUCK_R, STANDS, PERSON_LIFT, JUMBO_Y, outsideStandFootprint, SEAT_D } =
  crowd;
const { resolveRink, RINK_L, RINK_W, FACEOFF_EZ_X, FACEOFF_NZ_X, FACEOFF_SPOT_Z } = rink;

const DT = 1 / 60;

function liveSheet() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.puck.owner = null;
  ui.setWhistle(null);
  ui.setPeriodOver(false);
}

function launch(x, y, z, vx, vy, vz) {
  const puck = world.puck;
  puck.owner = null;
  puck.x = x;
  puck.y = y;
  puck.z = z;
  puck.vx = vx;
  puck.vy = vy;
  puck.vz = vz;
}

function untilCrowd(limit = 180) {
  for (let i = 0; i < limit; i++) {
    if (world.whistle === "crowd") return i;
    stepSim(DT);
  }
  return -1;
}

test("jumbotron side keeps speed, stops the clock, and faceoffs after 3s", () => {
  liveSheet();
  launch(0, JUMBO_Y, 14, 0, 0, -30);
  const frames = untilCrowd();
  assert.ok(frames >= 0, "puck never reached the crowd");
  const puck = world.puck;
  assert.equal(world.stoppage, true);
  assert.equal(useGame.getState().whistle, "crowd");
  assert.ok(puck.vz > 15, `incoming speed was cut, vz=${puck.vz} y=${puck.y} z=${puck.z}`);
  assert.equal(puck.owner, null);
  const faceX = world.faceX;
  const faceZ = world.faceZ;
  assert.equal(faceX, 0);
  assert.equal(faceZ, 0);
  const clock = world.periodClock;
  const z0 = puck.z;
  const y0 = puck.y;
  for (let i = 0; i < 30; i++) stepSim(DT);
  assert.equal(world.whistle, "crowd");
  assert.equal(world.periodClock, clock, "clock ran during the crowd whistle");
  assert.ok(puck.z > z0 + 2, `puck froze on the hit, z ${z0} -> ${puck.z}`);
  assert.ok(puck.y < y0 - 0.15, `puck did not fall, y ${y0} -> ${puck.y}`);
  assert.equal(puck.owner, null);
  let n = 30;
  while (world.whistle === "crowd" && n < 250) {
    stepSim(DT);
    n++;
  }
  assert.ok(n >= 170 && n <= 190, `faceoff reset at step ${n}, want ~180`);
  assert.equal(world.whistle, null);
  assert.equal(world.faceoff, true);
  assert.equal(world.puck.x, faceX);
  assert.equal(world.puck.z, faceZ);
  assert.equal(world.periodClock, clock);
});

test("a shot into the jumbotron bottom bounces and falls", () => {
  liveSheet();
  launch(0, 18, 0, 0, 42, 0);
  assert.ok(untilCrowd() >= 0, "upward shot missed the jumbotron");
  const puck = world.puck;
  assert.ok(puck.vy < -10, `did not bounce down, vy=${puck.vy}`);
  const yHit = puck.y;
  for (let i = 0; i < 40; i++) stepSim(DT);
  assert.equal(world.whistle, "crowd");
  assert.ok(puck.y < yHit - 1, `puck stayed up, y ${yHit} -> ${puck.y}`);
});

test("a fan deflects the puck and the skaters do not take it", () => {
  liveSheet();
  const spot = STANDS.find((p) => p.y > 8 && Math.abs(p.x) < 15);
  assert.ok(spot, "no upper-deck seat");
  const dx = spot.x;
  const dz = spot.z;
  const len = Math.hypot(dx, dz) || 1;
  const ox = dx / len;
  const oz = dz / len;
  const cy = spot.y + PERSON_LIFT;
  const x0 = spot.x + ox * 0.85;
  const z0 = spot.z + oz * 0.85;
  launch(x0, cy, z0, -ox * 16, 0, -oz * 16);
  const skater = world.skaters.find((s) => s.kind !== "goalie");
  const sx = skater.x;
  const sz = skater.z;
  let prev = null;
  for (let i = 0; i < 90; i++) {
    prev = {
      x: world.puck.x,
      y: world.puck.y,
      z: world.puck.z,
      vx: world.puck.vx,
      vy: world.puck.vy,
      vz: world.puck.vz,
    };
    stepSim(DT);
    if (world.whistle === "crowd") break;
  }
  assert.equal(world.whistle, "crowd", "fan shot missed the crowd");
  const hit = sweepCrowd(
    prev.x,
    prev.y,
    prev.z,
    prev.x + prev.vx * DT,
    prev.y + prev.vy * DT,
    prev.z + prev.vz * DT,
    CROWD_PUCK_R,
  );
  assert.ok(hit, "whistle without a crowd contact");
  const puck = world.puck;
  const into = prev.vx * hit.nx + prev.vy * hit.ny + prev.vz * hit.nz;
  const away = puck.vx * hit.nx + puck.vy * hit.ny + puck.vz * hit.nz;
  assert.ok(into < -1, `shot was not into the fan, vn=${into}`);
  assert.ok(away > 1, `puck did not bounce off the fan, vn=${away}`);
  const speed = Math.hypot(puck.vx, puck.vy, puck.vz);
  assert.ok(speed > 10, `incoming speed was cut, speed=${speed}`);
  const x1 = puck.x;
  const y1 = puck.y;
  const z1 = puck.z;
  for (let i = 0; i < 20; i++) stepSim(DT);
  assert.equal(puck.owner, null);
  assert.equal(world.whistle, "crowd");
  assert.ok(Math.hypot(puck.x - x1, puck.y - y1, puck.z - z1) > 0.4, "puck froze on the fan");
  assert.ok(Math.hypot(skater.x - sx, skater.z - sz) < 8, "skater chased into the stands");
});

test("sweepCrowd normal on the jumbotron bottom points down", () => {
  const hit = sweepCrowd(0, 18, 0, 0, JUMBO_Y, 0, CROWD_PUCK_R);
  assert.ok(hit, "missed the jumbotron");
  assert.ok(hit.ny < -0.8, `normal ny=${hit.ny}`);
  assert.ok(Math.abs(hit.nx) < 0.2 && Math.abs(hit.nz) < 0.2);
});

function outwardOf(p) {
  const ice = resolveRink(p.x, p.z, 0);
  const d = (p.x - ice.x) * ice.nx + (p.z - ice.z) * ice.nz;
  return { d, nx: ice.nx, nz: ice.nz };
}

function farthestSeat(pred) {
  let best = null;
  let bestD = -1;
  for (const p of STANDS) {
    if (!pred(p)) continue;
    const o = outwardOf(p);
    if (o.d > bestD) {
      bestD = o.d;
      best = { p, ...o };
    }
  }
  return best;
}

test("the stand footprint is the outer face of the last seat row", () => {
  assert.equal(outsideStandFootprint(0, 0), false);
  assert.equal(outsideStandFootprint(0, -(RINK_W / 2 + 1.5)), false);
  assert.equal(outsideStandFootprint(RINK_L / 2 + 1.2, 0), false);
  const half = SEAT_D / 2;
  const samples = [
    farthestSeat((p) => Math.abs(p.x) < 8),
    farthestSeat((p) => Math.abs(p.z) < 3),
    farthestSeat((p) => Math.abs(p.x) > 20 && Math.abs(p.z) > 8),
  ];
  for (const seat of samples) {
    assert.ok(seat, "missing an outer seat");
    assert.equal(outsideStandFootprint(seat.p.x, seat.p.z), false);
    const inside = half - 0.04;
    const past = half + 0.04;
    assert.equal(
      outsideStandFootprint(seat.p.x + seat.nx * inside, seat.p.z + seat.nz * inside),
      false,
      `outer lip counted as outside at ${seat.p.x}, ${seat.p.z}`,
    );
    assert.equal(
      outsideStandFootprint(seat.p.x + seat.nx * past, seat.p.z + seat.nz * past),
      true,
      `past the last seat still inside at ${seat.p.x}, ${seat.p.z}`,
    );
  }
});

const FACEOFF_DOTS = [
  [0, 0],
  [FACEOFF_EZ_X, FACEOFF_SPOT_Z],
  [FACEOFF_EZ_X, -FACEOFF_SPOT_Z],
  [-FACEOFF_EZ_X, FACEOFF_SPOT_Z],
  [-FACEOFF_EZ_X, -FACEOFF_SPOT_Z],
  [FACEOFF_NZ_X, FACEOFF_SPOT_Z],
  [FACEOFF_NZ_X, -FACEOFF_SPOT_Z],
  [-FACEOFF_NZ_X, FACEOFF_SPOT_Z],
  [-FACEOFF_NZ_X, -FACEOFF_SPOT_Z],
];

function nearestFaceoff(x, z) {
  let bestX = 0;
  let bestZ = 0;
  let bestD = Infinity;
  for (const [dx, dz] of FACEOFF_DOTS) {
    const d = (dx - x) * (dx - x) + (dz - z) * (dz - z);
    if (d < bestD) {
      bestD = d;
      bestX = dx;
      bestZ = dz;
    }
  }
  return { x: bestX, z: bestZ };
}

/** Over the third deck and under the jumbotron, toward the bench side. */
function launchOverBowl() {
  launch(0, 20, 0, 0, 4, -55);
}

test("a puck that clears the bowl and lands whistles without touching a solid", () => {
  liveSheet();
  launchOverBowl();
  let sawAir = false;
  let before = null;
  let frames = -1;
  for (let i = 0; i < 500; i++) {
    const puck = world.puck;
    if (outsideStandFootprint(puck.x, puck.z) && puck.y > 3) {
      assert.equal(world.whistle, null, "flying over the stands whistled");
      sawAir = true;
    }
    before = { x: puck.x, y: puck.y, z: puck.z };
    stepSim(DT);
    if (world.whistle === "crowd") {
      frames = i;
      break;
    }
  }
  assert.ok(frames >= 0, "puck never whistled after leaving the bowl");
  assert.ok(sawAir, "puck was never airborne outside the bowl");
  const puck = world.puck;
  const hit = sweepCrowd(before.x, before.y, before.z, puck.x, puck.y, puck.z, CROWD_PUCK_R);
  assert.equal(hit, null, "landing whistle came from a solid");
  assert.ok(outsideStandFootprint(puck.x, puck.z), `landed inside the bowl at ${puck.x}, ${puck.z}`);
  assert.ok(puck.y <= 0.05, `whistled in the air, y=${puck.y}`);
  assert.ok(Math.abs(puck.vy) < 0.4, `vertical speed still live, vy=${puck.vy}`);
  const vz0 = puck.vz;
  assert.ok(vz0 < -8, `incoming speed was cut, vz=${vz0}`);
  assert.equal(puck.owner, null);
  const face = nearestFaceoff(puck.x, puck.z);
  assert.equal(world.faceX, face.x);
  assert.equal(world.faceZ, face.z);
  assert.equal(world.stoppage, true);
  assert.equal(useGame.getState().whistle, "crowd");
  const clock = world.periodClock;
  const z0 = puck.z;
  const y0 = puck.y;
  for (let i = 0; i < 30; i++) stepSim(DT);
  assert.equal(world.whistle, "crowd");
  assert.equal(world.periodClock, clock, "clock ran during the crowd whistle");
  assert.ok(Math.abs(puck.vz - vz0) < 0.5, `speed was cut after the whistle, ${vz0} -> ${puck.vz}`);
  assert.ok(puck.z < z0 - 2, `puck froze on the landing, z ${z0} -> ${puck.z}`);
  assert.ok(Math.abs(puck.y - y0) < 0.2, `puck left the ground, y ${y0} -> ${puck.y}`);
  let n = 30;
  while (world.whistle === "crowd" && n < 250) {
    stepSim(DT);
    n++;
  }
  assert.ok(n >= 170 && n <= 190, `faceoff reset at step ${n}, want ~180`);
  assert.equal(world.whistle, null);
  assert.equal(world.faceoff, true);
  assert.equal(world.puck.x, face.x);
  assert.equal(world.puck.z, face.z);
  assert.equal(world.periodClock, clock);
});

test("a loose puck on the ice or above the boards does not whistle", () => {
  liveSheet();
  launch(0, 0.042, 0, 0, 0, 0);
  for (let i = 0; i < 180; i++) {
    stepSim(DT);
    assert.notEqual(world.whistle, "crowd");
    if (world.puck.owner === null) {
      assert.equal(outsideStandFootprint(world.puck.x, world.puck.z), false);
    }
  }

  liveSheet();
  launch(0, 8, 0, 0, 2, 0);
  let peaked = false;
  for (let i = 0; i < 240; i++) {
    if (world.puck.y > 4) peaked = true;
    stepSim(DT);
    assert.notEqual(world.whistle, "crowd");
    if (world.whistle === null && world.puck.owner === null) {
      assert.equal(outsideStandFootprint(world.puck.x, world.puck.z), false);
    }
  }
  assert.ok(peaked, "pop fly never left the ice");
  assert.ok(world.puck.y < 0.2);
});

test("drill and practice do not whistle a puck that lands beyond the stands", () => {
  for (const mode of ["drill", "practice"]) {
    liveSheet();
    useGame.getState().setClockMode(mode);
    launchOverBowl();
    let landed = false;
    for (let i = 0; i < 500; i++) {
      stepSim(DT);
      assert.notEqual(world.whistle, "crowd", mode);
      const puck = world.puck;
      if (outsideStandFootprint(puck.x, puck.z) && puck.y <= 0.05 && Math.abs(puck.vy) < 0.4) {
        landed = true;
        break;
      }
    }
    assert.ok(landed, `${mode} puck never landed outside the bowl`);
    assert.equal(world.whistle, null);
    for (let i = 0; i < 30; i++) stepSim(DT);
    assert.notEqual(world.whistle, "crowd", mode);
  }
});
