/**
 * Half-wall own-zone shape from replay-frame-1657.
 * Teammates patrol the original-to-adjusted segment. Away wings follow the
 * lane in to the carrier. Away defensemen keep their own
 * sides at the deepest teammate's depth. The away center contains the
 * third-deepest teammate. A slot carry does not use this shape.
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
const { FT, GOAL_LINE_X, RINK_W } = rink;
const { setInjectedKeys } = input;

const DT = 1 / 60;

function fresh(attack) {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setControlProfile("classic");
  ui.setHomeLineup({ g: 1, d: 2, o: 3 });
  ui.setAwayLineup({ g: 1, d: 2, o: 3 });
  resetWorld();
  if (attack) {
    world.homeAttack = attack;
    resetWorld({ keepScore: true });
  }
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.periodOver = false;
  world.periodEndT = 0;
}

function byKind(side, kind) {
  return world.skaters
    .filter((s) => s.side === side && s.kind === kind)
    .sort((a, b) => a.id - b.id);
}

function place(s, x, z) {
  s.x = x;
  s.z = z;
  s.vx = 0;
  s.vz = 0;
  s.stun = 0;
  s.struck = 0;
  s.dive = 0;
  s.tumble = 0;
  s.hit = 0;
  s.poke = 0;
}

function ownOf(side) {
  return side === "home" ? -world.homeAttack : world.homeAttack;
}

/** replay-frame-1657. Defending end is +x and the left wall is +z. */
const SEP = 5.651270275108692;
const RANGE = {
  partner: {
    a: { x: 25.716591465763795, z: 6.4272120315913766 },
    b: { x: 19.754088738927226, z: -8.382408277293269 },
  },
  lw: {
    a: { x: -3.4978563845666635, z: 9.312509469358371 },
    b: { x: 0.45253845661317615, z: 11.51913246114101 },
  },
  c: {
    a: { x: 4.150569789074841, z: -0.009951409127712842 },
    b: { x: 15.389245187998362, z: 1.9511018340056967 },
  },
  rw: {
    a: { x: -3.4036987197925126, z: -9.303157560823202 },
    b: { x: 5.3401475470701145, z: -12.292418300126593 },
  },
};
const LANE = {
  right: { x: -2.231203141901407, z: -3.10726081195088 },
  left: { x: -0.201869346767506, z: -8.315912466609797 },
};
const D_LAT = { left: 7.127775424831, right: 5.7765240490572465 };
const C_Z = -0.7633902732897508;
const CARRIER = { x: 21.830965651207613, z: 12.230468834019101 };

function ice(own, spot) {
  return { x: own * spot.x, z: own * spot.z };
}

function mirrored(own, mirror, spot) {
  return { x: own * spot.x, z: own * mirror * spot.z };
}

