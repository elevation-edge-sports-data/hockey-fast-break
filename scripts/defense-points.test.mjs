/**
 * Headless check: with the puck deep in the offensive zone, both teams'
 * defensemen hold two point spots instead of trailing the carrier.
 * A high carry stays on a staggered blue. The user skater is not steered.
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
const { BLUE_X, BLUE_LINE_W, GOAL_LINE_X, FACEOFF_EZ_X } = rink;
const { setInjectedKeys } = input;

const DT = 1 / 60;
const PUCK_R = 0.04;
const DOT_DEPTH = GOAL_LINE_X - FACEOFF_EZ_X;

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

function zoneOf(x) {
  const half = BLUE_LINE_W * 0.5;
  if (x - PUCK_R > BLUE_X + half) return 1;
  if (x + PUCK_R < -BLUE_X - half) return -1;
  return 0;
}

/** Same segment test as laneBlocked in sim.ts. */
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
  world.puckOz = zoneOf(x);
  world.lastPass = world.time;
  world.lastShoot = -10;
  world.whistle = null;
  world.stoppage = false;
  world.faceoff = false;
  world.delayedOffside = 0;
}

/**
 * Two checkers in the low slot, everyone else parked. Goalies stay down.
 * `live` skaters are left for the caller to place.
 */
function isolate(live) {
  const keep = new Set(live.map((s) => s.id));
  let n = 0;
  for (const s of world.skaters) {
    if (s.kind === "goalie") {
      const net = s.side === "home" ? -1 : 1;
      pinStill(s, net * (GOAL_LINE_X - 0.8), 0);
      continue;
    }
    if (keep.has(s.id)) continue;
    pinStill(s, -22, -11 + (n % 8) * 1.6);
    n += 1;
  }
}

function placeSlot(side, attack) {
  const foes = world.skaters
    .filter((s) => s.side !== side && s.kind !== "goalie")
    .sort((a, b) => a.id - b.id);
  const placed = [
    { s: foes[0], x: attack * (GOAL_LINE_X - 4.6), z: 0.2 },
    { s: foes[1], x: attack * (GOAL_LINE_X - 3.1), z: -2.4 },
  ];
  for (const p of placed) pinStill(p.s, p.x, p.z);
  return placed;
}

function holdExtras(placed) {
  for (const p of placed) pinStill(p.s, p.x, p.z);
  for (const g of world.skaters) {
    if (g.kind !== "goalie") continue;
    const net = g.side === "home" ? -world.homeAttack : world.homeAttack;
    pinStill(g, net * (GOAL_LINE_X - 0.8), 0);
  }
}

function stepN(n, before) {
  for (let i = 0; i < n; i++) {
    before();
    stepSim(DT);
  }
}

function assertPointPair(side, attack, carrier, backs, label, wall) {
  assert.equal(world.whistle, null, `${label} whistled ${world.whistle}`);
  assert.equal(backs.length, 2, `${label} defense count`);
  const depths = backs.map((s) => ozDepth(s.x, attack));
  const zs = backs.map((s) => s.z);
  for (const s of backs) {
    const depth = ozDepth(s.x, attack);
    assert.ok(
      depth > DOT_DEPTH,
      `${label} D ${s.id} is below the faceoff dots (depth ${depth.toFixed(2)})`,
    );
    assert.ok(
      depth >= 8.2 && depth <= 13,
      `${label} D ${s.id} depth ${depth.toFixed(2)} is outside 9–12 m`,
    );
    const gap = defenderGap(s.x, s.z, side);
    assert.ok(gap >= 3, `${label} D ${s.id} defenderGap ${gap.toFixed(2)}`);
    assert.ok(
      !laneBlocked(carrier.x, carrier.z, s.x, s.z, side),
      `${label} D ${s.id} lane blocked at (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`,
    );
    const away = Math.hypot(s.x - carrier.x, s.z - carrier.z);
    assert.ok(away >= 4, `${label} D ${s.id} is ${away.toFixed(2)} m from the carrier`);
  }
  const split = Math.abs(zs[0] - zs[1]);
  assert.ok(split >= 8, `${label} lateral split ${split.toFixed(2)}`);
  assert.ok(zs[0] * zs[1] < 0, `${label} both D on one side (${zs.map((z) => z.toFixed(1))})`);
  if (wall) {
    assert.ok(Math.min(...zs) < -6, `${label} no weak-side point (z ${zs.map((z) => z.toFixed(1))})`);
    assert.ok(Math.max(...zs) > 7, `${label} no half-wall (z ${zs.map((z) => z.toFixed(1))})`);
  }
  const between = Math.hypot(backs[0].x - backs[1].x, backs[0].z - backs[1].z);
  assert.ok(between >= 8, `${label} D are ${between.toFixed(2)} m apart`);
  assert.ok(
    depths.every((d) => d > 8),
    `${label} a defenseman sank to a forward spot`,
  );
}

