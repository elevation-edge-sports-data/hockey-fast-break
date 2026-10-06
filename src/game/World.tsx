import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Arena } from "./Arena";
import { Rink } from "./Rink.tsx";
import { PlayerMesh, PUCK_MARK_INNER, PuckMesh, RefereeMesh, USER_MARK_INNER } from "./PlayerMesh";
import { attachInput } from "./input";
import { installControlsProbe, replayLockKind, stepSim, world } from "./sim";
import { useGame, type CamMode } from "./store";
import { BOARD_H, BLUE_X, GOAL_LINE_X, resolveRink, RINK_L, RINK_W } from "./rink.ts";

function LookSync() {
  const look = useGame((s) => s.arenaLook);
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const dark = look === "dark";
    gl.toneMappingExposure = dark ? 0.7 : 0.88;
    gl.setClearColor(dark ? "#070b12" : "#0c121c");
    scene.environmentIntensity = dark ? 0.32 : 1;
  }, [look, gl, scene]);
  return null;
}

/** Under-stroke corner in group space. The burgundy bars are shorter. */
const REPLAY_X_REACH = Math.hypot(1.9 / 2, 0.28 / 2);

function ReplayIceMark() {
  const ref = useRef<THREE.Group>(null);
  const wasOn = useRef(false);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const on = world.replay && world.replayKind === "pause";
    g.visible = on;
    if (!on) {
      wasOn.current = false;
      return;
    }
    // Player ring hole, or the disc around the puck while that lock is held.
    const hole = replayLockKind() === "puck" ? PUCK_MARK_INNER : USER_MARK_INNER;
    const s = hole / REPLAY_X_REACH;
    g.scale.set(s, 1, s);
    if (!wasOn.current) {
      g.position.set(world.puck.x, 0.08, world.puck.z);
      wasOn.current = true;
    } else {
      g.position.set(world.replayCam.lx, 0.08, world.replayCam.lz);
    }
  });
  return (
    <group ref={ref} name="replay-center" visible={false} frustumCulled={false}>
      <mesh rotation={[0, Math.PI / 4, 0]} position={[0, -0.01, 0]}>
        <boxGeometry args={[1.9, 0.02, 0.28]} />
        <meshBasicMaterial color="#1a1404" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]} position={[0, -0.01, 0]}>
        <boxGeometry args={[1.9, 0.02, 0.28]} />
        <meshBasicMaterial color="#1a1404" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[1.75, 0.035, 0.16]} />
        <meshBasicMaterial color="#5a1021" toneMapped={false} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[1.75, 0.035, 0.16]} />
        <meshBasicMaterial color="#5a1021" toneMapped={false} />
      </mesh>
    </group>
  );
}

function SimLoop() {
  const acc = useRef(0);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    const rate = Math.max(0.45, Math.min(1.6, useGame.getState().gameSpeed));
    acc.current += d * rate;
    const step = 1 / 60;
    let n = 0;
    while (acc.current >= step && n < 8) {
      stepSim(step);
      acc.current -= step;
      n++;
    }
  });
  return null;
}

const ORBIT_TOUCHES = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

const _desired = new THREE.Vector3(-13.6, 9.6, 0);
const _look = new THREE.Vector3(1.4, 0.4, 0);
const _pos = new THREE.Vector3(-13.6, 9.6, 0);
const _ndc = new THREE.Vector3();
const _follow = new THREE.Vector3(0, 0.45, 0);
const _lookSmooth = new THREE.Vector3(1.4, 0.4, 0);
const _puckWorld = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _pauseHoldPos = new THREE.Vector3();
const _pauseHoldQuat = new THREE.Quaternion();
const _pauseDolly = new THREE.Vector3();
let _pauseHoldTheta = 0;
let _pauseHoldPhi = 0;
let _pauseHoldRadius = 0;
let _pauseHolding = false;
let _crowdCam = false;
let _crowdCut = false;

function stopPausedOrbit(controls: unknown) {
  if (!controls || typeof controls !== "object") return;
  const orbit = controls as { enabled?: boolean; autoRotate?: boolean; enableDamping?: boolean };
  orbit.autoRotate = false;
  orbit.enableDamping = false;
  orbit.enabled = false;
}

function writeCamBasis(camera: THREE.Camera) {
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  let fx = -e[8];
  let fz = -e[10];
  let rx = e[0];
  let rz = e[2];
  const fm = Math.hypot(fx, fz);
  if (fm < 0.12) {
    fx = e[4];
    fz = e[6];
    const m = Math.hypot(fx, fz) || 1;
    fx /= m;
    fz /= m;
    rx = -fz;
    rz = fx;
  } else {
    fx /= fm;
    fz /= fm;
    const rm = Math.hypot(rx, rz) || 1;
    rx /= rm;
    rz /= rm;
  }
  world.camFx = fx;
  world.camFz = fz;
  world.camRx = rx;
  world.camRy = e[1];
  world.camRz = rz;
  world.camUx = e[4];
  world.camUy = e[5];
  world.camUz = e[6];
  world.camX = camera.position.x;
  world.camY = camera.position.y;
  world.camZ = camera.position.z;
}

