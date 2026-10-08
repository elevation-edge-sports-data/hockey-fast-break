import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  createArenaEnv,
  createJumboFace,
  createRibbonCanvas,
  createScoreboardCanvas,
  mixHex,
} from "./iceTexture";
import { BOARD_H, FT, GLASS_H, GOAL_LINE_X, RINK_W } from "./rink";
import { rinkPerimeter } from "./rinkGeom";
import { kitById } from "./uniforms";
import { useGame, type ArenaLook } from "./store";
import { benchGoalieNumber, defendDir, jumboReplayView, penaltyNumbers, stepJumboReplay, world } from "./sim";
import { SeatedPlayer } from "./PlayerMesh";
import {
  FASCIA_D,
  FASCIA_DROP,
  FASCIA_H,
  FASCIA_W,
  fasciaRing,
  JUMBO_FACE_SCALE,
  JUMBO_HH,
  JUMBO_HW,
  JUMBO_SHELL_SHRINK,
  JUMBO_Y,
  PERSON_H,
  PERSON_LIFT,
  PERSON_RB,
  PERSON_RT,
  PRESS_BAYS,
  PRESS_GLASS,
  PRESS_GLASS_X,
  PRESS_ROOF,
  PRESS_SHELL,
  pressBoxFrame,
  RIBBON_INSET,
  RIBBON_INSET2,
  RIBBON_Y,
  RIBBON_Y2,
  SEAT_D,
  SEAT_H,
  SEAT_W,
  STANDS,
} from "./crowd";

const seatGeo = new THREE.BoxGeometry(SEAT_W, SEAT_H, SEAT_D);
const personGeo = new THREE.CylinderGeometry(PERSON_RT, PERSON_RB, PERSON_H, 5);
const _crowdDummy = new THREE.Object3D();

