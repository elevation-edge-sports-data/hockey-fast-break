import * as THREE from "three";
import { GOAL_H, GOAL_W } from "./rink";

/**
 * Stand-up goalie Z, in the goalie's root frame (+Z toward the shooter, +Y up).
 * Thighs stay on the hip sockets. The crouch is the joint angles:
 * torso pitched forward (shoulders ahead of the hips), thigh angled back
 * (knee ahead of the hip), shin leaned forward (knee ahead of the ankle),
 * skate flat with the toe toward the shooter.
 * Upright is the shallow Z. Perimeter is that Z as deep as this skeleton can
 * go while the mask stays on the crossbar, pads wider than upright. Mid folds
 * further and wider; the helmet crown sits on the bar. Butterfly is wider in
 * pad angle and lower in the head, with a deeper profile Z. The pads lie on
 * the ice; the skates do not.
 * Angles are radians from vertical (torso from upright).
 */
export type GoalieZName = "upright" | "perimeter" | "mid" | "butterfly";

export type GoalieZAngles = {
  torso: number;
  thigh: number;
  shin: number;
  abduct: number;
  shinOut: number;
};

const DEG = Math.PI / 180;

export const GOALIE_Z: Record<GoalieZName, GoalieZAngles> = {
  upright: { torso: 8 * DEG, thigh: 14 * DEG, shin: 16 * DEG, abduct: 8 * DEG, shinOut: 3 * DEG },
  // Mask on the crossbar. Knees lead the skates. Wider than upright.
  // A deeper fold pushes the mask through the bar on this skeleton.
  perimeter: {
    torso: 8 * DEG,
    thigh: 30 * DEG,
    shin: 32 * DEG,
    abduct: 14 * DEG,
    shinOut: 12 * DEG,
  },
  // Crown on the crossbar. Wider, and a deeper Z, than perimeter.
  mid: { torso: 31.5 * DEG, thigh: 58 * DEG, shin: 54 * DEG, abduct: 30 * DEG, shinOut: 16 * DEG },
  // Lower than mid. Torso pitch is read by the stance poser. The leg fields
  // record the series (deeper fold, wider flare). The pads are posed from the
  // knee and shin vectors, because this Z formula cannot lay both pads flat.
  butterfly: {
    torso: 40 * DEG,
    thigh: 70 * DEG,
    shin: 84 * DEG,
    abduct: -16 * DEG,
    shinOut: 78 * DEG,
  },
};

/** Hip pivot. Pants span about y 0.76–0.96 and x ±0.18. These stay put in every Z. */
export const GOALIE_SOCKET_X = 0.14;
export const GOALIE_SOCKET_Y = 0.82;
/** Shin group sits this far down the thigh. */
export const GOALIE_THIGH_LEN = 0.36;
/** Boot origin along the shin, at the end of the pad. */
export const GOALIE_SHIN_LEN = 0.42;

/** Blocker shoulder, body space. Upper arm hangs from here. */
export const GOALIE_BLOCKER_SHOULDER = { x: -0.28, y: 1.42, z: 0.08 } as const;
/** Catcher shoulder, body space. */
export const GOALIE_GLOVE_SHOULDER = { x: 0.34, y: 1.46, z: 0.1 } as const;

/**
 * Stick anchor on the blocker forearm. The play pose and the mesh group share it,
 * so the blocker IK mark and the stick origin are the same point.
 */
const PLAY_STICK_ANCHOR = { x: 0.03, y: -0.22, z: 0.05 } as const;
/** Blocker reach to that anchor, and catcher reach to the pocket. Body space. */
const PLAY_BLOCKER_REACH = 0.281 + 0.24 - 0.02;
const PLAY_GLOVE_REACH = 0.281 + 0.34 - 0.02;
const PLAY_ICE_Y = 0.03;
/** Ice-blade center stays this far in front of the pad face. */
const PLAY_ICE_LEAD = 0.16;
const PLAY_ICE_MAX = 1.22;
const PLAY_HAND_GAP = 0.12;

/** How far the stick's ice blade leads the pad face. The blade stays in front. */
export const GOALIE_Z_BLADE_LEAD: Record<GoalieZName, number> = {
  upright: 0.2,
  perimeter: 0.22,
  mid: 0.18,
  // In front of the stick-side pad. The heel uses that pad's lateral, not center ice.
  butterfly: 0.2,
};

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _hip = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _ankle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _face = new THREE.Vector3();
const _best = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _down = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _bodyInv = new THREE.Quaternion();
const _legInv = new THREE.Quaternion();
const _rootQ = new THREE.Quaternion();

/**
 * Bone whose local +Y runs back up the limb and whose local +Z faces `face`.
 * `dirDown` and `face` are both in the bone's parent space.
 * local +X = up × face. A vertical bone with face +Z gets local +X = +X,
 * so the shin-pad ±X offset flares away from the other pad.
 */