const CLASSIC_MIN_BACK = 2;
const CLASSIC_UP_COS = Math.cos((25 * Math.PI) / 180);

function aimClassic(camera: THREE.PerspectiveCamera, look: THREE.Vector3): void {
  const atk = world.homeAttack > 0 ? 1 : -1;
  camera.up.set(atk, 0, 0);
  camera.position.z = look.z;
  let behind = (look.x - camera.position.x) * atk;
  if (behind < CLASSIC_MIN_BACK) behind = CLASSIC_MIN_BACK;
  camera.position.x = look.x - atk * behind;
  const dy = look.y - camera.position.y;
  const dz = look.z - camera.position.z;
  const len = Math.hypot(behind, dy, dz);
  if (!(len > 1e-4 && behind / len <= CLASSIC_UP_COS)) {
    const minPerp = behind * Math.tan((25 * Math.PI) / 180);
    const need = Math.sqrt(Math.max(0, minPerp * minPerp - dz * dz)) + 1e-3;
    camera.position.y = look.y + need;
  }
  _pos.set(camera.position.x, camera.position.y, camera.position.z);
  camera.lookAt(look);
}

function keepPuckFramed(
  camera: THREE.PerspectiveCamera,
  px: number,
  py: number,
  pz: number,
  lockRoll: boolean,
): void {
  camera.updateMatrixWorld();
  _puckWorld.set(px, py, pz);
  for (let i = 0; i < 3; i++) {
    _ndc.copy(_puckWorld).project(camera);
    const behind = _ndc.z > 1;
    let nx = _ndc.x;
    let ny = _ndc.y;
    if (behind) {
      nx = Math.sign(nx || 1) * 1.25;
      ny = Math.min(ny, -0.85);
    }
    const limX = 0.64;
    const yMin = -0.34;
    const yMax = 0.48;
    const ox = nx > limX ? nx - limX : nx < -limX ? nx + limX : 0;
    const oy = ny > yMax ? ny - yMax : ny < yMin ? ny - yMin : 0;
    if (ox === 0 && oy === 0 && !behind) {
      if (lockRoll) aimClassic(camera, _lookSmooth);
      return;
    }

    const e = camera.matrixWorld.elements;
    _camRight.set(e[0], e[1], e[2]).normalize();
    _camUp.set(e[4], e[5], e[6]).normalize();
    _camFwd.set(-e[8], -e[9], -e[10]).normalize();

    const dist = Math.max(4.5, camera.position.distanceTo(_puckWorld));
    const vFov = (camera.fov * Math.PI) / 180;
    const worldH = 2 * dist * Math.tan(vFov / 2);
    const worldW = worldH * Math.max(0.5, camera.aspect);
    const panX = ox * worldW * 0.52;
    const panY = oy * worldH * 0.52;
    let dx = _camRight.x * panX + _camUp.x * panY;
    const dy = _camRight.y * panX + _camUp.y * panY;
    let dz = _camRight.z * panX + _camUp.z * panY;
    if (lockRoll) {
      dx = _camUp.x * panY;
      dz = 0;
    }
    camera.position.x += dx;
    camera.position.y += dy;
    camera.position.z += dz;
    _pos.copy(camera.position);
    _lookSmooth.x += dx;
    _lookSmooth.y += dy;
    _lookSmooth.z += dz;
    if (behind) {
      camera.position.x -= _camFwd.x * 5.5;
      camera.position.y -= _camFwd.y * 5.5;
      camera.position.z -= lockRoll ? 0 : _camFwd.z * 5.5;
      _pos.copy(camera.position);
      if (lockRoll) {
        _lookSmooth.x = _puckWorld.x;
        _lookSmooth.y = _puckWorld.y;
      } else {
        _lookSmooth.copy(_puckWorld);
      }
    }
    if (lockRoll) aimClassic(camera, _lookSmooth);
    else camera.lookAt(_lookSmooth);
    camera.updateMatrixWorld();
  }
}

function userSkater() {
  return world.skaters[world.userId] ?? world.skaters[0];
}

function puckBlockedByBoards(camera: THREE.Camera): boolean {
  const px = world.puck.x;
  const py = world.puck.y;
  const pz = world.puck.z;
  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;
  for (let i = 1; i <= 10; i++) {
    const t = i / 11;
    const x = cx + (px - cx) * t;
    const y = cy + (py - cy) * t;
    const z = cz + (pz - cz) * t;
    if (y > BOARD_H + 0.04) continue;
    if (resolveRink(x, z, 0.05).hit) return true;
  }
  return false;
}