function SeatDeck() {
  const home = kitById(useGame((s) => s.homeKit));
  const away = kitById(useGame((s) => s.awayKit));
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const crowdRef = useRef<THREE.InstancedMesh>(null);
  const cheering = useRef(false);
  const count = STANDS.length;
  const { camera } = useThree();

  const colors = useMemo(
    () => ({
      seat: new THREE.Color("#2a3340"),
      homePri: new THREE.Color(home.crowdPri),
      homeSec: new THREE.Color(home.crowdSec),
      awayPri: new THREE.Color(away.crowdPri),
      dark: new THREE.Color("#1c222c"),
    }),
    [home, away],
  );

  useLayoutEffect(() => {
    const seats = meshRef.current;
    const crowd = crowdRef.current;
    if (!seats || !crowd) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < STANDS.length; i++) {
      const p = STANDS[i]!;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      color.copy(colors.seat);
      color.offsetHSL(0, 0, ((i * 13) % 9) * 0.012 - 0.05);
      seats.setColorAt(i, color);

      dummy.position.y = p.y + PERSON_LIFT;
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
      const jersey = p.awayFan
        ? i % 3 === 0
          ? colors.dark
          : colors.awayPri
        : i % 6 === 0
          ? colors.homeSec
          : i % 11 === 0
            ? colors.dark
            : colors.homePri;
      crowd.setColorAt(i, jersey);
    }
    seats.instanceMatrix.needsUpdate = true;
    crowd.instanceMatrix.needsUpdate = true;
    if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  }, [colors]);

  useFrame(() => {
    const seats = meshRef.current;
    const crowd = crowdRef.current;
    if (!seats || !crowd) return;
    const dummy = _crowdDummy;
    const ui = useGame.getState();
    const scrimmageHomeWin =
      ui.clockMode === "scrimmage" && world.periodOver && world.goalSide === "home";
    const scrimmageAwayWin =
      ui.clockMode === "scrimmage" && world.periodOver && world.goalSide === "away";
    const winHome = (world.periodOver && ui.homeScore > ui.awayScore) || scrimmageHomeWin;
    const winAway = (world.periodOver && ui.awayScore > ui.homeScore) || scrimmageAwayWin;
    const drill = ui.clockMode === "drill";
    const brawl = world.lineBrawl !== null;
    const on = drill
      ? world.drillCheer > 0
      : (world.goalTicker > 0 && !!world.goalSide) || winHome || winAway;
    const scoringHome = winHome || (!world.periodOver && world.goalSide === "home");
    const t = world.time;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    const upx = e[4];
    const upy = e[5];
    const upz = e[6];
    const fx = -e[8];
    const fy = -e[9];
    const fz = -e[10];
    for (let i = 0; i < STANDS.length; i++) {
      const p = STANDS[i]!;
      const vx = p.x - cx;
      const vy = p.y - cy;
      const vz = p.z - cz;
      const dist = Math.hypot(vx, vy, vz);
      const depth = vx * fx + vy * fy + vz * fz;
      const below = -(vx * upx + vy * upy + vz * upz);
      const hide = dist < 4.4 && depth > 0 && depth < 5.2 && p.y < 4.2 && below > 0.15;
      const sc = hide ? 0.001 : 1;
      let hop = 0;
      if (brawl || (on && p.awayFan !== scoringHome)) {
        hop = 0.16 + 0.72 * Math.abs(Math.sin(t * 13.4 + i * 0.37));
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      dummy.position.y = p.y + PERSON_LIFT + hop;
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
    }
    seats.instanceMatrix.needsUpdate = true;
    crowd.instanceMatrix.needsUpdate = true;
    cheering.current = on;
  });

  return (
    <group>
      <instancedMesh ref={meshRef} args={[seatGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial color="#2a3340" roughness={0.82} />
      </instancedMesh>
      <instancedMesh ref={crowdRef} args={[personGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.75} />
      </instancedMesh>
    </group>
  );
}

function ribbonSegGeo(len: number, u0: number, u1: number) {
  const g = new THREE.PlaneGeometry(len, 0.92);
  const uv = g.attributes.uv;
  if (uv) {
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      uv.setX(i, u0 + (u1 - u0) * u);
    }
    uv.needsUpdate = true;
  }
  return g;
}

function StadiumRibbon({
  y = RIBBON_Y,
  inset = RIBBON_INSET,
  boardsOn = true,
}: {
  y?: number;
  inset?: number;
  boardsOn?: boolean;
}) {
  const home = kitById(useGame((s) => s.homeKit));
  const away = kitById(useGame((s) => s.awayKit));
  const homeScore = useGame((s) => s.homeScore);
  const awayScore = useGame((s) => s.awayScore);
  const goalSide = useGame((s) => s.goalSide);
  const clockMode = useGame((s) => s.clockMode);
  const periodClock = useGame((s) => s.periodClock);
  const ribbon = useMemo(() => createRibbonCanvas(), []);
  const board = useMemo(() => createScoreboardCanvas(), []);
  useLayoutEffect(
    () => () => {
      ribbon.texture.dispose();
      board.texture.dispose();
    },
    [ribbon, board],
  );

  const segs = useMemo(() => {
    const ring = rinkPerimeter(inset, 72);
    const out: { x: number; z: number; rot: number; len: number; u0: number; u1: number; geo: THREE.PlaneGeometry }[] =
      [];
    const module = 26;
    let acc = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      const nx = -dz / len;
      const nz = dx / len;
      const u0 = acc / module;
      const u1 = (acc + len) / module;
      out.push({
        x: (a.x + b.x) / 2 + nx * 0.04,
        z: (a.z + b.z) / 2 + nz * 0.04,
        rot: Math.atan2(nx, nz),
        len,
        u0,
        u1,
        geo: ribbonSegGeo(len * 1.02, u0, u1),
      });
      acc += len;
    }
    return out;
  }, [inset]);
  useLayoutEffect(() => () => segs.forEach((s) => s.geo.dispose()), [segs]);

  const fascia = useMemo(() => fasciaRing(inset), [inset]);

  const boards = useMemo(() => {
    const longs = segs.filter((s) => Math.abs(s.z) > 16);
    const pick = (xSign: number, zSign: number) =>
      longs
        .filter((s) => Math.sign(s.z) === zSign && s.x * xSign > 0)
        .sort((a, b) => Math.abs(a.x - xSign * 16) - Math.abs(b.x - xSign * 16))[0];
    return [pick(-1, 1), pick(1, 1), pick(-1, -1), pick(1, -1)].filter(
      (s): s is NonNullable<typeof s> => !!s,
    );
  }, [segs]);

  useFrame((_, dt) => {
    void dt;
    const scoring = world.goalSide ?? goalSide;
    const fill =
      scoring === "home" ? home.ribbon : scoring === "away" ? away.ribbon : home.ribbon;
    const lit = clockMode === "drill" ? world.drillCheer > 0 : !!scoring && world.goalTicker > 0;
    const opts = {
      homeJersey: home.jersey,
      homeStripe: home.stripe,
      awayJersey: away.jersey,
      awayStripe: away.stripe,
      fill: lit ? mixHex(fill, "#ffffff", 0.18) : fill,
      homeScore,
      awayScore,
      ticker: world.time,
      goal: lit,
      clock:
        clockMode === "game"
          ? `${Math.floor(Math.max(0, periodClock) / 60)}:${String(Math.floor(Math.max(0, periodClock) % 60)).padStart(2, "0")}`
          : null,
    };
    ribbon.paint(opts);
    board.paint(opts);
  });

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: ribbon.texture,
        toneMapped: false,
      }),
    [ribbon],
  );
  const boardMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: board.texture,
        toneMapped: false,
      }),
    [board],
  );
  const shell = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#141a22", roughness: 0.55, metalness: 0.2 }),
    [],
  );

  return (
    <group>
      {fascia.map((p, i) => (
        <mesh key={`fascia-${i}`} position={[p.x, y - FASCIA_DROP, p.z]} material={shell}>
          <boxGeometry args={[FASCIA_W, FASCIA_H, FASCIA_D]} />
        </mesh>
      ))}
      {segs.map((s, i) => (
        <mesh key={i} geometry={s.geo} position={[s.x, y, s.z]} rotation={[0, s.rot, 0]} material={mat} />
      ))}
      {boardsOn
        ? boards.map((b, i) => (
            <mesh
              key={`led-${i}`}
              position={[b.x, y, b.z]}
              rotation={[0, b.rot, 0]}
              material={boardMat}
            >
              <planeGeometry args={[5.4, 0.98]} />
            </mesh>
          ))
        : null}
    </group>
  );
}

