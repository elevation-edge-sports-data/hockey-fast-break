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
    assert.ok(
      Math.abs(d.z) > 3.4 && Math.abs(d.z) < 7.6,
      `CPU defense ${d.id} did not slide along the blue (z ${d.z.toFixed(2)})`,
    );
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

/**
 * Captured point: home attack -1, defenseman on the offensive boards at the blue.
 * along is meters toward that attack. zSign mirrors the frame onto the other attack.
 */
const POINT_FRAME = {
  carrier: { along: 9.856, z: -10.899 },
  partner: { along: 8.822, z: 5.098 },
  strong: { along: 28.076, z: -8.465 },
  center: { along: 18.378, z: 0.19 },
  weak: { along: 23.123, z: 6.12 },
  start: {
    partner: { along: 9.549, z: 9.653 },
    strong: { along: 23.331, z: -10.085 },
    center: { along: 19.946, z: -0.4 },
    weak: { along: 12.595, z: 2.406 },
  },
  foes: [
    { along: 17.907, z: 4.243 },
    { along: 18.411, z: -4.301 },
    { along: 9.711, z: -6.192 },
    { along: 14.879, z: -1.732 },
    { along: 17.014, z: 7.713 },
  ],
};

function pointIce(attack, zSign, spot) {
  return { x: attack * spot.along, z: zSign * spot.z };
}

function loadAttack(homeAttack) {
  fresh();
  if (world.homeAttack !== homeAttack) {
    world.homeAttack = homeAttack;
    resetWorld({ keepScore: true });
    world.faceoff = false;
    world.faceoffPhase = "live";
    world.stoppage = false;
    world.whistle = null;
    world.delayedOffside = 0;
  }
}

test("a defenseman on the offensive boards at the blue sets the point shape", () => {
  for (const side of ["home", "away"]) {
    for (const homeAttack of [1, -1]) {
      loadAttack(homeAttack);
      const attack = attackOf(side);
      const zSign = attack < 0 ? 1 : -1;
      const backs = defs(side);
      const forwards = wings(side);
      assert.equal(backs.length, 2, `${side} defense`);
      assert.equal(forwards.length, 3, `${side} forwards`);
      const carrier = backs[0];
      const partner = backs[1];
      const centerI = Math.floor((forwards.length - 1) / 2);
      const center = forwards[centerI];
      const wingsOnly = forwards.filter((s) => s.id !== center.id);
      const foes = world.skaters
        .filter((s) => s.side !== side && s.kind !== "goalie")
        .sort((a, b) => a.id - b.id);
      assert.equal(foes.length, POINT_FRAME.foes.length);
      const at = (spot) => pointIce(attack, zSign, spot);
      const carrierAt = at(POINT_FRAME.carrier);
      const start = new Map([
        [partner.id, at(POINT_FRAME.start.partner)],
        [wingsOnly[0].id, at(POINT_FRAME.start.strong)],
        [center.id, at(POINT_FRAME.start.center)],
        [wingsOnly[1].id, at(POINT_FRAME.start.weak)],
      ]);
      if (side === "home") world.userId = carrier.id;
      for (const s of [partner, ...forwards]) {
        const p = start.get(s.id);
        s.stun = 0;
        s.vx = 0;
        s.vz = 0;
        s.x = p.x;
        s.z = p.z;
      }
      const foeAt = POINT_FRAME.foes.map((spot) => at(spot));
      const label = `${side} attack ${attack}`;
      for (let i = 0; i < 360; i++) {
        pinCarrier(carrier, carrierAt.x, carrierAt.z);
        if (side === "home") world.userId = carrier.id;
        foes.forEach((s, n) => pinStill(s, foeAt[n].x, foeAt[n].z));
        pinGoals();
        stepSim(DT);
      }
      pinCarrier(carrier, carrierAt.x, carrierAt.z);
      assert.equal(world.whistle, null, `${label} whistled ${world.whistle}`);
      const want = {
        partner: at(POINT_FRAME.partner),
        strong: at(POINT_FRAME.strong),
        center: at(POINT_FRAME.center),
        weak: at(POINT_FRAME.weak),
      };
      const pd = Math.hypot(partner.x - want.partner.x, partner.z - want.partner.z);
      assert.ok(pd < 1.15, `${label} partner ${pd.toFixed(2)} from the blue slide (${partner.x.toFixed(2)}, ${partner.z.toFixed(2)})`);
      assert.ok(partner.z * zSign > 3.4, `${label} partner left his half (${partner.z.toFixed(2)})`);
      const near = (spot) =>
        forwards
          .map((s) => ({ s, d: Math.hypot(s.x - spot.x, s.z - spot.z) }))
          .sort((a, b) => a.d - b.d)[0];
      const strong = near(want.strong);
      const slot = near(want.center);
      const weak = near(want.weak);
      assert.ok(strong.d < 1.8, `${label} strong wing ${strong.d.toFixed(2)} away (${strong.s.x.toFixed(2)}, ${strong.s.z.toFixed(2)})`);
      assert.ok(slot.d < 1.8, `${label} center ${slot.d.toFixed(2)} away (${slot.s.x.toFixed(2)}, ${slot.s.z.toFixed(2)})`);
      assert.ok(weak.d < 1.8, `${label} weak wing ${weak.d.toFixed(2)} away (${weak.s.x.toFixed(2)}, ${weak.s.z.toFixed(2)})`);
      assert.ok(strong.s.id !== slot.s.id && slot.s.id !== weak.s.id && strong.s.id !== weak.s.id, label);
      const below = (strong.s.x - attack * GOAL_LINE_X) * attack;
      assert.ok(below > 0.35, `${label} strong wing is not below the goal line (${below.toFixed(2)})`);
      assert.ok(strong.s.z * POINT_FRAME.strong.z * zSign > 0, `${label} strong wing left the wall side`);
      const weakDepth = (attack * GOAL_LINE_X - weak.s.x) * attack;
      assert.ok(weakDepth > 3.1 && weakDepth < 7.2, `${label} weak wing depth ${weakDepth.toFixed(2)}`);
      assert.ok(Math.abs(weak.s.z) < FACEOFF_SPOT_Z + 0.9, `${label} weak wing drifted to the corner (${weak.s.z.toFixed(2)})`);
      const slotDepth = (attack * GOAL_LINE_X - slot.s.x) * attack;
      assert.ok(slotDepth > 7 && slotDepth < 11, `${label} center depth ${slotDepth.toFixed(2)}`);
      assert.ok(Math.abs(slot.s.z) < 2.6, `${label} center left the slot (${slot.s.z.toFixed(2)})`);
    }
  }
});