function setBoneQuat(out: THREE.Quaternion, dirDown: THREE.Vector3, face: THREE.Vector3) {
  _y.copy(dirDown).negate();
  if (_y.lengthSq() < 1e-8) _y.set(0, 1, 0);
  else _y.normalize();
  _z.copy(face);
  _z.addScaledVector(_y, -_z.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
  else _z.normalize();
  _x.crossVectors(_y, _z);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  else _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  out.setFromRotationMatrix(_m);
}

function poseZLeg(
  root: THREE.Object3D,
  side: -1 | 1,
  angles: GoalieZAngles,
  leg: THREE.Object3D,
  shin: THREE.Object3D,
  boot: THREE.Object3D | null,
) {
  leg.position.set(side * GOALIE_SOCKET_X, GOALIE_SOCKET_Y, 0);
  leg.quaternion.identity();
  shin.position.set(0, -GOALIE_THIGH_LEN, 0);
  shin.quaternion.identity();
  root.updateWorldMatrix(true, true);
  _hip.set(0, 0, 0);
  leg.localToWorld(_hip);
  root.worldToLocal(_hip);

  const abduct = Math.cos(angles.abduct);
  // Knee ahead of the hip: +Z is the shooter. Abduct flares the knee outward.
  _dir.set(
    Math.sin(angles.abduct) * side,
    -Math.cos(angles.thigh) * abduct,
    Math.sin(angles.thigh) * abduct,
  );
  _knee.copy(_hip).addScaledVector(_dir, GOALIE_THIGH_LEN);
  _dir.applyQuaternion(_bodyInv);
  _face.set(0, 0, 1).applyQuaternion(_bodyInv);
  setBoneQuat(leg.quaternion, _dir, _face);

  const shinFlat = Math.cos(angles.shinOut);
  // Ankle behind the knee, so the shin leans toward the shooter as it rises.
  _dir.set(
    Math.sin(angles.shinOut) * side,
    -Math.cos(angles.shin) * shinFlat,
    -Math.sin(angles.shin) * shinFlat,
  );
  _ankle.copy(_knee).addScaledVector(_dir, GOALIE_SHIN_LEN);
  _dir.applyQuaternion(_bodyInv);
  _legInv.copy(leg.quaternion).invert();
  _dir.applyQuaternion(_legInv);
  _face.set(0, 0, 1).applyQuaternion(_bodyInv).applyQuaternion(_legInv);
  setBoneQuat(shin.quaternion, _dir, _face);

  if (!boot) return;
  root.updateWorldMatrix(true, true);
  root.getWorldQuaternion(_rootQ);
  // Toe a little outward and toward the shooter. side −1 is the blocker skate.
  // up × toe = local +X, then local +Z is rebuilt along the toe.
  _z.set(side * 0.18, 0, 1).applyQuaternion(_rootQ);
  _z.y = 0;
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
  else _z.normalize();
  _x.crossVectors(_up, _z);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  else _x.normalize();
  _z.crossVectors(_x, _up).normalize();
  _m.makeBasis(_x, _up, _z);
  _q.setFromRotationMatrix(_m);
  shin.getWorldQuaternion(_legInv);
  boot.quaternion.copy(_legInv.invert()).multiply(_q);
  boot.position.set(0, -GOALIE_SHIN_LEN, 0.02);
}

/** Crouch both legs. Hip sockets are not moved. Call with the body still under `root`. */
export function poseGoalieZLimbs(
  root: THREE.Object3D,
  body: THREE.Object3D,
  lLeg: THREE.Object3D,
  rLeg: THREE.Object3D,
  lShin: THREE.Object3D,
  rShin: THREE.Object3D,
  lBoot: THREE.Object3D | null,
  rBoot: THREE.Object3D | null,
  angles: GoalieZAngles,
  bank: number,
) {
  body.position.set(0, 0, 0);
  body.rotation.order = "XYZ";
  body.rotation.set(angles.torso, 0, bank);
  _bodyInv.copy(body.quaternion).invert();
  poseZLeg(root, -1, angles, lLeg, lShin, lBoot);
  _bodyInv.copy(body.quaternion).invert();
  poseZLeg(root, 1, angles, rLeg, rShin, rBoot);
  root.updateWorldMatrix(true, true);
}

/**
 * Full butterfly and the blocker save.
 * Hips stay on the sockets. Thighs drop, shins flare to the low corners, and the
 * torso stays up so the chest does not fold onto the pads.
 * Hands aim outside the posts at crossbar height. The arm stops at full reach;
 * the aim sits past the corner so that reach still lands on it.
 */
const BUTTERFLY_TORSO = 14 * DEG;
/** Negative pulls the knees together so the pads meet. Hips stay on the sockets. */
const BUTTERFLY_KNEE_OUT = -0.145;
const BUTTERFLY_KNEE_DROP = 0.355;
const BUTTERFLY_KNEE_FWD = 0.015;
/** Shin runs out toward the low corner, almost level, a little toward the shooter. */
const BUTTERFLY_SHIN = new THREE.Vector3(1.2, -0.12, 0.18);
/** Skate drop along world down so the sole meets the pad. The pad stays the ice contact. */
const BUTTERFLY_BOOT_DROP = 0.18;

/**
 * Where the raised hand should finish, in world meters from the goalie origin.
 * Lateral is past the post. Height is the crossbar. The extra distance is aim
 * past the bone reach, not a second hand position.
 */
const BUTTERFLY_AIM_LAT = GOAL_W / 2 + 0.05;
/** Glove arm is longer, so the same aim lands past the pocket. Pull that target in. */
const BUTTERFLY_GLOVE_AIM_LAT = GOAL_W / 2 - 0.12;
const BUTTERFLY_AIM_Y = GOAL_H - 0.08;
const BUTTERFLY_AIM_FWD = 0.16;

/**
 * Save window for that raised hand, goalie-relative.
 * Positive lateral is the blocker side. The box is the overlap of the blocker
 * board and the catcher pocket, so a top-corner puck (about y 1.26, |z| 0.86)
 * is on the hand. Low pad shots stay under Y0.
 */
export const GOALIE_CORNER_Y0 = 1.16;
export const GOALIE_CORNER_Y1 = 1.4;
export const GOALIE_CORNER_LAT0 = 0.76;
export const GOALIE_CORNER_LAT1 = 1.06;

/** Ice-blade center leads the stick-pad face. The heel sits 0.13 behind that. */
export const GOALIE_BUTTERFLY_BLADE_LEAD = 0.26;

/** Raised blocker or glove, not the pads. `towardBlocker` > 0 is the stick side. */
export function goalieRaisedHandCovers(puckY: number, towardBlocker: number): boolean {
  const lat = Math.abs(towardBlocker);
  if (puckY < GOALIE_CORNER_Y0 || puckY > GOALIE_CORNER_Y1) return false;
  return lat >= GOALIE_CORNER_LAT0 && lat <= GOALIE_CORNER_LAT1;
}

function poseButterflyLeg(
  root: THREE.Object3D,
  side: -1 | 1,
  leg: THREE.Object3D,
  shin: THREE.Object3D,
  boot: THREE.Object3D | null,
) {
  leg.position.set(side * GOALIE_SOCKET_X, GOALIE_SOCKET_Y, 0);
  leg.quaternion.identity();
  shin.position.set(0, -GOALIE_THIGH_LEN, 0);
  shin.quaternion.identity();
  root.updateWorldMatrix(true, true);
  _hip.set(0, 0, 0);
  leg.localToWorld(_hip);
  root.worldToLocal(_hip);

  _dir.set(side * BUTTERFLY_KNEE_OUT, -BUTTERFLY_KNEE_DROP, BUTTERFLY_KNEE_FWD);
  if (_dir.lengthSq() < 1e-8) _dir.set(0, -1, 0);
  else _dir.normalize().multiplyScalar(GOALIE_THIGH_LEN);
  _dir.applyQuaternion(_bodyInv);
  _face.set(0, 0, 1).applyQuaternion(_bodyInv);
  setBoneQuat(leg.quaternion, _dir, _face);

  // +Z points back at the net. The shooter's view is then local −Z, still the
  // wide face. Mirrored pad offsets hang down only with this sign: local +X
  // comes out up on the stick pad and down on the glove pad.
  _dir.set(side * BUTTERFLY_SHIN.x, BUTTERFLY_SHIN.y, BUTTERFLY_SHIN.z);
  if (_dir.lengthSq() < 1e-8) _dir.set(side, 0, 0);
  else _dir.normalize();
  _dir.applyQuaternion(_bodyInv);
  _legInv.copy(leg.quaternion).invert();
  _dir.applyQuaternion(_legInv);
  _face.set(0, 0, -1).applyQuaternion(_bodyInv).applyQuaternion(_legInv);
  setBoneQuat(shin.quaternion, _dir, _face);

  if (!boot) return;
  root.updateWorldMatrix(true, true);
  root.getWorldQuaternion(_rootQ);
  _z.set(side * 0.18, 0, 1).applyQuaternion(_rootQ);
  _z.y = 0;
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
  else _z.normalize();
  _x.crossVectors(_up, _z);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  else _x.normalize();
  _z.crossVectors(_x, _up).normalize();
  _m.makeBasis(_x, _up, _z);
  _q.setFromRotationMatrix(_m);
  shin.getWorldQuaternion(_legInv);
  boot.quaternion.copy(_legInv.invert()).multiply(_q);
  boot.position.set(0, -GOALIE_SHIN_LEN, 0.02);
  // Sole sits on the pad. World-down, then into shin space, so scale does not shorten it.
  shin.getWorldPosition(_hip);
  _dir.copy(_hip);
  _dir.y -= BUTTERFLY_BOOT_DROP;
  shin.worldToLocal(_hip);
  shin.worldToLocal(_dir);
  boot.position.add(_dir.sub(_hip));
}

/** Knees down, pads flared, hips on the sockets, chest up. */
export function poseGoalieButterflyLimbs(
  root: THREE.Object3D,
  body: THREE.Object3D,
  lLeg: THREE.Object3D,
  rLeg: THREE.Object3D,
  lShin: THREE.Object3D,
  rShin: THREE.Object3D,
  lBoot: THREE.Object3D | null,
  rBoot: THREE.Object3D | null,
) {
  body.position.set(0, 0, 0);
  body.rotation.order = "XYZ";
  body.rotation.set(BUTTERFLY_TORSO, 0, 0);
  _bodyInv.copy(body.quaternion).invert();
  poseButterflyLeg(root, -1, lLeg, lShin, lBoot);
  _bodyInv.copy(body.quaternion).invert();
  poseButterflyLeg(root, 1, rLeg, rShin, rBoot);
  root.updateWorldMatrix(true, true);
}

/**
 * Compact butterfly, the ready stance after mid.
 * Knees stay together and ahead of the hips. Shins flare opposite each other
 * until the pads are flat on the ice. The whole body drops with the hips so
 * the head finishes under mid. Thighs stay on the sockets.
 * Skates tilt up off the ice. The pad is the contact.
 */
const BUTTERFLY_STANCE_DROP = -0.2;
/** Knee offset from the hip before it is normalized onto the thigh. x is inward. */
const BUTTERFLY_STANCE_KNEE = { x: -0.11, y: 0.14, z: 0.46 };
/** Shin direction. x flares out, y drops toward the ice, z is toward the shooter. */
const BUTTERFLY_STANCE_SHIN = { x: 1.15, y: 0.12, z: 0.04 };
/** Boot toe, root frame. y > 0 lifts the toe so the blade is not flat. */
const BUTTERFLY_STANCE_TOE = { x: 0.42, y: 0.75, z: 0.38 };
/** Boot sole, root frame. Not world up. */
const BUTTERFLY_STANCE_UP = { x: -0.22, y: 0.38, z: 0.12 };
/** World-up shift so the tilted blade clears the pad. The pad stays the contact. */
const BUTTERFLY_STANCE_BOOT_LIFT = 0.22;
/** World-down shift so the flat pad, not the knee block, meets the ice. */
const BUTTERFLY_STANCE_PAD_DROP = 0.1;

function poseButterflyStanceLeg(
  root: THREE.Object3D,
  side: -1 | 1,
  leg: THREE.Object3D,
  shin: THREE.Object3D,
  boot: THREE.Object3D | null,
) {
  leg.position.set(side * GOALIE_SOCKET_X, GOALIE_SOCKET_Y, 0);
  leg.quaternion.identity();
  shin.position.set(0, -GOALIE_THIGH_LEN, 0);
  shin.quaternion.identity();
  if (boot) boot.position.set(0, -GOALIE_SHIN_LEN, 0.02);
  root.updateWorldMatrix(true, true);
  _hip.set(0, 0, 0);
  leg.localToWorld(_hip);
  root.worldToLocal(_hip);

  _dir.set(side * BUTTERFLY_STANCE_KNEE.x, -BUTTERFLY_STANCE_KNEE.y, BUTTERFLY_STANCE_KNEE.z);
  if (_dir.lengthSq() < 1e-8) _dir.set(0, -1, 0);
  else _dir.normalize().multiplyScalar(GOALIE_THIGH_LEN);
  _knee.copy(_hip).add(_dir);
  _dir.applyQuaternion(_bodyInv);
  _face.set(0, 0, 1).applyQuaternion(_bodyInv);
  setBoneQuat(leg.quaternion, _dir, _face);

  _dir.set(side * BUTTERFLY_STANCE_SHIN.x, -BUTTERFLY_STANCE_SHIN.y, BUTTERFLY_STANCE_SHIN.z);
  if (_dir.lengthSq() < 1e-8) _dir.set(side, 0, 0);
  else _dir.normalize();
  _dir.applyQuaternion(_bodyInv);
  _legInv.copy(leg.quaternion).invert();
  _dir.applyQuaternion(_legInv);
  // Wide face up and toward the shooter, so the pad lies flat. Root +Y is up.
  // Root +Z is the shooter. The save butterfly keeps the other sign.
  _face.set(0, 0.92, 0.28).applyQuaternion(_bodyInv).applyQuaternion(_legInv);
  setBoneQuat(shin.quaternion, _dir, _face);

  if (boot) {
    root.updateWorldMatrix(true, true);
    root.getWorldQuaternion(_rootQ);
    _z.set(
      side * BUTTERFLY_STANCE_TOE.x,
      BUTTERFLY_STANCE_TOE.y,
      BUTTERFLY_STANCE_TOE.z,
    ).applyQuaternion(_rootQ);
    if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
    else _z.normalize();
    _y.set(
      side * BUTTERFLY_STANCE_UP.x,
      BUTTERFLY_STANCE_UP.y,
      BUTTERFLY_STANCE_UP.z,
    ).applyQuaternion(_rootQ);
    _y.addScaledVector(_z, -_y.dot(_z));
    if (_y.lengthSq() < 1e-8) _y.copy(_up);
    else _y.normalize();
    _x.crossVectors(_y, _z);
    if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
    else _x.normalize();
    _z.crossVectors(_x, _y).normalize();
    _m.makeBasis(_x, _y, _z);
    _q.setFromRotationMatrix(_m);
    shin.getWorldQuaternion(_legInv);
    boot.quaternion.copy(_legInv.invert()).multiply(_q);
    // World up into shin space. The toe stays tilted; the blade rises off the pad.
    shin.updateWorldMatrix(true, true);
    shin.getWorldPosition(_hip);
    _dir.copy(_hip);
    _dir.y += BUTTERFLY_STANCE_BOOT_LIFT;
    shin.worldToLocal(_hip);
    shin.worldToLocal(_dir);
    boot.position.add(_dir.sub(_hip));
  }
  const pad = shin.getObjectByName("goalieShinPad");
  if (!pad) return;
  shin.updateWorldMatrix(true, true);
  shin.getWorldPosition(_hip);
  _dir.copy(_hip);
  _dir.y -= BUTTERFLY_STANCE_PAD_DROP;
  shin.worldToLocal(_hip);
  shin.worldToLocal(_dir);
  pad.position.add(_dir.sub(_hip));
}

/** Knees in, pads flat and flared, skates tilted up, hips on the sockets. */
export function poseGoalieButterflyStanceLimbs(
  root: THREE.Object3D,
  body: THREE.Object3D,
  lLeg: THREE.Object3D,
  rLeg: THREE.Object3D,
  lShin: THREE.Object3D,
  rShin: THREE.Object3D,
  lBoot: THREE.Object3D | null,
  rBoot: THREE.Object3D | null,
  bank: number,
) {
  body.position.set(0, BUTTERFLY_STANCE_DROP, 0);
  body.rotation.order = "XYZ";
  body.rotation.set(GOALIE_Z.butterfly.torso, 0, bank);
  _bodyInv.copy(body.quaternion).invert();
  poseButterflyStanceLeg(root, -1, lLeg, lShin, lBoot);
  _bodyInv.copy(body.quaternion).invert();
  poseButterflyStanceLeg(root, 1, rLeg, rShin, rBoot);
  root.updateWorldMatrix(true, true);
}

/**
 * Blocker to the stick-side top corner, catcher to the other.
 * Home yaw π/2: forward is world +X, up × forward is world −Z (catcher).
 * The blocker target is the opposite lateral, outside the +Z post.
 */
export function poseGoalieButterflyArms(
  l: THREE.Object3D,
  r: THREE.Object3D,
  lf: THREE.Object3D,
  rf: THREE.Object3D,
  palmAxis: THREE.Vector3,
  boardAxis: THREE.Vector3,
) {
  const body = l.parent;
  const root = body?.parent;
  if (!body || !root) return;
  l.position.set(GOALIE_BLOCKER_SHOULDER.x, GOALIE_BLOCKER_SHOULDER.y, GOALIE_BLOCKER_SHOULDER.z);
  r.position.set(GOALIE_GLOVE_SHOULDER.x, GOALIE_GLOVE_SHOULDER.y, GOALIE_GLOVE_SHOULDER.z);
  root.updateWorldMatrix(true, true);
  root.getWorldQuaternion(_rootQ);
  _dir.set(0, 0, 1).applyQuaternion(_rootQ);
  _dir.y = 0;
  if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, 1);
  else _dir.normalize();
  _x.crossVectors(_up, _dir);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  else _x.normalize();
  root.getWorldPosition(_hip);
  const faceX = _dir.x;
  const faceY = _dir.y;
  const faceZ = _dir.z;
  _hand.copy(_hip).addScaledVector(_x, -BUTTERFLY_AIM_LAT).addScaledVector(_dir, BUTTERFLY_AIM_FWD);
  _hand.y = BUTTERFLY_AIM_Y;
  body.worldToLocal(_hand);
  const gripX = _hand.x;
  const gripY = _hand.y;
  const gripZ = _hand.z;
  _best
    .copy(_hip)
    .addScaledVector(_x, BUTTERFLY_GLOVE_AIM_LAT)
    .addScaledVector(_dir, BUTTERFLY_AIM_FWD);
  _best.y = BUTTERFLY_AIM_Y;
  body.worldToLocal(_best);
  const gloveX = _best.x;
  const gloveY = _best.y;
  const gloveZ = _best.z;
  poseGoalieHand(
    body,
    r,
    rf,
    GOALIE_GLOVE_SHOULDER.x,
    GOALIE_GLOVE_SHOULDER.y,
    GOALIE_GLOVE_SHOULDER.z,
    gloveX,
    gloveY,
    gloveZ,
    1,
    0.34,
    0.02,
    -0.32,
    0.02,
    palmAxis,
    faceX,
    faceY,
    faceZ,
    true,
    false,
  );
  poseGoalieHand(
    body,
    l,
    lf,
    GOALIE_BLOCKER_SHOULDER.x,
    GOALIE_BLOCKER_SHOULDER.y,
    GOALIE_BLOCKER_SHOULDER.z,
    gripX,
    gripY,
    gripZ,
    -1,
    0.24,
    0.03,
    -0.22,
    0.05,
    boardAxis,
    faceX,
    faceY,
    faceZ,
    true,
    false,
  );
}

