import { CircleGeometry, Matrix4, Mesh, Object3D, Quaternion, RingGeometry, Vector3 } from "three";

/**
 * Pose editor and pose gallery view frame.
 *
 * Everywhere else, rink length is X (home net near +26), width is Z, and Y is up.
 * A standing mesh at sim yaw 0 has root rotation.y = π, so helmet +Z (the face)
 * points world −Z. A parent yaw of −π/2 turns that face onto +X:
 * Ry(π) then Ry(−π/2) sends (0, 0, 1) to (1, 0, 0).
 * A seated mesh has no root yaw, so the face points +Z. Parent yaw +π/2
 * sends (0, 0, 1) to (1, 0, 0).
 * The gizmo stays in world space, so its X/Y/Z handles are these rink axes.
 */
export const POSE_STAND_YAW = -Math.PI / 2;
export const POSE_SEAT_YAW = Math.PI / 2;

/** Ice height of the player shadow. Matches PlayerMesh SHADOW_ICE_Y. */
export const POSE_SHADOW_Y = 0.015;

export function poseModelYaw(seated: boolean): number {
  return seated ? POSE_SEAT_YAW : POSE_STAND_YAW;
}

/** Rotate an eye or light that was aimed at a −Z-facing standing player. */
export function yawAboutY(position: readonly [number, number, number], yaw: number): [number, number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [position[0] * c + position[2] * s, position[1], -position[0] * s + position[2] * c];
}

/** Editor eye. Was [2.8, 1.6, 3.6], behind and to the right of a −Z-facing player. */
export const POSE_EDITOR_CAMERA: readonly [number, number, number] = [-3.6, 1.6, 2.8];
export const POSE_EDITOR_TARGET: readonly [number, number, number] = [0, 0.95, 0];
/** Key light. Was [4, 7, 4]. */
export const POSE_EDITOR_LIGHT: readonly [number, number, number] = [-4, 7, 4];

/** Gallery eye. Was [1.8, 1.4, -3.6], in front and to the right of a −Z-facing player. */
export const POSE_GALLERY_CAMERA: readonly [number, number, number] = [3.6, 1.4, 1.8];
export const POSE_GALLERY_TARGET: readonly [number, number, number] = [0, 0.9, 0];
/** Key light. Was [3.2, 6.5, -2.4]. Fill was [-3.5, 3.2, 3]. */
export const POSE_GALLERY_KEY: readonly [number, number, number] = [2.4, 6.5, 3.2];
export const POSE_GALLERY_FILL: readonly [number, number, number] = [-3, 3.2, -3.5];

const _pos = new Vector3();
const _quat = new Quaternion();
const _scl = new Vector3();
const _world = new Matrix4();
const _flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const _level = new Quaternion();

function isRingHolder(obj: Object3D): boolean {
  for (const child of obj.children) {
    const mesh = child as Mesh;
    if (mesh.isMesh && mesh.geometry instanceof RingGeometry) return true;
  }
  return false;
}

function plantWorld(obj: Object3D, y: number, quat: Quaternion, sx: number, sy: number, sz: number) {
  const parent = obj.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  _pos.set(0, y, 0);
  _scl.set(sx, sy, sz);
  _world.compose(_pos, quat, _scl);
  obj.matrix.copy(parent.matrixWorld).invert().multiply(_world);
  obj.matrixAutoUpdate = false;
  obj.matrixWorldNeedsUpdate = true;
  obj.updateWorldMatrix(true, false);
}

/**
 * Keep the pose-editor ice shadow and the ring on the world origin.
 * Joint and root translation must not carry them. The shadow stays flat at
 * POSE_SHADOW_Y so it does not sink into the grid. The ring group stays at y=0;
 * its child meshes already sit just above the ice.
 */
export function pinPoseIceMarks(root: Object3D): void {
  const rings: Object3D[] = [];
  const shadows: Mesh[] = [];
  root.traverse((obj) => {
    if (isRingHolder(obj)) rings.push(obj);
    const mesh = obj as Mesh;
    if (mesh.isMesh && mesh.geometry instanceof CircleGeometry) shadows.push(mesh);
  });
  for (const ring of rings) {
    ring.updateWorldMatrix(true, false);
    ring.matrixWorld.decompose(_pos, _quat, _scl);
    const sx = Math.abs(_scl.x) || 1;
    const sz = Math.abs(_scl.z) || 1;
    plantWorld(ring, 0, _level, sx, 1, sz);
  }
  for (const shadow of shadows) {
    if (shadow.parent && isRingHolder(shadow.parent)) continue;
    shadow.updateWorldMatrix(true, false);
    shadow.matrixWorld.decompose(_pos, _quat, _scl);
    const u = Math.max(Math.abs(_scl.x), Math.abs(_scl.y), Math.abs(_scl.z)) || 1;
    plantWorld(shadow, POSE_SHADOW_Y, _flat, u, u, u);
  }
}

export function PoseAxisLegend() {
  return null;
}