test("a defenseman at the blue but off the boards keeps the corners", () => {
  loadAttack(-1);
  const attack = attackOf("home");
  const backs = defs("home");
  const forwards = wings("home");
  const carrier = backs[0];
  const partner = backs[1];
  world.userId = carrier.id;
  const cx = attack * 9.856;
  const keep = new Set([carrier.id, partner.id, ...forwards.map((s) => s.id)]);
  parkOthers(keep);
  forwards.forEach((s, i) => {
    s.stun = 0;
    s.vx = 0;
    s.vz = 0;
    s.x = attack * (GOAL_LINE_X - 10);
    s.z = [-2, 0.2, 3][i];
  });
  partner.stun = 0;
  partner.x = attack * 4;
  partner.z = 8;
  for (let i = 0; i < 220; i++) {
    pinCarrier(carrier, cx, 0);
    world.userId = carrier.id;
    holdParked(keep);
    stepSim(DT);
  }
  assert.equal(world.whistle, null);
  assert.ok(Math.abs(partner.z) > 8, `partner slid off the corner at z ${partner.z.toFixed(2)}`);
  for (const s of forwards) {
    const below = (s.x - attack * GOAL_LINE_X) * attack;
    assert.ok(below < 0.05, `forward ${s.id} dropped below the goal line (${below.toFixed(2)})`);
  }
});

/** Captured 3-on-0. along is meters toward the attack. The carrier is the right wing. */
const RUSH_FRAME = {
  carrier: { along: 20.304, z: 7.165 },
  center: { along: 14.058, z: 0.776 },
  wing: { along: 21.354, z: -5.629 },
  center0: { along: 19.055, z: 3.15 },
  wing0: { along: 19.967, z: -4.639 },
  foes: [
    { along: 17.191, z: 9.344 },
    { along: 3.561, z: -5.233 },
    { along: 7.739, z: 2.602 },
    { along: 17.737, z: 11.282 },
    { along: 4.975, z: 7.966 },
  ],
};

