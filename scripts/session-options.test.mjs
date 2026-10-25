/**
 * Scrimmage goalies are optional, practice scores hand the puck back,
 * an empty user lineup still steps, and kits advance after a match.
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
if (typeof globalThis.navigator !== "object" || globalThis.navigator === null) globalThis.navigator = {};
Object.defineProperty(globalThis.navigator, "getGamepads", {
  configurable: true,
  value: () => [],
});

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
const uniforms = await server.ssrLoadModule("/src/game/uniforms.ts");

const { resetWorld, stepSim, world, previewPausedMode, previewPausedMinutes, startPausedNewGame, pauseGame } = sim;
const { useGame, patchLineup, cycleMatchKits, drawCpuKit, armCpuKitCycle, applyArmedCpuKitCycle } = store;
const { setInjectedKeys } = input;
const { GOAL_LINE_X } = rink;
const { UNIFORMS } = uniforms;

const DT = 1 / 60;

function boot(mode, home, away) {
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setPaused(false);
  ui.setPlaying(true);
  if (ui.clockMode === "practice" || ui.clockMode === "scrimmage") ui.setClockMode("game");
  ui.setClockMode(mode);
  ui.setHomeLineup(home);
  ui.setAwayLineup(away);
  world.periodOver = false;
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  useGame.getState().setWhistle(null);
  useGame.getState().setHomeScore(0);
  useGame.getState().setAwayScore(0);
}

test("scrimmage can add one goalie without dropping a skater", () => {
  const full = { g: 0, d: 2, o: 3 };
  const withG = patchLineup(full, "g", 1, 5, true);
  assert.deepEqual(withG, { g: 1, d: 2, o: 3 });
  const extraF = patchLineup(full, "o", 4, 5, true);
  assert.equal(extraF.o, 3);
  const empty = patchLineup({ g: 0, d: 0, o: 1 }, "o", 0, 6, false);
  assert.deepEqual(empty, { g: 0, d: 0, o: 0 });
});

test("scrimmage spawns a goalie only on the side that asked", () => {
  boot("scrimmage", { g: 1, d: 2, o: 3 }, { g: 0, d: 2, o: 3 });
  assert.equal(world.skaters.filter((s) => s.side === "home" && s.kind === "goalie").length, 1);
  assert.equal(world.skaters.filter((s) => s.side === "away" && s.kind === "goalie").length, 0);
  assert.equal(world.skaters.filter((s) => s.side === "home" && s.kind !== "goalie").length, 5);
});

function assertLivePractice() {
  assert.equal(world.stoppage, false);
  assert.equal(world.faceoff, false);
  assert.equal(world.whistle, null);
}

test("practice gives a new puck after a goal and does not face off", () => {
  boot("practice", { g: 0, d: 0, o: 1 }, { g: 0, d: 0, o: 0 });
  const user = world.skaters[world.userId];
  assert.equal(user.side, "home");
  world.homeAttack = 1;
  user.x = GOAL_LINE_X - 0.7;
  user.z = 0;
  user.vx = 9;
  user.vz = 0;
  user.yaw = -Math.PI / 2;
  world.puck.owner = user.id;
  world.puck.x = user.x + 0.4;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 9;
  world.puck.vz = 0;
  world.puck.vy = 0;
  for (let i = 0; i < 40 && useGame.getState().homeScore === 0; i++) stepSim(DT);
  const scoredAt = world.time;
  assert.equal(useGame.getState().homeScore, 1);
  assertLivePractice();
  assert.equal(world.puck.owner, null);
  for (let i = 0; i < 27; i++) stepSim(DT);
  assert.equal(world.puck.owner, null);
  assert.ok(world.time - scoredAt < 0.5);
  while (world.puck.owner === null && world.time - scoredAt < 0.7) stepSim(DT);
  const waited = world.time - scoredAt;
  assert.ok(waited >= 0.5 - 1e-4, `puck returned at ${waited}`);
  assert.ok(waited < 0.55, `puck returned at ${waited}`);
  assert.equal(world.puck.owner, user.id);
  assert.equal(useGame.getState().homeScore, 1);
  assertLivePractice();
});

test("practice waits 0.5s, then gives a goalie goal to that goalie", () => {
  boot("practice", { g: 1, d: 0, o: 1 }, { g: 0, d: 0, o: 0 });
  const user = world.skaters[world.userId];
  const goalie = world.skaters.find((s) => s.side === "home" && s.kind === "goalie");
  assert.ok(goalie);
  assert.equal(user.kind, "winger");
  assert.notEqual(user.id, goalie.id);
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.puck.owner = null;
  world.lastShooter = goalie.id;
  world.goalieShot = "score";
  world.puck.x = -GOAL_LINE_X + 0.05;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = -1.5;
  world.puck.vz = 0;
  world.puck.vy = 0;
  for (let i = 0; i < 20 && useGame.getState().homeScore === 0; i++) stepSim(DT);
  const scoredAt = world.time;
  assert.equal(useGame.getState().homeScore, 1);
  assertLivePractice();
  assert.equal(world.puck.owner, null);
  while (world.puck.owner === null && world.time - scoredAt < 0.7) stepSim(DT);
  const waited = world.time - scoredAt;
  assert.ok(waited >= 0.5 - 1e-4, `puck returned at ${waited}`);
  assert.ok(waited < 0.55, `puck returned at ${waited}`);
  assert.equal(world.puck.owner, goalie.id);
  assert.notEqual(world.puck.owner, user.id);
  assert.equal(useGame.getState().hasPuck, false);
  assert.equal(useGame.getState().homeScore, 1);
  assertLivePractice();
});

test("the corner reset keeps the away kit and a saved offsides choice", () => {
  boot("practice", { g: 0, d: 0, o: 1 }, { g: 1, d: 0, o: 0 });
  const ui = useGame.getState();
  const away = (ui.homeKit + 1) % UNIFORMS.length;
  ui.setAwayKit(away);
  ui.setOffsides(false);
  ui.applyCornerReset();
  assert.equal(useGame.getState().awayKit, away);
  assert.equal(useGame.getState().offsides, false);
  assert.equal(useGame.getState().clockMode, "game");
  assert.equal(localStorage.getItem("hfb-offsides"), "0");

  ui.setOffsides(true);
  ui.setClockMode("roller");
  ui.applyCornerReset();
  assert.equal(useGame.getState().awayKit, away);
  assert.equal(useGame.getState().offsides, true);
  assert.equal(useGame.getState().clockMode, "game");

  localStorage.removeItem("hfb-offsides");
  ui.setClockMode("practice");
  assert.equal(useGame.getState().offsides, false);
  ui.applyCornerReset();
  assert.equal(useGame.getState().awayKit, away);
  assert.equal(useGame.getState().clockMode, "game");
  assert.equal(useGame.getState().offsides, true);
});

test("practice and scrimmage keep stepping with no user skaters", () => {
  for (const mode of ["practice", "scrimmage"]) {
    boot(mode, { g: 0, d: 0, o: 0 }, { g: 1, d: 1, o: 1 });
    assert.equal(world.userId, -1);
    assert.equal(world.skaters.filter((s) => s.side === "home").length, 0);
    assert.ok(world.skaters.some((s) => s.side === "away" && s.kind !== "goalie"));
    for (let i = 0; i < 20; i++) stepSim(DT);
    assert.equal(world.userId, -1);
    assert.equal(world.faceoff, false);
    assert.equal(useGame.getState().hasPuck, false);
  }
});

function tap(code) {
  setInjectedKeys([code]);
  stepSim(DT);
  setInjectedKeys([]);
  stepSim(DT);
  stepSim(DT);
}

test("pause A starts a new mode and Y resumes the game already running", () => {
  boot("game", { g: 1, d: 2, o: 3 }, { g: 1, d: 2, o: 3 });
  const minutes = useGame.getState().gameMinutes;
  pauseGame();
  previewPausedMinutes(minutes === 5 ? 1 : minutes + 1);
  tap("KeyE");
  assert.equal(useGame.getState().paused, false);
  assert.equal(useGame.getState().clockMode, "game");
  assert.equal(useGame.getState().gameMinutes, minutes);

  pauseGame();
  previewPausedMode("practice");
  tap("KeyQ");
  assert.equal(useGame.getState().paused, false);
  assert.equal(useGame.getState().clockMode, "game");

  pauseGame();
  previewPausedMode("roller");
  tap("KeyE");
  assert.equal(useGame.getState().paused, false);
  assert.equal(useGame.getState().clockMode, "roller");

  pauseGame();
  tap("KeyQ");
  assert.equal(useGame.getState().paused, false);
  assert.equal(useGame.getState().clockMode, "roller");
});

test("a finished match reset, a new game, and a mode change keep both kits", () => {
  boot("game", { g: 1, d: 2, o: 3 }, { g: 1, d: 2, o: 3 });
  const home = useGame.getState().homeKit;
  const away = useGame.getState().awayKit;
  world.periodOver = true;
  useGame.getState().setPeriodOver(true);
  resetWorld();
  assert.equal(useGame.getState().homeKit, home);
  assert.equal(useGame.getState().awayKit, away);

  armCpuKitCycle();
  previewPausedMode("roller");
  assert.equal(useGame.getState().homeKit, home);
  assert.equal(useGame.getState().awayKit, away);
  assert.equal(useGame.getState().clockMode, "roller");

  armCpuKitCycle();
  useGame.getState().setPlaying(true);
  useGame.getState().setPaused(true);
  startPausedNewGame();
  assert.equal(useGame.getState().homeKit, home);
  assert.equal(useGame.getState().awayKit, away);
});

test("cpu kit sequence skips kits already used and leaves the user kit", () => {
  const home = 0;
  let away = 1;
  let seen = [away];
  const got = new Set(seen);
  while (got.size < UNIFORMS.length - 1) {
    const draw = drawCpuKit(home, away, seen);
    assert.notEqual(draw.next, home);
    assert.notEqual(draw.next, away);
    assert.equal(got.has(draw.next), false);
    away = draw.next;
    seen = draw.seen;
    got.add(away);
  }
  assert.deepEqual([...got].sort((a, b) => a - b), UNIFORMS.map((u) => u.id).filter((id) => id !== home));
  const wrapped = drawCpuKit(home, away, seen);
  assert.notEqual(wrapped.next, home);
  assert.notEqual(wrapped.next, away);
});

test("a user win cycles the cpu kit when play continues, and a loss does not", () => {
  boot("game", { g: 1, d: 2, o: 3 }, { g: 1, d: 2, o: 3 });
  const home = useGame.getState().homeKit;
  const away = useGame.getState().awayKit;
  useGame.getState().setHomeScore(2);
  useGame.getState().setAwayScore(0);
  useGame.getState().setPeriod(3);
  world.period = 3;
  world.periodClock = 0.01;
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.periodOver = false;
  stepSim(DT);
  assert.equal(world.periodOver, true);
  assert.equal(useGame.getState().homeKit, home);
  assert.equal(useGame.getState().awayKit, away);
  applyArmedCpuKitCycle();
  assert.equal(useGame.getState().homeKit, home);
  assert.notEqual(useGame.getState().awayKit, away);
  assert.notEqual(useGame.getState().awayKit, home);

  const heldHome = useGame.getState().homeKit;
  const heldAway = useGame.getState().awayKit;
  boot("game", { g: 1, d: 2, o: 3 }, { g: 1, d: 2, o: 3 });
  useGame.getState().setHomeScore(0);
  useGame.getState().setAwayScore(3);
  useGame.getState().setPeriod(3);
  world.period = 3;
  world.periodClock = 0.01;
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.periodOver = false;
  stepSim(DT);
  assert.equal(world.periodOver, true);
  applyArmedCpuKitCycle();
  assert.equal(useGame.getState().homeKit, heldHome);
  assert.equal(useGame.getState().awayKit, heldAway);

  const again = useGame.getState().awayKit;
  world.periodOver = true;
  resetWorld();
  assert.equal(useGame.getState().homeKit, heldHome);
  assert.equal(useGame.getState().awayKit, again);
  cycleMatchKits();
  assert.equal(useGame.getState().homeKit, heldHome);
  assert.notEqual(useGame.getState().awayKit, heldHome);
});