function LightRig({ look }: { look: ArenaLook }) {
  const dark = look === "dark";
  const home = kitById(useGame((s) => s.homeKit));
  const away = kitById(useGame((s) => s.awayKit));
  const hemi = useRef<THREE.HemisphereLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const party = useRef<THREE.PointLight>(null);
  const partyA = useRef<THREE.PointLight>(null);
  const partyB = useRef<THREE.PointLight>(null);
  const netGlow = useRef<THREE.SpotLight>(null);
  const spots: [number, number, number][] = [
    [0, dark ? 26 : 22, 10],
    [16, dark ? 28 : 24, 8],
    [-16, dark ? 28 : 24, 8],
    [16, dark ? 28 : 24, -8],
    [-16, dark ? 28 : 24, -8],
  ];
  useFrame(() => {
    const scored = world.goalTicker > 0 && !!world.goalSide;
    const drill = useGame.getState().clockMode === "drill";
    const partyOn = drill ? world.drillCheer > 0 : scored && world.goalSide === "home";
    const hex = world.goalSide === "away" ? away.ribbon : home.ribbon;
    const pulse = partyOn ? 0.48 + 0.52 * Math.abs(Math.sin(world.time * 9.4)) : 0;
    if (party.current) {
      party.current.color.set(hex);
      party.current.intensity = partyOn ? (dark ? 90 : 420) * (0.7 + pulse) : 0;
    }
    if (partyA.current) {
      partyA.current.color.set(hex);
      partyA.current.intensity = partyOn ? (dark ? 55 : 280) * pulse : 0;
    }
    if (partyB.current) {
      partyB.current.color.set(hex);
      partyB.current.intensity = partyOn ? (dark ? 55 : 280) * pulse : 0;
    }
    if (netGlow.current) {
      const netX = world.goalSide === "away" ? -GOAL_LINE_X : GOAL_LINE_X;
      netGlow.current.position.set(netX * 0.82, 12, 0);
      netGlow.current.target.position.set(netX, 0, 0);
      netGlow.current.target.updateMatrixWorld();
      netGlow.current.color.set(hex);
      const netOn = drill ? world.drillCheer > 0 : scored;
      netGlow.current.intensity = netOn ? (dark ? 140 : 640) * (partyOn ? pulse : 0.55) : 0;
    }
    if (amb.current) amb.current.intensity = (dark ? 0.62 : 0.5) + (partyOn ? 1.05 * pulse : 0);
    if (hemi.current) {
      if (partyOn) {
        hemi.current.color.set(hex);
        hemi.current.intensity = (dark ? 0.5 : 0.88) + 0.55 * pulse;
      } else {
        hemi.current.color.set(dark ? "#b4c4d4" : "#d4e0ec");
        hemi.current.intensity = dark ? 0.5 : 0.88;
      }
    }
  });
  return (
    <group>
      <hemisphereLight ref={hemi} args={dark ? ["#b4c4d4", "#2a2620", 0.5] : ["#d4e0ec", "#3a3428", 0.88]} />
      <ambientLight ref={amb} intensity={dark ? 0.62 : 0.5} />
      <directionalLight
        position={dark ? [8, 32, 6] : [10, 28, 8]}
        intensity={dark ? 0.95 : 1.75}
        color={dark ? "#efeae2" : "#f7f3ec"}
      />
      {spots.map((p, i) => (
        <group key={i}>
          <spotLight
            position={p}
            angle={dark ? 0.48 : 0.52}
            penumbra={dark ? 0.9 : 0.82}
            intensity={dark ? (i === 0 ? 90 : 48) : i === 0 ? 420 : 220}
            color={i === 0 ? (dark ? "#efe8dc" : "#f4efe4") : dark ? "#c8d2de" : "#dce6f2"}
            distance={90}
            decay={2}
          />
        </group>
      ))}
      <pointLight position={[0, dark ? 12 : 10, 0]} intensity={dark ? 8 : 40} color={dark ? "#b8c4d0" : "#cdd8e4"} distance={48} />
      <pointLight ref={party} position={[0, 9, 0]} intensity={0} distance={80} decay={1.6} />
      <pointLight ref={partyA} position={[18, 7, 0]} intensity={0} distance={55} decay={1.8} />
      <pointLight ref={partyB} position={[-18, 7, 0]} intensity={0} distance={55} decay={1.8} />
      <spotLight ref={netGlow} position={[GOAL_LINE_X, 12, 0]} angle={0.7} penumbra={0.55} intensity={0} distance={48} decay={1.5} />
    </group>
  );
}