/**
 * Blocker hand in body space.
 * Perimeter and upright hang close to the chest, nearly straight. The board's
 * face is turned onto the pad separately. Mid is out in front, elbow bent.
 * Butterfly stacks the blocker in front of the chest, not out at the post.
 * `body` and `shin` stay in the signature so callers do not depend on pose order.
 */
export function goalieZBlockerPoint(
  kind: GoalieZName,
  _body: THREE.Object3D,
  _shin: THREE.Object3D | null,
  out: THREE.Vector3,
): THREE.Vector3 {
  if (kind === "butterfly") return out.set(-0.32, 1.22, 0.16);
  if (kind === "mid") return out.set(-0.46, 1.12, 0.28);
  const outX = kind === "perimeter" ? 0.05 : 0.03;
  const fwd = kind === "perimeter" ? 0.08 : 0.05;
  return out.set(
    GOALIE_BLOCKER_SHOULDER.x - outX,
    GOALIE_BLOCKER_SHOULDER.y - 0.5,
    GOALIE_BLOCKER_SHOULDER.z + fwd,
  );
}

/** Catcher hand in body space. Perimeter stays in; mid is out in front. Butterfly stacks on the chest. */
export function goalieZGlovePoint(kind: GoalieZName, out: THREE.Vector3): THREE.Vector3 {
  if (kind === "butterfly") return out.set(0.36, 1.26, 0.18);
  if (kind === "mid") return out.set(0.48, 1.14, 0.3);
  if (kind === "perimeter") return out.set(0.38, 1.18, 0.26);
  return out.set(0.36, 1.28, 0.18);
}

