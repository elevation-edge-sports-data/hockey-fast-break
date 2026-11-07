/**
 * Replay viewer camera modes use the live CameraRig poses.
 * Classic, chase, broadcast, and high are the defend-zoom 0 rig.
 * Freestyle keeps the replay orbit, theta 0 on +X.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import * as THREE from "three";

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

const cams = await server.ssrLoadModule("/src/game/replayCameras.ts");
const form = await server.ssrLoadModule("/src/game/formationLibrary.ts");

const subject = { x: 0, y: 0.55, z: 0 };
const atk = -1;

function applyPose(pose) {
  const cam = new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.15, 220);
  cam.up.set(pose.up.x, pose.up.y, pose.up.z);
  cam.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
  cam.lookAt(pose.look.x, pose.look.y, pose.look.z);
  cam.updateMatrixWorld();
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const toLook = new THREE.Vector3(pose.look.x, pose.look.y, pose.look.z).sub(cam.position).normalize();
  assert.ok(dir.dot(toLook) > 0.99, `look ${dir.dot(toLook)}`);
  return cam;
}

test("the five game camera modes are distinct and match the live rig", () => {
  assert.deepEqual(
    cams.REPLAY_CAMS.map((c) => c.id),
    ["classic", "chase", "broadcast", "high", "freestyle"],
  );
  const facing = cams.yawChaseForward(-Math.PI / 2);
  assert.ok(Math.abs(facing.x - 1) < 1e-9);
  assert.ok(Math.abs(facing.z) < 1e-9);
  assert.equal(cams.replayAttackUp(-1), -1);
  assert.equal(cams.replayAttackUp(1), 1);

  const classic = cams.placeReplayCamera("classic", subject, atk, { x: 1, z: 0 });
  const chase = cams.placeReplayCamera("chase", subject, atk, { x: 1, z: 0 });
  const broadcast = cams.placeReplayCamera("broadcast", subject, atk, { x: 1, z: 0 });
  const high = cams.placeReplayCamera("high", subject, atk, { x: 1, z: 0 });

  assert.equal(classic.fov, 50);
  assert.equal(classic.eye.y, 9.4);
  assert.ok(classic.eye.x > classic.look.x, "homeAttack -1 sits the classic camera on +X");
  assert.equal(classic.eye.z, classic.look.z);
  assert.deepEqual(classic.up, { x: -1, y: 0, z: 0 });
  assert.ok(Math.abs(classic.look.x - (subject.x - 1.15)) < 1e-9);

  assert.equal(chase.fov, 44);
  assert.equal(chase.eye.y, 2.7);
  assert.ok(Math.abs(chase.eye.x - (subject.x - 7.1)) < 1e-9);
  assert.ok(Math.abs(chase.eye.z - subject.z) < 1e-9);
  assert.ok(chase.look.x > subject.x);

  assert.equal(broadcast.fov, 44);
  assert.equal(broadcast.eye.y, 12.2);
  assert.equal(broadcast.eye.z, 10.2);
  assert.equal(broadcast.eye.x, 0);
  assert.deepEqual(broadcast.up, { x: 0, y: 1, z: 0 });

  assert.equal(high.fov, 48);
  assert.equal(high.eye.y, 32);
  assert.equal(high.look.y, 0);
  assert.deepEqual(high.up, { x: -1, y: 0, z: 0 });

  const eyes = [classic, chase, broadcast, high].map((p) => `${p.eye.x},${p.eye.y},${p.eye.z}`);
  assert.equal(new Set(eyes).size, 4);

  const classicCam = applyPose(classic);
  const up = new THREE.Vector3().setFromMatrixColumn(classicCam.matrixWorld, 1);
  assert.ok(up.x < -0.4, `classic screen-up should point toward -X, got ${up.x}`);
  applyPose(chase);
  applyPose(broadcast);
  const highCam = applyPose(high);
  const highUp = new THREE.Vector3().setFromMatrixColumn(highCam.matrixWorld, 1);
  assert.ok(highUp.x < -0.9, `high screen-up should be -X, got ${highUp.x}`);
});

test("a high classic look lifts before the attack axis rolls the view", () => {
  const posed = cams.placeReplayCamera("classic", { x: 0, y: 9, z: 0 }, -1, { x: 1, z: 0 });
  assert.ok(posed.eye.y > 9.4);
  const behind = (posed.look.x - posed.eye.x) * -1;
  const dy = posed.look.y - posed.eye.y;
  const dz = posed.look.z - posed.eye.z;
  const align = behind / Math.hypot(behind, dy, dz);
  assert.ok(align <= Math.cos((25 * Math.PI) / 180) + 1e-6);
  applyPose(posed);
});

test("freestyle keeps the replay orbit and a drag from chase does not jump", () => {
  const eye = cams.freestyleReplayEye(subject);
  assert.deepEqual(eye, { x: subject.x - 12, y: 9.2, z: subject.z + 14 });
  const orbit = cams.replayOrbitFromEye(subject, eye);
  const back = cams.replayOrbitEye(subject, orbit);
  assert.ok(Math.abs(back.x - eye.x) < 1e-6);
  assert.ok(Math.abs(back.y - eye.y) < 1e-6);
  assert.ok(Math.abs(back.z - eye.z) < 1e-6);
  const formed = form.formationOrbitFromEye(subject, eye);
  assert.ok(Math.abs(formed.theta - orbit.theta) < 1e-9);
  assert.ok(Math.abs(formed.phi - orbit.phi) < 1e-9);
  assert.ok(Math.abs(formed.radius - orbit.radius) < 1e-9);

  const chase = cams.placeReplayCamera("chase", subject, atk, { x: 1, z: 0 });
  const held = { theta: 0, phi: 1, radius: 10 };
  const adjusted = { current: false };
  const next = cams.claimReplayFreestyle({
    mode: "chase",
    adjusted,
    orbit: held,
    look: subject,
    eye: chase.eye,
  });
  assert.equal(next, "freestyle");
  assert.equal(adjusted.current, true);
  const stayed = cams.replayOrbitEye(subject, held);
  assert.ok(Math.abs(stayed.x - chase.eye.x) < 1e-6);
  assert.ok(Math.abs(stayed.y - chase.eye.y) < 1e-6);
  assert.ok(Math.abs(stayed.z - chase.eye.z) < 1e-6);

  const again = { theta: held.theta, phi: held.phi, radius: held.radius };
  cams.claimReplayFreestyle({
    mode: "freestyle",
    adjusted,
    orbit: held,
    look: subject,
    eye: { x: 0, y: 0, z: 0 },
  });
  assert.equal(held.theta, again.theta);
  assert.equal(held.phi, again.phi);
  assert.equal(held.radius, again.radius);

  adjusted.current = false;
  cams.claimReplayFreestyle({
    mode: "freestyle",
    adjusted,
    orbit: held,
    look: subject,
    eye: chase.eye,
  });
  const seeded = cams.replayOrbitEye(subject, held);
  assert.ok(Math.abs(seeded.x - eye.x) < 1e-6);
  assert.ok(Math.abs(seeded.y - eye.y) < 1e-6);
  assert.ok(Math.abs(seeded.z - eye.z) < 1e-6);
});

test("a locked skater owns chase heading, otherwise the puck holder or the puck", () => {
  const skaters = [
    { id: 0, yaw: 0 },
    { id: 1, yaw: -Math.PI / 2 },
  ];
  const locked = cams.replayChaseAim({ kind: "skater", index: 1 }, skaters, 0, { x: 0, z: 5 }, { x: 0, z: 1 });
  assert.ok(Math.abs(locked.x - 1) < 1e-9);
  assert.ok(Math.abs(locked.z) < 1e-9);
  const holder = cams.replayChaseAim({ kind: "puck" }, skaters, 0, { x: 0, z: 5 }, { x: 1, z: 0 });
  assert.deepEqual(holder, cams.yawChaseForward(0));
  const loose = cams.replayChaseAim(null, skaters, null, { x: 0, z: 2 }, { x: 1, z: 0 });
  assert.ok(Math.abs(loose.z - 1) < 1e-9);
  const slow = cams.replayChaseAim(null, skaters, null, { x: 0.1, z: 0 }, { x: 0, z: 1 });
  assert.ok(Math.abs(slow.z - 1) < 1e-9);
});

test("the replay viewer offers the same camera buttons as the game", () => {
  const replay = readFileSync(join(repo, "src/game/ReplayViewerView.tsx"), "utf8");
  const overlay = readFileSync(join(repo, "src/game/Overlay.tsx"), "utf8");
  assert.match(replay, /aria-label="Camera"/);
  assert.match(replay, /REPLAY_CAMS/);
  assert.match(replay, /claimReplayFreestyle/);
  assert.match(replay, /placeReplayCamera|camModeRef/);
  for (const label of ["Classic", "Chase", "Broadcast", "High", "Freestyle"]) {
    assert.match(overlay, new RegExp(`label: "${label}"`));
    assert.match(replay, new RegExp(`>\\s*\\{c\\.label\\}\\s*<`));
  }
  assert.match(replay, /aria-pressed=\{camMode === c\.id\}/);
  assert.match(replay, /function openReplayMark/);
  assert.match(replay, /lock: \{ kind: "puck" \}/);
  assert.match(replay, /mark\.current = openReplayMark\(sample\.puck\.x, sample\.puck\.z\)/);
  assert.match(replay, /markRef\.current = openReplayMark\(puck\.x, puck\.z\)/);
  assert.match(replay, /cursor\.lock = null/);
  assert.match(replay, /cycleMarkLock/);
  assert.match(replay, /onClick=\{\(\) => pickCam\(c\.id\)\}/);
});