test("three forwards on a 3-on-0 drop the center off the wing lane", () => {
  for (const side of ["home", "away"]) {
    for (const homeAttack of [1, -1]) {
      loadAttack(homeAttack);
      const attack = attackOf(side);
      const zSign = attack < 0 ? 1 : -1;
      const forwards = wings(side);
      assert.equal(forwards.length, 3);
      const wing = forwards[0];
      const center = forwards[1];
      const carrier = forwards[2];
      const at = (spot) => pointIce(attack, zSign, spot);
      const foes = world.skaters
        .filter((s) => s.side !== side && s.kind !== "goalie")
        .sort((a, b) => a.id - b.id);
      const ownD = defs(side);
      assert.equal(foes.length, RUSH_FRAME.foes.length);
      const foeAt = RUSH_FRAME.foes.map((spot) => at(spot));
      const carrierAt = at(RUSH_FRAME.carrier);
      const center0 = at(RUSH_FRAME.center0);
      const wing0 = at(RUSH_FRAME.wing0);
      center.x = center0.x;
      center.z = center0.z;
      wing.x = wing0.x;
      wing.z = wing0.z;
      for (const s of [center, wing]) {
        s.stun = 0;
        s.vx = 0;
        s.vz = 0;
      }
      if (side === "home") world.userId = carrier.id;
      const label = `${side} attack ${attack}`;
      for (let i = 0; i < 320; i++) {
        pinCarrier(carrier, carrierAt.x, carrierAt.z);
        if (side === "home") world.userId = carrier.id;
        foes.forEach((s, n) => pinStill(s, foeAt[n].x, foeAt[n].z));
        ownD.forEach((s, n) => pinStill(s, attack * (n === 0 ? -0.8 : 4), zSign * (n === 0 ? -9.3 : 11.7)));
        pinGoals();
        stepSim(DT);
      }
      pinCarrier(carrier, carrierAt.x, carrierAt.z);
      assert.equal(world.whistle, null, `${label} whistled ${world.whistle}`);
      const wantC = at(RUSH_FRAME.center);
      const wantW = at(RUSH_FRAME.wing);
      const cd = Math.hypot(center.x - wantC.x, center.z - wantC.z);
      const wd = Math.hypot(wing.x - wantW.x, wing.z - wantW.z);
      assert.ok(cd < 1.8, `${label} center ${cd.toFixed(2)} from the high slot (${center.x.toFixed(2)}, ${center.z.toFixed(2)})`);
      assert.ok(wd < 1.8, `${label} wing ${wd.toFixed(2)} from the outside spot (${wing.x.toFixed(2)}, ${wing.z.toFixed(2)})`);
      const cDepth = (attack * GOAL_LINE_X - center.x) * attack;
      const wDepth = (attack * GOAL_LINE_X - wing.x) * attack;
      const pDepth = (attack * GOAL_LINE_X - carrier.x) * attack;
      assert.ok(cDepth > pDepth + 3, `${label} center is still up with the wings (${cDepth.toFixed(2)})`);
      assert.ok(wDepth < pDepth - 0.3, `${label} wing did not get lower (${wDepth.toFixed(2)})`);
      assert.ok(Math.abs(wing.z) > 4.9, `${label} wing stayed inside (${wing.z.toFixed(2)})`);
      assert.ok(wing.z * zSign < 0, `${label} wing left its side (${wing.z.toFixed(2)})`);
      assert.ok(Math.abs(center.z) < 2.6, `${label} center left the slot (${center.z.toFixed(2)})`);
      assert.ok(!laneBlocked(carrier.x, carrier.z, center.x, center.z, side), `${label} center lane`);
      assert.ok(!laneBlocked(center.x, center.z, wing.x, wing.z, side), `${label} second-level lane`);
    }
  }
});

test("a 3-on-2 keeps the existing rush spots", () => {
  loadAttack(-1);
  const attack = attackOf("home");
  const forwards = wings("home");
  const center = forwards[1];
  const carrier = forwards[2];
  const wing = forwards[0];
  world.userId = carrier.id;
  const foes = world.skaters
    .filter((s) => s.side === "away" && s.kind !== "goalie")
    .sort((a, b) => a.id - b.id);
  center.stun = 0;
  wing.stun = 0;
  center.x = attack * 19;
  center.z = 3;
  wing.x = attack * 20;
  wing.z = -4.5;
  for (let i = 0; i < 200; i++) {
    pinCarrier(carrier, attack * 20.3, 7.2);
    world.userId = carrier.id;
    foes.forEach((s, n) => {
      const spot = n < 2 ? { x: attack * (24 - n * 0.8), z: n === 0 ? 0.4 : -2.2 } : { x: attack * 4, z: (n - 2) * 3 };
      pinStill(s, spot.x, spot.z);
    });
    pinGoals();
    stepSim(DT);
  }
  const depth = (attack * GOAL_LINE_X - center.x) * attack;
  assert.ok(depth < 10, `center trailed on a 3-on-2 (depth ${depth.toFixed(2)})`);
});