/**
 * Blocker board: local +Y is the long axis, local +X is the broad-face normal.
 * Turn that face with the stick-side pad. The forearm twist cannot finish this
 * once the hand is held in off the shin.
 */
function alignBlockerToPad(board: THREE.Object3D, shin: THREE.Object3D) {
  const parent = board.parent;
  if (!parent) return;
  shin.updateWorldMatrix(true, true);
  parent.updateWorldMatrix(true, false);
  shin.getWorldQuaternion(_q);
  _y.set(0, 1, 0).applyQuaternion(_q);
  _x.set(0, 0, 1).applyQuaternion(_q);
  _x.addScaledVector(_y, -_x.dot(_y));
  if (_y.lengthSq() < 1e-8 || _x.lengthSq() < 1e-8) return;
  _y.normalize();
  _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m);
  parent.getWorldQuaternion(_bodyInv);
  board.quaternion.copy(_bodyInv.invert()).multiply(_q);
}

/** Shin pad's broad face, world space. The blocker's long face lines up with this. */
export function goaliePadFaceWorld(shin: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  shin.getWorldQuaternion(_q);
  return out.set(0, 0, 1).applyQuaternion(_q).normalize();
}

const _ikDown = new THREE.Vector3(0, -1, 0);
const _ikTo = new THREE.Vector3();
const _ikN = new THREE.Vector3();
const _ikD1 = new THREE.Vector3();
const _ikD2 = new THREE.Vector3();
const _ikElbow = new THREE.Vector3();
const _ikInv = new THREE.Quaternion();
const _ikM = new THREE.Matrix4();
const _ikAxis = new THREE.Vector3();
const _ikCorner = new THREE.Vector3();
const _ikWant = new THREE.Vector3();
const _ikQ = new THREE.Quaternion();

