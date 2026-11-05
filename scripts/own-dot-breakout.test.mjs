/**
 * Own-zone breakout when a home defenseman has the puck deeper than his
 * end-zone faceoff dot. Spots are replay-frame-1348 adjusted.
 * A right-defenseman carry keeps wing sides and flips the partner.
 * A carry above that dot does not use this shape.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { dirname, join } from "node:path";
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
const { BLUE_X, FACEOFF_EZ_X, FACEOFF_SPOT_Z, GOAL_LINE_X, RINK_W } = rink;
const { setInjectedKeys } = input;

const DT = 1 / 60;
const FRAME = JSON.parse(readFileSync(join(repo, "dev/reference/replay-frame-1348.json"), "utf8"));
const ADJ = FRAME.adjusted;

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

function player(id) {
  return ADJ.players.find((p) => p.id === id);
}

/** Canonical defending end +x. own flips both axes. mirror -1 is a right-side carry. */
function worldSpot(own, mirror, spot) {
  return { x: own * spot.x, z: own * mirror * spot.z };
}

function near(s, spot, label, tol) {
  const d = Math.hypot(s.x - spot.x, s.z - spot.z);
  assert.ok(
    d <= tol,
    `${label} at (${s.x.toFixed(2)}, ${s.z.toFixed(2)}), want (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)}), off by ${d.toFixed(2)}`,
  );
}

function givePuck(carrier, puck) {
  world.puck.owner = carrier.id;
  world.puck.x = puck.x;
  world.puck.z = puck.z;
  world.puck.y = 0.05;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.lastPass = -10;
  world.lastShoot = -10;
  world.lastPassTo = null;
  world.whistle = null;
  world.stoppage = false;
  world.faceoff = false;
  world.delayedOffside = 0;
}

/**
 * onRight matches frame 1348: the higher-id defenseman carries on his own side.
 * onRight false puts the lower-id defenseman on the other side. Wing sides stay.
 */
function settle(attack, onRight) {
  fresh(attack);
  const own = ownOf("home");
  const homeD = byKind("home", "defense");
  const carrier = homeD[onRight ? 1 : 0];
  const partner = homeD[onRight ? 0 : 1];
  const wings = byKind("home", "winger");
  const awayD = byKind("away", "defense");
  const mirror = onRight ? 1 : -1;
  const carrierX = player(2).x;
  const carrierZ = Math.abs(player(2).z);
  const puckX = ADJ.puck.x;
  const puckZ = Math.abs(ADJ.puck.z);
  const side = onRight ? -1 : 1;
  world.userId = carrier.id;
  const parked = world.skaters.filter(
    (s) => s.kind === "goalie" || (s.side === "away" && s.kind !== "defense"),
  );
  for (const s of [...wings, partner, ...awayD]) place(s, 0, (s.id % 5) - 2);
  for (let i = 0; i < 540; i++) {
    place(carrier, own * carrierX, own * side * carrierZ);
    carrier.yaw = player(2).yaw;
    carrier.vx = 0;
    carrier.vz = 0;
    givePuck(carrier, { x: own * puckX, z: own * side * puckZ });
    parked.forEach((s, n) => {
      const net = s.side === "home" ? own : -own;
      place(s, net * (GOAL_LINE_X - 1.1), (n - 2) * 1.2);
    });
    stepSim(DT);
  }
  place(carrier, own * carrierX, own * side * carrierZ);
  givePuck(carrier, { x: own * puckX, z: own * side * puckZ });
  return { own, mirror, carrier, partner, wings, awayD };
}

