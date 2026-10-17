import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  addWorldEuler,
  originForFixedRotationOffset,
  readWorldEuler,
  rotateAboutWorldAxis,
  rotationFrameOffset,
  rotationWorldQuaternion,
  setWorldEulerAxis,
} from "../src/game/poseWorldEuler.ts";

function quatAngle(a, b) {
  return a.angleTo(b);
}

function worldDir(object, x, y, z) {
  object.updateWorldMatrix(true, true);
  const origin = object.getWorldPosition(new THREE.Vector3());
  const tip = object.localToWorld(new THREE.Vector3(x, y, z));
  return tip.sub(origin);
}

test("a child shows the parent's yaw in world Euler, not its local Euler", () => {
  const body = new THREE.Group();
  const shoulder = new THREE.Group();
  const fore = new THREE.Group();
  shoulder.rotation.x = 0.5;
  shoulder.add(fore);
  body.add(shoulder);
  shoulder.updateWorldMatrix(true, true);

  const shown = readWorldEuler(fore);
  assert.ok(Math.abs(fore.rotation.x) < 1e-8, "local forearm X stays 0");
  assert.ok(Math.abs(shown.x - 0.5) < 1e-6, `world X should inherit 0.5, got ${shown.x}`);
  assert.ok(Math.abs(shown.y) < 1e-6 && Math.abs(shown.z) < 1e-6);

  const parentQuat = shoulder.quaternion.clone();
  setWorldEulerAxis(fore, "x", 0);
  setWorldEulerAxis(fore, "y", 0);
  setWorldEulerAxis(fore, "z", 0);

  const leveled = readWorldEuler(fore);
  assert.ok(Math.abs(leveled.x) < 1e-6 && Math.abs(leveled.y) < 1e-6 && Math.abs(leveled.z) < 1e-6);
  assert.ok(Math.abs(fore.rotation.x + 0.5) < 1e-6, "local X cancels the shoulder");
  assert.ok(quatAngle(shoulder.quaternion, parentQuat) < 1e-6);
  assert.ok(worldDir(fore, 1, 0, 0).distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-5);
  assert.ok(worldDir(fore, 0, 1, 0).distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-5);
  assert.ok(worldDir(fore, 0, 0, 1).distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-5);
});

test("world yaw matches a matrix direction, and local Euler does not", () => {
  const root = new THREE.Group();
  root.rotation.y = Math.PI / 2;
  const joint = new THREE.Group();
  root.add(joint);
  root.updateWorldMatrix(true, true);

  const shown = readWorldEuler(joint);
  assert.ok(Math.abs(joint.rotation.y) < 1e-8);
  assert.ok(Math.abs(shown.y - Math.PI / 2) < 1e-6);
  assert.ok(Math.abs(shown.x) < 1e-6 && Math.abs(shown.z) < 1e-6);
  // rotation.y > 0 sends local +Z toward world +X.
  const forward = worldDir(joint, 0, 0, 1);
  assert.ok(forward.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-5);
  const byQuat = new THREE.Vector3(0, 0, 1).applyQuaternion(rotationWorldQuaternion(joint, new THREE.Quaternion()));
  assert.ok(byQuat.distanceTo(forward) < 1e-5);
});

test("world X rotation is right-handed about the fixed world axis", () => {
  const parent = new THREE.Group();
  parent.rotation.y = Math.PI / 2;
  const joint = new THREE.Group();
  parent.add(joint);
  parent.updateWorldMatrix(true, true);

  const start = rotationWorldQuaternion(joint, new THREE.Quaternion());
  rotateAboutWorldAxis(joint, "X", Math.PI / 2, start);
  // Parent yaw leaves +Y as world +Y. +X rotation sends that toward +Z.
  const up = worldDir(joint, 0, 1, 0);
  assert.ok(up.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-5, `up went to ${up.x.toFixed(3)}, ${up.y.toFixed(3)}, ${up.z.toFixed(3)}`);
  const parentOnly = new THREE.Vector3(0, 1, 0).applyQuaternion(parent.quaternion);
  assert.ok(parentOnly.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-5);
});

