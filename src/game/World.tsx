import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Arena } from "./Arena";
import { Rink } from "./Rink.tsx";
import { PlayerMesh, PuckMesh, RefereeMesh } from "./PlayerMesh";
import { attachInput } from "./input";
import { installControlsProbe, resetWorld, stepSim, world } from "./sim";
import { useGame, type CamMode } from "./store";
import { BOARD_H, BLUE_X, GLASS_H, GOAL_LINE_X, resolveRink, RINK_L, RINK_W } from "./rink.ts";

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
  world.camRz = rz;
  (world as { camX?: number }).camX = camera.position.x;
  (world as { camY?: number }).camY = camera.position.y;
  (world as { camZ?: number }).camZ = camera.position.z;
  (world as { camUpX?: number }).camUpX = camera.up.x;
  (world as { camUpY?: number }).camUpY = camera.up.y;
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
      if (lockRoll) {
        camera.up.set(world.homeAttack, 0, 0);
        camera.position.z = _lookSmooth.z;
        _pos.z = _lookSmooth.z;
        camera.lookAt(_lookSmooth);
      }
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
    if (lockRoll) {
      camera.up.set(world.homeAttack, 0, 0);
      camera.position.z = _lookSmooth.z;
      _pos.z = _lookSmooth.z;
    }
    camera.lookAt(_lookSmooth);
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
  const wall = BOARD_H + GLASS_H;
  for (let i = 1; i <= 10; i++) {
    const t = i / 11;
    const x = cx + (px - cx) * t;
    const y = cy + (py - cy) * t;
    const z = cz + (pz - cz) * t;
    if (y > wall + 0.2) continue;
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

function seedFreestyleCam(camera: THREE.PerspectiveCamera) {
  const playing = useGame.getState().playing;
  const puck = world.puck;
  const px = playing ? puck.x : 0;
  const pz = playing ? puck.z : 0;
  camera.up.set(0, 1, 0);
  camera.position.set(px - 12, 9.2, pz + 14);
  camera.lookAt(px, 0.55, pz);
  _pos.copy(camera.position);
  const fc = world.freeCam;
  fc.tx = px;
  fc.ty = 0.55;
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
  fc.tx = playing ? puck.x : 0;
  fc.ty = 0.55;
  fc.tz = playing ? puck.z : 0;
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

function CameraRig() {
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const freeCamLive = useGame((s) => s.freeCamLive);
  const rawMode = useGame((s) => s.camMode);
  const mode: CamMode = rawMode === ("orbit" as CamMode) ? "classic" : rawMode;
  const prevMode = useRef(mode);

  useFrame((state, dt) => {
    const cam = state.camera as THREE.PerspectiveCamera;
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
    if (paused) {
      if (!world.freeCam.captured) captureFreeCam(cam);
      applyFreeCam(cam);
      writeCamBasis(cam);
      projectUser(cam);
      prevMode.current = mode;
      return;
    }
    if (mode === "freestyle" && freeCamLive) {
      const fc = world.freeCam;
      const puck = world.puck;
      const k = 1 - Math.exp(-3.4 * Math.min(dt, 0.1));
      fc.tx += (puck.x - fc.tx) * k;
      fc.tz += (puck.z - fc.tz) * k;
      fc.ty += (Math.max(0.45, puck.y) - fc.ty) * k;
      applyFreeCam(cam);
      writeCamBasis(cam);
      projectUser(cam);
      prevMode.current = mode;
      return;
    }
    if (mode === "freestyle") {
      if (prevMode.current !== mode) seedFreestyleCam(cam);
      cam.up.set(0, 1, 0);
      _pos.copy(cam.position);
      writeCamBasis(cam);
      projectUser(cam);
      prevMode.current = mode;
      return;
    }
    const d = Math.min(dt, 0.1);
    const puck = world.puck;
    const idle = !playing || paused;
    const scoring =
      !idle && world.whistle === "goal" && (world.goalSide === "home" || world.goalSide === "away");
    const netSign: 1 | -1 =
      world.goalSide === "home" ? world.homeAttack : ((-world.homeAttack) as 1 | -1);
    const netX = netSign * GOAL_LINE_X;
    const px = idle ? 0 : scoring ? puck.x * netSign > 2 ? puck.x : netX - netSign * 1.2 : puck.x;
    const pz = idle ? 0 : scoring ? Math.max(-2.4, Math.min(2.4, puck.z)) : puck.z;
    const py = idle ? 0.45 : scoring ? 0.55 : Math.max(0.35, puck.y);
    const switched = prevMode.current !== mode;
    prevMode.current = mode;

    const puckJump = Math.hypot(px - _follow.x, pz - _follow.z);
    const puckSpd = Math.hypot(puck.vx, puck.vz);
    const rate = puckJump > 9 ? 14 : 4.6 + Math.min(9, puckSpd * 0.42);
    const followK = idle || switched || puckJump > 16 ? 1 : 1 - Math.exp(-rate * d);
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
      const lookX = fxP + atk * (1.15 - zoom * 3.4) + (puck.vx * atk > 0.8 ? atk * lead * 0.3 : 0);
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

    const wantFov =
      mode === "classic" ? 50 + zoom * 9 : mode === "high" ? 48 + zoom * 4 : 44 + zoom * 5;
    if (Math.abs(cam.fov - wantFov) > 0.2) {
      cam.fov = wantFov;
      cam.updateProjectionMatrix();
    }

    if (mode !== "high") {
      const dist = _pos.distanceTo(_desired);
      const k = switched || dist > 18 ? 1 : 1 - Math.exp(-2.4 * d);
      _pos.lerp(_desired, k);
    }
    const lookK = switched ? 1 : 1 - Math.exp(-3.2 * d);
    _lookSmooth.lerp(_look, lookK);
    if (mode === "classic") {
      _pos.z = _lookSmooth.z;
      _desired.z = _lookSmooth.z;
      state.camera.up.set(world.homeAttack, 0, 0);
    }
    state.camera.position.copy(_pos);
    state.camera.lookAt(_lookSmooth);
    if (!idle) keepPuckFramed(cam, px, Math.max(0.12, py), pz, mode === "classic");
    if (mode === "classic") {
      cam.up.set(world.homeAttack, 0, 0);
      cam.position.z = _lookSmooth.z;
      _pos.z = _lookSmooth.z;
      cam.lookAt(_lookSmooth);
    }
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
  const live = mode === "freestyle" && !paused && !freeCamLive;

  useLayoutEffect(() => {
    if (!live) return;
    seedFreestyleCam(camera as THREE.PerspectiveCamera);
  }, [live, camera]);

  useFrame(() => {
    const c = ref.current;
    const cam = camera as THREE.PerspectiveCamera;
    if (live) cam.up.set(0, 1, 0);
    if (!c || !live) return;
    if (playing) {
      const p = world.puck;
      c.target.x += (p.x - c.target.x) * 0.12;
      c.target.z += (p.z - c.target.z) * 0.12;
      c.target.y += (Math.max(0.45, p.y) - c.target.y) * 0.12;
    }
  });

  if (!live) return null;

  const puck = world.puck;
  const tx = playing ? puck.x : 0;
  const tz = playing ? puck.z : 0;

  return (
    <OrbitControls
      ref={ref}
      enableDamping
      dampingFactor={0.08}
      minDistance={3.2}
      maxDistance={130}
      maxPolarAngle={Math.PI / 2 - 0.08}
      minPolarAngle={0.12}
      target={[tx, 0.55, tz]}
      makeDefault
      zoomSpeed={1.05}
      rotateSpeed={0.72}
      panSpeed={0.7}
    />
  );
}

export function World() {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const quality = useGame((s) => s.quality);
  const lineupRev = useGame((s) => s.lineupRev);
  const arenaLook = useGame((s) => s.arenaLook);
  const dark = arenaLook === "dark";

  useEffect(() => {
    const detach = attachInput(window);
    installControlsProbe();
    return detach;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyR") {
        if (world.replay && world.replayKind === "pause") return;
        resetWorld();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <LookSync />
      <SimLoop />
      <color attach="background" args={[dark ? "#070b12" : "#0c121c"]} />
      <fog attach="fog" args={[dark ? "#070b12" : "#1a2838", dark ? 48 : 64, dark ? 150 : 190]} />
      <Arena />
      <Rink />
      {world.skaters.map((s) => (
        <PlayerMesh
          key={`${lineupRev}-${s.id}-${s.side === "home" ? homeKit : awayKit}`}
          index={s.id}
          kitId={s.side === "home" ? homeKit : awayKit}
        />
      ))}
      <RefereeMesh />
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