test("a deep corner carry puts both teams' defense on open point spots", () => {
  for (const side of ["home", "away"]) {
    for (const behind of [false, true]) {
      fresh();
      const attack = attackOf(side);
      const carrier = side === "home" ? world.skaters[world.userId] : wings("away")[0];
      assert.equal(carrier.kind, "winger");
      const backs = defs(side);
      assert.ok(backs.length >= 2);
      const depth = behind ? -0.45 : 1.15;
      const cz = behind ? 7.2 : 10.2;
      const cx = attack * (GOAL_LINE_X - depth);
      isolate([carrier, ...backs]);
      const foes = placeSlot(side, attack);
      backs.forEach((s, i) => {
        s.stun = 0;
        s.vx = 0;
        s.vz = 0;
        s.x = attack * (i === 0 ? 1.2 : 18);
        s.z = i === 0 ? -3 : 5;
      });
      let worstInside = Infinity;
      const inside = backs[1];
      stepN(420, () => {
        pinCarrier(carrier, cx, cz);
        holdExtras(foes);
        worstInside = Math.min(worstInside, inside.x * attack);
      });
      const label = `${side} ${behind ? "behind the goal" : "corner"}`;
      assertPointPair(side, attack, carrier, backs, label, !behind);
      assert.ok(
        backs[0].x * attack > BLUE_X + 0.4,
        `${label} neutral-zone D stayed outside at along ${(backs[0].x * attack).toFixed(2)}`,
      );
      assert.ok(
        worstInside > BLUE_X - 0.05,
        `${label} in-zone D was dragged out to along ${worstInside.toFixed(2)}`,
      );
    }
  }
});

test("a high carry holds a staggered blue instead of trailing", () => {
  for (const side of ["home", "away"]) {
    fresh();
    const attack = attackOf(side);
    const carrier = side === "home" ? world.skaters[world.userId] : wings("away")[0];
    const backs = defs(side);
    const depth = 12;
    const cz = 4;
    const cx = attack * (GOAL_LINE_X - depth);
    isolate([carrier, ...backs]);
    const foes = placeSlot(side, attack);
    backs.forEach((s, i) => {
      s.stun = 0;
      s.vx = 0;
      s.vz = 0;
      s.x = attack * (i === 0 ? 0.4 : 17);
      s.z = i === 0 ? 1 : -2;
    });
    let worstInside = Infinity;
    stepN(360, () => {
      pinCarrier(carrier, cx, cz);
      holdExtras(foes);
      worstInside = Math.min(worstInside, backs[1].x * attack);
    });
    assert.equal(world.whistle, null, `${side} high whistled`);
    const zs = backs.map((s) => s.z);
    for (const s of backs) {
      const d = ozDepth(s.x, attack);
      assert.ok(
        d > 15.5 && d < 20.8,
        `${side} D ${s.id} left the blue (depth ${d.toFixed(2)}, x ${s.x.toFixed(2)})`,
      );
      assert.ok(s.x * attack > BLUE_X + 0.15, `${side} D ${s.id} is outside the zone`);
      assert.ok(
        Math.abs(s.z - cz) >= 2.4,
        `${side} D ${s.id} stacked on the carrier line (z ${s.z.toFixed(2)})`,
      );
    }
    assert.ok(
      Math.abs(zs[0] - zs[1]) >= 8,
      `${side} points split ${Math.abs(zs[0] - zs[1]).toFixed(2)}`,
    );
    assert.ok(
      zs[0] * zs[1] < 0,
      `${side} points are on the same side (${zs.map((z) => z.toFixed(1))})`,
    );
    assert.ok(
      worstInside > BLUE_X - 0.05,
      `${side} high D dragged through the blue to ${worstInside.toFixed(2)}`,
    );
    assert.ok(
      backs[0].x * attack > BLUE_X + 0.3,
      `${side} neutral-zone D did not join (${(backs[0].x * attack).toFixed(2)})`,
    );
  }
});

test("the user defenseman is not steered onto a point", () => {
  fresh();
  const backs = defs("home");
  const userD = backs[0];
  const cpuD = backs[1];
  world.userId = userD.id;
  const attack = 1;
  const cx = GOAL_LINE_X - 1.15;
  const cz = 10.2;
  isolate([userD, cpuD]);
  const foes = placeSlot("home", attack);
  userD.x = cx;
  userD.z = cz;
  userD.vx = 0;
  userD.vz = 0;
  userD.stun = 0;
  userD.struck = 0;
  userD.dive = 0;
  cpuD.stun = 0;
  cpuD.vx = 0;
  cpuD.vz = 0;
  cpuD.x = 2;
  cpuD.z = -4;
  const x0 = userD.x;
  const z0 = userD.z;
  stepN(300, () => {
    // Keep the puck on him without pinning his skates. No input, so he should stand.
    const puck = world.puck;
    puck.owner = userD.id;
    puck.x = userD.x;
    puck.z = userD.z;
    puck.y = 0.05;
    puck.vx = 0;
    puck.vz = 0;
    puck.vy = 0;
    world.puckOz = zoneOf(userD.x);
    world.whistle = null;
    world.stoppage = false;
    world.faceoff = false;
    world.delayedOffside = 0;
    holdExtras(foes);
  });
  assert.equal(world.whistle, null);
  assert.equal(world.userId, userD.id);
  assert.ok(Math.abs(userD.x - x0) < 1.2, `user D steered in x to ${userD.x.toFixed(2)}`);
  assert.ok(Math.abs(userD.z - z0) < 1.2, `user D steered in z to ${userD.z.toFixed(2)}`);
  const depth = ozDepth(cpuD.x, attack);
  assert.ok(depth >= 8.2 && depth <= 13, `cpu D depth ${depth.toFixed(2)}`);
  assert.ok(Math.abs(cpuD.z) > 5, `cpu D did not take a point (z ${cpuD.z.toFixed(2)})`);
  assert.ok(defenderGap(cpuD.x, cpuD.z, "home") >= 3);
  assert.ok(!laneBlocked(userD.x, userD.z, cpuD.x, cpuD.z, "home"));
  assert.ok(Math.hypot(cpuD.x - userD.x, cpuD.z - userD.z) >= 4);
});