test("non-uniform parent scale does not shear the world quaternion", () => {
  const root = new THREE.Group();
  root.scale.set(1.14, 1, 1.14);
  root.rotation.y = 0.6;
  const joint = new THREE.Group();
  joint.rotation.set(0.4, -0.3, 0.2);
  root.add(joint);
  root.updateWorldMatrix(true, true);

  const ours = rotationWorldQuaternion(joint, new THREE.Quaternion());
  const composed = root.quaternion.clone().multiply(joint.quaternion);
  assert.ok(quatAngle(ours, composed) < 1e-6);

  const decomposed = new THREE.Quaternion();
  joint.matrixWorld.decompose(new THREE.Vector3(), decomposed, new THREE.Vector3());
  assert.ok(quatAngle(ours, decomposed) > 1e-3, "decompose should shear under this scale");

  setWorldEulerAxis(joint, "x", 0.55);
  const after = readWorldEuler(joint);
  assert.ok(Math.abs(after.x - 0.55) < 1e-6);
  const again = rotationWorldQuaternion(joint, new THREE.Quaternion());
  const composedAfter = root.quaternion.clone().multiply(joint.quaternion);
  assert.ok(quatAngle(again, composedAfter) < 1e-6);
});

test("nudging one world component leaves the other two", () => {
  const parent = new THREE.Group();
  parent.rotation.z = 0.4;
  const joint = new THREE.Group();
  parent.add(joint);
  setWorldEulerAxis(joint, "x", 0.2);
  setWorldEulerAxis(joint, "y", -0.15);
  setWorldEulerAxis(joint, "z", 0.1);
  addWorldEuler(joint, "x", 0.05);
  const shown = readWorldEuler(joint);
  assert.ok(Math.abs(shown.x - 0.25) < 1e-6);
  assert.ok(Math.abs(shown.y + 0.15) < 1e-6);
  assert.ok(Math.abs(shown.z - 0.1) < 1e-6);
});

test("saved local Euler still restores the world orientation", () => {
  const root = new THREE.Group();
  root.rotation.y = 0.5;
  const joint = new THREE.Group();
  joint.rotation.set(0.3, -0.2, 0.4);
  root.add(joint);
  root.updateWorldMatrix(true, true);

  const local = [joint.rotation.x, joint.rotation.y, joint.rotation.z];
  const world = readWorldEuler(joint);
  assert.ok(Math.abs(local[0] - world.x) > 1e-3 || Math.abs(local[1] - world.y) > 1e-3);

  joint.rotation.set(1, 1, 1);
  joint.rotation.set(local[0], local[1], local[2]);
  const restored = readWorldEuler(joint);
  assert.ok(Math.abs(restored.x - world.x) < 1e-6);
  assert.ok(Math.abs(restored.y - world.y) < 1e-6);
  assert.ok(Math.abs(restored.z - world.z) < 1e-6);

  setWorldEulerAxis(joint, "y", 1);
  const edited = readWorldEuler(joint);
  const saved = [joint.rotation.x, joint.rotation.y, joint.rotation.z];
  assert.ok(Math.abs(saved[1] - edited.y) > 1e-3, "file keeps local Y, not world Y");
  joint.rotation.set(0, 0, 0);
  joint.rotation.set(saved[0], saved[1], saved[2]);
  const round = readWorldEuler(joint);
  assert.ok(Math.abs(round.x - edited.x) < 1e-6);
  assert.ok(Math.abs(round.y - edited.y) < 1e-6);
  assert.ok(Math.abs(round.z - edited.z) < 1e-6);
});

test("a world-Y spin keeps the rotational-frame pivot fixed", () => {
  const parent = new THREE.Group();
  parent.rotation.y = 0.4;
  const joint = new THREE.Group();
  joint.position.set(0.2, 1, -0.3);
  joint.rotation.set(0.2, -0.4, 0.1);
  parent.add(joint);
  parent.updateWorldMatrix(true, true);

  const origin = joint.getWorldPosition(new THREE.Vector3());
  const pivot = joint.localToWorld(new THREE.Vector3(0, 0.5, 0));
  const worldQ = rotationWorldQuaternion(joint, new THREE.Quaternion());
  const localOff = rotationFrameOffset(origin, pivot, worldQ, new THREE.Vector3());
  const start = worldQ.clone();
  rotateAboutWorldAxis(joint, "Y", 0.7, start);
  const nextQ = rotationWorldQuaternion(joint, new THREE.Quaternion());
  const nextOrigin = originForFixedRotationOffset(pivot, nextQ, localOff, new THREE.Vector3());
  parent.updateWorldMatrix(true, false);
  parent.worldToLocal(joint.position.copy(nextOrigin));
  joint.updateWorldMatrix(true, true);
  const pivotAfter = joint.localToWorld(new THREE.Vector3(0, 0.5, 0));
  assert.ok(pivotAfter.distanceTo(pivot) < 1e-5, `pivot moved ${pivotAfter.distanceTo(pivot)}`);
});
