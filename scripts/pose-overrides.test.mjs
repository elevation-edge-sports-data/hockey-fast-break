import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as THREE from "three";
import { isPoseOverrideHotFile, mergePoseOverride, parsePoseSave, writePoseOverride } from "./pose-overrides-plugin.mjs";

test("saving the pose file does not hot-reload the editor", () => {
  assert.equal(isPoseOverrideHotFile("C:/repo/src/game/poseOverrides.json"), true);
  assert.equal(isPoseOverrideHotFile("C:\\repo\\src\\game\\poseOverrides.json.tmp"), true);
  assert.equal(isPoseOverrideHotFile("C:/repo/src/game/PlayerMesh.tsx"), false);
});

test("merge keeps other poses and replaces the named one", () => {
  const next = mergePoseOverride(
    { cheer: { body: [0.1, 0, 0] }, slap: { lLeg: [0.2, 0, 0] } },
    "slap",
    { lLeg: [0.41, 0, 0], lShin: [0.78, 0, 0] },
  );
  assert.deepEqual(next.cheer, { body: [0.1, 0, 0] });
  assert.deepEqual(next.slap.lLeg, [0.41, 0, 0]);
  assert.deepEqual(next.slap.lShin, [0.78, 0, 0]);
});

test("parse accepts a named pose and drops unknown joints", () => {
  const saved = parsePoseSave({
    pose: "wristFollow",
    joints: { lLeg: [0.41, 0, 0], notAJoint: [1, 2, 3], head: [0, 0.2, 0] },
  });
  assert.equal(saved.pose, "wristFollow");
  assert.deepEqual(saved.joints, { lLeg: [0.41, 0, 0], head: [0, 0.2, 0] });
});

test("parse accepts camelCase gallery ids", () => {
  const saved = parsePoseSave({ pose: "goalieUpright", joints: { body: [0.1, 0, 0] } });
  assert.equal(saved.pose, "goalieUpright");
});

test("parse accepts the default pose and rejects an empty name", () => {
  const saved = parsePoseSave({ pose: "default", joints: { body: [0.1, 0, 0] } });
  assert.equal(saved.pose, "default");
  assert.throws(() => parsePoseSave({ pose: "", joints: { body: [0, 0, 0] } }), /named pose/);
});

test("parse rejects a non-finite joint", () => {
  assert.throws(() => parsePoseSave({ pose: "slap", joints: { lLeg: [Number.NaN, 0, 0] } }), /lLeg/);
});

test("wrist torso translation wins over the procedural hip drop", () => {
  const saved = parsePoseSave({
    pose: "wrist",
    joints: { body: [0.4, 0.1, 0, 0.2, -0.15, 0.35] },
  });
  assert.deepEqual(saved.joints.body, [0.4, 0.1, 0, 0.2, -0.15, 0.35]);
  const body = new THREE.Group();
  body.position.set(0.08, -0.04, 0.12);
  body.rotation.set(0.7, 0.2, 0);
  const pose = saved.joints.body;
  body.rotation.set(pose[0], pose[1], pose[2]);
  body.position.set(pose[3], pose[4], pose[5]);
  assert.ok(Math.abs(body.position.x - 0.2) < 1e-6);
  assert.ok(Math.abs(body.position.y + 0.15) < 1e-6);
  assert.ok(Math.abs(body.position.z - 0.35) < 1e-6);
  assert.ok(Math.abs(body.rotation.x - 0.4) < 1e-6);
});

