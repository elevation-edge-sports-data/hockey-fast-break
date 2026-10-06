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
const { BLUE_X, BLUE_LINE_W, GOAL_LINE_X, RINK_W } = rink;
const { setInjectedKeys } = input;

const DT = 1 / 60;
const EDGE = BLUE_X + BLUE_LINE_W * 0.5;
const Z_LIM = RINK_W / 2 - 1.6;

function fresh() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setControlProfile("classic");
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.homeAttack = 1;
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

function inBox(s, attack) {
  const mouth = attack * GOAL_LINE_X;
  const own = -mouth;
  if (attack > 0) {
    if (s.x > mouth - 2.6 + 0.05 || s.x < own + 2.4 - 0.05) return false;
  } else if (s.x < mouth + 2.6 - 0.05 || s.x > own - 2.4 + 0.05) return false;
  return Math.abs(s.z) <= Z_LIM + 0.05;
}

function assertSupport(side, attack, carrier, forwards, label) {
  assert.equal(world.whistle, null, `${label} whistled ${world.whistle}`);
  assert.ok(forwards.length >= 2, `${label} forward count`);
  const weak = -Math.sign(carrier.z || 1);
  for (const s of forwards) {
    const dist = Math.hypot(s.x - carrier.x, s.z - carrier.z);
    assert.ok(dist >= 3.4, `${label} F ${s.id} is trailing at ${dist.toFixed(2)} m`);
    assert.ok(dist < 18, `${label} F ${s.id} pass is ${dist.toFixed(2)} m`);
    const gap = defenderGap(s.x, s.z, side);
    let near = null;
    for (const o of world.skaters) {
      if (o.side === side || o.kind === "goalie") continue;
      const d = Math.hypot(o.x - s.x, o.z - s.z);
      if (!near || d < near.d) near = { d, id: o.id, kind: o.kind, x: o.x, z: o.z };
    }
    assert.ok(
      gap >= 3.2,
      `${label} F ${s.id} gap ${gap.toFixed(2)} at (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) nearest ${near ? `${near.kind} ${near.id} (${near.x.toFixed(2)}, ${near.z.toFixed(2)})` : "none"}`,
    );
    assert.ok(!laneBlocked(carrier.x, carrier.z, s.x, s.z, side), `${label} F ${s.id} lane is closed`);
    assert.ok(!shotStacked(s.x, s.z, carrier, attack), `${label} F ${s.id} is in the carrier's lane`);
    assert.ok(inBox(s, attack), `${label} F ${s.id} left the lane box (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
    assert.ok(s.x * attack > EDGE + 0.4, `${label} F ${s.id} is outside at along ${(s.x * attack).toFixed(2)}`);
  }
  for (let i = 0; i < forwards.length; i++) {
    for (let j = i + 1; j < forwards.length; j++) {
      const a = forwards[i];
      const b = forwards[j];
      const lat = Math.abs(a.z - b.z);
      const dep = Math.abs(a.x - b.x);
      assert.ok(
        lat >= 4.7 || dep >= 2.85,
        `${label} F ${a.id} and ${b.id} clump (lat ${lat.toFixed(2)}, depth ${dep.toFixed(2)})`,
      );
      assert.ok(
        !shotStacked(a.x, a.z, b, attack) && !shotStacked(b.x, b.z, a, attack),
        `${label} F ${a.id} shares ${b.id}'s lane to the net`,
      );
    }
  }
  const scored = forwards
    .map((s) => ({ s, depth: ozDepth(s.x, attack), z: s.z }))
    .sort((a, b) => a.depth - b.depth);
  assert.ok(scored[0].z * weak > 0, `${label} low forward is not on the weak side (z ${scored[0].z.toFixed(2)})`);
  assert.ok(scored[0].depth < 8, `${label} low forward is deep at ${scored[0].depth.toFixed(2)} (hash or blue)`);
  const strong = scored.find((p) => p.z * weak < 0);
  assert.ok(strong, `${label} nobody took the strong side`);
  assert.ok(
    strong.depth > scored[0].depth + 2.4,
    `${label} strong side is not higher (${strong.depth.toFixed(2)} vs ${scored[0].depth.toFixed(2)})`,
  );
}

test("both teams' forwards hold open support spots in the zone", () => {
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
    assertSupport(side, attack, carrier, forwards, `${side} deep`);
    const settled = forwards.map((s) => ({ id: s.id, x: s.x, z: s.z }));
    for (let i = 0; i < 240; i++) {
      pinCarrier(carrier, cx, cz);
      if (user.id !== carrier.id) pinStill(user, -18, 0);
      holdParked(keep);
      stepSim(DT);
    }
    pinCarrier(carrier, cx, cz);
    assertSupport(side, attack, carrier, forwards, `${side} held`);
    for (const was of settled) {
      const now = forwards.find((s) => s.id === was.id);
      const moved = Math.hypot(now.x - was.x, now.z - was.z);
      assert.ok(moved < 1.25, `${side} F ${was.id} left a good spot (${moved.toFixed(2)} m)`);
    }
  }
});

test("a covered spot is the one that rotates", () => {
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
  for (let i = 0; i < 160; i++) {
    pinCarrier(carrier, cx, cz);
    pinStill(user, -18, 0);
    holdParked(keep);
    stepSim(DT);
  }
  const ranked = [...forwards].sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const covered = ranked[0];
  const spot = { x: covered.x, z: covered.z };
  const open = forwards
    .filter((s) => s.id !== covered.id)
    .map((s) => ({ id: s.id, x: s.x, z: s.z }));
  const foe = world.skaters.find((s) => s.side === "away" && s.kind !== "goalie");
  for (let i = 0; i < 140; i++) {
    pinCarrier(carrier, cx, cz);
    pinStill(user, -18, 0);
    holdParked(keep);
    pinStill(foe, spot.x, spot.z);
    stepSim(DT);
  }
  const left = Math.hypot(covered.x - spot.x, covered.z - spot.z);
  assert.ok(left > 2.4, `covered forward only moved ${left.toFixed(2)} m`);
  for (const was of open) {
    const now = forwards.find((s) => s.id === was.id);
    const held = Math.hypot(now.x - was.x, now.z - was.z);
    assert.ok(
      held < 1.6,
      `open forward ${was.id} left a good spot (${held.toFixed(2)} m) from (${was.x.toFixed(1)},${was.z.toFixed(1)})`,
    );
  }
  assert.ok(defenderGap(covered.x, covered.z, "home") >= 3.2);
  assert.ok(!laneBlocked(cx, cz, covered.x, covered.z, "home"));
  assert.ok(!shotStacked(covered.x, covered.z, { x: cx, z: cz }, attack));
  for (const was of open) {
    const now = forwards.find((s) => s.id === was.id);
    assert.ok(
      !shotStacked(covered.x, covered.z, now, attack) && !shotStacked(now.x, now.z, covered, attack),
      `covered forward settled on ${was.id}'s lane`,
    );
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
    assertSupport(side, attack, carrier, forwards, `${side} from the join`);
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