function projectUser(camera: THREE.Camera) {
  const s = userSkater();
  if (!s) {
    world.userVisible = true;
  } else {
    _ndc.set(s.x, 1.1, s.z).project(camera);
    if (_ndc.z > 1) {
      _ndc.x = -_ndc.x;
      _ndc.y = -_ndc.y;
    }
    world.userSx = _ndc.x;
    world.userSy = _ndc.y;
    world.userVisible = Math.abs(_ndc.x) <= 0.94 && Math.abs(_ndc.y) <= 0.86 && _ndc.z <= 1;
  }
  _ndc.set(world.puck.x, Math.max(0.12, world.puck.y), world.puck.z).project(camera);
  if (_ndc.z > 1) {
    _ndc.x = -_ndc.x;
    _ndc.y = -_ndc.y;
  }
  world.puckSx = _ndc.x;
  world.puckSy = _ndc.y;
  const onScreen = Math.abs(_ndc.x) <= 0.94 && Math.abs(_ndc.y) <= 0.86 && _ndc.z <= 1;
  world.puckVisible = onScreen && !puckBlockedByBoards(camera);
}

function drillFollow(): { x: number; y: number; z: number } | null {
  if (useGame.getState().clockMode !== "drill") return null;
  const s = world.skaters[world.userId];
  if (!s) return null;
  return { x: s.x, y: 1.05, z: s.z };
}

function parkClassicAt(x: number, y: number, z: number, cam: THREE.PerspectiveCamera): void {
  const atk = world.homeAttack > 0 ? 1 : -1;
  const back = 13.2;
  const camX = atk > 0 ? Math.max(-RINK_L / 2 + 1.6, x - back) : Math.min(RINK_L / 2 - 1.6, x + back);
  const zLimit = RINK_W / 2 - 4.8;
  const fz = Math.max(-zLimit, Math.min(zLimit, z));
  const lookX = x + atk * 1.15;
  _follow.set(x, y, z);
  _desired.set(camX, 9.4, fz);
  _look.set(lookX, y + 0.16, fz);
  _pos.copy(_desired);
  _lookSmooth.copy(_look);
  cam.position.copy(_pos);
  aimClassic(cam, _lookSmooth);
}

function seedFreestyleCam(camera: THREE.PerspectiveCamera) {
  const playing = useGame.getState().playing;
  const puck = world.puck;
  const drillCam = playing ? drillFollow() : null;
  const px = drillCam ? drillCam.x : playing ? puck.x : 0;
  const pz = drillCam ? drillCam.z : playing ? puck.z : 0;
  const py = drillCam ? drillCam.y : 0.55;
  camera.up.set(0, 1, 0);
  camera.position.set(px - 12, 9.2, pz + 14);
  camera.lookAt(px, py, pz);
  _pos.copy(camera.position);
  const fc = world.freeCam;
  fc.tx = px;
  fc.ty = py;
  fc.tz = pz;
  const dx = camera.position.x - fc.tx;
  const dy = camera.position.y - fc.ty;
  const dz = camera.position.z - fc.tz;
  fc.radius = Math.max(8, Math.hypot(dx, dy, dz));
  fc.phi = Math.acos(Math.max(-0.99, Math.min(0.99, dy / fc.radius)));
  fc.theta = Math.atan2(dx, dz);
  fc.captured = true;
  if (Math.abs(camera.fov - 46) > 0.2) {
    camera.fov = 46;
    camera.updateProjectionMatrix();
  }
}

function captureFreeCam(camera: THREE.Camera) {
  const fc = world.freeCam;
  const puck = world.puck;
  const playing = useGame.getState().playing;
  const drillCam = playing ? drillFollow() : null;
  fc.tx = drillCam ? drillCam.x : playing ? puck.x : 0;
  fc.ty = drillCam ? drillCam.y : 0.55;
  fc.tz = drillCam ? drillCam.z : playing ? puck.z : 0;
  const dx = camera.position.x - fc.tx;
  const dy = camera.position.y - fc.ty;
  const dz = camera.position.z - fc.tz;
  fc.radius = Math.max(4.2, Math.hypot(dx, dy, dz));
  fc.phi = Math.acos(Math.max(-0.99, Math.min(0.99, dy / fc.radius)));
  fc.theta = Math.atan2(dx, dz);
  fc.phi = Math.max(0.12, Math.min(1.45, fc.phi));
  fc.captured = true;
}

function applyFreeCam(camera: THREE.PerspectiveCamera) {
  const fc = world.freeCam;
  const x = fc.tx + fc.radius * Math.sin(fc.phi) * Math.sin(fc.theta);
  const y = fc.ty + fc.radius * Math.cos(fc.phi);
  const z = fc.tz + fc.radius * Math.sin(fc.phi) * Math.cos(fc.theta);
  camera.up.set(0, 1, 0);
  camera.position.set(x, y, z);
  camera.lookAt(fc.tx, fc.ty, fc.tz);
  _pos.copy(camera.position);
  if (Math.abs(camera.fov - 46) > 0.2) {
    camera.fov = 46;
    camera.updateProjectionMatrix();
  }
}

const _chaseFwd = { x: 1, z: 0 };
let _defendZoom = 0;
const _zoneCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.15, 240);
const _zoneNdc = new THREE.Vector3();
const _zonePt = new THREE.Vector3();
const _zoneFwd = new THREE.Vector3();