function poseGoalieIk(
  arm: THREE.Object3D,
  fore: THREE.Object3D,
  sx: number,
  sy: number,
  sz: number,
  tx: number,
  ty: number,
  tz: number,
  poleSign: number,
  lower: number,
  elbowUp = false,
  dropElbow = false,
  slack = 0.02,
  tuckIn = false,
) {
  const UPPER = 0.281;
  _ikTo.set(tx - sx, ty - sy, tz - sz);
  let dist = _ikTo.length();
  const maxR = UPPER + lower - slack;
  if (dist < 0.08) dist = 0.08;
  if (dist > maxR) {
    _ikTo.multiplyScalar(maxR / dist);
    dist = maxR;
  }
  _ikTo.normalize();
  const along = (UPPER * UPPER - lower * lower + dist * dist) / (2 * dist);
  const reach = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
  // Save poses keep the old pole. Z stances hang the elbow. Butterfly tucks it back
  // toward the net so the upper arm stays on the torso instead of reaching out.
  if (dropElbow) _ikN.set(poleSign * (tuckIn ? 0.04 : 0.22), -1, tuckIn ? -0.7 : 0.1);
  else _ikN.set(poleSign * (elbowUp ? 0.55 : 0.9), elbowUp ? 0.95 : -0.15, elbowUp ? 0.2 : 0.35);
  _ikD1.crossVectors(_ikTo, _ikN);
  _ikD1.cross(_ikTo);
  if (_ikD1.lengthSq() < 1e-6) _ikD1.set(poleSign, 0, 0);
  else _ikD1.normalize();
  _ikElbow.set(sx, sy, sz).addScaledVector(_ikTo, along).addScaledVector(_ikD1, reach);
  _ikD2.set(_ikElbow.x - sx, _ikElbow.y - sy, _ikElbow.z - sz);
  if (_ikD2.lengthSq() < 1e-8) _ikD2.set(0, -1, 0);
  else _ikD2.normalize();
  _ikN.set(poleSign, 0, 0.2);
  _ikN.addScaledVector(_ikD2, -_ikN.dot(_ikD2));
  if (_ikN.lengthSq() < 1e-6) _ikN.set(0, 0, 1);
  else _ikN.normalize();
  _ikAxis.crossVectors(_ikD2, _ikN).normalize();
  _ikCorner.copy(_ikD2).multiplyScalar(-1);
  _ikM.makeBasis(_ikN, _ikCorner, _ikAxis);
  arm.quaternion.setFromRotationMatrix(_ikM);
  _ikD1.set(tx - _ikElbow.x, ty - _ikElbow.y, tz - _ikElbow.z);
  if (_ikD1.lengthSq() < 1e-8) _ikD1.set(0, -1, 0);
  else _ikD1.normalize();
  _ikInv.copy(arm.quaternion).invert();
  _ikD1.applyQuaternion(_ikInv);
  fore.quaternion.setFromUnitVectors(_ikDown, _ikD1);
}

function twistGoalieFore(fore: THREE.Object3D, localAxis: THREE.Vector3, want: THREE.Vector3) {
  fore.updateWorldMatrix(true, false);
  _ikD2.set(0, 1, 0).applyQuaternion(fore.getWorldQuaternion(_ikQ));
  _ikD1.copy(localAxis).applyQuaternion(_ikQ);
  _ikD1.addScaledVector(_ikD2, -_ikD1.dot(_ikD2));
  _ikCorner.copy(want).addScaledVector(_ikD2, -want.dot(_ikD2));
  if (_ikD1.lengthSq() < 1e-6 || _ikCorner.lengthSq() < 1e-6) return;
  _ikD1.normalize();
  _ikCorner.normalize();
  _ikAxis.crossVectors(_ikD1, _ikCorner);
  fore.rotateY(Math.atan2(_ikD2.dot(_ikAxis), _ikD1.dot(_ikCorner)));
}

