/**
 * A goalie cover is only in that goalie's own end, from their blue line
 * through the ice behind their net. Neutral ice and the far end must not
 * whistle or play a frozen cover. Each goalie uses defendDir, both attack ways.
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
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { resetWorld, stepSim, world, defendDir, faceYaw } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;
const { BLUE_LINE_W, BLUE_X, GOAL_LINE_X } = rink;

const DT = 1 / 60;
const COVER_FRAMES = 180;
const FREEZE = 0.35;

function zoneOf(x) {
  const edge = BLUE_X + BLUE_LINE_W * 0.5;
  if (x > edge) return 1;
  if (x < -edge) return -1;
  return 0;
}

function goalie(side) {
  const s = world.skaters.find((sk) => sk.kind === "goalie" && sk.side === side);
  assert.ok(s, side);
  return s;
}

function endOf(side) {
  return defendDir(side) > 0 ? 1 : -1;
}

function spots(side) {
  const end = endOf(side);
  const mouth = end * GOAL_LINE_X;
  const own = { x: mouth - end * 1.05, z: 0 };
  const behind = { x: mouth + end * 1.2, z: end * 3.1 };
  const neutral = { x: 0, z: 0 };
  const far = { x: -mouth + end * 1.05, z: 0 };
  assert.equal(zoneOf(own.x), end, "own spot");
  assert.ok(Math.abs(own.x) < GOAL_LINE_X, "own spot is in front of the goal line");
  assert.equal(zoneOf(behind.x), end, "behind spot");
  assert.ok(Math.abs(behind.x) > GOAL_LINE_X, "behind spot is behind the goal line");
  assert.equal(zoneOf(neutral.x), 0, "neutral spot");
  assert.equal(zoneOf(far.x), -end, "far spot");
  return { own, behind, neutral, far };
}

function sheet(side, attack) {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.homeAttack = attack;
  resetWorld({ keepScore: true });
  stepSim(DT);
  setInjectedKeys([]);
  world.faceoff = false;
  world.faceoffA = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.coverT = 0;
  world.periodOver = false;
  world.replay = false;
  world.goalieShot = null;
  world.reboundN = 0;
  world.goalieSaveT = -10;
  world.lastShoot = -10;
  world.lastPass = -10;
  world.lastPasser = null;
  world.lastShooter = null;
  world.lastShotCorner = false;
  world.delayedOffside = 0;
  ui.setWhistle(null);
  ui.setGoalSide(null);
  ui.setPeriodOver(false);
  const g = goalie(side);
  for (const s of world.skaters) {
    s.coverPose = 0;
    s.gloveFlash = 0;
    s.celebrate = 0;
    s.dive = 0;
    s.tumble = 0;
    s.struck = 0;
    s.poke = 0;
    s.hit = 0;
    s.windup = 0;
    s.follow = 0;
    if (s.id === g.id) {
      s.stun = 0;
      continue;
    }
    s.stun = 40;
    s.vx = 0;
    s.vz = 0;
    s.x = (s.id % 5) - 2;
    s.z = (s.id % 2 === 0 ? 1 : -1) * (9 + (s.id % 4));
  }
  g.yaw = faceYaw(side);
  return g;
}

function pinOthers(g, foe) {
  for (const s of world.skaters) {
    if (s.id === g.id) continue;
    if (foe && s.id === foe.id) continue;
    s.stun = 40;
    s.vx = 0;
    s.vz = 0;
    s.hit = 0;
    s.poke = 0;
    if (Math.hypot(s.x, s.z) < 6) {
      s.x = 2;
      s.z = 11 + (s.id % 3);
    }
  }
}

function looseAt(g, spot) {
  g.coverPose = 0;
  g.gloveFlash = 0;
  world.coverT = 0;
  world.whistle = null;
  world.stoppage = false;
  world.stoppageT = 0;
  useGame.getState().setWhistle(null);
  world.puck.owner = null;
  world.puck.x = spot.x;
  world.puck.z = spot.z;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
}

function pinGoalie(g, spot) {
  g.x = spot.x;
  g.z = spot.z;
  g.vx = 0;
  g.vz = 0;
  g.yaw = faceYaw(g.side);
  g.stun = 0;
  g.struck = 0;
  g.tumble = 0;
  g.dive = 0;
  g.gloveFlash = 0;
}

/** A stunned foe in the crease, close enough that an away goalie does not clear. */
function parkFoe(g, where) {
  const foe = world.skaters.find((s) => s.side !== g.side && s.kind !== "goalie");
  assert.ok(foe, "crease foe");
  const end = endOf(g.side);
  const spot =
    where === "behind" ? { x: end * (GOAL_LINE_X - 0.15), z: end * 2.4 } : { x: g.x, z: 1.45 };
  foe.x = spot.x;
  foe.z = spot.z;
  foe.vx = 0;
  foe.vz = 0;
  foe.stun = 40;
  return foe;
}