function zoneFramed(camera: THREE.Camera, x: number, y: number, z: number, yMin = -0.84): boolean {
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  _zoneFwd.set(-e[8], -e[9], -e[10]);
  _zonePt.set(x, y, z);
  const along =
    (_zonePt.x - camera.position.x) * _zoneFwd.x +
    (_zonePt.y - camera.position.y) * _zoneFwd.y +
    (_zonePt.z - camera.position.z) * _zoneFwd.z;
  _zoneNdc.copy(_zonePt).project(camera);
  return along > 1.4 && _zoneNdc.z < 1 && _zoneNdc.y > yMin && _zoneNdc.y < 0.9 && Math.abs(_zoneNdc.x) < 0.92;
}

function ourZonePassReceiver(): { x: number; y: number; z: number } | null {
  if (world.puck.owner !== null) return null;
  if (world.lastPassTo === null) return null;
  if (world.time - world.lastPass > 2.2) return null;
  if (world.lastShoot > world.lastPass) return null;
  const t = world.skaters[world.lastPassTo];
  if (!t) return null;
  if (t.x * world.homeAttack > -BLUE_X + 0.35) return null;
  return { x: t.x, y: 1.15, z: t.z };
}

function placeZoneCam(
  px: number,
  py: number,
  pz: number,
  lx: number,
  ly: number,
  lz: number,
  fov: number,
  aspect: number,
  upX: number,
  upY: number,
): void {
  _zoneCam.fov = fov;
  _zoneCam.aspect = aspect;
  _zoneCam.updateProjectionMatrix();
  _zoneCam.up.set(upX, upY, 0);
  _zoneCam.position.set(px, py, pz);
  _zoneCam.lookAt(lx, ly, lz);
  _zoneCam.updateMatrixWorld();
}

function widenClassicForReceiver(
  aspect: number,
  atk: number,
  fov0: number,
  puckX: number,
  puckY: number,
  puckZ: number,
  recvX: number,
  recvY: number,
  recvZ: number,
): number | null {
  const baseX = _desired.x;
  const baseY = _desired.y;
  const lookY = _look.y;
  const baseLookX = _look.x;
  const baseLookZ = _look.z;
  placeZoneCam(baseX, baseY, baseLookZ, baseLookX, lookY, baseLookZ, fov0, aspect, atk, 0);
  if (zoneFramed(_zoneCam, recvX, recvY, recvZ)) return null;

  const limit = RINK_L / 2 - 1.35;
  let camX = atk > 0 ? Math.max(-limit, recvX - 9) : Math.min(limit, recvX + 9);
  if (atk > 0) camX = Math.min(camX, baseX);
  else camX = Math.max(camX, baseX);
  const zLimit = RINK_W / 2 - 3.2;
  const heights = [baseY, baseY + 6, baseY + 14];
  const fovs = [fov0, fov0 + 4, fov0 + 8, Math.min(66, fov0 + 14)];
  for (const camY of heights) {
    for (const fov of fovs) {
      for (let blend = 0.32; blend <= 0.9; blend += 0.06) {
        const lookX = baseLookX + (recvX - baseLookX) * blend;
        let lookZ = baseLookZ + (recvZ - baseLookZ) * Math.min(0.62, blend);
        lookZ = Math.max(-zLimit, Math.min(zLimit, lookZ));
        placeZoneCam(camX, camY, lookZ, lookX, lookY, lookZ, fov, aspect, atk, 0);
        if (!zoneFramed(_zoneCam, recvX, recvY, recvZ)) continue;
        if (!zoneFramed(_zoneCam, puckX, puckY, puckZ, -0.9)) continue;
        _desired.set(camX, camY, lookZ);
        _look.set(lookX, lookY, lookZ);
        return fov;
      }
    }
  }
  return null;
}

function widenChaseForReceiver(
  aspect: number,
  fov0: number,
  back0: number,
  height0: number,
  hx: number,
  hz: number,
  puckX: number,
  puckY: number,
  puckZ: number,
  recvX: number,
  recvY: number,
  recvZ: number,
  lookY: number,
): number | null {
  const hm = Math.hypot(hx, hz) || 1;
  const fx = hx / hm;
  const fz = hz / hm;
  placeZoneCam(puckX - fx * back0, height0, puckZ - fz * back0, _look.x, lookY, _look.z, fov0, aspect, 0, 1);
  if (zoneFramed(_zoneCam, recvX, recvY, recvZ) && zoneFramed(_zoneCam, puckX, puckY, puckZ, -0.9)) return null;

  const rel = (recvX - puckX) * fx + (recvZ - puckZ) * fz;
  const need = Math.max(back0, Math.min(56, -rel + 9));
  const backs = [need, Math.min(56, need + 4)];
  const heights = [height0, height0 + 1.8, height0 + 4.2];
  const fovs = [fov0, Math.min(62, fov0 + 6)];
  for (const back of backs) {
    for (const camY of heights) {
      for (const fov of fovs) {
        for (const blend of [0, 0.15, 0.35, 0.55]) {
          const lookX = puckX + (recvX - puckX) * blend + fx * 0.9 * (1 - blend);
          const lookZ = puckZ + (recvZ - puckZ) * blend + fz * 0.9 * (1 - blend);
          placeZoneCam(puckX - fx * back, camY, puckZ - fz * back, lookX, lookY, lookZ, fov, aspect, 0, 1);
          if (!zoneFramed(_zoneCam, recvX, recvY, recvZ)) continue;
          if (!zoneFramed(_zoneCam, puckX, puckY, puckZ, -0.9)) continue;
          _desired.set(puckX - fx * back, camY, puckZ - fz * back);
          _look.set(lookX, lookY, lookZ);
          return fov;
        }
      }
    }
  }
  return null;
}