function segmentHitsBox(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  const slabs: [number, number, number, number][] = [
    [ax, dx, minX, maxX],
    [ay, dy, minY, maxY],
    [az, dz, minZ, maxZ],
  ];
  for (const [o, d, mn, mx] of slabs) {
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return false;
      continue;
    }
    let r0 = (mn - o) / d;
    let r1 = (mx - o) / d;
    if (r0 > r1) {
      const tmp = r0;
      r0 = r1;
      r1 = tmp;
    }
    t0 = Math.max(t0, r0);
    t1 = Math.min(t1, r1);
    if (t0 > t1) return false;
  }
  return true;
}

function Jumbotron() {
  const cam = useGame((s) => s.camMode);
  const paused = useGame((s) => s.paused);
  const home = kitById(useGame((s) => s.homeKit));
  const away = kitById(useGame((s) => s.awayKit));
  const homeScore = useGame((s) => s.homeScore);
  const awayScore = useGame((s) => s.awayScore);
  const goalSide = useGame((s) => s.goalSide);
  const clockMode = useGame((s) => s.clockMode);
  const periodClock = useGame((s) => s.periodClock);
  const face = useMemo(() => createJumboFace(), []);
  useLayoutEffect(() => () => face.texture.dispose(), [face]);
  const root = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    stepJumboReplay(dt);
    const y = camera.position.y;
    const dist = camera.position.length();
    const xz = Math.hypot(camera.position.x, camera.position.z);
    const far = world.freeCam.radius > 36 || dist > 32;
    const overhead = y > JUMBO_Y - JUMBO_HH - 1.8 && xz < JUMBO_HW + 4;
    const minX = -JUMBO_HW;
    const maxX = JUMBO_HW;
    const minY = JUMBO_Y - JUMBO_HH;
    const maxY = JUMBO_Y + JUMBO_HH;
    const minZ = -JUMBO_HW;
    const maxZ = JUMBO_HW;
    const inside =
      camera.position.x > minX &&
      camera.position.x < maxX &&
      y > minY &&
      y < maxY &&
      camera.position.z > minZ &&
      camera.position.z < maxZ;
    const lookX = world.puck.x;
    const lookY = Math.max(0.35, world.puck.y);
    const lookZ = world.puck.z;
    const occludes =
      inside ||
      segmentHitsBox(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        lookX,
        lookY,
        lookZ,
        minX,
        minY,
        minZ,
        maxX,
        maxY,
        maxZ,
      ) ||
      segmentHitsBox(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        0,
        0.4,
        0,
        minX,
        minY,
        minZ,
        maxX,
        maxY,
        maxZ,
      );
    const celebrating = world.whistle === "goal";
    g.visible =
      cam !== "high" &&
      cam !== "classic" &&
      cam !== "chase" &&
      cam !== "broadcast" &&
      !overhead &&
      !occludes &&
      (celebrating || ((cam === "freestyle" || paused) && far));

    const scoring = world.goalSide ?? goalSide;
    const fill =
      scoring === "home" ? home.ribbon : scoring === "away" ? away.ribbon : home.ribbon;
    const lit = clockMode === "drill" ? world.drillCheer > 0 : !!scoring && world.goalTicker > 0;
    const replay = jumboReplayView();
    face.paint({
      homeJersey: home.jersey,
      homeStripe: home.stripe,
      awayJersey: away.jersey,
      awayStripe: away.stripe,
      fill: lit ? mixHex(fill, "#ffffff", 0.12) : fill,
      homeScore,
      awayScore,
      ticker: world.time,
      goal: lit,
      clock:
        clockMode === "game"
          ? `${Math.floor(Math.max(0, periodClock) / 60)}:${String(Math.floor(Math.max(0, periodClock) % 60)).padStart(2, "0")}`
          : "—",
      puckX: replay?.puckX ?? world.puck.x,
      puckZ: replay?.puckZ ?? world.puck.z,
      players: replay?.players ?? world.skaters.map((s) => ({ x: s.x, z: s.z, home: s.side === "home" })),
    });
  });

  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: face.texture, toneMapped: false }),
    [face],
  );
  const shell = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0d1216", roughness: 0.48, metalness: 0.22 }),
    [],
  );
  const hw = JUMBO_HW;
  const hh = JUMBO_HH;
  const hd = JUMBO_HW;

  return (
    <group position={[0, JUMBO_Y, 0]} ref={root} visible={false}>
      <mesh material={shell}>
        <boxGeometry args={[hw * 2 - JUMBO_SHELL_SHRINK, hh * 2 - JUMBO_SHELL_SHRINK, hd * 2 - JUMBO_SHELL_SHRINK]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          material={mat}
          rotation={[0, (i * Math.PI) / 2, 0]}
          position={[
            Math.sin((i * Math.PI) / 2) * hw,
            0,
            Math.cos((i * Math.PI) / 2) * hd,
          ]}
        >
          <planeGeometry args={[hw * JUMBO_FACE_SCALE, hh * JUMBO_FACE_SCALE]} />
        </mesh>
      ))}
    </group>
  );
}