/**
 * Captured low receive off the strong-side defenseman.
 * along is meters toward that attack. zSign mirrors the frame.
 * The crowded originals are where the wings were when the pass arrived.
 */
const D_RECEIVE = {
  recv: { along: 25.417, z: -10.228 },
  crowd: { along: 21.237, z: -5.772 },
  other: { along: 21.004, z: 0.617 },
  slot: { along: 20.096, z: -1.135 },
  wide: { along: 22.159, z: 6.197 },
  passer: { along: 13.454, z: -9.219 },
  partner: { along: 8.783, z: 6.893 },
  goalie: { along: 26.213, z: -0.584 },
  foes: [
    { along: 25.559, z: 4.364 },
    { along: 18.563, z: -5.696 },
    { along: 16.729, z: -2.701 },
    { along: 13.323, z: -5.356 },
    { along: 18.032, z: 5.626 },
  ],
};

function holdLowReceive(recv, passer, spot) {
  recv.x = spot.x;
  recv.z = spot.z;
  recv.vx = 0;
  recv.vz = 0;
  recv.stun = 0;
  recv.struck = 0;
  recv.dive = 0;
  recv.tumble = 0;
  const puck = world.puck;
  puck.owner = recv.id;
  puck.x = spot.x;
  puck.z = spot.z;
  puck.y = 0.05;
  puck.vx = 0;
  puck.vz = 0;
  puck.vy = 0;
  world.lastPasser = passer.id;
  world.lastPassTo = recv.id;
  world.lastPass = world.time;
  world.lastPassX = passer.x;
  world.lastPassZ = passer.z;
  world.lastShoot = -10;
  world.goalieSaveT = -10;
  world.lastHitTime = -10;
  world.whistle = null;
  world.stoppage = false;
  world.faceoff = false;
  world.delayedOffside = 0;
}