/** Place a goalie hand. `faceLocal` is a forearm-space axis; it is not written. */
export function poseGoalieHand(
  body: THREE.Object3D,
  arm: THREE.Object3D,
  fore: THREE.Object3D,
  sx: number,
  sy: number,
  sz: number,
  gx: number,
  gy: number,
  gz: number,
  poleSign: number,
  lower: number,
  markX: number,
  markY: number,
  markZ: number,
  faceLocal: THREE.Vector3,
  wantX: number,
  wantY: number,
  wantZ: number,
  elbowUp = false,
  dropElbow = false,
  slack = 0.02,
  tuckIn = false,
) {
  arm.position.set(sx, sy, sz);
  let tx = gx;
  let ty = gy;
  let tz = gz;
  _ikWant.set(wantX, wantY, wantZ);
  if (_ikWant.lengthSq() < 1e-6) _ikWant.set(0, 0, 1);
  else _ikWant.normalize();
  for (let n = 0; n < 8; n++) {
    poseGoalieIk(
      arm,
      fore,
      sx,
      sy,
      sz,
      tx,
      ty,
      tz,
      poleSign,
      lower,
      elbowUp,
      dropElbow,
      slack,
      tuckIn,
    );
    twistGoalieFore(fore, faceLocal, _ikWant);
    body.updateWorldMatrix(true, true);
    _ikCorner.set(markX, markY, markZ);
    fore.localToWorld(_ikCorner);
    body.worldToLocal(_ikCorner);
    const ex = gx - _ikCorner.x;
    const ey = gy - _ikCorner.y;
    const ez = gz - _ikCorner.z;
    if (Math.hypot(ex, ey, ez) < 0.008) break;
    tx += ex * 0.85;
    ty += ey * 0.85;
    tz += ez * 0.85;
  }
}

/**
 * Perimeter keeps the hands in and the blocker nearly straight, board on the pad.
 * Mid sets both gloves out in front. Upright is the same shape, higher and narrower.
 * Butterfly stacks both hands on the chest. The upper arms hang. They do not reach the posts.
 * The glove pole points down so the upper arm angles down and, on perimeter,
 * the pocket can sit just above the elbow.
 * `palmAxis` and `boardAxis` are forearm-space and are not written.
 */
export function poseGoalieZArms(
  kind: GoalieZName,
  l: THREE.Object3D,
  r: THREE.Object3D,
  lf: THREE.Object3D,
  rf: THREE.Object3D,
  palmAxis: THREE.Vector3,
  boardAxis: THREE.Vector3,
) {
  const body = l.parent;
  const root = body?.parent;
  if (!body || !root) return;
  l.position.set(GOALIE_BLOCKER_SHOULDER.x, GOALIE_BLOCKER_SHOULDER.y, GOALIE_BLOCKER_SHOULDER.z);
  r.position.set(GOALIE_GLOVE_SHOULDER.x, GOALIE_GLOVE_SHOULDER.y, GOALIE_GLOVE_SHOULDER.z);
  root.updateWorldMatrix(true, true);
  const shin = root.getObjectByName("goalieStickPad") ?? null;
  goalieZBlockerPoint(kind, body, shin, _hand);
  const gripX = _hand.x;
  const gripY = _hand.y;
  const gripZ = _hand.z;
  goalieZGlovePoint(kind, _best);
  let gloveX = _best.x;
  let gloveY = _best.y;
  let gloveZ = _best.z;
  root.getWorldQuaternion(_rootQ);
  _dir.set(0, 0, 1).applyQuaternion(_rootQ);
  _dir.y = 0;
  if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, 1);
  else _dir.normalize();
  // Elbow hangs under the hand. Mid bends out front. Butterfly stays in and does not
  // lock the board onto a pad that is lying flat.
  const alongPad = kind !== "mid" && kind !== "butterfly";
  const up = alongPad ? 0.18 : 0.22;
  const palmX = _dir.x;
  const palmY = _dir.y + up;
  const palmZ = _dir.z;
  let faceX = _dir.x;
  let faceY = _dir.y;
  let faceZ = _dir.z;
  if (kind !== "mid" && kind !== "butterfly" && shin) {
    goaliePadFaceWorld(shin, _face);
    faceX = _face.x;
    faceY = _face.y;
    faceZ = _face.z;
  }
  for (let n = 0; n < 8; n++) {
    poseGoalieHand(
      body,
      r,
      rf,
      GOALIE_GLOVE_SHOULDER.x,
      GOALIE_GLOVE_SHOULDER.y,
      GOALIE_GLOVE_SHOULDER.z,
      gloveX,
      gloveY,
      gloveZ,
      1,
      0.34,
      0.02,
      -0.32,
      0.02,
      palmAxis,
      palmX,
      palmY,
      palmZ,
      false,
      true,
      0.02,
      kind === "butterfly",
    );
    poseGoalieHand(
      body,
      l,
      lf,
      GOALIE_BLOCKER_SHOULDER.x,
      GOALIE_BLOCKER_SHOULDER.y,
      GOALIE_BLOCKER_SHOULDER.z,
      gripX,
      gripY,
      gripZ,
      -1,
      0.24,
      0.03,
      -0.22,
      0.05,
      boardAxis,
      faceX,
      faceY,
      faceZ,
      false,
      true,
      alongPad ? 0.004 : 0.02,
      kind === "butterfly",
    );
    if (kind === "mid" || kind === "butterfly") break;
    _hand.set(0.02, -0.32, 0.02);
    rf.localToWorld(_hand);
    const pocketY = _hand.y;
    rf.getWorldPosition(_best);
    const above = pocketY - _best.y;
    if (above >= 0.02 && above <= 0.045) break;
    gloveY += (0.032 - above) * 0.7;
  }
  if (alongPad && shin) {
    const board = lf.getObjectByName("goalieBlocker");
    if (board) alignBlockerToPad(board, shin);
  }
}

const _playBot = new THREE.Vector3();

type PlayTop = { x: number; y: number; z: number };

function playBlockerReaches(top: PlayTop): boolean {
  const dx = top.x - GOALIE_BLOCKER_SHOULDER.x;
  const dy = top.y - GOALIE_BLOCKER_SHOULDER.y;
  const dz = top.z - GOALIE_BLOCKER_SHOULDER.z;
  return Math.hypot(dx, dy, dz) <= PLAY_BLOCKER_REACH - 0.02;
}