function PressBox() {
  const cam = useGame((s) => s.camMode);
  const shell = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2a3238", roughness: 0.55, metalness: 0.12 }),
    [],
  );
  const roof = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a444c", roughness: 0.48, metalness: 0.18 }),
    [],
  );
  const glass = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#9ec4d8",
        transparent: true,
        opacity: 0.42,
        roughness: 0.18,
        metalness: 0.08,
      }),
    [],
  );
  const frame = pressBoxFrame();
  const { y, z, boxH } = frame;
  if (cam === "high") return null;
  const bay = (ox: number) => (
    <group key={ox} position={[ox, 0, 0]}>
      <mesh material={shell} position={[0, 0, PRESS_SHELL.z]}>
        <boxGeometry args={[PRESS_SHELL.w, boxH, PRESS_SHELL.d]} />
      </mesh>
      <mesh material={roof} position={[0, boxH / 2 + PRESS_ROOF.lift, PRESS_ROOF.z]}>
        <boxGeometry args={[PRESS_ROOF.w, PRESS_ROOF.h, PRESS_ROOF.d]} />
      </mesh>
      {PRESS_GLASS_X.map((x) => (
        <mesh key={x} material={glass} position={[x, PRESS_GLASS.y, PRESS_GLASS.z]}>
          <boxGeometry args={[PRESS_GLASS.w, PRESS_GLASS.h, PRESS_GLASS.d]} />
        </mesh>
      ))}
    </group>
  );
  return (
    <group position={[0, y, z]}>
      {PRESS_BAYS.map((ox) => bay(ox))}
    </group>
  );
}