function holdPausedCam(cam: THREE.PerspectiveCamera) {
  if (!_pauseHolding || !world.freeCam.captured) {
    if (!world.freeCam.captured) captureFreeCam(cam);
    _pauseHoldPos.copy(cam.position);
    _pauseHoldQuat.copy(cam.quaternion);
    _pauseHoldTheta = world.freeCam.theta;
    _pauseHoldPhi = world.freeCam.phi;
    _pauseHoldRadius = world.freeCam.radius;
    _pauseHolding = true;
  }
  const fc = world.freeCam;
  const turned =
    Math.abs(fc.theta - _pauseHoldTheta) > 1e-5 || Math.abs(fc.phi - _pauseHoldPhi) > 1e-5;
  if (turned) {
    applyFreeCam(cam);
    _pauseHoldPos.copy(cam.position);
    _pauseHoldQuat.copy(cam.quaternion);
    _pauseHoldTheta = fc.theta;
    _pauseHoldPhi = fc.phi;
    _pauseHoldRadius = fc.radius;
  } else {
    cam.quaternion.copy(_pauseHoldQuat);
    cam.getWorldDirection(_pauseDolly);
    cam.position.copy(_pauseHoldPos).addScaledVector(_pauseDolly, _pauseHoldRadius - fc.radius);
  }
  _pos.copy(cam.position);
  writeCamBasis(cam);
  projectUser(cam);
}

/** Look at the live puck in the stands, every frame. Rink clamps would leave this camera on the ice. */
function snapCrowdFollow(cam: THREE.PerspectiveCamera, mode: CamMode): void {
  const px = world.puck.x;
  const py = world.puck.y;
  const pz = world.puck.z;
  _follow.set(px, py, pz);
  _look.set(px, py, pz);
  _lookSmooth.copy(_look);
  const atk = world.homeAttack > 0 ? 1 : -1;
  if (mode === "classic") {
    cam.up.set(atk, 0, 0);
    cam.position.set(px - atk * 13.2, py + 6.4, pz);
    aimClassic(cam, _lookSmooth);
  } else if (mode === "high") {
    cam.up.set(atk, 0, 0);
    cam.position.set(px, Math.max(32, py + 8), pz);
    cam.lookAt(_lookSmooth);
  } else {
    let ox = -px;
    let oz = -pz;
    let om = Math.hypot(ox, oz);
    if (om < 0.75) {
      ox = -atk;
      oz = 0;
      om = 1;
    }
    const back = mode === "chase" ? 6.5 : 8;
    const lift = mode === "chase" ? 2.6 : 4.2;
    cam.up.set(0, 1, 0);
    cam.position.set(px + (ox / om) * back, py + lift, pz + (oz / om) * back);
    cam.lookAt(_lookSmooth);
  }
  _desired.copy(cam.position);
  _pos.copy(cam.position);
}

