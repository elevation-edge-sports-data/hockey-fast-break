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
import { GOAL_LINE_X, RINK_W } from "./rink";
import { rinkPerimeter } from "./rinkGeom";
import { kitById } from "./uniforms";
import { useGame, type ArenaLook } from "./store";
import { jumboReplayView, penaltyNumbers, stepJumboReplay, world } from "./sim";
import { SeatedPlayer } from "./PlayerMesh";

const seatGeo = new THREE.BoxGeometry(0.48, 0.36, 0.44);
const personGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.34, 5);

type SeatSpot = { x: number; y: number; z: number; rot: number; awayFan: boolean };

function buildStands(
  rows: number,
  gap: number,
  y0: number,
  rowD: number,
  rise: number,
): SeatSpot[] {
  const spots: SeatSpot[] = [];
  const seatW = 0.72;

  for (let row = 0; row < rows; row++) {
    const y = y0 + row * rise;
    const offset = gap + row * rowD;
    const ring = rinkPerimeter(-offset, 128);
    const n = ring.length;
    let dist = 0;
    let nextSeat = seatW * 0.45;
    for (let i = 0; i < n; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % n]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.04) continue;
      const tx = dx / len;
      const tz = dz / len;
      const nx = -tz;
      const nz = tx;
      const rot = Math.atan2(nx, nz);
      while (nextSeat <= dist + len) {
        const t = (nextSeat - dist) / len;
        const x = a.x + dx * t;
        const z = a.z + dz * t;
        spots.push({ x, y, z, rot, awayFan: false });
        nextSeat += seatW;
      }
      dist += len;
    }
  }
  return spots;
}

const LOWER = buildStands(16, 4.9, 1.32, 0.51, 0.25);
const UPPER = buildStands(7, 13.8, 6.35, 1.08, 0.54);
const THIRD = buildStands(12, 21.8, 10.9, 0.56, 0.28).filter(
  (p) => !(p.z > RINK_W / 2 + 25.6 && Math.abs(p.x) < 9.4 && p.y > 13.4),
);
const STANDS = [...LOWER, ...UPPER, ...THIRD];
(() => {
  const nAway = Math.round(STANDS.length * 0.1);
  const pocket = STANDS.map((p, i) => ({ p, i }))
    .filter(({ p }) => p.z > RINK_W / 2 + 1.6 && p.x > 0.6)
    .sort((a, b) => b.p.z + b.p.x * 0.15 - (a.p.z + a.p.x * 0.15));
  const away = new Set<number>();
  for (const { i } of pocket) {
    if (away.size >= nAway) break;
    away.add(i);
  }
  for (let k = 0; away.size < nAway && k < STANDS.length; k++) {
    away.add((k * 19 + 7) % STANDS.length);
  }
  for (const i of away) STANDS[i]!.awayFan = true;
})();
const RIBBON_Y = 5.55;
const RIBBON_INSET = -12.55;
const RIBBON_Y2 = 10.18;
const RIBBON_INSET2 = -21.15;
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

      dummy.position.y = p.y + 0.32;
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
    const on = world.goalTicker > 0 && !!world.goalSide;
    const scoringHome = world.goalSide === "home";
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
      const longSide = Math.abs(p.z) > RINK_W / 2 + 0.15;
      const lowerBowl = p.y < 5.5;
      const nearLong = longSide && lowerBowl && below > -1.2 && depth < 18;
      const nearEnd = p.x < cx + 3.2 && p.y < 6.2;
      const nearCam = dist < 11;
      const inFrontLow = cy < 8 && lowerBowl && depth > 0.4 && depth < 14 && below > -2.4;
      const hide = nearLong || nearEnd || nearCam || inFrontLow;
      const sc = hide ? 0.001 : 1;
      let hop = 0;
      if (on && p.awayFan !== scoringHome) {
        hop = 0.16 + 0.72 * Math.abs(Math.sin(t * 13.4 + i * 0.37));
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      dummy.position.y = p.y + 0.32 + hop;
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

  const fascia = useMemo(() => {
    const ring = rinkPerimeter(inset + 0.08, 48);
    return ring;
  }, [inset]);

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
    const lit = !!scoring && world.goalTicker > 0;
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
        <mesh key={`fascia-${i}`} position={[p.x, y - 0.52, p.z]} material={shell}>
          <boxGeometry args={[0.55, 0.22, 0.55]} />
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
    const partyOn = scored && world.goalSide === "home";
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
      netGlow.current.intensity = scored ? (dark ? 140 : 640) * (partyOn ? pulse : 0.55) : 0;
    }
    if (amb.current) amb.current.intensity = (dark ? 0.46 : 0.28) + (partyOn ? 1.05 * pulse : 0);
    if (hemi.current) {
      if (partyOn) {
        hemi.current.color.set(hex);
        hemi.current.intensity = (dark ? 0.34 : 0.62) + 0.55 * pulse;
      } else {
        hemi.current.color.set(dark ? "#9aabbc" : "#c5d4e4");
        hemi.current.intensity = dark ? 0.34 : 0.62;
      }
    }
  });
  return (
    <group>
      <hemisphereLight ref={hemi} args={dark ? ["#9aabbc", "#1c1814", 0.34] : ["#c5d4e4", "#2a241c", 0.62]} />
      <ambientLight ref={amb} intensity={dark ? 0.46 : 0.28} />
      <directionalLight
        position={dark ? [8, 32, 6] : [10, 28, 8]}
        intensity={dark ? 0.62 : 1.45}
        color={dark ? "#e8e4dc" : "#f3efe6"}
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

const JUMBO_Y = 27.4;
const JUMBO_HW = 5.15;
const JUMBO_HH = 2.42;

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
      !overhead &&
      (celebrating || ((cam === "freestyle" || paused) && far && !occludes));

    const scoring = world.goalSide ?? goalSide;
    const fill =
      scoring === "home" ? home.ribbon : scoring === "away" ? away.ribbon : home.ribbon;
    const lit = !!scoring && world.goalTicker > 0;
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
        <boxGeometry args={[hw * 2 - 0.12, hh * 2 - 0.12, hd * 2 - 0.12]} />
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
          <planeGeometry args={[hw * 1.92, hh * 1.92]} />
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
  const deckTopY = 10.9 + 11 * 0.28;
  const boxH = 3.7;
  const y = deckTopY + 0.62 + boxH / 2;
  const z = RINK_W / 2 + 21.8 + 11 * 0.56 - 0.2;
  if (cam === "high") return null;
  return (
    <group position={[0, y, z]}>
      <mesh material={shell} position={[0, 0, 0.2]}>
        <boxGeometry args={[18.4, boxH, 4.6]} />
      </mesh>
      <mesh material={roof} position={[0, boxH / 2 + 0.16, 0.12]}>
        <boxGeometry args={[19.2, 0.28, 5.1]} />
      </mesh>
      {[-6.4, -3.2, 0, 3.2, 6.4].map((x) => (
        <mesh key={x} material={glass} position={[x, 0.08, -2.22]}>
          <boxGeometry args={[2.7, 2.15, 0.08]} />
        </mesh>
      ))}
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

const HOME_BENCH_NUMS = [84, 42, 25, 11, 10];
const AWAY_BENCH_NUMS = [2, 4, 9, 14, 17];

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
  const w = n <= 2 ? 2.6 : Math.min(5.1, 1.15 + n * 0.96);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.56, -0.12]} material={wood}>
        <boxGeometry args={[w, 0.1, 0.55]} />
      </mesh>
      <mesh position={[0, 0.28, -0.32]} material={wood}>
        <boxGeometry args={[w, 0.56, 0.22]} />
      </mesh>
      <mesh position={[0, 1.05, -0.52]} material={glass}>
        <boxGeometry args={[w - 0.05, 1.05, 0.06]} />
      </mesh>
      <mesh position={[-(w / 2 - 0.05), 1.05, 0]} material={glass}>
        <boxGeometry args={[0.06, 1.05, 1.1]} />
      </mesh>
      <mesh position={[w / 2 - 0.05, 1.05, 0]} material={glass}>
        <boxGeometry args={[0.06, 1.05, 1.1]} />
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