function pinFoe(foe, where, g) {
  if (!foe) return;
  const end = endOf(g.side);
  const spot =
    where === "behind" ? { x: end * (GOAL_LINE_X - 0.15), z: end * 2.4 } : { x: g.x, z: 1.45 };
  foe.x = spot.x;
  foe.z = spot.z;
  foe.vx = 0;
  foe.vz = 0;
  foe.stun = 40;
  foe.hit = 0;
  foe.poke = 0;
  foe.dive = 0;
}

function stepLoose(g, spot, foe, where, frames, banClaim) {
  let covered = -1;
  for (let i = 0; i < frames; i++) {
    pinOthers(g, foe);
    pinGoalie(g, spot);
    pinFoe(foe, where, g);
    if (world.puck.owner !== g.id) {
      world.puck.owner = null;
      world.puck.x = spot.x;
      world.puck.z = spot.z;
      world.puck.y = 0.042;
      world.puck.vx = 0;
      world.puck.vz = 0;
      world.puck.vy = 0;
    }
    stepSim(DT);
    if (banClaim) {
      assert.notEqual(world.puck.owner, g.id, `${where} claimed on frame ${i}`);
      assert.notEqual(world.whistle, "cover", `${where} whistle on frame ${i}`);
      assert.ok(g.coverPose < FREEZE, `${where} freeze ${g.coverPose} on frame ${i}`);
    }
    if (world.whistle) {
      if (world.whistle === "cover") covered = i;
      break;
    }
  }
  return covered;
}

function label(side, attack, where) {
  return `${side} homeAttack ${attack} ${where}`;
}

test("own zone, including behind the net, may cover", () => {
  for (const attack of [1, -1]) {
    for (const side of ["home", "away"]) {
      for (const where of ["own", "behind"]) {
        const g = sheet(side, attack);
        const spot = spots(side)[where];
        const foe = parkFoe(g, where);
        looseAt(g, spot);
        const frame = stepLoose(g, spot, foe, where, COVER_FRAMES, false);
        const name = label(side, attack, where);
        assert.equal(world.whistle, "cover", `${name} whistle ${world.whistle} frame ${frame}`);
        assert.equal(useGame.getState().whistle, "cover", name);
        assert.ok(g.coverPose > 0.5, `${name} coverPose ${g.coverPose}`);
        assert.ok(frame >= 0 && frame < COVER_FRAMES, name);
      }
    }
  }
});

test("neutral and the far zone do not cover or freeze", () => {
  for (const attack of [1, -1]) {
    for (const side of ["home", "away"]) {
      for (const where of ["neutral", "far"]) {
        const g = sheet(side, attack);
        const spot = spots(side)[where];
        looseAt(g, spot);
        const frame = stepLoose(g, spot, null, where, COVER_FRAMES, true);
        const name = label(side, attack, where);
        assert.equal(world.whistle, null, `${name} whistle ${world.whistle} frame ${frame}`);
        assert.equal(useGame.getState().whistle, null, name);
        assert.ok(g.coverPose < FREEZE, `${name} frozen cover ${g.coverPose}`);
        assert.notEqual(world.puck.owner, g.id, name);
        assert.ok(world.coverT < 0.05, `${name} coverT ${world.coverT}`);
      }
    }
  }
});