function Truss() {
  const cam = useGame((s) => s.camMode);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#1b222c", roughness: 0.55, metalness: 0.4 }),
    [],
  );
  const roof = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (roof.current) roof.current.position.set(0, 80, 0);
  });
  if (cam === "high") return null;
  return (
    <group>
      <mesh ref={roof} position={[0, 80, 0]} material={mat}>
        <boxGeometry args={[64, 0.35, 36]} />
      </mesh>
      {[-18, -6, 6, 18].map((x) => (
        <mesh key={x} position={[x, 76, 0]} material={mat}>
          <boxGeometry args={[0.28, 6.4, 22]} />
        </mesh>
      ))}
    </group>
  );
}

const HOME_BENCH_NUMS = [84, 62, 42, 25, 11, 10];
const AWAY_BENCH_NUMS = [2, 4, 9, 14, 17, 19];
const HOME_BENCH_XS = [-9.15, -7.75, -6.35, -4.95, -3.55, -2.15, -0.75];
const AWAY_BENCH_XS = [0.75, 2.15, 3.55, 4.95, 6.35, 7.75, 9.15];

function penaltyBoxWidth(n: number): number {
  return n <= 2 ? 2.6 : Math.min(5.1, 1.15 + n * 0.96);
}

function PenaltyBox({
  x,
  z,
  sitters,
}: {
  x: number;
  z: number;
  sitters?: { kit: ReturnType<typeof kitById>; number: number }[];
}) {
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#cfd5dc", roughness: 0.5 }), []);
  const glass = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c8d8e8",
        transparent: true,
        opacity: 0.28,
        roughness: 0.12,
        metalness: 0.08,
      }),
    [],
  );
  const n = sitters?.length ?? 0;
  const w = penaltyBoxWidth(n);
  const gY = BOARD_H + GLASS_H / 2;
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 0.56, -0.12]} material={wood}>
        <boxGeometry args={[w, 0.1, 0.55]} />
      </mesh>
      <mesh position={[0, 0.28, -0.32]} material={wood}>
        <boxGeometry args={[w, 0.56, 0.22]} />
      </mesh>
      <mesh position={[0, gY, -0.52]} material={glass}>
        <boxGeometry args={[w - 0.05, GLASS_H, 0.06]} />
      </mesh>
      <mesh position={[-(w / 2 - 0.05), gY, 0]} material={glass}>
        <boxGeometry args={[0.06, GLASS_H, 1.1]} />
      </mesh>
      <mesh position={[w / 2 - 0.05, gY, 0]} material={glass}>
        <boxGeometry args={[0.06, GLASS_H, 1.1]} />
      </mesh>
      {sitters?.map((s, i) => (
        <group
          key={`${s.number}-${s.kit.id}`}
          position={[n <= 1 ? 0 : (i - (n - 1) / 2) * 0.92, 0.61, -0.18]}
        >
          <SeatedPlayer kit={s.kit} number={s.number} holdStick={i % 2 === 0} />
        </group>
      ))}
    </group>
  );
}

