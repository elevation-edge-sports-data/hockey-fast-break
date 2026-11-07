import { useEffect, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { classicFormationEye, formationOrbitFromEye } from "./formationLibrary";
import { ACCEPT_PLAYER, ACCEPT_PUCK, basisFromCameraElements, type IceMark, type MarkLock } from "./iceMark";
import {
  claimReplayFreestyle,
  placeReplayCamera,
  replayAttackUp,
  replayChaseAim,
  replayOrbitEye,
  REPLAY_FREESTYLE_FOV,
  REPLAY_PHI_MAX,
  REPLAY_PHI_MIN,
  REPLAY_RADIUS_MAX,
  REPLAY_RADIUS_MIN,
  type CamPoint,
} from "./replayCameras";
import { world } from "./sim";
import type { CamMode } from "./store";

export type RinkPick = MarkLock | { kind: "ice"; x: number; z: number };

export type RinkOrbit = { theta: number; phi: number; radius: number };

const _look = new THREE.Vector3();

export function seedFormationOrbit(
  look: { x: number; y: number; z: number },
  orbit: RinkOrbit,
  adjusted: { current: boolean },
): void {
  if (adjusted.current) return;
  adjusted.current = true;
  const seeded = formationOrbitFromEye(look, classicFormationEye(look));
  orbit.theta = seeded.theta;
  orbit.phi = seeded.phi;
  orbit.radius = seeded.radius;
}

function nearer(ray: THREE.Ray, sphere: THREE.Sphere, hit: THREE.Vector3, bestDist: number): number | null {
  const point = ray.intersectSphere(sphere, hit);
  if (!point) return null;
  const dist = ray.origin.distanceTo(point);
  return dist < bestDist ? dist : null;
}

/** Body spheres sit on the shadow center. A miss is the ice plane under the cursor. */
export function pickRink(ray: THREE.Ray): RinkPick {
  const hit = new THREE.Vector3();
  let bestDist = Infinity;
  let best: RinkPick | null = null;
  const puckDist = nearer(
    ray,
    new THREE.Sphere(new THREE.Vector3(world.puck.x, Math.max(0.2, world.puck.y), world.puck.z), ACCEPT_PUCK),
    hit,
    bestDist,
  );
  if (puckDist !== null) {
    bestDist = puckDist;
    best = { kind: "puck" };
  }
  for (let i = 0; i < world.skaters.length; i++) {
    const s = world.skaters[i]!;
    const x = Number.isFinite(s.comX) ? s.comX : s.x;
    const z = Number.isFinite(s.comZ) ? s.comZ : s.z;
    const dist = nearer(ray, new THREE.Sphere(new THREE.Vector3(x, 1, z), ACCEPT_PLAYER), hit, bestDist);
    if (dist !== null) {
      bestDist = dist;
      best = { kind: "skater", index: i };
    }
  }
  if (best) return best;
  if (Math.abs(ray.direction.y) < 1e-6) return { kind: "ice", x: ray.origin.x, z: ray.origin.z };
  const t = -ray.origin.y / ray.direction.y;
  if (!(t >= 0)) return { kind: "ice", x: ray.origin.x, z: ray.origin.z };
  return {
    kind: "ice",
    x: ray.origin.x + ray.direction.x * t,
    z: ray.origin.z + ray.direction.z * t,
  };
}

function setFov(camera: THREE.PerspectiveCamera, fov: number): void {
  if (Math.abs(camera.fov - fov) > 0.2) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

function placeOrbit(camera: THREE.PerspectiveCamera, look: CamPoint, orbit: RinkOrbit, fov: number): void {
  const eye = replayOrbitEye(look, orbit);
  camera.up.set(0, 1, 0);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(look.x, look.y, look.z);
  setFov(camera, fov);
}

type Rig = {
  ready: boolean;
  mode: string;
  fx: number;
  fy: number;
  fz: number;
  hx: number;
  hz: number;
  px: number;
  py: number;
  pz: number;
  lx: number;
  ly: number;
  lz: number;
  puckX: number;
  puckZ: number;
  havePuck: boolean;
};

function freshRig(): Rig {
  return {
    ready: false,
    mode: "",
    fx: 0,
    fy: 0.45,
    fz: 0,
    hx: 1,
    hz: 0,
    px: 0,
    py: 9.4,
    pz: 0,
    lx: 0,
    ly: 0.6,
    lz: 0,
    puckX: 0,
    puckZ: 0,
    havePuck: false,
  };
}

export function RinkOrbitCamera({
  getLook,
  orbit,
  adjusted,
  viewRadius,
  basis,
  onPick,
  camModeRef,
  onFreestyle,
  eyeRef,
  mark,
}: {
  getLook: () => { x: number; y: number; z: number };
  orbit: MutableRefObject<RinkOrbit>;
  adjusted: MutableRefObject<boolean>;
  viewRadius: MutableRefObject<number>;
  basis: MutableRefObject<{ rx: number; rz: number; fx: number; fz: number }>;
  onPick: (hit: RinkPick) => void;
  /** Replay viewer modes. The formation library leaves this unset and keeps the classic-until-drag orbit. */
  camModeRef?: MutableRefObject<CamMode>;
  onFreestyle?: () => void;
  eyeRef?: MutableRefObject<CamPoint | null>;
  mark?: MutableRefObject<IceMark>;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const getLookRef = useRef(getLook);
  const onPickRef = useRef(onPick);
  const onFreestyleRef = useRef(onFreestyle);
  const rig = useRef<Rig>(freshRig());
  getLookRef.current = getLook;
  onPickRef.current = onPick;
  onFreestyleRef.current = onFreestyle;

  useEffect(() => {
    const el = gl.domElement;
    const claim = () => {
      if (!camModeRef) {
        seedFormationOrbit(getLookRef.current(), orbit.current, adjusted);
        return;
      }
      const next = claimReplayFreestyle({
        mode: camModeRef.current,
        adjusted,
        orbit: orbit.current,
        look: getLookRef.current(),
        eye: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      });
      if (next !== camModeRef.current) {
        camModeRef.current = next;
        onFreestyleRef.current?.();
      }
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag.current = { x: e.clientX, y: e.clientY, moved: false };
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && dx * dx + dy * dy < 16) return;
      d.moved = true;
      d.x = e.clientX;
      d.y = e.clientY;
      claim();
      const o = orbit.current;
      o.theta += dx * 0.008;
      o.phi = Math.max(REPLAY_PHI_MIN, Math.min(REPLAY_PHI_MAX, o.phi - dy * 0.006));
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d || d.moved) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const caster = new THREE.Raycaster();
      caster.setFromCamera(ndc, camera);
      onPickRef.current(pickRink(caster.ray));
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      claim();
      const o = orbit.current;
      o.radius = Math.max(REPLAY_RADIUS_MIN, Math.min(REPLAY_RADIUS_MAX, o.radius + e.deltaY * 0.02));
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [adjusted, camModeRef, camera, gl, orbit]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const look = getLookRef.current();
    const selected = camModeRef?.current;
    const persp = camera as THREE.PerspectiveCamera;

    if (!camModeRef || !selected) {
      if (!adjusted.current) {
        const eye = classicFormationEye(look);
        camera.up.set(eye.atk, 0, 0);
        camera.position.set(eye.x, eye.y, eye.z);
      } else {
        placeOrbit(persp, look, orbit.current, 50);
      }
      if (!adjusted.current) {
        camera.lookAt(look.x, look.y, look.z);
        setFov(persp, 50);
      }
    } else if (selected === "freestyle") {
      if (!adjusted.current) {
        claimReplayFreestyle({
          mode: "freestyle",
          adjusted,
          orbit: orbit.current,
          look,
          eye: null,
        });
      }
      rig.current.mode = "freestyle";
      placeOrbit(persp, look, orbit.current, REPLAY_FREESTYLE_FOV);
    } else {
      const state = rig.current;
      let vx = 0;
      let vz = 0;
      if (state.havePuck && dt > 1e-4) {
        const dx = world.puck.x - state.puckX;
        const dz = world.puck.z - state.puckZ;
        if (Math.hypot(dx, dz) < 8) {
          vx = dx / dt;
          vz = dz / dt;
        }
      }
      const jump = Math.hypot(look.x - state.fx, look.z - state.fz);
      const switched = !state.ready || state.mode !== selected;
      const spd = Math.hypot(vx, vz);
      const rate = jump > 9 ? 14 : 4.6 + Math.min(9, spd * 0.42);
      const followK = switched || jump > 16 ? 1 : 1 - Math.exp(-rate * dt);
      state.fx += (look.x - state.fx) * followK;
      state.fy += (look.y - state.fy) * followK;
      state.fz += (look.z - state.fz) * followK;
      const aim = replayChaseAim(
        mark?.current.lock ?? null,
        world.skaters,
        world.puck.owner,
        { x: vx, z: vz },
        { x: state.hx, z: state.hz },
      );
      const headingK = switched ? 1 : 1 - Math.exp(-2.4 * dt);
      state.hx += (aim.x - state.hx) * headingK;
      state.hz += (aim.z - state.hz) * headingK;
      const hm = Math.hypot(state.hx, state.hz) || 1;
      state.hx /= hm;
      state.hz /= hm;
      const pose = placeReplayCamera(
        selected,
        { x: state.fx, y: state.fy, z: state.fz },
        replayAttackUp(world.homeAttack),
        { x: state.hx, z: state.hz },
      );
      if (selected === "high" || switched) {
        state.px = pose.eye.x;
        state.py = pose.eye.y;
        state.pz = pose.eye.z;
        state.lx = pose.look.x;
        state.ly = pose.look.y;
        state.lz = pose.look.z;
      } else {
        const ex = pose.eye.x - state.px;
        const ey = pose.eye.y - state.py;
        const ez = pose.eye.z - state.pz;
        const dist = Math.hypot(ex, ey, ez);
        const pk = dist > 18 ? 1 : 1 - Math.exp(-2.4 * dt);
        state.px += ex * pk;
        state.py += ey * pk;
        state.pz += ez * pk;
        const lk = 1 - Math.exp(-3.2 * dt);
        state.lx += (pose.look.x - state.lx) * lk;
        state.ly += (pose.look.y - state.ly) * lk;
        state.lz += (pose.look.z - state.lz) * lk;
      }
      if (selected === "classic") state.pz = state.lz;
      state.ready = true;
      state.mode = selected;
      camera.up.set(pose.up.x, pose.up.y, pose.up.z);
      camera.position.set(state.px, state.py, state.pz);
      camera.lookAt(state.lx, state.ly, state.lz);
      setFov(persp, pose.fov);
    }

    camera.updateMatrixWorld();
    viewRadius.current = Math.max(REPLAY_RADIUS_MIN, camera.position.distanceTo(_look.set(look.x, look.y, look.z)));
    basis.current = basisFromCameraElements(camera.matrixWorld.elements);
    if (eyeRef) eyeRef.current = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    if (camModeRef) {
      statePuck(rig.current);
      const el = gl.domElement;
      el.dataset.camMode = camModeRef.current;
      el.dataset.camX = camera.position.x.toFixed(3);
      el.dataset.camY = camera.position.y.toFixed(3);
      el.dataset.camZ = camera.position.z.toFixed(3);
    }
  });

  return null;
}

function statePuck(state: Rig): void {
  state.puckX = world.puck.x;
  state.puckZ = world.puck.z;
  state.havePuck = true;
}