function CameraRig() {
  const playing = useGame((s) => s.playing);
  const freeCamLive = useGame((s) => s.freeCamLive);
  const rawMode = useGame((s) => s.camMode);
  const mode: CamMode = rawMode === ("orbit" as CamMode) ? "classic" : rawMode;
  const prevMode = useRef(mode);
  const wasTitle = useRef(true);
  const seenDrill = useRef(-1);
  const seededTitle = useRef(false);

  useFrame((state) => {
    const ui = useGame.getState();
    if (!ui.playing || !ui.paused) {
      _pauseHolding = false;
      return;
    }
    if (world.replay) return;
    stopPausedOrbit(state.controls);
    holdPausedCam(state.camera as THREE.PerspectiveCamera);
  }, -2);

  useFrame((state, dt) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const uiNow = useGame.getState();
    const pausedNow = uiNow.playing && uiNow.paused;
    if (pausedNow) stopPausedOrbit(state.controls);
    const drillNow = uiNow.clockMode === "drill";
    const drillSnap = drillNow && world.drillView !== seenDrill.current;
    if (!playing) {
      wasTitle.current = true;
      prevMode.current = mode;
      if (drillNow) {
        const look = drillFollow();
        if (look) parkClassicAt(look.x, look.y, look.z, cam);
        seenDrill.current = world.drillView;
      } else {
        cam.up.set(0, 1, 0);
        if (!seededTitle.current) {
          const atk = world.homeAttack > 0 ? 1 : -1;
          cam.position.set(-atk * 13.6, 9.6, 0);
          cam.lookAt(atk * 1.4, 0.4, 0);
          seededTitle.current = true;
        }
      }
      writeCamBasis(cam);
      projectUser(cam);
      return;
    }
    const fromTitle = wasTitle.current;
    wasTitle.current = false;
    if (drillSnap) seenDrill.current = world.drillView;
    if (world.replay) {
      const puck = world.puck;
      cam.up.set(0, 1, 0);
      if (world.replayKind === "pause") {
        const rc = world.replayCam;
        const sp = Math.sin(rc.phi);
        const cp = Math.cos(rc.phi);
        _look.set(rc.lx, rc.ly, rc.lz);
        _desired.set(
          rc.lx + rc.radius * sp * Math.cos(rc.theta),
          rc.ly + rc.radius * cp,
          rc.lz + rc.radius * sp * Math.sin(rc.theta),
        );
      } else {
        const net = world.replayNet || 1;
        const netX = net * GOAL_LINE_X;
        const scorer = world.lastShooter !== null ? world.skaters[world.lastShooter] : null;
        const px = Math.max(BLUE_X - 1.2, puck.x * net) * net;
        const sz = Math.max(-2.2, Math.min(2.2, puck.z * 0.45 + (scorer ? scorer.z * 0.2 : 0)));
        _desired.set(netX - net * 13.2, 8.4, 7.6);
        _look.set(netX * 0.42 + px * 0.58, 0.52, sz);
      }
      _pos.copy(_desired);
      _lookSmooth.copy(_look);
      world.replayHardCut = false;
      cam.position.copy(_pos);
      cam.lookAt(_lookSmooth);
      if (Math.abs(cam.fov - 46) > 0.2) {
        cam.fov = 46;
        cam.updateProjectionMatrix();
      }
      writeCamBasis(cam);
      projectUser(cam);
      return;
    }
    if (pausedNow) {
      if (drillSnap) {
        world.freeCam.captured = false;
        _pauseHolding = false;
      }
      prevMode.current = mode;
      return;
    }
    if (world.whistle === "crowd") {
      _crowdCam = true;
      snapCrowdFollow(cam, mode);
      writeCamBasis(cam);
      projectUser(cam);
      prevMode.current = mode;
      return;
    }
    let crowdSnap = false;
    if (_crowdCam) {
      _crowdCam = false;
      crowdSnap = true;
      _follow.set(world.faceX, Math.max(0.35, world.puck.y), world.faceZ);
      world.freeCam.tx = world.faceX;
      world.freeCam.ty = Math.max(0.45, world.puck.y);
      world.freeCam.tz = world.faceZ;
      _crowdCut = mode === "freestyle" && !freeCamLive;
    }
    if (crowdSnap && mode === "freestyle") {
      applyFreeCam(cam);
      _pos.copy(cam.position);
      writeCamBasis(cam);
      projectUser(cam);
      prevMode.current = mode;
      return;
    }
    if (mode === "freestyle" && freeCamLive) {
      world.freeCamReapply = false;
      const fc = world.freeCam;
      const puck = world.puck;
      const drillCam = drillFollow();
      const tx = drillCam ? drillCam.x : puck.x;
      const tz = drillCam ? drillCam.z : puck.z;
      const ty = drillCam ? drillCam.y : Math.max(0.45, puck.y);
      const k = 1 - Math.exp(-3.4 * Math.min(dt, 0.1));
      fc.tx += (tx - fc.tx) * k;
      fc.tz += (tz - fc.tz) * k;
      fc.ty += (ty - fc.ty) * k;
      applyFreeCam(cam);
      writeCamBasis(cam);
      projectUser(cam);
      prevMode.current = mode;
      return;
    }
    if (mode === "freestyle") {
      if (world.freeCamReapply) {
        applyFreeCam(cam);
        world.freeCamReapply = false;
      } else if (prevMode.current !== mode) seedFreestyleCam(cam);
      cam.up.set(0, 1, 0);
      _pos.copy(cam.position);
      writeCamBasis(cam);
      projectUser(cam);
      prevMode.current = mode;
      return;
    }
    const d = Math.min(dt, 0.1);
    const puck = world.puck;
    const idle = !playing || pausedNow;
    const drillCam = drillFollow();
    const scoring =
      !idle && world.whistle === "goal" && (world.goalSide === "home" || world.goalSide === "away");
    const scorer = scoring && world.lastShooter !== null ? world.skaters[world.lastShooter] : undefined;
    const px = idle ? 0 : drillCam ? drillCam.x : scorer ? scorer.x : puck.x;
    const pz = idle ? 0 : drillCam ? drillCam.z : scorer ? scorer.z : puck.z;
    const py = idle ? 0.45 : drillCam ? drillCam.y : scorer ? 1.05 : Math.max(0.35, puck.y);
    const switched = prevMode.current !== mode || fromTitle || drillSnap;
    prevMode.current = mode;

    const puckJump = Math.hypot(px - _follow.x, pz - _follow.z);
    const skater = drillCam ? world.skaters[world.userId] : undefined;
    const puckSpd = skater ? Math.hypot(skater.vx, skater.vz) : Math.hypot(puck.vx, puck.vz);
    const rate = puckJump > 9 ? 14 : 4.6 + Math.min(9, puckSpd * 0.42);
    const followK = idle || switched || crowdSnap || puckJump > 16 ? 1 : 1 - Math.exp(-rate * d);
    _follow.x += (px - _follow.x) * followK;
    _follow.z += (pz - _follow.z) * followK;
    _follow.y += (py - _follow.y) * followK;
    const fxP = _follow.x;
    const fzP = _follow.z;
    const fyP = _follow.y;
    const lead = Math.min(2.4, puckSpd * 0.1);
    const holder = puck.owner !== null ? world.skaters[puck.owner] : undefined;
    const wantDefend = !idle && !!holder && holder.side === "away" ? 1 : 0;
    _defendZoom += (wantDefend - _defendZoom) * (1 - Math.exp(-2.1 * d));
    const zoom = _defendZoom;

    if (mode === "classic") {
      const atk = world.homeAttack;
      const wall = Math.min(1, Math.max(0, (Math.abs(fzP) - (RINK_W / 2 - 6.8)) / 5.2));
      const back = 13.2 + zoom * 9.8 + wall * 3.4;
      const camY = 9.4 + zoom * 5.8 + wall * 2.6;
      const camX =
        atk > 0
          ? Math.max(-RINK_L / 2 + 1.6, fxP - back)
          : Math.min(RINK_L / 2 - 1.6, fxP + back);
      const zLimit = RINK_W / 2 - 4.8;
      const fzCam = Math.max(-zLimit, Math.min(zLimit, fzP));
      const lookX =
        fxP + atk * (1.15 - zoom * 3.4) + (!drillCam && puck.vx * atk > 0.8 ? atk * lead * 0.3 : 0);
      _desired.set(camX, camY, fzCam);
      _look.set(lookX, fyP + 0.16 + zoom * 0.18, fzCam);
      state.camera.up.set(atk, 0, 0);
    } else if (mode === "broadcast") {
      _desired.set(fxP * 0.16, 12.2 + zoom * 4.2, Math.min(10.2, RINK_W / 2 - 1.6));
      _look.set(fxP, fyP, fzP);
      state.camera.up.set(0, 1, 0);
    } else if (mode === "high") {
      _desired.set(fxP, 32 + zoom * 5, fzP);
      _look.set(fxP, 0, fzP);
      state.camera.up.set(world.homeAttack, 0, 0);
      _pos.copy(_desired);
      _lookSmooth.copy(_look);
    } else {
      let fx = _chaseFwd.x;
      let fz = _chaseFwd.z;
      if (holder) {
        fx = -Math.sin(holder.yaw);
        fz = -Math.cos(holder.yaw);
      } else if (skater) {
        fx = -Math.sin(skater.yaw);
        fz = -Math.cos(skater.yaw);
      } else {
        const spd = Math.hypot(puck.vx, puck.vz);
        if (spd > 0.55) {
          fx = puck.vx / spd;
          fz = puck.vz / spd;
        }
      }
      const fm = Math.hypot(fx, fz) || 1;
      fx /= fm;
      fz /= fm;
      const headingK = switched ? 1 : 1 - Math.exp(-2.4 * d);
      _chaseFwd.x += (fx - _chaseFwd.x) * headingK;
      _chaseFwd.z += (fz - _chaseFwd.z) * headingK;
      const hm = Math.hypot(_chaseFwd.x, _chaseFwd.z) || 1;
      _chaseFwd.x /= hm;
      _chaseFwd.z /= hm;
      const chaseBack = 7.1 + zoom * 4.8;
      _desired.set(fxP - _chaseFwd.x * chaseBack, 2.7 + zoom * 2.4, fzP - _chaseFwd.z * chaseBack);
      _look.set(fxP + _chaseFwd.x * 0.9, fyP + 0.32, fzP + _chaseFwd.z * 0.9);
      state.camera.up.set(0, 1, 0);
    }

    let zoneFov: number | null = null;
    let zoneUrgent = false;
    const zoneRecv =
      !drillCam && !scoring && (mode === "classic" || mode === "chase") ? ourZonePassReceiver() : null;
    if (zoneRecv && cam.aspect > 0.2) {
      const puckY = Math.max(0.12, py);
      const fitFov =
        mode === "classic"
          ? widenClassicForReceiver(
              cam.aspect,
              world.homeAttack,
              50 + zoom * 9,
              px,
              puckY,
              pz,
              zoneRecv.x,
              zoneRecv.y,
              zoneRecv.z,
            )
          : widenChaseForReceiver(
              cam.aspect,
              44 + zoom * 5,
              7.1 + zoom * 4.8,
              2.7 + zoom * 2.4,
              _chaseFwd.x,
              _chaseFwd.z,
              px,
              puckY,
              pz,
              zoneRecv.x,
              zoneRecv.y,
              zoneRecv.z,
              _look.y,
            );
      if (fitFov !== null) {
        zoneFov = fitFov;
        zoneUrgent = !zoneFramed(cam, zoneRecv.x, zoneRecv.y, zoneRecv.z);
      }
    }

    const wantFov =
      zoneFov ??
      (mode === "classic" ? 50 + zoom * 9 : mode === "high" ? 48 + zoom * 4 : 44 + zoom * 5);
    if (Math.abs(cam.fov - wantFov) > 0.2) {
      cam.fov = wantFov;
      cam.updateProjectionMatrix();
    }

    if (mode !== "high") {
      const dist = _pos.distanceTo(_desired);
      const k = switched || crowdSnap || dist > 18 || zoneUrgent ? 1 : 1 - Math.exp(-2.4 * d);
      _pos.lerp(_desired, k);
    }
    const lookK = switched || crowdSnap || zoneUrgent ? 1 : 1 - Math.exp(-3.2 * d);
    _lookSmooth.lerp(_look, lookK);
    if (mode === "classic") {
      _pos.z = _lookSmooth.z;
      _desired.z = _lookSmooth.z;
      state.camera.up.set(world.homeAttack, 0, 0);
    }
    state.camera.position.copy(_pos);
    if (mode === "classic") aimClassic(cam, _lookSmooth);
    else state.camera.lookAt(_lookSmooth);
    if (!idle && zoneFov === null) keepPuckFramed(cam, px, Math.max(0.12, py), pz, mode === "classic");
    if (mode === "classic") aimClassic(cam, _lookSmooth);
    writeCamBasis(state.camera);
    projectUser(state.camera);
  });
  return null;
}