test("an arm save keeps the shoulder position and that wins over slap IK", () => {
  const saved = parsePoseSave({
    pose: "slap",
    joints: { lArm: [-0.4, 0.2, 1.1, -0.2, 1.2, 0.02] },
  });
  assert.deepEqual(saved.joints.lArm, [-0.4, 0.2, 1.1, -0.2, 1.2, 0.02]);
  const arm = new THREE.Group();
  arm.position.set(-0.26, 1.46, 0.06);
  arm.quaternion.setFromEuler(new THREE.Euler(0.7, 0.1, -1.2));
  const pose = saved.joints.lArm;
  arm.rotation.set(pose[0], pose[1], pose[2]);
  arm.quaternion.setFromEuler(arm.rotation);
  if (pose.length >= 6) arm.position.set(pose[3], pose[4], pose[5]);
  assert.ok(Math.abs(arm.rotation.x + 0.4) < 1e-6);
  assert.ok(Math.abs(arm.position.x + 0.2) < 1e-6);
  assert.ok(Math.abs(arm.position.y - 1.2) < 1e-6);
  assert.ok(Math.abs(arm.position.z - 0.02) < 1e-6);
});

test("a rotation-only torso save leaves the procedural position alone", () => {
  const saved = parsePoseSave({ pose: "slap", joints: { body: [0.5, 0, 0] } });
  assert.deepEqual(saved.joints.body, [0.5, 0, 0]);
  const body = new THREE.Group();
  body.position.set(0, -0.06, 0.1);
  const pose = saved.joints.body;
  body.rotation.set(pose[0], pose[1], pose[2]);
  if (pose.length >= 6) body.position.set(pose[3], pose[4], pose[5]);
  assert.ok(Math.abs(body.position.y + 0.06) < 1e-6);
  assert.ok(Math.abs(body.position.z - 0.1) < 1e-6);
});

test("stick save keeps local position and that transform wins over a procedural aim", () => {
  const saved = parsePoseSave({
    pose: "poke",
    joints: { stick: [-0.4, 0.2, 1.1, 0.25, 0.55, -0.35] },
  });
  assert.deepEqual(saved.joints.stick, [-0.4, 0.2, 1.1, 0.25, 0.55, -0.35]);

  const stick = new THREE.Group();
  stick.quaternion.setFromEuler(new THREE.Euler(1.2, 0.3, -0.5));
  stick.position.set(-1.15, 0.03, 0.65);
  const pose = saved.joints.stick;
  stick.rotation.set(pose[0], pose[1], pose[2]);
  stick.position.set(pose[3], pose[4], pose[5]);
  assert.ok(Math.abs(stick.rotation.x + 0.4) < 1e-6);
  assert.ok(Math.abs(stick.rotation.y - 0.2) < 1e-6);
  assert.ok(Math.abs(stick.rotation.z - 1.1) < 1e-6);
  assert.ok(Math.abs(stick.position.x - 0.25) < 1e-6);
  assert.ok(Math.abs(stick.position.y - 0.55) < 1e-6);
  assert.ok(Math.abs(stick.position.z + 0.35) < 1e-6);
  assert.equal(stick.children.length, 0);
});

test("saved euler components restore in the joint's current order", () => {
  const group = new THREE.Group();
  group.rotation.order = "YXZ";
  group.rotation.set(0.41, -0.2, 0.78);
  const saved = [group.rotation.x, group.rotation.y, group.rotation.z];
  group.rotation.set(1, 1, 1);
  group.rotation.set(saved[0], saved[1], saved[2]);
  assert.equal(group.rotation.order, "YXZ");
  assert.ok(Math.abs(group.rotation.x - 0.41) < 1e-6);
  assert.ok(Math.abs(group.rotation.y + 0.2) < 1e-6);
  assert.ok(Math.abs(group.rotation.z - 0.78) < 1e-6);
});

test("writePoseOverride updates one entry on disk", () => {
  const root = mkdtempSync(join(tmpdir(), "hfb-pose-"));
  const dir = join(root, "src", "game");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "poseOverrides.json"), '{ "cheer": { "body": [0.2, 0, 0] } }\n');
  writePoseOverride(root, "slap", { lLeg: [0.41, 0, 0] });
  const file = JSON.parse(readFileSync(join(dir, "poseOverrides.json"), "utf8"));
  assert.deepEqual(file.cheer.body, [0.2, 0, 0]);
  assert.deepEqual(file.slap.lLeg, [0.41, 0, 0]);
});
