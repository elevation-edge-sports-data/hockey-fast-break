import * as THREE from "three";

const _knob = new THREE.Vector3();
const _knobDelta = new THREE.Vector3();

/** Local offset from the old grip origin to the knob. Set when the goalie stick is rebased. */
export const GOALIE_KNOB_SHIFT = "goalieKnobShift";

function storedKnobShift(obj: THREE.Object3D | null | undefined): THREE.Vector3 | null {
  const shift = obj?.userData[GOALIE_KNOB_SHIFT] as THREE.Vector3 | undefined;
  if (!shift || shift.lengthSq() < 1e-12) return null;
  return shift;
}

/** Grip-to-knob offset on a goalie stick whose origin has been moved to the knob. */
export function goalieStickKnobShift(stick: THREE.Object3D, out: THREE.Vector3): boolean {
  const shift = storedKnobShift(stick);
  if (!shift) return false;
  out.copy(shift);
  return true;
}

/** Same offset, read from the blade's parent stick. Blade positions stay grip-relative in saves. */
export function goalieBladeKnobShift(blade: THREE.Object3D, out: THREE.Vector3): boolean {
  return goalieStickKnobShift(blade.parent ?? blade, out);
}

export function setGoalieKnobShift(stick: THREE.Object3D, x: number, y: number, z: number): void {
  const shift = stick.userData[GOALIE_KNOB_SHIFT] as THREE.Vector3 | undefined;
  if (shift) shift.set(x, y, z);
  else stick.userData[GOALIE_KNOB_SHIFT] = new THREE.Vector3(x, y, z);
}

/**
 * Move the stick origin onto the knob mesh. World pose of every child stays put.
 * `goalieKnobShift` is the old local offset from the grip to the knob.
 */
export function pivotGoalieStickOnKnob(stick: THREE.Object3D): void {
  const knob = stick.getObjectByName("goalieKnob");
  if (!knob || knob.parent !== stick) return;
  if (knob.position.lengthSq() < 1e-10) return;
  const shift = stick.userData[GOALIE_KNOB_SHIFT] as THREE.Vector3 | undefined;
  const next = shift ?? new THREE.Vector3();
  if (!shift) stick.userData[GOALIE_KNOB_SHIFT] = next;
  next.copy(knob.position);
  for (const child of stick.children) child.position.sub(next);
  _knobDelta.copy(next).applyQuaternion(stick.quaternion);
  stick.position.add(_knobDelta);
}

/** Inverse of `pivotGoalieStickOnKnob`. Puts the grip back at the origin for one pose pass. */
export function restoreGoalieStickGrip(stick: THREE.Object3D): void {
  const shift = storedKnobShift(stick);
  const knob = stick.getObjectByName("goalieKnob");
  if (!shift || !knob || knob.parent !== stick) return;
  if (knob.position.lengthSq() > 1e-8) return;
  for (const child of stick.children) child.position.add(shift);
  _knobDelta.copy(shift).applyQuaternion(stick.quaternion);
  stick.position.sub(_knobDelta);
}

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
  // Origin is already the knob. A second pivot would spin the stick twice.
  if (knobLocalOffset(stick).lengthSq() < 1e-8) return null;
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
 * Goalie editors pass the right hand (mesh lHand).
 * Skater editors pass the left hand (mesh rHand), including strideLeft and strideRight.
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
