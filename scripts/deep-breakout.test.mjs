/**
 * Deep breakout when a home defenseman has the puck behind his own goal line.
 * Spots are the adjusted positions in replay-frame-431. A right-defenseman
 * carry flips every z.
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
const { GOAL_LINE_X, resolveCage } = rink;
const { setInjectedKeys } = input;

const DT = 1 / 60;

/** Canonical frame from replay-frame-431 adjusted. Defending end is +x, LD has the puck. */
const CAP = {
  carrier: { x: 29.88, z: -0.5039385953354161 },
  puck: { x: 30.31524621712117, z: -2.1809578111060883 },
  partner: { x: 22.036901275787166, z: -12.381784683959195 },
  rw: { x: 7.8485990072680965, z: -12.314751255639495 },
  c: { x: 9.14211388331765, z: 0.1846313355851286 },
  lw: { x: 7.011378586598442, z: 11.170530671737534 },
  awayLd: { x: 4.827588923879963, z: -6.643095191189337 },
  awayRd: { x: 4.558221994821825, z: 6.094372844933041 },
  awayLw: { x: 18.693022451568236, z: -2.2318506218621823 },
  awayC: { x: 23.405233582263286, z: -5.487482569177711 },
  awayRw: { x: 26.327803686366558, z: 6.312345488785609 },
};

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
  s.backskate = false;
}

function ownOf(side) {
  return side === "home" ? -world.homeAttack : world.homeAttack;
}

function worldSpot(own, mirror, spot) {
  return { x: own * spot.x, z: own * mirror * spot.z };
}

function near(s, spot, label, tol) {
  const d = Math.hypot(s.x - spot.x, s.z - spot.z);
  assert.ok(d < tol, `${label} ${s.id} at (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) is ${d.toFixed(2)} m from (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`);
}

function faceDot(s, target) {
  const fx = -Math.sin(s.yaw);
  const fz = -Math.cos(s.yaw);
  const dx = target.x - s.x;
  const dz = target.z - s.z;
  const d = Math.hypot(dx, dz) || 1;
  return (fx * dx + fz * dz) / d;
}

function hold(carrier, own, mirror) {
  const spot = worldSpot(own, mirror, CAP.carrier);
  const puckSpot = worldSpot(own, mirror, CAP.puck);
  place(carrier, spot.x, spot.z);
  const puck = world.puck;
  puck.owner = carrier.id;
  puck.x = puckSpot.x;
  puck.z = puckSpot.z;
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
  for (const g of world.skaters) {
    if (g.kind !== "goalie") continue;
    const net = g.side === "home" ? own : -own;
    place(g, net * (GOAL_LINE_X - 0.85), 0);
  }
}

function assertAwayWingsChase(attack, carrier, awayF, label) {
  const left = attack >= 0 ? 1 : -1;
  const lw = awayF[0];
  const rw = awayF[2];
  assert.ok(lw.z * left > 0.7, `${label} LW left the left side (${lw.z.toFixed(2)})`);
  assert.ok(rw.z * -left > 0.7, `${label} RW left the right side (${rw.z.toFixed(2)})`);
  assert.ok(lw.z * rw.z < 0, `${label} both away wings chased the same side`);
  assert.ok(Math.abs(lw.x - carrier.x) < 3.5, `${label} LW stayed off the carrier (${Math.abs(lw.x - carrier.x).toFixed(2)} m)`);
  assert.ok(Math.abs(rw.x - carrier.x) < 3.5, `${label} RW stayed off the carrier (${Math.abs(rw.x - carrier.x).toFixed(2)} m)`);
}

function runBreakout(attack, mirror) {
  fresh(attack);
  const own = ownOf("home");
  const homeD = byKind("home", "defense");
  const homeF = byKind("home", "winger");
  const awayD = byKind("away", "defense");
  const awayF = byKind("away", "winger");
  const carrier = mirror === 1 ? homeD[1] : homeD[0];
  world.userId = byKind("home", "goalie")[0].id;
  for (const s of [...homeF, ...awayD, ...awayF, homeD.find((d) => d !== carrier)]) {
    place(s, 0, (s.id % 5) - 2);
  }
  for (let i = 0; i < 480; i++) {
    hold(carrier, own, mirror);
    stepSim(DT);
  }
  hold(carrier, own, mirror);
  return { own, carrier, homeD, homeF, awayD, awayF };
}

