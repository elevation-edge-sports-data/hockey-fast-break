import * as THREE from "three";

const _knob = new THREE.Vector3();

/** Knob is the direct child highest on the stick's local Y axis. */
export function knobLocalOffset(stick: THREE.Object3D): THREE.Vector3 {
  let best: THREE.Vector3 | null = null;
  let bestY = -Infinity;
  for (const child of stick.children) {
    if (child.position.y > bestY) {
      bestY = child.position.y;
      best = child.position;
    }
  }
  return best ? best.clone() : new THREE.Vector3(0, 1, 0);
}

/**
 * Parent `stick` under `pivot` so the pivot sits on the knob.
 * The stick's world pose does not change. Shaft, knob, and blade stay its children.
 */
export function mountStickKnobPivot(stick: THREE.Object3D, pivot: THREE.Object3D): THREE.Object3D | null {
  const home = stick.parent;
  if (!home || home === pivot) return home;
  stick.updateWorldMatrix(true, false);
  _knob.copy(knobLocalOffset(stick));
  stick.localToWorld(_knob);
  home.updateWorldMatrix(true, false);
  home.worldToLocal(_knob);
  pivot.position.copy(_knob);
  pivot.quaternion.identity();
  pivot.scale.set(1, 1, 1);
  pivot.name = "stickKnobPivot";
  home.add(pivot);
  pivot.updateWorldMatrix(true, false);
  pivot.attach(stick);
  stick.userData.poseHome = home;
  return home;
}

/** Put the stick back on the parent it had when the pivot was mounted, keeping the world pose. */
export function releaseStickKnobPivot(stick: THREE.Object3D | null, pivot: THREE.Object3D): void {
  const home = stick?.userData.poseHome as THREE.Object3D | undefined;
  if (stick && home) {
    if (stick.parent) home.attach(stick);
    delete stick.userData.poseHome;
  }
  pivot.removeFromParent();
}

/**
 * Parent the stick under the hand without moving it in the world.
 * Goalie editors pass the right hand. Skater editors pass the left hand.
 * The gameplay parent is remembered so a save can read the original local space.
 */
export function mountStickOnHand(stick: THREE.Object3D, hand: THREE.Object3D): void {
  if (stick.userData.poseHome) return;
  if (stick.parent === hand) return;
  const home = stick.parent;
  if (!home) return;
  if (!stick.userData.poseHandHome) stick.userData.poseHandHome = home;
  hand.attach(stick);
}

/** Return the stick to its gameplay parent, keeping the world pose. */
export function releaseStickFromHand(stick: THREE.Object3D | null): void {
  if (!stick) return;
  const gameplay = stick.userData.poseHandHome as THREE.Object3D | undefined;
  if (!gameplay) return;
  const pivotHome = stick.userData.poseHome as THREE.Object3D | undefined;
  if (pivotHome && stick.parent && stick.parent !== pivotHome) {
    pivotHome.attach(stick);
    delete stick.userData.poseHome;
  }
  if (stick.parent !== gameplay) gameplay.attach(stick);
  delete stick.userData.poseHandHome;
}
