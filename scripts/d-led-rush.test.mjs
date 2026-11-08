/**
 * Defenseman leading the rush. Opposite wing stays straight until the attacking
 * blue, then angles to the boards hash. Center takes the near hash on the
 * circle. The trailer stays high and central. The same-side wing covers as
 * the last skater on that wall.
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
const { BLUE_X, BLUE_LINE_W, FACEOFF_EZ_X, FACEOFF_R, FACEOFF_SPOT_Z, GOAL_LINE_X, HASH_MARK_INSIDE } =
  rink;
const { setInjectedKeys } = input;

const DT = 1 / 60;
const EDGE = BLUE_X + BLUE_LINE_W * 0.5;
const BOARD_ALONG = 20.447455698759427;
const BOARD_Z = 12.292996327550926;
const TRAILER_ALONG = 7.927440395050955;
const SAFETY_GAP = 1.443194390938851;
const SAFETY_Z = 12.0780860968478;

function fresh(homeAttack) {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.homeAttack = homeAttack;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
}

function attackOf(side) {
  return side === "home" ? world.homeAttack : -world.homeAttack;
}

function wings(side) {
  return world.skaters
    .filter((s) => s.side === side && s.kind === "winger")
    .sort((a, b) => a.id - b.id);
}

function defs(side) {
  return world.skaters
    .filter((s) => s.side === side && s.kind === "defense")
    .sort((a, b) => a.id - b.id);
}

function roleOf(list, s) {
  const i = list.findIndex((p) => p.id === s.id);
  const c = list.length <= 2 ? 0 : Math.floor((list.length - 1) / 2);
  if (i < 0 || i === c) return "center";
  return i < c ? "left" : "right";
}

function pinStill(s, x, z) {
  s.x = x;
  s.z = z;
  s.vx = 0;
  s.vz = 0;
  s.stun = 40;
  s.struck = 0;
  s.dive = 0;
  s.tumble = 0;
}

function pinCarrier(s, x, z, vx) {
  s.x = x;
  s.z = z;
  s.vx = vx;
  s.vz = 0;
  s.stun = 0;
  s.struck = 0;
  s.dive = 0;
  s.tumble = 0;
  s.yaw = s.side === "home" ? -Math.PI / 2 : Math.PI / 2;
  const puck = world.puck;
  puck.owner = s.id;
  puck.x = x;
  puck.z = z;
  puck.y = 0.05;
  puck.vx = vx;
  puck.vz = 0;
  puck.vy = 0;
  world.lastPass = world.time;
  world.lastShoot = world.time;
  world.whistle = null;
  world.stoppage = false;
  world.faceoff = false;
  world.delayedOffside = 0;
}

/** Hash closest to the net, where that line meets the circle toward center ice. */
function hashMeet(attack, side) {
  const dotX = attack * FACEOFF_EZ_X;
  const dotZ = side * FACEOFF_SPOT_Z;
  const inner = HASH_MARK_INSIDE / 2;
  const reach = Math.sqrt(FACEOFF_R * FACEOFF_R - inner * inner);
  return { x: dotX + attack * inner, z: dotZ - side * reach, dotX, dotZ };
}

test("RD rush keeps the far wing straight, then sends each role to its spot", () => {
  fresh(-1);
  const attack = attackOf("home");
  assert.equal(attack, -1);
  const backs = defs("home");
  const forwards = wings("home");
  assert.equal(backs.length, 2);
  assert.equal(forwards.length, 3);
  const ld = backs[0];
  const rd = backs[1];
  const lw = forwards.find((s) => roleOf(forwards, s) === "left");
  const c = forwards.find((s) => roleOf(forwards, s) === "center");
  const rw = forwards.find((s) => roleOf(forwards, s) === "right");
  world.userId = rd.id;
  const foes = world.skaters
    .filter((s) => s.side === "away" && s.kind !== "goalie")
    .sort((a, b) => a.id - b.id);
  const deep = foes[0];
  const laneZ = 6.4;
  lw.x = 8;
  lw.z = laneZ;
  c.x = 3;
  c.z = -1.2;
  rw.x = 11;
  rw.z = -4;
  ld.x = 9;
  ld.z = 2.4;
  for (const s of [lw, c, rw, ld]) {
    s.vx = 0;
    s.vz = 0;
    s.stun = 0;
  }
  let minZ = laneZ;
  let minX = lw.x;
  const holdFoes = (deepX) => {
    foes.forEach((s, i) => pinStill(s, i === 0 ? deepX : attack * 24, i === 0 ? -1 : (i - 2) * 2));
  };
  for (let i = 0; i < 120; i++) {
    pinCarrier(rd, 1.2, -8, attack * 6);
    holdFoes(14);
    stepSim(DT);
    if (lw.x * attack < EDGE - 0.2) minZ = Math.min(minZ, lw.z * -attack);
    minX = Math.min(minX, lw.x);
  }
  assert.equal(world.whistle, null, `whistle ${world.whistle}`);
  assert.ok(minZ > laneZ - 1.35, `LW cut inward to z ${minZ.toFixed(2)}`);
  assert.ok(minX < -4, `LW hesitated in the neutral zone at x ${minX.toFixed(2)}`);
  assert.ok(lw.x * attack < EDGE - 0.05, `LW crossed before the puck (${lw.x.toFixed(2)})`);
  assert.ok(rw.x > 13.2, `RW got ahead of the high opponent (${rw.x.toFixed(2)})`);
  assert.ok(rw.z < -8, `RW left the boards side (z ${rw.z.toFixed(2)})`);

  const deepX = -13.8647;
  for (let i = 0; i < 360; i++) {
    pinCarrier(rd, -22, -6.5, attack * 3);
    holdFoes(deepX);
    stepSim(DT);
  }
  assert.equal(world.whistle, null, `entry whistle ${world.whistle}`);
  const meet = hashMeet(attack, -1);
  assert.ok(Math.abs(Math.hypot(meet.x - meet.dotX, meet.z - meet.dotZ) - FACEOFF_R) < 0.02);
  assert.ok(Math.hypot(lw.x - attack * BOARD_ALONG, lw.z - BOARD_Z) < 1.7, `LW ${(lw.x).toFixed(2)},${lw.z.toFixed(2)}`);
  assert.ok(lw.z > 11.6, `LW short of the boards (z ${lw.z.toFixed(2)})`);
  assert.ok(Math.hypot(c.x - meet.x, c.z - meet.z) < 1.7, `C ${(c.x).toFixed(2)},${c.z.toFixed(2)} want ${meet.x.toFixed(2)},${meet.z.toFixed(2)}`);
  assert.ok(c.z < -0.6 && c.z > -4.2, `C left the inner hash (z ${c.z.toFixed(2)})`);
  assert.ok(Math.abs(ld.z) < 1.6, `trailer stayed wide (z ${ld.z.toFixed(2)})`);
  assert.ok(Math.abs(ld.x * attack - TRAILER_ALONG) < 1.3, `trailer depth ${(ld.x * attack).toFixed(2)}`);
  const safetyX = deepX + SAFETY_GAP;
  assert.ok(Math.hypot(rw.x - safetyX, rw.z - -SAFETY_Z) < 1.8, `RW ${(rw.x).toFixed(2)},${rw.z.toFixed(2)} want ${safetyX.toFixed(2)},${(-SAFETY_Z).toFixed(2)}`);
  assert.ok(rw.z < -11.5, `RW inside the pad (z ${rw.z.toFixed(2)})`);
  assert.ok(rw.x > deepX + 0.6, `RW is not behind the deepest opponent (${rw.x.toFixed(2)} vs ${deepX.toFixed(2)})`);
});