test("a puck already held outside the zone decays the cover and does not freeze", () => {
  for (const attack of [1, -1]) {
    for (const side of ["home", "away"]) {
      const g = sheet(side, attack);
      const spot = spots(side).neutral;
      g.x = spot.x;
      g.z = spot.z;
      g.yaw = faceYaw(side);
      g.vx = 0;
      g.vz = 0;
      g.coverPose = 0.9;
      world.puck.owner = g.id;
      world.puck.x = spot.x;
      world.puck.z = spot.z;
      world.puck.y = 0.042;
      world.puck.vx = 0;
      world.puck.vz = 0;
      world.puck.vy = 0;
      world.coverT = 0.3;
      world.lastPass = -10;
      for (let i = 0; i < 45; i++) {
        pinOthers(g, null);
        pinGoalie(g, spot);
        stepSim(DT);
        assert.notEqual(world.whistle, "cover", label(side, attack, "held"));
      }
      const name = label(side, attack, "held");
      assert.ok(world.coverT < 0.05, `${name} coverT ${world.coverT}`);
      assert.ok(g.coverPose < FREEZE, `${name} frozen cover ${g.coverPose}`);
      assert.equal(useGame.getState().whistle, null, name);
    }
  }
});

test("a home goalie can still pass a puck held outside the zone", () => {
  for (const attack of [1, -1]) {
    const g = sheet("home", attack);
    const spot = spots("home").neutral;
    pinGoalie(g, spot);
    world.puck.owner = g.id;
    world.puck.x = spot.x;
    world.puck.z = spot.z;
    world.puck.y = 0.042;
    world.puck.vx = 0;
    world.puck.vz = 0;
    world.puck.vy = 0;
    world.coverT = 0;
    world.lastPass = -10;
    world.faceoffA = false;
    setInjectedKeys(["KeyJ"]);
    stepSim(DT);
    const name = label("home", attack, "pass");
    assert.notEqual(world.puck.owner, g.id, `${name} still holding`);
    assert.notEqual(world.whistle, "cover", name);
    assert.ok(g.coverPose < FREEZE, `${name} frozen cover ${g.coverPose}`);
    setInjectedKeys([]);
    stepSim(DT);
  }
});

function placeHeld(side, attack, where) {
  const g = sheet(side, attack);
  const spot = spots(side)[where];
  const foe = where === "own" || where === "behind" ? parkFoe(g, where) : null;
  pinGoalie(g, spot);
  world.puck.owner = g.id;
  world.puck.x = spot.x;
  world.puck.z = spot.z;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  world.coverT = 0;
  world.faceoffA = false;
  world.lastPass = -10;
  world.lastShoot = -10;
  g.gloveFlash = 0;
  return { g, spot, foe, where };
}

/** Re-pin before each step so a skate during the step cannot leave the spot's zone. */
function stepHeld(placed, frames) {
  const { g, spot, foe, where } = placed;
  let whistled = -1;
  for (let i = 0; i < frames; i++) {
    pinOthers(g, foe);
    pinGoalie(g, spot);
    g.gloveFlash = 0;
    if (world.puck.owner !== g.id) {
      return { whistled, stolen: i, coverT: world.coverT };
    }
    stepSim(DT);
    if (world.whistle) {
      whistled = i;
      break;
    }
  }
  return { whistled, stolen: -1, coverT: world.coverT, where };
}

