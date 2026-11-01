/**
 * Half-wall breakout from a captured defensive-zone frame.
 * A stacked forward widens to the weak boards. The forecheck takes the
 * passing lanes that open up. A slot carry and an already-spaced breakout
 * leave that wide steer alone.
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
const { BLUE_X, FACEOFF_SPOT_Z, FT, GOAL_LINE_X, RINK_W } = rink;
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

/** Captured ice, with x signed so +x is the breakout team's defending end. */
const CAP = {
  puck: { x: 21.204, z: 10.077 },
  carrier: { x: 22.848, z: 10.626 },
  partner: { x: 21.228, z: -1.291 },
  stackIn: { x: 6.358, z: -2.146 },
  stackOut: { x: 7.121, z: -2.852 },
  strongF: { x: 6.286, z: 3.916 },
  dHigh: { x: 15.191, z: 7.823 },
  dDeep: { x: 19.207, z: -5.476 },
  fDeep: { x: 22.885, z: -2.414 },
  fMid: { x: 15.057, z: 0.485 },
  fCheck: { x: 19.123, z: 3.324 },
};

function spotX(own, x) {
  return own * x;
}

function targets(own) {
  const wide = {
    x: own * (GOAL_LINE_X - 60 * FT),
    z: -(RINK_W / 2 - 7.25 * FT),
  };
  const inner = FACEOFF_SPOT_Z + 0.65;
  const outer = RINK_W / 2 - 1.85;
  const wingZ = inner + (outer - inner) * 0.5;
  const partner = { x: spotX(own, CAP.partner.x), z: CAP.partner.z };
  const puck = { x: spotX(own, CAP.puck.x), z: CAP.puck.z };
  const dx = partner.x - puck.x;
  const dz = partner.z - puck.z;
  const len = Math.hypot(dx, dz);
  const travel = Math.max(0.45, len - 0.42 * 4);
  const attack = -own;
  const deny = {
    x: puck.x + (dx / len) * travel + attack * FT,
    z: puck.z + (dz / len) * travel,
  };
  const carrier = { x: spotX(own, CAP.carrier.x), z: CAP.carrier.z };
  const fx = wide.x - carrier.x;
  const fz = wide.z - carrier.z;
  const fl = Math.hypot(fx, fz);
  const check = {
    x: carrier.x + (fx / fl) * (13.5 * FT),
    z: carrier.z + (fz / fl) * (13.5 * FT),
  };
  const outlet = { x: spotX(own, CAP.strongF.x), z: CAP.strongF.z };
  const mx = (puck.x + outlet.x) * 0.5;
  const mz = (puck.z + outlet.z) * 0.5;
  const pull = 2 * FT;
  const shade = {
    x: mx,
    z: Math.abs(mz) <= pull ? 0 : mz - Math.sign(mz) * pull,
  };
  return {
    wide,
    deepD: { x: wide.x, z: -(FACEOFF_SPOT_Z - 4 * FT) },
    highD: { x: own * (BLUE_X - 11 * FT), z: wingZ },
    deny,
    check,
    shade,
  };
}

function hold(side, own) {
  const carrier = byKind(side, "defense")[1];
  const partner = byKind(side, "defense")[0];
  const wings = byKind(side, "winger");
  const userWing = wings[0];
  const strong = wings[2];
  place(carrier, spotX(own, CAP.carrier.x), CAP.carrier.z);
  place(partner, spotX(own, CAP.partner.x), CAP.partner.z);
  place(userWing, spotX(own, CAP.stackIn.x), CAP.stackIn.z);
  place(strong, spotX(own, CAP.strongF.x), CAP.strongF.z);
  const puck = world.puck;
  puck.owner = carrier.id;
  puck.x = spotX(own, CAP.puck.x);
  puck.z = CAP.puck.z;
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
    const net = g.side === "home" ? -world.homeAttack : world.homeAttack;
    place(g, net * (GOAL_LINE_X - 0.85), 0);
  }
}

function near(s, spot, label, tol) {
  const d = Math.hypot(s.x - spot.x, s.z - spot.z);
  assert.ok(d < tol, `${label} ${s.id} at (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) is ${d.toFixed(2)} m from the lane`);
}

test("a stacked half-wall breakout widens the outlet and fills the lanes", () => {
  for (const attack of [-1, 1]) {
    fresh(attack);
    const side = "home";
    const own = ownOf(side);
    assert.equal(own, attack === -1 ? 1 : -1);
    const wings = byKind(side, "winger");
    const foeD = byKind("away", "defense");
    const foeF = byKind("away", "winger");
    world.userId = wings[0].id;
    place(wings[1], spotX(own, CAP.stackOut.x), CAP.stackOut.z);
    place(foeD[0], spotX(own, CAP.dHigh.x), CAP.dHigh.z);
    place(foeD[1], spotX(own, CAP.dDeep.x), CAP.dDeep.z);
    place(foeF[0], spotX(own, CAP.fDeep.x), CAP.fDeep.z);
    place(foeF[1], spotX(own, CAP.fMid.x), CAP.fMid.z);
    place(foeF[2], spotX(own, CAP.fCheck.x), CAP.fCheck.z);
    const want = targets(own);
    for (let i = 0; i < 360; i++) {
      hold(side, own);
      stepSim(DT);
    }
    hold(side, own);
    const label = `attack ${attack}`;
    near(wings[1], want.wide, `${label} wide forward`, 1.35);
    const deepD = foeD.slice().sort((a, b) => Math.hypot(a.x - want.deepD.x, a.z - want.deepD.z) - Math.hypot(b.x - want.deepD.x, b.z - want.deepD.z))[0];
    const highD = foeD.find((d) => d !== deepD);
    near(deepD, want.deepD, `${label} deep defender`, 1.35);
    near(highD, want.highD, `${label} high defender`, 1.45);
    const fore = foeF.slice().sort((a, b) => Math.hypot(a.x - want.check.x, a.z - want.check.z) - Math.hypot(b.x - want.check.x, b.z - want.check.z))[0];
    near(fore, want.check, `${label} forechecker`, 1.45);
    const deny = foeF.slice().sort((a, b) => Math.hypot(a.x - want.deny.x, a.z - want.deny.z) - Math.hypot(b.x - want.deny.x, b.z - want.deny.z))[0];
    near(deny, want.deny, `${label} deep-D lane`, 1.45);
    const shade = foeF.slice().sort((a, b) => Math.hypot(a.x - want.shade.x, a.z - want.shade.z) - Math.hypot(b.x - want.shade.x, b.z - want.shade.z))[0];
    near(shade, want.shade, `${label} outlet lane`, 1.55);
    assert.notEqual(fore.id, deny.id, `${label} one forward took two lanes`);
    assert.notEqual(deny.id, shade.id, `${label} the lane forwards collapsed`);
    const split = Math.hypot(wings[1].x - wings[0].x, wings[1].z - wings[0].z);
    assert.ok(split > 6, `${label} forwards still stacked (${split.toFixed(2)})`);
    if (attack === -1) {
      assert.equal(wings[1].id, 4);
      assert.equal(deepD.id, 8);
      assert.equal(highD.id, 7);
      assert.equal(fore.id, 11);
      assert.equal(deny.id, 9);
      assert.equal(shade.id, 10);
    }
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