test("a home left defenseman behind his goal line sets the deep breakout", () => {
  for (const attack of [-1, 1]) {
    const { own, carrier, homeD, homeF, awayD, awayF } = runBreakout(attack, 1);
    const label = `attack ${attack}`;
    const partner = homeD.find((d) => d !== carrier);
    near(partner, worldSpot(own, 1, CAP.partner), `${label} RD`, 1.6);
    near(homeF[0], worldSpot(own, 1, CAP.lw), `${label} LW`, 1.6);
    near(homeF[1], worldSpot(own, 1, CAP.c), `${label} C`, 1.6);
    near(homeF[2], worldSpot(own, 1, CAP.rw), `${label} RW`, 1.6);
    near(awayD[0], worldSpot(own, 1, CAP.awayLd), `${label} away LD`, 1.7);
    near(awayD[1], worldSpot(own, 1, CAP.awayRd), `${label} away RD`, 1.7);
    near(awayF[1], worldSpot(own, 1, CAP.awayC), `${label} away C`, 1.8);
    assertAwayWingsChase(attack, carrier, awayF, label);
    const lw = worldSpot(own, 1, CAP.lw);
    const rw = worldSpot(own, 1, CAP.rw);
    const c = worldSpot(own, 1, CAP.c);
    const deeper = (a, b) => (Math.abs(own * a.x) < Math.abs(own * b.x) ? a : b);
    const behindLw = (deeper(c, lw).x - awayD[1].x) * own;
    const behindRw = (deeper(c, rw).x - awayD[0].x) * own;
    assert.ok(behindLw > 1.6 && behindLw < 3.4, `${label} away RD is ${behindLw.toFixed(2)} m behind`);
    assert.ok(behindRw > 1.6 && behindRw < 3.6, `${label} away LD is ${behindRw.toFixed(2)} m behind`);
    for (const s of [partner, ...homeF, ...awayD, ...awayF]) {
      const dot = faceDot(s, carrier);
      assert.ok(dot > 0.35, `${label} ${s.id} faces away from the puck (${dot.toFixed(2)})`);
    }
  }
});

test("a home right defenseman behind his goal line mirrors the deep breakout", () => {
  for (const attack of [-1, 1]) {
    const { own, carrier, homeD, homeF, awayD, awayF } = runBreakout(attack, -1);
    const label = `attack ${attack}`;
    const partner = homeD[1];
    near(partner, worldSpot(own, -1, CAP.partner), `${label} LD`, 1.6);
    near(homeF[0], worldSpot(own, -1, CAP.lw), `${label} wing`, 1.6);
    near(homeF[2], worldSpot(own, -1, CAP.rw), `${label} wing`, 1.6);
    near(awayD[0], worldSpot(own, -1, CAP.awayLd), `${label} away D`, 1.7);
    near(awayF[1], worldSpot(own, -1, CAP.awayC), `${label} away C`, 1.8);
    assertAwayWingsChase(attack, carrier, awayF, label);
    const ld = worldSpot(own, 1, CAP.lw);
    const mirrored = worldSpot(own, -1, CAP.lw);
    assert.ok(Math.sign(ld.z) !== Math.sign(mirrored.z), `${label} z did not flip`);
  }
});

test("the home goalie holds the crease while the puck crosses behind the net", () => {
  fresh(-1);
  const own = ownOf("home");
  const homeD = byKind("home", "defense");
  const carrier = homeD[1];
  const goalie = byKind("home", "goalie")[0];
  world.userId = homeD[0].id;
  place(goalie, own * (GOAL_LINE_X - 0.85), 0);
  goalie.yaw = Math.PI / 2;
  for (const s of world.skaters) {
    if (s.kind === "goalie" || s.id === carrier.id) continue;
    place(s, 0, (s.id % 5) - 2);
  }
  let prevZ = goalie.z;
  let prevYaw = goalie.yaw;
  let maxStepZ = 0;
  let maxStepYaw = 0;
  for (let i = 0; i < 180; i++) {
    place(carrier, own * (GOAL_LINE_X + 1.4), (i % 2 === 0 ? 0.08 : -0.08));
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
    world.whistle = null;
    world.stoppage = false;
    world.faceoff = false;
    stepSim(DT);
    const dz = Math.abs(goalie.z - prevZ);
    let dy = goalie.yaw - prevYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    maxStepZ = Math.max(maxStepZ, dz);
    maxStepYaw = Math.max(maxStepYaw, Math.abs(dy));
    prevZ = goalie.z;
    prevYaw = goalie.yaw;
  }
  assert.ok(Math.abs(goalie.z) < 0.35, `goalie slid off center (${goalie.z.toFixed(2)})`);
  assert.ok(maxStepZ < 0.08, `goalie z jumped ${maxStepZ.toFixed(3)} m in one frame`);
  assert.ok(maxStepYaw < 0.2, `goalie yaw jumped ${maxStepYaw.toFixed(3)} rad in one frame`);
});