test("LD rush mirrors the four spots", () => {
  fresh(1);
  const attack = attackOf("home");
  assert.equal(attack, 1);
  const backs = defs("home");
  const forwards = wings("home");
  const ld = backs[0];
  const rd = backs[1];
  const lw = forwards.find((s) => roleOf(forwards, s) === "left");
  const c = forwards.find((s) => roleOf(forwards, s) === "center");
  const rw = forwards.find((s) => roleOf(forwards, s) === "right");
  world.userId = ld.id;
  const foes = world.skaters
    .filter((s) => s.side === "away" && s.kind !== "goalie")
    .sort((a, b) => a.id - b.id);
  const deep = foes[0];
  rw.x = -8;
  rw.z = -6.2;
  lw.x = -10;
  lw.z = 3;
  c.x = -4;
  c.z = 1;
  rd.x = -9;
  rd.z = -1;
  for (const s of [rw, lw, c, rd]) {
    s.vx = 0;
    s.vz = 0;
    s.stun = 0;
  }
  let maxZ = rw.z;
  const holdFoes = (deepX) => {
    foes.forEach((s, i) => pinStill(s, i === 0 ? deepX : attack * 24, i === 0 ? 1 : (i - 2) * 2));
  };
  for (let i = 0; i < 100; i++) {
    pinCarrier(ld, -1.2, -8, attack * 6);
    holdFoes(-14);
    stepSim(DT);
    if (rw.x * attack < EDGE - 0.2) maxZ = Math.max(maxZ, rw.z);
  }
  assert.equal(world.whistle, null);
  assert.ok(maxZ < -4.6, `opposite wing cut inward to z ${maxZ.toFixed(2)}`);

  const deepX = 13.86;
  for (let i = 0; i < 360; i++) {
    pinCarrier(ld, 22, -6, attack * 3);
    holdFoes(deepX);
    stepSim(DT);
  }
  assert.equal(world.whistle, null, `mirror whistle ${world.whistle}`);
  const meet = hashMeet(attack, -1);
  assert.ok(Math.hypot(rw.x - attack * BOARD_ALONG, rw.z - BOARD_Z) < 1.7, `RW ${(rw.x).toFixed(2)},${rw.z.toFixed(2)}`);
  assert.ok(rw.z > 11.6, `RW short of the boards (z ${rw.z.toFixed(2)})`);
  assert.ok(Math.hypot(c.x - meet.x, c.z - meet.z) < 1.7, `C ${(c.x).toFixed(2)},${c.z.toFixed(2)}`);
  assert.ok(Math.abs(rd.z) < 1.6, `trailer wide (z ${rd.z.toFixed(2)})`);
  assert.ok(Math.abs(rd.x - TRAILER_ALONG) < 1.3, `trailer x ${rd.x.toFixed(2)}`);
  const safetyX = deepX - attack * SAFETY_GAP;
  assert.ok(Math.hypot(lw.x - safetyX, lw.z + SAFETY_Z) < 1.8, `LW ${(lw.x).toFixed(2)},${lw.z.toFixed(2)} want ${safetyX.toFixed(2)},${(-SAFETY_Z).toFixed(2)}`);
  assert.ok(lw.x < deepX - 0.6, `LW is not the last skater (${lw.x.toFixed(2)} vs ${deepX.toFixed(2)})`);
});
