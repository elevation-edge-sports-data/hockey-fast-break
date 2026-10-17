import { Euler, Object3D, Quaternion, Vector3 } from "three";

/**
 * World XYZ Euler for the pose editor.
 *
 * Saved poses stay parent-local Euler. Gameplay applies those numbers with
 * `rotation.set`, and a player's root yaw is not the editor's yaw, so the file
 * cannot store world angles. The editor converts at this boundary: the panel
 * and the world-space gizmo edit the world orientation, then the joint's local
 * quaternion is the one the hierarchy and the save file use.
 *
 * Ancestor scale is ignored. `matrixWorld` decomposition shears when a parent
 * scale is non-uniform (the goalie root is 1.14 on X and Z).
 */

const _stack: number[] = [];
const _qTmp = new Quaternion();
const _worldQuat = new Quaternion();
const _parentWorldQuat = new Quaternion();
const _worldEuler = new Euler(0, 0, 0, "XYZ");
const _axisQuat = new Quaternion();
const _spinWorld = new Quaternion();
const _offset = new Vector3();
const _inv = new Quaternion();

const WORLD_AXIS = {
  X: new Vector3(1, 0, 0),
  Y: new Vector3(0, 1, 0),
  Z: new Vector3(0, 0, 1),
} as const;

/** Product of quaternions from the scene root down to `object`. */
export function rotationWorldQuaternion(object: Object3D, out: Quaternion): Quaternion {
  _stack.length = 0;
  let node: Object3D | null = object;
  while (node) {
    const q = node.quaternion;
    _stack.push(q.x, q.y, q.z, q.w);
    node = node.parent;
  }
  out.identity();
  for (let i = _stack.length - 4; i >= 0; i -= 4) {
    _qTmp.set(_stack[i]!, _stack[i + 1]!, _stack[i + 2]!, _stack[i + 3]!);
    out.multiply(_qTmp);
  }
  return out;
}

/** World orientation as fixed-axis XYZ Euler. Angles are radians. */
export function readWorldEuler(object: Object3D): { x: number; y: number; z: number } {
  _worldEuler.setFromQuaternion(rotationWorldQuaternion(object, _worldQuat), "XYZ");
  return { x: _worldEuler.x, y: _worldEuler.y, z: _worldEuler.z };
}

/** Local quaternion whose world orientation equals `world`. */
export function applyWorldQuaternion(object: Object3D, world: Quaternion): void {
  const parent = object.parent;
  if (!parent) {
    object.quaternion.copy(world);
    return;
  }
  rotationWorldQuaternion(parent, _parentWorldQuat).invert();
  object.quaternion.copy(_parentWorldQuat).multiply(world);
}

/** Set one component of the world XYZ Euler. The other two stay put. */
export function setWorldEulerAxis(object: Object3D, axis: "x" | "y" | "z", value: number): void {
  _worldEuler.setFromQuaternion(rotationWorldQuaternion(object, _worldQuat), "XYZ");
  _worldEuler[axis] = value;
  _worldQuat.setFromEuler(_worldEuler);
  applyWorldQuaternion(object, _worldQuat);
}

/** Add `delta` radians to one component of the world XYZ Euler. */
export function addWorldEuler(object: Object3D, axis: "x" | "y" | "z", delta: number): void {
  _worldEuler.setFromQuaternion(rotationWorldQuaternion(object, _worldQuat), "XYZ");
  setWorldEulerAxis(object, axis, _worldEuler[axis] + delta);
}

/**
 * Rotate `object` about a fixed world axis by `angle` radians.
 * `startWorld` is the world quaternion from before this drag. It is not modified.
 * Right-hand: +X sends +Y toward +Z.
 */
export function rotateAboutWorldAxis(object: Object3D, axis: "X" | "Y" | "Z", angle: number, startWorld: Quaternion): void {
  _spinWorld.copy(startWorld);
  _axisQuat.setFromAxisAngle(WORLD_AXIS[axis], angle);
  _worldQuat.copy(_axisQuat).multiply(_spinWorld);
  applyWorldQuaternion(object, _worldQuat);
}

/** `pivot - origin` in the joint's rotational frame. */
export function rotationFrameOffset(origin: Vector3, pivot: Vector3, worldQuat: Quaternion, out: Vector3): Vector3 {
  _offset.copy(pivot).sub(origin);
  return out.copy(_offset).applyQuaternion(_inv.copy(worldQuat).invert());
}

/** Joint origin that keeps `localOffset` on `pivot` for `worldQuat`. */
export function originForFixedRotationOffset(pivot: Vector3, worldQuat: Quaternion, localOffset: Vector3, out: Vector3): Vector3 {
  _offset.copy(localOffset).applyQuaternion(worldQuat);
  return out.copy(pivot).sub(_offset);
}