function Benches() {
  const home = kitById(useGame((s) => s.homeKit));
  const away = kitById(useGame((s) => s.awayKit));
  const liveHome = useGame((s) => s.liveHome);
  const liveAway = useGame((s) => s.liveAway);
  const homeBox = penaltyNumbers("home", liveHome);
  const awayBox = penaltyNumbers("away", liveAway);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d8dde3", roughness: 0.5 }), []);
  const zBench = RINK_W / 2 + 1.58;
  const zBox = -RINK_W / 2 - 1.55;
  const homeXs = [-7.4, -5.9, -4.4, -2.9, -1.4];
  const awayXs = [1.4, 2.9, 4.4, 5.9, 7.4];
  return (
    <group>
      <mesh position={[0, 0.7, zBench - 0.08]} material={wood}>
        <boxGeometry args={[16.4, 0.1, 0.58]} />
      </mesh>
      <mesh position={[0, 0.34, zBench + 0.22]} material={wood}>
        <boxGeometry args={[16.4, 0.68, 0.28]} />
      </mesh>
      <mesh position={[0, 1.05, zBench + 0.48]} material={wood}>
        <boxGeometry args={[16.4, 0.58, 0.12]} />
      </mesh>
      {homeXs.map((x, i) => (
        <group key={`h${HOME_BENCH_NUMS[i]}-${home.id}`} position={[x, 0.75, zBench + 0.04]} rotation={[0, Math.PI, 0]}>
          <SeatedPlayer kit={home} number={HOME_BENCH_NUMS[i]!} holdStick={i % 2 === 0} />
        </group>
      ))}
      {awayXs.map((x, i) => (
        <group key={`a${AWAY_BENCH_NUMS[i]}-${away.id}`} position={[x, 0.75, zBench + 0.04]} rotation={[0, Math.PI, 0]}>
          <SeatedPlayer kit={away} number={AWAY_BENCH_NUMS[i]!} holdStick={i % 2 === 1} />
        </group>
      ))}
      <PenaltyBox
        x={-3.15}
        z={zBox}
        sitters={homeBox.map((number) => ({ kit: home, number }))}
      />
      <PenaltyBox
        x={3.15}
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
