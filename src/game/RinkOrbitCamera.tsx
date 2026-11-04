import { useEffect, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { classicFormationEye, formationOrbitFromEye } from "./formationLibrary";
import { ACCEPT_PLAYER, ACCEPT_PUCK, basisFromCameraElements, type MarkLock } from "./iceMark";
import { world } from "./sim";

export type RinkPick = MarkLock | { kind: "ice"; x: number; z: number };

export type RinkOrbit = { theta: number; phi: number; radius: number };

const PHI_MIN = 0.12;
const PHI_MAX = 1.45;
const RADIUS_MIN = 4.2;
const RADIUS_MAX = 120;
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

export function RinkOrbitCamera({
  getLook,
  orbit,
  adjusted,
  viewRadius,
  basis,
  onPick,
}: {
  getLook: () => { x: number; y: number; z: number };
  orbit: MutableRefObject<RinkOrbit>;
  adjusted: MutableRefObject<boolean>;
  viewRadius: MutableRefObject<number>;
  basis: MutableRefObject<{ rx: number; rz: number; fx: number; fz: number }>;
  onPick: (hit: RinkPick) => void;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const getLookRef = useRef(getLook);
  const onPickRef = useRef(onPick);
  getLookRef.current = getLook;
  onPickRef.current = onPick;

  useEffect(() => {
    const el = gl.domElement;
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
      seedFormationOrbit(getLookRef.current(), orbit.current, adjusted);
      const o = orbit.current;
      o.theta += dx * 0.008;
      o.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, o.phi - dy * 0.006));
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
      seedFormationOrbit(getLookRef.current(), orbit.current, adjusted);
      const o = orbit.current;
      o.radius = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, o.radius + e.deltaY * 0.02));
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
  }, [adjusted, camera, gl, orbit]);

  useFrame(() => {
    const look = getLookRef.current();
    if (!adjusted.current) {
      const eye = classicFormationEye(look);
      camera.up.set(eye.atk, 0, 0);
      camera.position.set(eye.x, eye.y, eye.z);
    } else {
      const o = orbit.current;
      const sp = Math.sin(o.phi);
      const cp = Math.cos(o.phi);
      camera.up.set(0, 1, 0);
      camera.position.set(
        look.x + o.radius * sp * Math.cos(o.theta),
        look.y + o.radius * cp,
        look.z + o.radius * sp * Math.sin(o.theta),
      );
    }
    camera.lookAt(look.x, look.y, look.z);
    if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - 50) > 0.2) {
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    viewRadius.current = Math.max(RADIUS_MIN, camera.position.distanceTo(_look.set(look.x, look.y, look.z)));
    basis.current = basisFromCameraElements(camera.matrixWorld.elements);
  });

  return null;
}
