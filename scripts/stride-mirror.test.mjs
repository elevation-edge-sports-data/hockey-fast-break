import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Euler, Quaternion, Vector3, Group } from "three";

const PAIRS = [
  ["lArm", "rArm"],
  ["lFore", "rFore"],
  ["lHand", "rHand"],
  ["lLeg", "rLeg"],
  ["lShin", "rShin"],
  ["lBoot", "rBoot"],
];

function applyJoint(group, value) {
  group.rotation.set(value[0], value[1], value[2]);
  group.quaternion.setFromEuler(group.rotation);
  if (value.length >= 6) group.position.set(value[3], value[4], value[5]);
  else group.position.set(0, 0, 0);
}

function build(joints) {
  const root = new Group();
  const body = new Group();
  root.add(body);
  applyJoint(body, joints.body);
  const nodes = { body };
  const chain = [
    ["head", body],
    ["lArm", body],
    ["lFore", "lArm"],
    ["lHand", "lFore"],
    ["rArm", body],
    ["rFore", "rArm"],
    ["rHand", "rFore"],
    ["lLeg", body],
    ["lShin", "lLeg"],
    ["lBoot", "lShin"],
    ["rLeg", body],
    ["rShin", "rLeg"],
    ["rBoot", "rShin"],
  ];
  for (const [id, parent] of chain) {
    if (!joints[id]) continue;
    const group = new Group();
    (typeof parent === "string" ? nodes[parent] : parent).add(group);
    applyJoint(group, joints[id]);
    nodes[id] = group;
  }
  root.updateMatrixWorld(true);
  return nodes;
}

function worldOf(group, x, y, z) {
  return group.localToWorld(new Vector3(x, y, z));
}

test("a YZ reflection flips yaw and roll and keeps pitch", () => {
  const euler = new Euler(0.4, 0.3, -0.2, "XYZ");
  const q = new Quaternion().setFromEuler(euler);
  const point = new Vector3(0.2, -0.5, 0.1).applyQuaternion(q);
  q.set(q.x, -q.y, -q.z, q.w);
  const mirrored = new Vector3(-0.2, -0.5, 0.1).applyQuaternion(q);
  assert.ok(Math.abs(mirrored.x + point.x) < 1e-6);
  assert.ok(Math.abs(mirrored.y - point.y) < 1e-6);
  assert.ok(Math.abs(mirrored.z - point.z) < 1e-6);
});

test("stride right is the left/right mirror of stride left, stick unchanged", () => {
  const file = JSON.parse(readFileSync(new URL("../src/game/poseOverrides.json", import.meta.url), "utf8"));
  const left = file.strideLeft;
  const right = file.strideRight;
  assert.ok(left && right);
  assert.deepEqual(right.stick, left.stick);
  assert.deepEqual(right.bladeGrp, left.bladeGrp);

  const a = build(left);
  const b = build(right);
  const samples = [
    [0, 0, 0],
    [0.2, 0, 0],
    [0, 0.25, 0],
    [0, 0, 0.2],
  ];
  const check = (from, to) => {
    for (const [x, y, z] of samples) {
      const p = worldOf(from, x, y, z);
      const q = worldOf(to, -x, y, z);
      assert.ok(Math.abs(q.x + p.x) < 0.002, `x ${p.x} vs ${q.x}`);
      assert.ok(Math.abs(q.y - p.y) < 0.002, `y ${p.y} vs ${q.y}`);
      assert.ok(Math.abs(q.z - p.z) < 0.002, `z ${p.z} vs ${q.z}`);
    }
  };
  check(a.head, b.head);
  check(a.body, b.body);
  for (const [l, r] of PAIRS) check(a[l], b[r]);
});