test("a home defenseman in front of his goal line does not use the deep breakout", () => {
  fresh(-1);
  const own = ownOf("home");
  const homeD = byKind("home", "defense");
  const homeF = byKind("home", "winger");
  const carrier = homeD[1];
  world.userId = homeF[0].id;
  place(homeF[1], own * 4, 1);
  place(homeF[2], own * 4, -1);
  for (let i = 0; i < 180; i++) {
    place(carrier, own * (GOAL_LINE_X - 4), 0.4);
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
    world.whistle = null;
    world.stoppage = false;
    world.faceoff = false;
    stepSim(DT);
  }
  const boards = worldSpot(own, 1, CAP.lw);
  const d = Math.hypot(homeF[2].x - boards.x, homeF[2].z - boards.z);
  assert.ok(d > 4, `a carry in front of the goal line took the deep wing (${d.toFixed(2)})`);
});

/** Left while facing the attack. +X attack faces up the screen, and that left wall is -Z. */
function wingLeft(attack) {
  return attack >= 0 ? -1 : 1;
}

test("wings keep their own side and the higher net angle with either end at the top", () => {
  const depth = 3.5607698106507044;
  const lat = 2.906334498247122;
  for (const homeAttack of [1, -1]) {
    for (const side of ["away", "home"]) {
      fresh(homeAttack);
      const attack = side === "home" ? homeAttack : -homeAttack;
      const left = wingLeft(attack);
      const forwards = byKind(side, "winger");
      const carrier = forwards[1];
      const lw = forwards[0];
      const rw = forwards[2];
      const mouth = attack * GOAL_LINE_X;
      const keep = new Set([carrier.id, lw.id, rw.id]);
      world.userId = side === "home" ? carrier.id : byKind("home", "goalie")[0].id;
      place(lw, mouth - attack * 12, -left * 6);
      place(rw, mouth + attack * 0.15, left * 1.45);
      let stuck = 0;
      for (let i = 0; i < 240; i++) {
        place(carrier, mouth + attack * 0.7, -left * 5.2);
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
        world.whistle = null;
        world.stoppage = false;
        world.faceoff = false;
        for (const s of world.skaters) {
          if (s.kind === "goalie" || keep.has(s.id)) continue;
          place(s, attack * 2, (s.id % 5) - 2);
        }
        stepSim(DT);
        for (const s of [lw, rw]) {
          if (resolveCage(s.x, s.z, s.radius, true).hit) stuck += 1;
        }
      }
      const label = `${side} attack ${attack}`;
      assert.equal(stuck, 0, `${label} wing drove into the cage`);
      assert.ok(lw.z * left > 1.2, `${label} LW left his side (${lw.z.toFixed(2)})`);
      assert.ok(rw.z * -left > 1.2, `${label} RW left his side (${rw.z.toFixed(2)})`);
      for (const s of [lw, rw]) {
        const fromLine = (mouth - s.x) * attack;
        assert.ok(fromLine > 3.1 && fromLine < 4.3, `${label} ${s.id} depth ${fromLine.toFixed(2)}`);
        assert.ok(Math.abs(Math.abs(s.z) - lat) < 0.85, `${label} ${s.id} lat ${s.z.toFixed(2)}`);
      }
      const wantX = attack * (GOAL_LINE_X - depth);
      assert.ok(Math.abs(lw.x - wantX) < 0.8, `${label} LW x ${lw.x.toFixed(2)}`);
    }
  }
});