function mix(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function segDist(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

function segT(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  const t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
  return Math.max(0, Math.min(1, t));
}

function givePuck(carrier) {
  const puck = world.puck;
  puck.owner = carrier.id;
  puck.x = carrier.x;
  puck.z = carrier.z;
  puck.y = 0.05;
  puck.vx = 0;
  puck.vz = 0;
  puck.vy = 0;
  world.lastPass = world.time;
  world.lastShoot = world.time;
  world.lastPassTo = null;
  world.whistle = null;
  world.stoppage = false;
  world.faceoff = false;
  world.delayedOffside = 0;
}

function parkNets() {
  for (const g of world.skaters) {
    if (g.kind !== "goalie") continue;
    const net = g.side === "home" ? -world.homeAttack : world.homeAttack;
    place(g, net * (GOAL_LINE_X - 0.85), 0);
  }
}

/** onLeft uses the carrier's left while facing up ice. */
function setup(attack, onLeft) {
  fresh(attack);
  const own = ownOf("home");
  const left = attack >= 0 ? -1 : 1;
  const mirror = onLeft ? 1 : -1;
  const carrier = byKind("home", "defense")[onLeft ? 0 : 1];
  const z = (onLeft ? left : -left) * Math.abs(CARRIER.z);
  place(carrier, own * CARRIER.x, z);
  world.userId = carrier.id;
  givePuck(carrier);
  parkNets();
  return { own, mirror, carrier, left };
}

function wingsHome() {
  return byKind("home", "winger");
}

test("home teammates range between the original and adjusted spots", () => {
  for (const attack of [-1, 1]) {
    for (const onLeft of [true, false]) {
      const { own, mirror, carrier } = setup(attack, onLeft);
      const [lw, c, rw] = wingsHome();
      const partner = byKind("home", "defense").find((d) => d.id !== carrier.id);
      const segs = {
        partner: [mirrored(own, mirror, RANGE.partner.a), mirrored(own, mirror, RANGE.partner.b)],
        lw: [ice(own, RANGE.lw.a), ice(own, RANGE.lw.b)],
        c: [ice(own, RANGE.c.a), ice(own, RANGE.c.b)],
        rw: [ice(own, RANGE.rw.a), ice(own, RANGE.rw.b)],
      };
      const started = {
        partner: segs.partner[0],
        lw: mix(segs.lw[0], segs.lw[1], 1),
        c: mix(segs.c[0], segs.c[1], 0.5),
        rw: segs.rw[0],
      };
      place(partner, started.partner.x, started.partner.z);
      place(lw, started.lw.x, started.lw.z);
      place(c, started.c.x, started.c.z);
      place(rw, started.rw.x, started.rw.z);
      const label = `attack ${attack} ${onLeft ? "left" : "right"} wall`;
      const away = world.skaters.filter((s) => s.side === "away" && s.kind !== "goalie");
      const span = { partner: [1, 0], lw: [1, 0], c: [1, 0], rw: [1, 0] };
      const at = { partner, lw, c, rw };
      for (let i = 0; i < 300; i++) {
        place(carrier, own * CARRIER.x, (onLeft ? (attack >= 0 ? -1 : 1) : -(attack >= 0 ? -1 : 1)) * Math.abs(CARRIER.z));
        away.forEach((s, n) => place(s, -own * (10 + n), (n - 2) * 3));
        givePuck(carrier);
        parkNets();
        stepSim(DT);
        for (const key of Object.keys(segs)) {
          const s = at[key];
          const [a, b] = segs[key];
          const t = segT(s, a, b);
          if (t < span[key][0]) span[key][0] = t;
          if (t > span[key][1]) span[key][1] = t;
        }
      }
      for (const key of Object.keys(segs)) {
        const s = at[key];
        const [a, b] = segs[key];
        const d = segDist(s, a, b);
        const covered = span[key][1] - span[key][0];
        assert.ok(d < 1.6, `${label} ${key} left the segment by ${d.toFixed(2)} at (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
        assert.ok(covered > 0.45, `${label} ${key} stayed put (covered ${covered.toFixed(2)} of the segment)`);
      }
      const wingSide = Math.sign(segs.lw[1].z) || 1;
      assert.ok(lw.z * wingSide > 4, `${label} LW left his side (${lw.z.toFixed(2)})`);
      assert.ok(rw.z * wingSide < -4, `${label} RW crossed to the left (${rw.z.toFixed(2)})`);
    }
  }
});

test("a teammate off the segment skates onto it and can use either end", () => {
  const { own, carrier } = setup(-1, true);
  const c = wingsHome()[1];
  const a = ice(own, RANGE.c.a);
  const b = ice(own, RANGE.c.b);
  place(c, 0, 0);
  const others = world.skaters.filter((s) => s.id !== c.id && s.id !== carrier.id && s.kind !== "goalie");
  for (let i = 0; i < 240; i++) {
    place(carrier, CARRIER.x, CARRIER.z);
    others.forEach((s, n) => place(s, -18 + (n % 5), (n - 4) * 2.4));
    givePuck(carrier);
    parkNets();
    stepSim(DT);
  }
  const d = segDist(c, a, b);
  assert.ok(d < 1.5, `center still off the segment by ${d.toFixed(2)}`);
  place(c, a.x, a.z);
  for (let i = 0; i < 100; i++) {
    place(carrier, CARRIER.x, CARRIER.z);
    others.forEach((s, n) => place(s, -18 + (n % 5), (n - 4) * 2.4));
    givePuck(carrier);
    stepSim(DT);
  }
  assert.ok(Math.hypot(c.x - a.x, c.z - a.z) > 3, "original end was a lock");
  assert.ok(segDist(c, a, b) < 1.8, "left the segment from the original end");
  place(c, b.x, b.z);
  for (let i = 0; i < 100; i++) {
    place(carrier, CARRIER.x, CARRIER.z);
    others.forEach((s, n) => place(s, -18 + (n % 5), (n - 4) * 2.4));
    givePuck(carrier);
    stepSim(DT);
  }
  assert.ok(Math.hypot(c.x - b.x, c.z - b.z) > 3, "adjusted end was a lock");
  assert.ok(segDist(c, a, b) < 1.8, "left the segment from the adjusted end");
});

test("away defensemen keep their sides and the deepest home depth", () => {
  for (const attack of [-1, 1]) {
    const { own, carrier } = setup(attack, true);
    const [lw, c, rw] = wingsHome();
    const partner = byKind("home", "defense").find((d) => d.id !== carrier.id);
    const deep = ice(own, RANGE.lw.b);
    place(lw, deep.x, deep.z);
    place(c, ice(own, RANGE.c.b).x, ice(own, RANGE.c.b).z);
    place(rw, ice(own, RANGE.rw.b).x, ice(own, RANGE.rw.b).z);
    place(partner, ice(own, RANGE.partner.b).x, ice(own, RANGE.partner.b).z);
    const foe = byKind("away", "defense");
    const awayLeft = attack >= 0 ? 1 : -1;
    place(foe[0], own * 4.3, -awayLeft * 9);
    place(foe[1], own * 8.9, awayLeft * 5.5);
    const label = `attack ${attack}`;
    for (let i = 0; i < 360; i++) {
      place(carrier, own * CARRIER.x, (attack >= 0 ? -1 : 1) * Math.abs(CARRIER.z));
      place(lw, deep.x, deep.z);
      place(c, ice(own, RANGE.c.b).x, ice(own, RANGE.c.b).z);
      place(rw, ice(own, RANGE.rw.b).x, ice(own, RANGE.rw.b).z);
      place(partner, ice(own, RANGE.partner.b).x, ice(own, RANGE.partner.b).z);
      givePuck(carrier);
      parkNets();
      stepSim(DT);
    }
    for (const d of foe) {
      const dx = Math.abs(d.x - deep.x);
      assert.ok(dx < 1.5, `${label} D ${d.id} depth ${d.x.toFixed(2)} is ${dx.toFixed(2)} m off the LW`);
    }
    assert.ok(foe[0].z * awayLeft > 3, `${label} LD ${foe[0].id} on z ${foe[0].z.toFixed(2)}`);
    assert.ok(foe[1].z * awayLeft < -3, `${label} RD ${foe[1].id} on z ${foe[1].z.toFixed(2)}`);
    assert.ok(Math.abs(Math.abs(foe[0].z) - D_LAT.left) < 1.4, `${label} LD lateral`);
    assert.ok(Math.abs(Math.abs(foe[1].z) - D_LAT.right) < 1.4, `${label} RD lateral`);
  }
});

test("away wings follow the lane through to the carrier", () => {
  const { own, carrier } = setup(-1, true);
  const foe = byKind("away", "winger");
  const rw = foe[2];
  const lw = foe[0];
  const wall = Math.sign(carrier.z) || 1;
  const laneOf = (off) => ({
    x: carrier.x + own * off.x,
    z: carrier.z + wall * off.z,
  });
  const rwLane = laneOf(LANE.right);
  const lwLane = laneOf(LANE.left);
  const homeMates = world.skaters.filter((s) => s.side === "home" && s.id !== carrier.id && s.kind !== "goalie");
  const hold = (park) => {
    place(carrier, CARRIER.x, CARRIER.z);
    homeMates.forEach((s, n) => place(s, 2 + n, (n - 2) * 4));
    place(park, 0, -10);
    givePuck(carrier);
    parkNets();
  };
  const finish = (wing, lane, name) => {
    place(wing, lane.x, lane.z);
    const lx = lane.x - carrier.x;
    const lz = lane.z - carrier.z;
    const len = Math.hypot(lx, lz) || 1;
    for (let i = 0; i < 180; i++) {
      hold(wing === rw ? lw : rw);
      stepSim(DT);
    }
    const gap = Math.hypot(wing.x - carrier.x, wing.z - carrier.z);
    const along = ((wing.x - carrier.x) * lx + (wing.z - carrier.z) * lz) / len;
    assert.ok(gap < 1.6, `${name} stopped ${gap.toFixed(2)} m short`);
    assert.ok(along > 0.15, `${name} left the lane side (${along.toFixed(2)})`);
  };
  finish(rw, rwLane, "primary");
  finish(lw, lwLane, "secondary");
});

test("away center contains the third-deepest home skater", () => {
  for (const attack of [-1, 1]) {
    const { own, mirror, carrier } = setup(attack, true);
    const [lw, c, rw] = wingsHome();
    const partner = byKind("home", "defense").find((d) => d.id !== carrier.id);
    const spots = [lw, c, rw, partner];
    const canon = [RANGE.lw.b, RANGE.c.b, RANGE.rw.b, RANGE.partner.b];
    const pinHome = () => {
      place(carrier, own * CARRIER.x, (attack >= 0 ? -1 : 1) * Math.abs(CARRIER.z));
      spots.forEach((s, i) => {
        const p = ice(own, canon[i]);
        place(s, p.x, p.z);
      });
      givePuck(carrier);
      parkNets();
    };
    const third = ice(own, RANGE.c.b);
    const far = third.x - own * SEP;
    const shadeZ = own * mirror * C_Z;
    const ac = byKind("away", "winger")[1];
    const rest = world.skaters.filter((s) => s.side === "away" && s.id !== ac.id && s.kind !== "goalie");
    const pin = () => {
      pinHome();
      rest.forEach((s, n) => place(s, -own * (12 + n), (n - 1) * 4));
    };
    const label = `attack ${attack}`;
    place(ac, far, shadeZ);
    for (let i = 0; i < 150; i++) {
      pin();
      stepSim(DT);
    }
    assert.ok(Math.abs(ac.x - far) < 1.2, `${label} left the max gap (${ac.x.toFixed(2)})`);
    place(ac, third.x, shadeZ);
    for (let i = 0; i < 150; i++) {
      pin();
      stepSim(DT);
    }
    const zeroGap = (third.x - ac.x) * own;
    assert.ok(zeroGap > -1.1 && zeroGap < SEP + 0.4, `${label} zero gap became ${zeroGap.toFixed(2)}`);
    place(ac, third.x + own * 4, shadeZ);
    for (let i = 0; i < 240; i++) {
      pin();
      stepSim(DT);
    }
    const past = (third.x - ac.x) * own;
    assert.ok(past > -0.8, `${label} still let the center past him (${past.toFixed(2)})`);
    assert.ok(past < SEP + 0.8, `${label} gap grew to ${past.toFixed(2)}`);
  }
});

test("a slot carry does not send the stacked forward to the weak boards", () => {
  fresh(-1);
  const wings = byKind("home", "winger");
  const defs = byKind("home", "defense");
  world.userId = wings[0].id;
  const carrier = defs[1];
  place(wings[0], 6.4, -1.2);
  place(wings[1], 7.0, -1.8);
  place(wings[2], 6.3, 4);
  for (let i = 0; i < 180; i++) {
    place(carrier, 22.4, 0.4);
    place(wings[0], 6.4, -1.2);
    const puck = world.puck;
    puck.owner = carrier.id;
    puck.x = 21.2;
    puck.z = 0.2;
    puck.y = 0.05;
    puck.vx = 0;
    puck.vz = 0;
    puck.vy = 0;
    world.lastPass = world.time;
    world.lastShoot = world.time;
    world.whistle = null;
    world.stoppage = false;
    world.faceoff = false;
    stepSim(DT);
  }
  const wall = { x: GOAL_LINE_X - 60 * FT, z: -(RINK_W / 2 - 7.25 * FT) };
  const d = Math.hypot(wings[1].x - wall.x, wings[1].z - wall.z);
  assert.ok(d > 4, `slot carry still took the wall outlet (${d.toFixed(2)})`);
});