test("frame 1348 places the partner, the forwards, and both away defensemen", () => {
  const { own, carrier, partner, wings, awayD } = settle(-1, true);
  assert.equal(own, 1);
  assert.equal(world.puck.owner, carrier.id);
  const puck = world.puck;
  assert.ok(puck.x > FACEOFF_EZ_X, `puck ${puck.x.toFixed(2)} is not past the dot`);
  near(partner, player(1), "LD", 1.15);
  assert.ok(
    Math.hypot(partner.x - carrier.x, partner.z - carrier.z) > 12,
    `LD crowded the carrier (${partner.z.toFixed(2)})`,
  );
  assert.ok(Math.abs(partner.x - puck.x) < 0.8, `LD depth ${partner.x.toFixed(2)} left the puck ${puck.x.toFixed(2)}`);
  assert.ok(partner.z > RINK_W / 2 - 2.4, `LD left his boards (${partner.z.toFixed(2)})`);
  near(wings[0], player(3), "LW", 1.05);
  near(wings[1], player(4), "C", 1.05);
  near(wings[2], player(5), "RW", 1.05);
  for (const w of [wings[0], wings[2]]) {
    assert.ok(w.x > 0.4 && w.x < BLUE_X - 2, `${w.id} wing depth ${w.x.toFixed(2)} is not just past center`);
    assert.ok(Math.abs(w.z) > RINK_W / 2 - 2.2, `${w.id} wing left the boards (${w.z.toFixed(2)})`);
  }
  assert.ok(Math.abs(wings[1].x - BLUE_X) < 0.6, `center depth ${wings[1].x.toFixed(2)} left the blue`);
  assert.ok(Math.abs(wings[1].z) < 2.2, `center slid out of the slot (${wings[1].z.toFixed(2)})`);
  near(awayD[0], player(7), "away LD", 1.35);
  near(awayD[1], player(8), "away RD", 1.35);
  for (const d of awayD) {
    const side = Math.sign(d.z) || 1;
    let deep = null;
    for (const p of [carrier, partner, ...wings]) {
      if (p.z * side <= 0.35) continue;
      if (!deep || p.x < deep.x) deep = p;
    }
    assert.ok(deep, `no home skater on ${side > 0 ? "+" : "-"}z`);
    const gap = deep.x - d.x;
    assert.ok(gap > 2.2 && gap < 3.8, `away D ${d.id} is ${gap.toFixed(2)} m behind ${deep.id}`);
    assert.ok(
      Math.abs(Math.abs(d.z) - FACEOFF_SPOT_Z) < 0.9,
      `away D ${d.id} left the dot (${d.z.toFixed(2)})`,
    );
  }
});

test("the shape mirrors with the defending end and the carrying side", () => {
  for (const attack of [-1, 1]) {
    for (const onRight of [true, false]) {
      const { own, mirror, partner, wings, awayD } = settle(attack, onRight);
      const label = `attack ${attack} ${onRight ? "RD" : "LD"}`;
      near(partner, worldSpot(own, mirror, player(1)), `${label} partner`, 1.35);
      near(wings[0], worldSpot(own, 1, player(3)), `${label} LW`, 1.15);
      near(wings[2], worldSpot(own, 1, player(5)), `${label} RW`, 1.15);
      const center = worldSpot(own, mirror, player(4));
      near(wings[1], center, `${label} C`, 1.15);
      near(awayD[0], worldSpot(own, 1, player(7)), `${label} away LD`, 1.45);
      near(awayD[1], worldSpot(own, 1, player(8)), `${label} away RD`, 1.45);
      assert.ok(wings[0].z * own > 8, `${label} LW left team left`);
      assert.ok(wings[2].z * own < -8, `${label} RW left team right`);
    }
  }
});

test("a carry above the own-zone dot does not use the deep-dot wings", () => {
  fresh(-1);
  const own = ownOf("home");
  const carrier = byKind("home", "defense")[1];
  const wings = byKind("home", "winger");
  world.userId = carrier.id;
  const x = own * (FACEOFF_EZ_X - 4);
  for (let i = 0; i < 240; i++) {
    place(carrier, x, -4);
    givePuck(carrier, { x, z: -4 });
    stepSim(DT);
  }
  const lw = worldSpot(own, 1, player(3));
  const d = Math.hypot(wings[0].x - lw.x, wings[0].z - lw.z);
  assert.ok(d > 4, `a shallower carry took the deep-dot wing (${d.toFixed(2)})`);
});