/** Lowest in-reach point on the shaft, at least PLAY_HAND_GAP below the stick origin. */
function gloveOnPlayShaft(body: THREE.Object3D, stick: THREE.Object3D, out: THREE.Vector3): number {
  const blade = stick.getObjectByName("goalieBlade");
  const end = blade ? blade.position.y : -0.7;
  if (end > -0.15) return -1;
  const limit = end * 0.82;
  stick.updateWorldMatrix(true, true);
  _best.set(0, 0, 0);
  stick.localToWorld(_best);
  body.worldToLocal(_best);
  const topX = _best.x;
  const topY = _best.y;
  const topZ = _best.z;
  const sx = GOALIE_GLOVE_SHOULDER.x;
  const sy = GOALIE_GLOVE_SHOULDER.y;
  const sz = GOALIE_GLOVE_SHOULDER.z;
  let gap = -1;
  for (let i = 1; i <= 28; i++) {
    const y = (limit * i) / 28;
    _hand.set(0, y, 0);
    stick.localToWorld(_hand);
    body.worldToLocal(_hand);
    const dist = Math.hypot(_hand.x - sx, _hand.y - sy, _hand.z - sz);
    if (dist > PLAY_GLOVE_REACH) continue;
    const along = Math.hypot(_hand.x - topX, _hand.y - topY, _hand.z - topZ);
    if (along < PLAY_HAND_GAP) continue;
    if (along > gap) {
      gap = along;
      out.copy(_hand);
    }
  }
  return gap;
}

/** Shaft point nearest the catcher shoulder. The pocket aims here when reach runs out. */
function closestPlayShaft(body: THREE.Object3D, stick: THREE.Object3D, out: THREE.Vector3): void {
  const blade = stick.getObjectByName("goalieBlade");
  const end = blade ? blade.position.y : -0.7;
  const sx = GOALIE_GLOVE_SHOULDER.x;
  const sy = GOALIE_GLOVE_SHOULDER.y;
  const sz = GOALIE_GLOVE_SHOULDER.z;
  let best = Infinity;
  stick.updateWorldMatrix(true, true);
  for (let i = 2; i <= 24; i++) {
    const y = (end * i) / 28;
    _hand.set(0, y, 0);
    stick.localToWorld(_hand);
    body.worldToLocal(_hand);
    const dist = Math.hypot(_hand.x - sx, _hand.y - sy, _hand.z - sz);
    if (dist < best) {
      best = dist;
      out.copy(_hand);
    }
  }
}

function playStickLow(stick: THREE.Object3D): number {
  let best = Infinity;
  stick.updateWorldMatrix(true, true);
  stick.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return;
    for (let i = 0; i < 8; i++) {
      _face.set(
        i & 1 ? bb.max.x : bb.min.x,
        i & 2 ? bb.max.y : bb.min.y,
        i & 4 ? bb.max.z : bb.min.z,
      );
      mesh.localToWorld(_face);
      if (_face.y < best) best = _face.y;
    }
  });
  return best;
}

/**
 * Aim the stick from the blocker anchor to a heel on the ice.
 * Stick local +Y runs back up the shaft. The ice mesh sits 0.13 ahead of the heel.
 * Returns the shaft length, or 0 when the anchor and the heel are the same point.
 */
function plantPlayStick(
  stick: THREE.Object3D,
  heelX: number,
  heelY: number,
  heelZ: number,
  catcherX: number,
  catcherY: number,
  catcherZ: number,
  fwdX: number,
  fwdY: number,
  fwdZ: number,
): number {
  const fore = stick.parent;
  const shaft = stick.getObjectByName("goalieShaft");
  const blade = stick.getObjectByName("goalieBlade");
  const knob = stick.getObjectByName("goalieKnob");
  const ice = blade?.getObjectByName("goalieIce") ?? null;
  if (!fore || !shaft || !blade || !knob || !ice) return 0;
  stick.position.set(PLAY_STICK_ANCHOR.x, PLAY_STICK_ANCHOR.y, PLAY_STICK_ANCHOR.z);
  stick.quaternion.identity();
  stick.scale.set(1, 1, 1);
  stick.visible = true;
  fore.updateWorldMatrix(true, false);
  _hand.set(heelX, heelY, heelZ);
  fore.worldToLocal(_hand);
  _dir.set(
    _hand.x - PLAY_STICK_ANCHOR.x,
    _hand.y - PLAY_STICK_ANCHOR.y,
    _hand.z - PLAY_STICK_ANCHOR.z,
  );
  const lower = _dir.length();
  if (lower < 0.2) return 0;
  _dir.multiplyScalar(1 / lower);
  _face.set(-_dir.x, -_dir.y, -_dir.z);
  fore.getWorldQuaternion(_q);
  _legInv.copy(_q).invert();
  _best.set(catcherX, catcherY, catcherZ).applyQuaternion(_legInv);
  _best.addScaledVector(_face, -_best.dot(_face));
  if (_best.lengthSq() < 1e-8) _best.set(1, 0, 0);
  else _best.normalize();
  _z.crossVectors(_best, _face);
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
  else _z.normalize();
  _best.crossVectors(_face, _z).normalize();
  _m.makeBasis(_best, _face, _z);
  stick.quaternion.setFromRotationMatrix(_m);
  stick.position.set(PLAY_STICK_ANCHOR.x, PLAY_STICK_ANCHOR.y, PLAY_STICK_ANCHOR.z);
  const shaftBottom = -lower;
  const shaftTop = lower * 0.5;
  shaft.position.set(0, (shaftTop + shaftBottom) * 0.5, 0);
  shaft.scale.set(1, shaftTop - shaftBottom, 1);
  knob.position.set(0, shaftTop, 0);
  blade.position.set(0, -lower, 0);
  blade.scale.set(1, 1, 1);
  _x.set(catcherX, catcherY, catcherZ);
  _y.set(0, 1, 0);
  _z.set(fwdX, fwdY, fwdZ);
  _x.addScaledVector(_y, -_x.dot(_y));
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  else _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  _rootQ.setFromRotationMatrix(_m);
  stick.updateWorldMatrix(true, false);
  stick.getWorldQuaternion(_q);
  blade.quaternion.copy(_q.invert()).multiply(_rootQ);
  ice.position.set(0, 0.016 - (heelY - (PLAY_ICE_Y + 0.002)), 0.13);
  return lower;
}

function posePlayBlocker(
  body: THREE.Object3D,
  l: THREE.Object3D,
  lf: THREE.Object3D,
  top: PlayTop,
  boardAxis: THREE.Vector3,
  fwdX: number,
  fwdY: number,
  fwdZ: number,
) {
  poseGoalieHand(
    body,
    l,
    lf,
    GOALIE_BLOCKER_SHOULDER.x,
    GOALIE_BLOCKER_SHOULDER.y,
    GOALIE_BLOCKER_SHOULDER.z,
    top.x,
    top.y,
    top.z,
    -1,
    0.24,
    PLAY_STICK_ANCHOR.x,
    PLAY_STICK_ANCHOR.y,
    PLAY_STICK_ANCHOR.z,
    boardAxis,
    fwdX,
    fwdY,
    fwdZ,
    false,
    true,
  );
}

