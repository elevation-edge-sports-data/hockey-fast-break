/**
 * Right-shot skater stick in the mesh frame (root yaw is yaw+π).
 * Local −X is the shooter's right. Local +Z is forward. Local +Y is up.
 * Facing +X (yaw −π/2) local −X is world +Z, classic-camera screen-right.
 * The carry plate is the point stickBlade, pickup, and the mesh share.
 */

export const SKATER_STICK_LEN = 1.66;
export const SKATER_GRIP_TOP = 0.92;
export const SKATER_GRIP_BOT = 0.74;

export type StickAim = {
  heel: [number, number, number];
  shaft: [number, number, number];
  blade: [number, number, number];
};

type V3 = { x: number; y: number; z: number };

export type StickFrame = {
  heel: V3;
  axisX: V3;
  axisY: V3;
  axisZ: V3;
  plate: V3;
  toe: V3;
  knob: V3;
  top: V3;
  bot: V3;
};

const CARRY_PITCH = (30 * Math.PI) / 180;
const CARRY_YAW = (98 * Math.PI) / 180;

function v(x: number, y: number, z: number): V3 {
  return { x, y, z };
}

function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function add(a: V3, b: V3, s = 1): V3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

function cross(a: V3, b: V3): V3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm(a: V3): V3 {
  const m = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / m, y: a.y / m, z: a.z / m };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function tuple(p: V3): [number, number, number] {
  return [p.x, p.y, p.z];
}

/** Two-hand carry and the one-hand reach share this blade-on-ice aim. */
export function carryStickAim(): StickAim {
  const shaft = norm(
    v(
      Math.sin(CARRY_PITCH) * Math.sin(CARRY_YAW),
      Math.cos(CARRY_PITCH),
      Math.sin(CARRY_PITCH) * Math.cos(CARRY_YAW),
    ),
  );
  return {
    heel: [-0.94, 0, 0.28],
    shaft: tuple(shaft),
    blade: [-0.28, 0, 1],
  };
}

/** Standing stick: shaft level with the ice, on the shooter's right, toe raised. */
export function restStickAim(): StickAim {
  return {
    heel: [-0.52, 0.78, 0.42],
    shaft: [0, 0, -1],
    blade: [-0.42, 0.91, 0],
  };
}

/**
 * Swing around the carry top hand. t < 0 is windup, t = 0 is the carry plate, t > 0 is follow-through.
 * The plate stays on local −X the whole way.
 */
export function shotStickAim(t: number): StickAim {
  const carry = stickFrame(carryStickAim());
  const u = t < 0 ? -t : t;
  const s = u * u * (3 - 2 * u);
  const wind = norm(v(0.32, 0.42, 0.85));
  const follow = norm(v(0.4, 0.7, -0.4));
  const toward = t < 0 ? wind : follow;
  const shaft = norm(
    v(
      lerp(carry.axisY.x, toward.x, s),
      lerp(carry.axisY.y, toward.y, s),
      lerp(carry.axisY.z, toward.z, s),
    ),
  );
  const reach = SKATER_STICK_LEN * SKATER_GRIP_TOP;
  const heel = add(carry.top, shaft, -reach);
  const blade = t < 0 ? v(lerp(-0.28, -0.15, s), lerp(0, 0.9, s), lerp(1, 0.35, s)) : v(lerp(-0.28, -0.2, s), lerp(0, 0.75, s), lerp(1, 0.55, s));
  return { heel: tuple(heel), shaft: tuple(shaft), blade: tuple(blade) };
}

/** Stick local +Y is the shaft toward the knob. Stick local +Z is the toe. */
export function stickFrame(aim: StickAim): StickFrame {
  const heel = v(aim.heel[0], aim.heel[1], aim.heel[2]);
  const axisY = norm(v(aim.shaft[0], aim.shaft[1], aim.shaft[2]));
  const aimB = v(aim.blade[0], aim.blade[1], aim.blade[2]);
  let axisZ = norm(add(aimB, axisY, -dot(aimB, axisY)));
  const axisX = norm(cross(axisY, axisZ));
  axisZ = norm(cross(axisX, axisY));
  const along = (y: number, z: number) => add(add(heel, axisY, y), axisZ, z);
  return {
    heel,
    axisX,
    axisY,
    axisZ,
    plate: along(0.026, 0.19),
    toe: along(0.024, 0.4),
    knob: along(SKATER_STICK_LEN, 0),
    top: along(SKATER_STICK_LEN * SKATER_GRIP_TOP, 0),
    bot: along(SKATER_STICK_LEN * SKATER_GRIP_BOT, 0),
  };
}

const CARRY = stickFrame(carryStickAim());

export function skaterPlateLocal(): V3 {
  return CARRY.plate;
}

export function skaterKnobLocal(): V3 {
  return CARRY.knob;
}
