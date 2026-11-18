/**
 * Instant replay plays one goal clip three times, then cuts to the center-ice drop.
 * The sim stays still during the clip. A and X only skip.
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
let pads = [];
Object.defineProperty(globalThis.navigator, "getGamepads", {
  configurable: true,
  value: () => pads,
});
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;

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
const poses = await server.ssrLoadModule("/src/game/poseOverrideInfer.ts");
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { resetWorld, stepSim, world, installControlsProbe, instantReplayModes, instantReplayCam, instantReplayFrames, instantReplayPose, instantReplayCrowdOn, replayBoardNow, replayFrameNow, seekReplay, beginPauseReplay, pauseGame, stopPauseReplay } = sim;
const { useGame } = store;
const { setInjectedKeys } = input;
const { inferNamedPose } = poses;
const { GOAL_LINE_X } = rink;

installControlsProbe();

const DT = 1 / 60;

function frames(n) {
  for (let i = 0; i < n; i++) stepSim(DT);
}

function sheet(mode = "game") {
  pads = [];
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setInstantReplay(true);
  ui.setClockMode(mode);
  ui.setPowerPlay(false);
  ui.setChaos(false);
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.stoppageT = 0;
  world.whistle = null;
  world.periodOver = false;
  world.replay = false;
  world.goalSide = null;
  world.shootout = null;
}

function fillBuffer() {
  for (const s of world.skaters) {
    s.stun = 99;
    s.vx = 0;
    s.vz = 0;
  }
  world.puck.owner = null;
  for (let i = 0; i < 180; i++) {
    world.puck.x = Math.sin(i / 30) * 6;
    world.puck.z = 0;
    world.puck.y = 0.05;
    world.puck.vx = 4;
    world.puck.vz = 0;
    world.puck.vy = 0;
    stepSim(DT);
  }
}

function score(net) {
  world.lastShoot = world.time - 0.5;
  world.lastPass = world.time - 3;
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  globalThis.window.__controlsTest.forceGoal(net ?? world.homeAttack);
}

function edge(code) {
  setInjectedKeys([]);
  stepSim(DT);
  setInjectedKeys([code]);
  stepSim(DT);
  setInjectedKeys([]);
}

test("instant replay is on until the player turns it off", () => {
  assert.equal(useGame.getState().instantReplay, true);
  useGame.getState().setInstantReplay(false);
  assert.equal(useGame.getState().instantReplay, false);
  useGame.getState().setInstantReplay(true);
});

test("a goal clip starts 1.5s before the release and plays three puck-centered cameras", () => {
  sheet("game");
  fillBuffer();
  const userId = world.userId;
  score();
  const modes = [...instantReplayModes()];
  assert.deepEqual(modes.slice().sort(), ["broadcast", "chase", "classic"]);
  frames(40);
  const framesInClip = instantReplayFrames();
  assert.ok(framesInClip >= 140 && framesInClip <= 170, `clip frames ${framesInClip}`);
  assert.equal(world.replay, false);
  edge("KeyE");
  assert.equal(instantReplayCam(), modes[0]);
  assert.equal(world.userId, userId);
  assert.equal(world.replayKind, "goal");
  assert.equal(useGame.getState().replay, false);
  assert.equal(useGame.getState().paused, false);
  const pose = instantReplayPose();
  assert.ok(pose);
  assert.equal(pose.lookX, world.puck.x);
  assert.equal(pose.lookY, Math.max(0.35, world.puck.y));
  assert.equal(pose.lookZ, world.puck.z);
  assert.equal(pose.mode, instantReplayCam());
  if (pose.mode === "classic") {
    const atk = world.homeAttack > 0 ? 1 : -1;
    assert.ok((pose.lookX - pose.camX) * atk > 1);
    assert.equal(pose.upX, atk);
    assert.equal(pose.fov, 50);
  } else if (pose.mode === "broadcast") {
    assert.ok(pose.camY > 10);
    assert.equal(pose.upY, 1);
    assert.equal(pose.fov, 44);
  } else {
    assert.ok(Math.hypot(pose.camX - pose.lookX, pose.camZ - pose.lookZ) > 1);
    assert.equal(pose.upY, 1);
    assert.equal(pose.fov, 44);
  }
  const frozen = world.time;
  edge("KeyE");
  assert.equal(instantReplayCam(), modes[1]);
  edge("KeyE");
  assert.equal(instantReplayCam(), modes[2]);
  assert.equal(world.time, frozen);
  edge("KeyE");
  assert.equal(world.faceoff, true);
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);
  assert.equal(world.whistle, null);
  assert.equal(world.replay, false);
});

test("the clip starts on its own after 2s, and X cuts to the faceoff", () => {
  sheet("roller");
  fillBuffer();
  score();
  frames(119);
  assert.equal(world.replay, false);
  frames(2);
  assert.equal(world.replayKind, "goal");
  const t0 = world.replayT;
  setInjectedKeys(["KeyG"]);
  frames(6);
  setInjectedKeys([]);
  assert.ok(world.replayT > t0);
  edge("KeyF");
  assert.equal(world.faceoff, true);
  assert.equal(world.faceX, 0);
  assert.equal(world.faceZ, 0);
  assert.equal(world.replay, false);
});

test("X during the celebration skips the replay", () => {
  sheet("scrimmage");
  fillBuffer();
  score();
  assert.equal(instantReplayModes().length, 3);
  edge("KeyF");
  assert.equal(world.faceoff, true);
  assert.equal(world.whistle, null);
  assert.equal(instantReplayModes().length, 0);
});

test("broadcast uses 1.5s before the release and classic and chase use 1s", () => {
  sheet("game");
  fillBuffer();
  score();
  frames(40);
  edge("KeyE");
  const steps = {};
  for (let n = 0; n < 3; n++) {
    const cam = instantReplayCam();
    assert.ok(cam);
    let played = 0;
    while (instantReplayCam() === cam && played < 400) {
      stepSim(DT);
      played += 1;
    }
    steps[cam] = played;
  }
  assert.equal(world.faceoff, true);
  assert.equal(steps.broadcast - steps.classic, 30);
  assert.equal(steps.classic - steps.chase, 30);
});

test("each goal gets a new camera order", () => {
  const orders = new Set();
  for (let n = 0; n < 8; n++) {
    sheet("game");
    frames(8);
    score();
    const modes = [...instantReplayModes()];
    assert.deepEqual(modes.slice().sort(), ["broadcast", "chase", "classic"]);
    orders.add(modes.join(","));
  }
  assert.ok(orders.size > 1, `orders ${[...orders].join(" | ")}`);
});

test("a pass into the net starts 1.5s before that pass, not an older shot", () => {
  sheet("game");
  fillBuffer();
  world.lastShoot = world.time - 4;
  world.lastPass = world.time - 0.4;
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  globalThis.window.__controlsTest.forceGoal(world.homeAttack);
  frames(40);
  const framesInClip = instantReplayFrames();
  assert.ok(framesInClip >= 130 && framesInClip <= 170, `pass clip frames ${framesInClip}`);
});

test("each replay frame keeps the pose from that moment", () => {
  sheet("game");
  fillBuffer();
  const u = world.skaters[world.userId];
  for (let i = 0; i < 30; i++) {
    u.windup = 1;
    u.follow = 0;
    u.hit = 0;
    u.celebrate = 0;
    u.vx = 0;
    u.vz = 0;
    stepSim(DT);
  }
  world.lastShoot = world.time - 0.05;
  world.lastShotBackhand = false;
  world.lastShotSlap = true;
  world.lastShotKind = "slap";
  score();
  u.celebrate = 4;
  u.windup = 0;
  u.hit = 0.9;
  edge("KeyE");
  const shown = world.skaters[world.userId];
  assert.notEqual(inferNamedPose(shown, shown.id), "celebrate");
  assert.equal(shown.hit, 0);
  let sawSlap = inferNamedPose(shown, shown.id) === "slap";
  let sawOther = !sawSlap;
  for (let i = 0; i < 100 && !(sawSlap && sawOther); i++) {
    stepSim(DT);
    const pose = inferNamedPose(world.skaters[world.userId], world.skaters[world.userId].id);
    if (pose === "slap") sawSlap = true;
    else sawOther = true;
    assert.notEqual(pose, "celebrate");
  }
  assert.equal(sawSlap, true);
  assert.equal(sawOther, true);
  assert.equal(world.replayKind, "goal");
});

test("drill, practice, and the off switch do not arm a clip", () => {
  sheet("drill");
  fillBuffer();
  score();
  assert.equal(instantReplayModes().length, 0);
  sheet("practice");
  fillBuffer();
  score();
  assert.equal(instantReplayModes().length, 0);
  sheet("game");
  useGame.getState().setInstantReplay(false);
  fillBuffer();
  score();
  frames(130);
  assert.equal(world.replay, false);
  assert.equal(world.whistle, "goal");
});

function settled() {
  const ui = useGame.getState();
  return {
    replay: world.replay,
    kind: world.replayKind,
    paused: ui.paused,
    faceoff: world.faceoff,
    whistle: world.whistle,
    home: ui.homeScore,
    away: ui.awayScore,
    faceX: world.faceX,
    faceZ: world.faceZ,
    stoppage: world.stoppage,
    modes: instantReplayModes().length,
  };
}

function pressR3() {
  setInjectedKeys([]);
  pads = [];
  stepSim(DT);
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  buttons[11] = { pressed: true, touched: true, value: 1 };
  pads = [
    {
      id: "test-standard",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: 1,
      axes: [0, 0, 0, 0],
      buttons,
    },
  ];
  stepSim(DT);
  pads = [];
  setInjectedKeys([]);
}

test("instant replay keeps the new score and freezes the clock", () => {
  sheet("game");
  fillBuffer();
  const ui = useGame.getState();
  ui.setHomeScore(2);
  ui.setAwayScore(1);
  ui.setPeriod(2);
  ui.setPeriodClock(754);
  world.period = 2;
  world.periodClock = 754.4;
  score();
  assert.equal(useGame.getState().homeScore, 3);
  assert.equal(useGame.getState().awayScore, 1);
  assert.equal(useGame.getState().periodClock, 754);
  edge("KeyE");
  assert.equal(world.replayKind, "goal");
  const seen = [];
  for (let i = 0; i < 500 && world.replayKind === "goal"; i++) {
    const board = replayBoardNow();
    assert.ok(board);
    seen.push(board);
    assert.equal(board.homeScore, 3);
    assert.equal(board.awayScore, 1);
    assert.equal(board.period, 2);
    assert.equal(board.periodClock, 754);
    assert.equal(useGame.getState().homeScore, 3);
    assert.equal(useGame.getState().periodClock, 754);
    stepSim(DT);
  }
  assert.ok(seen.length > 30, `replay frames ${seen.length}`);
  assert.equal(replayBoardNow(), null);
  assert.equal(useGame.getState().homeScore, 3);
  assert.equal(useGame.getState().periodClock, 754);
});

function showReplayFrame(index, last) {
  const u = last <= 0 ? 0 : index / last;
  seekReplay(Math.max(0, Math.min(1, u)));
  if (replayFrameNow() === index) return;
  const step = 0.5 / Math.max(1, last);
  for (let k = 0; k < 4 && replayFrameNow() !== index; k++) {
    const got = replayFrameNow();
    seekReplay(Math.max(0, Math.min(1, u + (index - got) * step)));
  }
  assert.equal(replayFrameNow(), index);
}

test("in-game replay changes the score on the goal frame", () => {
  sheet("game");
  useGame.getState().setInstantReplay(false);
  fillBuffer();
  const ui = useGame.getState();
  ui.setHomeScore(3);
  ui.setAwayScore(0);
  frames(6);
  score();
  const goalX = world.puck.x;
  const goalZ = world.puck.z;
  frames(12);
  pauseGame();
  try {
    assert.equal(beginPauseReplay(), true);
    seekReplay(1);
    const last = replayFrameNow();
    assert.ok(last > 20, `replay frames ${last}`);
    let goalAt = -1;
    for (let i = 0; i <= last; i++) {
      showReplayFrame(i, last);
      const board = replayBoardNow();
      assert.ok(board);
      const atGoal = Math.abs(world.puck.x - goalX) < 1e-6 && Math.abs(world.puck.z - goalZ) < 1e-6;
      if (atGoal) {
        assert.equal(goalAt, -1);
        goalAt = i;
        assert.equal(board.homeScore, 4);
        assert.equal(board.awayScore, 0);
      } else if (goalAt < 0) {
        assert.notEqual(board.homeScore, 4, `frame ${i} already shows the goal`);
      } else {
        assert.equal(board.homeScore, 4, `frame ${i}`);
        assert.equal(board.awayScore, 0);
      }
    }
    assert.ok(goalAt > 0, `goal frame ${goalAt}`);
    showReplayFrame(goalAt - 1, last);
    assert.equal(replayBoardNow().homeScore, 3);
    assert.equal(replayBoardNow().awayScore, 0);
    assert.equal(useGame.getState().homeScore, 4);
    assert.equal(useGame.getState().awayScore, 0);
  } finally {
    stopPauseReplay();
    setInjectedKeys([]);
    pads = [];
  }
});

test("instant replay clock stays at the goal while a scrimmage clock keeps running", () => {
  sheet("scrimmage");
  fillBuffer();
  useGame.getState().setPeriodClock(40);
  world.periodClock = 40.2;
  score();
  const atGoal = useGame.getState().periodClock;
  frames(90);
  assert.ok(useGame.getState().periodClock > atGoal, `live clock ${useGame.getState().periodClock} vs ${atGoal}`);
  edge("KeyE");
  assert.equal(world.replayKind, "goal");
  assert.equal(replayBoardNow()?.periodClock, atGoal);
  frames(20);
  assert.equal(world.replayKind, "goal");
  assert.equal(replayBoardNow()?.periodClock, atGoal);
  assert.ok(useGame.getState().periodClock > atGoal);
});

test("the crowd sits until the goal frame, then cheers", () => {
  sheet("game");
  fillBuffer();
  score();
  // Live celebration still uses goalTicker. The replay gate stays off until the clip plays.
  assert.equal(instantReplayCrowdOn(), null);
  assert.ok(world.goalTicker > 0);
  frames(130);
  assert.equal(world.replayKind, "goal");
  assert.ok(world.goalTicker > 0, "goal ticker stays high through the clip");
  // score() releases 0.5s before the whistle. Broadcast keeps 90 frames before that, the others 60.
  const pre = { broadcast: 90, classic: 60, chase: 60 };
  const back = 30;
  const saw = { broadcast: false, classic: false, chase: false };
  const cheered = { broadcast: false, classic: false, chase: false };
  for (let i = 0; i < 500 && world.replayKind === "goal"; i++) {
    const cam = instantReplayCam();
    const on = instantReplayCrowdOn();
    const frame = Math.floor(world.replayT * 60);
    saw[cam] = true;
    // Chase stops on the frame before the whistle, so it never plays the cheer.
    const pastGoal = cam !== "chase" && frame >= back + pre[cam];
    assert.equal(on, pastGoal, `${cam} frame ${frame}`);
    if (on) cheered[cam] = true;
    stepSim(DT);
  }
  assert.equal(instantReplayCrowdOn(), null);
  assert.equal(saw.broadcast && saw.classic && saw.chase, true);
  assert.equal(cheered.broadcast, true);
  assert.equal(cheered.classic, true);
  assert.equal(cheered.chase, false);
});

function shootoutSheet() {
  pads = [];
  setInjectedKeys([]);
  const ui = useGame.getState();
  ui.setInstantReplay(true);
  ui.setClockMode("shootout");
  ui.setPowerPlay(false);
  ui.setChaos(false);
  ui.setOffsides(false);
  ui.setPlaying(true);
  ui.setPaused(false);
  ui.setHomeScore(0);
  ui.setAwayScore(0);
  resetWorld();
  ui.setPlaying(true);
  ui.setPaused(false);
}

function pinLiveAttempt(side) {
  const so = world.shootout;
  const shooter = world.skaters.find((s) => s.side === side && s.kind !== "goalie");
  const attempt = so.attempts[so.attempts.length - 1];
  attempt.side = side;
  attempt.result = null;
  so.phase = "live";
  so.t = 0;
  so.shooterId = shooter.id;
  so.startedAt = world.time;
  so.goalieTouch = false;
  so.goalieTouchAt = -1;
  so.backAlong = 0;
  world.userId = shooter.id;
  world.whistle = null;
  world.stoppage = false;
  world.stoppageT = 0;
  world.faceoff = false;
  world.periodOver = false;
  useGame.getState().setWhistle(null);
  useGame.getState().setPeriodOver(false);
  return shooter;
}

function fillLiveShootout() {
  const so = world.shootout;
  const shooter = world.skaters[so.shooterId];
  const side = so.attempts[so.attempts.length - 1].side;
  const attack = side === "home" ? world.homeAttack : -world.homeAttack;
  shooter.x = 0;
  shooter.z = 0;
  shooter.vx = 0;
  shooter.vz = 0;
  so.backAlong = 0;
  for (let i = 0; i < 180; i++) {
    for (const s of world.skaters) s.stun = 30;
    shooter.vx = 0;
    shooter.vz = 0;
    // A test pin must not look like the shooter retreated out of the attempt.
    const along = shooter.x * attack;
    if (along < so.backAlong) so.backAlong = along;
    world.puck.owner = shooter.id;
    world.puck.x = shooter.x + attack * 0.35;
    world.puck.z = shooter.z;
    world.puck.y = 0.05;
    world.puck.vx = 0;
    world.puck.vz = 0;
    world.puck.vy = 0;
    world.lastShoot = -10;
    world.lastShooter = null;
    world.lastPass = -10;
    world.lastPasser = null;
    world.goalieSaveT = -10;
    stepSim(DT);
    if (so.phase !== "live") break;
  }
}

function crossShootoutGoal() {
  const so = world.shootout;
  const attempt = so.attempts[so.attempts.length - 1];
  const attack = attempt.side === "home" ? world.homeAttack : -world.homeAttack;
  const mouth = attack * GOAL_LINE_X;
  world.puck.owner = null;
  world.puck.x = mouth - attack * 0.15;
  world.puck.y = 0.35;
  world.puck.z = 0;
  world.puck.vx = attack * 30;
  world.puck.vy = 0;
  world.puck.vz = 0;
  world.lastShooter = so.shooterId;
  world.lastShoot = world.time;
  world.lastPass = -10;
  world.goalieSaveT = -10;
  stepSim(DT);
}

function giveKeeperThePuck() {
  const so = world.shootout;
  const attempt = so.attempts[so.attempts.length - 1];
  const keeperSide = attempt.side === "home" ? "away" : "home";
  const keeper = world.skaters.find((s) => s.kind === "goalie" && s.side === keeperSide);
  world.lastShooter = so.shooterId;
  world.lastShoot = world.time - 0.4;
  world.lastPass = -10;
  world.goalieSaveT = -10;
  world.puck.owner = keeper.id;
  world.puck.x = keeper.x;
  world.puck.z = keeper.z;
  world.puck.y = 0.08;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
  stepSim(DT);
}

function playUntilReplayEnds() {
  let guard = 0;
  while (world.replayKind === "goal" && guard < 500) {
    assert.equal(instantReplayCam(), "broadcast");
    stepSim(DT);
    guard += 1;
  }
  assert.ok(guard < 500, "shootout replay did not finish");
  assert.equal(world.replayKind, null);
}

test("a shootout goal replays on the broadcast camera only, then the next attempt", () => {
  shootoutSheet();
  const shooter = pinLiveAttempt("home");
  fillLiveShootout();
  assert.equal(world.shootout.phase, "live", "attempt ended while filling the replay");
  crossShootoutGoal();
  assert.equal(world.shootout.attempts[0].result, "goal");
  assert.equal(world.whistle, "goal");
  assert.deepEqual([...instantReplayModes()], ["broadcast"]);
  assert.equal(world.replay, false);
  assert.equal(world.faceoff, false);
  let started = -1;
  for (let i = 0; i < 140 && started < 0; i++) {
    stepSim(DT);
    if (world.replayKind === "goal") started = i;
  }
  assert.ok(started >= 100 && started <= 130, `replay started on frame ${started}`);
  assert.equal(instantReplayCam(), "broadcast");
  const pose = instantReplayPose();
  assert.equal(pose.mode, "broadcast");
  assert.equal(pose.upY, 1);
  assert.equal(pose.fov, 44);
  assert.ok(pose.camY > 10);
  assert.equal(world.userId, shooter.id);
  assert.equal(useGame.getState().replay, false);
  assert.equal(useGame.getState().paused, false);
  const seen = new Set([instantReplayCam()]);
  let guard = 0;
  while (world.replayKind === "goal" && guard < 400) {
    const cam = instantReplayCam();
    seen.add(cam);
    assert.notEqual(cam, "chase");
    assert.notEqual(cam, "classic");
    stepSim(DT);
    guard += 1;
  }
  assert.deepEqual([...seen], ["broadcast"]);
  assert.equal(world.faceoff, false);
  assert.equal(world.whistle, null);
  assert.equal(world.periodOver, false);
  assert.equal(world.shootout.phase, "live");
  assert.equal(world.shootout.attempts.length, 2);
  assert.equal(world.shootout.attempts[0].result, "goal");
  assert.equal(world.shootout.attempts[1].result, null);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().awayScore, 0);
});

test("X during a shootout goal skips the broadcast replay and does not face off", () => {
  shootoutSheet();
  pinLiveAttempt("home");
  fillLiveShootout();
  crossShootoutGoal();
  assert.deepEqual([...instantReplayModes()], ["broadcast"]);
  edge("KeyF");
  assert.equal(world.replay, false);
  assert.equal(world.replayKind, null);
  assert.equal(world.faceoff, false);
  assert.equal(world.whistle, null);
  assert.equal(world.periodOver, false);
  assert.equal(instantReplayModes().length, 0);
  assert.equal(world.shootout.phase, "live");
  assert.equal(world.shootout.attempts[0].result, "goal");
  assert.equal(world.shootout.attempts.length, 2);
});

test("a shootout miss does not replay, and the off switch skips a shootout goal", () => {
  shootoutSheet();
  pinLiveAttempt("home");
  fillLiveShootout();
  giveKeeperThePuck();
  assert.equal(world.shootout.attempts[0].result, "save");
  assert.equal(world.whistle, null);
  assert.equal(instantReplayModes().length, 0);
  assert.equal(world.replay, false);
  frames(50);
  assert.equal(world.replayKind, null);
  assert.equal(instantReplayModes().length, 0);
  assert.notEqual(world.shootout.phase, "result");
  assert.equal(world.periodOver, false);

  shootoutSheet();
  useGame.getState().setInstantReplay(false);
  pinLiveAttempt("home");
  fillLiveShootout();
  crossShootoutGoal();
  assert.equal(world.shootout.attempts[0].result, "goal");
  assert.equal(instantReplayModes().length, 0);
  frames(40);
  assert.equal(world.replay, false);
  assert.equal(world.whistle, "goal");
  assert.equal(world.shootout.phase, "result");
  useGame.getState().setInstantReplay(true);
});

test("a shootout-winning save replays on broadcast, then the series ends", () => {
  shootoutSheet();
  const so = world.shootout;
  so.first = "away";
  so.attempts = [
    { side: "away", number: 9, result: "goal" },
    { side: "home", number: 8, result: "save" },
    { side: "away", number: 19, result: "goal" },
    { side: "home", number: 7, result: null },
  ];
  pinLiveAttempt("home");
  fillLiveShootout();
  assert.equal(world.shootout.phase, "live");
  giveKeeperThePuck();
  assert.equal(world.shootout.attempts[3].result, "save");
  assert.equal(world.whistle, null);
  assert.equal(world.periodOver, false);
  assert.deepEqual([...instantReplayModes()], ["broadcast"]);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().awayScore, 0);
  let started = -1;
  for (let i = 0; i < 150 && started < 0; i++) {
    assert.equal(world.whistle, null);
    stepSim(DT);
    if (world.replayKind === "goal") started = i;
  }
  assert.ok(started >= 100 && started <= 140, `save replay started on frame ${started}`);
  assert.equal(instantReplayCam(), "broadcast");
  assert.equal(instantReplayCrowdOn(), false);
  playUntilReplayEnds();
  assert.equal(world.faceoff, false);
  assert.equal(world.whistle, null);
  assert.equal(world.shootout.phase, "done");
  assert.equal(world.periodOver, true);
  assert.equal(useGame.getState().homeScore, 0);
  assert.equal(useGame.getState().awayScore, 1);
  assert.equal(instantReplayModes().length, 0);
  useGame.getState().setClockMode("game");
});

test("a series-winning shootout goal replays on broadcast, then the win", () => {
  shootoutSheet();
  const so = world.shootout;
  so.first = "home";
  so.attempts = [
    { side: "home", number: 8, result: "goal" },
    { side: "away", number: 9, result: "save" },
    { side: "home", number: 7, result: "goal" },
    { side: "away", number: 19, result: "goal" },
    { side: "home", number: 88, result: null },
  ];
  pinLiveAttempt("home");
  fillLiveShootout();
  crossShootoutGoal();
  assert.equal(world.shootout.attempts[4].result, "goal");
  assert.equal(world.whistle, "goal");
  assert.deepEqual([...instantReplayModes()], ["broadcast"]);
  assert.equal(world.periodOver, false);
  let started = -1;
  for (let i = 0; i < 150 && started < 0; i++) {
    stepSim(DT);
    if (world.replayKind === "goal") started = i;
  }
  assert.ok(started >= 100 && started <= 140, `winning goal replay started on frame ${started}`);
  const crowdAt = instantReplayCrowdOn();
  playUntilReplayEnds();
  assert.equal(crowdAt, false);
  assert.equal(world.faceoff, false);
  assert.equal(world.shootout.phase, "done");
  assert.equal(world.periodOver, true);
  assert.equal(useGame.getState().homeScore, 1);
  assert.equal(useGame.getState().awayScore, 0);
  assert.equal(world.whistle, null);
  useGame.getState().setClockMode("game");
  useGame.getState().setInstantReplay(true);
});

test("right stick during instant replay skips it and pauses, same as X then the stick", () => {
  sheet("game");
  fillBuffer();
  score();
  assert.equal(world.replay, false);
  edge("KeyF");
  assert.equal(world.faceoff, true);
  assert.equal(useGame.getState().paused, false);
  pressR3();
  const viaX = settled();
  assert.equal(viaX.paused, true);
  assert.equal(viaX.replay, false);
  assert.equal(viaX.faceoff, true);
  assert.equal(viaX.whistle, null);
  assert.equal(viaX.modes, 0);

  sheet("game");
  fillBuffer();
  score();
  frames(121);
  assert.equal(world.replayKind, "goal");
  assert.equal(useGame.getState().paused, false);
  pressR3();
  assert.deepEqual(settled(), viaX);
});