/** Blocker board along the shaft, broad face toward the shooter. */
function alignBlockerToShaft(
  board: THREE.Object3D,
  stick: THREE.Object3D,
  fwdX: number,
  fwdY: number,
  fwdZ: number,
) {
  const parent = board.parent;
  if (!parent) return;
  stick.updateWorldMatrix(true, true);
  parent.updateWorldMatrix(true, false);
  stick.getWorldQuaternion(_q);
  _y.set(0, 1, 0).applyQuaternion(_q);
  _x.set(fwdX, fwdY, fwdZ);
  _x.addScaledVector(_y, -_x.dot(_y));
  if (_y.lengthSq() < 1e-8 || _x.lengthSq() < 1e-8) return;
  _y.normalize();
  _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m);
  parent.getWorldQuaternion(_bodyInv);
  board.quaternion.copy(_bodyInv.invert()).multiply(_q);
}

/**
 * Both hands on the stick, skater style, over a perimeter body.
 * The blocker is the top hand. The catcher is the bottom hand, on the shaft.
 * The ice blade is at the puck when that point is in front of the pads and in reach,
 * and stays in front of the pads when the puck is not.
 * `padFront` is the pad face along the goalie's forward axis, in world meters.
 */
export function poseGoaliePlay(
  l: THREE.Object3D,
  lf: THREE.Object3D,
  r: THREE.Object3D,
  rf: THREE.Object3D,
  stick: THREE.Object3D,
  puckX: number,
  puckZ: number,
  padFront: number,
  palmAxis: THREE.Vector3,
  boardAxis: THREE.Vector3,
) {
  const body = l.parent;
  const root = body?.parent;
  if (!body || !root || stick.parent !== lf) return;
  root.updateWorldMatrix(true, true);
  root.getWorldQuaternion(_rootQ);
  _z.set(0, 0, 1).applyQuaternion(_rootQ);
  _z.y = 0;
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
  else _z.normalize();
  _x.crossVectors(_up, _z);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  else _x.normalize();
  _z.crossVectors(_x, _up).normalize();
  const fx = _z.x;
  const fy = _z.y;
  const fz = _z.z;
  const cx = _x.x;
  const cy = _x.y;
  const cz = _x.z;
  root.getWorldPosition(_hip);
  const ox = _hip.x;
  const oz = _hip.z;
  const dx = puckX - ox;
  const dz = puckZ - oz;
  let fwd = dx * fx + dz * fz;
  let lat = dx * cx + dz * cz;
  const minFwd = Math.max(0.24, padFront + PLAY_ICE_LEAD);
  const maxFwd = Math.max(minFwd + 0.08, PLAY_ICE_MAX);
  if (fwd > maxFwd) {
    lat *= maxFwd / Math.max(fwd, 0.05);
    fwd = maxFwd;
  }
  if (fwd < minFwd) fwd = minFwd;
  lat = Math.max(-0.55, Math.min(0.7, lat));
  const wantFwd = fwd;
  const wantLat = lat;
  const tops: PlayTop[] = [
    { x: Math.max(-0.16, Math.min(0.08, -0.02 + wantLat * 0.12)), y: 1.2, z: 0.3 },
    { x: -0.1, y: 1.16, z: 0.34 },
    { x: 0.04, y: 1.22, z: 0.26 },
  ];
  let winTop = tops[0]!;
  let winFwd = wantFwd;
  let winLat = wantLat;
  let winGap = -1;
  const score = (top: PlayTop, along: number, side: number) => {
    if (!playBlockerReaches(top)) return;
    posePlayBlocker(body, l, lf, top, boardAxis, fx, fy, fz);
    const heelX = ox + fx * (along - 0.13) + cx * side;
    const heelZ = oz + fz * (along - 0.13) + cz * side;
    if (plantPlayStick(stick, heelX, PLAY_ICE_Y, heelZ, cx, cy, cz, fx, fy, fz) < 0.2) return;
    const gap = gloveOnPlayShaft(body, stick, _playBot);
    if (gap < 0) return;
    const closerIce = along > winFwd + 0.03;
    const betterGap = gap > winGap + 0.02;
    const take =
      winGap < 0 ||
      (gap >= PLAY_HAND_GAP && winGap < PLAY_HAND_GAP) ||
      (gap >= PLAY_HAND_GAP &&
        winGap >= PLAY_HAND_GAP &&
        (closerIce || (!closerIce && along >= winFwd - 0.03 && betterGap))) ||
      (winGap < PLAY_HAND_GAP && gap >= winGap && betterGap);
    if (!take) return;
    winTop = top;
    winFwd = along;
    winLat = side;
    winGap = gap;
  };
  for (const top of tops) score(top, wantFwd, wantLat);
  if (winGap < PLAY_HAND_GAP) {
    let along = wantFwd;
    for (let n = 0; n < 6 && along > minFwd + 0.05; n++) {
      along = minFwd + (along - minFwd) * 0.62;
      const side = wantLat * (along / Math.max(wantFwd, 0.05));
      for (const top of tops) score(top, along, side);
      if (winGap >= PLAY_HAND_GAP) break;
    }
  }
  posePlayBlocker(body, l, lf, winTop, boardAxis, fx, fy, fz);
  let heelY = PLAY_ICE_Y;
  const heelAt = (y: number) => {
    const heelX = ox + fx * (winFwd - 0.13) + cx * winLat;
    const heelZ = oz + fz * (winFwd - 0.13) + cz * winLat;
    return plantPlayStick(stick, heelX, y, heelZ, cx, cy, cz, fx, fy, fz);
  };
  if (heelAt(heelY) >= 0.2) {
    for (let i = 0; i < 3; i++) {
      const low = playStickLow(stick);
      if (!Number.isFinite(low) || low >= PLAY_ICE_Y - 0.0005) break;
      heelY += PLAY_ICE_Y - low;
      if (heelAt(heelY) < 0.2) break;
    }
  }
  const gap = gloveOnPlayShaft(body, stick, _playBot);
  if (gap < 0) closestPlayShaft(body, stick, _playBot);
  poseGoalieHand(
    body,
    r,
    rf,
    GOALIE_GLOVE_SHOULDER.x,
    GOALIE_GLOVE_SHOULDER.y,
    GOALIE_GLOVE_SHOULDER.z,
    _playBot.x,
    _playBot.y,
    _playBot.z,
    1,
    0.34,
    0.02,
    -0.32,
    0.02,
    palmAxis,
    0,
    1,
    0,
    false,
    true,
  );
  const board = lf.getObjectByName("goalieBlocker");
  if (board) alignBlockerToShaft(board, stick, fx, fy, fz);
}
