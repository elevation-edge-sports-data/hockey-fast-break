/**
 * Headless check: on possession, both teams' forwards take separated support
 * spots with an open lane. A good spot holds. A covered one is the only one
 * that moves. The rush join is not pulled back across the blue.
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
const { BLUE_X, BLUE_LINE_W, FACEOFF_SPOT_Z, GOAL_LINE_X, RINK_W } = rink;
const { setInjectedKeys } = input;

const DT = 1 / 60;
const EDGE = BLUE_X + BLUE_LINE_W * 0.5;

function fresh() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setControlProfile("classic");
  resetWorld();
  world.homeAttack = 1;
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

function ozDepth(x, attack) {
  return (attack * GOAL_LINE_X - x) * attack;
}

function laneBlocked(x0, z0, x1, z1, side) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  if (len2 < 6) return false;
  for (const o of world.skaters) {
    if (o.side === side || o.kind === "goalie") continue;
    const t = ((o.x - x0) * dx + (o.z - z0) * dz) / len2;
    if (t < 0.14 || t > 0.86) continue;
    const px = x0 + dx * t;
    const pz = z0 + dz * t;
    if (Math.hypot(o.x - px, o.z - pz) < 1.22) return true;
  }
  return false;
}

function defenderGap(tx, tz, side) {
  let best = 28;
  for (const o of world.skaters) {
    if (o.side === side || o.kind === "goalie") continue;
    const d = Math.hypot(o.x - tx, o.z - tz);
    if (d < best) best = d;
  }
  return best;
}

/** Same lane test as shotStacked in sim.ts. */
function shotStacked(tx, tz, pivot, attack) {
  const depth = Math.max(0.35, ozDepth(tx, attack));
  const cDepth = ozDepth(pivot.x, attack);
  if (cDepth < 0.8) {
    return depth < 6.2 && Math.abs(pivot.z) > 2 && tz * pivot.z > 0 && Math.abs(tz - pivot.z) < 2.4;
  }
  const lineZ = pivot.z * (depth / Math.max(0.45, cDepth));
  if (Math.abs(tz - lineZ) < 2.05) return true;
  const angP = Math.atan2(tz, depth);
  const angC = Math.atan2(pivot.z, Math.max(0.45, cDepth));
  return Math.abs(angP - angC) < 0.28;
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

function pinCarrier(s, x, z) {
  s.x = x;
  s.z = z;
  s.vx = 0;
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
  puck.vx = 0;
  puck.vz = 0;
  puck.vy = 0;
  world.lastPass = world.time;
  world.lastShoot = world.time;
  world.whistle = null;
  world.stoppage = false;
  world.faceoff = false;
  world.delayedOffside = 0;
}

function pinGoals() {
  for (const g of world.skaters) {
    if (g.kind !== "goalie") continue;
    const net = g.side === "home" ? -world.homeAttack : world.homeAttack;
    pinStill(g, net * (GOAL_LINE_X - 0.8), 0);
  }
}

function parkSpot(n) {
  return { x: n % 2 === 0 ? 1.2 : -1.2, z: -6 + (n % 5) * 2.4 };
}

function parkOthers(keep) {
  let n = 0;
  for (const s of world.skaters) {
    if (s.kind === "goalie" || keep.has(s.id)) continue;
    const p = parkSpot(n);
    pinStill(s, p.x, p.z);
    n += 1;
  }
  pinGoals();
}

function holdParked(keep) {
  let n = 0;
  for (const s of world.skaters) {
    if (s.kind === "goalie" || keep.has(s.id)) continue;
    const p = parkSpot(n);
    pinStill(s, p.x, p.z);
    n += 1;
  }
  pinGoals();
}

/** Offensive-zone carry uses the goal-line corners instead of the old support triangle. */
function assertUserCorners(attack, carrier, forwards, label) {
  assert.equal(world.whistle, null, `${label} whistled ${world.whistle}`);
  const edge = BLUE_X + BLUE_LINE_W * 0.5;
  for (const s of forwards) {
    const along = s.x * attack;
    const depth = GOAL_LINE_X - along;
    const fromBlue = along - edge;
    assert.ok(
      depth + 0.3 < fromBlue,
      `${label} F ${s.id} is nearer the blue than the goal line (depth ${depth.toFixed(2)}, blue ${fromBlue.toFixed(2)})`,
    );
    const dist = Math.hypot(s.x - carrier.x, s.z - carrier.z);
    assert.ok(dist > 4.2, `${label} F ${s.id} is on the carrier (${dist.toFixed(2)})`);
  }
  for (let i = 0; i < forwards.length; i++) {
    for (let j = i + 1; j < forwards.length; j++) {
      const d = Math.hypot(forwards[i].x - forwards[j].x, forwards[i].z - forwards[j].z);
      assert.ok(d > 4.2, `${label} forwards share a spot (${d.toFixed(2)})`);
    }
  }
  const far = Math.max(...forwards.map((s) => Math.abs(s.z)));
  assert.ok(far > 8, `${label} nobody took a board corner (${far.toFixed(2)})`);
}

test("both teams' forwards hold the end-line corners in the zone", () => {
  for (const side of ["home", "away"]) {
    fresh();
    const attack = attackOf(side);
    const backs = defs(side);
    const carrier = backs[backs.length - 1];
    const user = side === "home" ? backs[0] : world.skaters[world.userId];
    if (side === "home") world.userId = user.id;
    const forwards = wings(side);
    assert.equal(forwards.length, 3);
    const cx = attack * (GOAL_LINE_X - 4);
    const cz = 8;
    const keep = new Set([carrier.id, user.id, ...forwards.map((s) => s.id)]);
    parkOthers(keep);
    forwards.forEach((s, i) => {
      s.stun = 0;
      s.vx = 0;
      s.vz = 0;
      s.x = attack * (GOAL_LINE_X - 9);
      s.z = [-3.2, 0.4, 4.2][i];
    });
    const steps = 160;
    for (let i = 0; i < steps; i++) {
      pinCarrier(carrier, cx, cz);
      if (user.id !== carrier.id) pinStill(user, -18, 0);
      holdParked(keep);
      stepSim(DT);
    }
    pinCarrier(carrier, cx, cz);
    assertUserCorners(attack, carrier, forwards, `${side} deep`);
    const settled = forwards.map((s) => ({ id: s.id, x: s.x, z: s.z }));
    for (let i = 0; i < 240; i++) {
      pinCarrier(carrier, cx, cz);
      if (user.id !== carrier.id) pinStill(user, -18, 0);
      holdParked(keep);
      stepSim(DT);
    }
    pinCarrier(carrier, cx, cz);
    assertUserCorners(attack, carrier, forwards, `${side} held`);
    for (const was of settled) {
      const now = forwards.find((s) => s.id === was.id);
      const moved = Math.hypot(now.x - was.x, now.z - was.z);
      assert.ok(moved < 1.25, `${side} F ${was.id} left a good spot (${moved.toFixed(2)} m)`);
    }
  }
});

test("user teammates hold separate end-line corners", () => {
  fresh();
  const attack = 1;
  const backs = defs("home");
  const carrier = backs[1];
  const user = backs[0];
  world.userId = user.id;
  const forwards = wings("home");
  const cx = GOAL_LINE_X - 4;
  const cz = 8;
  const keep = new Set([carrier.id, user.id, ...forwards.map((s) => s.id)]);
  parkOthers(keep);
  forwards.forEach((s, i) => {
    s.stun = 0;
    s.x = GOAL_LINE_X - 9;
    s.z = [-3, 1, 5][i];
    s.vx = 0;
    s.vz = 0;
  });
  for (let i = 0; i < 180; i++) {
    pinCarrier(carrier, cx, cz);
    pinStill(user, -18, 0);
    holdParked(keep);
    stepSim(DT);
  }
  pinCarrier(carrier, cx, cz);
  assertUserCorners(attack, carrier, forwards, "corners");
  const settled = forwards.map((s) => ({ id: s.id, x: s.x, z: s.z }));
  for (let i = 0; i < 90; i++) {
    pinCarrier(carrier, cx, cz);
    pinStill(user, -18, 0);
    holdParked(keep);
    stepSim(DT);
  }
  for (const was of settled) {
    const now = forwards.find((s) => s.id === was.id);
    const moved = Math.hypot(now.x - was.x, now.z - was.z);
    assert.ok(moved < 1.4, `F ${was.id} left the corner (${moved.toFixed(2)} m)`);
  }
});

test("forwards already inside the blue are not pulled back out", () => {
  for (const side of ["home", "away"]) {
    fresh();
    const attack = attackOf(side);
    const backs = defs(side);
    const carrier = backs[backs.length - 1];
    const user = side === "home" ? backs[0] : world.skaters[world.userId];
    if (side === "home") world.userId = user.id;
    const forwards = wings(side);
    const cx = attack * (GOAL_LINE_X - 5.5);
    const cz = 7.4;
    const keep = new Set([carrier.id, user.id, ...forwards.map((s) => s.id)]);
    parkOthers(keep);
    const startAlong = EDGE + 1.35;
    forwards.forEach((s, i) => {
      s.stun = 0;
      s.vx = 0;
      s.vz = 0;
      s.x = attack * startAlong;
      s.z = [-2.2, 0.2, 2.6][i];
    });
    let worst = Infinity;
    let inside = Infinity;
    const late = [];
    for (let i = 0; i < 200; i++) {
      pinCarrier(carrier, cx, cz);
      if (user.id !== carrier.id) pinStill(user, -18, 0);
      holdParked(keep);
      stepSim(DT);
      if (i > 8) {
        for (const s of forwards) worst = Math.min(worst, s.x * attack);
      }
      if (i === 120) {
        for (const s of forwards) inside = Math.min(inside, s.x * attack);
      }
      if (i === 170) late.push(...forwards.map((s) => ({ id: s.id, x: s.x, z: s.z })));
    }
    assert.equal(world.whistle, null, `${side} whistled`);
    assert.ok(worst > EDGE + 0.35, `${side} pulled back to along ${worst.toFixed(2)}`);
    assert.ok(inside > EDGE + 4, `${side} still sorting at the blue after entry (${inside.toFixed(2)})`);
    for (const s of forwards) {
      assert.ok(
        s.x * attack > startAlong + 1.5,
        `${side} F ${s.id} still sorting at the blue (${(s.x * attack).toFixed(2)})`,
      );
    }
    for (const was of late) {
      const now = forwards.find((s) => s.id === was.id);
      const moved = Math.hypot(now.x - was.x, now.z - was.z);
      assert.ok(moved < 1.5, `${side} F ${was.id} left the spot after arriving (${moved.toFixed(2)} m)`);
    }
    assertUserCorners(attack, carrier, forwards, `${side} from the join`);
  }
});

test("a winger carrier does not leave teammates trailing the puck", () => {
  for (const side of ["home", "away"]) {
    fresh();
    const attack = attackOf(side);
    const forwards = wings(side);
    const carrier = forwards[0];
    const mates = forwards.slice(1);
    const user = side === "home" ? defs("home")[0] : world.skaters[world.userId];
    if (side === "home") world.userId = user.id;
    const cx = attack * (GOAL_LINE_X - 6);
    const cz = -6.5;
    const keep = new Set([user.id, ...forwards.map((s) => s.id)]);
    parkOthers(keep);
    mates.forEach((s, i) => {
      s.stun = 0;
      s.vx = 0;
      s.vz = 0;
      s.x = attack * (GOAL_LINE_X - 11);
      s.z = i === 0 ? 2 : -2;
    });
    for (let i = 0; i < 160; i++) {
      pinCarrier(carrier, cx, cz);
      if (user.id !== carrier.id) pinStill(user, 18, 6);
      holdParked(keep);
      stepSim(DT);
    }
    pinCarrier(carrier, cx, cz);
    assert.equal(world.whistle, null, `${side} whistled`);
    for (const s of mates) {
      const dist = Math.hypot(s.x - cx, s.z - cz);
      assert.ok(dist > 3.4 && dist < 18, `${side} mate ${s.id} dist ${dist.toFixed(2)}`);
      assert.ok(!laneBlocked(cx, cz, s.x, s.z, side), `${side} mate ${s.id} lane closed`);
      assert.ok(defenderGap(s.x, s.z, side) >= 3.2, `${side} mate ${s.id} covered`);
      assert.ok(s.x * attack > EDGE, `${side} mate ${s.id} left the zone`);
    }
    const lat = Math.abs(mates[0].z - mates[1].z);
    const dep = Math.abs(mates[0].x - mates[1].x);
    assert.ok(lat >= 4.7 || dep >= 2.85, `${side} mates clumped (lat ${lat.toFixed(2)}, depth ${dep.toFixed(2)})`);
    assert.ok(!shotStacked(mates[0].x, mates[0].z, mates[1], attack), `${side} mates share a lane`);
  }
});

test("CPU offense keeps its corners when the puck moves between the points", () => {
  fresh();
  const attack = attackOf("away");
  const forwards = wings("away");
  const backs = defs("away");
  const carrier = forwards[0];
  const center = forwards[1];
  const wingsOnly = forwards.filter((s) => s.id !== carrier.id && s.id !== center.id);
  assert.equal(forwards.length, 3);
  assert.equal(backs.length, 2);
  assert.ok(wingsOnly.length >= 1);
  const keep = new Set([carrier.id, ...forwards.map((s) => s.id), ...backs.map((s) => s.id)]);
  parkOthers(keep);
  for (const s of [...forwards, ...backs]) {
    s.stun = 0;
    s.vx = 0;
    s.vz = 0;
    s.x = attack * (EDGE + 2);
    s.z = 0;
  }
  const boards = RINK_W / 2 - 2.2;
  const blue = attack * (EDGE + 1.2);
  const settle = (who, z) => {
    for (let i = 0; i < 180; i++) {
      pinCarrier(who, blue, z);
      holdParked(keep);
      stepSim(DT);
    }
  };
  settle(carrier, boards);
  for (const s of forwards) {
    if (s.id === carrier.id) continue;
    const depth = GOAL_LINE_X - s.x * attack;
    const fromBlue = s.x * attack - EDGE;
    assert.ok(depth < fromBlue, `CPU F ${s.id} stayed near the blue (depth ${depth.toFixed(2)})`);
    assert.ok(Math.hypot(s.x - blue, s.z - boards) > 4.2, `CPU F ${s.id} chased the carrier`);
  }
  assert.ok(Math.abs(center.z) < 8, `CPU center took a corner (z ${center.z.toFixed(2)})`);
  const wingSide = new Map(wingsOnly.map((s) => [s.id, Math.sign(s.z) || 1]));
  const dSide = new Map(backs.map((s) => [s.id, Math.sign(s.z)]));
  assert.equal(dSide.get(backs[0].id), -1, `left CPU defense started at z ${backs[0].z.toFixed(2)}`);
  assert.equal(dSide.get(backs[1].id), 1, `right CPU defense started at z ${backs[1].z.toFixed(2)}`);
  for (const d of backs) {
    assert.ok(Math.abs(d.z) > 8, `CPU defense ${d.id} left the boards (z ${d.z.toFixed(2)})`);
    assert.ok(backs[0].z * backs[1].z < 0, "CPU defense shared a corner");
  }
  settle(backs[0], dSide.get(backs[0].id) * boards);
  settle(backs[1], dSide.get(backs[1].id) * boards);
  for (const s of wingsOnly) {
    const dotSide = wingSide.get(s.id);
    assert.equal(Math.sign(s.z) || dotSide, dotSide, `CPU wing ${s.id} switched boards to ${s.z.toFixed(2)}`);
    if (dotSide > 0) assert.ok(s.z >= -FACEOFF_SPOT_Z - 0.3, `CPU wing crossed the far dot (${s.z.toFixed(2)})`);
    else assert.ok(s.z <= FACEOFF_SPOT_Z + 0.3, `CPU wing crossed the far dot (${s.z.toFixed(2)})`);
  }
  assert.ok(Math.abs(center.z) < 8, `CPU center left the net front (z ${center.z.toFixed(2)})`);
  for (const d of backs) {
    if (d.id === backs[1].id) continue;
    assert.equal(Math.sign(d.z), dSide.get(d.id), `CPU defense ${d.id} switched halves to ${d.z.toFixed(2)}`);
    assert.ok(Math.abs(d.z) > 8, `CPU defense ${d.id} left its corner (z ${d.z.toFixed(2)})`);
  }
  for (let i = 0; i < 180; i++) {
    pinCarrier(carrier, 0, -boards);
    holdParked(keep);
    stepSim(DT);
  }
  for (const d of backs) {
    assert.equal(Math.sign(d.z), dSide.get(d.id), `CPU defense ${d.id} crossed with the zone (${d.z.toFixed(2)})`);
    assert.ok(Math.abs(d.z) > 3, `CPU defense ${d.id} stacked at center (${d.z.toFixed(2)})`);
  }
});
