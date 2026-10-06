/**
 * Headless check for the goalie play-puck pose.
 * No browser in this session: a Vite SSR load runs the real stance math and one sim step.
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

const THREE = await server.ssrLoadModule("three");
const stance = await server.ssrLoadModule("/src/game/goalieStance.ts");
const sim = await server.ssrLoadModule("/src/game/sim.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");
const rink = await server.ssrLoadModule("/src/game/rink.ts");

const { GOALIE_Z, GOALIE_SOCKET_X, GOALIE_SOCKET_Y, poseGoaliePlay, poseGoalieZLimbs } = stance;
const { goaliePlaysPuck, goalieShotSave, goalieZKind, resetWorld, stepSim, world } = sim;
const { useGame } = store;
const { GOAL_LINE_X, GOAL_W } = rink;

function basis(root) {
  root.updateWorldMatrix(true, true);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
  fwd.y = 0;
  fwd.normalize();
  const catcher = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
  const origin = new THREE.Vector3();
  root.getWorldPosition(origin);
  return { fwd, catcher, origin };
}

function puckAt(root, fwdDist, latDist) {
  const { fwd, catcher, origin } = basis(root);
  return {
    fwd,
    x: origin.x + fwd.x * fwdDist + catcher.x * latDist,
    z: origin.z + fwd.z * fwdDist + catcher.z * latDist,
  };
}

function padFrontOf(root, shin) {
  const { fwd, origin } = basis(root);
  const pad = shin.getObjectByName("goalieShinPad");
  const geo = pad.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  let front = -Infinity;
  const c = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    c.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
    pad.localToWorld(c);
    const along = (c.x - origin.x) * fwd.x + (c.z - origin.z) * fwd.z;
    if (along > front) front = along;
  }
  return front;
}

function stickLow(stick) {
  let best = Infinity;
  stick.updateWorldMatrix(true, true);
  stick.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const geo = obj.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const c = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
      obj.localToWorld(c);
      if (c.y < best) best = c.y;
    }
  });
  return best;
}

function buildGoalie(yaw) {
  const root = new THREE.Group();
  root.scale.set(1.14, 1, 1.14);
  root.rotation.y = yaw;
  root.position.set(12, 0, -6);
  const body = new THREE.Group();
  root.add(body);
  const leg = (side, name) => {
    const g = new THREE.Group();
    const shin = new THREE.Group();
    shin.name = name;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.44, 0.12));
    pad.name = "goalieShinPad";
    pad.position.set(side * 0.04, -0.22, 0.08);
    shin.add(pad);
    const boot = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.28));
    blade.name = "goalieSkateBlade";
    boot.add(blade);
    shin.add(boot);
    g.add(shin);
    body.add(g);
    return { g, shin, boot };
  };
  const l = leg(-1, "goalieStickPad");
  const r = leg(1, "goalieGlovePad");
  const arm = () => {
    const g = new THREE.Group();
    const fore = new THREE.Group();
    fore.position.set(0, -0.28, 0.02);
    g.add(fore);
    body.add(g);
    return { g, fore };
  };
  const blocker = arm();
  const glove = arm();
  const board = new THREE.Group();
  board.name = "goalieBlocker";
  board.position.set(0, -0.28, 0.03);
  board.add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.36, 0.18)));
  blocker.fore.add(board);
  const stick = new THREE.Group();
  stick.position.set(0.03, -0.22, 0.05);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.026, 0.036));
  knob.name = "goalieKnob";
  const shaft = new THREE.Group();
  shaft.name = "goalieShaft";
  shaft.add(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.014, 1, 8)));
  const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.04));
  paddle.position.set(0, -0.21, 0);
  paddle.scale.set(1, 0.58, 1);
  shaft.add(paddle);
  const blade = new THREE.Group();
  blade.name = "goalieBlade";
  const ice = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.032, 0.26));
  ice.name = "goalieIce";
  ice.position.set(0, 0.016, 0.13);
  blade.add(ice);
  stick.add(knob, shaft, blade);
  blocker.fore.add(stick);
  poseGoalieZLimbs(root, body, l.g, r.g, l.shin, r.shin, l.boot, r.boot, GOALIE_Z.perimeter, 0);
  return {
    root,
    body,
    ...{
      lLeg: l.g,
      rLeg: r.g,
      lShin: l.shin,
      rShin: r.shin,
      lBoot: l.boot,
      rBoot: r.boot,
      lArm: blocker.g,
      lFore: blocker.fore,
      rArm: glove.g,
      rFore: glove.fore,
      stick,
      board,
    },
  };
}

const palmAxis = new THREE.Vector3(0, 0, 1)
  .applyEuler(new THREE.Euler(0.1, 0.16, 0.22))
  .normalize();
const boardAxis = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0.12, 0, 0)).normalize();

function play(rig, fwdDist, latDist) {
  const front = Math.max(padFrontOf(rig.root, rig.lShin), padFrontOf(rig.root, rig.rShin));
  const spot = puckAt(rig.root, fwdDist, latDist);
  poseGoaliePlay(
    rig.lArm,
    rig.lFore,
    rig.rArm,
    rig.rFore,
    rig.stick,
    spot.x,
    spot.z,
    front,
    palmAxis,
    boardAxis,
  );
  return { front, spot };
}

function assertPerimeterBody(rig) {
  assert.ok(Math.abs(rig.body.rotation.x - GOALIE_Z.perimeter.torso) < 1e-6);
  assert.ok(Math.abs(rig.body.rotation.x - GOALIE_Z.mid.torso) > 0.2);
  assert.ok(Math.abs(rig.body.rotation.x - GOALIE_Z.butterfly.torso) > 0.3);
  for (const leg of [rig.lLeg, rig.rLeg]) {
    const side = leg === rig.lLeg ? -1 : 1;
    assert.ok(Math.abs(leg.position.x - side * GOALIE_SOCKET_X) < 1e-6);
    assert.ok(Math.abs(leg.position.y - GOALIE_SOCKET_Y) < 1e-6);
    assert.ok(Math.abs(leg.position.z) < 1e-6);
  }
  for (const [leg, shin, boot] of [
    [rig.lLeg, rig.lShin, rig.lBoot],
    [rig.rLeg, rig.rShin, rig.rBoot],
  ]) {
    const hip = new THREE.Vector3();
    const knee = new THREE.Vector3();
    const ankle = new THREE.Vector3();
    leg.getWorldPosition(hip);
    shin.getWorldPosition(knee);
    boot.getWorldPosition(ankle);
    rig.root.worldToLocal(hip);
    rig.root.worldToLocal(knee);
    rig.root.worldToLocal(ankle);
    const lead = knee.z - hip.z;
    assert.ok(lead > 0.14 && lead < 0.22, `knee lead ${lead.toFixed(3)} is not the perimeter Z`);
    assert.ok(ankle.z < knee.z - 0.04, "shin should lean forward, ankle behind the knee");
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
      boot.getWorldQuaternion(new THREE.Quaternion()),
    );
    assert.ok(up.y > 0.95, `skate up ${up.y.toFixed(3)}`);
  }
}

function assertHands(rig) {
  const origin = new THREE.Vector3();
  const heel = new THREE.Vector3();
  rig.stick.getWorldPosition(origin);
  rig.stick.getObjectByName("goalieBlade").getWorldPosition(heel);
  const shaft = heel.clone().sub(origin);
  const len = shaft.length();
  assert.ok(len > 0.4, `shaft ${len.toFixed(3)}`);
  const along = (point) => point.clone().sub(origin).dot(shaft) / len;
  const miss = (point) => {
    const t = point.clone().sub(origin).dot(shaft) / (len * len);
    return origin.clone().addScaledVector(shaft, t).distanceTo(point);
  };
  const blocker = new THREE.Vector3(0.03, -0.22, 0.05);
  rig.lFore.localToWorld(blocker);
  assert.ok(
    blocker.distanceTo(origin) < 0.025,
    `blocker off the stick origin ${blocker.distanceTo(origin).toFixed(3)}`,
  );
  const glove = new THREE.Vector3(0.02, -0.32, 0.02);
  rig.rFore.localToWorld(glove);
  const gap = along(glove) - along(blocker);
  assert.ok(miss(glove) < 0.05, `glove off the shaft by ${miss(glove).toFixed(3)}`);
  assert.ok(gap >= 0.12, `glove is only ${gap.toFixed(3)} m down the shaft`);
  assert.ok(along(glove) < len - 0.02, "glove should stay on the shaft, short of the heel");
  const pocket = new THREE.Vector3();
  rig.rFore.localToWorld(pocket.set(0.02, -0.32, 0.02));
  rig.body.worldToLocal(pocket);
  const catcher = new THREE.Vector3(0.38, 1.18, 0.26);
  assert.ok(
    pocket.distanceTo(catcher) > 0.12,
    `glove still in the catcher set (${pocket.x.toFixed(2)}, ${pocket.y.toFixed(2)}, ${pocket.z.toFixed(2)})`,
  );
  const bone = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(rig.rFore.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  const palm = palmAxis
    .clone()
    .applyQuaternion(rig.rFore.getWorldQuaternion(new THREE.Quaternion()));
  palm.addScaledVector(bone, -palm.dot(bone)).normalize();
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(bone, -bone.y).normalize();
  const { fwd } = basis(rig.root);
  const fwdFlat = fwd.clone().addScaledVector(bone, -fwd.dot(bone)).normalize();
  assert.ok(palm.dot(up) > 0.75, `palm up ${palm.dot(up).toFixed(3)}`);
  assert.ok(
    palm.dot(fwdFlat) < palm.dot(up) - 0.25,
    "palm should sit on the shaft, not face the shooter",
  );
  const bq = rig.board.getWorldQuaternion(new THREE.Quaternion());
  const by = new THREE.Vector3(0, 1, 0).applyQuaternion(bq);
  const bx = new THREE.Vector3(1, 0, 0).applyQuaternion(bq);
  const sy = new THREE.Vector3(0, 1, 0).applyQuaternion(
    rig.stick.getWorldQuaternion(new THREE.Quaternion()),
  );
  assert.ok(by.dot(sy) > 0.9, `blocker long axis ${by.dot(sy).toFixed(3)}`);
  assert.ok(
    bx.clone().setY(0).normalize().dot(fwd) > 0.75,
    `blocker face ${bx.dot(fwd).toFixed(3)}`,
  );
}

function assertIceOn(rig, x, z, front) {
  assertPerimeterBody(rig);
  assertHands(rig);
  const ice = new THREE.Vector3();
  rig.stick.getObjectByName("goalieIce").getWorldPosition(ice);
  const miss = Math.hypot(ice.x - x, ice.z - z);
  assert.ok(miss < 0.08, `ice missed (${x.toFixed(2)}, ${z.toFixed(2)}) by ${miss.toFixed(3)}`);
  assert.ok(ice.y > 0.02 && ice.y < 0.09, `ice y ${ice.y.toFixed(3)}`);
  const { fwd, origin } = basis(rig.root);
  const iceFwd = (ice.x - origin.x) * fwd.x + (ice.z - origin.z) * fwd.z;
  assert.ok(
    iceFwd > front + 0.12,
    `ice ${iceFwd.toFixed(3)} is not in front of the pads ${front.toFixed(3)}`,
  );
  const low = stickLow(rig.stick);
  // Root scale (1.14, 1, 1.14) shears a flat blade, so a corner sits a few millimeters under the center.
  assert.ok(low > 0.015, `stick dug in at ${low.toFixed(3)}`);
}

test("play pose keeps the perimeter body and puts both hands on the stick", () => {
  // Root sits at (12, 0, −6). These puck points are world literals.
  // ry = π/2: local +Z is world +X. up × that forward is world −Z, the catcher.
  // ry = π/2+π: local +Z is world −X. up × that forward is world +Z, the catcher.
  const cases = [
    {
      yaw: Math.PI / 2,
      worldFwd: new THREE.Vector3(1, 0, 0),
      catcherSide: [12 + 0.9, -6 - 0.4],
      blockerSide: [12 + 0.85, -6 + 0.35],
    },
    {
      yaw: Math.PI / 2 + Math.PI,
      worldFwd: new THREE.Vector3(-1, 0, 0),
      catcherSide: [12 - 0.9, -6 + 0.4],
      blockerSide: [12 - 0.85, -6 - 0.35],
    },
  ];
  for (const row of cases) {
    const rig = buildGoalie(row.yaw);
    const { fwd } = basis(rig.root);
    assert.ok(
      fwd.dot(row.worldFwd) > 0.99,
      `root forward ${fwd.x.toFixed(3)}, ${fwd.z.toFixed(3)}`,
    );
    for (const [x, z] of [row.catcherSide, row.blockerSide]) {
      const front = Math.max(padFrontOf(rig.root, rig.lShin), padFrontOf(rig.root, rig.rShin));
      poseGoaliePlay(
        rig.lArm,
        rig.lFore,
        rig.rArm,
        rig.rFore,
        rig.stick,
        x,
        z,
        front,
        palmAxis,
        boardAxis,
      );
      assertIceOn(rig, x, z, front);
    }
  }
});

test("a puck behind the pads or past reach still plants the blade in front", () => {
  const rig = buildGoalie(Math.PI / 2);
  const behind = play(rig, -0.4, -0.2);
  assertPerimeterBody(rig);
  assertHands(rig);
  const ice = new THREE.Vector3();
  rig.stick.getObjectByName("goalieIce").getWorldPosition(ice);
  const { fwd, origin } = basis(rig.root);
  const iceFwd = (ice.x - origin.x) * fwd.x + (ice.z - origin.z) * fwd.z;
  assert.ok(iceFwd > behind.front + 0.12);
  assert.ok(Math.hypot(ice.x - behind.spot.x, ice.z - behind.spot.z) > 0.3);

  const far = buildGoalie(Math.PI / 2);
  const held = play(far, 1.05, 0);
  const iceHold = new THREE.Vector3();
  far.stick.getObjectByName("goalieIce").getWorldPosition(iceHold);
  assert.ok(Math.hypot(iceHold.x - held.spot.x, iceHold.z - held.spot.z) < 0.08);
  assertHands(far);
});

function live() {
  useGame.setState({ playing: true, paused: false, offsides: false });
  resetWorld();
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.stoppage = false;
  world.whistle = null;
  world.goalieShot = null;
  world.reboundN = 0;
  world.goalieSaveT = -10;
  world.lastShooter = null;
  world.lastPass = -10;
  world.lastShoot = -10;
  world.lastShotCorner = false;
  world.puck.owner = null;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vy = 0;
  world.puck.vz = 0;
  useGame.getState().setWhistle(null);
  useGame.getState().setGoalSide(null);
}

function goalie(side) {
  const s = world.skaters.find((sk) => sk.kind === "goalie" && sk.side === side);
  assert.ok(s, side);
  return s;
}

function parkExcept(id) {
  for (const s of world.skaters) {
    if (s.id === id) continue;
    s.x = 0;
    s.z = (s.id % 2 === 0 ? 1 : -1) * (6 + s.id * 0.4);
    s.vx = 0;
    s.vz = 0;
  }
}

function calmSkaters() {
  for (const s of world.skaters) {
    s.dive = 0;
    s.tumble = 0;
    s.celebrate = 0;
    s.gloveFlash = 0;
    s.coverPose = 0;
    s.stun = 0;
    s.struck = 0;
    s.vx = 0;
    s.vz = 0;
  }
}

test("play pose is only the loose-puck handling, not a save", () => {
  live();
  const away = goalie("away");
  const home = goalie("home");
  const mouth = GOAL_LINE_X;
  away.x = mouth - 0.9;
  away.z = 0;
  world.puck.x = mouth - 3.1;
  world.puck.z = 0.4;
  world.puck.y = 0.042;
  parkExcept(away.id);
  assert.equal(goaliePlaysPuck(away), false);
  stepSim(1 / 60);
  assert.notEqual(world.puck.owner, away.id);
  assert.equal(goaliePlaysPuck(away), true);
  assert.equal(goalieZKind(away), "butterfly");

  const shooter = world.skaters.find((s) => s.side === "home" && s.kind !== "goalie");
  world.lastShooter = shooter.id;
  world.lastShoot = world.time;
  world.lastPass = -10;
  world.puck.vx = 12;
  world.puck.vz = 0;
  assert.equal(goalieShotSave(away), true);
  assert.equal(goaliePlaysPuck(away), false);

  world.puck.vx = 0;
  world.puck.vz = 0;
  world.lastShooter = null;
  world.reboundN = 1;
  world.goalieSaveT = world.time;
  assert.equal(goaliePlaysPuck(away), false);
  world.goalieSaveT = world.time - 3;
  assert.equal(goaliePlaysPuck(away), true);
  world.reboundN = 0;

  world.puck.owner = away.id;
  world.reboundN = 1;
  world.goalieSaveT = world.time;
  away.coverPose = 0;
  away.gloveFlash = 0;
  assert.equal(goaliePlaysPuck(away), true);
  away.coverPose = 0.2;
  assert.equal(goaliePlaysPuck(away), false);
  away.coverPose = 0;
  away.gloveFlash = 0.3;
  assert.equal(goaliePlaysPuck(away), false);
  away.gloveFlash = 0;
  world.goalieShot = "out";
  assert.equal(goaliePlaysPuck(away), false);
  world.goalieShot = null;
  world.faceoff = true;
  assert.equal(goaliePlaysPuck(away), false);
  world.faceoff = false;
  world.stoppage = true;
  assert.equal(goaliePlaysPuck(away), false);
  world.stoppage = false;
  away.dive = 0.2;
  assert.equal(goaliePlaysPuck(away), false);
  away.dive = 0;
  world.puck.owner = null;
  world.reboundN = 0;
  world.goalieSaveT = -10;

  const homeMouth = -GOAL_LINE_X;
  world.userId = home.id;
  home.x = homeMouth + 1.1;
  home.z = 0;
  home.vx = 3;
  home.vz = 0;
  home.coverPose = 0;
  home.gloveFlash = 0;
  home.dive = 0;
  world.puck.x = homeMouth + 3.4;
  world.puck.z = 0;
  world.puck.y = 0.042;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.owner = null;
  assert.equal(goaliePlaysPuck(home), true);
  world.lastShooter = shooter.id;
  world.lastShoot = world.time;
  world.lastPass = -10;
  world.puck.vx = -12;
  assert.equal(goalieShotSave(home), true);
  assert.equal(goaliePlaysPuck(home), false);
  world.puck.vx = 0;
  world.lastShooter = null;
  home.vx = 0;
  home.vz = 0;
  home.x = homeMouth + 2.5;
  world.puck.x = homeMouth + 4.4;
  assert.equal(goaliePlaysPuck(home), true);
  home.x = homeMouth + 0.7;
  assert.equal(goaliePlaysPuck(home), false);

  calmSkaters();
  world.stoppage = false;
  world.whistle = null;
  world.faceoff = false;
  world.goalSide = null;
  world.goalTicker = 0;
  world.periodOver = false;
  world.goalieShot = null;
  world.reboundN = 0;
  world.goalieSaveT = -10;
  world.lastShotCorner = false;
  world.puck.owner = null;
  useGame.getState().setWhistle(null);
  useGame.getState().setGoalSide(null);
  useGame.getState().setPeriodOver(false);
  const hw = GOAL_W / 2;
  away.x = mouth - 0.9;
  away.z = 0;
  parkExcept(away.id);
  world.userId = home.id;
  home.x = 0;
  home.z = 8;
  world.lastShooter = shooter.id;
  world.lastShoot = world.time;
  world.lastPass = -10;
  world.puck.x = mouth - 0.55;
  world.puck.z = hw;
  world.puck.y = 0.2;
  world.puck.vx = 40;
  world.puck.vz = 0;
  world.puck.vy = 0;
  stepSim(1 / 60);
  calmSkaters();
  world.stoppage = false;
  world.whistle = null;
  world.faceoff = false;
  world.goalSide = null;
  world.goalTicker = 0;
  world.periodOver = false;
  world.goalieShot = null;
  world.reboundN = 0;
  world.goalieSaveT = -10;
  world.lastShooter = null;
  world.puck.owner = null;
  world.puck.y = 0.042;
  world.puck.vy = 0;
  useGame.getState().setWhistle(null);
  useGame.getState().setGoalSide(null);
  useGame.getState().setPeriodOver(false);
  away.x = mouth - 0.9;
  away.z = 0;
  world.puck.x = mouth - 3.1;
  world.puck.z = 0.4;
  world.puck.vx = 0;
  world.puck.vz = 0;
  parkExcept(away.id);
  stepSim(1 / 60);
  assert.notEqual(world.puck.owner, away.id);
  assert.equal(goaliePlaysPuck(away), false, "iron window should keep the save pose");
  world.time += 3;
  away.x = mouth - 0.9;
  away.z = 0;
  away.vx = 0;
  away.vz = 0;
  world.puck.x = mouth - 3.1;
  world.puck.z = 0.4;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.owner = null;
  world.reboundN = 0;
  world.goalieSaveT = -10;
  world.goalieShot = null;
  world.lastShooter = null;
  parkExcept(away.id);
  stepSim(1 / 60);
  assert.equal(goaliePlaysPuck(away), true);
});
