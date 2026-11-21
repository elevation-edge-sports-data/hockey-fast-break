/**
 * Pause-replay range marks are export-only.
 * Two marks bound a download. A later mark replaces the nearer one,
 * or the earlier one when the distances match. Scrub and lock stay put.
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
const formations = await server.ssrLoadModule("/src/game/formationLibrary.ts");
const uniforms = await server.ssrLoadModule("/src/game/uniforms.ts");
const {
  resetWorld,
  stepSim,
  world,
  beginPauseReplay,
  stopPauseReplay,
  seekReplay,
  replayFootagePct,
  toggleReplayFrameLock,
  replayFrameLocked,
  exportReplayFrame,
  markReplayRange,
  exportReplayRange,
  replayRangeMarkPcts,
} = sim;
const { useGame } = store;
const { setInjectedKeys } = input;
const { parseFormationJson } = formations;
const { kitById } = uniforms;

const DT = 1 / 60;

function bootReplay() {
  useGame.getState().setClockMode("practice");
  useGame.getState().setPlaying(true);
  useGame.getState().setPaused(false);
  resetWorld();
  useGame.getState().setPlaying(true);
  useGame.getState().setPaused(false);
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.vx = 3;
  world.puck.vz = 0;
  setInjectedKeys([]);
  for (let i = 0; i < 40; i++) stepSim(DT);
  useGame.getState().setPaused(true);
  if (!beginPauseReplay()) throw new Error("replay did not start");
  world.replayPlaying = false;
  seekReplay(1);
  const maxT = world.replayT;
  const last = Math.floor(maxT * 60);
  assert.ok(last >= 8, `replay too short (${last})`);
  return { maxT, last };
}

function shownFrame() {
  return Math.max(0, Math.floor(world.replayT * 60));
}

function markFrame(frame, last, maxT) {
  if (frame <= 0) seekReplay(0);
  else if (frame >= last) seekReplay(1);
  else {
    world.replayT = Math.min(maxT, (frame + 0.5) / 60);
    for (let n = 0; shownFrame() !== frame && n < 12; n++) {
      world.replayT = Math.min(maxT, (frame + 0.05 * (n + 1)) / 60);
    }
  }
  assert.equal(shownFrame(), frame, `scrub showed ${shownFrame()} instead of ${frame}`);
  markReplayRange();
}

test("marks export the inclusive span and leave the scrubber free", () => {
  assert.equal(exportReplayRange(), null);
  markReplayRange();
  assert.equal(exportReplayRange(), null);

  const { maxT, last } = bootReplay();
  try {
    assert.equal(exportReplayRange(), null);
    assert.equal(replayRangeMarkPcts().length, 0);
    const empty = replayRangeMarkPcts();
    assert.equal(replayRangeMarkPcts(), empty);

    markFrame(0, last, maxT);
    assert.equal(exportReplayRange(), null);
    assert.equal(replayRangeMarkPcts().length, 1);
    assert.notEqual(replayRangeMarkPcts(), empty);

    markFrame(0, last, maxT);
    const same = exportReplayRange();
    assert.equal(same.length, 1);
    assert.equal(same[0].frame, 0);
    assert.equal(same[0].time, 0);
    assert.deepEqual(same[0].original, same[0].adjusted);

    stopPauseReplay();
    const span = bootReplay();
    markFrame(2, span.last, span.maxT);
    markFrame(5, span.last, span.maxT);
    let range = exportReplayRange();
    assert.deepEqual(
      range.map((frame) => frame.frame),
      [2, 3, 4, 5],
    );
    for (const [i, frame] of range.entries()) {
      assert.equal(frame.time, frame.frame / 60);
      assert.deepEqual(frame.original, frame.adjusted);
      assert.ok(frame.original.players.length > 0);
      const keys = ["adjusted", "frame", "original", "time", "userId"];
      if (i === 0) keys.push("settings");
      assert.deepEqual(Object.keys(frame).sort(), keys.sort());
      assert.equal(frame.userId, world.userId);
      assert.ok(frame.original.players.some((p) => p.id === frame.userId));
      assert.deepEqual(Object.keys(frame.original.puck).sort(), ["owner", "x", "y", "z"]);
      for (const side of [frame.original, frame.adjusted]) {
        assert.deepEqual(Object.keys(side.players[0]).sort(), ["id", "index", "kind", "number", "side", "x", "yaw", "z"]);
        for (const player of side.players) {
          const live = world.skaters[player.index];
          assert.equal(player.side, live.side);
          assert.equal(player.kind, live.kind);
          assert.equal(player.number, live.number);
        }
      }
    }
    const stamped = range[0].original.players[0];
    const live0 = world.skaters[stamped.index];
    const keep = { number: live0.number, kind: live0.kind, side: live0.side };
    live0.number = 99;
    live0.kind = live0.kind === "winger" ? "defense" : "winger";
    live0.side = live0.side === "home" ? "away" : "home";
    const reread = exportReplayRange();
    assert.equal(reread[0].original.players[0].number, stamped.number);
    assert.equal(reread[0].original.players[0].kind, stamped.kind);
    assert.equal(reread[0].original.players[0].side, stamped.side);
    assert.equal(reread[0].adjusted.players[0].number, range[0].adjusted.players[0].number);
    live0.number = keep.number;
    live0.kind = keep.kind;
    live0.side = keep.side;

    stopPauseReplay();
    const flipped = bootReplay();
    markFrame(5, flipped.last, flipped.maxT);
    markFrame(2, flipped.last, flipped.maxT);
    range = exportReplayRange();
    assert.deepEqual(
      range.map((frame) => frame.frame),
      [2, 3, 4, 5],
    );

    const held = exportReplayRange();
    seekReplay(0);
    assert.equal(replayFootagePct(), 0);
    world.replayPlaying = true;
    stepSim(DT);
    stepSim(DT);
    assert.ok(world.replayT > 0);
    seekReplay(1);
    assert.equal(replayFootagePct(), 1);
    assert.deepEqual(exportReplayRange(), held);

    stopPauseReplay();
    const wide = bootReplay();
    markFrame(0, wide.last, wide.maxT);
    markFrame(wide.last, wide.last, wide.maxT);
    const full = exportReplayRange();
    assert.equal(full[0].frame, 0);
    assert.equal(full[full.length - 1].frame, wide.last);
    assert.equal(full.length, wide.last + 1);
    assert.notEqual(full[0].original.puck.x, full[full.length - 1].original.puck.x);
    const pcts = replayRangeMarkPcts();
    assert.equal(pcts.length, 2);
    assert.equal(pcts[0], 0);
    assert.ok(Math.abs(pcts[1] - wide.last / Math.round(wide.maxT * 60)) < 1e-9);

    const shotT = world.replayT;
    assert.equal(toggleReplayFrameLock(), true);
    const shot = exportReplayFrame();
    assert.equal(shot.frame, Math.floor(shotT * 60));
    assert.equal(shot.userId, full[shot.frame].userId);
    assert.deepEqual(Object.keys(shot).sort(), Object.keys(full[0]).sort());
    assert.deepEqual(Object.keys(shot.adjusted.players[0]).sort(), ["id", "index", "kind", "number", "side", "x", "yaw", "z"]);
    const shotLive = world.skaters[shot.adjusted.players[0].index];
    assert.equal(shot.adjusted.players[0].side, shotLive.side);
    assert.equal(shot.adjusted.players[0].kind, shotLive.kind);
    assert.equal(shot.adjusted.players[0].number, shotLive.number);
    assert.equal(shot.original.players[0].number, shot.adjusted.players[0].number);
    seekReplay(0);
    assert.equal(world.replayT, shotT);
    assert.deepEqual(exportReplayRange(), full);
    assert.equal(toggleReplayFrameLock(), false);
    assert.equal(exportReplayFrame(), null);
    assert.equal(replayFrameLocked(), false);
    assert.deepEqual(exportReplayRange(), full);
  } finally {
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
    setInjectedKeys([]);
  }
});

test("a later mark replaces the nearer mark, or the older one on a tie", () => {
  const { maxT, last } = bootReplay();
  try {
    markFrame(0, last, maxT);
    markFrame(last, last, maxT);
    markFrame(last - 1, last, maxT);
    let range = exportReplayRange();
    assert.equal(range[0].frame, 0);
    assert.equal(range[range.length - 1].frame, last - 1);

    markFrame(1, last, maxT);
    range = exportReplayRange();
    assert.equal(range[0].frame, 1);
    assert.equal(range[range.length - 1].frame, last - 1);

    stopPauseReplay();
    const again = bootReplay();
    markFrame(0, again.last, again.maxT);
    markFrame(8, again.last, again.maxT);
    markFrame(4, again.last, again.maxT);
    range = exportReplayRange();
    assert.deepEqual(
      range.map((frame) => frame.frame),
      [4, 5, 6, 7, 8],
    );
  } finally {
    stopPauseReplay();
    setInjectedKeys([]);
  }
});

test("leaving replay clears the marks", () => {
  const { maxT, last } = bootReplay();
  try {
    markFrame(0, last, maxT);
    markFrame(last, last, maxT);
    assert.ok(exportReplayRange().length > 1);
  } finally {
    stopPauseReplay();
  }
  assert.equal(exportReplayRange(), null);
  assert.deepEqual([...replayRangeMarkPcts()], []);
  const next = bootReplay();
  try {
    assert.equal(replayRangeMarkPcts().length, 0);
    assert.equal(exportReplayRange(), null);
    assert.ok(next.last >= 8);
  } finally {
    stopPauseReplay();
  }
});

test("a downloaded replay keeps one settings snapshot from the start of the clip", () => {
  const ui = useGame.getState();
  ui.setClockMode("practice");
  ui.setHomeLineup({ g: 0, d: 1, o: 1 });
  ui.setAwayLineup({ g: 1, d: 0, o: 1 });
  ui.setHomeKit(0);
  ui.setAwayKit(2);
  ui.setFriction(0.2);
  ui.setCapLengthClearVy(false);
  ui.setHoldLobInFront(true);
  ui.setSauceBoardClamp(false);
  ui.setShowRefs(false);
  ui.setInstantReplay(false);
  ui.setUserOffense(1.2);
  ui.setCpuOffense(2);
  ui.setPlaying(true);
  ui.setPaused(false);
  resetWorld();
  ui.setPlaying(true);
  ui.setPaused(false);
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.puck.owner = null;
  world.puck.vx = 3;
  world.puck.vz = 0;
  setInjectedKeys([]);
  for (let i = 0; i < 20; i++) stepSim(DT);
  ui.setPaused(true);
  try {
    assert.equal(beginPauseReplay(), true);
    world.replayPlaying = false;
    const maxT = world.replayT;
    const last = Math.floor(maxT * 60);
    markFrame(0, last, maxT);
    markFrame(last, last, maxT);
    const full = exportReplayRange();
    assert.ok(full.length > 8);
    const settings = full[0].settings;
    assert.ok(settings);
    assert.equal(
      full.slice(1).some((frame) => Object.prototype.hasOwnProperty.call(frame, "settings")),
      false,
    );
    assert.deepEqual(Object.keys(settings).sort(), [
      "checkedPass",
      "clamps",
      "cover",
      "friction",
      "iceDrag",
      "instantReplay",
      "kits",
      "lineup",
      "mode",
      "multipliers",
      "pass",
      "sauce",
      "shot",
      "showRefs",
    ]);
    assert.equal(settings.mode, "practice");
    assert.equal(settings.friction, 0.2);
    assert.equal(settings.iceDrag, 0.85);
    assert.deepEqual(settings.clamps, {
      capLengthClearVy: false,
      holdLobInFront: true,
      sauceBoardClamp: false,
    });
    assert.equal(settings.showRefs, false);
    assert.equal(settings.instantReplay, false);
    assert.deepEqual(settings.lineup, {
      home: { g: 0, d: 1, o: 1 },
      away: { g: 1, d: 0, o: 1 },
    });
    const home = kitById(0);
    const away = kitById(2);
    assert.equal(settings.kits.home.id, 0);
    assert.equal(settings.kits.away.id, 2);
    assert.equal(settings.kits.home.jersey, home.jersey);
    assert.equal(settings.kits.home.helmet, home.helmet);
    assert.equal(settings.kits.home.pants, home.pants);
    assert.equal(settings.kits.home.stripe, home.pantStripe ?? home.stripe);
    assert.equal(settings.kits.away.jersey, away.jersey);
    assert.equal(settings.kits.away.yoke, away.yoke);
    assert.equal(settings.kits.away.sleeves, away.sleeves);
    assert.equal(settings.pass.hold, 1.5);
    assert.equal(settings.pass.mphPerMps, 2.23694);
    assert.deepEqual(settings.pass.skater, { tapMph: 55, fullMph: 95 });
    assert.deepEqual(settings.pass.goalie, { tapMph: 45, fullMph: 85 });
    assert.equal(settings.shot.hold, 1.5);
    assert.deepEqual(settings.shot.skater, { tapMph: 73, fullMph: 105 });
    assert.deepEqual(settings.shot.goalie, { tapMph: 55, fullMph: 87 });
    assert.deepEqual(settings.shot.backhand, { loMph: 58, hiMph: 68 });
    assert.deepEqual(settings.shot.speedAdd, { perMps: 0.08, capMph: 1.6 });
    assert.equal(settings.sauce.fullHold, 1);
    assert.equal(settings.sauce.clearChargeAt, 0.9);
    assert.equal(settings.sauce.lowY, 0.38);
    assert.equal(settings.sauce.crowdAt, 0.8);
    assert.equal(settings.sauce.crowdP, 0.2);
    assert.equal(settings.sauce.fallS, 1);
    assert.equal(settings.sauce.moderateAt, 0.35);
    assert.equal(settings.sauce.plateauPassAt, 0.5);
    assert.equal(settings.sauce.plateauFullS, 0.5);
    assert.equal(settings.sauce.grav, 46);
    assert.equal(settings.sauce.boardClampBelowWall, 0.28);
    assert.equal(settings.sauce.landKeepLoss, 0.62);
    assert.deepEqual(settings.cover, { hold: 2, goalieReleaseExtra: 2, goalieHold: 0.5 });
    assert.deepEqual(settings.checkedPass, { before: 0.32, start: 0.2, scale: 0.5 });
    const userOff = useGame.getState().userOffense;
    const cpuOff = useGame.getState().cpuOffense;
    assert.equal(settings.multipliers.user.offense, userOff);
    assert.equal(settings.multipliers.cpu.offense, cpuOff);
    assert.ok(Math.abs(settings.multipliers.user.offenseMul - (0.55 + Math.min(1.2, userOff) * 0.9)) < 1e-9);
    assert.ok(Math.abs(settings.multipliers.cpu.offenseMul - (0.55 + Math.min(2, cpuOff * 0.5) * 0.9)) < 1e-9);

    const parsed = parseFormationJson(JSON.stringify(full));
    assert.ok(Array.isArray(parsed), parsed);
    assert.equal(parsed.length, full.length);
    assert.equal(parsed[0].frame, full[0].frame);
    assert.equal(parsed[0].settings, undefined);
    assert.equal(parsed[0].original.players.length, full[0].original.players.length);

    ui.setFriction(0.9);
    ui.setCapLengthClearVy(true);
    ui.setShowRefs(true);
    ui.setInstantReplay(true);
    ui.setHomeKit(4);
    ui.setAwayKit(6);
    ui.setUserOffense(0);
    const held = exportReplayRange();
    assert.deepEqual(held[0].settings, settings);
    assert.equal(held[0].settings.kits.home.id, 0);
    assert.equal(held[0].settings.friction, 0.2);

    seekReplay(1);
    assert.equal(toggleReplayFrameLock(), true);
    const shot = exportReplayFrame();
    assert.equal(shot.settings.friction, 0.2);
    assert.equal(shot.settings.kits.away.id, 2);
    assert.equal(shot.settings.showRefs, false);
    assert.equal(toggleReplayFrameLock(), false);

    const head = full.length;
    stopPauseReplay();
    ui.setPaused(false);
    ui.setFriction(0.8);
    ui.setCapLengthClearVy(true);
    world.faceoff = false;
    world.faceoffPhase = "live";
    world.stoppage = false;
    world.whistle = null;
    world.puck.vx = 4;
    for (let i = 0; i < 16; i++) stepSim(DT);
    ui.setPaused(true);
    assert.equal(beginPauseReplay(), true);
    world.replayPlaying = false;
    const tailMax = world.replayT;
    const tailLast = Math.floor(tailMax * 60);
    assert.ok(tailLast > head);
    markFrame(head, tailLast, tailMax);
    markFrame(tailLast, tailLast, tailMax);
    const tail = exportReplayRange();
    assert.ok(tail.length > 1);
    assert.equal(tail[0].settings.friction, 0.8);
    assert.equal(tail[0].settings.clamps.capLengthClearVy, true);
    assert.equal(tail[0].settings.kits.home.id, 4);
    assert.equal(
      tail.slice(1).some((frame) => Object.prototype.hasOwnProperty.call(frame, "settings")),
      false,
    );
    markFrame(0, tailLast, tailMax);
    markFrame(head - 1, tailLast, tailMax);
    const opening = exportReplayRange();
    assert.equal(opening[0].frame, 0);
    assert.deepEqual(opening[0].settings, settings);
  } finally {
    if (replayFrameLocked()) toggleReplayFrameLock();
    stopPauseReplay();
    setInjectedKeys([]);
    useGame.getState().setPaused(false);
  }
});