function BenchReporter() {
  const shell = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c0c6ce", metalness: 0.46, roughness: 0.34 }),
    [],
  );
  const plate = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#8e969e", metalness: 0.4, roughness: 0.42 }),
    [],
  );
  const joint = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a424c", metalness: 0.36, roughness: 0.48 }),
    [],
  );
  return (
    <group scale={[1, 1.0862, 1]}>
      {[-0.09, 0.09].map((x) => (
        <mesh key={`foot${x}`} position={[x, 0.035, 0.02]} material={plate}>
          <boxGeometry args={[0.12, 0.07, 0.2]} />
        </mesh>
      ))}
      {[-0.09, 0.09].map((x) => (
        <mesh key={`shin${x}`} position={[x, 0.26, 0]} material={shell}>
          <boxGeometry args={[0.08, 0.38, 0.09]} />
        </mesh>
      ))}
      {[-0.09, 0.09].map((x) => (
        <mesh key={`knee${x}`} position={[x, 0.46, 0]} rotation={[0, 0, Math.PI / 2]} material={joint}>
          <capsuleGeometry args={[0.048, 0.02, 3, 6]} />
        </mesh>
      ))}
      {[-0.09, 0.09].map((x) => (
        <mesh key={`thigh${x}`} position={[x, 0.66, 0]} material={shell}>
          <boxGeometry args={[0.1, 0.34, 0.11]} />
        </mesh>
      ))}
      <mesh position={[0, 0.86, 0]} material={joint}>
        <boxGeometry args={[0.28, 0.08, 0.14]} />
      </mesh>
      <mesh position={[0, 1.16, 0]} material={shell}>
        <boxGeometry args={[0.32, 0.5, 0.18]} />
      </mesh>
      <mesh position={[0, 1.18, 0.105]} material={plate}>
        <boxGeometry args={[0.18, 0.22, 0.02]} />
      </mesh>
      <mesh position={[0, 1.46, 0]} material={joint}>
        <capsuleGeometry args={[0.04, 0.05, 3, 6]} />
      </mesh>
      <mesh position={[0, 1.6, 0]} material={shell}>
        <boxGeometry args={[0.18, 0.16, 0.16]} />
      </mesh>
      <mesh position={[0, 1.625, 0.09]} material={joint}>
        <boxGeometry args={[0.11, 0.032, 0.016]} />
      </mesh>
      <mesh position={[0, 1.74, 0]} material={plate}>
        <capsuleGeometry args={[0.012, 0.11, 2, 5]} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.175, 1.34, 0]} rotation={[0, 0, Math.PI / 2]} material={joint}>
            <capsuleGeometry args={[0.042, 0.02, 3, 6]} />
          </mesh>
          <mesh position={[side * 0.215, 1.18, 0]} material={shell}>
            <boxGeometry args={[0.055, 0.26, 0.07]} />
          </mesh>
          <mesh position={[side * 0.215, 1.02, 0]} rotation={[0, 0, Math.PI / 2]} material={joint}>
            <capsuleGeometry args={[0.034, 0.01, 3, 6]} />
          </mesh>
          <mesh position={[side * 0.215, 0.85, 0.01]} material={plate}>
            <boxGeometry args={[0.05, 0.26, 0.06]} />
          </mesh>
          <mesh position={[side * 0.215, 0.685, 0.02]} material={shell}>
            <boxGeometry args={[0.055, 0.06, 0.065]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Benches() {
  const home = kitById(useGame((s) => s.homeKit));
  const away = kitById(useGame((s) => s.awayKit));
  const liveHome = useGame((s) => s.liveHome);
  const liveAway = useGame((s) => s.liveAway);
  useGame((s) => s.lineupRev);
  const clockMode = useGame((s) => s.clockMode);
  const homeBox =
    clockMode === "practice" || clockMode === "drill" ? [] : penaltyNumbers("home", liveHome);
  const awayBox =
    clockMode === "practice" || clockMode === "drill" ? [] : penaltyNumbers("away", liveAway);
  const homeGSlot = defendDir("home") < 0 ? 0 : HOME_BENCH_XS.length - 1;
  const awayGSlot = defendDir("away") < 0 ? 0 : AWAY_BENCH_XS.length - 1;
  const homeGNum = benchGoalieNumber("home", liveHome.g);
  const awayGNum = benchGoalieNumber("away", liveAway.g);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d8dde3", roughness: 0.5 }), []);
  const glass = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c8d8e8",
        transparent: true,
        opacity: 0.22,
        roughness: 0.12,
        metalness: 0.08,
      }),
    [],
  );
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c8102e", roughness: 0.42, metalness: 0.08 }),
    [],
  );
  const zBench = -RINK_W / 2 - 1.58;
  const zBox = RINK_W / 2 + 1.55;
  const gY = BOARD_H + GLASS_H / 2;
  const benchOuter = 9.8;
  const benchInner = 0.52;
  const benchSpan = benchOuter - benchInner;
  const benchMid = (benchOuter + benchInner) / 2;
  const postH = BOARD_H + GLASS_H - 4 * FT;
  const postW = 0.18;
  const postX = benchInner - 0.04 - postW / 2;
  const zPost = zBench + 0.37;
  return (
    <group>
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * benchMid, 0, zBench]}>
          <mesh position={[0, 0.7, 0.08]} material={wood}>
            <boxGeometry args={[benchSpan, 0.1, 0.58]} />
          </mesh>
          <mesh position={[0, 0.34, -0.22]} material={wood}>
            <boxGeometry args={[benchSpan, 0.68, 0.28]} />
          </mesh>
          <mesh position={[0, 0.7, -0.48]} material={wood}>
            <boxGeometry args={[benchSpan, 0.22, 0.12]} />
          </mesh>
          <mesh position={[0, gY, -0.62]} material={glass}>
            <boxGeometry args={[benchSpan, GLASS_H, 0.06]} />
          </mesh>
        </group>
      ))}
      <mesh position={[-benchOuter, gY, zBench - 0.18]} material={glass}>
        <boxGeometry args={[0.06, GLASS_H, 1.05]} />
      </mesh>
      <mesh position={[benchOuter, gY, zBench - 0.18]} material={glass}>
        <boxGeometry args={[0.06, GLASS_H, 1.05]} />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <mesh key={`post${side}`} position={[side * postX, postH / 2, zPost]} material={postMat}>
          <boxGeometry args={[postW, postH, 0.28]} />
        </mesh>
      ))}
      <group position={[0, 0, zPost]}>
        <BenchReporter />
      </group>
      {HOME_BENCH_XS.map((x, i) => {
        const goalie = i === homeGSlot;
        const number = goalie ? homeGNum : HOME_BENCH_NUMS[i < homeGSlot ? i : i - 1]!;
        return (
          <group key={`h${number}-${home.id}`} position={[x, 0.75, zBench - 0.04]}>
            <SeatedPlayer kit={home} number={number} holdStick={!goalie && i % 2 === 0} goalie={goalie} seatX={x} />
          </group>
        );
      })}
      {AWAY_BENCH_XS.map((x, i) => {
        const goalie = i === awayGSlot;
        const number = goalie ? awayGNum : AWAY_BENCH_NUMS[i < awayGSlot ? i : i - 1]!;
        return (
          <group key={`a${number}-${away.id}`} position={[x, 0.75, zBench - 0.04]}>
            <SeatedPlayer kit={away} number={number} holdStick={!goalie && i % 2 === 1} goalie={goalie} seatX={x} />
          </group>
        );
      })}
      <PenaltyBox
        x={-(penaltyBoxWidth(homeBox.length) / 2 + 0.05)}
        z={zBox}
        sitters={homeBox.map((number) => ({ kit: home, number }))}
      />
      <PenaltyBox
        x={penaltyBoxWidth(awayBox.length) / 2 + 0.05}
        z={zBox}
        sitters={awayBox.map((number) => ({ kit: away, number }))}
      />
    </group>
  );
}

export function Arena() {
  const look = useGame((s) => s.arenaLook);
  const cam = useGame((s) => s.camMode);
  const env = useMemo(() => createArenaEnv(look), [look]);
  useLayoutEffect(() => () => env.dispose(), [env]);
  const overhead = cam === "high";

  return (
    <group>
      <primitive object={env} attach="environment" />
      <LightRig look={look} />
      <SeatDeck />
      {overhead ? null : (
        <>
          <StadiumRibbon />
          <StadiumRibbon y={RIBBON_Y2} inset={RIBBON_INSET2} boardsOn={false} />
        </>
      )}
      <PressBox />
      <Jumbotron />
      <Truss />
      <Benches />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[160, 110]} />
        <meshStandardMaterial color="#12161c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 14, 0]}>
        <cylinderGeometry args={[62, 68, 30, 48, 1, true]} />
        <meshStandardMaterial color="#151b24" side={THREE.BackSide} roughness={0.85} />
      </mesh>
    </group>
  );
}