test("no input whistles after 2 seconds, and A or X in that window adds 2 seconds", () => {
  try {
    const idle = placeHeld("home", 1, "own");
    setInjectedKeys([]);
    const tooSoon = stepHeld(idle, 100);
    assert.equal(tooSoon.stolen, -1, "idle lost the puck");
    assert.equal(tooSoon.whistled, -1, `idle whistled at frame ${tooSoon.whistled}`);
    assert.ok(tooSoon.coverT < 2, `idle coverT ${tooSoon.coverT}`);
    const idleHit = stepHeld(idle, 40);
    const idleFrame = 100 + idleHit.whistled;
    assert.equal(world.whistle, "cover", "idle whistle");
    assert.ok(idleFrame >= 115 && idleFrame <= 125, `idle frame ${idleFrame}`);

    for (const attack of [1, -1]) {
      for (const keys of [["KeyJ"], ["KeyF"], ["KeyR"], ["KeyR", "KeyJ"]]) {
        const placed = placeHeld("home", attack, "own");
        setInjectedKeys(keys);
        const mid = stepHeld(placed, 210);
        const name = `home ${attack} ${keys.join("+")}`;
        assert.equal(mid.stolen, -1, `${name} lost the puck`);
        assert.equal(mid.whistled, -1, `${name} whistled at 3.5s on frame ${mid.whistled}`);
        assert.ok(mid.coverT > 3, `${name} coverT ${mid.coverT}`);
        const late = stepHeld(placed, 40);
        const frame = 210 + late.whistled;
        assert.equal(world.whistle, "cover", `${name} whistle ${world.whistle}`);
        assert.equal(useGame.getState().whistle, "cover", name);
        assert.ok(frame >= 235 && frame <= 245, `${name} whistled at frame ${frame}`);
      }
    }

    const lateHold = placeHeld("home", 1, "own");
    setInjectedKeys([]);
    const waited = stepHeld(lateHold, 60);
    assert.equal(waited.whistled, -1, "whistled before the hold");
    setInjectedKeys(["KeyJ"]);
    const charging = stepHeld(lateHold, 150);
    assert.equal(charging.stolen, -1, "late hold lost the puck");
    assert.equal(charging.whistled, -1, `late hold whistled at coverT ${charging.coverT}`);
    const finished = stepHeld(lateHold, 40);
    const lateFrame = 210 + finished.whistled;
    assert.equal(world.whistle, "cover", "late hold whistle");
    assert.ok(lateFrame >= 235 && lateFrame <= 245, `late hold frame ${lateFrame}`);
  } finally {
    setInjectedKeys([]);
  }
});

test("an away goalie does not get the extra release time", () => {
  try {
    const placed = placeHeld("away", 1, "own");
    setInjectedKeys(["KeyJ"]);
    const hit = stepHeld(placed, 140);
    assert.equal(hit.stolen, -1, `stolen on frame ${hit.stolen}`);
    assert.equal(world.whistle, "cover", `whistle ${world.whistle}`);
    assert.ok(hit.whistled >= 0 && hit.whistled < 130, `away whistled at frame ${hit.whistled}`);
  } finally {
    setInjectedKeys([]);
  }
});

test("drill, practice, and scrimmage do not whistle a cover", () => {
  for (const mode of ["drill", "practice", "scrimmage"]) {
    const placed = placeHeld("home", 1, "own");
    useGame.getState().setClockMode(mode);
    setInjectedKeys([]);
    const hit = stepHeld(placed, 180);
    assert.equal(hit.whistled, -1, `${mode} whistled at frame ${hit.whistled}`);
    assert.notEqual(world.whistle, "cover", mode);
  }
});

test("holding pass outside the zone does not whistle", () => {
  try {
    const placed = placeHeld("home", 1, "neutral");
    setInjectedKeys(["KeyJ"]);
    const hit = stepHeld(placed, 200);
    assert.equal(hit.whistled, -1, `neutral whistle on frame ${hit.whistled}`);
    assert.equal(world.whistle, null);
    assert.ok(world.coverT < 0.05, `neutral coverT ${world.coverT}`);
  } finally {
    setInjectedKeys([]);
  }
});
