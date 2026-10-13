import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

function knobLocalOffset(stick) {
  let best = null;
  let bestY = -Infinity;
  for (const child of stick.children) {
    if (child.position.y > bestY) {
      bestY = child.position.y;
      best = child.position;
    }
  }
  return best ? best.clone() : new THREE.Vector3(0, 1, 0);
}

test("rotating the stick pivot keeps the knob fixed and the parts parented", () => {
  const home = new THREE.Group();
  const stick = new THREE.Group();
  const shaft = new THREE.Group();
  shaft.position.set(0, 0.6, 0);
  const knob = new THREE.Mesh();
  knob.position.set(0, 1.2, 0);
  const blade = new THREE.Group();
  blade.position.set(0, 0, 0);
  stick.add(shaft, knob, blade);
  stick.position.set(0.4, 0.2, -0.3);
  stick.rotation.set(0.3, -0.2, 0.15);
  home.add(stick);
  home.updateWorldMatrix(true, true);

  const knobBefore = stick.localToWorld(knobLocalOffset(stick));
  const pivot = new THREE.Group();
  const knobWorld = stick.localToWorld(knobLocalOffset(stick));
  home.worldToLocal(knobWorld);
  pivot.position.copy(knobWorld);
  pivot.quaternion.identity();
  home.add(pivot);
  pivot.updateWorldMatrix(true, false);
  pivot.attach(stick);

  pivot.rotation.x = 0.8;
  pivot.updateWorldMatrix(true, true);
  const knobAfter = stick.localToWorld(knob.position.clone());
  assert.ok(knobBefore.distanceTo(knobAfter) < 1e-4);
  assert.equal(shaft.parent, stick);
  assert.equal(knob.parent, stick);
  assert.equal(blade.parent, stick);
  assert.equal(stick.parent, pivot);

  home.attach(stick);
  pivot.removeFromParent();
  const knobHome = stick.localToWorld(knob.position.clone());
  assert.ok(knobBefore.distanceTo(knobHome) < 1e-4);
  assert.equal(stick.parent, home);
  assert.ok(stick.position.distanceTo(new THREE.Vector3(0.4, 0.2, -0.3)) > 1e-3);
});

test("translating the stick pivot moves the knob and the blade together", () => {
  const home = new THREE.Group();
  const stick = new THREE.Group();
  const knob = new THREE.Mesh();
  knob.position.set(0, 1.2, 0);
  const blade = new THREE.Group();
  stick.add(knob, blade);
  stick.position.set(0.2, 0, 0);
  home.add(stick);
  home.updateWorldMatrix(true, true);

  const pivot = new THREE.Group();
  const knobWorld = stick.localToWorld(knob.position.clone());
  home.worldToLocal(knobWorld);
  pivot.position.copy(knobWorld);
  home.add(pivot);
  pivot.updateWorldMatrix(true, false);
  pivot.attach(stick);

  const knobBefore = stick.localToWorld(knob.position.clone());
  const bladeBefore = stick.localToWorld(new THREE.Vector3());
  pivot.position.x += 0.5;
  pivot.updateWorldMatrix(true, true);
  const knobAfter = stick.localToWorld(knob.position.clone());
  const bladeAfter = stick.localToWorld(new THREE.Vector3());
  assert.ok(Math.abs(knobAfter.x - knobBefore.x - 0.5) < 1e-4);
  assert.ok(Math.abs(bladeAfter.x - bladeBefore.x - 0.5) < 1e-4);
  assert.equal(knob.parent, stick);
  assert.equal(blade.parent, stick);
  assert.ok(pivot.getWorldPosition(new THREE.Vector3()).distanceTo(knobAfter) < 1e-4);
});