function FreestyleControls() {
  const mode = useGame((s) => s.camMode);
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const freeCamLive = useGame((s) => s.freeCamLive);
  const { camera } = useThree();
  const ref = useRef<any>(null);
  const seenDrill = useRef(-1);
  const title = !playing;
  const live = title || (mode === "freestyle" && !paused && !freeCamLive);

  useLayoutEffect(() => {
    if (!live || !useGame.getState().playing) return;
    if (world.freeCam.captured || world.freeCamReapply) return;
    seedFreestyleCam(camera as THREE.PerspectiveCamera);
  }, [live, camera]);

  useFrame(() => {
    const c = ref.current;
    const cam = camera as THREE.PerspectiveCamera;
    const pausedNow = useGame.getState().paused && useGame.getState().playing;
    if (c) c.autoRotate = false;
    if (pausedNow) {
      stopPausedOrbit(c);
      return;
    }
    if (live) cam.up.set(0, 1, 0);
    if (!c || !live) return;
    if (playing && world.whistle === "crowd") {
      c.enabled = false;
      c.target.set(world.puck.x, world.puck.y, world.puck.z);
      return;
    }
    c.enabled = true;
    c.enableDamping = true;
    if (playing) {
      const drillCam = drillFollow();
      const p = world.puck;
      const tx = drillCam ? drillCam.x : p.x;
      const tz = drillCam ? drillCam.z : p.z;
      const ty = drillCam ? drillCam.y : Math.max(0.45, p.y);
      const snap = drillCam !== null && world.drillView !== seenDrill.current;
      if (snap) seenDrill.current = world.drillView;
      const cut = _crowdCut;
      if (cut) _crowdCut = false;
      const k = snap || cut ? 1 : 0.12;
      c.target.x += (tx - c.target.x) * k;
      c.target.z += (tz - c.target.z) * k;
      c.target.y += (ty - c.target.y) * k;
    }
  });

  if (!live) return null;

  const drillCam = drillFollow();
  const puck = world.puck;
  const tx = !playing ? 0 : drillCam ? drillCam.x : puck.x;
  const tz = !playing ? 0 : drillCam ? drillCam.z : puck.z;
  const ty = !playing ? 0.55 : drillCam ? drillCam.y : 0.55;

  return (
    <OrbitControls
      ref={ref}
      autoRotate={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={3.2}
      maxDistance={130}
      maxPolarAngle={Math.PI / 2 - 0.08}
      minPolarAngle={0.12}
      target={[tx, ty, tz]}
      makeDefault
      zoomSpeed={1.05}
      rotateSpeed={0.72}
      panSpeed={0.7}
      touches={ORBIT_TOUCHES}
    />
  );
}

export function World() {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const quality = useGame((s) => s.quality);
  const lineupRev = useGame((s) => s.lineupRev);
  const clockMode = useGame((s) => s.clockMode);
  const arenaLook = useGame((s) => s.arenaLook);
  const dark = arenaLook === "dark";

  useEffect(() => {
    const detach = attachInput(window);
    installControlsProbe();
    return detach;
  }, []);

  return (
    <>
      <LookSync />
      <SimLoop />
      <color attach="background" args={[dark ? "#070b12" : "#0c121c"]} />
      <fog attach="fog" args={[dark ? "#070b12" : "#1a2838", dark ? 48 : 64, dark ? 150 : 190]} />
      <Arena />
      <Rink />
      <ReplayIceMark />
      {world.skaters.map((s) => (
        <PlayerMesh
          key={`${lineupRev}-${s.id}-${s.side === "home" ? homeKit : awayKit}`}
          index={s.id}
          kitId={s.side === "home" ? homeKit : awayKit}
        />
      ))}
      <RefereeMesh lane={1} />
      {clockMode === "practice" ? null : <RefereeMesh lane={-1} />}
      <PuckMesh />
      <CameraRig />
      <FreestyleControls />
      {quality === "high" ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
          <planeGeometry args={[0.01, 0.01]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      ) : null}
    </>
  );
}
