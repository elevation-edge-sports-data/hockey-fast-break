/**
 * Lineup changes update the on-ice roster without a new game.
 * A user fast break sends one teammate to the net, and one CPU
 * defender matches the deepest home forward.
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

const { resetWorld, stepSim, world, applyLiveLineup } = sim;
const { useGame } = store;
const { BLUE_X, BLUE_LINE_W, FACEOFF_SPOT_Z, GOAL_LINE_X, RINK_W } = rink;
const { setInjectedKeys } = input;

const DT = 1 / 60;
const EDGE = BLUE_X + BLUE_LINE_W * 0.5;

function live() {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setPaused(true);
  ui.setHomeLineup({ g: 1, d: 2, o: 2 });
  ui.setAwayLineup({ g: 1, d: 2, o: 3 });
  resetWorld();
  world.homeAttack = 1;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.delayedOffside = 0;
  world.periodOver = false;
  world.periodEndT = 0;
}

function markGame() {
  const ui = useGame.getState();
  ui.setHomeScore(3);
  ui.setAwayScore(1);
  ui.setPeriod(2);
  ui.setPeriodClock(812);
  ui.setPeriodOver(false);
  ui.setWhistle(null);
  world.period = 2;
  world.periodClock = 812;
  world.periodOver = false;
  world.periodEndT = 0;
  world.time = 44.5;
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.faceoffT = 1.2;
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  const user = world.skaters[world.userId];
  user.x = 4.25;
  user.z = -2.1;
  user.vx = 3.4;
  user.vz = -0.6;
  world.puck.owner = user.id;
  world.puck.x = 4.4;
  world.puck.z = -2.05;
  world.puck.y = 0.08;
  world.puck.vx = 3.4;
  world.puck.vz = -0.6;
  world.puck.vy = 0;
  ui.setHasPuck(true);
}

function snapshot() {
  const ui = useGame.getState();
  return {
    home: ui.homeScore,
    away: ui.awayScore,
    period: ui.period,
    clock: ui.periodClock,
    worldPeriod: world.period,
    worldClock: world.periodClock,
    periodOver: world.periodOver,
    uiOver: ui.periodOver,
    endT: world.periodEndT,
    time: world.time,
    faceoff: world.faceoff,
    phase: world.faceoffPhase,
    faceoffT: world.faceoffT,
    stoppage: world.stoppage,
    stoppageT: world.stoppageT,
    whistle: world.whistle,
    puck: { ...world.puck },
  };
}

function assertSameGame(before, puckOwnerKept) {
  const ui = useGame.getState();
  assert.equal(ui.homeScore, before.home);
  assert.equal(ui.awayScore, before.away);
  assert.equal(ui.period, before.period);
  assert.equal(ui.periodClock, before.clock);
  assert.equal(world.period, before.worldPeriod);
  assert.equal(world.periodClock, before.worldClock);
  assert.equal(world.periodOver, before.periodOver);
  assert.equal(ui.periodOver, before.uiOver);
  assert.equal(world.periodEndT, before.endT);
  assert.equal(world.time, before.time);
  assert.equal(world.faceoff, before.faceoff);
  assert.equal(world.faceoffPhase, before.phase);
  assert.equal(world.faceoffT, before.faceoffT);
  assert.equal(world.stoppage, before.stoppage);
  assert.equal(world.stoppageT, before.stoppageT);
  assert.equal(world.whistle, before.whistle);
  assert.equal(world.puck.x, before.puck.x);
  assert.equal(world.puck.z, before.puck.z);
  assert.equal(world.puck.y, before.puck.y);
  assert.equal(world.puck.vx, before.puck.vx);
  assert.equal(world.puck.vz, before.puck.vz);
  if (puckOwnerKept) assert.equal(world.puck.owner, before.puck.owner);
}

test("changing a lineup keeps the game, clock, score, and puck", () => {
  live();
  markGame();
  const user = world.skaters[world.userId];
  const mate = world.skaters.find((s) => s.side === "home" && s.kind === "defense");
  assert.ok(mate);
  const mateAt = { x: mate.x, z: mate.z, number: mate.number };
  const userAt = { x: user.x, z: user.z, number: user.number };
  const awayW = world.skaters.filter((s) => s.side === "away" && s.kind === "winger");
  assert.equal(awayW.length, 3);
  const keptNums = awayW.slice(0, 2).map((s) => s.number);
  const before = snapshot();

  useGame.getState().setAwayLineup({ g: 1, d: 2, o: 2 });
  applyLiveLineup("away");

  assertSameGame(before, true);
  assert.equal(world.skaters.filter((s) => s.side === "away" && s.kind === "winger").length, 2);
  assert.equal(world.skaters.filter((s) => s.side === "away" && s.kind === "defense").length, 2);
  assert.equal(world.skaters.filter((s) => s.side === "away" && s.kind === "goalie").length, 1);
  const still = world.skaters.filter((s) => s.side === "away" && s.kind === "winger").map((s) => s.number);
  for (const n of keptNums) assert.ok(still.includes(n), `jersey ${n} was re-rolled`);
  assert.equal(mate.x, mateAt.x);
  assert.equal(mate.z, mateAt.z);
  assert.equal(mate.number, mateAt.number);
  assert.equal(user.x, userAt.x);
  assert.equal(user.z, userAt.z);
  assert.equal(user.number, userAt.number);
  assert.equal(world.puck.owner, user.id);
  assert.equal(world.userId, user.id);

  const homeBefore = world.skaters.filter((s) => s.side === "home" && s.kind === "winger").length;
  assert.equal(homeBefore, 2);
  useGame.getState().setHomeLineup({ g: 1, d: 2, o: 3 });
  applyLiveLineup("home");
  assertSameGame(before, true);
  const homeW = world.skaters.filter((s) => s.side === "home" && s.kind === "winger");
  assert.equal(homeW.length, 3);
  assert.equal(user.x, userAt.x);
  assert.equal(user.number, userAt.number);
  assert.ok(homeW.some((s) => s.id !== user.id && s.number !== user.number));
  assert.equal(world.faceoff, false);
});

test("a stoppage and a period-over state survive a personnel change", () => {
  live();
  markGame();
  world.stoppage = true;
  world.stoppageT = 1.35;
  world.whistle = "offside";
  world.periodOver = true;
  world.periodEndT = 1.1;
  useGame.getState().setWhistle("offside");
  useGame.getState().setPeriodOver(true);
  const before = snapshot();
  useGame.getState().setAwayLineup({ g: 1, d: 1, o: 3 });
  applyLiveLineup("away");
  assertSameGame(before, true);
  assert.equal(world.skaters.filter((s) => s.side === "away" && s.kind === "defense").length, 1);
  assert.equal(world.whistle, "offside");
  assert.equal(world.stoppage, true);
  assert.equal(world.periodOver, true);
  assert.equal(world.faceoff, false);
});

test("a removed puck carrier leaves the puck where it was", () => {
  live();
  markGame();
  const away = world.skaters.find((s) => s.side === "away" && s.kind === "winger");
  assert.ok(away);
  world.puck.owner = away.id;
  world.puck.x = 6;
  world.puck.z = 3;
  world.puck.vx = 1;
  world.puck.vz = 0;
  useGame.getState().setHasPuck(false);
  const before = snapshot();
  useGame.getState().setAwayLineup({ g: 1, d: 2, o: 0 });
  applyLiveLineup("away");
  assert.equal(world.skaters.filter((s) => s.side === "away" && s.kind === "winger").length, 0);
  assert.equal(world.puck.owner, null);
  assert.equal(world.puck.x, before.puck.x);
  assert.equal(world.puck.z, before.puck.z);
  assert.equal(world.puck.vx, before.puck.vx);
  assert.equal(world.periodClock, before.clock);
  assert.equal(useGame.getState().homeScore, before.home);
  assert.equal(world.faceoff, false);
});

function pin(s, x, z, vx = 0, vz = 0) {
  s.x = x;
  s.z = z;
  s.vx = vx;
  s.vz = vz;
  s.stun = 0;
  s.struck = 0;
  s.dive = 0;
  s.tumble = 0;
}

function ownPuck(s) {
  world.puck.owner = s.id;
  world.puck.x = s.x;
  world.puck.z = s.z;
  world.puck.y = 0.05;
  world.puck.vx = s.vx;
  world.puck.vz = s.vz;
  world.puck.vy = 0;
  world.faceoff = false;
  world.stoppage = false;
  world.whistle = null;
}

test("wings keep their side when the puck moves between the points", () => {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setClockMode("game");
  ui.setOffsides(true);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setHomeLineup({ g: 1, d: 2, o: 3 });
  ui.setAwayLineup({ g: 1, d: 2, o: 3 });
  resetWorld();
  world.homeAttack = 1;
  resetWorld({ keepScore: true });
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  const user = world.skaters[world.userId];
  assert.equal(user.kind, "winger");
  const forwards = world.skaters
    .filter((s) => s.side === "home" && s.kind === "winger")
    .sort((a, b) => a.id - b.id);
  const centerI = forwards.length <= 2 ? 0 : Math.floor((forwards.length - 1) / 2);
  const wingsOnly = forwards.filter((s) => s.id !== user.id && s.id !== forwards[centerI].id);
  const defsHome = world.skaters
    .filter((s) => s.side === "home" && s.kind === "defense")
    .sort((a, b) => a.id - b.id);
  assert.ok(wingsOnly.length >= 1);
  assert.equal(defsHome.length, 2);
  for (const s of world.skaters) {
    if (s.side === "home" && s.kind !== "goalie") {
      s.stun = 0;
      s.x = 4;
      s.z = 0;
    } else if (s.kind !== "goalie") {
      s.stun = 40;
      s.x = -22;
      s.z = 0;
    }
  }
  const boards = RINK_W / 2 - 2.2;
  const blue = EDGE + 1.2;
  const settle = (z) => {
    for (let i = 0; i < 160; i++) {
      pin(user, blue, z, 0, 0);
      ownPuck(user);
      stepSim(DT);
    }
  };
  settle(boards);
  const sideOf = new Map(wingsOnly.map((s) => [s.id, Math.sign(s.z) || 1]));
  // Attack is +X, so the left half is +Z. Lower id owns that half for the whole run.
  const dSide = new Map(defsHome.map((s) => [s.id, Math.sign(s.z)]));
  assert.equal(dSide.get(defsHome[0].id), 1, `left defense started at z ${defsHome[0].z.toFixed(2)}`);
  assert.equal(dSide.get(defsHome[1].id), -1, `right defense started at z ${defsHome[1].z.toFixed(2)}`);
  for (const d of defsHome) {
    assert.ok(Math.abs(d.z) > 8, `defense ${d.id} started off its corner (z ${d.z.toFixed(2)})`);
  }
  for (const s of wingsOnly) {
    assert.ok(Math.abs(s.z) <= FACEOFF_SPOT_Z + 0.35 || Math.sign(s.z) === sideOf.get(s.id));
  }
  const parked = wingsOnly.map((s) => ({ id: s.id, x: s.x, z: s.z }));
  for (let i = 0; i < 90; i++) {
    pin(user, blue, boards, 0, 0);
    ownPuck(user);
    stepSim(DT);
  }
  for (const was of parked) {
    const now = wingsOnly.find((s) => s.id === was.id);
    const moved = Math.hypot(now.x - was.x, now.z - was.z);
    assert.ok(moved < 0.45, `wing ${was.id} twitched ${moved.toFixed(2)} m`);
  }
  settle(-boards);
  for (const s of wingsOnly) {
    const dotSide = sideOf.get(s.id);
    assert.equal(Math.sign(s.z) || dotSide, dotSide, `wing ${s.id} switched boards to ${s.z.toFixed(2)}`);
    if (dotSide > 0) assert.ok(s.z >= -FACEOFF_SPOT_Z - 0.3, `left side crossed the right dot (${s.z.toFixed(2)})`);
    else assert.ok(s.z <= FACEOFF_SPOT_Z + 0.3, `right side crossed the left dot (${s.z.toFixed(2)})`);
  }
  for (const d of defsHome) {
    assert.equal(Math.sign(d.z), dSide.get(d.id), `defense ${d.id} switched halves to ${d.z.toFixed(2)}`);
    assert.ok(Math.abs(d.z) > 8, `defense ${d.id} left its corner (z ${d.z.toFixed(2)})`);
  }
  for (let i = 0; i < 200; i++) {
    pin(user, 0, -boards, 0, 0);
    ownPuck(user);
    stepSim(DT);
  }
  for (const d of defsHome) {
    assert.equal(
      Math.sign(d.z),
      dSide.get(d.id),
      `defense ${d.id} crossed in the neutral zone (${d.z.toFixed(2)})`,
    );
    assert.ok(Math.abs(d.z) > 3, `defense ${d.id} collapsed to center (${d.z.toFixed(2)})`);
  }
  const ownNet = -(EDGE + 6);
  const defend = (z) => {
    for (let i = 0; i < 160; i++) {
      pin(user, ownNet, z, 0, 0);
      ownPuck(user);
      stepSim(DT);
    }
  };
  defend(boards);
  defend(-boards);
  for (const d of defsHome) {
    assert.equal(
      Math.sign(d.z),
      dSide.get(d.id),
      `defense ${d.id} followed the puck across in the defensive zone (${d.z.toFixed(2)})`,
    );
    assert.ok(Math.abs(d.z) > 3, `defense ${d.id} stacked at center (${d.z.toFixed(2)})`);
  }
  assert.ok(
    defsHome[0].z * defsHome[1].z < 0,
    `both defense on one half (${defsHome.map((d) => d.z.toFixed(1))})`,
  );
});

test("a user fast break sends one teammate to the net, not onto the carrier", () => {
  live();
  useGame.getState().setPaused(false);
  const user = world.skaters[world.userId];
  assert.equal(user.kind, "winger");
  const mates = world.skaters
    .filter((s) => s.side === "home" && s.kind === "winger" && s.id !== user.id)
    .sort((a, b) => a.id - b.id);
  assert.ok(mates.length >= 1);
  const crasher = mates[0];
  for (const s of world.skaters) {
    if (s.id === user.id || s.id === crasher.id || s.kind === "goalie") continue;
    s.stun = 40;
    s.x = s.side === "home" ? -20 : 20;
    s.z = -10;
  }
  pin(crasher, EDGE + 2, 5);
  const cx = EDGE + 8;
  for (let i = 0; i < 100; i++) {
    pin(user, cx, 0, 8, 0);
    ownPuck(user);
    stepSim(DT);
  }
  const depth = (GOAL_LINE_X - crasher.x) * world.homeAttack;
  assert.ok(depth < 8, `crasher stayed high at depth ${depth.toFixed(2)} (x ${crasher.x.toFixed(2)})`);
  assert.ok(crasher.x > cx + 3, `crasher chased from behind at ${crasher.x.toFixed(2)}`);
  const gap = Math.hypot(crasher.x - cx, crasher.z);
  assert.ok(gap > 3.2, `crasher stacked on the carrier (${gap.toFixed(2)} m)`);
});

test("one CPU defender matches the deepest home forward", () => {
  live();
  useGame.getState().setPaused(false);
  const user = world.skaters[world.userId];
  const deep = world.skaters.find((s) => s.side === "home" && s.kind === "winger" && s.id !== user.id);
  const back = world.skaters.find((s) => s.side === "away" && s.kind === "defense");
  assert.ok(deep && back);
  for (const s of world.skaters) {
    if (s.id === user.id || s.id === deep.id || s.id === back.id || s.kind === "goalie") continue;
    s.stun = 40;
    s.x = -22;
    s.z = 8;
  }
  pin(back, 5, -2);
  for (let i = 0; i < 180; i++) {
    pin(user, 2, 0, 0, 0);
    pin(deep, 18, 3);
    ownPuck(user);
    stepSim(DT);
  }
  assert.ok(back.x >= 16, `defender stayed shallow at ${back.x.toFixed(2)} while the forward was at 18`);
  assert.ok(Math.abs(back.x - 18) <= 2.05 || back.x > 18, `depth gap ${Math.abs(back.x - 18).toFixed(2)}`);
});

test("a long board circuit draws one CPU inside the lane", () => {
  live();
  useGame.getState().setPaused(false);
  const user = world.skaters[world.userId];
  const cutter = world.skaters.find((s) => s.side === "away" && s.kind === "winger");
  assert.ok(cutter);
  for (const s of world.skaters) {
    if (s.id === user.id || s.id === cutter.id || s.kind === "goalie") continue;
    s.stun = 80;
    s.x = -24;
    s.z = 0;
  }
  const wall = RINK_W / 2 - 2.15;
  pin(cutter, -8, wall);
  let x = -18;
  let inside = wall;
  for (let i = 0; i < 340; i++) {
    x += 0.16;
    pin(user, x, wall, 9, 0);
    ownPuck(user);
    stepSim(DT);
    if (i > 220) inside = Math.min(inside, Math.abs(cutter.z));
  }
  assert.ok(inside < wall - 0.8, `CPU stayed on the boards (z ${inside.toFixed(2)}, wall ${wall.toFixed(2)})`);
});