test("a low catch from a defenseman opens the slot and the far wing", () => {
  for (const side of ["home", "away"]) {
    for (const homeAttack of [1, -1]) {
      for (const mode of ["wing", "center"]) {
        loadAttack(homeAttack);
        const attack = attackOf(side);
        const zSign = attack < 0 ? 1 : -1;
        const at = (spot) => pointIce(attack, zSign, spot);
        const forwards = wings(side);
        const backs = defs(side);
        assert.equal(forwards.length, 3);
        assert.equal(backs.length, 2);
        const recv = mode === "center" ? forwards[1] : forwards[0];
        const slotMan = mode === "center" ? forwards[0] : forwards[1];
        const wideMan = forwards[2];
        const passer = backs[0];
        const partner = backs[1];
        const foes = world.skaters
          .filter((s) => s.side !== side && s.kind !== "goalie")
          .sort((a, b) => a.id - b.id);
        assert.equal(foes.length, D_RECEIVE.foes.length);
        const recvAt = at(D_RECEIVE.recv);
        const slotAt = at(D_RECEIVE.slot);
        const wideAt = at(D_RECEIVE.wide);
        const foeAt = D_RECEIVE.foes.map((spot) => at(spot));
        const goalie = world.skaters.find((s) => s.kind === "goalie" && s.side !== side);
        const ownGoalie = world.skaters.find((s) => s.kind === "goalie" && s.side === side);
        slotMan.stun = 0;
        wideMan.stun = 0;
        slotMan.vx = 0;
        slotMan.vz = 0;
        wideMan.vx = 0;
        wideMan.vz = 0;
        slotMan.x = at(D_RECEIVE.crowd).x;
        slotMan.z = at(D_RECEIVE.crowd).z;
        wideMan.x = at(D_RECEIVE.other).x;
        wideMan.z = at(D_RECEIVE.other).z;
        if (side === "home") world.userId = recv.id;
        const label = `${side} attack ${attack} ${mode}`;
        for (let i = 0; i < 160; i++) {
          holdLowReceive(recv, passer, recvAt);
          if (side === "home") world.userId = recv.id;
          pinStill(passer, at(D_RECEIVE.passer).x, at(D_RECEIVE.passer).z);
          pinStill(partner, at(D_RECEIVE.partner).x, at(D_RECEIVE.partner).z);
          foes.forEach((s, n) => pinStill(s, foeAt[n].x, foeAt[n].z));
          if (goalie) pinStill(goalie, at(D_RECEIVE.goalie).x, at(D_RECEIVE.goalie).z);
          if (ownGoalie) pinStill(ownGoalie, -attack * (GOAL_LINE_X - 0.8), 0);
          stepSim(DT);
        }
        holdLowReceive(recv, passer, recvAt);
        assert.equal(world.whistle, null, `${label} whistled ${world.whistle}`);
        const sd = Math.hypot(slotMan.x - slotAt.x, slotMan.z - slotAt.z);
        const wd = Math.hypot(wideMan.x - wideAt.x, wideMan.z - wideAt.z);
        assert.ok(sd < 1.6, `${label} slot ${sd.toFixed(2)} (${slotMan.x.toFixed(2)}, ${slotMan.z.toFixed(2)})`);
        assert.ok(wd < 1.6, `${label} wide ${wd.toFixed(2)} (${wideMan.x.toFixed(2)}, ${wideMan.z.toFixed(2)})`);
        assert.ok(Math.hypot(slotMan.x - wideMan.x, slotMan.z - wideMan.z) > 6, `${label} wings stacked`);
        assert.ok(Math.hypot(slotMan.x - recv.x, slotMan.z - recv.z) > 6, `${label} slot crowded the catch`);
        assert.ok(Math.hypot(wideMan.x - recv.x, wideMan.z - recv.z) > 6, `${label} wide crowded the catch`);
        assert.ok(Math.abs(slotMan.z) < 2.4, `${label} slot left the middle (${slotMan.z.toFixed(2)})`);
        assert.ok(wideMan.z * zSign > 4, `${label} wide left the far side (${wideMan.z.toFixed(2)})`);
        assert.ok(!laneBlocked(recv.x, recv.z, slotMan.x, slotMan.z, side), `${label} slot lane`);
        assert.ok(!laneBlocked(recv.x, recv.z, wideMan.x, wideMan.z, side), `${label} wide lane`);
        assert.ok(!laneBlocked(slotMan.x, slotMan.z, wideMan.x, wideMan.z, side), `${label} wing lane`);
      }
    }
  }
});

test("a low catch from a forward keeps the old support spots", () => {
  loadAttack(-1);
  const attack = attackOf("home");
  const zSign = attack < 0 ? 1 : -1;
  const at = (spot) => pointIce(attack, zSign, spot);
  const forwards = wings("home");
  const recv = forwards[0];
  const slotMan = forwards[1];
  const wideMan = forwards[2];
  const passer = forwards[2];
  world.userId = recv.id;
  slotMan.stun = 0;
  wideMan.stun = 0;
  slotMan.x = at(D_RECEIVE.crowd).x;
  slotMan.z = at(D_RECEIVE.crowd).z;
  wideMan.x = at(D_RECEIVE.other).x;
  wideMan.z = at(D_RECEIVE.other).z;
  const recvAt = at(D_RECEIVE.recv);
  const slotAt = at(D_RECEIVE.slot);
  const wideAt = at(D_RECEIVE.wide);
  const foes = world.skaters
    .filter((s) => s.side === "away" && s.kind !== "goalie")
    .sort((a, b) => a.id - b.id);
  const foeAt = D_RECEIVE.foes.map((spot) => at(spot));
  for (let i = 0; i < 160; i++) {
    holdLowReceive(recv, passer, recvAt);
    world.userId = recv.id;
    foes.forEach((s, n) => pinStill(s, foeAt[n].x, foeAt[n].z));
    pinGoals();
    stepSim(DT);
  }
  const sd = Math.hypot(slotMan.x - slotAt.x, slotMan.z - slotAt.z);
  const wd = Math.hypot(wideMan.x - wideAt.x, wideMan.z - wideAt.z);
  assert.ok(sd > 2.5 || wd > 2.5, `forward pass still took the receive shape (${sd.toFixed(2)}, ${wd.toFixed(2)})`);
});
